/**
 * ── حكمُ النمط الواحد في كل المسارات: مكتبةُ الأنماط بأيامها (المالك 2026-10-30: «النمط لازم يكون معتمداً») ──
 *
 * مصدرٌ واحد (approvedShapesForHours في scheduleRegulations) يقرؤه الإنشاء والتعديل والبطاقة السريعة وطلبُ الأستاذ
 * و«ثبّت» والاستيراد ومراجعة الاعتماد. كانت المراجعةُ وحدها تقبل أطوالَ نمطٍ معتمد على أيامٍ غير أيامه (الأحد·الأربعاء 80)
 * صامتة؛ الآن تقوله تنبيهاً لا يمنع «نمط غير معتمد في المكتبة»، والحفظُ يرفضه كما كان.
 *
 *  U1  المصدرُ الواحد: أنماطُ المكتبة وحدها، والكتلةُ على أيّ يوم.
 *  U2  المراجعة: المكتبةُ سليمة، والأحد·الأربعاء 80 تنبيهٌ لا يمنع يُعدّ فيما يُعرض، والمتتاليان و75د مانع.
 *  U3  الإنشاء والتعديل على الخادم (unapprovedPatternIssue، patternLengthIssue، تنبيهُ الخلط).
 *  U4  النموذجُ والبطاقةُ السريعة (appointmentRegulation).
 *  U5  طلبُ الأستاذ (judgeRequest، ومحرّكُ الطول في الخادم والصفحة)، و«ثبّت» (sectionDaysCompliant).
 *  U6  الاستيراد (daysApprovedForHours وأطوالُ المكتبة لكل يوم).
 *  U7  ساكن: لا نسخةَ ثانية من القاعدة.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pattern-rule-unify-"));
process.env.SCHEDULE_PRIVATE_DIR = dir;
process.env.DATA_MODE = "demo";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, detail?: unknown) => {
  if (ok) { passed += 1; console.log(`✓ ${label}`); }
  else { failed += 1; console.log(`✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`); }
};

const R = await import("../src/utils/scheduleRegulations");
const A = await import("../src/utils/appointmentRegulation");
const V = await import("../src/utils/instructorRequestVerdict");
const L = await import("../src/utils/requestMeetingLength");
const { reviewHasFindings } = await import("../src/utils/approvalScore");
const { REQUEST_LENGTH_SCRIPT } = await import("../src/server/requestLengthScript");
type Day = import("../src/utils/scheduleRegulations").DayKey;

const MON_WED: Day[] = ["fmonday", "fwednesday"];
const SUN_TUE: Day[] = ["fsunday", "ftuesday"];
const SUN_WED: Day[] = ["fsunday", "fwednesday"];
const MON_THU: Day[] = ["fmonday", "fthursday"];
const SUN_MON: Day[] = ["fsunday", "fmonday"];
const theory3 = { CourseHours: 3, CourseTeachingMode: "theoretical" };

/* ── U1 المصدرُ الواحد ── */
check(R.approvedShapesForHours(3).map(p => p.id).join() === R.patternsForHours(3).map(p => p.id).join(), "U1 الأشكالُ المعتمدة هي المكتبة نفسها بأيامها");
check(R.daysApprovedForHours(3, MON_WED) === true && R.daysApprovedForHours(3, SUN_TUE) === true, "U1 الاثنين·الأربعاء والأحد·الثلاثاء (من المكتبة) معتمدان");
check(R.daysApprovedForHours(3, SUN_WED) === false && R.daysApprovedForHours(3, MON_THU) === false && R.daysApprovedForHours(3, SUN_MON) === false,
  "U1 الأحد·الأربعاء والاثنين·الخميس (ليسا في المكتبة) والمتتاليان غير معتمدة");
check(R.likeLibraryShape(3, SUN_WED, [80, 80]) && !R.likeLibraryShape(3, SUN_MON, [80, 80]) && !R.likeLibraryShape(3, SUN_WED, [75, 75]),
  "U1 «يشبه المكتبة»: الأحد·الأربعاء 80 نعم، والمتتاليان و75د لا");

/* ── U2 المراجعة ── */
const reviewRow = (id: number, days: Day[], start: string, end: string, courseId = 7) => ({
  id, AdCourseId: courseId, AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, SCode: String(id), AdInstructorId: 9, fstarttime: start, fendtime: end,
  fsunday: days.includes("fsunday"), fmonday: days.includes("fmonday"), ftuesday: days.includes("ftuesday"), fwednesday: days.includes("fwednesday"), fthursday: days.includes("fthursday"),
});
const reviewCourse = { AdCourseId: 7, CourseCode: "T7", CourseName: "مقرر", CourseHours: 3, CourseCredit: 3, CourseTeachingMode: "theoretical" };
const review = (rows: any[]) => R.reviewSchedule({ rows, courses: new Map([[7, reviewCourse]]), instructors: new Map() } as any);
const ruleOf = (rows: any[], rule: string) => review(rows).find(f => f.rule === rule);
check(R.meetingsMatchApprovedPattern([{ day: "fmonday", minutes: 80 }, { day: "fwednesday", minutes: 80 }], 3)
  && !R.meetingsMatchApprovedPattern([{ day: "fsunday", minutes: 80 }, { day: "fwednesday", minutes: 80 }], 3),
  "U2 meetingsMatchApprovedPattern يقرأ المكتبة: الاثنين·الأربعاء 80 نعم، والأحد·الأربعاء 80 لا");
