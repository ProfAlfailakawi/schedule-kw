/**
 * ── «مساري»: محاضرتك القادمة · تذكيرٌ يصل وحده · شارك مرشدك (جانبُ الصفحة) ───────
 *
 * يُحقن في سكربت الصفحة (src/server/studentHomePage.ts) فيرى دوالَّها (api, sheet, toast, ic, esc, reveal, showTab, hhmm…)
 * كما يفعل studentRecoveryScript.ts. وفي الصفحة موضعٌ واحدٌ يناديه: بعد رسم الرئيسية يُستدعى `extrasHook()`، فيجلب
 * `GET /api/public/me/extras` مرةً، ويُركّب البطاقاتِ بنفسه في مواضعها (لسان «الآن» ولسان «ملفي») — فلا يمسّ ملفَّ الصفحة شيءٌ آخر.
 *
 * بلا تخزينٍ في المتصفح (ما يلزم يُقرأ من الخادم) وبلا روابط خارجية؛ رمزُ QR يرسمه الخادم (SVG).
 * السكربتُ ES5 عاديّ: لا علامةَ اقتباسٍ مائلة ولا ‎$‎{ فيه.
 */
import { oblique } from "../utils/arabicCount";
import { NEXT_LECTURE_SCRIPT } from "../utils/nextLecture";

export const STUDENT_EXTRAS_CSS = `
/* ── محاضرتك القادمة ── */
.gx-next{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px;inline-size:100%;margin-block-start:14px;padding:14px 16px;min-block-size:92px;border:1px solid var(--line);border-radius:22px;background:linear-gradient(135deg,var(--accent-soft),var(--card) 64%);box-shadow:var(--shadow);text-align:start;cursor:pointer;color:var(--ink);transition:transform .15s,border-color .15s}
.gx-next:hover,.gx-next:focus-visible{border-color:var(--accent)}
#gx-next.top .gx-next{margin-block-start:-22px;margin-inline:10px;inline-size:calc(100% - 20px);border-block-start:3px solid var(--accent);position:relative;z-index:2}
#gx-next.top+#nextStep{margin-block-start:14px}
.gx-next:active{transform:scale(.99)}
.gx-orb{position:relative;inline-size:64px;block-size:64px;flex:none}
.gx-orb svg{inline-size:100%;block-size:100%;transform:rotate(-90deg)}
.gx-orb circle{fill:none;stroke-width:6;stroke-linecap:round}
.gx-orb .t{stroke:var(--line)}
.gx-orb .a{stroke:var(--accent);transition:stroke-dashoffset .6s var(--ease)}
.gx-orb .core{position:absolute;inset:0;display:grid;place-items:center;color:var(--accent)}
.gx-orb .core .i{inline-size:24px;block-size:24px}
.gx-next .tx{display:grid;gap:1px;min-inline-size:0}
.gx-next .k{font-size:12.5px;font-weight:700;color:var(--accent)}
.gx-next .w{font-size:22px;line-height:1.35;font-weight:800;font-variant-numeric:tabular-nums}
.gx-next .c{font-size:14.5px;font-weight:600;line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gx-next .m{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.gx-next>.go{color:var(--muted);inline-size:18px;block-size:18px}
/* ── بطاقات التنبيهات والمشاركة ── */
.gx-card{gap:12px}
.gx-card h2{flex-wrap:wrap}
.gx-kinds{display:grid;gap:8px}
.gx-kinds>span{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:14px;background:var(--card2);border:1px solid var(--line);font-size:14px;font-weight:600}
.gx-kinds .i{color:var(--accent);inline-size:20px;block-size:20px}
.gx-facts{display:flex;flex-wrap:wrap;gap:8px}
.gx-facts .chip{font-size:12.5px;padding:5px 11px}
.gx-facts .chip .i{inline-size:14px;block-size:14px}
.gx-card .btn .i{inline-size:22px;block-size:22px}
.gx-row{display:grid;gap:8px}
.gx-row.two{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.gx-offer{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:6px 12px;padding:14px 16px;border-radius:22px;background:linear-gradient(135deg,var(--gold-soft),var(--card) 70%)}
.gx-offer .ib{inline-size:42px;block-size:42px;border-radius:14px;display:grid;place-items:center;background:var(--card);color:var(--gold);border:1px solid var(--line)}
.gx-offer .tx{display:grid;gap:1px;min-inline-size:0}
.gx-offer .tx b{font-size:15.5px}
.gx-offer .tx small{font-size:12.5px;color:var(--muted);line-height:1.6}
.gx-offer .gx-row{grid-column:1/-1}
.gx-why{display:flex;align-items:flex-start;gap:9px;padding:11px 13px;border-radius:14px;background:var(--card2);border:1px solid var(--line);font-size:13px;line-height:1.7;color:var(--dim)}
.gx-why .i{margin-block-start:2px;color:var(--muted)}
/* ── ورقة المشاركة ── */
.gx-qr{justify-self:center;inline-size:min(100%,232px);aspect-ratio:1;padding:10px;border-radius:22px;background:#fff;border:1px solid var(--line);box-shadow:var(--shadow)}
.gx-qr svg{display:block;inline-size:100%;block-size:100%}
.gx-share{display:grid;gap:14px}
.gx-share h3{margin:0;font-size:19px}
.gx-share .muted{text-align:center}
.gx-share .cal-copy{direction:ltr}
`;

