/**
 * ── ورشةُ الذكاء: القيودُ وغرفةُ القرار والمساعد ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { rowsForIntelligenceScope } from "../../utils/intelligenceReadingScope";
import { Response } from "express";
import { Repository } from "../../db/repository";
import { activeDays, analyzeSchedule, autoScheduleProposal, conflictSolutions, findConflicts, minutesToTime, SCHEDULE_DAYS, timeToMinutes } from "../../utils/scheduleIntelligence";
import { buildScheduleGenome, buildWarRoom, evaluateScheduleConstraints, forecastScheduleMove, runScheduleAutopilot } from "../../utils/scheduleInnovation";
import { approvalBlockerCount } from "../../utils/scheduleBlockers";
import { AR, countOf, oblique } from "../../utils/arabicCount";
import { reasonForMove } from "../../utils/appointmentStory";
import { buildCourseLife, buildDecisionCost, buildOfferingLife, discoverUnwrittenRules, explainWhyHere, investigateCrowding, logicalAnomalies, scheduleAccuracyFromVersions, simulatePolicy } from "../../utils/advancedIntelligence";
import { formatScheduleTimeRange, SCHEDULE_DAY_END, SCHEDULE_DAY_END_TIME, SCHEDULE_DAY_START, SCHEDULE_DAY_START_TIME, SCHEDULE_SLOT_MINUTES, withinScheduleDay } from "../../utils/scheduleTime";
import { isAssignableInstructor } from "../../utils/instructorStatus";
import { buildRowReasons, instructorLoadUnits } from "../../utils/rowReasons";
import { roomIdentityKey, rowOccupiesRoom, resolveBuilding, resolveRoom } from "../../utils/locationRegistry";
import { locationPreflight } from "../locationRegistryEngine";
import { type AuthenticatedRequest, requirePermission, requirePowerAdmin, ROOT_ADMIN_USER_ID } from "../core/auth";
import { academicStartYear } from "../core/hallBarter";
import { apiPerformanceSamples } from "../core/http";
import { readLocationRegistry } from "../core/locations";
import { departmentStyle } from "../core/rhythm";
import { scopeSectionIdsFor } from "../core/scheduleReads";
import { normalizedBuilding, SCHEDULE_DAY_KEYS, scheduleOverlap, travelMinutesFor } from "../core/scheduleRules";
import { filterByScope, intelligenceReadScopes, isScopeAllowed, scopedScheduleUniverse } from "../core/scope";
import { approvalBlockerOptions, placeholderInstructorIds, resolveSmartContext, safeDraftRows, smartContextFrom, validateSmartRows } from "../core/smartImport";
import { readVisitingStatus } from "../core/visiting";
import { loadCapOf } from "../../utils/teachingLoad";

function recentTenYearTermIds(terms:any[]): Set<number> {
  const withYear=terms.map(term=>({id:Number(term.AdTermId||0),year:academicStartYear(term.AdTermName)})).filter(item=>item.id);
  const years=withYear.map(item=>item.year).filter((year):year is number=>Number.isFinite(year));
  if(years.length){
    const newest=Math.max(...years),cutoff=newest-9;
    return new Set(withYear.filter(item=>item.year!=null&&item.year>=cutoff).map(item=>item.id));
  }
  return new Set([...withYear].sort((a,b)=>b.id-a.id).slice(0,30).map(item=>item.id));
}
function rowsOverlapOnDay(a:any,b:any,dayKey:string){return Boolean(a?.[dayKey]&&b?.[dayKey])&&scheduleOverlap(String(a.fstarttime||""),String(a.fendtime||""),String(b.fstarttime||""),String(b.fendtime||""));}
function spatialBurnoutAnalysis(scopeRows:any[],termRows:any[],profile:any,instructors:any[]=[]){
  const instructorName=new Map(instructors.map((i:any)=>[Number(i.AdInstructorId),i.AdInstructorName]));
  const risks:any[]=[];
  const days=[{key:"fsunday",label:"الأحد"},{key:"fmonday",label:"الاثنين"},{key:"ftuesday",label:"الثلاثاء"},{key:"fwednesday",label:"الأربعاء"},{key:"fthursday",label:"الخميس"}];
  const targetInstructorIds=new Set(scopeRows.map((r:any)=>Number(r.AdInstructorId)).filter(Boolean));
  for(const instructorId of targetInstructorIds){
    const own=termRows.filter((r:any)=>Number(r.AdInstructorId)===instructorId);
    for(const day of days){
      const ordered=own.filter((r:any)=>Boolean(r[day.key])).sort((a:any,b:any)=>timeToMinutes(a.fstarttime)-timeToMinutes(b.fstarttime));
      for(let i=1;i<ordered.length;i++){
        const prev=ordered[i-1],next=ordered[i];
        const from=normalizedBuilding(prev.AdRoomCode),to=normalizedBuilding(next.AdRoomCode);
        if(!from||!to||from.toLocaleLowerCase()===to.toLocaleLowerCase())continue;
        const gap=Math.max(0,timeToMinutes(next.fstarttime)-timeToMinutes(prev.fendtime));
        const needed=travelMinutesFor(profile,from,to),margin=gap-needed;
        const level=margin<0?"high":margin<=10?"guarded":"low";
        if(level==="low")continue;
        risks.push({instructorId,instructorName:instructorName.get(instructorId)||`أستاذ ${instructorId}`,day:day.key,dayLabel:day.label,fromRowId:prev.id,toRowId:next.id,fromBuilding:from,toBuilding:to,gapMinutes:gap,requiredMinutes:needed,marginMinutes:margin,level,title:level==="high"?"خطر الإرهاق الجسدي":"انتقال جغرافي ضيق",detail:level==="high"?`الفاصل ${countOf(gap, AR.minute)} بينما الانتقال التقريبي يحتاج ${countOf(needed, oblique(AR.minute))}.`:`المتاح ${countOf(gap, AR.minute)} والانتقال يحتاج قرابة ${countOf(needed, oblique(AR.minute))}؛ هامش الحركة ${countOf(margin, AR.minute)} فقط.`});
      }
    }
  }
  risks.sort((a,b)=>a.marginMinutes-b.marginMinutes);
  const high=risks.filter(r=>r.level==="high").length,guarded=risks.length-high;
  const score=Math.max(0,100-high*18-guarded*6);
  return {enabled:true,score,highRisk:high,guardedRisk:guarded,totalRisks:risks.length,risks:risks.slice(0,40),profile};
}
function roomIsFreeForRow(room:{code:string;hall:string;buildingId?:string;roomId?:string},target:any,termRows:any[],ignoreIds:Set<number>){
  return termRows.every((other:any)=>{
    if(ignoreIds.has(Number(other.id)))return true;
    const sameRoom=rowOccupiesRoom(other,room.roomId||"",room.code,room.hall);
    if(!sameRoom)return true;
    return !["fsunday","fmonday","ftuesday","fwednesday","fthursday"].some(day=>Boolean(target[day]&&other[day])&&scheduleOverlap(target.fstarttime,target.fendtime,other.fstarttime,other.fendtime));
  });
}
function roomCastlingProposals(scopeRows:any[],termRows:any[],profile:any,instructors:any[]=[]){
  const radar=spatialBurnoutAnalysis(scopeRows,termRows,profile,instructors);
  // A castling suggestion is only considered safe when it improves the target
  // problem without making geographic pressure worse anywhere else in the term.
  const globalBefore=spatialBurnoutAnalysis(termRows,termRows,profile,instructors);
  const verifyChanges=(changes:any[])=>{
    const byId=new Map(changes.map(change=>[Number(change.id),change]));
    const next=termRows.map(row=>byId.has(Number(row.id))?{...row,...byId.get(Number(row.id))}:row);
    const globalAfter=spatialBurnoutAnalysis(next,next,profile,instructors);
    return {safe:globalAfter.highRisk<=globalBefore.highRisk&&globalAfter.score>=globalBefore.score,globalAfter};
  };
  const roomMap=new Map<string,{code:string;hall:string;buildingId:string;roomId:string;count:number}>();
  termRows.forEach((r:any)=>{const code=normalizedBuilding(r.AdRoomCode),hall=String(r.AdRoomHall||"").trim(),buildingId=String(r.buildingId||""),roomId=String(r.roomId||"");if(!code||!hall||!buildingId||!roomId||r.locationStatus==="PENDING_ROOM")return;const key=`id:${roomId}`,v=roomMap.get(key)||{code,hall,buildingId,roomId,count:0};v.count++;roomMap.set(key,v);});
  const rooms=[...roomMap.values()].sort((a,b)=>b.count-a.count);
  const proposals:any[]=[];
  for(const risk of radar.risks.filter((r:any)=>r.level==="high").slice(0,12)){
    const target=termRows.find((r:any)=>Number(r.id)===Number(risk.toRowId));if(!target)continue;
    const desired=risk.fromBuilding;
    const candidates=rooms.filter(room=>room.code.toLocaleLowerCase()===desired.toLocaleLowerCase()&&roomIsFreeForRow(room,target,termRows,new Set([Number(target.id)])));
    const best=candidates[0];
    if(best){
      const changes=[{id:target.id,buildingId:best.buildingId,roomId:best.roomId,AdRoomCode:best.code,AdRoomHall:best.hall,locationStatus:"VERIFIED"}],verified=verifyChanges(changes);
      if(verified.safe)proposals.push({kind:"free-room",instructorId:risk.instructorId,instructorName:risk.instructorName,rowId:target.id,title:`تقريب القاعة إلى مبنى ${best.code}`,reason:`يحوّل الانتقال من ${risk.fromBuilding} → ${risk.toBuilding} إلى نفس المبنى قبل المحاضرة التالية، بعد فحص أثره على حركة جميع الأساتذة في الفصل.`,before:{roomCode:target.AdRoomCode,roomHall:target.AdRoomHall,gapMinutes:risk.gapMinutes,requiredMinutes:risk.requiredMinutes},after:{roomCode:best.code,roomHall:best.hall,requiredMinutes:travelMinutesFor(profile,risk.fromBuilding,best.code)},changes,safe:true,globalScoreDelta:verified.globalAfter.score-globalBefore.score});
      if(verified.safe)continue;
    }
    const swap=termRows.find((other:any)=>Number(other.id)!==Number(target.id)&&target.roomId&&target.buildingId&&other.roomId&&other.buildingId&&normalizedBuilding(other.AdRoomCode).toLocaleLowerCase()===desired.toLocaleLowerCase()&&["fsunday","fmonday","ftuesday","fwednesday","fthursday"].some(day=>rowsOverlapOnDay(target,other,day))&&roomIsFreeForRow({code:other.AdRoomCode,hall:other.AdRoomHall,buildingId:other.buildingId,roomId:other.roomId},target,termRows,new Set([Number(target.id),Number(other.id)]))&&roomIsFreeForRow({code:target.AdRoomCode,hall:target.AdRoomHall,buildingId:target.buildingId,roomId:target.roomId},other,termRows,new Set([Number(target.id),Number(other.id)])));
    if(swap){const changes=[{id:target.id,buildingId:swap.buildingId,roomId:swap.roomId,AdRoomCode:swap.AdRoomCode,AdRoomHall:swap.AdRoomHall,locationStatus:"VERIFIED"},{id:swap.id,buildingId:target.buildingId,roomId:target.roomId,AdRoomCode:target.AdRoomCode,AdRoomHall:target.AdRoomHall,locationStatus:"VERIFIED"}],verified=verifyChanges(changes);if(verified.safe)proposals.push({kind:"swap",instructorId:risk.instructorId,instructorName:risk.instructorName,rowId:target.id,title:"تبديل القاعات · تبديل آمن للقاعتين",reason:`تبديل القاعتين يقلل عبور ${risk.instructorName} بين المباني من دون تغيير الوقت أو الأستاذ أو أيام المحاضرة، ولا يُعرض إلا إذا لم يزد خطر الحركة على أي أستاذ آخر في الفصل.`,before:{roomCode:target.AdRoomCode,roomHall:target.AdRoomHall,gapMinutes:risk.gapMinutes,requiredMinutes:risk.requiredMinutes},after:{roomCode:swap.AdRoomCode,roomHall:swap.AdRoomHall,requiredMinutes:travelMinutesFor(profile,risk.fromBuilding,swap.AdRoomCode)},changes,safe:true,globalScoreDelta:verified.globalAfter.score-globalBefore.score});}
  }
  return {radar,proposals:proposals.slice(0,8)};
}

/* ── قسمٌ بلا مواعيد بعد: جوابٌ يدلّ على الطريق، لا خطأ ────────────────────
   غرفة القرار والجدولة المساعدة والمقترح التلقائي تعمل على جدولٍ قائم. وحين
   لا جدول بعد كانت تردّ 400 «لا يوجد جدول» — خطأٌ أحمر لشيءٍ ليس خطأ، ولا يقول
   ما العمل. فالجواب الآن 200 يقول إن الفصل فارغ ويشير إلى «بداية الفصل»
   (نسخ الفصل السابق مسودةً) أو إلى الاستيراد. */
