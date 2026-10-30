/**
 * ── «لم نصل بعد إلى هذا المستوى» — قاعدةٌ واحدة لكل مكان ─────────────────────
 *
 * هل وصل طلبةُ هذا الفرع (القسم في كليةٍ/حرمٍ بعينه) في هذه الصحيفة إلى المقرر؟
 * تجيب من شيئين فقط: قواعدُ الصحيفة (المسبقات والتوأم والمستوى) والجدولُ التاريخي
 * للفرع نفسه (أيُّ المقررات كانت لها شعبٌ في الفصول السابقة). لا رادار.
 *
 *   • كلُّ صحيفةٍ مستقلة: الجديدة تُقرأ من فصولها هي (منذ سنة بدئها)، والقديمة من تاريخها كلّه.
 *   • كلُّ فرعٍ مستقل: التاريخُ المُعطى هو تاريخُ الفرع وحده (البنين لا يفتح للبنات).
 *   • المسبقات: يُفتح المقرر إذا طُرحت متطلباتُه (من الصحيفة نفسها) في فصلٍ سابق. الصيفيُّ فصل.
 *   • التوأم (المتطلب المتزامن): يُفتحان معاً في الفصل نفسه — يكفي أن يُفتح كلٌّ منهما بشرطه.
 *   • بلا مسبقات: مستواه ≤ أعلى مستوى طُرح من الصحيفة في الفرع + مستوى واحد.
 *     أولُ فصلٍ للصحيفة الجديدة (لا شيء منها طُرح بعد): مقررات 100 بلا متطلبات فقط.
 *   • «افتحه للطرح»: قرارُ القسم يفتح المقرر مهما قالت القاعدة.
 *
 * ولا يُقفل شيءٌ بلا دليل: فرعٌ لا تاريخ له في النظام، أو مقررٌ لا مستوى له ولا مسبقات،
 * يبقى «غير معروف» — يُعرض عادياً بلا وسم.
 */
import type { CurriculumCourseRule, CurriculumPlan } from "../types";

export type ReachSheetKind = "new" | "old" | "only";

/** سنةُ بدء الصحيفة: سنتُها المرفوعة، وإلا سنةٌ في اسمها («الصحيفة الجديدة 2026/2027»)؛ 0 = غير معروفة. */
export const sheetYearOf = (plan: Pick<CurriculumPlan, "sheetYear" | "name">) =>
  Number(plan.sheetYear) || Number(/(?:19|20)\d{2}/.exec(String(plan.name || ""))?.[0]) || 0;

/**
 * صحائفُ القسم الحيّة مصنَّفة — القاعدةُ نفسها في شارة الصحيفة (planReviewRoutes) ووسمِها (sheetTag.ts):
 * في كل مسار، «active» مع «transition» = جديدةٌ وقديمة؛ وصحيفةٌ وحدها (لا سابقة لها) «only» تُقرأ من تاريخها كلّه.
 */
export function classifySheets<P extends Pick<CurriculumPlan, "status" | "virtual" | "track">>(plans: ReadonlyArray<P>): Array<{ plan: P; kind: ReachSheetKind }> {
  const live = plans.filter(plan => !plan.virtual && plan.status !== "archived");
  const byTrack = new Map<string, P[]>();
  for (const plan of live) byTrack.set(String(plan.track || ""), [...(byTrack.get(String(plan.track || "")) || []), plan]);
  const out: Array<{ plan: P; kind: ReachSheetKind }> = [];
  for (const group of byTrack.values()) {
    const fresh = group.find(plan => plan.status === "active");
    const paired = Boolean(fresh && group.some(plan => plan.status === "transition"));
    for (const plan of group) out.push({ plan, kind: !paired ? "only" : plan === fresh ? "new" : plan.status === "transition" ? "old" : "only" });
  }
  return out;
}

export type ReachState = "reached" | "locked" | "unknown";
export type ReachWhy =
  | "offered-before" | "prereqs-met" | "level-ok" | "override"
  | "prereq-missing" | "level-ahead" | "first-term" | "coreq-locked"
  | "no-history" | "no-data";

export interface ReachChainNode {
  courseId: number;
  code: string;
  /** ok: طُرح قبلُ · missing: لم يُطرح · target: المقرر نفسه. */
  state: "ok" | "missing" | "target";
  /** صلةُ هذه الحلقة بما بعدها: مسبقٌ أو توأم. */
  link?: "prereq" | "coreq";
}

