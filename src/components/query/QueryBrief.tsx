import { useState, type ReactNode } from "react";
import { AR, countOf } from "../../utils/arabicCount";
import { Activity, CalendarClock, ChevronDown, ExternalLink, FileWarning, ShieldAlert, Sunrise, UserRound } from "lucide-react";
import QueryPrintMenu from "./QueryPrintMenu";
import { DnaRing } from "../dna";
import type { BriefItem, MorningBrief } from "../../utils/morningBrief";

const n = (value: number) => Number(value || 0).toLocaleString("ar-KW-u-nu-latn");

type Pane = "moves" | "blockers" | "notes" | "days";
const ORDINAL = ["الأول", "الثاني"];

/**
 * ── موجز الصباح: أرقامٌ بأيقونات، وكلُّ رقمٍ يُفتح على تفصيله ────────────────
 * شريطٌ واحدٌ مطويّ بأربع بطاقاتٍ صغيرة (حركات · موانع · ملاحظات · أيام)، لونُ كل بطاقةٍ حالُها:
 * أخضر لا شيء، وكهرماني يستحق نظرة، وأحمر يمنع. وكلُّ بطاقةٍ زرٌّ يفتح تفصيلَها في اللوحة نفسها
 * (واحدةٌ مفتوحة في كل مرة، وضغطها ثانيةً يطويها)، وزرُّ الشروق يفتح الموجزَ كاملاً: آخر الحركات وأرقام التغيير.
 * والجمل الكاملة للورقة المطبوعة وحدها.
 */
