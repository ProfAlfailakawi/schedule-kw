/**
 * ── «لاصق بمحاضرتي»: الموعد لا يُلصق بنفسه (المالك 2026-10-30) ─────────────────────
 *
 *  S1  بلا خادم: مرساةٌ مستبعدة (skipAnchor) لا تُعطي «قبلها/بعدها»، وتبقى عائقاً لا يُوضع فوقه موعد.
 *  S2  ساكن: الشرائح تستبعد صفوف مقرر الموعد وشعبته — في المسوّدة وفي الأصل قبل التعديل — ومحرّرُ
 *      «موعد جديد» يمرّر الأصل في التعديل.
 *  S3  ساكن: شعبةٌ أخرى من المقرر نفسه تُسمّى برقمها فلا تُحسب الموعدَ ذاته.
 */
import fs from "node:fs";
import type { FSchedule } from "../src/types";
import { lectureStickOptions, teacherLectures } from "../src/utils/teacherMiniWeek";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed += 1; console.log(`✓ ${label}`); }
  else { failed += 1; console.log(`✗ ${label}`); }
};

const row = (id: number, course: number, scode: string, day: string, start: string, end: string) => ({
  id, AdInstructorId: 7, AdTermId: 1, AdCollegeId: 1, AdSectionId: 1, AdCourseId: course, SCode: scode,
  fsunday: false, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false, [day]: true,
  fstarttime: start, fendtime: end,
} as unknown as FSchedule);

/* المواطنة الرقمية (101 · 01) صفّان: الاثنين كتلة، والأربعاء كتلة — يُعدَّل صفُّ الأربعاء. */
const citizenshipMon = row(1, 101, "01", "fmonday", "13:55", "16:45");
const otherCourse = row(2, 202, "01", "ftuesday", "11:00", "12:15");
const otherSection = row(3, 101, "02", "fthursday", "08:00", "10:50");
const rows = [citizenshipMon, otherCourse, otherSection];
const lectures = teacherLectures(rows, 7, 1, 99, 1);
const window = { start: 8 * 60, end: 20 * 60 };
const own = new Set(["101|01"]);
const keyOf = (r: Partial<FSchedule>) => `${Number(r.AdCourseId)}|${String(r.SCode ?? "").trim()}`;

const plain = lectureStickOptions(lectures, rows, null, window, { minutes: 170 });
const guarded = lectureStickOptions(lectures, rows, null, window, { minutes: 170, skipAnchor: item => own.has(keyOf(item.row)) });
check(plain.some(option => option.lecture.id === 1), "S1 بلا استبعاد: «قبل/بعد المواطنة الرقمية» يظهران (الخلل)");
check(!guarded.some(option => option.lecture.id === 1), "S1 مع الاستبعاد: لا «قبل/بعد» لمقرر الموعد وشعبته");
check(guarded.some(option => option.lecture.id === 2) && guarded.some(option => option.lecture.id === 3), "S1 والمحاضرات الأخرى (مقرر آخر، شعبة أخرى) باقية");
const monday = guarded.filter(option => option.spot.days.includes("fmonday"));
check(monday.every(option => option.spot.end <= 13 * 60 + 55 || option.spot.start >= 16 * 60 + 45),
  "S1 والصفُّ المستبعد يبقى عائقاً: لا موضع يقع فوق محاضرة الاثنين");

const chips = fs.readFileSync("src/components/LectureStickChips.tsx", "utf8");
const editor = fs.readFileSync("src/components/Schedules.tsx", "utf8");
check(/skipAnchor: item => own\.has\(sectionKey\(item\.row\)\)/.test(chips) && /\[sectionKey\(draft\), sectionKey\(original\)\]/.test(chips), "S2 الشرائح تستبعد مقرر الموعد وشعبته في المسوّدة والأصل");
check(/original=\{editor === "edit" \? editorOriginalRow : null\}/.test(editor), "S2 «موعد جديد» يمرّر الأصل في التعديل");
check(/شعبة \$\{String\(lecture\.row\.SCode\)\.trim\(\)\}/.test(chips) && /sameCourse/.test(chips), "S3 شعبةٌ أخرى من المقرر نفسه تُسمّى برقمها");

console.log(`\nLecture stick own-section audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
