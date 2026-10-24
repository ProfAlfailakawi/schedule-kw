/**
 * ── المظهر البصري لـ«بطاقتي» ────────────────────────────────────────────────
 *
 * إنفوجرافيك وأيقونات وكلامٌ قليل: لونٌ ثابتٌ لكل مقرّر (يُشتقّ من رقمه فيبقى هو نفسه في كل صفحة)، وأسبوعٌ مرسوم
 * بكتلٍ ملوّنة بدل جدولٍ نصيّ، ومربّعاتٌ رقميةٌ بأيقونات، وورقةٌ سفليةٌ واحدة للتقويم بدل زرّين مكرّرين.
 *
 * السكربتُ ES5 داخل قالبٍ نصّي في ‎server.ts‎: لا علامةَ اقتباسٍ مائلة ولا ‎${‎ فيه. وهو عرضٌ فقط؛ لا يغيّر بياناتٍ ولا حكماً.
 */

/** لونُ المقرّر من رقمه: الزاويةُ الذهبية تُبعد المقرّراتِ المتتالية بعضَها عن بعض. */
export const COURSE_COLOR_JS = String.raw`
var SKC={
 pal:[352,24,48,96,146,172,198,222,252,280,312,336],
 map:{},
 hash:function(id){var s=String(id==null?"":id),n=Math.abs(parseInt(s,10)||0);if(!n){for(var i=0;i<s.length;i++)n=(n*31+s.charCodeAt(i))%100003}n=n>>>0;n^=n>>>16;n=Math.imul(n,0x85ebca6b);n^=n>>>13;n=Math.imul(n,0xc2b2ae35);n^=n>>>16;return n>>>0},
 hue:function(id){var k=String(id==null?"":id);if(SKC.map[k]!=null)return SKC.map[k];return SKC.pal[SKC.hash(k)%SKC.pal.length]},
 /* في الصفحة الواحدة لا يتشارك مقرّران اللونَ ما دامت الألوانُ تكفي: الاصطدامُ يزيحه إلى أقرب لونٍ خالٍ، بترتيب الرقم فيبقى ثابتاً. */
 assign:function(ids){var seen={},list=[];ids.forEach(function(x){var k=String(x==null?"":x);if(!seen[k]){seen[k]=1;list.push(k)}});
  list.sort(function(a,b){return (parseInt(a,10)||0)-(parseInt(b,10)||0)||(a<b?-1:1)});
  var used={},m={};list.forEach(function(k){var i=SKC.hash(k)%SKC.pal.length,t=0;while(used[i]&&t<SKC.pal.length){i=(i+1)%SKC.pal.length;t++}used[i]=1;m[k]=SKC.pal[i]});SKC.map=m},
 color:function(id){return "hsl("+SKC.hue(id)+" 50% 36%)"}
};
`;

