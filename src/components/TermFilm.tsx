import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Clapperboard, Copy, Maximize2, Minimize2, Pause, Play, RotateCcw } from "lucide-react";
import { filmScenes, termFilmPath, TERM_FILM_BANDS, type TermFilmData, type TermFilmSceneKey } from "../utils/termFilm";
import "../styles/term-film.css";
import TermFilmExport from "./TermFilmExport";

/**
 * ── فيلم الفصل ──────────────────────────────────────────────────────────────
 *
 * مشغّلٌ بنسبة 16:9 يروي قصة جدول الفصل في سبعة مشاهد: العنوان، وبناء الجدول
 * بشبكة أسبوعه وثلاثة عدّادات، وحلقة رغبات الأساتذة، والتعارضات تتناقص، والطلبة
 * الذين وصلوا، وخطوات التسليم إلى التسجيل، والشكر. كل رقمٍ من الخادم
 * (src/utils/termFilm.ts)، والمشهد الذي لا رقم له يسقط.
 *
 * يبدأ حين يدخل مجال النظر، ويوقَف ويُعاد، ويُقفز إلى أي مشهد من شريطه أو
 * بالأسهم. ومن طلب تقليل الحركة يرى كل مشهد ساكناً بأرقامه النهائية ولا يبدأ
 * شيءٌ وحده. على عرض الهاتف يصبح المشغّل عمودياً فلا يصغر النص حتى لا يُقرأ.
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
function Count({ to, from = 0, run, reduce, suffix = "" }: { to: number; from?: number; run: boolean; reduce: boolean; suffix?: string }) {
  const [shown, setShown] = useState(reduce ? to : from);
  useEffect(() => {
    if (reduce) { setShown(to); return; }
    if (!run) { setShown(from); return; }
    let frame = 0;
    const start = performance.now(), delay = 450, duration = 1700;
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start - delay) / duration));
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (to - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, from, run, reduce]);
  return <>{num(shown)}{suffix}</>;
}

const RING = 2 * Math.PI * 52;

interface SceneProps { film: TermFilmData; sceneKey: TermFilmSceneKey; on: boolean; reduce: boolean }
const Scene: React.FC<SceneProps> = ({ film, sceneKey, on, reduce }) => {
  const run = on;
  const label = (text: string) => ({ role: "group" as const, "aria-roledescription": "مشهد", "aria-label": text, "aria-hidden": !on || undefined });
  const cls = `tf-scene${on ? " on" : ""}`;
  if (sceneKey === "title") return <div className={cls} {...label("العنوان")}>
    <div className="tf-eyebrow">{film.title[0]}</div>
    <div className="tf-big">{film.title[1]}</div>
    {!film.final ? <div className="tf-badge">قيد الإعداد · يُروى حتى اليوم</div> : null}
  </div>;
  if (sceneKey === "build" && film.build) {
    const peak = Math.max(1, ...film.build.week.flat());
    return <div className={cls} {...label("بناء الجدول")}>
      <div className="tf-eyebrow">{film.build.eyebrow}</div>
      <div className="tf-week" aria-hidden="true">
        {TERM_FILM_BANDS.map((_, slot) => film.build!.week.map((day, d) => {
          const v = day[slot] || 0, level = v ? Math.min(3, Math.ceil((v / peak) * 3)) : 0;
          return <i key={`${slot}-${d}`} className={`l${level}`} style={{ ["--d" as any]: `${(0.25 + ((slot * 5 + d) * 37 % 30) * 0.05).toFixed(2)}s` }} />;
        }))}
      </div>
      <div className="tf-days" aria-hidden="true">{["ح", "ن", "ث", "ر", "خ"].map(day => <span key={day}>{day}</span>)}</div>
      <div className="tf-trio">
        {film.build.trio.map(item => <div key={item.label}><b><Count to={item.value} run={run} reduce={reduce} /></b><span>{item.label}</span></div>)}
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
      <b><Count to={film.wishes.pct} run={run} reduce={reduce} suffix="%" /></b>
    </div>
    <div className="tf-cap">{film.wishes.caption}</div>
  </div>;
  if (sceneKey === "clash" && film.clash) {
    const dots = Math.min(48, Math.max(film.clash.from, 0));
    return <div className={cls} {...label("التعارضات")}>
      <div className="tf-eyebrow">{film.clash.eyebrow}</div>
      <div className={`tf-num${film.clash.to ? " tf-num-left" : ""}`}><Count from={film.clash.from} to={film.clash.to} run={run} reduce={reduce} /></div>
      {dots ? <div className="tf-dots" aria-hidden="true">
        {Array.from({ length: dots }, (_, i) => <i key={i} className={i < dots - Math.min(dots, film.clash!.to) ? "fixed" : ""} style={{ ["--d" as any]: `${(0.6 + i * 0.045).toFixed(2)}s` }} />)}
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
      {film.delivery.rows.map((row, n) => <div key={`${row.label}-${n}`} className={`is-${row.state}`} style={{ ["--d" as any]: `${0.4 + n * 0.6}s` }}>
        <b>{row.label}</b><span>{row.state === "done" ? <Check aria-hidden="true" /> : null}{row.text}</span>
      </div>)}
    </div>
    <div className="tf-big tf-headline">{film.delivery.headline}</div>
  </div>;
  if (sceneKey === "thanks") return <div className={cls} {...label("الشكر")}>
    <div className="tf-big">{film.thanks[0]}</div>
    <i className="tf-rule" aria-hidden="true" />
    <div className="tf-cap">{film.thanks[1]}</div>
  </div>;
  return null;
};

export function TermFilmPlayer({ film }: { film: TermFilmData }) {
  const reduce = useReducedMotion();
  const scenes = useMemo(() => filmScenes(film), [film]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(!reduce);
  const [started, setStarted] = useState(false);
  const [full, setFull] = useState(false);
  const elapsed = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const bars = useRef<Array<HTMLElement | null>>([]);

  const paintBars = useCallback((at: number, fraction: number) => {
    bars.current.forEach((bar, n) => { if (bar) bar.style.width = n < at ? "100%" : n === at ? `${Math.round(fraction * 100)}%` : "0%"; });
  }, []);
  const show = useCallback((next: number) => {
    elapsed.current = 0;
    setIndex(next);
    paintBars(next, reduce ? 1 : 0);
  }, [paintBars, reduce]);

  useEffect(() => { setIndex(0); elapsed.current = 0; setPlaying(!reduce); }, [film, reduce]);

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

  const ended = !playing && index === scenes.length - 1 && elapsed.current >= (scenes[index]?.duration || 0);
  const toggle = () => {
    if (ended) show(0);
    setStarted(true);
    setPlaying(value => ended ? true : !value);
  };
  const again = () => { show(0); setStarted(true); setPlaying(!reduce); };
  const jump = (to: number) => { show(Math.max(0, Math.min(scenes.length - 1, to))); setStarted(true); };
  const onKey = (event: React.KeyboardEvent) => {
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

  return <div className={`tf-player${full ? " is-full" : ""}${film.final ? "" : " is-sofar"}`} ref={box} tabIndex={0} onKeyDown={onKey}
    role="region" aria-roledescription="فيلم" aria-label={`فيلم الفصل: ${film.title[0]}`}>
    <div className="tf-glow" aria-hidden="true" />
    <div className="tf-scenes" aria-live="polite">
      {scenes.map((scene, n) => <Scene key={scene.key} film={film} sceneKey={scene.key} on={n === index} reduce={reduce} />)}
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
export function TermFilmPanel({ scope, heading = true }: { scope: TermFilmScope; heading?: boolean }) {
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
      : film ? <><TermFilmPlayer film={film} /><TermFilmExport film={film} /></>
      : <div className="tf-player tf-loading" role="status" aria-label="جاري إعداد الفيلم"><span>جاري إعداد الفيلم…</span></div>}
  </section>;
}

/**
 * بطاقة اللوحة: تظهر متى كان للفصل جدول، وتفتح الفيلم في مكانه. قبل الاعتماد
 * النهائي تقول إنه «حتى الآن»، وبعده إنه نهائي.
 */
