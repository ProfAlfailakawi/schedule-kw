import fs from "node:fs";
import { planTaConversion, isTrainingAssistant, readTaTargets, chosenTaTargets, taTargetsProblem, taConversionMoves, taTargetsQuery } from "../src/utils/taConversion";
import { readServerSource } from "./helpers/serverSource.mjs";

let checks = 0;
function ok(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  checks++;
}
const people: any[] = [
  { AdInstructorId: 1, AdInstructorName: "مدرب 1", AdInstructorCategory: "ta" },
  { AdInstructorId: 2, AdInstructorName: "دكتور 2" },
  { AdInstructorId: 3, AdInstructorName: "مدرب 3", AdInstructorCategory: "ta" },
];
const rows: any[] = [
  { id: 1, AdInstructorId: 1, AdCourseId: 100, SCode: "1", rev: 2 },
  { id: 2, AdInstructorId: 1, AdCourseId: 100, SCode: "1" },
  { id: 3, AdInstructorId: 1, AdCourseId: 100, SCode: "2" },
  { id: 4, AdInstructorId: 2, AdCourseId: 200, SCode: "1" },
  { id: 5, AdInstructorId: 3, AdCourseId: 300, SCode: "1" },
  { id: 6, AdInstructorId: 0, AdCourseId: 400, SCode: "1" },
];
const plan = planTaConversion(rows, people);
ok(isTrainingAssistant(people[0]) && !isTrainingAssistant(people[1]), "only explicitly tagged TA");
ok(plan.affected.length === 4, "counts TA appointments only");
ok(plan.people.length === 2 && plan.sections === 3, "counts unique course sections");
ok(plan.people.find(p => p.id === 1)?.appointments === 3, "counts multiple meetings of a section");
ok(rows[0].AdInstructorId === 1 && rows[1].AdInstructorId === 1, "preview cannot mutate rows");
ok(planTaConversion([], people).affected.length === 0, "blank new term is safe");
ok(planTaConversion(rows, people.filter(p => p.AdInstructorId === 2)).affected.length === 0, "no TA classification means no changes");
const read = (p: string) => fs.readFileSync(p, "utf8");
const server = readServerSource();
const repo = read("src/db/repository.ts");
const staff = read("src/components/Instructors.tsx");
const schedule = read("src/components/Schedules.tsx");
const panel = read("src/components/TAConversionPanel.tsx");
ok(server.includes('app.get("/api/schedules/ta-conversion"') && server.includes('app.post("/api/schedules/ta-conversion"'), "preview and commit routes exist");
ok(server.includes('termIsFrozen(termId, terms') && server.includes('scheduleLockRefusal(req, collegeId, sectionId, termId)'), "term and approval protection");
ok(server.includes('req.body.previewKey !== state.previewKey') && server.includes('confirmTokens(req).has("ta-conversion")'), "fresh preview and explicit confirmation");
ok(server.includes("Repository.moveSchedulesBatch(moves.map") && server.includes("expectedRev: Number(row.rev || 0)"), "transactional atomic revision checks");
ok(server.includes('captureScopeVersion(req, collegeId, sectionId, termId, "قبل تحويل') && server.includes("recordVersionAfter(before,"), "snapshot and restore baseline");
ok(repo.includes('AdInstructorCategory: "ta" as const') && server.includes('AdInstructorCategory === "ta"'), "TA category saved");
ok(staff.includes("setCategory(") && staff.includes("AdInstructorCategory: category || null"), "staff category chosen and saved");
ok(schedule.includes("<TAConversionPanel") && schedule.includes("تحويل هيئة التدريب"), "tool placed in More menu");
ok(panel.includes("applyWithOverwriteConfirm") && panel.includes("visualConfirm"), "safe undo and confirm");

/* ── الهدف من عائلة القسم ── */
const placeholderSet = new Set([90]);
ok(JSON.stringify(readTaTargets("1:5,3:0,x:2,4:-1")) === JSON.stringify({ "1": 5, "3": 0 }), "targets read from query text, junk ignored");
ok(JSON.stringify(readTaTargets({ 1: 5, 3: "7", bad: 2 })) === JSON.stringify({ "1": 5, "3": 7 }), "targets read from body");
ok(chosenTaTargets({ "1": 0, "3": 90 }, placeholderSet).size === 0, "default and placeholder are not a choice");
ok(chosenTaTargets({ "1": 1 }).size === 0, "a TA is never its own target");
const chosen = chosenTaTargets({ "1": 2, "3": 0 }, placeholderSet);
ok(taTargetsProblem(chosen, new Set([1, 3]), new Set([2])) === null, "family target accepted");
ok(/ليس من أساتذة هذا القسم/.test(String(taTargetsProblem(new Map([[1, 77]]), new Set([1, 3]), new Set([2]), () => "غريب"))), "outsider rejected in Arabic");
ok(/هيئة التدريب/.test(String(taTargetsProblem(new Map([[9, 2]]), new Set([1, 3]), new Set([2])))), "non-TA key rejected");
const moves = taConversionMoves(plan.affected, chosen, 90);
ok(moves.filter(m => m.to === 2).length === 3 && moves.filter(m => m.to === 90).length === 1, "chosen TA to the teacher, others stay on placeholder");
ok(taConversionMoves(plan.affected, new Map(), 90).every(m => m.to === 90), "doing nothing keeps today's result");
ok(taTargetsQuery({ 1: 2, 3: 0 }) === "1:2", "client sends only real choices");
const family = read("src/server/core/departmentPickerFamily.ts");
const picker = read("src/components/InstructorPicker.tsx");
ok(server.includes("taTargetsProblem(chosen,") && server.includes("res.status(400).json({ error: targetProblem })"), "server validates every target");
ok(server.includes("departmentPickerFamily(collegeId, sectionId, termId"), "server uses the picker family");
ok(family.includes("getDepartmentFaculty") && family.includes("readLiveVisitingRoster") && family.includes("isTrainingAssistant"), "family = department faculty + term visiting, minus TA");
ok(panel.includes("<InstructorPicker") && panel.includes("onlyIds={preview.familyIds") && panel.includes('emptyLabel="هيئة تدريسية"') && panel.includes("canCreate={false}"), "panel reuses the editor picker");
ok(picker.includes("onlyIds?: Iterable<number>") && picker.includes("outsideOnly(person)"), "picker can be limited to the family");
ok(panel.includes("تعارض") && panel.includes("فوق النصاب"), "soft warnings shown");
console.log("TA conversion: " + checks + " checks passed");
