/**
 * ── القاعدةُ الواحدة لسعة القاعة في طلب الأستاذ (المالك 2026-11-14) ─────────────────────
 * «لما يتم اختيار القاعة له لازم تكون مناسبة لسعة المقرر — هذا ضروري جداً جداً جداً.»
 *
 *   • المقاعد = MaxStudent إن كانت، وإلا سقفُ اللائحة ولو مفترَضاً.
 *   • معروفةٌ أصغر: لا تُختار أبداً. غيرُ مسجّلة: لا تُختار ما دامت معروفةٌ تكفي خالية، وإلا تُحجز موسومة.
 *   • وقتٌ لا قاعةَ فيه تكفي: غيرُ متاح للأستاذ بنصٍّ بلا قاعة، والقسمُ يرى المقاعد مقابل السعات، ولا يُقترح.
 *   • الحجزُ يطبّق القاعدةَ نفسها، وما يصل الأستاذ لا يحمل حقلَ قاعةٍ ولا مبنى.
 * اختبارٌ خالص بلا خادم.
 */
import { judgeRequest, type RequestedRow, type VerdictContext } from "../src/utils/instructorRequestVerdict";
import {
  pickRequestRoom, rankRequestRooms, requiredSeats, roomSeatFit, undersizedRequestRooms,
  ROOM_TOO_SMALL_TEXT, type RankableRoom,
} from "../src/utils/requestRoomRanking";
import { seatCap } from "../src/utils/actualDemandSupply";
import { holdRequestReservation, type RequestReservationProposal } from "../src/utils/instructorRequestReservations";
import { placeFieldsIn, withoutPlaceFields } from "../src/utils/teacherSafeFields";
import type { AdCourse, AdInstructor, FSchedule, InstructorRequest } from "../src/types";

let passed = 0, failed = 0;
const check = (ok: boolean, name: string) => { if (ok) { passed++; console.log(`✓ ${name}`); } else { failed++; console.log(`✗ ${name}`); } };

/* ── 1) المقاعد المطلوبة ───────────────────────────────────────────────── */
const theoretical = { specialization: "theoretical" as const, excused: new Set<string>() };
check(requiredSeats(45, { cap: 60, assumed: false }).seats === 45, "MaxStudent موجبة: هي المقاعد");
check(requiredSeats(80, seatCap({ CourseCode: "X", CourseTeachingMode: "theoretical", MaxStudent: 80 }, theoretical)).seats === 80,
  "MaxStudent فوق سقف الطبيعة: تُحترم MaxStudent (القاعةُ لمن سُجّل فعلاً)");
check(JSON.stringify(requiredSeats(0, seatCap({ CourseCode: "X", CourseTeachingMode: "practical" }, theoretical))) === JSON.stringify({ seats: 25, assumed: false }),
  "بلا MaxStudent: سقفُ طبيعة المقرر في اللائحة");
check(JSON.stringify(requiredSeats(undefined, seatCap({ CourseCode: "X" }, theoretical))) === JSON.stringify({ seats: 60, assumed: true }),
  "بلا سعةٍ ولا طبيعة: السقفُ المفترَض يُحكم به، موسوماً «مفترض»");

/* ── 2) ملاءمة السعة ───────────────────────────────────────────────────── */
check(roomSeatFit(40, 40) === "fits" && roomSeatFit(50, 40) === "fits", "سعةٌ معروفة ≥ المقاعد: تكفي");
check(roomSeatFit(39, 40) === "short", "سعةٌ معروفة < المقاعد: أصغر");
check(roomSeatFit(undefined, 40) === "unknown" && roomSeatFit(0, 40) === "unknown", "بلا سعةٍ مسجّلة: غير مسجّلة");

