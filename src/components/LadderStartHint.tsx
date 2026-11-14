/**
 * ── «البداية حسب اللائحة» بجانب حقل البداية (المالك 2026-11-14) ────────────────────
 * يكتب صاحبُ الجدول 12:00 يوم الاثنين، فيظهر في اللحظة نفسها وقبل الحفظ أقربُ بدايةٍ على سُلّم
 * أيامه (12:30)، وضغطةٌ واحدة تضعها. تنبيهٌ لا يمنع: الحفظ على 12:00 يبقى متاحاً كما كان.
 * لا يظهر حين توافق البدايةُ السُّلّم، ولا لأيامٍ مختلطة أو بلا أيام (لا سُلّمَ واحداً لها).
 */
import { ladderStartNear, startLadderNote, toMinutes, type DayKey } from "../utils/scheduleRegulations";

type Props = {
  days: Iterable<DayKey>;
  start: string;
  /** طول اللقاء بالدقائق، كي لا تُقترح بدايةٌ لا يتّسع بعدها قبل نهاية اليوم. */
  length?: number;
  onPick: (time: string) => void;
};

export function ladderSuggestionFor(days: Iterable<DayKey>, start: string, length = 0): string | null {
  const list = [...new Set(days)];
  if (!start || !startLadderNote(list, start)) return null;
  const near = ladderStartNear(list, toMinutes(start), Math.max(0, length));
  return near && near !== start ? near : null;
}

export function LadderStartHint({ days, start, length = 0, onPick }: Props) {
  const list = [...new Set(days)];
  const near = ladderSuggestionFor(list, start, length);
  if (!near) return null;
  return (
    <p className="ladder-start-hint" role="status" dir="rtl">
      <span>البداية حسب اللائحة:</span>
      <button type="button" dir="ltr" aria-label={`اجعل البداية ${near}`}
        data-guide-ignore="يضع بداية الموعد على أقرب بداية في سُلّم اللائحة؛ لا يحفظ شيئاً"
        onClick={() => onPick(near)}>{near}</button>
    </p>
  );
}
