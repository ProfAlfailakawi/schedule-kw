import { Equal, History, Minus, Plus } from "lucide-react";
import { DAY_LABELS } from "../../utils/naturalQuery";

/* أحرفُ الأيام المتعارفة في الجداول: ح ن ث ر خ — حرفٌ يكفي خريطةً صغيرة. */
const DAY_LETTER = ["ح", "ن", "ث", "ر", "خ"];

export interface CompareCell { day: number; hour: number; before: number; now: number }
export interface HistoryPoint { id: string; label: string; createdAt: string; rowCount: number }

const n = (value: number) => Number(value || 0).toLocaleString("ar-KW-u-nu-latn");
const hourText = (minutes: number) => String(Math.floor(minutes / 60)).padStart(2, "0");

/**
 * ── المقارنة بنسخةٍ سابقة: خريطةٌ بلونين ────────────────────────────────────
 * الأسبوع شبكةٌ صغيرة (أيامٌ × ساعات): أخضر ما زاد، أحمر ما نقص، رمادي ما بقي. موعدٌ تحرّك يظهر
 * أحمرَ في مكانه القديم وأخضرَ في الجديد. فوقها ثلاثة أرقام بأيقوناتها، لا فقرة.
 */
export default function QueryCompare({ points, pickId, onPick, loading, cells, hours, summary, kind }: {
  points: HistoryPoint[]; pickId: string; onPick: (id: string) => void; loading: boolean;
  cells: CompareCell[] | null; hours: number[]; kind: "fairness" | "occupancy";
  summary: { added: number; removed: number; same: number; fairness?: { before: number | null; now: number | null } } | null;
}) {
  const byKey = new Map(cells?.map(cell => [`${cell.day}:${cell.hour}`, cell]) || []);
  return (
    <div className="history-compare no-print">
      <label className="history-pick">
        <History aria-hidden="true" />
        <select value={pickId} onChange={event => onPick(event.target.value)} aria-label="قارن بنسخةٍ سابقة" title="قارن بنسخةٍ سابقة">
          <option value="">قبل…</option>
          {points.map(point => (
            <option key={point.id} value={point.id}>{point.label} · {new Date(point.createdAt).toLocaleDateString("ar-KW-u-nu-latn", { day: "numeric", month: "short" })}</option>
          ))}
        </select>
      </label>
      {loading ? <span className="history-wait" role="status">…</span> : null}
      {summary ? (
        <>
          <ul className="history-legend" aria-label="الفرق عن النسخة">
            <li data-tone="good" title="زاد"><Plus aria-hidden="true" /><b>{n(summary.added)}</b></li>
            <li data-tone="bad" title="نقص"><Minus aria-hidden="true" /><b>{n(summary.removed)}</b></li>
            <li data-tone="same" title="بقي"><Equal aria-hidden="true" /><b>{n(summary.same)}</b></li>
            {kind === "fairness" && summary.fairness && summary.fairness.before !== null && summary.fairness.now !== null ? (
              <li data-tone={summary.fairness.now >= summary.fairness.before ? "good" : "bad"} title="مؤشر العدالة"><b dir="ltr">{summary.fairness.before} ← {summary.fairness.now}</b></li>
            ) : null}
          </ul>
          <div className="history-map" role="img" aria-label="خريطة الفرق في الأسبوع" style={{ ["--hours" as any]: hours.length }}>
            {DAY_LABELS.map((label, day) => (
              <div className="history-map-row" key={label}>
                <span title={label}>{DAY_LETTER[day]}</span>
                {hours.map(hour => {
                  const cell = byKey.get(`${day}:${hour}`);
                  const delta = cell ? cell.now - cell.before : 0;
                  const tone = !cell ? "none" : delta > 0 ? "good" : delta < 0 ? "bad" : cell.now ? "same" : "none";
                  return <i key={hour} data-tone={tone} title={cell && (delta || cell.now) ? `${label} ${hourText(hour)}:00 — ${cell.before} ← ${cell.now}` : undefined} />;
                })}
              </div>
            ))}
            <div className="history-map-ruler" aria-hidden="true"><span />{hours.map(hour => <small key={hour}>{hourText(hour)}</small>)}</div>
          </div>
        </>
      ) : null}
    </div>
  );
}
