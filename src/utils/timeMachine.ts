/**
 * ── آلة الزمن ومحاكي الشعب: طبقةُ تغييراتٍ فوق الجدول الحيّ ────────────────────
 *
 * لا محرّك جديد هنا. كل سؤالٍ يُسأل لمحرّكٍ قائم:
 *   - التعارض الماديّ ............ findConflicts + isBlockingConflict (scheduleIntelligence)
 *   - فجوات الأساتذة .............. instructorGapStats
 *   - النصاب ...................... weeklyLoadOf (instructorRequestVerdict)
 *   - اللائحة (1912/1913) ......... reviewSchedule (scheduleRegulations)
 *   - سلسلة الدومينو ............... findRepairChain / planDisruption (repairChain)
 *   - ضغط الفجوات .................. autoScheduleProposal
 *   - مُلاءمة القاعة ................ roomSuitability
 *   - قراءة الجملة ................. parseNaturalQuery (naturalQuery)
 *   - رقم الشعبة الجديدة .......... nextCourseSectionCode
 *
 * ما يضيفه هذا الملف: «السيناريو» — قائمةُ تغييراتٍ مرتّبة تُطبَّق على نسخةٍ من
 * الجدول (Overlay، كفرعٍ في git)، ثم تُقاس النسختان بالمقاييس نفسها وتُقارنان.
 * لا كتابة هنا ولا شبكة: دالّةٌ نقيّة يستعملها المتصفّح والخادم والاختبارات.
 *
 * ولا يخترع رقماً: عددُ الطلبة يأتي من الرادار (مقاعدُ جُلست وطلبٌ قائم) وإلا
 * يبقى «—»؛ وسعةُ الشعبة من سعة المقرر المسجّلة؛ والنصابُ من سجلّ الأستاذ.
 */
import type { AdCourse, AdInstructor, FSchedule } from "../types";
import {
  SCHEDULE_DAYS, activeDays, autoScheduleProposal, findConflicts, instructorGapStats, isBlockingConflict,
  minutesToTime, timeToMinutes, type ConflictInsight, type DayKey,
} from "./scheduleIntelligence";
import { weeklyLoadOf } from "./instructorRequestVerdict";
import { reviewSchedule } from "./scheduleRegulations";
import { findRepairChain, planDisruption, type RepairMove } from "./repairChain";
import { parseNaturalQuery, toEnglishDigits } from "./naturalQuery";
import { roomIdentityKey } from "./locationRegistry";
import { roomSuitability } from "./roomSuitability";
import { nextCourseSectionCode } from "./nextCourseSectionCode";
import { placeholderInstructorIds } from "./instructorIdentity";
import { SCHEDULE_DAY_END, SCHEDULE_DAY_START } from "./scheduleTime";
import { AR, countOf } from "./arabicCount";

/* ── الأشكال ───────────────────────────────────────────────────────────────── */

export const TM_DAYS: DayKey[] = SCHEDULE_DAYS.map(day => day.key);
export const dayLabel = (day: DayKey | null | undefined): string => SCHEDULE_DAYS.find(item => item.key === day)?.label || "";

export interface TmHall {
  code: string;
  hall: string;
  buildingId?: string;
  roomId?: string;
  capacity?: number | null;
  roomType?: string;
}

export interface TmCourseDemand {
  /** من رادار التسجيل: من يريد المقرر، ومن جلس فعلاً، وسعتُه الكلية، وعددُ شعبه وقت القياس. */
  wanted: number;
  seated: number;
  capacity: number;
  sections: number;
}

export interface TmContext {
  scope: { collegeId: number; sectionId: number; termId: number; sectionName?: string; termName?: string };
  /** صفوفُ النطاق كاملة. */
  rows: FSchedule[];
  /** بقيةُ الفصل مقنّعة: وقتٌ وقاعة (وأستاذٌ مشترك) بلا اسم مقرر — تكفي لفحص الحجز المزدوج. */
  outside: FSchedule[];
  courses: AdCourse[];
  instructors: AdInstructor[];
  halls: TmHall[];
  /** null = لا رادار لهذا الفصل؛ فلا أعداد طلبة، ولا تخمين. */
  demand: Record<string, TmCourseDemand> | null;
  /** النصاب المسجّل بالساعات لكل أستاذ (سجلّه أو إعداد النصاب). */
  loadLimits: Record<string, number>;
  canWrite: boolean;
}

export type TmChange =
  | { id: string; op: "remove"; rowIds: number[]; label: string; why?: string; cause?: string }
  | { id: string; op: "move"; rowId: number; days?: DayKey[]; start?: string; end?: string; hall?: TmHall | null; label: string; why?: string; cause?: string }
  | { id: string; op: "assign"; rowIds: number[]; instructorId: number; label: string; why?: string; cause?: string }
  | { id: string; op: "add"; rows: FSchedule[]; label: string; why?: string; cause?: string };

export type TmLevel = "green" | "yellow" | "red";

export interface TmMetrics {
  rows: number;
  sections: number;
  blocking: number;
  regulation: number;
  gapMinutes: number;
  roomsUsed: number;
  thursday: number;
  late: number;
  /** ساعات كل أستاذ في النطاق. */
  loads: Record<string, number>;
  overLoad: number;
  /** مقاعدُ الشعب المطروحة (سعة المقرر × الشعب). */
  seats: number;
  /** طلبةٌ جالسون يفقدون مقعداً (من الرادار فقط). null = لا رادار. */
  shortfall: number | null;
}

export interface TmDelta {
  level: TmLevel;
  changedRows: number;
  teachersAffected: number[];
  roomsAffected: number;
  timeChanges: number;
  roomChanges: number;
  studentsMoved: number | null;
  before: TmMetrics;
  after: TmMetrics;
  reasons: string[];
}

/* ── أدوات صغيرة ─────────────────────────────────────────────────────────── */

let changeSeq = 0;
export const changeId = (prefix = "c") => `${prefix}${Date.now().toString(36)}${(changeSeq++).toString(36)}`;

export const sectionKey = (row: Pick<FSchedule, "AdCourseId" | "SCode">) => `${Number(row.AdCourseId)}|${String(row.SCode ?? "").trim()}`;
export const hallKey = (hall: Pick<TmHall, "roomId" | "code" | "hall" | "buildingId">) =>
  roomIdentityKey({ roomId: hall.roomId, AdRoomCode: hall.code, AdRoomHall: hall.hall, buildingId: hall.buildingId } as Partial<FSchedule>);
export const hallLabel = (row: Partial<FSchedule> | TmHall | null | undefined) => {
  if (!row) return "—";
  const code = "code" in row ? row.code : row.AdRoomCode;
  const hall = "hall" in row ? row.hall : row.AdRoomHall;
  return [code, hall].filter(Boolean).join("-") || "—";
};
export const rowHall = (row: FSchedule): TmHall => ({ code: String(row.AdRoomCode || ""), hall: String(row.AdRoomHall || ""), buildingId: row.buildingId, roomId: row.roomId });
const dayFlags = (days: DayKey[]) => Object.fromEntries(TM_DAYS.map(day => [day, days.includes(day)])) as Record<DayKey, boolean>;
const durationOf = (row: Partial<FSchedule>) => Math.max(0, timeToMinutes(String(row.fendtime || "")) - timeToMinutes(String(row.fstarttime || "")));
const withHall = (row: FSchedule, hall: TmHall): FSchedule => ({
  ...row, AdRoomCode: hall.code, AdRoomHall: hall.hall, buildingId: hall.buildingId, roomId: hall.roomId, locationStatus: "VERIFIED",
});
export type TmPeriod = "morning" | "noon" | "evening";
export const periodOf = (start: string): TmPeriod => {
  const minute = timeToMinutes(start);
  return minute < 12 * 60 ? "morning" : minute < 16 * 60 ? "noon" : "evening";
};
export const PERIOD_LABEL: Record<TmPeriod, string> = { morning: "صباحي", noon: "ظهري", evening: "مسائي" };

export function placeholderIdsOf(context: Pick<TmContext, "instructors">): Set<number> {
  return placeholderInstructorIds(context.instructors);
}

/** الجدول الكامل الذي يُفحص عليه: النطاق ومعه بقيةُ الفصل المقنّعة. */
export function boardOf(context: Pick<TmContext, "rows" | "outside">): FSchedule[] {
  return [...context.rows, ...context.outside];
}

/* ── تطبيق الطبقة ─────────────────────────────────────────────────────────── */

/**
 * يطبّق التغييرات بالترتيب على نسخة. لا يمسّ الأصل. تغييرٌ يشير إلى صفٍّ لم يعد
 * موجوداً يُتجاهل هنا، ويظهر في `staleChanges` ليقال للمستخدم بدل أن يُخفى.
 */
