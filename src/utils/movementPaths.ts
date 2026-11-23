/**
 * ── مسارات التنقّل: من قاعةٍ إلى قاعة في يومٍ واحد (نقيّ بلا React ولا three.js) ──
 *
 * لكل أستاذٍ، ولكل دفعةٍ من الطلبة (شعب المستوى نفسه في الصحيفة نفسها بالرمز نفسه)،
 * تُرتَّب محاضرات اليوم بوقتها، ويُحسب لكل انتقالٍ بين محاضرتين:
 *  - الفجوة بالدقائق؛
 *  - تقدير المشي من مواضع القاعات في المخطّط الآلي (القاعة نفسها، الطابق نفسه، طابقٌ آخر،
 *    مبنى آخر) — تقديرٌ لا قياس، والواجهة تقول ذلك؛
 *  - والتنبيهات: انتقالٌ ضيّق، وفراغٌ طويل للدفعة، وذهابٌ وإيابٌ بين مبنيين.
 * ثم تُرتَّب الانتقالات المنبَّه عليها «أصعب التنقلات اليوم».
 *
 * لا يكتب شيئاً: «اقترح قاعة أقرب» يقترح فقط، والحفظ عند الشاشة عبر مسار النقل المعتاد.
 */
import {
  compatible, fitClass, fitScore, hallFreeFor, type Assignment, type PulseDay, type PulseHall, type PulseLayout, type PulseModel, type PulseSession,
} from "./hallPulse";

/* ── العتبات (ثوابت مسمّاة) ── */
/** انتقالٌ إلى مبنى آخر بفجوةٍ لا تزيد على هذا: ضيّق. */
export const TIGHT_BUILDING_GAP_MIN = 10;
/** فراغٌ بين محاضرتين لدفعةٍ لا يقل عن هذا: طويل. */
export const LONG_IDLE_GAP_MIN = 180;
/** سرعة المشي التقديرية (متراً في الدقيقة) وطول وحدة المخطّط بالأمتار. */
export const WALK_METERS_PER_MIN = 70;
export const LAYOUT_UNIT_METERS = 3.5;
/** كلفة الطابق (درجٌ أو مصعد) وكلفة الخروج من مبنى والدخول إلى آخر، بالدقائق. */
export const FLOOR_CHANGE_MIN = 1.5;
export const BUILDING_CHANGE_MIN = 4;

export type HopKind = "same-hall" | "same-floor" | "floor" | "building";
export type HopFlag = "tight" | "idle" | "pingpong";
export const HOP_KIND_LABEL: Record<HopKind, string> = {
  "same-hall": "القاعة نفسها",
  "same-floor": "الطابق نفسه",
  floor: "طابقٌ آخر",
  building: "مبنى آخر",
};
export const HOP_FLAG_LABEL: Record<HopFlag, string> = {
  tight: "انتقالٌ ضيّق",
  idle: "فراغٌ طويل",
  pingpong: "ذهابٌ وإياب بين مبنيين",
};

export interface PathStop { sessionId: number; hallKey: string; start: number; end: number }
export interface Hop {
  index: number;
  from: PathStop;
  to: PathStop;
  gap: number;
  walk: number;
  kind: HopKind;
  flags: HopFlag[];
  score: number;
}
export interface MovePath {
  id: string;
  kind: "teacher" | "cohort";
  label: string;
  day: PulseDay;
  stops: PathStop[];
  hops: Hop[];
  score: number;
}
export interface CohortInput { key: string; label: string; courseIds: ReadonlySet<number> }

const floorIndexOf = (layout: PulseLayout, key: string) => layout.spots.get(key)?.floorIndex ?? 0;

/** تقدير المشي بين قاعتين بالدقائق، ونوع الانتقال. */
export function walkEstimate(model: PulseModel, layout: PulseLayout, fromKey: string, toKey: string): { minutes: number; kind: HopKind } {
  if (fromKey === toKey) return { minutes: 0, kind: "same-hall" };
  const a = layout.spots.get(fromKey), b = layout.spots.get(toKey);
  const ha = model.hallByKey.get(fromKey), hb = model.hallByKey.get(toKey);
  if (!a || !b || !ha || !hb) return { minutes: BUILDING_CHANGE_MIN, kind: "building" };
  const flat = Math.hypot(a.x - b.x, a.z - b.z) * LAYOUT_UNIT_METERS / WALK_METERS_PER_MIN;
  const floors = Math.abs(floorIndexOf(layout, fromKey) - floorIndexOf(layout, toKey));
  if (ha.buildingCode !== hb.buildingCode) {
    const down = floorIndexOf(layout, fromKey), up = floorIndexOf(layout, toKey);
    return { minutes: round1(flat + BUILDING_CHANGE_MIN + (down + up) * FLOOR_CHANGE_MIN), kind: "building" };
  }
  if (floors) return { minutes: round1(flat + floors * FLOOR_CHANGE_MIN), kind: "floor" };
  return { minutes: round1(flat), kind: "same-floor" };
}
const round1 = (v: number) => Math.round(v * 10) / 10;

