/**
 * ── آلة الزمن (FR-SCH-102) ───────────────────────────────────────────────────
 *
 * شريطٌ يُسحب عبر فصول القسم من الأقدم إلى الجاري، فتتحوّل «بصمة القسم» من فصلٍ
 * إلى فصل تحوّلاً ناعماً (الحلقات تنتقل إلى أماكنها الجديدة، والأقواس تولد أو
 * تذوي)، ويُعاد بناء «نبض القاعات» لذلك الفصل. ومعه شريط نموٍّ صغير (الشعب
 * والساعات والقاعات فصلاً بفصل)، و«أين تكرر الضغط»: قاعاتٌ ضاقت بشعبها في فصلين
 * فأكثر من الفصول الظاهرة، تحمل ندبةً دائمة وتُسرد في قائمةٍ قصيرة.
 *
 * هذا الملف حسابٌ خالص: لا يقرأ قاعدة بيانات ولا يلمس الشاشة. الخادم يلخّص كل
 * فصلٍ بـ`timelineEntry` (src/server/routes/deptFingerprintRoutes.ts)، والشاشة
 * ترسم (src/components/TermTimeline.tsx، src/components/DeptFingerprint.tsx،
 * src/components/hallPulse/HallPulse.tsx).
 *
 * الفصول السابقة للقراءة وحدها؛ ولا اسم أستاذٍ ولا رقم مدني في شيءٍ هنا.
 */
import type { ApprovalSeal } from "./approvalSeal";
import {
  arcAt, fingerprintGeometry, fingerprintPolar, ringTracks, slotWidth, unionSpan,
  FINGERPRINT_GAP_ANGLE, FINGERPRINT_GAP_DEGREES,
  type FingerprintArc, type FingerprintData, type FingerprintGeometry, type FingerprintSlot,
} from "./deptFingerprint";

/** أقصى عدد الفصول على الشريط: الجاري وأحد عشر قبله (قائمة البصمة نفسها تقف عند اثني عشر). */
export const TIME_MACHINE_MAX_TERMS = 12;
/** «تكرر الضغط»: قاعةٌ ضاقت في هذا العدد من الفصول الظاهرة فأكثر. */
export const REPEATED_PRESSURE_MIN = 2;
/** أقصى عدد الندوب على حلقةٍ واحدة (ما زاد يُقرأ في القائمة). */
export const FINGERPRINT_SCAR_MAX = 4;

export interface TimelinePressure {
  /** مفتاح القاعة في سجلّ المواقع (roomKeyOf) — به تُعرف القاعة نفسها في النبض. */
  key: string;
  name: string;
  /** محاضراتٌ فوق سعة القاعة في ذلك الفصل. */
  over: number;
}

export interface TimelineTerm {
  termId: number;
  termName: string;
  current: boolean;
  stats: { sections: number; weeklyHours: number; halls: number };
  span: { from: number; to: number };
  pressured: TimelinePressure[];
  /** ختم الاعتماد النهائي لذلك الفصل، أو null. */
  seal: ApprovalSeal | null;
}

/** القاعات التي ضاقت بشعبها في فصل: فيها محاضرةٌ واحدة على الأقل فوق سعتها. */
export function pressuredHalls(data: Pick<FingerprintData, "halls">): TimelinePressure[] {
  return data.halls
    .map(hall => ({ key: hall.key, name: hall.name, over: hall.slots.filter(slot => slot.over).length }))
    .filter(hall => hall.key && hall.over > 0)
    .sort((a, b) => b.over - a.over || a.name.localeCompare(b.name, "en", { numeric: true }));
}

