import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, Clapperboard, Copy, Fingerprint, Maximize2, Minimize2, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { deptFingerprintPath, fingerprintGeometry, FINGERPRINT_PALETTES, FINGERPRINT_VIEW, type FingerprintShape } from "../utils/deptFingerprint";
import { openInApp } from "../utils/pulseLink";
import { filmScenes, termFilmPath, weekContourShape, type TermFilmData, type TermFilmSceneKey } from "../utils/termFilm";
import { filmSound, filmSoundSupported, readFilmSoundChoice, writeFilmSoundChoice } from "./termFilmSound";
import "../styles/term-film.css";
import TermFilmExport from "./TermFilmExport";
import { SealBadge } from "./ApprovalSeal";

/**
 * ── فيلم الفصل ──────────────────────────────────────────────────────────────
 *
 * مسرحٌ ليليّ يروي قصة جدول الفصل في ثمانية مشاهد: العنوان، وبناء الجدول
 * بعدّاداته، و«أسبوعك في لقطة» بخريطة الأسبوع تمتلئ ساعةً ساعة، وحلقة رغبات
 * الأساتذة، والتعارضات تتناقص، والطلبة الذين وصلوا، وخطوات التسليم تُختم واحدةً
 * بعد أخرى، ثم الختام باسم القسم وشعار بصمته. كل رقمٍ من الخادم
 * (src/utils/termFilm.ts)، والمشهد الذي لا رقم له يسقط.
 *
 * خلف المشاهد بصمةُ القسم نفسها مرسومةً كبيرةً خافتةً تدور ببطء (هندسة
 * src/utils/deptFingerprint.ts بلا تكرار)، أقواساً بلا أي نص ولا اسم قاعة؛
 * وحين لا تُحمل البصمة تُرسم خلفيةٌ من حِمل الأسبوع وحده. وفي الختام تستقرّ
 * الخلفية شعاراً في وسط المسرح.
 *
 * يبدأ حين يدخل مجال النظر، ويوقَف ويُعاد، ويُقفز إلى أي مشهد من شريطه أو
 * بالأسهم. والموسيقى اختيارٌ مطفأ حتى يُشغَّل بنقرة. ومن طلب تقليل الحركة يرى
 * كل مشهد ساكناً بأرقامه النهائية بلا دوران ولا عدّ، ولا يبدأ شيءٌ وحده.
 */

const num = (value: number) => Math.round(value).toLocaleString("ar-KW-u-nu-latn");

function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const update = () => setReduce(query.matches);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduce;
}

/** عدّادٌ يجري من رقمٍ إلى رقم حين يظهر مشهده، ويقف على النهائي لمن قلّل الحركة. */
function Count({ to, from = 0, run, reduce, suffix = "", delay = 450, duration = 1700 }: { to: number; from?: number; run: boolean; reduce: boolean; suffix?: string; delay?: number; duration?: number }) {
  const [shown, setShown] = useState(reduce ? to : from);
  useEffect(() => {
    if (reduce) { setShown(to); return; }
    if (!run) { setShown(from); return; }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start - delay) / duration));
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (to - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, from, run, reduce, delay, duration]);
  return <>{num(shown)}{suffix}</>;
}

/* ── الخلفية الحيّة: بصمة القسم أقواساً بلا نص ── */

const MARK = FINGERPRINT_PALETTES.dark;
const MARK_R = FINGERPRINT_VIEW.outer + 22;
const TURN_MS = 210_000;

/**
 * ترسم شكل البصمة (أقواس القاعات وزهرة الساعات) بلا أي نص: لا اسم قاعة ولا يوم
 * ولا رقم. تدور ببطء ما دام الفيلم يجري، وتستقرّ قائمةً حين يحين الختام.
 */
