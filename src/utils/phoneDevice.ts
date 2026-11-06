/** هاتف حقيقي لا نافذة ضيقة: الجدول عليه قائمة للقراءة، والمرشد يقرأ القاعدة نفسها. */
export function isPhoneDevice() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  const mobileUa = Boolean(nav.userAgentData?.mobile) || /iPhone|iPod|Android.+Mobile|Mobile/i.test(nav.userAgent || "");
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  if (!mobileUa && !coarse) return false;
  const shortEdge = Math.min(Number(window.screen?.width || window.innerWidth), Number(window.screen?.height || window.innerHeight));
  return shortEdge <= 600 || window.innerWidth < 700;
}
