/**
 * ── الورقة تمتلئ، ولا تُقصّ ─────────────────────────────────────────────────
 *
 * تقرير الأستاذ بمحاضرتين كان يُطبع في ثلث الورقة بخطٍّ صغير، وبسبع محاضراتٍ
 * طويلة الأسماء يُقصّ أسفله في Safari. فصارت كل صفحةٍ تُقاس بقواعد الطباعة
 * نفسها قبل الأمر، وتُكبَّر إلى أقصى ما تحمله ورقة A4 أو تُصغَّر حتى تدخلها
 * (src/utils/printFit.ts). والشامل وتقرير التغييرات لا يُكبَّران أبداً.
 *
 * هذا الاختبار يحرس الثلاثة: الوسائط تُقيَّم بالورقة لا بالنافذة، وسقف التكبير
 * لكل نوعٍ من الصفحات، وأن كل مسار طباعةٍ يقيس قبل الأمر لا بعده.
 */

import fs from "fs";
import path from "path";
import {
  mediaListAppliesInPrint, mediumAppliesInPrint, packPrintLines, printFitCeiling,
  PRINT_FIT_MAX, PRINT_FIT_MIN, type PrintSheetGeometry,
} from "../src/utils/printFit";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const MM = 96 / 25.4;
const landscape: PrintSheetGeometry = { widthPx: 297 * MM, heightPx: 210 * MM, orientation: "landscape" };
const portrait: PrintSheetGeometry = { widthPx: 210 * MM, heightPx: 297 * MM, orientation: "portrait" };
/* البيئة كما يراها هاتف: حركةٌ مخفّفة ومؤشّرٌ لمسي، وكل ما سوى ذلك لا. */
const phone = (query: string) => /prefers-reduced-motion:\s*reduce|pointer:\s*coarse/.test(query);

/* ── الوسائط تُقيَّم بالورقة، لا بالنافذة ─────────────────────────────────── */

check(mediumAppliesInPrint("print", landscape, phone), "قواعد الطباعة تنطبق");
check(!mediumAppliesInPrint("screen", landscape, phone), "وقواعد الشاشة لا تنطبق على الورقة");
check(!mediumAppliesInPrint("screen and (max-width: 768px)", landscape, phone), "ولا قاعدة شاشةٍ ضيّقة");
check(!mediumAppliesInPrint("(max-width: 640px)", landscape, phone),
  "قاعدة الهاتف (max-width:640px) لا تصل إلى ورقةٍ عرضها 297 ملم ولو طُبعت من هاتف");
check(mediumAppliesInPrint("(min-width: 900px)", landscape, phone), "والورقة العرضية أعرض من 900px");
check(!mediumAppliesInPrint("(min-width: 900px)", portrait, phone), "والطولية (Safari) أضيق منها");
check(mediumAppliesInPrint("(orientation: landscape)", landscape, phone) && mediumAppliesInPrint("(orientation: portrait)", portrait, phone),
  "والاتجاه اتجاه الورقة");
check(mediumAppliesInPrint("(prefers-reduced-motion: reduce)", landscape, phone),
  "وما ليس من الورقة يُسأل عنه المتصفّح كما هو");
check(!mediumAppliesInPrint("(pointer: coarse) and (max-width: 760px)", landscape, phone),
  "والشرطان معاً: لمسيٌّ لكن الورقة ليست ضيّقة");
check(mediumAppliesInPrint("not screen", landscape, phone) && !mediumAppliesInPrint("not print", landscape, phone),
  "والنفي يُقلب");
check(mediumAppliesInPrint("only print and (min-width: 1000px)", landscape, phone), "و«only» لا تغيّر المعنى");
check(mediaListAppliesInPrint("screen, print", landscape, phone) && !mediaListAppliesInPrint("screen, (max-width: 600px)", landscape, phone),
  "والقائمة تنطبق إن انطبق أحد وسائطها");
check(mediaListAppliesInPrint("", landscape, phone), "والقائمة الفارغة تنطبق دائماً");

/* ── سقف التكبير لكل نوعٍ من الصفحات ─────────────────────────────────────── */

const page = (classes: string[]) => ({ matches: (selector: string) => classes.some(name => selector === `.${name}`) });
check(printFitCeiling(page(["print-explicit-page"])) === PRINT_FIT_MAX, "صفحات التقارير تُكبَّر حتى تمتلئ الورقة");
check(printFitCeiling(page(["print-comprehensive-page"])) === 1,
  "وصفحة الشامل وتقرير التغييرات لا تُكبَّر أبداً: صفّها مطابقٌ لورقة التسجيل");
check(printFitCeiling(page(["print-comprehensive-page", "print-changes-appendix"])) === PRINT_FIT_MAX,
  "أمّا ملحق التغييرات فوثيقةٌ نصية تُملأ كبقية التقارير");
check(PRINT_FIT_MIN >= 0.5 && PRINT_FIT_MAX <= 2, "والتصغير والتكبير في حدودٍ تُقرأ");

/* ── الملحق صفحاتٌ بحسب طوله، لا صفحةٌ تُقصّ ──────────────────────────────── */

const ones = Array.from({ length: 80 }, (_, index) => index);
const packed = packPrintLines(ones, () => 1, 34, 42);
check(packed.length === 3 && packed[0].length === 34 && packed[1].length === 42 && packed[2].length === 4,
  "ثمانون تغييراً: 34 في الأولى (مع الملخّص) ثم 42 ثم الباقي");
check(packed.flat().length === 80 && packed.flat().every((item, index) => item === index), "لا يسقط تغييرٌ ولا يتبدّل ترتيبه");
check(packPrintLines([], () => 1, 34, 42).length === 1, "والملحق الفارغ صفحةٌ واحدة تقول «لم يتغيّر شيء»");
check(packPrintLines([1, 2], () => 99, 34, 42).length === 2, "والتغيير الأطول من الصفحة يبقى وحده، ولا يُترك صفحةٌ فارغة قبله");

/* ── كل مسار طباعةٍ يقيس قبل الأمر ───────────────────────────────────────── */

const reports = fs.readFileSync(path.join(process.cwd(), "src/components/Reports.tsx"), "utf8");
const printCss = fs.readFileSync(path.join(process.cwd(), "src/styles/08-print.css"), "utf8");
const fitCalls = reports.split("fitPrintPages(document.getElementById(\"app-print-root\") || document);").length - 1;
check(fitCalls === 3, "التقارير والشامل وتقرير التغييرات: ثلاثة مسارات طباعة، وكلها تقيس");
for (const marker of ["const printReport = ", "const runPrint = ", "const printAuthorityReport = "]) {
  const start = reports.indexOf(marker);
  const body = reports.slice(start, reports.indexOf("if (!invoked) window.print();", start));
  check(start >= 0 && body.includes("fitPrintPages(") && body.indexOf("printRotate") < body.indexOf("fitPrintPages("),
    `${marker.trim()} يقيس بعد سمات المحرّك وقبل أمر الطباعة`);
}
const flat = printCss.replace(/\s+/g, "");
check(flat.includes(".print-explicit-page[data-print-fit]>*") && flat.includes(".print-comprehensive-page[data-print-fit]>*") && flat.includes("zoom:var(--print-fit,1)!important"),
  "والحجم يُطبَّق على محتوى الصفحة كله، لا على هوامشها");
check(reports.includes('data-print-fit-group="appendix"'), "وصفحات الملحق حجمٌ واحد");
check(reports.includes("data-print-fit-group={`instructor:"), "وورقة كل أستاذ بحجمها هي");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
