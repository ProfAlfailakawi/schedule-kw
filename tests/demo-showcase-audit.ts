/**
 * ── مشهد العرض في الديمو: أول مقرر في الجدول هو ما يشرحه العارض ─────────────────────
 *
 *   D1 أول مقرر في قائمة الجدول «مقدمة في …»، وفي موعده تماماً مقرران آخران: بمستواه وبمستوى مختلف (نفس المستوى أولاً).
 *   D2 التوأمان في الصحيفة الفعّالة (المسار الحقيقي: بذرُ الصحيفة ثم قراءةُ الأزواج): الأول بلا بديل، والثاني له شعبةٌ بديلة.
 *   D3 مواعيدُ المشهد لا تُحدث تعارضَ قاعةٍ ولا أستاذٍ، وأنواعُ القاعات كما سمّاها المالك (عامّان وخاصّان بالقسم).
 *   D4 «مساري» التجريبي: سياسةُ التنقّل ستون دقيقةً للأزواج الثلاثة، وموعدُ الجهراء يلي موعداً رئيسياً بنصف ساعة
 *      فيظهر التلميحُ من تذكرة الطالبة؛ والقاعدةُ المشتركةُ نفسُها تحكم بطاقةَ الأستاذ و«موعد» بالأسماء نفسها.
 *   D5 العزل: الحفظُ في «إضافة مبانٍ وقاعات» مفتوحٌ في الديمو لأن كلَّ كتابةٍ تذهب إلى صندوق الزائر بالذاكرة؛
 *      لا شيء منها يصل Firestore ولا ملفَّ قاعدة البيانات، ولا زائراً آخر، ولا الحقيقيَّ.
 */
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import express from "express";
import { createHmac, createHash } from "crypto";
import type { AddressInfo } from "net";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "showcase-demo-"));
const dbFile = path.join(dir, "db.json");
fs.writeFileSync(dbFile, JSON.stringify({ users: [], formNames: [], formSecurity: [], collegeUserAssign: [], terms: [], colleges: [], sections: [], instructors: [], courses: [], schedules: [], rooms: [], studentNeeds: [], studentProfiles: [] }), { mode: 0o600 });
process.env.NODE_ENV = "test"; process.env.DATA_MODE = "demo"; process.env.SCHEDULE_PRIVATE_DIR = dir;
const quiet = console.warn; console.warn = () => {};
const { Repository, initDatabase } = await import("../src/db/repository");
await initDatabase(); console.warn = quiet;

const { createDemoSandboxState, DEMO_LECTURE_TYPE, DEMO_ROOM_TYPE_SCOPES, DEMO_WORKSHOP_TYPE } = await import("../src/db/demoSandbox");
const { DEMO_SHOWCASE_COREQ, DEMO_SHOWCASE_TOP_CODE, DEMO_TRAVEL_MINUTES, demoTravelPolicyDoc, DEMO_JAHRA_COLLEGE_NAME } = await import("../src/db/demoShowcase");
const { compareCourseSection } = await import("../src/utils/scheduleOrder");
const { sameSlotOf } = await import("../src/utils/sameSlot");
const { coreqFindings, partnersOfCourse } = await import("../src/utils/coreqSections");
const { coreqPairsOfSection, forgetCoreqPairs, sectionPlanFacts } = await import("../src/server/core/coreqPairs");
const { forgetPlanFacts, loadPlanFacts } = await import("../src/utils/planFactsCache");
const { sameLevelLookup, unlockLookup } = await import("../src/utils/planPeers");
const { seedDemoRadar } = await import("../src/server/demoRadarSeed");
const { cleanTravelPolicy, travelShortfalls, TRAVEL_PAIRS } = await import("../src/utils/campusTravelPolicy");
const { travelHints } = await import("../src/utils/campusTravelHint");
const { campusOf } = await import("../src/utils/campusTravel");
const { findConflicts } = await import("../src/utils/scheduleIntelligence");

