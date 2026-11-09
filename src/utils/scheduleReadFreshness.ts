import { forgetWarmStarts } from "./warmStart";

/**
 * ── بعد كل كتابةٍ في الجدول: لا لقطةَ قديمة ──────────────────────────────────────
 * حُذف موعدٌ ثم دخل المنسّق الشاشة من جديد فرأى النصاب كما كان (٦ لا ٣) ثواني، ثم صحّ.
 * السبب أن الشاشة تُرسم أولاً مما عندها قبل أن تصل قراءة الشبكة: لقطةُ مساحة العمل في
 * ذاكرة عامل الخدمة (آخر ردٍّ للقراءة، أي قبل الحذف)، والقراءةُ المسبقة (warm start).
 * بعد أي كتابةٍ ناجحة تُنسى الاثنتان فتُرسم الشاشة من الشبكة وحدها: أبطأ لحظةً وصحيحة.
 */
export async function forgetScheduleReads(): Promise<void> {
  forgetWarmStarts();
  try {
    if (typeof caches === "undefined") return;
    const names = (await caches.keys()).filter(name => name.startsWith("schedule-api-"));
    await Promise.all(names.map(async name => {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        if (new URL(request.url).pathname.startsWith("/api/schedules")) await cache.delete(request);
      }
    }));
  } catch { /* التخزين مرفوض: تبقى الشبكةُ هي الجواب */ }
}
