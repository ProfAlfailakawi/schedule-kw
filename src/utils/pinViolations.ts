/**
 * ── ما يمنع «ثبّت» عند الأستاذ (قرار المالك النهائي 2026-11-13) — مصدرٌ واحد: pinRowIssues ──
 *
 * نمطُ الشعبة في المكتبة ومدّةُ اللقاء (م.7/8)، وساعاتُ المقرّر، والتتالي (م.6/2، م.6/3)، وسُلّمُ البدايات (م.7/8)،
 * ووقتُ الشعبة الثابت (م.7/9).
 *   • «ثبّت الجدول» عند الأستاذ يُمنع بها ولو كان الخطأ من القسم (pinReview): يعدّل الموعدَ، أو يرسل ملاحظةً للقسم
 *     والمخالفاتُ تبقى ظاهرةً له وتصل القسمَ موسومةً «جدول فيه مخالفات لائحية».
 *   • وعند إرسال البطاقات يُقال للقسم مرةً: «N أساتذة في جداولهم مخالفات للائحة» — تنبيهٌ لا يمنع الإرسال،
 *     ليصلحها القسمُ قبل أن تصل الأساتذة (teachersWithRegulationIssues)، بالقواعد نفسها.
 * دوالٌّ نقيّة يقرؤها الخادم والاختبار.
 */
import type { FSchedule } from "../types";
import { regulationExceptionIssues, type RegulationExceptionIssue } from "./regulationException";
import { patternLengthIssue } from "./appointmentRegulation";
import { DAY_KEYS, sectionDaysFitLibrary, sectionHoursShortfallText, sectionPatternIssueText, sectionWeeklyHours, type DayKey } from "./scheduleRegulations";

export interface PinRegulationContext {
  /** أسبوعُ الفصل كلُّه: التتالي يُقرأ على أسبوع الأستاذ في الجامعة كلها. */
  week: readonly FSchedule[];
  hoursOf: (courseId: number) => number;
  placeholders?: ReadonlySet<number>;
  nameOf?: (row: FSchedule) => string;
}

/** مخالفاتُ اللائحة لصفٍّ واحد (م.6/2، م.6/3، م.7/8 السُّلّم، م.7/9) — بلا «طول اللقاء» (تقوله قاعدةُ المدّة). */
export function pinRegulationIssues(row: FSchedule, context: PinRegulationContext): RegulationExceptionIssue[] {
  return regulationExceptionIssues({
    row: row as any, week: context.week as any, placeholders: context.placeholders,
    courseHours: context.hoursOf(Number(row.AdCourseId)), nameOf: context.nameOf as any,
  }).filter(issue => issue.rule !== "lecture-length");
}

/** مخالفةٌ تمنع «ثبّت»: قاعدتُها ومادّتُها (إن كانت لها مادّة) وسطرُها. */
export interface PinIssue {
  rule: RegulationExceptionIssue["rule"] | "pattern" | "pattern-length" | "course-hours";
  /** «م.7/8»، أو "" لساعات المقرّر (لا مادّةَ لها). */
  article: string;
  text: string;
  day?: RegulationExceptionIssue["day"];
}

const sameSectionRow = (a: FSchedule, b: FSchedule) => Number(a.id) !== Number(b.id)
  && Number(a.AdCourseId) === Number(b.AdCourseId) && String(a.SCode ?? "").trim() === String(b.SCode ?? "").trim()
  && Number(a.AdCollegeId || 0) === Number(b.AdCollegeId || 0) && Number(a.AdSectionId || 0) === Number(b.AdSectionId || 0)
  && Number(a.AdTermId || 0) === Number(b.AdTermId || 0);

