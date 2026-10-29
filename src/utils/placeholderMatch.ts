/**
 * ── شعبة «هيئة تدريسية» تطابق الموعد المطلوب تطابقاً تاماً ───────────────────
 *
 * حين يبحث المنسّق عن وقتٍ أو قاعةٍ لأستاذٍ حقيقي، فالشعبة التي تحجز خانةً باسم
 * «هيئة تدريسية» قد تكون هي الجواب: يأخذ الأستاذ موعدها، أو تُنقل هي، أو تُحذف.
 * لكنها لا تُعرض إلا حين تطابق 100%:
 *   • النمط: أيامها ومدتها نمطٌ معتمد لساعات المقرر المطلوب (patternsForHours)،
 *     وتطابق ما ثبّته البحث (الأيام، والوقت أو المدة).
 *   • السعة: لا تقلّ سعة قاعتها عن سعة المقرر حين تُعرف الاثنتان؛ وإن جُهلت
 *     إحداهما قيل «غير محددة» — لا رقمَ مفترضاً.
 *   • المرفق: نوع القاعة وطبيعتها يلائمان المقرر، ومرفقه المرافق محجوزٌ معها.
 *   • الأستاذ: حرٌّ في أيامها ووقتها.
 * الحكم الأخير يبقى للفحص الجافّ في /api/schedules/placeholder-action.
 */
import { regulationChoiceFor, regulationHours, type RegulationCourse } from "./appointmentRegulation";
import { DAY_KEYS, type DayKey } from "./scheduleRegulations";

export interface PlaceholderCourse extends RegulationCourse {
  CourseRoomType?: unknown;
  MaxStudent?: unknown;
  CourseCompanionRoomType?: unknown;
}

export interface PlaceholderRowLike {
  fsunday?: unknown; fmonday?: unknown; ftuesday?: unknown; fwednesday?: unknown; fthursday?: unknown;
  fstarttime?: unknown;
  fendtime?: unknown;
  companionRoomId?: unknown;
}

export interface PlaceholderWanted {
  /** الأيام التي ثبّتها البحث. */
  days?: readonly DayKey[];
  /** «اقترح قاعة»: الوقت محسوم. */
  start?: number;
  end?: number;
  /** «اقترح وقتاً وقاعة»: المدة محسومة والوقت سؤال. */
  minutes?: number;
}

export type PlaceholderCapacity = "ok" | "unknown";

export interface PlaceholderMatch {
  ok: boolean;
  /** سببُ الرفض بكلمة (للاختبار والتلميح). */
  why?: "pattern" | "days" | "time" | "capacity" | "facility" | "companion" | "teacher";
  capacity: PlaceholderCapacity;
  /** «أحد·ثلاثاء·خميس · 50د» حين يُعرف النمط. */
  pattern?: string;
  days: DayKey[];
}

const toMinutes = (value: unknown) => {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
};

export function placeholderMatch(input: {
  course: PlaceholderCourse | null | undefined;
  row: PlaceholderRowLike;
  room?: { roomType?: unknown; capacity?: unknown } | null;
  wanted?: PlaceholderWanted;
  teacherBusy?: (days: readonly DayKey[], start: number, end: number) => boolean;
}): PlaceholderMatch {
  const { course, row, room, wanted = {} } = input;
  const days = DAY_KEYS.filter(day => Boolean((row as any)[day]));
  const start = toMinutes(row.fstarttime), end = toMinutes(row.fendtime);
  const seats = Number(course?.MaxStudent || 0), capacity = Number(room?.capacity || 0);
  const capacityState: PlaceholderCapacity = seats > 0 && capacity > 0 ? "ok" : "unknown";
  const fail = (why: PlaceholderMatch["why"]): PlaceholderMatch => ({ ok: false, why, capacity: capacityState, days });
  if (!days.length || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return fail("time");

  /* النمط: من مكتبة الأنماط وحدها؛ ومقررٌ بلا ساعات لا يُقال عنه «تطابق تام» إلا بالوقت نفسه. */
  let pattern: string | undefined;
  if (regulationHours(course)) {
    const choice = regulationChoiceFor(course, days);
    if (!choice || choice.minutes !== end - start) return fail("pattern");
    pattern = choice.label;
  } else if (!(Number.isFinite(wanted.start) && Number.isFinite(wanted.end))) return fail("pattern");

  if (wanted.days?.length && (wanted.days.length !== days.length || !wanted.days.every(day => days.includes(day)))) return fail("days");
  if (Number.isFinite(wanted.start) && Number.isFinite(wanted.end) && (wanted.start !== start || wanted.end !== end)) return fail("time");
  if (Number(wanted.minutes) > 0 && wanted.minutes !== end - start) return fail("time");

  if (seats > 0 && capacity > 0 && capacity < seats) return fail("capacity");
  const expected = String(course?.CourseRoomType || "").trim(), actual = String(room?.roomType || "").trim();
  if (expected && actual && expected !== actual) return fail("facility");
  const mode = String(course?.CourseTeachingMode || "");
  const modeMismatch = mode === "theoretical" ? /مختبر|عملي|تطبيقي/.test(actual)
    : /^(applied|practical|field_training)$/.test(mode) && /تدريس|محاضرة|نظر/.test(actual);
  if (modeMismatch) return fail("facility");
  if (String(course?.CourseCompanionRoomType || "").trim() && !String(row.companionRoomId || "").trim()) return fail("companion");
  if (input.teacherBusy?.(days, start, end)) return fail("teacher");
  return { ok: true, capacity: capacityState, pattern, days };
}
