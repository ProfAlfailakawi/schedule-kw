import type { AdCourse, CurriculumRuleSet, FSchedule } from "../types";
import { DAY_KEYS, toMinutes, type DayKey } from "./scheduleRegulations";

/**
 * إعدادٌ داخلي للمادة 7/6 من قرار 1913/2016. الصحيفة تحدد المقرر العام الذي
 * يطلبه القسم، لكنها لا تحدد طلبة الشعبة؛ لذلك هذه حالات تنسيق محتملة، ولا
 * يجوز تحويلها إلى مانع اعتماد قبل ربطها بفوج الطلاب المعني.
 */
export interface SharedCoursePlanningCase {
  planId: string;
  consumerSectionId: number;
  serviceCourseId: number;
  serviceRowId: number;
  departmentCourseId: number;
  departmentRowId: number;
  day: DayKey;
  overlapStart: string;
  overlapEnd: string;
  confidence: "needs-cohort-confirmation";
}

export function prepareSharedCoursePlanningCases(input: {
  rows: FSchedule[];
  courses: AdCourse[];
  approvedRules: CurriculumRuleSet[];
  activePlanIds: ReadonlySet<string>;
}): SharedCoursePlanningCase[] {
  const owner = new Map(input.courses.map(course => [Number(course.AdCourseId), Number(course.AdSectionId)]));
  const rowsByCourse = new Map<number, FSchedule[]>();
  const rowsBySection = new Map<number, FSchedule[]>();
  for (const row of input.rows) {
    const courseId = Number(row.AdCourseId);
    const sectionId = Number(row.AdSectionId);
    rowsByCourse.set(courseId, [...(rowsByCourse.get(courseId) || []), row]);
    rowsBySection.set(sectionId, [...(rowsBySection.get(sectionId) || []), row]);
  }
  const cases: SharedCoursePlanningCase[] = [];
  const seen = new Set<string>();
  for (const rule of input.approvedRules) {
    if (rule.status !== "approved" || !input.activePlanIds.has(rule.planId)) continue;
    const consumerSectionId = Number(rule.AdSectionId);
    const departmentCourseIds = new Set(rule.rules.map(item => Number(item.courseId)));
    for (const serviceCourseId of new Set((rule.externals || []).map(Number))) {
      if (!serviceCourseId || !owner.has(serviceCourseId) || owner.get(serviceCourseId) === consumerSectionId) continue;
      for (const service of rowsByCourse.get(serviceCourseId) || []) {
        if (Number(service.AdSectionId) !== owner.get(serviceCourseId)) continue;
        for (const department of rowsBySection.get(consumerSectionId) || []) {
          if (!departmentCourseIds.has(Number(department.AdCourseId))) continue;
          if (Number(service.AdTermId) !== Number(department.AdTermId)) continue;
          const start = Math.max(toMinutes(service.fstarttime), toMinutes(department.fstarttime));
          const end = Math.min(toMinutes(service.fendtime), toMinutes(department.fendtime));
          if (end <= start) continue;
          for (const day of DAY_KEYS) {
            if (!service[day] || !department[day]) continue;
            const key = [rule.planId, service.id, department.id, day].join(":");
            if (seen.has(key)) continue;
            seen.add(key);
            const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
            cases.push({ planId: rule.planId, consumerSectionId, serviceCourseId,
              serviceRowId: service.id, departmentCourseId: Number(department.AdCourseId),
              departmentRowId: department.id, day, overlapStart: clock(start), overlapEnd: clock(end),
              confidence: "needs-cohort-confirmation" });
          }
        }
      }
    }
  }
  return cases;
}
