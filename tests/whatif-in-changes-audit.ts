/**
 * ── «ماذا لو» على الموعد نفسه، لا بابٌ مستقلٌّ في القائمة (المرحلة 4) ────────────────
 *
 *   W1 المحرّك: «بديلٌ لموعدٍ بعينه» (moveRow) يعرض أماكنَ وأوقاتاً مختلفةً لذلك الموعد وحده،
 *      لا يزيد موانع الاعتماد، ولا يعدّ الموعدَ في مكانه حلّاً.
 *   W2 «تغييرات الجدول»: «جرّب بديلاً» على كل موعدٍ متغيّرٍ أو مضاف، لا على المحذوف ولا في
 *      أرشيفٍ أو فصلٍ مجمّد، ويفتح مكتب «ماذا لو» (WhatIfDesk) على الموعد نفسه.
 *   W3 القائمة: لا زرَّ «آلة الزمن»؛ ورابطها القديم يبقى: لبُناة الجدول إلى «مركز الذكاء ← جرّب ← ماذا لو»،
 *      ولغيرهم يُستبدل بـ«تغييرات الجدول».
 *   W4 لا وعدَ للعميد بباب: لا في التلميح ولا في التعليق، ولا صفحةَ مستقلةً بقيت.
 *   W5 اسمٌ واحد: «ماذا لو» في ما يراه المستخدم.
 */
import fs from "fs";
import type { AdCourse, AdInstructor, FSchedule } from "../src/types";
import { applyChanges, describeProblem, parseProblem, solveProblem, type TmContext } from "../src/utils/timeMachine";
import { findConflicts, isBlockingConflict } from "../src/utils/scheduleIntelligence";
import { placeholderInstructorIds } from "../src/utils/instructorIdentity";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};
const read = (file: string) => fs.readFileSync(file, "utf8");

console.log("W1 المحرّك");
{
  const halls = ["G23", "G24", "G25"].map((hall, i) => ({ code: "B1", hall, buildingId: "b1", roomId: `r${i + 1}`, capacity: 40, roomType: "قاعة تدريس" }));
  const course = (id: number, code: string, name: string): AdCourse => ({ AdCourseId: id, AdCollegeId: 1, AdSectionId: 1, CourseCode: code, CourseName: name, CourseCredit: 3, CourseHours: 3, MaxStudent: 35 } as any);
  const courses = [course(1, "121", "مدخل التقنيات"), course(2, "201", "تصميم تعليمي")];
  const person = (id: number, name: string): AdInstructor => ({ AdInstructorId: id, AdInstructorCivil: "", AdInstructorName: name, AdInstructorMobile: "99887766" } as any);
  const instructors = [person(11, "د. أحمد الكندري"), person(12, "د. سارة العتيبي"), person(99, "هيئة تدريسية")];
  let rev = 1;
  const row = (id: number, courseId: number, scode: string, teacher: number, days: string[], start: string, end: string, hallIndex: number): FSchedule => ({
    id, AdCollegeId: 1, AdSectionId: 1, AdTermId: 7, AdCourseId: courseId, AdCourseName: courses.find(c => c.AdCourseId === courseId)!.CourseName,
    SCode: scode, AdInstructorId: teacher,
    fsunday: days.includes("fsunday"), fmonday: days.includes("fmonday"), ftuesday: days.includes("ftuesday"), fwednesday: days.includes("fwednesday"), fthursday: days.includes("fthursday"),
    fstarttime: start, fendtime: end, AdRoomCode: "B1", AdRoomHall: halls[hallIndex].hall, buildingId: "b1", roomId: halls[hallIndex].roomId, locationStatus: "VERIFIED", rev: rev++,
  } as any);
  const rows = [
    row(1, 1, "501", 11, ["fsunday", "ftuesday"], "08:00", "09:15", 0),
    row(2, 2, "501", 12, ["fmonday", "fwednesday"], "09:30", "10:45", 1),
  ];
  const context: TmContext = { scope: { collegeId: 1, sectionId: 1, termId: 7 }, rows, outside: [], courses, instructors, halls, demand: {}, loadLimits: {}, canWrite: false } as any;
  const placeholders = placeholderInstructorIds(instructors);
  const blocking = (board: FSchedule[]) => findConflicts(board.filter(r => r.AdSectionId === 1), board, { placeholderInstructorIds: placeholders }).filter(isBlockingConflict).length;
  const problem = { kind: "moveRow" as const, rowId: 1 };
  const solutions = solveProblem(problem, rows, context);
  check(solutions.length >= 1, "W1 موعدٌ يملك بدائل: تُعرض له حلول", solutions.length);
  check(solutions.every(item => item.changes.length === 1 && item.changes[0].op === "move" && (item.changes[0] as any).rowId === 1), "W1 كلُّ حلٍّ يحرّك هذا الموعد وحده");
  check(solutions.every(item => blocking(applyChanges(rows, item.changes)) <= blocking(rows)), "W1 لا حلَّ يزيد موانع الاعتماد");
  check(solutions.every(item => item.satisfied), "W1 كلُّ حلٍّ يغيّر مكان الموعد فعلاً (ليس الموعد في مكانه)");
  check(describeProblem(problem, context).includes("مدخل التقنيات") && describeProblem(problem, context).includes("501"), "W1 العنوان يسمّي الموعد", describeProblem(problem, context));
  check(parseProblem("بديل لموعد", context) === null, "W1 الجملة الحرّة لا تُنتج moveRow (الباب الوحيد هو الزر)");
  check(solveProblem({ kind: "moveRow", rowId: 999 }, rows, context).length === 0, "W1 موعدٌ غير موجود: لا حلول ولا انهيار");
}

