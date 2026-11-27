import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { History, Pause, Play } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import {
  growthDelta, growthSeries, scrubPoint, seriesAt, shortTermName, sparkAt, sparkPoints,
  type RepeatedPressure, type TimelineTerm,
} from "../utils/termTimeline";
import { SealBadge } from "./ApprovalSeal";
import "../styles/term-timeline.css";

/**
 * ── آلة الزمن (FR-SCH-102) ───────────────────────────────────────────────────
 *
 * قطعٌ مشتركة بين «بصمة القسم» و«نبض القاعات»: شريط الفصول (من الأقدم يميناً إلى
 * الجاري يساراً)، وشريط النمو، وقائمة «القاعات المضغوطة فصلاً بعد فصل»، وشارة
 * «فصلٌ سابق — للقراءة». الحساب كله في src/utils/termTimeline.ts.
 *
 * قراءةٌ فقط: لا شيء هنا يكتب. الفصل السابق يُقرأ ولا يُرتَّب ولا يُحفظ.
 */

export interface TimeMachineScope { collegeId: number; sectionId: number; termId: number }

const TTL = 60_000;
const timelineCache = new Map<string, { at: number; value: Promise<TimelineTerm[] | null> }>();

/** ملخّص فصول القسم (مسار البصمة نفسه وبوابته): يُقرأ مرةً لكل دقيقة، ولا صفوف فيه. */
export function readTimeline(scope: TimeMachineScope): Promise<TimelineTerm[] | null> {
  const key = `${scope.collegeId}:${scope.sectionId}:${scope.termId}`;
  const hit = timelineCache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const query = new URLSearchParams({ collegeId: String(scope.collegeId), sectionId: String(scope.sectionId), termId: String(scope.termId) });
  const value = fetch(`/api/dept-fingerprint/timeline?${query}`, { credentials: "include" })
    .then(response => (response.ok ? response.json() : null))
    .then(body => (Array.isArray(body?.terms) && body.terms.length >= 2 ? body.terms as TimelineTerm[] : null))
    .catch(() => null);
  timelineCache.set(key, { at: Date.now(), value });
  value.then(result => { if (!result) timelineCache.delete(key); });
  return value;
}

