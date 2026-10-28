/**
 * ── «🧲 لاصق بمحاضرتي» (C6) ──────────────────────────────────────────────────
 *
 * لكل محاضرةٍ قائمة للأستاذ زرّان: ⬅️ قبلها و➡️ بعدها. الوقت لا يُكتب باليد:
 *   بعدها  = نهايتُها + فاصلُ اللائحة لتلك الأيام (١٠ د للأحد/الثلاثاء/الخميس، ١٥ د للاثنين/الأربعاء)
 *   قبلها  = بدايتُها − الفاصل − مدّةُ المقرر على تلك الأيام
 * ثم يُفحص كلُّ مرشّحٍ بمحرّك الحكم الواحد (judgeRequestItems ← judgeRequest) — هذه
 * الوحدة لا تفحص شيئاً بنفسها؛ تولّد المرشّحين وترتّب نتائج المحرّك فقط.
 *
 * إن كان الملاصقُ مأخوذاً يُجرَّب الأقرب «+٣٠د» ثم «+٦٠د» (للأمام بعدها، وللخلف قبلها).
 * والترتيب: متاحٌ أولاً، ثم نفسُ القاعة، ثم نفسُ المبنى، ثم الملاصقُ قبل المُزاح، ثم بعدها قبل قبلها.
 */
import type { DayKey } from "./scheduleRegulations";
import { requiredGapForDays } from "./scheduleRegulations";

export type StickSide = "before" | "after";
export interface StickAnchor {
  /** صفُّ الجدول القائم. */
  rowId: number;
  title: string;
  days: DayKey[];
  start: string;
  end: string;
  /** مفتاح القاعة (roomKeyOf) ومبناها إن عُرف. */
  roomKey?: string;
  building?: string;
}
export interface StickCandidate {
  anchorRowId: number;
  side: StickSide;
  days: DayKey[];
  start: string;
  end: string;
  /** الإزاحة عن الملاصق بالدقائق (0، 30، 60). */
  shift: number;
}
export interface StickJudged extends StickCandidate {
  tone: "ok" | "warn" | "bad";
  sameRoom: boolean;
  sameBuilding: boolean;
  /** سطرُ السبب من المحرّك حين لا يكون متاحاً. */
  reason?: string;
}

export const STICK_SHIFTS = [0, 30, 60] as const;

export const toMin = (clock: string) => { const [h, m] = String(clock || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
export const toClock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** أوّل وآخر دقيقة يُسمح فيهما بمحاضرة (٨:٠٠ — ٢٠:٠٠). */
export const STICK_DAY = { start: 8 * 60, end: 20 * 60 };

/**
 * المرشّحون لمحاضرةٍ واحدة وجهةٍ واحدة، بالترتيب (الملاصق، +٣٠، +٦٠).
 * `durationFor(days)` مدّةُ المقرر على هذه الأيام (من اللائحة/endForRequest)، لا رقمٌ مخترع.
 */
export function stickCandidates(anchor: StickAnchor, side: StickSide, durationFor: (days: DayKey[]) => number): StickCandidate[] {
  if (!anchor.days.length || !anchor.start || !anchor.end) return [];
  const gap = requiredGapForDays(anchor.days);
  const duration = durationFor(anchor.days);
  if (!(duration > 0)) return [];
  const out: StickCandidate[] = [];
  for (const shift of STICK_SHIFTS) {
    const start = side === "after"
      ? toMin(anchor.end) + gap + shift
      : toMin(anchor.start) - gap - duration - shift;
    const end = start + duration;
    if (start < STICK_DAY.start || end > STICK_DAY.end) continue;
    out.push({ anchorRowId: anchor.rowId, side, days: [...anchor.days], start: toClock(start), end: toClock(end), shift });
  }
  return out;
}

/** الأفضلُ لكل (محاضرة × جهة): أوّلُ متاحٍ بترتيب الإزاحة، وإلا أوّلُ مرشّحٍ بسببه. */
export function bestPerSide(judged: StickJudged[]): StickJudged[] {
  const groups = new Map<string, StickJudged[]>();
  for (const row of judged) {
    const key = `${row.anchorRowId}:${row.side}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return [...groups.values()].map(list => {
    const sorted = [...list].sort((a, b) => a.shift - b.shift);
    return sorted.find(row => row.tone === "ok") || sorted.find(row => row.tone === "warn") || sorted[0];
  });
}

const score = (row: StickJudged) =>
  (row.tone === "ok" ? 1000 : row.tone === "warn" ? 500 : 0)
  + (row.sameRoom ? 200 : 0) + (row.sameBuilding ? 100 : 0)
  - row.shift + (row.side === "after" ? 5 : 0);

/** «اقترح أفضل التصاق»: أفضل ثلاثة عبر الأسبوع، المتاحُ وحده. */
export function topSticks(judged: StickJudged[], limit = 3): StickJudged[] {
  return bestPerSide(judged).filter(row => row.tone !== "bad")
    .sort((a, b) => score(b) - score(a) || a.start.localeCompare(b.start)).slice(0, limit);
}

/** وسمُ الإزاحة كما يُرسم: «ملاصق» أو «+٣٠د». */
export function shiftLabel(row: Pick<StickCandidate, "shift" | "side">): string {
  if (!row.shift) return "ملاصق";
  return `${row.side === "after" ? "+" : "−"}${row.shift}د`;
}
