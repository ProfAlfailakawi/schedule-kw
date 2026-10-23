/**
 * ── الإدخالُ الصوتيّ بالتفريغ النصّي ───────────────────────────────────────
 *
 * الصوتُ هنا طريقةُ إدخالٍ لا مستند: يتكلّم الأستاذ فيُكتب كلامُه في الحقل، ويراجعه
 * ويصحّحه بيده، ثم يوقّع كما كان. لا يُسجَّل صوتٌ ولا يُرسَل إلى خادمنا ولا يُخزَّن في
 * أي موضع: التفريغُ يتمّ داخل المتصفّح بخدمة الكلام التي فيه، وما يصلنا بعدها نصٌّ
 * عاديٌّ كأنه كُتب.
 *
 * وما فيه مقصودٌ كما هو:
 *   - **الزرُّ يظهر حين يدعمه المتصفّح فقط.** لا زرَّ معطَّلاً يَعِد بما لا يكون.
 *   - **الإذنُ عند أول ضغطة** لا عند فتح الصفحة: طلبُه عند الفتح يُخيف فيُرفض.
 *   - **ثلاثون ثانية ثم يتوقّف وحده**، وحلقةٌ تُفرَغ حول الزرّ مع الرقم المتبقّي.
 *   - **لا إرسالَ تلقائياً**: النصُّ يُوضع في الحقل ويُراجَع.
 *   - **الأرقامُ لاتينيةٌ والأوقاتُ ‎HH:MM‎**: الفارسيةُ والعربيةُ تُقرآن أرقاماً، و«٩:٣٠» تصير «09:30».
 *   - **الحدُّ أربعمئة حرف** كما في الحوار، مع عدّادٍ صغير.
 *   - **أخطاءُ الميكروفون** (إذنٌ مرفوض، لا صوت، انقطاع) جملةٌ قصيرةٌ في مكان الزرّ، ويبقى الحقلُ للكتابة.
 *
 * القاعدتان الخالصتان (viNormalize وviJoin) لا تعرفان المتصفّح، فتُختبران بمحرّك V8 كما هما.
 * ES5 عادي، ولا علامةَ اقتباسٍ مائلة ولا ‎${‎ داخل النص: هو قالبٌ نصّيٌّ في الخادم.
 * ويعتمد على ‎countOf‎ و‎AR‎ من ‎ARABIC_COUNT_SCRIPT‎ في الصفحة نفسها: عددُ الثواني يُصاغ بقاعدة العدّ لا بنصٍّ يدوي.
 */
export const VOICE_INPUT_LIMIT = 400;
export const VOICE_INPUT_SECONDS = 30;

