/**
 * ── تبديلُ القاعتين داخل الموعد ─────────────────────────────────────────────
 *
 * مقررٌ في قاعةٍ لا تلائمه (نوعٌ مختلف أو سعةٌ أقل من مقاعده) وقاعتُه الملائمة
 * يشغلها مقررٌ آخر يلائمه غيرُها — فتبديلُ القاعتين يُصلح الاثنين معاً.
 * دالّةٌ نقيّةٌ للعرض فقط (لا كتابة ولا شبكة): يستعملها الخادم فوق أسبوع الفصل
 * الحقيقي وسجلّ القاعات، ويحكم بعدها بمانع الحفظ نفسه قبل أن يُعرض أي اقتراح.
 *
 * الشرطُ الصلب الذي لا يخفّ: سعةُ القاعة المسجّلة تكفي مقاعدَ المقرر (مجهولةُ السعة
 * لا تُقترح لمقررٍ له مقاعد). والنوعُ يطابق نوعَ المقرر حين يُسجَّل له نوع.
 *
 * اتجاهان:
 *   give — موعدك في قاعةٍ لا تلائمه وفي الوقت نفسه قاعةٌ ملائمةٌ حرّة: تنتقل إليها،
 *          وتُفسح قاعتك لمقررٍ آخر يحتاج نوعها وهو اليوم في غير مكانه.
 *   take — لا قاعةَ ملائمةً حرّة لموعدك (أو لم تُختر قاعة): قاعةٌ ملائمةٌ يشغلها مقررٌ
 *          في غير مكانه وله قاعةٌ ملائمةٌ حرّة في وقته؛ يخرج إليها، وتأخذ أنت قاعته.
 */
import type { FSchedule } from "../types";
import { rowOccupiesRoom, roomIdentityKey } from "./locationRegistry";
import { roomSuitability } from "./roomSuitability";
import { activeDays, timeToMinutes, type DayKey } from "./scheduleIntelligence";

export interface RoomSwapHall {
  room: string;
  hall: string;
  buildingId?: string;
  roomId?: string;
  /** النوع كما يراه قسمُ المقرر (محسوباً مسبقاً). */
  roomType?: string;
  capacity?: number | null;
}

export interface RoomSwapCourse {
  AdCourseId: number;
  CourseName?: string;
  CourseRoomType?: string;
  CourseTeachingMode?: string;
  MaxStudent?: number | null;
}

export type RoomSwapReason = "type" | "capacity";

export interface RoomSwapOther {
  rowId: number;
  rev?: number;
  courseId: number;
  courseName: string;
  scode: string;
  days: DayKey[];
  start: string;
  end: string;
  from: RoomSwapHall;
  to: RoomSwapHall;
}

export interface RoomSwap {
  id: string;
  direction: "give" | "take";
  /** لماذا يُنصح بالتبديل (نوع القاعة · السعة) — رموزٌ تُرسم أيقونات. */
  reasons: RoomSwapReason[];
  /** موعدك أنت: من قاعته (قد لا تكون اختيرت) إلى القاعة الجديدة. */
  mine: { from: RoomSwapHall | null; to: RoomSwapHall };
  other: RoomSwapOther;
}

export interface RoomSwapInput {
  draft: Partial<FSchedule> & { id?: number };
  /** صفوفُ الفصل الحيّة كلُّها (يدخل فيها صفُّ المسوّدة المحفوظ إن كانت تعديلاً). */
  rows: readonly FSchedule[];
  halls: readonly RoomSwapHall[];
  courses: ReadonlyMap<number, RoomSwapCourse>;
  /** من الصفوف يجوز تحريكه (قسمُ المسوّدة نفسه فقط). */
  movable: (row: FSchedule) => boolean;
}

export interface RoomSwapAnswer { need: "poor" | "none" | null; swaps: RoomSwap[] }

const hallSame = (a: RoomSwapHall, b: RoomSwapHall) => a.roomId && b.roomId ? a.roomId === b.roomId : a.room === b.room && a.hall === b.hall;
const seatsOf = (course: RoomSwapCourse | undefined) => Math.max(0, Number(course?.MaxStudent || 0));

