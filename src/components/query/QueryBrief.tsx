import { AR, countOf } from "../../utils/arabicCount";
import { Activity, CalendarClock, ChevronDown, FileWarning, Printer, ShieldAlert, Sunrise, UserRound } from "lucide-react";
import { DnaRing } from "../dna";
import type { MorningBrief } from "../../utils/morningBrief";

const n = (value: number) => Number(value || 0).toLocaleString("ar-KW-u-nu-latn");

/**
 * ── موجز الصباح: أرقامٌ بأيقونات، لا جمل ─────────────────────────────────────
 * شريطٌ واحدٌ مطويّ بأربع بطاقات صغيرة (حركات · موانع · ملاحظات · أيام)، لونُ كل بطاقةٍ حالُها:
 * أخضر لا شيء، وكهرماني يستحق نظرة، وأحمر يمنع. وبضغطةٍ تُفتح آخر الحركات وأرقام التغيير.
 * والجمل الكاملة للورقة المطبوعة وحدها.
 */
export default function QueryBrief({ open, onToggle, loading, data, error, onPrint, label }: {
  open: boolean; onToggle: () => void; loading: boolean; data: MorningBrief | null; error?: string; onPrint: () => void; label: string;
}) {
  const stats = data?.stats;
  const days = stats?.daysLeft ?? null;
  const dayTone = days === null ? "info" : days < 0 ? "danger" : days <= 7 ? "warn" : "good";
  return (
    <section className={`morning-brief no-print${open ? " is-open" : ""}`} aria-label="موجز الصباح">
      <button type="button" className="morning-brief-head" data-guide-ignore="فتح موجز الصباح للقراءة فقط" aria-expanded={open} aria-controls="morning-brief-body" onClick={onToggle} title={`موجز الصباح — ${label}`}>
        <span className="morning-brief-sun"><Sunrise aria-hidden="true" /></span>
        <span className="morning-brief-tiles">
          {stats ? (
            <>
              <i data-tone={stats.moves ? "info" : "good"} title="حركات آخر 24 ساعة"><Activity aria-hidden="true" /><b>{n(stats.moves)}</b></i>
              <i data-tone={stats.blockers ? "danger" : "good"} title="موانع الاعتماد"><ShieldAlert aria-hidden="true" /><b>{n(stats.blockers)}</b></i>
              <i data-tone={stats.notes ? "warn" : "good"} title="ملاحظات لائحية"><FileWarning aria-hidden="true" /><b>{n(stats.notes)}</b></i>
              <i data-tone={dayTone} title={days === null ? "لا موعد تسليم" : days < 0 ? `انقضى منذ ${countOf(-days, AR.day)}` : `بقي ${countOf(days, AR.day)}`}><CalendarClock aria-hidden="true" /><b>{days === null ? "—" : n(days)}</b></i>
            </>
          ) : <em className="morning-brief-wait">{loading ? "…" : "الصباح"}</em>}
        </span>
        <ChevronDown aria-hidden="true" className="morning-brief-chevron" />
      </button>
      {open ? (
        <div className="morning-brief-body" id="morning-brief-body">
          {loading || !data ? <p role="status" className="morning-brief-wait">…</p> : (
            <>
              <div className="morning-brief-facts">
                <DnaRing value={days === null ? undefined : Math.max(0, Math.min(30, days))} max={30} size={56} stroke={5} tone={dayTone as any} label={days === null ? "—" : n(days)} sublabel="يوم" ariaLabel={days === null ? "لا موعد" : `بقي ${countOf(days, AR.day)}`} />
                <ul className="morning-brief-delta" aria-label="التغيير منذ آخر مراجعة">
                  <li data-tone="good" title="أُضيف"><b>+{n(data.stats.added)}</b></li>
                  <li data-tone="danger" title="حُذف"><b>−{n(data.stats.removed)}</b></li>
                  <li data-tone="warn" title="عُدّل"><b>≠{n(data.stats.changed)}</b></li>
                </ul>
                {data.stats.approval ? <span className="morning-brief-state">{data.stats.approval}{data.stats.round ? ` · ${n(data.stats.round)}` : ""}</span> : null}
              </div>
              {data.moves.length ? (
                <ol className="morning-brief-moves" aria-label="آخر الحركات">
                  {data.moves.map((move, index) => (
                    <li key={`${move.at}-${index}`}>
                      <time dir="ltr">{new Date(move.at).toLocaleTimeString("ar-KW-u-nu-latn", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuwait" })}</time>
                      <UserRound aria-hidden="true" /><b>{move.who}</b><span>{move.what}</span><small>{move.target}</small>
                    </li>
                  ))}
                </ol>
              ) : null}
              {error ? <small className="morning-brief-note">{error}</small> : null}
              <button type="button" className="morning-brief-print" data-guide-ignore="طباعة موجز الصباح؛ قراءة فقط" onClick={onPrint} aria-label="طباعة الموجز" title="طباعة الموجز"><Printer aria-hidden="true" /></button>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
