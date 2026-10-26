import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FSchedule, InstructorRequest } from "../src/types";
import { instructorWeekAfter } from "../src/utils/instructorRequestWeek";
import { judgeRequest } from "../src/utils/instructorRequestVerdict";
import { findConflicts, isBlockingConflict } from "../src/utils/scheduleIntelligence";
import { RequestReservationConflict, type RequestReservationProposal } from "../src/utils/instructorRequestReservations";
import { roomSuitability } from "../src/utils/roomSuitability";
import { appendRequestThread } from "../src/utils/instructorRequestThread";
import { learnCourseNature } from "../src/utils/courseNature";

const row = (patch: Partial<FSchedule> = {}) => ({
  id: 1, AdTermId: 900001, AdCollegeId: 1, AdSectionId: 1, AdCourseId: 1,
  AdInstructorId: 7, SCode: "01", fsunday: true, fmonday: false, ftuesday: false,
  fwednesday: false, fthursday: false, fstarttime: "08:00", fendtime: "08:50",
  roomId: "availability-test-room", AdRoomCode: "TEST", AdRoomHall: "1", ...patch,
} as FSchedule);
const courses = new Map([[1, { AdCourseId: 1, CourseHours: 1 } as any],
  [2, { AdCourseId: 2, CourseHours: 4, CourseTeachingMode: "theoretical" } as any],
  [3, { AdCourseId: 3, CourseHours: 2 } as any]]);
const request = (items: InstructorRequest["items"], instructor = 7): InstructorRequest => ({
  id: `request-${instructor}`, AdTermId: 900001, AdCollegeId: 1, AdSectionId: 1, AdInstructorId: instructor,
  status: "submitted", source: "draft", linkId: `test-${instructor}`, items, timeline: [],
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), window: {},
} as InstructorRequest);
const add = (id: string, day = "fsunday", course = 1, start = "08:00", end = "08:50") => ({
  itemId: id, rowId: null, action: "add" as const, after: { courseId: course }, slots: [{ day, start, end }],
} as InstructorRequest["items"][number]);
const context = (allRows: FSchedule[], after: FSchedule[]) => ({ instructorId: 7, allRows,
  instructorRowsAfter: after, courses, instructors: new Map(), knownRoomKeys: ["id:availability-test-room"],
  startLadder: ["08:00", "09:00", "09:30"], termId: 900001 });

// Table-driven parity: identical physical rows go through both real engines.
for (const scenario of [
  { name: "free", occupied: row({ id: 90, AdInstructorId: 8, fstarttime: "09:00", fendtime: "09:50" }) },
  { name: "instructor", occupied: row({ id: 90, roomId: "another-room", AdRoomHall: "2" }) },
  { name: "last room", occupied: row({ id: 90, AdInstructorId: 8 }) },
  { name: "cross-college instructor", occupied: row({ id: 90, AdCollegeId: 2, AdSectionId: 9, roomId: "another-room", AdRoomHall: "2" }) },
]) {
  const candidate = row({ id: -1 });
  const centralBlocks = findConflicts([candidate], [scenario.occupied]).some(isBlockingConflict);
  const publicVerdict = judgeRequest({ rowId: null, tempId: -1, action: "add", AdCourseId: 1,
    days: ["fsunday"], start: "08:00", slots: [{ day: "fsunday", start: "08:00", end: "08:50" }] },
    context([scenario.occupied], [...(scenario.occupied.AdInstructorId === 7 ? [scenario.occupied] : []), candidate]));
  assert.equal(!publicVerdict.sendable, centralBlocks, scenario.name);
}
const cohortOther = row({ id: 90, AdInstructorId: 8, AdCourseId: 3, roomId: "another-room", AdRoomHall: "2" });
const cohortPairs = new Set(["1|3"]);
const centralCohort = findConflicts([row({ id: -1 })], [cohortOther], { cohortPairs });
assert.ok(centralCohort.some(conflict => conflict.type === "cohort"));
assert.equal(centralCohort.some(isBlockingConflict), false);
const requestCohort = judgeRequest({ rowId: null, tempId: -1, action: "add", AdCourseId: 1,
  days: ["fsunday"], start: "08:00" }, { ...context([cohortOther], [row({ id: -1 })]), cohortPairs });
assert.equal(requestCohort.sendable, true);
assert.equal(requestCohort.needsExcuse, true, "central advisory remains reviewable with a written request reason");
const borrowedOutside = judgeRequest({ rowId: null, tempId: -1, action: "add", AdCourseId: 1,
  days: ["fsunday"], start: "08:00" }, { ...context([], [row({ id: -1 })]), roomEligible: (_key, _day, start) => start >= "09:00" });
