/**
 * ── كرت الأستاذ: أنماطُ اللائحة لمقرّرٍ بثلاث ساعات لا تُمنع بـ«تجاوز الساعات» ──
 *
 * ملاحظةُ المالك (r4): في نموذج الموعد للقسم ظهر مانعٌ كاذب «المجموع بعد هذا الموعد
 * يزيدها (6 ساعات تقريبًا)» لمقرّرٍ بثلاث ساعات على نمط يومٍ واحد ١٧٠ دقيقة (الأربعاء
 * 08:00–10:50) في شعبةٍ جديدة — حُسب الموعدُ مرّتين. هنا يُتحقّق أن محرّك الكرت
 * (judgeRequest، المشترك بين كرت الأستاذ وكرت المدرّب) لا يقع في الشيء نفسه:
 *   - الأربعاء وحده ١٧٠ د · الاثنين والأربعاء ٨٠ د · الأحد والثلاثاء والخميس ٥٠ د
 *   - على شعبةٍ قائمة (تعديل موعدها) وعلى شعبةٍ جديدة (إضافة من الطرح، وإضافة حرّة)
 * لا مانعَ برمز hours، ولا «يتجاوز»، ولا حكمَ «تعارض».
 */
import { judgeRequest, type RequestedRow, type VerdictContext } from "../src/utils/instructorRequestVerdict";
import { weeklyLectureMinutes, maxWeeklyMinutesFor, patternsForHours } from "../src/utils/scheduleRegulations";
import type { AdCourse, AdInstructor, FSchedule } from "../src/types";
import { readServerSource } from "./helpers/serverSource.mjs";
import { lengthPatternsForHours, meetingMinutes } from "../src/utils/requestMeetingLength";

let passed = 0, failed = 0;
const check = (ok: boolean, name: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ""); }
};

const TEACHER = 5, PLACEHOLDER = 900, COURSE = 31;
const DAYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
type Day = typeof DAYS[number];
const course: AdCourse = { AdCourseId: COURSE, AdCollegeId: 1, AdSectionId: 1, CourseCode: "0109301", CourseName: "مقرر بثلاث ساعات", CourseCredit: 3, CourseHours: 3 } as AdCourse;
const teacher = { AdInstructorId: TEACHER, AdInstructorCivil: "000000000005", AdInstructorName: "د. 5" } as AdInstructor;
const row = (id: number, days: Day[], start: string, end: string, over: Partial<FSchedule> = {}): FSchedule => ({
  id, AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdCourseId: COURSE, SCode: "01", AdInstructorId: TEACHER,
  ...Object.fromEntries(DAYS.map(d => [d, days.includes(d)])), fstarttime: start, fendtime: end, AdRoomCode: "B1", AdRoomHall: "101", ...over,
} as FSchedule);
const at = (clock: string, minutes: number) => { const [h, m] = clock.split(":").map(Number); const t = h * 60 + m + minutes; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };

const PATTERNS: Array<{ name: string; days: Day[]; minutes: number[] }> = [
  { name: "الأربعاء وحده ١٧٠ د", days: ["fwednesday"], minutes: [170] },
  { name: "الاثنين والأربعاء ٨٠ د", days: ["fmonday", "fwednesday"], minutes: [80, 80] },
  { name: "الأحد والثلاثاء والخميس ٥٠ د", days: ["fsunday", "ftuesday", "fthursday"], minutes: [50, 50, 50] },
];
const slotsOf = (p: typeof PATTERNS[number], start: string) => p.days.map((day, i) => ({ day, start, end: at(start, p.minutes[i]) }));
const rowsOf = (p: typeof PATTERNS[number], start: string, base: Partial<FSchedule>, firstId: number) => {
  /* صفٌّ لكل طولٍ مختلف، كما يُكتب الموعد في الجدول. */
  const byEnd = new Map<string, Day[]>();
  p.days.forEach((day, i) => { const end = at(start, p.minutes[i]); byEnd.set(end, [...(byEnd.get(end) || []), day]); });
  return [...byEnd.entries()].map(([end, days], i) => row(firstId + i, days, start, end, base));
};
/* القاعةُ خارج هذا الفحص (لا دليلَ قاعاتٍ في السياق المصغّر): يُسأل عن موانع الأيام والساعات والتعارض وحدها. */
const blocks = (v: any) => (v.reasons || []).filter((r: any) => r.blocking && r.source !== "room");
const overHours = (v: any) => (v.reasons || []).some((r: any) => r.code === "hours" || /يتجاوز ساعاته|يزيدها|تجاوز/.test(String(r.text || "")));

