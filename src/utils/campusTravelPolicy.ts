import { interCampusMinutes, type Campus } from "./campusTravel";

/**
 * ── سياسةُ التنقّل بين المواقع (ملاحظة المالك 13) ───────────────────────────
 *
 * يضبطها التسجيل: لكل زوجٍ من المواقع مدّته (تزيد وتنقص)، وهل هي تنبيهٌ (الأصل) أم
 * إلزامٌ يمنع الحفظ، ومن هم المستثنَون. وثيقةٌ غائبة = الحال القديم تماماً: تنبيهٌ
 * بثلاثين دقيقة وساعة بين الجهراء والفحيحيل.
 */
export const TRAVEL_PAIRS: ReadonlyArray<{ key: string; a: Campus; b: Campus; label: string }> = [
  { key: "fahaheel|jahra", a: "fahaheel", b: "jahra", label: "الجهراء ↔ الفحيحيل" },
  { key: "jahra|main", a: "jahra", b: "main", label: "الجهراء ↔ الرئيسي" },
  { key: "fahaheel|main", a: "fahaheel", b: "main", label: "الفحيحيل ↔ الرئيسي" },
];

export interface CampusTravelPolicy {
  pairs: Record<string, { minutes: number; required: boolean }>;
  exemptInstructorIds: number[];
}

export const travelPairKey = (a: Campus, b: Campus) => [a, b].sort().join("|");

export function defaultTravelPolicy(): CampusTravelPolicy {
  const pairs: CampusTravelPolicy["pairs"] = {};
  for (const pair of TRAVEL_PAIRS) pairs[pair.key] = { minutes: interCampusMinutes(pair.a, pair.b) || 30, required: false };
  return { pairs, exemptInstructorIds: [] };
}

export function cleanTravelPolicy(value: any): CampusTravelPolicy {
  const out = defaultTravelPolicy();
  for (const pair of TRAVEL_PAIRS) {
    const raw = value?.pairs?.[pair.key];
    if (!raw) continue;
    const minutes = Math.round(Number(raw.minutes));
    if (Number.isFinite(minutes) && minutes >= 0 && minutes <= 180) out.pairs[pair.key].minutes = minutes;
    out.pairs[pair.key].required = raw.required === true;
  }
  out.exemptInstructorIds = [...new Set<number>((Array.isArray(value?.exemptInstructorIds) ? value.exemptInstructorIds : [])
    .map(Number).filter((id: number) => Number.isSafeInteger(id) && id > 0))].slice(0, 500);
  return out;
}

/** ما يلزم أستاذاً بين موقعين: null إن كان الموقع واحداً أو كان مستثنى أو كانت المدة صفراً. */
export function travelRuleFor(policy: CampusTravelPolicy, a: Campus, b: Campus, instructorId: number): { minutes: number; required: boolean } | null {
  if (a === b || policy.exemptInstructorIds.includes(Number(instructorId))) return null;
  const rule = policy.pairs[travelPairKey(a, b)];
  return rule && rule.minutes > 0 ? rule : null;
}
