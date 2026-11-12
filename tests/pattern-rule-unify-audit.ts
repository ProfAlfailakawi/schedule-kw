/**
 * ── حكمُ النمط الواحد في كل المسارات (قرار المالك، القرار 1913/2016 م.7/8) ──────────────
 *
 * أيُّ يومين غير متتاليين بأطوال نمطٍ معتمد نمطٌ معتمد: الأحد·الأربعاء والاثنين·الخميس مثلُ الاثنين·الأربعاء.
 * كانت مراجعةُ الاعتماد تقبله، والإنشاءُ والتعديلُ والبطاقةُ السريعة وطلبُ الأستاذ والاستيرادُ يقرؤون المكتبةَ
 * حرفاً فيمنعونه. الآن مصدرٌ واحد (approvedShapesForHours) يقرؤه الجميع، وهذا الاختبار يمرّ على كل مسار:
 *
 *  U1  المصدرُ الواحد: الأحد·الأربعاء والاثنين·الخميس بأطوالٍ معتمدة، والمتتاليان والطولُ الغريب لا.
 *  U2  المراجعة (reviewSchedule / meetingsMatchApprovedPattern).
 *  U3  الإنشاء والتعديل على الخادم (unapprovedPatternIssue، patternLengthIssue، استثناءُ طول المحاضرة، تنبيهُ الخلط).
 *  U4  النموذجُ والبطاقةُ السريعة (appointmentRegulation: pickDay، regulationFit، regulationEnd، completeRegulation).
 *  U5  طلبُ الأستاذ (judgeRequest، ومحرّكُ الطول في الخادم والصفحة).
 *  U6  الاستيراد (daysApprovedForHours وأطوالُ المكتبة لكل يوم، كما تقرؤها معاينةُ الاستيراد).
 *  U7  ساكن: لا مسارَ يقرأ أيامَ المكتبة حرفاً ليحكم.
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
const X = await import("../src/utils/regulationException");
const { REQUEST_LENGTH_SCRIPT } = await import("../src/server/requestLengthScript");
type Day = import("../src/utils/scheduleRegulations").DayKey;

const SUN_WED: Day[] = ["fsunday", "fwednesday"];
const MON_THU: Day[] = ["fmonday", "fthursday"];
const SUN_MON: Day[] = ["fsunday", "fmonday"];
const theory3 = { CourseHours: 3, CourseTeachingMode: "theoretical" };
const theory4 = { CourseHours: 4, CourseTeachingMode: "theoretical" };

/* ── U1 المصدرُ الواحد ── */
check(R.daysApprovedForHours(3, SUN_WED) === true && R.daysApprovedForHours(3, MON_THU) === true && R.daysApprovedForHours(4, MON_THU) === true,
  "U1 الأحد·الأربعاء والاثنين·الخميس نمطٌ معتمد لثلاث ساعات وأربع");
check(R.daysApprovedForHours(3, SUN_MON) === false && R.daysApprovedForHours(4, ["fwednesday", "fthursday"]) === false,
  "U1 يومان متتاليان ليسا نمطاً");
check(R.approvedShapeForDays(3, SUN_WED, true)?.minutesPerDay.join() === "80,80" && R.approvedShapeForDays(4, MON_THU, true)?.minutesPerDay.join() === "110,110",
  "U1 الشكلُ يحمل أطوال المكتبة: 80+80 لثلاث ساعات و110+110 لأربع");
check(R.approvedShapesForHours(3).slice(0, R.patternsForHours(3).length).map(p => p.id).join() === R.patternsForHours(3).map(p => p.id).join(),
  "U1 أنماطُ المكتبة أولاً بأيامها (المثالُ يبقى المفضَّل)");
check(R.rowFitsApprovedShape(SUN_WED, 80, 3) && !R.rowFitsApprovedShape(SUN_WED, 75, 3) && !R.rowFitsApprovedShape(SUN_MON, 80, 3),
  "U1 صفٌّ بطولٍ واحد: 80 على الأحد·الأربعاء يوافق، و75 أو يومان متتاليان لا");

