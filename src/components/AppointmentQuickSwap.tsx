/**
 * أيقونة «التبديل السريع» بجانب خطوة الوقت في الموعد: تبويبان — «تدريب» و«هيئة تدريسية» (الشاغر) —
 * وفي كلٍّ شعبُ مقررات القسم والفصل المختارين التي يمكن أن تنتقل إلى الأستاذ. لا تحفظ الواجهة شيئاً بنفسها.
 */
import React, { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, CalendarCheck, CalendarX2, Clock, GraduationCap, UserRoundX, X } from "lucide-react";
import type { QuickSwapSource } from "../utils/appointmentQuickSwap";
import { formatScheduleTimeRange } from "../utils/scheduleTime";

const DAY_LABELS: Array<[string, string]> = [["fsunday", "ح"], ["fmonday", "ن"], ["ftuesday", "ث"], ["fwednesday", "ر"], ["fthursday", "خ"]];

export default function AppointmentQuickSwap({ sources, hasMine, busy, onApply }: {
  sources: QuickSwapSource[];
  hasMine: boolean;
  busy: boolean;
  onApply: (source: QuickSwapSource, mode: "its" | "mine") => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"trainee" | "vacant">("trainee");
  const box = useRef<HTMLSpanElement>(null);
  const trainees = sources.filter(item => item.kind === "trainee"), vacants = sources.filter(item => item.kind === "vacant");
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false); };
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  useEffect(() => { if (tab === "trainee" && !trainees.length && vacants.length) setTab("vacant"); }, [trainees.length, vacants.length, tab]);
  if (!sources.length) return null;
  const list = tab === "trainee" ? trainees : vacants;
  return <span className="qs-wrap" ref={box}>
    <button type="button" className={`qs-btn${open ? " is-open" : ""}`} aria-expanded={open} aria-label="تبديل سريع من التدريب أو الهيئة التدريسية" title="تبديل سريع"
      data-guide-ignore="يفتح شعب هذا المقرر عند المدرّبين أو الشاغرة لنقلها إلى الأستاذ؛ لا يحفظ شيئاً"
      onClick={() => setOpen(current => !current)}><ArrowLeftRight aria-hidden="true" /></button>
    {open ? <div className="qs-panel" role="dialog" aria-modal="false" aria-label="التبديل السريع">
      <div className="qs-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "trainee"} className={tab === "trainee" ? "is-on" : ""} disabled={!trainees.length}
          data-guide-ignore="يعرض شعب المدرّبين؛ لا يحفظ شيئاً" onClick={() => setTab("trainee")}><GraduationCap aria-hidden="true" /><span>تدريب</span><small>{trainees.length}</small></button>
        <button type="button" role="tab" aria-selected={tab === "vacant"} className={tab === "vacant" ? "is-on" : ""} disabled={!vacants.length}
          data-guide-ignore="يعرض الشعب الشاغرة بلا أستاذ؛ لا يحفظ شيئاً" onClick={() => setTab("vacant")}><UserRoundX aria-hidden="true" /><span>هيئة تدريسية</span><small>{vacants.length}</small></button>
        <button type="button" className="qs-close" aria-label="إغلاق" data-guide-ignore="يغلق قائمة التبديل؛ لا يحفظ شيئاً" onClick={() => setOpen(false)}><X aria-hidden="true" /></button>
      </div>
      <ul className="qs-list">
        {list.map(item => <li key={item.rowId} className="qs-item">
          <span className="qs-what"><b>{item.row.AdCourseName || `مقرر ${item.row.AdCourseId}`} · {item.row.SCode || "—"}</b>
            <span className="qs-days" aria-hidden="true">{DAY_LABELS.filter(([key]) => (item.row as any)[key]).map(([, label]) => label).join(" ")}</span>
            <span className="qs-time"><Clock aria-hidden="true" /><bdi dir="ltr">{formatScheduleTimeRange(item.row.fstarttime, item.row.fendtime)}</bdi></span>
            {item.row.AdRoomCode ? <small className="qs-room"><bdi dir="ltr">{item.row.AdRoomCode}/{item.row.AdRoomHall}</bdi></small> : null}
          </span>
          <span className="qs-acts">
            <button type="button" className={`qs-go ${item.freeAtIts ? "good" : "bad"}`} disabled={busy} title={item.freeAtIts ? "الأستاذ حرٌّ في وقتها" : "يتداخل مع موعدٍ للأستاذ"}
              data-guide-ignore="ينقل الشعبة إلى الأستاذ بوقتها وقاعتها كما هي بتراجع"
              onClick={() => onApply(item, "its")}>{item.freeAtIts ? <CalendarCheck aria-hidden="true" /> : <CalendarX2 aria-hidden="true" />}<span>بوقتها</span></button>
            {hasMine && !item.sameTime ? <button type="button" className={`qs-go ${item.freeAtMine ? "good" : "bad"}`} disabled={busy} title={item.freeAtMine ? "الأستاذ حرٌّ في وقت موعدك" : "يتداخل مع موعدٍ للأستاذ"}
              data-guide-ignore="ينقل الشعبة إلى الأستاذ بأيام موعدك ووقته بتراجع"
              onClick={() => onApply(item, "mine")}>{item.freeAtMine ? <CalendarCheck aria-hidden="true" /> : <CalendarX2 aria-hidden="true" />}<span>بوقتي</span></button> : null}
          </span>
        </li>)}
      </ul>
    </div> : null}
  </span>;
}
