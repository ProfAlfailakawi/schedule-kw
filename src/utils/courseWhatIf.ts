/**
 * ── «كل المقررات»: كل مقررات صحائف القسم، وأثرُ «− شعبة / + شعبة» فوراً ───────
 *
 * لا محرّك جديد: الشعبُ تُقرأ بـ sectionCards، والحذفُ removeSectionChange،
 * والإضافةُ أفضلُ موضعٍ من suggestPlacements ثم addSectionChange، والقياسُ
 * measure — كلُّها من src/utils/timeMachine.ts (محرّك محاكي الشعب نفسه).
 * هذا الملف يجمع ما يخصّ المقرر الواحد: شعبُه ومقاعدُه وطلبُه، ثم الأثرُ قبل/بعد.
 *
 * ولا يخترع رقماً: السعةُ من المقرر وإلا من القاعة وإلا «غير محددة» (seatCapacity)،
 * والطلبُ من الرادار وحده؛ وما لا يُعرف يبقى null لا صفراً. ولا كتابة هنا.
 */
import type { AdCourse, FSchedule } from "../types";
import {
  addSectionChange, applyChanges, hallLabel, hallOfRow, measure, placeholderIdsOf, removeSectionChange, sectionCards,
  sectionKey, seatCapacity, suggestPlacements, dayLabel,
  type TmChange, type TmContext, type TmSectionCard,
} from "./timeMachine";
import { weeklyLoadOf } from "./instructorRequestVerdict";
import { roomIdentityKey } from "./locationRegistry";
import { activeDays, timeToMinutes } from "./scheduleIntelligence";

/* معزولٌ يساراً-ليمين، وبشَرطةٍ لا ينكسر عندها السطر («901A02‑302» لا «‎-901A02 302»). */
const ltr = (text: string) => `\u2066${text.replace(/-/g, "\u2011")}\u2069`;

export interface CourseSeatStat {
  courseId: number;
  sections: number;
  /** مقاعدُ الشعب ذات السعة المعروفة. */
  seats: number;
  /** شعبٌ سعتُها «غير محددة» (لا تدخل في المقاعد). */
  unknownSections: number;
  /** من الرادار: من يريد المقرر. null = لا رادار. */
  wanted: number | null;
  /** طلبةٌ يبقون بلا مقعد = الطلب − المقاعد. null حين لا يُعرف الطلب أو سعةُ شعبةٍ ما. */
  withoutSeat: number | null;
}

const statOf = (courseId: number, cards: TmSectionCard[], context: TmContext): CourseSeatStat => {
  const own = cards.filter(card => card.courseId === courseId);
  const known = own.filter(card => card.capacitySource);
  const seats = known.reduce((sum, card) => sum + card.capacity, 0);
  const demand = context.demand?.[String(courseId)];
  const wanted = demand ? Number(demand.wanted || 0) : null;
  const unknownSections = own.length - known.length;
  return {
    courseId, sections: own.length, seats, unknownSections, wanted,
    withoutSeat: wanted === null || unknownSections ? null : Math.max(0, wanted - seats),
  };
};

/** مقاعدُ وطلبُ كل مقرر على جدولٍ ما (الحيّ أو بعد السيناريو). */
export function courseSeatStats(board: FSchedule[], context: TmContext, courseIds: readonly number[]): Map<number, CourseSeatStat> {
  const cards = sectionCards(board, context);
  return new Map(courseIds.map(id => [Number(id), statOf(Number(id), cards, context)]));
}

export interface CourseImpact {
  kind: "remove" | "add";
  courseId: number;
  change: TmChange;
  /** وصفُ الشعبة المحذوفة أو الموضع المقترح. */
  what: string;
  before: CourseSeatStat;
  after: CourseSeatStat;
  /** نصابُ الأستاذ المتأثر (لا يُعرض لـ«هيئة تدريسية»). */
  teacher: { id: number; name: string; before: number; after: number; limit: number } | null;
  /** ضغطُ القاعة: دقائقُ إشغالها في الأسبوع قبل/بعد، واسمُها. */
  room: { label: string; before: number; after: number } | null;
  roomsUsed: { before: number; after: number };
  /** تعارضاتٌ مانعة جديدة (يجب أن تبقى صفراً للإضافة: الموضع فُحص بالمحرّك). */
  newBlocking: number;
}

const roomMinutes = (board: FSchedule[], key: string) => {
  if (!key) return 0;
  let total = 0;
  for (const row of board) if (roomIdentityKey(row) === key) total += Math.max(0, timeToMinutes(row.fendtime) - timeToMinutes(row.fstarttime)) * activeDays(row).length;
  return total;
};

