import React from "react";
import { ArrowLeft, ArrowRight, Check, Moon, Sun } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import type { PeriodBalanceData } from "../utils/scheduleRegulations";

/**
 * نسبةُ الفترتين (م.7/2) رسماً لا نصّاً: كلُّ شعبةٍ قطعةٌ في شريطٍ واحد، الصباحيةُ من
 * جهة الشمس والمسائيةُ من جهة القمر. القطعُ الزائدةُ عن الحدّ تتلوّن وتحمل سهماً نحو
 * الجهة التي تُنقل إليها، ويُكتب بجانبها رقمٌ واحد: كم شعبةً تُنقل. فيُعدّ الفرقُ بالعين
 * بدل أن يُحسب من نسبتين وحدّين.
 */
const MORNING_MIN = 0.5;
const MORNING_MAX = 0.7;
const nf = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");

export default function PeriodBalanceInfographic({ morning, evening, sections, morningCount }: PeriodBalanceData) {
  const most = Math.floor(sections * MORNING_MAX);
  const least = Math.ceil(sections * MORNING_MIN);
  const surplus = Math.max(0, morningCount - most);
  const shortfall = Math.max(0, least - morningCount);
  const move = surplus || shortfall;
  const toEvening = surplus > 0;
  const tight = sections > 60;
  const cells = Array.from({ length: sections }, (_, index) => {
    const isMorning = index < morningCount;
    const flagged = isMorning ? index >= most : index < morningCount + shortfall;
    return { isMorning, flagged };
  });
  const label = `الصباحية ${nf(morning)}% والمسائية ${nf(evening)}% من ${countOf(sections, AR.section)}`
    + (move ? `. انقل ${countOf(move, AR.section)} ${toEvening ? "إلى المساء" : "إلى الصباح"}` : ". ضمن المطلوب");
  return (
    <div className={`period-balance ${move ? "period-balance--off" : "period-balance--ok"}`} role="img" aria-label={label} title={label}>
      <div className="period-balance-side"><Sun aria-hidden="true" /><b>{nf(morning)}%</b></div>
      <div className={`period-balance-strip ${tight ? "is-tight" : ""}`} aria-hidden="true">
        {cells.map((cell, index) => (
          <i key={index} className={`pb-cell ${cell.isMorning ? "pb-cell--day" : "pb-cell--night"} ${cell.flagged ? "pb-cell--move" : ""}`} />
        ))}
      </div>
      <div className="period-balance-side"><b>{nf(evening)}%</b><Moon aria-hidden="true" /></div>
      <div className="period-balance-verdict" aria-hidden="true">
        {move ? (
          <span className="pb-move">
            <b>{nf(move)}</b>
            {toEvening ? <><ArrowLeft /><Moon /></> : <><ArrowRight /><Sun /></>}
          </span>
        ) : <span className="pb-ok"><Check /></span>}
      </div>
    </div>
  );
}
