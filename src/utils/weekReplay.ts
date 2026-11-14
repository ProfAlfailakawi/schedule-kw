/**
 * ── «إعادة عرض الأسبوع»: كيف تكوّن هذا الجدول؟ ─────────────────────────────────────
 *
 * قراءةٌ نقيّة لا تكتب شيئاً. تأخذ لقطاتِ النسخ (كلُّ نسخةٍ تُلتقط قبل التغيير الذي تحميه، فالتغييرُ i يقع بين اللقطة i
 * واللقطة i+1، والأخيرُ بين آخر لقطةٍ والجدولِ الحيّ) وتُعيد بناء الأحداث بالتقدّم من أقدم حالةٍ معروفة:
 *   إضافة (موعدٌ ظهر) · حذف (اختفى) · نقل (اليوم/الوقت) · أستاذ · قاعة.
 * ثم تنسب كلَّ حدثٍ إلى فاعله من «الأثر» (activity trail) حين يوجد سطرٌ للموعد نفسه قريبُ الوقت — ولا اسمَ بلا أثرٍ يراه القارئ.
 *
 * المطابقة بين حالتين: بالمعرّف أولاً، ثم بـ(المقرر، الشعبة) بالترتيب — فاسترجاعُ نسخةٍ يعيد ترقيم الصفوف ولا يُظهرها «حذفاً وإضافة».
 */
export const REPLAY_DAYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
export type ReplayKind = "add" | "remove" | "move" | "teacher" | "room";

export interface ReplayRowLite {
  id: number; AdCourseId: number; AdCourseName?: string; CourseCodeSnapshot?: string; SCode?: string | number; AdInstructorId?: number;
  fsunday?: boolean; fmonday?: boolean; ftuesday?: boolean; fwednesday?: boolean; fthursday?: boolean;
  fstarttime?: string; fendtime?: string; AdRoomCode?: string; AdRoomHall?: string;
}
export interface ReplaySnapshot { id: string; at: string; label?: string; rows: ReplayRowLite[] }
export interface ReplayTrailLite { at: string; row?: number; who?: string; seat?: string; kind?: string }

export interface ReplayCard {
  uid: string; id: number; courseId: number; course: string; code: string; scode: string; instructorId: number;
  days: string[]; start: number; end: number; room: string;
}
export interface ReplaySlot { days: string[]; start: number; end: number }
export interface ReplayEvent {
  n: number;
  /** رقمُ الدفعة (تغييرٌ واحد في الخادم قد يمسّ بطاقاتٍ كثيرة). */
  batch: number;
  at: string;
  kind: ReplayKind;
  /** كل ما تغيّر في البطاقة (الأوّل هو kind) — لوميضُ الحافة. */
  flags: ReplayKind[];
  uid: string;
  /** البطاقةُ بعد الحدث (وقبله في الحذف). */
  card: ReplayCard;
  /** قبل (للنقل). */
  from?: ReplaySlot;
  who?: string;
  seat?: string;
  label?: string;
}
export interface Replay { base: ReplayCard[]; events: ReplayEvent[]; final: ReplayCard[] }