const state: any = createDemoSandboxState();
const codeOfId = (id: number) => state.courses.find((c: any) => Number(c.AdCourseId) === Number(id))?.CourseCode;
const idOfCode = (code: string) => Number(state.courses.find((c: any) => c.CourseCode === code)?.AdCourseId);
const termRows: any[] = state.schedules.filter((r: any) => Number(r.AdTermId) === 1 && Number(r.AdSectionId) === 1);

/* ── D1 ── */
{
  const sorted = [...termRows].sort((a, b) => compareCourseSection(
    { courseCode: codeOfId(a.AdCourseId), sectionCode: a.SCode, courseName: a.AdCourseName, id: a.id },
    { courseCode: codeOfId(b.AdCourseId), sectionCode: b.SCode, courseName: b.AdCourseName, id: b.id }));
  const top = sorted[0];
  check(codeOfId(top.AdCourseId) === DEMO_SHOWCASE_TOP_CODE && /^مقدمة في /.test(top.AdCourseName), `D1 أول مقرر في قائمة جدول القسم هو «${top.AdCourseName}» (${codeOfId(top.AdCourseId)})`);
  check(String(codeOfId(top.AdCourseId)).length === 7, "D1 رمزه سبعةُ أرقام كبقية المقررات");
  const q = { days: ["fthursday"] as any, start: top.fstarttime, end: top.fendtime, excludeId: top.id, courseId: top.AdCourseId, sectionId: 1, termId: 1, codeOf: codeOfId };
  const found = sameSlotOf(termRows, q);
  /* المشهد عن التطابق التام؛ وما تداخل من مستواه يظهر بعده موسوماً بوقته (tests/same-slot-audit.ts). */
  const items = found.items.filter((item: any) => item.kind === "exact");
  check(found.count - found.partialCount - found.sectionCount === 2 && Boolean(top.fthursday) && !top.fsunday, "D1 «في الوقت نفسه»: مقرران آخران بالضبط في اليوم نفسه والبداية والنهاية نفسيهما", found.count);
  const withOwn = sameSlotOf(termRows, { ...q, excludeId: null });
  check(withOwn.count - withOwn.partialCount - withOwn.sectionCount === 3, "D1 وبحسابِ المقرر نفسه الموعدُ يضم ثلاثة مقررات");
  check(Number(termRows.filter((r: any) => r.fthursday && r.fstarttime === top.fstarttime && r.fendtime === top.fendtime).length) === 3, "D1 لا مقرر رابع في الساعة نفسها");
}

/* ── D2: المسار الحقيقي — صحيفةٌ فعّالة مبذورة داخل صندوق ثم قراءةُ الأزواج بالدالة التي يقرؤها «موعد» ── */
const sandboxId = "demo_showcase_audit";
Repository.createDemoSandbox(sandboxId, 10 * 60_000);
let pairs: number[][] = [];
let facts: any;
await Repository.withDemoSandbox(sandboxId, async () => {
  await seedDemoRadar({ sealIdentity: async (value: string) => `sealed:${value}`, today: new Date().toISOString().slice(0, 10) });
  pairs = await coreqPairsOfSection(1);
  facts = await sectionPlanFacts(1);
});
{
  const pairKey = (a: string, b: string) => `${Math.min(idOfCode(a), idOfCode(b))}|${Math.max(idOfCode(a), idOfCode(b))}`;
  const keys = new Set(pairs.map(([a, b]) => `${a}|${b}`));
  check(DEMO_SHOWCASE_COREQ.every(([a, b]) => keys.has(pairKey(a, b))), "D2 التوأمان في قاعدة الصحيفة الفعّالة (coreq)", pairs);
  const [[a1, b1], [a2, b2]] = DEMO_SHOWCASE_COREQ;
  const rowOf = (code: string, scode = "01") => termRows.find(r => codeOfId(r.AdCourseId) === code && r.SCode === scode)!;
  const none = coreqFindings(rowOf(a1), termRows, partnersOfCourse(pairs, idOfCode(a1)), rowOf(a1).id);
  check(none.length === 1 && none[0].partnerCourseId === idOfCode(b1) && none[0].alternative === false, "D2 التوأم الأول: تداخلٌ ولا بديل ← «يتداخل مع مقرنه» و«لا بديل»", none);
  check(termRows.filter(r => codeOfId(r.AdCourseId) === a1).length === 1 && termRows.filter(r => codeOfId(r.AdCourseId) === b1).length === 1, "D2 لكلٍّ من التوأم الأول شعبةٌ واحدة");
  const alt = coreqFindings(rowOf(a2), termRows, partnersOfCourse(pairs, idOfCode(a2)), rowOf(a2).id);
  check(alt.length === 1 && alt[0].partnerCourseId === idOfCode(b2) && alt[0].alternative === true, "D2 التوأم الثاني: تداخلٌ لكن توجد شعبةٌ بديلة ← التنبيه يسكت", alt);
  check(termRows.filter(r => codeOfId(r.AdCourseId) === b2).length === 2, "D2 للمقرن الثاني شعبتان: الأولى تتداخل والثانية خالية");
  const backward = coreqFindings(rowOf(b1), termRows, partnersOfCourse(pairs, idOfCode(b1)), rowOf(b1).id);
  check(backward.length === 1 && backward[0].alternative === false, "D2 والاتجاه الآخر (من المقرن) يقرأ الحكمَ نفسه", backward);
}

