import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Box, Check, Copy, Download, Fingerprint, GitCompareArrows, X } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import {
  deptFingerprintPath, fingerprintClock, fingerprintDelta, fingerprintGeometry, fingerprintHeadlines, fingerprintSlotLines, fingerprintTitleSize,
  fingerprintAngle, unionSpan, FINGERPRINT_DAYS, FINGERPRINT_PALETTES, FINGERPRINT_VIEW, type FingerprintData, type FingerprintGeometry, type FingerprintPalette,
} from "../utils/deptFingerprint";
import { fingerprintFocusHall, resolveFingerprintRing, ringFocusSlot, type PulseFocus } from "../utils/pulseLink";
import "../styles/dept-fingerprint.css";

/**
 * ── بصمة القسم ──────────────────────────────────────────────────────────────
 *
 * ملصقٌ واحد يُرسم من جدول القسم (src/utils/deptFingerprint.ts): كل قاعةٍ حلقة،
 * وكل يومٍ قطاعٌ بلونه، وكل محاضرةٍ قوسٌ سُمكه امتلاء قاعتها. الملصق كله SVG
 * بألوانٍ مكتوبةٍ فيه، فما يُنزَّل هو ما يُرى. يُشار إلى القوس فيُقال ما هو،
 * ويُقارَن الفصل بفصلٍ أسبق جنباً إلى جنب متى وُجد.
 *
 * قراءةٌ فقط: لا شيء هنا يغيّر الجدول.
 */

const V = FINGERPRINT_VIEW;
const FONT = '"Plex Arabic","Noto Sans Arabic","Segoe UI",Tahoma,sans-serif';
const r1 = (value: number) => Math.round(value * 10) / 10;

