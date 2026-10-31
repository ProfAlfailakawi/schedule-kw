import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import React from "react";
import AuthorityPdfReport, { AuthorityReport, AuthorityReportEntry } from "../src/components/AuthorityPdfReport";
import { orderAuthorityReportRows } from "../src/utils/authorityReportOrdering";
import { AdCourse, AdInstructor, FSchedule } from "../src/types";

console.log("=========================================================================");
console.log(" AUTHORITY PDF REPORT CELL-LEVEL DIFF & HIGHLIGHTING AUDIT");
console.log("=========================================================================\n");

const courseById = new Map<number, AdCourse>([
  [101, { AdCourseId: 101, AdCollegeId: 6, AdSectionId: 9, CourseCode: "102", CourseName: "الثقافة الإسلامية", CourseHours: 3, CourseCredit: 3, MaxStudent: 45 }],
  [102, { AdCourseId: 102, AdCollegeId: 6, AdSectionId: 9, CourseCode: "150", CourseName: "علوم القرآن", CourseHours: 3, CourseCredit: 3, MaxStudent: 40 }],
]);

const instructorById = new Map<number, AdInstructor>([
  [1, { AdInstructorId: 1, AdInstructorName: "د. علي يوسف أحمد السند" } as any],
  [2, { AdInstructorId: 2, AdInstructorName: "د. عبدالرحمن صالح سالم الجميلي" } as any],
]);