export const STAFF_CARD_VISUAL_CSS = String.raw`
/* ── مظهر «بطاقتي» ───────────────────────────────────────────────────────── */
.head-tools{display:flex;gap:8px;flex:none}
.hbtn{flex:none;display:inline-grid;place-items:center;width:44px;height:44px;padding:0;border:1px solid var(--line);border-radius:13px;background:var(--card);color:var(--dim);cursor:pointer;text-decoration:none;transition:color .15s,border-color .15s,transform .12s}
.hbtn:hover,.hbtn:focus-visible{color:var(--jade);border-color:var(--jade);outline:none}
.hbtn:active{transform:scale(.95)}
.hbtn[hidden]{display:none}
.hbtn svg{width:20px;height:20px}
.ico{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}

/* مربّعاتٌ رقمية بأيقونات: صفٌّ واحدٌ يُمرَّر. */
.stats{display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x proximity;padding:2px 2px 6px;margin-inline:-2px;scrollbar-width:none}
.stats::-webkit-scrollbar{display:none}
.stats .stat{flex:1 0 92px;grid-column:auto;scroll-snap-align:start;display:grid;justify-items:center;gap:2px;padding:12px 8px 10px;text-align:center}
.stat i{display:grid;place-items:center;width:30px;height:30px;margin-bottom:2px;border-radius:10px;background:color-mix(in srgb,var(--jade) 12%,transparent);color:var(--jade)}
.stat i svg{width:17px;height:17px}
.stats .stat b{font-size:22px}
.stats .stat span{font-size:11px;line-height:1.35;margin-top:0}

/* الأسبوعُ مرسوماً. */
.wk{margin:0 0 16px;border:1px solid var(--line);border-radius:20px;background:var(--card);overflow:hidden}
.wk-head,.wk-body{display:grid;grid-template-columns:34px repeat(5,minmax(0,1fr));gap:4px;padding-inline:10px}
.wk-head{padding-block:10px 6px;border-bottom:1px solid var(--line)}
.wk-head span{font-size:11px;font-weight:600;text-align:center;color:var(--brass);white-space:nowrap}
.wk-head span.is-off{color:var(--muted);font-weight:500}
.wk-body{position:relative;padding-block:10px 12px}
.wk-axis{position:relative}
.wk-axis em{position:absolute;inset-inline:0;transform:translateY(-50%);font:600 10px/1 ui-monospace,monospace;color:var(--muted);text-align:center;font-style:normal;direction:ltr}
.wk-col{position:relative;border-radius:10px;background:repeating-linear-gradient(to bottom,transparent 0,transparent calc(var(--hh) - 1px),var(--line) calc(var(--hh) - 1px),var(--line) var(--hh));background-color:color-mix(in srgb,var(--line) 14%,transparent)}
.wk-b{position:absolute;inset-inline:2px;display:flex;align-items:flex-start;justify-content:center;padding:4px 3px;border:0;border-radius:9px;background:color-mix(in srgb,var(--c) 17%,var(--card));color:var(--c);cursor:pointer;font:inherit;text-align:center;overflow:hidden;box-shadow:inset 3px 0 0 var(--c);transition:transform .14s,box-shadow .14s}
.wk-b:active{transform:scale(.96)}
.wk-b.on{background:var(--c);color:#fff;box-shadow:0 4px 12px color-mix(in srgb,var(--c) 40%,transparent)}
.wk-b span{font-size:10.5px;font-weight:700;line-height:1.25;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;word-break:break-word}
.wk-b.is-short span{-webkit-line-clamp:1;font-size:9.5px}

/* قائمةُ المقرّرات: لونُ المقرّر وأيامُه ووقتُه وقاعتُه. */
.wk-list{display:grid;gap:8px;margin:0 0 18px}
.wk-row{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;align-items:center;padding:12px 14px 12px 12px;border:1px solid var(--line);border-radius:16px;background:var(--card);overflow:hidden;transition:border-color .2s,box-shadow .2s,background .2s}
.wk-row::before{content:"";position:absolute;inset-block:0;inset-inline-start:0;width:5px;background:var(--c)}
.wk-row.on{border-color:var(--c);box-shadow:0 6px 18px color-mix(in srgb,var(--c) 22%,transparent);background:color-mix(in srgb,var(--c) 6%,var(--card))}
.wk-main{min-width:0;padding-inline-start:6px}
.wk-main b{display:block;font-size:14.5px;font-weight:700;line-height:1.35;color:var(--ink)}
.wk-main small{display:block;margin-top:1px;font-size:11.5px;color:var(--dim)}
.wk-days{display:flex;gap:4px;margin-top:7px}
.wk-days u{text-decoration:none;display:grid;place-items:center;width:25px;height:25px;border-radius:8px;font-size:11.5px;font-weight:700;background:color-mix(in srgb,var(--line) 55%,transparent);color:var(--muted)}
.wk-days u.on{background:var(--c);color:#fff}
.wk-side{display:grid;gap:6px;justify-items:end;text-align:end}
.wk-side time{font:700 13px/1.2 ui-monospace,monospace;color:var(--c);direction:ltr;white-space:nowrap}
.wk-room{display:inline-flex;align-items:center;gap:4px;font:600 11px/1 ui-monospace,monospace;color:var(--dim);direction:ltr;white-space:nowrap}
.wk-room svg{width:13px;height:13px}
@media screen{.pub-week{display:none}}

/* ورقةُ التقويم السفلية. */
body.sk-lock{overflow:hidden}
.sheet{position:fixed;inset:0;z-index:50;display:flex;align-items:flex-end;justify-content:center;background:rgba(16,22,20,.46);animation:sheet-fade .2s ease both}
.sheet[hidden]{display:none}
.sheet-card{width:min(100%,520px);padding:10px 16px calc(18px + env(safe-area-inset-bottom));border-radius:24px 24px 0 0;background:var(--card);box-shadow:0 -12px 40px rgba(16,22,20,.22);display:grid;gap:10px;animation:sheet-up .26s cubic-bezier(.2,.8,.3,1) both}
.sheet-grab{width:40px;height:4px;border-radius:99px;background:var(--line);justify-self:center;margin-bottom:2px}
.sheet-top{display:flex;align-items:center;gap:10px}
.sheet-top .mk{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:color-mix(in srgb,var(--jade) 13%,transparent);color:var(--jade)}
.sheet-top .mk svg{width:21px;height:21px}
.sheet-top b{flex:1;font-size:16px}
.sheet-top .hbtn{width:36px;height:36px;border-radius:11px}
.opt{display:flex;align-items:center;gap:12px;width:100%;height:auto;min-height:58px;padding:0 14px;border:1px solid var(--line);border-radius:16px;background:var(--card);color:var(--ink);font:inherit;font-size:14.5px;font-weight:600;text-decoration:none;text-align:start;cursor:pointer;transition:border-color .15s,background .15s}
.opt:hover,.opt:focus-visible{border-color:var(--jade);outline:none}
.opt:active{background:color-mix(in srgb,var(--jade) 6%,var(--card))}
.opt .oi{flex:none;display:grid;place-items:center;width:36px;height:36px;border-radius:11px;background:color-mix(in srgb,var(--jade) 11%,transparent);color:var(--jade)}
.opt .oi svg{width:19px;height:19px}
.opt span.t{flex:1;min-width:0}
.opt small{display:block;margin-top:2px;font-size:11px;font-weight:500;color:var(--muted);-webkit-user-select:all;user-select:all;word-break:break-all}
.opt .go{flex:none;width:18px;height:18px;color:var(--muted)}
.opt.primary{background:var(--jade);border-color:var(--jade);color:var(--on-accent)}
.opt.primary .oi{background:rgba(255,255,255,.18);color:var(--on-accent)}
.opt.primary .go{color:var(--on-accent)}
.opt[data-done] .oi{background:var(--jade);color:var(--on-accent)}
.switch{flex:none;position:relative;width:46px;height:28px;border-radius:99px;background:var(--line);transition:background .2s}
.switch::after{content:"";position:absolute;top:3px;inset-inline-start:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.25);transition:transform .2s}
.opt input:checked+.switch{background:var(--jade)}
.opt input:checked+.switch::after{transform:translateX(-18px)}
.opt input{position:absolute;opacity:0;pointer-events:none}
.sheet-note{display:flex;align-items:center;gap:7px;margin:0;font-size:12px;color:var(--dim);line-height:1.6}
.sheet-note svg{flex:none;width:15px;height:15px;color:var(--jade)}
@keyframes sheet-fade{from{opacity:0}to{opacity:1}}
@keyframes sheet-up{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}
@media (prefers-reduced-motion:reduce){.sheet,.sheet-card,.wk-b,.wk-row{animation:none;transition:none}}
/* هيكلُ انتظارٍ هادئ بعد إدخال الرقم. */
.skel{display:grid;gap:10px;max-width:380px;margin:18px auto 0}
.skel[hidden]{display:none}
.skel i{display:block;height:64px;border-radius:16px;background:linear-gradient(100deg,var(--soft) 30%,var(--card) 50%,var(--soft) 70%);background-size:220% 100%;animation:skel 1.3s ease-in-out infinite}
.skel i:first-child{height:44px;width:70%}
@keyframes skel{from{background-position:120% 0}to{background-position:-120% 0}}
@media (prefers-reduced-motion:reduce){.skel i{animation:none}}
@media print{.head-tools,.sheet,.wk,.wk-list{display:none!important}.pub-week{display:table!important}.stats{display:grid!important;overflow:visible}.stat i{display:none}}
`;

