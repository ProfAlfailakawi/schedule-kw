/**
 * ── إكمالُ أيام المقرر تلقائياً ──────────────────────────────────────────────
 *
 * الأستاذ يضغط يوماً واحداً (الأحد مثلاً) والمقرر في هذا القسم يُدرَّس عادةً
 * الأحد والثلاثاء والخميس؛ فيكمل النظامُ باقي أيام النمط، ويبقى للأستاذ أن يبدّل.
 * عدد اللقاءات والأنماط المعتادة تأتي من تاريخ القسم لهذا المقرر (`dayHabitOf` في
 * courseNature.ts)، لأن بعض المقررات يومٌ واحد في الأسبوع وبعضها يومان أو ثلاثة.
 *
 * القاعدة في موضعٍ واحدٍ قابلٍ للاختبار بمحرّك V8 كما تُحشى في الصفحة:
 *   • لا إكمالَ إلا حين يكون الاختيارُ فارغاً أو نمطاً كاملاً معروفاً (فيُستبدل بنمط اليوم
 *     المضغوط). أمّا من يُعدّل يدوياً فالضغطةُ تبديلٌ عاديّ لا يُعارَض.
 *   • لا يُحذف يومٌ بالضغط عليه إلا هو نفسُه: النمطُ لا يُفكَّك من نفسه.
 *   • إن لم يُعرف عددُ اللقاءات، أو لم يوجد نمطٌ يحوي اليوم، فالضغطةُ تبديلٌ عاديّ.
 *
 * ES5 عادي، ولا علامةَ اقتباسٍ مائلة ولا ‎${‎ داخل النص.
 */
export const REQUEST_DAY_AUTOFILL_SCRIPT = String.raw`
/* أنماطٌ معيارية بعدد اللقاءات: الأحد والثلاثاء (والخميس) أو الاثنين والأربعاء (والخميس). */
var STD_PATTERNS={1:[],2:[["fsunday","ftuesday"],["fmonday","fwednesday"]],3:[["fsunday","ftuesday","fthursday"],["fmonday","fwednesday","fthursday"]]};
function sortDays(list,order){return list.slice().sort(function(a,b){return order.indexOf(a)-order.indexOf(b)})}
function sameDays(a,b){return a.length===b.length&&a.slice().sort().join()===b.slice().sort().join()}
function autofillDays(day,current,habit,ownCount,order){
 var n=(habit&&habit.perWeek)||ownCount||0;
 var known=((habit&&habit.patterns)||[]).filter(function(p){return p.length===n}).concat(STD_PATTERNS[n]||[]);
 if(n<2||!known.length)return null;
 var isEmpty=!current.length;
 var isPattern=current.length===n&&known.some(function(p){return sameDays(p,current)});
 if(!isEmpty&&!isPattern)return null;
 var picked=known.filter(function(p){return p.indexOf(day)>=0})[0];
 return picked?sortDays(picked,order):null}
`;
