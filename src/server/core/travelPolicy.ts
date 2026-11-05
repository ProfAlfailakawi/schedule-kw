/**
 * ── سياسةُ التنقّل بين المواقع: قراءةٌ بذاكرةٍ قصيرة ──
 * فاحصُ التعارضات يسأل مع كل حفظ، فلا تُقرأ الوثيقة كل مرة. الوثيقةُ الغائبة = الأصل.
 */
import { Repository } from "../../db/repository";
import { cleanTravelPolicy, type CampusTravelPolicy } from "../../utils/campusTravelPolicy";

const DOC_ID = "global";
const TTL_MS = 30_000;
const cache = new Map<string, { at: number; value: Promise<CampusTravelPolicy> }>();

export function readTravelPolicy(): Promise<CampusTravelPolicy> {
  const key = String(Repository.currentDemoSessionId() || "");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = Repository.getFeatureDoc("campusTravelPolicy", DOC_ID).then(cleanTravelPolicy).catch(() => cleanTravelPolicy(null));
  cache.set(key, { at: Date.now(), value });
  return value;
}

export async function saveTravelPolicy(policy: CampusTravelPolicy): Promise<void> {
  await Repository.saveFeatureDoc("campusTravelPolicy", DOC_ID, policy);
  cache.clear();
}
