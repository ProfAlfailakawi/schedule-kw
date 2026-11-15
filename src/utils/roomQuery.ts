/**
 * «ابحث عن قاعة بالكلام»: «40 مقعد مختبر الاثنين صباحاً» ← شروطٌ مفهومة.
 * نقيّة وحتميّة. لغةُ الأيام من oneLineAppointment، وقاعدةُ الساعة من clockInput.
 */
import { DAY_WORDS, normalizeOneLine } from "./oneLineAppointment";
import { clockWithPeriod, parseTypedClock } from "./clockInput";
import { foldInstructorText } from "./instructorIdentity";
import type { DayKey } from "./scheduleRegulations";

export interface RoomQuery { minCapacity?: number; lab?: boolean; day?: DayKey; from?: string; to?: string; rest: string }
export interface RoomQueryRoom { capacity?: number | null; roomType?: string; canonicalCode?: string; code?: string }
export interface RoomQueryRow {
  fstarttime?: string | null; fendtime?: string | null;
  fsunday?: boolean; fmonday?: boolean; ftuesday?: boolean; fwednesday?: boolean; fthursday?: boolean;
}

const DEFAULT_WINDOW_MINUTES = 50;
const fold = (w: string) => w.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
const PERIODS: Array<{ words: string[]; period: "am" | "pm"; from: string; to: string }> = [
  { words: ["صباحا", "صباح", "الصبح", "صبح", "الصباح"], period: "am", from: "08:00", to: "12:00" },
  { words: ["ظهرا", "ظهر", "الظهر"], period: "pm", from: "12:00", to: "16:00" },
  { words: ["عصرا", "عصر", "العصر"], period: "pm", from: "14:00", to: "18:00" },
  { words: ["مساء", "المساء", "مساءا", "ليلا", "بالليل"], period: "pm", from: "16:00", to: "20:00" },
];
const GLUE = new Set(["الساعه", "الساعة", "ساعه", "من", "الى", "إلى", "يوم", "في", "عند", "بعد"].map(fold));
const LAB = /^(ال)?(مختبر|معمل|لاب|مختبرات|معامل|lab)$/i;
const toMin = (c: string) => { const [h, m] = c.split(":"); return Number(h) * 60 + Number(m); };

export function parseRoomQuery(text: string): RoomQuery {
  let s = normalizeOneLine(text);
  const out: RoomQuery = { rest: "" };
  const cap = (re: RegExp) => { const m = re.exec(s); if (m) { out.minCapacity = Number(m[1]); s = s.replace(m[0], " "); return true; } return false; };
  cap(/(\d{1,4})\s*\+/) || cap(/(?:سعه|سعة)\s*(\d{1,4})/) || cap(/(\d{1,4})\s*(?:مقعد|مقاعد|كرسي|كراسي|طالب|طلاب)/);

  const kept: string[] = [];
  let periodHit: (typeof PERIODS)[number] | undefined;
  for (const token of s.split(" ").filter(Boolean)) {
    const f = fold(foldInstructorText(token));
    if (LAB.test(token) || LAB.test(fold(token))) { out.lab = true; continue; }
    const day = DAY_WORDS.get(foldInstructorText(token)) ?? DAY_WORDS.get(f);
    if (day && !out.day) { out.day = day; continue; }
    const period = PERIODS.find(p => p.words.some(w => fold(w) === fold(token)));
    if (period && !periodHit) { periodHit = period; continue; }
    kept.push(token);
  }
  s = kept.join(" ");

  /* ساعاتٌ: خانةٌ أو خانتان مع دقائقَ اختيارية، وليست جزءاً من رمزٍ مثل 104 أو A1/104. */
  const clocks: string[] = [];
  const clockRe = /(?<![\w/.:-])(\d{1,2})(?::(\d{2}))?(?![\w/:]|\.\d)/g;
  const consumed: string[] = [];
  for (const m of s.matchAll(clockRe)) {
    const typed = parseTypedClock(m[0]);
    if (typed.error) continue;
    const clock = periodHit ? clockWithPeriod(Number(m[1]), Number(m[2] ?? 0), periodHit.period) : typed.clock;
    if (!clock || clocks.length >= 2) continue;
    clocks.push(clock); consumed.push(m[0]);
  }
  let rest = s;
  for (const c of consumed) rest = rest.replace(new RegExp(`(?<![\\w/.:-])${c.replace(":", "\\:")}(?![\\w/:])`), " ");
  if (clocks.length) { out.from = clocks[0]; if (clocks[1]) out.to = clocks[1]; }
  else if (periodHit) { out.from = periodHit.from; out.to = periodHit.to; }
  rest = rest.split(" ").filter(w => w && !GLUE.has(fold(w))).join(" ");
  out.rest = rest.trim();
  return out;
}

/** هل في القاعة ما يتداخل مع [from,to) في اليوم؟ لا فجوةَ بين نهاية محاضرةٍ وبداية أخرى تُحتسب. */
export function roomMatchesQuery(room: RoomQueryRoom, rowsOfRoom: readonly RoomQueryRow[], query: RoomQuery): boolean {
  if (query.minCapacity != null && !(Number(room.capacity) >= query.minCapacity)) return false;
  if (query.lab && !/lab|مختبر|معمل/i.test(room.roomType ?? "")) return false;
  const code = (room.canonicalCode ?? room.code ?? "").toUpperCase();
  const rest = query.rest.trim().toUpperCase();
  if (rest && code && !rest.split(/\s+/).every(part => code.includes(part))) return false;
  if (!query.day && !query.from) return true;
  const from = query.from ? toMin(query.from) : 0;
  const to = query.to ? toMin(query.to) : query.from ? from + DEFAULT_WINDOW_MINUTES : 24 * 60;
  return !rowsOfRoom.some(row => {
    if (query.day && !row[query.day]) return false;
    if (!query.day && !query.from) return false;
    const s = toMin(String(row.fstarttime ?? "")), e = toMin(String(row.fendtime ?? ""));
    if (!/^\d{1,2}:\d{2}/.test(String(row.fstarttime ?? "")) || !/^\d{1,2}:\d{2}/.test(String(row.fendtime ?? "")) || !(e > s)) return false;
    return s < to && e > from;
  });
}