/** ملخّص فصلٍ واحد على الشريط: أرقامه ومداه وقاعاته المضغوطة وختمه. لا صفوف ولا أسماء أساتذة. */
export function timelineEntry(data: FingerprintData, meta: { termId: number; termName: string; current: boolean; seal?: ApprovalSeal | null }): TimelineTerm {
  return {
    termId: Number(meta.termId), termName: String(meta.termName || data.title.term || ""), current: Boolean(meta.current),
    stats: { sections: data.stats.sections, weeklyHours: data.stats.weeklyHours, halls: data.stats.halls },
    span: { from: data.span.from, to: data.span.to },
    pressured: pressuredHalls(data),
    seal: meta.seal || null,
  };
}

/** الشريط من الأقدم إلى الجاري، بلا تكرار، والجاري آخره دائماً. */
export function orderTimeline(terms: readonly TimelineTerm[]): TimelineTerm[] {
  const seen = new Set<number>();
  const unique = terms.filter(term => term.termId && !seen.has(term.termId) && (seen.add(term.termId), true));
  const current = unique.filter(term => term.current);
  const past = unique.filter(term => !term.current);
  return [...past, ...current].slice(-TIME_MACHINE_MAX_TERMS);
}

/** مدًى واحد لكل فصول الشريط: الساعة نفسها في الزاوية نفسها طوال الرحلة، فلا تقفز البصمة بين فصلين. */
export function timelineSpan(terms: ReadonlyArray<{ span: { from: number; to: number } }>): { from: number; to: number } {
  return terms.reduce((span, term) => unionSpan(span, term.span), terms[0]?.span || { from: 480, to: 1200 });
}

/** «الفصل الأول 2023/2024» ← «الأول 23/24»: اسمٌ قصير تحت علامة الشريط. */
export function shortTermName(name: string): string {
  const text = String(name || "").replace(/\s+/g, " ").trim();
  const years = text.match(/(\d{4})\s*[/\-–]\s*(\d{2,4})/);
  const kind = text.replace(/^الفصل\s+/, "").replace(/(\d{4})\s*[/\-–]\s*(\d{2,4})/, "").replace(/\s+/g, " ").trim();
  if (!years) return kind || text;
  return `${kind} ${years[1].slice(-2)}/${years[2].slice(-2)}`.trim();
}

/* ── موضع الشريط ─────────────────────────────────────────────────────────── */

