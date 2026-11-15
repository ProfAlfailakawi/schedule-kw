import React, { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { APP_OFFER_DOWNLOADED_DAYS, APP_OFFER_LATER_DAYS, APP_STORE_URL, appOfferDue, snoozeAppOffer } from "../utils/nativeApp";

/**
 * ── دعوةُ التطبيق الرسمي: مرةٌ واحدة، وخطوةٌ واحدة ───────────────────────────
 *
 * تظهر في Safari على أجهزة آبل بعد أن يدخل الشخص (بطاقته أو حسابه) لا قبله، وبزرٍّ واحد كبير:
 * «حمّل التطبيق». «لاحقاً» تُسكتها أسبوعاً، والتحميل يُسكتها ثلاثة أشهر. داخل التطبيق لا تظهر أبداً.
 * وبعد التحميل يأخذ التطبيقُ دخولَ Safari بنفسه (utils/nativeApp → ‎/app-handoff‎).
 */
export default function GetAppSheet() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!appOfferDue()) return;
    const timer = window.setTimeout(() => setOpen(true), 1600);
    return () => window.clearTimeout(timer);
  }, []);
  if (!open) return null;
  const later = () => { snoozeAppOffer(APP_OFFER_LATER_DAYS); setOpen(false); };
  return (
    <aside className="get-app" role="dialog" aria-modal="false" aria-label="تطبيق SCHEDULE الرسمي" dir="rtl" data-guide-ignore="دعوةٌ لتحميل التطبيق الرسمي من المتجر؛ لا تغيّر بيانات">
      <img src="/schedule-icon-192.png" alt="" width="56" height="56" />
      <div className="get-app-text">
        <b>استخدم SCHEDULE من التطبيق الرسمي</b>
        <small>حمّله مرة واحدة، وعند فتحه تدخل بحسابك تلقائياً بلا كلمة سر.</small>
      </div>
      <a className="get-app-go" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" onClick={() => { snoozeAppOffer(APP_OFFER_DOWNLOADED_DAYS); setOpen(false); }}>
        <Download aria-hidden="true" /> حمّل التطبيق
      </a>
      <button type="button" className="get-app-later" onClick={later} data-guide-ignore="يؤجّل دعوة التطبيق أسبوعاً؛ لا يغيّر بيانات">لاحقاً</button>
    </aside>
  );
}
