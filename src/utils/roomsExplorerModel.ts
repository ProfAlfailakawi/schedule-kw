/**
 * نموذجُ مستكشف المباني والقاعات: دوالُّ حسابٍ نقيّة (بلا React) لما يعرضه «RoomsExplorer»:
 * إشغالُ القاعة، أقربُ فراغٍ في أسبوعها، وخلايا الحرارة. حالةُ القاعة الآن في roomNow.ts، وفهمُ جملة الحاجة في roomQuery.ts.
 */

export interface Interval { from: number; to: number }
export interface FreeWindow { dayIndex: number; from: number; to: number }

/** دمجُ المجالات المتراكبة أو المتلاصقة في مجالاتٍ مرتّبة. */
export function mergeIntervals(list: readonly Interval[]): Interval[] {
  const sorted = list.filter(item => item.to > item.from).map(item => ({ ...item })).sort((a, b) => a.from - b.from);
  const out: Interval[] = [];
  for (const item of sorted) {
    const last = out[out.length - 1];
    if (last && item.from <= last.to) last.to = Math.max(last.to, item.to);
    else out.push(item);
  }
  return out;
}

/** دقائق الانشغال داخل نافذة اليوم. */
export function busyMinutes(list: readonly Interval[], windowStart: number, windowEnd: number): number {
  return mergeIntervals(list).reduce((sum, item) => sum + Math.max(0, Math.min(item.to, windowEnd) - Math.max(item.from, windowStart)), 0);
}

/** نسبةُ الإشغال (0..100) لأيامٍ عدة داخل النافذة نفسها. */
export function occupancyPercent(perDay: readonly (readonly Interval[])[], windowStart: number, windowEnd: number): number {
  const total = (windowEnd - windowStart) * Math.max(1, perDay.length);
  if (total <= 0) return 0;
  const busy = perDay.reduce((sum, day) => sum + busyMinutes(day, windowStart, windowEnd), 0);
  return Math.min(100, Math.round((busy / total) * 100));
}

/** الفراغاتُ داخل يومٍ واحد، لا أقصر من minLength دقيقة. */
export function freeGaps(list: readonly Interval[], windowStart: number, windowEnd: number, minLength: number): Interval[] {
  const gaps: Interval[] = [];
  let cursor = windowStart;
  for (const item of mergeIntervals(list)) {
    if (item.from - cursor >= minLength) gaps.push({ from: cursor, to: Math.min(item.from, windowEnd) });
    cursor = Math.max(cursor, item.to);
  }
  if (windowEnd - cursor >= minLength) gaps.push({ from: cursor, to: windowEnd });
  return gaps.filter(gap => gap.to > gap.from);
}

/** أقربُ فراغاتٍ في الأسبوع: أولُ فراغٍ في كل يوم ثم الثاني…، بحدٍّ أقصى. */
export function nextFreeWindows(perDay: readonly (readonly Interval[])[], windowStart: number, windowEnd: number, minLength: number, max: number): FreeWindow[] {
  const perDayGaps = perDay.map(day => freeGaps(day, windowStart, windowEnd, minLength));
  const out: FreeWindow[] = [];
  for (let round = 0; out.length < max; round++) {
    let any = false;
    perDayGaps.forEach((gaps, dayIndex) => {
      const gap = gaps[round];
      if (gap && out.length < max) { out.push({ dayIndex, from: gap.from, to: gap.to }); any = true; }
    });
    if (!any) break;
  }
  return out;
}

export const clockText = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/* ── أنواع بيانات المستكشف ──────────────────────────────────────────────── */
export interface RxBuilding { key: string; label: string; roomCount: number; occupancy: number }
export interface RxRoom {
  key: string;
  buildingKey: string;
  /** رمزُ القاعة كما يُقرأ (اللاتيني). */
  label: string;
  building: string;
  /** مجالاتُ كل يومٍ من أيام التدريس بالترتيب. */
  perDay: Interval[][];
  occupancy: number;
  lectures: number;
  /** سعةُ القاعة من سجل المواقع؛ غيابها = غير معروفة (لا تُطبع أبداً كصفر). */
  capacity?: number | null;
  /** نوعُ القاعة من السجل (مختبر/قاعة…)؛ غيابه = غير معروف. */
  roomType?: string;
}
export interface RxDay { key: string; label: string }
export const NO_ROOM_KEY = "|";

/** خلايا الساعات لمجالات يومٍ واحد: نسبةُ انشغال كل ساعة (0..1). */
export function hourCells(list: readonly Interval[], windowStart: number, windowEnd: number): number[] {
  const merged = mergeIntervals(list);
  const count = Math.max(1, Math.round((windowEnd - windowStart) / 60));
  return Array.from({ length: count }, (_, index) => {
    const from = windowStart + index * 60;
    const to = from + 60;
    const busy = merged.reduce((sum, item) => sum + Math.max(0, Math.min(item.to, to) - Math.max(item.from, from)), 0);
    return Math.min(1, busy / 60);
  });
}
