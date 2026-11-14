import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft, Building2, Check, CircleCheck, Clock3, DoorOpen, Layers, Link2, LoaderCircle, Lock, Pencil, Route, Snowflake,
  TriangleAlert, Undo2, UserRound, X, type LucideIcon,
} from "lucide-react";
import { useDialogDismiss } from "./ui";
import { trapFocusRef } from "../hooks/useFocusTrap";
import { settleRegulationException } from "./RegulationExceptionSheet";
import {
  CHAIN_MAX_MOVES, CHAIN_REASON, chainImpactLine, solveChain,
  type ChainBlock, type ChainImpactLine, type ChainSlot, type ChainSolution, type ChainSolveInput, type ChainStep, type ChainWeek,
} from "../utils/chainSolve";
import type { DayKey } from "../utils/scheduleIntelligence";

/**
 * ── «حلّ بسلسلة»: ورقةُ الدومينو ──────────────────────────────────────────────
 * تحتاج المسوّدةُ مكاناً تشغله مواعيدُ أخرى؟ هنا الحلُّ كلُّه في نظرة: حلقةٌ بعدد النقلات، ثم بطاقاتٌ تتساقط
 * كالدومينو (من أين إلى أين، وما يُفرغه كلٌّ)، وفي آخرها «موعدك يدخل هنا»، وأسبوعان قبل/بعد، وسطرُ أثرٍ واحد.
 * «طبّق السلسلة» يمرّ بباب آلة الزمن الذرّي نفسه (سيناريو ثم اعتماد): تُكتب كلُّها أو لا شيء، ويُعاد فحصُ الأسبوع.
 *
 * ورقةٌ سفليةٌ على الجوال وجانبيةٌ على المكتب. تركيزُها محبوسٌ فيها، وEsc يغلقها، وتُعيد التركيز لمن فتحها.
 */

const DAY_SHORT: Record<DayKey, string> = { fsunday: "أحد", fmonday: "اثن", ftuesday: "ثلا", fwednesday: "أرب", fthursday: "خمس" };
const DAYS: DayKey[] = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"];
const REASON_ICON: Record<string, LucideIcon> = { snowflake: Snowflake, lock: Lock, building: Building2, clock: Clock3, check: CircleCheck, alert: TriangleAlert, layers: Layers, route: Route, pencil: Pencil };
const moveWord = (n: number) => n === 1 ? "نقلة" : n === 2 ? "نقلتان" : "نقلات";

export type ChainPhase = "solving" | "ready" | "empty" | "error" | "applying" | "done" | "undoing";

/* ── أجزاء الرسم ─────────────────────────────────────────────────────────── */

function MoveRing({ moves }: { moves: number }) {
  const R = 22, C = 2 * Math.PI * R, gap = 7, seg = C / CHAIN_MAX_MOVES - gap;
  return (
    <span className="chain-ring" aria-hidden="true">
      <svg viewBox="0 0 56 56" focusable="false">
        {Array.from({ length: CHAIN_MAX_MOVES }, (_, i) => (
          <circle key={i} className={i < moves ? "is-on" : ""} cx="28" cy="28" r={R} strokeDasharray={`${seg} ${C - seg}`} strokeDashoffset={-i * (C / CHAIN_MAX_MOVES)} />
        ))}
      </svg>
      <b dir="ltr">{moves || <Link2 />}</b>
    </span>
  );
}

const daysText = (days: readonly DayKey[]) => days.map(day => DAY_SHORT[day]).join("·");
export function SlotChip({ slot, tone, room }: { slot: ChainSlot; tone: "from" | "to"; room?: boolean }) {
  return (
    <span className={`chain-slot is-${tone}`} title={`${slot.room} ${slot.hall}`.trim()}>
      <span className="chain-slot-day">{daysText(slot.days)}</span>
      <bdi dir="ltr" className="chain-slot-time">{slot.start}</bdi>
      {room && slot.room ? <span className="chain-slot-room"><DoorOpen aria-hidden="true" /><bdi dir="ltr">{slot.room}</bdi></span> : null}
    </span>
  );
}

