/**
 * ── «سلامة النظام»: GET /api/system-health ───────────────────────────────────
 * لمحةٌ واحدة لحساب الإدارة الرئيسي: خمس بطاقات بحالةٍ ورقم. قراءةٌ فقط، وحارسُها حارسُ مسارات الخزنة
 * (requireAuth ثم requireRootAdmin). أعدادٌ وأزمنةٌ ورموزُ حالةٍ لا غير — لا أسماءَ ولا معرّفاتِ أشخاص.
 *
 * كلُّ فحصٍ في try/catch خاص به (runProbes): فشلُ واحدٍ يُظهر بطاقتَه رماديةً «تعذّرت القراءة» ولا يُسقط الصفحة.
 * الاستجابةُ تُخبَّأ ثواني معدودة (HEALTH_CACHE_MS) بمفتاحٍ يحمل عالَمَ الجلسة التجريبية كغيرها من الذواكر.
 * في التجريبي قيمٌ آمنةٌ ثابتة ولا يُلمس شيءٌ من الخزنة الحقيقية.
 */
import type { Request, Response } from "express";
import { Repository } from "../db/repository";
import { createTtlMemo } from "./notificationCache";
import { identityLastCheckedAt, ROOT_ADMIN_USER_ID } from "./core/auth";
import { currentTermId, termIsFrozen } from "../utils/termSequence";
import {
  HEALTH_CACHE_MS, backupCard, buildPayload, demoCards, gateCard, identityCard, runProbes, termCard, vaultCard,
  type HealthPayload, type VaultJobProbe,
} from "../utils/systemHealth";

const memo = createTtlMemo<HealthPayload>({ ttlMs: HEALTH_CACHE_MS });

/** يجمع الفحوص الخمسة (دون تخبئة). `now` للاختبار. */
export async function computeSystemHealth(now: number = Date.now()): Promise<HealthPayload> {
  if (Repository.isDemoRequest()) return buildPayload(demoCards(), now, true);
  const cards = await runProbes([
    { id: "backup", run: async () => {
      const [latestExport, points] = await Promise.all([Repository.getLatestSystemExportJob(ROOT_ADMIN_USER_ID), Repository.getSystemRestorePoints()]);
      return backupCard({
        latestExportAt: latestExport && latestExport.status === "ready" ? latestExport.updatedAt || latestExport.createdAt : null,
        latestRestorePointAt: points[0]?.createdAt || null,
      }, now);
    } },
    { id: "vault", run: async () => {
      const [op, imp] = await Promise.all([Repository.getLatestSystemOpJob(ROOT_ADMIN_USER_ID), Repository.getLatestSystemImportJob(ROOT_ADMIN_USER_ID)]);
      const rows: VaultJobProbe[] = [];
      if (op) rows.push({ kind: op.kind, status: op.status, phase: op.phase, restorePointId: op.restorePointId, updatedAt: op.updatedAt, completedUnits: op.completedUnits, totalUnits: op.totalUnits });
      if (imp) rows.push({ kind: "import", status: imp.status, phase: imp.phase, restorePointId: imp.restorePointId, updatedAt: imp.updatedAt, completedUnits: imp.completedUnits, totalUnits: imp.totalUnits });
      return vaultCard(rows, now);
    } },
    /* الدالةُ نفسُها التي تقرؤها بوابةُ الصيانة. */
    { id: "gate", run: async () => gateCard(await Repository.hasOpenVaultJob()) },
    { id: "identity", run: async () => {
      let readable = true, shared = true;
      try { shared = (await Repository.readSharedIdentityGeneration()) !== null; } catch { readable = false; }
      return identityCard({ readable, shared, lastCheckedAt: identityLastCheckedAt() }, now);
    } },
    { id: "term", run: async () => {
      const terms = await Repository.getTerms();
      const id = currentTermId(terms as any, now);
      if (!id) return termCard({ hasTerm: false, frozen: false }, now);
      const run = await Repository.getRegistrationRun(id);
      return termCard({ hasTerm: true, frozen: termIsFrozen(id, terms as any, now), radarRanAt: run?.ranAt, radarStale: Boolean(run?.stale) }, now);
    } },
  ]);
  return buildPayload(cards, now, false);
}

export async function systemHealthHandler(_req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  const key = `${Repository.currentDemoSessionId() || "real"}|health`;
  res.json(await memo.get(key, () => computeSystemHealth()));
}
