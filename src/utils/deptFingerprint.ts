/**
 * ── بصمة القسم ──────────────────────────────────────────────────────────────
 *
 * صورةٌ واحدة تُولَّد من جدول القسم: كل قاعةٍ حلقة، وكل يومٍ قطاعٌ بلونه، وكل
 * محاضرةٍ قوسٌ في حلقة قاعتها يمتدّ من بدايتها إلى نهايتها. سُمك القوس نسبةُ
 * مقاعد الشعبة إلى سعة القاعة، وما زاد على السعة يأخذ لوناً وحده. وفي القلب
 * زهرةٌ من حِمل الساعات: ستون بتلةً لساعات الأسبوع، أطولها ساعة الذروة.
 *
 * الرسم حتميّ: الجدول نفسه يعطي الصورة نفسها دائماً، ولا عشوائية فيه. فإذا
 * تغيّر الجدول تغيّرت البصمة ورمزُها، فيُقارَن فصلٌ بفصلٍ بنظرة.
 *
 * هذا الملف حسابٌ خالص: لا يقرأ قاعدة بيانات ولا يلمس الشاشة. الخادم يعطيه
 * صفوفاً محلولة القاعة والمقرر (src/server/routes/deptFingerprintRoutes.ts)،
 * والشاشة ترسم ما يحسبه (src/components/DeptFingerprint.tsx).
 *
 * لا أسماء أساتذة ولا أرقام مدنية. واسم القاعة لا يُطبع في الصورة نفسها: يظهر
 * في تفاصيل القوس فقط، ولمن يرى القاعات أصلاً.
 */
import { AR, countOf, nounFor, type ArabicNoun } from "./arabicCount";

export const FINGERPRINT_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"] as const;

/** من يرى البصمة: أصحاب جدول القسم. الأستاذ لا يراها (فيها القاعات). */
export const DEPT_FINGERPRINT_ROLES = ["committeeChair", "departmentHead", "standard"] as const;

/** لوحة الرسم: ملصقٌ طوليّ بنسبة ورقة A4، ليصلح غلافاً لتقرير القسم. */
export const FINGERPRINT_VIEW = { width: 1000, height: 1414, cx: 500, cy: 722, outer: 360, innerMin: 128, maxPitch: 42 } as const;

const DEFAULT_SPAN = { from: 480, to: 1200 } as const;
const SECTOR = 72, SECTOR_GAP = 5.5;
/** الأحد في أعلى الدائرة تماماً، ثم الأيام باتجاه عقارب الساعة. */
const START_ANGLE = -90 - SECTOR / 2;

export interface FingerprintRowInput {
  /** مفتاح القاعة؛ فارغٌ = موعدٌ بلا قاعة (يُعدّ في الأرقام ولا يُرسم). */
  hallKey: string;
  hallName: string;
  capacity?: number | null;
  courseId: number;
  courseCode: string;
  courseName: string;
  section: string;
  /** مقاعد الشعبة المطلوبة؛ فارغٌ = غير معروفة. */
  seats?: number | null;
  /** الأحد … الخميس. */
  days: readonly boolean[];
  start: string;
  end: string;
  /** إشغالُ المرفق المصاحب: يُرسم في حلقته ولا يُعدّ شعبةً ولا ساعاتٍ مرةً ثانية. */
  companion?: boolean;
}

export interface FingerprintSlot {
  day: number;
  start: number;
  end: number;
  code: string;
  title: string;
  section: string;
  seats: number | null;
  /** مقاعد الشعبة ÷ سعة القاعة؛ null حين يُجهل أحدهما. */
  fill: number | null;
  over: boolean;
}

export interface FingerprintHall {
  /** مفتاح القاعة في سجلّ المواقع (roomKeyOf): به تُعرف القاعة نفسها في «نبض القاعات» (src/utils/pulseLink.ts). */
  key: string;
  name: string;
  capacity: number | null;
  /** دقائق الإشغال في الأسبوع. */
  minutes: number;
  slots: FingerprintSlot[];
}

export interface FingerprintPeak { day: number; minute: number; count: number }

