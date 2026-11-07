/**
 * «في الوقت نفسه»: مواعيدُ أخرى في اليوم نفسه وبالبداية والنهاية نفسيهما تماماً،
 * ومعها مقرراتُ مستوى الموعد في قسمه وفصله وكليته إن تداخل وقتُها جزئياً، وشعبُ المقرر نفسه
 * إن تداخلت أو قربت من الموعد.
 *
 * تلميحٌ هادئ لا حاجز: من يُدخل موعداً بسرعةٍ ينسى أن مقرراتٍ أخرى تشغل الساعة ذاتها،
 * فيُرى له عددُها وأسماؤها. ليس بديلاً عن تعارض القاعة والأستاذ (الخادم حَكَمُهما)،
 * ولا يعيد ذكر ما سمّاه فحصُ التعارض نفسُه (skipIds).
 *
 * المستوى المختلف: التطابقُ التام وحده، فتبقى الشارةُ هادئة. نفسُ المستوى: يكفي التداخل، لأن
 * الطلاب أنفسهم غالباً، ما دام قسمُ الموعد وفصلُه وكليتُه معروفة؛ والقربُ بين مقررين مختلفين لا يُقال
 * لأن الطالب يأخذهما معاً. شعبُ المقرر نفسه: يكفي التداخل أو فاصلٌ داخل نافذة القرب (nearSectionWindow)،
 * لأن من يفتح شعبتين متقاربتين قد ينسى؛ فالطالب يختار إحداهما والتقارب يضيّق خياره.
 * والتلاصقُ (تنتهي إحداهما حين تبدأ الأخرى) ليس تداخلاً: يسكت بين مقررين ويُعدّ قرباً بين شعبتين.
 * ملفٌّ خالص بلا React ولا شبكة؛ يُختبر في tests/same-slot-audit.ts.
 */

export type SlotDay = "fsunday" | "fmonday" | "ftuesday" | "fwednesday" | "fthursday";
export const SLOT_DAYS: ReadonlyArray<{ key: SlotDay; label: string }> = [
  { key: "fsunday", label: "الأحد" },
  { key: "fmonday", label: "الاثنين" },
  { key: "ftuesday", label: "الثلاثاء" },
  { key: "fwednesday", label: "الأربعاء" },
  { key: "fthursday", label: "الخميس" },
];

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
  /** المقررُ الذي يُنشأ له الموعد — لتقديم «نفس المستوى». */
  courseId?: number;
  sectionId?: number;
  termId?: number;
  /** الكلية: البنون والبنات لا يختلطان، فلا تداخلَ ولا قرب بين كليتين. */
  collegeId?: number;
  /** رقمُ الشعبة الجاري إدخالُها: صفوفُها الأخرى (محاضرة ومختبر) ليست شعبةً أخرى. */
  scode?: string;
  /** رمزُ المقرر كما يُعرض في الشاشة (المستوى من مئاته). */
  codeOf?: (courseId: number) => unknown;
}

/** exact الوقتُ نفسه؛ partial تداخلٌ جزئي؛ near فاصلٌ قصير بلا تداخل. غيرُ exact يُعرض بوقته هو. */
export type SameSlotKind = "exact" | "partial" | "near";

