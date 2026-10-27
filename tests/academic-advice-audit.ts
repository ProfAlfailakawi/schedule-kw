import { strict as assert } from "node:assert";
import fs from "node:fs";
import { analyseAcademicAdvice, mandatoryPrecedes, type AcademicPlanView } from "../src/utils/academicAdvisory";
import type { AdCourse, FSchedule, StudentProfile } from "../src/types";

const course = (id: number, section = 9): AdCourse => ({
  AdCourseId: id, AdCollegeId: 12, AdSectionId: section, CourseCode: String(id),
  CourseName: "مقرر " + id, CourseCredit: 3, CourseHours: 3, MaxStudent: 25,
});
const slot = (id: number, section: string, start: string, end: string, day = "fsunday"): FSchedule => ({
  id: id * 100 + Number(section), AdCollegeId: 12, AdSectionId: 9,
  AdTermId: 25, AdCourseId: id, SCode: section,
  fstarttime: start, fendtime: end, [day]: true,
} as unknown as FSchedule);
const profile = (id: number, wish: number[], passed: number[], planId = "old"): StudentProfile => ({
  id: "student-" + id, fingerprint: "fp-" + id, AdCollegeId: 12,
  AdSectionId: 9, curriculumPlanId: planId, passedCourseIds: passed,
  passedUnits: passed.length * 3, wishes: { termId: 25, courseIds: wish, targetUnits: 15, constraints: {}, updatedAt: "" },
} as unknown as StudentProfile);
const old: AcademicPlanView = {
  planId: "old", courseIds: [1,2,3,4,5,6,7],
  rules: [
    { courseId: 1 }, { courseId: 2, prereq: { all: [1], anyOf: [] } },
    { courseId: 3, prereq: { all: [1], anyOf: [] } },
    { courseId: 4, prereq: { all: [2], anyOf: [] } },
    { courseId: 5 }, { courseId: 6, coreq: [7] }, { courseId: 7 },
  ], groups: [],
};
const base = { collegeId: 12, sectionId: 9, termId: 25,
  plans: [old], courses: [1,2,3,4,5,6,7].map(n => course(n)),
  rows: [slot(2, "501", "08:00", "09:00"), slot(3,"501","08:00","09:00"), slot(3,"502","09:00","10:00")],
};
assert.equal(mandatoryPrecedes(old.rules, 1, 4), true, "transitive prerequisites");
assert.equal(mandatoryPrecedes(old.rules, 4, 1), false, "reverse does not apply");
const eligible = analyseAcademicAdvice({ ...base, profiles: [1,2,3].map(i => profile(i,[2,3],[1])) });
assert.equal(eligible.pairs.find(p => p.a === 2 && p.b === 3)?.shared, 3, "eligible co-need");
assert.equal(eligible.pairs.find(p => p.a === 2 && p.b === 3)?.hasAlternative, true, "alternative sections reported");
assert.equal(eligible.pairs.find(p => p.a === 2 && p.b === 3)?.overlap, true, "only some pairings overlap");
assert.equal(eligible.nonBlocking, true);
const verdictSource = fs.readFileSync("src/utils/instructorRequestVerdict.ts", "utf8");
assert.match(verdictSource, /exceptionReasons = reasons\.filter\(reason => reason\.source !== "cohort"\)/, "faculty demand warning never requires an exception");
const noEarlyRegistration = analyseAcademicAdvice({ ...base, profiles: [1,2,3].map(i => profile(i,[1,2],[])) });
assert.ok(!noEarlyRegistration.pairs.some(p => p.a === 1 && p.b === 2), "prerequisite is NOT simultaneous demand");
const small = analyseAcademicAdvice({ ...base, profiles: [profile(1,[2,3],[1])] });
assert.equal(small.pairs.find(p => p.a === 2 && p.b === 3)?.shared, 0, "small cohort never disclosed");
assert.equal(small.pairs.find(p => p.a === 2 && p.b === 3)?.basis, "curriculum", "sibling is not invented count");
const afternoon = analyseAcademicAdvice({ ...base, profiles: [1,2,3].map(i => ({ ...profile(i,[2,3],[1]), wishes: { ...profile(i,[2,3],[1]).wishes!, constraints: { noMorning: true } } })) });
assert.ok(afternoon.timePreferences.some(p => p.courseId === 2 && p.wanted === 3), "afternoon grouping suggestion from verified eligible student preferences");
const unknown = analyseAcademicAdvice({ ...base, plans: [], profiles: [1,2,3].map(i => profile(i,[2,3],[1])) });
assert.equal(unknown.pairs.length, 0, "no approved plan means no advice");
const excludedCo = analyseAcademicAdvice({ ...base, profiles: [1,2,3].map(i => profile(i,[5,6],[])), rows: [...base.rows,slot(5,"501","08:00","09:00"),slot(6,"501","08:00","09:00")] });
assert.ok(!excludedCo.pairs.some(p => p.a === 5 && p.b === 6), "unmet corequisite cannot inflate count");
const mixed = analyseAcademicAdvice({ ...base, profiles: [profile(1,[2,3],[1]), profile(2,[2,3],[1],"new"), profile(3,[2,3],[1],"new")] });
assert.equal(mixed.pairs.find(p => p.a === 2 && p.b === 3)?.shared, 0, "students from an unapproved plan cannot count");
const code = fs.readFileSync("server.ts","utf8");
assert.ok(code.includes('app.get("/api/schedules/academic-advice", requirePermission(7)'), "scope protected route");
assert.ok(code.includes('app.get("/api/public/request/:token/academic-advice"'), "professor link authenticated separately");
const visual = fs.readFileSync("src/server/academicAdvisoryVisual.ts","utf8");
assert.ok(visual.includes("academicCardHtml") && !visual.includes("it.tone=") && !visual.includes("it.verdict="), "decorative only");
assert.ok(visual.includes("academicClashCount"), "reusable academic suggestion scoring in professor best times");
assert.ok(code.includes("var currentAcademic=academicClashCount(it,it.start)"), "best professor times account for academic clashes without changing send gate");
console.log("academic advice: prerequisites, cohorts, section alternatives, scope, privacy & non-blocking UI passed");
