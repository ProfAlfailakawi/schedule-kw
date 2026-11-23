/**
 * ── نبض القاعات، الجولة الثالثة: حساب «اليوم يمرّ أمامك» و«قبل وبعد» و«القاعة من الداخل» ──
 *
 * نقيّ بلا React ولا three.js ولا صوت: منحنى ضغط اليوم وأشدّ لحظةٍ فيه، وتوقيت العرض
 * (ثلاثون ثانيةً بتخفيفٍ لا بقفزات)، وحالة كل قاعةٍ قبل الخطة وبعدها، ومقاعد القاعة
 * صفوفاً من سعتها ومن يقف عند الباب فوقها، ومستوى النغمة الخافتة من الازدحام.
 *
 * عدد الطلبة تقدير (سعة المقرر لكل شعبة) كما في hallPulse.ts. ولا يكتب هذا الملف شيئاً.
 */
import { applyPlan, fitClass, foreignAt, occupantsAt, type Assignment, type DayPlan, type FitClass, type PulseDay, type PulseModel } from "./hallPulse";

/* ── منحنى ضغط اليوم ─────────────────────────────────────────────────────── */
export interface PressurePoint {
  minute: number;
  /** الطلبة الحاضرون في القاعات (تقدير). */
  students: number;
  /** مقاعد القاعات المشغولة المعروفة السعة. */
  seats: number;
  /** مجموع من هم فوق سعة قاعاتهم. */
  over: number;
  /** عدد القاعات المضغوطة. */
  pressed: number;
  busy: number;
}

export function pressureAt(model: PulseModel, assignment: Assignment, day: PulseDay, minute: number): PressurePoint {
  const p: PressurePoint = { minute, students: 0, seats: 0, over: 0, pressed: 0, busy: 0 };
  for (const [key, s] of occupantsAt(model, assignment, day, minute)) {
    const cap = model.hallByKey.get(key)?.capacity || 0;
    const n = Number(s.students || 0);
    p.busy++;
    p.students += n;
    if (cap > 0) {
      p.seats += cap;
      if (n > cap) { p.over += n - cap; p.pressed++; }
    }
  }
  return p;
}

/** نقطةٌ كل `step` دقائق من أول اليوم إلى آخره. */
export function pressureCurve(model: PulseModel, assignment: Assignment, day: PulseDay, step = 5): PressurePoint[] {
  const out: PressurePoint[] = [];
  for (let m = model.dayStart; m < model.dayEnd; m += step) out.push(pressureAt(model, assignment, day, m));
  return out;
}

export interface WorstMoment {
  minute: number;
  hallKey: string;
  sessionId: number;
  students: number;
  capacity: number;
  /** من هم فوق سعة هذه القاعة. */
  over: number;
  /** مجموع من هم فوق السعة في كل القاعات في اللحظة نفسها. */
  totalOver: number;
  pressed: number;
}

/**
 * أشدّ لحظةٍ في اليوم: أكبر مجموعٍ لمن هم فوق السعة، ثم أكثر القاعات المضغوطة، ثم الأبكر.
 * وقاعتها أكثرها تجاوزاً. null حين لا قاعة فوق سعتها في اليوم كله: فلا يُخترع ضغط.
 */
export function worstMoment(model: PulseModel, assignment: Assignment, day: PulseDay, curve?: readonly PressurePoint[]): WorstMoment | null {
  const points = curve || pressureCurve(model, assignment, day);
  let best: PressurePoint | null = null;
  for (const p of points) {
    if (p.over <= 0) continue;
    if (!best || p.over > best.over || (p.over === best.over && p.pressed > best.pressed)) best = p;
  }
  if (!best) return null;
  let hallKey = "", sessionId = 0, students = 0, capacity = 0, over = 0;
  for (const [key, s] of occupantsAt(model, assignment, day, best.minute)) {
    const cap = model.hallByKey.get(key)?.capacity || 0;
    const n = Number(s.students || 0);
    if (cap > 0 && n - cap > over) { over = n - cap; hallKey = key; sessionId = s.id; students = n; capacity = cap; }
  }
  return hallKey ? { minute: best.minute, hallKey, sessionId, students, capacity, over, totalOver: best.over, pressed: best.pressed } : null;
}

/** ذروة الحضور: أكثر لحظةٍ طلبةً (الأبكر عند التساوي). null ليومٍ بلا محاضرات. */
export function peakMoment(curve: readonly PressurePoint[]): PressurePoint | null {
  let best: PressurePoint | null = null;
  for (const p of curve) if (p.students > 0 && (!best || p.students > best.students)) best = p;
  return best;
}

/* ── توقيت العرض ─────────────────────────────────────────────────────────── */
export const CINEMA_SECONDS = 30;
export interface CinemaLeg { from: number; to: number; seconds: number }

