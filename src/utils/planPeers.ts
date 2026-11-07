/**
 * ── أقرانُ المقرر من الصحيفة: من يأخذهما الطالبُ معاً؟ ─────────────────────────
 *
 * لا تخمينَ من رقم المقرر: علاقتان تُقرآن من قواعد صحيفةٍ واحدة، ولا تُقارَن صحيفتان أبداً.
 *   • نفسُ المستوى: إجباريان بالمستوى الرقمي نفسه في الصحيفة نفسها.
 *   • «تفتح»: مسبقان معاً لمقررٍ تالٍ (`prereq.all`)، فمن يأخذهما معاً يفتحه.
 *     البدائلُ (`anyOf`) ليست أقراناً، والبوّاباتُ الجماعية (مشروع التخرج والتدريب الميداني) تُهمل.
 * نقصُ البيانات صمت: مقررٌ بلا قاعدة أو بلا مستوى لا قرينَ له.
 * ومقررٌ مسبقٌ لآخر، مباشرةً أو عبر سلسلة، لا يُقارن به: الطالبُ لا يأخذهما معاً أبداً.
 *
 * ملفٌّ خالص بلا React ولا شبكة؛ يكتبه الخادم ويقرؤه المتصفح. يُختبر في tests/plan-peers-audit.ts.
 */

/** ما زاد عن هذا العدد من المسبقات بوّابةٌ جماعية لا تُلزم طالباً بجمع مقررين. */
export const MAX_UNLOCK_PREREQS = 5;

export interface PlanRuleLite {
  courseId: number;
  level?: number;
  kind?: string;
  prereq?: { all?: readonly number[]; anyOf?: ReadonlyArray<readonly number[]> };
}
export interface PlanRulesLite { rules?: readonly PlanRuleLite[] }

export interface UnlockGroup {
  /** المقررُ التالي الذي يفتحه اجتيازُ هذه المقررات. */
  nextCourseId: number;
  nextCourseName: string;
  courseIds: number[];
}

export interface UnlockLink {
  /** المقرراتُ التالية بالأسماء المختصرة، أقربُها أولاً. */
  names: string[];
  /** رتبةُ أقربها: تجمع صفوفَه في مكانٍ واحد من الورقة. */
  rank: number;
}

const idOf = (value: unknown) => Number(value) || 0;

/** كلُّ زوجٍ [أصغر، أكبر] أحدُهما مسبقٌ للآخر في صحيفةٍ واحدة، مباشرةً أو عبر سلسلة. البدائلُ مسبقاتٌ أيضاً. */
export function prereqChainPairs(plans: readonly PlanRulesLite[]): number[][] {
  const seen = new Map<string, number[]>();
  for (const plan of plans) {
    const direct = new Map<number, number[]>();
    for (const rule of plan.rules || []) {
      const before = [...(rule.prereq?.all || []), ...(rule.prereq?.anyOf || []).flat()].map(idOf).filter(Boolean);
      if (idOf(rule.courseId) && before.length) direct.set(idOf(rule.courseId), before);
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
  }
  return [...seen.values()];
}

const chainTest = (chain: ReadonlyArray<readonly number[]>) => {
  const keys = new Set(chain.map(pair => `${pair[0]}|${pair[1]}`));
  return (a: number, b: number) => keys.has(`${Math.min(a, b)}|${Math.max(a, b)}`);
};

/** مقرراتُ كل مستوى في كل صحيفة: مجموعةٌ لكل (صحيفة، مستوى) فيها مقرران إجباريان على الأقل. */
export function levelGroupsOfPlans(plans: readonly PlanRulesLite[]): number[][] {
  const groups: number[][] = [];
  for (const plan of plans) {
    const byLevel = new Map<number, Set<number>>();
    for (const rule of plan.rules || []) {
      const level = Number(rule.level), id = idOf(rule.courseId);
      if (rule.kind !== "compulsory" || !id || !(level > 0)) continue;
      byLevel.set(level, (byLevel.get(level) || new Set<number>()).add(id));
    }
    for (const ids of byLevel.values()) if (ids.size > 1) groups.push([...ids]);
  }
  return groups;
}

/**
 * مجموعاتُ «تفتح»، الأقربُ أولاً: الأقلُّ مسبقاتٍ ثم الأدنى مستوى.
 * عضوُ المجموعة إجباريٌّ أو اختياريٌّ له قاعدةٌ في الصحيفة نفسها؛ متطلبُ الجامعة والكلية لا يدخلان.
 */
export function unlockGroupsOfPlans(plans: readonly PlanRulesLite[], nameOf: (courseId: number) => string): UnlockGroup[] {
  const found: Array<UnlockGroup & { size: number; level: number }> = [];
  for (const plan of plans) {
    const rules = plan.rules || [];
    const kindOf = new Map(rules.map(rule => [idOf(rule.courseId), rule.kind]));
    for (const rule of rules) {
      const all = [...new Set((rule.prereq?.all || []).map(idOf).filter(Boolean))];
      if (all.length < 2 || all.length > MAX_UNLOCK_PREREQS) continue;
      const courseIds = all.filter(id => kindOf.get(id) === "compulsory" || kindOf.get(id) === "elective");
      const nextCourseId = idOf(rule.courseId), nextCourseName = nameOf(nextCourseId);
      if (courseIds.length < 2 || !nextCourseName) continue;
      found.push({ nextCourseId, nextCourseName, courseIds, size: all.length, level: Number(rule.level) || 0 });
    }
  }
  return found
    .sort((a, b) => a.size - b.size || a.level - b.level || a.nextCourseId - b.nextCourseId)
    .map(({ nextCourseId, nextCourseName, courseIds }) => ({ nextCourseId, nextCourseName, courseIds }));
}

/** هل جمعتهما صحيفةٌ واحدة في مجموعة مستوى؟ المقررُ ليس قرينَ نفسه. */
export function sameLevelLookup(groups: ReadonlyArray<readonly number[]>, chain: ReadonlyArray<readonly number[]> = []): (a: number, b: number) => boolean {
  const sets = groups.map(group => new Set(group)), chained = chainTest(chain);
  return (a, b) => a !== b && !chained(a, b) && sets.some(set => set.has(a) && set.has(b));
}

/** الاسمُ المختصر للمقرر التالي: «تصميم وإنتاج المجسمات والعرائس» ← «المجسمات والعرائس». */
export function shortCourseName(name: string): string {
  return String(name || "").trim().replace(/^تصميم\s+وإنتاج\s+/, "");
}

/** ما يفتحه المقرران معاً، الأقربُ أولاً. */
export function unlockLookup(groups: readonly UnlockGroup[], chain: ReadonlyArray<readonly number[]> = []): (a: number, b: number) => UnlockLink | undefined {
  const sets = groups.map(group => new Set(group.courseIds)), chained = chainTest(chain);
  return (a, b) => {
    if (a === b || chained(a, b)) return undefined;
    const hits = groups.flatMap((group, rank) => (sets[rank].has(a) && sets[rank].has(b) ? [{ rank, id: group.nextCourseId, name: shortCourseName(group.nextCourseName) }] : []));
    const names = [...new Map(hits.map(hit => [hit.id, hit.name])).values()];
    return hits.length ? { names, rank: hits[0].rank } : undefined;
  };
}