/* ── D2b: الأقران من الصحيفة المبذورة، بالدالة التي يقرؤها المتصفح ── */
{
  const sameLevel = sameLevelLookup(facts.levelGroups), unlockOf = unlockLookup(facts.unlockGroups);
  const top = termRows.find(r => codeOfId(r.AdCourseId) === DEMO_SHOWCASE_TOP_CODE)!;
  const q = { days: ["fthursday"] as any, start: top.fstarttime, end: top.fendtime, excludeId: top.id, courseId: top.AdCourseId, sectionId: 1, termId: 1, codeOf: codeOfId, sameLevel, unlockOf };
  const exact = sameSlotOf(termRows, q).items.filter((item: any) => item.kind === "exact");
  check(exact.length === 2 && exact[0].sameLevel && !exact[1].sameLevel && codeOfId(exact[0].row.AdCourseId) === "0109102" && codeOfId(exact[1].row.AdCourseId) === "0109201", "D2b «تُؤخذ معًا» أولاً ثم مقررٌ غير قرين", exact.map((i: any) => [codeOfId(i.row.AdCourseId), i.sameLevel]));
  const [paper, boards, sound, workshop] = ["0109237", "0109258", "0109247", "0109215"].map(idOfCode);
  check(sameLevel(paper, boards) && sameLevel(paper, sound), "D2b الشفافيات واللوحات والصوت من مستوى واحد في صحيفة واحدة");
  check(unlockOf(paper, boards)?.names[0] === "المجسمات والعرائس", "D2b الشفافيات واللوحات تفتحان المجسمات والعرائس", unlockOf(paper, boards));
  check(Boolean(workshop) && !sameLevel(workshop, paper) && !unlockOf(workshop, paper), "D2b الورشة العامة خارج الصحائف: لا قرين لها");
  const owner = { days: ["fthursday"] as any, start: "11:00", end: "15:00", courseId: paper, sectionId: 1, termId: 1, collegeId: Number(top.AdCollegeId), scode: "501", codeOf: codeOfId, sameLevel, unlockOf };
  const seen = sameSlotOf(termRows, owner).items;
  check(codeOfId(seen[0].row.AdCourseId) === "0109258" && seen[0].unlock?.names[0] === "المجسمات والعرائس", "D2b مثال المالك: اللوحات أولاً بوسم «تفتح»", seen.map((i: any) => codeOfId(i.row.AdCourseId)));
  check(!seen.some((i: any) => Number(i.row.AdCourseId) === workshop), "D2b والورشة المتداخلة لا تظهر");
  const same = sameSlotOf(termRows, { ...owner, start: "14:00", end: "15:15" }).items.find((i: any) => Number(i.row.AdCourseId) === workshop);
  check(Boolean(same) && !same!.sameLevel && !same!.unlock, "D2b وبالتطابق التام تظهر صفّاً عادياً");
}

