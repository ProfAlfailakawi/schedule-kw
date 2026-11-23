import React, { useState } from "react";
import { LogIn } from "lucide-react";
import { nativeHandoffAvailable, runNativeHandoff, type HandoffFailure } from "../utils/nativeApp";

/**
 * ── «ادخل بحسابك»: داخل التطبيق الرسمي فقط ─────────────────────────────────
 *
 * من دخل ببطاقته في Safari ثم فتح التطبيق يجد خياراً هادئاً تحت النموذج لا زراً رئيسياً فوقه (المالك 2026-11-19: كان يطلع
 * لكل من يفتح التطبيق بزرٍّ كبير فوق الاسم وكلمة السر ورسالةِ خطأٍ لمن لم يدخل من Safari قط): يضغطه فتسأله آبل «متابعة؟»
 * ويدخل بحسابه. والرسالةُ تظهر بعد الضغط وحده. في المتصفح لا يظهر شيء.
 */
const MESSAGES: Record<Exclude<HandoffFailure, "cancelled">, string> = {
  "no-session": "لم نجد دخولاً سابقاً على هذا الجهاز. ادخل بالاسم وكلمة السر، أو افتح بطاقتك من الرابط الذي وصلك.",
  "password-first": "اختر كلمة سرّك أولاً من رابط بطاقتك، ثم ارجع واضغط الزر.",
  failed: "تعذّر الدخول الآن. أعد المحاولة، أو ادخل بالاسم وكلمة السر.",
};

export default function AppHandoffEntry() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(() => (/[?&]handoff=(expired|invalid)/.test(window.location.search) ? MESSAGES.failed : ""));
  if (!nativeHandoffAvailable()) return null;
  const go = async () => {
    setBusy(true); setMessage("");
    const failure = await runNativeHandoff();
    setBusy(false);
    if (failure !== "cancelled") setMessage(MESSAGES[failure]);
  };
  return (
    <div className="app-handoff" data-guide-ignore="ينقل دخولك السابق إلى التطبيق بإذنٍ من آبل؛ لا يغيّر كلمة سر ولا بيانات">
      <button type="button" className="app-handoff-go" onClick={go} disabled={busy} data-guide-ignore="ينقل دخولك السابق إلى التطبيق بإذنٍ من آبل؛ لا يغيّر كلمة سر ولا بيانات">
        {busy ? <span className="button-spinner" /> : <><LogIn aria-hidden="true" /> ادخل بحسابك السابق بلمسة</>}
      </button>
      {message ? <p role="alert">{message}</p> : null}
    </div>
  );
}
