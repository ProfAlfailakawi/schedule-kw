/**
 * ── منطقُ كرت الأستاذ الصغير (الجولة الخامسة) ─────────────────────────────────
 *
 * دوالٌّ نقيّة بلغة المتصفح (ES5) تُحقن في صفحة /r/ وتُختبر بمحرّك V8 وحدها
 * (tests/teacher-card-r5-audit.ts) بساعةٍ ثابتة ومخزنٍ مزيّف:
 *
 *   الحركة      كلُّ نوعِ حدثٍ يُكتب في خطّ الطلب له اسمٌ عربيّ وأيقونة، ولا يُعرض رمزٌ إنجليزي ولا تفصيلٌ آليّ («id|1»).
 *   المهلة      الأيامُ بتقويم الكويت لا بساعات الجهاز: اليومُ الأخير «يُغلق اليوم»، والتاريخُ بتوقيت الكويت.
 *   المسودة     مسودةُ تبويبٍ آخر تُنقل لا تُنسخ، وما قبل آخر إرسالٍ لا يُستعاد، والإرسالُ يمحو مسوداتِ الرابط كلَّها.
 *   ردُّ القسم  يُقارن بما يغيّره القسمُ وحده (القرار والحوار والحالة والموعد)، لا بالحكم المشتقّ (توفّرُ قاعة…).
 *   المخالفات   تُجمع لكل مقرّر صفّاً واحداً بأيقونةٍ وعبارةٍ قصيرة.
 *   المكان      لا رمزَ قاعةٍ ولا مبنى في أيّ نصٍّ يصل الأستاذ، ولو أرسله الخادمُ سهواً.
 *
 * ولا تُكتب هنا علامةُ الاقتباس المائلة ولا علامةُ الدولار مع القوس: النصُّ يُحقن في قالبٍ نصّي.
 */
