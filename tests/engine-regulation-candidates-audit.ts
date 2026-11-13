/**
 * ── المحرّكات تقترح ما لا يسأله الحفظُ استثناءً (المالك 2026-11-13) ─────────────
 *
 * كلُّ موضعٍ يُخرجه محرّكٌ مقترِح يمرّ بالحَكَم الذي يقرؤه الحفظ (regulationExceptionIssues): بدايةٌ على
 * سُلّم م.7/8، وطولٌ معتمد، وأيامٌ من مكتبة الأنماط. والسُّلّمُ والمكتبة من المولّد الواحد (regulationCandidates)
 * لا من جداول منسوخة في المحرّكات.
 */
import { readFileSync } from "fs";
import type { AdCourse, AdInstructor, FSchedule } from "../src/types";
import { regulationExceptionIssues } from "../src/utils/regulationException";
import {
  regulationCandidates, regulationDaySwaps, regulationLengthFor, regulationPlacementIssues, regulationShapes, regulationStarts,
} from "../src/utils/regulationCandidates";
import { DAY_KEYS, daysFitLibrary, lectureLengthProblem, type DayKey } from "../src/utils/scheduleRegulations";
import { solveProblem, suggestPlacements, type TmContext } from "../src/utils/timeMachine";
import { findRepairChain } from "../src/utils/repairChain";
import { activeDays, autoScheduleProposal, conflictSolutions } from "../src/utils/scheduleIntelligence";
import { simulatePatternConversion } from "../src/utils/smartSuggestions";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`  ✓ ${label}`); } else { failed++; console.log(`  ✗ ${label}`, detail === undefined ? "" : JSON.stringify(detail).slice(0, 500)); }
};
const read = (path: string) => readFileSync(path, "utf8");
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** ما يقوله الحفظُ لهذا الموضع: الطولُ والسُّلّم، ومعهما النمط. */
const saveSays = (days: readonly DayKey[], start: string, end: string, hours: number) => {
  const row: any = { ...Object.fromEntries(DAY_KEYS.map(day => [day, days.includes(day)])), fstarttime: start, fendtime: end };
  const issues = regulationExceptionIssues({ row, week: [], courseHours: hours, sequenceChanged: false })
    .filter(issue => issue.rule === "lecture-length" || issue.rule === "start-ladder").map(issue => issue.text);
  if (daysFitLibrary(hours, days, days.length > 1) === false) issues.push("ليست نمطاً معتمداً");
  return issues;
};

console.log("١) المولّدُ الواحد: كلُّ مرشّحٍ يمرّ بالحفظ");
for (const hours of [1, 2, 3, 4, 5]) {
  const all = regulationCandidates(hours);
  const bad = all.filter(item => saveSays(item.days, clock(item.start), clock(item.end), hours).length);
  check(all.length > 0 && !bad.length, `${hours} ساعات: ${all.length} مرشّحاً بلا ورقة استثناء`, bad.slice(0, 3));
}
check(regulationStarts(["fsunday"], 50).map(clock).slice(0, 3).join() === "08:00,09:00,10:00", "الأحد على رأس الساعة");
check(regulationStarts(["fmonday", "fwednesday"], 80).map(clock).slice(0, 5).join() === "08:00,09:30,11:00,12:30,14:00", "الاثنين والأربعاء 8:00 ثم 9:30…");
check(!regulationStarts(["fsunday", "ftuesday", "fthursday"], 50).map(clock).includes("09:30"), "لا 9:30 على الأحد والثلاثاء والخميس");
check(regulationStarts(["fsunday"], 50, { start: 7 * 60, end: 21 * 60 })[0] === 8 * 60, "لا بدايةَ قبل الثامنة وإن اتّسع الدوام");
const shapes3 = regulationShapes(3);
check(!shapes3.some(shape => shape.days.join() === "fmonday,fthursday" || shape.days.join() === "fsunday,fthursday"), "لا الاثنين·الخميس ولا الأحد·الخميس");
check(DAY_KEYS.every(day => shapes3.some(shape => shape.days.length === 1 && shape.days[0] === day && shape.minutes === 170)), "كتلةُ اليوم الواحد على كل يوم");
check(regulationLengthFor(["fsunday", "ftuesday", "fthursday"], 3, 80) === 50, "الأحد·الثلاثاء·الخميس لثلاث ساعات: 50 لا 80");
check(regulationLengthFor(["fsunday"], 6, 80) === 50 || regulationLengthFor(["fsunday"], 6, 80) === 110, "ساعاتٌ بلا نمط: طولٌ لائحيّ لا ثمانون على الأحد", regulationLengthFor(["fsunday"], 6, 80));
check(regulationDaySwaps(3, ["fmonday", "fwednesday"], "fmonday", 80).every(shape => !shape.days.includes("fmonday") && !saveSays(shape.days, "08:00", clock(480 + shape.minutes), 3).length), "النقلُ عن الاثنين يأخذ نمطاً وطولاً من المكتبة");
check(regulationPlacementIssues({ days: ["fsunday"], start: "09:30", end: "10:20", hours: 3 }).some(issue => issue.rule === "start-ladder"), "الحَكَمُ يرى 9:30 على الأحد");

