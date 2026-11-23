/**
 * ── محرّكُ الطباعة: السماتُ نفسها التي يضعها «مركز الاستعلام» قبل أن يطبع ─────────────────────────
 * Safari (وChrome على iPhone/iPad، وهو WebKit) يتجاهل `@page size`، فتُرسم الورقة العرضية مُدارةً داخل
 * صفحته الطولية (html[data-print-rotate]). وChromium المكتبي يأخذ العرضيّ من `@page`، وتُثبَّت له هندسة A4
 * (html[data-print-chromium]). نسخةٌ من فحص Reports.tsx نفسه، لأوراقٍ تُطبع خارج مطبعته (ورقة المطابقة).
 */
import { isNativeApp } from "./nativeApp";
const ua = () => (typeof navigator !== "undefined" ? navigator.userAgent || "" : "");
export const isSafariPrint = () => /AppleWebKit/i.test(ua()) && !/(Chrome|Chromium|CriOS|FxiOS|Edg|EdgiOS|OPR|Android)/i.test(ua());
export const isChromiumPrint = () => /(Chrome|Chromium|Edg)\//i.test(ua()) && !/(CriOS|EdgiOS|OPR|Android)/i.test(ua());
export const isIosChromePrint = () => /CriOS/i.test(ua());

/** يضع سمات المحرّك على الجذر ويُرجع دالّةً ترفعها. */
export function stampPrintEngine(root: HTMLElement): () => void {
  if (isSafariPrint() || isIosChromePrint()) root.dataset.printRotate = "1";
  if (isChromiumPrint()) root.dataset.printChromium = "1";
  return () => { delete root.dataset.printRotate; delete root.dataset.printChromium; };
}

/** document.execCommand("print") مسارُ Safari وحده: التطبيق (WKWebView) يطبع بـ window.print() عبر جسره الأصلي. */
export const canExecCommandPrint = () => isSafariPrint() && !isNativeApp();
