/**
 * ── الرادار يقترح الشعبة ─────────────────────────────────────────────────────
 *
 * مقررٌ في الرادار «مطلوبٌ ولا يُطرح» أو «يمتلئ»: ما الشعبةُ الجديدة التي تحلّه؟ لا محرّكَ جديد هنا.
 * المرشّحاتُ كلُّها من محرّك فتح الشعب نفسِه (`readSectionOpenings`): سُلّمُ القسم المقصوص على سُلّم
 * اللائحة ومدّتها، وقاعةٌ موثّقة درّس فيها القسم بسعةٍ تكفي، وأستاذٌ درّس المقرر وله نصابٌ متاح، ووقتٌ
 * بلا تعارض مع الجدول والقاعات والدفعة. والجديدُ هنا سؤالٌ واحد يطرحه الرادار على كل مرشّح:
 *
 *     **كم من الطلبة المنتظرين يستطيع أن يأخذه فعلاً؟**
 *
 * المنتظرُ طالبٌ أجاب عن رغباته ولم يجد في التقدير مقعداً لهذا المقرر (امتلأت شعبه أو لا شعبة له).
 * يستطيعه إن لم يخالف الوقتُ قيدَه («لا صباح» / «لا مساء») ولم يتقاطع مع ما وجد له مقعداً من مقرراته.
 * أعدادٌ لا أسماء: لا يخرج من هنا معرّفُ طالب.
 *
 * نقيٌّ: لا يقرأ قاعدةً ولا يكتب شيئاً.
 */
import type { AdCourse, AdInstructor, FSchedule, MasterRoom } from "../types";
import { readSectionOpenings, type Placement, type SectionProposal } from "./sectionOpening";
import type { RhythmReading } from "./departmentRhythm";
import { PAIR_FLOOR, type DemandReading } from "./studentDemand";
import { SCHEDULE_DAYS, type DayKey } from "./scheduleIntelligence";
import { parseClock, slotsConflict, type SimResult, type SimSlot, type SimStudent } from "./registrationSim";

/** لماذا لا اقتراح: سببٌ واحد يُقال في سطر. */
export type RadarNoSuggestion = "no-instructor" | "no-room" | "no-slot" | "no-ceiling" | "not-offerable" | "no-waiting";

export const NO_SUGGESTION_LINE: Record<RadarNoSuggestion, string> = {
  "no-instructor": "لا أستاذ درّس هذا المقرر وله نصابٌ متاح.",
  "no-room": "لا قاعة خالية من النوع المناسب تتّسع للشعبة.",
  "no-slot": "لا وقت خالياً من التعارض يناسب الطلبة المنتظرين.",
  "no-ceiling": "سعةُ الشعبة غير مسجّلة لهذا المقرر، فلا يُحسب ما تحلّه.",
  "not-offerable": "حالةُ طرح المقرر هذا الفصل لا تسمح بشعبةٍ جديدة.",
  "no-waiting": "لا طلبة منتظرون لهذا المقرر ممن أجابوا عن رغباتهم.",
};

/** طالبٌ منتظر: ما يحتاجه الحكمُ على وقتٍ مقترح، بلا هوية. */
export interface WaitingStudent {
  constraints: { noMorning?: boolean; noAfternoon?: boolean };
  /** مواعيدُ ما وجد له مقعداً في خطته الأولى. */
  busy: SimSlot[];
  /** مقرراتُه المرغوبة الأخرى: منها تُبنى «الدفعة» التي لا يُقاطَع وقتُها. */
  wants: number[];
}

const NOON = 12 * 60;
const DAY_INDEX = new Map<DayKey, number>(SCHEDULE_DAYS.map((day, index) => [day.key, index] as const));

