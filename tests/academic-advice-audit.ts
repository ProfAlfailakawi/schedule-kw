import { strict as assert } from "node:assert";
import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AcademicDecisionLabPanel from "../src/components/AcademicDecisionLabPanel";
import { analyseAcademicAdvice, mandatoryPrecedes, type AcademicPlanView } from "../src/utils/academicAdvisory";
import { buildAcademicDecisionLab, feasibleAcademicBundle } from "../src/utils/academicDecisionLab";
import { buildAcademicDecisionLabTrainingPreview } from "../src/utils/academicDecisionLabDemo";
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

const bothMorning = analyseAcademicAdvice({ ...base, profiles: [1,2,3].map(i => ({
  ...profile(i,[2,3],[1]), wishes: { ...profile(i,[2,3],[1]).wishes!, constraints: { noAfternoon: true } },
})), rows: [slot(2, "501", "14:00", "15:00"), slot(3, "501", "14:00", "15:00")] });
assert.ok(bothMorning.timePreferences.some(p => p.courseId === 2 && p.period === "morning" && p.wanted === 3),
  "an eligible no-afternoon cohort merits a real morning opportunity");
const allOverlapping = analyseAcademicAdvice({ ...base,
  profiles: [1,2,3].map(i => profile(i,[2,3],[1])),
  rows: [slot(2,"501","08:00","09:00"),slot(3,"501","08:00","09:00")] });
const critical = allOverlapping.pairs.find(p => p.a === 2 && p.b === 3);
assert.equal(critical?.unavoidable, true, "no existing non-overlapping section combination");
assert.equal(critical?.hasAlternative, false);
assert.equal(eligible.pairs.find(p => p.a === 2 && p.b === 3)?.unavoidable, false,
  "available non-overlapping sections must be distinguished from unavoidable overlaps");
const enoughChoice = analyseAcademicAdvice({ ...base,
  profiles: [1,2,3].map(i => ({ ...profile(i,[2,3],[1]),
    wishes: { ...profile(i,[2,3],[1]).wishes!, constraints: { noMorning: true } } })),
  rows: [...base.rows, slot(2, "502", "14:00", "15:00")] });
assert.ok(!enoughChoice.timePreferences.some(p => p.courseId === 2 && p.period === "afternoon"),
  "a fully fitting existing section satisfies the constraint (do not recommend extra supply)");
const adviceUI = fs.readFileSync("src/components/AcademicAdvicePanel.tsx","utf8");
assert.ok(adviceUI.includes("<details") && adviceUI.includes("defaultOpen={demo}"),
  "academic opportunities should be condensed dropdown cards and expanded in the demo");
const demoSeed = fs.readFileSync("src/server/demoRadarSeed.ts", "utf8");
assert.ok(demoSeed.includes("Academic-opportunity showcase") && demoSeed.includes("Repository.isDemoRequest()"),
  "demo must use eligible, isolated fictional students rather than invented UI counts");


// Digital twin: one section changes, no other published row is mutated.
const labRows = [
  { ...slot(2,"501","08:00","09:00"), AdInstructorId:10, roomId:"room-a" },
  { ...slot(3,"501","08:00","09:00"), AdInstructorId:20, roomId:"room-b" },
];
const labInput={...base,rows:labRows,profiles:[1,2,3,4].map(i=>profile(i,[2,3],[1]))};
const labBase=analyseAcademicAdvice(labInput);
const lab=buildAcademicDecisionLab(labInput,labBase);
assert.equal(lab.nonBlocking,true,"scenario never implies changing source schedule");
assert.ok(lab.scenarios.length>0,"eligible fictional cohort produces an actual simulated alternative");
const win=lab.scenarios.find(s=>s.before==="08:00" && s.after==="09:30");
assert.ok(win, "safe alternative found from existing room/instructor schedule");
assert.equal(win.beforeFeasible,0,"full wished bundle is impossible before shift");
assert.equal(win.afterFeasible,4,"full wished bundle becomes feasible, not just a pairwise score");
assert.equal(win.rippleImproved,1,"unavoidable pairwise overlap is removed");
assert.equal(win.resources,"checked","both primary resources verified against other term rows");
assert.deepEqual(labRows.map(row=>row.fstarttime),["08:00","08:00"],"simulation does not mutate source");

