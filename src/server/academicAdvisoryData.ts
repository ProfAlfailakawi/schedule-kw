/** Bounded, read-only view for academic suggestions. No grades or identities leave the server. */
import { Repository } from "../db/repository";
import { analyseAcademicAdvice, type AcademicReading, type AcademicPlanView } from "../utils/academicAdvisory";
import { buildAcademicDecisionLab } from "../utils/academicDecisionLab";
import { buildAcademicDecisionLabTrainingPreview } from "../utils/academicDecisionLabDemo";
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
  if (!active.length) {
    // A demo section with no approved plan still needs the independent six-tool lesson.
    // Never expose fictional advice in an actual department.
    if (Repository.isDemoRequest()) empty.decisionLab = buildAcademicDecisionLabTrainingPreview();
    return empty;
  }
  const input = {
    collegeId, sectionId, termId, plans: active,
    profiles: profiles as StudentProfile[],
    courses: courses as AdCourse[],
    rows: rows as FSchedule[],
  };
  const reading = analyseAcademicAdvice(input);
  // Evaluate the heavier what-if only if the authorised schedule API serialises
  // the whole reading. The professor public-token endpoint selectively returns
  // pairs and time preferences; it must NOT compute or expose the lab.
  const demoRequest = Repository.isDemoRequest();
  let decisionLab: ReturnType<typeof buildAcademicDecisionLab> | undefined;
  Object.defineProperty(reading, "decisionLab", {
    enumerable: true,
    get() {
      if (!decisionLab) {
        // The demo always presents the complete six-tool training journey.
        // Live department advice stays in the original pairs/time preferences,
        // while university scopes always use real decision-lab calculations.
        decisionLab = demoRequest
          ? buildAcademicDecisionLabTrainingPreview()
          : buildAcademicDecisionLab(input, reading);
      }
      return decisionLab;
    },
  });
  return reading;
}
