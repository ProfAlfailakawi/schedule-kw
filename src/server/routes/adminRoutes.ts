/**
 * ── النسخُ الاحتياطي وسجلُّ التدقيق ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { Request, Response } from "express";
import { createGunzip } from "zlib";
import { activeDataMode, Repository } from "../../db/repository";
import { type AuthenticatedRequest, requireAuth, requirePermission, requirePowerAdmin, requireRootAdmin, ROOT_ADMIN_USER_ID } from "../core/auth";
import { safeSystemUser } from "../core/scope";
import { IMPORT_PHRASE, RESET_PHRASE, UNDO_PHRASE } from "../../utils/vaultPhrases";

const SYSTEM_BACKUP_MAX_BYTES = 80 * 1024 * 1024;

/* عباراتُ التأكيد المكتوبة: الاستيرادُ والتراجعُ يستبدلان النظام كله كما يفعل التصفير، فتلزمهما
   عبارةٌ تُكتب حرفياً مثله (src/utils/vaultPhrases.ts — الواجهة تقرأ المصدر نفسه). */
const headerPhrase = (req: Request) => { try { return decodeURIComponent(String(req.get("x-schedule-phrase") || "")); } catch { return ""; } };

/**
 * ── فكّ الضغط يُقاس أثناءه، لا بعده ──────────────────────────────────────────
 *
 * The size guard used to run *after* `gunzipSync` had already expanded the whole
 * archive into memory. Gzip reaches ratios near a thousand to one, so a thirty
 * megabyte upload — the limit the route accepts — could ask for gigabytes before
 * the check that was supposed to stop it ever executed, and `gunzipSync` blocked
 * the event loop for the whole of it: one bad file took the instance down.
 *
 * The stream is measured as it arrives and abandoned the moment it passes the
 * ceiling, so the refusal costs the limit and never the archive. It is also
 * asynchronous, so nothing else waits on it.
 */
function gunzipBounded(raw: Buffer, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const gunzip = createGunzip();
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      gunzip.destroy();
      reject(error);
    };
    gunzip.on("data", (chunk: Buffer) => {
      if (settled) return;
      total += chunk.length;
      if (total > limit) { fail(new Error("النسخة بعد فك الضغط أكبر من الحد الآمن")); return; }
      chunks.push(chunk);
    });
    gunzip.on("end", () => { if (!settled) { settled = true; resolve(Buffer.concat(chunks)); } });
    gunzip.on("error", () => fail(new Error("تعذّر فك ضغط ملف النسخة الاحتياطية")));
    gunzip.end(raw);
  });
}

async function readSystemBackupBody(req: Request): Promise<unknown> {
  if (!Buffer.isBuffer(req.body)) return req.body;
  let raw = req.body as Buffer;
  if (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b) raw = await gunzipBounded(raw, SYSTEM_BACKUP_MAX_BYTES);
  if (raw.length > SYSTEM_BACKUP_MAX_BYTES) throw new Error("النسخة بعد فك الضغط أكبر من الحد الآمن");
  return JSON.parse(raw.toString("utf8"));
}

export function registerAdminRoutes(app: Express): void {



/**
 * Root-only full-system vault.
 *
 * The portable backup contains every durable document (including historical
 * archives, audit, versions, drafts, surveys, publications and metadata). Live
 * session tokens and the server's own rollback copies are not exported because
 * they are bearer credentials / safety infrastructure, not university data.
 */
app.get("/api/system-backup/status", requireAuth, requireRootAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  const [restorePoints, latestExport, latestImport] = await Promise.all([
    Repository.getSystemRestorePoints(),
    Repository.getLatestSystemExportJob(ROOT_ADMIN_USER_ID),
    Repository.getLatestSystemImportJob(ROOT_ADMIN_USER_ID),
  ]);
  res.json({
    rootOnly: true,
    data: activeDataMode(),
    restorePoints,
    latest: restorePoints.find(point => !point.consumedAt) || null,
    latestExport,
    latestImport,
  });
});

/*
 * Durable, resumable export pipeline.
 *
 * Every step is deliberately short enough to fit comfortably inside Cloud Run
 * request limits. Progress and staging chunks live in Firestore, so closing the
 * browser loses no completed work; reopening the root vault can resume the same
 * job. The final download is only a read of already-built gzip chunks and no
 * longer performs a database walk while the browser waits for a file.
 */
