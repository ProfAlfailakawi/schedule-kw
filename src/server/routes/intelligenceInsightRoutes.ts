/**
 * ── قراءاتُ الذكاء: الحيّ ولماذا والانجرافُ والانتقال ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { Response } from "express";
import { Repository } from "../../db/repository";
import { activeDays, analyzeSchedule, autoScheduleProposal, conflictSolutions, isBlockingConflict, minutesToTime, SCHEDULE_DAYS, timeToMinutes } from "../../utils/scheduleIntelligence";
import { buildWarRoom, evaluateScheduleConstraints } from "../../utils/scheduleInnovation";
import { describeRollover, readTermRollover } from "../../utils/termRollover";
import { buildConflictTopology, buildDecisionMemoryInsight, buildFairnessEngine, buildFragilityMap, buildOneMinuteBrief, buildRoomResilience, buildScheduleHealth2, buildSchedulePulse, createEmergencyPlans, explainScheduleDecision } from "../../utils/livingSchedule";
import type { FSchedule } from "../../types";
import { DAY_LABELS, parseNaturalQuery } from "../../utils/naturalQuery";
import { scopeBase } from "../../utils/scopeFingerprint";
import { blockingConflicts } from "../../utils/scheduleBlockers";
import { AR, countOf, oblique } from "../../utils/arabicCount";
import { readSettledDrift, settledTerm } from "../../utils/settledDrift";
import { describeRhythm } from "../../utils/departmentRhythm";
import { withVisitingSuffix } from "../../utils/visitingText";
import { buildHistoricalTimeModel } from "../../utils/advancedIntelligence";
import { formatScheduleTimeRange, normalizeClock, SCHEDULE_SLOT_MINUTES } from "../../utils/scheduleTime";
import { roomIdentityKey } from "../../utils/locationRegistry";
import { deterministicSchedulingCalls, GEMINI_SCHEDULE_FUNCTION_NAMES, sanitizeGeminiScheduleCalls, scheduleDelta, type GeminiScheduleCall } from "../../utils/geminiScheduleLayer";
import { noteScheduleMutation, scheduleLockRefusal, wholesaleRefusal } from "../core/approvals";
import { type AuthenticatedRequest, isPowerUser, requirePermission, requirePowerAdmin } from "../core/auth";
import { requestGeminiScheduleLayer } from "../core/gemini";
import { dataContextCacheKey, readLocationRegistry } from "../core/locations";
import { sortTermsNewestServer } from "../core/ordering";
import { departmentStyle, driftCache, driftSerial, historicalTimeCache } from "../core/rhythm";
import { scheduleConflicts } from "../core/scheduleConflicts";
import { splitArchivedCourseRows } from "../core/scheduleReads";
import { SCHEDULE_DAY_KEYS, scheduleOverlap, schedulePayloadIssues } from "../core/scheduleRules";
import { filterByScope, intelligenceReadScopes, isScopeAllowed, scopedScheduleUniverse } from "../core/scope";
import { approvalBlockerOptions, mapSmartIssuesToRows, resolveSmartContext, safeDraftRows, smartContextFrom, validateSmartRows } from "../core/smartImport";
import { captureScopeVersion, confirmTokens, hydrateVersionRows, livingResponseCache, recordVersionAfter, replacementAction, scopeOverwriteRefusal } from "../core/versions";
import { readVisitingStatus, visitingChecker } from "../core/visiting";

/**
 * ── نَفَس بين تحليل وتحليل ──────────────────────────────────────────────────
 *
 * The readings below are pure CPU over the whole term of the university, and
 * Node runs them on the one thread it has. Measured on production: while a
 * single `/api/intelligence/living` computed, `/api/health` — which reads
 * nothing at all — took 6387ms to answer, against 194ms on the same server a
 * moment earlier. The server was not slow. It was unable to speak.
 *
 * That is not one reader waiting for their own analysis; it is every other
 * person using the system frozen for as long as it runs.
 *
 * Yielding between the readings hands the loop back so queued requests are
 * served in the gaps. It makes nothing faster — the same work is done in the
 * same order and the answers are identical — but the freeze becomes the length
 * of the longest single reading instead of the sum of all of them, and a health
 * check, a presence ping or somebody else's schedule can land in between.
 */
const breathe = () => new Promise<void>(resolve => setImmediate(resolve));

async function previewNaturalLanguageMove(req: AuthenticatedRequest, q: string, context: { collegeId: number; sectionId: number; termId: number }, hint?: any) {
  const parsed=parseNaturalQuery(q);
  const code=String(hint?.code || parsed.code || "").trim();
  if(!code)return{ok:false,hint:"حدد رمز المقرر المراد تحريكه."};
  const [scheduleData,courses,instructors,constraints]=await Promise.all([
    scopedScheduleUniverse(context.collegeId,context.sectionId,context.termId),
    Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleConstraints(context.collegeId,context.sectionId,context.termId),
  ]);
  const rows=scheduleData.rows;
  const courseById=new Map(courses.map(c=>[c.AdCourseId,c]));
  const dayLabelsOf=(r:any)=>SCHEDULE_DAY_KEYS.map((k,i)=>r[k]?DAY_LABELS[i]:null).filter(Boolean).join("، ")||"—";
  const matches=rows.filter(r=>String(courseById.get(r.AdCourseId)?.CourseCode||"").trim()===code);
  if(!matches.length)return{ok:false,hint:`لم أجد مقرراً برمز ${code} في هذا القسم والفصل.`};
  let target=matches[0];
  const requestedDay=Number.isFinite(Number(hint?.dayIndex))?Number(hint.dayIndex):parsed.day;
  if(matches.length>1){
    const byDay=requestedDay!==null&&requestedDay>=0?matches.filter(r=>Boolean((r as any)[SCHEDULE_DAY_KEYS[requestedDay]])):matches;
    if(byDay.length===1)target=byDay[0];
    else return{ok:false,ambiguous:true,hint:`للمقرر ${code} أكثر من موعد — حدّد الشعبة أو اليوم.`,options:matches.slice(0,6).map(r=>({id:r.id,section:r.SCode,days:dayLabelsOf(r),start:r.fstarttime,end:r.fendtime}))};
  }
  const dur=Math.max(30,timeToMinutes(target.fendtime)-timeToMinutes(target.fstarttime));
  const newStart=normalizeClock(String(hint?.time || parsed.time || target.fstarttime));
  const newEnd=(hint?.time||parsed.time)?minutesToTime(timeToMinutes(newStart)+dur):target.fendtime;
  const fields:any={fstarttime:newStart,fendtime:newEnd};
  SCHEDULE_DAY_KEYS.forEach((k,i)=>{fields[k]=requestedDay!==null&&requestedDay>=0?i===requestedDay:Boolean((target as any)[k]);});
  const after={...target,...fields};
  const issues=await schedulePayloadIssues(after);
  if(issues.length)return{ok:false,hint:issues[0]};
  const conflicts=await scheduleConflicts(req,{...after,AdTermId:context.termId},target.id);
  const blocking=conflicts.filter(isBlockingConflict);
  const external=scheduleData.universe.filter(row=>!(row.AdCollegeId===context.collegeId&&row.AdSectionId===context.sectionId));
  const beforeAnalysis=analyzeSchedule(rows,scheduleData.universe,courses,instructors,await approvalBlockerOptions());
  const scenario=rows.map(row=>Number(row.id)===Number(target.id)?after:row);
  const afterAnalysis=analyzeSchedule(scenario,[...external,...scenario],courses,instructors,await approvalBlockerOptions());
  return{
    ok:true,kind:"move-preview",commitRequired:true,
    move:{id:target.id,fields,rev:target.rev},
    preview:{
      course:courseById.get(target.AdCourseId)?.CourseName||target.AdCourseName||"",
      code,section:target.SCode||"",
      instructor:withVisitingSuffix(instructors.find(i=>i.AdInstructorId===target.AdInstructorId)?.AdInstructorName||"",(await visitingChecker(context.termId,[{collegeId:context.collegeId,sectionId:context.sectionId}]))(target.AdInstructorId,context.collegeId,context.sectionId)&&Boolean(instructors.find(i=>i.AdInstructorId===target.AdInstructorId))),
      room:`${target.AdRoomCode||""}/${target.AdRoomHall||""}`.replace(/^\/$/,"—"),
      changedFields:scheduleDelta(target,after),
      before:{days:dayLabelsOf(target),start:target.fstarttime,end:target.fendtime,score:beforeAnalysis.score,regulations:evaluateScheduleConstraints(rows,constraints)},
      after:{days:dayLabelsOf(after),start:newStart,end:newEnd,score:afterAnalysis.score,regulations:evaluateScheduleConstraints(scenario,constraints)},
    },
    reasons:[
      "Gemini/النص الطبيعي يحدد النية فقط.",
      "المحاكاة والصراعات واللوائح حُسبت بمحركات SCHEDULE deterministic.",
      blocking.length?"يوجد مانع حفظ قبل التأكيد.":"لا يوجد مانع hard في المعاينة، والتنفيذ يحتاج تأكيدًا منفصلًا.",
    ],
    conflicts,canApply:blocking.length===0,blockedReason:blocking.length?blocking[0].message:"",
  };
}