export interface ScrubPoint {
  /** الفصل الذي يبدأ منه التحوّل، والذي ينتهي إليه (قد يتساويان). */
  from: number;
  to: number;
  /** بينهما من 0 إلى 1. */
  t: number;
  /** أقرب فصلٍ إلى الموضع: هو المقروء نصّاً (اسمه وأرقامه وختمه). */
  nearest: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** موضعٌ متصل على الشريط (0 الأقدم … count-1 الجاري) إلى فصلين ونسبةٍ بينهما. */
export function scrubPoint(position: number, count: number): ScrubPoint {
  if (count <= 1 || !Number.isFinite(position)) return { from: Math.max(0, count - 1), to: Math.max(0, count - 1), t: 0, nearest: Math.max(0, count - 1) };
  const p = Math.max(0, Math.min(count - 1, position));
  const from = Math.min(count - 2, Math.floor(p));
  let t = p - from;
  /* ما قارب الفصل يُقرأ فصلاً، فلا يبقى الرسم معلّقاً في تحوّلٍ لا يُرى. */
  if (t < 0.002) t = 0;
  if (t > 0.998) t = 1;
  return { from, to: from + 1, t, nearest: t < 0.5 ? from : from + 1 };
}

/** تخفيفٌ ناعم للتحوّل: يبدأ هادئاً وينتهي هادئاً. */
export const morphEase = (t: number) => { const k = clamp01(t); return k * k * (3 - 2 * k); };

/* ── التحوّل بين بصمتين ──────────────────────────────────────────────────── */

interface MorphRing { key: string; a: { r: number; band: number } | null; b: { r: number; band: number } | null }
interface MorphArcEnd { band: number; width: number; slot: FingerprintSlot }
interface MorphArc { key: string; hallKey: string; a: MorphArcEnd | null; b: MorphArcEnd | null }

/** ما يُحسب مرةً لكل فصلين متجاورين، فيبقى كل إطارٍ من السحب رخيصاً. */
export interface MorphPair {
  span: { from: number; to: number };
  rings: MorphRing[];
  arcs: MorphArc[];
  ga: FingerprintGeometry;
  gb: FingerprintGeometry;
}

/** مفتاح القوس عبر الفصول: قاعته ويومه ووقته ومقرره وشعبته. */
export function morphArcKey(hallKey: string, slot: Pick<FingerprintSlot, "day" | "start" | "end" | "code" | "section">): string {
  return `${hallKey}|${slot.day}|${slot.start}|${slot.end}|${slot.code}|${slot.section}`;
}

function arcEnds(data: FingerprintData, geo: FingerprintGeometry): Map<string, { hallKey: string; end: MorphArcEnd }> {
  const out = new Map<string, { hallKey: string; end: MorphArcEnd }>();
  data.halls.forEach((hall, index) => {
    const band = geo.rings[index]?.band || 0;
    hall.slots.forEach(slot => {
      let key = morphArcKey(hall.key, slot), n = 1;
      while (out.has(key)) key = `${morphArcKey(hall.key, slot)}#${n++}`;
      out.set(key, { hallKey: hall.key, end: { band, width: slotWidth(band, slot), slot } });
    });
  });
  return out;
}

/** يجهّز التحوّل من بصمة `a` إلى بصمة `b` على مدًى واحد. */
export function prepareMorph(a: FingerprintData, b: FingerprintData, span: { from: number; to: number }): MorphPair {
  const ga = fingerprintGeometry(a, { span }), gb = fingerprintGeometry(b, { span });
  const ringOf = (data: FingerprintData, geo: FingerprintGeometry) => new Map(data.halls.map((hall, i) => [hall.key, { r: geo.rings[i].r, band: geo.rings[i].band }]));
  const ra = ringOf(a, ga), rb = ringOf(b, gb);
  /* ترتيب الحلقات: حلقات الفصل الذي نمضي إليه، ثم ما يذوي من الأول. */
  const keys = [...b.halls.map(hall => hall.key), ...a.halls.map(hall => hall.key).filter(key => !rb.has(key))];
  const rings = keys.map(key => ({ key, a: ra.get(key) || null, b: rb.get(key) || null }));
  const ea = arcEnds(a, ga), eb = arcEnds(b, gb);
  const arcKeys = [...eb.keys(), ...[...ea.keys()].filter(key => !eb.has(key))];
  const arcs = arcKeys.map(key => ({ key, hallKey: (eb.get(key) || ea.get(key))!.hallKey, a: ea.get(key)?.end || null, b: eb.get(key)?.end || null }));
  return { span, rings, arcs, ga, gb };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** نصف قطر حلقة القاعة وعرضها وشفافيتها عند `t`. */
export function morphRingAt(ring: MorphRing, t: number): { r: number; band: number; alpha: number } {
  if (ring.a && ring.b) return { r: lerp(ring.a.r, ring.b.r, t), band: lerp(ring.a.band, ring.b.band, t), alpha: 1 };
  const one = (ring.a || ring.b)!;
  return { r: one.r, band: one.band, alpha: ring.a ? 1 - t : t };
}

/**
 * الصورة بين فصلين عند `t` (0 = الأول تماماً، 1 = الثاني تماماً): الحلقات تنتقل إلى
 * أنصاف أقطارها الجديدة، والقوس الباقي ينتقل مع حلقته ويتبدّل سُمكه، والجديد ينمو من
 * لا شيء والزائل يذوي، وبتلات القلب تطول وتقصر. الأقواس بلا رقم قاعةٍ ولا شعبة
 * (`hall`/`slot` = -1): الصورة بين فصلين تُرى ولا يُشار إلى قوسٍ فيها.
 */
export function morphAt(pair: MorphPair, t: number): FingerprintGeometry {
  const k = clamp01(t);
  const ringAt = new Map(pair.rings.map(ring => [ring.key, morphRingAt(ring, k)]));
  const rings = pair.rings.map(ring => {
    const at = ringAt.get(ring.key)!;
    return { r: at.r, band: at.band, alpha: at.alpha, ...ringTracks(at.r, at.band, pair.span) };
  });
  const arcs: FingerprintArc[] = [];
  for (const arc of pair.arcs) {
    const hall = ringAt.get(arc.hallKey);
    if (!hall) continue;
    const width = arc.a && arc.b ? lerp(arc.a.width, arc.b.width, k) : arc.a ? arc.a.width * (1 - k) : arc.b!.width * k;
    if (width < 0.35) continue;
    const slot = arc.a && arc.b ? (k < 0.5 ? arc.a.slot : arc.b.slot) : (arc.a || arc.b)!.slot;
    const alpha = arc.a && arc.b ? 1 : arc.a ? 1 - k : k;
    arcs.push({ hall: -1, slot: -1, alpha, ...arcAt(hall.r, hall.band, width, slot, pair.span) });
  }
  /* البتلات على المدى نفسه في الصورتين: الزاوية واحدة، فالمزج على الخط نفسه مزجٌ لطولها وحده. */
  const petals = pair.ga.petals.map((pa, i) => {
    const pb = pair.gb.petals[i] || pa;
    const x2 = lerp(pa.x2, pb.x2, k), y2 = lerp(pa.y2, pb.y2, k);
    return { ...pa, x2, y2, empty: pa.empty && pb.empty || Math.hypot(x2 - pa.x1, y2 - pa.y1) < 0.6, peak: k < 0.5 ? pa.peak : pb.peak };
  });
  return { inner: lerp(pair.ga.inner, pair.gb.inner, k), outer: pair.ga.outer, rings, arcs, petals, ticks: pair.ga.ticks, dayLabels: pair.ga.dayLabels };
}

/** الأرقام الأربعة بين فصلين: تتدحرج مع السحب، والذروة للفصل الأقرب. */
export function morphStats(a: FingerprintData, b: FingerprintData, t: number): FingerprintData["stats"] {
  const k = clamp01(t), near = k < 0.5 ? a : b;
  const mix = (x: number, y: number) => Math.round(lerp(x, y, k));
  return {
    ...near.stats,
    halls: mix(a.stats.halls, b.stats.halls), sections: mix(a.stats.sections, b.stats.sections), weeklyHours: mix(a.stats.weeklyHours, b.stats.weeklyHours),
  };
}

/* ── أين تكرر الضغط ──────────────────────────────────────────────────────── */

export interface RepeatedPressure {
  key: string;
  name: string;
  /** الفصول التي ضاقت فيها، من الأقدم. */
  termIds: number[];
  count: number;
  /** مجموع المحاضرات فوق السعة فيها كلها. */
  over: number;
}

/** القاعات المضغوطة فصلاً بعد فصل: في `min` من الفصول الظاهرة فأكثر، الأكثر تكراراً أولاً. */
export function repeatedPressure(terms: readonly TimelineTerm[], min = REPEATED_PRESSURE_MIN): RepeatedPressure[] {
  const byKey = new Map<string, RepeatedPressure>();
  for (const term of terms) {
    for (const hall of term.pressured) {
      if (!hall.key) continue;
      let entry = byKey.get(hall.key);
      if (!entry) { entry = { key: hall.key, name: hall.name, termIds: [], count: 0, over: 0 }; byKey.set(hall.key, entry); }
      if (entry.termIds.includes(term.termId)) continue;
      entry.termIds.push(term.termId);
      entry.count += 1;
      entry.over += hall.over;
      /* الاسم من أحدث فصل: القاعة قد يتبدّل رمزها في السجل. */
      entry.name = hall.name || entry.name;
    }
  }
  return [...byKey.values()]
    .filter(entry => entry.count >= Math.max(2, min))
    .sort((a, b) => b.count - a.count || b.over - a.over || a.name.localeCompare(b.name, "en", { numeric: true }));
}

/** ندوب القاعة في فراغ الخميس–الأحد: خطٌّ قصير عبر حلقتها لكل فصلٍ ضاقت فيه (حتى أربعة). */
export function scarLines(r: number, band: number, count: number): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const n = Math.max(0, Math.min(FINGERPRINT_SCAR_MAX, Math.round(count)));
  if (!n || r <= 0) return [];
  /* الفراغ بين القطاعين بالدرجات؛ الندوب في وسطه، ولا تخرج منه أياً كان نصف القطر. */
  const room = FINGERPRINT_GAP_DEGREES * 0.78;
  const step = Math.min(1.25, room / n, (room * r) / (n * 135));
  const half = Math.max(2.4, Math.min(band * 0.46, 11));
  return Array.from({ length: n }, (_, i) => {
    const angle = FINGERPRINT_GAP_ANGLE + (i - (n - 1) / 2) * step;
    const a = fingerprintPolar(r - half, angle), b = fingerprintPolar(r + half, angle);
    return { x1: Math.round(a.x * 10) / 10, y1: Math.round(a.y * 10) / 10, x2: Math.round(b.x * 10) / 10, y2: Math.round(b.y * 10) / 10 };
  });
}

/* ── شريط النمو ──────────────────────────────────────────────────────────── */

export interface GrowthSeries { sections: number[]; hours: number[]; halls: number[] }

export function growthSeries(terms: readonly TimelineTerm[]): GrowthSeries {
  return {
    sections: terms.map(term => term.stats.sections),
    hours: terms.map(term => term.stats.weeklyHours),
    halls: terms.map(term => term.stats.halls),
  };
}

/** قيمة السلسلة عند موضعٍ متصل على الشريط (بين فصلين تُمزج). */
export function seriesAt(values: readonly number[], position: number): number {
  if (!values.length) return 0;
  const p = Math.max(0, Math.min(values.length - 1, Number.isFinite(position) ? position : values.length - 1));
  const i = Math.floor(p), t = p - i;
  return i >= values.length - 1 ? values[values.length - 1] : lerp(values[i], values[i + 1], t);
}

/**
 * نقاط خطٍّ صغير في مستطيل `width × height`: الأقدم يميناً والجاري يساراً (اتجاه
 * القراءة)، والقيم من صفرٍ إلى أعلاها فلا يُضخَّم فرقٌ صغير.
 */
export function sparkPoints(values: readonly number[], width: number, height: number, pad = 3): Array<{ x: number; y: number }> {
  if (!values.length) return [];
  const top = Math.max(1, ...values);
  const span = Math.max(1, values.length - 1);
  return values.map((value, i) => ({
    x: Math.round((width - pad - ((width - pad * 2) * i) / span) * 10) / 10,
    y: Math.round((height - pad - ((height - pad * 2) * Math.max(0, value)) / top) * 10) / 10,
  }));
}

/** موضع نقطةٍ متصلة على الخط نفسه. */
export function sparkAt(values: readonly number[], width: number, height: number, position: number, pad = 3): { x: number; y: number } {
  const points = sparkPoints(values, width, height, pad);
  if (!points.length) return { x: width / 2, y: height / 2 };
  const p = Math.max(0, Math.min(points.length - 1, position));
  const i = Math.floor(p), t = p - i;
  const a = points[i], b = points[Math.min(points.length - 1, i + 1)];
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

/** من الأقدم إلى الجاري بإشارة: «+4» أو «−2» أو «0» (أرقامٌ لاتينية). */
export function growthDelta(values: readonly number[]): string {
  if (values.length < 2) return "";
  const diff = Math.round(values[values.length - 1] - values[0]);
  return diff > 0 ? `+${diff}` : diff < 0 ? `−${Math.abs(diff)}` : "0";
}
