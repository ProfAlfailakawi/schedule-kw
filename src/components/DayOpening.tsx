import React, { useEffect, useMemo, useRef, useState } from "react";
import { AR, countOf } from "../utils/arabicCount";
import { OPENING_MS, OPENING_STILL_MS, writeOpeningOff, type OpeningMode } from "../utils/dayOpening";
import {
  hallLitAt, hallUsedBefore, openingClock, openingClockText, openingNumbers, openingSky, openingSkyline, OPENING_DAWN,
  type OpeningBuilding, type OpeningLecture,
} from "../utils/dayOpeningScene";
import "../styles/day-opening.css";

/**
 * ── افتتاحية اليوم (FR-DSH-036) ─────────────────────────────────────────────
 *
 * أول دخولٍ إلى الرئيسية كل يوم: سماءٌ بدرجات «نبض القاعات» تجري من الفجر إلى
 * ساعة الآن، ومباني القسم أمامها تضيء نوافذها (كل نافذةٍ قاعة) كلما بدأت فيها
 * محاضرة، ثم ثلاثة أرقامٍ من اليوم، ثم تنسحب إلى اللوحة.
 *
 * رسمٌ ثنائي الأبعاد (SVG) لا three.js: المجسّم وحده يزيد حمولة الرئيسية
 * بمئات الكيلوبايتات وثوانٍ من التهيئة على الهاتف، والافتتاحية لا تحتاج عمقاً
 * لتقول «هذه قاعاتك اليوم». تُحمَّل كسولاً، ولا شيء منها في حمولة اللوحة.
 *
 * لا تحجب شيئاً: الطبقة لا تلتقط المؤشر، وأيّ ضغطةٍ أو مفتاحٍ أو تمريرٍ يسحبها
 * فوراً ويصل إلى ما تحته. ولا تُطبع.
 */

const W = 10, H = 14, GAP_X = 6, GAP_Y = 8, PAD = 8, ROOF = 12, BASE = 14, BETWEEN = 16;
const SWEEP_FROM = 320, SWEEP_MS = 3000;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const num = (value: number) => Math.round(value).toLocaleString("ar-KW-u-nu-latn");

interface Placed { building: OpeningBuilding; x: number; width: number; height: number; cols: number; rows: number }

/** المباني على خطّ الأفق: كل مبنى شبكة نوافذ، والطوابق الدنيا في الأسفل. */
function placeSkyline(buildings: readonly OpeningBuilding[]): { placed: Placed[]; width: number; height: number } {
  let x = 0, height = 0;
  const placed = buildings.map(building => {
    const n = building.halls.length;
    /* أبراجٌ لا صناديق: أعمدةٌ قليلة وطوابق أكثر. */
    const cols = Math.max(1, Math.min(5, Math.ceil(Math.sqrt(n / 2.2))));
    const rows = Math.max(1, Math.ceil(n / cols));
    const width = PAD * 2 + cols * W + (cols - 1) * GAP_X;
    const h = ROOF + PAD + rows * H + (rows - 1) * GAP_Y + BASE;
    const item = { building, x, width, height: h, cols, rows };
    x += width + BETWEEN;
    height = Math.max(height, h);
    return item;
  });
  return { placed, width: Math.max(1, x - BETWEEN), height };
}

