/**
 * ── «ثبّت الجدول» يُمنع بكل مخالفةٍ لائحية (قرار المالك النهائي 2026-11-13) ─────────────
 *
 *  R1  الأحد 80 + الخميس 80 من صفّين لمقررٍ بثلاث ساعات يمنع «ثبّت» (أيامُ الشعبة كلِّها نمطٌ واحد).
 *  R2  الأحد·الثلاثاء·الخميس من ثلاثة صفوف 50د يثبَّت؛ والاثنين·الخميس يمنع.
 *  R3  م.6/2 (ثلاث محاضرات طويلة متتالية)، م.6/3 (أربع ساعاتٍ متتالية)، سُلّمُ البدايات (م.7/8)، ووقتُ الشعبة
 *      الثابت (م.7/9)، والمدّةُ المخالفة — كلُّها تمنع، برقم مادّتها وبرقم البند (لزرّ «عدّل»)، وبلا قاعة.
 *  R4  عند إرسال البطاقات: «N أساتذة في جداولهم مخالفات للائحة» (teachersWithRegulationIssues).
 * وضعُ العرض في الذاكرة، والمستودعُ مستبدَلٌ بصفوف الاختبار — لا بيانات حقيقية.
 */
process.env.DATA_MODE = "demo";
await import("../src/server/core/hallBarter");
const { Repository, initDatabase } = await import("../src/db/repository");
const { pinReview } = await import("../src/server/routes/publicRequestRoutes");
const { teachersWithRegulationIssues } = await import("../src/utils/pinViolations");

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`  ✓ ${label}`); } else { failed++; console.log(`  ✗ ${label}`, detail ?? ""); }
};

await initDatabase();
const TEACHER = 501;
const courses = [
  { AdCourseId: 1, CourseName: "مقرر أ", CourseHours: 3, CourseCredit: 3 },
  { AdCourseId: 2, CourseName: "مقرر ب", CourseHours: 3, CourseCredit: 3 },
  { AdCourseId: 3, CourseName: "مقرر ج", CourseHours: 1, CourseCredit: 1 },
];
let rows: any[] = [];
const at = (id: number, courseId: number, code: string, days: string[], start: string, end: string, extra: any = {}) => ({
  id, AdCourseId: courseId, AdCourseName: `c${courseId}`, SCode: code, AdCollegeId: 1, AdSectionId: 1, AdTermId: 9, AdInstructorId: TEACHER,
  fsunday: days.includes("sun"), fmonday: days.includes("mon"), ftuesday: days.includes("tue"), fwednesday: days.includes("wed"), fthursday: days.includes("thu"),
  fstarttime: start, fendtime: end, AdRoomCode: "B1", AdRoomHall: "قاعة-سرية-101", ...extra,
});
const R: any = Repository;
R.getCourseById = async (id: number) => courses.find(course => course.AdCourseId === Number(id)) || null;
R.getCourses = async () => courses;
R.getInstructors = async () => [{ AdInstructorId: TEACHER, AdInstructorName: "د. اختبار" }];
R.getScheduleById = async (id: number) => rows.find(row => Number(row.id) === Number(id)) || null;
R.getSchedulesByScope = async (scope: any) => rows.filter(row => (!scope.collegeId || row.AdCollegeId === scope.collegeId) && (!scope.sectionId || row.AdSectionId === scope.sectionId) && row.AdTermId === scope.termId);
const request = () => ({ id: "r1", AdInstructorId: TEACHER, AdTermId: 9, AdCollegeId: 1, AdSectionId: 1, items: rows.map(row => ({ action: "keep", rowId: row.id, before: { courseName: courses.find(c => c.AdCourseId === row.AdCourseId)?.CourseName } })) }) as any;
const review = async () => (await pinReview(request())).blocks;

console.log("R1/R2 أيام الشعبة كلها");
rows = [at(1, 1, "101", ["sun"], "08:00", "09:20"), at(2, 1, "101", ["thu"], "08:00", "09:20")];
let blocks = await review();
check(blocks.some(block => /ليست نمطاً معتمداً/.test(block.text)), "R1 الأحد 80 + الخميس 80 من صفّين يمنع «ثبّت»", blocks);
rows = [at(1, 1, "101", ["sun"], "08:00", "08:50"), at(2, 1, "101", ["tue"], "08:00", "08:50"), at(3, 1, "101", ["thu"], "08:00", "08:50")];
check((await review()).length === 0, "R2 الأحد·الثلاثاء·الخميس من ثلاثة صفوف 50د يثبَّت", await review());
rows = [at(1, 1, "101", ["mon"], "08:00", "09:20"), at(2, 1, "101", ["thu"], "08:00", "09:20")];
check((await review()).some(block => /ليست نمطاً معتمداً/.test(block.text)), "R2 الاثنين·الخميس يمنع");
rows = [at(1, 1, "101", ["thu"], "08:00", "10:50")];
check((await review()).length === 0, "R2 كتلة اليوم الواحد (الخميس 170) تثبَّت");

