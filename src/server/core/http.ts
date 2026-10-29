/**
 * ── أدواتُ HTTP: asyncSafe، حدُّ التزامن، قراءةُ النسخ الاحتياطية ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { Request, Response, NextFunction } from "express";

/**
 * A rejected promise must reach the error handler, not the process.
 *
 * Express 4 predates async handlers: it calls them, ignores the promise they
 * return, and never learns that one rejected. The rejection then rises as an
 * unhandled rejection, which modern Node treats as fatal — so one slow moment
 * from Firestore could kill an instance mid-day, dropping every request in
 * flight and every live schedule stream with it.
 *
 * Rather than remember a wrapper at four hundred call sites, the routing verbs
 * are taught it once, here, before any route is registered. Handlers keep their
 * shape: a four-argument error handler is left exactly as written, a returned
 * promise gets `.catch(next)`, and a synchronous throw is forwarded too. Any
 * properties a middleware carries (a mounted router, Vite's connect app) are
 * copied onto the wrapper so nothing that inspects them notices the difference.
 */
export const asyncSafe = (handler: any) => {
  if (typeof handler !== "function" || handler.length >= 4) return handler;
  const wrapped = function (this: unknown, req: Request, res: Response, next: NextFunction) {
    try {
      const outcome = handler.call(this, req, res, next);
      if (outcome && typeof outcome.then === "function") outcome.catch(next);
      return outcome;
    } catch (error) {
      next(error);
      return undefined;
    }
  };
  return Object.assign(wrapped, handler);
};

type ApiPerformanceSample = { at:number; path:string; method:string; durationMs:number; status:number; userId:number; collegeId:number; sectionId:number; termId:number };
export const apiPerformanceSamples: ApiPerformanceSample[] = [];
export const API_PERFORMANCE_LIMIT = 5000;

/**
 * ── قراءة المستندات: اثنان في وقت واحد، لا أكثر ─────────────────────────────
 *
 * Reading a scanned timetable is the most expensive thing this server does. Each
 * page is rendered by pdf.js into a canvas and sliced into strips before OCR
 * sees it, and that rendering happens in this process's heap — twenty-odd
 * bitmaps per page, for up to twelve pages. One import is comfortable. Four
 * arriving together is an out-of-memory kill, and the work is not even faster:
 * the OCR workers behind it are already saturated by one document.
 *
 * So the reading routes admit two at a time and make the rest wait their turn,
 * which costs a queued reader some seconds and costs everyone else nothing. The
 * queue itself is bounded — past that the honest answer is "not now", not a
 * request that waits forever holding a 24 MB upload in memory.
 *
 * A slot is released on `finish` *and* on `close`, so a reader who closes the
 * tab mid-import hands their turn to the next person instead of stranding it.
 */
function limitConcurrency(max: number, queueLimit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return (_req: Request, res: Response, next: NextFunction) => {
    const begin = () => {
      active += 1;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        active -= 1;
        waiting.shift()?.();
      };
      res.once("finish", release);
      res.once("close", release);
      next();
    };
    if (active < max) { begin(); return; }
    if (waiting.length >= queueLimit) {
      res.status(503).json({ error: "قراءة المستندات مشغولة الآن بطلبات أخرى. أعد المحاولة بعد قليل." });
      return;
    }
    waiting.push(begin);
  };
}
export const documentReadingGate = limitConcurrency(2, 8);
