/**
 * ── العرض والطلب (src/utils/actualDemandSupply.ts) ──────────────────────────────────
 *
 *  C1  مقعد الشعبة بلائحتنا: السعة المدخلة حتى أقصى الطبيعة (م.8)، والمستثنى (م.9) بسعته، والافتراضي موسوم.
 *  S1  مسار بنين عاجز وبنات فائض: العجز بالشعب، والفائض، واقتراح نقل شعبة قبل فتح أخرى.
 *  S2  نسبة خدمة الطلب للعام وللخريجين، ولكل مسار؛ وما لم يُطابَق أو تُجوهل لا يدخلها.
 *  S3  الترتيب بالأشد: خريجون بلا مقعد أولاً، ثم طلبة، ثم نقل، ثم فائض.
 *  S4  كليةٌ بلا مسار (التجربة): مسارٌ واحد يخدم المجموع.
 *  S5  لكل مسار سقف نسخته، والنتيجة لا تتبع العضو الأول.
 *  B1  الشارة: عجزٌ يغطيه نقلٌ مقترح ليس أخضر.
 *  U1  المقررات اتحاد التقريرين: ما في تقرير الخريجين وحده لا يسقط.
 *  F1  حقائق المقرر لكل AdCourseId (لحكم «حذف مقرر» وشارة المراجعة).
 *  A2  أكثر من 40 مقرراً: القائمة تُقص عند 40، والأرقام الكلية من البنود كلها (الخادم يرسل alertSummary).
 *  A1  تنبيه الجدول الدراسي: «بلا شعبة» للعائلة ونقص المقاعد، وتوزيعهما على المسارين، ولا تنبيه حين خُدم الجميع.
 */
import fs from "fs";
import { courseDemandFacts, demandAlertSummary, demandBadgeTone, supplyView, SUPPLY_LIST_LIMIT, demandSupply, seatCap, DEFAULT_SEAT_CAP } from "../src/utils/actualDemandSupply";
import type { DemandCourse, DemandMatch, DemandReport } from "../src/utils/actualDemand";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra ?? ""); }
};
const none = { specialization: "theoretical" as const, excused: new Set<string>() };

/* C1 */
check(seatCap({ MaxStudent: 70, CourseTeachingMode: "theoretical", CourseCode: "105" }, none).cap === 60, "C1 سعة 70 لمقرر نظري تُقصّ إلى 60 (م.8)");
check(seatCap({ MaxStudent: 30, CourseTeachingMode: "practical", CourseCode: "105" }, none).cap === 25, "C1 العملي أقصاه 25");
check(seatCap({ MaxStudent: 0, CourseTeachingMode: "applied", CourseCode: "105" }, none).cap === 40, "C1 بلا سعة: أقصى الطبيعة");
check(seatCap({ MaxStudent: 12, CourseTeachingMode: "theoretical", CourseCode: "105" }, { ...none, excused: new Set(["105"]) }).cap === 12, "C1 المستثنى بقرار المدير بسعته (م.9)");
const assumed = seatCap({ MaxStudent: 0, CourseCode: "105" }, none);
check(assumed.cap === DEFAULT_SEAT_CAP && assumed.assumed, "C1 بلا طبيعة ولا سعة: الافتراضي موسوماً");
check(seatCap({ MaxStudent: 0, CourseTeachingMode: "field_training", CourseCode: "491" }, { ...none, specialization: "scientific" }).cap === 25, "C1 التدريب الميداني في تخصص علمي 25");

