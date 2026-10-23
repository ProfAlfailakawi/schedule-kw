/**
 * ── اسمُ المقرر في الكتالوج مقابل اسمه في الصحيفة ─────────────────────────────
 *
 * الصحيفة هي الأصل في الاسم، لكن مقارنةَ نصّين لا تكفي لتقرير ما يُكتب:
 * - «المكتبة» و«المكتبه» و«علم العرو ض» و«تطور فكر تربوي/تطور الفكر التربوي» إملاءٌ للاسم نفسه (الهاء والتاء، الياء والألف
 *   المقصورة، الهمزات، المسافات، «ال»): لا يُكتب إملاءُ الطابعة القديمة فوق إملاءٍ سليم. ما سوى ذلك فرقٌ في الاسم يُصحَّح
 *   («التعلم» ليست «التعليم»). و«سيكولوجية/سيكلوجيه» و«ميكروبيولوجيا/ميكروبولوجيا» إملاءٌ كذلك.
 * - «اناشيد1» و«بيانو واناشيد (1)» المقرر نفسه باسمٍ أتمّ: يُصحَّح إلى اسم الصحيفة.
 * - «مدخل إلى الإعاقة العقلية» و«التربية الأسرية» مقرران مختلفان يحملان الرقم نفسه (مقررات التربية الخاصة القديمة
 *   بأرقامٍ قصيرة عند علم النفس): لا يُعاد تسمية أحدهما باسم الآخر.
 */
import { arabicMatchKey } from "./arabicText";

export type NameRelation = "same" | "spelling" | "related" | "different";

const tight = (value: string) => arabicMatchKey(String(value || "").replace(/ىء/g, "ئ")).replace(/[\s()\-/]+/g, "");
/* «محاضرة» في آخر الاسم يفرّق به القسم المحاضرةَ عن المختبر في الجدول؛ ليس فرقاً في الاسم. */
const loose = (value: string) => tight(value).replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[ءئؤ]/g, "ي").replace(/محاضره$/, "").replace(/ال/g, "").replace(/(سيك|ميكروب)ي?و?لوج/g, "$1لوج");

function longestCommon(a: string, b: string): number {
  let best = 0;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) { let k = 0; while (a[i + k] && a[i + k] === b[j + k]) k++; if (k > best) best = k; }
  return best;
}

const STOP = new Set(["في", "الى", "الي", "على", "علي", "من", "مدخل", "مقدمه", "مبادي", "علم", "تربيه", "التربيه", "عام", "عامه", "اسس", "و"]);
const words = (value: string) => new Set(arabicMatchKey(value).replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[ءئؤ]/g, "ي")
  .split(/[^ء-ي]+/).map(word => word.replace(/^و?ال/, "").replace(/^و(?=..)/, "")).filter(word => word.length >= 3 && !STOP.has(word)));

export function courseNameRelation(catalog: string, sheet: string): NameRelation {
  if (tight(catalog) === tight(sheet)) return "same";
  const a = loose(catalog), b = loose(sheet);
  if (a === b) return "spelling";
  const shared = [...words(catalog)].some(word => words(sheet).has(word));
  return shared || longestCommon(a, b) >= 6 ? "related" : "different";
}
