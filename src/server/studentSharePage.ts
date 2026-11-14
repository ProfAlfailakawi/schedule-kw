/**
 * ── صفحةُ المرشد: خطةُ الطالب للقراءة فقط ─────────────────────────────────────
 *
 * يفتحها المرشدُ من رابط/QR يعرضه الطالبُ على هاتفه أمامه (`/me/share/<رمز>`). تُرسم في الخادم بلا سكربتٍ واحد،
 * بلغة «مساري» البصرية (نهاريةٌ دائماً، هاتفٌ أولاً)، وتحمل ما يلزم لحوار الإرشاد وحدَه:
 *
 *   القسم والكلية واسم الصحيفة · حلقةُ التقدّم (المنجَز/المتبقّي وفصولُ التخرّج المقدَّرة)
 *   · المقرراتُ المنجَزة · رغباتُه هذا الفصل · أسبوعُ جدوله المقترح إن وُجد.
 *
 * لا اسمَ ولا رقمَ مدنياً ولا رمزاً ولا وسيلةَ تواصل: المرشدُ يعرف الطالبَ لأنه أمامه. وكلُّ ما يصل هنا يمرّ بـ`ShareSnapshot`
 * (حقولٌ مسمّاة، لا ملفٌّ كامل)، فلا يتسرّب حقلٌ جديدٌ إلى الصفحة بمجرّد إضافته إلى الملف.
 */
import { AR, countOf } from "../utils/arabicCount";
import { PUBLIC_FONT_FACES } from "./publicKit";
import { PUBLIC_LIGHT_VARS, PUBLIC_THEME_COLOR } from "./publicTheme";

export interface ShareMeeting { courseId: number; day: number; start: number; end: number; name: string; code: string; section: string }

export interface ShareSnapshot {
  college: string;
  section: string;
  plan: string;
  /** null = لا مقررات في الصحيفة (تحتاج اختياراً من جديد). */
  percent: number | null;
  passedUnits: number;
  remainingUnits: number;
  /** فصولُ التخرّج المقدَّرة بوحداته في الفصل؛ 0 = أكمل الصحيفة. */
  terms: number;
  unitsPerTerm: number;
  passed: Array<{ code: string; name: string }>;
  termName: string;
  wishes: Array<{ code: string; name: string }>;
  week: ShareMeeting[] | null;
  expiresAt: string;
}

const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string));
const DAYS = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس"];
const PALETTE = ["#1f6b5c", "#8d6423", "#3b6ea5", "#a0522d", "#6b4e9b", "#2f7f8f", "#9a4a6a", "#5a7d2a"];
const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** «15 نوفمبر · 23:40» بتوقيت الكويت وأرقامٍ لاتينية. */
export function kuwaitStamp(iso: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  const shifted = new Date(at + 3 * 3_600_000);
  const day = shifted.toLocaleDateString("ar-KW-u-nu-latn", { day: "numeric", month: "long", timeZone: "UTC" });
  return `${day} · ${shifted.toISOString().slice(11, 16)}`;
}

const ICON = {
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  cal: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 7-7 9-4-2-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
};
const icon = (name: keyof typeof ICON) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;

function ring(percent: number | null): string {
  const r = 34, c = 2 * Math.PI * r;
  if (percent == null) return `<div class="ring" role="img" aria-label="لا مقررات في الصحيفة"><svg viewBox="0 0 80 80"><circle class="bg" cx="40" cy="40" r="34"/></svg><b>—</b></div>`;
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  return `<div class="ring" role="img" aria-label="${p}٪"><svg viewBox="0 0 80 80"><circle class="bg" cx="40" cy="40" r="34"/><circle class="fg" cx="40" cy="40" r="34" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - p / 100)).toFixed(1)}"/></svg><b>${p}٪</b></div>`;
}

