import PlanBadge from "../PlanBadge";
/**
 * ── قائمةُ مواد المقترح (بطاقاتٌ مختصرة) ────────────────────────────────────
 *
 * تبقى ظاهرةً بجانب النموذج: كلُّ مادةٍ بنوع عمليتها وأيامها وأوقاتها وحالة
 * فحصها. «إزالة» هنا تُزيل المادة من المسودة وحدها — لا تلمس الجدول الفعلي.
 */
import React from "react";
import {
  AlertTriangle, ArrowLeft, ArrowLeftRight, Check, LogOut, CircleHelp, Clock, FilePlus2, GitCompareArrows, Hourglass, Pencil, Send, ShieldCheck, Trash2, UserRoundPlus, Wand2, MessageSquareWarning, ThumbsUp,
} from "lucide-react";
import type { StudyProposalOp, StudyProposalOpKind } from "../../types";
import { OP_KIND_LABEL, daysOf, placeLabel, type GridItem, type ProposalEvaluation } from "../../utils/studyProposal";
import { SlotPill } from "./ProposalWeekGrid";
import type { Workspace } from "./useProposalWorkspace";
import { num } from "./proposalFormat";

const KIND_ICON: Record<StudyProposalOpKind, React.ComponentType<any>> = {
  assign: UserRoundPlus, create: FilePlus2, edit: Pencil, replace: ArrowLeftRight,
};

type OpState = "ok" | "blocked" | "review" | "unchecked" | "checking";

export function opState(ws: Workspace, opId: string): OpState {
  if (!ws.evalCurrent) return ws.evalState === "failed" ? "unchecked" : "checking";
  return (ws.evaluation!.perOp[opId]?.state || "unchecked") as OpState;
}

const STATE_TEXT: Record<OpState, { text: string; Icon: React.ComponentType<any> }> = {
  ok: { text: "لا موانع", Icon: Check },
  blocked: { text: "مانع", Icon: AlertTriangle },
  review: { text: "للمراجعة", Icon: CircleHelp },
  unchecked: { text: "غير مفحوص", Icon: CircleHelp },
  checking: { text: "جاري الفحص", Icon: Hourglass },
};

