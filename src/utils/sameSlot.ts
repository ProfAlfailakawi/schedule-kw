/**
 * «في الوقت نفسه»: مواعيدُ أخرى في اليوم نفسه وبالبداية والنهاية نفسيهما تماماً،
 * ومعها أقرانُ مقرر الموعد من صحيفته (يفتحان مقرراً تالياً، أو إجباريان من مستوى واحد) إن تداخل
 * وقتُها جزئياً، وشعبُ المقرر نفسه إن تداخلت أو قربت من الموعد.
 *
 * تلميحٌ هادئ لا حاجز: من يُدخل موعداً بسرعةٍ ينسى أن مقرراتٍ أخرى تشغل الساعة ذاتها،
 * فيُرى له عددُها وأسماؤها. ليس بديلاً عن تعارض القاعة والأستاذ (الخادم حَكَمُهما)،
 * ولا يعيد ذكر ما سمّاه فحصُ التعارض نفسُه (skipIds).
 *
 * غيرُ الأقران: التطابقُ التام وحده، فتبقى الشارةُ هادئة. الأقران: يكفي التداخل، لأن الطالب يريدهما معاً،
 * ما دام قسمُ الموعد وفصلُه وكليتُه معروفة؛ والقربُ بين مقررين مختلفين لا يُقال لأنه لا يمنع أخذهما.
 * والأقرانُ من الصحيفة وحدها (src/utils/planPeers.ts): لا تخمينَ من رقم المقرر، ونقصُ البيانات صمت.
 * شعبُ المقرر نفسه: يكفي التداخل أو فاصلٌ داخل نافذة القرب (nearSectionWindow)،
 * لأن من يفتح شعبتين متقاربتين قد ينسى؛ فالطالب يختار إحداهما والتقارب يضيّق خياره.
 * والتلاصقُ (تنتهي إحداهما حين تبدأ الأخرى) ليس تداخلاً: يسكت بين مقررين ويُعدّ قرباً بين شعبتين.
 * ملفٌّ خالص بلا React ولا شبكة؛ يُختبر في tests/same-slot-audit.ts.
 */

import type { UnlockLink } from "./planPeers";

export type SlotDay = "fsunday" | "fmonday" | "ftuesday" | "fwednesday" | "fthursday";
export const SLOT_DAYS: ReadonlyArray<{ key: SlotDay; label: string; short: string }> = [
  { key: "fsunday", label: "الأحد", short: "أحد" },
  { key: "fmonday", label: "الاثنين", short: "اثنين" },
  { key: "ftuesday", label: "الثلاثاء", short: "ثلاثاء" },
  { key: "fwednesday", label: "الأربعاء", short: "أربعاء" },
  { key: "fthursday", label: "الخميس", short: "خميس" },
];

/** صفوفُ الورقة قبل «+n»: قائمةٌ هادئة، والأهمُّ أولاً. */
export const SAME_SLOT_VISIBLE_ROWS = 4;

export const NEAR_SECTION_MIN_MINUTES = 60;
export const NEAR_SECTION_MAX_MINUTES = 120;

/**
 * أقصى فاصلٍ بالدقائق تُعدّ معه شعبةٌ أخرى من المقرر نفسه قريبة: نصفُ أطول الجلستين بين الحدّين.
 * ساعة أو ساعتان ← ٦٠، ثلاث ← ٩٠، أربع أو خمس ← ١٢٠.
 */
export function nearSectionWindow(minutesA: number, minutesB: number): number {
  return Math.min(NEAR_SECTION_MAX_MINUTES, Math.max(NEAR_SECTION_MIN_MINUTES, Math.max(minutesA, minutesB) / 2));
}

export interface SlotRow {
  id?: number | string;
  AdCollegeId?: number;
  AdCourseId?: number;
  AdSectionId?: number;
  AdTermId?: number;
  SCode?: string;
  fstarttime?: string;
  fendtime?: string;
  fsunday?: boolean; fmonday?: boolean; ftuesday?: boolean; fwednesday?: boolean; fthursday?: boolean;
}

