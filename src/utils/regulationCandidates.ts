/**
 * ── مولّدُ المرشّحات اللائحية الواحد (المالك 2026-11-13) ─────────────────────────
 *
 * كلُّ محرّكٍ يقترح موعداً (تخطيطُ الشعب، وآلةُ الزمن، وسلسلةُ الإصلاح، و«اقترح لي وقتاً وقاعة»،
 * وبدائلُ المقترح الدراسي، وخطط الطوارئ، والطيّار الآلي…) يأخذ أشكاله وبداياته من هنا، فلا يقترح
 * ما تفتح له ورقةُ «المتابعة استثناءً» عند الحفظ:
 *
 *   • الأيامُ والأطوالُ من مكتبة الأنماط وحدها (patternsForHours): الاثنين·الخميس أبداً، والأحد·الخميس
 *     ليس نمطاً، وكتلةُ اليوم الواحد على أيّ يوم.
 *   • البداياتُ من سُلّم اللائحة (م.7/8) عبر ladderStartsForDays: الأحد والثلاثاء والخميس على رأس الساعة،
 *     والاثنين والأربعاء 8:00 ثم 9:30 ثم 11:00…
 *   • الحَكَمُ الأخير regulationExceptionIssues نفسُه الذي يقرؤه الحفظ (regulationPlacementIssues).
 *
 * لا جدولَ سُلّمٍ هنا ولا مكتبةَ أخرى: كلُّه مقروءٌ من scheduleRegulations.
 */
import type { FSchedule } from "../types";
import { regulationExceptionIssues, type RegulationExceptionIssue } from "./regulationException";
import {
  DAY_KEYS, daysFitLibrary, ladderStartsForDays, lectureLengthProblem, patternsForHours, startLadderNote, toMinutes,
  type DayKey,
} from "./scheduleRegulations";

const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const ordered = (days: Iterable<DayKey>) => DAY_KEYS.filter(day => [...days].includes(day));
const sameSet = (a: readonly DayKey[], b: readonly DayKey[]) => a.length === b.length && a.every(day => b.includes(day));

export interface RegulationWindow { start?: number; end?: number }
export interface RegulationShape {
  /** أيامُ الصفّ الواحد (بداية ونهاية واحدتان لكل أيامه). */
  days: DayKey[];
  /** طولُ اللقاء بالدقائق الزمنية. */
  minutes: number;
  /** معرّفُ النمط في المكتبة، أو null لشكلٍ بُني بلا مكتبة (ساعاتٌ لا نمطَ لها). */
  patternId: string | null;
}

/**
 * ── البداياتُ على السُّلّم ────────────────────────────────────────────────────────
 * بداياتُ اللقاء على هذه الأيام بالدقائق، يتّسع بعد كلٍّ منها `minutes` قبل نهاية النافذة.
 * أيامٌ من الأسرتين معاً (لا تقع إلا لساعاتٍ لا نمطَ لها) تأخذ ما يقع على السُّلّمين كليهما (8:00، 11:00، 14:00…).
 */
export function regulationStarts(days: Iterable<DayKey>, minutes: number, window: RegulationWindow = {}): number[] {
  const set = ordered(days);
  if (!set.length) return [];
  const from = Math.max(8 * 60, window.start ?? 8 * 60);
  const to = window.end ?? 20 * 60;
  const ladder = (list: DayKey[]) => ladderStartsForDays(list, from, to).map(toMinutes);
  let starts = ladder(set);
  if (!starts.length) {
    const long = ladder(["fmonday"]);
    starts = ladder(["fsunday"]).filter(start => long.includes(start));
  }
  return starts.filter(start => start + Math.max(0, minutes) <= to);
}

/** البداياتُ على السُّلّم مرتّبةً بقربها من `near` (التعادلُ للأبكر). */
export function regulationStartsNear(days: Iterable<DayKey>, minutes: number, near: number, window: RegulationWindow = {}): number[] {
  return regulationStarts(days, minutes, window).sort((a, b) => Math.abs(a - near) - Math.abs(b - near) || a - b);
}

/** هل هذه البدايةُ على سُلّم هذه الأيام؟ (الحَكَمُ نفسُه: startLadderNote) */
export const onRegulationLadder = (days: Iterable<DayKey>, start: number | string) =>
  !startLadderNote([...days], typeof start === "number" ? clock(start) : String(start || "").slice(0, 5));