function emptyScopeGuidance(what: string) {
  return {
    empty: true,
    message: `${what} يحتاج جدولاً قائماً، وهذا الفصل لا مواعيد فيه لهذا القسم بعد. ابدأ بـ«بداية الفصل من الفصل السابق» (مسودة لا تغيّر شيئاً قبل النشر) أو باستيراد الجدول من أدوات البيانات.`,
    nextStep: { kind: "genesis", endpoint: "/api/intelligence/genesis", label: "بداية الفصل من الفصل السابق" },
  };
}

export function registerIntelligenceRoutes(app: Express): void {

app.get("/api/intelligence/guide-friction", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  if (Number(req.user?.SystemUserId || 0) !== ROOT_ADMIN_USER_ID) { res.status(403).json({ error: "هذه القراءة مخصصة لإدارة النظام الرئيسية" }); return; }
  const collegeId=Number(req.query.collegeId||0), sectionId=Number(req.query.sectionId||0);
  if(!collegeId||!sectionId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج نطاقك المسموح"});return;}
  const rows=await Repository.getClientTelemetry(collegeId,sectionId,1800).catch(()=>[]);
  const now=Date.now(), day=24*60*60*1000, cutoff=now-30*day, previousCutoff=now-60*day;
  const counts=new Map<string,number>();
  type FrictionAggregate={feature:string;version:number;step:string;attempt:number;completed:number;failed:number;abandoned:number;helped:number;resolvedAfterHelp:number;previousFailed:number;previousTotal:number};
  const structured=new Map<string,FrictionAggregate>();
  rows.filter(item=>item.kind==="guide"&&Date.parse(item.timestamp)>=previousCutoff).forEach(item=>{
    const name=String(item.name||"نقطة تعثر").slice(0,140);
    const stamp=Date.parse(item.timestamp);
    if(stamp>=cutoff)counts.set(name,(counts.get(name)||0)+1);
    if(!name.startsWith("journey|"))return;
    const [,feature="unknown",versionText="0",step="journey",outcome="attempt"]=name.split("|");
    const key=`${feature}|${versionText}|${step}`;
    const value=structured.get(key)||{feature,version:Number(versionText)||0,step,attempt:0,completed:0,failed:0,abandoned:0,helped:0,resolvedAfterHelp:0,previousFailed:0,previousTotal:0};
    if(stamp>=cutoff){
      if(outcome==="attempt"||outcome==="started")value.attempt++;
      if(outcome==="completed"||outcome==="resolvedAfterHelp")value.completed++;
      if(outcome==="resolvedAfterHelp")value.resolvedAfterHelp++;
      if(outcome==="failed")value.failed++;
      if(outcome==="abandoned")value.abandoned++;
      if(outcome==="helped")value.helped++;
    } else {
      value.previousTotal++;
      if(outcome==="failed"||outcome==="abandoned")value.previousFailed++;
    }
    structured.set(key,value);
  });
  const insights=[...structured.values()].map(value=>{
    const total=Math.max(1,value.attempt+value.completed+value.failed+value.abandoned);
    const failureRate=(value.failed+value.abandoned)/total;
    const previousRate=value.previousTotal?value.previousFailed/value.previousTotal:0;
    return{featureId:value.feature,version:value.version,step:value.step,attempt:value.attempt,completed:value.completed,failed:value.failed,abandoned:value.abandoned,helped:value.helped,resolvedAfterHelp:value.resolvedAfterHelp,failureRate:Number(failureRate.toFixed(3)),abandonRate:Number((value.abandoned/total).toFixed(3)),helpRate:Number((value.helped/total).toFixed(3)),helpToSuccessRate:Number((value.resolvedAfterHelp/Math.max(1,value.helped)).toFixed(3)),changeVsPrevious:Number((failureRate-previousRate).toFixed(3))};
  }).sort((a,b)=>(b.failureRate+b.helpRate*.35)-(a.failureRate+a.helpRate*.35)).slice(0,12);
  const items=[...counts.entries()].map(([name,count])=>({name,count})).filter(item=>!item.name.startsWith("journey|")).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,"ar")).slice(0,8);
  res.json({items,insights,windowDays:30,anonymous:true,interpretation:"ارتفاع التعثر الجماعي بعد إصدار جديد قد يعني أن الواجهة نفسها تحتاج إعادة تصميم، لا أن المستخدم يحتاج شرحًا أكثر."});
});

app.get("/api/intelligence/experience-health", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);
  if(!collegeId||!sectionId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const readScopes = await intelligenceReadScopes(req, collegeId, sectionId);
  const telemetry=(await Promise.all(readScopes.map(scope => Repository.getClientTelemetry(scope.collegeId,scope.sectionId,1000)))).flat();
  const cutoff=Date.now()-14*24*60*60*1000;
  const recent=telemetry.filter(item=>item.kind!=="guide"&&Date.parse(item.timestamp)>=cutoff);
  const perf=apiPerformanceSamples.filter(item=>item.at>=Date.now()-2*60*60*1000 && (readScopes.some(scope => item.sectionId===scope.sectionId && (!item.collegeId || item.collegeId === scope.collegeId)) || (!item.sectionId && item.userId===Number(req.user?.SystemUserId||0) && (!item.collegeId || readScopes.some(scope => scope.collegeId === item.collegeId)))));
  const durations=[...perf.map(item=>item.durationMs),...recent.filter(item=>item.kind==="api"&&item.durationMs).map(item=>Number(item.durationMs))].filter(Number.isFinite).sort((a,b)=>a-b);
  const p=(share:number)=>durations.length?durations[Math.min(durations.length-1,Math.floor((durations.length-1)*share))]:0;
  const failures=recent.filter(item=>item.kind==="error"||(item.kind==="api"&&(item.ok===false||(item.status||0)>=400))||(item.kind==="sync"&&item.ok===false));
  const offline=recent.filter(item=>item.kind==="offline").length;
  const slow=durations.filter(ms=>ms>=1800).length;
  const total=Math.max(1,durations.length);
  const score=Math.max(0,Math.min(100,Math.round(100-(failures.length/Math.max(1,recent.length))*55-(slow/total)*35-Math.min(10,offline))));
  const byPath=new Map<string,{count:number,total:number,errors:number}>();
  perf.forEach(item=>{const x=byPath.get(item.path)||{count:0,total:0,errors:0};x.count++;x.total+=item.durationMs;if(item.status>=400)x.errors++;byPath.set(item.path,x);});
  const slowest=[...byPath.entries()].map(([path,x])=>({path,count:x.count,avg:Math.round(x.total/Math.max(1,x.count)),errors:x.errors})).sort((a,b)=>b.avg-a.avg).slice(0,5);
  const replays=failures.filter(item=>item.breadcrumbs?.length).slice(0,6).map(item=>({timestamp:item.timestamp,name:item.name,message:item.message||"",breadcrumbs:item.breadcrumbs||[]}));
  res.json({score,label:score>=90?"ممتازة":score>=75?"جيدة":score>=55?"تحتاج متابعة":"تحتاج تدخلاً",samples:durations.length,p50:Math.round(p(.5)),p95:Math.round(p(.95)),slow,failures:failures.length,offline,slowest,replays,termId});
});

app.get("/api/intelligence/open-decisions", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [manual,scheduleData,courses,instructors,history]=await Promise.all([
    Repository.getOpenDecisions(collegeId,sectionId,termId,120),
    scopedScheduleUniverse(collegeId,sectionId,termId),
    Repository.getCoursesBySection(sectionId),Repository.getInstructorsByScope(sectionId,0),Repository.getSchedulesByScope({collegeId,sectionId}),
  ]);
  const analysis=analyzeSchedule(scheduleData.rows,scheduleData.universe,courses,instructors,await approvalBlockerOptions());
  const anomalies=logicalAnomalies(scheduleData.rows,history);
  const inferred=[
    ...(analysis.alerts||[]).slice(0,5).map((item:any,index:number)=>({id:`inferred:alert:${index}`,title:item.title||"قرار يحتاج مراجعة",detail:item.detail||"",priority:index===0?"high":"medium",source:"inferred"})),
    ...anomalies.filter(item=>item.severity!=="low").slice(0,4).map((item,index)=>({id:`inferred:anomaly:${index}`,title:item.title,detail:item.detail,priority:item.severity,source:"inferred",scheduleId:item.rowId})),
  ];
  res.json({manual,inferred,totalOpen:manual.filter(item=>item.status==="open").length+inferred.length});
});

app.post("/api/intelligence/open-decisions", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const title=String(req.body?.title||"").trim().slice(0,140); if(title.length<3){res.status(400).json({error:"اكتب عنوان القرار المفتوح"});return;}
  const priority=["low","medium","high"].includes(String(req.body?.priority))?String(req.body.priority):"medium";
  const created=await Repository.createOpenDecision({
    SystemUserId:Number(req.user.SystemUserId),userName:String(req.user.Name||""),AdCollegeId:collegeId,AdSectionId:sectionId,AdTermId:termId,
    title,detail:String(req.body?.detail||"").trim().slice(0,500)||undefined,owner:String(req.body?.owner||"").trim().slice(0,100)||undefined,dueAt:String(req.body?.dueAt||"").slice(0,30)||undefined,
    priority:priority as any,scheduleId:Number(req.body?.scheduleId||0)||undefined,source:req.body?.source==="assistant"?"assistant":"manual"
  });
  res.status(201).json(created);
});

