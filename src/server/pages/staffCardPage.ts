/**
 * ── بطاقةُ الأستاذ العامة ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { PROPOSAL_ALERT_CSS, PROPOSAL_ALERT_SCRIPT } from "../studyProposalAlert";
import { COURSE_COLOR_JS, STAFF_CARD_VISUAL_CSS, STAFF_CARD_VISUAL_JS } from "../staffCardVisual";
import { DEMO_COPY_SCRIPT } from "../publicKit";
import { CALENDAR_LINKS_CLIENT_JS } from "../../utils/calendarLinks";
import { PUBLIC_LIGHT_VARS, PUBLIC_THEME_COLOR } from "../publicTheme";

export function staffCardPage(token: string, label: string, nonce: string, demoHint = ""): string {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="${PUBLIC_THEME_COLOR}">
<meta name="robots" content="noindex,nofollow">
<title>بطاقتي · SCHEDULE</title>
<link rel="icon" href="/schedule-icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/schedule-icon-192.png">
<style>/* SCHEDULE_PUBLIC_PLEX_ARABIC */@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:400;font-display:swap;src:url("/fonts/plex-arabic-arabic-400.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:500;font-display:swap;src:url("/fonts/plex-arabic-arabic-500.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:600;font-display:swap;src:url("/fonts/plex-arabic-arabic-600.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:700;font-display:swap;src:url("/fonts/plex-arabic-arabic-700.woff2") format("woff2")}
*,*::before,*::after{box-sizing:border-box}
:root{${PUBLIC_LIGHT_VARS}}
body{margin:0;min-height:100dvh;background:var(--bg);color:var(--ink);
  font-family:"Plex Arabic",-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans Arabic",Tahoma,sans-serif;
  font-synthesis:none;font-kerning:normal;-webkit-font-smoothing:antialiased;padding:max(20px,env(safe-area-inset-top)) 18px calc(28px + env(safe-area-inset-bottom))}
.wrap{max-width:760px;margin:0 auto}
/* ما تغيّر منذ آخر زيارة — سطر واحد بدل قراءة الأسبوع كله بالعين. */
.since{margin:18px 0 6px;padding:14px 16px;border:1px solid var(--line);border-radius:14px;background:var(--card)}
.since>strong{display:block;font-size:14px;font-weight:600;color:var(--brass);margin-bottom:8px}
.since ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.since li{display:flex;gap:8px;align-items:baseline;font-size:13px;line-height:1.7;color:var(--ink)}
.since li b{flex:none;min-width:52px;color:var(--dim);font-size:12px;font-weight:600}
.since li.t-gone span{color:var(--bad)}
.since li.t-add span{color:var(--jade)}
.since li.t-more{color:var(--dim);font-size:12px}
.since button{
  margin-top:12px;padding:8px 16px;border:1px solid var(--line);border-radius:999px;
  background:transparent;color:var(--ink);font:inherit;font-size:13px;cursor:pointer;
}
.since button:hover{border-color:var(--jade);color:var(--jade)}
.mark{font:600 12px/1 ui-monospace,monospace;letter-spacing:.26em;color:var(--brass)}
.mark.arabic{font-family:"Plex Arabic","Noto Sans Arabic",Tahoma,sans-serif;letter-spacing:0;line-height:1.4}
.gate{margin-top:22vh;text-align:center;animation:rise .4s ease both}
.gate h1{margin:18px 0 6px;font-size:26px;font-weight:600;letter-spacing:0}
.gate p{margin:0 0 26px;color:var(--dim);font-size:14px;line-height:1.8}
.field{display:flex;gap:10px;max-width:380px;margin:0 auto}
input{flex:1;min-width:0;height:52px;padding:0 16px;border:1px solid var(--line);border-radius:14px;
  background:var(--card);color:var(--ink);font:600 17px/1 ui-monospace,monospace;letter-spacing:.06em;
  text-align:center;direction:ltr;outline:none;transition:border-color .16s,box-shadow .16s}
input:focus{border-color:var(--jade);box-shadow:0 0 0 3px rgba(105,192,168,.16)}
button{height:52px;padding:0 22px;border:0;border-radius:14px;background:var(--jade);color:var(--on-accent);
  font-weight:600;font-size:15px;line-height:1;font-family:inherit;cursor:pointer;transition:transform .12s,filter .16s}
button:active{transform:scale(.98)}
button[disabled]{filter:grayscale(.5);opacity:.6;cursor:default}
.note{margin-top:16px;min-height:20px;color:var(--bad);font-size:13px}
.hint{margin-top:26px;color:var(--muted);font-size:12px;line-height:1.9}
.card{display:none;animation:rise .45s ease both}
.head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin:22px 0 20px;
  padding-bottom:18px;border-bottom:1px solid var(--line)}
.head h1{margin:6px 0 0;font-size:clamp(24px,6vw,32px);font-weight:600;letter-spacing:0;line-height:1.2}
.head small{display:block;color:var(--dim);font-size:13px}
.pmap{flex:none;display:inline-grid;place-items:center;width:40px;height:40px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--dim);text-decoration:none;transition:color .15s,border-color .15s}
.pmap[hidden]{display:none}
.pmap:hover,.pmap:focus-visible{color:var(--jade);border-color:var(--jade);outline:none}
.pmap svg{width:20px;height:20px}
.term-switch[hidden]{display:none}
.term-switch{display:flex;align-items:center;gap:10px;margin:0 0 20px;flex-wrap:wrap}
.term-switch label{color:var(--dim);font-size:12px;font-weight:600}
.term-switch select{flex:1;min-width:180px;min-height:44px;padding:0 14px;font-size:16px;
  border:1px solid var(--line);border-radius:12px;background:var(--card);color:inherit}
.pub-empty{padding:32px 16px;text-align:center;color:var(--dim);font-size:15px;
  border:1px dashed var(--line);border-radius:16px}