/* S1 */
const course = (code: string, boys: number, girls: number, programs = 0): DemandCourse => ({
  code, name: `مقرر ${code}`, units: 3, offered: { boys: 0, girls: 0 }, average: { boys: 0, girls: 0 },
  students: { boys, girls, total: boys + girls }, suggested: { boys: 0, girls: 0, total: 0 }, programs: programs ? [{ code: "BA-0115", name: "تكنولوجيا التعليم", boys, girls, total: boys + girls }] : [],
});
const report = (courses: DemandCourse[]): DemandReport => ({ termLabel: "الفصل الدراسي الثاني 2027-2026", department: "تكنولوجيا التعليم", facultyCount: 26, legalLoad: 256, courses, warnings: [] });
const members = [
  { collegeId: 11, sectionId: 101, collegeName: "كلية التربية الأساسية - بنين", track: "boys" as const },
  { collegeId: 12, sectionId: 201, collegeName: "كلية التربية الأساسية - بنات", track: "girls" as const },
];
const catalogue = [
  { AdCourseId: 1, AdSectionId: 101, CourseCode: "105", MaxStudent: 40, CourseTeachingMode: "applied" },
  { AdCourseId: 2, AdSectionId: 201, CourseCode: "105", MaxStudent: 40, CourseTeachingMode: "applied" },
  { AdCourseId: 3, AdSectionId: 101, CourseCode: "108", MaxStudent: 60, CourseTeachingMode: "theoretical" },
  { AdCourseId: 4, AdSectionId: 201, CourseCode: "108", MaxStudent: 60, CourseTeachingMode: "theoretical" },
  { AdCourseId: 5, AdSectionId: 101, CourseCode: "491", MaxStudent: 25, CourseTeachingMode: "practical" },
  { AdCourseId: 6, AdSectionId: 201, CourseCode: "491", MaxStudent: 25, CourseTeachingMode: "practical" },
];
const matches = new Map<string, DemandMatch>([
  ["0109105", { code: "0109105", status: "matched", courseIds: [1, 2] }],
  ["0109108", { code: "0109108", status: "matched", courseIds: [3, 4] }],
  ["0109491", { code: "0109491", status: "matched", courseIds: [5, 6] }],
  ["0109107", { code: "0109107", status: "unmatched", courseIds: [] }],
  ["0109199", { code: "0109199", status: "ignored", courseIds: [] }],
]);
const rows = [
  /* 105: بنين شعبة واحدة (40) لـ 93 طالباً، وبنات أربع شعب (160) لـ 50. */
  { AdCourseId: 1, AdCollegeId: 11, SCode: "01" },
  { AdCourseId: 2, AdCollegeId: 12, SCode: "51" }, { AdCourseId: 2, AdCollegeId: 12, SCode: "52" }, { AdCourseId: 2, AdCollegeId: 12, SCode: "53" }, { AdCourseId: 2, AdCollegeId: 12, SCode: "54" },
  /* 108: شعبة بنات واحدة (60) لـ 50 بنتاً، ولا شيء للبنين (40 طالباً). */
  { AdCourseId: 4, AdCollegeId: 12, SCode: "51" },
  /* 491: متوازن. */
  { AdCourseId: 5, AdCollegeId: 11, SCode: "01" }, { AdCourseId: 6, AdCollegeId: 12, SCode: "51" },
];
const general = report([course("0109105", 93, 50), course("0109108", 40, 50), course("0109491", 20, 25), course("0109107", 900, 900), course("0109199", 50, 50)]);
const graduates = report([course("0109491", 10, 5, 1), course("0109108", 6, 0, 1)]);
const supply = demandSupply({ general, graduates, matches, catalogue, members, rows, capacity: none });
const c105 = supply.items.find(item => item.code === "0109105")!;
const boys105 = c105.branches.find(branch => branch.track === "boys")!, girls105 = c105.branches.find(branch => branch.track === "girls")!;
check(boys105.seats === 40 && boys105.gap === 2 && girls105.seats === 160 && girls105.gap === -2, "S1 0109105: بنين عجز شعبتين (93 على 40)، وبنات فائض شعبتين (50 على 160)", c105.branches);
check(c105.move?.from === "girls" && c105.move.to === "boys" && c105.move.sections === 2 && c105.gap === 0, "S1 الاقتراح نقل شعبتين من بنات إلى بنين، فلا عجز بعد النقل", c105.move);
const c108 = supply.items.find(item => item.code === "0109108")!;
check(c108.gap === 1 && c108.unmetGraduates === 6 && !c108.move, "S1 0109108: بنين بلا شعبة (عجز شعبة)، ٦ خريجين بلا مقعد، ولا فائض يُنقل", c108);
check(!supply.items.some(item => item.code === "0109107" || item.code === "0109199"), "S2 غير المطابَق والمتجاهَل خارج القائمة والنسبة");

/* S2: العام = (40+50 + 40+0 ... ) */
const served = Math.min(93, 40) + Math.min(50, 160) + Math.min(40, 0) + Math.min(50, 60) + Math.min(20, 25) + Math.min(25, 25);
const need = 93 + 50 + 40 + 50 + 20 + 25;
check(supply.service.general === Math.round((served / need) * 1000) / 10, "S2 نسبة خدمة الطلب = مجموع min(الطلب، المقاعد) ÷ الطلب", supply.service);
const gServed = Math.min(10, 25) + Math.min(5, 25) + Math.min(6, 0);
check(supply.service.graduates === Math.round((gServed / 21) * 1000) / 10, "S2 نسبة الخريجين من مقاعد مقرراتهم", supply.service);
const boys = supply.byTrack.find(row => row.track === "boys")!;
check(boys.general !== null && boys.general < (supply.byTrack.find(row => row.track === "girls")!.general || 0), "S2 لكل مسار نسبته: البنون أقل خدمة من البنات هنا", supply.byTrack);

