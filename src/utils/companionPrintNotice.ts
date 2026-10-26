import type { AdCourse, FSchedule } from "../types";

/** An unset historical requirement must not be represented as a booked physical room. */
export function missingCompanionBookingNotice(
  row: Pick<FSchedule, "companionRoomId" | "companionRoomLabel">,
  course?: Pick<AdCourse, "CourseCompanionRoomType"> | null,
): string {
  if (String(row.companionRoomId || "").trim() || String(row.companionRoomLabel || "").trim()) return "";
  const requiredType = String(course?.CourseCompanionRoomType || "").trim();
  return requiredType ? `مرفق مطلوب · ${requiredType} · غير محجوز` : "";
}