app.post("/api/system-backup/export-jobs", requireAuth, requireRootAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const forceNew = req.query.force === "true" || req.body?.force === true;
  const job = await Repository.startSystemExportJob(req.user!.SystemUserId, ROOT_ADMIN_USER_ID, forceNew);
  res.status(job.status === "ready" ? 200 : 202).json(job);
});

app.delete("/api/system-backup/export-jobs", requireAuth, requireRootAdmin, async (req: AuthenticatedRequest, res: Response) => {
  await Repository.clearSystemExportJobs(ROOT_ADMIN_USER_ID);
  res.status(200).json({ success: true });
});

app.get("/api/system-backup/export-jobs/:id", requireAuth, requireRootAdmin, async (req: AuthenticatedRequest, res: Response) => {
  res.json(await Repository.getSystemExportJob(String(req.params.id), ROOT_ADMIN_USER_ID));
});

app.post("/api/system-backup/export-jobs/:id/step", requireAuth, requireRootAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const job = await Repository.advanceSystemExportJob(String(req.params.id), ROOT_ADMIN_USER_ID);
  res.status(job.status === "ready" ? 200 : 202).json(job);
});

app.get("/api/system-backup/export-jobs/:id/download", requireAuth, requireRootAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const file = await Repository.readSystemExportFile(String(req.params.id), ROOT_ADMIN_USER_ID);
  res.setHeader("Content-Type", "application/gzip");
  res.setHeader("Content-Disposition", `attachment; filename="${String(file.summary.filename || "schedule-full-backup.json.gz").replace(/[\"\r\n]/g, "")}"`);
  res.setHeader("Content-Length", String(file.summary.sizeBytes || file.chunks.reduce((sum, chunk) => sum + chunk.length, 0)));
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (file.summary.sha256) res.setHeader("X-Backup-SHA256", file.summary.sha256);
  res.setHeader("X-Backup-Documents", String(file.summary.documentCount));
  for (const chunk of file.chunks) res.write(chunk);
  res.end();
});

// The old one-request export was the source of the 5/12-minute dead wait. Keep
// a clear response for stale clients instead of silently starting that path.
app.get("/api/system-backup/export", requireAuth, requireRootAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  res.status(409).json({ error: "تم استبدال التصدير المباشر بتصدير متدرج وآمن. افتح «النسخة الاحتياطية» وابدأ التصدير من هناك." });
});

app.post("/api/system-backup/preview", requireAuth, requireRootAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const input = await readSystemBackupBody(req);
  const backup = await Repository.validateSystemBackup(input, ROOT_ADMIN_USER_ID);
  res.json({
    valid: true,
    backupId: backup.backupId,
    createdAt: backup.createdAt,
    storage: backup.storage,
    documentCount: backup.summary.documentCount,
    collectionCounts: backup.summary.collectionCounts,
    sha256: backup.integrity.sha256,
  });
});

/*
 * Resumable import pipeline.
 *
 * The previous endpoint performed validation, safety export, and the complete
 * Firestore replacement inside one HTTP request. On a real 36k-document backup
 * that request could sit at 1% until a gateway timeout even while the server was
 * working. The source is now staged once, then every following request advances
 * exactly one durable checkpoint. Closing the browser does not lose progress.
 */
app.post("/api/system-backup/import-jobs", requireAuth, requireRootAdmin, async (req: AuthenticatedRequest, res: Response) => {
  if (req.get("x-schedule-confirm") !== "FULL-SYSTEM-IMPORT" || headerPhrase(req) !== IMPORT_PHRASE) {
    res.status(409).json({ error: `اكتب «${IMPORT_PHRASE}» للتأكيد` });
    return;
  }
  const input = await readSystemBackupBody(req);
  const job = await Repository.startSystemImportJob(input, req.user!.SystemUserId, ROOT_ADMIN_USER_ID);
  res.status(job.status === "ready" ? 200 : 202).json(job);
});

app.get("/api/system-backup/import-jobs/:id", requireAuth, requireRootAdmin, async (req: AuthenticatedRequest, res: Response) => {
  res.json(await Repository.getSystemImportJob(String(req.params.id), ROOT_ADMIN_USER_ID));
});

