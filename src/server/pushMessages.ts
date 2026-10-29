/**
 * ── نصُّ تنبيهات الجوال ──────────────────────────────────────────────────────
 *
 * سطران لا أكثر: عنوانٌ بأيقونة يُفهم من شاشة القفل، وسطرٌ يقول «أيّ مقرر ومتى».
 * دوالُّ نقيّة لا تقرأ شيئاً، فيُختبر نصُّها كما هو (tests/web-push-audit.ts).
 *
 * قاعدةُ المالك في كل ما يصل الأستاذ: **لا اسمَ قاعةٍ ولا رمزَها، أبداً.** فالحدثُ
 * يُبنى من حقولٍ بعينها — اسمُ المقرر، والأيام، ووقتُ البداية — ولا يُمرَّر البندُ
 * كلُّه إلى النصّ. ثم يُمسح من الاسم أيُّ رمزِ قاعةٍ يحمله البندُ نفسُه، احتياطاً
 * لاسمٍ كُتب يوماً وفيه رقمُ قاعته.
 */
import type { InstructorRequest, InstructorRequestItem, InstructorRequestSlot } from "../types";
import { AR, countOf, nounFor } from "../utils/arabicCount";
import type { PushMessage } from "./webPush";

const DAY_NAMES: Record<string, string> = {
  fsunday: "الأحد", fmonday: "الاثنين", ftuesday: "الثلاثاء", fwednesday: "الأربعاء", fthursday: "الخميس",
};
const DAY_ORDER = Object.keys(DAY_NAMES);

/** صفحةُ وارد طلبات الأساتذة في التطبيق (pathByView.instructorRequests). */
export const INBOX_PATH = "/FSchedule/InstructorRequests";

export function cardPath(token: string): string {
  return `/r/${encodeURIComponent(String(token || ""))}`;
}

/** «الأحد والثلاثاء». */
export function dayNames(days: string[]): string {
  const sorted = [...new Set(days.map(String))].filter(day => DAY_NAMES[day]).sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  return sorted.map(day => DAY_NAMES[day]).join(" و");
}

/** «9:30» → «09:30»؛ بأرقامٍ لاتينية كما في البرنامج كله. */
function clock(value: unknown): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || "").trim());
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "";
}

function when(days: string[], start: string): string {
  return [dayNames(days), clock(start)].filter(Boolean).join(" ");
}

/* ── حارسُ القاعات ────────────────────────────────────────────────────────── */

/** كلُّ ما في البند ممّا يدلّ على قاعة: رمزُها واسمُها ومرافقُها والبدائل المرشّحة. */
export function roomTokensOf(item: InstructorRequestItem | undefined): string[] {
  if (!item) return [];
  const raw: unknown[] = [
    item.before?.room, item.after?.room,
    item.reservedRoom?.label, item.reservedRoom?.companionLabel,
    ...(item.roomPick || []).map(pick => pick?.label),
    item.roomSwitch?.from, item.roomSwitch?.to?.room, item.roomSwitch?.to?.hall, item.roomSwitch?.to?.companionRoomLabel,
    ...(item.roomCandidates || []),
    ...(item.roomOptions || []).flatMap(option => [option?.room, option?.hall, option?.companionRoomLabel]),
  ];
  /* رقمٌ مجرّد («12» من «12/3») ليس علامةً على قاعة: يقع في الوقت «12:00» وفي اسم
     المقرر «رياضيات 12». فالحارسُ يمسك ما يدلّ وحده — الرمزَ كاملاً، وجزءاً فيه حرف. */
  const distinctive = (token: string) => token.length >= 2 && !/^[\d\s.:\-–]+$/.test(token);
  const tokens = new Set<string>();
  for (const value of raw) {
    const text = String(value ?? "").trim();
    if (!text) continue;
    if (distinctive(text)) tokens.add(text);
    for (const part of text.split(/[\/|·،,]+/)) if (distinctive(part.trim())) tokens.add(part.trim());
  }
  return [...tokens].sort((a, b) => b.length - a.length);
}

export function scrubRooms(text: string, tokens: string[]): string {
  let out = String(text || "");
  for (const token of tokens) out = out.split(token).join(" ");
  return out.replace(/\s{2,}/g, " ").replace(/^[\s·\-–—]+|[\s·\-–—]+$/g, "").trim();
}