/** ما يُخالف في هذه القاعة لهذا المقرر: نوعٌ مختلف، أو سعةٌ مسجّلة أقلّ من المقاعد. */
export function roomProblems(course: RoomSwapCourse | undefined, hall: RoomSwapHall | null): RoomSwapReason[] {
  if (!course || !hall) return [];
  const fit = roomSuitability(course, { roomType: hall.roomType, capacity: hall.capacity });
  const out: RoomSwapReason[] = [];
  if (fit.typeRank === 0) out.push("type");
  const seats = seatsOf(course), capacity = Number(hall.capacity || 0);
  if (seats > 0 && capacity > 0 && capacity < seats) out.push("capacity");
  return out;
}

/**
 * تصلح القاعةُ للمقرر: النوعُ يطابق، والسعةُ المعروفة تكفي — شرطٌ صلب.
 * مقررٌ بلا نوعٍ مسجّل لا يُرسَل إلى قاعةٍ متخصّصة: `like` نوعُ قاعته الحالية، ولا تصلح له إلا من نوعها
 * (ولا اقتراح إن لم يُعرف نوعُ قاعته).
 */
export function roomIsGood(course: RoomSwapCourse | undefined, hall: RoomSwapHall, like?: string): boolean {
  if (!course) return false;
  const expected = String(course.CourseRoomType || "").trim();
  const fit = roomSuitability(course, { roomType: hall.roomType, capacity: hall.capacity });
  if (expected ? fit.typeRank !== 2 : (fit.typeRank === 0 || !like || String(hall.roomType || "") !== like)) return false;
  const seats = seatsOf(course), capacity = Number(hall.capacity || 0);
  return seats <= 0 || (capacity > 0 && capacity >= seats);
}

const overlaps = (row: FSchedule, days: DayKey[], start: number, end: number) =>
  days.some(day => (row as any)[day]) && timeToMinutes(row.fstarttime) < end && start < timeToMinutes(row.fendtime);