/* ── U2 المراجعة ── */
check(R.meetingsMatchApprovedPattern([{ day: "fsunday", minutes: 80 }, { day: "fwednesday", minutes: 80 }], 3)
  && R.meetingsMatchApprovedPattern([{ day: "fmonday", minutes: 110 }, { day: "fthursday", minutes: 110 }], 4),
  "U2 المراجعة: الأحد·الأربعاء 80 والاثنين·الخميس 110 مطابقان");
check(!R.meetingsMatchApprovedPattern([{ day: "fsunday", minutes: 80 }, { day: "fmonday", minutes: 80 }], 3)
  && !R.meetingsMatchApprovedPattern([{ day: "fsunday", minutes: 75 }, { day: "fwednesday", minutes: 75 }], 3),
  "U2 المراجعة: المتتاليان والطولُ الغريب غير مطابقين");
const reviewRow = (id: number, days: Day[], start: string, end: string) => ({
  id, AdCourseId: 7, AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, SCode: String(id), AdInstructorId: 9, fstarttime: start, fendtime: end,
  fsunday: days.includes("fsunday"), fmonday: days.includes("fmonday"), ftuesday: days.includes("ftuesday"), fwednesday: days.includes("fwednesday"), fthursday: days.includes("fthursday"),
});
const reviewCourse = { AdCourseId: 7, CourseCode: "T7", CourseName: "مقرر", CourseHours: 3, CourseCredit: 3, CourseTeachingMode: "theoretical" };
const patternFinding = (rows: any[]) => R.reviewSchedule({ rows, courses: new Map([[7, reviewCourse]]), instructors: new Map() } as any).find(f => f.rule === "theoretical-pattern");
check(!patternFinding([reviewRow(1, SUN_WED, "08:00", "09:20"), reviewRow(2, MON_THU, "11:00", "12:20")]), "U2 مراجعةُ الاعتماد لا تعلّم الأحد·الأربعاء ولا الاثنين·الخميس");
check(patternFinding([reviewRow(3, SUN_MON, "08:00", "09:20")])?.rowIds.includes(3), "U2 وتعلّم يومين متتاليين");
check(patternFinding([reviewRow(4, SUN_WED, "08:00", "09:15")])?.rowIds.includes(4), "U2 وتعلّم طولاً خارج المكتبة على أيامٍ غير متتالية");

/* ── U3 الإنشاء والتعديل على الخادم ── */
const { Repository } = await import("../src/db/repository");
await import("../src/server/core/hallBarter");
const courses: Record<number, any> = { 7: reviewCourse, 8: { ...reviewCourse, AdCourseId: 8, CourseHours: 4, CourseCredit: 4 } };
(Repository as any).getCourseById = async (id: number) => courses[Number(id)];
(Repository as any).getSchedulesByScope = async () => [];
(Repository as any).getScheduleById = async () => undefined;
const rules = await import("../src/server/core/scheduleRules");
const saved = (days: Day[], start: string, end: string, courseId = 7, id = 0) => ({ ...reviewRow(id, days, start, end), AdCourseId: courseId });
check(await rules.unapprovedPatternIssue(saved(SUN_WED, "08:00", "09:20")) === null, "U3 الإنشاء: الأحد·الأربعاء 08:00–09:20 يُحفظ");
check(await rules.unapprovedPatternIssue(saved(MON_THU, "11:00", "12:50", 8, 41)) === null, "U3 التعديل: الاثنين·الخميس 110د لمقررٍ بأربع ساعات يُحفظ");
check(/ليست نمطاً معتمداً/.test(await rules.unapprovedPatternIssue(saved(SUN_MON, "08:00", "09:20")) || ""), "U3 ويومان متتاليان يُمنعان كما كانا");
check(/لا توافق النمط المعتمد/.test(await rules.unapprovedPatternIssue(saved(SUN_WED, "08:00", "09:15")) || ""), "U3 وطولٌ غير معتمد على أيامٍ معتمدة يُمنع ويقول النهاية الصحيحة");
check(A.patternLengthIssue(theory3, SUN_WED, "08:00", "09:20") === "" && /09:20/.test(A.patternLengthIssue(theory3, SUN_WED, "08:00", "09:15")),
  "U3 حكمُ الطول: 80 على الأحد·الأربعاء سليم، و75 يُقال معه 09:20");
