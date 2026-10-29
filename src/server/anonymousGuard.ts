/**
 * ── الأبوابُ المجهولة: يُحسب الخطأ، ولا يُحجب النجاح ──────────────────────
 *
 * Three ways an anonymous caller cost the database a read on every request,
 * with nothing to stop it:
 *
 *   1. A `session_id` cookie naming no session — expired, signed out, made up —
 *      was looked up in Firestore on every /api call, because a miss left
 *      nothing behind. A tab left open past its session paid one read per
 *      request until somebody signed in again.
 *   2. A cookie of any shape was looked up, so a junk header was a read.
 *   3. A public link page (/s /q /r /m /t) resolved every guessed token.
 *
 * Every answer here is one-sided on purpose. Nothing limits success: a college
 * behind one NAT address is thousands of real people on one `req.ip`, and they
 * must never meet a wall. What is counted is failure — a session that does not
 * exist, a token that matches nothing — and an address is credited for every
 * success it also brings, the rule publicAttemptLimiter.ts already gives the
 * teacher card (`creditSuccesses`).
 */
import type { NextFunction, Request, Response } from "express";
import { createAttemptLimiter } from "./publicAttemptLimiter";

/** The only two shapes the server mints: `sess_` at sign-in, `demo_` at the demo door. */
const SESSION_ID_SHAPE = /^(?:sess|demo)_[0-9a-f]{64}$/;
export const isSessionIdShape = (id: unknown): id is string => typeof id === "string" && SESSION_ID_SHAPE.test(id);

/**
 * Session ids that resolved to nothing.
 *
 * An id is 32 random bytes, minted once and never reused, and a session that
 * is gone does not return: expiry deletes the record, sign-out deletes it, a
 * locked account deletes it. So remembering a miss is exact, not a guess. The
 * memory is bounded — a flood of fresh ids pushes the oldest out instead of
 * growing the map — and a forgotten id costs one more read, nothing worse.
 */
export function createDeadSessionMemory(options: { ttlMs?: number; capacity?: number; now?: () => number } = {}) {
  const ttlMs = Math.max(1000, options.ttlMs ?? 30 * 60_000);
  const capacity = Math.max(16, Math.floor(options.capacity ?? 20_000));
  const clock = options.now || Date.now;
  const dead = new Map<string, number>();
  return {
    remember(id: string): void {
      dead.delete(id);
      while (dead.size >= capacity) dead.delete(dead.keys().next().value as string);
      dead.set(id, clock() + ttlMs);
    },
    knows(id: string): boolean {
      const until = dead.get(id);
      if (until === undefined) return false;
      if (until > clock()) return true;
      dead.delete(id);
      return false;
    },
    size: () => dead.size,
  };
}

/**
 * What an address may spend on session lookups that find nothing.
 *
 * A real browser spends one per expired session (the memory above keeps it at
 * one). An address inventing well-shaped ids spends one per request. Past the
 * budget, that address's unknown ids are read as signed out without asking
 * Firestore; a session already held in memory is untouched, and every real
 * session found from the address pays its lookup back.
 */
export function createSessionLookupBudget(options: { maxFailures?: number; hardMaxFailures?: number; windowMs?: number; now?: () => number } = {}) {
  return createAttemptLimiter({
    maxFailures: options.maxFailures ?? 120,
    hardMaxFailures: options.hardMaxFailures ?? 1_200,
    windowMs: options.windowMs ?? 10 * 60_000,
    creditSuccesses: true,
    capacity: 5_000,
    now: options.now,
  });
}

const TOO_MANY_LINKS_PAGE = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>لحظة من فضلك</title></head>`
  + `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;line-height:1.8;color:#1f2937">`
  + `<h1 style="font-size:1.3rem">روابطُ كثيرة لم تُطابق شيئاً</h1>`
  + `<p>فُتحت من هذا الاتصال روابطُ كثيرة غيرُ صحيحة في دقائق قليلة. انتظر عشر دقائق ثم افتح رابطك من جديد، أو اطلب نسخةً منه ممّن أرسله.</p>`
  + `</body></html>`;

/**
 * The public link pages count the tokens that match nothing.
 *
 * Mounted on `/s/:token`, `/q/:token` and the rest, ahead of the pages. The
 * page decides as it always did; this only reads its answer: 404 is a guess
 * and stays counted, a page served earns the address credit, and an expired
 * link (410) or a fault is neither. Only the page itself and the request
 * page's proposals are counted — anything else under the prefix passes
 * untouched, so a stray sub-request can never weigh against a reader.
 */
export function createLinkMissGuard(options: { maxFailures?: number; hardMaxFailures?: number; windowMs?: number; now?: () => number } = {}) {
  const limiter = createAttemptLimiter({
    maxFailures: options.maxFailures ?? 40,
    hardMaxFailures: options.hardMaxFailures ?? 400,
    windowMs: options.windowMs ?? 10 * 60_000,
    creditSuccesses: true,
    capacity: 5_000,
    now: options.now,
  });
  return function linkMissGuard(req: Request, res: Response, next: NextFunction) {
    const counted = (req.method === "GET" || req.method === "HEAD") && (req.path === "/" || /^\/proposal\/[^/]+\/?$/.test(req.path));
    if (!counted) { next(); return; }
    const attempt = limiter.reserve(req.ip || "unknown");
    if (!attempt) {
      res.setHeader("Retry-After", String(Math.ceil(limiter.windowMs / 1000)));
      res.setHeader("Cache-Control", "no-store");
      res.status(429).type("text/html; charset=utf-8").send(TOO_MANY_LINKS_PAGE);
      return;
    }
    res.on("close", () => {
      if (res.writableFinished && res.statusCode === 404) return;
      attempt.release(res.writableFinished && res.statusCode < 400);
    });
    next();
  };
}