export interface FingerprintData {
  title: { section: string; term: string; college: string };
  halls: FingerprintHall[];
  stats: { halls: number; sections: number; weeklyHours: number; lectures: number; overfull: number; roomless: number; peak: FingerprintPeak | null };
  /** أول ساعةٍ وآخر ساعةٍ في الأسبوع المرسوم (بالدقائق من منتصف الليل). */
  span: { from: number; to: number };
  /** خمسة أيام × ساعات المدى: كم محاضرةً تجري في كل ساعة. */
  hours: number[][];
  /** رمزٌ قصير يتغيّر متى تغيّر شيءٌ في الرسم. */
  code: string;
}

/**
 * شكلُ البصمة وحده: أقواسٌ وحِمل ساعات، بلا اسم قاعةٍ ولا مقررٍ ولا شعبة ولا أي نص.
 * هو ما تحتاجه الهندسة لترسم، وما يُحمل إلى حيث لا يجوز أن يُقرأ اسم قاعة
 * (خلفية «فيلم الفصل»).
 */
export interface FingerprintShapeSlot { day: number; start: number; end: number; fill: number | null; over: boolean }
export interface FingerprintShape {
  halls: Array<{ slots: FingerprintShapeSlot[] }>;
  span: { from: number; to: number };
  hours: number[][];
}

/** يجرّد البصمة من كل نص: تبقى الأقواس بأيامها وأوقاتها وسُمكها. */
export function fingerprintShape(data: FingerprintShape): FingerprintShape {
  return {
    halls: data.halls.map(hall => ({ slots: hall.slots.map(slot => ({ day: slot.day, start: slot.start, end: slot.end, fill: slot.fill, over: slot.over })) })),
    span: { from: data.span.from, to: data.span.to },
    hours: data.hours.map(day => [...day]),
  };
}

export const fingerprintMinutes = (value?: string): number => {
  const [h, m] = String(value || "").split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : NaN;
};

export const fingerprintClock = (minute: number): string =>
  `${Math.floor(minute / 60)}:${String(Math.round(minute % 60)).padStart(2, "0")}`;

const positive = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

/** FNV-1a: رمزٌ ثابت للنص نفسه، بلا عشوائية. */
function hashCode(text: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ (c + i), 0x85ebca6b) >>> 0;
  }
  const hex = (n: number) => (n >>> 0).toString(16).toUpperCase().padStart(8, "0").slice(0, 4);
  return `${hex(a)}-${hex(b)}`;
}

