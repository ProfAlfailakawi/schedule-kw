/**
 * ── حارسُ الزملاء على الخادم: حجزٌ ليّن لدقيقتين (src/utils/scheduleHolds.ts للواجهة) ──
 *
 * منذ الكراسي صار في اللجنة الواحدة أكثرُ من يدٍ تعمل في اللحظة نفسها. من يبني موعداً
 * يُعلن ما يبنيه — الأيام والوقت والقاعة والأستاذ — فيراه زملاؤه وهم يبنون مواعيدهم.
 * والإعلانُ استشاريٌّ خالص: لا يُمنع به حفظٌ ولا يُقفل به شيء، والحكمُ عند الحفظ كما كان.
 *
 *   • حجزٌ واحد لكل جالس: الحسابُ، ومعه عضوُ الفريق إن كانت الجلسةُ لعضو (docs/SEATS.md).
 *   • يعيش دقيقتين (SCHEDULE_HOLD_TTL_MS) ويجدّده النموذجُ ما دام مفتوحاً، فإن أُغلق انتهى وحده.
 *   • يُحفظ في وثائق الميزات (scheduleHolds): تراه نسخُ الخادم كلُّها، وفي صندوق العرض يبقى في صندوقه.
 *   • لا يخرج إلى القارئ إلا اسمُ الشخص ومعرّفٌ عشوائيّ للحجز: لا رقمَ حساب ولا رقمَ مدنيّ.
 */
import { randomBytes } from "crypto";
import { Repository } from "../db/repository";
import { DAY_FLAGS } from "../utils/naturalQuery";
import { AR, countOf } from "../utils/arabicCount";

export const SCHEDULE_HOLD_TTL_MS = 120_000;
export const SCHEDULE_HOLD_TEXT_MAX = 40;
const COLLECTION = "scheduleHolds" as const;
/** أقصى ما يُحذف من الحجوز المنتهية في قراءةٍ واحدة: القراءةُ لا تتحوّل كنساً. */
const PURGE_BATCH = 25;

export type HoldDay = typeof DAY_FLAGS[number];
const DAY_ORDER = new Map<string, number>(DAY_FLAGS.map((day, index) => [day, index]));
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_ID = 2_147_483_647;

/** ما يعلنه من يبني موعداً — بعد التحقق. */
export interface ScheduleHoldInput {
  termId: number;
  collegeId: number;
  sectionId: number;
  days: HoldDay[];
  start: string;
  end: string;
  roomCode: string;
  roomHall: string;
  instructorId: number;
  courseId: number;
  sectionCode: string;
  /** الموعدُ المفتوح للتعديل، أو صفرٌ لموعدٍ جديد. */
  editId: number;
}

/** الوثيقةُ كما تُحفظ. `holder` لا يغادر الخادم. */
export interface StoredScheduleHold extends ScheduleHoldInput {
  id: string;
  holder: string;
  name: string;
  since: number;
  updatedAt: number;
  expiresAt: number;
}

/** ما يقرؤه الزميل. */
export interface ScheduleHoldView {
  id: string;
  name: string;
  collegeId: number;
  sectionId: number;
  days: HoldDay[];
  start: string;
  end: string;
  roomCode: string;
  roomHall: string;
  instructorId: number;
  courseId: number;
  sectionCode: string;
  editId: number;
  expiresAt: number;
}

export interface HoldHolder {
  /** معرّفُ الوثيقة: رقمُ الحساب، و«:عضو» لجلسة عضو الفريق. */
  key: string;
  name: string;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** رقمٌ صحيحٌ غير سالب: عددٌ أو نصُّ أرقام، ولا شيء غيرهما (لا NaN ولا لانهاية ولا كسور). */
function whole(value: unknown, required: boolean): Parsed<number> {
  if (value === undefined || value === null || value === "") return required ? { ok: false, error: "missing" } : { ok: true, value: 0 };
  const number = typeof value === "number" ? value : typeof value === "string" && /^\s*\d{1,10}\s*$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < 0 || number > MAX_ID) return { ok: false, error: "number" };
  if (required && number === 0) return { ok: false, error: "missing" };
  return { ok: true, value: number };
}

