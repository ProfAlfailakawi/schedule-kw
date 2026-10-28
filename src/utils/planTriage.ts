/**
 * ── «التخطيط»: ثلاثة رفوف لا قائمة واحدة (K2) ───────────────────────────────
 *
 * The planning badge listed every course whose section count differs from the
 * plan as one flat, alphabetical list — 27 lines of equal weight, some of them
 * the same course under two catalogue ids. This module sorts them into three
 * shelves, says why each item is on its shelf, and folds what the department
 * already handled out of the live count.
 *
 *   ⛔ عاجل   a course the plan needs that has NO section yet, or two or more
 *            sections missing — students have nowhere to register.
 *   ⚠️ مهم    one section missing, or the plan and the remaining-students
 *            report disagree (review before touching anything).
 *   💡 فرصة   more sections than the plan needs — a reduction to review, never
 *            an automatic closure.
 *
 * Pure: the numbers come from utils/sectionGap.ts (planGaps/planSurpluses/
 * reconcilePlanAdjustments); nothing here recomputes them.
 */
import type { GapItem } from "./sectionGap";

export const FOCUS_COURSE_EVENT = "schedule:focus-course";

export type PlanTier = "urgent" | "important" | "opportunity";
export interface TriagedPlanItem { item: GapItem; tier: PlanTier; reason: string; signature: string }
export interface PlanDecision { state: "done" | "ignored"; reason: string; at: string; signature: string }

/** The numbers an item was decided on: if they change, the decision lapses and the item returns. */
export const planItemSignature = (item: GapItem) =>
  [item.id, item.existing, item.required, item.extra, item.surplus || 0, item.conflict ? `${item.conflict.openingRequired}/${item.conflict.reportRequired}` : ""].join(":");

export function planItemTier(item: GapItem): { tier: PlanTier; reason: string } {
  if (item.conflict) return { tier: "important", reason: "تقديران متعارضان" };
  if ((item.surplus || 0) > 0) return { tier: "opportunity", reason: item.closureCapacityWarning ? "فرق للمراجعة" : "فائض للمراجعة" };
  if (item.existing === 0 && item.extra > 0) return { tier: "urgent", reason: "لا شعبة مطروحة" };
  if (item.extra >= 2) return { tier: "urgent", reason: "ينقص شعبتان فأكثر" };
  return { tier: "important", reason: "ينقص شعبة" };
}

const normCode = (code: unknown) => String(code ?? "").replace(/\s+/g, "").trim();

/**
 * Sort, de-duplicate and fold decisions out.
 * Duplicates: the same course code under two catalogue ids is one course to a
 * reader — the one with the larger change is kept, the other is counted.
 */
export function triagePlanItems(items: readonly GapItem[], decisions: Record<string, PlanDecision> = {}) {
  const byCode = new Map<string, GapItem>();
  let duplicates = 0;
  const weight = (item: GapItem) => Math.abs(item.extra) + (item.surplus || 0) + (item.conflict ? 1 : 0);
  for (const item of items) {
    const key = normCode(item.code) || `id:${item.id}`;
    const prior = byCode.get(key);
    if (prior) {
      duplicates++;
      if (weight(item) > weight(prior)) byCode.set(key, item);
    } else byCode.set(key, item);
  }
  const live: TriagedPlanItem[] = [];
  const handled: Array<TriagedPlanItem & { decision: PlanDecision }> = [];
  for (const item of byCode.values()) {
    const { tier, reason } = planItemTier(item);
    const signature = planItemSignature(item);
    const decision = decisions[String(item.id)];
    const entry = { item, tier, reason, signature };
    if (decision && decision.signature === signature) handled.push({ ...entry, decision });
    else live.push(entry);
  }
  const order: Record<PlanTier, number> = { urgent: 0, important: 1, opportunity: 2 };
  live.sort((a, b) => order[a.tier] - order[b.tier] || weight(b.item) - weight(a.item) || a.item.name.localeCompare(b.item.name, "ar"));
  const count = (tier: PlanTier) => live.filter(entry => entry.tier === tier).length;
  return {
    live, handled, duplicates,
    counts: { urgent: count("urgent"), important: count("important"), opportunity: count("opportunity"), total: live.length },
  };
}

/* ── where a department's decisions live ────────────────────────────────────
   Per browser, per scope. A decision is tied to the numbers it was made on
   (planItemSignature), so it can never silence a changed situation. */
const storageKey = (scope: string) => `plan-triage:${scope}`;
export function readPlanDecisions(scope: string): Record<string, PlanDecision> {
  try { const raw = window.localStorage.getItem(storageKey(scope)); return raw ? JSON.parse(raw) || {} : {}; } catch { return {}; }
}
export function writePlanDecisions(scope: string, decisions: Record<string, PlanDecision>) {
  try { window.localStorage.setItem(storageKey(scope), JSON.stringify(decisions)); } catch { /* private mode: the decision lasts this view only */ }
}
