/** جدول الأستاذ الكامل في المقترح: عائلة القسم تُرى بلا قاعة، وما لا يُكتب فيه للقراءة بسببٍ واضح. */
import { readFileSync } from "fs";
import { gridItem, keyOfRow, withFamilyScopes } from "../src/server/studyProposalEngine";

let failures = 0;
const check = (ok: unknown, label: string, detail?: unknown) => { if (ok) console.log(`  ok  ${label}`); else { failures += 1; console.error(`FAIL  ${label}`, detail ?? ""); } };
const read = (path: string) => readFileSync(path, "utf8");
const names = ["كلية التربية الأساسية - بنات", "كلية التربية الأساسية - بنين", "كلية التربية الأساسية - الجهراء - بنات", "كلية التربية الأساسية - الفحيحيل - بنات"];
const world: any = {
  colleges: names.map((AdCollegeName, index) => ({ AdCollegeId: index + 1, AdCollegeName })),
  sections: names.map((_, index) => ({ AdSectionId: index + 10, AdCollegeId: index + 1, AdSectionName: "قسم تكنولوجيا التعليم" })).concat({ AdSectionId: 99, AdCollegeId: 2, AdSectionName: "قسم آخر" } as any),
  catalog: { courseById: new Map([[5, { CourseName: "مقرر", CourseCode: "0109105" }]]) }, personIds: new Set([1]), instructor: { AdInstructorId: 1 },
};
withFamilyScopes(world, 1, 10);
check(world.familyScopes.size === 4, "4 مواقع في العائلة", [...world.familyScopes]);
const row = (college: number, section: number): any => ({ id: 1, AdCollegeId: college, AdSectionId: section, AdCourseId: 5, AdInstructorId: 1, SCode: "01", fsunday: true, fstarttime: "08:00", fendtime: "08:50", AdRoomCode: "901A", AdRoomHall: "301", buildingId: "b", roomId: "r" });
const deps: any = { canSee: (_: any, c: number) => c === 1, canWrite: (_: any, c: number) => c === 1 };
const req = { user: {} };
const mine = gridItem(row(1, 10), world, deps, req, { state: "current", key: keyOfRow(1) });
check(!mine.readOnlyReason && mine.place && mine.src?.roomCode === "901A", "موقعٌ يكتب فيه يُعدَّل");
const boys = gridItem(row(2, 11), world, deps, req, { state: "current", key: keyOfRow(1) });
check(!boys.outside && boys.courseName === "مقرر" && boys.collegeName === names[1], "موقع العائلة يظهر باسم المقرر والموقع");
check(/لا تملك التعديل/.test(boys.readOnlyReason || ""), "وسبب القراءة فقط واضح", boys.readOnlyReason);
check(!boys.place && !JSON.stringify(boys).includes("901A") && !boys.src?.roomId, "ولا قاعة تخرج لمن لا يرى ذلك النطاق");
check(gridItem(row(2, 99), world, deps, req, { state: "current", key: keyOfRow(1) }).outside === true, "خارج العائلة يبقى إشغالاً فقط");
check(!gridItem(row(2, 11), world, deps, null, { state: "current", key: keyOfRow(1) }).readOnlyReason, "لا سبب في مسار الأستاذ");
check(/!item\.readOnlyReason && item\.rowId > 0/.test(read("src/components/proposal/StudyProposalWorkspace.tsx")), "لا زر تعديل على ما لا يُكتب فيه");
check(/if \(oneClick\) void run\(true\)/.test(read("src/components/proposal/ProposalDialogs.tsx")) && /setOneClick\(true\)/.test(read("src/components/proposal/StudyProposalWorkspace.tsx")), "ضغطة واحدة من زر التثبيت وحده، والفتح من الوارد لا يكتب");
const routes = read("src/server/studyProposalRoutes.ts");
check(/reverse: true/.test(routes) && /canWriteScope\(req, scope\.c, scope\.s\)/.test(routes.slice(routes.indexOf("undo-commit"))), "التراجع عبر commitStudyProposal وبالصلاحيات نفسها");
check(/undo: undefined, undoable/.test(routes), "اللقطة لا تصل شاشة");
if (failures) { console.error(`${failures} failed`); process.exit(1); }
console.log("proposal-family-timetable-audit: all checks passed");
