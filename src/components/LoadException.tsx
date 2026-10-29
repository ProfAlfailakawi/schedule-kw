import React, { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Briefcase, CalendarClock, ClipboardList, Ellipsis, UserCog } from "lucide-react";
import { CatalogFormDrawer, GhostButton, PrimaryButton, SecondaryButton } from "./ui";
import {
  LOAD_EXCEPTION_REASONS, MAX_LOAD_HOURS, MAX_OVERTIME_HOURS, emptyTeachingLoadConfig, evaluateTeachingLoad, hasLoadOverride,
  loadExceptionReasonLabel, parseWholeHours, teachingLoadProblem, type TeachingLoadState,
} from "../utils/teachingLoad";
import type { AcademicRank, LoadExceptionReason, TeachingLoadAssignment } from "../types";

/**
 * ── استثناءُ النصاب: قطعٌ مشتركة ─────────────────────────────────────────────
 *
 * خانةُ ساعاتٍ صحيحة، ومقياسُ عبءٍ صغير (الأدنى ← الأعلى ← الإضافي)، وشارةُ «استثناء»، ومحرّرُ استثناء العضو.
 * يستعملها إعدادُ النصاب (يعدّل في الذاكرة ثم «حفظ») وشاشةُ الأساتذة (تحفظ استثناءَ العضو وحده).
 */

type TermOption = { id: number; name: string };
const num = (value: number) => Number(value || 0).toLocaleString("ar-KW-u-nu-latn", { maximumFractionDigits: 2 });
const REASON_ICON: Record<LoadExceptionReason, React.ReactNode> = {
  admin: <Briefcase aria-hidden="true" />, task: <ClipboardList aria-hidden="true" />, sabbatical: <BookOpen aria-hidden="true" />, other: <Ellipsis aria-hidden="true" />,
};

/** خانةُ ساعاتٍ صحيحة: الكسرُ يُقرَّب فوراً ويُقال ذلك بلطف (onRounded)، والفارغُ = «من الدرجة». */
export function HoursInput({ value, onChange, onRounded, max = MAX_LOAD_HOURS, placeholder, label, disabled }: {
  value: number | undefined; onChange: (value: number | undefined) => void; onRounded?: (rounded: number) => void;
  max?: number; placeholder?: string; label: string; disabled?: boolean;
}) {
  return (
    <input
      type="number" inputMode="numeric" min={0} max={max} step={1} dir="ltr" className="tl-hours"
      value={value ?? ""} placeholder={placeholder} aria-label={label} disabled={disabled}
      onKeyDown={event => { if (event.key === "." || event.key === ",") { event.preventDefault(); onRounded?.(Number(value ?? 0)); } }}
      onChange={event => {
        const parsed = parseWholeHours(event.target.value, max);
        if (parsed.rounded && parsed.value !== undefined) onRounded?.(parsed.value);
        onChange(parsed.value);
      }}
    />
  );
}

/** مقياسُ العبء: منطقةُ النصاب (الأدنى..الأعلى) خضراء، والإضافيُّ هادئ، وما فوق السقف وحده تنبيه. */
export function LoadMeter({ hours, min, max, overtime, state, compact = false }: {
  hours: number; min: number | null; max: number | null; overtime: number; state: TeachingLoadState; compact?: boolean;
}) {
  if (max === null) return <span className="tl-meter is-unset" aria-hidden="true"><i /></span>;
  const ceiling = max + overtime;
  const scale = Math.max(1, ceiling, hours) * 1.08;
  const pct = (value: number) => `${Math.min(100, Math.max(0, (value / scale) * 100))}%`;
  return (
    <span className={`tl-meter is-${state}${compact ? " is-compact" : ""}`} role="img"
      aria-label={`العبء ${num(hours)} من ${num(max)}${overtime ? ` وإضافيّ ${num(overtime)}` : ""}`}>
      <i className="tl-meter-band" style={{ insetInlineStart: pct(min ?? 0), inlineSize: `calc(${pct(max)} - ${pct(min ?? 0)})` }} />
      {overtime ? <i className="tl-meter-extra" style={{ insetInlineStart: pct(max), inlineSize: `calc(${pct(ceiling)} - ${pct(max)})` }} /> : null}
      <i className="tl-meter-fill" style={{ inlineSize: pct(hours) }} />
      <i className="tl-meter-tick" style={{ insetInlineStart: pct(max) }} />
    </span>
  );
}

export function ExceptionBadge({ reason, untilName }: { reason?: LoadExceptionReason; untilName?: string }) {
  const title = `استثناء من نصاب الدرجة · ${loadExceptionReasonLabel(reason)}${untilName ? ` · حتى ${untilName}` : ""}`;
  return <span className="tl-exception-badge" title={title} aria-label={title}><UserCog aria-hidden="true" />استثناء</span>;
}

