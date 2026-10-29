/**
 * النصاب التدريسي (ميزةٌ اختيارية): الحسابُ، والتحقّق، وبياناتُ الديمو، وأنها لا تمنع شيئاً ولا تلمس غيرها.
 * ومعها: الساعاتُ الصحيحة (واجهةً وخادماً)، و«الإضافي» سقفاً مطلقاً، وأسبقيةُ استثناء العضو، وترتيبُ الدرجات.
 */
import fs from "node:fs";
import { createDemoSandboxState } from "../src/db/demoSandbox";
import {
  emptyTeachingLoadConfig, evaluateTeachingLoad, hoursLabel, instructorLoadPolicy, loadCapOf, loadNisabOf, loadTermContext, normalizeTeachingLoadConfig,
  parseWholeHours, teachingHoursByInstructor, teachingLoadLimits, teachingLoadProblem, withLoadPolicies,
} from "../src/utils/teachingLoad";
import { loadRing } from "../src/utils/taPhase";
import { readServerSource } from "./helpers/serverSource.mjs";

let passed = 0, failed = 0;
function check(ok: boolean, label: string) {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
}

/* ── الحساب ── */
const config = normalizeTeachingLoadConfig({
  enabled: true,
  ranks: [{ id: "p", name: "أستاذ", minHours: 9, maxHours: 12 }, { id: "a", name: "مساعد", minHours: 12, maxHours: 15 }],
  assignments: { "1": { rankId: "p" }, "2": { rankId: "p", extraHours: 2 }, "3": { rankId: "p", maxHours: 6 }, "4": { rankId: "ghost" }, "x": { rankId: "p" } },
});
check(config.enabled && config.ranks.length === 2, "الإعداد يُنقّى: درجتان ومفعَّل");
check(!config.assignments["4"]?.rankId && !config.assignments["x"], "درجةٌ غير موجودة وعضوٌ غير صالح يُسقطان بصمت");
check(normalizeTeachingLoadConfig(undefined).enabled === false && normalizeTeachingLoadConfig(null).ranks.length === 0, "ما لم يُكتب بعدُ: إعدادٌ فارغٌ معطَّل — لا ميزةَ بلا تفعيل");
check(emptyTeachingLoadConfig().enabled === false, "الميزة اختيارية: معطَّلةٌ افتراضياً");

const courseHours = new Map<number, number>([[10, 3], [11, 3], [12, 4]]);
const hours = teachingHoursByInstructor([
  { AdInstructorId: 1, AdCourseId: 10, SCode: "01" }, { AdInstructorId: 1, AdCourseId: 10, SCode: "01" }, // صفّان لشعبةٍ واحدة
  { AdInstructorId: 1, AdCourseId: 10, SCode: "02" }, { AdInstructorId: 1, AdCourseId: 11, SCode: "01" }, { AdInstructorId: 1, AdCourseId: 12, SCode: "01" },
  { AdInstructorId: 2, AdCourseId: 10, SCode: "01" }, { AdInstructorId: 0, AdCourseId: 10, SCode: "01" }, { AdInstructorId: 5, AdCourseId: 99, SCode: "01" },
] as any, courseHours);
check(hours.get(1) === 13, "العبء: الشعبة (مقرر+رمز) مرةً واحدة مهما تعدّدت صفوفها — 3+3+3+4 = 13");
check(hours.get(2) === 3 && !hours.has(0) && !hours.has(5), "بلا أستاذ أو بمقررٍ بلا ساعات: لا يُحسب");
const branchHours = teachingHoursByInstructor([
  { AdInstructorId: 9, AdCourseId: 10, SCode: "01", AdCollegeId: 1, AdSectionId: 3 },
  { AdInstructorId: 9, AdCourseId: 10, SCode: "01", AdCollegeId: 2, AdSectionId: 3 },
  { AdInstructorId: 9, AdCourseId: 10, SCode: "01", AdCollegeId: 1, AdSectionId: 3 },
] as any, courseHours);
check(branchHours.get(9) === 6, "الشعبة 01 في فرعين تُحسب شعبتين، وصفوف الموعد المكررة لا تضاعفها");

