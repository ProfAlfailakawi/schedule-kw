import React, { useEffect, useMemo, useRef, useState } from "react";
import type { FSchedule } from "../types";
import WhyIcon from "./WhyIcon";
import WhyNotLayer, { type WhyNotLayerProps } from "./WhyNotLayer";
import WeekReplay, { type WeekReplayProps } from "./WeekReplay";

/**
 * أداتان في شريط عرض الأسبوع: «لماذا لا؟» (تلوين الخانات بما يمنع الموعد المحدَّد)
 * و«إعادة العرض» (كيف تكوّن الجدول). كلتاهما قراءةٌ فقط؛ النقلُ من الأولى يمرّ بمسار النقل المعتاد.
 *
 * موضوعُ «لماذا لا؟» هو آخر موعدٍ حُدِّد في لوحة السياق: اللوحةُ تغطّي الشاشة فتُغلق قبل الضغط على الزرّ،
 * فيُتذكَّر الموعدُ بمعرّفه ما دام في الجدول.
 */
export type WeekLayerWhyNot = Omit<WhyNotLayerProps, "subject" | "active" | "onToggle" | "patternSwitch" | "rows"> & {
  patternSwitchFor?: (row: FSchedule, day: string) => boolean;
};
export default function WeekLayerTools({ rows, selectedId, whyNot, replay, replayReady }: {
  rows: readonly FSchedule[];
  selectedId: number | null;
  whyNot: WeekLayerWhyNot;
  replay: Omit<WeekReplayProps, "onClose">;
  /** النطاقُ كاملٌ (كلية وقسم وفصل) فيصحّ سؤالُ السجل. */
  replayReady: boolean;
}) {
  const [whyOn, setWhyOn] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);
  const [remembered, setRemembered] = useState<number | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (selectedId) setRemembered(selectedId); }, [selectedId]);
  const subject = useMemo(() => (remembered ? rows.find(row => row.id === remembered) || null : null), [rows, remembered]);
  const { patternSwitchFor, ...layer } = whyNot;
  const patternSwitch = useMemo(() => subject && patternSwitchFor ? (day: string) => patternSwitchFor(subject, day) : undefined, [subject, patternSwitchFor]);
  return (
    <div className="wk-tools" role="group" aria-label="طبقات الأسبوع">
      <WhyNotLayer {...layer} rows={rows} patternSwitch={patternSwitch} subject={subject} active={whyOn} onToggle={() => setWhyOn(value => !value)} />
      <button ref={opener} type="button" className="wk-tool wk-replay-btn" onClick={() => setReplayOpen(true)} disabled={!replayReady}
        title={replayReady ? "إعادة عرض الأسبوع — كيف تكوّن هذا الجدول" : "اختر الكلية والقسم والفصل أولاً"}
        data-guide-ignore="يفتح إعادة عرض للقراءة فقط لتكوّن جدول القسم من سجل التغييرات">
        <WhyIcon name="replay" className="wk-tool-ico" />
        <span>إعادة العرض</span>
      </button>
      {replayOpen ? <WeekReplay {...replay} onClose={() => { setReplayOpen(false); window.setTimeout(() => opener.current?.focus(), 0); }} /> : null}
    </div>
  );
}
