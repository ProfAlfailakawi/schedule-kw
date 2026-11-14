/**
 * ── «الطلب الفعلي» في الديمو: تخطيطُ الشعب ونبضُ الطلبة لا يُفتحان فارغين ─────────────────
 * بذرُ التقريرين (عام + خريجون) من جدول الصندوق نفسه (src/server/demoActualDemandSeed.ts)، ثم قراءتُهما
 * بالدوالّ التي تقرؤها الشاشتان (demandContext / demandReading / appointmentDemandFor):
 *
 *   A1  التقريران محفوظان لعائلة القسم في فصله، بفصلٍ وقسمٍ يطابقان النظام، وكلُّ مقرر يطابق كتالوجنا (لا «غير مطابَق»).
 *   A2  تخطيط الشعب يعرض كلَّ الحالات: عجزٌ يحتاج شعبةً إضافية، فائض، متوازن، وخريجون بلا مقعد.
 *   A3  نبض الطلبة: موعدٌ يناسب أكثر الطلبة (أخضر)، وموعدٌ يتعارض مع مقررٍ يحتاجه الخريجون (أحمر باسم المقرر وعدد الخريجين)، ومتوسط.
 *   A4  الأرقامُ متّسقة مع صفوف الصندوق: السعةُ والشعبُ المعروضة هي ما في الجدول، والمتعارضان متعارضان فعلاً في مواعيدهما.
 *   A5  حتميّ: صندوقان منفصلان يخزّنان تقريرين متطابقين بايتاً ببايت، والبذرُ مرتين لا يكرّر.
 *   A6  العزل: خارج الديمو لا يبذر شيئاً، وصندوقٌ آخر والمستودعُ الحقيقي لا يقرآن شيئاً، وملفُّ قاعدة البيانات كما هو.
 *   A7  الحسابان اللذان يرى كلٌّ منهما الشاشتين (رئيس القسم ورئيس لجنة الجدول) يقرآن التقريرَ نفسه.
 *   A8  التسلسل في الخادم: البذرُ بعد طلبات الشعب وفي مسار الديمو وحده.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ""); }
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-demand-"));
const dbFile = path.join(dir, "db.json");
fs.writeFileSync(dbFile, JSON.stringify({ users: [], formNames: [], formSecurity: [], collegeUserAssign: [], terms: [], colleges: [], sections: [], instructors: [], courses: [], schedules: [], rooms: [], studentNeeds: [], studentProfiles: [] }), { mode: 0o600 });
process.env.NODE_ENV = "test"; process.env.DATA_MODE = "demo"; process.env.SCHEDULE_PRIVATE_DIR = dir;
const quiet = console.warn; console.warn = () => {};
const { Repository, initDatabase } = await import("../src/db/repository");
await initDatabase(); console.warn = quiet;
const { seedDemoRadar } = await import("../src/server/demoRadarSeed");
const { seedDemoActualDemand, buildDemoDemandReports, demoDemandTermLabel } = await import("../src/server/demoActualDemandSeed");
const { demandContext, demandReading, demandSupplyOf, appointmentDemandFor, planHistoryFor, readStoredDemand, demandFamilyFor } = await import("../src/server/actualDemand");
const { demandTermMatches, demandDepartmentMatches } = await import("../src/utils/actualDemand");
const { graduateClashes, meetingsOverlap } = await import("../src/utils/actualDemandGraduates");

const fileHash = () => crypto.createHash("sha256").update(fs.readFileSync(dbFile)).digest("hex");
const before = fileHash();
const today = new Date().toISOString().slice(0, 10);
const prepare = async (id: string) => {
  Repository.createDemoSandbox(id, 10 * 60_000);
  await Repository.withDemoSandbox(id, async () => {
    await seedDemoRadar({ sealIdentity: async (value: string) => `sealed:${value}`, today });
    await seedDemoActualDemand();
  });
};

/* ── A6 (قبل أي بذر): خارج الصندوق لا شيء ── */
Repository.createDemoSandbox("demo_demand_probe", 10 * 60_000);
const familyKey = await Repository.withDemoSandbox("demo_demand_probe", async () => (await demandFamilyFor(null, 1, 1)).key);
await seedDemoActualDemand();
check(!Repository.isDemoRequest() && (await readStoredDemand(1, familyKey)) === null, "A6 البذرُ خارج صندوق الزائر لا يكتب شيئاً (ولا يرمي)");
check(await Repository.withDemoSandbox("demo_demand_probe", async () => readStoredDemand(1, familyKey)) === null, "A6 وصندوقٌ لم يُبذر لا يرى تقريراً");

