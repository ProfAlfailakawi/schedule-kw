/**
 * ── أقرانُ المقرر من الصحيفة ───────────────────────────────────────────────────
 * بأشكال الإنتاج: الصحيفة السابقة فيها 237 و258 و247 إجبارية من مستوى 200، و334 مسبقاه 237 و258،
 * و354 مسبقاته خمسة؛ و215 (متطلب كلية) خارج أي قاعدة مطابقة. لا مقارنة بين صحيفتين، ولا تخمين من الرقم.
 */
import fs from "node:fs";
import { levelGroupsOfPlans, MAX_UNLOCK_PREREQS, prereqChainPairs, sameLevelLookup, shortCourseName, unlockGroupsOfPlans, unlockLookup } from "../src/utils/planPeers";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 600)); }
};

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
  const chain = prereqChainPairs([plan]), peers = sameLevelLookup(levelGroupsOfPlans([plan]), chain);
  check(!peers(217, 237) && !peers(237, 217), "المسبق المباشر لا يُؤخذ مع لاحقه", chain);
  check(!peers(217, 334), "المسبق عبر سلسلة كذلك", chain);
  check(!peers(217, 400), "البديل مسبقٌ أيضاً", chain);
  check(peers(237, 258), "الشقيقان بعد مسبقٍ واحد يبقيان أقراناً", chain);
  const unlocks = unlockLookup([{ nextCourseId: 9, nextCourseName: "س", courseIds: [217, 237, 258] }], chain);
  check(!unlocks(217, 237) && Boolean(unlocks(237, 258)), "«تفتح» لا يجمع مسبقاً ولاحقه", chain);
  check(prereqChainPairs([{ rules: [{ courseId: 1, prereq: { all: [2] } }, { courseId: 2, prereq: { all: [1] } }] }]).length === 1, "حلقةٌ في البيانات لا تعلّق الحساب");
}
check(!sameLevelLookup([])(237, 258) && levelGroupsOfPlans([{}]).length === 0, "نقص البيانات صمت");

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
const slot = fs.readFileSync("src/utils/sameSlot.ts", "utf8");
check(!/levelOfCode|slice\(-3/.test(slot), "لا تخمين للمستوى من الرقم");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
