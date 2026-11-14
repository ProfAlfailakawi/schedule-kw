/**
 * ── «يجري الآن تثبيتٌ آخر في هذا الفصل» ليس فشلاً: قفلُ الفصل يُحرَّر خلال ثوانٍ ──
 * يُعاد النداءُ نفسُه ثلاث مرّات بتراجعٍ (1.5ث ثم 3ث ثم 6ث) قبل أن يُقال للمنسّق، فلا يتوقّف التثبيتُ الجماعيّ
 * لأن قسماً آخر يثبّت في اللحظة نفسها. وما سوى apply-busy يُرمى كما هو من أول مرّة.
 */
export const APPLY_BUSY_DELAYS = [1500, 3000, 6000];

export async function withApplyBusyRetry<T>(run: () => Promise<T>, wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try { return await run(); }
    catch (error: any) {
      if (error?.code !== "apply-busy" || attempt >= APPLY_BUSY_DELAYS.length) throw error;
      await wait(APPLY_BUSY_DELAYS[attempt]);
    }
  }
}