/**
 * ── الطولُ اللائحي لأيامٍ بعينها ─────────────────────────────────────────────────
 * طولُ النمط إن كانت الأيامُ نمطاً في المكتبة (أو كتلةَ يومٍ واحد)، وإلا أقربُ طولٍ إلى `wanted`
 * يقبله lectureLengthProblem (فتراتٌ من 50 أو 80 بفواصلها). null حين لا طولَ يُقبل.
 */
export function regulationLengthFor(days: readonly DayKey[], weeklyHours: number, wanted = 0): number | null {
  const set = ordered(days);
  if (!set.length) return null;
  const hours = Math.round(Number(weeklyHours) || 0);
  const uniform = patternsForHours(hours).filter(pattern => pattern.minutesPerDay.every(value => value === pattern.minutesPerDay[0]));
  const exact = uniform.find(pattern => pattern.days.length > 1 && sameSet(pattern.days, set));
  if (exact) return exact.minutesPerDay[0];
  /* يومٌ واحد: كتلُ المكتبة (لأيّ يوم) وأطوالُ هذا اليوم في أنماطها (صفٌّ من نمطٍ يُبنى صفّاً صفّاً). */
  const blocks = set.length === 1 ? patternsForHours(hours).flatMap(pattern => pattern.days.length === 1
    ? [pattern.minutesPerDay[0]]
    : pattern.days.flatMap((day, index) => (day === set[0] ? [pattern.minutesPerDay[index]] : []))) : [];
  if (blocks.includes(wanted)) return wanted;
  const periods = Math.max(1, hours || 5);
  const flags = Object.fromEntries(set.map(day => [day, true]));
  const lengths = new Set<number>(blocks);
  for (let k = 1; k <= periods; k++) for (const lecture of [50, 80]) lengths.add(k * lecture + (k - 1) * 10);
  const fits = [...lengths].filter(length => !lectureLengthProblem({ ...flags, fstarttime: "08:00", fendtime: clock(8 * 60 + length) }, hours || periods));
  if (!fits.length) return null;
  const target = wanted > 0 ? wanted : Math.min(...fits);
  return fits.sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b)[0];
}

/**
 * ── الأشكالُ المعتمدة لصفٍّ واحد ─────────────────────────────────────────────────
 * أشكالُ المكتبة لساعات المقرر (المتساويةُ الأطوال فقط: صفٌّ واحد ببداية ونهاية واحدتين)، تتقدّمها
 * `prefer` (أيامُ الشعب القائمة) إن كانت نمطاً، وكتلةُ اليوم الواحد على كل يوم. مقرّرٌ بلا نمطٍ في المكتبة
 * يبقى على `fallback` (أو كل يوم) بطولٍ لائحيّ قريبٍ من `fallbackMinutes`. `avoid`: يومٌ لا يُقترح.
 */
export function regulationShapes(weeklyHours: number, options: {
  prefer?: ReadonlyArray<readonly DayKey[]>;
  fallback?: ReadonlyArray<readonly DayKey[]>;
  fallbackMinutes?: number;
  avoid?: DayKey | null;
} = {}): RegulationShape[] {
  const hours = Math.round(Number(weeklyHours) || 0);
  const library = patternsForHours(hours).filter(pattern => pattern.minutesPerDay.every(value => value === pattern.minutesPerDay[0]));
  const out: RegulationShape[] = [];
  const add = (shape: RegulationShape) => {
    if (options.avoid && shape.days.includes(options.avoid)) return;
    if (!out.some(other => sameSet(other.days, shape.days) && other.minutes === shape.minutes)) out.push(shape);
  };
  if (library.length) {
    for (const set of options.prefer || []) {
      const days = ordered(set);
      const match = library.find(pattern => pattern.days.length > 1 && sameSet(pattern.days, days));
      if (match) add({ days, minutes: match.minutesPerDay[0], patternId: match.id });
      else if (days.length === 1) library.filter(pattern => pattern.days.length === 1)
        .forEach(pattern => add({ days, minutes: pattern.minutesPerDay[0], patternId: pattern.id }));
    }
    for (const pattern of library) {
      if (pattern.days.length === 1) DAY_KEYS.forEach(day => add({ days: [day], minutes: pattern.minutesPerDay[0], patternId: pattern.id }));
      else add({ days: ordered(pattern.days), minutes: pattern.minutesPerDay[0], patternId: pattern.id });
    }
    return out;
  }
  const sets = options.fallback?.length ? options.fallback : options.prefer?.length ? options.prefer : DAY_KEYS.map(day => [day]);
  for (const set of sets) {
    const days = ordered(set);
    const minutes = regulationLengthFor(days, hours, options.fallbackMinutes || 0);
    if (minutes) add({ days, minutes, patternId: null });
  }
  return out;
}

