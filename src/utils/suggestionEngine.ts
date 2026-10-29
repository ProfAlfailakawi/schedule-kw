/**
 * ── محرّك الاقتراح الواحد ───────────────────────────────────────────────────
 *
 * «اقترح قاعة متاحة» و«اقترح لي وقتاً وقاعة» و«اقترح بديلاً آمناً» في المحرر
 * الكامل، والزرّان في «موعد جديد» السريع — كلها تسأل هذا المحرك عبر
 * /api/schedules/suggest-slots. هنا الجزء الخالص (بلا قراءة قاعدة بيانات):
 * يمشي كل خانة × كل قاعة، يُسقط ما يصطدم، ويرتّب الباقي بثلاث تكاليف (فراغ
 * الأستاذ، المشي بين المباني، تشتّت يوم الطلبة)، ويعدّ سبب كل رفض — فإذا لم
 * يبقَ خيار قيل السبب بأيقونة وكلمة بدل صمتٍ يبدو عطلاً.
 */
import { AR, countOf } from "./arabicCount";

export type SuggestionDayKey = "fsunday" | "fmonday" | "ftuesday" | "fwednesday" | "fthursday";

/** لماذا لم يبقَ اقتراح — كلمة واحدة وأيقونة في الواجهة. */
export type SuggestionEmptyReason =
  | "halls"     // لا قاعات رسمية للقسم
  | "teacher"   // الأستاذ مشغول في هذا الوقت
  | "rooms"     // كل القاعات محجوزة
  | "travel"    // لا وقت للانتقال بين المباني
  | "facility"  // لا مرفق مرافق متاح
  | "borrow"    // خارج نافذة الاستعارة
  | "hours"     // يتجاوز ساعات المقرر
  | "conflict"  // رفضها فحص الحفظ
  | "days";     // لم تُختر أيام

export interface SuggestionHall { room: string; hall: string; buildingId: string; roomId: string }

export type SuggestionRow = Partial<Record<SuggestionDayKey, unknown>> & {
  id?: unknown;
  AdInstructorId?: unknown;
  AdRoomCode?: unknown;
  fstarttime?: unknown;
  fendtime?: unknown;
};

export interface SuggestionCandidate {
  start: string;
  end: string;
  room: string;
  hall: string;
  buildingId: string;
  roomId: string;
  days: SuggestionDayKey[];
  score: number;
  idleMinutes: number;
  walkMinutes: number;
  reasons: string[];
  companionRoomId?: string;
  companionRoomLabel?: string;
}

export interface RankInput {
  dayKeys: SuggestionDayKey[];
  starts: number[];
  duration: number;
  halls: SuggestionHall[];
  /** صفوف القاعة المحجوزة فعلاً (كل الكليات — القاعة مكان واحد). */
  hallRows: (hall: SuggestionHall) => SuggestionRow[];
  /** صفوف الأستاذ (فارغة لـ«هيئة تدريسية» أو بلا أستاذ). */
  instructorRows: SuggestionRow[];
  /** صفوف القسم نفسه (لتشتّت يوم الطلبة). */
  sectionRows: SuggestionRow[];
  travelMinutes: (fromBuilding: unknown, toBuilding: unknown) => number;
  /** القاعة مستعارة ويجب أن تغطيها نافذة الاستعارة. */
  borrowBlocked?: (hall: SuggestionHall, day: SuggestionDayKey, from: number, to: number) => boolean;
  /** ملاءمة القاعة للمقرر (نوع/سعة): تعديل على الدرجة وأسباب. */
  suitability?: (hall: SuggestionHall) => { adjustment: number; reasons: string[] };
  /** المرفق المرافق المتاح طوال الموعد (إن كان المقرر يتطلبه): null = لا مرفق → يُرفض. */
  companion?: (hall: SuggestionHall, from: number, to: number) => { id: string; label: string } | null;
}

export interface RankStats {
  considered: number;
  hallBusy: number;
  teacherBusy: number;
  travel: number;
  borrow: number;
  facility: number;
}

