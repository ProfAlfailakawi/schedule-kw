/**
 * ── بياناتُ الديمو للميزات الجديدة: عضو التدريب، والشاغر، وبدّل القاعتين، وسُلّم البدايات ─────────────────
 * تُحكَم من جدول الصندوق نفسه ومن البذر نفسه (src/server/demoTrainingSeed.ts):
 *
 *   D1  مرحلةُ التدريب: مدرّبان (29 و30) بطلبين بصفة «ta» — هما بعينهما ما تقرؤه ‎/api/ta-trainees‎ — في مرحلةٍ مفتوحة بموجتين.
 *   D2  الشعبُ الشاغرة («هيئة تدريسية»): اثنتان فأكثر في الفصل الجاري بمقررٍ ووقتٍ وقاعة، ولكلّ مدرّبٍ مقررٌ مسموح منها.
 *   D3  بدّل القاعتين: موعدٌ في قاعةٍ لا تلائمه (ورشةٌ في قاعةٍ تدريسية) وتبديلٌ مقترحٌ بنوعه، من جدول الصندوق.
 *   D4  سُلّم البدايات: لا موعدَ للقسم يبدأ الاثنين 8:30، فالأستاذُ الذي يكتبه يُمنع ومعه «الأقرب: 8:00 أو 9:30».
 *   D5  حتميّ ومرّةً واحدة: صندوقان يخزّنان البنية نفسها، والبذرُ مرتين لا يكرّر.
 *   D6  العزل: خارج الديمو لا يبذر شيئاً، وصندوقٌ آخر والمستودعُ الحقيقي لا يقرآن شيئاً، وملفُّ قاعدة البيانات كما هو.
*   D8  أستاذُ «جرّب كأستاذ» (demoTeacherRequest) لا يكون المدرّبَ ذا الطلب المفتوح: فبطاقتُه تُفتح برقمه.
 *   D7  التسلسل: البذرُ في مسار الديمو وحده بعد طلبات الشعب، وأولُ سطرٍ فيه حارسُ الديمو.
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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-training-"));
const dbFile = path.join(dir, "db.json");
fs.writeFileSync(dbFile, JSON.stringify({ users: [], formNames: [], formSecurity: [], collegeUserAssign: [], terms: [], colleges: [], sections: [], instructors: [], courses: [], schedules: [], rooms: [], studentNeeds: [], studentProfiles: [] }), { mode: 0o600 });
process.env.NODE_ENV = "test"; process.env.DATA_MODE = "demo"; process.env.SCHEDULE_PRIVATE_DIR = dir;
const quiet = console.warn; console.warn = () => {};
const { Repository, initDatabase } = await import("../src/db/repository");
await initDatabase(); console.warn = quiet;
const { seedDemoRadar } = await import("../src/server/demoRadarSeed");
const { seedDemoStudyProposals } = await import("../src/server/studyProposalRoutes");
const { demoTeacherRequest } = await import("../src/server/core/demo");
const { seedDemoTrainingPhase } = await import("../src/server/demoTrainingSeed");
const { DEMO_TA_INSTRUCTOR_IDS } = await import("../src/db/demoSandbox");
const { taPhaseId } = await import("../src/server/core/instructorRequests");
const { isTaRequest } = await import("../src/utils/requestParticipation");
const { vacantSections, phaseOpen } = await import("../src/utils/taPhase");
const { placeholderInstructorIds } = await import("../src/server/core/smartImport");
const { readLocationRegistry } = await import("../src/server/core/locations");
const { eligibleHallsForSection } = await import("../src/utils/locationRegistry");
const { roomTypeIn } = await import("../src/utils/roomTypeForSection");
const { appointmentRoomSwaps } = await import("../src/utils/appointmentRoomSwap");
const { judgeRequest } = await import("../src/utils/instructorRequestVerdict");

const fileHash = () => crypto.createHash("sha256").update(fs.readFileSync(dbFile)).digest("hex");
const before = fileHash();
const SCOPE = { collegeId: 1, sectionId: 1, termId: 1 };
const phaseKey = taPhaseId(SCOPE.collegeId, SCOPE.sectionId, SCOPE.termId);

/* ── D6 (قبل أي بذر): خارج الصندوق لا شيء ── */
await seedDemoTrainingPhase();
check(!Repository.isDemoRequest() && (await Repository.getFeatureDoc("taPhases", phaseKey)) === null
  && (await Repository.getInstructorRequests(1, 1, 1)).length === 0, "D6 البذرُ خارج صندوق الزائر لا يكتب شيئاً (ولا يرمي)");

