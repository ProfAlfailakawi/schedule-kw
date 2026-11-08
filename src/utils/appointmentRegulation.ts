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
import { DAY_KEYS, DAY_NAMES, daysFitLibrary, patternsForHours, type DayKey, type WeeklyPattern } from "./scheduleRegulations";
import { SCHEDULE_CLOCK_END } from "./scheduleTime";

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

/**
 * النمط المعتمد الذي تطابقه الأيام المختارة بالضبط (إن وُجد).
 *
 * ── السبب الجذري لشكوى «المكتبة تتصرف من تلقائها» (ملاحظة المالك 19) ─────────────
 * نمطُ الكتلة يصلح لأي يوم، فكان كلُّ يومٍ منفرد يُقرأ «كتلة معتمدة»: صفُّ الأحد 50د من
 * مقررٍ بثلاث ساعات يتحوّل 170د عند تغيير بدايته، ويومٌ بقي بعد إزالة أخيه يقفز طولُه، والضغطة
 * التالية تُسقطه. `minutes` هو طولُ الموعد القائم: يومٌ منفرد بطولٍ آخر ليس كتلة. بلا طول تبقى
 * القراءة القديمة (موعدٌ جديد لم يُعرف طوله بعد).
 */
export function regulationChoiceFor(course: RegulationCourse | null | undefined, days: readonly DayKey[], minutes?: number): RegulationChoice | null {
  if (!days.length) return null;
  const all = regulationChoicesForDay(course, days[0]);
  const found = all.find(choice => choice.days.length === days.length && choice.days.every(day => days.includes(day))) || null;
  if (found && found.days.length === 1 && Number(minutes) > 0 && found.minutes !== minutes) return null;
  return found;
}