function useDarkTheme(): boolean {
  const read = () => typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

interface PosterProps {
  data: FingerprintData;
  geo: FingerprintGeometry;
  palette: FingerprintPalette;
  dark: boolean;
  span: { from: number; to: number };
  active: number | null;
  ring: number | null;
  svgRef?: React.Ref<SVGSVGElement>;
}

/** الملصق نفسه. كل لونٍ وحجمٍ فيه خاصيةٌ مكتوبة، لا صنف CSS، ليُنزَّل كما هو. */
const Poster = React.memo(function Poster({ data, geo, palette: p, dark, span, active, ring, svgRef }: PosterProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const headlines = useMemo(() => fingerprintHeadlines(data), [data]);
  const dim = active != null || ring != null;
  const arcOpacity = (known: boolean, over: boolean) => (over ? 1 : known ? (dark ? 0.94 : 0.9) : 0.55);
  const summary = `بصمة قسم ${data.title.section}، ${data.title.term}: ${headlines.map(item => `${item.value} ${item.label}`).join("، ")}`;
  return <svg ref={svgRef} className={`dfp-svg${dim ? " has-hot" : ""}`} viewBox={`0 0 ${V.width} ${V.height}`} xmlns="http://www.w3.org/2000/svg"
    direction="rtl" fontFamily={FONT} role="img" aria-label={summary}>
    <defs>
      <radialGradient id={`${uid}bg`} cx="50%" cy="48%" r="78%">
        <stop offset="0" stopColor={p.bg[0]} /><stop offset="1" stopColor={p.bg[1]} />
      </radialGradient>
      <radialGradient id={`${uid}halo`} cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor={p.gold} stopOpacity={dark ? 0.16 : 0.1} />
        <stop offset=".62" stopColor={p.gold} stopOpacity={dark ? 0.05 : 0.04} />
        <stop offset="1" stopColor={p.gold} stopOpacity="0" />
      </radialGradient>
      <filter id={`${uid}glow`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7" /></filter>
    </defs>
    <rect width={V.width} height={V.height} fill={`url(#${uid}bg)`} />
    <circle cx={V.cx} cy={V.cy} r={V.outer + 150} fill={`url(#${uid}halo)`} />
    <rect x="26" y="26" width={V.width - 52} height={V.height - 52} rx="24" fill="none" stroke={p.frame} strokeOpacity=".38" strokeWidth="1.5" />
    <rect x="38" y="38" width={V.width - 76} height={V.height - 76} rx="16" fill="none" stroke={p.frame} strokeOpacity=".14" strokeWidth="1" />

    {/* الرأس */}
    <g textAnchor="middle">
      <line x1={V.cx - 196} x2={V.cx - 112} y1="96" y2="96" stroke={p.gold} strokeOpacity=".55" strokeWidth="1.5" />
      <line x1={V.cx + 112} x2={V.cx + 196} y1="96" y2="96" stroke={p.gold} strokeOpacity=".55" strokeWidth="1.5" />
      <text x={V.cx} y="106" fontSize="28" fontWeight="500" fill={p.gold}>بصمة القسم</text>
      <text x={V.cx} y="186" fontSize={fingerprintTitleSize(data.title.section)} fontWeight="700" fill={p.ink}>{data.title.section}</text>
      <text x={V.cx} y="240" fontSize="29" fontWeight="500" fill={p.dim}>{data.title.term}</text>
    </g>

    {/* أسماء الأيام حول الدائرة بألوانها: هي مفتاح الألوان */}
    <g textAnchor="middle" fontSize="27" fontWeight="500">
      {geo.dayLabels.map(label => <g key={label.day}>
        <circle cx={r1(label.x)} cy={r1(label.y - 30)} r="5" fill={p.days[label.day]} />
        <text x={r1(label.x)} y={r1(label.y + 9)} fill={p.ink} fillOpacity=".86">{label.name}</text>
      </g>)}
    </g>
    <g stroke={p.dim} strokeLinecap="round">
      {geo.ticks.map((tick, n) => <line key={n} x1={r1(tick.x1)} y1={r1(tick.y1)} x2={r1(tick.x2)} y2={r1(tick.y2)} strokeWidth={tick.major ? 2 : 1.2} strokeOpacity={tick.major ? 0.7 : 0.34} />)}
    </g>

    {/* مسارات القاعات: خطوطٌ خافتة تجعل الفراغ يُقرأ بصمةً */}
    <g className="dfp-tracks" fill="none" stroke={p.rule} strokeLinecap="round">
      {geo.rings.map((item, n) => <g key={n} strokeOpacity={ring === n ? 1 : dark ? 0.6 : 0.72}>
        {item.band >= 9 ? item.ridges.map((d, k) => <path key={`r${k}`} d={d} strokeWidth=".8" strokeOpacity={ring === n ? 0.7 : 0.34} />) : null}
        {item.tracks.map((d, day) => <path key={day} d={d} strokeWidth={Math.max(0.8, Math.min(1.5, item.band * 0.09))} />)}
      </g>)}
    </g>

    {/* مقابض الحلقات: شريطٌ شفّاف بعرض الحلقة، يُضغط فتُختار القاعة كلها (لا يُنزَّل). */}
    <g className="dfp-hits" fill="none" stroke="transparent" pointerEvents="stroke" aria-hidden="true">
      {geo.rings.map((item, n) => <circle key={n} data-ring={n} cx={V.cx} cy={V.cy} r={r1(item.r)} strokeWidth={r1(item.band + 2)} />)}
    </g>

    {dark ? <g className="dfp-glow" filter={`url(#${uid}glow)`} opacity=".5" aria-hidden="true">
      {geo.arcs.map((arc, n) => <path key={n} d={arc.d + arc.rim} fill={p.days[arc.day]} />)}
    </g> : null}

    {/* زهرة القلب: حِمل كل ساعة */}
    <g className="dfp-petals" strokeLinecap="round" aria-hidden="true">
      {geo.petals.map((petal, n) => petal.empty
        ? <circle key={n} cx={r1(petal.x1)} cy={r1(petal.y1)} r="1.4" fill={p.days[petal.day]} fillOpacity=".4" />
        : <line key={n} x1={r1(petal.x1)} y1={r1(petal.y1)} x2={r1(petal.x2)} y2={r1(petal.y2)} stroke={p.days[petal.day]} strokeWidth={r1(petal.width)} strokeOpacity={petal.peak ? 1 : dark ? 0.78 : 0.6} />)}
      {geo.petals.filter(petal => petal.peak).map((petal, n) => <circle key={`peak-${n}`} cx={r1(petal.x2)} cy={r1(petal.y2)} r={r1(petal.width * 0.5 + 3.5)} fill="none" stroke={p.gold} strokeWidth="1.6" />)}
      <circle cx={V.cx} cy={V.cy} r="13" fill="none" stroke={p.gold} strokeOpacity=".5" strokeWidth="1.2" />
      <circle cx={V.cx} cy={V.cy} r="4.5" fill={p.gold} />
    </g>

    {/* الأقواس */}
    <g className="dfp-arcs">
      {geo.arcs.map((arc, n) => {
        const hall = data.halls[arc.hall], slot = hall.slots[arc.slot];
        const hot = active === n || (active == null && ring === arc.hall);
        const style = { ["--t" as any]: `${(arc.turn * 1.25 + arc.hall * 0.018).toFixed(3)}s` };
        return <g key={n} className={`dfp-arc${hot ? " is-hot" : ""}`} style={style} role="graphics-symbol" aria-label={`${slot.code} ${slot.section} ${fingerprintClock(slot.start)}–${fingerprintClock(slot.end)}`}>
          <path data-arc={n} d={arc.d} fill={p.days[arc.day]} fillOpacity={arcOpacity(arc.known, arc.over)} />
          {arc.rim ? <path data-arc={n} d={arc.rim} fill={p.over} /> : null}
        </g>;
      })}
    </g>

    {/* الأرقام الأربعة */}
    <g textAnchor="middle">
      {headlines.map((item, n) => {
        const x = V.width - 125 - n * 250;
        return <g key={item.label}>
          {n ? <line x1={x + 125} x2={x + 125} y1="1136" y2="1226" stroke={p.rule} strokeWidth="1" /> : null}
          <text x={x} y="1186" fontSize="60" fontWeight="700" fill={n === 3 ? p.gold : p.ink}>{item.value}</text>
          <text x={x} y="1226" fontSize="24" fontWeight="500" fill={p.dim}>{item.label}</text>
        </g>;
      })}
    </g>

    {/* مفتاحٌ هادئ */}
    <g textAnchor="middle" fontSize="21" fontWeight="500" fill={p.dim}>
      <g>
        <rect x="748" y="1277" width="44" height="5" rx="2.5" fill={p.days[1]} fillOpacity=".9" />
        <rect x="800" y="1273" width="44" height="13" rx="4" fill={p.days[1]} fillOpacity=".9" />
        <text x="796" y="1318">السُّمك امتلاء القاعة</text>
      </g>
      <g>
        <rect x="474" y="1278" width="52" height="9" rx="3.5" fill={p.days[1]} fillOpacity=".9" />
        <rect x="474" y="1271" width="52" height="4" rx="2" fill={p.over} />
        <text x="500" y="1318">فوق السعة</text>
      </g>
      <g>
        <path d="M172 1286a34 34 0 0 1 64 0" fill="none" stroke={p.dim} strokeWidth="2" strokeLinecap="round" />
        <path d="M229 1273l7 13-14 1z" fill={p.dim} />
        <text x="204" y="1318">{`اليوم من ${fingerprintClock(span.from)} إلى ${fingerprintClock(span.to)}`}</text>
      </g>
    </g>
    <text x={V.cx} y="1364" textAnchor="middle" fontSize="18" fill={p.dim} fillOpacity=".8">{[data.title.college, `رمز البصمة ${data.code}`].filter(Boolean).join(" · ")}</text>
  </svg>;
});

/* ── التنزيل: الملصق نفسه SVG، أو PNG بضعف المقاس ── */

let fontCssPromise: Promise<string> | null = null;
/** خطّ الواجهة مضمَّناً في الملف المنزَّل، فلا يتبدّل الحرف خارج الموقع. */
function embeddedFontCss(): Promise<string> {
  if (!fontCssPromise) fontCssPromise = Promise.all([["arabic", 500], ["arabic", 700], ["latin", 500], ["latin", 700]].map(async ([script, weight]) => {
    const response = await fetch(`/fonts/plex-arabic-${script}-${weight}.woff2`);
    if (!response.ok) throw new Error("font");
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const range = script === "arabic" ? "U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFC" : "U+0000-00FF,U+2000-206F";
    return `@font-face{font-family:"Plex Arabic";font-weight:${weight};src:url(data:font/woff2;base64,${btoa(binary)}) format("woff2");unicode-range:${range}}`;
  })).then(rules => rules.join(""), () => { fontCssPromise = null; return ""; });
  return fontCssPromise;
}

async function posterSvgText(svg: SVGSVGElement): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(V.width));
  clone.setAttribute("height", String(V.height));
  clone.querySelectorAll(".dfp-hits").forEach(node => node.remove());
  clone.querySelectorAll("*").forEach(node => ["class", "style", "data-arc", "role", "aria-label", "aria-hidden"].forEach(name => node.removeAttribute(name)));
  ["class", "style"].forEach(name => clone.removeAttribute(name));
  const css = await embeddedFontCss();
  if (css) {
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = css;
    clone.insertBefore(style, clone.firstChild);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function downloadPoster(svg: SVGSVGElement, kind: "png" | "svg", name: string) {
  const text = await posterSvgText(svg);
  if (kind === "svg") { saveBlob(new Blob([text], { type: "image/svg+xml;charset=utf-8" }), `${name}.svg`); return; }
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.decoding = "sync";
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("image")); image.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = V.width * 2; canvas.height = V.height * 2;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas");
    /* الخطّ المضمَّن يُحلّ بعد أول رسمة في بعض المتصفحات: نرسم مرتين. */
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    await new Promise(resolve => window.setTimeout(resolve, 120));
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("png");
    saveBlob(blob, `${name}.png`);
  } finally { URL.revokeObjectURL(url); }
}

