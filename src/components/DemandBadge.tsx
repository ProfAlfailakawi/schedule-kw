/**
 * ── شارة الطلب الفعلي على المقرر في «مراجعة الاعتماد» ──
 * صغيرة: عجزٌ بالشعب (أحمر)، أو خريجون بلا مقعد (ذهبي)، أو فائض (هادئ)، أو ✓ متوازن.
 * الأرقام من الخادم (src/utils/actualDemandSupply.ts)؛ المراجعة تقرؤها مرةً وتوزّعها بالسياق.
 */
import React, { createContext, useContext } from "react";
import { CircleCheck, GraduationCap, TrendingDown, Users } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import type { CourseDemandFact } from "../utils/actualDemandSupply";

export const DemandFactsContext = createContext<Record<string, CourseDemandFact> | null>(null);

export default function DemandBadge({ courseId }: { courseId: number }) {
  const facts = useContext(DemandFactsContext);
  const fact = facts?.[String(courseId)];
  if (!fact) return null;
  const title = `الطلب الفعلي: ${countOf(fact.students, AR.student)} · ${countOf(fact.seats, AR.seat)}`;
  if (fact.unmetGraduates > 0) {
    return <span className="demand-badge is-grad" title={`${title} · ${countOf(fact.unmetGraduates, AR.graduate)} بلا مقعد`} aria-label={`${countOf(fact.unmetGraduates, AR.graduate)} بلا مقعد`}>
      <GraduationCap aria-hidden="true" /><bdi>{fact.unmetGraduates}</bdi>
    </span>;
  }
  if (fact.gap > 0) {
    return <span className="demand-badge is-short" title={title} aria-label={`ينقصه ${countOf(fact.gap, AR.section)}`}>
      <Users aria-hidden="true" /><bdi>−{fact.gap}</bdi>
    </span>;
  }
  if (fact.gap < 0) {
    return <span className="demand-badge is-spare" title={title} aria-label={`فائض ${countOf(-fact.gap, AR.section)}`}>
      <TrendingDown aria-hidden="true" /><bdi>+{-fact.gap}</bdi>
    </span>;
  }
  return <span className="demand-badge is-ok" title={title} aria-label="الطلب مخدوم"><CircleCheck aria-hidden="true" /></span>;
}
