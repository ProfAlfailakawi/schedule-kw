/**
 * ── مراجعة شاشة «موعد» (2026-11-14): ما نُفِّذ منها، بلا متصفح ───────────────────────────
 *
 *  F  «نبض الطلبة» (src/utils/studentFit.ts): من يحجبهم الوقت عن مقررٍ آخر، الخريجون والطلبة، والمسار.
 *  H  رسائل الساعات (src/utils/hoursIssue.ts): الكاتبُ والقارئ واحد لكل عدد (ساعة واحدة، ساعتان، 12 ساعة).
 *  T  «ساعةٌ تفهمك» (afternoonClock): «2» ← 14:00 و«130» ← 13:30، و«0730» الصريحة تبقى مرفوضة.
 *  V  حجزٌ يتعارض فيه الأستاذ والقاعة معاً: بطاقة القاعة تقول «تعارض» من الآن (appointmentVerdict).
 *  S  الربط في المصدر: الخادم يرسل studentFit، والنموذج يرسم StudentPulse، وEsc يسأل قبل الإغلاق.
 */
import fs from "node:fs";
import { studentFitOf } from "../src/utils/studentFit";
import type { DemandCourse, DemandMatch, DemandReport } from "../src/utils/actualDemand";
import type { ClashRow } from "../src/utils/actualDemandGraduates";
import { freshSectionOf, freshSectionTail, overHoursMessage, parseHoursIssue } from "../src/utils/hoursIssue";
import { sectionHoursShortfallText } from "../src/utils/scheduleRegulations";
import { afternoonClock, normalizeClock } from "../src/components/TimeField";
import { appointmentVerdict } from "../src/utils/appointmentVerdict";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra ?? ""); }
};

/* ── F ─────────────────────────────────────────────────────────────── */
const course = (code: string, programs: Array<[string, number, number]>): DemandCourse => {
  const boys = programs.reduce((s, p) => s + p[1], 0), girls = programs.reduce((s, p) => s + p[2], 0);
  return { code, name: `مقرر ${code}`, units: 3, offered: { boys: 0, girls: 0 }, average: { boys: 0, girls: 0 }, students: { boys, girls, total: boys + girls },
    suggested: { boys: 0, girls: 0, total: 0 }, programs: programs.map(([c, b, g]) => ({ code: c, name: c, boys: b, girls: g, total: b + g })) };
};
const report = (courses: DemandCourse[]): DemandReport => ({ termLabel: "", department: "تكنولوجيا التعليم", facultyCount: 0, legalLoad: 0, warnings: [], courses });
const graduates = report([
  course("0109468", [["BA-0115", 10, 6]]),
  course("0109491", [["BA-0115", 4, 3], ["BA-0136", 2, 0]]),
  course("0109499", [["BA-0136", 5, 0]]),
]);
const general = report([
  course("0109468", [["BA-0115", 40, 30]]),
  course("0109491", [["BA-0115", 12, 9]]),
]);
const matches = new Map<string, DemandMatch>([
  ["0109468", { code: "0109468", status: "matched", courseIds: [1, 2] }],
  ["0109491", { code: "0109491", status: "matched", courseIds: [3, 4] }],
  ["0109499", { code: "0109499", status: "matched", courseIds: [5, 6] }],
]);
const members = [{ collegeId: 11, track: "boys" as const }, { collegeId: 12, track: "girls" as const }];
const row = (id: number, courseId: number, college: number, code: string, days: string[], start: string, end: string): ClashRow =>
  ({ id, AdCourseId: courseId, AdCollegeId: college, SCode: code, fstarttime: start, fendtime: end, ...Object.fromEntries(days.map(d => [d, true])) });