console.log("٢) طولُ نمط المكتبة لا يُسأل عنه استثناءً");
check(lectureLengthProblem({ fsunday: true, ftuesday: true, fstarttime: "08:00", fendtime: "09:20" }, 3) === null, "الأحد·الثلاثاء 80/80 لثلاث ساعات");
check(lectureLengthProblem({ fmonday: true, fwednesday: true, fstarttime: "08:00", fendtime: "08:50" }, 2) === null, "الاثنين·الأربعاء 50/50 لساعتين");
check(lectureLengthProblem({ fmonday: true, fwednesday: true, fstarttime: "08:00", fendtime: "09:50" }, 4) === null, "الاثنين·الأربعاء 110/110 لأربع");
check(lectureLengthProblem({ fsunday: true, ftuesday: true, fstarttime: "08:00", fendtime: "09:20" }, 4) !== null, "80 لأربع ساعات تبقى مخالفة");

const row = (id: number, courseId: number, instructor: number, days: DayKey[], start: string, end: string, hall: string, scode = "01"): FSchedule => ({
  id, AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdCourseId: courseId, AdCourseName: `c${courseId}`, SCode: scode, AdInstructorId: instructor,
  fsunday: days.includes("fsunday"), fmonday: days.includes("fmonday"), ftuesday: days.includes("ftuesday"), fwednesday: days.includes("fwednesday"), fthursday: days.includes("fthursday"),
  fstarttime: start, fendtime: end, AdRoomCode: "B1", AdRoomHall: hall, roomId: `r-${hall}`, buildingId: "b1", locationStatus: "VERIFIED",
} as FSchedule);
const course = (id: number, hours: number): AdCourse => ({ AdCourseId: id, AdCollegeId: 1, AdSectionId: 1, CourseCode: String(100 + id), CourseName: `مقرر ${id}`, CourseCredit: hours, CourseHours: hours, MaxStudent: 20 });
const person = (id: number, name: string): AdInstructor => ({ AdInstructorId: id, AdInstructorName: name } as AdInstructor);
const rows = [
  row(1, 1, 10, ["fsunday", "ftuesday", "fthursday"], "08:00", "08:50", "101"),
  row(2, 2, 10, ["fmonday", "fwednesday"], "09:30", "10:50", "101"),
  row(3, 3, 11, ["fsunday", "ftuesday"], "10:00", "11:20", "102"),
  row(4, 4, 11, ["fmonday", "fwednesday"], "08:00", "08:50", "102"),
  row(5, 1, 12, ["fsunday", "ftuesday", "fthursday"], "08:00", "08:50", "101", "02"),
];
const courses = [course(1, 3), course(2, 3), course(3, 3), course(4, 2)];
const hoursOf = (id: number) => Number(courses.find(item => item.AdCourseId === id)?.CourseHours || 0);
const context: TmContext = {
  scope: { collegeId: 1, sectionId: 1, termId: 1 },
  rows, outside: [], courses,
  instructors: [person(10, "د. أحمد"), person(11, "د. سارة"), person(12, "د. خالد"), person(13, "د. منى")],
  halls: ["101", "102", "103"].map(hall => ({ code: "B1", hall, roomId: `r-${hall}`, buildingId: "b1", capacity: 40, roomType: "قاعة تدريسية" })),
  demand: { "1": { wanted: 60, seated: 20, capacity: 40, sections: 2 } },
  loadLimits: { "10": 15, "11": 15, "12": 15, "13": 15 },
  canWrite: true,
} as any;
const rowOk = (item: FSchedule, label: string) => {
  const says = saveSays(activeDays(item) as DayKey[], String(item.fstarttime), String(item.fendtime), hoursOf(Number(item.AdCourseId)));
  check(!says.length, label, { days: activeDays(item), start: item.fstarttime, end: item.fendtime, says });
};