export function applyChanges(base: FSchedule[], changes: readonly TmChange[]): FSchedule[] {
  const rows = new Map<number, FSchedule>(base.map(row => [Number(row.id), row]));
  for (const change of changes) {
    if (change.op === "remove") change.rowIds.forEach(id => rows.delete(Number(id)));
    else if (change.op === "assign") change.rowIds.forEach(id => {
      const row = rows.get(Number(id));
      if (row) rows.set(Number(id), { ...row, AdInstructorId: change.instructorId });
    });
    else if (change.op === "move") {
      const row = rows.get(Number(change.rowId));
      if (!row) continue;
      let next: FSchedule = { ...row };
      if (change.days?.length) next = { ...next, ...dayFlags(change.days) };
      if (change.start) next.fstarttime = change.start;
      if (change.end) next.fendtime = change.end;
      if (change.hall) next = withHall(next, change.hall);
      rows.set(Number(change.rowId), next);
    } else if (change.op === "add") change.rows.forEach(row => rows.set(Number(row.id), { ...row }));
  }
  return [...rows.values()];
}

/** تغييراتٌ تشير إلى صفٍّ غاب من الجدول الحيّ. */
export function staleChanges(base: FSchedule[], changes: readonly TmChange[]): TmChange[] {
  const ids = new Set(base.map(row => Number(row.id)));
  const added = new Set<number>();
  return changes.filter(change => {
    if (change.op === "add") { change.rows.forEach(row => added.add(Number(row.id))); return false; }
    const touched = change.op === "move" ? [change.rowId] : change.rowIds;
    return touched.some(id => !ids.has(Number(id)) && !added.has(Number(id)));
  });
}

/** أيُّ صفوفٍ حيّةٍ يمسّها السيناريو، ورقمُ إصدار كلٍّ منها لحظةَ بُني عليه. */
export function touchedRowIds(changes: readonly TmChange[]): number[] {
  const ids = new Set<number>();
  for (const change of changes) {
    if (change.op === "move") ids.add(Number(change.rowId));
    else if (change.op !== "add") change.rowIds.forEach(id => ids.add(Number(id)));
  }
  return [...ids].filter(id => id > 0);
}

export function baseRevisions(rows: FSchedule[], changes: readonly TmChange[]): Record<string, number> {
  const byId = new Map(rows.map(row => [Number(row.id), row]));
  return Object.fromEntries(touchedRowIds(changes).map(id => [String(id), Number(byId.get(id)?.rev || 0)]));
}

/**
 * ── تنبيه الانحراف ──
 * الجدول الحيّ تحرّك بعد بناء السيناريو: صفٌّ يمسّه حُذف أو كُتب فوقه.
 */
export function driftOf(live: FSchedule[], base: Record<string, number>): Array<{ rowId: number; kind: "gone" | "edited" }> {
  const byId = new Map(live.map(row => [Number(row.id), row]));
  const out: Array<{ rowId: number; kind: "gone" | "edited" }> = [];
  for (const [id, rev] of Object.entries(base || {})) {
    const row = byId.get(Number(id));
    if (!row) out.push({ rowId: Number(id), kind: "gone" });
    else if (Number(row.rev || 0) !== Number(rev)) out.push({ rowId: Number(id), kind: "edited" });
  }
  return out;
}

/* ── القياس ───────────────────────────────────────────────────────────────── */

const courseMapOf = (context: Pick<TmContext, "courses">) => new Map(context.courses.map(course => [Number(course.AdCourseId), course] as const));
const scopeOf = (context: Pick<TmContext, "scope">) => (row: FSchedule) =>
  Number(row.AdCollegeId) === Number(context.scope.collegeId) && Number(row.AdSectionId) === Number(context.scope.sectionId);

export function blockingConflicts(scopeRows: FSchedule[], board: FSchedule[], placeholders: Set<number>): ConflictInsight[] {
  return findConflicts(scopeRows, board, { placeholderInstructorIds: placeholders }).filter(isBlockingConflict);
}

export function measure(board: FSchedule[], context: TmContext, options: { regulation?: boolean } = {}): TmMetrics {
  const inScope = scopeOf(context);
  const scopeRows = board.filter(inScope);
  const placeholders = placeholderIdsOf(context);
  const courses = courseMapOf(context);
  const blocking = blockingConflicts(scopeRows, board, placeholders).length;
  const scopeTeachers = new Set(scopeRows.map(row => Number(row.AdInstructorId)).filter(id => id > 0 && !placeholders.has(id)));
  const gapStats = instructorGapStats(board.filter(row => scopeTeachers.has(Number(row.AdInstructorId))));
  let gapMinutes = 0;
  for (const [id, stat] of gapStats) if (scopeTeachers.has(Number(id))) gapMinutes += stat.gapMinutes;
  const loads: Record<string, number> = {};
  let overLoad = 0;
  for (const id of scopeTeachers) {
    const hours = weeklyLoadOf(board.filter(row => Number(row.AdInstructorId) === id), courses);
    loads[String(id)] = hours;
    const limit = Number(context.loadLimits?.[String(id)] || 0);
    if (limit > 0 && hours > limit) overLoad += 1;
  }
  const sectionKeys = new Set(scopeRows.map(sectionKey));
  let seats = 0;
  const sectionsByCourse = new Map<number, number>();
  for (const key of sectionKeys) {
    const courseId = Number(key.split("|")[0]);
    sectionsByCourse.set(courseId, (sectionsByCourse.get(courseId) || 0) + 1);
    seats += Number(courses.get(courseId)?.MaxStudent || 0);
  }
  let shortfall: number | null = null;
  if (context.demand) {
    shortfall = 0;
    for (const [courseId, demand] of Object.entries(context.demand)) {
      const capacityNow = (sectionsByCourse.get(Number(courseId)) || 0) * Number(courses.get(Number(courseId))?.MaxStudent || 0);
      if (capacityNow > 0 || demand.seated > 0) shortfall += Math.max(0, Number(demand.seated || 0) - capacityNow);
    }
  }
  let regulation = 0;
  if (options.regulation !== false && scopeRows.length) {
    try {
      const findings = reviewSchedule({
        rows: scopeRows, courses, instructors: new Map(context.instructors.map(person => [Number(person.AdInstructorId), person] as const)),
      });
      regulation = findings.filter(item => item.source === "decision-1912").length;
    } catch { regulation = 0; }
  }
  const rooms = new Set(scopeRows.map(row => roomIdentityKey(row)).filter(Boolean));
  return {
    rows: scopeRows.length,
    sections: sectionKeys.size,
    blocking,
    regulation,
    gapMinutes,
    roomsUsed: rooms.size,
    thursday: scopeRows.filter(row => row.fthursday).length,
    late: scopeRows.filter(row => timeToMinutes(row.fstarttime) >= 16 * 60).length,
    loads,
    overLoad,
    seats,
    shortfall,
  };
}

