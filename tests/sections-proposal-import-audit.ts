/**
 * ── الشعب والمقترح والاستيراد (ملاحظات المالك، الجولة الثانية) ───────────────
 *
 *   1) «كل المقررات»: لسانٌ بجانب التخطيط، كل مقررات الصحيفتين، و«− شعبة / + شعبة»
 *      بأثرٍ فوري من محرّك محاكي الشعب نفسه، بلا كتابة.
 *   2) وسمُ «صحيفة جديدة» في قائمة مقررات المحاكي.
 *   3) «سعة 100» كانت سعةَ القاعة في السجل: السعةُ الآن من المقرر وإلا القاعة وإلا «غير محددة»،
 *      ولا رقمَ مجهولاً في حساب المقاعد.
 *   4) شواغرُ مقترح الأستاذ من مقررات قسمه وحده.
 *   5) الفصلُ المختار يقبل ملفَّ نفسه (ثلاثةُ فصولٍ مقبولة).
 *   6) «تجربة بلا حفظ» لفصلٍ فيه جدول: فرقٌ مرسوم، و«طبّق» مؤكَّدة بنقطة تراجع.
 *   7) وسمُ بنين/بنات في شاشات الإرشاد، وتصفيةٌ حين تختلط الجهتان.
 */
import fs from "fs";
import type { AdCourse, AdInstructor, FSchedule } from "../src/types";
import {
  capacityLabel, measure, removeImpact, sectionCards, seatCapacity, suggestPlacements, type TmContext,
} from "../src/utils/timeMachine";
import { addOneSection, courseSeatStats, removeOneSection } from "../src/utils/courseWhatIf";
import { inNewSheet, sheetTagOf } from "../src/utils/sheetTag";
import { departmentVacancyRows } from "../src/utils/proposalVacancyScope";
import { acceptedPdfSourceLabel, pdfTermAccepted } from "../src/utils/pdfTermRule";
import { importDiff } from "../src/utils/importDiff";
import { campusOf } from "../src/utils/campus";
import { readServerSource } from "./helpers/serverSource.mjs";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};
const read = (file: string) => fs.readFileSync(file, "utf8");

/* ── جدولٌ صغير ─────────────────────────────────────────────────────────── */
const halls = [
  { code: "B1", hall: "G1", buildingId: "b1", roomId: "r1", capacity: 100, roomType: "قاعة تدريس" },
  { code: "B1", hall: "G2", buildingId: "b1", roomId: "r2", capacity: 30, roomType: "قاعة تدريس" },
  { code: "B1", hall: "G3", buildingId: "b1", roomId: "r3", capacity: null, roomType: "قاعة تدريس" },
];
const course = (id: number, code: string, max: number): AdCourse => ({ AdCourseId: id, AdCollegeId: 1, AdSectionId: 1, CourseCode: code, CourseName: `مقرر ${code}`, CourseCredit: 3, CourseHours: 3, MaxStudent: max });
const courses = [course(1, "105", 35), course(2, "201", 0), course(3, "305", 0), course(4, "410", 40)];
const person = (id: number, name: string): AdInstructor => ({ AdInstructorId: id, AdInstructorCivil: "", AdInstructorName: name, AdInstructorMobile: "", AdInstructorLoad: 12 });
const instructors = [person(11, "د. أ"), person(12, "د. ب"), person(99, "هيئة تدريسية")];
const row = (id: number, courseId: number, scode: string, teacher: number, days: string[], start: string, end: string, hall: number): FSchedule => ({
  id, AdCollegeId: 1, AdSectionId: 1, AdTermId: 7, AdCourseId: courseId, AdCourseName: `مقرر ${courseId}`, SCode: scode, AdInstructorId: teacher,
  fsunday: days.includes("fsunday"), fmonday: days.includes("fmonday"), ftuesday: days.includes("ftuesday"), fwednesday: days.includes("fwednesday"), fthursday: days.includes("fthursday"),
  fstarttime: start, fendtime: end, AdRoomCode: "B1", AdRoomHall: halls[hall].hall, buildingId: "b1", roomId: halls[hall].roomId, locationStatus: "VERIFIED", rev: 1,
});
const rows = [
  row(1, 1, "501", 11, ["fsunday", "ftuesday"], "08:00", "09:15", 0),
  row(2, 1, "502", 12, ["fsunday", "ftuesday"], "09:30", "10:45", 0),
  row(3, 2, "501", 11, ["fmonday", "fwednesday"], "08:00", "09:15", 1), // بلا سعة مقرر ← سعة القاعة 30
  row(4, 3, "501", 12, ["fmonday", "fwednesday"], "11:00", "12:15", 2), // لا سعة للمقرر ولا للقاعة
];
const context: TmContext = {
  scope: { collegeId: 1, sectionId: 1, termId: 7 }, rows, outside: [], courses, instructors, halls,
  demand: { "1": { wanted: 90, seated: 64, capacity: 70, sections: 2 }, "3": { wanted: 20, seated: 20, capacity: 0, sections: 1 } },
  loadLimits: { "11": 12, "12": 12 }, canWrite: true,
};

