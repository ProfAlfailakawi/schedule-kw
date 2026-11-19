/**
 * ── ماذا غيّرنا؟ ─────────────────────────────────────────────────────────────
 *
 * حصيلةُ ما غيّره القسم في جدوله خلال فترة: اليوم، أو منذ آخر إرسال للتسجيل،
 * أو منذ وقتٍ يختاره. الصافي افتراضاً (ما أُرجع يختفي، وما نُقل مرّتين يظهر
 * من أوّله إلى آخره)، و«كل الخطوات» بترتيبها الزمني لمن أراد القصة كاملة.
 *
 * قراءةٌ محضة من GET /api/schedules/what-changed (src/server/routes/whatChangedRoutes.ts).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, BookOpen, CalendarClock, Check, ClipboardCopy, DoorOpen, History, Layers, ListOrdered, MinusCircle, PlusCircle, Printer, RefreshCw, Send, Sparkles, UserRound,
} from "lucide-react";
import { AR, countOf, nounFor } from "../utils/arabicCount";
import { DAY_LETTERS, whatChangedText, type ChangeTag, type WcEntry, type WcSlot, type WcStep } from "../utils/whatChanged";
import { showPwaPrintHelp } from "../utils/pwaPrintHelp";
import { PrintPortal, SecondaryButton } from "./ui";
import CourseTags from "./CourseTags";

interface Props {
  collegeId: number;
  sectionId: number;
  termId: number;
  /** اسمُ القسم في رأس الورقة المطبوعة والنصّ المنسوخ. */
  scopeLabel?: string;
}

type Preset = "today" | "lastSend" | "custom";

interface Result {
  period: { kind: "lastSend" | "time"; from: string | null };
  notSent?: boolean;
  entries: WcEntry[];
  steps: WcStep[];
  counts: Record<ChangeTag, number> & { total: number };
  truncated?: boolean;
  stepsTruncated?: boolean;
}

const TILES: Array<{ tag: ChangeTag; label: string; Icon: typeof DoorOpen }> = [
  { tag: "moved", label: "نُقلت", Icon: CalendarClock },
  { tag: "room", label: "قاعة", Icon: DoorOpen },
  { tag: "instructor", label: "أستاذ", Icon: UserRound },
  { tag: "added", label: "أُضيفت", Icon: PlusCircle },
  { tag: "removed", label: "حُذفت", Icon: MinusCircle },
  { tag: "course", label: "مقرر", Icon: BookOpen },
];

const PRESETS: Array<{ id: Preset; label: string; Icon: typeof DoorOpen }> = [
  { id: "today", label: "اليوم", Icon: CalendarClock },
  { id: "lastSend", label: "منذ آخر إرسال للتسجيل", Icon: Send },
  { id: "custom", label: "اختر وقتاً", Icon: History },
];

const pad = (n: number) => String(n).padStart(2, "0");
const localInputValue = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
function stamp(iso?: string | null): string {
  const t = Date.parse(String(iso || ""));
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return d.toDateString() === new Date().toDateString() ? time : `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${time}`;
}
const initialOf = (name: string) => name.replace(/^(د\.|أ\.|م\.)\s*/, "").trim().charAt(0) || "؟";

/* ── قطعٌ صغيرة ─────────────────────────────────────────────────────────── */

function DayPills({ days, tone }: { days: number[]; tone: "before" | "after" }) {
  return (
    <span className={`wc-days is-${tone}`} aria-label={days.length ? undefined : "بلا أيام"}>
      {DAY_LETTERS.map((letter, index) => <i key={letter} data-on={days.includes(index) ? "" : undefined} aria-hidden={!days.includes(index)}>{letter}</i>)}
    </span>
  );
}

function Delta({ Icon, label, before, after }: { Icon: typeof DoorOpen; label: string; before: React.ReactNode; after: React.ReactNode }) {
  return (
    <div className="wc-delta" role="group" aria-label={label}>
      <Icon className="wc-delta-icon" aria-hidden="true" />
      <span className="wc-chip is-before">{before}</span>
      <ArrowLeft className="wc-arrow" aria-label="إلى" />
      <span className="wc-chip is-after">{after}</span>
    </div>
  );
}

function Avatars({ names }: { names: string[] }) {
  if (!names.length) return null;
  return (
    <span className="wc-who" aria-label={`عدّلها: ${names.join("، ")}`} title={names.join("، ")}>
      {names.slice(0, 3).map(name => <i key={name} aria-hidden="true">{initialOf(name)}</i>)}
    </span>
  );
}

const timeText = (slot: WcSlot) => (slot.start && slot.end ? <bdi dir="ltr">{slot.start}–{slot.end}</bdi> : "—");

