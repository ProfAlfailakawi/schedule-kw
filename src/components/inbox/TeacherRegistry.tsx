/**
 * ── «سجلّ الأساتذة» في وارد الرغبات ───────────────────────────────────────────────
 * سطرٌ واحد لكل أستاذ بحالةٍ هادئة واحدة (ثبّت · عدّل · لم يردّ · قيد المراجعة · للعرض فقط)، ورقاقاتٌ بالأعداد تُصفّي القائمة،
 * وتحت كل سطرٍ حركتُه كاملةً بالترتيب (لمن أُرسل ومتى، فتح الرابط كم مرة، أرسل، ثبّت، عدّل، قرار القسم) من مسار الأساتذة
 * (GET /api/instructor-requests/track) — عبر كل الإرسالات والجولات، فمجموعةٌ أولى وثانية تُقرآن تاريخاً واحداً.
 * ومن بطاقتُه عرضٌ لا تعديلَ فيه والقسمُ لم يُنهِ طلبَه، له على سطره «افتح التعديل»: موعدٌ يُختار، ثم إرسالٌ خاصٌّ بالرابط نفسه
 * (POST /api/instructor-requests/issue بصفة ✏️ لأستاذٍ بعينه) فيُسجَّل في سجلّ طلبه. العدُّ من صفوف الوارد المحمّلة، بلا قراءةٍ جديدة.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { CheckCheck, ChevronDown, CircleCheck, CircleX, ClipboardList, Clock, Eye, Hourglass, Loader2, MailQuestion, MessageSquare, Pencil, PencilLine, Send, ShieldCheck, Unlock, X, Check } from "lucide-react";
import { DnaTimeline, type DnaEvent, type DnaTone } from "../dna";
import PersonChips from "../PersonChips";
import { AR, countOf } from "../../utils/arabicCount";
import {
  REGISTRY_LABEL, REGISTRY_STATUSES, registryLatest, registryOpens, registryStatusOf, registryTally, suggestedDeadline, viewOnlyStuck,
  type RegistryRow, type RegistryStatus,
} from "../../utils/teacherRegistry";

export type RegistryInboxRow = RegistryRow & { id: string; instructorName?: string; AdCollegeId: number; AdSectionId: number; updatedAt?: string; timeline?: ReadonlyArray<{ at: string }> };

interface TrackEvent { at: string; tone: string; text: string }
interface TrackPerson { instructorId: number; events: TrackEvent[] }

const num = (value: number) => Number(value || 0).toLocaleString("ar-KW-u-nu-latn");
const stamp = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("ar-KW-u-nu-latn", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kuwait" }).format(date);
};
const dayOnly = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("ar-KW-u-nu-latn", { day: "numeric", month: "long", timeZone: "Asia/Kuwait" }).format(date);
};

const ICON: Record<RegistryStatus, React.ComponentType<{ "aria-hidden"?: boolean }>> = {
  silent: MailQuestion, review: Hourglass, edited: PencilLine, confirmed: CircleCheck, viewOnly: Eye,
};
const HINT: Record<RegistryStatus, string> = {
  silent: "أُرسلت له البطاقة ولم يرسل شيئاً",
  review: "أرسل طلبه والقسم يقرّر في بنوده",
  edited: "أرسل طلباً فيه تعديلٌ أو ملاحظة",
  confirmed: "ثبّت جدوله كما هو",
  viewOnly: "بطاقتُه للعرض فقط",
};
const TRACK_LOOK: Record<string, { icon: React.ReactElement; tone: DnaTone }> = {
  send: { icon: <Send />, tone: "indigo" },
  open: { icon: <Eye />, tone: "sky" },
  pin: { icon: <ShieldCheck />, tone: "mint" },
  change: { icon: <Pencil />, tone: "amber" },
  reply: { icon: <MessageSquare />, tone: "lilac" },
  decide: { icon: <CheckCheck />, tone: "accent" },
  stop: { icon: <CircleX />, tone: "coral" },
};

function OpenEditSheet({ row, termId, onClose, onDone }: { row: RegistryInboxRow; termId: number; onClose: () => void; onDone: (message: string) => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [closesAt, setClosesAt] = useState(() => suggestedDeadline());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    window.requestAnimationFrame(() => cardRef.current?.querySelector<HTMLElement>("input,button:not([disabled])")?.focus());
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); if (opener?.isConnected) opener.focus(); };
  }, [onClose]);
  const name = row.instructorName || "الأستاذ";
  const submit = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/instructor-requests/issue", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ collegeId: row.AdCollegeId, sectionId: row.AdSectionId, termId, closesAt, source: "draft", mode: "edit", instructorIds: [row.AdInstructorId] }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "تعذّر فتح التعديل.");
      onDone(`فُتح التعديل لـ ${name} حتى ${dayOnly(closesAt.length > 10 ? `${closesAt}:00+03:00` : closesAt)}، بالرابط نفسه.`);
    } catch (e: any) { setError(e.message || "تعذّر فتح التعديل."); } finally { setBusy(false); }
  };
  const quick = [3, 7].map(days => suggestedDeadline(Date.now(), days));
  return (
    <div className="changes-extend-sheet t-reg-sheet" role="dialog" aria-modal="true" aria-labelledby="t-reg-sheet-title" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="changes-extend-card" ref={cardRef}>
        <header>
          <strong id="t-reg-sheet-title"><Unlock aria-hidden="true" /> افتح التعديل · {name}</strong>
          <button type="button" onClick={onClose} aria-label="إغلاق" data-guide-ignore="إغلاق النافذة — لا يغيّر شيئاً"><X /></button>
        </header>
        <label className="t-reg-deadline">
          <span>آخر موعد</span>
          <input type="datetime-local" value={closesAt} min={suggestedDeadline(Date.now(), 0)} onChange={event => setClosesAt(event.target.value)} />
        </label>
        <div className="t-reg-quick" role="group" aria-label="مواعيد جاهزة">
          {quick.map((value, index) => (
            <button key={value} type="button" aria-pressed={closesAt === value} onClick={() => setClosesAt(value)}
              data-guide-ignore="اختيار موعدٍ جاهز لفتح التعديل — لا يرسل شيئاً">{index === 0 ? countOf(3, AR.day) : countOf(1, AR.week)}</button>
          ))}
        </div>
        {error ? <p className="card-pulse-error" role="alert">{error}</p> : null}
        <div className="changes-extend-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} data-guide-ignore="إلغاء — لا يُرسل شيء">إلغاء</button>
          <button type="button" className="btn btn-primary" disabled={busy || !closesAt} onClick={() => void submit()}
            data-guide-ignore="يفتح التعديل لهذا الأستاذ وحده بالرابط نفسه حتى الموعد المختار، ويُسجَّل في سجلّ طلبه">
            {busy ? <Loader2 className="spin" aria-hidden="true" /> : <Check aria-hidden="true" />} افتح التعديل
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TeacherRegistry({ rows, termId, trackScope, onChanged, isVisiting }: {
  rows: readonly RegistryInboxRow[]; termId: number;
  /** نطاقُ قراءة المسار: كليةٌ وقسم (يُؤخذان من أول طلبٍ إن كان الوارد لكل الأقسام). */
  trackScope?: { collegeId: number; sectionId: number };
  onChanged?: () => void;
  /** وسمُ «منتدب» يلازم اسمَ الأستاذ في كل موضع (قاعدة المالك). */
  isVisiting?: (row: RegistryInboxRow) => boolean;
}) {
  const latest = useMemo(() => registryLatest(rows as RegistryInboxRow[]), [rows]);
  const tally = useMemo(() => registryTally(latest), [latest]);
  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState<RegistryStatus | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [sheet, setSheet] = useState<RegistryInboxRow | null>(null);
  const [notice, setNotice] = useState("");
  const [track, setTrack] = useState<Map<number, TrackEvent[]> | null>(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const loadedFor = useRef("");
  const scope = trackScope?.collegeId && trackScope?.sectionId ? trackScope : latest[0] ? { collegeId: latest[0].AdCollegeId, sectionId: latest[0].AdSectionId } : null;
  const scopeKey = scope ? `${scope.collegeId}:${scope.sectionId}:${termId}` : "";
  useEffect(() => { setTrack(null); loadedFor.current = ""; }, [scopeKey, rows]);
  useEffect(() => {
    if (!expanded || !scope || loadedFor.current === scopeKey) return;
    loadedFor.current = scopeKey;
    setTrackLoading(true);
    void fetch(`/api/instructor-requests/track?collegeId=${scope.collegeId}&sectionId=${scope.sectionId}&termId=${termId}`, { cache: "no-store", credentials: "include" })
      .then(response => (response.ok ? response.json() : null))
      .then(data => setTrack(new Map(((data?.people || []) as TrackPerson[]).map(person => [Number(person.instructorId), person.events || []]))))
      .catch(() => setTrack(new Map()))
      .finally(() => setTrackLoading(false));
  }, [expanded, scopeKey, scope, termId]);
  const order = new Map(REGISTRY_STATUSES.map((status, index) => [status, index]));
  const shown = useMemo(() => latest
    .filter(row => !filter || registryStatusOf(row) === filter)
    .map((row, index) => ({ row, index }))
    .sort((a, b) => (order.get(registryStatusOf(a.row)!) ?? 9) - (order.get(registryStatusOf(b.row)!) ?? 9) || a.index - b.index)
    .map(entry => entry.row), [latest, filter]);
  if (!latest.length) return null;
  const LIMIT = 40;
  const visible = showAll ? shown : shown.slice(0, LIMIT);
  const stuckCount = latest.filter(row => viewOnlyStuck(row)).length;
  return (
    <section className="t-reg" aria-label="سجلّ الأساتذة" data-open={open ? "1" : undefined}>
      <div className="t-reg-head">
        <span className="t-reg-mark" aria-hidden="true"><ClipboardList /></span>
        <div className="t-reg-title"><b>سجلّ الأساتذة</b><small>{countOf(latest.length, AR.instructor)}{stuckCount ? ` · ${num(stuckCount)} بلا تعديل` : ""}</small></div>
        <button type="button" className="t-reg-fold" aria-expanded={open} aria-label={open ? "اطوِ السجلّ" : "افتح السجلّ"}
          data-guide-ignore="طيُّ سجلّ الأساتذة وفتحه — عرضٌ لا فعل" onClick={() => setOpen(value => !value)}><ChevronDown aria-hidden="true" /></button>
      </div>
      <ul className="t-reg-pills">
        {REGISTRY_STATUSES.map(status => {
          const Icon = ICON[status];
          if (!tally[status] && filter !== status) return null;
          return (
            <li key={status}>
              <button type="button" className="t-reg-pill-btn" data-st={status} aria-pressed={filter === status} title={HINT[status]}
                aria-label={`${REGISTRY_LABEL[status]}: ${num(tally[status])} — ${HINT[status]}`}
                data-guide-ignore="تصفية سجلّ الأساتذة بالحالة — عرضٌ لا فعل" onClick={() => { setFilter(filter === status ? null : status); setShowAll(false); }}>
                <Icon aria-hidden="true" /><b>{num(tally[status])}</b><span>{REGISTRY_LABEL[status]}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {notice ? <p className="t-reg-notice" role="status"><Check aria-hidden="true" /> {notice}</p> : null}
      {open ? <>
        <ol className="t-reg-list">
          {visible.map(row => {
            const status = registryStatusOf(row)!;
            const Icon = ICON[status];
            const opens = registryOpens(row);
            const lastMove = [...(row.timeline || [])].map(event => event.at).filter(Boolean).sort().at(-1) || row.updatedAt || "";
            const stuck = viewOnlyStuck(row);
            const isOpen = expanded === row.id;
            const events: DnaEvent[] = (track?.get(Number(row.AdInstructorId)) || []).map((event, index) => {
              const look = TRACK_LOOK[event.tone] || TRACK_LOOK.send;
              return { key: `${event.at}:${index}`, title: event.text, icon: look.icon, tone: look.tone, date: stamp(event.at) };
            });
            return (
              <li key={row.id} className="t-reg-row" data-st={status} data-expanded={isOpen ? "1" : undefined}>
                <div className="t-reg-line">
                  <span className="t-reg-pill" data-st={status}><Icon aria-hidden="true" />{REGISTRY_LABEL[status]}</span>
                  <b className="t-reg-name schedule-instructor-with-badge">{row.instructorName || "أستاذ"}<PersonChips visiting={Boolean(isVisiting?.(row))} trainee={false} /></b>
                  <span className="t-reg-meta">
                    <span title={opens.count ? `فتح الرابط ${countOf(opens.count, AR.visit)}` : "لم يفتح الرابط"} data-zero={opens.count ? undefined : "1"}>
                      <Eye aria-hidden="true" /><b>{num(opens.count)}</b></span>
                    {lastMove ? <span title="آخر حركة"><Clock aria-hidden="true" />{stamp(lastMove)}</span> : null}
                  </span>
                  <span className="t-reg-actions">
                    {stuck ? (
                      <button type="button" className="t-reg-open" onClick={() => setSheet(row)}
                        data-guide-ignore="يفتح ورقةً لاختيار موعدٍ ثم يفتح التعديل لهذا الأستاذ وحده — لا يرسل شيئاً قبل تأكيدك">
                        <Unlock aria-hidden="true" /> افتح التعديل
                      </button>
                    ) : null}
                    <button type="button" className="t-reg-more" aria-expanded={isOpen} aria-label={`حركة ${row.instructorName || "الأستاذ"}`}
                      title="الحركة كاملة" data-guide-ignore="طيُّ حركة الأستاذ وفتحها — عرضٌ لا فعل" onClick={() => setExpanded(isOpen ? null : row.id)}>
                      <ChevronDown aria-hidden="true" />
                    </button>
                  </span>
                </div>
                {isOpen ? (
                  <div className="t-reg-trail">
                    {trackLoading && !track ? <p className="t-reg-wait"><Loader2 className="spin" aria-hidden="true" /> يقرأ الحركة…</p>
                      : events.length ? <DnaTimeline className="t-reg-line-dna" ariaLabel={`حركة ${row.instructorName || "الأستاذ"}`} maxHeight={280} wrapMeta items={events} />
                      : <p className="t-reg-wait">لا حركةَ مسجّلة بعد.</p>}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
        {shown.length > LIMIT && !showAll ? (
          <button type="button" className="t-reg-all" onClick={() => setShowAll(true)} data-guide-ignore="عرض بقية الأساتذة — عرضٌ لا فعل">
            عرض البقية <b>{num(shown.length - LIMIT)}</b>
          </button>
        ) : null}
      </> : null}
      {sheet ? <OpenEditSheet row={sheet} termId={termId} onClose={() => setSheet(null)} onDone={message => { setSheet(null); setNotice(message); onChanged?.(); }} /> : null}
    </section>
  );
}