const library = [reviewRow(1, MON_WED, "08:00", "09:20"), reviewRow(2, SUN_TUE, "11:00", "12:20")];
check(!ruleOf(library, "theoretical-pattern") && !ruleOf(library, "pattern-off-library"), "U2 المراجعة: أنماطُ المكتبة بلا ملاحظة");
const offLibrary = ruleOf([reviewRow(3, SUN_WED, "08:00", "09:20"), reviewRow(4, MON_THU, "11:00", "12:20")], "pattern-off-library");
check(offLibrary && offLibrary.approvalEffect === "note" && offLibrary.title === "نمط غير معتمد في المكتبة" && offLibrary.rowIds.includes(3) && offLibrary.rowIds.includes(4)
  && !ruleOf([reviewRow(3, SUN_WED, "08:00", "09:20")], "theoretical-pattern"),
  "U2 والأحد·الأربعاء والاثنين·الخميس 80: «نمط غير معتمد في المكتبة» تنبيهٌ لا يمنع (لا مانعَ جديد)", offLibrary);
check(R.isDecision1912Finding(offLibrary as any), "U2 والتنبيهُ من بنود اللائحة فتعرضه شاشةُ المراجعة");
check(reviewHasFindings(0, 0, 1), "U2 وتنبيهٌ واحدٌ وحده يُعدّ فيما يُعرض (لا «لا ملاحظات»)");
const screen = fs.readFileSync("src/components/ScheduleReview.tsx", "utf8");
check(/finding\.rule === "pattern-off-library"/.test(screen) && /\.\.\.ladderNotes, \.\.\.libraryNotes\]/.test(screen)
  && /reviewHasFindings\(groupedFindings\.length, warningGroups\.length, quietFindings\.length\)/.test(screen),
  "U2 الشاشة تجمع التنبيه في الملاحظات الهادئة، وreviewHasFindings يعدّها");
const adjacent = ruleOf([reviewRow(5, SUN_MON, "08:00", "09:20")], "theoretical-pattern");
check(adjacent?.approvalEffect === "block" && adjacent.rowIds.includes(5), "U2 ويومان متتاليان يبقيان مانعاً كما كانا");
check(ruleOf([reviewRow(6, SUN_WED, "08:00", "09:15")], "theoretical-pattern")?.rowIds.includes(6), "U2 و75د على أيامٍ غير متتالية يبقى مانعاً");

/* ── U3 الإنشاء والتعديل على الخادم ── */
const { Repository } = await import("../src/db/repository");
await import("../src/server/core/hallBarter");
const courses: Record<number, any> = { 7: reviewCourse };
(Repository as any).getCourseById = async (id: number) => courses[Number(id)];
(Repository as any).getSchedulesByScope = async () => [];
(Repository as any).getScheduleById = async () => undefined;
const rules = await import("../src/server/core/scheduleRules");
check(await rules.unapprovedPatternIssue(reviewRow(0, MON_WED, "08:00", "09:20")) === null && await rules.unapprovedPatternIssue(reviewRow(41, SUN_TUE, "11:00", "12:20")) === null,
  "U3 الإنشاء والتعديل: نمطُ المكتبة يُحفظ");
check(/ليست نمطاً معتمداً/.test(await rules.unapprovedPatternIssue(reviewRow(0, SUN_WED, "08:00", "09:20")) || ""), "U3 والأحد·الأربعاء 80 يُرفض كما اليوم");
check(/ليست نمطاً معتمداً/.test(await rules.unapprovedPatternIssue(reviewRow(0, SUN_MON, "08:00", "09:20")) || ""), "U3 ويومان متتاليان يُرفضان");
check(/لا توافق النمط المعتمد/.test(await rules.unapprovedPatternIssue(reviewRow(0, MON_WED, "08:00", "09:15")) || ""), "U3 و75د على أيامٍ معتمدة يُرفض ويقول النهاية الصحيحة");
check(await rules.mixedPatternNotice(7, SUN_TUE as any, 1) === null && Boolean(await rules.mixedPatternNotice(7, SUN_WED as any, 1)),
  "U3 تنبيهُ الخلط للأحد·الأربعاء (ليس في المكتبة)");

/* ── U4 النموذجُ والبطاقةُ السريعة ── */
check(A.regulationFit(theory3, MON_WED, "08:00", "09:20") === "fits" && A.regulationFit(theory3, SUN_TUE, "08:00", "09:20") === "fits", "U4 نمطُ المكتبة «يوافق اللائحة»");
check(A.regulationFit(theory3, SUN_WED, "08:00", "09:20") === "off" && A.regulationFit(theory3, SUN_MON, "08:00", "09:20") === "off"
  && A.regulationFit(theory3, MON_WED, "08:00", "09:15") === "off", "U4 والأحد·الأربعاء والمتتاليان و75د «خارج اللائحة»");
