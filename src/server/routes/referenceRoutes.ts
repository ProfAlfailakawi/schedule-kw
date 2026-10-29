/**
 * ── البياناتُ المرجعية: الكليات والأقسام والفصول والعبء ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { Request, Response } from "express";
import { Repository } from "../../db/repository";
import { byRoom } from "../../utils/sorting";
import { timeToMinutes } from "../../utils/scheduleIntelligence";
import { visibleTermIds } from "../../utils/scopedTerms";
import { currentTermId } from "../../utils/termSequence";
import { ensureSectionFaculty } from "../sectionFaculty";
import { evaluateTeachingLoad, teachingHoursByInstructor, teachingLoadProblem } from "../../utils/teachingLoad";
import type { AdCourse, AdInstructor, AdSection } from "../../types";
import { provisionCollegeUsers } from "../sectionUsers";
import { AR, countOf, oblique } from "../../utils/arabicCount";
import { readDegreeRuleInput } from "../../utils/degreeRules";
import { DEFAULT_TRAVEL_MINUTES, SAME_BUILDING_MINUTES } from "../../utils/campusTravel";
import { isValidClock, scheduleDayWindowMinutes, withinScheduleDay } from "../../utils/scheduleTime";
import { type AuthenticatedRequest, isPowerUser, requireAuth, requirePermission, requireRootAdmin } from "../core/auth";
import { boundedInt, cleanText, TEXT_LIMIT } from "../core/input";
import { dataContextCacheKey } from "../core/locations";
import { sortArabicNamed, sortTermsNewestServer } from "../core/ordering";
import { readLiveSchedulesForRequest } from "../core/scheduleReads";
import { normalizedBuilding, sectionScheduleWindowCache, travelPairKey } from "../core/scheduleRules";
import { filterByScope, intelligenceReadScopes, isScopeAllowed } from "../core/scope";
import { smartContextFrom } from "../core/smartImport";
import { degreeRuleFromName, graduationCandidatesForSection, surveyPayloadCache } from "../core/studentIdentity";

const collegeMobilityHistoryCache=new Map<string,{expiresAt:number;history:any[]}>();

/* ══ النصاب التدريسي (ميزةٌ اختيارية، يديرها المسؤول المخوّل) ══════════════════
   الإعدادُ للمدير الرئيسي وحده. والتنبيهُ للمخطّط قراءةٌ فقط: لا يمنع حفظَ موعدٍ ولا يمرّ بمساره، وما في هذه
   المسارات لا يغيّر جدولاً ولا تقريراً. مُعطَّلةٌ افتراضياً: بلا تفعيلٍ لا يُحسب شيءٌ ولا يُرسَل. */
async function teachingLoadHoursForTerm(termId: number) {
  const [universe, courses] = await Promise.all([Repository.getSchedulesByScope({ termId }), Repository.getCourses()]);
  const courseHours = new Map<number, number>(courses.map((course: AdCourse) => [Number(course.AdCourseId), Number(course.CourseHours) || 0] as [number, number]));
  return teachingHoursByInstructor(universe, courseHours);
}

/* ── الفصول التي لها جدولٌ في النطاق ─────────────────────────────────────────
 *
 * قائمةُ الفصل في كل شاشةٍ لا تُري القسمَ فصلاً لا بيانات له فيه (خاصةً الفصول السابقة)، إلا أحدثَ فصلٍ فيبقى
 * ولو فارغاً لأن القسم قد بدأ العمل عليه؛ فإن أُنشئ بعده فصلٌ أحدث صار القديم قديماً واختفى إن لم تكن له بيانات. تُقرأ من صفوف نطاق القارئ نفسه (readLiveSchedulesForRequest: حارسُ النطاق
 * يُطبَّق) فصلاً فصلاً — لا مسحَ بلا فصل — وتُحفظ دقيقةً بمفتاحٍ يشمل نطاقَ القارئ. */
const scopedTermsCache = new Map<string, { at: number; data: { termIds: number[]; currentTermId: number; newestTermId: number } }>();