const A = "demo_demand_a", B = "demo_demand_b";
await prepare(A);
await prepare(B);
const readBack = (id: string) => Repository.withDemoSandbox(id, async () => ({
  general: (await readStoredDemand(1, familyKey))?.variants?.general || null,
  graduates: (await readStoredDemand(1, familyKey))?.variants?.graduates || null,
  history: (await readStoredDemand(1, familyKey))?.history || [],
}));
const [a, b] = [await readBack(A), await readBack(B)];

/* ── A1 ── */
let reading: any, context: any, supply: any;
let rows: any[] = [];
await Repository.withDemoSandbox(A, async () => {
  context = await demandContext(null, 1, 1, 1);
  const history = await planHistoryFor(context, 1);
  reading = demandReading(context, null, history);
  supply = demandSupplyOf(context);
  rows = context.rows;
});
const term = (await Repository.withDemoSandbox(A, async () => (await Repository.getTerms()) as any[])).find(item => Number(item.AdTermId) === 1);
check(Boolean(a.general && a.graduates) && a.general!.report.courses.length >= 20 && a.graduates!.report.courses.length >= 5, "A1 النسختان محفوظتان: عامٌّ بعشرين مقرراً فأكثر، وخريجون بخمسة فأكثر", [a.general?.report.courses.length, a.graduates?.report.courses.length]);
check(demandTermMatches(a.general!.report.termLabel, String(term.AdTermName)) === true, "A1 فصلُ التقرير هو فصل النظام", [a.general!.report.termLabel, term.AdTermName]);
check(demandDepartmentMatches(a.general!.report.department, familyKey), "A1 وقسمُه هو عائلة القسم", [a.general!.report.department, familyKey]);
check(reading.matched === a.general!.report.courses.length && reading.unmatched.length === 0, "A1 وكلُّ مقررٍ فيه يطابق كتالوجنا بلا «غير مطابَق»", [reading.matched, reading.unmatched.length]);
check(a.history.length === 2 && a.general!.uploadedBy.includes("عرض تجريبي") && a.general!.uploadedAt === "2026-10-04T09:00:00.000Z", "A1 سجلُّ الرفع (مرتان) وتاريخُه من بدء الفصل لا من ساعة الجلسة", a.history);
check(a.general!.report.courses.every(course => /^\d{7}$/.test(course.code) && course.programs.reduce((sum, program) => sum + program.total, 0) === course.students.total && course.students.boys + course.students.girls === course.students.total), "A1 رقمُ المقرر بسبع خانات والبرامجُ مجموعُها الطلبة وبنون + بنات = الكل");

/* ── A2 ── */
const plan = reading.plan;
const tiers = new Set<string>(plan.rows.map((row: any) => row.tier));
check(tiers.has("grad") && tiers.has("short") && tiers.has("surplus") && tiers.has("ok"), "A2 كلُّ الحالات في تخطيط الشعب: خريجون بلا مقعد، عجز، فائض، متوازن", [...tiers]);
const short = plan.rows.filter((row: any) => row.tier === "short" && row.gap > 0);
check(short.length >= 2 && short.every((row: any) => row.target && row.required > row.offered), "A2 عجزٌ يحتاج شعبةً إضافية في مقررين فأكثر (ولكلٍّ هدفٌ تُفتح فيه)", short.map((row: any) => [row.code, row.gap]));
check(plan.rows.filter((row: any) => row.tier === "surplus").length >= 2 && plan.totals.close >= 2, "A2 وفائضٌ في مقررين فأكثر", plan.totals);
check(plan.totals.gradOpen >= 1 && plan.graduatesServed !== null && plan.graduatesServed < 100 && plan.rows.some((row: any) => row.gradShort >= 1 && row.graduates > row.offered * row.cap), "A2 وخريجون بلا مقعد في مقررٍ واحدٍ على الأقل (وليس كلُّهم)", [plan.totals, plan.graduatesServed]);
check(plan.totals.open >= 3 && plan.totals.needAll >= 3, "A2 والشعبُ الناقصة مجموعاً ثلاثٌ فأكثر", plan.totals);
const supplyItems = supply.items as any[];
check(supplyItems.some(item => item.unmetGraduates > 0) && supplyItems.some(item => item.gap > 0) && supplyItems.some(item => item.gap < 0) && supply.service.graduates < 100 && supply.service.general < 100 && supply.service.general > 70, "A2 والعرضُ والطلب: خريجون بلا مقعد وعجز وفائض، ونسبةُ الخدمة دون ١٠٠٪ ولا تقلّ عن ٧٠٪", [supply.service]);