const A = "demo_training_a", B = "demo_training_b", C = "demo_training_probe";
for (const id of [A, B, C]) Repository.createDemoSandbox(id, 10 * 60_000);
const today = new Date().toISOString().slice(0, 10);
/* بترتيب مسار الديمو: الرادارُ، ثم المقترحُ الدراسي (منه الشعبتان الشاغرتان، ويشترط طلبَين قائمين كما في القصص)، ثم مرحلةُ التدريب. */
const prepare = (id: string) => Repository.withDemoSandbox(id, async () => {
  await seedDemoRadar({ sealIdentity: async (value: string) => `sealed:${value}`, today });
  for (const instructorId of [1, 2]) await Repository.createInstructorRequest({ AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdInstructorId: instructorId, linkId: `probe-${instructorId}`, window: { opensAt: new Date().toISOString(), closesAt: new Date(Date.now() + 86_400_000).toISOString() }, source: "draft", status: "sent", items: [], timeline: [] } as any);
  await seedDemoStudyProposals(SCOPE);
  await seedDemoTrainingPhase();
});
await prepare(A); await prepare(B);
const read = (id: string) => Repository.withDemoSandbox(id, async () => {
  const requests = (await Repository.getInstructorRequests(SCOPE.collegeId, SCOPE.sectionId, SCOPE.termId)).filter((row: any) => row.status !== "superseded");
  return {
    doc: await Repository.getFeatureDoc<any>("taPhases", phaseKey),
    trainees: [...new Set(requests.filter((row: any) => isTaRequest(row)).map((row: any) => Number(row.AdInstructorId)))].sort((x, y) => x - y),
    taRequests: requests.filter((row: any) => isTaRequest(row)).map((row: any) => ({ who: row.AdInstructorId, status: row.status, mode: row.linkMode, opened: Boolean(row.linkOpenedAt), items: row.items.length })).sort((x: any, y: any) => x.who - y.who),
    links: (await Repository.getShareLinks(SCOPE.collegeId, SCOPE.sectionId, SCOPE.termId)).filter((link: any) => /مرحلة التدريب/.test(String(link.label))).length,
    instructors: await Repository.getInstructors(SCOPE.termId),
    rows: await Repository.getSchedulesByScope(SCOPE),
  };
});
const a = await read(A), b = await read(B);

/* ── D1 ── */
check(JSON.stringify(a.trainees) === JSON.stringify([...DEMO_TA_INSTRUCTOR_IDS]), "D1 المتدرّبان في الصندوق هما 29 و30 (ما تقرؤه /api/ta-trainees)", a.trainees);
check(a.taRequests.length === 2 && a.taRequests.every((row: any) => row.mode === "ta" && row.status === "sent"), "D1 لكلٍّ منهما طلبٌ واحدٌ بصفة «ta» أُرسل", a.taRequests);
check(a.taRequests[0].opened && !a.taRequests[1].opened, "D1 الأولُ فتح رابطه والثاني لم يفتح (حالةٌ مقروءة)", a.taRequests);
check(a.links === 2 && a.doc && a.doc.waves.length === 2 && a.doc.waves.every((wave: any) => wave.sentAt) && phaseOpen(a.doc), "D1 رابطان ومرحلةٌ مفتوحةٌ بموجتين أُرسلتا", a.doc);
check((a.instructors as any[]).filter(row => row.AdInstructorCategory === "ta").map(row => Number(row.AdInstructorId)).sort().join() === "29,30", "D1 والفئةُ «ta» للمدرّبين وحدهما");