export function registerReferenceRoutes(app: Express): void {

// --- COLLEGE API ---

app.get("/api/colleges", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const colleges = await Repository.getColleges();
  if (req.user.IsAdminUser) {
    res.json(sortArabicNamed(colleges, row => row.AdCollegeName));
    return;
  }
  // Filter colleges based on user sections scope
  const allowedCollegeIds = new Set(req.scopes?.map(s => s.AdCollegeId) || []);
  const filtered = colleges.filter(c => allowedCollegeIds.has(c.AdCollegeId));
  res.json(sortArabicNamed(filtered, row => row.AdCollegeName));
});

app.post("/api/colleges", requirePermission(2), async (req: Request, res: Response) => {
  const code = cleanText(req.body?.AdCollegeCode, TEXT_LIMIT.code);
  const name = cleanText(req.body?.AdCollegeName, TEXT_LIMIT.name);
  if (!code || !name) {
    res.status(400).json({ error: `الرجاء إدخال رمز الكلية واسمها (الرمز حتى ${countOf(TEXT_LIMIT.code, oblique(AR.character))} والاسم حتى ${countOf(TEXT_LIMIT.name, oblique(AR.character))})` });
    return;
  }
  const newC = await Repository.createCollege(code, name);
  /* الكلية الجديدة تولد بعميدها وعميدها المساعد (فعّالين بكلمة السر الافتراضية)؛ وعميد التسجيل ورئيسه نطاقهما كل الكليات فيشملانها. */
  const accounts = (req as AuthenticatedRequest).user?.IsAdminUser ? await provisionCollegeUsers(Repository, newC) : [];
  res.locals.auditChanges = `إنشاء كلية «${name}»${accounts.length ? ` وحسابات ${accounts.filter(row => row.status === "created").map(row => row.login).join("، ")}` : ""}`;
  res.status(201).json({ ...newC, accounts });
});

app.put("/api/colleges/:id", requirePermission(2), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(req.params.id);
  if (!req.user.IsAdminUser && !isScopeAllowed(req, id, 0)) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  const AdCollegeCode = cleanText(req.body?.AdCollegeCode, TEXT_LIMIT.code);
  const AdCollegeName = cleanText(req.body?.AdCollegeName, TEXT_LIMIT.name);
  if (!AdCollegeCode || !AdCollegeName) {
    res.status(400).json({ error: `الرجاء إدخال رمز الكلية واسمها (الرمز حتى ${countOf(TEXT_LIMIT.code, oblique(AR.character))} والاسم حتى ${countOf(TEXT_LIMIT.name, oblique(AR.character))})` });
    return;
  }
  try {
    const updated = await Repository.updateCollege(id, AdCollegeCode, AdCollegeName);
    res.json(updated);
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

app.delete("/api/colleges/:id", requirePermission(2), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(req.params.id);
  if (!req.user.IsAdminUser && !isScopeAllowed(req, id, 0)) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  // Legacy SQL has AdSection -> AdCollege FK. The old SaveChanges fails while sections exist.
  if ((await Repository.getSectionsByCollege(id)).length > 0) {
    res.status(409).json({ error: "لا يمكن حذف الكلية لوجود أقسام علمية مرتبطة بها" });
    return;
  }
  await Repository.deleteCollege(id);
  res.json({ success: true });
});
app.get("/api/colleges/:id/mobility", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.params.id||0);if(!collegeId){res.status(400).json({error:"الكلية غير صالحة"});return;}
  if(!req.user.IsAdminUser&&!isScopeAllowed(req,collegeId,0)){res.status(403).json({error:"خارج صلاحيات الكلية"});return;}
  const [college,profile]=await Promise.all([Repository.getCollegeById(collegeId),Repository.getCampusMobilityProfile(collegeId)]);
  if(!college){res.status(404).json({error:"الكلية غير موجودة"});return;}
  const historyKey=dataContextCacheKey(collegeId);
  const cachedHistory=collegeMobilityHistoryCache.get(historyKey);
  const history=cachedHistory&&cachedHistory.expiresAt>Date.now()?cachedHistory.history:await Repository.getSchedulesByScope({collegeId});
  if(!cachedHistory||cachedHistory.expiresAt<=Date.now()){
    if(collegeMobilityHistoryCache.size>100)collegeMobilityHistoryCache.clear();
    collegeMobilityHistoryCache.set(historyKey,{history,expiresAt:Date.now()+10*60*1000});
  }
  const usage=new Map<string,number>();history.forEach((row:any)=>{const b=normalizedBuilding(row.AdRoomCode);if(b)usage.set(b,(usage.get(b)||0)+1);});
  /* This list is walked to fill in a travel-time matrix, so it is ordered the
     way a person looks a building up — by its number — not by how busy it is. */
  const buildings=[...usage.entries()].sort((a,b)=>byRoom(a[0],"",b[0],"")).map(([code,count])=>({code,count}));
  res.json({collegeId,collegeName:college.AdCollegeName,profile,buildings,source:"historical-room-usage"});
});

