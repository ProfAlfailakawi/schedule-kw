/**
 * ── تخطيط الشعب من تقرير التسجيل (src/utils/sectionPlan.ts) ──────────────────────────
 *
 * بالملفين الحقيقيين (tests/fixtures/actual-demand): «الكل» و«الخريجون» لقسم تكنولوجيا التعليم.
 * المطروح في الجدول المحاكى = عمود «المطروحة» في التقرير نفسه (مطابقٌ لجدول القسم وقت التقرير).
 *
 *  P1  مقدمة ١١٢: بسعة ٦٠ للمقرر — بنين ٥ مطلوبة و٥ مطروحة (متوازن)، بنات ٣ مطلوبة و١٣ مطروحة (فائض ١٠).
 *      متوسط التقرير (٩٠) لا يدخل الحساب حين للمقرر سعةٌ عندنا.
 *  P2  السعة: سعة المقرر كما هي (٢٥ تُقرأ ٢٥ لا ٦٠)، وبلا سعة: متوسط التقرير موسوماً، وبلا الاثنين: «أدخل السعة».
 *  P3  الخريجون أولاً: مقررٌ لخريجيه ولا شعبة له في حرمهم يقع في الدرجة الأولى؛ وحين تُطرح شعبُهم ينتقل للثانية.
 *  P4  ورشة ٢١٢: الخريجون جزءٌ من الكل — المطلوب واحدٌ، ومنه للخريجين، ولا يتكرر السطر.
 *  P5  الترتيب برقم المقرر، والبنين قبل البنات للمقرر نفسه.
 *  P6  «الكل» وحده يكفي: لا درجة خريجين ولا نسبة لهم، والحساب كاملٌ لبقية الطلبة.
 *  P7  المنتدبون: ساعاتٌ بلا أستاذ − المتاح ÷ ٦، للخريجين وللجميع؛ وشعبةٌ قائمةٌ بلا أستاذٍ حقيقي تُحسب.
 *  P8  حقائق كل نسخة (AdCourseId) من سطر حرمها.
 *  P9  التاريخ يقود: ٢١٢ بنات فُتحت ٢٦ ثم ٣٠ ← المعتاد ٢٨، والحاجة ١١٢ تحرّكه +٢ فقط (٣٠)؛ والحاجة الكاملة تبقى ظاهرة.
 *  P10 بلا تاريخ: المقترح = الحاجة الكاملة بسعة المقرر (بلا سقف مختلق)، موسومٌ «calc».
 *  P11 الخريجون لا ينزل المقترح عن شعبهم؛ والمقفل لا يُقترح له شيء؛ والمسقوف لا يتجاوز سقفه.
 *  P12 مقررٌ أُعيد ترقيمه يرث شعب سلفه؛ وبلا سعة ومعه تاريخ يُقترح من التاريخ.
 *  P13 suggestFromHistory: ±١ (و±٢ لمن فوق ٤) ولا أقل من ١.
 */
import fs from "node:fs";
import { extractDemandItems } from "../src/server/actualDemand";
import { matchDemandCourses, parseDemandReport, type DemandReport } from "../src/utils/actualDemand";
import { planCourseFacts, planStage, sectionPlan, suggestFromHistory, VISITOR_HOURS, type PlanCatalogueCourse, type PlanMember, type PlanScheduleRow } from "../src/utils/sectionPlan";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra ?? ""); }
};

const read = async (name: string) => parseDemandReport(await extractDemandItems(fs.readFileSync(`tests/fixtures/actual-demand/${name}`)));

