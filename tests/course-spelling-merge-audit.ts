/**
 * ── مقررٌ واحد بإملاءين: معاينة ثم دمج بتأكيد (G5) ─────────────────────────────
 * سلوكٌ حقيقي على المستودع (وضع التجربة، قاعدة مؤقتة): الدمج ينقل المواعيد وروابط
 * الصحيفة إلى الباقي، ويأخذ الاسم المعتمد، ويُزيل المكرّر — في حفظٍ واحد. ثم ربط المسار:
 * تأكيدٌ صريح، إعادة فحص لحظة الدمج، ورفضُ ما تشير إليه بيانات الطلبة أو القواعد.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "course-merge-"));
Object.assign(process.env, { DATA_MODE: "demo", NODE_ENV: "development", SCHEDULE_PRIVATE_DIR: privateDir, AUTO_IMPORT_LEGACY_DATA: "false" });

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 400)); }
};

const { initDatabase, Repository } = await import("../src/db/repository");
const { spellingTwinGroups } = await import("../src/utils/courseSpellingTwins");
await initDatabase();
const college = (await Repository.getColleges())[0] || await Repository.createCollege("TST", "كلية اختبار");
const section = await Repository.createSection(Number(college.AdCollegeId), "TSTM", "قسم اختبار الدمج");
const term = (await Repository.getTerms())[0] || await Repository.createTerm("فصل اختبار");
check(section, "S0 قسمٌ للاختبار");
if (section) {
  const collegeId = Number(section.AdCollegeId), sectionId = Number(section.AdSectionId);
  const keeper = await Repository.createCourse(collegeId, sectionId, "9901777", "اداره مراكز مصادر التعلم", 3, 3, 30, false);
  const dup = await Repository.createCourse(collegeId, sectionId, "777", "إدارة مراكز مصادر التعلم", 3, 3, 30, false);
  const other = await Repository.createCourse(collegeId, sectionId, "9901778", "تكنولوجيا التعليم", 3, 3, 30, false);
  const own = (await Repository.getCourses()).filter(course => Number(course.AdSectionId) === sectionId).map(course => course.CourseName);
  const group = spellingTwinGroups(own).find(names => names.includes(dup.CourseName));
  check(group && group.includes(keeper.CourseName) && !group.includes(other.CourseName), "S1 الفحص يجمع الإملاءين ولا يجمع مقرراً آخر", group);
  const row = await Repository.createSchedule({ AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: Number(term.AdTermId), AdCourseId: dup.AdCourseId, SCode: "501",
    AdInstructorId: 0, fsunday: true, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false, fstarttime: "19:00", fendtime: "19:50", AdRoomCode: "", AdRoomHall: "" } as any);
  const result = await Repository.mergeCourses(keeper.AdCourseId, [dup.AdCourseId], "إدارة مراكز مصادر التعلم", "test");
  const courses = await Repository.getCourses();
  const moved = await Repository.getScheduleById(row.id);
  check(result.schedules === 1 && Number(moved?.AdCourseId) === Number(keeper.AdCourseId), "S2 مواعيد المكرّر تنتقل إلى المقرر الباقي", { result, moved });
  check(!courses.some(course => course.AdCourseId === dup.AdCourseId) && courses.find(course => course.AdCourseId === keeper.AdCourseId)?.CourseName === "إدارة مراكز مصادر التعلم", "S3 المكرّر يُزال والباقي يأخذ الاسم المعتمد");
  check(courses.some(course => course.AdCourseId === other.AdCourseId), "S4 المقرر المختلف لا يُمسّ");
  let refused = false;
  try { await Repository.mergeCourses(keeper.AdCourseId, [other.AdCourseId + 100000], "x"); } catch { refused = true; }
  check(refused, "S5 مقررٌ غير موجود يُرفض ولا يُكتب شيء");
}

const routes = fs.readFileSync("src/server/planReviewRoutes.ts", "utf8");
const merge = routes.slice(routes.indexOf('app.post("/api/plan-review/sheet/spelling-twins/merge"'), routes.indexOf("/* ── مقررات الأقسام الخدمية"));
check(/req\.body\?\.confirm !== true[\s\S]{0,80}428/.test(merge), "R1 لا دمج بلا تأكيد صريح بعد المعاينة");
check(/spellingTwinScan\(\)/.test(merge) && /course\.mergeable/.test(merge) && /group\.names\.includes\(canonicalName\)/.test(merge), "R2 إعادة فحص لحظة الدمج، واسمٌ من إملاءات المقرر، ورفض المستعمل عند الطلبة/القواعد");
check(/deps\.isRootAdmin\(req\)/.test(merge) && /res\.locals\.auditChanges/.test(merge), "R3 للحساب الرئيسي وحده، ومسجّل في التدقيق");
const ui = fs.readFileSync("src/components/SpellingTwinsMerge.tsx", "utf8");
check(/window\.confirm\(/.test(ui) && /confirm: true/.test(ui) && /schedules/.test(ui) && /plans/.test(ui), "U1 الواجهة تعرض المراجع وتطلب التأكيد قبل الدمج");
check(fs.readFileSync("src/components/PlanSheetUpload.tsx", "utf8").includes("<SpellingTwinsMerge />"), "U2 الدمج بجانب فحص المكرر");

console.log(`\ncourse-spelling-merge audit: ${passed} passed, ${failed} failed`);
fs.rmSync(privateDir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