/**
 * محرّرُ استثناء عضوٍ واحد: درجتُه، وحدودٌ خاصّة به (فارغٌ = من الدرجة)، وسببٌ برقاقة، وفصلُ انتهاءٍ اختياري.
 * لا يحفظ بنفسه: `onApply` يتسلّم الإسناد الجديد (أو null لإزالة كل ما للعضو).
 */
export function LoadExceptionEditor({ name, ranks, value, terms, hours = 0, readOnly = false, busy = false, onApply, onClose }: {
  name: string; ranks: AcademicRank[]; value: TeachingLoadAssignment; terms: TermOption[]; hours?: number;
  readOnly?: boolean; busy?: boolean; onApply: (next: TeachingLoadAssignment | null) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState<TeachingLoadAssignment>(() => ({ ...value }));
  const [hint, setHint] = useState("");
  const hintTimer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(hintTimer.current), []);
  const rounded = (to: number) => {
    setHint(`النصاب بالساعات الصحيحة فقط — قُرّبت إلى ${num(to)}.`);
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(""), 4200);
  };
  const rank = ranks.find(item => item.id === draft.rankId) || null;
  const overriding = hasLoadOverride(draft);
  const preview = useMemo(() => {
    const config = { ...emptyTeachingLoadConfig(), enabled: true, ranks, assignments: { "1": draft } };
    return evaluateTeachingLoad(config, 1, hours);
  }, [ranks, draft, hours]);
  const problem = teachingLoadProblem({ ranks, assignments: { "1": draft } });
  const patch = (next: Partial<TeachingLoadAssignment>) => setDraft(current => {
    const merged: TeachingLoadAssignment = { ...current, ...next };
    if (hasLoadOverride(merged) && !merged.reason) merged.reason = "other";
    return merged;
  });
  const clean = (entry: TeachingLoadAssignment): TeachingLoadAssignment | null => {
    const out = Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined && v !== "")) as TeachingLoadAssignment;
    if (!hasLoadOverride(out)) { delete out.reason; delete out.untilTermId; }
    return Object.keys(out).length ? out : null;
  };

  return (
    <CatalogFormDrawer label={`استثناء النصاب: ${name}`} onClose={onClose}>
      <div className="tl-editor">
        <header className="tl-editor-head">
          <span className="tl-mark"><UserCog aria-hidden="true" /></span>
          <div>
            <small>استثناء النصاب</small>
            <strong>{name}</strong>
          </div>
          {overriding ? <ExceptionBadge reason={draft.reason} /> : null}
        </header>

        <label className="tl-editor-rank">
          <span>الدرجة العلمية</span>
          <select value={draft.rankId || ""} disabled={readOnly} onChange={event => patch({ rankId: event.target.value || undefined })} aria-label={`درجة ${name}`}>
            <option value="">بلا درجة</option>
            {ranks.map(item => <option key={item.id} value={item.id}>{item.name || "(بلا اسم)"}</option>)}
          </select>
        </label>

        <div className="tl-editor-grid" role="group" aria-label="حدود العضو الخاصة">
          {([
            ["minHours", "الأدنى", rank?.minHours, MAX_LOAD_HOURS],
            ["maxHours", "الأعلى", rank?.maxHours, MAX_LOAD_HOURS],
            ["extraHours", "الإضافي", rank?.overtimeHours ?? 0, MAX_OVERTIME_HOURS],
          ] as Array<[keyof TeachingLoadAssignment, string, number | undefined, number]>).map(([key, label, fallback, max]) => (
            <label key={key} className={draft[key] !== undefined ? "is-own" : ""}>
              <span>{label}</span>
              <HoursInput value={draft[key] as number | undefined} max={max} disabled={readOnly} label={`${label} الخاص بـ${name}`}
                placeholder={fallback !== undefined ? String(fallback) : "—"} onRounded={rounded} onChange={next => patch({ [key]: next } as Partial<TeachingLoadAssignment>)} />
              <small>{draft[key] !== undefined ? "خاصّ" : "من الدرجة"}</small>
            </label>
          ))}
        </div>
        {hint ? <p className="tl-round-hint" role="status">{hint}</p> : null}

        <div className="tl-editor-preview">
          <LoadMeter hours={preview.hours} min={preview.min} max={preview.max} overtime={preview.extra} state={preview.state} />
          <span dir="ltr" className="tl-editor-sum">
            {preview.max === null ? "—" : <>{num(preview.min ?? 0)}–{num(preview.max)}{preview.extra ? <em>+{num(preview.extra)}</em> : null}</>}
          </span>
        </div>

        <fieldset className="tl-reasons" disabled={readOnly || !overriding}>
          <legend>السبب</legend>
          {LOAD_EXCEPTION_REASONS.map(item => (
            <button key={item.id} type="button" className={draft.reason === item.id && overriding ? "on" : ""} aria-pressed={draft.reason === item.id && overriding}
              data-guide-ignore="اختيار سبب استثناء نصاب العضو داخل المحرّر؛ لا يحفظ حتى «تطبيق»" onClick={() => patch({ reason: item.id })}>
              {REASON_ICON[item.id]}{item.label}
            </button>
          ))}
        </fieldset>

        <label className="tl-editor-until">
          <span><CalendarClock aria-hidden="true" /> ينتهي بعد</span>
          <select value={draft.untilTermId || ""} disabled={readOnly || !overriding} onChange={event => patch({ untilTermId: Number(event.target.value) || undefined })} aria-label="آخر فصل يسري فيه الاستثناء">
            <option value="">بلا نهاية</option>
            {terms.map(term => <option key={term.id} value={term.id}>{term.name}</option>)}
          </select>
        </label>

        {problem ? <p className="tl-problem" role="alert">{problem}</p> : null}
        <div className="tl-editor-actions">
          <PrimaryButton type="button" disabled={readOnly || busy || Boolean(problem)} data-guide-ignore="تطبيق استثناء نصاب العضو؛ لا يغيّر جدولاً"
            onClick={() => onApply(clean(draft))}>{busy ? "جارٍ الحفظ…" : "تطبيق"}</PrimaryButton>
          {hasLoadOverride(value) ? (
            <SecondaryButton type="button" disabled={readOnly || busy} data-guide-ignore="إزالة استثناء نصاب العضو فيعود إلى نصاب درجته؛ لا يغيّر جدولاً"
              onClick={() => onApply(clean({ rankId: draft.rankId }))}>إزالة الاستثناء</SecondaryButton>
          ) : null}
          <GhostButton type="button" onClick={onClose}>تراجع</GhostButton>
        </div>
      </div>
    </CatalogFormDrawer>
  );
}

