import React, { useEffect, useMemo, useState } from "react";
import { Building2, DoorOpen, Search, UserRound, X } from "lucide-react";
import { DnaRing } from "./dna";
import VisitingBadge from "./VisitingBadge";
import { AR, countOf, nounFor } from "../utils/arabicCount";
import { groupSlotRows, visibleSlotGroups, type SlotRow } from "../utils/occupancySlot";

/**
 * ── لوحة خانةٍ من «نسبة الإشغال» ───────────────────────────────────────────
 *
 * الضغط على خانةٍ (يوم × ساعة) أو على اسم يوم يفتح محاضراته. الرأس: الوقت،
 * وحلقة إشغال القاعات، ورقائق المواقع (بنات · بنين · الجهراء …) تُرشِّح بعددها.
 * والجسم: المحاضرات تحت مواقعها — فلا يتكرّر اسم الكلية في كل صفّ — وكل صفٍّ
 * يقول المقرر كاملاً والأستاذ كاملاً والشعبة والقاعة والوقت. لا قصّ بالنقاط:
 * الاسم الطويل ينزل سطراً ثانياً. ويُبحث فيها حين تطول.
 */

export interface SlotPanelRow extends SlotRow {
  start: string;
  end: string;
  visiting: boolean;
  /** شارة الخطة بجانب اسم المقرر. */
  badge?: React.ReactNode;
}

/** من هذا العدد فما فوق يظهر البحث. */
export const SLOT_SEARCH_FROM = 9;

const num = (value: number) => Number(value || 0).toLocaleString("ar-KW-u-nu-latn");

const NO_ORDER: number[] = [];

