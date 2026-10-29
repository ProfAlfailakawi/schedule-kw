/**
 * ── 🔔 في كرت الأستاذ (/r/:token) ───────────────────────────────────────────
 *
 * شارةٌ صغيرة في رأس الكرت، بأربع حالات تُقرأ من شكلها:
 *   🔔 نبّهني      — متاحٌ ولم يُفعَّل: لمسةٌ واحدة تطلب الإذن وتشترك.
 *   🔔 ✓           — يصلك قرارُ القسم على هذا الجهاز (لمسةٌ: جرّب · أوقف).
 *   🔕             — محظورٌ في المتصفّح: لمسةٌ تُري كيف يُسمح به.
 *   🔔 على iPhone   — سفاري لا يدفع إلا لتطبيقٍ على الشاشة الرئيسية (iOS 16.4+):
 *                    ثلاثُ خطواتٍ بأيقوناتها — مشاركة ⬆︎ ← «إضافة إلى الشاشة الرئيسية» ➕ ← افتحه واضغط 🔔.
 * وبعد إرسال الطلب تصير الشارةُ دعوةً أوضح تحت «وصل طلبك إلى القسم».
 *
 * والكرتُ على الشاشة الرئيسية تطبيقٌ اسمه «بطاقتي» بدايتُه الكرتُ نفسه
 * (cardManifest)، وعاملُ الدفع (/push-sw.js) نطاقُه الكرتُ وحده بلا معالج fetch:
 * لا يخزّن صفحةً ولا يجيب طلباً، فالكرتُ يُقرأ من الخادم دائماً.
 *
 * السكربتُ ES5 داخل سكربت الكرت نفسه (بعد TEACHER_CARD_EXTRAS_JS)، يستعمل SK
 * و TOKEN و host و refresh من الصفحة، ويبدأ بعد اكتمالها. ولا تُكتب هنا علامةُ
 * الاقتباس المائلة ولا ‎${‎: النصُّ قالبٌ نصّي في الخادم.
 */

/** رمزُ الكرت: base64url، وفي العرض يسبقه «demo.». */
export const CARD_TOKEN_PATTERN = /^(?:demo\.)?[A-Za-z0-9_-]{16,64}$/;

