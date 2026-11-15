import React, { useState } from "react";
import { LogIn } from "lucide-react";
import { nativeHandoffAvailable, runNativeHandoff, type HandoffFailure } from "../utils/nativeApp";

/**
 * ── «ادخل بحسابك»: داخل التطبيق الرسمي فقط ─────────────────────────────────
 *
 * من دخل ببطاقته في Safari ثم فتح التطبيق يجد زراً واحداً كبيراً: يضغطه فتسأله آبل «متابعة؟»
 * ويدخل بحسابه، بلا اسم مستخدم ولا كلمة سر. في المتصفح لا يظهر شيء.
 */
const MESSAGES: Record<Exclude<HandoffFailure, "cancelled">, string> = {
  "no-session": "لم نجد دخولاً سابقاً على هذا الجهاز. افتح بطاقتك من Safari أولاً، ثم ارجع واضغط الزر.",
  "password-first": "اختر كلمة سرّك من المتصفح أولاً، ثم ارجع واضغط الزر.",
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
    <div className="app-handoff" data-guide-ignore="ينقل دخول Safari إلى التطبيق بإذنٍ من آبل؛ لا يغيّر كلمة سر ولا بيانات">
      <button type="button" className="app-handoff-go" onClick={go} disabled={busy} data-guide-ignore="ينقل دخول Safari إلى التطبيق بإذنٍ من آبل؛ لا يغيّر كلمة سر ولا بيانات">
        {busy ? <span className="button-spinner" /> : <><LogIn aria-hidden="true" /> ادخل بحسابك</>}
      </button>
      <small>إن كنت داخلاً في Safari، تنتقل إلى هنا بلمسة.</small>
      {message ? <p role="alert">{message}</p> : null}
    </div>
  );
}
