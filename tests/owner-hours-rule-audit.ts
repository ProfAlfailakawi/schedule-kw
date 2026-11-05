/** قرارات المالك 2026-11-05: حدود الساعات، وجملة آلة الزمن، و«لم نصل بعد»، ومُرسِل سجل الإرسال. */
import { readFileSync } from "fs";
import { sheetReach } from "../src/utils/courseReach";
import { judgeRequest } from "../src/utils/instructorRequestVerdict";
import { roomKeyOf } from "../src/utils/locationRegistry";
import { departmentHoursNote, scheduleDayWindowMinutes, withinUniversityDay } from "../src/utils/scheduleTime";
import { parseProblem } from "../src/utils/timeMachine";

let failures = 0;
const check = (ok: unknown, label: string, detail?: unknown) => { if (ok) console.log(`  ok  ${label}`); else { failures += 1; console.error(`FAIL  ${label}`, detail ?? ""); } };
const read = (path: string) => readFileSync(path, "utf8");
const at = (hour: number, minute = 0) => hour * 60 + minute;
const dept = { startTime: "08:00", endTime: "17:00" };

/* النافذة الافتراضية: بلا استثناء لا شيء أضيق. */
for (const [label, row] of [["بلا صف", null], ["صف فارغ", {}], ["قيم فارغة", { scheduleDayStartTime: "", scheduleDayEndTime: "" }], ["قيم فاسدة", { scheduleDayStartTime: "x", scheduleDayEndTime: "25:00" }], ["مقلوبة", { startTime: "19:00", endTime: "07:00" }], ["الافتراضي محفوظاً", { startTime: "08:00", endTime: "20:00" }]] as const) {
  const window = scheduleDayWindowMinutes(row as any);
  check(window.start === at(8) && window.end === at(20), `الافتراضي: ${label} يبقى 08:00–20:00`, window);
  check(departmentHoursNote(at(14), at(19, 50), row as any) === "", `الافتراضي: ${label} بلا تنبيه قسم`);
}
const wide = scheduleDayWindowMinutes({ startTime: "07:00", endTime: "21:00" });
check(wide.start === at(8) && wide.end === at(20), "نافذة محفوظة أوسع لا توسّع اليوم الجامعي", wide);

/* الحدّ المطلق من طرفيه. */
check(withinUniversityDay(at(8), at(20)), "08:00–20:00 مقبول بحدّيه");
check(!withinUniversityDay(at(19), at(20, 10)), "20:10 مرفوض");
check(!withinUniversityDay(at(7, 50), at(9)), "07:50 مرفوض");
check(departmentHoursNote(at(19), at(20, 10), dept) === "", "خارج اليوم الجامعي منعٌ لا تنبيه");

const verdictSource = read("src/utils/instructorRequestVerdict.ts");
const rules = read("src/server/core/scheduleRules.ts"), schedules = read("src/components/Schedules.tsx");

