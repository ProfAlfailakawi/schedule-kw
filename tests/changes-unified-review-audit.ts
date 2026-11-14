/**
 * ── «مراجعة الاعتماد» واحدةٌ في المكانين (المالك 2026-11-14) ─────────────────
 *
 * «تغييرات الجدول» تدمج الشاشة نفسها التي في «الجدول الدراسي» (ScheduleReview)،
 * فتقرأ من /api/reports/schedule-changes/review — المسارِ الذي يعيد قراءة
 * review-readiness نفسها (reviewReadinessReading) ببوابة تقرير التغييرات.
 *
 *   U1 التسجيل ورئيسُ القسم (بلا الصلاحية 7) يقرآن المراجعة في نطاقهما.
 *   U2 ولا يكتبان: مسارات الصلاحية 7 (review-readiness وفحص التعارض) تبقى مردودة لهما.
 *   U3 ونطاقُ القارئ محفوظ: قسمٌ خارج نطاق رئيس القسم يُردّ، والعائلةُ تُقصر على نطاقه.
 *   U4 القراءةُ نفسُها: موانعُ المسار الجديد وعائلتُه هي ما يقرؤه review-readiness للنطاق نفسه.
 *   U5 درجةٌ واحدة: approvalScoreBreakdown على القراءتين يعطي الرقم نفسه، ولا حسابَ ثانياً في التغييرات.
 *   U6 «عالج» داخل التغييرات ينقل إلى الموعد في «الجدول كاملاً» ولا يُغلق شيئاً.
 *   U7 «موانع الاعتماد» في التغييرات هي الموانع المادّية وحدها، وبنودُ اللائحة «للمعالجة» — كالمراجعة.
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
  { collegeId: 5, sectionId: 6, college: "كلية التربية الأساسية - بنين" },
  { collegeId: 6, sectionId: 7, college: "كلية التربية الأساسية - بنات" },
];
const courses: any[] = [], schedules: any[] = [];
let courseId = 1000, rowId = 1;
for (const member of MEMBERS) {
  for (let i = 0; i < 4; i += 1) {
    courseId += 1;
    courses.push({ AdCourseId: courseId, AdCollegeId: member.collegeId, AdSectionId: member.sectionId, CourseCode: `01091${String(i).padStart(2, "0")}`, CourseName: `مقرر ${i + 1}`, CourseCredit: 3, CourseHours: 3, MaxStudent: 30 });
    schedules.push({
      id: rowId++, AdCollegeId: member.collegeId, AdSectionId: member.sectionId, AdTermId: TERM, AdCourseId: courseId, AdCourseName: `مقرر ${i + 1}`,
      SCode: String(501 + i), AdInstructorId: 100 + i, fsunday: true, ftuesday: true, fmonday: false, fwednesday: false, fthursday: false,
      fstarttime: `${String(8 + i).padStart(2, "0")}:00`, fendtime: `${String(8 + i).padStart(2, "0")}:50`, AdRoomCode: `R${member.collegeId}`, AdRoomHall: String(i + 1),
    });
  }
}
/* مانعٌ مادّي: أستاذُ الموعد الأول في موعدٍ ثانٍ في الوقت نفسه بالقسم نفسه. */
schedules.push({ ...schedules[0], id: rowId++, AdCourseId: courses[1].AdCourseId, SCode: "599", AdRoomHall: "9" });

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "changes-unified-review-"));
fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({
  users: [
    { SystemUserId: 1, Name: "مدير النظام", SystemUserLogin: "admin", SystemUserPass: "", IsAdminUser: true, IsActive: true, IsLocked: false, IsDeleted: false },
    { SystemUserId: 2, Name: "رئيس قسم البنين", SystemUserLogin: "head", SystemUserPass: "", IsAdminUser: false, IsActive: true, IsLocked: false, IsDeleted: false, Role: "departmentHead" },
    { SystemUserId: 3, Name: "رئيس التسجيل", SystemUserLogin: "reg", SystemUserPass: "", IsAdminUser: false, IsActive: true, IsLocked: false, IsDeleted: false, Role: "registrarHead" },
  ],
  formNames: [],
  collegeUserAssign: [
    { id: 1, SystemUserId: 2, AdCollegeId: 5, AdSectionId: 6 },
    { id: 2, SystemUserId: 3, AdCollegeId: 5, AdSectionId: 0 },
    { id: 3, SystemUserId: 3, AdCollegeId: 6, AdSectionId: 0 },
  ],
  formSecurity: [{ id: 1, SystemUserId: 1, FormNameId: 7 }],
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
const { registerReportsRoutes } = await import("../src/server/routes/reportsRoutes");
const { approvalScoreBreakdown } = await import("../src/utils/approvalScore");
await initDatabase(); console.warn = quiet;

const sessionFor = async (userId: number) => {
  const id = `sess_${randomBytes(32).toString("hex")}`;
  await Repository.createSession(id, userId, 3_600_000);
  return `session_id=${id}`;
};
const app = express(); app.use(express.json()); app.use(authMiddleware as any);
registerScheduleReviewRoutes(app);
registerReportsRoutes(app);
const server = app.listen(0); const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const get = async (cookie: string, url: string) => {
  const response = await fetch(`${base}${url}`, { headers: { cookie } });
  return { status: response.status, json: await response.json().catch(() => ({})) as any };
};
const q = (collegeId: number, sectionId: number) => `collegeId=${collegeId}&sectionId=${sectionId}&termId=${TERM}`;
/* ما تبنيه ScheduleReview من القراءة للدرجة: الموانع المادّية شريحةٌ واحدة، والباقي مواعيدُ سليمة. */
const scoreOf = (json: any) => approvalScoreBreakdown(
  (json.family?.rows || []).map((row: any) => Number(row.id)),
  (json.blockers || []).length ? [{ key: "material", label: "تعارض مادّي", tone: "block" as const, rowIds: json.blockers.flatMap((item: any) => item.rowIds) }] : [],
).score;

try {
  const admin = await sessionFor(1), head = await sessionFor(2), registrar = await sessionFor(3);

  for (const [who, cookie] of [["رئيس التسجيل", registrar], ["رئيس القسم", head]] as const) {
    const reading = await get(cookie, `/api/reports/schedule-changes/review?${q(5, 6)}`);
    check(reading.status === 200 && Array.isArray(reading.json.family?.rows) && reading.json.family.rows.length > 0 && Array.isArray(reading.json.blockers),
      `U1 ${who} يقرأ «مراجعة الاعتماد» من «تغييرات الجدول»`, { status: reading.status, error: reading.json.error });
    const readiness = await get(cookie, `/api/schedules/review-readiness?${q(5, 6)}&family=1`);
    check(readiness.status === 403, `U2 ${who}: مسارُ الورشة (الصلاحية 7) يبقى مردوداً`, readiness.status);
    const write = await fetch(`${base}/api/schedules/check-conflicts`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ AdCollegeId: 5, AdSectionId: 6, AdTermId: TERM }) });
    check(write.status === 403, `U2 ${who}: ولا يصل إلى مسارات الكتابة والتحقق`, write.status);
  }

  const outside = await get(head, `/api/reports/schedule-changes/review?${q(6, 7)}`);
  check(outside.status === 403 && typeof outside.json.error === "string", "U3 قسمٌ خارج نطاق رئيس القسم يُردّ برسالة", outside);
  const headReading = await get(head, `/api/reports/schedule-changes/review?${q(5, 6)}`);
  check((headReading.json.family?.members || []).length === 1 && (headReading.json.family?.rows || []).every((row: any) => Number(row.AdCollegeId) === 5),
    "U3 والعائلةُ تُقصر على نطاقه (البنين وحدهم)", headReading.json.family?.members);
  check((headReading.json.family?.colleges || []).some((college: any) => college.AdCollegeName === MEMBERS[0].college),
    "U3 وتحمل اسمَ كليته لوسم الحرم");

  const adminChanges = await get(admin, `/api/reports/schedule-changes/review?${q(5, 6)}`);
  const adminReadiness = await get(admin, `/api/schedules/review-readiness?${q(5, 6)}&family=1`);
  const strip = (json: any) => JSON.stringify({ blockers: json.blockers, warnings: json.warnings, conflicts: json.blockingConflicts, rows: json.blockingRows, family: (json.family?.rows || []).map((row: any) => row.id) });
  check(adminChanges.status === 200 && adminReadiness.status === 200 && strip(adminChanges.json) === strip(adminReadiness.json),
    "U4 القراءةُ نفسها في المكانين (الموانع والتنبيهات والعائلة)", { a: strip(adminChanges.json).slice(0, 200), b: strip(adminReadiness.json).slice(0, 200) });
  check(adminChanges.json.blockingConflicts >= 1, "U4 والمانعُ المادّي حاضرٌ في القراءة", adminChanges.json.blockingConflicts);
  check(scoreOf(adminChanges.json) === scoreOf(adminReadiness.json) && scoreOf(adminChanges.json) < 100,
    "U5 الدرجةُ من approvalScoreBreakdown واحدةٌ للقراءتين", [scoreOf(adminChanges.json), scoreOf(adminReadiness.json)]);
} finally {
  server.close();
}

