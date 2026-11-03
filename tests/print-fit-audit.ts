/**
 * ── الورقة تمتلئ، ولا تُقصّ ─────────────────────────────────────────────────
 *
 * تقرير الأستاذ بمحاضرتين كان يُطبع في ثلث الورقة بخطٍّ صغير، وبسبع محاضراتٍ
 * طويلة الأسماء يُقصّ أسفله في Safari. فصارت كل صفحةٍ تُقاس بقواعد الطباعة
 * نفسها قبل الأمر، وتُكبَّر إلى أقصى ما تحمله ورقة A4 أو تُصغَّر حتى تدخلها
 * (src/utils/printFit.ts). والشامل وتقرير التغييرات يكبران إلى حدّ A4.
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
check(printFitCeiling(page(["print-comprehensive-page"])) === PRINT_FIT_MAX,
  "صفحة الشامل وتقرير التغييرات تتبع الحد الأعلى للقياس الآمن لملء A4");
check(printFitCeiling(page(["print-comprehensive-page"]), true) === 1,
  "الصفحة المدارة إلى A4 لا تُكبَّر مرتين ولا تُسقط التوقيعات إلى ورقة إضافية");
check(printFitCeiling(page(["print-comprehensive-page", "print-changes-appendix"])) === PRINT_FIT_MAX,
  "وملحق التغييرات يتبع الحد الأعلى للقياس الآمن لملء A4");
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
const authorityReport = fs.readFileSync(path.join(process.cwd(), "src/components/AuthorityPdfReport.tsx"), "utf8");
const fitSource = fs.readFileSync(path.join(process.cwd(), "src/utils/printFit.ts"), "utf8");
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
check(fitSource.includes('page.dataset.printFitGroup || `page:${pageIndex}`'), "الصفحة بلا مجموعة صريحة تُقاس وحدها لتملأ A4");
check(!reports.includes('data-print-fit-group="appendix"'), "وكل صفحةٍ من ملحق التغييرات تأخذ أكبر حجمها المناسب");
check(reports.includes("data-print-fit-group={`instructor:"), "وورقة كل أستاذ بحجمها هي");
check(reports.includes("pageIndex === pages.length - 1 ? <PrintSignatures approval={approval} /> : null")
  && reports.includes("!changesAppendix && bookPage === totalPages ? <PrintSignatures approval={approval} /> : null"),
  "التواقيع في آخر صفحة من الملحق أو الشامل فقط");
check(reports.includes("!changesAppendix && bookPage === totalPages ? legendItems.map")
  && reports.includes("pageIndex === pages.length - 1 ? (\n                  <div className=\"print-comprehensive-legend\""),
  "مفتاح الأيام في آخر صفحة من الشامل أو ملحقه فقط");
check(reports.includes("!changesAppendix && bookPage === totalPages && stampCode")
  && reports.includes("pageIndex === pages.length - 1 && stampCode ? <PrintStamp"),
  "رمز QR في آخر صفحة من الشامل أو ملحقه فقط");
check(authorityReport.includes("lastDocumentPage ? (")
  && !authorityReport.includes("مواقع القسم في هذا الفصل:"),
  "توقيع تقرير التغييرات في آخر صفحة وسطر مواقع الفروع محذوف منه");
check(authorityReport.includes("lastDocumentPage && stampCode ? <PrintStamp")
  && authorityReport.includes("pageItems(entries, 28)")
  && reports.includes("COMPREHENSIVE_FIRST_PAGE_ROWS = 28"),
  "QR في آخر التغييرات فقط وعدد الصفوف المعتمد ٢٨");
const comprehensiveGridStart = reports.indexOf('aria-label="تفاصيل المقررات والجدول"');
const comprehensiveGrid = reports.slice(comprehensiveGridStart, reports.indexOf("className={`print-comprehensive-page-footer", comprehensiveGridStart));
check(comprehensiveGridStart >= 0 && !comprehensiveGrid.includes('"م",') && !comprehensiveGrid.includes('className="print-num"')
  && (comprehensiveGrid.match(/role="cell"/g) || []).length === 12
  && printCss.includes("19mm 12mm minmax(51mm,1fr)"),
  "عمود م محذوف من الشامل والمساحة المستعادة للمقرر، مع بقاء بقية الأعمدة ١٢ كما هي");
check(printCss.includes("font-size:4.2pt !important;")
  && printCss.includes("--safari-comprehensive-scale:1;")
  && printCss.includes("--safari-rot-scale:1;"),
  "رقم الصفحة صغير وتقارير Safari تملأ A4 الطولي بحجم الشامل دون تغيير الصفوف أو الاتجاه");
check(printCss.includes('html[data-print-rotate="1"] .print-report.print-wide .print-explicit-page:last-child{\n    margin-bottom:0 !important;'),
  "آخر صفحة في التقرير المدوّر لا تحجز خانةً زائدة تُنشئ صفحة A4 فارغة");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