/** نصٌّ قصير: تُنزع منه المحارفُ الخفية وتُطوى مسافاتُه، ولا يتجاوز أربعين حرفاً. */
function shortText(value: unknown): Parsed<string> {
  if (value === undefined || value === null) return { ok: true, value: "" };
  if (typeof value === "number" && Number.isFinite(value)) value = String(value);
  if (typeof value !== "string") return { ok: false, error: "text" };
  const clean = value.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();
  if (clean.length > SCHEDULE_HOLD_TEXT_MAX) return { ok: false, error: "text" };
  return { ok: true, value: clean };
}

/**
 * يتحقق من جسم الطلب بصرامة: الأيامُ من الأحد إلى الخميس وحدها، والوقتُ «HH:MM» والنهايةُ
 * بعد البداية، والأرقامُ صحيحةٌ محدودة، والنصوصُ قصيرة. ما خالف شيئاً من ذلك يُردّ بسببه.
 */
export function parseScheduleHold(body: unknown): { ok: true; hold: ScheduleHoldInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "بيانات الحجز غير صالحة." };
  const source = body as Record<string, unknown>;
  const termId = whole(source.termId, true), collegeId = whole(source.collegeId, true), sectionId = whole(source.sectionId, true);
  if (!termId.ok || !collegeId.ok || !sectionId.ok) return { ok: false, error: "حدّد الفصل والكلية والقسم." };
  if (!Array.isArray(source.days) || !source.days.length || source.days.length > DAY_FLAGS.length) return { ok: false, error: "اختر يوماً واحداً على الأقل من الأحد إلى الخميس." };
  const days = new Set<HoldDay>();
  for (const day of source.days) {
    if (typeof day !== "string" || !DAY_ORDER.has(day)) return { ok: false, error: "اختر يوماً واحداً على الأقل من الأحد إلى الخميس." };
    days.add(day as HoldDay);
  }
  const start = typeof source.start === "string" ? source.start.trim() : "";
  const end = typeof source.end === "string" ? source.end.trim() : "";
  if (!CLOCK.test(start) || !CLOCK.test(end) || start >= end) return { ok: false, error: "الوقت بصيغة 08:00، والنهاية بعد البداية." };
  const numbers = { instructorId: whole(source.instructorId, false), courseId: whole(source.courseId, false), editId: whole(source.editId, false) };
  if (!numbers.instructorId.ok || !numbers.courseId.ok || !numbers.editId.ok) return { ok: false, error: "رقمٌ غير صالح في الحجز." };
  const texts = { roomCode: shortText(source.roomCode), roomHall: shortText(source.roomHall), sectionCode: shortText(source.sectionCode) };
  if (!texts.roomCode.ok || !texts.roomHall.ok || !texts.sectionCode.ok) return { ok: false, error: `نصٌّ غير صالح أو أطول من ${countOf(SCHEDULE_HOLD_TEXT_MAX, AR.character)}.` };
  return {
    ok: true,
    hold: {
      termId: termId.value, collegeId: collegeId.value, sectionId: sectionId.value,
      days: [...days].sort((a, b) => DAY_ORDER.get(a)! - DAY_ORDER.get(b)!),
      start, end,
      roomCode: texts.roomCode.value, roomHall: texts.roomHall.value,
      instructorId: numbers.instructorId.value, courseId: numbers.courseId.value,
      sectionCode: texts.sectionCode.value, editId: numbers.editId.value,
    },
  };
}

/**
 * اسمُ الشخص كما يراه زميله. جلسةُ الكرسي اسمُها «الكرسي · الجالس» (seatActorDisplayName)،
 * فيُؤخذ ما بعد « · » — الجالسُ نفسه لا كرسيُّه. وغيرُها اسمُ الحساب كما هو.
 */
export function holdPersonName(user: any): string {
  const full = String(user?.Name || user?.SystemUserLogin || "").replace(/\s+/g, " ").trim();
  if (user?.SeatActor) {
    const at = full.lastIndexOf(" · ");
    const person = (at >= 0 ? full.slice(at + 3) : String(user.SeatActor.name || "")).trim();
    if (person) return person.slice(0, 80);
  }
  return (full || "زميل").slice(0, 80);
}

