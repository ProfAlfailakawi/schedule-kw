/**
 * ── ملاحظات المالك 2026-11-05: 5، 13، 14، 16، 27 ───────────────────────────
 */
import fs from "fs";
import { runInNewContext } from "node:vm";
import { STUDENT_HOME_SCRIPT } from "../src/server/studentHomePage";
import { parseClock, simulateRegistration, type SimInput } from "../src/utils/registrationSim";
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
const simData = read("src/server/simulationData.ts");
check(UNIVERSITY_UNIT_CAP_DOC.collection === "universityStudentSettings" && !/sectionStudentSettings/.test(door + simData) && /UNIVERSITY_UNIT_CAP_DOC/.test(simData) && /universityUnitCap\(\)/.test(door), "مساري يقرأ السقف الجامعي ويتجاهل سقف القسم");
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

/* 14ب — مراجعة #423: سقف 9 يحكم التذاكر وكل مسار حفظ بلا اختيار صريح. */
{
  const credit = new Map([1, 2, 3, 4, 5].map(id => [id, 3] as [number, number]));
  const input: SimInput = {
    students: [{ fp: "a", planId: "p", passed: [], assessable: true, remainingUnits: 15 }, { fp: "w", planId: "p", passed: [], assessable: true, remainingUnits: 15, wishes: { targetUnits: 15, courseIds: [], constraints: {} } }],
    offerings: [1, 2, 3, 4, 5].map((id, i) => ({ id: `${id}|01`, courseId: id, code: "01", collegeId: 1, sectionId: 11, capacity: 10, slots: [{ day: i, start: parseClock("08:00")!, end: parseClock("09:00")! }] })),
    plans: [{ planId: "p", courseIds: [1, 2, 3, 4, 5], hasApprovedRules: true, rules: [1, 2, 3, 4, 5].map(courseId => ({ courseId, level: 1, kind: "compulsory" as const })), groups: [] }],
    credit, rounds: 1, maxUnits: 9,
  };
  for (const assessCapacity of [true, false]) {
    const tickets = simulateRegistration({ ...input, assessCapacity }).tickets;
    check(tickets.length === 2 && tickets.every(t => t.plans.every(plan => plan.units <= 9)) && tickets.every(t => t.plans[0].units === 9), `التذاكر لا تتجاوز سقف 9 (${assessCapacity ? "تحليل السعة" : "الرغبات"})`);
  }
  check(simulateRegistration({ ...input, maxUnits: undefined, assessCapacity: true }).tickets[0].plans[0].units === 15, "بلا سقف: 15 كما كان");
  check(/const maxUnits = await universityUnitCap\(\)/.test(simData) && /rounds, maxUnits \}/.test(simData) && !/targetUnits: 15,/.test(simData), "التشغيل يمرّر السقف الجامعي، ولا 15 ثابتة لغير المشاركين");

  const fnOf = (name: string) => {
    const begin = STUDENT_HOME_SCRIPT.indexOf("function " + name + "(");
    const end = STUDENT_HOME_SCRIPT.indexOf("\nfunction ", begin + 1);
    if (begin < 0) throw new Error("لا دالة " + name);
    return STUDENT_HOME_SCRIPT.slice(begin, end < 0 ? undefined : end);
  };
  const sent: any[] = [];
  const button = { disabled: false, addEventListener() {} };
  const cx: Record<string, any> = {
    S: { state: { term: { id: 7 }, profile: { wishes: null }, limits: { wishUnitsMin: 9, wishUnitsMax: 9, termUnits: 13.5 } } },
    api: (_m: string, _u: string, body: any) => { sent.push(body); return { then() {} }; },
    tkItems: () => [{ courseId: 1 }], kmCartIds: () => [1], toast() {}, renderWishes() {},
    document: { getElementById: () => button },
  };
  runInNewContext([fnOf("lim"), fnOf("fitUnits"), fnOf("curWishes"), fnOf("saveWishCourses"), fnOf("wishState"), fnOf("tkSaveWishes"), fnOf("kmSendWishes"),
    "this.wishState=wishState;this.tkSaveWishes=tkSaveWishes;this.kmSendWishes=kmSendWishes;"].join("\n"), cx);
  check(cx.wishState().targetUnits === 9, "نموذج الرغبات بلا رغبات: يبدأ من السقف 9 لا 15");
  cx.tkSaveWishes({}, { disabled: false });
  cx.kmSendWishes();
  check(sent.length === 2 && sent.every(body => body.targetUnits === 9), "حفظ الرغبات من «جدولي» ومن «الخريطة» بلا اختيار صريح: 9 لا 15");
  cx.S.state.profile.wishes = { termId: 7, targetUnits: 15, courseIds: [], constraints: {} };
  cx.S.wDraft = null; sent.length = 0;
  button.disabled = false; cx.tkSaveWishes({}, { disabled: false }); cx.kmSendWishes();
  check(cx.wishState().targetUnits === 9 && sent.every(body => body.targetUnits === 9), "رغبةٌ محفوظة قبل خفض السقف تُقصّ إلى 9");
  check(/fitUnits\(w\?w\.targetUnits:opt\.units\)/.test(STUDENT_HOME_SCRIPT) && /units:a\.units/.test(STUDENT_HOME_SCRIPT), "حفظ المقترح يقصّ بالدالة نفسها (عبر حفظ الرغبات الموحّد)");
}

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
