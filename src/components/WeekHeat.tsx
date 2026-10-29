import React, { useMemo } from "react";
import { Flame, Leaf } from "lucide-react";
import type { FSchedule } from "../types";
import { normalizeClock } from "../utils/scheduleTime";
import { AR, countOf } from "../utils/arabicCount";

/**
 * ── خريطة حرارة الأسبوع ─────────────────────────────────────────────────────
 *
 * فوق «مواعيد القسم» مباشرة: خمسة أيام × ساعات الدوام، وكل خانةٍ بلون ازدحامها.
 * ازدحامُ الأحد صباحاً وفراغُ الخميس يُريان بنظرة، قبل قراءة أي صف. تُحسب من
 * الصفوف المعروضة نفسها (بعد التصفية)، فلا طلبَ جديداً ولا رقمَ غير ما في القائمة.
 */

const DAYS = [
  ["fsunday", "الأحد"],
  ["fmonday", "الاثنين"],
  ["ftuesday", "الثلاثاء"],
  ["fwednesday", "الأربعاء"],
  ["fthursday", "الخميس"],
] as const;
const FIRST_HOUR = 8;
const HOURS = 12; // 08:00 → 20:00

const minutesOf = (value: unknown) => {
  const [h, m] = normalizeClock(value).split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : NaN;
};

export default function WeekHeat({ rows }: { rows: FSchedule[] }) {
  const model = useMemo(() => {
    const cells = DAYS.map(() => Array.from({ length: HOURS }, () => ({ count: 0, names: [] as string[] })));
    for (const row of rows) {
      const start = minutesOf(row.fstarttime), end = minutesOf(row.fendtime);
      if (!(end > start)) continue;
      DAYS.forEach(([key], day) => {
        if (!(row as any)[key]) return;
        for (let hour = 0; hour < HOURS; hour++) {
          const from = (FIRST_HOUR + hour) * 60, to = from + 60;
          if (start < to && end > from) {
            const cell = cells[day][hour];
            cell.count++;
            const name = String(row.AdCourseName || "").trim();
            if (name && cell.names.length < 5 && !cell.names.includes(name)) cell.names.push(name);
          }
        }
      });
    }
    const max = Math.max(1, ...cells.flat().map(cell => cell.count));
    let peak = { day: -1, hour: -1, count: 0 };
    cells.forEach((line, day) => line.forEach((cell, hour) => { if (cell.count > peak.count) peak = { day, hour, count: cell.count }; }));
    const totals = cells.map(line => line.reduce((sum, cell) => sum + cell.count, 0));
    const quiet = totals.indexOf(Math.min(...totals));
    return { cells, max, peak, quiet };
  }, [rows]);

  if (!rows.length || model.peak.count === 0) return null;
  const clock = (hour: number) => String(FIRST_HOUR + hour).padStart(2, "0");
  const summary = `الذروة ${DAYS[model.peak.day][1]} ${clock(model.peak.hour)}:00 بـ${countOf(model.peak.count, AR.appointment)}، والأهدأ ${DAYS[model.quiet][1]}`;

  return (
    <section className="week-heat no-print" role="img" aria-label={`خريطة ازدحام الأسبوع: ${summary}`}>
      <header className="week-heat-head" aria-hidden="true">
        <span className="week-heat-chip is-peak"><Flame /> {DAYS[model.peak.day][1]} <b dir="ltr">{clock(model.peak.hour)}:00</b> · {countOf(model.peak.count, AR.appointment)}</span>
        <span className="week-heat-chip is-quiet"><Leaf /> الأهدأ {DAYS[model.quiet][1]}</span>
      </header>
      <div className="week-heat-grid" aria-hidden="true">
        <span className="week-heat-corner" />
        {Array.from({ length: HOURS }, (_, hour) => <span key={hour} className="week-heat-hour" dir="ltr">{hour % 2 === 0 ? clock(hour) : ""}</span>)}
        {model.cells.map((line, day) => (
          <React.Fragment key={day}>
            <span className="week-heat-day">{DAYS[day][1]}</span>
            {line.map((cell, hour) => (
              <i key={hour} className="week-heat-cell"
                data-level={cell.count ? Math.max(1, Math.ceil((cell.count / model.max) * 4)) : 0}
                data-peak={day === model.peak.day && hour === model.peak.hour ? "1" : undefined}
                title={cell.count ? `${DAYS[day][1]} ${clock(hour)}:00 · ${countOf(cell.count, AR.appointment)}\n${cell.names.join("\n")}` : `${DAYS[day][1]} ${clock(hour)}:00 · فارغة`} />
            ))}
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}
