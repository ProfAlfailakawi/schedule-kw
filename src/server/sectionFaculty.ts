/**
 * «هيئة تدريسية» تولد مع القسم الجديد.
 *
 * هي سجلّ يملكه كل قسم لنفسه (ليست شخصاً): تُسنَد إليها الشعب التي لا مدرّس لها
 * بعد، وإليها يتحوّل المنتدب في الجدول المستورد. قسمٌ بلا سجلّها يخرج جدوله
 * المستورد بخانات أستاذ فارغة أو غير محسومة، فيُنشأ لكل قسم جديد سجلُّه ويُربط
 * بهيئته. الإعادة لا تكرّر شيئاً، ومن له سجلّ في هيئته لا يُنشأ له آخر.
 */
import { placeholderInstructorIds } from "../utils/instructorIdentity";

export const FACULTY_PLACEHOLDER_NAME = "هيئة تدريسية";

/**
 * رقمٌ مدنيٌّ اصطناعيٌّ فريدٌ لكل قسم، من 12 خانة تبدأ بـ«2» ثم «9999»: خانات الشهر فيه
 * (99) لا يصدرها السجل المدني، فلا يلتبس برقم شخصٍ حقيقي ولا يتصادم مع غيره.
 */
export const placeholderCivilFor = (collegeId: number, sectionId: number): string =>
  `29999${String(Math.max(0, collegeId) % 1000).padStart(3, "0")}${String(Math.max(0, sectionId) % 10000).padStart(4, "0")}`;

export async function ensureSectionFaculty(
  Repository: any, collegeId: number, sectionId: number,
): Promise<{ instructorId: number; created: boolean }> {
  const [instructors, facultyIds] = await Promise.all([Repository.getInstructors(), Repository.getDepartmentFaculty(collegeId, sectionId)]);
  const mine = new Set<number>((facultyIds as any[]).map(Number));
  const existing = [...placeholderInstructorIds(instructors as any)].find(id => mine.has(id));
  if (existing) return { instructorId: existing, created: false };
  const civil = placeholderCivilFor(collegeId, sectionId);
  let record = (instructors as any[]).find(person => String(person.AdInstructorCivil) === civil);
  const created = !record;
  if (!record) record = await Repository.createInstructor(civil, FACULTY_PLACEHOLDER_NAME, "");
  await Repository.addDepartmentFaculty(collegeId, sectionId, Number(record.AdInstructorId));
  return { instructorId: Number(record.AdInstructorId), created };
}
