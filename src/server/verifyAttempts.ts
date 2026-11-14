/**
 * ── حدُّ التخمين في «تحقّق من توقيعك»: لكل هدف، وسقفٌ أوسع لكل عنوان ──────────────
 *
 * كان العدّاد نطاقاً واحداً لكل عنوان: عشرُ محاولاتٍ فاشلة من شبكة الجامعة (عنوانٌ واحد يقف خلفه ألوف)
 * تحجب الجميعَ عشر دقائق. والذي يستحقّ الحجب هو من يخمّن **رقماً مدنياً بعينه**.
 *
 *   الهدف    بصمةُ الرقم المدني (surveyFingerprint)، لا الرقمُ نفسه: عشرُ محاولاتٍ فاشلة على رقمٍ واحد تحجب
 *            ذلك الرقمَ وحده، ولو جاءت من عناوين شتّى. لا تُخزَّن ولا تُعاد في جواب: المفتاحُ هنا بصمةٌ مضافٌ إليها وسمُ الباب.
 *   العنوان  سقفٌ أوسع بكثير (مئةٌ وعشرون محاولةً فاشلة في النافذة) يوقف من يمسح أرقاماً كثيرة من عنوانٍ واحد،
 *            ولا يوقف أساتذةً عدّةً أخطأ كلٌّ منهم مرّةً من الشبكة نفسها.
 *
 * المحاولةُ تُحجز عند الدخول وتُرجَع بالنجاح (كبقية الأبواب العامة)، والعدّادُ في ذاكرة النسخة: على نسختين من
 * الخادم لكلٍّ عدّادُها، وهو حدٌّ معروف (docs/teacher-card/README-AR.md).
 */
import { createAttemptLimiter, limiterOptionsFromEnv } from "./publicAttemptLimiter";

export const VERIFY_IP_CEILING = 120;

export function createVerifyAttemptGuard(options: { now?: () => number; targetMax?: number; ipMax?: number; windowMs?: number } = {}) {
  const base = limiterOptionsFromEnv();
  const windowMs = options.windowMs ?? base.windowMs;
  const target = createAttemptLimiter({ maxFailures: options.targetMax ?? base.maxFailures, windowMs, now: options.now });
  const ip = createAttemptLimiter({ maxFailures: options.ipMax ?? VERIFY_IP_CEILING, windowMs, now: options.now });
  return {
    /** يحجز محاولةً على الهدف وعلى العنوان معاً؛ `blocked` يقول أيَّهما استُنفد. */
    reserve(fingerprint: string, address: string): { release(): void } | { blocked: "target" | "ip" } {
      const byIp = ip.reserve(`verify-ip|${address || "unknown"}`);
      if (!byIp) return { blocked: "ip" };
      const byTarget = target.reserve(`verify-target|${fingerprint}`);
      /* هدفٌ محجوب: لا يُحسب على العنوان. */
      if (!byTarget) { byIp.release(false); return { blocked: "target" }; }
      return { release() { byTarget.release(); byIp.release(); } };
    },
  };
}

export const verifyAttempts = createVerifyAttemptGuard();
