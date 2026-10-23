/**
 * ── ألوانُ الصفحات العامّة ─────────────────────────────────────────────────
 *
 * صفحاتُ الخادم التي تُفتح بلا حزمة التطبيق — بطاقةُ الأستاذ (/m)، واستبيانُ
 * الأستاذ (/q)، واستبيانُ الطالب، والجدولُ المنشور (/s) — كانت كلٌّ منها
 * تعلن لوحةً داكنة بقيمها الخاصّة، والتطبيقُ صار نهارياً. فظهرت صفحةُ الأستاذ
 * على الجوّال سوداءَ كاملةً بين شاشاتٍ بيضاء.
 *
 * القيمُ هنا هي رموزُ 01-foundation.css نفسُها (canvas, surface, line, ink,
 * muted, accent, brass …) بأسماء المتغيّرات التي تقرؤها تلك الصفحات، فتُعلَن
 * مرّةً وتتبع السمةَ حيث تتبعها.
 */
export const PUBLIC_THEME_COLOR = "#f2f3ef";

export const PUBLIC_LIGHT_VARS = [
  "color-scheme:light",
  "--bg:#f2f3ef", "--card:#ffffff", "--card2:#f6f7f3", "--soft:#edefe9",
  "--line:#e3e6e0", "--line-strong:#ccd2cb",
  "--ink:#131817", "--dim:#5b6660", "--muted:#5b6660",
  "--jade:#1f6b5c", "--accent:#1f6b5c", "--accent-soft:#dcece7", "--on-accent:#ffffff",
  "--brass:#8d6423", "--gold:#8d6423",
  "--bad:#973c38", "--bad-soft:#f8e4e2",
  "--cohort-rgb:31,107,92",
].join(";");

/**
 * الوضع الداكن: الأسماءُ نفسُها ليتبدّل اللونُ دون أن تُمسَّ القواعد. الأخضرُ هنا فاتحٌ فيصلح لوناً للنص وللتعبئة معاً؛
 * والنصُّ فوق تعبئته `--on-accent` (داكنٌ هنا، أبيضُ في النهاري). كلُّ زوجٍ يُقاس تباينُه في tests/masari-visual-audit.ts.
 */
export const PUBLIC_DARK_THEME_COLOR = "#0f1513";
export const PUBLIC_DARK_VARS = [
  "color-scheme:dark",
  "--bg:#0f1513", "--card:#17201d", "--card2:#1b2622", "--soft:#212d28",
  "--line:#2a3732", "--line-strong:#3d4f47",
  "--ink:#eef2ef", "--dim:#b3bfb8", "--muted:#a9b6af",
  "--jade:#4cb89c", "--accent:#4cb89c", "--accent-soft:#1d332d", "--on-accent:#0b1512",
  "--brass:#d8b06a", "--gold:#d8b06a",
  "--bad:#f08a84", "--bad-soft:#3a1f1e",
  "--cohort-rgb:76,184,156",
].join(";");