const changes = fs.readFileSync(path.join(process.cwd(), "src/components/ScheduleChanges.tsx"), "utf8");
const review = fs.readFileSync(path.join(process.cwd(), "src/components/ScheduleReview.tsx"), "utf8");
check(!changes.includes("appointmentCoverageScore") && !/approvalScoreBreakdown\(/.test(changes) && /<ScheduleReview\s+inline/.test(changes),
  "U5 لا حسابَ ثانياً للدرجة في التغييرات: تعرضها المراجعةُ نفسها");
check(changes.includes("onFocusRows={onJump}") && changes.includes("jumpableIds={jumpable}")
  && /new Set\(\(report\.fullSchedule \|\| \[\]\)\.map\(row => Number\(row\.scheduleId\)\)\)/.test(changes)
  && changes.includes('setView("full")') && changes.includes('id={`schedule-row-${row.scheduleId}`}'),
  "U6 «عالج» ينقل إلى الموعد في «الجدول كاملاً» على هذه الصفحة");
check(/onFocusRows\(focusable\); if \(!inline\) onClose\(\);/.test(review) && /useDialogDismiss\(!inline, onClose\)/.test(review),
  "U6 ومدمجةً لا تُغلق نفسها ولا تحجز Escape");
check(changes.includes("extraRows={removedRows}") && /entry\.kind === "removed"/.test(changes) && /extraRows \|\| \[\]\)\.forEach/.test(review),
  "U6 والمحذوفُ من فرق التقرير يُسمّى به البند");

