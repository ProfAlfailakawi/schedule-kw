/**
 * ── «توقّع الرغبات»: ما طلبه الأساتذةُ في الفصول السابقة، قبل أن يصلوا بطلباتهم ────────
 *
 * لجنةُ الجدول تنشر البطاقات ثم تنتظر ما يعود. هذا الملفُّ يقرأ طلباتِ الفصول السابقة لكل أستاذ
 * فيستخرج من كل بندٍ طُلب فيه تغييرٌ (تعديل، حذف، إضافة — لا «أبقِه» أبداً) خانتين:
 *   «تركه» (away): يومُ موعدِه الأصلي وفترتُه، و«إليه» (to): يومُ ما طلبه وفترتُه.
 * وفترةُ اليوم بحدود وارد الأساتذة نفسها (requestsAsk.periodOfStart): صباحٌ قبل 12:00، ظهرٌ حتى 15:00، مساءٌ بعدها.
 *
 * **النمطُ المتكرّر**: الخانةُ نفسُها (نوعٌ + يوم + فترة) في فصلين مختلفين على الأقل (`WISH_MIN_TERMS`).
 * مرّتان في فصلٍ واحد لا تُعدّان نمطاً. وتُقال النسبةُ بصدق: «٣/٣» = ثلاثةُ فصولٍ من ثلاثةٍ رُصد فيها الأستاذ.
 *
 * **للمنسّق وحده**: دالّةٌ خالصة بلا واجهة ولا قاعدة بيانات؛ لا يصل منها شيءٌ إلى الأستاذ (tests/wish-patterns-audit.ts).
 */
import type { InstructorRequest, InstructorRequestItem } from "../types";
import { arabicMatchKey } from "./arabicText";
import { periodOfStart, type AskDay, type AskPeriod } from "./requestsAsk";
export type { AskDay, AskPeriod };
import { termChronology } from "./termSequence";

/** أقلُّ عددِ فصولٍ مختلفةٍ لتصير الخانةُ نمطاً متكرّراً. */
export const WISH_MIN_TERMS = 2;
/** آخرُ كم فصلٍ سابقٍ يُنظر فيه. */
export const WISH_LAST_TERMS = 4;
/** أكثرُ أنماطٍ تُعرض لأستاذٍ واحد، وأكثرُ مواعيدَ تُسرد تحتها. */
export const WISH_MAX_PATTERNS = 3;
export const WISH_MAX_LINES = 3;
/** حالاتُ الطلب التي تُقرأ: ما أرسله الأستاذ فعلاً. */
export const WISH_STATUSES: ReadonlyArray<InstructorRequest["status"]> = ["submitted", "in-review", "settled"];

export const WISH_DAYS: readonly AskDay[] = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"];
export const WISH_PERIODS: readonly AskPeriod[] = ["morning", "noon", "evening"];
const DAY_STEM: Record<AskDay, string> = { fsunday: "احد", fmonday: "اثنين", ftuesday: "ثلاث", fwednesday: "اربع", fthursday: "خميس" };

export type WishKind = "away" | "to";
export interface WishCell { day: AskDay; period: AskPeriod }

/** ما التُقط من بندٍ واحد: خاناتُ «تركه» و«إليه»، وأوقاتُه كما كُتبت لتُعرض شريحةً. */
export interface WishObservation {
  instructorId: number;
  termId: number;
  courseId: number;
  courseName: string;
  away: WishCell[];
  to: WishCell[];
  fromTime: string;
  toTime: string;
}

export interface WishPattern extends WishCell {
  kind: WishKind;
  /** كم فصلاً تكرّرت فيه الخانة. */
  terms: number;
  /** كم فصلاً رُصد فيه الأستاذ (له طلبٌ مُرسَل). */
  observed: number;
  courseIds: number[];
}

/** سطرُ مقرر: من أين إلى أين، كما طلبه في أحدث فصلٍ مسّ نمطاً معروضاً. */
export interface WishLine {
  courseId: number;
  courseName: string;
  from: WishCell | null;
  to: WishCell | null;
  fromTime: string;
  toTime: string;
}

export interface InstructorWishHints {
  instructorId: number;
  observed: number;
  patterns: WishPattern[];
  lines: WishLine[];
}

