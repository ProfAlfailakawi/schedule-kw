import { suggestSectionCount, type SimilarTermHistory } from "./sectionCountSuggestion";

/**
 * ── الشعب مقابل الطلب ────────────────────────────────────────────────────────────────
 *
 * سطرٌ واحد لكل مقرر ينقصه شعب: «عندكم ٥ والمطلوب ٧». مصدران منفصلان لا يختلطان:
 *   ١) planGaps — التخطيط: ما اختاره القسم بيده («المختار»)، أو ما يقترحه حسابُ «تخطيط الشعب» من كشف المتبقي المرفوع وتاريخ الفصول.
 *      «مساري» لا شأن له به: لا يدخل في التخطيط ولا في نتيجة رفع الكشف.
 *   ٢) studentGaps — رغبات الطلبة (استبيانٌ + «مساري») مقسومةً على سعة الشعبة: إشارةٌ مستقلة.
 * نقيةٌ لا تقرأ ولا تكتب؛ يقرأها شريط الاعتماد بعد جلب المصدرين.
 */

export interface GapCourse { id: number; code: string; name: string; capacity: number; existing: number; students: number }
export interface GapPlan {
  remaining: Record<string, number>;
  accepted: Record<string, number>;
  history: Record<string, SimilarTermHistory[]>;
}
export interface GapItem {
  id: number; code: string; name: string;
  existing: number; required: number; extra: number;
  /** Present only when the current scheduled count exceeds the plan. */
  surplus?: number;
  /** Suggested closure is a review, not an authorized cancellation. */
  closureSource?: "chosen" | "history";
  /** Two opposing estimates for the same course. Review-only; never an action. */
  conflict?: { openingRequired: number; reportRequired: number };
  basis: "plan" | "students";
  /** الرقم الذي بُني عليه المطلوب: المتبقي من الكشف، أو عدد الطلبة. */
  demand: number;
}

const known = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const byNeed = (a: GapItem, b: GapItem) => b.extra - a.extra || b.demand - a.demand || a.code.localeCompare(b.code, "en");

/** من التخطيط وحده. بلا تخطيط (لا مختار ولا كشف) لا شيء. */
export function planGaps(courses: readonly GapCourse[], plan: GapPlan | null): GapItem[] {
  return planComparisons(courses, plan).filter(item => item.extra > 0);
}

/** Review-only section reductions use the SAME target as the opening proposal.
 * An explicit departmental choice takes priority; otherwise the historical
 * same-season suggestion is used only when comparable history exists.
 *
 * The registrar not-passed figure is an upper planning-demand reference, not
 * evidence that currently enrolled students fit after cancellation.
 * Never suggest reducing to fewer seats than the stated demand, and never
 * automatically close timetable sections. Verify live registrations first.
 */
export function planSurpluses(courses: readonly GapCourse[], plan: GapPlan | null): GapItem[] {
  if (!plan) return [];
  const comparisons = planComparisons(courses, plan);
  const byCourse = new Map(courses.map(course => [course.id, course]));
  const results: GapItem[] = [];
  for (const item of comparisons) {
    if (item.extra >= 0) continue;
    const course = byCourse.get(item.id);
    if (!course || course.existing <= 0 || !(course.capacity > 0)) continue;
    const key = String(course.id);
    const demand = plan.remaining[key];
    const manuallyChosen = known(plan.accepted[key]);
    const hasSimilarHistory = (plan.history[key] || []).some(term => term.similar !== false && term.sections > 0);
    // An absent/zero estimate without an explicit departmental decision is
    // not sufficient evidence that existing sections should be cancelled.
    if (!manuallyChosen && (!hasSimilarHistory || !known(demand) || demand <= 0)) continue;
    // A smaller section count must still have enough nominal seats for the
    // current planning-demand figure; otherwise its reduction is contradictory.
    if (known(demand) && demand > item.required * course.capacity) continue;
    results.push({ ...item, extra: 0, surplus: course.existing - item.required,
      closureSource: manuallyChosen ? "chosen" : "history" });
  }
  return results.sort((a, b) => (b.surplus || 0) - (a.surplus || 0) || a.code.localeCompare(b.code, "en"));
}

/** Combine the independent opening and current-term surplus signals into one
 * non-contradictory planning list. A simultaneous opening and reduction becomes
 * one neutral conflict review; neither underlying calculation is changed.
 */
export function reconcilePlanAdjustments(openings: readonly GapItem[], surpluses: readonly GapItem[]): GapItem[] {
  const byCourse = new Map<number, GapItem>();
  for (const item of openings) {
    if (!byCourse.has(item.id)) byCourse.set(item.id, item);
  }
  for (const item of surpluses) {
    const opened = byCourse.get(item.id);
    if (opened?.extra && opened.extra > 0 && (item.surplus || 0) > 0) {
      byCourse.set(item.id, {
        id: item.id, code: item.code, name: item.name,
        existing: item.existing, required: item.existing, extra: 0,
        basis: "plan", demand: item.demand,
        conflict: { openingRequired: opened.required, reportRequired: item.required },
      });
    } else if (!opened) {
      byCourse.set(item.id, item);
    }
  }
  return [...byCourse.values()];
}

function planComparisons(courses: readonly GapCourse[], plan: GapPlan | null): GapItem[] {
  const items: GapItem[] = [];
  if (!plan) return items;
  for (const course of courses) {
    const key = String(course.id);
    const chosen = plan.accepted[key];
    const left = plan.remaining[key];
    let required: number | null = null, demand = known(left) ? left : 0;
    if (known(chosen)) required = Math.max(0, Math.floor(chosen));
    else if (known(left)) {
      const suggestion = suggestSectionCount(left, course.capacity, plan.history[key] || []);
      if (known(suggestion.suggested)) required = suggestion.suggested;
    }
    if (required === null) continue;
    const extra = required - course.existing;
    if (extra !== 0) items.push({ id: course.id, code: course.code, name: course.name, existing: course.existing, required, extra, basis: "plan", demand });
  }
  return items.sort(byNeed);
}

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
