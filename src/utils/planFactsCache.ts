/**
 * ما تقوله صحائفُ القسم، كما يحفظها المتصفح لشارة «في الوقت نفسه»: جلبةٌ واحدة لكل قسم،
 * تنتهي بثلاثين ثانية كمخبأ الخادم (src/server/core/coreqPairs.ts).
 * الفشلُ لا يُحفظ فيُعاد عند الفتح التالي، والزينةُ لا تكسر شاشة: يعود بلا حقائق.
 * ملفٌّ بلا React لتمحوه شاشةُ الخروج دون سحب الشارة إلى الحزمة الأولى؛ يُختبر في tests/plan-peers-audit.ts.
 */
import type { LevelGroup, UnlockGroup } from "./planPeers";

export interface PlanFacts { pairs: number[][]; levelGroups: LevelGroup[]; unlockGroups: UnlockGroup[] }
export const NO_PLAN_FACTS: PlanFacts = { pairs: [], levelGroups: [], unlockGroups: [] };
export const PLAN_FACTS_TTL_MS = 30_000;

const cache = new Map<number, { at: number; facts: PlanFacts }>();
const pending = new Map<number, Promise<PlanFacts>>();
/* طلبٌ بدأ قبل الخروج ووصل بعده من جلسةٍ أخرى: لا يدخل المخبأ. */
let session = 0;

/** ما حُفظ ولم ينتهِ. */
export function cachedPlanFacts(sectionId: number | undefined): PlanFacts | undefined {
  const hit = sectionId ? cache.get(sectionId) : undefined;
  return hit && Date.now() - hit.at < PLAN_FACTS_TTL_MS ? hit.facts : undefined;
}

export function loadPlanFacts(collegeId: number | undefined, sectionId: number): Promise<PlanFacts> {
  const hit = cachedPlanFacts(sectionId);
  if (hit) return Promise.resolve(hit);
  const running = pending.get(sectionId);
  if (running) return running;
  const started = session;
  const job = fetch(`/api/schedules/coreq-pairs?collegeId=${collegeId || 0}&sectionId=${sectionId}`, { credentials: "include" })
    .then(response => (response.ok ? response.json() : null))
    .then(data => {
      if (!data) return NO_PLAN_FACTS;
      const facts: PlanFacts = {
        pairs: Array.isArray(data.pairs) ? data.pairs : [],
        levelGroups: Array.isArray(data.levelGroups) ? data.levelGroups : [],
        unlockGroups: Array.isArray(data.unlockGroups) ? data.unlockGroups : [],
      };
      if (started === session) cache.set(sectionId, { at: Date.now(), facts });
      return facts;
    })
    .catch(() => NO_PLAN_FACTS)
    .finally(() => { if (started === session) pending.delete(sectionId); });
  pending.set(sectionId, job);
  return job;
}

/** عند الخروج: جهازٌ مشترك، وصندوقُ الديمو لا يُعدي حساباً حقيقياً. */
export function forgetPlanFacts(): void {
  session += 1;
  cache.clear();
  pending.clear();
}
