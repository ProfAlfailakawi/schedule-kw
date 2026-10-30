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
  /**
   * حجزٌ مؤقّتٌ أثناء التحرير (قبل الإرسال): يُخفي الوقتَ عن الزملاء ويسقط وحده
   * بعد هذا التاريخ إن لم يُرسَل الطلب. غيابُه = حجزُ طلبٍ مُرسَلٍ ينتظر القسم.
   */
  heldUntil?: string;
}
export interface RequestReservationProposal extends Omit<RequestReservation, "requestId" | "room" | "heldUntil"> {
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
  readonly code: string = "request-availability-changed";
  constructor(message = "تغيّر التوفر أثناء إرسال طلبك. راجع الموعد واختر من البدائل المتاحة.") { super(message); }
}

/**
 * تعديلُ القسم يصطدم بحجز طلبٍ ينتظر قراره (A2). القسمُ صاحبُ القرار: يُسأل
 * بوضوح، فإن أكّد مضى التعديلُ على ذلك الطلب وحده — ويبقى حجزُ الزملاء حارساً.
 */
export class RequestHoldConflict extends RequestReservationConflict {
  readonly code = "request-hold";
  readonly holdRequestId: string;
  readonly holdItemId: string;
  readonly holdInstructorId: number;
  constructor(entry: Pick<RequestReservation, "requestId" | "itemId" | "instructorId">) {
    super("الموعد مرتبط بطلب أستاذ بانتظار قرار القسم. راجع الطلب قبل تغيير هذا الموعد.");
    this.holdRequestId = entry.requestId; this.holdItemId = entry.itemId; this.holdInstructorId = Number(entry.instructorId);
  }
}

/** الرسالةُ التي يقرؤها من سبقه زميلٌ إلى الوقت نفسه (C3). */
export const REQUEST_RACE_LOST = "سبقك زميل لهذا الوقت ⏱️ اختر أحد البديلين القريبين.";

const days = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
const touches = (a: RequestReservation["slots"], b: RequestReservation["slots"]) =>
  a.some(x => b.some(y => x.day === y.day && clockRangesOverlap(x.start, x.end, y.start, y.end)));
const slotsOf = (row: Partial<FSchedule>) => days.filter(day => row[day]).map(day =>
  ({ day, start: String(row.fstarttime || ""), end: String(row.fendtime || "") }));
const sameRoom = (a?: RequestReservationRoom, b?: RequestReservationRoom) => Boolean(a && b &&
  (([a.roomId, a.companionRoomId].filter(Boolean).some(id => id === b.roomId || id === b.companionRoomId))
    || (roomKeyOf("", a.room, a.hall) && roomKeyOf("", a.room, a.hall) === roomKeyOf("", b.room, b.hall))));
/* القاعةُ المسجّلة (roomId) هويّةٌ فيزيائيةٌ واحدة في الجامعة كلها؛ أما النصُّ وحده
   («مبنى/قاعة») فمحلّيٌّ في كليته: كليةُ التربية الأساسية بنين وبنات تعيدان رموزَ
   المباني نفسَها في حرمين مختلفين. فالمطابقةُ النصية لا تعبر الكلية (A4). */
const occupies = (row: Partial<FSchedule>, room: RequestReservationRoom, collegeId?: number) => {
  const textOnlyElsewhere = collegeId != null && Number(row.AdCollegeId || 0) > 0 && Number(row.AdCollegeId) !== Number(collegeId)
    && !String(row.roomId || "").trim();
  if (textOnlyElsewhere) return false;
  return rowOccupiesRoom(row, room.roomId, room.room, room.hall) || Boolean(room.companionRoomId && rowOccupiesRoom(row, room.companionRoomId, "", ""));
};

/** الحجوزُ السارية: الحجزُ المؤقّتُ الذي انقضى وقتُه لا يحجز شيئاً. */
export function liveReservations(entries: RequestReservation[], now = Date.now()): RequestReservation[] {
  return (entries || []).filter(entry => !entry.heldUntil || Date.parse(entry.heldUntil) > now);
}

