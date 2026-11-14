/**
 * ── «جرّب بديلاً» على موعدٍ تغيّر ───────────────────────────────────────────
 *
 * «آلة الزمن» كانت بابَ رئيس القسم والتسجيل المستقل في القائمة، ولا يصل إليها
 * إلا من يعرف أن يبحث عنها. وهم لا يحتاجونها في الفراغ: يحتاجونها حين يقف
 * أمامهم موعدٌ تغيّر ويسألون «وماذا لو كان في مكانٍ آخر؟». فصارت على الموعد نفسه:
 * هذه الورقة تفتح مكتبَ «ماذا لو» (WhatIfDesk) على ذلك الموعد، فتعرض له بدائله
 * أماكنَ وأوقاتاً، مقيسةً بأثرها، على نسخةٍ افتراضية لا تمسّ الجدول.
 *
 * الصلاحيةُ كما كانت: العرضُ والمحاكاة لكل من يقرأ الجدول، والاعتماد لمن يكتبه
 * وحده («عرض ومحاكاة — الاعتماد لمن يكتب الجدول»)، والخادمُ هو الحارس.
 */
import React from "react";
import { Hourglass, X } from "lucide-react";
import { useDialogDismiss } from "./ui";
import { WhatIfDesk } from "./TimeMachine";

export default function TryAlternativeSheet({ collegeId, sectionId, termId, rowId, title, onClose }: {
  collegeId: number;
  sectionId: number;
  termId: number;
  rowId: number;
  /** المقرر والشعبة كما تقرؤهما العين في صفّ التغييرات. */
  title: string;
  onClose: () => void;
}) {
  useDialogDismiss(true, onClose);
  return (
    <div className="try-alt-sheet no-print" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="try-alt-card" role="dialog" aria-modal="true" aria-label={`جرّب بديلاً — ${title}`}>
        <header>
          <span className="try-alt-mark" aria-hidden="true"><Hourglass /></span>
          <div>
            <small>جرّب بديلاً · على نسخةٍ افتراضية، لا يُكتب شيءٌ في الجدول</small>
            <strong>{title}</strong>
          </div>
          <button type="button" data-guide-ignore="إغلاق ورقة «جرّب بديلاً»؛ لا يغيّر شيئاً" onClick={onClose} aria-label="إغلاق" title="إغلاق"><X aria-hidden="true" /></button>
        </header>
        <div className="try-alt-body">
          <WhatIfDesk collegeId={collegeId} sectionId={sectionId} termId={termId} focusRowId={rowId} />
        </div>
      </section>
    </div>
  );
}