function StepCard({ step, index }: { step: ChainStep; index: number }) {
  return (
    <li className="chain-step" style={{ ["--i" as any]: index }}>
      <span className="chain-node" aria-hidden="true"><b dir="ltr">{index + 1}</b></span>
      <div className="chain-card">
        <div className="chain-card-top">
          <b className="chain-code" dir="ltr">{step.courseCode}</b>
          {step.section ? <small className="chain-sec" dir="ltr">{step.section}</small> : null}
          <span className="chain-frees" aria-label="يُفرغ">
            {step.freed.includes("teacher") ? <span className="chain-free is-teacher" title="يُفرغ الأستاذ"><UserRound aria-hidden="true" /></span> : null}
            {step.freed.includes("room") ? <span className="chain-free is-room" title="يُفرغ القاعة"><DoorOpen aria-hidden="true" /></span> : null}
          </span>
        </div>
        <div className="chain-move" aria-label={`من ${daysText(step.from.days)} ${step.from.start} إلى ${daysText(step.to.days)} ${step.to.start}`}>
          <SlotChip slot={step.from} tone="from" />
          <ArrowLeft className="chain-arrow" aria-hidden="true" />
          <SlotChip slot={step.to} tone="to" room={step.roomChanged} />
        </div>
      </div>
    </li>
  );
}