/* 0) المصدرُ المشترك: دقائقُ الأسبوع لكل نمطٍ معتمد لا تزيد على الحدّ. */
for (const p of PATTERNS) {
  const weekly = rowsOf(p, "08:00", {}, 1).reduce((sum, r) => sum + weeklyLectureMinutes(r, 3), 0);
  check(weekly <= maxWeeklyMinutesFor(3), `المصدر المشترك: ${p.name} = ${weekly} دقيقة ≤ ${maxWeeklyMinutesFor(3)}`, { weekly });
}
check(patternsForHours(3).some(p => p.days.length === 1 && p.minutesPerDay[0] === 170), "نمطُ اليوم الواحد ١٧٠ د في مكتبة اللائحة لثلاث ساعات");

for (const p of PATTERNS) {
  /* أ) شعبةٌ قائمة: موعدُها الحاليّ في يومٍ آخر بنمطٍ معتمد، ويطلب الأستاذ هذا النمط. */
  const current = row(10, ["fsunday", "ftuesday", "fthursday"], "12:00", "12:50");
  const after = rowsOf(p, "08:00", { id: 10 }, 10).map((r, i) => i === 0 ? { ...r, id: 10 } : { ...r, id: -1_000_000_100 - i });
  const ctx: VerdictContext = {
    instructorId: TEACHER, allRows: [current], instructorRowsAfter: after,
    courses: new Map([[COURSE, course]]), instructors: new Map([[TEACHER, teacher]]), knownRoomKeys: [], startLadder: [],
  };
  const ask: RequestedRow = { rowId: 10, action: "change", AdCourseId: COURSE, days: p.days as any, start: "08:00", slots: slotsOf(p, "08:00") as any };
  const moved = judgeRequest(ask, ctx);
  check(!overHours(moved) && !blocks(moved).length, `شعبة قائمة · ${p.name}: لا «تجاوز» ولا مانع`, moved.reasons);

  /* ب) شعبةٌ جديدة من الطرح: صفُّ «هيئة تدريسية» يُسند إلى الأستاذ. */
  const offered = rowsOf(p, "08:00", { AdInstructorId: PLACEHOLDER, SCode: "05" }, 50);
  const claimed = offered.map((r, i) => ({ ...r, AdInstructorId: TEACHER, id: i === 0 ? -7 : -1_000_000_070 - i }));
  const addCtx: VerdictContext = {
    instructorId: TEACHER, allRows: [...offered], instructorRowsAfter: claimed,
    courses: new Map([[COURSE, course]]), instructors: new Map([[TEACHER, teacher], [PLACEHOLDER, { AdInstructorId: PLACEHOLDER, AdInstructorName: "هيئة تدريسية" } as AdInstructor]]), knownRoomKeys: [], startLadder: [],
  };
  const claim: RequestedRow = { action: "add", tempId: -7, AdCourseId: COURSE, days: p.days as any, start: "08:00", slots: slotsOf(p, "08:00") as any, relatedRowIds: offered.map(r => Number(r.id)) } as RequestedRow;
  const fromOffering = judgeRequest(claim, addCtx);
  check(!overHours(fromOffering) && !blocks(fromOffering).length, `شعبة جديدة من الطرح · ${p.name}: لا «تجاوز» ولا مانع`, fromOffering.reasons);

  /* ج) شعبةٌ جديدة حرّة (لا صفَّ لها بعد) بالنمط نفسه. */
  const fresh = rowsOf(p, "08:00", { SCode: "" }, 0).map((r, i) => ({ ...r, id: i === 0 ? -9 : -1_000_000_090 - i }));
  const freshCtx: VerdictContext = {
    instructorId: TEACHER, allRows: [], instructorRowsAfter: fresh,
    courses: new Map([[COURSE, course]]), instructors: new Map([[TEACHER, teacher]]), knownRoomKeys: [], startLadder: [],
  };
  const freshAsk: RequestedRow = { action: "add", tempId: -9, AdCourseId: COURSE, days: p.days as any, start: "08:00", slots: slotsOf(p, "08:00") as any } as RequestedRow;
  const brandNew = judgeRequest(freshAsk, freshCtx);
  check(!overHours(brandNew) && !blocks(brandNew).length, `شعبة جديدة حرّة · ${p.name}: لا «تجاوز» ولا مانع`, brandNew.reasons);

  /* د) بلا slots (الصفحةُ ترسل الأيام والبداية فقط): النمطُ المتعدّد الأيام يُستنتج من اللائحة. */
  if (p.days.length > 1) {
    const bare: RequestedRow = { action: "add", tempId: -9, AdCourseId: COURSE, days: p.days as any, start: "08:00" } as RequestedRow;
    const plain = judgeRequest(bare, freshCtx);
    check(!overHours(plain) && !blocks(plain).length, `بلا مواعيد صريحة · ${p.name}: لا «تجاوز» ولا مانع`, plain.reasons);
  }
}