// Two independent bottlenecks: the combined plan must improve more distinct
// student bundles than either move alone (no summing duplicate student counts).
const secondGroup=[
  { ...slot(5,"501","08:00","09:00"),AdInstructorId:30,roomId:"room-c" },
  { ...slot(7,"501","08:00","09:00"),AdInstructorId:40,roomId:"room-d" },
];
const chainInput={...labInput,rows:[...labRows,...secondGroup],
  profiles:[...labInput.profiles,...[5,6,7,8].map(i=>profile(i,[5,7],[]))]};
const chainLab=buildAcademicDecisionLab(chainInput,analyseAcademicAdvice(chainInput));
assert.ok(chainLab.chain,"independent bottlenecks produce a genuine two-step domino alternative");
assert.equal(chainLab.chain?.gain,8,"combined effect counts distinct eligible students, not pairwise overlaps");
const missingCourseInput={...base,rows:[slot(2,"501","08:00","09:00")],
  profiles:[1,2,3,4].map(i=>profile(i,[4],[2]))};
const watchLab=buildAcademicDecisionLab(missingCourseInput,analyseAcademicAdvice(missingCourseInput));
assert.ok(watchLab.graduationWatch?.some(w=>w.courseId===4 && !w.offered && w.demand===4),
  "rescue flags a genuinely desired unoffered prerequisite-dependent course without promising graduation dates");

// Demo regression: every showcased output MUST be calculated by the same
// production engine on isolated fictional courses, never invented UI numbers.
const training = buildAcademicDecisionLabTrainingPreview();
assert.equal(training.demoShowcase, true, "demo lesson is prominently distinguished from actual section advice");
assert.ok(training.scenarios.length >= 2, "the six-tool demo includes interactive what-if scenarios");
assert.ok(training.scenarios.some(s => s.beforeFeasible === 0 && s.afterFeasible >= 3 && s.gain >= 3),
  "whole-bundle digital twin and before-after have a genuine calculated improvement");
assert.ok(training.chain && training.chain.gain > Math.max(...training.scenarios.map(s => s.gain)),
  "domino tool has a real two-step, non-duplicated calculation");
assert.ok(training.graduationWatch?.some(w => !w.offered && w.downstream > 0 && w.demand >= 3),
  "graduation rescue has an actually eligible prerequisite bottleneck");
assert.ok(training.scenarios.some(s => s.facultyShiftMinutes > 0 && s.resources === "checked"),
  "teacher and room balance measures are computed rather than decorative labels");
assert.ok(training.scenarios.every(s => s.reasons.length && s.cautions.length && s.confidence),
  "every preview carries transparent reasons and confidence");
const sixUi = fs.readFileSync("src/components/AcademicDecisionLabPanel.tsx", "utf8");
for (const name of ["التوأم الأكاديمي", "قبل / بعد", "تأثير الدومينو",
  "إنقاذ المسار", "التوازن العادل", "الثقة والتفسير"]) {
  assert.ok(sixUi.includes(name), "all six named tools must be discoverable: " + name);
}
assert.ok(sixUi.includes("setFeature(item.id)") && sixUi.includes("adl-feature"),
  "all six tiles really switch visible content, not static placeholder labels");
assert.ok(sixUi.includes("lab.demoShowcase") && sixUi.includes("حالة افتراضية منفصلة"),
  "fictional training numbers cannot be represented as real university data");
// Render the actual React component, not merely search for JSX labels.
const html = renderToStaticMarkup(createElement(AcademicDecisionLabPanel, {
  lab: training, demo: true, onRefresh: () => {}, refreshing: false,
}));
assert.equal((html.match(/class="adl-feature(?: adl-feature-active)?"/g) || []).length, 6,
  "actual HTML must contain six independently clickable feature buttons");
assert.ok(html.includes("الموعد الحالي") && html.includes("الموعد المقترح"),
  "initial visual must render the complete before/after calculation");
assert.ok(html.includes("حالة افتراضية منفصلة"),
  "the screenshot must identify fictional instructional results without ambiguity");
const emptyHtml = renderToStaticMarkup(createElement(AcademicDecisionLabPanel, {
  lab: privateLabForVisibility(), demo: false, onRefresh: () => {}, refreshing: false,
}));
assert.equal((emptyHtml.match(/class="adl-feature(?: adl-feature-active)?"/g) || []).length, 6,
  "no actual scenarios must never hide the six analysis tools");
