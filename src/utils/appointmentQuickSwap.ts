/**
 * ── التبديل السريع داخل الموعد ──────────────────────────────────────────────
 * المالك يريد تقليل المدرّبين والشواغر: بعد اختيار المقرر والأستاذ الحقيقي تظهر شعبُ المقرر نفسه
 * التي عند مدرّبٍ أو على «هيئة تدريسية» (شاغر)، فتنتقل إلى هذا الأستاذ بنقرةٍ واحدة:
 *   • «بوقتها»: الشعبةُ تبقى في وقتها وقاعتها ويتبدّل صاحبُها فقط.
 *   • «بوقتي»: الشعبةُ تأخذ أيامَ الموعد الذي يُبنى الآن ووقتَه (وقاعتَه إن اختيرت) فيحلّ محلّ موعدٍ جديد.
 * دالّةٌ نقيّةٌ للعرض والحكم المسبق فقط؛ الحفظُ يمرّ بمسار التعديل (PUT) نفسه بتراجع، ولا موافقةَ تُطلب من الأستاذ.
 * التعارضُ يُنبَّه ولا يُخفي الخيار (الخادمُ هو الحَكَم عند الحفظ).
 */
import type { FSchedule } from "../types";
import { findConflicts } from "./scheduleIntelligence";

export const QUICK_SWAP_DAY_KEYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;

export interface QuickSwapMine {
  days: string[];
  start: string;
  end: string;
  room?: { AdRoomCode: string; AdRoomHall: string; buildingId?: unknown; roomId?: unknown; locationStatus?: unknown } | null;
}

export interface QuickSwapSource {
  rowId: number;
  kind: "trainee" | "vacant";
  row: FSchedule;
  /** وقتُها هو وقتُ الموعد الذي يُبنى (فلا فرقَ بين الخيارين). */
  sameTime: boolean;
  /** الأستاذ حرٌّ في وقتها الحالي. */
  freeAtIts: boolean;
  /** الأستاذ حرٌّ في وقت الموعد الجاري بناؤه (null: لا وقتَ مكتملاً بعد). */
  freeAtMine: boolean | null;
}

export function quickSwapMine(form: any): QuickSwapMine | null {
  const days = QUICK_SWAP_DAY_KEYS.filter(key => Boolean(form?.[key])) as string[];
  const start = String(form?.fstarttime || ""), end = String(form?.fendtime || "");
  if (!days.length || !start || !end) return null;
  const code = String(form?.AdRoomCode || ""), hall = String(form?.AdRoomHall || "");
  return { days, start, end, room: code && hall ? { AdRoomCode: code, AdRoomHall: hall, buildingId: form?.buildingId, roomId: form?.roomId, locationStatus: form?.locationStatus } : null };
}

/** صفُّ الشعبة بعد التبديل: «بوقتها» تغيّر الأستاذ وحده، و«بوقتي» تُضيف أيامَ الموعد ووقتَه وقاعتَه. */
export function quickSwapAfter(row: FSchedule, teacherId: number, mode: "its" | "mine", mine: QuickSwapMine | null): FSchedule {
  const next: any = { ...row, AdInstructorId: teacherId };
  if (mode === "mine" && mine) {
    for (const key of QUICK_SWAP_DAY_KEYS) next[key] = mine.days.includes(key);
    next.fstarttime = mine.start; next.fendtime = mine.end;
    if (mine.room) Object.assign(next, mine.room);
  }
  return next as FSchedule;
}

export function quickSwapSources(opts: {
  rows: FSchedule[];
  teacherId: number;
  courseId: number;
  termId: number;
  editId?: number | null;
  traineeIds: ReadonlySet<number>;
  placeholderIds: ReadonlySet<number>;
  mine: QuickSwapMine | null;
}): QuickSwapSource[] {
  const { rows, teacherId, courseId, termId, editId, traineeIds, placeholderIds, mine } = opts;
  if (!teacherId || placeholderIds.has(teacherId) || traineeIds.has(teacherId) || !courseId) return [];
  const clashes = (candidate: FSchedule) => findConflicts([candidate], rows.filter(row => Number(row.id) !== Number(candidate.id)), { placeholderInstructorIds: placeholderIds })
    .some(issue => issue.type === "instructor");
  const out: QuickSwapSource[] = [];
  for (const row of rows) {
    if (Number(row.AdTermId) !== termId || Number(row.AdCourseId) !== courseId || Number(row.id) === Number(editId || 0)) continue;
    const owner = Number(row.AdInstructorId);
    const kind = placeholderIds.has(owner) ? "vacant" : traineeIds.has(owner) ? "trainee" : null;
    if (!kind) continue;
    const sameTime = !mine || (String(row.fstarttime) === mine.start && String(row.fendtime) === mine.end && QUICK_SWAP_DAY_KEYS.every(key => Boolean((row as any)[key]) === mine.days.includes(key)));
    out.push({
      rowId: Number(row.id), kind, row, sameTime,
      freeAtIts: !clashes(quickSwapAfter(row, teacherId, "its", mine)),
      freeAtMine: mine ? !clashes(quickSwapAfter(row, teacherId, "mine", mine)) : null,
    });
  }
  return out.sort((a, b) => Number(b.freeAtIts) - Number(a.freeAtIts) || Number(b.sameTime) - Number(a.sameTime) || Number(a.row.id) - Number(b.row.id));
}
