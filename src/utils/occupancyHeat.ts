/**
 * ── نسبة الإشغال: الأسبوع يوماً يوماً وساعةً ساعة ─────────────────────────────
 *
 * خريطة حرارة الأسبوع فوق «مواعيد القسم» تقول بلونها أين الزحام، ولا تقول
 * كم. وسؤال من يوزّع القاعات رقمٌ لا لون: كم محاضرةً تقع الأحد في العاشرة؟
 * وكم من قاعات القسم تبقى فارغة يوم الخميس؟
 *
 * فكل خانةٍ هنا تحمل عدد المحاضرات التي تشغل تلك الساعة من ذلك اليوم، وكل يومٍ
 * يحمل في طرفه نسبة إشغال قاعاته: ساعات القاعات المشغولة فيه من كل ساعات
 * القاعات المتاحة (قاعات النطاق × ساعات الدوام). القاعة تُعدّ مرةً واحدة في
 * الساعة ولو التقت فيها محاضرتان، والمحاضرة بلا قاعة تُعدّ محاضرةً ولا تشغل
 * قاعة. والساعة تُحسب كما تحسبها خريطة الأسبوع وشبكة القاعات: كل محاضرةٍ
 * تتقاطع معها، فمحاضرةٌ من ٩:٣٠ إلى ١٠:٤٥ تقع في التاسعة والعاشرة معاً.
 */
import type { FSchedule } from "../types";
import { normalizeClock, SCHEDULE_DAY_END, SCHEDULE_DAY_START } from "./scheduleTime";

export const OCCUPANCY_DAYS = [
  { flag: "fsunday", label: "الأحد" },
  { flag: "fmonday", label: "الاثنين" },
  { flag: "ftuesday", label: "الثلاثاء" },
  { flag: "fwednesday", label: "الأربعاء" },
  { flag: "fthursday", label: "الخميس" },
] as const;

/** درجات اللون من الفارغة (0) إلى الذروة (5)، كدرجات شبكة القاعات. */
export const OCCUPANCY_LEVELS = 5;

export interface OccupancyCell {
  /** بداية الساعة بالدقائق من منتصف الليل. */
  hour: number;
  /** المحاضرات التي تشغل هذه الساعة من هذا اليوم. */
  count: number;
  /** القاعات المختلفة المشغولة فيها. */
  rooms: number;
  /** القاعات المشغولة من قاعات النطاق، بالمئة. */
  rate: number;
  level: number;
  rows: FSchedule[];
}

export interface OccupancyDay {
  index: number;
  label: string;
  cells: OccupancyCell[];
  /** المحاضرات التي تقع في هذا اليوم. */
  lectures: number;
  /** نسبة إشغال القاعات في اليوم كله، بالمئة. */
  rate: number;
}

export interface OccupancyHeat {
  hours: number[];
  days: OccupancyDay[];
  /** قاعات النطاق: كل قاعةٍ تدرّس فيها محاضرةٌ منه في الأسبوع. */
  rooms: number;
  /** المحاضرات ذات الوقت واليوم. */
  lectures: number;
  /** نسبة إشغال الأسبوع كله، بالمئة. */
  rate: number;
  max: number;
  peak: { day: number; hour: number; count: number } | null;
}

const minutesOf = (value: unknown) => {
  const [h, m] = normalizeClock(value).split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : NaN;
};

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/**
 * يبني الشبكة من صفوف النطاق. `roomKeyOf` يعيد مفتاح القاعة (فارغاً لمحاضرةٍ
 * بلا قاعة)، ويجب أن يميّز قاعتين تحملان الرقم نفسه في موقعين.
 */
export function buildOccupancyHeat(rows: readonly FSchedule[], roomKeyOf: (row: FSchedule) => string): OccupancyHeat {
  const hours: number[] = [];
  for (let point = SCHEDULE_DAY_START; point < SCHEDULE_DAY_END; point += 60) hours.push(point);

  const timed = rows.filter(row => {
    const start = minutesOf(row.fstarttime), end = minutesOf(row.fendtime);
    return end > start && OCCUPANCY_DAYS.some(day => Boolean((row as any)[day.flag]));
  });
  const rooms = new Set(timed.map(roomKeyOf).filter(Boolean)).size;

  const days: OccupancyDay[] = OCCUPANCY_DAYS.map((day, index) => {
    const ofDay = timed.filter(row => Boolean((row as any)[day.flag]));
    const cells = hours.map(hour => {
      const inSlot = ofDay.filter(row => minutesOf(row.fstarttime) < hour + 60 && minutesOf(row.fendtime) > hour);
      const busy = new Set(inSlot.map(roomKeyOf).filter(Boolean)).size;
      return { hour, count: inSlot.length, rooms: busy, rate: percent(busy, rooms), level: 0, rows: inSlot };
    });
    const busyHours = cells.reduce((total, cell) => total + cell.rooms, 0);
    return { index, label: day.label, cells, lectures: ofDay.length, rate: percent(busyHours, rooms * hours.length) };
  });

  const max = Math.max(0, ...days.flatMap(day => day.cells.map(cell => cell.count)));
  let peak: OccupancyHeat["peak"] = null;
  days.forEach(day => day.cells.forEach((cell, hourIndex) => {
    cell.level = cell.count ? Math.max(1, Math.ceil((cell.count / Math.max(1, max)) * OCCUPANCY_LEVELS)) : 0;
    if (cell.count && (!peak || cell.count > peak.count)) peak = { day: day.index, hour: hourIndex, count: cell.count };
  }));
  const busyWeek = days.reduce((total, day) => total + day.cells.reduce((sum, cell) => sum + cell.rooms, 0), 0);

  return {
    hours,
    days,
    rooms,
    lectures: timed.length,
    rate: percent(busyWeek, rooms * hours.length * OCCUPANCY_DAYS.length),
    max,
    peak,
  };
}