export const TEACHER_CARD_LOGIC_JS = String.raw`
/* ── أحداثُ خطّ الطلب: كلُّ نوعٍ يكتبه الخادم (InstructorRequestEventKind) باسمٍ وأيقونة ── */
var TC_EVENTS={
 "link-created":["plus","أُنشئ الرابط"],"link-opened":["eye","فُتح الرابط"],
 "submitted":["send","أرسلتَ طلبك"],"received":["check","وصل إلى صندوق القسم"],
 "unchanged-confirmed":["shield","ثُبّت جدولك كما هو"],"schedule-edited":["pen","عُدّل الموعد المرتبط بطلبك"],
 "schedule-replaced":["history","استُبدل جدول القسم"],
 "item-fixed":["check","ثُبّت بند"],"item-reopened":["swap","عاد طلبك قيد المراجعة"],"item-rejected":["x","رُفض بند"],
 "alternative-offered":["swap","عُرض عليك بديل"],"alternative-chosen":["check","اخترتَ بديلاً"],
 "settled":["lock","أُغلق الطلب"],"schedule-approved":["shield","اعتُمد الجدول"],
 "department-replied":["chat","ردّ القسم واقترح"],"instructor-replied":["chat","رددتَ على القسم"],
 "proposal-accepted":["check","وافقتَ على مقترح القسم"],"rejected-alt":["swap","رُفض بندٌ وعُرض عليك بديل"],
 "study-proposal-sent":["layers","وصلك مقترح دراسي من القسم"],"study-proposal-revised":["pen","عدّل القسم المقترح الدراسي"],
 "study-proposal-approved":["check","وافقتَ على المقترح الدراسي"],"study-proposal-changes":["chat","رددتَ على المقترح الدراسي"],
 "study-proposal-withdrawn":["x","سحب القسم المقترح الدراسي"],"study-proposal-committed":["shield","ثُبّت المقترح الدراسي في جدولك"],
 "study-proposal-commit-undone":["history","تراجع القسم عن تثبيت المقترح"],"study-proposal-expired":["hour","انتهت مدة المقترح الدراسي"]
};
function tcEventLabel(kind){var e=TC_EVENTS[kind];return e?e[1]:"تحديثٌ على طلبك"}
function tcEventIcon(kind){var e=TC_EVENTS[kind];return e?e[0]:"clock"}
/* سببُ الرفض المخزَّن رمزاً («room») يُقال بكلماته؛ وتفصيلٌ آليّ (رقمٌ، معرّفٌ «id|1»، كلمةٌ إنجليزية) لا يُعرض. */
var TC_REASON_WORDS={room:"لا تتوفّر قاعة في الوقت المطلوب",instructor:"تعارض مع أستاذ آخر",regulation:"مخالفة للائحة",cohort:"تقاطع مع طلبة مشتركين",load:"النصاب التدريسي",department:"قرار القسم",other:"سبب آخر"};
function tcSafeDetail(detail){var d=String(detail==null?"":detail).trim();if(!d)return "";
 if(TC_REASON_WORDS[d])return TC_REASON_WORDS[d];
 if(d.indexOf("|")>=0||!/[؀-ۿ]/.test(d))return "";
 return tcNoPlace(d)}
/* ── المكانُ لا يصل الأستاذ: رمزُ قاعةٍ أو مبنى بعد كلمته يسقط، والجملةُ العامة («لا تتوفّر قاعة في هذا الوقت») تبقى. ── */
/* الكلماتُ بترميزها (قاعة · مبنى · مرفق · المرافق) لا بحروفها: فحصُ الصفحة يبحث عنها نصّاً معروضاً. */
var TC_PLACE_RE=new RegExp("\\s*[\u00b7\u060c,]?\\s*(?:\u0627\u0644)?(?:\u0642\u0627\u0639\u0629|\u0645\u0628\u0646\u0649|\u0645\u0631\u0641\u0642)(?:\\s+\u0627\u0644\u0645\u0631\u0627\u0641\u0642)?\\s*:?\\s*(?=[A-Za-z0-9\u0660-\u0669])[A-Za-z0-9\u0660-\u0669][A-Za-z0-9\u0660-\u0669\/\\-_.]*(?:\\s*(?:\u2190|->)\\s*[A-Za-z0-9\u0660-\u0669][A-Za-z0-9\u0660-\u0669\/\\-_.]*)?","g");
function tcNoPlace(text){return String(text==null?"":text)
 .replace(TC_PLACE_RE,"")
 .replace(/\s*\uD83C\uDFEB\s*[A-Za-z0-9\/\-_.]*/g,"")
 .replace(/\b[0-9]{2,4}[A-Z]{1,2}[0-9]{1,3}\b/g,"")
 .replace(/\s{2,}/g," ").replace(/^\s*[·،,]\s*|\s*[·،,]\s*$/g,"").trim()}

/* ── المهلة بتقويم الكويت (UTC+3 بلا توقيتٍ صيفي) ── */
var TC_KW_MS=3*36e5;
function tcKwDay(ms){return Math.floor((ms+TC_KW_MS)/864e5)}
function tcPad(n){return (n<10?"0":"")+n}
/* left: كم يوماً تقويمياً بين اليوم ويوم الإغلاق (0 = يُغلق اليوم). time: «14:00» إن لم يكن آخرَ الدقيقة من اليوم. */
function tcDeadline(iso,now){var end=Date.parse(iso||"");if(!isFinite(end)||end<now)return null;
 var k=new Date(end+TC_KW_MS),hm=tcPad(k.getUTCHours())+":"+tcPad(k.getUTCMinutes()),when="";
 try{when=new Intl.DateTimeFormat("ar-KW-u-nu-latn",{weekday:"long",day:"numeric",month:"long",timeZone:"Asia/Kuwait"}).format(new Date(end))}catch(e){when=k.toISOString().slice(0,10)}
 var left=tcKwDay(end)-tcKwDay(now);return{left:left,urgent:left<=1,time:hm==="23:59"?"":hm,when:when}}
function tcDeadlineText(info,count){if(!info)return "";
 return info.left===0?"يُغلق استقبال الطلبات اليوم":info.left===1?"يُغلق استقبال الطلبات غداً":"باقٍ "+count(info.left)+" على إغلاق الطلبات"}

/* ── مسوداتُ الرابط: مفتاحٌ لكل تبويب (req-draft:TOKEN:TAB) ── */
function tcDraftKeys(st,base){var out=[];try{for(var k=0;k<st.length;k++){var key=st.key(k);if(key===base||String(key).indexOf(base+":")===0)out.push(key)}}catch(e){}return out}
/* مسودةٌ تصلح للاستعادة: عمرُها أقلّ من أسبوعين، ولم تُكتب قبل آخر إرسالٍ للطلب (ما أُرسل بعدها أحدثُ منها). */
function tcDraftUsable(d,now,submittedAt){if(!d||typeof d.at!=="number"||!(now-d.at<14*864e5))return false;
 var sub=Date.parse(submittedAt||"");return !(isFinite(sub)&&d.at<sub)}
/* مسودةُ هذا التبويب أولاً؛ وإلا أحدثُ مسودةٍ صالحة من تبويبٍ آخر تُنقل إليه (تُمحى من مكانها فلا تعود بعد إرسالها).
   وما لا يصلح يُمحى حيث وُجد. */
function tcDraftTake(st,base,own,now,submittedAt){
 var read=function(key){try{return JSON.parse(st.getItem(key)||"null")}catch(e){return null}};
 var mine=read(own);if(tcDraftUsable(mine,now,submittedAt))return mine;
 try{st.removeItem(own)}catch(e){}
 var best=null,bestKey="";
 tcDraftKeys(st,base).forEach(function(key){if(key===own)return;var d=read(key);
  if(!tcDraftUsable(d,now,submittedAt)){try{st.removeItem(key)}catch(e){}return}
  if(!best||d.at>best.at){best=d;bestKey=key}});
 if(best){try{st.setItem(own,JSON.stringify(best));st.removeItem(bestKey)}catch(e){}}
 return best}
function tcDraftClearAll(st,base){tcDraftKeys(st,base).forEach(function(key){try{st.removeItem(key)}catch(e){}})}

/* ── ردُّ القسم: ما يغيّره القسمُ وحده في البند والطلب ── */
function tcItemKey(it){return it?(it.itemId?"i:"+it.itemId:it.rowId!=null?"r:"+it.rowId:""):""}
function tcDeptItemSig(it){var d=(it&&it.decision)||null,b=(it&&it.before)||{};
 return JSON.stringify([tcItemKey(it),(it&&it.action)||"",b.days||"",b.time||"",d?[d.state||"",d.note||"",!!d.cancelled,(d.alternatives||[]).length]:0,((it&&it.thread)||[]).length,(it&&it.negotiation)||""])}
function tcDeptSig(r){r=r||{};return JSON.stringify([r.status||"",r.submittedAt||"",(r.items||[]).map(tcDeptItemSig)])}
/* مفاتيحُ البنود التي غيّر القسمُ فيها شيئاً بين قراءتين. */
function tcDeptChangedKeys(a,b){var before={},out=[];((a&&a.items)||[]).forEach(function(it){before[tcItemKey(it)]=tcDeptItemSig(it)});
 ((b&&b.items)||[]).forEach(function(it){var k=tcItemKey(it);if(k&&before[k]!==undefined&&before[k]!==tcDeptItemSig(it))out.push(k)});return out}

/* ── مخالفاتُ اللائحة: صفٌّ واحدٌ لكل مقرّر، بأيقونةٍ وعبارةٍ قصيرة، والتفصيلُ عند الضغط ── */
function tcPinGroups(blocks){var groups=[],by={};
 (blocks||[]).forEach(function(p){var name=String(p.course||"").trim()||String(p.text||"").split(":")[0].trim()||"موعد";
  var g=by[name];if(!g){g=by[name]={course:name,itemIndex:Number(p.itemIndex),marks:[],texts:[]};groups.push(g)}
  var mark={ic:p.icon||"alert",t:p.short||"يحتاج تعديلاً"};
  if(!g.marks.some(function(m){return m.t===mark.t}))g.marks.push(mark);
  var line=tcNoPlace(String(p.text||"").replace(new RegExp("^"+name.replace(/[.*+?^()|[\]\\{}]/g,"\\$&")+"\\s*:\\s*"),""));
  if(line&&g.texts.indexOf(line)<0)g.texts.push(line)});
 return groups}
`;

