/**
 * ── «هذا الموعد يخالف اللائحة… هل تريد المتابعة استثناءً؟» (ملاحظتا المالك 10 و20) ──
 *
 * قرار 1913/2016 فيه قواعدُ لا تمنع الحفظ عند القسم لكنها لا تمرّ بصمت: من يحفظ موعداً جديداً أو معدَّلاً
 * يخالفها يرى قائمةً بكل قاعدةٍ ومادّتها، ولا يُحفظ إلا بضغط «المتابعة استثناءً». والمصدرُ هنا واحد:
 * يقرؤه الخادمُ عند الحفظ (createScheduleHandler و updateScheduleHandler والنقلُ الجماعي) ويقرؤه
 * المقترحُ الدراسي قبل أن يضيف عمليةً إلى المسودة. أما ما يمنع اليوم (ساعاتُ الشعبة الزائدة أو الناقصة) فيبقى مانعاً في
 * scheduleRules.ts؛ وأيامٌ ليست نمطاً معتمداً (`pattern-days`) أو نهايةٌ تخالف النمط (`lecture-length`) تُقال وتُحفظ بتأكيد.
 *
 *   • م.7/8 — سُلّم البدايات: الأحد والثلاثاء والخميس على رأس الساعة، والاثنين والأربعاء 8:00 ثم 9:30 ثم 11:00…
 *   • م.7/9 — وقتٌ ثابت لبداية الشعبة في أيامها كلها.
 *   • م.6/2 — لا أكثر من شعبتين متتاليتين للعضو في اليوم لمقررٍ تزيد محاضرته على ساعة.
 *   • م.6/3 — لا أكثر من ثلاث شعب متتالية للعضو في اليوم لمقررٍ محاضرته ساعة.
 *
 * «هيئة تدريسية» ليست شخصاً فلا تُعدّ سلاسلُها (placeholderInstructorIds). وكرتُ الأستاذ يمنع بنفسه.
 */
import { AR, countOf } from "./arabicCount";
import { DAY_KEYS, DAY_NAMES, consecutiveTeachingRuns, ladderStepForDays, lectureLengthProblem, startLadderNote, toMinutes, type DayKey } from "./scheduleRegulations";

/** رمزُ الرفض الذي يفتح ورقةَ التأكيد في الواجهة، وحقلُ الطلب الذي يقول «وافقتُ استثناءً». */
export const REGULATION_EXCEPTION_CODE = "regulation-exception";
export const REGULATION_EXCEPTION_FLAG = "regulationException";

export type RegulationExceptionRule = "lecture-length" | "pattern-days" | "start-ladder" | "fixed-start" | "consecutive-long" | "consecutive-one-hour";

export interface RegulationExceptionIssue {
  rule: RegulationExceptionRule;
  /** «م.6/2» */
  article: string;
  /** سطرٌ قصير يُقرأ في الورقة. */
  text: string;
  /** يومُ السلسلة المتتالية (م.6/2، م.6/3): السلسلةُ الواحدة تُقال مرةً لكل يوم مهما كثرت مواعيدها. */
  day?: DayKey;
}

export interface ExceptionRow {
  id?: unknown;
  AdCourseId?: unknown;
  AdCollegeId?: unknown;
  AdSectionId?: unknown;
  AdInstructorId?: unknown;
  SCode?: unknown;
  fstarttime?: unknown;
  fendtime?: unknown;
  fsunday?: unknown; fmonday?: unknown; ftuesday?: unknown; fwednesday?: unknown; fthursday?: unknown;
}

const daysOf = (row: ExceptionRow): DayKey[] => DAY_KEYS.filter(day => Boolean((row as any)[day]));
const sameId = (a: ExceptionRow, b: ExceptionRow) => {
  const x = String(a?.id ?? "").trim(), y = String(b?.id ?? "").trim();
  return Boolean(y) && y !== "0" && x === y;
};
const clockOf = (value: unknown) => String(value || "").slice(0, 5);
const validSpan = (row: ExceptionRow) => {
  const from = toMinutes(clockOf(row.fstarttime)), to = toMinutes(clockOf(row.fendtime));
  return Number.isFinite(from) && Number.isFinite(to) && to > from;
};

export interface RegulationExceptionInput {
  row: ExceptionRow;
  /** صفوفُ الفصل (أو الأسبوع الافتراضي)؛ الصفُّ نفسه يُستبعد بمعرّفه. */
  week: readonly ExceptionRow[];
  /** معرّفاتُ «هيئة تدريسية». */
  placeholders?: ReadonlySet<number>;
  /** يُفحص الشكلُ (السُّلّم ووقتُ الشعبة) — false لموعدٍ محفوظ لم تتغيّر أيامُه ولا وقتُه. */
  shapeChanged?: boolean;
  /** يُفحص التتالي — false حين لم يتغيّر الشكلُ ولا الأستاذ. */
  sequenceChanged?: boolean;
  /** ساعاتُ المقرر الأسبوعية: طولُ اللقاء يُقاس بها (م.7/8)؛ بلا ساعات لا يُحكم على الطول. */
  courseHours?: number;
  /** اسمُ المقرر للصفوف في سطر التتالي. */
  nameOf?: (row: ExceptionRow) => string;
}