app.patch("/api/intelligence/open-decisions/:id", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const existing=(await Repository.getOpenDecisions(collegeId,sectionId,termId,250)).find(item=>item.id===String(req.params.id));
  if(!existing){res.status(404).json({error:"القرار غير موجود في هذا النطاق"});return;}
  const fields:any={};
  if(["open","done"].includes(String(req.body?.status)))fields.status=String(req.body.status);
  if(["low","medium","high"].includes(String(req.body?.priority)))fields.priority=String(req.body.priority);
  if(typeof req.body?.owner==="string")fields.owner=String(req.body.owner).trim().slice(0,100);
  if(typeof req.body?.dueAt==="string")fields.dueAt=String(req.body.dueAt).slice(0,30);
  res.json(await Repository.updateOpenDecision(existing.id,fields));
});

app.get("/api/intelligence/operations-review", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [current,history,versions,terms,courses]=await Promise.all([
    Repository.getSchedulesByScope({collegeId,sectionId,termId}),Repository.getSchedulesByScope({collegeId,sectionId}),Repository.getScheduleVersionsWithRows(collegeId,sectionId,termId,24),Repository.getTerms(),Repository.getCoursesBySection(sectionId),
  ]);
  const accuracy=scheduleAccuracyFromVersions(versions,current);
  const anomalies=logicalAnomalies(current,history);
  const rules=discoverUnwrittenRules(history,terms,courses.filter(course=>Number(course.AdSectionId)===sectionId));
  res.json({accuracy,anomalies,unwrittenRules:rules,history:{rows:history.length,terms:new Set(history.map(row=>row.AdTermId)).size}});
});

app.post("/api/intelligence/policy-simulate", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);
  if(!termId){res.status(400).json({error:"حدد الفصل الدراسي"});return;}
  const university=Boolean(req.user?.IsAdminUser&&req.body?.scope==="university");
  if(!university&&(!collegeId||!sectionId||!isScopeAllowed(req,collegeId,sectionId))){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const type=String(req.body?.type||"");
  if(!["day_off","close_building","no_classes_after","growth"].includes(type)){res.status(400).json({error:"اختر سياسة قابلة للمحاكاة"});return;}
  const readScopes = university ? [] : await intelligenceReadScopes(req, collegeId, sectionId);
  const [terms,current,historyAll]=await Promise.all([
    Repository.getTerms(),
    university?Repository.getSchedulesByScope({termId}):Promise.all(readScopes.map(scope => Repository.getSchedulesByScope({...scope,termId}))).then(groups => groups.flat()),
    university?Repository.getSchedules():Promise.all(readScopes.map(scope => Repository.getSchedulesByScope(scope))).then(groups => groups.flat()),
  ]);
  const recent=recentTenYearTermIds(terms); const history=historyAll.filter(row=>recent.has(Number(row.AdTermId||0)));
  const input={type,day:String(req.body?.day||"") as any,time:String(req.body?.time||"17:00").slice(0,5),building:String(req.body?.building||"").trim().slice(0,40),growth:Number(req.body?.growth||10)};
  const result=simulatePolicy(current,history,input);
  const isAffected=(row:any)=>type==="day_off"?Boolean(row[input.day]):type==="close_building"?String(row.AdRoomCode||"").trim().toLowerCase()===input.building.toLowerCase():type==="no_classes_after"?timeToMinutes(row.fendtime)>timeToMinutes(input.time):false;
  const affected=type==="growth"?[]:current.filter(isAffected);
  res.json({...result,scope:university?"university":"department",impact:{sections:new Set(affected.map(row=>row.AdSectionId)).size,instructors:new Set(affected.map(row=>row.AdInstructorId)).size,rooms:new Set(affected.map(row=>roomIdentityKey(row)).filter(Boolean)).size},guardrail:"محاكاة فقط؛ لا تغيّر أي موعد ولا قاعدة."});
});

app.get("/api/intelligence/overview", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const { collegeId, sectionId, termId, section } = await resolveSmartContext(req);
  if (!collegeId || !sectionId || !termId || !section) { res.status(400).json({ error: "لا يوجد قسم أو فصل دراسي متاح للتحليل" }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const [scheduleData, courses, instructors, colleges, terms, drafts, publication, mobilityProfile] = await Promise.all([
    scopedScheduleUniverse(collegeId, sectionId, termId), Repository.getCourses(), Repository.getInstructors(), Repository.getColleges(), Repository.getTerms(),
    Repository.getScheduleDrafts(collegeId, sectionId, termId), Repository.getSchedulePublication(collegeId, sectionId, termId), Repository.getCampusMobilityProfile(collegeId)
  ]);
  const readScopes = await intelligenceReadScopes(req, collegeId, sectionId);
  const family = readScopes.map(scope => ({ ...scope, collegeName: colleges.find(c => Number(c.AdCollegeId) === scope.collegeId)?.AdCollegeName || "" }));
  const {universe:termRows}=scheduleData;
  const target = readScopes.length > 1 ? termRows.filter(row => readScopes.some(scope => Number(row.AdCollegeId) === scope.collegeId && Number(row.AdSectionId) === scope.sectionId)) : scheduleData.rows;
  const collegeReadings = await Promise.all(family.map(async scope => {
    const own = rowsForIntelligenceScope(target, scope);
    const profile = scope.collegeId === collegeId ? mobilityProfile : await Repository.getCampusMobilityProfile(scope.collegeId);
    const spatial = roomCastlingProposals(own, termRows, profile, instructors);
    const analysis = analyzeSchedule(own, termRows, courses, instructors, await approvalBlockerOptions());
    const publication = scope.collegeId === collegeId && scope.sectionId === sectionId ? undefined : await Repository.getSchedulePublication(scope.collegeId, scope.sectionId, termId);
    return { scope, analysis, publication, spatial };
  }));
  const analysis = analyzeSchedule(target, termRows, courses, instructors, await approvalBlockerOptions());
  const spatial = readScopes.length === 1 ? collegeReadings[0].spatial : {
    radar: { ...collegeReadings[0].spatial.radar,
      score: Math.min(...collegeReadings.map(item => item.spatial.radar.score)),
      highRisk: collegeReadings.reduce((n, item) => n + item.spatial.radar.highRisk, 0),
      guardedRisk: collegeReadings.reduce((n, item) => n + item.spatial.radar.guardedRisk, 0),
      risks: collegeReadings.flatMap(item => item.spatial.radar.risks.map(risk => ({ ...risk, readingScope: item.scope }))),
    },
    proposals: collegeReadings.flatMap(item => item.spatial.proposals.filter(proposal => (proposal.changes || []).every(change => rowsForIntelligenceScope(target, item.scope).some(row => Number(row.id) === Number(change.id)))).map(proposal => ({ ...proposal, readingScope: item.scope }))),
  };
  const universityHeatmap:any[]=[];
  for(const day of SCHEDULE_DAYS){for(let minute=SCHEDULE_DAY_START;minute<SCHEDULE_DAY_END;minute+=SCHEDULE_SLOT_MINUTES){const count=termRows.filter(row=>Boolean((row as any)[day.key])&&timeToMinutes(row.fstarttime)<minute+SCHEDULE_SLOT_MINUTES&&timeToMinutes(row.fendtime)>minute).length;universityHeatmap.push({day:day.key,label:day.label,time:minutesToTime(minute),count})}}
  const universityPeak=Math.max(0,...universityHeatmap.map(x=>x.count));
  res.json({
    context:{collegeId,sectionId,termId,collegeName:colleges.find(x=>x.AdCollegeId===collegeId)?.AdCollegeName||"",sectionName:section.AdSectionName,termName:terms.find(x=>x.AdTermId===termId)?.AdTermName||""},
    ...analysis,
    readingRows: target, family, analysisScope: (req.query.analysisScope === "department" ? "department" : "college"),
    alerts: readScopes.length > 1 ? [...collegeReadings.flatMap(item => item.analysis.alerts.filter(alert => alert.title !== "الوضع مستقر").map(alert => ({...alert, readingScope: item.scope}))), ...analysis.alerts.filter(alert => alert.title === "الوضع مستقر")].sort((a,b) => ({critical:0,warning:1,info:2}[a.severity] - {critical:0,warning:1,info:2}[b.severity])) : analysis.alerts,
    collegeReadings: collegeReadings.map(item => ({ ...item.scope, score: item.analysis.score, metrics: item.analysis.metrics, dayLoad: item.analysis.dayLoad, professorLoads: item.analysis.professorLoads, blockers: item.analysis.metrics.criticalConflicts, publication: item.publication || (item.scope.collegeId === collegeId && item.scope.sectionId === sectionId ? publication : null) })),
    draftCount:drafts.filter(d=>d.status==="draft").length,
    latestDraft:drafts.find(d=>d.status==="draft") ? {id:drafts.find(d=>d.status==="draft")!.id,name:drafts.find(d=>d.status==="draft")!.name,updatedAt:drafts.find(d=>d.status==="draft")!.updatedAt,source:drafts.find(d=>d.status==="draft")!.source} : null,
    publication:publication||null, universityHeatmap, universityPeak,
    spatialBurnout: spatial.radar, roomCastling: spatial.proposals
  });
});

app.get("/api/intelligence/spatial-burnout", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [scheduleData,instructors,profile]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getInstructors(),Repository.getCampusMobilityProfile(collegeId)]);
  const result=roomCastlingProposals(scheduleData.rows,scheduleData.universe,profile,instructors);
  res.json(result);
});

app.post("/api/intelligence/conflict-solutions", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const body=req.body||{}; const collegeId=Number(body.AdCollegeId||body.collegeId||0),sectionId=Number(body.AdSectionId||body.sectionId||0),termId=Number(body.AdTermId||body.termId||0);
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const rows=safeDraftRows([body],collegeId,sectionId,termId); if(!rows.length){res.status(400).json({error:"بيانات الموعد غير مكتملة"});return;}
  const errors=await validateSmartRows(rows,collegeId,sectionId); if(errors.length){res.status(400).json({error:errors[0],issues:errors});return;}
  const termRows=await Repository.getSchedulesByScope({termId});
  res.json({solutions:conflictSolutions(rows[0],termRows,5)});
});

