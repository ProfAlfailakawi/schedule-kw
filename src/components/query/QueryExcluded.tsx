import CourseTags from "../CourseTags";
import { AR, countOf } from "../../utils/arabicCount";
import { CalendarPlus, CircleAlert, EyeOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EXCLUDED_REASON_LABEL, type ExcludedRow } from "../../utils/excludedRows";

/**
 * ── ما لم يُحسب ──────────────────────────────────────────────────────────────
 * شريحةٌ صغيرة بجانب العدّاد في عدسات القاعات والإشغال والمصفوفة: عينٌ مشطوبة ورقم. تفتح قائمةً قصيرة بما استُبعد
 * وسببِه، وزرُّ «افتحه في الجدول» لمن يملك الجدول. بلا استبعادٍ لا تظهر.
 */
export default function QueryExcluded({ items, courseName, onOpen }: { items: ExcludedRow[]; courseName: (item: ExcludedRow) => string; onOpen?: (item: ExcludedRow) => void }) {
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
  if (!items.length) return null;
  const counted = items.length.toLocaleString("ar-KW-u-nu-latn");
  return (
    <span className="query-excluded" ref={box}>
      <button type="button" data-guide-ignore="ما استُبعد من حساب القاعات وسببه؛ قراءة فقط" aria-expanded={open} aria-label={`${countOf(items.length, AR.appointment)} لم تُحسب`} title="مواعيدُ لم تدخل الحساب" onClick={() => setOpen(value => !value)}>
        <EyeOff aria-hidden="true" /><b>{counted}</b>
      </button>
      {open ? (
        <div className="query-excluded-pop" role="dialog" aria-modal="false" aria-label="ما لم يُحسب">
          <p><CircleAlert aria-hidden="true" /></p>
          <ul>
            {items.slice(0, 8).map(item => (
              <li key={item.row.id}>
                <span><strong>{courseName(item)}<CourseTags courseId={item.row.AdCourseId} /></strong><small>ش{item.row.SCode || "—"} · {EXCLUDED_REASON_LABEL[item.reason]}</small></span>
                {onOpen ? <button type="button" data-guide-ignore="يفتح الجدول على هذا الموعد؛ لا يكتب شيئاً" aria-label="افتحه في الجدول" title="افتحه في الجدول" onClick={() => onOpen(item)}><CalendarPlus aria-hidden="true" /></button> : null}
              </li>
            ))}
          </ul>
          {items.length > 8 ? <small className="query-excluded-more">+{(items.length - 8).toLocaleString("ar-KW-u-nu-latn")}</small> : null}
        </div>
      ) : null}
    </span>
  );
}