export function TermFilmCard({ scope }: { scope: TermFilmScope }) {
  const [brief, setBrief] = useState<{ available: boolean; final: boolean; departments?: number; accepted?: number } | null>(null);
  const [open, setOpen] = useState(false);
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
  return <section className={`tf-card${open ? " is-open" : ""}`} aria-labelledby="tf-card-title">
    <div className="tf-card-row">
      <span className="tf-card-mark" aria-hidden="true"><Clapperboard /></span>
      <div className="tf-card-text">
        <strong id="tf-card-title">فيلم الفصل{scope.version === "dean" ? " · الكلية كاملة" : ""}</strong>
        <small>{!brief ? "قصة جدول الفصل في أقل من دقيقة" : brief.final
          ? (scope.version === "dean" ? "اعتُمدت جداول الأقسام كلها: الفيلم النهائي جاهز للعرض." : "اعتمد التسجيل الجدول: الفيلم النهائي جاهز، ويبقى في «السجل».")
          : (scope.version === "dean" && brief.departments ? `قصة جداول الكلية حتى الآن · اعتُمد ${brief.accepted || 0} من ${brief.departments}` : "قصة جدولنا حتى الآن · يصبح نهائياً بعد اعتماد التسجيل")}</small>
      </div>
      {open ? <CopyLink scope={scope} /> : null}
      <button type="button" className="tf-card-open" aria-expanded={open} onClick={() => setOpen(v => !v)} data-guide-ignore="يفتح فيلم الفصل للعرض فقط؛ لا يغيّر بيانات">
        {open ? "أغلق" : <><Play aria-hidden="true" />شاهد</>}
      </button>
    </div>
    {open ? <TermFilmPanel scope={scope} heading={false} /> : null}
  </section>;
}

/** صفحة الرابط المنسوخ: /FSchedule/TermFilm?v=dept&college=…&section=…&term=… */
export default function TermFilmPage() {
  const scope = useMemo<TermFilmScope | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const version = params.get("v") === "dean" ? "dean" : "dept";
    const collegeId = Number(params.get("college") || 0), sectionId = Number(params.get("section") || 0), termId = Number(params.get("term") || 0);
    if (!collegeId || !termId || (version === "dept" && !sectionId)) return null;
    return { version, collegeId, sectionId, termId };
  }, []);
  return <div className="content-stack tf-page">
    {scope ? <TermFilmPanel scope={scope} /> : <p className="tf-error" role="alert">الرابط ناقص: لا يُعرف القسم أو الفصل.</p>}
  </div>;
}
