/**
 * ── كم منتدباً نحتاج؟ — أرقامٌ فقط ──────────────────────────────────────────────
 *
 * أساتذة القسم مكتملو النصاب حين يُنزَّل الجدول، فكلُّ شعبةٍ زائدة، وكلُّ شعبةٍ بلا أستاذٍ حقيقي
 * («هيئة تدريسية» أو فارغة)، تُحسب على المنتدبين. المنتدب يأخذ شعبتين بحدٍّ أقصى، من مقررٍ أو أكثر.
 * منتدبٌ موجودٌ في الجدول وعنده شعبةٌ واحدة يسدّ مكاناً فارغاً قبل أن نطلب جديداً.
 * «درّسه سابقاً ولا يدرّسه الآن» يُعرض عدداً ولا يُنقص شيئاً: هو مكمّلٌ نصابَه بغيره.
 * نقيةٌ لا تقرأ ولا تكتب، ولا يخرج منها اسم.
 */
import type { GapItem } from "./sectionGap";

export const VISITOR_MAX_SECTIONS = 2;

/** ما يعرفه الخادمُ عن مقرر: عدداً لا أسماء. */
export interface CourseStaffing {
  /** أساتذتنا (غير المنتدبين) الذين يدرّسونه هذا الفصل. */
  ours: number;
  /** شعبٌ هذا الفصل عند أحدهم. */
  covered: number;
  /** شعبٌ بلا أستاذٍ حقيقي: «هيئة تدريسية» أو فارغ. */
  unassigned: number;
  /** شعبٌ عند منتدبٍ موجودٍ في الجدول. */
  withVisitors: number;
  /** درّسوه في أي فصلٍ منذ ٢٠١٦، وعلى رأس عملهم، ولا يدرّسونه هذا الفصل. */
  returnable: number;
}

export interface VisitingNeedRow { id: number; staffing: CourseStaffing; extra: number; uncovered: number; visitors: number }
export interface VisitingNeedTotal { rows: VisitingNeedRow[]; sections: number; freeSlots: number; visitors: number }

/** شعبٌ تنتظر منتدباً في مقررٍ واحد: الزيادة + ما بلا أستاذ. */
export const uncoveredSections = (extra: number, staffing: CourseStaffing) => Math.max(0, extra) + Math.max(0, staffing.unassigned);

export const visitorsFor = (sections: number) => Math.ceil(Math.max(0, sections) / VISITOR_MAX_SECTIONS);

const empty = (): CourseStaffing => ({ ours: 0, covered: 0, unassigned: 0, withVisitors: 0, returnable: 0 });

/**
 * مقرراتُ القائمة كلُّها معاً: المجموع يجمع الشعب لا أرقام البطاقات (منتدبٌ واحد قد يأخذ شعبةً من مقررين)،
 * ثم يخصم الأماكن الفارغة عند المنتدبين الحاليين ويقسم على الحدّ الأقصى.
 */
export function visitingNeed(items: readonly GapItem[], staffing: Readonly<Record<string, CourseStaffing>>, freeSlots: number): VisitingNeedTotal {
  const rows = items.map(item => {
    const s = staffing[String(item.id)] || empty();
    const uncovered = uncoveredSections(item.extra, s);
    return { id: item.id, staffing: s, extra: item.extra, uncovered, visitors: visitorsFor(uncovered) };
  });
  const sections = rows.reduce((sum, row) => sum + row.uncovered, 0);
  const free = Math.max(0, Math.floor(freeSlots) || 0);
  return { rows, sections, freeSlots: free, visitors: visitorsFor(sections - free) };
}

/** أمكنةُ المنتدبين الفارغة: لكل منتدبٍ في الجدول ما بقي من الحدّ الأقصى. `loads`: شعبُ كل منتدبٍ هذا الفصل في كل الأقسام. */
export function visitorFreeSlots(loads: Iterable<number>): number {
  let free = 0;
  for (const load of loads) free += Math.max(0, VISITOR_MAX_SECTIONS - (Number(load) || 0));
  return free;
}

/**
 * الخادم: من صفوف الفصل والتاريخ لمقررٍ واحد إلى أعداده. `isOurs(id)`: أستاذٌ حقيقي (لا منتدب ولا «هيئة تدريسية»)،
 * `active(id)`: على رأس عمله. صفُّ التاريخ يسأل `visitingAt(id, termId)` فمن كان منتدباً يومها لا يُحسب لنا.
 */
export function staffCourse(
  rowsNow: ReadonlyArray<{ AdInstructorId?: number; SCode?: unknown }>,
  rowsPast: ReadonlyArray<{ AdInstructorId?: number; AdTermId?: number }>,
  isOurs: (id: number) => boolean, isVisiting: (id: number) => boolean, isPlaceholder: (id: number) => boolean, active: (id: number) => boolean,
  visitingAt: (id: number, termId: number) => boolean,
): CourseStaffing {
  const bySection = new Map<string, Set<number>>();
  for (const row of rowsNow) {
    const key = String(row.SCode ?? "");
    if (!bySection.has(key)) bySection.set(key, new Set());
    const id = Number(row.AdInstructorId || 0);
    if (id) bySection.get(key)!.add(id);
  }
  const ours = new Set<number>();
  let covered = 0, unassigned = 0, withVisitors = 0;
  for (const ids of bySection.values()) {
    const real = [...ids].filter(id => !isPlaceholder(id));
    const mine = real.filter(isOurs);
    if (mine.length) { covered += 1; mine.forEach(id => ours.add(id)); }
    else if (real.some(isVisiting)) withVisitors += 1;
    else unassigned += 1;
  }
  const back = new Set<number>();
  for (const row of rowsPast) {
    const id = Number(row.AdInstructorId || 0);
    if (!id || ours.has(id) || back.has(id) || isPlaceholder(id) || !active(id)) continue;
    if (isVisiting(id) || visitingAt(id, Number(row.AdTermId || 0))) continue;
    back.add(id);
  }
  return { ours: ours.size, covered, unassigned, withVisitors, returnable: back.size };
}
