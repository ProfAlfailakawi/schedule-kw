import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TourSnapshot } from "../../guide/tour/runner";

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 6;
const CARD_W = 340;

function place(rect: Rect | null, cardH: number): React.CSSProperties {
  const vw = window.innerWidth, vh = window.innerHeight;
  if (vw < 640) {
    const low = rect && rect.top + rect.height / 2 > vh * .52;
    return low ? { top: "max(12px, env(safe-area-inset-top))", insetInline: 16 } : { bottom: "calc(12px + env(safe-area-inset-bottom))", insetInline: 16 };
  }
  if (!rect) return { top: Math.max(16, vh / 2 - cardH / 2), left: vw / 2 - CARD_W / 2, width: CARD_W };
  const gap = 14;
  let top = rect.top + rect.height + gap;
  if (top + cardH > vh - 12) top = rect.top - cardH - gap;
  let left = rect.left + rect.width / 2 - CARD_W / 2;
  if (top < 12) {
    top = Math.min(vh - cardH - 12, Math.max(12, rect.top));
    left = rect.left > CARD_W + gap + 12 ? rect.left - CARD_W - gap : rect.left + rect.width + gap;
  }
  return { top, left: Math.min(vw - CARD_W - 12, Math.max(12, left)), width: CARD_W };
}

export default function GuideTour({ state, element, title, when, note, onNext, onBack, onStop, onRetry, onSkipStep, onLost }: {
  state: TourSnapshot;
  element: HTMLElement | null;
  title: string;
  when?: string;
  note?: string;
  onNext: () => void;
  onBack: () => void;
  onStop: () => void;
  onRetry: () => void;
  onSkipStep: () => void;
  onLost: () => void;
}) {
  const [rect, setRect] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const [cardH, setCardH] = useState(180);

  useEffect(() => {
    if (!element) { setRect(null); return; }
    let frame = 0, last = "";
    const tick = () => {
      if (!element.isConnected) { onLost(); return; }
      const box = element.getBoundingClientRect();
      if (!box.width && !box.height) { onLost(); return; }
      const key = `${Math.round(box.top)}|${Math.round(box.left)}|${Math.round(box.width)}|${Math.round(box.height)}`;
      if (key !== last) { last = key; setRect({ top: box.top, left: box.left, width: box.width, height: box.height }); }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [element, onLost]);

  useLayoutEffect(() => { if (cardRef.current) setCardH(cardRef.current.offsetHeight); }, [state.index, state.status, note]);
  useEffect(() => { primaryRef.current?.focus({ preventScroll: true }); }, [state.index, state.status]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onStop(); }
      if (state.status === "showing" && event.key === "ArrowLeft") onNext();
      if (state.index > 0 && event.key === "ArrowRight") onBack();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [state.status, state.index, onStop, onNext, onBack]);

  const hole = rect ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 } : null;
  const waiting = state.status === "waiting";
  const missing = state.status === "missing";
  const last = state.index + 1 >= state.total;
  const clip = hole && waiting
    ? `polygon(evenodd,0 0,100% 0,100% 100%,0 100%,0 0,${hole.left}px ${hole.top}px,${hole.left + hole.width}px ${hole.top}px,${hole.left + hole.width}px ${hole.top + hole.height}px,${hole.left}px ${hole.top + hole.height}px,${hole.left}px ${hole.top}px)`
    : undefined;
  const text = note && last ? note : state.step?.text || "";

  return createPortal(
    <div className="guide-tour no-print" data-guide-ignore="جولة المرشد نفسها">
      <div className="guide-tour-block" style={{ clipPath: clip }} onClick={event => event.stopPropagation()} />
      {hole ? <div className="guide-tour-spot" style={hole} /> : <div className="guide-tour-dim" />}
      <section ref={cardRef} className={`guide-tour-card is-${state.status}`} style={place(rect, cardH)} role="dialog" aria-modal="false" aria-label={`جولة: ${title}`}>
        <header><span>{title}</span><b dir="ltr">{state.index + 1} / {state.total}</b></header>
        <p aria-live="polite">{missing ? `لم أجد هذا العنصر في حالتك الآن.${when ? ` ${when}` : ""}` : state.status === "seeking" ? "لحظة، أجهز لك الخطوة…" : text}</p>
        {waiting ? <small className="guide-tour-wait"><i aria-hidden="true" />أنتظر اختيارك</small> : null}
        <footer>
          {missing && last ? null : <button type="button" className="guide-tour-quiet" onClick={onStop}>إنهاء</button>}
          {state.index > 0 ? <button type="button" className="guide-tour-quiet" onClick={onBack}>السابق</button> : null}
          {missing ? <>
            <button type="button" className="guide-tour-quiet" onClick={onRetry}>أعد المحاولة</button>
            <button ref={primaryRef} type="button" className="guide-tour-primary" onClick={last ? onStop : onSkipStep}>{last ? "إنهاء" : "تخطَّ الخطوة"}</button>
          </> : waiting ? <button ref={primaryRef} type="button" className="guide-tour-quiet" onClick={onSkipStep}>تخطَّ</button>
            : <button ref={primaryRef} type="button" className="guide-tour-primary" disabled={state.status === "seeking"} onClick={onNext}>{last ? "تم" : "التالي"}</button>}
        </footer>
      </section>
    </div>,
    document.body,
  );
}