async function executeGeminiScheduleCalls(req: AuthenticatedRequest, calls: GeminiScheduleCall[], q: string, context: { collegeId: number; sectionId: number; termId: number }) {
  const [scheduleData,courses,instructors,constraints,registry]=await Promise.all([
    scopedScheduleUniverse(context.collegeId,context.sectionId,context.termId),
    Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleConstraints(context.collegeId,context.sectionId,context.termId),
    readLocationRegistry(),
  ]);
  const rows=scheduleData.rows;
  const results:any[]=[];
  for(const call of calls){
    if(call.name==="simulate_schedule"){
      const move=await previewNaturalLanguageMove(req,q,context,call.args);
      results.push({call,result:move});
    }else if(call.name==="check_conflicts"){
      const analysis=analyzeSchedule(rows,scheduleData.universe,courses,instructors,await approvalBlockerOptions());
      results.push({call,result:{criticalConflicts:analysis.metrics?.criticalConflicts||0,alerts:(analysis.alerts||[]).slice(0,6)}});
    }else if(call.name==="find_rooms"){
      const termRows=scheduleData.universe;
      const dayIndex=Number(call.args.dayIndex);
      const time=normalizeClock(String(call.args.time||""));
      const rooms=registry.rooms.filter(room=>room.active&&room.confidence==="CONFIRMED"&&room.sectionIds.includes(context.sectionId)).slice(0,80);
      const buildings=new Map(registry.buildings.map(item=>[item.id,item]));
      const available=rooms.map(room=>({room,building:buildings.get(room.buildingId)})).filter(item=>item.building).filter(item=>{
        if(!Number.isFinite(dayIndex)||dayIndex<0||dayIndex>4||!time)return true;
        const end=minutesToTime(timeToMinutes(time)+SCHEDULE_SLOT_MINUTES);
        return !termRows.some(row=>String(row.roomId||"")===item.room.id&&Boolean((row as any)[SCHEDULE_DAY_KEYS[dayIndex]])&&scheduleOverlap(row.fstarttime,row.fendtime,time,end));
      }).slice(0,12).map(item=>({building:item.building!.officialCode,hall:item.room.canonicalCode,roomId:item.room.id,buildingId:item.building!.id}));
      results.push({call,result:{available,count:available.length}});
    }else if(call.name==="check_instructors"){
      const needle=String(call.args.name||"").trim().toLowerCase();
      const people=(needle?instructors.filter(i=>String(i.AdInstructorName||"").toLowerCase().includes(needle)):instructors).slice(0,12).map(person=>({
        id:person.AdInstructorId,name:person.AdInstructorName,
        load:rows.filter(row=>Number(row.AdInstructorId)===Number(person.AdInstructorId)).length,
      }));
      results.push({call,result:{instructors:people}});
    }else if(call.name==="check_regulations"){
      results.push({call,result:evaluateScheduleConstraints(rows,constraints)});
    }
  }
  return results;
}

/* ما تغيّر منذ آخر نقطة أمان — القراءة نفسها للملخص وللطبقة الحية. */
async function briefChangedSince(collegeId: number, sectionId: number, termId: number, rows: any[]): Promise<number | undefined> {
  const [latest] = await hydrateVersionRows(await Repository.getScheduleVersions(collegeId, sectionId, termId, 1));
  if (!latest) return undefined;
  const before = new Map((latest.rows || []).map((r: any) => [r.id, rowSignatureServer(r)]));
  return rows.filter(r => before.get(r.id) !== rowSignatureServer(r)).length
    + (latest.rows || []).filter((r: any) => !rows.some(x => x.id === r.id)).length;
}

function rowSignatureServer(row:any){return `${row.AdCourseId||0}:${row.SCode||""}:${row.AdInstructorId||0}:${activeDays(row).join(",")}:${row.fstarttime||""}:${row.fendtime||""}:${row.AdRoomCode||""}|${row.AdRoomHall||""}`}
const LIVING_RESPONSE_TTL_MS = 120_000;