/* ── 3) السعة ─────────────────────────────────────────────────────────────── */
{
  check(seatCapacity(courses[0], halls[0]).value === 35 && seatCapacity(courses[0], halls[0]).source === "section", "3.1 سعةُ الشعبة من المقرر أولاً (35 لا 100)");
  check(seatCapacity(courses[1], halls[1]).value === 30 && seatCapacity(courses[1], halls[1]).source === "room", "3.2 بلا سعة مقرر: سعةُ القاعة");
  check(seatCapacity(courses[2], halls[2]).value === null && capacityLabel(seatCapacity(courses[2], halls[2])) === "السعة غير محددة", "3.3 لا سعة معروفة: «السعة غير محددة» لا رقمٌ مخترع");
  check(capacityLabel(seatCapacity(courses[1], halls[1])) === "سعة القاعة 30" && capacityLabel(seatCapacity(courses[0])) === "سعة 35", "3.4 الرقم يُسمّى بمصدره");
  check(seatCapacity({ MaxStudent: 3 }, null).value === null, "3.5 سعةٌ أقل من ٥ ليست سعة");
  const cards = sectionCards(rows, context);
  const c3 = cards.find(card => card.courseId === 3)!, c2 = cards.find(card => card.courseId === 2)!;
  check(c3.capacitySource === null && c3.capacity === 0 && c2.capacitySource === "room" && c2.capacity === 30, "3.6 بطاقة الشعبة تحمل مصدر سعتها", cards);
  const m = measure(rows, context);
  check(m.seats === 35 + 35 + 30, "3.7 المقاعد تجمع المعروف وحده", m.seats);
  check(m.shortfall === 0, "3.8 مقررٌ سعتُه غير محددة لا يدخل العجز (لا 20 مخترعة)", m.shortfall);
  const placements = suggestPlacements(rows, 1, context, { max: 3 });
  check(placements.length > 0 && placements.every(item => !item.reasons.some(reason => /^سعة \d+$/.test(reason))) && placements.every(item => item.capacity?.value === 35),
    "3.9 الموضع المقترح لا يقول «سعة 100» (سعة القاعة) بل سعة الشعبة 35", placements.map(p => [p.reasons, p.capacity]));
  const impact = removeImpact(rows, cards.find(card => card.courseId === 3)!.key, context);
  check(impact !== null && impact.alternatives.length === 0, "3.10 أثر الحذف يعمل مع سعةٍ غير محددة");
  const sim = read("src/components/SectionSimulator.tsx");
  check(/capacityLabel\(item\.capacity\)/.test(sim) && /السعة غير محددة/.test(sim), "3.11 المحاكي يعرض السعة بمصدرها و«غير محددة»");
  check(!/reasons\.push\(`سعة \$\{hall\.capacity\}`\)/.test(read("src/utils/timeMachine.ts")), "3.12 لم يعد «سعة القاعة» يُعرض كأنه سعة الشعبة");
}

/* ── 2) وسمُ الصحيفة ─────────────────────────────────────────────────────── */
{
  check(sheetTagOf({ curriculum: [{ status: "active" }] }) === "new" && sheetTagOf({ curriculum: [{ status: "transition" }] }) === "old"
    && sheetTagOf({ curriculum: [{ status: "active" }, { status: "transition" }] }) === "shared" && sheetTagOf({}) === null
    && sheetTagOf({ serviceFor: ["قسم"] }) === "service", "2.1 وسمُ الصحيفة: جديدة/سابقة/مشترك/متطلب");
  check(inNewSheet("new") && inNewSheet("shared") && !inNewSheet("old"), "2.2 «الصحيفة الجديدة» تشمل المشترك");
  const sim = read("src/components/SectionSimulator.tsx");
  check(/useCourseSheets/.test(sim) && /صحيفة جديدة/.test(sim) && /optgroup label="🆕 الصحيفة الجديدة"/.test(sim), "2.3 قائمة مقررات المحاكي تُظهر «صحيفة جديدة» وتجمعها");
  check(/plans=1/.test(read("src/components/useCourseSheets.ts")), "2.4 الوسم من الخادم (/api/courses?plans=1) لا تخمين");
}