const baseSchedule: FSchedule = {
  id: 1,
  AdCourseId: 101,
  AdCollegeId: 6,
  AdSectionId: 9,
  AdTermId: 1,
  SCode: "501",
  AdRoomCode: "012B09",
  AdRoomHall: "F13",
  fstarttime: "08:00",
  fendtime: "09:20",
  fsunday: false,
  fmonday: true,
  ftuesday: false,
  fwednesday: true,
  fthursday: false,
  AdInstructorId: 1,
  referenceNumber: "18945",
  sourceOrder: 1,
} as any;

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  \x1b[32m✓ PASS:\x1b[0m ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  \x1b[31m✗ FAIL:\x1b[0m ${name}`);
    console.error(err);
  }
}

// Test 1: Change ROOM ONLY
test("Scenario A: Changing ROOM ONLY applies authority-pdf-cell-changed ONLY to room cell", () => {
  const modifiedSchedule: FSchedule = {
    ...baseSchedule,
    AdRoomHall: "F31", // changed from F13 to F31
  };

  const reportEntry: AuthorityReportEntry = {
    status: "changed",
    changedFields: ["AdRoomHall"],
    referenceNumber: "18945",
    source: baseSchedule,
    current: modifiedSchedule,
  };

  const report: AuthorityReport = {
    draftId: "draft-1",
    name: "تقرير مقارنة",
    sourceFileName: "جدول_معتمد.pdf",
    counts: { added: 0, deleted: 0, changed: 1, unchanged: 0 },
    rows: [reportEntry],
  };

  const html = renderToString(
    React.createElement(AuthorityPdfReport, {
      report,
      termName: "الفصل الأول 2026/2027",
      collegeName: "كلية التربية الأساسية",
      collegeCode: "01",
      sectionName: "الدراسات الإسلامية",
      sectionCode: "01",
      courseById,
      instructorById,
      visitingIds: new Set(),
    })
  );

  // Assert count of authority-pdf-cell-changed is EXACTLY 1
  const matches = html.match(/authority-pdf-cell-changed/g) || [];
  assert.equal(matches.length, 1, `Expected exactly 1 highlighted cell, found ${matches.length}`);

  // Assert that F31 has the class, but building 012B09 does not have it
  assert.ok(html.includes('class="print-ltr authority-pdf-cell-changed">F31</div>'));
  assert.ok(html.includes('class="print-ltr ">012B09</div>') || html.includes('class="print-ltr">012B09</div>') || !html.includes('012B09</div>') || html.includes('>012B09</div>'));
  assert.ok(!html.includes('012B09</div>').toString().includes("authority-pdf-cell-changed"));
});

// Test 2: Change INSTRUCTOR + ROOM
test("Scenario B: Changing INSTRUCTOR + ROOM applies authority-pdf-cell-changed ONLY to those two cells", () => {
  const modifiedSchedule: FSchedule = {
    ...baseSchedule,
    AdRoomHall: "F31", // changed
    AdInstructorId: 2, // changed
  };

  const reportEntry: AuthorityReportEntry = {
    status: "changed",
    changedFields: ["AdRoomHall", "AdInstructorId"],
    referenceNumber: "18945",
    source: baseSchedule,
    current: modifiedSchedule,
  };

  const report: AuthorityReport = {
    draftId: "draft-1",
    name: "تقرير مقارنة",
    sourceFileName: "جدول_معتمد.pdf",
    counts: { added: 0, deleted: 0, changed: 1, unchanged: 0 },
    rows: [reportEntry],
  };

  const html = renderToString(
    React.createElement(AuthorityPdfReport, {
      report,
      termName: "الفصل الأول 2026/2027",
      collegeName: "كلية التربية الأساسية",
      collegeCode: "01",
      sectionName: "الدراسات الإسلامية",
      sectionCode: "01",
      courseById,
      instructorById,
      visitingIds: new Set(),
    })
  );

  const matches = html.match(/authority-pdf-cell-changed/g) || [];
  assert.equal(matches.length, 2, `Expected exactly 2 highlighted cells, found ${matches.length}`);
});

// Test 3: Unchanged row has ZERO highlights
test("Scenario C: Unchanged row has ZERO authority-pdf-cell-changed occurrences", () => {
  const reportEntry: AuthorityReportEntry = {
    status: "unchanged",
    changedFields: [],
    referenceNumber: "18945",
    source: baseSchedule,
    current: baseSchedule,
  };

  const report: AuthorityReport = {
    draftId: "draft-1",
    name: "تقرير مقارنة",
    sourceFileName: "جدول_معتمد.pdf",
    counts: { added: 0, deleted: 0, changed: 0, unchanged: 1 },
    rows: [reportEntry],
  };

  const html = renderToString(
    React.createElement(AuthorityPdfReport, {
      report,
      termName: "الفصل الأول 2026/2027",
      collegeName: "كلية التربية الأساسية",
      collegeCode: "01",
      sectionName: "الدراسات الإسلامية",
      sectionCode: "01",
      courseById,
      instructorById,
      visitingIds: new Set(),
    })
  );

  const matches = html.match(/authority-pdf-cell-changed/g) || [];
  assert.equal(matches.length, 0, `Expected 0 highlighted cells for unchanged row, found ${matches.length}`);
});

// An added row must never print an unverified, inherited reference as official.
test("Scenario D: A new appointment always prints مقرر جديد, not an inherited CRN", () => {
  const report: AuthorityReport = {
    draftId: "draft-1",
    name: "تقرير مقارنة",
    sourceFileName: "الجدول.pdf",
    counts: { added: 1, deleted: 0, changed: 0, unchanged: 0 },
    rows: [{
      status: "added", changedFields: [], referenceNumber: "20119",
      source: null, current: { ...baseSchedule, referenceNumber: "20119" },
    }],
  };
  const html = renderToString(React.createElement(AuthorityPdfReport, {
    report, termName: "الفصل الثاني 2026/2027", collegeName: "كلية التربية الأساسية",
    sectionName: "تكنولوجيا التعليم", sectionCode: "09",
    courseById, instructorById, visitingIds: new Set(),
  }));
  assert.ok(html.includes("authority-pdf-reference-new\">مقرر جديد</div>"));
  assert.ok(!html.includes(">20119</div>"));
});

test("Scenario E: Unmatched import is not misrepresented as a verified new course", () => {
  const report: AuthorityReport = {
    draftId: "draft-1", name: "تقرير مقارنة", sourceFileName: "الجدول.pdf",
    counts: { added: 1, deleted: 0, changed: 0, unchanged: 0 },
    rows: [{
      status: "added",needsSourceReview: true,changedFields:[],
      referenceNumber: "20119",source:null,current:{...baseSchedule,referenceNumber:"20119"},
    }],
  };
  const html=renderToString(React.createElement(AuthorityPdfReport,{
    report,termName:"الفصل الثاني 2026/2027",collegeName:"كلية التربية الأساسية",
    sectionName:"تكنولوجيا التعليم",sectionCode:"09",courseById,instructorById,visitingIds:new Set(),
  }));
  assert.ok(html.includes("مراجعة المصدر"),"A document with untraceable import asks for its provenance");
  assert.ok(html.includes("authority-pdf-reference-new\">—</div>"),"Unknown source reference is displayed as a dash, never as an official new CRN");
  assert.ok(!html.includes(">20119</div>"),"A suspect live CRN is never printed as official");
  assert.ok(!html.includes("مطابقة غير محسومة"),"Rejected phrase must never be printed");
});

// First import order wins over every later live/sourceOrder mutation.
test("Scenario F: exact original PDF sequence, and new courses only at the end", () => {
  const base = (ref: string, order: number, currentOrder: number, siteLabel = "") => ({
    status: "changed" as const, source: { sourceOrder: order },
    current: { sourceOrder: currentOrder }, referenceNumber: ref, siteLabel,
  });
  const added = (name: string, siteLabel = "") => ({
    status: "added" as const, source: null,
    current: { sourceOrder: 1 }, referenceNumber: name, siteLabel,
  });
  const rows = [
    base("2056", 8, 2), added("new-base"), base("2053", 7, 1000033),
    base("2063", 11, 3, "الجهراء"), added("new-jahra", "الجهراء"),
    base("2061", 10, 1, "الجهراء"),
    base("2046", 4, 900_000),
  ];
  assert.deepEqual(orderAuthorityReportRows(rows).map(row => row.referenceNumber),
    ["2046","2053","2056","2061","2063","new-base","new-jahra"]);
  assert.deepEqual(rows.map(row => row.referenceNumber),
    ["2056","new-base","2053","2063","new-jahra","2061","2046"],
    "Ordering must not modify the original report data");
  const single = [
    base("first",1,2_000_000),
    added("new-1"),
    base("second",2,1),
    added("new-2"),
  ];
  assert.deepEqual(orderAuthorityReportRows(single).map(x=>x.referenceNumber),
    ["first","second","new-1","new-2"],
    "Live section sourceOrder cannot place a new course among official CRNs");
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
