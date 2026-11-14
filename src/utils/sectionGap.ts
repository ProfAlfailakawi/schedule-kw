/**
 * ── شعبٌ يطلبها الطلبة في «مساري» ─────────────────────────────────────────────
 *
 * رغبات الطلبة (استبيانٌ + «مساري») مقسومةً على سعة الشعبة: إشارةٌ مستقلة، اختيارية، لا تمنع ولا تكتب.
 * تخطيطُ الشعب نفسه (تقرير التسجيل SWRDASH) في src/utils/sectionPlan.ts ولا يختلط بهذا.
 * نقيةٌ لا تقرأ ولا تكتب؛ يقرؤها شريط الاعتماد.
 */

export interface GapCourse { id: number; code: string; name: string; capacity: number; existing: number; students: number }
export interface GapItem {
  id: number; code: string; name: string;
  existing: number; required: number; extra: number;
  basis: "students";
  /** عدد الطلبة الذي بُني عليه المطلوب. */
  demand: number;
}

const byNeed = (a: GapItem, b: GapItem) => b.extra - a.extra || b.demand - a.demand || a.code.localeCompare(b.code, "en");

/** من رغبات الطلبة وحدها: ⌈الطلبة ÷ السعة⌉. سعةٌ مجهولة أو طلبٌ صفر ← لا اقتراح. */
export function studentGaps(courses: readonly GapCourse[]): GapItem[] {
  const items: GapItem[] = [];
  for (const course of courses) {
    if (!(course.capacity > 0) || !(course.students > 0)) continue;
    const required = Math.ceil(course.students / course.capacity);
    const extra = required - course.existing;
    if (extra > 0) items.push({ id: course.id, code: course.code, name: course.name, existing: course.existing, required, extra, basis: "students", demand: course.students });
  }
  return items.sort(byNeed);
}
