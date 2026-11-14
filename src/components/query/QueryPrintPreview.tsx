import { Eye, FileText, Printer, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface PreviewPage { index: number; lines: number; signed: boolean }

/** يقرأ صفحاتِ الورقة المركّبة للطباعة (قبل أن تُطبع): كم صفحة، وكم سطراً في كلٍّ، وأيها يحمل التواقيع. */
export function readPrintPages(): PreviewPage[] {
  const host = document.getElementById("app-print-root");
  if (!host) return [];
  const pages = Array.from(host.querySelectorAll<HTMLElement>(".print-explicit-page, .print-comprehensive-page"));
  return pages.map((page, index) => ({
    index: index + 1,
    /* امتلاءُ الصفحة: حجمُ ما فيها من نص (textContent لا innerText: ورقةُ الطباعة مخفيةٌ على الشاشة). */
    lines: (page.textContent || "").replace(/\s+/g, " ").length,
    signed: Boolean(page.querySelector(".print-signatures, .print-comprehensive-signatures, [class*='signature']")),
  }));
}

/**
 * ── معاينةٌ اختيارية قبل الطباعة ─────────────────────────────────────────────
 * زرّ عينٍ بجانب الطباعة: يفتح شريطاً من أوراقٍ صغيرة بأرقامها (الأخيرة تحمل التواقيع)، وفيه زرّ «اطبع».
 * لا يعترض الطباعة المباشرة: من يريد الطباعة يضغطها، ومن يريد أن يطمئن يضغط العين أولاً.
 */
export default function QueryPrintPreview({ refreshKey, onPrint, disabled, label }: { refreshKey: string; onPrint: () => void; disabled?: boolean; label: string }) {
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState<PreviewPage[]>([]);
  const box = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    /* بعد رسم الورقة في منفذ الطباعة: إطارٌ واحد يكفي. */
    const frame = requestAnimationFrame(() => setPages(readPrintPages()));
    return () => cancelAnimationFrame(frame);
  }, [open, refreshKey]);
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

  const max = Math.max(1, ...pages.map(page => page.lines));
  return (
    <span className="query-preview" ref={box}>
      <button type="button" className="query-print-icon" data-guide-ignore="معاينة صفحات الورقة قبل الطباعة؛ قراءة فقط" aria-expanded={open} aria-label={`معاينة صفحات ${label}`} title="معاينة الصفحات" disabled={disabled} onClick={() => setOpen(value => !value)}>
        <Eye aria-hidden="true" />
      </button>
      {open ? (
        <div className="query-preview-pop" role="dialog" aria-label="معاينة الصفحات">
          <header><FileText aria-hidden="true" /><b>{pages.length.toLocaleString("ar-KW-u-nu-latn")}</b><small>A4</small>
            <button type="button" className="query-preview-x" data-guide-ignore="إغلاق المعاينة" aria-label="إغلاق" onClick={() => setOpen(false)}><X aria-hidden="true" /></button></header>
          <ol>
            {pages.map(page => (
              <li key={page.index} className={page.signed ? "is-signed" : ""} title={`صفحة ${page.index}`}>
                <span className="sheet"><i style={{ height: `${Math.max(12, Math.round((page.lines / max) * 100))}%` }} /></span>
                <b>{page.index.toLocaleString("ar-KW-u-nu-latn")}</b>
              </li>
            ))}
          </ol>
          <button type="button" className="query-preview-print" data-guide-ignore="طباعة بعد المعاينة؛ قراءة فقط" onClick={() => { setOpen(false); onPrint(); }}><Printer aria-hidden="true" /></button>
        </div>
      ) : null}
    </span>
  );
}