const Backdrop = React.memo(function Backdrop({ shape, settle, playing, reduce }: { shape: FingerprintShape; settle: boolean; playing: boolean; reduce: boolean }) {
  const geo = useMemo(() => fingerprintGeometry(shape), [shape]);
  /* أقواس كل يومٍ في مسارٍ واحد: خمسة مسارات بدل مئات، فيدور الرسم خفيفاً. */
  const days = useMemo(() => MARK.days.map((_, day) => ({
    known: geo.arcs.filter(arc => arc.day === day && arc.known).map(arc => arc.d).join(""),
    faint: geo.arcs.filter(arc => arc.day === day && !arc.known).map(arc => arc.d).join(""),
  })), [geo]);
  const rims = useMemo(() => geo.arcs.map(arc => arc.rim).join(""), [geo]);
  const tracks = useMemo(() => geo.rings.map(ring => ring.tracks.join("")).join(""), [geo]);
  const spin = useRef<SVGSVGElement>(null);
  const turning = useRef<Animation | null>(null), resting = useRef<Animation | null>(null), settled = useRef(false);

  useEffect(() => {
    const el = spin.current;
    if (!el || reduce || typeof el.animate !== "function") return;
    let anim: Animation;
    try { anim = el.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], { duration: TURN_MS, iterations: Infinity }); }
    catch { return; }
    turning.current = anim;
    return () => { anim.cancel(); resting.current?.cancel(); turning.current = null; resting.current = null; settled.current = false; };
  }, [reduce, shape]);

  useEffect(() => {
    const el = spin.current, anim = turning.current;
    if (!el || !anim) return;
    try {
      if (settle) {
        if (settled.current) return;
        settled.current = true;
        const angle = (((Number(anim.currentTime) || 0) % TURN_MS) / TURN_MS) * 360;
        anim.pause();
        resting.current?.cancel();
        resting.current = el.animate([{ transform: `rotate(${angle}deg)` }, { transform: `rotate(${angle > 180 ? 360 : 0}deg)` }],
          { duration: 2600, easing: "cubic-bezier(.22,.8,.2,1)", fill: "forwards" });
        return;
      }
      if (settled.current) { settled.current = false; resting.current?.cancel(); resting.current = null; anim.currentTime = 0; }
      if (playing) anim.play(); else anim.pause();
    } catch { /* متصفحٌ بلا تحريكٍ برمجي: تبقى الخلفية ساكنة */ }
  }, [settle, playing, reduce, shape]);

  const V = FINGERPRINT_VIEW;
  return <div className="tf-mark" aria-hidden="true">
    <svg ref={spin} viewBox={`${V.cx - MARK_R} ${V.cy - MARK_R} ${MARK_R * 2} ${MARK_R * 2}`} focusable="false">
      <circle cx={V.cx} cy={V.cy} r={V.outer + 12} fill="none" stroke={MARK.gold} strokeOpacity=".28" strokeWidth="1.2" />
      {tracks ? <path d={tracks} fill="none" stroke={MARK.rule} strokeOpacity=".7" strokeWidth="1.1" strokeLinecap="round" /> : null}
      {days.map((item, day) => <g key={day} fill={MARK.days[day]}>
        {item.known ? <path d={item.known} fillOpacity=".94" /> : null}
        {item.faint ? <path d={item.faint} fillOpacity=".55" /> : null}
      </g>)}
      {rims ? <path d={rims} fill={MARK.over} /> : null}
      <g strokeLinecap="round">
        {geo.petals.map((petal, n) => petal.empty ? null
          : <line key={n} x1={petal.x1.toFixed(1)} y1={petal.y1.toFixed(1)} x2={petal.x2.toFixed(1)} y2={petal.y2.toFixed(1)} stroke={MARK.days[petal.day]} strokeWidth={petal.width.toFixed(1)} strokeOpacity={petal.peak ? 1 : 0.78} />)}
      </g>
      <circle cx={V.cx} cy={V.cy} r="13" fill="none" stroke={MARK.gold} strokeOpacity=".5" strokeWidth="1.2" />
      <circle cx={V.cx} cy={V.cy} r="4.5" fill={MARK.gold} />
    </svg>
  </div>;
});

/** الشعار نفسه لمن يعرضه خارج الفيلم (ختام «وضع المجلس» في نبض القاعات): لا نص فيه ولا اسم قاعة. */
export const FilmMark = Backdrop;

const RING = 2 * Math.PI * 52;
const SEAL = 2 * Math.PI * 58;