check(evaluateTeachingLoad(config, 1, 13).state === "over" && evaluateTeachingLoad(config, 1, 13).excess === 1, "13 من 12 ← تجاوز ساعةٍ واحدة");
check(evaluateTeachingLoad(config, 1, 12).state === "within", "12 من 12 ← ضمن النصاب (الحدّ نفسُه ليس تجاوزاً)");
check(evaluateTeachingLoad(config, 2, 13).state === "overtime" && teachingLoadLimits(config, 2).allowed === 14, "الساعات الإضافية تُضاف إلى الحدّ الأعلى: 12+2 = 14، وما بينهما «إضافي» لا تجاوز");
check(evaluateTeachingLoad(config, 2, 15.5).excess === 1.5, "التجاوز بعد الإضافية يُقال بمقداره: 15.5 − 14 = 1.5");
check(evaluateTeachingLoad(config, 3, 7).state === "over" && evaluateTeachingLoad(config, 3, 7).excess === 1, "النصاب الخاصّ بالعضو يتقدّم على نصاب الدرجة (6)");
check(evaluateTeachingLoad(config, 1, 5).state === "under", "دون الحدّ الأدنى: حالةٌ للإعداد، لا تنبيه");
check(evaluateTeachingLoad(config, 4, 40).state === "unset" && evaluateTeachingLoad(config, 99, 40).state === "unset", "بلا درجةٍ ولا نصاب: غيرُ مضبوط — لا يُفرض رقمٌ مخترَع");
check(hoursLabel(4) === "4 ساعات" && hoursLabel(2) === "ساعتان", "الصياغة العربية: ساعتان · 4 ساعات");

/* ── التحقّق ── */
check(teachingLoadProblem({ ranks: [{ name: "أ", minHours: 12, maxHours: 9 }] })?.includes("أكبر") === true, "أدنى > أعلى مرفوض");
check(teachingLoadProblem({ ranks: [{ name: "أ", minHours: 1, maxHours: 2 }, { name: " أ ", minHours: 1, maxHours: 2 }] })?.includes("مكرّرة") === true, "اسمُ درجةٍ مكرّر مرفوض");
check(teachingLoadProblem({ ranks: [{ name: "", minHours: 1, maxHours: 2 }] }) !== null, "درجةٌ بلا اسم مرفوضة");
check(teachingLoadProblem({ ranks: [{ name: "أ", minHours: 0, maxHours: 99 }] }) !== null, "نصابٌ فوق الحدّ المعقول مرفوض");
check(teachingLoadProblem({ ranks: [], assignments: { "1": { extraHours: 99 } } }) !== null && teachingLoadProblem({ ranks: [], assignments: { "1": { minHours: 9, maxHours: 3 } } }) !== null, "ساعاتٌ إضافية مفرطة، وأدنى>أعلى للعضو: مرفوضان");
check(teachingLoadProblem({ ranks: [{ name: "أستاذ", minHours: 9, maxHours: 12 }], assignments: { "1": { rankId: "x", extraHours: 2 } } }) === null, "إعدادٌ سليم يمرّ");

