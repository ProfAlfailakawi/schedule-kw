/**
 * ── الشاغر وعضو التدريب داخل الموعد (8) ─────────────────────────────────────
 *  Q  شريحتا «شاغر» و«عضو تدريب» تحت منتقي الأستاذ في المحرر الكامل، وتضعان الأستاذ بلا حفظ.
 *  A  «أسند إلى…» لموعدٍ محفوظٍ شاغر: يمرّ بمسار الإسناد القائم (placeholderAction assign) لا بمنطقٍ جديد، ولا مسارَ خادمٍ جديد.
 *  V  حكمٌ قبل الإسناد: الأستاذ حرّ/يتداخل والنصاب، وزرّ «أسند» يُعطَّل إن تداخل.
 *  K  المسارات القائمة سليمة: «شعب شاغرة» ومقترح الدراسة وبطاقات الاستبدال في القاعة.
 */
import fs from "node:fs";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra ?? ""); }
};
const read = (file: string) => fs.readFileSync(file, "utf8");
const schedules = read("src/components/Schedules.tsx");
const seats = read("src/components/InstructorSeats.tsx");
const tools = read("src/server/routes/scheduleToolsRoutes.ts");

check(/<SeatQuickPick value=\{Number\(form\.AdInstructorId\) \|\| 0\} vacantId=\{seatVacantId\} trainees=\{seatTrainees\}/.test(schedules), "Q1 الشريحتان تحت المنتقي في خطوة الأستاذ");
check(/onPick=\{\(id\) => \{ setForm\(\(p\) => \(\{ \.\.\.p, AdInstructorId: id \}\)\)/.test(schedules) && !/fetch|setForm|save/.test(seats.replace(/data-guide-ignore="[^"]*"/g, "")), "Q2 الاختيار يضع الأستاذ في النموذج وحده (الأداة بلا شبكة ولا حفظ)");
check(/formTrainees\.has\(Number\(person\.AdInstructorId\)\)/.test(schedules) && /trainees\.length \? <button/.test(seats), "Q3 عضو التدريب من متدرّبي النطاق نفسه (useTrainees) ويغيب بلا متدرّبين");
check(/studioPlaceholderIds\.find\(id => dept\.has\(id\)\)/.test(schedules), "Q4 شاغر القسم يُفضَّل (placeholder السجل نفسه)");
check(/assignVacantTo = async[\s\S]{0,500}placeholderAction\([\s\S]{0,300}"assign"/.test(schedules), "A1 الإسناد عبر placeholderAction «assign» القائم");
check(/seatAssignRow = editor === "edit" && editorOriginalRow && studioPlaceholderIds\.includes\(Number\(editorOriginalRow\.AdInstructorId\)\) && !practiceMode/.test(schedules), "A2 يظهر لموعدٍ محفوظٍ شاغر فقط وليس في وضع التدريب");
check(!/seat-assign|assign-vacant/.test(tools) && /\/api\/schedules\/placeholder-action/.test(tools), "A3 لا مسارَ خادمٍ جديد: المسار القائم وحده");
check(/issue\.type === "instructor"/.test(schedules) && /disabled=\{busy \|\| \(verdict \? !verdict\.free : false\)\}/.test(seats), "V1 الحكم يعطّل «أسند» عند تداخل الأستاذ");
check(/weeklyLoadOf\(\[\.\.\.mine, seatAssignRow\]/.test(schedules) && /النصاب الآن ثم بعد الإسناد/.test(seats), "V2 النصاب قبل/بعد في شريحة");
check(/<ReplaceableList/.test(read("src/components/RoomSuggestionCards.tsx")) && /ProposalVacancies/.test(read("src/components/proposal/StudyProposalWorkspace.tsx")), "K1 بطاقات الاستبدال في القاعة ومقترح الدراسة قائمان");
check(/room-replaceable-card/.test(read("src/components/RoomSuggestionCards.tsx")), "K2 بطاقة «خذ موعدها» كما هي");
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
