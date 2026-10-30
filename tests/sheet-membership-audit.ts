/**
 * ── عضويةُ الصحيفة: الوسمُ والتبويبان من مصدرٍ واحد ─────────────────────────────
 *
 * ملاحظةُ المالك: في «حالة طرح المقررات» كان «المواطنة الرقمية 107» يحمل «صحيفة 2026» وهو في تبويب
 * «📘 الصحيفة القديمة»، ومقرراتٌ قديمة في «🆕 الجديدة». الوسمُ كان يُحسب من روابط الصحيفة مصفّاةً بالمرجعية
 * ومن متطلبات الأقسام الأخرى، والتبويبُ من الروابط وحدها. الآن src/utils/sheetMembership.ts للاثنين.
 *
 *   M — القاعدة بمدخلاتٍ مختلطة: رموزٌ جديدة بسبعة أرقام وقديمة بثلاثة، مقررُ خدمةٍ يطلبه قسمٌ آخر،
 *       مقررٌ في الصحيفتين، رابطٌ قديمٌ عالق في الجديدة، وفرعٌ بلا صحائف يستعير صحيفة أخيه.
 *   A — الوسمُ والتبويبُ لا يختلفان أبداً.
 *   O — الترتيبُ برقم المقرر.
 *   W — كلُّ شاشةٍ تقرأ المصدرَ الواحد.
 */