/** الشريط أو `null` (لا فصول سابقة، أو ليس لهذا الحساب). `enabled=false` لا يقرأ شيئاً. */
export function useTimeline(scope: TimeMachineScope, enabled: boolean): TimelineTerm[] | null {
  const [terms, setTerms] = useState<TimelineTerm[] | null>(null);
  useEffect(() => {
    let alive = true;
    setTerms(null);
    if (!enabled || !scope.collegeId || !scope.sectionId || !scope.termId) return;
    readTimeline(scope).then(result => { if (alive) setTerms(result); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.collegeId, scope.sectionId, scope.termId, enabled]);
  return terms;
}

export const prefersReducedMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/**
 * موضع الشريط: سحبٌ متصل، ثم استقرارٌ ناعم على أقرب فصل؛ والأسهم تنتقل فصلاً بتحوّلٍ
 * مرئي؛ و«شغّل» يمضي من الأقدم إلى الجاري. مع تقليل الحركة كل انتقالٍ فوري.
 * `ready(i)` يقول هل بيانات الفصل i حاضرة: التشغيل ينتظرها ولا يقفز فوقها.
 */
export function useTermScrub(count: number, opts: { reduced: boolean; ready?: (index: number) => boolean; perTermMs?: number }) {
  const last = Math.max(0, count - 1);
  const [position, setPosition] = useState(last);
  const [dragging, setDragging] = useState(false);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);
  const posRef = useRef(position);
  posRef.current = position;
  const readyRef = useRef(opts.ready);
  readyRef.current = opts.ready;
  useEffect(() => { setPosition(last); setPlaying(false); }, [last]);
  const stop = useCallback(() => { cancelAnimationFrame(raf.current); raf.current = 0; }, []);
  useEffect(() => stop, [stop]);
  const animateTo = useCallback((target: number, ms: number) => {
    stop();
    const goal = Math.max(0, Math.min(last, target));
    if (opts.reduced || ms <= 0) { setPosition(Math.round(goal)); return; }
    const from = posRef.current, t0 = performance.now();
    const step = (now: number) => {
      /* لا يدخل التحوّل فصلاً لم تصل بياناته: يقف عند حدّه حتى تصل (ثماني ثوانٍ على الأكثر). */
      const ready = readyRef.current;
      const u = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - u, 3);
      let next = from + (goal - from) * e;
      if (ready) {
        const ahead = goal > from ? Math.ceil(next - 1e-6) : Math.floor(next + 1e-6);
        if (!ready(ahead)) next = goal > from ? Math.floor(next + 1e-6) : Math.ceil(next - 1e-6);
      }
      setPosition(next);
      raf.current = (u < 1 || Math.abs(next - goal) > 1e-6) && now - t0 < ms + 8000 ? requestAnimationFrame(step) : 0;
    };
    raf.current = requestAnimationFrame(step);
  }, [last, opts.reduced, stop]);

  const scrub = useCallback((value: number) => { stop(); setPlaying(false); setDragging(true); setPosition(Math.max(0, Math.min(last, value))); }, [last, stop]);
  const release = useCallback(() => {
    setDragging(false);
    animateTo(Math.round(posRef.current), 360);
  }, [animateTo]);
  const go = useCallback((index: number) => { setPlaying(false); animateTo(index, 820); }, [animateTo]);

  /* التشغيل: فصلٌ بعد فصل بوقفةٍ قصيرة على كل فصل ليُقرأ. */
  useEffect(() => {
    if (!playing) return;
    if (opts.reduced) {
      let i = Math.round(posRef.current) >= last ? 0 : Math.round(posRef.current);
      setPosition(i);
      const timer = window.setInterval(() => {
        if (readyRef.current && !readyRef.current(i + 1)) return;
        i += 1; setPosition(Math.min(last, i));
        if (i >= last) { window.clearInterval(timer); setPlaying(false); }
      }, 1400);
      return () => window.clearInterval(timer);
    }
    stop();
    const per = opts.perTermMs || 1300, hold = 420;
    let pos = posRef.current >= last - 0.01 ? 0 : posRef.current, prev = performance.now(), wait = pos === 0 ? hold : 0;
    setPosition(pos);
    const step = (now: number) => {
      const dt = now - prev; prev = now;
      if (wait > 0) wait -= dt;
      else {
        const target = Math.floor(pos + 1e-6) + 1;
        if (!readyRef.current || readyRef.current(target)) {
          const next = Math.min(target, pos + dt / per);
          if (next >= target - 1e-6) { pos = target; wait = hold; } else pos = next;
          setPosition(pos);
        }
      }
      if (pos >= last) { setPlaying(false); raf.current = 0; return; }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, last, opts.reduced]);

  return { position, dragging, playing, scrub, release, go, setPlaying, point: scrubPoint(position, count) };
}

const num = (value: number) => Math.round(value).toLocaleString("ar-KW-u-nu-latn");

/** شريط الفصول: علامةٌ لكل فصل باسمه القصير، ومقبضٌ يُسحب، والأسهم تنتقل فصلاً. */
export function TermScrubber({ terms, position, playing, onScrub, onRelease, onStep, onPlay, compact = false, busy = false }: {
  terms: readonly TimelineTerm[]; position: number; playing: boolean;
  onScrub: (value: number) => void; onRelease: () => void; onStep: (index: number) => void; onPlay: () => void;
  compact?: boolean;
  /** فصلٌ تُقرأ بياناته الآن: يتنفّس المقبض. */
  busy?: boolean;
}) {
  const last = Math.max(1, terms.length - 1);
  const point = scrubPoint(position, terms.length);
  const near = terms[point.nearest];
  const at = (index: number) => `${(index / last) * 100}%`;
  const onKey = (event: React.KeyboardEvent) => {
    const here = Math.round(position);
    /* الشريط من اليمين (الأقدم) إلى اليسار (الجاري): اليسار وأعلى أحدث، واليمين وأسفل أقدم. */
    const next = event.key === "ArrowLeft" || event.key === "ArrowUp" ? here + 1
      : event.key === "ArrowRight" || event.key === "ArrowDown" ? here - 1
      : event.key === "Home" ? 0 : event.key === "End" ? terms.length - 1
      : event.key === "PageUp" ? here + 3 : event.key === "PageDown" ? here - 3 : null;
    if (next == null) return;
    event.preventDefault();
    onStep(Math.max(0, Math.min(terms.length - 1, next)));
  };
  return <div className={`tm-scrubber${compact ? " is-compact" : ""}`} role="group" aria-label="آلة الزمن: فصول القسم من الأقدم إلى الجاري">
    <div className="tm-scrubber-head">
      <span className="tm-kicker"><History aria-hidden="true" />آلة الزمن · عبر الفصول</span>
      <strong className="tm-readout" aria-live="polite">{near?.termName}</strong>
      {near && !near.current ? <span className="tm-past-chip">فصلٌ سابق — للقراءة</span> : <span className="tm-now-chip">الفصل الجاري</span>}
      {near?.seal ? <span className="tm-seal-chip"><SealBadge seal={near.seal} size={18} />مختومٌ باعتماد التسجيل</span> : null}
      <button type="button" className="tm-play" onClick={onPlay} aria-pressed={playing}
        data-guide-ignore="يمضي بالشريط من أقدم فصلٍ إلى الجاري ليُرى نموّ القسم؛ عرضٌ لا يغيّر بيانات">
        {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}<span>{playing ? "أوقف" : "شغّل الرحلة"}</span>
      </button>
    </div>
    <div className={`tm-track${busy ? " is-busy" : ""}`} dir="rtl">
      <span className="tm-rail" aria-hidden="true" />
      <span className="tm-rail-fill" aria-hidden="true" style={{ inlineSize: at(position) }} />
      {terms.map((term, index) => {
        const reached = index <= position + 1e-6;
        return <span key={term.termId} className={`tm-tick${reached ? " is-reached" : ""}${index === point.nearest ? " is-near" : ""}${term.seal ? " is-sealed" : ""}${index === 0 ? " is-first" : index === terms.length - 1 ? " is-last" : ""}${Math.abs(index - point.nearest) === 1 ? " is-beside" : ""}`}
          style={{ insetInlineStart: at(index) }} aria-hidden="true">
          {term.pressured.length ? <i className="tm-tick-heat" style={{ blockSize: `${Math.min(14, 4 + term.pressured.length * 2.5)}px` }} /> : null}
          <b />
          <small>{shortTermName(term.termName)}</small>
        </span>;
      })}
      <span className="tm-thumb" aria-hidden="true" style={{ insetInlineStart: at(position) }} />
      <input type="range" className="tm-input" min={0} max={terms.length - 1} step="any" value={position} dir="rtl"
        aria-label="الفصل المعروض" aria-valuetext={near ? `${near.termName}${near.current ? "، الفصل الجاري" : "، فصلٌ سابق للقراءة"}` : undefined}
        onChange={event => onScrub(Number(event.target.value))}
        onPointerUp={onRelease} onKeyDown={onKey} onBlur={() => { if (Math.abs(position - Math.round(position)) > 0.001) onRelease(); }}
        data-guide-ignore="يختار الفصل المعروض بالسحب عبر فصول القسم؛ عرضٌ لا يغيّر بيانات" />
    </div>
  </div>;
}

function Spark({ label, values, position, unit }: { label: string; values: number[]; position: number; unit: string }) {
  const W = 132, H = 34;
  const points = sparkPoints(values, W, H);
  const dot = sparkAt(values, W, H, position);
  const line = points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join("");
  const area = points.length ? `${line}L${points[points.length - 1].x} ${H}L${points[0].x} ${H}Z` : "";
  const value = seriesAt(values, position);
  const delta = growthDelta(values);
  return <div className="tm-spark">
    <span className="tm-spark-label">{label}</span>
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      <path d={area} className="tm-spark-area" />
      <path d={line} className="tm-spark-line" />
      {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="1.6" className="tm-spark-node" />)}
      <circle cx={dot.x} cy={dot.y} r="4.2" className="tm-spark-dot" />
    </svg>
    <span className="tm-spark-value"><b>{num(value)}</b><small>{unit}</small></span>
    {delta ? <span className={`tm-spark-delta${delta.startsWith("+") ? " is-up" : delta === "0" ? "" : " is-down"}`} title="من أقدم فصلٍ إلى الجاري"><bdi dir="ltr">{delta}</bdi></span> : null}
  </div>;
}

