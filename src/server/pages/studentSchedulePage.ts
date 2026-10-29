/**
 * ── جدولُ الطالب العام ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { AR, ARABIC_COUNT_SCRIPT } from "../../utils/arabicCount";
import { PUBLIC_LIGHT_VARS, PUBLIC_THEME_COLOR } from "../publicTheme";

export function studentSchedulePage(token: string, label: string, nonce: string): string {
  /* الأسماءُ المعدودة من arabicCount.ts نفسه — «٣ شعب»، «١٢ مقرراً» — لا نصّاً ثانياً. */
  const nouns = JSON.stringify({ course: AR.course, section: AR.section, lecture: AR.lecture });
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="${PUBLIC_THEME_COLOR}">
<meta name="robots" content="noindex,nofollow">
<title>${label} · SCHEDULE</title>
<link rel="icon" href="/schedule-icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/schedule-icon-192.png">
<style>/* SCHEDULE_PUBLIC_PLEX_ARABIC */@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:400;font-display:swap;src:url("/fonts/plex-arabic-arabic-400.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:500;font-display:swap;src:url("/fonts/plex-arabic-arabic-500.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:600;font-display:swap;src:url("/fonts/plex-arabic-arabic-600.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:700;font-display:swap;src:url("/fonts/plex-arabic-arabic-700.woff2") format("woff2")}
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
:root{${PUBLIC_LIGHT_VARS};--gutter:16px;--radius:16px;--shadow:0 1px 2px rgba(19,24,23,.04),0 6px 20px -12px rgba(19,24,23,.18);--shadow-lift:0 1px 2px rgba(19,24,23,.05),0 10px 28px -14px rgba(19,24,23,.24);--ease:cubic-bezier(.2,.7,.2,1)}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:"Plex Arabic",-apple-system,"Segoe UI","Noto Sans Arabic",Tahoma,sans-serif;font-synthesis:none;font-kerning:normal;-webkit-font-smoothing:antialiased;line-height:1.6;padding:0 var(--gutter) calc(32px + env(safe-area-inset-bottom))}
button{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--jade);outline-offset:2px;border-radius:10px}
.ltr{direction:ltr;unicode-bidi:isolate}
.wrap{max-width:1080px;margin:0 auto}
svg.i{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}

/* ── الرأس */
.hero{padding:max(22px,env(safe-area-inset-top)) 0 6px}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.mark{font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.28em;color:var(--brass)}
.brand .kind{font-size:12px;color:var(--dim);padding:3px 10px;border:1px solid var(--line);border-radius:999px;background:var(--card)}
h1{margin:0;font-size:clamp(22px,5.6vw,30px);line-height:1.35;font-weight:700;letter-spacing:0}
.sub{margin:8px 0 0;display:flex;flex-wrap:wrap;gap:6px 8px;color:var(--dim);font-size:13.5px;line-height:1.7}
.sub .meta{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:999px;background:var(--card);border:1px solid var(--line);color:var(--ink)}
.sub .meta svg{color:var(--jade)}
.sub.err{color:var(--bad)}

