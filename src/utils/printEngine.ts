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

/* ── طباعةُ ورقةٍ مستقلة (HTML كامل): نافذة في المتصفح، وطبقةٌ داخل الصفحة في التطبيق ── */
export const PRINT_SHEET_ID = "app-print-sheet";
export const POPUP_BLOCKED_MESSAGE = "تعذّر فتح معاينة الطباعة. أعد المحاولة.";

export function extractPrintParts(html: string): { css: string; body: string } {
  const css = Array.from(html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)).map(m => m[1]).join("\n");
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = m ? m[1] : html; // innerHTML لا ينفّذ <script>؛ والـ HTML مولَّد من التطبيق نفسه
  return { css, body };
}

const OVERLAY_CSS =
  `#${PRINT_SHEET_ID}{position:fixed;inset:0;z-index:2147483000;background:#fff;overflow:auto;-webkit-overflow-scrolling:touch}` +
  `#${PRINT_SHEET_ID} .app-print-bar{position:sticky;top:0;display:flex;gap:8px;justify-content:center;padding:10px;background:#f1f5f9;direction:rtl}` +
  `#${PRINT_SHEET_ID} .app-print-bar button{font:700 15px Tahoma,sans-serif;padding:9px 18px;border-radius:10px;border:0;background:#1d4ed8;color:#fff}` +
  `#${PRINT_SHEET_ID} .app-print-bar button.x{background:#e2e8f0;color:#0f172a}` +
  `@media print{body>*:not(#${PRINT_SHEET_ID}){display:none!important}#${PRINT_SHEET_ID}{position:static!important;overflow:visible!important}#${PRINT_SHEET_ID} .app-print-bar{display:none!important}}`;

/** يعرض الورقة في طبقةٍ داخل الصفحة ويطبع الإطار الرئيسي. يُرجع دالّة الإغلاق. */
export function printInPage(html: string, doc: Document = document, print: () => void = () => window.print()): () => void {
  doc.getElementById(PRINT_SHEET_ID)?.remove();
  const { css, body } = extractPrintParts(html);
  const style = doc.createElement("style");
  style.textContent = css + "\n" + OVERLAY_CSS;
  const overlay = doc.createElement("div");
  overlay.id = PRINT_SHEET_ID;
  overlay.setAttribute("dir", "rtl");
  overlay.innerHTML = `<div class="app-print-bar"><button type="button" class="p">طباعة</button><button type="button" class="x">إغلاق</button></div>${body}`;
  const close = () => { try { style.remove(); } catch { /* ignore */ } try { overlay.remove(); } catch { /* ignore */ } };
  overlay.querySelector(".p")?.addEventListener("click", () => print());
  overlay.querySelector(".x")?.addEventListener("click", close);
  doc.head.appendChild(style);
  doc.body.appendChild(overlay);
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts?.ready;
  Promise.resolve(fonts).then(() => setTimeout(print, 200), () => print());
  return close;
}

/** false = حجبَ المتصفحُ النافذة (لا يحدث في التطبيق). */
export function printSheet(html: string, features?: string): boolean {
  if (isNativeApp()) { printInPage(html); return true; }
  const win = window.open("", "_blank", features);
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.setTimeout(() => win.print(), 250);
  return true;
}
