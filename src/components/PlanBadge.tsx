import React from "react";
import { planBadgeOf, serviceDepartmentsOf, usePlanBadges } from "../utils/planBadges";

/** شارةٌ صغيرةٌ نحيفة «صحيفة 2026» بجانب المقرر؛ لا ترسم شيئاً إن لم يكن للمقرر شارة. */
export default function PlanBadge({ courseId, text }: { courseId?: unknown; text?: string }) {
  const badges = usePlanBadges();
  const label = text ?? planBadgeOf(badges, courseId);
  const service = text === undefined ? serviceDepartmentsOf(courseId) : [];
  return <>
    {label ? <span className="plan-badge" title="مقرر الصحيفة الجديدة">{label}</span> : null}
    {service.length ? <span className="course-service-badge" title={`متطلب في صحائف: ${service.join("، ")}`}>متطلب لأقسام أخرى</span> : null}
  </>;
}
