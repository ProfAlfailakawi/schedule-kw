/**
 * ما تقوله صحائفُ القسم عن اجتماع مقررين، مقروءاً من قواعدها المعتمدة مرةً واحدة:
 *   • المقرنات (`coreq`): أزواجٌ [أ، ب] بالاتجاهين مرةً واحدة، من الصحيفة الفعّالة أولاً؛ فإن لم توجد فالسابقةُ الجارية.
 *   • مجموعاتُ المستوى ومجموعاتُ «تفتح»: من كل صحيفةٍ جارية على حدة بموانع سلسلتها، فالسابقةُ ما زال طلابها يسجّلون (src/utils/planPeers.ts).
 * المسوّداتُ والمؤرشفة لا تُقرأ. مخبَّأةٌ ثلاثين ثانية: يقرؤها فحصُ «موعد» ومخطّطُ «في الوقت نفسه» دون ثقلٍ على كل ضغطة.
 */
import { Repository } from "../../db/repository";
import { levelGroupsOfPlans, unlockGroupsOfPlans, type LevelGroup, type UnlockGroup } from "../../utils/planPeers";

const TTL_MS = 30_000;

export interface SectionPlanFacts { pairs: number[][]; levelGroups: LevelGroup[]; unlockGroups: UnlockGroup[] }
const NO_FACTS: SectionPlanFacts = { pairs: [], levelGroups: [], unlockGroups: [] };

/* المفتاحُ يحمل صندوقَ الديمو: رقمُ القسم 1 في الديمو غيرُه في الجامعة، والذاكرةُ واحدةٌ في العملية. */
const cache = new Map<string, { at: number; value: Promise<SectionPlanFacts> }>();
export function forgetCoreqPairs(): void { cache.clear(); }

async function read(sectionId: number): Promise<SectionPlanFacts> {
  const plans = (await Repository.getCurriculumPlans(sectionId).catch(() => [])).filter(plan => !plan.virtual && plan.status !== "archived");
  const sets = await Promise.all(plans.map(async plan => ({ plan, set: await Repository.getRuleSet(plan.id).catch(() => undefined) })));
  const hasActive = plans.some(plan => plan.status === "active");
  const seen = new Set<string>();
  const pairs: number[][] = [];
  for (const { plan, set } of sets) {
    if (hasActive && plan.status !== "active") continue;
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
  const ruleSets = sets.flatMap(({ set }) => (set ? [set] : []));
  const courses = await Repository.getCoursesBySection(sectionId).catch(() => []);
  const names = new Map<number, string>(courses.map(course => [Number(course.AdCourseId), String(course.CourseName || "")] as [number, string]));
  /* مقررٌ تالٍ يملكه قسمٌ آخر: اسمُه يُجلب بمعرّفه، وإلا سقطت مجموعتُه بصمت. */
  const nextIds = ruleSets.flatMap(set => set.rules.filter(rule => (rule.prereq?.all?.length || 0) > 1).map(rule => Number(rule.courseId)));
  await Promise.all([...new Set(nextIds)].filter(id => !names.get(id)).map(async id => {
    const name = (await Repository.getCourseById(id).catch(() => undefined))?.CourseName;
    if (name) names.set(id, String(name));
  }));
  return { pairs, levelGroups: levelGroupsOfPlans(ruleSets), unlockGroups: unlockGroupsOfPlans(ruleSets, id => names.get(id) || "") };
}

export function sectionPlanFacts(sectionId: number): Promise<SectionPlanFacts> {
  const id = Number(sectionId || 0);
  if (!id) return Promise.resolve(NO_FACTS);
  const key = `${Repository.currentDemoSessionId()}|${id}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = read(id).catch(() => NO_FACTS);
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function coreqPairsOfSection(sectionId: number): Promise<number[][]> {
  return sectionPlanFacts(sectionId).then(facts => facts.pairs);
}