// Ripple Forecast is deliberately read-only. It forecasts the exact drag target before the UI drops it.
app.post("/api/intelligence/ripple/:id", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const id=Number(req.params.id||0),targetDay=String(req.body?.targetDay||""),targetStart=String(req.body?.targetStart||"").slice(0,5);
  const row=await Repository.getScheduleById(id); if(!row){res.status(404).json({error:"الموعد غير موجود"});return;}
  if(!isScopeAllowed(req,row.AdCollegeId,row.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  if(!SCHEDULE_DAYS.some(d=>d.key===targetDay)||!/^\d{2}:\d{2}$/.test(targetStart)){res.status(400).json({error:"موضع السحب غير صالح"});return;}
  const duration=Math.max(30,timeToMinutes(row.fendtime)-timeToMinutes(row.fstarttime)),start=timeToMinutes(targetStart);
  if(!withinScheduleDay(start,start+duration)){res.status(400).json({error:`وقت المعاينة يجب أن يكون بين ${SCHEDULE_DAY_START_TIME} و${SCHEDULE_DAY_END_TIME}`});return;}
  const candidate:any={...row,fstarttime:targetStart,fendtime:minutesToTime(start+duration)};
  const selectedDays=activeDays(row);if(selectedDays.length===1)for(const day of SCHEDULE_DAYS)candidate[day.key]=day.key===targetDay;
  const [scheduleData,courses,instructors,mobilityProfile]=await Promise.all([scopedScheduleUniverse(row.AdCollegeId,row.AdSectionId,row.AdTermId),Repository.getCourses(),Repository.getInstructors(),Repository.getCampusMobilityProfile(row.AdCollegeId)]);
  const {rows:scopeRows,universe:termRows}=scheduleData;
  const forecast:any=forecastScheduleMove(row,candidate,scopeRows,termRows,courses,instructors,selectedDays.length===1?targetDay:selectedDays[0]);
  const nextScope=scopeRows.map(item=>item.id===row.id?candidate:item), nextUniverse=termRows.map(item=>item.id===row.id?candidate:item);
  const beforeSpatial=spatialBurnoutAnalysis(scopeRows,termRows,mobilityProfile,instructors),afterSpatial=spatialBurnoutAnalysis(nextScope,nextUniverse,mobilityProfile,instructors);
  const relevant=afterSpatial.risks.filter((risk:any)=>risk.fromRowId===row.id||risk.toRowId===row.id).slice(0,3);
  forecast.spatialBurnout={beforeScore:beforeSpatial.score,afterScore:afterSpatial.score,delta:afterSpatial.score-beforeSpatial.score,risks:relevant};
  if(relevant.length){const worst=relevant[0];forecast.effects=[...(forecast.effects||[]),{tone:worst.level==="high"?"warn":"neutral",text:worst.level==="high"?`خطر الإرهاق الجسدي: انتقال ${worst.fromBuilding} → ${worst.toBuilding} يحتاج ${countOf(worst.requiredMinutes, oblique(AR.minute))} والمتاح ${worst.gapMinutes} فقط`:`هامش انتقال جغرافي ضيق: ${countOf(worst.marginMinutes, AR.minute)}`}];forecast.delta={...(forecast.delta||{}),spatialBurnout:afterSpatial.score-beforeSpatial.score};}
  res.json(forecast);
});

app.get("/api/intelligence/lookups", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  if(req.user?.IsAdminUser){
    const [courses,instructors]=await Promise.all([Repository.getCourses(),Repository.getInstructors()]);
    res.json({courses,instructors});return;
  }
  /* أقسامُ القارئ من الحَكَم الواحد (صفُّ «الكلية كلها» يُقرأ لأقسامها). */
  const sectionIds=[...await scopeSectionIdsFor(req)];
  const [courseGroups,instructorGroups]=await Promise.all([
    Promise.all(sectionIds.map(id=>Repository.getCoursesBySection(id))),
    Promise.all(sectionIds.map(id=>Repository.getInstructorsByScope(id,0))),
  ]);
  const courseMap=new Map<number,any>(),instructorMap=new Map<number,any>();
  courseGroups.flat().forEach(item=>courseMap.set(Number(item.AdCourseId),item));
  instructorGroups.flat().forEach(item=>instructorMap.set(Number(item.AdInstructorId),item));
  res.json({courses:[...courseMap.values()],instructors:[...instructorMap.values()]});
});

app.get("/api/intelligence/genome", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const scopes = await intelligenceReadScopes(req, collegeId, sectionId);
  const [rowGroups,terms,courses,instructors]=await Promise.all([
    Promise.all(scopes.map(scope => Repository.getSchedulesByScope(scope))),
    Repository.getTerms(),Repository.getCourses(),Repository.getInstructors()
  ]);
  res.json(buildScheduleGenome(rowGroups.flat(),terms,termId,courses,instructors));
});

app.get("/api/intelligence/constraints", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const scopes = await intelligenceReadScopes(req, collegeId, sectionId);
  res.json((await Promise.all(scopes.map(scope => Repository.getScheduleConstraints(scope.collegeId, scope.sectionId, termId)))).flat());
});
app.post("/api/intelligence/constraints", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const type=String(req.body?.type||"");const allowed=new Set(["instructor_latest_end","instructor_day_off","department_day_off","course_room","max_instructor_gap","room_doorway"]);if(!allowed.has(type)){res.status(400).json({error:"نوع القاعدة غير صالح"});return;}
  const [courses,instructors]=await Promise.all([Repository.getCourses(),Repository.getInstructors()]);const instructorId=Number(req.body?.AdInstructorId||0),courseId=Number(req.body?.AdCourseId||0),day=String(req.body?.day||""),time=String(req.body?.time||"").slice(0,5),buildingId=String(req.body?.buildingId||"").trim(),roomId=String(req.body?.roomId||"").trim();let roomCode="",roomHall="";const maxMinutes=type==="room_doorway"
    // A doorway is a handful of minutes; the instructor-gap clamp starts at
    // thirty and would silently turn a ten-minute break into half an hour.
    ?Math.max(1,Math.min(60,Number(req.body?.maxMinutes||0)))
    :Math.max(30,Math.min(480,Number(req.body?.maxMinutes||120)));
  const instructor=instructors.find(i=>i.AdInstructorId===instructorId),course=courses.find(c=>c.AdCourseId===courseId&&c.AdCollegeId===collegeId&&c.AdSectionId===sectionId);
  if((type==="instructor_latest_end"||type==="instructor_day_off"||(type==="max_instructor_gap"&&instructorId))&&!instructor){res.status(400).json({error:"اختر أستاذ مقرر صالح"});return;}
  if(instructorId && instructor && !isAssignableInstructor(instructor)){res.status(400).json({error:"لا يمكن إنشاء قاعدة جديدة لأستاذ متقاعد أو متفرّغ"});return;}
  if(type==="instructor_latest_end"&&(!/^\d{2}:\d{2}$/.test(time)||timeToMinutes(time)<SCHEDULE_DAY_START||timeToMinutes(time)>SCHEDULE_DAY_END)){res.status(400).json({error:`حدد آخر وقت مسموح بين ${SCHEDULE_DAY_START_TIME} و${SCHEDULE_DAY_END_TIME}`});return;}
  if((type==="instructor_day_off"||type==="department_day_off")&&!SCHEDULE_DAYS.some(d=>d.key===day)){res.status(400).json({error:"حدد يوماً صالحاً"});return;}
  if(type==="course_room"){
    if(!course||!buildingId||!roomId){res.status(400).json({error:"اختر المقرر والمبنى والقاعة من السجل الرسمي"});return;}
    const registry=await readLocationRegistry();
    const check=locationPreflight({buildingId,roomId,AdCollegeId:collegeId,AdSectionId:sectionId},registry,{collegeId,sectionId});
    if(!check.ok||!check.canonical?.roomId){res.status(400).json({error:check.issues.find(i=>i.severity==="high")?.message||"القاعة غير معتمدة في السجل الرسمي",issues:check.issues});return;}
    roomCode=String(check.canonical.AdRoomCode||"");roomHall=String(check.canonical.AdRoomHall||"");
  }
  const dayLabel=SCHEDULE_DAYS.find(d=>d.key===day)?.label||"";const label=type==="instructor_latest_end"?`${instructor?.AdInstructorName}: لا محاضرات بعد ${time}`:type==="instructor_day_off"?`${instructor?.AdInstructorName}: ${dayLabel} يوم محجوز`:type==="department_day_off"?`${dayLabel}: يوم محجوز للقسم`:type==="course_room"?`${course?.CourseCode||course?.CourseName}: القاعة ${roomCode}/${roomHall}`:instructor?`${instructor.AdInstructorName}: الفراغ لا يتجاوز ${countOf(maxMinutes, oblique(AR.minute))}`:`أي أستاذ: الفراغ لا يتجاوز ${countOf(maxMinutes, oblique(AR.minute))}`;
  const created=await Repository.createScheduleConstraint({SystemUserId:req.user.SystemUserId,userName:req.user.Name,AdCollegeId:collegeId,AdSectionId:sectionId,AdTermId:termId,type:type as any,label,enabled:true,AdInstructorId:(type==="instructor_latest_end"||type==="instructor_day_off"||type==="max_instructor_gap")?(instructorId||undefined):undefined,AdCourseId:type==="course_room"?(courseId||undefined):undefined,day:(type==="instructor_day_off"||type==="department_day_off")&&SCHEDULE_DAYS.some(d=>d.key===day)?day as any:undefined,time:type==="instructor_latest_end"?(time||undefined):undefined,buildingId:type==="course_room"?buildingId:undefined,roomId:type==="course_room"?roomId:undefined,roomCode:type==="course_room"?(roomCode||undefined):undefined,roomHall:type==="course_room"?(roomHall||undefined):undefined,maxMinutes:type==="max_instructor_gap"?maxMinutes:undefined});res.status(201).json(created);
});
app.put("/api/intelligence/constraints/:id", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const id=String(req.params.id);
  const {collegeId,sectionId,termId}=smartContextFrom(req);if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const item=(await Repository.getScheduleConstraints(collegeId,sectionId,termId)).find(c=>c.id===id);if(!item){res.status(404).json({error:"القاعدة غير موجودة في هذا النطاق"});return;}
  res.json(await Repository.updateScheduleConstraint(id,{enabled:typeof req.body?.enabled==="boolean"?req.body.enabled:item.enabled}));
});
app.delete("/api/intelligence/constraints/:id", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const item=(await Repository.getScheduleConstraints(collegeId,sectionId,termId)).find(c=>c.id===String(req.params.id));if(!item){res.status(404).json({error:"القاعدة غير موجودة في هذا النطاق"});return;}await Repository.deleteScheduleConstraint(item.id);res.json({success:true});
});

app.post("/api/intelligence/war-room", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [scheduleData,courses,instructors,constraints]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleConstraints(collegeId,sectionId,termId)]);const {rows:base,universe}=scheduleData;if(!base.length){res.json(emptyScopeGuidance("غرفة القرار"));return;}
  const room:any=buildWarRoom(base,universe,courses,instructors,constraints,Number(req.body?.rowId||0)||undefined);
  /* أثر الأستاذ في كل خيار يحمل علمَ المنتدب (بقسم الشاشة وفصلها) ليرسم العنوانُ شارتَه. */
  if(Array.isArray(room?.options)){
    const visitingIds=new Set((await readVisitingStatus(collegeId,sectionId,termId)).instructorIds.map(Number));
    room.options=room.options.map((option:any)=>{
      if(!option?.professorImpact)return option;
      const person=instructors.find(item=>item.AdInstructorName===option.professorImpact.name);
      return {...option,professorImpact:{...option.professorImpact,instructorId:person?.AdInstructorId,visiting:Boolean(person&&visitingIds.has(Number(person.AdInstructorId)))}};
    });
  }
  res.json(room);
});

