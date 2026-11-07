/**
 * مقرناتُ قسمٍ من قواعد صحيفته المعتمدة (`coreq`): أزواجٌ [أ، ب] بالاتجاهين مرةً واحدة.
 * الصحيفةُ الفعّالة أولاً؛ فإن لم توجد فالسابقةُ الجارية. المسوّداتُ والمؤرشفة لا تُقرأ.
 * مخبَّأةٌ ثلاثين ثانية: يقرؤها فحصُ «موعد» ومخطّطُ «في الوقت نفسه» دون ثقلٍ على كل ضغطة.
 */
import { Repository } from "../../db/repository";

const TTL_MS = 30_000;
const cache = new Map<number, { at: number; value: Promise<number[][]> }>();
export function forgetCoreqPairs(): void { cache.clear(); }

async function read(sectionId: number): Promise<number[][]> {
  const plans = (await Repository.getCurriculumPlans(sectionId).catch(() => [])).filter(plan => !plan.virtual && plan.status !== "archived");
  const active = plans.filter(plan => plan.status === "active");
  const chosen = active.length ? active : plans;
  const seen = new Set<string>();
  const pairs: number[][] = [];
  for (const plan of chosen) {
    const set = await Repository.getRuleSet(plan.id).catch(() => undefined);
    for (const rule of set?.rules || []) {
      for (const twin of rule.coreq || []) {
        const a = Number(rule.courseId), b = Number(twin);
        if (!a || !b || a === b) continue;
        const key = `${Math.min(a, b)}|${Math.max(a, b)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push([Math.min(a, b), Math.max(a, b)]);
      }
    }
  }
  return pairs;
}

export function coreqPairsOfSection(sectionId: number): Promise<number[][]> {
  const id = Number(sectionId || 0);
  if (!id) return Promise.resolve([]);
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = read(id).catch(() => [] as number[][]);
  cache.set(id, { at: Date.now(), value });
  return value;
}
