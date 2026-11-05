/**
 * ── الدوام الشامل إعدادٌ واحد ───────────────────────────────────────────────
 * المصدر واحد للمتصفح والخادم (روابط حيّة في scheduleTime.ts)، والافتراضي 08:00–20:00،
 * والأوسع والأضيق يصلان البوابات، والفاسد يعود للافتراضي، وغير المدير يُرفض في الخادم.
 */
import "../src/server/core/hallBarter";
import fs from "fs";
import path from "path";
import { Repository } from "../src/db/repository";
import { refreshUniversityDay, saveUniversityDay, invalidateUniversityDay } from "../src/server/core/universityDay";
import { buildOccupancyHeat } from "../src/utils/occupancyHeat";
import { judgeRequest } from "../src/utils/instructorRequestVerdict";
import {
  applyUniversityDay, cleanUniversityDay, departmentHoursNote, scheduleDayWindowMinutes, universityDayIssue, withinUniversityDay,
  SCHEDULE_DAY_END, SCHEDULE_DAY_END_TIME, SCHEDULE_DAY_LAST_MINUTE, SCHEDULE_DAY_SPAN, SCHEDULE_DAY_START, SCHEDULE_DAY_START_TIME,
} from "../src/utils/scheduleTime";

let failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => { if (!ok) failed++; console.log(`${ok ? "✓" : "✗"} ${label}${!ok && detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); };
const read = (file: string) => fs.readFileSync(file, "utf8");
const at = (hour: number, minute = 0) => hour * 60 + minute;
const row = (start: string, end: string) => ({ fsunday: true, fstarttime: start, fendtime: end });

async function main() {
  const { requireRootAdmin } = await import("../src/server/core/auth");
  const { schedulePayloadIssues } = await import("../src/server/core/scheduleRules");
  /* الافتراضي */
  applyUniversityDay(null);
  check(SCHEDULE_DAY_START === at(8) && SCHEDULE_DAY_END === at(20) && SCHEDULE_DAY_SPAN === 720, "الافتراضي 08:00–20:00");
  check(withinUniversityDay(at(8), at(20)) && !withinUniversityDay(at(7, 55), at(9)), "الافتراضي يمنع ما قبله");

  /* غير صالح */
  const bad: Array<[unknown, unknown]> = [["20:00", "08:00"], ["08:00", "08:00"], ["08:03", "20:00"], ["08:00", "24:05"], ["25:00", "26:00"], ["8:00", "20:00"], ["", ""], [null, undefined], ["a", "b"]];
  for (const [start, end] of bad) {
    check(Boolean(universityDayIssue(start, end)), `يُرفض ${start}–${end}`);
    check(cleanUniversityDay({ startTime: start as string, endTime: end as string }).startTime === "08:00", `يعود للافتراضي ${start}–${end}`);
  }
  check(!universityDayIssue("00:00", "24:00"), "00:00–24:00 مقبول");
  applyUniversityDay({ startTime: "20:00", endTime: "08:00" });
  check(SCHEDULE_DAY_START_TIME === "08:00", "قيمةٌ فاسدة في الوثيقة لا تكسر البرنامج");

  /* أوسع */
  applyUniversityDay({ startTime: "07:00", endTime: "21:00" });
  check(SCHEDULE_DAY_START === at(7) && SCHEDULE_DAY_END_TIME === "21:00" && SCHEDULE_DAY_SPAN === 840, "المستورِد يقرأ القيمة الحية");
  check(withinUniversityDay(at(7), at(21)), "الأوسع يسمح");
  check((await schedulePayloadIssues(row("20:00", "20:50"))).length === 0, "بوابة الخادم تقرأ الأوسع");
  check(scheduleDayWindowMinutes({ startTime: "06:00", endTime: "22:00" }).end === at(21), "القسم يُقصّ على الدوام الشامل عند القراءة");
  const dept = scheduleDayWindowMinutes({ startTime: "08:00", endTime: "17:00" });
  check(dept.end === at(17), "استثناء القسم الأضيق باقٍ");
  check(departmentHoursNote(at(20), at(20, 50), null) === "", "بلا استثناء لا تنبيه");
  check(buildOccupancyHeat([], () => "").hours.length === 14, "شبكة الإشغال تتّسع للأوسع");

  /* 24:00 تبقى ساعةً تُحفظ عند القص */
  applyUniversityDay({ startTime: "00:00", endTime: "24:00" });
  check(SCHEDULE_DAY_END === 1440 && SCHEDULE_DAY_LAST_MINUTE === 1439, "نهاية 24:00 تُقصّ عند 23:59");

  /* أضيق */
  applyUniversityDay({ startTime: "09:00", endTime: "17:00" });
  check((await schedulePayloadIssues(row("08:00", "08:50"))).some(text => text.includes("09:00–17:00")), "الأضيق يمنع برسالته");
  check((await schedulePayloadIssues(row("08:00", "08:50"), { keptTime: true })).length === 0, "الموعد القائم بلا تغيير يعمل");
  const heat = buildOccupancyHeat([{ ...row("08:00", "08:50"), id: 1 } as any], () => "r");
  check(heat.hours[0] === at(8), "محاضرةٌ خارج الدوام الأضيق تبقى في الشبكة", heat.hours);
  {
    const base = { id: 1, AdCollegeId: 1, AdSectionId: 5, AdTermId: 20, AdCourseId: 100, AdCourseName: "م", SCode: "01", AdInstructorId: 7, fsunday: true, fstarttime: "10:00", fendtime: "10:50" };
    const context = { instructorId: 7, allRows: [base], instructorRowsAfter: [base], courses: new Map([[100, { AdCourseId: 100, CourseName: "م" }]]) } as any;
    const ask = { tempId: "t", action: "change", rowId: 1, AdCourseId: 100, SCode: "01", days: ["fsunday"], start: "08:00", end: "08:50", blockMinutes: 50 } as any;
    const verdict = judgeRequest(ask, context);
    check(!verdict.sendable && verdict.reasons.some((reason: any) => reason.text.includes("09:00")), "كرت الأستاذ يقرأ الأضيق برسالته", verdict.reasons);
  }

  /* التخزين والذاكرة */
  applyUniversityDay(null);
  await saveUniversityDay({ startTime: "07:30", endTime: "20:30" });
  check(SCHEDULE_DAY_START_TIME === "07:30", "الحفظ يطبّق فوراً");
  applyUniversityDay(null);
  invalidateUniversityDay();
  await refreshUniversityDay();
  check(SCHEDULE_DAY_START_TIME === "07:30", "نسخةٌ أخرى تقرأ الوثيقة بعد الإبطال");
  await Repository.outsideDemoSandbox(() => Repository.saveFeatureDoc("universityDay", "global", { startTime: "x", endTime: "y" }));
  await refreshUniversityDay();
  check(SCHEDULE_DAY_START_TIME === "08:00", "وثيقةٌ تالفة = الافتراضي");

  /* الصلاحية في الخادم */
  let status = 0, passed = false;
  const res: any = { status(code: number) { status = code; return this; }, json() { return this; } };
  requireRootAdmin({ user: { SystemUserId: 999 } } as any, res, () => { passed = true; });
  check(status === 403 && !passed, "غير المدير الرئيسي يُرفض");
  const routes = read("src/server/routes/referenceRoutes.ts");
  check(/app\.put\("\/api\/admin\/university-day",requirePermission\(7\),requireRootAdmin,/.test(routes), "الحفظ خلف الصلاحية والمدير الرئيسي");
  check(/app\.get\("\/api\/admin\/university-day\/impact",requirePermission\(7\),requireRootAdmin,/.test(routes), "معاينة الأثر خلفهما");
  check(/res\.locals\.auditChanges=`الدوام الشامل: /.test(routes), "التغيير في سجل التدقيق");
  check(/"\/admin\/university-day"/.test(read("src/server/core/auth.ts")), "جلسة العرض لا تكتب الإعداد");
  check(/app\.use\(universityDayFresh\)/.test(read("server.ts")), "كل طلب يمرّ بالقراءة قبل البوابات");
  check(/invalidateUniversityDay\(\)/.test(read("src/server/core/liveChannel.ts")), "المنارة تُبطل ذاكرة النسخ الأخرى");

  /* لا نسخة مجمّدة ولا رقم مكتوب */
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : /\.tsx?$/.test(entry.name) ? [full] : [];
  });
  const frozen = /^(?:export )?const \w+ = (?:SCHEDULE_DAY_(?:START|END|SPAN)|\{[^}]*SCHEDULE_DAY_)/m;
  const offenders = walk("src").filter(file => !file.endsWith("utils/scheduleTime.ts") && frozen.test(read(file)));
  check(offenders.length === 0, "لا ثابت على مستوى الملف ينسخ الدوام الشامل", offenders);
  for (const file of ["src/server/routes/scheduleToolsRoutes.ts", "src/utils/academicDecisionLab.ts", "src/server/roomDoorPage.ts"])
    check(!/[<>]=? ?(480|1200)\b/.test(read(file)), `لا 480/1200 في ${file}`);
  check(!/"08:00"/.test(read("src/components/TimeCounter.tsx")), "عجلة الوقت بلا رقم مكتوب");
}

main().then(() => {
  console.log(failed ? `✗ ${failed} فشل` : "✓ الدوام الشامل إعدادٌ واحد");
  process.exit(failed ? 1 : 0);
}).catch(error => { console.error(error); process.exit(1); });
