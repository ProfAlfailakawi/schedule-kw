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
import { branchReadingScopes, siblingBranchScopes } from "../src/utils/branchScope";
import { departmentFamily } from "../src/utils/sectionLabel";
import { predictiveNarrow } from "../src/utils/predictiveScope";

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
  check((panel.match(/data-guide-ignore=/g) || []).length === 1 && read("src/components/query/PrintTiles.tsx").split("data-guide-ignore=").length === 3, "أزرار القائمة موسومة للمرشد (الاختيار، والبلاطتان في PrintTiles)");
}

/* ٥. الورقة المطبوعة لم تُمسّ، وبقية القوائم كما هي */
{
  check(!/@media print|print-/.test(css.replace(/report-choice-print/g, "")), "ملف الأنماط لا يمسّ الطباعة");
  check(/\.query-scope-menu\.report-choice\{/.test(css) && !/^\.query-scope-menu\{/m.test(css), "الأنماط محصورة في .report-choice");
  check(reports.includes('scopeMenu === "instructor"') && reports.includes('aria-label="نطاق تقرير الأستاذ"'), "قائمة تقرير الأستاذ باقية");
  check(read("src/index.css").includes('@import "./styles/48-report-choice.css";'), "الأنماط مستوردة");
}

/* ٦. «صحة الجدول» تقرأ «كل الفروع» كما يطبعها الشامل وتقرير التغييرات:
      البنات مع الجهراء والفحيحيل، ولا يدخل البنين. */
{
  const colleges = [
    { AdCollegeId: 1, AdCollegeName: "كلية التربية الأساسية - بنات" },
    { AdCollegeId: 2, AdCollegeName: "كلية التربية الأساسية - بنين" },
    { AdCollegeId: 3, AdCollegeName: "كلية التربية الأساسية - بنات - الجهراء" },
    { AdCollegeId: 4, AdCollegeName: "كلية التربية الأساسية - بنات - الفحيحيل" },
    { AdCollegeId: 5, AdCollegeName: "كلية بلا رمز موقع" },
    { AdCollegeId: 6, AdCollegeName: "كلية أخرى بلا رمز" },
  ];
  const sections = [
    { AdSectionId: 10, AdCollegeId: 1, AdSectionCode: "TE", AdSectionName: "تكنولوجيا التعليم" },
    { AdSectionId: 20, AdCollegeId: 2, AdSectionCode: "TE", AdSectionName: "تكنولوجيا التعليم" },
    { AdSectionId: 30, AdCollegeId: 3, AdSectionCode: "TE", AdSectionName: "تكنولوجيا التعليم" },
    { AdSectionId: 40, AdCollegeId: 4, AdSectionCode: "TE", AdSectionName: "تكنولوجيا التعليم" },
    { AdSectionId: 50, AdCollegeId: 5, AdSectionCode: "MA", AdSectionName: "الرياضيات" },
    { AdSectionId: 60, AdCollegeId: 6, AdSectionCode: "MA", AdSectionName: "الرياضيات" },
  ];
  const key = (list: Array<{ collegeId: number; sectionId: number }> | null) => (list || []).map(m => `${m.collegeId}:${m.sectionId}`).join(",");
  const girls = branchReadingScopes(colleges, sections, 1, 10);
  const report = siblingBranchScopes({ colleges, sections, baseCollegeId: 1, baseSectionId: 10 }).map(s => ({ collegeId: s.collegeId, sectionId: s.sectionId }));
  check(key(girls) === key(report), "صحة الجدول: «كل الفروع» هي مواقع التقرير الشامل نفسها");
  check(key(girls) === "1:10,4:40,3:30", "البنات أولاً ثم الفحيحيل والجهراء");
  check(!key(girls).includes("2:20"), "البنين لا يدخلون قراءة فروع البنات");
  check(key(departmentFamily(sections as any, 1, 10)).includes("2:20"), "(قبل الإصلاح كانت عائلة الاسم تضم البنين)");
  check(key(branchReadingScopes(colleges, sections, 2, 20)) === "2:20", "البنين: موقعٌ واحد فلا يظهر «كل الفروع»");
  check(branchReadingScopes(colleges, sections, 5, 50) === null, "كلية بلا رمز موقع: يبقى للقارئ ما كان (عائلة الاسم)");
  const narrow = predictiveNarrow({ analysisScope: "department", collegeId: 1, sectionId: 10 }, sections, colleges)!;
  check(narrow.match(3, 30) && narrow.match(4, 40) && !narrow.match(2, 20), "تنبؤ الفصل القادم يضيّق «كل الفروع» بالمواقع نفسها");
  check(read("src/server/simulationRoutes.ts").includes("predictiveNarrow(req.query, narrowSections, narrowColleges"), "الخادم يمرّر الكليات لتضييق التنبؤ");
  check(/branchReadingScopes\(catalog\.colleges, catalog\.sections/.test(read("src/components/DemandAnalysis.tsx")), "تحليل الطلب يجمع «كل الفروع» بالمواقع نفسها");
  const scope = read("src/server/core/scope.ts");
  check(/branchReadingScopes\(colleges[^)]*\) \|\| departmentFamily\(/.test(scope), "الخادم يقرأ «كل الفروع» لمركز الذكاء بالدالة نفسها");
  const workspace = read("src/components/IntelligenceWorkspace.tsx");
  check(/branchReadingScopes\(colleges, sections/.test(workspace), "مفتاح النطاق يظهر بحسب الفروع نفسها");
  const sw = read("src/components/IntelligenceScopeSwitch.tsx");
  check(sw.includes("'هذا الموقع'") && sw.includes("'كل الفروع'") && !sw.includes("كل كليات القسم"), "مفتاح النطاق بكلمتي التقرير الشامل: «هذا الموقع» و«كل الفروع»");
  const labels = comprehensiveChoices(ctxBranches).map(c => c.label);
  check(labels.includes("هذا الموقع") && labels.includes("كل الفروع"), "الكلمتان نفسهما في خيارات التقرير الشامل");
}

/* ٧. الخروج من الاستعلامات أو اختيار تقريرٍ آخر يصفّرها */
{
  check(/useEffect\(\(\) => \(\) => \{ safeStorage\.remove\(prefKey\); \}, \[prefKey\]\);/.test(reports), "مغادرة الاستعلامات تمحو العدسة والمرشّحات المحفوظة");
  const modeEffect = reports.slice(reports.indexOf("const modeSeen = useRef(false);"), reports.indexOf("}, [mode]);"));
  check(/if \(modeSeen\.current\) \{[\s\S]*?setFilters\(prev => \(\{ \.\.\.fresh\(\), collegeId: prev\.collegeId[\s\S]*?setSelectedResultId\(null\);\s*setScopeMenu\(null\);/.test(modeEffect), "اختيار شاشةٍ أخرى من قائمة الاستعلامات يصفّر مرشّحاتها ونتيجتها");
  const select = reports.slice(reports.indexOf("const selectLens = (next: Lens) =>"), reports.indexOf("const selectLens = (next: Lens) =>") + 1200);
  check(/if \(another\) \{\s*resetFilters\(\);\s*setSelectedResultId\(null\);\s*setScopeMenu\(null\);/.test(select), "اختيار تقريرٍ آخر يصفّر المرشّحات والنتيجة المفتوحة وقائمة الطباعة");
  check(select.includes('new Set<Lens>(["visiting", "visitingHistory"])'), "المنتدبون وكل الفصول وجهان لتقريرٍ واحد فلا يُصفَّران");
  const reset = reports.match(/const resetFilters = \(\) => setFilters\(prev => \(\{ \.\.\.fresh\(\), collegeId: prev\.collegeId, sectionId: prev\.sectionId, termId: prev\.termId \}\)\);/);
  check(Boolean(reset), "التصفير يُبقي الكلية والقسم والفصل");
  check(reports.includes('safeStorage.set("schedule-print-ink"') && !/safeStorage\.remove\("schedule-print-ink"/.test(reports), "موفّر الحبر تفضيلٌ لا يُمحى");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
