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
const duo = flat(read("src/styles/47-duo-open-workspace.css"));
const studio = flat(read("src/styles/40-appointment-studio.css"));
const publish = read("src/components/SchedulePublish.tsx");

check(/@import"\.\/styles\/46-mobile-overflow\.css";/.test(flat(index)), "ملفُّ الحارس مستورَدٌ في index.css");
check(/@import"\.\/styles\/47-duo-open-workspace\.css";/.test(flat(index)), "تخطيط Duo المفتوح مستوردٌ بعد قواعد الاستجابة العامة");
check(/@mediascreenand\(horizontal-viewport-segments:2\)and\(min-width:800px\)\{/.test(duo), "تخطيطٌ مستقلٌّ لوضعيّة الشاشتين المفتوحة فقط");
check(/\.sidebar\{[^}]*left:env\(viewport-segment-left10\)[^}]*right:calc\(100vw-env\(viewport-segment-right10\)\)/.test(duo)
  && /\.app-main\{[^}]*margin-inline-start:calc\(100vw-env\(viewport-segment-right00\)\)!important/.test(duo),
  "التنقل في الشاشة اليمنى ومساحة العمل في الشاشة اليسرى وفق حدود المفصلة");
check(/\.notify-bell\{[^}]*viewport-segment-left00/.test(duo) && /\.notify-panel\{[^}]*viewport-segment-width00/.test(duo),
  "الجرس ولوحة التنبيهات داخل مساحة العمل اليسرى");
check(!/\.schedule-editor-grid\.appt-layout\.has-week:has\(>\.editor-side\)\{grid-template-columns:minmax\(0,1fr\)/.test(duo)
  && /@media\(min-width:640px\)and\(max-width:1100px\)\{[^}]*\.schedule-editor-grid\.appt-layout\.has-week:has\(>\.editor-side\)\{grid-template-columns:minmax\(0,1fr\)clamp\(272px,41vw,380px\)/.test(studio),
  "موعد Duo المفتوح (640–1100) يحتفظ بعمود الأستاذ يسار الأسئلة كسطح المكتب، بالعرض وحده");
/* الميزة المعاينة (viewport-segments) مغلقة افتراضياً في Safari: لا يُبنى عليها تخطيطُ الموعد الأساسي. */
check(!/horizontal-viewport-segments[^{]*\{[^}]*\.appt-layout/.test(studio),
  "تخطيط الموعد الأساسي لا يعتمد على ميزة viewport-segments المعاينة");
const miniWeek = read("src/components/TeacherMiniWeek.tsx");
check(/useMedia\("\(max-width: 639px\)", variant === "side"\)/.test(miniWeek) && !/useMedia\("\(max-width: 1100px\)/.test(miniWeek),
  "أسبوع الأستاذ شريطٌ سفلي على الهاتف (<640) فقط، وعمودٌ جانبي من 640 فما فوق");
check(/@media\(max-width:639px\)\{\.appt-week-ghost\{display:none\}\}/.test(studio),
  "الإطار الشبحي يملأ عمود الأسبوع من 640 ويغيب عن الهاتف");
check(/@media\(min-width:640px\)and\(max-width:1100px\)\{[\s\S]*?\.appt-layout\.has-week:has\(>\.editor-side:empty\)\{grid-template-columns:minmax\(0,1fr\)\}/.test(studio),
  "حين تطفو نافذة الأسبوع (640–1100) يُطوى عمودها الفارغ ويعود للأسئلة عرضها كاملاً");

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

/* 3د) «الأثر»: اسمُ الفصل الطويل لا يوسّع رأسَ الورقة على 360 ولا يمرّ تحت ✕. */
const trailCss = flat(read("src/components/trail/trail.css"));
check(/\.trail-head>div\{[^}]*grid-template-columns:minmax\(0,1fr\)/.test(trailCss) && /\.trail-head>\.drawer-close\{position:static;flex:none/.test(trailCss),
  "رأسُ «الأثر»: عمودُ النص ينكمش، و✕ في مكانه");
check(/\.trail-day,\.trail-day>ol,\.trail-item,\.trail-item>button,\.trail-text\{min-inline-size:0/.test(trailCss),
  "وصفوفُ «الأثر» الطويلة لا توسّع الورقة (كانت 385 في عرض 360)");

/* 3هـ) آلة الزمن: أزرار الأمثلة الطويلة تلتفّ داخل البطاقة بدل أن تتجاوز العرض (كانت -66..353 على 382)، ومفتاح النصاب يحصل على منطقة لمس ≥44px. */
const timeMachineCss = flat(read("src/styles/33-time-machine.css"));
check(/\.tm-examplesbutton\{max-inline-size:100%;white-space:normal/.test(timeMachineCss), "أزرارُ أمثلة آلة الزمن تلتفّ ولا تتجاوز عرضَ الشاشة");
check(/\.tm-ask\{grid-template-columns:minmax\(0,1fr\)auto\}/.test(timeMachineCss) && /\.tm-askinput\{min-inline-size:0;inline-size:100%/.test(timeMachineCss), "حقلُ «ماذا حدث؟» في آلة الزمن لا يوسّع صفّه (WebKit: كان -79..291 على 320)");
const teachingLoadCss = flat(read("src/styles/29-teaching-load.css"));
check(/\.tl-toggle::after\{content:"";position:absolute;inset:-9px-4px\}/.test(teachingLoadCss), "مفتاحُ النصاب التدريسي: منطقةُ لمس ≥44px بلا تغيير الرسم");

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

/* شبكة «القاعات × الأوقات» على الدوو المفتوح (تسجيل من الجهاز، 2026-11-14): خلايا .sr-only (position:absolute)
   تُحسب من الصفحة إن لم يكن إطارُ التمرير نفسه كتلةً حاوية، فتبرز خارج قصّه وتوسّع الوثيقة فيصغّر iOS الصفحة. */
const intelCss = flat(read("src/styles/06-intelligence.css"));
check(/\.matrix-scroll,\.table-scroll,[^{]*\{position:relative\}/.test(intelCss),
  "إطاراتُ التمرير الأفقي (ومنها .matrix-scroll) كتلٌ حاوية: لا يبرز منها عنصرٌ مطلق فيوسّع الوثيقة");
/* الكتاب المفتوح على الشاشة الداخلية: صفحتان حول كعبٍ في المنتصف، ولا يمسّ iPad. */
const book = flat(read("src/styles/55-duo-adaptive.css"));
check(/@mediascreenand\(min-width:640px\)and\(max-width:1000px\)and\(min-height:520px\)and\(max-height:960px\)\{/.test(book)
  && /\.app-shell::before\{[^}]*left:var\(--book-page\);width:var\(--book-spine\)/.test(book),
  "الشاشة الداخلية كتابٌ مفتوح: كعبٌ بعرض --book-spine في المنتصف، وiPad (768×1024) خارج الكتلة");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
