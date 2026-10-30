/**
 * ── لا قاعةَ ولا مبنى في ما يصل الأستاذ من القسم (قاعدة المالك) ────────────────
 *
 * الأستاذُ لا يرى في مسار الطلب قاعةً ولا مبنى. وكان الخادمُ ينزع حقولَ القاعة
 * كلَّها، ثم يمرّر ما تكتبه اللجنة بيدها كما هو: ملاحظةُ الرفض «القاعة 901A01/L01
 * محجوزة لمختبر» وصلت بطاقةَ «قرارك» والحركةَ والطباعة (محاكاة 2026-10-30).
 *
 * فكلُّ نصٍّ تكتبه اللجنة ويصل الأستاذ يمرّ من هنا: يسقط رمزُ القاعة أو المبنى
 * وتبقى الكلمةُ العامة («القاعة»، «المبنى»…) والجملةُ بمعناها. يُمسك الرمزُ بثلاث:
 *   1) بعد كلمةٍ تدلّ على مكان: «القاعة 7/31»، «بمبنى 901A01»، «المختبر L01».
 *   2) رموزُ قاعات البند نفسه (roomTokensOf) أينما وقعت.
 *   3) رمزٌ بشرطةٍ مائلة فيه حرفٌ لاتيني: «901A01/L01»، «B1/101».
 * والتاريخُ «5/11» والوقتُ «14:00» واسمُ الفصل «2026/2027» تبقى كما هي.
 */

const PLACE_WORD = String.raw`((?:[وف]?[بلك]?)(?:ال|ل)?(?:قاعة|قاعه|مبنى|مبني|مختبر|معمل|غرفة|مرفق(?:\s+المرافق)?|ورشة|مرسم)|\b(?:hall|room|lab|building)\b)`;
/* رمزٌ يبدأ بحرفٍ لاتيني أو رقم، وقد يحمل نقطةً أو شرطةً أو شرطةً مائلة — ولا يكون وقتاً («14:00»). */
const CODE = String.raw`[A-Za-z0-9٠-٩][A-Za-z0-9٠-٩._\-]*(?:\s*\/\s*[A-Za-z0-9٠-٩][A-Za-z0-9٠-٩._\-]*)*(?![:٫A-Za-z0-9٠-٩])`;
const WORD_WITH_CODE = new RegExp(String.raw`(?<![؀-ۿ])${PLACE_WORD}(?:\s+رقم)?\s*[:#\-–]?\s*${CODE}`, "gi");
const SLASH_CODE = new RegExp(String.raw`(?<![A-Za-z0-9٠-٩])(?:[A-Za-z0-9]*[A-Za-z][A-Za-z0-9]*\s*\/\s*[A-Za-z0-9]+|[A-Za-z0-9]+\s*\/\s*[A-Za-z0-9]*[A-Za-z][A-Za-z0-9]*)(?:\s*\/\s*[A-Za-z0-9]+)*(?![A-Za-z0-9٠-٩])`, "g");
const GENERIC = "القاعة|المبنى|المختبر|المعمل|الغرفة|المرفق|الورشة|المرسم";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function scrubPlaceText(text: unknown, tokens: readonly unknown[] = []): string {
  const original = String(text ?? "");
  if (!original.trim()) return original;
  /* 1) كلمةُ المكان تبقى كما كُتبت («بالقاعة»)، ويسقط الرمزُ بعدها. */
  let out = original.replace(WORD_WITH_CODE, "$1");
  /* 2) رموزُ البند نفسه: الأطولُ أولاً، فلا يبقى نصفُ رمزٍ بعد نصفه الآخر. */
  const known = [...new Set(tokens.map(token => String(token ?? "").trim()))]
    .filter(token => token.length >= 2 && !/^[\d\s.:\-–]+$/.test(token))
    .sort((a, b) => b.length - a.length);
  for (const token of known) {
    out = out.replace(new RegExp(`(?<![A-Za-z0-9\\u0660-\\u0669])${escapeRegExp(token)}(?![A-Za-z0-9\\u0660-\\u0669])`, "g"), "القاعة");
  }
  /* 3) رمزٌ بشرطةٍ مائلة فيه حرفٌ لاتيني. */
  out = out.replace(SLASH_CODE, "القاعة");
  if (out === original) return original;
  /* «القاعة القاعة» و«القاعة/القاعة» بعد الاستبدال: كلمةٌ واحدة. */
  out = out.replace(new RegExp(`(${GENERIC})(?:\\s*[\\/·،,]?\\s*(?:${GENERIC}))+`, "g"), "$1");
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

/** هل في النص رمزُ قاعةٍ أو مبنى؟ — للاختبار وللحراسة. */
export function mentionsPlaceCode(text: unknown, tokens: readonly unknown[] = []): boolean {
  return scrubPlaceText(text, tokens) !== String(text ?? "");
}
