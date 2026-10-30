/**
 * العرض التقديمي يتطوّر مع النظام (public/schedule-presentation.html).
 *
 *  ١) كل شاشةٍ في App.tsx (اتحاد View) وكل مجلّد ميزةٍ في docs/ له مكانٌ في سجلّ العرض
 *     (<script id="deck-coverage">): عنوانُ شريحته الصغير، أو «skip: سبب» مكتوب.
 *     ميزةٌ جديدة بلا مكان تُفشل هذا الفحص حتى تُضاف شريحتُها أو يُكتب سببُ غيابها.
 *  ٢) كل عنوانٍ في السجلّ موجودٌ فعلاً في العرض، فلا يشير السجلّ إلى شريحةٍ حُذفت.
 *  ٣) ما يقوله العرض عن الكود ما زال صحيحاً: مواد اللائحة التي تمنع التوقيع، وعدد عدسات التقارير،
 *     ومواضع الذكاء الاصطناعي، وحدّ الحذف بعد الموعد، وعدد مجموعات الاختبار، وتاريخ رصيد الجمهور،
 *     والمساران اللذان تقرأ منهما الأرقامُ الحيّة.
 */
import fs from "fs";
import path from "path";
import { AUDIENCE_BASELINE } from "../src/utils/audienceBaseline";
import { WHOLESALE_DELETE_RATIO } from "../src/utils/approvalWorkflow";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, hint = "") => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m${hint ? `\n   ${hint}` : ""}`); }
};
const read = (file: string) => fs.readFileSync(file, "utf8");
const deck = read("public/schedule-presentation.html");
const FIX = "حدّث public/schedule-presentation.html (الشريحة وسجلّ deck-coverage).";

/* ── ١ و٢: السجلّ ─────────────────────────────────────────────────────────── */
const registryText = deck.match(/<script type="application\/json" id="deck-coverage">([\s\S]*?)<\/script>/)?.[1] || "";
let registry: { views: Record<string, string>; docs: Record<string, string> } = { views: {}, docs: {} };
try { registry = JSON.parse(registryText); } catch { /* يفشل الفحص التالي */ }
check(Object.keys(registry.views || {}).length && Object.keys(registry.docs || {}).length, "سجلّ deck-coverage موجود ويُقرأ JSON");

const viewUnion = read("src/App.tsx").match(/type View =([\s\S]*?);/)?.[1] || "";
const views = [...viewUnion.matchAll(/"([A-Za-z]+)"/g)].map(m => m[1]);
check(views.length > 10, `اتحاد View في App.tsx يُقرأ (${views.length} شاشة)`);
const missingViews = views.filter(v => !(v in registry.views));
check(!missingViews.length, "كل شاشةٍ في App.tsx لها مكانٌ في العرض", `شاشاتٌ جديدة بلا مكان: ${missingViews.join("، ")} — ${FIX}`);

const docDirs = fs.readdirSync("docs", { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
const missingDocs = docDirs.filter(d => !(d in registry.docs));
check(!missingDocs.length, "كل مجلّد ميزةٍ في docs/ له مكانٌ في العرض", `ميزاتٌ جديدة بلا مكان: ${missingDocs.join("، ")} — ${FIX}`);

const eyebrows = new Set([...deck.matchAll(/<p class="eyebrow[^"]*">([^<]+)<\/p>/g)].map(m => m[1].trim()));
const targets = [...Object.entries(registry.views), ...Object.entries(registry.docs)];
const dangling = targets.filter(([, to]) => !to.startsWith("skip:") && !eyebrows.has(to));
check(!dangling.length, "كل عنوانٍ في السجلّ شريحةٌ موجودة", `عناوين لا شريحة لها: ${dangling.map(([k, to]) => `${k} ← «${to}»`).join("، ")}`);
const unexplained = targets.filter(([, to]) => to.startsWith("skip:") && to.slice(5).trim().length < 8);
check(!unexplained.length, "كل غيابٍ له سببٌ مكتوب", unexplained.map(([k]) => k).join("، "));

/* ── ٣: الحقائق ──────────────────────────────────────────────────────────── */
const regs = read("src/utils/scheduleRegulations.ts");
for (const article of ["6/2", "6/3", "7/8", "7/9"]) {
  check(new RegExp(`<span class="rule__a">${article}</span>[\\s\\S]{0,200}?rule__k block`).test(deck) && regs.includes(`م.${article.replace("/", "/")}`),
    `اللائحة: المادة ${article} في العرض «تمنع التوقيع» وفي الكود`);
}
const blockCount = (regs.match(/approvalEffect: "block"/g) || []).length;
check(blockCount === 4, `اللائحة: أربعة مواضع منعٍ في الكود كما يقول العرض (الآن ${blockCount})`, "تغيّر عدد ما يمنع التوقيع: راجع شريحة «اللائحة · قرار 1913/2016».");

const lensCount = (read("src/components/Reports.tsx").match(/const LENSES[\s\S]*?\n\];/)?.[0].match(/\{ id: "/g) || []).length;
check(lensCount === 15 && deck.includes("خمس عشرة عدسة"), `التقارير: خمس عشرة عدسة (الآن ${lensCount})`, "تغيّر عدد العدسات: راجع شريحة «التقارير».");

const geminiCallers = fs.readdirSync("src/server", { recursive: true } as any).map(String).filter(f => f.endsWith(".ts"))
  .filter(f => !f.endsWith(path.join("core", "gemini.ts")) && /from "(\.\.?\/)+(core\/)?gemini"/.test(read(path.join("src/server", f))));
check(geminiCallers.length === 2 && deck.includes("في موضعين فقط"), `الذكاء الاصطناعي في موضعين فقط (الآن ${geminiCallers.length}: ${geminiCallers.join("، ")})`, "تغيّر استعمال Gemini: راجع ملاحظة شريحة «الذكاء الاصطناعي».");

check(WHOLESALE_DELETE_RATIO === 0.3 && deck.includes("حذف أكثر من 30%"), "المحظورات: حدّ الحذف بعد الموعد 30%");

const suiteCount = read("tests/suite.txt").split("\n").map(s => s.trim()).filter(s => s && !s.startsWith("#")).length;
const floor = Number(deck.match(/أكثر من (\d+) مجموعة اختبار/)?.[1] || 0);
check(floor > 0 && suiteCount >= floor, `الاختبارات: ${suiteCount} مجموعة ≥ «أكثر من ${floor}» في العرض`);

const asOf = new Date(`${AUDIENCE_BASELINE.asOf}T00:00:00Z`).toLocaleDateString("ar-KW-u-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
check(deck.includes(`حتى ${asOf}`) || deck.includes(`حتى ${asOf.replace("،", "")}`), `الجمهور: تاريخ الرصيد في العرض هو ${asOf}`, `AUDIENCE_BASELINE.asOf = ${AUDIENCE_BASELINE.asOf}`);

const routes = read("tests/fixtures/server-route-table.json");
for (const api of ["/api/journey", "/api/public/audience-headline"]) {
  check(deck.includes(`'${api}'`) && routes.includes(`"path": "${api}"`), `الأرقام الحيّة: العرض يقرأ ${api} والمسار موجود`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
