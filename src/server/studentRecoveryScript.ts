/**
 * ── مساري: «نسيت رمزي» برمز القسم، و«أبقِ ملفّي»، واشتراكُ التقويم ─────────────
 *
 * يُحقن في سكربت الصفحة (src/server/studentHomePage.ts) فيرى دوالَّها (api, sheet, otp, toast…)،
 * وفي صفحتها ثلاثةُ مواضع فقط تناديه: «نسيت رمزي» ← `openForgot()`، والرئيسية ← `recoveryHomeHook()`،
 * وبطاقة «جدولي المقترح» ← `calSubRow()` و`openCalSub()`.
 *
 * بلا روابط خارجية في السكربت: روابطُ Google وOutlook يبنيها الخادم (/api/public/me/calendar).
 */

export const STUDENT_RECOVERY_CSS = `
/* ── نسيت رمزي: خياران كبيران ── */
.rv-opts{display:grid;gap:10px}
.rv-opt{display:flex;align-items:center;gap:14px;inline-size:100%;min-block-size:68px;padding:12px 14px;border-radius:18px;border:1.5px solid var(--line-strong);background:var(--card);text-align:start;cursor:pointer;transition:border-color .15s,transform .15s}
.rv-opt:hover,.rv-opt:focus-visible{border-color:var(--accent)}
.rv-opt:active{transform:scale(.99)}
.rv-opt .ic{inline-size:44px;block-size:44px;border-radius:14px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);flex:none}
.rv-opt.bad .ic{background:var(--bad-soft);color:var(--bad)}
.rv-opt .tx{display:grid;gap:2px;flex:1;min-inline-size:0}
.rv-opt b{font-size:15.5px;color:var(--ink)}
.rv-opt small{font-size:12.5px;color:var(--muted);line-height:1.6}
.rv-opt>.i:last-child{color:var(--muted);inline-size:18px;block-size:18px}
.rv-who{display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;color:var(--dim)}
.rv-who bdi{font-variant-numeric:tabular-nums;letter-spacing:.08em}
.rv-code{letter-spacing:.42em;text-align:center;font:700 28px/1 ui-monospace,SFMono-Regular,Menlo,monospace;direction:ltr;padding-inline-start:calc(16px + .42em)}
.rv-head{display:flex;align-items:center;gap:12px}
.rv-head .ic{inline-size:44px;block-size:44px;border-radius:14px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);flex:none}
/* ── طلبُ حذفٍ معلَّق وصاحبُه داخل ── */
.rv-pend{display:flex;align-items:center;gap:12px;margin-block:14px;padding:14px 16px;border-radius:var(--r);background:var(--bad-soft);color:var(--bad);border:1px solid color-mix(in srgb,var(--bad) 22%,transparent)}
.rv-pend .tx{flex:1;display:grid;gap:2px;font-size:13.5px;line-height:1.6}
.rv-pend .tx b{font-size:14.5px}
.rv-pend .btn{inline-size:auto;flex:none;min-block-size:44px;padding-inline:16px;background:var(--bad);color:#fff;font-size:14.5px;box-shadow:none}
/* ── اشتراكُ التقويم ── */
.cal-go{display:grid;gap:10px;min-inline-size:0}
.cal-go>*{min-inline-size:0}
.cal-go a.btn{text-decoration:none}
.cal-go .pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cal-go .pair .btn{font-size:15px}
.cal-go .brand{font:700 15px/1 inherit}
.cal-copy{min-inline-size:0;max-inline-size:100%;display:flex;align-items:center;gap:8px;padding:6px 6px 6px 12px;border-radius:14px;background:var(--card2);border:1px solid var(--line);direction:ltr}
.cal-copy code{flex:1;min-inline-size:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--dim)}
.cal-copy .btn{inline-size:auto;min-block-size:44px;padding-inline:14px;font-size:14px;direction:rtl}
`;

