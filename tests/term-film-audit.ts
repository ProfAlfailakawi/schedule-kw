/**
 * فيلم الفصل (FR-DSH-031): أرقامٌ حقيقية فقط، ويعمل قبل الاعتماد النهائي «حتى الآن»،
 * ويصبح نهائياً بعده ويبقى في «السجل»؛ للجنة ورئيس القسم وللعميد، لا للأستاذ؛
 * بلا أسماء قاعات ولا أرقام مدنية؛ والمشاركة رابطٌ يُنسخ باليد.
 *
 * والفيلم مسرحٌ حيّ: خلفيته شكل بصمة القسم أقواساً بلا أي نص (ولمن يرى البصمة
 * فقط)، ومشهد «أسبوعك في لقطة» من خريطة الأسبوع، وختامٌ باسم القسم وأعداده،
 * وموسيقى اختيارية لا تبدأ إلا بنقرة.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { buildFingerprint, fingerprintGeometry, fingerprintShape, DEPT_FINGERPRINT_ROLES } from "../src/utils/deptFingerprint";
import {
  buildFromRows, clashFromCounts, deanFilm, deliveryFromApproval, deptFilm, earlyPhrase, filmScenes, mergeWeekMaps, termFilmPath,
  weekContourShape, weekMapFromRows, wishesFromRequests, TERM_FILM_DEPT_ROLES, TERM_FILM_DURATIONS, TERM_FILM_SCENES,
} from "../src/utils/termFilm";

const source = (path: string) => readFileSync(path, "utf8");

/* ── المشاهد الثمانية ومددها: الفيلم كله دون الدقيقة ── */
assert.deepEqual([...TERM_FILM_SCENES], ["title", "build", "week", "wishes", "clash", "students", "delivery", "thanks"]);
assert.deepEqual([...TERM_FILM_DURATIONS], [3600, 4800, 6400, 5200, 5200, 4800, 6200, 6000]);
assert.equal(TERM_FILM_DURATIONS.length, TERM_FILM_SCENES.length);
assert.ok(TERM_FILM_DURATIONS.reduce((sum, ms) => sum + ms, 0) < 60_000, "قصة الجدول في أقل من دقيقة");

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

/* ── «أسبوعك في لقطة»: خريطة الأسبوع ساعةً ساعة وأرقامها، من صفوف الجدول وحدها ── */
const map = built.map;
assert.deepEqual([map.from, map.to], [480, 900], "المدى من الثامنة إلى نهاية آخر ساعة فيها محاضرة");
assert.equal(map.hours.length, 5);
assert.equal(map.hours[0].length, 7);
assert.deepEqual(map.perDay, [2, 1, 1, 1, 1], "الأحد محاضرتان");
assert.equal(map.lectures, 6);
assert.deepEqual([map.earliest, map.latest], [480, 890]);
assert.equal(map.hours[0][0], 1, "الأحد الثامنة");
assert.deepEqual(map.hours[0].slice(5), [1, 1], "محاضرة 13:00–14:50 تملأ ساعتيها");
assert.equal(map.hours[1][2], 1, "الاثنين العاشرة");
assert.equal(map.hours[1][3], 1, "وتمتدّ إلى 11:15");
assert.deepEqual(weekMapFromRows([...rows, rows[0]]).perDay, map.perDay, "الصف المكرّر يُعدّ مرةً واحدة");
assert.equal(weekMapFromRows([{ AdCourseId: 5, SCode: "01", fsunday: true }]).lectures, 0, "صفٌّ بلا وقت لا يدخل الخريطة");
const evening = weekMapFromRows([{ AdCourseId: 9, SCode: "01", fmonday: true, fstarttime: "17:00", fendtime: "20:30" }]);
const merged = mergeWeekMaps([map, evening]);
assert.deepEqual([merged.from, merged.to], [480, 1260], "خريطة الكلية على مدًى واحد يجمع الأقسام");
assert.equal(merged.hours[1][9], 1, "مساء الاثنين من قسمٍ آخر");
assert.equal(merged.hours[0][0], 1);
assert.deepEqual(merged.perDay, [2, 2, 1, 1, 1]);
assert.deepEqual([merged.earliest, merged.latest], [480, 1230]);
assert.equal(mergeWeekMaps([]).lectures, 0);

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
assert.equal(sofar.week?.eyebrow, "أسبوعك في لقطة");
assert.deepEqual(sofar.week?.facts.map(fact => fact.value), ["الأحد", "8:00", "14:50"], "أكثر الأيام ازدحاماً، وبداية أول محاضرة، ونهاية آخر محاضرة");
assert.match(sofar.week!.facts[0].label, /محاضرتان/, "العدد بصيغته العربية");
assert.deepEqual(sofar.week?.perDay, [2, 1, 1, 1, 1]);
assert.equal(sofar.week?.days.length, 5);
assert.doesNotMatch(JSON.stringify(sofar.week), /[٠-٩٪]/, "أرقام لاتينية فقط");
assert.equal(deptFilm({ termName: "ف", sectionName: "س", collegeName: "ك", build: buildFromRows([{ AdCourseId: 1, SCode: "01" }]), wishes: null, clash: null, students: 0, delivery: before }).week, null, "بلا مواعيد يسقط مشهد الأسبوع");
assert.equal(sofar.backdrop, null, "الباني الخالص لا يحمل خلفية: يضيفها الخادم لمن يرى البصمة");

