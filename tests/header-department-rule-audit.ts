/**
 * قاعدة المالك الدائمة (2026-11-05): رقم القسم في رأس الصفحة يقرر قسم الشعبة،
 * والناقص يُنشأ بعد تأكيد برقمه واسمه المطبوعين، والذيل وحده لا يربط أبداً.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseScheduleTable, type GridRow, type OcrPage } from "../src/utils/documentOcr.ts";
import { authorityCourseCode, authorityCourseSnapshot, authorityCourseCodeMatches, authorityForeignCourseKey, authorityInheritedCourseMatches, authorityPrintedCourseKey } from "../src/utils/authorityAcademicCodes.ts";
import { locateRowsBySite, missingSiteSections, splitRowsByBranch } from "../src/utils/branchScope.ts";
import { catalogueGaps, gapKeyOf, withoutLinkedRowIssues } from "../src/utils/importCatalogueGaps.ts";

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
await check("a created course takes its details from the whole catalogue, in every code shape, behind the name check", () => {
  const score = (a: string, b: string) => (a === b ? 1 : 0);
  const rows = parse([grid("0114200", "تطبيق ميداني"), grid("0114200", "تطبيق ميداني"), grid("0114201", "مقرر اول"), grid("0114202", "مقرر ثان"), grid("0114203", "بلا اصل")], "0130", []);
  const templates = [
    { CourseCode: "114200", CourseName: "تطبيق ميداني", CourseCredit: 4, CourseHours: 6 },
    { CourseCode: "201", CourseName: "مقرر اول", CourseCredit: 2, CourseHours: 3 },
    { CourseCode: "202", CourseName: "اسم مختلف", CourseCredit: 9, CourseHours: 9 },
    { CourseCode: "0114203", CourseName: "مقرر غيره", CourseCredit: 9, CourseHours: 9 },
  ];
  const by = Object.fromEntries(catalogueGaps(rows, [], "0130", templates, score).courses.map(item => [item.code, item]));
  assert.deepEqual([by["0114200"].rows, by["0114200"].credit, by["0114200"].hours], [2, 4, 6]);
  assert.equal(by["0114201"].credit, 2, "a short row with the matching name");
  assert.equal(by["0114202"].credit, 0, "the tail alone is no source");
  assert.equal(by["0114203"].credit, 0, "nor is a full key under another name");
  assert.equal(by["0114203"].name, "بلا اصل");
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
  assert.match(route, /create-courses"[\s\S]{0,900}isScopeAllowed\(req,collegeId,sectionId\)[\s\S]{0,2500}canCreateCourses/);
  assert.match(route, /receipt\.courses\.filter\(course=>wanted\.has\(course\.code\)\)/, "only what the signed reading proved");
  assert.match(route, /createSectionOnce/);
  assert.match(route, /DuplicateResourceError/);
  assert.match(route, /PDF_MIXED_DEPARTMENTS/);
  assert.doesNotMatch(route, /copiedCourses|templateSections/, "no silent catalogue copy");
  const read = route.slice(route.indexOf('app.post("/api/intelligence/pdf-import", requirePermission(7)'));
  assert.doesNotMatch(read, /createCourse|createSection/, "reading a file writes nothing");
});
await check("a chosen link drops only that row's stale course and section verdicts", () => {
  const issues = ["السطر 2: المقرر غير صالح للقسم المحدد", "السطر 2: شعبة جدول PDF يجب أن تبدأ من 501", "السطر 2: وقت غير صالح", "السطر 3: المقرر غير صالح للقسم المحدد", "تحذير: عام"];
  assert.deepEqual(withoutLinkedRowIssues(issues, new Set([2])), issues.slice(2));
});
await check("every catalogue change re-reads the catalogue explicitly, past the stale closure", () => {
  const screen = readFileSync("src/components/ScheduleTransfer.tsx", "utf8");
  assert.match(screen, /if\(freshCourses\|\|!deptCourses\.length\)/);
  assert.match(screen, /readPdf\(smartFile,activeImportSectionId,dryRunActive,true\)/);
  assert.match(screen, /readPdf\(fix\.file,nextSectionId,undefined,true\)/);
  assert.doesNotMatch(screen, /setDeptCourses\(\[\]\);\s*await readPdf/);
});
await check("a site without the department is known before ready, and only a registered college is creatable", () => {
  const context = { colleges: [{ AdCollegeId: 1, AdCollegeName: "كلية التربية الأساسية - بنات" }, { AdCollegeId: 2, AdCollegeName: "كلية التربية الأساسية - بنات - الجهراء" }], sections: [{ AdSectionId: 9, AdCollegeId: 1, AdSectionCode: "14" }], baseCollegeId: 1, baseSectionId: 9 };
  const rows = [{ sourceSitePrefix: "012B" }, { sourceSitePrefix: "x", buildingId: "j" }, { sourceSitePrefix: "012F" }];
  const located = locateRowsBySite(rows as any[], [{ id: "j", sitePrefix: "012J" }]);
  const split = splitRowsByBranch(located, context);
  assert.deepEqual(split.unplaced.map(entry => entry.sitePrefix).sort(), ["012F", "012J"]);
  assert.deepEqual(missingSiteSections(split.unplaced, context).map(site => site.collegeId), [2], "012F has no college: reported, never invented");
  const after = splitRowsByBranch(located.slice(0, 2), { ...context, sections: [...context.sections, { AdSectionId: 10, AdCollegeId: 2, AdSectionCode: "14" }] });
  assert.equal(after.unplaced.length, 0, "the created sibling carries the same code, so publishing places it");
  const preflight = readFileSync("src/server/routes/scheduleImportRoutes.ts", "utf8");
  assert.match(preflight, /splitRowsByBranch\(locateRowsBySite\(rows/);
  assert.match(preflight, /unplacedSiteIssue/);
});
await check("an auto-linked row keeps its printed number for the reports", () => {
  const snapshot = authorityCourseSnapshot("0114101", "101");
  assert.equal(snapshot, "0114101");
  assert.equal(authorityCourseCode(snapshot, "0121"), "0114101");
  assert.equal(authorityCourseSnapshot("0121101", "101"), "0121101");
  assert.equal(authorityCourseCode(authorityCourseSnapshot("0121101", "101"), "0121"), "0121101");
  assert.equal(authorityCourseSnapshot("", "101"), "101");
  assert.equal(authorityCourseSnapshot("0114102", "101"), "101", "another tail never replaces the catalogue code");
  assert.equal(authorityCourseSnapshot("0114101", "0120101"), "0120101", "a full key stays");
});
await check("department creation stays with system admins, with a clear message for everyone else", () => {
  const route = readFileSync("src/server/routes/pdfImportRoutes.ts", "utf8");
  assert.match(route, /const canCreateSections=async[\s\S]{0,120}isPowerUser\(req\)&&\(await grantedForms\(req\)\)\.includes\(4\)/);
  assert.match(route, /وإضافته لمدير النظام/);
  assert.match(route, /const canBootstrapSection=mayCreateSections&&/);
  assert.match(readFileSync("src/server/routes/referenceRoutes.ts", "utf8"), /createSectionOnce\(collegeId, AdSectionCode/);
});
await check("the department's shared record reaches the screen, so simultaneous rows are not a false double booking", () => {
  const route = readFileSync("src/server/routes/pdfImportRoutes.ts", "utf8");
  assert.match(route, /departmentMembership\]\.filter\(id=>importPlaceholderIds\.has/);
});
console.log(`header-department-rule-audit: ${passed} passed`);
