/**
 * ── مراجعة الاعتماد: I1 + I2 + I3 (ملاحظات المالك 2026-10-28) ────────────────
 *
 * I1  «نظريات التعلم والتكنولوجيا» الأحد·الثلاثاء 14:00–15:20 (2×80) مطابقٌ —
 *     الأستاذ الملتزم لا يُدرج تحت «لا يطابق نمط 3 ساعات».
 * I2  الدرجة معادلةٌ صريحة، والحلقة مفكّكة حسب البند، و«لو عالجت هذا ← N»
 *     حسابٌ لا تقدير، والموانع الحقيقية وحدها تحت «يوجد ما يمنع الاعتماد».
 * I3  لا خلط بين الكليات: الشعبة هويّتها كليتها ورقمها، و«تكرار الشعب في
 *     الوقت نفسه» داخل الكلية الواحدة فقط.
 */
import fs from "fs";
import path from "path";
import { meetingsMatchApprovedPattern, reviewSchedule, type DayKey } from "../src/utils/scheduleRegulations";
import { approvalScoreBreakdown } from "../src/utils/approvalScore";
import type { AdCourse, FSchedule } from "../src/types";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}`); }
};

const theoretical = (id: number, hours: number, name = `مقرر ${id}`): AdCourse => ({
  AdCourseId: id, AdCollegeId: 1, AdSectionId: 1, CourseCode: `0109${id}`, CourseName: name,
  CourseCredit: hours, CourseHours: hours, MaxStudent: 40, CourseTeachingMode: "theoretical",
} as AdCourse);
let nextId = 1;
const row = (courseId: number, section: string, days: string[], start: string, end: string, college = 1, instructor = 0): FSchedule => ({
  id: nextId++, AdCollegeId: college, AdSectionId: 1, AdTermId: 1, AdCourseId: courseId, AdCourseName: "",
  SCode: section, AdInstructorId: instructor || 500 + nextId,
  fsunday: days.includes("sun"), fmonday: days.includes("mon"), ftuesday: days.includes("tue"),
  fwednesday: days.includes("wed"), fthursday: days.includes("thu"),
  fstarttime: start, fendtime: end, AdRoomCode: "", AdRoomHall: "",
} as FSchedule);
const review = (rows: FSchedule[], courses: AdCourse[]) => reviewSchedule({ rows, courses: new Map(courses.map(c => [c.AdCourseId, c])), instructors: new Map() });
const has = (rows: FSchedule[], courses: AdCourse[], rule: string) => review(rows, courses).some(f => f.rule === rule);

console.log("I1 — م.7/8 يقرأ الشكل لا اليوم المثال");
{
  const course = theoretical(121, 3, "نظريات التعلم والتكنولوجيا");
  check(!has([row(121, "501", ["sun", "tue"], "14:00", "15:20")], [course], "theoretical-pattern"), "نظريات التعلم: الأحد·الثلاثاء 14:00–15:20 (2×80) مطابق — لا يُدرج");
  check(!has([row(121, "502", ["tue", "thu"], "08:00", "09:20")], [course], "theoretical-pattern"), "الثلاثاء·الخميس 2×80 مطابق (أيام غير متتالية)");
  check(!has([row(121, "503", ["mon", "wed"], "11:00", "12:20")], [course], "theoretical-pattern"), "الاثنين·الأربعاء 2×80 (المثال الأصلي) ما زال مطابقاً");
  check(!has([row(121, "504", ["sun", "tue", "thu"], "08:00", "08:50")], [course], "theoretical-pattern"), "الأحد·الثلاثاء·الخميس 3×50 مطابق");
  check(!has([row(121, "505", ["sun"], "14:00", "15:20"), row(121, "505", ["tue"], "14:00", "15:20")], [course], "theoretical-pattern"), "اللقاءان في صفّين منفصلين للشعبة نفسها: مطابق");
  check(has([row(121, "506", ["sun", "mon"], "08:00", "09:20")], [course], "theoretical-pattern"), "يومان متتاليان (الأحد·الاثنين) 2×80: لا يطابق");
  check(has([row(121, "507", ["sun", "tue"], "14:00", "15:10")], [course], "theoretical-pattern"), "2×70 دقيقة: لا يطابق");
  check(has([row(121, "508", ["sun"], "14:00", "15:20")], [course], "theoretical-pattern"), "لقاءٌ واحد 80 دقيقة لمقرر 3 ساعات: لا يطابق");
  check(meetingsMatchApprovedPattern([{ day: "fmonday" as DayKey, minutes: 110 }, { day: "fwednesday" as DayKey, minutes: 110 }], 4), "4 ساعات: 110/110 الاثنين·الأربعاء مطابق");
  check(!meetingsMatchApprovedPattern([{ day: "fsunday" as DayKey, minutes: 110 }, { day: "fmonday" as DayKey, minutes: 110 }], 4), "4 ساعات: 110 على يومين متتاليين لا يطابق");
  const finding = review([row(121, "509", ["sun", "mon"], "08:00", "09:20")], [course]).find(f => f.rule === "theoretical-pattern");
  check(Boolean(finding?.detail.includes("أيام غير متتالية")), "نص الملاحظة يذكر أن الأطوال نفسها على أيام غير متتالية مقبولة");
}

console.log("I3 — لا خلط بين الكليات");
{
  const course = theoretical(130, 3);
  /* «501» بنين و«501» بنات شعبتان؛ كلٌّ منهما مطابقة وحدها. */
  const boys = row(130, "501", ["sun", "tue", "thu"], "08:00", "08:50", 1);
  const girls = row(130, "501", ["mon", "wed"], "10:00", "11:20", 2);
  check(!has([boys, girls], [course], "theoretical-pattern"), "شعبة 501 في كليتين لا تُدمج لقاءاتهما في نمطٍ واحد");
  check(!has([boys, girls], [course], "fixed-course-time"), "ولا تُعدّ «وقت شعبة غير ثابت»");
  /* صفّان بلا رقم شعبة: شعبتان، لا شعبةٌ وهمية واحدة. */
  const blankA = row(130, "", ["sun", "tue", "thu"], "08:00", "08:50");
  const blankB = row(130, "", ["mon", "wed"], "12:00", "13:20");
  check(!has([blankA, blankB], [course], "theoretical-pattern") && !has([blankA, blankB], [course], "fixed-course-time"), "صفوف بلا رقم شعبة لا تُجمع في شعبة واحدة");
  const sameHourOtherCollege = [row(130, "501", ["sun", "tue", "thu"], "09:00", "09:50", 1), row(130, "601", ["sun", "tue", "thu"], "09:00", "09:50", 2)];
  check(!has(sameHourOtherCollege, [course], "sections-same-hour"), "م.7/5: شعبتان في كليتين في الساعة نفسها ليستا تكراراً");
  const sameHourSameCollege = [row(130, "501", ["sun", "tue", "thu"], "09:00", "09:50", 1), row(130, "502", ["sun", "tue", "thu"], "09:00", "09:50", 1)];
  check(has(sameHourSameCollege, [course], "sections-same-hour"), "م.7/5: شعبتان في الكلية نفسها في الساعة نفسها ما زالتا تُنبَّه");
}

console.log("I2 — الدرجة معادلةٌ تُقرأ");
{
  const scope = Array.from({ length: 100 }, (_, i) => i + 1);
  const breakdown = approvalScoreBreakdown(scope, [
    { key: "material", label: "تعارض مادّي", tone: "block", rowIds: [1, 2, 3, 4] },
    { key: "pattern", label: "نمط", tone: "regulation", rowIds: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] },
    { key: "outside", label: "كلية أخرى", tone: "regulation", rowIds: [500, 501] },
  ]);
  check(breakdown.total === 100 && breakdown.clean === 81 && breakdown.score === 81, "81 سليماً من 100 = 81");
  check(breakdown.formula.includes("81") && breakdown.formula.includes("100"), `المعادلة مكتوبة: «${breakdown.formula}»`);
  const sum = breakdown.segments.reduce((total, segment) => total + segment.count, 0) + breakdown.clean;
  check(sum === breakdown.total, "شرائح الحلقة + السليم = كل المواعيد (كل موعد مرة واحدة)");
  check(breakdown.segments[0].key === "material", "الشريحة الأولى للتعارض المادي");
  const material = breakdown.segments.find(segment => segment.key === "material")!;
  const pattern = breakdown.segments.find(segment => segment.key === "pattern")!;
  check(material.count === 4 && pattern.count === 15, "الموعد المشترك (4) يُعدّ لأخطر فئة فقط");
  check(material.projected === 84 && pattern.projected === 96, "«لو عالجت هذا»: التعارض ← 84، النمط ← 96 (المشترك لا يُحتسب لأحدهما وحده)");
  check(!breakdown.segments.some(segment => segment.key === "outside"), "بندٌ كل مواعيده خارج الكلية لا يدخل الحلقة");
  check(approvalScoreBreakdown([], []).score === 100, "نطاق فارغ: 100 بلا قسمة على صفر");
}

console.log("I2/I3 — شاشة المراجعة");
{
  const source = fs.readFileSync(path.join(process.cwd(), "src/components/ScheduleReview.tsx"), "utf8");
  check(/const blocking = findings\.filter\(isMaterialFinding\)/.test(source), "«يوجد ما يمنع الاعتماد» يقرأ الموانع المادية وحدها");
  check(source.includes("approvalScoreBreakdown(") && !source.includes("appointmentCoverageScore(spread.clean"), "الدرجة من approvalScoreBreakdown لا من حساب ثانٍ");
  check(source.includes("data-score-fix") && source.includes("عالج"), "لكل بند «عالج» وما تصير إليه الدرجة");
  check(source.includes("الدرجة والموانع لهذه الكلية وحدها"), "الرأس يقول صراحة إن الحساب للكلية المفتوحة");
  check(!/مع \$\{countOf\(\(family\.members/.test(source), "لم يعد الرأس يقول «مع 3 كليات أخرى» بجانب درجةٍ محسوبة عليها");
  check(source.includes("print-review-ring score-tone-"), "الورقة المطبوعة بقيت بتصميمها (الحلقة المطبوعة لم تُمسّ)");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