/* ── الديمو: حالتان تكفيان للشرح ── */
{
  const demo = createDemoSandboxState() as any;
  const cfg = normalizeTeachingLoadConfig(demo.teachingLoadConfig?.[0]);
  check(cfg.enabled && cfg.ranks.length >= 3 && Object.keys(cfg.assignments).length >= 5, "الديمو: الميزة مفعَّلة بدرجاتٍ وإسنادٍ لعدّة أعضاء");
  check(cfg.ranks[0]?.name === "أستاذ" && cfg.ranks.every(rank => rank.overtimeHours === 2), "الديمو: «أستاذ» أولاً، ولكل درجةٍ إضافيّ");
  const current = demo.terms.find((t: any) => !t.AdTermClosed && /2026\/2027/.test(t.AdTermName) && /الأول/.test(t.AdTermName));
  const byCourse = new Map<number, number>(demo.courses.map((c: any) => [c.AdCourseId, c.CourseHours] as [number, number]));
  const used = teachingHoursByInstructor(demo.schedules.filter((r: any) => r.AdTermId === current.AdTermId), byCourse);
  const states = [...used.entries()].map(([id, h]) => evaluateTeachingLoad(cfg, id, h));
  const over = states.filter(s => s.state === "over"), within = states.filter(s => s.state === "within"), overtime = states.filter(s => s.state === "overtime");
  check(over.length === 2 && within.length === 3 && overtime.length === 1, `الديمو: متجاوزان (${over.length}) وإضافيٌّ (${overtime.length}) وثلاثةٌ ضمن النصاب (${within.length}) على جدول الفصل الجاري`);
  check(over.some(s => s.instructorId === 12 && s.excess === 2) && over.some(s => s.instructorId === 5 && s.excess === 1), "الديمو: تجاوزُ ساعتين (عضو 12: 19 من 15+2) وساعةٍ (عضو 5 باستثنائه: 15 من 12+2)");
  const calm = states.find(s => s.instructorId === 3)!;
  check(calm.state === "overtime" && calm.overtimeUsed === 1 && calm.excess === 0, "الديمو: عضو 3 بـ13 ساعة من 12+2 ← ساعةٌ إضافية هادئة، لا تجاوز");
  const ex = states.find(s => s.instructorId === 5)!;
  check(ex.exception?.reason === "admin" && ex.exception.untilTermId === 2 && ex.max === 12, "الديمو: عضو 5 استثناءٌ بمنصبٍ إداري ينتهي بالفصل الثاني، وحدُّه الخاص يتقدّم على درجته (13)");
  check(states.some(s => s.state === "unset"), "الديمو: أعضاءٌ بلا نصابٍ مضبوط لا يُنبَّه بهم");
}

/* ── ١) الساعاتُ الصحيحة ── */
check(teachingLoadProblem({ ranks: [{ name: "أ", minHours: 8.5, maxHours: 10 }] })?.includes("الصحيحة") === true, "الخادم يرفض نصاباً كسرياً (8.5) في الدرجة");
check(teachingLoadProblem({ ranks: [{ name: "أ", minHours: 8, maxHours: 9.5 }] }) !== null, "الحدّ الأعلى الكسري (9.5) مرفوض");
check(teachingLoadProblem({ ranks: [{ name: "أ", minHours: 8, maxHours: 10, overtimeHours: 1.5 }] })?.includes("الصحيحة") === true, "الإضافيّ الكسري مرفوض");
check(teachingLoadProblem({ ranks: [], assignments: { "1": { maxHours: 9.5 } } })?.includes("صحيحة") === true, "استثناءُ العضو الكسري مرفوض");
{
  const legacy = normalizeTeachingLoadConfig({ ranks: [{ id: "r", name: "أ", minHours: 8.5, maxHours: 9.5, overtimeHours: 1.4 }], assignments: { "1": { rankId: "r", maxHours: 10.6, extraHours: 0.4 } } });
  const r = legacy.ranks[0], a = legacy.assignments["1"];
  check([r.minHours, r.maxHours, r.overtimeHours, a.maxHours, a.extraHours].every(n => Number.isInteger(n)), "ما خُزّن كسراً قديماً يُقرأ صحيحاً — لا حدَّ كسرياً في أي حساب");
  const lim = teachingLoadLimits(legacy, 1);
  check(Number.isInteger(lim.max) && Number.isInteger(lim.allowed) && Number.isInteger(lim.extra), "السقفُ والإضافيُّ المحسوبان صحيحان دائماً");
}
check(parseWholeHours("8.5").value === 9 && parseWholeHours("8.5").rounded && parseWholeHours("٩").value === 9 && !parseWholeHours("12").rounded && parseWholeHours("").value === undefined, "الواجهة: الكسرُ يُقرَّب (8.5 ← 9) ويُقال ذلك، والأرقامُ العربية تُقرأ");

