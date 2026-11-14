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
 *   الأسبوع     «محاضرتك القادمة» و«أسبوعي الصحي» من جدوله الرسمي؛ وفاصلُ التنقّل بين الحرمين بقاعدة shortTravelGap الواحدة
 *               (src/utils/campusTravelHint.ts، تُحقن في الصفحة قبل هذا النص) ودقائقُ سياسة التنقّل لا مخترَعة.
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

/* ── مقرّرٌ يُضاف: لا يدخل المسودةَ ما لا يُطرح هذا الفصل ──
   قائمةُ المقرّرات من الخادم تحمل offering لما لا يُختار (غير مطروح، لم نصل بعد…). مسودةٌ مستعادة أو «أعد الطلب نفسه»
   كانت تُدخله، فيقول الفحصُ «الوقت متاح» ويرفضه الإرسالُ بلا بند. فيُترك ويُقال في سطرٍ واحد لماذا. */
function tcCourseFor(courses,d){return (courses||[]).filter(function(c){return Number(c.id)===Number(d.courseId)&&Number(c.collegeId)===Number(d.collegeId)&&Number(c.sectionId)===Number(d.sectionId)})[0]||null}
function tcCourseClosed(courses,d){var c=tcCourseFor(courses,d);return !!(c&&c.offering)}
function tcCourseOpen(courses,d){var c=tcCourseFor(courses,d);return !!(c&&!c.offering)}
function tcClosedLine(names){var list=(names||[]).filter(Boolean);return list.length?"لم نستعد «"+list.join("، ")+"» — غير مطروح هذا الفصل.":""}

/* ── سطرُ «للاطلاع» تحت الموعد: لكل حالةٍ عبارتُها ──
   كان «انتهت مدّة الطلبات — هذا الموعد للاطلاع» يُكتب تحت كل صفّ في مرحلة التدريب والعرضِ والطلبِ المكتمل ولو كانت
   المهلةُ مفتوحة. العرضُ: «رابط للعرض فقط». التدريب: عبارتُه. المكتمل قبل الموعد: «اكتمل طلبك». وانقضاءُ المهلة وحده يقول الانتهاء. */
function tcRowReadOnly(d,now){d=d||{};var r=d.request||{},closes=Date.parse((r.window&&r.window.closesAt)||"");
 if(d.mode==="view")return "رابط للعرض فقط";
 if(d.mode==="ta")return "للاطلاع — اختر من الشعب المتاحة أدناه";
 if(isFinite(closes)&&closes<=now)return "انتهت مدّة الطلبات — هذا الموعد للاطلاع.";
 if(r.status==="settled")return "اكتمل طلبك";
 return "هذا الموعد للاطلاع فقط"}

/* ── مخالفاتُ اللائحة: صفٌّ واحدٌ لكل مقرّر، بأيقونةٍ وعبارةٍ قصيرة، والتفصيلُ عند الضغط ── */
function tcPinGroups(blocks){var groups=[],by={};
 (blocks||[]).forEach(function(p){var name=String(p.course||"").trim()||String(p.text||"").split(":")[0].trim()||"موعد";
  var g=by[name];if(!g){g=by[name]={course:name,itemIndex:Number(p.itemIndex),marks:[],texts:[]};groups.push(g)}
  var mark={ic:p.icon||"alert",t:p.short||"يحتاج تعديلاً"};
  if(!g.marks.some(function(m){return m.t===mark.t}))g.marks.push(mark);
  var line=tcNoPlace(String(p.text||"").replace(new RegExp("^"+name.replace(/[.*+?^()|[\]\\{}]/g,"\\$&")+"\\s*:\\s*"),""));
  if(line&&g.texts.indexOf(line)<0)g.texts.push(line)});
 return groups}

