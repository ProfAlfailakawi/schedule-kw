import React from "react";
import { AlertTriangle, Check, Ruler } from "lucide-react";
import type { RegulationChoice, RegulationFit } from "../utils/appointmentRegulation";

/**
 * شرائح أنماط اللائحة (قرار 1913/2016) بجانب الأيام في كل نموذج موعد.
 * النمط المطبَّق مضيء، والبدائل المعتمدة شرائح بضغطة، والخروج عن اللائحة ⚠️ لا يمنع.
 */
export default function RegulationPatternChips({
  choices, activeId, fit, onPick, compact = false,
}: {
  choices: RegulationChoice[];
  activeId?: string | null;
  fit: RegulationFit;
  onPick: (choice: RegulationChoice) => void;
  compact?: boolean;
}) {
  if (!choices.length && fit !== "off") return null;
  return <div className={`regulation-chips${compact ? " is-compact" : ""}`} role="group" aria-label="أنماط اللائحة">
    <span className="regulation-chips-mark" title="أنماط قرار 1913/2016 لساعات المقرر" aria-hidden="true"><Ruler /></span>
    {choices.map(choice => {
      const active = choice.id === activeId;
      return <button type="button" key={choice.id} className={active ? "is-active" : ""} aria-pressed={active}
        data-guide-ignore="شريحة نمط لائحي: تضبط الأيام ومدة اللقاء معاً؛ لا تحفظ شيئاً"
        onClick={() => onPick(choice)} title={choice.block ? "كتلة واحدة (مختبر/ورشة)" : "نمط معتمد"}>
        {active ? <Check aria-hidden="true" /> : null}{choice.label}
      </button>;
    })}
    {fit === "off" ? <span className="regulation-chips-off" role="status" title="الأيام أو المدة لا تطابق نمطاً معتمداً لساعات المقرر — تنبيه لا يمنع الحفظ"><AlertTriangle aria-hidden="true" />خارج اللائحة</span> : null}
  </div>;
}
