/**
 * ── صفحةُ التحقّق من التوقيع ────────────────────────────────────────────────
 *
 * الرمزُ (ستّةُ محارف) يُعطى للأستاذ حين يرسل طلبه، ليُطابَق به بعد شهرين ما في ورقةٍ
 * أو رسالةٍ بما في النظام. لكنّ أستاذاً قد ينسى الرمز، ولا يصحّ أن تُغلق الصفحةُ دونه
 * وهو صاحبُ التوقيع. فالمفتاحُ هو **رقمُه المدنيّ** كما في التوقيع نفسِه، والرمزُ
 * **اختياريٌّ**: إن كتبه طُوبق به توقيعٌ بعينه، وإن نسيه عُرضت له توقيعاتُه كلُّها ومعها
 * رموزُها.
 *
 * وما فيها مقصودٌ كما هو:
 *   - **لا تُخزِّن الرقم.** يُرسل مرّةً للمطابقة ويُمحى من الحقل ولا يُحفظ في المتصفّح.
 *   - **تقول ما وُقّع عليه لحظتَه** لا ما صار إليه الطلب بعدها: قرارُ القسم اللاحق
 *     ليس من التوقيع، فلا يظهر هنا.
 *   - **لا تدّعي ما لا تعرفه.** توقيعٌ قديمٌ لم تُحفظ بنودُه يُقال عنه ذلك صراحةً.
 *   - **رمزٌ لا يطابق لا يُسقط الباب**: يُقال إنه لا يطابق وتُعرض له توقيعاتُه.
 *
 * النصُّ داخل String.raw: لا علامةَ اقتباسٍ مائلة ولا ‎${‎ داخل السكربت.
 */
import { ARABIC_COUNT_SCRIPT } from "../utils/arabicCount";
import { PUBLIC_FONT_FACES } from "./publicKit";
import { PUBLIC_LIGHT_VARS } from "./publicTheme";

const CSS = String.raw`
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;background:var(--bg);color:var(--ink);font:400 16px/1.7 "Plex Arabic","Segoe UI","Noto Sans Arabic",Tahoma,sans-serif;font-synthesis:none;-webkit-text-size-adjust:100%}
button,input{font:inherit}
.wrap{max-width:560px;margin:0 auto;padding:28px 16px 64px}
.brand{font:600 13px/1 system-ui;letter-spacing:.24em;color:var(--brass);margin:0 2px 14px}
h1{font-size:23px;line-height:1.4;margin:0 0 6px;letter-spacing:-.01em}
.lead{margin:0 0 18px;color:var(--muted);font-size:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px;box-shadow:0 10px 30px rgba(22,57,40,.06)}
label{display:grid;gap:6px;margin:0 0 14px;font-size:13px;font-weight:600;color:var(--muted)}
label small{font-weight:400;font-size:12px}
input{width:100%;min-height:50px;padding:10px 13px;border:1px solid var(--line-strong);border-radius:12px;background:#fff;color:var(--ink);font-size:18px;letter-spacing:.14em;text-align:center;direction:ltr}
input:focus{outline:3px solid rgba(31,107,92,.18);border-color:var(--accent)}
input::placeholder{color:#5f6e66;letter-spacing:.04em;font-size:14px;opacity:1}
.go{width:100%;min-height:52px;border:0;border-radius:13px;background:var(--accent);color:var(--on-accent);font-weight:700;font-size:16px;cursor:pointer}
.go:disabled{opacity:.55;cursor:not-allowed}
.note{margin:12px 2px 0;font-size:12px;color:var(--muted);line-height:1.7;text-align:center}
.err{margin:0 0 14px;padding:11px 13px;border-radius:12px;background:var(--bad-soft);color:var(--bad);font-size:14px;font-weight:600}
.ok,.warn{display:flex;align-items:center;gap:10px;margin:0 0 14px;padding:11px 13px;border-radius:12px;font-weight:700;font-size:14.5px;line-height:1.6}
.ok{background:var(--accent-soft);color:var(--accent)}
.warn{background:#fff7e6;color:#5b4520;border:1px solid #e3c88f}
.tick{flex:none;width:26px;height:26px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;font-size:15px}
.warn .tick{background:#a8741a}
dl{margin:0 0 14px;display:grid;grid-template-columns:auto 1fr;gap:8px 14px;font-size:14px}
dt{color:var(--muted)}dd{margin:0;font-weight:600}
.num{direction:ltr;unicode-bidi:isolate;display:inline-block}
.sigs{display:grid;gap:10px}
.sig{border:1px solid var(--line);border-radius:14px;background:var(--card2);padding:12px 13px}
.sig[data-hit="1"]{border-color:var(--accent);background:var(--accent-soft)}
.sig>summary{position:relative;cursor:pointer;list-style:none;min-height:44px;display:block;padding-inline-end:24px}
.sig>summary::-webkit-details-marker{display:none}
.sig>summary::after{content:"";position:absolute;inset-inline-end:4px;top:50%;width:8px;height:8px;border:solid var(--muted);border-width:0 2px 2px 0;transform:translateY(-75%) rotate(45deg);transition:transform .15s}
.sig[open]>summary::after{transform:translateY(-25%) rotate(-135deg)}
.sig>summary:focus-visible{outline:3px solid rgba(31,107,92,.3);outline-offset:3px;border-radius:10px}
.more{display:block;margin-top:2px;color:var(--accent);font-size:12px;font-weight:600}
@media (prefers-reduced-motion:reduce){.sig>summary::after{transition:none}}
.sig-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 12px;width:100%}
.sig-head b{font-size:15px}
.sig-head small{color:var(--muted);font-size:12.5px}
.code{display:inline-block;padding:2px 10px;border-radius:8px;background:var(--soft);font:700 15px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em;direction:ltr;unicode-bidi:isolate}
.items{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:8px}
.items li{padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--card);font-size:14px}
.items b{display:block;font-size:15px}
.items small{display:block;color:var(--muted);margin-top:3px}
.tag{display:inline-block;margin-inline-end:6px;padding:1px 8px;border-radius:999px;background:var(--soft);font-size:11.5px;font-weight:700;color:var(--muted)}
.caveat{margin:10px 0 0;padding:10px 12px;border-radius:12px;background:#fff7e6;border:1px solid #e3c88f;color:#5b4520;font-size:13px}
.plain{margin:10px 0 0;font-size:13.5px;color:var(--muted)}
.again{margin-top:14px;background:none;border:1px solid var(--line-strong);color:var(--ink);min-height:46px;width:100%;border-radius:12px;cursor:pointer;font-weight:600}
[hidden]{display:none!important}
@media print{.go,.again,form{display:none!important}.card{box-shadow:none}.sig{break-inside:avoid}}
`;

