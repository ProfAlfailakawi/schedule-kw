/**
 * نظرةُ المبنى: لكل قاعةٍ شريطُ حرارةٍ هادئٌ ليومٍ واحد (خلايا ساعية؛ الأغمق أشغل) ونسبةُ إشغالها، بلا نصٍّ داخل الشريط.
 * ضغطُ الصفّ يفتح القاعة. أيامُ التدريس شرائحُ فوق القائمة.
 */
import React from "react";
import { hourCells, occupancyPercent, type RxDay, type RxRoom } from "../utils/roomsExplorerModel";

interface Props {
  rooms: RxRoom[];
  days: RxDay[];
  dayIndex: number;
  onDay: (index: number) => void;
  onOpenRoom: (key: string) => void;
  windowStart: number;
  windowEnd: number;
}

export default function RoomsOverview({ rooms, days, dayIndex, onDay, onOpenRoom, windowStart, windowEnd }: Props) {
  return (
    <div className="rx-ov">
      <div className="rx-ov-days" role="group" aria-label="اليوم المعروض في نظرة المبنى">
        {days.map((day, index) => (
          <button
            key={day.key}
            type="button"
            className="rx-chip"
            aria-pressed={index === dayIndex}
            data-guide-ignore="اختيار يوم نظرة المبنى؛ عرض فقط"
            onClick={() => onDay(index)}
          >
            {day.label}
          </button>
        ))}
      </div>
      <div className="rx-ov-rows">
        {rooms.map(room => {
          const percent = occupancyPercent([room.perDay[dayIndex] || []], windowStart, windowEnd);
          const cells = hourCells(room.perDay[dayIndex] || [], windowStart, windowEnd);
          return (
            <button
              key={room.key}
              type="button"
              className="rx-ov-row"
              data-guide-ignore="فتح قاعةٍ من نظرة المبنى؛ تنقّلٌ بين العرضين"
              aria-label={`قاعة ${room.label}، إشغال ${days[dayIndex]?.label || "اليوم"} ${percent}%، اضغط لفتحها`}
              onClick={() => onOpenRoom(room.key)}
            >
              <b dir="ltr">{room.label}</b>
              <span className="rx-heat" aria-hidden="true">
                {cells.map((level, index) => <i key={index} className={level >= 0.75 ? "is-busy" : level > 0 ? "is-part" : ""} />)}
              </span>
              <span className="rx-ov-pct" dir="ltr">{percent}%</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
