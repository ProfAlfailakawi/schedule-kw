import React from "react";
import { FlaskConical } from "lucide-react";

/**
 * ── علامةُ «عملي» الواحدة ─────────────────────────────────────────────────────────
 * لقاءٌ عمليٌّ من شعبةٍ لمقررٍ بطبيعةٍ خاصة (FSchedule.practical): قارورةٌ وكلمة، بلونٍ هادئٍ واحدٍ في كل الشاشات
 * (ورشة الجدول، التسجيل، مساري، كرت الأستاذ، الطباعة). `compact` رمزٌ وحده لمكانٍ ضيّق، وكلمتُه تبقى للقارئ الصوتي والتلميح.
 */
export function PracticalMark({ compact = false, label = "عملي", className = "" }: { key?: React.Key; compact?: boolean; label?: string; className?: string }) {
  return (
    <span className={`pr-mark${compact ? " is-compact" : ""}${className ? ` ${className}` : ""}`} title="لقاء عملي" role="img" aria-label={label}>
      <FlaskConical aria-hidden="true" />
      {compact ? null : <span aria-hidden="true">{label}</span>}
    </span>
  );
}

export default PracticalMark;
