/**
 * ── أيُّ صحيفةٍ يتبعها المقرر؟ ───────────────────────────────────────────────
 *
 * الخادمُ يوسم كلَّ مقررٍ بالصحائف الحيّة التي تضمّه (`/api/courses?plans=1` ←
 * `curriculum: [{ status: "active" | "transition" }]`): «active» هي الصحيفة
 * الجديدة، و«transition» هي السابقة الجارية حتى يتخرّج طلبتُها. ومقررٌ في
 * الاثنتين «مشترك». وقسمٌ بلا صحائف لا وسمَ لمقرراته: كلُّها «الحالية».
 *
 * القاعدةُ نفسها في كتالوج المقررات (Courses.tsx)؛ هنا شكلُها النقيّ لمن يحتاج
 * الوسم وحده (محاكي الشعب، و«كل المقررات»).
 */

export type SheetTag = "new" | "old" | "shared" | "service" | null;

export interface SheetTaggedCourse {
  curriculum?: Array<{ status?: string; name?: string }> | null;
  serviceFor?: string[] | null;
  /**
   * جهةُ المقرر من عضوية الصحيفة الواحدة (src/utils/sheetMembership.ts) — المصدرُ نفسه الذي يكتب وسم «صحيفة 2026».
   * حين يرسلها الخادم (قسمٌ له الصحيفتان) فهي الحكم: null = لا في الجديدة ولا في القديمة.
   */
  sheetSide?: "new" | "old" | "shared" | null;
}

export function sheetTagOf(course: SheetTaggedCourse | null | undefined): SheetTag {
  if (course && course.sheetSide !== undefined) return course.sheetSide || (Array.isArray(course.serviceFor) && course.serviceFor.length ? "service" : null);
  const plans = Array.isArray(course?.curriculum) ? course!.curriculum! : [];
  if (!plans.length) return Array.isArray(course?.serviceFor) && course!.serviceFor!.length ? "service" : null;
  const isNew = plans.some(plan => plan?.status === "active");
  const isOld = plans.some(plan => plan?.status === "transition");
  if (isNew && isOld) return "shared";
  if (isNew) return "new";
  if (isOld) return "old";
  return null;
}

/** المقرر من الصحيفة الجديدة (وحدها أو مشتركاً)؟ */
export const inNewSheet = (tag: SheetTag) => tag === "new" || tag === "shared";
/** المقرر من الصحيفة السابقة (وحدها أو مشتركاً)؟ */
export const inOldSheet = (tag: SheetTag) => tag === "old" || tag === "shared";

export const SHEET_TAG_LABEL: Record<Exclude<SheetTag, null>, string> = {
  new: "صحيفة جديدة",
  old: "صحيفة سابقة",
  shared: "في الصحيفتين",
  service: "متطلب كلية",
};
