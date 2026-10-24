/**
 * سهولة «مساري»: دوالُّ الصفحة النقية تُشغَّل في vm (بلا متصفح) —
 * تعليمُ المستوى، وحلُّ التعارض بلمسة، واختيارُ البطاقة الرئيسية بحسب المرحلة.
 */
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { STUDENT_HOME_SCRIPT, STUDENT_HOME_CSS } from "../src/server/studentHomePage";

let passed = 0;
const check = (ok: boolean, label: string) => { assert.ok(ok, label); passed++; console.log("✓ " + label); };

const fn = (name: string, next: string) => {
  const begin = STUDENT_HOME_SCRIPT.indexOf("function " + name + "(");
  const end = STUDENT_HOME_SCRIPT.indexOf("function " + next + "(", begin + 1);
  assert.ok(begin >= 0 && end > begin, "تستخرج دالة " + name);
  return STUDENT_HOME_SCRIPT.slice(begin, end);
};
const ctx: Record<string, any> = { S: { state: { phase: { mode: "wishes" } } } };
runInNewContext([
  fn("lvOf", "setupPassed"),
  fn("clash", "tkColor"), fn("tkOptions", "tkUnits"), fn("tkFix", "tkPoolSheet"),
  fn("primaryOrder", "laterPlace"),
  "this.lvOf=lvOf;this.tkFix=tkFix;this.primaryOrder=primaryOrder;",
].join("\n"), ctx);

/* المستوى من الرمز */
check(ctx.lvOf({ code: "ISL101" }) === 100 && ctx.lvOf({ code: "ARB 302" }) === 300 && ctx.lvOf({ code: "GEN" }) === 0 && ctx.lvOf({ code: "MTH 210" }) === 200, "المستوى يُقرأ من رقم الرمز، وما لا رقمَ له عامّ");

/* حلُّ التعارض: شعبةٌ بديلةٌ واحدة تُخلي المقرر الجديد */
const slot = (day: number, start: number, end: number) => ({ day, start, end });
const itemA = { courseId: 1, name: "أ", offeringId: "a1", section: "01", slots: [slot(0, 600, 690)], alternatives: [{ offeringId: "a2", section: "02", slots: [slot(1, 600, 690)], tight: false }] };
const itemB = { courseId: 2, name: "ب", offeringId: "b1", section: "01", slots: [slot(2, 600, 690)], alternatives: [] };
const newOnly = { courseId: 9, offerings: [{ offeringId: "n1", section: "01", slots: [slot(0, 630, 720)] }] };
const fix = ctx.tkFix([itemA, itemB], newOnly);
check(fix && fix.x.courseId === 1 && fix.alt.offeringId === "a2" && fix.o.offeringId === "n1", "تعارضٌ مع مقررٍ واحدٍ يُحلّ بتبديل شعبته إلى بديلٍ خالٍ");
check(ctx.tkFix([itemB, { ...itemA, alternatives: [] }], newOnly) === null, "لا بديلَ لشعبة المتعارض: لا اقتراح");
const twoClash = { courseId: 9, offerings: [{ offeringId: "n2", section: "01", slots: [slot(0, 630, 720), slot(2, 630, 720)] }] };
check(ctx.tkFix([itemA, itemB], twoClash) === null, "تعارضٌ مع مقررين: لا يُقترح تبديلٌ واحد (لا يكفي)");
const altClashes = { ...itemA, alternatives: [{ offeringId: "a3", section: "03", slots: [slot(2, 600, 690)], tight: false }] };
check(ctx.tkFix([altClashes, itemB], newOnly) === null, "البديلُ نفسه يتعارض مع مقررٍ آخر: لا اقتراح");

/* البطاقة الرئيسية */
const order = (mode: string) => { ctx.S.state.phase.mode = mode; return ctx.primaryOrder().join(); };
check(order("wishes") === "wishes,ticket" && order("report") === "report,ticket" && order("frozen") === "ticket,wishes", "كلُّ مرحلةٍ لها بطاقتُها الرئيسية");
check(order("none") === "" && order("waiting") === "" && order("closed") === "", "خارج المراحل: رحلةُ الفصل هي الرئيسية");

