/**
 * ── «تراجع» عن قرارٍ صدر من وارد الأساتذة ─────────────────────────────────────
 *
 * قراراتٌ خالصةٌ بلا قاعدة بيانات (فتُختبر وحدها) يقوم عليها مسارُ `/undo-decision`:
 *   • متى يُعرض «تراجع» وممّن يُقبل (مهلةٌ واحدةٌ هنا، لا في ملفين).
 *   • ما الذي كتبه التثبيتُ فيُسجَّل عند الكتابة (`undoStepsOf`) فيُعكس بالضبط عند التراجع.
 *   • هل ما زالت صفوفُ الجدول كما تركها التثبيت (`planUndoSteps`)؛ وإلا يُرفض التراجعُ ولا يُخمَّن.
 * ما لا يُعكس بأمان يُرفض بسببه الصريح: تثبيتٌ من «الجدول» أو من مقترح (لهما مساراهما)،
 * وتثبيتٌ سبق هذه الميزة (لا لقطةَ له)، وبندٌ ردّ عليه الأستاذ بعد القرار.
 */
import type { FSchedule, InstructorRequestItem, InstructorRequestUndo, InstructorRequestUndoStep } from "../types";
import type { RequestReservation, RequestReservationProposal } from "./instructorRequestReservations";

/** مهلةُ «تراجع» بعد القرار — الموضعُ الوحيد لهذا الرقم. */
export const INBOX_UNDO_WINDOW_MS = 15 * 60_000;

export type UndoRefusalCode =
  | "no-decision" | "other-path" | "window-closed" | "instructor-acted" | "not-recorded" | "rows-changed";

export type UndoVerdict =
  | { ok: true; kind: "fixed" | "rejected" }
  | { ok: false; code: UndoRefusalCode; message: string };

/** ما بقي من المهلة بالمللي ثانية (صفرٌ إن انتهت أو لم يُعرف وقتُ القرار). */
export function undoWindowLeftMs(decidedAt: string | undefined, now: number = Date.now()): number {
  const at = Date.parse(String(decidedAt || ""));
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, Math.min(INBOX_UNDO_WINDOW_MS, at + INBOX_UNDO_WINDOW_MS - now));
}

const refuse = (code: UndoRefusalCode, message: string): UndoVerdict => ({ ok: false, code, message });

/** ردٌّ من الأستاذ (أو اختيارُه بديلاً) بعد لحظة القرار: التراجعُ كان سيُيتّم ما قاله. */
export function instructorActedAfter(item: Pick<InstructorRequestItem, "thread" | "chosenAlternative">, decidedAt: string | undefined): boolean {
  if (item.chosenAlternative) return true;
  const at = Date.parse(String(decidedAt || ""));
  return (item.thread || []).some(message => message?.from === "instructor"
    && (!Number.isFinite(at) || Date.parse(String(message.at || "")) >= at));
}

/** هل يقبل هذا البندُ «تراجع» الآن؟ لا يفحص الجدول (ذلك في `planUndoSteps` وداخل المعاملة). */
export function classifyUndo(item: InstructorRequestItem | undefined, now: number = Date.now()): UndoVerdict {
  const decision = item?.decision;
  if (!item || (decision?.state !== "fixed" && decision?.state !== "rejected")) return refuse("no-decision", "لا يوجد قرارٌ على هذا البند للتراجع عنه.");
  if (decision.fromSchedule || decision.cancelled || decision.reopenTo || decision.viaProposal) {
    return refuse("other-path", decision.viaProposal
      ? "ثُبّت هذا البند عبر مقترحٍ دراسيّ؛ التراجعُ عنه من المقترح نفسه."
      : "قرارُ هذا البند صدر من «الجدول الدراسي»؛ التراجعُ عنه من هناك.");
  }
  if (undoWindowLeftMs(decision.decidedAt, now) <= 0) return refuse("window-closed", "انتهت مهلة التراجع عن هذا القرار.");
  if (instructorActedAfter(item, decision.decidedAt)) {
    return refuse("instructor-acted", "ردّ الأستاذ على هذا البند بعد القرار؛ لا يُتراجع عنه حتى لا يضيع ردُّه.");
  }
  if (!decision.undo || !Array.isArray(decision.undo.steps)) {
    return refuse("not-recorded", decision.state === "fixed"
      ? "لم تُحفظ لقطةُ ما كُتب في الجدول لهذا التثبيت (ثُبّت من الورشة أو قبل هذه الميزة)؛ أعد الموعد من الجدول الدراسي."
      : "صدر هذا الرفضُ قبل ميزة التراجع؛ لا لقطةَ لحجزه لإعادته.");
  }
  return { ok: true, kind: decision.state };
}

/** مثالُ ما تكتبه معاملةُ التثبيت: عمليةٌ لكل صفٍّ تخصّ بنداً. */
export interface UndoOp {
  kind: "update" | "create" | "delete";
  itemIndex: number;
  /** الصفُّ الأصلي لـ update وdelete. */
  original?: FSchedule;
}

/**
 * لقطةُ بندٍ واحد: `ops` بترتيبها، و`written` ما كتبته المعاملةُ فعلاً (create وupdate بالترتيب نفسه، بلا delete)
 * بأرقامها وأختامها. فيُعكس كلُّ شيءٍ كتبه التثبيتُ لهذا البند وحده، لا لجاره في السلسلة.
 */
