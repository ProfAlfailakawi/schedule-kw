/**
 * ── من تصله بطاقةُ الأستاذ (👁️ و✏️)، وما حالُه بعد الإرسال ─────────────────────
 *
 * قرار المالك: 👁️ و✏️ («أساتذة محددون» و«الكل») لأساتذة القسم وحدهم.
 *   - المنتدبون لا يصلهم شيءٌ أبداً.
 *   - المتدرّبون ومدرّبو مرحلة التدريب لا يظهرون إلا في 🎓؛ ومن كان أستاذاً في القسم
 *     ومتدرّباً في هذا الفصل يظهر في 🎓 وحدها — فلا تصل أحداً بطاقتان.
 * الخادمُ يحكم بها في الإصدار (لا القائمةُ وحدها)، والقائمةُ تقرأ من الحكم نفسه.
 */
import type { InstructorRequest } from "../types";
import { linkMode } from "./linkMode";
import { latestRequestByInstructor } from "./requestReissue";

import { AR, countOf } from "./arabicCount";
export type ExclusionReason = "visiting" | "trainee";

export function cardExclusions(input: {
  instructors: ReadonlyArray<{ AdInstructorId: unknown; AdInstructorCategory?: unknown }>;
  /** منتدبو عائلة القسم (readVisitingStatus لكل موقع). */
  visitingIds: Iterable<number>;
  /** طلباتُ الفصل في عائلة القسم: من طلبُه 🎓 فهو في مرحلة التدريب. */
  requests?: ReadonlyArray<Pick<InstructorRequest, "AdInstructorId" | "linkMode" | "status">>;
  /** موجاتُ مرحلة التدريب (taPhases) — من اختير فيها ولو لم تُرسل موجتُه بعد. */
  taPhaseIds?: Iterable<number>;
}): Map<number, ExclusionReason> {
  const out = new Map<number, ExclusionReason>();
  for (const id of input.visitingIds) if (Number(id) > 0) out.set(Number(id), "visiting");
  const trainee = (id: number) => { if (id > 0 && !out.has(id)) out.set(id, "trainee"); };
  for (const person of input.instructors) if (person.AdInstructorCategory === "ta") trainee(Number(person.AdInstructorId));
  for (const row of input.requests || []) if (row.status !== "superseded" && linkMode(row) === "ta") trainee(Number(row.AdInstructorId));
  for (const id of input.taPhaseIds || []) trainee(Number(id));
  return out;
}

/* ── المتابعة بعد الإرسال: ✉️ لم يفتح · 👀 فتح · ✅ ردّ ───────────────────────── */
export type FollowUpState = "sent" | "opened" | "replied";

export function followUpState(row: Pick<InstructorRequest, "status" | "submittedAt" | "linkMode"> & { linkOpenedAt?: unknown }): FollowUpState {
  if (row.submittedAt || (row.status !== "sent" && row.status !== "superseded")) return "replied";
  return row.linkOpenedAt ? "opened" : "sent";
}

/**
 * «ذكّر من لم يرد»: أحدثُ طلبٍ لكل أستاذ، بطاقةُ ✏️ (👁️ لا تنتظر رداً، و🎓 لها لوحتُها)،
 * لم يُرسَل بعد، ونافذتُه مفتوحة. والمستبعَدون (منتدبٌ، متدرّب) لا يُذكَّرون من هنا.
 */
export function reminderTargets<T extends Pick<InstructorRequest, "AdInstructorId" | "status" | "submittedAt" | "linkMode" | "createdAt">>(
  rows: readonly T[], windowOpen: (row: T) => boolean, excluded: ReadonlyMap<number, unknown> = new Map(),
): T[] {
  return [...latestRequestByInstructor(rows.filter(row => row.status !== "superseded")).values()].filter(row => linkMode(row) === "edit" && !excluded.has(Number(row.AdInstructorId))
    && followUpState(row) !== "replied" && windowOpen(row));
}

/* ── مسارُ كل أستاذ: ما جرى له بالترتيب (ملاحظتا المالك 13 و14) ──────────────────
 * أُعيد الجدولُ بملاحظات، فأُرسل لبعضهم، فثبّت بعضُهم وغيّر بعضُهم، ثم غيّر بعضُهم ثانيةً… ولا شاشةَ تقول
 * لكل أستاذٍ ماذا حدث ومتى. هنا سطرٌ زمنيٌّ واحدٌ لكل أستاذ يجمع: كلَّ إرسالٍ وصله (سجلُّ الإرسال)، ورسالةَ
 * التسليم وفتحَ بطاقته (رابطُه الشخصي)، وكلَّ ما في طلباته عبر الجولات — فتحَ وأرسلَ وثبّتَ وردَّ وقرّر القسم.
 * دالّةٌ خالصة: المدخلاتُ مقروءةٌ سلفاً، فتُختبر وحدها. لا قاعةَ ولا رقمَ مدنيّ في أيّ سطر. */
export type TrackTone = "send" | "open" | "pin" | "change" | "reply" | "decide" | "stop";
export interface TrackEvent { at: string; tone: TrackTone; text: string }
export interface TeacherTrack { instructorId: number; name: string; events: TrackEvent[]; last: TrackEvent | null }

