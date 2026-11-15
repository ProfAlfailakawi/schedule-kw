import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  buildReplay, exactStamp, relativeDay, replayCounters, replayDays, REPLAY_DAYS, stateAt,
  type Replay, type ReplayCard, type ReplayEvent, type ReplayKind, type ReplayRowLite,
} from "../utils/weekReplay";
import type { WhyIconName } from "../utils/whyNotIcons";
import WhyIcon from "./WhyIcon";

/**
 * ── «إعادة عرض الأسبوع» ───────────────────────────────────────────────────────────
 *
 * مشهدٌ للقراءة فقط: الجدولُ كما تكوّن، حدثاً بعد حدث. الشبكةُ تُرسم من `stateAt` (src/utils/weekReplay.ts)،
 * والحركةُ حسب نوع الحدث: الإضافةُ تظهر خضراء، والنقلُ ينزلق من موضعه القديم ويترك أثراً باهتاً،
 * والحذفُ يخبو أحمر، وتغيّرُ القاعة أو الأستاذ يومضُ على حافّة البطاقة. مع «تقليل الحركة»: لا حركة، والخطوةُ يدويّة.
 */
const DAY_LABEL: Record<string, string> = { fsunday: "أحد", fmonday: "اثنين", ftuesday: "ثلاثاء", fwednesday: "أربعاء", fthursday: "خميس" };
const KIND_META: Record<ReplayKind, { icon: WhyIconName; word: string }> = {
  add: { icon: "add", word: "إضافة" }, remove: { icon: "remove", word: "حذف" }, move: { icon: "move", word: "نقل" },
  teacher: { icon: "instructor", word: "أستاذ" }, room: { icon: "room", word: "قاعة" },
};
const clock = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const SPEEDS = [1, 2, 4] as const;
const SPEED_MS: Record<number, number> = { 1: 1200, 2: 600, 4: 300 };

type Load = { state: "loading" } | { state: "error" } | { state: "ready"; replay: Replay };

export interface WeekReplayProps {
  scope: { collegeId: number; sectionId: number; termId: number };
  /** الجدولُ الحيّ كما تعرضه الشاشة (نهايةُ الإعادة). */
  current: readonly ReplayRowLite[];
  instructorName?: (id: number) => string;
  onClose: () => void;
}

const reduceMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

