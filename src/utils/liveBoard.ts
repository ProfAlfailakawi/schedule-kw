/**
 * ── «يوم التسجيل الحي»: حسابٌ صرف ─────────────────────────────────────────────
 *
 * لوحةُ شعبٍ مرتّبةٌ بالإلحاح فوق رادار التسجيل. لا اتصالَ لها بنظام التسجيل الرسمي في الجامعة، ولا
 * أرقامَ مسجَّلين لكل شعبة من المسجّل؛ فهي تجمع ما في التطبيق فعلاً وتقول عن كل رقمٍ مصدرَه وعمرَه:
 *
 *   • «reports»    أجوبةُ الطلبة في «هل سجلت؟» (مسجَّل / لم أجد مقعداً) — لكل **مقرر**، وتُؤرَّخ بآخر جواب؛
 *   • «requests»   طلباتُ الشعب في «كشف التسجيل»: من اعتُمد ومن علّمه التسجيل «سُجّل» — لكل مقرر؛
 *   • «simulation» محاكاةُ الرادار — لكل **شعبة**، وتُؤرَّخ بآخر احتساب.
 *
 * أعدادٌ لا أسماء ولا معرّفاتِ طلبة: لا يدخل هذا الملفَّ أيُّ حقلٍ يخصّ طالباً بعينه.
 */

import { AR, countOf } from "./arabicCount";

export type FillState = "open" | "filling" | "full";
export type BoardSource = "reports" | "requests" | "simulation";

/** من هذه النسبة «يمتلئ» (الاتفاق مع بطاقات الرادار: ثمانون بالمئة). */
export const FILLING_AT = 0.8;
/** جولةٌ جارية: أرقامٌ أقدمُ من ثلاث ساعاتٍ قديمة. خارج الجولة يتّسع الحدّ إلى يومين. */
export const STALE_ACTIVE_MS = 3 * 3600_000;
export const STALE_IDLE_MS = 48 * 3600_000;

export const SOURCE_LABEL: Record<BoardSource, string> = {
  reports: "أجوبة الطلبة في «هل سجلت؟»",
  requests: "طلبات الشعب في كشف التسجيل",
  simulation: "محاكاة الرادار (تقدير لا تسجيلٌ فعلي)",
};

export const STATE_LABEL: Record<FillState, string> = { open: "متاح", filling: "يمتلئ", full: "ممتلئ" };

/** نسبةُ الامتلاء 0..∞ أو null حين لا سعةَ معروفة (لا نقسم على صفر ولا نخمّن). */
export function fillRatio(count: number, capacity: number): number | null {
  const cap = Number(capacity), n = Number(count);
  if (!Number.isFinite(cap) || cap <= 0 || !Number.isFinite(n)) return null;
  return Math.max(0, n) / cap;
}

export function fillState(ratio: number | null): FillState | null {
  if (ratio === null) return null;
  if (ratio >= 1) return "full";
  return ratio >= FILLING_AT ? "filling" : "open";
}

const RANK: Record<FillState, number> = { open: 0, filling: 1, full: 2 };
const stronger = (a: FillState | null, b: FillState | null): FillState | null => (a && b ? (RANK[a] >= RANK[b] ? a : b) : a || b);

export interface FreshnessReading { asOf: string | null; ageMs: number | null; stale: boolean; ageLine: string }

/** عمرُ الرقم وهل هو قديم. بلا تاريخٍ فهو «غير مؤرَّخ» وقديمٌ (لا ندّعي له حداثة). */
export function freshnessOf(asOf: string | null | undefined, now: number, roundActive: boolean): FreshnessReading {
  const at = asOf ? Date.parse(asOf) : NaN;
  if (!Number.isFinite(at)) return { asOf: null, ageMs: null, stale: true, ageLine: "غير مؤرَّخ" };
  const ageMs = Math.max(0, now - at);
  const minutes = Math.floor(ageMs / 60_000);
  const ageLine = minutes < 1 ? "الآن" : minutes < 60 ? `منذ ${minutes} د` : minutes < 48 * 60 ? `منذ ${Math.floor(minutes / 60)} س` : `منذ ${countOf(Math.floor(minutes / 1440), AR.day)}`;
  return { asOf: new Date(at).toISOString(), ageMs, stale: ageMs > (roundActive ? STALE_ACTIVE_MS : STALE_IDLE_MS), ageLine };
}

export interface SourceStamp { source: BoardSource; asOf: string | null }

/** أحدثُ المصادر المؤرَّخة. إن لم يُؤرَّخ شيءٌ يعود null. */
export function freshestSource(stamps: readonly SourceStamp[]): SourceStamp | null {
  let best: SourceStamp | null = null;
  for (const stamp of stamps) {
    const at = stamp.asOf ? Date.parse(stamp.asOf) : NaN;
    if (!Number.isFinite(at)) continue;
    if (!best || at > Date.parse(best.asOf as string)) best = stamp;
  }
  return best;
}

