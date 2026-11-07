/**
 * «في الوقت نفسه»: مواعيدُ أخرى في اليوم نفسه وبالبداية والنهاية نفسيهما تماماً.
 *
 * تلميحٌ هادئ لا حاجز: من يُدخل موعداً بسرعةٍ ينسى أن مقرراتٍ أخرى تشغل الساعة ذاتها،
 * فيُرى له عددُها وأسماؤها. ليس بديلاً عن تعارض القاعة والأستاذ (الخادم حَكَمُهما)،
 * ولا يعيد ذكر ما سمّاه فحصُ التعارض نفسُه (skipIds).
 *
 * «التطابق التام» وحده: التداخلُ الجزئي والتلاصقُ (تنتهي إحداهما حين تبدأ الأخرى) ليسا
 * «في الوقت نفسه». ملفٌّ خالص بلا React ولا شبكة؛ يُختبر في tests/same-slot-audit.ts.
 */

export type SlotDay = "fsunday" | "fmonday" | "ftuesday" | "fwednesday" | "fthursday";
export const SLOT_DAYS: ReadonlyArray<{ key: SlotDay; label: string }> = [
  { key: "fsunday", label: "الأحد" },
  { key: "fmonday", label: "الاثنين" },
  { key: "ftuesday", label: "الثلاثاء" },
  { key: "fwednesday", label: "الأربعاء" },
  { key: "fthursday", label: "الخميس" },
];

export interface SlotRow {
  id?: number | string;
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
  /** رمزُ المقرر كما يُعرض في الشاشة (المستوى من مئاته). */
  codeOf?: (courseId: number) => unknown;
}

export interface SameSlotItem<R> { row: R; sameLevel: boolean }
export interface SameSlotDay<R> { day: SlotDay; label: string; items: SameSlotItem<R>[] }
export interface SameSlotResult<R> {
  days: SameSlotDay<R>[];
  /** عددُ المواعيد المختلفة (الصفُّ ذو اليومين يُعدّ مرة). */
  count: number;
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
  const empty: SameSlotResult<R> = { days: [], count: 0 };
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

  const exact = rows.filter(row =>
    !skip.has(String(row.id)) &&
    (!query.termId || !row.AdTermId || Number(row.AdTermId) === Number(query.termId)) &&
    slotMinutes(row.fstarttime) === from && slotMinutes(row.fendtime) === to);

  const order = (a: SameSlotItem<R>, b: SameSlotItem<R>) =>
    Number(b.sameLevel) - Number(a.sameLevel) ||
    numeric(query.codeOf?.(Number(a.row.AdCourseId))) - numeric(query.codeOf?.(Number(b.row.AdCourseId))) ||
    numeric(a.row.SCode) - numeric(b.row.SCode) ||
    numeric(a.row.id) - numeric(b.row.id);

  const days: SameSlotDay<R>[] = [];
  const unique = new Set<string>();
  for (const day of wanted) {
    const items = exact.filter(row => Boolean(row[day.key])).map(row => ({ row, sameLevel: sameLevelAs(row) })).sort(order);
    if (!items.length) continue;
    items.forEach(item => unique.add(String(item.row.id)));
    days.push({ day: day.key, label: day.label, items });
  }
  return { days, count: unique.size };
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