/* هـ) اليوم الواحد على شعبةٍ قائمة هي نفسُها ١٧٠ د: نقلُ بدايتها يحفظ الطول ولا يُمنع. */
{
  const block = row(20, ["fwednesday"], "08:00", "10:50");
  const ctx: VerdictContext = {
    instructorId: TEACHER, allRows: [block], instructorRowsAfter: [row(20, ["fwednesday"], "09:00", "11:50")],
    courses: new Map([[COURSE, course]]), instructors: new Map([[TEACHER, teacher]]), knownRoomKeys: [], startLadder: [],
  };
  const v = judgeRequest({ rowId: 20, action: "change", AdCourseId: COURSE, days: ["fwednesday"] as any, start: "09:00" }, ctx);
  check(!overHours(v) && !blocks(v).length && v.computedEnd === "11:50", "شعبة قائمة ١٧٠ د · بدايةٌ أخرى يوم الأربعاء: الطول نفسه بلا «تجاوز»", { reasons: v.reasons, end: v.computedEnd });
}

/* و) مسارُ الكرت الحقيقي: الخادمُ يحسب طولَ اليوم الواحد قبل الحكم (requestSlotsForCourse). «الأربعاء وحده»
   لمقرّرٍ بثلاث ساعات كان يأخذ طولَ الأربعاء من تاريخ نمط الاثنين والأربعاء (٧٥ د) فيُمنع «لا يغطّيها»؛
   صار يأخذ طولَ نمط اليوم الواحد في اللائحة (١٧٠ د)، وعادةُ المقرّر بيومٍ واحد (block) تبقى أولى. */
{
  const server = readServerSource();
  const fn = server.slice(server.indexOf("async function requestSlotsForCourse"), server.indexOf("async function instructorRequestItemsFromPayload"));
  /* المحرّكُ الواحد (قرار المالك 2026-10-30): الخادمُ يحسب المواعيد بـ meetingSlots من أنماط اللائحة، ولا يقرأ طولَ يومٍ من الذاكرة. */
  check(fn.includes("meetingSlots(days, start, lengthPatternsForHours(effectiveCourseHours(course)), own)") && !/historicalLectureMinutes/.test(fn),
    "اليوم الواحد بلا طولٍ معروف يأخذ نمطَ اللائحة (١٧٠ د لثلاث ساعات) لا طولَ يومٍ من نمطٍ متعدّد الأيام");
  check(meetingMinutes(["fwednesday"], lengthPatternsForHours(3)).join() === "170" && meetingMinutes(["fmonday", "fwednesday"], lengthPatternsForHours(3)).join() === "80,80",
    "والمحرّكُ نفسُه: الأربعاء وحده ١٧٠ د، والاثنين والأربعاء ٨٠ د لكلٍّ منهما");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