/* ── D2c: مسار الشارة كله بالشكل الجديد: حمولةُ المسار ← مخبأ المتصفح ← القراءة ← الورقة ── */
{
  const realFetch = globalThis.fetch;
  let asked = "";
  globalThis.fetch = (async (url: string) => { asked = String(url); return new Response(JSON.stringify(facts), { status: 200 }); }) as typeof fetch;
  const wired = await loadPlanFacts(9, 1);
  globalThis.fetch = realFetch;
  forgetPlanFacts();
  check(asked.includes("/api/schedules/coreq-pairs") && asked.includes("sectionId=1"), "D2c الشارة تقرأ مسار الحقائق نفسه", asked);
  check(!("chainPairs" in facts) && !("chainPairs" in wired), "D2c لا سلسلة مدموجة في الحمولة", Object.keys(facts));
  check(wired.levelGroups.length > 0 && wired.levelGroups.every((g: any) => Array.isArray(g.courseIds) && Array.isArray(g.blocked)) && wired.unlockGroups.every((g: any) => Array.isArray(g.blocked)), "D2c كل مجموعة تحمل موانع صحيفتها");
  const sameLevel = sameLevelLookup(wired.levelGroups), unlockOf = unlockLookup(wired.unlockGroups);
  const [drawing, paper, boards] = ["0109217", "0109237", "0109258"].map(idOfCode);
  const college = Number(termRows[0].AdCollegeId);
  check(!sameLevel(drawing, paper) && !unlockOf(drawing, paper), "D2c «الرسوم» مسبقٌ لـ«الشفافيات»: ليسا قرينين");
  check(sameLevel(paper, boards), "D2c والشقيقان بعد مسبقٍ واحد قرينان");
  const owner = { days: ["fthursday"] as any, start: "11:00", end: "15:00", courseId: paper, sectionId: 1, termId: 1, collegeId: college, scode: "501", codeOf: codeOfId, sameLevel, unlockOf };
  const seen = sameSlotOf(termRows, owner).items;
  check(seen[0]?.unlock?.names[0] === "المجسمات والعرائس" && Number(seen[0].row.AdCourseId) === boards && seen[0].kind === "partial", "D2c مثال المالك يبقى: «الشفافيات» 11–15 مع «اللوحات» 12–16 «تفتح»", seen.map((i: any) => [codeOfId(i.row.AdCourseId), i.kind]));
  check(!seen.some((i: any) => Number(i.row.AdCourseId) === drawing && (i.sameLevel || i.unlock)), "D2c و«الرسوم» لا تُوسم قرينةً");
}

/* ── D2d: المقرر التالي يملكه قسمٌ آخر: اسمُه يُجلب ولا تسقط «تفتح» ── */
{
  const saved = { getCurriculumPlans: Repository.getCurriculumPlans, getRuleSet: Repository.getRuleSet, getCoursesBySection: Repository.getCoursesBySection, getCourseById: Repository.getCourseById };
  const askedIds: number[] = [];
  Object.assign(Repository, {
    getCurriculumPlans: async () => [{ id: "p", status: "active" }],
    getRuleSet: async () => ({ rules: [{ courseId: 1, kind: "compulsory", level: 200 }, { courseId: 2, kind: "compulsory", level: 200 }, { courseId: 900, kind: "compulsory", level: 300, prereq: { all: [1, 2] } }, { courseId: 901, kind: "compulsory", level: 300, prereq: { all: [1, 2] } }] }),
    getCoursesBySection: async () => [{ AdCourseId: 1, CourseName: "أ" }, { AdCourseId: 2, CourseName: "ب" }],
    getCourseById: async (id: number) => { askedIds.push(id); return id === 900 ? { AdCourseId: 900, CourseName: "تصميم وإنتاج مقرر خارجي" } : undefined; },
  });
  forgetCoreqPairs();
  const far = await sectionPlanFacts(77);
  Object.assign(Repository, saved);
  forgetCoreqPairs();
  check(far.unlockGroups.map((g: any) => g.nextCourseName).join() === "تصميم وإنتاج مقرر خارجي", "D2d اسمُ المقرر التالي من قسمٍ آخر يُجلب، والمجهولُ صمت", far.unlockGroups);
  check(askedIds.sort().join() === "900,901", "D2d ولا يُسأل إلا عن الأسماء الناقصة", askedIds);
}

