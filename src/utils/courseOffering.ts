/**
 * ── حالةُ طرح المقرر في الفصل (C5) ───────────────────────────────────────────
 *
 * يضعها المسؤول لكل مقرر في فصلٍ وقسم، ويقرؤها كلُّ مكانٍ يعرض المقرر للاختيار:
 * بطاقة الأستاذ، ومساري، والوارد، والاقتراحات — مصدرٌ واحد هنا.
 *
 *   🟢 offered  مطروح (الافتراضي حين لا يُكتب شيء)
 *   🔒 closed   غير مطروح هذا الفصل
 *   🌱 future   صحيفةٌ جديدة لم تصل دفعتُها مستواه بعد — «يُطرح عند وصول الدفعة للمستوى X»
 *   🎯 limited  شعبٌ محدودة — العدد المتبقي = المسموح − القائم
 *
 * والعرضُ في بطاقة الأستاذ يختاره المسؤول: «hide» يخفيه، و«fade» يُبقيه باهتاً بقفل.
 * و«🌟 اهتمام مستقبلي» نجمةٌ يضعها الأستاذ على مقررٍ غير متاح، فتتجمّع قائمةً للمسؤول.
 */
export type OfferingState = "offered" | "closed" | "future" | "limited";
export type OfferingDisplay = "hide" | "fade";

