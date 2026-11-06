/**
 * One rule for "is this a phone-sized workspace?", shared by the schedule and
 * the reports, so the same screen never edits in one place and refuses in the
 * other.
 *
 * Decided by the room the page actually has, not by the device name:
 *  - a phone, folded foldable, or a half/third of Split View → phone workspace
 *    (read-only wide views, list-first);
 *  - a tablet, or a foldable opened (portrait ~669px, landscape ~951px), or the
 *    wide share of Split View (~620px) → the full workspace.
 * Callers re-evaluate on resize/orientationchange, so folding, opening or
 * splitting switches live without a reload and without losing what is typed.
 */

/** Below this page width a touch device gets the phone workspace. */
export const WORKSPACE_MIN_WIDTH = 600;

/** The legacy desktop fold: a narrow mouse window keeps the old 760px rule. */
const DESKTOP_NARROW_WIDTH = 760;

/** A phone stays a phone after rotation. Width-only media queries turn an
 * iPhone landscape into a desktop, so touch devices are judged by the device
 * short edge too (an iPhone is ≤600pt on its short side whatever the page
 * width); a big touch screen is judged by the width the page really has. */
export function isPhoneDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  const mobileUa = Boolean(nav.userAgentData?.mobile) || /iPhone|iPod|Android.+Mobile|Mobile/i.test(nav.userAgent || "");
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  if (!mobileUa && !coarse) return false;
  const shortEdge = Math.min(Number(window.screen?.width || window.innerWidth), Number(window.screen?.height || window.innerHeight));
  return shortEdge <= 600 || window.innerWidth < WORKSPACE_MIN_WIDTH;
}

/** Narrow workspace for any device: touch devices follow {@link isPhoneDevice};
 * a mouse window narrower than 760px keeps the fold it always had. */
export function isNarrowWorkspace(): boolean {
  if (typeof window === "undefined") return false;
  const touch = (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) || (window.matchMedia?.("(pointer: coarse)").matches ?? false);
  if (touch) return isPhoneDevice();
  return window.innerWidth <= DESKTOP_NARROW_WIDTH;
}