export const VOICE_INPUT_SCRIPT = String.raw`
/* ── القاعدتان الخالصتان ─────────────────────────────────────────────────── */
function viNormalize(text){
 var s=String(text==null?"":text)
  .replace(/[٠-٩]/g,function(d){return String("٠١٢٣٤٥٦٧٨٩".indexOf(d))})
  .replace(/[۰-۹]/g,function(d){return String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))})
  .replace(/[‎‏‪-‮⁦-⁩]/g,"")
  .replace(/\s+/g," ");
 /* ٩:٣٠ و 9 : 30 ← 09:30. ساعةٌ بعدها دقيقتان فقط، وما خرج عن ساعات اليوم يبقى كما قيل. */
 s=s.replace(/(^|[^\d:])(\d{1,2})\s*[:：]\s*(\d{2})(?![\d:])/g,function(m,pre,h,mi){
  return(+h<=23&&+mi<=59)?pre+("0"+h).slice(-2)+":"+mi:m});
 return s.replace(/^\s+|\s+$/g,"")}
function viJoin(base,chunk,limit){
 base=String(base==null?"":base);var add=viNormalize(chunk);
 if(!add)return base.slice(0,limit);
 var sep=base&&!/\s$/.test(base)?" ":"";
 return (base+sep+add).slice(0,limit)}

/* ── المتحكّم ───────────────────────────────────────────────────────────── */
var VI={active:null,limit:__VI_LIMIT__,seconds:__VI_SECONDS__,onText:null,restarts:0};
VI.Rec=function(){return window.SpeechRecognition||window.webkitSpeechRecognition||null};
VI.ok=function(){return !!VI.Rec()};
VI.RING='<svg class="vi-ring" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle class="vi-track" cx="24" cy="24" r="21"/><circle class="vi-arc" cx="24" cy="24" r="21" pathLength="100"/></svg>';
VI.MIC='<svg class="vi-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
VI.html=function(key){
 if(!VI.ok())return "";
 return '<div class="vi" data-vi="'+key+'"><div class="vi-row"><span class="vi-count" data-vi-count></span>'+
  '<button type="button" class="vi-mic" data-mic="'+key+'" aria-pressed="false" aria-label="إملاء بالصوت">'+VI.RING+VI.MIC+'<span class="vi-sec" data-vi-sec aria-hidden="true"></span></button></div>'+
  '<p class="vi-msg" data-vi-msg role="status"></p>'+
  '<p class="vi-note">التفريغ يتم عبر خدمة الكلام في متصفحك، ولا يُحفظ الصوت.</p></div>'};
VI.field=function(key){return document.querySelector('[data-vi-field="'+key+'"]')};
VI.box=function(key){return document.querySelector('[data-vi="'+key+'"]')};
VI.say=function(key,text){var b=VI.box(key),m=b&&b.querySelector("[data-vi-msg]");if(m)m.textContent=text||""};
VI.count=function(key){var f=VI.field(key),b=VI.box(key),c=b&&b.querySelector("[data-vi-count]");if(f&&c)c.textContent=f.value.length+" / "+VI.limit};
VI.ERR={
 "not-allowed":"لم يُسمح للميكروفون. اسمح به من إعدادات المتصفح، أو اكتب بيدك.",
 "service-not-allowed":"لم يُسمح بخدمة الكلام في هذا المتصفح. اكتب بيدك.",
 "no-speech":"لم نسمع شيئاً. حاول مرة أخرى أو اكتب بيدك.",
 "audio-capture":"لا يوجد ميكروفون يعمل. اكتب بيدك.",
 "network":"تعذّر الاتصال بخدمة الكلام. اكتب بيدك.",
 "language-not-supported":"هذا المتصفح لا يفهم العربية إملاءً. اكتب بيدك."};
VI.paintActive=function(){
 document.querySelectorAll("[data-mic]").forEach(function(btn){
  var on=!!VI.active&&VI.active.key===btn.getAttribute("data-mic");
  btn.setAttribute("aria-pressed",on?"true":"false");btn.classList.toggle("vi-on",on);
  var sec=btn.querySelector("[data-vi-sec]"),arc=btn.querySelector(".vi-arc");
  if(on){var left=Math.max(0,VI.active.until-Date.now()),total=VI.seconds*1000;
   btn.setAttribute("aria-label","إيقاف الإملاء، تبقّى "+countOf(Math.ceil(left/1000),AR.second));
   if(sec)sec.textContent=String(Math.ceil(left/1000));
   if(arc)arc.style.strokeDashoffset=String(100-(left/total)*100)}
  else{btn.setAttribute("aria-label","إملاء بالصوت");if(sec)sec.textContent="";if(arc)arc.style.strokeDashoffset="100"}})};
VI.write=function(key,value){var f=VI.field(key);if(f){f.value=value}
 if(VI.onText)VI.onText(key,value);VI.count(key)};
VI.apply=function(){var a=VI.active;if(!a)return;VI.write(a.key,viJoin(a.base,a.final+" "+a.interim,VI.limit))};
VI.stop=function(why){var a=VI.active;if(!a)return;VI.active=null;clearInterval(a.timer);
 try{a.rec.onend=null;a.rec.onerror=null;a.rec.onresult=null;a.rec.stop()}catch(e){}
 /* ما استقرّ يُثبَّت بلا الجزء المؤقّت الذي لم يُحسم. */
 VI.write(a.key,viJoin(a.base,a.final,VI.limit));
 VI.say(a.key,why||"");VI.paintActive()};
VI.start=function(key){
 var Rec=VI.Rec(),f=VI.field(key);if(!Rec||!f)return;
 if(VI.active){var same=VI.active.key===key;VI.stop();if(same)return}
 var rec=new Rec();rec.lang="ar";rec.interimResults=true;rec.continuous=true;rec.maxAlternatives=1;
 var a=VI.active={key:key,rec:rec,base:f.value,final:"",interim:"",until:Date.now()+VI.seconds*1000,timer:0};
 VI.restarts=0;VI.say(key,"");
 rec.onresult=function(e){var fin="",tmp="";
  for(var i=0;i<e.results.length;i++){var r=e.results[i];if(r.isFinal)fin+=r[0].transcript+" ";else tmp+=r[0].transcript}
  a.final=fin;a.interim=tmp;VI.apply()};
 rec.onerror=function(e){var code=String(e&&e.error||"");if(code==="aborted")return;VI.stop(VI.ERR[code]||"انقطع الإملاء. يمكنك الكتابة بيدك.")};
 rec.onend=function(){
  /* انتهى قبل الوقت (صمتٌ طويل في بعض الهواتف): نُكمل إن بقي وقتٌ، بحدٍّ لا يدور بلا نهاية. */
  if(VI.active!==a)return;
  if(Date.now()<a.until-1500&&VI.restarts<3){VI.restarts++;
   a.base=viJoin(a.base,a.final,VI.limit);a.final="";a.interim="";
   try{rec.start();return}catch(err){}}
  VI.stop("")};
 try{rec.start()}catch(err){VI.active=null;VI.say(key,"تعذّر بدء الإملاء. اكتب بيدك.");return}
 a.timer=setInterval(function(){
  if(!VI.active||VI.active!==a){clearInterval(a.timer);return}
  if(!VI.field(a.key)){VI.stop("");return}
  if(Date.now()>=a.until){VI.stop("");return}
  VI.paintActive()},100);
 VI.paintActive()};
/* تُستدعى بعد كل رسمٍ للصفحة: الحقولُ تُبنى من جديد، فيُعاد ربطُ الأزرار وتُرسم حالةُ الإملاء الجارية. */
VI.wire=function(onText){VI.onText=onText||VI.onText;
 document.querySelectorAll("[data-mic]").forEach(function(btn){btn.onclick=function(){VI.start(btn.getAttribute("data-mic"))}});
 document.querySelectorAll("[data-vi-field]").forEach(function(f){VI.count(f.getAttribute("data-vi-field"))});
 if(VI.active&&!VI.field(VI.active.key))VI.stop("");
 VI.paintActive()};
document.addEventListener("input",function(e){var t=e.target,k=t&&t.getAttribute&&t.getAttribute("data-vi-field");if(k)VI.count(k)});
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="hidden"&&VI.active)VI.stop("")});
`;

