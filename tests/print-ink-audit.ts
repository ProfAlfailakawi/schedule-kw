/**
 * ── موفّر الحبر لا يمسّ الهندسة، بالبناء ─────────────────────────────────────
 *
 * «نفس الورقة تماماً»: ملفُّ الأنماط يُحرَس هنا بنيوياً — لا يحمل إلا خصائصَ الرسم (لونٌ وخلفيةٌ وفلتر)،
 * ولا شيئاً من القياس (هامش، حشوة، حجم خطّ، عرض حدّ، عرض، ارتفاع، ترتيب…)، ومحصورٌ بالطباعة وبالسمة.
 * وإحداثيات كل كلمةٍ في كل ورقةٍ مطبوعة تُقارَن في متصفحٍ حقيقي (npm run test:e2e).
 */
import fs from "fs";

let passed = 0, failed = 0;
const check = (ok: boolean, name: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`, detail === undefined ? "" : JSON.stringify(detail)); }
};

const css = fs.readFileSync("src/styles/59-print-ink.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const deferred = fs.readFileSync("src/styles/deferred.css", "utf8");
const reports = fs.readFileSync("src/components/Reports.tsx", "utf8");

check(/^\s*@media print\s*\{/.test(css) && css.trim().endsWith("}") && (css.match(/@media/g) || []).length === 1, "كل القواعد داخل @media print وحدها");
const inner = css.slice(css.indexOf("{") + 1, css.lastIndexOf("}"));
const rules = [...inner.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({ selector: match[1].trim(), body: match[2] }));
check(rules.length >= 20, "القواعد مقروءة", rules.length);
check(rules.every(rule => rule.selector.split(",").every(part => part.trim().startsWith('html[data-print-ink="1"] #app-print-root'))), "كل محدِّد محصورٌ بالسمة وبمنفذ الطباعة: بلا السمة لا أثر");
const ALLOWED = new Set(["background-color", "background-image", "color", "text-shadow", "filter"]);
const used = new Set(rules.flatMap(rule => [...rule.body.matchAll(/([a-z-]+)\s*:/g)].map(match => match[1])));
const stray = [...used].filter(property => !ALLOWED.has(property));
check(stray.length === 0, "لا خاصيةَ قياسٍ في الملف: الرسمُ وحده (لونٌ وخلفيةٌ وفلتر)", stray);
check(deferred.indexOf("08-print.css") > -1 && deferred.indexOf("59-print-ink.css") > deferred.indexOf("08-print.css"), "يُحمَّل بعد 08-print فيغلبها بالمعرّف");
check(/delete root\.dataset\.printInk/.test(reports) && /if \(inkRef\.current\) root\.dataset\.printInk = "1"/.test(reports), "أمر الطباعة يضع السمة ويرفعها عند انتهاء الطباعة");
check(/schedule-print-ink/.test(reports) && !/printInk = "1"[^;]*&&/.test(reports), "الاختيار يبقى، وبلا اختيارٍ فالورقة كما كانت");
const heat = rules.filter(rule => /print-heat-[1-5]/.test(rule.selector)).map(rule => rule.body.match(/#([0-9a-f]{6})/i)?.[1] || "");
check(heat.length === 5 && heat.every((value, index) => index === 0 || value < heat[index - 1]), "درجات الإشغال الخمس متدرّجة بالعتمة (الأشدّ أغمق)", heat);
check(rules.some(rule => /authority-pdf-row-added/.test(rule.selector)) && rules.some(rule => /authority-pdf-row-deleted/.test(rule.selector)), "تقرير التغييرات يبقى مميِّزاً بين المضاف والمحذوف بالرمادي");

console.log(`\nprint ink audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