/** انزلاق: يبدأ هادئاً ويسرع في الوسط ويهدأ عند الوصول؛ متزايدٌ دائماً (لا رجوع ولا قفز). */
export const glide = (u: number) => {
  const t = Math.max(0, Math.min(1, u));
  return t - (Math.sin(2 * Math.PI * t) / (2 * Math.PI)) * 0.8;
};

/**
 * مقاطع العرض: من أول اليوم إلى أشدّ لحظة (إن وُجدت) ثم منها إلى آخره. مجموعها ثلاثون ثانية
 * بنسبة طول كل مقطع، ولا يقل مقطعٌ عن ثلاث ثوانٍ ليُرى الوصول.
 */
export function cinemaLegs(dayStart: number, dayEnd: number, stop: number | null, seconds = CINEMA_SECONDS): CinemaLeg[] {
  const end = dayEnd - 5;
  if (stop == null || stop <= dayStart || stop >= end) return [{ from: dayStart, to: end, seconds }];
  const span = Math.max(1, end - dayStart);
  const first = Math.max(3, Math.min(seconds - 3, (seconds * (stop - dayStart)) / span));
  return [{ from: dayStart, to: stop, seconds: first }, { from: stop, to: end, seconds: seconds - first }];
}

/** دقيقة المشهد بعد `elapsed` ثانية من بداية المقطع. */
export function cinemaMinute(leg: CinemaLeg, elapsed: number): number {
  return leg.from + (leg.to - leg.from) * glide(elapsed / Math.max(0.001, leg.seconds));
}

/** تقليل الحركة: خطواتٌ كل نصف ساعة بدل الانزلاق، وأشدّ لحظةٍ خطوةٌ منها بعينها. */
export function cinemaSteps(dayStart: number, dayEnd: number, stop: number | null, step = 30): number[] {
  const out = new Set<number>();
  for (let m = dayStart; m <= dayEnd - 5; m += step) out.add(m);
  if (stop != null && stop >= dayStart && stop <= dayEnd - 5) out.add(stop);
  return [...out].sort((a, b) => a - b);
}

/* ── النغمة الخافتة ──────────────────────────────────────────────────────── */
/** ازدحام 0–1 نسبةً إلى ذروة اليوم، وتوتّر 0–1 من نسبة من هم فوق السعة. */
export function soundLevels(point: Pick<PressurePoint, "students" | "over">, peakStudents: number): { crowd: number; tension: number } {
  const crowd = peakStudents > 0 ? Math.max(0, Math.min(1, point.students / peakStudents)) : 0;
  const tension = point.students > 0 ? Math.max(0, Math.min(1, point.over / Math.max(1, point.students * 0.12))) : 0;
  return { crowd, tension };
}

/* ── قبل وبعد ────────────────────────────────────────────────────────────── */
export interface HallState {
  sessionId: number | null;
  fit: FitClass | "empty" | "foreign";
  students: number | null;
  capacity: number | null;
  /** منسوب الطلبة: 0 فارغة، 1 ملأى، وفوق 1 تفيض. */
  level: number;
}

export function hallStatesAt(model: PulseModel, assignment: Assignment, day: PulseDay, minute: number): Map<string, HallState> {
  const occ = occupantsAt(model, assignment, day, minute);
  const out = new Map<string, HallState>();
  for (const h of model.halls) {
    const s = occ.get(h.key);
    if (s) {
      const fit = fitClass(s.students, h.capacity);
      out.set(h.key, { sessionId: s.id, fit, students: s.students, capacity: h.capacity, level: fit === "unknown" ? 0.55 : (s.students || 0) / (h.capacity || 1) });
    } else {
      const foreign = foreignAt(model, h.key, day, minute);
      out.set(h.key, { sessionId: null, fit: foreign ? "foreign" : "empty", students: null, capacity: h.capacity, level: foreign ? 0.5 : 0 });
    }
  }
  return out;
}

/**
 * القاعات كما هي الآن (الجدول الأصلي) وكما تصير بعد نقلات الخطة المضمَّنة، في اللحظة نفسها.
 * `changed` القاعات التي تغيّرت شعبتها: بها تُبرَز الفروق على جانبي الفاصل.
 */
export function beforeAfter(model: PulseModel, base: Assignment, plan: DayPlan | null, day: PulseDay, minute: number): { before: Map<string, HallState>; after: Map<string, HallState>; changed: Set<string> } {
  const before = hallStatesAt(model, base, day, minute);
  const after = hallStatesAt(model, applyPlan(base, plan), day, minute);
  const changed = new Set<string>();
  for (const [key, b] of before) if (after.get(key)?.sessionId !== b.sessionId) changed.add(key);
  return { before, after, changed };
}