export function registerIntelligenceInsightRoutes(app: Express): void {

/**
 * Natural-language MOVE (Idea 3). Parses "انقل 101 إلى 11:00" / "حرّك 344 إلى
 * الأربعاء", finds the lecture in the open scope and returns a PREVIEW only —
 * before/after plus any conflicts. Applying is a second, explicit step through
 * /api/schedules/move-batch, so a sentence never writes on the schedule by itself.
 */
app.post("/api/intelligence/nl-move", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const parsed=parseNaturalQuery(String(req.body?.q||""));
  if(parsed.intent!=="move"||!parsed.code){res.json({ok:false,hint:"اكتب أمر نقل، مثل: انقل 101 إلى 11:00 · أو: حرّك 344 إلى الأربعاء"});return;}
  const [scheduleData,courses,instructors]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors()]);
  const rows=scheduleData.rows;
  const courseById=new Map(courses.map(c=>[c.AdCourseId,c]));
  const dayLabelsOf=(r:any)=>SCHEDULE_DAY_KEYS.map((k,i)=>r[k]?DAY_LABELS[i]:null).filter(Boolean).join("، ")||"—";
  const matches=rows.filter(r=>String(courseById.get(r.AdCourseId)?.CourseCode||"").trim()===parsed.code);
  if(!matches.length){res.json({ok:false,hint:`لم أجد مقرراً برمز ${parsed.code} في هذا القسم والفصل.`});return;}
  let target=matches[0];
  if(matches.length>1){
    const byDay=parsed.day!==null?matches.filter(r=>Boolean((r as any)[SCHEDULE_DAY_KEYS[parsed.day!]])):matches;
    if(byDay.length===1)target=byDay[0];
    else{res.json({ok:false,ambiguous:true,hint:`للمقرر ${parsed.code} أكثر من موعد — حدّد الشعبة أو اليوم.`,options:matches.slice(0,6).map(r=>({id:r.id,section:r.SCode,days:dayLabelsOf(r),start:r.fstarttime,end:r.fendtime}))});return;}
  }
  const dur=Math.max(30,timeToMinutes(target.fendtime)-timeToMinutes(target.fstarttime));
  const newStart=parsed.time||target.fstarttime;
  const newEnd=parsed.time?minutesToTime(timeToMinutes(newStart)+dur):target.fendtime;
  const fields:any={fstarttime:newStart,fendtime:newEnd};
  SCHEDULE_DAY_KEYS.forEach((k,i)=>{fields[k]=parsed.day!==null?i===parsed.day:Boolean((target as any)[k]);});
  const after={...target,...fields};
  const issues=await schedulePayloadIssues(after);
  if(issues.length){res.json({ok:false,hint:issues[0]});return;}
  const conflicts=await scheduleConflicts(req,{...after,AdTermId:termId},target.id);
  const blocking=conflicts.filter(isBlockingConflict);
  res.json({
    ok:true,
    move:{id:target.id,fields},
    preview:{
      course:courseById.get(target.AdCourseId)?.CourseName||target.AdCourseName||"",
      code:parsed.code,section:target.SCode||"",
      instructor:withVisitingSuffix(instructors.find(i=>i.AdInstructorId===target.AdInstructorId)?.AdInstructorName||"",(await visitingChecker(termId,[{collegeId,sectionId}]))(target.AdInstructorId,collegeId,sectionId)&&Boolean(instructors.find(i=>i.AdInstructorId===target.AdInstructorId))),
      room:`${target.AdRoomCode||""}/${target.AdRoomHall||""}`.replace(/^\/$/,"—"),
      before:{days:dayLabelsOf(target),start:target.fstarttime,end:target.fendtime},
      after:{days:dayLabelsOf(after),start:newStart,end:newEnd},
    },
    conflicts,
    canApply:blocking.length===0,
    blockedReason:blocking.length?blocking[0].message:"",
  });
});

app.post("/api/intelligence/nl-schedule", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const q=String(req.body?.q||req.body?.prompt||"").trim().slice(0,800);
  if(q.length<2){res.status(400).json({error:"اكتب طلب الجدولة أولاً"});return;}
  const gemini=await requestGeminiScheduleLayer([
    {text:JSON.stringify({
      task:"Convert this Arabic/Kuwaiti scheduling request into safe function calls only. Do not execute and do not request a write.",
      query:q,scope:{collegeId,sectionId,termId},allowedFunctions:GEMINI_SCHEDULE_FUNCTION_NAMES,
    })},
  ],{tools:true});
  const calls=sanitizeGeminiScheduleCalls((gemini as any)?.calls || (gemini as any)?.json || []);
  const planned=calls.length?calls:deterministicSchedulingCalls(q);
  if(!planned.length){res.json({ok:false,hint:"فهمت النص كشرح عام، لكن لم أستطع تحويله إلى فحص جدولة قابل للمحاكاة. اذكر المقرر/اليوم/الوقت أو القاعة."});return;}
  const results=await executeGeminiScheduleCalls(req,planned,q,{collegeId,sectionId,termId});
  const move=results.find(item=>item.result?.kind==="move-preview")?.result;
  res.json({
    ok:true,source:calls.length?"gemini-function-calls":"deterministic-parser",
    calls:planned,results,
    preview:move?.preview||null,
    move:move?.move||null,
    canApply:Boolean(move?.canApply),
    commitRequired:true,
    guardrail:"معاينة فقط: لا يكتب هذا المسار أي تعديل. التنفيذ يبقى عبر /api/schedules/move-batch بعد تأكيد المستخدم.",
    reasons:move?.reasons||["تم تحويل الطلب إلى Function Calls آمنة ثم تنفيذها ضد محركات SCHEDULE deterministic."],
  });
});

