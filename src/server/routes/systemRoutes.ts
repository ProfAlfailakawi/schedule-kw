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
import { Repository } from "../../db/repository";
import { beginWarmup, expireForWarmup } from "../../db/referenceCache";
import { SCHEDULE_DAY_END_TIME, SCHEDULE_DAY_START_TIME } from "../../utils/scheduleTime";

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

/* الدوام الشامل: كل متصفح يقرؤه قبل الدخول وبعده، ولا يحمل ما يُخفى. */
app.get("/api/university-day", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ startTime: SCHEDULE_DAY_START_TIME, endTime: SCHEDULE_DAY_END_TIME });
});

app.get("/api/health", async (req, res) => {
  /* ?warm=1 — نداء التسخين المجدول (Cloud Scheduler كل خمس دقائق في ساعات العمل):
     يملأ الذاكرة القصيرة بالمراجع وجداول آخر فصلين قبل أن يصل أوّل أستاذ، فلا
     يدفع هو ثمن القراءة الباردة. قراءةٌ فقط، ومحدودة بثماني ثوانٍ، وفشلها لا يُفشل الفحص.
     والنداءُ بلا دخول، فلا يُفرغ المخبأ: يُجدَّد ما اقترب أجلُه وحده (expireForWarmup)، ونداءٌ قبل مرور دقيقةٍ
     على سابقه يُتجاهل (beginWarmup) — الفحصُ نفسه يجيب كما هو. */
  if (req.query.warm === "1" && !state.databaseDown && beginWarmup()) {
    const warm = (async () => {
      /* تجديدٌ لا مجرد قراءة: مدخلٌ ينتهي بعد ثوانٍ من هذا النداء يُعاد الآن بعمرٍ كامل. */
      expireForWarmup();
      const [terms] = await Promise.all([
        Repository.getTerms(), Repository.getCourses(), Repository.getInstructors(),
        Repository.getColleges(), Repository.getSections(),
      ]);
      const latest = [...terms].map(term => Number(term.AdTermId)).filter(Boolean).sort((a, b) => b - a).slice(0, 2);
      await Promise.all(latest.map(termId => Repository.getSchedulesByScope({ termId })));
    })().catch(() => undefined);
    await Promise.race([warm, new Promise(resolve => setTimeout(resolve, 8000))]);
  }
  res.type("application/json; charset=utf-8").send(JSON.stringify({
    ok: !state.databaseDown,
    database: state.databaseDown ? "down" : "up",
    ref: state.databaseDown ? state.databaseDownRef : undefined,
  }));
});
}