/** يقارن جدولين ويعطي مؤشّر الأثر (أخضر/أصفر/أحمر) مع أسبابه بكلماتٍ قليلة. */
export function compareBoards(before: FSchedule[], after: FSchedule[], context: TmContext, beforeMetrics?: TmMetrics): TmDelta {
  const b = beforeMetrics || measure(before, context);
  const a = measure(after, context);
  const inScope = scopeOf(context);
  const beforeById = new Map(before.filter(inScope).map(row => [Number(row.id), row]));
  const afterById = new Map(after.filter(inScope).map(row => [Number(row.id), row]));
  const teachers = new Set<number>();
  const rooms = new Set<string>();
  let changedRows = 0, timeChanges = 0, roomChanges = 0;
  for (const [id, row] of afterById) {
    const old = beforeById.get(id);
    if (!old) {
      changedRows += 1; teachers.add(Number(row.AdInstructorId)); rooms.add(roomIdentityKey(row)); continue;
    }
    const timeMoved = old.fstarttime !== row.fstarttime || old.fendtime !== row.fendtime || activeDays(old).join() !== activeDays(row).join();
    const roomMoved = roomIdentityKey(old) !== roomIdentityKey(row);
    const teacherMoved = Number(old.AdInstructorId) !== Number(row.AdInstructorId);
    if (timeMoved || roomMoved || teacherMoved) {
      changedRows += 1;
      teachers.add(Number(old.AdInstructorId)); teachers.add(Number(row.AdInstructorId));
      if (timeMoved) timeChanges += 1;
      if (roomMoved) { roomChanges += 1; rooms.add(roomIdentityKey(old)); rooms.add(roomIdentityKey(row)); }
    }
  }
  for (const [id, row] of beforeById) if (!afterById.has(id)) {
    changedRows += 1; teachers.add(Number(row.AdInstructorId)); rooms.add(roomIdentityKey(row));
  }
  const placeholders = placeholderIdsOf(context);
  const teachersAffected = [...teachers].filter(id => id > 0 && !placeholders.has(id));
  /* الطلبة المتأثرون: مقاعدُ الشعب التي تغيّر وقتها أو أُلغيت — من الرادار وحده. */
  let studentsMoved: number | null = null;
  if (context.demand) {
    studentsMoved = 0;
    const touched = new Set<string>();
    for (const [id, row] of beforeById) {
      const next = afterById.get(id);
      if (!next || next.fstarttime !== row.fstarttime || activeDays(next).join() !== activeDays(row).join()) touched.add(sectionKey(row));
    }
    for (const key of touched) studentsMoved += estimateSectionStudents(Number(key.split("|")[0]), context) || 0;
  }
  const reasons: string[] = [];
  if (a.blocking > b.blocking) reasons.push(`+${countOf(a.blocking - b.blocking, AR.conflict)}`);
  if (a.blocking < b.blocking) reasons.push(`−${countOf(b.blocking - a.blocking, AR.conflict)}`);
  if (a.overLoad > b.overLoad) reasons.push("تجاوز نصاب");
  if ((a.shortfall || 0) > (b.shortfall || 0)) reasons.push(`${countOf((a.shortfall || 0) - (b.shortfall || 0), AR.student)} بلا مقعد`);
  if (a.gapMinutes > b.gapMinutes + 30) reasons.push("فجوات أكثر");
  if (a.gapMinutes + 30 < b.gapMinutes) reasons.push("فجوات أقل");
  if (a.regulation > b.regulation) reasons.push("ملاحظة لائحية");
  if (teachersAffected.length) reasons.push(countOf(teachersAffected.length, AR.instructor));
  const red = a.blocking > b.blocking || a.overLoad > b.overLoad || (a.shortfall || 0) > (b.shortfall || 0);
  const yellow = !red && (changedRows > 0 && (teachersAffected.length > 0 || timeChanges > 0 || a.gapMinutes > b.gapMinutes + 30 || a.regulation > b.regulation));
  return {
    level: red ? "red" : yellow ? "yellow" : "green",
    changedRows, teachersAffected, roomsAffected: [...rooms].filter(Boolean).length, timeChanges, roomChanges, studentsMoved,
    before: b, after: a, reasons,
  };
}

/* ── الطلبة: من الرادار وحده ────────────────────────────────────────────── */

/** تقديرُ جالسي شعبةٍ واحدة = جالسو المقرر ÷ شعبه وقت القياس. null بلا رادار. */
export function estimateSectionStudents(courseId: number, context: Pick<TmContext, "demand">): number | null {
  const demand = context.demand?.[String(courseId)];
  if (!demand) return null;
  const sections = Math.max(1, Number(demand.sections || 0));
  return Math.round(Number(demand.seated || 0) / sections);
}

/* ── بطاقات الشعب ─────────────────────────────────────────────────────────── */

export interface TmSectionCard {
  key: string;
  courseId: number;
  courseCode: string;
  courseName: string;
  code: string;
  instructorId: number;
  instructorName: string;
  vacant: boolean;
  rowIds: number[];
  days: DayKey[];
  start: string;
  end: string;
  period: TmPeriod;
  hall: string;
  capacity: number;
  students: number | null;
  mode: string;
  added: boolean;
}

export const MODE_LABEL: Record<string, string> = { theoretical: "نظري", applied: "تطبيقي", practical: "عملي", field_training: "ميداني", mixed: "مختلط" };

export function sectionCards(board: FSchedule[], context: TmContext): TmSectionCard[] {
  const inScope = scopeOf(context);
  const courses = courseMapOf(context);
  const people = new Map(context.instructors.map(person => [Number(person.AdInstructorId), person] as const));
  const placeholders = placeholderIdsOf(context);
  const groups = new Map<string, FSchedule[]>();
  for (const row of board.filter(inScope)) groups.set(sectionKey(row), [...(groups.get(sectionKey(row)) || []), row]);
  const cards: TmSectionCard[] = [];
  for (const [key, rows] of groups) {
    const first = [...rows].sort((a, b) => TM_DAYS.indexOf(activeDays(a)[0]) - TM_DAYS.indexOf(activeDays(b)[0]))[0];
    const course = courses.get(Number(first.AdCourseId));
    const teacherId = Number(first.AdInstructorId || 0);
    cards.push({
      key,
      courseId: Number(first.AdCourseId),
      courseCode: String(course?.CourseCode || first.CourseCodeSnapshot || ""),
      courseName: String(course?.CourseName || first.AdCourseName || ""),
      code: String(first.SCode || ""),
      instructorId: teacherId,
      instructorName: String(people.get(teacherId)?.AdInstructorName || ""),
      vacant: !teacherId || placeholders.has(teacherId),
      rowIds: rows.map(row => Number(row.id)),
      days: [...new Set(rows.flatMap(row => activeDays(row)))].sort((a, b) => TM_DAYS.indexOf(a) - TM_DAYS.indexOf(b)),
      start: first.fstarttime,
      end: first.fendtime,
      period: periodOf(first.fstarttime),
      hall: hallLabel(first),
      capacity: Number(course?.MaxStudent || 0),
      students: estimateSectionStudents(Number(first.AdCourseId), context),
      mode: String(course?.CourseTeachingMode || ""),
      added: rows.some(row => Number(row.id) < 0),
    });
  }
  return cards.sort((a, b) => a.courseCode.localeCompare(b.courseCode, "ar") || a.code.localeCompare(b.code, "ar"));
}

/* ── مؤشّر الإشغال: من يشغل ماذا ومتى ─────────────────────────────────────── */

interface Busy { start: number; end: number; id: number }
class BusyIndex {
  private teacher = new Map<string, Busy[]>();
  private room = new Map<string, Busy[]>();
  constructor(board: FSchedule[], private placeholders: Set<number>) {
    for (const row of board) this.add(row);
  }
  add(row: FSchedule) {
    const start = timeToMinutes(row.fstarttime), end = timeToMinutes(row.fendtime);
    for (const day of activeDays(row)) {
      const teacher = Number(row.AdInstructorId || 0);
      if (teacher && !this.placeholders.has(teacher)) push(this.teacher, `${teacher}|${day}`, { start, end, id: Number(row.id) });
      const room = roomIdentityKey(row);
      if (room) push(this.room, `${room}|${day}`, { start, end, id: Number(row.id) });
    }
  }
  remove(id: number) {
    for (const map of [this.teacher, this.room]) for (const [key, list] of map) map.set(key, list.filter(item => item.id !== id));
  }
  teacherFree(teacher: number, days: DayKey[], start: number, end: number, ignore: Set<number> = new Set()) {
    if (!teacher || this.placeholders.has(teacher)) return true;
    return days.every(day => !(this.teacher.get(`${teacher}|${day}`) || []).some(item => !ignore.has(item.id) && item.start < end && start < item.end));
  }
  roomFree(room: string, days: DayKey[], start: number, end: number, ignore: Set<number> = new Set()) {
    if (!room) return true;
    return days.every(day => !(this.room.get(`${room}|${day}`) || []).some(item => !ignore.has(item.id) && item.start < end && start < item.end));
  }
  roomMinutes(room: string) {
    let total = 0;
    for (const day of TM_DAYS) for (const item of this.room.get(`${room}|${day}`) || []) total += item.end - item.start;
    return total;
  }
}
const push = <T,>(map: Map<string, T[]>, key: string, value: T) => { const list = map.get(key); if (list) list.push(value); else map.set(key, [value]); };

/** القاعات المرشّحة لصفٍّ: المسجّلة للقسم، مرتّبة بالملاءمة والسعة. */
function rankedHalls(context: TmContext, course: AdCourse | undefined, prefer?: TmHall | null): TmHall[] {
  const seats = Number(course?.MaxStudent || 0);
  return [...context.halls].map(hall => {
    const fit = roomSuitability(course, { roomType: hall.roomType, capacity: hall.capacity });
    const sameBuilding = prefer && hall.buildingId && hall.buildingId === prefer.buildingId ? 6 : 0;
    const tooSmall = seats && Number(hall.capacity || 0) && Number(hall.capacity) < seats ? -30 : 0;
    return { hall, score: fit.adjustment + sameBuilding + tooSmall };
  }).sort((a, b) => b.score - a.score).map(item => item.hall);
}

function verifyNoNewBlocking(before: FSchedule[], after: FSchedule[], context: TmContext): boolean {
  const placeholders = placeholderIdsOf(context);
  const inScope = scopeOf(context);
  return blockingConflicts(after.filter(inScope), after, placeholders).length <= blockingConflicts(before.filter(inScope), before, placeholders).length;
}

/* ── أثر حذف شعبة ─────────────────────────────────────────────────────────── */