/* عائلةٌ من كليتين: بنين (1) وبنات (2)، لكلٍّ نسخته من كل مقرر. */
const members: PlanMember[] = [{ collegeId: 1, sectionId: 11, track: "boys" }, { collegeId: 2, sectionId: 22, track: "girls" }];
function family(report: DemandReport, cap: (code: string, track: "boys" | "girls") => number | undefined) {
  const catalogue: PlanCatalogueCourse[] = [];
  const rows: PlanScheduleRow[] = [];
  let id = 1000;
  for (const course of report.courses) {
    for (const member of members) {
      const courseId = ++id;
      catalogue.push({ AdCourseId: courseId, AdSectionId: member.sectionId, MaxStudent: cap(course.code, member.track as "boys" | "girls"), CourseHours: course.units });
      const offered = member.track === "boys" ? course.offered.boys : course.offered.girls;
      for (let n = 1; n <= offered; n++) rows.push({ AdCourseId: courseId, AdCollegeId: member.collegeId, SCode: String(n).padStart(2, "0"), AdInstructorId: 500 + n });
    }
  }
  const catalogueRows = catalogue.map(row => ({ AdCourseId: row.AdCourseId, AdSectionId: row.AdSectionId, AdCollegeId: row.AdSectionId === 11 ? 1 : 2,
    CourseCode: report.courses[Math.floor((row.AdCourseId - 1001) / 2)].code, CourseName: "" }));
  const matches = new Map(matchDemandCourses(report.courses, catalogueRows, members.map(member => ({ ...member, departmentKey: "0109" }))).map(match => [match.code, match] as const));
  return { catalogue, rows, matches };
}