const MODE_WORD: Record<string, string> = { edit: "✏️ طلب تعديل", view: "👁️ للعرض", ta: "🎓 مرحلة التدريب" };
const REQUEST_EVENT: Record<string, [TrackTone, string]> = {
  "link-created": ["send", "فُتح له طلب التعديل"],
  "link-opened": ["open", "فتح صفحة طلب التعديل"],
  "submitted": ["change", "أرسل طلبه"],
  "unchanged-confirmed": ["pin", "ثبّت جدوله كما هو"],
  "schedule-edited": ["change", "عدّل القسم موعداً مرتبطاً بطلبه"],
  "schedule-replaced": ["stop", "استُبدل الجدول فأُغلقت الجولة"],
  "item-fixed": ["decide", "ثبّت القسم بنداً"],
  "item-reopened": ["decide", "أعاد القسم بنداً للمراجعة"],
  "item-rejected": ["decide", "رفض القسم بنداً"],
  "alternative-offered": ["decide", "عرض القسم بديلاً"],
  "alternative-chosen": ["reply", "اختار بديلاً عرضه القسم"],
  "settled": ["decide", "اكتملت مراجعة طلبه"],
  "schedule-approved": ["decide", "اعتُمد الجدول"],
  "department-replied": ["reply", "ردّ القسم"],
  "instructor-replied": ["reply", "ردّ الأستاذ"],
  "proposal-accepted": ["reply", "وافق على وقتٍ اقترحه القسم"],
  "study-proposal-sent": ["change", "أرسل مقترحاً دراسياً"],
  "study-proposal-approved": ["decide", "اعتمد القسم مقترحه الدراسي"],
  "study-proposal-changes": ["decide", "طلب القسم تعديل مقترحه الدراسي"],
  "study-proposal-revised": ["change", "عدّل مقترحه الدراسي"],
  "study-proposal-withdrawn": ["stop", "سحب مقترحه الدراسي"],
  "study-proposal-committed": ["decide", "نُفّذ مقترحه الدراسي في الجدول"],
};

export function buildTeacherTracks(input: {
  sends: ReadonlyArray<{ at?: string; mode?: string; closesAt?: string; instructorIds?: unknown[]; single?: boolean; picked?: boolean }>;
  requests: ReadonlyArray<{ AdInstructorId: number; timeline?: ReadonlyArray<{ kind: string; at: string; detail?: string }> }>;
  personal: ReadonlyArray<{ instructorId: number; sentAt?: string; seenAt?: string }>;
  names: ReadonlyMap<number, string>;
  /** يحوّل لحظةً إلى تاريخٍ مقروء (يُمرَّر من الخادم فيبقى هذا خالصاً من المنطقة الزمنية). */
  when?: (iso: string) => string;
}): TeacherTrack[] {
  const byId = new Map<number, TrackEvent[]>();
  const push = (id: number, event: TrackEvent) => {
    if (!id || !event.at) return;
    const list = byId.get(id) || [];
    list.push(event);
    byId.set(id, list);
  };
  const when = input.when || ((iso: string) => iso);
  for (const send of input.sends) {
    const how = send.single ? "استثناء فردي" : send.picked ? "إرسال خاص" : send.mode === "ta" ? "مرحلة التدريب" : "إرسال للجميع";
    for (const raw of send.instructorIds || []) push(Number(raw), {
      at: String(send.at || ""), tone: "send",
      text: `أُرسلت له البطاقة · ${MODE_WORD[String(send.mode || "edit")] || MODE_WORD.edit} · ${how}${send.closesAt && send.mode !== "view" ? ` · حتى ${when(String(send.closesAt))}` : ""}`,
    });
  }
  for (const link of input.personal) {
    if (link.sentAt) push(link.instructorId, { at: link.sentAt, tone: "send", text: "فُتحت له رسالة التسليم (واتساب)" });
    if (link.seenAt) push(link.instructorId, { at: link.seenAt, tone: "open", text: "فتح بطاقته" });
  }
  for (const request of input.requests) {
    const id = Number(request.AdInstructorId);
    for (const event of request.timeline || []) {
      const known = REQUEST_EVENT[String(event.kind)];
      if (!known) continue;
      /* «فُتح له طلب التعديل» يكرّر سطرَ الإرسال من السجلّ حين يقع معه؛ يبقى حين يكون استثناءً أو إعادةَ فتح. */
      if (event.kind === "link-created" && !event.detail && input.sends.some(send => (send.instructorIds || []).map(Number).includes(id)
        && Math.abs(Date.parse(String(send.at || "")) - Date.parse(String(event.at))) < 120000)) continue;
      const count = event.kind === "submitted" ? Number(event.detail) : NaN;
      const text = event.kind === "submitted" ? (count === 0 ? "أرسل جدوله دون تعديل" : Number.isFinite(count) && count > 0 ? `أرسل طلبه (${countOf(count, AR.edit)})` : known[1])
        : event.kind === "link-created" && event.detail ? `فُتح له طلب التعديل · ${event.detail}` : known[1];
      push(id, { at: String(event.at || ""), tone: known[0], text });
    }
  }
  return [...byId].map(([instructorId, events]) => {
    const sorted = events.filter(event => Number.isFinite(Date.parse(event.at)))
      .sort((a, b) => a.at.localeCompare(b.at))
      .filter((event, index, all) => index === 0 || !(all[index - 1].text === event.text && Math.abs(Date.parse(all[index - 1].at) - Date.parse(event.at)) < 60000));
    return { instructorId, name: input.names.get(instructorId) || "", events: sorted, last: sorted.at(-1) || null };
  }).filter(track => track.events.length)
    .sort((a, b) => String(b.last?.at || "").localeCompare(String(a.last?.at || "")) || a.name.localeCompare(b.name, "ar"));
}
