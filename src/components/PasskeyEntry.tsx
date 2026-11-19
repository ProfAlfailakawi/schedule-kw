import React, { useEffect, useState } from "react";
import { Fingerprint } from "lucide-react";
import { forgetPasskeyDevice, loginWithPasskey, passkeyDeviceRemembered, passkeySupported, PasskeyError } from "../utils/passkeys";

/**
 * ── «الدخول بالبصمة» على شاشة الدخول ────────────────────────────────────────
 *
 * زرٌّ هادئٌ تحت النموذج لا يُعرض إلا حين يدعم المتصفحُ WebAuthn وفي الجهاز ما يتحقّق من صاحبه، وكان
 * هذا الجهازُ قد سُجّل من قبل (علامةٌ غيرُ حسّاسة في المتصفح). وإلا بقي النموذجُ العاديّ كما هو.
 * داخل التطبيق الرسمي: إن لم يعرض الغلافُ WebAuthn لم يظهر الزر. الحَكَمُ هو الخادم (src/server/passkeys.ts).
 */
export default function PasskeyEntry({ onSuccess }: { onSuccess: (data: any) => void }) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!passkeyDeviceRemembered()) return;
    let alive = true;
    void passkeySupported().then(ok => { if (alive) setReady(ok); });
    return () => { alive = false; };
  }, []);

  if (!ready) return null;
  const go = async () => {
    setBusy(true); setMessage("");
    try {
      onSuccess(await loginWithPasskey());
    } catch (error) {
      const failure = error instanceof PasskeyError ? error : null;
      /* مفتاحٌ أُزيل من حسابه: لا يبقى الزرُّ يَعِد بما لا يكون. */
      if (failure?.failure === "not-registered") { forgetPasskeyDevice(); setReady(false); }
      setMessage(failure?.message || "تعذّر الدخول بالبصمة. ادخل بالاسم وكلمة السر.");
    } finally { setBusy(false); }
  };
  return (
    <div className="passkey-entry" data-guide-ignore="يدخل بالبصمة المسجّلة على هذا الجهاز؛ لا يغيّر كلمة سر ولا بيانات">
      <button type="button" className="passkey-go" onClick={go} disabled={busy} aria-label="الدخول بالبصمة" data-guide-ignore="يدخل بالبصمة المسجّلة على هذا الجهاز؛ لا يغيّر كلمة سر ولا بيانات">
        {busy ? <span className="button-spinner" /> : <><Fingerprint aria-hidden="true" /> الدخول بالبصمة</>}
      </button>
      {message ? <p role="alert">{message}</p> : null}
    </div>
  );
}