/* ── 1) كل المقررات ──────────────────────────────────────────────────────── */
{
  const stats = courseSeatStats(rows, context, [1, 2, 3, 4]);
  check(stats.get(1)!.sections === 2 && stats.get(1)!.seats === 70 && stats.get(1)!.wanted === 90 && stats.get(1)!.withoutSeat === 20, "1.1 لكل مقرر شعبُه ومقاعدُه وطلبُه ومن بلا مقعد", stats.get(1));
  check(stats.get(4)!.sections === 0 && stats.get(4)!.withoutSeat === null, "1.2 المقرر غير المطروح يظهر بلا شعب (ولا عجز بلا رادار)");
  check(stats.get(3)!.withoutSeat === null && stats.get(3)!.unknownSections === 1, "1.3 سعةٌ غير محددة: العجز غير معروف لا صفر");
  const minus = removeOneSection(rows, 1, context)!;
  check(minus.before.seats === 70 && minus.after.seats === 35 && minus.after.withoutSeat === 55 && minus.teacher !== null && minus.teacher.after < minus.teacher.before,
    "1.4 «− شعبة»: المقاعد 70←35، بلا مقعد 20←55، ونصاب الأستاذ ينقص", minus);
  check(minus.room !== null && minus.room.after < minus.room.before, "1.5 «− شعبة» تخفّف ضغط القاعة");
  const plus = addOneSection(rows, 1, context)!;
  check(plus !== null && plus.after.sections === 3 && plus.after.seats === 105 && plus.after.withoutSeat === 0 && plus.newBlocking === 0,
    "1.6 «+ شعبة»: موضعٌ بلا تعارض، والمقاعد تغطي الطلب", plus && { a: plus.after, b: plus.newBlocking });
  check(rows.length === 4 && rows.every(r => r.id > 0), "1.7 لا كتابة: الجدول الأصلي كما هو");
  const ui = read("src/components/AllCourses.tsx");
  check(/الصحيفة الجديدة/.test(ui) && /الصحيفة القديمة/.test(ui) && /ScenarioWorkbench/.test(ui) && /removeOneSection|addOneSection/.test(ui), "1.8 لسانا الصحيفتين، والاعتماد من منضدة السيناريو وحدها");
  const xfer = read("src/components/ScheduleTransfer.tsx");
  check(/goTab\("courses"\)/.test(xfer) && xfer.indexOf('goTab("planning")') < xfer.indexOf('goTab("courses")') && xfer.indexOf('goTab("courses")') < xfer.indexOf('goTab("simulator")'), "1.9 لسان «كل المقررات» بجانب «تخطيط الشعب»");
  check(!/from "\.\.\/utils\/scheduleIntelligence"[\s\S]*findConflicts/.test(read("src/utils/courseWhatIf.ts")), "1.10 لا محرّك ثانٍ: courseWhatIf يستعمل محرّك المحاكي");
}

