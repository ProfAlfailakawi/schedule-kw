/**
 * ── النظام: الإصدار والصحة وإعداداتُ التجربة ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { Request, Response } from "express";
import { BUILD_STAMP } from "../../generated/buildStamp";
import { state } from "../core/state";

export function registerSystemRoutes(app: Express): void {
/**
 * Is the schedule actually reachable?
 *
 * The browser's own `navigator.onLine` answers a much smaller question — is
 * there a network interface — and answers it optimistically: a laptop on a
 * café's wifi with no route out still reports itself online, and the screen was
 * telling that reader their work was «آمن للحفظ». This says the thing the
 * sentence claims: the process is up, and the database answered.
 *
 * Deliberately unauthenticated and deliberately tiny: it is polled, it must not
 * cost a session lookup, and it must keep answering while everything else 503s
 * so the interface can tell «الخادم واقف» from «قاعدة البيانات واقفة».
 */
app.get("/api/demo/config", (_req, res) => {
  res.json({
    enabled: process.env.SCHEDULE_DEMO_ENABLED !== "false",
    sessionMinutes: 60,
    isolated: true,
    adminReadOnly: true,
  });
});

/** Which build is running. The client compares this against its own compiled
 *  stamp and reloads itself when the server has moved on — the net that
 *  catches restored tabs and bfcache pages no service-worker event reaches. */
app.get("/api/version", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ build: BUILD_STAMP });
});

app.get("/api/health", (_req, res) => {
  res.type("application/json; charset=utf-8").send(JSON.stringify({
    ok: !state.databaseDown,
    database: state.databaseDown ? "down" : "up",
    ref: state.databaseDown ? state.databaseDownRef : undefined,
  }));
});
}