/* ── المسرح: الملصق وبطاقة القوس المشار إليه ── */

/** يوم الأسبوع ودقيقته الآن (0 الأحد … 4 الخميس؛ الجمعة والسبت يُقرآن الأحد القادم). */
function weekNow(): { day: number; minute: number } {
  const now = new Date(), d = now.getDay();
  return d <= 4 ? { day: d, minute: now.getHours() * 60 + now.getMinutes() } : { day: 0, minute: 0 };
}

interface StageLink { scope: DeptFingerprintScope; onOpenPulse: (focus: PulseFocus) => void }

function Stage({ data, span, dark, ring, onRing, link, label, svgRef }: {
  data: FingerprintData; span: { from: number; to: number }; dark: boolean; ring?: number | null; onRing?: (ring: number | null) => void;
  /** «البصمة باب للنبض»: لمن يفتح النبض وحده. بدونه تبقى التفاصيل بلا رابط، فلا طريق مسدود. */
  link?: StageLink | null; label?: string; svgRef?: React.Ref<SVGSVGElement>;
}) {
  const geo = useMemo(() => fingerprintGeometry(data, { span }), [data, span]);
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  useEffect(() => { setHover(null); setPinned(null); }, [data]);
  const active = pinned ?? hover;
  const attr = (target: EventTarget | null, name: string) => {
    const value = (target as Element | null)?.getAttribute?.(name);
    return value == null ? null : Number(value);
  };
  const arc = active != null ? geo.arcs[active] : null;
  const tip = arc ? fingerprintSlotLines(data.halls[arc.hall], data.halls[arc.hall].slots[arc.slot]) : null;
  const below = arc ? arc.y / V.height < 0.42 : false;
  /* الحلقة المختارة (من القائمة أو بضغطها أو من رابط النبض): بطاقتها عند أقرب محاضرةٍ فيها من الآن. */
  const ringHall = active == null && ring != null ? data.halls[ring] || null : null;
  const ringSlot = useMemo(() => (ringHall ? ringFocusSlot(ringHall.slots, weekNow()) : null), [ringHall]);
  const ringAt = useMemo(() => {
    if (ring == null || !ringSlot || !geo.rings[ring]) return null;
    const angle = (fingerprintAngle(ringSlot.day, (ringSlot.start + ringSlot.end) / 2, span) * Math.PI) / 180;
    const r = geo.rings[ring].r;
    return { x: V.cx + r * Math.cos(angle), y: V.cy + r * Math.sin(angle) };
  }, [ring, ringSlot, geo, span]);
  const go = (hall: number, slot: { day: number; start: number }) => {
    const key = data.halls[hall]?.key;
    if (!link || !key) return;
    link.onOpenPulse({ ...link.scope, hall: key, day: slot.day, at: slot.start });
  };
  const place = (x: number, y: number) => ({ left: `clamp(124px, ${(x / V.width) * 100}%, calc(100% - 124px))`, top: `${(y / V.height) * 100}%` });
  const keep = (event: React.SyntheticEvent) => event.stopPropagation();
  return <figure className="dfp-stage">
    {label ? <figcaption>{label}</figcaption> : null}
    <div className="dfp-sheet"
      onPointerOver={event => { if (event.pointerType === "mouse") setHover(attr(event.target, "data-arc")); }}
      onPointerLeave={() => setHover(null)}
      onClick={event => {
        const n = attr(event.target, "data-arc");
        const r = n == null ? attr(event.target, "data-ring") : null;
        if (r != null && onRing) { setPinned(null); onRing(r === ring ? null : r); return; }
        setPinned(current => (n == null || n === current ? null : n));
      }}>
      <Poster data={data} geo={geo} palette={FINGERPRINT_PALETTES[dark ? "dark" : "light"]} dark={dark} span={span} active={active} ring={ring ?? null} svgRef={svgRef} />
      {arc && tip ? <div className={`dfp-tip${below ? " is-below" : ""}${tip.over ? " is-over" : ""}${pinned != null && link ? " is-pinned" : ""}`} role="status"
        style={place(arc.x, arc.y)} onClick={keep}>
        <strong>{tip.title}</strong>
        {tip.lines.map(line => <span key={line}>{line}</span>)}
        {pinned != null && link && data.halls[arc.hall]?.key ? <button type="button" className="dfp-go" onClick={() => go(arc.hall, data.halls[arc.hall].slots[arc.slot])}
          data-guide-ignore="ينتقل إلى نبض القاعات عند هذه القاعة في يوم المحاضرة ووقتها؛ عرضٌ لا يغيّر بيانات">
          <Box aria-hidden="true" /><span>اذهب إليها في النبض</span>
        </button> : null}
      </div> : null}
      {ringHall && ringAt ? <div className={`dfp-tip dfp-ring-tip${ringAt.y / V.height < 0.42 ? " is-below" : ""}${link ? " is-pinned" : ""}`} role="status"
        style={place(ringAt.x, ringAt.y)} onClick={keep}>
        <strong>القاعة <bdi dir="ltr">{ringHall.name}</bdi></strong>
        <span>{countOf(Math.round(ringHall.minutes / 6) / 10, AR.hour)} في الأسبوع · {countOf(ringHall.slots.length, AR.lecture)}</span>
        {ringSlot ? <span>أقرب محاضرة: {FINGERPRINT_DAYS[ringSlot.day]} <bdi dir="ltr">{fingerprintClock(ringSlot.start)}</bdi></span> : null}
        {link && ringHall.key && ringSlot ? <button type="button" className="dfp-go" onClick={() => go(ring!, ringSlot)}
          data-guide-ignore="ينتقل إلى نبض القاعات عند هذه القاعة في أقرب محاضرةٍ فيها؛ عرضٌ لا يغيّر بيانات">
          <Box aria-hidden="true" /><span>اذهب إليها في النبض</span>
        </button> : null}
      </div> : null}
    </div>
  </figure>;
}