/* ── D2 ── */
const vacant = vacantSections(a.rows as any, placeholderInstructorIds(a.instructors as any));
check(vacant.length >= 2 && vacant.every(item => item.courseId && item.days.length && item.start && item.end && item.room), "D2 شعبتان شاغرتان فأكثر في الجدول بمقررٍ وأيامٍ ووقتٍ وقاعة", vacant);
check(Object.values(a.doc.allowedCourses).length === 2 && Object.values(a.doc.allowedCourses as Record<string, number[]>).every(list => list.every(id => vacant.some(item => item.courseId === id))), "D2 ولكلّ مدرّبٍ مقررٌ مسموحٌ من الشعب الشاغرة", a.doc.allowedCourses);

/* ── D3 ── كما يحسبه مسارُ /api/schedules/room-swap-ideas: القاعاتُ المؤهّلة للقسم بنوعها فيه، وأسبوعُ الفصل كلُّه ── */
const swapScene = await Repository.withDemoSandbox(A, async () => {
  const registry = await readLocationRegistry(true);
  const halls = eligibleHallsForSection(registry, 1).map((hall: any) => {
    const room = registry.rooms.find((item: any) => item.id === hall.roomId);
    return { room: String(hall.room), hall: String(hall.hall), buildingId: hall.buildingId, roomId: hall.roomId, roomType: roomTypeIn(room, 1, registry.roomTypeScopes), capacity: room?.capacity ?? null };
  });
  const universe = (await Repository.getSchedulesByScope({ termId: 1 })) as any[];
  const courseMap = new Map((await Repository.getCourses() as any[]).map(course => [Number(course.AdCourseId), course]));
  const mine = universe.filter(row => Number(row.AdSectionId) === 1);
  return mine.map(row => ({ row, course: courseMap.get(Number(row.AdCourseId)), answer: appointmentRoomSwaps({ draft: { ...row }, rows: universe, halls, courses: courseMap as any,
    movable: item => Number(item.AdCollegeId) === 1 && Number(item.AdSectionId) === 1 && Number(item.AdTermId) === 1 }, 4) }));
});
const withSwaps = swapScene.filter(item => item.answer.need === "poor" && item.answer.swaps.length);
check(withSwaps.length >= 2, "D3 موعدان فأكثر في قاعةٍ لا تلائمهما ولكلٍّ تبديلٌ مقترح (تظهر بطاقةُ «بدّل القاعتين»)", withSwaps.length);
const workshop = withSwaps.find(item => item.answer.swaps.some(swap => /ورشة/.test(swap.other.courseName)));
check(Boolean(workshop), "D3 ومن اقتراحاتها تبديلٌ مع «ورشة إنتاج وسائل تعليمية خاصة» الجالسةِ في قاعةٍ لا تلائمها", withSwaps.map(item => [item.course?.CourseName, item.answer.swaps.map(swap => swap.other.courseName)]));
check(withSwaps.every(item => item.answer.swaps.every(swap => swap.reasons.length && swap.other.rowId > 0 && swap.other.from.roomId !== swap.other.to.roomId)), "D3 وكلُّ اقتراحٍ بسببٍ مذكور (نوعٌ أو سعة) ويحرّك شعبةً حقيقيةً إلى قاعةٍ مختلفة");

