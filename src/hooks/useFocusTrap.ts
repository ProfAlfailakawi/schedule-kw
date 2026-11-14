/**
 * ── حبس التركيز داخل النافذة المنبثقة ─────────────────────────────────────────
 *
 * نوافذ الشاشة تعلن aria-modal="true" لكن التركيز كان يبقى خلفها: Tab يمشي في الصفحة
 * المحجوبة وقارئ الشاشة يقرأ ما تحتها، وعند الإغلاق يضيع مكان المستخدم. هذا مرجعٌ
 * (ref) واحدٌ صغير يكفي وضعُه على عنصر النافذة:
 *   - عند ظهورها ينتقل التركيز إلى أول عنصر قابل للتركيز فيها (أو إليها).
 *   - Tab وShift+Tab يدوران داخلها.
 *   - عند زوالها يعود التركيز إلى ما كان عليه قبل فتحها.
 * يعمل مع النوافذ المرسومة شرطياً لأنه مرجعٌ بتنظيف (React 19) لا هوك يُستدعى شرطاً.
 */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

const visible = (element: HTMLElement) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";

export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible);
}

export function trapFocusRef(element: HTMLElement | null): void | (() => void) {
  if (!element) return;
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (!element.hasAttribute("tabindex")) element.setAttribute("tabindex", "-1");
  const raf = requestAnimationFrame(() => {
    if (element.contains(document.activeElement)) return;
    (focusableIn(element)[0] || element).focus({ preventScroll: true });
  });
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Tab") return;
    const items = focusableIn(element);
    if (!items.length) { event.preventDefault(); element.focus(); return; }
    const first = items[0], last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !element.contains(active))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (active === last || !element.contains(active))) { event.preventDefault(); first.focus(); }
  };
  element.addEventListener("keydown", onKey);
  return () => {
    cancelAnimationFrame(raf);
    element.removeEventListener("keydown", onKey);
    if (previous && previous.isConnected) previous.focus({ preventScroll: true });
  };
}
