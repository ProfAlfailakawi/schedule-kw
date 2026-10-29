/**
 * ── الإكمال اللائحي لأي موعد يُدخَل (قرار 1913/2016) ────────────────────────
 *
 * مصدرٌ واحد: أنماط المكتبة في scheduleRegulations (patternsForHours) — هي نفسها
 * التي يقرأ بها فحصُ الاعتماد وحكمُ طلبات الأساتذة. لا جدول أنماط ثانٍ هنا.
 *
 * ما يفعله:
 *   • اختيار يومٍ يكمّل أيام النمط المعتمد لساعات المقرر (الأحد ← الأحد·الثلاثاء·الخميس).
 *   • اختيار البداية يحسب النهاية من دقائق النمط (3 ساعات كتلة: 08:00 → 10:50).
 *   • أكثر من نمط يحتوي اليوم → يُطبَّق الأنسب لطبيعة المقرر، والبقية شرائح.
 *   • التعديل اليدوي مسموح، وما خرج عن اللائحة يُعلَّم ⚠️ ولا يُمنع.
 */
import { DAY_KEYS, DAY_NAMES, patternsForHours, type DayKey, type WeeklyPattern } from "./scheduleRegulations";
import { SCHEDULE_DAY_END } from "./scheduleTime";

export type { DayKey } from "./scheduleRegulations";

export interface RegulationCourse {
  CourseHours?: unknown;
  CourseCredit?: unknown;
  CourseTeachingMode?: unknown;
}

export interface RegulationChoice {
  id: string;
  days: DayKey[];
  /** مدة اللقاء الواحد بالدقائق (أنماط المكتبة الموحّدة المدة فقط). */
  minutes: number;
  /** «أحد·ثلاثاء·خميس · 50د» — قصيرة لشريحة. */
  label: string;
  /** كتلة واحدة طويلة (مختبر/ورشة/تدريب). */
  block: boolean;
}

const toMinutes = (value: string) => {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
};
const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const shortDay = (day: DayKey) => DAY_NAMES[DAY_KEYS.indexOf(day)].replace(/^ال/, "");

/** ساعات المقرر كما تقرؤها اللائحة (الساعات، وإلا الوحدات). */
export function regulationHours(course: RegulationCourse | null | undefined): number {
  const hours = Number(course?.CourseHours || 0);
  const credit = Number(course?.CourseCredit || 0);
  return Math.round(hours > 0 ? hours : credit > 0 ? credit : 0);
}

/** مقرر عملي/تطبيقي/تدريب ميداني يُفضَّل له نمط الكتلة الواحدة. */
export function prefersBlock(course: RegulationCourse | null | undefined): boolean {
  const mode = String(course?.CourseTeachingMode || "");
  return mode === "practical" || mode === "applied" || mode === "field_training";
}

const uniform = (pattern: WeeklyPattern) => pattern.minutesPerDay.every(value => value === pattern.minutesPerDay[0]);

function choiceOf(pattern: WeeklyPattern, days: DayKey[]): RegulationChoice {
  const ordered = DAY_KEYS.filter(day => days.includes(day));
  return {
    id: `${pattern.id}:${ordered.join("+")}`,
    days: ordered,
    minutes: pattern.minutesPerDay[0],
    label: `${ordered.map(shortDay).join("·")} · ${pattern.minutesPerDay[0]}د`,
    block: ordered.length === 1 && pattern.minutesPerDay[0] > 110,
  };
}

/**
 * كل الأنماط المعتمدة التي تضم هذا اليوم، مرتبةً بطبيعة المقرر: النظري يبدأ
 * بالموزّع على الأيام، والعملي يبدأ بالكتلة. نمطُ اليوم الواحد يُنقل إلى اليوم المختار.
 */
