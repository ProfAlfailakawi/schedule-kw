/**
 * ── قرار 1913/2016 بجانب قرار 1912/2016 ──────────────────────────────────────
 *
 * The system reads two decisions side by side. The articles they share cite
 * both numbers; the three only 1913 states (م.7/2، م.7/8، م.7/9) cite 1913 and
 * are notes: they are said, they never block and they never ask an instructor
 * for an excuse.
 */
import {
  DECISIONS_LABEL, isDecisionFinding, regulationScore, reviewSchedule,
} from "../src/utils/scheduleRegulations";
import type { AdCourse, FSchedule } from "../src/types";

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

/* ── الرقمان معاً ─────────────────────────────────────────────────────────── */
check(DECISIONS_LABEL.includes("1912/2016") && DECISIONS_LABEL.includes("1913/2016"), `العنوان يحمل الرقمين: «${DECISIONS_LABEL}»`);

/* ── م.7/8: 50/80 من 1912 داخل فترتي 1913، والأطول يُنبَّه عليه ─────────── */
{
  const courses = [course(1, 3), course(2, 3), course(3, 4), course(4, 3)];
  const fits = [
    row(1, "1", ["sun", "tue", "thu"], "08:00", "08:50"),
    row(2, "1", ["mon", "wed"], "08:00", "09:20"),
    row(3, "1", ["tue", "thu"], "10:00", "12:00"),
    row(4, "1", ["wed"], "08:00", "11:00"), /* مختبرٌ بثلاث ساعات: خارج المادة */
  ];
  check(!byRule(review(fits, courses), "lecture-period"), "محاضراتُ 50 و80 دقيقة، وساعتا الثلاثاء/الخميس للمقرر الرباعي، والمختبر: لا تنبيه");
  const long = row(1, "2", ["sun", "tue"], "10:00", "11:15");
  const found = byRule(review([...fits, long], courses), "lecture-period");
  check(Boolean(found) && found!.rowIds.length === 1 && found!.rowIds[0] === long.id, "محاضرةُ 75 دقيقة يوم الأحد أطولُ من فترة الساعة فيُنبَّه عليها وحدها");
  check(found?.source === "decision-1913" && found.approvalEffect === "note" && found.article.includes("1913/2016"), "والتنبيه من قرار 1913 ومرجعه يذكره، وهو ملاحظة لا منع");
  const fractional = { ...course(6, 3), CourseHours: 2.5 };
  check(!byRule(review([row(6, "1", ["sun"], "10:00", "11:15")], [fractional]), "lecture-period"), "مقرر 2.5 ساعة ليس ثلاثياً: لا تقريب إلى 3 ولا تنبيه");
  const lab = { ...course(7, 3), CourseRoomType: "مختبر حاسوب" };
  check(!byRule(review([row(7, "1", ["sun"], "10:00", "11:30")], [lab]), "lecture-period"), "مقرر نوع قاعته مختبر عملي وإن قصرت جلسته: لا تنبيه");
}

/* ── م.7/9: الشعبة بوقتٍ ثابت بين أيامها ──────────────────────────────────── */
{
  const courses = [course(5, 4)];
  const same = [row(5, "1", ["mon", "wed"], "08:00", "09:20"), row(5, "1", ["thu"], "08:00", "08:50")];
  check(!byRule(review(same, courses), "fixed-time"), "الرباعي على الاثنين والأربعاء والخميس بالبداية نفسها: لا تنبيه");
  const drift = [row(5, "2", ["mon", "wed"], "08:00", "09:20"), row(5, "2", ["thu"], "11:00", "11:50")];
  const found = byRule(review(drift, courses), "fixed-time");
  check(Boolean(found) && found!.rowIds.length === 2 && found!.approvalEffect === "note", "الشعبة نفسها ببدايتين مختلفتين: ملاحظة على صفّيها");
}

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

/* ── المشترك بين القرارين يذكر الرقمين ───────────────────────────────────── */
{
  const courses = [course(9, 3)];
  const clash = [row(9, "1", ["sun"], "08:00", "08:50"), row(9, "2", ["sun"], "08:00", "08:50")];
  const found = byRule(review(clash, courses), "sections-same-hour");
  check(Boolean(found) && found!.article.includes("1912/2016") && found!.article.includes("1913/2016"), `م.7/5 تذكر القرارين: «${found?.article}»`);
}

/* ── لا شيءَ من القرارين يمنع، والحلقة تقرأ الاثنين ──────────────────────── */
{
  const courses = [course(1, 3), course(5, 4)];
  const rows = [row(1, "9", ["sun"], "10:00", "11:30"), row(5, "3", ["mon", "wed"], "08:00", "09:20"), row(5, "3", ["thu"], "12:00", "12:50")];
  const findings = review(rows, courses);
  check(findings.filter(isDecisionFinding).every(f => f.approvalEffect !== "block"), "لا ملاحظة من القرارين تمنع الاعتماد");
  check(regulationScore(findings, rows.length) < 100, "ودرجة المطابقة تحسب ملاحظات 1913 مع 1912");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
