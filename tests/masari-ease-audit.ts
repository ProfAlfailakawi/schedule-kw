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

console.log(`\n${passed} passed, 0 failed`);
