/**
 * ── جدول الأستاذ المصغّر (N3): قراءةٌ لا محرّك ────────────────────────────────
 * يقرأ صفوفاً محمّلة أصلاً ويعيد ترتيبها للعرض: محاضرات الأستاذ بالأيام، والخانات الحرّة
 * التي تتّسع لنمط المقرر (appointmentRegulation)، و«قبلها/بعدها» بمعادلة «لاصق بمحاضرتي»
 * نفسها في كرت الأستاذ (lectureStick)، والنصاب (weeklyLoadOf) وأيام الحضور والفراغات
 * (instructorGapStats).
 * لا قاعدة جديدة: الحكم على الموعد يبقى لـ appointmentVerdict وحده.
 */
import type { AdCourse, FSchedule } from "../types";
import { DAY_KEYS, requiredGapForDays, type DayKey } from "./scheduleRegulations";
import { regulationChoiceFor, regulationChoicesForDay, type RegulationCourse } from "./appointmentRegulation";
import { instructorGapStats } from "./scheduleIntelligence";
import { weeklyLoadOf } from "./instructorRequestVerdict";
import { stickCandidates } from "./lectureStick";

export const toMin = (value: unknown) => {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
};
export const toClock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export interface MiniSpan { start: number; end: number }

export interface MiniLecture {
  id: number;
  day: DayKey;
  start: number;
  end: number;
  row: FSchedule;
  /** من كليةٍ أخرى (تُلوَّن بلون مختلف). */
  otherCollege: boolean;
}

