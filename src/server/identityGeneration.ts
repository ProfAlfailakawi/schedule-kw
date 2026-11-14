/**
 * ── جيلُ الهويات المشترك بين نُسخ الخادم ─────────────────────────────────────
 *
 * ذاكرةُ الهويات (core/auth.ts) في كل عملية على حدة، وتعديلُ صلاحيةٍ يمسح ذاكرةَ العملية التي كتبت
 * فقط؛ فعلى Cloud Run بأكثر من نسخة تخدم الأخرى الصلاحيةَ القديمة حتى دقيقتين.
 *
 * الحلّ: وثيقةٌ صغيرة فيها عدّادٌ يزيده كلُّ تغيير هوية بعد كتابته، وتقرؤه كلُّ نسخة مرةً واحدة
 * كل ‎IDENTITY_GENERATION_TTL_MS‎ كحدٍّ أقصى — كسولاً عند أول طلبٍ بعد انقضاء المدة، لا بمؤقّتٍ يستيقظ
 * والخادمُ خامل. فإن تغيّر العدّاد مُسحت ذاكرةُ النسخة. فتصير مدةُ التقادم الأقصى نحو عشر ثوانٍ لا دقيقتين،
 * بقراءةٍ واحدة كل عشر ثوانٍ لكل نسخة لا بقراءةٍ لكل طلب.
 *
 * هذا الملف منطقٌ صرف (بلا قاعدة بيانات ولا ساعة حقيقية) كي يُختبر وحده.
 */
export const IDENTITY_GENERATION_TTL_MS = 10_000;
/** مهلةُ قراءة العدّاد المشترك وزيادته: لا يعلّق عدّادٌ بطيء كلَّ طلبٍ موثَّق. */
export const IDENTITY_GENERATION_IO_TIMEOUT_MS = 1_500;

/** ينتظر وعداً حتى مهلة؛ عند انقضائها يُرفض (والوعدُ الأصلي يكمل في الخلفية). */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = "identity-generation"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: timed out after ${ms}ms`)), ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

export interface GenerationWatcherOptions {
  ttlMs?: number;
  /** مهلةُ القراءة؛ تجاوزُها يُعامَل كفشل (تُمسح الذاكرة). */
  readTimeoutMs?: number;
  now?: () => number;
  /** قراءةُ العدّاد المشترك؛ ‎null‎ يعني لا مشاركة (تجريبي أو ملف محلي) فلا يُفعل شيء. */
  read: () => Promise<number | null>;
  /** يُستدعى حين يتغيّر العدّاد عمّا رأيناه (تغييرٌ كتبته نسخةٌ أخرى). */
  onChanged: () => void;
}

export interface GenerationWatcher {
  /** يقرأ العدّاد إن انقضت المدة، وإلا يعود فوراً. الطلباتُ المتزامنة تنتظر القراءة نفسها. */
  refreshIfDue: () => Promise<void>;
  /** وقتُ آخر فحصٍ أجرته هذه النسخة (null قبل أول فحص)؛ لبطاقة «سلامة النظام» فقط. */
  lastCheckedAt: () => number | null;
}

/** هل حان وقتُ قراءةٍ جديدة؟ (دالةٌ صرفة) */
export function isGenerationReadDue(lastReadAt: number | null, now: number, ttlMs: number): boolean {
  return lastReadAt === null || now - lastReadAt >= ttlMs || now < lastReadAt;
}

/** ماذا نفعل بقراءةٍ جديدة؟ ‎first‎ أول مرة نرى فيها العدّاد: نسجّله ولا نمسح (الذاكرة فارغةٌ عند الإقلاع). */
export function classifyGenerationReading(seen: number | null, read: number): "first" | "same" | "changed" {
  if (seen === null) return "first";
  return seen === read ? "same" : "changed";
}

export function createGenerationWatcher(options: GenerationWatcherOptions): GenerationWatcher {
  const ttlMs = options.ttlMs ?? IDENTITY_GENERATION_TTL_MS;
  const now = options.now ?? Date.now;
  const readTimeoutMs = options.readTimeoutMs ?? IDENTITY_GENERATION_IO_TIMEOUT_MS;
  let seen: number | null = null;
  /** بعد أي فشل لا نعرف ما فاتنا: أولُ قراءةٍ ناجحة بعده تُعدّ تغييراً فتُمسح الذاكرة. */
  let failedSince = false;
  let lastReadAt: number | null = null;
  let inFlight: Promise<void> | null = null;

  const readOnce = async () => {
    const startedAt = now();
    try {
      const value = await withTimeout(options.read(), readTimeoutMs);
      if (value === null) return; // لا مشاركة في هذا الوضع.
      lastReadAt = startedAt;
      const kind = failedSince ? "changed" : classifyGenerationReading(seen, value);
      failedSince = false;
      seen = value;
      if (kind === "changed") options.onChanged();
    } catch {
      /* لا نستطيع التحقق: نمسح الذاكرة احتياطاً (خطؤنا الوحيد يومها قراءةٌ زائدة)، ونعيد المحاولة بعد المدة. */
      lastReadAt = startedAt;
      failedSince = true;
      options.onChanged();
    }
  };

  return {
    lastCheckedAt: () => lastReadAt,
    refreshIfDue: () => {
      if (inFlight) return inFlight;
      if (!isGenerationReadDue(lastReadAt, now(), ttlMs)) return Promise.resolve();
      inFlight = readOnce().finally(() => { inFlight = null; });
      return inFlight;
    },
  };
}
