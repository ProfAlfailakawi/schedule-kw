/**
 * ── برج المراقبة ليوم التسجيل ────────────────────────────────────────────────
 *
 * عرضُ ملء الشاشة للوحة «يوم التسجيل الحي»: كل شعبةٍ عمودٌ يمتلئ من أسفله بنسبة
 * امتلائها، والعمودُ الذي بلغ 80% فأكثر (حدُّ «يمتلئ» نفسه في اللوحة) ينبض بالأحمر.
 * البيانات بياناتُ اللوحة نفسها كما وصلت، فيتجدّد البرج حين تتجدّد اللوحة بنبضتها
 * الحيّة. للقراءة فقط: لا اعتماد ولا كتابة من هنا.
 */
import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { RadioTower, Users, X } from "lucide-react";
import { useDialogDismiss } from "./ui";
import { AR, countOf } from "../utils/arabicCount";
import { FILLING_AT, STATE_LABEL, type BoardRow } from "../utils/liveBoard";

const nf = (n: number) => n.toLocaleString("ar-KW-u-nu-latn");

export default function RegistrationTower({ rows, counts, asOf, stale, live, onClose }: {
  rows: BoardRow[];
  counts?: { open: number; filling: number; full: number; unknown: number; waiting: number };
  asOf: string;
  stale?: boolean;
  live?: boolean;
  onClose: () => void;
}) {
  useDialogDismiss(true, onClose);
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);
  /* من خرج من ملء الشاشة بمفتاح المتصفح يبقى في البرج؛ الإغلاقُ يخرج منه أيضاً. */
  const close = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    onClose();
  };
  const hot = rows.filter(row => row.fill !== null && row.fill >= FILLING_AT).length;
  return createPortal(
    <div className="rt-tower" ref={box} role="dialog" aria-modal="true" aria-labelledby="rt-title">
      <header className="rt-head">
        <span className="rt-mark" aria-hidden="true"><RadioTower /></span>
        <div className="rt-title">
          <strong id="rt-title">برج المراقبة{live ? " — جارٍ الآن" : ""}</strong>
          <small className={stale ? "stale" : ""}>{asOf}</small>
        </div>
        {counts ? (
          <p className="rt-counts" aria-label="ملخص البرج">
            <span className="full">ممتلئ <b>{nf(counts.full)}</b></span>
            <span className="filling">يمتلئ <b>{nf(counts.filling)}</b></span>
            <span className="open">متاح <b>{nf(counts.open)}</b></span>
            <span className="wait"><Users aria-hidden="true" />{countOf(counts.waiting, AR.student)} بلا مقعد</span>
          </p>
        ) : null}
        <button ref={closeRef} type="button" className="rt-close" onClick={close} aria-label="أغلق برج المراقبة" data-guide-ignore="يغلق عرض برج المراقبة؛ لا يكتب شيئاً"><X aria-hidden="true" /></button>
      </header>
      <p className="rt-note">كل عمودٍ شعبة، ويمتلئ بنسبة امتلائها. الأحمرُ النابض: 80% فأكثر{hot ? ` (${nf(hot)})` : ""}. للقراءة فقط.</p>
      {!rows.length ? <p className="rt-empty">لا شعبَ في نطاقك لهذا الفصل بعد.</p> : (
        <ol className="rt-columns" aria-label="أعمدة الشعب">
          {rows.map(row => {
            const pct = row.fill === null ? null : Math.round(row.fill * 100);
            const hotRow = row.fill !== null && row.fill >= FILLING_AT;
            const label = `${row.name}، شعبة ${row.sectionCode}: ${pct === null ? "السعة غير معروفة" : `الامتلاء ${nf(pct)}%`}${row.state ? ` (${STATE_LABEL[row.state]})` : ""}${row.waiting ? `، ${countOf(row.waiting, AR.student)} بلا مقعد` : ""}`;
            return (
              <li key={row.key} className={`rt-col ${row.state || "unknown"}${hotRow ? " is-hot" : ""}`} aria-label={label} title={label}>
                <span className="rt-pct">{pct === null ? "—" : `${nf(pct)}%`}</span>
                <span className="rt-tank" aria-hidden="true">
                  <i style={{ blockSize: `${Math.min(100, pct ?? 0)}%` }} />
                  {pct !== null && pct > 100 ? <em className="rt-over">+{nf(pct - 100)}</em> : null}
                  <s className="rt-line80" />
                </span>
                <span className="rt-code" dir="ltr">{row.code}</span>
                <span className="rt-sec" dir="ltr">{row.sectionCode}</span>
                {row.waiting ? <span className="rt-wait"><Users aria-hidden="true" />{nf(row.waiting)}</span> : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>,
    document.body,
  );
}