const SCRIPT = String.raw`
(function(){
__COUNT__
var CODE0=__CODE__,HINT=__HINT__;
var form=document.getElementById("f"),codeEl=document.getElementById("code"),civilEl=document.getElementById("civil"),
 msg=document.getElementById("msg"),out=document.getElementById("out"),go=document.getElementById("go");
var DIG={"٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9","۰":"0","۱":"1","۲":"2","۳":"3","۴":"4","۵":"5","۶":"6","۷":"7","۸":"8","۹":"9"};
function latin(v){return String(v||"").replace(/[٠-٩۰-۹]/g,function(c){return DIG[c]})}
function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
var ACTION={add:"إضافة",change:"تعديل",delete:"حذف"};
function when(iso){var d=new Date(iso);if(isNaN(d))return "";
 return d.toLocaleDateString("ar-KW-u-nu-latn",{day:"numeric",month:"long",year:"numeric"})+" · "+d.toLocaleTimeString("ar-KW-u-nu-latn",{hour:"2-digit",minute:"2-digit"})}
if(CODE0)codeEl.value=CODE0;
codeEl.addEventListener("input",function(){codeEl.value=latin(codeEl.value).toUpperCase().replace(/[^0-9A-Z]/g,"").slice(0,6)});
civilEl.addEventListener("input",function(){civilEl.value=latin(civilEl.value).replace(/\D/g,"").slice(0,12)});
function fail(text){msg.innerHTML='<div class="err" role="alert">'+esc(text)+'</div>';out.hidden=true;form.hidden=false;go.disabled=false}
function itemsHtml(s){
 if(!s.hasItems)return '<div class="caveat">هذا توقيعٌ قديم لم تُحفظ فيه بنودُ الطلب لحظةَ التوقيع، فلا يمكن عرضُ ما وُقّع عليه بالضبط. التاريخ والرمز صحيحان.</div>';
 var list=(s.items||[]).map(function(it){
  return '<li><b><span class="tag">'+esc(ACTION[it.action]||it.action)+'</span>'+esc(it.courseName||"المقرر")+'</b>'+
   (it.collegeName?'<small>'+esc(it.collegeName)+'</small>':'')+
   (it.was?'<small>كان: <span class="num">'+esc(it.was)+'</span></small>':'')+
   '<small>'+(it.action==="delete"?'':'المطلوب: ')+'<span class="num">'+esc(it.asked||"")+'</span></small></li>'}).join("");
 return (list?'<ul class="items">'+list+'</ul>':'<p class="plain">أرسل جدوله كما هو بلا تعديلات.</p>')+
  (s.keptCount?'<p class="plain">مواعيد أبقاها كما هي: <span class="num">'+esc(s.keptCount)+'</span></p>':'')}
function sigHtml(s,k,hit){
 var head='<div class="sig-head"><span><b>'+esc(s.termName||"")+'</b><br><small>'+esc(when(s.signedAt))+'</small></span><span class="code">'+esc(s.code)+'</span></div>';
 /* الأولُ مفتوح، وما بعده مطويّ: صفحةٌ قصيرة لمن له توقيعٌ واحد، ومنظّمة لمن له أكثر. */
 return k===0?'<div class="sig" data-hit="'+(hit?1:0)+'">'+head+itemsHtml(s)+'</div>'
  :'<details class="sig" data-hit="'+(hit?1:0)+'"><summary>'+head+'<small class="more">اضغط لعرض ما وُقّع عليه</small></summary>'+itemsHtml(s)+'</details>'}
function show(d){
 msg.innerHTML="";form.hidden=true;out.hidden=false;
 var sigs=d.signatures||[],name=sigs[0]&&sigs[0].instructorName||"";
 var banner=d.matchedCode?'<div class="ok"><span class="tick" aria-hidden="true">✓</span>الرمز مطابقٌ لتوقيعٍ باسمك</div>'
  :d.codeGiven?'<div class="warn"><span class="tick" aria-hidden="true">!</span><span>الرمز الذي كتبتَه لا يطابق أيّاً من توقيعاتك. لا بأس — هذه توقيعاتك المسجّلة ورموزُها.</span></div>'
  :'<div class="ok"><span class="tick" aria-hidden="true">✓</span>المسجَّل باسمك: '+esc(countOf(d.count,AR.signature))+'</div>';
 out.innerHTML=banner+(name?'<dl><dt>الأستاذ</dt><dd>'+esc(name)+'</dd></dl>':'')+
  '<div class="sigs">'+sigs.map(function(s,k){return sigHtml(s,k,d.matchedCode&&s.code===d.matchedCode)}).join("")+'</div>'+
  '<p class="note">هذا ما وُقّع عليه لحظةَ التوقيع. ما قرّره القسم بعد ذلك ليس جزءاً منه، ولا يظهر هنا.</p>'+
  '<button type="button" class="again" id="again">تحقّق مرةً أخرى</button>';
 document.getElementById("again").onclick=function(){out.hidden=true;form.hidden=false;codeEl.value="";civilEl.value="";go.disabled=false;civilEl.focus()}}
form.addEventListener("submit",function(e){e.preventDefault();
 var code=codeEl.value,civil=civilEl.value;
 if(civil.length!==12){fail("اكتب رقمك المدني كاملاً: اثنا عشر رقماً.");return}
 if(code&&code.length!==6){fail("الرمز ستّة أحرف وأرقام. اتركه فارغاً إن لم تتذكّره: يكفي رقمك المدني.");return}
 go.disabled=true;msg.innerHTML="";
 fetch("/api/public/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({civil:civil,code:code||undefined,hint:HINT||undefined})})
 .then(function(r){return r.json().then(function(d){return{ok:r.ok,status:r.status,d:d}})})
 .then(function(x){civilEl.value="";if(!x.ok){fail(x.d.error||"تعذّر التحقّق.");return}show(x.d)})
 .catch(function(){fail("تعذّر الاتصال. تحقّق من الإنترنت.")})});
civilEl.focus();
})();
`;

