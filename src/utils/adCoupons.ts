/**
 * ── كوبون فريد لكل طالب ─────────────────────────────────────────────────────────
 *
 * الكوبونُ لا يحمل هويةً: ثمانية رموزٍ عشوائية يولّدها متصفح الطالب (مفتاح الجهاز)، وستةٌ يوقّعها الخادم عليها وعلى رقم الحملة (HMAC بسرٍّ لا
 * يغادر الخادم). فيتحقق المتجرُ أن الكوبون صدر من هنا فعلاً دون أن نخزّن الكوبونات الصادرة؛ ولا يُخزَّن إلا ما استُعمل، فيستحيل استعماله مرتين.
 * نقيٌّ إلا من التشفير؛ للخادم وحده.
 */
import { createHash, createHmac, timingSafeEqual } from "crypto";

/** اثنان وثلاثون رمزاً بلا ما يلتبس (0/O وَ1/I). */
export const COUPON_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const DEVICE_LEN = 8, TAG_LEN = 6;
export const COUPON_LEN = DEVICE_LEN + TAG_LEN;

/** يطبّع ما كتبه إنسانٌ أو مسحه QR: أحرفٌ كبيرة، ويُسقط الفواصل والفراغات. */
export const normalizeCoupon = (raw: unknown): string => String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const wellFormed = (code: string) => code.length === COUPON_LEN && [...code].every(ch => COUPON_ALPHABET.includes(ch));

/** مفتاح الجهاز: ثمانية رموزٍ من الأبجدية. */
export const cleanDeviceKey = (raw: unknown): string => {
  const key = normalizeCoupon(raw);
  return key.length === DEVICE_LEN && [...key].every(ch => COUPON_ALPHABET.includes(ch)) ? key : "";
}

function tagOf(secret: string, campaignId: string, deviceKey: string): string {
  const mac = createHmac("sha256", secret).update(`coupon|${campaignId}|${deviceKey}`).digest();
  return Array.from({ length: TAG_LEN }, (_, i) => COUPON_ALPHABET[mac[i] % 32]).join("");
}

/** الكوبون الصادر لهذا الجهاز في هذه الحملة (نفسُه كلَّ مرة)، أو "" إن كان المفتاح غير صالح. */
export function issueCoupon(secret: string, campaignId: string, deviceKey: unknown): string {
  const key = cleanDeviceKey(deviceKey);
  return key ? key + tagOf(secret, campaignId, key) : "";
}

/** الكوبون المطبَّع إن كان توقيعُه سليماً لهذه الحملة، وإلا "". المقارنة بزمنٍ ثابت. */
export function verifyCoupon(secret: string, campaignId: string, raw: unknown): string {
  const code = normalizeCoupon(raw);
  if (!wellFormed(code)) return "";
  const want = Buffer.from(tagOf(secret, campaignId, code.slice(0, DEVICE_LEN)));
  const have = Buffer.from(code.slice(DEVICE_LEN));
  return want.length === have.length && timingSafeEqual(want, have) ? code : "";
}

/** للعرض: XXXX-XXXX-XXXX-XX. */
export const formatCoupon = (code: string): string => (code.match(/.{1,4}/g) || []).join("-");

/** معرّفُ صفحة التحقق للمتجر: مشتقٌّ من رمز التقرير ولا يكشفه (لا يفتح تقرير الحملة). */
export const verifyId = (reportToken: string): string => createHash("sha256").update(`verify|${reportToken}`).digest("hex").slice(0, 32);