/* ── 4) شواغر المقترح ────────────────────────────────────────────────────── */
{
  const placeholders = new Set([99]);
  const term = [
    { AdCollegeId: 1, AdSectionId: 1, AdCourseId: 1, AdInstructorId: 99 },   // شاغرة للقسم
    { AdCollegeId: 2, AdSectionId: 5, AdCourseId: 1, AdInstructorId: 99 },   // القسم نفسه في كلية البنين
    { AdCollegeId: 1, AdSectionId: 9, AdCourseId: 900, AdInstructorId: 99 }, // «كتابة متقدمة» — قسم آخر
    { AdCollegeId: 1, AdSectionId: 1, AdCourseId: 901, AdInstructorId: 99 }, // مقرر خدمة من قسمٍ آخر في جدول القسم
    { AdCollegeId: 1, AdSectionId: 1, AdCourseId: 2, AdInstructorId: 11 },   // مُسندة
  ];
  const out = departmentVacancyRows(term, { scopes: [{ collegeId: 1, sectionId: 1 }, { collegeId: 2, sectionId: 5 }], courseIds: new Set([1, 2]), placeholders });
  check(out.length === 2 && out.every(r => r.AdCourseId === 1), "4.1 الشواغر من مقررات القسم وحده (لا «كتابة متقدمة» ولا مقرر خدمة)", out);
  const routes = read("src/server/studyProposalRoutes.ts");
  check((routes.match(/departmentVacancyRows\(/g) || []).length === 2, "4.2 سياق المقترح ومسار الشواغر يطبّقان القاعدة نفسها");
  check(!/world\.placeholders\.has\(Number\(row\.AdInstructorId\)\) && canWriteScope/.test(routes), "4.3 لم يعد «كل شاغرةٍ في نطاق الكتابة» يكفي");
}

/* ── 5) الفصول المقبولة ──────────────────────────────────────────────────── */
{
  const T = "الفصل الثاني 2026/2027";
  check(pdfTermAccepted({ season: "second", years: [2026, 2027] }, T), "5.1 «الفصل الدراسي الثاني 2026/2027» يُقبل في فصله");
  check(acceptedPdfSourceLabel(T).split(" أو ").length === 3, "5.2 ثلاثةُ فصولٍ مقبولة", acceptedPdfSourceLabel(T));
}

/* ── 6) تجربة بلا حفظ ────────────────────────────────────────────────────── */
{
  const cur = [
    { AdCourseId: 1, SCode: "501", AdCourseName: "أ", fsunday: true, fstarttime: "08:00", fendtime: "09:15", AdInstructorId: 11, roomId: "r1" },
    { AdCourseId: 1, SCode: "502", AdCourseName: "أ", fsunday: true, fstarttime: "09:30", fendtime: "10:45", AdInstructorId: 12, roomId: "r1" },
    { AdCourseId: 2, SCode: "501", AdCourseName: "ب", fmonday: true, fstarttime: "08:00", fendtime: "09:15", AdInstructorId: 11, roomId: "r2" },
  ];
  const file = [
    { ...cur[0] },
    { ...cur[1], fstarttime: "11:00", fendtime: "12:15", AdInstructorId: 11 },
    { AdCourseId: 3, SCode: "501", AdCourseName: "ج", ftuesday: true, fstarttime: "08:00", fendtime: "09:15", AdInstructorId: 12, roomId: "r3" },
  ];
  const diff = importDiff(cur as any, file as any);
  check(diff.same === 1 && diff.added.length === 1 && diff.removed.length === 1 && diff.changed.length === 1
    && diff.changed[0].fields!.join() === "time,instructor", "6.1 الفرق: يُضاف/يُحذف/يتغيّر (في أي خانة)/كما هو", diff);
  /* مراجعة: الأيامُ والأوقاتُ تُقارن لقاءً لقاءً لا مجموعاتٍ منفصلة. */
  const meet = (day: string, start: string, end: string, extra: Record<string, unknown> = {}) => ({ AdCourseId: 9, SCode: "501", AdCourseName: "د", [day]: true, fstarttime: start, fendtime: end, AdInstructorId: 11, AdRoomCode: "B1", AdRoomHall: "G1", ...extra });
  const swapped = importDiff([meet("fsunday", "08:00", "09:15"), meet("fmonday", "10:00", "11:15")] as any, [meet("fsunday", "10:00", "11:15"), meet("fmonday", "08:00", "09:15")] as any);
  check(swapped.same === 0 && swapped.changed.length === 1 && swapped.changed[0].fields!.join() === "time", "6.1b تبديلُ وقتَي الأحد والاثنين تغييرٌ لا «كما هو»", swapped);
  const roomSwap = importDiff([meet("fsunday", "08:00", "09:15"), meet("fmonday", "08:00", "09:15", { AdRoomHall: "G2" })] as any, [meet("fsunday", "08:00", "09:15", { AdRoomHall: "G2" }), meet("fmonday", "08:00", "09:15")] as any);
  check(roomSwap.changed[0]?.fields?.join() === "room", "6.1c تبديلُ قاعتَي اليومين يُرى", roomSwap);
  const unresolved = importDiff([meet("fsunday", "08:00", "09:15")] as any, [meet("fsunday", "08:00", "09:15", { AdInstructorId: 0, AdRoomHall: "" })] as any);
  check(unresolved.same === 1, "6.1d خانةٌ لم تُحسم في الملف ملاحظةُ معاينة لا تغيير");
  const server = readServerSource();
  check(/const dryRun=String\(req\.query\.dryRun\|\|""\)==="1"/.test(server) && /if\(dryRun\)return true;/.test(server) && /!occupiedChecked&&!dryRun/.test(server),
    "6.2 القراءة التجريبية لا تُردّ لأن الفصل ممتلئ");
  check(/replaceFilled:true/.test(server) && /confirmTokens\(req\)\.has\("replace-filled"\)/.test(server) && /receipt\?\.replaceFilled/.test(server),
    "6.3 الاستبدال يحتاج إيصال تجربةٍ موقّعاً وطلباً صريحاً وتأكيد «replace-filled»");
  check(/undoVersions/.test(server) && /captureScopeVersion\(req,group\.scope\.collegeId/.test(server), "6.4 «طبّق» كتابةٌ واحدة بنقطة تراجع تُعاد للواجهة");
  const xfer = read("src/components/ScheduleTransfer.tsx");
  check(/ImportDryRun/.test(xfer) && /DryRunOffer/.test(xfer) && /PDF_TARGET_TERM_OCCUPIED/.test(xfer) && /versions\/\$\{encodeURIComponent\(versionId\)\}\/restore/.test(xfer),
    "6.5 الواجهة: عرضُ التجربة حين يمتلئ الفصل، والفرقُ مرسوماً، و«تراجع»");
  check(/!dryDiff \?/.test(xfer), "6.6 زرّ النشر العادي لا يظهر مع الفرق (لا كتابة إلا «طبّق»)");
  check(/setTermRowsFailed\(true\)/.test(xfer) && /<DryRunBaselineFailed/.test(xfer) && /onRetry=\{\(\) => void loadTermRows\(\)\}/.test(xfer),
    "6.5b تعذّرُ قراءة الجدول الحالي يُقال ومعه «أعد المحاولة»");
  check(/importReady && publishGateSatisfied && !dryDiff \?/.test(xfer) && !/publishGateSatisfied && !dryRunActive/.test(xfer),
    "6.5c زرّ النشر العادي لا يُخفى إلا حين يُرسم الفرق فعلاً");
  check(/applyWithOverwriteConfirm\("restore"[\s\S]{0,400}dryApplied|undoDryApply[\s\S]{0,900}applyWithOverwriteConfirm\("restore"/.test(xfer), "6.5d «تراجع» يسأل قبل محو ما تغيّر بعد «طبّق»");
  const dry = read("src/components/ImportDryRun.tsx");
  check(/نعم، طبّق/.test(dry) && /لم يُكتب شيء/.test(dry), "6.7 «طبّق» خطوتان، والشارة تقول إن شيئاً لم يُكتب");
}

/* ── 7) بنين / بنات ──────────────────────────────────────────────────────── */
{
  check(campusOf("كلية التربية الأساسية - بنين") === "boys" && campusOf("كلية التربية الأساسية - بنات - الجهراء") === "girls", "7.1 من اسم الكلية");
  check(campusOf("التربية الأساسية") === "girls" && campusOf("كلية التربية الأساسية") === "girls" && campusOf("", "0510") === "boys" && campusOf("كلية العلوم") === null, "7.2 من رمز الموقع الرسمي، ولا وسم لما لا يُعرف");
  const reg = read("src/components/StudentRegistration.tsx");
  check(/<CampusChip collegeName=\{collegeName\}/.test(reg) && /<CampusFilter/.test(reg), "7.3 كشف التسجيل يُظهر الجهة ويصفّي حين تختلط");
  check(/CampusChip/.test(read("src/components/AdvisorSeatsPanel.tsx")) && /CampusChip/.test(read("src/components/AdminUsers.tsx")), "7.4 مقاعد المرشد وحسابات المرشدين تحمل الوسم");
}

/* ── اللغة ─────────────────────────────────────────────────────────────── */
{
  const ui = ["src/components/AllCourses.tsx", "src/components/ImportDryRun.tsx", "src/components/CampusChip.tsx"].map(read).join("\n");
  check(!/(وش|ابي|شلون|جذي|هالحين)/.test(ui), "8.1 نصوص الواجهة بالفصحى");
}

console.log(`\nالشعب والمقترح والاستيراد: ${passed} ناجح · ${failed} فاشل`);
if (failed) process.exit(1);
