/**
 * ── أقرانُ المقرر من الصحيفة: من يأخذهما الطالبُ معاً؟ ─────────────────────────
 *
 * لا تخمينَ من رقم المقرر: علاقتان تُقرآن من قواعد صحيفةٍ واحدة، ولا تُقارَن صحيفتان أبداً.
 *   • نفسُ المستوى: إجباريان بالمستوى الرقمي نفسه في الصحيفة نفسها.
 *   • «تفتح»: مسبقان معاً لمقررٍ تالٍ (`prereq.all`)، فمن يأخذهما معاً يفتحه.
 *     البدائلُ (`anyOf`) ليست أقراناً، والبوّاباتُ الجماعية (مشروع التخرج والتدريب الميداني) تُهمل.
 * نقصُ البيانات صمت: مقررٌ بلا قاعدة أو بلا مستوى لا قرينَ له.
 * ومقررٌ مسبقٌ لآخر في الصحيفة نفسها، مباشرةً أو عبر سلسلة، لا يُقارن به: طالبُها لا يأخذهما معاً أبداً.
 * والسلسلةُ حكمُ صحيفتها: كل مجموعة تحمل موانعها (`blocked`)، فصحيفةٌ أخرى تجمعهما بلا سلسلة تُبقي العلاقة.
 *
 * ملفٌّ خالص بلا React ولا شبكة؛ يكتبه الخادم ويقرؤه المتصفح. يُختبر في tests/plan-peers-audit.ts.
 */

import { normalizeLevel } from "./curriculumRules";

/** ما زاد عن هذا العدد من المسبقات بوّابةٌ جماعية لا تُلزم طالباً بجمع مقررين. */
export const MAX_UNLOCK_PREREQS = 5;

export interface PlanRuleLite {
  courseId: number;
  level?: number;
  kind?: string;
  prereq?: { all?: readonly number[]; anyOf?: ReadonlyArray<readonly number[]> };
}
export interface PlanRulesLite { rules?: readonly PlanRuleLite[] }

/** مقرراتُ مستوى واحد في صحيفة واحدة. */
export interface LevelGroup {
  courseIds: number[];
  /** أزواجٌ من أعضائها بينهما سلسلةُ مسبقات في صحيفتها (prereqChainPairs). */
  blocked: number[][];
}

export interface UnlockGroup {
  /** المقررُ التالي الذي يفتحه اجتيازُ هذه المقررات. */
  nextCourseId: number;
  nextCourseName: string;
  courseIds: number[];
  blocked: number[][];
}

export interface UnlockLink {
  /** المقرراتُ التالية بالأسماء المختصرة، أقربُها أولاً. */
  names: string[];
  /** رتبةُ أقربها: تجمع صفوفَه في مكانٍ واحد من الورقة. */
  rank: number;
}

const idOf = (value: unknown) => Number(value) || 0;

/** كلُّ زوجٍ [أصغر، أكبر] أحدُهما مسبقٌ للآخر في هذه الصحيفة، مباشرةً أو عبر سلسلة. البدائلُ مسبقاتٌ أيضاً، وقواعدُ المقرر المكررة تُجمع. */
export function prereqChainPairs(plan: PlanRulesLite): number[][] {
  const seen = new Map<string, number[]>();
  const direct = new Map<number, number[]>();
  for (const rule of plan.rules || []) {
    const before = [...(rule.prereq?.all || []), ...(rule.prereq?.anyOf || []).flat()].map(idOf).filter(Boolean);
    if (idOf(rule.courseId) && before.length) direct.set(idOf(rule.courseId), [...(direct.get(idOf(rule.courseId)) || []), ...before]);
  }
  for (const course of direct.keys()) {
    const visited = new Set<number>([course]), stack = [...(direct.get(course) || [])];
    while (stack.length) {
      const id = stack.pop() as number;
      if (visited.has(id)) continue;
      visited.add(id);
      stack.push(...(direct.get(id) || []));
      const pair = [Math.min(course, id), Math.max(course, id)];
      seen.set(pair.join("|"), pair);
    }
  }
  return [...seen.values()];
}

/** موانعُ مجموعة: أزواجُ سلسلة صحيفتها التي يقع طرفاها فيها. */
const blockedWithin = (chain: ReadonlyArray<readonly number[]>, courseIds: readonly number[]) => {
  const members = new Set(courseIds);
  return chain.filter(([a, b]) => members.has(a) && members.has(b)).map(pair => [...pair]);
};

/* «مانعٌ» غائب في استجابةٍ أقدم من هذا الشكل لا يكسر القراءة. */
const chainTest = (chain: ReadonlyArray<readonly number[]> = []) => {
  const keys = new Set(chain.map(pair => `${pair[0]}|${pair[1]}`));
  return (a: number, b: number) => keys.has(`${Math.min(a, b)}|${Math.max(a, b)}`);
};

