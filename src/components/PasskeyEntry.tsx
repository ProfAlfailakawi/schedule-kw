import React, { useEffect, useRef, useState } from "react";
import { Fingerprint } from "lucide-react";
import { forgetPasskeyDevice, loginWithPasskey, passkeyDeviceRemembered, passkeySupported, PasskeyError } from "../utils/passkeys";
import { isInvitationHash } from "../utils/invitationLink";
import { safeStorage } from "../utils/safeStorage";

/**
 * ── «الدخول بالبصمة» على شاشة الدخول ────────────────────────────────────────
 *
 * زرٌّ هادئٌ تحت النموذج لا يُعرض إلا حين يدعم المتصفحُ WebAuthn وفي الجهاز ما يتحقّق من صاحبه، وكان
 * هذا الجهازُ قد سُجّل من قبل (علامةٌ غيرُ حسّاسة في المتصفح). وإلا بقي النموذجُ العاديّ كما هو.
 * داخل التطبيق الرسمي: إن لم يعرض الغلافُ WebAuthn لم يظهر الزر. الحَكَمُ هو الخادم (src/server/passkeys.ts).
 *
 * «تلقائياً» (طلب المالك، على طريقة «مراس»): على جهازٍ سُجّلت فيه البصمة تُفتح نافذتُها وحدها مرةً واحدة لكل تبويب،
 * بعد أن تظهر الصفحة فعلاً وتستقرّ الواجهة (450 مللي ثانية)، فلا تُرفض خلف شاشةٍ مخفية ولا تزاحم اقتراحَ كلمة السر.
 * لا محاولةَ تلقائية ثانية في التبويب نفسه (ولا بعد الخروج)، ولا عند فتح بطاقة دخولٍ أو رابطٍ باسم مستخدم؛
 * وإلغاؤها صامت، والزرُّ يبقى للمحاولة الواعية. حارسٌ على مستوى الوحدة يمنع نافذتين في آنٍ واحد.
 */
const AUTO_KEY = "schedule-passkey-auto-tried";
const AUTO_SETTLE_MS = 450;
let ceremonyBusy = false;
/* علامةُ التبويب (تخزين الجلسة عبر التخزين الآمن): تصمد أمام إعادة التركيب وإعادة التحميل، وتسقط بإغلاق التبويب. */
const autoTried = () => safeStorage.get(AUTO_KEY, "session") === "1";
const markAutoTried = () => safeStorage.set(AUTO_KEY, "1", "session");
const SUPPRESS_KEY = "schedule-passkey-auto-suppressed";
/** خروجٌ صريح في هذا التبويب: لا تُفتح البصمة وحدها بعده (يناديه App عند الخروج). */
export const suppressPasskeyAuto = () => { markAutoTried(); safeStorage.set(SUPPRESS_KEY, "1", "session"); };
const autoSuppressed = () => safeStorage.get(SUPPRESS_KEY, "session") === "1";
/** بطاقةُ دخولٍ أو رابطٌ باسم مستخدم: صاحبُه قد يكون غيرَ صاحب البصمة على هذا الجهاز. */
const arrivedForAnotherLogin = () => typeof window !== "undefined"
  && (isInvitationHash(window.location.hash) || new URLSearchParams(window.location.search).has("username"));

export default function PasskeyEntry({ onSuccess }: { onSuccess: (data: any) => void }) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  /* بطاقةُ دخولٍ لغيره: تُعلَّم في التبويب فوراً، فلا يُسقطها حذفُ الرابط من العنوان ولا العودةُ من «نسيت كلمة السر». */
  const skipAuto = useRef(false);
  if (!skipAuto.current && arrivedForAnotherLogin()) { skipAuto.current = true; markAutoTried(); }

  useEffect(() => {
    if (!passkeyDeviceRemembered()) return;
    let alive = true;
    void passkeySupported().then(ok => { if (alive) setReady(ok); });
    return () => { alive = false; };
  }, []);

  const go = async (automatic = false) => {
    if (ceremonyBusy) return;
    ceremonyBusy = true;
    setBusy(true); setMessage("");
    try {
      const data = await loginWithPasskey();
      safeStorage.remove(SUPPRESS_KEY, "session");
      onSuccess(data);
    } catch (error) {
      const failure = error instanceof PasskeyError ? error : null;
      /* مفتاحٌ أُزيل من حسابه: لا يبقى الزرُّ يَعِد بما لا يكون. */
      if (failure?.failure === "not-registered") { forgetPasskeyDevice(); setReady(false); }
      /* إلغاءُ النافذة التلقائية صامت: الزرُّ أمامه إن أرادها. */
      if (!(automatic && failure?.failure === "cancelled")) setMessage(failure?.message || "تعذّر الدخول بالبصمة. ادخل بالاسم وكلمة السر.");
    } finally { ceremonyBusy = false; setBusy(false); }
  };
  const goRef = useRef(go);
  goRef.current = go;

  /* عودةٌ إلى التطبيق/الموقع بعد غياب: تطبيقُ الشاشة الرئيسية والغلافُ الأصلي يحتفظان بتخزين الجلسة
     عبر الإغلاق والفتح، فكانت البصمة لا تُفتح وحدها إلا أولَ مرة. نُعيد تسليحها عند كل عودة حقيقية
     (غيابٌ ≥ ثانية ونصف؛ نافذةُ Face ID نفسها تُخفي الصفحة لحظةً فلا تُحسب). */
  const [resumeTick, setResumeTick] = useState(0);
  useEffect(() => {
    let hiddenAt = 0;
    const rearm = () => {
      if (ceremonyBusy || skipAuto.current || autoSuppressed()) return;
      safeStorage.remove(AUTO_KEY, "session");
      setResumeTick(v => v + 1);
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt >= 1500) rearm();
      hiddenAt = 0;
    };
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) rearm(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onShow);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pageshow", onShow); };
  }, []);

  useEffect(() => {
    if (!ready || skipAuto.current || autoTried()) return;
    markAutoTried();
    let timer = 0, cancelled = false;
    const arm = () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") { document.addEventListener("visibilitychange", onVisible); return; }
      timer = window.setTimeout(() => {
        if (cancelled) return;
        if (document.visibilityState !== "visible") { arm(); return; }
        void goRef.current(true);
      }, AUTO_SETTLE_MS);
    };
    const onVisible = () => { if (document.visibilityState !== "visible") return; document.removeEventListener("visibilitychange", onVisible); arm(); };
    arm();
    return () => { cancelled = true; window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [ready, resumeTick]);

  if (!ready) return null;
  return (
    <div className="passkey-entry" data-guide-ignore="يدخل بالبصمة المسجّلة على هذا الجهاز؛ لا يغيّر كلمة سر ولا بيانات">
      <button type="button" className="passkey-go" onClick={() => { void go(); }} disabled={busy} aria-label="الدخول بالبصمة" data-guide-ignore="يدخل بالبصمة المسجّلة على هذا الجهاز؛ لا يغيّر كلمة سر ولا بيانات">
        {busy ? <span className="button-spinner" /> : <><Fingerprint aria-hidden="true" /> الدخول بالبصمة</>}
      </button>
      {message ? <p role="alert">{message}</p> : null}
    </div>
  );
}