/* The card always shows exactly four figures. auto-fit chose three columns at
   phone width and left the fourth stranded alone on its own row; two by two
   is even at every width the card is read on. */
.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:22px}
@media (min-width:560px){.stats{grid-template-columns:repeat(5,1fr)}}
/* Five figures in two columns stranded the last one at half width: it takes the whole row. */
@media (max-width:559px){.stats .stat:last-child:nth-child(odd){grid-column:1/-1}}
.stat{padding:14px;border:1px solid var(--line);border-radius:16px;background:var(--card)}
.stat b{display:block;font-size:26px;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.stat span{display:block;margin-top:2px;color:var(--dim);font-size:12px}
.day{margin-bottom:14px;border:1px solid var(--line);border-radius:18px;background:var(--card);overflow:hidden}
.day>h2{display:flex;align-items:center;justify-content:space-between;margin:0;padding:14px 16px;
  font-size:15px;font-weight:600;border-bottom:1px solid var(--line)}
.day>h2 em{font-style:normal;color:var(--dim);font:500 12px/1 ui-monospace,monospace;direction:ltr}
.slot{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 12px;padding:13px 16px;border-bottom:1px solid var(--line)}
.slot:last-child{border-bottom:0}
.slot strong{font-size:15px;font-weight:600;line-height:1.4}
.slot time{color:var(--jade);font:600 13px/1.6 ui-monospace,monospace;direction:ltr;white-space:nowrap}
.slot small{grid-column:1/-1;color:var(--dim);font-size:12.5px}
.gap{display:flex;align-items:center;gap:8px;padding:10px 16px;background:rgba(199,155,95,.07);
  color:var(--brass);font-size:12.5px;border-bottom:1px solid var(--line)}
.gap i{flex:none;width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.7}
.gap time{font:600 12px/1 ui-monospace,monospace;direction:ltr}
.tools{display:flex;gap:10px;margin:22px 0 8px}
/* The compact staff card now ends visually at the weekly table. The per-day
   duplicate cards are gone, and no secondary controls are left hanging below. */
#days~.tools,#days~.sub,#days~.foot{display:none!important}
.tools a{flex:1;height:48px;display:grid;place-items:center;border:1px solid var(--line);border-radius:14px;
  background:var(--card);color:var(--ink);font-size:14px;font-weight:600;text-decoration:none}
/* The subscription panel. It stays closed until asked for, because most people
   open this card to read their week, not to wire up a calendar. */
/* Measured, not guessed: a negative top margin tucked the panel two pixels
   under the button that opens it. It sits clear of it now. */
.sub{margin:10px 0 8px;padding:14px;border:1px solid var(--line);border-radius:16px;background:var(--card);
  display:grid;gap:9px;animation:sub-in .22s cubic-bezier(.2,.8,.3,1) both}
@keyframes sub-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.sub p{margin:0;font-size:13px;line-height:1.8;color:var(--muted)}
.sub a,.sub button{min-height:44px;display:grid;place-items:center;border-radius:12px;font-weight:600;font-size:14px;line-height:1.4;font-family:inherit;
  text-decoration:none;cursor:pointer;padding:0 14px;text-align:center}
/* This page's palette is jade/brass — it has no --accent, and a var() naming
   nothing resolves to nothing, which painted a near-black label on a near-black
   card. Measured invisible, then named correctly. */
.sub a{background:var(--jade);border:1px solid var(--jade);color:var(--on-accent)}
.sub button{background:transparent;border:1px solid var(--line);color:var(--ink)}
/* When the clipboard is unavailable the address is shown instead; making it
   select as one unit means a long-press picks up the whole URL, not a word. */
.subalarm{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--ink);cursor:pointer;padding-inline:2px}
.subalarm input{accent-color:var(--jade);inline-size:16px;block-size:16px;flex:none}
.sub small{font-size:11.5px;color:var(--muted);text-align:center;line-height:1.8;-webkit-user-select:all;user-select:all;word-break:break-all}
@media (prefers-reduced-motion:reduce){.sub{animation:none}}
/* ── الإبلاغ ────────────────────────────────────────────────────────────
 * The trigger is the quietest thing in the slot on purpose: a card is opened
 * to read a week, and the ninety per cent who only want that must not have to
 * look past a form to do it. */
/* The slot is a two-column grid whose first column hugs the course name — the
   button landed in it and was squeezed to 24px, measured. Both additions span
   the whole row, which is also where they read best: an action about a lecture
   belongs under the lecture, not beside its title. */