export function buildFingerprint(input: {
  sectionName: string; termName: string; collegeName?: string; rows: readonly FingerprintRowInput[];
}): FingerprintData {
  const halls = new Map<string, FingerprintHall & { seen: Set<string> }>();
  const sections = new Set<string>();
  const timed: Array<{ day: number; start: number; end: number }> = [];
  let minutes = 0, roomless = 0, lectures = 0;
  const counted = new Set<string>();
  for (const row of input.rows) {
    const start = fingerprintMinutes(row.start), end = fingerprintMinutes(row.end);
    const valid = Number.isFinite(start) && Number.isFinite(end) && end > start;
    if (!row.companion) {
      if (row.courseId) sections.add(`${row.courseId}:${String(row.section || "").trim()}`);
      if (valid && !row.hallKey) roomless += 1;
    }
    if (!valid) continue;
    const seats = positive(row.seats), capacity = positive(row.capacity);
    const fill = seats && capacity ? Math.round((seats / capacity) * 100) / 100 : null;
    for (let day = 0; day < 5; day += 1) {
      if (!row.days[day]) continue;
      const id = `${day}|${start}|${end}|${row.courseId}|${row.section}`;
      /* الموعد المكرّر يُحسب مرةً واحدة في الأرقام كما يُرسم قوساً واحداً. */
      if (!row.companion && !counted.has(id)) { counted.add(id); minutes += end - start; lectures += 1; timed.push({ day, start, end }); }
      if (!row.hallKey) continue;
      let hall = halls.get(row.hallKey);
      if (!hall) { hall = { key: row.hallKey, name: row.hallName, capacity, minutes: 0, slots: [], seen: new Set() }; halls.set(row.hallKey, hall); }
      if (hall.capacity == null && capacity) hall.capacity = capacity;
      if (hall.seen.has(id)) continue;
      hall.seen.add(id);
      hall.minutes += end - start;
      hall.slots.push({ day, start, end, code: String(row.courseCode || ""), title: String(row.courseName || ""), section: String(row.section || ""), seats, fill, over: fill != null && fill > 1 });
    }
  }
  /* الأكثر إشغالاً في القلب، ثم الاسم: ترتيبٌ لا يتبدّل بتبدّل ترتيب الصفوف. */
  const ordered = [...halls.values()]
    .map(({ seen, ...hall }) => ({ ...hall, slots: hall.slots.sort((a, b) => a.day - b.day || a.start - b.start || a.code.localeCompare(b.code) || a.section.localeCompare(b.section)) }))
    .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name, "en", { numeric: true }));

  const from = timed.length ? Math.min(DEFAULT_SPAN.from, Math.floor(Math.min(...timed.map(t => t.start)) / 60) * 60) : DEFAULT_SPAN.from;
  const to = timed.length ? Math.max(from + 360, Math.ceil(Math.max(...timed.map(t => t.end)) / 60) * 60) : DEFAULT_SPAN.to;
  const span = { from, to: timed.length ? to : DEFAULT_SPAN.to };
  const hours = hourLoad(timed, span);
  let peak: FingerprintPeak | null = null;
  hours.forEach((day, d) => day.forEach((count, h) => { if (count > (peak?.count || 0)) peak = { day: d, minute: span.from + h * 60, count }; }));

  const slots = ordered.flatMap(hall => hall.slots);
  return {
    title: { section: String(input.sectionName || ""), term: String(input.termName || ""), college: String(input.collegeName || "") },
    halls: ordered,
    stats: { halls: ordered.length, sections: sections.size, weeklyHours: Math.round(minutes / 60), lectures, overfull: slots.filter(slot => slot.over).length, roomless, peak },
    span, hours,
    /* الحمل والمدى يدخلان الرمز: موعدٌ بلا قاعة يغيّر الزهرة فيغيّر الرمز. */
    code: hashCode(JSON.stringify([ordered.map(hall => hall.slots.map(s => [s.day, s.start, s.end, s.code, s.section, s.fill])), span.from, span.to, hours])),
  };
}

function hourLoad(timed: ReadonlyArray<{ day: number; start: number; end: number }>, span: { from: number; to: number }): number[][] {
  const count = Math.max(1, Math.round((span.to - span.from) / 60));
  const hours = Array.from({ length: 5 }, () => Array.from({ length: count }, () => 0));
  for (const t of timed) for (let h = 0; h < count; h += 1) {
    const at = span.from + h * 60;
    if (t.start < at + 60 && t.end > at) hours[t.day][h] += 1;
  }
  return hours;
}

/** مدًى واحد لبصمتين تُقارَنان، فتقع الساعة نفسها في الزاوية نفسها. */
export function unionSpan(a: { from: number; to: number }, b: { from: number; to: number }): { from: number; to: number } {
  return { from: Math.min(a.from, b.from), to: Math.max(a.to, b.to) };
}

/* ── الهندسة ─────────────────────────────────────────────────────────────── */

