/**
 * ── ركن الودجت (iPhone Duo): الحارس الثابت (بلا متصفح) ───────────────────────
 *
 * يقرأ ملفات CSS ويتحقق من العقد الذي يعتمد عليه الحارس الحيّ (tests/duo-widget-guard.mjs):
 *  1) المتغيّرات الأربعة معرَّفةٌ مرةً واحدة في 01-foundation.css بصفرٍ افتراضي، وتُفعَّل بالاستعلامات الثلاثة وحدها؛
 *  2) الاستعلامات تُقيَّم هنا على مقاسات الدوو (يجب أن تطابق كلَّها) وعلى iPhone وiPad وسطح المكتب (يجب ألا تطابق أيّاً)؛
 *  3) قواعد الحجز في 55-duo-adaptive.css فيزيائيةٌ (right/padding-right) لا inline-end، ولا !important فيها؛
 *  4) لا بقايا للمستطيل القديم 116×116 (--duo-cutout-*) ولا شرط display-mode.
 */
import fs from "node:fs";
import path from "node:path";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}
const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const flat = (css: string) => strip(css).replace(/\s+/g, "");

const foundation = read("src/styles/01-foundation.css");
const f = flat(foundation);
const duoFile = read("src/styles/55-duo-adaptive.css");

/* 1) التعريف. */
check(/:root\{--duo-widget-w:0px;--duo-widget-gap:0px;--duo-widget-h:0px;--duo-widget-inset:calc\(var\(--duo-widget-w\)\+var\(--duo-widget-gap\)\);\}/.test(f),
  "المتغيّرات --duo-widget-w/-gap/-h/-inset معرَّفةٌ في 01-foundation.css وقيمتها 0 افتراضياً (لا أثر خارج الدوو)");
const active = f.match(/@media([^{]*)\{:root\{--duo-widget-w:96px;--duo-widget-gap:8px;--duo-widget-h:clamp\(64px,31vh,270px\)\}\}/);
check(!!active, "التفعيل في كتلةٍ واحدة: العرض 96px، الفجوة 8px، الارتفاع clamp(64px,31vh,270px)");
check((f.match(/--duo-widget-w:96px/g) || []).length === 1, "قيمة 96px تُكتب مرةً واحدة في كل الملفات الأساسية");
const queries = (active ? active[1] : "").split(",").map((q) => q.trim());
check(queries.length === 3 && queries.every((q) => /^screenand/.test(q)), "ثلاثةُ استعلاماتٍ كلُّها screen: طولي، عرضي، مفصل (viewport-segments)");

/* 2) تقييم الاستعلامات على مقاسات مسمّاة. */
type Dims = { w: number; h: number };
function evalQuery(q: string, { w, h }: Dims): boolean | "segments" {
  if (/horizontal-viewport-segments:2/.test(q)) return "segments";
  const num = (re: RegExp) => { const m = q.match(re); return m ? Number(m[1]) : null; };
  const [minW, maxW, minH, maxH] = [num(/\(min-width:(\d+)px\)/), num(/\(max-width:(\d+)px\)/), num(/\(min-height:(\d+)px\)/), num(/\(max-height:(\d+)px\)/)];
  const ratio = (re: RegExp) => { const m = q.match(re); return m ? Number(m[1]) / Number(m[2]) : null; };
  const [minR, maxR] = [ratio(/\(min-aspect-ratio:(\d+)\/(\d+)\)/), ratio(/\(max-aspect-ratio:(\d+)\/(\d+)\)/)];
  const orient = q.match(/\(orientation:(landscape|portrait)\)/)?.[1];
  const r = w / h;
  return (minW === null || w >= minW) && (maxW === null || w <= maxW) && (minH === null || h >= minH) && (maxH === null || h <= maxH)
    && (minR === null || r >= minR) && (maxR === null || r <= maxR) && (!orient || orient === (w > h ? "landscape" : "portrait"));
}
const hit = (w: number, h: number) => queries.some((q) => evalQuery(q, { w, h }) === true);
const DUO: [number, number][] = [[382, 580], [470, 780], [594, 368], [669, 867], [951, 585], [457, 678], [457, 760]];
/* تطبيقٌ بارتفاعٍ كامل: يجب أن يطابق أيضاً. */
const DUO_TALL: [number, number][] = [[382, 720], [382, 780], [382, 844], [470, 900], [440, 660], [480, 720], [430, 932], [390, 844], [669, 1000], [951, 700]];
const DUO_BOTH = DUO.flatMap(([w, h]) => [[w, h], [h, w]] as [number, number][]);
const missed = [...DUO_BOTH, ...DUO_TALL].filter(([w, h]) => !hit(w, h));
check(missed.length === 0, `الاستعلامات تطابق الدوو طولياً وعرضياً (14 مقاساً + 10 بارتفاعٍ كامل)${missed.length ? " — لا تطابق: " + missed.map((s) => s.join("×")).join("، ") : ""}`);
const NOT_DUO: [number, number][] = [[844, 390], [932, 430], [667, 375], [744, 1133], [768, 1024],
  [810, 1080], [820, 1180], [834, 1194], [1024, 768], [1024, 1366], [1180, 820], [1366, 1024], [1280, 800], [1440, 900], [1920, 1080]];
const wrongly = NOT_DUO.filter(([w, h]) => hit(w, h));
check(wrongly.length === 0, `لا تطابق iPhone/iPad/سطح المكتب/المطويّ الخارجي (16 مقاساً)${wrongly.length ? " — تطابق: " + wrongly.map((s) => s.join("×")).join("، ") : ""}`);

/* حدٌّ معروف مسجَّل: iPhone الطولي (360–430 عرضاً) يطابق الاستعلام الطولي؛ لا يُفصَل عن الدوو بالمقاس. */

/* 3) قواعد الحجز. */
const reserve = strip(duoFile.slice(duoFile.lastIndexOf("/*", duoFile.indexOf("ركن الودجت — iPhone Duo"))));
check(/--duo-widget-inset/.test(reserve) && /\.mobile-topbar\{padding-right:calc\([^}]*var\(--duo-widget-inset\)\)\}/.test(flat(reserve)),
  "الشريط العلوي يحجز الركن بحشوةٍ يمنى فيزيائية");
check(!/inline-end|padding-inline-start|margin-inline-start|inset-inline-end/.test(reserve.replace(/inset-inline:/g, "")),
  "قواعد الركن بلا inline-end/inline-start (الودجت على يمين الشاشة الفعلي، وinline-end يذهب لليسار في RTL)");
check(!/!important/.test(reserve), "قواعد الركن بلا !important");
check(/ركن الودجت/.test(duoFile) && !/--duo-cutout/.test(duoFile + foundation) && !/display-mode/.test(strip(duoFile)),
  "لا بقايا للمستطيل القديم 116×116 ولا شرط display-mode");

/* 4) صفحة التشخيص تُحمَّل بالمعامل وحده. */
const main = read("src/main.tsx");
check(/duo-debug/.test(main) && /import\(["']\.\/utils\/duoDebug["']\)/.test(main), "صفحة ?duo-debug=1 تُحمَّل ديناميكياً بوجود المعامل وحده");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
