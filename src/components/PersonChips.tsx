import React from "react";
import VisitingBadge from "./VisitingBadge";
import { TRAINEE_LABEL } from "../utils/visitingText";

export { TRAINEE_LABEL };

export function TraineeBadge({ compact = true }: { compact?: boolean }) {
  return <span className={`ta-badge${compact ? " compact" : ""}`} title="في مرحلة التدريب">{TRAINEE_LABEL}</span>;
}

/**
 * وسومُ الشخص الموحّدة بعد اسمه، بترتيبٍ واحد في كل مكان: الاسم ← «منتدب» ← «🎓 تدريب».
 * «منتدب» هو VisitingBadge نفسه بلا تغيير؛ و«🎓 تدريب» لمَن طلبُه في النطاق بصفة مرحلة التدريب
 * (linkMode "ta" — src/utils/trainees.ts). بلا غلاف: حيث لا متدرّب يبقى الشكلُ كما كان حرفاً بحرف.
 */
export default function PersonChips({ visiting = false, trainee = false, compact = true }: { visiting?: boolean; trainee?: boolean; compact?: boolean }) {
  if (!visiting && !trainee) return null;
  return <>{visiting ? <VisitingBadge compact={compact} /> : null}{trainee ? <TraineeBadge compact={compact} /> : null}</>;
}
