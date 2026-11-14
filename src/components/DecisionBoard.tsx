import React, { useEffect, useState } from "react";
import { Building2, CalendarPlus, ChevronDown, CloudOff, Eye, GraduationCap, Sparkles, TrendingDown } from "lucide-react";
import type { AdSection } from "../types";
import SectionPlan, { useSectionPlan, type PlanReadingView } from "./SectionPlan";
import PredictiveInsightPanel from "./PredictiveInsightPanel";
import { decisionBoardScope, type DecisionBoardReader } from "../utils/decisionBoardScope";

const num = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");

/**
 * ما تطبعه «لوحة القرار»: لكل قسمٍ ما تعرضه سطورُه نفسها — العدّاد والمقررات
 * المصنّفة — فلا تُحسب الورقة من غير ما يراه القارئ. كان زرّ الطباعة يطبع
 * ورقةً بلا محتوى، لأن العدسة لم يكن لها ورقة.
 */
/** درجاتُ تخطيط الشعب في الورقة: الخريجون، وما ينقص، وما يفيض (الأسماءُ الداخلية باقيةٌ لثبات الطباعة). */
export type PlanTier = "urgent" | "important" | "opportunity";
export type DecisionBoardPrintItem = { name: string; code: string; existing: number; required: number; tier: PlanTier; reason: string; handled: boolean };
export type DecisionBoardPrintDepartment = {
  collegeId: number; termId: number; sectionId: number; name: string; status: "loading" | "failed" | "ready";
  counts: { urgent: number; important: number; opportunity: number };
  items: DecisionBoardPrintItem[];
};

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
function DepartmentRow({ collegeId, section, termId, expanded, onToggle, onPrintData }: {
  collegeId: number; section: AdSection; termId: number; expanded: boolean; onToggle: () => void;
  onPrintData?: (entry: DecisionBoardPrintDepartment) => void;
}) {
  const { reading, status } = useSectionPlan(collegeId, Number(section.AdSectionId), termId);
  const plan = reading?.plan;
  const counts = { urgent: plan?.totals.gradOpen || 0, important: plan?.totals.open || 0, opportunity: plan?.totals.close || 0 };
  useEffect(() => {
    if (!onPrintData) return;
    const track = (value: string) => (value === "boys" ? "بنين" : value === "girls" ? "بنات" : "");
    onPrintData({
      collegeId, termId, sectionId: Number(section.AdSectionId), name: section.AdSectionName,
      status: status === "error" || status === "denied" ? "failed" : status === "ready" ? "ready" : "loading",
      counts,
      items: (plan?.rows || []).filter(row => row.tier === "grad" || row.tier === "short" || row.tier === "surplus").map(row => ({
        name: row.name, code: row.code, existing: row.offered, required: row.required,
        tier: row.tier === "grad" ? "urgent" as const : row.tier === "short" ? "important" as const : "opportunity" as const,
        reason: [track(row.track), row.tier === "grad" ? `ينقص الخريجين ${row.gradShort}` : row.tier === "short" ? `ينقصه ${row.gap}` : `فائض ${-row.gap}`].filter(Boolean).join(" · "),
        handled: false,
      })),
    });
  }, [onPrintData, collegeId, termId, section.AdSectionId, section.AdSectionName, status, plan]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <article className="decision-board-dept" data-open={expanded || undefined}>
      <button type="button" className="decision-board-dept-head" aria-expanded={expanded} onClick={onToggle}
        data-guide-ignore="يفتح لوحة القرار لقسمٍ واحد للقراءة فقط">
        <span className="decision-board-dept-ic" aria-hidden="true"><Building2 /></span>
        <strong>{section.AdSectionName}</strong>
        {status === "error" || status === "denied" ? <span className="decision-board-failed" aria-label="تعذّرت القراءة"><CloudOff aria-hidden="true" /></span>
          : status === "loading" ? <small className="decision-board-wait">…</small> : plan ? (
          <span className="decision-board-counts" aria-label={`ينقص الخريجين ${counts.urgent}، شعب ناقصة ${counts.important}، فائضة ${counts.opportunity}`}>
            <span className="tier-urgent"><GraduationCap aria-hidden="true" />{num(counts.urgent)}</span>
            <span className="tier-important"><CalendarPlus aria-hidden="true" />{num(counts.important)}</span>
            <span className="tier-opportunity"><TrendingDown aria-hidden="true" />{num(counts.opportunity)}</span>
          </span>
        ) : <small className="decision-board-wait">بلا تقرير</small>}
        <ChevronDown aria-hidden="true" className="decision-board-chev" />
      </button>
      {expanded ? <DepartmentBoard collegeId={collegeId} sectionId={Number(section.AdSectionId)} termId={termId} reading={reading} /> : null}
    </article>
  );
}

function DepartmentBoard({ collegeId, sectionId, termId, reading }: { collegeId: number; sectionId: number; termId: number; reading: PlanReadingView | null }) {
  return (
    <div className="decision-board-body">
      <section className="decision-board-card">
        <h4><Sparkles aria-hidden="true" /> تخطيط الشعب</h4>
        <SectionPlan collegeId={collegeId} sectionId={sectionId} termId={termId} mode="read" reading={reading} />
      </section>
      <section className="decision-board-card">
        <PredictiveInsightPanel canSchedule={false} onChanged={() => undefined} scope={{ mode: "college", collegeId, sectionId }} />
      </section>
    </div>
  );
}

export default function DecisionBoard({ reader, collegeId, sectionId, termId, sections, onPrintData }: {
  reader: DecisionBoardReader; collegeId: number; sectionId: number; termId: number; sections: AdSection[];
  /** يُبلَّغ بما يعرضه كل قسم، لتطبعه الشاشة الأم بالنطاق نفسه. */
  onPrintData?: (entry: DecisionBoardPrintDepartment) => void;
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
        ? <DepartmentRow collegeId={collegeId} section={shown[0]} termId={termId} expanded onToggle={() => undefined} onPrintData={onPrintData} />
        : shown.map(section => (
          <React.Fragment key={section.AdSectionId}>
            <DepartmentRow collegeId={collegeId} section={section} termId={termId}
              expanded={openId === Number(section.AdSectionId)}
              onToggle={() => setOpenId(current => current === Number(section.AdSectionId) ? null : Number(section.AdSectionId))}
              onPrintData={onPrintData} />
          </React.Fragment>
        ))}
      {!shown.length ? <div className="decision-board-empty"><Eye aria-hidden="true" /><strong>لا أقسام في نطاقك لهذه الكلية.</strong></div> : null}
    </div>
  );
}
