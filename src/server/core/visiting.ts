/**
 * ── الأساتذةُ الزائرون: القراءة والفحص ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { Repository } from "../../db/repository";
import { liveVisitingIds } from "../../utils/liveVisiting";

/**
 * Read the visiting roster exactly as the live UI should understand it.
 *
 * A term roster may outlive a person being removed from the department's
 * visiting directory. Those old IDs are useful historical evidence, but they
 * must not keep a "2 visitors" badge alive in today's schedule, nor resurrect
 * someone the department deliberately removed. The persistent department
 * directory is therefore the live-membership authority, while the global
 * instructor table confirms that the identity itself still exists.
 *
 * Historical roster documents are never rewritten here; this is a read filter
 * only, so past evidence remains intact for audit/recovery.
 */
export async function readLiveVisitingRoster(collegeId: number, sectionId: number, termId: number) {
  if (!collegeId || !sectionId || !termId) return { instructorIds: [] as number[], instructors: [] as any[] };
  const [roster, directory, instructors] = await Promise.all([
    Repository.getVisitingRoster(collegeId, sectionId, termId),
    Repository.getDepartmentDelegates(collegeId, sectionId),
    Repository.getInstructors(),
  ]);
  const instructorById = new Map(instructors.map(person => [Number(person.AdInstructorId), person]));
  const instructorIds = liveVisitingIds(roster, directory, id => instructorById.has(id));
  return {
    instructorIds,
    instructors: instructorIds.map(id => instructorById.get(id)).filter(Boolean),
  };
}

/**
 * صفةُ «منتدب» دائمةٌ: اسمٌ في دليل منتدبي القسم (عائلته)، له سجلٌّ في الأساتذة. لا يشترط
 * أن يكون في روستر فصلٍ بعينه، ولا يزول إلا حين يُحوَّل من بطاقة الأستاذ إلى معيّن.
 * روسترُ الفصل يحدد من يُدرِّس فيه (`readLiveVisitingRoster`)، لا من يُسمّى منتدباً.
 */
export async function readVisitingStatus(collegeId: number, sectionId: number, termId = 0) {
  if (!collegeId || !sectionId) return { instructorIds: [] as number[] };
  const [directory, instructors, explicit, family] = await Promise.all([
    Repository.getDepartmentDelegates(collegeId, sectionId),
    Repository.getInstructors(),
    Repository.getExplicitDirectoryScopes(),
    Repository.familyOf(collegeId, sectionId),
  ]);
  const known = new Set(instructors.map(person => Number(person.AdInstructorId)));
  const saved = family.some(member => explicit.some(scope => Number(scope.collegeId) === Number(member.collegeId) && Number(scope.sectionId) === Number(member.sectionId)));
  /* قسمٌ لم يحفظ دليلاً قطّ: «دليلُه» المقروء من الأرشيف يضم كل من مرّ في أي فصل، فيُقرأ له روسترُ هذا الفصل وحده
     (القاعدةُ نفسها في visitingByScope) كي لا يصير منتدباً في كل الفصول بلا قرار. */
  const live = saved || !termId ? directory : liveVisitingIds(await Repository.getVisitingRoster(collegeId, sectionId, termId), directory, id => known.has(id));
  return { instructorIds: [...new Set([...live].map(Number).filter(id => Number.isFinite(id) && id > 0 && known.has(id)))] };
}

/**
 * «منتدب» لكل صفٍّ بقسمه هو: يقرأ دفتر المنتدبين مرةً لكل (كلية، قسم) متميّز في الفصل ثم
 * يجيب عن أي صف. المنتدب منتدبٌ في قسمٍ لا في كل الأقسام، فالقرار دائماً بنطاق الصف نفسه.
 * للمخرجات التي لا طلب مستخدم خلفها (الصفحات العامة، التقويم، الإكسل).
 */
export async function visitingChecker(termId: number, scopes: Iterable<{ collegeId: unknown; sectionId: unknown }>) {
  const byScope = new Map<string, Set<number>>();
  const wanted = new Map<string, { collegeId: number; sectionId: number }>();
  for (const scope of scopes) {
    const collegeId = Number(scope.collegeId) || 0, sectionId = Number(scope.sectionId) || 0;
    if (collegeId && sectionId) wanted.set(`${collegeId}:${sectionId}`, { collegeId, sectionId });
  }
  await Promise.all([...wanted].map(async ([key, scope]) => {
    byScope.set(key, new Set((await readVisitingStatus(scope.collegeId, scope.sectionId, termId)).instructorIds.map(Number)));
  }));
  return (instructorId: unknown, collegeId: unknown, sectionId: unknown) =>
    byScope.get(`${Number(collegeId) || 0}:${Number(sectionId) || 0}`)?.has(Number(instructorId)) === true;
}
