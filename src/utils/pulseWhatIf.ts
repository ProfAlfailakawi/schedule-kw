/**
 * ── «ماذا لو، باللمس»: حكم الإفلات ومكدّس المعاينة (نقيّ بلا React ولا three.js) ──
 *
 * تُسحب شعبةٌ من قاعتها إلى قاعةٍ أخرى داخل المجسّم، فيُسأل هذا الملف:
 *  - ما حال كل قاعةٍ لهذه الشعبة؟ أخضر (من نوعها، تتّسع، فارغة في أيامها كلها طوال وقتها)،
 *    وكهرماني (فارغة ومن نوعها لكنها ضيّقة أو واسعة عليها)، وأحمر (تعارض أو نوعٌ آخر أو لا تتّسع)
 *    — مع سببٍ في سطرٍ واحد قصير. الحكم بالقواعد نفسها في «رتّب قاعاتي» (typeFits، hallFreeFor).
 *  - ومكدّس النقلات قبل الحفظ: تُضاف نقلة، ويُتراجع عن الأخيرة، ويُلغى الكل؛ والصافي منها
 *    (من الجدول إلى آخر قاعة) يصير خطةً بصيغة «رتّب قاعاتي» نفسها (DayPlan) تُراجع وتُحفظ من
 *    المسار المعتاد (/api/schedules/move-batch) عند الشاشة، لا من هنا.
 *  - وأثر المعاينة: المضغوطة والتناسب قبل وبعد، والانتقالات الضيّقة في مسارات التنقّل قبل وبعد.
 *
 * لا يكتب هذا الملف شيئاً ولا يقرأ من الخادم.
 */
import {
  PULSE_DAYS, clockText, fitClass, metrics, typeFits,
  type Assignment, type DayPlan, type PlanGroup, type PlanMove, type PulseDay, type PulseHall, type PulseModel, type PulseSession,
} from "./hallPulse";
import type { MovePath } from "./movementPaths";
import { AR, countOf } from "./arabicCount";

export type DropTone = "green" | "amber" | "red" | "same";
export interface DropStatus { tone: DropTone; reason: string }
export interface WhatIfMove { sessionId: number; from: string; to: string }

/** ضغطةٌ مطوّلة تلتقط الشعبة: 300ms باللمس (لا تُخلط بتدوير الكاميرا)، وأقصر بالفأرة. */
export const LONG_PRESS_TOUCH_MS = 300;
export const LONG_PRESS_MOUSE_MS = 180;
/** أقصى ما يُراجع في حفظٍ واحد (كحدّ «حفظ الكل» في المراجعة). */
export const WHATIF_MAX = 60;

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;
const dayShort = (d: PulseDay) => PULSE_DAYS.find(x => x.key === d)?.label || "";
const nf = (v: number) => Math.round(v).toLocaleString("ar-KW-u-nu-latn");

/** أول ما يمنع القاعة لهذه الشعبة: شعبةٌ أخرى فيها في وقتٍ متداخل، أو جهةٌ أخرى. */
function firstClash(model: PulseModel, assignment: Assignment, hallKey: string, session: PulseSession): string {
  for (const other of model.sessions) {
    if (other.id === session.id || (assignment.get(other.id) || other.hallKey) !== hallKey) continue;
    const day = other.days.find(d => session.days.includes(d));
    if (day && overlaps(other, session)) {
      return `تتعارض مع ${other.courseName}${other.sectionCode ? ` ش ${other.sectionCode}` : ""}، ${dayShort(day)} ${clockText(other.start)}`;
    }
  }
  for (const w of model.foreignBusy.get(hallKey) || []) {
    if (session.days.includes(w.day) && session.start < w.to && w.from < session.end) return `تشغلها جهةٌ أخرى، ${dayShort(w.day)} ${clockText(w.from)}`;
  }
  return "";
}

/**
 * حال القاعة لهذه الشعبة على الإسناد الحالي (بما فيه نقلات المعاينة). الأحمر يمنع الإفلات،
 * والسبب سطرٌ واحد: النوع أولاً، ثم السعة، ثم التعارض.
 */
