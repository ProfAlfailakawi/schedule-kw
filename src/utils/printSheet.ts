/**
 * ── طباعةُ ورقةٍ مستقلة (HTML كامل) ──────────────────────────────────────────
 * المتصفح: نافذةٌ جديدة ثم print() كما كان. التطبيق الرسمي: window.open("") يُرجع null وجسرُ الطباعة
 * يطبع الإطارَ الرئيسي وحده (لا iframe)، فتُعرض الورقة في طبقةٍ داخل الصفحة تُخفي @media print بقيّتها.
 */
import { isNativeApp } from "./nativeApp";

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
