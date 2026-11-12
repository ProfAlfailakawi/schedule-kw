/**
 * ── «مراجعة الاعتماد» على عائلة القسم: بنين وبنات في كلياتٍ مختلفة ─────────────
 *
 * شكلُ الإنتاج نفسه (قُرئ للقراءة فقط): «قسم تكنولوجيا التعليم» قسمٌ واحد له سجلٌّ
 * في كل كلية — بنين (5/6)، بنات (6/7)، بنات الجهراء (10/54) — ومقرراتُ كل سجلٍّ له.
 *
 *   F1 أيُّ عضوٍ فُتح: يقرأ الخادمُ العائلةَ كلها، ويجد العضوُ المفتوح مواعيدَه كلها فيها.
 *   F2 الشاشة تقسم ما قرأه الخادم بالكلية والقسم: كلُّ عضوٍ يرى مواعيده وحده — لا صفر.
 *   F3 رئيسُ قسمٍ نطاقه البنين وحدهم: العائلةُ تُقصر على نطاقه، ولا يُرفض طلبُه.
 *   F4 ويُرفض عضوٌ خارج نطاقه برسالة، لا بقائمةٍ فارغةٍ صامتة.
 *   F5 «توزيع الفترتين» يُحسب لمواعيد الكلية المفتوحة، لا للعائلة كلها.
 *   F6 قسمٌ ليس عنده إلا ملاحظاتُ «خارج سُلّم اللائحة» (شكلُ تكنولوجيا التعليم بنين في
 *      الفصل الثاني 2026/2027) تُعرض ملاحظاتُه، لا «لا ملاحظات».
 *   F7 والورقةُ المطبوعة كذلك: تُطبع ملاحظاتُ السُّلّم في بطاقة الملاحظة المطبوعة نفسها،
 *      ويُسأل عن «لا توجد موانع ظاهرة» بالعدّ نفسه الذي تسأل به الشاشة.
 */
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import { randomBytes } from "crypto";
import type { AddressInfo } from "net";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};

const TERM = 107;
const MEMBERS = [
  { collegeId: 5, sectionId: 6, college: "كلية التربية الأساسية - بنين", rows: 5 },
  { collegeId: 6, sectionId: 7, college: "كلية التربية الأساسية - بنات", rows: 7 },
  { collegeId: 10, sectionId: 54, college: "كلية التربية الأساسية - بنات - الجهراء", rows: 2 },
];
const courses: any[] = [], schedules: any[] = [];
let courseId = 1000, rowId = 1;
for (const member of MEMBERS) {
  for (let i = 0; i < member.rows; i += 1) {
    courseId += 1;
    courses.push({ AdCourseId: courseId, AdCollegeId: member.collegeId, AdSectionId: member.sectionId, CourseCode: `01091${String(i).padStart(2, "0")}`, CourseName: `مقرر ${i + 1}`, CourseCredit: 3, CourseHours: 3, MaxStudent: 30 });
    schedules.push({
      id: rowId++, AdCollegeId: member.collegeId, AdSectionId: member.sectionId, AdTermId: TERM, AdCourseId: courseId, AdCourseName: `مقرر ${i + 1}`,
      SCode: String(501 + i), AdInstructorId: 100 + i, fsunday: true, ftuesday: true, fmonday: false, fwednesday: false, fthursday: false,
      fstarttime: `${String(8 + i).padStart(2, "0")}:00`, fendtime: `${String(8 + i).padStart(2, "0")}:50`, AdRoomCode: `R${member.collegeId}`, AdRoomHall: String(i + 1),
    });
  }
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "review-family-"));
fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({
  users: [
    { SystemUserId: 1, Name: "مدير النظام", SystemUserLogin: "admin", SystemUserPass: "", IsAdminUser: true, IsActive: true, IsLocked: false, IsDeleted: false },
    { SystemUserId: 2, Name: "رئيس قسم البنين", SystemUserLogin: "head", SystemUserPass: "", IsAdminUser: false, IsActive: true, IsLocked: false, IsDeleted: false },
  ],
  formNames: [], collegeUserAssign: [{ id: 1, SystemUserId: 2, AdCollegeId: 5, AdSectionId: 6 }],
  formSecurity: [{ id: 1, SystemUserId: 1, FormNameId: 7 }, { id: 2, SystemUserId: 2, FormNameId: 7 }],
  terms: [{ AdTermId: TERM, AdTermName: "الفصل الثاني 2026/2027", AdTermStart: "2027-02-01", AdTermWeeks: 15, AdTermClosed: false }],
  colleges: MEMBERS.map(member => ({ AdCollegeId: member.collegeId, AdCollegeName: member.college })),
  sections: MEMBERS.map(member => ({ AdSectionId: member.sectionId, AdCollegeId: member.collegeId, AdSectionName: "قسم تكنولوجيا التعليم" })),
  instructors: Array.from({ length: 10 }, (_, i) => ({ AdInstructorId: 100 + i, AdInstructorName: `د. أستاذ ${i + 1}` })),
  courses, schedules, rooms: [], studentNeeds: [], studentProfiles: [],
}), { mode: 0o600 });
process.env.NODE_ENV = "test"; process.env.DATA_MODE = "demo"; process.env.SCHEDULE_PRIVATE_DIR = dir;
const quiet = console.warn; console.warn = () => {};
const { Repository, initDatabase } = await import("../src/db/repository");
const { authMiddleware } = await import("../src/server/core/auth");
const { registerScheduleReviewRoutes } = await import("../src/server/routes/scheduleReviewRoutes");
await initDatabase(); console.warn = quiet;

