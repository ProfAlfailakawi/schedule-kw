import React from "react";

export default function VisitingBadge({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  return <span className={`visiting-badge${compact ? " compact" : ""}${className ? ` ${className}` : ""}`}>منتدب</span>;
}

/** للأماكن النصّية: الدالةُ في ملفٍّ خالصٍ (يستورده الخادم أيضاً) وتُعاد هنا لمن اعتاد الاستيراد من المكوّن. */
export { VISITING_SUFFIX, withVisitingSuffix } from "../utils/visitingText";
