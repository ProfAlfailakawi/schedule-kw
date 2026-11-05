/** قرارات المالك: تراجع «ثبّت الطلب»، نهاية النمط في ورقة الحجز، مدة التنقّل، ومُرسِل السجل والنائب. */
import { readFileSync } from "fs";
import { cleanTravelPolicy, defaultTravelPolicy, travelShortfalls } from "../src/utils/campusTravelPolicy";
import { holdSavedTime } from "../src/components/RequestHoldSheet";
import { reopenedRequest } from "../src/server/core/scheduleConflicts";
import { scrubPlaceText } from "../src/utils/teacherPlaceScrub";
import { sendLogSenderFor } from "../src/utils/activityTrail";
import { proposalCourseChoices, proposalCourseScopes } from "../src/utils/proposalCourseChoices";

let failures = 0;
const check = (ok: unknown, label: string, detail?: unknown) => { if (ok) console.log(`  ok  ${label}`); else { failures += 1; console.error(`FAIL  ${label}`, detail ?? ""); } };
const read = (path: string) => readFileSync(path, "utf8");

/* 1 تراجع التثبيت */
{
  const fixed = (reopenTo: any) => ({ state: "fixed", fromSchedule: true, scheduleId: 7, decidedAt: "2026-11-05T10:00:00Z", reopenTo });
  const base = (items: any[], status: any = "settled") => ({ id: "r", status, items, timeline: [{ kind: "settled", at: "x" }] }) as any;
  const open = reopenedRequest(base([{ itemId: "a", action: "change", rowId: 7, decision: fixed({ status: "submitted" }) }]), 7, "المنسّق")!;
  check(open.status === "submitted" && !open.items[0].decision, "1 يعود الطلب والبند إلى ما كانا", open);
  check(open.timeline!.at(-1)?.kind === "item-reopened", "1 الخط الزمني يقول ما جرى ولا يمحو ما قبله");
  const earlier = { state: "pending", note: "س" };
  const back = reopenedRequest(base([{ itemId: "a", action: "change", decision: fixed({ status: "in-review", decision: earlier }) }]), 7, "x")!;
  check(back.items[0].decision?.note === "س" && back.status === "in-review", "1 بندٌ كان في حالٍ أخرى يعود إليها", back);
  const later = reopenedRequest(base([{ itemId: "a", action: "change", decision: fixed({ status: "submitted" }) },
    { itemId: "b", action: "change", decision: { state: "rejected", decidedAt: "2026-11-05T11:00:00Z", alternatives: [{}] } }], "in-review"), 7, "x")!;
  check(later.status === "in-review", "1 قرارٌ لاحق على بندٍ آخر يُبقيه قيد المراجعة", later.status);
  check(reopenedRequest(base([{ itemId: "department-7", action: "add", decision: fixed(undefined) }]), 7, "x") === null, "1 بند القسم ليس طلباً يعود");
  check(reopenedRequest(open, 7, "x") === null, "1 التكرار لا يفعل شيئاً");
  const legacy = reopenedRequest(base([{ itemId: "a", action: "add", decision: fixed(undefined) }]), 7, "x")!;
  check(legacy.status === "in-review" && !legacy.items[0].decision, "1 تثبيتٌ قديم بلا لقطة يعود قيد المراجعة");
  check(reopenedRequest(base([{ itemId: "a", action: "change", decision: fixed({ status: "submitted" }) }], "superseded"), 7, "x") === null, "1 طلبٌ مستبدَل يبقى مستبدَلاً");
  const route = read("src/server/routes/instructorRequestsRoutes.ts");
  const handler = route.slice(route.indexOf('"/api/instructor-requests/:id/reopen-fixed"'), route.indexOf('"/api/instructor-requests/:id/apply"'));
  check(handler.length > 100 && !/pushHooks|requestDecided/.test(handler), "1 إعادة الفتح لا تُشعر أحداً");
  check(/isScopeAllowed/.test(handler) && /refuseIfTermFrozen/.test(handler) && /ما زال على الوقت المطلوب/.test(handler), "1 نطاقٌ وتجميد ولا تقع والصف باقٍ");
  check(/reopenTo: undefined/.test(read("src/server/routes/publicRequestRoutes.ts")), "1 لقطة القسم لا تصل الأستاذ");
  check(/reopenedRequest\(request, Number\(row\.id\)/.test(read("src/server/core/scheduleConflicts.ts")), "1 حذف صف الإضافة يعيد بند الأستاذ ولا يمحوه");
  const undoSource = read("src/components/Schedules.tsx");
  check(/\.\.\.reopenSteps\]/.test(undoSource) && /reopenSteps: UndoStep\[\] = requestFix\.map/.test(undoSource), "1 تراجع الصف يعيد الطلب أيّاً كان نوع البند");
  check(/requireCurrentInstructorRequestGeneration\(stored, res\)/.test(handler) && /isInstructorRequestInCurrentGeneration\(request\)/.test(read("src/server/core/scheduleConflicts.ts")), "1 الجولة القديمة لا تُعاد في المسارين");
}
/* 2 ورقة الحجز */
{
  const hold: any = { requestId: "r", start: "12:30", end: "13:45" };
  check(holdSavedTime(hold, { fstarttime: "12:30", fendtime: "14:20" }) === "12:30–14:20", "2 النهاية المحفوظة تظهر قبل التأكيد");
  check(holdSavedTime(hold, { fstarttime: "12:30:00", fendtime: "13:45:00" }) === "", "2 لا سطر حين تطابق الطلب");
  check(/request-hold-saved/.test(read("src/components/RequestHoldSheet.tsx")) && !/disabled/.test(read("src/components/RequestHoldSheet.tsx")), "2 سطرٌ يُعرض ولا مانع جديد");
}
/* 3 مدة التنقّل */
{
  const policy = cleanTravelPolicy({ pairs: { "fahaheel|jahra": { minutes: 90, required: false } }, exemptInstructorIds: [7] });
  const campus = (id: number) => (id === 1 ? "jahra" : "fahaheel") as any;
  const other = { AdCollegeId: 2, fsunday: true, fstarttime: "10:00", fendtime: "11:15" };
  const at = (start: string, end: string) => ({ collegeId: 1, slots: [{ day: "fsunday", start, end }] });
  check(travelShortfalls(policy, 1, campus, at("12:00", "13:00"), [other])[0]?.need === 90, "3 المدة من الإعدادات، ولو حُفظ الزوج «تنبيهاً»");
  check(travelShortfalls(policy, 1, campus, at("12:45", "13:30"), [other]).length === 0, "3 المدة الكافية تمرّ");
  check(travelShortfalls(policy, 7, campus, at("12:00", "13:00"), [other]).length === 0, "3 المستثنى يبقى مستثنى");
  check(travelShortfalls(cleanTravelPolicy({ pairs: { "fahaheel|jahra": { minutes: 0 } } }), 1, campus, at("12:00", "13:00"), [other]).length === 0, "3 الصفر يوقف المدة");
  check(cleanTravelPolicy({ pairs: { "fahaheel|jahra": { minutes: 90, required: true } } }).pairs["fahaheel|jahra"].required === true && defaultTravelPolicy().pairs["fahaheel|jahra"].minutes === 60, "3 الوثائق المحفوظة تبقى متوافقة");
  const conflicts = read("src/server/core/scheduleConflicts.ts");
  check(/type: "travel", severity: "warning", soft: true/.test(conflicts) && !/rule\.required/.test(conflicts), "3 «موعد» تنبيهٌ دائماً");
  const judge = read("src/server/core/instructorRequests.ts");
  check(/travelBlocks: !options\.forDepartment && !offeredByDepartment/.test(judge), "3 إلزامٌ في البطاقة، وما عرضه القسم لا يُمنع");
  const verdict = read("src/utils/instructorRequestVerdict.ts");
  const line = /text: `(وقت التنقّل[^`]*)`/.exec(verdict)?.[1] || "";
  check(line && scrubPlaceText(line) === line && !/الجهراء|الفحيحيل|قاعة|مبنى/.test(line), "3 سبب الأستاذ بلا مكان", line);
  const card = read("src/components/CampusTravelPolicyCard.tsx");
  check(!/rule\.required|"إلزام" : "تنبيه"/.test(card) && /إلزام في بطاقة الأستاذ · تنبيه في «موعد»/.test(card), "3 الإعداد بجملةٍ واحدة بلا مفتاح");
}
/* 4 سجل الإرسال */
{
  check(sendLogSenderFor({ SeatActor: { kind: "deputy" } }, "د. منى") === "", "4 النائب لا يصله الاسم");
  check(sendLogSenderFor({ SeatActor: { kind: "holder" } }, "د. منى") === "د. منى" && sendLogSenderFor({ SeatActor: { kind: "member" } }, "د. منى") === "د. منى" && sendLogSenderFor({}, "د. منى") === "د. منى", "4 وغيره يصله");
  check(/by: sendLogSenderFor\(req\.user, row\.by\)/.test(read("src/server/routes/instructorRequestsRoutes.ts")), "4 الحجب في رد الخادم");
}
/* 16 «كل عائلة القسم»: العائلة كلها، والبنون معها (قرار المالك النهائي) */
{
  const names = ["كلية التربية الأساسية - بنين", "كلية التربية الأساسية - بنات", "كلية التربية الأساسية - الجهراء - بنات", "كلية التربية الأساسية - الفحيحيل - بنات"];
  const courses = names.map((collegeName, index) => ({ id: index + 1, code: "0109108", name: "م", collegeId: index + 1, sectionId: index + 1, collegeName, sheet: null })) as any;
  check(proposalCourseScopes(courses, { collegeId: 2, sectionId: 2 }).length === 4, "16 شرائح المواقع كلها باقية");
  check(proposalCourseChoices(courses, null)[0].memberIds.join() === "1,2,3,4", "16 القائمة تشمل البنين والجهراء والفحيحيل");
  const picker = read("src/components/proposal/ProposalCoursePicker.tsx");
  check(/familyOpen = scopes\.length > 1/.test(picker) && !/campusOf|proposalFamilyScopes/.test(picker), "16 لا قيد مسار على الخيار");
}
if (failures) { console.error(`${failures} failed`); process.exit(1); }
console.log("undo-travel-rule-audit: all checks passed");