/** أيامُ «كان» من نصّه («الأحد · الثلاثاء»)، بمفتاح المطابقة العربي كما يفعل الوارد. */
function daysOfText(text: unknown): AskDay[] {
  const key = arabicMatchKey(String(text ?? ""));
  return WISH_DAYS.filter(day => key.includes(DAY_STEM[day]));
}

const cellsOf = (days: readonly AskDay[], start: unknown): WishCell[] => {
  const period = periodOfStart(start);
  return period ? days.map(day => ({ day, period })) : [];
};

const startOfTime = (time: unknown): string => String(time ?? "").split(/[–-]/)[0].trim();

/** بندٌ طُلب فيه تغيير؟ «أبقِه» لا يُقرأ هنا أبداً. */
export const isWishChange = (item: Pick<InstructorRequestItem, "action">): boolean =>
  item.action === "change" || item.action === "delete" || item.action === "add";

/** الخاناتُ المطلوبة من بنود الطلب: أيامُ كل فقرةٍ بفترة بدايتها. */
function toCells(item: InstructorRequestItem): { cells: WishCell[]; time: string } {
  const cells: WishCell[] = [];
  let time = "";
  for (const slot of item.slots || []) {
    const days = (slot.days?.length ? slot.days : [slot.day]).filter((day): day is AskDay => WISH_DAYS.includes(day as AskDay));
    cells.push(...cellsOf(days, slot.start));
    if (!time && slot.start) time = `${slot.start}${slot.end ? ` – ${slot.end}` : ""}`;
  }
  return { cells, time };
}

/** بندٌ ← ملاحظة (أو لا شيء حين لا يُقرأ منه يومٌ وفترة). */
export function observeItem(item: InstructorRequestItem, instructorId: number, termId: number): WishObservation | null {
  if (!isWishChange(item)) return null;
  const away = item.action === "add" ? [] : cellsOf(daysOfText(item.before?.days), startOfTime(item.before?.time));
  const target = item.action === "delete" ? { cells: [] as WishCell[], time: "" } : toCells(item);
  if (!away.length && !target.cells.length) return null;
  const courseId = Number(item.before?.courseId || item.after?.courseId || 0);
  return {
    instructorId, termId, courseId,
    courseName: String(item.before?.courseName || item.after?.courseName || ""),
    away, to: target.cells,
    fromTime: String(item.before?.time || "").replace(/\s+/g, " ").trim(),
    toTime: target.time,
  };
}

/** كلُّ ما يُقرأ من طلبٍ واحد؛ ما ليس مُرسَلاً يُترك. */
export function observeRequest(request: Pick<InstructorRequest, "status" | "AdInstructorId" | "AdTermId" | "items" | "linkMode">): WishObservation[] {
  if (!WISH_STATUSES.includes(request.status)) return [];
  if (request.linkMode === "view") return [];
  return (request.items || [])
    .map(item => observeItem(item, Number(request.AdInstructorId), Number(request.AdTermId)))
    .filter((row): row is WishObservation => Boolean(row));
}

/** آخرُ `count` فصولٍ أقدمَ من الجاري، الأحدثُ أولاً. الجاري نفسُه لا يدخل: ما طُلب فيه ليس «ماضياً». */
export function pastTermIds(terms: ReadonlyArray<{ AdTermId?: number; AdTermName?: string }>, currentTermId: number, count = WISH_LAST_TERMS): number[] {
  const current = terms.find(term => Number(term.AdTermId) === currentTermId);
  if (!current) return [];
  const limit = termChronology(current);
  return [...terms]
    .filter(term => Number(term.AdTermId) !== currentTermId && termChronology(term) < limit)
    .sort((a, b) => termChronology(b) - termChronology(a) || Number(b.AdTermId || 0) - Number(a.AdTermId || 0))
    .slice(0, count)
    .map(term => Number(term.AdTermId));
}

const dayRank = (day: AskDay) => WISH_DAYS.indexOf(day);
const periodRank = (period: AskPeriod) => WISH_PERIODS.indexOf(period);

export interface WishRequestLike extends Pick<InstructorRequest, "status" | "AdInstructorId" | "AdTermId" | "items" | "linkMode"> {}

export interface WishAggregate {
  byInstructor: Map<number, InstructorWishHints>;
  /** عدّادُ القسم: كم بنداً ترك كل خانة (للقراءة فقط، بلا أسماء). */
  heat: Record<AskDay, Record<AskPeriod, number>>;
  termsObserved: number;
}

