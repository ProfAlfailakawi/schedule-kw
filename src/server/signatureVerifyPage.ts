/**
 * ── صفحةُ التحقّق من رمز التوقيع ────────────────────────────────────────────
 *
 * الرمزُ (ستّةُ محارف) يُعطى للأستاذ حين يرسل طلبه، ليُطابَق به بعد شهرين ما في
 * ورقةٍ أو رسالةٍ بما في النظام. وكان بلا مكانٍ يُطابَق فيه. هذه الصفحةُ مكانُه:
 * رمزٌ ورقمٌ مدنيّ، وما وُقّع عليه بالضبط.
 *
 * وما فيها مقصودٌ كما هو:
 *   - **لا تكشف أيَّ الاثنين أخطأ.** رمزٌ لا وجود له ورقمٌ لا يطابقه يعطيان الجوابَ
 *     نفسه بالنصّ نفسه، فلا تصير الصفحةُ طريقاً لمعرفة أن رمزاً ما صحيح.
 *   - **لا تُخزِّن الرقم.** يُرسل مرّةً للمطابقة ويُمحى من الحقل ولا يُحفظ في المتصفّح.
 *   - **تقول ما وُقّع عليه لحظتَه** لا ما صار إليه الطلب بعدها: قرارُ القسم اللاحق
 *     ليس من التوقيع، فلا يظهر هنا.
 *   - **لا تدّعي ما لا تعرفه.** توقيعٌ قديمٌ لم تُحفظ بنودُه يُقال عنه ذلك صراحةً.
 *
 * النصُّ داخل String.raw: لا علامةَ اقتباسٍ مائلة ولا ‎${‎ داخل السكربت.
 */
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
input{width:100%;min-height:50px;padding:10px 13px;border:1px solid var(--line-strong);border-radius:12px;background:#fff;color:var(--ink);font-size:18px;letter-spacing:.14em;text-align:center;direction:ltr}
input:focus{outline:3px solid rgba(31,107,92,.18);border-color:var(--accent)}
input::placeholder{color:#5f6e66;letter-spacing:.04em;font-size:14px;opacity:1}
.go{width:100%;min-height:52px;border:0;border-radius:13px;background:var(--accent);color:var(--on-accent);font-weight:700;font-size:16px;cursor:pointer}
.go:disabled{opacity:.55;cursor:not-allowed}
.note{margin:12px 2px 0;font-size:12px;color:var(--muted);line-height:1.7;text-align:center}
.err{margin:0 0 14px;padding:11px 13px;border-radius:12px;background:var(--bad-soft);color:var(--bad);font-size:14px;font-weight:600}
.ok{display:flex;align-items:center;gap:10px;margin:0 0 14px;padding:11px 13px;border-radius:12px;background:var(--accent-soft);color:var(--accent);font-weight:700}
.tick{flex:none;width:26px;height:26px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;font-size:15px}
dl{margin:0 0 14px;display:grid;grid-template-columns:auto 1fr;gap:8px 14px;font-size:14px}
dt{color:var(--muted)}dd{margin:0;font-weight:600}
.num{direction:ltr;unicode-bidi:isolate;display:inline-block}
.items{list-style:none;margin:0 0 6px;padding:0;display:grid;gap:9px}
.items li{padding:11px 13px;border:1px solid var(--line);border-radius:13px;background:var(--card2);font-size:14px}
.items b{display:block;font-size:15px}
.items small{display:block;color:var(--muted);margin-top:3px}
.tag{display:inline-block;margin-inline-end:6px;padding:1px 8px;border-radius:999px;background:var(--soft);font-size:11.5px;font-weight:700;color:var(--muted)}
.caveat{margin:12px 0 0;padding:11px 13px;border-radius:12px;background:#fff7e6;border:1px solid #e3c88f;color:#5b4520;font-size:13px}
.again{margin-top:14px;background:none;border:1px solid var(--line-strong);color:var(--ink);min-height:46px;width:100%;border-radius:12px;cursor:pointer;font-weight:600}
[hidden]{display:none!important}
@media print{.go,.again,form{display:none!important}.card{box-shadow:none}}
`;

const SCRIPT = String.raw`
(function(){
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
function show(d){
 msg.innerHTML="";form.hidden=true;out.hidden=false;
 var items=(d.items||[]).map(function(it){
  return '<li><b><span class="tag">'+esc(ACTION[it.action]||it.action)+'</span>'+esc(it.courseName||"المقرر")+'</b>'+
   (it.collegeName?'<small>'+esc(it.collegeName)+'</small>':'')+
   (it.was?'<small>كان: <span class="num">'+esc(it.was)+'</span></small>':'')+
   '<small>'+(it.action==="delete"?'':'المطلوب: ')+'<span class="num">'+esc(it.asked||"")+'</span></small></li>'}).join("");
 var detail=d.hasItems?
  (items?'<ul class="items">'+items+'</ul>':'<p class="lead">أرسل جدوله كما هو بلا تعديلات.</p>')+
  (d.keptCount?'<p class="lead">وأبقى '+esc(d.keptCount)+' من مواعيده كما هي.</p>':'')
  :'<div class="caveat">هذا توقيعٌ قديم لم تُحفظ فيه بنودُ الطلب لحظةَ التوقيع، فلا يمكن عرضُ ما وُقّع عليه بالضبط. التاريخ والرمز صحيحان.</div>';
 out.innerHTML='<div class="ok"><span class="tick" aria-hidden="true">✓</span>الرمز مطابقٌ لتوقيعٍ في النظام</div>'+
  '<dl><dt>الأستاذ</dt><dd>'+esc(d.instructorName)+'</dd><dt>الفصل الدراسي</dt><dd>'+esc(d.termName)+'</dd><dt>وقّع في</dt><dd>'+esc(when(d.signedAt))+'</dd><dt>الرمز</dt><dd><span class="num">'+esc(d.code)+'</span></dd></dl>'+detail+
  '<p class="note">هذا ما وُقّع عليه لحظةَ التوقيع. ما قرّره القسم بعد ذلك ليس جزءاً منه، ولا يظهر هنا.</p>'+
  '<button type="button" class="again" id="again">تحقّق من رمزٍ آخر</button>';
 document.getElementById("again").onclick=function(){out.hidden=true;form.hidden=false;codeEl.value="";civilEl.value="";go.disabled=false;codeEl.focus()}}
form.addEventListener("submit",function(e){e.preventDefault();
 var code=codeEl.value,civil=civilEl.value;
 if(code.length!==6){fail("اكتب الرمز كاملاً: ستّة أحرف وأرقام.");return}
 if(civil.length!==12){fail("اكتب رقمك المدني كاملاً: اثنا عشر رقماً.");return}
 go.disabled=true;msg.innerHTML="";
 fetch("/api/public/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:code,civil:civil,hint:HINT||undefined})})
 .then(function(r){return r.json().then(function(d){return{ok:r.ok,status:r.status,d:d}})})
 .then(function(x){civilEl.value="";if(!x.ok){fail(x.d.error||"تعذّر التحقّق.");return}show(x.d)})
 .catch(function(){fail("تعذّر الاتصال. تحقّق من الإنترنت.")})});
if(CODE0)civilEl.focus();else codeEl.focus();
})();
`;

/** تُستدعى من server.ts عبر /verify و/verify/:code. الرمزُ والتلميحُ يدخلان السكربت JSON. */
export function signatureVerifyPage(code: string, hint: string, nonce: string): string {
  const lit = (v: string) => JSON.stringify(String(v)).replace(/</g, "\\u003c");
  const clean = String(code || "").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 6);
  const script = SCRIPT.replace("__CODE__", () => lit(clean)).replace("__HINT__", () => lit(String(hint || "").slice(0, 120)));
  return `<!doctype html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="light">
<title>التحقّق من رمز التوقيع — SCHEDULE</title>
<link rel="icon" href="/schedule-icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/schedule-icon-192.png">
<style>/* SCHEDULE_PUBLIC_PLEX_ARABIC */${PUBLIC_FONT_FACES}:root{${PUBLIC_LIGHT_VARS}}${CSS}</style></head><body>
<div class="wrap"><p class="brand">SCHEDULE</p><h1>التحقّق من رمز التوقيع</h1>
<p class="lead">اكتب الرمز الذي وصلك عند إرسال طلبك مع رقمك المدني، لترى ما وُقّع عليه.</p>
<div class="card"><div id="msg"></div>
<form id="f" autocomplete="off" novalidate>
<label>رمز التوقيع<input id="code" inputmode="text" autocapitalize="characters" maxlength="6" placeholder="ستّة أحرف" aria-label="رمز التوقيع، ستة أحرف وأرقام"></label>
<label>رقمك المدني<input id="civil" inputmode="numeric" maxlength="12" placeholder="12 رقماً" aria-label="رقمك المدني، اثنا عشر رقماً"></label>
<button class="go" id="go" type="submit">تحقّق</button>
<p class="note">الرقم المدني يُستعمل للمطابقة مرةً واحدة ولا يُحفظ.</p></form>
<div id="out" hidden></div></div></div>
<noscript>تحتاج هذه الصفحة إلى تفعيل جافاسكربت في المتصفح.</noscript>
<script nonce="${nonce}">${script}</script></body></html>`;
}