export const STAFF_CARD_VISUAL_JS = String.raw`
var SKI={
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 scale:'<path d="M12 3v18M5 7h14M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0z"/>',
 book:'<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>',
 days:'<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>',
 door:'<path d="M5 21V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v17"/><path d="M3 21h18"/><path d="M14 12h.01"/>',
 calplus:'<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4M12 13v5M9.5 15.5h5"/>',
 print:'<path d="M7 9V4h10v5"/><rect x="5" y="9" width="14" height="8" rx="2"/><path d="M8 14h8v6H8z"/>',
 apple:'<path d="M12 7c-1.5-2-4.7-1.4-5.3 1.2C6 11 7.6 16 9.4 18c.9 1 1.9 1 2.6.5.7.5 1.7.5 2.6-.5 1-1.1 2-3.2 2.4-4.5-1.7-.7-2.6-3.7.1-5.3C15.4 6.6 13 5.6 12 7z"/><path d="M12 7c0-1.3.6-2.4 1.6-3"/>',
 google:'<circle cx="12" cy="12" r="8.5"/><path d="M12 12h8M12 12l-4-4"/>',
 bell:'<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path d="M10 21h4"/>',
 link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
 sync:'<path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2"/><path d="M20 4v5h-5M4 20v-5h5"/>',
 chev:'<path d="M15 6l-6 6 6 6"/>',
 x:'<path d="M6 6l12 12M18 6 6 18"/>'
};
function skSvg(n){return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+(SKI[n]||"")+'</svg>'}
function skMin(t){var p=String(t||"0:0").split(":");return (+p[0]||0)*60+(+p[1]||0)}
function skHour(h){return h<12?h+" ص":(h===12?"12":(h-12)+" م")}
var SKD=["ح","ن","ث","ر","خ"];

/* مربّعاتُ الأرقام: أيقونةٌ فوق الرقم فوق اسمه. */
function skStats(items,ar){
 var ic=["clock","scale","book","days","door"];
 return items.map(function(x,i){return '<div class="stat"><i>'+skSvg(ic[i]||"book")+'</i><b>'+x[1]+'</b><span>'+x[0]+'</span></div>'}).join("");
}

/* الأسبوعُ مرسوماً: كتلٌ ملوّنةٌ بالدقائق، ومعها قائمةُ المقرّرات (لونُها وأيامُها ووقتُها وقاعتُها). */
function skWeek(d,esc,cl){
 var dn=function(r){return (r.days||[]).map(function(i){return d.byDay[i]?d.byDay[i].name:""}).filter(Boolean).join("، ")};
 var rows={},order=[];SKC.assign(d.byDay.reduce(function(a,day){return a.concat(day.rows.map(function(r){return r.courseId||r.code||r.name}))},[]));
 d.byDay.forEach(function(day){day.rows.forEach(function(r){var k=String(r.id);if(!rows[k]){rows[k]=r;order.push(k)}})});
 if(!order.length)return "";
 var lo=1440,hi=0;
 order.forEach(function(k){lo=Math.min(lo,skMin(rows[k].start));hi=Math.max(hi,skMin(rows[k].end))});
 var base=Math.floor(lo/60)*60,top=Math.ceil(hi/60)*60;if(top-base<240)top=base+240;
 var span=top-base,per=span>480?0.62:0.84,total=Math.round(span*per),hh=Math.round(60*per);
 var colorOf=function(r){return SKC.color(r.courseId||r.code||r.name)};
 var cols=d.byDay.map(function(day,di){
  var blocks=day.rows.map(function(r){
   var t=Math.round((skMin(r.start)-base)*per),h=Math.max(22,Math.round((skMin(r.end)-skMin(r.start))*per));
   return '<button type="button" class="wk-b'+(h<44?' is-short':'')+'" data-k="'+esc(r.id)+'" style="--c:'+colorOf(r)+';top:'+t+'px;height:'+h+'px" aria-label="'+esc(r.name||r.code)+" — "+esc(dn(r))+" "+esc(r.timeRange||"")+'"><span>'+esc(r.name||r.code)+'</span></button>';
  }).join("");
  return '<div class="wk-col" style="height:'+total+'px;--hh:'+hh+'px">'+blocks+'</div>';
 }).join("");
 var axis="";for(var h=base/60;h<=top/60;h++){axis+='<em style="top:'+Math.round((h*60-base)*per)+'px">'+skHour(h)+'</em>'}
 var head='<div class="wk-head"><span></span>'+d.byDay.map(function(day){return '<span class="'+(day.rows.length?'':'is-off')+'">'+esc(day.name)+'</span>'}).join("")+'</div>';
 var week='<section class="wk" aria-label="جدولك الأسبوعي">'+head+'<div class="wk-body"><div class="wk-axis" style="height:'+total+'px">'+axis+'</div>'+cols+'</div></section>';
 order.sort(function(a,b){var ra=rows[a],rb=rows[b];return (ra.days[0]-rb.days[0])||skMin(ra.start)-skMin(rb.start)});
 var list='<div class="wk-list">'+order.map(function(k){
  var r=rows[k];
  var days=SKD.map(function(n,i){return '<u class="'+((r.days||[]).indexOf(i)>=0?'on':'')+'">'+n+'</u>'}).join("");
  var sec=[r.section?'شعبة '+esc(r.section):"",cl?esc(cl(r)):""].filter(Boolean).join(" · ");
  var place=(r.room||r.hall)?'<span class="wk-room">'+skSvg("door")+esc(r.room||"")+"/"+esc(r.hall||"")+'</span>':"";
  return '<article class="wk-row" id="wkr-'+esc(k)+'" style="--c:'+colorOf(r)+'"><div class="wk-main"><b>'+esc(r.name||r.code)+'</b>'+(sec?'<small>'+sec+'</small>':'')+'<div class="wk-days" role="img" aria-label="'+esc(dn(r))+'">'+days+'</div></div><div class="wk-side"><time>'+esc(r.timeRange||"")+'</time>'+place+'</div></article>';
 }).join("")+'</div>';
 return week+list;
}
/* لمسُ كتلةٍ يضيء مقرّرَها في القائمة ويمرّر إليه. */
function skWeekWire(host){
 host.onclick=function(e){
  var b=e.target&&e.target.closest?e.target.closest(".wk-b"):null;if(!b)return;
  var k=b.getAttribute("data-k");
  [].forEach.call(host.querySelectorAll(".wk-b.on,.wk-row.on"),function(n){n.classList.remove("on")});
  [].forEach.call(host.querySelectorAll('.wk-b[data-k="'+k+'"]'),function(n){n.classList.add("on")});
  var row=document.getElementById("wkr-"+k);if(row){row.classList.add("on");row.scrollIntoView({block:"nearest",behavior:"smooth"})}
 };
}
`;
