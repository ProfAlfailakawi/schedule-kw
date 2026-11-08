/**
 * ── ملاحظات المالك 2026-11-05: 5، 13، 14، 16، 27 ───────────────────────────
 */
import fs from "fs";
import { actorMaySign } from "../src/utils/seats";
import { cleanTravelPolicy, defaultTravelPolicy, travelRuleFor } from "../src/utils/campusTravelPolicy";
import { DEFAULT_STUDENT_UNIT_CAP, STUDENT_UNIT_CAP_MAX, STUDENT_UNIT_CAP_MIN, UNIVERSITY_UNIT_CAP_DOC, studentUnitCapOf, studentUnitCapProblem } from "../src/utils/studentUnitCap";
import { adviseStudent } from "../src/utils/studentAdvice";
import { cleanSectionRoomTypes, roomTypeIn } from "../src/utils/roomTypeForSection";
import { roomSuitability } from "../src/utils/roomSuitability";

let failed = 0;
const check = (ok: boolean, label: string) => { if (!ok) failed++; console.log(`${ok ? "✓" : "✗"} ${label}`); };
const read = (file: string) => fs.readFileSync(file, "utf8");

/* 5 */
check(actorMaySign({}) === true, "الحساب بلا جالس يوقّع كما كان");
check(actorMaySign({ SeatActor: { kind: "holder" } }) === true, "الرئيس يوقّع");
check(actorMaySign({ SeatActor: { kind: "deputy" } }) === true, "النائب يقوم مقامه");
check(actorMaySign({ SeatActor: { kind: "member" } }) === false, "عضو اللجنة لا يوقّع");
const approvals = read("src/server/routes/approvalsRoutes.ts");
check((approvals.match(/!actorMaySign\(req\.user as any\)/g) || []).length === 2, "الخادم يرفض التوقيع والسحب من العضو");
check(/canSign && !mine/.test(read("src/components/ApprovalBar.tsx")), "زر التوقيع يختفي للعضو");

/* 13 */
const base = defaultTravelPolicy();
check(travelRuleFor(base, "jahra", "fahaheel", 1)?.minutes === 60 && travelRuleFor(base, "jahra", "main", 1)?.minutes === 30, "الأصل كما كان");
check(travelRuleFor(base, "jahra", "fahaheel", 1)?.required === false, "الأصل تنبيه لا يمنع");
const custom = cleanTravelPolicy({ pairs: { "fahaheel|jahra": { minutes: 90, required: true } }, exemptInstructorIds: [7, "7", -1] });
check(travelRuleFor(custom, "fahaheel", "jahra", 1)?.minutes === 90 && travelRuleFor(custom, "fahaheel", "jahra", 1)?.required === true, "زيادة المدة والإلزام");
check(travelRuleFor(custom, "fahaheel", "jahra", 7) === null, "الاستثناء يسقط القاعدة");
check(custom.exemptInstructorIds.length === 1, "الاستثناءات منظفة");
check(travelRuleFor(cleanTravelPolicy({ pairs: { "jahra|main": { minutes: 0 } } }), "jahra", "main", 1) === null, "صفر يوقف القاعدة");
check(/severity: "warning", soft: true/.test(read("src/server/core/scheduleConflicts.ts")), "«موعد» تنبيهٌ لا يمنع الحفظ");

check(/"\/campus-travel-policy"/.test(read("src/server/roleGuard.ts")), "حارس الأدوار يسمح للمسجّل العام");