/** المنتظرون لمقرر: من لم يجد مقعداً لأن الشعب امتلأت أو لا شعبة. */
export function waitingStudentsFor(courseId: number, students: readonly SimStudent[], baseline: Pick<SimResult, "tickets">, offeringSlots: ReadonlyMap<string, readonly SimSlot[]>): WaitingStudent[] {
  const byFp = new Map(students.map(student => [student.fp, student] as const));
  const out: WaitingStudent[] = [];
  for (const ticket of baseline.tickets) {
    if (!ticket.unmet.some(item => item.courseId === courseId && (item.reason === "full" || item.reason === "not-offered"))) continue;
    const student = byFp.get(ticket.fp);
    if (!student?.wishes) continue;
    const busy = (ticket.plans[0]?.items || []).flatMap(item => [...(offeringSlots.get(item.offeringId) || [])]);
    out.push({ constraints: { noMorning: student.wishes.constraints?.noMorning, noAfternoon: student.wishes.constraints?.noAfternoon }, busy, wants: student.wishes.courseIds.map(Number).filter(id => id !== courseId) });
  }
  return out;
}

/** مواعيدُ الشعبة المقترحة بلغة المحاكاة (يوم 0–4، ودقائق). */
export function placementSlots(placement: Pick<Placement, "day" | "start" | "end"> & { days?: DayKey[] }): SimSlot[] {
  const start = parseClock(placement.start), end = parseClock(placement.end);
  if (start === null || end === null || end <= start) return [];
  const days = placement.days?.length ? placement.days : [placement.day];
  return days.map(day => DAY_INDEX.get(day)).filter((day): day is number => day !== undefined).map(day => ({ day, start, end }));
}

/** هل يأخذه هذا الطالب؟ القيدُ نفسُه الذي يطبّقه محرّكُ المحاكاة، ولا تقاطعَ مع ما وجد له مقعداً. */
export function canTake(student: WaitingStudent, slots: readonly SimSlot[]): boolean {
  if (!slots.length) return false;
  if (student.constraints.noMorning && slots.some(slot => slot.start < NOON)) return false;
  if (student.constraints.noAfternoon && slots.some(slot => slot.end > NOON)) return false;
  return !slotsConflict(slots, student.busy);
}

export const fitsOf = (waiting: readonly WaitingStudent[], placement: Placement): number => {
  const slots = placementSlots(placement);
  return waiting.filter(student => canTake(student, slots)).length;
};

/**
 * الدفعةُ التي يعرفها الرادار: مقرراتٌ يريدها مع هذا المقرر ثلاثةُ منتظرين فأكثر (عتبةُ المحرّك نفسُها).
 * يقرؤها المحرّك فلا يضع الشعبة فوق مقررٍ تحتاجه الدفعة معها.
 */
export function waitingDemand(course: AdCourse, students: number, waiting: readonly WaitingStudent[]): DemandReading {
  const shared = new Map<number, number>();
  for (const student of waiting) for (const id of new Set(student.wants)) shared.set(id, (shared.get(id) || 0) + 1);
  const courseId = Number(course.AdCourseId);
  return {
    respondents: Math.max(1, waiting.length),
    courses: [{ courseId, name: String(course.CourseName || ""), code: String(course.CourseCode || ""), students, share: 0 }],
    pairs: [...shared].filter(([, count]) => count >= PAIR_FLOOR).map(([other, count]) => ({ a: courseId, b: other, shared: count, nameA: "", nameB: "" })),
    unwanted: [], headline: "",
  };
}

/** سُلّمُ القسم مقصوراً على يومٍ ووقتٍ واحد: المحرّكُ نفسُه يجيب «هل هنا مكانٌ نظيف؟». */
export function rhythmAt(rhythm: RhythmReading, day: DayKey, time: string): RhythmReading {
  return { ...rhythm, forDay: (asked: DayKey) => {
    if (asked !== day) return null;
    const pattern = rhythm.forDay(asked);
    return pattern ? { ...pattern, ladder: [time] } : null;
  } };
}

/**
 * القاعاتُ التي يقترح منها المحرّك: النوعُ الذي دُرِّس فيه المقرر من قبل (إن عُرف)، وقاعةٌ تقبل الحجز.
 * المحرّكُ بعدها يشترط أن يكون القسم درّس فيها وأن تتّسع للشعبة.
 */