export function dropStatus(model: PulseModel, assignment: Assignment, sessionId: number, hallKey: string): DropStatus {
  const session = model.sessionById.get(sessionId);
  const hall = model.hallByKey.get(hallKey);
  if (!session || !hall) return { tone: "red", reason: "ليست من قاعات المجسّم" };
  if ((assignment.get(sessionId) || session.hallKey) === hallKey) return { tone: "same", reason: "قاعتها الآن" };
  if (hall.foreignSpecialised) return { tone: "red", reason: "قاعةٌ متخصّصة لقسمٍ آخر" };
  if (!hall.capacity) return { tone: "red", reason: "سعتها غير مسجّلة" };
  if (model.checked && !model.checked.has(hallKey)) return { tone: "red", reason: "إشغالها غير مقروء، فلا تُعدّ فارغة" };
  /* النوع بمعزلٍ عن السعة: سعةٌ تكفي افتراضاً، فيبقى الحكم للنوع وحده. */
  if (!typeFits(model, session, { ...hall, capacity: Math.max(hall.capacity, session.students || 0) })) {
    const want = session.expectedType || (model.hallByKey.get(session.hallKey)?.lab ? "مختبر" : "قاعة نظرية");
    const got = hall.type || (hall.lab ? "مختبر" : "قاعة نظرية");
    return { tone: "red", reason: want !== got ? `نوعها «${got}» والشعبة تحتاج «${want}»` : "نوعها لا يناسب الشعبة" };
  }
  if (session.students && hall.capacity < session.students) {
    return { tone: "red", reason: `لا تتّسع: نحو ${countOf(session.students, AR.student)} في ${countOf(hall.capacity, AR.seat)}` };
  }
  const clash = firstClash(model, assignment, hallKey, session);
  if (clash) return { tone: "red", reason: clash };
  if (!session.students) return { tone: "amber", reason: "فارغة ومن نوعها، وعدد طلبة الشعبة غير مسجّل" };
  const cls = fitClass(session.students, hall.capacity);
  const seats = `نحو ${nf(session.students)} في ${nf(hall.capacity)}`;
  if (cls === "fit") return { tone: "green", reason: `تناسبها: ${seats}، فارغة في أيامها كلها` };
  if (cls === "full") return { tone: "amber", reason: `ضيّقة: ${seats}` };
  return { tone: "amber", reason: `واسعة عليها: ${seats}` };
}

/** حال كل قاعات المجسّم لهذه الشعبة (يُحسب مرةً عند الالتقاط). */
export function dropStatuses(model: PulseModel, assignment: Assignment, sessionId: number): Map<string, DropStatus> {
  return new Map(model.halls.map(h => [h.key, dropStatus(model, assignment, sessionId, h.key)]));
}

export interface MoveTarget { hall: PulseHall; status: DropStatus }
const TONE_RANK: Record<DropTone, number> = { green: 0, amber: 1, red: 2, same: 3 };
/** قائمة «انقل إلى…»: الأخضر أولاً ثم الكهرماني ثم الأحمر، والأنسب سعةً أولاً داخل كل لون. */
export function moveTargets(model: PulseModel, assignment: Assignment, sessionId: number): MoveTarget[] {
  const session = model.sessionById.get(sessionId);
  const want = (session?.students || 0) * 1.2;
  return model.halls
    .map(hall => ({ hall, status: dropStatus(model, assignment, sessionId, hall.key) }))
    .filter(t => t.status.tone !== "same")
    .sort((a, b) => TONE_RANK[a.status.tone] - TONE_RANK[b.status.tone]
      || Math.abs((a.hall.capacity || 0) - want) - Math.abs((b.hall.capacity || 0) - want)
      || a.hall.code.localeCompare(b.hall.code, "en", { numeric: true }));
}

/* ── المكدّس ── */
/** الإسناد بعد نقلات المعاينة بالترتيب. */
export function applyWhatIf(base: Assignment, stack: readonly WhatIfMove[]): Assignment {
  const out: Assignment = new Map(base);
  for (const mv of stack) out.set(mv.sessionId, mv.to);
  return out;
}

/**
 * يضيف نقلةً إن لم تكن حمراء على الإسناد الحالي؛ وإلا يعيد المكدّس كما هو مع السبب.
 * لا تُقبل نقلةٌ بعد الحدّ الأقصى للحفظ الواحد.
 */
export function pushWhatIf(model: PulseModel, base: Assignment, stack: readonly WhatIfMove[], sessionId: number, to: string): { stack: WhatIfMove[]; status: DropStatus; accepted: boolean } {
  const current = applyWhatIf(base, stack);
  const status = dropStatus(model, current, sessionId, to);
  const session = model.sessionById.get(sessionId);
  if (!session || status.tone === "red" || status.tone === "same") return { stack: [...stack], status, accepted: false };
  const next = [...stack, { sessionId, from: current.get(sessionId) || session.hallKey, to }];
  if (netWhatIf(model, base, next).length > WHATIF_MAX) return { stack: [...stack], status: { tone: "red", reason: `الحفظ الواحد حتى ${countOf(WHATIF_MAX, { one: "نقلة", two: "نقلتان", few: "نقلات", many: "نقلة" })}: راجع ما لديك واحفظه أولاً` }, accepted: false };
  return { stack: next, status, accepted: true };
}

