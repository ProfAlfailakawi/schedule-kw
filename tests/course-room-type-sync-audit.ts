import fs from "fs";
import { roomTypeSiblingIds } from "../src/utils/courseRoomTypeSync";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

/* «التربية الأساسية» بأحرامها الأربعة، و«التمريض» بقسمٍ يحمل الاسمَ نفسه. */
const colleges = [
  { AdCollegeId: 1, AdCollegeName: "كلية التربية الأساسية - بنين" },
  { AdCollegeId: 2, AdCollegeName: "كلية التربية الأساسية - بنات" },
  { AdCollegeId: 3, AdCollegeName: "كلية التربية الأساسية - بنات - الجهراء" },
  { AdCollegeId: 4, AdCollegeName: "كلية التربية الأساسية - بنات - الفحيحيل" },
  { AdCollegeId: 5, AdCollegeName: "كلية التمريض - بنات" },
];
const sections = [
  { AdSectionId: 1, AdCollegeId: 1, AdSectionName: "تكنولوجيا التعليم" },
  { AdSectionId: 2, AdCollegeId: 2, AdSectionName: "قسم تكنولوجيا التعليم" },
  { AdSectionId: 3, AdCollegeId: 3, AdSectionName: "تكنولوجيا التعليم" },
  { AdSectionId: 4, AdCollegeId: 4, AdSectionName: "تكنولوجيا التعليم" },
  { AdSectionId: 5, AdCollegeId: 5, AdSectionName: "تكنولوجيا التعليم" },
  { AdSectionId: 6, AdCollegeId: 2, AdSectionName: "التربية الفنية" },
  { AdSectionId: 7, AdCollegeId: 2, AdSectionName: "تكنولوجيا التعليم الطبي" },
];
const courses = [
  { AdCourseId: 10, AdCollegeId: 1, AdSectionId: 1, CourseCode: "0109105" },
  { AdCourseId: 11, AdCollegeId: 2, AdSectionId: 2, CourseCode: "0109105" },
  { AdCourseId: 12, AdCollegeId: 3, AdSectionId: 3, CourseCode: "0109 105" },
  { AdCourseId: 13, AdCollegeId: 4, AdSectionId: 4, CourseCode: "0109105" },
  { AdCourseId: 14, AdCollegeId: 4, AdSectionId: 4, CourseCode: "0109106" },
  { AdCourseId: 15, AdCollegeId: 2, AdSectionId: 6, CourseCode: "0109105" },
  { AdCourseId: 16, AdCollegeId: 5, AdSectionId: 5, CourseCode: "0109105" },
  { AdCourseId: 17, AdCollegeId: 2, AdSectionId: 7, CourseCode: "0109105" },
];

const ids = roomTypeSiblingIds(courses[0], courses, sections, colleges).sort((a, b) => a - b);
check(ids.join(",") === "11,12,13", "نسخ المقرر في أحرام القسم الأربعة تُختار (ولو كُتب «قسم» في أول اسم القسم أو تباعد الرمز)");
check(!ids.includes(10), "النسخةُ المعدَّلة نفسها لا تدخل");
check(!ids.includes(14), "مقررٌ آخر في القسم نفسه لا يتأثر");
check(!ids.includes(15), "رمزٌ مطابق في قسمٍ آخر لا يتأثر");
check(!ids.includes(16), "قسمٌ بالاسم نفسه في عائلة كليةٍ أخرى (التمريض) لا يتأثر");
check(!ids.includes(17), "اسمٌ يحتوي اسمَ القسم («… الطبي») ليس عائلتَه: التطابقُ تامٌّ لا احتواء");
check(roomTypeSiblingIds({ ...courses[0], CourseCode: "" }, courses, sections, colleges).length === 0, "رمزٌ فارغ لا يطابق شيئاً");
check(roomTypeSiblingIds({ ...courses[0], AdSectionId: 99 }, courses, sections, colleges).length === 0, "قسمٌ مجهول لا يطابق شيئاً");
check(roomTypeSiblingIds({ ...courses[0], AdCollegeId: 99 }, courses, sections, colleges).length === 0, "كليةٌ مجهولة لا تطابق شيئاً");

/* ترتيبُ الكتابة في المسار: النسخُ قبل المقرر المعدَّل، فتعيد المحاولةُ ما فات. */
const server = fs.readFileSync("server.ts", "utf8");
const route = server.slice(server.indexOf('app.put("/api/courses/:id"'), server.indexOf('app.delete("/api/courses/:id"'));
const syncAt = route.indexOf("setCourseRoomTypeForIds"), updateAt = route.indexOf("Repository.updateCourse(");
check(syncAt > 0 && updateAt > syncAt, "مزامنة النسخ تُكتب قبل المقرر المعدَّل ليبقى إعادةُ المحاولة ممكنةً");

console.log(`\nCourse room-type sync audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
