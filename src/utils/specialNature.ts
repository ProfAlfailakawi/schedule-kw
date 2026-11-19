/**
 * ── المقرر ذو الطبيعة الخاصة (نظري + عملي في شعبةٍ واحدة) ───────────────────────────
 *
 * مقرر «مقدمة في الأسنان» بأربع ساعات: الأحد ساعة والثلاثاء ساعة والخميس ساعتان — وأيُّ يومٍ هو العملي لا يقوله شكلُ الأسبوع.
 * فتُعلَّم الطبيعةُ الخاصة مرةً واحدة على المقرر (`CourseSpecialNature`)، ثم يختار من يُدخل الموعد أيامَه ومدّةَ كل يوم بحرية،
 * ويُلزَم بتحديد اللقاء العملي ومكانه (`practical` على صفّ ذلك اللقاء).
 *
 * ما يتغيّر لهذا المقرر وحده (وكلُّ مقرر آخر كما هو):
 *   • لا يُحكم على أيام الشعبة بأنماط المكتبة (م.7/8): الشكلُ حرّ بين المدد المعتمدة.
 *   • مدّةُ كل لقاءٍ من مدد اللائحة المسجلة في مكتبة الأنماط نفسها (لا قائمةٌ جديدة)، لليوم الذي يقع فيه.
 *   • مجموعُ ساعات الشعبة هو الحكمُ كما كان (sectionWeeklyHours): لا ينقص عن ساعات المقرر ولا يزيد عليها.
 *   • لا تكتمل الشعبة بلا لقاءٍ عملي واحدٍ على الأقل.
 *   • وقتُ البداية الثابت (م.7/9) يُقارَن داخل الدور الواحد: نظري مع نظري، وعملي مع عملي.
 *
 * ملفٌّ نقيّ بلا قاعدة بيانات ولا واجهة: يقرؤه الخادمُ والواجهةُ والاختبار بالتعريف نفسه.
 */
import { AR, countOf } from "./arabicCount";
import { DAY_KEYS, DAY_NAMES, effectiveCourseHours, patternLibraryByHours, sectionWeeklyHours, type DayKey } from "./scheduleRegulations";

type CourseLike = { CourseSpecialNature?: unknown; CourseHours?: unknown; CourseCredit?: unknown } | null | undefined;
type RowLike = Partial<Record<DayKey, unknown>> & { fstarttime?: unknown; fendtime?: unknown; practical?: unknown; id?: unknown };

/** أقلُّ ساعاتٍ لمقررٍ بطبيعةٍ خاصة: نظريٌّ وعمليٌّ على الأقل. */
export const SPECIAL_MIN_HOURS = 2;

export const isSpecialNature = (course: CourseLike): boolean => Boolean(course) && (course as any).CourseSpecialNature === true;

/** ساعاتُ المقرر لأحكام الأنماط والسُّلّم: المقررُ الخاص شكلُه حرٌّ بين مدد اللائحة، فلا ساعاتَ نمطٍ له (0 = «لا يُحكم بنمط»).
 *  مجموعُ ساعات الشعبة لا يمرّ من هنا: يبقى بـ effectiveCourseHours في حكم الحفظ. */
export const patternHoursOf = (course: CourseLike): number => isSpecialNature(course) ? 0 : effectiveCourseHours(course as any);

export const isPracticalRow = (row: object | null | undefined): boolean => Boolean(row) && (row as any).practical === true;

const toMinutes = (value: unknown): number => {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
};
const daysOf = (row: RowLike): DayKey[] => DAY_KEYS.filter(day => Boolean(row[day]));
const dayName = (day: DayKey) => DAY_NAMES[DAY_KEYS.indexOf(day)];

/**
 * مددُ اللقاء المعتمدة ليومٍ بعينه، من مكتبة الأنماط وحدها: كلُّ طولٍ يحمله نمطٌ يقع فيه هذا اليوم،
 * وطولُ نمط اليوم الواحد (كتلة) يصلح لأيّ يوم. لا قائمةَ ثابتة هنا: ما تعتمده المكتبة يعتمده هذا الحكم.
 */
