/**
 * ── ملاحظات المالك 2026-10-28: محرّك الطلبات وكرت الأستاذ ─────────────────────
 *
 * A1 التعارض مع النفس · A2 القسم لا يُقفل عليه · A4 نطاق الكلية · B2 الإضافة الثانية
 * C2 اختيار القاعة · C3 التسابق والحجز المؤقّت · D1/D2 «لم يشاركوا» · N1 تكرار الأساتذة.
 * كلُّ بندٍ يُعاد إنتاجُ خطئه أولاً على المحرّك الحقيقي، ثم يُثبت الإصلاح.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import type { FSchedule, InstructorRequest } from "../src/types";
import { instructorWeekAfter } from "../src/utils/instructorRequestWeek";
import { judgeRequest } from "../src/utils/instructorRequestVerdict";
import { reviewSchedule } from "../src/utils/scheduleRegulations";
import {
  allocateRequestReservations, assertRequestReservationWrite, holdRequestReservation, liveReservations, occupiedRowsForRequest,
  releaseRequestHolds, reservationRows, retainRequestReservations, withReservedRooms, RequestHoldConflict, RequestReservationConflict, REQUEST_RACE_LOST,
  type RequestReservation, type RequestReservationProposal,
} from "../src/utils/instructorRequestReservations";
import { rankRequestRooms } from "../src/utils/requestRoomRanking";
import { notParticipated } from "../src/utils/requestParticipation";
import { inboxInstructorChoices } from "../src/utils/instructorIdentity";
import { REQUEST_DAY_AUTOFILL_SCRIPT } from "../src/server/requestDayAutofillScript";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => { if (ok) { passed++; console.log(`✓ ${label}`); } else { failed++; console.error(`✗ ${label}`); } };

const TERM = 900777;
const courses = new Map<number, any>([
  [10, { AdCourseId: 10, CourseName: "نظريات التعلم", CourseCode: "EDU210", CourseHours: 3 }],
  [11, { AdCourseId: 11, CourseName: "تصميم تعليمي", CourseCode: "EDU220", CourseHours: 3 }],
]);
const row = (patch: Partial<FSchedule>): FSchedule => ({
  id: 1, AdTermId: TERM, AdCollegeId: 1, AdSectionId: 4, AdCourseId: 10, AdInstructorId: 70, SCode: "01",
  fsunday: false, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false,
  fstarttime: "08:00", fendtime: "09:20", roomId: "room-a", AdRoomCode: "B1", AdRoomHall: "101", ...patch,
} as FSchedule);
const request = (id: string, instructor: number, items: InstructorRequest["items"]): InstructorRequest => ({
  id, AdTermId: TERM, AdCollegeId: 1, AdSectionId: 4, AdInstructorId: instructor, status: "submitted", source: "draft",
  linkId: `link-${id}`, items, timeline: [], createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
  window: { opensAt: "2026-10-01T00:00:00.000Z", closesAt: "2026-12-01T00:00:00.000Z" },
} as InstructorRequest);
const monWed = [{ day: "fmonday", start: "08:00", end: "09:20" }, { day: "fwednesday", start: "08:00", end: "09:20" }];
const addItem = (itemId: string, course = 10, slots = monWed) => ({ itemId, rowId: null, action: "add" as const,
  after: { courseId: course, courseName: "", sectionCode: "", days: "", time: "", collegeId: 1, sectionId: 4 }, slots } as any);
const reservation = (requestId: string, itemId: string, instructorId: number, slots = monWed, extra: Partial<RequestReservation> = {}): RequestReservation => ({
  requestId, itemId, instructorId, collegeId: 1, sectionId: 4, courseId: 10, slots, offeringRowIds: [],
  room: { roomId: "room-a", room: "B1", hall: "101" }, ...extra,
});
const verdictFor = (req: InstructorRequest, allRows: FSchedule[]) => {
  const after = instructorWeekAfter(req, allRows);
  const item = req.items[0];
  return judgeRequest({ rowId: null, tempId: -1, action: "add", AdCourseId: 10, days: item.slots!.map(slot => slot.day as any), start: item.slots![0].start, slots: item.slots as any },
    { instructorId: Number(req.AdInstructorId), allRows, instructorRowsAfter: after, courses, instructors: new Map(), knownRoomKeys: ["id:room-z"], termId: TERM, windowOpen: true });
};

/* ── A1: التعارض مع النفس ─────────────────────────────────────────────────── */
{
  const first = request("req-first", 50, [addItem("i-first", 11, [{ day: "fsunday", start: "10:00", end: "10:50" }])]);
  const mine = request("req-mine", 70, [addItem("i-mine")]);
  const ledger = [reservation("req-first", "i-first", 50, [{ day: "fsunday", start: "10:00", end: "10:50" }]), reservation("req-mine", "i-mine", 70)];
  /* السلوكُ القديم: سياقٌ واحدٌ للنطاق يستثني حجزَ أوّل طلبٍ بناه وحده. */
  const oldRows = [...reservationRows(ledger.filter(entry => entry.requestId !== first.id), TERM)];
  const oldVerdict = verdictFor(mine, oldRows);
  check(oldVerdict.reasons.some(reason => reason.source === "instructor"), "إعادة إنتاج A1: السياق المشترك يجعل حجزَ الطلب «محاضرةً أخرى للأستاذ» بالمقرر والوقت نفسيهما");
  const oldAfter = [...oldRows.filter(item => Number(item.AdInstructorId) !== 70), ...instructorWeekAfter(mine, oldRows)];
  check(reviewSchedule({ rows: oldAfter as any, courses: courses as any, instructors: new Map() as any }).some(finding => finding.rule === "sections-same-hour"),
    "إعادة إنتاج A1: وحجزُه نفسُه يُعدّ «شعبةً أخرى بالوقت نفسه م.7/5»");
  const fixedRows = occupiedRowsForRequest([], ledger, TERM, mine.id);
  check(!fixedRows.some(item => Number(item.AdInstructorId) === 70), "الإصلاح: سياقُ الطلب لا يحوي حجوزَه هو");
  check(fixedRows.some(item => Number(item.AdInstructorId) === 50), "وحجوزُ الزملاء تبقى حاضرة");
  const fixedVerdict = verdictFor(mine, fixedRows);
  check(!fixedVerdict.reasons.some(reason => reason.source === "instructor"), "الإصلاح: لا «تعارض مع محاضرة للأستاذ» من الطلب نفسه");
  const fixedAfter = [...fixedRows.filter(item => Number(item.AdInstructorId) !== 70), ...instructorWeekAfter(mine, fixedRows)];
  check(!reviewSchedule({ rows: fixedAfter as any, courses: courses as any, instructors: new Map() as any }).some(finding => finding.rule === "sections-same-hour"),
    "الإصلاح: ولا «شعبة أخرى بالوقت نفسه» من حجزه هو");
  /* الشعبةُ القائمة المحجوزة شعبةٌ واحدة لا اثنتان. */
  const offering = row({ id: 300, AdInstructorId: 99990, fmonday: true, fwednesday: true });
  const claimed = occupiedRowsForRequest([offering], [reservation("req-x", "i-x", 81, monWed, { offeringRowIds: [300], room: undefined })], TERM, "someone-else");
  check(claimed.length === 1 && Number(claimed[0].AdInstructorId) === 81, "حجزُ شعبةٍ قائمة يُنسب صفُّها الرسمي لصاحبه بلا صفٍّ مكرّر");
  const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
  check(server.includes("contexts.set(key, buildSharedRequestContext(row))") && server.includes("requestContextFor(options.context || await buildSharedRequestContext(request), request)"),
    "الوارد يبني سياقاً مشتركاً بلا استثناء، والحكمُ يشتقّ منه سياقَ كل طلبٍ على حدة");
}