export interface CourseOfferingEntry {
  courseId: number;
  state: OfferingState;
  /** للمستقبلي: المستوى الذي يُطرح عند بلوغه (١٠٠/٢٠٠/٣٠٠/٤٠٠). */
  level?: number;
  /** للمحدود: أقصى عدد شعب. */
  maxSections?: number;
  /** اقتراحٌ مشتق ينتظر تأكيد المسؤول — لا يُطبَّق حتى يؤكَّد. */
  suggested?: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface CourseOfferingDoc {
  /** `${collegeId}:${sectionId}:${termId}` */
  id: string;
  AdCollegeId: number;
  AdSectionId: number;
  AdTermId: number;
  display: OfferingDisplay;
  courses: Record<string, CourseOfferingEntry>;
  updatedAt?: string;
}

export const OFFERING_META: Record<OfferingState, { icon: string; label: string; tone: "ok" | "lock" | "seed" | "target" }> = {
  offered: { icon: "🟢", label: "مطروح", tone: "ok" },
  closed: { icon: "🔒", label: "غير مطروح هذا الفصل", tone: "lock" },
  future: { icon: "🌱", label: "صحيفة جديدة — لم نصل لمستواه", tone: "seed" },
  limited: { icon: "🎯", label: "شعب محدودة", tone: "target" },
};

export const offeringDocId = (collegeId: number, sectionId: number, termId: number) => `${Number(collegeId)}:${Number(sectionId)}:${Number(termId)}`;

export function emptyOfferingDoc(collegeId: number, sectionId: number, termId: number): CourseOfferingDoc {
  return { id: offeringDocId(collegeId, sectionId, termId), AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId, display: "fade", courses: {} };
}

/** المقررُ بلا قيد = مطروح. الاقتراحُ غير المؤكَّد لا يغيّر شيئاً. */
export function offeringOf(doc: CourseOfferingDoc | null | undefined, courseId: number): CourseOfferingEntry {
  const entry = doc?.courses?.[String(Number(courseId))];
  if (!entry || entry.suggested) return { courseId: Number(courseId), state: "offered" };
  return entry;
}

export interface OfferingView {
  courseId: number;
  state: OfferingState;
  /** يُعرض للاختيار؟ (المحدود يُختار ما بقي له عدد). */
  selectable: boolean;
  /** إن لم يكن قابلاً للاختيار: يُخفى أم يُعرض باهتاً بقفل. */
  hidden: boolean;
  /** السطرُ القصير بجانب المقرر. */
  line: string;
  icon: string;
  remaining?: number;
}

/**
 * ما يراه صاحبُ البطاقة/الطالب. `existingSections` = عدد الشعب القائمة لهذا المقرر في الفصل
 * (يُحسب من الجدول نفسه، لا يُخترع).
 */
export function offeringView(doc: CourseOfferingDoc | null | undefined, courseId: number, existingSections = 0): OfferingView {
  const entry = offeringOf(doc, courseId);
  const display = doc?.display === "hide" ? "hide" : "fade";
  const meta = OFFERING_META[entry.state];
  if (entry.state === "offered") return { courseId, state: "offered", selectable: true, hidden: false, line: "", icon: meta.icon };
  if (entry.state === "limited") {
    const max = Math.max(0, Number(entry.maxSections || 0));
    const remaining = Math.max(0, max - Math.max(0, existingSections));
    return remaining > 0
      ? { courseId, state: "limited", selectable: true, hidden: false, line: `شعب محدودة · متبقٍّ ${remaining}`, icon: meta.icon, remaining }
      : { courseId, state: "limited", selectable: false, hidden: display === "hide", line: "اكتملت الشعب المسموحة", icon: meta.icon, remaining: 0 };
  }
  const line = entry.state === "future"
    ? (entry.level ? `يُطرح عند وصول الدفعة للمستوى ${entry.level}` : "يُطرح عند وصول الدفعة لمستواه")
    : meta.label;
  return { courseId, state: entry.state, selectable: false, hidden: display === "hide", line, icon: meta.icon };
}

/** المستوى بالمئات: الصحائف القديمة تكتب ١–٤. */
export const normalizeLevel = (level: unknown): number => {
  const n = Number(level || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 10 ? n * 100 : Math.round(n / 100) * 100;
};

/**
 * ── الاقتراح التلقائي من الصحيفة (يؤكّده المسؤول) ─────────────────────────────
 *
 * مقررٌ في الصحيفة الجديدة (`newPlanCourseIds`) مستواه أعلى من أعلى مستوى طُرح منها
 * فعلاً في هذا الفصل (أي: له شعبٌ في الجدول) — دليلٌ من البيانات أن الدفعة لم تصله.
 * لا يُقترح شيءٌ حين لا يُعرف مستوى المقرر أو لا تُطرح من الصحيفة الجديدة أيُّ مقرر.
 */
export function suggestFutureCourses(input: {
  newPlanCourseIds: Iterable<number>;
  levelOf: (courseId: number) => number;
  scheduledCourseIds: Iterable<number>;
}): Array<{ courseId: number; level: number; reachedLevel: number }> {
  const plan = [...new Set([...input.newPlanCourseIds].map(Number))];
  const scheduled = new Set([...input.scheduledCourseIds].map(Number));
  const reached = Math.max(0, ...plan.filter(id => scheduled.has(id)).map(id => normalizeLevel(input.levelOf(id))));
  if (!reached) return [];
  return plan
    .filter(id => !scheduled.has(id))
    .map(id => ({ courseId: id, level: normalizeLevel(input.levelOf(id)) }))
    .filter(row => row.level > reached)
    .map(row => ({ ...row, reachedLevel: reached }))
    .sort((a, b) => a.level - b.level || a.courseId - b.courseId);
}

/** تطبيعُ ما يكتبه المسؤول قبل الحفظ. */
export function normalizeOfferingEntry(input: any, by = ""): CourseOfferingEntry | null {
  const courseId = Number(input?.courseId || 0);
  const state: OfferingState = ["offered", "closed", "future", "limited"].includes(input?.state) ? input.state : "offered";
  if (!courseId) return null;
  const entry: CourseOfferingEntry = { courseId, state, updatedAt: new Date().toISOString(), ...(by ? { updatedBy: by } : {}) };
  if (state === "future") { const level = normalizeLevel(input?.level); if (level) entry.level = level; }
  if (state === "limited") entry.maxSections = Math.max(0, Math.min(99, Math.trunc(Number(input?.maxSections || 0))));
  if (input?.suggested === true) entry.suggested = true;
  return entry;
}

/** ── 🌟 اهتمام مستقبلي ─────────────────────────────────────────────────────── */
export interface CourseInterestDoc {
  /** `${collegeId}:${sectionId}:${termId}` */
  id: string;
  /** courseId ← أرقامُ الأساتذة الذين أبدوا اهتمامهم. */
  byCourse: Record<string, number[]>;
}

export function toggleInterest(doc: CourseInterestDoc | null, id: string, courseId: number, instructorId: number, on: boolean): CourseInterestDoc {
  const next: CourseInterestDoc = { id, byCourse: { ...(doc?.byCourse || {}) } };
  const key = String(Number(courseId));
  const set = new Set((next.byCourse[key] || []).map(Number));
  if (on) set.add(Number(instructorId)); else set.delete(Number(instructorId));
  if (set.size) next.byCourse[key] = [...set].sort((a, b) => a - b); else delete next.byCourse[key];
  return next;
}

/* ── مصدرٌ واحد لكل المحرّكات ─────────────────────────────────────────────────
 * خريطة الفصل: courseId ← القيد المؤكَّد (من وثائق كل الأقسام في ذلك الفصل). مقررٌ بلا قيد = مطروح. */
export type TermOfferingStates = Map<number, CourseOfferingEntry>;

export function termOfferingStates(docs: ReadonlyArray<CourseOfferingDoc | null | undefined>): TermOfferingStates {
  const out: TermOfferingStates = new Map();
  for (const doc of docs) for (const entry of Object.values(doc?.courses || {})) {
    if (!entry || entry.suggested || entry.state === "offered") continue;
    out.set(Number(entry.courseId), entry);
  }
  return out;
}

/** لا يُقترح ولا يُعرض مقررٌ 🔒 أو 🌱. */
export const offeringBlocked = (states: TermOfferingStates, courseId: number) => {
  const state = states.get(Number(courseId))?.state;
  return state === "closed" || state === "future";
};

/** كم شعبةً جديدةً يُسمح باقتراحها: ∞ بلا قيد، 0 لـ🔒/🌱، والمتبقي لـ🎯. */
export function newSectionsAllowed(states: TermOfferingStates, courseId: number, existingSections: number): number {
  const entry = states.get(Number(courseId));
  if (!entry) return Number.POSITIVE_INFINITY;
  if (entry.state === "closed" || entry.state === "future") return 0;
  if (entry.state === "limited") return Math.max(0, Number(entry.maxSections || 0) - Math.max(0, existingSections));
  return Number.POSITIVE_INFINITY;
}

/**
 * يقصّ قراءة «افتح شعبة» (sectionOpening) على حالة الطرح: يحذف 🔒/🌱، ويقصّ 🎯 على المتبقي.
 * المحرّكُ نفسه لا يتغيّر؛ هذا مرشِّحٌ على ناتجه.
 */
export function applyOfferingToOpenings<T extends { proposals: Array<{ courseId: number; openSections: number; needed: number; placements: unknown[] }>; noCeiling: Array<{ courseId: number }> }>(reading: T, states: TermOfferingStates): T {
  if (!states.size) return reading;
  const proposals = reading.proposals.flatMap(proposal => {
    const allowed = newSectionsAllowed(states, proposal.courseId, proposal.openSections);
    if (allowed <= 0) return [];
    if (!Number.isFinite(allowed) || proposal.needed <= allowed) return [proposal];
    return [{ ...proposal, needed: allowed, placements: proposal.placements.slice(0, allowed) }];
  });
  return { ...reading, proposals, noCeiling: reading.noCeiling.filter(row => !offeringBlocked(states, row.courseId)) };
}

/** للعرض في مساري والوارد: أيقونة وسطر لمقررٍ مقيَّد، أو null. */
export function offeringBadge(states: TermOfferingStates, courseId: number): { state: OfferingState; icon: string; line: string } | null {
  const entry = states.get(Number(courseId));
  if (!entry) return null;
  const meta = OFFERING_META[entry.state];
  const line = entry.state === "future" ? (entry.level ? `يُطرح عند وصول الدفعة للمستوى ${entry.level}` : "يُطرح عند وصول الدفعة لمستواه")
    : entry.state === "limited" ? `شعب محدودة (${Number(entry.maxSections || 0)})` : meta.label;
  return { state: entry.state, icon: meta.icon, line };
}
