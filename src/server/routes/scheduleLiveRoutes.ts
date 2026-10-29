/**
 * ── بثُّ الجدول الحيّ ونبضتُه ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { Response } from "express";
import { companyOn, sweepPulses, type PulseEntry } from "../livePulse";
import { type AuthenticatedRequest, requireAnyPermission, requireAuth } from "../core/auth";
import { boardScopeKey, emptyMark, markPresenceDirty, notifyClock, presenceRoster, scheduleChangeClock, scheduleEventClients } from "../core/liveChannel";
import { isScopeAllowed } from "../core/scope";

/**
 * ── النبضة: الخيطُ يُفتح حين يكون معك أحد ─────────────────────────────────
 *
 * The stream's cheap twin (src/server/livePulse.ts has the reasoning). A
 * screen that is alone on its board asks this every few seconds instead of
 * holding a stream open: who else is here, when did the board last change,
 * when did the bell last have news. It is answered from memory — no database
 * read — and closes at once, so Cloud Run bills milliseconds, not afternoons.
 *
 * Behind the same door as the stream, and the same wall: a pulse may only
 * claim a board its holder is allowed to be on, and an empty scope (the bell,
 * the reports screen) counts as nobody's company.
 */
const pulseClients = new Map<string, PulseEntry>();

export function registerScheduleLiveRoutes(app: Express): void {

app.get("/api/schedules/events", requireAnyPermission([7, 8, 9, 10, 14, 16, 17]), (req: AuthenticatedRequest, res: Response) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  // Each stream holds a connection for its whole life, so the door has a
  // capacity. Past it the screen simply falls back to reading on demand.
  if (scheduleEventClients.size >= 400) { res.end(); return; }
  res.write("retry: 4000\n\n");

  const connId = String(req.query.conn || "").slice(0, 64);
  const collegeId = Number(req.query.college || 0);
  const sectionId = Number(req.query.section || 0);
  const termId = Number(req.query.term || 0);
  /* A stream may only claim a board its holder is allowed to be on — the same
     wall every data route stands behind. A stream with no `conn` (the reports
     screen opens one too) registers with an empty scope and therefore appears
     in nobody's roster and receives nobody else's. */
  const allowed = connId && collegeId && isScopeAllowed(req, collegeId, sectionId);
  const now = Date.now();
  scheduleEventClients.set(res, {
    res, connId,
    userId: Number(req.user?.SystemUserId || 0),
    name: String(req.user?.Name || "").trim() || "زميل",
    scopeKey: allowed ? boardScopeKey(req, collegeId, sectionId, termId) : "",
    collegeId, sectionId, demoSessionId: req.demoSessionId || "",
    markAt: 0, seenAt: now,
    ...emptyMark(),
  });
  // A reconnect must not have to wait for someone else to move: this stream is
  // answered with the whole roster the moment it opens.
  if (allowed) {
    try {
      res.write(`event: presence\ndata: ${JSON.stringify({
        scope: boardScopeKey(req, collegeId, sectionId, termId), at: now,
        peers: presenceRoster(boardScopeKey(req, collegeId, sectionId, termId), now),
      })}\n\n`);
    } catch { /* the close handler below does the cleanup */ }
    markPresenceDirty(boardScopeKey(req, collegeId, sectionId, termId));
  }

  // Proxies drop silent connections; a comment line every while keeps this one open.
  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { /* close event does the cleanup */ }
  }, 25_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    // The only cleanup path in the whole transport. Anything registered at
    // connect and not removed here becomes a colleague who never leaves.
    const gone = scheduleEventClients.get(res);
    scheduleEventClients.delete(res);
    if (gone?.scopeKey) markPresenceDirty(gone.scopeKey);
  });
});
app.get("/api/schedules/pulse", requireAnyPermission([7, 8, 9, 10, 14, 16, 17]), (req: AuthenticatedRequest, res: Response) => {
  const now = Date.now();
  const connId = String(req.query.conn || "").slice(0, 64);
  const collegeId = Number(req.query.college || 0);
  const sectionId = Number(req.query.section || 0);
  const termId = Number(req.query.term || 0);
  const userId = Number(req.user?.SystemUserId || 0);
  const scopeKey = connId && collegeId && isScopeAllowed(req, collegeId, sectionId)
    ? boardScopeKey(req, collegeId, sectionId, termId)
    : "";
  if (connId) pulseClients.set(connId, { userId, scopeKey, active: req.query.active !== "0", seenAt: now });
  sweepPulses(pulseClients, now);
  const demoSessionId = req.demoSessionId || "";
  res.setHeader("Cache-Control", "no-store");
  res.json({
    company: companyOn(scopeKey, userId, pulseClients.values(), scheduleEventClients.values(), now),
    changedAt: scheduleChangeClock.read(demoSessionId),
    notifiedAt: notifyClock.read(demoSessionId),
  });
});
/* Leaving. sendBeacon can only POST, and a closed tab should stop counting as
   company now, not a minute and a half from now. Only the tab's own account
   can retire it. */
app.post("/api/schedules/pulse", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const connId = String(req.query.conn || "").slice(0, 64);
  const entry = pulseClients.get(connId);
  if (entry && entry.userId === Number(req.user?.SystemUserId || 0)) pulseClients.delete(connId);
  res.status(204).end();
});
}