/* ── الدخل والخرج ──────────────────────────────────────────────────────────── */

export interface BoardSectionInput {
  key: string; courseId: number; collegeId: number; sectionId: number;
  code: string; name: string; sectionCode: string; time: string;
  capacity: number;
  /** ما أخذته المحاكاة من هذه الشعبة، أو null إن لم يجرِ احتساب. */
  simTaken: number | null;
  /** ما أضافه المرشدون فوق السعة (عددٌ مسجَّل في الأرصدة). */
  advisorAdded: number;
}

export interface BoardCourseSignal {
  /** أجوبةُ الطلبة: سجّلوا / لم يجدوا مقعداً لأنه ممتلئ. */
  reportedRegistered: number; reportedFull: number;
  /** طلباتُ الشعب: معتمَدون ومن علّمه التسجيل سُجّل. */
  approved: number; requestRegistered: number;
  /** من لا مقعدَ لهم في المحاكاة: امتلأت الشعب أو لا شعبة. */
  simWaiting: number;
}

export interface BoardRow {
  key: string; courseId: number; collegeId: number; sectionId: number;
  code: string; name: string; sectionCode: string; time: string;
  capacity: number;
  /** النسبة المعروضة (قد تتجاوز 1) أو null بلا سعة. */
  fill: number | null;
  state: FillState | null;
  /** من أين جاء الرقم المعروض لهذه الشعبة. */
  source: BoardSource | null;
  /** حدٌّ أدنى حين يأتي من أجوبةٍ لا تشمل كلَّ الطلبة. */
  lowerBound: boolean;
  waiting: number;
  waitingSource: BoardSource | null;
  advisorAdded: number;
  /** يحتاج بديلاً: ممتلئٌ أو يمتلئ وفيه منتظرون. */
  needsAlternative: boolean;
}

/**
 * حالةُ الشعبة من أقوى ما يعرفه التطبيق:
 *  - المحاكاةُ تعطي امتلاءَ **الشعبة**؛
 *  - الأجوبةُ وطلباتُ الشعب تعطي حدّاً أدنى لامتلاء **المقرر** (مسجَّلون ÷ سعة شعبه) فتَرفع الحالةَ ولا تخفضها؛
 *  - وجودُ من قال «لم أجد مقعداً» دليلٌ على أن المقرر لا يتّسع: لا يقلُّ عن «يمتلئ».
 */
export function rowOf(section: BoardSectionInput, course: BoardCourseSignal, courseCapacity: number): BoardRow {
  const simRatio = section.simTaken === null ? null : fillRatio(section.simTaken, section.capacity);
  const simState = fillState(simRatio);
  const realRatio = fillRatio(course.reportedRegistered + course.requestRegistered, courseCapacity);
  const realState = stronger(fillState(realRatio), course.reportedFull > 0 ? "filling" : null);
  const state = stronger(simState, realState);
  const raised = Boolean(realState) && (!simState || RANK[realState as FillState] > RANK[simState]);
  const realWaiting = course.reportedFull + Math.max(0, course.approved - course.requestRegistered);
  const waiting = realWaiting > 0 ? realWaiting : Math.max(0, course.simWaiting);
  const waitingSource: BoardSource | null = realWaiting > 0 ? (course.reportedFull > 0 ? "reports" : "requests") : waiting > 0 ? "simulation" : null;
  const fill = raised ? Math.max(simRatio ?? 0, realRatio ?? 0, state === "full" ? 1 : FILLING_AT) : simRatio;
  const source: BoardSource | null = raised ? (course.reportedFull > 0 || course.reportedRegistered > 0 ? "reports" : "requests") : state ? "simulation" : null;
  return {
    key: section.key, courseId: section.courseId, collegeId: section.collegeId, sectionId: section.sectionId,
    code: section.code, name: section.name, sectionCode: section.sectionCode, time: section.time, capacity: section.capacity,
    fill, state, source, lowerBound: raised, waiting, waitingSource, advisorAdded: Math.max(0, section.advisorAdded || 0),
    needsAlternative: (state === "full" || state === "filling") && waiting > 0,
  };
}

/** الإلحاح: ممتلئٌ فيه منتظرون ثم ممتلئ ثم يمتلئ بمنتظرين ثم يمتلئ ثم متاح؛ وداخل كل درجةٍ الأكثرُ منتظرين فالأعلى امتلاءً. */
export function urgencyOf(row: Pick<BoardRow, "state" | "waiting">): number {
  const rank = row.state ? RANK[row.state] : -1;
  return rank * 2 + (row.waiting > 0 ? 1 : 0);
}

export function orderBoard<T extends Pick<BoardRow, "state" | "waiting" | "fill" | "code" | "sectionCode">>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => urgencyOf(b) - urgencyOf(a) || b.waiting - a.waiting || (b.fill ?? -1) - (a.fill ?? -1)
    || a.code.localeCompare(b.code, "en") || a.sectionCode.localeCompare(b.sectionCode, "en"));
}