/* ── تنبيه «مبدئي» */
.provisional{display:inline-flex;gap:8px;align-items:center;margin:12px 0 4px;padding:4px 12px 4px 6px;border-radius:999px;border:1px solid color-mix(in srgb,var(--brass) 30%,var(--line));background:linear-gradient(180deg,color-mix(in srgb,var(--brass) 9%,var(--card)),color-mix(in srgb,var(--brass) 5%,var(--card)));color:var(--ink);font-size:13px;line-height:1.7}
.provisional .ic{flex:none;display:grid;place-items:center;width:24px;height:24px;border-radius:999px;background:color-mix(in srgb,var(--brass) 16%,var(--card));color:var(--brass)}
.provisional .ic svg{width:15px;height:15px}
.provisional b{color:var(--brass);font-weight:700;font-size:13px}
.provisional .more{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.provisional span{color:var(--dim)}

/* ── الشريط اللاصق */
.bar{position:sticky;top:0;z-index:5;margin:10px calc(-1 * var(--gutter)) 0;padding:8px var(--gutter);padding-top:max(8px,env(safe-area-inset-top));background:var(--bg);border-bottom:1px solid transparent;transition:border-color .2s,box-shadow .2s}
.bar.stuck{border-bottom-color:var(--line);box-shadow:0 8px 20px -18px rgba(19,24,23,.5)}
.bar-in{max-width:1080px;margin:0 auto;display:grid;gap:8px}
.search{position:relative}
.search .lens{position:absolute;inset-inline-start:14px;top:50%;transform:translateY(-50%);color:var(--dim);pointer-events:none}
.search .lens svg{width:18px;height:18px}
input[type=search]{-webkit-appearance:none;appearance:none;width:100%;height:44px;padding:0 44px;border:1px solid var(--line);border-radius:14px;background:var(--card);color:var(--ink);font:inherit;font-size:16px;box-shadow:0 1px 2px rgba(19,24,23,.04);transition:border-color .15s,box-shadow .15s}
input[type=search]::placeholder{color:color-mix(in srgb,var(--dim) 82%,transparent)}
input[type=search]::-webkit-search-cancel-button{-webkit-appearance:none;appearance:none}
input[type=search]:focus{outline:none;border-color:var(--jade);box-shadow:0 0 0 3px color-mix(in srgb,var(--jade) 18%,transparent)}
.clear{position:absolute;inset-inline-end:2px;top:50%;transform:translateY(-50%);width:44px;height:44px;display:grid;place-items:center;border:0;border-radius:10px;background:transparent;color:var(--dim);cursor:pointer}
.clear:hover{background:var(--soft);color:var(--ink)}
.controls{display:grid;gap:8px}
.seg{display:grid;grid-template-columns:1fr 1fr;gap:3px;padding:3px;border-radius:12px;background:var(--soft);border:1px solid var(--line)}
.seg button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:44px;padding:0 14px;border:0;border-radius:9px;background:transparent;color:var(--dim);font-size:14px;font-weight:500;cursor:pointer;transition:background .18s var(--ease),color .18s,box-shadow .18s}
.seg button[aria-pressed=true]{background:var(--card);color:var(--ink);font-weight:600;box-shadow:0 1px 2px rgba(19,24,23,.08),0 2px 8px -4px rgba(19,24,23,.18)}
.seg button[aria-pressed=true] svg{color:var(--jade)}
.chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;scroll-snap-type:x proximity;margin:0 calc(-1 * var(--gutter));padding:2px var(--gutter);padding-inline-end:40px;scroll-padding-inline:var(--gutter);-webkit-mask-image:linear-gradient(to left,transparent,#000 var(--gutter),#000 calc(100% - 40px),transparent);mask-image:linear-gradient(to left,transparent,#000 var(--gutter),#000 calc(100% - 40px),transparent)}
.chips::-webkit-scrollbar{display:none}
.chips button{flex:none;scroll-snap-align:start;display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 14px;border:1px solid var(--line);border-radius:999px;background:var(--card);color:var(--ink);font-size:13.5px;cursor:pointer;transition:background .18s var(--ease),border-color .18s,color .18s}
.chips button:hover{border-color:var(--line-strong)}
.chips button .n{font-size:11.5px;color:var(--dim);font-variant-numeric:tabular-nums;min-width:18px;padding:0 5px;border-radius:999px;background:var(--soft);text-align:center;line-height:18px}
.chips button .today{width:6px;height:6px;border-radius:50%;background:var(--brass)}
.chips button[aria-pressed=true]{background:var(--jade);border-color:var(--jade);color:var(--on-accent)}
.chips button[aria-pressed=true] .n{background:color-mix(in srgb,#fff 22%,transparent);color:var(--on-accent)}
.chips button[aria-pressed=true] .today{background:#fff}
.chips button:disabled{opacity:.45;cursor:default}

/* ── العدد */
.count{margin:14px 2px 10px;font-size:12.5px;color:var(--dim);min-height:1.6em}
.count b{color:var(--ink);font-weight:600}

/* ── عرض المقررات */
.grid{display:grid;gap:12px}
.course{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}
.course-h{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:15px 16px 12px}
.course-h h2{margin:0;font-size:16.5px;line-height:1.5;font-weight:600}
.course-h .side{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex:none}
.code{display:inline-block;padding:2px 9px;border-radius:7px;background:var(--accent-soft);color:var(--jade);font:600 12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.02em;direction:ltr;unicode-bidi:isolate;white-space:nowrap}
.course-h .nsec{font-size:11.5px;color:var(--dim);white-space:nowrap}
.course .shared{padding:0 16px 8px}
.secs{list-style:none;margin:0;padding:0 8px 8px;display:grid;gap:6px}
.sec{display:flex;gap:12px;align-items:flex-start;padding:11px 10px;border-radius:12px;background:var(--card2);border:1px solid color-mix(in srgb,var(--line) 70%,transparent)}
.badge{flex:none;display:grid;justify-items:center;align-content:center;min-width:52px;padding:5px 6px;border-radius:10px;background:var(--card);border:1px solid var(--line);color:var(--brass);line-height:1.2}
.badge small{font-size:11.5px;color:var(--dim)}
.badge b{font:700 15px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums}
.sec-body{flex:1;min-width:0;display:grid;gap:7px}
.line{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px}
.days{display:inline-flex;flex-wrap:wrap;gap:4px}
.day{padding:1px 9px;border-radius:999px;background:var(--card);border:1px solid var(--line);font-size:12px;line-height:1.75;color:var(--ink)}
.day.on{background:var(--accent-soft);border-color:color-mix(in srgb,var(--jade) 30%,var(--line));color:var(--jade);font-weight:600}
.time{display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:999px;background:color-mix(in srgb,var(--jade) 11%,var(--card));border:1px solid color-mix(in srgb,var(--jade) 24%,var(--line));color:color-mix(in srgb,var(--jade) 78%,#000);font:600 12.5px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums;direction:ltr;unicode-bidi:isolate;white-space:nowrap}
.time .dash{opacity:.7;font-weight:400}
.pill{display:inline-flex;align-items:center;gap:5px;min-width:0;font-size:12.5px;color:var(--dim)}
.pill svg{width:14px;height:14px;color:color-mix(in srgb,var(--dim) 80%,transparent)}
.pill.hall{padding:1px 9px 1px 8px;border-radius:999px;background:var(--card);border:1px solid var(--line);color:var(--ink)}
.pill.hall .ltr{font:500 12px/1.75 ui-monospace,SFMono-Regular,Menlo,monospace}
.pill.who{color:var(--ink)}
.pill.who span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* مطابقٌ لـ PUBLIC_VISITING_BADGE_CSS: هذه الدالة تُبنى معزولةً في تدقيق الصياغة فلا ترى ثوابت الوحدة. */
.visiting-badge,.meta .visiting-badge,.pill.who .visiting-badge,.pub-week .slot .visiting-badge{display:inline-flex;align-items:center;justify-content:center;flex:none;min-height:18px;padding:1px 6px;margin-inline-start:5px;border:1px solid color-mix(in srgb,var(--brass,#a8792a) 42%,var(--line));border-radius:999px;background:color-mix(in srgb,var(--brass,#a8792a) 10%,var(--card,#fff));color:color-mix(in srgb,var(--brass,#a8792a) 88%,var(--ink));font-size:11px;font-weight:700;font-style:normal;line-height:1.15;white-space:nowrap;vertical-align:middle;overflow:visible;text-overflow:clip}
@media print{.visiting-badge,.meta .visiting-badge,.pill.who .visiting-badge,.pub-week .slot .visiting-badge{border-color:#9a7a43;background:#faf5e9;color:#6e521f}}

/* ── عرض الأيام */
.dayblock{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:6px 0 10px}
.day-h{display:flex;align-items:center;gap:10px;margin:0;padding:12px 16px 10px;font-size:17px;font-weight:700}
.day-h .tag{font-size:11px;font-weight:600;color:var(--brass);padding:1px 8px;border-radius:999px;background:color-mix(in srgb,var(--brass) 12%,var(--card))}
.day-h small{margin-inline-start:auto;font-size:12px;font-weight:500;color:var(--dim)}
.tl{list-style:none;margin:0;padding:0 14px}
.slot{position:relative;display:grid;grid-template-columns:62px 1fr;gap:0 14px;padding:4px 0}
.slot-time{padding-top:10px;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums;line-height:1.3}
.slot-time b{display:block;font-size:14.5px;font-weight:700;color:var(--ink)}
.slot-time small{display:block;font-size:11.5px;color:var(--dim);margin-top:2px}
.slot-card{position:relative;padding:10px 13px 11px;border-radius:12px;background:var(--card2);border:1px solid color-mix(in srgb,var(--line) 70%,transparent);display:grid;gap:6px;min-width:0}
.slot-card::before{content:"";position:absolute;inset-inline-start:-13px;top:16px;width:11px;height:11px;border-radius:50%;background:var(--card);border:2px solid var(--jade)}
.slot:not(:last-child) .slot-card::after{content:"";position:absolute;inset-inline-start:-8px;top:29px;bottom:-17px;width:2px;background:color-mix(in srgb,var(--jade) 22%,var(--line))}
.slot-card .t{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px}
.slot-card h3{margin:0;font-size:14.5px;font-weight:600;line-height:1.5}
.secnum{font-size:12px;color:var(--brass);font-weight:600;white-space:nowrap}

/* ── الأسبوع بنظرة: عرضٌ فقط، مطويٌّ حتى يفتحه الطالب */
.wk{margin:0 0 12px;border:1px solid var(--line);border-radius:var(--radius);background:var(--card);box-shadow:var(--shadow)}
.wk summary{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;font-size:14px;font-weight:600;cursor:pointer;list-style:none}
.wk summary::-webkit-details-marker{display:none}
.wk summary svg{color:var(--jade)}
.wk summary::after{content:"";margin-inline-start:auto;inline-size:7px;block-size:7px;border-inline-end:2px solid var(--dim);border-block-end:2px solid var(--dim);transform:rotate(45deg);transition:transform .2s}
.wk[open] summary::after{transform:rotate(-135deg)}
.wk-g{display:grid;grid-template-columns:34px repeat(5,minmax(0,1fr));gap:4px;padding:2px 12px 14px;direction:rtl}
.wk-g>*{min-width:0}
.wk-r{display:contents}
.wk-r>*{min-width:0}
.wk-h{font-size:11px;color:var(--dim);text-align:center;padding:2px 0 4px;border-radius:8px}
.wk-h[data-today="1"]{color:var(--jade);font-weight:700;background:var(--accent-soft)}
.wk-t{font:500 11px/30px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--dim);text-align:center;direction:ltr}
.wk-c{block-size:30px;border-radius:8px;display:grid;place-items:center;font-size:12px;font-variant-numeric:tabular-nums;background:var(--soft);color:var(--ink)}
.wk-c[data-l="1"]{background:color-mix(in srgb,var(--jade) 14%,var(--card))}
.wk-c[data-l="2"]{background:color-mix(in srgb,var(--jade) 32%,var(--card))}
.wk-c[data-l="3"]{background:color-mix(in srgb,var(--jade) 55%,var(--card));color:#fff}
.wk-c[data-today="1"]{box-shadow:0 0 0 1.5px var(--jade)}
@media (min-width:720px){.wk-g{max-inline-size:560px;margin-inline:auto}}

/* ── حالاتُ الفراغ */
.state{display:grid;justify-items:center;text-align:center;gap:6px;padding:44px 20px;border:1px dashed var(--line-strong);border-radius:var(--radius);background:color-mix(in srgb,var(--card) 60%,transparent)}
.state .art{display:grid;place-items:center;width:56px;height:56px;border-radius:16px;background:var(--accent-soft);color:var(--jade);margin-bottom:6px}
.state .art svg{width:26px;height:26px}
.state.bad .art{background:var(--bad-soft);color:var(--bad)}
.state h2{margin:0;font-size:16px;font-weight:600}
.state p{margin:0;max-width:34ch;color:var(--dim);font-size:13.5px;line-height:1.8}
.state button{margin-top:10px;min-height:44px;padding:0 16px;border-radius:10px;border:1px solid var(--line-strong);background:var(--card);font-size:13.5px;font-weight:500;cursor:pointer}
.state button:hover{border-color:var(--jade);color:var(--jade)}

/* ── التحميل */
.skel{height:150px;border-radius:var(--radius);border:1px solid var(--line);background:linear-gradient(90deg,var(--card) 0%,var(--card2) 40%,var(--card) 80%) 0 0/300% 100%;animation:shine 1.4s linear infinite}
.skel:nth-child(2){height:210px}
@keyframes shine{to{background-position:-150% 0}}

.foot{margin:30px 0 0;text-align:center;color:var(--dim);font-size:12px;line-height:1.8}
/* الحركةُ عند تبديل العرض أو اليوم وحده؛ لا تومض النتائج مع كل حرفٍ في البحث. */
.anim .fade-in{animation:rise .28s var(--ease) both}
@keyframes rise{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}

@media (min-width:720px){
  :root{--gutter:28px}
  .hero{padding-top:max(36px,env(safe-area-inset-top))}
  .controls{grid-template-columns:auto 1fr;align-items:center;gap:14px}
  .seg{min-width:260px}
  .chips{margin:0;padding:2px 0;-webkit-mask-image:none;mask-image:none}
}
/* سطحُ المكتب: عمودان متراصّان بلا فراغٍ تحت البطاقة القصيرة؛ والبطاقة لا تنقسم بين عمودين. */
@media (min-width:920px){.grid{display:block;columns:2;column-gap:14px}.grid>*{break-inside:avoid;margin-bottom:14px}.anim .grid>.fade-in{animation:none}
  /* الأيام تُقرأ بترتيبها صفّاً صفّاً: الأحد بجانب الاثنين، لا عموداً بعد عمود. */
  .grid.by-day{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}.grid.by-day>*{margin-bottom:0}}
@media (hover:hover){.course,.dayblock{transition:box-shadow .2s var(--ease)}.course:hover,.dayblock:hover{box-shadow:var(--shadow-lift)}}
/* ألوانُ مقرّراتٍ هادئة: حافةٌ ورمزٌ بدرجةٍ من رموز الصفحة، لتتميّز البطاقات بلا ضجيج. */
@media screen{
.grid>.course{--hue:var(--jade);--hue-soft:var(--accent-soft);border-inline-start:3px solid var(--hue)}
.grid>.course:nth-child(6n+2){--hue:var(--brass);--hue-soft:color-mix(in srgb,var(--brass) 13%,var(--card))}
.grid>.course:nth-child(6n+3){--hue:#2a5f7d;--hue-soft:color-mix(in srgb,#2a5f7d 12%,var(--card))}
.grid>.course:nth-child(6n+4){--hue:#6b4a9c;--hue-soft:color-mix(in srgb,#6b4a9c 11%,var(--card))}
.grid>.course:nth-child(6n+5){--hue:var(--bad);--hue-soft:color-mix(in srgb,var(--bad) 9%,var(--card))}
.grid>.course:nth-child(6n+6){--hue:color-mix(in srgb,var(--jade) 55%,var(--brass));--hue-soft:color-mix(in srgb,var(--jade) 8%,var(--card))}
.grid>.course .code{background:var(--hue-soft);color:var(--hue)}
.grid>.course:nth-child(6n+4) .code,.grid>.course:nth-child(6n+6) .code{color:color-mix(in srgb,var(--hue) 80%,#000)}
#list.anim .grid>.course,#list.anim .dayblock{animation:tin .45s var(--ease) both}
.grid>.course:nth-child(2),.dayblock:nth-child(2){animation-delay:.04s!important}.grid>.course:nth-child(3),.dayblock:nth-child(3){animation-delay:.08s!important}.grid>.course:nth-child(n+4),.dayblock:nth-child(n+4){animation-delay:.12s!important}
@keyframes tin{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
@media (prefers-contrast:more){:root{--line:#9aa39d;--dim:#3d4641}}
</style>
</head>
<body>
<main class="wrap">
  <header class="hero">
    <div class="brand"><span class="mark">SCHEDULE</span><span class="kind">جدول الطلبة</span></div>
    <h1 id="title">${label}</h1>
    <p class="sub" id="sub">يفتح…</p>
    <div class="provisional" id="provisional" role="note" title="لم يُعتمد بعد، وقد تتغيّر بعض المواعيد أو القاعات قبل الاعتماد." hidden>
      <span class="ic" aria-hidden="true"><svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/></svg></span>
      <div><b>جدول مبدئي</b><span> — لم يُعتمد بعد</span><span class="more">، وقد تتغيّر بعض المواعيد أو القاعات قبل الاعتماد.</span></div>
    </div>
  </header>
  <div class="bar" id="bar">
    <div class="bar-in">
      <div class="search" role="search">
        <span class="lens" aria-hidden="true"><svg class="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg></span>
        <input type="search" id="q" placeholder="ابحث بالمقرر أو الرمز أو الشعبة" aria-label="بحث في الجدول" autocomplete="off" enterkeyhint="search">
        <button type="button" class="clear" id="clear" aria-label="مسح البحث" hidden><svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
      <div class="controls">
        <div class="seg" id="views" role="group" aria-label="طريقة العرض">
          <button type="button" data-view="course" aria-pressed="true"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10v16H5.5A1.5 1.5 0 0 1 4 18.5zM14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14z"/></svg>حسب المقرر</button>
          <button type="button" data-view="day" aria-pressed="false"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>حسب اليوم</button>
        </div>
        <div class="chips" id="days" role="group" aria-label="تصفية باليوم"></div>
      </div>
    </div>
  </div>
  <p class="count" id="count" aria-live="polite"></p>
  <details class="wk" id="wk" hidden><summary data-guide-ignore="عرض للقراءة فقط يطوى ويفتح"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>الأسبوع بنظرة</summary><div class="wk-g" id="wkg" role="table" aria-label="عدد المحاضرات في كل يوم وفترة"></div></details>
  <section id="list" aria-label="الجدول" aria-busy="true"><div class="grid" aria-hidden="true"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div></section>
  <p class="foot" id="foot">الجدول المعتمد للفصل الجاري · للقراءة فقط ويتحدّث من نفسه</p>
</main>
<script nonce="${nonce}">
(function () {
  var DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];
  var NOUN = ${nouns};
  ${ARABIC_COUNT_SCRIPT}
  var token = ${JSON.stringify(token)};
  var TODAY = new Date().getDay();
  var state = { rows: [], view: "course", day: -1, q: "", loaded: false };
  var list = document.getElementById("list");
  var countBox = document.getElementById("count");
  var qBox = document.getElementById("q");
  var clearBtn = document.getElementById("clear");
  var bar = document.getElementById("bar");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ICON = {
    pin: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
    user: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/></svg>',
    search: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2M8.5 11h5"/></svg>',
    cal: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4M10 14.5h4"/></svg>',
    warn: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>',
    school: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9.5 12 5l9 4.5-9 4.5z"/><path d="M7 11.5V16c1.4 1.3 3.1 2 5 2s3.6-.7 5-2v-4.5"/></svg>',
    term: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>'
  };
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function norm(v) { return String(v || "").toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\\s+/g, " ").trim(); }
  function place(r) { return [r.room, r.hall].filter(Boolean).join("/"); }
  function mins(t) { var m = /^(\\d{1,2}):(\\d{2})/.exec(String(t || "")); return m ? Number(m[1]) * 60 + Number(m[2]) : 1e4; }
  function bySection(a, b) { return String(a.section).localeCompare(String(b.section), "ar", { numeric: true }) || mins(a.start) - mins(b.start); }
  /* البداية – النهاية داخل عزلٍ LTR، كما يكتبها formatScheduleTimeRange. */
  function range(r) { return '<span class="time" dir="ltr"><span>' + esc(r.start) + '</span><span class="dash">–</span><span>' + esc(r.end) + "</span></span>"; }
  function hallPill(r) { return place(r) ? '<span class="pill hall" title="القاعة">' + ICON.pin + '<span class="ltr" dir="ltr">' + esc(place(r)) + "</span></span>" : ""; }
  function visBadge(r) { return r.visiting ? '<span class="visiting-badge compact">منتدب</span>' : ""; }
  function whoPill(r) { return r.instructor ? '<span class="pill who">' + ICON.user + "<span>" + esc(r.instructor) + "</span>" + visBadge(r) + "</span>" : ""; }
  function codePill(code) { return code ? '<span class="code" dir="ltr">' + esc(code) + "</span>" : ""; }
  function dayChips(r) {
    return '<span class="days">' + r.days.map(function (d) {
      return '<span class="day' + (state.day === d ? " on" : "") + '">' + esc(DAYS[d] || "") + "</span>";
    }).join("") + "</span>";
  }
  function sectionKey(r) { return r.code + "|" + r.name + "|" + r.section; }
  function courseKey(r) { return r.code + "|" + r.name; }
  function uniq(rows, key) { var seen = {}, n = 0; rows.forEach(function (r) { var k = key(r); if (!seen[k]) { seen[k] = 1; n++; } }); return n; }
  function match(r) {
    if (state.day >= 0 && r.days.indexOf(state.day) < 0) return false;
    if (!state.q) return true;
    return norm([r.name, r.code, r.section, r.instructor, place(r)].join(" ")).indexOf(state.q) >= 0;
  }
  function filtered() { return state.day >= 0 || !!state.q; }
  function emptyState(kind, offline) {
    var art = kind === "error" ? ICON.warn : kind === "none" ? ICON.cal : ICON.search;
    var title = kind === "none" ? "لا مواعيد لهذا الفصل بعد" : kind === "error" ? "تعذّر فتح الجدول" : "لا نتائج مطابقة";
    var hint = kind === "none" ? "يظهر الجدول هنا حين ينشره القسم. افتح الرابط نفسه لاحقاً."
      : kind === "error" ? (offline ? "تحقّق من الاتصال ثم أعد المحاولة." : "تأكّد من الرابط، أو امسح رمز QR من جديد.")
      : (state.q ? "جرّب جزءاً من اسم المقرر أو رقم الشعبة" : "لا محاضرات في هذا اليوم") + (state.day >= 0 ? "، أو اعرض كل الأيام." : ".");
    var action = kind === "results" ? '<button type="button" data-reset>مسح البحث والتصفية</button>'
      : kind === "error" && offline ? '<button type="button" data-retry>إعادة المحاولة</button>' : "";
    return '<div class="state fade-in' + (kind === "error" ? " bad" : "") + '"><span class="art" aria-hidden="true">' + art + "</span><h2>" + title + "</h2><p>" + hint + "</p>" + action + "</div>";
  }
  function countLine(rows) {
    if (!state.loaded || !state.rows.length) { countBox.textContent = ""; return; }
    var c = uniq(rows, courseKey), s = uniq(rows, sectionKey);
    var text = "<b>" + esc(countOf(c, NOUN.course)) + "</b> · " + esc(countOf(s, NOUN.section));
    if (filtered()) text = (rows.length ? "النتائج: " + text : "لا نتائج") + " من أصل " + esc(countOf(uniq(state.rows, courseKey), NOUN.course));
    if (state.day >= 0) text += " · يوم " + esc(DAYS[state.day]);
    countBox.innerHTML = text;
  }
  function courseView(rows) {
    var groups = {}, order = [];
    rows.forEach(function (r) { var k = courseKey(r); if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(r); });
    order.sort(function (a, b) { return a.localeCompare(b, "ar", { numeric: true }); });
    return '<div class="grid">' + order.map(function (k) {
      var g = groups[k].slice().sort(bySection), first = g[0], n = uniq(g, sectionKey);
      var sharedHall = g.length > 1 && place(first) && g.every(function (r) { return place(r) === place(first); });
      var sharedWho = g.length > 1 && first.instructor && g.every(function (r) { return r.instructor === first.instructor && !!r.visiting === !!first.visiting; });
      return '<article class="course fade-in" aria-label="' + esc(first.name) + '"><header class="course-h"><h2>' + esc(first.name || "مقرر") + "</h2>" +
        '<div class="side">' + codePill(first.code) + '<span class="nsec">' + esc(countOf(n, NOUN.section)) + "</span></div></header>" +
        ((sharedHall || sharedWho) ? '<div class="line shared">' + (sharedHall ? hallPill(first) : "") + (sharedWho ? whoPill(first) : "") + "</div>" : "") +
        '<ul class="secs">' + g.map(function (r) {
          var tip = [place(r) ? "القاعة: " + place(r) : "", r.instructor ? "الأستاذ: " + r.instructor + (r.visiting ? " · منتدب" : "") : ""].filter(Boolean).join(" · ");
          return '<li class="sec" title="' + esc(tip) + '">' + (r.section ? '<span class="badge"><small>شعبة</small><b dir="ltr">' + esc(r.section) + "</b></span>" : "") +
            '<div class="sec-body"><div class="line">' + dayChips(r) + range(r) + "</div>" +
            (((place(r) && !sharedHall) || (r.instructor && !sharedWho)) ? '<div class="line">' + (sharedHall ? "" : hallPill(r)) + (sharedWho ? "" : whoPill(r)) + "</div>" : "") + "</div></li>";
        }).join("") + "</ul></article>";
    }).join("") + "</div>";
  }
  function dayView(rows) {
    var html = "";
    DAYS.forEach(function (name, d) {
      if (state.day >= 0 && state.day !== d) return;
      var today = rows.filter(function (r) { return r.days.indexOf(d) >= 0; })
        .sort(function (a, b) { return mins(a.start) - mins(b.start) || mins(a.end) - mins(b.end) || String(a.name).localeCompare(String(b.name), "ar"); });
      if (!today.length) return;
      html += '<section class="dayblock fade-in" aria-labelledby="dh' + d + '"><h2 class="day-h" id="dh' + d + '">' + esc(name) +
        (d === TODAY ? '<span class="tag">اليوم</span>' : "") + "<small>" + esc(countOf(today.length, NOUN.lecture)) + "</small></h2>" +
        '<ol class="tl">' + today.map(function (r) {
          return '<li class="slot"><div class="slot-time" dir="ltr" aria-label="من ' + esc(r.start) + " إلى " + esc(r.end) + '"><b>' + esc(r.start) + "</b><small>" + esc(r.end) + "</small></div>" +
            '<div class="slot-card"><div class="t"><h3>' + esc(r.name || "مقرر") + "</h3>" + codePill(r.code) + "</div>" +
            '<div class="line">' + (r.section ? '<span class="secnum">شعبة <span dir="ltr">' + esc(r.section) + "</span></span>" : "") + hallPill(r) + whoPill(r) + "</div></div></li>";
        }).join("") + "</ol></section>";
    });
    return '<div class="grid by-day">' + html + "</div>";
  }
  /* الأسبوع بنظرة: من الصفوف المحمّلة نفسها (كل الجدول لا المصفّى)، عرضٌ فقط. */
  function weekGrid() {
    var box = document.getElementById("wk"), g = document.getElementById("wkg");
    if (!state.loaded || !state.rows.length) { box.hidden = true; return; }
    var cell = {}, lo = 99, hi = -1;
    state.rows.forEach(function (r) {
      var m = mins(r.start); if (m >= 1e4) return;
      var b = Math.floor(m / 120) * 2; lo = Math.min(lo, b); hi = Math.max(hi, b);
      r.days.forEach(function (d) { if (d >= 0 && d < 5) { var k = b + "|" + d; cell[k] = (cell[k] || 0) + 1; } });
    });
    if (hi < 0) { box.hidden = true; return; }
    var h = '<div class="wk-r" role="row"><span role="columnheader" aria-label="الوقت"></span>' + DAYS.map(function (n, d) { return '<span class="wk-h" role="columnheader" data-today="' + (d === TODAY ? 1 : 0) + '">' + esc(n) + "</span>"; }).join("") + "</div>";
    for (var b = lo; b <= hi; b += 2) {
      var band = (b < 10 ? "0" : "") + b + ":00";
      h += '<div class="wk-r" role="row"><span class="wk-t" role="rowheader">' + band + "</span>";
      for (var d = 0; d < 5; d++) { var n = cell[b + "|" + d] || 0; h += '<span class="wk-c" role="cell" aria-label="' + esc(DAYS[d] + " " + band + ": " + (n ? countOf(n, NOUN.lecture) : "لا محاضرات")) + '" data-l="' + (n >= 4 ? 3 : n >= 2 ? 2 : n ? 1 : 0) + '" data-today="' + (d === TODAY ? 1 : 0) + '">' + (n || "") + "</span>"; }
      h += "</div>";
    }
    g.innerHTML = h; box.hidden = false;
  }
  function render(anim) {
    weekGrid();
    var rows = state.rows.filter(match);
    list.className = anim ? "anim" : "";
    countLine(rows);
    list.setAttribute("aria-busy", "false");
    bar.hidden = state.loaded && !state.rows.length;
    if (!rows.length) { list.innerHTML = emptyState(state.rows.length ? "results" : "none"); return; }
    list.innerHTML = state.view === "course" ? courseView(rows) : dayView(rows);
  }
  /* بعد تغيير العرض أو اليوم يعود أعلى القائمة تحت الشريط، لا في منتصف ما اختفى. */
  function toTop() {
    var y = list.getBoundingClientRect().top + window.scrollY - bar.offsetHeight - 50;
    if (window.scrollY > y) window.scrollTo({ top: Math.max(0, y), behavior: reduce ? "auto" : "smooth" });
  }
  function chips() {
    var box = document.getElementById("days");
    var per = DAYS.map(function (_, d) { return state.rows.filter(function (r) { return r.days.indexOf(d) >= 0; }).length; });
    function chip(d, text, n) {
      var today = d === TODAY;
      return '<button type="button" data-day="' + d + '" aria-pressed="' + (state.day === d) + '"' +
        (state.loaded && d >= 0 && !n ? " disabled" : "") + (today ? ' aria-label="' + text + ' (اليوم)"' : "") + ">" +
        (today ? '<span class="today" aria-hidden="true"></span>' : "") + text +
        (state.loaded ? '<span class="n" aria-hidden="true">' + n + "</span>" : "") + "</button>";
    }
    box.innerHTML = chip(-1, "كل الأيام", state.rows.length) + DAYS.map(function (n, d) { return chip(d, n, per[d]); }).join("");
  }
  document.getElementById("days").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b || b.disabled) return;
    var d = Number(b.getAttribute("data-day"));
    state.day = state.day === d && d >= 0 ? -1 : d; chips(); render(true); toTop();
    var on = this.querySelector('[aria-pressed="true"]');
    if (on && on.scrollIntoView) on.scrollIntoView({ inline: "center", block: "nearest", behavior: reduce ? "auto" : "smooth" });
  });
  document.getElementById("views").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return; state.view = b.getAttribute("data-view");
    Array.prototype.forEach.call(this.querySelectorAll("button"), function (x) { x.setAttribute("aria-pressed", String(x === b)); }); render(true); toTop();
  });
  qBox.addEventListener("input", function (e) { state.q = norm(e.target.value); clearBtn.hidden = !e.target.value; render(); });
  qBox.addEventListener("keydown", function (e) { if (e.key === "Enter") qBox.blur(); });
  clearBtn.addEventListener("click", function () { qBox.value = ""; state.q = ""; clearBtn.hidden = true; render(); qBox.focus(); });
  list.addEventListener("click", function (e) {
    if (e.target.closest("[data-reset]")) { qBox.value = ""; state.q = ""; clearBtn.hidden = true; state.day = -1; chips(); render(true); }
    if (e.target.closest("[data-retry]")) load();
  });
  if ("IntersectionObserver" in window) {
    var sentinel = document.createElement("div"); sentinel.setAttribute("aria-hidden", "true");
    bar.parentNode.insertBefore(sentinel, bar);
    new IntersectionObserver(function (en) { bar.classList.toggle("stuck", !en[0].isIntersecting); }).observe(sentinel);
  }
  function meta(icon, text) { return text ? '<span class="meta">' + icon + "<span>" + esc(text) + "</span></span>" : ""; }
  function load() {
    list.setAttribute("aria-busy", "true");
    fetch("/api/public/students/" + encodeURIComponent(token), { cache: "no-store" })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || "تعذّر فتح الجدول"); e.server = true; throw e; } return d; }); })
      .then(function (d) {
        state.rows = (d.rows || []).map(function (r) { r.days = Array.isArray(r.days) ? r.days : []; return r; });
        state.loaded = true;
        document.getElementById("provisional").hidden = !d.provisional;
        if (d.provisional) document.getElementById("foot").textContent = "الجدول الحالي للفصل الجاري — مبدئي حتى يُعتمد · للقراءة فقط ويتحدّث من نفسه";
        document.getElementById("title").textContent = d.section || "جدول القسم";
        var sub = document.getElementById("sub"); sub.className = "sub";
        sub.innerHTML = meta(ICON.school, d.college) + meta(ICON.term, d.term);
        chips(); render(true);
      })
      .catch(function (err) {
        var sub = document.getElementById("sub"); sub.className = "sub err"; sub.textContent = err.server ? err.message : "تعذّر الاتصال بالخادم.";
        list.setAttribute("aria-busy", "false"); countBox.textContent = ""; list.className = "anim"; bar.hidden = Boolean(err.server); list.innerHTML = emptyState("error", !err.server);
      });
  }
  chips();
  load();
})();
</script>
</body>
</html>`;
}
