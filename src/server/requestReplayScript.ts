/**
 * ── «أعد الطلب نفسه»: القاعدةُ في موضعٍ واحدٍ قابلٍ للاختبار ─────────────────
 *
 * ما طلبه الأستاذ في الفصل الماضي يُعاد مسودةً في هذا الفصل بقاعدةٍ واحدة، تُحشى
 * في صفحته نصّاً وتُجمَّع في الاختبار بمحرّك V8 نفسه كما هي. لا تلمس الصفحةَ ولا
 * الشبكة: تأخذ ما طُلب وما في جدوله الآن وتعيد **قائمةَ عمليات** وقائمةَ ما لم
 * يُعَد ولماذا. والصفحةُ هي التي تطبّق وتعرض.
 *
 * وما فيها مقصودٌ كما هو:
 *   - ما رُفض في ذلك الفصل لا يُعاد: رُفض مرّةً لسببٍ لا نعرفه، وإعادتُه بصمتٍ تُكرّر الرفض.
 *   - لا تخمّن شعبةً: مقرّرٌ له شعبتان هذا الفصل ولا شعبةَ بالرقم نفسه يُقال للأستاذ أن يختار.
 *   - ما عدّله الأستاذ في مسودته الآن، أو قرّر فيه القسمُ هذا الفصل، لا يُمسّ.
 *   - ما صار موعدَه الحاليَّ نفسَه لا يُعاد (قد يكون ثُبّت وطُبّق).
 *   - الصلاحيةُ الأخيرة للخادم: ما تعيده هنا يمرّ بعدها على الفحص المباشر كأنه كُتب الآن.
 *
 * ES5 عادي، ولا علامةَ اقتباسٍ مائلة ولا ‎${‎ داخل النص.
 */
export const REQUEST_REPLAY_SCRIPT = String.raw`
function planReplay(prev,state,courses,dayKeys,sameAsOriginal){
 var ops=[],skipped=[],used={};
 function skip(p,why){skipped.push({name:p.courseName,why:why})}
 (prev&&prev.items||[]).forEach(function(p){
  if(p.state==="rejected"){skip(p,"رُفض في ذلك الفصل");return}
  var okDays=!!(p.days&&p.days.length)&&p.days.every(function(d){return dayKeys.indexOf(d)>=0});
  var okStart=/^\d{1,2}:\d{2}$/.test(p.start||"");
  if(p.action==="add"){
   var c=(courses||[]).filter(function(c){return Number(c.id)===p.courseId&&Number(c.collegeId)===p.collegeId&&Number(c.sectionId)===p.sectionId})[0];
   if(!c){skip(p,"لم يعد متاحاً للإضافة");return}
   if(!okDays||!okStart){skip(p,"أيامه أو وقته لم تعد صالحة");return}
   if(state.some(function(it){return it.action==="add"&&it.courseId===p.courseId&&String(it.days)===String(p.days)&&it.start===p.start})){skip(p,"مضاف في مسودتك");return}
   ops.push({kind:"add",course:c,days:p.days.slice(),start:p.start,collegeId:p.collegeId,sectionId:p.sectionId,courseId:p.courseId});return}
  var cands=state.map(function(it,i){return{it:it,i:i}}).filter(function(x){var b=x.it.before||{};return x.it.rowId!=null&&x.it.action!=="add"&&Number(b.courseId)===p.courseId});
  if(cands.length>1){var same=cands.filter(function(x){return String((x.it.before||{}).sectionCode)===p.sectionCode});if(same.length===1)cands=same}
  if(cands.length>1){skip(p,"له أكثر من شعبة هذا الفصل — اختر الشعبة بنفسك");return}
  var cur=cands[0];
  if(!cur){skip(p,"المقرر ليس في جدولك هذا الفصل");return}
  if(cur.it.action!=="keep"||used[cur.i]){skip(p,"عدّلتَه في مسودتك الآن");return}
  if(cur.it.decision&&cur.it.decision.state){skip(p,"قرّر القسم فيه هذا الفصل");return}
  if(p.action==="delete"){used[cur.i]=1;ops.push({kind:"delete",index:cur.i,name:p.courseName});return}
  if(!okDays||!okStart){skip(p,"أيامه أو وقته لم تعد صالحة");return}
  if(sameAsOriginal&&sameAsOriginal(cur.it,p.days,p.start)){skip(p,"هذا هو موعدك الحالي نفسه");return}
  used[cur.i]=1;ops.push({kind:"change",index:cur.i,days:p.days.slice(),start:p.start,name:p.courseName})});
 return{ops:ops,skipped:skipped}}
`;
