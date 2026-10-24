/**
 * ── المظهر البصري لصفحة طلب الأستاذ ─────────────────────────────────────────
 *
 * ألوانُ المقرّرات في رسم الأسبوع، وأفضل ثلاثة مواعيد بأيامٍ وأيقونة، وشاراتُ حالةٍ بأيقونات، وخطٌّ زمنيّ للحركة،
 * وأيقونةُ رجوعٍ تحذّر من تعديلٍ لم يُرسل، وهيكلُ تحميلٍ هادئ. عرضٌ فقط: لا حكمَ ولا بيانات.
 * السكربتُ ES5 داخل قالبٍ نصّي في ‎server.ts‎: لا علامةَ اقتباسٍ مائلة ولا ‎${‎ فيه.
 */

export const REQUEST_VISUAL_CSS = String.raw`
/* ── مظهرٌ بصري ──────────────────────────────────────────────────────────── */
.wc-t,.wk-axis{block-size:260px}
.wb{overflow:hidden}
.wb span{display:block;padding:2px 2px 0;font-size:9px;line-height:1.15;font-weight:700;color:#fff;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:clip}
.wb[data-k=ghost] span{color:var(--c)}
.wb[data-k=del] span{color:#fff;text-shadow:0 0 3px rgba(0,0,0,.6)}
.wb::after{content:"";position:absolute;inset:-14px -3px}
.plib summary{min-inline-size:44px;min-block-size:44px}
.wb{background:var(--c,#86a898);min-block-size:9px}
.wb[data-k=ghost]{background:transparent;border:1.5px dashed var(--c,#6f7a74)}
.wb[data-k=chg],.wb[data-k=prop]{background:var(--c,#b57f10);box-shadow:0 0 0 2px var(--warn2),0 0 0 3.5px #b57f10}
.wb[data-k=add],.wb[data-k=fix]{background:var(--c,var(--ok));box-shadow:0 0 0 2px var(--ok2),0 0 0 3.5px var(--ok)}
.wb[data-k=del]{background:repeating-linear-gradient(135deg,var(--c,#ad2f28) 0 4px,#fff 4px 8px);opacity:.6}
.wk-leg{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:6px 12px;font-size:11.5px;color:var(--muted)}
.wk-leg li{display:inline-flex;align-items:center;gap:5px;min-width:0}
.wk-leg i{flex:none;width:10px;height:10px;border-radius:3px;background:var(--c)}
.wk-key{display:flex;flex-wrap:wrap;gap:4px 12px;margin:0 0 10px;font-size:11px;color:var(--muted2)}
.wk-key span{display:inline-flex;align-items:center;gap:5px}
.wk-key i{flex:none;width:12px;height:12px;border-radius:3px;background:#86a898}
.wk-key i[data-k=ghost]{background:transparent;border:1.5px dashed #6f7a74}
.wk-key i[data-k=chg]{box-shadow:0 0 0 1.5px #b57f10}
.wk-key i[data-k=add]{box-shadow:0 0 0 1.5px var(--ok)}
.wk-key i[data-k=del]{background:repeating-linear-gradient(135deg,#ad2f28 0 3px,#fff 3px 6px)}

/* أفضل ثلاثة مواعيد: أيامٌ ووقتٌ كبير وسببٌ بأيقونة. */
.best-row button{gap:5px;padding:10px 6px 9px}
.bp-d{display:flex;gap:3px;justify-content:center}
.bp-d u{text-decoration:none;display:grid;place-items:center;width:20px;height:20px;border-radius:7px;font-size:11px;font-weight:700;background:var(--ok2);color:var(--ok)}
.bp-t{font:700 17px/1.2 ui-monospace,monospace;color:var(--ink);direction:ltr}
.best-row small{display:inline-flex;align-items:center;gap:4px;font-size:11px;line-height:1.3;text-align:center}
.best-row small .sk-gi{flex:none;width:13px;height:13px;color:var(--ok)}

/* شاراتُ الحالة: أيقونةٌ وكلمة. */
.status{display:inline-flex;align-items:center;gap:4px}
.status .sk-gi{width:13px;height:13px;flex:none}

/* الرجوع. */
.topbar{display:flex;margin:0 0 8px}
.back-ic{display:inline-grid;place-items:center;inline-size:42px;block-size:42px;padding:0;border:1px solid var(--line);border-radius:13px;background:var(--card);color:var(--muted);cursor:pointer}
.back-ic:hover,.back-ic:focus-visible{color:var(--ok);border-color:var(--ok);outline:none}
.back-ic .sk-gi{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.leave{position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center;background:rgba(16,22,20,.46)}
.leave[hidden]{display:none}
.leave-card{inline-size:min(100%,480px);padding:20px 18px calc(18px + env(safe-area-inset-bottom));border-radius:22px 22px 0 0;background:var(--card);display:grid;gap:10px;justify-items:center;text-align:center;animation:leave-up .24s cubic-bezier(.2,.8,.3,1) both}
.leave-card .lv-ic{display:grid;place-items:center;inline-size:46px;block-size:46px;border-radius:15px;background:var(--warn2);color:var(--warn)}
.leave-card .lv-ic .sk-gi{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.leave-card b{font-size:16px}
.leave-card p{margin:0;font-size:13px;line-height:1.7;color:var(--muted)}
.leave-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;inline-size:100%;margin-top:4px}
.leave-row button{min-block-size:48px;border-radius:14px;font:inherit;font-weight:700;font-size:14px;cursor:pointer;border:1.5px solid var(--line);background:var(--card);color:var(--ink)}
.leave-row button[data-stay]{background:var(--ok);border-color:var(--ok);color:#fff}
@keyframes leave-up{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}

/* حركةُ الطلب خطّاً زمنياً بأيقونات. */
.activity-list{position:relative;gap:10px}
.activity-list::before{content:"";position:absolute;inset-block:18px;inset-inline-start:14px;inline-size:2px;background:var(--line);border-radius:2px}
.activity-item{grid-template-columns:30px minmax(0,1fr)!important;gap:4px 12px!important;padding:12px 12px 12px 14px;border:0!important;background:transparent!important;position:relative}
.activity-dot{display:grid!important;place-items:center;inline-size:30px!important;block-size:30px!important;border-radius:50%!important;margin:0!important;background:var(--card);border:2px solid var(--line);color:var(--muted);position:relative;z-index:1}
.activity-dot .sk-gi{inline-size:15px;block-size:15px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.activity-item[data-kind=add] .activity-dot,.activity-item[data-ev=item-fixed] .activity-dot,.activity-item[data-ev=proposal-accepted] .activity-dot,.activity-item[data-ev=settled] .activity-dot{background:var(--ok2);border-color:var(--ok);color:var(--ok)}
.activity-item[data-kind=change] .activity-dot,.activity-item[data-ev=alternative-offered] .activity-dot,.activity-item[data-ev=rejected-alt] .activity-dot,.activity-item[data-ev=department-replied] .activity-dot{background:var(--warn2);border-color:#b57f10;color:var(--warn)}
.activity-item[data-kind=delete] .activity-dot,.activity-item[data-ev=item-rejected] .activity-dot{background:var(--bad2);border-color:var(--bad);color:var(--bad)}
.activity-item[data-ev=submitted] .activity-dot,.activity-item[data-ev=received] .activity-dot{background:var(--ok);border-color:var(--ok);color:#fff}
.activity-item>time{grid-column:2;order:3;font-size:11px;color:var(--muted2);margin-top:2px}
.activity-main{grid-column:2;grid-row:1}
.activity-item>.activity-dot{grid-row:1/3}
.ev-was{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin:5px 0 2px;font-size:12px;color:var(--muted)}
.ev-was .bp-d u{background:var(--soft);color:var(--muted)}
.ev-was .sk-gi{inline-size:14px;block-size:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}

.appt{position:relative}
.appt::before{content:"";position:absolute;inset-block:10px;inset-inline-start:0;inline-size:4px;border-radius:0 4px 4px 0;background:var(--c)}
/* «وقت آخر» مطويّ حتى يُطلب. */
.more-time{margin:8px 0 2px}
.more-time summary{display:inline-flex;align-items:center;gap:6px;min-block-size:44px;padding:0 14px;border:1px dashed var(--line2);border-radius:12px;color:var(--muted);font-size:13px;font-weight:600;cursor:pointer;list-style:none}
.more-time summary::-webkit-details-marker{display:none}
.more-time summary .sk-gi{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.more-time[open] summary{border-style:solid;color:var(--ok);border-color:var(--ok)}
.more-time label.time{margin-top:8px}
.ends{margin-inline:2px!important}

.auto-note,.hint-pro,.shape-lead,.ends{display:flex;align-items:center;gap:7px}
.auto-note .sk-gi,.hint-pro .sk-gi,.shape-lead .sk-gi,.ends .sk-gi,.vshort .sk-gi{flex:none;width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.ends-src{margin-inline-start:auto;color:var(--muted2);display:inline-grid}
.vshort{display:inline-flex;align-items:center;gap:6px;font-weight:700}
.why{margin-top:4px;font-size:12px;color:var(--muted)}
.why summary{display:inline-block;cursor:pointer;list-style:none;color:var(--muted2);text-decoration:underline dotted;min-block-size:28px;line-height:28px}
.why summary::-webkit-details-marker{display:none}
.why p{margin:4px 0 0;line-height:1.7}

.alts.shapes button{display:inline-flex;align-items:center;gap:8px;padding:6px 10px;min-block-size:44px}
.sp{display:inline-flex;flex-direction:column;align-items:center;gap:2px}
.sp u{text-decoration:none;display:grid;place-items:center;width:22px;height:22px;border-radius:7px;font-size:11.5px;font-weight:700;background:var(--ok2);color:var(--ok)}
.sp b{font:700 11px/1 ui-monospace,monospace;color:var(--muted);direction:ltr}
.advice .vshort{color:var(--warn)}

/* هيكلُ التحميل. */
.skel{display:grid;gap:12px;padding:20px 4px}
.skel i{display:block;block-size:78px;border-radius:18px;background:linear-gradient(100deg,var(--soft) 30%,var(--card) 50%,var(--soft) 70%);background-size:220% 100%;animation:skel 1.3s ease-in-out infinite}
.skel i:first-child{block-size:58px;inline-size:68%}
@keyframes skel{from{background-position:120% 0}to{background-position:-120% 0}}
@media (prefers-reduced-motion:reduce){.skel i,.leave-card{animation:none}}
`;

