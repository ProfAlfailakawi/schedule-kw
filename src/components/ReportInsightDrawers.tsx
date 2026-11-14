import React, { useEffect, useState } from "react";
import { Building2, CalendarClock, Clock3, Hourglass, ShieldCheck, UserRound, X } from "lucide-react";
import { AR, countOf, nounFor } from "../utils/arabicCount";
import { formatCompactDurationArabic, formatScheduleTimeRange } from "../utils/scheduleTime";
import { professorWeekShape, type WeekShape } from "../utils/professorWeekShape";

/**
 * ── قراءتان تفصيليتان لعدسات مركز الاستعلام ───────────────────────────────
 *
 * «القاعة» (الجهات الأكثر استخداماً لها، ونوافذها المتاحة في الأسبوع) و«شكل
 * الأسبوع» لأستاذ (أين تقع محاضراته وأين ينتظر بينها).
 *
 * التفاصيل من الخادم (/api/intelligence/room و/api/intelligence/professor/:id)
 * تتطلّب صلاحية مساحة الجدول (الشاشة 7)؛ ومن لا يملكها لا يُعرض له ما يطرق
 * باباً مغلقاً: شكل الأسبوع يُرسم عندئذٍ من صفوف التقرير نفسها، وقسمُ القاعة
 * التفصيلي لا يظهر.
 */

const dayOrder = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];

type RoomRead = {
  totalAppointments: number;
  freeWindows: Array<{ day: string; start: string; end: string }>;
  departments: Array<{ name: string; count: number }>;
};

/** الجهات الأكثر استخداماً للقاعة ونوافذها المتاحة في الأسبوع. */
export function RoomInsight({ roomId, code, hall, termId }: { roomId?: string; code: string; hall: string; termId: number | string }) {
  const [read, setRead] = useState<{ data: RoomRead | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  useEffect(() => {
    if (!termId || (!roomId && (!code || !hall))) { setRead({ data: null, error: null, loading: false }); return; }
    const controller = new AbortController();
    const query = new URLSearchParams({ termId: String(termId), code, hall, ...(roomId ? { roomId } : {}) });
    setRead({ data: null, error: null, loading: true });
    fetch(`/api/intelligence/room?${query}`, { signal: controller.signal })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || "تعذرت قراءة القاعة");
        setRead({ data: body, error: null, loading: false });
      })
      .catch(e => { if (e?.name !== "AbortError") setRead({ data: null, error: e.message, loading: false }); });
    return () => controller.abort();
  }, [roomId, code, hall, termId]);

  if (read.loading) return <div className="rpt-insight is-loading" role="status" aria-busy="true"><span className="sr-only">يجري تحميل تفاصيل القاعة</span><i /><i /></div>;
  if (read.error) return <p className="rpt-insight-error" role="status">{read.error}</p>;
  if (!read.data) return null;
  const windowsByDay = read.data.freeWindows.reduce((acc: Record<string, Array<{ start: string; end: string }>>, item) => {
    (acc[item.day] ||= []).push(item);
    return acc;
  }, {});
  const days = Object.keys(windowsByDay).sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
  return (
    <div className="rpt-insight">
      <div className="rpt-insight-kpis">
        <span><CalendarClock aria-hidden="true" /><b>{read.data.totalAppointments}</b>{nounFor(read.data.totalAppointments, AR.appointment)}</span>
        <span><Clock3 aria-hidden="true" /><b>{read.data.freeWindows.length}</b>{nounFor(read.data.freeWindows.length, AR.window)} {nounFor(read.data.freeWindows.length, AR.availableFemAdj)}</span>
      </div>
      {read.data.departments.length ? (
        <section className="rpt-insight-block">
          <header><Building2 aria-hidden="true" /><strong>الأكثر استخداماً</strong></header>
          <div className="rpt-insight-usage">
            {read.data.departments.slice(0, 6).map((item, index) => (
              <span key={index}><b>{item.name}</b><small>{countOf(item.count, AR.meeting)}</small></span>
            ))}
          </div>
        </section>
      ) : null}
      <section className="rpt-insight-block">
        <header><CalendarClock aria-hidden="true" /><strong>النوافذ المتاحة</strong></header>
        {days.length ? (
          <div className="rpt-insight-windows">
            {days.map(day => (
              <article key={day}>
                <b>{day}</b>
                <div>{windowsByDay[day].map((item, index) => <time key={index} dir="ltr">{formatScheduleTimeRange(item.start, item.end)}</time>)}</div>
              </article>
            ))}
          </div>
        ) : <p className="rpt-insight-empty">لا نوافذ متاحة في الأسبوع.</p>}
      </section>
      <p className="rpt-insight-privacy"><ShieldCheck aria-hidden="true" />حجوزات الأقسام الأخرى محسوبة، وتفاصيلها مخفية.</p>
    </div>
  );
}

