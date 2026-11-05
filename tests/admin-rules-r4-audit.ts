/**
 * ── ملاحظات المالك 2026-11-05: 5، 13، 14، 16، 27 ───────────────────────────
 */
import fs from "fs";
import { actorMaySign } from "../src/utils/seats";
import { cleanTravelPolicy, defaultTravelPolicy, travelRuleFor } from "../src/utils/campusTravelPolicy";
import { studentUnitCapOf } from "../src/utils/studentUnitCap";
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
check(/soft: !rule\.required/.test(read("src/server/core/scheduleConflicts.ts")), "الإلزام وحده يمنع الحفظ");

check(/"\/campus-travel-policy"/.test(read("src/server/roleGuard.ts")), "حارس الأدوار يسمح للمسجّل العام");
check(/warnings\.filter\(item => !item\.soft\), \.\.\.warnings/.test(read("src/server/core/scheduleConflicts.ts")), "الحد لا يسقط الملزم");

/* 14 */
check(studentUnitCapOf(21) === 21 && studentUnitCapOf(18) === 18 && studentUnitCapOf(undefined) === 15 && studentUnitCapOf(30) === 15, "خيارات السقف");
const advice = (maxUnits?: number) => adviseStudent({
  planCourseIds: [1, 2, 3, 4, 5, 6, 7], passed: [], passedUnits: 0, rules: [], groups: [],
  credit: new Map([1, 2, 3, 4, 5, 6, 7].map(id => [id, 3])), name: id => `م${id}`, code: id => String(id), offered: () => true, targetUnits: 21, maxUnits,
});
check(advice().target === 15, "بلا سقف يبقى ١٥");
check(advice(21).target === 21, "سقف القسم يرفع الاقتراح");
check(/units > unitCap/.test(read("src/server/studentDoorRoutes.ts")), "الحفظ يقرأ سقف القسم");

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