/** One ledger per term is the transaction's contention point, not an in-process lock.
 * No reservation is created while merely browsing/checking. A rejected/fixed item releases it.
 * Pending (submitted) requests deliberately have no timer: the department owns their outcome.
 * Composing holds (`heldUntil`) are the only short-lived entries.
 */
export function retainRequestReservations(entries: RequestReservation[], request: InstructorRequest): RequestReservation[] {
  entries = liveReservations(entries);
  if (request.status === "superseded") return entries.filter(entry => entry.requestId !== request.id);
  const active = new Set(request.items.filter(item => item.action !== "keep" && item.action !== "delete"
    && (!item.decision?.state || item.decision.state === "pending")).map(item => item.itemId));
  return entries.filter(entry => entry.requestId !== request.id || Boolean(entry.heldUntil) || active.has(entry.itemId));
}

/**
 * يحجز بنداً واحداً على دفترٍ قائم: الأستاذُ نفسُه بلا تداخل، والشعبةُ القائمة
 * لم يأخذها غيرُه، وأوّلُ قاعةٍ خاليةٍ من قاعاته المرتّبة (الأنسب أولاً).
 * القاعدةُ واحدةٌ للإرسال وللحجز المؤقّت أثناء التحرير.
 */
function claimProposal(next: RequestReservation[], request: InstructorRequest, proposal: RequestReservationProposal,
  officialRows: FSchedule[], changed: Set<number>): RequestReservation {
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
  if (next.some(entry => entry.requestId !== request.id && entry.offeringRowIds.some(id => proposal.offeringRowIds.includes(id))))
    throw new RequestReservationConflict(REQUEST_RACE_LOST);
  const ignored = new Set([...changed, ...proposal.offeringRowIds]);
  const live = officialRows.filter(row => !ignored.has(Number(row.id)));
  if (live.some(row => Number(row.AdInstructorId) === proposal.instructorId && touches(proposal.slots, slotsOf(row)))
    || next.some(entry => entry.instructorId === proposal.instructorId && touches(proposal.slots, entry.slots)))
    throw new RequestReservationConflict("لديك موعد آخر في الوقت المختار. راجع الأيام والأوقات قبل الإرسال.");
  const room = roomsWithIdentity.find(candidate => !live.some(row =>
    occupies(row, candidate, proposal.collegeId) && touches(proposal.slots, slotsOf(row)))
    && !next.some(entry => sameRoom(candidate, entry.room) && touches(proposal.slots, entry.slots)));
  if (proposal.rooms.length && !room) throw new RequestReservationConflict(REQUEST_RACE_LOST);
  const { rooms: _rooms, offeringRows: _expected, ...reservation } = proposal;
  return { ...reservation, requestId: request.id, ...(room ? { room } : {}) };
}

const changedRowsOf = (request: InstructorRequest) => new Set(request.items.filter(item => item.rowId != null && item.action !== "keep"
  && item.decision?.state !== "rejected" && item.decision?.state !== "fixed").map(item => Number(item.rowId)));

export function allocateRequestReservations(entries: RequestReservation[], request: InstructorRequest,
  proposals: RequestReservationProposal[], officialRows: FSchedule[]): RequestReservation[] {
  /* الإرسالُ يحلّ محلَّ كلِّ ما للطلب نفسه في الدفتر، ومنه حجوزُه المؤقّتة. */
  const next = liveReservations(entries).filter(entry => entry.requestId !== request.id);
  const changed = changedRowsOf(request);
  for (const proposal of proposals) next.push(claimProposal(next, request, proposal, officialRows, changed));
  return next;
}

/**
 * حجزٌ مؤقّتٌ لبندٍ واحدٍ أثناء التحرير (C3): أوّلُ من يختار الوقتَ يأخذه،
 * ويختفي عن زملائه حتى يُرسل أو ينقضي الحجز. حجزُ البند نفسِه السابقُ يُستبدل،
 * وما أرسله الأستاذ من قبل يبقى كما هو.
 */