function weekGrid(meetings: ShareMeeting[]): string {
  let lo = 1440, hi = 0;
  for (const m of meetings) { lo = Math.min(lo, m.start); hi = Math.max(hi, m.end); }
  if (hi <= lo) return "";
  lo = Math.floor(lo / 60) * 60; hi = Math.ceil(hi / 60) * 60;
  const H = 44, rows = (hi - lo) / 60;
  const colors = new Map<number, string>();
  for (const m of meetings) if (!colors.has(m.courseId)) colors.set(m.courseId, PALETTE[colors.size % PALETTE.length]);
  let hours = "";
  for (let t = lo; t < hi; t += 60) hours += `<i>${t / 60}</i>`;
  let cols = "";
  for (let d = 0; d < 5; d += 1) {
    const blocks = meetings.filter(m => m.day === d).map(m => `<span class="blk" style="--c:${colors.get(m.courseId)};inset-block-start:${((m.start - lo) / 60) * H}px;block-size:${((m.end - m.start) / 60) * H - 2}px"><b>${esc(m.code)}</b><small>${esc(m.section)}</small></span>`).join("");
    cols += `<div class="col">${blocks}</div>`;
  }
  const legend = [...colors.keys()].map(id => {
    const own = meetings.filter(m => m.courseId === id);
    const groups = new Map<string, number[]>();
    for (const m of own) groups.set(`${m.start}-${m.end}`, [...(groups.get(`${m.start}-${m.end}`) || []), m.day]);
    const when = [...groups].map(([at, days]) => { const [s, e] = at.split("-").map(Number); return `${days.sort().map(d => DAYS[d]).join(" · ")} <bdi dir="ltr">${clock(s)}–${clock(e)}</bdi>`; }).join("، ");
    return `<li><span class="dot" style="background:${colors.get(id)}"></span><span class="tx"><b>${esc(own[0].name)}</b><small>${esc(own[0].code)}${own[0].section ? ` · شعبة ${esc(own[0].section)}` : ""} · ${when}</small></span></li>`;
  }).join("");
  return `<div class="wk" style="--rows:${rows};--h:${H}px"><div class="wk-h"><span></span>${DAYS.map(d => `<b>${d}</b>`).join("")}</div><div class="wk-body"><div class="hrs" aria-hidden="true">${hours}</div>${cols}</div></div><ul class="legend">${legend}</ul>`;
}

const courseRows = (list: Array<{ code: string; name: string }>) => list.map(c => `<li><span class="cd" dir="ltr">${esc(c.code)}</span><span>${esc(c.name)}</span></li>`).join("");

