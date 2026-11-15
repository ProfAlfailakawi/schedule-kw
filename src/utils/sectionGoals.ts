import type { FSchedule } from "../types";
import { SCHEDULE_DAYS, timeToMinutes, type DayKey } from "./scheduleIntelligence";

/**
 * ── أهداف «نزّل الشعب» ──────────────────────────────────────────────────────────
 * الهدف لا يغيّر قاعدةً واحدة: التعارض واللائحة والأنصبة وسعة القاعات تُفحص كما كانت. كل ما يفعله أنه يعيد
 * ترتيب «من يُجرَّب أولاً» داخل المحرّك الأول-ملاءمةً نفسه، فيختلف الناتج حيث يوجد أكثر من حلٍّ مشروع.
 * «متوازن» هو السلوك الأصلي حرفاً بحرف. الأسماء والأيقونات من آلة الزمن (PHILOSOPHY) للاتساق.
 */
export type SectionGoal = "balanced" | "teachers" | "students" | "rooms";
export const SECTION_GOALS: ReadonlyArray<{ id: SectionGoal; title: string; icon: "scale" | "teachers" | "students" | "rooms" }> = [
  { id: "balanced", title: "متوازن", icon: "scale" },
  { id: "teachers", title: "راحة الأساتذة", icon: "teachers" },
  { id: "students", title: "الطلبة أولاً", icon: "students" },
  { id: "rooms", title: "قاعات أقل", icon: "rooms" },
];
export const isSectionGoal = (value: unknown): value is SectionGoal => SECTION_GOALS.some(goal => goal.id === value);

const MID_MORNING = 10 * 60;
const GAP_BUCKET = 30;

export interface OptionContext { dayRows: (day: DayKey) => Array<{ from: number; to: number }> }
interface Option { day: DayKey; at: number; dayLength: number }

/** أصغر فراغٍ بين المحاضرة المقترحة وأقرب محاضرةٍ لدفعتها في اليوم نفسه؛ بلا جار = 0 (لا فراغ يُنشأ). */
const gapTo = (option: Option, neighbours: Array<{ from: number; to: number }>) => {
  let best = Infinity;
  for (const row of neighbours) {
    const gap = row.to <= option.at ? option.at - row.to : row.from >= option.at + option.dayLength ? row.from - (option.at + option.dayLength) : 0;
    best = Math.min(best, gap);
  }
  return Number.isFinite(best) ? best : 0;
};

/** ترتيبٌ مستقر: الأصل يبقى عند التعادل. */
export function orderOptionsFor(goal: SectionGoal, options: Option[], context: OptionContext): Option[] {
  if (goal !== "students") return options;
  const cache = new Map<DayKey, Array<{ from: number; to: number }>>();
  const rows = (day: DayKey) => { if (!cache.has(day)) cache.set(day, context.dayRows(day)); return cache.get(day)!; };
  return options.map((option, index) => ({ option, index, gap: Math.min(8, Math.floor(gapTo(option, rows(option.day)) / GAP_BUCKET)), mid: Math.abs(option.at - MID_MORNING) }))
    .sort((a, b) => a.gap - b.gap || a.mid - b.mid || a.index - b.index).map(item => item.option);
}

export function orderTeachersFor(goal: SectionGoal, ids: number[], loadOf: (id: number) => number): number[] {
  if (goal !== "teachers") return ids;
  return ids.map((id, index) => ({ id, index, load: loadOf(id) })).sort((a, b) => a.load - b.load || a.index - b.index).map(item => item.id);
}

export function orderRoomsFor<T extends { key: string; buildingId: string }>(rooms: T[], used: ReadonlyMap<string, number>, buildings: ReadonlySet<string>): T[] {
  return rooms.map((room, index) => ({ room, index, own: used.get(room.key) ? 0 : 1, building: buildings.has(String(room.buildingId)) ? 0 : 1 }))
    .sort((a, b) => a.own - b.own || a.building - b.building || a.index - b.index).map(item => item.room);
}

/* ── مقاييس المقارنة ── */
export interface GoalMetrics {
  /** شعبٌ قابلةٌ للتنزيل مباشرة (بقاعة وأستاذ). */
  placed: number;
  /** شعبٌ بانتظار قاعةٍ أو أستاذ (تُراجَع). */
  pending: number;
  notPlaced: number;
  needed: number;
  /** سبب أكثر ما تعثّر. */
  reasons: Array<{ reason: string; count: number }>;
  rooms: number;
  buildings: number;
  /** أكبر حملٍ بين من أخذ شعباً جديدة ناقص أصغره (بالشعب). */
  teacherSpread: number;
  /** دقائق الفراغ بين المحاضرات المقترحة وبقية مقررات دفعتها في يومها. */
  gapMinutes: number;
  /** تعارضات الدفعة (دائماً صفر: القيد صلب). */
  clashes: number;
  /** رغباتٌ استُجيبت: غير متاحة في هذا الإصدار. */
  wishes: null;
}

