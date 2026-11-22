/**
 * أيقونة «التبديل السريع» بجانب خطوة الوقت في الموعد: تبويبان — «تدريب» و«هيئة تدريسية» (الشاغر) —
 * وفي كلٍّ كلُّ شعب القسم والفصل التي عند مدرّبٍ أو شاغرة، فيُنقل ما يراه المنسّق إلى الأستاذ المختار.
 * مقررُ الموعد الجاري أولاً (وله وحده «بوقتي»)، ثم بقية المقررات؛ وبحثٌ بالاسم أو الرمز أو رقم الشعبة.
 * «بوقتها» و«بوقتي» لا ينقلان شيئاً: يعرضان بطاقةَ مراجعةٍ (من مَن إلى مَن، والأيام والوقت والقاعة بعد النقل،
 * وتنبيهُ التداخل)، ولا يُحفظ النقل إلا بزرّ «حفظ» فيها (قرار المالك). الحفظ نفسه في الأب.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowLeftRight, CalendarCheck, CalendarX2, Clock, DoorOpen, GraduationCap, Save, Search, TriangleAlert, UserRoundX, X } from "lucide-react";
import type { FSchedule } from "../types";
import { quickSwapAfter, type QuickSwapMine, type QuickSwapSource } from "../utils/appointmentQuickSwap";
import { formatScheduleTimeRange } from "../utils/scheduleTime";
import CourseTags from "./CourseTags";
import PersonChips from "./PersonChips";

const DAYS: Array<[string, string, string]> = [["fsunday", "ح", "الأحد"], ["fmonday", "ن", "الاثنين"], ["ftuesday", "ث", "الثلاثاء"], ["fwednesday", "ر", "الأربعاء"], ["fthursday", "خ", "الخميس"]];
const SHOWN = 60;
const fold = (text: unknown) => String(text ?? "").normalize("NFKC").replace(/[ً-ٟـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").toLowerCase();

export default function AppointmentQuickSwap({ sources, hasMine, mine, teacherId, teacherName, teacherVisiting = false, ownerName, busy, onApply }: {
  sources: QuickSwapSource[];
  hasMine: boolean;
  mine: QuickSwapMine | null;
  teacherId: number;
  teacherName: string;
  teacherVisiting?: boolean;
  ownerName: (id: number) => string;
  busy: boolean;
  /** يحفظ النقل؛ true عند النجاح. لا يُستدعى إلا من زرّ «حفظ» في بطاقة المراجعة. */
  onApply: (source: QuickSwapSource, mode: "its" | "mine") => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<{ item: QuickSwapSource; mode: "its" | "mine" } | null>(null);
  const [tab, setTab] = useState<"trainee" | "vacant">("trainee");
  const [query, setQuery] = useState("");
  const box = useRef<HTMLSpanElement>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => { if (!open) setPending(null); }, [open]);
  /* الشعبةُ التي تُراجَع قد تختفي من القائمة (حُفظت في مكانٍ آخر): تُغلق المراجعة بدل حفظ صفٍّ قديم. */
  useEffect(() => { if (pending && !sources.some(item => item.rowId === pending.item.rowId)) setPending(null); }, [sources, pending]);
  const trainees = sources.filter(item => item.kind === "trainee"), vacants = sources.filter(item => item.kind === "vacant");
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false); };
    const esc = (event: KeyboardEvent) => { if (event.key !== "Escape") return; if (pendingRef.current) setPending(null); else setOpen(false); };
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
  const facts = (row: FSchedule) => <div className="qs-facts">
    <span className="qs-days" role="img" aria-label={DAYS.filter(([key]) => (row as any)[key]).map(([, , name]) => name).join(" و") || "بلا أيام"}>
      {DAYS.map(([key, short]) => <i key={key} className={(row as any)[key] ? "on" : ""} aria-hidden="true">{short}</i>)}
    </span>
    <span className="qs-fact"><Clock aria-hidden="true" /><bdi dir="ltr">{formatScheduleTimeRange(row.fstarttime, row.fendtime)}</bdi></span>
    <span className="qs-fact is-room"><DoorOpen aria-hidden="true" />{row.AdRoomCode ? <bdi dir="ltr">{row.AdRoomCode}{row.AdRoomHall ? `/${row.AdRoomHall}` : ""}</bdi> : <em>بلا قاعة</em>}</span>
  </div>;
  const card = (item: QuickSwapSource) => {
    return <li key={item.rowId} className={`qs-item${item.sameCourse ? " is-same" : ""}`}>
      <div className="qs-top">
        <strong className="qs-course">{item.row.AdCourseName || `مقرر ${item.row.AdCourseId}`}<CourseTags courseId={Number(item.row.AdCourseId)} /></strong>
        <span className="qs-sec" title="رقم الشعبة"><small>شعبة</small><bdi dir="ltr">{item.row.SCode || "—"}</bdi></span>
      </div>
      {facts(item.row)}
      <div className="qs-acts">
        <button type="button" className={`qs-go ${item.freeAtIts ? "good" : "bad"}`} disabled={busy} title={item.freeAtIts ? "الأستاذ حرٌّ في وقتها" : "يتداخل مع موعدٍ للأستاذ"}
          data-guide-ignore="يعرض نقل الشعبة إلى الأستاذ بوقتها وقاعتها للمراجعة؛ لا يحفظ شيئاً"
          onClick={() => setPending({ item, mode: "its" })}>{item.freeAtIts ? <CalendarCheck aria-hidden="true" /> : <CalendarX2 aria-hidden="true" />}<span>بوقتها</span></button>
        {hasMine && item.sameCourse && !item.sameTime ? <button type="button" className={`qs-go ${item.freeAtMine ? "good" : "bad"}`} disabled={busy} title={item.freeAtMine ? "الأستاذ حرٌّ في وقت موعدك" : "يتداخل مع موعدٍ للأستاذ"}
          data-guide-ignore="يعرض نقل الشعبة إلى الأستاذ بأيام موعدك ووقته للمراجعة؛ لا يحفظ شيئاً"
          onClick={() => setPending({ item, mode: "mine" })}>{item.freeAtMine ? <CalendarCheck aria-hidden="true" /> : <CalendarX2 aria-hidden="true" />}<span>بوقتي</span></button> : null}
      </div>
    </li>;
  };
  const save = async () => {
    if (!pending || busy) return;
    if (await onApply(pending.item, pending.mode)) setPending(null);
  };
  const review = (() => {
    if (!pending) return null;
    const { item, mode } = pending;
    const after = quickSwapAfter(item.row, teacherId, mode, mine);
    const free = mode === "its" ? item.freeAtIts : item.freeAtMine !== false;
    const from = item.kind === "vacant" ? "هيئة تدريسية (شاغر)" : (ownerName(Number(item.row.AdInstructorId)) || "مدرّب");
    const moved = mode === "mine" && !item.sameTime;
    return <div className="qs-review" role="group" aria-label="مراجعة النقل قبل الحفظ">
      <h4 className="qs-review-title">راجع النقل ثم اضغط «حفظ»</h4>
      <div className="qs-top">
        <strong className="qs-course">{item.row.AdCourseName || `مقرر ${item.row.AdCourseId}`}<CourseTags courseId={Number(item.row.AdCourseId)} /></strong>
        <span className="qs-sec" title="رقم الشعبة"><small>شعبة</small><bdi dir="ltr">{item.row.SCode || "—"}</bdi></span>
      </div>
      <div className="qs-who">
        <span><small>من</small><b>{from}<PersonChips trainee={item.kind === "trainee"} /></b></span>
        <ArrowLeft aria-hidden="true" />
        <span className="is-to"><small>إلى</small><b>{teacherName || "الأستاذ المختار"}<PersonChips visiting={teacherVisiting} /></b></span>
      </div>
      <div className="qs-after"><small>{moved ? "بعد النقل (أيام موعدك ووقته)" : "الوقت والقاعة كما هما"}</small>{facts(after)}</div>
      {moved ? <p className="qs-was"><small>كانت:</small>{facts(item.row)}</p> : null}
      <p className={`qs-verdict ${free ? "good" : "bad"}`}>{free ? <CalendarCheck aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}{free ? "الأستاذ حرٌّ في هذا الوقت." : "تنبيه: يتداخل مع موعدٍ آخر للأستاذ."}</p>
      <div className="qs-acts">
        <button type="button" className="qs-go qs-save" disabled={busy} data-guide-ignore="يحفظ نقل الشعبة إلى الأستاذ بتراجع" onClick={() => { void save(); }}><Save aria-hidden="true" /><span>{busy ? "يحفظ…" : "حفظ"}</span></button>
        <button type="button" className="qs-go qs-cancel" disabled={busy} data-guide-ignore="يرجع إلى القائمة بلا تغيير" onClick={() => setPending(null)}><X aria-hidden="true" /><span>إلغاء</span></button>
      </div>
    </div>;
  })();
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
      {review ? <div className="qs-scroll">{review}</div> : <>
      {list.length > 6 ? <label className="qs-search"><Search aria-hidden="true" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث باسم المقرر أو رقم الشعبة" aria-label="بحث في الشعب" /></label> : null}
      <div className="qs-scroll">
        {sameShown.length ? <section aria-label="مقرر الموعد"><h4 className="qs-group is-same">مقرر الموعد <small>{same.length}</small></h4><ul className="qs-list">{sameShown.map(card)}</ul></section> : null}
        {othersShown.length ? <section aria-label="مقررات أخرى">{sameShown.length ? <h4 className="qs-group">مقررات أخرى <small>{others.length}</small></h4> : null}<ul className="qs-list">{othersShown.map(card)}</ul></section> : null}
        {shown.length > SHOWN ? <p className="qs-more">يظهر أول {SHOWN} من {shown.length}؛ ضيّق بالبحث.</p> : null}
        {!shown.length ? <p className="qs-empty">لا شعبة مطابقة.</p> : null}
      </div>
      </>}
    </div> : null}
  </span>;
}
