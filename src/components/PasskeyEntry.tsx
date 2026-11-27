import React, { useEffect, useRef, useState } from "react";
import { Fingerprint, LockKeyhole } from "lucide-react";
import { abortPasskeyLogin, forgetPasskeyDevice, loginWithPasskey, passkeyDeviceName, passkeyDeviceRemembered, passkeySupported, PasskeyError } from "../utils/passkeys";
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
 * لا محاولةَ تلقائية ثانية في التبويب نفسه، ولا عند فتح بطاقة دخولٍ أو رابطٍ باسم مستخدم، ولا بعد دخولٍ بغيرها
 * («تجربة النظام» أو كلمة السر: endPasskeyAuto تُغلق النافذةَ الجارية وتُلغي إعادتَها حتى خروجٍ صريح)؛
 * وإلغاؤها صامت ويوقف التلقائيةَ في الجلسة نفسها (فلا تعود وحدها)، والزرُّ يبقى للمحاولة الواعية. حارسٌ على مستوى الوحدة يمنع نافذتين في آنٍ واحد.
 */
const AUTO_KEY = "schedule-passkey-auto-tried";
const AUTO_SETTLE_MS = 450;
let ceremonyBusy = false;
/* علامةُ التبويب (تخزين الجلسة عبر التخزين الآمن): تصمد أمام إعادة التركيب وإعادة التحميل، وتسقط بإغلاق التبويب. */
const autoTried = () => safeStorage.get(AUTO_KEY, "session") === "1";
const markAutoTried = () => safeStorage.set(AUTO_KEY, "1", "session");
const SUPPRESS_KEY = "schedule-passkey-auto-suppressed";
/* جلسةٌ فُتحت بغير البصمة في هذه الصفحة: علامةٌ في الذاكرة أيضاً، فلا يُسقطها تخزينٌ معطَّل (وضع الخصوصية). */
let sessionOpen = false;
/** خروجٌ صريح في هذا التبويب: لا تُفتح البصمة وحدها بعده (يناديه App عند الخروج). */
/* على طريقة «مراس»: الخروجُ الصريح يسمح بمحاولةٍ تلقائية جديدة عند الدخول القادم، فلا يُمنع شيء. */
export const suppressPasskeyAuto = () => { sessionOpen = false; safeStorage.remove(AUTO_KEY, "session"); safeStorage.remove(SUPPRESS_KEY, "session"); };
/* إعادةُ المحاولة المؤجّلة (focus/مهلة) للنافذة التلقائية: تُلغى بالخروج من الشاشة وبالدخول بغير البصمة. */
let cancelRetry: (() => void) | null = null;
const dropRetry = () => { const cancel = cancelRetry; cancelRetry = null; cancel?.(); };
/** دخولٌ ناجح بغير البصمة («تجربة النظام» أو كلمة السر): تُغلق نافذتُها الجارية وتُلغى إعادتُها، ولا تُفتح وحدها حتى خروجٍ صريح. */
export const endPasskeyAuto = () => { sessionOpen = true; markAutoTried(); safeStorage.set(SUPPRESS_KEY, "1", "session"); dropRetry(); abortPasskeyLogin(); };
const autoSuppressed = () => sessionOpen || safeStorage.get(SUPPRESS_KEY, "session") === "1";
/** بطاقةُ دخولٍ أو رابطٌ باسم مستخدم: صاحبُه قد يكون غيرَ صاحب البصمة على هذا الجهاز. */
const arrivedForAnotherLogin = () => typeof window !== "undefined"
  && (isInvitationHash(window.location.hash) || new URLSearchParams(window.location.search).has("username"));