/**
 * بطاقةُ النصاب في تفاصيل الأستاذ (شاشة الأساتذة) — للمدير الرئيسي، والميزةُ مفعّلة.
 * تقرأ إسنادَ العضو وحده وتحفظه وحده؛ وبعد الحفظ تُبلغ الشاشة لتحدّث شارة «استثناء» في القائمة.
 */
export function InstructorLoadPanel({ instructorId, name, demoReadOnly = false, onChanged }: {
  instructorId: number; name: string; demoReadOnly?: boolean; onChanged?: () => void;
}) {
  type Data = { enabled: boolean; ranks: AcademicRank[]; assignment: TeachingLoadAssignment; status: ReturnType<typeof evaluateTeachingLoad>; terms: TermOption[] };
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const read = () => fetch(`/api/admin/teaching-load/member/${instructorId}`, { credentials: "include", cache: "no-store" })
    .then(response => (response.ok ? response.json() : null)).then(setData).catch(() => setData(null));
  useEffect(() => { setData(null); setOpen(false); setError(""); void read(); }, [instructorId]);
  if (!data?.enabled) return null;
  const status = data.status;
  const untilName = data.terms.find(term => term.id === status.exception?.untilTermId)?.name;
  const apply = async (next: TeachingLoadAssignment | null) => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/teaching-load/member/${instructorId}`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next || {}) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "تعذّر حفظ الاستثناء");
      setOpen(false);
      await read();
      onChanged?.();
    } catch (err: any) {
      setError(err.message || "تعذّر حفظ الاستثناء");
    } finally { setBusy(false); }
  };
  return (
    <article className="tl-person" aria-label={`نصاب ${name}`}>
      <header>
        <span>النصاب</span>
        {status.exception ? <ExceptionBadge reason={status.exception.reason} untilName={untilName} /> : null}
      </header>
      <div className="tl-person-body">
        <b>{status.rank?.name || "بلا درجة"}</b>
        <span dir="ltr" className="tl-editor-sum">{status.max === null ? "—" : <>{num(status.min ?? 0)}–{num(status.max)}{status.extra ? <em>+{num(status.extra)}</em> : null}</>}</span>
      </div>
      <LoadMeter hours={status.hours} min={status.min} max={status.max} overtime={status.extra} state={status.state} compact />
      {status.exception ? <small className="tl-person-why">{loadExceptionReasonLabel(status.exception.reason)}{untilName ? ` · حتى ${untilName}` : ""}</small> : null}
      {error ? <small className="tl-problem" role="alert">{error}</small> : null}
      <SecondaryButton type="button" data-guide-ignore="يفتح محرّر استثناء نصاب هذا الأستاذ؛ لا يحفظ حتى «تطبيق»" onClick={() => setOpen(true)}>
        <UserCog aria-hidden="true" /> {status.exception ? "تعديل الاستثناء" : "استثناء"}
      </SecondaryButton>
      {open ? (
        <LoadExceptionEditor name={name} ranks={data.ranks} value={data.assignment} terms={data.terms} hours={status.hours}
          readOnly={demoReadOnly} busy={busy} onApply={next => void apply(next)} onClose={() => setOpen(false)} />
      ) : null}
    </article>
  );
}
