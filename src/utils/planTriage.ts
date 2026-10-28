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
export interface PlanDecision { state: "done" | "ignored"; reason: string; at: string; signature: string; byUserId?: number; byName?: string }

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
   On the server, shared by everyone in the scope (term · college · department):
   GET/PUT /api/schedules/section-gap/decisions, same permission as planning.
   localStorage is only the offline fallback: a mirror of the last server read
   plus the writes that could not reach the server yet, flushed when the browser
   is back online. A decision is tied to the numbers it was made on
   (planItemSignature), so it can never silence a changed situation. */
const storageKey = (scope: string) => `plan-triage:${scope}`;
const pendingKey = (scope: string) => `plan-triage-pending:${scope}`;
export function readPlanDecisions(scope: string): Record<string, PlanDecision> {
  try { const raw = window.localStorage.getItem(storageKey(scope)); return raw ? JSON.parse(raw) || {} : {}; } catch { return {}; }
}
export function writePlanDecisions(scope: string, decisions: Record<string, PlanDecision>) {
  try { window.localStorage.setItem(storageKey(scope), JSON.stringify(decisions)); } catch { /* private mode: the decision lasts this view only */ }
}
type Pending = Record<string, PlanDecision | null>;
const readPending = (scope: string): Pending => { try { return JSON.parse(window.localStorage.getItem(pendingKey(scope)) || "{}") || {}; } catch { return {}; } };
const writePending = (scope: string, pending: Pending) => {
  try { if (Object.keys(pending).length) window.localStorage.setItem(pendingKey(scope), JSON.stringify(pending)); else window.localStorage.removeItem(pendingKey(scope)); } catch { /* ignore */ }
};
const [scopeCollege, scopeSection, scopeTerm] = [0, 1, 2];
const parts = (scope: string) => { const p = scope.split(":").map(Number); return { collegeId: p[scopeCollege], sectionId: p[scopeSection], termId: p[scopeTerm] }; };

/** Server rows → the map the shelves read (keyed by course id). */
export function decisionsFromRows(rows: Array<PlanDecision & { courseId: number }>): Record<string, PlanDecision> {
  const out: Record<string, PlanDecision> = {};
  for (const row of rows || []) {
    if (!row || !Number(row.courseId)) continue;
    out[String(row.courseId)] = { state: row.state, reason: row.reason || "", at: row.at, signature: row.signature, byUserId: row.byUserId, byName: row.byName };
  }
  return out;
}

/** The shared decisions of a scope; offline → the last mirror with pending writes on top. */
export async function loadPlanDecisions(scope: string): Promise<{ decisions: Record<string, PlanDecision>; offline: boolean }> {
  const { collegeId, sectionId, termId } = parts(scope);
  try {
    const response = await fetch(`/api/schedules/section-gap/decisions?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { credentials: "include" });
    if (!response.ok) throw new Error(String(response.status));
    const body = await response.json();
    const decisions = decisionsFromRows(Array.isArray(body?.decisions) ? body.decisions : []);
    writePlanDecisions(scope, decisions);
    const pending = readPending(scope);
    for (const [id, value] of Object.entries(pending)) { if (value) decisions[id] = value; else delete decisions[id]; }
    return { decisions, offline: false };
  } catch {
    const decisions = readPlanDecisions(scope);
    for (const [id, value] of Object.entries(readPending(scope))) { if (value) decisions[id] = value; else delete decisions[id]; }
    return { decisions, offline: true };
  }
}

/** Write one decision (null = reopen). Returns the stored decision, or queues it when offline. */
export async function savePlanDecision(scope: string, courseId: number, decision: PlanDecision | null): Promise<{ decision: PlanDecision | null; queued: boolean }> {
  const { collegeId, sectionId, termId } = parts(scope);
  try {
    const response = await fetch("/api/schedules/section-gap/decisions", {
      method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collegeId, sectionId, termId, courseId, decision: decision ? { state: decision.state, reason: decision.reason, signature: decision.signature } : null }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw Object.assign(new Error(String(body?.error || response.status)), { status: response.status });
    }
    const body = await response.json();
    const pending = readPending(scope); delete pending[String(courseId)]; writePending(scope, pending);
    return { decision: body?.decision ? decisionsFromRows([body.decision])[String(courseId)] : null, queued: false };
  } catch (error: any) {
    /* Only a lost connection is queued; a refusal (400/403) is the answer. */
    if (error?.status) throw error;
    const pending = readPending(scope); pending[String(courseId)] = decision; writePending(scope, pending);
    return { decision, queued: true };
  }
}

/** Replay the offline queue; returns how many reached the server. */
export async function flushPlanDecisions(scope: string): Promise<number> {
  let sent = 0;
  for (const [id, value] of Object.entries(readPending(scope))) {
    try { const result = await savePlanDecision(scope, Number(id), value); if (!result.queued) sent++; else break; } catch { const pending = readPending(scope); delete pending[id]; writePending(scope, pending); }
  }
  return sent;
}
