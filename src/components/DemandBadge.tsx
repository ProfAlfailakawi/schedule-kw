/**
 * ── شارة الطلب الفعلي على المقرر في «مراجعة الاعتماد» ──
 * صغيرة: عجزٌ بالشعب (أحمر)، أو خريجون بلا مقعد (ذهبي)، أو فائض (هادئ)، أو ✓ متوازن.
 * الأرقام من الخادم (src/utils/actualDemandSupply.ts)؛ المراجعة تقرؤها مرةً وتوزّعها بالسياق.
 */
import React, { createContext, useContext } from "react";
import { ArrowLeftRight, CircleCheck, GraduationCap, TrendingDown, Users } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import { demandBadgeTone, type CourseDemandFact } from "../utils/actualDemandSupply";

export const DemandFactsContext = createContext<Record<string, CourseDemandFact> | null>(null);

export default function DemandBadge({ courseId }: { courseId: number }) {
  const facts = useContext(DemandFactsContext);
  const fact = facts?.[String(courseId)];
  if (!fact) return null;
  const title = `الطلب الفعلي: ${countOf(fact.students, AR.student)} · ${countOf(fact.seats, AR.seat)}`;
  const tone = demandBadgeTone(fact);
  if (tone === "grad") {
    return <span className="demand-badge is-grad" title={`${title} · ${countOf(fact.unmetGraduates, AR.graduate)} بلا مقعد`} aria-label={`${countOf(fact.unmetGraduates, AR.graduate)} بلا مقعد`}>
      <GraduationCap aria-hidden="true" /><bdi>{fact.unmetGraduates}</bdi>
    </span>;
  }
  /* طلبٌ بلا مقعد يبقى عجزاً حتى يُنفَّذ النقل المقترح: لا أخضر قبل ذلك. */
  if (tone === "short") {
    const short = fact.gap > 0 ? fact.gap : 0;
    const label = short ? `ينقصه ${countOf(short, AR.section)}` : `${countOf(fact.unmetStudents, AR.student)} بلا مقعد · نقلُ شعبةٍ مقترح`;
    return <span className="demand-badge is-short" title={`${title} · ${label}`} aria-label={label}>
      <Users aria-hidden="true" /><bdi>{short ? `−${short}` : `−${fact.unmetStudents}`}</bdi>{short ? null : <ArrowLeftRight aria-hidden="true" />}
    </span>;
  }
  if (tone === "spare") {
    return <span className="demand-badge is-spare" title={title} aria-label={`فائض ${countOf(-fact.gap, AR.section)}`}>
      <TrendingDown aria-hidden="true" /><bdi>+{-fact.gap}</bdi>
    </span>;
  }
  return <span className="demand-badge is-ok" title={title} aria-label="الطلب مخدوم"><CircleCheck aria-hidden="true" /></span>;
}
