/**
 * ── مسارات حارس الزملاء (src/server/scheduleHolds.ts) ──────────────────────────
 *
 *   POST   /api/schedule-holds          حجزي: أُعلن ما أبنيه، ويعيش دقيقتين من الآن.
 *   DELETE /api/schedule-holds          أرفع حجزي الآن (إغلاقُ النموذج، إخفاءُ الصفحة).
 *   GET    /api/schedule-holds?termId=  حجوزُ زملائي الحيّة في الفصل، في الأقسام التي أراها.
 *
 * الكتابةُ بصلاحية تعديل الجدول نفسها (الشاشة ٧، وحارسُ الأدوار قبلها) وفي قسمٍ يملكه الكاتب؛
 * والقراءةُ بالشاشة نفسها ومحصورةٌ في نطاق القارئ. ولا شيء هنا يمنع حفظاً: الإعلانُ استشاريّ.
 */
import type { Express, Response } from "express";
import { type AuthenticatedRequest, requireAuth, requirePermission } from "./core/auth";
import { isScopeAllowed } from "./core/scope";
import {
  holdHolderOf, parseScheduleHold, putScheduleHold, readScheduleHolds, releaseScheduleHold, scheduleHoldView,
} from "./scheduleHolds";

export function registerScheduleHoldsRoutes(app: Express): void {

app.post("/api/schedule-holds", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  const holder = holdHolderOf(req.user);
  if (!holder) { res.status(401).json({ error: "الرجاء تسجيل الدخول أولاً" }); return; }
  const parsed = parseScheduleHold(req.body);
  if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }
  if (!isScopeAllowed(req, parsed.hold.collegeId, parsed.hold.sectionId)) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  const saved = await putScheduleHold(holder, parsed.hold);
  res.json({ ok: true, expiresAt: saved.expiresAt });
});

/* رفعُ الحجز لا يحتاج إلا الهوية: من فقد صلاحيته في منتصف الجلسة يرفع حجزه كما يرفعه غيره. */
app.delete("/api/schedule-holds", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  const holder = holdHolderOf(req.user);
  if (holder) await releaseScheduleHold(holder);
  res.json({ ok: true });
});

app.get("/api/schedule-holds", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  const raw = String(req.query.termId ?? "").trim();
  const termId = /^\d{1,10}$/.test(raw) ? Number(raw) : 0;
  if (!termId) { res.status(400).json({ error: "حدّد الفصل." }); return; }
  const mine = holdHolderOf(req.user)?.key || "";
  const now = Date.now();
  const { live, purge } = await readScheduleHolds(termId, now);
  void purge.catch(() => 0);
  const holds = live
    .filter(row => row.holder !== mine && isScopeAllowed(req, Number(row.collegeId), Number(row.sectionId)))
    .map(scheduleHoldView);
  res.json({ holds, now });
});

}