const lengthException = (days: Day[], start: string, end: string) => X.regulationExceptionIssues({ row: saved(days, start, end), week: [], courseHours: 3 }).some(issue => issue.rule === "lecture-length");
check(!lengthException(SUN_WED, "08:00", "09:20") && !lengthException(["fsunday", "fthursday"], "08:00", "09:20"),
  "U3 استثناءُ طول المحاضرة لا يُطلب لـ80 على الأحد·الأربعاء أو الأحد·الخميس");
check(lengthException(SUN_WED, "08:00", "09:15"), "U3 ويُطلب لطولٍ خارج المكتبة (75)");
check(await rules.mixedPatternNotice(7, SUN_WED as any, 1) === null && Boolean(await rules.mixedPatternNotice(7, SUN_MON as any, 1)),
  "U3 تنبيهُ الخلط لا يقال للأحد·الأربعاء، ويقال للأحد·الاثنين");

/* ── U4 النموذجُ والبطاقةُ السريعة ── */
const picked = A.pickDay(theory3, ["fsunday"], "fwednesday", true, 80);
check(picked.days.join() === "fsunday,fwednesday" && picked.applied?.minutes === 80, "U4 ضغطُ الأربعاء بعد الأحد يُطبَّق شكلاً معتمداً 80د", picked);
check(A.regulationFit(theory3, SUN_WED, "08:00", "09:20") === "fits" && A.regulationFit(theory4, MON_THU, "08:00", "09:50") === "fits",
  "U4 «يوافق اللائحة» للأحد·الأربعاء 80 والاثنين·الخميس 110");
check(A.regulationFit(theory3, SUN_MON, "08:00", "09:20") === "off" && A.regulationFit(theory3, SUN_WED, "08:00", "09:15") === "off",
  "U4 و«خارج اللائحة» للمتتاليين وللطول الغريب");
check(A.regulationEnd(theory3, SUN_WED, "11:00") === "12:20" && A.regulationEnd(theory3, SUN_MON, "11:00") === "",
  "U4 النهايةُ تُحسب من الشكل (11:00 ← 12:20)، ولا نهايةَ لأيامٍ متتالية");
const kept = A.completeRegulation(theory3, MON_THU, "09:30", { keepDays: true });
check(kept?.days.join() === "fmonday,fthursday" && kept?.end === "10:50", "U4 الإكمالُ يبقي الاثنين·الخميس وينهيه 10:50", kept);

/* ── U5 طلبُ الأستاذ ── */
const ctx = (hours: number) => ({
  instructorId: 5, allRows: [], instructorRowsAfter: [], instructors: new Map(), knownRoomKeys: ["legacy:T|1"], ladderBlocks: false,
  courses: new Map([[77, { AdCourseId: 77, CourseHours: hours, CourseCredit: hours, CourseName: "مقرر", CourseCode: "T77" }]]),
}) as any;
const asked = (days: Day[], start: string) => ({ rowId: null, tempId: -1, action: "add", AdCourseId: 77, days, start }) as any;
const sunWed = V.judgeRequest(asked(SUN_WED, "09:30"), ctx(3));
check(sunWed.sendable && !sunWed.reasons.some(reason => reason.blocking && reason.source === "shape"), "U5 طلبُ الأستاذ: الأحد·الأربعاء لثلاث ساعات يُرسل", sunWed.reasons);
check(sunWed.computedEnd === "10:50", "U5 ونهايتُه 80د (09:30 ← 10:50) لا 50/80", sunWed.computedEnd);
const monThu = V.judgeRequest(asked(MON_THU, "08:00"), ctx(4));
check(monThu.sendable && monThu.computedEnd === "09:50", "U5 والاثنين·الخميس لأربع ساعات 110د يُرسل", monThu.reasons);
const adjacent = V.judgeRequest(asked(SUN_MON, "08:00"), ctx(3));
check(!adjacent.sendable && adjacent.reasons.some(reason => reason.blocking && reason.source === "shape"), "U5 والأحد·الاثنين يُمنع كما كان");
check(L.meetingMinutes(SUN_WED, L.lengthPatternsForHours(3)).join() === "80,80" && L.meetingMinutes(SUN_MON, L.lengthPatternsForHours(3)).join() === "50,80",
  "U5 محرّكُ الطول في الخادم: 80+80 للأحد·الأربعاء، والمتتاليان على طول اليوم (فيُمنعان بالساعات أو الخلط)");