.slot{position:relative}
button.say,.sayform{grid-column:1/-1}
button.say{
  justify-self:start;
  margin-block-start:8px;min-height:36px;padding:0 13px;border-radius:9px;cursor:pointer;
  border:1px solid var(--line);background:transparent;color:var(--dim);
  font-weight:600;font-size:11.5px;line-height:1;font-family:inherit;white-space:nowrap;transition:color .16s,border-color .16s;
}
button.say:hover:not(:disabled){color:var(--jade);border-color:var(--jade)}
button.say:disabled{opacity:.55;cursor:default;border-style:dashed}
.card-tabs{display:flex;gap:8px;margin-bottom:14px;border-bottom:1px solid var(--line);padding-bottom:8px}
.card-tab{flex:1 1 0;min-height:44px;padding:8px 10px;border-radius:10px;border:1px solid var(--line);background:transparent;color:var(--dim);font-weight:600;font-size:13px;line-height:1.3;font-family:inherit;cursor:pointer}
.card-tab[aria-selected=true]{background:var(--jade);color:var(--on-accent);border-color:var(--jade)}
.movement-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.movement-item{padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--card);font-size:13px;line-height:1.6}
.movement-item.t-add{border-inline-start:3px solid #2a5f7d}
.movement-item.t-move{border-inline-start:3px solid #8d6413}
.movement-item.t-room{border-inline-start:3px solid #6b4a9c}
.movement-item.t-gone{border-inline-start:3px solid var(--bad)}
.movement-head{margin:14px 0 8px;font-size:13.5px;font-weight:600;color:var(--brass)}
.movement-head:first-child{margin-top:0}
.movement-meta{display:block;color:var(--dim)}
.movement-meta[data-decision=fixed]{color:var(--jade)}
.movement-meta[data-decision=rejected]{color:var(--bad)}
${PROPOSAL_ALERT_CSS}
.requests-panel{margin-top:12px;padding:14px;border-radius:12px;border:1px solid var(--line);background:var(--card)}
.requests-panel h3{margin:0 0 4px;font-size:14px}.requests-panel .sub{margin:0;color:var(--dim);font-size:12.5px;line-height:1.8}
.req-proposed{display:inline-block;margin-top:6px;padding:2px 10px;border-radius:999px;background:color-mix(in srgb,var(--brass) 18%,transparent);color:var(--brass);font-size:11.5px;font-weight:600}
.requests-panel a.req-link{display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:10px;background:var(--jade);color:var(--on-accent);font-weight:600;font-size:13.5px;text-decoration:none;margin-top:8px}
.approvals{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}
.approvals span{padding:4px 10px;border-radius:999px;border:1px solid var(--line);font-size:11.5px;color:var(--dim)}
.approvals span[data-status=accepted]{border-color:var(--jade);color:var(--jade)}
.approvals span[data-status=returned]{border-color:var(--bad);color:var(--bad)}
.soon{margin:0 0 16px;padding:12px 14px;border-radius:14px;border:1px solid var(--line);background:var(--card)}
.soon b{display:block;font-size:13px;margin-bottom:6px}
.soon ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.soon li{font-size:12.5px;color:var(--dim);line-height:1.7}
.soon li[data-kind=cancelled] strong{color:var(--bad)}
.soon li[data-kind=covering] strong{color:var(--jade)}
.movement-new{display:inline-block;padding:1px 8px;border-radius:999px;background:var(--jade);color:var(--on-accent);font-size:11px;font-weight:600}
.pastnote{
  margin-block-end:14px;padding:11px 13px;border-radius:12px;
  border:1px solid var(--line);background:color-mix(in srgb,var(--brass) 9%,transparent);
  color:var(--dim);font-size:12.5px;line-height:1.8;
}
.foot{margin-top:26px;color:var(--muted);font-size:11.5px;text-align:center;line-height:1.9}
/* The approved report table — the same five-column week the reports print,
   so the professor's shared card and the official sheet read as one family. */
.pub-week{width:100%;margin:0 0 18px;border-collapse:collapse;table-layout:fixed;background:var(--card);border-radius:16px;overflow:hidden}
.pub-week th{padding:9px 4px;text-align:center;font-size:12px;font-weight:600;color:var(--brass);border:1px solid var(--line);background:rgba(19,24,23,.03)}
.pub-week td{border:1px solid var(--line);padding:0;vertical-align:top}
.pub-week th.t{width:52px;font:600 11px/1.4 ui-monospace,monospace;color:var(--jade);vertical-align:top;padding-top:9px}
/* عنوانُ العمود «الوقت» كلمةٌ عربية: بخطٍّ أحاديّ العرض تتفكّك حروفُها
   «الـوقـت». الأرقامُ تحته تبقى أحادية العرض لتصطفّ. */
.pub-week thead th.t{font-family:inherit;font-size:11.5px;letter-spacing:0}
.pub-week .wslot{display:block;padding:8px 9px;border-bottom:1px dashed var(--line)}
.pub-week .wslot:last-child{border-bottom:0}
.pub-week .wslot b{display:block;font-size:12px;font-weight:600;line-height:1.35}
.pub-week .wslot time{display:block;margin-top:2px;font:600 11px/1.4 ui-monospace,monospace;color:var(--jade);direction:ltr}
.pub-week .wslot{min-width:0;overflow:hidden}
.pub-week .wslot small{display:block;margin-top:1px;color:var(--dim);font-size:11px;font-weight:400;line-height:1.35;opacity:.9;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pub-week .wslot .wroom{font-family:ui-monospace,monospace;font-size:11px;letter-spacing:-.2px;text-align:start;white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:normal}
@media(max-width:520px){.pub-week th.t{width:44px;font-size:11px}.pub-week th{font-size:11px;padding:8px 2px}.pub-week .wslot{padding:6px 5px}.pub-week .wslot b{font-size:11px;line-height:1.3;overflow-wrap:anywhere}.pub-week .wslot time{font-size:11px;line-height:1.35;letter-spacing:-.3px}.pub-week .wslot small{font-size:11px;white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}.pub-week .wslot .wroom{font-size:11px;letter-spacing:-.3px;-webkit-line-clamp:3}}
/* ── صقلٌ بصري (عرضٌ فقط) ───────────────────────────────────────────── */
.stats .stat{animation:rise .5s cubic-bezier(.2,.7,.2,1) both}
.stats .stat:nth-child(2){animation-delay:.05s}.stats .stat:nth-child(3){animation-delay:.1s}.stats .stat:nth-child(4){animation-delay:.15s}.stats .stat:nth-child(5){animation-delay:.2s}
.pub-week tbody tr{animation:rise .5s cubic-bezier(.2,.7,.2,1) both}
.pub-week tbody tr:nth-child(2){animation-delay:.06s}.pub-week tbody tr:nth-child(3){animation-delay:.12s}.pub-week tbody tr:nth-child(n+4){animation-delay:.18s}
.gate img{animation:ring 2.8s ease-out infinite}
@keyframes ring{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--jade) 32%,transparent)}70%,100%{box-shadow:0 0 0 14px transparent}}
input:focus{box-shadow:0 0 0 3px color-mix(in srgb,var(--jade) 20%,transparent)}
.card-tabs{position:relative;padding:4px;border:1px solid var(--line);border-radius:14px;background:var(--soft);gap:4px}
.card-tabs::before{content:"";position:absolute;inset-block:4px;inset-inline-start:4px;width:calc(100% - 8px);border-radius:10px;background:var(--jade);transition:transform .32s cubic-bezier(.2,.8,.2,1);pointer-events:none}
.card-tabs:has(#tab-requests:not([hidden]))::before{width:calc((100% - 12px)/2)}
.card-tabs:has(#tab-requests[aria-selected=true])::before{transform:translateX(calc(-100% - 4px))}
.card-tab{position:relative;border-color:transparent;transition:color .25s}
.card-tab[hidden]{display:none}
.card-tab[aria-selected=true]{background:transparent;border-color:transparent}
@media screen{.stat b{color:var(--jade)}}
@media screen and (max-width:559px){
 .stats{grid-template-columns:repeat(6,1fr);gap:8px}
 .stats .stat{grid-column:span 2;padding:12px 8px;text-align:center}
 .stats .stat:nth-child(n+4){grid-column:span 3}
 .stats .stat:last-child:nth-child(odd){grid-column:span 3}
 .stat b{font-size:22px}.stat span{font-size:11px;line-height:1.4}
}
@media screen and (max-width:520px){
 .pub-week .wslot .wcollege{display:none}
 .pub-week .wslot b{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
}
@media (prefers-reduced-motion:reduce){.stats .stat,.pub-week tbody tr,.gate,.gate img,.card{animation:none}.card-tabs::before,.card-tab{transition:none}}
@media print{.stats .stat,.pub-week tbody tr{animation:none!important}.card-tabs::before{display:none}}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@media print{
  @page{size:A4 portrait;margin:12mm 11mm}
  html,body{background:#fff!important;color:#111!important}
  body{padding:0!important;font-family:"Plex Arabic","Noto Sans Arabic",Tahoma,sans-serif!important;font-synthesis:none}
  .wrap{max-width:none!important}.gate,.tools,.foot,.sub,.since,.term-switch,.card-tabs{display:none!important}
  .card{display:block!important;animation:none!important}.head{margin:0 0 12px;padding:0 0 10px;border-bottom:2px solid #222}
  .head h1{font-size:22px!important;letter-spacing:0!important}.head small,.stat span{color:#555!important}
  .stats{grid-template-columns:repeat(5,1fr)!important;gap:6px;margin-bottom:12px}.stat{padding:8px 10px;border-radius:8px}
  .stat b{font-size:18px;letter-spacing:0}.day{break-inside:avoid;border-radius:8px;margin-bottom:8px}
  .day,.stat{border-color:#bbb;background:#fff}.day>h2{padding:8px 10px}.slot{padding:7px 10px}.slot time{color:#111}
  .pastnote{display:none!important}
  .pub-week{background:#fff;border-radius:0;break-inside:avoid}.pub-week th{color:#111;background:#f0f0ec;border-color:#9aa3a0}
  .pub-week td{border-color:#9aa3a0}.pub-week .wslot b,.pub-week .wslot time{color:#111}.pub-week .wslot small{color:#444}
}
${STAFF_CARD_VISUAL_CSS}
</style>
</head>
<body>
<div class="wrap">
  <div class="gate" id="gate">
    <img src="/schedule-icon.svg" alt="" width="40" height="40" style="display:block;margin:0 auto 12px;border-radius:11px">
    <div class="mark">SCHEDULE</div>
    <h1>بطاقتي</h1>
    <p>${label}<br>اكتب رقمك المدني لعرض جدولك.</p>${demoHint}
    <form class="field" id="form">
      <input id="civil" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="12 رقمًا" aria-label="الرقم المدني">
      <button type="submit" id="go">عرض</button>
    </form>
    <div class="note" id="note" role="status" aria-live="polite"></div>
    <div class="skel" id="gateSkel" aria-hidden="true" hidden><i></i><i></i></div>
    <p class="hint">صفحة للقراءة فقط · لا تحتاج حساباً<br>لا تُعرض أرقام هواتف ولا بيانات زملائك.</p>
  </div>

  <div class="card" id="card">
    <div class="head">
      <div>
        <div class="mark arabic">بطاقتي</div>
        <h1 id="name"></h1>
        <p class="welcome" id="welcome">هذا جدولك للفصل</p>
        <small id="scope"></small>
      </div>
      <div class="head-tools">
        <a id="planMap" class="hbtn" href="#" target="_blank" rel="noopener" hidden aria-label="خريطة خطة القسم" title="خريطة خطة القسم"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4z"/><path d="M9 4v13M15 7v13"/></svg></a>
        <button type="button" id="ics" class="hbtn" hidden aria-haspopup="dialog" aria-expanded="false" aria-controls="sub" aria-label="إضافة إلى التقويم" title="إضافة إلى التقويم"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4M12 13v5M9.5 15.5h5"/></svg></button>
        <button type="button" id="print" class="hbtn" aria-label="طباعة" title="طباعة"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V4h10v5"/><rect x="5" y="9" width="14" height="8" rx="2"/><path d="M8 14h8v6H8z"/></svg></button>
      </div>
    </div>
    <div class="term-switch">
      <label for="termPick">الفصل الدراسي</label>
      <select id="termPick" aria-label="اختر الفصل الدراسي"></select>
    </div>
    <p id="wishesDeadline" hidden style="padding:12px 16px;background:var(--soft);border:1px solid var(--line);border-radius:14px;font-weight:700"></p>
    <div class="approvals" id="approvals" aria-label="حالة اعتماد جدول القسم"></div>
    <div class="stats" id="stats"></div>
    <div class="soon" id="soon" hidden></div>
    <div id="proposalAlerts" aria-live="polite"></div>
    <div class="card-tabs" role="tablist">
      <button type="button" class="card-tab" id="tab-week" role="tab" aria-selected="true">الجدول الأسبوعي</button>
      <button type="button" class="card-tab" id="tab-requests" role="tab" aria-selected="false" hidden>طلب تعديل الجدول</button>
    </div>
    <div id="panel-week">
      <div id="days"></div>
    </div>
    <div id="panel-requests" hidden>
      <div id="requests"></div>
    </div>
    <div class="sheet" id="sub" hidden>
      <div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="subTitle">
        <div class="sheet-grab"></div>
        <div class="sheet-top">
          <span class="mk"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4M12 13v5M9.5 15.5h5"/></svg></span>
          <b id="subTitle">جدولك في تقويمك</b>
          <button type="button" id="subClose" class="hbtn" aria-label="إغلاق"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </div>
        <p class="sheet-note"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2"/><path d="M20 4v5h-5M4 20v-5h5"/></svg><span id="subLife">اشتراك يتابع جدولك من نفسه حتى نهاية الفصل، ولا يحتاج إعادة إضافة بعد كل تعديل.</span></p>
        <a class="opt primary" id="subNow" href="#"><span class="oi"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 3.5c-1 .1-2.2.8-2.8 1.6-.6.7-1.1 1.8-.9 2.8 1.1 0 2.2-.7 2.8-1.5.6-.8 1-1.8.9-2.9z"/><path d="M12 8.5c-1-.1-2.3-.9-3.5-.9C6.6 7.6 5 9.2 5 12.2c0 3.3 2.3 8.3 4.2 8.3 1 0 1.6-.7 2.8-.7s1.7.7 2.8.7c1.5 0 2.8-2.7 3.3-4.1-1.7-.8-2.4-2.4-2.4-3.9 0-1.3.7-2.5 1.8-3.2-.8-1.1-2-1.6-3.1-1.6-1 0-1.6.8-2.4.8z"/></svg></span><span class="t">Apple · آيفون وماك<small>يفتح «اشتراك» في تطبيق التقويم</small></span><svg class="ico go" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></a>
        <a class="opt" id="subGoogle" href="#" target="_blank" rel="noopener"><span class="oi"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12.2c0-.6-.1-1.2-.2-1.7H12v3.3h4.5a3.9 3.9 0 0 1-1.7 2.5"/><path d="M12 20a8 8 0 1 1 5.4-13.9"/></svg></span><span class="t">Google Calendar<small>يفتح صفحة الإضافة في جوجل</small></span><svg class="ico go" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></a>
        <a class="opt" id="subOutlook" href="#" target="_blank" rel="noopener"><span class="oi"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="12" height="14" rx="2"/><circle cx="9" cy="12" r="2.6"/><path d="M15 8h6v8h-6"/></svg></span><span class="t">Outlook<small>حساب شخصي أو حساب الجامعة</small></span><svg class="ico go" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></a>
        <button type="button" class="opt" id="subCopy"><span class="oi"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/></svg></span><span class="t">نسخ رابط الاشتراك<small id="subNote">لأي تطبيق تقويم آخر: «إضافة تقويم ← من رابط».</small></span></button>
        <label class="opt subalarm"><span class="oi"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path d="M10 21h4"/></svg></span><span class="t">تنبيه قبل المحاضرة بربع ساعة</span><input type="checkbox" id="subAlarm"><span class="switch"></span></label>
      </div>
    </div>
    <div class="print-foot" id="printFoot"></div>
    <div class="foot" id="foot"></div>
  </div>
</div>
<script nonce="${nonce}">
${DEMO_COPY_SCRIPT}
${COURSE_COLOR_JS}
${STAFF_CARD_VISUAL_JS}
${CALENDAR_LINKS_CLIENT_JS}
(function(){
  var TOKEN=${JSON.stringify(token)};
  var gate=document.getElementById("gate"),card=document.getElementById("card");
  var note=document.getElementById("note"),go=document.getElementById("go"),civil=document.getElementById("civil");
  var ar=function(n){try{return Number(n||0).toLocaleString("ar-KW-u-nu-latn")}catch(e){return String(n)}};
  /* الكسرُ بنقطةٍ لا بفاصلةٍ عربية: «4٫2» تُقرأ على الشاشة «4,2» كأنها عددان. */
  var hours=function(m){var h=Math.floor(m/60),r=m%60;return r?ar(h)+"."+ar(Math.round(r/6)):ar(h)};
  var esc=function(s){var d=document.createElement("div");d.textContent=s==null?"":String(s);return d.innerHTML};
  var ascii=function(value){return String(value||"")
    .replace(/[٠-٩]/g,function(d){return String("٠١٢٣٤٥٦٧٨٩".indexOf(d))})
    .replace(/[۰-۹]/g,function(d){return String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))});};
  var friendlyDate=function(value,withTime){var d=new Date(value);if(!value||isNaN(d))return "";var date=d.toLocaleDateString("ar-KW-u-nu-latn",{year:"numeric",month:"long",day:"numeric"});if(!withTime)return date;return date+" · "+d.toLocaleTimeString("ar-KW-u-nu-latn",{hour:"2-digit",minute:"2-digit"})};
  civil.addEventListener("input",function(){var v=ascii(civil.value);if(v!==civil.value)civil.value=v;});

  document.getElementById("print").addEventListener("click",function(e){e.preventDefault();window.print()});

  document.getElementById("form").addEventListener("submit",function(event){
    event.preventDefault();
    var value=ascii(civil.value).replace(/[^0-9]/g,"");
    if(value.length!==12){note.textContent="الرقم المدني 12 رقمًا.";return}
    note.textContent="";go.disabled=true;go.textContent="…";document.getElementById("gateSkel").hidden=false;
    fetch("/api/public/staff/"+encodeURIComponent(TOKEN),{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({civil:value})
    }).then(function(r){return r.json().then(function(d){return{ok:r.ok,data:d}})})
      .then(function(res){
        go.disabled=false;go.textContent="عرض";document.getElementById("gateSkel").hidden=true;
        if(!res.ok){try{sessionStorage.removeItem("sk-civil:"+TOKEN)}catch(e){}note.textContent=res.data&&res.data.error?res.data.error:"تعذر العرض";return}
        render(res.data,value);
      })
      .catch(function(){go.disabled=false;go.textContent="عرض";document.getElementById("gateSkel").hidden=true;note.textContent="تعذر الاتصال. تحقق من الإنترنت."});
  });

  var currentCivil="";
  function switchTerm(termId){
    var pick=document.getElementById("termPick");if(pick)pick.disabled=true;
    fetch("/api/public/staff/"+encodeURIComponent(TOKEN),{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({civil:currentCivil,termId:termId})
    }).then(function(r){return r.json().then(function(d){return{ok:r.ok,data:d}})})
      .then(function(res){if(pick)pick.disabled=false;if(res.ok)render(res.data,currentCivil);else if(pick)note.textContent=res.data&&res.data.error?res.data.error:"";})
      .catch(function(){if(pick)pick.disabled=false});
  }

  /* ── «تعديل» و«طلب تعديل الجدول» ──────────────────────────────────────
     كان التبويبُ يختفي كلَّه حين لا يحمل الرابطُ نافذةَ طلبات — وهذا حالُ
     رابط القسم العام دائماً منذ صار شخصياً (a966906) — فلا يجد الأستاذُ بابَ
     التعديل ولا يعرف أين هو. فالبابُ يبقى ظاهراً، وما خلفه يقول الحقيقة:
     يفتح النموذجَ نفسَه بعد التحقق بالرقم المدني، من الرابط الشخصي ومن رابط
     القسم معاً (كما كان قبل a966906). */
  /* تنبيه «لديك مقترح دراسي من القسم» فوق التبويبات، من الروابط الشخصية نفسها. */
  ${PROPOSAL_ALERT_SCRIPT}
  var pbSig="";
  function pbRefresh(links){
    var key=links.map(function(l){return l.linkId}).join(",");
    if(key===pbSig)return;
    pbSig=key;
    pbLoad(links.map(function(l){return l.linkId}),function(items){var box=document.getElementById("proposalAlerts");if(box)box.innerHTML=pbHtml(items)});
  }
  function renderRequests(d){
    var host=document.getElementById("requests");
    /* نافذةٌ مغلقة لا بابَ لها: لا تبويبَ ولا بطاقةَ «انتهت فترة الطلبات».
       ويُكتفى بنافذةٍ واحدة لكل رابط، مع اسم الكلية حين يتشابه اسما القسمين. */
    var seen={};
    var links=(d.requestLinks||[]).filter(function(l){
      if(!l.windowOpen||seen[l.linkId])return false;
      seen[l.linkId]=1;return true;
    });
    requestLinksNow=links;
    pbRefresh(d.requestLinks||[]);
    var tab=document.getElementById("tab-requests");
    if(tab)tab.hidden=!links.length;
    if(!links.length){
      if(tab&&tab.getAttribute("aria-selected")==="true")selectTab("week");
      if(host)host.innerHTML="";
      return;
    }
    if(!host)return;
    host.innerHTML='<div class="requests-panel"><h3>طلب تعديل الجدول</h3>'+
      links.map(function(l){
        var where=l.collegeName?shortCardCollege(l.collegeName):"";
        return '<div class="req-item"><b>'+esc(l.sectionName)+'</b>'+(where?' · '+esc(where):'')+' — نافذة الطلبات مفتوحة حتى <bdi>'+esc(friendlyDate(l.closesAt,false))+'</bdi>'+
          (l.proposed?'<br><span class="req-proposed">مقترح من القسم ينتظر ردّك · '+ar(l.proposed)+'</span>':'')+
          '<br><a class="req-link" href="/r/'+encodeURIComponent(l.linkId)+'" target="_blank">فتح نموذج رغبات الجدول ←</a></div>';
      }).join("")+'</div>';
  }

  var tabWeek=document.getElementById("tab-week");
  var tabRequests=document.getElementById("tab-requests");
  var pWeek=document.getElementById("panel-week");
  var pRequests=document.getElementById("panel-requests");

  function selectTab(which){
    if(tabWeek)tabWeek.setAttribute("aria-selected",which==="week"?"true":"false");
    if(tabRequests)tabRequests.setAttribute("aria-selected",which==="requests"?"true":"false");
    if(pWeek){if(which==="week")pWeek.removeAttribute("hidden");else pWeek.setAttribute("hidden","");}
    if(pRequests){if(which==="requests")pRequests.removeAttribute("hidden");else pRequests.setAttribute("hidden","");}
  }

  if(tabWeek)tabWeek.onclick=function(){selectTab("week");};
  /* «طلب تعديل الجدول» يفتح النموذج مباشرةً: لا شاشةَ وسيطةً فيها شرحٌ وزرّ.
     وإن كان للأستاذ أكثرُ من نافذة، تُعرض قائمتُها ليختار. */
  var requestLinksNow=[];
  if(tabRequests)tabRequests.onclick=function(){
    var pick=requestLinksNow.length===1?requestLinksNow[0]:null;
    if(pick){window.location.href="/r/"+encodeURIComponent(pick.linkId);return;}
    selectTab("requests");
    var panel=document.getElementById("panel-requests");if(panel)panel.scrollIntoView({block:"nearest",behavior:"smooth"});
  };
  /* لا زرّ «تعديل» ثانٍ في الأدوات: تبويب «طلب تعديل الجدول» هو البابُ الوحيد. */

  function visibleCardCollege(value){var name=String(value||"");return /التربية\\s*الأساسية.*بنات/.test(name)?"":name}
  function shortCardCollege(value){return String(value||"").replace(/^\\s*[0-9٠-٩]+\\s*[·\\-–]?\\s*/,"").replace(/^\\s*كلية\\s+/,"").trim()}
  /* «منذ زيارتك الأخيرة» تُحفظ من أول فتحٍ في هذه الجلسة: تبديلُ الفصل يعيد
     الطلب فيسجّل زيارةً جديدة، ولا يجوز أن يمحو ما قيل للأستاذ قبل لحظة. */
  var visitSince=null,visitChanged=false;
  function render(d,value){
    if(visitSince===null){visitSince=d.lastSeenAt||"";visitChanged=Boolean(d.changedSinceLastVisit);}
    currentCivil=value;
    try{sessionStorage.setItem("sk-civil:"+TOKEN,value)}catch(e){}
    var currentTerm = { termId: Number(d.termId || 0) };
    var phase = d.termPhase || ((Boolean(d.liveTermId) && Number(d.termId) === Number(d.liveTermId)) ? "current" : "past");
    var live = phase === "current";
    var calendarOpen = phase !== "past";
    document.getElementById("name").textContent=d.name;
    document.getElementById("scope").textContent=d.college||"";
    var planMap=document.getElementById("planMap");
    if(planMap){if(d.planMapUrl){planMap.href=d.planMapUrl;planMap.hidden=false}else{planMap.hidden=true}}
    var termPick=document.getElementById("termPick");
    if(termPick&&d.availableTerms&&d.availableTerms.length){
      termPick.innerHTML=d.availableTerms.map(function(t){return '<option value="'+t.id+'"'+(t.id===d.termId?' selected':'')+'>'+esc(t.name)+'</option>'}).join("");
      termPick.onchange=function(){switchTerm(Number(termPick.value)||0)};
      /* فصلٌ واحدٌ لا يحتاج منتقياً: يُكتب اسمُه بجانب الكلية ويختفي الاختيار. */
      var termSwitch=termPick.closest(".term-switch");
      if(termSwitch)termSwitch.hidden=d.availableTerms.length<2;
      if(d.availableTerms.length<2&&d.term)document.getElementById("scope").textContent=(d.college?d.college+" · ":"")+d.term;
    }
    /* حالةُ اعتماد كل قسمٍ يدرّس فيه — للقراءة فقط. */
    document.getElementById("approvals").innerHTML=(d.departmentApprovals||[]).map(function(a){
      return '<span data-status="'+esc(a.status)+'">'+esc(a.department)+(a.college?' · '+esc(a.college):'')+' · '+esc(a.label)+'</span>'}).join("");
    /* ما يقع في أسبوعيه القادمين: إلغاءٌ، أو تغطيةٌ له أو منه. */
    var soon=document.getElementById("soon"),upcoming=d.upcomingExceptions||[];
    if(upcoming.length){
      soon.innerHTML='<b>خلال الأسبوعين القادمين</b><ul>'+upcoming.map(function(x){
        return '<li data-kind="'+esc(x.kind)+'"><time dir="ltr">'+esc(x.date)+'</time> · '+esc(x.day)+' — <strong>'+esc(x.course)+'</strong> '+(x.timeRange?'<span style="white-space:nowrap">'+esc(x.timeRange)+'</span> ':'')+'· '+esc(x.text)+'</li>'}).join("")+'</ul>';
      soon.removeAttribute("hidden");
    } else { soon.innerHTML=""; soon.setAttribute("hidden",""); }
    var nouns=d.countNouns||{};
    
    var statItems=[
      ["ساعات المقررات أسبوعياً",ar(d.loadUnits||0)],
      [(nouns.units||"وحدات")+" نصاب",ar(d.loadUnits||0)],
      [nouns.lectures||"محاضرات",ar(d.lectureCount)],
      [nouns.days||"أيام",ar(d.dayCount)],
      [nouns.rooms||"قاعات",ar(d.rooms.length)]
    ];
    document.getElementById("stats").innerHTML=d.lectureCount?skStats(statItems):"";

    var starts=[];d.byDay.forEach(function(day){day.rows.forEach(function(r){if(starts.indexOf(r.start)<0)starts.push(r.start)})});starts.sort();
    var weekTable='<table class="pub-week"><colgroup><col style="width:52px">'+d.byDay.map(function(){return '<col>'}).join("")+
      '</colgroup><thead><tr><th class="t">الوقت</th>'+d.byDay.map(function(day){return '<th>'+esc(day.name)+'</th>'}).join("")+
      '</tr></thead><tbody>'+starts.map(function(start){
        return '<tr><th class="t" dir="ltr">'+esc(start)+'</th>'+d.byDay.map(function(day){
          return '<td>'+day.rows.filter(function(r){return r.start===start}).map(function(row){
            return '<span class="wslot"><b>'+esc(row.name||row.code)+'</b>'+
              /* النطاقُ كما صاغه الخادم بالمُصيغ الواحد (البداية – النهاية، معزولاً LTR). */
              '<time>'+esc(row.timeRange||"")+'</time>'+
              /* المختصرُ هادئ: لا رقمَ مقرّر ولا كلمةَ «كلية» ولا اسمَ قسم،
                 والقاعةُ في سطرٍ يُقصّ داخل الخلية فلا يخرج عن حدودها. */
              [shortCardCollege(visibleCardCollege(row.college))].filter(Boolean).map(esc).map(function(v){return '<small class="wcollege">'+v+'</small>'}).join("")+
              ((row.room||row.hall)?'<small class="wroom" dir="ltr" title="'+esc((row.room||"")+"/"+(row.hall||""))+'">'+esc(row.room||"")+"/<wbr>"+esc(row.hall||"")+'</small>':'')+'</span>';
          }).join("")+'</td>';
        }).join("")+'</tr>';
      }).join("")+'</tbody></table>';
    document.getElementById("days").innerHTML=skWeek(d,esc,function(r){return shortCardCollege(visibleCardCollege(r.college))})+skPrintList(d,esc,d.college==="كل مواقعك"?function(r){return shortCardCollege(visibleCardCollege(r.college))}:null)+weekTable;
    skWeekWire(document.getElementById("days"));
    if(visitChanged&&visitSince&&d.lectureCount) document.getElementById("days").insertAdjacentHTML("afterbegin",
      '<div class="pastnote">تغيّر جدولك منذ زيارتك الأخيرة (<bdi>'+esc(friendlyDate(visitSince,true))+'</bdi>) — راجع جدولك الأسبوعي.</div>');
    if(!d.lectureCount) document.getElementById("days").innerHTML='<div class="pub-empty"><span class="pe-ic">'+skSvg("days")+'</span>لا محاضرات لك في هذا الفصل — جرّب فصلاً آخر من الأعلى.</div>';
    else if(phase === "past") document.getElementById("days").insertAdjacentHTML("afterbegin",
      '<div class="pastnote">فصل سابق — للاطلاع فقط. الإبلاغ متاح في الفصل الحالي.</div>');
    else if(phase === "upcoming") document.getElementById("days").insertAdjacentHTML("afterbegin",
      '<div class="pastnote">فصل قادم — الإبلاغ عن محاضرة يُتاح حين يبدأ الفصل.</div>');

    renderRequests(d);
    selectTab("week");

    /* M3: التقويم يعود — اشتراكٌ ثابتٌ يتبع الأستاذ (لا يموت بإعادة نشر البطاقة)،
       وثلاثة أزرار: Apple (webcal) وGoogle (cid) وOutlook (addfromweb). */
    var calendarOn = calendarOpen && !!(d.calendarFeed||d.calendarKey);
    document.getElementById("ics").hidden = !calendarOn;
    document.getElementById("ics").style.display = calendarOn ? "" : "none";
    if(!calendarOn) document.getElementById("sub").setAttribute("hidden","");

    var base = d.calendarFeed || ("/api/public/ics/"+encodeURIComponent(TOKEN)+"/"+encodeURIComponent(d.calendarKey||""));
    var query = phase === "upcoming" ? ["term="+encodeURIComponent(String(d.termId||""))] : [];
    var alarmBox = document.getElementById("subAlarm");
    var feed = base, https = location.origin + base;
    function retune(){
      var parts = query.concat(alarmBox.checked ? ["alarm=15"] : []);
      feed = base + (parts.length ? "?" + parts.join("&") : "");
      https = location.origin + feed;
      var links = calLinks(https, "جدولي — SCHEDULE");
      document.getElementById("subNow").setAttribute("href", links.apple);
      document.getElementById("subGoogle").setAttribute("href", links.google);
      document.getElementById("subOutlook").setAttribute("href", links.outlook);
    }
    alarmBox.onchange = retune;
    var ics = document.getElementById("ics"), panel = document.getElementById("sub");
    retune();
    function sheet(open){
      if(open) panel.removeAttribute("hidden"); else panel.setAttribute("hidden","");
      ics.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.classList.toggle("sk-lock", open);
      if(open){var f=document.getElementById("subNow");if(f)f.focus()} else ics.focus();
    }
    ics.onclick = function(e){ e.preventDefault(); sheet(panel.hasAttribute("hidden")); };
    document.getElementById("subClose").onclick = function(){ sheet(false); };
    panel.onclick = function(e){ if(e.target===panel) sheet(false); };
    document.onkeydown = function(e){ if(e.key==="Escape" && !panel.hasAttribute("hidden")) sheet(false); };

    document.getElementById("subCopy").onclick = function(){
      var note = document.getElementById("subNote"), said = "تم نسخ الرابط.";
      var done = function(){ note.textContent = said; setTimeout(function(){
        note.textContent = "لأي تطبيق تقويم آخر: «إضافة تقويم ← من رابط»."; }, 4000); };
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(https).then(done, function(){ note.textContent = https; });
      } else { note.textContent = https; }
    };
    try{
      var until=new Intl.DateTimeFormat("ar-KW-u-nu-latn",{day:"numeric",month:"long",year:"numeric"}).format(new Date(d.expiresAt));
      var deadlineNode=document.getElementById("wishesDeadline");
      deadlineNode.hidden=!d.requestsCloseAt;
      if(d.requestsCloseAt){
        var deadlineDate=new Intl.DateTimeFormat("ar-KW-u-nu-latn",{day:"numeric",month:"long",year:"numeric",timeZone:"Asia/Kuwait"}).format(new Date(d.requestsCloseAt));
        deadlineNode.textContent="آخر موعد لإرسال الرغبات: "+deadlineDate+(Date.parse(d.requestsCloseAt)<Date.now()?" — انتهى استقبال الرغبات":"");
      }
      var pf=document.getElementById("printFoot");if(pf)pf.textContent="طُبع من SCHEDULE بتاريخ "+friendlyDate(new Date().toISOString(),false)+" · جدولٌ للقراءة، والمرجع جدولُ القسم المعتمد";
      document.getElementById("foot").textContent="قراءة الجدول متاحة حتى نهاية الفصل ("+until+") · للقراءة فقط";
      var life=document.getElementById("subLife");
      if(life) life.textContent="اشتراك يتابع جدولك من نفسه حتى "+until+" (نهاية الفصل)، ولا يحتاج إعادة إضافة بعد كل تعديل.";
    }catch(e){}
    gate.style.display="none";card.style.display="block";
    window.scrollTo(0,0);
  }
  /* العودةُ من صفحة الطلب لا تطلب الرقم ثانيةً: يُحفظ في هذه الجلسة وحدها (يزول بإغلاق التبويب). */
  try{var saved=sessionStorage.getItem("sk-civil:"+TOKEN);
    if(saved&&/^[0-9]{12}$/.test(saved)){civil.value=saved;var fm=document.getElementById("form");if(fm.requestSubmit)fm.requestSubmit();else go.click()}}catch(e){}
})();
</script>
</body>
</html>`;
}