app.put("/api/colleges/:id/mobility", requirePermission(2), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.params.id||0);if(!collegeId){res.status(400).json({error:"الكلية غير صالحة"});return;}
  if(!req.user.IsAdminUser&&!isScopeAllowed(req,collegeId,0)){res.status(403).json({error:"خارج صلاحيات الكلية"});return;}
  const college=await Repository.getCollegeById(collegeId);if(!college){res.status(404).json({error:"الكلية غير موجودة"});return;}
  const rawPairs=Array.isArray(req.body?.pairs)?req.body.pairs:[];const seen=new Set<string>(),pairs:any[]=[];
  for(const raw of rawPairs){const fromBuilding=normalizedBuilding(raw?.fromBuilding).slice(0,40),toBuilding=normalizedBuilding(raw?.toBuilding).slice(0,40),minutes=Math.max(1,Math.min(120,Number(raw?.minutes)||0));if(!fromBuilding||!toBuilding||fromBuilding.toLocaleLowerCase()===toBuilding.toLocaleLowerCase())continue;const key=travelPairKey(fromBuilding,toBuilding);if(seen.has(key))continue;seen.add(key);pairs.push({fromBuilding,toBuilding,minutes});}
  const profile=await Repository.upsertCampusMobilityProfile({AdCollegeId:collegeId,defaultTravelMinutes:Math.max(1,Math.min(120,Number(req.body?.defaultTravelMinutes)||DEFAULT_TRAVEL_MINUTES)),sameBuildingMinutes:Math.max(0,Math.min(30,Number(req.body?.sameBuildingMinutes)||SAME_BUILDING_MINUTES)),pairs,updatedAt:new Date().toISOString(),updatedBy:req.user.Name});
  res.json(profile);
});

// --- SECTIONS API ---

app.get("/api/sections", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = req.query.collegeId ? parseInt(req.query.collegeId as string) : undefined;
  let sections = collegeId ? await Repository.getSectionsByCollege(collegeId) : await Repository.getSections();
  sections = filterByScope(req, sections);
  res.json(sortArabicNamed(sections, row => row.AdSectionName));
});

