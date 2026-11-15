/**
 * «القاعة الآن»: حالةُ قاعةٍ واحدة في هذه اللحظة، بتوقيت الكويت (UTC+3 بلا توقيتٍ صيفي)
 * أياً كان توقيتُ الجهاز. أيامُ التدريس الأحد–الخميس، وداخل يوم الجامعة فقط.
 * دالةٌ نقيّة: `now` يُحقن فيُختبر كل شيء.
 */
import { AR, countOf } from "./arabicCount";
import { DAY_KEYS } from "./scheduleRegulations";
import { SCHEDULE_DAY_END, SCHEDULE_DAY_START } from "./scheduleTime";

export type RoomNowState = "free-until" | "busy-until" | "busy-soon" | "free-today" | "none";
export interface RoomNow { state: RoomNowState; untilMinutes?: number; text: string }
export interface RoomNowRow {
  fstarttime?: string | null; fendtime?: string | null;
  fsunday?: boolean; fmonday?: boolean; ftuesday?: boolean; fwednesday?: boolean; fthursday?: boolean;
}
export interface RoomNowOptions {
  /** يقرب الحجزُ التالي: حتى هذا العدد من الدقائق = «تُشغل بعد». */
  soonMinutes?: number;
  /** فجواتٌ أقصر من هذا بين محاضرتين لا تُعدّ فراغاً. */
  minGapMinutes?: number;
}

const KUWAIT_OFFSET_MS = 3 * 3600_000;
const pad = (n: number) => String(n).padStart(2, "0");
export const clockText = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const clockMinutes = (raw?: string | null) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(raw ?? "").trim());
  if (!m) return NaN;
  const h = Number(m[1]), min = Number(m[2]);
  return h > 23 || min > 59 ? NaN : h * 60 + min;
};

/** اللحظةُ بتوقيت الكويت: اليومُ (0 = الأحد) ودقيقةُ اليوم. */
export function kuwaitClock(now: Date): { day: number; minute: number } {
  const shifted = new Date(now.getTime() + KUWAIT_OFFSET_MS);
  return { day: shifted.getUTCDay(), minute: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
}

export function roomNowStatus(rows: readonly RoomNowRow[], now: Date = new Date(), opts: RoomNowOptions = {}): RoomNow {
  const soon = opts.soonMinutes ?? 30, minGap = opts.minGapMinutes ?? 10;
  const { day, minute } = kuwaitClock(now);
  if (day > 4 || minute < SCHEDULE_DAY_START || minute >= SCHEDULE_DAY_END) return { state: "none", text: "" };
  const dayKey = DAY_KEYS[day];
  const spans = rows
    .filter(row => row && row[dayKey])
    .map(row => [clockMinutes(row.fstarttime), clockMinutes(row.fendtime)] as [number, number])
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const [s, e] of spans) {
    const last = merged[merged.length - 1];
    if (last && s - last[1] < minGap) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  if (!merged.length) return { state: "free-today", text: "متاحة اليوم كله" };
  const current = merged.find(([s, e]) => s <= minute && minute < e);
  if (current) return { state: "busy-until", untilMinutes: current[1], text: `مشغولة حتى ${clockText(current[1])}` };
  const next = merged.find(([s]) => s > minute);
  if (next) {
    const wait = next[0] - minute;
    if (wait <= soon) return { state: "busy-soon", untilMinutes: next[0], text: `تُشغل بعد ${countOf(wait, AR.minute)}` };
    return { state: "free-until", untilMinutes: next[0], text: `متاحة الآن حتى ${clockText(next[0])}` };
  }
  return { state: "free-until", untilMinutes: SCHEDULE_DAY_END, text: `متاحة الآن حتى ${clockText(SCHEDULE_DAY_END)}` };
}
