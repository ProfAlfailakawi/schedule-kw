/**
 * ── نسبة الإشغال: الرقم في الخانة، والنسبة في طرف اليوم ─────────────────────
 *
 * تقريرٌ جديد في مركز الاستعلامات بلغة خريطة حرارة الأسبوع: كل خانةٍ (يوم ×
 * ساعة) تقول كم محاضرةً فيها، وكل يومٍ يقول نسبة إشغال قاعاته، والضغط على
 * الخانة يفتح محاضراتها. ونوعان: الموقع المفتوح، وعائلة القسم في كل كلياتها.
 *
 * هذا الاختبار يحرس الحساب (utils/occupancyHeat) وأن العدسة موصولة بشاشتها
 * وورقتها وبقاعدة العائلة الوحيدة (departmentFamily).
 */

import fs from "fs";
import path from "path";
import { buildOccupancyHeat, OCCUPANCY_LEVELS } from "../src/utils/occupancyHeat";
import type { FSchedule } from "../src/types";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

let nextId = 1;
const lecture = (days: string[], start: string, end: string, room: string, college = 1): FSchedule => ({
  id: nextId++, fstarttime: start, fendtime: end, AdCollegeId: college, AdSectionId: 1,
  AdRoomCode: room ? room.split("/")[0] : "", AdRoomHall: room ? room.split("/")[1] : "",
  fsunday: days.includes("sun"), fmonday: days.includes("mon"), ftuesday: days.includes("tue"),
  fwednesday: days.includes("wed"), fthursday: days.includes("thu"),
} as unknown as FSchedule);
const roomKey = (row: FSchedule) => {
  const place = [String(row.AdRoomCode || "").trim(), String(row.AdRoomHall || "").trim()].filter(Boolean).join("/");
  return place ? `${Number(row.AdCollegeId)}|${place}` : "";
};

const rows = [
  lecture(["sun", "tue", "thu"], "08:00", "09:15", "1/101"),
  lecture(["sun", "tue", "thu"], "08:00", "09:15", "1/102"),
  lecture(["sun"], "08:30", "09:45", "1/101"), // تتداخل مع الأولى في القاعة نفسها
  lecture(["mon", "wed"], "11:00", "12:15", "1/103"),
  lecture(["mon"], "13:00", "14:15", ""), // بلا قاعة
  lecture(["sun"], "10:00", "09:00", "1/104"), // وقتٌ مقلوب: لا تُعدّ
  lecture([], "08:00", "09:00", "1/105"), // بلا أيام: لا تُعدّ
];
const heat = buildOccupancyHeat(rows, roomKey);
const sunday = heat.days[0];
const eight = sunday.cells[0], nine = sunday.cells[1];

check(heat.hours.length === 12 && heat.hours[0] === 8 * 60 && heat.hours[11] === 19 * 60, "اثنتا عشرة ساعة من الثامنة إلى السابعة مساءً، كخريطة الأسبوع");
check(heat.days.length === 5 && heat.days.map(day => day.label).join(" ") === "الأحد الاثنين الثلاثاء الأربعاء الخميس", "خمسة أيام بأسمائها");
check(heat.lectures === 5, "المحاضرة بوقتٍ مقلوب أو بلا أيام لا تُعدّ");
check(heat.rooms === 3, "قاعات النطاق ما يُدرَّس فيها فعلاً — والمحاضرة بلا قاعة لا تضيف قاعة");
check(eight.count === 3 && nine.count === 3, "الخانة تعدّ كل محاضرةٍ تتقاطع مع ساعتها: ٨:٣٠–٩:٤٥ تقع في الثامنة والتاسعة");
check(eight.rooms === 2 && eight.rate === 67, "القاعة تُعدّ مرةً في الساعة ولو التقت فيها محاضرتان: قاعتان من ثلاث = ٦٧٪");
check(sunday.rate === Math.round((2 + 2) / (3 * 12) * 100), "نسبة اليوم: ساعات القاعات المشغولة من قاعات النطاق × ساعات الدوام");
const monday = heat.days[1];
check(monday.cells[5].count === 1 && monday.cells[5].rooms === 0, "محاضرةٌ بلا قاعة تُعدّ محاضرةً ولا تشغل قاعة");
check(heat.days[4].cells[0].count === 2 && heat.days[2].cells[0].count === 2, "محاضرة الأحد والثلاثاء والخميس تقع في كل أيامها");
check(heat.peak?.day === 0 && heat.peak?.hour === 0 && heat.peak?.count === 3, "الذروة أول خانةٍ بأكبر عدد");
check(eight.level === OCCUPANCY_LEVELS && monday.cells[3].level >= 1 && heat.days[0].cells[11].level === 0,
  "درجة اللون من الفارغة (0) إلى الذروة (5)");
const week = heat.days.reduce((sum, day) => sum + day.cells.reduce((total, cell) => total + cell.rooms, 0), 0);
check(heat.rate === Math.round(week / (3 * 12 * 5) * 100), "ونسبة الأسبوع من ساعات قاعاته كلها");
check(eight.rows.length === 3 && eight.rows.every(row => rows.includes(row)), "والخانة تحمل محاضراتها لتُفتح عند الضغط");

/* قاعتان بالرقم نفسه في موقعين قاعتان، لا قاعة واحدة. */
const family = buildOccupancyHeat([lecture(["sun"], "08:00", "09:00", "1/101", 1), lecture(["sun"], "08:00", "09:00", "1/101", 2)], roomKey);
check(family.rooms === 2 && family.days[0].cells[0].rooms === 2 && family.rate > 0, "«1/101» في البنين غير «1/101» في البنات");
check(buildOccupancyHeat([], roomKey).lectures === 0 && buildOccupancyHeat([], roomKey).peak === null && buildOccupancyHeat([], roomKey).rate === 0,
  "والنطاق الفارغ أصفارٌ صادقة بلا قسمةٍ على صفر");

/* ── العدسة موصولة بشاشتها وورقتها وعائلتها ─────────────────────────────── */
const reports = fs.readFileSync(path.join(process.cwd(), "src/components/Reports.tsx"), "utf8");
const grid = fs.readFileSync(path.join(process.cwd(), "src/components/OccupancyHeatGrid.tsx"), "utf8");
const printCss = fs.readFileSync(path.join(process.cwd(), "src/styles/08-print.css"), "utf8");
check(/\{ id: "occupancy", label: "نسبة الإشغال"/.test(reports), "عدسة «نسبة الإشغال» في مركز الاستعلامات");
check(reports.includes("departmentFamily(sections, filters.collegeId, filters.sectionId)"), "والعائلة من قاعدتها الوحيدة (departmentFamily)، لا من قاعدةٍ جديدة");
check(reports.includes("/api/schedules?termId=${termId}&collegeId=${collegeId}&sectionId=${sectionId}") && reports.includes("البيانات جزئية: تعذرت قراءة {familyRead.denied.join"),
  "وكل كليةٍ تُقرأ بصلاحية الحساب، وما رُدّ منها يُقال");
check(reports.includes('if (kind === "occupancy")') && reports.includes('className="print-occupancy-table print-occupancy-heat"'), "ولها ورقة بيد شبكة إشغال القاعات");
check(grid.includes("onPick") && reports.includes("setOccupancyPick") && reports.includes('aria-label={`محاضرات ${day.label}`}'), "والضغط على الخانة يفتح محاضراتها");
check(/\.print-report \.print-occupancy-table tbody tr:nth-child\(n\) td\.print-heat-5\{background:#2b7666 !important\}/.test(printCss),
  "ودرجة الشبكة لا يمحوها تخطيط الصفوف على الورقة");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
