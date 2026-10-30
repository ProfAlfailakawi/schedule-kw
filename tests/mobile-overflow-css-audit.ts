/**
 * ── لا شيءَ يخرج عن عرض الهاتف ─────────────────────────────────────────────
 *
 * حارسٌ خفيف (بلا متصفح) لقواعد CSS التي أصلحت خروجَ المحتوى عن عرض iPhone:
 *
 *  1) حقولُ التاريخ والساعة على iOS: Safari يرسمها بمظهره الأصلي ويفرض لها
 *     `box-sizing:content-box` وحدّاً أدنى من عنده، فيبرز الحقلُ عن خانته
 *     (حقل «الساعة · الكويت» في النشر). العلاج إسقاطُ المظهر على iOS وحده.
 *  2) شبكةٌ بعمودٍ ضمنيّ `auto` تتّسع لأعرض أبنائها فتقصّ إخوتَه — خطواتُ النشر
 *     صارت عموداً `minmax(0,1fr)`.
 *  3) زرُّ ✕ في ورقة النشر كان يطفو فوق بطاقات المقررات عند التمرير؛ صار في
 *     شريطٍ ثابت يصير معتماً إذا مُرِّرت الورقة.
 *  4) `repeat(auto-fit|auto-fill, minmax(Npx,1fr))` بحدٍّ أدنى ثابتٍ كبير يخرج
 *     عن الهاتف حين تضيق الحاوية عنه؛ فالحدُّ الأدنى من 160px فأكثر يُكتب
 *     `minmax(min(Npx,100%),1fr)` — مطابقٌ على الحاسوب، ولا يخرج على الهاتف.
 *
 * والفحصُ الحيّ في `scripts/mobile-overflow-sweep.ts` (Playwright، كلُّ الشاشات والصفات).
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
const flat = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, "");

const index = read("src/index.css");
const guard = flat(read("src/styles/46-mobile-overflow.css"));
const publish = read("src/components/SchedulePublish.tsx");

check(/@import"\.\/styles\/46-mobile-overflow\.css";/.test(flat(index)), "ملفُّ الحارس مستورَدٌ في index.css");

/* 1) iOS: حقولُ التاريخ والساعة تطيع العرض. */
const ios = guard.match(/@supports\(-webkit-touch-callout:none\)\{([\s\S]*?\})\}/)?.[1] || "";
check(/input\[type=date\]/.test(ios) && /input\[type=time\]/.test(ios), "قاعدةُ iOS تشمل حقلَي التاريخ والساعة");
check(/-webkit-appearance:none/.test(ios) && /appearance:none/.test(ios), "وتُسقط مظهرَهما الأصلي (هو مصدرُ content-box والحدّ الأدنى)");
check(/box-sizing:border-box/.test(ios) && /min-inline-size:0/.test(ios), "وتعيدهما border-box بلا حدٍّ أدنى");
check(/direction:ltr/.test(ios), "وقيمتُهما تُقرأ صحيحة («31 Oct 2026» لا «Oct 2026 31»، «11:59 PM» لا «PM 11:59»)");
check(/\{kind === "staff" \? <span>التاريخ<\/span>/.test(publish), "حقلُ التاريخ بجانب «الساعة» له عنوانٌ ظاهر");
check(/\.share-closesinput,[^{]*\{[^}]*box-sizing:border-box[^}]*inline-size:100%[^}]*min-inline-size:0/.test(guard),
  "حقولُ موعد النشر: border-box وعرضُ الخانة وبلا حدٍّ أدنى — في كل محرّك");

/* 2) خطواتُ النشر عمودٌ لا يتّسع بأبنائه. */
check(/\.share-step\{grid-template-columns:minmax\(0,1fr\)\}/.test(guard), "خطوةُ النشر عمودٌ minmax(0,1fr)");
check(/\.share-step>\*,\.share-compose>\*,\.share-deadline-fields>\*\{min-inline-size:0/.test(guard), "وأبناؤها ينكمشون (min-inline-size:0)");

/* 3) ✕ في شريطٍ ثابت لا يطفو فوق المحتوى. */
check(/<div className="share-topbar">[\s\S]{0,400}className="share-close"/.test(publish), "✕ ورقة النشر داخل شريطِ الرأس");
check(/data-scrolled=\{sheetScrolled/.test(publish) && /onScroll=\{event =>/.test(publish), "والورقةُ تعلن أنها مُمرَّرة");
check(/\.share-topbar\{position:sticky;top:0;/.test(guard), "الشريطُ لاصقٌ بأعلى الورقة");
check(/\.share-sheet\[data-scrolled\]\.share-topbar\{background:var\(--surface\)/.test(guard), "ويصير معتماً إذا مُرِّرت فيمرّ المحتوى تحته");
check(/\.share-topbar>\.share-close\{[^}]*position:static!important/.test(guard), "والزرُّ نفسه لم يعد لاصقاً وحده");
check(/\.share-sheet\.visual-minimal\{[^}]*padding-block-start:0/.test(guard),
  "ولا حشوةَ عليا للورقة (Safari يلصق داخل الحشوة فيترك شقّاً فوق الشريط)");

/* 3ب) درجُ مركز الذكاء: ✕ في شريط الرأس المعتم (.context-actions) لا لاصقاً وحده. */
const intel = read("src/components/IntelligenceWorkspace.tsx");
check(/<aside className="intel-drawer"[^>]*>\s*\{\/\*[^]*?\*\/\}\s*<div className="context-actions intel-drawer-bar">\s*<button\s+className="drawer-close"/.test(intel),
  "✕ درج مركز الذكاء داخل شريط الرأس المعتم");
check(/\.intel-drawer-bar\.drawer-close\{margin-inline-start:auto\}/.test(guard), "وفي طرفه");

/* 3ج) صفحة مقترح الدراسة (تُفتح على الهاتف خارج التطبيق): حقلُ الساعة على iOS. */
const study = read("src/server/studyProposalPage.ts");
check(/@supports\(-webkit-touch-callout:none\)\{input\[type=time\]\{-webkit-appearance:none;appearance:none;box-sizing:border-box;min-width:0\}\}/.test(study),
  "صفحةُ مقترح الدراسة: حقلُ الساعة على iOS لا يبرز عن خانته");

/* 4) لا حدَّ أدنى ثابتاً كبيراً في شبكات auto-fit/auto-fill. */
const sources: string[] = [];
const walk = (dir: string) => { for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) { const rel = path.join(dir, entry.name); if (entry.isDirectory()) walk(rel); else if (/\.css$/.test(entry.name) || rel === path.join("src", "components", "AcademicAdvicePanel.tsx") || rel === path.join("src", "server", "roomDoorPage.ts")) sources.push(rel); } };
walk("src");
const offenders: string[] = [];
for (const file of sources) {
  const text = read(file);
  for (const match of text.matchAll(/repeat\(\s*(?:auto-fit|auto-fill)\s*,\s*minmax\(\s*(\d+)px/g)) {
    if (Number(match[1]) >= 160) offenders.push(`${file}: ${match[0]}`);
  }
}
check(offenders.length === 0, `شبكاتُ auto-fit/auto-fill بحدٍّ أدنى ≥160px مكتوبةٌ min(Npx,100%)${offenders.length ? " — " + offenders.slice(0, 5).join(" · ") : ""}`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