(async () => {
  const general = await read("swrdash-general-0109.pdf");
  const graduates = await read("swrdash-graduates-0109.pdf");
  const fam = family(general, () => 60);
  const plan = sectionPlan({ general, graduates, matches: fam.matches, catalogue: fam.catalogue, members, rows: fam.rows });
  const row = (code: string, track: string) => plan.rows.find(item => item.code === code && item.track === track)!;

  /* P1 */
  const b112 = row("0109112", "boys"), g112 = row("0109112", "girls");
  check(b112.required === 5 && b112.offered === 5 && b112.gap === 0 && b112.tier === "ok", "P1 ١١٢ بنين: ٢٥٣ ÷ ٦٠ = ٥، مطروح ٥ — متوازن", b112);
  check(g112.required === 3 && g112.offered === 13 && g112.gap === -10 && g112.tier === "surplus", "P1 ١١٢ بنات: ١٣٥ ÷ ٦٠ = ٣، مطروح ١٣ — فائض ١٠", g112);
  check(b112.cap === 60 && b112.capSource === "course" && b112.registrar === 3, "P1 السعة من المقرر (٦٠) لا من متوسط التقرير (٩٠)، واقتراح التسجيل للمقارنة فقط", b112);

  /* P2 */
  const mixed = family(general, (code, track) => code === "0109114" ? (track === "boys" ? 25 : undefined) : code === "0109107" ? undefined : 60);
  const p2 = sectionPlan({ general, graduates, matches: mixed.matches, catalogue: mixed.catalogue, members, rows: mixed.rows });
  const b114 = p2.rows.find(item => item.code === "0109114" && item.track === "boys")!;
  const g114 = p2.rows.find(item => item.code === "0109114" && item.track === "girls")!;
  const r107 = p2.rows.find(item => item.code === "0109107" && item.track === "girls")!;
  check(b114.cap === 25 && b114.required === Math.ceil(327 / 25), "P2 سعة ٢٥ تُقرأ كما هي: ٣٢٧ ÷ ٢٥ = ١٤", b114);
  check(g114.capSource === "report" && g114.cap === 46 && g114.required === Math.ceil(245 / 46), "P2 بلا سعة عندنا: متوسط التقرير (٤٦) موسوماً", g114);
  check(r107.tier === "nocap" && r107.required === 0 && p2.totals.nocap >= 2, "P2 بلا سعة عندنا ولا في التقرير: «أدخل السعة» بلا حساب", r107);

  /* P3 */
  const b148 = row("0109148", "boys");
  check(b148.offered === 0 && b148.graduates === 9 && b148.gradShort === 1 && b148.tier === "grad" && planStage(b148) === "graduates", "P3 ١٤٨ بنين: ٩ خريجين بلا شعبة — الدرجة الأولى، ينقصهم ١", b148);
  const g468 = row("0109468", "girls");
  check(g468.gradShort === 0 && g468.tier !== "grad", "P3 ٤٦٨ بنات: شعبُ خريجيه مطروحة — ليس في الدرجة الأولى", g468);
  check(plan.graduatesServed !== null && plan.graduatesServed > 0 && plan.graduatesServed < 100, "P3 نسبة الخريجين الذين لهم مقعد بين ٠ و١٠٠", plan.graduatesServed);

  /* P4 */
  const g212 = row("0109212", "girls");
  check(g212.students === 6666 && g212.graduates === 336 && g212.required === 112 && g212.gradRequired === 6 && g212.offered === 28 && g212.gap === 84,
    "P4 ٢١٢ بنات: ٦٦٦٦ ÷ ٦٠ = ١١٢، منها ٦ للخريجين، مطروح ٢٨ — ينقصه ٨٤", g212);
  check(plan.rows.filter(item => item.code === "0109212").length === 2, "P4 ٢١٢ سطرٌ واحد لكل حرم (لا يتكرر في الدرجتين)");

  /* P5 */
  const keys = plan.rows.map(item => `${item.code}:${item.track}`);
  check(keys.indexOf("0109105:boys") < keys.indexOf("0109105:girls") && keys.indexOf("0109105:girls") < keys.indexOf("0109110:boys") && keys.indexOf("0109468:girls") < keys.indexOf("0109491:boys"),
    "P5 الترتيب برقم المقرر، والبنين قبل البنات", keys.slice(0, 6));

  /* P6 */
  const alone = sectionPlan({ general, graduates: null, matches: fam.matches, catalogue: fam.catalogue, members, rows: fam.rows });
  check(alone.hasGeneral && !alone.hasGraduates && alone.graduatesServed === null && alone.rows.every(item => item.tier !== "grad") && alone.totals.open > 0,
    "P6 «الكل» وحده: لا درجة خريجين، والحساب لبقية الطلبة كامل");

  /* P7 */
  const expectGrad = plan.rows.reduce((sum, item) => sum + item.gradShort * item.hours, 0);
  check(plan.visitors.graduates.hours === expectGrad && plan.visitors.graduates.visitors === Math.ceil(expectGrad / VISITOR_HOURS), "P7 منتدبو الخريجين: ساعاتهم ÷ ٦", plan.visitors.graduates);
  const roomy = sectionPlan({ general, graduates, matches: fam.matches, catalogue: fam.catalogue, members, rows: fam.rows, freeHours: expectGrad });
  check(roomy.visitors.graduates.visitors === 0 && roomy.visitors.all.visitors < plan.visitors.all.visitors, "P7 ما بقي في الأنصبة ينقص المنتدبين");
  const empty = sectionPlan({ general, graduates, matches: fam.matches, catalogue: fam.catalogue, members, rows: fam.rows, isTeacher: id => id !== 501 });
  check(empty.visitors.all.hours > plan.visitors.all.hours, "P7 شعبةٌ قائمة بلا أستاذٍ حقيقي تُحسب على المنتدبين");

  /* P8 */
  const facts = planCourseFacts(plan, fam.matches, fam.catalogue, members);
  const girls112 = fam.catalogue.find(item => item.AdSectionId === 22 && fam.matches.get("0109112")?.courseIds.includes(item.AdCourseId))!;
  check(facts[String(girls112.AdCourseId)]?.gap === -10 && facts[String(girls112.AdCourseId)]?.track === "girls", "P8 حقيقة نسخة البنات لـ١١٢ من سطر البنات", facts[String(girls112.AdCourseId)]);

  /* P9 */
  const copyOf = (code: string, sectionId: number) => fam.catalogue.find(item => item.AdSectionId === sectionId && fam.matches.get(code)?.courseIds.includes(item.AdCourseId))!.AdCourseId;
  const past = (code: string, sectionId: number, collegeId: number, counts: number[], asId?: number) => counts.map((n, term) => ({
    termName: `فصل سابق ${term + 1}`,
    rows: Array.from({ length: n }, (_, i) => ({ AdCourseId: asId ?? copyOf(code, sectionId), AdCollegeId: collegeId, SCode: String(i + 1).padStart(2, "0"), AdInstructorId: 500 + i })) as PlanScheduleRow[],
  }));
  const merge = (...lists: Array<ReturnType<typeof past>>) => lists[0].map((term, index) => ({ termName: term.termName, rows: lists.flatMap(list => list[index].rows) }));
  const withPast = (extra: Partial<Parameters<typeof sectionPlan>[0]>) => sectionPlan({ general, graduates, matches: fam.matches, catalogue: fam.catalogue, members, rows: fam.rows, ...extra });
  const led = withPast({ past: merge(past("0109212", 22, 2, [26, 30]), past("0109112", 22, 2, [12, 14])) });
  const l212 = led.rows.find(item => item.code === "0109212" && item.track === "girls")!;
  check(l212.usual === 28 && l212.historyTerms === 2 && l212.basis === "history" && l212.plan === 30 && l212.gap === 2 && l212.required === 112 && l212.fullGap === 84,
    "P9 ٢١٢ بنات: المعتاد ٢٨ والحاجة ١١٢ تحرّكه +٢ (٣٠) — والحاجة الكاملة ١١٢ تبقى ظاهرة", l212);
  const l112 = led.rows.find(item => item.code === "0109112" && item.track === "girls")!;
  check(l112.usual === 13 && l112.plan === 11 && l112.required === 3 && l112.gap === -2 && l112.tier === "surplus", "P9 ١١٢ بنات: المعتاد ١٣ والحاجة ٣ تنزله −٢ فقط (١١) — فائض ٢ لا ١٠", l112);
  check(led.totals.needAll > led.totals.open && led.totals.open < plan.totals.open, "P9 المجموع المقترح أقل بكثير من الحاجة الكاملة، والحاجة الكاملة تُعرض", { open: led.totals.open, needAll: led.totals.needAll, without: plan.totals.open });

  /* P10 */
  check(g212.basis === "calc" && g212.usual === null && g212.plan === g212.required && g212.plan === 112 && g212.fullGap === g212.gap, "P10 بلا تاريخ: المقترح = الحاجة الكاملة ١١٢ موسومٌ «calc»", g212);

  /* P11 */
  check(led.rows.every(item => !item.cap || item.plan >= item.gradRequired), "P11 لا مقترحَ تحت شعب الخريجين في أي سطر");
  const lock = withPast({ past: past("0109212", 22, 2, [26, 30]), offering: new Map([[copyOf("0109212", 22), { state: "closed" }]]) });
  const k212 = lock.rows.find(item => item.code === "0109212" && item.track === "girls")!;
  check(k212.basis === "locked" && k212.plan <= k212.offered && k212.gap <= 0, "P11 المقرر المقفل: لا يُقترح له فتح", k212);
  const lim = withPast({ past: past("0109212", 22, 2, [26, 30]), offering: new Map([[copyOf("0109212", 22), { state: "limited", maxSections: 29 }]]) });
  check(lim.rows.find(item => item.code === "0109212" && item.track === "girls")!.plan === 29, "P11 المقرر المسقوف (٢٩): لا يتجاوز سقفه");

  /* P12 */
  const boys105 = copyOf("0109105", 11);
  const inherit = withPast({ past: past("0109105", 11, 1, [3, 3], 7777), ancestors: new Map([[boys105, [7777]]]) });
  const i105 = inherit.rows.find(item => item.code === "0109105" && item.track === "boys")!;
  check(i105.usual === 3 && i105.basis === "history", "P12 مقررٌ أُعيد ترقيمه يرث شعب سلفه (٣ و٣ ← ٣)", i105);
  const noCapHist = withPast({ past: past("0109107", 22, 2, [4, 4]) });
  const n107 = noCapHist.rows.find(item => item.code === "0109107" && item.track === "girls")!;
  check(n107.tier !== "nocap" && n107.basis === "history" && n107.plan === 4 + Math.max(0, Math.min(2, n107.required - 4)), "P12 بلا سعةٍ ومعه تاريخ: يُقترح من التاريخ ولا يُسأل عن السعة", n107);

  /* P13 */
  check(suggestFromHistory(3, 10) === 4 && suggestFromHistory(4, 10) === 6 && suggestFromHistory(5, 1) === 3 && suggestFromHistory(1, 0) === 1 && suggestFromHistory(2, 1) === 1,
    "P13 ±١ للمعتاد دون ٤، و±٢ من ٤ فأكثر، ولا أقل من ١");

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
