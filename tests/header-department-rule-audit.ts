/**
 * قاعدة المالك الدائمة (2026-11-05): رقم القسم في رأس الصفحة يقرر قسم الشعبة،
 * والناقص يُنشأ بعد تأكيد برقمه واسمه المطبوعين، والذيل وحده لا يربط أبداً.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseScheduleTable, type GridRow, type OcrPage } from "../src/utils/documentOcr.ts";
import { authorityCourseCode, authorityCourseCodeMatches, authorityForeignCourseKey, authorityInheritedCourseMatches, authorityPrintedCourseKey } from "../src/utils/authorityAcademicCodes.ts";
import { catalogueGaps, gapKeyOf } from "../src/utils/importCatalogueGaps.ts";

let passed = 0;
const check = async (name: string, run: () => void | Promise<void>) => { await run(); passed++; console.log(`  ok ${name}`); };
const grid = (code: string, courseText: string, sourceMode = "pdf-text"): GridRow => ({
  code, reference: `1${code.slice(-3)}`, scode: "01", courseText, instructorText: "", days: "4 2", daysRaw: "4 2", timeRaw: "0800 - 0920",
  start: "08:00", end: "09:20", building: "011B18", hall: "F10", sourceMode,
} as GridRow);
const parse = (rows: GridRow[], department: string, catalogue: { id: number; code: string; name: string }[]) =>
  parseScheduleTable([{ rows: [], gridRows: rows } as unknown as OcrPage], catalogue.map(item => ({ AdCourseId: item.id, CourseCode: item.code, CourseName: item.name, CourseHours: 3, CourseCredit: 3 })) as any, [], undefined,
    { authorityDepartmentCode: department, sequentialSections: true }).rows as any[];

await check("a foreign prefix follows the header, in the same college only", () => {
  assert.equal(authorityForeignCourseKey("0114101", "0121"), true);
  assert.equal(authorityForeignCourseKey("0114101", "0115"), true, "no list: any department of the college");
  assert.equal(authorityForeignCourseKey("0121101", "0121"), false);
  assert.equal(authorityForeignCourseKey("0214101", "0121"), false, "another college stays out");
  assert.equal(authorityPrintedCourseKey("013099", "0130"), "0130099");
  assert.equal(authorityInheritedCourseMatches("0114101", "0120101", "0120"), false, "a full key is never crossed");
});
await check("0114464 and 0120464 stay two courses", () => {
  assert.equal(authorityCourseCodeMatches("0114464", "0120464", "0120"), false);
  assert.equal(authorityCourseCodeMatches("0120464", "0114464", "0120"), false);
  const rows = parse([grid("0120464", "مقرر جديد"), grid("0114464", "مقرر قديم")], "0120", [{ id: 1, code: "464", name: "مقرر جديد" }]);
  assert.deepEqual(rows.map(row => Number(row.AdCourseId)), [1, 0]);
  const gaps = catalogueGaps(rows, [{ AdCourseId: 1, CourseCode: "464", CourseName: "مقرر جديد" }], "0120");
  assert.deepEqual(gaps.courses.map(course => course.code), ["0114464"]);
  assert.equal(gaps.choices.length, 0);
});
await check("the same name links; a wrong name never does and asks", () => {
  const catalogue = [{ id: 7, code: "324", name: "تربية فنية للمرحلة" }, { id: 8, code: "101", name: "اصول التربية" }];
  const rows = parse([grid("0114101", "اصول التربية"), grid("0114324", "رياضيات متقدمة")], "0121", catalogue);
  assert.equal(Number(rows[0].AdCourseId), 8);
  assert.equal(Number(rows[1].AdCourseId), 0);
  const gaps = catalogueGaps(rows, catalogue.map(item => ({ AdCourseId: item.id, CourseCode: item.code, CourseName: item.name })), "0121");
  assert.equal(gaps.courses.length, 0);
  assert.deepEqual(gaps.choices.map(item => [item.code, item.name, item.candidates[0].AdCourseId]), [["0114324", "رياضيات متقدمة", 7]]);
});
await check("a missing course is listed once, with its printed number and name, and credit from the same key", () => {
  const rows = parse([grid("0114200", "تطبيق ميداني"), grid("0114200", "تطبيق ميداني"), grid("013099", "بديل")], "0130", []);
  const gaps = catalogueGaps(rows, [], "0130", [{ AdCourseId: 9, CourseCode: "114200", CourseName: "كتالوج", CourseCredit: 4, CourseHours: 6 }]);
  const course = gaps.courses.find(item => item.code === "0114200");
  assert.deepEqual([course?.name, course?.rows, course?.credit, course?.hours], ["تطبيق ميداني", 2, 4, 6]);
  assert.equal(gaps.courses.find(item => item.code === "0130099")?.credit, 0, "what no source proves stays zero, never guessed");
});
await check("after creation the same file links by its full key, and reports keep the printed number", () => {
  const rows = parse([grid("0114200", "تطبيق ميداني")], "0121", [{ id: 20, code: "0114200", name: "تطبيق ميداني" }]);
  assert.equal(Number(rows[0].AdCourseId), 20);
  assert.equal(authorityCourseCode("0114200", "0121"), "0114200");
  assert.equal(authorityCourseCodeMatches("0121200", "0114200", "0121"), false, "the created key does not swallow the department's own number");
  assert.equal(authorityCourseCodeMatches("200", "0114200", "0121"), false);
});
await check("a scan never creates", () => {
  assert.equal(gapKeyOf({ AdCourseId: 0, sourceReadMode: "ocr-grid", sourceCourseCode: "0114200" }, "0121"), "");
});
await check("the routes keep creation behind confirmation, scope and permission", () => {
  const route = readFileSync("src/server/routes/pdfImportRoutes.ts", "utf8");
  assert.match(route, /const canCreateSections=async[\s\S]{0,160}includes\(4\)/);
  assert.match(route, /const canCreateCourses=async[\s\S]{0,200}includes\(6\)[\s\S]{0,120}committeeCatalogEditAllowed/);
  assert.match(route, /bootstrap-section"[\s\S]{0,800}canCreateSections\(req,collegeId\)/);
  assert.match(route, /create-courses"[\s\S]{0,600}isScopeAllowed\(req,collegeId,sectionId\)[\s\S]{0,200}canCreateCourses/);
  assert.match(route, /receipt\.courses\.filter\(course=>wanted\.has\(course\.code\)\)/, "only what the signed reading proved");
  assert.match(route, /createSectionOnce/);
  assert.match(route, /DuplicateResourceError/);
  assert.match(route, /PDF_MIXED_DEPARTMENTS/);
  assert.doesNotMatch(route, /copiedCourses|templateSections/, "no silent catalogue copy");
  const read = route.slice(route.indexOf('app.post("/api/intelligence/pdf-import", requirePermission(7)'));
  assert.doesNotMatch(read, /createCourse|createSection/, "reading a file writes nothing");
});
console.log(`header-department-rule-audit: ${passed} passed`);