/* ── الختام: اسم القسم وفصله وأعداده الحقيقية ── */
assert.equal(sofar.closing.name, "قسم الرياضيات");
assert.equal(sofar.closing.term, "الفصل الأول");
assert.deepEqual(sofar.closing.counts.map(item => item.value), [3, 2], "شعب القسم وأساتذته؛ ولا طلبة بلا «مساري»");
assert.match(sofar.closing.line, /يبني/, "قبل الاعتماد لا يدّعي الختام أن البناء انتهى");

const done = deptFilm({ termName: "الفصل الأول", sectionName: "الرياضيات", collegeName: "العلوم", build: built, wishes, clash: clashFromCounts([4], 0), students: 12, delivery: after });
assert.equal(done.final, true);
assert.match(done.title[1], /بُني/);
assert.equal(filmScenes(done).length, 8);
assert.deepEqual(filmScenes(done).map(scene => scene.key), [...TERM_FILM_SCENES]);
assert.deepEqual(done.closing.counts.map(item => item.value), [3, 2, 12]);
assert.match(done.closing.line, /بنى/);

/* ── الخلفية: شكل البصمة بلا أي نص. لا اسم قاعة ولا مقرر ولا شعبة يعبر إلى الفيلم ── */
const SECRET_HALLS = ["SCI/B-101", "قاعة ابن الهيثم"];
const print = buildFingerprint({
  sectionName: "الرياضيات", termName: "الفصل الأول", collegeName: "العلوم",
  rows: [
    { hallKey: "h1", hallName: SECRET_HALLS[0], capacity: 40, courseId: 1, courseCode: "MATH101", courseName: "تفاضل وتكامل", section: "01", seats: 30, days: [true, false, true, false, true], start: "08:00", end: "08:50" },
    { hallKey: "h2", hallName: SECRET_HALLS[1], capacity: 20, courseId: 2, courseCode: "MATH202", courseName: "جبر خطي", section: "02", seats: 50, days: [false, true, false, true, false], start: "10:00", end: "11:15" },
  ],
});
const shape = fingerprintShape(print);
assert.equal(shape.halls.length, 2, "حلقةٌ لكل قاعة");
const stringsIn = (value: unknown, found: string[] = []): string[] => {
  if (typeof value === "string") found.push(value);
  else if (value && typeof value === "object") for (const item of Object.values(value as object)) stringsIn(item, found);
  return found;
};
assert.deepEqual(stringsIn(shape), [], "شكل الخلفية أرقامٌ ومنطقيات فقط: لا نص فيه أصلاً");
assert.deepEqual(Object.keys(shape).sort(), ["halls", "hours", "span"]);
assert.deepEqual(Object.keys(shape.halls[0]), ["slots"], "الحلقة بلا اسم ولا سعة");
assert.deepEqual(Object.keys(shape.halls[0].slots[0]).sort(), ["day", "end", "fill", "over", "start"], "القوس بلا مقرر ولا شعبة");
const withBackdrop = { ...done, backdrop: shape };
const wire = JSON.stringify(withBackdrop);
for (const secret of [...SECRET_HALLS, "MATH101", "MATH202", "تفاضل", "جبر خطي"]) assert.ok(!wire.includes(secret), `الفيلم المرسل لا يحمل «${secret}»`);
/* لا أسماء قاعات ولا أرقام مدنية في الفيلم المرسل. */
assert.doesNotMatch(wire, /AdRoom|roomId|Hall|hallName|Civil|civil|capacity|"name":"SCI/);
/* الهندسة نفسها ترسم الشكل المجرّد كما ترسم البصمة: لا تكرار لحسابها. */
assert.deepEqual(fingerprintGeometry(shape).arcs.map(arc => arc.d), fingerprintGeometry(print).arcs.map(arc => arc.d));
assert.ok(fingerprintGeometry(shape).arcs.some(arc => arc.rim), "ما فوق السعة يبقى بحافته");

/* ── الخلفية البديلة من حِمل الأسبوع وحده (نسخة الكلية، أو قسمٌ بلا قاعات) ── */
const contour = weekContourShape(done.week!);
assert.ok(contour.halls.length >= 1, "حلقةٌ لكل مستوى ازدحام");
assert.deepEqual(stringsIn(contour), [], "لا نص فيها ولا قاعة أصلاً");
assert.deepEqual(contour, weekContourShape(done.week!), "حتميّة");
assert.ok(fingerprintGeometry(contour).arcs.length >= 5);
assert.equal(weekContourShape({ from: 480, to: 840, hours: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] }).halls.length, 0, "أسبوعٌ فارغ بلا حلقات");

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
assert.equal(dean.week?.eyebrow, "أسبوع الكلية في لقطة");
assert.deepEqual(dean.week?.perDay, [4, 2, 2, 2, 2], "أسبوع الكلية مجموع أقسامها");
assert.equal(dean.closing.name, "كلية العلوم");
assert.deepEqual(dean.closing.counts.map(item => item.value), [2, 4, 15]);
assert.equal(dean.backdrop, null, "نسخة الكلية لا تحمل بصمة قسم");

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
/* خلفية البصمة: شكلٌ مجرّد فقط، ولمن يرى البصمة، ولا تُحمل في نسخة الكلية. */
assert.match(routes, /fingerprintShape\(buildFingerprint\(/, "الخادم يجرّد البصمة من نصوصها قبل حملها");
assert.match(routes, /mayCarryFingerprint\(req\) \? film : \{ \.\.\.film, backdrop: null \}/, "من لا يرى البصمة لا تُحمل له خلفيتها");
assert.match(routes, /DEPT_FINGERPRINT_ROLES/);
assert.equal((routes.match(/backdropFor\(/g) || []).length, 2, "تعريفٌ واحد ونداءٌ واحد: نسخة القسم وحدها");
assert.doesNotMatch(routes, /hallName|roomDisplay|AdRoomHall|AdRoomCode/, "مسار الفيلم لا يقرأ اسم قاعة");
assert.deepEqual([...TERM_FILM_DEPT_ROLES].sort(), [...DEPT_FINGERPRINT_ROLES].sort(), "صفات نسخة القسم هي صفات البصمة: لا يرى الخلفية من لا يرى البصمة");
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
assert.match(css, /@container \(max-width:560px\)/, "المسرح الضيّق: أزرار الشريط أيقوناتٌ بمقاس اللمس");
assert.match(css, /@container \(max-aspect-ratio:1\/1\)/, "المسرح الطولي (الهاتف) يكبّر الوحدة ويقلب خريطة الأسبوع");

/* ── يُفتح كما يُفتح فيلم: ينزلق إلى المسرح، والمسرح بأزراره داخل الشاشة ── */
assert.match(ui, /scrollIntoView\(\{ behavior: reduce \? "auto" : "smooth", block: "start" \}\)/);
assert.match(ui, /--tf-above/);
assert.match(css, /max-height:max\(248px,calc\(100dvh - var\(--topbar-h,64px\) - var\(--dock-h,0px\) - env\(safe-area-inset-bottom,0px\) - var\(--tf-above,0px\) - 24px\)\)/, "المسرح بين الشريط العلوي وشريط الهاتف السفلي");
assert.match(css, /scroll-margin-top:calc\(var\(--topbar-h,64px\) \+ 12px\)/);
assert.match(css, /--u:min\(1cqw,1\.7778cqh\)/, "الوحدة لا تتجاوز ما يسعه ارتفاع المسرح");
assert.match(css, /\.tf-player\.is-full\{[^}]*height:100%/, "ملء الشاشة باقٍ");

/* ── الخلفية الحيّة: هندسة البصمة نفسها، أقواسٌ بلا نص ── */
assert.match(ui, /fingerprintGeometry\(shape\)/, "الخلفية ترسمها هندسة البصمة نفسها");
assert.match(ui, /weekContourShape\(film\.week\)/, "وبلا بصمةٍ تُرسم من حِمل الأسبوع");
const backdrop = ui.slice(ui.indexOf("const Backdrop"), ui.indexOf("const RING"));
assert.ok(backdrop.length > 400);
assert.doesNotMatch(backdrop, /<text|<tspan|<title|dayLabels|\.name|\.title|aria-label/, "الخلفية لا ترسم نصاً ولا اسماً");
assert.match(backdrop, /aria-hidden="true"/);
assert.doesNotMatch(ui, /hallPulse|movementPaths/, "لا نبض قاعات ثلاثي الأبعاد في الفيلم");
assert.doesNotMatch(ui, /halls\[[^\]]*\]\.name|hall\.name|fingerprintSlotLines|fingerprintHeadlines/, "الشاشة لا تقرأ اسم قاعة");
assert.match(css, /\.tf-player\.is-closing \.tf-mark\{/, "الخلفية تستقرّ شعاراً في الختام");
assert.match(css, /\.tf-veil\{/, "ستارٌ يُبقي النص واضحاً فوق الخلفية");

/* ── اللوحة الليلية كما هي (تشاركها «فيلمي») ── */
for (const token of ["--stage:#0d241f", "--stage-2:#143730", "--ink:#eef5f0", "--dim:#9fbab0", "--rule:#2a4c43", "--calm:#4fd3a1", "--warm:#f0b24a", "--hot:#f0674f", "--gold:#e2bd76"]) {
  assert.ok(css.includes(token), `لوحة المسرح تحمل ${token}`);
}

/* ── تقليل الحركة: لا دوران ولا عدّ ولا ختم، وتلاشٍ بسيط ── */
assert.match(ui, /if \(!el \|\| reduce \|\| typeof el\.animate !== "function"\) return;/, "لا دوران لمن قلّل الحركة");
assert.match(ui, /if \(reduce\) \{ setShown\(to\); return; \}/, "ولا عدّ: الرقم النهائي");
const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion:reduce)"));
assert.match(reduced, /\.tf-scene,\.tf-scene\.on,\.tf-scene\.out\{transform:none;filter:none;transition:opacity \.35s ease/);
assert.match(reduced, /animation:none/);
assert.match(reduced, /\.tf-mark,[^{]*\{transition:none\}/);

/* ── الموسيقى: مولَّدة في المتصفح، مطفأة حتى تُشغَّل بنقرة، وتسكت مع الإيقاف وإخفاء التبويب والمغادرة ── */
const sound = source("src/components/termFilmSound.ts");
assert.doesNotMatch(sound, /new Audio\(|<audio|\.mp3|\.ogg|\.wav|\.m4a|fetch\(|import .* from "(?!\.)/, "لا ملف صوت ولا مكتبة");
assert.match(sound, /createOscillator\(\)/);
assert.match(sound, /=== "1"; \} catch \{ return false; \}/, "مطفأة ما لم يُحفظ اختيارٌ بتشغيلها، والحفظ المغلق لا يكسر شيئاً");
assert.match(sound, /try \{ window\.localStorage\.setItem\(/);
assert.match(sound, /if \(!Ctor\) return false;/, "حيث لا AudioContext تسكت بلا خطأ");
const playBody = sound.slice(sound.indexOf("  play(): void"), sound.indexOf("  /** يُسكت"));
assert.doesNotMatch(playBody, /new Ctor|audioCtor\(/, "التشغيل لا ينشئ سياق الصوت: ينشئه `unlock` من نقرةٍ فقط");
assert.match(playBody, /if \(!ctx \|\| !master\) return;/);
const unlockCalls = [...ui.matchAll(/filmSound\.unlock\(\)/g)].length;
assert.equal(unlockCalls, 3, "إيقاظ الصوت في ثلاثة مواضع، كلها معالجات نقر: زرّ الموسيقى، وأزرار المشغّل، و«شاهد»");
assert.match(ui, /const wake = \(\) => \{ if \(sound && filmSound\.unlock\(\) && audible\.current\) filmSound\.play\(\); \};/, "فتح الصوت بنقرةٍ والفيلم يجري يرفع الفرشة فوراً");
assert.doesNotMatch(ui.replace(/const wake = [^\n]*\n/, "").replace(/const toggleSound = \(\) => \{[\s\S]*?\n  \};/, "").replace(/const toggleOpen = \(\) => \{[\s\S]*?\n  \};/, ""), /filmSound\.unlock/, "ولا إيقاظ خارج معالج نقر");
assert.match(ui, /audible\.current = sound && rolling && visible;/, "تجري مع الفيلم فقط: تسكت عند الإيقاف وإخفاء التبويب");
assert.match(ui, /document\.addEventListener\("visibilitychange"/);
assert.match(ui, /useEffect\(\(\) => \(\) => \{ audible\.current = false; filmSound\.hush\(\); \}, \[\]\);/, "وتسكت عند مغادرة الشاشة");
assert.match(ui, /aria-pressed=\{sound\}/);
assert.match(ui, /شغّل الموسيقى/);

for (const text of [ui, util, routes, sound]) assert.doesNotMatch(text, /ليش|شلون|وايد|زين /, "نصوص الواجهة بالعربية الفصحى");

console.log("✓ فيلم الفصل: أرقامٌ حقيقية، «حتى الآن» قبل الاعتماد ونهائيٌّ بعده، بلا قاعات ولا أرقام مدنية، ورابطٌ يُنسخ باليد؛ وخلفيةٌ من البصمة بلا نص، وأسبوعٌ في لقطة، وختامٌ باسم القسم، وموسيقى لا تبدأ إلا بنقرة");
