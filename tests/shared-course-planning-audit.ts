import assert from "node:assert/strict";
import { prepareSharedCoursePlanningCases } from "../src/utils/sharedCoursePlanning";
import type { AdCourse, CurriculumRuleSet, FSchedule } from "../src/types";

const course = (id: number, section: number) => ({ AdCourseId: id, AdSectionId: section } as AdCourse);
const row = (id: number, courseId: number, sectionId: number, day: "fmonday" | "ftuesday", start: string, end: string) => ({
  id, AdCourseId: courseId, AdSectionId: sectionId, AdTermId: 1,
  fsunday: false, fmonday: day === "fmonday", ftuesday: day === "ftuesday", fwednesday: false, fthursday: false,
  fstarttime: start, fendtime: end,
} as FSchedule);
const approvedRule = {
  planId: "consumer-plan", AdSectionId: 20, status: "approved", externals: [100], rules: [{ courseId: 200 }],
} as CurriculumRuleSet;
const base = {
  courses: [course(100, 10), course(200, 20), course(201, 20)],
  rows: [row(1, 100, 10, "fmonday", "08:00", "09:20"), row(2, 200, 20, "fmonday", "08:30", "09:50"),
    row(3, 201, 20, "fmonday", "08:30", "09:50"), row(4, 200, 20, "ftuesday", "08:30", "09:50")],
  approvedRules: [approvedRule], activePlanIds: new Set(["consumer-plan"]),
};

const found = prepareSharedCoursePlanningCases(base);
assert.equal(found.length, 1, "only an overlapping course in the active approved plan is included");
assert.deepEqual(found[0], {
  planId: "consumer-plan", consumerSectionId: 20, serviceCourseId: 100, serviceRowId: 1,
  departmentCourseId: 200, departmentRowId: 2, day: "fmonday", overlapStart: "08:30", overlapEnd: "09:20",
  confidence: "needs-cohort-confirmation",
});
assert.equal(prepareSharedCoursePlanningCases({ ...base, activePlanIds: new Set() }).length, 0);
assert.equal(prepareSharedCoursePlanningCases({ ...base, approvedRules: [{ ...approvedRule, status: "review" }] }).length, 0);
assert.equal(prepareSharedCoursePlanningCases({ ...base, courses: [course(100, 20), course(200, 20)] }).length, 0);
console.log("Shared-course planning: 4 passed");