export interface TmRemoveImpact {
  card: TmSectionCard;
  students: number | null;
  alternatives: Array<{ code: string; when: string; freeSeats: number | null; capacity: number }>;
  shortfall: number | null;
  teacher: { id: number; name: string; before: number; after: number; limit: number } | null;
  freed: Array<{ day: string; time: string; hall: string }>;
}

export function removeImpact(board: FSchedule[], key: string, context: TmContext): TmRemoveImpact | null {
  const cards = sectionCards(board, context);
  const card = cards.find(item => item.key === key);
  if (!card) return null;
  const courses = courseMapOf(context);
  const siblings = cards.filter(item => item.courseId === card.courseId && item.key !== key);
  const perSection = estimateSectionStudents(card.courseId, context);
  const alternatives = siblings.map(item => ({
    code: item.code,
    when: `${item.days.map(dayLabel).join(" ")} ${item.start}`,
    capacity: item.capacity,
    freeSeats: perSection === null ? null : Math.max(0, item.capacity - perSection),
  }));
  let shortfall: number | null = null;
  if (perSection !== null) {
    const room = alternatives.reduce((sum, item) => sum + Number(item.freeSeats || 0), 0);
    shortfall = Math.max(0, perSection - room);
  }
  let teacher: TmRemoveImpact["teacher"] = null;
  if (!card.vacant) {
    const mine = board.filter(row => Number(row.AdInstructorId) === card.instructorId);
    const before = weeklyLoadOf(mine, courses);
    const after = weeklyLoadOf(mine.filter(row => sectionKey(row) !== key), courses);
    teacher = { id: card.instructorId, name: card.instructorName, before, after, limit: Number(context.loadLimits?.[String(card.instructorId)] || 0) };
  }
  const freed = board.filter(row => card.rowIds.includes(Number(row.id)))
    .flatMap(row => activeDays(row).map(day => ({ day: dayLabel(day), time: `${row.fstarttime}–${row.fendtime}`, hall: hallLabel(row) })));
  return { card, students: perSection, alternatives, shortfall, teacher, freed };
}

/* ── اقتراح موضعٍ لشعبةٍ جديدة ───────────────────────────────────────────── */

export interface TmPlacement {
  days: DayKey[];
  start: string;
  end: string;
  hall: TmHall;
  instructorId: number;
  score: number;
  reasons: string[];
  studentsServed: number | null;
}

type Philosophy = "minimal" | "students" | "teachers" | "rooms" | "flex";

/**
 * أفضل وقتٍ وقاعةٍ وأستاذٍ متاح لشعبةٍ جديدة من مقرر: النمطُ (الأيام والمدة) من
 * شعبةٍ قائمة للمقرر نفسه، والأستاذُ ممن يدرّسه أو تحت نصابه، والقاعةُ من
 * قاعات القسم. كل مرشّحٍ يُفحص بالمحرّك نفسه قبل أن يُعرض.
 */
export function suggestPlacements(board: FSchedule[], courseId: number, context: TmContext, options: { instructorId?: number; max?: number; philosophy?: Philosophy } = {}): TmPlacement[] {
  const courses = courseMapOf(context);
  const course = courses.get(courseId);
  const inScope = scopeOf(context);
  const placeholders = placeholderIdsOf(context);
  const siblings = board.filter(row => inScope(row) && Number(row.AdCourseId) === courseId);
  const pattern = siblings[0];
  const days: DayKey[][] = pattern ? uniquePatterns(siblings) : TM_DAYS.map(day => [day]);
  const duration = pattern ? durationOf(pattern) : Math.max(50, Math.round(Number(course?.CourseHours || course?.CourseCredit || 2) * 50));
  const index = new BusyIndex(board, placeholders);
  const courseTeachers = [...new Set(siblings.map(row => Number(row.AdInstructorId)).filter(id => id > 0 && !placeholders.has(id)))];
  const people = context.instructors.filter(person => !placeholders.has(Number(person.AdInstructorId)) && person.AdInstructorStatus !== "retired" && person.AdInstructorStatus !== "sabbatical");
  const hours = Number(course?.CourseHours || course?.CourseCredit || 0);
  const spare = (id: number) => {
    const limit = Number(context.loadLimits?.[String(id)] || 0);
    if (!limit) return null;
    return limit - weeklyLoadOf(board.filter(row => Number(row.AdInstructorId) === id), courses);
  };
  const flex = [...placeholders][0];
  const candidatesTeachers = options.instructorId ? [options.instructorId]
    : options.philosophy === "flex" && flex ? [flex]
    : [...courseTeachers, ...people.map(person => Number(person.AdInstructorId)).filter(id => !courseTeachers.includes(id))]
      .filter(id => { const left = spare(id); return left === null || left >= hours; })
      .slice(0, 12);
  if (!candidatesTeachers.length && flex) candidatesTeachers.push(flex);
  const halls = rankedHalls(context, course, pattern ? rowHall(pattern) : null);
  const demand = context.demand?.[String(courseId)];
  const unmet = demand ? Math.max(0, Number(demand.wanted || 0) - Number(demand.seated || 0)) : null;
  /* سعةٌ مسجّلة أقل من ٥ ليست سعة شعبة (بيان ناقص): لا يُحدّ بها العدد ولا يُخترع غيرها. */
  const seatCap = Number(course?.MaxStudent || 0) >= 5 ? Number(course?.MaxStudent) : 0;
  const served = unmet === null ? null : Math.min(seatCap || unmet, unmet);
  const out: TmPlacement[] = [];
  for (const teacher of candidatesTeachers) {
    for (const set of days) {
      for (let start = SCHEDULE_DAY_START; start + duration <= SCHEDULE_DAY_END; start += 30) {
        if (!index.teacherFree(teacher, set, start, start + duration)) continue;
        const hall = halls.find(item => index.roomFree(hallKey(item), set, start, start + duration));
        if (!hall) continue;
        const reasons: string[] = [];
        let score = 0;
        if (courseTeachers.includes(teacher)) { score += 20; reasons.push("يدرّس المقرر"); }
        const left = spare(teacher);
        if (left !== null) { score += Math.min(12, left); reasons.push(`نصاب متاح ${left}`); }
        if (placeholders.has(teacher)) reasons.push("هيئة تدريسية · يُسند لاحقاً");
        const late = start >= 16 * 60;
        if (options.philosophy === "students") score += start < 13 * 60 ? 18 : late ? -20 : 4;
        else score += late ? -15 : 0;
        if (options.philosophy === "rooms") score += Math.round(index.roomMinutes(hallKey(hall)) / 120);
        if (options.philosophy === "teachers") {
          const mine = board.filter(row => Number(row.AdInstructorId) === teacher);
          const sameDay = mine.some(row => set.some(day => row[day]));
          if (sameDay) { score += 10; reasons.push("في يومٍ يدرّس فيه"); }
        }
        if (Number(hall.capacity || 0) >= Number(course?.MaxStudent || 0) && hall.capacity) reasons.push(`سعة ${hall.capacity}`);
        out.push({ days: set, start: minutesToTime(start), end: minutesToTime(start + duration), hall, instructorId: teacher, score, reasons, studentsServed: served });
      }
    }
  }
  const seen = new Set<string>();
  const ranked = out.sort((a, b) => b.score - a.score || timeToMinutes(a.start) - timeToMinutes(b.start)).filter(item => {
    const key = `${item.days.join()}|${item.start}|${item.instructorId}`;
    if (seen.has(key)) return false; seen.add(key); return true;
  });
  const verified: TmPlacement[] = [];
  for (const item of ranked) {
    if (verified.length >= (options.max || 3)) break;
    const draft = draftSectionRows(board, courseId, item, context, -1);
    if (verifyNoNewBlocking(board, [...board, ...draft], context)) verified.push(item);
  }
  return verified;
}

function uniquePatterns(rows: FSchedule[]): DayKey[][] {
  const seen = new Map<string, DayKey[]>();
  for (const row of rows) { const days = activeDays(row); if (days.length) seen.set(days.join(), days); }
  return [...seen.values()];
}

/** صفوفُ شعبةٍ جديدة بأرقامٍ سالبة مؤقّتة (تُستبدل بأرقامٍ حقيقية عند الاعتماد). */
export function draftSectionRows(board: FSchedule[], courseId: number, placement: Pick<TmPlacement, "days" | "start" | "end" | "hall" | "instructorId">, context: TmContext, tempId?: number, code?: string): FSchedule[] {
  const course = courseMapOf(context).get(courseId);
  const id = tempId ?? Math.min(-1, ...board.map(row => Number(row.id)).filter(n => n < 0).map(n => n - 1));
  const sectionCodeValue = code || nextCourseSectionCode(board, courseId, context.scope.termId);
  return [{
    id,
    AdCollegeId: context.scope.collegeId,
    AdSectionId: context.scope.sectionId,
    AdTermId: context.scope.termId,
    AdCourseId: courseId,
    AdCourseName: String(course?.CourseName || ""),
    SCode: sectionCodeValue,
    AdInstructorId: placement.instructorId,
    ...dayFlags(placement.days),
    fstarttime: placement.start,
    fendtime: placement.end,
    AdRoomCode: placement.hall.code,
    AdRoomHall: placement.hall.hall,
    buildingId: placement.hall.buildingId,
    roomId: placement.hall.roomId,
    locationStatus: "VERIFIED",
  } as FSchedule];
}