/* ── D2e: المقرنات تُقرأ من الصحيفة الفعّالة والانتقالية معاً، كل صحيفةٍ بقواعدها ── */
{
  const saved = { getCurriculumPlans: Repository.getCurriculumPlans, getRuleSet: Repository.getRuleSet, getCoursesBySection: Repository.getCoursesBySection, getCourseById: Repository.getCourseById };
  const sets: Record<string, any> = {
    now: { rules: [{ courseId: 1, kind: "compulsory", coreq: [2] }, { courseId: 2, kind: "compulsory", coreq: [1] }] },
    old: { rules: [{ courseId: 3, kind: "compulsory", coreq: [4] }, { courseId: 1, kind: "compulsory", coreq: [2] }] },
    gone: { rules: [{ courseId: 5, kind: "compulsory", coreq: [6] }] },
  };
  Object.assign(Repository, {
    getCurriculumPlans: async () => [{ id: "now", status: "active" }, { id: "old", status: "transition" }, { id: "gone", status: "archived" }],
    getRuleSet: async (id: string) => sets[id],
    getCoursesBySection: async () => [],
    getCourseById: async () => undefined,
  });
  forgetCoreqPairs();
  const read = await sectionPlanFacts(78);
  Object.assign(Repository, saved);
  forgetCoreqPairs();
  check(read.pairs.map((pair: number[]) => pair.join("-")).sort().join() === "1-2,3-4", "D2e مقرنُ الانتقالية يُقرأ مع الفعّالة، بلا تكرار، والمؤرشفةُ لا تُقرأ", read.pairs);
}

/* ── D3 ── */
{
  const real = (r: any) => !String(r.fdetail || "").includes("حالة تجريبية مقصودة");
  const showcase = new Set(DEMO_SHOWCASE_COREQ.flat().concat([DEMO_SHOWCASE_TOP_CODE, "0109201", "0109215"]));
  /* من «اللوحات» شعبةُ المشهد وحدها: شعبتها الأخرى في مخالفةٍ مقصودة. */
  const mine = termRows.filter(r => showcase.has(codeOfId(r.AdCourseId)) || (codeOfId(r.AdCourseId) === "0109258" && r.SCode === "02"));
  const all = state.schedules.filter((r: any) => Number(r.AdTermId) === 1);
  const clash = findConflicts(mine.map((r: any) => ({ ...r })), all.filter(real) as any);
  const bad = (clash as any[]).filter(c => ["room", "instructor", "teacher"].includes(String(c.type)) || /قاعة|أستاذ/.test(String(c.message || "")));
  check(bad.length === 0, "D3 مواعيدُ المشهد بلا تعارض قاعةٍ ولا أستاذ", bad.slice(0, 2));
  check((findConflicts(all.filter((r: any) => !real(r)), all) as any[]).length >= 1, "D3 (شاهد) والفاحصُ نفسه يجد التعارضَ المقصود في الديمو، فلا يمرّ الفحصُ فارغاً");
  /* وفي النسخة المقبولة أيضاً: شعبتان حُذفتا بعد القبول ما زالتا فيها، ومنهما ما كان يزاحم قاعةً في مشهدٍ سابق. */
  const versionRows: any[] = (state.scheduleVersions as any[]).flatMap(version => (version.rows || []) as any[]).filter(r => Number(r.AdTermId) === 1);
  const vs = findConflicts(mine.map((r: any) => ({ ...r })), [...versionRows, ...all.filter(real)] as any) as any[];
  check(vs.filter(c => ["room", "instructor", "teacher"].includes(String(c.type))).length === 0, "D3 ولا تعارضَ بين مواعيد المشهد وصفوف النسخ المقبولة", vs.slice(0, 2));
  const perHall = new Map<string, number>();
  all.filter(real).forEach((r: any) => perHall.set(String(r.roomId), (perHall.get(String(r.roomId)) || 0) + 1));
  check(Math.max(...perHall.values()) <= 5, "D3 ولا قاعةً فوق خمس محاضرات");
  const types = new Set(state.locationRooms.map((r: any) => r.roomType));
  check(types.has(DEMO_LECTURE_TYPE) && types.has("مختبر حاسوب") && types.has(DEMO_WORKSHOP_TYPE) && !types.has("تدريسية"), "D3 «قاعة تدريسية» و«مختبر حاسوب» و«ورشة» موجودة، والاسمُ القديم غائب", [...types]);
  check(!DEMO_ROOM_TYPE_SCOPES[DEMO_LECTURE_TYPE] && !DEMO_ROOM_TYPE_SCOPES["مختبر حاسوب"] && DEMO_ROOM_TYPE_SCOPES[DEMO_WORKSHOP_TYPE]?.join() === "1" && state.locationRoomTypeScopes[DEMO_WORKSHOP_TYPE]?.join() === "1",
    "D3 العامّان بلا نطاق، و«ورشة» لتكنولوجيا التعليم وحدها");
  check(state.locationRoomTypes.includes(DEMO_LECTURE_TYPE) && state.locationRooms.some((r: any) => r.roomType === DEMO_WORKSHOP_TYPE && r.active), "D3 قائمةُ الأنواع المهيّأة تذكر الأسماء الجديدة، وللورشة قاعةٌ فعّالة");
  check(!/قاعة|room/i.test(JSON.stringify(Object.keys(state.featureDocs?.campusTravelPolicy?.global || {}))), "D3 وثيقة السياسة بلا أسماء قاعات");
}

