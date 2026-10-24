/**
 * ── حدُّ التخمين على الأبواب العامة: يُعدّ الخطأ، لا الدخول ──────────────────
 *
 * الحدّ القديم كان يعدّ كلَّ طلب — عشرةٌ في عشر دقائق لكل رابطٍ وعنوان. فأستاذٌ
 * يفتح بطاقته، ويبدّل الفصل مرّتين، ويُبلغ عن محاضرتين، ويُحدّث الصفحة، يُردّ
 * بـ«محاولات كثيرة» وهو لم يُخطئ مرّة. والذي يستحقّ الحدَّ هو **التخمين**: رقمٌ
 * لا يطابق. فيُسأل الحدّ قبل البحث (`blocked`)، ولا يُسجَّل عليه إلا الفشل
 * (`fail`). والقيم قابلةٌ للضبط من البيئة، والافتراضيُّ عشرةُ أخطاءٍ في عشر دقائق.
 */
export interface AttemptLimiterOptions {
  maxFailures?: number;
  windowMs?: number;
  /** حدٌّ أعلى للذاكرة: خريطةٌ لا تكبر بلا نهاية تحت هجومٍ بعناوين كثيرة. */
  capacity?: number;
  now?: () => number;
  /**
   * عنوانٌ يقف خلفه ألوفٌ (شبكة الجامعة): يُحسب للمحاولة الناجحة رصيدٌ في النافذة،
   * فلا يُحجب العنوان عند `maxFailures` إلا إذا زادت أخطاؤه على نجاحاته. ويبقى سقفٌ
   * مطلق (`hardMaxFailures`) يوقف من يخمّن وسط نجاحاتٍ مصطنعة. الافتراضي: بلا رصيد.
   */
  creditSuccesses?: boolean;
  hardMaxFailures?: number;
}

export function limiterOptionsFromEnv(env: Record<string, string | undefined> = process.env): AttemptLimiterOptions {
  const max = Number(env.PUBLIC_ATTEMPT_MAX_FAILURES);
  const minutes = Number(env.PUBLIC_ATTEMPT_WINDOW_MINUTES);
  return {
    maxFailures: Number.isFinite(max) && max >= 1 ? Math.floor(max) : 10,
    windowMs: (Number.isFinite(minutes) && minutes > 0 ? minutes : 10) * 60 * 1000,
  };
}

export function createAttemptLimiter(options: AttemptLimiterOptions = {}) {
  const maxFailures = Math.max(1, Math.floor(options.maxFailures ?? 10));
  const windowMs = Math.max(1000, options.windowMs ?? 10 * 60 * 1000);
  const capacity = Math.max(100, options.capacity ?? 5000);
  const clock = options.now || Date.now;
  const credit = options.creditSuccesses === true;
  const hardMax = Math.max(maxFailures, Math.floor(options.hardMaxFailures ?? maxFailures * 5));
  const failures = new Map<string, { count: number; first: number; ok: number }>();
  const over = (seen: { count: number; ok: number } | undefined): boolean => {
    if (!seen) return false;
    if (!credit) return seen.count >= maxFailures;
    return seen.count >= hardMax || (seen.count >= maxFailures && seen.count > seen.ok);
  };

  const live = (key: string) => {
    const seen = failures.get(key);
    if (seen && clock() - seen.first > windowMs) { failures.delete(key); return undefined; }
    return seen;
  };

  return {
    maxFailures, windowMs,
    /** هل استنفد هذا المفتاحُ أخطاءه في النافذة؟ لا يسجّل شيئاً. */
    blocked(key: string): boolean {
      return over(live(key));
    },
    /** محاولةٌ فاشلة: رقمٌ لا يطابق. */
    fail(key: string): void {
      const seen = live(key);
      if (seen) { seen.count += 1; return; }
      /* امتلاءُ الخريطة يُخرج الأقدمَ غيرَ الموقوف: مسحُها كلَّها كان يمحو أخطاءَ من يخمّن مع الباقين. */
      while (failures.size >= capacity) {
        /* الأقدمُ غيرُ الموقوف يخرج أولاً: من وصل حدَّه لا يُنسى بفيضانٍ من عناوين جديدة. */
        let victim: string | undefined;
        for (const [candidate, entry] of failures) { if (!over(entry)) { victim = candidate; break; } }
        failures.delete(victim ?? (failures.keys().next().value as string));
      }
      failures.set(key, { count: 1, first: clock(), ok: 0 });
    },
    /**
     * حجزُ محاولةٍ قبل أوّل `await` — هذا هو الطريق الوحيد للأبواب التي تبحث
     * ثم تحكم. كان النمط «اسأل `blocked` ← انتظر البحث ← `fail`»، فخمسمئة
     * طلبٍ متوازٍ تمرّ كلها من السؤال قبل أن يُسجَّل أوّل خطأ. فصار العدّ عند
     * الدخول متزامناً: المحاولة تُحسب خطأً فوراً، ومن نجح يُرجعها بـ`release()`.
     * `release(false)` لمحاولةٍ لم تكن تخميناً ولا نجاحاً (رقمٌ خطأ، أو ملفٌّ مقفول): تُرجَع بلا رصيد.
     * يعيد `null` إذا استُنفد الحدّ (ولا يُسجّل شيئاً حينئذٍ).
     */
    reserve(key: string): { release(counted?: boolean): void } | null {
      if (over(live(key))) return null;
      this.fail(key);
      const entry = failures.get(key)!;
      let done = false;
      return {
        release(counted = true) {
          if (done) return;
          done = true;
          /* إن انقضت النافذة وبدأت أخرى فليس لهذه المحاولة فيها شيء تُرجعه. */
          if (failures.get(key) !== entry) return;
          entry.count = Math.max(0, entry.count - 1);
          if (credit && counted) entry.ok += 1;
          if (entry.count === 0 && entry.ok === 0) failures.delete(key);
        },
      };
    },
    /** للأبواب التي لم تنتقل بعد إلى عدّ الأخطاء: كلُّ طلبٍ يُعدّ. */
    consume(key: string): boolean {
      if (this.blocked(key)) return false;
      this.fail(key);
      return true;
    },
  };
}