app.get("/api/intelligence/living", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const { collegeId, sectionId, termId, section } = await resolveSmartContext(req, { homeTerm: req.query.home === "1" });
  if (!collegeId || !sectionId || !termId || !section) { res.status(400).json({ error: "لا يوجد قسم أو فصل دراسي متاح للتحليل" }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const readScopes = await intelligenceReadScopes(req, collegeId, sectionId);
  const departmentRead = req.query.analysisScope === "department";
  const livingKey = dataContextCacheKey(`${collegeId}:${sectionId}:${termId}:${departmentRead ? "department" : "college"}:${readScopes.map(s => `${s.collegeId}/${s.sectionId}`).join(",")}`);
  const isDemoLiving = Boolean(Repository.currentDemoSessionId());
  if (!isDemoLiving) {
    const held = livingResponseCache.get(livingKey);
    if (held && Date.now() - held.at < LIVING_RESPONSE_TTL_MS) {
      res.type("application/json").send(held.body);
      return;
    }
  }
  const [scheduleData, courses, instructors, terms, constraints] = await Promise.all([
    scopedScheduleUniverse(collegeId,sectionId,termId), Repository.getCourses(), Repository.getInstructors(), Repository.getTerms(), Promise.all(readScopes.map(scope => Repository.getScheduleConstraints(scope.collegeId, scope.sectionId, termId))).then(groups => groups.flat())
  ]);
  const {universe}=scheduleData;
  const rows = departmentRead ? universe.filter(row => readScopes.some(scope => Number(row.AdCollegeId) === scope.collegeId && Number(row.AdSectionId) === scope.sectionId)) : scheduleData.rows;
  /* «حالة الجدول — N مانع اعتماد» is the ApprovalBar's number: the same
     placeholder exemption and the same hall identity (approvalBlockerOptions),
     one options object so every memoised reading below shares it. */
  const blockerOptions = await approvalBlockerOptions();
  const pulse = buildSchedulePulse(rows, universe, courses, instructors, blockerOptions); await breathe();
  const health = buildScheduleHealth2(rows, universe, courses, instructors, blockerOptions); await breathe();
  const fairness = buildFairnessEngine(rows, instructors); await breathe();
  const fragility = buildFragilityMap(rows, universe, courses, instructors, blockerOptions); await breathe();
  const roomIntelligence = buildRoomResilience(rows, universe); await breathe();
  const topology = buildConflictTopology(rows, universe, courses, instructors, blockerOptions); await breathe();
  /* Cheap by comparison: every reading it needs is memoised above and answers
     from cache, so it is left to run without a further pause. */
  /* The one-minute brief was also served alone at /api/intelligence/brief,
     which no screen ever called — so the living layer's «ملخص الدقيقة» never
     said what changed. It now carries the same «since the last safety point»
     reading, from the same helper. */
  const changedCounts = await Promise.all(readScopes.map(scope => {
    const own = rows.filter(row => Number(row.AdCollegeId) === scope.collegeId && Number(row.AdSectionId) === scope.sectionId);
    return briefChangedSince(scope.collegeId, scope.sectionId, termId, own);
  }));
  const changedSince = changedCounts.every(count => count !== undefined)
    ? changedCounts.reduce((total, count) => total + count, 0) : undefined;
  const brief = buildOneMinuteBrief(rows, universe, courses, instructors, changedSince, blockerOptions);
  const memories = (await Promise.all(readScopes.map(scope => Repository.getScheduleDecisionMemories(scope.collegeId, scope.sectionId, 120)))).flat();
  const livingPayload = {
    analysisRows: departmentRead ? rows : undefined,
    context:{analysisScope:departmentRead ? "department" : "college",scopeCount:readScopes.length,collegeId,sectionId,termId,sectionName:section.AdSectionName,termName:terms.find(t=>t.AdTermId===termId)?.AdTermName||""},
    pulse,health,fairness,fragility,roomIntelligence,
    topology,brief,
    memory:buildDecisionMemoryInsight(memories),
    constraints:{count:constraints.filter(c=>c.enabled).length},
    /* A flag says what a screen can actually reach. The emergency planner has
       an endpoint but no screen yet, so it is not advertised as available. */
    capabilities:{powerAdmin:true,emergency:false,genesis:true,decisionMemory:true,meetingIntelligence:true,brief:true}
  };
  if (!isDemoLiving) livingResponseCache.set(livingKey, { at: Date.now(), body: JSON.stringify(livingPayload) });
  res.json(livingPayload);
});

app.post("/api/intelligence/why", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const rowId=Number(req.body?.rowId||req.body?.id||0); const selected=await Repository.getScheduleById(rowId);
  if(!selected){res.status(404).json({error:"الموعد غير موجود"});return;} if(!isScopeAllowed(req,selected.AdCollegeId,selected.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const raw={...selected,...(req.body?.candidate||{})};
  const [scheduleData,courses,instructors,constraints]=await Promise.all([scopedScheduleUniverse(selected.AdCollegeId,selected.AdSectionId,selected.AdTermId),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleConstraints(selected.AdCollegeId,selected.AdSectionId,selected.AdTermId)]);
  const candidate=safeDraftRows([raw],selected.AdCollegeId,selected.AdSectionId,selected.AdTermId)[0] as any; candidate.id=selected.id;
  const issues=await validateSmartRows([candidate],selected.AdCollegeId,selected.AdSectionId); if(issues.length){res.status(400).json({error:issues[0],issues});return;}
  const {rows:scope,universe}=scheduleData;
  const explanation=explainScheduleDecision(scope,universe,candidate,courses,instructors,constraints);
  const memories=isPowerUser(req)?await Repository.getScheduleDecisionMemories(selected.AdCollegeId,selected.AdSectionId,120):[];
  res.json({...explanation,memory:isPowerUser(req)?buildDecisionMemoryInsight(memories,selected.AdCourseId):undefined,guardrail:"هذه قراءة تفسيرية فقط؛ لا يتم حفظ أي تعديل من شاشة «لماذا؟»."});
});

app.post("/api/intelligence/why-not", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const rowId=Number(req.body?.rowId||req.body?.id||0); const selected=await Repository.getScheduleById(rowId);
  if(!selected){res.status(404).json({error:"الموعد غير موجود"});return;} if(!isScopeAllowed(req,selected.AdCollegeId,selected.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const raw={...selected,...(req.body?.candidate||{})};
  const [scheduleData,courses,instructors,constraints]=await Promise.all([scopedScheduleUniverse(selected.AdCollegeId,selected.AdSectionId,selected.AdTermId),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleConstraints(selected.AdCollegeId,selected.AdSectionId,selected.AdTermId)]);
  const candidate=safeDraftRows([raw],selected.AdCollegeId,selected.AdSectionId,selected.AdTermId)[0] as any; candidate.id=selected.id;
  const issues=await validateSmartRows([candidate],selected.AdCollegeId,selected.AdSectionId); if(issues.length){res.status(400).json({error:issues[0],issues});return;}
  const {rows:scope,universe}=scheduleData;
  const explanation=explainScheduleDecision(scope,universe,candidate,courses,instructors,constraints);
  const answer=explanation.warnings.length?`ممكن، لكن ${explanation.warnings[0]}`:explanation.tradeoffs.length?`ممكن، لكن ${explanation.tradeoffs[0]}`:explanation.delta.score>0?"ممكن، وهذا البديل أفضل وفق المؤشرات الحالية.":"ممكن، لكن لا يظهر مكسب واضح مقارنة بالوضع الحالي.";
  const memories=isPowerUser(req)?await Repository.getScheduleDecisionMemories(selected.AdCollegeId,selected.AdSectionId,120):[];
  res.json({...explanation,question:String(req.body?.question||"لماذا ليس هذا الحل؟").slice(0,240),answer,memory:isPowerUser(req)?buildDecisionMemoryInsight(memories,selected.AdCourseId):undefined,guardrail:"«لماذا لا؟» يفسر أثر الخيار ولا يطبقه."});
});

app.get("/api/intelligence/decision-memory", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId}=smartContextFrom(req); if(!collegeId||!sectionId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const courseId=Number(req.query.courseId||0); const memories=await Repository.getScheduleDecisionMemories(collegeId,sectionId,250);
  res.json(buildDecisionMemoryInsight(memories,courseId||undefined));
});

app.post("/api/intelligence/decision-memory", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); const reason=String(req.body?.reason||"").trim(); if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} if(reason.length<3||reason.length>700){res.status(400).json({error:"اكتب سبباً واضحاً بين 3 و700 حرف"});return;}
  const scheduleId=Number(req.body?.scheduleId||0); let row=scheduleId?await Repository.getScheduleById(scheduleId):undefined; if(row&&(row.AdCollegeId!==collegeId||row.AdSectionId!==sectionId)){res.status(403).json({error:"الموعد خارج نطاق هذا القسم"});return;}
  const kind=["rejected-option","accepted-note","meeting-decision"].includes(String(req.body?.kind))?String(req.body.kind) as any:"rejected-option";
  const memory=await Repository.createScheduleDecisionMemory({SystemUserId:req.user.SystemUserId,userName:req.user.Name,AdCollegeId:collegeId,AdSectionId:sectionId,AdTermId:termId,AdCourseId:Number(req.body?.AdCourseId||row?.AdCourseId||0)||undefined,SCode:String(req.body?.SCode||row?.SCode||"")||undefined,scheduleId:scheduleId||undefined,optionSignature:String(req.body?.optionSignature||"").slice(0,500)||undefined,kind,reason});
  res.status(201).json(memory);
});