/** الأنماط: حلقةٌ تُفرَغ حول الزرّ ونبضٌ خفيف أثناء الإملاء، ويُوقَف النبضُ لمن طلب تقليل الحركة. */
export const VOICE_INPUT_CSS = `
.vi{margin:6px 0 0}
.vi-row{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:52px}
.vi-count{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums;direction:ltr;unicode-bidi:isolate}
.vi-mic{position:relative;flex:none;inline-size:52px;block-size:52px;display:grid;place-items:center;padding:0;border:0;border-radius:50%;background:var(--soft);color:var(--accent);cursor:pointer;touch-action:manipulation}
.vi-mic:focus-visible{outline:3px solid rgba(31,107,92,.35);outline-offset:2px}
.vi-ring{position:absolute;inset:0;inline-size:100%;block-size:100%;transform:rotate(-90deg)}
.vi-track{fill:none;stroke:var(--line);stroke-width:3}
.vi-arc{fill:none;stroke:var(--accent);stroke-width:3;stroke-linecap:round;stroke-dasharray:100;stroke-dashoffset:100;opacity:0}
.vi-on .vi-arc{opacity:1}
.vi-ic{inline-size:22px;block-size:22px;position:relative}
.vi-sec{position:absolute;inset-block-end:-3px;inset-inline-end:-3px;min-inline-size:20px;block-size:20px;padding:0 5px;border-radius:999px;background:var(--accent);color:var(--on-accent,#fff);font:700 11px/20px system-ui,sans-serif;text-align:center;font-variant-numeric:tabular-nums;display:none}
.vi-on .vi-sec{display:block}
.vi-on{background:var(--accent-soft,var(--soft));animation:viPulse 1.4s ease-in-out infinite}
@keyframes viPulse{0%,100%{box-shadow:0 0 0 0 rgba(31,107,92,.28)}50%{box-shadow:0 0 0 9px rgba(31,107,92,0)}}
@media (prefers-reduced-motion:reduce){.vi-on{animation:none;box-shadow:0 0 0 3px rgba(31,107,92,.22)}}
.vi-msg{margin:2px 0 0;font-size:12.5px;color:var(--bad,#973c38);min-height:0}
.vi-msg:empty{display:none}
.vi-note{margin:2px 0 0;font-size:11.5px;color:var(--muted);line-height:1.6}
`;

/** يدخل السكربت بحدّه ومدّته الفعليّين، فلا يُكتب الرقمُ في موضعين. */
export const VOICE_INPUT_JS: string =
  VOICE_INPUT_SCRIPT.replace("__VI_LIMIT__", String(VOICE_INPUT_LIMIT)).replace("__VI_SECONDS__", String(VOICE_INPUT_SECONDS));