app.get("/api/schedule-day-window", requirePermission(7), async (req:AuthenticatedRequest,res:Response)=>{
  const sectionId=Number(req.query.sectionId||0),section=sectionId?await Repository.getSectionById(sectionId):undefined;
  if(!section){res.status(404).json({error:"القسم غير موجود"});return;}
  if(!isScopeAllowed(req,Number(section.AdCollegeId),sectionId)&&!isPowerUser(req)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const {startTime,endTime}=scheduleDayWindowMinutes(section);res.setHeader("Cache-Control","no-store");res.json({startTime,endTime});
});

app.get("/api/admin/section-schedule-windows",requirePermission(7),requireRootAdmin,async(req:AuthenticatedRequest,res:Response)=>{
  const collegeId=Number(req.query.collegeId||0),college=await Repository.getCollegeById(collegeId);
  if(!college){res.status(400).json({error:"اختر كلية صحيحة"});return;}
  const sections=await Repository.getSectionsByCollege(collegeId);
  res.setHeader("Cache-Control","no-store");res.json({collegeId,sections:sortArabicNamed(sections,row=>row.AdSectionName).map(section=>({AdSectionId:section.AdSectionId,AdSectionName:section.AdSectionName,AdSectionCode:section.AdSectionCode,...scheduleDayWindowMinutes(section)}))});
});

app.put("/api/admin/section-schedule-windows",requirePermission(7),requireRootAdmin,async(req:AuthenticatedRequest,res:Response)=>{
  const collegeId=Number(req.body?.collegeId||0),college=await Repository.getCollegeById(collegeId),sectionIds:number[]=Array.isArray(req.body?.sectionIds)?[...new Set<number>(req.body.sectionIds.map(Number).filter((id:number)=>Number.isInteger(id)&&id>0))]:[];
  const startTime=String(req.body?.startTime||""),endTime=String(req.body?.endTime||"");
  if(!college||!sectionIds.length){res.status(400).json({error:"اختر كليةً وقسمًا واحدًا على الأقل"});return;}
  if(!isValidClock(startTime)||!isValidClock(endTime)||timeToMinutes(endTime)<=timeToMinutes(startTime)){res.status(400).json({error:"تأكد أن البداية والنهاية صحيحتان وأن النهاية بعد البداية."});return;}
  const sections:AdSection[]=await Repository.getSectionsByCollege(collegeId),sectionById=new Map<number,AdSection>(sections.map((section:AdSection):[number,AdSection]=>[Number(section.AdSectionId),section]));
  if(sectionIds.some(id=>!sectionById.has(id))){res.status(400).json({error:"بعض الأقسام المختارة لا تتبع الكلية المحددة."});return;}
  await Promise.all(sectionIds.map(id=>Repository.setSectionScheduleDayWindow(id,startTime,endTime)));
  sectionIds.forEach(id=>sectionScheduleWindowCache.delete(dataContextCacheKey(id)));
  const selectedIds=new Set(sectionIds),terms=sortTermsNewestServer(await Repository.getTerms()),termId=Number(currentTermId(terms as any)||terms[0]?.AdTermId||0),rows=termId?await Repository.getSchedulesByScope({collegeId,termId}):[];
  const outOfWindowAppointments=rows.filter(row=>selectedIds.has(Number(row.AdSectionId))&&(!withinScheduleDay(timeToMinutes(row.fstarttime),timeToMinutes(row.fendtime),{startTime,endTime}))).length;
  res.json({success:true,updated:sectionIds.length,startTime,endTime,outOfWindowAppointments});
});

app.get("/api/admin/teaching-load", requirePermission(7), requireRootAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const terms = sortTermsNewestServer(await Repository.getTerms());
  const termId = Number(req.query.termId || 0) || Number(currentTermId(terms as any) || terms[0]?.AdTermId || 0);
  const term = terms.find(item => Number(item.AdTermId) === termId);
  const [config, instructors, hours] = await Promise.all([Repository.getTeachingLoadConfig(), Repository.getInstructors(), termId ? teachingLoadHoursForTerm(termId) : Promise.resolve(new Map<number, number>())]);
  res.setHeader("Cache-Control", "no-store");
  res.json({
    config,
    term: term ? { id: termId, name: String(term.AdTermName || "") } : null,
    terms: terms.map(item => ({ id: Number(item.AdTermId), name: String(item.AdTermName || "") })),
    instructors: sortArabicNamed(instructors, row => row.AdInstructorName).map(row => {
      const status = evaluateTeachingLoad(config, Number(row.AdInstructorId), hours.get(Number(row.AdInstructorId)) || 0);
      return { id: Number(row.AdInstructorId), name: String(row.AdInstructorName || ""), retired: Boolean(row.AdInstructorStatus), hours: status.hours, state: status.state, allowed: status.allowed, excess: status.excess };
    }),
  });
});

app.put("/api/admin/teaching-load", requirePermission(7), requireRootAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const problem = teachingLoadProblem(req.body);
  if (problem) { res.status(400).json({ error: problem }); return; }
  const instructorIds = new Set((await Repository.getInstructors()).map((row: AdInstructor) => Number(row.AdInstructorId)));
  const unknown = Object.keys(req.body?.assignments && typeof req.body.assignments === "object" ? req.body.assignments : {}).find(key => !instructorIds.has(Number(key)));
  if (unknown) { res.status(400).json({ error: `العضو رقم ${unknown} غير موجود.` }); return; }
  res.json({ success: true, config: await Repository.saveTeachingLoadConfig(req.body, String(req.user?.Name || "")) });
});

