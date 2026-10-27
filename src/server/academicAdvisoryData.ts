/** Bounded, read-only view for academic suggestions. No grades or identities leave the server. */
import { Repository } from "../db/repository";
import { analyseAcademicAdvice, type AcademicReading, type AcademicPlanView } from "../utils/academicAdvisory";
import type { AdCourse, CurriculumPlan, FSchedule, StudentProfile } from "../types";

export async function academicAdviceForScope(collegeId: number, sectionId: number, termId: number): Promise<AcademicReading> {
  const empty: AcademicReading = { pairs: [], timePreferences: [], assessed: 0, source: "approved-plans-and-wishes", nonBlocking: true };
  if (![collegeId, sectionId, termId].every(n => Number.isSafeInteger(n) && n > 0)) return empty;
  const [plans, links, profiles, courses, rows] = await Promise.all([
    Repository.getCurriculumPlans(sectionId),
    Repository.getCurriculumPlanCourses(sectionId),
    Repository.getStudentProfilesBySection(sectionId),
    Repository.getCourses(),
    Repository.getSchedulesByScope({ termId, collegeId }),
  ]);
  const approved = await Promise.all((plans as CurriculumPlan[])
    .filter(p => p.status !== "archived" && Number(p.AdCollegeId) === collegeId && Number(p.AdSectionId) === sectionId)
    .map(async plan => {
      const set = await Repository.getRuleSet(plan.id);
      if (!set || set.status === "review") return null;
      return {
        planId: plan.id,
        courseIds: [...new Set([...(links || []).filter(l => l.planId === plan.id).map(l => Number(l.AdCourseId)), ...(set.externals || []).map(Number)])],
        rules: set.rules || [], groups: set.groups || [],
      } as AcademicPlanView;
    }));
  const active = approved.filter((p): p is AcademicPlanView => Boolean(p));
  if (!active.length) return empty;
  return analyseAcademicAdvice({
    collegeId, sectionId, termId, plans: active,
    profiles: profiles as StudentProfile[],
    courses: courses as AdCourse[],
    rows: rows as FSchedule[],
  });
}
