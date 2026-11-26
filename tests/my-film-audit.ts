/**
 * فيلمي (FR-DSH-033): النسخةُ الشخصية القصيرة من «فيلم الفصل».
 *   • للأستاذ من رابطه: محاضراته وأيامه ورغباته التي ثُبّتت — **بلا اسم قاعةٍ ولا رمزها** في الجواب أصلاً،
 *     ولا يأخذ أحدٌ فيلمَ غيره: صاحبُ الفيلم صاحبُ الرابط، ولا يُقبل رقمٌ من العنوان.
 *   • وللأستاذ من بطاقته ‎/s/:token‎: حاملُ البطاقة كما تعرفه البطاقة (تذكرةٌ موقّعة بعد التحقق أو مفتاحُ جهازه)،
 *     فيلمُه وحده، ومن لا محاضراتَ له لا بطاقةَ «فيلمي» له ولا فيلم.
 *   • للطالب داخل «مساري»: مما تعرضه له «مساري» أصلاً، بجلسته وحدها.
 *   • أرقامٌ حقيقية فقط، والمشهدُ الذي لا بيانات له يسقط، ويُروى «حتى الآن» قبل الاعتماد النهائي.
 *   • قراءةٌ فقط: لا مسارَ كتابة، ولا كتابةَ في المستودع، ولا رقمَ مدنياً في الجواب.
 * القسمُ الأخير يشغّل المسارين على خادمٍ حقيقي داخل صندوقٍ تجريبي (لا بيانات حقيقية)، لا على نصّ المصدر وحده.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import {
  clockOf, dayList, durationText, instructorFilm, lecturesFromRows, studentFilm, studentFilmInputFrom, teachingScopes, weekOf, wishesFromItems,
  MY_FILM_DURATIONS, type MyFilmData, type MyFilmPart,
} from "../src/utils/myFilm";
import { placeFieldsIn } from "../src/utils/teacherSafeFields";
import { MY_FILM_CSS, MY_FILM_ENTRY_BODY, MY_FILM_ENTRY_CSS, MY_FILM_JS, MY_FILM_STAGE_VARS, myFilmPage } from "../src/server/myFilmPage";

const source = (path: string) => readFileSync(path, "utf8");
const textOf = (film: MyFilmData | null) => JSON.stringify(film);
const sceneOf = (film: MyFilmData | null, key: string) => film?.scenes.find(scene => scene.key === key);
const partOf = <T extends MyFilmPart["t"]>(film: MyFilmData | null, key: string, t: T) =>
  sceneOf(film, key)?.parts.find(part => part.t === t) as Extract<MyFilmPart, { t: T }> | undefined;

/* ── الوقت والأيام والمدة ── */
assert.equal(clockOf(8 * 60), "08:00");
assert.equal(clockOf(14 * 60 + 50), "14:50");
assert.equal(dayList([2, 0]), "الأحد والثلاثاء");
assert.equal(durationText(375), "6 ساعات و15 دقيقة", "المدةُ بدقائقها، بلا تقريبٍ إلى كسر ساعة");
assert.equal(durationText(120), "ساعتان");
assert.equal(durationText(50), "50 دقيقة");
assert.equal(durationText(60), "ساعة واحدة");

/* ── محاضراتُ الأستاذ من صفوف جدوله الرسمي: صفوفُه هو، بأرقامٍ موجبة، بلا حقل مكان ── */
const ROOM = "ق-ك3-204", HALL = "مدرج ابن الهيثم";
const row = (id: number, who: number, course: number, name: string, code: string, days: string[], start: string, end: string, extra: Record<string, unknown> = {}) => ({
  id, AdInstructorId: who, AdCourseId: course, AdCourseName: name, SCode: code, fstarttime: start, fendtime: end,
  AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdRoomCode: ROOM, AdRoomHall: HALL, roomId: "room-77", buildingId: "b-3",
  ...Object.fromEntries(days.map(day => [day, true])), ...extra,
});
const rows = [
  row(1, 7, 11, "مبادئ تكنولوجيا التعليم", "01", ["fsunday", "ftuesday"], "08:00", "09:15"),
  row(2, 7, 11, "مبادئ تكنولوجيا التعليم", "02", ["fsunday", "ftuesday"], "09:30", "10:45"),
  row(3, 7, 12, "تصميم التعليم", "01", ["fsunday", "ftuesday"], "12:30", "13:45"),
  row(4, 7, 13, "إنتاج الوسائط المتعددة", "01", ["fmonday"], "10:00", "12:50", { AdSectionId: 2 }),
  row(5, 7, 14, "التصوير الضوئي المتقدم", "01", ["ftuesday"], "14:00", "15:50"),
  /* شعبتان مدمجتان في الوقت نفسه: موعدٌ واحد في الأسبوع. */
  row(6, 7, 14, "التصوير الضوئي المتقدم", "02", ["ftuesday"], "14:00", "15:50"),
  /* ليست له: زميلٌ، وصفُّ تجربةٍ برقمٍ سالب، وصفٌّ بلا وقت. */
  row(7, 8, 15, "مقرر الزميل", "01", ["fwednesday"], "08:00", "09:15"),
  row(-3, 7, 16, "صف وضع تجربة", "01", ["fwednesday"], "08:00", "09:15"),
  row(9, 7, 17, "بلا وقت", "01", ["fthursday"], "", ""),
];
const lectures = lecturesFromRows(rows, 7);
assert.equal(lectures.length, 6, "صفوفُه الرسمية وحدها");
assert.ok(!lectures.some(lecture => /الزميل|تجربة|بلا وقت/.test(lecture.course)));
assert.deepEqual(Object.keys(lectures[0]).sort(), ["course", "courseId", "days", "end", "section", "start"], "المحاضرةُ لا تحمل حقلَ مكانٍ أصلاً");
assert.deepEqual(lecturesFromRows(rows, 0), [], "بلا رقم أستاذٍ لا محاضرات");
assert.deepEqual(teachingScopes(rows, 7), [{ collegeId: 1, sectionId: 1 }, { collegeId: 1, sectionId: 2 }], "أقسامُ تدريسه كلُّها تُسأل عن اعتمادها");

