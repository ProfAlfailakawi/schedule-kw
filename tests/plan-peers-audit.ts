/**
 * ── أقرانُ المقرر من الصحيفة ───────────────────────────────────────────────────
 * بأشكال الإنتاج: الصحيفة السابقة فيها 237 و258 و247 إجبارية من مستوى 200، و334 مسبقاه 237 و258،
 * و354 مسبقاته خمسة؛ و215 (متطلب كلية) خارج أي قاعدة مطابقة. لا مقارنة بين صحيفتين، ولا تخمين من الرقم.
 */
import fs from "node:fs";
import { cachedPlanFacts, forgetPlanFacts, loadPlanFacts, PLAN_FACTS_TTL_MS } from "../src/utils/planFactsCache";
import { levelGroupsOfPlans, MAX_UNLOCK_PREREQS, prereqChainPairs, sameLevelLookup, shortCourseName, unlockGroupsOfPlans, unlockLookup } from "../src/utils/planPeers";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 600)); }
};

const levels = (...groups: number[][]) => groups.map(courseIds => ({ courseIds, blocked: [] }));
const compulsory = (courseId: number, level?: number, prereq?: { all?: number[]; anyOf?: number[][] }) => ({ courseId, kind: "compulsory", level, prereq });
const names: Record<number, string> = {
  334: "تصميم وإنتاج المجسمات والعرائس", 354: "التلفزيون التعليمي (1)", 490: "التدريب الميداني", 500: "مقرر بديل", 510: "مقرر يجمع متطلب جامعة",
};
const nameOf = (id: number) => names[id] || "";
const previous = { rules: [
  compulsory(237, 200), compulsory(258, 200), compulsory(247, 200), compulsory(235, 200), compulsory(314, 300),
  { courseId: 301, kind: "elective", level: 200 }, { courseId: 302, kind: "university", level: 200 }, { courseId: 303, kind: "college", level: 200 },
  { courseId: 304, kind: "compulsory" },
  compulsory(334, 300, { all: [237, 258] }),
  compulsory(354, 300, { all: [235, 237, 247, 258, 314] }),
  compulsory(490, 400, { all: [235, 237, 247, 258, 314, 334] }),
  compulsory(500, 300, { anyOf: [[237, 258]] }),
  compulsory(510, 300, { all: [237, 302] }),
] };
const current = { rules: [compulsory(220, 200), compulsory(219, 200), compulsory(237, 300), compulsory(600, 300, { all: [220, 247] })] };

