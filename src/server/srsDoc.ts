/**
 * ── وثيقة المتطلبات: صفحةٌ خاصة برابطٍ سري ─────────────────────────────────
 *
 * تُبنى الصفحةُ وملفّا PDF عند كل بناء (scripts/srs/build.mjs --site) في
 * `dist/srs-private/<SHA-256 للمفتاح>/`. المفتاحُ نفسه لا يُحفظ في المستودع ولا في
 * الصورة: الذي يُحفظ بصمتُه فقط (docs/srs/access.sha256)، فمن قرأ المستودع لا يصل
 * إلى الرابط. الطلبُ يحمل المفتاحَ في المسار (/srs/<مفتاح>/)، فيُحسب له SHA-256
 * ويُقدَّم المجلدُ المطابق إن وُجد، وإلا 404 بلا تلميحٍ، وعدّادُ الأخطاء للعنوان
 * (publicAttemptLimiter) يوقف من يخمّن.
 *
 * ولا تُفهرَس الصفحة ولا تُخزَّن ولا تُفتح داخل إطار.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { createAttemptLimiter } from "./publicAttemptLimiter";

const KEY_SHAPE = /^[A-Za-z0-9_-]{32,128}$/;
const FOLDER_SHAPE = /^[0-9a-f]{64}$/;
const PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** يُسجَّل المسار دائماً (ولو بلا بناء فيردّ 404) حتى لا يتغيّر جدولُ المسارات بحسب وجود مجلد البناء. */
export function registerSrsDocRoutes(app: Express, base = path.resolve(process.cwd(), "dist/srs-private")): number {
  let folders: string[] = [];
  try { folders = fs.readdirSync(base).filter(name => FOLDER_SHAPE.test(name)); } catch { /* لا بناء: لا مسار */ }
  const limiter = createAttemptLimiter({ maxFailures: 10, windowMs: 10 * 60_000, capacity: 5_000 });
  const served = new Map(folders.map(folder => [folder, express.static(path.join(base, folder), { index: "index.html", redirect: false, dotfiles: "ignore", fallthrough: true })]));
  const notFound = (res: Response) => { res.status(404).type("text/plain; charset=utf-8").send("Not found"); };

  app.use("/srs/:key", (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", PAGE_CSP);
    if (req.method !== "GET" && req.method !== "HEAD") { res.setHeader("Allow", "GET, HEAD"); res.status(405).end(); return; }
    const ip = req.ip || "unknown";
    if (limiter.blocked(ip)) { res.setHeader("Retry-After", String(Math.ceil(limiter.windowMs / 1000))); res.status(429).type("text/plain; charset=utf-8").send("Too many attempts"); return; }
    const key = String(req.params.key || "");
    const folder = KEY_SHAPE.test(key) ? crypto.createHash("sha256").update(key).digest("hex") : "";
    const handler = served.get(folder);
    if (!handler) { limiter.fail(ip); notFound(res); return; }
    /* الروابط النسبية في الصفحة (ملفا PDF) تحتاج الشرطة الأخيرة. */
    if (!req.originalUrl.split("?")[0].endsWith("/") && req.path === "/") { res.redirect(302, `${req.originalUrl.split("?")[0]}/`); return; }
    handler(req, res, () => notFound(res));
  });
  return folders.length;
}