export interface CourseReach {
  courseId: number;
  state: ReachState;
  why: ReachWhy;
  /** المتطلبات (أو التوأم) الناقصة. */
  missing: number[];
  level: number;
  /** أعلى مستوى طُرح من الصحيفة في الفرع قبل هذا الفصل (0 = لا شيء). */
  reachedLevel: number;
  /** السطرُ القصير للمقفل: «لم نصل بعد إلى هذا المستوى — المتطلب 210 لم يُطرح». */
  reason: string;
  /** سلسلةُ المتطلبات مضغوطةً حتى الحلقة الناقصة (للمقفل). */
  chain: ReachChainNode[];
  overridden?: boolean;
}

export interface ReachSheetInput {
  /** مقرراتُ الصحيفة (عضويتها). */
  courseIds: Iterable<number>;
  rules: ReadonlyArray<CurriculumCourseRule>;
  /** صحيفةٌ جديدة: تُقرأ من سنة بدئها؛ وأولُ فصلٍ لها مقررات 100 فقط. */
  isNew?: boolean;
  /** ترتيبُ أول فصلٍ للصحيفة (termChronology)؛ قبله لا يُحسب لها. */
  startChronology?: number | null;
}

export interface ReachHistoryTerm {
  /** termChronology: السنة×10 + الفصل (الصيفي آخر السنة). */
  chronology: number;
  /** المقررات التي كانت لها شعبٌ في الفرع في ذلك الفصل. */
  courseIds: Iterable<number>;
}

export interface ReachInput {
  sheet: ReachSheetInput;
  /** تاريخُ الفرع (القسم في كليته) — الفصول كلُّها، يُرشَّح هنا. */
  history: ReadonlyArray<ReachHistoryTerm>;
  /** ترتيبُ الفصل المطلوب. */
  currentChronology: number;
  /** مستوى المقرر (من رمزه ثم من الصحيفة)؛ 0 إن لم يُعرف. */
  levelOf: (courseId: number) => number;
  /** الرمزُ القصير للعرض («210»). */
  codeOf: (courseId: number) => string;
  /** مقرراتٌ فتحها القسم للطرح يدوياً. */
  overrides?: Iterable<number>;
}

/** الرمزُ القصير: آخرُ ثلاثة أرقام من الرمز المؤسسي («0109210» ← «210»). */
export function shortCourseCode(code: unknown): string {
  const text = String(code ?? "").trim();
  const digits = text.replace(/\D/g, "");
  return digits.length >= 3 ? digits.slice(-3) : text;
}

const ids = (list: Iterable<number> | undefined) => [...(list || [])].map(Number).filter(n => Number.isFinite(n) && n > 0);

/** المسبقاتُ داخل الصحيفة فقط: «كلها» ومجموعاتُ «أحدها يكفي». ما خارجها لا يُحكم به. */
function inSheetPrereq(rule: CurriculumCourseRule | undefined, members: ReadonlySet<number>) {
  const all = ids(rule?.prereq?.all).filter(id => members.has(id) && id !== rule?.courseId);
  const anyOf = (rule?.prereq?.anyOf || []).map(group => ids(group).filter(id => members.has(id))).filter(group => group.length);
  return { all, anyOf };
}

export function sheetReach(input: ReachInput): Map<number, CourseReach> {
  const members = new Set(ids(input.sheet.courseIds));
  const ruleOf = new Map(input.sheet.rules.map(rule => [Number(rule.courseId), rule] as const));
  const overrides = new Set(ids(input.overrides));
  const start = input.sheet.startChronology ?? null;
  const earlier = input.history.filter(term => term.chronology < input.currentChronology);
  /* فرعٌ بلا تاريخٍ في النظام: لا دليلَ على أي مستوى — لا يُقفل شيء. */
  const historyKnown = earlier.some(term => ids(term.courseIds).length > 0);
  const window = earlier.filter(term => start == null || term.chronology >= start);
  const offered = new Set<number>();
  for (const term of window) for (const id of ids(term.courseIds)) if (members.has(id)) offered.add(id);
  const reachedLevel = Math.max(0, ...[...offered].map(id => Number(input.levelOf(id) || 0)));
  const code = (id: number) => input.codeOf(id) || String(id);

  /* حكمُ المقرر بشرطه هو (بلا توأمه). */
  const own = new Map<number, Omit<CourseReach, "chain" | "reason">>();
  for (const courseId of members) {
    const level = Number(input.levelOf(courseId) || 0);
    const base = { courseId, level, reachedLevel, missing: [] as number[] };
    if (overrides.has(courseId)) { own.set(courseId, { ...base, state: "reached", why: "override", overridden: true }); continue; }
    if (!historyKnown) { own.set(courseId, { ...base, state: "unknown", why: "no-history" }); continue; }
    if (offered.has(courseId)) { own.set(courseId, { ...base, state: "reached", why: "offered-before" }); continue; }
    const prereq = inSheetPrereq(ruleOf.get(courseId), members);
    if (prereq.all.length || prereq.anyOf.length) {
      const missing = [
        ...prereq.all.filter(id => !offered.has(id)),
        ...prereq.anyOf.filter(group => !group.some(id => offered.has(id))).map(group => group[0]),
      ];
      own.set(courseId, missing.length
        ? { ...base, state: "locked", why: "prereq-missing", missing: [...new Set(missing)] }
        : { ...base, state: "reached", why: "prereqs-met" });
      continue;
    }
    if (!level) { own.set(courseId, { ...base, state: "unknown", why: "no-data" }); continue; }
    if (level <= reachedLevel + 100) { own.set(courseId, { ...base, state: "reached", why: "level-ok" }); continue; }
    own.set(courseId, { ...base, state: "locked", why: reachedLevel ? "level-ahead" : "first-term" });
  }

  /* التوأم: يُفتحان معاً — مقررٌ توأمُه مقفلٌ بشرطه (ولم يُطرح قبلُ) يُقفل معه. */
  const out = new Map<number, CourseReach>();
  for (const [courseId, verdict] of own) {
    let final: Omit<CourseReach, "chain" | "reason"> = verdict;
    if (verdict.state !== "locked" && verdict.why !== "override" && verdict.why !== "offered-before") {
      const twins = ids(ruleOf.get(courseId)?.coreq).filter(id => members.has(id) && id !== courseId);
      const blocked = twins.filter(id => !offered.has(id) && own.get(id)?.state === "locked");
      if (blocked.length) final = { ...verdict, state: "locked", why: "coreq-locked", missing: blocked };
    }
    out.set(courseId, { ...final, reason: reasonOf(final, code, Boolean(input.sheet.isNew)), chain: final.state === "locked" ? chainOf(courseId, final, ruleOf, members, offered, code) : [] });
  }
  return out;
}