/** هل اليومُ المنفرد قرارُ كتلة؟ طولُه يقول، وبلا طولٍ يقوله نوعُ المقرر: النظريُّ لا يُفترض كتلة. */
function pickedChoice(course: RegulationCourse | null | undefined, days: readonly DayKey[], minutes?: number): RegulationChoice | null {
  const choice = regulationChoiceFor(course, days, minutes);
  if (choice && choice.days.length === 1 && !(Number(minutes) > 0) && !prefersBlock(course)) return null;
  return choice;
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
 *  • إن كانت الأيام فارغة → يُطبَّق النمط الأنسب الذي يضم اليوم.
 *  • وإلا → يُضاف/يُزال اليوم وحده، ويُقال إن خرج عن اللائحة.
 */
export function pickDay(
  course: RegulationCourse | null | undefined,
  current: readonly DayKey[],
  day: DayKey,
  checked: boolean,
  minutes?: number,
): DayPickResult {
  const choices = regulationChoicesForDay(course, day);
  /* أيامٌ قائمة لا تُستبدل بضغطة (ملاحظة المراجعة): اليومُ يُضاف إليها، وما خرج عن النمط يُنبَّه إليه
     والشرائحُ تعرض النمط المعتمد لمن أراد التبديل. */
  if (checked && !current.length && choices.length) {
    const [applied, ...alternatives] = choices;
    return { days: applied.days, applied, alternatives };
  }
  const days = checked
    ? DAY_KEYS.filter(item => item === day || current.includes(item))
    : current.filter(item => item !== day);
  const applied = pickedChoice(course, days, minutes);
  const alternatives = days.length ? regulationChoicesForDay(course, days[0]).filter(choice => choice.id !== applied?.id) : [];
  return { days: [...days], applied, alternatives };
}

/**
 * ── طولُ اللقاء من مكتبة الأنماط وحدها (المالك 2026-11-08) ─────────────────────
 * مصدرٌ واحد لكل من يحسب نهايةً من بداية: المحرّر الكامل، والبطاقة السريعة، والخادم، والمقترح.
 * لا عادةَ هنا ولا تاريخ: ساعاتُ المقرّر + الأيام (+ طولُ الموعد الحالي ليومٍ منفرد إن كان طولاً معتمداً).
 *   • أيامٌ بعدد نمطٍ موحّد الطول وبأيامه نفسها ← دقائقُه (اثنين·أربعاء ← 80).
 *   • يومٌ واحد ← طولُه الحالي إن كان معتمداً لذلك اليوم (لقاءٌ من نمطٍ يُبنى صفّاً صفّاً، أو الكتلة)،
 *     وإلا الكتلة (اثنين · 170د). كان طولٌ قديمٌ غير معتمد (30د) يُبقى كما هو فتصير 08:00 ← 08:30.
 * null: لا ساعات، أو لا أنماطَ لها في المكتبة، أو أيامٌ ليست نمطاً موحّد الطول.
 */
export function singleDayLengths(course: RegulationCourse | null | undefined, day: DayKey): number[] {
  const out: number[] = [];
  for (const pattern of patternsForHours(regulationHours(course))) {
    if (pattern.days.length === 1) out.push(pattern.minutesPerDay[0]);
    else pattern.days.forEach((patternDay, index) => { if (patternDay === day) out.push(pattern.minutesPerDay[index]); });
  }
  return [...new Set(out)];
}

export function patternMinutes(course: RegulationCourse | null | undefined, days: readonly DayKey[], currentMinutes?: number): number | null {
  const patterns = patternsForHours(regulationHours(course));
  const ordered = DAY_KEYS.filter(day => days.includes(day));
  if (!patterns.length || !ordered.length) return null;
  if (ordered.length === 1) {
    const allowed = singleDayLengths(course, ordered[0]);
    const current = Number(currentMinutes);
    if (current > 0 && allowed.includes(current)) return current;
    const block = patterns.find(pattern => pattern.days.length === 1);
    return block ? block.minutesPerDay[0] : (allowed[0] ?? null);
  }
  const exact = patterns.find(pattern => uniform(pattern) && pattern.days.length === ordered.length && pattern.days.every(day => ordered.includes(day)));
  return exact ? exact.minutesPerDay[0] : null;
}

/** النهاية المحسوبة من البداية ودقائق النمط المعتمد للأيام المختارة؛ "" إن لم يُعرف نمط. */
export function regulationEnd(course: RegulationCourse | null | undefined, days: readonly DayKey[], start: string, minutes?: number): string {
  const from = toMinutes(start);
  if (!Number.isFinite(from)) return "";
  const length = patternMinutes(course, days, minutes);
  if (!length) return "";
  return clock(Math.min(SCHEDULE_CLOCK_END, from + length));
}

/**
 * ── الشكلُ لم يتغيّر (A6): الأيامُ والبدايةُ والنهايةُ كما حُفظت ─────────────────────
 * القاعدةُ الواحدة التي يتخطّى بها الخادمُ (unchangedShape) فحوصَ الشكل لموعدٍ قائم، ويقرؤها النموذج وكرتُ
 * الأستاذ والمقترح حرفاً: موعدٌ قديمٌ بطولٍ خارج المكتبة (75د) تُغيَّر قاعتُه أو أستاذُه وحدهما يُحفظ كما هو؛
 * ومن غيّر يومه أو وقته فبالنمط المعتمد.
 */
export function sameScheduleShape(saved: Partial<Record<DayKey | "fstarttime" | "fendtime", unknown>> | null | undefined, next: Partial<Record<DayKey | "fstarttime" | "fendtime", unknown>> | null | undefined): boolean {
  if (!saved || !next) return false;
  return saved.fstarttime === next.fstarttime && saved.fendtime === next.fendtime
    && DAY_KEYS.every(day => Boolean(saved[day]) === Boolean(next[day]));
}

/** الاسمُ الذي تقرؤه الشاشاتُ الأخرى (المقترح، كرت الأستاذ): النهاية من البداية بالنمط وحده. */
export const patternEnd = regulationEnd;

/** «اثنين · 170د» — النمطُ الذي تُحسب به النهاية، للسطر الذي يقول السبب. */
export function patternLabel(course: RegulationCourse | null | undefined, days: readonly DayKey[], minutes?: number): string {
  const ordered = DAY_KEYS.filter(day => days.includes(day));
  const length = patternMinutes(course, ordered, minutes);
  return length ? `${ordered.map(shortDay).join("·")} · ${length}د` : "";
}

/**
 * ── نهايةٌ تخالف النمط المعتمد تمنع الحفظ (المالك 2026-11-08) ───────────────────
 * سطرٌ واحد يقول السبب والنهاية الصحيحة، أو "" حين يوافق (أو لا يُحكم: لا ساعات، لا أنماط لها،
 * أو الأيامُ نفسُها ليست نمطاً — ذاك حكمُ الأيام في unapprovedPatternIssue لا حكمُ الطول).
 */
export function patternLengthIssue(course: RegulationCourse | null | undefined, days: readonly DayKey[], start: string, end: string): string {
  const hours = regulationHours(course);
  const ordered = DAY_KEYS.filter(day => days.includes(day));
  if (!hours || !patternsForHours(hours).length || !ordered.length) return "";
  const from = toMinutes(start), to = toMinutes(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return "";
  if (daysFitLibrary(hours, ordered, ordered.length > 1) === false) return "";
  if (regulationFit(course, ordered, start, end) !== "off") return "";
  const expected = regulationEnd(course, ordered, start);
  const label = patternLabel(course, ordered);
  return expected
    ? `مدة الموعد ${to - from}د لا توافق النمط المعتمد (${label}): النهاية ${expected}.`
    : `مدة الموعد ${to - from}د لا توافق النمط المعتمد لهذه الأيام.`;
}

/** نهايةٌ كتبها المستخدم ولا تساوي نهاية النمط: طولُه هو، ولا يعيده تغييرُ البداية. */
export function endIsDeliberate(course: RegulationCourse | null | undefined, days: readonly DayKey[], start: string, end: string): boolean {
  if (!regulationHours(course) || !end) return false;
  return regulationEnd(course, days, start) !== end;
}

export type RegulationFit = "fits" | "off" | "unknown";

/** هل يطابق الموعد (الأيام + المدة) نمطاً معتمداً لساعات المقرر؟ unknown بلا ساعات أو بلا وقت. */
export function regulationFit(
  course: RegulationCourse | null | undefined,
  days: readonly DayKey[],
  start: string,
  end: string,
): RegulationFit {
  /* ساعاتٌ لا نمطَ لها في المكتبة (تدريبٌ ميداني بتسع ساعات مثلاً) لا يُحكم عليها: كانت تُقرأ «خارج اللائحة». */
  if (!regulationHours(course) || !days.length || !patternsForHours(regulationHours(course)).length) return "unknown";
  const from = toMinutes(start), to = toMinutes(end);
  const length = to - from;
  const ordered = DAY_KEYS.filter(day => days.includes(day));
  /* صفٌّ هو لقاءٌ من نمطٍ معتمد: الخمس ساعات (170 + 110) صفّان بطولين، والنمطُ يُبنى أحياناً صفّاً لكل يوم.
     كانت هذه تُقرأ «خارج اللائحة»، والمكتبةُ نفسها تعتمدها. */
  const partOfPattern = Number.isFinite(length) && patternsForHours(regulationHours(course)).some(pattern => pattern.days.length > 1
    && (ordered.length === 1
      ? pattern.days.some((day, index) => day === ordered[0] && pattern.minutesPerDay[index] === length)
      : !uniform(pattern) && pattern.days.length === ordered.length && pattern.days.every(day => ordered.includes(day)) && pattern.minutesPerDay.includes(length)));
  const choice = regulationChoiceFor(course, days);
  if (!choice) return partOfPattern ? "fits" : "off";
  if (!Number.isFinite(from) || !Number.isFinite(to)) return "unknown";
  return length === choice.minutes || partOfPattern ? "fits" : "off";
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
  options: { fresh?: boolean; usual?: RegulationChoice | null; minutes?: number; keepDays?: boolean } = {},
): RegulationCompletion | null {
  if (!regulationHours(course)) return null;
  const from = toMinutes(start);
  if (!days.length) {
    const usual = options.usual;
    if (!usual || !Number.isFinite(from)) return null;
    return { days: [...usual.days], end: clock(Math.min(SCHEDULE_CLOCK_END, from + usual.minutes)), applied: usual };
  }
  const exact = options.fresh ? null : regulationChoiceFor(course, days, options.minutes);
  /* `keepDays`: الأيامُ اختارها صاحبُها أو كانت في الموعد المحفوظ — لا تُستبدل بأيامٍ لم يخترها. */
  if (!exact && !options.fresh && options.keepDays) return null;
  const applied = exact || regulationChoicesForDay(course, days[0])[0];
  if (!applied) return null;
  return {
    days: [...applied.days],
    end: Number.isFinite(from) ? clock(Math.min(SCHEDULE_CLOCK_END, from + applied.minutes)) : "",
    applied,
  };
}
