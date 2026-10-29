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
import { authorityCourseCode, authorityDepartmentCode } from "../src/utils/authorityAcademicCodes";
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

console.log(`\ncourse number audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
