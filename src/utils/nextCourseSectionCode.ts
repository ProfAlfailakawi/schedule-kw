import type { FSchedule } from "../types";
import { nextCourseSection, type SectionNumberLedger } from "./registrarNumbering";

/** One section-number convention for the timetable and every quick-entry door.
 * Only the target term and course count; unrelated semesters cannot change the
 * suggested section. Imported 1–499 sections do not reset the 501 series
 * (section >= 501 && section <= 999, starting after maximum = 500), gaps are
 * never filled, and the term's ledger keeps a number deleted earlier from
 * coming back (src/utils/registrarNumbering.ts).
 */
export function nextCourseSectionCode(
  rows: Iterable<Pick<FSchedule, "id" | "AdCourseId" | "AdTermId" | "SCode">>,
  courseId: number,
  termId: number,
  excludeId?: number | null,
  ledger?: SectionNumberLedger | null,
): string {
  return nextCourseSection(rows, courseId, termId, { excludeId, ledger });
}
