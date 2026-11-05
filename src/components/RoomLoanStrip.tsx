import React, { useMemo } from "react";
import { ArrowDownLeft, ArrowUpLeft } from "lucide-react";
import { loanStripOf, type HallBarterWindow } from "../utils/hallBarterWindow";
import { SCHEDULE_DAY_END, SCHEDULE_DAY_SPAN, SCHEDULE_DAY_START } from "../utils/scheduleTime";

const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];
const hours = (value: number) => Math.round(value / 6) / 10;

/** ساعاتُ الإعارة والاستعارة في رسمٍ أسبوعيٍّ واحد: كل يومٍ شريطٌ من أول الدوام إلى آخره. */
export default function RoomLoanStrip({ rows, collegeId, sectionId }: { rows: HallBarterWindow[]; collegeId: number; sectionId: number }) {
  const strip = useMemo(() => loanStripOf(rows, collegeId, sectionId), [rows, collegeId, sectionId]);
  if (!strip.lentMinutes && !strip.borrowedMinutes) return null;
  return (
    <figure className="room-loan-strip" aria-label={`الساعات الأسبوعية: معار ${hours(strip.lentMinutes)}، مستعار ${hours(strip.borrowedMinutes)}`}>
      <figcaption className="room-loan-legend">
        <span className="lent"><ArrowUpLeft aria-hidden="true" />معار <b dir="ltr">{hours(strip.lentMinutes)}</b> س</span>
        <span className="borrowed"><ArrowDownLeft aria-hidden="true" />مستعار <b dir="ltr">{hours(strip.borrowedMinutes)}</b> س</span>
      </figcaption>
      {strip.days.map((line, index) => (
        <div className="room-loan-day" key={line.day}>
          <span>{DAY_NAMES[index]}</span>
          <div className="room-loan-track">
            {line.segments.map(segment => (
              <i key={`${segment.kind}-${segment.room}-${segment.start}`} className={segment.kind} title={segment.room}
                style={{ insetInlineStart: `${(Math.max(0, segment.start - SCHEDULE_DAY_START) / SCHEDULE_DAY_SPAN) * 100}%`, width: `${((Math.min(SCHEDULE_DAY_END, segment.end) - Math.max(SCHEDULE_DAY_START, segment.start)) / SCHEDULE_DAY_SPAN) * 100}%` }} />
            ))}
          </div>
        </div>
      ))}
      <div className="room-loan-axis" aria-hidden="true"><span>8</span><span>14</span><span>20</span></div>
    </figure>
  );
}
