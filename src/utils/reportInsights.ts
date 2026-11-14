/**
 * ── الجواب قبل العدسة ────────────────────────────────────────────────────────
 *
 * ثلاث جملٍ فوق النتائج، من البيانات المعروضة نفسها، لقارئٍ مستعجل لا يفتح عدسة:
 * أثقلُ أستاذٍ نصاباً، وأزحمُ ساعةٍ في الأسبوع، والقاعاتُ الفارغة الآن.
 * لا قراءة جديدة: الصفوف ونصابها من الشاشة، وانشغال القاعات من مسار الإشغال القائم.
 */
import { DAY_LABELS, DAY_FLAGS } from "./naturalQuery";
import { SCHEDULE_DAY_END, SCHEDULE_DAY_START } from "./scheduleTime";

export interface InsightRow {
  AdInstructorId?: number;
  fstarttime?: string;
  fendtime?: string;
  fsunday?: boolean; fmonday?: boolean; ftuesday?: boolean; fwednesday?: boolean; fthursday?: boolean;
}
export interface InsightRoom { name: string; busy: ReadonlyArray<{ day: number; from: number; to: number }> }

export interface ReportInsights {
  heaviest: { id: number; name: string; hours: number; lectures: number } | null;
  busiest: { day: number; dayLabel: string; hour: number; label: string; lectures: number } | null;
  freeNow:
    | { state: "open"; day: number; dayLabel: string; clock: string; free: string[]; total: number }
    | { state: "closed"; reason: string }
    | null;
}

const minutesOf = (value: unknown) => {
  const [h, m] = String(value || "").split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};
const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** اليوم والدقيقة في الكويت، أيّاً كانت ساعة الجهاز. الأحد 0 … الخميس 4، والجمعة والسبت خارج الأسبوع. */
export function kuwaitNow(now: Date): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kuwait", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)?.value || "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const hour = Number(get("hour")) % 24;
  return { day: weekday, minutes: hour * 60 + Number(get("minute") || 0) };
}

export function buildReportInsights(input: {
  rows: ReadonlyArray<InsightRow>;
  teachingHours: ReadonlyMap<number, number>;
  nameOf: (id: number) => string;
  isPerson?: (id: number) => boolean;
  rooms: ReadonlyArray<InsightRoom> | null;
  now: Date;
}): ReportInsights {
  /* أثقلُ أستاذ: النصاب بالساعات المعتمدة، والتعادلُ يُحسم بعدد المحاضرات ثم بالاسم. */
  const lectures = new Map<number, number>();
  for (const row of input.rows) {
    const id = Number(row.AdInstructorId || 0);
    if (id) lectures.set(id, (lectures.get(id) || 0) + 1);
  }
  let heaviest: ReportInsights["heaviest"] = null;
  for (const [id, count] of lectures) {
    if (input.isPerson && !input.isPerson(id)) continue;
    const hours = Number(input.teachingHours.get(id) || 0);
    const name = input.nameOf(id);
    if (!name) continue;
    if (!heaviest || hours > heaviest.hours || (hours === heaviest.hours && (count > heaviest.lectures || (count === heaviest.lectures && name.localeCompare(heaviest.name, "ar") < 0)))) {
      heaviest = { id, name, hours, lectures: count };
    }
  }

  /* أزحمُ ساعة: كل محاضرةٍ تُعدّ في كل ساعةٍ تمسّها من كل يومٍ تُعقد فيه. */
  const grid = new Map<string, number>();
  for (const row of input.rows) {
    const from = minutesOf(row.fstarttime), to = minutesOf(row.fendtime);
    if (to <= from) continue;
    DAY_FLAGS.forEach((flag, day) => {
      if (!(row as any)[flag]) return;
      for (let hour = Math.floor(from / 60) * 60; hour < to; hour += 60) {
        const key = `${day}:${hour}`;
        grid.set(key, (grid.get(key) || 0) + 1);
      }
    });
  }
  let busiest: ReportInsights["busiest"] = null;
  for (const [key, count] of grid) {
    const [day, hour] = key.split(":").map(Number);
    if (!busiest || count > busiest.lectures || (count === busiest.lectures && (day < busiest.day || (day === busiest.day && hour < busiest.hour)))) {
      busiest = { day, dayLabel: DAY_LABELS[day], hour, label: `${clock(hour)}–${clock(hour + 60)}`, lectures: count };
    }
  }

  /* القاعات الفارغة الآن: من قاعات القسم الموثّقة وانشغالها في الجامعة كلها. */
  let freeNow: ReportInsights["freeNow"] = null;
  if (input.rooms && input.rooms.length) {
    const { day, minutes } = kuwaitNow(input.now);
    if (day < 0 || day > 4) freeNow = { state: "closed", reason: "اليوم خارج أيام الدوام" };
    else if (minutes < SCHEDULE_DAY_START || minutes >= SCHEDULE_DAY_END) freeNow = { state: "closed", reason: `خارج ساعات الدوام (${clock(SCHEDULE_DAY_START)}–${clock(SCHEDULE_DAY_END)})` };
    else {
      const free = input.rooms
        .filter(room => !room.busy.some(slot => slot.day === day && slot.from <= minutes && slot.to > minutes))
        .map(room => room.name);
      freeNow = { state: "open", day, dayLabel: DAY_LABELS[day], clock: clock(minutes), free, total: input.rooms.length };
    }
  }
  return { heaviest, busiest, freeNow };
}