/* ── ٢) الإضافي سقفاً مطلقاً ── */
{
  const cfg2 = normalizeTeachingLoadConfig({ enabled: true, ranks: [{ id: "p", name: "أستاذ", minHours: 9, maxHours: 12, overtimeHours: 3 }], assignments: { "1": { rankId: "p" } } });
  check(evaluateTeachingLoad(cfg2, 1, 12).state === "within", "12 من 12+3 ← ضمن النصاب");
  check(evaluateTeachingLoad(cfg2, 1, 14).state === "overtime" && evaluateTeachingLoad(cfg2, 1, 14).overtimeUsed === 2 && evaluateTeachingLoad(cfg2, 1, 14).excess === 0, "14 من 12+3 ← ساعتان إضافيتان، لا خطأ");
  check(evaluateTeachingLoad(cfg2, 1, 15).state === "overtime", "15 = السقف نفسُه ← إضافيّ لا تجاوز");
  check(evaluateTeachingLoad(cfg2, 1, 16).state === "over" && evaluateTeachingLoad(cfg2, 1, 16).excess === 1, "16 فوق السقف (15) ← تجاوزُ ساعة");
  check(loadRing(14, 12, 3)?.tone === "overtime" && loadRing(16, 12, 3)?.tone === "full" && loadRing(12, 12)?.tone === "full", "حلقة النصاب: الإضافيُّ لونٌ هادئ، وفوق السقف وحده امتلاءٌ أحمر");
}

/* ── ٣) أسبقيةُ استثناء العضو ── */
{
  const cfg3 = normalizeTeachingLoadConfig({
    enabled: true,
    ranks: [{ id: "p", name: "أستاذ", minHours: 9, maxHours: 12, overtimeHours: 3 }],
    assignments: {
      "1": { rankId: "p", maxHours: 6, reason: "admin" },
      "2": { rankId: "p", minHours: 0, maxHours: 8, extraHours: 0, reason: "sabbatical", untilTermId: 10 },
      "3": { rankId: "p" },
      "4": { maxHours: 10, reason: "bogus" },
    },
  });
  const l1 = teachingLoadLimits(cfg3, 1);
  check(l1.max === 6 && l1.extra === 3 && l1.allowed === 9 && l1.exception?.reason === "admin", "استثناءُ الأعلى يتقدّم، والإضافيُّ غير المستثنى من الدرجة: 6+3");
  check(teachingLoadLimits(cfg3, 2).allowed === 8 && teachingLoadLimits(cfg3, 2).min === 0, "استثناءٌ كامل (أدنى وأعلى وإضافيّ صفر) يتقدّم كله على الدرجة");
  check(teachingLoadLimits(cfg3, 3).exception === null && teachingLoadLimits(cfg3, 3).allowed === 15, "الدرجةُ وحدها ليست استثناء");
  check(cfg3.assignments["4"].reason === "other" && teachingLoadLimits(cfg3, 4).allowed === 10, "سببٌ مجهول يُقرأ «أخرى»؛ واستثناءٌ بلا درجةٍ يكفي وحده");
  const terms = [{ AdTermId: 10, AdTermName: "الفصل الأول 2026/2027" }, { AdTermId: 11, AdTermName: "الفصل الثاني 2026/2027" }, { AdTermId: 9, AdTermName: "الفصل الثاني 2025/2026" }];
  check(teachingLoadLimits(cfg3, 2, loadTermContext(terms, 10)).allowed === 8 && teachingLoadLimits(cfg3, 2, loadTermContext(terms, 9)).allowed === 8, "الاستثناءُ يسري حتى فصل انتهائه (وما قبله)");
  check(teachingLoadLimits(cfg3, 2, loadTermContext(terms, 11)).allowed === 15 && teachingLoadLimits(cfg3, 2, loadTermContext(terms, 11)).exception === null, "بعد فصل الانتهاء يعود العضو إلى نصاب درجته تلقائياً");
  const people = [{ AdInstructorId: 1, AdInstructorLoad: 18 }, { AdInstructorId: 3, AdInstructorLoad: 18 }, { AdInstructorId: 7, AdInstructorLoad: 18 }] as any[];
  const decorated = withLoadPolicies(people, cfg3);
  check(loadCapOf(decorated[0]) === 9 && loadCapOf(decorated[1]) === 15 && loadCapOf(decorated[2]) === 18, "كلُّ حسابٍ للنصاب (loadCapOf): الاستثناء ← الدرجة ← النصابُ المسجّل");
  check(decorated[0].AdInstructorLoad === 18 && people[0].LoadPolicy === undefined, "التزيينُ نسخٌ: لا يمسّ AdInstructorLoad ولا الأصل");
  check(loadNisabOf(decorated[0]).nisab === 6 && loadNisabOf(decorated[0]).overtime === 3 && loadNisabOf(decorated[0]).exception, "الحلقة تقرأ الأعلى والإضافيّ منفصلَين وتعرف الاستثناء");
  check(withLoadPolicies(people, { ...cfg3, enabled: false }) === people && instructorLoadPolicy({ ...cfg3, enabled: false }, 1) === null, "معطَّلةً: لا تزيين — كلُّ شيءٍ كما كان");
}

