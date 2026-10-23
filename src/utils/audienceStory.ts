/**
 * ── وضع القصة في لوحة الجمهور ─────────────────────────────────────────────────────
 *
 * عرضٌ تلقائي بملء الشاشة في اجتماع الشركة: الحجم ← الذروة ← ما يطلبه الطلبة ← المواقع ← خطوة الشراكة. هذا الملف منطقه فقط
 * (الترتيب والخطوة والمدة) كي يُختبر وحده؛ والرسمُ في `AudienceStory.tsx`.
 */
export const STORY_SLIDES = ["size", "peak", "demand", "slots", "next"] as const;
export type StorySlideId = typeof STORY_SLIDES[number];

/** مدّة الشريحة قبل الانتقال التلقائي. */
export const STORY_MS = 8000;

/** الشريحة التالية (dir=1) أو السابقة (dir=-1) بلا التفاف: العرض يبدأ بالحجم وينتهي بخطوة الشراكة. */
export const stepStory = (index: number, dir: 1 | -1, total: number = STORY_SLIDES.length): number =>
  Math.max(0, Math.min(total - 1, index + dir));

/** هل يتقدّم العرض وحده الآن؟ لا حين يوقفه المشاهد، ولا لمن يفضّل قلّة الحركة، ولا عند الشريحة الأخيرة. */
export const storyAutoplays = (opts: { paused: boolean; reducedMotion: boolean; index: number; total?: number }): boolean =>
  !opts.paused && !opts.reducedMotion && opts.index < (opts.total ?? STORY_SLIDES.length) - 1;

/** من سحبةِ إصبعٍ أفقية: +1 للتالي، -1 للسابق، 0 إن قصرت. في الصفحة العربية السحب نحو اليمين يتقدّم (عكس الإنجليزية). */
export const swipeDirection = (dx: number, dy: number, min = 48): 1 | -1 | 0 => {
  if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.2) return 0;
  return dx > 0 ? 1 : -1;
};

/** مفتاحٌ لوحي ← تقدّم/تراجع في الصفحة العربية: السهم الأيسر للتالي، والأيمن للسابق. */
export const keyDirection = (key: string): 1 | -1 | 0 =>
  key === "ArrowLeft" || key === "PageDown" ? 1 : key === "ArrowRight" || key === "PageUp" ? -1 : 0;
