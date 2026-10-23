import React from "react";
import { Moon, Sun } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";

/**
 * نسبةُ الفترتين (م.7/2) رسماً لا نصّاً: شمسٌ وقمر، وشريطٌ واحدٌ يقسم الشعب بينهما،
 * وعلامتان على الشريط تُريان الحدّين المطلوبين (50–70% صباحاً). النسبةُ خارج المنطقة
 * الخضراء تُلوَّن بلون التنبيه، فيُقرأ المعنى دون جملةٍ واحدة.
 */
const MORNING_MIN = 50;
const MORNING_MAX = 70;
const nf = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");

export default function PeriodBalanceInfographic({ morning, evening, sections }: { morning: number; evening: number; sections: number }) {
  const morningOk = morning >= MORNING_MIN && morning <= MORNING_MAX;
  const tone = morningOk ? "ok" : "off";
  return (
    <div className={`period-balance period-balance--${tone}`} role="img" aria-label={`الصباحية ${nf(morning)}% والمسائية ${nf(evening)}% من ${countOf(sections, AR.section)}. المطلوب: صباحية بين ${nf(MORNING_MIN)} و${nf(MORNING_MAX)}%`}>
      <div className="period-balance-side period-balance-side--day">
        <Sun aria-hidden="true" />
        <b>{nf(morning)}%</b>
      </div>
      <div className="period-balance-bar" aria-hidden="true">
        <i className="period-balance-fill" style={{ width: `${morning}%` }} />
        <span className="period-balance-zone" style={{ insetInlineStart: `${MORNING_MIN}%`, width: `${MORNING_MAX - MORNING_MIN}%` }} />
      </div>
      <div className="period-balance-side period-balance-side--night">
        <b>{nf(evening)}%</b>
        <Moon aria-hidden="true" />
      </div>
    </div>
  );
}
