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

export interface GenerationWatcherOptions {
  ttlMs?: number;
  now?: () => number;
  /** قراءةُ العدّاد المشترك؛ ‎null‎ يعني لا مشاركة (تجريبي أو ملف محلي) فلا يُفعل شيء. */
  read: () => Promise<number | null>;
  /** يُستدعى حين يتغيّر العدّاد عمّا رأيناه (تغييرٌ كتبته نسخةٌ أخرى). */
  onChanged: () => void;
}

export interface GenerationWatcher {
  /** يقرأ العدّاد إن انقضت المدة، وإلا يعود فوراً. الطلباتُ المتزامنة تنتظر القراءة نفسها. */
  refreshIfDue: () => Promise<void>;
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
  let seen: number | null = null;
  let lastReadAt: number | null = null;
  let inFlight: Promise<void> | null = null;

  const readOnce = async () => {
    const startedAt = now();
    try {
      const value = await options.read();
      if (value === null) return; // لا مشاركة في هذا الوضع.
      lastReadAt = startedAt;
      const kind = classifyGenerationReading(seen, value);
      seen = value;
      if (kind === "changed") options.onChanged();
    } catch {
      /* لا نستطيع التحقق: نمسح الذاكرة احتياطاً (خطؤنا الوحيد يومها قراءةٌ زائدة)، ونعيد المحاولة بعد المدة. */
      lastReadAt = startedAt;
      options.onChanged();
    }
  };

  return {
    refreshIfDue: () => {
      if (inFlight) return inFlight;
      if (!isGenerationReadDue(lastReadAt, now(), ttlMs)) return Promise.resolve();
      inFlight = readOnce().finally(() => { inFlight = null; });
      return inFlight;
    },
  };
}