app.get("/api/teaching-load/status", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const { collegeId, sectionId, termId } = smartContextFrom(req);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  res.setHeader("Cache-Control", "no-store");
  const config = await Repository.getTeachingLoadConfig();
  if (!config.enabled) { res.json({ enabled: false, over: [], withinCount: 0 }); return; }
  const [scopeRows, hours, instructors] = await Promise.all([Repository.getSchedulesByScope({ collegeId, sectionId, termId }), teachingLoadHoursForTerm(termId), Repository.getInstructors()]);
  const nameById = new Map<number, string>(instructors.map((row: AdInstructor) => [Number(row.AdInstructorId), String(row.AdInstructorName || "")] as [number, string]));
  const inScope = [...new Set<number>(scopeRows.map(row => Number(row.AdInstructorId || 0)).filter(Boolean))];
  const statuses = inScope.map(id => evaluateTeachingLoad(config, id, hours.get(id) || 0));
  res.json({
    enabled: true,
    over: statuses.filter(item => item.state === "over").sort((a, b) => b.excess - a.excess)
      .map(item => ({ id: item.instructorId, name: nameById.get(item.instructorId) || `عضو ${item.instructorId}`, rank: item.rank?.name || "", hours: item.hours, allowed: item.allowed, extra: item.extra, excess: item.excess })),
    withinCount: statuses.filter(item => item.state === "within").length,
  });
});

app.post("/api/sections", requirePermission(4), async (req: AuthenticatedRequest, res: Response) => {
  const AdSectionCode = cleanText(req.body?.AdSectionCode, TEXT_LIMIT.code);
  const AdSectionName = cleanText(req.body?.AdSectionName, TEXT_LIMIT.name);
  const collegeId = boundedInt(req.body?.AdCollegeId, 1, Number.MAX_SAFE_INTEGER) ?? 0;
  if (!collegeId || !AdSectionCode || !AdSectionName) {
    res.status(400).json({ error: `الرجاء إدخال الكلية ورمز القسم واسمه (الرمز حتى ${countOf(TEXT_LIMIT.code, oblique(AR.character))} والاسم حتى ${countOf(TEXT_LIMIT.name, oblique(AR.character))})` });
    return;
  }
  const college = await Repository.getCollegeById(collegeId);
  if (!college) { res.status(400).json({ error: "الكلية المختارة غير صالحة" }); return; }
  if (!isScopeAllowed(req, collegeId, 0) && !req.user.IsAdminUser) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  const newSec = await Repository.createSection(collegeId, AdSectionCode, AdSectionName);
  /* القسم الجديد يولد بسجل «هيئة تدريسية»؛ وتعثّره لا يُسقط القسم، فيُعاد عند أول استيراد. */
  try { await ensureSectionFaculty(Repository, collegeId, Number(newSec.AdSectionId)); } catch (error: any) { console.error("[sections] faculty placeholder:", error?.stack || error); }
  res.status(201).json(newSec);
});

