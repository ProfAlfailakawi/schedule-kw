import fs from "node:fs";
import { planTaConversion, isTrainingAssistant } from "../src/utils/taConversion";

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
const server = read("server.ts");
const repo = read("src/db/repository.ts");
const staff = read("src/components/Instructors.tsx");
const schedule = read("src/components/Schedules.tsx");
const panel = read("src/components/TAConversionPanel.tsx");
ok(server.includes('app.get("/api/schedules/ta-conversion"') && server.includes('app.post("/api/schedules/ta-conversion"'), "preview and commit routes exist");
ok(server.includes('termIsFrozen(termId, terms') && server.includes('scheduleLockRefusal(req, collegeId, sectionId, termId)'), "term and approval protection");
ok(server.includes('req.body.previewKey !== state.previewKey') && server.includes('confirmTokens(req).has("ta-conversion")'), "fresh preview and explicit confirmation");
ok(server.includes("Repository.moveSchedulesBatch(affected.map") && server.includes("expectedRev: Number(row.rev || 0)"), "transactional atomic revision checks");
ok(server.includes('captureScopeVersion(req, collegeId, sectionId, termId, "قبل تحويل') && server.includes("recordVersionAfter(before,"), "snapshot and restore baseline");
ok(repo.includes('AdInstructorCategory: "ta" as const') && server.includes('AdInstructorCategory === "ta"'), "TA category saved");
ok(staff.includes("setCategory(") && staff.includes("AdInstructorCategory: category || null"), "staff category chosen and saved");
ok(schedule.includes("<TAConversionPanel") && schedule.includes("تحويل هيئة التدريب"), "tool placed in More menu");
ok(panel.includes("applyWithOverwriteConfirm") && panel.includes("visualConfirm"), "safe undo and confirm");
console.log("TA conversion: " + checks + " checks passed");
