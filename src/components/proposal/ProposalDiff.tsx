/**
 * ── «ما تغيّر» بنظرة: أربعةُ أرقامٍ برموزها ─────────────────────────────────
 *
 * مضاف · منقول · يخرج · ثابت — كلُّها من مقارنة الجدول الأصلي بالناتج
 * (`proposalChangeSet`) لا من عدّ العمليات. الضغطُ على رقمٍ يُبرز مواعيده على
 * الجدول، والضغطُ مرةً أخرى يلغي الإبراز.
 */
import React from "react";
import { Equal, LogOut, MoveHorizontal, Plus, Repeat2 } from "lucide-react";
import type { ProposalChangeKind } from "../../utils/studyProposal";
import type { Workspace } from "./useProposalWorkspace";
import { num } from "./proposalFormat";

const CHIPS: Array<{ kind: ProposalChangeKind | "unchanged"; label: string; Icon: React.ComponentType<any> }> = [
  { kind: "added", label: "مضاف", Icon: Plus },
  { kind: "moved", label: "منقول", Icon: MoveHorizontal },
  { kind: "replaced", label: "بديل", Icon: Repeat2 },
  { kind: "removed", label: "يخرج", Icon: LogOut },
  { kind: "unchanged", label: "ثابت", Icon: Equal },
];

export default function ProposalDiffStrip({ ws, onPick }: { ws: Workspace; onPick?: () => void }) {
  const set = ws.changes;
  const count = (kind: ProposalChangeKind | "unchanged") => (kind === "unchanged" ? set.unchanged.filter(item => item.state === "current").length : set[kind].length);
  return (
    <div className="sp-diff-strip" role="group" aria-label="ما تغيّر عن الجدول الأصلي" data-empty={set.all.length === 0 || undefined}>
      {CHIPS.map(({ kind, label, Icon }) => {
        const n = count(kind);
        if (kind === "replaced" && !n) return null;
        const on = kind !== "unchanged" && ws.focusChange === kind;
        return (
          <button key={kind} type="button" className="sp-diff-chip" data-kind={kind} data-zero={n === 0 || undefined} aria-pressed={on}
            disabled={kind === "unchanged" || n === 0}
            onClick={() => { ws.setFocusChange(on ? null : (kind as ProposalChangeKind)); ws.setFocusOpId(null); ws.setFocusFindingId(null); onPick?.(); }}
            aria-label={`${label}: ${num(n)}`} data-guide-ignore="يُبرز هذا الصنف من التغييرات على الجدول — لا يكتب شيئاً">
            <span className="sp-diff-icon" aria-hidden="true"><Icon /></span>
            <b className="sp-num">{num(n)}</b>
            <small>{label}</small>
          </button>
        );
      })}
    </div>
  );
}
