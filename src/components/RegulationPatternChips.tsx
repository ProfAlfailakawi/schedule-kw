import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Ruler, Sparkles } from "lucide-react";
import type { RegulationChoice, RegulationFit } from "../utils/appointmentRegulation";

/**
 * ── إضاءة «أُكمل تلقائياً» ───────────────────────────────────────────────────────
 * حين يكمل النمطُ الأيامَ أو النهاية دون ضغطٍ من المستخدم يضيء ما تغيّر لحظةً (١٫٦ث)
 * ويُقال بصوتٍ هادئ لقارئ الشاشة — فلا يتغيّر شيءٌ في النموذج خفيةً. ضغطةٌ ثانية أثناء
 * الإضاءة تعيدها من أولها.
 */
export function useAutofillFlash(duration = 1600): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const timer = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
    if (frame.current) window.cancelAnimationFrame(frame.current);
  }, []);
  const fire = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (frame.current) window.cancelAnimationFrame(frame.current);
    setOn(false);
    frame.current = window.requestAnimationFrame(() => {
      setOn(true);
      timer.current = window.setTimeout(() => setOn(false), duration);
    });
  }, [duration]);
  return [on, fire];
}

/**
 * شرائح أنماط اللائحة (قرار 1913/2016) بجانب الأيام في كل نموذج موعد.
 * النمط المطبَّق مضيء، والبدائل المعتمدة شرائح بضغطة، والخروج عن اللائحة ⚠️ لا يمنع.
 */
export default function RegulationPatternChips({
  choices, activeId, fit, onPick, compact = false, onApplyBest, autofilled = false,
}: {
  choices: RegulationChoice[];
  activeId?: string | null;
  fit: RegulationFit;
  onPick: (choice: RegulationChoice) => void;
  compact?: boolean;
  /** تجاوزٌ متعمَّد: ضغطة واحدة تعيد الأيام والنهاية إلى النمط المعتمد. */
  onApplyBest?: () => void;
  /** أكمل النمطُ الأيام/النهاية الآن: يضيء الشريحة المطبَّقة ويظهر «أُكمل تلقائياً» لحظة. */
  autofilled?: boolean;
}) {
  if (!choices.length && fit !== "off") return null;
  return <div className={`regulation-chips${compact ? " is-compact" : ""}${autofilled ? " is-autofilled" : ""}`} role="group" aria-label="أنماط اللائحة">
    <span className="regulation-chips-mark" title="أنماط قرار 1913/2016 لساعات المقرر" aria-hidden="true"><Ruler /></span>
    {choices.map(choice => {
      const active = choice.id === activeId;
      return <button type="button" key={choice.id} className={active ? "is-active" : ""} aria-pressed={active}
        data-guide-ignore="شريحة نمط لائحي: تضبط الأيام ومدة اللقاء معاً؛ لا تحفظ شيئاً"
        onClick={() => onPick(choice)} title={choice.block ? "كتلة واحدة (مختبر/ورشة)" : "نمط معتمد"}>
        {active ? <Check aria-hidden="true" /> : null}{choice.label}
      </button>;
    })}
    <span className="regulation-chips-auto" role="status" aria-live="polite">{autofilled && activeId ? <><Sparkles aria-hidden="true" />أُكمل تلقائياً</> : null}</span>
    {fit === "off" ? <span className="regulation-chips-off" role="status" title="الأيام أو المدة لا تطابق نمطاً معتمداً لساعات المقرر — تنبيه لا يمنع الحفظ"><AlertTriangle aria-hidden="true" />خارج اللائحة</span> : null}
    {fit === "off" && onApplyBest ? <button type="button" className="regulation-chips-apply" onClick={onApplyBest}
      data-guide-ignore="يعيد الأيام والنهاية إلى النمط المعتمد لساعات المقرر؛ لا يحفظ شيئاً"><Ruler aria-hidden="true" />طبّق النمط المعتمد</button> : null}
  </div>;
}