console.log("R3 مخالفات اللائحة تمنع");
rows = [at(1, 1, "101", ["mon", "wed"], "08:00", "09:20"), at(2, 2, "102", ["mon", "wed"], "09:30", "10:50"), at(3, 1, "103", ["mon", "wed"], "11:00", "12:20")];
blocks = await review();
check(blocks.some(block => /\(م\.6\/2\)/.test(block.text)), "R3 ثلاث محاضرات طويلة متتالية تمنع (م.6/2)", blocks);
check(blocks.filter(block => /\(م\.6\/2\)/.test(block.text)).length === 1, "R3 السلسلةُ الواحدة تُقال مرةً لا لكل موعدٍ فيها", blocks);
rows = [9, 10, 11, 12].map((hour, index) => at(10 + index, 3, `30${index}`, ["sun"], `${String(hour).padStart(2, "0")}:00`, `${String(hour).padStart(2, "0")}:50`));
check((await review()).some(block => /\(م\.6\/3\)/.test(block.text)), "R3 أربع محاضراتٍ من ساعة متتالية تمنع (م.6/3)");
rows = [at(1, 1, "101", ["mon", "wed"], "08:30", "09:50")];
blocks = await review();
check(blocks.some(block => /\(م\.7\/8\)/.test(block.text) && /9:30/.test(block.text)), "R3 بدايةٌ خارج السُّلّم تمنع (م.7/8)", blocks);
rows = [at(1, 1, "101", ["sun"], "08:00", "08:50"), at(2, 1, "101", ["tue"], "09:00", "09:50"), at(3, 1, "101", ["thu"], "08:00", "08:50")];
blocks = await review();
check(blocks.some(block => /\(م\.7\/9\)/.test(block.text)), "R3 وقتُ الشعبة الثابت يمنع (م.7/9)", blocks);
rows = [at(1, 1, "101", ["mon", "wed"], "08:00", "09:15")];
blocks = await review();
check(blocks.some(block => /\(م\.7\/8\)/.test(block.text)) && blocks.every(block => block.itemIndex === 0), "R3 المدّةُ المخالفة (75د) تمنع الآن، برقم بندها", blocks);
check(blocks.every(block => !/قاعة-سرية/.test(block.text)), "R3 لا قاعةَ في نصّ الأستاذ");

console.log("R4 قبل إرسال البطاقات");
rows = [at(1, 1, "101", ["mon", "wed"], "08:30", "09:50"), at(2, 2, "102", ["sun", "tue"], "08:00", "09:20", { AdInstructorId: 777 })];
const list = teachersWithRegulationIssues(rows, { week: rows, hoursOf: id => courses.find(c => c.AdCourseId === id)?.CourseHours || 0, placeholders: new Set([777]) });
check(list.length === 1 && list[0].instructorId === TEACHER && list[0].notes.some(note => /م\.7\/8/.test(note)), "R4 من في جدوله مخالفة يُعدّ، و«هيئة تدريسية» لا", list);
/* العدّادُ يقرأ قواعد «ثبّت» كلَّها (مصدرٌ واحد: pinRowIssues): النمطُ والمدّةُ وساعاتُ المقرّر، لا التتالي والسُّلّم وحدها. */
const hoursOf = (id: number) => courses.find(c => c.AdCourseId === id)?.CourseHours || 0;
const counted = (list: any[]) => teachersWithRegulationIssues(list, { week: list, hoursOf });
rows = [at(1, 1, "101", ["sun"], "08:00", "09:20"), at(2, 1, "101", ["thu"], "08:00", "09:20")];
let noted = counted(rows);
check(noted.length === 1 && noted[0].notes.filter(note => /ليست نمطاً معتمداً/.test(note)).length === 1, "R4 «أحد + خميس» يُعدّ، ومخالفةُ الشعبة تُقال مرةً لا لكل صفّ", noted);
rows = [at(1, 1, "101", ["mon", "wed"], "08:00", "09:15")];
noted = counted(rows);
check(noted.length === 1 && noted[0].notes.some(note => /لا توافق النمط المعتمد/.test(note) && /م\.7\/8/.test(note)), "R4 مدّةٌ تخالف النمط (75د) تُعدّ", noted);
rows = [at(1, 1, "101", ["sun"], "08:00", "09:20")];
noted = counted(rows);
check(noted.length === 1 && noted[0].notes.some(note => /أقل من ساعات المقرر/.test(note)), "R4 ساعاتٌ ناقصة تُعدّ", noted);
rows = [at(1, 1, "101", ["sun", "tue"], "08:00", "09:20"), at(2, 1, "101", ["mon", "wed"], "08:00", "09:20")];
noted = counted(rows);
check(noted.length === 1 && noted[0].notes.some(note => /تزيد على ساعات المقرر/.test(note)), "R4 ساعاتٌ زائدة تُعدّ", noted);
rows = [at(1, 1, "101", ["sun", "tue"], "08:00", "09:20"), at(2, 2, "102", ["mon", "wed"], "08:00", "09:20")];
check(counted(rows).length === 0, "R4 وجدولٌ سليم لا يُعدّ", counted(rows));
/* و«ثبّت» والعدّادُ يقولان الشيء نفسه للصفوف نفسها. */
rows = [at(1, 1, "101", ["sun"], "08:30", "09:50"), at(2, 1, "101", ["thu"], "08:30", "09:50")];
blocks = await review();
noted = counted(rows);
check(blocks.filter(block => block.itemIndex === 0).length >= 2 && blocks.some(block => /رأس الساعة/.test(block.text)) && blocks.some(block => /ليست نمطاً معتمداً/.test(block.text)),
  "R3 مخالفاتُ الموعد تُسرد كلُّها: النمطُ لا يحجب السُّلّم", blocks);