/* ── ٤) ترتيبُ الدرجات محفوظ ── */
{
  const order = normalizeTeachingLoadConfig({ ranks: [{ id: "c", name: "مدرّس", minHours: 1, maxHours: 2 }, { id: "a", name: "أستاذ دكتور", minHours: 1, maxHours: 2 }, { id: "b", name: "أستاذ مساعد", minHours: 1, maxHours: 2 }] });
  check(order.ranks.map(r => r.id).join() === "c,a,b", "التنقيةُ تحفظ ترتيبَ الدرجات كما رتّبها المسؤول (لا فرزَ أبجدياً)");
  const settings = fs.readFileSync("src/components/TeachingLoadSettings.tsx", "utf8");
  check(settings.includes("const moveRank") && settings.includes("moved(current.ranks") && /draggable=\{!demoReadOnly && armed === rank\.id\}/.test(settings) && settings.includes("ArrowUp") && settings.includes("ArrowDown"), "الإعداد: أسهمُ رفعٍ وخفض، وسحبٌ من المقبض على الحاسوب");
  check(/config\.ranks\.map\(rank => <option/.test(settings) && fs.readFileSync("src/components/LoadException.tsx", "utf8").includes("ranks.map(item => <option"), "كلُّ قائمة درجاتٍ تُعرض بالترتيب المحفوظ");
}

/* ── العقد: اختياريةٌ، مخوَّلة، قراءةٌ فقط، معزولة ── */
const server = readServerSource();
const block = server.slice(server.indexOf("النصاب التدريسي (ميزةٌ اختيارية"), server.indexOf('app.post("/api/sections"'));
check(/app\.get\("\/api\/admin\/teaching-load",[^\n]*requireRootAdmin/.test(block) && /app\.put\("\/api\/admin\/teaching-load",[^\n]*requireRootAdmin/.test(block), "الإعداد (قراءةً وحفظاً) للمدير الرئيسي وحده");
check(/app\.get\("\/api\/teaching-load\/status"/.test(block) && block.includes("isScopeAllowed(req, collegeId, sectionId)"), "تنبيه المخطّط محكومٌ بنطاقه");
check(block.includes("if (!config.enabled) { res.json({ enabled: false"), "معطَّلةٌ: لا حسابَ ولا بيانات");
check(!/Repository\.(create|update|delete|save)\w*Schedule/.test(block), "مساراتُ النصاب لا تكتب جدولاً");
const at = server.indexOf('app.post("/api/schedules"');
check(at > 0 && !/teachingLoad|TeachingLoad|evaluateTeachingLoad/.test(server.slice(at, at + 12000)), "حفظُ الموعد لا يعرف النصاب: لا منعَ ولا رفض");
check(server.includes('"/admin/teaching-load"]'), "الديمو: الإعداد للعرض لا يُعدَّل (كبقية إدارة النظام)");
check(/app\.get\("\/api\/admin\/teaching-load\/member\/:id",[^\n]*requireRootAdmin/.test(block) && /app\.put\("\/api\/admin\/teaching-load\/member\/:id",[^\n]*requireRootAdmin/.test(block), "استثناءُ العضو (قراءةً وحفظاً) للمدير الرئيسي وحده");
{
  const memberPut = block.slice(block.indexOf('app.put("/api/admin/teaching-load/member/:id"'));
  check(memberPut.includes("teachingLoadProblem({ ranks: config.ranks, assignments:") && memberPut.indexOf("teachingLoadProblem") < memberPut.indexOf("saveTeachingLoadConfig"), "حفظُ استثناء العضو يمرّ بالتحقّق نفسه (الساعات الصحيحة) قبل الكتابة");
}
check(/Math\.round\(loadRaw\)/.test(server) && fs.readFileSync("src/db/repository.ts", "utf8").includes("const loadValue = Math.round(Number(load));"), "نصابُ الأستاذ المسجّل يُخزَّن صحيحاً");

/* ── كلُّ موضعٍ يقيس النصاب يقرأ الاستثناء ثم الدرجة (loadCapOf) ── */
{
  const repo = fs.readFileSync("src/db/repository.ts", "utf8");
  check(/getInstructors: async \(\): Promise<AdInstructor\[\]> => withManagedLoad\(/.test(repo) && repo.includes("return person ? (await withManagedLoad([person]))[0]") && repo.split("withManagedLoad(").length >= 5, "القراءةُ تزيّن كلَّ عضوٍ بنصابه الفعّال (الكل، والنطاق، والواحد)");
  check(repo.includes("loadCapOf(loadPerson) > 0 && weeklyLoadOf(loadWeek, courseMap) > loadCapOf(loadPerson)") && repo.includes("> loadCapOf(loadPerson))"), "الاعتماد: سقفُ طلب الأستاذ هو سقفُ درجته/استثنائه");
  check(repo.includes("invalidateReference(REFERENCE_KEYS.teachingLoad)") && repo.includes("scopedCachedReference(REFERENCE_KEYS.teachingLoad"), "إعدادُ النصاب في الذاكرة القصيرة ويسقط مع كل حفظ");
  const sites: Array<[string, RegExp]> = [
    ["src/server/core/instructorRequests.ts", /instructorLoad: loadCapOf\(/],
    ["src/server/routes/publicRequestRoutes.ts", /const load = loadCapOf\(/],
    ["src/server/routes/publicRequestRoutes.ts", /loadRing\(taHours, loadNisabOf\(person\)\.nisab, loadNisabOf\(person\)\.overtime\)/],
    ["src/server/routes/intelligenceRoutes.ts", /quota:loadCapOf\(instructor\)/],
    ["src/server/studyProposalEngine.ts", /const loadCap = loadCapOf\(world\.instructor\)/],
    ["src/server/studyProposalRoutes.ts", /loadCap: loadCapOf\(world\.instructor\)/],
    ["src/server/routes/offeringRoutes.ts", /load: loadCapOf\(row\)/],
    ["src/utils/sectionOpening.ts", /const limit = loadCapOf\(person\)/],
    ["src/utils/termForecast.ts", /const limit = loadCapOf\(instructor\)/],
    ["src/components/Schedules.tsx", /nisab=\{loadNisabOf\(/],
    ["src/components/Schedules.tsx", /overtimeOf: \(id: number\) => loadNisabOf\(/],
  ];
  for (const [file, pattern] of sites) check(pattern.test(fs.readFileSync(file, "utf8")), `${file}: يقيس على النصاب الفعّال`);
  check(/withLoadPolicies\(instructors, config\)\.map\(person => \[String\(person\.AdInstructorId\), loadCapOf\(person\)\]/.test(server), "آلة الزمن: السقفُ نفسه (الأعلى + الإضافي)");
  const evaluators = ["src/server/core/instructorRequests.ts", "src/server/routes/publicRequestRoutes.ts", "src/server/routes/intelligenceRoutes.ts", "src/server/studyProposalEngine.ts", "src/server/studyProposalRoutes.ts", "src/server/routes/offeringRoutes.ts", "src/utils/sectionOpening.ts", "src/utils/termForecast.ts"];
  check(evaluators.every(file => !/AdInstructorLoad\b[^\n]*\|\|/.test(fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "").replace(/"[^"\n]*"/g, ""))), "لا قراءةَ خامٍ لـAdInstructorLoad في مواضع قياس النصاب");
}

/* ── استثناءُ العضو من اسمه، وشارةُ «استثناء» حيث يظهر النصاب ── */
{
  const instructors = fs.readFileSync("src/components/Instructors.tsx", "utf8");
  check(instructors.includes("<InstructorLoadPanel") && instructors.includes("loadAdmin ?") && instructors.includes("x.LoadPolicy?.exception ? <ExceptionBadge"), "شاشة الأساتذة: بطاقةُ النصاب واستثناؤه في تفاصيل العضو (للمدير الرئيسي)، وشارةٌ في القائمة");
  const consoleSource = fs.readFileSync("src/components/AcademicConsole.tsx", "utf8");
  check(consoleSource.includes("loadAdmin={rootAdmin}") && fs.readFileSync("src/App.tsx", "utf8").includes("rootAdmin={Boolean(user.IsRootAdmin)}\n            demoReadOnly={Boolean(user.IsDemo)}\n          />"), "الصلاحية تصل من الجلسة: المدير الرئيسي وحده يرى المحرّر");
  const editor = fs.readFileSync("src/components/LoadException.tsx", "utf8");
  check(["منصب إداري", "مهمة", "تفرّغ", "أخرى"].every(label => fs.readFileSync("src/utils/teachingLoad.ts", "utf8").includes(`label: "${label}"`)) && editor.includes("LOAD_EXCEPTION_REASONS.map") && editor.includes("بلا نهاية"), "المحرّر: رقائقُ السبب الأربع، وفصلُ انتهاءٍ اختياري");
  check(editor.includes("step={1}") && editor.includes("parseWholeHours(") && editor.includes("onRounded"), "خانةُ الساعات: خطوةٌ صحيحة، والكسرُ يُقرَّب بتلميحٍ لطيف");
  const settings = fs.readFileSync("src/components/TeachingLoadSettings.tsx", "utf8");
  check(settings.includes("<ExceptionBadge") && settings.includes('"overtime" ? `إضافي ${hoursLabel(status.overtimeUsed)}`'), "إعداد النصاب: شارةُ «استثناء» ورقاقةُ «إضافي» الهادئة");
  check(fs.readFileSync("src/components/TeachingLoadNotice.tsx", "utf8").includes("row.exception ? <> <ExceptionBadge"), "شارةُ تنبيه المخطّط تُظهر «استثناء» بجانب العضو");
  const css = fs.readFileSync("src/styles/29-teaching-load.css", "utf8");
  check(/\.tl-chip-overtime\{background:var\(--info-soft\);color:var\(--info\)\}/.test(css) && /\.tl-meter\.is-overtime \.tl-meter-fill\{background:var\(--info\)\}/.test(css), "الإضافيُّ لونٌ هادئ مميَّز (info) لا لونُ خطأ");
}

const notice = fs.readFileSync("src/components/TeachingLoadNotice.tsx", "utf8");
check(!/toast|showToast|alert\(|confirm\(|<Notice|createPortal/.test(notice), "التنبيه شارةٌ هادئة: لا توست ولا نافذة ولا alert");
check(notice.includes("if (!over.length) return null") && notice.includes("data?.enabled"), "لا يظهر إلا إن فُعّلت الميزة وتجاوز عضو");
check(notice.includes("window.setTimeout") && notice.includes("controller.abort()"), "تعديلاتٌ متتابعة تُنتج قراءةً واحدة (تأخير وإلغاء)");
const schedules = fs.readFileSync("src/components/Schedules.tsx", "utf8");
check(schedules.split("<TeachingLoadNotice").length === 2 && schedules.split("import TeachingLoadNotice").length === 2, "شاشة الجدول تضيف الشارة في موضعٍ واحد فقط (استيراد + استخدام)");
const admin = fs.readFileSync("src/components/AdminUsers.tsx", "utf8");
check(/rootAdmin \? \{ value: "teachingLoad"/.test(admin) && admin.includes('mode === "teachingLoad"'), "التبويب في إعدادات الإدارة للمدير الرئيسي وحده");
const repo = fs.readFileSync("src/db/repository.ts", "utf8");
check(repo.includes('collection("teachingLoadConfig").doc(TEACHING_LOAD_DOC_ID)') && repo.includes("db.teachingLoadConfig = [row]"), "التخزين: وثيقةٌ واحدة في Firestore وفي القاعدة المحلية/الديمو");

console.log(`\nTeaching load audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
