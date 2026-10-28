/**
 * حالةُ طرح المقررات للفصل كلِّه (C5) — قراءةٌ واحدة بذاكرةٍ قصيرة، يسألها كلُّ محرّك:
 * مساري، والكرت، والوارد، و«افتح شعبة»، وتخطيط الشعب. تُمسح عند كل حفظ.
 */
import { Repository } from "../db/repository";
import { termOfferingStates, type CourseOfferingDoc, type TermOfferingStates } from "../utils/courseOffering";

const cache = new Map<string, { at: number; value: Promise<TermOfferingStates> }>();
const TTL_MS = 20_000;

export function offeringStatesForTerm(termId: number): Promise<TermOfferingStates> {
  const key = `${Repository.currentDemoSessionId()}|${Number(termId)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = Repository.listFeatureDocs<CourseOfferingDoc>("courseOfferingStates")
    .then(docs => termOfferingStates(docs.filter(doc => Number(doc?.AdTermId) === Number(termId))))
    .catch(() => new Map() as TermOfferingStates);
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function forgetOfferingStates(): void { cache.clear(); }
