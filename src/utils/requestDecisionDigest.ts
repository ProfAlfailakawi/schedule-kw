/**
 * ── «ما تقرّر» على طلب الأستاذ: قائمةٌ واحدة لكل من يقرؤها ─────────────────────
 *
 * صفحةُ الطلب (/r) وبطاقةُ الأستاذ (/s) ووارد القسم («أبلغ من صدر لهم قرار») تقرأ القراراتِ
 * من هنا وحدها: ما ثُبّت وبأيّ وقتٍ كُتب فعلاً، وما رُفض وبدائلُه، وما ألغاه القسم، وآخرُ ردٍّ منه.
 * لا قاعةَ ولا مبنى في شيءٍ مما يخرج (قرار المالك 2026-10-29)، ولا اسمَ أحدٍ غير صاحب الطلب.
 * القاعدةُ خالصةٌ بلا قاعدة بيانات، فتُختبر وحدها.
 */
import type { InstructorRequest, InstructorRequestItem } from "../types";

export type DecisionDigestKind = "fixed" | "rejected" | "cancelled" | "reply";

export interface DecisionDigestEntry {
  itemIndex: number;
  /** هويّةُ البند الثابتة: بها يُنزَّل موعدُه الواحد إلى التقويم. */
  itemId: string;
  at: string;
  kind: DecisionDigestKind;
  action: InstructorRequestItem["action"];
  course: string;
  /** للمثبَّت: ما كُتب فعلاً؛ وللمرفوض: ما كان مطلوباً. */
  days: string[];
  start: string;
  end: string;
  reasonCode?: string;
  note?: string;
  alternatives: Array<{ days: string[]; start: string; end: string }>;
  /** موعدٌ ثُبّت وله صفٌّ في الجدول: يُنزَّل حدثاً واحداً إلى التقويم. */
  calendarReady: boolean;
}

/** هويّةُ البند كما يحسبها الخادم (instructorRequestItemIdentity): نسخةٌ هنا كي لا تستورد الواجهةُ الخادم. */
export function digestItemId(item: Pick<InstructorRequestItem, "itemId" | "rowId" | "offeringRowIds">): string {
  return String(item.itemId || (item.rowId != null ? `row:${item.rowId}` : `add:${(item.offeringRowIds || []).join(",")}`));
}

const DAY_ORDER = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"];
const sortDays = (days: string[]) => [...new Set(days.map(String))].filter(day => DAY_ORDER.includes(day))
  .sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));

/** ما ثُبّت فعلاً: `fixedAs` إن سُجّل، وإلا أوقاتُ البند (وهي ما كُتب في كل تثبيتٍ قبل حفظه). */
export function fixedTimeOf(item: InstructorRequestItem): { days: string[]; start: string; end: string } {
  const fixed = item.decision?.fixedAs;
  if (fixed?.start) return { days: sortDays(fixed.days || []), start: fixed.start, end: fixed.end };
  const slots = item.slots || [];
  return { days: sortDays(slots.map(slot => String(slot.day))), start: String(slots[0]?.start || ""), end: String(slots[0]?.end || "") };
}

const courseOf = (item: InstructorRequestItem) => String(item.after?.courseName || item.before?.courseName || "");

/** كلُّ قرارٍ وكلُّ ردٍّ من القسم على البنود، الأحدثُ أولاً. البنودُ المخفية عن القارئ (hidden) لا تُعدّ. */
export function decisionDigest(request: Pick<InstructorRequest, "items">, limit = 30): DecisionDigestEntry[] {
  const out: DecisionDigestEntry[] = [];
  (request.items || []).forEach((item, itemIndex) => {
    if (!item || (item as any).hidden || item.action === "keep" && !item.decision) return;
    const base = { itemIndex, itemId: digestItemId(item), action: item.action, course: courseOf(item) };
    const decision = item.decision;
    if (decision?.state === "fixed" && decision.decidedAt) {
      const time = item.action === "delete" ? { days: [], start: "", end: "" } : fixedTimeOf(item);
      out.push({ ...base, at: decision.decidedAt, kind: "fixed", ...time, alternatives: [],
        calendarReady: item.action !== "delete" && Boolean(decision.scheduleId || item.rowId) && Boolean(time.start) });
    } else if (decision?.state === "rejected" && decision.decidedAt) {
      const slots = item.slots || [];
      out.push({ ...base, at: decision.decidedAt, kind: decision.cancelled ? "cancelled" : "rejected",
        days: sortDays(slots.map(slot => String(slot.day))), start: String(slots[0]?.start || ""), end: String(slots[0]?.end || ""),
        reasonCode: decision.reasonCode, ...(decision.note ? { note: decision.note } : {}),
        alternatives: (decision.alternatives || []).slice(0, 3).map(slot => ({ days: sortDays(slot.days?.length ? slot.days : [slot.day]), start: slot.start, end: slot.end })),
        calendarReady: false });
    }
    const reply = [...(item.thread || [])].reverse().find(message => message.from === "department");
    if (reply?.at && !(decision?.decidedAt && decision.decidedAt >= reply.at)) {
      out.push({ ...base, at: reply.at, kind: "reply", days: [], start: "", end: "", ...(reply.text ? { note: reply.text } : {}),
        alternatives: (reply.slots || []).slice(0, 3).map(slot => ({ days: sortDays(slot.days?.length ? slot.days : [slot.day]), start: slot.start, end: slot.end })),
        calendarReady: false });
    }
  });
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, Math.max(0, limit));
}

/** ما تقرّر بعد لحظةٍ ما (آخرُ زيارة). لحظةٌ فارغة = كلُّ ما تقرّر. */
export function decisionsSince(entries: readonly DecisionDigestEntry[], sinceIso: string | undefined | null): DecisionDigestEntry[] {
  const since = Date.parse(String(sinceIso || ""));
  if (!Number.isFinite(since)) return [...entries];
  return entries.filter(entry => Date.parse(entry.at) > since);
}

/**
 * قراراتُ القسم التي لم يُبلَّغ بها الأستاذ بعد («أبلغ من صدر لهم قرار»): ما قُرّر بعد آخر إبلاغ.
 * الردُّ في الحوار ليس قراراً ولا يُعدّ هنا — يصل الأستاذَ في صفحته وتنبيهه.
 */
export function unsentDecisions(request: Pick<InstructorRequest, "items" | "decisionNotifiedAt">): DecisionDigestEntry[] {
  return decisionsSince(decisionDigest(request, 200).filter(entry => entry.kind !== "reply"), request.decisionNotifiedAt);
}
