/**
 * ── بلاغات المالك 2026-11-19 على «تغييرات الجدول» والسجل والنماذج ───────────────
 *  L  سجل تغييرات اليوم: الأستاذُ هو صاحبُ الموعد الآن (لا من كان)، وشارةُ بنين/بنات، وتنبيهُ المتقاعد.
 *  M  أسابيعُ الأساتذة المحفوظة تُنسى بعد كل قراءةٍ للجدول (لا يبقى المقرر عند أستاذٍ حُوِّل عنه).
 *  T  «مدرب» من الدرجة المختارة لا من خانةٍ ثانية (الواجهة والخادم).
 *  H  «دخلتُ من Safari» خيارٌ هادئ تحت النموذج لا زرٌّ رئيسي فوقه.
 */
import fs from "node:fs";
import { isTraineeRankName } from "../src/utils/traineeRank";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra ?? ""); }
};
const read = (file: string) => fs.readFileSync(file, "utf8");
const schedules = read("src/components/Schedules.tsx");

const meta = schedules.slice(schedules.indexOf("const undoEntryMeta"), schedules.indexOf("const printUndoReport"));
check(/const instrId = Number\(affected\?\.AdInstructorId \|\| step\?\.body\?\.AdInstructorId/.test(meta), "L1 الأستاذُ من الصفّ الحيّ أولاً ثم من جسم الخطوة (لا العكس)");
check(/campusOf\(colleges\.find/.test(meta) && /retired: person\?\.AdInstructorStatus === "retired"/.test(meta), "L2 بنين/بنات من اسم الكلية، وعلامةُ المتقاعد");
check(/<CampusChip campus=\{campus\} \/>/.test(schedules) && /undo-log-retired/.test(schedules), "L3 الشارتان في سطر البند");
check(/forgetMiniWeekRows\(\);\n\s*\/\/ Second guard/.test(schedules), "M1 تُنسى أسابيعُ الأساتذة بعد قراءة الجدول مباشرةً");

check(isTraineeRankName("مدرب أ") && isTraineeRankName("مدرب متخصص ب") && !isTraineeRankName("أستاذ مساعد") && !isTraineeRankName("أستاذ دكتور") && !isTraineeRankName(""), "T1 درجاتُ «مدرب …» وحدها تُعدّ مدرباً");
const form = read("src/components/NewInstructorForm.tsx");
check(!/type="checkbox"/.test(form) && /isTraineeRankName\(picked\?\.name\)/.test(form) && /AdInstructorCategory: "ta"/.test(form), "T2 لا خانةَ «مدرب»؛ تُقرأ من الدرجة وتُرسَل «ta»");
const routes = read("src/server/routes/instructorsRoutes.ts");
check(/isTraineeRankName\(pickedRank\?\.name\) \? "ta" : null/.test(routes), "T3 الخادمُ يقرأ «مدرب» من الدرجة نفسها");

const login = read("src/components/Login.tsx");
check(!login.includes("AppHandoffEntry"), "H1 لا زرّ تسليم من Safari في شاشة الدخول");
check(/border:1px solid color-mix/.test(read("src/styles/71-official-app.css")) && !/\.app-handoff-go\{[^}]*background:var\(--accent\);/.test(read("src/styles/71-official-app.css").replace(/\n/g, "")), "H2 ليس زراً رئيسياً مملوءاً");
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
