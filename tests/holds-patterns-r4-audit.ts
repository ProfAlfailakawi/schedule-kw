/**
 * ملاحظات المالك 2026-11-05: 1، 4، 8، 10، 15، 19، 20.
 * النقطة 19 تُعيد إنتاج «المكتبة تتصرف من تلقائها» على المحرّك نفسه ثم تثبت الإصلاح.
 */
import { readFileSync } from "fs";
import { completeRegulation, pickDay, regulationEnd, regulationFit } from "../src/utils/appointmentRegulation";
import { departmentHoursNote, withinUniversityDay } from "../src/utils/scheduleTime";
import { isSpecializationCourse, sameCourseSectionClash } from "../src/utils/scheduleRegulations";
import { normalizeClock } from "../src/components/TimeField";
import { holdMatchesDraft } from "../src/components/RequestHoldSheet";
import { appointmentVerdict } from "../src/utils/appointmentVerdict";

let failures = 0;
const check = (ok: unknown, label: string, detail?: unknown) => {
  if (ok) console.log(`  ok  ${label}`);
  else { failures += 1; console.error(`FAIL  ${label}`, detail ?? ""); }
};
const read = (path: string) => readFileSync(path, "utf8");
const join = (days: readonly string[] | undefined) => (days || []).join("+");
const theory3 = { CourseHours: 3, CourseTeachingMode: "theoretical" };
const theory4 = { CourseHours: 4, CourseTeachingMode: "theoretical" };
const theory5 = { CourseHours: 5, CourseTeachingMode: "theoretical" };
const lab3 = { CourseHours: 3, CourseTeachingMode: "practical" };

/* ── 19: السبب الجذري: يومٌ منفرد كان يُقرأ كتلة ── */
{
  check(regulationEnd(theory3, ["fsunday"], "09:00") === "11:50", "19 القراءة القديمة بلا طول تبقى لموعدٍ جديد (هي مصدر الخلل حين يُعرف الطول)");
  check(regulationEnd(theory3, ["fsunday"], "09:00", 50) === "", "19 صفُّ الأحد 50د لا يصير 170د عند تغيير بدايته");
  check(completeRegulation(theory3, ["fsunday"], "09:00", { minutes: 50, keepDays: true }) === null, "19 الإكمال لا يعيد تشكيل لقاءٍ منفرد");
  check(completeRegulation(theory3, ["fwednesday"], "08:00", { minutes: 170, keepDays: true })?.end === "10:50", "19 الكتلة المقصودة تبقى كتلة");
  check(completeRegulation(theory3, ["fsunday", "fthursday"], "08:00", { minutes: 50, keepDays: true }) === null, "19 أيامٌ اختارها صاحبها لا تُستبدل");
  check(join(completeRegulation(theory3, ["fsunday", "fthursday"], "08:00")?.days) === "fsunday+ftuesday+fthursday", "19 مقررٌ جديد (بلا keepDays) ما زال يُكمل نمطه");
  const left = pickDay(theory4, ["fsunday", "ftuesday"], "ftuesday", false, 110);
  check(join(left.days) === "fsunday" && left.applied === null, "19 يومٌ بقي بعد إزالة أخيه ليس كتلة 230د", left);
  const noTime = pickDay(theory4, ["fsunday", "ftuesday"], "ftuesday", false);
  check(noTime.applied === null, "19 وبلا وقتٍ بعد: النظريُّ لا يُفترض كتلة");
  const sunThu = pickDay(theory4, ["fsunday"], "fthursday", true, 110);
  check(join(sunThu.days) === "fsunday+fthursday" && Boolean(sunThu.applied), "19 الأحد·الخميس لأربع ساعات صار يُوصل إليه بالضغط (كان يُسقط الأحد)", sunThu);
  const labMove = pickDay(lab3, ["fwednesday"], "fmonday", true, 170);
  check(join(labMove.days) === "fmonday+fwednesday" && labMove.alternatives.length > 0, "19 ضغط يوم لا يحذف يوم الكتلة، والشرائح تعرض البديل", labMove);
  check(regulationFit(theory3, ["fsunday"], "08:00", "08:50") === "fits", "19 لقاءٌ من نمطٍ معتمد في صفٍّ مستقل ليس «خارج اللائحة»");
  check(regulationFit(theory5, ["fmonday", "fwednesday"], "08:00", "10:50") === "fits", "19 نمط الخمس ساعات (170+110) معتمد في المكتبة فلا يُعلَّم");
  check(regulationFit(theory3, ["fsunday"], "08:00", "09:00") === "off", "19 طولٌ خارج المكتبة ما زال يُنبَّه إليه");
  const editor = read("src/components/Schedules.tsx");
  check(/const library = regulationEnd\(course, daysOfRow\(row as any\), start, span\)/.test(editor) && /pickDay\(formCourse, formDays, day, checked, formSpan\)/.test(editor) && /minutes: formSpan, keepDays/.test(editor), "19 المحرر يمرّر الطول القائم في كل مسار");
  check(/regulationEnd\(courseById\.get\(Number\(row\.AdCourseId\)\) as any, days, start, span\)/.test(read("src/components/ImportPreviewTable.tsx")), "19 معاينة الاستيراد تحفظ الطول");
  check(/pickDay\(selectedCourse, chosenDays, day, checked, minutesOf\(draft\.end\) - minutesOf\(draft\.start\)\)/.test(read("src/components/QuickCreatePopover.tsx")), "19 الموعد السريع يحفظ الطول");
}