export function appointmentRoomSwaps(input: RoomSwapInput, max = 2): RoomSwapAnswer {
  const { draft, rows, halls, courses } = input;
  const draftId = Number(draft.id || 0);
  const course = courses.get(Number(draft.AdCourseId || 0));
  const days = activeDays(draft as FSchedule);
  const start = timeToMinutes(String(draft.fstarttime || "")), end = timeToMinutes(String(draft.fendtime || ""));
  if (!course || !days.length || !(end > start) || !halls.length) return { need: null, swaps: [] };

  const hallOf = (row: Partial<FSchedule>): RoomSwapHall | null =>
    halls.find(hall => rowOccupiesRoom(row, hall.roomId, hall.room, hall.hall)) || null;
  const busyIn = (hall: RoomSwapHall, rowDays: DayKey[], from: number, to: number, ignore: ReadonlySet<number>) =>
    rows.filter(row => !ignore.has(Number(row.id)) && rowOccupiesRoom(row, hall.roomId, hall.room, hall.hall) && overlaps(row, rowDays, from, to));
  const none = new Set<number>(draftId ? [draftId] : []);

  const mineNow = hallOf(draft);
  const chosen = Boolean(roomIdentityKey(draft)) && draft.locationStatus !== "PENDING_ROOM";
  const mineProblems = roomProblems(course, mineNow);
  const freeGood = halls.filter(hall => roomIsGood(course, hall, mineNow?.roomType) && !busyIn(hall, days, start, end, none).length);
  const need: RoomSwapAnswer["need"] = mineProblems.length ? "poor" : (!chosen && !freeGood.length ? "none" : null);
  if (!need) return { need: null, swaps: [] };

  const tight = (hall: RoomSwapHall, c: RoomSwapCourse | undefined) => {
    const spare = Number(hall.capacity || 0) - seatsOf(c);
    return spare >= 0 ? spare : 9999;
  };
  const sameSite = (a: RoomSwapHall | null, b: RoomSwapHall) => Boolean(a?.buildingId && b.buildingId && a.buildingId === b.buildingId);
  /* مرفقٌ مرافق للشعبة المنقولة يتبع موقعها: لا تغادر مبناها. */
  const staysWithFacility = (row: FSchedule, to: RoomSwapHall) => !row.companionRoomId || !row.buildingId || !to.buildingId || row.buildingId === to.buildingId;
  const movable = (row: FSchedule) => Number(row.id) > 0 && Number(row.id) !== draftId && row.locationStatus !== "PENDING_ROOM" && input.movable(row);
  const asOther = (row: FSchedule, from: RoomSwapHall, to: RoomSwapHall): RoomSwapOther => ({
    rowId: Number(row.id), rev: row.rev === undefined ? undefined : Number(row.rev), courseId: Number(row.AdCourseId),
    courseName: String(courses.get(Number(row.AdCourseId))?.CourseName || (row as any).AdCourseName || ""), scode: String(row.SCode || ""),
    days: activeDays(row), start: row.fstarttime, end: row.fendtime, from, to,
  });

  const found: Array<RoomSwap & { score: number }> = [];

  if (need === "poor" && mineNow) {
    /* give: قاعتي لا تلائمني ولي قاعةٌ ملائمةٌ حرّة؛ فمن يأخذ قاعتي؟ */
    const targets = [...freeGood].sort((a, b) => Number(sameSite(mineNow, b)) - Number(sameSite(mineNow, a)) || tight(a, course) - tight(b, course));
    for (const mine of targets.slice(0, 4)) {
      for (const row of rows) {
        if (!movable(row)) continue;
        const rowCourse = courses.get(Number(row.AdCourseId));
        const rowHall = hallOf(row);
        if (!rowHall || hallSame(rowHall, mineNow) || !roomProblems(rowCourse, rowHall).length) continue;
        if (!roomIsGood(rowCourse, mineNow, rowHall.roomType) || !staysWithFacility(row, mineNow)) continue;
        if (busyIn(mineNow, activeDays(row), timeToMinutes(row.fstarttime), timeToMinutes(row.fendtime), new Set([Number(row.id)])).length) continue;
        found.push({
          id: `give-${row.id}-${mine.roomId || mine.hall}`, direction: "give", reasons: mineProblems,
          mine: { from: mineNow, to: mine }, other: asOther(row, rowHall, mineNow),
          score: (mineProblems.includes("type") ? 0 : 10) + (sameSite(mineNow, mine) ? 0 : 3) + (sameSite(rowHall, mineNow) ? 0 : 2) + Math.min(5, tight(mine, course) / 20),
        });
      }
    }
  }

  /* take: قاعةٌ ملائمةٌ لي يشغلها من هو في غير مكانه وله مخرجٌ ملائم. */
  for (const target of halls) {
    if (!roomIsGood(course, target, mineNow?.roomType) || (mineNow && hallSame(mineNow, target))) continue;
    const holders = busyIn(target, days, start, end, none);
    if (holders.length !== 1) continue;
    const row = holders[0];
    if (!movable(row)) continue;
    const rowCourse = courses.get(Number(row.AdCourseId));
    const reasons = roomProblems(rowCourse, target);
    if (!reasons.length) continue;
    const rowDays = activeDays(row), from = timeToMinutes(row.fstarttime), to = timeToMinutes(row.fendtime);
    const exits = halls
      .filter(hall => !hallSame(hall, target) && roomIsGood(rowCourse, hall, target.roomType) && staysWithFacility(row, hall)
        && !busyIn(hall, rowDays, from, to, new Set([Number(row.id)])).length)
      .sort((a, b) => Number(sameSite(target, b)) - Number(sameSite(target, a)) || tight(a, rowCourse) - tight(b, rowCourse));
    const exit = exits[0];
    if (!exit) continue;
    found.push({
      id: `take-${row.id}-${target.roomId || target.hall}`, direction: "take", reasons,
      mine: { from: mineNow, to: target }, other: asOther(row, target, exit),
      score: (reasons.includes("type") ? 0 : 10) + (sameSite(mineNow, target) ? 0 : 3) + (sameSite(target, exit) ? 0 : 2) + Math.min(5, tight(target, course) / 20),
    });
  }

  const seen = new Set<number>();
  const swaps = found.sort((a, b) => a.score - b.score)
    .filter(item => (seen.has(item.other.rowId) ? false : (seen.add(item.other.rowId), true)))
    .slice(0, Math.max(1, max))
    .map(({ score: _score, ...swap }) => swap);
  return { need, swaps };
}