/** شريط النمو: الشعب وساعات الأسبوع والقاعات فصلاً بفصل، ونقطةٌ تتبع الشريط. */
export function GrowthStrip({ terms, position }: { terms: readonly TimelineTerm[]; position: number }) {
  const series = useMemo(() => growthSeries(terms), [terms]);
  return <div className="tm-growth" role="img"
    aria-label={`نموّ القسم من ${terms[0]?.termName || ""} إلى ${terms[terms.length - 1]?.termName || ""}: الشعب ${series.sections.join("، ")}؛ ساعات الأسبوع ${series.hours.join("، ")}؛ القاعات ${series.halls.join("، ")}`}>
    <Spark label="الشعب" values={series.sections} position={position} unit="شعبة" />
    <Spark label="ساعات الأسبوع" values={series.hours} position={position} unit="ساعة" />
    <Spark label="القاعات" values={series.halls} position={position} unit="قاعة" />
  </div>;
}

/** «القاعات المضغوطة فصلاً بعد فصل»: كل قاعةٍ بندوبها ونقطةٍ لكل فصلٍ على الشريط. */
export function PressureList({ items, terms, onPick, activeKey, nearTermId }: {
  items: readonly RepeatedPressure[]; terms: readonly TimelineTerm[];
  onPick?: (key: string) => void; activeKey?: string | null;
  /** الفصل المعروض: نقطته مؤطّرة. */
  nearTermId?: number;
}) {
  return <section className="tm-pressure" aria-labelledby="tm-pressure-title">
    <h3 id="tm-pressure-title"><i className="tm-scar-glyph" aria-hidden="true" />القاعات المضغوطة فصلاً بعد فصل</h3>
    {!items.length ? <p className="tm-fine">لم يتكرر الضيق في قاعةٍ واحدة عبر هذه الفصول.</p> : <ol>
      {items.slice(0, 6).map(item => <li key={item.key}>
        <button type="button" className={activeKey === item.key ? "is-on" : undefined} aria-pressed={activeKey === item.key} disabled={!onPick}
          onClick={() => onPick?.(item.key)} data-guide-ignore="يُبرز هذه القاعة في الرسم؛ عرضٌ لا فعل">
          <span className="tm-scars" aria-hidden="true">{Array.from({ length: Math.min(4, item.count) }, (_, i) => <i key={i} />)}</span>
          <bdi dir="ltr" className="tm-hall">{item.name}</bdi>
          <span className="tm-count">ضاقت في {countOf(item.count, AR.term)}</span>
          <span className="tm-dots" aria-hidden="true">{terms.map(term => <i key={term.termId}
            className={`${item.termIds.includes(term.termId) ? "is-hit" : ""}${term.termId === nearTermId ? " is-near" : ""}`} />)}</span>
        </button>
      </li>)}
    </ol>}
    {items.length > 6 ? <p className="tm-fine">و{countOf(items.length - 6, AR.room)} أخرى.</p> : null}
  </section>;
}