/* ── 15: كتابة الساعة وحدها ── */
{
  check(normalizeClock("1400") === "14:00" && normalizeClock("0900") === "09:00", "15 الصيغة الكاملة");
  const field = read("src/components/TimeField.tsx");
  check(/digits\.length <= 2 \? `\$\{digits\.padStart\(2, "0"\)\}00` : `0\$\{digits\}`/.test(field) && /settle\(\); onBlur/.test(field), "15 «14» تُحسب 14:00 عند الخروج من الحقل، و«930» 09:30");
}

/* ── 20: تجاوز نهاية الدوام تنبيه ── */
{
  const window = { startTime: "08:00", endTime: "18:00" };
  check(withinUniversityDay(17 * 60, 18 * 60 + 50) && /ينتهي بعد نهاية الدوام المسموح/.test(departmentHoursNote(17 * 60, 18 * 60 + 50, window)), "20 داخل يوم الجامعة وبعد دوام القسم: تنبيه في النموذج");
  check(!withinUniversityDay(7 * 60, 9 * 60) && !withinUniversityDay(19 * 60, 20 * 60 + 10), "20 خارج يوم الجامعة مرفوض (قرار 2026-11-05؛ التفاصيل في owner-hours-rule-audit)");
  check(/withinUniversityDay\(start,end\)/.test(read("src/server/core/scheduleRules.ts")), "20 الخادم يقرأ يوم الجامعة");
}

/* ── 8: شعبتان من مقرر واحد ── */
{
  const course = { AdSectionId: 7 };
  const row: any = { id: 1, AdCourseId: 5, AdCollegeId: 1, SCode: "01", fsunday: true, fstarttime: "08:00", fendtime: "08:50" };
  const other: any = { id: 2, AdCourseId: 5, AdCollegeId: 1, AdSectionId: 7, SCode: "02", fsunday: true, fstarttime: "08:00", fendtime: "08:50" };
  check(sameCourseSectionClash(row, [other], course)?.id === 2, "8 شعبتان بالوقت نفسه");
  check(!sameCourseSectionClash(row, [{ ...other, AdCollegeId: 2 }], course), "8 الكليتان لا تتنافسان");
  check(!sameCourseSectionClash(row, [{ ...other, ftuesday: true, fsunday: false }], course), "8 يومٌ آخر لا يتعارض");
  check(!sameCourseSectionClash(row, [{ ...other, SCode: "01" }], course), "8 الشعبة نفسها حكمها التكرار");
  check(!sameCourseSectionClash(row, [{ ...other, AdSectionId: 9 }], course), "8 شعبة مقرر الخدمة في قسم آخر لا تُحسب");
  check(isSpecializationCourse(course, 7) && !isSpecializationCourse(course, 8), "8 التخصص هو ما يملكه قسم الشعبة");
  const conflicts = read("src/server/core/scheduleConflicts.ts");
  check(/type: "regulation", severity: "low", soft: true/.test(conflicts), "8 في «موعد» تنبيهٌ لا يمنع");
  const requests = read("src/server/core/instructorRequests.ts");
  check(/sectionClashBlocks: !options\.forDepartment/.test(requests) && /code: "section-clash", blocking: true/.test(read("src/utils/instructorRequestVerdict.ts")), "8 في كرت الأستاذ يمنع");
}

