/**
 * A professor's week, laid out where it actually falls.
 *
 * A quantity cannot separate the two shapes that matter most: three hours of
 * dead air before the first class, which is an early start and nothing worse,
 * and three hours wedged between two classes, which is an afternoon spent
 * waiting on campus. Both read "3س فراغ".
 *
 * So this returns position, not size: for each taught day, the blocks in the
 * order they occur and the empty stretches between them, as percentages of the
 * professor's own teaching window. Long waits are marked; short turnarounds are
 * left alone, because a thirty-minute gap is a walk between buildings.
 *
 * Shared by the reports lens «الأساتذة» and the analytics center drawer.
 */
export const WEEK_SHAPE_DAY_LABELS: Record<string, string> = {
  fsunday: "الأحد",
  fmonday: "الاثنين",
  ftuesday: "الثلاثاء",
  fwednesday: "الأربعاء",
  fthursday: "الخميس",
};

export const WAIT_THRESHOLD = 60;

const clockMinutes = (value: unknown) => {
  const [hour, minute] = String(value || "0:0").split(":").map(Number);
  return (hour || 0) * 60 + (minute || 0);
};

export type WeekShape = {
  from: number;
  to: number;
  hours: number[];
  days: Array<{
    day: string;
    label: string;
    blocks: Array<{ left: number; width: number }>;
    waits: Array<{ left: number; width: number; minutes: number }>;
    longest: number;
  }>;
};

export function professorWeekShape(rows: any[]): WeekShape | null {
  const dayKeys = Object.keys(WEEK_SHAPE_DAY_LABELS);
  const spans: Array<{ day: string; start: number; end: number }> = [];
  rows.forEach(row => {
    const start = clockMinutes(row.fstarttime), end = clockMinutes(row.fendtime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    dayKeys.forEach(day => { if (row[day]) spans.push({ day, start, end }); });
  });
  if (!spans.length) return null;
  const from = Math.floor(Math.min(...spans.map(s => s.start)) / 60) * 60;
  const to = Math.ceil(Math.max(...spans.map(s => s.end)) / 60) * 60;
  const width = Math.max(60, to - from);
  const pct = (value: number) => ((value - from) / width) * 100;
  const days = dayKeys.map(day => {
    const blocks = spans.filter(s => s.day === day).sort((a, b) => a.start - b.start);
    const waits: Array<{ left: number; width: number; minutes: number }> = [];
    /* A block that overlaps the one before it (two sections taught together)
       leaves no wait: the gap is measured from the latest end so far. */
    let lastEnd = blocks.length ? blocks[0].end : 0;
    for (let i = 1; i < blocks.length; i += 1) {
      const minutes = blocks[i].start - lastEnd;
      if (minutes >= WAIT_THRESHOLD) {
        waits.push({ left: pct(lastEnd), width: pct(blocks[i].start) - pct(lastEnd), minutes });
      }
      lastEnd = Math.max(lastEnd, blocks[i].end);
    }
    return {
      day,
      label: WEEK_SHAPE_DAY_LABELS[day],
      blocks: blocks.map(b => ({ left: pct(b.start), width: pct(b.end) - pct(b.start) })),
      waits,
      longest: waits.reduce((most, w) => Math.max(most, w.minutes), 0),
    };
  }).filter(d => d.blocks.length);
  const hours: number[] = [];
  for (let m = from; m <= to; m += 60) hours.push(m);
  return { from, to, days, hours };
}

/** The longest wait between two classes on the same day, in minutes (0 when none reaches the threshold). */
export function longestWaitMinutes(rows: any[]): number {
  const shape = professorWeekShape(rows);
  return shape ? shape.days.reduce((most, day) => Math.max(most, day.longest), 0) : 0;
}