/** صاحبُ الحجز: الحساب، والعضوُ إن كانت الجلسةُ لعضو فريق — فلكلِّ جالسٍ حجزُه. */
export function holdHolderOf(user: any): HoldHolder | null {
  const userId = Number(user?.SystemUserId || 0);
  if (!Number.isInteger(userId) || userId <= 0) return null;
  const memberId = String(user?.SeatActor?.memberId || "").trim().slice(0, 64);
  return { key: memberId ? `${userId}:${memberId}` : String(userId), name: holdPersonName(user) };
}

const newHoldId = () => `h_${randomBytes(9).toString("base64url")}`;

/** يكتب حجزَ الجالس (واحداً لا يتكرّر) ويمدّه دقيقتين من الآن. */
export async function putScheduleHold(holder: HoldHolder, input: ScheduleHoldInput, now = Date.now()): Promise<StoredScheduleHold> {
  const out = await Repository.updateFeatureDoc<StoredScheduleHold, StoredScheduleHold>(COLLECTION, holder.key, current => {
    const live = current && Number(current.expiresAt) > now ? current : null;
    const next: StoredScheduleHold = {
      ...input,
      id: String(current?.id || "") || newHoldId(),
      holder: holder.key,
      name: holder.name,
      since: live ? Number(live.since) || now : now,
      updatedAt: now,
      expiresAt: now + SCHEDULE_HOLD_TTL_MS,
    };
    return { next, result: next };
  });
  return out.ok ? out.next : (out.result as StoredScheduleHold);
}

/** يرفع حجزَ الجالس الآن، لا بعد دقيقتين. */
export async function releaseScheduleHold(holder: HoldHolder): Promise<void> {
  await Repository.deleteFeatureDoc(COLLECTION, holder.key);
}

/**
 * الحجوزُ الحيّة في فصل، ومعها كنسُ المنتهي منها (`purge`). الكنسُ لا يُنتظر في المسار:
 * القارئُ يأخذ جوابه، والحذفُ يمضي بعده — وكلُّ حذفٍ يسأل الوثيقةَ أوّلاً أما زالت منتهية،
 * فحجزٌ جُدّد في اللحظة نفسها لا يُحذف.
 */
export async function readScheduleHolds(termId: number, now = Date.now()): Promise<{ live: StoredScheduleHold[]; purge: Promise<number> }> {
  const all = await Repository.listFeatureDocs<StoredScheduleHold>(COLLECTION);
  const live: StoredScheduleHold[] = [];
  const expired: string[] = [];
  for (const row of all) {
    if (!row || typeof row !== "object" || !row.holder) continue;
    if (Number(row.expiresAt) > now) { if (Number(row.termId) === termId) live.push(row); }
    else expired.push(String(row.holder));
  }
  live.sort((a, b) => Number(a.since) - Number(b.since) || String(a.id).localeCompare(String(b.id)));
  const purge = expired.length
    ? Promise.all(expired.slice(0, PURGE_BATCH).map(key =>
        Repository.deleteFeatureDoc<StoredScheduleHold>(COLLECTION, key, current => Number(current?.expiresAt) <= now).catch(() => false),
      )).then(results => results.filter(Boolean).length)
    : Promise.resolve(0);
  return { live, purge };
}

/** الوثيقةُ كما يقرؤها الزميل: حقولٌ مسمّاة بأعيانها، فلا يتسرّب ما يُضاف إلى الوثيقة غداً. */
export function scheduleHoldView(row: StoredScheduleHold): ScheduleHoldView {
  return {
    id: String(row.id || ""),
    name: String(row.name || "زميل"),
    collegeId: Number(row.collegeId) || 0,
    sectionId: Number(row.sectionId) || 0,
    days: (Array.isArray(row.days) ? row.days : []).filter(day => DAY_ORDER.has(day)) as HoldDay[],
    start: String(row.start || ""),
    end: String(row.end || ""),
    roomCode: String(row.roomCode || ""),
    roomHall: String(row.roomHall || ""),
    instructorId: Number(row.instructorId) || 0,
    courseId: Number(row.courseId) || 0,
    sectionCode: String(row.sectionCode || ""),
    editId: Number(row.editId) || 0,
    expiresAt: Number(row.expiresAt) || 0,
  };
}