const sessionFor = async (userId: number) => {
  const id = `sess_${randomBytes(32).toString("hex")}`;
  await Repository.createSession(id, userId, 3_600_000);
  return `session_id=${id}`;
};
const app = express(); app.use(express.json()); app.use(authMiddleware as any);
registerScheduleReviewRoutes(app);
const server = app.listen(0); const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const read = async (cookie: string, collegeId: number, sectionId: number) => {
  const response = await fetch(`${base}/api/schedules/review-readiness?collegeId=${collegeId}&sectionId=${sectionId}&termId=${TERM}&family=1`, { headers: { cookie } });
  return { status: response.status, json: await response.json().catch(() => ({})) as any };
};
/* ما تفعله الشاشة (ScheduleReview: scopeRows) بما قرأه الخادم. */
const ownRows = (rows: any[], collegeId: number, sectionId: number) =>
  rows.filter(row => Number(row.AdCollegeId) === collegeId && Number(row.AdSectionId) === sectionId);

try {
  const admin = await sessionFor(1);
  const total = MEMBERS.reduce((sum, member) => sum + member.rows, 0);
  for (const member of MEMBERS) {
    const { status, json } = await read(admin, member.collegeId, member.sectionId);
    const memberKeys = (json.family?.members || []).map((item: any) => `${item.collegeId}:${item.sectionId}`).sort().join(",");
    check(status === 200 && json.family?.rows?.length === total && memberKeys === MEMBERS.map(item => `${item.collegeId}:${item.sectionId}`).sort().join(","),
      `F1 ${member.college}: العائلة كلها (${total} موعداً في ${MEMBERS.length} كليات)`, { status, rows: json.family?.rows?.length, memberKeys });
    check(ownRows(json.family?.rows || [], member.collegeId, member.sectionId).length === member.rows,
      `F2 ${member.college}: الشاشة تجد مواعيد الكلية المفتوحة (${member.rows})`, ownRows(json.family?.rows || [], member.collegeId, member.sectionId).length);
  }

  const head = await sessionFor(2);
  const boys = await read(head, 5, 6);
  check(boys.status === 200 && boys.json.family?.members?.length === 1 && ownRows(boys.json.family.rows, 5, 6).length === MEMBERS[0].rows,
    "F3 رئيس قسم البنين: العائلة مقصورةٌ على نطاقه ومواعيدُه كلها حاضرة", { status: boys.status, members: boys.json.family?.members });
  const girls = await read(head, 6, 7);
  check(girls.status === 403 && typeof girls.json.error === "string" && girls.json.error.length > 0, "F4 عضوٌ خارج النطاق يُرفض برسالة", girls);
} finally {
  server.close();
}

