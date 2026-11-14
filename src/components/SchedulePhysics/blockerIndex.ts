import type { FSchedule } from "../../types";

/**
 * ── فهرس الانشغال: من يمكن أن يعارض هذا الموعد؟ ───────────────────────────────
 *
 * حقلُ السحب في عرض القاعات يسأل «هل تتعارض هذه الخانة؟» عن (أيام × فتحات × قاعات) خانة، وكل سؤالٍ كان يمسح
 * كلَّ الصفوف. لكن لا يعارض الموعدَ إلا صفٌّ يشاركه الأستاذ أو القاعة؛ فيُبنى فهرسان مرةً لكل تغيّرٍ في الصفوف
 * (أستاذ ← صفوفه، قاعة ← صفوفها)، ويمسح السؤالُ عشرةَ صفوفٍ لا ألفاً. الحكم نفسه حرفاً بحرف (يختبره
 * tests/schedule-blocker-index-audit.ts على بياناتٍ عشوائية مقابل المسح الكامل القديم).
 */
const DAY_KEYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;

export interface PreparedBusyRow { row: FSchedule; order: number; from: number; to: number; mask: number; roomKey: string }
export interface BusyIndex {
  prepared: PreparedBusyRow[];
  byInstructor: Map<number, PreparedBusyRow[]>;
  byRoom: Map<string, PreparedBusyRow[]>;
}
export type BusyBlocker = { type: "instructor" | "room"; severity: "high"; message: string; detail: string };

export const dayMaskOf = (row: Partial<FSchedule>) => DAY_KEYS.reduce((mask, key, bit) => ((row as any)[key] ? mask | (1 << bit) : mask), 0);

/** `roomKeyOf` يعيد مفتاح القاعة الصالح أو "" إن لم يكن للصف قاعةٌ معروفة (يحمل منطق sameRoom). */
export function buildBusyIndex(rows: readonly FSchedule[], roomKeyOf: (row: FSchedule) => string, minutes: (clock: string) => number): BusyIndex {
  const prepared = rows.map((row, order) => ({ row, order, from: minutes(row.fstarttime), to: minutes(row.fendtime), mask: dayMaskOf(row), roomKey: roomKeyOf(row) }));
  const byInstructor = new Map<number, PreparedBusyRow[]>();
  const byRoom = new Map<string, PreparedBusyRow[]>();
  for (const item of prepared) {
    const instructor = Number(item.row.AdInstructorId || 0);
    if (instructor) (byInstructor.get(instructor) || byInstructor.set(instructor, []).get(instructor)!).push(item);
    if (item.roomKey) (byRoom.get(item.roomKey) || byRoom.set(item.roomKey, []).get(item.roomKey)!).push(item);
  }
  return { prepared, byInstructor, byRoom };
}

export function indexedBlockers(
  index: BusyIndex,
  source: FSchedule,
  probe: FSchedule,
  probeRoomKey: string,
  minutes: (clock: string) => number,
  detailOf: (other: FSchedule) => string,
): BusyBlocker[] {
  const probeMask = dayMaskOf(probe);
  const probeFrom = minutes(probe.fstarttime), probeTo = minutes(probe.fendtime);
  const instructor = Number(probe.AdInstructorId || 0);
  const sharedInstructor = instructor ? index.byInstructor.get(instructor) || [] : [];
  const sharedRoom = probeRoomKey ? index.byRoom.get(probeRoomKey) || [] : [];
  // اتحادُ القائمتين بترتيب الصفوف الأصلي (الترتيب هو ما يقرؤه المستخدم أولاً).
  const merged = sharedInstructor.length && sharedRoom.length
    ? [...new Map([...sharedInstructor, ...sharedRoom].map(item => [item.order, item] as const)).values()].sort((a, b) => a.order - b.order)
    : sharedInstructor.length ? sharedInstructor : sharedRoom;
  const blockers: BusyBlocker[] = [];
  for (const item of merged) {
    const other = item.row;
    if (other.id === source.id || other.AdTermId !== probe.AdTermId) continue;
    if (!(probeMask & item.mask) || !(probeFrom < item.to && item.from < probeTo)) continue;
    const sameRoomKey = Boolean(probeRoomKey) && item.roomKey === probeRoomKey;
    // التدريس المشترك (شعبتان للمقرر نفسه بأستاذٍ وقاعةٍ ووقتٍ واحد) ليس تعارضاً.
    if (probe.AdCourseId === other.AdCourseId && String(probe.SCode) !== String(other.SCode) && instructor && probe.AdInstructorId === other.AdInstructorId
      && sameRoomKey && probe.fstarttime === other.fstarttime && probe.fendtime === other.fendtime && probeMask === item.mask) continue;
    const detail = detailOf(other);
    if (instructor && probe.AdInstructorId === other.AdInstructorId) blockers.push({ type: "instructor", severity: "high", message: "الأستاذ مرتبط بموعد آخر", detail });
    if (sameRoomKey) blockers.push({ type: "room", severity: "high", message: "القاعة محجوزة في هذا الوقت", detail });
  }
  return blockers;
}