/* 14 */
/* 14 — قرار المالك 2026-11-08: السقف إعدادٌ واحدٌ للجامعة يضعه المدير الرئيسي في «البيانات الأكاديمية». */
check(DEFAULT_STUDENT_UNIT_CAP === 15 && STUDENT_UNIT_CAP_MIN === 3 && STUDENT_UNIT_CAP_MAX === 30, "الغائب ١٥ والمدى ٣–٣٠");
check(studentUnitCapOf(21) === 21 && studentUnitCapOf(16) === 16 && studentUnitCapOf(undefined) === 15 && studentUnitCapOf(31) === 15 && studentUnitCapOf(2) === 15 && studentUnitCapOf(17.5) === 15, "قراءة السقف");
check(studentUnitCapProblem(3) === null && studentUnitCapProblem(30) === null && studentUnitCapProblem(15) === null, "الحدود مقبولة");
check([2, 31, 0, -5, 12.5, "x", null, undefined, true].every(value => studentUnitCapProblem(value) !== null), "خارج الحدود أو غير الصحيح مرفوض");
const reference = read("src/server/routes/referenceRoutes.ts"), door = read("src/server/studentDoorRoutes.ts");
check(/app\.put\("\/api\/student-unit-cap",requireAuth,requireRootAdmin,/.test(reference), "الحفظ للمدير الرئيسي وحده");
check(/app\.get\("\/api\/student-unit-cap",requireAuth,requireRootAdmin,/.test(reference), "القراءة في الإدارة للمدير الرئيسي وحده");
check(!/section-student-settings/.test(reference), "لا مسار لسقف القسم");
check(/studentUnitCapProblem\(/.test(reference) && /auditChanges/.test(reference.slice(reference.indexOf('"/api/student-unit-cap"'))), "الخادم يتحقق من الحدود ويكتب في سجل التدقيق");
check(UNIVERSITY_UNIT_CAP_DOC.collection === "universityStudentSettings" && !/sectionStudentSettings/.test(door) && /UNIVERSITY_UNIT_CAP_DOC/.test(door), "مساري يقرأ السقف الجامعي ويتجاهل سقف القسم");
check(!fs.existsSync("src/components/StudentUnitCapField.tsx") && !/StudentUnitCap|unit-cap-field/.test(read("src/components/ScheduleTransfer.tsx")), "لا أداة للسقف في «تخطيط الشعب»");
check(/StudentUnitCapSetting/.test(read("src/components/Terms.tsx")) && /rootAdmin/.test(read("src/components/Terms.tsx")), "الأداة في «البيانات الأكاديمية» ← الفصول، للمدير الرئيسي");
const advice = (maxUnits?: number) => adviseStudent({
  planCourseIds: [1, 2, 3, 4, 5, 6, 7], passed: [], passedUnits: 0, rules: [], groups: [],
  credit: new Map([1, 2, 3, 4, 5, 6, 7].map(id => [id, 3])), name: id => `م${id}`, code: id => String(id), offered: () => true, targetUnits: 21, maxUnits,
});
check(advice().target === 15, "بلا سقف يبقى ١٥");
check(advice(21).target === 21, "سقف الجامعة يرفع الاقتراح");
check(advice(9).target === 9, "سقفٌ دون ١٢ لا يُرفع إلى ١٢");
check(/units > unitCap/.test(door), "الحفظ يقرأ السقف الجامعي");

/* 16 */
const picker = read("src/components/proposal/ProposalCoursePicker.tsx");
check(/كل عائلة القسم/.test(picker) && /WHOLE_FAMILY/.test(picker), "خيار كل عائلة القسم");
check(/siblingCampusLabels/.test(read("src/components/proposal/ProposalHeader.tsx")), "وسما الموقع لا يتكرران");

/* 27 */
const room = { roomType: "مختبر", sectionRoomTypes: { "12": "استوديو" } };
check(roomTypeIn(room, 12) === "استوديو" && roomTypeIn(room, 13) === "مختبر" && roomTypeIn({ roomType: "قاعة" }, 12) === "قاعة", "النوع حسب القسم");
check(roomSuitability({ CourseRoomType: "استوديو", AdSectionId: 12 } as any, room).reasons.some(reason => reason.includes("يلائم")), "الملاءمة تقرأ نوع القسم");
check(JSON.stringify(cleanSectionRoomTypes({ 12: "استوديو", 13: "مختبر", 99: "استوديو" }, [12, 13], "مختبر")) === '{"12":"استوديو"}', "لا يُحفظ إلا الاستثناء لقسم مرتبط");

console.log(failed ? `فشل ${failed}` : "نجحت الفحوص");
process.exit(failed ? 1 : 0);
