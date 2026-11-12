/**
 * ── حماية الخريجين (src/utils/actualDemandGraduates.ts) ──────────────────────────────
 *
 *  G1  مقرران يحتاجهما خريجو البرنامج نفسه وكلُّ شعبهما متداخلة: تعارضٌ بأثره (min لكل برنامج).
 *  G2  شعبةٌ بديلة لا تتداخل تُزيل التعارض؛ وبرنامجان مختلفان لا يتعارضان؛ والمسار الآخر لا يختلط.
 *  G3  أثر الحفظ: موعدٌ جديد يصنع التعارض → «يمسّ N»؛ وتعديلٌ يُزيله أو لا يغيّره → لا شيء.
 *  G4  بلا تقرير خريجين لا حكم.
 */
import { graduateClashes, graduateImpactOf, type ClashRow } from "../src/utils/actualDemandGraduates";
import type { DemandCourse, DemandMatch, DemandReport } from "../src/utils/actualDemand";
import { AR, countOf } from "../src/utils/arabicCount";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra ?? ""); }
};
const course = (code: string, programs: Array<[string, number, number]>): DemandCourse => {
  const boys = programs.reduce((s, p) => s + p[1], 0), girls = programs.reduce((s, p) => s + p[2], 0);
  return { code, name: `مقرر ${code}`, units: 3, offered: { boys: 0, girls: 0 }, average: { boys: 0, girls: 0 }, students: { boys, girls, total: boys + girls },
    suggested: { boys: 0, girls: 0, total: 0 }, programs: programs.map(([c, b, g]) => ({ code: c, name: c, boys: b, girls: g, total: b + g })) };
};
const report: DemandReport = { termLabel: "", department: "تكنولوجيا التعليم", facultyCount: 0, legalLoad: 0, warnings: [], courses: [
  course("0109468", [["BA-0115", 5, 9]]),
  course("0109491", [["BA-0115", 7, 4], ["BA-0136", 3, 0]]),
  course("0109499", [["BA-0136", 6, 0]]),
] };
const matches = new Map<string, DemandMatch>([
  ["0109468", { code: "0109468", status: "matched", courseIds: [1, 2] }],
  ["0109491", { code: "0109491", status: "matched", courseIds: [3, 4] }],
  ["0109499", { code: "0109499", status: "matched", courseIds: [5, 6] }],
]);
const members = [{ collegeId: 11, track: "boys" as const }, { collegeId: 12, track: "girls" as const }];
const row = (id: number, courseId: number, college: number, code: string, days: string[], start: string, end: string): ClashRow =>
  ({ id, AdCourseId: courseId, AdCollegeId: college, SCode: code, fstarttime: start, fendtime: end, ...Object.fromEntries(days.map(d => [d, true])) });
const rows = [
  row(1, 1, 11, "01", ["fsunday", "ftuesday"], "08:00", "09:00"),
  row(2, 3, 11, "01", ["fsunday"], "08:30", "10:00"),
  row(3, 2, 12, "51", ["fmonday"], "10:00", "11:15"),
  row(4, 4, 12, "51", ["fmonday"], "12:00", "13:15"),
  row(5, 5, 11, "01", ["fwednesday"], "08:00", "09:15"),
];

/* G1 */
const clashes = graduateClashes({ graduates: report, matches, members, rows });
check(clashes.length === 1 && clashes[0].track === "boys" && clashes[0].graduates === 5 && clashes[0].programs.join() === "BA-0115", "G1 بنين: 0109468 و0109491 متداخلان كلياً — يمسّ ٥ خريجين من BA-0115", clashes);

/* G2 */
const withSpare = [...rows, row(6, 3, 11, "02", ["fthursday"], "08:00", "09:30")];
check(!graduateClashes({ graduates: report, matches, members, rows: withSpare }).length, "G2 شعبةٌ ثانية لا تتداخل تُزيل التعارض");
check(!clashes.some(c => c.track === "girls"), "G2 البنات (موعدان متتاليان لا متداخلان) بلا تعارض");
check(!clashes.some(c => [c.a.code, c.b.code].includes("0109499")), "G2 0109499 لبرنامجٍ آخر مع 0109491 بلا تداخل");

/* G3 */
const girlsClash = graduateImpactOf({ graduates: report, matches, members, rows, candidate: row(4, 4, 12, "51", ["fmonday"], "10:30", "11:45"), replaces: 4 });
check(girlsClash?.graduates === 4 && girlsClash.clashes[0].track === "girls", "G3 نقل 0109491 بنات إلى وقت 0109468: يمسّ ٤ خريجات", girlsClash);
check(countOf(girlsClash?.graduates || 0, AR.graduate) === "4 خريجين" && countOf(7, AR.graduate) === "7 خريجين" && countOf(12, AR.graduate) === "12 خريجاً", "G3 العدد والمعدود: «٧ خريجين»، «١٢ خريجاً»");
check(graduateImpactOf({ graduates: report, matches, members, rows, candidate: row(2, 3, 11, "01", ["fthursday"], "08:30", "10:00"), replaces: 2 }) === null, "G3 تعديلٌ يُزيل التعارض القائم لا يُنبَّه عليه");
check(graduateImpactOf({ graduates: report, matches, members, rows, candidate: row(9, 5, 11, "02", ["fsunday"], "08:00", "09:00") }) === null, "G3 موعدٌ لمقررٍ بلا برنامج مشترك لا أثر له");

/* G4 */
check(graduateImpactOf({ graduates: null, matches, members, rows, candidate: rows[0] }) === null && !graduateClashes({ graduates: null, matches, members, rows }).length, "G4 بلا تقرير خريجين لا حكم");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
