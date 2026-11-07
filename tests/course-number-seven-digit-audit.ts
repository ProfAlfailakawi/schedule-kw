/**
 * ── رقم المقرر سبع خانات، ولا غيرها ──────────────────────────────────────────
 *
 * قاعدةٌ من مالك النظام: رقم المقرر المعتمد هو رقم الهيئة الكامل — الكلية (2)
 * ثم القسم (2) ثم المقرر نفسه (3): 01 + 09 + 105 = 0109105. والكتالوج يحفظ
 * غالباً الخانات الثلاث (105)، وكان التقرير الشامل يطبع رقم النظام الداخلي
 * (AdCourseId: 2 أو 2562) في عمود «رمز المقرر». هذا الاختبار يحرس الدالة
 * الواحدة التي تبني الرقم، ويمنع عودة العرض المباشر في التقارير.
 */
import fs from "node:fs";
import path from "node:path";
import { authorityCourseCode, authorityDepartmentCode, authorityDepartmentKeys } from "../src/utils/authorityAcademicCodes";
import { readServerSource } from "./helpers/serverSource.mjs";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

/* ── الدالة ─────────────────────────────────────────────────────────────── */
const edtech = authorityDepartmentCode("011", "09");
check(edtech === "0109", "مفتاح قسم تكنولوجيا التعليم بنين: 011 + 09 => 0109");
check(authorityDepartmentCode("012", "09") === "0109", "والبنات المفتاح نفسه: 012 + 09 => 0109");
check(authorityCourseCode("105", edtech) === "0109105", "الخانات الثلاث تُكتب بسبع: 105 => 0109105");
check(authorityCourseCode("5", edtech) === "0109005", "والرقم القصير يُكمَّل بأصفاره: 5 => 0109005");
check(authorityCourseCode("0109105", edtech) === "0109105", "والرقم الكامل يبقى كما هو");
check(authorityCourseCode("٠١٠٩١٠٥", edtech) === "0109105", "والأرقام العربية تُقرأ أرقاماً");
check(authorityCourseCode("0101101", "0201") === "0201101", "مفتاح القسم نفسه من كلية أخرى يُطبع بكلية التقرير");
check(authorityCourseCode("0102102", "0101") === "0102102", "ومقرر قسمٍ آخر لا يُعاد ربطه");
check(authorityCourseCode("105", "") === "105", "بلا مفتاح قسم لا يُختلق رقم: يبقى المخزَّن");
check(authorityCourseCode("114264", "0120") === "114264", "والرمز الشاذ الطول يبقى كما خُزّن");
check(authorityCourseCode("ENG101", edtech) === "ENG101", "والرمز الذي فيه حروف لا تُنتزع منه أرقام");
check(authorityCourseCode("", edtech) === "" && authorityCourseCode(undefined, edtech) === "", "وغياب الرمز يبقى غياباً");

/* ── التقارير لا تعرض الرمز المخزَّن مباشرة ─────────────────────────────── */
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const reports = read("src/components/Reports.tsx");
const authority = read("src/components/AuthorityPdfReport.tsx");
const server = readServerSource();