/* ── D4 ── */
{
  const policy = cleanTravelPolicy(state.featureDocs.campusTravelPolicy.global);
  check(TRAVEL_PAIRS.length === 3 && TRAVEL_PAIRS.every(p => policy.pairs[p.key].minutes === DEMO_TRAVEL_MINUTES) && DEMO_TRAVEL_MINUTES === 60, "D4 سياسةُ التنقّل التجريبية ستون دقيقةً للأزواج الثلاثة");
  check(JSON.stringify(cleanTravelPolicy(demoTravelPolicyDoc())) === JSON.stringify(policy), "D4 والصندوقان يحملان الوثيقة نفسها");
  check(campusOf(DEMO_JAHRA_COLLEGE_NAME) === "jahra" && campusOf("كلية التربية الأساسية") === "main", "D4 اسمُ كلية الجهراء التجريبي يُعرف حرماً مستقلاً");

  const { buildShowcaseSeed, registerStudentShowcase, SHOWCASE_COOKIE } = await import("../src/server/studentShowcase");
  const { registerStudentDoorRoutes } = await import("../src/server/studentDoorRoutes");
  const seed = buildShowcaseSeed(new Date().toISOString().slice(0, 10));
  const jahraCollege = (seed.state as any).colleges.find((c: any) => c.AdCollegeName === DEMO_JAHRA_COLLEGE_NAME);
  check(Boolean(jahraCollege) && (seed.state as any).featureDocs.campusTravelPolicy.global.pairs["jahra|main"].minutes === 60, "D4 كليةُ الجهراء ووثيقةُ الستين دقيقة في صندوق «مساري»");

  const identityKey = createHmac("sha256", "t").update("identity").digest();
  const sealIdentity = async (v: string) => "sealed:" + Buffer.from(v).toString("base64url");
  const app = express(); app.use(express.json());
  registerStudentShowcase(app, { identityKey: async () => identityKey, sealIdentity, isProduction: () => false });
  registerStudentDoorRoutes(app, {
    surveyFingerprint: async c => createHash("sha256").update("fp|" + c).digest("hex").slice(0, 32),
    sealIdentity, openIdentity: async c => Buffer.from(c.replace("sealed:", ""), "base64url").toString(),
    identityKey: async () => identityKey, isProduction: () => false, planSheetTemplate: "",
  });
  const server = app.listen(0); const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const open = await fetch(base + "/me/demo", { redirect: "manual" });
  const jar = open.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
  const ticket = await (await fetch(base + "/api/public/me/ticket", { headers: { cookie: jar } })).json() as any;
  check(open.headers.getSetCookie().join("|").includes(SHOWCASE_COOKIE) && ticket.ready === true, "D4 تذكرةُ «مساري» التجريبي جاهزة");
  check(["fahaheel|jahra", "jahra|main", "fahaheel|main"].every(key => ticket.travel?.[key] === 60), "D4 التذكرة تحمل ستين دقيقةً للأزواج الثلاثة", ticket.travel);
  const items = ticket.plans?.[0]?.items || [];
  const flat = items.flatMap((i: any) => (i.slots || []).map((s: any) => ({ id: String(i.courseId), day: s.day, start: s.start, end: s.end, c: s.c })));
  const jahraSlots = flat.filter((s: any) => s.c === "jahra");
  check(jahraSlots.length > 0, "D4 في الخطة أ شعبةٌ من الجهراء ظاهرةٌ للطالبة", flat.length);
  const hints = travelHints(ticket.travel || {}, flat);
  check(hints.length >= 1 && hints.every(h => h.need === 60 && h.gap < 60),
    "D4 الخطة أ فيها موعدان متتاليان بين الحرمين والفاصلُ أقصر من الستين: التلميح الهادئ ظاهر", hints);
  check(!JSON.stringify(ticket).includes("الجهراء"), "D4 التذكرة لا تحمل اسمَ الكلية ولا هويةً: مفتاحُ الحرم فقط");
  server.close();

  /* القاعدةُ المشتركة نفسُها تحكم بطاقةَ الأستاذ و«موعد»: الجهراء ثم رئيسي بنصف ساعة تُنقص الستين. */
  const campusOfCollege = (id: number) => id === 2 ? campusOf(DEMO_JAHRA_COLLEGE_NAME) : campusOf("كلية التربية الأساسية");
  const shortfall = travelShortfalls(policy, 11, campusOfCollege as any,
    { collegeId: 1, slots: [{ day: "fmonday", start: "17:00", end: "18:15" }] },
    [{ AdCollegeId: 2, fmonday: true, fstarttime: "15:30", fendtime: "16:45" }]);
  check(shortfall.length === 1 && shortfall[0].need === 60 && shortfall[0].gap === 15, "D4 فحصُ الأستاذ و«موعد»: رئيسيٌّ بعد جهراوي بخمسَ عشرة دقيقة ينقصه من الستين", shortfall);
  check(travelShortfalls(policy, 11, campusOfCollege as any, { collegeId: 1, slots: [{ day: "fmonday", start: "18:00", end: "19:15" }] },
    [{ AdCollegeId: 2, fmonday: true, fstarttime: "15:30", fendtime: "16:45" }]).length === 0, "D4 وفاصلُ ساعةٍ وربع كافٍ: لا حكم");
}