/* ── A2: القسم صاحبُ القرار ───────────────────────────────────────────────── */
{
  const held = [reservation("req-dept", "i1", 70)];
  const edit = row({ id: 5, fmonday: true, fstarttime: "08:00", fendtime: "09:20" });
  let caught: unknown = null;
  try { assertRequestReservationWrite(edit, held); } catch (error) { caught = error; }
  check(caught instanceof RequestHoldConflict && (caught as RequestHoldConflict).holdRequestId === "req-dept",
    "تعديلُ القسم على موعدٍ محجوز يعيد صاحبَ الحجز (يُسأل المنسّق لا يُمنع صامتاً)");
  let passedOwner = true;
  try { assertRequestReservationWrite(edit, held, ["other", "req-dept"]); } catch { passedOwner = false; }
  check(passedOwner, "تأكيدُ القسم يتجاوز حجزَ ذلك الطلب وحده");
  let otherStillGuards = false;
  try { assertRequestReservationWrite(edit, [...held, reservation("req-colleague", "i9", 70)], ["req-dept"]); } catch (error) { otherStillGuards = error instanceof RequestHoldConflict; }
  check(otherStillGuards, "وحجوزُ بقية الطلبات تبقى حارسة");
  let holdIgnored = true;
  try { assertRequestReservationWrite(edit, [reservation("req-t", "draft:0", 70, monWed, { heldUntil: new Date(Date.now() + 60_000).toISOString() })]); } catch { holdIgnored = false; }
  check(holdIgnored, "حجزُ التحرير المؤقّت لا يمنع القسم");
  const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
  const schedules = fs.readFileSync(path.join(process.cwd(), "src/components/Schedules.tsx"), "utf8");
  check(server.includes("applyRequestHoldOverride(req)") && server.includes('code: "request-hold"') && schedules.includes('failure?.code !== "request-hold"') && schedules.includes("overrideRequestHolds"),
    "مسار الحفظ يسأل عند حجز الطلب ثم يعيد الإرسال بالتأكيد");
  check(schedules.includes("return withRequestHoldPrompt(send);") && (schedules.match(/await deleteScheduleRow\(/g) || []).length === 2 && server.includes("const deleteOverrides = await applyRequestHoldOverride(req);"),
    "والحذفُ كذلك: يسأل ثم يعيد بالتأكيد");
}

/* ── القاعةُ تتبع الموعدَ المنقول: مشغولةٌ + بدائلُ خالية ≠ «ممنوع» ─────────── */
{
  const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
  const inbox = fs.readFileSync(path.join(process.cwd(), "src/components/InstructorInbox.tsx"), "utf8");
  check(server.includes("verdict.roomCandidates = [originalKey, ...verdict.roomCandidates.filter(key => key !== originalKey)]")
    && server.includes("roomSwitch: { from:"), "النقلُ يُبقي قاعتَه إن خلت، وإلا يُبدَّلها إلى الأنسب الخالي (roomSwitch)");
  check(server.includes("|| (await judgeRequestItems(stored, { forDepartment: true })).items[i]?.roomSwitch?.to;"), "التثبيتُ يكتب القاعةَ المبدَّلة حين لا حجزَ للبند");
  check(inbox.includes("item.action === \"change\" && item.roomSwitch") && inbox.includes("القاعة بُدّلت إلى") && inbox.includes("...place,"),
    "الوارد يفحص القاعةَ التي سيكتبها التثبيت ويقول «القاعة بُدّلت إلى» بدل «القاعة مشغولة»");
}

/* ── A4: النصُّ وحده لا يعبر الكلية ───────────────────────────────────────── */
{
  const req = request("req-a4", 70, [addItem("i1")]);
  const proposal: RequestReservationProposal = { itemId: "i1", instructorId: 70, collegeId: 1, sectionId: 4, courseId: 10, slots: monWed,
    rooms: [{ roomId: "", room: "B1", hall: "101" }], offeringRowIds: [] };
  const girlsTextRow = row({ id: 9, AdCollegeId: 2, AdInstructorId: 90, fmonday: true, roomId: undefined });
  const entries = allocateRequestReservations([], req, [proposal], [girlsTextRow]);
  check(entries.length === 1, "صفٌّ نصّيٌّ «B1/101» في كلية البنات لا يشغل «B1/101» في كلية البنين");
  let blocked = false;
  try { allocateRequestReservations([], req, [{ ...proposal, rooms: [{ roomId: "room-a", room: "B1", hall: "101" }] }], [row({ id: 9, AdCollegeId: 2, AdInstructorId: 90, fmonday: true, roomId: "room-a" })]); }
  catch (error) { blocked = error instanceof RequestReservationConflict; }
  check(blocked, "القاعةُ المسجّلة نفسُها (مشتركةٌ فعلاً) تُقاس عبر الكليات");
  const verdictText = judgeRequest({ rowId: null, tempId: -1, action: "add", AdCourseId: 10, days: ["fmonday", "fwednesday"], start: "08:00", slots: monWed as any },
    { instructorId: 70, allRows: [girlsTextRow], instructorRowsAfter: [], courses, instructors: new Map(), knownRoomKeys: ["id:room-a"], roomAliases: { "id:room-a": "legacy:b1|101" }, roomCollegeId: 1, termId: TERM, windowOpen: true });
  check(verdictText.roomAvailable === true, "حكمُ الطلب لا يرى قاعتَه مشغولةً بنصّ كليةٍ أخرى");
}

/* ── B2: الإضافة الثانية للمقرر نفسه ─────────────────────────────────────── */
{
  const server0 = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
  check(server0.includes('focusItem(held,"المقرر مضاف — أكمل أيامه هنا.")'), "الكرت لا يُنشئ إضافةً ثانيةً للمقرر نفسه (تُجمع فتتجاوز ساعاته) — يفتح بندَه القائم");
  const box: any = {};
  vm.runInNewContext(`${REQUEST_DAY_AUTOFILL_SCRIPT}\nthis.complete=completeRequestDays;`, box, { timeout: 1000 });
  const patterns = [["fsunday", "ftuesday", "fthursday"], ["fmonday", "fwednesday"]];
  check(box.complete("fmonday", [], patterns).join() === "fmonday,fwednesday", "اختيارُ الاثنين أولاً يكمل نمطَ اللائحة (الاثنين والأربعاء)");
  check(box.complete("fthursday", ["fmonday", "fwednesday"], patterns).join() === "fmonday,fwednesday,fthursday", "وبعدها كلُّ ضغطةٍ صريحة");
  const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
  check(!server.includes("المشكلة في الأيام لا في الوقت") && !server.includes("عالج الموانع قبل الإرسال") && server.includes("start-off") && server.includes("whyIcon(i,t)"),
    "الأوقاتُ غير المتاحة باهتةٌ بأيقونة سببها، ولا تلميحَ غامض ولا «موانع» في زرّ الإرسال");
}

/* ── C2: اختيار القاعة ──────────────────────────────────────────────────── */
{
  const ranked = rankRequestRooms([
    { key: "id:big", roomId: "big", buildingId: "b9", capacity: 120, fit: 1, sectionIds: [] },
    { key: "id:small", roomId: "small", buildingId: "b1", capacity: 20, fit: 1, sectionIds: [4] },
    { key: "id:dept", roomId: "dept", buildingId: "b1", capacity: 40, fit: 1, sectionIds: [4] },
    { key: "id:near", roomId: "near", buildingId: "b2", capacity: 45, fit: 1, sectionIds: [] },
  ], { courseSectionId: 4, nearBuildingIds: new Set(["b1"]), previousRoomIds: new Set(), seats: 35, usage: new Map([["dept", 2]]) });
  check(!ranked.some(room => room.key === "id:small"), "قاعةٌ سعتُها المسجّلة أقلّ من المقرر لا تُرشَّح");
  check(ranked[0].key === "id:dept" && ranked[0].why.includes("dept") && ranked[0].why.includes("near"), "الأنسب: قاعةُ القسم القريبة من قاعات الأستاذ");
  check(ranked.slice(1, 3).length === 2, "ومعها بديلان مرتّبان");
  const req = request("req-c2", 70, [addItem("i1")]);
  const stamped = withReservedRooms(req, [reservation("req-c2", "i1", 70)]);
  check(stamped.items[0].reservedRoom?.label === "B1/101", "القاعةُ المحجوزة تُكتب على البند فتظهر في «التغيير»");
}

/* ── C3: التسابق والحجز المؤقّت ─────────────────────────────────────────── */
{
  const soon = new Date(Date.now() + 10 * 60_000).toISOString();
  const proposal = (instructorId: number): RequestReservationProposal => ({ itemId: "draft:0", instructorId, collegeId: 1, sectionId: 4, courseId: 10, slots: monWed,
    rooms: [{ roomId: "room-a", room: "B1", hall: "101" }], offeringRowIds: [] });
  const a = request("req-a", 70, []), b = request("req-b", 71, []);
  let ledger = holdRequestReservation([], a, proposal(70), [], soon);
  check(ledger.length === 1 && Boolean(ledger[0].heldUntil), "أوّلُ من يختار الوقتَ يُحجز له مؤقّتاً");
  let lost = "";
  try { holdRequestReservation(ledger, b, proposal(71), [], soon); } catch (error: any) { lost = error.message; }
  check(lost === REQUEST_RACE_LOST, "الثاني على القاعة نفسها: «سبقك زميل لهذا الوقت ⏱️»");
  ledger = holdRequestReservation(ledger, a, { ...proposal(70), slots: [{ day: "fsunday", start: "08:00", end: "08:50" }] }, [], soon);
  check(ledger.length === 1 && ledger[0].slots[0].day === "fsunday", "تغييرُ الأستاذ لوقته يستبدل حجزَه المؤقّت ولا يتراكم");
  const expired = [{ ...ledger[0], heldUntil: new Date(Date.now() - 1000).toISOString() }];
  check(liveReservations(expired).length === 0 && reservationRows(expired, TERM).length === 0, "الحجزُ المؤقّت ينتهي وحده إن لم يُرسَل");
  const submitted = allocateRequestReservations(ledger, a, [{ ...proposal(70), itemId: "real" }], []);
  check(submitted.length === 1 && !submitted[0].heldUntil && submitted[0].itemId === "real", "الإرسالُ يحلّ محلَّ الحجز المؤقّت بحجزٍ ينتظر القسم");
  check(retainRequestReservations(ledger, { ...a, items: [] }).length === 1 && releaseRequestHolds(ledger, a.id).length === 0, "قراراتُ القسم لا تُسقط حجزَ التحرير، والخروجُ يُسقطه");
  const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
  check(server.includes('"/api/public/request/:token/hold"') && server.includes('code: "race-lost"') && server.includes("alternatives: (again!.items[lost].nearestTimes || []).slice(0, 2)"),
    "الخاسرُ يتلقّى بديلين قريبين من الحكم نفسه، عند الحجز وعند الإرسال");
}

/* ── D1/D2/N1: الوارد ───────────────────────────────────────────────────── */
{
  const rows = [
    { status: "sent", submittedAt: undefined, linkMode: undefined },
    { status: "sent", submittedAt: undefined, linkMode: "view" as const },
    { status: "submitted", submittedAt: "2026-10-02", linkMode: undefined },
  ] as any[];
  check(notParticipated(rows).length === 1, "«لم يشاركوا»: من لم يرسل، ورابطُ العرض وحده لا يُعدّ");
  const choices = inboxInstructorChoices([
    { AdInstructorId: 1, instructorName: "د. أحمد الفيلكاوي" },
    { AdInstructorId: 2, instructorName: "د.أحمد  الفيلكاوي" },
    { AdInstructorId: 3, instructorName: "هيئة تدريسية" },
    { AdInstructorId: 4, instructorName: "هيئة تدريسية" },
    { AdInstructorId: 5, instructorName: "د. شيماء" },
  ]);
  check(choices.length === 2 && choices[0].ids.join() === "1,2", "منتقي الوارد: الأستاذ مرّةً واحدة، و«هيئة تدريسية» ليست أستاذاً");
  const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
  check(server.includes("if (!id || placeholderIds.has(id)) continue;") && server.includes("!placeholderPeople.has(Number(request.AdInstructorId))"),
    "لا يُصدَر رابطُ طلبٍ لـ«هيئة تدريسية»، ولا تُعرض طلباتها القديمة في الوارد");
}

console.log(`\n${passed} نجح، ${failed} فشل`);
process.exitCode = failed ? 1 : 0;