/* ── الأسبوع: شعبٌ ومقررات ودقائق، وأزحمُ يومٍ وأيامٌ حرّة ── */
const week = weekOf(lectures)!;
assert.equal(week.sections, 6);
assert.equal(week.courses, 4);
assert.equal(week.meetings.length, 8, "الموعدُ المكرّر يُحسب مرةً واحدة");
assert.equal(week.weeklyMinutes, 75 * 6 + 170 + 110);
assert.deepEqual(week.teachingDays, [0, 1, 2]);
assert.deepEqual(week.freeDays, [3, 4]);
assert.equal(week.earliest, 8 * 60);
assert.equal(week.latest, 15 * 60 + 50);
assert.equal(week.busiest?.day, 2, "الثلاثاء أطولُ الأيام");
assert.equal(week.busiest?.meetings.length, 4);
assert.equal(weekOf([]), null);
/* أيامٌ متساوية: لا «أزحم» بين متساوين. */
assert.equal(weekOf(lecturesFromRows([row(1, 7, 11, "أ", "01", ["fsunday", "ftuesday"], "08:00", "09:15")], 7))!.busiest, null);

/* ── الرغبات: ما غيّره وثُبّت؛ «كما هو» والمخفيّ وقرارُ القسم من عنده لا تُعدّ ── */
const items: any[] = [
  { action: "change", before: { courseName: "تصميم التعليم", room: ROOM }, slots: [{ day: "fmonday", start: "08:00", end: "09:15" }], roomCandidates: [ROOM], reservedRoom: { label: HALL },
    decision: { state: "fixed", decidedAt: "2026-11-01T08:00:00Z", fixedAs: { days: ["ftuesday", "fsunday"], start: "12:30", end: "13:45" } } },
  { action: "add", after: { courseName: "التصوير الضوئي المتقدم" }, slots: [{ day: "ftuesday", start: "14:00", end: "15:50" }], decision: { state: "fixed", decidedAt: "2026-11-02T08:00:00Z" } },
  { action: "change", before: { courseName: "إنتاج الوسائط المتعددة" }, slots: [{ day: "fwednesday", start: "10:00", end: "12:50" }], decision: { state: "rejected", decidedAt: "2026-11-02T08:00:00Z", note: `القاعة ${ROOM} مشغولة` } },
  { action: "change", before: { courseName: "مبادئ تكنولوجيا التعليم" }, slots: [{ day: "fmonday", start: "08:00", end: "09:15" }] },
  { action: "keep", before: { courseName: "كما هو" }, decision: { state: "fixed" } },
  { action: "change", hidden: true, before: { courseName: "مخفي" }, decision: { state: "fixed" } },
  { action: "change", before: { courseName: "وضعه القسم" }, decision: { state: "fixed", fromSchedule: true } },
  { action: "change", before: { courseName: "ألغاه القسم" }, decision: { state: "rejected", cancelled: true } },
];
const wishes = wishesFromItems(items, true);
assert.deepEqual(wishes.map(wish => wish.state), ["fixed", "fixed", "rejected", "pending"]);
assert.deepEqual(wishes[0].days, [0, 2], "المثبَّت يُقرأ بما كُتب في الجدول فعلاً، لا بما طُلب");
assert.equal(wishes[0].start, "12:30");
assert.equal(wishesFromItems(items, false).length, 3, "المعلّق لا يُعدّ قبل أن يُرسل الطلب");
assert.deepEqual(wishesFromItems(undefined, true), []);

/* ── فيلمُ الأستاذ قبل الاعتماد النهائي: «حتى الآن»، ولا ادّعاء بالانتهاء ── */
const sofar = instructorFilm({ name: "د. نورة السالم", termName: "الفصل الأول 2026/2027", lectures, wishes, final: false, now: new Date("2026-11-23T08:00:00Z") })!;
assert.equal(sofar.kind, "instructor");
assert.equal(sofar.final, false);
assert.deepEqual(sofar.scenes.map(scene => scene.key), ["title", "week", "busiest", "free", "wishes", "closing"]);
assert.match(textOf(sofar), /حتى الآن/);
assert.equal(partOf(sofar, "title", "big")?.text, "د. نورة السالم");
assert.match(partOf(sofar, "title", "badge")?.text || "", /حتى الآن/);
assert.match(partOf(sofar, "week", "eyebrow")?.text || "", /حتى الآن/);
assert.deepEqual(partOf(sofar, "week", "trio")?.items.map(item => item.value), [6, 4, 3], "شعبٌ ومقررات وأيام تدريس");
assert.match(partOf(sofar, "week", "cap")?.text || "", /12 ساعة و10 دقائق في الأسبوع\nمن 08:00 إلى 15:50/);
assert.equal(partOf(sofar, "week", "week")?.blocks.length, 8);
assert.deepEqual(partOf(sofar, "week", "week")?.legend.map(entry => entry.text), ["مبادئ تكنولوجيا التعليم", "تصميم التعليم", "إنتاج الوسائط المتعددة", "التصوير الضوئي المتقدم"]);
assert.equal(partOf(sofar, "busiest", "big")?.text, "الثلاثاء");
assert.equal(partOf(sofar, "busiest", "rows")?.items.length, 4);
assert.match(partOf(sofar, "busiest", "cap")?.text || "", /4 محاضرات · 5 ساعات و35 دقيقة/);
assert.equal(partOf(sofar, "free", "big")?.text, "الأربعاء والخميس");
assert.deepEqual(partOf(sofar, "free", "days")?.items.map(item => item.on), [false, false, false, true, true]);
assert.equal(partOf(sofar, "wishes", "ring")?.pct, 67, "المثبَّت من المقرَّر فيه: 2 من 3");
assert.equal(partOf(sofar, "wishes", "ring")?.inside, "2 من 3");
assert.deepEqual(partOf(sofar, "wishes", "rows")?.items.map(item => item.label), ["تصميم التعليم", "التصوير الضوئي المتقدم"], "تُسمّى الرغباتُ التي ثُبّتت وحدها");
assert.match(partOf(sofar, "wishes", "rows")?.items[0].text || "", /الأحد والثلاثاء · 12:30 – 13:45/);
assert.match(partOf(sofar, "wishes", "cap")?.text || "", /رغبة واحدة قيد النظر/);
assert.match(partOf(sofar, "closing", "badge")?.text || "", /حتى الآن/);
for (const scene of sofar.scenes) assert.equal(scene.duration, MY_FILM_DURATIONS[scene.key], `مدة مشهد ${scene.key}`);