export default function PasskeyEntry({ onSuccess, compact = false, onUsePassword, onUnavailable }: {
  onSuccess: (data: any) => void;
  /** بطاقةٌ مضغوطة على طريقة «مراس»: الاسمُ والبصمةُ وزرُّ كلمة السر فقط. */
  compact?: boolean;
  onUsePassword?: () => void;
  onUnavailable?: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  /* بطاقةُ دخولٍ لغيره: تُعلَّم في التبويب فوراً، فلا يُسقطها حذفُ الرابط من العنوان ولا العودةُ من «نسيت كلمة السر». */
  const skipAuto = useRef(false);
  if (!skipAuto.current && arrivedForAnotherLogin()) { skipAuto.current = true; markAutoTried(); }

  useEffect(() => {
    if (!passkeyDeviceRemembered()) return;
    let alive = true;
    void passkeySupported().then(ok => { if (!alive) return; setReady(ok); if (!ok) onUnavailable?.(); });
    return () => { alive = false; };
  }, []);

  /* بعد خروج المكوّن من الشاشة (دخلت جلسة) لا تبدأ نافذةٌ ولا تُستدعى onSuccess. */
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; dropRetry(); }; }, []);

  const go = async (automatic = false, attempt = 0) => {
    if (ceremonyBusy || (automatic && (!mounted.current || autoSuppressed()))) return;
    ceremonyBusy = true;
    setBusy(true); setMessage("");
    try {
      const data = await loginWithPasskey();
      if (!mounted.current || (automatic && sessionOpen)) return;
      safeStorage.remove(SUPPRESS_KEY, "session");
      onSuccess(data);
    } catch (error) {
      /* أُغلقت لأن جلسةً فُتحت بغيرها، أو خرج المكوّنُ من الشاشة: لا رسالة ولا إعادة. */
      if ((error as any)?.aborted || !mounted.current) return;
      const failure = error instanceof PasskeyError ? error : null;
      /* مفتاحٌ أُزيل من حسابه: لا يبقى الزرُّ يَعِد بما لا يكون. */
      if (failure?.failure === "not-registered") { forgetPasskeyDevice(); setReady(false); onUnavailable?.(); }
      /* إلغاءُ النافذة التلقائية صامت: الزرُّ أمامه إن أرادها. */
      /* داخل تطبيق iOS قد تُرفض النافذةُ التلقائية لأن الصفحة لم تستلم التركيز بعد: نعيدها سريعاً
         (حتى ٣ مرات) عند أول focus أو بعد مهلةٍ قصيرة، أيُّهما أسبق. */
      if (automatic && attempt < 3 && Boolean((error as any)?.notFocused)) {
        let fired = false;
        let timer = 0;
        const stop = () => { fired = true; window.removeEventListener("focus", retry); window.clearTimeout(timer); };
        const retry = () => { if (fired) return; stop(); if (cancelRetry === stop) cancelRetry = null; void goRef.current(true, attempt + 1); };
        dropRetry();
        cancelRetry = stop;
        window.addEventListener("focus", retry);
        timer = window.setTimeout(retry, 500 + attempt * 400);
        return;
      }
      /* إلغاءٌ واعٍ للنافذة التلقائية (✕): لا تُفتح وحدها بعده في هذه الجلسة، فلا تحبسه في حلقة؛
         والزرُّ و«تجربة النظام» يبقيان، والخروجُ الصريح (suppressPasskeyAuto) يعيد المحاولةَ التلقائية في الدخول القادم. */
      if (automatic && failure?.failure === "cancelled" && !(error as any)?.notFocused) safeStorage.set(SUPPRESS_KEY, "1", "session");
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
      /* نافذةُ البصمة نفسها تُخفي الصفحة: غيابٌ بدأ أثناءها لا يُحسب عودةً ولو طال قبل الإلغاء. */
      if (document.visibilityState === "hidden") { hiddenAt = ceremonyBusy ? 0 : Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt >= 1500) rearm();
      hiddenAt = 0;
    };
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) rearm(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onShow);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pageshow", onShow); };
  }, []);

  useEffect(() => {
    if (!ready || skipAuto.current || autoTried() || autoSuppressed()) return;
    markAutoTried();
    let timer = 0, cancelled = false;
    const arm = () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") { document.addEventListener("visibilitychange", onVisible); return; }
      timer = window.setTimeout(() => {
        if (cancelled || autoSuppressed()) return;
        if (document.visibilityState !== "visible") { arm(); return; }
        /* نحاول فوراً؛ إن رفضها النظامُ لأن الصفحة بلا تركيز أعادتها go سريعاً (انظر أعلاه). */
        void goRef.current(true);
      }, AUTO_SETTLE_MS);
    };
    const onVisible = () => { if (document.visibilityState !== "visible") return; document.removeEventListener("visibilitychange", onVisible); arm(); };
    arm();
    return () => { cancelled = true; window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [ready, resumeTick]);

  if (!ready && compact) return <div className="passkey-card passkey-card--loading" aria-busy="true" />;
  if (!ready) return null;
  if (compact) {
    const name = passkeyDeviceName();
    return (
      <div className="passkey-card" data-guide-ignore="يدخل بالبصمة المسجّلة على هذا الجهاز؛ لا يغيّر كلمة سر ولا بيانات">
        <div className="passkey-card-actions">
          <button type="button" className="passkey-card-btn passkey-card-btn--primary" onClick={() => { void go(); }} disabled={busy} aria-label="الدخول بالبصمة" title="الدخول بالبصمة" data-guide-ignore="يدخل بالبصمة المسجّلة على هذا الجهاز؛ لا يغيّر كلمة سر ولا بيانات">
            {busy ? <span className="button-spinner" /> : <Fingerprint aria-hidden="true" />}
          </button>
          <button type="button" className="passkey-card-btn" onClick={() => onUsePassword?.()} disabled={busy} aria-label="الدخول بكلمة السر" title="الدخول بكلمة السر" data-guide-ignore="يُظهر حقلَي اسم المستخدم وكلمة السر بدل بطاقة البصمة؛ لا يغيّر بيانات">
            <LockKeyhole aria-hidden="true" />
          </button>
        </div>
        {name ? <b className="passkey-card-name">{name}</b> : null}
        {message ? <p role="alert">{message}</p> : null}
      </div>
    );
  }
  return (
    <div className="passkey-entry" data-guide-ignore="يدخل بالبصمة المسجّلة على هذا الجهاز؛ لا يغيّر كلمة سر ولا بيانات">
      <button type="button" className="passkey-go" onClick={() => { void go(); }} disabled={busy} aria-label="الدخول بالبصمة" data-guide-ignore="يدخل بالبصمة المسجّلة على هذا الجهاز؛ لا يغيّر كلمة سر ولا بيانات">
        {busy ? <span className="button-spinner" /> : <><Fingerprint aria-hidden="true" /> الدخول بالبصمة</>}
      </button>
      {message ? <p role="alert">{message}</p> : null}
    </div>
  );
}
