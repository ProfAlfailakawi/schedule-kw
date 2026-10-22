/**
 * بادئة اسم الدخول الإنجليزية من اسم القسم العربي (Techdept ← Techhead ← Techadvisor).
 *
 * قاموس كلماتٍ أكاديمية شائعة، وما لم يكن فيه يُنقل حرفياً بالحروف اللاتينية؛ فالنتيجة دائماً حروفٌ لاتينية
 * قابلة للقراءة، والمدير يعدّل اسم الدخول من شاشة المستخدمين متى شاء.
 */

const GENERIC = new Set(["تربيه", "تربويه", "لغه", "لغات", "هندسه", "دراسات", "الي", "بنين", "بنات", "عامه", "عام"]);
const NOISE = new Set(["قسم", "وحده", "وحدة", "علم", "علوم", "برنامج", "تخصص", "ال", "في", "و", "مع", "الكويت"]);

/* الكلمات بعد توحيد الهمزات والتاء المربوطة والياء، وبلا «ال» التعريف */
const WORDS: Record<string, string> = {
  فرنسيه: "French", الفرنسيه: "French", انجليزيه: "English", انجليزي: "English", عربيه: "Arabic", عربي: "Arabic",
  اسلاميه: "Islamic", اسلامي: "Islamic", شرعيه: "Sharia", شريعه: "Sharia", تربيه: "Education", تربويه: "Education",
  اصول: "Foundations", مناهج: "Curricula", تدريس: "Teaching", طرق: "Methods", نفس: "Psychology", نفسيه: "Psychology",
  اجتماع: "Sociology", اجتماعيه: "Social", جغرافيا: "Geography", تاريخ: "History", فلسفه: "Philosophy",
  رياضيات: "Math", رياضه: "Sport", فيزياء: "Physics", كيمياء: "Chemistry", احياء: "Biology", حاسب: "Computer", حاسوب: "Computer",
  حاسبات: "Computer", معلومات: "Info", معلوماتيه: "Informatics", مكتبات: "Library", ادارة: "Admin", اداره: "Admin", ادارية: "Admin",
  اعمال: "Business", محاسبه: "Accounting", اقتصاد: "Economics", تسويق: "Marketing", تمويل: "Finance",
  كهرباء: "Electric", كهربائيه: "Electric", ميكانيكيه: "Mechanical", ميكانيكا: "Mechanical", هندسه: "Eng", مدنيه: "Civil",
  كيميائيه: "Chemical", بحريه: "Marine", بصريات: "Optics", تقنيه: "Tech", تقنيات: "Tech", تكنولوجيا: "Tech", تكنولوجي: "Tech",
  صناعيه: "Industrial", صناعي: "Industrial", ميكاترونكس: "Mechatronics", عمارة: "Architecture", عماره: "Architecture",
  فنون: "Arts", فنيه: "Art", موسيقيه: "Music", موسيقى: "Music", مسرح: "Theatre", اعلام: "Media", اتصال: "Communication",
  خاصه: "Special", خاصة: "Special", طفوله: "Childhood", مبكره: "Early", مبكرة: "Early", صحيه: "Health", صحه: "Health",
  تمريض: "Nursing", طب: "Medicine", صيدله: "Pharmacy", قانون: "Law", سياسه: "Politics", سياسيه: "Politics",
  اداب: "Arts", آداب: "Arts", لغه: "Language", لغات: "Languages", ترجمه: "Translation", مناهجها: "Curricula",
  قياس: "Measurement", تقويم: "Assessment", ارشاد: "Counseling", نفسي: "Psychology", عامه: "General", عام: "General",
  بيئه: "Environment", بيئيه: "Environment", زراعه: "Agriculture", غذائيه: "Food", طبيعيه: "Natural", حيويه: "Bio",
  احصاء: "Statistics", تطبيقيه: "Applied", تطبيقي: "Applied", معلم: "Teacher", الحاسب: "Computer",
};

/* نقلٌ حرفيٌّ لما لا قاموس له */
const LETTERS: Record<string, string> = {
  ا: "a", ب: "b", ت: "t", ث: "th", ج: "j", ح: "h", خ: "kh", د: "d", ذ: "dh", ر: "r", ز: "z", س: "s", ش: "sh", ص: "s", ض: "d",
  ط: "t", ظ: "z", ع: "a", غ: "gh", ف: "f", ق: "q", ك: "k", ل: "l", م: "m", ن: "n", ه: "h", و: "w", ي: "y", ء: "", ئ: "i", ؤ: "u",
};

const normalize = (value: string) => String(value || "")
  .normalize("NFKD").replace(/[ً-ٰٟـ]/g, "")
  .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").trim();

const cap = (value: string) => value ? value[0].toUpperCase() + value.slice(1) : "";
const translit = (word: string) => cap(Array.from(word).map(ch => LETTERS[ch] ?? (/[A-Za-z0-9]/.test(ch) ? ch : "")).join(""));

/** البادئة (حروف وأرقام لاتينية)، أو سلسلة فارغة إن لم يبقَ من الاسم ما يُنقل. */
export function englishPrefixOf(sectionName: string): string {
  const raw = normalize(sectionName).split(/[\s\-–—/،,()]+/).filter(Boolean).filter(word => !NOISE.has(word));
  const words = raw.map(word => word.replace(/^(?:ال)(?=..)/, "").replace(/^(?:و)(?=...)/, "")).filter(word => !NOISE.has(word));
  /* كلماتٌ عامة تُسقط متى بقي في الاسم ما هو أخص منها («التربية الإسلامية» ← Islamic، «اللغة الفرنسية» ← French) */
  const specific = words.filter(word => !GENERIC.has(word));
  const kept = specific.length ? specific : words;
  const named = kept.map(word => WORDS[word] ?? WORDS["ال" + word] ?? translit(word)).filter(Boolean);
  const unique = named.filter((word, index) => named.indexOf(word) === index);
  return (unique.length > 2 ? unique.slice(0, 2) : unique).join("").replace(/[^A-Za-z0-9]/g, "");
}