/** مخالفاتُ اللائحة التي تحتاج تأكيداً صريحاً قبل الحفظ؛ [] حين يوافق الموعد. */
export function regulationExceptionIssues(input: RegulationExceptionInput): RegulationExceptionIssue[] {
  const { row, week } = input;
  const shapeChanged = input.shapeChanged !== false;
  const sequenceChanged = input.sequenceChanged !== false;
  const days = daysOf(row);
  if (!days.length || !validSpan(row)) return [];
  const start = clockOf(row.fstarttime);
  const issues: RegulationExceptionIssue[] = [];

  const hours = Math.round(Number(input.courseHours) || 0);
  const length = shapeChanged && hours > 0 ? lectureLengthProblem(row as any, hours, undefined) : null;
  if (length) issues.push({ rule: "lecture-length", article: "م.7/8", text: `${length}.` });

  if (shapeChanged && startLadderNote(days, start)) {
    issues.push({
      rule: "start-ladder",
      article: "م.7/8",
      text: ladderStepForDays(days) === 90
        ? `البداية ${start}، ومحاضرات الاثنين والأربعاء تبدأ 8:00 ثم 9:30 ثم 11:00 ثم 12:30…`
        : `البداية ${start}، ومحاضرات الأحد والثلاثاء والخميس تبدأ على رأس الساعة.`,
    });
  }

  const others = week.filter(other => !sameId(other, row));
  if (shapeChanged && Number(row.AdCourseId) && String(row.SCode ?? "").trim()) {
    const sibling = others.find(other => Number(other.AdCourseId) === Number(row.AdCourseId)
      && String(other.SCode ?? "").trim() === String(row.SCode ?? "").trim()
      && Number(other.AdCollegeId || 0) === Number(row.AdCollegeId || 0)
      && Number(other.AdSectionId || 0) === Number(row.AdSectionId || 0)
      && validSpan(other) && clockOf(other.fstarttime) !== start);
    if (sibling) issues.push({
      rule: "fixed-start",
      article: "م.7/9",
      text: `الشعبة ${String(row.SCode).trim()} تبدأ ${clockOf(sibling.fstarttime)} في ${daysOf(sibling).map(day => DAY_NAMES[DAY_KEYS.indexOf(day)]).join(" و")}، وهذا الموعد يبدأ ${start}.`,
    });
  }

  const instructorId = Number(row.AdInstructorId || 0);
  if (sequenceChanged && instructorId && !input.placeholders?.has(instructorId)) {
    const seen = new Set<RegulationExceptionRule>();
    for (const day of days) {
      const onDay = [...others.filter(other => Number(other.AdInstructorId) === instructorId && Boolean((other as any)[day]) && validSpan(other)), row];
      const runs = consecutiveTeachingRuns(onDay.map(item => ({ ...item, fstarttime: clockOf(item.fstarttime), fendtime: clockOf(item.fendtime), __self: item === row })) as any[]);
      const label = (list: any[]) => list.map(item => item.__self ? "هذا الموعد" : `${input.nameOf?.(item) || "شعبة"} ${clockOf(item.fstarttime)}`).join(" ← ");
      const dayName = DAY_NAMES[DAY_KEYS.indexOf(day)];
      const long = runs.long.find(run => run.some((item: any) => item.__self));
      if (long && !seen.has("consecutive-long")) {
        seen.add("consecutive-long");
        issues.push({ rule: "consecutive-long", article: "م.6/2", day, text: `${countOf(long.length, AR.lecture)} طويلة متتالية للعضو يوم ${dayName}، والحد شعبتان: ${label(long)}.` });
      }
      const short = runs.oneHour.find(run => run.some((item: any) => item.__self));
      if (short && !seen.has("consecutive-one-hour")) {
        seen.add("consecutive-one-hour");
        issues.push({ rule: "consecutive-one-hour", article: "م.6/3", day, text: `${countOf(short.length, AR.lecture)} من ساعة متتالية للعضو يوم ${dayName}، والحد ثلاث: ${label(short)}.` });
      }
    }
  }
  return issues;
}

/** سطرُ الرفض الذي يُقرأ بلا ورقة (رسالةُ الخطأ نفسها). */
export function regulationExceptionMessage(issues: readonly RegulationExceptionIssue[]): string {
  return `هذا الموعد يخالف اللائحة: ${issues.map(issue => `${issue.text} (${issue.article})`).join(" — ")} هل تريد المتابعة استثناءً؟`;
}

/** جملةُ سجلّ التدقيق لحفظٍ مضى استثناءً. */
export function regulationExceptionAudit(issues: readonly RegulationExceptionIssue[]): string {
  return `استثناء لائحي بتأكيد صريح (${[...new Set(issues.map(issue => issue.article))].join("، ")})`;
}

/** هل وافق الطالبُ على الاستثناء صراحةً؟ قيمةٌ منطقية صريحة فقط. */
export const regulationExceptionAccepted = (body: unknown) => (body as any)?.[REGULATION_EXCEPTION_FLAG] === true;