app.post("/api/intelligence/autopilot", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req),goal=String(req.body?.goal||"حافظ على خلو الجدول من الموانع وقلل الفراغات بأقل تغيير ممكن").trim().slice(0,240);if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [scheduleData,courses,instructors,constraints]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleConstraints(collegeId,sectionId,termId)]);const {rows:base,universe}=scheduleData;if(!base.length){res.json(emptyScopeGuidance("الجدولة المساعدة"));return;}
  res.json(runScheduleAutopilot(base,universe,courses,instructors,constraints,goal,240));
});

app.post("/api/intelligence/evaluate", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const rows=safeDraftRows(req.body?.rows,collegeId,sectionId,termId); const errors=await validateSmartRows(rows,collegeId,sectionId,{checkConflicts:false});
  if(errors.length){res.status(400).json({error:"المسودة تحتوي بيانات تحتاج مراجعة",issues:errors});return;}
  const [scheduleData,courses,instructors,constraints]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleConstraints(collegeId,sectionId,termId)]);
  const {rows:baseline,universe}=scheduleData;
  const external=universe.filter(row=>!(row.AdCollegeId===collegeId&&row.AdSectionId===sectionId));
  res.json({baseline:analyzeSchedule(baseline,universe,courses,instructors,await approvalBlockerOptions()),scenario:analyzeSchedule(rows,[...external,...rows],courses,instructors,await approvalBlockerOptions()),constraints:{baseline:evaluateScheduleConstraints(baseline,constraints),scenario:evaluateScheduleConstraints(rows,constraints)}});
});

app.post("/api/intelligence/auto-schedule", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [scheduleData,courses,instructors]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors()]);
  const target=scheduleData.rows.filter(row=>Number(row.AdCollegeId)===collegeId&&Number(row.AdSectionId)===sectionId&&Number(row.AdTermId)===termId);
  const universe=scheduleData.universe;
  if(!target.length){res.json(emptyScopeGuidance("المقترح التلقائي"));return;}
  const proposal=autoScheduleProposal(target,universe);
  const external=universe.filter(row=>row.AdTermId===termId&&!(row.AdCollegeId===collegeId&&row.AdSectionId===sectionId));
  const before=analyzeSchedule(target,universe.filter(row=>row.AdTermId===termId),courses,instructors,await approvalBlockerOptions());
  const proposedAnalysis=analyzeSchedule(proposal.rows,[...external,...proposal.rows],courses,instructors,await approvalBlockerOptions());
  const safeImprovement=proposedAnalysis.metrics.criticalConflicts<before.metrics.criticalConflicts||(proposedAnalysis.metrics.criticalConflicts===before.metrics.criticalConflicts&&proposedAnalysis.score>=before.score);
  const chosenRows=safeImprovement?proposal.rows:target,changed=safeImprovement?proposal.changed:0,after=safeImprovement?proposedAnalysis:before;
  const summary=changed?`اقتراح آمن غيّر وقت ${countOf(changed, oblique(AR.appointment))} فقط، مع إبقاء المقرر والأستاذ والأيام والقاعة كما هي. موانع الحفظ ${before.metrics.criticalConflicts} ← ${after.metrics.criticalConflicts}، والجودة ${before.score} ← ${after.score}.`:`حللت البدائل ولم أجد تغييراً آمناً أفضل من الجدول الحالي ضمن القيود نفسها؛ لذلك لم أقترح أي تعديل تلقائي.`;
  res.json({rows:chosenRows,changed,before,after,summary});
});

