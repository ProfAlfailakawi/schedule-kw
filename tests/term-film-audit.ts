/**
 * فيلم الفصل (FR-DSH-031): أرقامٌ حقيقية فقط، ويعمل قبل الاعتماد النهائي «حتى الآن»،
 * ويصبح نهائياً بعده ويبقى في «السجل»؛ للجنة ورئيس القسم وللعميد، لا للأستاذ؛
 * بلا أسماء قاعات ولا أرقام مدنية؛ والمشاركة رابطٌ يُنسخ باليد.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import {
  buildFromRows, clashFromCounts, deanFilm, deliveryFromApproval, deptFilm, earlyPhrase, filmScenes, termFilmPath,
  wishesFromRequests, TERM_FILM_DURATIONS, TERM_FILM_SCENES,
} from "../src/utils/termFilm";

const source = (path: string) => readFileSync(path, "utf8");

/* ── المشاهد السبعة ومددها ── */
assert.equal(TERM_FILM_SCENES.length, 7);
assert.deepEqual([...TERM_FILM_DURATIONS], [3800, 5200, 5400, 5400, 5200, 6200, 4600]);

/* ── بناء الجدول من الصفوف: الشعبة مقرر+رمز، والأستاذ المؤقت لا يُعدّ ── */
const rows = [
  { AdCourseId: 1, SCode: "01", AdInstructorId: 10, fsunday: true, ftuesday: true, fthursday: true, fstarttime: "08:00", fendtime: "08:50" },
  { AdCourseId: 1, SCode: "02", AdInstructorId: 11, fmonday: true, fwednesday: true, fstarttime: "10:00", fendtime: "11:15" },
  { AdCourseId: 2, SCode: "01", AdInstructorId: 99, fsunday: true, fstarttime: "13:00", fendtime: "14:50" },
];
const built = buildFromRows(rows, new Set([99]));
assert.equal(built.sections, 3);
assert.equal(built.courses, 2);
assert.equal(built.teachers, 2, "الأستاذ المؤقت لا يُعدّ أستاذاً");
assert.equal(built.weeklyHours, Math.round((50 * 3 + 75 * 2 + 110) / 60));
assert.equal(built.week.length, 5);
assert.equal(built.week[0][0], 1, "الأحد الثامنة");
assert.equal(built.week[1][1], 1, "الاثنين العاشرة");

/* ── رغبات الأساتذة: المعلّق والملغى والمستبدَل لا تُعدّ، ولا مشهد بلا قرار ── */
assert.equal(wishesFromRequests([{ AdInstructorId: 1, status: "sent", items: [{ decision: { state: "pending" } }] }]), null);
const wishes = wishesFromRequests([
  { AdInstructorId: 1, status: "settled", items: [{ decision: { state: "fixed" } }, { decision: { state: "fixed" } }, { decision: { state: "rejected" } }] },
  { AdInstructorId: 2, status: "sent", items: [{ decision: { state: "fixed", cancelled: true } }] },
  { AdInstructorId: 3, status: "superseded", items: [{ decision: { state: "rejected" } }] },
]);
assert.deepEqual(wishes, { fixed: 2, rejected: 1, pct: 67, asked: 2, replied: 1 });

/* ── التعارضات: من أعلى ما ظهر في النسخ إلى ما بقي الآن ── */
assert.deepEqual(clashFromCounts([3, 7, 1], 0), { peak: 7, now: 0, versions: 3 });
assert.deepEqual(clashFromCounts([], 2), { peak: 2, now: 2, versions: 0 });

/* ── التسليم قبل الاعتماد النهائي: خطواتٌ «بانتظار …»، ولا ادّعاء بالانتهاء ── */
const before = deliveryFromApproval({
  status: "submitted",
  signatures: [{ stage: "committee", at: "2026-11-01T09:00:00Z" }, { stage: "head", at: "2026-11-02T09:00:00Z" }],
  rounds: [{ number: 1, submittedAt: "2026-11-03T09:00:00Z" }],
}, "2026-11-06");
assert.equal(before.final, false);
assert.deepEqual(before.steps.map(step => step.state), ["done", "done", "done", "pending"]);
assert.match(before.steps[3].text, /بانتظار الاعتماد النهائي/);
assert.match(before.headline, /حتى الآن/);
assert.equal(before.daysEarly, 3);