const review = fs.readFileSync(path.join(process.cwd(), "src/components/ScheduleReview.tsx"), "utf8");
check(/periodBalanceSnapshot\(scopeRows\)/.test(review) && !/periodBalanceSnapshot\(rows\)/.test(review),
  "F5 «توزيع الفترتين» لمواعيد الكلية المفتوحة وحدها");

/* F6: موعدٌ بثلاث ساعات يبدأ 08:30 الاثنين — خارج السُّلّم، ولا شيء غيره يمنع أو يُراجَع. */
{
  const { reviewSchedule } = await import("../src/utils/scheduleRegulations");
  const ladderCourses = new Map([[1, { AdCourseId: 1, CourseCode: "0109105", CourseName: "مقرر", CourseHours: 3, CourseCredit: 3, CourseTeachingMode: "theoretical", AdSectionId: 6, AdCollegeId: 5 }]]);
  const ladderRows = [{ id: 1, AdCollegeId: 5, AdSectionId: 6, AdTermId: TERM, AdCourseId: 1, SCode: "501", AdInstructorId: 100, fsunday: false, fmonday: true, ftuesday: false, fwednesday: false, fthursday: false, fstarttime: "08:30", fendtime: "11:20", AdRoomCode: "011B17", AdRoomHall: "G20" }];
  const found = reviewSchedule({ rows: ladderRows, courses: ladderCourses, instructors: new Map(), previousRows: [], nature: new Map() } as any) as any[];
  const ladder = found.filter(item => item.rule === "regulation-ladder");
  const shownElsewhere = found.filter(item => item.rule !== "regulation-ladder" && item.rule !== "period-balance");
  check(ladder.length === 1 && shownElsewhere.length === 0, "F6 الشكل نفسه: ملاحظةُ سُلّمٍ واحدة ولا غيرها", found.map(item => item.rule));
  const { reviewHasFindings } = await import("../src/utils/approvalScore");
  check(reviewHasFindings(0, 0, ladder.length) && !reviewHasFindings(0, 0, 0), "F6 ملاحظاتُ السُّلّم وحدها تكفي لتُعرض القائمة");
  check(/reviewHasFindings\(groupedFindings\.length, warningGroups\.length, quietFindings\.length\)/.test(review)
    && !/\{groupedFindings\.length \|\| warningGroups\.length \?/.test(review), "F6 والشاشة تسأل بها، لا بالموانع والتنبيهات وحدها");
}

/* F7: الورقةُ المطبوعة — ملاحظاتُ السُّلّم وحدها تُطبع، بالبطاقة نفسها، مجمّعةً بالمقررات. */
{
  const { packPrintFindings } = await import("../src/utils/printFindingPages");
  const ladderOnly = [{ groupKey: "regulation-ladder", rowIds: [1, 2, 3] }];
  const pages = packPrintFindings(ladderOnly, finding => finding.rowIds);
  check(pages.length === 1 && pages[0].length === 1 && pages[0][0].rowIds.length === 3, "F7 ملاحظةُ السُّلّم وحدها تملأ الصفحة الأولى بمواعيدها كلها", pages);
  check(/packPrintFindings<ReviewFindingGroup>\(printFindings,/.test(review)
    && /const printFindings = \[\.\.\.groupedFindings, \.\.\.warningGroups, \.\.\.ladderNotes\]/.test(review),
    "F7 الورقةُ ترصّ ملاحظاتِ السُّلّم مع الموانع والتنبيهات");
  check(/reviewHasFindings\(groupedFindings\.length, warningGroups\.length, ladderNotes\.length\) \? firstPrintPage\.map\(renderPrintFinding\)/.test(review)
    && !/\{findings\.length \? firstPrintPage/.test(review), "F7 «لا توجد موانع ظاهرة» على الورقة بالعدّ نفسه الذي تسأل به الشاشة");
  check(/finding\.rule === "regulation-ladder" \? AR\.course : AR\.conflict/.test(review), "F7 السُّلّمُ يُعدّ بالمقررات على الورقة، لا بالتعارضات");
  const printCards = review.match(/className=\{`print-review-finding /g) || [];
  check(printCards.length === 1, "F7 لا بطاقةَ مطبوعةً جديدة: الملاحظةُ ترسم بالبطاقة القائمة", printCards.length);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