/* ── D4 ── */
check(!swapScene.some(item => item.row.fmonday && item.row.fstarttime === "08:30"), "D4 لا موعدَ للقسم يبدأ الاثنين 8:30 (فالسُّلّم يمنعه)");
const course = swapScene.map(item => item.course).find(item => item && Number(item.CourseHours) === 3);
const verdict = judgeRequest(
  { rowId: null, tempId: -1, action: "add", AdCourseId: course.AdCourseId, days: ["fmonday"], start: "08:30" } as any,
  { instructorId: 5, allRows: [], instructorRowsAfter: [], courses: new Map([[Number(course.AdCourseId), course]]), instructors: new Map(), knownRoomKeys: [], ladderBlocks: true } as any);
const ladder = verdict.reasons.find((reason: any) => reason.code === "ladder");
check(!verdict.sendable && Boolean(ladder?.blocking) && /الأقرب: 8:00 أو 9:30\./.test(ladder?.text || "") && !/قاعة/.test(ladder?.text || ""), "D4 الاثنين 8:30 ممنوعٌ «غير معتمد» ومعه «الأقرب: 8:00 أو 9:30» بلا ذكر قاعة", ladder);

/* ── D5 ── */
const shape = (value: typeof a) => JSON.stringify({ trainees: value.trainees, taRequests: value.taRequests, links: value.links, waves: value.doc.waves.map((wave: any) => wave.instructorIds), allowed: value.doc.allowedCourses });
check(shape(a) === shape(b), "D5 صندوقان منفصلان يخزّنان البنيةَ نفسها (حتميّ)");
await prepare(A);
const again = await read(A);
check(again.taRequests.length === 2 && again.links === 2, "D5 والبذرُ مرتين لا يكرّر الطلبَ ولا الرابط");

/* ── D8 ── أستاذُ «جرّب كأستاذ» لا يكون مدرّباً (لا مواعيد له فلا بطاقة): الطلباتُ بصفة «ta» لا تُختار ── */
{
  const picked = await Repository.withDemoSandbox(A, async () => demoTeacherRequest());
  check(Boolean(picked) && !isTaRequest(picked as any) && !DEMO_TA_INSTRUCTOR_IDS.includes(Number(picked?.AdInstructorId) as any), "D8 أستاذُ التجربة ليس مدرّباً (فبطاقتُه تُفتح برقمه) رغم أن طلب المدرّب الأول مفتوحٌ ولم يُرسَل", picked && { who: picked.AdInstructorId, mode: (picked as any).linkMode });
}

/* ── D6 ── */
const probe = await read(C);
check(probe.doc === null && probe.trainees.length === 0, "D6 وصندوقٌ لم يُبذر لا يرى مرحلةً ولا متدرّبين");
check((await Repository.getFeatureDoc("taPhases", phaseKey)) === null && (await Repository.getInstructorRequests(1, 1, 1)).length === 0, "D6 والمستودعُ الحقيقي (خارج الصناديق) لا يرى شيئاً");
check(fileHash() === before, "D6 وملفُّ قاعدة البيانات على القرص بايتاً ببايت كما كان");

/* ── D7 ── */
{
  const auth = fs.readFileSync("src/server/routes/authRoutes.ts", "utf8");
  const section = auth.indexOf('run("section requests"'), training = auth.indexOf('run("training phase", seedDemoTrainingPhase)');
  check(section > 0 && training > section && auth.indexOf('import { seedDemoTrainingPhase } from "../demoTrainingSeed"') > 0, "D7 البذرُ في مسار الديمو بعد طلبات الشعب");
  const seed = fs.readFileSync("src/server/demoTrainingSeed.ts", "utf8");
  check(/export async function seedDemoTrainingPhase\(\): Promise<void> \{\n  if \(!Repository\.isDemoRequest\(\)\) return;/.test(seed), "D7 وأولُ سطرٍ في البذر حارسُ الديمو");
  check(!/Math\.random/.test(seed.replace(/\/\*[\s\S]*?\*\//g, "")), "D7 ولا عشوائيةَ في البذر");
}

for (const id of [A, B, C]) Repository.dropDemoSandbox(id);
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