check(A.regulationEnd(theory3, MON_WED, "11:00") === "12:20" && A.regulationEnd(theory3, SUN_WED, "11:00") === "", "U4 النهايةُ من نمط المكتبة، ولا نهايةَ لأيامٍ خارجها");
check(A.patternLengthIssue(theory3, MON_WED, "08:00", "09:20") === "" && /09:20/.test(A.patternLengthIssue(theory3, MON_WED, "08:00", "09:15")), "U4 حكمُ الطول: 75د يُقال معه 09:20");

/* ── U5 طلبُ الأستاذ و«ثبّت» ── */
const ctx = () => ({
  instructorId: 5, allRows: [], instructorRowsAfter: [], instructors: new Map(), knownRoomKeys: ["legacy:T|1"], ladderBlocks: false,
  courses: new Map([[77, { AdCourseId: 77, CourseHours: 3, CourseCredit: 3, CourseName: "مقرر", CourseCode: "T77" }]]),
}) as any;
const asked = (days: Day[], start: string) => ({ rowId: null, tempId: -1, action: "add", AdCourseId: 77, days, start }) as any;
const monWed = V.judgeRequest(asked(MON_WED, "09:30"), ctx());
check(monWed.sendable && monWed.computedEnd === "10:50", "U5 طلبُ الأستاذ: الاثنين·الأربعاء 80 يُرسل", monWed.reasons);
check(!V.judgeRequest(asked(SUN_WED, "09:00"), ctx()).sendable, "U5 والأحد·الأربعاء يُمنع كما اليوم");
check(!V.judgeRequest(asked(SUN_MON, "09:00"), ctx()).sendable, "U5 والأحد·الاثنين يُمنع");
check(L.meetingMinutes(SUN_TUE, L.lengthPatternsForHours(3)).join() === "80,80" && L.meetingMinutes(SUN_WED, L.lengthPatternsForHours(3)).join() === "50,80",
  "U5 محرّكُ الطول: نمطُ المكتبة 80+80، وما خارجها على طول اليوم (فيُمنع بالساعات)");
const browser = new Function(`${REQUEST_LENGTH_SCRIPT}; return meetingMinutes;`)() as (days: string[], patterns: unknown) => number[];
check(browser(SUN_TUE, L.lengthPatternsForHours(3)).join() === "80,80" && browser(SUN_WED, L.lengthPatternsForHours(3)).join() === "50,80", "U5 ونسخةُ الصفحة تحسب الشيءَ نفسه");
const { sectionDaysCompliant } = await import("../src/server/routes/publicRequestRoutes");
check(sectionDaysCompliant(3, new Set(MON_WED), true) && sectionDaysCompliant(3, new Set(SUN_WED), true) && !sectionDaysCompliant(3, new Set(SUN_MON), true),
  "U5 «ثبّت» لصفٍّ قائم: المكتبةُ وما يشبهها لا يمنعان (لا مانعَ جديد)، والمتتاليان يمنعان");

/* ── U6 الاستيراد ── */
check(R.daysApprovedForHours(3, MON_WED) === true && R.daysApprovedForHours(3, SUN_WED) === false && R.daysApprovedForHours(3, SUN_MON) === false,
  "U6 معاينةُ الاستيراد: «نمطٌ غير معتمد» للأحد·الأربعاء والمتتاليين لا للمكتبة");
check(R.libraryLengthsForDay("fmonday").has(80) && !R.libraryLengthsForDay("fsunday").has(75), "U6 وأطوالُ المكتبة لكل يوم (75 ليس منها)");

/* ── U7 ساكن: لا نسخةَ ثانية من القاعدة ── */
const read = (file: string) => fs.readFileSync(file, "utf8");
const pinRule = read("src/server/routes/publicRequestRoutes.ts").split("export function sectionDaysCompliant")[1]?.split("\n}")[0] || "";
check(/daysFitLibrary\(hours, days, exact\)/.test(pinRule) && /likeLibraryShape\(/.test(pinRule) && !/indexOf|patternsForHours/.test(pinRule), "U7 «ثبّت» يقرأ المصدرَ الواحد بلا نسخةٍ ثانية من قاعدة التباعد");
check(/approvedShapesForHours\(hours\)\.map/.test(read("src/utils/requestMeetingLength.ts")), "U7 محرّكُ الطول (الخادم والصفحة) يقرأ المصدرَ الواحد");
check(/approvedShapesForHours\(weeklyHours\)\.some/.test(read("src/utils/scheduleRegulations.ts").split("export function meetingsMatchApprovedPattern")[1] || ""), "U7 المراجعة تقرأ المصدرَ الواحد");

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\nPattern rule unify audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