export interface MetricPlacement {
  courseId: number; day: string; days?: string[]; start: string; end: string; roomId: string; buildingId: string; instructorId: number; pending?: boolean;
}

export function goalMetrics(
  rows: ReadonlyArray<{ courseId: number; remaining: number; unplaced: number; reason: string; placements: MetricPlacement[] }>,
  week: readonly FSchedule[],
  levelOf: (courseId: number) => number,
): GoalMetrics {
  const all = rows.flatMap(row => row.placements.map(p => ({ ...p, courseId: row.courseId })));
  const direct = all.filter(p => !p.pending);
  const reasons = new Map<string, number>();
  for (const row of rows) if (row.unplaced > 0 && row.reason) reasons.set(row.reason, (reasons.get(row.reason) || 0) + row.unplaced);
  const perTeacher = new Map<number, number>();
  for (const p of direct) if (p.instructorId) perTeacher.set(p.instructorId, (perTeacher.get(p.instructorId) || 0) + 1);
  const termSections = new Map<number, Set<string>>();
  for (const row of week) {
    const id = Number(row.AdInstructorId || 0);
    if (!id || !perTeacher.has(id)) continue;
    if (!termSections.has(id)) termSections.set(id, new Set());
    termSections.get(id)!.add(`${row.AdCourseId}|${row.SCode}`);
  }
  const loads = [...perTeacher.entries()].map(([id, n]) => n + (termSections.get(id)?.size || 0));
  const dayKeys = SCHEDULE_DAYS.map(day => day.key as DayKey);
  const others = (day: string, courseId: number, level: number, self: MetricPlacement) => {
    const spans: Array<{ from: number; to: number }> = [];
    if (level <= 0) return spans;
    for (const row of week) if ((row as any)[day] && Number(row.AdCourseId) !== courseId && levelOf(Number(row.AdCourseId)) === level) spans.push({ from: timeToMinutes(row.fstarttime), to: timeToMinutes(row.fendtime) });
    for (const p of direct) if (p !== self && p.courseId !== courseId && (p.days || [p.day]).includes(day) && levelOf(p.courseId) === level) spans.push({ from: timeToMinutes(p.start), to: timeToMinutes(p.end) });
    return spans;
  };
  let gapMinutes = 0;
  for (const p of direct) {
    const day = (p.days || [p.day])[0];
    if (!dayKeys.includes(day as DayKey)) continue;
    gapMinutes += gapTo({ day: day as DayKey, at: timeToMinutes(p.start), dayLength: timeToMinutes(p.end) - timeToMinutes(p.start) }, others(day, p.courseId, levelOf(p.courseId), p));
  }
  const roomKeys = new Set(direct.map(p => p.roomId).filter(Boolean));
  return {
    placed: direct.length, pending: all.length - direct.length,
    notPlaced: rows.reduce((sum, row) => sum + row.unplaced, 0), needed: rows.reduce((sum, row) => sum + row.remaining, 0),
    reasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    rooms: roomKeys.size, buildings: new Set(direct.map(p => p.buildingId).filter(Boolean)).size,
    teacherSpread: loads.length ? Math.max(...loads) - Math.min(...loads) : 0, gapMinutes, clashes: 0, wishes: null,
  };
}

/** أفضل هدفٍ لكل مقياس (الأقل أفضل إلا المنزَّل: الأعلى). تعادلٌ كاملٌ بين الكل لا يُنجَّم. */
export type MetricKey = "placed" | "rooms" | "buildings" | "teacherSpread" | "gapMinutes";
export function bestPerMetric(list: ReadonlyArray<{ goal: SectionGoal; metrics: GoalMetrics }>): Record<MetricKey, SectionGoal[]> {
  const out = {} as Record<MetricKey, SectionGoal[]>;
  (["placed", "rooms", "buildings", "teacherSpread", "gapMinutes"] as MetricKey[]).forEach(key => {
    const values = list.map(item => item.metrics[key] as number);
    const best = key === "placed" ? Math.max(...values) : Math.min(...values);
    out[key] = values.every(value => value === best) ? [] : list.filter(item => item.metrics[key] === best).map(item => item.goal);
  });
  return out;
}