assert.equal(borrowedOutside.roomAvailable, false, "a known borrowed room outside its approved window is unavailable");

// Same precise data goes into the official physical engine and the public verdict.
const mixed = add("mixed", "fmonday", 2, "08:00", "09:20");
mixed.slots!.push({ day: "fwednesday", start: "08:00", end: "09:20" }, { day: "fthursday", start: "08:00", end: "08:50" });
const other = row({ id: 99, AdCourseId: 1, fsunday: false, fthursday: true, fstarttime: "09:00", fendtime: "09:50" });
const after = instructorWeekAfter(request([mixed]), [other]);
const verdict = judgeRequest({ rowId: null, tempId: -1, action: "add", AdCourseId: 2,
  days: mixed.slots!.map(slot => slot.day), start: "08:00", slots: mixed.slots }, context([other], after));
assert.equal(findConflicts(after.filter(item => item.id !== 99), [other]).filter(isBlockingConflict).length, 0);
assert.equal(verdict.sendable, true, "different per-day lengths must not invent a Thursday overlap");

const additions = [add("a", "fsunday", 3), add("b", "ftuesday", 3)];
const completed = instructorWeekAfter(request(additions), []);
for (let at = 0; at < additions.length; at++) assert.equal(judgeRequest({ rowId: null, tempId: -(at + 1),
  action: "add", AdCourseId: 3, days: [additions[at].slots![0].day], start: "08:00", slots: additions[at].slots },
context([], completed)).sendable, true, "the final bundle completes both weekly meetings");

const rejectedDelete = { rowId: 1, action: "delete", decision: { state: "rejected" } } as any;
assert.equal(instructorWeekAfter(request([rejectedDelete]), [row()]).length, 1, "a rejected deletion cannot free its slot");
const deleted = { rowId: 1, action: "delete" } as any;
assert.equal(instructorWeekAfter(request([deleted]), [row()]).length, 0);
assert.equal(instructorWeekAfter(request([{ ...add("fixed"), decision: { state: "fixed", scheduleId: 1 } }]), [row()]).length, 1,
  "a fixed addition is not projected twice");
assert.equal(judgeRequest({ rowId: null, tempId: -1, action: "add", AdCourseId: 1, days: ["fsunday"], start: "08:76" }, context([], [])).sendable, false);
const occupied = row({ AdInstructorId: 8 });
const touch = row({ id: -1, fstarttime: "08:50", fendtime: "09:40" });
assert.equal(findConflicts([touch], [occupied]).filter(isBlockingConflict).length, 0);
assert.equal(judgeRequest({ rowId: null, tempId: -1, action: "add", AdCourseId: 1, days: ["fsunday"], start: "08:50" }, context([occupied], [touch])).roomAvailable, true,
  "advisory turnaround must not turn into a no-room blocker");
const late = judgeRequest({ rowId: null, tempId: -1, action: "add", AdCourseId: 1, days: ["fsunday"], start: "08:00" },
  { ...context([occupied], []), dayEnd: 580 });
assert.ok(late.nearestTimes.every(slot => Number(slot.end.slice(0, 2)) * 60 + Number(slot.end.slice(3)) - Number(slot.start.slice(0, 2)) * 60 - Number(slot.start.slice(3)) === 50));

const history = [1, 2, 3, 4].flatMap(term => [
  row({ AdCourseId: 2, AdTermId: term, fsunday: false, fmonday: true, fwednesday: true, fendtime: "09:20" }),
  row({ AdCourseId: 2, AdTermId: term, fsunday: false, fthursday: true }),
]);
assert.equal(learnCourseNature(2, history)!.meetingsPerWeek, 3);
assert.equal(learnCourseNature(2, history)!.weeklyMinutes, 210);

const suitable = roomSuitability({ CourseRoomType: "مختبر", MaxStudent: 25 }, { roomType: "مختبر", capacity: 30 });
const imperfect = roomSuitability({ CourseRoomType: "مختبر", MaxStudent: 25 }, { roomType: "قاعة", capacity: 20 });
assert.ok(suitable.typeRank > imperfect.typeRank && suitable.adjustment > imperfect.adjustment);
assert.ok(imperfect.reasons.some(reason => reason.includes("أقل")));
const correspondence = Array.from({ length: 40 }, (_, at) => ({ from: "department" as const, at: String(at), text: `message-${at}` }));
const appended = appendRequestThread({ rowId: 1, action: "change", thread: correspondence }, { from: "instructor", at: "41", text: "reply" });
assert.equal(appended.thread[0].text, "message-0");
assert.equal(appended.threadHistory[0].text, "message-1");
assert.equal(appended.thread.length + appended.threadHistory.length, 41);