const drafting = deliveryFromApproval(null, "2026-11-06");
assert.deepEqual(drafting.steps.map(step => step.state), ["pending", "pending", "pending", "pending"]);

/* ── بعد الاعتماد النهائي: فيلمٌ نهائي ── */
const after = deliveryFromApproval({
  status: "accepted",
  signatures: [{ stage: "committee", at: "2026-11-01T09:00:00Z" }, { stage: "head", at: "2026-11-02T09:00:00Z" }],
  rounds: [{ number: 1, submittedAt: "2026-11-03T09:00:00Z", acceptedAt: "2026-11-04T09:00:00Z" }],
}, "2026-11-06");
assert.equal(after.final, true);
assert.match(after.steps[3].text, /اعتمد من الجولة الأولى/);
assert.match(after.headline, /قبل الموعد/);
assert.equal(earlyPhrase(-2), null, "المتأخر لا يُمدح");
assert.equal(earlyPhrase(0), "في يوم الموعد");

const sofar = deptFilm({ termName: "الفصل الأول", sectionName: "الرياضيات", collegeName: "العلوم", build: built, wishes, clash: clashFromCounts([4], 1), students: 0, delivery: before });
assert.equal(sofar.final, false);
assert.match(sofar.title[1], /حتى الآن/, "العنوان قبل الاعتماد لا يدّعي انتهاء الفصل");
assert.doesNotMatch(sofar.title[1], /بُني/);
assert.equal(sofar.students, null, "بلا طلبة من «مساري» يسقط المشهد ولا يُخترع رقم");
assert.ok(!filmScenes(sofar).some(scene => scene.key === "students"));

const done = deptFilm({ termName: "الفصل الأول", sectionName: "الرياضيات", collegeName: "العلوم", build: built, wishes, clash: clashFromCounts([4], 0), students: 12, delivery: after });
assert.equal(done.final, true);
assert.match(done.title[1], /بُني/);
assert.equal(filmScenes(done).length, 7);

/* لا أسماء قاعات ولا أرقام مدنية في الفيلم المرسل. */
const wire = JSON.stringify(done);
assert.doesNotMatch(wire, /AdRoom|roomId|Hall|Civil|civil/);

/* ── نسخة العميد ── */
const dean = deanFilm({
  termName: "الفصل الأول", collegeName: "العلوم",
  departments: [
    { sectionName: "الرياضيات", build: built, wishes, clash: clashFromCounts([4], 0), students: 12, delivery: after },
    { sectionName: "الفيزياء", build: built, wishes: null, clash: clashFromCounts([2], 1), students: 3, delivery: before },
  ],
});
assert.equal(dean.version, "dean");
assert.equal(dean.final, false, "الكلية لا تنتهي حتى تُعتمد أقسامها كلها");
assert.equal(dean.build?.trio[0].value, 2);
assert.match(dean.delivery.headline, /اعتُمد 1 من/);
assert.equal(dean.clash?.from, 6);
assert.equal(dean.clash?.to, 1);

/* طالبٌ أرسل لقسمين يُعدّ مرةً واحدة في نسخة الكلية (اتحادُ البصمات). */
const deanUnion = deanFilm({
  termName: "الفصل الأول", collegeName: "العلوم", studentsTotal: 13,
  departments: [
    { sectionName: "الرياضيات", build: built, wishes, clash: clashFromCounts([4], 0), students: 12, delivery: after },
    { sectionName: "الفيزياء", build: built, wishes: null, clash: clashFromCounts([2], 1), students: 3, delivery: before },
  ],
});
assert.match(JSON.stringify(deanUnion.students), /13/);
assert.doesNotMatch(JSON.stringify(deanUnion.students), /15/);