export interface DeptFingerprintScope { collegeId: number; sectionId: number; termId: number }
interface FingerprintAnswer { fingerprint: FingerprintData; earlier: Array<{ termId: number; termName: string }> }

const endpoint = (scope: DeptFingerprintScope, brief = false) => {
  const query = new URLSearchParams({ collegeId: String(scope.collegeId), sectionId: String(scope.sectionId), termId: String(scope.termId) });
  if (brief) query.set("brief", "1");
  return `/api/dept-fingerprint?${query}`;
};

async function readFingerprint(scope: DeptFingerprintScope): Promise<FingerprintAnswer> {
  const response = await fetch(endpoint(scope));
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "تعذّر إعداد بصمة القسم.");
  return body as FingerprintAnswer;
}

const num = (value: number) => Math.round(value).toLocaleString("ar-KW-u-nu-latn");

function CopyLink({ scope }: { scope: DeptFingerprintScope }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    const url = `${window.location.origin}${deptFingerprintPath(scope)}`;
    try { await navigator.clipboard.writeText(url); setDone(true); }
    catch { window.prompt("انسخ الرابط", url); }
    window.setTimeout(() => setDone(false), 2400);
  };
  return <button type="button" className="dfp-btn" onClick={copy} data-guide-ignore="ينسخ رابط بصمة القسم إلى الحافظة فقط؛ لا يرسل شيئاً">
    {done ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
    <span role="status">{done ? "نُسخ الرابط" : "انسخ الرابط"}</span>
  </button>;
}

