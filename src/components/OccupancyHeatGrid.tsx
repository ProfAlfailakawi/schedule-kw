import React from "react";
import type { OccupancyHeat } from "../utils/occupancyHeat";
import { AR, countOf } from "../utils/arabicCount";

/**
 * ── شبكة نسبة الإشغال ──────────────────────────────────────────────────────
 *
 * بلغة خريطة حرارة الأسبوع نفسها — مربعٌ مستدير لكل ساعة، يشتدّ لونه بزحامه،
 * وحلقةٌ حمراء حول الذروة — لكن كل مربعٍ يقول رقمه: كم محاضرةً في هذه الساعة
 * من هذا اليوم. وفي طرف كل يومٍ نسبة إشغال قاعاته. والمربع سؤالٌ له جواب:
 * الضغط عليه يفتح المحاضرات التي خلفه، والضغط على اسم اليوم يفتح يومه كله.
 */

export type OccupancyPick = { day: number; hour: number | null; collegeId?: number };

const two = (value: number) => String(value).padStart(2, "0");
const hourLabel = (minutes: number) => two(Math.floor(minutes / 60));
const slotLabel = (minutes: number) => `${two(Math.floor(minutes / 60))}:${two(minutes % 60)}`;
const num = (value: number) => Number(value || 0).toLocaleString("ar-KW-u-nu-latn");

export default function OccupancyHeatGrid({ heat, pick, onPick, collegeId, label, compact = false }: {
  heat: OccupancyHeat;
  pick?: OccupancyPick | null;
  onPick?: (pick: OccupancyPick | null) => void;
  /** شبكة كليةٍ واحدة داخل عائلة القسم: اختيارها يخصّها. */
  collegeId?: number;
  label?: string;
  compact?: boolean;
}) {
  const picked = (day: number, hour: number | null) =>
    Boolean(pick && pick.day === day && pick.hour === hour && (pick.collegeId ?? 0) === (collegeId ?? 0));
  const toggle = (day: number, hour: number | null) =>
    onPick?.(picked(day, hour) ? null : { day, hour, ...(collegeId ? { collegeId } : {}) });

  return (
    <table className={`occupancy-heat${compact ? " is-compact" : ""}`} aria-label={label || "نسبة الإشغال: الأيام × الساعات"}>
      <colgroup>
        <col className="occupancy-heat-day-col" />
        {heat.hours.map(hour => <col key={hour} />)}
        <col className="occupancy-heat-rate-col" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col"><span className="sr-only">اليوم</span></th>
          {heat.hours.map((hour, index) => (
            <th key={hour} scope="col" dir="ltr" className={index % 2 ? "is-odd" : undefined}>{hourLabel(hour)}</th>
          ))}
          <th scope="col" className="occupancy-heat-rate-head">الإشغال</th>
        </tr>
      </thead>
      <tbody>
        {heat.days.map(day => (
          <tr key={day.index}>
            <th scope="row">
              {onPick ? (
                <button type="button" className="occupancy-heat-day" aria-pressed={picked(day.index, null)}
                  data-guide-ignore="فتح محاضرات اليوم كله؛ عرضٌ فقط"
                  title={`كل محاضرات ${day.label}: ${countOf(day.lectures, AR.lecture)}`}
                  onClick={() => toggle(day.index, null)}>{day.label}</button>
              ) : <span className="occupancy-heat-day">{day.label}</span>}
            </th>
            {day.cells.map((cell, hourIndex) => {
              const isPeak = heat.peak?.day === day.index && heat.peak?.hour === hourIndex;
              const title = cell.count
                ? `${day.label} ${slotLabel(cell.hour)}–${slotLabel(cell.hour + 60)} · ${countOf(cell.count, AR.lecture)} · ${num(cell.rooms)} من ${countOf(heat.rooms, AR.room)} (${num(cell.rate)}٪)`
                : `${day.label} ${slotLabel(cell.hour)} · لا محاضرات`;
              return (
                <td key={cell.hour}>
                  {onPick ? (
                    <button type="button" className="occupancy-heat-cell" data-level={cell.level} data-peak={isPeak ? "1" : undefined}
                      aria-pressed={picked(day.index, cell.hour)} aria-label={title} title={title}
                      data-guide-ignore="فتح محاضرات هذه الساعة؛ عرضٌ فقط"
                      onClick={() => toggle(day.index, cell.hour)}>
                      {cell.count ? <b>{cell.count}</b> : null}
                    </button>
                  ) : (
                    <span className="occupancy-heat-cell" data-level={cell.level} data-peak={isPeak ? "1" : undefined} title={title}>
                      {cell.count ? <b>{cell.count}</b> : null}
                    </span>
                  )}
                </td>
              );
            })}
            <td className="occupancy-heat-rate" title={`${day.label}: ${num(day.rate)}٪ من ساعات القاعات`}>
              <b dir="ltr">{num(day.rate)}٪</b>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