function WeekStrip({ title, week, tone }: { title: string; week: ChainWeek; tone: "before" | "after" }) {
  const span = Math.max(60, week.to - week.from);
  const pos = (minutes: number) => `${Math.max(0, Math.min(100, ((minutes - week.from) / span) * 100))}%`;
  const byDay = (day: DayKey) => week.blocks.filter(block => block.day === day);
  return (
    <figure className={`chain-week is-${tone}`}>
      <figcaption><i aria-hidden="true" />{title}</figcaption>
      <div className="chain-week-grid" aria-hidden="true">
        {DAYS.map(day => (
          <div key={day} className="chain-week-col">
            <span className="chain-week-day">{DAY_SHORT[day]}</span>
            <div className="chain-week-lane">
              {byDay(day).map((block: ChainBlock, i) => (
                <span key={`${block.id}-${i}`} className={`chain-blk is-${block.tone}${block.clash ? " is-clash" : ""}`}
                  style={{ top: pos(block.from), height: `calc(${pos(block.to)} - ${pos(block.from)})` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </figure>
  );
}

function ImpactLine({ line, busy }: { line: ChainImpactLine | null; busy: boolean }) {
  if (busy) return <p className="chain-impact is-idle" role="status"><i aria-hidden="true" className="chain-dot" /><span className="chain-skel chain-skel-line" aria-label="يقيس الأثر" /></p>;
  if (!line) return null;
  return (
    <p className={`chain-impact is-${line.tone}`} role="status">
      <i aria-hidden="true" className="chain-dot" />
      <span>{line.text}</span>
    </p>
  );
}

/* ── العرض (لا حالة ولا شبكة: يُختبر وحده) ──────────────────────────────── */

export interface ChainSolveViewProps {
  phase: ChainPhase;
  solution: ChainSolution | null;
  impact: ChainImpactLine | null;
  impactBusy?: boolean;
  draftLabel?: { code: string; slot: ChainSlot } | null;
  error?: string;
  onApply?: () => void;
  onCancel?: () => void;
  onRetry?: () => void;
  onUndo?: () => void;
  onClose?: () => void;
  titleId?: string;
  primaryRef?: React.Ref<HTMLButtonElement>;
}

export function ChainSolveView({ phase, solution, impact, impactBusy = false, draftLabel, error, onApply, onCancel, onRetry, onUndo, onClose, titleId, primaryRef }: ChainSolveViewProps) {
  const moves = solution?.ok && phase !== "solving" ? solution.steps.length : 0;
  const busy = phase === "applying" || phase === "undoing";
  const reason = solution && !solution.ok ? CHAIN_REASON[solution.reasonIfNot || "no-chain"] : CHAIN_REASON["no-chain"];
  const ReasonIcon = REASON_ICON[reason.icon] || Route;
  return (
    <div className={`chain-panel is-${phase}`} aria-busy={phase === "solving" || busy}>
      <header className="chain-head">
        <MoveRing moves={moves} />
        <div className="chain-head-copy">
          <h2 id={titleId}>حلّ بسلسلة</h2>
          {moves ? <small><b dir="ltr">{moves}</b> {moveWord(moves)}</small> : <small aria-hidden="true">&nbsp;</small>}
        </div>
        <button type="button" className="chain-x" onClick={onClose} aria-label="إغلاق" data-guide-ignore="يغلق ورقة حلّ بسلسلة؛ لا يغيّر شيئاً"><X aria-hidden="true" /></button>
      </header>

      {phase === "solving" ? (
        <div className="chain-body" role="status" aria-label="يبحث عن سلسلة">
          {[0, 1, 2].map(i => <div key={i} className="chain-skel chain-skel-card" style={{ ["--i" as any]: i }} />)}
          <LoaderCircle className="chain-spin" aria-hidden="true" />
        </div>
      ) : null}

      {phase === "empty" ? (
        <div className="chain-body chain-empty" role="status">
          <span className="chain-empty-ico"><ReasonIcon aria-hidden="true" /></span>
          <strong>{solution && !solution.ok ? "لا سلسلة آمنة" : reason.word}</strong>
          <span className="chain-reason"><ReasonIcon aria-hidden="true" />{reason.word}</span>
        </div>
      ) : null}

      {phase === "error" ? (
        <div className="chain-body chain-empty is-error" role="alert">
          <span className="chain-empty-ico"><TriangleAlert aria-hidden="true" /></span>
          <strong>{error || "تعذّر الحلّ"}</strong>
          {onRetry ? <button type="button" className="chain-btn is-ghost" onClick={onRetry} data-guide-ignore="يعيد البحث عن سلسلة؛ لا يكتب شيئاً">أعد المحاولة</button> : null}
        </div>
      ) : null}

      {(phase === "ready" || busy || phase === "done") && solution?.ok ? (
        <div className="chain-body">
          <ol className="chain-steps" aria-label="خطوات السلسلة" style={{ ["--chain-n" as any]: solution.steps.length }}>
            {solution.steps.map((step, index) => <React.Fragment key={step.rowId}><StepCard step={step} index={index} /></React.Fragment>)}
            <li className="chain-step is-end">
              <span className="chain-node is-end" aria-hidden="true"><CircleCheck /></span>
              <div className="chain-card is-end">
                <b>يدخل هنا</b>
                {draftLabel ? <span className="chain-end-slot"><b className="chain-code" dir="ltr">{draftLabel.code}</b><SlotChip slot={draftLabel.slot} tone="to" /></span> : null}
              </div>
            </li>
          </ol>
          <div className="chain-weeks">
            <WeekStrip title="قبل" week={solution.weeks.before} tone="before" />
            <WeekStrip title="بعد" week={solution.weeks.after} tone="after" />
          </div>
          <div className="chain-foot-info">
            <ImpactLine line={impact} busy={impactBusy} />
            <span className="chain-chips" aria-label="ملخص الأثر">
              <span className="chain-chip" title="أساتذة تتحرّك مواعيدهم"><UserRound aria-hidden="true" /><b dir="ltr">{solution.effects.teachers}</b></span>
              <span className="chain-chip" title="قاعات تتبدّل"><DoorOpen aria-hidden="true" /><b dir="ltr">{solution.effects.roomChanges}</b></span>
            </span>
          </div>
        </div>
      ) : null}

      <footer className="chain-actions">
        {phase === "ready" || phase === "applying" ? (
          <>
            <button type="button" className="chain-btn is-primary" onClick={onApply} disabled={busy || !solution?.canApply} ref={primaryRef} aria-busy={phase === "applying"}
              data-guide-ignore="يطبّق نقلات السلسلة كلّها دفعةً واحدة عبر آلة الزمن؛ تُكتب كلُّها أو لا شيء">
              {phase === "applying" ? <LoaderCircle className="chain-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}<span>طبّق السلسلة</span>
            </button>
            <button type="button" className="chain-btn is-ghost" onClick={onCancel} disabled={busy} data-guide-ignore="يغلق ورقة السلسلة دون تطبيق شيء"><Undo2 aria-hidden="true" /><span>تراجع</span></button>
          </>
        ) : null}
        {phase === "done" || phase === "undoing" ? (
          <>
            <button type="button" className="chain-btn is-primary" onClick={onClose} ref={primaryRef} disabled={phase === "undoing"} data-guide-ignore="يغلق الورقة بعد تطبيق السلسلة؛ لا يغيّر شيئاً"><CircleCheck aria-hidden="true" /><span>تمّ</span></button>
            <button type="button" className="chain-btn is-ghost" onClick={onUndo} disabled={phase === "undoing"} aria-busy={phase === "undoing"}
              data-guide-ignore="يعيد المواعيد المنقولة كما كانت من نقطة استعادة آلة الزمن">
              {phase === "undoing" ? <LoaderCircle className="chain-spin" aria-hidden="true" /> : <Undo2 aria-hidden="true" />}<span>تراجع عن السلسلة</span>
            </button>
          </>
        ) : null}
        {phase === "empty" || phase === "error" || phase === "solving" ? (
          <button type="button" className="chain-btn is-ghost" onClick={onClose} ref={primaryRef} data-guide-ignore="يغلق الورقة؛ لا يغيّر شيئاً"><X aria-hidden="true" /><span>إغلاق</span></button>
        ) : null}
      </footer>
    </div>
  );
}

/* ── الحاوية: الحلّ، الأثر، الاعتماد الذرّي، الاستعادة ─────────────────────── */

async function postJson(url: string, body: unknown): Promise<any> {
  const sent = JSON.stringify(body ?? {});
  const response = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: sent });
  const data = await response.json().catch(() => ({}));
  /* اعتمادٌ يخالف اللائحة: سؤالٌ صريح ثم الطلبُ نفسه موسوماً (كما في آلة الزمن). */
  const settled = await settleRegulationException(response.status, data, sent, marked => postJson(url, JSON.parse(marked)));
  if (settled) return settled.value;
  if (!response.ok) { const error: any = new Error(data?.error || "تعذّر التنفيذ"); error.body = data; error.status = response.status; throw error; }
  return data;
}

/** الزرّ بجانب «بديل» في لوحة فحص الموانع (يأخذ صنفَ checks-alt نفسه فيرث شكلَه). */
export function ChainSolveButton({ onOpen, busy = false }: { onOpen: () => void; busy?: boolean }) {
  return (
    <button type="button" className="checks-alt chain-solve-btn" onClick={onOpen} disabled={busy}
      data-guide-ignore="يبحث عن سلسلة قصيرة تنقل مواعيد أخرى وتُخلي المكان لموعدك؛ لا يكتب شيئاً قبل أن تطبّقها">
      <Link2 aria-hidden="true" />{busy ? "…" : "حلّ بسلسلة"}
    </button>
  );
}

const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface ChainAppliedInfo { moves: number; rowIds: number[]; scenarioId: string; undone?: boolean }

export default function ChainSolveSheet({ open, onClose, input, onApplied, onUndone }: {
  open: boolean;
  onClose: () => void;
  /** مدخلُ الحلّ (يُقرأ لحظةَ الفتح؛ لا يُعاد الحلُّ عند كل رسم). */
  input: ChainSolveInput;
  /** بعد الاعتماد (وبعد التراجع أيضاً بـundone): أعد فحص الموعد وحمّل المواعيد. */
  onApplied: (info: ChainAppliedInfo) => void;
  onUndone?: (info: ChainAppliedInfo) => void;
}) {
  const [phase, setPhase] = useState<ChainPhase>("solving");
  const [solution, setSolution] = useState<ChainSolution | null>(null);
  const [impact, setImpact] = useState<ChainImpactLine | null>(null);
  const [impactBusy, setImpactBusy] = useState(false);
  const [error, setError] = useState("");
  const [scenario, setScenario] = useState<{ id: string; revision: number } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef(input);
  inputRef.current = input;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useDialogDismiss(open, () => { if (phase !== "applying" && phase !== "undoing") onClose(); });

  /* الحلّ: بعد رسمٍ واحد ليظهر الهيكل العظمي، فالبحثُ حسابٌ متزامن قد يطول لحظة. */
  useEffect(() => {
    if (!open) return;
    setPhase("solving"); setSolution(null); setImpact(null); setError(""); setScenario(null);
    const timer = window.setTimeout(() => {
      try {
        const out = solveChain(inputRef.current);
        if (!alive.current) return;
        setSolution(out);
        setPhase(out.ok ? "ready" : "empty");
      } catch (e: any) {
        if (!alive.current) return;
        setError("تعذّر الحلّ"); setPhase("error");
      }
    }, 40);
    return () => window.clearTimeout(timer);
  }, [open, attempt]);

  /* أثرُ السلسلة على الطلبة: من رادار آلة الزمن نفسه (عدٌّ لا أسماء)، وبلا رادار لا رقمَ مخترع. */
  useEffect(() => {
    if (!open || !solution?.ok) return;
    let cancelled = false;
    setImpactBusy(true);
    postJson("/api/time-machine/students", { ...inputRef.current.scope, changes: solution.changes })
      .then(body => { if (!cancelled) setImpact(body.available ? chainImpactLine(body.impact) : chainImpactLine(null)); })
      .catch(() => { if (!cancelled) setImpact(chainImpactLine(null)); })
      .finally(() => { if (!cancelled) setImpactBusy(false); });
    return () => { cancelled = true; };
  }, [open, solution]);

  /* التركيز: يدخل الورقة، ويدور فيها، ويعود لمن فتحها (useDialogDismiss). */
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const id = window.requestAnimationFrame(() => (primaryRef.current || panel?.querySelector<HTMLElement>(FOCUSABLE))?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open, phase]);
  /* الحبس والعودة بالمرجع المشترك (useFocusTrap): مرجعٌ ثابتٌ كي لا يُعاد تركيبه في كل رسم. */
  const panelRefCallback = useCallback((element: HTMLDivElement | null) => { panelRef.current = element; return trapFocusRef(element); }, []);

  const apply = async () => {
    if (!solution?.ok || phase === "applying") return;
    setPhase("applying"); setError("");
    try {
      const scope = inputRef.current.scope;
      const saved = await postJson("/api/time-machine/scenarios", { ...scope, name: "حلّ بسلسلة", mode: "lab", changes: solution.changes });
      const record = saved.scenario;
      const body = await postJson(`/api/time-machine/scenarios/${record.id}/apply`, { revision: record.revision });
      if (!alive.current) return;
      setScenario({ id: record.id, revision: Number(body.scenario?.revision ?? record.revision) });
      setPhase("done");
      onApplied({ moves: solution.steps.length, rowIds: solution.steps.map(step => step.rowId), scenarioId: record.id });
    } catch (e: any) {
      if (!alive.current) return;
      const drifted = e?.body?.code === "drift" || e?.body?.code === "revision" || e?.body?.code === "stale";
      setError(drifted ? "تغيّر الجدول — أعد الحلّ" : e?.message || "تعذّر التطبيق");
      setPhase("error");
    }
  };

  const undo = async () => {
    if (!scenario || phase === "undoing") return;
    setPhase("undoing"); setError("");
    try {
      await postJson(`/api/time-machine/scenarios/${scenario.id}/restore`, {});
      if (!alive.current) return;
      const info: ChainAppliedInfo = { moves: solution?.steps.length || 0, rowIds: solution?.steps.map(step => step.rowId) || [], scenarioId: scenario.id, undone: true };
      (onUndone || onApplied)(info);
      onClose();
    } catch (e: any) {
      if (!alive.current) return;
      setError(e?.message || "تعذّر التراجع"); setPhase("error");
    }
  };

  const draft = input.draft;
  const draftLabel = useMemo(() => (draft.days.length ? { code: draft.courseCode || draft.courseName || "", slot: { days: [...draft.days], start: draft.start, end: draft.end, room: draft.room?.code || "", hall: draft.room?.hall || "" } } : null),
    [draft.courseCode, draft.courseName, draft.days, draft.start, draft.end, draft.room?.code, draft.room?.hall]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="chain-layer">
      <div className="chain-backdrop" onClick={() => { if (phase !== "applying" && phase !== "undoing") onClose(); }} aria-hidden="true" />
      <div className="chain-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panelRefCallback} dir="rtl">
        <span className="chain-grip" aria-hidden="true" />
        <ChainSolveView phase={phase} solution={solution} impact={impact} impactBusy={impactBusy} draftLabel={draftLabel} error={error} titleId={titleId} primaryRef={primaryRef}
          onApply={() => void apply()} onCancel={onClose} onClose={onClose} onUndo={() => void undo()}
          onRetry={() => setAttempt(count => count + 1)} />
      </div>
    </div>,
    document.body,
  );
}