/**
 * ── كلُّ ما يمنع «ثبّت» لصفٍّ واحد — المصدرُ الواحد (pinReview، وعدّادُ الإرسال، ووسمُ الطلب عند القسم) ──────────
 * الشعبةُ بصفوفها كلِّها (صفوفُ المقرّر والرمز نفسيهما في `week`):
 *   • أيامُها ليست نمطاً في المكتبة (sectionDaysFitLibrary)، أو مدّةُ اللقاء تخالف نمطه (patternLengthIssue) — م.7/8؛
 *   • ساعاتُها تزيد على ساعات المقرّر أو تنقص عنها (sectionWeeklyHours)؛
 *   • ثم التتالي والسُّلّمُ ووقتُ الشعبة الثابت (pinRegulationIssues).
 * تُسرد كلُّها ولا يحجب بعضُها بعضاً. مقرّرٌ لا تُعرف ساعاتُه لا يُحكم نمطُه ولا ساعاتُه.
 */
export function pinRowIssues(row: FSchedule, context: PinRegulationContext): PinIssue[] {
  const issues: PinIssue[] = [];
  const hours = context.hoursOf(Number(row.AdCourseId));
  const own = DAY_KEYS.filter(day => Boolean((row as any)[day])) as DayKey[];
  if (hours > 0 && own.length) {
    const siblings = context.week.filter(other => sameSectionRow(row, other));
    if (sectionDaysFitLibrary(hours, row as any, siblings as any) === false) {
      issues.push({ rule: "pattern", article: "م.7/8", text: sectionPatternIssueText(hours, row as any, siblings as any) });
    } else {
      const length = patternLengthIssue({ CourseHours: hours }, own, String(row.fstarttime || ""), String(row.fendtime || ""));
      if (length) issues.push({ rule: "pattern-length", article: "م.7/8", text: length });
    }
    const reading = sectionWeeklyHours(row as any, siblings as any, hours);
    if (reading.over) issues.push({ rule: "course-hours", article: "", text: `ساعات الشعبة ${String(row.SCode || "—")} تزيد على ساعات المقرر · ${reading.total}/${reading.required} د` });
    else if (reading.under) issues.push({ rule: "course-hours", article: "", text: sectionHoursShortfallText(row.SCode, reading) });
  }
  issues.push(...pinRegulationIssues(row, context));
  return issues;
}

/** «السطر (م.7/8)» — المادّةُ بعد السطر حين تكون له مادّة. */
export const pinIssueLine = (issue: Pick<PinIssue, "text" | "article">) => issue.article ? `${issue.text} (${issue.article})` : issue.text;

/**
 * عند إرسال البطاقات: الأساتذةُ الذين في جداولهم (في نطاق القسم) ما يمنع «ثبّت» (pinRowIssues)، ومخالفاتُ كلٍّ منهم.
 * السلسلةُ المتتالية الواحدة تُقال مرةً ليومها، ومخالفةُ الشعبة (النمط والساعات) مرةً للشعبة لا لكل صفٍّ فيها.
 */
export function teachersWithRegulationIssues(scopeRows: readonly FSchedule[], context: PinRegulationContext): Array<{ instructorId: number; notes: string[] }> {
  const byTeacher = new Map<number, { notes: string[]; seen: Set<string> }>();
  for (const row of scopeRows) {
    const id = Number(row.AdInstructorId || 0);
    if (!id || context.placeholders?.has(id)) continue;
    const issues = pinRowIssues(row, context);
    if (!issues.length) continue;
    const entry = byTeacher.get(id) || { notes: [], seen: new Set<string>() };
    for (const issue of issues) {
      const sectionWide = issue.rule === "pattern" || issue.rule === "course-hours";
      const key = issue.day ? `${issue.rule}|${issue.day}`
        : sectionWide ? `${issue.rule}|${row.AdCollegeId}:${row.AdSectionId}:${row.AdCourseId}:${String(row.SCode ?? "").trim() || row.id}`
        : `${issue.rule}|${row.id}`;
      if (entry.seen.has(key)) continue;
      entry.seen.add(key);
      entry.notes.push(`${context.nameOf?.(row) ? `${context.nameOf(row)}: ` : ""}${pinIssueLine(issue)}`);
    }
    byTeacher.set(id, entry);
  }
  return [...byTeacher.entries()].map(([instructorId, entry]) => ({ instructorId, notes: entry.notes }));
}