export function roomsOfRightType(rooms: readonly MasterRoom[], history: readonly FSchedule[], courseId: number, sectionId: number): MasterRoom[] {
  const typeOf = (room: MasterRoom) => String(room.sectionRoomTypes?.[String(sectionId)] || room.roomType || "").trim();
  const byId = new Map(rooms.map(room => [String(room.id), room] as const));
  const known = new Set(history.filter(row => Number(row.AdCourseId) === courseId && row.roomId)
    .map(row => byId.get(String(row.roomId))).filter((room): room is MasterRoom => Boolean(room)).map(typeOf).filter(Boolean));
  return rooms.filter(room => room.bookingPolicy !== "blocked" && room.bookingPolicy !== "companion_only" && (!known.size || known.has(typeOf(room))));
}

export interface RadarCandidate { placement: Placement; fits: number }
export interface RadarCandidates { candidates: RadarCandidate[]; reason?: RadarNoSuggestion; proposal?: SectionProposal }

/**
 * المرشّحاتُ لمقررٍ واحد، مرتّبةً بعدد المنتظرين الذين يستطيعونها ثم بترتيب المحرّك (يومُه ثم سُلّمه).
 * كلُّ مرشّحٍ موضعٌ أعاده المحرّكُ نفسُه نظيفاً؛ ولا يُعاد ما لا يأخذه منتظرٌ واحد.
 */
export function radarCandidates(input: {
  course: AdCourse;
  /** شعبُ المقرر القائمة في الفصل. */
  openSections: number;
  waiting: readonly WaitingStudent[];
  week: FSchedule[]; universe: FSchedule[]; courses: AdCourse[]; instructors: AdInstructor[]; history: FSchedule[];
  rhythm: RhythmReading | null; doorway: number; rooms: readonly MasterRoom[]; termId: number;
  /** مرشِّحُ حالة الطرح (applyOfferingToOpenings): يحذف ما لا يجوز فتحه. */
  offerable?: (proposal: SectionProposal) => boolean;
  /** أقصى أوقاتٍ تُجرَّب في اليوم (كلفة). */
  perDay?: number;
}): RadarCandidates {
  const { course, waiting } = input;
  const capacity = Number(course.MaxStudent) || 0;
  if (!capacity) return { candidates: [], reason: "no-ceiling" };
  if (!waiting.length) return { candidates: [], reason: "no-waiting" };
  /* طلبٌ يُنقص شعبةً واحدة بالضبط: المقاعدُ القائمة + من ينتظر (حتى سعة شعبة). */
  const demand = waitingDemand(course, input.openSections * capacity + Math.min(capacity, waiting.length), waiting);
  const ask = (rhythm: RhythmReading | null) => readSectionOpenings(input.week, input.universe, input.courses, input.instructors, input.history, demand, null, rhythm, input.doorway, 1, [...input.rooms], input.termId)
    .proposals.find(proposal => Number(proposal.courseId) === Number(course.AdCourseId));
  const whole = ask(input.rhythm);
  if (!whole) return { candidates: [], reason: "no-slot" };
  if (input.offerable && !input.offerable(whole)) return { candidates: [], reason: "not-offerable" };
  if (!whole.placements.length) {
    const why = String(whole.unplacedReason || "");
    return { candidates: [], proposal: whole, reason: /قاعة/.test(why) ? "no-room" : /أستاذ|أحمال/.test(why) ? "no-instructor" : "no-slot" };
  }
  const seen = new Set<string>();
  const found: RadarCandidate[] = [];
  const keep = (placement: Placement) => {
    const key = `${placement.day}|${placement.start}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ placement, fits: fitsOf(waiting, placement) });
  };
  keep(whole.placements[0]);
  if (input.rhythm) for (const day of SCHEDULE_DAYS.map(row => row.key)) {
    for (const time of (input.rhythm.forDay(day)?.ladder || []).slice(0, input.perDay ?? 8)) {
      const placement = ask(rhythmAt(input.rhythm, day, time))?.placements[0];
      if (placement) keep(placement);
    }
  }
  const order = new Map(found.map((item, index) => [item, index] as const));
  const ranked = found.filter(item => item.fits > 0).sort((a, b) => b.fits - a.fits || order.get(a)! - order.get(b)!);
  return ranked.length ? { candidates: ranked, proposal: whole } : { candidates: [], proposal: whole, reason: "no-slot" };
}