function impactOf(kind: CourseImpact["kind"], courseId: number, board: FSchedule[], change: TmChange, context: TmContext, what: string, teacherId: number, roomRow: Partial<FSchedule> | null): CourseImpact {
  const after = applyChanges(board, [change]);
  const before = courseSeatStats(board, context, [courseId]).get(courseId)!;
  const next = courseSeatStats(after, context, [courseId]).get(courseId)!;
  const courses = new Map<number, AdCourse>(context.courses.map(course => [Number(course.AdCourseId), course]));
  const placeholders = placeholderIdsOf(context);
  let teacher: CourseImpact["teacher"] = null;
  if (teacherId > 0 && !placeholders.has(teacherId)) {
    const mine = (rows: FSchedule[]) => rows.filter(row => Number(row.AdInstructorId) === teacherId);
    teacher = {
      id: teacherId,
      name: String(context.instructors.find(person => Number(person.AdInstructorId) === teacherId)?.AdInstructorName || ""),
      before: weeklyLoadOf(mine(board), courses), after: weeklyLoadOf(mine(after), courses),
      limit: Number(context.loadLimits?.[String(teacherId)] || 0),
    };
  }
  const key = roomRow ? roomIdentityKey(roomRow) : "";
  const mBefore = measure(board, context, { regulation: false });
  const mAfter = measure(after, context, { regulation: false });
  return {
    kind, courseId, change, what, before, after: next, teacher,
    room: key ? { label: hallLabel(roomRow), before: roomMinutes(board, key), after: roomMinutes(after, key) } : null,
    roomsUsed: { before: mBefore.roomsUsed, after: mAfter.roomsUsed },
    newBlocking: Math.max(0, mAfter.blocking - mBefore.blocking),
  };
}

/** «− شعبة»: تُحذف آخرُ شعبةٍ للمقرر (الأعلى رقماً؛ والمضافةُ في السيناريو أولاً). */
export function removeOneSection(board: FSchedule[], courseId: number, context: TmContext): CourseImpact | null {
  const own = sectionCards(board, context).filter(card => card.courseId === courseId);
  if (!own.length) return null;
  const pick = [...own].sort((a, b) => Number(b.added) - Number(a.added) || b.code.localeCompare(a.code, "ar", { numeric: true }))[0];
  const firstRow = board.find(row => pick.rowIds.includes(Number(row.id))) || null;
  /* الأوقاتُ ورموزُ القاعات معزولةٌ باتجاه اليسار-لليمين (LRI…PDI) فلا تنقلب داخل نصٍّ عربي. */
  const what = `ش${pick.code} · ${pick.days.map(day => dayLabel(day)).join(" ")} ${ltr(pick.start)}`;
  return impactOf("remove", courseId, board, removeSectionChange(pick), context, what, pick.vacant ? 0 : pick.instructorId, firstRow);
}

/** «+ شعبة»: أفضلُ موضعٍ خالٍ بلا تعارض (المحرّك نفسه)، أو null إن لم يوجد. */
export function addOneSection(board: FSchedule[], courseId: number, context: TmContext): CourseImpact | null {
  const best = suggestPlacements(board, courseId, context, { max: 1 })[0];
  if (!best) return null;
  const change = addSectionChange(board, courseId, best, context);
  const row = change.op === "add" ? change.rows[0] : null;
  const what = `${best.days.map(day => dayLabel(day)).join(" ")} ${ltr(`${best.start}–${best.end}`)} · ${ltr(hallLabel(best.hall))}`;
  return impactOf("add", courseId, board, change, context, what, best.instructorId, row);
}

/** صافي «± شعبة» لكل مقرر في السلّة (للعرض على البطاقة). */
export function netSectionDelta(base: FSchedule[], board: FSchedule[], context: TmContext, courseId: number): number {
  const count = (rows: FSchedule[]) => new Set(rows.filter(row => Number(row.AdCourseId) === courseId
    && Number(row.AdCollegeId) === Number(context.scope.collegeId) && Number(row.AdSectionId) === Number(context.scope.sectionId)).map(sectionKey)).size;
  return count(board) - count(base);
}

/** سعةُ شعبةٍ واحدة كما يراها المحرّك (للعرض). */
export const sectionSeatCapacity = (course: AdCourse | undefined, row: Partial<FSchedule>, context: Pick<TmContext, "halls">) =>
  seatCapacity(course, hallOfRow(row, context.halls || []));
