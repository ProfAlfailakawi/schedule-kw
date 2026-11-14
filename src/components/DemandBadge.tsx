/**
 * ── شارة تخطيط الشعب على المقرر في «مراجعة الاعتماد» ──
 * صغيرة: شعبُ خريجين ناقصة (ذهبي)، أو ينقصه (أزرق)، أو فائض (هادئ)، أو ✓ متوازن.
 * الأرقام من الخادم (src/utils/sectionPlan.ts)؛ المراجعة تقرؤها مرةً وتوزّعها بالسياق.
 */
import React, { createContext, useContext } from "react";
import { CalendarPlus, CircleCheck, GraduationCap, TrendingDown } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import type { PlanCourseFact } from "../utils/sectionPlan";

export const DemandFactsContext = createContext<Record<string, PlanCourseFact> | null>(null);

export default function DemandBadge({ courseId }: { courseId: number }) {
  const facts = useContext(DemandFactsContext);
  const fact = facts?.[String(courseId)];
  if (!fact || fact.tier === "nocap") return null;
  const title = `تخطيط الشعب: ${countOf(fact.students, AR.student)} · مطروح ${fact.offered} من ${fact.required}`;
  if (fact.tier === "grad") {
    const label = `ينقص الخريجين ${countOf(fact.gradShort, AR.section)}`;
    return <span className="demand-badge is-grad" title={`${title} · ${label}`} aria-label={label}><GraduationCap aria-hidden="true" /><bdi>{fact.gradShort}</bdi></span>;
  }
  if (fact.tier === "short") {
    const label = `ينقصه ${countOf(fact.gap, AR.section)}`;
    return <span className="demand-badge is-short" title={`${title} · ${label}`} aria-label={label}><CalendarPlus aria-hidden="true" /><bdi>−{fact.gap}</bdi></span>;
  }
  if (fact.tier === "surplus") {
    const label = `فائض ${countOf(-fact.gap, AR.section)}`;
    return <span className="demand-badge is-spare" title={`${title} · ${label}`} aria-label={label}><TrendingDown aria-hidden="true" /><bdi>+{-fact.gap}</bdi></span>;
  }
  return <span className="demand-badge is-ok" title={title} aria-label="شعبه كافية"><CircleCheck aria-hidden="true" /></span>;
}