const n2 = (value: number) => (Math.round(value * 100) / 100).toString();
const polar = (r: number, degrees: number, cx = FINGERPRINT_VIEW.cx, cy = FINGERPRINT_VIEW.cy) => {
  const a = (degrees * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
};
const pt = (r: number, degrees: number) => { const p = polar(r, degrees); return `${n2(p.x)} ${n2(p.y)}`; };

/** خطُّ قوسٍ على نصف قطرٍ واحد (للمسارات الخافتة). */
export function arcLine(r: number, a0: number, a1: number): string {
  return `M${pt(r, a0)}A${n2(r)} ${n2(r)} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${pt(r, a1)}`;
}

/** قطعةُ حلقةٍ بين نصفي قطرين وزاويتين، بأركانٍ مدوّرة. */
export function ringSegment(ri: number, ro: number, a0: number, a1: number, corner: number): string {
  const deg = (rad: number) => (rad * 180) / Math.PI;
  const sweepLen = ((a1 - a0) * Math.PI / 180) * ri;
  const c = Math.max(0, Math.min(corner, (ro - ri) / 2, sweepLen / 2 - 0.01));
  if (c < 0.2) {
    const large = a1 - a0 > 180 ? 1 : 0;
    return `M${pt(ro, a0)}A${n2(ro)} ${n2(ro)} 0 ${large} 1 ${pt(ro, a1)}L${pt(ri, a1)}A${n2(ri)} ${n2(ri)} 0 ${large} 0 ${pt(ri, a0)}Z`;
  }
  const to = deg(Math.asin(c / (ro - c))), ti = deg(Math.asin(c / (ri + c)));
  const eo = (ro - c) * Math.cos((to * Math.PI) / 180), ei = (ri + c) * Math.cos((ti * Math.PI) / 180);
  const large = (a1 - to) - (a0 + to) > 180 ? 1 : 0;
  const cc = `${n2(c)} ${n2(c)}`;
  return `M${pt(ro, a0 + to)}A${n2(ro)} ${n2(ro)} 0 ${large} 1 ${pt(ro, a1 - to)}A${cc} 0 0 1 ${pt(eo, a1)}L${pt(ei, a1)}A${cc} 0 0 1 ${pt(ri, a1 - ti)}`
    + `A${n2(ri)} ${n2(ri)} 0 ${large} 0 ${pt(ri, a0 + ti)}A${cc} 0 0 1 ${pt(ei, a0)}L${pt(eo, a0)}A${cc} 0 0 1 ${pt(ro, a0 + to)}Z`;
}

export interface FingerprintArc {
  hall: number;
  slot: number;
  day: number;
  d: string;
  /** حافةٌ بلون «فوق السعة» على ظهر القوس؛ فارغةٌ لما لم يتجاوز. */
  rim: string;
  /** وسط القوس على اللوحة، لتوضع عنده بطاقة التفاصيل. */
  x: number;
  y: number;
  over: boolean;
  /** معروفة النسبة أم لا: المجهولة ترسم أخفت. */
  known: boolean;
  /** موضعه في دورة الأسبوع من 0 إلى 1: ترتيب ظهوره عند الرسم. */
  turn: number;
}

export interface FingerprintGeometry {
  inner: number;
  outer: number;
  /** لكل قاعة: نصف قطرها وعرض حلقتها، وخطوطها الخافتة (ثلاثة أخاديد في كل يوم). */
  rings: Array<{ r: number; band: number; tracks: string[]; ridges: string[] }>;
  arcs: FingerprintArc[];
  petals: Array<{ day: number; x1: number; y1: number; x2: number; y2: number; width: number; peak: boolean; empty: boolean }>;
  ticks: Array<{ x1: number; y1: number; x2: number; y2: number; major: boolean }>;
  dayLabels: Array<{ day: number; name: string; x: number; y: number }>;
}

/** زاوية دقيقةٍ من يومٍ على الدائرة. */
export function fingerprintAngle(day: number, minute: number, span: { from: number; to: number }): number {
  const t = Math.max(0, Math.min(1, (minute - span.from) / Math.max(1, span.to - span.from)));
  return START_ANGLE + day * SECTOR + SECTOR_GAP / 2 + (SECTOR - SECTOR_GAP) * t;
}

export function fingerprintGeometry(data: FingerprintShape, options: { span?: { from: number; to: number } } = {}): FingerprintGeometry {
  const V = FINGERPRINT_VIEW;
  const span = options.span || data.span;
  const count = data.halls.length;
  const pitch = count ? Math.min(V.maxPitch, (V.outer - V.innerMin) / count) : V.maxPitch;
  const inner = V.outer - pitch * Math.max(count, 1);
  const band = pitch * 0.76;
  const rings: FingerprintGeometry["rings"] = [], arcs: FingerprintArc[] = [];
  data.halls.forEach((hall, index) => {
    const r = inner + pitch * (index + 0.5);
    const sweep = (radius: number) => FINGERPRINT_DAYS.map((_, day) => arcLine(radius, fingerprintAngle(day, span.from, span), fingerprintAngle(day, span.to, span)));
    rings.push({ r, band, tracks: sweep(r), ridges: [...sweep(r - band * 0.36), ...sweep(r + band * 0.36)] });
    hall.slots.forEach((slot, s) => {
      const a0 = fingerprintAngle(slot.day, slot.start, span), a1 = fingerprintAngle(slot.day, slot.end, span);
      const width = band * (slot.over ? 1 : slot.fill == null ? 0.5 : 0.34 + 0.66 * Math.min(1, slot.fill));
      const mid = polar(r, (a0 + a1) / 2);
      /* فوق السعة: القوس بسُمكه الكامل، وعلى ظهره حافةٌ بلونٍ وحده يفصلها عنه خيطٌ من الفراغ. */
      const rimWidth = slot.over ? Math.max(1.4, Math.min(4.2, band * 0.24)) : 0, rimGap = slot.over ? Math.min(1.8, band * 0.1) : 0;
      const top = r + width / 2, body = top - rimWidth - rimGap;
      arcs.push({
        hall: index, slot: s, day: slot.day, d: ringSegment(r - width / 2, body, a0, a1, Math.min(3.4, (body - r + width / 2) * 0.42)),
        rim: slot.over ? ringSegment(top - rimWidth, top, a0, a1, rimWidth * 0.45) : "",
        x: Math.round(mid.x * 10) / 10, y: Math.round(mid.y * 10) / 10, over: slot.over, known: slot.fill != null,
        turn: (slot.day + (slot.start - span.from) / Math.max(1, span.to - span.from)) / 5,
      });
    });
  });

  /* زهرة القلب: بتلةٌ لكل ساعةٍ من كل يوم، طولها بقدر ما يجري فيها. */
  const hours = options.span ? hourLoadFromHalls(data, span) : data.hours;
  const top = Math.max(1, ...hours.flat());
  /* الزهرة لا تكبر مع قلّة القاعات: يبقى بينها وبين أول حلقةٍ فراغٌ هادئ. */
  const r0 = 26, r1 = Math.max(r0 + 12, Math.min(inner - 20, 168));
  const perDay = Math.max(1, hours[0]?.length || 1);
  const petalWidth = Math.max(2, Math.min(9, ((r0 + r1) / 2) * (((SECTOR - SECTOR_GAP) / perDay) * Math.PI / 180) * 0.56));
  let peakAt = "";
  hours.forEach((day, d) => day.forEach((value, h) => { if (!peakAt && value === top && value > 0) peakAt = `${d}:${h}`; }));
  const petals: FingerprintGeometry["petals"] = hours.flatMap((day, d) => day.map((value, h) => {
    const angle = fingerprintAngle(d, span.from + h * 60 + 30, span);
    const a = polar(r0, angle), b = polar(r0 + (r1 - r0) * Math.pow(value / top, 0.85), angle);
    return { day: d, x1: a.x, y1: a.y, x2: value ? b.x : a.x, y2: value ? b.y : a.y, width: petalWidth, peak: peakAt === `${d}:${h}`, empty: !value };
  }));

  const ticks: FingerprintGeometry["ticks"] = [];
  for (let day = 0; day < 5; day += 1) for (let minute = span.from; minute <= span.to; minute += 60) {
    const major = minute === span.from || minute === span.to || minute === 720;
    const angle = fingerprintAngle(day, minute, span);
    const a = polar(V.outer + 9, angle), b = polar(V.outer + (major ? 19 : 14), angle);
    ticks.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, major });
  }
  const dayLabels = FINGERPRINT_DAYS.map((name, day) => {
    const p = polar(V.outer + 56, START_ANGLE + day * SECTOR + SECTOR / 2);
    return { day, name, x: p.x, y: p.y };
  });
  return { inner, outer: V.outer, rings, arcs, petals, ticks, dayLabels };
}

