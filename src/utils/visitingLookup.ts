/**
 * ── «منتدب»: قائمةٌ واحدة لكل الشاشات ───────────────────────────────────────
 *
 * المنتدبُ يُعرف بقسمه وفصله. `/api/visiting-lookup` يعطي مفتاحَ «كلية:قسم» ← معرّفاتِ
 * منتدبيه في الفصل، ويُقرأ مرةً لكل فصلٍ ويُحفظ دقيقةً، فتسأل أيُّ شاشةٍ بلا طلبٍ خاص.
 * `isVisiting(id, collegeId, sectionId)` يشترط القسم: أستاذٌ منتدبٌ في قسمٍ ليس منتدباً في
 * قسمٍ آخر يُدرّس فيه بصفته عضواً.
 */
export type VisitingLookup = { termId: number; scopes: Record<string, number[]> };

const TTL_MS = 60_000;
const cache = new Map<number, { at: number; pending: Promise<VisitingLookup> }>();

export const EMPTY_VISITING_LOOKUP: VisitingLookup = { termId: 0, scopes: {} };

export function loadVisitingLookup(termId: number, fetcher: typeof fetch = fetch): Promise<VisitingLookup> {
  const term = Number(termId) || 0;
  if (!term) return Promise.resolve(EMPTY_VISITING_LOOKUP);
  const held = cache.get(term);
  if (held && Date.now() - held.at < TTL_MS) return held.pending;
  const pending = fetcher(`/api/visiting-lookup?termId=${term}`, { credentials: "include" })
    .then(async response => {
      if (!response.ok) throw new Error("visiting-lookup");
      const data = await response.json();
      const scopes: Record<string, number[]> = {};
      for (const [key, ids] of Object.entries(data?.scopes || {})) scopes[key] = (Array.isArray(ids) ? ids : []).map(Number).filter(Boolean);
      return { termId: term, scopes } as VisitingLookup;
    })
    .catch(() => { cache.delete(term); return { termId: term, scopes: {} } as VisitingLookup; });
  cache.set(term, { at: Date.now(), pending });
  return pending;
}

/** بعد تعديل قائمة المنتدبين: القراءةُ التالية جديدة. */
export function invalidateVisitingLookup(): void { cache.clear(); }

export function isVisitingIn(lookup: VisitingLookup | null | undefined, instructorId: unknown, collegeId: unknown, sectionId: unknown): boolean {
  const id = Number(instructorId);
  if (!lookup || !Number.isFinite(id) || id <= 0) return false;
  return (lookup.scopes[`${Number(collegeId) || 0}:${Number(sectionId) || 0}`] || []).includes(id);
}
