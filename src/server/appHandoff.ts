/**
 * ── تسليمُ الدخول من المتصفح إلى التطبيق الرسمي ───────────────────────────────
 *
 * من دخل ببطاقته في Safari ثم حمّل التطبيق لا يكتب شيئاً: التطبيق يفتح جلسة
 * ASWebAuthenticationSession (تشارك كوكيز Safari) على ‎/app-handoff/start‎، فيعود إليه
 * رمزٌ لمرةٍ واحدة، ثم يبدّله بجلسته الخاصة عبر ‎/app-handoff/redeem‎.
 *
 *   GET /app-handoff/start?challenge=<sha256(verifier) base64url>
 *        بكوكي الجلسة → 302 إلى schedulekw://handoff?code=…  (أو ?error=…)
 *   GET /app-handoff/redeem?code=…&verifier=…
 *        يبدّل الرمزَ بجلسةٍ جديدة في مخزن التطبيق → 302 إلى ‎/‎
 *
 * الأمان: الرمز دقيقتان ويُستهلك مرة، ومربوطٌ بـverifier لا يعرفه إلا التطبيق الذي طلبه
 * (PKCE) فلا ينفع تطبيقاً آخر يلتقط المخطط، ولا تُسلَّم جلسةُ التجربة، ولا من لم يغيّر كلمته الأولى.
 */
import type { Express, Request, Response } from "express";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { rateLimit } from "express-rate-limit";
import { Repository } from "../db/repository";
import { getCookies, SERVER_IDLE_SESSION_MS } from "./core/auth";

export const APP_HANDOFF_SCHEME = "schedulekw";
export const APP_HANDOFF_TTL_MS = 2 * 60 * 1000;

type Handoff = { userId: number; memberId?: string; sourceSessionId: string; challenge: string; expiresAt: number; usedAt?: number };

const secure = () => (process.env.NODE_ENV === "production" ? "; Secure" : "");
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const CODE = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;

export const handoffChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

const sameText = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const back = (res: Response, query: string) => { res.setHeader("Cache-Control", "no-store"); res.redirect(302, `${APP_HANDOFF_SCHEME}://handoff?${query}`); };

export function registerAppHandoffRoutes(app: Express): void {
  const limiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: "محاولات كثيرة، أعد المحاولة بعد قليل." });

  app.get("/app-handoff/start", limiter, async (req: Request, res: Response) => {
    res.setHeader("Referrer-Policy", "no-referrer");
    const challenge = String(req.query.challenge || "");
    if (!CHALLENGE.test(challenge)) { back(res, "error=bad-request"); return; }
    if (Repository.isDemoRequest()) { back(res, "error=no-session"); return; }
    const sessionId = getCookies(req)["session_id"];
    const session = sessionId?.startsWith("sess_") ? await Repository.getSession(sessionId) : undefined;
    if (!session) { back(res, "error=no-session"); return; }
    /* من لم يغيّر كلمته الأولى يغيّرها في المتصفح أولاً: لا تنتقل جلسةٌ مؤقتة. */
    if (!session.memberId) {
      const user = await Repository.getUserById(session.userId);
      if (!user || user.MustChangePassword) { back(res, "error=password-first"); return; }
    }
    const code = randomBytes(32).toString("base64url");
    const row: Handoff = { userId: session.userId, sourceSessionId: sessionId, ...(session.memberId ? { memberId: session.memberId } : {}), challenge, expiresAt: Date.now() + APP_HANDOFF_TTL_MS };
    await Repository.saveFeatureDoc("appHandoffs", code, row);
    back(res, `code=${code}`);
  });

  app.get("/app-handoff/redeem", limiter, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    const code = String(req.query.code || ""), verifier = String(req.query.verifier || "");
    if (!CODE.test(code) || !VERIFIER.test(verifier)) { res.redirect(302, "/?handoff=invalid"); return; }
    const out = await Repository.updateFeatureDoc<Handoff, "ok" | "refused">("appHandoffs", code, current => {
      if (!current || current.usedAt || current.expiresAt <= Date.now() || !sameText(current.challenge, handoffChallenge(verifier))) return { refuse: "refused" };
      return { next: { ...current, usedAt: Date.now() }, result: "ok" };
    });
    if (!out.ok) { res.redirect(302, "/?handoff=expired"); return; }
    const row = out.next;
    /* أُلغيت الجلسة الأصلية (إعادة تعيين، خروج، حذف) بعد إصدار الرمز ← لا جلسة جديدة منه. */
    if (!(await Repository.getSession(row.sourceSessionId))) { res.redirect(302, "/?handoff=expired"); return; }
    const sessionId = `sess_${randomBytes(32).toString("hex")}`;
    await Repository.createSession(sessionId, row.userId, SERVER_IDLE_SESSION_MS, row.memberId ? { memberId: row.memberId } : {});
    res.setHeader("Set-Cookie", `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax${secure()}`);
    res.redirect(302, "/");
  });
}
