/**
 * نموذجُ مستكشف المباني والقاعات: دوالُّ حسابٍ نقيّة (بلا React) لما يعرضه «RoomsExplorer»:
 * إشغالُ القاعة، أقربُ فراغٍ في أسبوعها، سطرُ حالتها الآن (بتوقيت الكويت)، وفهمُ جملة البحث عن حاجة («الأحد 10»، «مساءً»).
 *
 * ملاحظة: هذه نسخةٌ محليةٌ مصغّرة؛ إن وُجد roomNow/roomQuery المشتركان فهما أوسع، ولا يتعارضان مع هذا الملف.
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

/** الآن بتوقيت الكويت: يومُ الأسبوع (0 = الأحد) ودقائقُ اليوم. */
export function kuwaitNow(date: Date = new Date()): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kuwait", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const pick = (type: string) => parts.find(part => part.type === type)?.value || "";
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(pick("weekday"));
  return { weekday: weekdayIndex, minutes: (Number(pick("hour")) % 24) * 60 + Number(pick("minute")) };
}

export type RoomStatus = { kind: "free" | "soon" | "busy"; text: string; until: number } | null;

/**
 * حالةُ القاعة الآن. لا شيء خارج أيام التدريس وساعاته (null): لا يُقال «متاحة الآن» ليلاً.
 * `minuteLabel` يمرّ عبر arabicCount في المستدعي كي تبقى الأعداد سليمة.
 */
export function roomStatusNow(
  today: readonly Interval[], now: { weekday: number; minutes: number }, teachingDays: readonly number[],
  windowStart: number, windowEnd: number, minuteLabel: (n: number) => string,
): RoomStatus {
  if (!teachingDays.includes(now.weekday)) return null;
  if (now.minutes < windowStart || now.minutes >= windowEnd) return null;
  const merged = mergeIntervals(today);
  const running = merged.find(item => item.from <= now.minutes && now.minutes < item.to);
  if (running) return { kind: "busy", until: running.to, text: `مشغولة الآن حتى ${clockText(running.to)}` };
  const next = merged.find(item => item.from > now.minutes);
  if (!next) return { kind: "free", until: windowEnd, text: `متاحة الآن حتى ${clockText(windowEnd)}` };
  const wait = next.from - now.minutes;
  if (wait <= 30) return { kind: "soon", until: next.from, text: `تُشغل بعد ${minuteLabel(wait)}` };
  return { kind: "free", until: next.from, text: `متاحة الآن حتى ${clockText(next.from)}` };
}

/* ── جملة البحث عن حاجة ─────────────────────────────────────────────────── */
export interface RoomNeed {
  dayIndex: number | null;
  /** بداية الساعة المطلوبة بالدقائق، أو null. */
  at: number | null;
  /** صباحاً/مساءً حين لا ساعة محدّدة. */
  period: "am" | "pm" | null;
  /** نصٌّ يُعرض شريحةً للحاجة المفهومة. */
  label: string;
  /** ما بقي من النص بعد انتزاع الحاجة: يُطابَق على اسم القاعة. */
  rest: string;
}

const DAY_WORDS: Array<[string, number]> = [["الاحد", 0], ["الأحد", 0], ["الاثنين", 1], ["الإثنين", 1], ["الثلاثاء", 2], ["الاربعاء", 3], ["الأربعاء", 3], ["الخميس", 4]];
const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];
const toLatin = (text: string) => text.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

/** يفهم «الأحد 10» و«الاثنين مساءً» و«10:30»؛ يعيد null إن لم يجد يوماً ولا وقتاً ولا فترة. */
export function parseRoomNeed(raw: string): RoomNeed | null {
  let text = toLatin(String(raw || "")).trim();
  if (!text) return null;
  let dayIndex: number | null = null;
  let period: "am" | "pm" | null = null;
  let at: number | null = null;
  for (const [word, index] of DAY_WORDS) {
    if (text.includes(word)) { dayIndex = index; text = text.replace(word, " "); break; }
  }
  if (/صباح/.test(text)) { period = "am"; text = text.replace(/صباحا?[ًا]?/, " "); }
  else if (/مساء|عصر|ظهر/.test(text)) { period = "pm"; text = text.replace(/مساء[ًا]?|عصرا?[ًا]?|ظهرا?[ًا]?/, " "); }
  const time = text.match(/(^|\s)(\d{1,2})(?::(\d{2}))?(?=\s|$)/);
  if (time) {
    const hour = Number(time[2]);
    const minute = Number(time[3] || 0);
    if (hour <= 23 && minute <= 59) {
      at = (hour < 7 ? hour + 12 : hour) * 60 + minute;
      text = text.replace(time[0], " ");
    }
  }
  if (dayIndex === null && at === null && period === null) return null;
  const bits = [dayIndex !== null ? DAY_NAMES[dayIndex] : "", at !== null ? clockText(at) : period === "am" ? "صباحاً" : period === "pm" ? "مساءً" : ""].filter(Boolean);
  return { dayIndex, at, period, label: bits.join(" · "), rest: text.replace(/\s+/g, " ").trim() };
}

/** هل القاعة حرّةٌ لهذه الحاجة؟ perDay: مجالاتُ كل يوم. */
export function roomFitsNeed(need: RoomNeed, perDay: readonly (readonly Interval[])[], windowStart: number, windowEnd: number, minLength = 50): boolean {
  const dayIndexes = need.dayIndex !== null ? [need.dayIndex] : perDay.map((_, index) => index);
  return dayIndexes.some(index => {
    const day = perDay[index] || [];
    if (need.at !== null) {
      const to = need.at + minLength;
      return !day.some(item => item.from < to && item.to > need.at!);
    }
    const from = need.period === "pm" ? Math.max(windowStart, 12 * 60) : windowStart;
    const to = need.period === "am" ? Math.min(windowEnd, 12 * 60) : windowEnd;
    return freeGaps(day, from, to, minLength).length > 0;
  });
}

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
