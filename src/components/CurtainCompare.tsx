/**
 * ── ستارة قبل/بعد فوق الأسبوع ────────────────────────────────────────────────
 *
 * الأسبوعُ مرسوماً مرّتين بالقراءة نفسها التي ترسم «المنزلقة الزمنية»: «قبل» و«بعد»
 * فوق بعضهما، ومقبضٌ يُسحب (أو يُحرَّك بالأسهم) فيكشف من هذا ومن ذاك. «قبل» من جهة
 * بداية القراءة (اليمين)، و«بعد» من الجهة الأخرى. عرضٌ صرف: لا يكتب شيئاً.
 */
import React, { useMemo, useRef, useState } from "react";
import type { FSchedule } from "../types";
import { TM_DAYS, dayLabel, type TmContext } from "../utils/timeMachine";
import { activeDays, timeToMinutes } from "../utils/scheduleIntelligence";
import { SCHEDULE_DAY_END, SCHEDULE_DAY_START } from "../utils/scheduleTime";
import "../styles/95-time-machine-metro.css";

type Kind = "same" | "moved" | "added" | "removed";

export default function CurtainCompare({ before, after, context, focus }: { before: FSchedule[]; after: FSchedule[]; context: TmContext; focus?: Set<number> }) {
  /* موضع المقبض بالنسبة من اليسار: ما يمينه «قبل» وما يساره «بعد». */
  const [split, setSplit] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const inScope = (row: FSchedule) => Number(row.AdCollegeId) === context.scope.collegeId && Number(row.AdSectionId) === context.scope.sectionId;
  const layers = useMemo(() => {
    const b = new Map(before.filter(inScope).map(row => [Number(row.id), row]));
    const a = new Map(after.filter(inScope).map(row => [Number(row.id), row]));
    const clocks = [...b.values(), ...a.values()].filter(row => row.fstarttime && row.fendtime);
    const axisStart = Math.min(SCHEDULE_DAY_START, ...clocks.map(row => timeToMinutes(row.fstarttime)));
    const axisEnd = Math.max(SCHEDULE_DAY_END, ...clocks.map(row => timeToMinutes(row.fendtime)));
    const span = Math.max(1, axisEnd - axisStart);
    const kindOf = (id: number): Kind => {
      const x = b.get(id), y = a.get(id);
      if (!x) return "added";
      if (!y) return "removed";
      const changed = x.fstarttime !== y.fstarttime || activeDays(x).join() !== activeDays(y).join() || x.AdRoomHall !== y.AdRoomHall || x.AdInstructorId !== y.AdInstructorId;
      return changed ? "moved" : "same";
    };
    const draw = (rows: Map<number, FSchedule>) => [...rows.values()].flatMap(row => activeDays(row).map(day => ({
      key: `${row.id}-${day}`, id: Number(row.id), day: TM_DAYS.indexOf(day as any), kind: kindOf(Number(row.id)), label: String(row.AdCourseName || ""),
      top: (timeToMinutes(row.fstarttime) - axisStart) / span * 100,
      height: Math.max(2.5, (timeToMinutes(row.fendtime) - timeToMinutes(row.fstarttime)) / span * 100),
    })));
    return { before: draw(b), after: draw(a) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [before, after, context.scope.collegeId, context.scope.sectionId]);

  const week = (blocks: typeof layers.before, side: "before" | "after") => (
    <div className={`tm-week tm-curtain-layer is-${side}`} aria-hidden="true">
      {TM_DAYS.map((day, index) => (
        <div key={day} className="tm-week-day">
          <span>{dayLabel(day)}</span>
          <div className="tm-week-col">
            {blocks.filter(block => block.day === index).map(block => (
              <i key={block.key} className={`tm-block tm-block-${block.kind}${focus?.has(block.id) ? " is-focus" : ""}`} style={{ top: `${block.top}%`, height: `${block.height}%` }} title={block.label} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const fromPointer = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || !rect.width) return;
    setSplit(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
  };
  const moved = layers.after.filter(block => block.kind !== "same").length + layers.before.filter(block => block.kind === "removed").length;
  return (
    <figure className="tm-curtain">
      <figcaption className="tm-curtain-head">
        <b>ستارة قبل/بعد</b>
        <small>اسحب المقبض: يمينه الأسبوع قبل، ويساره بعد{moved ? "" : " — لا فرق في الأسبوع"}</small>
      </figcaption>
      <div className="tm-curtain-stage" ref={box}
        onPointerDown={event => { dragging.current = true; (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId); fromPointer(event.clientX); }}
        onPointerMove={event => { if (dragging.current) fromPointer(event.clientX); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}>
        {week(layers.after, "after")}
        <div className="tm-curtain-before" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>{week(layers.before, "before")}</div>
        <span className="tm-curtain-tag is-before" aria-hidden="true">قبل</span>
        <span className="tm-curtain-tag is-after" aria-hidden="true">بعد</span>
        <div className="tm-curtain-handle" style={{ left: `${split}%` }} role="slider" tabIndex={0}
          aria-label="ستارة قبل وبعد" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(100 - split)} aria-valuetext={`قبل ${Math.round(100 - split)}٪`}
          data-guide-ignore="مقبض ستارة المقارنة في آلة الزمن؛ عرضٌ لا يكتب في الجدول"
          onKeyDown={event => {
            if (event.key === "ArrowLeft") { event.preventDefault(); setSplit(v => Math.max(0, v - 5)); }
            else if (event.key === "ArrowRight") { event.preventDefault(); setSplit(v => Math.min(100, v + 5)); }
            else if (event.key === "Home") { event.preventDefault(); setSplit(100); }
            else if (event.key === "End") { event.preventDefault(); setSplit(0); }
          }}>
          <i aria-hidden="true" />
        </div>
      </div>
    </figure>
  );
}
