/**
 * ── إضافات كرت الأستاذ (C4 · C5 · C6 · E1 · F3) ─────────────────────────────
 *
 * كتلةٌ مستقلة تُحقن في صفحة /r/ — لا تمسّ قلب الكرت (الفحص المسبق، القاعات،
 * التسابق) الذي يعمل عليه غيرها. كلُّ دالةٍ هنا ترسم من `data` الذي يرسله الخادم
 * ولا تقرّر شيئاً؛ والحكمُ على أي وقتٍ يبقى لمحرّك الفحص الواحد في الخادم.
 *
 *   tcRibbon      🔒 «انتهت فترة الطلبات» بتاريخها · 👁️ «للعرض فقط» · 🎓 مرحلة التدريب بعدّادٍ وحلقة نصاب
 *   tcCourseLock  🔒/🌱/🎯 على المقرر غير المتاح + 🌟 «اهتمام مستقبلي»
 *   tcStickHtml   🧲 «لاصق بمحاضرتي»: ⬅️ قبلها / ➡️ بعدها لكل محاضرة، شريطٌ زمني، «اقترح أفضل التصاق»
 *
 * يعتمد على ما في الصفحة: esc, gi, data, state, paint, recheckAll, TOKEN, fmtDays, payloadItems, rawItem.
 */
export const TEACHER_CARD_EXTRAS_CSS = `
.tc-ribbon{display:flex;align-items:center;gap:12px;margin:0 0 14px;padding:12px 14px;border-radius:16px;border:1px solid var(--line);background:var(--soft)}
.tc-ribbon .tc-ic{flex:none;display:grid;place-items:center;inline-size:42px;block-size:42px;border-radius:13px;background:var(--card);font-size:22px}
.tc-ribbon b{display:block;font-size:15px}.tc-ribbon small{display:block;color:var(--muted);font-size:12.5px;line-height:1.7}
.tc-ribbon[data-k=closed]{border-color:color-mix(in srgb,#8a6100 35%,var(--line));background:color-mix(in srgb,#f5c542 12%,var(--card))}
.tc-ribbon[data-k=view]{border-color:color-mix(in srgb,var(--accent) 30%,var(--line))}
.tc-ribbon[data-k=ta]{border-color:color-mix(in srgb,#6b4bd8 35%,var(--line));background:color-mix(in srgb,#6b4bd8 8%,var(--card))}
.tc-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.tc-chips span{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:999px;background:var(--card);border:1px solid var(--line);font-size:12px;font-weight:700}
.tc-ring{flex:none;margin-inline-start:auto;inline-size:58px;block-size:58px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--tc-ring,#2f8f6a) calc(var(--p)*1%),var(--line) 0);position:relative}
.tc-ring::after{content:"";position:absolute;inset:6px;border-radius:50%;background:var(--card)}.tc-ring b{position:relative;z-index:1;font-size:12px;direction:ltr}
.tc-ring[data-tone=near]{--tc-ring:#c98a00}.tc-ring[data-tone=full]{--tc-ring:#b3261e}
.tc-remind{margin:6px 0 0;font-weight:700;color:#8a6100}
.course-option[data-locked="1"]{opacity:.55;cursor:default;position:relative}
.course-option[data-locked="1"] .tc-lock{display:block;font-size:11.5px;color:var(--muted);margin-top:2px}
.tc-star{position:absolute;inset-block-start:6px;inset-inline-end:6px;border:0;background:none;font-size:18px;cursor:pointer;opacity:1;filter:grayscale(1)}
.tc-star[aria-pressed=true]{filter:none}
.tc-stick{margin:10px 0}.tc-stick>button.tc-open{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:6px 14px;border-radius:12px;border:1px dashed var(--accent);background:transparent;color:var(--accent);font-weight:700;font-family:inherit;cursor:pointer}
.tc-stick-panel{margin-top:8px;padding:10px;border:1px solid var(--line);border-radius:14px;background:var(--card);display:grid;gap:8px}
.tc-best{display:flex;flex-wrap:wrap;gap:6px}.tc-best button,.tc-side{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:6px 10px;border-radius:11px;border:1px solid var(--line);background:var(--soft);font-family:inherit;font-weight:700;cursor:pointer;color:var(--ink)}
.tc-side[data-tone=ok]{border-color:#2f8f6a}.tc-side[data-tone=warn]{border-color:#c98a00}.tc-side[data-tone=bad]{opacity:.55;cursor:not-allowed}
.tc-anchor{display:grid;gap:6px;padding:8px;border-radius:12px;background:var(--soft)}.tc-anchor-h{display:flex;justify-content:space-between;gap:8px;font-size:13px}
.tc-anchor-row{display:flex;gap:6px;justify-content:space-between}
.tc-tl{position:relative;block-size:14px;border-radius:7px;background:var(--line);overflow:hidden}.tc-tl i{position:absolute;inset-block:0;border-radius:7px}
.tc-tl i.a{background:var(--accent)}.tc-tl i.c{background:#2f8f6a;opacity:.8}.tc-tl i.c[data-tone=warn]{background:#c98a00}.tc-tl i.c[data-tone=bad]{background:#b3261e;opacity:.45}
.tc-tag{font-size:11px;padding:1px 6px;border-radius:999px;background:var(--card);border:1px solid var(--line)}
@media(max-width:520px){.tc-anchor-row{flex-direction:column}.tc-side{justify-content:center}}
`;

