import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight, Armchair, X } from "lucide-react";
import SeatPanel from "./SeatPanel";
import { useDrawerA11y } from "../ui";
import "./seats.css";

/**
 * ── «كرسيّي» من بطاقة الحساب (docs/SEATS.md) ────────────────────────────────
 *
 * لوحةٌ جانبية لشاغل الكرسي: فريقُه وروابطُهم والنائبُ والتسليم وتاريخُ كرسيّه. وفوقها
 * الكراسيُّ الأخرى التي يجلس عليها الشخصُ نفسه — يتنقّل بينها دون أن يخرج.
 */
type SwitchOption = { userId: number; memberId?: string; seatName: string; caption: string };

export default function SeatDrawer({ onClose, canManage }: { onClose: () => void; canManage: boolean }) {
  const ref = useDrawerA11y<HTMLElement>(onClose);
  const [options, setOptions] = useState<SwitchOption[]>([]);
  const [switching, setSwitching] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void fetch("/api/seats/switch-options").then(r => r.ok ? r.json() : { options: [] }).then(body => { if (alive) setOptions(body.options || []); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const switchTo = async (option: SwitchOption) => {
    setSwitching(`${option.userId}:${option.memberId || ""}`); setError("");
    try {
      const response = await fetch("/api/seats/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: option.userId, memberId: option.memberId }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "تعذّر الانتقال");
      window.location.replace("/");
    } catch (e: any) { setError(e.message); setSwitching(""); }
  };
  /* إلى جذر الصفحة: البطاقةُ في القائمة الداكنة، واللوحةُ لا ترث ألوانها ولا حدودها. */
  return createPortal(
    <>
      <div className="seat-drawer-backdrop no-print" onMouseDown={onClose} aria-hidden="true" />
      <aside ref={ref} className="seat-drawer no-print" role="dialog" aria-modal="true" aria-label="فريقي">
        <header>
          <Armchair aria-hidden="true" />
          <h2>فريقي</h2>
          <button data-guide-ignore="لوحة «فريقي»: الانتقال بين فرق الشخص نفسه أو إغلاق اللوحة" type="button" className="drawer-close" onClick={onClose} aria-label="إغلاق" title="إغلاق"><X aria-hidden="true" /></button>
        </header>
        {options.length ? (
          <div className="seat-switch">
            <span>تجلس أيضاً على</span>
            {options.map(option => (
              <button data-guide-ignore="لوحة «فريقي»: الانتقال بين فرق الشخص نفسه أو إغلاق اللوحة" type="button" key={`${option.userId}:${option.memberId || ""}`} onClick={() => void switchTo(option)} disabled={Boolean(switching)}>
                <ArrowLeftRight aria-hidden="true" />
                <span>{option.seatName}<small>{switching === `${option.userId}:${option.memberId || ""}` ? "جارٍ الانتقال…" : `اعمل الآن بصفة: ${option.caption}`}</small></span>
              </button>
            ))}
            {error ? <p className="seat-error" role="alert">{error}</p> : null}
          </div>
        ) : null}
        {canManage ? <SeatPanel seatId="mine" source="mine" compact /> : (
          <p className="seat-empty-line">تعمل عضواً في هذا الفريق، ويديره رئيسُ الفريق.</p>
        )}
      </aside>
    </>,
    document.body,
  );
}