/* ── 3) الترتيب ────────────────────────────────────────────────────────── */
const base = { courseSectionId: 4, nearBuildingIds: new Set<string>(), previousRoomIds: new Set<string>(), usage: new Map<string, number>() };
const room = (key: string, capacity: number | undefined, extra: Partial<RankableRoom> = {}): RankableRoom => ({ key, roomId: key, buildingId: "b1", capacity, fit: 1, sectionIds: [], ...extra });
{
  const rooms = [room("short", 30, { sectionIds: [4] }), room("unknown", undefined, { sectionIds: [4] }), room("fits", 45), room("roomy", 90)];
  const ranked = rankRequestRooms(rooms, { ...base, seats: 40 });
  check(ranked.map(r => r.key).join(",") === "fits,roomy,unknown", "المعروفةُ التي تكفي أولاً بتفضيلاتها، ثم غيرُ المسجّلة، والأصغرُ خارجاً");
  check(ranked.every(r => r.seatFit !== "short") && ranked.find(r => r.key === "unknown")?.seatFit === "unknown", "كلُّ مرشّحٍ يحمل ملاءمةَ سعته");
  check(undersizedRequestRooms(rooms, 40).map(r => r.key).join(",") === "short", "والأصغرُ يُعرف وحده ليقول الحكمُ «لا قاعة تتسع»");
  const assumed = rankRequestRooms(rooms, { ...base, seats: 60, seatsAssumed: true });
  check(assumed.map(r => r.key).join(",") === "roomy,unknown", "سقفٌ مفترَض يُحكم به كاملاً: الأصغرُ منه لا يُرشَّح ولو آخراً");
}
{
  /* النوعُ بعد السعة: قاعةٌ من نوع المقرر لا تتّسع لا تحجب قاعةً مخالفةً تتّسع (آخرَ الترتيب، ويراجعها القسم). */
  const onlyShortOfType = rankRequestRooms([room("rightButSmall", 20), room("lab", 50, { typeMismatch: true })], { ...base, seats: 35 });
  check(onlyShortOfType.map(r => r.key).join(",") === "lab", "نوعُ المقرر أصغر: يبقى المخالفُ الذي يتّسع، والأصغرُ لا يُختار");
  const typed = rankRequestRooms([room("right", 40), room("lab", 50, { typeMismatch: true })], { ...base, seats: 35 });
  check(typed.map(r => r.key).join(",") === "right", "ومن النوع ما يتّسع: المخالفُ لا يُرشَّح");
  const facility = rankRequestRooms([room("a", 40)], { ...base, seats: 35, facility: true });
  check(facility[0].why.includes("facility"), "المرفقُ المرافق يُوسم على المرشّح كما كان");
}

/* ── 4) الاختيار من الخالي ─────────────────────────────────────────────── */
check(pickRequestRoom([{ key: "u", seatFit: "unknown" as const }, { key: "f", seatFit: "fits" as const }])?.room.key === "f", "خالٍ معروفٌ يكفي يسبق غيرَ المسجّلة ولو تقدّمت");
const flagged = pickRequestRoom([{ key: "u", seatFit: "unknown" as const }]);
check(flagged?.room.key === "u" && flagged.flagged === true, "لا معروفةَ تكفي خالية: غيرُ المسجّلة موسومةً للقسم");
check(pickRequestRoom([{ key: "s", seatFit: "short" as const }]) === null, "والأصغرُ لا يُختار أبداً");

/* ── 5) الحكم والبدائل ─────────────────────────────────────────────────── */
const TEACHER = 7, SECTION = 4;
const row = (over: Partial<FSchedule> = {}): FSchedule => ({
  id: 1, AdCollegeId: 1, AdSectionId: SECTION, AdTermId: 20, AdCourseId: 300, AdCourseName: "زميل", SCode: "01", AdInstructorId: 8,
  fsunday: true, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false,
  fstarttime: "10:00", fendtime: "10:50", AdRoomCode: "B1", AdRoomHall: "BIG", roomId: "big", locationStatus: "VERIFIED", ...over,
} as FSchedule);
const course = (id: number, max: number): AdCourse => ({ AdCourseId: id, AdCollegeId: 1, AdSectionId: SECTION, CourseCode: `C${id}`, CourseName: `مقرر ${id}`, CourseCredit: 1, CourseHours: 1, MaxStudent: max } as AdCourse);
const person = (id: number): AdInstructor => ({ AdInstructorId: id, AdInstructorName: `د. ${id}`, AdInstructorCivil: String(id).padStart(12, "0"), AdInstructorMobile: "5" } as AdInstructor);
const registryRooms = [room("id:big", 50, { roomId: "big" }), room("id:s1", 25, { roomId: "s1" }), room("id:s2", 30, { roomId: "s2" })];
const ranked = rankRequestRooms(registryRooms, { ...base, courseSectionId: SECTION, seats: 40 });
const undersized = undersizedRequestRooms(registryRooms, 40);
const capacityOf = (key: string) => Number(registryRooms.find(r => r.key === key)?.capacity || 0);
const colleague = row();
const ctx = (over: Partial<VerdictContext> = {}): VerdictContext => ({
  instructorId: TEACHER, allRows: [colleague], instructorRowsAfter: [], courses: new Map([[200, course(200, 40)], [300, course(300, 20)]] as any),
  instructors: new Map([[TEACHER, person(TEACHER)], [8, person(8)]]),
  knownRoomKeys: ranked.map(r => r.key), undersizedRoomKeys: undersized.map(r => r.key),
  roomCapacityDetail: free => `الشعبة تحتاج 40 مقعداً، والقاعات الخالية في هذا الوقت سعتها ${free.map(capacityOf).sort((a, b) => b - a).join("، ")} فقط.`,
  startLadder: ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00"], offerAlternatives: true,
  ...over,
});
const addAt = (start: string): RequestedRow => ({ rowId: null as any, tempId: -1, action: "add", AdCourseId: 200, days: ["fsunday"], start });
const mine = (start: string) => [{ ...row({ id: -1, AdInstructorId: TEACHER, AdCourseId: 200, fstarttime: start, fendtime: `${start.slice(0, 2)}:50`, roomId: undefined, AdRoomCode: "", AdRoomHall: "" } as any) }];
check(ranked.map(r => r.key).join(",") === "id:big", "الحكمُ لا يرى من القاعات إلا ما يتّسع لأربعين");

