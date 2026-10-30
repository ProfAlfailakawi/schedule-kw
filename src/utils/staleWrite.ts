/**
 * ── «حدّث ثم أعد»: لا يكتب أحدٌ فوق تعديل زميلٍ لم يره ──────────────────────────────
 *
 * كلُّ كتابةٍ في طلبات الشعب ومقاعد المرشد وقرارات كشف التسجيل تحمل ختمَ ما رآه صاحبُها
 * (رقمَ الإصدار، أو وقتَ آخر قرار). فإن تغيّر الشيءُ منذ قرأه — لأن زميلاً حفظ قبله — رُدّت
 * الكتابةُ بهذا الرمز ولم يُمسّ شيء، وقالت الشاشةُ ذلك بهدوء مع زرّ «حدّث» بلمسة.
 *
 * الختمُ اختياريٌّ على الخادم: نداءٌ بلا ختم (لسانٌ قديم، أو أداةٌ داخلية) يمضي كما كان.
 */
export const STALE_WRITE_CODE = "stale-write";
export const STALE_WRITE_MESSAGE = "عدّل زميلُك هذا قبلك. حدّث ثم أعد.";
export const staleWriteBody = () => ({ error: STALE_WRITE_MESSAGE, code: STALE_WRITE_CODE });

/** رقمُ إصدارٍ أرسله المتصفّح، أو null إن لم يُرسل شيئاً صالحاً. */
export function expectedRev(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d{1,9}$/.test(value.trim()) ? Number(value) : Number.NaN;
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** ختمٌ نصّيّ (وقتُ آخر قرار) أرسله المتصفّح، أو null. "" ختمٌ صالح: «لم يُقرَّر فيه شيء بعد». */
export function expectedStamp(value: unknown): string | null {
  return typeof value === "string" && value.length <= 120 ? value : null;
}

/** ختمُ قرارِ الحالة كلها (طلب الخريج): وقتا قراري اللجنة والتسجيل معاً. */
export function caseStampOf(caseState: { committee?: { at?: string } | null; registrar?: { at?: string } | null } | null | undefined): string {
  return `${caseState?.committee?.at || ""}|${caseState?.registrar?.at || ""}`;
}

/** هل هذا ردُّ «حدّث ثم أعد»؟ */
export const isStaleWrite = (body: unknown): boolean => Boolean(body && typeof body === "object" && (body as any).code === STALE_WRITE_CODE);
