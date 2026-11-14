/**
 * ── «توقّع الرغبات» على قائمة النشر ─────────────────────────────────────────
 *
 * قبل أن تُنشر بطاقاتُ الأساتذة، يرى المنسّق لكل أستاذٍ ما طلب تغييرَه في الفصول السابقة:
 * شريحةٌ صغيرة بعدّادٍ وحده على سطره، وبلمسها شبكةٌ مصغّرة (خمسة أيام × ثلاث فترات)
 * تُظلَّل فيها الخانةُ التي تكرّرت. للمنسّق وحده: لا يصل منها شيءٌ إلى الأستاذ، ولا تكتب في الجدول.
 * البياناتُ من GET /api/instructor-requests/history-hints (server/wishHints.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, CalendarSearch, ChevronDown, Cloud, History, Moon, Sun, X } from "lucide-react";
import CourseTags from "../CourseTags";
import PersonChips from "../PersonChips";
import { useDialogDismiss } from "../ui";
import { AR, countOf } from "../../utils/arabicCount";
import { DAY_LETTERS } from "../../utils/instructorRequestItems";
import { putOpenRow } from "../../utils/requestOpenRow";
import { WISH_DAYS, WISH_PERIODS, type AskDay, type AskPeriod, type WishCell, type WishKind, type WishPattern } from "../../utils/wishPatterns";
import type { WishHintsReply, WishHintLine } from "../../server/wishHints";

type HintPerson = WishHintsReply["instructors"][number];

/* أرقامُ التطبيق لاتينية (ar-KW-u-nu-latn) في كل شاشاته؛ الهندية هنا كانت نشازاً بجوار «4 شعب». */
/** الارتفاعُ الذي تحتاجه ورقةُ التوقّع كاملةً بشبكتها وأسطرها (تقريبٌ بالبكسل). */
const WISH_SHEET_ROOM = 340;
const digits = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");
const PERIOD_ICON: Record<AskPeriod, typeof Sun> = { morning: Sun, noon: Cloud, evening: Moon };
const PERIOD_LABEL: Record<AskPeriod, string> = { morning: "صباحاً", noon: "ظهراً", evening: "مساءً" };
const DAY_SHORT: Record<AskDay, string> = { fsunday: "أحد", fmonday: "اثنين", ftuesday: "ثلاثاء", fwednesday: "أربعاء", fthursday: "خميس" };
const KIND_LABEL: Record<WishKind, string> = { away: "يتركه", to: "يطلبه" };