const busyBig = judgeRequest(addAt("10:00"), ctx({ instructorRowsAfter: mine("10:00") }));
const capacityReason = busyBig.reasons.find(r => r.source === "room");
check(!busyBig.sendable && busyBig.roomAvailable === false, "وقتٌ لا يخلو فيه إلا الأصغر: غيرُ متاح");
check(capacityReason?.text === ROOM_TOO_SMALL_TEXT && capacityReason.code === "capacity", "وسببُه للأستاذ «لا قاعة تتسع لشعبتك في هذا الوقت»");
check(!/big|s1|s2|B1|BIG/i.test(capacityReason?.text || ""), "ولا اسمَ قاعةٍ ولا مبنى في نصّه");
check(/40/.test(capacityReason?.detail || "") && /30، 25/.test(capacityReason?.detail || ""), "والقسمُ يرى المقاعدَ مقابل سعات الخالي");
check(busyBig.roomCandidates.length === 0, "ولا قاعةَ تُختار له");
check(busyBig.nearestTimes.length > 0 && busyBig.nearestTimes.every(slot => slot.start !== "10:00"), "والبدائلُ أوقاتٌ أخرى");
for (const slot of busyBig.nearestTimes) {
  const again = judgeRequest(addAt(slot.start), ctx({ instructorRowsAfter: mine(slot.start) }));
  check(again.sendable && again.roomCandidates[0] === "id:big", `البديلُ ${slot.start} فيه قاعةٌ تتّسع (تُختار هي)`);
}
const free = judgeRequest(addAt("08:00"), ctx({ instructorRowsAfter: mine("08:00") }));
check(free.sendable && free.roomCandidates.join(",") === "id:big", "وقتٌ تخلو فيه الكبيرة: متاحٌ وهي المختارة، لا الأصغر");

const noneFits = judgeRequest(addAt("08:00"), ctx({ instructorRowsAfter: mine("08:00"), knownRoomKeys: [] }));
check(!noneFits.sendable && noneFits.roomAvailable === false && noneFits.reasons.some(r => r.code === "capacity"),
  "لا قاعةَ في النطاق تتّسع أصلاً: «لا قاعة تتسع» لا «وثّق قاعة»");

/* غيرُ المسجّلة تُنقذ الوقتَ حين تخلو، وتأتي بعد المعروفة حين تخلو المعروفة. */
const withUnknown = rankRequestRooms([...registryRooms, room("id:nocap", undefined, { roomId: "nocap" })], { ...base, courseSectionId: SECTION, seats: 40 });
const savedByUnknown = judgeRequest(addAt("10:00"), ctx({ instructorRowsAfter: mine("10:00"), knownRoomKeys: withUnknown.map(r => r.key) }));
check(savedByUnknown.sendable && savedByUnknown.roomCandidates.join(",") === "id:nocap", "الكبيرةُ مشغولة وغيرُ المسجّلة خالية: تُحجز هي (موسومةً للقسم)");
const knownFirst = judgeRequest(addAt("08:00"), ctx({ instructorRowsAfter: mine("08:00"), knownRoomKeys: withUnknown.map(r => r.key) }));
check(knownFirst.roomCandidates[0] === "id:big", "وحين تخلو المعروفةُ التي تكفي تسبق غيرَ المسجّلة");