/* ── وبعد الاعتماد النهائي: لا «حتى الآن» ولا شارة ── */
const final = instructorFilm({ name: "د. نورة السالم", termName: "الفصل الأول 2026/2027", lectures, wishes, final: true })!;
assert.equal(final.final, true);
assert.doesNotMatch(textOf(final), /حتى الآن|قيد الإعداد/);
assert.ok(!final.scenes.some(scene => scene.parts.some(part => part.t === "badge")));

/* ── ما لا بيانات له يسقط مشهدُه، ولا فيلمَ بلا محاضرات ── */
assert.equal(instructorFilm({ name: "أ", termName: "ف", lectures: [], wishes, final: false }), null);
const full = instructorFilm({ name: "أ", termName: "ف", final: false, wishes: [],
  lectures: lecturesFromRows(["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"].map((day, n) => row(n + 1, 7, 11, "أ", "01", [day], "08:00", "09:15")), 7) })!;
assert.deepEqual(full.scenes.map(scene => scene.key), ["title", "week", "closing"], "أيامٌ متساوية بلا يومٍ حرّ وبلا رغبات: ثلاثة مشاهد");
const waiting = instructorFilm({ name: "أ", termName: "ف", lectures, final: false, wishes: wishes.filter(wish => wish.state === "pending") })!;
assert.match(JSON.stringify(sceneOf(waiting, "wishes")), /وصلت القسم/, "رغباتٌ لم يُقرَّر فيها بعد: سطرٌ لطيف واحد");
assert.ok(!partOf(waiting, "wishes", "ring"));
const refused = instructorFilm({ name: "أ", termName: "ف", lectures, final: false, wishes: wishes.filter(wish => wish.state === "rejected") })!;
assert.equal(sceneOf(refused, "wishes"), undefined, "لا مشهدَ رغباتٍ حين لم يُثبَّت شيء ولا شيء قيد النظر");

/* ── لا قاعةَ ولا مبنى ولا رقمَ مدنياً في فيلم الأستاذ ── */
for (const film of [sofar, final, full, waiting, refused]) {
  assert.deepEqual(placeFieldsIn(film), [], "لا حقلَ قاعةٍ أو مبنى في الجواب بأيّ عمق");
  assert.ok(!textOf(film).includes(ROOM) && !textOf(film).includes(HALL) && !textOf(film).includes("room-77") && !textOf(film).includes("b-3"), "ولا اسمَ قاعةٍ في نصٍّ");
  assert.doesNotMatch(textOf(film), /[٠-٩۰-۹٪]/, "أرقامٌ لاتينية فقط");
  assert.doesNotMatch(textOf(film), /\d{12}/, "لا رقمَ مدنياً");
}

