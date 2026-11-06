/**
 * ── لا تضيع ورقةٌ من أوراق التقريرين المركّبين ────────────────────────────────
 *
 * «التقرير الشامل» و«تقرير تغييرات الجدول» كانت أوراقهما موزّعةً بين أزرار
 * وأيقونة وقوائم، فصارت قائمةً واحدة: سطرٌ لكل ورقة وزرّ طباعة واحد.
 *
 * يحفظ هذا الاختبار جرد الأوراق قبل التغيير (BEFORE)، ويقارنه بما تعرضه القائمة
 * الآن في كل حال (قسمٌ في موقعٍ واحد، وقسمٌ في فروع)، ويتحقق أن كل خيارٍ موصولٌ
 * بأمر الطباعة نفسه الذي كان يخرج به.
 */
import fs from "fs";
import path from "path";
import { activeChoice, authorityChoices, comprehensiveChoices } from "../src/utils/reportChoices";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const read = (file: string) => fs.readFileSync(path.resolve(file), "utf8");
const reports = read("src/components/Reports.tsx");
const panel = read("src/components/ReportChoicePanel.tsx");
const css = read("src/styles/48-report-choice.css");

/* الجرد قبل التغيير: الورقة ⇦ أمر الطباعة الذي يُخرجها. */
const BEFORE = {
  comprehensive: {
    site: 'printReport("comprehensive")',
    "site-appendix": "printComprehensiveWithChanges()",
    branches: "printBranchComprehensive()",
  },
  authority: {
    site: "printAuthorityReport(false)",
    branches: "printBranchAuthorityReport(false)",
    "site-civil": "printAuthorityReport(true)",
    "branches-civil": "printBranchAuthorityReport(true)",
  },
} as const;
const beforeWithBranches = Object.keys(BEFORE.comprehensive).length + Object.keys(BEFORE.authority).length;
const beforeOneSite = 4;

const ctxBranches = { collegeName: "كلية التربية الأساسية", branchLabels: ["البنات", "الجهراء"] };
const ctxOneSite = { collegeName: "كلية التربية الأساسية", branchLabels: [] };
const ids = (list: Array<{ id: string }>) => list.map(item => item.id).sort().join(",");

/* ١. الجرد قبل وبعد */
{
  const comprehensive = comprehensiveChoices(ctxBranches);
  const authority = authorityChoices(ctxBranches);
  console.log(`قبل: ${beforeWithBranches} ورقة (فروع) · ${beforeOneSite} (موقع واحد)`);
  console.log(`بعد: ${comprehensive.length + authority.length} ورقة (فروع) · ${comprehensiveChoices(ctxOneSite).length + authorityChoices(ctxOneSite).length} (موقع واحد)`);
  for (const item of [...comprehensive.map(c => `التقرير الشامل ← ${c.label}`), ...authority.map(c => `تغييرات الجدول ← ${c.label}`)]) console.log(`  · ${item}`);
  check(ids(comprehensive) === Object.keys(BEFORE.comprehensive).sort().join(","), "الشامل: الأوراق الثلاث كلها موجودة بلا زيادة");
  check(ids(authority) === Object.keys(BEFORE.authority).sort().join(","), "التغييرات: الأوراق الأربع كلها موجودة بلا زيادة");
  check(comprehensive.length + authority.length === beforeWithBranches, "العدد قبل وبعد متساوٍ لقسمٍ في فروع");
  check(ids(comprehensiveChoices(ctxOneSite)) === "site,site-appendix", "موقع واحد: الشامل بورقتيه");
  check(ids(authorityChoices(ctxOneSite)) === "site,site-civil", "موقع واحد: التغييرات عادي ومع الرقم المدني");
  check(comprehensiveChoices(ctxOneSite).length + authorityChoices(ctxOneSite).length === beforeOneSite, "العدد قبل وبعد متساوٍ لقسمٍ في موقع واحد");
  check(!comprehensiveChoices({ ...ctxBranches, branchLabels: ["البنات"] }).some(c => c.id === "branches"), "موقعٌ واحد لا يُعرض له «كل الفروع»");
}

/* ٢. كل خيارٍ موصولٌ بأمره، وأسماء الأوراق باقية */
{
  const flat = reports.replace(/\s+/g, " ");
  for (const [report, map] of Object.entries(BEFORE)) {
    for (const [id, call] of Object.entries(map)) {
      check(new RegExp(`case "${id}": [^;]*${call.replace(/[()]/g, "\\$&")}`).test(flat.slice(flat.indexOf(`const print${report === "comprehensive" ? "Comprehensive" : "Authority"}Choice`))), `${report}/${id} يصل إلى ${call}`);
    }
  }
  const labels = [...comprehensiveChoices(ctxBranches), ...authorityChoices(ctxBranches)].map(c => c.label);
  check(labels.includes("مع ملحق التغييرات"), "«مع ملحق التغييرات» مسمّى في القائمة");
  check(labels.every(label => label.length <= 28 && !label.includes("\n")), "كل خيارٍ سطرٌ واحد قصير");
  check(!/<IdCard/.test(reports), "أيقونة الرقم المدني زالت: صار خياراً في القائمة");
}

/* ٣. الاختيار الواحد */
{
  const list = comprehensiveChoices(ctxBranches);
  check(activeChoice(list, null).id === "site", "الخيار الأول نشطٌ بلا حفظ");
  check(activeChoice(list, "branches").id === "branches", "الخيار المحفوظ يبقى");
  check(activeChoice(comprehensiveChoices(ctxOneSite), "branches").id === "site", "خيارٌ سقط مع تغيّر القسم يعود إلى الأول");
}

/* ٤. لوحة المفاتيح والاتجاه */
{
  check(panel.includes('role="radiogroup"') && panel.includes('role="radio"') && panel.includes("aria-checked={selected}"), "مجموعة اختيار واحد لقارئ الشاشة");
  check(panel.includes("tabIndex={selected ? 0 : -1}"), "تركيزٌ واحد متنقّل");
  for (const key of ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End", "Enter"]) check(panel.includes(`"${key}"`), `المفتاح ${key}`);
  check(panel.includes("opener.focus()"), "الإغلاق يعيد التركيز إلى زر التقرير");
  check((panel.match(/data-guide-ignore=/g) || []).length === 2, "أزرار القائمة موسومة للمرشد");
}

/* ٥. الورقة المطبوعة لم تُمسّ، وبقية القوائم كما هي */
{
  check(!/@media print|print-/.test(css.replace(/report-choice-print/g, "")), "ملف الأنماط لا يمسّ الطباعة");
  check(/\.query-scope-menu\.report-choice\{/.test(css) && !/^\.query-scope-menu\{/m.test(css), "الأنماط محصورة في .report-choice");
  check(reports.includes('scopeMenu === "instructor"') && reports.includes('aria-label="نطاق تقرير الأستاذ"'), "قائمة تقرير الأستاذ باقية");
  check(read("src/index.css").includes('@import "./styles/48-report-choice.css";'), "الأنماط مستوردة");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
