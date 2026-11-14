/**
 * ── الفاصلُ الأدنى بين تشغيلين يدويين للرادار ─────────────────────────────────
 * زرُّ «حدّث الرادار» ولسانُ مديرٍ مفتوحٌ يرى «قديم» كلَّ ثلاثين ثانية كانا يُعيدان قراءة ملفّات الطلبة كلِّها
 * مرّةً بعد مرّة أثناء استيرادٍ كبير. الخادمُ يردّ تشغيلاً قبل انقضاء الفاصل بـ409 «too-soon» وبما بقي من ثوانٍ.
 */

/** الفاصلُ (RADAR_MANUAL_GAP_SECONDS، الافتراضي دقيقتان؛ 0 يُلغيه). */
export function radarManualGapMs(env: Record<string, string | undefined> = process.env): number {
  const raw = env.RADAR_MANUAL_GAP_SECONDS;
  const seconds = raw === undefined || raw === "" ? Number.NaN : Number(raw);
  return (Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds) : 120) * 1000;
}

/** كم ثانيةً بقيت قبل أن يُقبل تشغيلٌ يدويٌّ جديد (0 = الآن). */
export function manualRunWaitSeconds(ranAt: string | undefined | null, now: number, gapMs: number): number {
  const ranMs = Date.parse(String(ranAt || ""));
  if (!Number.isFinite(ranMs) || gapMs <= 0) return 0;
  const left = ranMs + gapMs - now;
  return left > 0 ? Math.ceil(left / 1000) : 0;
}