/* المجموعات الأربع. */
check(/!keptTime&&!withinUniversityDay\(start,end\)\)issues\.push/.test(rules), "نموذج الموعد + 20:00: الخادم يمنع");
check(/!withinUniversityDay\(mins\(form\.fstarttime\), mins\(form\.fendtime\)\)/.test(schedules) && /outsideTeachingDay\?`وقت المحاضرة يجب أن يكون بين/.test(schedules), "نموذج الموعد + 20:00: العميل يمنع ويقول السبب");
check(!/Math\.min\(SCHEDULE_DAY_END, mins\(start\) \+ duration\)/.test(schedules) && /endLimit=\{SCHEDULE_CLOCK_END_TIME\}/.test(schedules), "نموذج الموعد: لا قصّ للقيمة المكتوبة");
check(/ينتهي بعد نهاية دوام القسم \(17:00\)/.test(departmentHoursNote(at(14), at(18), dept)), "نموذج الموعد + دوام القسم: تنبيه");
check(!/sectionScheduleWindow/.test(rules.slice(rules.indexOf("export async function schedulePayloadIssues"), rules.indexOf("export async function schedulePayloadIssues") + 900)), "نموذج الموعد + دوام القسم: بوابة الحفظ لا تمنع به");
{
  const base = { id: 1, AdCollegeId: 1, AdSectionId: 5, AdTermId: 20, AdCourseId: 100, AdCourseName: "م", SCode: "01", AdInstructorId: 7, fsunday: true, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false, fstarttime: "08:00", fendtime: "08:50", AdRoomCode: "أ", AdRoomHall: "101" } as any;
  const context = (over: any = {}) => ({ instructorId: 7, allRows: [base], instructorRowsAfter: [base], courses: new Map([[100, { AdCourseId: 100, CourseCode: "C", CourseName: "م", CourseCredit: 1, CourseHours: 1 }]]), instructors: new Map([[7, { AdInstructorId: 7, AdInstructorName: "د. 7" }]]), knownRoomKeys: [roomKeyOf(undefined, "أ", "101")], windowOpen: true, ...over }) as any;
  const ask = (start: string, end: string) => ({ tempId: "t", action: "change", rowId: 1, AdCourseId: 100, SCode: "01", days: ["fsunday"], start, slots: [{ day: "fsunday", start, end }], room: "أ", hall: "101" }) as any;
  const reasonsOf = (verdict: any) => verdict.reasons.filter((reason: any) => reason.code === "day-end");
  const exception = { dayStart: at(8), dayEnd: at(17) };
  const teacherPast = judgeRequest(ask("14:00", "18:00"), context(exception));
  check(!teacherPast.sendable && reasonsOf(teacherPast)[0]?.blocking === true, "كرت الأستاذ + دوام القسم: 14:00–18:00 مع نهاية 17:00 يُمنع", teacherPast.reasons);
  const reader = judgeRequest(ask("14:00", "18:00"), context({ ...exception, departmentHoursWarnOnly: true }));
  check(reasonsOf(reader)[0]?.blocking === false, "قراءة القسم للطلب نفسه: تنبيه", reader.reasons);
  check(!judgeRequest(ask("19:00", "20:10"), context()).sendable, "كرت الأستاذ + 20:00: 20:10 يُمنع");
  check(!judgeRequest(ask("19:00", "20:10"), context({ departmentHoursWarnOnly: true })).sendable, "20:00 لا يليّنها شيء");
  check(!judgeRequest(ask("07:30", "08:30"), context()).sendable, "كرت الأستاذ + 08:00: يُمنع");
  check(!reasonsOf(judgeRequest(ask("14:00", "18:00"), context())).length, "كرت الأستاذ بلا استثناء: 18:00 بلا سبب قسم");
  const late = judgeRequest(ask("10:00", "11:00"), context({ dayStart: at(11) }));
  check(reasonsOf(late)[0]?.blocking === true, "كرت الأستاذ: قبل بداية دوام القسم يُمنع", late.reasons);
}
check(/departmentHoursWarnOnly: Boolean\(options\.forDepartment\) \|\| offeredByDepartment/.test(read("src/server/core/instructorRequests.ts")), "قراءة القسم وعرضه: تنبيه");

/* آلة الزمن. */
{
  const person = (id: number, name: string) => ({ AdInstructorId: id, AdInstructorName: name });
  const context = { rows: [], halls: [], courses: [], instructors: [person(5, "عضو هيئة تدريس تجريبي 5"), person(15, "عضو هيئة تدريس تجريبي 15"), person(7, "أحمد الغانم"), person(8, "د. سارة العلي")] } as any;
  const off = (text: string) => { const read = parseProblem(text, context) as any; return read?.kind === "teacherOff" ? read.instructorId : read?.kind || null; };
  check(off("عضو هيئة تدريس تجريبي 5 معتذر الخميس") === 5, "اسم بأرقام وبلا «د.»");
  check(off("عضو هيئة تدريس تجريبي ٥ معتذر الخميس") === 5, "الأرقام العربية");
  check(off("عضو هيئة تدريس تجريبي 15 معتذر الخميس") === 15, "5 لا تطابق 15");
  check(off("أحمد الغانم معتذر الخميس") === 7, "«الغ» داخل الاسم ليست إلغاءً");
  check(off("د. سارة العلي معتذر الخميس") === 8 && off("سارة معتذر الخميس") === 8, "اللقب وجزء الاسم");
  check(off("عضو تدريس معتذر الخميس") === null && off("5 معتذر الخميس") === null, "المبهم والرقم وحده لا يُخمَّنان");
  const machine = read("src/components/TimeMachine.tsx");
  check(/filter\(example => example && parseProblem\(example, context\)\)/.test(machine), "الاقتراح لا يُعرض إلا مفهوماً");
}

/* لم نصل بعد. */
{
  const reach = (overrides: number[]) => sheetReach({
    sheet: { courseIds: [1, 2, 9], rules: [{ courseId: 2, prereq: { all: [1], anyOf: [] } }] as any },
    history: [{ chronology: 20251, courseIds: [9] }, { chronology: 20261, courseIds: [1] }],
    currentChronology: 20261, levelOf: id => id === 2 ? 200 : 100, codeOf: String, overrides,
  } as any).get(2)!;
  check(reach([]).state === "locked" && reach([]).why === "prereq-missing", "متطلبٌ أولُ طرحه هذا الفصل: يبقى مقفلاً", reach([]));
  check(reach([2]).state === "reached" && reach([2]).overridden === true, "فتحه القسم يدوياً: يُفتح", reach([2]));
}

/* مُرسِل السجل. */
{
  const route = read("src/server/routes/instructorRequestsRoutes.ts"), view = read("src/components/PublishSendLog.tsx");
  check(/by: String\(req\.user\?\.Name \|\| req\.user\?\.UserName \|\| ""\), mode: issueMode/.test(route), "المُرسِل يُكتب من الجلسة");
  check(/by: String\(row\.by \|\| ""\)/.test(route), "والسطر القديم يعود فارغاً");
  check(/row\.by \? `أرسله \$\{row\.by\}` : ""/.test(view), "ولا يُعرض له شيء");
}

if (failures) { console.error(`\n${failures} فشل`); process.exit(1); }
console.log("\nowner-hours-rule-audit: كلها سليمة");
