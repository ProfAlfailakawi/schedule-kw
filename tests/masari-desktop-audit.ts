/**
 * «مساري» على الحاسوب، وأيقونةُ الديمو بين الحاسوب والهاتف.
 * القاعدةُ التي تُحمى هنا: التخطيطُ يتبع عرضَ النافذة والشاشةَ وحدهما (فلا قفزة بعد وصول بياناتٍ متأخرة)،
 * و«وضع الهاتف» في الديمو يُبطله كلَّه بسمةٍ واحدة، ولا يظهر زرُّه لغير الديمو.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { STUDENT_HOME_CSS, STUDENT_HOME_SCRIPT, studentHomePage } from "../src/server/studentHomePage";
import { STUDENT_MAP_CSS } from "../src/server/studentMapUi";

let passed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => { if (!ok) console.log("✗ " + label, extra ?? ""); assert.ok(ok, label); passed++; console.log("✓ " + label); };

/* ── ١. قواعدُ الحاسوب: كلُّها خلف شرط العرض، وكلُّها يُبطلها وضع الهاتف ── */
const start = STUDENT_HOME_CSS.indexOf("@media (min-width:960px){");
assert.ok(start > 0, "كتلة الحاسوب موجودة");
let depth = 0, end = start;
for (let i = STUDENT_HOME_CSS.indexOf("{", start); i < STUDENT_HOME_CSS.length; i++) {
  if (STUDENT_HOME_CSS[i] === "{") depth++;
  if (STUDENT_HOME_CSS[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
}
const block = STUDENT_HOME_CSS.slice(start, end + 1);
const selectors = [...block.slice(block.indexOf("{") + 1).matchAll(/([^{}]+)\{[^{}]*\}/g)].map(m => m[1].trim());
check(selectors.length > 30, `كتلة الحاسوب فيها ${selectors.length} قاعدة`);
const loose = selectors.filter(s => !/^html:not\(\[data-device="phone"\]\)/.test(s) && !/^html\[data-device="phone"\]/.test(s) && !/^\.devbtn/.test(s));
check(loose.length === 0, "كلُّ قاعدةٍ في كتلة الحاسوب تبدأ بشرط «ليس وضع الهاتف» (أو هي قاعدةُ وضع الهاتف نفسِه)", loose);
check(/\.devbtn\{display:none;/.test(STUDENT_HOME_CSS) && /@media \(min-width:960px\)\{\n\.devbtn\{display:inline-grid\}/.test(STUDENT_HOME_CSS), "زرُّ التبديل مخفيٌّ افتراضياً ولا يظهر إلا بعرض الحاسوب");
const withoutBlock = STUDENT_HOME_CSS.slice(0, start) + STUDENT_HOME_CSS.slice(end + 1);
check(!/\.app\[data-view/.test(withoutBlock) && !/min-width:9\d\dpx/.test(STUDENT_MAP_CSS) && !/\.app\.km-on\{max-inline-size/.test(STUDENT_MAP_CSS), "العرضُ الواسع لا يتعلّق بوصول الخريطة (km-on) ولا يُكتب خارج الكتلة");
check(/\.app\[data-view="home"\]\{max-inline-size:1160px/.test(block) && /\.pane\[data-pane="now"\]\{display:grid;grid-template-columns:minmax\(0,1\.55fr\) minmax\(0,1fr\)/.test(block), "الرئيسية: حاويةٌ ١١٦٠px وعمودان (ما يُفعل الآن وبجانبه البقية)");
check(/#primarySlot>:empty:not\(\.skel\)\{display:none\}/.test(block), "المضيفاتُ الفارغة لا تترك فجواتٍ في الشبكة، والهيكلُ المحجوز لا يُخفى");
check(/header\.top\{position:sticky/.test(block) && /nav\.tabs\{flex:0 1 340px/.test(block), "الترويسةُ لاصقة والتبويباتُ فيها");
check(/\.dock:empty\{display:none\}/.test(block), "الشريط السفلي الفارغ لا يُرسم على الحاسوب");
check(/\.scrim\{align-items:center\}/.test(block) && /\.sheet\{border-radius:28px/.test(block), "الأوراقُ تتوسّط الشاشة على الحاسوب");

/* ── ٢. المنطق (vm) ── */
const fn = (name: string, next: string) => {
  const begin = STUDENT_HOME_SCRIPT.indexOf("function " + name + "(");
  const e = STUDENT_HOME_SCRIPT.indexOf("function " + next + "(", begin + 1);
  assert.ok(begin >= 0 && e > begin, "تستخرج " + name);
  return STUDENT_HOME_SCRIPT.slice(begin, e);
};
const attrs: Record<string, string> = {};
const store: Record<string, string> = {};
const mkNode = (parent: any = null) => ({ parentNode: parent });
const dockEl: any = mkNode(), topEl: any = mkNode();
const nav: any = mkNode(dockEl);
dockEl.appendChild = (n: any) => { n.parentNode = dockEl; return n; };
topEl.insertBefore = (n: any) => { n.parentNode = topEl; return n; };
topEl.querySelector = (s: string) => (s === ".topr" ? {} : null);
let wide = true;
const ctx: Record<string, any> = {
  S: { state: { demo: true }, view: "home" }, dockEl, topEl,
  location: { search: "" },
  localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } },
  window: { matchMedia: () => ({ get matches() { return wide; } }) },
  document: {
    documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; }, removeAttribute: (k: string) => { delete attrs[k]; }, getAttribute: (k: string) => attrs[k] ?? null },
    querySelector: (s: string) => (s === "nav.tabs" ? nav : null),
  },
};
runInNewContext([
  fn("deviceMode", "applyDevice"), fn("applyDevice", "isWide"), fn("isWide", "placeTabs"), fn("placeTabs", "syncWide"),
  "this.deviceMode=deviceMode;this.applyDevice=applyDevice;this.isWide=isWide;this.placeTabs=placeTabs;",
].join("\n"), ctx);
ctx.window.matchMedia = (q: string) => ({ matches: q === "(min-width:960px)" ? wide : false });

check(ctx.deviceMode() === "desktop", "الافتراضيُّ: عرضٌ يتبع النافذة");
store["masari-device"] = "phone"; check(ctx.deviceMode() === "phone", "المحفوظُ في المتصفح يُقرأ");
ctx.location.search = "?device=desktop"; check(ctx.deviceMode() === "desktop", "?device=desktop يغلب المحفوظ");
ctx.location.search = "?device=phone"; delete store["masari-device"]; check(ctx.deviceMode() === "phone", "?device=phone يفرض الهاتف من الرابط");
ctx.location.search = ""; store["masari-device"] = "غريب"; check(ctx.deviceMode() === "desktop", "قيمةٌ غريبة تعود إلى الافتراضي");
ctx.localStorage.getItem = () => { throw new Error("blocked"); }; check(ctx.deviceMode() === "desktop", "تخزينٌ محجوب (وضعٌ خاص): لا يكسر الصفحة");
ctx.localStorage.getItem = (k: string) => store[k] ?? null;

store["masari-device"] = "phone";
ctx.S.state.demo = true; ctx.applyDevice(); check(attrs["data-device"] === "phone", "في الديمو: السمةُ تُطبَّق");
ctx.S.state.demo = false; ctx.applyDevice(); check(!("data-device" in attrs), "لغير الديمو: لا تُطبَّق ولو بقي اختيارٌ قديمٌ في المتصفح");
ctx.S.state.demo = true; store["masari-device"] = "desktop"; ctx.applyDevice();
wide = true; check(ctx.isWide() === true, "٩٦٠px فأكثر وعرض الحاسوب: واسع");
wide = false; check(ctx.isWide() === false, "أقلُّ من ٩٦٠px: ليس واسعاً");
wide = true; attrs["data-device"] = "phone"; check(ctx.isWide() === false, "وضع الهاتف يُبطل العرض الواسع ولو كانت النافذة عريضة");
delete attrs["data-device"];

nav.parentNode = dockEl; ctx.placeTabs(); check(nav.parentNode === topEl, "على الحاسوب: التبويباتُ تنتقل إلى الترويسة");
attrs["data-device"] = "phone"; ctx.placeTabs(); check(nav.parentNode === dockEl, "وضع الهاتف: تعود إلى الشريط السفلي");
delete attrs["data-device"]; ctx.S.view = "setup"; ctx.placeTabs(); check(nav.parentNode === dockEl, "خارج الرئيسية: تبقى في الشريط السفلي");

/* ── ٣. المصدر ── */
check(/s&&s\.demo\?'<span class="term demo">[^']*<\/span><button type="button" class="devbtn" id="devsw"/.test(STUDENT_HOME_SCRIPT), "زرُّ التبديل يُرسم في الديمو وحدَه");
check(/aria-label="'\+\(deviceMode\(\)==="phone"\?"اعرض بشكل الحاسوب":"اعرض بشكل الهاتف"\)/.test(STUDENT_HOME_SCRIPT), "له اسمٌ يتبدّل بحسب الوجهة");
check(/document\.querySelectorAll\("nav\.tabs \[data-tab\]"\)/.test(STUDENT_HOME_SCRIPT) && !/dockEl\.querySelectorAll\("\[data-tab\]"\)\.forEach\(function\(b\)\{b\.setAttribute/.test(STUDENT_HOME_SCRIPT), "حالةُ التبويب المختار تُحدَّث حيث يكون التبويب (ترويسةً أو شريطاً)");
check(/appEl\.setAttribute\("data-view",S\.view\)/.test(STUDENT_HOME_SCRIPT) && /oldNav\.remove\(\)/.test(STUDENT_HOME_SCRIPT), "كلُّ رسمٍ يحدّد الشاشة، ويزيل تبويبَ الترويسة القديم");
check(/box\.hidden=n===0;if\(isWide\(\)\)box\.open=true/.test(STUDENT_HOME_SCRIPT), "«المزيد» مفتوحٌ دائماً على الحاسوب");
check(STUDENT_HOME_SCRIPT.includes('id="i-monitor"') === false && studentHomePage("n").includes('id="i-monitor"') && studentHomePage("n").includes('id="i-phone"'), "أيقونتا الحاسوب والهاتف في السبرايت");
check(!/onclick\s*=/.test(STUDENT_HOME_SCRIPT), "لا معالجَ سطرياً (تمنعه CSP)");

/* ── ٤. الوثيقة ── */
const doc = fs.readFileSync(path.join(process.cwd(), "docs/STUDENT_DOOR.md"), "utf8");
check(doc.includes("## الحاسوب") && doc.includes("masari-device") && doc.includes("## تفعيل مواعيد الطلبة"), "الوثيقة تشرح الحاسوب وأيقونة الديمو وتفعيل المواعيد");

console.log(`\n${passed} passed, 0 failed`);