function EntryCard({ entry, compact = false }: { entry: WcEntry; compact?: boolean; key?: React.Key }) {
  const { before, after } = entry;
  const KindIcon = entry.kind === "added" ? PlusCircle : entry.kind === "removed" ? MinusCircle : RefreshCw;
  const single = after || before;
  return (
    <article className={`wc-card is-${entry.kind}${compact ? " is-compact" : ""}`}>
      <header>
        <span className="wc-kind" aria-label={entry.kind === "added" ? "أُضيفت" : entry.kind === "removed" ? "حُذفت" : "عُدّلت"}><KindIcon aria-hidden="true" /></span>
        <h4>
          {entry.courseCode ? <bdi className="wc-code">{entry.courseCode}</bdi> : null}
          <span className="wc-course">{entry.courseName}</span>
          <CourseTags courseId={entry.courseId} />
        </h4>
        {entry.section && entry.section !== "—" ? <span className="wc-section" aria-label={`الشعبة ${entry.section}`}>ش{entry.section}</span> : null}
        {compact ? null : <Avatars names={entry.by} />}
      </header>
      {entry.kind === "changed" && before && after ? (
        <div className="wc-deltas">
          {entry.tags.includes("moved") ? (
            <Delta Icon={CalendarClock} label="الموعد"
              before={<><DayPills days={before.days} tone="before" />{timeText(before)}</>}
              after={<><DayPills days={after.days} tone="after" />{timeText(after)}</>} />
          ) : null}
          {entry.tags.includes("room") ? <Delta Icon={DoorOpen} label="القاعة" before={<bdi>{before.room}</bdi>} after={<bdi>{after.room}</bdi>} /> : null}
          {entry.tags.includes("instructor") ? <Delta Icon={UserRound} label="الأستاذ" before={before.instructor} after={after.instructor} /> : null}
          {entry.tags.includes("course") ? <Delta Icon={BookOpen} label="المقرر" before={<>{before.course} ش{before.section}</>} after={<>{after.course} ش{after.section}</>} /> : null}
        </div>
      ) : single ? (
        <div className="wc-deltas">
          <div className="wc-delta is-single" role="group" aria-label="الموعد">
            <CalendarClock className="wc-delta-icon" aria-hidden="true" />
            <span className={`wc-chip ${entry.kind === "removed" ? "is-before" : "is-after"}`}><DayPills days={single.days} tone={entry.kind === "removed" ? "before" : "after"} />{timeText(single)}</span>
            <span className="wc-chip is-plain"><DoorOpen aria-hidden="true" /><bdi>{single.room}</bdi></span>
            <span className="wc-chip is-plain"><UserRound aria-hidden="true" />{single.instructor}</span>
          </div>
        </div>
      ) : null}
    </article>
  );
}

/* ── أسبوعٌ مصغّر: قبل (منقّط) وبعد (ممتلئ) ──────────────────────────────── */

