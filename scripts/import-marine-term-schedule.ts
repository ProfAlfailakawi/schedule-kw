/**
 * ── استثناء: جدول الفصل لقسم الهندسة الميكانيكية - بحرية (0451) ─────────────────
 *
 * القسم ضيفٌ على «كلية الدراسات التكنولوجية - بنين» (القسم 227، الكلية 12). رمز الكلية
 * المخزَّن «02» بينما كشف SWRSCHA يطبع «04»، وأغلب أساتذته بلا رقم مدني في النظام،
 * ومبنى 041003 غير مسجَّل — فيرفض الرفعُ العادي من الواجهة الجدولَ كلَّه.
 * هذا السكربت هو الاستثناء، مقصورٌ على هذا القسم وحده (لا يقبل قسماً آخر):
 *   • يقرأ الكشف بقارئ SWRSCHA نفسه (ocrDocument) ويتحقق من رأسه: 0451 / 041 / الفصل الأول.
 *   • المقرر الغائب عن القسم يُنشأ باسمه المطبوع.
 *   • الأستاذ يُطابَق بالاسم؛ ومن لم يُطابَق تبقى شعبته بلا أستاذ ويُذكر اسمه في التقرير.
 *   • القاعة المسجَّلة تُربط (VERIFIED)، وما سواها يُحفظ نصّه كما طُبع (LOCATION_REVIEW_REQUIRED).
 *   • لا يكتب إن كان للقسم صفوفٌ في الفصل المستهدف.
 *
 *   npx tsx scripts/import-marine-term-schedule.ts <ملف.pdf>            معاينة فقط
 *   npx tsx scripts/import-marine-term-schedule.ts <ملف.pdf> --apply    تنفيذ
 *   --term=<رقم>   الفصل المستهدف (افتراضياً 42: الفصل الأول 2026/2027)
 */
import { readFile } from "node:fs/promises";
process.env.DATA_MODE ||= "firestore";
if (process.env.DATA_MODE === "firestore" && (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_DATABASE_ID)) {
  const cfg = JSON.parse(await readFile("firebase-applet-config.json", "utf8"));
  process.env.FIREBASE_PROJECT_ID ||= String(cfg.projectId || "");
  process.env.FIREBASE_DATABASE_ID ||= String(cfg.firestoreDatabaseId || "");
}
const COLLEGE_ID = 12, SECTION_ID = 227, DEPT = "0451", BRANCH = "041";
const DAY_FLAGS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
const file = process.argv.slice(2).find(item => !item.startsWith("--"));
const apply = process.argv.includes("--apply");
const termId = Number(process.argv.find(item => item.startsWith("--term="))?.slice(7) || 42);
if (!file) { console.log("حدد ملف الكشف PDF."); process.exit(1); }

const { ocrDocument, readAuthorityPdfHeader } = await import("../src/utils/documentOcr");
const { arabicMatchKey, normalizeArabicText } = await import("../src/utils/arabicText");
const buf = await readFile(file);
const header: any = await readAuthorityPdfHeader(buf);
if (header?.department?.code !== DEPT || header?.branch?.code !== BRANCH || header?.term?.season !== "first") {
  console.log(`✗ الكشف ليس لقسم ${DEPT} في الفصل الأول: ${JSON.stringify(header)}`); process.exit(1);
}
const ocr: any = await ocrDocument(buf, "application/pdf");
const rows: any[] = ocr.pages.flatMap((page: any) => page.gridRows || []);

const { initDatabase, Repository } = await import("../src/db/repository");
await initDatabase();
console.log(apply ? "تطبيق (--apply)" : "معاينة فقط — لن يُكتب شيء");
const section: any = await Repository.getSectionById(SECTION_ID);
if (!section || Number(section.AdCollegeId) !== COLLEGE_ID || String(section.AdSectionCode) !== DEPT.slice(2)) {
  console.log(`✗ القسم ${SECTION_ID} ليس «هندسة ميكانيكية - بحرية»: ${JSON.stringify(section)}`); process.exit(1);
}
const existing = await Repository.getSchedulesByScope({ collegeId: COLLEGE_ID, sectionId: SECTION_ID, termId });
if (existing.length) { console.log(`✗ للقسم ${existing.length} صفاً في الفصل ${termId}؛ لا يُكتب فوقها.`); process.exit(1); }

const [courses, instructors, buildings, rooms] = await Promise.all([
  Repository.getCourses(), Repository.getInstructors(), Repository.getLocationBuildings(), Repository.getLocationRooms(),
]);
const courseByCode = new Map(courses.filter((row: any) => Number(row.AdSectionId) === SECTION_ID).map((row: any) => [String(row.CourseCode), row]));
/* الكشف يقصّ الاسم ويسبقه بلقبٍ أو بنوع النشاط («ميدانى»)، والسجل قد يُسقط اسم الجد؛ فيُطابَق
   بأول كلمتين، ثم بكلمات الكشف الكاملة الأخرى إن بقي أكثر من مرشّح — ولا يُقبل إلا مرشّحٌ واحد. */