console.log("W2 تغييرات الجدول");
{
  const changes = read("src/components/ScheduleChanges.tsx"), sheet = read("src/components/TryAlternativeSheet.tsx"), machine = read("src/components/TimeMachine.tsx");
  check(/const canTry = tryable && !archive && !frozen;/.test(changes) && changes.includes("جرّب بديلاً"), "W2 الزرّ لا يظهر في أرشيفٍ ولا فصلٍ مجمّد");
  check(changes.includes('entry.kind !== "removed", `${entry.display.course}') && /rowExtras\(row\.scheduleId, true, "room", row\.changed,/.test(changes), "W2 الزرّ على المتغيّر والمضاف وحدهما، لا المحذوف ولا الثابت في «الجدول كامل»");
  check(changes.includes("<TryAlternativeSheet collegeId={scope.collegeId} sectionId={scope.sectionId} termId={termId} rowId={tryRow.scheduleId}"), "W2 الورقة على نطاق التقرير نفسه وفصله");
  check(sheet.includes("<WhatIfDesk collegeId={collegeId} sectionId={sectionId} termId={termId} focusRowId={rowId} />") && sheet.includes("useDialogDismiss(true, onClose)"), "W2 الورقة تحمل المكتب نفسه وتُغلق بـEscape");
  check(/focusRowId\?: number/.test(machine) && /run\(\{ kind: "moveRow", rowId: focusRowId \}\)/.test(machine) && /useState<Mode>\(focusRowId \? "emergency" : "suggest"\)/.test(machine), "W2 المكتب يفتح على «طارئ» ببدائل الموعد");
  check(read("src/components/ScenarioWorkbench.tsx").includes("عرض ومحاكاة — الاعتماد لمن يكتب الجدول"), "W2 لغير الكاتب: «عرض ومحاكاة — الاعتماد لمن يكتب الجدول»");
  check(!/TryAlternativeSheet/.test(read("src/components/IntelligenceWorkspace.tsx")) && /<WhatIfDesk collegeId=\{collegeId\}/.test(read("src/components/IntelligenceWorkspace.tsx")), "W2 بابُ بُناة الجدول باقٍ: «جرّب ← ماذا لو» في المركز");
}

console.log("W3 القائمة والرابط القديم");
{
  const app = read("src/App.tsx");
  check(!/view="timeMachine"/.test(app) && !/label="آلة الزمن"/.test(app), "W3 لا زرّ «آلة الزمن» في القائمة");
  check(/timeMachine: "\/FSchedule\/TimeMachine"/.test(app), "W3 الرابط القديم مسجّلٌ ويعمل");
  check(/if \(hasPerm\(7\)\) return <IntelligenceWorkspace key="intelligence-whatif"[^>]*initialTab="whatif" \/>;/.test(app), "W3 لبُناة الجدول: «ماذا لو» في المركز");
  check(/activeView !== "timeMachine" \|\| !user \|\| permissions\.includes\(7\) \|\| !opensChangesScreen\(sessionRole\)/.test(app) && /replaceState\(\{\}, "", pathByView\.scheduleChanges\);\s*setActiveView\("scheduleChanges"\)/.test(app), "W3 لغيرهم: يُستبدل في التاريخ بـ«تغييرات الجدول»");
  check(!/safeLazy\(\(\) => import\("\.\/components\/TimeMachine"\)\)/.test(app) && !/export default function TimeMachine\(/.test(read("src/components/TimeMachine.tsx")), "W3 لا صفحةَ مستقلة بقيت");
}

console.log("W4 لا وعدَ للعميد");
{
  const app = read("src/App.tsx"), bench = read("src/components/ScenarioWorkbench.tsx"), machine = read("src/components/TimeMachine.tsx");
  check(!/العميد/.test(app.slice(app.indexOf('case "timeMachine"'), app.indexOf('case "scheduleChanges"'))), "W4 لا ذكرَ للعميد عند مسار آلة الزمن في التطبيق");
  check(!/title="للعرض لرئيس القسم والعميد"/.test(bench) && /title="للعرض لرئيس القسم"/.test(bench), "W4 تلميح «شارك للعرض» بلا العميد");
  check(!/والعميد/.test(machine), "W4 لا وعدَ في تعليق المكتب");
}

console.log("W5 اسمٌ واحد");
{
  const forecast = read("src/components/PredictiveInsightPanel.tsx"), tours = read("src/guide/tour/tours.ts"), guide = read("src/guide/smartGuide.ts");
  check(forecast.includes("جرّب الحلول في «ماذا لو»") && !/title="جرّب الحلول في آلة الزمن"/.test(forecast), "W5 تلميح التنبؤ يقول «ماذا لو»");
  check(tours.includes('timeMachine: "ماذا لو"') && /id:"page\.timeMachine", title:"ماذا لو"/.test(guide), "W5 المرشد والجولات تقول «ماذا لو»");
}

console.log(`\nWhat-if in changes audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