export function holdRequestReservation(entries: RequestReservation[], request: InstructorRequest,
  proposal: RequestReservationProposal, officialRows: FSchedule[], heldUntil: string): RequestReservation[] {
  const next = liveReservations(entries).filter(entry => !(entry.requestId === request.id && entry.itemId === proposal.itemId));
  /* حجوزُ الطلب نفسِه لا تُحسب عليه: المُرسَلُ سابقاً يُستبدل عند الإرسال، وحجوزُ بنوده الأخرى أثناء التحرير
     تعارضٌ بين بنود مسودّته يقوله الحكمُ نفسُه على الأسبوع كلِّه. وكان اختيارٌ ألغاه الأستاذ (إضافةٌ أو وقتٌ
     تركه) يبقى عشرَ دقائق فيمنعه «لديك موعد آخر» و«سبقك زميل ⏱️» عن وقتٍ يقول الفحصُ إنه متاح (محاكاة 2026-10-30). */
  const others = next.filter(entry => entry.requestId !== request.id);
  const claim = claimProposal(others, request, proposal, officialRows, changedRowsOf(request));
  return [...next, { ...claim, heldUntil }];
}

/** يُسقط حجوزَ التحرير المؤقّتة لطلبٍ واحد (خروجُ الأستاذ أو إرسالُه)، أو حجزَ بندٍ واحدٍ منها بمفتاحه. */
export function releaseRequestHolds(entries: RequestReservation[], requestId: string, itemId?: string): RequestReservation[] {
  return liveReservations(entries).filter(entry => !(entry.requestId === requestId && entry.heldUntil && (!itemId || entry.itemId === itemId)));
}

/** القاعةُ التي حُجزت لكل بند تُكتب على الطلب نفسه، فتظهر في «التغيير» عند القسم (C1). */
export function withReservedRooms(request: InstructorRequest, entries: RequestReservation[]): InstructorRequest {
  const mine = new Map(entries.filter(entry => entry.requestId === request.id && !entry.heldUntil && entry.room)
    .map(entry => [entry.itemId, entry.room!] as const));
  if (!mine.size) return request;
  return { ...request, items: request.items.map(item => {
    const room = item.itemId ? mine.get(item.itemId) : undefined;
    if (!room) return item;
    return { ...item, reservedRoom: { ...(room.roomId ? { roomId: room.roomId } : {}), label: [room.room, room.hall].filter(Boolean).join("/"),
      ...(room.companionRoomLabel ? { companionLabel: room.companionRoomLabel } : {}) } };
  }) };
}

/**
 * ── والقاعةُ لا تصل الأستاذ (قرار المالك 2026-10-29: «مخفية اكيد متعمدة») ───
 *
 * تُكتب القاعةُ المحجوزة على البند للقسم (أعلاه)، وتُنزع من نسخة الأستاذ مع
 * مرشّحاتها وبدائلها (stripForInstructor). وبقي سطرٌ واحد يحملها نصّاً: تعديلُ
 * القسم لموعدٍ جاء من طلب يُسجَّل في خطّ الطلب جملةً («الوقت … · القاعة 7/31 ←
 * 8/22 · المرفق المرافق …»). فتصل الأستاذَ الجملةُ بلا جزء القاعة ولا المرفق:
 * لا اسمَ ولا رمزَ ولا تلميحَ مثل «تغيّرت القاعة» (المالك 2026-10-29: لا معلومةَ
 * عن القاعة أو المبنى ولا تلميحَ بها). وما لم يبقَ منه شيءٌ يعود نصّاً فارغاً،
 * فيُسقَط الحدثُ كلُّه من نسخة الأستاذ.
 */