function buildHops(model: PulseModel, layout: PulseLayout, stops: PathStop[], cohort: boolean): Hop[] {
  const hops: Hop[] = [];
  for (let i = 0; i + 1 < stops.length; i++) {
    const from = stops[i], to = stops[i + 1];
    const gap = to.start - from.end;
    if (gap < 0) continue; // تداخلٌ في الجدول نفسه: يحكم فيه فحص التعارض لا هذا المسار
    const { minutes, kind } = walkEstimate(model, layout, from.hallKey, to.hallKey);
    const flags: HopFlag[] = [];
    if ((kind === "building" && gap <= TIGHT_BUILDING_GAP_MIN) || (kind !== "same-hall" && minutes > gap)) flags.push("tight");
    if (cohort && gap >= LONG_IDLE_GAP_MIN) flags.push("idle");
    hops.push({ index: hops.length, from, to, gap, walk: minutes, kind, flags, score: 0 });
  }
  /* ذهابٌ وإياب: مبنى أ ← ب ← أ في انتقالين متتاليين. */
  const bOf = (key: string) => model.hallByKey.get(key)?.buildingCode || "";
  for (let i = 0; i + 1 < hops.length; i++) {
    const a = bOf(hops[i].from.hallKey), b = bOf(hops[i].to.hallKey), c = bOf(hops[i + 1].to.hallKey);
    if (a && b && a !== b && c === a && hops[i + 1].from.hallKey === hops[i].to.hallKey) {
      if (!hops[i + 1].flags.includes("pingpong")) hops[i + 1].flags.push("pingpong");
    }
  }
  for (const h of hops) h.score = hopScore(h);
  return hops;
}

/** درجة الصعوبة: الضيّق أولاً (بقدر ما ينقص الوقت عن المشي)، ثم الذهاب والإياب، ثم الفراغ الطويل. */
export function hopScore(h: Pick<Hop, "flags" | "gap" | "walk">): number {
  let s = 0;
  if (h.flags.includes("tight")) s += 6 + Math.max(0, h.walk - h.gap) + Math.max(0, TIGHT_BUILDING_GAP_MIN - h.gap) * 0.3;
  if (h.flags.includes("pingpong")) s += 3;
  if (h.flags.includes("idle")) s += 1 + (h.gap - LONG_IDLE_GAP_MIN) / 60;
  return round1(s);
}

/** مسارات اليوم: لكل أستاذٍ له محاضرتان فأكثر، ولكل دفعةٍ (مستوى × رمز شعبة). */
export function buildPaths(
  model: PulseModel, assignment: Assignment, layout: PulseLayout, day: PulseDay,
  opts: { instructorName?: (id: number) => string; cohorts?: readonly CohortInput[] } = {},
): MovePath[] {
  const hallOf = (s: PulseSession) => assignment.get(s.id) || s.hallKey;
  const today = model.sessions.filter(s => s.days.includes(day)).sort((a, b) => a.start - b.start || a.id - b.id);
  const stopOf = (s: PulseSession): PathStop => ({ sessionId: s.id, hallKey: hallOf(s), start: s.start, end: s.end });
  const out: MovePath[] = [];
  if (opts.instructorName) {
    const byTeacher = new Map<number, PulseSession[]>();
    today.forEach(s => { if (s.instructorId > 0) (byTeacher.get(s.instructorId) || byTeacher.set(s.instructorId, []).get(s.instructorId)!).push(s); });
    for (const [id, list] of byTeacher) {
      if (list.length < 2) continue;
      const stops = list.map(stopOf);
      const hops = buildHops(model, layout, stops, false);
      out.push({ id: `t:${id}`, kind: "teacher", label: opts.instructorName(id) || "أستاذ", day, stops, hops, score: Math.max(0, ...hops.map(h => h.score)) });
    }
  }
  for (const cohort of opts.cohorts || []) {
    const bySection = new Map<string, PulseSession[]>();
    today.forEach(s => { if (cohort.courseIds.has(s.courseId) && s.sectionCode) (bySection.get(s.sectionCode) || bySection.set(s.sectionCode, []).get(s.sectionCode)!).push(s); });
    for (const [code, list] of bySection) {
      if (new Set(list.map(s => s.courseId)).size < 2) continue;
      const stops = list.map(stopOf);
      const hops = buildHops(model, layout, stops, true);
      out.push({ id: `c:${cohort.key}:${code}`, kind: "cohort", label: `${cohort.label} · ش ${code}`, day, stops, hops, score: Math.max(0, ...hops.map(h => h.score)) });
    }
  }
  return out.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "ar"));
}

