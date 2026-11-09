/**
 * قرار 1913/2016: م.8 و م.9 (حدود أعداد الطلبة واستثناءاتها)، وما صُحّح معها:
 * التدوير لا يعدّ «هيئة تدريسية» شخصاً، وسعةُ المقرر لكل شعبة فلا تُقسم، ونسبةُ الفترتين بلا حدٍّ أدنى للمواعيد.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { CAPACITY_LIMITS, capacityContextFor, capacityLimitProblem, capacityRange } from "../src/utils/capacityLimits";
import { periodBalanceFinding, reviewSchedule } from "../src/utils/scheduleRegulations";

let passed = 0;
const check = (ok: boolean, label: string) => { assert.ok(ok, label); passed++; console.log(`  ✓ ${label}`); };
const read = (p: string) => fs.readFileSync(p, "utf8");

// ── م.8: الجدول ──
check(JSON.stringify(CAPACITY_LIMITS.theoretical) === "[20,60]" && JSON.stringify(CAPACITY_LIMITS.applied) === "[15,40]" && JSON.stringify(CAPACITY_LIMITS.practical) === "[15,25]", "حدّا النظري والتطبيقي والعملي كما في الجدول");
check(JSON.stringify(capacityRange("field_training", "theoretical")) === "[15,60]" && JSON.stringify(capacityRange("field_training", "scientific")) === "[15,25]", "التدريب الميداني: ١٥–٦٠ نظري و١٥–٢٥ علمي");
check(capacityRange("mixed") === null && capacityRange(undefined) === null && capacityRange("") === null, "طبيعةٌ غير مصنّفة: لا حدّ");
for (const [mode, lo, hi] of [["theoretical", 20, 60], ["applied", 15, 40], ["practical", 15, 25], ["field_training", 15, 60]] as const) {
  check(capacityLimitProblem({ mode, capacity: lo }) === null && capacityLimitProblem({ mode, capacity: hi }) === null, `${mode}: الحدّان نفسُهما مقبولان`);
  check(Boolean(capacityLimitProblem({ mode, capacity: lo - 1 })) && Boolean(capacityLimitProblem({ mode, capacity: hi + 1 })), `${mode}: ما دون الأدنى أو فوق الأقصى مرفوض`);
}
check(capacityLimitProblem({ mode: "theoretical", capacity: 0 }) === null && capacityLimitProblem({ mode: "theoretical", capacity: undefined }) === null, "سعةٌ غير مدخلة: لا يُحكم");
check(capacityLimitProblem({ mode: "field_training", capacity: 40, specialization: "scientific" }) !== null && capacityLimitProblem({ mode: "field_training", capacity: 40, specialization: "theoretical" }) === null, "ميداني ٤٠: مرفوض في العلمي ومقبول في النظري");

// ── القاعدة في reviewSchedule ──
const row = (id: number, courseId: number, over: Record<string, unknown> = {}) => ({ id, AdCourseId: courseId, SCode: "501", AdCollegeId: 1, AdSectionId: 1, AdInstructorId: 11, fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: true, fstarttime: "08:00", fendtime: "08:50", ...over }) as any;
const course = (id: number, over: Record<string, unknown> = {}): readonly [number, any] => [id, { AdCourseId: id, CourseCode: `0109${id}`, CourseName: `م${id}`, CourseHours: 3, AdSectionId: 1, CourseTeachingMode: "theoretical", MaxStudent: 50, ...over }];
const people = new Map<number, any>([[11, { AdInstructorId: 11, AdInstructorName: "أستاذ" }], [12, { AdInstructorId: 12, AdInstructorName: "هيئة تدريسية" }]]);
const find = (courses: Array<readonly [number, any]>, capacity: any, rows: any[] = [row(1, 101)]) =>
  reviewSchedule({ rows, courses: new Map(courses), instructors: people, capacity }).find(item => item.rule === "capacity-range");
const none = { specialization: "theoretical" as const, excused: new Set<string>() };

check(!find([course(101, { MaxStudent: 60 })], none) && !find([course(101, { MaxStudent: 20 })], none), "سعةٌ ضمن الحدّين: لا مانع");
const bad = find([course(101, { MaxStudent: 80 })], none);
check(Boolean(bad) && bad!.approvalEffect === "block" && bad!.article === "م.8" && bad!.source === "decision-1912", "سعة ٨٠ لنظري: مانعُ اعتماد من م.8");
check(Boolean(find([course(101, { MaxStudent: 10 })], none)), "سعة ١٠ لنظري: دون الأدنى");
check(!find([course(101, { MaxStudent: 80 })], { specialization: "theoretical", excused: new Set(["010910 1".replace(" ", "")]) }), "مقررٌ استثناه المدير لا يُمنع");
check(!find([course(101, { MaxStudent: 80 })], undefined), "بلا سياق السعة (لم تصل الوثيقة): لا تُقرأ القاعدة");
check(!find([course(101, { MaxStudent: 80, CourseTeachingMode: undefined })], none), "مقررٌ بلا طبيعة: لا يُحكم عليه");
check(Boolean(find([course(101, { CourseTeachingMode: "field_training", MaxStudent: 40 })], { specialization: "scientific", excused: new Set<string>() })) && !find([course(101, { CourseTeachingMode: "field_training", MaxStudent: 40 })], none), "ميداني ٤٠ بحسب نوع تخصص العائلة");
check(JSON.stringify(capacityContextFor({ families: { "تكنولوجيا التعليم": { specialization: "scientific", courses: { "0109101": { reason: "nature" } } } } }, "تكنولوجيا التعليم").specialization) === '"scientific"' && capacityContextFor(null, "x").specialization === "theoretical", "نوع التخصص النظري إن غاب");

// ── م.7/2: بلا حدٍّ أدنى لعدد المواعيد ──
check(Boolean(periodBalanceFinding([row(1, 101, { fstarttime: "09:00" })])) && periodBalanceFinding([row(1, 101, { fstarttime: "09:00" })])!.approvalEffect === "note", "موعدٌ صباحيٌّ واحد: ملاحظة، لا مانع");

// ── م.6/4: «هيئة تدريسية» ليست شخصاً ──
const rotate = (instructor: number) => reviewSchedule({
  rows: [row(1, 101, { AdInstructorId: instructor })], previousRows: [row(9, 101, { AdInstructorId: instructor })],
  courses: new Map([course(101)]), instructors: people,
}).find(item => item.rule === "rotation");
check(Boolean(rotate(11)) && !rotate(12), "التدوير: الأستاذ نفسه يُنبَّه، و«هيئة تدريسية» لا");

// ── سعة المقرر لكل شعبة ──
check(!/sectionCount/.test(read("src/utils/scheduleDataReadiness.ts")) && !/MaxStudent\)\s*\/\s*(sectionCount|groups)/.test(read("src/utils/scheduleDataReadiness.ts")), "ملاءمة القاعات في الجاهزية لا تقسم السعة على عدد الشعب");
check(!/MaxStudent\|\|0\)\/groups/.test(read("src/server/routes/hallBarterRoutes.ts")) && !/const groups=new Set/.test(read("src/server/routes/hallBarterRoutes.ts")), "استعارة القاعات لا تقسم السعة على عدد الشعب");

// ── الشاشة والخادم يقرآن القاعدة نفسها ──
const approvals = read("src/server/core/approvals.ts");
const familyRoute = read("src/server/routes/scheduleReviewRoutes.ts");
const reviewScreen = read("src/components/ScheduleReview.tsx");
check(/capacity:\s*await capacityContextForSection\(sectionId\)/.test(approvals), "الاعتماد (الخادم) يمرّر سياق السعة إلى reviewSchedule");
check(/capacity:await/.test(familyRoute) && /capacityContextForSection/.test(familyRoute), "مسار قراءة العائلة يرسل سياق السعة للشاشة");
check(/capacity: family\?\.capacity/.test(reviewScreen) && !/PERIOD_BALANCE_MIN_SECTIONS/.test(reviewScreen), "شاشة المراجعة تمرّر السياق نفسه ولا تحمل حدّ العشرة");
check(/item\.approvalEffect === "block"\)\.length/.test(read("src/server/routes/approvalsRoutes.ts")), "عدّ موانع التوقيع يستثني الملاحظات");

// ── الحفظ ──
const routes = read("src/server/routes/coursesRoutes.ts");
check((routes.match(/capacityRefusal\(/g) || []).length >= 3, "إنشاء المقرر وتعديله يفحصان السعة");
check(/changed\)\s*\{[\s\S]{0,200}capacityRefusal/.test(routes) || /if \(changed\)/.test(routes), "التعديل يفحص ما تغيّر فقط (السعة أو الطبيعة)");
check(/\/api\/admin\/capacity-exceptions/.test(routes) && /requireRootAdmin/.test(routes.slice(routes.indexOf("/api/admin/capacity-exceptions"))), "استثناءات السعة لمدير النظام وحده");

console.log(`\n${passed} passed, 0 failed`);
