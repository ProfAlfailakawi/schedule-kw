import React, { useEffect, useState } from "react";
import { Fingerprint, X } from "lucide-react";
import { dismissPasskeyOffer, fetchPasskeys, passkeyDeviceRemembered, passkeyOfferDismissed, passkeySupported, PasskeyError, registerPasskey } from "../utils/passkeys";

/**
 * ── «فعّل الدخول بالبصمة على هذا الجهاز» ─────────────────────────────────────
 *
 * يُعرض مرةً بعد الدخول، لمن يدعم جهازُه ذلك ولم يسجّله، ولم يرفض العرضَ من قبل (يُحفظ الرفضُ لهذا الجهاز).
 * الإغلاق (×) و«لا أريد» يحفظان الرفض؛ ومن غيّر رأيه فمكانُ التفعيل في حسابه (زرّ البصمة في القائمة).
 * جلسةٌ مضى عليها وقتٌ يطلب الخادمُ فيها كلمةَ السر: تظهر الخانةُ هنا.
 */
export default function PasskeyOffer() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [needPassword, setNeedPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (passkeyDeviceRemembered() || passkeyOfferDismissed()) return;
    let alive = true;
    void (async () => {
      if (!(await passkeySupported())) return;
      const list = await fetchPasskeys().catch(() => null);
      if (alive && list?.available && list.items.length < list.limit) setVisible(true);
    })();
    return () => { alive = false; };
  }, []);

  if (!visible) return null;
  const close = () => { dismissPasskeyOffer(); setVisible(false); };
  const enable = async () => {
    setBusy(true); setMessage("");
    try {
      await registerPasskey({ password: needPassword ? password : undefined });
      setPassword(""); setDone(true);
      window.setTimeout(() => setVisible(false), 2600);
    } catch (error) {
      const failure = error instanceof PasskeyError ? error : null;
      if (failure?.failure === "password-required" || failure?.failure === "password-wrong") setNeedPassword(true);
      setMessage(failure?.message || "تعذّر تفعيل الدخول بالبصمة. أعد المحاولة.");
    } finally { setBusy(false); }
  };
  return (
    <section className="passkey-offer no-print" role="region" aria-label="الدخول بالبصمة" dir="rtl">
      <button type="button" className="passkey-offer-close" onClick={close} aria-label="إغلاق وعدم العرض مرة أخرى" data-guide-ignore="يغلق عرض الدخول بالبصمة ويحفظ الرفض لهذا الجهاز؛ لا يغيّر بيانات الجدول">
        <X aria-hidden="true" />
      </button>
      {done ? (
        <p className="passkey-offer-text" role="status"><Fingerprint aria-hidden="true" /> فُعّل الدخول بالبصمة على هذا الجهاز.</p>
      ) : (
        <>
          <p className="passkey-offer-text"><Fingerprint aria-hidden="true" /> <b>فعّل الدخول بالبصمة على هذا الجهاز</b><span>تدخل في المرة القادمة بلمسة، دون كتابة كلمة السر.</span></p>
          {needPassword ? (
            <label className="passkey-offer-password">
              <span>كلمة السر</span>
              <input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} disabled={busy} />
            </label>
          ) : null}
          {message ? <p className="passkey-offer-message" role="alert">{message}</p> : null}
          <div className="passkey-offer-actions">
            <button type="button" className="passkey-offer-yes" onClick={enable} disabled={busy || (needPassword && !password)} data-guide-ignore="يسجّل هذا الجهاز للدخول بالبصمة بعد موافقتك على الجهاز؛ لا يمسّ بيانات الجدول">
              {busy ? <span className="button-spinner" /> : "فعّل البصمة"}
            </button>
            <button type="button" className="passkey-offer-no" onClick={close} disabled={busy} data-guide-ignore="يحفظ الرفض لهذا الجهاز ولا يغيّر بيانات الجدول">لا أريد</button>
          </div>
        </>
      )}
    </section>
  );
}