export const undoWhatIf = (stack: readonly WhatIfMove[]): WhatIfMove[] => stack.slice(0, -1);

/** الصافي: كل شعبةٍ تغيّرت قاعتها من الجدول إلى آخر نقلة (شعبةٌ رجعت إلى قاعتها تسقط). */
export function netWhatIf(model: PulseModel, base: Assignment, stack: readonly WhatIfMove[]): PlanMove[] {
  const after = applyWhatIf(base, stack);
  const order: number[] = [];
  stack.forEach(mv => { if (!order.includes(mv.sessionId)) order.push(mv.sessionId); });
  return order
    .map(id => ({ sessionId: id, from: base.get(id) || model.sessionById.get(id)?.hallKey || "", to: after.get(id) || "" }))
    .filter(mv => mv.from && mv.to && mv.from !== mv.to);
}

/**
 * الصافي خطةٌ بصيغة «رتّب قاعاتي» (DayPlan): مجموعةٌ لكل نقلة، والنقلة التي تدخل قاعةً
 * أفرغتها نقلةٌ قبلها في وقتٍ متداخل تعتمد عليها — فإيقافها في المراجعة يوقف ما بعدها.
 */
export function whatIfPlan(model: PulseModel, base: Assignment, stack: readonly WhatIfMove[], day: PulseDay): DayPlan {
  const moves = netWhatIf(model, base, stack);
  const groups: PlanGroup[] = moves.map((mv, i) => ({ id: i, moves: [mv], deps: [], on: true, start: model.sessionById.get(mv.sessionId)!.start }));
  groups.forEach((g, i) => {
    const s = model.sessionById.get(g.moves[0].sessionId)!;
    for (let j = 0; j < moves.length; j++) {
      if (j === i) continue;
      const o = model.sessionById.get(moves[j].sessionId)!;
      if (moves[j].from === g.moves[0].to && o.days.some(d => s.days.includes(d)) && overlaps(o, s)) g.deps.push(j);
    }
  });
  return { day, groups, unsolved: [] };
}

/**
 * يعيد فحص المكدّس على نموذجٍ تغيّر (حُفظ شيءٌ من مكانٍ آخر): كل نقلةٍ صارت حمراء أو شعبتها
 * غابت تسقط، ويبقى ما يصحّ بترتيبه.
 */
export function revalidateWhatIf(model: PulseModel, base: Assignment, stack: readonly WhatIfMove[]): { stack: WhatIfMove[]; dropped: number } {
  let kept: WhatIfMove[] = [];
  let dropped = 0;
  for (const mv of stack) {
    if (!model.sessionById.has(mv.sessionId) || !model.hallByKey.has(mv.to)) { dropped++; continue; }
    const r = pushWhatIf(model, base, kept, mv.sessionId, mv.to);
    if (r.accepted) kept = r.stack; else if (r.status.tone !== "same") dropped++;
  }
  return { stack: kept, dropped };
}

/* ── الأثر ── */
export interface WhatIfImpact { overBefore: number; overAfter: number; pctBefore: number; pctAfter: number; wasteBefore: number; wasteAfter: number }
/** مقاييس اليوم قبل المعاينة وبعدها (بالحساب نفسه في مراجعة «رتّب قاعاتي»). */
export function whatIfImpact(model: PulseModel, base: Assignment, after: Assignment, day: PulseDay): WhatIfImpact {
  const a = metrics(model, base, day), b = metrics(model, after, day);
  return { overBefore: a.over, overAfter: b.over, pctBefore: a.pct, pctAfter: b.pct, wasteBefore: a.waste, wasteAfter: b.waste };
}

/** الانتقالات الضيّقة في مسارات اليوم (أستاذاً ودفعة). */
export const tightCount = (paths: readonly MovePath[]): number => paths.reduce((t, p) => t + p.hops.filter(h => h.flags.includes("tight")).length, 0);

/** المسارات التي تمرّ بشعبةٍ نُقلت: بها تُبرَز في القائمة وتُعاد قراءتها. */
export function affectedPaths(paths: readonly MovePath[], moved: ReadonlySet<number>): MovePath[] {
  return paths.filter(p => p.stops.some(st => moved.has(st.sessionId)));
}

/**
 * حارس المغادرة: عدد نقلات «ماذا لو» التي لم تُحفظ في المجسّم المفتوح الآن. تكتبه الشاشة،
 * وتقرؤه الورشة حين يُغادَر «مجسّم» إلى عرضٍ آخر فتسأل مرةً واحدة («لديك نقلات لم تُحفظ»).
 */
export const whatIfGuard = { unsaved: 0 };