const toMinutes = (value: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(value || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };

function MiniWeek({ entries }: { entries: WcEntry[] }) {
  const blocks = useMemo(() => {
    const out: Array<{ key: string; day: number; start: number; end: number; tone: "before" | "after"; label: string }> = [];
    for (const entry of entries) {
      const label = `${entry.courseCode || entry.courseName} ش${entry.section}`;
      const push = (slot: WcSlot | null, tone: "before" | "after") => {
        if (!slot) return;
        const start = toMinutes(slot.start), end = toMinutes(slot.end);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
        for (const day of slot.days) out.push({ key: `${entry.key}:${tone}:${day}`, day, start, end, tone, label });
      };
      if (entry.kind === "removed") push(entry.before, "before");
      else if (entry.kind === "added") push(entry.after, "after");
      else if (entry.tags.includes("moved")) { push(entry.before, "before"); push(entry.after, "after"); }
    }
    return out;
  }, [entries]);
  if (!blocks.length) return null;
  const from = Math.min(8 * 60, ...blocks.map(b => b.start));
  const to = Math.max(15 * 60, ...blocks.map(b => b.end));
  const span = Math.max(60, to - from);
  return (
    <figure className="wc-week" aria-label="الأسبوع قبل وبعد">
      <div className="wc-week-grid">
        {DAY_LETTERS.map((letter, day) => (
          <div key={letter} className="wc-week-day">
            <b aria-hidden="true">{letter}</b>
            <div className="wc-week-col">
              {blocks.filter(block => block.day === day).map(block => (
                <span key={block.key} className={`wc-week-block is-${block.tone}`} title={block.label}
                  style={{ insetBlockStart: `${((block.start - from) / span) * 100}%`, blockSize: `${Math.max(6, ((block.end - block.start) / span) * 100)}%` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <figcaption>
        <span><i className="wc-legend is-before" aria-hidden="true" />قبل</span>
        <span><i className="wc-legend is-after" aria-hidden="true" />بعد</span>
      </figcaption>
    </figure>
  );
}

/* ── الأداة ─────────────────────────────────────────────────────────────── */

export default function WhatChanged({ collegeId, sectionId, termId, scopeLabel }: Props) {
  const [preset, setPreset] = useState<Preset>("today");
  const [custom, setCustom] = useState(() => localInputValue(new Date(Date.now() - 2 * 3600_000)));
  const [showSteps, setShowSteps] = useState(false);
  const [filter, setFilter] = useState<ChangeTag | null>(null);
  const [state, setState] = useState<{ loading: boolean; error: string | null; result: Result | null }>({ loading: true, error: null, result: null });
  const [copied, setCopied] = useState(false);

  const fromParam = preset === "lastSend" ? "lastSend"
    : preset === "custom" ? (Number.isFinite(Date.parse(custom)) ? new Date(custom).toISOString() : "")
    : startOfToday().toISOString();

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!collegeId || !sectionId || !termId || !fromParam) return;
    setState(current => ({ ...current, loading: true, error: null }));
    try {
      const query = new URLSearchParams({ collegeId: String(collegeId), sectionId: String(sectionId), termId: String(termId), from: fromParam });
      const response = await fetch(`/api/schedules/what-changed?${query}`, { signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "تعذّرت القراءة");
      setState({ loading: false, error: null, result: body as Result });
    } catch (error: any) {
      if (error?.name === "AbortError") return;
      setState({ loading: false, error: error?.message || "تعذّرت القراءة", result: null });
    }
  }, [collegeId, sectionId, termId, fromParam]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  useEffect(() => { setFilter(null); }, [fromParam]);

  const result = state.result;
  const entries = useMemo(() => (result?.entries || []).filter(entry => !filter || entry.tags.includes(filter)), [result, filter]);
  const periodLabel = preset === "today" ? "اليوم" : preset === "lastSend" ? "منذ آخر إرسال للتسجيل" : `منذ ${stamp(fromParam)}`;
  const title = `ماذا غيّرنا؟ — ${periodLabel}${scopeLabel ? ` — ${scopeLabel}` : ""}`;

  const copyText = async () => {
    const text = whatChangedText({ entries: result?.entries || [] }, title);
    try { await navigator.clipboard.writeText(text); }
    catch {
      const area = document.createElement("textarea");
      area.value = text; area.setAttribute("readonly", ""); area.style.position = "fixed"; area.style.opacity = "0";
      document.body.appendChild(area); area.select();
      try { document.execCommand("copy"); } finally { area.remove(); }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const print = () => {
    if (showPwaPrintHelp()) return;
    const root = document.documentElement;
    root.dataset.printKind = "what-changed";
    const done = () => { delete root.dataset.printKind; window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done, { once: true });
    window.setTimeout(() => { try { window.print(); } catch { done(); } }, 30);
    window.setTimeout(done, 4000);
  };

  const total = result?.counts.total || 0;

  return (
    <section className="wc" aria-labelledby="wc-title">
      <header className="wc-head">
        <span className="wc-head-icon" aria-hidden="true"><Sparkles /></span>
        <div>
          <h2 id="wc-title">ماذا غيّرنا؟</h2>
          <p>{periodLabel}{preset === "lastSend" && result?.period.from ? <> · <bdi dir="ltr">{stamp(result.period.from)}</bdi></> : null}</p>
        </div>
      </header>

      <div className="wc-period" role="radiogroup" aria-label="الفترة">
        {PRESETS.map(({ id, label, Icon }) => (
          <button key={id} type="button" role="radio" aria-checked={preset === id} className={preset === id ? "on" : ""}
            onClick={() => setPreset(id)} data-guide-ignore="يختار فترة الحصيلة؛ قراءةٌ لا تغيّر الجدول">
            <Icon aria-hidden="true" />{label}
          </button>
        ))}
        {preset === "custom" ? (
          <input type="datetime-local" className="wc-when" value={custom} max={localInputValue(new Date())}
            onChange={event => setCustom(event.target.value)} aria-label="منذ متى" data-guide-ignore="وقت بداية الفترة؛ قراءةٌ فقط" />
        ) : null}
      </div>

      {state.loading && !result ? <p className="wc-note" role="status">جارٍ القراءة…</p> : null}
      {state.error ? <p className="wc-note is-error" role="alert">{state.error}</p> : null}

      {result ? (
        <div className={`wc-body${state.loading ? " is-loading" : ""}`} aria-busy={state.loading}>
          {result.notSent ? (
            <div className="wc-empty"><Send aria-hidden="true" /><strong>لم يُرسل الجدول للتسجيل بعد</strong></div>
          ) : total === 0 ? (
            <div className="wc-empty"><Check aria-hidden="true" /><strong>لا تعديلات في هذه الفترة</strong></div>
          ) : (
            <>
              <div className="wc-tiles" role="group" aria-label="الحصيلة">
                <div className="wc-tile is-total">
                  <Layers aria-hidden="true" />
                  <b>{total}</b>
                  <span>{nounFor(total, AR.section)}</span>
                </div>
                {TILES.map(({ tag, label, Icon }) => {
                  const value = result.counts[tag] || 0;
                  return (
                    <button key={tag} type="button" className={`wc-tile is-${tag}`} disabled={!value}
                      aria-pressed={filter === tag} aria-label={`${label}: ${value}`}
                      onClick={() => setFilter(filter === tag ? null : tag)} data-guide-ignore="يصفّي البطاقات بنوع التعديل؛ عرضٌ فقط">
                      <Icon aria-hidden="true" />
                      <b>{value}</b>
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="wc-actions">
                <button type="button" className="wc-toggle" aria-pressed={showSteps} onClick={() => setShowSteps(value => !value)}
                  data-guide-ignore="يبدّل بين الصافي وكل الخطوات؛ عرضٌ فقط">
                  <ListOrdered aria-hidden="true" />كل الخطوات
                </button>
                <SecondaryButton type="button" onClick={() => void copyText()} data-guide-ignore="ينسخ الحصيلة نصاً للمحادثة؛ لا يغيّر شيئاً">
                  {copied ? <Check aria-hidden="true" /> : <ClipboardCopy aria-hidden="true" />}{copied ? "نُسخ" : "انسخ نصاً"}
                </SecondaryButton>
                <SecondaryButton type="button" onClick={print} data-guide-ignore="يطبع الحصيلة في ورقة واحدة؛ لا يغيّر شيئاً">
                  <Printer aria-hidden="true" />اطبع
                </SecondaryButton>
              </div>

              {showSteps ? (
                <ol className="wc-steps" aria-label="كل الخطوات">
                  {result.steps.map(step => (
                    <li key={`${step.at}:${step.label}`}>
                      <div className="wc-step-head">
                        <bdi dir="ltr" className="wc-step-time">{stamp(step.at)}</bdi>
                        {step.by ? <span className="wc-step-by"><Avatars names={[step.by]} />{step.by}</span> : null}
                        <span className="wc-step-label">{step.label.replace(/^قبل\s+/, "")}</span>
                      </div>
                      <div className="wc-cards">{step.entries.map(entry => <EntryCard key={entry.key} entry={entry} compact />)}</div>
                    </li>
                  ))}
                  {result.stepsTruncated ? <li className="wc-note">{countOf(result.steps.length, AR.edit)} الأحدث فقط</li> : null}
                </ol>
              ) : (
                <>
                  <MiniWeek entries={entries} />
                  <div className="wc-cards">{entries.map(entry => <EntryCard key={entry.key} entry={entry} />)}</div>
                </>
              )}
              {result.truncated ? <p className="wc-note">الفترة أقدم من السجل المتاح: الحصيلة من أقدم نسخة محفوظة.</p> : null}
            </>
          )}
        </div>
      ) : null}

      {result && total ? (
        <PrintPortal className="what-changed-print-host">
          <div className="what-changed-print">
            <header>
              <h1>ماذا غيّرنا؟</h1>
              <p>{[scopeLabel, periodLabel].filter(Boolean).join(" — ")}</p>
            </header>
            <p className="what-changed-print-counts">
              {TILES.filter(({ tag }) => result.counts[tag]).map(({ tag, label }) => `${label} ${result.counts[tag]}`).join(" · ")}
            </p>
            <table>
              <thead><tr><th>المقرر</th><th>الشعبة</th><th>قبل</th><th>بعد</th><th>بواسطة</th></tr></thead>
              <tbody>
                {result.entries.map(entry => {
                  const cell = (slot: WcSlot | null) => slot ? [slot.days.map(day => DAY_LETTERS[day]).join(" "), slot.start && slot.end ? `${slot.start}–${slot.end}` : "", slot.room, slot.instructor].filter(Boolean).join(" · ") : "—";
                  return (
                    <tr key={entry.key}>
                      <td>{[entry.courseCode, entry.courseName].filter(Boolean).join(" ")} <CourseTags courseId={entry.courseId} printOnly /></td>
                      <td>{entry.section}</td>
                      <td>{cell(entry.before)}</td>
                      <td>{cell(entry.after)}</td>
                      <td>{entry.by.join("، ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </PrintPortal>
      ) : null}
    </section>
  );
}