type Phase = "on" | "out" | "off";
interface SceneProps { film: TermFilmData; sceneKey: TermFilmSceneKey; phase: Phase; reduce: boolean }
const Scene: React.FC<SceneProps> = React.memo(({ film, sceneKey, phase, reduce }) => {
  const on = phase === "on", run = on;
  const label = (text: string) => ({ role: "group" as const, "aria-roledescription": "مشهد", "aria-label": text, "aria-hidden": !on || undefined });
  const cls = `tf-scene tf-s-${sceneKey}${on ? " on" : phase === "out" ? " out" : ""}`;
  const delayVar = (seconds: number) => ({ ["--d" as any]: `${seconds.toFixed(2)}s` });
  if (sceneKey === "title") {
    /* «كيف يُبنى جدولنا · حتى الآن»: العنوان في سطره، وما بعد النقطة سطرٌ أصغر تحته. */
    const [headline, ...rest] = film.title[1].split(" · ");
    return <div className={cls} {...label("العنوان")}>
    <div className="tf-eyebrow">{film.title[0]}</div>
    <div className="tf-big">{headline}{rest.length ? <small>{rest.join(" · ")}</small> : null}</div>
    <i className="tf-rule" aria-hidden="true" />
    {!film.final ? <div className="tf-badge">قيد الإعداد · يُروى حتى اليوم</div> : null}
  </div>;
  }
  if (sceneKey === "build" && film.build) return <div className={cls} {...label("بناء الجدول")}>
    <div className="tf-eyebrow">{film.build.eyebrow}</div>
    <div className="tf-trio">
      {film.build.trio.map((item, n) => <div key={item.label} style={delayVar(0.2 + n * 0.22)}>
        <b><Count to={item.value} run={run} reduce={reduce} delay={380 + n * 220} /></b><span>{item.label}</span>
      </div>)}
    </div>
    <i className="tf-rule" aria-hidden="true" />
  </div>;
  if (sceneKey === "week" && film.week) {
    const week = film.week;
    const peak = Math.max(1, ...week.hours.flat());
    const hours = week.hours[0]?.length || 0;
    const peakAt = (() => { for (let d = 0; d < week.hours.length; d += 1) for (let h = 0; h < hours; h += 1) if (week.hours[d][h] === peak) return `${d}:${h}`; return ""; })();
    return <div className={cls} {...label(week.eyebrow)}>
      <div className="tf-eyebrow">{week.eyebrow}</div>
      <div className="tf-map" style={{ ["--n" as any]: hours }} aria-hidden="true">
        {week.days.map((day, d) => <span key={`d${d}`} className="tf-map-day" style={{ ["--day" as any]: d }}>{day}</span>)}
        {week.hours.map((day, d) => day.map((value, h) => {
          const level = value ? Math.min(4, Math.ceil((value / peak) * 4)) : 0;
          return <i key={`${d}-${h}`} className={`l${level}${peakAt === `${d}:${h}` ? " is-peak" : ""}`}
            style={{ ["--day" as any]: d, ["--hr" as any]: h, ["--d" as any]: `${(0.55 + d * 0.5 + h * 0.07).toFixed(2)}s` }} />;
        }))}
        {week.perDay.map((value, d) => <b key={`c${d}`} className="tf-map-count" style={{ ["--day" as any]: d, ["--d" as any]: `${(1.1 + d * 0.5).toFixed(2)}s` }}>
          <Count to={value} run={run} reduce={reduce} delay={700 + d * 500} duration={900} />
        </b>)}
        {Array.from({ length: hours }, (_, h) => h % 2 === 0
          ? <span key={`h${h}`} className="tf-map-hour" dir="ltr" style={{ ["--hr" as any]: h }}>{num(Math.floor((week.from + h * 60) / 60))}</span> : null)}
      </div>
      <div className="tf-facts">
        {week.facts.map((fact, n) => <div key={fact.label} style={delayVar(2.6 + n * 0.3)}><b dir="auto">{fact.value}</b><span>{fact.label}</span></div>)}
      </div>
    </div>;
  }
  if (sceneKey === "wishes" && film.wishes) return <div className={cls} {...label("رغبات الأساتذة")}>
    <div className="tf-eyebrow">{film.wishes.eyebrow}</div>
    <div className="tf-ring">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="52" />
        <circle className="v" cx="60" cy="60" r="52" style={{ strokeDasharray: RING, strokeDashoffset: on || reduce ? RING * (1 - film.wishes.pct / 100) : RING }} />
      </svg>
      <b><Count to={film.wishes.pct} run={run} reduce={reduce} suffix="%" delay={600} duration={1800} /></b>
    </div>
    <div className="tf-cap">{film.wishes.caption}</div>
  </div>;
  if (sceneKey === "clash" && film.clash) {
    const dots = Math.min(48, Math.max(film.clash.from, 0));
    return <div className={cls} {...label("التعارضات")}>
      <div className="tf-eyebrow">{film.clash.eyebrow}</div>
      <div className={`tf-num${film.clash.to ? " tf-num-left" : ""}`}><Count from={film.clash.from} to={film.clash.to} run={run} reduce={reduce} delay={700} /></div>
      {dots ? <div className="tf-dots" aria-hidden="true">
        {Array.from({ length: dots }, (_, i) => <i key={i} className={i < dots - Math.min(dots, film.clash!.to) ? "fixed" : ""} style={delayVar(0.7 + i * (1.7 / Math.max(dots, 8)))} />)}
      </div> : null}
      <div className="tf-cap">{film.clash.caption}</div>
    </div>;
  }
  if (sceneKey === "students" && film.students) return <div className={cls} {...label("الطلبة")}>
    <div className="tf-eyebrow">{film.students.eyebrow}</div>
    <div className="tf-num"><Count to={film.students.count} run={run} reduce={reduce} /></div>
    <div className="tf-cap">{film.students.caption}</div>
  </div>;
  if (sceneKey === "delivery") return <div className={cls} {...label("التسليم")}>
    <div className="tf-eyebrow">{film.delivery.eyebrow}</div>
    <div className="tf-steps">
      {film.delivery.rows.map((row, n) => <div key={`${row.label}-${n}`} className={`is-${row.state}`} style={delayVar(0.4 + n * 0.62)}>
        <b>{row.label}</b><span>{row.state === "done" ? <Check aria-hidden="true" /> : null}{row.text}</span>
      </div>)}
    </div>
    <div className="tf-big tf-headline">{film.delivery.headline}</div>
  </div>;
  if (sceneKey === "thanks") {
    const closing = film.closing || { name: film.scopeName, term: film.termName, line: film.thanks[0], counts: [] };
    return <div className={cls} {...label("الختام")}>
      <div className="tf-emblem" aria-hidden="true">
        <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="58" style={{ strokeDasharray: SEAL, strokeDashoffset: on || reduce ? 0 : SEAL }} /></svg>
        {/* ختم الاعتماد (FR-DSH-037): على شعار القسم حين يعتمد التسجيل جدوله نهائياً. */}
        {film.final && film.seal ? <SealBadge seal={{ termName: film.seal.term, date: film.seal.date }} className="tf-seal" /> : null}
      </div>
      <div className="tf-big tf-name">{closing.name}</div>
      <div className="tf-term">{closing.term}</div>
      {closing.counts.length ? <div className="tf-tally">
        {closing.counts.map((item, n) => <span key={item.label}><b><Count to={item.value} run={run} reduce={reduce} delay={1500 + n * 200} duration={1300} /></b>{item.label}</span>)}
      </div> : null}
      <div className="tf-thanks">{closing.line}</div>
    </div>;
  }
  return null;
});

