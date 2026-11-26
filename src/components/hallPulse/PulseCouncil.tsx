/**
 * ── «وضع المجلس»: طبقة العرض فوق مجسّم نبض القاعات ─────────────────────────
 *
 * التعليق المكتوب كبيراً يُقرأ من آخر القاعة على جهاز العرض، وشريط تقدّمٍ صغير
 * بخطوات الجولة، وأزرارٌ هادئة (السابق، إيقافٌ مؤقت، التالي، خروج). الجولة نفسها
 * تُحسب في utils/hallPulseCouncil.ts، والمشهد يحرّكه HallPulse. للقراءة وحدها:
 * لا زرّ حفظ هنا ولا في أي خطوة. ومع تقليل الحركة لا حركة ولا شريطٌ يجري.
 */
import React from "react";
import type { CouncilStep } from "../../utils/hallPulseCouncil";
import type { FingerprintShape } from "../../utils/deptFingerprint";
import { FilmMark } from "../TermFilm";

const KIND_GLYPH: Record<CouncilStep["kind"], string> = { day: "◎", pressure: "▲", waste: "◆", scatter: "☾", arrange: "✦", evening: "☾", close: "✺" };

export default function PulseCouncil({ steps, index, paused, reduced, mark, onNext, onPrev, onPause, onExit }: {
  steps: CouncilStep[];
  index: number;
  paused: boolean;
  reduced: boolean;
  mark: FingerprintShape | null;
  onNext: () => void;
  onPrev: () => void;
  onPause: () => void;
  onExit: () => void;
}) {
  const step = steps[index];
  if (!step) return null;
  const closing = step.kind === "close";
  return (
    <div className={`hp-council${closing ? " is-closing" : ""}`} data-kind={step.kind} role="region" aria-label="وضع المجلس: جولة نبض القاعات">
      <div className="hp-council-top">
        <ol className="hp-council-progress" aria-label={`الخطوة ${index + 1} من ${steps.length}`}>
          {steps.map((s, i) => (
            <li key={`${s.kind}-${i}`} className={i < index ? "is-done" : i === index ? "is-now" : ""}>
              <i style={i === index && !reduced ? { animationDuration: `${s.seconds}s`, animationPlayState: paused ? "paused" : "running" } : undefined} />
            </li>
          ))}
        </ol>
        <span className="hp-council-count" aria-hidden="true"><bdi dir="ltr">{index + 1} / {steps.length}</bdi></span>
        <div className="hp-council-tools">
          <button data-guide-ignore="وضع المجلس: الخطوة السابقة؛ عرضٌ للقراءة فقط" type="button" onClick={onPrev} disabled={index === 0} aria-label="الخطوة السابقة">→</button>
          <button data-guide-ignore="وضع المجلس: إيقاف الجولة مؤقتاً أو متابعتها؛ عرضٌ للقراءة فقط" type="button" onClick={onPause} aria-pressed={paused} aria-label={paused ? "تابع الجولة" : "أوقف الجولة مؤقتاً"}>{paused ? "▶" : "❚❚"}</button>
          <button data-guide-ignore="وضع المجلس: الخطوة التالية؛ عرضٌ للقراءة فقط" type="button" onClick={onNext} aria-label={index === steps.length - 1 ? "أنهِ الجولة" : "الخطوة التالية"}>←</button>
          <button data-guide-ignore="يخرج من وضع المجلس؛ لا يغيّر شيئاً" type="button" className="is-exit" onClick={onExit}>خروج <kbd>Esc</kbd></button>
        </div>
      </div>
      {closing && mark ? <div className="hp-council-mark" aria-hidden="true"><FilmMark shape={mark} settle playing={false} reduce={reduced} /></div> : null}
      <section key={index} className="hp-council-caption" aria-live="polite">
        <span className="hp-council-eyebrow"><i aria-hidden="true">{KIND_GLYPH[step.kind]}</i>{step.eyebrow}</span>
        <h2 className="hp-council-title">{step.title}</h2>
        {step.lines.map((line, i) => <p key={i} className="hp-council-line">{line}</p>)}
        {step.figures.length ? (
          <div className="hp-council-figures">
            {step.figures.map(f => (
              <div key={f.label} className="hp-council-figure" data-tone={f.tone || "brass"}>
                <b>{f.value.split(" ← ").map((part, i) => <React.Fragment key={i}>{i ? <em aria-hidden="true"> ← </em> : null}<bdi dir="ltr" className={i ? "" : f.value.includes(" ← ") ? "is-was" : ""}>{part}</bdi></React.Fragment>)}</b>
                <span>{f.label}</span>
              </div>
            ))}
          </div>
        ) : null}
        {step.plan !== "none" ? <span className="hp-council-note">اقتراحٌ للنقاش · لم يُحفظ شيء</span> : null}
      </section>
      <p className="hp-council-keys" aria-hidden="true">← التالي · → السابق · المسافة للتقدّم · Esc للخروج</p>
    </div>
  );
}
