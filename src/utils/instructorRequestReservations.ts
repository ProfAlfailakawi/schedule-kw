import type { FSchedule, InstructorRequest } from "../types";
import { clockRangesOverlap } from "./scheduleTime";
import { roomKeyOf, rowOccupiesRoom } from "./locationRegistry";

export interface RequestReservationRoom { roomId?: string; buildingId?: string; room: string; hall: string; companionRoomId?: string; companionRoomLabel?: string }
export interface RequestReservation {
  requestId: string;
  itemId: string;
  instructorId: number;
  collegeId: number;
  sectionId: number;
  courseId: number;
  slots: Array<{ day: string; start: string; end: string }>;
  room?: RequestReservationRoom;
  offeringRowIds: number[];
}
export interface RequestReservationProposal extends Omit<RequestReservation, "requestId" | "room"> {
  rooms: RequestReservationRoom[];
  /** Revisions captured from the official offering, never supplied by the public client. */
  offeringRows?: Array<{ id: number; rev: number; instructorId: number }>;
}
export type RequestScheduleOperation =
  | { kind: "create"; itemIndex: number; body: Partial<FSchedule> }
  | { kind: "update"; itemIndex: number; body: Partial<FSchedule>; rowId: number; original: FSchedule }
  | { kind: "delete"; itemIndex: number; rowId: number; original: FSchedule };
export class RequestReservationConflict extends Error {
  readonly status = 409;
  readonly code = "request-availability-changed";
  constructor(message = "تغيّر التوفر أثناء إرسال طلبك. راجع الموعد واختر من البدائل المتاحة.") { super(message); }
}
const days = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
const touches = (a: RequestReservation["slots"], b: RequestReservation["slots"]) =>
  a.some(x => b.some(y => x.day === y.day && clockRangesOverlap(x.start, x.end, y.start, y.end)));
const slotsOf = (row: Partial<FSchedule>) => days.filter(day => row[day]).map(day =>
  ({ day, start: String(row.fstarttime || ""), end: String(row.fendtime || "") }));
const sameRoom = (a?: RequestReservationRoom, b?: RequestReservationRoom) => Boolean(a && b &&
  (([a.roomId, a.companionRoomId].filter(Boolean).some(id => id === b.roomId || id === b.companionRoomId))
    || (roomKeyOf("", a.room, a.hall) && roomKeyOf("", a.room, a.hall) === roomKeyOf("", b.room, b.hall))));
const occupies = (row: Partial<FSchedule>, room: RequestReservationRoom) =>
  rowOccupiesRoom(row, room.roomId, room.room, room.hall) || Boolean(room.companionRoomId && rowOccupiesRoom(row, room.companionRoomId, "", ""));

/** One ledger per term is the transaction's contention point, not an in-process lock.
 * No reservation is created while browsing/checking. A rejected/fixed item releases it.
 * Pending requests deliberately have no short timer: the department owns their outcome.
 */
export function retainRequestReservations(entries: RequestReservation[], request: InstructorRequest): RequestReservation[] {
  if (request.status === "superseded") return entries.filter(entry => entry.requestId !== request.id);
  const active = new Set(request.items.filter(item => item.action !== "keep" && item.action !== "delete"
    && (!item.decision?.state || item.decision.state === "pending")).map(item => item.itemId));
  return entries.filter(entry => entry.requestId !== request.id || active.has(entry.itemId));
}

export function allocateRequestReservations(entries: RequestReservation[], request: InstructorRequest,
  proposals: RequestReservationProposal[], officialRows: FSchedule[]): RequestReservation[] {
  const next = entries.filter(entry => entry.requestId !== request.id);
  const changed = new Set(request.items.filter(item => item.rowId != null && item.action !== "keep"
    && item.decision?.state !== "rejected" && item.decision?.state !== "fixed").map(item => Number(item.rowId)));
  for (const proposal of proposals) {
    /* A new/changed appointment must hold a concrete physical room identity.
     * Existing offered sections are the exception: their official row ids are
     * held directly, and the department keeps the existing room assignment. */
    const roomsWithIdentity = proposal.rooms.filter(candidate => roomKeyOf(candidate.roomId, candidate.room, candidate.hall));
    if (!proposal.offeringRowIds.length && roomsWithIdentity.length === 0)
      throw new RequestReservationConflict("لا يمكن حجز هذا الموعد قبل توفر قاعة معروفة في دليل القسم.");
    for (const expected of proposal.offeringRows || []) {
      const live = officialRows.find(row => Number(row.id) === expected.id);
      if (!live || Number(live.rev || 0) !== expected.rev || Number(live.AdInstructorId) !== expected.instructorId)
        throw new RequestReservationConflict("تغيّرت الشعبة المختارة. حدّث الخيارات قبل إرسال الطلب.");
    }
    if (next.some(entry => entry.offeringRowIds.some(id => proposal.offeringRowIds.includes(id))))
      throw new RequestReservationConflict("لم تعد الشعبة المختارة متاحة. بقيت اختياراتك محفوظة؛ اختر شعبة أخرى.");
    const ignored = new Set([...changed, ...proposal.offeringRowIds]);
    const live = officialRows.filter(row => !ignored.has(Number(row.id)));
    if (live.some(row => Number(row.AdInstructorId) === proposal.instructorId && touches(proposal.slots, slotsOf(row)))
      || next.some(entry => entry.instructorId === proposal.instructorId && touches(proposal.slots, entry.slots)))
      throw new RequestReservationConflict("لديك موعد آخر في الوقت المختار. راجع الأيام والأوقات قبل الإرسال.");
    const room = roomsWithIdentity.find(candidate => !live.some(row =>
      occupies(row, candidate) && touches(proposal.slots, slotsOf(row)))
      && !next.some(entry => sameRoom(candidate, entry.room) && touches(proposal.slots, entry.slots)));
    if (proposal.rooms.length && !room) throw new RequestReservationConflict();
    const { rooms: _rooms, offeringRows: _expected, ...reservation } = proposal;
    next.push({ ...reservation, requestId: request.id, ...(room ? { room } : {}) });
  }
  return next;
}

/** Official writes participate in the same transaction as submissions. Internal apply
 * passes its owner explicitly; a client-supplied origin cannot bypass reservations. */
export function assertRequestReservationWrite(row: Partial<FSchedule>, entries: RequestReservation[], owner = ""): void {
  for (const entry of entries) {
    if (entry.requestId === owner) continue;
    if ((row.id && entry.offeringRowIds.includes(Number(row.id))) || (touches(slotsOf(row), entry.slots)
      && (Number(row.AdInstructorId) === entry.instructorId
        || (entry.room && occupies(row, entry.room)))))
      throw new RequestReservationConflict("الموعد مرتبط بطلب أستاذ بانتظار قرار القسم. راجع الطلب قبل تغيير هذا الموعد.");
  }
}

export function reservationRows(entries: RequestReservation[], termId: number): FSchedule[] {
  return entries.flatMap((entry, at) => entry.slots.map((slot, index) => ({
    id: -2_000_000_000 + at * 10 + index, AdTermId: termId, AdCollegeId: entry.collegeId,
    AdSectionId: entry.sectionId, AdCourseId: entry.courseId, AdInstructorId: entry.instructorId,
    SCode: `reservation:${at}`, ...Object.fromEntries(days.map(day => [day, day === slot.day])),
    fstarttime: slot.start, fendtime: slot.end, roomId: entry.room?.roomId,
    buildingId: entry.room?.buildingId, AdRoomCode: entry.room?.room || "", AdRoomHall: entry.room?.hall || "",
    companionRoomId: entry.room?.companionRoomId,
  } as FSchedule)));
}