/* ── «محاضرتك القادمة» و«أسبوعي الصحي»: من جدول الأستاذ الرسمي وحده (data.week) ──
   week = { meetings:[{id,day:"fsunday",start,end,course,section,campus}], travel:{"jahra|main":30}, term:{start,end,closed} }.
   لا قاعةَ ولا مبنى في أيٍّ منها. الأسبوعُ يبدأ بالأحد، وليس للجمعة والسبت مفتاحٌ فلا محاضرةَ فيهما (كتقويم التطبيق)،
   واليومُ والساعةُ بتوقيت الكويت لا بساعة الجهاز. */
var TC_DAY_KEYS=["fsunday","fmonday","ftuesday","fwednesday","fthursday"];
var TC_DAY_NAMES=["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس"];
var TC_DAY_SHORT=["ح","ن","ث","ر","خ"];
var TC_CAMPUS_NAMES={main:"الرئيسي",jahra:"الجهراء",fahaheel:"الفحيحيل"};
/* موعدان متتاليان في اليوم نفسه بينهما أقلُّ من هذا (دقيقة) يُعدّان «متتاليين» للتنقّل بين الحرمين. */
var TC_BACK_TO_BACK=90;
/* فراغٌ بين محاضرتين يُقال له «طويل»، وتتابعٌ بلا فراغٍ يُقال له «مضغوط». */
var TC_LONG_GAP=180,TC_PACKED_RUN=240,TC_NO_GAP=15;
function tcClock(t){var p=String(t||"").split(":");return (Number(p[0])||0)*60+(Number(p[1])||0)}
function tcYmd(ms){var k=new Date(ms+TC_KW_MS);return k.getUTCFullYear()+"-"+tcPad(k.getUTCMonth()+1)+"-"+tcPad(k.getUTCDate())}
function tcAfter(n,noun){var o={};for(var k in noun)o[k]=noun[k];o.two=String(noun.two).replace(/ان$/,"ين");return countOf(n,o)}
/* مدّةٌ بكلمات: «40 دقيقة»، «ساعة واحدة و10 دقائق»، «ساعتان». after = بعد حرف جرّ («بعد ساعتين»). */
function tcDur(min,after){min=Math.max(1,Math.round(min));var h=Math.floor(min/60),m=min%60,say=after?tcAfter:countOf;
 if(!h)return say(m,AR.minute);return say(h,AR.hour)+(m?" و"+say(m,AR.minute):"")}
function tcMeetingsOf(week){return ((week&&week.meetings)||[]).filter(function(m){return m&&TC_DAY_KEYS.indexOf(m.day)>=0&&/^\d{1,2}:\d{2}$/.test(m.start||"")&&/^\d{1,2}:\d{2}$/.test(m.end||"")&&tcClock(m.end)>tcClock(m.start)})}
function tcByStart(a,b){return tcClock(a.start)-tcClock(b.start)||tcClock(a.end)-tcClock(b.end)}
/* الفصلُ جارٍ الآن؟ تاريخُ اليوم بالكويت داخل [start,end] ولم يُغلق. */
function tcTermRunning(term,now){var t=term||{};
 if(t.closed||!/^\d{4}-\d{2}-\d{2}$/.test(t.start||"")||!/^\d{4}-\d{2}-\d{2}$/.test(t.end||""))return false;
 var today=tcYmd(now);return today>=t.start&&today<=t.end}
