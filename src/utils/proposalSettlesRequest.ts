/**
 * ── تثبيتُ المقترح الدراسي يُغلق بنودَ الطلب التي جاء منها ─────────────────────
 *
 * كان تثبيتُ المقترح يكتب الجدولَ ويضيف سطراً إلى سجلّ الطلب فقط: بندُ الأستاذ الأصلي يبقى «بانتظار قرارك»
 * وحجزُه قائماً، فيُردّ «ثبّت» عليه بعدها بـ«تغيّر الموعد». فالبندُ الذي عالجه المقترح يُثبَّت معه في المعاملة
 * نفسها (repository.commitStudyProposal) ويُفكّ حجزُه، ويُعاد مفتوحاً إن تُراجع عن التثبيت.
 *
 * أيُّ بندٍ عالجه المقترح؟
 *   • البندُ الذي فُتح منه المقترح (itemIndex).
 *   • تعديلٌ أو حذفٌ لموعدٍ نقله المقترح (edit) أو أخرجه (replace ← out).
 *   • إضافةُ مقرّرٍ أدخله المقترح (assign / create / replace الداخل) — للمقرّر نفسه.
 * وما قُرّر من قبل (ثبّت أو رفض) لا يُمسّ. القاعدةُ خالصةٌ بلا قاعدة بيانات.
 */
import type { InstructorRequest, InstructorRequestEventKind, StudyProposalOp } from "../types";
import { requestFullySettled } from "./instructorRequestVerdict";

export const PROPOSAL_SETTLED_NOTE = "ثُبّت عبر مقترحٍ دراسيّ وافقتَ عليه.";

export function proposalSettledIndexes(request: Pick<InstructorRequest, "items">, proposal: { itemIndex?: number | null }, ops: readonly StudyProposalOp[]): number[] {
  const moved = new Set(ops.filter(op => op.kind === "edit" && op.source).map(op => Number(op.source!.id)));
  const removed = new Set(ops.filter(op => op.out).map(op => Number(op.out!.snapshot.id)));
  const added = new Set(ops.filter(op => op.kind !== "edit").map(op => Number(op.target.AdCourseId)));
  const out: number[] = [];
  (request.items || []).forEach((item, index) => {
    if (!item || item.action === "keep" || item.decision?.state) return;
    const explicit = proposal.itemIndex != null && Number(proposal.itemIndex) === index;
    const hit = explicit
      || (item.action === "change" && item.rowId != null && (moved.has(Number(item.rowId)) || removed.has(Number(item.rowId))))
      || (item.action === "delete" && item.rowId != null && removed.has(Number(item.rowId)))
      || (item.action === "add" && added.has(Number(item.after?.courseId || 0)));
    if (hit) out.push(index);
  });
  return out;
}

/** الطلبُ بعد تثبيت المقترح، أو null إن لم يعالج المقترحُ بنداً معلّقاً منه. */
export function settleRequestFromProposal(request: InstructorRequest, proposal: { id: string; itemIndex?: number | null }, ops: readonly StudyProposalOp[], at: string, by: string): InstructorRequest | null {
  const indexes = proposalSettledIndexes(request, proposal, ops);
  if (!indexes.length) return null;
  const editOf = new Map(ops.filter(op => op.kind === "edit" && op.source).map(op => [Number(op.source!.id), op] as const));
  const items = request.items.map((item, index) => {
    if (!indexes.includes(index)) return item;
    const op = item.rowId != null ? editOf.get(Number(item.rowId)) : undefined;
    const fixedAs = op ? { days: [...op.target.days].map(String), start: String(op.target.fstarttime).slice(0, 5), end: String(op.target.fendtime).slice(0, 5) } : undefined;
    return { ...item, decision: { state: "fixed" as const, decidedBy: by, decidedAt: at, viaProposal: proposal.id, note: PROPOSAL_SETTLED_NOTE, ...(fixedAs ? { fixedAs } : {}) } };
  });
  const timeline = [...(request.timeline || []), ...indexes.map(itemIndex => ({ kind: "item-fixed" as InstructorRequestEventKind, at, by, itemIndex }))];
  const settled = requestFullySettled(items);
  if (settled) timeline.push({ kind: "settled" as InstructorRequestEventKind, at, by });
  return { ...request, items, timeline, status: settled ? "settled" : "in-review" };
}

/** التراجعُ عن تثبيت المقترح: ما ثبّته هو وحده يعود معلّقاً كما كان. */
export function reopenRequestFromProposal(request: InstructorRequest, proposalId: string, at: string, by: string): InstructorRequest | null {
  const indexes = (request.items || []).map((item, index) => item?.decision?.viaProposal === proposalId ? index : -1).filter(index => index >= 0);
  if (!indexes.length) return null;
  const items = request.items.map((item, index) => indexes.includes(index) ? { ...item, decision: undefined } : item);
  return { ...request, items, status: request.submittedAt ? "in-review" : request.status,
    timeline: [...(request.timeline || []), ...indexes.map(itemIndex => ({ kind: "item-reopened" as InstructorRequestEventKind, at, by, itemIndex }))] };
}
