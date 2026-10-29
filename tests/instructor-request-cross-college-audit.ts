import fs from "fs";
import path from "path";
import { departmentFamily } from "../src/utils/sectionLabel";
import { readServerSource } from "./helpers/serverSource.mjs";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const root = process.cwd();
const server = readServerSource();
const types = fs.readFileSync(path.join(root, "src/types.ts"), "utf8");
const inbox = fs.readFileSync(path.join(root, "src/components/InstructorInbox.tsx"), "utf8");
const requestPage = server.slice(server.indexOf("function instructorRequestPage"), server.indexOf('app.post("/api/public/request/:token/check"'));
const staffPage = server.slice(server.indexOf("function staffCardPage"), server.indexOf("function surveyPage"));

check(types.includes("collegeId?: number;") && types.includes("collegeName?: string;") && types.includes("sectionId?: number;"), "طلب الإضافة يحمل نطاق الكلية والقسم الهدف");
const familyScopeCode = server.slice(server.indexOf("async function instructorRequestDepartmentScopes"), server.indexOf("async function instructorRequestCourseOptions"));
check(familyScopeCode.includes("departmentFamily(sections as any[]") && !familyScopeCode.includes("academicSectionNameMatches("),
  "تطابق العائلة العلمي الصارم وليس تشابه أسماء أقسام الاستيراد");
check(familyScopeCode.includes("familyKeys.has(") &&
      server.includes("Number(row.AdSectionId) === scope.sectionId && Number(row.AdCollegeId) === scope.collegeId"),
  "كل مقرر ينتمي للقسم والكلية المستهدفين، ولا يُستثنى متطلب كلية");
check(server.includes("instructorRequestSectionCourses(scope.sectionId)") && server.includes("collegeName: scope.collegeName"), "خيارات المقرر تحمل الكلية والقسم لكل كتالوج");
check(requestPage.includes('id="courseCollege"') && requestPage.includes("اختر الكلية أولًا"), "واجهة الإضافة تطلب الكلية قبل المقرر");
check(!requestPage.includes('id="courseSection"') && !requestPage.includes('id="courseTerm"'), "لا تضيف الواجهة اختيار قسم أو فصل زائد");
check(requestPage.includes("data-college") && requestPage.includes("data-section") && requestPage.includes("paintCourseChoices"), "المقررات تُصفّى فعليًا حسب الكلية المختارة");
check(requestPage.includes("collegeId:collegeId,sectionId:sectionId,collegeName:found.collegeName"), "الاختيار يحفظ موقع المقرر مع الإضافة");
check(requestPage.includes('collegeId:it.action==="add"?it.collegeId:undefined') && requestPage.includes('sectionId:it.action==="add"?it.sectionId:undefined'), "الفحص والإرسال يرسلان النطاق الهدف للخادم");
check(server.includes("allowedCourseMap") && server.includes("selectedCollegeId") && server.includes("selectedSectionId"), "الخادم لا يثق باختيار المتصفح ويعيد التحقق من النطاق");
check(server.includes("AdCollegeId: selectedCollegeId") && server.includes("AdSectionId: selectedSectionId"), "فحص الموعد يبني المرشح في الكلية والقسم المختارين");
check(server.includes("requestRulesForScope") && server.includes("const instructorRows = context.allRows.filter"), "التعارضات تراعي قواعد الموقع وجدول الأستاذ في كل الكليات");
check(inbox.includes("item.after?.collegeId || row.AdCollegeId") && inbox.includes("item.after?.sectionId || row.AdSectionId"), "الورشة تفتح على الكلية والقسم الهدف لا على كلية الرابط");
check(server.includes("expectedCollegeId") && server.includes("expectedSectionId") && server.includes("Number(created.AdCourseId) !== expectedCourseId"), "تثبيت الإضافة يرفض صفًا حُفظ في موقع أو مقرر مختلف");
check(staffPage.includes("visibleCardCollege") && !staffPage.includes("row.college,row.department"), "بطاقة الأستاذ لا تعرض اسم القسم داخل كل خلية");
/* داخل قالب الخادم تُكتب الشرطةُ مضاعفةً: «\s» المفردة تصل المتصفحَ حرفَ s، فلا تُطابق
   «التربية الأساسية» بمسافتها، وتظهر الكليةُ التي يُفترض صمتُها. */
check(staffPage.includes('/التربية\\\\s*الأساسية.*بنات/'), "التربية الأساسية بنات هي الكلية الصامتة بصريًا فقط");

const courseOptionBlock = server.slice(
  server.indexOf("async function instructorRequestCourseOptions"),
  server.indexOf("async function buildRequestContext", server.indexOf("async function instructorRequestCourseOptions")),
);
check(!courseOptionBlock.includes("authorityDraftForScope") && !courseOptionBlock.includes("authorityBaselineForScope"),
  "فتح رابط الأستاذ لا يعيد بناء تاريخ الجداول لكل كلية قبل عرض الصفحة");
check(courseOptionBlock.includes("instructorRequestSectionCourses(scope.sectionId)"),
  "خيارات الإضافة تأتي مباشرة من الكتالوج التشغيلي لكل كلية");

/* Similar department names, and external-service requirements, do not widen a family. */
const candidates = [
  { AdCollegeId: 1, AdSectionId: 11, AdSectionName: "قسم تكنولوجيا التعليم" },
  { AdCollegeId: 2, AdSectionId: 12, AdSectionName: "تكنولوجيا التعليم" },
  { AdCollegeId: 2, AdSectionId: 13, AdSectionName: "قسم تكنولوجيا" },
  { AdCollegeId: 3, AdSectionId: 14, AdSectionName: "قسم تكنولوجيا التعليم المساعد" },
  { AdCollegeId: 1, AdSectionId: 15, AdSectionName: "قسم التربية الفنية" },
];
const strictFamily = departmentFamily(candidates as any, 1, 11);
check(strictFamily.length === 2 && [11, 12].every(id => strictFamily.some(row => row.sectionId === id)),
  "القسم العلمي ذاته عبر بنين وبنات ضمن العائلة");
check(!strictFamily.some(row => [13, 14, 15].includes(row.sectionId)),
  "الأسماء المتشابهة أو متطلبات الكلية من خارج العائلة مستبعدة");

console.log(`\nCross-college instructor request audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
