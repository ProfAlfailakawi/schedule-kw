/**
 * مسار رفع الصحيفة على مستودعٍ حقيقي بالصحيفة الحقيقية (تكنولوجيا التعليم 2026):
 * الحساب الرئيسي وحده، قسمٌ آخر يُرفض قبل أي كتابة، مقررات القسم وحدها برقمها، الاسم يُصحَّح،
 * السعة لا تُمسّ، والرفع المتكرر لا يغيّر شيئاً.
 */
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import type { AddressInfo } from "net";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, detail ?? ""); }
};

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-sheet-import-"));
  fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({
    users: [], formNames: [], formSecurity: [], collegeUserAssign: [], terms: [],
    colleges: [{ AdCollegeId: 1, AdCollegeCode: "012", AdCollegeName: "كلية التربية الأساسية - بنات" }, { AdCollegeId: 2, AdCollegeCode: "011", AdCollegeName: "كلية التربية الأساسية - بنين" }, { AdCollegeId: 3, AdCollegeCode: "012", AdCollegeName: "كلية التربية الأساسية - بنات - الجهراء" }],
    sections: [
      { AdSectionId: 21, AdCollegeId: 1, AdSectionCode: "09", AdSectionName: "قسم الوسائل التعليمية" },
      { AdSectionId: 11, AdCollegeId: 1, AdSectionCode: "01", AdSectionName: "قسم أصول التربية" },
      { AdSectionId: 13, AdCollegeId: 1, AdSectionCode: "142", AdSectionName: "قسم المواد التأسيسية" },
      { AdSectionId: 14, AdCollegeId: 2, AdSectionCode: "142", AdSectionName: "قسم تكنولوجيا التعليم" },
      { AdSectionId: 51, AdCollegeId: 1, AdSectionCode: "18", AdSectionName: "قسم اللغة الإنجليزية" },
      { AdSectionId: 52, AdCollegeId: 1, AdSectionCode: "21", AdSectionName: "قسم المناهج وطرق التدريس" },
      { AdSectionId: 53, AdCollegeId: 1, AdSectionCode: "09", AdSectionName: "قسم آخر برمز تسعة" },
      { AdSectionId: 61, AdCollegeId: 1, AdSectionCode: "24", AdSectionName: "قسم الحاسوب" },
      { AdSectionId: 71, AdCollegeId: 2, AdSectionCode: "88", AdSectionName: "قسم اسم خطأ" },
      { AdSectionId: 41, AdCollegeId: 1, AdSectionCode: "19", AdSectionName: "قسم التربية الخاصة" },
      { AdSectionId: 31, AdCollegeId: 3, AdSectionCode: "09", AdSectionName: "قسم الوسائل التعليمية" },
      { AdSectionId: 16, AdCollegeId: 2, AdSectionCode: "09", AdSectionName: "قسم تكنولوجيا التعليم" },
      { AdSectionId: 15, AdCollegeId: 2, AdSectionCode: "09", AdSectionName: "قسم تكنولوجيا التعليم" },
    ],
    instructors: [], schedules: [], rooms: [], courseTransitions: [],
    courses: [{ AdCourseId: 301, AdCollegeId: 1, AdSectionId: 21, CourseCode: "105", CourseName: "أسس تكنولوجيا التعلم", CourseCredit: 3, CourseHours: 3, MaxStudent: 60 }, { AdCourseId: 302, AdCollegeId: 1, AdSectionId: 11, CourseCode: "120", CourseName: "الإعجاز العلمي في القرآن والسنة", CourseCredit: 3, CourseHours: 3, MaxStudent: 0 }],
    curriculumPlans: [{ id: "p15", AdCollegeId: 2, AdSectionId: 15, name: "فعّالة", status: "active", createdAt: "2026-01-01" }], curriculumPlanCourses: [],
  }), { mode: 0o600 });
  process.env.NODE_ENV = "test"; process.env.DATA_MODE = "demo"; process.env.SCHEDULE_PRIVATE_DIR = dir;
  const quiet = console.warn; console.warn = () => {};
  const { Repository, initDatabase } = await import("../src/db/repository");
  /* Firestore يُرجع نسخاً لا المصفوفة الحيّة: ما قُرئ في أول الطلب لا يرى ما أُنشئ بعده. نحاكيه ليُكشف أي اعتمادٍ على مصفوفةٍ قديمة. */
  for (const key of ["getSections", "getColleges"] as const) { const real = (Repository as any)[key]; (Repository as any)[key] = async (...args: unknown[]) => [...(await real(...args))]; }
  const { registerPlanReviewRoutes } = await import("../src/server/planReviewRoutes");
  await initDatabase();
  console.warn = quiet;

  const USERS: Record<string, any> = {
    root: { user: { SystemUserId: 1, Role: "committeeChair", Name: "المدير", IsAdminUser: true }, scopes: [], permissions: [7] },
    other: { user: { SystemUserId: 2, Role: "committeeChair", Name: "مسؤول", IsAdminUser: true }, scopes: [], permissions: [7] },
  };
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { const who = USERS[String(req.headers["x-who"] || "")]; if (who) { req.user = who.user; req.scopes = who.scopes; req.permissions = who.permissions; } next(); });
  registerPlanReviewRoutes(app, {
    requireAuth: (req: any, res, next) => (req.user ? next() : res.status(401).json({ error: "سجّل الدخول" })),
    isScopeAllowed: () => true, isPowerUser: req => Boolean(req.user?.IsAdminUser), isRootAdmin: req => Number(req.user?.SystemUserId) === 1,
    hasPermission: () => true, actorName: req => String(req.user?.Name || ""),
  });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const pdf = fs.readFileSync("tests/fixtures/plans/tech-edu-2026.pdf");
  const oldPdf = fs.readFileSync("tests/fixtures/plans/tech-edu-2010.pdf");
  const upload = async (who: string, sectionId: number, body: Buffer = pdf, force = false) => {
    const res = await fetch(`${base}/api/plan-review/sheet/import?sectionId=${sectionId}${force ? "&force=1" : ""}`, { method: "POST", headers: { "content-type": "application/octet-stream", "x-who": who }, body });
    return { status: res.status, json: await res.json().catch(() => ({})) as any };
  };
  try {
    const before = JSON.stringify(await Repository.getCourses());
    check((await upload("other", 21)).status === 403, "غير الحساب الرئيسي: ٤٠٣");
    const wrongDept = await upload("root", 11);
    check(wrongDept.status === 422 && wrongDept.json.rejection?.kind === "department", "قسم آخر يُرفض", wrongDept.json);
    const foundations = await upload("root", 13);
    check(foundations.status === 422 && foundations.json.rejection?.kind === "department", "قسم اسمه ورمزه يخالفان الصحيفة يُرفض", foundations.json);
    check((await upload("root", 21, Buffer.from("not a pdf"))).status === 422, "ملفٌ ليس PDF يُرفض");
    check(JSON.stringify(await Repository.getCourses()) === before, "الرفض لم يكتب شيئاً");

    const wrongManualCode = await upload("root", 14);
    check(wrongManualCode.status === 200 && wrongManualCode.json.recoded?.before === "142" && wrongManualCode.json.recoded?.after === "09" && (await Repository.getSections()).find(row => Number(row.AdSectionId) === 14)?.AdSectionCode === "09", "رمزٌ كُتب يدوياً خطأً واسمه يطابق: يُقبل ويُصحَّح إلى رمز الصحيفة", wrongManualCode.json);

    const first = await upload("root", 21);
    check(first.json.sites === 2, "الصحيفة للمسار كله: بنات الرئيسي والجهراء معاً", first.json.sites);
    check(first.status === 200 && first.json.ok === true, "الرفع يُقبل للقسم الصحيح", first.json);
    check(first.json.renamed?.after === "قسم تكنولوجيا التعليم" && (await Repository.getSections()).find(row => Number(row.AdSectionId) === 21)?.AdSectionName === "قسم تكنولوجيا التعليم", "اسم القسم أُخذ من الصحيفة بنمط «قسم …»", first.json.renamed);
    const jahra = (await Repository.getCourses()).filter(row => Number(row.AdSectionId) === 31);
    check(jahra.length === 27 && (await Repository.getCurriculumPlans(31)).some(plan => plan.status === "active") && (await Repository.getSections()).find(row => Number(row.AdSectionId) === 31)?.AdSectionName === "قسم تكنولوجيا التعليم", "موقع الجهراء نال المقررات والصحيفة والتسمية نفسها");
    /* اسمٌ واحد للصحيفة الفعّالة في كل المواقع، ويُصحَّح اسمٌ قديم عند إعادة الرفع */
    const activeName = async (sid: number) => (await Repository.getCurriculumPlans(sid)).find(plan => plan.status === "active" && !plan.track)?.name;
    check(await activeName(21) === "صحيفة 2026/2027" && await activeName(31) === "صحيفة 2026/2027", "اسم الصحيفة الفعّالة «صحيفة 2026/2027» في كل المواقع", [await activeName(21), await activeName(31)]);
    const jahraPlan = (await Repository.getCurriculumPlans(31)).find(plan => plan.status === "active")!;
    await Repository.patchCurriculumPlan(jahraPlan.id, 31, { name: "صحيفة BA-0115 2026/2027" });
    await upload("root", 21);
    check(await activeName(31) === "صحيفة 2026/2027", "إعادة الرفع توحّد اسماً قديماً");
    const courses = (await Repository.getCourses()).filter(row => Number(row.AdSectionId) === 21);
    check(courses.length === 27, `٢٧ مقرراً للقسم (${courses.length})`);
    check(courses.every(row => /^\d{2,3}$/.test(String(row.CourseCode))), "الرموز المحفوظة رقم المقرر وحده");
    const c105 = courses.find(row => row.CourseCode === "105")!;
    check(c105.CourseName !== "أسس تكنولوجيا التعلم" && c105.MaxStudent === 60, `الاسم صُحّح من الصحيفة والسعة بقيت ٦٠ (${c105.CourseName})`);
    check(courses.filter(row => row.CourseCode !== "105").every(row => Number(row.MaxStudent) === 0), "السعة لم تُوضع للجدد");
    check(first.json.created === 53 && first.json.updated === 1, `جديد ٢٦ في الرئيسي و٢٧ في الجهراء، ومصحَّح ١ (${first.json.created}/${first.json.updated})`);
    check(first.json.otherDepartments === 37, `مقررات الأقسام الأخرى لم تُؤخذ (${first.json.otherDepartments})`);
    check(Array.isArray(first.json.noDepartment) && first.json.noDepartment.every((item: string) => /^\d{4}×\d+$/.test(item)), "قسمٌ غير موجود بالنظام يُذكر برمزه في التقرير", first.json.noDepartment);
    const plans = await Repository.getCurriculumPlans(21);
    check(plans.some(plan => plan.status === "active") && plans.some(plan => plan.code === "LEGACY"), "صحيفة فعّالة جديدة و«السابقة» محفوظة");
    const links = (await Repository.getCurriculumPlanCourses(21)).filter(link => link.planId === first.json.planId);
    check(links.length === 27, `٢٧ مقرراً في الصحيفة (${links.length})`);
    const draft = await Repository.getRuleSet(first.json.planId).catch(() => undefined);
    const drafts = await Repository.listRuleDrafts();
    const mine = drafts.find(row => row.planId === first.json.planId);
    check(!!mine && mine.status === "review" && mine.rules.length === 28, `مسوّدة قواعد بـ٢٧ قاعدة وقاعدة المقرر الخارجي للمراجعة (${mine?.rules.length})`);
    void draft;
    /* مقررات الأقسام الأخرى في المجموعة الاختيارية: الموجود في الكتالوج يدخلها خارجياً بلا أي كتابة في قسمه، وغير الموجود وحداتٌ معلّقة. */
    const foreignGroup = mine?.groups.find(group => group.id === "y2026-s1g3");
    check(!!foreignGroup && foreignGroup.courseIds.includes(302) && foreignGroup.pendingUnits === 30, "المجموعة الاختيارية تضمّ مقرر القسم الآخر الموجود وتحصي الباقي وحداتٍ معلّقة", foreignGroup);
    check(!!mine?.externals?.includes(302) && (await Repository.getCourses()).filter(row => Number(row.AdSectionId) === 11).length === 1, "المقرر الخارجي مقفولٌ للقراءة وقسمه لم يُكتب فيه");
    check(!(await Repository.listRuleDrafts()).find(row => row.planId === first.json.planId)!.groups.some(group => group.courseIds.some(id => (mine!.groups.filter(other => other.id !== group.id).some(other => other.courseIds.includes(id))))), "لا مقرر في مجموعتين");

    const second = await upload("root", 21);
    check(second.status === 200 && second.json.created === 0 && second.json.updated === 0 && second.json.linked === 0 && second.json.planCreated === false && second.json.renamed === null, "الرفع المتكرر لا يغيّر شيئاً", second.json);
    check((await Repository.getCurriculumPlans(21)).length === plans.length, "لا صحيفة جديدة عند التكرار");

    /* ── الصحيفة القديمة: «السابقة» وحدها، لا تمسّ الفعّالة ولا ما صُحِّح من المقررات ── */
    const namesBefore = new Map((await Repository.getCourses()).filter(row => Number(row.AdSectionId) === 21).map(row => [row.AdCourseId, `${row.CourseName}|${row.CourseCredit}|${row.CourseHours}`] as const));
    const activeLinksBefore = (await Repository.getCurriculumPlanCourses(21)).filter(link => link.planId === first.json.planId).length;
    const legacy = await upload("root", 21, oldPdf);
    check(legacy.status === 200 && legacy.json.era === "old" && legacy.json.planName === "الصحيفة السابقة" && legacy.json.planId !== first.json.planId, "القديمة تدخل «الصحيفة السابقة» لا الفعّالة", legacy.json);
    check(legacy.json.updated === 0 && legacy.json.renamed === null && legacy.json.recoded === null, "القديمة لا تعدّل مقرراً قائماً ولا تسمّي القسم");
    const afterCourses = (await Repository.getCourses()).filter(row => Number(row.AdSectionId) === 21);
    check([...namesBefore].every(([id, text]) => { const row = afterCourses.find(item => item.AdCourseId === id)!; return `${row.CourseName}|${row.CourseCredit}|${row.CourseHours}` === text; }), "أسماء ووحدات المقررات القائمة كما صحّحتها الجديدة");
    check((await Repository.getCurriculumPlanCourses(21)).filter(link => link.planId === first.json.planId).length === activeLinksBefore, "الصحيفة الفعّالة لم تتغيّر");
    check((await Repository.getCurriculumPlanCourses(21)).filter(link => link.planId === legacy.json.planId).length >= 29, "مقررات القديمة (٢٩) في «السابقة»");
    /* القديمة تصحّح مقرراً ليس في الفعّالة (اسمه ووحداته)، ولا تنقض ما في الفعّالة */
    const linksNow = await Repository.getCurriculumPlanCourses(21);
    const activeIds = new Set(linksNow.filter(link => link.planId === first.json.planId).map(link => Number(link.AdCourseId)));
    const oldOnly = afterCourses.find(row => !activeIds.has(Number(row.AdCourseId)) && linksNow.some(link => link.planId === legacy.json.planId && Number(link.AdCourseId) === Number(row.AdCourseId)))!;
    const shared = afterCourses.find(row => activeIds.has(Number(row.AdCourseId)))!;
    await Repository.updateCourse(oldOnly.AdCourseId, oldOnly.AdCollegeId, oldOnly.AdSectionId, oldOnly.CourseCode, "اسم خطأ", 1, 1, 33);
    await Repository.updateCourse(shared.AdCourseId, shared.AdCollegeId, shared.AdSectionId, shared.CourseCode, "اسم مختلف", shared.CourseCredit, shared.CourseHours, shared.MaxStudent);
    const legacyAgain = await upload("root", 21, oldPdf);
    const nowCourses = await Repository.getCourses();
    const oldOnlyNow = nowCourses.find(row => row.AdCourseId === oldOnly.AdCourseId)!, sharedNow = nowCourses.find(row => row.AdCourseId === shared.AdCourseId)!;
    check(legacyAgain.status === 200 && oldOnlyNow.CourseName === oldOnly.CourseName && oldOnlyNow.CourseCredit === oldOnly.CourseCredit && oldOnlyNow.MaxStudent === 33 && sharedNow.CourseName === "اسم مختلف", "القديمة تصحّح مقرراً ليس في الفعّالة (والسعة كما هي) ولا تنقض ما في الفعّالة", [oldOnlyNow, sharedNow]);
    await Repository.updateCourse(shared.AdCourseId, shared.AdCollegeId, shared.AdSectionId, shared.CourseCode, shared.CourseName, shared.CourseCredit, shared.CourseHours, shared.MaxStudent);
    const sound = afterCourses.filter(row => row.CourseName === "تكنولوجيا الصوت");
    check(sound.length === 2 && new Set(sound.map(row => row.CourseCode)).size === 2, "المقرر نفسه برقمين (قديم وجديد): سجلان باسمٍ مكرر ورقمين مختلفين، لا دمج بالاسم", sound.map(row => row.CourseCode));
    check(new Set(afterCourses.map(row => Number(row.CourseCode))).size === afterCourses.length, "لا رقمَ يتكرر في القسم");
    /* قسمٌ بلا أي صحيفة (حال بقية الأقسام): القديمة أولاً ثم الجديدة، كلٌّ في صحيفتها */
    const oldFirst = await upload("root", 16, oldPdf);
    check(oldFirst.status === 200 && oldFirst.json.era === "old" && oldFirst.json.planName === "الصحيفة السابقة", "قسم بلا صحائف: القديمة أولاً تدخل «السابقة»", oldFirst.json);
    const newAfter = await upload("root", 16);
    check(newAfter.status === 200 && newAfter.json.era === "new" && newAfter.json.planId !== oldFirst.json.planId && newAfter.json.planCreated === false, "ثم الجديدة تدخل الفعّالة (أُنشئت مع السابقة)", newAfter.json);
    const plans16 = (await Repository.getCurriculumPlans(16)).filter(plan => !plan.virtual);
    check(plans16.length === 2 && plans16.some(plan => plan.status === "active") && plans16.some(plan => plan.status === "transition"), "صحيفتان للقسم: فعّالة وسابقة");
    const orderless = await upload("root", 15, oldPdf);
    check(orderless.status === 422 && orderless.json.rejection?.kind === "order", "قسم فعّالته وحدها: القديمة تُرفض (ارفع القديمة قبل الجديدة)", orderless.json);

    /* بلا قسمٍ مختار: تُوجَّه الصحيفة إلى الأقسام التي يطابق اسمُها قسمَها، ولا قسمَ بالاسم: رفضٌ بلا كتابة */
    const auto = await upload("root", 0, pdf);
    check(auto.status === 200 && auto.json.auto === true && auto.json.tracks >= 2, "رفع تلقائي: الصحيفة تصل أقسامها كلها باسمها", auto.json);
    const beforeMath = JSON.stringify(await Repository.getCourses());
    const mathMissing = await upload("root", 0, fs.readFileSync("tests/fixtures/plans/graduation-2026/ba-0105.pdf"));
    check(mathMissing.status === 422 && mathMissing.json.rejection?.kind === "department" && JSON.stringify(await Repository.getCourses()) === beforeMath, "رفع تلقائي: قسم الرياضيات غير موجود يُرفض بلا كتابة", mathMissing.json);

    /* التربية الخاصة: قسمٌ واحد ومقرراتٌ مشتركة، ولكل مسارٍ صحيفتاه (جديدة وسابقة) بلا إزاحة الثنائية الرئيسية */
    const trackA = await upload("root", 41, fs.readFileSync("tests/fixtures/plans/graduation-old/ba-012102-2010.pdf"));
    check(trackA.status === 200 && /السابقة$/.test(trackA.json.planName) && trackA.json.planName.includes("اعاقة سمعية"), "مسار التربية الخاصة الأول يدخل صحيفته السابقة", trackA.json);
    const trackB = await upload("root", 41, fs.readFileSync("tests/fixtures/plans/graduation-old/ba-012402-2010.pdf"));
    check(trackB.status === 200 && trackB.json.planId !== trackA.json.planId, "المسار الثاني صحيفةٌ أخرى", trackB.json);
    const plans41 = await Repository.getCurriculumPlans(41);
    check(plans41.length === 4 && plans41.every(plan => plan.track) && new Set(plans41.map(plan => plan.track)).size === 2 && plans41.filter(plan => plan.status === "active").length === 2 && plans41.filter(plan => plan.status === "transition").length === 2, "لكل مسارٍ جديدةٌ وسابقة", plans41.map(plan => `${plan.track}/${plan.status}`));
    const courses41 = (await Repository.getCourses()).filter(row => Number(row.AdSectionId) === 41);
    check(new Set(courses41.map(row => Number(row.CourseCode))).size === courses41.length, "مقررات القسم مشتركة بلا تكرار رقم");
    const links41 = await Repository.getCurriculumPlanCourses(41);
    const linked = (planId: string) => links41.filter(link => link.planId === planId).length;
    check(linked(trackA.json.planId) === 17 && linked(trackB.json.planId) === 17 && courses41.length < 34, `مسارٌ بـ١٧ مقرراً ومشتركٌ بينهما (${courses41.length} مقرراً للقسم)`, [linked(trackA.json.planId), linked(trackB.json.planId), courses41.length]);
    await upload("root", 41, fs.readFileSync("tests/fixtures/plans/graduation-old/ba-012102-2010.pdf"));
    check((await Repository.getCurriculumPlans(41)).length === 4, "إعادة رفع المسار لا تنشئ صحائف");
    await Repository.createCurriculumPlan({ collegeId: 1, sectionId: 41, name: "الصحيفة الجديدة", by: "test" });
    const after41 = await Repository.getCurriculumPlans(41);
    check(after41.filter(plan => plan.track).every(plan => plans41.find(old => old.id === plan.id)?.status === plan.status) && after41.filter(plan => !plan.track).length === 2, "صحيفةٌ رئيسية جديدة للقسم لا تزيح المسارات", after41.map(plan => `${plan.track || "-"}/${plan.status}`));

    /* المسبقات: مسبقٌ لمقررِ قسمٍ آخر لم يُرفع بعد يُعدّ ولا يضيع، ثم يُربط حين يوجد المقرر بإعادة الرفع */
    const english = fs.readFileSync("tests/fixtures/plans/graduation-2026/ba-0116.pdf");
    const beforeEnglish = (() => { const map = new Map<number, number>(); return map; })();
    for (const row of await Repository.getCourses()) beforeEnglish.set(Number(row.AdSectionId), (beforeEnglish.get(Number(row.AdSectionId)) || 0) + 1);
    const firstEnglish = await upload("root", 51, english);
    const perSection = (rows: Array<{ AdSectionId: number }>) => { const map = new Map<number, number>(); for (const row of rows) map.set(Number(row.AdSectionId), (map.get(Number(row.AdSectionId)) || 0) + 1); return map; };
    check(firstEnglish.status === 200 && firstEnglish.json.addedOther === 0 && firstEnglish.json.unlinked === 2 && firstEnglish.json.unresolved.length === 2, "مقررات الأقسام الأخرى لا تُضاف تلقائياً: مسبقاتها تُعدّ ولا تُربط", firstEnglish.json);
    check(Array.isArray(firstEnglish.json.foreignNotAdded) && firstEnglish.json.foreignNotAdded.length > 0, "رموز الأقسام الأخرى المطبوعة تُذكر في التقرير ولا يُكتب فيها شيء", firstEnglish.json.foreignNotAdded);
    const afterEnglish = perSection(await Repository.getCourses() as any);
    check([...afterEnglish].every(([sectionId, count]) => [51].includes(sectionId) || count === (beforeEnglish.get(sectionId) || 0)), "لم يُكتب مقررٌ في قسمٍ غير قسم الصحيفة (وحدة الكهرباء لم تتلقَّ مقررات أصول التربية)", [...afterEnglish]);
    await Repository.createCourse(1, 52, "322", "مقرر المناهج", 3, 3, 0, false);
    await Repository.createCourse(1, 53, "425", "مقرر آخر", 3, 3, 0, false);
    const depA = (await Repository.getCourses()).find(row => Number(row.AdSectionId) === 52 && String(row.CourseCode) === "322");
    const depB = (await Repository.getCourses()).find(row => Number(row.AdSectionId) === 53 && String(row.CourseCode) === "425");
    const secondEnglish = await upload("root", 51, english);
    check(secondEnglish.status === 200 && secondEnglish.json.unlinked === 0 && secondEnglish.json.prereqLinked === secondEnglish.json.prereqPrinted, "بعد وجود المقررين (أضافهما المسؤول): كل المسبقات تُربط", secondEnglish.json);
    const englishDraft = (await Repository.listRuleDrafts()).find(row => row.planId === secondEnglish.json.planId);
    const needy = (await Repository.getCourses()).find(row => Number(row.AdSectionId) === 51 && String(row.CourseCode) === "454");
    const rule = englishDraft?.rules.find(item => item.courseId === Number(needy?.AdCourseId));
    check(Boolean(rule?.prereq?.all?.includes(Number(depA?.AdCourseId)) && rule?.prereq?.all?.includes(Number(depB?.AdCourseId))), "المسبقان من القسمين الآخرين يظهران في قاعدة المقرر", rule);

    /* الرفع التلقائي: اسمٌ مختلف («الحاسوب» و«معلم الحاسب») ورمز الهيئة نفسه (0124) يكفي، ويُسمّى القسم من الصحيفة */
    const computer = await upload("root", 0, fs.readFileSync("tests/fixtures/plans/graduation-2026/ba-0136.pdf"));
    check(computer.status === 200 && computer.json.auto === true && (await Repository.getSections()).find(row => Number(row.AdSectionId) === 61)?.AdSectionName === "قسم معلم الحاسب", "تلقائي: اسمٌ مختلف ورمز الهيئة واحد يُقبل ويُسمّى القسم من الصحيفة", computer.json);

    /* اسمٌ ورمزٌ خطأ معاً: يُرفض بالمقارنة، ويُقبل بعد أن يختار المسؤول القسم صراحةً (والكلية تبقى شرطاً) فيُصحَّح اسمه ورمزه */
    const bothWrong = await upload("root", 71);
    check(bothWrong.status === 422 && bothWrong.json.rejection?.kind === "department", "اسمٌ ورمزٌ خطأ معاً: يُرفض ويُعرض الاختلاف", bothWrong.json);
    const forced = await upload("root", 71, pdf, true);
    const fixed = (await Repository.getSections()).find(row => Number(row.AdSectionId) === 71);
    check(forced.status === 200 && fixed?.AdSectionName === "قسم تكنولوجيا التعليم" && fixed?.AdSectionCode === "09", "رفعٌ صريح: الاسم والرمز يُصحَّحان من الصحيفة", forced.json);
    check((await upload("root", 71, fs.readFileSync("tests/fixtures/plans/graduation-2026/ba-0105.pdf"), true)).status === 200, "الرفع الصريح يقبل أي صحيفةٍ للقسم المختار صراحةً (قراره للمسؤول)");
    check((await Repository.getSections()).find(row => Number(row.AdSectionId) === 41)?.AdSectionName === "قسم التربية الخاصة", "التربية الخاصة لا تُسمّى «علم النفس» من ترويسة صحيفتها");

    /* إنهاء الصحيفة السابقة لقسمٍ: الجدول يعرض الجديدة وحدها، والتراجع يعيدها */
    const call = async (who: string, method: string, url: string, body?: unknown) => { const res = await fetch(`${base}${url}`, { method, headers: { "content-type": "application/json", "x-who": who }, body: body ? JSON.stringify(body) : undefined }); return { status: res.status, json: await res.json().catch(() => ({})) as any }; };
    const listedBefore = await call("root", "GET", "/api/plan-review/previous-plans");
    check(listedBefore.json.rows.find((row: any) => row.sectionId === 21)?.state === "running" && (await call("other", "GET", "/api/plan-review/previous-plans")).status === 403, "قائمة الأقسام: السابقة جارية، وللحساب الرئيسي وحده", listedBefore.json.rows);
    const operationalBefore = await Repository.getOperationalCourseIds(21);
    const ended = await call("root", "POST", "/api/plan-review/previous-plans", { action: "end", sectionIds: [21] });
    const plans21 = await Repository.getCurriculumPlans(21), plans31 = await Repository.getCurriculumPlans(31);
    check(ended.status === 200 && ended.json.changed === 1 && !plans21.some(plan => plan.status === "transition") && !plans31.some(plan => plan.status === "transition") && plans21.some(plan => plan.status === "active"), "«انتهوا» تؤرشف السابقة في المسار كله وتُبقي الفعّالة", ended.json);
    const pickerEnded = await call("root", "GET", "/api/plan-review/previous-ended?sectionId=21");
    const operationalAfter = await Repository.getOperationalCourseIds(21);
    check(pickerEnded.json.ended === true && operationalAfter.size < operationalBefore.size && pickerEnded.json.courseIds.length === operationalAfter.size && (await call("root", "GET", "/api/plan-review/previous-ended?sectionId=11")).json.ended === false, "منتقي الجدول: مقررات الجديدة وحدها لقسمٍ أُنهي، وغيره كما هو", [operationalBefore.size, operationalAfter.size]);
    check((await call("other", "POST", "/api/plan-review/previous-plans", { action: "end", sectionIds: [21] })).status === 403, "الإنهاء للحساب الرئيسي وحده");
    const restored = await call("root", "POST", "/api/plan-review/previous-plans", { action: "restore", sectionIds: [21] });
    check(restored.json.changed === 1 && (await Repository.getCurriculumPlans(21)).some(plan => plan.status === "transition") && (await Repository.getOperationalCourseIds(21)).size === operationalBefore.size && (await call("root", "GET", "/api/plan-review/previous-ended?sectionId=21")).json.ended === false, "«أعد السابقة» تتراجع كلياً", restored.json);

    /* «الجديدة» الفارغة (لم تُرفع صحيفتها) لا تُنهي السابقة: وإلا اختفت مقررات القسم كلها */
    {
      const guarded = await Repository.createSection(3, "94", "قسم اختبار الإنهاء");
      await Repository.createCurriculumPlan({ collegeId: 3, sectionId: Number(guarded.AdSectionId), name: "قديمة", code: "OLD-G", by: "t" } as any);
      await Repository.createCourse(3, Number(guarded.AdSectionId), "801", "مقررٌ قديم", 3, 3, 0);
      await Repository.createCurriculumPlan({ collegeId: 3, sectionId: Number(guarded.AdSectionId), name: "جديدة فارغة", code: "NEW-G", by: "t" } as any);
      const gid = Number(guarded.AdSectionId);
      const row = (await call("root", "GET", "/api/plan-review/previous-plans")).json.rows.find((item: any) => item.sectionId === gid);
      const refused = await call("root", "POST", "/api/plan-review/previous-plans", { action: "end", sectionIds: [gid] });
      const stillThere = (await Repository.getCurriculumPlans(gid)).some(plan => plan.status === "transition");
      check(row?.hasNew === false && refused.json.changed === 0 && stillThere, "جديدةٌ فارغة: لا تُنهى السابقة ولا يُعرض القسم قابلاً للإنهاء", { row, refused: refused.json });
      await Repository.createCourse(3, gid, "802", "مقررٌ جديد", 3, 3, 0);
      const ok = await call("root", "POST", "/api/plan-review/previous-plans", { action: "end", sectionIds: [gid] });
      check(ok.json.changed === 1 && !(await Repository.getCurriculumPlans(gid)).some(plan => plan.status === "transition"), "جديدةٌ فيها مقررات: تُنهى السابقة");
    }

    /* اعتماد كل الصحائف: معاينةٌ بالجاهز والمحجوب، والتنفيذ للجاهز وحده وللرئيسي وحده */
    {
      const callA = async (who: string, method: string, url: string, body?: unknown) => { const res = await fetch(`${base}${url}`, { method, headers: { "content-type": "application/json", "x-who": who }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: res.status, json: await res.json().catch(() => ({})) as any }; };
      check((await callA("other", "GET", "/api/plan-review/approve-all")).status === 403 && (await callA("other", "POST", "/api/plan-review/approve-all")).status === 403, "اعتماد الكل للحساب الرئيسي وحده");
      const draftsBefore = ((await Repository.listRuleDrafts()) as any[]).filter(draft => draft.status === "review").length;
      /* مجموعةٌ قديمة تكرّر مقرراً في مجموعتين (تراكمُ رفعٍ سابق): يُصلحها الاعتماد بإبقاء المقرر في الأولى ولا تمنع */
      const dupPlan = first.json.planId as string;
      await Repository.updateRuleDraft(dupPlan, current => { const kept = current!.groups.find(group => group.id === "y2026-s2g2")!; return { ...current!, status: "review", groups: [...current!.groups, { id: "stale-1", name: "قديمة", minCourses: 0, minUnits: 0, courseIds: kept.courseIds.slice(0, 2) }], updatedAt: new Date().toISOString() }; });
      const preview = await callA("root", "GET", "/api/plan-review/approve-all");
      check(preview.status === 200 && preview.json.ready.length + preview.json.blocked.length === draftsBefore && ((await Repository.listRuleDrafts()) as any[]).filter(draft => draft.status === "review").length === draftsBefore, "المعاينة: الجاهز والمحجوب يساويان المسوّدات، ولا تكتب شيئاً", { ready: preview.json.ready?.length, blocked: preview.json.blocked?.length, draftsBefore });
      check((await callA("root", "POST", "/api/plan-review/approve-all")).status === 400, "التنفيذ بلا معاينة يُرفض");
      console.log("BLOCKED", JSON.stringify(preview.json.blocked, null, 1));
      const done = await callA("root", "POST", "/api/plan-review/approve-all", { items: preview.json.ready.map((item: any) => ({ planId: item.planId, updatedAt: item.updatedAt })) });
      const left = ((await Repository.listRuleDrafts()) as any[]).filter(draft => draft.status === "review").length;
      check(done.status === 200 && preview.json.ready.length > 0 && done.json.approved === preview.json.ready.length && left === preview.json.blocked.length, "التنفيذ يعتمد الجاهز وحده ويُبقي المحجوب", { approved: done.json.approved, ready: preview.json.ready.length, left, blocked: preview.json.blocked.length });
      check(preview.json.ready.some((item: any) => item.planId === dupPlan && item.repaired === true), "المكرَّر بين مجموعتين جاهزٌ للاعتماد بعد إصلاحٍ آلي", preview.json.blocked?.find((item: any) => item.planId === dupPlan));
      const approvedSet = await Repository.getRuleSet(dupPlan);
      check(!!approvedSet && !approvedSet.groups.some(group => group.id === "stale-1") && approvedSet.groups.some(group => group.id === "y2026-s2g2"), "اعتُمدت بلا المجموعة المكرِّرة وبقيت مجموعة الصحيفة", approvedSet?.groups);
    }

    /* المقررات المكررة: رفعٌ قديم برمزٍ كامل ثم رفعٌ جديد برمزٍ قصير؛ يبقى المربوط بالصحيفة ويُحذف غير المستعمل، والمستعمل يُترك */
    {
      const getJson = async (who: string, url: string, body?: unknown) => { const res = await fetch(`${base}${url}`, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", "x-who": who }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: res.status, json: await res.json().catch(() => ({})) as any }; };
      const keeperRow = (await Repository.getCourses()).find(row => Number(row.AdSectionId) === 21 && row.CourseCode === "105")!;
      const dupFree = await Repository.createCourse(1, 21, "0109105", keeperRow.CourseName, 3, 3, 0, false);
      const dupUsed = await Repository.createCourse(1, 21, "0109108", "أخلاقيات استخدام التكنولوجيا", 3, 3, 40, false);
      const original108 = (await Repository.getCourses()).find(row => Number(row.AdSectionId) === 21 && row.CourseCode === "108");
      check((await getJson("other", "/api/plan-review/sheet/duplicates")).status === 403, "فحص المكرر للحساب الرئيسي وحده");
      const found = await getJson("root", "/api/plan-review/sheet/duplicates");
      const sec = found.json.sections?.find((row: any) => row.sectionId === 21);
      const g105 = sec?.groups.find((group: any) => group.number === 105);
      check(!!g105 && g105.keeper.id === keeperRow.AdCourseId && g105.dups.length === 1 && g105.dups[0].id === dupFree.AdCourseId && g105.dups[0].removable === true, "يُعرض المكرر غير المستعمل للحذف ويبقى المربوط بالصحيفة", g105);
      const g108 = sec?.groups.find((group: any) => group.number === 108);
      check(!!g108 && g108.keeper.id === original108!.AdCourseId && g108.dups.length === 1 && g108.dups[0].id === dupUsed.AdCourseId && g108.dups[0].removable === false, "كلاهما مستعمل (سعةٌ وربطٌ بصحيفة): لا يُعرض شيءٌ للحذف", g108);
      const del = await getJson("root", "/api/plan-review/sheet/duplicates/delete", { ids: [dupFree.AdCourseId, dupUsed.AdCourseId] });
      const left = (await Repository.getCourses()).filter(row => Number(row.AdSectionId) === 21);
      check(del.json.deleted === 1 && !left.some(row => row.AdCourseId === dupFree.AdCourseId) && left.some(row => row.AdCourseId === keeperRow.AdCourseId) && left.some(row => row.AdCourseId === dupUsed.AdCourseId) && left.some(row => row.AdCourseId === original108!.AdCourseId), "الحذف يزيل غير المستعمل وحده ويُبقي المستعمل والأصل", del.json);
      for (const row of (await Repository.getCourses()).filter(item => Number(item.AdSectionId) === 21 && item.CourseCode === "0109108")) await Repository.deleteCourse(row.AdCourseId);
    }

    /* مقررات الأقسام الخدمية: تجميعٌ بالرمز، معاينةٌ بلا كتابة، ثم إنشاءٌ برمزٍ كامل في كل كليات القسم المختار؛ والموجود لا يتكرر */
    {
      const call2 = async (who: string, url: string, body: unknown) => { const res = await fetch(`${base}${url}`, { method: "POST", headers: { "content-type": "application/json", "x-who": who }, body: JSON.stringify(body) }); return { status: res.status, json: await res.json().catch(() => ({})) as any }; };
      const list = [{ key: "0150101", name: "مقرر خدمي أول", units: 3, hours: 3 }, { key: "0150102", name: "مقرر خدمي ثان", units: 1, hours: 1 }, { key: "0109999", name: "مقرر قسمٍ له صحيفة", units: 3, hours: 3 }];
      check((await call2("other", "/api/plan-review/service-courses/groups", { courses: list })).status === 403, "المقررات الخدمية للحساب الرئيسي وحده");
      const groups = await call2("root", "/api/plan-review/service-courses/groups", { courses: list });
      check(groups.json.groups?.length === 1 && groups.json.groups[0].deptKey === "0150" && groups.json.groups[0].courses.length === 2, "التجميع: رمز القسم بلا صحيفة وحده", groups.json);
      const refused = await call2("root", "/api/plan-review/service-courses/apply", { courses: list, assignments: [{ deptKey: "0109", sectionId: 21 }], dryRun: false });
      check(refused.status === 422, "قسمٌ له صحيفة يُرفض");
      const countBefore = (await Repository.getCourses()).length;
      const dry = await call2("root", "/api/plan-review/service-courses/apply", { courses: list, assignments: [{ deptKey: "0150", sectionId: 21 }] });
      check(dry.json.dryRun === true && dry.json.created === 6 && (await Repository.getCourses()).length === countBefore, "المعاينة: ٢ مقرر × ٣ كليات ولا تكتب", dry.json);
      const made = await call2("root", "/api/plan-review/service-courses/apply", { courses: list, assignments: [{ deptKey: "0150", sectionId: 21 }], dryRun: false });
      const created = (await Repository.getCourses()).filter(row => /^015010[12]$/.test(String(row.CourseCode)));
      check(made.json.created === 6 && created.length === 6 && new Set(created.map(row => row.AdCollegeId)).size === 3 && created.every(row => Number(row.MaxStudent) === 0), "الإنشاء: برمزٍ كامل في كل كلية وبسعة صفر", made.json);
      const again = await call2("root", "/api/plan-review/service-courses/apply", { courses: list, assignments: [{ deptKey: "0150", sectionId: 21 }], dryRun: false });
      check(again.json.created === 0 && again.json.report?.[0]?.existing === 6, "التكرار لا يضاعف شيئاً", again.json);
      /* مقررٌ بعينه يتبع قسماً غير قسم رمزه (رمزٌ يجمع أصولاً ومناهج) */
      const mixed = [{ key: "0151101", name: "مقرر تابع للرمز", units: 3, hours: 3 }, { key: "0151102", name: "مقرر تابع لقسمٍ آخر", units: 3, hours: 3 }];
      const split = await call2("root", "/api/plan-review/service-courses/apply", { courses: mixed, assignments: [{ deptKey: "0151", sectionId: 21 }], overrides: { "0151102": 11 }, dryRun: false });
      const placed = (await Repository.getCourses()).filter(row => /^015110[12]$/.test(String(row.CourseCode)));
      check(split.json.created === 4 && placed.filter(row => row.CourseCode === "0151101").length === 3 && placed.filter(row => row.CourseCode === "0151102").length === 1 && placed.find(row => row.CourseCode === "0151102")!.AdSectionId === 11, "مقررٌ بعينه يتبع قسمه المختار لا قسم رمزه", split.json);
      /* وُضع في قسمٍ خطأ: لا يُنقل بلا طلب، ويُنقل بالطلب لأنه لم يُستعمل */
      const stay = await call2("root", "/api/plan-review/service-courses/apply", { courses: mixed, assignments: [], overrides: { "0151102": 21 }, dryRun: false });
      check(stay.json.created === 2 && (await Repository.getCourses()).some(row => row.CourseCode === "0151102" && row.AdSectionId === 11), "بلا «انقل» يبقى حيث هو ولا يتكرر", stay.json);
      const moved = await call2("root", "/api/plan-review/service-courses/apply", { courses: mixed, assignments: [], overrides: { "0151102": 21 }, relocate: true, dryRun: false });
      const afterMove = (await Repository.getCourses()).filter(row => row.CourseCode === "0151102");
      check(moved.json.created === 1 && afterMove.length === 3 && !afterMove.some(row => row.AdSectionId === 11), "«انقل»: يُنقل من القسم الخطأ إلى المختار ولا يتكرر", moved.json);
    }

    /* تصحيح مقررات الأقسام الأخرى معطَّل حتى تُؤكَّد رموز الأقسام: المسار يرفض ولا يكتب */
    const reconcileCall = (who: string, courses: unknown[]) => call(who, "POST", "/api/plan-review/sheet/reconcile", { courses });
    const coursesBeforeReconcile = JSON.stringify(await Repository.getCourses());
    check((await reconcileCall("root", [{ key: "0121322", name: "اسم", units: 1, hours: 1 }])).status === 409 && (await reconcileCall("other", [])).status === 403 && JSON.stringify(await Repository.getCourses()) === coursesBeforeReconcile, "تصحيح مقررات الأقسام الأخرى معطَّل: لا يكتب");
    const scanEnglish = await fetch(`${base}/api/plan-review/sheet/scan`, { method: "POST", headers: { "content-type": "application/octet-stream", "x-who": "root" }, body: english }).then(res => res.json()) as any;
    check(Array.isArray(scanEnglish.others) && scanEnglish.others.length > 5 && scanEnglish.others.every((item: any[]) => item.length === 4 && /^\d{7}$/.test(String(item[0]))), "قراءة الترويسة تعيد مقررات الأقسام الأخرى للتجميع", scanEnglish.others?.slice(0, 2));

    /* تدوير الصحيفة: صحيفةٌ أحدث من سنة الفعّالة تصير الفعّالة وتنتقل القائمة إلى «السابقة»، بعد إنهاء السابقة الجارية */
    const active21 = (await Repository.getCurriculumPlans(21)).find(plan => plan.status === "active" && !plan.track)!;
    check(active21.sheetYear === 2026, "سنة الصحيفة محفوظة عند الرفع", active21.sheetYear);
    await Repository.patchCurriculumPlan(active21.id, 21, { sheetYear: 2020 });
    const plansBeforeRoll = (await Repository.getCurriculumPlans(21)).length;
    const blocked = await upload("root", 21);
    check(blocked.status === 422 && blocked.json.rejection?.kind === "previous" && (await Repository.getCurriculumPlans(21)).length === plansBeforeRoll, "صحيفةٌ أحدث مع سابقة جارية: تُرفض بلا كتابة", blocked.json);
    await call("root", "POST", "/api/plan-review/previous-plans", { action: "end", sectionIds: [21] });
    const rolled = await upload("root", 21);
    const afterRoll = await Repository.getCurriculumPlans(21);
    const newActive = afterRoll.find(plan => plan.status === "active" && !plan.track)!;
    check(rolled.status === 200 && rolled.json.rollover === true && rolled.json.planCreated === true && newActive.id !== active21.id && newActive.sheetYear === 2026 && afterRoll.find(plan => plan.id === active21.id)?.status === "transition", "التدوير: فعّالةٌ جديدة، والقائمة تنتقل إلى «السابقة»", rolled.json);
    check(afterRoll.filter(plan => plan.status === "active" && !plan.track).length === 1 && (await Repository.getCurriculumPlanCourses(21)).filter(link => link.planId === newActive.id).length === 27 && (await Repository.getCurriculumPlanCourses(21)).filter(link => link.planId === active21.id).length > 0, "مقررات الجديدة في الفعّالة، والسابقة تحتفظ بمقرراتها");
    check((await Repository.getCurriculumPlans(31)).filter(plan => plan.status === "active" && !plan.track).length === 1, "المواقع الفرعية للمسار تدور معه");
    const again = await upload("root", 21);
    check(again.status === 200 && !again.json.rollover && again.json.planCreated === false && (await Repository.getCurriculumPlans(21)).length === afterRoll.length, "إعادة الرفع بنفس السنة: تحديثٌ لا تدوير");

    /* لقطة حال النظام للتقرير: للحساب الرئيسي وحده، بكل قسمٍ وصحائفه وعدد مقرراتها */
    const audit = await call("root", "GET", "/api/plan-review/sheet/audit");
    const row21 = audit.json.sections?.find((row: any) => row.sectionId === 21);
    check(audit.status === 200 && audit.json.totals.sections === audit.json.sections.length && row21?.courses >= 27 && row21.plans.some((plan: any) => plan.status === "active" && plan.sheetYear === 2026 && plan.courses === 27) && (await call("other", "GET", "/api/plan-review/sheet/audit")).status === 403, "لقطة حال النظام: الأقسام والصحائف وعدد المقررات، للرئيسي وحده", row21);

    /* مقارنة صحيفة بمقررات قسمٍ موجود قبل مطابقته: قراءةٌ فحسب */
    const compareWith = async (who: string, sectionId: number) => { const res = await fetch(`${base}/api/plan-review/sheet/compare?sectionId=${sectionId}`, { method: "POST", headers: { "content-type": "application/octet-stream", "x-who": who }, body: pdf }); return { status: res.status, json: await res.json().catch(() => ({})) as any }; };
    const coursesBeforeCompare = JSON.stringify(await Repository.getCourses());
    const sameDept = await compareWith("root", 21), otherDept = await compareWith("root", 11);
    check(sameDept.json.similar === true && sameDept.json.sameNumberAndName >= 20 && otherDept.json.similar === false && (await compareWith("other", 21)).status === 403 && JSON.stringify(await Repository.getCourses()) === coursesBeforeCompare, "مقارنة الصحيفة بقسمها تُظهر التشابه وبقسمٍ آخر الاختلاف، بلا كتابة", [sameDept.json, otherDept.json]);

    /* قسمٌ للصحيفة لا وجود له: يُرفض بلا كتابة ويُعرض إنشاؤه، ثم يُنشأ بموافقة المسؤول فقط */
    const french = fs.readFileSync("tests/fixtures/plans/graduation-2026/ba-0140.pdf");
    const importAuto = async (who: string, qs = "") => { const res = await fetch(`${base}/api/plan-review/sheet/import${qs}`, { method: "POST", headers: { "content-type": "application/octet-stream", "x-who": who }, body: french }); return { status: res.status, json: await res.json().catch(() => ({})) as any }; };
    const sectionsBefore = (await Repository.getSections()).length;
    const noFrench = await importAuto("root");
    check(noFrench.status === 422 && noFrench.json.rejection?.kind === "department" && noFrench.json.rejection?.missing === true && noFrench.json.rejection?.code === "40" && (await Repository.getSections()).length === sectionsBefore && Array.isArray(noFrench.json.rejection?.colleges) && noFrench.json.rejection.colleges.length >= 2, "قسمٌ غير موجود: يُرفض ويُعرض إنشاؤه (مع كلياته المطابقة)، ولا يُكتب شيء", noFrench.json.rejection);
    check((await importAuto("other", "?createMissing=1&collegeId=1")).status === 403, "الإنشاء للحساب الرئيسي وحده");
    check((await importAuto("root", "?createMissing=1")).status === 422 && (await Repository.getSections()).length === sectionsBefore, "لا إنشاء «للجميع»: لا بد من اختيار الكلية");
    const madeFrench = await importAuto("root", "?createMissing=1&collegeId=2");
    const frenchSections = (await Repository.getSections()).filter(row => String(row.AdSectionCode) === "40");
    check(madeFrench.status === 200 && madeFrench.json.createdSections.length === 1 && frenchSections.length === 1 && Number(frenchSections[0].AdCollegeId) === 2 && /الفرنسية/.test(String(frenchSections[0].AdSectionName)) && (await Repository.getCourses()).some(row => row.AdSectionId === frenchSections[0].AdSectionId), "بموافقة المسؤول وفي الكلية المختارة وحدها: يُنشأ القسم ويُرفع");
    const againFrench = await importAuto("root", "?createMissing=1&collegeId=2");
    check(againFrench.status === 200 && againFrench.json.createdSections.length === 0 && (await Repository.getSections()).filter(row => String(row.AdSectionCode) === "40").length === 1, "الرفع المتكرر لا ينشئ قسماً ثانياً");
    {
      const second = await importAuto("root", "?createMissing=1&collegeId=1");
      const both = (await Repository.getSections()).filter(row => String(row.AdSectionCode) === "40");
      check(second.status === 200 && second.json.createdSections.length === 1 && both.length === 2, "كليةٌ ثانية للقسم نفسه تُنشأ باختيارها هي", second.json.createdSections);
    }
    {
      const users = ((await Repository.getUsers()) as any[]).filter(row => !row.IsDeleted);
      const frenchAll = (await Repository.getSections()).filter(row => String(row.AdSectionCode) === "40");
      const owned = users.filter(row => frenchAll.some(sec => (row.Name || "").endsWith(String(sec.AdSectionName))));
      const roles = new Set(owned.map(row => row.Role));
      check(owned.length === frenchAll.length * 3 && ["departmentHead", "committeeChair", "advisor"].every(role => roles.has(role)), "القسم الجديد يولد بثلاثة حسابات: رئيس قسم ورئيس جدول ومرشد", owned.map(row => row.SystemUserLogin));
      check(new Set(owned.map(row => String(row.SystemUserLogin).toLowerCase())).size === owned.length && owned.some(row => row.SystemUserLogin === "Frenchdept") && owned.every(row => /^French/.test(row.SystemUserLogin)), "أسماء الدخول من اسم القسم بالإنجليزية وبلا تصادم", owned.map(row => row.SystemUserLogin));
      check(owned.every(row => row.IsActive === true && Repository.verifyPassword("12345678", row.SystemUserPass) === true), "الحسابات فعّالة");
      const assigns = await Promise.all(owned.map(async row => ({ row, a: await Repository.getUserAssigns(row.SystemUserId) })));
      check(assigns.every(({ a }) => a.length === 1 && Number(a[0].AdSectionId) > 0), "كل حساب مقيَّد بقسمه وكليته وحدهما");
      check((madeFrench.json.createdSections as any[]).every(row => row.accounts?.length === 3 && row.accounts.every((acc: any) => acc.status === "created")) && againFrench.json.createdSections.length === 0 && users.length === ((await Repository.getUsers()) as any[]).filter(row => !row.IsDeleted).length, "الإعادة لا تكرر الحسابات");
    }
    /* حسابات الأقسام الموجودة: معاينةٌ ثم إنشاءُ الناقص لما يُختار، بلا مساسٍ بحسابٍ موجود */
    {
      const frenchAllIds = (await Repository.getSections()).filter(row => String(row.AdSectionCode) === "40").map(row => Number(row.AdSectionId));
      const call = async (who: string, method: string, url: string, body?: unknown) => { const res = await fetch(`${base}${url}`, { method, headers: { "content-type": "application/json", "x-who": who }, body: body ? JSON.stringify(body) : undefined }); return { status: res.status, json: await res.json().catch(() => ({})) as any }; };
      const dept = await Repository.createSection(3, "92", "قسم الموسيقى");
      await Repository.createCurriculumPlan({ collegeId: 3, sectionId: Number(dept.AdSectionId), name: "صحيفة اختبار الحسابات", code: "ACC-1", by: "t" } as any);
      const did = Number(dept.AdSectionId);
      const head = await Repository.createUser({ Name: "رئيس قائم", SystemUserLogin: "Musicexisting", SystemUserPass: Repository.hashPassword("x"), IsAdminUser: false, IsActive: true, IsLocked: false, IsDeleted: false, AdInstructorId: 0, Role: "departmentHead" } as any);
      await Repository.saveUserAssigns(head.SystemUserId, [{ AdCollegeId: 3, AdSectionId: did }]);
      check((await call("other", "GET", "/api/plan-review/section-accounts")).status === 403 && (await call("other", "POST", "/api/plan-review/section-accounts", { sectionIds: [did] })).status === 403, "حسابات الأقسام للحساب الرئيسي وحده");
      const usersBefore = ((await Repository.getUsers()) as any[]).length;
      const preview = await call("root", "GET", "/api/plan-review/section-accounts");
      const row = (preview.json.rows || []).find((item: any) => item.sectionId === did);
      check(row && row.missing.length === 2 && row.existing.length === 1 && row.missing.every((item: any) => /^Music/.test(item.login)) && ((await Repository.getUsers()) as any[]).length === usersBefore, "المعاينة: الناقص وحده (رئيس القسم موجود) وبأسماء إنجليزية، ولا تكتب شيئاً", row);
      check(!(preview.json.rows || []).some((item: any) => frenchAllIds.includes(item.sectionId)), "قسمٌ له حساباته (الفرنسي) لا يظهر");
      const made = await call("root", "POST", "/api/plan-review/section-accounts", { sectionIds: [did] });
      const after = (await call("root", "GET", "/api/plan-review/section-accounts")).json.rows.find((item: any) => item.sectionId === did);
      const created = ((await Repository.getUsers()) as any[]).filter(user => /^Music(dept|advisor)/.test(user.SystemUserLogin));
      check(made.json.created === 2 && !after && created.length === 2 && created.every(user => user.IsActive === true && Repository.verifyPassword("12345678", user.SystemUserPass)), "الإنشاء للناقص وحده: حسابان فعّالان بكلمة السر الافتراضية، ولا يتكرر", made.json);
    }

    {
      /* المقررات الدخيلة: نسخةٌ (رقمٌ واسمٌ) من مقررٍ داخل صحيفة قسمٍ آخر، بلا جدول ولا صحيفة في قسمها */
      const home = (await Repository.getSections()).find(row => String(row.AdSectionCode) === "40" && Number(row.AdCollegeId) === 2)!;
      const allCourses = await Repository.getCourses(), allSections = await Repository.getSections();
      /* أصلٌ رقمه واسمه لا يتكرران إلا في موقعٍ للقسم نفسه (الرقم قد يتكرر بين الأقسام فيُحكم بالاسم معه) */
      const owned = (await Repository.getCoursesBySection(home.AdSectionId)).find(row => allCourses.filter(other => other.CourseCode === row.CourseCode && other.CourseName === row.CourseName).every(other => allSections.find(sec => sec.AdSectionId === other.AdSectionId)?.AdSectionName === home.AdSectionName))!;
      const strangerSection = 21;
      const copy = await Repository.createCourse(1, strangerSection, owned.CourseCode, owned.CourseName, 3, 3, 0, false);
      const sameNumberOtherName = await Repository.createCourse(1, strangerSection, "999", owned.CourseName, 3, 3, 0, false);
      const callF = async (who: string, method: string, url: string, body?: unknown) => { const res = await fetch(`${base}${url}`, { method, headers: { "content-type": "application/json", "x-who": who }, body: body ? JSON.stringify(body) : undefined }); return { status: res.status, json: await res.json().catch(() => ({})) as any }; };
      check((await callF("other", "GET", "/api/plan-review/sheet/foreign")).status === 403, "معاينة الدخيل للحساب الرئيسي وحده");
      const preview = await callF("root", "GET", "/api/plan-review/sheet/foreign");
      const listed = (preview.json.sections || []).flatMap((row: any) => row.courses.map((course: any) => course.id));
      check(preview.status === 200 && listed.includes(copy.AdCourseId) && !listed.includes(sameNumberOtherName.AdCourseId) && !listed.includes(owned.AdCourseId), "المعاينة: النسخة الدخيلة وحدها (لا الأصل ولا ما اختلف رقمه)", listed);
      /* نسخةٌ في موقعٍ آخر للقسم نفسه (اسمه نفسه في كليةٍ أخرى): ليست دخيلة */
      const sibling = await Repository.createSection(3, "98", String(home.AdSectionName).replace(/^قسم\s+/, ""));
      const siblingCopy = await Repository.createCourse(3, Number(sibling.AdSectionId), owned.CourseCode, owned.CourseName, 3, 3, 0, false);
      const afterMirror = await callF("root", "GET", "/api/plan-review/sheet/foreign");
      const listedAfter = (afterMirror.json.sections || []).flatMap((row: any) => row.courses.map((course: any) => course.id));
      check(listedAfter.includes(copy.AdCourseId) && !listedAfter.includes(siblingCopy.AdCourseId), "نسخةُ القسم نفسه في كليةٍ أخرى لا تُعدّ دخيلة، ونسخةُ قسمٍ آخر تُعدّ", [listedAfter, copy.AdCourseId, siblingCopy.AdCourseId, owned.AdCourseId]);
      /* قسمان بالاسم نفسه في كليةٍ واحدة: لا إعفاء، فالنسخةُ دخيلة */
      const twin = await Repository.createSection(Number(home.AdCollegeId), "95", home.AdSectionName);
      const twinCopy = await Repository.createCourse(Number(home.AdCollegeId), Number(twin.AdSectionId), owned.CourseCode, owned.CourseName, 3, 3, 0, false);
      const twinScan = await callF("root", "GET", "/api/plan-review/sheet/foreign");
      check((twinScan.json.sections || []).flatMap((row: any) => row.courses.map((course: any) => course.id)).includes(twinCopy.AdCourseId), "قسمان بالاسم نفسه في كليةٍ واحدة: النسخة دخيلة (لا إعفاء)");
      await Repository.deleteCourse(twinCopy.AdCourseId); await Repository.deleteSection(Number(twin.AdSectionId));
      await Repository.deleteCourse(siblingCopy.AdCourseId); await Repository.deleteSection(Number(sibling.AdSectionId));
      /* وحدةٌ قديمة بلا صحيفة: مقررها المنسوخ من قسمٍ عاديٍّ (ولو بلا صحيفة) دخيل، وأصله لا يُعدّ كذلك */
      const planless = await Repository.createSection(3, "97", "قسم أصلٌ بلا صحيفة");
      const unitSec = await Repository.createSection(3, "96", "وحدة قديمة");
      const origin = await Repository.createCourse(3, Number(planless.AdSectionId), "777", "مقررٌ أصيل في قسمٍ بلا صحيفة", 3, 3, 0, false);
      const unitCopy = await Repository.createCourse(3, Number(unitSec.AdSectionId), "777", "مقررٌ أصيل في قسمٍ بلا صحيفة", 3, 3, 0, false);
      const unitScan = await callF("root", "GET", "/api/plan-review/sheet/foreign");
      const unitListed = (unitScan.json.sections || []).flatMap((row: any) => row.courses.map((course: any) => course.id));
      check(unitListed.includes(unitCopy.AdCourseId) && !unitListed.includes(origin.AdCourseId), "نسخةُ وحدةٍ قديمة من مقررِ قسمٍ عاديّ دخيلة، والأصلُ لا", unitListed);
      /* بقايا الوحدة القديمة: بالاسم وحده (رقمٌ مختلف) أو بلا نسخة، وتُعرض بنوعها؛ والمجدول لا يُعرض */
      const byName = await Repository.createCourse(3, Number(unitSec.AdSectionId), "778", "مقررٌ أصيل في قسمٍ بلا صحيفة", 3, 3, 0, false);
      const lone = await Repository.createCourse(3, Number(unitSec.AdSectionId), "779", "مقررٌ لا نظير له", 3, 3, 0, false);
      const kinds = await callF("root", "GET", "/api/plan-review/sheet/foreign");
      const rows = (kinds.json.sections || []).flatMap((row: any) => row.courses) as any[];
      check(rows.find(item => item.id === unitCopy.AdCourseId)?.kind === "copy" && rows.find(item => item.id === byName.AdCourseId)?.kind === "name" && rows.find(item => item.id === lone.AdCourseId)?.kind === "orphan" && !rows.some(item => item.id === origin.AdCourseId), "بقايا الوحدة القديمة بأنواعها: نسخة/بالاسم فقط/بلا نسخة", rows.map(item => [item.code, item.kind]));
      await Repository.deleteCourse(byName.AdCourseId); await Repository.deleteCourse(lone.AdCourseId);
      /* وحدةٌ لها صحيفة: ليست قديمة، فلا يُعدّ منسوخها غير المربوط دخيلاً بمجرد وجوده في قسمٍ بلا صحيفة */
      await Repository.createCurriculumPlan({ collegeId: 3, sectionId: Number(unitSec.AdSectionId), name: "صحيفة وحدة حيّة", code: "LIVE-1", by: "test" } as any);
      const liveScan = await callF("root", "GET", "/api/plan-review/sheet/foreign");
      check(!(liveScan.json.sections || []).flatMap((row: any) => row.courses.map((course: any) => course.id)).includes(unitCopy.AdCourseId), "وحدةٌ لها صحيفة لا تُعامَل كوحدةٍ قديمة");
      await Repository.deleteCourse(origin.AdCourseId); await Repository.deleteCourse(unitCopy.AdCourseId); await Repository.deleteSection(Number(planless.AdSectionId)); await Repository.deleteSection(Number(unitSec.AdSectionId));
      const refuse = await callF("root", "POST", "/api/plan-review/sheet/foreign/delete", { ids: [owned.AdCourseId, sameNumberOtherName.AdCourseId] });
      check(refuse.status === 200 && refuse.json.deleted === 0, "ما ليس دخيلاً لا يُحذف ولو طُلب");
      const done = await callF("root", "POST", "/api/plan-review/sheet/foreign/delete", { ids: [copy.AdCourseId] });
      const left = await Repository.getCoursesBySection(strangerSection);
      check(done.status === 200 && done.json.deleted === 1 && !left.some(row => row.AdCourseId === copy.AdCourseId) && left.some(row => row.AdCourseId === sameNumberOtherName.AdCourseId), "الحذف للنسخة المختارة وحدها");
      await Repository.deleteCourse(sameNumberOtherName.AdCourseId);
    }
    {
      /* كليةٌ للصحيفة غير موجودة أصلاً: تُنشأ بموافقةٍ صريحة (createCollege=1) باسمها من الصحيفة، مع عميدها، ثم القسم فيها */
      const originals = (await Repository.getColleges()).map(row => ({ ...row }));
      for (const row of originals) await Repository.updateCollege(row.AdCollegeId, `9${row.AdCollegeId}`, row.AdCollegeName);
      const sheet = fs.readFileSync("tests/fixtures/plans/graduation-2026/ba-0113.pdf");
      const go = async (qs: string) => { const res = await fetch(`${base}/api/plan-review/sheet/import${qs}`, { method: "POST", headers: { "content-type": "application/octet-stream", "x-who": "root" }, body: sheet }); return { status: res.status, json: await res.json().catch(() => ({})) as any }; };
      const collegesBefore = (await Repository.getColleges()).length;
      const refused = await go("?createMissing=1&collegeId=1");
      check(refused.status === 422 && refused.json.rejection?.colleges?.length === 0 && Boolean(refused.json.rejection?.sheetCollege) && (await Repository.getColleges()).length === collegesBefore, "كليةٌ غير موجودة: يُعرض إنشاؤها ولا يُكتب شيء", refused.json.rejection);
      const made = await go("?createCollege=1");
      const added = (await Repository.getColleges()).filter(row => !originals.some(old => old.AdCollegeId === row.AdCollegeId));
      check(made.status === 200 && added.length === 1 && made.json.createdColleges?.length === 1 && made.json.createdColleges[0].accounts.length === 2 && made.json.createdSections.length === 1, "createCollege=1: تُنشأ الكلية بعميدها وعميدها المساعد ثم القسم فيها", made.json);
      for (const row of originals) await Repository.updateCollege(row.AdCollegeId, row.AdCollegeCode, row.AdCollegeName);
    }
    {
      const { provisionCollegeUsers } = await import("../src/server/sectionUsers");
      const college = await Repository.createCollege("77", "كلية تجريبية جديدة");
      const made = await provisionCollegeUsers(Repository, college);
      const again = await provisionCollegeUsers(Repository, college);
      const deanUser = ((await Repository.getUsers()) as any[]).find(row => row.SystemUserLogin === "77dean");
      const deanAssigns = deanUser ? await Repository.getUserAssigns(deanUser.SystemUserId) : [];
      check(made.length === 2 && made.every(row => row.status === "created") && again.every(row => row.status === "exists"), "الكلية الجديدة: عميد وعميد مساعد بلا تكرار عند الإعادة", [made, again]);
      check(deanUser?.IsActive === true && deanUser.Role === "dean" && deanAssigns.length === 1 && Number(deanAssigns[0].AdCollegeId) === Number(college.AdCollegeId) && Number(deanAssigns[0].AdSectionId) === 0, "العميد فعّال ونطاقه كليته كلها");
    }

    /* قراءة الترويسة بلا كتابة (لتصفية الدفعة) */
    const scanOf = async (who: string, body: Buffer) => { const res = await fetch(`${base}/api/plan-review/sheet/scan`, { method: "POST", headers: { "content-type": "application/octet-stream", "x-who": who }, body }); return { status: res.status, json: await res.json().catch(() => ({})) as any }; };
    const scanned = await scanOf("root", oldPdf);
    check(scanned.status === 200 && scanned.json.program === "BA-0115" && scanned.json.year === 2010 && scanned.json.isNew === false && scanned.json.readable === true, "قراءة الترويسة: البرنامج والسنة والجديدة/القديمة", scanned.json);
    check((await scanOf("other", oldPdf)).status === 403 && (await scanOf("root", Buffer.from("x"))).status === 422, "القراءة للحساب الرئيسي وPDF فقط");
    check(Array.isArray(auto.json.sections) && auto.json.sections.length >= 2 && typeof auto.json.nameFixes === "number", "ردّ الرفع التلقائي يحمل أقسامه ليُحرَّر منه التقرير", auto.json);
  } finally { server.close(); }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
