/**
 * ── مطبِّع السؤال العربي ──
 *
 * كل ما يفهمه المرشد يمرّ من هنا: همزات، تاء مربوطة، تمديد، حركات، أرقام هندية،
 * ثم تجريد السوابق واللواحق. لا مكتبة ولا خادم؛ دوالّ صافية تعمل في المتصفح
 * وفي الاختبارات بالنتيجة نفسها.
 */
const DIACRITICS = /[ً-ْٰـ]/g;
const ARABIC_DIGITS: Record<string, string> = { "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9","۰":"0","۱":"1","۲":"2","۳":"3","۴":"4","۵":"5","۶":"6","۷":"7","۸":"8","۹":"9" };

export function normalizeText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(DIACRITICS, "")
    .replace(/[٠-٩۰-۹]/g, d => ARABIC_DIGITS[d] || d)
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ء/g, "")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/گ/g, "ك")
    .replace(/چ/g, "ج")
    .replace(/ڤ/g, "ف")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/(\p{L})\1{2,}/gu, "$1$1")
    .replace(/\s+/g, " ")
    .trim();
}

const PREFIXES = ["وبال","فبال","بال","كال","لل","وال","فال","ال","وب","ول","وس","في","بي","لي"];
const SUFFIXES = ["اتها","اتهم","اتنا","هما","كما","تها","تهم","تنا","ات","ون","ين","ان","يه","ها","هم","نا","كم","ني","لي","ه","ي","ك"];

/** جذع تقريبي: يزيل السوابق واللواحق الشائعة، ولا يبتر كلمةً إلى أقل من ثلاثة أحرف. */
export function stem(token: string): string {
  let word = token;
  if (!/^[؀-ۿ]+$/.test(word)) {
    return word.length > 4 ? word.replace(/(ing|ed|es|s)$/, "") : word;
  }
  for (const prefix of PREFIXES) {
    if (word.startsWith(prefix) && word.length - prefix.length >= 3) { word = word.slice(prefix.length); break; }
  }
  if (word.length >= 5 && /^[وفبلك]/.test(word) && !/^(وقت|وضع|وصل|فصل|فتح|فحص|فرق|فريق|بدا|بحث|بنا|لجن|لوح|كلي|كشف|كتب)/.test(word)) word = word.slice(1);
  for (const suffix of SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) { word = word.slice(0, -suffix.length); break; }
  }
  return word;
}

export function tokenize(normalized: string): string[] {
  return normalized.split(" ").filter(Boolean);
}

/** مسافة التحرير مع التبديل المتجاور، بحدٍّ أعلى يوقف الحساب مبكراً. */
export function editDistance(a: string, b: string, limit = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const rows = a.length + 1, cols = b.length + 1;
  let prev2: number[] = [], prev = Array.from({ length: cols }, (_, i) => i);
  for (let i = 1; i < rows; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, prev2[j - 2] + 1);
      row[j] = value;
      if (value < best) best = value;
    }
    if (best > limit) return limit + 1;
    prev2 = prev; prev = row;
  }
  return prev[cols - 1];
}
