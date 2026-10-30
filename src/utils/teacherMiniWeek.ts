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
import { regulationChoiceFor, regulationChoicesForDay, regulationHours, type RegulationCourse } from "./appointmentRegulation";
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

/** موضعٌ يطابق نمطاً معتمداً لساعات المقرر (الأيام والمدة) — أو مقررٌ بلا ساعات فلا نمط يُخالَف.
    فما يُعرض شريحةً هو ما يُطبَّق ويُفحص بالضبط، ولا يعيد الإكمال اللائحي كتابته بعد الضغط. */
export function fitsCoursePattern(course: RegulationCourse | null | undefined, spot: Pick<MiniTarget, "days" | "start" | "end">): boolean {
  if (!regulationHours(course)) return true;
  const choice = regulationChoiceFor(course, spot.days);
  return Boolean(choice && choice.minutes === spot.end - spot.start);
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
  options: { minutes?: number; excludeId?: number; fixedDays?: readonly DayKey[]; skipAnchor?: (lecture: MiniLecture) => boolean } = {},
): StickOption[] {
  /* ما يُستبعد مرساةً (skipAnchor) يبقى عائقاً: لا يُلصق به، ولا يُوضع موعدٌ فوقه. */
  const anchors = new Map<number, MiniLecture>();
  for (const item of lectures) if (!anchors.has(item.id) && !options.skipAnchor?.(item)) anchors.set(item.id, item);
  const out: StickOption[] = [];
  for (const lecture of anchors.values()) {
    for (const side of ["before", "after"] as const) {
      const spot = adjacentPlacement(lecture, side, course, lectures, window, { minutes: options.minutes, fixedDays: options.fixedDays });
      /* محاضرتان متتاليتان قد تقودان إلى الموضع نفسه (الملاصق مأخوذ → +30/+60): شريحةٌ واحدة له. */
      if (!spot || !fitsCoursePattern(course, spot) || out.some(item => item.spot.start === spot.start && item.spot.end === spot.end && item.spot.days.join("+") === spot.days.join("+"))) continue;
      out.push({ key: `${lecture.id}:${side}`, side, lecture, spot, room: lecture.otherCollege ? null : adjacentRoom(lecture, spot, rows, options.excludeId || 0) });
    }
  }
  const dayIndex = (spot: MiniTarget) => DAY_KEYS.indexOf(spot.days[0] || spot.day);
  return out.sort((a, b) => dayIndex(a.spot) - dayIndex(b.spot) || a.spot.start - b.spot.start);
}

/* ══ نافذة «أسبوع الأستاذ» (R4): أعمدةٌ تتّسع لأيام الموعد، ورسمٌ على الأسبوع، وتقاطعٌ مع القاعة ══ */

/**
 * أعمدة الأيام الخمسة: أيام الموعد الجاري (ويومٌ يمرّ عليه المؤشر) عريضةٌ 2fr والباقي 1fr.
 * بلا أيامٍ للموعد لا تغيير (null: تبقى الأعمدة متساوية كما كانت).
 */
export function weekColumns(focusDays: readonly DayKey[], hover?: DayKey | null): string | null {
  if (!focusDays.length) return null;
  return DAY_KEYS.map(day => `minmax(0,${focusDays.includes(day) || day === hover ? 2 : 1}fr)`).join(" ");
}

export interface DrawnPlacement extends MiniTarget {
  /** مدة الموعد بالدقائق. */
  minutes: number;
  /** المدة من اللائحة (أو مدةٍ معلومة مُرِّرت)، لا من طول السحب. */
  fixed: boolean;
}