export default function DayOpening({ mode, today, dayLabel, onDone }: {
  mode: Exclude<OpeningMode, "none">;
  today: readonly OpeningLecture[];
  dayLabel: string;
  onDone: () => void;
}) {
  const nowMinute = useMemo(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }, []);
  const target = openingClock(nowMinute);
  const skyline = useMemo(() => placeSkyline(openingSkyline(today)), [today]);
  const numbers = useMemo(() => openingNumbers(today, nowMinute), [today, nowMinute]);
  const still = mode === "still";
  const [minute, setMinute] = useState(still ? target : OPENING_DAWN);
  const [phase, setPhase] = useState<"in" | "on" | "out">(still ? "on" : "in");
  const done = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  /* الانسحاب: مرةً واحدة، بتلاشٍ قصير (ولا تلاشي لمن يفضّل حركةً أقل). */
  const withdraw = useRef<() => void>(() => undefined);
  withdraw.current = () => {
    if (done.current) return;
    done.current = true;
    if (still) { doneRef.current(); return; }
    setPhase("out");
    window.setTimeout(() => doneRef.current(), 620);
  };

  /* الساعة تجري من الفجر إلى الآن، ثم تقف؛ وبعد المدة كلها تنسحب وحدها. */
  useEffect(() => {
    if (still) {
      const timer = window.setTimeout(() => withdraw.current(), OPENING_STILL_MS);
      return () => window.clearTimeout(timer);
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = now - t0;
      if (t > 40) setPhase(current => (current === "in" ? "on" : current));
      const u = Math.max(0, Math.min(1, (t - SWEEP_FROM) / SWEEP_MS));
      setMinute(OPENING_DAWN + (target - OPENING_DAWN) * ease(u));
      if (t < SWEEP_FROM + SWEEP_MS) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const timer = window.setTimeout(() => withdraw.current(), OPENING_MS - 620);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(timer); };
  }, [still, target]);

  /* أيّ ضغطةٍ أو مفتاحٍ أو تمريرٍ أو طباعة: تنسحب، والفعل يصل إلى ما تحتها. */
  useEffect(() => {
    const skip = (event: Event) => {
      if ((event.target as Element | null)?.closest?.(".dop-off")) return;
      withdraw.current();
    };
    const opts = { capture: true, passive: true } as const;
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach(name => window.addEventListener(name, skip, opts));
    window.addEventListener("beforeprint", skip);
    return () => {
      events.forEach(name => window.removeEventListener(name, skip, opts));
      window.removeEventListener("beforeprint", skip);
    };
  }, []);

  const sky = openingSky(minute);
  const settled = still || minute >= target - 0.5;
  const t = Math.max(0, Math.min(1, (minute - OPENING_DAWN) / Math.max(1, 21 * 60 - OPENING_DAWN)));
  const litNow = useMemo(() => {
    let count = 0;
    for (const p of skyline.placed) for (const hall of p.building.halls) if (hallLitAt(hall, minute)) count += 1;
    return count;
  }, [skyline, minute]);
  const lecturesSoFar = useMemo(() => today.filter(row => {
    const [h, m] = String(row.startTime || "").split(":").map(Number);
    return h * 60 + (m || 0) <= minute;
  }).length, [today, minute]);
  const peakShown = numbers.peak && (settled || minute >= numbers.peak.minute);
  const summary = [
    `افتتاحية ${dayLabel}`,
    countOf(numbers.lectures, AR.lecture),
    `${countOf(numbers.hallsNow, AR.room)} مشغولة الآن`,
    numbers.peak ? `ذروة اليوم ${openingClockText(numbers.peak.minute)}` : "",
  ].filter(Boolean).join("، ");

  const { placed, width, height } = skyline;
  /* أفقٌ عريض: مباني القسم في وسطه، ومدينةٌ خافتة خلفها تعطي العمق ولا تُضاء. */
  const narrow = useMemo(() => { try { return window.matchMedia("(max-width: 560px)").matches; } catch { return false; } }, []);
  /* على الهاتف المدينة أضيق والمباني أكبر: الأفق يملأ العرض ولا يصغر. */
  const vbW = Math.max(width + (narrow ? 70 : 160), narrow ? 210 : 440), vbH = Math.max(height, 90) + 22;
  const offset = (vbW - width) / 2, ground = vbH - 14;
  const city = useMemo(() => {
    const out: Array<{ x: number; w: number; h: number }> = [];
    let x = -6, k = 7;
    while (x < vbW) { k = (k * 37 + 11) % 97; const w = 12 + (k % 5) * 5, h = (0.22 + ((k * 13) % 41) / 82) * Math.max(height, 90); out.push({ x, w, h }); x += w + 3 + (k % 3) * 2; }
    return out;
  }, [vbW, height]);

  return <div className={`dop dop-${phase}${still ? " is-still" : ""}`} style={{ ["--dop-top" as any]: sky.top, ["--dop-mid" as any]: sky.mid, ["--dop-sx" as any]: `${(88 - 76 * t).toFixed(2)}%`, ["--dop-sy" as any]: `${(50 - 36 * Math.sin(Math.PI * t)).toFixed(2)}%`, ["--dop-day" as any]: t.toFixed(3) }}
    role="status" aria-live="polite" aria-label={summary}>
    <div className="dop-sky" aria-hidden="true">
      <i className="dop-sun" />
      <i className="dop-haze" />
    </div>
    <div className="dop-stage" aria-hidden="true">
      <p className="dop-kicker">{dayLabel}</p>
      <p className="dop-clock">{(() => { const [clock, period] = openingClockText(settled ? target : Math.floor(minute / 5) * 5).split(" "); return <><span>{clock}</span><small>{period}</small></>; })()}</p>
      <svg className="dop-skyline" viewBox={`0 0 ${vbW} ${vbH}`} preserveAspectRatio="xMidYMax meet"
        style={{ width: `min(100%, ${Math.round(Math.min(1120, vbW * 2.4))}px)`, aspectRatio: `${vbW} / ${vbH}` }}>
        <defs>
          <filter id="dop-glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3.2" /></filter>
          <linearGradient id="dop-wall" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1d3a33" /><stop offset="1" stopColor="#0c1d19" />
          </linearGradient>
        </defs>
        <g className="dop-city">{city.map((b, i) => <rect key={i} x={b.x} y={ground - b.h} width={b.w} height={b.h} rx="1.5" />)}</g>
        <rect x="0" y={ground} width={vbW} height={vbH - ground} className="dop-earth" />
        <line x1="0" x2={vbW} y1={ground} y2={ground} className="dop-ground" />
        {placed.map(p => {
          const x0 = offset + p.x, y0 = ground - p.height;
          return <g key={p.building.code}>
            <rect x={x0} y={y0} width={p.width} height={p.height} rx="2.5" className="dop-wall" fill="url(#dop-wall)" />
            <rect x={x0 - 2} y={y0} width={p.width + 4} height="4" rx="1.5" className="dop-roof" />
            <rect x={x0 + p.width / 2 - 5} y={ground - 10} width="10" height="10" rx="1.5" className="dop-door" />
            {p.building.halls.map((hall, i) => {
              /* من الأسفل إلى الأعلى: الطابق الأرضي أولاً. */
              const row = p.rows - 1 - Math.floor(i / p.cols), col = i % p.cols;
              const x = x0 + PAD + col * (W + GAP_X), y = y0 + ROOF + PAD - 4 + row * (H + GAP_Y);
              const lit = hallLitAt(hall, minute), used = !lit && hallUsedBefore(hall, minute);
              return <g key={hall.key} className={lit ? "is-lit" : used ? "is-used" : undefined}>
                {lit ? <rect x={x - 2} y={y - 2} width={W + 4} height={H + 4} rx="3" className="dop-halo" filter="url(#dop-glow)" /> : null}
                <rect x={x} y={y} width={W} height={H} rx="2" className="dop-win" />
              </g>;
            })}
          </g>;
        })}
      </svg>
      <dl className={`dop-numbers${settled ? " is-settled" : ""}`}>
        <div><dt>محاضرات اليوم</dt><dd>{num(settled ? numbers.lectures : lecturesSoFar)}</dd></div>
        <div><dt>{settled ? "قاعات مشغولة الآن" : "قاعات مضاءة"}</dt><dd>{num(settled ? numbers.hallsNow : litNow)}</dd></div>
        <div className={peakShown ? "is-on" : ""}><dt><span className="dop-peak-n">ذروة اليوم</span>{numbers.peak && peakShown ? <span className="dop-peak-n"> · {countOf(numbers.peak.count, AR.lecture)}</span> : null}</dt>
          <dd>{numbers.peak && peakShown ? openingClockText(numbers.peak.minute) : "—"}</dd></div>
      </dl>
    </div>
    <div className="dop-foot">
      <span aria-hidden="true">اضغط أي مكان للمتابعة</span>
      <button type="button" className="dop-off" onClick={() => { writeOpeningOff(true); withdraw.current(); }}
        data-guide-ignore="يوقف افتتاحية اليوم على هذا الجهاز؛ تفضيلٌ محلي لا يغيّر بيانات">لا تعرضها بعد اليوم</button>
    </div>
  </div>;
}