export const toMinutes = (value: unknown) => {
  const [h, m] = String(value || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
export const toClock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

const busyOn = (rows: SuggestionRow[], day: SuggestionDayKey, from: number, to: number) =>
  rows.some(row => Boolean(row[day]) && toMinutes(row.fstarttime) < to && toMinutes(row.fendtime) > from);

export function rankSuggestionCandidates(input: RankInput): { candidates: SuggestionCandidate[]; stats: RankStats } {
  const stats: RankStats = { considered: 0, hallBusy: 0, teacherBusy: 0, travel: 0, borrow: 0, facility: 0 };
  const candidates: SuggestionCandidate[] = [];
  const { dayKeys } = input;
  if (!dayKeys.length) return { candidates, stats };
  const perDay = dayKeys.length;
  for (const start of input.starts) {
    const end = start + input.duration;
    /* الأستاذ مشغول في هذه الخانة: لا حاجة لتجريب كل قاعة. */
    if (dayKeys.some(day => busyOn(input.instructorRows, day, start, end))) {
      stats.teacherBusy += input.halls.length;
      stats.considered += input.halls.length;
      continue;
    }
    for (const hall of input.halls) {
      stats.considered++;
      if (input.borrowBlocked && dayKeys.some(day => input.borrowBlocked!(hall, day, start, end))) { stats.borrow++; continue; }
      const occupied = input.hallRows(hall);
      if (dayKeys.some(day => busyOn(occupied, day, start, end))) { stats.hallBusy++; continue; }
      let idle = 0, walk = 0, spread = 0, travelBlocked = false;
      for (const day of dayKeys) {
        const dayOfInstructor = input.instructorRows
          .filter(row => Boolean(row[day]))
          .sort((a, b) => toMinutes(a.fstarttime) - toMinutes(b.fstarttime));
        const before = [...dayOfInstructor].reverse().find(row => toMinutes(row.fendtime) <= start);
        const after = dayOfInstructor.find(row => toMinutes(row.fstarttime) >= end);
        if (before) idle += Math.max(0, start - toMinutes(before.fendtime));
        if (after) idle += Math.max(0, toMinutes(after.fstarttime) - end);
        if (!before && !after && dayOfInstructor.length === 0 && input.instructorRows.length) idle += 90;
        if (before) {
          const need = input.travelMinutes(before.AdRoomCode, hall.room);
          if (start - toMinutes(before.fendtime) < need) { travelBlocked = true; break; }
          walk += need;
        }
        if (after) {
          const need = input.travelMinutes(hall.room, after.AdRoomCode);
          if (toMinutes(after.fstarttime) - end < need) { travelBlocked = true; break; }
          walk += need;
        }
        const dayOfSection = input.sectionRows.filter(row => Boolean(row[day]));
        if (dayOfSection.length) {
          const from = Math.min(...dayOfSection.map(row => toMinutes(row.fstarttime)));
          const to = Math.max(...dayOfSection.map(row => toMinutes(row.fendtime)));
          spread += Math.max(0, from - start) + Math.max(0, end - to);
        }
      }
      if (travelBlocked) { stats.travel++; continue; }
      let companion: { id: string; label: string } | null | undefined;
      if (input.companion) {
        companion = input.companion(hall, start, end);
        if (!companion) { stats.facility++; continue; }
      }
      const reasons: string[] = [];
      if (idle === 0) reasons.push("لا يترك فراغاً للأستاذ");
      else reasons.push(`فراغ ${countOf(Math.round(idle / perDay), AR.minute)}`);
      if (walk === 0) reasons.push("بلا انتقال بين المباني");
      else reasons.push(`انتقال ${countOf(Math.round(walk / perDay), AR.minute)}`);
      if (spread === 0) reasons.push("داخل يوم القسم الحالي");
      const fit = input.suitability ? input.suitability(hall) : { adjustment: 0, reasons: [] };
      const base = Math.round(Math.max(0, 100 - (idle / perDay) / 3 - (walk / perDay) / 2 - (spread / perDay) / 6));
      candidates.push({
        start: toClock(start), end: toClock(end),
        room: hall.room, hall: hall.hall, buildingId: hall.buildingId, roomId: hall.roomId,
        days: [...dayKeys],
        score: Math.max(0, Math.min(100, base + fit.adjustment)),
        idleMinutes: Math.round(idle / perDay),
        walkMinutes: Math.round(walk / perDay),
        reasons: [...fit.reasons, ...reasons].slice(0, 3),
        ...(companion ? { companionRoomId: companion.id, companionRoomLabel: companion.label } : {}),
      });
    }
  }
  return { candidates, stats };
}

/**
 * الترتيب النهائي: الأعلى درجة أولاً. في «وقت وقاعة» خانةٌ واحدة لكل وقت
 * (ثلاثة خيارات تختلف بالقاعة وحدها ليست اختياراً). لا قصّ هنا: البوابة
 * تمشي القائمة كلها حتى تجمع ما يكفي، فلا يضيع خيارٌ صالح لأن الأوائل رُفضوا.
 */
export function orderSuggestionCandidates(candidates: SuggestionCandidate[], roomOnly: boolean): SuggestionCandidate[] {
  const seen = new Set<string>();
  return [...candidates]
    .sort((a, b) => b.score - a.score || a.start.localeCompare(b.start) || a.room.localeCompare(b.room) || a.hall.localeCompare(b.hall))
    .filter(slot => { if (roomOnly) return true; if (seen.has(slot.start)) return false; seen.add(slot.start); return true; });
}

/** السبب الأوضح حين لا يبقى خيار. */
export function emptySuggestionReason(stats: RankStats & { gate?: number }): SuggestionEmptyReason {
  if (!stats.considered) return "rooms";
  if (stats.teacherBusy >= stats.considered) return "teacher";
  const tally: Array<[SuggestionEmptyReason, number]> = [
    ["rooms", stats.hallBusy], ["teacher", stats.teacherBusy], ["travel", stats.travel],
    ["facility", stats.facility], ["borrow", stats.borrow], ["conflict", stats.gate || 0],
  ];
  return tally.sort((a, b) => b[1] - a[1])[0][1] > 0 ? tally[0][0] : "rooms";
}

/** نصّ قصير لكل سبب — يُستعمل في الملاحظة النصية مع الرمز. */
export const SUGGESTION_EMPTY_WORD: Record<SuggestionEmptyReason, string> = {
  halls: "لا قاعات",
  teacher: "الأستاذ مشغول",
  rooms: "القاعات محجوزة",
  travel: "لا وقت للانتقال",
  facility: "المرفق محجوز",
  borrow: "خارج الاستعارة",
  hours: "تجاوز الساعات",
  conflict: "تعارض",
  days: "اختر الأيام",
};