app.post("/api/intelligence/copilot", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); const prompt=String(req.body?.prompt||"").trim();
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  if(prompt.length<2){res.status(400).json({error:"اكتب سؤالك للمساعد"});return;}
  const [scheduleData,courses,instructors,sections]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors(),Repository.getSections()]);
  const readScopes = await intelligenceReadScopes(req, collegeId, sectionId);
  const target = scheduleData.universe.filter(row => readScopes.some(scope => Number(row.AdCollegeId) === scope.collegeId && Number(row.AdSectionId) === scope.sectionId) && Number(row.AdTermId) === termId);
  const universe=scheduleData.universe;
  const analysis=analyzeSchedule(target,universe,courses,instructors,await approvalBlockerOptions()); const bullets:string[]=[]; let title="قراءة ذكية للجدول";
  /**
   * ── الإجابة المرسومة ──────────────────────────────────────────────────────
   *
   * Every branch below already computes real figures — a score, a count of
   * blockers, minutes of idle time, a utilisation per hall — and then dissolves
   * all of them into one Arabic sentence. The sentence is worth keeping; the
   * figures were being thrown away, and a paragraph is the slowest possible way
   * to deliver a number.
   *
   * So each branch now also hands back what it measured, in a shape the screen
   * can draw: figures for the headline, bars for anything with a proportion,
   * and a before/after pair when the answer is about a change. The prose stays
   * underneath for whoever wants the reasoning.
   */
  type Figure = { label: string; value: string; tone?: "good"|"warn"|"bad"|"plain"; hint?: string };
  type Bar = { label: string; value: number; max: number; caption?: string };
  const figures: Figure[] = [];
  const bars: Bar[] = [];
  let shift: { label: string; before: number|string; after: number|string; better?: boolean } | null = null;
  let shape: "reading"|"alert"|"gaps"|"crowd"|"investigation"|"move"|"plan"|"rooms" = "reading"; let summary=`جودة الجدول الحالية ${analysis.score}/100، مع ${countOf(analysis.metrics.criticalConflicts, oblique(AR.position), "لا مواضع")} بحاجة إلى تحقق و${countOf(analysis.metrics.avgInstructorGap, AR.minute)} كمتوسط فراغ للأساتذة.`;
  const normalized=prompt.replace(/[؟?]/g,"").toLowerCase();
  const dayMatch=SCHEDULE_DAYS.find(day=>normalized.includes(day.label));
  const hourMatch=normalized.match(/(?:إلى|الى|الساعة|وقت)\s*(\d{1,2})(?::(\d{2}))?/);
  const requestedHour=hourMatch?Math.min(23,Number(hourMatch[1]))*60+Number(hourMatch[2]||0):null;
  const profHint=normalized.match(/(?:د\.?|دكتور|الدكتور)\s*([^\s]+)/)?.[1];
  /* «منو / مين / كم / الجميع» is a question ABOUT the department, not about one
     named person, so it must never be read as naming an instructor. */
  const isAggregateAsk=/\b(منو|مين|من عنده|كم|الجميع|كل الأساتذة|كل الاساتذة|أي أستاذ|اي استاذ)\b/.test(normalized)||/^من\s/.test(normalized);
  /* A name is "mentioned" only if a real, non-trivial name appears in the text.
     Matching by includes() alone let an instructor whose stored name is empty
     satisfy normalized.includes("") for EVERY query — which is how "who has a
     long gap?" was answered with "no data for this instructor". */
  const namedInstructor=isAggregateAsk?undefined:instructors.find(i=>{
    const name=String(i.AdInstructorName||"").trim().toLowerCase();
    if(name.length<4)return false;
    return normalized.includes(name)||Boolean(profHint&&profHint.length>=3&&name.includes(profHint));
  });
  const mentionedInstructor=namedInstructor;
  const scopedInstructorIds=new Set(target.map(row=>Number(row.AdInstructorId||0)).filter(Boolean));
  const requestedInstructor=mentionedInstructor&&scopedInstructorIds.has(Number(mentionedInstructor.AdInstructorId))?mentionedInstructor:undefined;
  const sectionName=sections.find(s=>Number(s.AdSectionId)===sectionId)?.AdSectionName||"القسم المحدد";
  if(mentionedInstructor&&!requestedInstructor){
    title=`لا بيانات لهذا الأستاذ في ${sectionName}`;
    summary=`وجدت الاسم في دليل الجامعة، لكنه لا يملك موعداً داخل ${sectionName} والفصل المحدد. لم أخلط جدول قسم آخر بهذه الإجابة.`;
    shape="gaps";
    figures.push({label:"مواعيد داخل النطاق",value:"0",tone:"plain"},{label:"النطاق المقروء",value:sectionName,tone:"plain"});
  } else if(normalized.includes("المشكلة الأكبر")||normalized.includes("اكبر مشكلة")||normalized.includes("أكبر مشكلة")||normalized.includes("وين المشكلة")){
    const topAlert=analysis.alerts?.[0],topFactor=[...(analysis.factors||[])].sort((a:any,b:any)=>b.penalty-a.penalty)[0];title="أكبر نقطة تحتاج تدخلك الآن";summary=topAlert?`${topAlert.title}: ${topAlert.detail}`:topFactor&&topFactor.penalty>0?`أكبر خصم من جودة الجدول حالياً هو ${topFactor.label} (-${topFactor.penalty}).`:`لا تظهر مشكلة حرجة حالياً؛ جودة الجدول ${analysis.score}/100.`;analysis.alerts.slice(1,5).forEach((a:any)=>bullets.push(`${a.title}: ${a.detail}`));
    shape="alert";
    figures.push({label:"جودة الجدول",value:`${analysis.score}`,tone:analysis.score>=75?"good":analysis.score>=55?"warn":"bad",hint:"من 100"},
      {label:"موانع الحفظ",value:`${analysis.metrics.criticalConflicts}`,tone:analysis.metrics.criticalConflicts?"bad":"good"},
      {label:"مواضع تحتاج نظرة",value:`${analysis.alerts?.length||0}`,tone:(analysis.alerts?.length||0)>3?"warn":"plain"});
    (analysis.factors||[]).filter((f:any)=>f.penalty>0).sort((a:any,b:any)=>b.penalty-a.penalty).slice(0,5)
      .forEach((f:any)=>bars.push({label:f.label,value:f.penalty,
        max:Math.max(...(analysis.factors||[]).map((x:any)=>x.penalty||0),1),caption:`−${f.penalty}`}));
  } else if(/فراغ|فراغات/.test(normalized)){
    title=requestedInstructor?`فراغات ${requestedInstructor.AdInstructorName}`:"تحليل فراغات الأساتذة";
    if(requestedInstructor){
      const profRows=target.filter(r=>r.AdInstructorId===requestedInstructor.AdInstructorId);
      if(dayMatch){
        const items=profRows.filter(r=>Boolean((r as any)[dayMatch.key])).sort((a,b)=>timeToMinutes(a.fstarttime)-timeToMinutes(b.fstarttime));
        const gaps:any[]=[];
        for(let i=1;i<items.length;i++){
          const gap=timeToMinutes(items[i].fstarttime)-timeToMinutes(items[i-1].fendtime);
          if(gap>0)gaps.push({from:items[i-1].fendtime,to:items[i].fstarttime,mins:gap});
        }
        summary=items.length?gaps.length?`في ${dayMatch.label} يظهر لهذا الأستاذ ${countOf(gaps.length, AR.gap)} بإجمالي ${countOf(gaps.reduce((n,g)=>n+g.mins,0), AR.minute)}.`:`في ${dayMatch.label} لا يوجد فراغ بين محاضرات ${requestedInstructor.AdInstructorName} الظاهرة ضمن هذا القسم.`:`لا توجد محاضرات ظاهرة لـ ${requestedInstructor.AdInstructorName} يوم ${dayMatch.label} ضمن هذا القسم.`;
        shape="gaps";
        figures.push(
          {label:"فترات الفراغ",value:`${gaps.length}`,tone:gaps.length?"warn":"good"},
          {label:"إجمالي الفراغ",value:`${gaps.reduce((n,g)=>n+g.mins,0)}`,hint:"دقيقة"},
          {label:"محاضرات اليوم",value:`${items.length}`,tone:"plain"}
        );
        const worst=Math.max(1,...gaps.map((g:any)=>g.mins||0),1);
        gaps.slice(0,6).forEach((g:any)=>bars.push({label:formatScheduleTimeRange(g.from,g.to),value:g.mins,max:worst,caption:`${Math.floor(g.mins/60)}س ${g.mins%60}د`}));
      }else{
        const load=analysis.professorLoads.find((x:any)=>x.id===requestedInstructor.AdInstructorId);
        summary=load?`أكبر فراغ لهذا الأستاذ ${Math.floor(load.maxGap/60)}س ${load.maxGap%60}د، وحمله الأسبوعي ${countOf(load.weeklyHours, AR.hour)}.`:`لا توجد بيانات حمل ظاهرة لهذا الأستاذ في النطاق الحالي.`;
        shape="gaps";
        figures.push(
          {label:"أكبر فراغ",value:`${Math.floor((load?.maxGap||0)/60)}س ${(load?.maxGap||0)%60}د`,tone:(load?.maxGap||0)>=180?"warn":"plain"},
          {label:"الحمل الأسبوعي",value:`${load?.weeklyHours||0}`,hint:"ساعة"},
          {label:"عدد المواعيد",value:`${profRows.length}`,tone:"plain"}
        );
      }
    } else {
      // The lookbehind is what stops the catastrophe, not a digit cap: the old
      // unbounded form (a bare digit class then optional whitespace before the
      // word) backtracked quadratically because every position in a long digit
      // run was a fresh start — measured at seven seconds on sixty thousand
      // digits. `(?<!\d)` anchors the match to a run's first digit, so
      // only one start does the work: linear, two milliseconds on the same
      // input. And because the digit count stays unbounded, a four-or-more-digit
      // threshold like «1000 ساعات» is still read in full rather than silently
      // falling back to the three-hour default. `\s{0,4}` bounds the gap for
      // good measure.
      const threshold=(Number(normalized.match(/(?<!\d)(\d+)\s{0,4}ساع/)?.[1]||3))*60;
      const long=analysis.professorLoads.filter((x:any)=>x.maxGap>=threshold);
      const longest=Math.max(0,...analysis.professorLoads.map((x:any)=>x.maxGap||0));
      summary=long.length?`يوجد ${countOf(long.length, AR.instructor)} بفراغ يومي يساوي أو يتجاوز ${countOf(Math.round(threshold/60), oblique(AR.hour))}.`:"لا يوجد أستاذ يتجاوز حد الفراغ المطلوب في هذا الجدول.";
      shape="gaps";
      figures.push(
        {label:"أساتذة بفراغ طويل",value:`${long.length}`,tone:long.length?"warn":"good"},
        {label:"متوسط الفراغ",value:`${analysis.metrics.avgInstructorGap}`,hint:"دقيقة"},
        {label:"أكبر فراغ",value:`${Math.floor(longest/60)}س ${longest%60}د`,tone:long.length?"warn":"plain"}
      );
      const worst=Math.max(1,...analysis.professorLoads.map((x:any)=>x.maxGap||0));
      [...analysis.professorLoads].sort((a:any,b:any)=>b.maxGap-a.maxGap).slice(0,6)
        .forEach((x:any)=>bars.push({label:x.name,value:x.maxGap,max:worst,caption:`${Math.floor(x.maxGap/60)}س ${x.maxGap%60}د`}));
    }
  } else if(dayMatch && (/مزدحم|ازدحام|زحمة/.test(normalized) || /ليش|لماذا|سبب|تحقيق/.test(normalized))){
    title=`تحقيق ${dayMatch.label}`; const day=analysis.dayLoad.find((x:any)=>x.key===dayMatch.key); const peaks=analysis.heatmap.filter((x:any)=>x.day===dayMatch.key).sort((a:any,b:any)=>b.count-a.count).slice(0,3);
    const history=(await Promise.all(readScopes.map(scope=>Repository.getSchedulesByScope(scope)))).flat().filter(row=>Number(row.AdTermId)!==termId);
    const investigation=investigateCrowding(target,dayMatch.key as any,history);
    summary=`في ${dayMatch.label} يوجد ${countOf(day?.count||0, AR.appointment)}؛ ${investigation.verdict}`;
    peaks.slice(0,2).forEach((x:any)=>bullets.push(`${x.time}: ${countOf(x.count, AR.lecture)} في الوقت نفسه.`));
    bullets.push(`الحركة موزعة على ${countOf(investigation.professors, oblique(AR.instructor))} و${countOf(investigation.rooms, oblique(AR.room))}.`);
    shape="investigation";
    figures.push({label:dayMatch.label,value:`${day?.count||0}`,hint:"موعداً",tone:"plain"},
      {label:"مقابل التاريخ",value:`${investigation.delta>0?"+":""}${investigation.delta}`,tone:investigation.delta>=8?"warn":"good",hint:"نقطة"},
      {label:"أعلى تزامن",value:`${peaks[0]?.count||0}`,tone:(peaks[0]?.count||0)>6?"warn":"plain",hint:"في نصف ساعة"});
    investigation.causes.forEach((x:any)=>bars.push(x));
  } else if(normalized.includes("إذا نقلت")||normalized.includes("اذا نقلت")){
    title="محاكاة نقل موعد"; const code=courses.find(c=>normalized.includes(String(c.CourseCode).toLowerCase())); const row=code?target.find(r=>r.AdCourseId===code.AdCourseId):target[0];
    if(row&&requestedHour!=null){const dur=Math.max(30,timeToMinutes(row.fendtime)-timeToMinutes(row.fstarttime));const candidate={...row,fstarttime:minutesToTime(requestedHour),fendtime:minutesToTime(requestedHour+dur)};const moveOpts=await approvalBlockerOptions();const before=approvalBlockerCount([row],universe,moveOpts),after=approvalBlockerCount([candidate],universe.filter(x=>x.id!==row.id).concat(candidate),moveOpts);summary=`نقل ${code?.CourseCode||row.AdCourseName}${readScopes.length > 1 ? ` · ${sections.find(s=>Number(s.AdSectionId)===Number(row.AdSectionId))?.AdSectionName || ""} (${row.AdCollegeId})` : ""} إلى ${candidate.fstarttime} يغيّر موانع الحفظ المحتملة من ${before} إلى ${after}.`;bullets.push(`الوقت المقترح: ${formatScheduleTimeRange(candidate.fstarttime, candidate.fendtime)}.`,after===0?"الموضع صالح ولا يظهر حجز مزدوج للأستاذ أو القاعة.":"الموضع غير مسموح؛ استخدم اقتراح البديل الآمن.");
      shape="move";
      shift={label:"موانع الحفظ",before,after,better:after<=before};
      figures.push({label:"الوقت المقترح",value:formatScheduleTimeRange(candidate.fstarttime,candidate.fendtime),hint:"",tone:after===0?"good":"bad"});}
    else summary="حدد رمز المقرر والساعة في السؤال، مثال: إذا نقلت 101 إلى الساعة 11، فما الذي سيتأثر؟";
  } else if(normalized.includes("أفضل توزيع")||normalized.includes("افضل توزيع")||normalized.includes("قلل الفراغ")||normalized.includes("تقليل الفراغ")){
    title="اقتراح تحسين التوزيع"; const proposal=autoScheduleProposal(target,universe); const targetIds=new Set(target.map(row=>Number(row.id))); const external=universe.filter(r=>!targetIds.has(Number(r.id))); const after=analyzeSchedule(proposal.rows,[...external,...proposal.rows],courses,instructors,await approvalBlockerOptions()); const safer=after.metrics.criticalConflicts<analysis.metrics.criticalConflicts||(after.metrics.criticalConflicts===analysis.metrics.criticalConflicts&&after.score>=analysis.score);
    summary=safer&&proposal.changed?`يمكن إنشاء سيناريو يغيّر وقت ${countOf(proposal.changed, oblique(AR.appointment))}: موانع الحفظ ${analysis.metrics.criticalConflicts} ← ${after.metrics.criticalConflicts} والجودة ${analysis.score}/100 ← ${after.score}/100، دون تغيير المقرر أو الأستاذ أو أيام اللقاء أو القاعة.`:"حللت التوزيع الحالي ولم أجد نقلاً تلقائياً آمناً أفضل ضمن القيود نفسها؛ الأفضل تجربة «ماذا لو؟» يدوياً أو تحديد قيد إضافي للمساعد.";
    if(dayMatch)bullets.push(`ذكرت ${dayMatch.label}. سأتعامل معه كأولوية تحليل، لكن لن أغيّر نمط أيام المقرر تلقائياً لأن ذلك قد يكون قيداً أكاديمياً.`);
    bullets.push("افتح «المحاكاة» لمراجعة كل تغيير قبل اعتماده.");
    shape="plan";
    if(safer&&proposal.changed){
      shift={label:"جودة الجدول",before:analysis.score,after:after.score,better:after.score>=analysis.score};
      figures.push({label:"مواعيد ستتحرك",value:`${proposal.changed}`,tone:"plain"},
        {label:"موانع الحفظ",value:`${analysis.metrics.criticalConflicts} ← ${after.metrics.criticalConflicts}`,
         tone:after.metrics.criticalConflicts<analysis.metrics.criticalConflicts?"good":"plain"});
    } else figures.push({label:"لا تحسين آمن",value:"—",tone:"plain",hint:"ضمن القيود نفسها"});
  /* «قاعة» alone missed «القاعات», which is how anyone actually asks — and how
     the suggested command on screen is worded. Arabic inflects; a matcher that
     only knows the singular answers the wrong question. */
  } else if(/قاع(ة|ات)/.test(normalized)){
    title="ذكاء القاعات";
    const low=[...analysis.rooms].sort((a:any,b:any)=>a.utilization-b.utilization).slice(0,5);
    const avgUtil=analysis.rooms.length?Math.round(analysis.rooms.reduce((n:any,r:any)=>n+(r.utilization||0),0)/analysis.rooms.length):0;
    summary=`أقل القاعات استخداماً داخل نطاق القسم موضحة في الرسم، مع فحص التوفر الفعلي أيضاً مقابل حجوزات الأقسام الأخرى.`;
    shape="rooms";
    figures.push(
      {label:"قاعات في النطاق",value:`${analysis.rooms.length}`,tone:"plain"},
      {label:"أقلّها استخداماً",value:`${low[0]?.utilization??0}`,hint:"٪",tone:(low[0]?.utilization??0)<25?"warn":"plain"},
      {label:"متوسط الاستخدام",value:`${avgUtil}`,hint:"٪",tone:avgUtil<55?"good":"plain"}
    );
    low.forEach((r:any)=>bars.push({label:`${r.code}/${r.hall}`,value:r.utilization,max:100,caption:`${r.utilization}٪`}));
  } else {
    analysis.alerts.slice(0,5).forEach((a:any)=>bullets.push(`${a.title}: ${a.detail}`));
    summary=`قرأت جدول ${sectionName} فقط ضمن صلاحياتك. ${summary}`;
    figures.push({label:"جودة الجدول",value:`${analysis.score}`,tone:analysis.score>=75?"good":analysis.score>=55?"warn":"bad",hint:"من 100"},
      {label:"موانع الحفظ",value:`${analysis.metrics.criticalConflicts}`,tone:analysis.metrics.criticalConflicts?"bad":"good"},
      {label:"متوسط الفراغ",value:`${analysis.metrics.avgInstructorGap}`,hint:"دقيقة"});
    const busiestDay=Math.max(1,...analysis.dayLoad.map((x:any)=>x.count||0));
    analysis.dayLoad.forEach((x:any)=>bars.push({label:x.label||x.key,value:x.count,max:busiestDay,caption:`${x.count}`}));
  }
  res.json({title,summary,bullets,shape,figures,bars,shift,scope:{collegeId,sectionId,termId,sectionName,rowCount:target.length},
    guardrail:"المساعد يحلل ويقترح فقط. لا يكتب أي تغيير على الجدول الحقيقي."});
});