/* ── فيلمُ الطالب: من أجوبة «مساري» نفسها ── */
const summary = {
  sectionName: "قسم تكنولوجيا التعليم", planName: "خطة 2026/2027",
  identity: { name: "سارة محمد العتيبي", civilMasked: "•••••••••123" },
  progress: { passedCourses: 13, totalCourses: 64, passedUnits: 36, totalUnits: 164, remainingUnits: 128, percent: 22, remainingIds: [1, 2] },
  wishes: { termId: 5, targetUnits: 15, courseIds: [101, 102, 103], constraints: { noMorning: true } },
};
const offered = { ready: true, remainingCount: 51, offeredCount: 24, offeredUnits: 68, courses: [{ id: 101, name: "التصميم التعليمي" }, { id: 102, name: "مهارات معلوماتية" }] };
const ticket = { ready: true, plans: [
  { label: "A", units: 15, items: [
    { courseId: 101, name: "التصميم التعليمي", timesVisible: true, slots: [{ day: 0, start: 630, end: 720 }, { day: 2, start: 630, end: 720 }] },
    { courseId: 102, name: "مهارات معلوماتية", timesVisible: true, slots: [{ day: 1, start: 750, end: 840 }] },
    /* قسمٌ لم يعتمد جدولَه: مواعيدُه لا تُعرض للطالب، فلا تدخل الفيلم. */
    { courseId: 103, name: "مقرر بلا مواعيد", timesVisible: false, slots: [{ day: 4, start: 480, end: 570 }] },
  ] },
  { label: "B", units: 12, items: [{ courseId: 999, name: "خطة أخرى", timesVisible: true, slots: [{ day: 3, start: 480, end: 570 }] }] },
] };
const input = studentFilmInputFrom({ termId: 5, termName: "الفصل الأول 2026/2027", summary, offered, ticket });
assert.equal(input.firstName, "سارة", "الاسمُ الأول وحده");
assert.deepEqual(input.wishes, { courses: 3, targetUnits: 15, names: ["التصميم التعليمي", "مهارات معلوماتية"], noMorning: true, noAfternoon: undefined, freeDay: undefined });
assert.equal(input.plan?.courses, 3);
assert.equal(input.plan?.slots.length, 3, "مواعيدُ الخطة الأولى الظاهرةُ له وحدها");
assert.ok(!input.plan?.slots.some(slot => slot.course === 103 || slot.course === 999));
const student = studentFilm(input)!;
assert.equal(student.kind, "student");
assert.deepEqual(student.scenes.map(scene => scene.key), ["title", "progress", "offered", "mywishes", "myweek", "closing"]);
assert.equal(partOf(student, "title", "big")?.text, "أهلاً، سارة");
assert.equal(partOf(student, "progress", "ring")?.pct, 22);
assert.deepEqual(partOf(student, "progress", "trio")?.items.map(item => item.value), [13, 36]);
assert.deepEqual([partOf(student, "offered", "dots")?.total, partOf(student, "offered", "dots")?.lit], [51, 24]);
assert.match(JSON.stringify(sceneOf(student, "mywishes")), /3 مقررات/);
assert.match(JSON.stringify(sceneOf(student, "mywishes")), /بلا صباح/);
assert.match(partOf(student, "myweek", "cap")?.text || "", /من 10:30 إلى 14:00\nمقترح فقط/);
assert.match(partOf(student, "closing", "cap")?.text || "", /بقي 128 وحدة حتى التخرّج/);
assert.ok(!textOf(student).includes("العتيبي") && !textOf(student).includes("123"), "لا اسمَ كاملاً ولا رقمَ مدنياً في فيلم الطالب");
assert.doesNotMatch(textOf(student), /[٠-٩۰-۹٪]/);
/* رغباتُ فصلٍ آخر لا تُعرض، وتذكرةٌ غير جاهزة أو مطروحٌ غير جاهز يُسقط مشهدَه، وبلا تقدّمٍ لا فيلم. */
const bare = studentFilm(studentFilmInputFrom({ termId: 6, termName: "ف", summary, offered: { ready: false }, ticket: { ready: false } }))!;
assert.deepEqual(bare.scenes.map(scene => scene.key), ["title", "progress", "closing"]);
assert.equal(studentFilm(studentFilmInputFrom({ termId: 5, termName: "ف", summary: { ...summary, progress: null }, offered, ticket })), null);
const done = studentFilm({ ...input, progress: { ...summary.progress, remainingUnits: 0, percent: 100 } })!;
assert.match(JSON.stringify(sceneOf(done, "closing")), /مبارك اكتمال صحيفتك/);