/* مصدر الصفحة */
check(/id="primarySlot"/.test(STUDENT_HOME_SCRIPT) && /id="laterBody"/.test(STUDENT_HOME_SCRIPT) && /details\.later\{/.test(STUDENT_HOME_CSS), "لسان «الآن» فيه موضعٌ رئيسي واحدٌ وبقيةٌ مطويّة");
check(/\.seg\[aria-label="تصفية"\] button/.test(STUDENT_HOME_SCRIPT) && !/querySelectorAll\("\.seg button"\)/.test(STUDENT_HOME_SCRIPT), "أزرار التصفية لا تلتقط أزرار الاختصارات");
check(/data-lv=/.test(STUDENT_HOME_SCRIPT) && /id="lvq"/.test(STUDENT_HOME_SCRIPT), "تعليمُ المستوى كله والاختصار «أنهيت حتى مستوى» موجودان");

check(/id="primSkel"|primSkel/.test(STUDENT_HOME_SCRIPT) && /S\.homeReady/.test(STUDENT_HOME_SCRIPT), "مساحةُ البطاقة المنتظَرة تُحجز بهيكلٍ حتى تصل الرئيسية (لا قفزة)");
check(/\.chip\.pulse\{animation:pulse/.test(STUDENT_HOME_CSS) && /prefers-reduced-motion:reduce\)\{[^}]*\.chip\.pulse\{animation:none/.test(STUDENT_HOME_CSS), "نبضةٌ واحدة عند وصول الرغبات، وتُلغى مع «تقليل الحركة»");


/* ── الصقل الأخير: رقمُ فصول التخرّج واحد، والنحو، والبطاقة المرفوعة ── */
{
  const cx: Record<string, any> = { S: { state: { term: { id: 7 }, profile: { wishes: null }, limits: { wishUnitsMin: 12, wishUnitsMax: 15, termUnits: 13.5 } } },
    countOf: (n: number, u: string) => `${n} ${u}`, AR: { course: "مقرر" } };
  runInNewContext([
    "var SUMMER_UNITS=6;",
    fn("defaultUnits", "termsLeft"), fn("termsLeft", "lim"), fn("lim", "esc"),
    fn("whatIf", "whatIfLine"), fn("chosenCourses", "wishChips"),
    "this.defaultUnits=defaultUnits;this.termsLeft=termsLeft;this.chosenCourses=chosenCourses;",
  ].join("\n"), cx);
  check(cx.defaultUnits() === 14, "من لم يكتب رغباته: وحداتُه في الفصل المعدلُ مقرَّباً (١٤)");
  cx.S.state.profile.wishes = { termId: 7, targetUnits: 15 };
  check(cx.defaultUnits() === 15, "ومن كتبها: ما كتبه");
  cx.S.state.profile.wishes = { termId: 6, targetUnits: 12 };
  check(cx.defaultUnits() === 14, "رغباتُ فصلٍ سابق لا تُحتسب");
  cx.S.state.profile.wishes = { termId: 7, targetUnits: 40 };
  check(cx.defaultUnits() === 15, "ويُقصَّ ما خرج عن حدود الخادم");
  cx.S.state.profile.wishes = null;
  check(cx.termsLeft(109) === 8 && cx.termsLeft(0) === 0 && cx.termsLeft(14) === 1 && cx.termsLeft(15) === 2, "فصولُ التخرّج: ١٠٩ وحدةً بمعدل ١٤ = ٨، وصفرٌ حين لا متبقّي");
  check(cx.chosenCourses(1) === "مقرر بعينه" && cx.chosenCourses(2) === "مقرران بعينهما" && cx.chosenCourses(3) === "3 مقرر بعينها" && cx.chosenCourses(11) === "11 مقرر بعينه", "«بعينه/بعينهما/بعينها» تطابق العددَ والجنس");
}
const homeSrc = STUDENT_HOME_SCRIPT;
check(/var raise=hostFilled\(els\.caseRequest\)/.test(homeSrc), "«طلب للقسم» يصعد تحت البطاقة الرئيسية حين ينطبق على الطالب");
check(/S\.rp\[id\]=\{state:v,reason:\(S\.rp\[id\]&&S\.rp\[id\]\.reason\)\|\|""\}/.test(homeSrc) && /S\.rp\[k\]\.reason\|\|"other"/.test(homeSrc), "«تعثّرت» لا يختار سبباً عن الطالب، ويُرسَل «آخر» إن لم يختر");
check(!/kt\.textContent=n===null/.test(homeSrc), "رقم «فصول للتخرّج» لا يُستبدل برقمٍ آخر بعد وصول المقترح");
const { readStudentPhase } = await import("../src/utils/termStudentPhases");
const { DEFAULT_TERM_UNITS, TYPICAL_TERM_UNITS } = await import("../src/utils/studentProfile");
const unset = readStudentPhase(undefined);
check(!unset.line.includes("لم تُحدَّد") && unset.label.includes("لم تُحدَّد"), "المرحلة غير المحدَّدة: العنوانُ يقول والسطرُ لا يكرّر");
check(DEFAULT_TERM_UNITS === 14 && Math.round(TYPICAL_TERM_UNITS) === DEFAULT_TERM_UNITS, "الاقتراح في الخادم يبني على ١٤ وحدةً لمن لم يكتب رغباته، كالصفحة");

/* لوحة الإنجاز والخطوة التالية: عنوانٌ مباشر، وخطوةٌ واحدة تتبع المرحلة ووضع الطالب */
const nctx: Record<string, any> = { S: { state: null }, fmtShort: (d: string) => d };
runInNewContext([fn("heroHeadline", "nextStepInfo"), fn("nextStepInfo", "nextStepPaint"), "this.heroHeadline=heroHeadline;this.nextStepInfo=nextStepInfo;"].join("\n"), nctx);
check(nctx.heroHeadline({ percent: 22, remainingUnits: 128 }).includes("22٪") && nctx.heroHeadline({ percent: 22, remainingUnits: 128 }).includes("من خطتك"), "العنوان: «أنجزتَ ٢٢٪ من خطتك»");
check(nctx.heroHeadline({ percent: 0, remainingUnits: 150 }).includes("ابدأ") && nctx.heroHeadline({ percent: 100, remainingUnits: 0 }).includes("أكملتَ"), "العنوان عند الصفر وعند الإكمال");
const st = (mode: string, over: any = {}) => { nctx.S.state = { term: { id: 7 }, phase: { mode, canEditWishes: mode === "wishes", nextAt: "2026-11-06" }, profile: { progress: { passedUnits: 36, remainingUnits: 128 }, wishes: null, ...over } }; return nctx.nextStepInfo(); };
check(st("wishes").to === "wishes" && st("wishes").go.includes("سجّل"), "رغباتٌ مفتوحة ولم يسجّل: «سجّل رغباتي»");
check(st("wishes", { wishes: { termId: 7, courseIds: [1, 2] } }).go.includes("عدّل"), "سجّل رغباته: «عدّل رغباتي»");
check(st("wishes", { wishes: { termId: 6, courseIds: [1, 2] } }).go.includes("سجّل"), "رغباتُ فصلٍ سابق لا تُحسب لهذا الفصل");
check(st("wishes", { wishes: { termId: 7, courseIds: [], targetUnits: 14 } }).go.includes("عدّل"), "رغباتٌ محفوظة بلا مقررات (وحدات وقيود فقط) تُعدّ مسجَّلة");
nctx.S.tkReady = true;
check(st("frozen").to === "ticket" && st("report").to === "ticket", "مراجعة الجدول أو الإبلاغ مع تذكرةٍ جاهزة: «افتح جدولي»");
nctx.S.tkReady = false;
check(st("frozen").to === "plan" && st("report").to === "plan", "لا تذكرةَ جاهزة: لا يُعرض «افتح جدولي» ويُرجَع إلى الخطة");
nctx.S.tkReady = null;
check(st("frozen") === null, "قبل أن يُعرف وجود التذكرة: لا بطاقة (فلا تومض ثم تتبدّل)");
nctx.S.tkReady = true;
check(st("none").to === "plan", "خارج المراحل ومعه إنجاز: خطتي");
check(st("none", { progress: { passedUnits: 0, remainingUnits: 150 } }).to === "setup", "لا إنجازَ مسجَّل: «أكمل خطتك»");
check(st("none", { progress: { passedUnits: 164, remainingUnits: 0 } }) === null, "أكمل الصحيفة: لا خطوة");
check(/\.next\{[^}]*margin-block-start:-22px/.test(STUDENT_HOME_CSS) && /\.hero\.me \.rn\{/.test(STUDENT_HOME_CSS), "البطاقة تتداخل مع الخضراء، وسطرُ شرح النسبة ثابت");

console.log(`\n${passed} passed, 0 failed`);