function reasonOf(verdict: Omit<CourseReach, "chain" | "reason">, code: (id: number) => string, isNew: boolean): string {
  if (verdict.state !== "locked") return "";
  const names = verdict.missing.slice(0, 2).map(code).join(" و");
  if (verdict.why === "prereq-missing") return `لم نصل بعد إلى هذا المستوى — المتطلب ${names} لم ${verdict.missing.length > 1 ? "يُطرحا" : "يُطرح"}`;
  if (verdict.why === "coreq-locked") return `لم نصل بعد — توأمه ${names} لم يُفتح`;
  if (verdict.why === "first-term") return isNew ? "أول فصلٍ للصحيفة الجديدة — مقررات 100 بلا متطلبات فقط" : "لم نصل بعد إلى هذا المستوى — لم يُطرح من الصحيفة شيء";
  return `لم نصل بعد إلى هذا المستوى — أعلى مستوى طُرح ${verdict.reachedLevel}`;
}

/** السلسلة: من آخر حلقةٍ طُرحت إلى الحلقة الناقصة إلى المقرر — أربعُ حلقاتٍ على الأكثر. */
function chainOf(courseId: number, verdict: Omit<CourseReach, "chain" | "reason">, ruleOf: Map<number, CurriculumCourseRule>, members: ReadonlySet<number>, offered: ReadonlySet<number>, code: (id: number) => string): ReachChainNode[] {
  const target: ReachChainNode = { courseId, code: code(courseId), state: "target" };
  if (verdict.why === "coreq-locked") {
    const twin = verdict.missing[0];
    return [{ courseId: twin, code: code(twin), state: "missing", link: "coreq" }, target];
  }
  if (verdict.why !== "prereq-missing") return [target];
  const chain: ReachChainNode[] = [target];
  const seen = new Set([courseId]);
  let current = courseId;
  let missing = verdict.missing[0];
  while (missing && !seen.has(missing) && chain.length < 3) {
    seen.add(missing);
    chain.unshift({ courseId: missing, code: code(missing), state: "missing", link: "prereq" });
    current = missing;
    const prereq = inSheetPrereq(ruleOf.get(current), members);
    missing = [...prereq.all, ...prereq.anyOf.map(group => group.find(id => !offered.has(id)) || 0)].find(id => id && !offered.has(id)) || 0;
  }
  const prereq = inSheetPrereq(ruleOf.get(current), members);
  const satisfied = [...prereq.all, ...prereq.anyOf.flat()].find(id => offered.has(id));
  if (satisfied && chain[0].state === "missing") chain.unshift({ courseId: satisfied, code: code(satisfied), state: "ok", link: "prereq" });
  return chain;
}

/**
 * مقررٌ في أكثر من صحيفة: يكفي أن يصله فرعٌ في إحداها (مقرر 101 المشترك وصلته الصحيفة القديمة).
 * المقفلُ في كلها يحمل سببَ أولها؛ و«غير معروف» يغلب المقفل (لا يُقفل بلا دليلٍ كامل).
 */
