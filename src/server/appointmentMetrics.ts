/**
 * ── مقياسُ إدخال المواعيد على الخادم (src/utils/appointmentMeasure.ts) ─────────────
 *
 *   POST /api/metrics/appointment-entry   من يعدّل الجدول: قياسُ موعدٍ واحد، يُطوى في شهره.
 *   GET  /api/metrics/appointment-entry   حسابُ الإدارة الرئيسي وحده: آخرُ ثلاثة أشهر.
 *
 * مجهولُ الهوية بالبناء: الوثيقةُ أعدادٌ ومجاميع، لا يُكتب فيها رقمُ حسابٍ ولا اسمٌ ولا محتوى.
 * ولا يمرّ المسارُ بسجلّ العمليات ولا بعيّنات الأداء (server.ts)، فلا يُربط قياسٌ بصاحبه هناك أيضاً.
 * والطيُّ ذرّيّ (updateFeatureDoc): قياسان في اللحظة نفسها يُعدّان اثنين.
 */
import type { Express, Response } from "express";
import { Repository } from "../db/repository";
import { type AuthenticatedRequest, requireAuth, requirePermission, requireRootAdmin } from "./core/auth";
import {
  entryMonthKey, foldEntryMeasure, normalizeEntryMonth, parseEntryMeasure, recentEntryMonths,
  type EntryMeasurePayload, type EntryMetricsMonth,
} from "../utils/appointmentMeasure";

const COLLECTION = "appointmentMetrics" as const;

export async function recordEntryMeasure(payload: EntryMeasurePayload, now = Date.now()): Promise<EntryMetricsMonth> {
  const month = entryMonthKey(now);
  const at = new Date(now).toISOString();
  const out = await Repository.updateFeatureDoc<EntryMetricsMonth, EntryMetricsMonth>(COLLECTION, month, current => {
    const next = foldEntryMeasure(current, month, payload, at);
    return { next, result: next };
  });
  return out.ok ? out.next : (out.result as EntryMetricsMonth);
}

/** الشهرُ الحاضر وشهران قبله، الأحدثُ أولاً؛ والشهرُ الذي لا قياسَ فيه أصفار. */
export async function readEntryMonths(now = Date.now(), count = 3): Promise<EntryMetricsMonth[]> {
  const months = recentEntryMonths(now, count);
  const docs = await Promise.all(months.map(month => Repository.getFeatureDoc<EntryMetricsMonth>(COLLECTION, month).catch(() => null)));
  return months.map((month, index) => normalizeEntryMonth(month, docs[index]));
}

export function registerAppointmentMetricsRoutes(app: Express): void {

app.post("/api/metrics/appointment-entry", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  const parsed = parseEntryMeasure(req.body);
  if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }
  await recordEntryMeasure(parsed.payload);
  res.json({ ok: true });
});

app.get("/api/metrics/appointment-entry", requireAuth, requireRootAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ months: await readEntryMonths() });
});

}
