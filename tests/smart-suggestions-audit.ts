/**
 * ── الاقتراحات الذكية في «ماذا لو» (مركز الذكاء) ──
 *   1) أستاذٌ حقيقيٌّ متاح يأخذ شعبة «هيئة تدريسية» أو TA، تحت نصابه، بلا تعارض.
 *   2) مقررٌ في قاعةٍ من غير نوعه يعود إلى قاعته الملائمة الفارغة، ويُفسح مكانه لمن يحتاجه.
 *   3) «احذف مقرراً»: حكمٌ واضح بأسبابه (طلبة، صحيفة، نصاب، قاعات).
 *   4) تحويل النمط: كتلةٌ طويلة ← يومان، قراءةٌ فقط، وتقول ما يُوفَّر وما يُستهلك.
 *   5) الدمج: لا زرّ «آلة الزمن» لمن يبني الجدول، ولا لسانا المحاكي والتحسين في أدوات البيانات.
 */
import { readFileSync } from "fs";
import type { AdCourse, AdInstructor, FSchedule } from "../src/types";
import type { TmContext } from "../src/utils/timeMachine";
import { courseRemovalVerdict, facultySwaps, patternCandidates, roomSwaps, simulatePatternConversion } from "../src/utils/smartSuggestions";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`  ✓ ${label}`); } else { failed++; console.log(`  ✗ ${label}`, detail ?? ""); }
};
const read = (path: string) => readFileSync(path, "utf8");

const row = (id: number, courseId: number, instructor: number, days: string[], start: string, end: string, hall: string, extra: Partial<FSchedule> = {}): FSchedule => ({
  id, AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdCourseId: courseId, AdCourseName: `c${courseId}`, SCode: "01", AdInstructorId: instructor,
  fsunday: days.includes("fsunday"), fmonday: days.includes("fmonday"), ftuesday: days.includes("ftuesday"), fwednesday: days.includes("fwednesday"), fthursday: days.includes("fthursday"),
  fstarttime: start, fendtime: end, AdRoomCode: "B1", AdRoomHall: hall, roomId: `r-${hall}`, buildingId: "b1", locationStatus: "VERIFIED", ...extra,
} as FSchedule);
const course = (id: number, extra: Partial<AdCourse> = {}): AdCourse => ({ AdCourseId: id, AdCollegeId: 1, AdSectionId: 1, CourseCode: String(100 + id), CourseName: `مقرر ${id}`, CourseCredit: 3, CourseHours: 3, MaxStudent: 20, ...extra });
const person = (id: number, name: string, extra: Partial<AdInstructor> = {}): AdInstructor => ({ AdInstructorId: id, AdInstructorName: name, ...extra } as AdInstructor);

const context: TmContext = {
  scope: { collegeId: 1, sectionId: 1, termId: 1 },
  rows: [
    row(1, 1, 90, ["fsunday", "ftuesday"], "08:00", "09:15", "101"),           // هيئة تدريسية
    row(2, 2, 91, ["fmonday", "fwednesday"], "08:00", "09:15", "102"),         // TA
    row(3, 3, 10, ["fsunday", "ftuesday"], "10:00", "11:15", "G20"),           // ورشة في قاعة تدريسية، وW21 فارغة
    row(4, 4, 11, ["fsunday", "ftuesday"], "10:00", "11:15", "103"),           // مقدمة تحتاج قاعة تدريسية (G20) وهي في مختبر
    row(5, 5, 11, ["fthursday"], "08:00", "12:00", "L1"),                      // كتلة ٤ ساعات
    row(6, 6, 12, ["fsunday", "ftuesday"], "08:00", "09:15", "104"),           // الأستاذ 12 مشغول وقت الشعبة 1
  ],
  outside: [],
  courses: [course(1), course(2), course(3, { CourseRoomType: "ورشة" }), course(4, { CourseRoomType: "قاعة تدريسية" }), course(5, { CourseHours: 4, CourseRoomType: "مختبر" }), course(6)],
  instructors: [person(90, "هيئة تدريسية"), person(91, "مساعد تدريب", { AdInstructorCategory: "ta" }), person(10, "د. أحمد"), person(11, "د. سارة"), person(12, "د. خالد"), person(13, "د. متقاعد", { AdInstructorStatus: "retired" } as any)],
  halls: [
    { code: "B1", hall: "101", roomId: "r-101", buildingId: "b1", capacity: 40, roomType: "قاعة تدريسية" },
    { code: "B1", hall: "102", roomId: "r-102", buildingId: "b1", capacity: 40, roomType: "قاعة تدريسية" },
    { code: "B1", hall: "104", roomId: "r-104", buildingId: "b1", capacity: 40, roomType: "قاعة تدريسية" },
    { code: "B1", hall: "G20", roomId: "r-G20", buildingId: "b1", capacity: 40, roomType: "قاعة تدريسية" },
    { code: "B1", hall: "W21", roomId: "r-W21", buildingId: "b1", capacity: 30, roomType: "ورشة" },
    { code: "B1", hall: "103", roomId: "r-103", buildingId: "b1", capacity: 30, roomType: "مختبر" },
    { code: "B1", hall: "L1", roomId: "r-L1", buildingId: "b1", capacity: 30, roomType: "مختبر" },
  ],
  demand: { "6": { wanted: 30, seated: 25, capacity: 40, sections: 1 } },
  registration: { remaining: { "6": 12 }, unregistered: null, vacant: null, fileName: "", importedAt: "", reportTerm: "" },
  loadLimits: { "10": 12, "11": 12, "12": 12 },
  canWrite: true,
  plan: { "6": { level: 100, kind: "compulsory", unlocks: [4] }, "2": { level: 300, kind: "elective", unlocks: [] } },
};

