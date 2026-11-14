/**
 * «المقرر الحرج» في مساري: ما يؤخّر تأخيرُه التخرّجَ فصلاً عبر سلسلة المسبقات.
 *   C1 القاعدة: سلسلةٌ بلا هامش حرجة، وبهامشٍ ليست حرجة، ولا شيء بلا مسبقات.
 *   C2 البدائلُ والاختياريُّ والمجتاز والدوران.
 *   C3 الصفحةُ تحقن الدالةَ نفسها نصّاً وتعطي النتيجةَ نفسها على مجموعاتٍ عشوائية.
 *   C4 العرض: كلمةٌ وأيقونة وسطرُ شرح، ولا يُحسب بلا قواعد معتمدة.
 */
import { runInNewContext } from "node:vm";
import { CRITICAL_COURSES_SCRIPT, criticalCourses, type CriticalInput } from "../src/utils/criticalCourses";
import { STUDENT_HOME_SCRIPT, STUDENT_HOME_CSS, studentHomePage } from "../src/server/studentHomePage";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); }
};
const comp = (...ids: number[]) => ids.map(id => ({ id, compulsory: true }));
const rule = (all: number[], anyOf: number[][] = []) => ({ all, anyOf });
const run = (input: CriticalInput) => criticalCourses(input);

/* C1 */
{
  const chain = { courses: comp(1, 2, 3, 4, 5), rules: { 2: rule([1]), 3: rule([2]) }, passed: [] as number[] };
  const tight = run({ ...chain, termsLeft: 2 });
  check(tight.ids.join() === "1,2,3" && tight.terms === 3 && tight.longest === 3, "C1 سلسلةٌ من ثلاث حلقات وفصلان بالوحدات: الثلاثُ حرجة والفصولُ ثلاثة", tight);
  const loose = run({ ...chain, termsLeft: 5 });
  check(loose.ids.length === 0 && loose.terms === 5, "C1 فصولٌ أكثر من السلسلة: لها هامش فلا حرج", loose);
  check(run({ ...chain, termsLeft: 3 }).ids.join() === "1,2,3", "C1 السلسلةُ تساوي الفصول: بلا هامش، حرجة");
  check(run({ courses: comp(1, 2, 3), rules: {}, passed: [], termsLeft: 1 }).ids.length === 0, "C1 صحيفةٌ بلا مسبقات: لا شيء حرج (لا اختراع)");
  const solo = run({ courses: comp(1, 2, 3, 9), rules: { 2: rule([1]) }, passed: [], termsLeft: 2 });
  check(solo.ids.join() === "1,2" && !solo.ids.includes(9) && !solo.ids.includes(3), "C1 مقررٌ منفرد بلا سلسلة لا يُعلَّم حرجاً ولو كان الفصلُ الأخير", solo);
}

