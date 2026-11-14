/**
 * ── رصيد المقاعد لكل مقرر + التنقل بالأسهم في تبويبات الإرشاد (بلا خادم) ──────────
 *  Q1  منطق: الرصيد الفعلي ومصدره (الشعبة ثم المقرر ثم القسم) ويطابق quotaFor.
 *  Q2  بنية اللوحة: حقل المقرر، الحدّ، التتبّع، الصلاحية، وسوم المقرر.
 *  Q3  التبويبات: tablist/tab/tabpanel والتنقل بالأسهم.
 */
import fs from "node:fs";
import { normalizeQuotaConfig, quotaFor, quotaResolve, SEAT_CONFIG_MAX } from "../src/utils/advisorSeats";
import { arrowChoice } from "../src/utils/arrowChoice";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ""); }
};
const read = (path: string) => fs.readFileSync(path, "utf8");

/* ── Q1 ── */
{
  const cfg = normalizeQuotaConfig({ global: 5, byCourse: { "7": 12 }, bySection: { "1:7:A": 20, "1:8:A": "" } }, "c");
  check(quotaResolve(cfg, 7, "1:7:A").source === "section" && quotaResolve(cfg, 7, "1:7:A").quota === 20, "الشعبة تغلب المقرر");
  check(quotaResolve(cfg, 7, "1:7:B").source === "course" && quotaResolve(cfg, 7, "1:7:B").quota === 12, "المقرر يغلب العام");
  check(quotaResolve(cfg, 8, "1:8:A").source === "global" && quotaResolve(cfg, 8, "1:8:A").quota === 5, "الفارغ يرث العام");
  check(quotaResolve(null, 8, "x").source === "default" && quotaResolve(null, 8, "x").quota === 0, "بلا إعداد: الافتراضي");
  check(quotaResolve({ ...cfg, global: 0, byCourse: { "7": 0 } }, 7, "k").source === "course", "الصفر قيمةٌ صالحة لا فراغ");
  check([[7, "1:7:A"], [7, "1:7:B"], [8, "1:8:A"]].every(([c, k]) => quotaFor(cfg, c as number, k as string) === quotaResolve(cfg, c as number, k as string).quota), "quotaFor يطابق quotaResolve");
  check(normalizeQuotaConfig({ byCourse: { "7": 9999 } }, "c").byCourse["7"] === SEAT_CONFIG_MAX, "الخادم يقصّ رصيد المقرر عند الحدّ");
}

/* ── Q2 ── */
{
  const panel = read("src/components/AdvisorSeatsPanel.tsx");
  check(/byCourse\[String\(courseId\)\] = clamp\(/.test(panel) && /const clamp = .*Math\.min\(max,/.test(panel), "حقل المقرر يقصّ بالحدّ نفسه");
  check((panel.match(/editCfg\(\{ \.\.\.cfg/g) || []).length === 6, "ستّ معالجات تعديل تمرّ من editCfg");
  check(/canConfigure && cfg && courseList\.length/.test(panel), "حقول المقرر لمن يملك الإعداد وفي فصل غير مجمَّد فقط");
  check(/quotaResolve\(canConfigure && cfg \? cfg : data\.config/.test(panel) && /SOURCE_LABEL/.test(panel), "الرصيد الفعلي ومصدره بجانب الشعبة");
  check(/<CourseTags courseId=\{courseId\}/.test(panel), "أسماء المقررات بوسوم المقرر");
  check(/rev: cfg\.rev \?\? 0/.test(panel) && /appliedExceptions/.test(read("src/server/routes/offeringRoutes.ts")), "ختم الإصدار وسجل الاستثناءات باقيان");
}

/* ── Q3 ── */
{
  const tabs = read("src/components/RegistrationTabs.tsx");
  check(/role="tablist"/.test(tabs) && /role="tab"/.test(tabs) && /aria-controls=/.test(tabs) && /tabIndex=\{active === view \? 0 : -1\}/.test(tabs), "tablist وtab بتركيز متنقّل");
  check(/arrowChoice\(event, \{ activate: false \}\)/.test(tabs), "تفعيلٌ يدويّ بالأسهم");
  check(/role="tabpanel" id="registration-panel-simulation" aria-labelledby="registration-tab-simulation"/.test(read("src/components/RegistrationRehearsal.tsx")), "لوحة الرادار");
  check(/role="tabpanel" id="registration-panel-studentRegistration" aria-labelledby="registration-tab-studentRegistration"/.test(read("src/components/StudentRegistration.tsx")), "لوحة الكشف");
  const rr = read("src/components/RegistrationRehearsal.tsx");
  check((rr.match(/role="tablist"[^>]*onKeyDown=\{arrowChoice\}/g) || []).length === 2, "تبويبات الرادار الداخلية بالأسهم");

  /* سلوك: عنصران وهميّان؛ في الاتجاه RTL يكون الأيسر هو التالي. */
  const mk = (name: string) => { const log: string[] = []; return { name, log, disabled: false, focus: () => log.push("focus"), click: () => log.push("click") }; };
  const run = (key: string, from: number, activate?: boolean) => {
    const items = [mk("a"), mk("b"), mk("c")];
    (globalThis as any).getComputedStyle = () => ({ direction: "rtl" });
    const container: any = { querySelectorAll: () => items };
    arrowChoice({ key, currentTarget: container, target: items[from] as any, preventDefault() {} }, activate === undefined ? {} : { activate });
    return items.map(i => i.log.join("+")).join("|");
  };
  check(run("ArrowLeft", 0, false) === "|focus|", "RTL: الأيسر يلي (تركيز فقط)");
  check(run("ArrowRight", 0, false) === "||focus", "RTL: الأيمن يسبق ويلتفّ");
  check(run("End", 0, false) === "||focus" && run("Home", 2, false) === "focus||", "Home وEnd");
  check(run("ArrowLeft", 0) === "|focus+click|", "الافتراضي يفعّل (راديو وألسنة المكان)");
}

{
  /* علَمُ إعادة التركيز يُرفع حين ينتقل التبويب فعلاً فقط، وإلا بقي حتى أول تركيبٍ آخر فسرق التركيز. */
  const tabs = fs.readFileSync("src/components/RegistrationTabs.tsx", "utf8");
  check(tabs.includes("event.detail === 0 && view !== active"), "T9 علَمُ التركيز لا يُرفع عند الضغط على التبويب النشط نفسه");
}

console.log(`\n${passed} ناجح، ${failed} فاشل`);
process.exit(failed ? 1 : 0);