app.post("/api/intelligence/context-copilot", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); const contextType=String(req.body?.contextType||"schedule"),action=String(req.body?.action||"improve"); if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [scheduleData,courses,instructors,constraints]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleConstraints(collegeId,sectionId,termId)]); const {rows,universe}=scheduleData; if(!rows.length){res.status(400).json({error:"لا يوجد جدول في هذا النطاق"});return;}
  if(contextType==="schedule"){
    const row=rows.find(r=>r.id===Number(req.body?.rowId||req.body?.contextId||0)); if(!row){res.status(404).json({error:"الموعد غير موجود في هذا القسم"});return;} const solutions=conflictSolutions(row,universe,5); const options=solutions.slice(0,3).map(sol=>{const candidate={...row,fstarttime:sol.start,fendtime:sol.end,buildingId:sol.buildingId,roomId:sol.roomId,AdRoomCode:sol.roomCode,AdRoomHall:sol.roomHall,locationStatus:"VERIFIED" as const};const why=explainScheduleDecision(rows,universe,candidate,courses,instructors,constraints);return{rank:sol.rank,title:sol.conflicts?`بديل غير قابل للحفظ (${countOf(sol.conflicts, AR.blocker)})`:"بديل صالح",candidate,verdict:why.verdict,delta:why.delta,positives:why.positives.slice(0,3),tradeoffs:why.tradeoffs.slice(0,2)}}); const best=options[0]; res.json({title:`مساعد القرار · ${row.AdCourseName} / شعبة ${row.SCode}`,summary:best?`أقوى تحسين حالي: ${best.verdict}. الجودة ${best.delta.score>=0?"+":""}${best.delta.score}، وموانع الحفظ ${best.delta.conflicts>=0?"+":""}${best.delta.conflicts}.`:"لا يظهر بديل آمن أفضل من الموعد الحالي.",context:{type:"schedule",rowId:row.id},options,guardrail:"الاقتراحات لا تحفظ شيئاً؛ افتح البديل في نموذج التعديل إذا قررت استخدامه."}); return;
  }
  if(contextType==="room"){
    const key=String(req.body?.value||req.body?.contextId||""); const intel=buildRoomResilience(rows,universe); const room=intel.rooms.find(r=>r.key===key)||intel.rooms[0]; if(!room){res.status(404).json({error:"لا توجد بيانات قاعات"});return;} res.json({title:`مساعد القرار · القاعة ${room.code}/${room.hall}`,summary:room.singlePoint?`هذه القاعة نقطة اعتماد حساسة: ${countOf(room.sessions, AR.appointment)} و${room.recoverabilityPct}% فقط قابلة للنقل إلى قاعات بديلة بنفس الوقت.`:`اعتماد القسم على هذه القاعة تحت السيطرة؛ نسبة الاسترداد التقديرية ${room.recoverabilityPct}%.`,context:{type:"room",key:room.key},options:intel.rooms.filter(r=>r.key!==room.key&&r.risk<room.risk).slice(0,3).map(r=>({title:`${r.code}/${r.hall}`,detail:`مخاطرة ${r.risk}/100 · استخدام ${countOf(r.sessions, oblique(AR.appointment))}`})),guardrail:"هذه قراءة تشغيلية؛ التوفر النهائي يُفحص عند نقل كل موعد."});return;
  }
  if(contextType==="instructor"){
    const id=Number(req.body?.value||req.body?.contextId||0); const fairness=buildFairnessEngine(rows,instructors); const prof=fairness.profiles.find(p=>p.id===id)||fairness.profiles[0]; if(!prof){res.status(404).json({error:"لا توجد بيانات أستاذ"});return;} const own=rows.filter(r=>r.AdInstructorId===prof.id); const suggestions=own.map(row=>{const best=conflictSolutions(row,universe,2)[0];return best?{rowId:row.id,course:row.AdCourseName,current:formatScheduleTimeRange(row.fstarttime, row.fendtime),candidate:formatScheduleTimeRange(best.start, best.end),room:`${best.roomCode}/${best.roomHall}`,conflicts:best.conflicts}:null}).filter(Boolean).slice(0,4); res.json({title:`مساعد القرار · ${prof.name}`,summary:`حمله ${countOf(prof.weeklyHours, AR.hour)} على ${countOf(prof.days, oblique(AR.day))}، وإجمالي الفراغ ${countOf(prof.gapMinutes, AR.minute)}. ${prof.deltaFromAverage>0?`أعلى من متوسط القسم بـ${countOf(Math.round(prof.deltaFromAverage), oblique(AR.point))}.`:"ضمن متوسط القسم تقريباً."}`,context:{type:"instructor",id:prof.id},options:suggestions,guardrail:"ضغط أيام الأستاذ يحتاج مراجعة أكاديمية؛ الاقتراحات لا تطبق تلقائياً."});return;
  }
  if(contextType==="day"){
    const day=String(req.body?.value||req.body?.contextId||""); if(!SCHEDULE_DAYS.some(d=>d.key===day)){res.status(400).json({error:"اليوم غير صالح"});return;} const plans=createEmergencyPlans("day",day,rows,universe,courses,instructors,constraints).plans; const best=[...plans].sort((a,b)=>b.score-a.score||a.changed-b.changed)[0]; const count=rows.filter(r=>Boolean((r as any)[day])).length; res.json({title:`مساعد القرار · ${SCHEDULE_DAYS.find(d=>d.key===day)?.label}`,summary:`اليوم يحمل ${countOf(count, oblique(AR.appointment))}. أفضل سيناريو تخفيف يغيّر ${countOf(best?.changed||0, oblique(AR.appointment))} مع جودة ${best?.score||0}/100.`,context:{type:"day",day},options:best?best.rows.filter(r=>{const base=rows.find(x=>x.id===r.id);return base&&rowSignatureServer(base)!==rowSignatureServer(r)}).slice(0,5).map(r=>({rowId:r.id,course:r.AdCourseName,time:formatScheduleTimeRange(r.fstarttime, r.fendtime),days:activeDays(r).map(k=>SCHEDULE_DAYS.find(d=>d.key===k)?.label).join("، ")})):[],guardrail:"تخفيف اليوم معروض كسيناريو فقط ولا يغيّر الجدول الحقيقي."});return;
  }
  res.status(400).json({error:"سياق مساعد القرار غير معروف"});
});

app.post("/api/intelligence/emergency", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); const kind=String(req.body?.kind||"") as "room"|"day"|"instructor"; if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} if(!["room","day","instructor"].includes(kind)){res.status(400).json({error:"نوع الحالة الطارئة غير صالح"});return;}
  const value=kind==="instructor"?Number(req.body?.value||0):String(req.body?.value||""); if((kind==="instructor"&&!value)||(kind!=="instructor"&&!value)){res.status(400).json({error:"حدد العنصر المتأثر بالطوارئ"});return;}
  const [scheduleData,courses,instructors,constraints]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleConstraints(collegeId,sectionId,termId)]); const {rows,universe}=scheduleData; if(!rows.length){res.status(400).json({error:"لا يوجد جدول في هذا النطاق"});return;}
  const result=createEmergencyPlans(kind,value,rows,universe,courses,instructors,constraints); if(!result.affected){res.status(400).json({error:"لم أجد مواعيد تتأثر بهذه الحالة"});return;} res.json({...result,guardrail:"الخطط الثلاث سيناريوهات فقط. لا شيء يُنشر قبل حفظه كمسودة ثم اعتماده صراحة."});
});

app.get("/api/intelligence/department-start-rhythm", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0),termId=Number(req.query.termId||0);
  if(!collegeId||!isScopeAllowed(req,collegeId,sectionId)){
    res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"}); return;
  }
  /* بلا قسم: أقسامُ القارئ في الكلية لا الكليةُ كلها — فالمفتاحُ يحمل القارئَ حينها. */
  const rhythmReader=sectionId||req.user?.IsAdminUser?"":`:u${req.user?.SystemUserId}`;
  const cacheKey=dataContextCacheKey(`${collegeId}:${sectionId}:${termId||"latest"}${rhythmReader}`);
  const cached=historicalTimeCache.get(cacheKey);
  if(cached&&cached.serial===driftSerial&&cached.expiresAt>Date.now()){res.json(cached.body);return;}
  const [terms,historyRaw]=await Promise.all([
    Repository.getTerms(),
    Repository.getSchedulesByScope({collegeId,sectionId}),
  ]);
  const history=filterByScope(req,historyRaw);
  // One model answers every card in this department. It knows the department,
  // the active day-pattern and each course separately, with recent terms given
  // more weight than old history. The client picks the narrowest reliable layer.
  const body=buildHistoricalTimeModel(history,terms,10,termId);
  historicalTimeCache.set(cacheKey,{serial:driftSerial,expiresAt:Date.now()+5*60*1000,body});
  if(historicalTimeCache.size>180)historicalTimeCache.clear();
  res.json(body);
});