export interface BoardHeader {
  asOf: string | null; source: BoardSource | null; sourceLabel: string; ageLine: string; stale: boolean;
  /** أحدثُ ما عند التطبيق محاكاةٌ لا عدٌّ حقيقي: تُقال في رأس اللوحة. */
  simulationOnly: boolean;
  /** لكل مصدرٍ ما عنده، ليرى القارئ ما يستند إليه كلُّ رقم. */
  sources: Array<{ source: BoardSource; label: string; asOf: string | null; ageLine: string; stale: boolean; present: boolean }>;
}

export function headerOf(stamps: ReadonlyArray<SourceStamp & { present: boolean }>, now: number, roundActive: boolean): BoardHeader {
  const best = freshestSource(stamps.filter(stamp => stamp.present));
  const reading = freshnessOf(best?.asOf, now, roundActive);
  const realPresent = stamps.some(stamp => stamp.present && stamp.source !== "simulation");
  return {
    asOf: reading.asOf, source: best?.source ?? null, sourceLabel: best ? SOURCE_LABEL[best.source] : "لا مصدرَ بعد",
    ageLine: reading.ageLine, stale: reading.stale,
    simulationOnly: !realPresent && stamps.some(stamp => stamp.present && stamp.source === "simulation"),
    sources: stamps.map(stamp => {
      const read = freshnessOf(stamp.asOf, now, roundActive);
      return { source: stamp.source, label: SOURCE_LABEL[stamp.source], asOf: read.asOf, ageLine: read.ageLine, stale: read.stale, present: stamp.present };
    }),
  };
}

export interface LiveBoardInput {
  sections: readonly BoardSectionInput[];
  courses: ReadonlyMap<number, BoardCourseSignal>;
  stamps: ReadonlyArray<SourceStamp & { present: boolean }>;
  now: number; roundActive: boolean;
}

export interface LiveBoardPayload { header: BoardHeader; rows: BoardRow[]; counts: { open: number; filling: number; full: number; unknown: number; waiting: number } }

const EMPTY_SIGNAL: BoardCourseSignal = { reportedRegistered: 0, reportedFull: 0, approved: 0, requestRegistered: 0, simWaiting: 0 };

export function buildLiveBoard(input: LiveBoardInput): LiveBoardPayload {
  const capacityOf = new Map<number, number>();
  for (const section of input.sections) capacityOf.set(section.courseId, (capacityOf.get(section.courseId) || 0) + Math.max(0, section.capacity || 0));
  const rows = orderBoard(input.sections.map(section => rowOf(section, input.courses.get(section.courseId) || EMPTY_SIGNAL, capacityOf.get(section.courseId) || 0)));
  const counts = { open: 0, filling: 0, full: 0, unknown: 0, waiting: 0 };
  const seen = new Set<number>();
  for (const row of rows) {
    if (row.state) counts[row.state] += 1; else counts.unknown += 1;
    /* المنتظرون لكل مقرر مرةً واحدة (وإلا تكرّر العدد بعدد شعبه). */
    if (!seen.has(row.courseId)) { seen.add(row.courseId); counts.waiting += row.waiting; }
  }
  return { header: headerOf(input.stamps, input.now, input.roundActive), rows, counts };
}

/** أولُ شعبةٍ لكل مقررٍ يحتاج بديلاً: عليها تُعرض بطاقةُ الشعبة المقترحة مرةً واحدة. */
export function alternativeAnchors(rows: readonly BoardRow[]): Set<string> {
  const anchors = new Set<string>(), courses = new Set<number>();
  for (const row of rows) {
    if (!row.needsAlternative || courses.has(row.courseId)) continue;
    courses.add(row.courseId); anchors.add(row.key);
  }
  return anchors;
}

/** المقرراتُ التي نطلب لها اقتراحاً (الأشدُّ إلحاحاً أولاً، حدٌّ أعلى). */
export function coursesNeedingAlternative(rows: readonly BoardRow[], limit: number): number[] {
  const out: number[] = [];
  for (const row of rows) if (row.needsAlternative && !out.includes(row.courseId) && out.length < limit) out.push(row.courseId);
  return out;
}

/** الجولةُ الجارية = يومُ التسجيل (القاعدةُ نفسها في readStudentPhase: مفتاح «round»). */
export const isRegistrationDay = (phaseKey: string | undefined | null): boolean => phaseKey === "round";

/** نصُّ «آخر تحديث للأرقام: … · المصدر: …» الذي تعرضه اللوحة. */
export function asOfLine(header: Pick<BoardHeader, "asOf" | "sourceLabel" | "ageLine">, timeText: string): string {
  return `آخر تحديث للأرقام: ${header.asOf ? timeText : "غير معروف"} (${header.ageLine}) · المصدر: ${header.sourceLabel}`;
}
