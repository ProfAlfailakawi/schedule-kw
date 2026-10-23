/**
 * ── أيُّ طلبٍ سابقٍ تعرضه ذاكرةُ الفصول؟ ─────────────────────────────────────
 *
 * «الفصل السابق» ترتيبٌ زمنيّ لا ترتيبُ معرّفات: فصولٌ مستوردةٌ أو تاريخيةٌ قد تُحفظ
 * بمعرّفٍ أكبر وهي أقدم. فالقطعُ والاختيارُ كلاهما بالتسلسل الزمنيّ الذي تقرأ به بقيّةُ
 * الشاشات الفصول (`termChronology`)، لا بمقارنة AdTermId.
 *
 * القاعدةُ هنا خالصةٌ بلا قاعدة بيانات، فتُختبر بمعرّفاتٍ غير زمنيّة عمداً.
 */
import { termChronology } from "./termSequence";

export interface PreviousTermCandidate {
  AdTermId: number;
  AdCollegeId?: number;
  AdSectionId?: number;
  submittedAt?: string;
}

/**
 * أقربُ طلبٍ سابقٍ أرسله الأستاذ في قسمه نفسه: أقدمُ من الفصل الحالي زمنياً، وأحدثُ ما قبله،
 * وإن تعدّد في الفصل الواحد فآخرُ ما أُرسل. `null` إن لم يوجد.
 */
export function pickPreviousRequest<T extends PreviousTermCandidate>(
  requests: readonly T[],
  terms: ReadonlyArray<{ AdTermId?: number; AdTermName?: string }>,
  current: { AdTermId: number; AdCollegeId?: number; AdSectionId?: number },
): { request: T; termName: string } | null {
  const termOf = (id: number) => terms.find(term => Number(term.AdTermId) === Number(id));
  /* فصلٌ لا يُعرف عنه شيء يبقى أقدمَ ما يكون: لا نخمّن له موضعاً. */
  const rank = (id: number) => termChronology(termOf(id) ?? { AdTermId: id });
  const now = rank(current.AdTermId);
  const earlier = requests
    .filter(row => row.submittedAt
      && Number(row.AdCollegeId) === Number(current.AdCollegeId)
      && Number(row.AdSectionId) === Number(current.AdSectionId)
      && Number(row.AdTermId) !== Number(current.AdTermId)
      && rank(row.AdTermId) < now)
    .sort((a, b) => rank(b.AdTermId) - rank(a.AdTermId)
      || Number(b.AdTermId) - Number(a.AdTermId)
      || String(b.submittedAt).localeCompare(String(a.submittedAt)));
  const nearest = earlier[0];
  if (!nearest) return null;
  return { request: nearest, termName: String(termOf(nearest.AdTermId)?.AdTermName || "") };
}