/** هل في التنبيه أثرٌ لقاعة؟ — يُسأل قبل الإرسال وفي الاختبار. */
export function messageMentionsRoom(message: PushMessage, tokens: string[]): boolean {
  const text = `${message.title} ${message.body || ""}`;
  return tokens.some(token => text.includes(token));
}

/* ── أحداثُ الأستاذ ───────────────────────────────────────────────────────── */

export type TeacherEventKind = "fixed" | "rejected" | "alternatives" | "reply";

export interface TeacherEvent {
  kind: TeacherEventKind;
  /** اسمُ المقرر وحده، ممسوحاً منه كلُّ ما يدلّ على قاعة. */
  course: string;
  days: string[];
  start: string;
  /** حذفُ مقررٍ ثُبّت: لا أيامَ تُقال. */
  deleted?: boolean;
}

const courseOf = (item: InstructorRequestItem) => {
  const name = String((item.action === "add" ? item.after : item.before || item.after)?.courseName || item.after?.courseName || "").trim();
  const clean = scrubRooms(name, roomTokensOf(item));
  return clean.length > 40 ? `${clean.slice(0, 39)}…` : clean;
};

const slotDays = (slot?: InstructorRequestSlot) => (slot ? (slot.days?.length ? slot.days : [slot.day]).map(String) : []);

/**
 * حدثُ الأستاذ من بندٍ في طلبه. `kind` يُشتقّ من قرار البند إن لم يُعطَ: ثُبّت،
 * أو رُفض (ومع بدائل: «اختر بديلاً»). والردُّ يُعطى صراحةً.
 */
export function teacherEventFor(request: InstructorRequest, index: number, kind?: TeacherEventKind): TeacherEvent | null {
  const item = (request.items || [])[index];
  if (!item) return null;
  const course = courseOf(item);
  const decision = item.decision;
  const resolved: TeacherEventKind | null = kind
    || (decision?.state === "fixed" ? "fixed"
      : decision?.state === "rejected" ? ((decision.alternatives || []).length ? "alternatives" : "rejected")
      : null);
  if (!resolved) return null;
  if (resolved === "fixed") {
    if (item.action === "delete") return { kind: "fixed", course, days: [], start: "", deleted: true };
    const slots = item.slots || [];
    return { kind: "fixed", course, days: slots.map(slot => String(slot.day)), start: String(slots[0]?.start || "") };
  }
  if (resolved === "alternatives") {
    const first = (decision?.alternatives || [])[0];
    return { kind: "alternatives", course, days: slotDays(first), start: String(first?.start || "") };
  }
  if (resolved === "reply") {
    const last = [...(item.thread || [])].reverse().find(message => message.from === "department");
    const slot = (last?.slots || [])[0];
    return { kind: "reply", course, days: slotDays(slot), start: String(slot?.start || "") };
  }
  return { kind: "rejected", course, days: [], start: "" };
}

const ICON: Record<TeacherEventKind, string> = { fixed: "✅", rejected: "❌", alternatives: "🔁", reply: "💬" };

function singleTeacherMessage(event: TeacherEvent): { title: string; body: string } {
  const time = when(event.days, event.start);
  switch (event.kind) {
    case "fixed":
      return { title: "✅ ثُبّت طلبك", body: event.deleted ? [event.course, "حُذف من جدولك"].filter(Boolean).join(" · ") : [event.course, time].filter(Boolean).join(" · ") };
    case "alternatives":
      return { title: "🔁 اختر بديلاً لطلبك", body: [event.course, time].filter(Boolean).join(" · ") };
    case "reply":
      return { title: "💬 ردّ القسم على طلبك", body: [event.course, time ? `يقترح ${time}` : ""].filter(Boolean).join(" · ") };
    default:
      return { title: "❌ تعذّر طلبك", body: event.course };
  }
}

/**
 * تنبيهٌ واحدٌ لدفعةٍ من قرارات القسم على كرتٍ واحد: حدثٌ واحد يُقال بتفصيله،
 * وأحداثٌ من نوعٍ واحد تُعدّ («ثُبّت 3 مواعيد»)، والمختلطةُ أيقوناتٌ بأعدادها.
 */