/** حِمل الساعات على مدًى غير مدى البصمة (عند المقارنة): من أقواس القاعات نفسها. */
function hourLoadFromHalls(data: FingerprintShape, span: { from: number; to: number }): number[][] {
  const offset = Math.round((data.span.from - span.from) / 60);
  const count = Math.max(1, Math.round((span.to - span.from) / 60));
  return data.hours.map(day => Array.from({ length: count }, (_, h) => day[h - offset] || 0));
}

/* ── الألوان: لوحتان مكتوبتان هنا، فتحملهما الصورة المنزَّلة كما على الشاشة ── */

export interface FingerprintPalette {
  bg: [string, string];
  frame: string;
  ink: string;
  dim: string;
  rule: string;
  gold: string;
  days: [string, string, string, string, string];
  over: string;
}

export const FINGERPRINT_PALETTES: Record<"light" | "dark", FingerprintPalette> = {
  dark: {
    bg: ["#173d35", "#0a1d19"], frame: "#e2bd76", ink: "#eef5f0", dim: "#a3bdb3", rule: "#4d776a", gold: "#e2bd76",
    days: ["#f2c56b", "#5fe0b0", "#6cc4ff", "#b9a2ff", "#ff9dbb"], over: "#ff6a4d",
  },
  light: {
    bg: ["#fffdf8", "#f1eadb"], frame: "#86601f", ink: "#17211e", dim: "#5b6660", rule: "#cfc6b2", gold: "#86601f",
    days: ["#c0891c", "#12916a", "#2176c4", "#6d50cc", "#c9447a"], over: "#e03a20",
  },
};

