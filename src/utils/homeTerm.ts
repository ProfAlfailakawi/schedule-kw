/**
 * ── أيُّ فصلٍ تفتح عليه لوحة البداية ─────────────────────────────────────────
 *
 * كانت اللوحة تفتح على أحدث فصلٍ في القائمة، ولو كان ذلك الفصلُ يُعدّ للتوّ ولا
 * يرى منه القارئُ شيئاً. فالعميد — وهو لا يرى إلا المعتمد — يفتح بيتاً من صفر:
 * أسبوعٌ فارغ و«الجدول سليم» حتى يُعتمد شيءٌ في الفصل الجديد.
 *
 * القاعدة الآن:
 *   ١) اختيارُ القارئ الصريح (النطاق المشترك) يُحترم ما دام الفصلُ موجوداً.
 *   ٢) وإلا الفصلُ الذي تعمل فيه المؤسسة الآن — `currentTermId`، الحَكَم نفسه
 *      الذي تقرأ به بطاقةُ الأستاذ والجدولُ وتجميدُ الفصل السابق.
 *   ٣) فإن لم يكن للقارئ فيه شيءٌ يُرى، فأحدثُ فصلٍ له فيه ما يُرى.
 *   ٤) وإن لم يكن له شيءٌ في أيّ فصل، بقي الجاري — وتقول اللوحة إنه فارغ.
 *
 * والفصلُ القادم قيد الإعداد (`planningTermCandidates`) لا يُخفى: يُذكر في
 * شارةٍ صغيرة تفتحه بنقرة.
 */
import { currentTermId, planningTermCandidates, sortTermsNewest, termChronology } from "./termSequence";

type TermLike = { AdTermId?: number; AdTermName?: string; AdTermStart?: string; AdTermWeeks?: number; AdTermClosed?: boolean };

/** كم فصلاً يُفحص بحثاً عن فصلٍ فيه ما يُرى — القراءاتُ مخبّأة، والحدُّ يمنع مسحَ أرشيفٍ كامل. */
export const HOME_TERM_LOOKBACK = 6;

/**
 * الفصولُ بالترتيب الذي تُجرَّب به حين لا اختيارَ صريحاً: الجاري أولاً، ثم الأحدثُ فالأقدم.
 */
export function homeTermCandidates(terms: readonly TermLike[], now: number = Date.now()): number[] {
  const current = currentTermId(terms as any, now);
  const newest = sortTermsNewest(terms as any[]).map(term => Number(term.AdTermId || 0)).filter(Boolean);
  return [...new Set([current, ...newest].filter(Boolean))].slice(0, HOME_TERM_LOOKBACK + 1);
}

/** الفصلُ القادم قيد الإعداد بعد الفصل المعروض — أقربُها إليه، أو null. */
export function upcomingHomeTerm<T extends TermLike>(terms: readonly T[], shownTermId: number, now: number = Date.now()): T | null {
  const shown = terms.find(term => Number(term.AdTermId) === Number(shownTermId));
  if (!shown) return null;
  const rank = termChronology(shown);
  const ids = planningTermCandidates(terms as any, now).filter(id => id !== Number(shownTermId));
  const later = ids
    .map(id => terms.find(term => Number(term.AdTermId) === id))
    .filter((term): term is T => Boolean(term) && termChronology(term) > rank)
    .sort((a, b) => termChronology(a) - termChronology(b));
  return later[0] || null;
}

export interface HomeTermChoice {
  /** الفصلُ المعروض. */
  termId: number;
  /** ما كانت اللوحة ستفتح عليه بلا اختيارٍ صريح. */
  defaultTermId: number;
  /** الجاري تشغيلياً (currentTermId). */
  currentTermId: number;
  /** المعروضُ اختيارُ القارئ، لا افتراضُ اللوحة. */
  explicit: boolean;
  /** الافتراضُ ليس الجاريَ لأن القارئ لا يرى فيه شيئاً. */
  fallback: boolean;
}

/**
 * القرارُ نفسه، بلا قراءة: `visibleCount(termId)` يقول كم صفّاً يرى القارئ في
 * الفصل (يُستدعى بالترتيب، ويتوقّف عند أول فصلٍ فيه شيء).
 */
export async function chooseHomeTerm(
  terms: readonly TermLike[],
  requestedTermId: number,
  visibleCount: (termId: number) => Promise<number> | number,
  now: number = Date.now(),
): Promise<HomeTermChoice> {
  const current = currentTermId(terms as any, now);
  const exists = (id: number) => Boolean(id) && terms.some(term => Number(term.AdTermId) === id);
  let defaultTermId = 0;
  for (const id of homeTermCandidates(terms, now)) {
    if (await visibleCount(id) > 0) { defaultTermId = id; break; }
  }
  if (!defaultTermId) defaultTermId = current || Number(sortTermsNewest(terms as any[])[0]?.AdTermId || 0);
  const requested = Number(requestedTermId || 0);
  const explicit = exists(requested);
  return {
    termId: explicit ? requested : defaultTermId,
    defaultTermId,
    currentTermId: current,
    explicit,
    fallback: Boolean(current) && defaultTermId !== current,
  };
}