export const REQUEST_VISUAL_JS = String.raw`
var SKDI={fsunday:"ح",fmonday:"ن",ftuesday:"ث",fwednesday:"ر",fthursday:"خ"};
var SKDN={"الأحد":"ح","الاثنين":"ن","الثلاثاء":"ث","الأربعاء":"ر","الخميس":"خ"};
function skPills(keys){return '<span class="bp-d" aria-hidden="true">'+keys.map(function(k){return '<u>'+(SKDI[k]||"")+'</u>'}).join("")+'</span>'}
function skPillsText(txt){var parts=String(txt||"").split("·").map(function(x){return x.trim()}).filter(Boolean);
 return '<span class="bp-d" aria-hidden="true">'+parts.map(function(n){return '<u>'+(SKDN[n]||esc(n.slice(0,1)))+'</u>'}).join("")+'</span>'}
function skShort(it){var n=String(courseOf(it)||"").trim().split(/\s+/);var w=n[0]||"";if(w.length<=3&&n[1])w+=" "+n[1];return w}
var SKSHORT=[
 [/^تتابع مرتفع على الأستاذ/,"layers","محاضرات متتالية كثيرة"],
 [/^تكرار شعب المقرر في نفس الوقت/,"layers","شعبة أخرى بالوقت نفسه"],
 [/^التدوير غير محقق/,"sunrise","كلها في فترة واحدة"],
 [/^داخل وقت اجتماع القسم/,"cal","وقت اجتماع القسم"],
 [/^خارج المعتاد تاريخياً/,"clock","وقت غير معتاد · اذكر السبب"],
 [/^يتقاطع هذا الوقت مع مقرّرٍ يشترك فيه طلبتك/,"alert","يتعارض مع مقرّر طلبتك"]
];
/* جملةُ الحكم قصيرةً بأيقونة، وأصلُها كاملاً تحت «التفاصيل» فلا يضيع منه شيء. */
function skVerdict(it){var n=String(it&&it.note||""),full=verdictText(it),ic="",short="";
 if(/لا يغطّيها/.test(n)){ic="calplus";short=it.shapes&&it.shapes.length?"الأيام لا تغطي الساعات · اختر نمطاً":"الساعات تحتاج توزيع القسم"}
 else{for(var k=0;k<SKSHORT.length;k++){if(SKSHORT[k][0].test(n)){ic=SKSHORT[k][1];short=SKSHORT[k][2];break}}}
 if(!short||short===full)return esc(full);
 return '<span class="vshort">'+gi(ic==="calplus"?"cal":ic)+esc(short)+'</span><details class="why"><summary>التفاصيل</summary><p>'+esc(full)+'</p></details>'}
function skAdvice(t){t=String(t||"");var m=/^موعدك الحالي أقصر من ساعات المقرّر \(([^)]+)\)/.exec(t);
 if(!m)return '<p class="advice" role="note">'+esc(t)+'</p>';
 return '<p class="advice" role="note"><span class="vshort">'+gi("alert")+'أقصر من ساعات المقرر ('+esc(m[1])+')</span></p><details class="why"><summary>التفاصيل</summary><p>'+esc(t)+'</p></details>'}
/* «الاثنين 80د · الأربعاء 80د · الخميس 50د» أيامٌ بأحرفها ودقائقها. */
function skShape(label){var parts=String(label||"").split("·").map(function(x){return x.trim()}).filter(Boolean),out="";
 parts.forEach(function(p){var m=/^(\S+)\s+([0-9]+)/.exec(p);if(m&&SKDN[m[1]])out+='<span class="sp"><u>'+SKDN[m[1]]+'</u><b>'+m[2]+'</b></span>';else out+='<span class="sp">'+esc(p)+'</span>'});
 return out||esc(label)}
function skCid(it){return (it&&(it.courseId||(it.before&&it.before.courseId)||(it.after&&it.after.courseId)))||courseOf(it)}
function skAssignColors(){SKC.assign(state.map(skCid))}
function skCourseColor(it){return SKC.color(skCid(it))}
var SKSTAT={keep:"check",change:"pen",add:"plus",delete:"trash"};
function skStat(act){return gi(SKSTAT[act]||"check")}
var SKEV={"link-created":"plus","link-opened":"eye","submitted":"send","received":"check","item-fixed":"check","item-rejected":"x","alternative-offered":"swap","alternative-chosen":"check","settled":"lock","schedule-approved":"shield","department-replied":"chat","instructor-replied":"chat","proposal-accepted":"check","rejected-alt":"swap"};
var SKACT={add:"plus",change:"pen",delete:"trash"};
function skEvIcon(k){return '<i class="activity-dot" aria-hidden="true">'+gi(SKEV[k]||"clock")+'</i>'}
function skActIcon(a){return '<i class="activity-dot" aria-hidden="true">'+gi(SKACT[a]||"clock")+'</i>'}
/* «رُفض بند» ثم «عُرض عليك بديل» للبند نفسه بطاقةٌ واحدة. */
function skMergeEvents(list){var out=[];list.forEach(function(e){var p=out[out.length-1];
 if(e.kind==="alternative-offered"&&p&&p.kind==="item-rejected"&&typeof e.itemIndex==="number"&&p.itemIndex===e.itemIndex){out[out.length-1]={kind:"rejected-alt",at:e.at,itemIndex:e.itemIndex,detail:e.detail,by:e.by||p.by};return}
 out.push(e)});return out}
function skLegend(){var seen={},li=[];state.forEach(function(it){var k=skCid(it);if(seen[k])return;seen[k]=1;li.push('<li style="--c:'+skCourseColor(it)+'"><i></i>'+esc(courseOf(it))+'</li>')});
 return (li.length>1?'<ul class="wk-leg" aria-label="ألوان المقرّرات">'+li.join("")+'</ul>':"")+
  ''}
function skKey(){return '<p class="wk-key" aria-hidden="true"><span><i data-k="ghost"></i>قبل التعديل</span><span><i data-k="chg"></i>معدّل</span><span><i data-k="add"></i>جديد/مثبَّت</span><span><i data-k="del"></i>محذوف</span></p>'}
/* الرجوع: يبقى الطلبُ المكتوب مسودةً على الجهاز، لكن يُسأل أولاً. */
function skBackTarget(){try{var r=document.referrer;if(r&&new URL(r).origin===location.origin&&r!==location.href)return r}catch(e){}return ""}
function skBackIcon(){if(!skBackTarget()&&history.length<2)return "";
 return '<div class="topbar"><button type="button" class="back-ic" id="backIc" aria-label="الرجوع إلى الصفحة السابقة" title="رجوع">'+gi("arR")+'</button></div>'}
function skGoBack(){var t=skBackTarget();if(t)location.href=t;else history.back()}
function skLeaveAsk(){var m=document.getElementById("leaveAsk");
 if(!m){m=document.createElement("div");m.id="leaveAsk";m.className="leave";m.hidden=true;
  m.innerHTML='<div class="leave-card" role="alertdialog" aria-modal="true" aria-labelledby="lvT"><span class="lv-ic">'+gi("alert")+'</span><b id="lvT">عندك تعديل لم يُرسل</b><p>مسودتك محفوظة على هذا الجهاز، لكنها لم تصل القسم بعد. إن خرجتَ الآن تجدها عند عودتك.</p><div class="leave-row"><button type="button" data-leave>خروج</button><button type="button" data-stay>أكمل التعديل</button></div></div>';
  document.body.appendChild(m);
  m.onclick=function(e){var t=e.target;if(t===m||(t.closest&&t.closest("[data-stay]"))){m.hidden=true;return}if(t.closest&&t.closest("[data-leave]")){m.hidden=true;skLeaving=true;skGoBack()}}}
 m.hidden=false;var b=m.querySelector("[data-stay]");if(b)b.focus()}
var skLeaving=false;
var skMore={};
function skMoreOpen(it,i){if(skMore[i])return true;return !!(it.start&&startChoices(it.days).indexOf(it.start)<0)}
host.addEventListener("click",function(e){var sm=e.target&&e.target.closest?e.target.closest("summary[data-more]"):null;if(!sm)return;var d=sm.parentNode;skMore[sm.getAttribute("data-more")]=!d.open});
host.addEventListener("click",function(e){var b=e.target&&e.target.closest?e.target.closest("#backIc"):null;if(!b)return;
 if(dirty)skLeaveAsk();else skGoBack()});
document.addEventListener("keydown",function(e){var m=document.getElementById("leaveAsk");if(e.key==="Escape"&&m&&!m.hidden)m.hidden=true});
`;
