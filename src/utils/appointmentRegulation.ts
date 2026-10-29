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

/**
 * ── «طبّق النمط المعتمد»: أفضل نمط للأيام الحالية ────────────────────────────
 * الأيام نمطٌ معتمد بنفسها ← هو؛ وإلا الأنسب الذي يضم أول يوم مختار (كضغطه من جديد).
 */
export function bestRegulationChoice(course: RegulationCourse | null | undefined, days: readonly DayKey[]): RegulationChoice | null {
  if (!days.length || !regulationHours(course)) return null;
  return regulationChoiceFor(course, days) || regulationChoicesForDay(course, days[0])[0] || null;
}

/** أيامٌ جرت بها عادة القسم لهذا المقرر (مرصودة أو شعبٌ قائمة)، ومرّات تكرارها. */
export interface UsualDays { days: readonly DayKey[]; count?: number }

/**
 * ── النمط المعتاد حين تُعرف البداية ولا يومَ بعد (ملاحظة المالك R3) ─────────────
 * «إذا حطيت وقت والمقرر ٣ ساعات المفروض تلقائي»: المقرر والبداية وحدهما يكفيان.
 *  1) أكثرُ أيامٍ جرت بها عادة القسم لهذا المقرر — إن كانت نمطاً معتمداً لساعاته؛
 *  2) وإلا الأنسب لطبيعة المقرر: النظري الموزّع على الأيام (أحد·ثلاثاء·خميس لثلاث ساعات)،
 *     والعملي كتلةٌ واحدة.
 * null: لا ساعات للمقرر — لا نمط يُخترع.
 */
export function usualRegulationChoice(course: RegulationCourse | null | undefined, history: readonly UsualDays[] = []): RegulationChoice | null {
  const hours = regulationHours(course);
  if (!hours) return null;
  const tally = new Map<string, { choice: RegulationChoice; count: number }>();
  for (const item of history) {
    const choice = regulationChoiceFor(course, DAY_KEYS.filter(day => item.days.includes(day)));
    if (!choice) continue;
    const key = choice.days.join("+");
    const entry = tally.get(key) || { choice, count: 0 };
    entry.count += Math.max(1, Number(item.count) || 1);
    tally.set(key, entry);
  }
  const habit = [...tally.values()].sort((a, b) => b.count - a.count)[0];
  if (habit) return habit.choice;
  const patterns = patternsForHours(hours).filter(uniform);
  const block = prefersBlock(course);
  const pattern = patterns.find(item => (item.days.length === 1) === block) || patterns[0];
  return pattern ? choiceOf(pattern, pattern.days) : null;
}

export interface RegulationCompletion {
  days: DayKey[];
  /** "" حين لا بداية بعد. */
  end: string;
  applied: RegulationChoice;
}

/**
 * الإكمال الآلي في كل نموذج موعد (القاعدة المتفق عليها): اختيار يوم أو بداية — أو
 * اختيار المقرر بعدهما — يكمل أيام النمط ونهايته، فلا يتجاوز المجموع الساعات المعتمدة
 * إلا بتجاوزٍ متعمَّد من المستخدم (يُحمل خارج هذه الدالة).
 *  • `fresh`: الأيام لم يخترها المستخدم بنفسه (خانة مرسومة، مقرر اختير بعد الأيام) →
 *    تُكمل كما لو ضُغط أول يوم من جديد.
 *  • وإلا تبقى الأيام إن كانت نمطاً معتمداً، وتُحسب النهاية من دقائقه.
 *  • `usual`: لا أيام بعد والبداية معروفة → النمط المعتاد (usualRegulationChoice).
 * null: لا ساعات للمقرر، أو لا أيام ولا (بداية + نمط معتاد) — لا نمط يُخترع.
 */
export function completeRegulation(
  course: RegulationCourse | null | undefined,
  days: readonly DayKey[],
  start: string,
  options: { fresh?: boolean; usual?: RegulationChoice | null } = {},
): RegulationCompletion | null {
  if (!regulationHours(course)) return null;
  const from = toMinutes(start);
  if (!days.length) {
    const usual = options.usual;
    if (!usual || !Number.isFinite(from)) return null;
    return { days: [...usual.days], end: clock(Math.min(SCHEDULE_DAY_END, from + usual.minutes)), applied: usual };
  }
  const exact = options.fresh ? null : regulationChoiceFor(course, days);
  const applied = exact || regulationChoicesForDay(course, days[0])[0];
  if (!applied) return null;
  return {
    days: [...applied.days],
    end: Number.isFinite(from) ? clock(Math.min(SCHEDULE_DAY_END, from + applied.minutes)) : "",
    applied,
  };
}
