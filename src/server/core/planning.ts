/**
 * ── التخطيط: فجوةُ الشعب وتقريرُ المتبقي ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { Repository } from "../../db/repository";
import { readStudentDemand, mergeCurrentDemandResponses } from "../../utils/studentDemand";
import { surveyOwnsNeed } from "../../utils/studentCaseScope";
import { surveyActiveCourseIds } from "./studentIdentity";

/* ── كشفُ «المتبقي» (PDF أو صورة) ← معاينة ─────────────────────────────────
   لا يُحفظ شيءٌ هنا ولا يُبقى الملف: تُعاد القراءةُ (الأعمدة وأرقام كل مقرر)
   والواجهة تعرضها، والقسم يختار العمود ويُملأ ثم يُحفظ بالباب المعتاد.
   كشفٌ مصوّرٌ صفحاتٍ يُرفع صورةً صورة: كلُّ ردٍّ يحمل خلايا صفحته، والواجهة
   تجمعها وتطلب قراءتها معاً (remaining-cells) فتتطابق أعمدةُ الصفحات. */
const REMAINING_SEASONS: Record<string, "first" | "second" | "summer"> = { "الأول": "first", "الثاني": "second", "الصيفي": "summer" };

/**
 * «صحيفة سابقة / جديدة» beside a student: the plan their graduation sheet
 * proved, or the only plan their chosen courses fit. Read from the student's
 * own department, and shown only there are two live plans to tell apart.
 */
export const curriculumLabelsFor=async(needs:any[])=>{
  const sectionIds=[...new Set(needs.filter(need=>need?.curriculumPlanId).map(need=>Number(need.studentSectionId||need.AdSectionId||0)).filter(Boolean))];
  const labels=new Map<string,{name:string;status:string}>();
  await Promise.all(sectionIds.map(async sid=>{
    const plans=await Repository.getCurriculumPlans(sid);
    if(plans.filter(plan=>plan.status!=="archived").length<2)return;
    for(const plan of plans)labels.set(plan.id,{name:plan.name,status:plan.status});
  }));
  return(need:any)=>labels.get(String(need?.curriculumPlanId||""))||null;
};
export async function sectionGapData(collegeId: number, sectionId: number, termId: number) {
  const [allTermNeeds, courses, termWeek, currentProfiles, stats] = await Promise.all([
    Repository.getStudentNeeds(collegeId, 0, termId),
    Repository.getCoursesBySection(sectionId),
    Repository.getSchedulesByScope({ collegeId, sectionId, termId }),
    Repository.getStudentProfilesByCollege(collegeId).catch(() => []),
    Repository.getRegistrationStats(collegeId, sectionId, termId).catch(() => null),
  ]);
  const operationalDemandIds = await surveyActiveCourseIds(sectionId);
  const targetCourseIds = new Set((courses as any[]).filter(course => operationalDemandIds.has(Number(course.AdCourseId))).map(course => Number(course.AdCourseId)));
  const needs = (allTermNeeds as any[]).filter(need => surveyOwnsNeed(need, sectionId, targetCourseIds));
  const analyticalNeeds = mergeCurrentDemandResponses(needs as any[], currentProfiles as any[], { termId, collegeId, sectionId })
    .filter((need: any) => Array.isArray(need.courseIds));
  const reading = readStudentDemand(analyticalNeeds, courses as any[]);
  const studentsOf = new Map(reading.courses.map(item => [Number(item.courseId), Number(item.students) || 0]));
  const sectionsOf = new Map<number, Set<string>>();
  for (const row of termWeek as any[]) {
    const id = Number(row.AdCourseId);
    if (!sectionsOf.has(id)) sectionsOf.set(id, new Set());
    sectionsOf.get(id)!.add(String(row.SCode || row.id));
  }
  return {
    respondents: reading.respondents,
    planImported: Boolean(stats?.remainingSource?.column === "notPassed" && stats?.remainingSource?.fileName && stats.remainingSource.fileName !== "إدخال يدوي"),
    planSource: stats?.remainingSource?.column === "notPassed" ? { fileName: stats.remainingSource.fileName, importedAt: stats.remainingSource.importedAt } : null,
    /* «المختار» يُكتب بيد القسم ولو لم يُرفع كشف؛ والمتبقي لا يُعتدّ به إلا من كشفٍ مرفوع (الحالُ القديم المحفوظ بعمودٍ آخر لا يُحسب). */
    accepted: stats?.accepted || {},
    remaining: stats?.remainingSource?.column === "notPassed" ? (stats?.remaining || {}) : {},
    courses: (courses as any[]).map(course => ({
      id: Number(course.AdCourseId), code: String(course.CourseCode || ""), name: String(course.CourseName || ""),
      capacity: Number(course.MaxStudent) || 0,
      existing: sectionsOf.get(Number(course.AdCourseId))?.size || 0,
      students: studentsOf.get(Number(course.AdCourseId)) || 0,
    })),
  };
}
