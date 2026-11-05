/**
 * ── الدوام الشامل: مصدرٌ واحد للخادم ──
 *
 * الوثيقةُ تُقرأ خارج صندوق العرض: الإعدادُ للبرنامج كله، وجلسةُ عرضٍ لا تملك نسخةً منه.
 * وكل طلبٍ يمرّ بـ`universityDayFresh` قبل أي بوابة، فلا يقرأ الفاحصُ المتزامن قيمةً
 * أقدم من نصف دقيقة. ومن يحفظ يطلق منارة الجداول، فتُسقط النسخُ الأخرى ذاكرتَها فوراً؛
 * والمدةُ مظلّةٌ لمنارةٍ لم تصل. وقراءةٌ فاشلة تُبقي آخر قيمةٍ معروفة، لا الافتراضي.
 */
import type { NextFunction, Request, Response } from "express";
import { Repository } from "../../db/repository";
import { applyUniversityDay, type UniversityDay } from "../../utils/scheduleTime";

const DOC_ID = "global";
const TTL_MS = 30_000, WAIT_MS = 2_000;
let loadedAt = 0;
let loading: Promise<void> | null = null;

export function invalidateUniversityDay(): void { loadedAt = 0; }

export function refreshUniversityDay(): Promise<void> {
  if (loading) return loading;
  const born = Date.now();
  loading = Repository.outsideDemoSandbox(() => Repository.getFeatureDoc<UniversityDay>("universityDay", DOC_ID))
    .then(doc => { applyUniversityDay(doc); loadedAt = born; })
    .catch(error => { console.error("University day read failed:", error); })
    .finally(() => { loading = null; });
  return loading;
}

export function universityDayFresh(_req: Request, _res: Response, next: NextFunction): void {
  if (Date.now() - loadedAt < TTL_MS) { next(); return; }
  /* قاعدةٌ معلّقة لا تُعلّق كل طلب: بعد ثانيتين يمضي الطلبُ بآخر قيمة، والقراءةُ تكمل وحدها. */
  void Promise.race([refreshUniversityDay(), new Promise<void>(resolve => { setTimeout(resolve, WAIT_MS).unref?.(); })]).then(() => next());
}

export async function saveUniversityDay(day: UniversityDay): Promise<void> {
  await Repository.outsideDemoSandbox(async () => {
    await Repository.saveFeatureDoc("universityDay", DOC_ID, { ...day, updatedAt: new Date().toISOString() });
    applyUniversityDay(day);
    loadedAt = Date.now();
    await Repository.markSchedulesChanged();
  });
}
