import React from "react";
import { ArrowLeft, ArrowRight, Check, Moon, Sun } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import type { PeriodBalanceData } from "../utils/scheduleRegulations";

/**
 * نسبةُ الفترتين (م.7/2) رسماً لا نصّاً: كلُّ موعدٍ في الجدول قطعةٌ في شريطٍ واحد (الإجمالي كاملاً)، الصباحيةُ من
 * جهة الشمس والمسائيةُ من جهة القمر. القطعُ الزائدةُ عن الحدّ تتلوّن وتحمل سهماً نحو
 * الجهة التي تُنقل إليها، ويُكتب بجانبها رقمٌ واحد: كم شعبةً تُنقل. فيُعدّ الفرقُ بالعين
 * بدل أن يُحسب من نسبتين وحدّين.
 */
const MORNING_MIN_PERCENT = 50;
const MORNING_MAX_PERCENT = 70;
const nf = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");

/** مقياسٌ لفترةٍ واحدة: منطقةُ المطلوب مظلَّلة، ودبّوسٌ عند الحالي. */
function Gauge({ icon, hours, value, min, max }: { icon: React.ReactNode; hours: string; value: number; min: number; max: number }) {
  const ok = value >= min && value <= max;
  return (
    <div className={`pb-gauge ${ok ? "pb-gauge--ok" : "pb-gauge--off"}`}>
      <div className="pb-gauge-head">{icon}<small dir="ltr">{hours}</small></div>
      <div className="pb-gauge-track">
        <span className="pb-gauge-band" style={{ insetInlineStart: `${min}%`, width: `${max - min}%` }} />
        <i className="pb-gauge-pin" style={{ insetInlineStart: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <div className="pb-gauge-foot"><b dir="ltr">{nf(min)}–{nf(max)}%</b></div>
    </div>
  );
}

export default function PeriodBalanceInfographic({ morning, evening, sections, morningCount }: PeriodBalanceData) {
  /* بالأعداد الصحيحة: 90 × 0.7 تُحسب 62.999… فيهبط الحدّ درجة. */
  const most = Math.floor((sections * MORNING_MAX_PERCENT) / 100);
  const least = Math.ceil((sections * MORNING_MIN_PERCENT) / 100);
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
  const label = `الصباحية ${nf(morning)}% والمسائية ${nf(evening)}% من ${countOf(sections, AR.appointment)}`
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
      <div className="period-balance-rule" aria-hidden="true">
        <Gauge icon={<Sun />} hours="8 AM – 2 PM" value={morning} min={50} max={70} />
        <span className="pb-rule-ref">م.7/2</span>
        <Gauge icon={<Moon />} hours="2 PM – 8 PM" value={evening} min={30} max={50} />
      </div>
    </div>
  );
}