/** قراءةٌ واحدة لكل فتح للقائمة؛ الخطأ لا يُرى: لا توقّعَ يعني لا شريحة. */
export function useWishHints(collegeId: number, sectionId: number, termId: number, enabled = true): WishHintsReply | null {
  const [data, setData] = useState<WishHintsReply | null>(null);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    if (!enabled || !collegeId || !sectionId || !termId) return;
    void fetch(`/api/instructor-requests/history-hints?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { credentials: "include" })
      .then(response => (response.ok ? response.json() : null))
      .then(body => { if (!cancelled && body && Array.isArray(body.instructors)) setData(body as WishHintsReply); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [collegeId, sectionId, termId, enabled]);
  return data;
}

/** شخصٌ قد يحمل سجلّين (بنين وبنات): يؤخذ ما عنده أكثرُ أنماطاً. */
export function wishHintsOf(data: WishHintsReply | null, ids: readonly number[]): HintPerson | null {
  if (!data) return null;
  const mine = data.instructors.filter(row => ids.includes(row.instructorId));
  return mine.sort((a, b) => b.patterns.length - a.patterns.length)[0] || null;
}

function openRowInSchedule(rowId: number, teacher: string) {
  putOpenRow({ rowId, teacher });
  window.history.pushState({}, "", "/FSchedule/Index");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

const startOf = (time: string) => (time.split(/[–-]/)[0] || "").trim();

function SlotChip({ cell, time, tone }: { cell: WishCell | null; time: string; tone: "away" | "to" }) {
  if (!cell) return <span className="wish-slot" data-tone={tone} data-empty="1" aria-label="لا موعد">—</span>;
  const Icon = PERIOD_ICON[cell.period];
  const start = startOf(time);
  return (
    <span className="wish-slot" data-tone={tone}>
      <Icon aria-hidden="true" />
      <b>{DAY_SHORT[cell.day]}</b>
      {start ? <small dir="ltr">{start}</small> : null}
    </span>
  );
}

function MiniGrid({ patterns }: { patterns: WishPattern[] }) {
  const at = (kind: WishKind, day: AskDay, period: AskPeriod) => patterns.find(p => p.kind === kind && p.day === day && p.period === period);
  return (
    <div className="wish-grid" role="table" aria-label="الخانات المتكررة في الفصول السابقة">
      <div className="wish-grid-head" role="row">
        <span aria-hidden="true" />
        {WISH_DAYS.map(day => <b key={day} role="columnheader" title={DAY_LETTERS[day]}>{DAY_SHORT[day]}</b>)}
      </div>
      {WISH_PERIODS.map(period => {
        const Icon = PERIOD_ICON[period];
        return (
          <div className="wish-grid-row" role="row" key={period}>
            <span className="wish-grid-period" role="rowheader" title={PERIOD_LABEL[period]} aria-label={PERIOD_LABEL[period]}><Icon aria-hidden="true" /></span>
            {WISH_DAYS.map(day => {
              const away = at("away", day, period);
              const to = at("to", day, period);
              const main = away || to;
              const label = [away ? `${KIND_LABEL.away}: ${countOf(away.terms, AR.term)} من ${digits(away.observed)}` : "", to ? `${KIND_LABEL.to}: ${countOf(to.terms, AR.term)} من ${digits(to.observed)}` : ""].filter(Boolean).join("، ");
              return (
                <span key={day} role="cell" className="wish-cell" data-away={away ? "1" : undefined} data-to={to ? "1" : undefined}
                  aria-label={`${DAY_LETTERS[day]} ${PERIOD_LABEL[period]}${label ? ` — ${label}` : ""}`}>
                  {main ? <small>{digits(main.terms)}/{digits(main.observed)}</small> : null}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function Legend() {
  return (
    <div className="wish-legend" aria-hidden="true">
      <span><i data-k="away" />{KIND_LABEL.away}</span>
      <span><i data-k="to" />{KIND_LABEL.to}</span>
    </div>
  );
}

function Lines({ lines, teacher, onClose }: { lines: WishHintLine[]; teacher: string; onClose: () => void }) {
  return (
    <ul className="wish-lines">
      {lines.map(line => (
        <li key={line.courseId}>
          <span className="wish-line-course"><b>{line.courseName}</b><CourseTags courseId={line.courseId} /></span>
          <span className="wish-line-flow">
            <SlotChip cell={line.from} time={line.fromTime} tone="away" />
            <ArrowLeft className="wish-arrow" aria-hidden="true" />
            <SlotChip cell={line.to} time={line.toTime} tone="to" />
          </span>
          {line.rowId ? (
            <button type="button" className="wish-open" data-guide-ignore="يفتح الموعد في إدارة الجدول ليعدّله المنسّق؛ لا يكتب شيئاً بنفسه"
              aria-label={`افتح موعد ${line.courseName}`} onClick={() => { onClose(); openRowInSchedule(line.rowId!, teacher); }}>
              <CalendarSearch aria-hidden="true" /><span>افتح الموعد</span>
            </button>
          ) : <span className="wish-open" data-off="1" aria-hidden="true" />}
        </li>
      ))}
    </ul>
  );
}

function Sheet({ hints, name, anchor, visiting, trainee, onClose }: {
  hints: HintPerson; name: string; anchor: DOMRect | null; visiting: boolean; trainee: boolean; onClose: () => void;
}) {
  useDialogDismiss(true, onClose);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  /* تحت الشريحة إن اتّسع المكان (نحو 340px)، وإلا فوقها إن كان أوسع؛ فلا يُضغط الجدولُ والأسطرُ تحت حافّة الشاشة. */
  const below = anchor ? window.innerHeight - anchor.bottom - 18 : 0, above = anchor ? anchor.top - 18 : 0;
  const place: "below" | "above" = anchor && below < WISH_SHEET_ROOM && above > below ? "above" : "below";
  const style = anchor ? ({
    ...(place === "above" ? { "--wish-bottom": `${Math.round(window.innerHeight - anchor.top + 6)}px` } : { "--wish-top": `${Math.round(anchor.bottom + 6)}px` }),
    "--wish-end": `${Math.max(8, Math.round(window.innerWidth - anchor.right))}px`,
  } as CSSProperties) : undefined;
  return createPortal(
    <div className="wish-layer no-print" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="wish-sheet" data-place={place} role="dialog" aria-modal="true" aria-label={`توقّع رغبات ${name}`} style={style}>
        <header>
          <History aria-hidden="true" />
          <strong>{name}<PersonChips visiting={visiting} trainee={trainee} /></strong>
          <small title="الفصول المرصودة">{digits(hints.observed)}<span className="sr-only"> {countOf(hints.observed, AR.term)}</span></small>
          <button type="button" ref={closeRef} className="wish-close" onClick={onClose} aria-label="إغلاق" title="إغلاق"
            data-guide-ignore="إغلاق نافذة توقّع الرغبات؛ لا يغيّر شيئاً"><X aria-hidden="true" /></button>
        </header>
        <MiniGrid patterns={hints.patterns} />
        <Legend />
        {hints.lines.length ? <Lines lines={hints.lines} teacher={name} onClose={onClose} /> : null}
      </section>
    </div>,
    document.body,
  );
}

/** الشريحةُ على سطر الأستاذ: أيقونةٌ وعدّاد. لا أنماطَ ← لا شريحة. */
export function WishChip({ hints, name, visiting = false, trainee = false }: { hints: HintPerson | null; name: string; visiting?: boolean; trainee?: boolean }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const toggle = useCallback(() => {
    setAnchor(button.current?.getBoundingClientRect() || null);
    setOpen(current => !current);
  }, []);
  if (!hints || !hints.patterns.length) return <span className="wish-chip-slot" aria-hidden="true" />;
  return (
    <span className="wish-chip-slot">
      <button ref={button} type="button" className="wish-chip" aria-haspopup="dialog" aria-expanded={open}
        aria-label={`توقّع رغبات ${name} — ${digits(hints.patterns.length)}`} title="ما طلبه في الفصول السابقة"
        data-guide-ignore="يعرض ما طلب هذا الأستاذ تغييره في الفصول السابقة؛ للمنسّق وحده ولا يرسل شيئاً"
        onClick={event => { event.stopPropagation(); toggle(); }}>
        <History aria-hidden="true" /><b>{digits(hints.patterns.length)}</b>
      </button>
      {open ? <Sheet hints={hints} name={name} anchor={anchor} visiting={visiting} trainee={trainee} onClose={() => { setOpen(false); button.current?.focus(); }} /> : null}
    </span>
  );
}

/** شريطٌ مطويٌّ فوق القائمة: خريطةُ حرارة القسم، أعدادٌ فقط. */
export function WishSummary({ data }: { data: WishHintsReply | null }) {
  const [open, setOpen] = useState(false);
  const peak = useMemo(() => Math.max(0, ...WISH_DAYS.flatMap(day => WISH_PERIODS.map(period => data?.heat[day][period] || 0))), [data]);
  const total = useMemo(() => WISH_DAYS.reduce((sum, day) => sum + WISH_PERIODS.reduce((inner, period) => inner + (data?.heat[day][period] || 0), 0), 0), [data]);
  const withHints = data?.instructors.length || 0;
  if (!data || !withHints || !peak) return null;
  return (
    <div className="wish-summary" data-open={open ? "1" : undefined}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} data-guide-ignore="يطوي أو يبسط خريطة حرارة القسم لما طُلب تغييره سابقاً؛ للقراءة فقط">
        <History aria-hidden="true" />
        <span className="wish-summary-count"><b>{digits(withHints)}</b></span>
        <small className="sr-only">{countOf(withHints, AR.instructor)}</small>
        <ChevronDown className="wish-summary-caret" aria-hidden="true" />
        <span className="sr-only">خريطة حرارة القسم لما طُلب تغييره سابقاً</span>
      </button>
      {open ? (
        <div className="wish-grid wish-heat" role="table" aria-label="ما تركه الأساتذة في الفصول السابقة، بحسب اليوم والفترة">
          <div className="wish-grid-head" role="row"><span aria-hidden="true" />{WISH_DAYS.map(day => <b key={day} role="columnheader" title={DAY_LETTERS[day]}>{DAY_SHORT[day]}</b>)}</div>
          {WISH_PERIODS.map(period => {
            const Icon = PERIOD_ICON[period];
            return (
              <div className="wish-grid-row" role="row" key={period}>
                <span className="wish-grid-period" role="rowheader" aria-label={PERIOD_LABEL[period]}><Icon aria-hidden="true" /></span>
                {WISH_DAYS.map(day => {
                  const count = data.heat[day][period];
                  return (
                    <span key={day} role="cell" className="wish-cell" data-heat={count ? String(Math.max(1, Math.ceil((count / peak) * 4))) : undefined}
                      aria-label={`${DAY_LETTERS[day]} ${PERIOD_LABEL[period]}: ${digits(count)}`}>
                      {count ? <small>{digits(count)}</small> : null}
                    </span>
                  );
                })}
              </div>
            );
          })}
          <span className="sr-only">{digits(total)}</span>
        </div>
      ) : null}
    </div>
  );
}