console.log("١) أستاذ بدل هيئة تدريسية / TA");
{
  const list = facultySwaps(context);
  const forPlaceholder = list.find(item => item.changes[0].op === "assign" && (item.changes[0] as any).rowIds.includes(1));
  const forTa = list.find(item => item.changes[0].op === "assign" && (item.changes[0] as any).rowIds.includes(2));
  check(Boolean(forPlaceholder) && Boolean(forTa), "شعبة «هيئة تدريسية» وشعبة TA لكلٍّ اقتراح", list.map(item => item.title));
  check((forPlaceholder?.changes[0] as any)?.instructorId !== 12, "لا يُقترح أستاذٌ مشغول في الوقت نفسه");
  check(list.every(item => ![90, 91, 13].includes((item.changes[0] as any).instructorId)), "لا يُقترح «هيئة تدريسية» ولا TA ولا متقاعد");
  check(list.every(item => item.delta.after.blocking <= item.delta.before.blocking), "لا تعارض جديد");
  check(Boolean(forTa?.why.some(text => text.includes("TA"))), "السبب يقول إنه بدل TA", forTa?.why);
}

console.log("٢) القاعة في مكانها");
{
  const list = roomSwaps(context);
  const workshop = list.find(item => item.changes.some(change => change.op === "move" && change.rowId === 3));
  check(Boolean(workshop) && (workshop!.changes[0] as any).hall.hall === "W21", "الورشة تعود إلى W21", list.map(item => item.title));
  check(Boolean(workshop?.changes.some(change => change.op === "move" && change.rowId === 4 && (change as any).hall.hall === "G20")), "وتُفسح G20 للمقرر الذي يحتاجها", workshop?.changes);
  check(list.every(item => item.delta.after.blocking <= item.delta.before.blocking), "لا تعارض جديد");
}