// Real repository operations, private temporary demo state. Never load production credentials.
const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "instructor-reservations-"));
const emulator = process.argv.includes("--emulator");
if (emulator) {
  assert.match(String(process.env.FIRESTORE_EMULATOR_HOST), /^(127\.0\.0\.1|localhost):\d+$/);
  assert.match(String(process.env.FIREBASE_PROJECT_ID), /^demo-instructor-/);
  process.env.AUTO_IMPORT_LEGACY_DATA = "false";
}
process.env.DATA_MODE = emulator ? "firestore" : "demo";
process.env.SCHEDULE_PRIVATE_DIR = privateDir;
const { Repository, initDatabase } = await import("../src/db/repository");
await initDatabase();
const proposal = (itemId: string, instructorId: number): RequestReservationProposal => ({ itemId, instructorId,
  courseId: 1, collegeId: 1, sectionId: 1, offeringRowIds: [],
  slots: [{ day: "fmonday", start: "08:00", end: "09:20" }, { day: "fwednesday", start: "08:00", end: "09:20" }],
  rooms: [{ roomId: "last-room", room: "TEST", hall: "LAST" }] });
const contenders = await Promise.all(Array.from({ length: 40 }, async (_, at) => {
  const payload = request([add(`item-${at}`)], 80000 + at);
  const { id: _id, createdAt: _created, updatedAt: _updated, ...input } = payload;
  return Repository.createInstructorRequest(input);
}));
const results = await Promise.allSettled(contenders.map((entry, at) => Repository.saveInstructorRequest(entry, [proposal(`item-${at}`, entry.AdInstructorId)])));
assert.equal(results.filter(result => result.status === "fulfilled").length, 1, "forty simultaneous submissions cannot hold the last room twice");
for (const result of results) if (result.status === "rejected") assert.ok(result.reason instanceof RequestReservationConflict);
const winner = (results.find(result => result.status === "fulfilled") as PromiseFulfilledResult<InstructorRequest>).value;
assert.equal((await Repository.getInstructorRequestReservations(900001)).length, 1);
await assert.rejects(() => Repository.createSchedule(row({ id: undefined, roomId: "last-room", AdRoomHall: "LAST", AdInstructorId: 99999,
  fsunday: false, fmonday: true, fendtime: "09:20" }) as any), RequestReservationConflict);
const released = await Repository.saveInstructorRequest({ ...winner, items: winner.items.map(item => ({ ...item, decision: { state: "rejected" } })) });
assert.equal((await Repository.getInstructorRequestReservations(900001)).length, 0, "department rejection releases availability immediately");
await assert.rejects(() => Repository.saveInstructorRequest(winner), RequestReservationConflict, "stale submissions cannot overwrite the decision");
const second = contenders.find(entry => entry.id !== winner.id)!;
await Repository.saveInstructorRequest(second, [proposal(second.items[0].itemId!, second.AdInstructorId)]);
assert.equal((await Repository.getInstructorRequestReservations(900001)).length, 1);

// A selected placeholder section remains officially unassigned until department approval.
const offered = await Repository.createSchedule(row({ id: undefined, AdInstructorId: 99990, AdTermId: 900002 }) as any);
const { id: _id, createdAt: _created, updatedAt: _updated, ...offerInput } = { ...request([{
  ...add("offering"), offeringRowIds: [offered.id], offeringRows: [{ id: offered.id, rev: offered.rev!, instructorId: 99990 }],
}]), AdTermId: 900002 };
const offerRequest = await Repository.createInstructorRequest(offerInput);
const offerClaim = { ...proposal("offering", 7), slots: [{ day: "fsunday", start: "08:00", end: "08:50" }],
  rooms: [], offeringRowIds: [offered.id], offeringRows: [{ id: offered.id, rev: offered.rev!, instructorId: 99990 }] };
const pending = await Repository.saveInstructorRequest(offerRequest, [offerClaim]);
assert.equal((await Repository.getScheduleById(offered.id))!.AdInstructorId, 99990);
await assert.rejects(() => Repository.updateSchedule(offered.id, { AdInstructorId: 8 }, offered.rev), RequestReservationConflict);
await assert.rejects(() => Repository.updateSchedule(offered.id, { AdTermId: 900004 }, offered.rev), RequestReservationConflict,
  "moving a claimed offering to another term cannot bypass its source-term hold");