/* S3 */
check(supply.items[0].code === "0109108" && supply.items[1].code === "0109105", "S3 الخريجون بلا مقعد أولاً، ثم العجز، ثم النقل", supply.items.map(item => item.code));
check(supply.items[supply.items.length - 1].code === "0109491", "S3 المتوازن آخراً");

/* S4 */
const flat = demandSupply({ general: report([course("0109105", 93, 50)]), graduates: null, matches, catalogue: catalogue.slice(0, 1), members: [{ collegeId: 1, sectionId: 101, collegeName: "كلية التربية الأساسية", track: "" }], rows: [{ AdCourseId: 1, AdCollegeId: 1, SCode: "01" }], capacity: none });
check(flat.items[0].branches.length === 1 && flat.items[0].branches[0].demand === 143 && flat.items[0].gap === 3 && flat.service.graduates === null, "S4 كلية بلا مسار: مسار واحد بالمجموع (143 على 40 = عجز 3 شعب)", flat.items[0]);

/* F1 */
const facts = courseDemandFacts(supply, matches);
check(facts["3"]?.students === 90 && facts["4"]?.graduates === 6 && facts["1"]?.gap === 0, "F1 الحقائق لكل نسخة من المقرر في العائلة", facts);


/* S5: لكل مسارٍ سقفُ نسخته — بنين 20 وبنات 60 — والنتيجة لا تتبع العضو المفتوح أولاً. */
const mixedCatalogue = [
  { AdCourseId: 21, AdSectionId: 101, CourseCode: "210", MaxStudent: 20, CourseTeachingMode: "practical" },
  { AdCourseId: 22, AdSectionId: 201, CourseCode: "210", MaxStudent: 60, CourseTeachingMode: "theoretical" },
];
const mixedRows = [{ AdCourseId: 22, AdCollegeId: 12, SCode: "51" }, { AdCourseId: 22, AdCollegeId: 12, SCode: "52" }, { AdCourseId: 21, AdCollegeId: 11, SCode: "01" }];
const mixedReport = report([course("0109210", 20, 50)]);
const girlsFirst = demandSupply({ general: mixedReport, graduates: null, matches: new Map([["0109210", { code: "0109210", status: "matched", courseIds: [22, 21] }]]), catalogue: mixedCatalogue, members: [...members].reverse(), rows: mixedRows, capacity: none });
const boysFirst = demandSupply({ general: mixedReport, graduates: null, matches: new Map([["0109210", { code: "0109210", status: "matched", courseIds: [21, 22] }]]), catalogue: mixedCatalogue, members, rows: mixedRows, capacity: none });
const girlsBranch = (reading: typeof girlsFirst) => reading.items[0].branches.find(branch => branch.track === "girls")!;
check(girlsBranch(boysFirst).gap === -1 && girlsBranch(girlsFirst).gap === -1 && boysFirst.items[0].gap === girlsFirst.items[0].gap,
  "S5 بنات 50 على شعبتين بسقف 60: فائض شعبة واحدة بسقف نسختها، والنتيجة نفسها أيّاً كان العضو الأول", [girlsBranch(boysFirst), girlsBranch(girlsFirst)]);

/* B1: عجزٌ يغطّيه نقلٌ مقترح فقط ليس أخضر — الشارة تقرأ الطلبة بلا مقعد. */
const moveOnly = demandSupply({ general: report([course("0109105", 70, 10)]), graduates: null, matches, catalogue, members,
  rows: [{ AdCourseId: 1, AdCollegeId: 11, SCode: "01" }, { AdCourseId: 2, AdCollegeId: 12, SCode: "51" }, { AdCourseId: 2, AdCollegeId: 12, SCode: "52" }], capacity: none });
