/**
 * E1 — «نوع الإرسال» لبطاقة الأستاذ: ثلاث بطاقات بصرية (👁️ / ✏️ / 🎓)، للفردي والجماعي.
 * المصدر الواحد للأسماء والأيقونات: src/utils/linkMode.ts.
 */
import { LINK_MODES, type LinkMode } from "../utils/linkMode";

export default function SendModePicker({ value, onChange, allow = ["view", "edit", "ta"], label = "نوع الإرسال" }: {
  value: LinkMode; onChange: (mode: LinkMode) => void; allow?: LinkMode[]; label?: string;
}) {
  return (
    <div className="send-mode" role="radiogroup" aria-label={label}>
      {LINK_MODES.filter(mode => allow.includes(mode.id)).map(mode => (
        <button data-guide-ignore="نوع الإرسال — اختيار بطاقة من ثلاث" key={mode.id} type="button" role="radio" aria-checked={value === mode.id} aria-pressed={value === mode.id} onClick={() => onChange(mode.id)}>
          <span className="sm-ic" aria-hidden="true">{mode.icon}</span>
          <b>{mode.label}</b>
          <small>{mode.hint}</small>
        </button>
      ))}
    </div>
  );
}
