import React from "react";

export default function VisitingBadge({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  return <span className={`visiting-badge${compact ? " compact" : ""}${className ? ` ${className}` : ""}`}>منتدب</span>;
}

/** للأماكن النصّية (قوائم منسدلة، جُمل، عناوين) التي لا تحمل مكوّناً: اللاحقةُ نفسُها التي تطبعها التقارير. */
export const VISITING_SUFFIX = " · منتدب";
export const withVisitingSuffix = (name: string, visiting: boolean) => (visiting ? `${name}${VISITING_SUFFIX}` : name);
