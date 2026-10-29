/**
 * ── صفحةُ «حالة طلبي» للطالب ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { DEMO_COPY_SCRIPT } from "../publicKit";
import { PUBLIC_LIGHT_VARS } from "../publicTheme";

/**
 * صفحةُ «حالة طلبي».
 *
 * منفصلةٌ عن صفحة الاستبيان عن قصد: تلك تُملأ مرّةً، وهذه تُفتح مرّاتٍ في
 * أسبوع التسجيل. ودمجُهما كان يعني أن يمرّ من يريد السؤالَ وحده على خطوات
 * التعبئة كلها ليصل إلى سطرٍ واحد.
 */
export function studentCaseStatusPage(token: string, nonce: string, demoHint = ""): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>حالة طلبي</title><link rel="icon" href="/schedule-icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/schedule-icon-192.png">
<style>/* SCHEDULE_PUBLIC_PLEX_ARABIC */@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:400;font-display:swap;src:url("/fonts/plex-arabic-arabic-400.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:500;font-display:swap;src:url("/fonts/plex-arabic-arabic-500.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:600;font-display:swap;src:url("/fonts/plex-arabic-arabic-600.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:700;font-display:swap;src:url("/fonts/plex-arabic-arabic-700.woff2") format("woff2")}
:root{${PUBLIC_LIGHT_VARS};--ok:var(--jade)}
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;background:radial-gradient(circle at 90% 0,var(--accent-soft) 0,transparent 32%),var(--bg);color:var(--ink);font:400 16px/1.65 "Plex Arabic","Segoe UI","Noto Sans Arabic",Tahoma,sans-serif;font-synthesis:none;font-kerning:normal}
.wrap{max-width:520px;margin:0 auto;padding:22px 16px calc(32px + env(safe-area-inset-bottom,0px))}
.mark{display:block;width:36px;height:36px;margin:0 0 12px;border-radius:10px}@media screen{.mark{width:56px;height:56px;margin:6px 0 16px;border-radius:16px;box-shadow:0 10px 24px -10px color-mix(in srgb,var(--ink) 40%,transparent);animation:ringp 2.8s ease-out infinite}}@keyframes ringp{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--jade) 30%,transparent)}70%,100%{box-shadow:0 0 0 13px transparent}}input:focus,select:focus,textarea:focus{outline:none;border-color:var(--jade);box-shadow:0 0 0 3px color-mix(in srgb,var(--jade) 18%,transparent)}input,select,textarea{transition:border-color .16s,box-shadow .16s}@media (prefers-reduced-motion:reduce){.mark{animation:none}input,select,textarea{transition:none}}
.panel{background:color-mix(in srgb,var(--card) 92%,transparent);border:1px solid var(--line);border-radius:22px;padding:18px;margin-top:14px;box-shadow:0 20px 50px color-mix(in srgb,var(--ink) 12.16%,transparent)}
.panel label:first-child{margin-top:0}
h1{font-size:21px;margin:0 0 4px}
.sub{color:var(--muted);font-size:13px;margin:0 0 20px}
label{display:block;font-size:13px;color:var(--muted);margin-bottom:7px}
input{width:100%;padding:13px;border-radius:12px;border:1px solid var(--line);font:inherit;
font-size:17px;background:var(--card);text-align:center;letter-spacing:.06em}
button{width:100%;margin-top:11px;padding:14px;border-radius:12px;border:0;background:var(--ok);
color:var(--on-accent);font:inherit;font-size:16px;font-weight:700;cursor:pointer}
button:disabled{opacity:.55;cursor:not-allowed}
.err{background:var(--bad-soft);color:var(--bad);padding:11px 13px;border-radius:11px;margin-top:13px;font-size:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;margin-top:18px}
.ref{font-size:25px;font-weight:700;letter-spacing:.09em;text-align:center;margin:0 0 4px}
.reflabel{text-align:center;color:var(--muted);font-size:12px;margin:0 0 15px}
ul{list-style:none;margin:0;padding:0}
li{display:flex;justify-content:space-between;gap:11px;padding:9px 0;border-top:1px solid var(--line);font-size:14px}
li:first-child{border-top:0}
li small{color:var(--muted);flex:none}
li span{display:flex;flex-direction:column;gap:3px}
.st{font-style:normal;font-size:12px;color:var(--muted)}
.st[data-s=registered]{color:var(--ok);font-weight:700}
.st[data-s=rejected]{color:var(--bad);font-weight:700}
.st[data-s=committee-rejected]{color:var(--bad);font-weight:700}
.st[data-s]::before{content:"";display:inline-block;inline-size:7px;block-size:7px;border-radius:50%;margin-inline-end:6px;vertical-align:1px;background:var(--gold,var(--muted))}
.st[data-s=registered]::before{background:var(--ok)}
.st[data-s=rejected]::before,.st[data-s=committee-rejected]::before{background:var(--bad)}
.st[data-s=dropped]::before{background:var(--line-strong)}
.note{margin-top:15px;font-size:12.5px;color:var(--muted);line-height:1.6}
.sub,.reflabel,.st{font-size:13px}
.empty{text-align:center;color:var(--muted);padding:26px 8px;font-size:14px}
label.gap{margin-top:13px}
.help{display:block;margin-top:6px;font-size:12px;color:var(--muted)}
.case{margin:0 0 12px;padding:11px 13px;border-radius:11px;background:var(--soft);font-size:14px;font-weight:600}
.case[data-s=registered]{color:var(--ok)}
.case[data-s=rejected],.case[data-s=committee-rejected]{color:var(--bad);background:var(--bad-soft)}
.case small{font-weight:400;color:var(--ink)}
.steps{display:flex;align-items:center;margin:2px 14px 14px}.steps i{flex:none;display:grid;place-items:center;inline-size:26px;block-size:26px;border-radius:50%;border:2px solid var(--line-strong);background:var(--card);color:transparent}.steps i svg{inline-size:14px;block-size:14px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.steps b{flex:1;block-size:2px;border-radius:2px;background:var(--line-strong)}.steps i[data-k=done]{background:var(--ok);border-color:var(--ok);color:#fff}.steps i[data-k=bad]{background:var(--bad);border-color:var(--bad);color:#fff}.steps i[data-k=now]{border-color:var(--ok);box-shadow:0 0 0 4px var(--accent-soft)}.steps b[data-k=done]{background:var(--ok)}
.steps b{position:relative;overflow:hidden}.steps b[data-k=done]{background:var(--line-strong)}.steps b[data-k=done]::after{content:"";position:absolute;inset:0;background:var(--ok);transform-origin:right center;animation:stepFill .6s cubic-bezier(.3,.7,.2,1) both}.steps b:nth-child(2)::after{animation-delay:.15s}.steps b:nth-child(4)::after{animation-delay:.85s}.steps i:nth-child(3){animation-delay:.6s}.steps i:nth-child(5){animation-delay:1.2s}.steps i[data-k=done] svg,.steps i[data-k=bad] svg{stroke-dasharray:18;animation:stepCheck .4s ease-out .1s both}.steps i:nth-child(3) svg{animation-delay:.6s}.steps i:nth-child(5) svg{animation-delay:1.3s}.steps i[data-k=now]{animation:stepPulse 2.4s ease-in-out 1.2s infinite}@keyframes stepFill{from{transform:scaleX(0)}to{transform:scaleX(1)}}@keyframes stepCheck{from{stroke-dashoffset:18}to{stroke-dashoffset:0}}@keyframes stepPulse{0%,100%{box-shadow:0 0 0 4px var(--accent-soft)}50%{box-shadow:0 0 0 9px transparent}}@media (prefers-reduced-motion:reduce){.steps *,.steps *::before,.steps *::after{animation:none!important}}@media print{.steps *,.steps *::before,.steps *::after{animation:none!important}}
</style></head><body><div class="wrap">
<img class="mark" src="/schedule-icon.svg" alt="" width="36" height="36">
<h1>حالة طلبي</h1>
<p class="sub">أدخل رقمك المدني ورقم الحالة لترى ما أرسلتَه إلى القسم.</p>${demoHint}
<section class="panel">
<label for="civil">الرقم المدني</label>
<input id="civil" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="12 رقمًا">
<label for="ref" class="gap">رقم الحالة</label>
<input id="ref" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="16" placeholder="الرقم الذي ظهر لك عند الإرسال" aria-describedby="refHelp">
<small id="refHelp" class="help">فقدت رقم الحالة؟ راجع القسم. لا تُعرض الحالة بالرقم المدني وحده.</small>
<button id="go" type="button">اعرض حالتي</button>
</section>
<div id="out" aria-live="polite"></div>
</div>
<script nonce="${nonce}">${DEMO_COPY_SCRIPT}(function(){
var TOKEN=${JSON.stringify(token)},box=document.getElementById("civil"),refBox=document.getElementById("ref"),
go=document.getElementById("go"),out=document.getElementById("out");
/* رقمُ الحالة يصل من صفحة الإرسال في جزء الرابط بعد # — لا يُرسَل إلى الخادم ولا يُحفظ. */
try{var fromHash=decodeURIComponent(String(location.hash||"").slice(1));if(fromHash)refBox.value=fromHash.toUpperCase().slice(0,16)}catch(e){}
var STATE={"awaiting-registration":"وافقت عليه لجنة القسم وسلّمته للتسجيل","awaiting-signatures":"وافقت عليه لجنة القسم · بانتظار اكتمال اعتماد جدول القسم","committee-rejected":"لم توافق عليه لجنة القسم","registered":"سجّله التسجيل","rejected":"ردّه التسجيل"};
var TYPE={"new-course":"طلب فتح مقرر","course-conflict":"تعارض مقررين","graduate":"خريج / متوقع تخرجه"};
var CASE={"pending":"وصل إلى القسم وينتظر نظر لجنة القسم","approved":"وافقت عليه لجنة القسم وسلّمته للتسجيل","awaiting-signatures":"وافقت عليه لجنة القسم · بانتظار اكتمال اعتماد جدول القسم","committee-rejected":"لم توافق عليه لجنة القسم","registered":"نفّذه التسجيل","rejected":"ردّه التسجيل"};
var REASON={"no-seat":"لا مقاعد","prerequisite":"متطلّب سابق","level":"المستوى",
"conflict":"تعارض في جدولك","closed":"الشعبة مغلقة","other":"سبب آخر",
"not-eligible":"لا تنطبق عليك الشروط","not-in-plan":"ليس من خطتك الدراسية","duplicate":"طلب مكرر أو سبق تسجيله"};
function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){
return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
/* الأرقام العربية تُقبل كما تُكتب: من يكتب «٢٩٠…» أدخل رقمه، لا خطأً. */
function digits(v){return String(v||"").replace(/[٠-٩]/g,function(d){
return String("٠١٢٣٤٥٦٧٨٩".indexOf(d))}).replace(/[۰-۹]/g,function(d){
return String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))}).replace(/\\D/g,"")}
box.addEventListener("input",function(){var v=digits(box.value).slice(0,12);if(v!==box.value)box.value=v});
function dt(iso){if(!iso)return "";var d=new Date(iso);return isNaN(d)?"":
d.toLocaleDateString("ar-KW-u-nu-latn",{year:"numeric",month:"long",day:"numeric"})}
function fail(m){out.innerHTML='<div class="err" role="alert">'+esc(m)+'</div>'}
function caseLine(d){
 var dec=d.caseDecision||{},last=dec.registrar||dec.committee,st=d.caseStatus||"pending";
 return '<p class="case" data-s="'+esc(st)+'">'+esc(CASE[st]||CASE.pending)+
  (last&&last.reason?' — '+esc(REASON[last.reason]||last.reason):'')+
  (last&&last.note?'<br><small>'+esc(last.note)+'</small>':'')+'</p>'}
/* شريطُ مراحل الحالة: وصل إلى القسم ← لجنة القسم ← التسجيل، مرسومٌ من الحالة الفعلية نفسها؛ النصُّ تحته هو المعنى. */
function stepsHtml(st){
 var ok='<svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7"/></svg>',no='<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
 var c=st==="pending"?"now":st==="committee-rejected"?"bad":"done";
 var r=st==="registered"?"done":st==="rejected"?"bad":st==="approved"?"now":"";
 return '<div class="steps" aria-hidden="true"><i data-k="done">'+ok+'</i><b data-k="'+(c==="now"?"":"done")+'"></b><i data-k="'+c+'">'+(c==="bad"?no:ok)+'</i><b data-k="'+(r==="done"||r==="bad"?"done":"")+'"></b><i data-k="'+r+'">'+(r==="bad"?no:ok)+'</i></div>'}
function show(d){
 if(!d.found){out.innerHTML='<div class="card"><div class="empty">'+
  'لا يوجد طلبٌ بهذا الرقم المدني ورقم الحالة في '+esc(d.term||"هذا الفصل")+'.<br>'+
  'إن كنت قد عبّأت الاستبيان من رابطٍ آخر، افتح ذلك الرابط.</div></div>';return}
 out.innerHTML='<div class="card"><p class="ref">'+esc(d.caseRef)+'</p>'+
  '<p class="reflabel">رقم حالتك · '+esc(d.term)+(TYPE[d.requestType]?' · '+esc(TYPE[d.requestType]):'')+'</p>'+
  (d.caseLevel?stepsHtml(d.caseStatus||'pending')+caseLine(d):'')+
  '<ul>'+(d.courses||[]).map(function(c){
   return '<li><span>'+esc(c.name)+(c.state?'<i class="st" data-s="'+esc(c.state)+'">'+
    esc(STATE[c.state]||c.state)+(c.reason?' — '+esc(REASON[c.reason]||c.reason):'')+
    (c.note?' · '+esc(c.note):'')+'</i>':'')+(c.dropped?'<i class="st" data-s="dropped">'+esc(c.dropped)+'</i>':'')+'</span><small>'+esc(c.code)+'</small></li>'}).join("")+'</ul>'+
  '<p class="note">وصل طلبك إلى القسم يوم '+esc(dt(d.submittedAt))+'.<br>'+
  'هذه حالةُ طلبك عند القسم، وليست تسجيلاً في النظام الأكاديمي. '+
  'وإذا غيّرت اختيارك، افتح رابط الاستبيان وأرسل من جديد فيُحدَّث طلبك.</p></div>'}
function run(){
 var civil=digits(box.value);
 if(civil.length!==12)return fail("أدخل الرقم المدني من 12 رقماً");
 var ref=String(refBox.value||"").trim().toUpperCase();
 if(ref.length<6)return fail("أدخل رقم الحالة كما ظهر لك عند الإرسال");
 go.disabled=true;go.textContent="يقرأ…";out.innerHTML="";
 fetch("/api/public/survey/"+encodeURIComponent(TOKEN)+"/my-case",{method:"POST",
  headers:{"Content-Type":"application/json"},body:JSON.stringify({civil:civil,caseRef:ref})})
 .then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d}})})
 .then(function(x){go.disabled=false;go.textContent="اعرض حالتي";
  if(!x.ok)return fail(x.d.error||"تعذّر القراءة");show(x.d)})
 .catch(function(){go.disabled=false;go.textContent="اعرض حالتي";fail("تعذّر الاتصال.")})}
go.onclick=run;
box.addEventListener("keydown",function(e){if(e.key==="Enter")run()});
refBox.addEventListener("keydown",function(e){if(e.key==="Enter")run()});
})();</script></body></html>`;
}