export interface SameSlotItem<R> {
  row: R;
  sameLevel: boolean;
  /** شعبةٌ أخرى من مقرر الموعد عُدّت بقربها أو تداخلها (لا تُوصف بـ«نفس المستوى»: طلابها غيرُ طلابه). */
  sameCourse: boolean;
  kind: SameSlotKind;
}
export interface SameSlotDay<R> { day: SlotDay; label: string; items: SameSlotItem<R>[] }
export interface SameSlotResult<R> {
  days: SameSlotDay<R>[];
  /** عددُ المواعيد المختلفة (الصفُّ ذو اليومين يُعدّ مرة). */
  count: number;
  /** ومنها: مقرراتٌ من مستواه بتداخل جزئي. */
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

/** مستوى المقرر من رمزه المعروض: مئاتُ آخر ثلاثة أرقام («0109105» ← ١٠٠). صفرٌ إن لم يُعرف. */
export function levelOfCode(code: unknown): number {
  const digits = String(code ?? "").replace(/\D/g, "");
  if (digits.length < 3) return 0;
  return Number(digits.slice(-3, -2)) * 100;
}

const numeric = (value: unknown): number => {
  const n = Number(String(value ?? "").replace(/\D/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function sameSlotOf<R extends SlotRow>(rows: readonly R[], query: SameSlotQuery): SameSlotResult<R> {
  const empty: SameSlotResult<R> = { days: [], count: 0, partialCount: 0, sectionCount: 0 };
  const from = slotMinutes(query.start), to = slotMinutes(query.end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || !query.days.length) return empty;
  const skip = new Set<string>([...(query.skipIds || [])].map(String));
  if (query.excludeId != null && query.excludeId !== "" && Number(query.excludeId) !== 0) skip.add(String(query.excludeId));
  const wanted = SLOT_DAYS.filter(day => query.days.includes(day.key));
  const level = query.courseId && query.codeOf ? levelOfCode(query.codeOf(query.courseId)) : 0;
  const levelCache = new Map<number, number>();
  const levelOf = (courseId: number) => {
    if (!query.codeOf) return 0;
    if (!levelCache.has(courseId)) levelCache.set(courseId, levelOfCode(query.codeOf(courseId)));
    return levelCache.get(courseId)!;
  };
  const sameLevelAs = (row: R) =>
    Boolean(level) && levelOf(Number(row.AdCourseId)) === level &&
    (!query.sectionId || !row.AdSectionId || Number(row.AdSectionId) === Number(query.sectionId));

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

  const found = rows.flatMap((row): SameSlotItem<R>[] => {
    if (skip.has(String(row.id))) return [];
    if (query.termId && row.AdTermId && Number(row.AdTermId) !== Number(query.termId)) return [];
    if (isExact(row)) return [{ row, sameLevel: sameLevelAs(row), sameCourse: false, kind: "exact" }];
    const gap = gapOf(row);
    if (!inScope(row) || !Number.isFinite(gap)) return [];
    if (query.courseId && Number(row.AdCourseId) === Number(query.courseId)) {
      if (String(row.SCode ?? "").trim() === ownCode) return [];
      const rowLength = slotMinutes(row.fendtime) - slotMinutes(row.fstarttime);
      if (gap > nearSectionWindow(to - from, rowLength)) return [];
      return [{ row, sameLevel: false, sameCourse: true, kind: gap < 0 ? "partial" : "near" }];
    }
    return gap < 0 && sameLevelAs(row) ? [{ row, sameLevel: true, sameCourse: false, kind: "partial" }] : [];
  });

  const close = (item: SameSlotItem<R>) => Number(!(item.sameLevel || item.sameCourse));
  /* السقفُ ستة: التطابقُ أولاً، ثم شعبُ المقرر (أندرُها وأسهلُها نسياناً)، ثم الأطولُ تداخلاً. */
  const fit = (item: SameSlotItem<R>) => (item.kind === "exact" ? 0 : item.sameCourse ? 1 : 2);
  const sharedMinutes = (row: R) => Math.min(to, slotMinutes(row.fendtime)) - Math.max(from, slotMinutes(row.fstarttime));
  const order = (a: SameSlotItem<R>, b: SameSlotItem<R>) =>
    close(a) - close(b) ||
    fit(a) - fit(b) ||
    sharedMinutes(b.row) - sharedMinutes(a.row) ||
    numeric(query.codeOf?.(Number(a.row.AdCourseId))) - numeric(query.codeOf?.(Number(b.row.AdCourseId))) ||
    numeric(a.row.SCode) - numeric(b.row.SCode) ||
    numeric(a.row.id) - numeric(b.row.id);

  const days: SameSlotDay<R>[] = [];
  const unique = new Set<string>(), partial = new Set<string>(), sections = new Set<string>();
  for (const day of wanted) {
    const items = found.filter(item => Boolean(item.row[day.key])).sort(order);
    if (!items.length) continue;
    items.forEach(item => (item.sameCourse ? sections : item.kind === "partial" ? partial : unique).add(String(item.row.id)));
    days.push({ day: day.key, label: day.label, items });
  }
  return { days, count: unique.size + partial.size + sections.size, partialCount: partial.size, sectionCount: sections.size };
}

/** أولُ `max` صفٍّ عبر الأيام بالترتيب نفسه، والباقي عدداً — لسطر «+٣». */
export function capSameSlot<R>(days: readonly SameSlotDay<R>[], max = 6): { days: SameSlotDay<R>[]; hidden: number } {
  let left = Math.max(0, max), hidden = 0;
  const out: SameSlotDay<R>[] = [];
  for (const day of days) {
    const shown = day.items.slice(0, left);
    left -= shown.length;
    hidden += day.items.length - shown.length;
    if (shown.length) out.push({ ...day, items: shown });
  }
  return { days: out, hidden };
}