app.get("/api/intelligence/settled-drift", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0);
  const sectionId = Number(req.query.sectionId || 0);
  /* الفصل المعروض على الشاشة الآن. */
  const viewingTermId = Number(req.query.termId || 0);
  if (!collegeId || !isScopeAllowed(req, collegeId, sectionId)) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  const driftReader = sectionId || req.user?.IsAdminUser ? "" : `:u${req.user?.SystemUserId}`;
  const key = dataContextCacheKey(`${collegeId}:${sectionId}:${viewingTermId || "any"}${driftReader}`);
  const cached = driftCache.get(key);
  if (cached && cached.serial === driftSerial) { res.json(cached.body); return; }

  const terms = await Repository.getTerms();
  const { term } = settledTerm(terms);
  const newest = sortTermsNewestServer(terms)[0];

  /* What the system has worked out about this department, so the board can
     show it rather than ask for it. It is a statement, not an offer — there is
     nothing here to accept. */
  const readHabit = async () => {
    /* عادةُ «الكلية كلها» ليست عادةَ قسمٍ في نطاق القارئ. */
    if (!sectionId && !req.user?.IsAdminUser) return null;
    const style = await departmentStyle({ AdCollegeId: collegeId, AdSectionId: sectionId,
      AdTermId: newest?.AdTermId || 0 });
    if (!style.reading) return null;
    const sentence = describeRhythm(style.reading);
    return sentence ? {
      sentence,
      patterns: style.reading.patterns
        .filter(pattern => pattern.breakMinutes || pattern.durationMinutes)
        .map(pattern => ({
          days: pattern.days, breakMinutes: pattern.breakMinutes,
          durationMinutes: pattern.durationMinutes, durationRange: pattern.durationRange,
          ladder: pattern.ladder, lectures: pattern.lectures,
        })),
      learnedFrom: style.reading.learnedFrom,
    } : null;
  };

  if (!term) {
    // Nothing has been closed yet, and saying "no problems" would be a claim
    // about a check that has not run.
    const body = {
      watching: false,
      reason: "لا يوجد فصل معتمد بعد — الاعتماد يتحقق بإنشاء الفصل التالي.",
      habit: await readHabit(),
    };
    driftCache.set(key, { serial: driftSerial, body });
    res.json(body);
    return;
  }

  /*
   * الرسالة تخصّ الفصل الذي يُنظر إليه، لا فصلاً آخر.
   *
   * «المعتمد» يعني الفصل الذي صار له تالٍ. فما إن يُنشأ فصل جديد حتى يبدأ
   * هذا الفحص يتحدث عن الفصل الذي قبله — بينما القارئ يعمل في الفصل الجديد.
   * فتظهر نافذة عن «الفصل الصيفي 2025/2026» فوق لوحة «الفصل الأول 2026/2027»:
   * كلام صحيح عن فصل لا أحد يعمل فيه الآن.
   *
   * فتُقال حيث تعني شيئاً: حين يكون الفصل المعروض هو الفصل المعتمد نفسه.
   * والانتقال إليه يُظهرها كاملةً، فلا شيء فُقد — إنما نُقل إلى سياقه.
   */
  if (viewingTermId && Number(term.AdTermId) !== viewingTermId) {
    const body = {
      watching: false,
      reason: "الفحص يخصّ الفصل المعتمد؛ انتقل إليه لقراءة ما تغيّر تحته.",
      habit: await readHabit(),
    };
    driftCache.set(key, { serial: driftSerial, body });
    res.json(body);
    return;
  }

  /* One indexed read for the whole university's term, which the row cache
     already memoises, and one scoped read for the department's own rows. */
  const [universe, mine, rules] = await Promise.all([
    Repository.getSchedulesByScope({ termId: term.AdTermId }),
    Repository.getSchedulesByScope({ collegeId, sectionId, termId: term.AdTermId }).then(rows => filterByScope(req, rows)),
    Repository.getScheduleConstraints(collegeId, sectionId, term.AdTermId).catch(() => []),
  ]);
  const doorway = Number(rules.find(item => item.type === "room_doorway" && item.enabled !== false)?.maxMinutes || 0);
  const reading = readSettledDrift(terms, mine, universe,
    other => Boolean(req.user?.IsAdminUser || isScopeAllowed(req, other.AdCollegeId, other.AdSectionId)),
    { doorwayMinutes: Math.max(0, Math.min(60, doorway)) });

  const courses = reading.findings.length ? await Repository.getCourses() : [];
  const nameOf = (row: any) => row?.AdCourseName
    || courses.find(course => course.AdCourseId === row?.AdCourseId)?.CourseName || "موعد";
  const habit = await readHabit();
  const body = {
    watching: true,
    term: { id: term.AdTermId, name: term.AdTermName },
    // The habit the department keeps but has never written down.
    habit,
    scanned: reading.scanned,
    total: reading.findings.length,
    foreign: reading.foreign,
    headline: reading.headline,
    // The honest limit, carried with the answer so the interface cannot forget
    // to say it: silence here means nothing was FOUND, not that nothing is wrong.
    limit: "يقرأ ما هو مسجَّل في هذا النظام فقط؛ إغلاق قاعة أو جدول خارج النظام لا يظهر هنا.",
    findings: reading.findings.slice(0, 40).map(item => ({
      rowId: item.row.id, otherId: item.other ? item.otherId : 0,
      name: nameOf(item.row),
      otherName: item.other ? nameOf(item.other) : "",
      day: SCHEDULE_DAY_KEYS.find(key => Boolean((item.row as any)[key])) || "",
      time: formatScheduleTimeRange(item.row.fstarttime, item.row.fendtime),
      room: [item.row.AdRoomCode, item.row.AdRoomHall].filter(Boolean).join("/"),
      type: item.type, message: item.message, detail: item.detail, foreign: item.foreign,
    })),
  };
  driftCache.set(key, { serial: driftSerial, body });
  if (driftCache.size > 200) driftCache.clear();
  res.json(body);
});