console.log("٣) أريد حذف مقرر");
{
  const verdict = courseRemovalVerdict(context, 6)!;
  check(verdict.tone === "stop" && verdict.headline === "لا يُنصح بحذفه", "مقررٌ إجباري فيه طلبة: لا يُنصح", verdict);
  check(verdict.reasons.some(item => item.text.includes("جالسون")) && verdict.reasons.some(item => item.text.includes("لم يجتازوه")) && verdict.reasons.some(item => item.text.includes("متطلبٌ سابق")), "الأسباب: الطلبة والمتبقي والمتطلب السابق", verdict.reasons);
  check(verdict.changes.length === 1 && verdict.changes[0].op === "remove", "تجربة الحذف تغييرٌ واحد لكل شعبة");
  const elective = courseRemovalVerdict(context, 2)!;
  check(elective.tone !== "stop", "اختياريٌّ بلا طلبة: ليس «لا يُنصح»", elective);
  check(courseRemovalVerdict(context, 999) === null, "مقررٌ مجهول: لا حكم");
  const blind = courseRemovalVerdict({ ...context, demand: null, registration: null }, 2)!;
  check(blind.tone !== "go" && blind.headline !== "حذفه آمن" && blind.reasons.some(item => item.tone === "care" && item.text.includes("لا بيانات طلبة")),
    "بلا رادارٍ ولا كشف متبقٍّ: لا يُقال «آمن»، ويُقال إن أثره على الطلبة غير معروف", blind);
  /* الطلب الفعلي (تقرير التسجيل) يسبق الرادار: أرقامُ الخريجين والطلبة الحقيقية في الحكم. */
  const real = courseRemovalVerdict({ ...context, demand: null, registration: null, actualDemand: { "2": { students: 140, graduates: 7, seats: 60, gap: 2, unmetStudents: 80, unmetGraduates: 0 } } }, 2)!;
  check(real.tone === "stop" && real.reasons.some(item => item.text.includes("7 خريجين")) && real.reasons.some(item => item.text.includes("140") && item.text.includes("تقرير التسجيل"))
    && !real.reasons.some(item => item.text.includes("لا بيانات طلبة")), "الطلب الفعلي: «يمسّ 7 خريجين» و140 طالباً يحتاجونه — لا يُنصح بحذفه", real.reasons);
  const quiet = courseRemovalVerdict({ ...context, demand: null, registration: null, actualDemand: { "2": { students: 0, graduates: 0, seats: 60, gap: -1, unmetStudents: 0, unmetGraduates: 0 } } }, 2)!;
  check(quiet.reasons.some(item => item.tone === "go" && item.text.includes("لا طالب يحتاجه")), "الطلب الفعلي صفر: سببٌ أخضر لا «غير معروف»", quiet.reasons);
  const noEntry = courseRemovalVerdict({ ...context, plan: { "2": { level: 100, kind: "elective", unlocks: [] } } }, 2)!;
  check(noEntry.tone !== "go", "رادارٌ بلا سطرٍ لهذا المقرر ليس دليلاً على صفر طلبة", noEntry);
}

console.log("٤) تحويل النمط (قراءة فقط)");
{
  const cands = patternCandidates(context);
  check(cands.length === 1 && cands[0].rowId === 5, "المرشّح: كتلة ٤ ساعات في يومٍ واحد", cands);
  const before = JSON.stringify(context.rows);
  const result = simulatePatternConversion(context, [5], ["fmonday", "fwednesday"]);
  check(result.rows[0].after.includes("08:00–10:00") && result.rows[0].room === "same", "الاثنين + الأربعاء ساعتان، القاعة نفسها", result.rows[0]);
  check(result.roomDays.after === result.roomDays.before + 1, "يستهلك يوم قاعةٍ إضافياً", result.roomDays);
  check(JSON.stringify(context.rows) === before, "لا يكتب شيئاً في السياق");
}

console.log("٥) الدمج في مركز الذكاء");
{
  const app = read("src/App.tsx"), xfer = read("src/components/ScheduleTransfer.tsx"), intel = read("src/components/IntelligenceWorkspace.tsx"), machine = read("src/components/TimeMachine.tsx");
  check(/!allowed\.schedule && opensChangesScreen\(sessionRole\) \? \(\s*<NavButton[\s\S]{0,120}view="timeMachine"/.test(app), "زرّ آلة الزمن لمن لا يدخل مركز الذكاء وحده");
  check(/initialTab="whatif"/.test(app), "رابط آلة الزمن القديم يفتح «ماذا لو» في المركز");
  check(/key="intelligence-whatif"/.test(app) && /key="intelligence"/.test(app), "المسار الجديد يركّب المركز من جديد فلا يبقى على لسانه القديم");
  check(/\[initialTab\]\);/.test(intel) && /window\.addEventListener\("popstate", follow\)/.test(intel), "المركز المفتوح ينتقل إلى «ماذا لو» حين يصل رابطٌ جديد");
  check(/window\.addEventListener\("popstate", consume\)/.test(machine), "الآلة المفتوحة تقرأ جملة الرابط الجديد وتحلّها");
  check(!xfer.includes('goTab("simulator")') && !xfer.includes('goTab("improve")'), "لا لسان محاكي ولا تحسين في أدوات البيانات");
  check(/<WhatIfDesk collegeId=\{collegeId\}/.test(intel) && /ماذا لو/.test(intel), "«جرّب ← ماذا لو» في المركز");
  check(!/TmSteps/.test(machine) && /SuggestionList/.test(machine) && /RemovalCheck/.test(machine) && /PatternWhatIf/.test(machine), "خطوات الشرح أُزيلت، والأوضاع الجديدة موصولة");
  check(/picked\.length >= 2 \? \{ list: picked/.test(machine), "المقارنة عند الطلب وحده");
}

console.log(`\nsmart suggestions: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