const rows = [
  row(1, 3, 11, "01", ["fsunday", "ftuesday"], "08:00", "09:20"), // 0109491 بنين: شعبةٌ واحدة
  row(2, 5, 11, "01", ["fmonday"], "10:00", "12:50"),              // 0109499 بنين
  row(3, 4, 12, "51", ["fsunday"], "08:00", "09:20"),              // 0109491 بنات
];
const clashing = studentFitOf({ general, graduates, matches, members, rows, candidate: row(-1, 1, 11, "01", ["fsunday", "ftuesday"], "08:00", "09:20") });
check(clashing?.track === "boys" && clashing.graduates?.need === 10 && clashing.graduates.blocked === 4 && clashing.graduates.percent === 60,
  "F1 الخريجون بنين: 0109468 فوق كل شعب 0109491 يحجب ٤ من ١٠ ← ٦٠٪", clashing?.graduates);
check(clashing?.graduates?.clashes[0]?.code === "0109491" && clashing.graduates.clashes[0].students === 4, "F1 المقرر المحجوب يُسمّى ومعه عدده", clashing?.graduates?.clashes);
check(clashing?.students?.need === 40 && clashing.students.blocked === 12 && clashing.students.percent === 70, "F1 الطلبة: ١٢ من ٤٠ ← ٧٠٪", clashing?.students);
check(clashing?.sections.before === 0 && clashing.sections.after === 1, "F1 الشعب في المسار ٠ ← ١", clashing?.sections);
const free = studentFitOf({ general, graduates, matches, members, rows, candidate: row(-1, 1, 11, "01", ["fsunday", "ftuesday"], "10:00", "11:20") });
check(free?.graduates?.percent === 100 && free.graduates.blocked === 0 && !free.graduates.clashes.length, "F2 وقتٌ لا يحجب أحداً ← ١٠٠٪", free?.graduates);
const withSpare = [...rows, row(4, 3, 11, "02", ["fmonday", "fwednesday"], "08:00", "09:20")];
const spare = studentFitOf({ general, graduates, matches, members, rows: withSpare, candidate: row(-1, 1, 11, "01", ["fsunday", "ftuesday"], "08:00", "09:20") });
check(spare?.graduates?.blocked === 0, "F3 شعبةٌ بديلة لا تتداخل: لا حجب (يأخذ الطالب الأخرى)", spare?.graduates);
const girls = studentFitOf({ general, graduates, matches, members, rows, candidate: row(-1, 2, 12, "51", ["fsunday"], "08:30", "09:00") });
check(girls?.track === "girls" && girls.graduates?.need === 6 && girls.graduates.blocked === 3, "F4 البنات بمسارهن: ٣ من ٦", girls?.graduates);
check(studentFitOf({ general: null, graduates: null, matches, members, rows, candidate: row(-1, 1, 11, "01", ["fsunday"], "08:00", "09:00") }) === null, "F5 بلا تقرير: لا حكم");
check(studentFitOf({ general, graduates, matches, members, rows, candidate: row(-1, 99, 11, "01", ["fsunday"], "08:00", "09:00") }) === null, "F5 مقررٌ غير مطابَق في التقرير: لا حكم");
const moved = studentFitOf({ general, graduates, matches, members, rows: [...rows, row(9, 1, 11, "01", ["fsunday", "ftuesday"], "08:00", "09:20")],
  candidate: row(9, 1, 11, "01", ["fsunday", "ftuesday"], "10:00", "11:20"), replaces: 9 });
check(moved?.graduates?.percent === 100 && moved.sections.before === 1 && moved.sections.after === 1, "F6 تعديل موعدٍ قائم: يُقرأ الجديد مكانه، والشعب لا تتضاعف", moved);