const level = sameLevelLookup(levelGroupsOfPlans([previous, current]));
check(level(237, 258) && level(258, 247) && level(237, 247), "237 و258 و247 مجموعة واحدة");
check(!level(215, 237), "215 ليس في مجموعة", levelGroupsOfPlans([previous]));
check(!level(301, 237) && !level(302, 237) && !level(303, 237), "الاختياري ومتطلب الجامعة والكلية خارج المستوى");
check(!level(304, 237), "مستوى غير محدد: لا قرين");
check(!level(220, 237) && !level(247, 220), "صحيفتان لا تُقارَنان");
check(level(219, 220), "وفي الصحيفة الأخرى مجموعتها");
check(!level(237, 237), "المقرر ليس قرين نفسه");
{
  /* الرسوم 217 مسبقٌ للشفافيات 237: مستوى واحد ولا يُؤخذان معاً. والسلسلة 217 ← 237 ← 334 كذلك. */
  const plan = { rules: [
    { courseId: 217, level: 200, kind: "compulsory" }, { courseId: 237, level: 200, kind: "compulsory", prereq: { all: [217] } },
    { courseId: 258, level: 200, kind: "compulsory", prereq: { all: [217] } }, { courseId: 334, level: 200, kind: "compulsory", prereq: { all: [237, 258] } },
    { courseId: 400, level: 200, kind: "compulsory", prereq: { anyOf: [[217], [999]] } },
  ] };
  const chain = prereqChainPairs(plan), peers = sameLevelLookup(levelGroupsOfPlans([plan]));
  check(!peers(217, 237) && !peers(237, 217), "المسبق المباشر لا يُؤخذ مع لاحقه", chain);
  check(!peers(217, 334), "المسبق عبر سلسلة كذلك", chain);
  check(!peers(217, 400), "البديل مسبقٌ أيضاً", chain);
  check(peers(237, 258), "الشقيقان بعد مسبقٍ واحد يبقيان أقراناً", chain);
  const unlocks = unlockLookup([{ nextCourseId: 9, nextCourseName: "س", courseIds: [217, 237, 258], blocked: chain }]);
  check(!unlocks(217, 237) && Boolean(unlocks(237, 258)), "«تفتح» لا يجمع مسبقاً ولاحقه", chain);
  check(prereqChainPairs({ rules: [{ courseId: 1, prereq: { all: [2] } }, { courseId: 2, prereq: { all: [1] } }] }).length === 1, "حلقةٌ في البيانات لا تعلّق الحساب");
}
{
  /* السلسلةُ حكمُ صحيفتها: س تجعل 1 مسبقاً لـ2، وص تجعلهما قرينين، فالقرابةُ قائمة من ص. */
  const chained = { rules: [compulsory(1, 200), compulsory(2, 200, { all: [1] })] }, free = { rules: [compulsory(1, 200), compulsory(2, 200)] };
  check(sameLevelLookup(levelGroupsOfPlans([chained, free]))(1, 2) && sameLevelLookup(levelGroupsOfPlans([free, chained]))(2, 1), "المستوى: سلسلةُ صحيفةٍ لا تمحو قرابةً من صحيفةٍ أخرى");
  check(!sameLevelLookup(levelGroupsOfPlans([chained]))(1, 2), "وفي صحيفتها وحدها تمنع");
  check(!sameLevelLookup(levelGroupsOfPlans([chained, { rules: [compulsory(1, 200), compulsory(9, 200), compulsory(2, 300)] }]))(1, 2), "صحيفةٌ لا تجمعهما لا تنقض سلسلة الأخرى");
  const xUnlock = { rules: [compulsory(1, 200), compulsory(2, 200, { all: [1] }), compulsory(3, 300, { all: [1, 2] })] };
  const yUnlock = { rules: [compulsory(1, 200), compulsory(2, 300), compulsory(4, 300, { all: [1, 2] })] };
  const label = (id: number) => `م${id}`;
  check(unlockLookup(unlockGroupsOfPlans([xUnlock, yUnlock], label))(1, 2)?.names.join() === "م4", "«تفتح»: تبقى من الصحيفة الخالية من السلسلة، وتسقط من صاحبتها", unlockGroupsOfPlans([xUnlock, yUnlock], label));
  check(!unlockLookup(unlockGroupsOfPlans([xUnlock], label))(1, 2), "وفي صاحبة السلسلة وحدها: لا «تفتح»");
  const wide = { rules: [compulsory(1, 200), compulsory(2, 200, { all: [1] }), compulsory(3, 200), compulsory(5, 300, { all: [1, 2, 3] })] };
  const [lvl] = levelGroupsOfPlans([wide]), [opens] = unlockGroupsOfPlans([wide], label);
  check(JSON.stringify(lvl.blocked) === "[[1,2]]" && JSON.stringify(opens.blocked) === "[[1,2]]", "كل مجموعة تحمل موانعها هي، بين أعضائها فقط", [lvl, opens]);
  check(!sameLevelLookup([{ courseIds: [1, 2] } as any])(1, 3) && sameLevelLookup([{ courseIds: [1, 2] } as any])(1, 2), "مجموعةٌ بلا موانع (استجابةٌ قديمة) لا تكسر القراءة");
}
{
  /* الصحائف القديمة تكتب 2 بدل 200. */
  const legacy = { rules: [compulsory(1, 2), compulsory(2, 200), compulsory(3, 3)] };
  check(sameLevelLookup(levelGroupsOfPlans([legacy]))(1, 2), "المستوى 2 هو 200", levelGroupsOfPlans([legacy]));
  check(!sameLevelLookup(levelGroupsOfPlans([legacy]))(1, 3), "والمستوى 3 غيره");
  check(!sameLevelLookup(levelGroupsOfPlans([{ rules: [compulsory(1, 250), compulsory(2, 250), compulsory(3, 0)] }]))(1, 2), "مستوى خارج المعتمد: صمت");
  const order = unlockGroupsOfPlans([{ rules: [compulsory(1, 200), compulsory(2, 200), compulsory(7, 4, { all: [1, 2] }), compulsory(8, 300, { all: [1, 2] })] }], id => `م${id}`);
  check(order.map(group => group.nextCourseId).join() === "8,7", "والترتيب يقرأ المستوى المطبَّع: 4 بعد 300", order);
}
{
  /* قاعدتان لمقررٍ واحد: كلتاهما تُقرأ، فلا يضيع مسبقٌ ولا تُحسب سلسلةٌ ناقصة. */
  const dup = { rules: [compulsory(5, 200, { all: [1] }), compulsory(5, 200, { all: [2] }), compulsory(1, 200), compulsory(2, 200)] };
  const chain = prereqChainPairs(dup).map(pair => pair.join("|")).sort().join();
  check(chain === "1|5,2|5", "المسبقان معاً لا آخرهما", chain);
  check(prereqChainPairs({ rules: [compulsory(5, 200, { all: [1] }), compulsory(5, 200)] }).length === 1, "نسخةٌ ثانية بلا مسبق لا تمحو الأولى");
  /* الوصفان: يكفي أن تجعله قاعدةٌ مؤهَّلاً؛ كما يقرأ المستوى والسلسلة النسخَ كلها، لا آخرها. */
  const kinds = (first: string, second: string) => ({ rules: [
    { courseId: 1, kind: first, level: 200 }, { courseId: 1, kind: second, level: 200 }, compulsory(2, 200), compulsory(3, 300, { all: [1, 2] }),
  ] });
  const label = () => "س";
  check(unlockGroupsOfPlans([kinds("compulsory", "university")], label).length === 1 && unlockGroupsOfPlans([kinds("university", "compulsory")], label).length === 1, "«تفتح»: وصفٌ مؤهِّل في أيّ نسخة يكفي، بأي ترتيب");
  check(sameLevelLookup(levelGroupsOfPlans([kinds("compulsory", "elective")]))(1, 2) && sameLevelLookup(levelGroupsOfPlans([kinds("elective", "compulsory")]))(1, 2), "والمستوى كذلك: إجباريٌّ في أيّ نسخة");
  check(unlockGroupsOfPlans([kinds("university", "college")], label).length === 0, "ولا نسخةَ مؤهِّلة: لا يدخل");
}
check(!sameLevelLookup([])(237, 258) && levelGroupsOfPlans([{}]).length === 0, "نقص البيانات صمت");
check(sameLevelLookup(levels([1, 2]))(1, 2), "مجموعةٌ مكتوبة باليد تُقرأ كالمحسوبة");

