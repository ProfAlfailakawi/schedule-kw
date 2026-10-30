/**
 * ── طولُ اللقاء في صفحة الأستاذ: الخوارزميةُ نفسُها التي يحسب بها الخادم ──
 *
 * نسخةُ المتصفّح من محرّك src/utils/requestMeetingLength.ts (meetingMinutes · meetingSlots):
 * الأيامُ نفسُها ← طولُ الموعد نفسه، ويومٌ واحد يُنقل إلى يومٍ واحد ← طولُه، وإلا نمطُ اللائحة لساعات
 * المقرّر، وإلا 50/80. بلا استيراد، فتُحقن في القالب وتُقرأ في الاختبار كما هي، والاختبارُ يقارن
 * النسختين على جدول حالات (tests/teacher-card-logic-audit.ts).
 */
export const REQUEST_LENGTH_SCRIPT = String.raw`
function meetingMinutes(days,patterns,own){
 if(!days||!days.length)return [];
 var same=function(a,b){return a.length===b.length&&a.every(function(d){return b.indexOf(d)>=0})};
 if(own&&own.minutes>0&&own.days&&own.days.length&&(same(days,own.days)||(days.length===1&&own.days.length===1)))return days.map(function(){return own.minutes});
 var list=patterns||[];
 for(var k=0;k<list.length;k++){var p=list[k];
  if(days.length===1&&p.days.length===1)return [p.minutes[0]];
  if(p.days.length===days.length&&same(days,p.days))return days.map(function(d){return p.minutes[p.days.indexOf(d)]});
 }
 return days.map(function(d){return d==="fmonday"||d==="fwednesday"?80:50});
}
function meetingSlots(days,start,patterns,own){
 var m=/^(\d{1,2}):(\d{2})$/.exec(String(start||""));if(!days||!days.length||!m)return [];
 var from=(+m[1])*60+(+m[2]),list=meetingMinutes(days,patterns,own);
 var hm=function(v){return String(Math.floor(v/60)).padStart(2,"0")+":"+String(v%60).padStart(2,"0")};
 return days.map(function(d,k){return{day:d,start:hm(from),end:hm(from+list[k])}});
}
`;
