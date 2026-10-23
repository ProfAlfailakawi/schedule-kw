/**
 * ── روابط ملف الشراكة الخاصة بالشركات ─────────────────────────────────────────────
 *
 * لكل شركة رابطٌ باسمها يُسجَّل فتحُه، فتعرف الإدارةُ من اطّلع ومتى. الحالة تُحسب من الحقول
 * (إيقافٌ يدوي أو موعد انتهاء) فلا تُخزَّن. نقيٌّ بلا شبكة ولا قاعدة بيانات.
 */
import type { PartnerLink } from "../types";

export type PartnerLinkState = "active" | "expired" | "revoked";

export const partnerLinkState = (link: Pick<PartnerLink, "revoked" | "expiresAt">, now = Date.now()): PartnerLinkState => {
  if (link.revoked) return "revoked";
  const end = link.expiresAt ? Date.parse(link.expiresAt) : NaN;
  return Number.isFinite(end) && end <= now ? "expired" : "active";
};

/** مدّة صلاحية الرابط بالأيام: عددٌ صحيحٌ بين ١ و٣٦٥، وإلا بلا انتهاء. */
export const cleanExpiryDays = (raw: unknown): number => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 365 ? n : 0;
};