/* الموعدُ الفعلي: تمديدٌ سابقٌ لا يقصّر موعدَ فصلٍ أُجِّل بعده. */
const postponed = deliveryFromApproval({
  status: "submitted", extensionUntil: "2026-11-04",
  signatures: [{ stage: "committee", at: "2026-11-01T09:00:00Z" }, { stage: "head", at: "2026-11-02T09:00:00Z" }],
  rounds: [{ number: 1, submittedAt: "2026-11-03T09:00:00Z" }],
} as any, "2026-11-10");
assert.equal(postponed.daysEarly, 7, "الأبعدُ من موعد الفصل والتمديد");

/* ── الرابط: أرقام النطاق وحدها ── */
assert.equal(termFilmPath({ version: "dept", collegeId: 1, sectionId: 2, termId: 3 }), "/FSchedule/TermFilm?v=dept&college=1&term=3&section=2");
assert.equal(termFilmPath({ version: "dean", collegeId: 1, termId: 3 }), "/FSchedule/TermFilm?v=dean&college=1&term=3");

/* ── الخادم: قراءة فقط، والحارس بالصفة والنطاق ── */
const routes = source("src/server/routes/termFilmRoutes.ts");
assert.match(routes, /Repository\.currentDemoSessionId\(\)/, "مخبأ الفيلم يفصل صناديق التجربة عن البيانات الحقيقية");
assert.match(routes, /app\.get\("\/api\/term-film"/);
assert.match(routes, /app\.get\("\/api\/term-film\/college"/);
assert.doesNotMatch(routes, /app\.(post|put|patch|delete)\(/, "الفيلم لا يكتب شيئاً");
assert.match(routes, /mayReadDepartmentFilm/);
assert.match(routes, /mayReadCollegeFilm/);
assert.match(routes, /isScopeAllowed\(req, collegeId, sectionId\)/);
assert.doesNotMatch(routes, /sendMail|pushMessage|notify/i, "لا رسائل تُرسل من الخادم");
const util = source("src/utils/termFilm.ts");
assert.match(util, /TERM_FILM_DEPT_ROLES = \["committeeChair", "departmentHead", "standard"\]/);
assert.match(util, /TERM_FILM_DEAN_ROLES = \["dean", "viceDean"\]/);
assert.match(source("server.ts"), /registerTermFilmRoutes\(app\)/);

/* ── أماكن الدخول ── */
const dashboard = source("src/components/Dashboard.tsx");
assert.match(dashboard, /TermFilmCard scope=\{filmScope\}/, "بطاقة الفيلم في لوحة اللجنة ورئيس القسم والعميد");
assert.match(dashboard, /role==="dean"\|\|role==="viceDean"/);
const record = source("src/components/IntelligenceWorkspace.tsx");
assert.match(record, /filmFinal \? \[\{ value: "film"/, "يبقى في «السجل» بعد الاعتماد النهائي");
assert.match(record, /body\?\.available && body\?\.final/);
const app = source("src/App.tsx");
assert.match(app, /termFilm: "\/FSchedule\/TermFilm"/);

/* ── الواجهة: تقليل الحركة، والنسخ باليد، والنص الفصيح ── */
const ui = source("src/components/TermFilm.tsx");
assert.match(ui, /prefers-reduced-motion: reduce/);
assert.match(ui, /navigator\.clipboard\.writeText/);
assert.match(ui, /انسخ الرابط/);
assert.match(ui, /IntersectionObserver/);
const css = source("src/styles/term-film.css");
assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);
assert.match(css, /@container \(max-width:560px\)/, "الهاتف يقلب المشغّل عمودياً");
for (const text of [ui, util, routes]) assert.doesNotMatch(text, /ليش|شلون|وايد|زين /, "نصوص الواجهة بالعربية الفصحى");

console.log("✓ فيلم الفصل: أرقامٌ حقيقية، «حتى الآن» قبل الاعتماد ونهائيٌّ بعده، بلا قاعات ولا أرقام مدنية، ورابطٌ يُنسخ باليد");