export default function QueryBrief({ open, onToggle, loading, data, error, onPrint, label, ink, canOpenRow, onOpenRow }: {
  open: boolean; onToggle: () => void; loading: boolean; data: MorningBrief | null; error?: string; onPrint: (ink: boolean) => void; label: string; ink: boolean;
  /** هل الموعد في النتائج المعروضة فيُفتح؟ وإلا يبقى البند نصّاً. */
  canOpenRow?: (rowId: number) => boolean;
  onOpenRow?: (rowId: number) => void;
}) {
  const [pane, setPane] = useState<Pane | null>(null);
  const stats = data?.stats;
  const days = stats?.daysLeft ?? null;
  const dayTone = days === null ? "info" : days < 0 ? "danger" : days <= 7 ? "warn" : "good";
  const dayTitle = days === null ? "لا موعد تسليم" : days < 0 ? `انقضى منذ ${countOf(-days, AR.day)}` : days === 0 ? "موعد التسليم اليوم" : `بقي ${countOf(days, AR.day)}`;
  const pick = (next: Pane) => {
    if (pane === next) { setPane(null); return; }
    if (open) onToggle();
    setPane(next);
  };
  const sunrise = () => {
    if (pane) { setPane(null); if (!open) onToggle(); return; }
    onToggle();
  };
  const full = open && !pane;
  const shown = full || pane !== null;
  const pill = (id: Pane, tone: string, title: string, icon: ReactNode, value: string) => (
    <button type="button" className={`morning-brief-pill${pane === id ? " is-active" : ""}`} data-tone={tone} data-pane={id}
      data-guide-ignore="يفتح تفصيل البطاقة في موجز الصباح؛ قراءة فقط"
      aria-expanded={pane === id} aria-controls="morning-brief-body" title={title} onClick={() => pick(id)}>
      {icon}<b>{value}</b>
    </button>
  );
  const items = (list: BriefItem[], total: number, empty: string, aria: string) => (
    list.length ? (
      <>
        <ul className="morning-brief-items" aria-label={aria}>
          {list.map((item, index) => {
            const openable = onOpenRow ? item.rowIds.filter(id => (canOpenRow ? canOpenRow(id) : false)).slice(0, 2) : [];
            return (
              <li key={`${item.title}-${index}`}>
                <div><b>{item.title}</b>{item.detail ? <small>{item.detail}</small> : null}</div>
                {openable.length ? (
                  <span className="morning-brief-open">
                    {openable.map((id, at) => (
                      <button key={id} type="button" data-guide-ignore="يفتح تفاصيل الموعد؛ قراءة فقط" title={openable.length > 1 ? `افتح الموعد ${ORDINAL[at]}` : "افتح الموعد"} aria-label={openable.length > 1 ? `افتح الموعد ${ORDINAL[at]}` : "افتح الموعد"} onClick={() => onOpenRow?.(id)}>
                        <ExternalLink aria-hidden="true" />{openable.length > 1 ? `افتح ${ORDINAL[at]}` : "افتح"}
                      </button>
                    ))}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        {total > list.length ? <small className="morning-brief-note">يُعرض {n(list.length)} من {n(total)}.</small> : null}
      </>
    ) : <p className="morning-brief-empty">{empty}</p>
  );
  const moveList = (brief: MorningBrief) => (brief.moves.length ? (
    <ol className="morning-brief-moves" aria-label="آخر الحركات">
      {brief.moves.map((move, index) => (
        <li key={`${move.at}-${index}`}>
          <time dir="ltr">{new Date(move.at).toLocaleTimeString("ar-KW-u-nu-latn", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuwait" })}</time>
          <UserRound aria-hidden="true" /><b>{move.who}</b><span>{move.what}</span><small>{move.target}</small>
        </li>
      ))}
    </ol>
  ) : null);
  const ring = (
    <DnaRing value={days === null ? undefined : Math.max(0, Math.min(30, days))} max={30} size={56} stroke={5} tone={dayTone as any} label={days === null ? "—" : n(days)} sublabel="يوم" ariaLabel={days === null ? "لا موعد" : `بقي ${countOf(days, AR.day)}`} />
  );
  return (
    <section className={`morning-brief no-print${shown ? " is-open" : ""}`} aria-label="موجز الصباح">
      <div className="morning-brief-head">
        <button type="button" className="morning-brief-sun" data-guide-ignore="فتح موجز الصباح للقراءة فقط" aria-expanded={full} aria-controls="morning-brief-body" onClick={sunrise} title={`موجز الصباح — ${label}`}>
          <Sunrise aria-hidden="true" />
        </button>
        <span className="morning-brief-tiles">
          {stats ? (
            <>
              {pill("moves", stats.moves ? "info" : "good", "حركات آخر 24 ساعة", <Activity aria-hidden="true" />, n(stats.moves))}
              {pill("blockers", stats.blockers ? "danger" : "good", "موانع الاعتماد", <ShieldAlert aria-hidden="true" />, n(stats.blockers))}
              {pill("notes", stats.notes ? "warn" : "good", "ملاحظات لائحية", <FileWarning aria-hidden="true" />, n(stats.notes))}
              {pill("days", dayTone, dayTitle, <CalendarClock aria-hidden="true" />, days === null ? "—" : n(days))}
            </>
          ) : <em className="morning-brief-wait">{loading ? "…" : "الصباح"}</em>}
        </span>
        <button type="button" className="morning-brief-chevron-btn" data-guide-ignore="طيّ موجز الصباح أو فتحه" aria-expanded={shown} aria-controls="morning-brief-body" aria-label={shown ? "طيّ الموجز" : "فتح الموجز"} title={shown ? "طيّ الموجز" : "فتح الموجز"} onClick={() => (pane ? setPane(null) : onToggle())}>
          <ChevronDown aria-hidden="true" className="morning-brief-chevron" />
        </button>
      </div>
      {shown ? (
        <div className="morning-brief-body" id="morning-brief-body" data-pane={pane || "all"}>
          {loading || !data ? <p role="status" className="morning-brief-wait">…</p> : (
            <>
              {pane === "moves" ? (moveList(data) || <p className="morning-brief-empty">لم يتحرّك شيء في مواعيد القسم منذ أمس.</p>) : null}
              {pane === "blockers" ? items(data.blockerItems, data.stats.blockers, "لا موانع اعتماد قائمة.", "موانع الاعتماد") : null}
              {pane === "notes" ? items(data.noteItems, data.stats.notes, "لا ملاحظات لائحية للمراجعة.", "الملاحظات اللائحية") : null}
              {pane === "days" ? (
                <div className="morning-brief-facts">
                  {ring}
                  <ul className="morning-brief-days" aria-label="موعد التسليم">
                    <li><small>موعد التسليم</small><b>{data.deadlineDate || "لا موعد"}</b></li>
                    <li><small>الأيام</small><b data-tone={dayTone}>{dayTitle}</b></li>
                    <li><small>حال الاعتماد</small><b>{data.stats.approval ? `${data.stats.approval}${data.stats.round ? ` · الجولة ${n(data.stats.round)}` : ""}` : "—"}</b></li>
                  </ul>
                </div>
              ) : null}
              {full ? (
                <>
                  <div className="morning-brief-facts">
                    {ring}
                    <ul className="morning-brief-delta" aria-label="التغيير منذ آخر مراجعة">
                      <li data-tone="good" title="أُضيف"><b>+{n(data.stats.added)}</b></li>
                      <li data-tone="danger" title="حُذف"><b>−{n(data.stats.removed)}</b></li>
                      <li data-tone="warn" title="عُدّل"><b>≠{n(data.stats.changed)}</b></li>
                    </ul>
                    {data.stats.approval ? <span className="morning-brief-state">{data.stats.approval}{data.stats.round ? ` · ${n(data.stats.round)}` : ""}</span> : null}
                  </div>
                  {moveList(data)}
                </>
              ) : null}
              {error ? <small className="morning-brief-note">{error}</small> : null}
              <QueryPrintMenu iconOnly className="morning-brief-print" ink={ink} label="طباعة الموجز" onPrint={onPrint} />
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