export default function OccupancySlotPanel({ day, range, rate, busyRooms, totalRooms, rows, campusOrder = NO_ORDER, scopeLabel, onClose }: {
  /** يُعاد بناء اللوحة (رقيقتها وبحثها) مع كل خانةٍ جديدة. */
  key?: string;
  day: string;
  /** «12:00–13:00» لخانةٍ، ولا شيء لليوم كله. */
  range?: string | null;
  rate: number;
  /** القاعات المشغولة في الخانة؛ لا تُذكر لليوم كله. */
  busyRooms?: number | null;
  totalRooms: number;
  rows: SlotPanelRow[];
  campusOrder?: number[];
  /** اسم النطاق لخانةٍ بلا محاضرات؛ وإلا فالموقع من الصفوف. */
  scopeLabel?: string;
  onClose: () => void;
}) {
  const [campus, setCampus] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const groups = useMemo(() => groupSlotRows(rows, campusOrder), [rows, campusOrder]);
  const multi = groups.length > 1;
  /* موقعٌ واحد: اسمه من صفوفه نفسها لا من الكلية المختارة — خانةٌ في عائلة القسم
     قد لا يكون فيها إلا محاضرات بنين والكلية المفتوحة بنات. والنطاق لخانةٍ فارغة. */
  const campusLine = multi ? "" : groups.length === 1 ? groups[0].label : scopeLabel || "";
  const visible = useMemo(() => visibleSlotGroups(groups, campus, query), [groups, campus, query]);
  const shown = visible.reduce((sum, group) => sum + group.rows.length, 0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const roomsLine = busyRooms != null
    ? <><b>{num(busyRooms)}</b> من {countOf(totalRooms, AR.room)}</>
    : <>إشغال اليوم كله</>;

  return (
    <>
      <div className="query-detail-backdrop no-print" onMouseDown={onClose} aria-hidden="true" />
      <div className="occupancy-slot query-detail-panel no-print" role="dialog" aria-modal="true" aria-label={`محاضرات ${day}`}>
        <header className="occupancy-slot-head">
          <DnaRing value={rate} max={100} size={64} stroke={6} tone={rate >= 85 ? "danger" : rate >= 60 ? "amber" : "accent"}
            label={`${num(rate)}٪`} sublabel={busyRooms != null ? <span dir="ltr">{num(busyRooms)}/{num(totalRooms)}</span> : null}
            ariaLabel={`إشغال القاعات ${num(rate)}٪`} className="occupancy-slot-ring" />
          <div className="occupancy-slot-title">
            <small>{range ? day : "اليوم كله"}{campusLine ? <> · <span className="occupancy-slot-scope" title={groups[0]?.rows[0]?.campusName}>{campusLine}</span></> : null}</small>
            {range ? <strong dir="ltr">{range}</strong> : <strong>{day}</strong>}
            <span className="occupancy-slot-facts"><span><b>{num(rows.length)}</b> {nounFor(rows.length, AR.lecture)}</span><span>{roomsLine}</span></span>
          </div>
          <button type="button" className="occupancy-slot-close" data-guide-ignore="إغلاق تفاصيل نسبة الإشغال فقط" onClick={onClose} aria-label="إغلاق" title="إغلاق"><X aria-hidden="true" /></button>
        </header>
        {multi || rows.length >= SLOT_SEARCH_FROM ? (
          <div className="occupancy-slot-tools">
            {multi ? (
              <div className="occupancy-slot-campuses" role="group" aria-label="المواقع">
                <button type="button" aria-pressed={campus == null} data-guide-ignore="ترشيح محاضرات الخانة بالموقع؛ عرضٌ فقط" onClick={() => setCampus(null)}>
                  الكل <b>{num(rows.length)}</b>
                </button>
                {groups.map(group => (
                  <button key={group.campusId} type="button" data-campus={group.campusId} aria-pressed={campus === group.campusId}
                    data-guide-ignore="ترشيح محاضرات الخانة بالموقع؛ عرضٌ فقط"
                    title={group.rows[0]?.campusName}
                    onClick={() => setCampus(campus === group.campusId ? null : group.campusId)}>
                    {group.label} <b>{num(group.rows.length)}</b>
                  </button>
                ))}
              </div>
            ) : null}
            {rows.length >= SLOT_SEARCH_FROM ? (
              <label className="occupancy-slot-search">
                <Search aria-hidden="true" />
                <input type="search" value={query} onChange={event => setQuery(event.target.value)}
                  placeholder="مقرر، أستاذ، قاعة…" aria-label="بحث في محاضرات الخانة" />
              </label>
            ) : null}
          </div>
        ) : null}
        {shown ? (
          <div className="occupancy-slot-body">
            {visible.map(group => (
              <section key={group.campusId} className="occupancy-slot-group" data-campus={group.campusId}>
                {multi ? (
                  <h3 className="occupancy-slot-group-head" title={group.rows[0]?.campusName}>
                    <Building2 aria-hidden="true" /><span>{group.label}</span><b>{num(group.rows.length)}</b>
                  </h3>
                ) : null}
                <ol className="occupancy-slot-rows">
                  {group.rows.map(row => (
                    <li key={row.id} className="occupancy-slot-row">
                      <time className="occupancy-slot-time" dir="ltr"><b>{row.start}</b><span>{row.end}</span></time>
                      <div className="occupancy-slot-course">
                        <strong className="occupancy-slot-name">{row.course}{row.badge}</strong>
                        {row.code ? <code className="occupancy-slot-code" dir="ltr">{row.code}</code> : null}
                      </div>
                      <span className="occupancy-slot-teacher"><UserRound aria-hidden="true" /><span className="occupancy-slot-teacher-name">{row.teacher}</span>{row.visiting ? <VisitingBadge compact /> : null}</span>
                      <span className="occupancy-slot-meta">
                        {row.section ? <span className="occupancy-slot-section">شعبة <b dir="ltr">{row.section}</b></span> : null}
                        <span className="occupancy-slot-room" data-empty={row.room ? undefined : "1"}><DoorOpen aria-hidden="true" /><b dir={row.room ? "ltr" : undefined}>{row.room || "بلا قاعة"}</b></span>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        ) : <p className="occupancy-slot-empty">{rows.length ? "لا محاضرات تطابق البحث." : "لا محاضرات في هذا الوقت."}</p>}
      </div>
    </>
  );
}
