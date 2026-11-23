/**
 * داخل التطبيق الرسمي (WKWebView) لا تظهر خطوات «مشاركة ← الشاشة الرئيسية ← الجرس»؛ وفي المتصفح لا يتغير شيء.
 */
import { pushSupport } from "../src/utils/pushClient";
import { PUSH_CARD_JS } from "../src/server/pushCard";
import { STUDENT_EXTRAS_SCRIPT } from "../src/server/studentExtrasScript";

let failed = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? "  ✓" : "  ✗"} ${label}`); if (!ok) failed++; };
const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const setEnv = (native: boolean) => {
  (globalThis as any).window = { isSecureContext: true, matchMedia: () => ({ matches: false }), navigator: {}, ...(native ? { Capacitor: { isNativePlatform: () => true } } : {}) };
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: iphone, platform: "iPhone", maxTouchPoints: 5 }, configurable: true });
};
setEnv(false);
check(pushSupport() === "ios-install", "Safari على iPhone: تبقى خطوات الشاشة الرئيسية كما هي");
setEnv(true);
check(pushSupport() === "none", "داخل التطبيق: لا خطوات ولا بطاقة");
check(/function gxNative\(\)/.test(STUDENT_EXTRAS_SCRIPT) && /gxPushState\(\)\{var d=GX\.d&&GX\.d\.push;if\(!d\|\|gxNative\(\)\)/.test(STUDENT_EXTRAS_SCRIPT), "كرت الطالب: لا بطاقة تنبيهات داخل التطبيق");
check(/PC\.ready=true;var e=pcEnv\(\);\s*if\(\(window\.Capacitor/.test(PUSH_CARD_JS), "كرت الأستاذ: لا شارة تنبيهات داخل التطبيق");
if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log("ok");