const browser = new Function(`${REQUEST_LENGTH_SCRIPT}; return meetingMinutes;`)() as (days: string[], patterns: unknown, own?: unknown) => number[];
check(browser(SUN_WED, L.lengthPatternsForHours(3)).join() === "80,80" && browser(MON_THU, L.lengthPatternsForHours(4)).join() === "110,110",
  "U5 ونسخةُ الصفحة تحسب الشيءَ نفسه من الأنماط التي يرسلها الخادم");

const { sectionDaysCompliant } = await import("../src/server/routes/publicRequestRoutes");
check(sectionDaysCompliant(3, new Set(SUN_WED), true) && sectionDaysCompliant(4, new Set(MON_THU), true) && !sectionDaysCompliant(3, new Set(SUN_MON), true),
  "U5 «ثبّت» جدول الأستاذ (pinReview): الأحد·الأربعاء والاثنين·الخميس ممتثلان، والمتتاليان يمنعان");

/* ── U6 الاستيراد ── */
check(R.daysApprovedForHours(3, SUN_WED) !== false && [...SUN_WED].every(day => R.libraryLengthsForDay(day).has(80)) && [...MON_THU].every(day => R.libraryLengthsForDay(day).has(80)),
  "U6 معاينةُ الاستيراد: لا «نمطٌ غير معتمد» ولا «طولٌ خارج المكتبة» للأحد·الأربعاء أو الاثنين·الخميس 80د");
check(R.daysApprovedForHours(3, SUN_MON) === false && !R.libraryLengthsForDay("fsunday").has(75), "U6 ويبقى التنبيه لأيامٍ متتالية ولطولٍ خارج المكتبة");

/* ── U7 ساكن: لا حكمَ بأيام المكتبة حرفاً ── */
const read = (file: string) => fs.readFileSync(file, "utf8");
const literal = /patternsForHours\([^)]*\)\.some\(\s*\(?(pattern|p)\)?\s*=>\s*(pattern|p)\.days\.length === days\.length/;
for (const file of ["src/utils/instructorRequestVerdict.ts", "src/server/routes/publicRequestRoutes.ts", "src/server/core/scheduleRules.ts", "src/utils/appointmentRegulation.ts"])
  check(!literal.test(read(file)) && !/patternsForHours\(hours\)\.some\(p=>sameDays/.test(read(file)), `U7 ${file}: لا يحكم بأيام المكتبة حرفاً`);
const pinRule = read("src/server/routes/publicRequestRoutes.ts").split("export function sectionDaysCompliant")[1]?.split("\n}")[0] || "";
check(/daysFitLibrary\(hours, days, exact\)/.test(pinRule) && !/patternsForHours|indexOf/.test(pinRule), "U7 «ثبّت» يقرأ المصدرَ الواحد بلا نسخةٍ ثانية من قاعدة التباعد");
check(/approvedShapesForHours\(hours\)\.map/.test(read("src/utils/requestMeetingLength.ts")), "U7 محرّكُ الطول (الخادم والصفحة) يقرأ المصدرَ الواحد");
check(/daysApprovedForHours\(hours, days\) === false/.test(read("src/components/ImportPreviewTable.tsx")), "U7 معاينةُ الاستيراد تحكم بالمصدر الواحد");

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\nPattern rule unify audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