/**
 * أنماطُ الجولة الخامسة: شريطُ «حدّث مع الإبقاء على تعديلي»، والمخالفاتُ صفّاً لكل مقرّر، و«مقترحة لك» بطاقات،
 * وإنفوجرافيك التخطيط، والمهلة بأيقونة، و«أعد المحاولة» المحايدة. الخطوطُ ≥12px وكلُّ ما يُضغط ≥44px. فاتحٌ دائماً.
 */
export const TEACHER_CARD_R5_CSS = String.raw`
/* ── الخطوط: لا نصَّ أصغر من 12px (عدا تسميات شبكة الأسبوع 11px) ── */
.hd .hd-k,.chip,.hd .chip,.chip.rd small,.st,.sb-t small,.ap-main small,.appt-course small,.neg,.status,.activity-item>time,.msgs small,.wk-key,.wk-leg,.readiness small,.signnote,.send .signnote,.tag,.row-head small,.plan-head small,.cal-line>summary small,.req-tag,.course-option small,.offering-course>summary small,.offering-slot,.offering-pick,.offering-section small,.alt-d,.dname{font-size:12px}
.wb span{font-size:11px}.nx-tx small,.sk-plan-tag,.offerings>summary>small,.tb{font-size:12px}.wk-axis,.wc-n{font-size:11px}
/* ── المهلة: أيقونةُ ساعة، والعبارة، ثم التاريخ ── */
.deadline{display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin:8px 0 0;padding:4px 12px 4px 10px;border-radius:999px;background:var(--soft);color:var(--muted);font-size:13px;font-weight:600}
.deadline .sk-gi{inline-size:16px;block-size:16px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.deadline .dl-when{font-weight:500;color:var(--muted)}
.deadline .dl-when{font-size:12.5px}
.deadline[data-urgent="1"]{background:#fbf0d6;color:#6f4b00;padding:4px 12px 4px 10px}
/* ── «وصل ردّ من القسم»: سطرٌ وزرٌّ واحد ── */
.fresh-note{flex-wrap:wrap;justify-content:space-between}
.fresh-note>span{flex:1 1 160px;min-inline-size:0}
.fresh-note .sk-gi{inline-size:18px;block-size:18px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.fn-go{display:inline-flex;align-items:center;gap:7px;min-block-size:44px;padding:8px 16px;border:0;border-radius:13px;background:var(--accent);color:#fff;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}
.fn-go:disabled{opacity:.6}
.fresh-note[data-k=kept]{background:var(--soft);border-color:var(--line);color:var(--ink)}
.fn-x{display:grid;place-items:center;inline-size:44px;block-size:44px;flex:none;border:0;border-radius:12px;background:transparent;color:var(--muted);cursor:pointer}
/* ── المخالفات: صفٌّ لكل مقرّر ── */
.pin-blocks{gap:8px}
.pin-blocks>li{align-items:center;gap:10px;padding:6px 8px 6px 10px;border:1px solid var(--warn-line,#f0e2b3);border-radius:16px;font-size:13px}
.pin-blocks .pin-g{flex:1;min-inline-size:0}
.pin-blocks .pin-g span{flex:none}
.pin-g>summary{display:flex;align-items:center;gap:10px;min-block-size:44px;list-style:none;cursor:pointer}
.pin-g>summary::-webkit-details-marker{display:none}
.pin-ic{display:grid;place-items:center;inline-size:36px;block-size:36px;border-radius:12px;background:var(--card);color:#7a5400}
.pin-ic .sk-gi,.pin-chips .sk-gi{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.pin-ic .sk-gi{inline-size:19px;block-size:19px}
.pin-blocks .pin-g .pin-m{flex:1 1 auto;display:grid;gap:3px;min-inline-size:0}
.pin-m b{font-size:14px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pin-chips{display:flex;flex-wrap:wrap;gap:5px}
.pin-chips i{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:999px;background:var(--card);color:#6f4b00;font-style:normal;font-size:12px;font-weight:700}
.pin-chips .sk-gi{inline-size:13px;block-size:13px}
.pin-why{margin:4px 0 4px;padding-inline-start:46px;display:grid;gap:4px;list-style:none}
.pin-blocks .pin-why li{display:block;padding:0;background:none;color:var(--muted);font-size:12.5px;line-height:1.7}
.pin-blocks .act{flex:none;min-block-size:44px;padding:6px 14px}
/* ── الفحصُ تعذّر: حالةٌ محايدة بزرّ ── */
.verdict[data-tone=retry]{display:flex;flex-wrap:wrap;align-items:center;background:var(--soft);color:var(--muted)}
.verdict[data-tone=retry]>i{background:var(--muted2);color:#fff}
.v-retry{flex:none;min-block-size:44px}
.v-retry .sk-gi{inline-size:16px;block-size:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.plan-check[data-tone=retry]{color:var(--muted)!important}
.err.load-err{display:flex;flex-wrap:wrap;align-items:center;gap:10px;justify-content:space-between}
.err.load-err>span{flex:1 1 180px}
.err.load-err .sk-gi{inline-size:18px;block-size:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.err.load-err .act{min-block-size:44px}
/* ── مقترحة لك: بطاقاتٌ تُطبَّق بضغطة ── */
.best{margin:12px 0 6px}
.best .shape-lead{margin:0 2px 8px;font-size:12.5px;font-weight:700;color:var(--ok-ink,#16523a)}
.best .shape-lead .sk-gi{color:var(--accent)}
.best-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.best-row .best-c{position:relative;display:grid;justify-items:center;align-content:center;gap:6px;min-block-size:104px;padding:12px 8px 10px;border:1.5px solid color-mix(in srgb,var(--accent) 26%,var(--line));border-radius:18px;background:linear-gradient(180deg,color-mix(in srgb,var(--ok2) 70%,var(--card)) 0,var(--card) 78%);color:var(--ink);font:inherit;cursor:pointer;box-shadow:0 2px 0 rgba(22,57,40,.03);transition:border-color .15s,transform .1s,box-shadow .15s}
.best-row .best-c:hover{border-color:var(--accent);box-shadow:0 6px 16px rgba(31,107,92,.12)}
.best-row .best-c:active{transform:scale(.98)}
.best-row .best-c:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.best-c .bp-d u{inline-size:24px;block-size:24px;border-radius:8px;font-size:12px;background:var(--card);border:1px solid color-mix(in srgb,var(--accent) 30%,var(--line))}
.best-c .bp-t{font:800 16px/1.2 "Plex Arabic",-apple-system,"Segoe UI",Tahoma,sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap}
.best-row .best-c small{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:var(--ok-ink,#16523a);line-height:1.3;text-align:center}
.best-row .best-c small .sk-gi{inline-size:15px;block-size:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;color:var(--accent)}
.best-c[data-why=near]{background:var(--card);border-style:dashed}
.best-load i{display:block;block-size:104px;border-radius:18px;background:linear-gradient(100deg,var(--soft) 30%,var(--card) 50%,var(--soft) 70%);background-size:220% 100%;animation:skel 1.3s ease-in-out infinite}
.best-wait{display:flex;align-items:center;gap:8px;margin:10px 2px 4px;padding:9px 12px;border-radius:12px;border:1px dashed var(--line2);color:var(--muted);font-size:12.5px}
.best-wait .sk-gi{inline-size:16px;block-size:16px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;color:var(--accent)}
@media(max-width:560px){.best-row{grid-template-columns:1fr;gap:7px}.best-row .best-c{grid-template-columns:auto auto minmax(0,1fr);justify-items:start;align-items:center;min-block-size:56px;padding:8px 12px;gap:12px}.best-row .best-c small{justify-self:end}.best-load i{block-size:56px}}
/* ── إنفوجرافيك التخطيط ── */
.plan-fact{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;margin:2px 0 10px;padding:9px 12px;border-radius:14px;background:var(--soft);font-size:12px;color:var(--muted)}
.plan-fact .sk-gi{inline-size:16px;block-size:16px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.pf-k{display:inline-flex;align-items:center;gap:6px;font-weight:700;color:var(--muted)}
.pf-k .sk-gi{color:var(--accent)}
.pf-sec,.pf-st{display:inline-flex;align-items:center;gap:6px}
.plan-fact small{font-size:12px;color:var(--muted)}
.pf-sec b,.pf-st b{font-size:15px;font-weight:800;color:var(--ink)}
.pf-st .sk-gi{color:#4a5bb0}
.pf-dots{display:inline-flex;flex-wrap:wrap;gap:4px;max-inline-size:150px}
.pf-dots i{inline-size:11px;block-size:11px;border-radius:50%;background:var(--accent)}
.pf-dots i[data-s=need]{background:transparent;border:1.5px dashed var(--accent)}
.pf-dots i[data-s=over]{background:#b57f10}
`;
