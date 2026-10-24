import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LayoutGrid, X } from "lucide-react";
import { GhostButton } from "./ui";
import { PATTERN_LIBRARY_CSS, patternLibraryHtml } from "../utils/patternLibraryView";
import { patternLibraryInput } from "../utils/patternLibraryInput";

/**
 * أيقونةٌ صغيرة تفتح مكتبةَ الأنماط (أسابيعُ مصغّرة بأعمدةٍ بالدقائق). للعرض فقط: لا تغيّر
 * شيئاً ولا تمنع. الرسمُ نفسُه يظهر في صفحة الأستاذ من `patternLibraryHtml`.
 */
const MODAL_CSS = `
.plib-modal{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:16px;background:rgba(15,23,20,.4)}
.plib-card{position:relative;inline-size:min(100%,470px);max-block-size:min(86vh,680px);overflow:auto;padding:18px 16px 16px;border:1px solid var(--line,#e3e6e0);border-radius:20px;background:var(--surface,#fff);box-shadow:0 24px 60px rgba(15,23,20,.28)}
.plib-close{position:absolute;inset-block-start:12px;inset-inline-end:12px;display:grid;place-items:center;inline-size:32px;block-size:32px;border:0;border-radius:10px;background:var(--surface-2,#f1f3ee);color:var(--ink,#131817);cursor:pointer}
.plib-close svg{inline-size:16px;block-size:16px}
.plib-trigger{padding-inline:10px}
.plib-trigger svg{inline-size:17px;block-size:17px}
`;

export default function PatternLibraryButton({ className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <GhostButton
        type="button"
        data-guide-ignore="يفتح مكتبة الأنماط للعرض فقط؛ لا يغير بيانات الجدول"
        {...rest}
        className={`plib-trigger ${className}`.trim()}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="مكتبة الأنماط"
        title="مكتبة الأنماط"
      >
        <LayoutGrid aria-hidden="true" />
      </GhostButton>
      {open ? createPortal(
        <div className="plib-modal" role="presentation" onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
          <style>{PATTERN_LIBRARY_CSS + MODAL_CSS}</style>
          <div className="plib-card" role="dialog" aria-modal="true" aria-label="مكتبة الأنماط">
            <button ref={closeRef} type="button" className="plib-close" onClick={() => setOpen(false)} aria-label="إغلاق" data-guide-ignore="يغلق نافذة مكتبة الأنماط فقط"><X aria-hidden="true" /></button>
            <div dangerouslySetInnerHTML={{ __html: patternLibraryHtml(patternLibraryInput()) }} />
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
