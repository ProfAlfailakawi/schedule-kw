import type { FSchedule } from "../types";

/** One section-number convention for the timetable and every quick-entry door.
 * Only the target term and course count; unrelated semesters cannot change the
 * suggested section. Imported 1–499 sections do not reset the 501 series.
 */
export function nextCourseSectionCode(
  rows: Iterable<Pick<FSchedule, "id" | "AdCourseId" | "AdTermId" | "SCode">>,
  courseId: number,
  termId: number,
  excludeId?: number | null,
): string {
  let maximum = 500;
  for (const row of rows) {
    if (excludeId && Number(row.id) === Number(excludeId)) continue;
    if (Number(row.AdCourseId) !== Number(courseId) || Number(row.AdTermId) !== Number(termId)) continue;
    const section = Number(String(row.SCode || "").trim());
    if (Number.isInteger(section) && section >= 501 && section <= 999) maximum = Math.max(maximum, section);
  }
  return String(maximum + 1);
}
