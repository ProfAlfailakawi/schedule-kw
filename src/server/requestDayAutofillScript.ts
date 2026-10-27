/**
 * يوم الأستاذ اختيارٌ صريح: الضغط يضيف اليوم وحده أو يزيله وحده.
 * لا تُستنتج أيامٌ إضافية من تاريخ المقرر أو من نمطه القياسي.
 */
export const REQUEST_DAY_AUTOFILL_SCRIPT = String.raw`
function toggleRequestDay(day,current){
 var next=current.slice(),at=next.indexOf(day);
 if(at>=0)next.splice(at,1);else next.push(day);
 return next;
}
`;
