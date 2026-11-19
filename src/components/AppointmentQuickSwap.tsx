/**
 * أيقونة «التبديل السريع» بجانب خطوة الوقت في الموعد: تبويبان — «تدريب» و«هيئة تدريسية» (الشاغر) —
 * وفي كلٍّ كلُّ شعب القسم والفصل التي عند مدرّبٍ أو شاغرة، فيُنقل ما يراه المنسّق إلى الأستاذ المختار بنقرة.
 * مقررُ الموعد الجاري أولاً (وله وحده «بوقتي»)، ثم بقية المقررات؛ وبحثٌ بالاسم أو الرمز أو رقم الشعبة.
 * لا تحفظ هذه الواجهةُ شيئاً بنفسها؛ الحفظ في الأب.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, CalendarCheck, CalendarX2, Clock, DoorOpen, GraduationCap, Search, UserRoundX, X } from "lucide-react";
import type { QuickSwapSource } from "../utils/appointmentQuickSwap";
import { formatScheduleTimeRange } from "../utils/scheduleTime";
import CourseTags from "./CourseTags";

const DAYS: Array<[string, string, string]> = [["fsunday", "ح", "الأحد"], ["fmonday", "ن", "الاثنين"], ["ftuesday", "ث", "الثلاثاء"], ["fwednesday", "ر", "الأربعاء"], ["fthursday", "خ", "الخميس"]];
const SHOWN = 60;
const fold = (text: unknown) => String(text ?? "").normalize("NFKC").replace(/[ً-ٟـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").toLowerCase();

export default function AppointmentQuickSwap({ sources, hasMine, busy, onApply }: {
  sources: QuickSwapSource[];
  hasMine: boolean;
  busy: boolean;
  onApply: (source: QuickSwapSource, mode: "its" | "mine") => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"trainee" | "vacant">("trainee");
  const [query, setQuery] = useState("");
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
  const list = tab === "trainee" ? trainees : vacants;
  const needle = fold(query).trim();
  const shown = useMemo(() => (needle ? list.filter(item => fold(`${item.row.AdCourseName || ""} ${item.row.SCode || ""} ${item.row.CourseCodeSnapshot || ""}`).includes(needle)) : list), [list, needle]);
  if (!sources.length) return null;
  const same = shown.filter(item => item.sameCourse), others = shown.filter(item => !item.sameCourse);
  let budget = SHOWN;
  const take = (items: QuickSwapSource[]) => { const out = items.slice(0, Math.max(0, budget)); budget -= out.length; return out; };
  const sameShown = take(same), othersShown = take(others);
  const card = (item: QuickSwapSource) => {
    return <li key={item.rowId} className={`qs-item${item.sameCourse ? " is-same" : ""}`}>
      <div className="qs-top">
        <strong className="qs-course">{item.row.AdCourseName || `مقرر ${item.row.AdCourseId}`}<CourseTags courseId={Number(item.row.AdCourseId)} /></strong>
        <span className="qs-sec" title="رقم الشعبة"><small>شعبة</small><bdi dir="ltr">{item.row.SCode || "—"}</bdi></span>
      </div>
      <div className="qs-facts">
        <span className="qs-days" role="img" aria-label={DAYS.filter(([key]) => (item.row as any)[key]).map(([, , name]) => name).join(" و") || "بلا أيام"}>
          {DAYS.map(([key, short]) => <i key={key} className={(item.row as any)[key] ? "on" : ""} aria-hidden="true">{short}</i>)}
        </span>
        <span className="qs-fact"><Clock aria-hidden="true" /><bdi dir="ltr">{formatScheduleTimeRange(item.row.fstarttime, item.row.fendtime)}</bdi></span>
        <span className="qs-fact is-room"><DoorOpen aria-hidden="true" />{item.row.AdRoomCode ? <bdi dir="ltr">{item.row.AdRoomCode}{item.row.AdRoomHall ? `/${item.row.AdRoomHall}` : ""}</bdi> : <em>بلا قاعة</em>}</span>
      </div>
      <div className="qs-acts">
        <button type="button" className={`qs-go ${item.freeAtIts ? "good" : "bad"}`} disabled={busy} title={item.freeAtIts ? "الأستاذ حرٌّ في وقتها" : "يتداخل مع موعدٍ للأستاذ"}
          data-guide-ignore="ينقل الشعبة إلى الأستاذ بوقتها وقاعتها كما هي بتراجع"
          onClick={() => onApply(item, "its")}>{item.freeAtIts ? <CalendarCheck aria-hidden="true" /> : <CalendarX2 aria-hidden="true" />}<span>بوقتها</span></button>
        {hasMine && item.sameCourse && !item.sameTime ? <button type="button" className={`qs-go ${item.freeAtMine ? "good" : "bad"}`} disabled={busy} title={item.freeAtMine ? "الأستاذ حرٌّ في وقت موعدك" : "يتداخل مع موعدٍ للأستاذ"}
          data-guide-ignore="ينقل الشعبة إلى الأستاذ بأيام موعدك ووقته بتراجع"
          onClick={() => onApply(item, "mine")}>{item.freeAtMine ? <CalendarCheck aria-hidden="true" /> : <CalendarX2 aria-hidden="true" />}<span>بوقتي</span></button> : null}
      </div>
    </li>;
  };
  return <span className="qs-wrap" ref={box}>
    <button type="button" className={`qs-btn${open ? " is-open" : ""}`} aria-expanded={open} aria-label="تبديل سريع من التدريب أو الهيئة التدريسية" title="تبديل سريع"
      data-guide-ignore="يفتح شعب القسم عند المدرّبين أو الشاغرة لنقلها إلى الأستاذ؛ لا يحفظ شيئاً"
      onClick={() => setOpen(current => !current)}><ArrowLeftRight aria-hidden="true" /></button>
    {open ? <div className="qs-panel" role="dialog" aria-modal="false" aria-label="التبديل السريع">
      <div className="qs-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "trainee"} className={tab === "trainee" ? "is-on" : ""} disabled={!trainees.length}
          data-guide-ignore="يعرض شعب المدرّبين؛ لا يحفظ شيئاً" onClick={() => setTab("trainee")}><GraduationCap aria-hidden="true" /><span>تدريب</span><small>{trainees.length}</small></button>
        <button type="button" role="tab" aria-selected={tab === "vacant"} className={tab === "vacant" ? "is-on" : ""} disabled={!vacants.length}
          data-guide-ignore="يعرض الشعب الشاغرة بلا أستاذ؛ لا يحفظ شيئاً" onClick={() => setTab("vacant")}><UserRoundX aria-hidden="true" /><span>هيئة تدريسية</span><small>{vacants.length}</small></button>
        <button type="button" className="qs-close" aria-label="إغلاق" data-guide-ignore="يغلق قائمة التبديل؛ لا يحفظ شيئاً" onClick={() => setOpen(false)}><X aria-hidden="true" /></button>
      </div>
      {list.length > 6 ? <label className="qs-search"><Search aria-hidden="true" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث باسم المقرر أو رقم الشعبة" aria-label="بحث في الشعب" /></label> : null}
      <div className="qs-scroll">
        {sameShown.length ? <section aria-label="مقرر الموعد"><h4 className="qs-group is-same">مقرر الموعد <small>{same.length}</small></h4><ul className="qs-list">{sameShown.map(card)}</ul></section> : null}
        {othersShown.length ? <section aria-label="مقررات أخرى">{sameShown.length ? <h4 className="qs-group">مقررات أخرى <small>{others.length}</small></h4> : null}<ul className="qs-list">{othersShown.map(card)}</ul></section> : null}
        {shown.length > SHOWN ? <p className="qs-more">يظهر أول {SHOWN} من {shown.length}؛ ضيّق بالبحث.</p> : null}
        {!shown.length ? <p className="qs-empty">لا شعبة مطابقة.</p> : null}
      </div>
    </div> : null}
  </span>;
}
