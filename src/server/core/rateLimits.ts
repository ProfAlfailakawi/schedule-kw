/**
 * ── حدودُ المعدّل للدخول والروابط العامة ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { Request, Response, NextFunction } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { createHash } from "crypto";

/* ── بطاقةُ الأستاذ: الحدُّ لكل رابطٍ شخصيّ، وسقفٌ لكل عنوان ─────────────────────
   كانت كلُّ حدودها (٦٠ طلباً عامّاً، و٣٠ إرسالاً وردّاً، و٩٠ فحصَ أوقات، و١٢٠ بثّاً في الدقيقة) على العنوان، وبطاقةٌ
   واحدةٌ تنادي نحو عشرة طلبات: فشبكةُ الجامعة (أو مشغّلُ الجوال خلف NAT) عنوانٌ واحدٌ لعشرات الأساتذة، وفي اختبار
   التحمّل (scripts/loadtest/teacher-card.mjs) رُدّ ١٥ من ١٦ توقيعاً بـ٤٢٩ من عنوانٍ واحد. صار الحدُّ لكل رابطٍ
   (الرابطُ مفتاحٌ شخصيٌّ طويلٌ لا يُخمَّن)، وفوقه سقفٌ لكل عنوانٍ يتّسع لنحو ثلاثين بطاقةً في الدقيقة.
   المفتاحُ بصمةٌ (sha256) لا الرابطُ نفسُه: الذاكرةُ لا تحمل رابطاً. */
export const requestTokenKey = (req: Request): string => {
  const token = String(req.params?.token || "");
  return token ? `req:${createHash("sha256").update(token).digest("hex").slice(0, 32)}` : `ip:${ipKeyGenerator(req.ip || "unknown")}`;
};
const REQUEST_IP_CEILING = (() => { const n = Number(process.env.PUBLIC_REQUEST_PER_IP_PER_MINUTE); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1500; })();
const REQUEST_TOKEN_CEILING = (() => { const n = Number(process.env.PUBLIC_REQUEST_PER_LINK_PER_MINUTE); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 240; })();

/**
 * ── Rate limit for the public surface (`/api/public/*`) ──────────────────────
 *
 * Everything under `/api/public` answers without an account: a share token in
 * the URL is the whole key. That is what makes those endpoints useful — a
 * student opens a link and reads their schedule — and also what makes them the
 * cheapest place to guess tokens, scrape a term, or hammer the OCR upload. The
 * login form was already limited; this closes the other door with the same
 * simple in-memory counter, kept deliberately generous so real use never feels
 * it: a survey page makes a handful of calls, a calendar client polls rarely.
 *
 * Both numbers are environment-tunable because the right value depends on the
 * deployment, not on the code: a college behind one NAT address is many people
 * on one `req.ip`. `PUBLIC_RATE_LIMIT_MAX=0` turns the limit off entirely.
 *
 * The counter lives in this process only — see SECURITY-TODO.md item 3 for why
 * that is a ceiling on what it can promise across several Cloud Run instances.
 */
function readRateLimitEnv(name: string, fallback: number): number {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return Math.floor(value);
}
const PUBLIC_RATE_LIMIT_MAX = readRateLimitEnv("PUBLIC_RATE_LIMIT_MAX", 60);
const PUBLIC_RATE_LIMIT_WINDOW_MS = Math.max(1000, readRateLimitEnv("PUBLIC_RATE_LIMIT_WINDOW_MS", 60000));
const publicRequestWindows = new Map<string, { count: number; windowStart: number }>();
let publicRateLimitSweptAt = 0;

export function rateLimitPublic(req: Request, res: Response, next: NextFunction) {
  if (PUBLIC_RATE_LIMIT_MAX <= 0) { next(); return; }
  /* «مساري» (/api/public/me/*) له حدودُه التي تحكمه (أخطاء الرمز على الملف والعنوان، والكتابة في الدقيقة)،
     ولا يصحّ أن يزاحمه عدّادٌ واحدٌ لكل عنوان: شبكةُ الجامعة عنوانٌ واحد لآلاف الطلبة، وصفحةُ الباب
     الواحدة تنادي خمسَ مراتٍ — فيُحجب الطالبُ التاسعُ في الدقيقة ويومُ التسجيل هو يومُه. */
  if (req.originalUrl.startsWith("/api/public/me/")) { next(); return; }
  /* وبطاقةُ الأستاذ (/api/public/request/:token/*) حدُّها لكل رابطٍ وسقفٌ لكل عنوانٍ أوسع (requestLinkLimit). */
  if (req.originalUrl.startsWith("/api/public/request/")) { next(); return; }
  const now = Date.now();
  // Expired windows are dropped once per window, so a long-lived instance that
  // has served many addresses does not keep a row for every one of them.
  if (now - publicRateLimitSweptAt > PUBLIC_RATE_LIMIT_WINDOW_MS) {
    publicRateLimitSweptAt = now;
    for (const [key, seen] of publicRequestWindows) {
      if (now - seen.windowStart >= PUBLIC_RATE_LIMIT_WINDOW_MS) publicRequestWindows.delete(key);
    }
  }
  const ip = req.ip || "unknown";
  const seen = publicRequestWindows.get(ip);
  if (!seen || now - seen.windowStart >= PUBLIC_RATE_LIMIT_WINDOW_MS) {
    publicRequestWindows.set(ip, { count: 1, windowStart: now });
    next();
    return;
  }
  seen.count += 1;
  if (seen.count > PUBLIC_RATE_LIMIT_MAX) {
    const retryAfterSeconds = Math.max(1, Math.ceil((seen.windowStart + PUBLIC_RATE_LIMIT_WINDOW_MS - now) / 1000));
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({ error: "طلبات كثيرة جداً من هذا الاتصال. انتظر قليلاً ثم أعد المحاولة." });
    return;
  }
  next();
}
export const requestLinkLimit = [
  rateLimit({ windowMs: 60_000, limit: REQUEST_IP_CEILING, keyGenerator: req => `ip:${ipKeyGenerator(req.ip || "unknown")}`, standardHeaders: true, legacyHeaders: false,
    message: { error: "طلباتٌ كثيرة من هذه الشبكة في وقتٍ قصير. انتظر دقيقةً ثم أعد المحاولة." } }),
  rateLimit({ windowMs: 60_000, limit: REQUEST_TOKEN_CEILING, keyGenerator: requestTokenKey, standardHeaders: true, legacyHeaders: false,
    message: { error: "طلباتٌ كثيرة في وقتٍ قصير. انتظر قليلاً ثم أعد المحاولة." } }),
];