app.put("/api/sections/:id", requirePermission(4), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const AdSectionCode = cleanText(req.body?.AdSectionCode, TEXT_LIMIT.code);
  const AdSectionName = cleanText(req.body?.AdSectionName, TEXT_LIMIT.name);
  const targetCollegeId = boundedInt(req.body?.AdCollegeId, 1, Number.MAX_SAFE_INTEGER) ?? 0;
  if (!targetCollegeId || !AdSectionCode || !AdSectionName) {
    res.status(400).json({ error: `الرجاء إدخال الكلية ورمز القسم واسمه (الرمز حتى ${countOf(TEXT_LIMIT.code, oblique(AR.character))} والاسم حتى ${countOf(TEXT_LIMIT.name, oblique(AR.character))})` });
    return;
  }
  const current = await Repository.getSectionById(id);
  if (!current) { res.status(404).json({ error: "القسم العلمي غير موجود" }); return; }
  const targetCollege = await Repository.getCollegeById(targetCollegeId);
  if (!targetCollege) { res.status(400).json({ error: "الكلية المختارة غير صالحة" }); return; }
  if (!req.user.IsAdminUser && (!isScopeAllowed(req, current.AdCollegeId, current.AdSectionId) || !isScopeAllowed(req, targetCollegeId, 0))) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  try {
    const updated = await Repository.updateSection(id, targetCollegeId, AdSectionCode, AdSectionName);
    res.json(updated);
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

app.delete("/api/sections/:id", requirePermission(4), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const section = await Repository.getSectionById(id);
  if (section && !isScopeAllowed(req, section.AdCollegeId, id) && !req.user.IsAdminUser) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  // Legacy SQL has AdCourse -> AdSection FK. Preserve the same delete constraint.
  if ((await Repository.getCoursesBySection(id)).length > 0) {
    res.status(409).json({ error: "لا يمكن حذف القسم العلمي لوجود مقررات دراسية مرتبطة به" });
    return;
  }
  await Repository.deleteSection(id);
  res.json({ success: true });
});

// --- TERMS API ---

app.get("/api/terms", requireAuth, async (req: Request, res: Response) => {
  const terms = await Repository.getTerms();
  res.json(sortTermsNewestServer(terms));
});
app.get("/api/terms/scoped", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = boundedInt(req.query.collegeId, 0, Number.MAX_SAFE_INTEGER) ?? 0;
  const sectionId = boundedInt(req.query.sectionId, 0, Number.MAX_SAFE_INTEGER) ?? 0;
  const scopeSig = req.user?.IsAdminUser ? "admin" : JSON.stringify((req.scopes || []).map(scope => [Number(scope.AdCollegeId), Number(scope.AdSectionId)]).sort());
  const analysisScope = req.query.analysisScope === "department" && collegeId && sectionId ? "department" : "college";
  const key = dataContextCacheKey(`${collegeId}:${sectionId}:${analysisScope}:${req.user?.SystemUserId || 0}:${scopeSig}`);
  const hit = scopedTermsCache.get(key);
  if (hit && Date.now() - hit.at < 60_000) { res.json(hit.data); return; }
  const terms = sortTermsNewestServer(await Repository.getTerms());
  const current = Number(currentTermId(terms as any) || terms[0]?.AdTermId || 0);
  const readScopes = analysisScope === "department" ? await intelligenceReadScopes(req, collegeId, sectionId) : [{ collegeId, sectionId }];
  const counts = new Map<number, number>();
  /* الفصولُ كلُّها تُقرأ معاً لا ستّةً ستّة: النتيجةُ نفسها، بانتظارٍ واحد بدل خمسة. */
  await Promise.all(terms.map(async term => {
    const rows = await Promise.all(readScopes.map(scope => readLiveSchedulesForRequest(req, scope.collegeId, scope.sectionId, Number(term.AdTermId))));
    counts.set(Number(term.AdTermId), rows.reduce((total, group) => total + group.length, 0));
  }));
  const newest = Number(terms[0]?.AdTermId || 0);
  const data = { termIds: visibleTermIds(terms.map(term => Number(term.AdTermId)), counts, newest), currentTermId: current, newestTermId: newest };
  if (scopedTermsCache.size > 200) scopedTermsCache.clear();
  scopedTermsCache.set(key, { at: Date.now(), data });
  res.json(data);
});

app.post("/api/terms", requirePermission(5), async (req: Request, res: Response) => {
  /* Weeks and the start date are already normalised (and range-checked) by
     termCalendarFields in the repository; the name is what had no bound. */
  const AdTermName = cleanText(req.body?.AdTermName, TEXT_LIMIT.name);
  if (!AdTermName) {
    res.status(400).json({ error: `الرجاء إدخال اسم الفصل الدراسي (حتى ${countOf(TEXT_LIMIT.name, oblique(AR.character))})` });
    return;
  }
  const newTerm = await Repository.createTerm(AdTermName,
    { start: req.body.AdTermStart, weeks: Number(req.body.AdTermWeeks) || 0,
      closed: typeof req.body.AdTermClosed === "boolean" ? req.body.AdTermClosed : undefined });
  scopedTermsCache.clear();
  res.status(201).json(newTerm);
});