/* C2 */
{
  const alt = run({ courses: comp(1, 2, 3), rules: { 3: rule([], [[1, 2]]) }, passed: [], termsLeft: 2 });
  check(!alt.ids.includes(1) && !alt.ids.includes(2) && alt.ids.includes(3), "C2 «أحد هذين»: البديلان ليسا حرجين (يُغني أحدُهما عن الآخر)", alt);
  const single = run({ courses: comp(1, 2, 3), rules: { 3: rule([], [[1, 2]]) }, passed: [], termsLeft: 1 });
  check(single.terms === 2, "C2 البدائلُ تُحسب في العمق بأقصرها", single);
  const onlyOne = run({ courses: comp(1, 3), rules: { 3: rule([], [[1, 77]]) }, passed: [], termsLeft: 2 });
  check(onlyOne.ids.join() === "1,3", "C2 بديلٌ وحيدٌ متبقٍّ (الآخرُ خارج الصحيفة) يلزم كأنه مسبق", onlyOne);
  const metGroup = run({ courses: comp(1, 2, 3), rules: { 3: rule([], [[1, 2]]) }, passed: [2], termsLeft: 1 });
  check(metGroup.ids.length === 0, "C2 مجموعةٌ استُوفيت بمجتاز: لا حلقة", metGroup);
  const done = run({ courses: comp(1, 2, 3), rules: { 2: rule([1]), 3: rule([2]) }, passed: [1], termsLeft: 2 });
  check(done.ids.join() === "2,3" && done.longest === 2, "C2 المجتازُ يخرج من السلسلة", done);
  const elective = run({ courses: [{ id: 1, compulsory: false }, ...comp(2, 3)], rules: { 2: rule([1]), 3: rule([2]) }, passed: [], termsLeft: 2 });
  check(!elective.ids.includes(1) && elective.longest === 2, "C2 الاختياريُّ لا يُحسب ولا يُعلَّم", elective);
  const cyc = run({ courses: comp(1, 2, 3), rules: { 1: rule([2]), 2: rule([1]), 3: rule([2]) }, passed: [], termsLeft: 1 });
  check(cyc.ids.length === 0 && cyc.terms === 1, "C2 دورانٌ في صحيفةٍ خاطئة: لا يعلّق الحساب ولا يُبنى عليه (لا شيء حرج)", cyc);
  check(run(null as any).ids.length === 0 && run({ courses: comp(1), rules: null as any, passed: [], termsLeft: 1 }).ids.length === 0, "C2 مدخلٌ ناقص: لا شيء");
}

/* C3 */
{
  check(!/=>|`|__name|\$\{|\bconst\b|\blet\b/.test(CRITICAL_COURSES_SCRIPT), "C3 الدالةُ المحقونة ES5 بلا مساعدٍ خارجي");
  check(STUDENT_HOME_SCRIPT.includes(CRITICAL_COURSES_SCRIPT), "C3 الصفحةُ تحقن الدالةَ نفسها");
  const ctx: Record<string, any> = {};
  runInNewContext(CRITICAL_COURSES_SCRIPT + "this.cc=criticalCourses;", ctx);
  let same = true, any = 0;
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let t = 0; t < 400; t++) {
    const n = 3 + Math.floor(rnd() * 14), ids = Array.from({ length: n }, (_, i) => i + 1);
    const rules: CriticalInput["rules"] = {};
    for (const id of ids) {
      if (rnd() < 0.5) continue;
      const all = ids.filter(other => other < id && rnd() < 0.25);
      const anyOf = rnd() < 0.3 ? [ids.filter(other => other < id && rnd() < 0.3)].filter(g => g.length) : [];
      rules[id] = { all, anyOf };
    }
    const input: CriticalInput = { courses: ids.map(id => ({ id, compulsory: rnd() > 0.15 })), rules, passed: ids.filter(() => rnd() < 0.2), termsLeft: 1 + Math.floor(rnd() * 6) };
    const a = criticalCourses(input), b = ctx.cc(JSON.parse(JSON.stringify(input)));
    if (JSON.stringify(a) !== JSON.stringify(b)) same = false;
    if (a.ids.length) any++;
    /* القاعدة نفسها: كلُّ حرجٍ سلسلتُه ≥ الفصول */
    if (a.terms < a.longest) same = false;
  }
  check(same && any > 20, "C3 الخادمُ والمتصفح يتفقان على ٤٠٠ صحيفةٍ عشوائية", { any });
}

/* C4 */
{
  check(/حرج/.test(STUDENT_HOME_SCRIPT) && /تأخيره يؤخر تخرّجك فصلاً/.test(STUDENT_HOME_SCRIPT) && /id="i-flame"/.test(studentHomePage("n")), "C4 كلمةٌ «حرج» وأيقونةٌ وسطرُ شرح");
  check(/function kmCrit\(/.test(STUDENT_HOME_SCRIPT) && /KM\.crit/.test(STUDENT_HOME_SCRIPT), "C4 يُحسب في خطتي من مسبقات الخريطة نفسها");
  check(/\.crit\{/.test(STUDENT_HOME_CSS), "C4 للشارة شكلُها");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