/** الرسم على شبكة الخمس دقائق، ولا يقصر الرسم الحرّ عن نصف ساعة. */
export const DRAW_STEP = 5;
export const DRAW_MIN_MINUTES = 30;
const snapTo = (value: number, step: number) => Math.round(value / step) * step;
const clampTo = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * «اسحب على فراغ لترسم موعداً»: من نقطة الضغط إلى حيث يُفلت المؤشر، في يومٍ واحد.
 * الأيام: أيام الموعد الجاري إن ضمّت اليوم، وإلا الأيام الثابتة (طلب أستاذ)، وإلا أيام النمط
 * المعتمد لساعات المقرر في ذلك اليوم (patternForDay — ما تُبنى به خانات «+» نفسها)، وإلا اليوم وحده.
 * المدة: مدة اللائحة لتلك الأيام (ثم لذلك اليوم)، أو مدةٌ معلومة تُمرَّر؛ وإلا فطول السحب على
 * شبكة الخمس دقائق بحدٍّ أدنى نصف ساعة. البداية على الشبكة نفسها، والموعد كله داخل المحور.
 * يومٌ خارج الأيام الثابتة لا يُرسم عليه (كما لا تُقترح فيه خانة).
 */
export function drawnPlacement(
  course: RegulationCourse | null | undefined,
  day: DayKey,
  startMin: number,
  endMin: number,
  options: { span: MiniSpan; draftDays?: readonly DayKey[]; fixedDays?: readonly DayKey[]; minutes?: number },
): DrawnPlacement | null {
  const { span } = options;
  if (![startMin, endMin, span.start, span.end].every(Number.isFinite) || span.end - span.start < DRAW_MIN_MINUTES) return null;
  const fixed = options.fixedDays?.length ? DAY_KEYS.filter(item => options.fixedDays!.includes(item)) : null;
  if (fixed && !fixed.includes(day)) return null;
  const draft = DAY_KEYS.filter(item => Boolean(options.draftDays?.includes(item)));
  const known = Number(options.minutes) > 0 ? Number(options.minutes) : 0;
  const dayMinutes = patternForDay(course, day)?.minutes || 0;
  let days: DayKey[];
  let minutes: number;
  if (draft.includes(day)) {
    days = draft;
    minutes = regulationChoiceFor(course, draft)?.minutes || dayMinutes || known;
  } else if (fixed) {
    days = fixed;
    minutes = patternForDay(course, day, 0, fixed)?.minutes || dayMinutes || known;
  } else {
    const pattern = patternForDay(course, day, known);
    days = pattern ? pattern.days : [day];
    minutes = pattern?.minutes || 0;
  }
  const from = Math.min(startMin, endMin), to = Math.max(startMin, endMin);
  if (minutes > 0) {
    const start = clampTo(snapTo(from, DRAW_STEP), span.start, Math.max(span.start, span.end - minutes));
    return { day, start, end: start + minutes, days, minutes, fixed: true };
  }
  const start = clampTo(snapTo(from, DRAW_STEP), span.start, span.end - DRAW_MIN_MINUTES);
  const end = clampTo(Math.max(snapTo(to, DRAW_STEP), start + DRAW_MIN_MINUTES), start + DRAW_MIN_MINUTES, span.end);
  return { day, start, end, days, minutes: end - start, fixed: false };
}

/** هل يزاحم الموضعُ محاضرةً (أو حجزاً) في أحد أيامه دون الفاصل المقرَّر؟ */
export function spotCrowds(spot: Pick<MiniTarget, "days" | "start" | "end">, lectures: readonly MiniLecture[]): boolean {
  const gap = requiredGapForDays(spot.days);
  return spot.days.some(day => crowds(lectures, day, spot.start, spot.end, gap));
}

/** القاعة المختارة في النموذج: رمز المبنى ورقم القاعة كما يُكتبان («901A01/104»). */
export interface MiniRoom { code: string; hall: string }

const roomToken = (value: unknown) => String(value ?? "").trim().toUpperCase();
/** وضع القاعة يعمل حين يُعرف الرمز والرقم معاً. */
export const roomReady = (room: MiniRoom | null | undefined): room is MiniRoom => Boolean(room && roomToken(room.code) && roomToken(room.hall));
/** صفٌّ في هذه القاعة بالرمز والرقم (ما حُمِّل في اللوحة؛ وقراءة الخادم تطابق السجل الرسمي). */
export function inRoom(row: Partial<FSchedule>, room: MiniRoom | null | undefined): boolean {
  if (!roomReady(room)) return false;
  return roomToken(row.AdRoomCode) === roomToken(room.code) && roomToken(row.AdRoomHall) === roomToken(room.hall);
}