export function regulationChoicesForDay(course: RegulationCourse | null | undefined, day: DayKey): RegulationChoice[] {
  const hours = regulationHours(course);
  if (!hours) return [];
  const choices: RegulationChoice[] = [];
  for (const pattern of patternsForHours(hours)) {
    if (!uniform(pattern)) continue;
    if (pattern.days.length === 1) choices.push(choiceOf(pattern, [day]));
    else if (pattern.days.includes(day)) choices.push(choiceOf(pattern, pattern.days));
  }
  const block = prefersBlock(course);
  const seen = new Set<string>();
  return choices
    .filter(choice => { const key = choice.days.join("+") + choice.minutes; if (seen.has(key)) return false; seen.add(key); return true; })
    .sort((a, b) => {
      const singleA = a.days.length === 1 ? 1 : 0, singleB = b.days.length === 1 ? 1 : 0;
      return block ? singleB - singleA : singleA - singleB;
    });
}

/** النمط المعتمد الذي تطابقه الأيام المختارة بالضبط (إن وُجد). */
export function regulationChoiceFor(course: RegulationCourse | null | undefined, days: readonly DayKey[]): RegulationChoice | null {
  if (!days.length) return null;
  const all = regulationChoicesForDay(course, days[0]);
  return all.find(choice => choice.days.length === days.length && choice.days.every(day => days.includes(day))) || null;
}

export interface DayPickResult {
  days: DayKey[];
  /** النمط المطبَّق (null = اختيار يدوي لا يطابق نمطاً). */
  applied: RegulationChoice | null;
  /** شرائح البدائل المعتمدة الأخرى لليوم المضغوط. */
  alternatives: RegulationChoice[];
}

/**
 * ضغطُ يوم في أي نموذج موعد.
 *  • إن كانت الأيام فارغة أو كانت نمطاً مطبَّقاً آلياً → يُطبَّق النمط الأنسب الذي يضم اليوم.
 *  • وإلا (اختيار يدوي جارٍ) → يُضاف/يُزال اليوم وحده، ويُقال إن خرج عن اللائحة.
 */
export function pickDay(
  course: RegulationCourse | null | undefined,
  current: readonly DayKey[],
  day: DayKey,
  checked: boolean,
): DayPickResult {
  const choices = regulationChoicesForDay(course, day);
  const currentChoice = regulationChoiceFor(course, current);
  const fresh = !current.length || (Boolean(currentChoice) && checked && !current.includes(day));
  if (checked && fresh && choices.length) {
    const [applied, ...alternatives] = choices;
    return { days: applied.days, applied, alternatives };
  }
  const days = checked
    ? DAY_KEYS.filter(item => item === day || current.includes(item))
    : current.filter(item => item !== day);
  const applied = regulationChoiceFor(course, days);
  const alternatives = days.length ? regulationChoicesForDay(course, days[0]).filter(choice => choice.id !== applied?.id) : [];
  return { days: [...days], applied, alternatives };
}

/** النهاية المحسوبة من البداية ودقائق النمط المعتمد للأيام المختارة؛ "" إن لم يُعرف نمط. */
export function regulationEnd(course: RegulationCourse | null | undefined, days: readonly DayKey[], start: string): string {
  const from = toMinutes(start);
  if (!Number.isFinite(from)) return "";
  const choice = regulationChoiceFor(course, days);
  if (!choice) return "";
  return clock(Math.min(SCHEDULE_DAY_END, from + choice.minutes));
}

export type RegulationFit = "fits" | "off" | "unknown";

/** هل يطابق الموعد (الأيام + المدة) نمطاً معتمداً لساعات المقرر؟ unknown بلا ساعات أو بلا وقت. */
export function regulationFit(
  course: RegulationCourse | null | undefined,
  days: readonly DayKey[],
  start: string,
  end: string,
): RegulationFit {
  if (!regulationHours(course) || !days.length) return "unknown";
  const from = toMinutes(start), to = toMinutes(end);
  const choice = regulationChoiceFor(course, days);
  if (!choice) return "off";
  if (!Number.isFinite(from) || !Number.isFinite(to)) return "unknown";
  return to - from === choice.minutes ? "fits" : "off";
}

/** الأيام المختارة في صفّ موعد. */
export const daysOfRow = (row: Partial<Record<DayKey, unknown>>): DayKey[] => DAY_KEYS.filter(day => Boolean(row[day]));