export interface SameSlotQuery {
  days: readonly SlotDay[];
  start: string;
  end: string;
  /** الموعد الجاري تعديلُه: لا يُعدّ نفسَه. */
  excludeId?: number | string | null;
  /** صفوفٌ سمّاها فحصُ التعارض الصريح (قاعة/أستاذ/تكرار): لا تُكرَّر هنا. */
  skipIds?: Iterable<number | string>;
  /** المقررُ الذي يُنشأ له الموعد — لمعرفة أقرانه وشعبه. */
  courseId?: number;
  sectionId?: number;
  termId?: number;
  /** الكلية: البنون والبنات لا يختلطان، فلا تداخلَ ولا قرب بين كليتين. */
  collegeId?: number;
  /** رقمُ الشعبة الجاري إدخالُها: صفوفُها الأخرى (محاضرة ومختبر) ليست شعبةً أخرى. */
  scode?: string;
  /** رمزُ المقرر كما يُعرض في الشاشة: للترتيب وحده. */
  codeOf?: (courseId: number) => unknown;
  /** هل هما من مستوى واحد في صحيفةٍ واحدة (sameLevelLookup)؟ بدونها لا «نفس المستوى». */
  sameLevel?: (a: number, b: number) => boolean;
  /** ما يفتحانه معاً (unlockLookup). */
  unlockOf?: (a: number, b: number) => UnlockLink | undefined;
}

/** exact الوقتُ نفسه؛ partial تداخلٌ جزئي؛ near فاصلٌ قصير بلا تداخل. غيرُ exact يُعرض بوقته هو. */
export type SameSlotKind = "exact" | "partial" | "near";

export interface SameSlotItem<R> {
  row: R;
  /** أيامُ الموعد التي يشاركها هذا البند (الشعبةُ ذات الأيام الثلاثة بندٌ واحد). */
  days: SlotDay[];
  /** من مستواه في الصحيفة، وليس بينهما «تفتح» (تُغني عنها). */
  sameLevel: boolean;
  /** شعبةٌ أخرى من مقرر الموعد: طلابها غيرُ طلابه، فلا تُوصف بـ«نفس المستوى». */
  sameCourse: boolean;
  unlock?: UnlockLink;
  kind: SameSlotKind;
}
export interface SameSlotResult<R> {
  items: SameSlotItem<R>[];
  /** عددُ البنود كما يقرؤها الإنسان: الشعبةُ الواحدة مرة وإن تعددت أيامها وصفوفها. */
  count: number;
  /** ومنها: أقرانٌ بتداخل جزئي. */
  partialCount: number;
  /** ومنها: شعبٌ أخرى من المقرر نفسه متداخلة أو قريبة. */
  sectionCount: number;
}

/** دقائق «HH:MM»، أو NaN إن لم تصحّ. */
export const slotMinutes = (value: unknown): number => {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return NaN;
  const h = Number(match[1]), m = Number(match[2]);
  return m > 59 ? NaN : h * 60 + m;
};

