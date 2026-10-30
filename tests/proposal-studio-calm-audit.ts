/**
 * ── مساحة «إعداد مقترح دراسي» أهدأ — ولم تُلغَ ميزة ─────────────────────────
 *
 * قال المالك: بمستوى «موعد جديد»، هادئة، أيقوناتٌ وكلامٌ قليل — والقيدُ المطلق:
 * «لا تُلغَ أي ميزة إطلاقاً». فهذا الحارس يثبّت الأمرين معاً:
 *
 * ١) العدد والمعدود في بطاقات الرأس: لا وحدةَ ثابتة («5 يوم»)، فالمعدودُ يتبع الرقم
 *    المعروض فعلاً عبر nounFor (بعدُ إن وُجد وإلا قبل)، والكسرُ بالمفرد («7.5 ساعة»).
 * ٢) «شاغرة» رقمٌ واحد: زرُّ الجدول وتبويبُ الجانب ورأسُ اللوحة يقرؤون vacancyTally
 *    نفسه (الجاهزة + التي للمراجعة)، ومعه تفصيلٌ «1 جاهزة · 1 للمراجعة».
 * ٣) أعلى المساحة أهدأ: «ما تغيّر» سطرٌ واحد بلا أصفار («لا تغييرات بعد» حين لا شيء)،
 *    ودليلُ الألوان خلف زرّ «الألوان» يفتح لوحةً صغيرة يغلقها Escape وحدها.
 * ٤) لم تُلغَ ميزة: التبويبات، وأزرارُ الإضافة والحفظ والإرسال والتثبيت والسحب، والرجوع
 *    والإغلاق، وطلباتُ الشخص نفسه، وشارةُ المنتدب، والحالةُ والنسخة، والبطاقاتُ كلُّها.
 */
import fs from "node:fs";
import { AR, nounFor } from "../src/utils/arabicCount";
import { vacancyBreakdown, vacancyTally } from "../src/components/proposal/proposalFormat";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); }
};
const read = (file: string) => fs.readFileSync(file, "utf8");
const header = read("src/components/proposal/ProposalHeader.tsx");
const grid = read("src/components/proposal/ProposalWeekGrid.tsx");
const workspace = read("src/components/proposal/StudyProposalWorkspace.tsx");
const vacancies = read("src/components/proposal/ProposalVacancies.tsx");
const diff = read("src/components/proposal/ProposalDiff.tsx");
const ops = read("src/components/proposal/ProposalOps.tsx");
const checks = read("src/components/proposal/ProposalChecks.tsx");
const css = read("src/styles/14-proposal.css");

/* ═══ ١) العدد والمعدود في بطاقات الرأس ═════════════════════════════════════ */
check(!/\bunit="(يوم|ساعة|دقيقة)"/.test(header) && !/deltaUnit=/.test(header), "لا وحدةَ ثابتة في بطاقات الرأس (لا unit=\"يوم\" ولا deltaUnit)");
check(/const shownValue = afterValue \?\? beforeValue;/.test(header) && /nounFor\(shownValue, noun\)/.test(header),
  "المعدودُ يتبع الرقم المعروض فعلاً: «بعد» إن وُجد وإلا «قبل»، عبر nounFor");
check(/label="أيام الحضور"[^>]*noun=\{AR\.day\}/.test(header) && /label="النصاب"[^>]*noun=\{AR\.hour\}/.test(header) && /label="ساعات الحضور"[^>]*noun=\{AR\.hour\}/.test(header),
  "أيامُ الحضور بـAR.day، والنصابُ وساعاتُ الحضور بـAR.hour");
check(nounFor(5, AR.day) === "أيام" && nounFor(1, AR.day) === "يوم" && nounFor(11, AR.day) === "يوماً", "«5 أيام» و«1 يوم» و«11 يوماً» — لا «5 يوم»");
check(nounFor(7.5, AR.hour) === "ساعة" && nounFor(5, AR.hour) === "ساعات" && nounFor(17, AR.hour) === "ساعة", "الكسرُ بالمفرد «7.5 ساعة»، و«5 ساعات»، و«17 ساعة»");
check(/deltaText=\{gapDelta \? minutesCompact\(Math\.abs\(gapDelta\)\) : undefined\}/.test(header), "فرقُ الفراغات مدّةٌ مقروءة («2 س 50 د») لا رقمٌ مجرّد بلا وحدة");
check(/format=\{minutesCompact\}/.test(vacancies) && !/unit="د"/.test(vacancies), "أثرُ الشاغرة على الفراغات مدّةٌ مقروءة أيضاً لا «210 د»");
check(/countOf\(alt\.reviews, AR\.note\)/.test(checks), "البديلُ يعدّ ملاحظاته بالمعدود: «ملاحظة واحدة للمراجعة»");

