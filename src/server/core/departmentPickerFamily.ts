/**
 * ── عائلةُ القسم كما تعرضها قائمة أستاذ المقرر ──
 *
 * قائمةُ أستاذ المقرر (src/components/InstructorPicker.tsx) تفتح على «أساتذة هذا القسم فقط»
 * ثم «منتدبون هذا الفصل». مصادرها: قراءة /api/instructors?sectionId (تاريخ القسم، ومن يدرّس
 * هذا الفصل، وروستر المنتدبين، ودليل القسم اليدوي)، ومن له موعدٌ في القسم هذا الفصل
 * (`departmentIds`)، وروستر منتدبي الفصل. وتُخفي: المتقاعد والمتفرّغ، ومن صفتُه «منتدب»
 * ولم يُختَر لهذا الفصل ولا موعدَ له فيه.
 *
 * هنا القراءاتُ نفسها والقاعدةُ نفسها، لا قائمةٌ أخرى: يستعملها الخادم ليحكم بأن من اختاره
 * المنسّق في «تحويل هيئة التدريب» من هذه العائلة. «هيئة تدريسية» ليست شخصاً فلا تدخلها
 * (هي الافتراضي)، ولا أعضاءُ TA أنفسهم (فهم المصدر لا الهدف).
 */
import { Repository } from "../../db/repository";
import { placeholderInstructorIds } from "./smartImport";
import { readLiveVisitingRoster, readVisitingStatus } from "./visiting";
import { isTrainingAssistant } from "../../utils/taConversion";

export async function departmentPickerFamily(collegeId: number, sectionId: number, termId: number, scheduledIds: Iterable<number> = []): Promise<Set<number>> {
  if (!collegeId || !sectionId || !termId) return new Set();
  const [historical, termScoped, rawRoster, delegates, faculty, instructors, liveRoster, status] = await Promise.all([
    Repository.getInstructorsByScope(sectionId, 0),
    Repository.getInstructorsByScope(sectionId, termId),
    Repository.getVisitingRoster(collegeId, sectionId, termId),
    Repository.getDepartmentDelegates(collegeId, sectionId),
    Repository.getDepartmentFaculty(collegeId, sectionId),
    Repository.getInstructors(),
    readLiveVisitingRoster(collegeId, sectionId, termId),
    readVisitingStatus(collegeId, sectionId, termId),
  ]);
  const byId = new Map(instructors.map(person => [Number(person.AdInstructorId), person]));
  const placeholders = placeholderInstructorIds(instructors);
  const scheduled = [...scheduledIds].map(Number).filter(Boolean);
  const termRoster = new Set([...liveRoster.instructorIds, ...scheduled].map(Number));
  const visiting = new Set(status.instructorIds.map(Number));
  const candidates = [
    ...historical.map(person => person.AdInstructorId), ...termScoped.map(person => person.AdInstructorId),
    ...rawRoster, ...delegates, ...faculty, ...liveRoster.instructorIds, ...scheduled,
  ].map(Number).filter(Boolean);
  const family = new Set<number>();
  for (const id of candidates) {
    const person = byId.get(id);
    if (!person || placeholders.has(id) || isTrainingAssistant(person)) continue;
    if (person.AdInstructorStatus === "retired" || person.AdInstructorStatus === "sabbatical") continue;
    if (visiting.has(id) && !termRoster.has(id)) continue;
    family.add(id);
  }
  return family;
}