/* مخبأ المتصفح: لا يحفظ فشلاً، وينتهي بثلاثين ثانية، ويُمحى عند الخروج، ولا يعيد ما وصل بعد المحو. */
{
  const ok = () => ({ ok: true, json: async () => ({ pairs: [[1, 2]], levelGroups: [], unlockGroups: [] }) });
  let answer: () => Promise<any> = async () => ok();
  let calls = 0, clock = 1_000_000;
  const realFetch = globalThis.fetch, realNow = Date.now;
  Date.now = () => clock;
  globalThis.fetch = (async () => { calls++; return answer(); }) as typeof fetch;

  answer = async () => ({ ok: false, status: 403, json: async () => ({}) });
  check((await loadPlanFacts(1, 5)).pairs.length === 0 && !cachedPlanFacts(5), "403 لا يُخبَّأ");
  answer = async () => ({ ok: false, status: 500, json: async () => ({}) });
  check((await loadPlanFacts(1, 5)).pairs.length === 0 && !cachedPlanFacts(5), "500 لا يُخبَّأ");
  answer = async () => { throw new Error("offline"); };
  check((await loadPlanFacts(1, 5)).pairs.length === 0 && !cachedPlanFacts(5), "انقطاعُ الشبكة لا يُخبَّأ");
  answer = async () => ok();
  check((await loadPlanFacts(1, 5)).pairs.length === 1 && calls === 4, "وبعد الفشل تُعاد المحاولة", calls);
  check(cachedPlanFacts(5)?.pairs.length === 1, "والنجاح يُخبَّأ");
  clock += PLAN_FACTS_TTL_MS - 1;
  check(Boolean(cachedPlanFacts(5)), "قبل الثلاثين ثانية: من المخبأ");
  clock += 1;
  check(PLAN_FACTS_TTL_MS === 30_000 && !cachedPlanFacts(5), "وبعدها ينتهي كالخادم");
  await loadPlanFacts(1, 5);
  check(Boolean(cachedPlanFacts(5)), "ثم يُجلب من جديد");
  forgetPlanFacts();
  check(!cachedPlanFacts(5), "المحو عند الخروج يُفرغ المخبأ");
  let release: (value: any) => void = () => undefined;
  answer = () => new Promise(resolve => { release = resolve; });
  const late = loadPlanFacts(1, 6);
  forgetPlanFacts();
  release(ok());
  await late;
  check(!cachedPlanFacts(6), "طلبٌ بدأ قبل الخروج ووصل بعده لا يُخبَّأ لمن يدخل بعده");
  answer = async () => ok();
  const before = calls;
  await Promise.all([loadPlanFacts(1, 8), loadPlanFacts(1, 8)]);
  check(calls === before + 1, "طلبان متزامنان للقسم نفسه: جلبةٌ واحدة", calls - before);
  forgetPlanFacts();
  globalThis.fetch = realFetch; Date.now = realNow;
}