app.get("/api/intelligence/rollover", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0);
  const sectionId = Number(req.query.sectionId || 0);
  const sourceTermId = Number(req.query.sourceTermId || 0);
  if (!collegeId || !sectionId || !sourceTermId || !isScopeAllowed(req, collegeId, sectionId)) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  const [source, courses, instructors, everyRow] = await Promise.all([
    Repository.getSchedulesByScope({ collegeId, sectionId, termId: sourceTermId }),
    Repository.getCourses(),
    Repository.getInstructors(),
    Repository.getSchedules(),
  ]);
  const catalogue = courses.filter(course => course.AdCollegeId === collegeId && course.AdSectionId === sectionId);
  // "Still in use" means: this hall appears somewhere in the system today. A
  // room is not retired because this department stopped using it.
  const liveRooms = [...new Set(everyRow.map(row => roomIdentityKey(row)).filter(Boolean))];
  /* The department's own history, every term of it. `everyRow` is already in
     hand for the retired-hall sweep, so the style reading costs one filter and
     no extra read. */
  const history = everyRow.filter(row =>
    Number(row.AdCollegeId) === collegeId && Number(row.AdSectionId) === sectionId);
  const reading = readTermRollover(source, catalogue, instructors, liveRooms, history);
  res.json({
    ...reading,
    // Same reason as the concerns below: the screen names a few, not all.
    style: reading.style ? {
      inStyle: reading.style.inStyle,
      offStyle: reading.style.offStyle,
      share: reading.style.share,
      learnedFrom: reading.style.learnedFrom,
      notes: reading.style.notes.slice(0, 6).map(note => ({
        id: note.row.id,
        course: note.row.AdCourseName || "",
        section: note.row.SCode,
        text: note.text,
      })),
    } : null,
    // The rows themselves are heavy and the screen only lists a few.
    concerns: reading.concerns.slice(0, 40).map(concern => ({
      id: concern.row.id,
      course: concern.row.AdCourseName || "",
      section: concern.row.SCode,
      flags: concern.flags,
      why: concern.why,
    })),
    concernCount: reading.concerns.length,
    sentence: describeRollover(reading),
    guardrail: "قراءة فقط. لم يُنشأ شيء ولم يتغيّر شيء.",
  });
});

app.post("/api/intelligence/genesis", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.body?.collegeId||0),sectionId=Number(req.body?.sectionId||0),targetTermId=Number(req.body?.targetTermId||req.body?.termId||0),sourceTermId=Number(req.body?.sourceTermId||0); if(!collegeId||!sectionId||!targetTermId||!sourceTermId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} if(sourceTermId===targetTermId){res.status(400).json({error:"اختر فصلاً سابقاً مختلفاً عن الفصل الجديد"});return;}
  const [source,targetUniverse,courses,instructors,terms,constraints]=await Promise.all([Repository.getSchedulesByScope({collegeId,sectionId,termId:sourceTermId}),Repository.getSchedulesByScope({termId:targetTermId}),Repository.getCourses(),Repository.getInstructors(),Repository.getTerms(),Repository.getScheduleConstraints(collegeId,sectionId,targetTermId)]); if(!source.length){res.status(400).json({error:"الفصل السابق لا يحتوي جدولاً لهذا القسم"});return;}
  const {archived:archivedSource}=await splitArchivedCourseRows(source,sectionId);
  const archivedCourseIds=new Set(archivedSource.map(row=>Number(row.AdCourseId)));
  const validCourseIds=new Set(courses.filter(c=>c.AdCollegeId===collegeId&&c.AdSectionId===sectionId&&!archivedCourseIds.has(Number(c.AdCourseId))).map(c=>c.AdCourseId));
  const validInstructorIds=new Set(instructors.map(i=>Number(i.AdInstructorId)));
  const sourceByCourse=new Map<number,FSchedule[]>();
  source.forEach(row=>{const list=sourceByCourse.get(Number(row.AdCourseId))||[];list.push(row);sourceByCourse.set(Number(row.AdCourseId),list);});
  /* Copied terms carry whatever section numbers the old sheet used — "1", "10",
     "11" — which the publish gate rightly rejects (a section must be 501, 502,
     503… per course). So the copy renumbers every section automatically the
     moment it is drafted: nothing to hand-fix, and the "بداية الفصل" draft
     opens already valid, exactly like the authority-PDF convention. */
  const sectionSeqByCourse=new Map<number,number>();
  const candidateRows=source
    .filter(r=>validCourseIds.has(r.AdCourseId))
    .map((r,index)=>{
      const siblings=sourceByCourse.get(Number(r.AdCourseId))||[];
      const instructorId=validInstructorIds.has(Number(r.AdInstructorId))
        ? Number(r.AdInstructorId)
        : Number(siblings.find(x=>validInstructorIds.has(Number(x.AdInstructorId)))?.AdInstructorId||0);
      const roomSibling=siblings.find(x=>String(x.AdRoomCode||"").trim()&&String(x.AdRoomHall||"").trim());
      const seq=(sectionSeqByCourse.get(Number(r.AdCourseId))||0)+1;
      sectionSeqByCourse.set(Number(r.AdCourseId),seq);
      const sectionCode=String(500+seq);
      return{...r,id:-(index+1),AdTermId:targetTermId,SCode:sectionCode,AdInstructorId:instructorId,
        AdRoomCode:String(r.AdRoomCode||"").trim()||String(roomSibling?.AdRoomCode||"").trim(),
        AdRoomHall:String(r.AdRoomHall||"").trim()||String(roomSibling?.AdRoomHall||"").trim()};
    });
  if(!candidateRows.length){res.status(400).json({error:"لم أجد مواعيد قابلة للنسخ لهذا القسم في الفصل السابق"});return;}
  /* A beginning-of-term draft should be reviewable and, when the only problem
     is a target-term collision, publishable without a dead end. Normalise old
     identifiers and then run the safety-first optimiser against the target
     term. It preserves course, instructor, days and room; only safe time shifts
     are allowed. */
  const initialRows=safeDraftRows(candidateRows,collegeId,sectionId,targetTermId);
  const external=targetUniverse.filter(r=>!(Number(r.AdCollegeId)===collegeId&&Number(r.AdSectionId)===sectionId));
  let rows=initialRows;
  for(let pass=0;pass<4;pass++){
    const proposal=autoScheduleProposal(rows,[...external,...rows]);
    rows=proposal.rows;
    if(!proposal.changed)break;
  }
  const adjustedRows=rows.filter((row,index)=>row.fstarttime!==initialRows[index]?.fstarttime||row.fendtime!==initialRows[index]?.fendtime).length;
  const issues=await validateSmartRows(rows,collegeId,sectionId);
  const genesisConflicts=blockingConflicts(rows,[...external,...rows],await approvalBlockerOptions());
  const rowIssues=mapSmartIssuesToRows(rows,issues,genesisConflicts);
  const issueRowIds=Object.keys(rowIssues).map(Number);
  const universe=external.concat(rows); const analysis=analyzeSchedule(rows,universe,courses,instructors,await approvalBlockerOptions()); const rules=evaluateScheduleConstraints(rows,constraints); const draft=await Repository.createScheduleDraft({SystemUserId:req.user.SystemUserId,userName:req.user.Name,AdCollegeId:collegeId,AdSectionId:sectionId,AdTermId:targetTermId,...scopeBase(targetUniverse.filter(r=>Number(r.AdCollegeId)===collegeId&&Number(r.AdSectionId)===sectionId)),name:`بداية الفصل · ${terms.find(t=>t.AdTermId===sourceTermId)?.AdTermName||sourceTermId} → ${terms.find(t=>t.AdTermId===targetTermId)?.AdTermName||targetTermId}`,source:"auto",rows});
  const courseById=new Map(courses.map(course=>[Number(course.AdCourseId),course]));
  const instructorById=new Map(instructors.map(instructor=>[Number(instructor.AdInstructorId),instructor]));
  const genesisVisiting=new Set((await readVisitingStatus(collegeId,sectionId,targetTermId)).instructorIds.map(Number));
  const previewRows=draft.rows.map((row,index)=>({
    index:index+1,id:row.id,courseId:Number(row.AdCourseId)||0,courseCode:courseById.get(Number(row.AdCourseId))?.CourseCode||"",courseName:row.AdCourseName||courseById.get(Number(row.AdCourseId))?.CourseName||"مقرر",
    section:row.SCode||"",instructor:instructorById.get(Number(row.AdInstructorId))?.AdInstructorName||"بدون أستاذ",
    instructorId:Number(row.AdInstructorId)||0,visiting:genesisVisiting.has(Number(row.AdInstructorId)),
    days:SCHEDULE_DAY_KEYS.map((key,i)=>row[key]?DAY_LABELS[i]:null).filter(Boolean).join(" · "),start:row.fstarttime,end:row.fendtime,
    fsunday:Boolean(row.fsunday),fmonday:Boolean(row.fmonday),ftuesday:Boolean(row.ftuesday),fwednesday:Boolean(row.fwednesday),fthursday:Boolean(row.fthursday),
    building:row.AdRoomCode||"",hall:row.AdRoomHall||"",
  }));
  res.status(201).json({draft:{id:draft.id,name:draft.name,status:draft.status,rowCount:draft.rows.length},analysis:{score:analysis.score,conflicts:analysis.metrics.criticalConflicts,avgGap:analysis.metrics.avgInstructorGap,constraintViolations:rules.total},coverage:{sourceRows:source.length,archivedSkipped:archivedSource.length,copiedRows:rows.length,skippedRows:source.length-rows.length,adjustedRows},reviewRequired:issues.length,issues:issues.slice(0,24),issueRowIds,rowIssues,previewRows,guardrail:(archivedSource.length?`لم تُنسخ ${countOf(archivedSource.length, AR.appointment)} لمقررات مؤرشفة أكاديمياً. `:"")+(issues.length?`أُنشئت المسودة بنجاح وبها ${countOf(issues.length, oblique(AR.note))} للمراجعة قبل النشر؛ الجدول الحقيقي لم يتغير.`:"بداية الفصل أنشأت مسودة كاملة قابلة للمراجعة؛ الجدول الرسمي لم يتغير بعد.")});
});