function privateLabForVisibility() {
  return { ...training, demoShowcase: false, scenarios: [], graduationWatch: [], chain: undefined };
}
// Regression: the previously visible live course list must survive alongside
// the separate six-feature lesson, even if there are no live what-if scenarios.
const liveWatchMarkup = renderToStaticMarkup(createElement(AcademicDecisionLabPanel, {
  lab: { ...training, demoShowcase: false, scenarios: [], chain: undefined,
    graduationWatch: [{ courseId: 501, courseName: "مقرر أصيل من القسم", offered: false,
      downstream: 2, demand: 5, nearGraduation: 0 }] },
  demo: false, onRefresh: () => {}, refreshing: false,
}));
assert.ok(liveWatchMarkup.includes("مقررات المسار الأكاديمي") &&
  liveWatchMarkup.includes("مقرر أصيل من القسم") &&
  liveWatchMarkup.includes("هذه مقررات القسم الفعلية"),
  "restored real-course list stays visible even when the calculated preview is selected");
assert.ok(liveWatchMarkup.includes("تجربة الأدوات الست") &&
  liveWatchMarkup.includes("بيانات القسم الفعلية") &&
  liveWatchMarkup.includes("حالة افتراضية منفصلة") &&
  liveWatchMarkup.includes("الموعد المقترح"),
  "the six tools must show the separately marked training calculation, not six empty states");
assert.equal((liveWatchMarkup.match(/class="adl-feature(?: adl-feature-active)?"/g) || []).length, 6,
  "all six interactive tools stay visible beside the actual course list");
const adviceOrder = fs.readFileSync("src/components/AcademicAdvicePanel.tsx", "utf8");
assert.ok(adviceOrder.indexOf("فرص المقررات المكتشفة") < adviceOrder.indexOf("<AcademicDecisionLabPanel"),
  "course opportunities appear BEFORE the full academic lab, so they are not buried below it");
assert.ok(adviceOrder.includes("relevant.slice(0, compact ? 3 : relevant.length)") &&
  adviceOrder.includes("periods.slice(0, compact ? 2 : periods.length)"),
  "the full view must list all opportunities included in the visible counter");

const apiSource = fs.readFileSync("src/server/academicAdvisoryData.ts","utf8");
assert.ok(apiSource.includes("decisionLab = buildAcademicDecisionLab(input, reading)") &&
  !apiSource.includes("decisionLab = demoRequest") &&
  !apiSource.includes("buildAcademicDecisionLabTrainingPreview"),
  "scoped API must always return genuine curriculum/watch results, never the fictional tutorial");

const privateLab=buildAcademicDecisionLab({...labInput,profiles:[profile(1,[2,3],[1])]},
  analyseAcademicAdvice({...labInput,profiles:[profile(1,[2,3],[1])]}));
assert.equal(privateLab.scenarios.length,0,"do not expose one or two students through what-if comparisons");
const roomBlock={...slot(5,"501","09:30","10:30"),AdInstructorId:25,roomId:"room-a"};
const withRoomBlock={...labInput,rows:[...labRows,roomBlock]};
const blockedLab=buildAcademicDecisionLab(withRoomBlock,analyseAcademicAdvice(withRoomBlock));
assert.ok(!blockedLab.scenarios.some(s=>s.courseId===2 && s.after==="09:30"),"a shared room conflict cannot be advertised as a viable opportunity");
const noBundle=new Map<number,any>([[2,[{slots:[{day:"fsunday",start:"08:00",end:"09:00"}]}]],[3,[{slots:[{day:"fsunday",start:"08:00",end:"09:00"}]}]]]);
assert.equal(feasibleAcademicBundle({courses:[2,3],constraints:{}},noBundle),false,"full multi-course bundle backtracking");
assert.equal(feasibleAcademicBundle({courses:[2],constraints:{noMorning:true}},noBundle),false,"student time restriction blocks inappropriate slots");
const labUI=fs.readFileSync("src/components/AcademicDecisionLabPanel.tsx","utf8");
assert.ok(labUI.includes("adl-compare") && labUI.includes("لماذا هذا الموعد؟") && labUI.includes("البيانات والحدود"),
  "visual twin offers infographic comparison, optional reasons and uncertainty");
assert.ok(labUI.includes("onRefresh") && !labUI.includes("onApply"),"preview remains refreshable and never applies itself");

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
assert.ok(!code.includes('conflict.type === "room" || conflict.type === "cohort")) continue;'), "academic cohort overlap cannot hide otherwise available offered sections from the professor");
assert.ok(code.includes("const allowedOptions = await instructorRequestCourseOptions(request);"), "add-new-course card may also show relevant recommendations");
console.log("academic advice: prerequisites, cohorts, section alternatives, scope, privacy & non-blocking UI passed");
