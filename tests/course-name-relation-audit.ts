/**
 * اسم المقرر في الكتالوج مقابل الصحيفة: الإملاء لا يُكتب فوق اسمٍ سليم، والاسم الأتمّ يُصحَّح إليه،
 * ومقررٌ آخر يحمل الرقم لا يُعاد تسميته. الأمثلة من صحائف كلية التربية الأساسية الحقيقية.
 */
import { courseNameRelation } from "../src/utils/courseNameRelation";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};

const kept = (catalog: string, sheet: string) => ["same", "spelling"].includes(courseNameRelation(catalog, sheet));
check(kept("الثقافة الإسلامية", "الثقافه الاسلاميه"), "الهاء والتاء والهمزات إملاء: الاسم يبقى");
check(kept("سيكولوجية النمو", "سيكلوجيه النمو") && kept("ميكروبيولوجيا الاغذيه", "ميكروبولوجيا الاغذيه"), "سيكولوجية/سيكلوجيه وميكروبيولوجيا/ميكروبولوجيا إملاء");
check(courseNameRelation("تطور فكر تربوي", "تطور الفكر التربوي") === "spelling", "«ال» إملاء");
check(courseNameRelation("كيمياء عامة محاضرة", "كيمياء عامة") === "spelling", "«محاضرة» يفرّق المحاضرة عن المختبر ولا يُحذف");
check(courseNameRelation("أسس تكنولوجيا التعلم", "أسس تكنولوجيا التعليم") === "related", "«التعلم» ليست «التعليم»: يُصحَّح");
check(courseNameRelation("اناشيد1", "بيانو واناشيد (1)") === "related", "الاسم الأتمّ للمقرر نفسه يُصحَّح");
check(courseNameRelation("م. في الإحصاء والإحتمال", "مبادئ في الا حصاء والا حتمال") === "related", "الاختصار والمسافات المكسورة: المقرر نفسه");
check(courseNameRelation("مدخل الى الا عاقه العقلية", "التربية الأسرية") === "different", "مقرر التربية الخاصة القديم عند علم النفس ليس «التربية الأسرية»");
check(courseNameRelation("مدخل الى التربية المبكرة", "تربية عملية (1)") === "different", "كلمة «تربية» وحدها لا تجعل المقررين واحداً");
check(courseNameRelation("حساب التفاضل والتكامل (2)", "صعوبات التعلم النمائية") === "different", "مقرر رياضيات في قسم التربية الخاصة ليس مقررها");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
