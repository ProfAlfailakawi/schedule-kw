/** مراجعة 2026-11-05 المستقلة: ثمانية عيوب على main، كلٌّ بما يعيد إنتاجه. */
import { readFileSync } from "fs";
import { endIsDeliberate, pickDay, regulationEnd } from "../src/utils/appointmentRegulation";
import { changedRowsClear, changedRowsFitPatterns } from "../src/utils/timeMachine";

let failures = 0;
const check = (ok: unknown, label: string, detail?: unknown) => { if (ok) console.log(`  ok  ${label}`); else { failures += 1; console.error(`FAIL  ${label}`, detail ?? ""); } };
const read = (path: string) => readFileSync(path, "utf8");
const theory3 = { CourseHours: 3, CourseTeachingMode: "theoretical" };
const theory1 = { CourseHours: 1, CourseTeachingMode: "theoretical" };

/* 1 */
{
  const schedules = read("src/components/Schedules.tsx"), conflicts = read("src/server/core/scheduleConflicts.ts");
  check(/hold\.action === "change" && hold\.rowId/.test(schedules) && /`\/api\/schedules\/\$\{moved\.rowId\}`/.test(schedules), "1 ثبّت الطلب ينقل الموعد القائم ولا يُنشئ ثانياً");
  check(/movedFromRow: original/.test(schedules) && /method: "PUT", url: `\/api\/schedules\/\$\{movedFromRow\.id\}`/.test(schedules) && /if \(movedExisting\) \{/.test(schedules) && /createdRowId = movedExisting \? 0/.test(schedules), "1 تراجع نقلٍ يستعيد الموعد الأصلي ولا يحذفه");
  check(/"الإضافة"\)/.test(schedules) && !/fetchJson\("\/api\/schedules", \{[\s\S]{0,240}"الإضافة", /.test(schedules), "1 البطاقة السريعة بلا مسودة: لا تصل مسار النقل");
  check(/status: settled \? "settled" as const : "in-review" as const/.test(conflicts) && /kind: "item-fixed" as const, at, by, itemIndex/.test(conflicts), "1 الحالة والخط الزمني كالاعتماد");
  check(/action: item\.action, rowId:/.test(conflicts), "1 الرفض يحمل هوية الموعد وإصداره");
}
/* 2 */
{
  const row = (extra: any) => ({ id: 1, AdCourseId: 5, SCode: "01", AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, fstarttime: "08:00", fendtime: "09:20", fsunday: false, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false, ...extra });
  const courses = [{ AdCourseId: 5, CourseHours: 3 }] as any;
  const before = [row({ fmonday: true, fwednesday: true })] as any;
  check(changedRowsFitPatterns(before, [row({ fsunday: true, fmonday: true })] as any, { courses }) === false, "2 حلٌّ بأيامٍ غير معتمدة (متتالية) لا يُعرض");
  check(changedRowsFitPatterns(before, [row({ fsunday: true, fthursday: true })] as any, { courses }) === true, "2 الأحد·الخميس 80د شكلٌ معتمد (أيامٌ غير متتالية) فيُعرض");
  check(changedRowsFitPatterns(before, [row({ fmonday: true, fwednesday: true, fstarttime: "09:30", fendtime: "10:50" })] as any, { courses }) === true, "2 نمطٌ معتمد يمرّ");
  const legacy = [row({ fsunday: true, fmonday: true })] as any;
  check(changedRowsFitPatterns(legacy, legacy, { courses }) === true, "2 صفٌّ لم يتغيّر شكله يبقى كما هو");
  check(changedRowsFitPatterns(legacy, [row({ fsunday: true, fmonday: true, fstarttime: "10:00", fendtime: "11:20" })] as any, { courses }) === false, "2 نقل وقت شعبة قديمة بأيام غير معتمدة يُرفض كما يرفضه الاعتماد");
  check(/!changedRowsFitPatterns\(base, after, context\)/.test(read("src/utils/timeMachine.ts")), "2 solveProblem يطبّق الفحص");
  const busy = row({ id: 2, AdInstructorId: 9, fmonday: true, AdRoomCode: "A", AdRoomHall: "1" });
  const own = row({ id: 3, AdInstructorId: 9, fmonday: true, AdRoomCode: "B", AdRoomHall: "2" });
  check(changedRowsClear([busy, own] as any, [busy, { ...own, AdRoomHall: "3" }] as any, { instructors: [] } as any) === false, "2 حلٌّ يكتب صفاً عليه تعارض أستاذ قائم لا يُعرض");
  check(/tone: "error"/.test(read("src/components/ScenarioWorkbench.tsx")), "2 فشل الاعتماد رسالة خطأ");
}
/* 3 */
{
  check(endIsDeliberate(theory3, ["fsunday", "ftuesday", "fthursday"], "11:00", "12:30") === true, "3 نهاية مكتوبة خارج النمط متعمَّدة");
  check(endIsDeliberate(theory3, ["fsunday", "ftuesday", "fthursday"], "11:00", "11:50") === false, "3 نهاية النمط ليست تجاوزاً");
  const thu = pickDay(theory3, ["fmonday"], "fthursday", true, 170);
  /* والاثنين·الخميس 80د شكلٌ معتمد (أيامٌ غير متتالية — قرار المالك)، فيُطبَّق ولا يُقال «يدوي». */
  check(thu.days.join("+") === "fmonday+fthursday" && thu.applied?.minutes === 80, "3 إضافة الخميس لا تحذف الاثنين", thu);
  check(/endIsDeliberate\(formCourse, formDays/.test(read("src/components/Schedules.tsx")), "3 النموذج يقرأ النهاية المكتوبة");
}
/* 4 */
{
  check(regulationEnd(theory1, ["fsunday"], "19:30") === "20:20", "4 الطول الحقيقي لا يُقصّ عند 20:00", regulationEnd(theory1, ["fsunday"], "19:30"));
  check(!/Math\.min\(SCHEDULE_DAY_END/.test(read("src/utils/appointmentRegulation.ts")), "4 لا قصّ في الإكمال اللائحي");
}
/* 5-8 */
{
  const schedules = read("src/components/Schedules.tsx");
  check(/fendtime: !start \? p\.fendtime :/.test(schedules), "5 مسح البداية يترك النهاية");
  check(/isBlockingConflict\(conflict\) && !conflict\.holdRequestId/.test(schedules) && /"حجز طلب"/.test(schedules), "6 بطاقة الحجز ليست مانعاً");
  check(/AdCourseName: row\.AdCourseName \|\| heldCourses/.test(read("src/server/core/scheduleConflicts.ts")), "7 صف الحجز يحمل اسم المقرر");
  check(!/"كرسي"|"كراسي"/.test(read("src/guide/smartGuide.ts").split("\n")[146].replace(/keywords:\[[^\]]*\]/, "")), "8 لا «كرسي» في نصٍّ معروض");
}
if (failures) { console.error(`${failures} failed`); process.exit(1); }
console.log("review-1105-audit: all checks passed");