console.log("٣) آلةُ الزمن: شعبةٌ جديدة، وتفريغُ يوم، وغيابُ أستاذ");
for (const courseId of [1, 2, 3, 4]) {
  const list = suggestPlacements(rows, courseId, context, { max: 6 });
  const bad = list.filter(item => saveSays(item.days as DayKey[], item.start, item.end, hoursOf(courseId)).length);
  check(list.length > 0 && !bad.length, `اقتراحُ موضعٍ للمقرر ${courseId}: ${list.length} بلا استثناء`, bad);
}
for (const problem of [{ kind: "clearDay", day: "fsunday" }, { kind: "clearDay", day: "fmonday" }, { kind: "teacherOff", instructorId: 11, day: "fmonday" }, { kind: "roomDown", hall: context.halls[0], day: null }] as any[]) {
  const solutions = solveProblem(problem, rows, context, 5);
  const moved = solutions.flatMap(solution => solution.changes).filter((change: any) => change.op === "move" && change.start);
  const bad = moved.filter((change: any) => {
    const was = rows.find(item => Number(item.id) === change.rowId)!;
    return saveSays((change.days || activeDays(was)) as DayKey[], change.start, change.end, hoursOf(Number(was.AdCourseId))).length;
  });
  check(!bad.length, `${problem.kind}${problem.day ? ` ${problem.day}` : ""}: ${moved.length} نقلاً بلا استثناء`, bad);
}

console.log("٤) الإصلاحُ والتحسين والطوارئ");
{
  const clash = [...rows, row(9, 3, 10, ["fsunday", "ftuesday"], "08:00", "09:20", "103")];
  const chain = findRepairChain(clash[5], clash);
  check(Boolean(chain), "سلسلةُ إصلاحٍ لتعارض الأستاذ");
  for (const move of chain?.moves || []) {
    check(move.days.length === activeDays(move.before).length, `الإصلاحُ يُبقي أيام الصفّ ${move.id} (${move.days.join("·")})`);
    rowOk({ ...move.before, ...Object.fromEntries(DAY_KEYS.map(day => [day, move.days.includes(day)])), fstarttime: move.start, fendtime: move.end } as FSchedule, `نقلُ الإصلاح ${move.id} ${move.start}`);
  }
  for (const option of conflictSolutions(clash[5], clash, 5)) rowOk({ ...clash[5], fstarttime: option.start, fendtime: option.end } as FSchedule, `حلُّ التعارض ${option.start}`);
  const proposal = autoScheduleProposal(clash, clash);
  proposal.rows.filter((item, index) => item.fstarttime !== clash[index].fstarttime).forEach(item => rowOk(item, `ضغطُ الفجوات ${item.id} ${item.fstarttime}`));
}

console.log("٥) «تحويل النمط» يأخذ البداية من المولّد نفسه");
{
  const result = simulatePatternConversion(context, [3], ["ftuesday", "fthursday"]);
  const item = result.rows?.[0] as any;
  const after = String(item?.after || "");
  const match = /(\d\d:\d\d)–(\d\d:\d\d)/.exec(after);
  check(Boolean(match) && !saveSays(["ftuesday", "fthursday"], match![1], match![2], 3).length, "الثلاثاء·الخميس على السُّلّم بطول المكتبة", after);
}

console.log("٦) لا جداول سُلّمٍ منسوخة في المحرّكات");
{
  const engines = ["src/utils/timeMachine.ts", "src/utils/repairChain.ts", "src/utils/scheduleIntelligence.ts", "src/utils/livingSchedule.ts", "src/utils/scheduleInnovation.ts", "src/utils/sectionOpening.ts", "src/server/studyProposalEngine.ts", "src/server/routes/scheduleToolsRoutes.ts", "src/utils/smartSuggestions.ts", "src/utils/instructorRequestVerdict.ts"];
  for (const file of engines) check(/regulationCandidates/.test(read(file)), `${file} يقرأ المولّد الواحد`);
  check(!/start \+= 30|start \+= 10\b|start \+= STEP/.test(read("src/utils/timeMachine.ts") + read("src/server/studyProposalEngine.ts") + read("src/server/routes/scheduleToolsRoutes.ts")), "لا خطوة نصف ساعة ولا عشر دقائق في البدايات");
}

console.log(`\n${passed} ✓ · ${failed} ✗`);
if (failed) process.exit(1);