check(noted.length === 1 && blocks.every(block => noted[0].notes.some(note => block.text.endsWith(note.replace(/^[^:]+: /, "")) || note.includes(block.text.replace(/^[^:]+: /, "")))),
  "R4 العدّادُ و«ثبّت» من مصدرٍ واحد: ما يمنع هناك يُعدّ هنا", { blocks, noted });
const route = (await import("node:fs")).readFileSync("src/server/routes/instructorRequestsRoutes.ts", "utf8");
const publish = (await import("node:fs")).readFileSync("src/components/SchedulePublish.tsx", "utf8");
check(/app\.get\("\/api\/instructor-requests\/regulation-teachers", requirePermission\(7\)/.test(route) && /isScopeAllowed\(req, collegeId, sectionId\)/.test(route), "R4 المسارُ بإذن القسم ونطاقه");
check(/regulation-teachers\?collegeId=/.test(publish) && /مخالفة للائحة في جداولهم/.test(publish) && /الإرسال متاح/.test(publish), "R4 الإرسالُ يُنبَّه ولا يُمنع");

console.log("R5 وسمُ المخالفات بنطاق القارئ (طلبٌ يمتدّ على قسمين)");
{
  const { scopedPinViolations } = await import("../src/utils/pinViolations");
  const spanning = {
    items: [{ action: "keep", rowId: 1, before: { sectionId: 1 } }, { action: "keep", rowId: 2, before: { sectionId: 2 } }],
    pinViolations: { at: "2026-11-13T00:00:00.000Z", issues: [
      { itemIndex: 0, text: "مقرر القسم الأول: مخالفة", article: "م.7/8" },
      { itemIndex: 1, text: "مقرر-القسم-الثاني-السري: مخالفة", article: "م.6/2" },
      { itemIndex: 1, text: "مقرر-القسم-الثاني-السري: أخرى", article: "م.7/9" },
    ] },
  } as any;
  const forFirst = scopedPinViolations(spanning, (item: any) => item.before.sectionId === 1);
  check(forFirst?.issues.length === 1 && forFirst.elsewhere === 2 && !JSON.stringify(forFirst).includes("السري"), "R5 منسّقُ القسم الأول يرى سطرَه وعددَ ما في غيره، بلا اسم مقرّرٍ من خارج نطاقه", forFirst);
  const forNone = scopedPinViolations(spanning, () => false);
  check(forNone?.issues.length === 0 && forNone.elsewhere === 3 && !JSON.stringify(forNone).includes("مقرر"), "R5 ومن لا يرى بنداً يُعدّ له ولا يُفصَّل", forNone);
  check(scopedPinViolations({ items: [] } as any, () => true) === undefined, "R5 وبلا وسمٍ لا شيء");
  const source = (await import("node:fs")).readFileSync("src/server/routes/instructorRequestsRoutes.ts", "utf8");
  const mutation = source.slice(source.indexOf("function requestForDepartment("), source.indexOf("function requestForDepartment(") + 1400);
  check(/pinViolations: scopedPinViolations\(request, visible\)/.test(mutation) && /pinViolations: scopedPinViolations\(full, item => inSelection\(requestItemScope\(full, item\)\)\)/.test(source),
    "R5 الواردُ وردودُ القرار (requestForDepartment) يمرّان بالدالّة نفسها");
}

console.log(`\npin regulation: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
