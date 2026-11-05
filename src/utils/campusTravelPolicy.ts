import { interCampusMinutes, type Campus } from "./campusTravel";

/**
 * ── سياسةُ التنقّل بين المواقع (ملاحظة المالك 13) ───────────────────────────
 *
 * يضبطها التسجيل: لكل زوجٍ من المواقع مدّته (تزيد وتنقص، والصفر يوقفها)، ومن هم المستثنَون.
 * القاعدةُ واحدة (قرار المالك 2026-11-05): المدةُ إلزامٌ في بطاقة الأستاذ، وتنبيهٌ لا يمنع في
 * «موعد» القسم. وثيقةٌ غائبة = ثلاثون دقيقة وساعة بين الجهراء والفحيحيل.
 */
export const TRAVEL_PAIRS: ReadonlyArray<{ key: string; a: Campus; b: Campus; label: string }> = [
  { key: "fahaheel|jahra", a: "fahaheel", b: "jahra", label: "الجهراء ↔ الفحيحيل" },
  { key: "jahra|main", a: "jahra", b: "main", label: "الجهراء ↔ الرئيسي" },
  { key: "fahaheel|main", a: "fahaheel", b: "main", label: "الفحيحيل ↔ الرئيسي" },
];

export interface CampusTravelPolicy {
  /** `required` حقلٌ قديم: يبقى مقروءاً ومحفوظاً كما هو لتوافق الوثائق، ولا يقرؤه أيُّ حكم. */
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

const clockMinutes = (value: unknown) => {
  const [hours, minutes] = String(value || "").split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

export interface TravelShortfall { day: string; need: number; gap: number; from: Campus; to: Campus }

/** كلُّ موعدٍ للأستاذ لا يترك له مدة التنقّل المضبوطة من موعدٍ مطلوب: محرّكٌ واحد لفحص «موعد» وحكم البطاقة. */
export function travelShortfalls(policy: CampusTravelPolicy, instructorId: number, campusOfCollege: (collegeId: number) => Campus | undefined,
  candidate: { collegeId: number; slots: ReadonlyArray<{ day: string; start: string; end: string }> }, others: readonly any[]): TravelShortfall[] {
  const from = campusOfCollege(Number(candidate.collegeId));
  if (!from) return [];
  const found: TravelShortfall[] = [];
  for (const slot of candidate.slots) {
    const start = clockMinutes(slot.start), end = clockMinutes(slot.end);
    for (const other of others) {
      if (!other?.[slot.day]) continue;
      const to = campusOfCollege(Number(other.AdCollegeId));
      if (!to) continue;
      const rule = travelRuleFor(policy, from, to, instructorId);
      if (!rule) continue;
      const otherStart = clockMinutes(other.fstarttime), otherEnd = clockMinutes(other.fendtime);
      /* التداخلُ تعارضٌ له حكمُه؛ هنا الفارقُ بين موعدين لا يتداخلان. */
      const gap = start >= otherEnd ? start - otherEnd : otherStart >= end ? otherStart - end : -1;
      if (gap >= 0 && gap < rule.minutes) found.push({ day: slot.day, need: rule.minutes, gap, from, to });
    }
  }
  return found;
}