/** مقرراتُ كل مستوى في كل صحيفة: مجموعةٌ لكل (صحيفة، مستوى) فيها مقرران إجباريان على الأقل. */
export function levelGroupsOfPlans(plans: readonly PlanRulesLite[]): LevelGroup[] {
  const groups: LevelGroup[] = [];
  for (const plan of plans) {
    const chain = prereqChainPairs(plan);
    const byLevel = new Map<number, Set<number>>();
    for (const rule of plan.rules || []) {
      const level = normalizeLevel(rule.level), id = idOf(rule.courseId);
      if (rule.kind !== "compulsory" || !id || !level) continue;
      byLevel.set(level, (byLevel.get(level) || new Set<number>()).add(id));
    }
    for (const ids of byLevel.values()) if (ids.size > 1) groups.push({ courseIds: [...ids], blocked: blockedWithin(chain, [...ids]) });
  }
  return groups;
}

/**
 * مجموعاتُ «تفتح»، الأقربُ أولاً: الأقلُّ مسبقاتٍ ثم الأدنى مستوى.
 * عضوُ المجموعة إجباريٌّ أو اختياريٌّ له قاعدةٌ في الصحيفة نفسها؛ متطلبُ الجامعة والكلية لا يدخلان.
 * قواعدُ المقرر المكررة: يكفي وصفٌ مؤهِّل في إحداها، كما يقرأ المستوى والسلسلة كلَّ النسخ.
 */
export function unlockGroupsOfPlans(plans: readonly PlanRulesLite[], nameOf: (courseId: number) => string): UnlockGroup[] {
  const found: Array<UnlockGroup & { size: number; level: number }> = [];
  for (const plan of plans) {
    const rules = plan.rules || [];
    const chain = prereqChainPairs(plan);
    const eligible = new Set(rules.filter(rule => rule.kind === "compulsory" || rule.kind === "elective").map(rule => idOf(rule.courseId)));
    for (const rule of rules) {
      const all = [...new Set((rule.prereq?.all || []).map(idOf).filter(Boolean))];
      if (all.length < 2 || all.length > MAX_UNLOCK_PREREQS) continue;
      const courseIds = all.filter(id => eligible.has(id));
      const nextCourseId = idOf(rule.courseId), nextCourseName = nameOf(nextCourseId);
      if (courseIds.length < 2 || !nextCourseName) continue;
      found.push({ nextCourseId, nextCourseName, courseIds, blocked: blockedWithin(chain, courseIds), size: all.length, level: normalizeLevel(rule.level) || 0 });
    }
  }
  return found
    .sort((a, b) => a.size - b.size || a.level - b.level || a.nextCourseId - b.nextCourseId)
    .map(({ nextCourseId, nextCourseName, courseIds, blocked }) => ({ nextCourseId, nextCourseName, courseIds, blocked }));
}

/** هل جمعتهما صحيفةٌ واحدة في مجموعة مستوى بلا سلسلةٍ فيها بينهما؟ المقررُ ليس قرينَ نفسه. */
export function sameLevelLookup(groups: readonly LevelGroup[]): (a: number, b: number) => boolean {
  const sets = groups.map(group => ({ ids: new Set(group.courseIds), chained: chainTest(group.blocked) }));
  return (a, b) => a !== b && sets.some(set => set.ids.has(a) && set.ids.has(b) && !set.chained(a, b));
}

/** الاسمُ المختصر للمقرر التالي: «تصميم وإنتاج المجسمات والعرائس» ← «المجسمات والعرائس». */
export function shortCourseName(name: string): string {
  return String(name || "").trim().replace(/^تصميم\s+وإنتاج\s+/, "");
}

/** ما يفتحه المقرران معاً، الأقربُ أولاً: من كل صحيفةٍ لا سلسلةَ فيها بينهما. */
export function unlockLookup(groups: readonly UnlockGroup[]): (a: number, b: number) => UnlockLink | undefined {
  const sets = groups.map(group => ({ ids: new Set(group.courseIds), chained: chainTest(group.blocked) }));
  return (a, b) => {
    if (a === b) return undefined;
    const hits = groups.flatMap((group, rank) => (sets[rank].ids.has(a) && sets[rank].ids.has(b) && !sets[rank].chained(a, b) ? [{ rank, id: group.nextCourseId, name: shortCourseName(group.nextCourseName) }] : []));
    const names = [...new Map(hits.map(hit => [hit.id, hit.name])).values()];
    return hits.length ? { names, rank: hits[0].rank } : undefined;
  };
}
