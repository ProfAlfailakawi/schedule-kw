/**
 * ── ما بقي في أنصبة العائلة: للمنتدبين في تخطيط الشعب (src/utils/sectionPlan.ts) ──
 *
 * • أساتذةُ العائلة (روستر «الأساتذة» نفسه): لكلٍّ نصابُه (الدرجة أو الاستثناء، وإلا «النصاب» المسجّل)
 *   ناقصَ ساعاته هذا الفصل في كل الأقسام. بلا نصابٍ مسجّل لا يُخترع له رقم: لا يُحسب له متاح.
 * • منتدبو العائلة في جدول الفصل: لكلٍّ ٦ ساعات ناقصَ ساعاته.
 * • «هيئة تدريسية» ليست أستاذاً: شعبتُها تُحسب بلا أستاذ.
 * أعدادٌ فقط؛ لا اسم يخرج من هنا.
 */
import { Repository } from "../db/repository";
import { evaluateTeachingLoad, loadTermContext, teachingHoursByInstructor } from "../utils/teachingLoad";
import { VISITOR_HOURS } from "../utils/sectionPlan";
import { placeholderInstructorIds } from "./core/smartImport";
import { readVisitingStatus } from "./core/visiting";
import { rosterMemberIds } from "../utils/rosterGroups";

/** أساتذةُ العائلة كما يعدّهم روستر «الأساتذة» (src/server/routes/instructorsRoutes.ts) بالقاعدة نفسها. */
async function familyRosterIds(collegeId: number, sectionId: number): Promise<Set<number>> {
  const [faculty, family, visiting, people] = await Promise.all([
    Repository.getDepartmentFaculty(collegeId, sectionId), Repository.familyOf(collegeId, sectionId), readVisitingStatus(collegeId, sectionId), Repository.getInstructors(),
  ]);
  const rows = (await Promise.all(family.map(member => Repository.getSchedulesByScope({ collegeId: member.collegeId, sectionId: member.sectionId })))).flat();
  return rosterMemberIds({ faculty, taught: (rows as any[]).map(row => row.AdInstructorId), delegates: visiting.instructorIds, people: people as any[] });
}

export interface TeachingRoom { freeHours: number; placeholders: Set<number> }

export async function teachingRoomFor(collegeId: number, sectionId: number, termId: number, familyRows: readonly any[]): Promise<TeachingRoom> {
  const [roster, instructors, config, terms, termRows, courses, visiting] = await Promise.all([
    familyRosterIds(collegeId, sectionId), Repository.getInstructors(), Repository.getTeachingLoadConfig(), Repository.getTerms(),
    Repository.getSchedulesByScope({ termId }), Repository.getCourses(), readVisitingStatus(collegeId, sectionId, termId),
  ]);
  const placeholders = placeholderInstructorIds(instructors as any[]);
  const hours = teachingHoursByInstructor(termRows as any[], new Map<number, number>((courses as any[]).map(course => [Number(course.AdCourseId), Number(course.CourseHours) || 0] as [number, number])));
  const context = loadTermContext(terms as any, termId);
  const visitors = new Set<number>(visiting.instructorIds.map(Number));
  const byId = new Map((instructors as any[]).map(person => [Number(person.AdInstructorId), person] as const));
  let free = 0;
  for (const id of roster) {
    const person = byId.get(Number(id));
    if (!person || visitors.has(Number(id)) || placeholders.has(Number(id)) || person.AdInstructorStatus) continue;
    const status = evaluateTeachingLoad(config, Number(id), hours.get(Number(id)) || 0, context);
    const cap = status.max ?? (Number(person.AdInstructorLoad) > 0 ? Number(person.AdInstructorLoad) : 0);
    if (cap > 0) free += Math.max(0, cap - (hours.get(Number(id)) || 0));
  }
  const here = new Set<number>(familyRows.map(row => Number(row.AdInstructorId || 0)).filter(id => id && visitors.has(id)));
  for (const id of here) free += Math.max(0, VISITOR_HOURS - (hours.get(id) || 0));
  return { freeHours: Math.round(free), placeholders };
}
