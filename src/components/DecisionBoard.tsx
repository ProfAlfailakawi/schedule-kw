import React, { useMemo, useState } from "react";
import { Building2, ChevronDown, Eye, Lightbulb, OctagonAlert, Sparkles, TriangleAlert } from "lucide-react";
import type { AdSection } from "../types";
import { useSectionGap } from "./SectionGapNote";
import PlanTriageView from "./PlanTriageView";
import PredictiveInsightPanel from "./PredictiveInsightPanel";
import AcademicAdvicePanel from "./AcademicAdvicePanel";
import { reconcilePlanAdjustments } from "../utils/sectionGap";
import { triagePlanItems } from "../utils/planTriage";
import { decisionBoardScope, type DecisionBoardReader } from "../utils/decisionBoardScope";

const num = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");

/**
 * ── «لوحة القرار» داخل الاستعلامات (K5) ──────────────────────────────────────
 *
 * The planning tools — the planning shelves, the forecast and the decision lab —
 * were only reachable from the committee's workshop. The department head and the
 * dean decide on the same numbers, so they read them here, read-only:
 *   رئيس القسم  → قسمه، كاملاً.
 *   العميد      → كل أقسام كليته، سطراً لكل قسم يُفتح إلى لوحته.
 *   المدير      → الكلية المختارة كذلك.
 * Nothing here writes: no «تم/تجاهل», no «عالج» into a workshop they do not own,
 * no one-click opening. The server still decides every scope (isScopeAllowed).
 */
function DepartmentRow({ collegeId, section, termId, expanded, onToggle }: {
  collegeId: number; section: AdSection; termId: number; expanded: boolean; onToggle: () => void;
}) {
  const gap = useSectionGap(collegeId, Number(section.AdSectionId), termId);
  const triage = useMemo(() => triagePlanItems(reconcilePlanAdjustments(gap.planItems, gap.planSurplusItems)), [gap.planItems, gap.planSurplusItems]);
  const { counts } = triage;
  return (
    <article className="decision-board-dept" data-open={expanded || undefined}>
      <button type="button" className="decision-board-dept-head" aria-expanded={expanded} onClick={onToggle}
        data-guide-ignore="يفتح لوحة القرار لقسمٍ واحد للقراءة فقط">
        <span className="decision-board-dept-ic" aria-hidden="true"><Building2 /></span>
        <strong>{section.AdSectionName}</strong>
        {!gap.loaded ? <small className="decision-board-wait">…</small> : (
          <span className="decision-board-counts" aria-label={`عاجل ${counts.urgent}، مهم ${counts.important}، فرصة ${counts.opportunity}`}>
            <span className="tier-urgent"><OctagonAlert aria-hidden="true" />{num(counts.urgent)}</span>
            <span className="tier-important"><TriangleAlert aria-hidden="true" />{num(counts.important)}</span>
            <span className="tier-opportunity"><Lightbulb aria-hidden="true" />{num(counts.opportunity)}</span>
          </span>
        )}
        <ChevronDown aria-hidden="true" className="decision-board-chev" />
      </button>
      {expanded ? <DepartmentBoard collegeId={collegeId} sectionId={Number(section.AdSectionId)} termId={termId} triage={triage} loaded={gap.loaded} /> : null}
    </article>
  );
}

function DepartmentBoard({ collegeId, sectionId, termId, triage, loaded }: {
  collegeId: number; sectionId: number; termId: number; triage: ReturnType<typeof triagePlanItems>; loaded: boolean;
}) {
  return (
    <div className="decision-board-body">
      <section className="decision-board-card">
        <h4><Sparkles aria-hidden="true" /> التخطيط</h4>
        {!loaded ? <p className="decision-board-note">جارٍ القراءة…</p>
          : triage.live.length || triage.handled.length
            ? <PlanTriageView triage={triage} readOnly onClose={() => undefined}
                renderItem={(item, actions) => (
                  <li key={item.id} className="decision-board-item">
                    <div className="apb-gap-row">
                      <span className="apb-gap-name"><b>{item.name}</b><small>{item.code}</small></span>
                      <span className="apb-gap-pill"><i>{num(item.existing)}</i><em aria-hidden="true">←</em><b>{num(item.required)}</b></span>
                    </div>
                    {actions}
                  </li>
                )} />
            : <p className="decision-board-note">لا فرق بين الشعب والتخطيط لهذا القسم.</p>}
      </section>
      <section className="decision-board-card">
        <PredictiveInsightPanel canSchedule={false} onChanged={() => undefined} scope={{ mode: "college", collegeId, sectionId }} />
      </section>
      <AcademicAdvicePanel collegeId={collegeId} sectionId={sectionId} termId={termId} />
    </div>
  );
}

export default function DecisionBoard({ reader, collegeId, sectionId, termId, sections }: {
  reader: DecisionBoardReader; collegeId: number; sectionId: number; termId: number; sections: AdSection[];
}) {
  const scope = decisionBoardScope(reader, { collegeId, sectionId, sections });
  const [openId, setOpenId] = useState<number | null>(scope.kind === "department" ? scope.sectionIds[0] || null : null);
  if (scope.kind === "none") {
    return <div className="decision-board-empty"><Eye aria-hidden="true" /><strong>{scope.reason}</strong></div>;
  }
  if (!termId) return <div className="decision-board-empty"><Eye aria-hidden="true" /><strong>اختر الفصل.</strong></div>;
  const shown = sections.filter(section => scope.sectionIds.includes(Number(section.AdSectionId)));
  return (
    <div className="decision-board" data-scope={scope.kind}>
      <p className="decision-board-scope"><Eye aria-hidden="true" /> {scope.label} · للقراءة فقط</p>
      {scope.kind === "department" && shown[0]
        ? <DepartmentRow collegeId={collegeId} section={shown[0]} termId={termId} expanded onToggle={() => undefined} />
        : shown.map(section => (
          <React.Fragment key={section.AdSectionId}>
            <DepartmentRow collegeId={collegeId} section={section} termId={termId}
              expanded={openId === Number(section.AdSectionId)}
              onToggle={() => setOpenId(current => current === Number(section.AdSectionId) ? null : Number(section.AdSectionId))} />
          </React.Fragment>
        ))}
      {!shown.length ? <div className="decision-board-empty"><Eye aria-hidden="true" /><strong>لا أقسام في نطاقك لهذه الكلية.</strong></div> : null}
    </div>
  );
}
