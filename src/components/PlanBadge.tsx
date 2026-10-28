import React from "react";
import { planBadgeOf, serviceDepartmentsOf, usePlanBadges } from "../utils/planBadges";

/**
 * شارات المقرر الموحّدة (H1): «صحيفة 2026» و«متطلب كلية» — صغيرةٌ نحيفة بجانب الاسم،
 * بحجم محتواها دائماً (لا تُمطّ في قائمة أو شبكة). مكوّنٌ واحد في كل مكان يُعرض فيه اسم مقرر.
 *  • بـ courseId: تُقرأ الشارات من المصدر الواحد (/api/plan-badges).
 *  • بـ text: نصّ جاهز من قوائم الاختيار («صحيفة 2026 · متطلب») يُفكّ إلى شاراته.
 */
export default function PlanBadge({ courseId, text }: { courseId?: unknown; text?: string }) {
  const badges = usePlanBadges();
  const parts = text !== undefined ? String(text).split(" · ").map(part => part.trim()).filter(Boolean) : [];
  const label = text !== undefined ? parts.filter(part => !part.startsWith("متطلب")).join(" · ") : planBadgeOf(badges, courseId);
  const service = text === undefined ? serviceDepartmentsOf(courseId) : [];
  const required = service.length > 0 || parts.some(part => part.startsWith("متطلب"));
  return <>
    {label ? <span className="plan-badge" title="مقرر الصحيفة الجديدة">{label}</span> : null}
    {required ? <span className="course-service-badge" title={service.length ? `متطلب في صحائف: ${service.join("، ")}` : "متطلب في صحائف أقسام أخرى"}>متطلب كلية</span> : null}
  </>;
}