/** صفوف الأستاذ في الفصل — كلٌّ مرة واحدة، دون الموعد المفتوح للتعديل. */
export function teacherRows(rows: readonly FSchedule[], teacherId: number, termId: number, excludeId = 0): FSchedule[] {
  if (!teacherId) return [];
  const seen = new Set<number>();
  const out: FSchedule[] = [];
  for (const row of rows) {
    const id = Number(row.id);
    if (Number(row.AdInstructorId) !== teacherId || (excludeId && id === excludeId) || seen.has(id)) continue;
    if (termId && Number(row.AdTermId) !== termId) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

/** محاضرات الأستاذ يوماً يوماً (ما له أيامٌ ووقتٌ صالح). */
export function teacherLectures(rows: readonly FSchedule[], teacherId: number, termId: number, excludeId = 0, collegeId = 0): MiniLecture[] {
  const out: MiniLecture[] = [];
  for (const row of teacherRows(rows, teacherId, termId, excludeId)) {
    const start = toMin(row.fstarttime), end = toMin(row.fendtime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    for (const day of DAY_KEYS) {
      if ((row as any)[day]) out.push({ id: Number(row.id), day, start, end, row, otherCollege: Boolean(collegeId) && Number(row.AdCollegeId) !== collegeId });
    }
  }
  return out.sort((a, b) => DAY_KEYS.indexOf(a.day) - DAY_KEYS.indexOf(b.day) || a.start - b.start);
}

/**
 * المحور المضغوط: من بداية يوم الدراسة إلى ما بعد آخر ما يُرسم بساعة، بحدٍّ أدنى ستّ ساعات
 * وحدٍّ أقصى نهاية يوم الدراسة — فأسبوع الصباح لا يُرسم في اثنتي عشرة ساعة.
 */
export function compactSpan(window: MiniSpan, ends: readonly number[], minHours = 6): MiniSpan {
  const last = Math.max(window.start + minHours * 60, ...ends.filter(Number.isFinite).map(value => value + 60));
  const end = Math.min(window.end, Math.ceil(last / 60) * 60);
  return { start: window.start, end: Math.max(end, Math.min(window.end, window.start + 60)) };
}

/** هل يزاحم [from,to) محاضرةً للأستاذ في هذا اليوم دون الفاصل المقرَّر؟ */
const crowds = (lectures: readonly MiniLecture[], day: DayKey, from: number, to: number, gap: number) =>
  lectures.some(item => item.day === day && item.start < to + gap && item.end + gap > from);

export interface MiniTarget { day: DayKey; start: number; end: number; days: DayKey[] }

/** النمط الذي يُرسم به الموعد ليومٍ ما: أيامٌ ثابتة (طلب أستاذ) أو النمط الأنسب لساعات المقرر. */
export function patternForDay(course: RegulationCourse | null | undefined, day: DayKey, fallbackMinutes = 0, fixedDays?: readonly DayKey[]): { days: DayKey[]; minutes: number } | null {
  if (fixedDays?.length) {
    if (!fixedDays.includes(day)) return null;
    const days = DAY_KEYS.filter(item => fixedDays.includes(item));
    const minutes = regulationChoiceFor(course, days)?.minutes || fallbackMinutes;
    return minutes > 0 ? { days, minutes } : null;
  }
  const choice = regulationChoicesForDay(course, day)[0];
  if (choice) return { days: [...choice.days], minutes: choice.minutes };
  return fallbackMinutes > 0 ? { days: [day], minutes: fallbackMinutes } : null;
}

const ceilTo = (value: number, step: number) => Math.ceil(value / step) * step;
const overlaps = (a: MiniSpan, b: MiniSpan) => a.start < b.end && b.start < a.end;

/**
 * الخانات الحرّة التي تتّسع لنمط المقرر، على شبكة نصف الساعة داخل المحور: حرّةٌ في كل أيام
 * النمط بالفاصل المقرَّر، لا تتداخل فيما بينها، ولا تحت الموعد الجاري (هو مرسومٌ شبحاً).
 */
export function freeTargets(
  course: RegulationCourse | null | undefined,
  lectures: readonly MiniLecture[],
  span: MiniSpan,
  options: { fixedDays?: readonly DayKey[]; avoid?: { days: readonly DayKey[]; start: number; end: number } | null } = {},
): MiniTarget[] {
  const out: MiniTarget[] = [];
  for (const day of DAY_KEYS) {
    const pattern = patternForDay(course, day, 0, options.fixedDays);
    if (!pattern) continue;
    const gap = requiredGapForDays(pattern.days);
    let start = ceilTo(span.start, 30);
    while (start + pattern.minutes <= span.end) {
      const end = start + pattern.minutes;
      const underGhost = options.avoid && options.avoid.days.includes(day) && overlaps({ start, end }, options.avoid);
      if (underGhost || pattern.days.some(item => crowds(lectures, item, start, end, gap))) { start += 30; continue; }
      out.push({ day, start, end, days: pattern.days });
      start = ceilTo(end + gap, 30);
    }
  }
  return out;
}

/**
 * «قبلها / بعدها» — معادلة «لاصق بمحاضرتي» الواحدة (lectureStick، كرت الأستاذ C6):
 * على أيام المحاضرة نفسها، بعدها = نهايتها + فاصل اللائحة، وقبلها = بدايتها − الفاصل − المدّة،
 * وإن زاحم الملاصقُ محاضرةً أخرى للأستاذ فالأقرب +30 ثم +60. المدّة من نمط المقرر لتلك الأيام
 * (وإلا مدّة الموعد الجاري)، والموضع داخل يوم الدراسة وحرٌّ للأستاذ — وإلا فلا زرّ.
 */
export function adjacentPlacement(
  lecture: MiniLecture,
  side: "before" | "after",
  course: RegulationCourse | null | undefined,
  lectures: readonly MiniLecture[],
  window: MiniSpan,
  options: { minutes?: number; fixedDays?: readonly DayKey[] } = {},
): MiniTarget | null {
  const fixed = options.fixedDays?.length ? DAY_KEYS.filter(day => options.fixedDays!.includes(day)) : null;
  if (fixed && !fixed.includes(lecture.day)) return null;
  const days = fixed || DAY_KEYS.filter(day => Boolean((lecture.row as any)[day]));
  const fallback = options.minutes || patternForDay(course, lecture.day)?.minutes || 0;
  const durationFor = (list: DayKey[]) => regulationChoiceFor(course, list)?.minutes || fallback;
  const anchor = { rowId: lecture.id, title: "", days, start: toClock(lecture.start), end: toClock(lecture.end) };
  for (const candidate of stickCandidates(anchor, side, durationFor)) {
    const start = toMin(candidate.start), end = toMin(candidate.end);
    if (start < window.start || end > window.end) continue;
    const gap = requiredGapForDays(candidate.days);
    if (candidate.days.some(day => crowds(lectures, day, start, end, gap))) continue;
    return { day: lecture.day, start, end, days: candidate.days };
  }
  return null;
}

export interface MiniRoomPick { buildingId?: string; roomId?: string; AdRoomCode?: string; AdRoomHall?: string; locationStatus?: "VERIFIED" }

const sameRoom = (a: Partial<FSchedule>, b: Partial<FSchedule>) => {
  const roomA = String((a as any).roomId || ""), roomB = String((b as any).roomId || "");
  if (roomA && roomB) return roomA === roomB;
  return Boolean(a.AdRoomCode && a.AdRoomHall) && String(a.AdRoomCode) === String(b.AdRoomCode) && String(a.AdRoomHall) === String(b.AdRoomHall);
};

/**
 * «قاعته نفسها أولاً ثم مبناه»: إن خلت قاعة المحاضرة في الموضع الملاصق فيما حُمِّل من صفوف
 * تُقترح هي، وإلا فمبناها وحده (يختار المنسّق القاعة). الحكم الأخير يبقى للفحص الواحد.
 */
export function adjacentRoom(lecture: MiniLecture, spot: MiniTarget, rows: readonly FSchedule[], excludeId = 0): MiniRoomPick | null {
  const source: any = lecture.row;
  if (lecture.otherCollege || !(source.buildingId || source.AdRoomCode)) return null;
  const gap = requiredGapForDays(spot.days);
  const taken = rows.some(row => Number(row.id) !== excludeId && Number(row.AdTermId) === Number(source.AdTermId) && sameRoom(row, source)
    && spot.days.some(day => Boolean((row as any)[day]))
    && toMin(row.fstarttime) < spot.end + gap && toMin(row.fendtime) + gap > spot.start);
  if (!taken && (source.roomId || source.AdRoomHall)) {
    return { buildingId: source.buildingId, roomId: source.roomId, AdRoomCode: source.AdRoomCode, AdRoomHall: source.AdRoomHall, locationStatus: "VERIFIED" };
  }
  return source.buildingId ? { buildingId: source.buildingId, roomId: undefined, AdRoomCode: source.AdRoomCode, AdRoomHall: "", locationStatus: undefined } : null;
}

export interface MiniHeader {
  loadNow: number;
  loadAfter: number;
  nisab: number;
  daysNow: number;
  daysAfter: number;
  gapNow: number;
  gapAfter: number;
}

const hasTime = (row: Partial<FSchedule> | null | undefined) => {
  if (!row) return false;
  const start = toMin(row.fstarttime), end = toMin(row.fendtime);
  return Number.isFinite(start) && Number.isFinite(end) && end > start && DAY_KEYS.some(day => Boolean((row as any)[day]));
};

const weekStats = (rows: readonly Partial<FSchedule>[]) =>
  instructorGapStats(rows.filter(hasTime).map(row => ({ ...row, AdInstructorId: 1 } as FSchedule))).get(1);

/**
 * ترويسة الأستاذ: النصاب وأيام الحضور والفراغات — الآن، وبعد هذا الموعد.
 * «الآن» يضم الموعد المفتوح للتعديل إن كان لهذا الأستاذ أصلاً (فالتعديل لا يُحسب إضافة).
 */
export function teacherHeader(
  rows: readonly FSchedule[],
  courses: Map<number, AdCourse>,
  draft: Partial<FSchedule> | null,
  nisab = 0,
  original?: FSchedule | null,
): MiniHeader {
  const before = original ? [...rows, original] : [...rows];
  const counted = draft && (Number(draft.AdCourseId) || hasTime(draft));
  const after = counted ? [...rows, { ...draft, id: -1 } as FSchedule] : [...rows];
  const now = weekStats(before), then = weekStats(after);
  return {
    loadNow: weeklyLoadOf(before, courses),
    loadAfter: weeklyLoadOf(after, courses),
    nisab: Number(nisab) || 0,
    daysNow: now?.days.size || 0,
    daysAfter: then?.days.size || 0,
    gapNow: now?.gapMinutes || 0,
    gapAfter: then?.gapMinutes || 0,
  };
}

export interface StickOption {
  key: string;
  side: "before" | "after";
  lecture: MiniLecture;
  spot: MiniTarget;
  /** قاعة المحاضرة إن خلت، وإلا مبناها (تلميحٌ للإدارة في المحرر الكامل). */
  room: MiniRoomPick | null;
}

/**
 * «لاصق بمحاضرتي» في نموذج الموعد (الجديد والتعديل): لكل محاضرةٍ للأستاذ — صفّاً صفّاً لا يوماً
 * يوماً — «قبلها» و«بعدها» على أيامها نفسها، بمعادلة lectureStick الواحدة (adjacentPlacement)،
 * مرتبةً بالأسبوع. لا شيء يُخترع: لا خيار حين لا موضع ملاصقاً حرّاً.
 */
export function lectureStickOptions(
  lectures: readonly MiniLecture[],
  rows: readonly FSchedule[],
  course: RegulationCourse | null | undefined,
  window: MiniSpan,
  options: { minutes?: number; excludeId?: number; fixedDays?: readonly DayKey[] } = {},
): StickOption[] {
  const anchors = new Map<number, MiniLecture>();
  for (const item of lectures) if (!anchors.has(item.id)) anchors.set(item.id, item);
  const out: StickOption[] = [];
  for (const lecture of anchors.values()) {
    for (const side of ["before", "after"] as const) {
      const spot = adjacentPlacement(lecture, side, course, lectures, window, { minutes: options.minutes, fixedDays: options.fixedDays });
      /* محاضرتان متتاليتان قد تقودان إلى الموضع نفسه (الملاصق مأخوذ → +30/+60): شريحةٌ واحدة له. */
      if (!spot || out.some(item => item.spot.start === spot.start && item.spot.end === spot.end && item.spot.days.join("+") === spot.days.join("+"))) continue;
      out.push({ key: `${lecture.id}:${side}`, side, lecture, spot, room: lecture.otherCollege ? null : adjacentRoom(lecture, spot, rows, options.excludeId || 0) });
    }
  }
  const dayIndex = (spot: MiniTarget) => DAY_KEYS.indexOf(spot.days[0] || spot.day);
  return out.sort((a, b) => dayIndex(a.spot) - dayIndex(b.spot) || a.spot.start - b.spot.start);
}
