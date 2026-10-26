import type { AdCourse, MasterRoom } from "../types";

/** The chosen room type is authoritative for suggestions. Teaching nature is
 * descriptive and must never exclude a room intentionally selected by type
 * (for example, a theoretical workshop that requires a laboratory).
 *
 * Without an assigned room type, preserve the previous flexible advisor:
 * availability, ownership, collisions and travel are still checked by the
 * shared suggestion endpoint. */
const normalize = (value: unknown): string =>
  String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

export function roomMatchesCourseSuggestion(
  course: Pick<AdCourse, "CourseRoomType" | "CourseTeachingMode"> | null | undefined,
  room: Pick<MasterRoom, "roomType"> | null | undefined,
): boolean {
  const requiredRoomType = normalize(course?.CourseRoomType);
  if (!requiredRoomType) return true;
  return normalize(room?.roomType) === requiredRoomType;
}