/* ═══ ٢) «شاغرة» رقمٌ واحد ═════════════════════════════════════════════════ */
{
  const rows = [{ fit: "ready" }, { fit: "review" }, { fit: "used" }, { fit: "clash" }, { fit: "checking" }, { fit: "blocked" }];
  const t = vacancyTally(rows);
  check(t.open === 2 && t.ready === 1 && t.review === 1 && t.used === 1 && t.checking === 1 && t.other === 2 && t.total === 6,
    "العدّاد: ما يُسند الآن = الجاهزة + التي للمراجعة", t);
  check(vacancyBreakdown(t) === "1 جاهزة · 1 للمراجعة", "التفصيل «1 جاهزة · 1 للمراجعة»", vacancyBreakdown(t));
  check(vacancyBreakdown({ ready: 2, review: 0 }) === "2 جاهزة" && vacancyBreakdown({ ready: 0, review: 0 }) === "", "الأصفارُ لا تُكتب في التفصيل");
}
check(/vacancyTally\(props\.vacancies \|\| \[\]\)/.test(grid) && /vacancyCount\.open \? <span className="sp-count"/.test(grid), "زرُّ «شاغرة» على الجدول يقرأ العدّاد الواحد");
check(/const vacancyCount = vacancyTally\(vacancies\);/.test(workspace) && /tabButton\("vacant", "شاغرة", UserRoundPlus, vacancyCount\.open \?/.test(workspace),
  "وتبويبُ «شاغرة» يقرأ العدّاد نفسه");
check(!/filter\(v => v\.fit === "ready"\)\.length/.test(workspace) && !/filter\(v => v\.fit === "ready" \|\| v\.fit === "review"\)\.length/.test(grid),
  "لا عدَّ ثانياً بطريقةٍ أخرى في المكانين");
check(/const tally = vacancyTally\(rows\);/.test(vacancies) && /className="sp-vac-meter"/.test(vacancies), "رأسُ لوحة الشواغر يقرأ العدّاد نفسه، ويرسمه شريطاً مقسوماً");

/* ═══ ٣) أعلى المساحة أهدأ ═════════════════════════════════════════════════ */
check(/\.filter\(entry => entry\.n > 0\)/.test(diff) && /لا تغييرات بعد/.test(diff) && !/data-zero/.test(diff), "«ما تغيّر» سطرٌ واحد: الأصفار لا تُرسم، و«لا تغييرات بعد» حين لا شيء");
check(/className="sp-diff-chip"[^]*aria-pressed=\{on\}/.test(diff) && /ws\.setFocusChange\(on \? null : kind\)/.test(diff), "وكلُّ صنفٍ ظاهرٍ ما زال يُبرز مواعيده على الجدول");
check(/function ColorLegend/.test(grid) && /const legend = <ColorLegend vacant=\{showVac\} \/>;/.test(grid), "دليلُ الألوان خلف زرٍّ صغير بدل ستِّ شرائح دائمة");
check(/className="sp-legend-btn" aria-expanded=\{open\}/.test(grid) && /<span>الألوان<\/span>/.test(grid), "الزرُّ «الألوان» يعلن حالته (aria-expanded)");
check(/className="sp-legend-pop" role="dialog" aria-modal="false"/.test(grid), "اللوحةُ نافذةٌ غير حاجبة تعلن aria-modal (قاعدة الجرس)");
check(/window\.addEventListener\("keydown", onKey, true\)/.test(grid) && /event\.stopImmediatePropagation\(\);/.test(grid),
  "Escape يغلق الدليل وحده قبل أن يصل مستمعَ المساحة");
check(["current", "added", "moved", "replaced", "out", "conflict", "review"].every(kind => new RegExp(`kind: "${kind}"`).test(grid)) && /kind: "vacant", label: "شاغرة"/.test(grid),
  "الدليلُ يشرح كلَّ حالةٍ تُرى على الجدول (ومعها «بديل» و«للمراجعة»)");
check(!/@container spweek \(max-width:900px\)\{\.sp-legend\{display:none\}\}/.test(css) && !/\.sp-legend\{display:none\}/.test(css), "الدليلُ لم يعد يختفي على الشاشات الضيّقة — صار في متناول الهاتف أيضاً");
check(/@media \(min-width:1240px\)\{\s*\.sp-root \.sp-head\{grid-template-columns:auto minmax\(200px,1fr\) auto auto auto;grid-template-areas:"back id tiles status close"/.test(css),
  "على الشاشة العريضة: الهويةُ والبطاقاتُ والحالة في سطرٍ واحد");
check(/@media \(prefers-reduced-motion:reduce\)\{[^}]*\{[^}]*\}[^]*?\.sp-legend-pop,\.sp-vac-meter i\{animation:none\}/.test(css), "الحركاتُ الجديدة تحترم prefers-reduced-motion");
check(/useState\(\(\) => status !== "empty" && status !== "closed" && status !== "checking"\)/.test(checks), "تبويبُ «الفحص» يُفتح مقروءاً إن كان فيه حكم");

/* ═══ ٤) لم تُلغَ ميزة ═════════════════════════════════════════════════════ */
for (const [name, ok] of [
  ["تبويب الجدول (الشاشات الضيّقة)", /tabButton\("grid", "الجدول", Table2\)/.test(workspace)],
  ["تبويب التغييرات", /tabButton\("ops", "التغييرات"/.test(workspace)],
  ["تبويب شاغرة", /tabButton\("vacant", "شاغرة"/.test(workspace)],
  ["تبويب الفحص", /tabButton\("checks", "الفحص"/.test(workspace)],
  ["«شعبة جديدة»", /data-guide-target="proposal-add"><Plus aria-hidden="true" \/><span>شعبة جديدة<\/span>/.test(workspace)],
  ["«إسناد شعبة»", /onClick=\{openAssign\}[^>]*><UserRoundPlus aria-hidden="true" \/><span>إسناد شعبة<\/span>/.test(workspace)],
  ["«أسند» على الجدول وفي اللوحة", /<span>أسند<\/span>/.test(grid) && /<span>أسند<\/span>/.test(vacancies)],
  ["«حفظ المسودة»", /data-guide-target="proposal-save"/.test(workspace) && /حفظ المسودة/.test(workspace)],
  ["«معاينة وإرسال»", /data-guide-target="proposal-preview"/.test(workspace) && /"معاينة وإرسال"/.test(workspace)],
  ["«مراجعة وتثبيت»", /data-guide-target="proposal-commit-open"/.test(workspace)],
  ["«سحب المقترح»", /setDialog\("withdraw"\)/.test(workspace)],
  ["الحوارات (إرسال · تثبيت · إغلاق · انتقال · سحب)", ["SendDialog ws", "CommitDialog ws", 'dialog === "close"', 'dialog === "switch"', 'dialog === "withdraw"'].every(token => workspace.includes(token))],
  ["الرجوع والإغلاق", /className="sp-back"/.test(header) && /className="sp-close"/.test(header)],
  ["طلبات الشخص نفسه", /className="sp-person-requests"/.test(header) && /entry\.campus/.test(header)],
  /* الشارات الموحّدة (#326): «منتدب» و«🎓 تدريب» معاً في PersonChips. */
  ["شارة المنتدب", /<PersonChips visiting=\{visiting\}/.test(header)],
  ["حالة المسودة والنسخة", /className="sp-status" data-status=\{status\}/.test(header) && /النسخة \{num\(proposal\.version\)\}/.test(header)],
  ["حالة الحفظ في الشريط", /className="sp-bar-status"/.test(workspace)],
  ["ردود الأستاذ وسجلّ المقترح", /<ProposalResponses ws=\{ws\} \/>/.test(workspace)],
  ["النموذج الكامل", /<ProposalOpForm ws=\{ws\}/.test(workspace)],
] as Array<[string, boolean]>) check(ok, `باقٍ: ${name}`);
for (const label of ["النصاب", "عدد الشعب", "أيام الحضور", "ساعات الحضور", "الفراغات بين المحاضرات", "التعارضات المانعة", "ملاحظات للمراجعة"]) {
  check(header.includes(label), `باقٍ في الرأس: «${label}»`);
}
check(/className="sp-empty-actions"/.test(ops) && /<b>لا تغييرات بعد\.<\/b>/.test(ops), "الحالةُ الفارغة رسمٌ بخطواته الثلاث وزرّاها، ونصُّها القديم باقٍ");

console.log(`\nproposal-studio-calm audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
