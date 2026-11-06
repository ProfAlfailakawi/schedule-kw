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

/** Below this page width a touch device gets the phone workspace. Kept a little
 * under the Duo's opened portrait width so the exact CSS width a real device
 * reports (it varies with Safari's chrome and Split View) never flips it back. */
export const WORKSPACE_MIN_WIDTH = 560;

/** And below this page height too: an iPhone turned to landscape is wide but
 * short (~390-430px), an opened Duo (portrait or landscape) is tall enough. */
export const WORKSPACE_MIN_HEIGHT = 480;

/** The legacy desktop fold: a narrow mouse window keeps the old 760px rule. */
const DESKTOP_NARROW_WIDTH = 760;

/** A phone stays a phone after rotation: wide-but-short (iPhone landscape) is
 * still a phone. Judged only by the room the page really has (width AND height),
 * never by `screen.*`, which a foldable may keep reporting as the folded size
 * after it is opened. Opened Duo (≈669×880 / ≈951×600), the wide share of Split
 * View (≈620×600) and a tablet get the full workspace (week + rooms editable). */
export function isPhoneDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  const mobileUa = Boolean(nav.userAgentData?.mobile) || /iPhone|iPod|Android.+Mobile|Mobile/i.test(nav.userAgent || "");
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  if (!mobileUa && !coarse) return false;
  return window.innerWidth < WORKSPACE_MIN_WIDTH || window.innerHeight < WORKSPACE_MIN_HEIGHT;
}

/** Narrow workspace for any device: touch devices follow {@link isPhoneDevice};
 * a mouse window narrower than 760px keeps the fold it always had. */
export function isNarrowWorkspace(): boolean {
  if (typeof window === "undefined") return false;
  const touch = (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) || (window.matchMedia?.("(pointer: coarse)").matches ?? false);
  if (touch) return isPhoneDevice();
  return window.innerWidth <= DESKTOP_NARROW_WIDTH;
}