app.post("/api/system-backup/import-jobs/:id/step", requireAuth, requireRootAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const job = await Repository.advanceSystemImportJob(String(req.params.id), ROOT_ADMIN_USER_ID);
  res.status(job.status === "ready" ? 200 : 202).json(job);
});

/* إلغاءُ استيرادٍ لم يكتمل: إن كان قد بدأ الاستبدال أُعيد النظامُ من نقطة أمانه؛ ثم تنفتح الخزنة لملفٍّ جديد. */
app.delete("/api/system-backup/import-jobs/:id", requireAuth, requireRootAdmin, async (req: AuthenticatedRequest, res: Response) => {
  if (req.get("x-schedule-confirm") !== "FULL-SYSTEM-IMPORT-ABANDON") {
    res.status(409).json({ error: "إلغاء الاستيراد يحتاج تأكيداً صريحاً" });
    return;
  }
  const job = await Repository.abandonSystemImportJob(String(req.params.id), ROOT_ADMIN_USER_ID);
  res.locals.auditChanges = job.rolledBack ? "إلغاء استيراد متوقف والعودة إلى نقطة الأمان" : "إلغاء استيراد قبل أي تغيير";
  res.json(job);
});

app.post("/api/system-backup/import", requireAuth, requireRootAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  res.status(409).json({ error: "تم استبدال الاستيراد المباشر باستيراد متدرج قابل للاستكمال. افتح «النسخة الاحتياطية» واضغط «استيراد» من جديد." });
});

app.post("/api/system-backup/reset", requireAuth, requireRootAdmin, async (req: AuthenticatedRequest, res: Response) => {
  if (req.get("x-schedule-confirm") !== "FULL-SYSTEM-RESET" || String(req.body?.phrase || "") !== RESET_PHRASE) {
    res.status(409).json({ error: `اكتب «${RESET_PHRASE}» للتأكيد` });
    return;
  }
  const restorePoint = await Repository.resetSystem(req.user!.SystemUserId, ROOT_ADMIN_USER_ID);
  res.json({
    success: true,
    message: "تم تصفير بيانات العمل. بقي حساب الإدارة الرئيسي فقط مع نقطة تراجع جاهزة.",
    restorePoint,
  });
});

app.post("/api/system-backup/undo", requireAuth, requireRootAdmin, async (req: AuthenticatedRequest, res: Response) => {
  if (req.get("x-schedule-confirm") !== "FULL-SYSTEM-UNDO" || String(req.body?.phrase || "") !== UNDO_PHRASE) {
    res.status(409).json({ error: `اكتب «${UNDO_PHRASE}» للتأكيد` });
    return;
  }
  const result = await Repository.undoLastSystemOperation(req.user!.SystemUserId, ROOT_ADMIN_USER_ID);
  res.json({
    success: true,
    message: `تمت العودة إلى نقطة الأمان: ${result.restored.action}`,
    restored: result.restored,
    redoPoint: result.redoPoint,
  });
});

app.get("/api/audit-logs", requireAuth, requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  /* صفحةٌ بعد صفحة: `before` طابعُ آخر سطرٍ في الصفحة السابقة، و`from`/`to` نطاقُ تاريخ. */
  const limit = Number(req.query.limit || 250);
  const text = (value: unknown) => (typeof value === "string" ? value.slice(0, 40) : undefined);
  res.setHeader("Cache-Control", "no-store");
  res.json(await Repository.getAuditLogs(limit, { before: text(req.query.before), beforeId: text(req.query.beforeId), from: text(req.query.from), to: text(req.query.to) }));
});

app.get("/api/admin-user-options", requireAuth, requirePowerAdmin, async (_req: Request, res: Response) => {
  const list = (await Repository.getUsers()).filter(user => !user.IsDeleted);
  res.json(list.map(user => safeSystemUser(user)));
});

// Optional instructor link for personal dashboards. Restricted to user administrators.
app.get("/api/admin-instructor-options", requirePermission(11), async (_req: Request, res: Response) => {
  const list = await Repository.getInstructors();
  res.json(list.map(item => ({ AdInstructorId: item.AdInstructorId, AdInstructorName: item.AdInstructorName, AdInstructorCivil: item.AdInstructorCivil })));
});
}