const CSS = `
*,*::before,*::after{box-sizing:border-box}
:root{${PUBLIC_LIGHT_VARS};--r:20px;--shadow:0 1px 2px rgba(19,24,23,.04),0 8px 24px -14px rgba(19,24,23,.2);--ok:#25684a;--ok-soft:#dfeee6}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;min-height:100dvh;background:radial-gradient(120% 60% at 100% 0,var(--accent-soft) 0,transparent 55%),var(--bg);color:var(--ink);font-family:"Plex Arabic",-apple-system,"Segoe UI","Noto Sans Arabic",Tahoma,sans-serif;font-synthesis:none;-webkit-font-smoothing:antialiased;line-height:1.6}
.wrap{max-inline-size:560px;margin:0 auto;padding:max(16px,env(safe-area-inset-top)) 16px max(32px,env(safe-area-inset-bottom))}
.bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding-block:6px 12px}
.mark{font:600 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.28em;color:var(--brass)}
.ro{display:inline-flex;align-items:center;gap:7px;padding:7px 12px;border-radius:999px;background:var(--card);border:1px solid var(--line);font-size:12.5px;color:var(--dim);font-weight:600}
.ro .i{inline-size:16px;block-size:16px;color:var(--accent)}
.i{inline-size:20px;block-size:20px;flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.hero{display:grid;gap:14px;padding:22px 20px;border-radius:26px;color:#fff;background:linear-gradient(155deg,#1f6b5c 0%,#164f44 70%);box-shadow:0 18px 36px -22px rgba(22,79,68,.7);position:relative;overflow:hidden}
.hero::after{content:"";position:absolute;inset-block-start:-40px;inset-inline-end:-40px;inline-size:150px;block-size:150px;border-radius:50%;background:radial-gradient(closest-side,rgba(199,155,95,.3),transparent)}
.top{display:flex;align-items:center;gap:16px;position:relative;z-index:1}
.who{display:grid;gap:2px;min-inline-size:0}
.who small{font-size:12.5px;color:rgba(255,255,255,.88);font-weight:600}
.who h1{margin:0;font-size:24px;line-height:1.35;font-weight:700}
.who span{font-size:13px;color:rgba(255,255,255,.92);line-height:1.6}
.ring{position:relative;inline-size:80px;block-size:80px;flex:none}
.ring svg{inline-size:100%;block-size:100%;transform:rotate(90deg) scaleX(-1)}
.ring circle{fill:none;stroke-width:8;stroke-linecap:round}
.ring .bg{stroke:rgba(255,255,255,.16)}
.ring .fg{stroke:#fff}
.ring b{position:absolute;inset:0;display:grid;place-items:center;font-size:19px;font-variant-numeric:tabular-nums}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);border-radius:16px;background:rgba(255,255,255,.1);position:relative;z-index:1}
.kpis>div{display:grid;justify-items:center;gap:1px;padding:10px 4px;text-align:center}
.kpis>div+div{border-inline-start:1px solid rgba(255,255,255,.14)}
.kpis b{font-size:28px;line-height:1.2;font-weight:800;font-variant-numeric:tabular-nums}
.kpis small{font-size:12px;color:rgba(255,255,255,.9)}
.card{margin-block-start:14px;padding:18px;border-radius:var(--r);background:var(--card);border:1px solid var(--line);box-shadow:var(--shadow);display:grid;gap:12px}
.card h2{margin:0;font-size:17px;line-height:1.4;font-weight:700;display:flex;align-items:center;gap:10px}
.card h2 .b{inline-size:36px;block-size:36px;border-radius:12px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);flex:none}
.card h2 .n{margin-inline-start:auto;padding:2px 11px;border-radius:999px;background:var(--soft);color:var(--dim);font-size:12.5px;font-weight:700}
.list{list-style:none;margin:0;padding:0;display:grid}
.list li{display:flex;align-items:baseline;gap:10px;padding:9px 0;border-block-start:1px solid var(--line);font-size:14.5px}
.list li:first-child{border-block-start:0}
.cd{flex:none;min-inline-size:76px;font:600 12.5px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--dim);text-align:start}
details.more>summary{display:flex;align-items:center;justify-content:center;min-block-size:44px;border-radius:14px;background:var(--card2);border:1px solid var(--line);font-weight:600;font-size:14px;color:var(--accent);cursor:pointer;list-style:none}
details.more>summary::-webkit-details-marker{display:none}
details.more[open]>summary{display:none}
details.more .list{margin-block-start:0}
.wk{display:grid;border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--card2)}
.wk-h{display:grid;grid-template-columns:28px repeat(5,1fr);background:var(--soft);border-block-end:1px solid var(--line)}
.wk-h b{padding:7px 0;text-align:center;font-size:12px;font-weight:700;color:var(--ink)}
.wk-body{display:grid;grid-template-columns:28px repeat(5,1fr);block-size:calc(var(--rows)*var(--h));background-image:repeating-linear-gradient(to bottom,transparent 0,transparent calc(var(--h) - 1px),var(--line) calc(var(--h) - 1px),var(--line) var(--h))}
.hrs{display:grid;grid-auto-rows:var(--h)}
.hrs i{font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--dim);text-align:center;padding-block-start:3px;font-style:normal}
.col{position:relative;border-inline-start:1px solid var(--line)}
.blk{position:absolute;inset-inline:2px;display:grid;align-content:center;justify-items:center;border-radius:8px;background:var(--c);color:#fff;overflow:hidden;text-align:center;line-height:1.25}
.blk b{font-size:11px;font-weight:700}
.blk small{font-size:11px;opacity:.95}
.legend{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.legend li{display:flex;align-items:flex-start;gap:10px}
.legend .dot{inline-size:12px;block-size:12px;border-radius:50%;flex:none;margin-block-start:7px}
.legend .tx{display:grid;gap:1px;min-inline-size:0}
.legend b{font-size:14.5px}
.legend small{font-size:12.5px;color:var(--dim);line-height:1.6}
.foot{display:flex;align-items:center;justify-content:center;gap:8px;margin-block-start:18px;text-align:center;font-size:12.5px;color:var(--muted);line-height:1.7}
.foot .i{inline-size:16px;block-size:16px;color:var(--accent)}
.gone{display:grid;place-items:center;min-block-size:70dvh;text-align:center;gap:10px;padding:24px}
.gone h1{margin:0;font-size:22px}
.gone p{margin:0;color:var(--dim);font-size:15px}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="${PUBLIC_THEME_COLOR}">
<meta name="robots" content="noindex,nofollow,noarchive">
<meta name="referrer" content="no-referrer">
<title>${esc(title)}</title>
<link rel="icon" href="/schedule-icon.svg" type="image/svg+xml">
<style>${PUBLIC_FONT_FACES}${CSS}</style>
</head>
<body>${body}</body>
</html>`;
}