/* ── تغييرات الشعب الجاهزة (محاكي الشعب) ─────────────────────────────────── */

export function removeSectionChange(card: TmSectionCard): TmChange {
  return { id: changeId("r"), op: "remove", rowIds: card.rowIds, label: `حذف ${card.courseCode} ش${card.code}` };
}

export function addSectionChange(board: FSchedule[], courseId: number, placement: TmPlacement, context: TmContext, label?: string): TmChange {
  const rows = draftSectionRows(board, courseId, placement, context);
  const course = courseMapOf(context).get(courseId);
  return { id: changeId("a"), op: "add", rows, label: label || `إضافة ${course?.CourseCode || ""} ش${rows[0].SCode}` };
}

/** دمج شعبة في أخرى: تُلغى الأولى وتستقبل الثانية طلبتها (إن اتّسعت). */
export function mergeSectionsChange(from: TmSectionCard, into: TmSectionCard): TmChange {
  return { id: changeId("m"), op: "remove", rowIds: from.rowIds, label: `دمج ش${from.code} ← ش${into.code} · ${from.courseCode}`, why: `طلبة ش${from.code} ينتقلون إلى ش${into.code}` };
}

/** تقسيم شعبة: شعبةٌ أخت بنمطها نفسه في أفضل موضعٍ متاح. */
export function splitSectionChange(board: FSchedule[], card: TmSectionCard, context: TmContext): TmChange | null {
  const best = suggestPlacements(board, card.courseId, context, { max: 1 })[0];
  if (!best) return null;
  const change = addSectionChange(board, card.courseId, best, context, `تقسيم ${card.courseCode} ش${card.code}`);
  return { ...change, why: `نصف طلبة ش${card.code} إلى شعبة جديدة` };
}

/* ── المشكلات والأهداف: قراءة الجملة ─────────────────────────────────────── */

export type TmProblem =
  | { kind: "roomDown"; hall: TmHall; day: DayKey | null }
  | { kind: "teacherOff"; instructorId: number; day: DayKey | null }
  | { kind: "demandUp"; courseId: number }
  | { kind: "clearDay"; day: DayKey }
  | { kind: "reduceGaps" }
  | { kind: "freeRooms"; count: number };

const norm = (value: string) => toEnglishDigits(String(value || "")).replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").toLowerCase();
const ARABIC_NUMBERS: Array<[RegExp, number]> = [[/قاعتين|قاعتان|اثنتين|اثنين|2/, 2], [/ثلاث|3/, 3], [/اربع|4/, 4], [/خمس|5/, 5]];

export function describeProblem(problem: TmProblem, context: TmContext): string {
  const courses = courseMapOf(context);
  const people = new Map(context.instructors.map(person => [Number(person.AdInstructorId), person.AdInstructorName] as const));
  if (problem.kind === "roomDown") return `قاعة ${hallLabel(problem.hall)} خارج الخدمة${problem.day ? ` · ${dayLabel(problem.day)}` : ""}`;
  if (problem.kind === "teacherOff") return `${people.get(problem.instructorId) || "أستاذ"} غير متاح${problem.day ? ` · ${dayLabel(problem.day)}` : ""}`;
  if (problem.kind === "demandUp") { const c = courses.get(problem.courseId); return `طلبٌ زائد على ${c?.CourseCode || ""} ${c?.CourseName || ""}`.trim(); }
  if (problem.kind === "clearDay") return `تفريغ ${dayLabel(problem.day)}`;
  if (problem.kind === "reduceGaps") return "تقليل فجوات الأساتذة";
  return `توفير ${countOf(problem.count, AR.room)}`;
}

/**
 * جملةٌ من المستخدم ← مشكلةٌ أو هدف. أنماطٌ محدّدة لا ذكاءٌ مدّعى: ما لا يُفهم
 * يعود null ويُقال ذلك صراحةً مع أمثلةٍ تُفهم.
 */
