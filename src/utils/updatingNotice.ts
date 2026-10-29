/**
 * ── «نُحدّث البرنامج» داخل التطبيق ─────────────────────────────────────────
 *
 * أثناء النشر تجيب واجهةُ Google الأمامية طلباتِ /api بصفحة HTML إنجليزية
 * (500/502/503/504) لا يكتبها خادمُنا — هو يجيب /api بـJSON دائماً. كانت الشاشات
 * تحاول قراءتها JSON فتعرض خطأً غامضاً، وكانت «الاستعادة» تظنّها نسخةً قديمة
 * فتمسح الذاكرة وتُسقط العامل في اللحظة التي يلزم فيها.
 *
 * هنا يُعرف ذلك الجواب، ويظهر شريطٌ هادئ واحد بدل لافتة الخطأ، ويسأل
 * /api/health كل ثلاث ثوانٍ حتى يعود الخادم فيختفي ويُعلم من ينتظر.
 */

const UPDATING_STATUSES = new Set([500, 502, 503, 504]);

export const UPDATING_MESSAGE = "نُحدّث البرنامج الآن ✨ لحظاتٍ ونعود.";
export const UPDATING_WRITE_MESSAGE = `${UPDATING_MESSAGE} إن كنت تحفظ تغييراً فتأكد من حالته بعد عودتنا.`;
/** يُطلق على window حين يعود الخادم. */
export const SERVER_BACK_EVENT = "schedule:server-back";

/** جوابُ المنصّة لا جوابُ البرنامج: 5xx بغير JSON. */
export const isPlatformUpdating = (status: number, contentType: string | null | undefined) =>
  UPDATING_STATUSES.has(status) && !String(contentType || "").includes("application/json");

let notice: HTMLElement | null = null;
const waiting = new Set<() => void>();

/**
 * يُظهر الشريطَ مرّةً واحدة مهما تكرّر الطلب، ويسأل `probe` كل ثلاث ثوانٍ
 * (ويتباطأ إلى خمس عشرة)، فإذا أجاب أخفاه ونادى `onBack` ومن سبقه.
 */
export function showUpdatingNotice(probe: () => Promise<boolean>, onBack?: () => void): void {
  if (onBack) waiting.add(onBack);
  if (notice || typeof document === "undefined" || !document.body) return;
  const bar = document.createElement("div");
  bar.className = "schedule-updating-notice";
  bar.setAttribute("role", "status");
  bar.setAttribute("aria-live", "polite");
  bar.dir = "rtl";
  bar.textContent = UPDATING_MESSAGE;
  bar.style.cssText = [
    "position:fixed", "inset-inline:0", "bottom:max(18px,env(safe-area-inset-bottom))", "margin:0 auto", "width:max-content", "max-width:calc(100vw - 32px)",
    "z-index:2147483000", "padding:11px 18px", "border-radius:14px", "font-family:inherit", "font-size:14px", "font-weight:600", "line-height:1.6",
    "background:var(--surface,#fff)", "color:var(--ink,#131817)", "border:1px solid var(--line,#e3e6e0)",
    "box-shadow:0 14px 36px rgb(12 24 20 / .18)", "text-align:center", "pointer-events:none",
  ].join(";");
  document.body.appendChild(bar);
  notice = bar;
  let tries = 0;
  const ask = async () => {
    const back = await probe().catch(() => false);
    if (!back) { tries++; window.setTimeout(ask, Math.min(15_000, 3000 * Math.pow(1.3, Math.max(0, tries - 5)))); return; }
    bar.remove();
    notice = null;
    const callbacks = [...waiting];
    waiting.clear();
    callbacks.forEach(callback => { try { callback(); } catch { /* one waiter must not stop the others */ } });
    window.dispatchEvent(new Event(SERVER_BACK_EVENT));
  };
  window.setTimeout(ask, 3000);
}