/* ── 4 و10: الحجز يقارن ولا يمنع ── */
{
  const hold = { requestId: "r", instructorId: 3, courseId: 5, days: ["fsunday", "ftuesday"], start: "08:00", end: "08:50" };
  const draft: any = { AdInstructorId: 3, AdCourseId: 5, fsunday: true, ftuesday: true, fstarttime: "08:00" };
  check(holdMatchesDraft(hold, draft), "4 الوقت نفسه للأستاذ والمقرر نفسيهما: ثبّت أم ارفض");
  check(!holdMatchesDraft(hold, { ...draft, fstarttime: "09:00" }) && !holdMatchesDraft(hold, { ...draft, AdInstructorId: 9 }), "4 غير ذلك: تستخدمها؟");
  const verdict = appointmentVerdict({ form: { AdRoomCode: "1", AdRoomHall: "2" } as any, validationIssues: [],
    conflicts: [{ type: "room", severity: "high", message: "القاعة مشغولة", holdRequestId: "r", holdInstructorName: "د. سالم" }] } as any);
  const room = verdict.checks?.find((item: any) => item.kind === "room") as any;
  check(!JSON.stringify(verdict).includes('"blocks":true') && JSON.stringify(verdict).includes("محجوز لطلب د. سالم"), "10 الحجز لا يمنع في الحكم ويسمّي صاحبه", room);
  const schedules = read("src/components/Schedules.tsx");
  check(!/window\.confirm\(`⏳/.test(schedules) && /askRequestHold\(\{ holds: failure\.holds, verb, draft \}\)/.test(schedules), "4 ورقة قرار بدل نافذة التأكيد");
  check(/requestHoldRefusal\(\[\.\.\.new Set\(blockingSave/.test(read("src/server/core/scheduleWrites.ts")), "4 الرفض يحمل تفاصيل البند");
  const refusal = read("src/server/core/scheduleConflicts.ts");
  check(/itemIds\.includes\(instructorRequestItemIdentity\(item\)\)/.test(refusal) && !/findIndex\(waiting\)/.test(refusal) && /requestIds: string\[\], itemIds: string\[\]\)/.test(refusal), "4 الحجز يُعرَّف ببنده لا بأول بندٍ منتظر");
  for (const file of ["src/server/core/scheduleWrites.ts", "src/server/routes/scheduleToolsRoutes.ts"]) {
    check(!/requestHoldRefusal\(\[[^\]]*\]\)/.test(read(file)), `4 كل مستدعٍ يمرّر هوية البند: ${file}`);
  }
  check(/canReject = holds\.every/.test(read("src/components/RequestHoldSheet.tsx")), "4 لا «ارفض» حين يُجهل البند");
  check(/revisions\.get\(hold\.requestId\)/.test(schedules), "4 رفض بندين من طلبٍ واحد يتتبّع النسخة");
  check(/addedHere/.test(read("src/server/core/scheduleConflicts.ts")), "4 «ثبّت الطلب» يثبّت بند الإضافة المطابق");
}

/* ── 1: بند القسم ── */
{
  const inbox = read("src/components/InstructorInbox.tsx");
  check(/إلغاء الموعد/.test(inbox) && /CancelScheduledSheet/.test(inbox) && /fromSchedule/.test(inbox), "1 «إلغاء الموعد» بدل «رفض»");
  const route = read("src/server/routes/instructorRequestsRoutes.ts");
  check(/cancel-scheduled/.test(route) && /اكتب سطراً للأستاذ/.test(route) && /runScheduleHandler\(deleteScheduleHandler/.test(route), "1 الإلغاء يحذف بالمسار نفسه ويطلب سطراً للأستاذ");
  check(/noteDepartmentAddition\(newSched/.test(read("src/server/core/scheduleWrites.ts")), "1 موعد القسم يصير بنداً في طلب الأستاذ");
  check(/__cancelScheduled = true/.test(route) && /!\(req as any\)\.__cancelScheduled\) await forgetDepartmentAddition/.test(read("src/server/core/scheduleWrites.ts")), "1 الإلغاء لا يتسابق مع رفع البند على نسخة الطلب");
  check(/ألغى القسم هذا الموعد/.test(read("src/server/pages/instructorRequestPage.ts")), "1 الأستاذ يقرأ السطر");
  check(/departmentItems/.test(read("src/server/routes/publicRequestRoutes.ts")), "1 إعادة بناء الطلب غير المرسل لا تُسقط بند القسم");
}

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nholds-patterns-r4-audit: all checks passed");