export function undoStepsOf(ops: readonly UndoOp[], written: readonly FSchedule[], itemIndex: number): InstructorRequestUndoStep[] {
  const steps: InstructorRequestUndoStep[] = [];
  let cursor = 0;
  for (const op of ops) {
    const row = op.kind === "delete" ? undefined : written[cursor++];
    if (op.itemIndex !== itemIndex) continue;
    if (op.kind === "delete" && op.original) steps.push({ kind: "readd", rowId: Number(op.original.id), before: op.original });
    else if (op.kind === "update" && row && op.original) steps.push({ kind: "restore", rowId: Number(row.id), rev: Number(row.rev || 0), before: op.original });
    else if (op.kind === "create" && row) steps.push({ kind: "remove", rowId: Number(row.id), rev: Number(row.rev || 0) });
  }
  return steps;
}

export type UndoPlan =
  | { ok: true; restore: Array<{ step: InstructorRequestUndoStep; live: FSchedule }>; remove: Array<{ step: InstructorRequestUndoStep; live: FSchedule }>; readd: InstructorRequestUndoStep[] }
  | { ok: false; code: "rows-changed"; message: string; rowId: number };

/**
 * هل ما كتبه التثبيتُ ما زال كما تركه؟ المعدَّلُ والمضافُ بختمهما، والمحذوفُ ما زال غائباً.
 * أيُّ اختلافٍ (عدّله زميلٌ، أو حُذف، أو أُعيد استعمالُ رقمه) يرفض الخطةَ كلَّها.
 */
export function planUndoSteps(steps: readonly InstructorRequestUndoStep[], week: readonly FSchedule[]): UndoPlan {
  const byId = new Map(week.map(row => [Number(row.id), row] as const));
  const restore: Array<{ step: InstructorRequestUndoStep; live: FSchedule }> = [];
  const remove: Array<{ step: InstructorRequestUndoStep; live: FSchedule }> = [];
  const readd: InstructorRequestUndoStep[] = [];
  const changed = (rowId: number): UndoPlan => ({ ok: false, code: "rows-changed", rowId,
    message: "تغيّر هذا الموعد في الجدول بعد التثبيت (عدّله أحدٌ أو حُذف)؛ لا يُتراجع عنه حتى لا تضيع تلك التعديلات." });
  for (const step of steps) {
    const live = byId.get(Number(step.rowId));
    if (step.kind === "readd") {
      if (live || !step.before) return changed(step.rowId);
      readd.push(step);
      continue;
    }
    if (!live || Number(live.rev || 0) !== Number(step.rev || 0)) return changed(step.rowId);
    if (step.kind === "restore") { if (!step.before) return changed(step.rowId); restore.push({ step, live }); }
    else remove.push({ step, live });
  }
  return { ok: true, restore, remove, readd };
}

/** الحجزُ الذي أُفرج عند القرار، بما يكفي لإعادة أخذه (القاعةُ نفسُها، لا ترشيحٌ جديد). */
export function holdSnapshotOf(entry: RequestReservation | undefined): InstructorRequestUndo["hold"] {
  if (!entry) return undefined;
  return { itemId: entry.itemId, instructorId: Number(entry.instructorId), collegeId: Number(entry.collegeId), sectionId: Number(entry.sectionId),
    courseId: Number(entry.courseId), slots: (entry.slots || []).map(slot => ({ ...slot })), offeringRowIds: [...(entry.offeringRowIds || [])],
    ...(entry.room ? { room: { ...entry.room } } : {}) };
}

/**
 * حجوزُ الطلب بعد التراجع: ما كان قائماً لبنودٍ أخرى يبقى بقاعته نفسِها (الإسنادُ يستبدل حجوزَ الطلب كلَّها،
 * فتُعاد كما هي)، وبندُ التراجع يعود بحجزه المحفوظ. بندٌ لا حجزَ له قبل القرار لا يُنشأ له حجزٌ الآن.
 */
export function proposalsAfterUndo(next: { id: string; items: InstructorRequestItem[] }, entries: readonly RequestReservation[],
  targetItemId: string, hold: InstructorRequestUndo["hold"], offeringRows?: InstructorRequestItem["offeringRows"]): RequestReservationProposal[] {
  const out: RequestReservationProposal[] = [];
  const asProposal = (entry: NonNullable<InstructorRequestUndo["hold"]>): RequestReservationProposal => ({
    itemId: entry.itemId, instructorId: entry.instructorId, collegeId: entry.collegeId, sectionId: entry.sectionId, courseId: entry.courseId,
    slots: entry.slots, offeringRowIds: entry.offeringRowIds, rooms: entry.room ? [entry.room] : [] });
  for (const entry of entries) {
    if (entry.requestId !== next.id || entry.heldUntil || entry.itemId === targetItemId) continue;
    out.push(asProposal(entry));
  }
  if (hold) {
    const item = next.items.find(candidate => candidate.itemId === targetItemId);
    out.push({ ...asProposal(hold), ...(hold.offeringRowIds.length && (offeringRows || item?.offeringRows) ? { offeringRows: offeringRows || item?.offeringRows } : {}) });
  }
  return out;
}
