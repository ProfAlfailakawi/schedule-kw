/**
 * ── مخالفاتُ اللائحة التي لا يمنعها الحفظُ عند القسم، وتمنع «ثبّت» عند الأستاذ (قرار المالك النهائي 2026-11-13) ──
 *
 * التتالي (م.6/2، م.6/3)، وسُلّمُ البدايات (م.7/8)، ووقتُ الشعبة الثابت (م.7/9): مصدرُها regulationExceptionIssues.
 *   • «ثبّت الجدول» عند الأستاذ يُمنع بها ولو كان الخطأ من القسم (pinReview): يعدّل الموعدَ أولاً ثم يرسل.
 *   • وعند إرسال البطاقات يُقال للقسم مرةً: «N أساتذة في جداولهم مخالفات للائحة» — تنبيهٌ لا يمنع الإرسال،
 *     ليصلحها القسمُ قبل أن تصل الأساتذة (teachersWithRegulationIssues).
 * دوالٌّ نقيّة يقرؤها الخادم والاختبار.
 */
import type { FSchedule } from "../types";
import { regulationExceptionIssues, type RegulationExceptionIssue } from "./regulationException";

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

/**
 * عند إرسال البطاقات: الأساتذةُ الذين في جداولهم (في نطاق القسم) مخالفاتٌ للائحة، ومخالفاتُ كلٍّ منهم برقم مادّتها.
 * السلسلةُ المتتالية الواحدة تُقال مرةً ليومها.
 */
export function teachersWithRegulationIssues(scopeRows: readonly FSchedule[], context: PinRegulationContext): Array<{ instructorId: number; notes: string[] }> {
  const byTeacher = new Map<number, { notes: string[]; seen: Set<string> }>();
  for (const row of scopeRows) {
    const id = Number(row.AdInstructorId || 0);
    if (!id || context.placeholders?.has(id)) continue;
    const issues = pinRegulationIssues(row, context);
    if (!issues.length) continue;
    const entry = byTeacher.get(id) || { notes: [], seen: new Set<string>() };
    for (const issue of issues) {
      const key = issue.day ? `${issue.rule}|${issue.day}` : `${issue.rule}|${row.id}`;
      if (entry.seen.has(key)) continue;
      entry.seen.add(key);
      entry.notes.push(`${context.nameOf?.(row) ? `${context.nameOf(row)}: ` : ""}${issue.text} (${issue.article})`);
    }
    byTeacher.set(id, entry);
  }
  return [...byTeacher.entries()].map(([instructorId, entry]) => ({ instructorId, notes: entry.notes }));
}