/* ── صفحةُ العرض: شقيقةُ «فيلم الفصل» بلوحته، وتحترم تقليلَ الحركة والحوافَّ الآمنة ── */
const termCss = source("src/styles/term-film.css");
for (const token of ["--stage:#0d241f", "--stage-2:#143730", "--ink:#eef5f0", "--dim:#9fbab0", "--rule:#2a4c43", "--calm:#4fd3a1", "--warm:#f0b24a", "--hot:#f0674f", "--gold:#e2bd76"]) {
  assert.ok(termCss.includes(token), `لوحة فيلم الفصل تحمل ${token}`);
  assert.ok(MY_FILM_STAGE_VARS.includes(token), `ولوحة فيلمي تحمل ${token} نفسه`);
}
assert.match(MY_FILM_CSS, /@media \(prefers-reduced-motion:reduce\)/);
assert.match(MY_FILM_JS, /prefers-reduced-motion: reduce/);
assert.match(MY_FILM_CSS, /env\(safe-area-inset-top,0px\)/);
assert.match(MY_FILM_CSS, /env\(safe-area-inset-bottom,0px\)/);
assert.match(MY_FILM_CSS, /html,body\{[^}]*overflow:hidden/, "لا تمرير: المسرح يملأ الشاشة");
assert.match(MY_FILM_CSS, /@container \(min-aspect-ratio:5\/4\)/, "مسرحٌ عريض: عمودان");
assert.doesNotMatch(MY_FILM_JS, /\$\{|`/, "السكربت نصٌّ في قالب: لا ‎${‎ ولا علامة اقتباس مائلة");
assert.doesNotMatch(MY_FILM_JS, /\b(room|hall|building)\b/i, "صفحة العرض لا تعرف حقلَ مكان");
new Function(MY_FILM_JS.replace(/^\(function\(\)\{/, "(function(){return;"));
const page = myFilmPage({ api: "/api/public/request/a\"b/film", back: "/r/a\"b", backLabel: "جدولي", nonce: "N0NCE" });
assert.match(page, /<script nonce="N0NCE">/);
assert.ok(page.includes('data-api="/api/public/request/a&quot;b/film"'), "العنوان يُهرَّب");
assert.match(page, /<html lang="ar" dir="rtl">/);
assert.match(page, /noindex/);
assert.doesNotMatch(page, /[٠-٩۰-۹٪]/);
for (const text of [MY_FILM_JS, page, source("src/utils/myFilm.ts")]) assert.doesNotMatch(text, /ليش|شلون|وايد|زين /, "نصوص الواجهة بالعربية الفصحى");

/* ── الخادم: قراءةٌ فقط، وصاحبُ الفيلم صاحبُ الرابط أو صاحبُ الجلسة ── */
const routes = source("src/server/routes/myFilmRoutes.ts");
assert.match(routes, /app\.get\("\/api\/public\/request\/:token\/film"/);
assert.match(routes, /app\.get\("\/r\/:token\/film"/);
assert.doesNotMatch(routes, /app\.(post|put|patch|delete)\(/, "الفيلم لا يكتب شيئاً");
assert.equal((routes.match(/resolveRequestLink\(String\(req\.params\.token \|\| ""\)\)/g) || []).length, 2, "المساران يعرفان صاحبهما من الرابط كما تعرفه صفحة طلبه");
assert.doesNotMatch(routes, /req\.query|req\.body/, "لا رقمَ أستاذٍ ولا غيره من العنوان");
assert.doesNotMatch(routes, /Repository\.(save|update|create|delete|record|touch|set|add)\w*\(/, "لا كتابةَ في المستودع، ولا يُسجَّل فتحٌ للرابط");
assert.match(routes, /withoutPlaceFields\(film\)/, "والجوابُ يمرّ بتنقية القاعة والمبنى الأخيرة");
assert.match(routes, /Repository\.currentDemoSessionId\(\)/, "مخبأ الفيلم يفصل صناديق التجربة عن البيانات الحقيقية");
assert.match(routes, /`\$\{Repository\.currentDemoSessionId\(\) \|\| "live"\}\|\$\{linkId\}`/, "والمخبأ بمفتاح الرابط: لا يختلط فيلمان");
assert.doesNotMatch(routes, /Civil|civil/, "لا رقمَ مدنياً يُقرأ هنا");
assert.doesNotMatch(routes, /sendMail|pushMessage|notify/i);
const serverTs = source("server.ts");
assert.match(serverTs, /registerMyFilmRoutes\(app\)/);
const door = source("src/server/studentDoorRoutes.ts");
const doorFilm = door.slice(door.indexOf('app.get("/api/public/me/film"'), door.indexOf('homeGet("map"'));
assert.match(doorFilm, /app\.get\("\/api\/public\/me\/film", requireDoor,/, "فيلم الطالب بجلسة الباب نفسها");
assert.match(doorFilm, /app\.get\("\/me\/film"/);
assert.doesNotMatch(doorFilm, /req\.query|req\.params|req\.body/, "لا معرّفَ طالبٍ من العنوان");
assert.doesNotMatch(doorFilm, /Repository\.(save|update|create|delete|record|touch|set|add)\w*\(/, "ولا كتابة");
assert.match(doorFilm, /summaryOf\(door\.profile\)/);
assert.match(doorFilm, /part\("offered"\), part\("ticket"\)/, "الأجزاء من معالجات «مساري» نفسها");
assert.doesNotMatch(source("src/utils/myFilm.ts"), /civil|AdRoom|roomId|building/i, "باني الفيلم لا يعرف الرقم المدني ولا حقول المكان");

/* ── أماكن الدخول: بطاقةٌ في صفحة الأستاذ (لا تظهر في معاينة المنسّق ولا تُطبع)، وبطاقةٌ في «مساري» ── */
const requestPage = source("src/server/pages/instructorRequestPage.ts");
/* البابُ يتبع الفيلمَ نفسه (data.film من محاضراته الرسمية)، لا «أسبوعي الصحي» الذي يغيب بلا تاريخِ بدءٍ للفصل. */
assert.match(requestPage, /function myFilmCard\(\)\{if\(TOKEN==="preview"\|\|!data\|\|!data\.film\)return "";/);
const requestRoutes = source("src/server/routes/publicRequestRoutes.ts");
assert.match(requestRoutes, /const film = lecturesFromRows\(rows as any, Number\(request\.AdInstructorId\)\)\.length > 0;/);
assert.match(requestRoutes, /\.\.\.await teacherWeekOf\(request, term as any\)\.catch\(\(\) => \(\{ week: null, film: false \}\)\)/);
assert.match(requestPage, /href="\/r\/'\+encodeURIComponent\(TOKEN\)\+'\/film">'\+\$\{JSON\.stringify\(MY_FILM_ENTRY_BODY\)\}/, "البطاقةُ نفسها في البابين");
assert.match(requestPage, /myFilmCard\(\)\+tcWeekHtml\(\)/);
assert.match(requestPage, /\$\{MY_FILM_ENTRY_CSS\}/);
assert.match(MY_FILM_ENTRY_CSS, /@media print\{\.mf-card\{display:none!important\}\}/, "المطبوع لا يتغيّر");
assert.match(MY_FILM_ENTRY_CSS, /\.mf-card\[hidden\]\{display:none!important\}/, "البطاقةُ المخفيّة مخفيّةٌ فعلاً");
assert.match(MY_FILM_ENTRY_BODY, /<b>فيلمي<\/b>/);
/* وفي «بطاقتي» (/s/:token): البطاقةُ نفسها، مخفيّةٌ حتى يقول الخادمُ إن له فيلماً في فصل البطاقة. */
const staffPage = source("src/server/pages/staffCardPage.ts");
assert.match(staffPage, /<a class="mf-card" id="myFilm" href="\/s\/\$\{encodeURIComponent\(token\)[^"]*\/film" hidden>\$\{MY_FILM_ENTRY_BODY\}<\/a>/);
assert.match(staffPage, /\$\{MY_FILM_ENTRY_CSS\}/);
assert.match(staffPage, /if\(myFilm\)myFilm\.hidden=!d\.film;/);
const staffRoutes = source("src/server/routes/publicStaffRoutes.ts");
const staffFilm = staffRoutes.slice(staffRoutes.indexOf('app.get("/api/public/staff/:token/film"'), staffRoutes.indexOf('app.get("/s/:token", async'));
assert.match(staffFilm, /app\.get\("\/s\/:token\/film"/);
assert.match(staffFilm, /verifyStaffFilmPass\(secret, token, cookies\[STAFF_FILM_COOKIE\]\) \|\| verifyStaffDevice\(secret, token, cookies\[STAFF_DEVICE_COOKIE\]\)/, "حاملُ البطاقة من تذكرتها أو مفتاح جهازه");
assert.match(staffFilm, /buildStaffCard\(resolved\.link, \{ instructorId \}\)/, "ثم بواباتُ البطاقة نفسها");
assert.match(staffFilm, /withoutPlaceFields\(film\)/);
assert.doesNotMatch(staffFilm, /req\.query|req\.body/, "لا رقمَ أستاذٍ من العنوان");
assert.doesNotMatch(staffFilm, /Repository\.\w+\(|markShareLink|touchShareLink/, "لا قراءةَ مباشرة ولا كتابة، ولا يُسجَّل فتحٌ للرابط");
assert.doesNotMatch(staffFilm, /[Cc]ivil/, "لا رقمَ مدنياً في البابين");
assert.match(staffRoutes, /film: Boolean\(filmReady\) && Number\(card\.termId\) === Number\(resolved\.link\.AdTermId\)/);
assert.match(staffRoutes, /filmRequests: _filmRequests, \.\.\.visible/, "الطلباتُ الداخلية لا تصل صفحة البطاقة");
const home = source("src/server/studentHomePage.ts");
assert.match(home, /\(empty\?'':'<a class="mf-card fade" href="\/me\/film">/, "بطاقة «فيلمي» في لسان «الآن» لمن أكمل ملفّه");
assert.match(home, /@media print\{\.mf-card\{display:none!important\}\}/);

/* ── وثيقة المتطلبات ── */
const srs = JSON.parse(source("docs/srs/modules/16-dsh.json"));
assert.ok(JSON.stringify(srs).includes("FR-DSH-033"), "FR-DSH-033 في وثيقة المتطلبات");

/* ── سلوكٌ حيّ داخل صندوقٍ تجريبي: كلُّ رابطٍ يعيد فيلمَ صاحبه وحده، بلا قاعة ── */
process.env.DATA_MODE = "demo";
process.env.STAFF_DEVICE_SECRET = process.env.STAFF_DEVICE_SECRET || "my-film-audit-secret";
const { Repository } = await import("../src/db/repository");
const { registerMyFilmRoutes } = await import("../src/server/routes/myFilmRoutes");
const { registerPublicStaffRoutes } = await import("../src/server/routes/publicStaffRoutes");
const { signStaffFilmPass, STAFF_FILM_COOKIE, STAFF_DEVICE_COOKIE } = await import("../src/server/staffDeviceKey");
const express = (await import("express")).default;
const sandbox = `demo_myfilm_${Date.now()}`;
Repository.createDemoSandbox(sandbox, 180_000);
const seeded = await Repository.withDemoSandbox(sandbox, async () => {
  const [terms, all, instructors] = await Promise.all([Repository.getTerms(), Repository.getSchedulesByScope({ termId: 1 }), Repository.getInstructors(1)]);
  const term = (terms as any[]).find(entry => Number(entry.AdTermId) === 1);
  const withRows = [...new Set((all as any[]).filter(entry => Number(entry.id) > 0 && Number(entry.AdInstructorId) > 0).map(entry => Number(entry.AdInstructorId)))]
    .filter(id => (instructors as any[]).some(person => Number(person.AdInstructorId) === id)).slice(0, 2);
  assert.equal(withRows.length, 2, "في الصندوق أستاذان لهما محاضرات");
  const issued: Array<{ id: number; name: string; civil: string; token: string; rooms: string[] }> = [];
  for (const id of withRows) {
    const own = (all as any[]).filter(entry => Number(entry.AdInstructorId) === id && Number(entry.id) > 0);
    const link = await Repository.createShareLink({
      AdCollegeId: Number(own[0].AdCollegeId), AdSectionId: Number(own[0].AdSectionId), AdTermId: 1, SystemUserId: 1, userName: "اختبار",
      kind: "request", AdInstructorId: id, label: `طلب جدول — ${id}`, expiresAt: new Date(Date.now() + 86_400_000).toISOString(), showInstructors: false,
    } as any);
    const at = new Date().toISOString();
    const created = await Repository.createInstructorRequest({
      AdCollegeId: Number(own[0].AdCollegeId), AdSectionId: Number(own[0].AdSectionId), AdTermId: 1, AdInstructorId: id, linkId: link.id,
      window: { opensAt: at, closesAt: new Date(Date.now() + 86_400_000).toISOString() }, source: "draft", status: "sent",
      items: own.map(entry => ({ rowId: Number(entry.id), action: "keep" as const, before: { courseName: String(entry.AdCourseName || "") } as any })),
      timeline: [{ kind: "link-created", at, by: "القسم" }],
    } as any);
    assert.equal(created.linkId, link.id);
    const person = (instructors as any[]).find(entry => Number(entry.AdInstructorId) === id);
    issued.push({
      id, name: String(person.AdInstructorName || ""), civil: String(person.AdInstructorCivil || ""), token: link.id,
      rooms: [...new Set(own.flatMap(entry => [String(entry.AdRoomCode || ""), String(entry.AdRoomHall || "")]).filter(value => value.length >= 3 && !/^\d+$/.test(value)))],
    });
  }
  /* بطاقتا أستاذ: رابطُ القسم العام، ورابطٌ شخصيٌّ للأول. ومن لا يدرّس في الفصل شيئاً (حاملٌ بلا محاضرات). */
  const own0 = (all as any[]).find(entry => Number(entry.AdInstructorId) === issued[0].id && Number(entry.id) > 0);
  const staffLink = (personal: number) => Repository.createShareLink({
    AdCollegeId: Number(own0.AdCollegeId), AdSectionId: Number(own0.AdSectionId), AdTermId: 1, SystemUserId: 1, userName: "اختبار",
    kind: "staff", ...(personal ? { AdInstructorId: personal } : {}), label: "بطاقة الأستاذ", expiresAt: new Date(Date.now() + 86_400_000).toISOString(), showInstructors: false,
  } as any);
  const general = await staffLink(0), personalLink = await staffLink(issued[0].id);
  const teaching = new Set((all as any[]).map(entry => Number(entry.AdInstructorId)));
  const idle = (instructors as any[]).find(person => !teaching.has(Number(person.AdInstructorId)) && String(person.AdInstructorCivil || "").replace(/\D/g, "").length >= 8);
  return { issued, termName: String(term?.AdTermName || ""), general: general.id, personal: personalLink.id,
    idle: idle ? { id: Number(idle.AdInstructorId), civil: String(idle.AdInstructorCivil) } : null };
});
const app = express();
app.use((_req, _res, next) => { if (!Repository.runDemoSandbox(sandbox, next)) next(); });
app.use(express.json());
registerMyFilmRoutes(app);
registerPublicStaffRoutes(app);
const server = app.listen(0);
try {
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const [a, b] = seeded.issued;
  assert.notEqual(a.name, b.name);
  for (const [mine, other] of [[a, b], [b, a]] as const) {
    /* رقمُ الزميل في العنوان لا يغيّر شيئاً: صاحبُ الفيلم صاحبُ الرابط. */
    const response = await fetch(`${base}/api/public/request/${encodeURIComponent(mine.token)}/film?instructorId=${other.id}&AdInstructorId=${other.id}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    const body = await response.json() as { film: MyFilmData };
    const text = JSON.stringify(body);
    assert.equal(partOf(body.film, "title", "big")?.text, mine.name, "الفيلم باسم صاحب الرابط");
    assert.ok(!text.includes(other.name), "ولا يحمل اسمَ زميله");
    assert.deepEqual(placeFieldsIn(body), [], "لا حقلَ قاعةٍ أو مبنى في جواب الخادم");
    for (const room of mine.rooms) assert.ok(!text.includes(room), `لا اسمَ قاعة (${room}) في جواب الخادم`);
    if (mine.civil) assert.ok(!text.includes(mine.civil), "ولا رقمَه المدني");
    assert.match(text, /حتى الآن/, "قبل الاعتماد النهائي يُروى حتى الآن");
    assert.equal(body.film.final, false);
    assert.ok(text.includes(seeded.termName));
  }
  assert.ok(a.rooms.length + b.rooms.length > 0, "صفوفُ الصندوق تحمل قاعاتٍ فعلاً، فغيابُها من الجواب تنقيةٌ لا مصادفة");
  const pageResponse = await fetch(`${base}/r/${encodeURIComponent(a.token)}/film`);
  assert.equal(pageResponse.status, 200);
  const html = await pageResponse.text();
  assert.ok(html.includes(`data-api="/api/public/request/${encodeURIComponent(a.token)}/film"`));
  assert.ok(html.includes(`data-back="/r/${encodeURIComponent(a.token)}"`));
  assert.ok(!html.includes(a.name), "الصفحةُ نفسها بلا بيانات: تقرأ الفيلم من مساره");
  /* رابطٌ لا وجود له، ورابطٌ ليس طلبَ جدول، ورابطٌ أُوقف: لا فيلم. */
  assert.equal((await fetch(`${base}/api/public/request/demo.not-a-real-token/film`)).status, 404);
  assert.equal((await fetch(`${base}/r/demo.not-a-real-token/film`)).status, 404);
  /* ── «فيلمي» من «بطاقتي» ‎/s/:token‎ ── */
  const passOf = (response: Response) => (response.headers.getSetCookie?.() || [String(response.headers.get("set-cookie") || "")])
    .map(line => line.split(";")[0]).find(pair => pair.startsWith(`${STAFF_FILM_COOKIE}=`)) || "";
  const openCard = (token: string, civil: string) => fetch(`${base}/api/public/staff/${encodeURIComponent(token)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ civil }) });
  const filmOf = (token: string, cookie = "", query = "") => fetch(`${base}/api/public/staff/${encodeURIComponent(token)}/film${query}`, cookie ? { headers: { Cookie: cookie } } : {});
  assert.ok(a.civil, "للأستاذ الأول رقمٌ مدني في الصندوق");
  const cardResponse = await openCard(seeded.general, a.civil);
  assert.equal(cardResponse.status, 200, "بطاقتُه تفتح برقمه");
  const cardBody = await cardResponse.json() as any;
  assert.equal(cardBody.film, true, "البطاقةُ تقول إن له فيلماً");
  assert.equal(cardBody.filmReady, undefined); assert.equal(cardBody.filmRequests, undefined, "الحقولُ الداخلية لا تصل الصفحة");
  const pass = passOf(cardResponse);
  assert.ok(pass, "وتعطي الجهازَ تذكرةَ الفيلم");
  const setCookie = (cardResponse.headers.getSetCookie?.() || []).find(line => line.startsWith(`${STAFF_FILM_COOKIE}=`)) || "";
  assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Strict/);
  assert.ok(setCookie.includes(`Path=/api/public/staff/${encodeURIComponent(seeded.general)}/film`), "التذكرةُ لمسار الفيلم وحده");
  assert.ok(!setCookie.includes(a.civil), "ولا تحمل رقماً مدنياً");
  /* «انسَ هذا الجهاز» يمسح التذكرتين معاً بمساريهما: لا يبقى الفيلم مفتوحاً على جهازٍ مشترك. */
  const forget = await fetch(`${base}/api/public/staff/${encodeURIComponent(seeded.general)}/forget`, { method: "POST" });
  const cleared = forget.headers.getSetCookie?.() || [];
  assert.ok(cleared.some(line => line.startsWith(`${STAFF_FILM_COOKIE}=;`) && /Max-Age=0/.test(line) && line.includes(`Path=/api/public/staff/${encodeURIComponent(seeded.general)}/film`)), "نسيانُ الجهاز يمسح تذكرةَ الفيلم بمسارها");
  assert.ok(cleared.some(line => line.startsWith(`${STAFF_DEVICE_COOKIE}=;`) && /Max-Age=0/.test(line)), "ومفتاحَ الجهاز معها");
  const staffFilmResponse = await filmOf(seeded.general, pass, `?instructorId=${b.id}&AdInstructorId=${b.id}`);
  assert.equal(staffFilmResponse.status, 200);
  assert.match(staffFilmResponse.headers.get("cache-control") || "", /no-store/);
  const staffText = await staffFilmResponse.text();
  const staffBody = JSON.parse(staffText) as { film: MyFilmData };
  assert.equal(partOf(staffBody.film, "title", "big")?.text, a.name, "فيلمُ حامل البطاقة نفسه، ورقمُ الزميل في العنوان لا يغيّر شيئاً");
  assert.ok(!staffText.includes(b.name), "ولا يحمل اسمَ زميله");
  assert.deepEqual(placeFieldsIn(staffBody), [], "لا حقلَ قاعةٍ أو مبنى في جواب البطاقة");
  for (const room of a.rooms) assert.ok(!staffText.includes(room), `لا اسمَ قاعة (${room}) في جواب البطاقة`);
  assert.ok(!staffText.includes(a.civil), "ولا رقمَه المدني");
  /* بلا تذكرة، أو بتذكرة رابطٍ آخر، أو بتذكرةٍ مزوّرة: لا فيلم. */
  assert.equal((await filmOf(seeded.general)).status, 404, "بلا هويةٍ لا فيلم");
  assert.equal((await filmOf(seeded.personal, pass)).status, 404, "التذكرةُ لرمز رابطها وحده");
  assert.equal((await filmOf(seeded.general, `${STAFF_FILM_COOKIE}=v1.${b.id}.${Date.now() + 60_000}.forged`)).status, 404, "تذكرةٌ مزوّرة لا تصلح");
  const secret = process.env.STAFF_DEVICE_SECRET!;
  const otherPass = `${STAFF_FILM_COOKIE}=${encodeURIComponent(signStaffFilmPass(secret, seeded.personal, b.id, Date.now() + 60_000))}`;
  assert.equal((await filmOf(seeded.personal, otherPass)).status, 404, "الرابطُ الشخصيُّ لا يفتح فيلمَ زميلٍ ولو بتذكرةٍ موقّعة له");
  /* رمزٌ لا وجود له، ورابطُ طلبٍ ليس بطاقة: لا صفحة ولا فيلم. */
  assert.equal((await filmOf("demo.not-a-real-token", pass)).status, 404);
  assert.equal((await fetch(`${base}/s/demo.not-a-real-token/film`)).status, 404);
  assert.equal((await fetch(`${base}/s/${encodeURIComponent(a.token)}/film`)).status, 404, "رابطُ الطلب ليس بطاقة");
  const staffPageResponse = await fetch(`${base}/s/${encodeURIComponent(seeded.general)}/film`);
  assert.equal(staffPageResponse.status, 200);
  const staffHtml = await staffPageResponse.text();
  assert.ok(staffHtml.includes(`data-api="/api/public/staff/${encodeURIComponent(seeded.general)}/film"`));
  assert.ok(staffHtml.includes(`data-back="/s/${encodeURIComponent(seeded.general)}"`));
  assert.ok(!staffHtml.includes(a.name), "صفحةُ الفيلم بلا بيانات");
  /* حاملٌ لا يدرّس في الفصل: لا بطاقة، ولا فيلم ولو بتذكرةٍ موقّعة باسمه. */
  if (seeded.idle) {
    const idleCard = await openCard(seeded.general, seeded.idle.civil);
    assert.equal(idleCard.status, 404, "من لا محاضراتَ له لا بطاقةَ له");
    assert.equal(passOf(idleCard), "", "ولا تذكرةَ فيلم");
    const idlePass = `${STAFF_FILM_COOKIE}=${encodeURIComponent(signStaffFilmPass(secret, seeded.general, seeded.idle.id, Date.now() + 60_000))}`;
    assert.equal((await filmOf(seeded.general, idlePass)).status, 404, "ولا فيلم");
  } else console.warn("  (لا حاملَ بلا محاضرات في الصندوق؛ تخطّي فحصه)");
  /* فتحُ الفيلم لا يُسجَّل: لا لمسةَ للرابط ولا علامةَ زيارة. */
  const linkState = async () => JSON.stringify(await Repository.withDemoSandbox(sandbox, async () => (await Repository.getShareLinksByIds([seeded.general]))[0]));
  const before = await linkState();
  await filmOf(seeded.general, pass);
  await fetch(`${base}/s/${encodeURIComponent(seeded.general)}/film`);
  assert.equal(await linkState(), before, "فتحُ الفيلم لا يلمس الرابط");
  await Repository.withDemoSandbox(sandbox, async () => { await Repository.revokeShareLink(seeded.general); });
  assert.equal((await filmOf(seeded.general, pass)).status, 404, "بطاقةٌ أُوقفت لا تعيد فيلماً");

  await Repository.withDemoSandbox(sandbox, async () => { await Repository.revokeShareLink(b.token); });
  assert.equal((await fetch(`${base}/api/public/request/${encodeURIComponent(b.token)}/film`)).status, 404, "رابطٌ أُوقف لا يعيد فيلماً");
} finally {
  server.close();
  Repository.dropDemoSandbox(sandbox);
}

console.log("✓ فيلمي: للأستاذ من رابطه ومن بطاقته (فيلمُه وحده) بلا قاعة، وللطالب داخل «مساري» بجلسته، أرقامٌ حقيقية و«حتى الآن» قبل الاعتماد، وقراءةٌ فقط");
process.exit(0);