export function combineReach(list: ReadonlyArray<CourseReach | undefined>): CourseReach | null {
  const rows = list.filter(Boolean) as CourseReach[];
  if (!rows.length) return null;
  return rows.find(row => row.overridden)
    || rows.find(row => row.state === "reached")
    || rows.find(row => row.state === "unknown")
    || rows[0];
}

/** وسمُ «وصلنا ✓ / لم نصل بعد 🔒» — لا وسم لـ«غير معروف». */
export function reachChip(reach: Pick<CourseReach, "state" | "overridden"> | null | undefined): { icon: string; label: string; tone: "ok" | "lock" | "open" } | null {
  if (!reach || reach.state === "unknown") return null;
  if (reach.overridden) return { icon: "🔓", label: "فُتح للطرح", tone: "open" };
  return reach.state === "reached" ? { icon: "✓", label: "وصلنا", tone: "ok" } : { icon: "🔒", label: "لم نصل بعد", tone: "lock" };
}

/** مقفلٌ فعلاً (لم يفتحه القسم)؟ — السؤالُ الذي يسأله الكرتُ والنموذجُ والاعتماد. */
export const reachLocked = (reach: Pick<CourseReach, "state"> | null | undefined) => reach?.state === "locked";

/** سطرُ لوحة الفحص في نموذج الموعد (تنبيهٌ أصفر لا يمنع): «لم نصل بعد — المتطلب 210 لم يُطرح في هذا الفرع». */
export function reachNote(reach: Pick<CourseReach, "state" | "why" | "missing" | "chain" | "reachedLevel" | "reason"> | null | undefined, codeOf?: (id: number) => string): string {
  if (!reachLocked(reach)) return "";
  const code = (id: number) => codeOf?.(id) || reach!.chain.find(node => node.courseId === id)?.code || String(id);
  const names = reach!.missing.slice(0, 2).map(code).join(" و");
  if (reach!.why === "prereq-missing") return `لم نصل بعد — المتطلب ${names} لم ${reach!.missing.length > 1 ? "يُطرحا" : "يُطرح"} في هذا الفرع`;
  if (reach!.why === "coreq-locked") return `لم نصل بعد — توأمه ${names} لم يُفتح في هذا الفرع`;
  if (reach!.why === "level-ahead") return `لم نصل بعد — أعلى مستوى طُرح في هذا الفرع ${reach!.reachedLevel}`;
  return `لم نصل بعد — ${reach!.reason.split("—").pop()!.trim()}`;
}

/** بندُ «لم نصل بعد» في لوحة الفحص (يُقرن به زرّ «افتحه للطرح»). */
export const isReachNote = (text: unknown) => /^لم نصل بعد/.test(String(text || ""));

/**
 * تبويبا «🆕 الصحيفة الجديدة» و«📘 الصحيفة القديمة» في لوحة حالة الطرح: عضويةُ الصحيفة تقرّر.
 * مقررٌ في الصحيفتين يظهر في التبويبين؛ ومقررٌ خارج الصحائف (خدمة، قديمٌ بلا صحيفة) في القديمة.
 * لا صحيفةَ جديدة (أو لا قديمة) ⇒ لا تبويب: قائمةٌ واحدة كما كانت.
 */
export function splitBySheet(courseIds: Iterable<number>, sheets: ReadonlyArray<{ kind: "new" | "old" | "only"; courseIds: Iterable<number> }>): { tabs: boolean; new: number[]; old: number[] } {
  const all = ids(courseIds);
  const fresh = new Set(sheets.filter(sheet => sheet.kind === "new").flatMap(sheet => ids(sheet.courseIds)));
  const old = new Set(sheets.filter(sheet => sheet.kind !== "new").flatMap(sheet => ids(sheet.courseIds)));
  if (!fresh.size || !old.size) return { tabs: false, new: [], old: all };
  return { tabs: true, new: all.filter(id => fresh.has(id)), old: all.filter(id => old.has(id) || !fresh.has(id)) };
}

/**
 * حالةُ الطرح (🟢/🔒/🌱/🎯) ثم «لم نصل بعد»: المقررُ المطروح الذي لم يصله الفرعُ يصير رمادياً 🔒
 * بسببه، لا يُختار ولا يُخفى (يراه الأستاذ ويضع عليه 🌟). ما قيّده المسؤولُ أصلاً يبقى بقيده.
 */
export function withReach<V extends { selectable: boolean; hidden: boolean; line: string; icon: string }>(view: V, reach: Pick<CourseReach, "state" | "reason"> | null | undefined): V & { reach?: "locked" } {
  if (!view.selectable || !reachLocked(reach)) return view;
  return { ...view, selectable: false, hidden: false, icon: "🔒", line: reach!.reason, reach: "locked" };
}
