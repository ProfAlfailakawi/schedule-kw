import { roomTypeSiblingIds } from "../src/utils/courseRoomTypeSync";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const same = (a: unknown, b: unknown) => String(a).trim() === String(b).trim();
/* قسم «تكنولوجيا التعليم» في أربعة أحرام، وقسمٌ آخر يشبه رمزَ مقرره. */
const sections = [
  { AdSectionId: 1, AdSectionName: "تكنولوجيا التعليم" }, { AdSectionId: 2, AdSectionName: "تكنولوجيا التعليم" },
  { AdSectionId: 3, AdSectionName: "تكنولوجيا التعليم" }, { AdSectionId: 4, AdSectionName: "تكنولوجيا التعليم" },
  { AdSectionId: 5, AdSectionName: "التربية الفنية" },
];
const courses = [
  { AdCourseId: 10, AdCollegeId: 1, AdSectionId: 1, CourseCode: "0109105" },
  { AdCourseId: 11, AdCollegeId: 2, AdSectionId: 2, CourseCode: "0109105" },
  { AdCourseId: 12, AdCollegeId: 3, AdSectionId: 3, CourseCode: "0109 105" },
  { AdCourseId: 13, AdCollegeId: 4, AdSectionId: 4, CourseCode: "0109105" },
  { AdCourseId: 14, AdCollegeId: 4, AdSectionId: 4, CourseCode: "0109106" },
  { AdCourseId: 15, AdCollegeId: 5, AdSectionId: 5, CourseCode: "0109105" },
];

const ids = roomTypeSiblingIds(courses[0], courses, sections, same).sort((a, b) => a - b);
check(ids.join(",") === "11,12,13", "نسخ المقرر في بقية أحرام القسم تُختار، ولو اختلف تباعدُ الرمز");
check(!ids.includes(10), "النسخةُ المعدَّلة نفسها لا تدخل");
check(!ids.includes(14), "مقررٌ آخر في القسم نفسه لا يتأثر");
check(!ids.includes(15), "رمزٌ مطابق في قسمٍ آخر لا يتأثر");
check(roomTypeSiblingIds({ ...courses[0], CourseCode: "" }, courses, sections, same).length === 0, "رمزٌ فارغ لا يطابق شيئاً");
check(roomTypeSiblingIds({ ...courses[0], AdSectionId: 99 }, courses, sections, same).length === 0, "قسمٌ مجهول لا يطابق شيئاً");

console.log(`\nCourse room-type sync audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
