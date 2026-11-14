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
/* درجا القاعة والأستاذ انتقلا مع بطاقتيهما إلى التقارير: ✕ في رأس الدرج نفسه، لا لاصقاً وحده. */
const reportDrawers = read("src/components/ReportInsightDrawers.tsx");
check(!intel.includes('className="intel-drawer"') && (reportDrawers.match(/<header>[\s\S]{0,400}?onClick=\{onClose\} aria-label="إغلاق"/g) || []).length >= 2,
  "✕ درجي القاعة و«شكل الأسبوع» داخل رأس الدرج (التقارير)، ولا درجَ متبقٍّ في مركز الذكاء");
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
check(/@mediascreenand\(min-width:721px\)and\(max-width:1000px\)and\(min-height:520px\)and\(max-height:960px\)and\(orientation:landscape\)\{/.test(book)
  && /\.app-shell::before\{[^}]*left:var\(--book-page\);width:var\(--book-spine\)/.test(book),
  "الشاشة الداخلية كتابٌ مفتوح: كعبٌ بعرض --book-spine في المنتصف، وiPad (768×1024) خارج الكتلة");


/* خلفية النافذة في الكتاب تبقى بعرض الشاشة كلها فتحجب اللمس عن الفهرس (مراجعة #490): تُوضع النافذة
   على صفحة العمل بحشوة الخلفية، لا بتقليص الخلفية إلى نصف الشاشة وتعتيم الباقي بظلٍّ لا يحجب الضغط. */
const backdropRule = (book.match(/\[class\*="backdrop"\]:has\([^{]*\{[^}]*\}/) || [""])[0];
check(/padding-right:calc\(var\(--book-page\)\+var\(--book-spine\)/.test(backdropRule) && !/right:calc|box-shadow/.test(backdropRule.replace(/padding-right:calc/, "")),
  "خلفية النافذة على الكتاب بعرض الشاشة كلها تحجب الفهرس، والنافذة وحدها على صفحة العمل");
/* Duo ≠ iPad: الكتاب المفتوح للدوو وحده. iPad (عرضه الطولي ≥744 والعرضي ≥1024) يبقى على تخطيط اللوحي، فلا يقبل أيُّ استعلام
   «كتاب» (min-height:520px مع max-height:960px) إلا أفقياً بعرض 721–1000 وبـ screen؛ الطولي (669×867) هاتفٌ عاديّ بلا كعب.
   (نافذة Split View على iPad بعرض 640–720 لا تُميَّز عن الدوو بالمقاس؛ المفصل الحقيقي وحده يفرّق.) */
function cssFiles(dir: string): string[] {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? cssFiles(path.join(dir, e.name)) : e.name.endsWith(".css") ? [path.join(dir, e.name)] : []);
}
/* استعلاما مستطيل الودجت (الجولة 3): الكتاب الأفقي والطولي الداخلي، بلا display-mode. يُستثنيان من مسح «الكتاب»
   لأنهما حجزُ زاويةٍ لا تخطيطُ صفحتين؛ وتُفحصان بدقّةٍ في آخر الملف. */
const CUTOUT_BOOK_Q = "screenand(min-width:721px)and(max-width:1000px)and(min-height:520px)and(max-height:960px)and(orientation:landscape)";
const CUTOUT_PORTRAIT_Q = "screenand(min-width:640px)and(max-width:720px)and(min-height:520px)and(max-height:960px)and(orientation:portrait)";
const bookQueries: { file: string; q: string }[] = [];
for (const file of [...cssFiles("src"), ...cssFiles("public")]) {
  const css = flat(read(file));
  for (const m of css.matchAll(/@media([^{]*)\{/g)) {
    for (const q of m[1].split(",")) if (/min-height:520px/.test(q) && /max-height:960px/.test(q) && q !== CUTOUT_PORTRAIT_Q) bookQueries.push({ file, q });
  }
}
const badBook = bookQueries.filter(({ q }) => {
  const maxW = Number((q.match(/\(max-width:(\d+)px\)/) || [])[1]);
  const minW = Number((q.match(/\(min-width:(\d+)px\)/) || [])[1]);
  const landscape = /\(orientation:landscape\)/.test(q);
  const scoped = /^screenand/.test(q);
  /* الكتاب أفقيٌّ وحده: لا فرع طوليٌّ (640–720) ولا غياب لـ orientation:landscape. */
  const okWidth = landscape && maxW <= 1000 && minW >= 721;
  return !scoped || !okWidth;
});
check(bookQueries.length > 200 && badBook.length === 0,
  `Duo ≠ iPad: ${bookQueries.length} استعلام كتابٍ كلُّها screen، وكلُّها أفقيةٌ 721–1000 (لا فرع طوليّ)${badBook.length ? " — " + badBook.slice(0, 3).map((b) => b.file + " " + b.q).join(" · ") : ""}`);
check(!/@media[^{]*\(min-width:640px\)and\(max-width:1000px\)and\(min-height:520px\)(?!and\(orientation)/.test(flat(read("src/styles/55-duo-adaptive.css"))),
  "كتلة الكتاب في 55-duo-adaptive.css لا تقبل طولياً بعرض 721–1000 (768×920 على iPad)");

/* 5) الدوو المطويّ (≈367px): عمودٌ ضمنيّ `1fr`/`auto` يتّسع لأعرض أبنائه فيقصّ إطارُ البطاقة نصفَ المحتوى. */
const seatsCss = flat(read("src/components/seats/seats.css"));
check(/\.seats-layout\{grid-template-columns:minmax\(0,1fr\)\}/.test(seatsCss) && /\.seats-list\{[^}]*grid-template-columns:minmax\(0,1fr\)/.test(seatsCss)
  && /\.seats-filters\{[^}]*grid-template-columns:minmax\(0,1fr\)/.test(seatsCss),
  "الفرق: قائمةُ الفرق وشريطُ تصنيفها عمودٌ minmax(0,1fr) فلا يُقصّ البحثُ ولا آخرُ لسان");
check(/\.seats-stats>\*\{flex:11calc\(50%-4px\);min-inline-size:0\}/.test(seatsCss),
  "الفرق: بطاقات الإحصاء مثنى مثنى بـflex-basis (min-inline-size:44px!important على الأزرار كان يُسقط نصف العرض)");
const screens = flat(read("src/styles/04-screens.css"));
check(/\.admin-head-plan\{[^}]*grid-template-columns:minmax\(0,1fr\)/.test(screens) && /\.admin-head-planthead\{display:none;?\}/.test(screens),
  "معاينة حسابات الأقسام: بطاقةٌ لكل صفٍّ على الهاتف لا جدولُ خمسة أعمدة");
check((read("src/components/AdminUsers.tsx").match(/<td[^>]*data-label="(القسم|الكلية|حساب القسم|اسم الدخول المقترح|الحالة)"/g) || []).length === 5,
  "معاينة حسابات الأقسام: لكل خليةٍ تسميتها (data-label) لتظهر فوق قيمتها");
check(/\.console-action-slot\{width:100%;flex-wrap:wrap/.test(flat(read("src/styles/07-responsive.css"))),
  "أزرار رأس الكونسول تلتفّ على الهاتف بدل أن تُحشر في سطرٍ فيُقصّ نصُّها");
const deadlines = flat(read("src/styles/12-deadlines.css"));
check(/\.sd-panel\{[^}]*display:grid;grid-template-columns:minmax\(0,1fr\)/.test(deadlines) && /\.travel-policy\{grid-template-columns:minmax\(0,1fr\)\}/.test(deadlines)
  && /\.travel-policy-exempt\{[^}]*grid-template-columns:minmax\(0,1fr\)/.test(deadlines),
  "مواعيد التسليم وسياسة التنقل: أعمدةٌ minmax(0,1fr) فلا يبرز المحتوى عن حافة البطاقة");
check(/\.srec-form,\.srec-result\{[^}]*grid-template-columns:minmax\(0,1fr\)/.test(flat(read("src/components/student-recovery.css"))),
  "رمز استعادة الطالب: النموذجُ عمودٌ minmax(0,1fr)");
check(/\.lens-groupsstrong\.report-instructor-with-badge\{display:flex!important/.test(flat(read("src/styles/07-responsive.css"))),
  "أسماء الأساتذة في التقارير: الاسمُ يُقطع والشارةُ (منتدب) تبقى مرئية");

/* الكتاب أفقيٌّ فقط (الجولة 2): لا استعلام يطبّق تخطيط الصفحتين على الطولي. الفرع الطوليّ 640–720 الوحيد المسموح هو مستطيل
   الودجت في 55-duo-adaptive.css، وهو حجزُ زاويةٍ لا تخطيطُ كتاب. */
const portraitBook: string[] = [];
for (const file of [...cssFiles("src"), ...cssFiles("public")]) {
  for (const m of flat(read(file)).matchAll(/@media([^{]*)\{/g)) {
    for (const q of m[1].split(",")) {
      if (/min-width:640px\)and\(max-width:720px\)and\(min-height:520px/.test(q) && !(q === CUTOUT_PORTRAIT_Q && file.endsWith("55-duo-adaptive.css"))) portraitBook.push(file + " " + q);
    }
  }
}
check(portraitBook.length === 0,
  `لا فرع طوليٌّ 640–720 لتخطيط الكتاب في أيّ ملف CSS${portraitBook.length ? " — " + portraitBook.slice(0, 3).join(" · ") : ""}`);
/* مستطيل الودجت: يُقيَّم بالاستعلامات الحقيقية المقروءة من الملف (لا نسخةً مكتوبة هنا) على مقاساتٍ مسمّاة. */
const cutoutBlocks = [...read("src/styles/55-duo-adaptive.css").replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/@media([^{]*)\{\s*:root\s*\{[^}]*--duo-cutout-w/g)];
const cutoutQueries = cutoutBlocks.flatMap((m) => m[1].split(",").map((q) => q.replace(/\s+/g, "")));
check(cutoutBlocks.length === 1 && cutoutQueries.length === 2 && cutoutQueries.includes(CUTOUT_BOOK_Q) && cutoutQueries.includes(CUTOUT_PORTRAIT_Q),
  "مستطيل الودجت 116×116 معرَّفٌ مرةً واحدة، باستعلامين فقط: كتابٌ أفقي 721–1000×520–960 وطوليٌّ داخلي 640–720×520–960");
check(/--duo-cutout-w:116px;--duo-cutout-h:116px/.test(book), "قيمة المستطيل 116×116");
check(!/display-mode/.test(book),
  "لا display-mode في 55-duo-adaptive.css: مستطيل الودجت يسري في تبويب المتصفح والتطبيق المثبَّت معاً");
function matches(q: string, w: number, h: number): boolean {
  if (!/^screenand/.test(q)) return false;
  const num = (re: RegExp) => { const m = q.match(re); return m ? Number(m[1]) : null; };
  const [minW, maxW, minH, maxH] = [num(/\(min-width:(\d+)px\)/), num(/\(max-width:(\d+)px\)/), num(/\(min-height:(\d+)px\)/), num(/\(max-height:(\d+)px\)/)];
  const orient = q.match(/\(orientation:(landscape|portrait)\)/)?.[1];
  return (minW === null || w >= minW) && (maxW === null || w <= maxW) && (minH === null || h >= minH) && (maxH === null || h <= maxH)
    && (!orient || orient === (w > h ? "landscape" : "portrait"));
}
const hit = (w: number, h: number) => cutoutQueries.some((q) => matches(q, w, h));
const DUO_IN: [number, number][] = [[951, 669], [951, 585], [669, 867], [720, 900], [660, 800], [700, 900], [880, 585], [1000, 600], [721, 520]];
const NOT_DUO: [number, number][] = [[390, 844], [844, 390], [932, 430], [430, 932], [744, 1024], [820, 1180], [1024, 768], [1180, 820], [1280, 800], [1440, 900],
  [367, 740], [951, 350], [768, 1024], [1024, 690], [1133, 660], [810, 1080]];
check(DUO_IN.every(([w, h]) => hit(w, h)), `مستطيل الودجت ينطبق على الدوو الداخلي: ${DUO_IN.map((s) => s.join("×")).join("، ")}`);
const wrongly = NOT_DUO.filter(([w, h]) => hit(w, h));
check(wrongly.length === 0,
  `مستطيل الودجت لا ينطبق على iPhone/iPad/سطح المكتب/المطويّ الخارجي/951×350${wrongly.length ? " — يطابق: " + wrongly.map((s) => s.join("×")).join("، ") : ""}`);
check(/\.mobile-topbar\{[^}]*padding-right:calc\(var\(--duo-cutout-w\)\+8px\)/.test(book) && /\.sidebar-brand\{[^}]*padding-right:calc\(var\(--duo-cutout-w\)/.test(book),
  "الشريط العلوي ورأس الفهرس يبتعدان عن مستطيل الودجت بحشوةٍ يمنى فعلية");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