app.get("/api/intelligence/context/:id", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const id=Number(req.params.id||0); const selected=await Repository.getScheduleById(id); if(!selected){res.status(404).json({error:"الموعد غير موجود"});return;}
  if(!isScopeAllowed(req,selected.AdCollegeId,selected.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [termRows,courses,instructors,comments,terms,courseHistory,versions]=await Promise.all([
    Repository.getSchedulesByScope({termId:selected.AdTermId}),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleComments(id),Repository.getTerms(),Repository.getScheduleHistoryForCourses([selected.AdCourseId]),Repository.getScheduleVersionsWithRows(selected.AdCollegeId,selected.AdSectionId,selected.AdTermId,24)
  ]);
  const visible=req.user.IsAdminUser?termRows:filterByScope(req,termRows); const termVisible=visible;
  const related={
    professor:termVisible.filter(r=>r.AdInstructorId===selected.AdInstructorId).sort((a,b)=>a.fstarttime.localeCompare(b.fstarttime)),
    course:termVisible.filter(r=>r.AdCourseId===selected.AdCourseId),
    room:termVisible.filter(r=>Boolean(roomIdentityKey(selected))&&roomIdentityKey(r)===roomIdentityKey(selected)).sort((a,b)=>a.fstarttime.localeCompare(b.fstarttime))
  };
  const externalConflicts=findConflicts([selected],termRows,{placeholderInstructorIds:placeholderInstructorIds(instructors as any)}).map(c=>({...c,otherId:visible.some(v=>v.id===c.otherId)?c.otherId:0}));
  /* ── ما تقوله عشر سنوات عن هذا الموعد بالذات ─────────────────────────────
   *
   * Three questions, each about a thing already named on this panel — the
   * course, the person, the hall — so nothing new appears on screen unless
   * history actually had something to say about one of them. Silence is the
   * ordinary case and costs nothing. */
  const style=await departmentStyle(selected);
  const day=SCHEDULE_DAY_KEYS.find(key=>Boolean((selected as any)[key]));
  const memory=style.memory?[
    style.memory.aboutCourse(selected.AdCourseId),
    selected.AdInstructorId?style.memory.aboutInstructor(selected.AdInstructorId):null,
    style.memory.aboutRoom(String(selected.AdRoomCode||""),String(selected.AdRoomHall||""),selected.roomId),
    day?style.memory.atSlot(day as any,String(selected.fstarttime||"")):null,
  ].filter(Boolean):[];
  const courseLife=buildCourseLife(selected.AdCourseId,courseHistory,terms,instructors);
  const offeringLife=buildOfferingLife(selected,courseHistory,terms,instructors,versions);
  const decisionCost=buildDecisionCost(selected,termVisible,courseHistory);
  const whyHere=explainWhyHere(selected,courseLife,externalConflicts);
  /* ── لماذا هذه القاعة؟ ورغبة الأستاذ/أثره ─────────────────────────────────
     رقائق محسوبة بدالة صرفة من بياناتٍ موجودة؛ أي إخفاقٍ في القراءة = لا رقائق، ولا يمسّ السياق. */
  let reasons:any[]=[];
  try{
    const instructor=instructors.find(i=>i.AdInstructorId===selected.AdInstructorId)||null;
    const course=courses.find(c=>c.AdCourseId===selected.AdCourseId)||null;
    const [registry,barter,requests,proposals]=await Promise.all([
      readLocationRegistry(),Repository.getHallBarterRequests(selected.AdTermId),
      selected.AdInstructorId?Repository.getInstructorRequests(selected.AdCollegeId,selected.AdSectionId,selected.AdTermId):Promise.resolve([]),
      selected.AdInstructorId?Repository.getStudyProposalsByTerm(selected.AdTermId):Promise.resolve([]),
    ]);
    let room:any=selected.roomId?registry.rooms.find(r=>r.id===selected.roomId):null;
    if(!room&&selected.AdRoomCode&&selected.AdRoomHall){
      const b=resolveBuilding(registry,selected.AdRoomCode,{collegeId:selected.AdCollegeId,sectionId:selected.AdSectionId});
      if(b.status==="CONFIRMED"&&b.value?.id){const r=resolveRoom(registry,selected.AdRoomHall,b.value.id,{collegeId:selected.AdCollegeId,sectionId:selected.AdSectionId});if(r.status==="CONFIRMED")room=r.value||null;}
    }
    const creditOf=(id:number)=>Number(courses.find(c=>c.AdCourseId===id)?.CourseCredit)||0;
    const mineAll=selected.AdInstructorId?termRows.filter(r=>r.AdInstructorId===selected.AdInstructorId):[];
    reasons=buildRowReasons({
      row:selected,room,barter:barter.filter(r=>r.status==="approved"),maxStudent:Number(course?.MaxStudent)||0,
      instructorRows:mineAll,quota:loadCapOf(instructor)||null,
      loadUnits:loadCapOf(instructor)>0?instructorLoadUnits(mineAll,selected.AdInstructorId,creditOf):null,
      history:courseHistory,requests:requests as any,proposals:proposals as any,
    });
  }catch(error:any){console.error("تعذّر حساب رقائق «لماذا؟»:",error?.message||error);}
  res.json({selected,course:courses.find(c=>c.AdCourseId===selected.AdCourseId)||null,instructor:instructors.find(i=>i.AdInstructorId===selected.AdInstructorId)||null,related,conflicts:externalConflicts,comments,
    memory,memoryTerms:style.memory?.terms||0,courseLife,offeringLife,decisionCost,whyHere,reasons});
});

app.get("/api/intelligence/replay/:id", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const id=Number(req.params.id||0),selected=await Repository.getScheduleById(id);if(!selected){res.status(404).json({error:"الموعد غير موجود"});return;}if(!isScopeAllowed(req,selected.AdCollegeId,selected.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [versions,drafts,comments,publication,audits]=await Promise.all([Repository.getScheduleVersionsWithRows(selected.AdCollegeId,selected.AdSectionId,selected.AdTermId,16),Repository.getScheduleDrafts(selected.AdCollegeId,selected.AdSectionId,selected.AdTermId),Repository.getScheduleComments(id),Repository.getSchedulePublication(selected.AdCollegeId,selected.AdSectionId,selected.AdTermId),Repository.getAuditLogs(2000)]);
  const same=(r:any)=>r&&Number(r.AdCourseId)===selected.AdCourseId&&String(r.SCode)===String(selected.SCode);const state=(r:any)=>({time:formatScheduleTimeRange(r.fstarttime, r.fendtime),start:r.fstarttime,end:r.fendtime,room:`${r.AdRoomCode}/${r.AdRoomHall}`,instructorId:r.AdInstructorId,days:activeDays(r)});const stateKey=(r:any)=>r?`${r.AdInstructorId}|${activeDays(r).join(",")}|${r.fstarttime}|${r.fendtime}|${r.AdRoomCode}|${r.AdRoomHall}`:"missing";
  const ordered=[...versions].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));const snapshots:any[]=[];for(const v of ordered){const r=v.rows.find(same);if(!r)continue;const conflicts=findConflicts([r],v.rows).length;const last=snapshots[snapshots.length-1];if(!last||last.key!==stateKey(r))snapshots.push({key:stateKey(r),timestamp:v.createdAt,userName:v.userName,label:v.label,source:v.source,row:r,state:state(r),conflicts})}
  const currentKey=stateKey(selected);if(!snapshots.length||snapshots[snapshots.length-1].key!==currentKey)snapshots.push({key:currentKey,timestamp:new Date().toISOString(),userName:"الوضع الحالي",label:"الوضع الحالي",source:"current",row:selected,state:state(selected),conflicts:findConflicts([selected],await Repository.getSchedulesByScope({termId:selected.AdTermId})).length});
  const events:any[]=[];if(snapshots.length)events.push({timestamp:snapshots[0].timestamp,type:"origin",title:"أقدم أثر متاح للموعد",detail:`${snapshots[0].state.time} · ${snapshots[0].state.room}`,actor:snapshots[0].userName,tone:"neutral"});
  const style=await departmentStyle({AdCollegeId:selected.AdCollegeId,AdSectionId:selected.AdSectionId,AdTermId:selected.AdTermId}).catch(()=>null);
  const people=await Repository.getInstructors().catch(()=>[]);
  const nameOf=(id:number)=>people.find(p=>Number(p.AdInstructorId)===Number(id))?.AdInstructorName||"";
  for(let i=1;i<snapshots.length;i++){const a=snapshots[i-1],b=snapshots[i],changes:string[]=[];if(a.state.time!==b.state.time)changes.push(`الوقت ${a.state.time} ← ${b.state.time}`);if(a.state.room!==b.state.room)changes.push(`القاعة ${a.state.room} ← ${b.state.room}`);if(a.state.instructorId!==b.state.instructorId)changes.push("تغيّر أستاذ المقرر");if(a.state.days.join(",")!==b.state.days.join(","))changes.push("تغيّرت أيام اللقاء");
    /* ── ليش انتقل؟ ───────────────────────────────────────────────────────
       The old placement, put back into the week of the version that moved it
       and swept for clashes. What it hits is what had taken the slot, and the
       row it hits has a name. Nothing is returned when the old placement was
       clean — a move can be a preference nobody wrote down, and this must not
       invent a cause for it. */
    const [oldCode,oldHall]=String(a.state.room||"").split("/");
    const why=changes.length?reasonForMove(
      selected,
      {day:(a.state.days[0]||null) as any,start:a.state.start,end:a.state.end,
       roomCode:oldCode||"",roomHall:oldHall||"",instructorId:Number(a.state.instructorId)||0},
      (ordered.find(v=>v.createdAt===b.timestamp)?.rows)||[],
      nameOf,
      Number(style?.doorway||0),
    ):null;
    if(changes.length)events.push({timestamp:b.timestamp,type:"move",title:"تغيّر قرار الموعد",detail:changes.join(" · "),actor:b.userName,tone:b.conflicts<a.conflicts?"good":b.conflicts>a.conflicts?"warn":"neutral",why:why?.text,whyAgainst:why?.against,whySource:why?"مُستنتَج من نسخة ذلك اليوم":undefined});if(a.conflicts===0&&b.conflicts>0)events.push({timestamp:b.timestamp,type:"conflict",title:"ظهر تعارض في هذه المرحلة",detail:`النسخة تحمل ${countOf(b.conflicts, oblique(AR.conflict))} لهذا الموعد.`,actor:b.userName,tone:"warn"});if(a.conflicts>0&&b.conflicts===0)events.push({timestamp:b.timestamp,type:"resolved",title:"اختفى التعارض الظاهر",detail:"النسخة التالية لم تعد تحمل التعارض السابق لهذا الموعد.",actor:b.userName,tone:"good"})}
  drafts.filter(d=>d.rows.some(same)).slice(0,20).forEach(d=>{const r=d.rows.find(same)!;events.push({timestamp:d.updatedAt,type:"draft",title:d.status==="published"?"مرّ عبر مسودة منشورة":"جُرّب بديل داخل المحاكاة",detail:`${d.name} · ${formatScheduleTimeRange(r.fstarttime, r.fendtime)} · ${r.AdRoomCode}/${r.AdRoomHall}`,actor:d.userName,tone:d.status==="published"?"good":"info"})});
  comments.forEach(c=>events.push({timestamp:c.createdAt,type:"comment",title:c.resolved?"ملاحظة أُغلقت":"ملاحظة قرار",detail:c.text,actor:c.userName,tone:c.resolved?"good":"info"}));if(publication)events.push({timestamp:publication.publishedAt,type:"publish",title:"تم اعتماد جدول هذا النطاق",detail:publication.draftId?`الاعتماد مرتبط بالمسودة ${publication.draftId}`:"اعتماد مباشر",actor:publication.userName,tone:"good"});
  audits.filter(a=>a.path===`/schedules/${id}`||a.path===`/api/schedules/${id}`||a.path.endsWith(`/schedules/${id}`)).slice(0,30).forEach(a=>events.push({timestamp:a.timestamp,type:"audit",title:`${a.action} مباشر على الموعد`,detail:`${a.method} ${a.path}`,actor:a.userName,tone:"neutral"}));events.sort((a,b)=>String(a.timestamp).localeCompare(String(b.timestamp)));
  res.json({schedule:{id:selected.id,courseName:selected.AdCourseName,sectionCode:selected.SCode,current:state(selected)},events,coverage:{versions:versions.length,drafts:drafts.filter(d=>d.rows.some(same)).length,comments:comments.length,note:"سجل القرار يعيد بناء القصة من النسخ الزمنية والمسودات والملاحظات والسجل التشغيلي المتاح منذ تفعيل هذه الطبقات؛ لا يخترع أحداثاً أقدم غير مسجلة."}});
});