await Repository.updateSchedule(offered.id, { AdInstructorId: 7 }, offered.rev, offerRequest.id);
await Repository.saveInstructorRequest({ ...pending, items: pending.items.map(item => ({ ...item, decision: { state: "fixed", scheduleId: offered.id } })) });
assert.equal((await Repository.getScheduleById(offered.id))!.AdInstructorId, 7);
assert.equal((await Repository.getInstructorRequestReservations(900002)).length, 0);
assert.ok(released.items[0].decision?.state === "rejected");
const a = await Repository.createSchedule(row({ id: undefined, AdTermId: 900003, AdInstructorId: 70 }) as any);
const b = await Repository.createSchedule(row({ id: undefined, AdTermId: 900003, AdInstructorId: 70, fsunday: false, ftuesday: true }) as any);
const { id: _planId, createdAt: _pc, updatedAt: _pu, ...planInput } = { ...request([
  { ...add("plan-a"), rowId: a.id, action: "change" as const }, { ...add("plan-b"), rowId: b.id, action: "change" as const },
], 70), AdTermId: 900003 };
const planRequest = await Repository.createInstructorRequest(planInput);
const operations = [a, b].map((original, itemIndex) => ({ kind: "update" as const, itemIndex, rowId: original.id, original,
  body: { fstarttime: "10:00", fendtime: "10:50" } }));
const decided = (ids: Map<number, number>): InstructorRequest => ({ ...planRequest, items: planRequest.items.map((item, at) =>
  ({ ...item, decision: { state: "fixed", scheduleId: ids.get(at) } })), status: "settled" });
await assert.rejects(() => Repository.commitInstructorRequestPlan(planRequest,
  [operations[0], { ...operations[1], original: { ...b, rev: 999 } }], decided, row => row, new Set()));
assert.equal((await Repository.getScheduleById(a.id))!.fstarttime, "08:00", "failure in the second operation cannot apply the first");
assert.ok(!(await Repository.getInstructorRequest(planRequest.id))!.items[0].decision);
await assert.rejects(() => Repository.commitInstructorRequestPlan(planRequest, operations, decided, row => row, new Set(), async () => {
  throw new RequestReservationConflict("weekly hours changed");
}));
assert.equal((await Repository.getScheduleById(a.id))!.fstarttime, "08:00", "final academic validation failure must leave the whole bundle unchanged");
await Repository.commitInstructorRequestPlan(planRequest, operations, decided, row => row, new Set());
assert.equal((await Repository.getScheduleById(a.id))!.fstarttime, "10:00");
assert.equal((await Repository.getScheduleById(b.id))!.fstarttime, "10:00");
assert.equal((await Repository.getInstructorRequest(planRequest.id))!.status, "settled");
// Non-overlapping simultaneous requests must still share the professor's load ceiling.
const loadCourse = await Repository.createCourse(1, 1, "LOADTEST", "اختبار النصاب المتزامن", 1, 1, 20, false);
const loadPerson = await Repository.createInstructor("290010100011", "اختبار النصاب", "55000001");
await Repository.updateInstructor(loadPerson.AdInstructorId, loadPerson.AdInstructorCivil, loadPerson.AdInstructorName, loadPerson.AdInstructorMobile, null, 1);
const loadRequests = await Promise.all(["fsunday", "ftuesday"].map(async (day, at) => {
  const entry = { ...request([add(`load-${at}`, day, loadCourse.AdCourseId)], loadPerson.AdInstructorId), AdTermId: 900005 };
  const { id: _id, createdAt: _at, updatedAt: _updated, ...input } = entry;
  return Repository.createInstructorRequest(input);
}));
const loadResults = await Promise.allSettled(loadRequests.map((entry, at) => Repository.saveInstructorRequest(entry, [{
  ...proposal(`load-${at}`, loadPerson.AdInstructorId), courseId: loadCourse.AdCourseId, rooms: [],
  slots: entry.items[0].slots!,
}])));
assert.equal(loadResults.filter(result => result.status === "fulfilled").length, 1,
  "a second concurrent request at a different time cannot exceed the shared teaching load");
for (const result of loadResults) if (result.status === "rejected") assert.ok(result.reason instanceof RequestReservationConflict);
if (emulator) { const { getFirestore } = await import("firebase-admin/firestore"); await getFirestore().terminate(); }
console.log("Instructor availability: precise parity, final bundles, 40 concurrent reservations, stale decisions, release and official assignment passed");