/**
 * حجوز القاعة يوماً يوماً: صفوفها في الفصل، كلٌّ مرةً واحدة، دون محاضرات الأستاذ نفسه
 * (مرسومةٌ محاضراتٍ) ودون الموعد المفتوح للتعديل (مرسومٌ شبحاً).
 */
export function roomBlocks(rows: readonly FSchedule[], options: { teacherId: number; termId?: number; excludeId?: number }): MiniLecture[] {
  const seen = new Set<number>();
  const out: MiniLecture[] = [];
  for (const row of rows) {
    const id = Number(row.id);
    if (seen.has(id) || (options.excludeId && id === options.excludeId)) continue;
    seen.add(id);
    if (Number(row.AdInstructorId) === options.teacherId) continue;
    if (options.termId && Number(row.AdTermId) !== options.termId) continue;
    const start = toMin(row.fstarttime), end = toMin(row.fendtime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    for (const day of DAY_KEYS) if ((row as any)[day]) out.push({ id, day, start, end, row, otherCollege: false });
  }
  return out.sort((a, b) => DAY_KEYS.indexOf(a.day) - DAY_KEYS.indexOf(b.day) || a.start - b.start);
}

export interface RoomTarget extends MiniTarget {
  /** حرّةٌ للأستاذ وللقاعة معاً في كل أيام النمط (بالفاصل المقرَّر بين محاضرتين في القاعة). */
  golden: boolean;
}

/**
 * «تناسب الاثنين»: خانةٌ حرّة للأستاذ (freeTargets) ذهبيةٌ إن خلت القاعة أيضاً في كل أيامها
 * بالفاصل المقرَّر؛ وإلا فالقاعة مشغولة فيها (تبقى قابلةً للضغط، والفحص الواحد يحكم).
 */
export function goldenTargets(
  targets: readonly MiniTarget[],
  roomRows: readonly FSchedule[],
  options: { teacherId: number; termId?: number; excludeId?: number },
): RoomTarget[] {
  const busy = roomBlocks(roomRows, options);
  return targets.map(target => ({ ...target, golden: !spotCrowds(target, busy) }));
}

export interface FloatRect { x: number; y: number; w: number; h: number }
export const FLOAT_MIN = { w: 320, h: 180 } as const;

/**
 * النافذة العائمة داخل الشاشة دائماً: لا تخرج حافّتها، ولا تصغر عن حدٍّ يُقرأ.
 * `visible` ارتفاع ما يظهر منها فعلاً (الترويسة وحدها حين تُطوى)، فتنزل المطويّة حتى أسفل الشاشة.
 */
export function clampFloatRect(rect: FloatRect, viewport: { width: number; height: number }, visible?: number): FloatRect {
  const margin = 8;
  const roomW = Math.max(0, viewport.width - margin * 2), roomH = Math.max(0, viewport.height - margin * 2);
  const w = Math.round(clampTo(rect.w, Math.min(FLOAT_MIN.w, roomW), Math.max(Math.min(FLOAT_MIN.w, roomW), roomW)));
  const h = Math.round(clampTo(rect.h, Math.min(FLOAT_MIN.h, roomH), Math.max(Math.min(FLOAT_MIN.h, roomH), roomH)));
  const shown = Math.min(h, Number(visible) > 0 ? Number(visible) : h);
  const x = Math.round(clampTo(rect.x, margin, Math.max(margin, viewport.width - w - margin)));
  const y = Math.round(clampTo(rect.y, margin, Math.max(margin, viewport.height - shown - margin)));
  return { x, y, w, h };
}

/** ما حُفظ من موضع النافذة العائمة: أرقامٌ صالحة، وإلا فلا شيء (تعود إلى مكانها). */
export function parseFloatRect(value: unknown): FloatRect | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const [x, y, w, h] = [record.x, record.y, record.w, record.h].map(Number);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}