/* ── الكلام ──────────────────────────────────────────────────────────────── */

const num = (value: number) => Math.round(value).toLocaleString("ar-KW-u-nu-latn");

export interface FingerprintHeadline { value: string; label: string; note?: string }

/** الأرقام الأربعة تحت الصورة: القاعات، الشعب، ساعات الأسبوع، ساعة الذروة. */
export function fingerprintHeadlines(data: FingerprintData): FingerprintHeadline[] {
  const { stats } = data;
  return [
    { value: num(stats.halls), label: nounFor(stats.halls, AR.room) },
    { value: num(stats.sections), label: nounFor(stats.sections, AR.section) },
    { value: num(stats.weeklyHours), label: `${nounFor(stats.weeklyHours, AR.hour)} في الأسبوع` },
    stats.peak
      ? { value: fingerprintClock(stats.peak.minute), label: `ذروة ${FINGERPRINT_DAYS[stats.peak.day]}`, note: FINGERPRINT_DAYS[stats.peak.day] }
      : { value: "—", label: "ساعة الذروة" },
  ];
}

/** حجم اسم القسم في رأس الملصق: الاسم الطويل يصغر حتى يبقى في سطره. */
export function fingerprintTitleSize(name: string): number {
  const length = Math.max(1, [...String(name || "")].length);
  return Math.round(Math.max(38, Math.min(74, 1500 / length)));
}

/** مقطعٌ يُقرأ من اليسار داخل سطرٍ عربي (مدى وقت، نسبة)، فلا ينقلب ترتيبه. */
const ltr = (text: string) => `\u2066${text}\u2069`;

/** ما يُقال عن قوسٍ حين يُشار إليه. */
export function fingerprintSlotLines(hall: FingerprintHall, slot: FingerprintSlot): { title: string; lines: string[]; over: boolean } {
  const fill = slot.fill == null
    ? (hall.capacity ? "مقاعد الشعبة غير مسجّلة" : "سعة القاعة غير مسجّلة")
    : `الامتلاء ${ltr(`${num(slot.fill * 100)}%`)} · ${num(slot.seats || 0)} من ${num(hall.capacity || 0)}`;
  return {
    title: [slot.code, slot.title].filter(Boolean).join(" · ") || "محاضرة",
    lines: [
      `${slot.section ? `الشعبة ${slot.section} · ` : ""}${FINGERPRINT_DAYS[slot.day]} ${ltr(`${fingerprintClock(slot.start)}–${fingerprintClock(slot.end)}`)}`,
      `القاعة ${ltr(hall.name)}`,
      slot.over ? `${fill} · فوق السعة` : fill,
    ],
    over: slot.over,
  };
}

/** الفرق بين فصلين في سطرٍ واحد: «قاعتان أكثر · 12 ساعة أقل». */
export function fingerprintDelta(now: FingerprintData, before: FingerprintData): string[] {
  const part = (diff: number, noun: ArabicNoun) => diff ? `${countOf(Math.abs(diff), noun)} ${diff > 0 ? "أكثر" : "أقل"}` : "";
  return [
    part(now.stats.halls - before.stats.halls, AR.room),
    part(now.stats.sections - before.stats.sections, AR.section),
    part(now.stats.weeklyHours - before.stats.weeklyHours, AR.hour),
  ].filter(Boolean);
}

/** رابط صفحة البصمة. */
export function deptFingerprintPath(params: { collegeId: number; sectionId: number; termId: number }): string {
  const query = new URLSearchParams({ college: String(params.collegeId), section: String(params.sectionId), term: String(params.termId) });
  return `/FSchedule/Fingerprint?${query.toString()}`;
}