/* ── D5: العزل ── */
{
  const source = fs.readFileSync(path.join(process.cwd(), "src/db/repository.ts"), "utf8");
  const body = (name: string) => {
    const start = source.indexOf(`${name}: async`);
    return start < 0 ? "" : source.slice(start, source.indexOf("\n  },", start));
  };
  for (const name of ["upsertLocationBuildings", "upsertLocationRooms", "archiveLocationBuilding", "setLocationRoomTypes", "setLocationRoomTypeScopes"]) {
    const text = body(name).replace(/\s+/g, "");
    check(text.includes("if(firestoreDb&&!demoSandboxContext.getStore())") && !/if\(firestoreDb\)/.test(text), `D5 ${name} لا يصل Firestore من صندوق الديمو`);
  }
  check(/function saveDatabase\(\)[\s\S]*?if \(demoSandboxContext\.getStore\(\)\) return;[\s\S]*?writeFileSync|function saveDatabase\(\)[\s\S]*?if \(demoSandboxContext\.getStore\(\)\) return;/.test(source), "D5 saveDatabase يعود قبل كتابة الملف داخل الصندوق");
  const routes = fs.readFileSync(path.join(process.cwd(), "src/server/routes/locationsRoutes.ts"), "utf8");
  check(!/firestore/i.test(routes.slice(routes.indexOf('"/api/admin/location-setup/buildings"'), routes.indexOf('"/api/admin/location-registry/buildings"'))), "D5 مسارات الإعداد لا تلمس Firestore مباشرةً بل المستودع وحده");
  const ui = fs.readFileSync(path.join(process.cwd(), "src/components/AdminUsers.tsx"), "utf8");
  check(/demoSandbox=\{demoReadOnly\}/.test(ui) && /const demoLocked = demoReadOnly && mode !== "roomSetup"/.test(ui), "D5 الواجهة تفتح الحفظ في «إضافة مبانٍ وقاعات» وحدها وتبقي بقيةَ الإدارة للعرض فقط");

  const before = crypto.createHash("sha256").update(fs.readFileSync(dbFile)).digest("hex");
  const other = "demo_showcase_other";
  Repository.createDemoSandbox(other, 10 * 60_000);
  const countsIn = async (id: string) => Repository.withDemoSandbox(id, async () => ({
    buildings: (await Repository.getLocationBuildings()).length, rooms: (await Repository.getLocationRooms()).length,
    inactive: (await Repository.getLocationBuildings()).filter((b: any) => !b.active).length,
    scopes: JSON.stringify(await Repository.getLocationRoomTypeScopes()),
  }));
  const startA = await countsIn(sandboxId), startB = await countsIn(other), startBase = {
    buildings: (await Repository.getLocationBuildings()).length, rooms: (await Repository.getLocationRooms()).length,
  };
  await Repository.withDemoSandbox(sandboxId, async () => {
    const buildings = await Repository.getLocationBuildings(), rooms = await Repository.getLocationRooms();
    const now = new Date().toISOString();
    await Repository.upsertLocationBuildings([{ ...buildings[0], id: "building_901A09", officialCode: "901A09", buildingNumber: "9", active: true, updatedAt: now } as any]);
    const room = rooms.find((r: any) => r.canonicalCode === "101")!;
    await Repository.upsertLocationRooms([{ ...room, canonicalCode: "111", aliases: [{ value: room.canonicalCode, kind: "historical" }], updatedAt: now } as any]);
    await Repository.archiveLocationBuilding({ ...buildings[1], active: false } as any, rooms.filter((r: any) => r.buildingId === buildings[1].id).map((r: any) => ({ ...r, active: false })));
    await Repository.setLocationRoomTypeScopes({ ...(await Repository.getLocationRoomTypeScopes()), "ورشة": [1, 2] });
  });
  const endA = await countsIn(sandboxId), endB = await countsIn(other);
  const endBase = { buildings: (await Repository.getLocationBuildings()).length, rooms: (await Repository.getLocationRooms()).length };
  check(endA.buildings === startA.buildings + 1 && endA.inactive === startA.inactive + 1 && endA.scopes !== startA.scopes, "D5 الكتابة تعمل داخل صندوق الزائر (إضافة مبنى، تعديل رمز قاعة، إيقاف مبنى، نطاق نوع)", [startA, endA]);
  check(JSON.stringify(endB) === JSON.stringify(startB), "D5 زائرٌ آخر لا يرى شيئاً منها", [startB, endB]);
  check(JSON.stringify(endBase) === JSON.stringify(startBase), "D5 والمستودعُ الحقيقي (خارج الصناديق) لم يتغيّر", [startBase, endBase]);
  check(crypto.createHash("sha256").update(fs.readFileSync(dbFile)).digest("hex") === before, "D5 وملفُّ قاعدة البيانات على القرص بايتاً ببايت كما كان");
  Repository.dropDemoSandbox(sandboxId); Repository.dropDemoSandbox(other);
}

console.log(`\n${passed} passed, ${failed} failed`);
fs.rmSync(dir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