/* ── H ─────────────────────────────────────────────────────────────── */
for (const [hours, total] of [[1, 100], [2, 150], [3, 200], [10, 600], [12, 700]] as const) {
  const text = overHoursMessage(hours, total) + freshSectionTail("502");
  const read = parseHoursIssue(text);
  check(read?.kind === "over" && read.hours === hours && read.total === Math.round(total / 50), `H1 «زائدة» تُقرأ لكل عدد: ${hours} ساعة ← ${Math.round(total / 50)}`, { text, read });
  check(freshSectionOf(text) === "502", `H1 «شعبة جديدة» تُقرأ (${hours})`);
}
const under = parseHoursIssue(sectionHoursShortfallText("501", { total: 100, required: 150 } as any));
check(under?.kind === "under" && under.got === 100 && under.need === 150, "H2 «ناقصة» تُقرأ من كاتبها نفسه", under);
check(parseHoursIssue("القاعة مشغولة") === null && freshSectionOf("لا شيء") === "", "H3 ما ليس رسالة ساعات لا يُقرأ");

/* ── T ─────────────────────────────────────────────────────────────── */
check(afternoonClock("0200") === "14:00" && afternoonClock("0130") === "13:30" && afternoonClock("0700") === "19:00", "T1 الاختصار 1–7 يُقرأ عصراً");
check(afternoonClock("0745") === "19:45" && afternoonClock("0759") === "19:59" && afternoonClock("0800") === "", "T2 حدود الدوام (20:00) وما فوق 7 لا يُمسّ");
check(normalizeClock("0730") === "" && normalizeClock("1400") === "14:00", "T3 أربع خانات صريحة تُقرأ كما كُتبت");

/* ── V ─────────────────────────────────────────────────────────────── */
const form = { AdCourseId: 1, AdInstructorId: 7, buildingId: "b", roomId: "r", AdRoomCode: "901A01", AdRoomHall: "L01", fsunday: true, fstarttime: "09:00", fendtime: "09:50" };
const both = appointmentVerdict({ form, validationIssues: [], conflicts: [{ type: "instructor", severity: "high", reasons: ["instructor", "room"], rowId: 5, otherId: 5, message: "الأستاذ لديه محاضرة متداخلة" }] });
const roomCheck = both.checks.find(item => item.kind === "room");
check(roomCheck?.state === "block" && /901A01\/L01 مشغولة/.test(roomCheck.details[0]?.text || ""), "V1 الأستاذ والقاعة معاً: بطاقة القاعة «تعارض» من الآن", roomCheck);
const teacherOnly = appointmentVerdict({ form, validationIssues: [], conflicts: [{ type: "instructor", severity: "high", reasons: ["instructor"], rowId: 5, otherId: 5, message: "x" }] });
check(teacherOnly.checks.find(item => item.kind === "room")?.state === "ok", "V2 الأستاذ وحده: القاعة سليمة");

/* ── S ─────────────────────────────────────────────────────────────── */
const schedules = fs.readFileSync("src/components/Schedules.tsx", "utf8");
const review = fs.readFileSync("src/server/routes/scheduleReviewRoutes.ts", "utf8");
check(/appointmentDemandFor\(req,row\)/.test(review) && /studentFit\?\{studentFit\}/.test(review), "S1 الخادم يرسل studentFit مع الفحص");
check(/<StudentPulse fit=\{studentFit\}/.test(schedules), "S2 النموذج يرسم «نبض الطلبة»");
check(/backRef\.current = \(\) => \{ void requestClose\(\); \}/.test(schedules) && /onClick=\{\(\) => void requestClose\(\)\}/.test(schedules), "S3 Esc و✕ يسألان قبل إغلاق نموذجٍ تغيّر");
check(/editor==="edit"&&!editorDirty/.test(schedules), "S4 «تعديل» بلا تغيير: الحفظ مطفأ");
check(/resolveRegistryRoom\(usualRoom\.building, usualRoom\.hall\)/.test(schedules), "S5 «املأ كالمعتاد» يكتب معرّفَي القاعة الرسميين");
check(!/ساعات هذا المقرر المعتمدة \(\\d\+\) ساعات/.test(schedules + fs.readFileSync("src/components/AppointmentChecksPanel.tsx", "utf8")), "S6 لا تعبيرَ منسوخ لرسالة الساعات");

console.log(`\nappointment-review-1114 audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