/** كلُّ مرشّحٍ لائحيّ: شكلٌ × بدايةٌ على السُّلّم (البداياتُ بقربها من `near` إن أُعطي). */
export function regulationCandidates(weeklyHours: number, options: Parameters<typeof regulationShapes>[1] & { window?: RegulationWindow; near?: number } = {}) {
  return regulationShapes(weeklyHours, options).flatMap(shape => (options.near === undefined
    ? regulationStarts(shape.days, shape.minutes, options.window)
    : regulationStartsNear(shape.days, shape.minutes, options.near, options.window))
    .map(start => ({ ...shape, start, end: start + shape.minutes })));
}

/**
 * ── أيامٌ بديلة لصفٍّ يُنقل عن يومٍ ──────────────────────────────────────────────
 * أشكالُ المكتبة التي لا تضمّ `avoid`، بعدد أيام الصفّ نفسه أولاً. بلا ساعاتٍ معروفة: يومٌ من الأسرة نفسها
 * يحلّ محلّ اليوم المتروك (الطولُ يبقى صالحاً)، ولا يُخلط اللقاءُ بين الأسرتين.
 */
export function regulationDaySwaps(weeklyHours: number, days: readonly DayKey[], avoid: DayKey | null, minutes: number): RegulationShape[] {
  const original = ordered(days);
  const hours = Math.round(Number(weeklyHours) || 0);
  if (!avoid || !original.includes(avoid)) {
    const length = regulationLengthFor(original, hours, minutes);
    return length ? [{ days: original, minutes: length, patternId: null }] : [];
  }
  if (patternsForHours(hours).length) {
    return regulationShapes(hours, { prefer: [original], avoid })
      .sort((a, b) => Math.abs(a.days.length - original.length) - Math.abs(b.days.length - original.length)
        || Math.abs(a.minutes - minutes) - Math.abs(b.minutes - minutes));
  }
  const long = (day: DayKey) => day === "fmonday" || day === "fwednesday";
  return DAY_KEYS.filter(day => !original.includes(day) && long(day) === long(avoid))
    .map(day => ordered(original.map(item => (item === avoid ? day : item))))
    .map(set => ({ days: set, minutes, patternId: null }));
}

/**
 * ── الحَكَمُ: ما يقوله الحفظُ في هذا الموضع ───────────────────────────────────────
 * مخالفاتُ الطول والسُّلّم من regulationExceptionIssues نفسِه، ومعها «ليست نمطاً معتمداً» حين تخرج
 * الأيامُ عن المكتبة. [] حين يمرّ الموضع بلا ورقة استثناء.
 */
export function regulationPlacementIssues(input: { days: readonly DayKey[]; start: number | string; end: number | string; hours?: number }): Array<Pick<RegulationExceptionIssue, "article" | "text"> & { rule: RegulationExceptionIssue["rule"] | "pattern" }> {
  const days = ordered(input.days);
  const asClock = (value: number | string) => (typeof value === "number" ? clock(value) : String(value || "").slice(0, 5));
  const row = { ...Object.fromEntries(DAY_KEYS.map(day => [day, days.includes(day)])), fstarttime: asClock(input.start), fendtime: asClock(input.end) } as Partial<FSchedule>;
  const hours = Math.round(Number(input.hours) || 0);
  const issues: Array<Pick<RegulationExceptionIssue, "article" | "text"> & { rule: RegulationExceptionIssue["rule"] | "pattern" }> =
    regulationExceptionIssues({ row: row as any, week: [], courseHours: hours, sequenceChanged: false })
      .filter(issue => issue.rule === "lecture-length" || issue.rule === "start-ladder");
  if (hours > 0 && days.length && daysFitLibrary(hours, days, days.length > 1) === false) {
    issues.push({ rule: "pattern", article: "م.7/8", text: "الأيام ليست نمطاً معتمداً لساعات المقرر." });
  }
  return issues;
}

export const isRegulationPlacement = (input: Parameters<typeof regulationPlacementIssues>[0]) => regulationPlacementIssues(input).length === 0;