/* ── القاعة من الداخل ────────────────────────────────────────────────────── */
/** أكثر ما يُرسم من المقاعد ومن الواقفين: القاعة الكبيرة تُرسم بالنسبة نفسها ويُقال ذلك. */
export const SEAT_DRAW_MAX = 240, STAND_DRAW_MAX = 40;
export const SEAT_PITCH_X = 1, SEAT_PITCH_Z = 1.3, AISLE = 1.1, STAND_PITCH = 0.78;

export interface SeatSpot { row: number; col: number; x: number; z: number }
export interface SeatLayout {
  rows: number;
  cols: number;
  capacity: number;
  /** المقاعد المرسومة (= السعة إلا في القاعات الكبيرة). */
  drawn: number;
  capped: boolean;
  /** المقاعد المرسومة المشغولة. */
  occupied: number;
  /** الواقفون الحقيقيون فوق السعة، والمرسومون منهم. */
  standingReal: number;
  standing: number;
  seats: SeatSpot[];
  /** ترتيب الجلوس: أول `occupied` من هذه المواضع مشغول. */
  order: number[];
  stand: Array<{ x: number; z: number }>;
  /** حدود الصفوف (بوحدات المقعد)، والباب في الركن الخلفي. */
  width: number;
  depth: number;
  door: { x: number; z: number };
}

const hash01 = (i: number) => { const v = Math.sin(i * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

/**
 * مقاعد القاعة صفوفاً من سعتها، بممرٍّ في الوسط، والصف الأول عند السبورة (z = 0).
 * الطلبة يملؤون المقاعد بترتيبٍ ثابت متناثر (لا عشوائية تتغيّر بين رسمٍ ورسم)،
 * ومن زاد على السعة يقف عند الباب خلف الصف الأخير. null حين السعة غير مسجّلة.
 */
export function seatLayout(capacity: number | null | undefined, students: number | null | undefined): SeatLayout | null {
  const cap = Math.round(Number(capacity || 0));
  if (!(cap > 0)) return null;
  const n = Math.max(0, Math.round(Number(students || 0)));
  const drawn = Math.min(cap, SEAT_DRAW_MAX);
  const capped = cap > drawn;
  const cols = Math.max(2, Math.min(drawn, Math.ceil(Math.sqrt(drawn * 1.55))));
  const rows = Math.ceil(drawn / cols);
  const half = cols / 2;
  const aisle = cols >= 6 ? AISLE : 0;
  const xOf = (c: number, count: number) => {
    /* الصف الأخير الناقص يتوسّط. */
    const shift = (cols - count) / 2;
    const cc = c + shift;
    return (cc - (cols - 1) / 2) * SEAT_PITCH_X + (aisle ? (cc >= half ? aisle / 2 : -aisle / 2) : 0);
  };
  const seats: SeatSpot[] = [];
  for (let r = 0; r < rows; r++) {
    const count = r === rows - 1 ? drawn - cols * (rows - 1) : cols;
    for (let c = 0; c < count; c++) seats.push({ row: r, col: c, x: xOf(c, count), z: r * SEAT_PITCH_Z });
  }
  const width = (cols - 1) * SEAT_PITCH_X + aisle + 1, depth = (rows - 1) * SEAT_PITCH_Z + 1;
  const order = seats.map((_, i) => i).sort((a, b) => (hash01(a) + Math.abs(seats[a].x) / width * 0.35) - (hash01(b) + Math.abs(seats[b].x) / width * 0.35) || a - b);
  const seated = Math.min(n, cap);
  const occupied = capped ? Math.min(drawn, seated > 0 ? Math.max(1, Math.round((seated / cap) * drawn)) : 0) : seated;
  const standingReal = Math.max(0, n - cap);
  /* الواقفون حتى ثلاثة صفوف عند الجدار الخلفي تبدأ من الباب؛ وما لا يتّسع له الجدار لا يُرسم (ويُقال). */
  const door = { x: width / 2 + 0.2, z: depth + 1.1 };
  const perLine = Math.max(3, Math.floor((width + 0.8) / STAND_PITCH));
  const wanted = standingReal ? Math.min(STAND_DRAW_MAX, capped ? Math.max(1, Math.round((standingReal / cap) * drawn)) : standingReal) : 0;
  const standing = Math.min(wanted, perLine * 3);
  const stand: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < standing; i++) {
    const line = Math.floor(i / perLine), k = i % perLine;
    stand.push({ x: door.x - 0.7 - k * STAND_PITCH - (line % 2) * (STAND_PITCH / 2), z: depth + 0.75 + line * 0.7 });
  }
  return { rows, cols, capacity: cap, drawn, capped, occupied, standingReal, standing, seats, order, stand, width, depth, door };
}
