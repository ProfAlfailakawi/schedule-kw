/**
 * ── مسحُ جدول القسم كاملاً: من يملكه، ومتى ─────────────────────────────────
 *
 * أخطرُ زرٍّ في الجدول الدراسي، فقرارُه دالّةٌ نقيّةٌ واحدة يقرؤها الخادم
 * (فيرفض) والشاشة (فتُخفي الزر) والاختبار، ولا يفترق ثلاثتُهم.
 *
 *  - يملكه الأدمن ورئيسُ لجنة الجدول وحدهما.
 *  - في الفصل الذي يُعَدّ فقط (الفصل القادم)، لا الفصل الجاري ولا فصلٌ منتهٍ.
 *  - ومتى وُقّع الجدول (أيُّ توقيعٍ أو حالةٍ بعد الإعداد) لا يمسحه إلا الأدمن.
 *
 * والإرجاع (من نسخة ما قبل المسح) يتبع الحكمَ نفسه.
 */

export interface WipeContext {
  isAdmin: boolean;
  /** الصفة الأكاديمية المكتوبة للحساب (committeeChair = رئيس لجنة الجدول). */
  role?: string | null;
  termId: number;
  /** الفصل الجاري تشغيلياً. */
  currentTermId: number;
  /** الفصول التي تُعَدّ الآن (بعد الجاري، غير منتهية ولا مغلقة). */
  planningTermIds: readonly number[];
  termClosed: boolean;
  /** حالة اعتماد الجدول: drafting أو غيرها، وعدد التوقيعات. */
  approvalStatus?: string | null;
  signatureCount?: number;
}

export interface WipeDecision { allowed: boolean; reason: string }

export const WIPE_CONFIRM_TOKEN = "wipe-scope";
export const WIPE_RESTORE_TOKEN = "wipe-restore";
/** وسمُ النسخة الاحتياطية التي تُلتقط قبل المسح: بها يُعرف «آخر مسح» للإرجاع. */
/** أكبرُ جدولٍ يُمسح: ما يقبله الإرجاع (حدّ المسودة الآمن). */
export const WIPE_MAX_ROWS = 450;
export const WIPE_VERSION_LABEL = "قبل مسح الجدول بالكامل";

export function scheduleIsSigned(approvalStatus?: string | null, signatureCount = 0): boolean {
  return Number(signatureCount || 0) > 0 || Boolean(approvalStatus && approvalStatus !== "drafting");
}

export function wipeDecision(context: WipeContext): WipeDecision {
  const chair = context.role === "committeeChair";
  if (!context.isAdmin && !chair) {
    return { allowed: false, reason: "مسح الجدول بالكامل لمدير النظام ورئيس لجنة الجدول فقط." };
  }
  if (!context.termId) return { allowed: false, reason: "اختر الفصل أولاً." };
  if (context.termClosed) return { allowed: false, reason: "هذا الفصل منتهٍ، وجدوله لا يُمسح." };
  if (context.termId === context.currentTermId) {
    return { allowed: false, reason: "هذا هو الفصل الجاري، وجدوله لا يُمسح. المسح للفصل الذي يُعَدّ فقط." };
  }
  if (!context.planningTermIds.includes(context.termId)) {
    return { allowed: false, reason: "المسح للفصل الذي يُعَدّ الآن فقط." };
  }
  if (scheduleIsSigned(context.approvalStatus, context.signatureCount) && !context.isAdmin) {
    return { allowed: false, reason: "وُقّع هذا الجدول، فلا يمسحه إلا مدير النظام." };
  }
  return { allowed: true, reason: "" };
}