const minutesOf = (clock: unknown) => { const [h, m] = String(clock || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, "").toLowerCase();

export function cardOf(row: ReplayRowLite, uid: string): ReplayCard {
  return {
    uid, id: Number(row.id), courseId: Number(row.AdCourseId || 0), course: String(row.AdCourseName || ""), code: String(row.CourseCodeSnapshot || ""),
    scode: String(row.SCode ?? ""), instructorId: Number(row.AdInstructorId || 0),
    days: REPLAY_DAYS.filter(day => Boolean((row as any)[day])), start: minutesOf(row.fstarttime), end: minutesOf(row.fendtime),
    room: `${clean(row.AdRoomCode)}/${clean(row.AdRoomHall)}` === "/" ? "" : `${String(row.AdRoomCode ?? "").trim()}/${String(row.AdRoomHall ?? "").trim()}`,
  };
}
const slotOf = (card: ReplayCard): ReplaySlot => ({ days: [...card.days], start: card.start, end: card.end });
const sameSlot = (a: ReplayCard, b: ReplayCard) => a.start === b.start && a.end === b.end && a.days.join() === b.days.join();

/** مطابقةُ حالتين: [قديم، جديد] للمتطابق، وما فاض في كلٍّ جهةً. */
export function matchRows(before: readonly ReplayCard[], after: readonly ReplayRowLite[]) {
  const pairs: Array<[ReplayCard, ReplayRowLite]> = [];
  const freeAfter = new Map<number, ReplayRowLite>(after.map(row => [Number(row.id), row] as const));
  const leftBefore: ReplayCard[] = [];
  for (const card of before) {
    const hit = freeAfter.get(card.id);
    if (hit) { pairs.push([card, hit]); freeAfter.delete(card.id); } else leftBefore.push(card);
  }
  const byKey = new Map<string, ReplayRowLite[]>();
  for (const row of freeAfter.values()) {
    const key = `${Number(row.AdCourseId || 0)}:${String(row.SCode ?? "")}`;
    byKey.set(key, [...(byKey.get(key) || []), row]);
  }
  const removed: ReplayCard[] = [];
  for (const card of leftBefore) {
    const list = byKey.get(`${card.courseId}:${card.scode}`);
    const hit = list?.shift();
    if (hit) { pairs.push([card, hit]); freeAfter.delete(Number(hit.id)); } else removed.push(card);
  }
  const added = [...freeAfter.values()].filter(row => !pairs.some(([, hit]) => hit === row));
  return { pairs, removed, added };
}

const WINDOW_BY_ROW_MS = 10 * 60_000;
const WINDOW_BATCH_MS = 90_000;
function attribute(trail: readonly ReplayTrailLite[], at: string, ids: number[]) {
  const t = Date.parse(at);
  if (!Number.isFinite(t) || !trail.length) return null;
  const near = (window: number, pred: (entry: ReplayTrailLite) => boolean) => {
    let best: ReplayTrailLite | null = null, gap = Infinity;
    for (const entry of trail) {
      const d = Math.abs(Date.parse(entry.at) - t);
      if (Number.isFinite(d) && d <= window && d < gap && pred(entry)) { best = entry; gap = d; }
    }
    return best;
  };
  return near(WINDOW_BY_ROW_MS, entry => Boolean(entry.row) && ids.includes(Number(entry.row))) || near(WINDOW_BATCH_MS, () => true);
}

/** إعادةُ البناء كاملةً. بلا لقطاتٍ أو بلا فروقٍ: events فارغة (حالةُ «لا سجل»). */
export function buildReplay(input: { snapshots: readonly ReplaySnapshot[]; current: readonly ReplayRowLite[]; trail?: readonly ReplayTrailLite[] }): Replay {
  const ordered = [...input.snapshots].filter(snap => Array.isArray(snap.rows) && Number.isFinite(Date.parse(snap.at)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const trail = input.trail || [];
  if (!ordered.length) return { base: [], events: [], final: [] };
  let seq = 0;
  const base = ordered[0].rows.map(row => cardOf(row, `u${++seq}`));
  let state = base.map(card => ({ ...card }));
  const events: ReplayEvent[] = [];
  const frames = [...ordered.slice(1).map(snap => ({ at: ordered[0].at, rows: snap.rows })), { at: "", rows: [...input.current] as ReplayRowLite[] }];
  // الحدث i يحدث عند لقطته (أُخذت قبله مباشرةً).
  frames.forEach((frame, i) => {
    const snap = ordered[i];
    const { pairs, removed, added } = matchRows(state, frame.rows);
    const batch = i + 1;
    const push = (event: Omit<ReplayEvent, "n" | "batch" | "at" | "label" | "who" | "seat">, ids: number[]) => {
      const who = attribute(trail, snap.at, ids);
      events.push({ ...event, n: events.length, batch, at: snap.at, label: snap.label, ...(who?.who ? { who: who.who } : {}), ...(who?.seat ? { seat: who.seat } : {}) });
    };
    const next: ReplayCard[] = [];
    for (const [old, row] of pairs) {
      const card = cardOf(row, old.uid);
      next.push(card);
      const flags: ReplayKind[] = [];
      if (!sameSlot(old, card)) flags.push("move");
      if (old.instructorId !== card.instructorId) flags.push("teacher");
      if (clean(old.room) !== clean(card.room)) flags.push("room");
      if (flags.length) push({ kind: flags[0], flags, uid: old.uid, card, ...(flags.includes("move") ? { from: slotOf(old) } : {}) }, [old.id, card.id]);
    }
    for (const old of removed) push({ kind: "remove", flags: ["remove"], uid: old.uid, card: old }, [old.id]);
    for (const row of added) {
      const card = cardOf(row, `u${++seq}`);
      next.push(card);
      push({ kind: "add", flags: ["add"], uid: card.uid, card }, [card.id]);
    }
    state = next;
  });
  return { base, events, final: state };
}

/** البطاقاتُ بعد تطبيق k حدثاً من البداية. */
export function stateAt(replay: Replay, k: number): ReplayCard[] {
  const map = new Map(replay.base.map(card => [card.uid, card] as const));
  const upto = Math.max(0, Math.min(k, replay.events.length));
  for (let i = 0; i < upto; i++) {
    const event = replay.events[i];
    if (event.kind === "remove") map.delete(event.uid); else map.set(event.uid, event.card);
  }
  return [...map.values()];
}

export interface ReplayCounters { added: number; moved: number; removed: number; other: number }
export function replayCounters(replay: Replay, k: number): ReplayCounters {
  const out = { added: 0, moved: 0, removed: 0, other: 0 };
  for (const event of replay.events.slice(0, Math.max(0, k))) {
    if (event.kind === "add") out.added++; else if (event.kind === "remove") out.removed++; else if (event.kind === "move") out.moved++; else out.other++;
  }
  return out;
}

/** أحداثٌ مجمّعةٌ بيومها المحلي لحلقات العدّ على الخط الزمني. */
export function replayDays(replay: Replay) {
  const groups: Array<{ day: string; first: number; count: number }> = [];
  for (const event of replay.events) {
    const d = new Date(event.at);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.count++; else groups.push({ day, first: event.n, count: 1 });
  }
  return groups;
}

/** «اليوم» / «أمس» / «قبل N أيام» / «قبل N أسابيع» بأرقامٍ لاتينية. */
export function relativeDay(at: string, now = Date.now()): string {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return "";
  const days = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return "اليوم";
  if (days === 1) return "أمس";
  if (days === 2) return "قبل يومين";
  if (days <= 10) return `قبل ${days} أيام`;
  if (days < 60) { const w = Math.round(days / 7); return w === 1 ? "قبل أسبوع" : w === 2 ? "قبل أسبوعين" : `قبل ${w} أسابيع`; }
  const m = Math.round(days / 30);
  return m === 2 ? "قبل شهرين" : `قبل ${m} أشهر`;
}
export const exactStamp = (at: string) => { const d = new Date(at); return Number.isFinite(d.getTime()) ? d.toLocaleString("ar-KW-u-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""; };