/* ── A3 ── */
const fitOf = async (row: any) => Repository.withDemoSandbox(A, async () => (await appointmentDemandFor(null as any, row)).studentFit);
const seenSections = new Map<string, any>();
for (const row of rows) { const key = `${row.AdCourseId}:${row.SCode}`; if (!seenSections.has(key)) seenSections.set(key, row); }
const fits: Array<{ row: any; fit: any }> = [];
for (const row of seenSections.values()) fits.push({ row, fit: await fitOf(row) });
const gradFits = fits.filter(item => item.fit?.graduates?.percent != null);
const green = fits.filter(item => (item.fit?.graduates?.percent ?? item.fit?.students?.percent ?? -1) >= 85);
const red = gradFits.filter(item => item.fit.graduates.percent < 60 && item.fit.graduates.clashes.length > 0);
const amber = fits.filter(item => { const p = item.fit?.students?.percent; return p != null && p >= 60 && p < 85; });
check(green.length >= 10, `A3 معظمُ المواعيد تناسب أكثر الطلبة (أخضر): ${green.length} من ${fits.length}`, fits.length);
check(red.length >= 2 && red.every(item => item.fit.graduates.clashes[0].name && item.fit.graduates.clashes[0].students > 0 && /^\d{7}$/.test(item.fit.graduates.clashes[0].code)), "A3 وموعدان أحمران يتعارضان مع مقررٍ يحتاجه الخريجون، باسمه ورقمه وعدد المحجوبين", red.map(item => item.fit.graduates));
check(amber.length >= 2, "A3 ومواعيد متوسطة (٦٠–٨٤٪) بقيمٍ مختلفة", amber.map(item => item.fit.students.percent));
check(new Set(fits.map(item => item.fit?.graduates?.percent ?? item.fit?.students?.percent)).size >= 6, "A3 وقيمُ الحلقات متنوعة (ست قيمٍ مختلفة على الأقل)");
check(gradFits.some(item => item.fit.graduates.percent === 100 && item.fit.graduates.need >= 8) && gradFits.some(item => item.fit.graduates.percent < 60), "A3 والخريجون: حلقةٌ خضراء وأخرى حمراء");
const clash = reading.graduateClashes[0];
check(reading.graduateClashes.length >= 1 && clash.graduates >= 5 && clash.a.courseIds.length && clash.b.courseIds.length, "A3 وقائمةُ تعارضات الخريجين ليست فارغة (لا مفرّ منه)", reading.graduateClashes);

/* ── A4 ── */
const story = buildDemoDemandReports({
  termName: String(term.AdTermName), department: "تكنولوجيا التعليم",
  courses: context.catalogue, rows,
}).story;
check(Boolean(story.clash && story.mild && story.gradShort && story.deficit.length === 2 && story.surplus.length === 2 && story.balanced.length === 3), "A4 القصةُ تُسند كلَّ الأدوار من جدول الصندوق", story);
{
  const byCode = new Map<string, any>(context.catalogue.map((course: any) => [String(course.CourseCode).trim(), course] as const));
  const sectionsOf = (code: string) => { const id = Number(byCode.get(code).AdCourseId); return [...new Set(rows.filter(row => Number(row.AdCourseId) === id).map(row => row.SCode))]; };
  const [x, y] = story.clash!;
  const rx = rows.filter(row => Number(row.AdCourseId) === Number(byCode.get(x).AdCourseId)), ry = rows.filter(row => Number(row.AdCourseId) === Number(byCode.get(y).AdCourseId));
  check(sectionsOf(x).length === 1 && sectionsOf(y).length === 1 && rx.some(p => ry.some(q => meetingsOverlap(p, q))), `A4 المتعارضان (${x} و${y}) بشعبةٍ واحدةٍ لكلٍّ ومواعيدُهما تتداخل فعلاً في الجدول`);
  const gradClash = graduateClashes({ graduates: a.graduates!.report, matches: context.matches, members: context.family.members, rows });
  check(gradClash.some(item => [item.a.code, item.b.code].sort().join() === [x, y].sort().join()), "A4 وهما بعينهما تعارضُ الخريجين المقروء من التقرير");
  const row = plan.rows.find((item: any) => item.code === story.gradShort);
  const catalogueCap = Number(byCode.get(story.gradShort).MaxStudent);
  check(row.cap === catalogueCap && row.offered === sectionsOf(story.gradShort).length && row.graduates > row.offered * row.cap, "A4 مقعدُ مقرر «خريجون بلا مقعد» وعددُ شعبه من صفوف الصندوق، وخريجوه أكثر من مقاعده", row);
  for (const code of story.deficit) { const r = plan.rows.find((item: any) => item.code === code); check(r.offered === sectionsOf(code).length && r.required >= r.offered + 2, `A4 عجز ${code}: يحتاج شعبتين زيادةً على المطروح فعلاً`, r); }
  for (const code of story.surplus) { const r = plan.rows.find((item: any) => item.code === code); check(r.offered >= 2 && r.gap < 0, `A4 فائض ${code}: شعبٌ مطروحة أكثر من المقترح`, r); }
}
const tight = (context.catalogue as any[]).filter(course => Number(course.MaxStudent) > 0 && Number(course.MaxStudent) < 12).map(course => String(course.CourseCode).trim());
check(tight.length > 0 && tight.every(code => !a.general!.report.courses.some(course => course.code === code)), "A4 ومقرراتُ الرادار الضيّقة السعة (١–٥ مقاعد) لا تدخل التقرير", tight);

