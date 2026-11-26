/**
 * ── افتتاحية اليوم ───────────────────────────────────────────────────────────
 *
 * أول دخولٍ إلى الرئيسية كل يوم (لكل حسابٍ على كل جهاز): خمس ثوانٍ تضيء فيها
 * قاعات القسم من الفجر حتى ساعة الآن، ومعها ثلاثة أرقامٍ من اليوم، ثم تنسحب إلى
 * اللوحة. هذا الملف حسابها الخالص: من يراها، ومتى، وما ترسمه، وما تقوله.
 *
 * تُرسم من «محاضرات اليوم» التي تحملها اللوحة أصلاً (/api/dashboard): لا طلب
 * جديد ولا كتابة. ولا تُعرض إلا لمن يرى «نبض القاعات» اليوم: أصحاب شاشة الجدول
 * (الشاشة 7) والعميد ومساعده؛ والأستاذ والطالب والمرشد لا يرونها.
 */

/** مدة الافتتاحية كاملةً بالمللي ثانية، ومدة الإطار الساكن لمن يفضّل حركةً أقل. */
export const OPENING_MS = 5200;
export const OPENING_STILL_MS = 1500;

const OFF_KEY = "day-opening-off-v1";
const SEEN_PREFIX = "day-opening-seen-";

/* ── من يراها ─────────────────────────────────────────────────────────────── */

/**
 * من يرى «نبض القاعات» اليوم، لا أوسع: صاحب شاشة الجدول (والمجسّم فيها) والعميد
 * ومساعده (بطاقة «نبض القاعات في الكلية»). الأستاذ (بلا شاشة الجدول) والمرشد = لا.
 * ورئيس اللجنة المربوط بعضو هيئة تدريس (لوحةٌ «شخصية») يراها: هو صاحب الشاشة 7.
 */
export function openingAllowed(input: { roleId?: string; canManageSchedule?: boolean }): boolean {
  const role = String(input.roleId || "");
  if (role === "advisor" || role === "teacher" || role === "student") return false;
  if (role === "dean" || role === "viceDean") return true;
  return Boolean(input.canManageSchedule);
}

/** تاريخ اليوم المحلي «YYYY-MM-DD»: يومٌ جديد = افتتاحيةٌ جديدة. */
export function openingDay(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export type OpeningMode = "none" | "full" | "still";

/**
 * هل تُعرض الآن، وكيف: مرةً في اليوم، لا مع الطباعة، ولا لمن أوقفها، ولا ليومٍ بلا
 * محاضرات (عطلة الأسبوع تعرض اللوحة فيها جدول الأحد: لا «اليوم» يُضاء).
 */
export function openingMode(input: {
  allowed: boolean; off: boolean; seenDay: string; today: string; lectures: number; weekend?: boolean; print?: boolean; reducedMotion?: boolean;
}): OpeningMode {
  if (!input.allowed || input.off || input.print || input.weekend || input.lectures <= 0) return "none";
  if (input.seenDay === input.today) return "none";
  return input.reducedMotion ? "still" : "full";
}

/* ── التفضيل والذاكرة: على هذا الجهاز وحده، والتخزين الممنوع لا يُسقط شيئاً ── */

const store = (): Storage | null => { try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; } };

export function readOpeningOff(): boolean {
  try { return store()?.getItem(OFF_KEY) === "1"; } catch { return false; }
}
export function writeOpeningOff(off: boolean): void {
  try { const s = store(); if (!s) return; if (off) s.setItem(OFF_KEY, "1"); else s.removeItem(OFF_KEY); } catch { /* تصفّحٌ خاص */ }
  try { window.dispatchEvent(new CustomEvent("day-opening-pref", { detail: { off } })); } catch { /* لا شيء */ }
}
export function readOpeningSeen(userId: number | string): string {
  try { return store()?.getItem(`${SEEN_PREFIX}${Number(userId) || 0}`) || ""; } catch { return ""; }
}
export function writeOpeningSeen(userId: number | string, day: string): void {
  try { store()?.setItem(`${SEEN_PREFIX}${Number(userId) || 0}`, day); } catch { /* تصفّحٌ خاص */ }
}

