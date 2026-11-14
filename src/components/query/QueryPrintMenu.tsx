import { Droplet, Printer } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * ── زرّ الطباعة يسأل حين يُضغط ───────────────────────────────────────────────
 * خياران بأيقونتين لا شرح: «عادية» و«موفّر الحبر» (الورقة نفسها بالمليمتر، رماديةً).
 * ما اختير أولاً يظهر مؤشَّراً، فيُطبع بضغطةٍ واحدة من القائمة بلا سؤالٍ آخر.
 */
export default function QueryPrintMenu({ onPrint, disabled, ink }: { onPrint: (ink: boolean) => void; disabled?: boolean; ink: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent) { if (event.key === "Escape") setOpen(false); return; }
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", close, true);
    return () => { document.removeEventListener("pointerdown", close, true); document.removeEventListener("keydown", close, true); };
  }, [open]);
  const choose = (value: boolean) => { setOpen(false); onPrint(value); };
  return (
    <span className="query-report-action query-print-menu" ref={box}>
      <button type="button" className="query-print-icon has-label" data-guide-ignore="طباعة العرض الحالي: يسأل عادية أم موفّرة للحبر؛ قراءة فقط" aria-haspopup="menu" aria-expanded={open || undefined} disabled={disabled} aria-label="طباعة هذا العرض" title="طباعة هذا العرض" onClick={() => setOpen(value => !value)}>
        <Printer aria-hidden="true" /><span>طباعة</span>
      </button>
      {open ? (
        <div className="query-scope-menu report-choice query-print-options" role="menu" aria-label="نوع الطباعة">
          <button type="button" role="menuitem" autoFocus={!ink} data-guide-ignore="طباعة عادية بالألوان؛ قراءة فقط" onClick={() => choose(false)}><Printer aria-hidden="true" />عادية</button>
          <button type="button" role="menuitem" autoFocus={ink} data-guide-ignore="طباعة موفّرة للحبر: الورقة نفسها بالرمادي؛ قراءة فقط" onClick={() => choose(true)}><Droplet aria-hidden="true" />موفّر الحبر</button>
        </div>
      ) : null}
    </span>
  );
}