function OpCard({ ws, op, onEdit }: { key?: React.Key; ws: Workspace; op: StudyProposalOp; onEdit?: (opId: string) => void }) {
  const t = op.target;
  const state = opState(ws, op.id);
  const { text, Icon: StateIcon } = STATE_TEXT[state];
  const Kind = KIND_ICON[op.kind];
  const place = placeLabel(t);
  const decision = ws.view && ws.proposal && ws.proposal.sentVersion === ws.proposal.version ? ws.view.decision : null;
  const answered = decision ? (decision.approved.includes(op.id) ? "approved" : decision.changes.includes(op.id) ? "changes" : "pending") : null;
  const editing = ws.draft.editingOpId === op.id;
  return (
    <article className="sp-op" data-kind={op.kind} data-state={state} data-focus={ws.focusOpId === op.id || undefined} data-editing={editing || undefined}>
      <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-op-main" onClick={() => {
        ws.setFocusOpId(ws.focusOpId === op.id ? null : op.id);
        const key = op.kind === "create" || (op.kind === "replace" && op.incoming === "create") ? `new:${op.id}` : `row:${op.source?.id}`;
        ws.setSelectedKey(key);
      }} aria-label={`${OP_KIND_LABEL[op.kind]}: ${t.courseName}، اضغط لإبرازها في الجدول`}>
        <span className="sp-op-kind"><Kind aria-hidden="true" />{OP_KIND_LABEL[op.kind]}</span>
        <span className="sp-op-title"><b>{t.courseName}<PlanBadge courseId={t.AdCourseId} /></b><small>{t.courseCode} · شعبة {t.SCode}</small></span>
        {(() => {
          /* قبل ← بعد بنظرة: الموضعُ القديم مشطوباً والجديدُ بارزاً، وما تغيّر منهما مُعلَّم. */
          const change = ws.changes.all.find(c => c.opId === op.id);
          const after: GridItem = change?.after ?? {
            key: "", state: "proposed", rowId: 0, courseName: t.courseName, courseCode: t.courseCode, SCode: t.SCode,
            days: daysOf(t), start: t.fstarttime, end: t.fendtime, place: place.text, placeKnown: place.known,
          };
          const before = change?.before;
          return (
            <span className="sp-op-flow" data-kind={change?.kind || "added"}>
              {before ? <><SlotPill item={before} tone="before" fields={change!.fields} />{change!.kind === "replaced" ? <small className="sp-op-out">{before.courseName} · {before.SCode}</small> : null}<ArrowLeft className="sp-compare-arrow" aria-hidden="true" /></> : null}
              <SlotPill item={after} tone="after" fields={change?.fields || []} />
            </span>
          );
        })()}
        {op.out ? <span className="sp-op-diff" data-out="1"><LogOut aria-hidden="true" />{op.out.action === "delete" ? "حذف الموعد" : "فك الإسناد"}: {op.out.snapshot.courseName} · {op.out.snapshot.SCode}</span> : null}
        {op.note ? <span className="sp-op-note">«{op.note}»</span> : null}
      </button>
      <div className="sp-op-foot">
        <span className="sp-op-state" data-state={state}><StateIcon aria-hidden="true" />{text}</span>
        {answered ? (
          <span className="sp-op-answer" data-answer={answered}>
            {answered === "approved" ? <ThumbsUp aria-hidden="true" /> : answered === "changes" ? <MessageSquareWarning aria-hidden="true" /> : <Clock aria-hidden="true" />}
            {answered === "approved" ? "وافق الأستاذ" : answered === "changes" ? "طلب تعديلاً" : "بانتظار رده"}
          </span>
        ) : null}
        <span className="sp-op-actions">
          {state === "blocked" ? <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-icon-text" onClick={() => ws.loadAlternatives(op.id)}><Wand2 aria-hidden="true" />أوقات بديلة</button> : null}
          <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-icon-text" onClick={() => (onEdit ? onEdit(op.id) : ws.editOp(op.id))} aria-label={`تعديل مادة ${t.courseName}`}><Pencil aria-hidden="true" />تعديل</button>
          <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-icon-text" data-tone="danger" onClick={() => ws.removeOp(op.id)} aria-label={`إزالة ${t.courseName} من المسودة`}><Trash2 aria-hidden="true" />إزالة</button>
        </span>
      </div>
    </article>
  );
}

/** الطريقُ من الفراغ إلى الإرسال، بثلاث محطات — رسمٌ لا شرح. */
const EMPTY_STEPS: Array<{ text: string; Icon: React.ComponentType<any> }> = [
  { text: "أضف شعبة أو أسند شاغرة", Icon: FilePlus2 },
  { text: "راجع الفحص", Icon: ShieldCheck },
  { text: "معاينة وإرسال", Icon: Send },
];

export default function ProposalOps({ ws, onEdit, emptyActions }: { ws: Workspace; onEdit?: (opId: string) => void; emptyActions?: React.ReactNode }) {
  if (!ws.ops.length) {
    return (
      <section className="sp-ops sp-ops-empty" aria-label="مواد المقترح">
        <div className="sp-empty">
          <span className="sp-empty-art" aria-hidden="true"><GitCompareArrows /></span>
          <p className="sp-empty-title"><b>لا تغييرات بعد.</b> أسند شعبةً شاغرة أو أضف شعبة؛ يظهر أثرها على الجدول فوراً.</p>
          <ol className="sp-empty-steps" aria-label="خطوات المقترح">
            {EMPTY_STEPS.map(({ text, Icon }, index) => (
              <li key={text}><span className="sp-empty-step-num" aria-hidden="true"><Icon /></span><span><small>{num(index + 1)}</small>{text}</span></li>
            ))}
          </ol>
          {emptyActions ? <div className="sp-empty-actions">{emptyActions}</div> : null}
        </div>
      </section>
    );
  }
  return (
    <section className="sp-ops" aria-label="مواد المقترح">
      <ul>{ws.ops.map(op => <li key={op.id}><OpCard ws={ws} op={op} onEdit={onEdit} /></li>)}</ul>
    </section>
  );
}

export type { ProposalEvaluation };