export function renderSharePage(s: ShareSnapshot): string {
  const when = kuwaitStamp(s.expiresAt);
  const done = s.percent != null && s.remainingUnits === 0;
  const kpi = (value: string, label: string) => `<div><b>${value}</b><small>${label}</small></div>`;
  const hero = `<section class="hero"><div class="top">${ring(s.percent)}<div class="who"><small>ملف طالب · للمرشد</small><h1>${esc(s.section)}</h1><span>${[s.college, s.plan].filter(Boolean).map(esc).join(" · ")}</span></div></div>`
    + `<div class="kpis">${kpi(s.percent == null ? "—" : String(s.passedUnits), "الوحدات المنجزة")}${kpi(s.percent == null ? "—" : String(s.remainingUnits), "الوحدات المتبقية")}${kpi(s.percent == null ? "—" : done ? "✓" : String(s.terms), done ? "أكمل الصحيفة" : "فصول للتخرّج")}</div></section>`;
  const FIRST = 8;
  const passed = s.passed.length
    ? `<section class="card"><h2><span class="b">${icon("check")}</span>المقررات المنجزة<span class="n">${s.passed.length}</span></h2><ul class="list">${courseRows(s.passed.slice(0, FIRST))}</ul>`
      + (s.passed.length > FIRST ? `<details class="more"><summary>عرض الكل (${s.passed.length})</summary><ul class="list">${courseRows(s.passed.slice(FIRST))}</ul></details>` : "") + `</section>`
    : `<section class="card"><h2><span class="b">${icon("check")}</span>المقررات المنجزة</h2><p style="margin:0;color:var(--dim);font-size:14px">لم يُعلَّم مقررٌ منجز بعد.</p></section>`;
  const wishes = s.wishes.length
    ? `<section class="card"><h2><span class="b">${icon("heart")}</span>رغباته${s.termName ? ` · ${esc(s.termName)}` : ""}<span class="n">${s.wishes.length}</span></h2><ul class="list">${courseRows(s.wishes)}</ul></section>` : "";
  const week = s.week && s.week.length
    ? `<section class="card"><h2><span class="b">${icon("cal")}</span>جدوله المقترح<span class="n">${esc(countOf(new Set(s.week.map(m => m.courseId)).size, AR.course))}</span></h2>${weekGrid(s.week)}</section>` : "";
  return shell("خطة طالب للمرشد · مساري", `<main class="wrap">
<header class="bar"><span class="mark">SCHEDULE</span><span class="ro">${icon("eye")}للقراءة فقط · تنتهي المشاركة في ${esc(when)}</span></header>
${hero}${passed}${wishes}${week}
<p class="foot">${icon("shield")}<span>لا اسمَ ولا رقمَ في هذه الصفحة، وتعتمد هوية الطالب على حضوره أمامك.</span></p>
</main>`);
}

export function renderShareGone(): string {
  return shell("المشاركة غير متاحة · مساري", `<main class="gone"><div><h1>هذه المشاركة غير متاحة</h1><p>انتهت مدتها أو أوقفها صاحبها. اطلب منه رابطاً جديداً.</p></div></main>`);
}