/** تُستدعى من server.ts عبر /verify و/verify/:code. الرمزُ والتلميحُ يدخلان السكربت JSON. */
export function signatureVerifyPage(code: string, hint: string, nonce: string): string {
  const lit = (v: string) => JSON.stringify(String(v)).replace(/</g, "\\u003c");
  const clean = String(code || "").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 6);
  const script = SCRIPT
    .replace("__COUNT__", () => ARABIC_COUNT_SCRIPT)
    .replace("__CODE__", () => lit(clean))
    .replace("__HINT__", () => lit(String(hint || "").slice(0, 120)));
  return `<!doctype html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="light">
<title>التحقّق من توقيعك — SCHEDULE</title>
<link rel="icon" href="/schedule-icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/schedule-icon-192.png">
<style>/* SCHEDULE_PUBLIC_PLEX_ARABIC */${PUBLIC_FONT_FACES}:root{${PUBLIC_LIGHT_VARS}}${CSS}</style></head><body>
<div class="wrap"><p class="brand">SCHEDULE</p><h1>التحقّق من توقيعك</h1>
<p class="lead">اكتب رقمك المدني لترى ما وقّعتَ عليه ورمزَ كلّ توقيع. إن كان معك رمزٌ مطبوعٌ فاكتبه لمطابقته، وإن نسيتَه فلا يضرّ.</p>
<div class="card"><div id="msg"></div>
<form id="f" autocomplete="off" novalidate>
<label>رقمك المدني<input id="civil" inputmode="numeric" maxlength="12" placeholder="12 رقماً" aria-label="رقمك المدني، اثنا عشر رقماً"></label>
<label>رمز التوقيع <small>(اختياري — إن كان معك)</small><input id="code" inputmode="text" autocapitalize="characters" maxlength="6" placeholder="ستّة أحرف" aria-label="رمز التوقيع، اختياري، ستة أحرف وأرقام"></label>
<button class="go" id="go" type="submit">تحقّق</button>
<p class="note">الرقم المدني يُستعمل للمطابقة مرةً واحدة ولا يُحفظ.</p></form>
<div id="out" hidden></div></div></div>
<noscript>تحتاج هذه الصفحة إلى تفعيل جافاسكربت في المتصفح.</noscript>
<script nonce="${nonce}">${script}</script></body></html>`;
}