/* ── A5 ── */
check(JSON.stringify(a) === JSON.stringify(b), "A5 صندوقان منفصلان يخزّنان التقريرين نفسَيهما بايتاً ببايت (حتميّ)");
const again = buildDemoDemandReports({ termName: String(term.AdTermName), department: "تكنولوجيا التعليم", courses: context.catalogue, rows });
const twice = buildDemoDemandReports({ termName: String(term.AdTermName), department: "تكنولوجيا التعليم", courses: context.catalogue, rows });
check(JSON.stringify(again) === JSON.stringify(twice), "A5 والبانيةُ النقية تعيد الناتجَ نفسه");
await Repository.withDemoSandbox(A, async () => { await seedDemoActualDemand(); });
check((await readBack(A)).history.length === 2, "A5 والبذرُ ثانيةً في الصندوق نفسه لا يكرّر الرفع");
check(demoDemandTermLabel("الفصل الثاني 2026/2027") === "الفصل الدراسي الثاني 2027-2026" && demoDemandTermLabel("الفصل الصيفي 2025/2026") === "الفصل الدراسي الصيفي 2026-2025", "A5 تسميةُ الفصل كما تطبعها التقارير (السنوات مقلوبة)");

/* ── A6 ── */
check(await Repository.withDemoSandbox("demo_demand_probe", async () => readStoredDemand(1, familyKey)) === null, "A6 وصندوقٌ بُذر بعد الآخرَين لم يتأثر بهما (لا وثيقة مشتركة)");
check((await readStoredDemand(1, familyKey)) === null && (await Repository.listFeatureDocs("actualDemandReports")).length === 0, "A6 والمستودعُ الحقيقي (خارج الصناديق) بلا تقرير");
check(fileHash() === before, "A6 وملفُّ قاعدة البيانات على القرص بايتاً ببايت كما كان");

/* ── A7 ── */
{
  const reqFor = (role: string, userId: number) => ({ user: { SystemUserId: userId, Role: role, IsAdminUser: false }, scopes: [{ AdCollegeId: 1, AdSectionId: 1 }] }) as any;
  const read = async (req: any) => Repository.withDemoSandbox(A, async () => {
    const ctx = await demandContext(req, 1, 1, 1);
    return { members: ctx.family.members.length, stored: Boolean(ctx.stored?.variants?.general && ctx.stored?.variants?.graduates), rows: demandReading(ctx, null, await planHistoryFor(ctx, 1)).plan?.rows.length };
  });
  const head = await read(reqFor("departmentHead", 15)), chair = await read(reqFor("committeeChair", 16));
  check(head.members === 1 && head.stored && head.rows >= 25 && JSON.stringify(head) === JSON.stringify(chair), "A7 رئيس القسم ورئيس لجنة الجدول يقرآن التقريرَ نفسه ويريان التخطيط", [head, chair]);
  const outsider = await read({ user: { SystemUserId: 99, Role: "departmentHead", IsAdminUser: false }, scopes: [{ AdCollegeId: 1, AdSectionId: 2 }] } as any);
  check(outsider.members === 0 && !outsider.rows, "A7 ومن لا يملك القسم لا يرى منه شيئاً (النطاق محفوظ)", outsider);
}

/* ── A8 ── */
{
  const auth = fs.readFileSync("src/server/routes/authRoutes.ts", "utf8");
  const section = auth.indexOf('run("section requests"'), demand = auth.indexOf('run("actual demand", seedDemoActualDemand)');
  check(section > 0 && demand > section && auth.indexOf("scheduleDemoExtras") > 0 && auth.indexOf('import { seedDemoActualDemand } from "../demoActualDemandSeed"') > 0, "A8 البذرُ في مسار الديمو بعد طلبات الشعب");
  const seed = fs.readFileSync("src/server/demoActualDemandSeed.ts", "utf8");
  check(/export async function seedDemoActualDemand\(\): Promise<void> \{\n  if \(!Repository\.isDemoRequest\(\)\) return;/.test(seed), "A8 وأولُ سطرٍ في البذر حارسُ الديمو");
  check(!/Math\.random|Date\.now|new Date\(\)/.test(seed.replace(/\/\*[\s\S]*?\*\//g, "")), "A8 ولا عشوائيةَ ولا ساعةَ في البذر");
}

for (const id of [A, B, "demo_demand_probe"]) Repository.dropDemoSandbox(id);
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
