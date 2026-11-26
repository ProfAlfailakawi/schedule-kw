/**
 * ── افتتاحية اليوم: ما تُرسمه وما تقوله ────────────────────────────────────
 *
 * حسابٌ خالص من «محاضرات اليوم» (/api/dashboard): قاعات اليوم مبانيَ ونوافذ،
 * وساعةٌ تجري من الفجر إلى الآن، وثلاثة أرقام. يُحمَّل مع الافتتاحية كسولاً.
 * لا اسم قاعةٍ يُكتب في الرسم.
 */
import { floorOf, normalizeToken } from "./hallPulse";

export const OPENING_DAWN = 7 * 60;
export const OPENING_DUSK = 21 * 60;
/** أكثر القاعات المرسومة: ما زاد يُختصر إلى أكثرها إشغالاً اليوم. */
export const OPENING_MAX_HALLS = 48;

export interface OpeningLecture { startTime: string; endTime: string; roomCode: string; roomHall: string }

const minutesOf = (value: string): number => {
  const [h, m] = String(value || "").split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : NaN;
};

/* ── ما ترسمه: قاعات اليوم مبانيَ ونوافذ ──────────────────────────────────── */

export interface OpeningHall { key: string; floor: number; windows: Array<{ start: number; end: number }> }
export interface OpeningBuilding { code: string; halls: OpeningHall[]; floors: number }

/** قاعات اليوم مجمّعةً بمبانيها، كل قاعةٍ نافذة بمواعيدها. بلا أسماء: الافتتاحية لا تكتب اسم قاعة. */
export function openingSkyline(today: readonly OpeningLecture[], max = OPENING_MAX_HALLS): OpeningBuilding[] {
  const halls = new Map<string, OpeningHall & { building: string; minutes: number; code: string }>();
  for (const row of today) {
    const start = minutesOf(row.startTime), end = minutesOf(row.endTime);
    const hall = String(row.roomHall || "").trim();
    if (!hall || !(end > start)) continue;
    const building = normalizeToken(row.roomCode) || "—";
    const key = `${building}|${normalizeToken(hall)}`;
    let entry = halls.get(key);
    if (!entry) { entry = { key, building, code: hall, floor: floorOf(hall), windows: [], minutes: 0 }; halls.set(key, entry); }
    entry.windows.push({ start, end });
    entry.minutes += end - start;
  }
  const kept = [...halls.values()].sort((a, b) => b.minutes - a.minutes || a.key.localeCompare(b.key)).slice(0, Math.max(1, max));
  const byBuilding = new Map<string, OpeningBuilding>();
  for (const hall of kept) {
    let b = byBuilding.get(hall.building);
    if (!b) { b = { code: hall.building, halls: [], floors: 1 }; byBuilding.set(hall.building, b); }
    b.halls.push({ key: hall.key, floor: hall.floor, windows: hall.windows.sort((x, y) => x.start - y.start) });
  }
  const out = [...byBuilding.values()].map(b => ({
    ...b,
    halls: b.halls.sort((x, y) => x.floor - y.floor || x.key.localeCompare(y.key, "en", { numeric: true })),
    floors: new Set(b.halls.map(h => h.floor)).size,
  }));
  /* الأكبر في الوسط، والأصغر على الجانبين: أفقٌ متوازن لا يميل. */
  out.sort((a, b) => b.halls.length - a.halls.length || a.code.localeCompare(b.code));
  const centred: OpeningBuilding[] = [];
  out.forEach((b, i) => { if (i % 2) centred.push(b); else centred.unshift(b); });
  return centred;
}

/** القاعة مضاءةٌ عند هذه الدقيقة؟ */
export const hallLitAt = (hall: OpeningHall, minute: number): boolean => hall.windows.some(w => w.start <= minute && w.end > minute);

/** هل مرّت بالقاعة محاضرةٌ قبل هذه الدقيقة (أثرٌ خافت لما انتهى)؟ */
export const hallUsedBefore = (hall: OpeningHall, minute: number): boolean => hall.windows.some(w => w.start < minute);

/** الساعة التي تقف عندها الافتتاحية: الآن، بين الفجر والمساء. */
export function openingClock(nowMinute: number): number {
  return Math.max(OPENING_DAWN + 30, Math.min(OPENING_DUSK, nowMinute));
}

/* ── ما تقوله: ثلاثة أرقام من اليوم ───────────────────────────────────────── */

export interface OpeningNumbers {
  lectures: number;
  /** القاعات المشغولة الآن (قاعاتٌ لا محاضرات: قاعةٌ واحدة بشعبتين = قاعة). */
  hallsNow: number;
  /** ذروة اليوم: أول دقيقةٍ يبلغ فيها عدد المحاضرات الجارية أقصاه. */
  peak: { minute: number; count: number } | null;
}

export function openingNumbers(today: readonly OpeningLecture[], nowMinute: number): OpeningNumbers {
  const timed = today.map(row => ({ start: minutesOf(row.startTime), end: minutesOf(row.endTime), hall: `${normalizeToken(row.roomCode)}|${normalizeToken(row.roomHall)}`, roomed: Boolean(String(row.roomHall || "").trim()) }))
    .filter(row => row.end > row.start);
  const now = new Set(timed.filter(row => row.roomed && row.start <= nowMinute && row.end > nowMinute).map(row => row.hall));
  let peak: OpeningNumbers["peak"] = null;
  /* الذروة تتغيّر عند بداية محاضرةٍ فقط: تكفي بداياتها. */
  for (const at of [...new Set(timed.map(row => row.start))].sort((a, b) => a - b)) {
    const count = timed.filter(row => row.start <= at && row.end > at).length;
    if (count > (peak?.count || 0)) peak = { minute: at, count };
  }
  return { lectures: today.length, hallsNow: now.size, peak };
}

/** «8:00 ص» بلا أصفارٍ زائدة، وأرقامٌ لاتينية. */
export function openingClockText(minute: number): string {
  const h = Math.floor(minute / 60), m = Math.round(minute % 60);
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "ص" : "م"}`;
}

/** لون السماء من الفجر إلى المساء — درجات «نبض القاعات» نفسها (skyAt في HallPulse). */
export function openingSky(minute: number): { top: string; mid: string } {
  const t = Math.max(0, Math.min(1, (minute - OPENING_DAWN) / (OPENING_DUSK - OPENING_DAWN)));
  const stops: Array<[number, number[], number[]]> = [
    [0, [0x23, 0x45, 0x5c], [0x10, 0x2c, 0x2c]],
    [0.45, [0x1f, 0x5a, 0x4e], [0x0d, 0x26, 0x21]],
    [1, [0x5a, 0x37, 0x3c], [0x14, 0x21, 0x22]],
  ];
  let i = 0; while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
  const [t0, a0, b0] = stops[i], [t1, a1, b1] = stops[i + 1];
  const k = (t - t0) / Math.max(1e-6, t1 - t0);
  const mix = (a: number[], b: number[]) => `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * k)).join(" ")})`;
  return { top: mix(a0, a1), mid: mix(b0, b1) };
}