/* المرفقُ المرافق: الكبيرةُ بلا مرفقٍ خالٍ لا تُعدّ، فلا يُعوَّض بالأصغر. */
const noFacility = judgeRequest(addAt("08:00"), ctx({ instructorRowsAfter: mine("08:00"), roomSlotsEligible: key => key !== "id:big" }));
check(!noFacility.sendable && noFacility.roomCandidates.length === 0, "مقررٌ بمرفق: ما يتّسع بلا مرفقه لا يُختار، والأصغرُ لا يعوّضه");

/* ── 6) الحجزُ بالقاعدة نفسها ──────────────────────────────────────────── */
const soon = new Date(Date.now() + 10 * 60_000).toISOString();
const request = { id: "req-seat", AdInstructorId: TEACHER, items: [] } as unknown as InstructorRequest;
const proposal = (rooms: RequestReservationProposal["rooms"]): RequestReservationProposal => ({ itemId: "draft:0", instructorId: TEACHER, collegeId: 1, sectionId: SECTION, courseId: 200,
  slots: [{ day: "fsunday", start: "10:00", end: "10:50" }], rooms, offeringRowIds: [] });
const R = {
  short: { roomId: "s2", room: "B1", hall: "S2", capacity: 30, seatFit: "short" as const },
  unknown: { roomId: "nocap", room: "B1", hall: "NC", seatFit: "unknown" as const },
  big: { roomId: "big", room: "B1", hall: "BIG", capacity: 50, seatFit: "fits" as const },
};
const heldFree = holdRequestReservation([], request, proposal([R.short, R.unknown, R.big]), [], soon);
check(heldFree[0].room?.roomId === "big", "الحجزُ: الخالي الذي يكفي قبل غير المسجّلة ولو جاءت قبله، والأصغرُ لا يُحجز");
const heldUnknown = holdRequestReservation([], request, proposal([R.short, R.unknown, R.big]), [colleague], soon);
check(heldUnknown[0].room?.roomId === "nocap" && heldUnknown[0].room?.seatFit === "unknown", "الكبيرةُ مشغولة: تُحجز غيرُ المسجّلة موسومة");
let refused = "";
try { holdRequestReservation([], request, proposal([R.short]), [], soon); } catch (error: any) { refused = String(error?.message || ""); }
check(Boolean(refused), "لا يبقى إلا الأصغر: يُرفض الحجز ولا تُحجز قاعةٌ لا تتّسع");

/* ── 7) لا قاعةَ ولا مبنى في ما يصل الأستاذ ────────────────────────────── */
const fixture = {
  request: {
    individualException: { opensAt: "a", closesAt: "b", grantedAt: "c" },
    items: [{
      roomAvailable: true, reasons: [{ source: "room", code: "capacity", text: ROOM_TOO_SMALL_TEXT }],
      roomCandidates: ["id:big"], roomOptions: [{ key: "id:big", room: "B1", hall: "BIG", roomId: "big", buildingId: "b1", capacity: 50 }],
      reservedRoom: { roomId: "big", label: "B1/BIG" }, roomSwitch: { from: "B1/S2", to: { room: "B1", hall: "BIG" } }, roomSeats: { seats: 40, assumed: false },
      before: { courseId: 1, room: "B1/S2", days: "ح", time: "10:00" }, slots: [{ day: "fsunday", start: "10:00", end: "10:50" }],
      decision: { alternatives: [{ day: "fsunday", start: "08:00", end: "08:50", roomId: "big", buildingCode: "B1" }] },
    }],
  },
};
const cleaned = withoutPlaceFields(fixture);
check(placeFieldsIn(fixture).length > 5 && placeFieldsIn(cleaned).length === 0, "التنقيةُ الأخيرة تحذف كلَّ حقلِ قاعةٍ أو مبنى في أيّ عمق");
check(cleaned.request.items[0].roomAvailable === true && cleaned.request.items[0].reasons[0].code === "capacity" && cleaned.request.items[0].slots.length === 1,
  "وتُبقي roomAvailable ورموزَ الأسباب والمواعيد");
check(!/B1|BIG|"big"|"b1"/.test(JSON.stringify(cleaned)), "ولا يبقى رمزُ قاعةٍ ولا مبنى في الجواب");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