check(!/print-course-id">\{row\.AdCourseId/.test(reports), "التقرير الشامل لا يطبع رقم النظام الداخلي AdCourseId");
check(/CourseCode: authorityCourseCode\(/.test(reports), "كل ورقة مطبوعة تأخذ رقم المقرر من authorityCourseCode");
check(!/\{\s*row\.CourseCodeSnapshot\s*\|\|/.test(reports), "لا عرض مباشر لـ CourseCodeSnapshot في الاستعلامات");
check(!/code-chip">\{(?!courseNumberOf\()/.test(reports), "شرائح رمز المقرر على الشاشة كلها من courseNumberOf");
check(!/\{\s*pickedCourse\?\.CourseCode/.test(reports), "بطاقة الموعد المختار لا تعرض الرمز المخزَّن");
check(/authorityCourseCode\(course\?\.CourseCode \|\| row\.CourseCodeSnapshot/.test(authority), "تقرير تغييرات الجدول يكتب رقم المقرر بسبع خانات");
check(/"رمز المقرر": courseNumberOf\(s\)/.test(server), "ملف Excel يكتب رقم المقرر بسبع خانات");
check(/0109105/.test(read("README.md")) && /authorityCourseCode/.test(read("README.md")), "والقاعدة مكتوبة في README لمن يعمل على المشروع بعدنا");

/* ── مفاتيح الأقسام لكل AdSectionId (authorityDepartmentKeys) ─────────────── */
const keys = authorityDepartmentKeys(
  [{ AdSectionId: 1, AdCollegeId: 5, AdSectionCode: "09" }, { AdSectionId: 2, AdCollegeId: 6, AdSectionCode: "01" }, { AdSectionId: 3, AdCollegeId: 9, AdSectionCode: "" }],
  [{ AdCollegeId: 5, AdCollegeCode: "011" }, { AdCollegeId: 6, AdCollegeCode: "022" }],
);
check(keys.get(1) === "0109" && keys.get(2) === "0201" && !keys.has(3), "مفاتيح الأقسام: 011+09 => 0109، 022+01 => 0201، وقسمٌ بلا رمز لا مفتاح له");
check(authorityCourseCode("105", keys.get(1)) === "0109105" && authorityCourseCode("105", keys.get(3)) === "105", "105 تحت 0109 => 0109105، وبلا مفتاح يبقى المخزَّن");
check(authorityDepartmentKeys(undefined, undefined).size === 0, "بلا أقسام لا مفاتيح");

/* ── NFR-VIW-024: جدول القسم، ومعاينة بداية الفصل، ومنتقي الموعد، وملف Excel ── */
const department = read("src/components/DepartmentSchedule.tsx");
check(/courseCode: authorityCourseCode\(course\?\.CourseCode \|\| item\.CourseCodeSnapshot, departmentKeys\.get\(/.test(department) && /read\("\/api\/colleges"\)/.test(department),
  "جدول القسم يكتب رقم المقرر بسبع خانات من رمز الكلية والقسم");
check(!/courseCode: course\?\.CourseCode \|\| item\.CourseCodeSnapshot/.test(department), "جدول القسم لا يعرض الرمز المخزَّن مباشرة");
const layer = read("src/components/LivingScheduleLayer.tsx");
check(/\{courseNumber\(row\.courseId, row\.courseCode\) \|\| "—"\}/.test(layer) && !/\{row\.courseCode \|\| "—"\}/.test(layer), "معاينة بداية الفصل بالرقم السباعي");
check((layer.match(/courseNumberOf=\{courseNumberOfRow\}/g) || []).length === 4 && /authorityCourseCode\(course\?\.CourseCode \|\| stored, departmentKeys\.get\(/.test(layer), "كل منتقيات الموعد في المشاهد تأخذ الرقم السباعي");
const scenes = read("src/components/LivingScheduleScenes.tsx");
check(/const code = number \? ` \[\$\{number\}\]` : ""/.test(scenes) && !/\[\$\{course\.CourseCode\}\]/.test(scenes), "منتقي الموعد يكتب [0109105] لا [105]");
check(/colleges=\{colleges\}\s*sections=\{sections\}/.test(read("src/components/Schedules.tsx")), "شاشة الجدول تمرّر الكليات والأقسام إلى طبقة المشاهد");
const transfer = read("src/components/ScheduleTransfer.tsx");
check(/r\.courseNumber \|\| r\.courseCode \|\| ""/.test(transfer), "ملف Excel المصدَّر يكتب courseNumber (سبع خانات) في عمود «رمز المقرر»");
const exportRoute = read("src/server/routes/scheduleImportRoutes.ts");
check(/courseNumber: courseNumberOf\(row\)/.test(exportRoute) && /courseCode: courseById\.get\(row\.AdCourseId\)\?\.CourseCode \|\| ""/.test(exportRoute),
  "مسار التصدير يضيف courseNumber من authorityCourseCode ويُبقي courseCode المخزَّن لاستيراد JSON");
const importRoute = read("src/server/routes/smartImportRoutes.ts");
check(/if\(printed&&!byCode\.has\(printed\)\)byCode\.set\(printed,c\)/.test(importRoute), "ملف Excel المصدَّر يُعاد استيراده: الرقم السباعي بديلٌ لا يحلّ محلّ الرمز المخزَّن");
const allCourses = read("src/components/AllCourses.tsx");
check(/code=\{tmCourseNumber\(course, context\)\}/.test(allCourses) && !/code=\{String\(course\.CourseCode/.test(allCourses), "تبويب كل المقررات في آلة الزمن يعرض الرقم السباعي");

console.log(`\ncourse number audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