/** نافذة القاعة من قائمة «الأكثر استخداماً»: النسبة التقديرية ثم تفاصيل الخادم. */
export function RoomInsightDrawer({ room, termId, canReadWorkspace, onClose }: {
  room: { name: string; roomId?: string; code: string; hall: string; utilization: number; sessions: number; site?: string };
  termId: number | string;
  canReadWorkspace: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="query-detail-backdrop no-print" onMouseDown={onClose} aria-hidden="true" />
      <div className="occupancy-pick query-detail-panel rpt-drawer no-print" role="dialog" aria-modal="true" aria-label={`تفاصيل القاعة ${room.name}`}>
        <header>
          <div>
            <small>{room.site || "القاعة"}</small>
            <strong dir="ltr">{room.name}</strong>
          </div>
          <span className="occupancy-pick-count">{room.utilization}%</span>
          <button type="button" data-guide-ignore="إغلاق تفاصيل القاعة؛ للعرض فقط" onClick={onClose} aria-label="إغلاق" title="إغلاق"><X aria-hidden="true" /></button>
        </header>
        <div className="rpt-drawer-body">
          <div className="rpt-meter" aria-label={`استخدام تقديري ${room.utilization}%`}><i style={{ width: `${Math.min(100, room.utilization)}%` }} /></div>
          <p className="rpt-drawer-note">{countOf(room.sessions, AR.appointment)} · استخدام تقديري</p>
          {canReadWorkspace ? <RoomInsight roomId={room.roomId} code={room.code} hall={room.hall} termId={termId} /> : null}
        </div>
      </div>
    </>
  );
}

/** شكل الأسبوع: المحاضرات حيث تقع، والانتظار الطويل بينها. */
export function WeekShapeChart({ shape }: { shape: WeekShape }) {
  return (
    <div className="rpt-week-shape" aria-label="توزيع المحاضرات والانتظار عبر الأسبوع">
      <div className="rpt-week-scale" aria-hidden="true">
        {shape.hours.map(m => <span key={m} dir="ltr">{String(Math.floor(m / 60)).padStart(2, "0")}</span>)}
      </div>
      {shape.days.map(day => (
        <div className="rpt-week-row" key={day.day}>
          <small>{day.label}</small>
          <div className="rpt-week-track">
            {day.waits.map((wait, i) => (
              <i key={`w${i}`} style={{ insetInlineStart: `${wait.left}%`, width: `${wait.width}%` }} title={`انتظار ${formatCompactDurationArabic(wait.minutes)}`}>
                {wait.width > 14 ? <span>{formatCompactDurationArabic(wait.minutes)}</span> : null}
              </i>
            ))}
            {day.blocks.map((block, i) => <b key={`b${i}`} style={{ insetInlineStart: `${block.left}%`, width: `${block.width}%` }} />)}
          </div>
        </div>
      ))}
      <div className="rpt-week-legend" aria-label="مفتاح شكل الأسبوع">
        <span className="teaching"><i />محاضرة</span>
        <span className="waiting"><i />انتظار طويل</span>
      </div>
    </div>
  );
}

/** نافذة «شكل الأسبوع» لأستاذ. */
export function WeekShapeDrawer({ instructorId, name, termId, rows, canReadWorkspace, onClose }: {
  instructorId: number;
  name: React.ReactNode;
  termId: number | string;
  rows: any[];
  canReadWorkspace: boolean;
  onClose: () => void;
}) {
  const [remote, setRemote] = useState<{ rows: any[]; external: number } | null>(null);
  const [loading, setLoading] = useState(canReadWorkspace);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    if (!canReadWorkspace || !instructorId || !termId) { setRemote(null); setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/intelligence/professor/${instructorId}?termId=${encodeURIComponent(String(termId))}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("denied");
        const body = await response.json();
        setRemote({ rows: Array.isArray(body?.visibleRows) ? body.visibleRows : [], external: Number(body?.externalCommitments || 0) });
      })
      /* الخادم رفض أو تعذّر: يبقى الشكل من صفوف التقرير نفسها. */
      .catch(() => { if (!controller.signal.aborted) setRemote(null); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [canReadWorkspace, instructorId, termId]);
  const source = remote && remote.rows.length ? remote.rows : rows;
  const shape = professorWeekShape(source);
  const longest = shape ? shape.days.reduce((most, day) => Math.max(most, day.longest), 0) : 0;
  return (
    <>
      <div className="query-detail-backdrop no-print" onMouseDown={onClose} aria-hidden="true" />
      <div className="occupancy-pick query-detail-panel rpt-drawer no-print" role="dialog" aria-modal="true" aria-label="شكل الأسبوع">
        <header>
          <div>
            <small>شكل الأسبوع</small>
            <strong>{name}</strong>
          </div>
          <button type="button" data-guide-ignore="إغلاق شكل الأسبوع؛ للعرض فقط" onClick={onClose} aria-label="إغلاق" title="إغلاق"><X aria-hidden="true" /></button>
        </header>
        <div className="rpt-drawer-body">
          <div className="rpt-insight-kpis">
            <span><CalendarClock aria-hidden="true" /><b>{shape ? shape.days.length : 0}</b>{nounFor(shape ? shape.days.length : 0, AR.day)}</span>
            <span className={longest >= 180 ? "is-warn" : ""}><Hourglass aria-hidden="true" /><b>{longest ? formatCompactDurationArabic(longest) : "—"}</b>أطول فراغ</span>
            {remote && remote.external ? <span><UserRound aria-hidden="true" /><b>{remote.external}</b>خارج نطاقك</span> : null}
          </div>
          {loading ? (
            <div className="rpt-insight is-loading" role="status" aria-busy="true"><span className="sr-only">يجري تحميل شكل الأسبوع</span><i /><i /></div>
          ) : shape ? <WeekShapeChart shape={shape} /> : <p className="rpt-insight-empty">لا محاضرات لهذا الأستاذ في الفصل.</p>}
        </div>
      </div>
    </>
  );
}
