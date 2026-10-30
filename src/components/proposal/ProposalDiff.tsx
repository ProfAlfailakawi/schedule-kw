/**
 * ── «ما تغيّر» بسطرٍ واحد ──────────────────────────────────────────────────
 *
 * مضاف · منقول · بديل · يخرج · ثابت — كلُّها من مقارنة الجدول الأصلي بالناتج
 * (`proposalChangeSet`) لا من عدّ العمليات. سطرٌ واحد هادئ: ما كان صفراً لا
 * يُرسم، وحين لا يتغيّر شيء يقول «لا تغييرات بعد». الضغطُ على صنفٍ يُبرز
 * مواعيده على الجدول، والضغطُ مرةً أخرى يلغي الإبراز.
 */
import React from "react";
import { CircleDashed, Equal, LogOut, MoveHorizontal, Plus, Repeat2 } from "lucide-react";
import type { ProposalChangeKind } from "../../utils/studyProposal";
import { AR, countOf } from "../../utils/arabicCount";
import type { Workspace } from "./useProposalWorkspace";
import { num } from "./proposalFormat";

const KINDS: Array<{ kind: ProposalChangeKind; label: string; Icon: React.ComponentType<any> }> = [
  { kind: "added", label: "مضاف", Icon: Plus },
  { kind: "moved", label: "منقول", Icon: MoveHorizontal },
  { kind: "replaced", label: "بديل", Icon: Repeat2 },
  { kind: "removed", label: "يخرج", Icon: LogOut },
];

export default function ProposalDiffStrip({ ws, onPick }: { ws: Workspace; onPick?: () => void }) {
  const set = ws.changes;
  const still = set.unchanged.filter(item => item.state === "current").length;
  const shown = KINDS.map(entry => ({ ...entry, n: set[entry.kind].length })).filter(entry => entry.n > 0);
  if (!shown.length) {
    return (
      <div className="sp-diff-line" role="group" aria-label="ما تغيّر عن الجدول الأصلي" data-empty
        title={still ? `${countOf(still, AR.appointment)} في جدوله الحالي` : undefined}>
        <span className="sp-diff-none"><CircleDashed aria-hidden="true" />لا تغييرات بعد</span>
      </div>
    );
  }
  return (
    <div className="sp-diff-line" role="group" aria-label={`ما تغيّر عن الجدول الأصلي: ${countOf(set.all.length, AR.change)}`}>
      {shown.map(({ kind, label, Icon, n }) => {
        const on = ws.focusChange === kind;
        return (
          <button key={kind} type="button" className="sp-diff-chip" data-kind={kind} aria-pressed={on}
            onClick={() => { ws.setFocusChange(on ? null : kind); ws.setFocusOpId(null); ws.setFocusFindingId(null); onPick?.(); }}
            aria-label={`${label}: ${num(n)} — ${on ? "إلغاء الإبراز" : "أبرزها في الجدول"}`} title={on ? "إلغاء الإبراز" : "أبرزها في الجدول"}
            data-guide-ignore="يُبرز هذا الصنف من التغييرات على الجدول — لا يكتب شيئاً">
            <span className="sp-diff-icon" aria-hidden="true"><Icon /></span>
            <b className="sp-num">{num(n)}</b>
            <small>{label}</small>
          </button>
        );
      })}
      {still ? (
        <span className="sp-diff-still" aria-label={`ثابت: ${num(still)}`}>
          <span className="sp-diff-icon" aria-hidden="true"><Equal /></span><b className="sp-num">{num(still)}</b><small>ثابت</small>
        </span>
      ) : null}
    </div>
  );
}