export function allowedMeetingLengths(day: DayKey): number[] {
  const out = new Set<number>();
  for (const group of patternLibraryByHours()) {
    for (const pattern of group.patterns) {
      if (pattern.days.length === 1) { out.add(pattern.minutesPerDay[0]); continue; }
      pattern.days.forEach((patternDay, index) => { if (patternDay === day) out.add(pattern.minutesPerDay[index]); });
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** المدد المعتمدة لكل الأيام المختارة معاً (يشترك الصفُّ ذو الأيام المتعددة في طولٍ واحد). */
export function allowedLengthsForDays(days: readonly DayKey[]): number[] {
  if (!days.length) return [];
  return allowedMeetingLengths(days[0]).filter(length => days.every(day => allowedMeetingLengths(day).includes(length)));
}

/** «مدة اللقاء 75د لا توافق اللائحة (الخميس): المعتمد 50، 80، 110…» أو "" إن وافقت. */
export function meetingLengthIssue(days: readonly DayKey[], start: unknown, end: unknown): string {
  const span = toMinutes(end) - toMinutes(start);
  if (!days.length || !Number.isFinite(span) || span <= 0) return "";
  const allowed = allowedLengthsForDays(days);
  if (allowed.includes(span)) return "";
  const named = days.map(dayName).join(" · ");
  return `مدة اللقاء ${countOf(span, AR.minute)} لا توافق اللائحة (${named}): المدد المعتمدة بالدقائق: ${allowed.join("، ")}.`;
}

export const PRACTICAL_REQUIRED_TEXT = "حدّد اللقاء العملي لهذه الشعبة قبل الحفظ.";

/**
 * هل الشعبةُ المكتملة بلا لقاءٍ عملي؟ `row` هو الصفُّ قيد الحفظ و`siblings` بقيةُ صفوف الشعبة نفسها.
 * ما دامت ساعاتُ الشعبة ناقصة فالسطرُ الذي يقوله الحكمُ هو النقص لا هذا. "" إن وُجد لقاءٌ عملي أو لم تكتمل بعد.
 */
export function practicalRequiredIssue(row: RowLike, siblings: readonly RowLike[], course: CourseLike): string {
  if (!isSpecialNature(course)) return "";
  const hours = effectiveCourseHours(course as any);
  if (!(hours > 0)) return "";
  const reading = sectionWeeklyHours(row, siblings, hours);
  if (reading.under) return "";
  return [row, ...siblings].some(isPracticalRow) ? "" : PRACTICAL_REQUIRED_TEXT;
}

/** دورُ لقاءٍ في مقررٍ خاص للعرض: «عملي»، وغيرُه «نظري»؛ وما ليس خاصاً لا دورَ له ("" فلا يُكتب شيء). */
export function meetingRole(row: object | null | undefined, course: CourseLike): "" | "practical" | "theory" {
  if (!isSpecialNature(course)) return "";
  return isPracticalRow(row) ? "practical" : "theory";
}

export const MEETING_ROLE_LABEL: Record<"practical" | "theory", string> = { practical: "عملي", theory: "نظري" };

/** هل لقاءان من الدور نفسه؟ (م.7/9: وقتُ البداية الثابت يُقارَن داخل الدور). */
export const sameRole = (a: object, b: object): boolean => isPracticalRow(a) === isPracticalRow(b);

/** ملخّصُ شكل الشعبة لسطرٍ واحد: «نظري: الأحد · الثلاثاء 08:00 · عملي: الخميس 10:00». */
export function specialShapeSummary(rows: readonly RowLike[]): string {
  const part = (row: RowLike) => `${isPracticalRow(row) ? "عملي" : "نظري"}: ${daysOf(row).map(dayName).join(" · ")} ${String(row.fstarttime || "").slice(0, 5)}`;
  return rows.map(part).join(" — ");
}