export const STUDENT_EXTRAS_SCRIPT = String.raw`
/* ── محاضرتك القادمة · تذكيرٌ يصل وحده · شارك مرشدك (src/server/studentExtrasScript.ts) ── */
var oblique=(${oblique.toString()});
${NEXT_LECTURE_SCRIPT}
var GX={d:null,tick:0,html:"",busy:false};
function gi(n,c){return '<svg class="i'+(c?" "+c:"")+'" aria-hidden="true"><use href="#g-'+n+'"/></svg>'}
function gxSprite(){if(document.getElementById("gx-sprite"))return;var d=document.createElement("div");d.id="gx-sprite";
  d.innerHTML='<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>'
   +'<symbol id="g-bell" viewBox="0 0 24 24"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></symbol>'
   +'<symbol id="g-qr" viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1.2"/><rect x="14" y="4" width="6" height="6" rx="1.2"/><rect x="4" y="14" width="6" height="6" rx="1.2"/><path d="M14 14h2.5v2.5H14zM19 14.5v1.5M17.5 19H20M14 19.5V20"/></symbol>'
   +'<symbol id="g-copy" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/></symbol>'
   +'</defs></svg>';document.body.appendChild(d)}
/* مكانُ البطاقة: بعد «خطوتك الآن» في لسان الآن، وقبل أزرار الرمز في لسان ملفي. */
function gxHost(id,where){var el=document.getElementById(id);if(el)return el;el=document.createElement("div");el.id=id;
  if(where==="now"){var a=document.getElementById("nextStep"),pane=document.getElementById("pane-now");if(!pane)return null;var ref=document.getElementById("gx-next"),hasA=a&&a.parentNode===pane;
    /* الهاتف: بطاقتُه أولُ ما في الآن (تتدلّى من الحلقة كما تتدلّى «خطوتك الآن»)؛ الحاسوب: أولُ العمود الرئيسي بعدها. */
    if(id==="gx-next"){if(hasA&&!isWide()){el.className="top";pane.insertBefore(el,a)}else if(hasA)pane.insertBefore(el,a.nextSibling);else pane.insertBefore(el,pane.firstChild)}
    else if(ref&&ref.parentNode===pane&&hasA&&ref.previousSibling===a)pane.insertBefore(el,ref.nextSibling);
    else if(hasA)pane.insertBefore(el,a.nextSibling);else pane.insertBefore(el,ref?ref.nextSibling:pane.firstChild)}
  else{var chg=document.getElementById("chg"),card=chg&&chg.closest(".card");if(!card||!card.parentNode)return null;
    if(id==="gx-push")card.parentNode.insertBefore(el,card);else{var p=document.getElementById("gx-push");if(p&&p.parentNode===card.parentNode)card.parentNode.insertBefore(el,card);else card.parentNode.insertBefore(el,card)}}
  return el}
function gxDrop(id){var el=document.getElementById(id);if(el)el.remove()}

/* ── ١) محاضرتك القادمة ── */
function gxWhen(nx){return nextLectureLabel(nx,function(n,u){return countOf(n,oblique(u==="hour"?AR.hour:AR.minute))})}
function gxPaintNext(){var d=GX.d&&GX.d.next;
  if(!d||!d.meetings||!d.meetings.length){gxDrop("gx-next");GX.html="";return}
  var nx=nextLecture(d.meetings,Date.now(),d.window);if(!nx){gxDrop("gx-next");GX.html="";return}
  var host=gxHost("gx-next","now");if(!host)return;
  var lab=gxWhen(nx),m=nx.meeting,arc=nx.dayOffset===0&&nx.minutes<180?1-nx.minutes/180:0,c=2*Math.PI*26;
  var html='<button type="button" class="gx-next" id="gx-nextb" aria-label="'+esc("محاضرتك القادمة: "+lab.when+"، "+m.name+"، افتح أسبوعك")+'">'
   +'<span class="gx-orb"><svg viewBox="0 0 64 64" aria-hidden="true"><circle class="t" cx="32" cy="32" r="26"/><circle class="a" cx="32" cy="32" r="26" stroke-dasharray="'+c.toFixed(1)+'" stroke-dashoffset="'+(c*(1-arc)).toFixed(1)+'"/></svg><span class="core">'+ic("clock")+'</span></span>'
   +'<span class="tx"><span class="k">محاضرتك القادمة</span><span class="w">'+esc(lab.when)+'</span><span class="c">'+esc(m.name)+'</span>'
   +'<span class="m">'+(m.section?'<span class="chip gold">شعبة '+esc(m.section)+'</span>':'')+'<bdi dir="ltr">'+hhmm(m.start)+'–'+hhmm(m.end)+'</bdi></span></span>'+ic("fwd","go")+'</button>';
  if(html===GX.html&&document.getElementById("gx-nextb"))return;GX.html=html;host.innerHTML=html;
  document.getElementById("gx-nextb").addEventListener("click",gxOpenWeek)}
/* تُفتح شبكةُ الأسبوع نفسُها في «جدولي المقترح». */
function gxOpenWeek(){var t=document.getElementById("ticket");if(t&&hostFilled(t)){reveal(t);return}showTab("plan")}

/* ── ٢) تذكيرٌ يصل وحده ── */
function gxSupport(){var api="serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window&&window.isSecureContext;if(api)return"ok";
  var ios=/iP(hone|ad|od)/.test(navigator.userAgent||"")||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
  var standalone=navigator.standalone===true||!!(window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches);
  return ios&&!standalone?"ios-install":"none"}
function gxKey(b64){var t=String(b64||"").replace(/-/g,"+").replace(/_/g,"/");var raw=atob(t+"====".slice(t.length%4||4));var out=new Uint8Array(raw.length);for(var i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
function gxSubId(endpoint){if(!(window.crypto&&crypto.subtle))return Promise.resolve("");
  return crypto.subtle.digest("SHA-256",new TextEncoder().encode(endpoint)).then(function(b){return Array.prototype.map.call(new Uint8Array(b),function(x){return(x<16?"0":"")+x.toString(16)}).join("")})}
function gxFindReg(){if(!("serviceWorker" in navigator))return Promise.resolve(null);
  return navigator.serviceWorker.getRegistrations().then(function(list){for(var i=0;i<list.length;i++){var u=new URL(list[i].scope);if(u.pathname==="/me")return list[i]}return null}).catch(function(){return null})}
function gxActive(reg){if(reg.active)return Promise.resolve(reg);
  return new Promise(function(res){var w=reg.installing||reg.waiting;if(!w){res(reg);return}w.addEventListener("statechange",function(){if(reg.active)res(reg)});setTimeout(function(){res(reg)},8000)})}
function gxLocalSub(){return gxFindReg().then(function(reg){return reg?reg.pushManager.getSubscription():null}).catch(function(){return null})}
function gxSubscribe(key){var opts={userVisibleOnly:true,applicationServerKey:gxKey(key)};
  return gxFindReg().then(function(reg){if(reg&&reg.active)return reg.pushManager.subscribe(opts);
    return Notification.requestPermission().then(function(p){if(p!=="granted")throw{permission:p};
      return navigator.serviceWorker.register("/push-sw.js",{scope:"/me"}).then(gxActive).then(function(r){return r.pushManager.subscribe(opts)})})})}
function gxPushState(){var d=GX.d&&GX.d.push;if(!d)return Promise.resolve(null);
  var sup=gxSupport(),perm=("Notification" in window)?Notification.permission:"default";
  return gxLocalSub().then(function(sub){return(sub?gxSubId(sub.endpoint):Promise.resolve("")).then(function(id){
    var on=!!sub&&(d.ids.indexOf(id)>=0||(!id&&d.ids.length>0));
    var why="";
    if(!d.configured)why="التنبيهات غير مفعّلة على هذا الخادم.";
    else if(sup==="none")why="متصفحك لا يدعم التنبيهات.";
    else if(sup==="ios-install")why="في آيفون: أضف مساري إلى الشاشة الرئيسية ثم افتحه منها لتفعّل التنبيهات.";
    else if(perm==="denied"&&!on)why="الإذن مرفوض. فعّل التنبيهات لمساري من إعدادات المتصفح.";
    return{on:on,why:why,sup:sup}})})}
function gxPaintPush(){if(!GX.d||!GX.d.push)return;gxPushState().then(function(st){if(!st||S.view!=="home")return;
  var host=gxHost("gx-push","me");if(!host)return;
  var h='<section class="card fade gx-card"><h2><span class="b">'+gi("bell")+'</span>تذكير يصل وحده'+(st.on?'<span class="chip ok">'+ic("check","")+' مفعّلة</span>':'')+'</h2>'
   +'<div class="gx-kinds"><span>'+ic("heart")+'الرغبات تُغلق اليوم</span><span>'+ic("ticket")+'جدولك المقترح جاهز</span><span>'+ic("cal")+'يبدأ تسجيلك غداً</span></div>';
  if(st.why)h+='<div class="gx-why">'+ic("info")+'<span>'+esc(st.why)+'</span></div><button type="button" class="btn" disabled>'+gi("bell")+'فعّل التنبيهات</button>';
  else if(st.on)h+='<div class="gx-row"><button type="button" class="btn alt" id="gx-poff">'+ic("x")+'أوقف التنبيهات</button><button type="button" class="btn alt" id="gx-ptest">'+gi("bell")+'جرّب تنبيهاً</button></div>';
  else h+='<button type="button" class="btn" id="gx-pon">'+gi("bell")+'فعّل التنبيهات</button>';
  h+='<p class="fine">ثلاث رسائل قصيرة في الفصل على الأكثر، بلا اسمٍ ولا رقم. تُوقفها متى شئت.</p></section>';
  host.innerHTML=h;
  var on=document.getElementById("gx-pon"),off=document.getElementById("gx-poff"),test=document.getElementById("gx-ptest");
  if(on)on.addEventListener("click",function(){gxEnable(on)});
  if(off)off.addEventListener("click",function(){gxDisable(off)});
  if(test)test.addEventListener("click",function(){test.disabled=true;api("POST","/api/public/me/push/test",{}).then(function(r){test.disabled=false;
    if(r.ok&&r.d.sent)toast("أُرسل تنبيهٌ إلى جهازك");else if(!signedOut(r))toast((r.d&&r.d.error)||"تعذّر إرسال التنبيه",true)})})})}
function gxEnable(btn){if(GX.busy)return;GX.busy=true;if(btn)btn.disabled=true;var d=GX.d.push;
  gxSubscribe(d.publicKey).then(function(sub){return api("POST","/api/public/me/push",{subscription:sub.toJSON()}).then(function(r){
    if(!r.ok)throw{server:r};d.ids=d.ids.concat([r.d.id]).filter(function(x,i,a){return a.indexOf(x)===i});d.count=d.ids.length;d.offerNow=false;toast("فُعّلت التنبيهات على هذا الجهاز")})})
   .catch(function(e){if(e&&e.permission)toast("لم تسمح بالتنبيهات. يمكنك تفعيلها من إعدادات المتصفح.",true);else if(e&&e.server){if(!signedOut(e.server))toast((e.server.d&&e.server.d.error)||"تعذّر تفعيل التنبيهات",true)}else toast("تعذّر تفعيل التنبيهات على هذا الجهاز.",true)})
   .then(function(){GX.busy=false;gxPaintAll()})}
function gxDisable(btn){if(GX.busy)return;GX.busy=true;if(btn)btn.disabled=true;var d=GX.d.push;
  gxFindReg().then(function(reg){return reg?reg.pushManager.getSubscription():null}).then(function(sub){var endpoint=sub?sub.endpoint:"";
    return api("POST","/api/public/me/push/off",{endpoint:endpoint}).then(function(r){
      if(!r.ok){if(!signedOut(r))toast((r.d&&r.d.error)||"تعذّر إيقاف التنبيهات",true);return}
      if(sub)sub.unsubscribe().catch(function(){});
      gxSubId(endpoint).then(function(id){d.ids=d.ids.filter(function(x){return x!==id});d.count=d.ids.length;gxPaintAll()});toast("أُوقفت التنبيهات على هذا الجهاز")})})
   .catch(function(){toast("تعذّر إيقاف التنبيهات",true)}).then(function(){GX.busy=false;gxPaintAll()})}
/* عرضٌ واحدٌ بعد إكمال الملف، ثم لا يُلحّ (علامةٌ على الملف في الخادم). */
function gxPaintOffer(){if(!GX.d||!GX.d.push)return;var d=GX.d.push;
  if(!d.offerNow||d.ids.length){gxDrop("gx-offer");return}
  gxPushState().then(function(st){if(!st||st.why||st.on||S.view!=="home"){gxDrop("gx-offer");return}
    var host=gxHost("gx-offer","now");if(!host||document.getElementById("gx-oon"))return;
    host.innerHTML='<section class="card fade gx-offer"><span class="ib">'+gi("bell")+'</span><div class="tx"><b>تذكير يصل وحده</b><small>رسالةٌ قصيرة حين تُغلق الرغبات أو يجهز جدولك المقترح.</small></div>'
     +'<div class="gx-row two"><button type="button" class="btn small" id="gx-oon">'+gi("bell")+'فعّل التنبيهات</button><button type="button" class="btn alt small" id="gx-olater">لاحقاً</button></div></section>';
    document.getElementById("gx-oon").addEventListener("click",function(){gxEnable(document.getElementById("gx-oon"))});
    document.getElementById("gx-olater").addEventListener("click",function(){d.offerNow=false;gxDrop("gx-offer");api("POST","/api/public/me/push/offered",{})})})}

/* ── ٣) شارك مرشدك ── */
function gxStamp(iso){var d=new Date(iso);if(isNaN(d.getTime()))return"";
  var t=d.toLocaleTimeString("ar-KW-u-nu-latn",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"Asia/Kuwait"}),day=d.toLocaleDateString("ar-KW-u-nu-latn",{day:"numeric",month:"long",timeZone:"Asia/Kuwait"});
  var same=d.toLocaleDateString("en-CA",{timeZone:"Asia/Kuwait"})===new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Kuwait"});return(same?"اليوم ":day+" · ")+t}
function gxPaintShare(){if(!GX.d)return;var sh=GX.d.share||{active:false},host=gxHost("gx-share","me");if(!host)return;
  var h='<section class="card fade gx-card"><h2><span class="b">'+gi("qr")+'</span>شارك مرشدك'+(sh.active?'<span class="chip ok">'+ic("check","")+' نشطة</span>':'')+'</h2>'
   +'<div class="gx-facts"><span class="chip">'+ic("eye","")+' للقراءة فقط</span><span class="chip">'+ic("shield","")+' بلا اسمٍ ولا رقم</span><span class="chip">'+ic("clock","")+' 24 ساعة</span></div>';
  if(sh.active)h+='<p class="muted">مشاركةٌ نشطة تنتهي '+esc(gxStamp(sh.expiresAt))+'. رابطٌ جديد يُبطل السابق.</p><div class="gx-row"><button type="button" class="btn" id="gx-sgo">'+gi("qr")+'رابطٌ جديد</button><button type="button" class="btn alt" id="gx-sstop">'+ic("x")+'أوقف المشاركة</button></div>';
  else h+='<p class="muted">يمسح مرشدك الرمز من هاتفك فيرى خطتك: ما أنجزتَ ورغباتك وجدولك المقترح.</p><button type="button" class="btn" id="gx-sgo">'+gi("qr")+'شارك مرشدك</button>';
  host.innerHTML=h+'</section>';
  var go=document.getElementById("gx-sgo"),stop=document.getElementById("gx-sstop");
  if(go)go.addEventListener("click",function(){gxShare(go)});
  if(stop)stop.addEventListener("click",function(){gxStopShare(stop)})}
function gxStopShare(btn){if(btn)btn.disabled=true;api("POST","/api/public/me/share/off",{}).then(function(r){if(btn)btn.disabled=false;
  if(!r.ok){if(!signedOut(r))toast((r.d&&r.d.error)||"تعذّر إيقاف المشاركة",true);return}
  GX.d.share={active:false,expiresAt:""};closeSheet();gxPaintShare();toast("أُوقفت المشاركة")})}
function gxShare(btn){if(btn)btn.disabled=true;api("POST","/api/public/me/share",{}).then(function(r){if(btn)btn.disabled=false;
  if(!r.ok){if(!signedOut(r))toast((r.d&&r.d.error)||"تعذّر تجهيز الرابط",true);return}
  var d=r.d;GX.d.share={active:true,expiresAt:d.expiresAt};gxPaintShare();
  sheet('<div class="gx-share"><h3>شارك مرشدك</h3><div class="gx-qr">'+d.svg+'</div>'
   +'<div class="gx-facts" style="justify-content:center"><span class="chip">'+ic("eye","")+' للقراءة فقط</span><span class="chip">'+ic("shield","")+' بلا اسمٍ ولا رقم</span></div>'
   +'<p class="muted">يمسح مرشدك الرمز من هاتفك. تنتهي المشاركة '+esc(gxStamp(d.expiresAt))+'.</p>'
   +'<div class="cal-copy"><code id="gx-url">'+esc(d.url)+'</code><button type="button" class="btn alt" id="gx-copy" aria-label="انسخ الرابط">'+gi("copy")+'</button></div>'
   +'<button type="button" class="btn alt" id="gx-stop">'+ic("x")+'أوقف المشاركة</button></div>');
  document.getElementById("gx-stop").addEventListener("click",function(){gxStopShare(document.getElementById("gx-stop"))});
  document.getElementById("gx-copy").addEventListener("click",function(){var t=d.url;
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(function(){toast("نُسخ الرابط")},function(){toast("انسخ الرابط يدوياً",true)});
    else{var range=document.createRange();range.selectNodeContents(document.getElementById("gx-url"));var sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);toast("حدّد الرابط وانسخه")}})})}

function gxPaintAll(){if(S.view!=="home"||!GX.d)return;gxHost("gx-push","me");gxHost("gx-share","me");gxPaintNext();gxPaintOffer();gxPaintPush();gxPaintShare()}
/* بعد رسم الرئيسية: جلبٌ واحد، ثم تركيب البطاقات؛ والعدُّ التنازلي يتجدّد كل ٢٠ ثانية ما بقيت الرئيسية. */
function extrasHook(){gxSprite();GX.d=null;GX.html="";if(GX.tick){clearInterval(GX.tick);GX.tick=0}
  api("GET","/api/public/me/extras").then(function(r){if(!r.ok||S.view!=="home"||!document.getElementById("pane-now"))return;
    GX.d=r.d;gxPaintAll();
    GX.tick=setInterval(function(){if(S.view!=="home"||!document.getElementById("pane-now")){clearInterval(GX.tick);GX.tick=0;return}gxPaintNext()},20000)})}
`;
