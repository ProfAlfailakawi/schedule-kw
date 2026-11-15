/**
 * ── التطبيق الرسمي: التعرّف عليه، ودعوةُ تحميله، وتسليمُ الدخول إليه ───────────
 *
 * المتصفح (Safari على آيفون وآيباد وماك) يدعو مرةً واحدةً إلى التطبيق الرسمي؛ والتطبيق
 * نفسه يأخذ دخولَ المتصفح بلمسةٍ واحدة عبر ‎/app-handoff/*‎ (src/server/appHandoff.ts) فلا يكتب أحدٌ شيئاً.
 * ما يلزم من جهة التطبيق مكتوبٌ في docs/NATIVE-APP-HANDOFF.md.
 */
import { safeStorage } from "./safeStorage";

export const APP_STORE_URL = "https://apps.apple.com/kw/app/id6834584330";
const OFFER_KEY = "schedule-app-offer-until";
const DAY = 86_400_000;

const w = (): any => (typeof window === "undefined" ? {} : window);

/** داخل غلاف Capacitor (التطبيق الرسمي) لا في المتصفح. */
export const isNativeApp = (): boolean => Boolean(w().Capacitor?.isNativePlatform?.()) || Boolean(w().webkit?.messageHandlers?.appHandoff);

/** متصفحٌ على جهاز آبل يُنزَّل عليه التطبيق: آيفون، آيباد (حتى بهيئة ماك)، أو Safari على الماك. */
export function isAppleBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return true;
  if (/macintosh/i.test(ua)) return (navigator.maxTouchPoints || 0) > 1 || (/safari/i.test(ua) && !/chrome|chromium|edg|firefox|opr/i.test(ua));
  return false;
}

export const isStandalonePwa = (): boolean =>
  typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true);

/** هل يُعرض على هذا المتصفح أن يحمّل التطبيق؟ (مرةً، ثم هدوءٌ طويل). */
export function appOfferDue(now = Date.now()): boolean {
  if (!isAppleBrowser() || isNativeApp() || isStandalonePwa()) return false;
  const until = Number(safeStorage.get(OFFER_KEY) || 0);
  return !(until > now);
}
/** «لاحقاً»: أسبوع. «حمّل»: ثلاثة أشهر (إن حمّله فلن نزعجه، وإن لم يفعل نذكّره بلطف). */
export const snoozeAppOffer = (days: number) => safeStorage.set(OFFER_KEY, String(Date.now() + days * DAY));
export const APP_OFFER_LATER_DAYS = 7;
export const APP_OFFER_DOWNLOADED_DAYS = 90;

/* ── التسليم: التطبيق ينفّذ ASWebAuthenticationSession ويردّ الرمز ──────────── */

export const nativeHandoffAvailable = (): boolean => typeof w().webkit?.messageHandlers?.appHandoff?.postMessage === "function";

export type HandoffFailure = "no-session" | "password-first" | "cancelled" | "failed";

const b64url = (bytes: ArrayBuffer | Uint8Array) => {
  let text = ""; new Uint8Array(bytes as ArrayBuffer).forEach(byte => { text += String.fromCharCode(byte); });
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** يطلب من التطبيق نقل دخول Safari إليه، ثم يبدّل الرمزَ بجلسةٍ في هذا الغلاف. لا يعود إلا بفشل. */
export async function runNativeHandoff(): Promise<HandoffFailure> {
  if (!nativeHandoffAvailable() || !crypto?.subtle) return "failed";
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return new Promise<HandoffFailure>(resolve => {
    const done = (value: HandoffFailure) => { window.removeEventListener("app-handoff", onResult); window.clearTimeout(timer); resolve(value); };
    const onResult = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.code && /^[A-Za-z0-9_-]{43}$/.test(String(detail.code))) {
        window.location.assign(`/app-handoff/redeem?code=${encodeURIComponent(detail.code)}&verifier=${encodeURIComponent(verifier)}`);
        return;
      }
      done(detail.error === "no-session" || detail.error === "password-first" || detail.error === "cancelled" ? detail.error : "failed");
    };
    const timer = window.setTimeout(() => done("failed"), 120_000);
    window.addEventListener("app-handoff", onResult);
    try { w().webkit.messageHandlers.appHandoff.postMessage({ challenge }); } catch { done("failed"); }
  });
}