const numeric = (value: unknown): number => {
  const n = Number(String(value ?? "").replace(/\D/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function sameSlotOf<R extends SlotRow>(rows: readonly R[], query: SameSlotQuery): SameSlotResult<R> {
  const empty: SameSlotResult<R> = { items: [], count: 0, partialCount: 0, sectionCount: 0 };
  const from = slotMinutes(query.start), to = slotMinutes(query.end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || !query.days.length) return empty;
  const skip = new Set<string>([...(query.skipIds || [])].map(String));
  if (query.excludeId != null && query.excludeId !== "" && Number(query.excludeId) !== 0) skip.add(String(query.excludeId));
  const wanted = SLOT_DAYS.filter(day => query.days.includes(day.key));
  const own = Number(query.courseId) || 0;
  const sameSection = (row: R) => !query.sectionId || !row.AdSectionId || Number(row.AdSectionId) === Number(query.sectionId);
  const unlockAs = (row: R) => (own && sameSection(row) ? query.unlockOf?.(own, Number(row.AdCourseId)) : undefined);
  const sameLevelAs = (row: R) => Boolean(own && sameSection(row) && query.sameLevel?.(own, Number(row.AdCourseId)));

  const isExact = (row: R) => slotMinutes(row.fstarttime) === from && slotMinutes(row.fendtime) === to;
  /* أشدُّ من «نفس المستوى» وحده: قسمٌ وفصلٌ وكليةٌ مسمّاة، فلا يُجزم على صفٍّ مجهول النطاق. */
  const inScope = (row: R) =>
    Boolean(query.sectionId && query.termId && query.collegeId) &&
    Number(row.AdSectionId) === Number(query.sectionId) &&
    Number(row.AdTermId) === Number(query.termId) &&
    Number(row.AdCollegeId) === Number(query.collegeId);
  /* الفاصل بالدقائق: سالبٌ للتداخل، صفرٌ للتلاصق، NaN لوقتٍ لا يُقرأ. */
  const gapOf = (row: R) => {
    const rowFrom = slotMinutes(row.fstarttime), rowTo = slotMinutes(row.fendtime);
    return rowTo > rowFrom ? Math.max(rowFrom - to, from - rowTo) : NaN;
  };
  const ownCode = String(query.scode ?? "").trim();

  const ownSection = (row: R) => own > 0 && Number(row.AdCourseId) === own;
  const describe = (row: R, kind: SameSlotKind) => {
    const unlock = unlockAs(row);
    return { unlock, sameLevel: !unlock && sameLevelAs(row), sameCourse: ownSection(row), kind };
  };
  const found = rows.flatMap(row => {
    if (skip.has(String(row.id))) return [];
    if (query.termId && row.AdTermId && Number(row.AdTermId) !== Number(query.termId)) return [];
    if (isExact(row)) return [{ row, ...describe(row, "exact") }];
    const gap = gapOf(row);
    if (!inScope(row) || !Number.isFinite(gap)) return [];
    if (ownSection(row)) {
      if (String(row.SCode ?? "").trim() === ownCode) return [];
      const rowLength = slotMinutes(row.fendtime) - slotMinutes(row.fstarttime);
      if (gap > nearSectionWindow(to - from, rowLength)) return [];
      return [{ row, ...describe(row, gap < 0 ? "partial" : "near") }];
    }
    const item = describe(row, "partial");
    return gap < 0 && (item.unlock || item.sameLevel) ? [{ row, ...item }] : [];
  });

  /* صفوفُ الشعبة الواحدة بوقتها الواحد بندٌ واحد، أيامُه مجموعُ أيامها. */
  const merged = new Map<string, SameSlotItem<R>>();
  for (const { row, ...facts } of found) {
    const days = wanted.filter(day => Boolean(row[day.key])).map(day => day.key);
    if (!days.length) continue;
    const key = `${Number(row.AdCourseId)}|${String(row.SCode ?? "").trim() || `#${row.id}`}|${slotMinutes(row.fstarttime)}|${slotMinutes(row.fendtime)}`;
    const held = merged.get(key);
    if (held) held.days = wanted.filter(day => held.days.includes(day.key) || days.includes(day.key)).map(day => day.key);
    else merged.set(key, { row, days, ...facts });
  }

  /* الأهمُّ أولاً، والسقفُ قصير: ما يفتح مقرراً، ثم شعبُ المقرر (أسهلُها نسياناً)، ثم المستوى، ثم الباقي؛
     وفي كلٍّ التطابقُ ثم الأطولُ تداخلاً. */
  const tier = (item: SameSlotItem<R>) => (item.unlock ? 0 : item.sameCourse ? 1 : item.sameLevel ? 2 : 3);
  const sharedMinutes = (row: R) => Math.min(to, slotMinutes(row.fendtime)) - Math.max(from, slotMinutes(row.fstarttime));
  const items = [...merged.values()].sort((a, b) =>
    tier(a) - tier(b) ||
    (a.unlock?.rank ?? 0) - (b.unlock?.rank ?? 0) ||
    Number(a.kind !== "exact") - Number(b.kind !== "exact") ||
    sharedMinutes(b.row) - sharedMinutes(a.row) ||
    numeric(query.codeOf?.(Number(a.row.AdCourseId))) - numeric(query.codeOf?.(Number(b.row.AdCourseId))) ||
    numeric(a.row.SCode) - numeric(b.row.SCode) ||
    numeric(a.row.id) - numeric(b.row.id));
  const inexact = items.filter(item => item.kind !== "exact");
  const sectionCount = inexact.filter(item => item.sameCourse).length;
  return { items, count: items.length, partialCount: inexact.length - sectionCount, sectionCount };
}

/** أولُ `max` بندٍ بالترتيب نفسه، والباقي عدداً — لسطر «+٣». */
export function capSameSlot<T>(items: readonly T[], max = SAME_SLOT_VISIBLE_ROWS): { items: T[]; hidden: number } {
  const shown = items.slice(0, Math.max(0, max));
  return { items: shown, hidden: items.length - shown.length };
}