export function cardManifest(token: string) {
  const start = `/r/${encodeURIComponent(token)}`;
  return {
    id: start,
    name: "بطاقتي · SCHEDULE",
    short_name: "بطاقتي",
    description: "جدولك وطلبك وقرار القسم — وتنبيهٌ حين يُثبَّت.",
    start_url: start,
    scope: start,
    display: "standalone",
    dir: "rtl",
    lang: "ar",
    background_color: "#ffffff",
    theme_color: "#f2f3ef",
    icons: [
      { src: "/schedule-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/schedule-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/schedule-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/schedule-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    ],
  };
}

/** رأسُ الكرت: «بطاقتي» تُضاف إلى الشاشة الرئيسية بأيقونتها واسمها. */
export function pushCardHead(token: string): string {
  if (!CARD_TOKEN_PATTERN.test(String(token || ""))) return "";
  return `<link rel="manifest" href="/r/${encodeURIComponent(token)}/manifest.webmanifest">`
    + `<meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes">`
    + `<meta name="apple-mobile-web-app-title" content="بطاقتي"><meta name="apple-mobile-web-app-status-bar-style" content="default">`;
}

export const PUSH_CARD_CSS = String.raw`
/* ── 🔔 شارة التنبيهات (src/server/pushCard.ts) ── */
.pc{flex:none;margin-inline-start:auto;align-self:flex-start;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-block-size:40px;min-inline-size:40px;padding:0 13px;border-radius:999px;border:1px solid color-mix(in srgb,var(--accent) 34%,var(--line));background:var(--card,#fff);color:var(--accent);font:inherit;font-size:13px;font-weight:700;line-height:1;cursor:pointer;box-shadow:0 6px 16px rgba(22,57,40,.07);transition:transform .15s ease,background .2s ease}
.pc:active{transform:scale(.96)}
.pc:focus-visible{outline:3px solid rgba(36,119,86,.2);outline-offset:2px}
.pc svg{inline-size:18px;block-size:18px;flex:none;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.pc[data-s=on]{border-color:color-mix(in srgb,var(--ok) 40%,var(--line));background:var(--ok2);color:var(--ok-ink,var(--ok))}
.pc[data-s=on] .pc-ck{display:grid;place-items:center;inline-size:18px;block-size:18px;border-radius:50%;background:var(--ok);color:#fff}
.pc[data-s=on] .pc-ck svg{inline-size:12px;block-size:12px;stroke-width:3}
.pc[data-s=blocked]{padding:0;inline-size:40px;border-color:color-mix(in srgb,var(--bad) 28%,var(--line));background:var(--bad2);color:var(--bad)}
.pc[data-s=busy]{color:var(--muted);pointer-events:none}
.pc[data-s=busy] svg{animation:pcspin 1s linear infinite}
@keyframes pcspin{to{transform:rotate(360deg)}}
.pc[data-s=off] svg,.pc[data-s=ios] svg{animation:pcring 2.4s ease 1s 2}
@keyframes pcring{0%,40%,100%{transform:rotate(0)}8%{transform:rotate(-14deg)}16%{transform:rotate(12deg)}24%{transform:rotate(-8deg)}32%{transform:rotate(5deg)}}
/* بعد الإرسال: دعوةٌ أوضح تحت «وصل طلبك» */
.done .pc{margin:4px auto 16px;min-block-size:48px;padding:0 20px;font-size:15px;gap:9px;box-shadow:0 10px 26px rgba(22,57,40,.1)}
.done .pc[data-s=on]{padding:0 18px}
/* أوراقُ الشرح */
.pc-steps{list-style:none;margin:0;padding:0;display:grid;gap:10px;counter-reset:pcs}
.pc-steps li{position:relative;display:grid;grid-template-columns:52px minmax(0,1fr);align-items:center;gap:12px;padding:10px 12px;border-radius:18px;background:var(--soft);counter-increment:pcs}
.pc-steps li::before{content:counter(pcs);position:absolute;inset-block-start:-6px;inset-inline-start:-6px;inline-size:22px;block-size:22px;border-radius:50%;display:grid;place-items:center;background:var(--accent);color:#fff;font-size:12px;font-weight:700;box-shadow:0 0 0 3px var(--card,#fff)}
.pc-steps li+li::after{content:"";position:absolute;inset-block-start:-11px;inset-inline-start:36px;inline-size:2px;block-size:12px;background:color-mix(in srgb,var(--accent) 35%,transparent)}
.pc-steps .pc-ico{inline-size:52px;block-size:52px;border-radius:15px;display:grid;place-items:center;background:var(--card,#fff);color:var(--accent);box-shadow:0 4px 12px rgba(22,57,40,.08)}
.pc-steps .pc-ico svg{inline-size:28px;block-size:28px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.pc-steps b{display:block;font-size:15px;line-height:1.4}
.pc-steps small{display:block;color:var(--muted);font-size:12.5px;line-height:1.5}
.pc-kinds{display:flex;flex-wrap:wrap;justify-content:center;gap:6px}
.pc-kinds span{display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:999px;background:var(--soft);font-size:12.5px;font-weight:600;color:var(--ink)}
.pc-acts{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.pc-acts button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-block-size:48px;border-radius:14px;border:1px solid var(--line);background:var(--card,#fff);color:var(--ink);font:inherit;font-weight:700;cursor:pointer}
.pc-acts button svg{inline-size:18px;block-size:18px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.pc-acts .pc-go{border-color:var(--accent);background:var(--accent);color:#fff}
.pc-acts .pc-stop{color:var(--bad)}
@media (prefers-reduced-motion:reduce){.pc svg{animation:none!important}}
@media print{.pc{display:none!important}}
`;

export const PUSH_CARD_JS = String.raw`
/* ── 🔔 تنبيهات الجوال في الكرت (src/server/pushCard.ts) ── */
var PC={chip:null,state:"hidden",key:"",reg:null,ids:[],sub:null,ready:false};
var PC_ICON={
bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
off:'<path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5"/><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="m2 2 20 20"/>',
check:'<path d="M20 6 9 17l-5-5"/>',
share:'<path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M8 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-2"/>',
add:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>',
tap:'<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M12 18h.01"/><path d="M9.5 7.5a2.5 2.5 0 0 1 5 0c0 3 1.2 4 1.2 4H8.3s1.2-1 1.2-4"/>',
lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
send:'<path d="M22 2 11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>'};
function pcIcon(n){return '<svg class="sk-gi" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+(PC_ICON[n]||"")+'</svg>'}
function pcEnv(){var ua=navigator.userAgent||"",ios=/iP(hone|ad|od)/.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
 var standalone=window.navigator.standalone===true||!!(window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches);
 var api="serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window&&!!window.isSecureContext;
 return {ios:ios,standalone:standalone,api:api}}
function pcScope(){return "/r/"+encodeURIComponent(TOKEN)}
function pcApi(p){return "/api/public/request/"+encodeURIComponent(TOKEN)+"/push"+(p||"")}
function pcBytes(b64){var s=String(b64||"").replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";var raw=atob(s),out=new Uint8Array(raw.length);for(var i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
function pcSameKey(sub){try{var k=sub&&sub.options&&sub.options.applicationServerKey;if(!k)return true;var a=new Uint8Array(k),b=pcBytes(PC.key);if(a.length!==b.length)return false;for(var i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true}catch(_){return true}}
function pcHash(text){return crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)).then(function(buf){return Array.prototype.map.call(new Uint8Array(buf),function(b){return ("0"+b.toString(16)).slice(-2)}).join("")})}
function pcActive(reg){return new Promise(function(done){if(reg.active){done(reg);return}var w=reg.installing||reg.waiting;if(!w){done(reg);return}
 w.addEventListener("statechange",function(){if(w.state==="activated"||reg.active)done(reg)});setTimeout(function(){done(reg)},8000)})}
function pcPaint(){var c=PC.chip;if(!c)return;var s=PC.state;c.hidden=s==="hidden";c.setAttribute("data-s",s);
 var wide=!!(c.parentNode&&c.parentNode.classList&&c.parentNode.classList.contains("done"));
 c.innerHTML=s==="on"?pcIcon("bell")+'<span class="pc-ck">'+pcIcon("check")+'</span>'+(wide?'<span>ستصلك قرارات القسم</span>':'')
  :s==="blocked"?pcIcon("off"):s==="busy"?pcIcon("bell"):pcIcon("bell")+'<span>'+(wide?"نبّهني حين يقرّر القسم":"نبّهني")+'</span>';
 c.setAttribute("aria-label",s==="on"?"التنبيهات مفعّلة على هذا الجهاز":s==="blocked"?"التنبيهات محظورة — كيف أسمح بها":s==="ios"?"كيف تصلك التنبيهات على iPhone":"نبّهني بقرار القسم على جوالي")}
function pcMount(){var c=PC.chip;if(!c||PC.state==="hidden"||!host)return;var hd=host.querySelector(".hd"),done=host.querySelector(".done");
 if(hd){if(c.parentNode!==hd){hd.appendChild(c);pcPaint()}return}
 if(done&&c.parentNode!==done){var h=done.querySelector("h1");done.insertBefore(c,h?h.nextSibling:done.firstChild);pcPaint()}}
function pcSet(s){PC.state=s;pcPaint();pcMount()}
function pcSync(){if(!PC.reg)return Promise.resolve(null);return PC.reg.pushManager.getSubscription().then(function(sub){
  if(sub&&!pcSameKey(sub))return sub.unsubscribe().then(function(){return null});return sub}).then(function(sub){PC.sub=sub;
  if(!sub)return "off";return pcHash(sub.endpoint).then(function(id){return PC.ids.indexOf(id)>=0?"on":"off"})})}
function pcSave(sub){PC.sub=sub;return fetch(pcApi(),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subscription:sub.toJSON()})})
 .then(function(r){if(!r.ok)throw new Error("save");return r.json()}).then(function(d){if(d&&d.id)PC.ids.push(d.id);pcSet("on");SK.toast("check","ستصلك قرارات القسم على هذا الجهاز")})}
function pcSubscribe(reg){return reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:pcBytes(PC.key)})}
function pcEnable(){var was=PC.state;pcSet("busy");
 var fail=function(){var p=window.Notification&&Notification.permission;pcSet(p==="denied"?"blocked":was==="busy"?"off":was);if(p!=="denied")SK.toast("alert","تعذّر التفعيل. حاول مرة أخرى.")};
 /* الاشتراكُ داخل اللمسة نفسها: سفاري لا يسأل عن الإذن إلا في لمسة. */
 if(PC.reg&&PC.reg.active){pcSubscribe(PC.reg).then(pcSave).catch(fail);return}
 Promise.resolve(Notification.requestPermission()).then(function(p){if(p!=="granted"){pcSet(p==="denied"?"blocked":"off");return}
  return navigator.serviceWorker.register("/push-sw.js",{scope:pcScope()}).then(pcActive).then(function(reg){PC.reg=reg;return pcSubscribe(reg)}).then(pcSave)}).catch(fail)}
function pcDisable(){var sub=PC.sub;SK.close();pcSet("busy");
 fetch(pcApi("/off"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({endpoint:sub?sub.endpoint:""})}).catch(function(){})
 .then(function(){return sub?sub.unsubscribe():null}).then(function(){PC.sub=null;pcSet("off");SK.toast("check","أُوقفت التنبيهات على هذا الجهاز")},function(){pcSet("off")})}
function pcTest(btn){btn.disabled=true;fetch(pcApi("/test"),{method:"POST"}).then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d}})})
 .then(function(x){SK.close();if(x.ok&&x.d&&x.d.sent)SK.toast("send","أُرسل — انظر إشعارات جهازك");else SK.toast("alert",(x.d&&x.d.error)||"لم يصل. أعد التفعيل.")})
 .catch(function(){btn.disabled=false;SK.toast("alert","تعذّر الاتصال.")})}
function pcSheetOn(){SK.sheet('<div class="sk-h"><span class="sk-b">'+pcIcon("bell")+'</span><div><h3>التنبيهات مفعّلة</h3><p>تصلك على هذا الجهاز ولو كانت الصفحة مغلقة</p></div></div>'+
 '<div class="pc-kinds"><span>✅ ثُبّت</span><span>🔁 بديل</span><span>❌ تعذّر</span><span>💬 ردّ</span></div>'+
 '<div class="pc-acts"><button type="button" class="pc-go" id="pcTry">'+pcIcon("send")+'جرّب</button><button type="button" class="pc-stop" id="pcStop">'+pcIcon("off")+'أوقف</button></div>');
 var t=document.getElementById("pcTry"),s=document.getElementById("pcStop");if(t)t.onclick=function(){pcTest(t)};if(s)s.onclick=pcDisable}
function pcSheetIos(){SK.sheet('<div class="sk-h"><span class="sk-b">'+pcIcon("bell")+'</span><div><h3>التنبيهات على iPhone</h3><p>تصل حين تكون «بطاقتي» على شاشتك الرئيسية</p></div></div>'+
 '<ol class="pc-steps"><li><span class="pc-ico">'+pcIcon("share")+'</span><div><b>اضغط مشاركة ⬆︎</b><small>أسفل Safari</small></div></li>'+
 '<li><span class="pc-ico">'+pcIcon("add")+'</span><div><b>«إضافة إلى الشاشة الرئيسية» ➕</b><small>تظهر باسم «بطاقتي»</small></div></li>'+
 '<li><span class="pc-ico">'+pcIcon("tap")+'</span><div><b>افتحها من الأيقونة واضغط 🔔</b><small>ثم «السماح»</small></div></li></ol>'+
 '<button type="button" class="sk-btn" id="pcOk">'+pcIcon("check")+'فهمت</button>');var ok=document.getElementById("pcOk");if(ok)ok.onclick=function(){SK.close()}}
function pcSheetBlocked(){var e=pcEnv();SK.sheet('<div class="sk-h"><span class="sk-b">'+pcIcon("off")+'</span><div><h3>التنبيهات محظورة</h3><p>اسمح بها مرّةً واحدة من الإعدادات</p></div></div>'+
 '<ol class="pc-steps">'+(e.ios?'<li><span class="pc-ico">'+pcIcon("gear")+'</span><div><b>الإعدادات ← الإشعارات</b><small>في iPhone</small></div></li><li><span class="pc-ico">'+pcIcon("bell")+'</span><div><b>«بطاقتي» ← السماح بالإشعارات</b></div></li>'
 :'<li><span class="pc-ico">'+pcIcon("lock")+'</span><div><b>اضغط 🔒 بجانب الرابط</b><small>أعلى المتصفح</small></div></li><li><span class="pc-ico">'+pcIcon("bell")+'</span><div><b>الإشعارات ← سماح</b></div></li>')+
 '<li><span class="pc-ico">'+pcIcon("tap")+'</span><div><b>عُد واضغط 🔔</b></div></li></ol>'+
 '<button type="button" class="sk-btn" id="pcOk">'+pcIcon("check")+'فهمت</button>');var ok=document.getElementById("pcOk");if(ok)ok.onclick=function(){SK.close()}}
function pcTap(){var s=PC.state;if(s==="busy")return;if(s==="ios"){pcSheetIos();return}if(s==="blocked"){pcSheetBlocked();return}if(s==="on"){pcSheetOn();return}pcEnable()}
function pcInit(){if(PC.ready||typeof TOKEN!=="string"||!host)return;PC.ready=true;var e=pcEnv();
 if(!e.api&&!(e.ios&&!e.standalone))return;
 var chip=document.createElement("button");chip.type="button";chip.className="pc";chip.hidden=true;chip.onclick=pcTap;PC.chip=chip;
 new MutationObserver(pcMount).observe(host,{childList:true});
 fetch(pcApi(),{cache:"no-store"}).then(function(r){return r.ok?r.json():null}).then(function(d){if(!d||!d.enabled||!d.publicKey)return;PC.key=d.publicKey;PC.ids=d.ids||[];
  if(!e.api){pcSet("ios");return}
  if(Notification.permission==="denied"){pcSet("blocked");return}
  return navigator.serviceWorker.register("/push-sw.js",{scope:pcScope()}).then(pcActive).then(function(reg){PC.reg=reg;return pcSync()})
   .then(function(s){pcSet(s||"off")},function(){pcSet("off")})}).catch(function(){});
 if(navigator.serviceWorker&&navigator.serviceWorker.addEventListener){navigator.serviceWorker.addEventListener("message",function(ev){
  if(ev.data&&ev.data.type==="schedule-push-open"&&typeof refresh==="function")refresh()});if(navigator.serviceWorker.startMessages)navigator.serviceWorker.startMessages()}}
setTimeout(pcInit,0);
`;