export function parseProblem(input: string, context: TmContext): TmProblem | null {
  const text = norm(input);
  if (!text.trim()) return null;
  const query = parseNaturalQuery(input);
  const day = query.day === null ? null : TM_DAYS[query.day] || null;

  /* الأهداف أولاً: أفعالها صريحة. */
  if (/(صفر|فرغ|اخل|الغ)/.test(text) && day && !/قاع/.test(text)) return { kind: "clearDay", day };
  if (/(فجو|فراغ)/.test(text) && /(قلل|قل|خفف|خفض|اقل|ضغط)/.test(text)) return { kind: "reduceGaps" };
  if (/(وفر|حرر|اختصر|قلل|قل)/.test(text) && /قاع/.test(text)) {
    const count = ARABIC_NUMBERS.find(([pattern]) => pattern.test(text))?.[1] || 1;
    return { kind: "freeRooms", count };
  }

  /* قاعةٌ معروفة باسمها في النص. */
  const halls = [...context.halls, ...context.rows.map(rowHall)];
  const hall = halls
    .map(item => ({ item, keys: [norm(item.hall), norm(`${item.code}-${item.hall}`), norm(`${item.code}${item.hall}`), norm(`${item.code} ${item.hall}`)].filter(key => key.length >= 2) }))
    .map(entry => ({ ...entry, hit: entry.keys.filter(key => new RegExp(`(^|[^a-z0-9])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text)).sort((a, b) => b.length - a.length)[0] || "" }))
    .filter(entry => entry.hit)
    .sort((a, b) => b.hit.length - a.hit.length)[0]?.item;
  if (hall && (/(قاع|تعطل|معطل|عطل|مغلق|اغلاق|صيان|خارج|مكيف|تسرب)/.test(text) || /^[a-z]/.test(text.trim()))) return { kind: "roomDown", hall, day };

  /* أستاذٌ باسمه. */
  if (/(معتذر|اعتذر|غائب|غياب|اجاز|مريض|سفر|مسافر|مؤتمر|غير متاح|لا يستطيع|ما يقدر|مشغول)/.test(text)) {
    const words = text.replace(/(د|ا|م)\s*\./g, " ").split(/[^a-z0-9؀-ۿ]+/).filter(word => word.length >= 3);
    let best: { id: number; score: number } | null = null, tie = false;
    for (const person of context.instructors) {
      const tokens = norm(person.AdInstructorName).split(/\s+/).filter(token => token.length >= 3 && token !== "هيئه");
      const score = tokens.filter(token => words.includes(token)).length;
      if (!score) continue;
      if (!best || score > best.score) { best = { id: Number(person.AdInstructorId), score }; tie = false; }
      else if (score === best.score) tie = true;
    }
    if (best && !tie) return { kind: "teacherOff", instructorId: best.id, day };
  }

  /* طلبٌ زائد على مقرر: برمزه أو باسمه. */
  if (/(زاد|زياد|ارتفع|كثر|طلب|ضغط|ممتلئ|امتلا|مقفل|شعبه اضافيه|شعبه جديده)/.test(text)) {
    /* الرمزُ كاملاً أولاً (0109468)، ثم آخرُ أرقامه كما يُقال شفاهةً (121): كان
       التقطيعُ إلى أربعةٍ أربعةٍ يُطابق «0109» من رمزٍ طويلٍ مع مقررٍ آخر.
       والرقمُ يُؤخذ بطوله كلّه، فلا يكون ذيلاً لرمزٍ أقصر منه. */
    const runs = text.match(/\d{2,}/g) || [];
    const digitsOf = (course: AdCourse) => String(course.CourseCode || "").replace(/\D/g, "");
    const byCode = context.courses.find(course => runs.some(run => digitsOf(course) === run))
      || context.courses.find(course => runs.some(run => digitsOf(course).endsWith(run)));
    if (byCode) return { kind: "demandUp", courseId: Number(byCode.AdCourseId) };
    const byName = context.courses.find(course => norm(course.CourseName).length > 3 && text.includes(norm(course.CourseName)));
    if (byName) return { kind: "demandUp", courseId: Number(byName.AdCourseId) };
  }
  return null;
}

/* ── مولّد الحلول ─────────────────────────────────────────────────────────── */

export interface TmSolution {
  id: string;
  philosophy: Philosophy;
  title: string;
  icon: string;
  changes: TmChange[];
  why: string[];
  delta: TmDelta;
  score: number;
  satisfied: boolean;
  best?: boolean;
}

export const PHILOSOPHY: Record<Philosophy, { title: string; icon: string }> = {
  minimal: { title: "أقل تغيير", icon: "minimal" },
  students: { title: "الطلبة أولاً", icon: "students" },
  teachers: { title: "راحة الأساتذة", icon: "teachers" },
  rooms: { title: "قاعات أقل", icon: "rooms" },
  flex: { title: "مرونة «هيئة تدريسية»", icon: "flex" },
};

const moveFromRepair = (move: RepairMove, cause?: string): TmChange => ({
  id: changeId("d"), op: "move", rowId: move.id, days: [move.day], start: move.start, end: move.end,
  hall: { code: move.roomCode, hall: move.roomHall, buildingId: move.buildingId, roomId: move.roomId },
  label: `${move.before.AdCourseName || "موعد"} ش${move.before.SCode} ← ${dayLabel(move.day)} ${move.start} · ${move.roomCode}-${move.roomHall}`,
  why: move.because, cause,
});

/** مدى تحقّق الطلب في النسخة الجديدة. */
function satisfies(problem: TmProblem, before: FSchedule[], after: FSchedule[], context: TmContext): boolean {
  const inScope = scopeOf(context);
  const scopeAfter = after.filter(inScope);
  if (problem.kind === "roomDown") {
    const key = hallKey(problem.hall);
    return !scopeAfter.some(row => roomIdentityKey(row) === key && (!problem.day || row[problem.day]));
  }
  if (problem.kind === "teacherOff") return !scopeAfter.some(row => Number(row.AdInstructorId) === problem.instructorId && (!problem.day || row[problem.day]));
  if (problem.kind === "demandUp") return scopeAfter.filter(row => Number(row.AdCourseId) === problem.courseId).map(sectionKey).filter((v, i, a) => a.indexOf(v) === i).length
    > before.filter(inScope).filter(row => Number(row.AdCourseId) === problem.courseId).map(sectionKey).filter((v, i, a) => a.indexOf(v) === i).length;
  if (problem.kind === "clearDay") return !scopeAfter.some(row => row[problem.day]);
  if (problem.kind === "freeRooms") {
    const used = (rows: FSchedule[]) => new Set(rows.filter(inScope).map(roomIdentityKey).filter(Boolean)).size;
    return used(after) <= used(before) - problem.count;
  }
  return true;
}

function scoreOf(delta: TmDelta, satisfied: boolean, changes: number): number {
  return (satisfied ? 0 : 5000)
    + (delta.after.blocking - delta.before.blocking) * 1000
    + (delta.after.overLoad - delta.before.overLoad) * 400
    + ((delta.after.shortfall || 0) - (delta.before.shortfall || 0)) * 60
    + changes * 10 + delta.teachersAffected.length * 6 + delta.timeChanges * 5 + delta.roomChanges * 2
    + Math.round((delta.after.gapMinutes - delta.before.gapMinutes) / 30)
    + (delta.after.regulation - delta.before.regulation) * 8;
}

/** يبحث لصفٍّ عن قاعةٍ حرّة في وقته نفسه. */
function freeHallFor(row: FSchedule, index: BusyIndex, context: TmContext, avoid: Set<string>, prefer: "fit" | "used" = "fit"): TmHall | null {
  const course = courseMapOf(context).get(Number(row.AdCourseId));
  const days = activeDays(row);
  const start = timeToMinutes(row.fstarttime), end = timeToMinutes(row.fendtime);
  let list = rankedHalls(context, course, rowHall(row)).filter(hall => !avoid.has(hallKey(hall)) && hallKey(hall) !== roomIdentityKey(row));
  if (prefer === "used") list = list.sort((a, b) => index.roomMinutes(hallKey(b)) - index.roomMinutes(hallKey(a)));
  return list.find(hall => index.roomFree(hallKey(hall), days, start, end, new Set([Number(row.id)]))) || null;
}

/** ينقل صفاً إلى يومٍ أو وقتٍ آخر للأستاذ نفسه، ويفضّل الإبقاء على القاعة. */
function relocateRow(row: FSchedule, index: BusyIndex, context: TmContext, options: { avoidDay?: DayKey | null; avoidHall?: string; preferTeacherDays?: boolean; board: FSchedule[] }): { days: DayKey[]; start: string; end: string; hall: TmHall } | null {
  const duration = durationOf(row);
  const original = activeDays(row);
  const teacher = Number(row.AdInstructorId);
  const teacherDays = new Set(options.board.filter(other => Number(other.AdInstructorId) === teacher && Number(other.id) !== Number(row.id)).flatMap(activeDays));
  const ignore = new Set([Number(row.id)]);
  const course = courseMapOf(context).get(Number(row.AdCourseId));
  const halls = [rowHall(row), ...rankedHalls(context, course, rowHall(row))].filter(hall => hallKey(hall) !== options.avoidHall);
  const options2: Array<{ days: DayKey[]; start: number; hall: TmHall; cost: number }> = [];
  const replaceDay = (day: DayKey) => original.map(d => (d === options.avoidDay ? day : d));
  const dayChoices: DayKey[][] = options.avoidDay && original.includes(options.avoidDay)
    ? TM_DAYS.filter(day => !original.includes(day)).map(replaceDay)
    : [original];
  for (const days of dayChoices) {
    for (let start = SCHEDULE_DAY_START; start + duration <= SCHEDULE_DAY_END; start += 30) {
      if (!index.teacherFree(teacher, days, start, start + duration, ignore)) continue;
      const hall = halls.find(item => index.roomFree(hallKey(item), days, start, start + duration, ignore));
      if (!hall) continue;
      let cost = Math.abs(start - timeToMinutes(row.fstarttime)) / 15 + (hallKey(hall) === roomIdentityKey(row) ? 0 : 3) + (start >= 16 * 60 ? 6 : 0);
      if (options.preferTeacherDays && days.some(day => !teacherDays.has(day))) cost += 8;
      options2.push({ days, start, hall, cost });
    }
  }
  const best = options2.sort((a, b) => a.cost - b.cost)[0];
  return best ? { days: best.days, start: minutesToTime(best.start), end: minutesToTime(best.start + duration), hall: best.hall } : null;
}

const rowLabel = (row: FSchedule) => `${row.AdCourseName || "موعد"} ش${row.SCode}`;

/**
 * حلولٌ جاهزة مرتّبة. كل حلٍّ من فلسفةٍ مختلفة، يُقاس بالمقاييس نفسها، ولا
 * يُعرض حلٌّ يزيد موانع الاعتماد. يعود أفضلها بنجمة.
 */
export function solveProblem(problem: TmProblem, base: FSchedule[], context: TmContext, max = 3): TmSolution[] {
  const placeholders = placeholderIdsOf(context);
  const inScope = scopeOf(context);
  const beforeMetrics = measure(base, context);
  const drafts: Array<{ philosophy: Philosophy; changes: TmChange[]; why: string[] }> = [];
  const people = new Map(context.instructors.map(person => [Number(person.AdInstructorId), person] as const));
  const courses = courseMapOf(context);

  if (problem.kind === "roomDown") {
    const key = hallKey(problem.hall);
    const affected = base.filter(row => inScope(row) && roomIdentityKey(row) === key && (!problem.day || row[problem.day]));
    for (const prefer of ["fit", "used"] as const) {
      const index = new BusyIndex(base, placeholders);
      const changes: TmChange[] = [];
      for (const row of affected) {
        const hall = freeHallFor(row, index, context, new Set([key]), prefer);
        if (!hall) { changes.length = 0; break; }
        index.remove(Number(row.id)); index.add(withHall(row, hall));
        changes.push({ id: changeId(), op: "move", rowId: Number(row.id), hall, label: `${rowLabel(row)} ← ${hallLabel(hall)}`, why: "الوقت نفسه، قاعة أخرى" });
      }
      if (changes.length === affected.length && changes.length) drafts.push({ philosophy: prefer === "fit" ? "students" : "rooms", changes, why: prefer === "fit" ? ["الوقت لا يتغيّر للطلبة", "قاعة بسعةٍ ونوعٍ ملائمين"] : ["قاعاتٌ مشغولة أصلاً", "لا تُفتح قاعة جديدة"] });
    }
    try {
      const chain = planDisruption(affected, base, { maxDepth: 3, forbidRoom: (code, hall) => hallKey({ code, hall }) === key || (Boolean(problem.hall.roomId) && context.halls.some(h => h.roomId === problem.hall.roomId && h.code === code && h.hall === hall)) });
      if (chain?.moves.length) {
        const ids: string[] = [];
        const changes = chain.moves.map((move, index) => { const change = moveFromRepair(move, index ? ids[index - 1] : undefined); ids.push(change.id); return change; });
        drafts.push({ philosophy: "minimal", changes, why: ["أقصر سلسلة دومينو", countOf(chain.moves.length, AR.move)] });
      }
    } catch { /* السلسلة اختيارية */ }
    {
      const index = new BusyIndex(base, placeholders);
      const changes: TmChange[] = [];
      for (const row of affected) {
        const spot = relocateRow(row, index, context, { avoidDay: null, avoidHall: key, preferTeacherDays: true, board: base });
        if (!spot) { changes.length = 0; break; }
        index.remove(Number(row.id));
        const moved = withHall({ ...row, ...dayFlags(spot.days), fstarttime: spot.start, fendtime: spot.end }, spot.hall);
        index.add(moved);
        changes.push({ id: changeId(), op: "move", rowId: Number(row.id), days: spot.days, start: spot.start, end: spot.end, hall: spot.hall, label: `${rowLabel(row)} ← ${spot.days.map(dayLabel).join(" ")} ${spot.start} · ${hallLabel(spot.hall)}`, why: "في أيام الأستاذ نفسها" });
      }
      if (changes.length === affected.length && changes.length) drafts.push({ philosophy: "teachers", changes, why: ["أيام الأستاذ كما هي", "فجوات أقل"] });
    }
  }

  if (problem.kind === "teacherOff") {
    const affected = base.filter(row => inScope(row) && Number(row.AdInstructorId) === problem.instructorId && (!problem.day || row[problem.day]));
    /* الطلبة أولاً: الوقت والقاعة كما هما، وزميلٌ متاحٌ يأخذ الشعبة. */
    {
      const index = new BusyIndex(base, placeholders);
      const changes: TmChange[] = [];
      for (const row of affected) {
        const days = activeDays(row), start = timeToMinutes(row.fstarttime), end = timeToMinutes(row.fendtime);
        const sameCourse = new Set(base.filter(other => Number(other.AdCourseId) === Number(row.AdCourseId)).map(other => Number(other.AdInstructorId)));
        const hours = Number(courses.get(Number(row.AdCourseId))?.CourseHours || courses.get(Number(row.AdCourseId))?.CourseCredit || 0);
        const pick = context.instructors
          .filter(person => Number(person.AdInstructorId) !== problem.instructorId && !placeholders.has(Number(person.AdInstructorId)) && person.AdInstructorStatus !== "retired" && person.AdInstructorStatus !== "sabbatical")
          .filter(person => index.teacherFree(Number(person.AdInstructorId), days, start, end))
          .map(person => {
            const id = Number(person.AdInstructorId);
            const limit = Number(context.loadLimits?.[String(id)] || 0);
            const load = weeklyLoadOf(base.filter(other => Number(other.AdInstructorId) === id), courses);
            return { person, id, over: limit > 0 && load + hours > limit, rank: (sameCourse.has(id) ? 0 : 10) + (limit ? Math.max(0, load - limit + hours) : 3) };
          })
          .filter(item => !item.over)
          .sort((a, b) => a.rank - b.rank)[0];
        if (!pick) { changes.length = 0; break; }
        index.add({ ...row, AdInstructorId: pick.id });
        changes.push({ id: changeId(), op: "assign", rowIds: [Number(row.id)], instructorId: pick.id, label: `${rowLabel(row)} ← ${pick.person.AdInstructorName}`, why: sameCourse.has(pick.id) ? "يدرّس المقرر نفسه" : "متاحٌ ونصابه يسمح" });
      }
      if (changes.length && changes.length === affected.length) drafts.push({ philosophy: "students", changes, why: ["الوقت والقاعة كما هما", "زميلٌ متاح ضمن نصابه"] });
    }
    /* راحة الأستاذ: الأستاذ نفسه في يومٍ آخر. */
    {
      const index = new BusyIndex(base, placeholders);
      const changes: TmChange[] = [];
      for (const row of affected) {
        const spot = relocateRow(row, index, context, { avoidDay: problem.day, preferTeacherDays: true, board: base });
        if (!spot) { changes.length = 0; break; }
        index.remove(Number(row.id));
        index.add(withHall({ ...row, ...dayFlags(spot.days), fstarttime: spot.start, fendtime: spot.end }, spot.hall));
        changes.push({ id: changeId(), op: "move", rowId: Number(row.id), days: spot.days, start: spot.start, end: spot.end, hall: spot.hall, label: `${rowLabel(row)} ← ${spot.days.map(dayLabel).join(" ")} ${spot.start}`, why: "الأستاذ نفسه، يومٌ آخر" });
      }
      if (changes.length && changes.length === affected.length) drafts.push({ philosophy: "teachers", changes, why: ["الأستاذ يبقى مع طلبته", "في أيامٍ يدرّس فيها"] });
    }
    /* مرونة «هيئة تدريسية»: الشعبة في مكانها، والإسناد لاحقاً. */
    const flex = [...placeholders][0];
    if (flex && affected.length) drafts.push({
      philosophy: "flex",
      changes: [{ id: changeId(), op: "assign", rowIds: affected.map(row => Number(row.id)), instructorId: flex, label: `${countOf(affected.length, AR.appointment)} ← هيئة تدريسية`, why: "تبقى الشعبة، ويُسند المدرّس لاحقاً" }],
      why: ["لا وقت ولا قاعة يتغيّران", "إسنادٌ مؤجّل"],
    });
  }

  if (problem.kind === "demandUp") {
    for (const philosophy of ["students", "teachers", "rooms", "flex"] as const) {
      const best = suggestPlacements(base, problem.courseId, context, { max: 1, philosophy })[0];
      if (!best) continue;
      const change = addSectionChange(base, problem.courseId, best, context);
      drafts.push({ philosophy, changes: [{ ...change, why: best.reasons.join(" · ") }], why: [
        `${best.days.map(dayLabel).join(" ")} ${best.start}`, hallLabel(best.hall),
        best.studentsServed !== null ? `≈${countOf(best.studentsServed, AR.student)}` : "",
        people.get(best.instructorId)?.AdInstructorName || "",
      ].filter(Boolean) });
    }
  }

  if (problem.kind === "clearDay") {
    const affected = base.filter(row => inScope(row) && row[problem.day]);
    for (const philosophy of ["students", "teachers", "minimal"] as const) {
      const index = new BusyIndex(base, placeholders);
      const changes: TmChange[] = [];
      for (const row of affected) {
        const spot = relocateRow(row, index, context, { avoidDay: problem.day, preferTeacherDays: philosophy === "teachers", board: base });
        if (!spot) continue;
        if (philosophy === "students" && spot.start !== row.fstarttime) {
          /* الطلبة أولاً: الوقت نفسه فقط؛ وإلا يبقى في يومه. */
          continue;
        }
        index.remove(Number(row.id));
        index.add(withHall({ ...row, ...dayFlags(spot.days), fstarttime: spot.start, fendtime: spot.end }, spot.hall));
        changes.push({ id: changeId(), op: "move", rowId: Number(row.id), days: spot.days, start: spot.start, end: spot.end, hall: spot.hall, label: `${rowLabel(row)} ← ${spot.days.map(dayLabel).join(" ")} ${spot.start}` });
      }
      if (changes.length) drafts.push({ philosophy, changes, why: [`${changes.length}/${affected.length} من ${dayLabel(problem.day)}`, philosophy === "students" ? "الساعة نفسها" : philosophy === "teachers" ? "أيام الأستاذ" : "أقرب موضع"] });
    }
  }

  if (problem.kind === "reduceGaps") {
    const scopeRows = base.filter(inScope);
    const proposal = autoScheduleProposal(scopeRows, base);
    const byId = new Map(scopeRows.map(row => [Number(row.id), row]));
    const all = proposal.rows.filter(row => { const old = byId.get(Number(row.id)); return old && (old.fstarttime !== row.fstarttime || old.fendtime !== row.fendtime); })
      .map(row => ({ id: changeId(), op: "move" as const, rowId: Number(row.id), start: row.fstarttime, end: row.fendtime, label: `${rowLabel(row)} ← ${row.fstarttime}`, why: "أقرب إلى محاضرات الأستاذ" }));
    if (all.length) drafts.push({ philosophy: "teachers", changes: all, why: ["أيام مضغوطة", "لا تعارض جديد"] });
    const gaps = instructorGapStats(scopeRows);
    const worst = new Set([...gaps.entries()].sort((a, b) => b[1].gapMinutes - a[1].gapMinutes).slice(0, 2).map(([id]) => Number(id)));
    const few = all.filter(change => worst.has(Number(byId.get(change.rowId)?.AdInstructorId)));
    if (few.length && few.length < all.length) drafts.push({ philosophy: "minimal", changes: few, why: ["أكبر فجوتين فقط", countOf(few.length, AR.move)] });
  }

  if (problem.kind === "freeRooms") {
    const index = new BusyIndex(base, placeholders);
    const scopeRows = base.filter(inScope);
    const used = [...new Set(scopeRows.map(roomIdentityKey).filter(Boolean))].sort((a, b) => index.roomMinutes(a) - index.roomMinutes(b));
    for (const philosophy of ["rooms", "minimal"] as const) {
      const working = new BusyIndex(base, placeholders);
      const changes: TmChange[] = [];
      let freed = 0;
      const closed = new Set<string>();
      for (const key of used) {
        if (freed >= problem.count) break;
        const rows = scopeRows.filter(row => roomIdentityKey(row) === key);
        if (philosophy === "minimal" && rows.length > 3) continue;
        const local: TmChange[] = [];
        let ok = true;
        for (const row of rows) {
          const hall = freeHallFor(row, working, context, new Set([...closed, key]), "used");
          if (!hall || !used.includes(hallKey(hall))) { ok = false; break; }
          working.remove(Number(row.id)); working.add(withHall(row, hall));
          local.push({ id: changeId(), op: "move", rowId: Number(row.id), hall, label: `${rowLabel(row)} ← ${hallLabel(hall)}`, why: "الوقت نفسه" });
        }
        if (!ok) { local.forEach(change => { const row = rows.find(r => Number(r.id) === (change as any).rowId)!; working.remove(Number(row.id)); working.add(row); }); continue; }
        closed.add(key); freed += 1; changes.push(...local);
      }
      if (changes.length) drafts.push({ philosophy, changes, why: [`${countOf(freed, AR.room)} تتحرر`, "الأوقات كما هي"] });
    }
  }

  const solutions: TmSolution[] = [];
  const seen = new Set<string>();
  for (const draft of drafts) {
    const signature = JSON.stringify(draft.changes.map(change => ({ ...change, id: "", label: "", why: "", cause: "" })));
    if (seen.has(signature)) continue;
    seen.add(signature);
    const after = applyChanges(base, draft.changes);
    if (!verifyNoNewBlocking(base, after, context)) continue;
    const delta = compareBoards(base, after, context, beforeMetrics);
    const ok = satisfies(problem, base, after, context);
    solutions.push({
      id: changeId("s"), philosophy: draft.philosophy, title: PHILOSOPHY[draft.philosophy].title, icon: PHILOSOPHY[draft.philosophy].icon,
      changes: draft.changes, why: draft.why, delta, satisfied: ok, score: scoreOf(delta, ok, draft.changes.length),
    });
  }
  const ranked = solutions.sort((a, b) => a.score - b.score).slice(0, max);
  if (ranked[0]) ranked[0].best = true;
  return ranked;
}

/* ── الدومينو: من حرّك من ولماذا ─────────────────────────────────────────── */

export interface TmDominoNode { id: string; label: string; why: string; kind: TmChange["op"]; depth: number }
export function dominoOf(changes: readonly TmChange[]): TmDominoNode[] {
  const depth = new Map<string, number>();
  return changes.map(change => {
    const d = change.cause && depth.has(change.cause) ? depth.get(change.cause)! + 1 : 0;
    depth.set(change.id, d);
    return { id: change.id, label: change.label, why: change.why || "", kind: change.op, depth: d };
  });
}

/* ── المقارنة ─────────────────────────────────────────────────────────────── */

export interface TmComparisonRow { key: string; label: string; icon: string; values: number[]; best: number; lowerIsBetter: boolean }

export function compareScenarios(deltas: TmDelta[]): { rows: TmComparisonRow[]; bestIndex: number } {
  const pick = (label: string, icon: string, key: string, values: number[], lowerIsBetter = true): TmComparisonRow => {
    const target = lowerIsBetter ? Math.min(...values) : Math.max(...values);
    return { key, label, icon, values, best: values.indexOf(target), lowerIsBetter };
  };
  const rows = [
    pick("تعارضات", "conflicts", "blocking", deltas.map(d => d.after.blocking)),
    pick("تغييرات", "changes", "changes", deltas.map(d => d.changedRows)),
    pick("فجوات (د)", "gaps", "gaps", deltas.map(d => d.after.gapMinutes)),
    pick("طلبة متأثرون", "students", "students", deltas.map(d => d.studentsMoved ?? 0)),
    pick("أساتذة متأثرون", "teachers", "teachers", deltas.map(d => d.teachersAffected.length)),
    pick("قاعات مستعملة", "rooms", "rooms", deltas.map(d => d.after.roomsUsed)),
  ];
  const score = deltas.map(d => scoreOf(d, true, d.changedRows));
  return { rows, bestIndex: score.indexOf(Math.min(...score)) };
}

/* ── النشر: بطاقةٌ شخصية لكل أستاذٍ متأثر ────────────────────────────────── */

export interface TmTeacherCard { instructorId: number; name: string; mobile: string; before: string[]; after: string[] }

export function teacherCards(before: FSchedule[], after: FSchedule[], context: TmContext): TmTeacherCard[] {
  const delta = compareBoards(before, after, context);
  const people = new Map(context.instructors.map(person => [Number(person.AdInstructorId), person] as const));
  const line = (row: FSchedule) => `${row.AdCourseName} ش${row.SCode} · ${activeDays(row).map(dayLabel).join(" ")} ${row.fstarttime}–${row.fendtime} · ${hallLabel(row)}`;
  const inScope = scopeOf(context);
  return delta.teachersAffected.map(id => {
    const mine = (rows: FSchedule[]) => rows.filter(row => inScope(row) && Number(row.AdInstructorId) === id).map(line).sort();
    const b = mine(before), a = mine(after);
    return { instructorId: id, name: String(people.get(id)?.AdInstructorName || ""), mobile: String(people.get(id)?.AdInstructorMobile || ""),
      before: b.filter(item => !a.includes(item)), after: a.filter(item => !b.includes(item)) };
  }).filter(card => card.before.length || card.after.length);
}

/* ── خطة الاعتماد: من سيناريو إلى عمليات كتابة ──────────────────────────── */

export type TmPlanOp =
  | { kind: "update"; rowId: number; fields: Partial<FSchedule>; expectedRev: number }
  | { kind: "create"; tempId: number; row: FSchedule }
  | { kind: "delete"; rowId: number; expectedRev: number };

/**
 * يحوّل الطبقة إلى عملياتٍ على الجدول الحيّ: التحديثات بالحقول التي تغيّرت فقط،
 * مع رقم الإصدار الذي بُنيت عليه (فلا تُكتب فوق تعديل زميل).
 */
export function planOperations(live: FSchedule[], changes: readonly TmChange[], base: Record<string, number>): TmPlanOp[] {
  const after = applyChanges(live, changes);
  const liveById = new Map(live.map(row => [Number(row.id), row]));
  const afterById = new Map(after.map(row => [Number(row.id), row]));
  const ops: TmPlanOp[] = [];
  const FIELDS: Array<keyof FSchedule> = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday", "fstarttime", "fendtime", "AdRoomCode", "AdRoomHall", "buildingId", "roomId", "locationStatus", "AdInstructorId"];
  for (const id of touchedRowIds(changes)) {
    const old = liveById.get(id);
    if (!old) continue;
    const expectedRev = Number(base?.[String(id)] ?? old.rev ?? 0);
    const next = afterById.get(id);
    if (!next) { ops.push({ kind: "delete", rowId: id, expectedRev }); continue; }
    const fields: Partial<FSchedule> = {};
    for (const key of FIELDS) if ((old as any)[key] !== (next as any)[key]) (fields as any)[key] = (next as any)[key];
    if (Object.keys(fields).length) ops.push({ kind: "update", rowId: id, fields, expectedRev });
  }
  for (const row of after) if (Number(row.id) < 0) ops.push({ kind: "create", tempId: Number(row.id), row });
  return ops;
}

/* ── السيناريو المحفوظ ───────────────────────────────────────────────────── */

export type TmScenarioStatus = "draft" | "applied" | "restored";
export interface TmHistoryEntry { at: string; by: string; role: string; action: "created" | "saved" | "copied" | "shared" | "applied" | "restored" | "refused"; note?: string }
export interface TmRestorePoint {
  at: string;
  /** صورةُ الصفوف التي عُدّلت أو حُذفت كما كانت قبل الاعتماد. */
  before: FSchedule[];
  /** أرقامُ الصفوف التي أنشأها الاعتماد. */
  createdIds: number[];
  /** إصدارُ كل صفٍّ بعد الاعتماد — الاستعادة تُرفض إن كُتب فوقه بعدها. */
  afterRevs: Record<string, number>;
}
export interface TmScenarioRecord {
  id: string;
  name: string;
  mode: "emergency" | "lab" | "goal" | "sections";
  collegeId: number;
  sectionId: number;
  termId: number;
  problem?: string;
  changes: TmChange[];
  base: Record<string, number>;
  status: TmScenarioStatus;
  /** للعرض فقط لرئيس القسم والعميد: يرونه ولا يعتمدونه. */
  shared: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  history: TmHistoryEntry[];
  restorePoint?: TmRestorePoint;
}