/* أقربُ محاضرةٍ تبدأ بعد الآن في جدوله الرسمي (اليوم أو أقربِ يوم دوامٍ تالٍ ضمن الفصل)، وإلا null. */
function tcNextLecture(week,now){var list=tcMeetingsOf(week);if(!list.length||!tcTermRunning(week.term,now))return null;
 var k=new Date(now+TC_KW_MS),dow=k.getUTCDay(),midnight=Math.floor((now+TC_KW_MS)/864e5)*864e5-TC_KW_MS,best=null;
 for(var off=0;off<=8&&!best;off++){var date=tcYmd(now+off*864e5);if(date>week.term.end)return null;
  var key=TC_DAY_KEYS[(dow+off)%7];if(!key)continue;
  list.filter(function(m){return m.day===key}).sort(tcByStart).forEach(function(m){var at=midnight+(off*1440+tcClock(m.start))*6e4;
   if(at>now&&(!best||at<best.at))best={m:m,at:at,off:off,day:(dow+off)%7,date:date}})}
 if(!best)return null;
 var min=Math.max(1,Math.ceil((best.at-now)/6e4)),m=best.m,start=tcPad(Math.floor(tcClock(m.start)/60))+":"+tcPad(tcClock(m.start)%60);
 var text=best.off===0?"بعد "+tcDur(min,true):best.off===1?"غداً "+start:TC_DAY_NAMES[best.day]+" "+start;
 return{rowId:m.id,course:String(m.course||"").trim(),section:String(m.section||"").trim(),start:start,day:best.day,dayName:TC_DAY_NAMES[best.day],
  off:best.off,date:best.date,minutes:min,soon:best.off===0&&min<=60,text:text,key:[m.id,best.date,start].join("|")}}
/* سطرُ المحاضرة القادمة تحت العنوان: «التصميم · شعبة 02» (الشعبةُ إن وُجدت). */
function tcNextSub(n){if(!n)return "";return [n.course,n.section?"شعبة "+n.section:""].filter(Boolean).join(" · ")}
/* أسبوعُه الصحي: أيامُ الحضور، أطولُ فراغٍ في اليوم، أكثفُ يوم، التنقّلُ بين الحرمين، وجملةٌ واحدة إن برز شيء. null بلا جدولٍ رسمي. */
function tcWeekHealth(week){var list=tcMeetingsOf(week);if(!list.length)return null;
 var travel=(week&&week.travel)||{},days=[],gap=null,busiest=null,packed=null,hops=[];
 TC_DAY_KEYS.forEach(function(key,d){var ms=list.filter(function(m){return m.day===key}).sort(tcByStart),minutes=0,runStart=0,runEnd=0;
  var closeRun=function(){if(runEnd-runStart>=TC_PACKED_RUN&&(!packed||runEnd-runStart>packed.minutes))packed={minutes:runEnd-runStart,i:d,name:TC_DAY_NAMES[d]}};
  ms.forEach(function(m,n){var s=tcClock(m.start),e=tcClock(m.end);minutes+=e-s;
   if(n===0){runStart=s;runEnd=e;return}
   var between=s-runEnd;
   if(between>TC_NO_GAP){closeRun();if(!gap||between>gap.minutes)gap={minutes:between,i:d,name:TC_DAY_NAMES[d]};runStart=s;runEnd=e}
   else runEnd=Math.max(runEnd,e);
   var prev=ms[n-1],apart=s-tcClock(prev.end),ca=prev.campus||"main",cb=m.campus||"main";
   if(ca!==cb&&apart>=0&&apart<=TC_BACK_TO_BACK){var need=Number(travel[[ca,cb].sort().join("|")])||0;
    if(need>0)hops.push({i:d,name:TC_DAY_NAMES[d],from:ca,to:cb,fromLabel:TC_CAMPUS_NAMES[ca]||"",toLabel:TC_CAMPUS_NAMES[cb]||"",need:need,gap:apart,
     tight:shortTravelGap(need,tcClock(prev.start),tcClock(prev.end),s,e)>=0})}});
  if(ms.length)closeRun();
  days.push({key:key,i:d,name:TC_DAY_NAMES[d],short:TC_DAY_SHORT[d],count:ms.length,minutes:minutes,attend:ms.length>0});
  if(ms.length&&(!busiest||minutes>busiest.minutes||(minutes===busiest.minutes&&ms.length>busiest.count)))busiest={i:d,name:TC_DAY_NAMES[d],count:ms.length,minutes:minutes}});
 var attend=days.filter(function(x){return x.attend}).length,tight=hops.filter(function(h){return h.tight})[0],s="",kind="";
 if(packed){s="جدولك مضغوط يوم "+packed.name+": "+countOf(Math.max(4,Math.round(packed.minutes/60)),AR.hour)+" بلا فراغ";kind="packed"}
 else if(tight){s="يوم "+tight.name+": تنقّلٌ بين "+tight.fromLabel+" و"+tight.toLabel+" والفاصلُ أقصر من اللازم";kind="travel"}
 else if(gap&&gap.minutes>=TC_LONG_GAP){s="يوم "+gap.name+": فراغٌ طويل، "+tcDur(gap.minutes)+" بين محاضرتين";kind="gap"}
 else if(attend>0&&attend<=3){s="أسبوعٌ خفيف: تحضر "+tcAfter(attend,AR.day)+" فقط";kind="light"}
 return{days:days,attend:attend,of:TC_DAY_KEYS.length,gap:gap?{minutes:gap.minutes,i:gap.i,name:gap.name,dur:tcDur(gap.minutes),pct:Math.min(100,Math.round(gap.minutes/300*100)),long:gap.minutes>=TC_LONG_GAP}:null,
  multi:days.some(function(x){return x.count>1}),busiest:busiest,busiestDur:busiest?tcDur(busiest.minutes):"",hops:hops.slice(0,3),sentence:s,kind:kind}}
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