export default function WeekReplay({ scope, current, instructorName, onClose }: WeekReplayProps) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [k, setK] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [animate, setAnimate] = useState(false);
  const reduced = useMemo(reduceMotion, []);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/schedules/replay?collegeId=${scope.collegeId}&sectionId=${scope.sectionId}&termId=${scope.termId}`, { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(response => response.ok ? response.json() : Promise.reject(new Error("replay")))
      .then(body => setLoad({ state: "ready", replay: buildReplay({ snapshots: body.snapshots || [], trail: body.trail || [], current }) }))
      .catch(error => { if (error?.name !== "AbortError") setLoad({ state: "error" }); });
    return () => controller.abort();
  // الحيُّ يُقرأ مرةً عند الفتح: الإعادةُ لقطةٌ لا بثّ.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.collegeId, scope.sectionId, scope.termId]);

  const replay = load.state === "ready" ? load.replay : null;
  const total = replay?.events.length || 0;
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    if (!playing) return;
    if (k >= total) { setPlaying(false); return; }
    const timer = window.setTimeout(() => { setAnimate(true); setK(value => Math.min(total, value + 1)); }, SPEED_MS[speed]);
    return () => window.clearTimeout(timer);
  }, [playing, k, total, speed]);

  const step = (delta: number) => { setPlaying(false); setAnimate(delta > 0 && !reduced); setK(value => Math.max(0, Math.min(total, value + delta))); };
  const toggle = () => { if (reduced || !total) return; if (k >= total) setK(0); setAnimate(true); setPlaying(value => !value); };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); event.preventDefault(); onClose(); return; }
      if (!total) return;
      if (event.key === "ArrowRight") { event.preventDefault(); step(-1); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); step(1); }
      else if (event.key === " " && !(event.target as HTMLElement)?.closest?.("button,input")) { event.preventDefault(); toggle(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, reduced, onClose, k]);

  const cards = useMemo(() => replay ? stateAt(replay, k) : [], [replay, k]);
  const event: ReplayEvent | null = replay && k > 0 ? replay.events[k - 1] : null;
  const counters = useMemo(() => replay ? replayCounters(replay, k) : { added: 0, moved: 0, removed: 0, other: 0 }, [replay, k]);
  const groups = useMemo(() => replay ? replayDays(replay) : [], [replay]);

  /* مدى الزمن: من كل ما مرّ على الجدول، لا من اللحظة وحدها — فلا تقفز الشبكة بين الخطوات. */
  const span = useMemo(() => {
    if (!replay) return { from: 8 * 60, to: 16 * 60 };
    const all: ReplayCard[] = [...replay.base, ...replay.final, ...replay.events.map(item => item.card)];
    if (!all.length) return { from: 8 * 60, to: 16 * 60 };
    return { from: Math.floor(Math.min(...all.map(card => card.start)) / 60) * 60, to: Math.ceil(Math.max(...all.map(card => card.end)) / 60) * 60 };
  }, [replay]);
  const hours = useMemo(() => { const out: number[] = []; for (let t = span.from; t < span.to; t += 60) out.push(t); return out; }, [span]);
  const pct = (minutes: number) => ((minutes - span.from) / Math.max(60, span.to - span.from)) * 100;
  const dayIndex = (day: string) => REPLAY_DAYS.indexOf(day as typeof REPLAY_DAYS[number]);

  const place = (card: ReplayCard, day: string, ghost?: { slotDay?: string; start: number; end: number }) => ({
    insetInlineStart: `${dayIndex(day) * 20}%`, top: `${pct(card.start)}%`, height: `${pct(card.end) - pct(card.start)}%`,
    ["--rp-hue" as string]: String((card.courseId * 47) % 360),
    ...(ghost ? {} : {}),
  });
  /* انزلاق النقل: من الموضع القديم (فارقُ الأعمدة والدقائق) إلى الجديد. */
  const slideFrom = (card: ReplayCard, day: string, from: { days: string[]; start: number }) => {
    const oldDay = from.days[Math.min(from.days.length - 1, Math.max(0, card.days.indexOf(day)))] || from.days[0] || day;
    const height = Math.max(1, pct(card.end) - pct(card.start));
    return { ["--rp-fx" as string]: `${(dayIndex(day) - dayIndex(oldDay)) * 100}%`, ["--rp-fy" as string]: `${((pct(from.start) - pct(card.start)) / height) * 100}%` };
  };

  const progress = total ? k / total : 0;
  const RING = 2 * Math.PI * 17;
  const who = event?.who || event?.seat || "";

  const body = (() => {
    if (load.state === "loading") return <div className="rp-empty" role="status"><WhyIcon name="replay" className="rp-empty-ico is-spin" /><span>يقرأ السجل…</span></div>;
    if (load.state === "error") return <div className="rp-empty" role="status"><WhyIcon name="close" className="rp-empty-ico" /><span>تعذّرت قراءة السجل</span></div>;
    if (!total) return <div className="rp-empty" role="status"><WhyIcon name="history" className="rp-empty-ico" /><span>لا سجل تغييرات بعد</span></div>;
    return (
      <>
        <div className="rp-who" aria-live="polite">
          {event ? (
            <span key={event.n} className={`rp-chip is-${event.kind}`}>
              <i className="rp-chip-ico"><WhyIcon name={KIND_META[event.kind].icon} /></i>
              <b>{KIND_META[event.kind].word}</b>
              <span className="rp-chip-code" dir="ltr">{event.card.code || event.card.course.slice(0, 12)}{event.card.scode ? ` · ${event.card.scode}` : ""}</span>
              {event.kind === "move" && event.from ? <span className="rp-chip-slot" dir="ltr">{clock(event.from.start)} → {clock(event.card.start)}</span> : null}
              {who ? <em className="rp-chip-who"><WhyIcon name="instructor" />{who}</em> : null}
              <time className="rp-chip-when" dateTime={event.at} title={exactStamp(event.at)}><WhyIcon name="hours" />{relativeDay(event.at)}</time>
            </span>
          ) : <span className="rp-chip is-start"><i className="rp-chip-ico"><WhyIcon name="history" /></i><b>البداية</b></span>}
        </div>
        <div className="rp-stage" data-animate={animate ? "1" : "0"}>
          <div className="rp-days" aria-hidden="true">{REPLAY_DAYS.map(day => <span key={day}>{DAY_LABEL[day]}</span>)}</div>
          <div className="rp-grid" role="img" aria-label={`الجدول بعد ${k} من ${total} حدثاً`}>
            {hours.map(t => <i key={t} className="rp-hour" style={{ top: `${pct(t)}%` }}><span dir="ltr">{clock(t)}</span></i>)}
            {REPLAY_DAYS.map((day, index) => <i key={day} className="rp-col" style={{ insetInlineStart: `${index * 20}%` }} />)}
            {event && event.kind === "move" && event.from ? event.from.days.map(day => (
              <span key={`ghost-${event.n}-${day}`} className="rp-card rp-ghost" aria-hidden="true"
                style={place({ ...event.card, start: event.from!.start, end: event.from!.end }, day)} />
            )) : null}
            {event && event.kind === "remove" ? event.card.days.map(day => (
              <span key={`gone-${event.n}-${day}`} className="rp-card rp-gone" aria-hidden="true" style={place(event.card, day)}>
                <b>{event.card.code || event.card.course}</b>
              </span>
            )) : null}
            {cards.flatMap(card => card.days.map(day => {
              const hot = event && event.uid === card.uid && event.kind !== "remove" ? event : null;
              const cls = hot ? ` is-${hot.kind}${hot.flags.includes("room") ? " flash-room" : ""}${hot.flags.includes("teacher") ? " flash-teacher" : ""}` : "";
              const style = { ...place(card, day), ...(hot && hot.kind === "move" && hot.from && animate ? slideFrom(card, day, hot.from) : {}) };
              const title = `${card.course} ${card.scode ? `· ${card.scode}` : ""}${instructorName && card.instructorId ? ` · ${instructorName(card.instructorId)}` : ""} · ${clock(card.start)}–${clock(card.end)}${card.room ? ` · ${card.room}` : ""}`;
              return (
                <span key={`${card.uid}:${day}${hot ? `:${hot.n}` : ""}`} className={`rp-card${cls}`} style={style} title={title}>
                  <b>{card.code || card.course}</b>
                  <small dir="ltr">{card.scode ? `${card.scode} · ` : ""}{clock(card.start)}</small>
                </span>
              );
            }))}
          </div>
        </div>
        <div className="rp-track">
          <div className="rp-ticks" aria-hidden="true">
            {replay!.events.map(item => <i key={item.n} className={`rp-tick is-${item.kind}${item.n < k ? " is-past" : ""}`} style={{ insetInlineStart: `${((item.n + 1) / total) * 100}%` }} />)}
            {groups.map(group => (
              <span key={group.day} className="rp-daygroup" style={{ insetInlineStart: `${((group.first + 1) / total) * 100}%`, ["--rp-p" as string]: `${Math.min(100, (group.count / total) * 100 * 3)}` }}
                title={`${exactStamp(replay!.events[group.first].at)} · ${group.count}`}><em>{group.count}</em></span>
            ))}
          </div>
          <input className="rp-range" type="range" min={0} max={total} step={1} value={k} aria-label="موضع الإعادة" aria-valuetext={`${k} من ${total}`}
            onChange={event2 => { setPlaying(false); setAnimate(false); setK(Number(event2.target.value)); }} data-guide-ignore="شريط الإعادة: يتنقّل بين أحداث تكوّن الجدول؛ قراءةٌ فقط" />
        </div>
      </>
    );
  })();

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="rp-layer" role="dialog" aria-modal="true" aria-label="إعادة عرض الأسبوع">
      <div className="rp-backdrop" onClick={onClose} />
      <section className="rp-sheet">
        <header className="rp-head">
          <span className="rp-ring" title={total ? `${k} / ${total}` : ""}>
            <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" className="is-track" /><circle cx="20" cy="20" r="17" className="is-fill" strokeDasharray={`${RING * progress} ${RING}`} /></svg>
            <b dir="ltr">{total ? k : <WhyIcon name="replay" />}</b>
          </span>
          <h2>إعادة عرض الأسبوع</h2>
          {total ? (
            <div className="rp-counters" role="group" aria-label="الحصيلة حتى الآن">
              <span className="is-add" title="أُضيف"><WhyIcon name="add" /><b>{counters.added}</b></span>
              <span className="is-move" title="نُقل"><WhyIcon name="move" /><b>{counters.moved}</b></span>
              <span className="is-remove" title="حُذف"><WhyIcon name="remove" /><b>{counters.removed}</b></span>
              {counters.other ? <span className="is-swap" title="قاعة أو أستاذ"><WhyIcon name="swap" /><b>{counters.other}</b></span> : null}
            </div>
          ) : null}
          <button ref={closeRef} type="button" className="rp-x" onClick={onClose} aria-label="إغلاق الإعادة" data-guide-ignore="يغلق إعادة العرض ويعود إلى الجدول"><WhyIcon name="close" /></button>
        </header>
        <div className="rp-body">{body}</div>
        {total ? (
          <footer className="rp-dock" role="group" aria-label="أزرار الإعادة">
            <button type="button" onClick={() => step(-1)} disabled={k <= 0} aria-label="خطوة للخلف" data-guide-ignore="خطوة إلى الحدث السابق"><WhyIcon name="step" className="is-flip" /></button>
            {!reduced ? (
              <button type="button" className="rp-play" onClick={toggle} aria-pressed={playing} aria-label={playing ? "إيقاف" : "تشغيل"} data-guide-ignore="يشغّل الإعادة أو يوقفها"><WhyIcon name={playing ? "pause" : "play"} /></button>
            ) : null}
            <button type="button" onClick={() => step(1)} disabled={k >= total} aria-label="خطوة للأمام" data-guide-ignore="خطوة إلى الحدث التالي"><WhyIcon name="step" /></button>
            {!reduced ? (
              <span className="rp-speeds" role="group" aria-label="السرعة">
                {SPEEDS.map(value => <button key={value} type="button" className={speed === value ? "is-on" : ""} aria-pressed={speed === value} onClick={() => setSpeed(value)} data-guide-ignore="سرعة الإعادة"><span dir="ltr">{value}x</span></button>)}
              </span>
            ) : null}
          </footer>
        ) : null}
      </section>
    </div>,
    document.body,
  );
}
