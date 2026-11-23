/**
 * لوحة العميد: «نبض القاعات في الكلية» للقراءة فقط.
 *
 * بطاقةٌ صغيرة في الحزمة الأولى، والمجسّم كلّه لا يُحمَّل إلا حين يفتحه العميد.
 * النطاق نطاق اللوحة المشترك (كلية العميد، والقسم إن اختاره)، والمواعيد من
 * /api/schedules التي يقصرها الخادم على المعتمدة للعميدين.
 */
import React, { useEffect, useState } from "react";
import { Box, ChevronDown } from "lucide-react";
import HallPulseLazy from "./HallPulseLazy";
import { readSharedScope, resolveSharedScope, useSharedScope } from "../../utils/sharedScope";

export default function DeanHallPulseCard({ scopes, termId }: { scopes: any[]; termId: number }) {
  const resolve = () => resolveSharedScope(readSharedScope(), { scopes, isAdmin: false, fallbackTermId: termId });
  const [scope, setScope] = useState(resolve);
  const [open, setOpen] = useState(false);
  useSharedScope(incoming => setScope(resolveSharedScope(incoming, { scopes, isAdmin: false, fallbackTermId: termId })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setScope(resolve()); }, [termId]);
  const collegeId = Number(scope.collegeId) || 0, sectionId = Number(scope.sectionId) || 0, term = Number(scope.termId) || termId;
  if (!collegeId || !term) return null;
  return (
    <section className="hp-host" aria-label="نبض القاعات">
      {!open ? (
        <div className="hp-dean-card">
          <div>
            <strong><Box aria-hidden="true" style={{ width: 18, height: 18, verticalAlign: -3, marginInlineEnd: 6 }} />نبض القاعات في الكلية</strong>
            <small>مباني الكلية مجسّمةً: أين القاعات المضغوطة، وأين الهدر، وحرارة الأسبوع لكل قاعة. للقراءة فقط.</small>
          </div>
          <button data-guide-ignore="يفتح نبض القاعات للعميد أو يغلقه؛ قراءة فقط" type="button" className="hp-plain-btn" onClick={() => setOpen(true)} aria-expanded={false}>
            افتح المجسّم <ChevronDown aria-hidden="true" style={{ width: 16, height: 16 }} />
          </button>
        </div>
      ) : (
        <>
          <HallPulseLazy context="dean" collegeId={collegeId} sectionId={sectionId} termId={term} />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <button data-guide-ignore="يفتح نبض القاعات للعميد أو يغلقه؛ قراءة فقط" type="button" className="hp-plain-btn" onClick={() => setOpen(false)} aria-expanded>إغلاق المجسّم</button>
          </div>
        </>
      )}
    </section>
  );
}