export const STUDENT_RECOVERY_SCRIPT = String.raw`
/* ── نسيت رمزي: رمزٌ من القسم، أو حذفُ الملف ── */
function openForgot(){
  sheet('<h3>نسيت رمزك؟</h3><div class="rv-opts">'
    +'<button type="button" class="rv-opt" id="rvDept"><span class="ic">'+ic("building")+'</span><span class="tx"><b>معي رمزٌ من قسمي</b><small>يعطيك إياه قسمك حين تُريه بطاقتك المدنية</small></span>'+ic("fwd")+'</button>'
    +'<button type="button" class="rv-opt bad" id="rvDel"><span class="ic">'+ic("trash")+'</span><span class="tx"><b>احذف ملفّي وابدأ من جديد</b><small>بعد 30 يوماً، ويُلغى إن تذكّرت رمزك</small></span>'+ic("fwd")+'</button>'
    +'</div><div id="rvSince"></div><button class="btn alt" id="rc">تراجع</button>');
  document.getElementById("rc").addEventListener("click",closeSheet);
  document.getElementById("rvDept").addEventListener("click",openRecover);
  document.getElementById("rvDel").addEventListener("click",openResetRequest);
  /* من لم يُنشئ ملفاً قطّ ثم وجد «أهلاً بعودتك»: تاريخُ الإنشاء يقول له إن غيره أنشأه، والقسمُ يعيده. */
  api("POST","/api/public/me/identity",{civil:S.civil}).then(function(r){var box=document.getElementById("rvSince");if(!box||!r.ok||!r.d.since)return;
    box.innerHTML='<div class="note">'+ic("info")+'<span>أُنشئ هذا الملف في '+esc(fmtDate(r.d.since+"T12:00:00Z"))+'. لم تُنشئه أنت؟ قسمك يعيده إليك.</span></div>'})}
function openResetRequest(){
  sheet('<h3>حذف الملف</h3><p class="lead">حمايةً لملفّك لا يستطيع أحدٌ استرجاع الرمز. يمكنك طلب حذف الملف: يُحذف بعد 30 يوماً، وإن تذكّرت رمزك قبلها وأدخلته أُلغي الطلب. ثم تنشئ ملفاً جديداً بدقائق.</p>'+errBox("rerr")+'<button class="btn danger" id="rq">اطلب حذف ملفي</button><button class="btn alt" id="rc">تراجع</button>');
  document.getElementById("rc").addEventListener("click",closeSheet);
  document.getElementById("rq").addEventListener("click",function(){var b=this;b.disabled=true;api("POST","/api/public/me/reset",{civil:S.civil}).then(function(r){b.disabled=false;if(!r.ok){showErr("rerr",r.d.error||"تعذّر الطلب");return}closeSheet();S.resetPending=true;S.resetAt=r.d.deleteAt;toast("سيُحذف ملفّك بعد 30 يوماً ما لم تدخل برمزك.");setView("code")})})}
function openRecover(){var masked=String(S.civil||"").replace(/^(\d*)(\d{3})$/,function(m,a,b){return a.replace(/\d/g,"•")+b});
  sheet('<div class="rv-head"><span class="ic">'+ic("key")+'</span><h3>افتح ملفّك برمز القسم</h3></div>'
    +'<p class="rv-who">'+ic("user")+'<bdi dir="ltr">'+esc(masked)+'</bdi></p>'
    +'<div class="field"><label for="rvR">رمز القسم</label><input class="inp rv-code" id="rvR" inputmode="numeric" autocomplete="one-time-code" maxlength="6" dir="ltr" placeholder="••••••"></div>'
    +otp("rvA","رمزك الجديد")+'<div id="rvBw" hidden>'+otp("rvB","أعد كتابته")+'</div>'
    +'<button type="button" class="sw" role="switch" id="rvRem" aria-checked="'+(S.remember?"true":"false")+'"><span class="t">هذا جهازي الشخصي<small>يبقى دخولك 180 يوماً</small></span><span class="tg"></span></button>'
    +errBox("rverr")+'<button class="btn" id="rvGo" disabled>افتح ملفّي '+ic("fwd")+'</button>');
  var r="",a="",b="",go=document.getElementById("rvGo"),ri=document.getElementById("rvR"),rem=document.getElementById("rvRem");
  function sync(){go.disabled=!(r.length===6&&a.length===6&&b.length===6);showErr("rverr",a.length===6&&b.length===6&&a!==b?"الرمزان غير متطابقين":"")}
  ri.addEventListener("input",function(){ri.value=digits(ri.value).slice(0,6);r=ri.value;if(r.length===6){var n=document.getElementById("rvA");if(n&&!a)n.focus()}sync()});
  wireOtp("rvA",function(v){a=v;var w=document.getElementById("rvBw");if(v.length===6&&w.hidden){w.hidden=false;var c=document.getElementById("rvB");if(c)c.focus()}sync()});
  wireOtp("rvB",function(v){b=v;sync()});
  rem.addEventListener("click",function(){S.remember=!S.remember;rem.setAttribute("aria-checked",S.remember?"true":"false")});
  go.addEventListener("click",function(){if(a!==b){showErr("rverr","الرمزان غير متطابقين");return}go.disabled=true;go.textContent="يتحقق…";
    api("POST","/api/public/me/recover",{civil:S.civil,recovery:r,code:a,remember:S.remember}).then(function(x){
      if(!x.ok){go.disabled=false;go.innerHTML='افتح ملفّي '+ic("fwd");var left=x.d.attemptsLeft;showErr("rverr",(x.d.error||"تعذّرت الاستعادة")+(left>0&&left<5?" (تبقّى "+countOf(left,AR.attempt)+")":""));return}
      closeSheet();toast("عاد ملفّك إليك. راجع اسمك في «ملفي».");afterSignIn()})});
  setTimeout(function(){try{ri.focus()}catch(e){}},60)}

/* ── طلبُ حذفٍ معلَّق وصاحبُه داخلٌ بجلسته: فتحُ الصفحة لا يُلغيه، رمزُه يُلغيه ── */
function recoveryHomeHook(){var p=S.state&&S.state.profile;if(!p||!p.resetPending||document.getElementById("rvPend"))return;
  var el=document.createElement("section");el.className="rv-pend fade";el.id="rvPend";el.setAttribute("role","status");
  el.innerHTML=ic("trash")+'<span class="tx"><b>سيُحذف ملفّك</b><span>في '+esc(fmtDate(p.keepsUntil))+' ما لم تُبقِه.</span></span><button type="button" class="btn" id="rvKeep">أبقِه</button>';
  app.insertBefore(el,app.firstChild);
  document.getElementById("rvKeep").addEventListener("click",function(){
    sheet('<h3>أبقِ ملفّك</h3><p class="lead">أدخل رمزك الشخصي ليُلغى طلبُ الحذف.</p>'+otp("rvK","رمزك الشخصي")+errBox("rvkerr")+'<button class="btn" id="rvKs" disabled>'+ic("check")+' أبقِ ملفّي</button>');
    var c="",ks=document.getElementById("rvKs");wireOtp("rvK",function(v){c=v;ks.disabled=v.length!==6});
    ks.addEventListener("click",function(){ks.disabled=true;api("POST","/api/public/me/keep",{code:c}).then(function(r){
      if(!r.ok){ks.disabled=false;var left=r.d.attemptsLeft;showErr("rvkerr",(r.d.error||"تعذّر الإلغاء")+(left>0&&left<5?" (تبقّى "+countOf(left,AR.attempt)+")":""));return}
      if(r.d.profile)S.state.profile=r.d.profile;closeSheet();var b=document.getElementById("rvPend");if(b)b.remove();toast("أُلغي طلب الحذف")})})})}

/* ── اشتراكُ «جدولي المقترح» في تقويم الهاتف ── */
function calSubRow(){return '<div class="row" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn alt small" data-act="calsub" style="inline-size:auto">'+ic("cal")+'اشترك بجدولي في تقويم هاتفك</button></div>'}
function openCalSub(){
  sheet('<div class="rv-head"><span class="ic">'+ic("cal")+'</span><h3>جدولي في تقويم هاتفي</h3></div><p class="muted">يظهر جدولك المقترح في تقويمك ويتحدّث وحده.</p><div id="calGo" class="cal-go"><div class="skel"></div></div>');
  api("GET","/api/public/me/calendar").then(function(r){var box=document.getElementById("calGo");if(!box)return;
    if(!r.ok){box.innerHTML='<div class="err" role="alert">'+esc(r.d.error||"تعذّر تجهيز الرابط")+'</div>';return}
    var d=r.d;
    box.innerHTML='<a class="btn" id="calApple" href="'+esc(d.apple)+'">'+ic("phone")+'آيفون وماك</a>'
      +'<div class="pair"><a class="btn alt" id="calGoogle" href="'+esc(d.google)+'" target="_blank" rel="noopener"><span class="brand">Google</span></a><a class="btn alt" id="calOutlook" href="'+esc(d.outlook)+'" target="_blank" rel="noopener"><span class="brand">Outlook</span></a></div>'
      +'<div class="cal-copy"><code id="calUrl">'+esc(d.https)+'</code><button type="button" class="btn alt" id="calCopy" aria-label="انسخ رابط الاشتراك">انسخ</button></div>'
      +'<p class="fine">'+ic("shield","")+' لا اسمَ ولا رقمَ في الرابط. إن غيّرت رمزك فاشترك من جديد.</p>';
    document.getElementById("calCopy").addEventListener("click",function(){var t=d.https;
      function done(){toast("نُسخ الرابط")}
      if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(done,function(){toast("انسخ الرابط يدوياً",true)});
      else{var range=document.createRange();range.selectNodeContents(document.getElementById("calUrl"));var sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);toast("حدّد الرابط وانسخه")}})})}
`;