/* U8 (مراجعة الطلب): التقريرُ إذا أُعيد تحميله أُعيدت قراءةُ المراجعة معه. */
check(changes.includes("refreshKey={report}")
  && /\}, \[collegeId, sectionId, termId, localRows, readingUrl, refreshKey, retry\]\);/.test(review),
  "U8 إعادةُ تحميل التقرير تعيد قراءة المراجعة المدمجة (refreshKey)");
/* U9: لا درجةَ ولا حكمَ بلا قراءةٍ ناجحة — حالةُ «تعذّرت» بزرّ إعادة، ولا ادّعاءَ بفحصٍ محلي. */
{
  const guard = review.indexOf("const needsServer = Boolean(readingUrl) || !localRows.length;");
  const unavailable = review.indexOf("if (needsServer && (!readinessChecked || readinessError)) {");
  const firstRing = review.indexOf('className={`review-ring score-tone-');
  const block = review.slice(unavailable, review.indexOf("// The printable sheet lives inside this dialog"));
  check(guard > 0 && unavailable > guard && firstRing > unavailable,
    "U9 حالةُ «لا قراءة» تسبق كلَّ رسمٍ للدرجة والحكم");
  check(block.includes("تعذّرت قراءة المراجعة الآن") && block.includes("أعد المحاولة") && block.includes("setRetry(value => value + 1)")
    && !block.includes("score") && !block.includes("لا ملاحظات") && !block.includes("محلياً"),
    "U9 «تعذّرت قراءة المراجعة الآن» و«أعد المحاولة» — بلا درجة ولا «لا ملاحظات» ولا ادّعاءِ فحصٍ محلي");
  check(block.includes("أقرأ المراجعة…"), "U9 وقبل وصول القراءة: «أقرأ المراجعة…» لا درجة 100");
}

const { changesReviewHeadline } = await import("../src/utils/changesReviewHeadline");
const headline = changesReviewHeadline({ reviewBlockers: [], blockingConflicts: 0, regulationNotices: [{ approvalEffect: "block" }, { approvalEffect: "note" }] as any });
check(headline.material === 0 && headline.needsFix === 1 && headline.tone === "warn" && /للمعالجة/.test(headline.label),
  "U7 بندُ اللائحة «للمعالجة» لا «مانع اعتماد» — كعنوان المراجعة", headline);
check(changesReviewHeadline({ reviewBlockers: [{}] as any, blockingConflicts: 2, regulationNotices: [{ approvalEffect: "block" }] as any }).material === 2,
  "U7 والموانعُ هي المادّية وحدها");
check(changes.includes("blockers={changesReviewHeadline(report).material}"), "U7 وقصةُ الفصل تعدّها كذلك");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
