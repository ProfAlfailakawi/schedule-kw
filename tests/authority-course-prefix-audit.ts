/**
 * تقرير SWRSCHA كما يطبعه قسما الأصول (0120) والمناهج (0121)، وما كشفه استعراض
 * أقسام ملف الكلية كله: رموز 0114 الموروثة، والرقم المقروء الخارج عن القسم،
 * وموعد الشعبة الثاني، والرقم ذو الست خانات، والقاعة ذات الحرف، والكتل الطويلة.
 * النصوص أدناه مقتطفات دنيا من طبقة النص، بلا أي اسم شخص.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { authorityCourseCellLooksPlausible, authorityPdfTextGridRows, parseScheduleTable, type GridRow, type OcrPage } from "../src/utils/documentOcr.ts";
import { assignAuthoritySections, authorityCourseCodeMatches, authorityCoursePrefixes, authorityInheritedCourseMatches, unlinkedCourseEvidence } from "../src/utils/authorityAcademicCodes.ts";

let passed = 0;
const check = (name: string, run: () => void) => { run(); passed++; console.log(`  ok ${name}`); };

const W = 792;
const word = (text: string, x: number, y: number) => ({ text, x0: x, x1: x + Math.max(6, text.length * 4), y0: y - 4, y1: y + 4 });
const labels = [word("القاعة", 276, 60), word("المبنى", 235, 60), word("الرزم", 343, 60)];
const cells = (y: number, time: string, days: string, room: string, building = "011B18", activity = "محاضرة") => [
  ...(room ? [word(room, 276, y)] : []), ...(building ? [word(building, 235, y)] : []), word(time, 181, y), word(activity, 148, y), word(days, 115, y),
];
const full = (y: number, code: string, reference: string, section: string, name: string, time: string, days: string, room: string, building?: string) => [
  word(code, 744, y), word(reference, 715, y), word(section, 694, y), word(name, 620, y), ...cells(y, time, days, room, building),
];
const semantic = (words: ReturnType<typeof word>[]) => authorityPdfTextGridRows([...labels, ...words], W, "semantic");
const grid = (code: string, courseText: string, scode = "01"): GridRow => ({
  code, reference: `1${code.slice(-3)}`, scode, courseText, instructorText: "", days: "4 2", daysRaw: "4 2", timeRaw: "0800 - 0920",
  start: "08:00", end: "09:20", building: "012B08", hall: "F10", sourceMode: "pdf-text",
} as GridRow);
const page = (rows: GridRow[]) => ({ rows: [], gridRows: rows }) as unknown as OcrPage;
const parse = (rows: GridRow[], department: string, catalogue: { id: number; code: string; name: string }[]) =>
  parseScheduleTable([page(rows)], catalogue.map(item => ({ AdCourseId: item.id, CourseCode: item.code, CourseName: item.name, CourseHours: 3, CourseCredit: 3 })) as any, [], undefined,
    { authorityDepartmentCode: department, sequentialSections: true });

check("the prefix list crosses only 0120/0121 to 0114, and the plain matcher stays strict", () => {
  assert.deepEqual(authorityCoursePrefixes("0120"), ["0120", "0114"]);
  assert.deepEqual(authorityCoursePrefixes("0121"), ["0121", "0114"]);
  assert.deepEqual(authorityCoursePrefixes("0115"), ["0115"]);
  assert.equal(authorityCourseCodeMatches("0114101", "101", "0120"), false);
  assert.equal(authorityInheritedCourseMatches("0114101", "101", "0120"), true);
  assert.equal(authorityInheritedCourseMatches("0114101", "101", "0115"), false, "an unlisted department");
  assert.equal(authorityInheritedCourseMatches("0102101", "101", "0120"), false, "an unrelated prefix");
  assert.equal(authorityInheritedCourseMatches("0114101", "0120101", "0120"), false, "a full key is never crossed");
  assert.equal(authorityCourseCellLooksPlausible("0114101", "0120"), true);
  assert.equal(authorityCourseCellLooksPlausible("0114101", "0102"), false);
});

check("0114 and 0120 courses under one header both link; a printed 0120 tail keeps its catalogue row", () => {
  const catalogue = [{ id: 1, code: "156", name: "مدخل الى التربية" }, { id: 2, code: "210", name: "مدخل الى التربية المبكرة" }];
  const rows = parse([grid("0114156", "مدخل الى التربيه"), grid("0120210", "مدخل الى التربية المبكرة")], "0120", catalogue).rows;
  assert.deepEqual(rows.map(row => row.AdCourseId), [1, 2]);
  const both = parse([grid("0114464", "الاداره التربويه التعليميه"), grid("0120464", "الادارة التربوية والتعليمية")], "0120", [{ id: 3, code: "464", name: "الادارة التربوية والتعليمية" }]).rows;
  assert.deepEqual(both.map(row => row.AdCourseId), [0, 3], "0114464 is another course than 0120464");
  const exact = parse([grid("0114464", "الاداره التربويه التعليميه"), grid("0120464", "الادارة التربوية والتعليمية")], "0120",
    [{ id: 3, code: "464", name: "الادارة التربوية والتعليمية" }, { id: 4, code: "0114464", name: "الادارة التربوية التعليمية" }]).rows;
  assert.deepEqual(exact.map(row => row.AdCourseId), [4, 3], "a stored full key settles it");
});

check("an inherited number with a contradicting printed name fails closed", () => {
  const rows = parse([grid("0114310", "طرق التدريس العام")], "0120", [{ id: 5, code: "310", name: "الطفل بين الأسرة و الروضة" }]).rows;
  assert.equal(rows[0].AdCourseId, 0);
});

check("a clear number outside the department is reported as such, with what was printed", () => {
  const parsed = parse([grid("0114101", "اصول التربيه", "03")], "0115", [{ id: 6, code: "101", name: "اصول التربية" }]);
  assert.equal(parsed.rows[0].AdCourseId, 0);
  assert.equal(parsed.rows[0].SCode, "", "an unproven course still gets no section");
  assert.deepEqual(unlinkedCourseEvidence(parsed.rows[0] as any), { code: "0114101", name: "اصول التربيه", section: "03" });
  assert.ok(parsed.issues.some(issue => issue.includes("0114101") && issue.includes("مقروء بوضوح")));
  assert.equal(parsed.issues.some(issue => issue.includes("لم يتم إثبات رقم المقرر")), false);
  assert.equal(unlinkedCourseEvidence({ AdCourseId: 0, sourceReadMode: "ocr-grid", sourceCourseCode: "5011894" }), null, "a scan's digits are never shown as fact");
  assert.equal(unlinkedCourseEvidence({ AdCourseId: 7, sourceReadMode: "pdf-text", sourceCourseCode: "0114101" }), null);
  const table = readFileSync(new URL("../src/components/ImportPreviewTable.tsx", import.meta.url), "utf8");
  assert.match(table, /unlinkedCourseEvidence\(row\)/);
  assert.match(readFileSync(new URL("../src/server/core/smartImport.ts", import.meta.url), "utf8"), /sourceReadMode:String\(raw\?\.sourceReadMode/);
});

check("a section's second meeting inherits its identity and shares its section number", () => {
  const rows = semantic([...full(100, "0108197", "1521", "15", "مقرر تجريبي", "1000 - 1150", "3", "G02", "011B22"), ...cells(113.5, "1000 - 1050", "1", "G02", "011B22"),
    ...full(127, "0108197", "1523", "16", "مقرر تجريبي", "1530 - 1650", "4 2", "G03", "011B22")]);
  assert.equal(rows.length, 3);
  assert.equal(rows[1].code, "0108197");
  assert.equal(rows[1].reference, "1521");
  assert.equal(rows[1].days, "1");
  assert.equal(rows[1].start, "10:00");
  assert.equal(rows[1].secondMeeting, true);
  const parsed = parse(rows, "0108", [{ id: 8, code: "197", name: "مقرر تجريبي" }]).rows;
  assert.deepEqual(parsed.map(row => row.SCode), ["501", "501", "502"]);
  assert.equal(semantic(cells(100, "1000 - 1050", "1", "G02")).length, 0, "a line with no row above it stays out of the grid");
  const numbered = assignAuthoritySections([{ AdCourseId: 1, sourceOrder: 1 }, { AdCourseId: 1, sourceOrder: 2 }] as any[]);
  assert.deepEqual(numbered.map((row: any) => row.SCode), ["501", "502"], "rows without a reference keep the owner's rule");
});

check("a six-digit course number is read and resolves only inside its department", () => {
  const rows = semantic(full(100, "013099", "1402", "01", "مقرر تجريبي", "0930 - 1050", "4 2", "F09"));
  assert.equal(rows[0].code, "013099");
  assert.equal(rows[0].reference, "1402");
  assert.equal(authorityCourseCodeMatches("013099", "99", "0130"), true);
  assert.equal(authorityCourseCodeMatches("013099", "099", "0130"), true);
  assert.equal(authorityCourseCodeMatches("013099", "0130099", "0130"), true);
  assert.equal(authorityCourseCodeMatches("013099", "99", "0118"), false);
});

check("a room with a letter is kept, whole or wrapped to the next line", () => {
  const rows = semantic([...full(100, "0108197", "1525", "08", "مقرر تجريبي", "1230 - 1350", "4 2", "G82A", "011B22"),
    ...full(113, "0108197", "1076", "09", "مقرر تجريبي", "1230 - 1350", "4 2", "G82", "011B22"), word("B", 280, 126)]);
  assert.deepEqual(rows.map(row => row.hall), ["G82A", "G82B"]);
});

check("long printed blocks survive the text layer, and only the text layer", () => {
  const rows = semantic([...full(100, "0114492", "1086", "01", "مقرر تجريبي", "1220 - 0800", "5 4 3 2 1", "", ""), ...full(113, "0107452", "1035", "01", "مقرر تجريبي", "1750 - 1300", "3", "F62", "011B20")]);
  assert.deepEqual(rows.map(row => [row.start, row.end]), [["08:00", "12:20"], ["13:00", "17:50"]]);
  assert.equal(semantic(full(100, "0107452", "1035", "01", "مقرر تجريبي", "2100 - 0800", "3", "F62"))[0].start, "", "thirteen hours is no block");
});

console.log(JSON.stringify({ passed, guard: "authority-course-prefix" }));