const groups = unlockGroupsOfPlans([previous, current], nameOf);
const unlock = unlockLookup(groups);
check(MAX_UNLOCK_PREREQS === 5, "البوابة الجماعية فوق خمسة مسبقات");
check(unlock(237, 258)?.names.join("|") === "المجسمات والعرائس|التلفزيون التعليمي (1)", "237 و258 يفتحان 334 أولاً ثم 354", unlock(237, 258));
check(unlock(247, 237)?.names.join() === "التلفزيون التعليمي (1)", "247 مع 237 عبر 354", unlock(247, 237));
check(!groups.some(group => group.nextCourseId === 490), "مقرر بستة مسبقات يُهمل");
check(!groups.some(group => group.nextCourseId === 500), "بدائل anyOf ليست أقراناً");
check(!unlock(237, 302), "متطلب الجامعة لا يدخل");
check(!unlock(220, 237) && !groups.some(group => group.nextCourseId === 600), "مقرر بلا قاعدة في صحيفته لا يُعدّ، ولا جمعَ بين صحيفتين", groups);
check(!unlock(237, 237), "المقرر لا يفتح مع نفسه");
check(unlockGroupsOfPlans([previous], () => "").length === 0, "مقرر تالٍ بلا اسم: صمت");
check(shortCourseName("تصميم وإنتاج المجسمات والعرائس") === "المجسمات والعرائس" && shortCourseName("التلفزيون التعليمي (1)") === "التلفزيون التعليمي (1)", "الاسم المختصر");
check(unlock(258, 237)?.rank === unlock(237, 258)?.rank && unlock(237, 258)?.rank === 0, "الأقرب رتبةً أولى في الاتجاهين");

const pairs = fs.readFileSync("src/server/core/coreqPairs.ts", "utf8"), routes = fs.readFileSync("src/server/routes/scheduleToolsRoutes.ts", "utf8");
check(/res\.json\(await sectionPlanFacts\(sectionId\)\)/.test(routes), "المسار نفسه يعيد الحقائق كلها");
check(/levelGroupsOfPlans\(ruleSets\)/.test(pairs) && /unlockGroupsOfPlans\(ruleSets/.test(pairs) && /plan\.virtual/.test(pairs) && /"archived"/.test(pairs), "الخادم يقرأ الصحائف الجارية كلها بالمساعد نفسه");
check(pairs.includes("Repository.currentDemoSessionId()"), "المخبأ يفصل صناديق الديمو");
check(!pairs.includes("chainPairs") && !fs.readFileSync("src/components/SameSlotHint.tsx", "utf8").includes("chainPairs"), "لا سلسلةَ مدموجة في الحمولة ولا في المتصفح");
const slot = fs.readFileSync("src/utils/sameSlot.ts", "utf8");
check(!/levelOfCode|slice\(-3/.test(slot), "لا تخمين للمستوى من الرقم");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