const nameWords = (value: unknown) => arabicMatchKey(value).replace(/\s*\.\s*/g, ". ").replace(/صلا ح/g, "صلاح")
  .split(" ").filter(word => word && !["د.", "م.", "د", "م", "ميداني"].includes(word)).map(word => word.replace(/\.$/, ""));
const registered = instructors.map((row: any) => ({ row, words: nameWords(row.AdInstructorName) }));
const instructorFor = (printed: string) => {
  const words = nameWords(printed);
  if (words.length < 2) return null;
  let hits = registered.filter(item => item.words[0] === words[0] && item.words[1] === words[1]);
  for (const word of words.slice(2, -1)) { if (hits.length <= 1) break; const narrowed = hits.filter(item => item.words.includes(word)); if (narrowed.length) hits = narrowed; }
  return hits.length === 1 ? hits[0].row : null;
};

const matchedAs = new Map<string, string>();
const ready: any[] = [], unmatched = new Map<string, number>(), reviewLocations = new Set<string>(), newCourses = new Map<string, string>();
for (const row of rows) {
  const code = String(row.code).slice(DEPT.length);
  const name = normalizeArabicText(row.courseText).replace(/\)(\d)\(/g, "($1)");
  if (!courseByCode.has(code)) newCourses.set(code, name);
  /* الكشف يكتب أيام التدريب الميداني في عمود النشاط («ميدانى 5 4 3 2»). */
  let days = String(row.days || "");
  if (!days && String(row.code) === "0451399") days = "2345";
  const printedInstructor = normalizeArabicText(row.instructorText);
  const instructor = printedInstructor ? instructorFor(printedInstructor) : null;
  if (instructor) matchedAs.set(printedInstructor, instructor.AdInstructorName);
  if (printedInstructor && !instructor) unmatched.set(printedInstructor, (unmatched.get(printedInstructor) || 0) + 1);
  const buildingCode = String(row.building || "").trim(), hall = String(row.hallRaw || row.hall || "").trim();
  const building: any = buildings.find((item: any) => item.officialCode === buildingCode);
  const room: any = building && rooms.find((item: any) => item.buildingId === building.id && item.canonicalCode === hall);
  if (buildingCode && !room) reviewLocations.add(`${buildingCode}/${hall || "—"}`);
  ready.push({
    code, name, SCode: String(row.scode), reference: String(row.reference),
    AdInstructorId: instructor ? Number(instructor.AdInstructorId) : null, instructorName: instructor?.AdInstructorName || "",
    fstarttime: row.start || "", fendtime: row.end || "",
    ...Object.fromEntries(DAY_FLAGS.map((flag, index) => [flag, days.includes(String(index + 1))])),
    AdRoomCode: buildingCode, AdRoomHall: hall,
    ...(room ? { buildingId: building.id, roomId: room.id, locationStatus: "VERIFIED" }
      : buildingCode ? { buildingId: building?.id, locationStatus: "LOCATION_REVIEW_REQUIRED" } : {}),
    sourceBuildingText: buildingCode, sourceRoomText: hall,
  });
}

console.log(`الكشف: ${rows.length} شعبة في ${new Set(rows.map(row => row.code)).size} مقرراً → القسم ${SECTION_ID} · الفصل ${termId}`);
if (newCourses.size) console.log(`مقررات ${apply ? "أُنشئت" : "ستُنشأ"}: ${[...newCourses].map(([code, name]) => `${code} ${name}`).join("، ")}`);
console.log(`بأستاذ: ${ready.filter(row => row.AdInstructorId).length} · بلا أستاذ: ${ready.filter(row => !row.AdInstructorId).length}`);
console.log([...matchedAs].map(([a, b]) => `  ${a} ← ${b}`).join("\n"));
if (unmatched.size) console.log(`أسماء لم تُطابَق (${unmatched.size}): ${[...unmatched.keys()].join("، ")}`);
if (reviewLocations.size) console.log(`مواقع للمراجعة: ${[...reviewLocations].join("، ")}`);
const noTime = ready.filter(row => !row.fstarttime || !DAY_FLAGS.some(flag => row[flag]));
if (noTime.length) console.log(`بلا يوم أو وقت: ${noTime.map(row => `${row.code}/${row.SCode}`).join("، ")}`);
if (!apply) { console.log("\nمعاينة فقط. أعد التشغيل مع --apply بعد مراجعة الملخص."); process.exit(0); }

for (const [code, name] of newCourses) courseByCode.set(code, await Repository.createCourse(COLLEGE_ID, SECTION_ID, code, name, 3, 3, 24));
let added = 0;
for (const { code, name, reference, instructorName, ...row } of ready) {
  const course: any = courseByCode.get(code);
  await Repository.createSchedule({
    ...row, AdCollegeId: COLLEGE_ID, AdSectionId: SECTION_ID, AdTermId: termId,
    AdCourseId: course.AdCourseId, AdCourseName: course.CourseName,
    CourseCodeSnapshot: String(course.CourseCode || ""), CourseNameSnapshot: String(course.CourseName || ""),
  } as any);
  added += 1;
}
console.log(`\nتم: ${added} شعبة أُضيفت.`);
process.exit(0);