export interface RankedHop { path: MovePath; hop: Hop }
/** «أصعب التنقلات اليوم»: كل انتقالٍ منبَّه عليه، الأصعب أولاً. */
export function rankHops(paths: readonly MovePath[], limit = 12): RankedHop[] {
  return paths.flatMap(path => path.hops.filter(h => h.flags.length).map(hop => ({ path, hop })))
    .sort((a, b) => b.hop.score - a.hop.score || a.hop.from.start - b.hop.from.start)
    .slice(0, limit);
}

/**
 * «اقترح قاعة أقرب» لانتقالٍ صعب: قاعةٌ للمحاضرة التالية (أو السابقة) أقرب إلى الأخرى،
 * من النوع نفسه وفارغة ومقروء إشغالها (compatible + hallFreeFor)، وتتّسع للشعبة.
 */
export function nearerHalls(model: PulseModel, assignment: Assignment, layout: PulseLayout, hop: Hop, limit = 3): Array<{ sessionId: number; hall: PulseHall; walk: number }> {
  const out: Array<{ sessionId: number; hall: PulseHall; walk: number; fit: number }> = [];
  const tryMove = (moving: PathStop, anchor: PathStop) => {
    const session = model.sessionById.get(moving.sessionId);
    if (!session?.students) return;
    const now = walkEstimate(model, layout, anchor.hallKey, moving.hallKey).minutes;
    for (const h of model.halls) {
      if (h.key === moving.hallKey || !compatible(model, session, h)) continue;
      if (fitClass(session.students, h.capacity) === "pressed") continue;
      const walk = walkEstimate(model, layout, anchor.hallKey, h.key).minutes;
      if (walk >= now) continue;
      if (!hallFreeFor(model, assignment, h.key, session)) continue;
      out.push({ sessionId: session.id, hall: h, walk, fit: fitScore(session.students, h.capacity) });
    }
  };
  tryMove(hop.to, hop.from);
  tryMove(hop.from, hop.to);
  return out.sort((a, b) => a.walk - b.walk || a.fit - b.fit).slice(0, limit).map(({ sessionId, hall, walk }) => ({ sessionId, hall, walk }));
}

/** موضع العلامة المتحركة على المسار عند الدقيقة: عند محطةٍ (أثناء المحاضرة أو قبلها/بعدها) أو بين محطتين. */
export function markerAt(path: Pick<MovePath, "stops">, minute: number): { stop: number; hop: number | null; progress: number } {
  const stops = path.stops;
  if (!stops.length) return { stop: 0, hop: null, progress: 0 };
  if (minute <= stops[0].end) return { stop: 0, hop: null, progress: 0 };
  for (let i = 0; i < stops.length; i++) {
    if (minute >= stops[i].start && minute <= stops[i].end) return { stop: i, hop: null, progress: 0 };
    const next = stops[i + 1];
    if (next && minute > stops[i].end && minute < next.start) {
      const span = Math.max(1, next.start - stops[i].end);
      return { stop: i, hop: i, progress: (minute - stops[i].end) / span };
    }
  }
  return { stop: stops.length - 1, hop: null, progress: 0 };
}

/**
 * من يقرأ دفعات القسم (أرقام مقررات كل مستوى) عبر ‎/api/reports/pulse-cohorts‎: العميد والعميد المساعد
 * لقسمٍ من كليتهما وحدها (والمدير). قراءةٌ فقط؛ رئيس اللجنة يقرؤها من مسار الصحيفة بصلاحية الجدول.
 * يعيد 200 أو 400 (بلا كلية أو قسم) أو 403.
 */
export function pulseCohortsAccess(input: {
  isAdmin: boolean;
  /** العميد أو العميد المساعد (readsFinalSchedulesOnly). */
  deanReader: boolean;
  /** نطاق الحساب يغطّي الكلية والقسم (isScopeAllowed). */
  scopeAllowed: boolean;
  collegeId: number;
  sectionId: number;
  /** كلية القسم المطلوب كما في جدول الأقسام؛ 0 = قسمٌ غير موجود. */
  sectionCollegeId: number;
}): 200 | 400 | 403 {
  if (!(input.collegeId > 0) || !(input.sectionId > 0)) return 400;
  if (!input.sectionCollegeId || input.sectionCollegeId !== input.collegeId) return 403;
  if (input.isAdmin) return 200;
  if (!input.deanReader || !input.scopeAllowed) return 403;
  return 200;
}