app.get("/api/intelligence/room", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const code=String(req.query.code||"").trim(),hall=String(req.query.hall||"").trim(),termId=Number(req.query.termId||0),requestedRoomId=String(req.query.roomId||"").trim();
  if(!termId||(!requestedRoomId&&(!code||!hall))){res.status(400).json({error:"حدد القاعة الرسمية والفصل الدراسي"});return;}
  const [registry,termRows,sections]=await Promise.all([readLocationRegistry(),Repository.getSchedulesByScope({termId}),Repository.getSections()]);
  let targetRoom=registry.rooms.find(room=>room.id===requestedRoomId&&room.active&&room.confidence==="CONFIRMED");
  if(!targetRoom&&code&&hall){
    const building=resolveBuilding(registry,code);
    if(building.status==="CONFIRMED"&&building.value?.id)targetRoom=(() => { const resolved=resolveRoom(registry,hall,building.value!.id); return resolved.status==="CONFIRMED"&&resolved.value?resolved.value:undefined; })();
  }
  if(!targetRoom){res.status(400).json({error:"القاعة غير موجودة أو غير معتمدة في سجل المباني والقاعات"});return;}
  const rows=termRows.filter(row=>{
    if(row.roomId)return row.roomId===targetRoom!.id;
    const building=resolveBuilding(registry,row.AdRoomCode,{collegeId:row.AdCollegeId,sectionId:row.AdSectionId});
    if(building.status!=="CONFIRMED"||!building.value?.id)return false;
    const room=resolveRoom(registry,row.AdRoomHall,building.value!.id,{collegeId:row.AdCollegeId,sectionId:row.AdSectionId});
    return room.status==="CONFIRMED"&&room.value?.id===targetRoom!.id;
  });
  const visible=req.user.IsAdminUser?rows:filterByScope(req,rows); const visibleIds=new Set(visible.map(r=>r.id));
  const occupancy:any[]=[]; const freeWindows:any[]=[];
  for(const day of SCHEDULE_DAYS){const intervals=rows.filter(r=>Boolean((r as any)[day.key])).map(r=>({start:timeToMinutes(r.fstarttime),end:timeToMinutes(r.fendtime)})).sort((a,b)=>a.start-b.start);const merged:any[]=[];for(const item of intervals){const last=merged[merged.length-1];if(last&&item.start<=last.end)last.end=Math.max(last.end,item.end);else merged.push({...item})}let cursor=SCHEDULE_DAY_START;for(const item of merged){if(item.start>cursor)freeWindows.push({day:day.label,start:minutesToTime(cursor),end:minutesToTime(Math.min(item.start,SCHEDULE_DAY_END))});cursor=Math.max(cursor,item.end)}if(cursor<SCHEDULE_DAY_END)freeWindows.push({day:day.label,start:minutesToTime(cursor),end:SCHEDULE_DAY_END_TIME}); for(const row of rows.filter(r=>Boolean((r as any)[day.key])))occupancy.push({day:day.label,start:row.fstarttime,end:row.fendtime,visible:visibleIds.has(row.id),sectionName:visibleIds.has(row.id)||req.user.IsAdminUser?sections.find(s=>s.AdSectionId===row.AdSectionId)?.AdSectionName||"":"حجز من قسم آخر"})}
  const usage=new Map<string,{name:string,count:number}>(); rows.forEach(r=>{const canSee=req.user.IsAdminUser||isScopeAllowed(req,r.AdCollegeId,r.AdSectionId);const name=canSee?(sections.find(s=>s.AdSectionId===r.AdSectionId)?.AdSectionName||"قسم"):`أقسام أخرى`;const key=canSee?String(r.AdSectionId):"external";const cur=usage.get(key)||{name,count:0};cur.count+=activeDays(r).length;usage.set(key,cur)});
  res.json({roomId:targetRoom.id,code:targetRoom.buildingCode,hall:targetRoom.canonicalCode,totalAppointments:rows.length,visibleAppointments:visible.length,occupancy,freeWindows:freeWindows.filter(x=>timeToMinutes(x.end)-timeToMinutes(x.start)>=30),departments:[...usage.values()].sort((a,b)=>b.count-a.count)});
});

app.get("/api/intelligence/professor/:id", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const instructorId=Number(req.params.id||0),termId=Number(req.query.termId||0); if(!instructorId||!termId){res.status(400).json({error:"حدد الأستاذ والفصل الدراسي"});return;} const [termRows,courses,instructors]=await Promise.all([Repository.getSchedulesByScope({termId}),Repository.getCourses(),Repository.getInstructors()]); const rows=termRows.filter(r=>r.AdInstructorId===instructorId); const visible=req.user.IsAdminUser?rows:filterByScope(req,rows); if(!req.user.IsAdminUser&&!visible.length){res.status(403).json({error:"الأستاذ لا يظهر ضمن نطاق القسم المسموح لك"});return;} const analysis=analyzeSchedule(rows,termRows,courses,instructors,await approvalBlockerOptions()); const load=analysis.professorLoads.find((x:any)=>x.id===instructorId)||null; res.json({instructor:instructors.find(i=>i.AdInstructorId===instructorId)||null,load,visibleRows:visible,externalCommitments:Math.max(0,rows.length-visible.length),conflicts:analysis.conflicts.length});
});

app.get("/api/intelligence/comments/:scheduleId", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const scheduleId=Number(req.params.scheduleId||0); const row=await Repository.getScheduleById(scheduleId); if(!row){res.status(404).json({error:"الموعد غير موجود"});return;} if(!isScopeAllowed(req,row.AdCollegeId,row.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} res.json(await Repository.getScheduleComments(scheduleId));
});
app.post("/api/intelligence/comments/:scheduleId", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const scheduleId=Number(req.params.scheduleId||0),text=String(req.body?.text||"").trim(); const row=await Repository.getScheduleById(scheduleId); if(!row){res.status(404).json({error:"الموعد غير موجود"});return;} if(!isScopeAllowed(req,row.AdCollegeId,row.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} if(text.length<2||text.length>600){res.status(400).json({error:"اكتب ملاحظة واضحة لا تتجاوز 600 حرف"});return;} const comment=await Repository.createScheduleComment({SystemUserId:req.user.SystemUserId,userName:req.user.Name,scheduleId,AdCollegeId:row.AdCollegeId,AdSectionId:row.AdSectionId,AdTermId:row.AdTermId,text}); res.status(201).json(comment);
});
app.put("/api/intelligence/comments/:scheduleId/:commentId", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const scheduleId=Number(req.params.scheduleId||0); const row=await Repository.getScheduleById(scheduleId); if(!row){res.status(404).json({error:"الموعد غير موجود"});return;} if(!isScopeAllowed(req,row.AdCollegeId,row.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  /* ── ملاحظة التسجيل لا تُغلق من هنا ─────────────────────────────────────
     ملاحظات التسجيل تمنع الإرسال حتى تُعالج في مسار الاعتماد نفسه. وهذا الباب
     العام للتعليقات كان يغلق أي تعليقٍ بمعرّفه — فيكفي نداءٌ واحد ليختفي
     مانعٌ كتبه التسجيل دون أن يُعالَج. ويُتحقق كذلك أن التعليق لهذا الموعد. */
  const comment=(await Repository.getScheduleComments(scheduleId)).find((item:any)=>String(item?.id)===String(req.params.commentId));
  if(!comment){res.status(404).json({error:"التعليق غير موجود على هذا الموعد"});return;}
  if((comment as any).origin==="registrar"){res.status(403).json({error:"ملاحظة التسجيل تُعالَج من مسار ملاحظات الاعتماد، ولا تُغلق من التعليقات.",code:"registrar-note"});return;}
  await Repository.setScheduleCommentResolved(String(req.params.commentId),Boolean(req.body?.resolved)); res.json({success:true});
});
}