const emptyHeat = (): WishAggregate["heat"] =>
  Object.fromEntries(WISH_DAYS.map(day => [day, { morning: 0, noon: 0, evening: 0 }])) as WishAggregate["heat"];

/**
 * طلباتُ الفصول السابقة ← أنماطُ كل أستاذ.
 * `terms` مرتّبةٌ الأحدثُ أولاً (pastTermIds)؛ وما كان في غيرها لا يُقرأ.
 */
export function aggregateWishPatterns(requests: readonly WishRequestLike[], terms: readonly number[], minTerms = WISH_MIN_TERMS): WishAggregate {
  const allowed = new Set(terms);
  const order = new Map(terms.map((id, index) => [id, index]));
  const observedTerms = new Map<number, Set<number>>();
  const seen: WishObservation[] = [];
  const heat = emptyHeat();
  for (const request of requests) {
    const termId = Number(request.AdTermId);
    if (!allowed.has(termId)) continue;
    if (!WISH_STATUSES.includes(request.status) || request.linkMode === "view") continue;
    const id = Number(request.AdInstructorId);
    if (!observedTerms.has(id)) observedTerms.set(id, new Set());
    observedTerms.get(id)!.add(termId);
    for (const row of observeRequest(request)) {
      seen.push(row);
      for (const cell of row.away) heat[cell.day][cell.period] += 1;
    }
  }
  const byInstructor = new Map<number, InstructorWishHints>();
  for (const [instructorId, termSet] of observedTerms) {
    const rows = seen.filter(row => row.instructorId === instructorId);
    const bucket = new Map<string, { kind: WishKind; cell: WishCell; terms: Set<number>; courses: Set<number> }>();
    for (const row of rows) {
      for (const kind of ["away", "to"] as const) {
        for (const cell of row[kind]) {
          const key = `${kind}|${cell.day}|${cell.period}`;
          const entry = bucket.get(key) || { kind, cell, terms: new Set<number>(), courses: new Set<number>() };
          entry.terms.add(row.termId);
          if (row.courseId) entry.courses.add(row.courseId);
          bucket.set(key, entry);
        }
      }
    }
    const patterns: WishPattern[] = [...bucket.values()]
      .filter(entry => entry.terms.size >= minTerms)
      .map(entry => ({ kind: entry.kind, ...entry.cell, terms: entry.terms.size, observed: termSet.size, courseIds: [...entry.courses].sort((a, b) => a - b) }))
      .sort((a, b) => b.terms - a.terms
        || (a.kind === b.kind ? 0 : a.kind === "away" ? -1 : 1)
        || dayRank(a.day) - dayRank(b.day) || periodRank(a.period) - periodRank(b.period))
      .slice(0, WISH_MAX_PATTERNS);
    if (!patterns.length) continue;
    /* سطرُ كل مقررٍ مسّ نمطاً معروضاً: من أحدث فصلٍ طلبه فيه. */
    const shown = new Set(patterns.map(pattern => `${pattern.kind}|${pattern.day}|${pattern.period}`));
    const touches = (row: WishObservation) => (["away", "to"] as const).some(kind => row[kind].some(cell => shown.has(`${kind}|${cell.day}|${cell.period}`)));
    const lines: WishLine[] = [];
    const taken = new Set<number>();
    const newest = rows.filter(touches).sort((a, b) => (order.get(a.termId) ?? 99) - (order.get(b.termId) ?? 99));
    for (const row of newest) {
      const key = row.courseId;
      if (!key || taken.has(key)) continue;
      taken.add(key);
      const from = [...row.away].sort((a, b) => dayRank(a.day) - dayRank(b.day))[0] || null;
      const to = [...row.to].sort((a, b) => dayRank(a.day) - dayRank(b.day))[0] || null;
      lines.push({ courseId: key, courseName: row.courseName, from, to, fromTime: row.fromTime, toTime: row.toTime });
      if (lines.length >= WISH_MAX_LINES) break;
    }
    byInstructor.set(instructorId, { instructorId, observed: termSet.size, patterns, lines });
  }
  return { byInstructor, heat, termsObserved: new Set([...observedTerms.values()].flatMap(set => [...set])).size };
}
