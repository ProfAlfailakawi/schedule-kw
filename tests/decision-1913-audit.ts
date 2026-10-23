/**
 * ── قرار 1913/2016: م.7/2 ────────────────────────────────────────────────────
 *
 * The morning/evening share of the department's sections, added beside the
 * articles the system already checked. It is a note: it is said, it never
 * blocks and it never asks an instructor for an excuse. The label stays the decision's one
 * number, and the existing checks are untouched.
 */
import {
  DECISION_1912_LABEL, isDecision1912Finding, regulationScore, reviewSchedule,
} from "../src/utils/scheduleRegulations";
import type { AdCourse, FSchedule } from "../src/types";
import { createDemoSandboxState } from "../src/db/demoSandbox";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}`); }
};

const course = (id: number, hours: number): AdCourse => ({
  AdCourseId: id, AdCollegeId: 1, AdSectionId: 1, CourseCode: `C${id}`, CourseName: `مقرر ${id}`,
  CourseCredit: hours, CourseHours: hours, MaxStudent: 40,
});
let nextId = 1;
const row = (courseId: number, section: string, days: string[], start: string, end: string, instructor = 0): FSchedule => ({
  id: nextId++, AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdCourseId: courseId, AdCourseName: "",
  SCode: section, AdInstructorId: instructor || 100 + nextId,
  fsunday: days.includes("sun"), fmonday: days.includes("mon"), ftuesday: days.includes("tue"),
  fwednesday: days.includes("wed"), fthursday: days.includes("thu"),
  fstarttime: start, fendtime: end, AdRoomCode: "", AdRoomHall: "",
} as FSchedule);

const review = (rows: FSchedule[], courses: AdCourse[]) => reviewSchedule({
  rows, courses: new Map(courses.map(c => [c.AdCourseId, c])), instructors: new Map(),
});
const byRule = (findings: ReturnType<typeof review>, rule: string) => findings.find(f => f.rule === rule);

/* ── رقم القرار واحد ──────────────────────────────────────────────────────── */
check(DECISION_1912_LABEL === "قرار 1913/2016", `العنوان رقمُ القرار وحده: «${DECISION_1912_LABEL}»`);

/* ── م.7/2: الفترتان الصباحية والمسائية ───────────────────────────────────── */
{
  const courses = Array.from({ length: 12 }, (_, i) => course(100 + i, 3));
  const allMorning = courses.map(c => row(c.AdCourseId, "1", ["sun", "tue", "thu"], "09:00", "09:50"));
  const found = byRule(review(allMorning, courses), "period-balance");
  check(Boolean(found) && found!.rowIds.length === 0 && /100%/.test(found!.detail), "قسمٌ كلُّه صباحي: ملاحظة بالنسبة ولا تسمّي موعداً");
  const balanced = courses.map((c, i) => row(c.AdCourseId, "1", ["sun", "tue", "thu"], i < 7 ? "09:00" : "15:00", i < 7 ? "09:50" : "15:50"));
  check(!byRule(review(balanced, courses), "period-balance"), "7 صباحاً و5 مساءً (58%): ضمن الحدّين، لا تنبيه");
  check(!byRule(review(allMorning.slice(0, 4), courses), "period-balance"), "أربع شعبٍ لا تكفي لنسبة: لا تنبيه");
}

/* ── الموجود لم يتغيّر ────────────────────────────────────────────────────── */
{
  const courses = [course(9, 3)];
  const clash = [row(9, "1", ["sun"], "08:00", "08:50"), row(9, "2", ["sun"], "08:00", "08:50")];
  const found = byRule(review(clash, courses), "sections-same-hour");
  check(Boolean(found) && found!.article === "م.7/5" && found!.approvalEffect === "review", `م.7/5 كما كانت: «${found?.article}»`);
}

/* ── لا شيءَ من اللائحة يمنع، والحلقة تقرأ الجديد ─────────────────────────── */
{
  const courses = Array.from({ length: 12 }, (_, i) => course(200 + i, 3));
  const rows = courses.map(c => row(c.AdCourseId, "1", ["sun", "tue", "thu"], "09:00", "09:50"));
  const findings = review(rows, courses);
  check(findings.filter(isDecision1912Finding).every(f => f.approvalEffect !== "block"), "لا ملاحظة من اللائحة تمنع الاعتماد");
  check(regulationScore(findings, rows.length) < 100, "ودرجة المطابقة تحسب ملاحظة النسبة");
  check(!findings.some(f => f.rule === "lecture-period" || f.rule === "fixed-time"), "ولا قاعدةَ غير م.7/2 أُضيفت");
}

/* ── الديمو: تكنولوجيا التعليم، الفصل الأول 2026/2027 ─────────────────────── */
{
  const state: any = createDemoSandboxState();
  const rows = state.schedules.filter((r: any) => r.AdTermId === 1 && r.AdCollegeId === 1 && r.AdSectionId === 1);
  const demo = reviewSchedule({
    rows, courses: new Map(state.courses.map((c: any) => [Number(c.AdCourseId), c])),
    instructors: new Map(state.instructors.map((i: any) => [Number(i.AdInstructorId), i])),
  });
  const found = byRule(demo, "period-balance");
  check(Boolean(found) && /73%/.test(found!.detail), `الديمو يُظهر تنبيه النسبة على تكنولوجيا التعليم (${found?.detail || "لا تنبيه"})`);
  check(rows.filter((r: any) => /م\.7\/2/.test(String(r.fdetail || ""))).length === 1, "وشعبةٌ واحدة مشروحةٌ في ملاحظتها بأنها مقصودة");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
