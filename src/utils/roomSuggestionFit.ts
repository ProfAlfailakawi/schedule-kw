import type { AdCourse, MasterRoom } from "../types";

/** Room suggestions obey the course catalog's explicit settings, rather than
 * merely ranking incompatible rooms lower. Unclassified courses retain their
 * previous free-room search behavior. */
const normalize = (value: unknown): string =>
  String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

const practicalRoom = /مختبر|معمل|ورشة|عملي|عملية|تطبيقي|تطبيقية|حاسوب|كمبيوتر|استوديو|ستوديو|laborator|workshop|studio|computer|practical|applied/;
const theoreticalRoom = /تدريس|محاضرة|نظري|نظرية|فصل|classroom|lecture|theoretical/;
const trainingRoom = /تدريب|ميداني|training|field/;

/** A suggested primary room must match both the declared room type and the
 * teaching nature. A named custom room type is authoritative unless its name
 * explicitly contradicts the nature. No untyped room substitutes for a
 * selected type, and "companion_only" rooms are excluded separately by the
 * existing eligibleHallsForSection registry rule. */
export function roomMatchesCourseSuggestion(
  course: Pick<AdCourse, "CourseRoomType" | "CourseTeachingMode"> | null | undefined,
  room: Pick<MasterRoom, "roomType"> | null | undefined,
): boolean {
  if (!course) return true;
  const required = normalize(course.CourseRoomType);
  const actual = normalize(room?.roomType);
  if (required && actual !== required) return false;

  const mode = normalize(course.CourseTeachingMode);
  if (!mode || mode === "mixed") return true;
  if (!actual) return false;

  const isPractical = practicalRoom.test(actual);
  const isTheoretical = theoreticalRoom.test(actual);
  const isTraining = trainingRoom.test(actual);

  if (mode === "theoretical") {
    if (isPractical || isTraining) return false;
    return Boolean(required || isTheoretical);
  }
  if (mode === "applied" || mode === "practical") {
    if (isTheoretical && !isPractical) return false;
    return Boolean(required || isPractical);
  }
  if (mode === "field_training") {
    if (isTheoretical && !isTraining) return false;
    return Boolean(required || isTraining);
  }
  return true;
}