export const TEACHER_CARD_EXTRAS_JS = `
function tcDate(iso){try{return new Intl.DateTimeFormat("ar-KW-u-nu-latn",{day:"numeric",month:"long",year:"numeric",hour:"numeric",minute:"2-digit",timeZone:"Asia/Kuwait"}).format(new Date(iso))}catch(e){return ""}}
function tcStates(r){var f=0,x=0,p=0;(r.items||[]).forEach(function(it){if(it.action==="keep")return;var s=it.decision&&it.decision.state;if(s==="fixed")f++;else if(s==="rejected")x++;else p++});return{f:f,x:x,p:p}}
function tcRibbon(r,open){if(!data)return "";var mode=data.mode||"edit";
 if(mode==="ta"){var ta=data.ta||{},left=Date.parse(ta.closesAt||"")-Date.now(),ring=data.taLoad;
  var cd=left>0?(Math.floor(left/864e5)?Math.floor(left/864e5)+"ي ":"")+Math.floor(left%864e5/36e5)+"س "+Math.floor(left%36e5/6e4)+"د":"انتهت";
  return '<div class="tc-ribbon" data-k="ta" role="status"><span class="tc-ic" aria-hidden="true">🎓</span><div><b>مرحلة التدريب · اختر من الشعب الشاغرة</b><small>⏳ <bdi dir="ltr">'+esc(cd)+'</bdi> · لا وقت ولا شعبة ولا قاعة جديدة</small>'+(ta.remind&&left>0?'<p class="tc-remind">🔔 تذكير: النافذة تُغلق قريباً</p>':'')+'</div>'+
   (ring?'<span class="tc-ring" data-tone="'+esc(ring.tone)+'" style="--p:'+Math.round(ring.ratio*100)+'" title="'+esc(ring.label)+'" aria-label="'+esc(ring.label)+'"><b>'+ring.hours+'/'+ring.load+'</b></span>':'')+'</div>'}
 if(mode==="view")return '<div class="tc-ribbon" data-k="view" role="status"><span class="tc-ic" aria-hidden="true">👁️</span><div><b>للعرض فقط</b><small>جدولك المعتمد وحالة طلباتك</small></div></div>';
 if(open)return "";
 var s=tcStates(r),when=r.window&&r.window.closesAt?tcDate(r.window.closesAt):"";
 return '<div class="tc-ribbon" data-k="closed" role="status"><span class="tc-ic" aria-hidden="true">🔒</span><div><b>انتهت فترة الطلبات</b><small>'+(when?'منذ '+esc(when)+' · ':'')+'جدولك المعتمد أدناه للاطلاع</small>'+
  ((s.f||s.x||s.p)?'<div class="tc-chips">'+(s.f?'<span>✅ ثُبّت <b>'+s.f+'</b></span>':'')+(s.x?'<span>❌ رُفض <b>'+s.x+'</b></span>':'')+(s.p?'<span>⏳ قيد المراجعة <b>'+s.p+'</b></span>':'')+'</div>':'')+'</div></div>'}
function tcCourseLock(c){if(!c.offering)return "";var o=c.offering,on=(data.interest||[]).indexOf(Number(c.id))>=0;
 return '<span class="tc-lock">'+esc(o.icon+" "+o.line)+'</span><span role="button" tabindex="0" class="tc-star" data-star="'+c.id+'" data-college="'+c.collegeId+'" data-section="'+c.sectionId+'" aria-pressed="'+on+'" aria-label="اهتمام مستقبلي" title="🌟 اهتمام مستقبلي">🌟</span>'}
function tcStar(option,e){var b=e&&e.target&&e.target.closest?e.target.closest("[data-star]"):null;if(!b)return;var on=b.getAttribute("aria-pressed")!=="true";b.setAttribute("aria-pressed",String(on));
 var id=Number(b.dataset.star);data.interest=(data.interest||[]).filter(function(x){return x!==id});if(on)data.interest.push(id);
 fetch("/api/public/request/"+encodeURIComponent(TOKEN)+"/interest",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({courseId:id,collegeId:Number(b.dataset.college),sectionId:Number(b.dataset.section),on:on})}).catch(function(){})}
var tcStick={};
function tcMin(t){var p=String(t||"0:0").split(":");return Number(p[0])*60+Number(p[1]||0)}
function tcBar(a,c){var span=720,o=480,pos=function(t){return Math.max(0,Math.min(100,(tcMin(t)-o)/span*100))};
 return '<div class="tc-tl" aria-hidden="true"><i class="a" style="inset-inline-start:'+pos(a.start)+'%;inline-size:'+(pos(a.end)-pos(a.start))+'%"></i>'+(c?'<i class="c" data-tone="'+esc(c.tone)+'" style="inset-inline-start:'+pos(c.start)+'%;inline-size:'+(pos(c.end)-pos(c.start))+'%"></i>':'')+'</div>'}
function tcShift(c){return c.shift?(c.side==="after"?"+":"−")+c.shift+"د":"ملاصق"}
function tcSideBtn(i,c,label){if(!c)return '<button type="button" class="tc-side" data-tone="bad" disabled>'+label+' · —</button>';
 return '<button type="button" class="tc-side" data-tone="'+esc(c.tone)+'" data-stick="'+i+'" data-days="'+esc(c.days.join(","))+'" data-start="'+esc(c.start)+'"'+(c.tone==="bad"?' disabled title="'+esc(c.reason||"غير متاح")+'"':'')+'>'+label+' <bdi dir="ltr">'+esc(c.start+"–"+c.end)+'</bdi> <span class="tc-tag">'+(c.tone==="bad"?"⛔":tcShift(c))+'</span>'+(c.sameRoom?'<span class="tc-tag">🏫 نفس القاعة</span>':c.sameBuilding?'<span class="tc-tag">🏢 نفس المبنى</span>':'')+'</button>'}
function tcStickHtml(it,i){if(!data||data.mode!=="edit"||!data.windowOpen||it.offeringId)return "";var st=tcStick[i];
 var h='<div class="tc-stick"><button type="button" class="tc-open" data-stick-open="'+i+'" aria-expanded="'+(!!st)+'">🧲 لاصق بمحاضرتي</button>';
 if(!st)return h+'</div>';
 if(st.loading)return h+'<div class="tc-stick-panel" role="status">…</div></div>';
 if(st.error)return h+'<div class="tc-stick-panel" role="status">'+esc(st.error)+'</div></div>';
 var pick=function(rowId,side){return(st.best||[]).find(function(c){return c.anchorRowId===rowId&&c.side===side})};
 h+='<div class="tc-stick-panel">';
 if(st.top&&st.top.length)h+='<div><b>✨ اقترح أفضل التصاق</b><div class="tc-best">'+st.top.map(function(c){var a=(st.anchors||[]).find(function(x){return x.rowId===c.anchorRowId})||{};return '<button type="button" data-stick="'+i+'" data-days="'+esc(c.days.join(","))+'" data-start="'+esc(c.start)+'">'+(c.side==="after"?"➡️":"⬅️")+' '+esc(fmtDays(c.days))+' <bdi dir="ltr">'+esc(c.start)+'</bdi> · '+esc(a.title||"")+'</button>'}).join("")+'</div></div>';
 else h+='<p>لا التصاق متاح هذا الأسبوع.</p>';
 h+=(st.anchors||[]).map(function(a){var b=pick(a.rowId,"before"),f=pick(a.rowId,"after");
  return '<div class="tc-anchor"><div class="tc-anchor-h"><b>'+esc(a.title)+'</b><span>'+esc(fmtDays(a.days))+' <bdi dir="ltr">'+esc(a.start+"–"+a.end)+'</bdi></span></div>'+tcBar(a,f&&f.tone!=="bad"?f:(b&&b.tone!=="bad"?b:null))+
   '<div class="tc-anchor-row">'+tcSideBtn(i,b,"⬅️ قبلها")+tcSideBtn(i,f,"➡️ بعدها")+'</div></div>'}).join("");
 return h+'</div></div>'}
function tcStickLoad(i){tcStick[i]={loading:true};paint();
 /* البندُ نفسُه يُرسل «تعديلاً» ولو لم يتغيّر بعد (payloadItems يرسله «إبقاء»). */
 var items=payloadItems();items[i]=rawItem(state[i]);
 fetch("/api/public/request/"+encodeURIComponent(TOKEN)+"/stick",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:items,itemIndex:i})})
 .then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||"تعذّر الحساب");return d})})
 .then(function(d){tcStick[i]=d;paint()}).catch(function(e){tcStick[i]={error:e.message};paint()})}
function tcWire(){host.querySelectorAll("[data-stick-open]").forEach(function(b){b.onclick=function(){var i=Number(b.dataset.stickOpen);if(tcStick[i]){delete tcStick[i];paint()}else tcStickLoad(i)}});
 host.querySelectorAll("[data-stick]").forEach(function(b){b.onclick=function(){if(b.disabled)return;var i=Number(b.dataset.stick),it=state[i];if(!it)return;it.days=String(b.dataset.days||"").split(",").filter(Boolean);it.start=b.dataset.start;it.autoNote="";delete tcStick[i];paint();recheckAll()}})}
`;