export function TermFilmPlayer({ film, onOpenFingerprint }: {
  film: TermFilmData;
  /** شعار الختام هو بصمة القسم نفسها: زرٌّ في الختام يفتحها، لمن يراها وحده (نسخة القسم). */
  onOpenFingerprint?: () => void;
}) {
  const reduce = useReducedMotion();
  const scenes = useMemo(() => filmScenes(film), [film]);
  /* البصمة إن حُملت؛ وإلا شكلٌ من حِمل الأسبوع وحده (لا قاعة فيه)؛ وإلا وهجٌ بلا رسم. */
  const shape = useMemo<FingerprintShape | null>(() => {
    if (film.backdrop?.halls?.length) return film.backdrop;
    if (film.week) { const contour = weekContourShape(film.week); return contour.halls.length ? contour : null; }
    return null;
  }, [film]);
  const [index, setIndex] = useState(0);
  const [left, setLeft] = useState(-1);
  const [playing, setPlaying] = useState(!reduce);
  const [started, setStarted] = useState(false);
  const [full, setFull] = useState(false);
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  const [sound, setSound] = useState(() => filmSoundSupported() && readFilmSoundChoice());
  const canSound = useMemo(() => filmSoundSupported(), []);
  const elapsed = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const bars = useRef<Array<HTMLElement | null>>([]);
  const audible = useRef(false);
  const at = useRef(0);

  const paintBars = useCallback((at: number, fraction: number) => {
    bars.current.forEach((bar, n) => { if (bar) bar.style.width = n < at ? "100%" : n === at ? `${Math.round(fraction * 100)}%` : "0%"; });
  }, []);
  const show = useCallback((next: number) => {
    elapsed.current = 0;
    if (at.current !== next) {
      setLeft(at.current);
      if (audible.current) filmSound.chime(next, next === scenes.length - 1);
    }
    at.current = next;
    setIndex(next);
    paintBars(next, reduce ? 1 : 0);
  }, [paintBars, reduce, scenes.length]);

  useEffect(() => { at.current = 0; setIndex(0); setLeft(-1); elapsed.current = 0; setPlaying(!reduce); }, [film, reduce]);

  /* يبدأ حين يظهر نصفه في الشاشة، مرّةً واحدة. */
  useEffect(() => {
    const el = box.current;
    if (!el || started) return;
    if (!("IntersectionObserver" in window)) { setStarted(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setStarted(true); observer.disconnect(); } }, { threshold: 0.5 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    if (!playing || !started || reduce) return;
    let frame = 0, last = performance.now();
    const loop = (now: number) => {
      elapsed.current += Math.min(100, now - last); last = now;
      const duration = scenes[index]?.duration || 4000;
      paintBars(index, Math.min(1, elapsed.current / duration));
      if (elapsed.current >= duration) {
        if (index < scenes.length - 1) { show(index + 1); return; }
        setPlaying(false); return;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [playing, started, reduce, index, scenes, paintBars, show]);

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === box.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const ended = !playing && index === scenes.length - 1 && elapsed.current >= (scenes[index]?.duration || 0);
  const rolling = playing && started && !reduce && !ended;

  /* الموسيقى تجري مع الفيلم فقط: تسكت عند الإيقاف وعند إخفاء التبويب وعند مغادرة الشاشة. */
  useEffect(() => {
    audible.current = sound && rolling && visible;
    if (audible.current) filmSound.play(); else filmSound.hush();
  }, [sound, rolling, visible]);
  useEffect(() => () => { audible.current = false; filmSound.hush(); }, []);

  /* موضع شعار الختام على المسرح: تستقرّ فيه الخلفية حين يحين مشهده. */
  const placeEmblem = useCallback(() => {
    const host = box.current;
    const slot = host?.querySelector<HTMLElement>(".tf-emblem"), mark = host?.querySelector<HTMLElement>(".tf-mark");
    if (!host || !slot || !mark || !mark.offsetWidth) return;
    host.style.setProperty("--ex", `${(slot.offsetLeft + slot.offsetWidth / 2 - host.clientWidth / 2).toFixed(1)}px`);
    host.style.setProperty("--ey", `${(slot.offsetTop + slot.offsetHeight / 2 - host.clientHeight / 2).toFixed(1)}px`);
    host.style.setProperty("--es", (slot.offsetWidth * 0.9 / mark.offsetWidth).toFixed(4));
  }, []);
  useLayoutEffect(() => {
    placeEmblem();
    const host = box.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(placeEmblem);
    observer.observe(host);
    void (document as any).fonts?.ready?.then(placeEmblem).catch(() => undefined);
    return () => observer.disconnect();
  }, [placeEmblem, scenes, shape, full]);

  /* كل نقرةٍ على أزرار المشغّل توقظ الصوت إن كان مختاراً: لا صوت قبل نقرة. */
  /* بعد فتح الصوت بنقرة يلحق الفرشةُ الفيلمَ إن كان يجري: الأثر أعلاه جرى قبل وجود سياق الصوت فلم يُسمع شيء. */
  const wake = () => { if (sound && filmSound.unlock() && audible.current) filmSound.play(); };
  const toggle = () => {
    wake();
    if (ended) show(0);
    setStarted(true);
    setPlaying(value => ended ? true : !value);
  };
  const again = () => { wake(); show(0); setStarted(true); setPlaying(!reduce); };
  const jump = (to: number) => { wake(); show(Math.max(0, Math.min(scenes.length - 1, to))); setStarted(true); };
  const toggleSound = () => {
    const next = !sound;
    writeFilmSoundChoice(next);
    if (next && !filmSound.unlock()) { setSound(false); return; }
    setSound(next);
  };
  const onKey = (event: React.KeyboardEvent) => {
    /* المسافة على زرٍّ داخل المشغّل تضغط ذلك الزر، لا تشغّل الفيلم. */
    if (event.key === " " && event.target !== event.currentTarget) return;
    if (event.key === " " || event.key === "k") { event.preventDefault(); toggle(); }
    /* اتجاه القراءة من اليمين: السهم الأيسر إلى المشهد التالي. */
    else if (event.key === "ArrowLeft") { event.preventDefault(); jump(index + 1); }
    else if (event.key === "ArrowRight") { event.preventDefault(); jump(index - 1); }
  };
  const fullscreen = () => {
    const el = box.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void el.requestFullscreen?.().catch(() => undefined);
  };
  const canFull = typeof document !== "undefined" && Boolean(document.fullscreenEnabled);
  const sceneKey = scenes[index]?.key || "title";
  const closing = sceneKey === "thanks";

  return <div className={`tf-player${full ? " is-full" : ""}${film.final ? "" : " is-sofar"}${closing ? " is-closing" : ""}${shape ? " has-mark" : ""}`} data-scene={sceneKey}
    ref={box} tabIndex={0} onKeyDown={onKey}
    role="region" aria-roledescription="فيلم" aria-label={`فيلم الفصل: ${film.title[0]}`}>
    <div className="tf-glow" aria-hidden="true" />
    {shape ? <Backdrop shape={shape} settle={closing} playing={rolling} reduce={reduce} /> : null}
    <div className="tf-veil" aria-hidden="true" />
    <div className="tf-scenes" aria-live="polite">
      {scenes.map((scene, n) => <Scene key={scene.key} film={film} sceneKey={scene.key} phase={n === index ? "on" : n === left ? "out" : "off"} reduce={reduce} />)}
    </div>
    <div className="tf-reel">
      <button type="button" onClick={toggle} aria-label={playing && !ended ? "أوقف" : "شغّل"} data-guide-ignore="يشغّل فيلم الفصل أو يوقفه؛ عرضٌ لا يغيّر بيانات">
        {playing && !ended ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}<span>{playing && !ended ? "أوقف" : "شغّل"}</span>
      </button>
      <div className="tf-track" role="group" aria-label="مشاهد الفيلم">
        {scenes.map((scene, n) => <button key={scene.key} type="button" aria-label={`المشهد ${n + 1}`} aria-current={n === index || undefined} onClick={() => jump(n)} data-guide-ignore="ينتقل إلى مشهد في فيلم الفصل؛ عرضٌ لا فعل">
          <i><b ref={el => { bars.current[n] = el; }} /></i>
        </button>)}
      </div>
      <button type="button" onClick={again} aria-label="أعد من البداية" data-guide-ignore="يعيد فيلم الفصل من أوله؛ عرضٌ لا فعل"><RotateCcw aria-hidden="true" /><span>أعد</span></button>
      {closing && shape && onOpenFingerprint ? <button type="button" className="tf-fp" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined); onOpenFingerprint(); }}
        aria-label="افتح بصمة القسم" title="هذا الشعار بصمة القسم: افتحها" data-guide-ignore="ينتقل إلى بصمة القسم؛ عرضٌ لا يغيّر بيانات">
        <Fingerprint aria-hidden="true" /><span>البصمة</span>
      </button> : null}
      {canSound ? <button type="button" className={`tf-icon tf-sound${sound ? " is-on" : ""}`} onClick={toggleSound} aria-pressed={sound} aria-label={sound ? "أوقف الموسيقى" : "شغّل الموسيقى"} title={sound ? "أوقف الموسيقى" : "شغّل الموسيقى"} data-guide-ignore="يشغّل موسيقى فيلم الفصل أو يسكتها على هذا الجهاز؛ عرضٌ لا يغيّر بيانات">
        {sound ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
      </button> : null}
      {canFull ? <button type="button" className="tf-icon" onClick={fullscreen} aria-label={full ? "اخرج من ملء الشاشة" : "ملء الشاشة"} data-guide-ignore="يعرض فيلم الفصل بملء الشاشة؛ عرضٌ لا فعل">
        {full ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
      </button> : null}
    </div>
  </div>;
}

export interface TermFilmScope { version: "dept" | "dean"; collegeId: number; sectionId?: number; termId: number }

const endpoint = (scope: TermFilmScope, brief = false) => {
  const query = new URLSearchParams({ collegeId: String(scope.collegeId), termId: String(scope.termId) });
  if (scope.version === "dept") query.set("sectionId", String(scope.sectionId || 0));
  if (brief) query.set("brief", "1");
  return `/api/term-film${scope.version === "dean" ? "/college" : ""}?${query}`;
};

/** «انسخ الرابط»: الرابط وحده إلى الحافظة، يرسله صاحبه بيده. لا رسالة تُرسل من النظام. */
function CopyLink({ scope }: { scope: TermFilmScope }) {
  const [done, setDone] = useState<"" | "ok" | "fail">("");
  const copy = async () => {
    const url = `${window.location.origin}${termFilmPath(scope)}`;
    try { await navigator.clipboard.writeText(url); setDone("ok"); }
    catch { setDone("fail"); window.prompt("انسخ الرابط", url); }
    window.setTimeout(() => setDone(""), 2400);
  };
  return <button type="button" className="tf-copy" onClick={copy} data-guide-ignore="ينسخ رابط فيلم الفصل إلى الحافظة فقط؛ لا يرسل شيئاً">
    {done === "ok" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
    <span role="status">{done === "ok" ? "نُسخ الرابط" : "انسخ الرابط"}</span>
  </button>;
}

/** الفيلم كاملاً بنطاقه: يقرأ ثم يعرض المشغّل وزرّ نسخ الرابط. */
export function TermFilmPanel({ scope, heading = true, fingerprint = false }: {
  scope: TermFilmScope; heading?: boolean;
  /** يرى صاحب الفيلم بصمة قسمه (بوابة البصمة نفسها): يُفتح له من الختام. */
  fingerprint?: boolean;
}) {
  const openFingerprint = useMemo(() => (fingerprint && scope.version === "dept" && scope.sectionId
    ? () => openInApp(deptFingerprintPath({ collegeId: scope.collegeId, sectionId: scope.sectionId!, termId: scope.termId }))
    : undefined), [fingerprint, scope.version, scope.collegeId, scope.sectionId, scope.termId]);
  const [film, setFilm] = useState<TermFilmData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setFilm(null); setError("");
    (async () => {
      try {
        const response = await fetch(endpoint(scope));
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "تعذّر إعداد فيلم الفصل.");
        if (alive) setFilm(body.film);
      } catch (e: any) { if (alive) setError(e?.message || "تعذّر إعداد فيلم الفصل."); }
    })();
    return () => { alive = false; };
  }, [scope.version, scope.collegeId, scope.sectionId, scope.termId]);
  return <section className="tf-panel" aria-label="فيلم الفصل">
    {heading ? <header className="tf-panel-head">
      <div>
        <span className="tf-kicker"><Clapperboard aria-hidden="true" />فيلم الفصل{scope.version === "dean" ? " · نسخة الكلية" : ""}</span>
        <strong>{film ? film.title[0] : "قصة الجدول في أقل من دقيقة"}</strong>
        {film ? <small>{film.final ? "النسخة النهائية بعد اعتماد التسجيل" : "يُروى حتى اليوم، ويصبح نهائياً حين يعتمد التسجيل الجدول"}</small> : null}
      </div>
      <CopyLink scope={scope} />
    </header> : null}
    {error ? <p className="tf-error" role="alert">{error}</p>
      : film ? <><TermFilmPlayer film={film} onOpenFingerprint={openFingerprint} /><TermFilmExport film={film} /></>
      : <div className="tf-player tf-loading" role="status" aria-label="جاري إعداد الفيلم"><span>جاري إعداد الفيلم…</span></div>}
  </section>;
}

/**
 * بطاقة اللوحة: تظهر متى كان للفصل جدول، وتفتح الفيلم في مكانه. قبل الاعتماد
 * النهائي تقول إنه «حتى الآن»، وبعده إنه نهائي.
 */
export function TermFilmCard({ scope, fingerprint = false }: { scope: TermFilmScope; fingerprint?: boolean }) {
  const [brief, setBrief] = useState<{ available: boolean; final: boolean; departments?: number; accepted?: number } | null>(null);
  const [open, setOpen] = useState(false);
  const card = useRef<HTMLElement>(null);
  const asked = useRef(false);
  const reduce = useReducedMotion();
  /*
   * «شاهد» تفتح الفيلم كما يُفتح فيلم: تنزلق الصفحة حتى يظهر المسرح كله بأزراره،
   * ويُقاس ارتفاعه على ما بقي من الشاشة بين الشريط العلوي وشريط الهاتف السفلي.
   * إن اتّسعت الشاشة لهما معاً بقي رأس البطاقة (وزرّ «أغلق») ظاهراً فوقه؛ وإلا
   * فالمسرح وحده يملأ ما بين الشريطين (الهاتف).
   */
  useEffect(() => {
    if (!open || !asked.current) return;
    asked.current = false;
    const el = card.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => {
      const stage = el.querySelector<HTMLElement>(".tf-player");
      if (!stage) return;
      const root = getComputedStyle(document.documentElement);
      const px = (name: string) => parseFloat(root.getPropertyValue(name)) || 0;
      const room = window.innerHeight - px("--topbar-h") - px("--dock-h") - 24;
      const above = stage.getBoundingClientRect().top - el.getBoundingClientRect().top;
      /* ارتفاع المسرح الآن هو ما يسعه المكان بلا رأس البطاقة: يبقى الرأس إن لم يُنقص منه شيئاً، أو بقي المسرح واسعاً. */
      const whole = room - above >= Math.min(stage.offsetHeight, 520);
      el.style.setProperty("--tf-above", whole ? `${Math.ceil(above)}px` : "0px");
      (whole ? el : stage).scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, reduce]);
  const toggleOpen = () => {
    if (!open) {
      asked.current = true;
      /* نقرةُ «شاهد» نقرةٌ من صاحبها: توقظ الموسيقى إن كان اختارها من قبل. */
      if (readFilmSoundChoice()) filmSound.unlock();
    }
    setOpen(value => !value);
  };
  useEffect(() => {
    let alive = true;
    setBrief(null); setOpen(false);
    if (!scope.collegeId || !scope.termId || (scope.version === "dept" && !scope.sectionId)) return;
    const none = { available: false, final: false };
    fetch(endpoint(scope, true)).then(r => (r.ok ? r.json() : none)).then(body => { if (alive) setBrief(body || none); }).catch(() => { if (alive) setBrief(none); });
    return () => { alive = false; };
  }, [scope.version, scope.collegeId, scope.sectionId, scope.termId]);
  /* البطاقة تحجز مكانها من أول رسمة (لا تدفع اللوحة حين يصل الجواب)، وتختفي فقط إن قال الخادم إن لا جدول. */
  if (brief && !brief.available) return null;
  return <section ref={card} className={`tf-card${open ? " is-open" : ""}`} aria-labelledby="tf-card-title">
    <div className="tf-card-row">
      <span className="tf-card-mark" aria-hidden="true"><Clapperboard /></span>
      <div className="tf-card-text">
        <strong id="tf-card-title">فيلم الفصل{scope.version === "dean" ? " · الكلية كاملة" : ""}</strong>
        <small>{!brief ? "قصة جدول الفصل في أقل من دقيقة" : brief.final
          ? (scope.version === "dean" ? "اعتُمدت جداول الأقسام كلها: الفيلم النهائي جاهز للعرض." : "اعتمد التسجيل الجدول: الفيلم النهائي جاهز، ويبقى في «السجل».")
          : (scope.version === "dean" && brief.departments ? `قصة جداول الكلية حتى الآن · اعتُمد ${brief.accepted || 0} من ${brief.departments}` : "قصة جدولنا حتى الآن · يصبح نهائياً بعد اعتماد التسجيل")}</small>
      </div>
      {open ? <CopyLink scope={scope} /> : null}
      <button type="button" className="tf-card-open" aria-expanded={open} onClick={toggleOpen} data-guide-ignore="يفتح فيلم الفصل للعرض فقط؛ لا يغيّر بيانات">
        {open ? "أغلق" : <><Play aria-hidden="true" />شاهد</>}
      </button>
    </div>
    {open ? <TermFilmPanel scope={scope} heading={false} fingerprint={fingerprint} /> : null}
  </section>;
}

/** صفحة الرابط المنسوخ: /FSchedule/TermFilm?v=dept&college=…&section=…&term=… */
export default function TermFilmPage({ fingerprint = false }: { fingerprint?: boolean }) {
  const scope = useMemo<TermFilmScope | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const version = params.get("v") === "dean" ? "dean" : "dept";
    const collegeId = Number(params.get("college") || 0), sectionId = Number(params.get("section") || 0), termId = Number(params.get("term") || 0);
    if (!collegeId || !termId || (version === "dept" && !sectionId)) return null;
    return { version, collegeId, sectionId, termId };
  }, []);
  return <div className="content-stack tf-page">
    {scope ? <TermFilmPanel scope={scope} fingerprint={fingerprint} /> : <p className="tf-error" role="alert">الرابط ناقص: لا يُعرف القسم أو الفصل.</p>}
  </div>;
}