export function teacherDigestMessage(events: TeacherEvent[], token: string, at = new Date().toISOString()): PushMessage {
  const list = events.filter(Boolean);
  const base = { url: cardPath(token), tag: "card-decisions", at };
  if (list.length <= 1) return { ...base, ...singleTeacherMessage(list[0] || { kind: "reply", course: "", days: [], start: "" }) };
  const kinds = [...new Set(list.map(event => event.kind))];
  const first = singleTeacherMessage(list[0]);
  const more = ` · +${list.length - 1}`;
  if (kinds.length === 1) {
    const n = list.length;
    const title = kinds[0] === "fixed" ? `✅ ثُبّت ${countOf(n, AR.appointment)}`
      : kinds[0] === "rejected" ? `❌ تعذّر ${countOf(n, AR.appointment)}`
      : kinds[0] === "alternatives" ? "🔁 اختر بدائل لطلباتك"
      : `💬 ${countOf(n, AR.reply)} من القسم`;
    return { ...base, title, body: `${first.body}${more}` };
  }
  const tally = (["fixed", "alternatives", "rejected", "reply"] as TeacherEventKind[])
    .map(kind => [kind, list.filter(event => event.kind === kind).length] as const)
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => `${ICON[kind]} ${n}`)
    .join(" · ");
  return { ...base, title: "📋 قرارات القسم على طلبك", body: tally };
}

/** 🎓 بابُ التدريب فُتح لمدرّب: إلى كرته الجديد، ومتى يُغلق. */
export function taWindowMessage(token: string, closesAt: string, at = new Date().toISOString()): PushMessage {
  const date = Date.parse(closesAt);
  const closes = Number.isFinite(date)
    ? new Date(date).toLocaleDateString("ar-KW-u-nu-latn", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kuwait" })
    : "";
  return { title: "🎓 فُتح باب التدريب لك", body: ["اختر شعبتك", closes ? `يُغلق ${closes}` : ""].filter(Boolean).join(" · "), url: cardPath(token), tag: "card-ta", at };
}

export function cardTestMessage(token: string, at = new Date().toISOString()): PushMessage {
  return { title: "🔔 التنبيهات تعمل", body: "هكذا يصلك قرار القسم على طلبك", url: cardPath(token), tag: "card-test", at };
}

/* ── أحداثُ القسم ─────────────────────────────────────────────────────────── */

/**
 * «📥 3 طلبات جديدة — جاهزة للتثبيت»: العددُ ما ينتظر في القسم لحظةَ الإرسال
 * (يُقرأ من الطلبات نفسها)، والسطرُ اسمُ القسم. الوسمُ يستبدل التنبيهَ السابق.
 */
export function adminRequestsMessage(count: number, place = "", at = new Date().toISOString()): PushMessage {
  const n = Math.max(1, Math.round(Number(count) || 0));
  const counted = n === 1 ? `${AR.request.one} ${AR.newAdj.one}` : `${countOf(n, AR.request)} ${nounFor(n, AR.newAdj)}`;
  return { title: `📥 ${counted} — ${nounFor(n, AR.readyAdj)} للتثبيت`, body: String(place || ""), url: INBOX_PATH, tag: "inbox-requests", at };
}

/** الحدثُ الثاني للقسم: الأستاذُ ردّ على مقترحه — وافق فصار جاهزاً، أو اقترح غيره. */
export function adminRepliesMessage(count: number, place = "", accepted = false, at = new Date().toISOString()): PushMessage {
  const n = Math.max(1, Math.round(Number(count) || 0));
  const title = n === 1
    ? (accepted ? "🤝 أستاذ وافق على مقترحك — جاهز للتثبيت" : "💬 أستاذ ردّ على مقترحك")
    : `💬 ${countOf(n, AR.reply)} على مقترحاتك`;
  return { title, body: String(place || ""), url: INBOX_PATH, tag: "inbox-replies", at };
}

export function adminTestMessage(at = new Date().toISOString()): PushMessage {
  return { title: "🔔 التنبيهات تعمل", body: "📥 هكذا يصلك كل طلبٍ جديد", url: INBOX_PATH, tag: "inbox-test", at };
}