/* ── محاضرتك القادمة ── */
.tc-next{position:relative;display:flex;align-items:center;gap:12px;inline-size:100%;min-block-size:64px;margin:0 0 14px;padding:12px 14px;overflow:hidden;border:1px solid color-mix(in srgb,var(--accent) 30%,var(--line));border-radius:18px;background:linear-gradient(135deg,color-mix(in srgb,var(--ok2) 78%,#fff),#fff 72%);color:var(--ink);font:inherit;text-align:start;box-shadow:var(--shadow)}
button.tc-next{cursor:pointer;min-block-size:64px}
button.tc-next:focus-visible{outline:3px solid color-mix(in srgb,var(--accent) 45%,transparent);outline-offset:2px}
button.tc-next:active{transform:scale(.99)}
.tc-nx-ic{flex:none;display:grid;place-items:center;inline-size:46px;block-size:46px;border-radius:15px;background:var(--accent);color:#fff}
.tc-svg{inline-size:20px;block-size:20px;flex:none}
.tc-nx-ic .tc-svg{inline-size:24px;block-size:24px}
.tc-nx-b{flex:1 1 auto;min-inline-size:0;display:grid;gap:1px}
.tc-nx-b small{font-size:12px;font-weight:700;color:var(--muted)}
.tc-nx-t{font-size:20px;font-weight:800;line-height:1.35;color:var(--ink)}
.tc-nx-s{font-size:13.5px;line-height:1.5;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tc-nx-time{flex:none;padding:5px 12px;border-radius:999px;background:var(--card);border:1px solid color-mix(in srgb,var(--accent) 28%,var(--line));font-size:15px;font-weight:800;color:var(--accent);font-variant-numeric:tabular-nums}
.tc-nx-bar{position:absolute;inset-inline:0;inset-block-end:0;block-size:4px;background:var(--line)}
.tc-nx-bar::after{content:"";position:absolute;inset-block:0;inset-inline-start:0;inline-size:var(--p);background:var(--accent);border-radius:0 4px 4px 0}
.tc-next[data-soon="1"] .tc-nx-t{color:var(--accent)}
.appt[data-flash="1"]{animation:tcFlash 1.4s ease-out}
@keyframes tcFlash{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--accent) 55%,transparent)}60%{box-shadow:0 0 0 8px color-mix(in srgb,var(--accent) 18%,transparent)}100%{box-shadow:0 0 0 0 transparent}}
@media(prefers-reduced-motion:reduce){.appt[data-flash="1"]{animation:none;outline:3px solid var(--accent)}}
/* ── أسبوعي الصحي ── */
.tc-week{margin:0 0 14px;padding:14px;border:1px solid var(--line);border-radius:18px;background:var(--card);box-shadow:0 5px 18px rgba(22,57,40,.04)}
.tc-wk-h{display:flex;align-items:center;gap:8px;margin:0 0 12px;font-size:15px;font-weight:800;color:var(--ink)}
.tc-wk-h .tc-svg{color:var(--accent)}
.tc-wk-grid{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:10px}
.tc-wk-t{display:grid;align-content:start;gap:4px;min-inline-size:0;padding:10px 12px;border-radius:14px;background:var(--soft)}
.tc-wk-t small{font-size:12px;font-weight:700;color:var(--muted)}
.tc-wk-t b{font-size:16px;font-weight:800;line-height:1.35;color:var(--ink)}
.tc-wk-t em,.tc-wk-sub{font-style:normal;font-size:12.5px;line-height:1.5;color:var(--muted)}
.tc-wk-att{grid-auto-flow:column;grid-auto-columns:auto 1fr;align-items:center;gap:12px}
.tc-wk-ring{position:relative;display:grid;place-items:center;inline-size:58px;block-size:58px;border-radius:50%;background:conic-gradient(var(--accent) calc(var(--p)*1%),var(--line) 0)}
.tc-wk-ring::after{content:"";position:absolute;inset:6px;border-radius:50%;background:var(--soft)}
.tc-wk-ring b{position:relative;z-index:1;font-size:17px;direction:ltr;font-variant-numeric:tabular-nums}
.tc-wk-ring b small{font-size:12px;font-weight:700;color:var(--muted)}
.tc-wk-tx{display:grid;gap:6px;min-inline-size:0}
.tc-wk-dots{display:flex;gap:4px}
.tc-wk-dots i{display:grid;place-items:center;inline-size:22px;block-size:22px;border-radius:50%;border:1.5px solid var(--line2);background:#fff;font-style:normal;font-size:12px;font-weight:700;color:var(--muted)}
.tc-wk-dots i[data-on="1"]{border-color:var(--accent);background:var(--accent);color:#fff}
.tc-wk-bar{display:block;block-size:8px;border-radius:999px;background:var(--line);overflow:hidden}
.tc-wk-bar i{display:block;block-size:100%;border-radius:999px;background:var(--accent)}
.tc-wk-bar[data-long="1"] i{background:#b57f10}
.tc-wk-hops{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:6px}
.tc-wk-hops li{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:8px 12px;border-radius:12px;background:var(--soft);font-size:13px;color:var(--ink)}
.tc-wk-hops .tc-svg{color:var(--accent)}
.tc-hp-t{flex:1 1 150px;min-inline-size:0;font-weight:700}
.tc-hp-n{font-size:12.5px;color:var(--muted);font-weight:700}
.tc-wk-hops em{display:inline-flex;align-items:center;gap:4px;font-style:normal;font-size:12px;font-weight:700;color:#16523a}
.tc-wk-hops em .tc-svg{inline-size:15px;block-size:15px;color:#16523a}
.tc-wk-hops li[data-tight="1"]{background:var(--warn2)}
.tc-wk-hops li[data-tight="1"] em,.tc-wk-hops li[data-tight="1"] em .tc-svg{color:#6f4b00}
.tc-wk-say{display:flex;align-items:center;gap:8px;margin:10px 0 0;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--ok2) 70%,#fff);color:#16523a;font-size:13.5px;font-weight:700;line-height:1.6}
.tc-wk-say .tc-svg{color:var(--accent)}
.tc-wk-say[data-k="packed"],.tc-wk-say[data-k="travel"]{background:var(--warn2);color:#6f4b00}
.tc-wk-say[data-k="packed"] .tc-svg,.tc-wk-say[data-k="travel"] .tc-svg{color:#8a6100}
@media(max-width:520px){.tc-wk-grid{grid-template-columns:1fr 1fr}.tc-wk-att{grid-column:1/-1}}
`;