const ROOM_PART = /^(القاعة|المرفق المرافق) /;
export function withoutRoomNames(text: string): string {
  const parts = String(text || "").split(" · ");
  if (!parts.some(part => ROOM_PART.test(part))) return String(text || "");
  return parts.filter(part => !ROOM_PART.test(part)).join(" · ");
}

/** Official writes participate in the same transaction as submissions. Internal apply
 * passes its owner explicitly; a client-supplied origin cannot bypass reservations.
 * A department edit the coordinator explicitly confirmed passes that request as an owner too (A2). */
export function assertRequestReservationWrite(row: Partial<FSchedule>, entries: RequestReservation[], owner: string | readonly string[] = ""): void {
  const owners = new Set((Array.isArray(owner) ? owner : [owner]).filter(Boolean));
  for (const entry of liveReservations(entries)) {
    if (owners.has(entry.requestId)) continue;
    /* حجزُ التحرير المؤقّت يحمي الأستاذَ من زميله، لا من قسمه: القسمُ لا يُمنع به. */
    if (entry.heldUntil) continue;
    if ((row.id && entry.offeringRowIds.includes(Number(row.id))) || (touches(slotsOf(row), entry.slots)
      && (Number(row.AdInstructorId) === entry.instructorId
        || (entry.room && occupies(row, entry.room, entry.collegeId)))))
      throw new RequestHoldConflict(entry);
  }
}

export function reservationRows(entries: RequestReservation[], termId: number): FSchedule[] {
  return liveReservations(entries).flatMap((entry, at) => entry.slots.map((slot, index) => ({
    id: -2_000_000_000 + at * 10 + index, AdTermId: termId, AdCollegeId: entry.collegeId,
    AdSectionId: entry.sectionId, AdCourseId: entry.courseId, AdInstructorId: entry.instructorId,
    SCode: `reservation:${at}`, ...Object.fromEntries(days.map(day => [day, day === slot.day])),
    fstarttime: slot.start, fendtime: slot.end, roomId: entry.room?.roomId,
    buildingId: entry.room?.buildingId, AdRoomCode: entry.room?.room || "", AdRoomHall: entry.room?.hall || "",
    companionRoomId: entry.room?.companionRoomId,
  } as FSchedule)));
}

/**
 * ما يراه حكمُ طلبٍ واحد من الجدول: الصفوفُ الرسمية وحجوزُ الطلبات الأخرى —
 * لا حجوزُه هو.
 *
 * أصلُ «التعارض مع النفس» (A1): وارد القسم يبني سياقاً واحداً لكل نطاق ويحكم
 * به على عشرات الطلبات، والسياقُ كان يستثني حجوزَ أوّل طلبٍ بناه وحده. فكلُّ
 * طلبٍ بعده يرى حجزَه هو صفّاً لأستاذه بالمقرر والوقت نفسيهما: «لديك محاضرةٌ
 * أخرى» و«شعبة أخرى بالوقت نفسه م.7/5». فالاستثناءُ يُحسب هنا لكل طلبٍ على حدة.
 *
 * والشعبةُ القائمة المحجوزة لا تُكرَّر صفّاً ثانياً: يُنسب صفُّها الرسميُّ إلى
 * من حجزها — شعبةٌ واحدةٌ لا شعبتان في الساعة نفسها.
 */
export function occupiedRowsForRequest(officialRows: FSchedule[], entries: RequestReservation[], termId: number, ownerRequestId: string, now = Date.now()): FSchedule[] {
  const others = liveReservations(entries, now).filter(entry => entry.requestId !== ownerRequestId);
  const claimed = new Map<number, number>();
  for (const entry of others) for (const id of entry.offeringRowIds || []) claimed.set(Number(id), Number(entry.instructorId));
  const official = claimed.size ? officialRows.map(row => claimed.has(Number(row.id)) ? { ...row, AdInstructorId: claimed.get(Number(row.id))! } : row) : officialRows;
  return [...official, ...reservationRows(others.filter(entry => !(entry.offeringRowIds || []).length), termId)];
}