import fs from "node:fs";
import { byCourseNumber, sheetBadgeOf, sheetMembership, sheetSideOf, splitBySide, type MembershipInput } from "../src/utils/sheetMembership";
import { sheetTagOf } from "../src/utils/sheetTag";
import { offeringTabs } from "../src/utils/prepublishReach";
import { setSheetMembershipSource, sheetSidesBySection, sheetSidesFor } from "../src/server/planBadgeShared";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`); }
};
const read = (file: string) => fs.readFileSync(file, "utf8");

/* ── العالَم: تكنولوجيا التعليم (1) وفرعُها الآخر بلا صحائف (3)، والرياضيات (2) ─────────── */
const TE = 1, MATH = 2, TE_GIRLS = 3;
const input: MembershipInput = {
  plans: [
    { id: "te-new", sectionId: TE, status: "active", sheetYear: 2026, name: "الصحيفة الجديدة 2026/2027" },
    { id: "te-old", sectionId: TE, status: "transition", name: "الصحيفة السابقة" },
    { id: "te-arch", sectionId: TE, status: "archived", name: "صحيفة 1999" },
    { id: "math-new", sectionId: MATH, status: "active", name: "صحيفة الرياضيات 2026" },
    { id: "math-old", sectionId: MATH, status: "transition", name: "السابقة" },
  ],
  courses: [
    { id: 101, sectionId: TE, collegeId: 1, code: "0109121" },   // جديدة وحدها (سبعة أرقام)
    { id: 102, sectionId: TE, collegeId: 1, code: "0109468" },   // في الصحيفتين
    { id: 103, sectionId: TE, collegeId: 1, code: "217" },       // قديمة وحدها (ثلاثة أرقام)
    { id: 104, sectionId: TE, collegeId: 1, code: "0109125" },   // قديمة، ورابطٌ عالق في الجديدة لا تقبله المرجعية
    { id: 105, sectionId: TE, collegeId: 1, code: "107" },       // خدمة: تطلبه جديدةُ الرياضيات وحدها
    { id: 106, sectionId: TE, collegeId: 1, code: "106" },       // خدمة: تطلبه جديدةُ الرياضيات وقديمتُها
    { id: 107, sectionId: TE, collegeId: 1, code: "0109999" },   // لا في صحيفة
    { id: 108, sectionId: TE, collegeId: 1, code: "0109499" },   // في صحيفةٍ مؤرشفة وحدها
    { id: 201, sectionId: MATH, collegeId: 1, code: "0110101" }, // مقرر الرياضيات تطلبه جديدةُ التكنولوجيا
    { id: 301, sectionId: TE_GIRLS, collegeId: 2, code: "121" }, // الفرع الآخر: أخو 101
    { id: 303, sectionId: TE_GIRLS, collegeId: 2, code: "0109217" }, // الفرع الآخر: أخو 103
  ],
  links: [
    { planId: "te-new", courseId: 101 }, { planId: "te-new", courseId: 102 }, { planId: "te-new", courseId: 104 },
    { planId: "te-old", courseId: 102 }, { planId: "te-old", courseId: 103 }, { planId: "te-old", courseId: 104 },
    { planId: "te-arch", courseId: 108 },
  ],
  externals: [
    { planId: "math-new", courseIds: [105, 106] }, { planId: "math-old", courseIds: [106] },
    { planId: "te-new", courseIds: [201] },
  ],
  acceptNew: (sectionId, course) => !(sectionId === TE && course.id === 104),
  familyOf: sectionId => (sectionId === TE || sectionId === TE_GIRLS ? [TE, TE_GIRLS] : [sectionId]),
};
const rows = sheetMembership(input);
const side = (sid: number, id: number) => sheetSideOf(rows.get(`${sid}:${id}`));
const badge = (sid: number, id: number) => sheetBadgeOf(rows.get(`${sid}:${id}`));

/* ── M: القاعدة ─────────────────────────────────────────────────────────── */
check(side(TE, 101) === "new" && badge(TE, 101) === "صحيفة 2026", "M1 رمزٌ جديد بسبعة أرقام في الجديدة وحدها: التبويبُ «الجديدة» والوسمُ «صحيفة 2026»");
check(side(TE, 102) === "shared" && badge(TE, 102) === "", "M2 مقررٌ في الصحيفتين: «في الصحيفتين» (التبويبان) بلا وسم");
check(side(TE, 103) === "old" && badge(TE, 103) === "", "M3 رمزٌ قديم بثلاثة أرقام في القديمة وحدها: «القديمة» بلا وسم");
check(side(TE, 104) === "old" && badge(TE, 104) === "", "M4 رابطٌ قديمٌ عالق في الجديدة لا تقبله المرجعية: يبقى قديماً (لا في تبويب الجديدة)");
check(side(TE, 105) === "new" && badge(TE, 105) === "صحيفة 2026" && rows.get(`${TE}:105`)?.service === true, "M5 «المواطنة الرقمية 107»: تطلبه جديدةُ قسمٍ آخر وحدها ⇒ «الجديدة» ووسمُها معاً");
check(side(TE, 106) === "shared" && badge(TE, 106) === "", "M6 مقرر خدمة تطلبه جديدةُ القسم الآخر وقديمتُه: في الصحيفتين بلا وسم");
check(side(TE, 107) === null && side(TE, 108) === null, "M7 لا في صحيفةٍ حيّة (أو في المؤرشفة وحدها): بلا جهة");
check(side(MATH, 201) === "new" && badge(MATH, 201) === "صحيفة 2026", "M8 مقرر قسمٍ آخر تطلبه جديدةُ هذا القسم: جهتُه عند قسمه المالك");
check(side(TE_GIRLS, 301) === "new" && side(TE_GIRLS, 303) === "old", "M9 فرعٌ بلا صحائف يستعير صحيفةَ أخيه بالرمز القصير (121 ↔ 0109121، 0109217 ↔ 217)");
{
  const solo = sheetMembership({ ...input, plans: input.plans.filter(plan => plan.id !== "te-old"), externals: [] });
  check(![...solo.values()].some(row => row.sectionId === TE && (row.fresh || row.old)), "M10 صحيفةٌ واحدة بلا سابقة («انتهوا»): لا جديدةَ ولا قديمة ولا وسم");
  const own = sheetMembership({ ...input, externals: [...input.externals, { planId: "math-new", courseIds: [101] }] });
  check(own.get(`${TE}:101`)?.service === false && sheetBadgeOf(own.get(`${TE}:101`)) === "صحيفة 2026", "M11 صحيفةُ القسم المالك هي الأصل: لا تكتب صحيفةُ قسمٍ آخر فوقها");
}

/* ── A: الوسمُ والتبويبُ لا يختلفان ─────────────────────────────────────── */
{
  const disagree = [...rows.values()].filter(row => Boolean(sheetBadgeOf(row)) !== (sheetSideOf(row) === "new"));
  check(!disagree.length, "A1 كلُّ مقررٍ موسومٍ «صحيفة 2026» في تبويب الجديدة وحده، وكلُّ مقررٍ في الجديدة وحدها موسوم", disagree);
  const teIds = input.courses.filter(course => course.sectionId === TE).map(course => course.id);
  const split = splitBySide(teIds, id => side(TE, id));
  check(split.tabs && split.new.join() === "101,102,105,106" && split.old.join() === "102,103,104,106,107,108", "A2 التبويبان: الجديدة (101، 102، 105، 106) والقديمة (102، 103، 104، 106، وما لا صحيفةَ له)", split);
  check(!split.old.some(id => badge(TE, id)) && split.new.every(id => side(TE, id) === "new" || side(TE, id) === "shared"), "A3 لا وسمَ «صحيفة 2026» في تبويب القديمة");
  check(!splitBySide([1, 2], () => "new").tabs && !splitBySide([1, 2], () => null).tabs, "A4 بلا ثنائية: قائمةٌ واحدة كما كانت");
  const tabs = offeringTabs({ courses: teIds.map(id => ({ id, name: "", code: "" })), reach: { courses: {}, sheets: [{ kind: "new", courseIds: [103, 104] }, { kind: "old", courseIds: [101] }] }, sides: Object.fromEntries(teIds.map(id => [id, side(TE, id)]).filter(([, value]) => value)) as any });
  check(tabs.new.join() === split.new.join(), "A5 لوحةُ حالة الطرح: التبويبان من الجهة الواحدة لا من عضوية الصحائف في حكم الوصول", tabs);
  check(!offeringTabs({ courses: [{ id: 1, name: "", code: "" }], reach: { courses: {}, sheets: [{ kind: "new", courseIds: [1] }, { kind: "old", courseIds: [2] }] }, sides: null }).tabs, "A6 الخادم يقول «لا ثنائية»: لا تبويب ولو اختلفت عضويةُ الوصول");
  check(sheetTagOf({ curriculum: [{ status: "transition" }], sheetSide: "new" }) === "new" && sheetTagOf({ curriculum: [{ status: "active" }], sheetSide: null }) === null
    && sheetTagOf({ serviceFor: ["قسم"], sheetSide: null }) === "service" && sheetTagOf({ curriculum: [{ status: "active" }] }) === "new", "A7 «كل المقررات» ومحاكي الشعب والمقترح: الجهةُ من الخادم تحكم، وبلا جهةٍ مرسلة كما كان");
}

/* ── O: الترتيب برقم المقرر ─────────────────────────────────────────────── */
{
  const list = [{ code: "324" }, { code: "0109105" }, { code: "217" }, { code: "0109121" }, { code: "" }, { code: "107" }];
  const sorted = [...list].sort(byCourseNumber(item => item.code)).map(item => item.code);
  check(sorted.join() === "0109105,107,0109121,217,324,", "O1 رقمياً تصاعدياً بالرقم القصير، سبعةُ أرقام وثلاثةٌ معاً، وبلا رقمٍ في الآخر", sorted);
  check([{ code: "0110101" }, { code: "0109101" }].sort(byCourseNumber(item => item.code)).map(item => item.code).join() === "0109101,0110101", "O2 الرقمُ نفسه في قسمين: بالرمز كاملاً");
}

/* ── W: كلُّ شاشةٍ تقرأ المصدرَ الواحد ──────────────────────────────────── */
{
  const routes = read("src/server/planReviewRoutes.ts");
  check(/const rows = sheetMembership\(\{/.test(routes) && /setSheetMembershipSource\(membershipRows\)/.test(routes), "W1 الخادم يحسب العضوية مرةً واحدة ويضعها في الجسر المشترك");
  check(/const planBadgeRows = async \(\) => \[\.\.\.\(await membershipRows\(\)\)\.values\(\)\]/.test(routes) && /row\.service && sheetBadgeOf\(row\)/.test(routes) && !/before\.has\(id\)/.test(routes), "W2 وسمُ «صحيفة 2026» (القسم نفسه ومقرر الخدمة) من العضوية نفسها — لا حسابَ ثانٍ");
  check(/sheetSidesFor\(sectionId, courses\.map\(course => course\.id\)\)/.test(read("src/server/routes/offeringRoutes.ts")) && /sides,/.test(read("src/server/routes/offeringRoutes.ts")), "W3 لوحةُ حالة الطرح تتلقّى الجهةَ من العضوية");
  check(/const split = offeringTabs\(data\);/.test(read("src/components/CourseOfferingPanel.tsx")) && /في الصحيفتين/.test(read("src/components/CourseOfferingPanel.tsx")) && !/splitBySheet/.test(read("src/components/CourseOfferingPanel.tsx")), "W4 اللوحةُ تقسم بالجهة، و«في الصحيفتين» على المقرر المشترك");
  check(/const split = offeringTabs\(snapshot\);/.test(read("src/utils/prepublishReach.ts")), "W5 ورقةُ «لم نصل بعد» قبل الإرسال تجمع بالجهة نفسها");
  check(/tagged\.sheetSide=sides\[id\]\|\|null/.test(read("src/server/routes/coursesRoutes.ts")), "W6 ‎/api/courses?plans=1‎ (كل المقررات، محاكي الشعب، كتالوج المقررات) يحمل الجهة");
  check(/sheetSide: sides\[Number\(course\.AdCourseId\)\] \|\| null/.test(read("src/server/studyProposalRoutes.ts")), "W7 منتقي «شعبة جديدة» في المقترح الدراسي بالجهة نفسها");
  check(/const side = sheetTagOf\(course\);/.test(read("src/components/Courses.tsx")), "W8 كتالوجُ المقررات بالجهة نفسها");
  check(/in srgb/.test(read("src/styles/44-course-tags.css")) && /\.of-both\{/.test(read("src/styles/44-course-tags.css")), "W9 «في الصحيفتين» ملاحظةٌ هادئة بجانب الوسوم");
  const sorts: Array<[string, RegExp, string]> = [
    ["src/server/routes/offeringRoutes.ts", /courses\.sort\(byCourseNumber\(/, "حالة الطرح (الخادم)"],
    ["src/components/CourseOfferingPanel.tsx", /\.sort\(byCourseNumber\(/, "حالة الطرح"],
    ["src/components/AllCourses.tsx", /list\.sort\(byCourseNumber\(/, "كل المقررات"],
    ["src/components/SectionSimulator.tsx", /\.sort\(byCourseNumber\(/, "محاكي الشعب"],
    ["src/utils/proposalCourseChoices.ts", /out\.sort\(byCourseNumber\(/, "منتقي المقترح الدراسي"],
    ["src/components/Schedules.tsx", /\.sort\(byCourseNumber\(\(c: AdCourse\) => c\.CourseCode/, "منتقي مقرر الموعد"],
    ["src/components/QuickCreatePopover.tsx", /\.sort\(byCourseNumber\(/, "الإضافة السريعة"],
    ["src/components/Courses.tsx", /\.sort\(byCourseNumber\(/, "كتالوج المقررات"],
    ["src/components/CurriculumPlans.tsx", /\.sort\(byCourseNumber\(/, "منتقي مقرر الصحيفة"],
    ["src/utils/prepublishReach.ts", /byCourseNumber<PrepublishRow>/, "ورقة «لم نصل بعد»"],
  ];
  for (const [file, pattern, label] of sorts) check(pattern.test(read(file)), `W10 الترتيبُ برقم المقرر: ${label}`);
}

/* ── C: الكلفة — قراءةُ العضوية مرةً واحدة لطلبٍ بأقسامٍ كثيرة، وطلباتٌ متزامنة لا تكرّرها ─────────── */
await (async () => {
  let loads = 0;
  setSheetMembershipSource(async () => { loads++; await new Promise(resolve => setTimeout(resolve, 20)); return rows; });
  const many = await sheetSidesBySection([TE, MATH, TE_GIRLS, 99].map(sectionId => ({ sectionId, courseIds: input.courses.filter(course => course.sectionId === sectionId).map(course => course.id) })));
  check(loads === 1 && many.get(TE)?.[105] === "new" && many.get(TE_GIRLS)?.[301] === "new" && many.get(99) === null, "C1 أربعةُ أقسامٍ في طلبٍ واحد (‎/api/courses?operational=1&plans=1‎): قراءةٌ واحدة للعضوية", { loads });
  check((await sheetSidesFor(TE, [102]))?.[102] === "shared" && (await sheetSidesFor(MATH, [201])) === null, "C2 قسمٌ واحد بالقاعدة نفسها، وقسمٌ بلا ثنائية: null (كما كان)");
  const routes = read("src/server/planReviewRoutes.ts");
  check(/if \(membershipInflight && membershipInflight\.key === key\) return membershipInflight\.value;/.test(routes) && /const key = serviceKey\("membership"\);/.test(routes), "C3 طلباتٌ متزامنة بذاكرةٍ باردة تنتظر القراءةَ نفسها، بمفتاح عالَمها (الديمو لا يخلط بالحقيقي)");
  check(/await sheetSidesBySection\(sectionIds\.map\(/.test(read("src/server/routes/coursesRoutes.ts")) && !/sectionIds\.map\(async sid=>\{sideBySection/.test(read("src/server/routes/coursesRoutes.ts")), "C4 ‎/api/courses‎ يقرأ العضوية لكل الأقسام مرةً واحدة");
})();

console.log(`\nsheet-membership audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