app.get("/api/intelligence/brief", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const [scheduleData,courses,instructors]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors()]); const {rows,universe}=scheduleData; const changedSince=await briefChangedSince(collegeId,sectionId,termId,rows); res.json(buildOneMinuteBrief(rows,universe,courses,instructors,changedSince,await approvalBlockerOptions()));
});

app.post("/api/intelligence/meeting-minutes", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const [scheduleData,courses,instructors,constraints,memories]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleConstraints(collegeId,sectionId,termId),Repository.getScheduleDecisionMemories(collegeId,sectionId,120)]); const {rows,universe}=scheduleData; if(!rows.length){res.status(400).json({error:"لا يوجد جدول لبناء محضر قرار"});return;} const war=buildWarRoom(rows,universe,courses,instructors,constraints,Number(req.body?.rowId||0)||undefined); const chosen=war.options?.find((x:any)=>x.id===String(req.body?.optionId||""))||war.options?.[0]; const issueRowId=war.issue?.rowId; const comments=issueRowId?await Repository.getScheduleComments(issueRowId):[]; const recentMemory=memories.filter(m=>!war.issue?.rowId||m.scheduleId===war.issue.rowId||m.AdCourseId===rows.find(r=>r.id===war.issue.rowId)?.AdCourseId).slice(0,5); const minutes={title:"محضر قرار الجدول",problem:war.issue?`${war.issue.courseName} · شعبة ${war.issue.sectionCode} — ${countOf(war.issue.conflictCount, AR.position)} بحاجة إلى تحقق قبل الاعتماد.`:"مراجعة عامة للجدول",alternatives:(war.options||[]).map((o:any)=>({id:o.id,title:o.title,reason:o.reason,score:o.score,conflicts:o.conflicts,changed:o.changed})),selected:chosen?{id:chosen.id,title:chosen.title,reason:chosen.reason,score:chosen.score,conflicts:chosen.conflicts,changed:chosen.changed}:null,expectedImpact:chosen?`الجودة ${war.baseline.score} ← ${chosen.score}، وموانع الحفظ ${war.baseline.conflicts} ← ${chosen.conflicts}، وعدد المواعيد المتغيرة ${chosen.changed}.`:"لم يُحدد بديل.",discussion:comments.slice(0,8).map(c=>({text:c.text,user:c.userName,createdAt:c.createdAt,resolved:c.resolved})),memory:recentMemory.map(m=>({reason:m.reason,kind:m.kind,createdAt:m.createdAt,user:m.userName})),approvedBy:String(req.body?.approvedBy||req.user.Name).slice(0,120),generatedAt:new Date().toISOString()}; res.json(minutes);
});

app.get("/api/intelligence/safety-net", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const versions=await Repository.getScheduleVersions(collegeId,sectionId,termId,18); res.json(versions.map(v=>({id:v.id,createdAt:v.createdAt,label:v.label,source:v.source,userName:v.userName,rowCount:Number(v.rowCount ?? v.rows.length),decisionLabel:`استرجع الجدول إلى ${v.label}`})));
});

app.post("/api/intelligence/safety-net/:id/undo", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  if(!confirmTokens(req).has("decision-undo")){res.status(409).json({error:"يتطلب التراجع عن القرار تأكيداً صريحاً"});return;} const version=await Repository.getScheduleVersionById(String(req.params.id)); if(!version){res.status(404).json({error:"نقطة الأمان غير موجودة"});return;} if(!isScopeAllowed(req,version.AdCollegeId,version.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const restoreLock=await scheduleLockRefusal(req,version.AdCollegeId,version.AdSectionId,version.AdTermId); if(restoreLock){res.status(409).json({error:restoreLock,code:"schedule-locked"});return;} const restored=safeDraftRows(version.rows,version.AdCollegeId,version.AdSectionId,version.AdTermId); const undoOverwrite=await scopeOverwriteRefusal(req,version.AdCollegeId,version.AdSectionId,version.AdTermId,version); if(undoOverwrite){res.status(409).json(undoOverwrite);return;} const undoDeadline=await wholesaleRefusal(version.AdCollegeId,version.AdSectionId,version.AdTermId,await replacementAction(version.AdCollegeId,version.AdSectionId,version.AdTermId,restored)); if(undoDeadline){res.status(409).json({error:undoDeadline,code:"deadline-wholesale"});return;} const issues=await validateSmartRows(restored,version.AdCollegeId,version.AdSectionId,{resolveHistorical:true}); if(issues.length){res.status(400).json({error:"لا يمكن التراجع إلى نسخة تحتوي أوقاتاً أو تعارضات غير صالحة",issues});return;} const undoVersion=await captureScopeVersion(req,version.AdCollegeId,version.AdSectionId,version.AdTermId,`قبل التراجع عن القرار: ${version.label}`,"undo"); const rows=await Repository.replaceScheduleScope(version.AdCollegeId,version.AdSectionId,version.AdTermId,restored); await recordVersionAfter(undoVersion,rows as any[]); await noteScheduleMutation(req,version.AdCollegeId,version.AdSectionId,version.AdTermId,{kind:"add",rows:rows as any[]}); await Repository.upsertSchedulePublication({AdCollegeId:version.AdCollegeId,AdSectionId:version.AdSectionId,AdTermId:version.AdTermId,SystemUserId:req.user.SystemUserId,userName:req.user.Name,draftId:`decision-undo:${version.id}`}); res.json({success:true,count:rows.length,message:`تمت العودة إلى ${version.label}`});
});
}
