/**
 * اختيارُ الأيام في كرت الأستاذ.
 *
 * قرارُ المالك (2026-10-28، B1/B2): أوّلُ يومٍ يُضغط يُكمِل نمطَ اللائحة الذي
 * يحويه لساعات المقرر (patternsForHours في الخادم، مصدرٌ واحد) — الاثنين لمقررٍ
 * من ثلاث ساعات يصير «الاثنين والأربعاء». بعدها كلُّ ضغطةٍ تضيف اليومَ وحده أو
 * تزيله وحده، فيبقى الأستاذ قادراً على أيّ اختيارٍ صريح. لا يُستنتج شيءٌ من تاريخ
 * المقرر ولا من عادات الأقسام.
 */
export const REQUEST_DAY_AUTOFILL_SCRIPT = String.raw`
function toggleRequestDay(day,current){
 var next=current.slice(),at=next.indexOf(day);
 if(at>=0)next.splice(at,1);else next.push(day);
 return next;
}
function completeRequestDays(day,current,patterns){
 if(current.length||!patterns||!patterns.length)return toggleRequestDay(day,current);
 for(var k=0;k<patterns.length;k++){if(patterns[k].indexOf(day)>=0)return patterns[k].slice()}
 return toggleRequestDay(day,current);
}
`;
