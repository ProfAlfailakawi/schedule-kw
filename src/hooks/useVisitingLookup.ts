import { useEffect, useState } from "react";
import { EMPTY_VISITING_LOOKUP, isVisitingIn, loadVisitingLookup, type VisitingLookup } from "../utils/visitingLookup";

/**
 * يُرجع `isVisiting(instructorId, collegeId, sectionId)` لفصلٍ بعينه. قبل وصول القراءة
 * يُجيب «لا» (فلا تومض شارةٌ ثم تختفي)، ويُعاد الرسمُ حين تصل.
 */
export function useVisitingLookup(termId: number | null | undefined) {
  const [lookup, setLookup] = useState<VisitingLookup>(EMPTY_VISITING_LOOKUP);
  useEffect(() => {
    let alive = true;
    const term = Number(termId) || 0;
    if (!term) { setLookup(EMPTY_VISITING_LOOKUP); return; }
    void loadVisitingLookup(term).then(next => { if (alive) setLookup(next); });
    return () => { alive = false; };
  }, [termId]);
  /* ما قُرئ لفصلٍ سابق لا يُجاب به عن فصلٍ جديد ريثما تصل قراءتُه. */
  const current = lookup.termId === (Number(termId) || 0) ? lookup : EMPTY_VISITING_LOOKUP;
  return {
    lookup: current,
    isVisiting: (instructorId: unknown, collegeId: unknown, sectionId: unknown) => isVisitingIn(current, instructorId, collegeId, sectionId),
  };
}