const moveFact = courseDemandFacts(moveOnly, matches)["1"];
check(moveOnly.items[0].move !== null && moveFact.gap === 0 && moveFact.unmetStudents === 30 && demandBadgeTone(moveFact) === "short" && (moveOnly.service.general || 0) < 100,
  "B1 بنين 70 على 40 وبنات 10 على 80: النقل مقترح، و30 بلا مقعد، والشارة عجز لا «مخدوم»", { item: moveOnly.items[0], fact: moveFact, service: moveOnly.service });
check(demandBadgeTone({ students: 50, graduates: 0, seats: 60, gap: 0, unmetStudents: 0, unmetGraduates: 0 }) === "ok" && demandBadgeTone({ students: 10, graduates: 0, seats: 120, gap: -1, unmetStudents: 0, unmetGraduates: 0 }) === "spare",
  "B1 الأخضر للمتوازن وحده، والفائض هادئ");

/* U1: مقررٌ في تقرير الخريجين وحده (بلا شعبة) لا يختفي: عجزٌ، ونسبة الخريجين دون 100، وحقيقته للشارة والحذف. */
const onlyGrads = demandSupply({ general: report([course("0109105", 30, 30)]), graduates: report([course("0109108", 6, 0, 1)]), matches, catalogue, members,
  rows: [{ AdCourseId: 1, AdCollegeId: 11, SCode: "01" }, { AdCourseId: 2, AdCollegeId: 12, SCode: "51" }], capacity: none });
const g108 = onlyGrads.items.find(item => item.code === "0109108");
check(Boolean(g108) && g108!.unmetGraduates === 6 && g108!.gap > 0 && onlyGrads.service.graduates === 0 && courseDemandFacts(onlyGrads, matches)["3"]?.graduates === 6,
  "U1 مقرر الخريجين وحدهم بلا شعبة: في القائمة بعجزه، ونسبة الخريجين 0 لا 100، وحقيقته للشارة والحذف", { g108, service: onlyGrads.service });
/* A1 */
const alert = demandAlertSummary(onlyGrads.items);
check(alert.show && alert.uncovered === 1 && alert.graduates === 6 && alert.seats === onlyGrads.items.reduce((sum, item) => sum + item.unmetStudents, 0),
  "A1 مقرر الخريجين بلا شعبة: «بلا شعبة» 1 وخريجون 6 ونقص المقاعد مجموعُ من بلا مقعد", alert);
const split = demandAlertSummary([{ sections: 2, unmetStudents: 25, unmetGraduates: 0, branches: [
  { track: "boys", demand: 40, graduates: 0, sections: 2, seats: 60 }, { track: "girls", demand: 25, graduates: 0, sections: 0, seats: 0 }] }]);
check(split.show && split.uncovered === 0 && split.seats === 25 && split.byTrack.map(row => `${row.track}:${row.uncovered}:${row.seats}`).join(",") === "boys:0:0,girls:1:25",
  "A1 شعبٌ للبنين فقط: العائلة ليست «بلا شعبة»، لكن البنات بلا شعبة وينقصهن 25 مقعداً", split);
check(!demandAlertSummary([]).show && !demandAlertSummary([{ sections: 1, unmetStudents: 0, unmetGraduates: 0, branches: [] }]).show,
  "A1 بلا تقرير أو بلا عجز: لا تنبيه");
/* A2 */
const many = Array.from({ length: 45 }, (_, index) => ({
  code: `0109${String(100 + index)}`, name: `مقرر ${index}`, demand: 10, graduates: index < 3 ? 2 : 0, cap: 60, capAssumed: false,
  sections: 0, seats: 0, gap: 1, unmetStudents: 10, unmetGraduates: index < 3 ? 2 : 0,
  branches: [{ track: "" as const, demand: 10, graduates: index < 3 ? 2 : 0, sections: 0, seats: 0, gap: 1, colleges: [] }], move: null,
}));
const view = supplyView(many);
check(view.list.length === SUPPLY_LIST_LIMIT && view.total === 45 && view.summary.uncovered === 45 && view.summary.seats === 450 && view.summary.graduates === 6,
  "A2 45 مقرراً بلا شعبة: القائمة 40، والملخّص 45 مقرراً و450 مقعداً و6 خريجين من البنود كلها", { list: view.list.length, total: view.total, summary: view.summary });
const serverSource = fs.readFileSync("src/server/actualDemand.ts", "utf8");
check(/supplyView\(supply\.items\)/.test(serverSource) && /alertSummary: view/.test(serverSource) && !/\.slice\(0, 40\)/.test(serverSource),
  "A2 demandReading يرسل alertSummary من البنود كلها ولا يقص القائمة يدوياً");
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
