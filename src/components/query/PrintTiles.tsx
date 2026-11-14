import { Droplet, Printer } from "lucide-react";

/**
 * ── خياران لا ثالث لهما ──────────────────────────────────────────────────────
 * بلاطتان: «عادية» بنقاطٍ ملوّنة، و«موفّر الحبر» بالنقاط نفسها رماديةً، فيُفهم الفرق بلا شرح.
 * ما اختير آخر مرة يُؤشَّر عليه؛ والضغط على بلاطةٍ يطبع فوراً.
 */
export default function PrintTiles({ ink, onPick, autoFocus = false }: { ink: boolean; onPick: (ink: boolean) => void; autoFocus?: boolean }) {
  return (
    <div className="print-tiles" role="group" aria-label="نوع الطباعة">
      <button type="button" className="print-tile" data-last={!ink || undefined} autoFocus={autoFocus && !ink} data-guide-ignore="طباعة عادية بالألوان؛ قراءة فقط" onClick={() => onPick(false)}>
        <Printer aria-hidden="true" />
        <i className="print-tile-dots" aria-hidden="true"><b /><b /><b /></i>
        <span>عادية</span>
      </button>
      <button type="button" className="print-tile print-tile-ink" data-last={ink || undefined} autoFocus={autoFocus && ink} data-guide-ignore="طباعة موفّرة للحبر: الورقة نفسها بالرمادي؛ قراءة فقط" onClick={() => onPick(true)}>
        <Droplet aria-hidden="true" />
        <i className="print-tile-dots" aria-hidden="true"><b /><b /><b /></i>
        <span>موفّر الحبر</span>
      </button>
    </div>
  );
}