/** البصمة كاملةً بنطاقها: تقرأ ثم ترسم، وتقارن وتنزّل. */
export function DeptFingerprintPanel({ scope, heading = true, onOpenPulse, focusHall = "" }: {
  scope: DeptFingerprintScope; heading?: boolean;
  /** يُعطى لمن يفتح «نبض القاعات» وحده (بوابة الجدول نفسها)؛ وإلا تبقى تفاصيل الحلقة بلا رابط. */
  onOpenPulse?: (focus: PulseFocus) => void;
  /** حلقةٌ تُبرز عند الفتح (رابط «في البصمة» من النبض). */
  focusHall?: string;
}) {
  const dark = useDarkTheme();
  const [answer, setAnswer] = useState<FingerprintAnswer | null>(null);
  const [error, setError] = useState("");
  const [compareId, setCompareId] = useState(0);
  const [before, setBefore] = useState<FingerprintData | null>(null);
  const [compareError, setCompareError] = useState("");
  /* الحلقة المثبّتة (ضغطةٌ في القائمة أو على الحلقة، أو رابطٌ من النبض) والحلقة تحت المؤشر في القائمة. */
  const [ringPin, setRingPin] = useState<number | null>(null);
  const [ringHover, setRingHover] = useState<number | null>(null);
  const ring = ringHover ?? ringPin;
  const [busy, setBusy] = useState<"" | "png" | "svg">("");
  const [exportError, setExportError] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  /* على الشاشة الواسعة القائمة بجانب الملصق فتُفتح؛ وعلى الهاتف تبقى مطويّة تحته. */
  const [hallsOpen, setHallsOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1180);

  useEffect(() => {
    let alive = true;
    setAnswer(null); setError(""); setCompareId(0); setBefore(null); setRingPin(null); setRingHover(null);
    readFingerprint(scope).then(body => { if (alive) setAnswer(body); }).catch((e: any) => { if (alive) setError(e?.message || "تعذّر إعداد بصمة القسم."); });
    return () => { alive = false; };
  }, [scope.collegeId, scope.sectionId, scope.termId]);

  useEffect(() => {
    let alive = true;
    setBefore(null); setCompareError("");
    if (!compareId) return;
    readFingerprint({ ...scope, termId: compareId }).then(body => { if (alive) setBefore(body.fingerprint); })
      .catch((e: any) => { if (alive) setCompareError(e?.message || "تعذّر إعداد بصمة الفصل السابق."); });
    return () => { alive = false; };
  }, [compareId, scope.collegeId, scope.sectionId, scope.termId]);

  const data = answer?.fingerprint || null;
  /* القادم من النبض: حلقة قاعته مبرزةٌ ببطاقتها حين تصل البصمة. */
  useEffect(() => {
    if (!data || !focusHall) return;
    const n = resolveFingerprintRing(focusHall, data.halls);
    if (n != null) setRingPin(n);
  }, [data, focusHall]);
  const link = useMemo<StageLink | null>(() => (onOpenPulse ? { scope, onOpenPulse } : null), [onOpenPulse, scope.collegeId, scope.sectionId, scope.termId]);
  const span = useMemo(() => (data ? (before ? unionSpan(data.span, before.span) : data.span) : { from: 480, to: 1200 }), [data, before]);
  const delta = useMemo(() => (data && before ? fingerprintDelta(data, before) : []), [data, before]);
  const comparing = Boolean(compareId);

  const download = useCallback(async (kind: "png" | "svg") => {
    if (!svgRef.current || !data || busy) return;
    setBusy(kind); setExportError("");
    try { await downloadPoster(svgRef.current, kind, `بصمة ${data.title.section} - ${data.title.term}`.replace(/[\\/:*?"<>|]+/g, "-")); }
    catch { setExportError("تعذّر تجهيز الصورة. حاول مرة أخرى."); }
    finally { setBusy(""); }
  }, [data, busy]);

  return <section className={`dfp-panel${comparing ? " is-compare" : ""}`} aria-label="بصمة القسم">
    <header className="dfp-head">
      {heading ? <div className="dfp-head-text">
        <span className="dfp-kicker"><Fingerprint aria-hidden="true" />بصمة القسم</span>
        <strong>{data ? `${data.title.section} · ${data.title.term}` : "صورةٌ واحدة من جدول الفصل"}</strong>
        <small>كل قاعةٍ حلقة، وكل يومٍ لون. تتغيّر البصمة بتغيّر الجدول، فيُقارَن فصلٌ بفصلٍ بنظرة.</small>
      </div> : null}
      {data ? <div className="dfp-actions">
        {answer!.earlier.length && !comparing ? <button type="button" className="dfp-btn" onClick={() => setCompareId(answer!.earlier[0].termId)} data-guide-ignore="يعرض بصمة فصلٍ سابق بجانب الحالية؛ عرضٌ لا يغيّر بيانات">
          <GitCompareArrows aria-hidden="true" /><span>قارن بفصل سابق</span>
        </button> : null}
        <div className="dfp-download" role="group" aria-label="تنزيل صورة">
          <span><Download aria-hidden="true" />تنزيل صورة</span>
          <button type="button" className="dfp-btn" disabled={Boolean(busy)} onClick={() => download("png")} aria-label="تنزيل صورة PNG" data-guide-ignore="ينزّل صورة البصمة إلى الجهاز؛ لا يغيّر بيانات">{busy === "png" ? "…" : "PNG"}</button>
          <button type="button" className="dfp-btn" disabled={Boolean(busy)} onClick={() => download("svg")} aria-label="تنزيل صورة SVG" data-guide-ignore="ينزّل صورة البصمة إلى الجهاز؛ لا يغيّر بيانات">{busy === "svg" ? "…" : "SVG"}</button>
        </div>
        {heading ? <CopyLink scope={scope} /> : null}
      </div> : null}
    </header>
    {exportError ? <p className="dfp-error" role="alert">{exportError}</p> : null}

    {comparing && answer ? <div className="dfp-compare-bar">
      <label>
        <span>الفصل السابق</span>
        <select value={compareId} onChange={event => setCompareId(Number(event.target.value))} data-guide-ignore="يختار الفصل السابق المعروض للمقارنة؛ عرضٌ لا فعل">
          {answer.earlier.map(term => <option key={term.termId} value={term.termId}>{term.termName}</option>)}
        </select>
      </label>
      {before ? <p className="dfp-delta" role="status">{delta.length ? <>هذا الفصل: {delta.map(item => <b key={item}>{item}</b>)}</> : "القاعات والشعب والساعات بالعدد نفسه في الفصلين."}</p> : null}
      <button type="button" className="dfp-btn dfp-btn-quiet" onClick={() => setCompareId(0)} data-guide-ignore="يغلق المقارنة ويعود إلى بصمة الفصل وحده؛ عرضٌ لا فعل"><X aria-hidden="true" /><span>أغلق المقارنة</span></button>
    </div> : null}

    {error ? <p className="dfp-error" role="alert">{error}</p>
      : !data ? <div className="dfp-loading" role="status" aria-label="جاري رسم البصمة"><i aria-hidden="true" /><span>جاري رسم البصمة…</span></div>
      : <div className="dfp-body">
        <div className="dfp-stages">
          <Stage data={data} span={span} dark={dark} ring={ring} onRing={comparing ? undefined : setRingPin} link={comparing ? null : link} label={comparing ? data.title.term : undefined} svgRef={svgRef} />
          {comparing ? (before ? <Stage data={before} span={span} dark={dark} label={before.title.term} />
            : compareError ? <p className="dfp-error" role="alert">{compareError}</p>
            : <div className="dfp-loading" role="status" aria-label="جاري رسم البصمة"><i aria-hidden="true" /><span>جاري رسم البصمة…</span></div>) : null}
        </div>
        {!comparing ? <aside className="dfp-notes">
          <h3>كيف تُقرأ</h3>
          <ul className="dfp-read">
            <li><i className="k-ring" aria-hidden="true" />كل حلقةٍ قاعة، وأكثرها إشغالاً في القلب.</li>
            <li><i className="k-day" aria-hidden="true" />كل قطاعٍ يوم، والوقت يجري باتجاه عقارب الساعة.</li>
            <li><i className="k-fill" aria-hidden="true" />سُمك القوس امتلاء القاعة بمقاعد الشعبة.</li>
            <li><i className="k-over" aria-hidden="true" />{data.stats.overfull ? `فوق السعة: ${countOf(data.stats.overfull, AR.lecture)}.` : "لا محاضرة فوق سعة قاعتها."}</li>
            <li><i className="k-bloom" aria-hidden="true" />زهرة القلب حِمل كل ساعة، وأطول بتلةٍ ساعة الذروة.</li>
          </ul>
          {data.stats.roomless ? <p className="dfp-note">خارج الحلقات لأن قاعتها لم تُختر: {countOf(data.stats.roomless, AR.appointment)}.</p> : null}
          <details className="dfp-halls" open={hallsOpen} onToggle={event => setHallsOpen((event.target as HTMLDetailsElement).open)} onMouseLeave={() => setRingHover(null)}>
            <summary data-guide-ignore="يفتح قائمة قاعات البصمة للقراءة؛ عرضٌ لا فعل">القاعات من القلب إلى الخارج <b>{num(data.halls.length)}</b></summary>
            <ol>
              {data.halls.map((hall, n) => <li key={hall.name + n} className={ring === n ? "is-on" : undefined} onMouseEnter={() => setRingHover(n)}>
                <button type="button" aria-pressed={ringPin === n} onClick={() => setRingPin(current => (current === n ? null : n))} data-guide-ignore="يُبرز حلقة هذه القاعة في البصمة؛ عرضٌ لا فعل">
                  <span className="dfp-hall-name" dir="ltr">{hall.name}</span>
                  <span className="dfp-hall-bar" aria-hidden="true"><i style={{ inlineSize: `${Math.max(4, Math.round((hall.minutes / Math.max(1, data.halls[0].minutes)) * 100))}%` }} /></span>
                  <span className="dfp-hall-hours">{countOf(Math.round(hall.minutes / 6) / 10, AR.hour)}</span>
                </button>
              </li>)}
            </ol>
          </details>
        </aside> : null}
      </div>}
  </section>;
}

/** بطاقة اللوحة: تظهر متى كان للقسم في الفصل موعدٌ في قاعة، وتفتح البصمة في مكانها. */
export function DeptFingerprintCard({ scope, onOpenPulse }: { scope: DeptFingerprintScope; onOpenPulse?: (focus: PulseFocus) => void }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    setAvailable(null); setOpen(false);
    if (!scope.collegeId || !scope.sectionId || !scope.termId) return;
    fetch(endpoint(scope, true)).then(r => (r.ok ? r.json() : { available: false })).then(body => { if (alive) setAvailable(Boolean(body?.available)); }).catch(() => { if (alive) setAvailable(false); });
    return () => { alive = false; };
  }, [scope.collegeId, scope.sectionId, scope.termId]);
  if (available === false) return null;
  return <section className={`dfp-card${open ? " is-open" : ""}`} aria-labelledby="dfp-card-title">
    <div className="dfp-card-row">
      <span className="dfp-card-mark" aria-hidden="true"><Fingerprint /></span>
      <div className="dfp-card-text">
        <strong id="dfp-card-title">بصمة القسم</strong>
        <small>صورةٌ واحدة من جدول الفصل: كل قاعةٍ حلقة، وكل يومٍ لون. تصلح غلافاً لتقرير القسم.</small>
      </div>
      {open ? <CopyLink scope={scope} /> : null}
      <button type="button" className="dfp-card-open" aria-expanded={open} onClick={() => setOpen(v => !v)} data-guide-ignore="يفتح بصمة القسم للعرض فقط؛ لا يغيّر بيانات">
        {open ? "أغلق" : "اعرض"}
      </button>
    </div>
    {open ? <DeptFingerprintPanel scope={scope} heading={false} onOpenPulse={onOpenPulse} /> : null}
  </section>;
}

/** صفحة الرابط المنسوخ: /FSchedule/Fingerprint?college=…&section=…&term=…[&hall=…] */
export default function DeptFingerprintPage({ onOpenPulse }: { onOpenPulse?: (focus: PulseFocus) => void }) {
  const focusHall = useMemo(() => fingerprintFocusHall(window.location.search), []);
  const scope = useMemo<DeptFingerprintScope | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const collegeId = Number(params.get("college") || 0), sectionId = Number(params.get("section") || 0), termId = Number(params.get("term") || 0);
    return collegeId && sectionId && termId ? { collegeId, sectionId, termId } : null;
  }, []);
  return <div className="content-stack dfp-page">
    {scope ? <DeptFingerprintPanel scope={scope} onOpenPulse={onOpenPulse} focusHall={focusHall} /> : <p className="dfp-error" role="alert">الرابط ناقص: لا يُعرف القسم أو الفصل.</p>}
  </div>;
}