app.put("/api/terms/:id", requirePermission(5), async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const AdTermName = cleanText(req.body?.AdTermName, TEXT_LIMIT.name);
  if (!AdTermName) {
    res.status(400).json({ error: `الرجاء إدخال اسم الفصل الدراسي (حتى ${countOf(TEXT_LIMIT.name, oblique(AR.character))})` });
    return;
  }
  try {
    const updated = await Repository.updateTerm(id, AdTermName,
      { start: req.body.AdTermStart, weeks: Number(req.body.AdTermWeeks) || 0,
        closed: typeof req.body.AdTermClosed === "boolean" ? req.body.AdTermClosed : undefined });
    scopedTermsCache.clear();
    res.json(updated);
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

app.delete("/api/terms/:id", requirePermission(5), async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  // Legacy SQL has FSchedule -> AdTerm FK. Deleting a term that still owns schedule
  // rows would orphan them (dangling AdTermId, invisible in every term-scoped read,
  // and it shifts currentTerm/isTermClosed against a now-missing term). Block it.
  if (await Repository.hasSchedulesForTerm(id)) {
    res.status(409).json({ error: "لا يمكن حذف الفصل الدراسي لوجود بيانات مرتبطة به في الجدول الدراسي" });
    return;
  }
  await Repository.deleteTerm(id);
  scopedTermsCache.clear();
  res.json({ success: true });
});

app.get("/api/degree-rules", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  /* قواعدُ أقسام النطاق وحدها — كقائمة الأقسام نفسها (/api/sections). */
  const [allSections,stored]=await Promise.all([Repository.getSections(),Repository.getDegreeRules()]);
  const sections=filterByScope(req,allSections as any[]);
  const byId=new Map(stored.map(row=>[Number(row.AdSectionId),row]));
  res.json(await Promise.all(sections.map((section:any)=>{
    const saved=byId.get(Number(section.AdSectionId));
    /* An unsaved row is a SUGGESTION from the department name, and says so.
       Marking it reviewed made the screen present it as the current rule while
       graduate proof (which requires a saved rule) refused every student. */
    const fixed=degreeRuleFromName(String(section.AdSectionName||""));
    const rule=saved||{...fixed,AdSectionId:section.AdSectionId,updatedAt:"",updatedBy:""};
    return{...rule,AdSectionId:section.AdSectionId,AdCollegeId:section.AdCollegeId,AdSectionName:section.AdSectionName,reviewed:Boolean(saved),suggested:!saved};
  }).map(async(row:any)=>{
    /* A department in its transition years is judged per curriculum plan; the
       screen shows those rules instead of one department figure. */
    const plans=await Repository.getCurriculumPlans(Number(row.AdSectionId));
    if(!plans.some(plan=>plan.status!=="archived"&&!plan.virtual))return row;
    return{...row,plans:await graduationCandidatesForSection(Number(row.AdSectionId))};
  })));
});

app.put("/api/degree-rules/:sectionId", requirePermission(4), async (req: AuthenticatedRequest, res: Response) => {
  const sectionId=Number(req.params.sectionId||0);
  const sections=await Repository.getSections();
  const target=sections.find((row:any)=>Number(row.AdSectionId)===sectionId);
  if(!target){res.status(404).json({error:"القسم غير موجود"});return;}
  /* كتعديل القسم نفسه (PUT /api/sections/:id): في النطاق وحده. */
  if(!isScopeAllowed(req,Number((target as any).AdCollegeId),sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  /* A department in its transition years is measured per plan; a department
     figure saved now would be read by nobody, while the screen said it applied. */
  if((await Repository.getCurriculumPlans(sectionId)).some(plan=>plan.status!=="archived"&&!plan.virtual)){
    res.status(409).json({error:"هذا القسم في مرحلة انتقالية: شروط التخرج تُحفظ لكل صحيفة من «المقررات ← الصحائف الأكاديمية».",code:"rules-per-plan"});return;
  }
  const existingRule=(await Repository.getDegreeRules()).find(row=>Number(row.AdSectionId)===sectionId);
  const sectionName=String(sections.find((row:any)=>Number(row.AdSectionId)===sectionId)?.AdSectionName||"");
  const input=readDegreeRuleInput(req.body,Number(existingRule?.fieldTrainingRequired||degreeRuleFromName(sectionName).fieldTrainingRequired));
  if("error" in input){res.status(400).json({error:input.error});return;}
  const{degreeUnits,fieldTrainingRequired,graduateRegularPassed,graduateSummerPassed}=input.rule;
  const saved=await Repository.saveDegreeRule({
    AdSectionId:sectionId,degreeUnits,fieldTrainingRequired,graduateRegularPassed,graduateSummerPassed,
    updatedAt:new Date().toISOString(),updatedBy:String(req.user?.Name||""),
  });
  /* The public survey tells each department whether graduate proof is open;
     a just-saved rule must not wait out the payload cache. */
  surveyPayloadCache.clear();
  res.json(saved);
});
}
