/**
 * ── المقرراتُ والخططُ الدراسية وأنواعُ القاعات ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { Response } from "express";
import { DuplicateResourceError, Repository } from "../../db/repository";
import { roomTypeSiblingIds } from "../../utils/courseRoomTypeSync";
import { toEnglishDigits } from "../../utils/digits";
import { normalizeArabicText } from "../../utils/arabicText";
import type { AdCourse, CurriculumDegreeRule } from "../../types";
import { roleDefinition } from "../../utils/academicRoles";
import { AR, countOf } from "../../utils/arabicCount";
import { readDegreeRuleInput } from "../../utils/degreeRules";
import { type AuthenticatedRequest, isPowerUser, requireAnyPermission, requirePermission, requireRootAdmin } from "../core/auth";
import { boundedInt, cleanText, TEXT_LIMIT } from "../core/input";
import { invalidateLocationRegistry, readLocationRegistry } from "../core/locations";
import { sortCoursesByName, sortTermsNewestServer } from "../core/ordering";
import { filterByScope, isScopeAllowed } from "../core/scope";
import { degreeRuleFromName, planDegreeRule, storedDegreeRuleForSection, surveyPayloadCache } from "../core/studentIdentity";
import { sheetSidesFor } from "../planBadgeShared";

/** Same, but a decimal is legitimate (teaching hours run 1.5, 2.5 …). */
function boundedDecimal(value: unknown, min: number, max: number, fallback: number | null = null): number | null {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(toEnglishDigits(value).trim());
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  // Quarter-hour granularity is the finest the timetable can express.
  return Math.round(parsed * 100) / 100;
}

/* Course numbers, bounded by what a real course can be. MaxStudent is capped at
   200 by institutional rule — a section larger than that is a data-entry slip,
   not a class. */
const COURSE_LIMIT = { credit: [0, 20], hours: [0, 40], students: [0, 200] } as const;

/** One sentence naming the field that is wrong — or null when all three are fine. */
function courseNumberIssue(credit: number | null, hours: number | null, students: number | null): string | null {
  if (credit === null) return `عدد الوحدات يجب أن يكون رقماً صحيحاً بين ${COURSE_LIMIT.credit[0]} و${COURSE_LIMIT.credit[1]}`;
  if (hours === null) return `عدد الساعات يجب أن يكون رقماً بين ${COURSE_LIMIT.hours[0]} و${COURSE_LIMIT.hours[1]}`;
  if (students === null) return `عدد الطلبة يجب أن يكون رقماً صحيحاً بين ${COURSE_LIMIT.students[0]} و${COURSE_LIMIT.students[1]}`;
  return null;
}

async function curriculumOverview(sectionId:number){
  const [section,courses,plans,memberships,transitions]=await Promise.all([
    Repository.getSectionById(sectionId),Repository.getCoursesBySection(sectionId),Repository.getCurriculumPlans(sectionId),Repository.getCurriculumPlanCourses(sectionId),Repository.getCourseTransitions(sectionId),
  ]);
  if(!section)return null;
  if(!plans.length){
    const virtualId=`virtual:${sectionId}`;
    const virtual={id:virtualId,AdCollegeId:section.AdCollegeId,AdSectionId:sectionId,name:"الصحيفة الحالية",code:"CURRENT",status:"transition",virtual:true,createdAt:""};
    const sectionRule=await storedDegreeRuleForSection(sectionId);
    return{section,plans:[virtual],memberships:courses.map(course=>({id:`${virtualId}_${course.AdCourseId}`,planId:virtualId,AdCollegeId:section.AdCollegeId,AdSectionId:sectionId,AdCourseId:course.AdCourseId,createdAt:""})),transitions,courses,operationalCourseIds:courses.map(course=>course.AdCourseId),bootstrap:true,planRules:{[virtualId]:{rule:sectionRule,inherited:Boolean(sectionRule)}}};
  }
  const livePlanIds=new Set(plans.filter(plan=>plan.status!=="archived").map(plan=>plan.id));
  const operationalCourseIds=[...new Set(memberships.filter(row=>livePlanIds.has(row.planId)).map(row=>Number(row.AdCourseId)))];
  /* The rule each plan's graduates are measured by, resolved by the same
     function the survey uses — the screen never shows a different answer. */
  const sectionRule=await storedDegreeRuleForSection(sectionId);
  const planRules=Object.fromEntries(plans.map(plan=>[plan.id,{rule:planDegreeRule(plan,sectionRule),inherited:!plan.degreeRule&&Boolean(planDegreeRule(plan,sectionRule))}]));
  return{section,plans,memberships,transitions,courses,operationalCourseIds,bootstrap:false,planRules};
}

async function curriculumArchiveReadiness(sectionId:number,planId:string){
  const section=await Repository.getSectionById(sectionId);
  if(!section)throw new Error("القسم غير موجود");
  const [plans,memberships,terms]=await Promise.all([Repository.getCurriculumPlans(sectionId),Repository.getCurriculumPlanCourses(sectionId),Repository.getTerms()]);
  const plan=plans.find(row=>row.id===planId);
  if(!plan)throw new Error("الصحيفة غير موجودة");
  const latestTermId=Number(sortTermsNewestServer(terms)[0]?.AdTermId||0);
  const courseIds=new Set(memberships.filter(row=>row.planId===plan.id).map(row=>Number(row.AdCourseId)));
  const otherLivePlanIds=new Set(plans.filter(row=>row.id!==plan.id&&row.status!=="archived").map(row=>row.id));
  const sharedElsewhere=new Set(memberships.filter(row=>otherLivePlanIds.has(row.planId)).map(row=>Number(row.AdCourseId)));
  const oldOnlyCourseIds=new Set([...courseIds].filter(id=>!sharedElsewhere.has(id)));
  const [currentRows,needs]=await Promise.all([
    latestTermId?Repository.getSchedulesByScope({sectionId,termId:latestTermId}):Promise.resolve([]),
    latestTermId?Repository.getStudentNeeds(section.AdCollegeId,0,latestTermId):Promise.resolve([]),
  ]);
  const currentOfferings=currentRows.filter(row=>oldOnlyCourseIds.has(Number(row.AdCourseId))).length;
  const linkedStudentRequests=needs.filter(row=>String(row.curriculumPlanId||"")===plan.id||(row.courseIds||[]).some(id=>oldOnlyCourseIds.has(Number(id)))).length;
  return{section,plan,readiness:{
    currentOfferings,linkedStudentRequests,latestTermId,
    totalCourses:courseIds.size,oldOnlyCourses:oldOnlyCourseIds.size,sharedCourses:courseIds.size-oldOnlyCourseIds.size,
    ready:currentOfferings===0&&linkedStudentRequests===0,
  }};
}

/** Committee corrections are available only while its own curriculum is a draft awaiting review. */
async function committeeCatalogEditAllowed(req: AuthenticatedRequest, sectionId: number): Promise<boolean> {
  /* مدير النظام لا يُقيَّد بنافذة المراجعة: قيدُها لرؤساء اللجان. وحسابُه بلا دورٍ محدّد يقع افتراضياً
     على «رئيس لجنة الجدول»، فكان يُمنع من تعديل المقررات خارج المراجعة كأنه رئيس لجنة. */
  if (req.user?.IsAdminUser) return true;
  if (roleDefinition(req.user?.Role).id !== "committeeChair") return true;
  const section = await Repository.getSectionById(sectionId);
  if (!section || !isScopeAllowed(req, Number(section.AdCollegeId), sectionId)) return false;
  const plans = await Repository.getCurriculumPlans(sectionId);
  for (const plan of plans) if ((await Repository.getRuleDraft(plan.id))?.status === "review") return true;
  return false;
}
function refuseCommitteeCatalogEdit(res: Response): void {
  res.status(409).json({ error: "تعديل بيانات القسم متاح أثناء مراجعة مسوّدة الصحيفة فقط؛ أكمل النواقص قبل اعتمادها." });
}

export function registerCoursesRoutes(app: Express): void {

/**
 * The course catalogue.
 *
 * The record is already lean — code, name, credit, hours, capacity — so there
 * is nothing to trim per field. What was expensive was the *number* of records:
 * screens asked for all 1,400 courses in the university to resolve the handful
 * belonging to one department. Passing `sectionId` answers with that department
 * alone, which is the same information at a fortieth of the size.
 */
app.get("/api/location-room-types", requireAnyPermission([6, 7]), async (req:AuthenticatedRequest,res:Response)=>{
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0);
  if(collegeId&&sectionId&&!isScopeAllowed(req,collegeId,sectionId)&&!isPowerUser(req)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const registry=await readLocationRegistry();
  const configured=await Repository.getLocationRoomTypes();
  const types=new Set(configured.length?configured:["تدريسية","مختبر","مختبر حاسوب"]);
  for(const room of registry.rooms){
    if(!room.active||room.confidence!=="CONFIRMED")continue;
    if(sectionId&&!room.sectionIds.includes(sectionId))continue;
    if(!sectionId&&collegeId&&!room.collegeIds.includes(collegeId))continue;
    const type=String(room.roomType||"").normalize("NFKC").trim();if(type)types.add(type);
  }
  res.json({types:[...types].sort((a,b)=>a.localeCompare(b,"ar"))});
});

app.get("/api/admin/location-room-types",requirePermission(7),requireRootAdmin,async(_req:AuthenticatedRequest,res:Response)=>{
  const [configured,registry,courses]=await Promise.all([Repository.getLocationRoomTypes(),readLocationRegistry(),Repository.getCourses()]);
  const types=new Set(configured.length?configured:["تدريسية","مختبر","مختبر حاسوب"]);
  registry.rooms.forEach(room=>{const type=String(room.roomType||"").normalize("NFKC").trim();if(type)types.add(type);});
  courses.forEach(course=>{const type=String(course.CourseRoomType||"").normalize("NFKC").trim();if(type)types.add(type);});
  courses.forEach(course=>{const type=String(course.CourseCompanionRoomType||"").normalize("NFKC").trim();if(type)types.add(type);});
  res.json({types:[...types].sort((a,b)=>a.localeCompare(b,"ar"))});
});
app.post("/api/admin/location-room-types",requirePermission(7),requireRootAdmin,async(req:AuthenticatedRequest,res:Response)=>{
  const name=String(req.body?.name||"").normalize("NFKC").trim();
  if(!name||name.length>60){res.status(400).json({error:"أدخل اسم نوع من حرف إلى 60 حرفًا."});return;}
  const [configured,registry,courses]=await Promise.all([Repository.getLocationRoomTypes(),readLocationRegistry(),Repository.getCourses()]);
  const types=new Set(configured.length?configured:["تدريسية","مختبر","مختبر حاسوب"]);
  registry.rooms.forEach(room=>{const type=String(room.roomType||"").normalize("NFKC").trim();if(type)types.add(type);});
  courses.forEach(course=>{const type=String(course.CourseRoomType||"").normalize("NFKC").trim();if(type)types.add(type);});
  courses.forEach(course=>{const type=String(course.CourseCompanionRoomType||"").normalize("NFKC").trim();if(type)types.add(type);});
  if([...types].some(type=>type.toLocaleLowerCase("ar")===name.toLocaleLowerCase("ar"))){res.status(409).json({error:"هذا النوع موجود مسبقًا."});return;}
  types.add(name);await Repository.setLocationRoomTypes([...types]);
  res.status(201).json({types:[...types].sort((a,b)=>a.localeCompare(b,"ar"))});
});
app.put("/api/admin/location-room-types/:type",requirePermission(7),requireRootAdmin,async(req:AuthenticatedRequest,res:Response)=>{
  const oldName=String(req.params.type||"").normalize("NFKC").trim(),newName=String(req.body?.name||"").normalize("NFKC").trim();
  if(!oldName||!newName||newName.length>60){res.status(400).json({error:"أدخل اسم نوع من حرف إلى 60 حرفًا."});return;}
  const [configured,registry,courses]=await Promise.all([Repository.getLocationRoomTypes(),readLocationRegistry(),Repository.getCourses()]);
  const types=new Set(configured.length?configured:["تدريسية","مختبر","مختبر حاسوب"]);
  registry.rooms.forEach(room=>{const type=String(room.roomType||"").normalize("NFKC").trim();if(type)types.add(type);});
  courses.forEach(course=>{const type=String(course.CourseRoomType||"").normalize("NFKC").trim();if(type)types.add(type);});
  courses.forEach(course=>{const type=String(course.CourseCompanionRoomType||"").normalize("NFKC").trim();if(type)types.add(type);});
  if(!types.has(oldName)){res.status(404).json({error:"نوع القاعة غير موجود."});return;}
  if([...types].some(type=>type!==oldName&&type.toLocaleLowerCase("ar")===newName.toLocaleLowerCase("ar"))){res.status(409).json({error:"يوجد نوع آخر بهذا الاسم."});return;}
  if(oldName===newName){res.json({types:[...types].sort((a,b)=>a.localeCompare(b,"ar")),updatedRooms:0,updatedCourses:0});return;}
  const now=new Date().toISOString();
  const changedRooms=registry.rooms.filter(room=>String(room.roomType||"").normalize("NFKC").trim()===oldName).map(room=>({...room,roomType:newName,updatedAt:now,auditHistory:[...(room.auditHistory||[]),{at:now,byUserId:req.user.SystemUserId,action:"UPDATE"}]}));
  const updatedCourses=await Repository.renameCourseRoomType(oldName,newName);
  await Repository.upsertLocationRooms(changedRooms);
  types.delete(oldName);types.add(newName);await Repository.setLocationRoomTypes([...types]);invalidateLocationRegistry();
  res.json({types:[...types].sort((a,b)=>a.localeCompare(b,"ar")),updatedRooms:changedRooms.length,updatedCourses});
});

app.delete("/api/admin/location-room-types/:type",requirePermission(7),requireRootAdmin,async(req:AuthenticatedRequest,res:Response)=>{
  const name=String(req.params.type||"").normalize("NFKC").trim();
  if(!name){res.status(400).json({error:"اختر نوع القاعة المراد حذفه."});return;}
  const [configured,registry,courses]=await Promise.all([Repository.getLocationRoomTypes(),readLocationRegistry(),Repository.getCourses()]);
  const types=new Set(configured.length?configured:["تدريسية","مختبر","مختبر حاسوب"]);
  registry.rooms.forEach(room=>{const type=String(room.roomType||"").normalize("NFKC").trim();if(type)types.add(type);});
  courses.forEach(course=>{const type=String(course.CourseRoomType||"").normalize("NFKC").trim();if(type)types.add(type);});
  courses.forEach(course=>{const type=String(course.CourseCompanionRoomType||"").normalize("NFKC").trim();if(type)types.add(type);});
  if(!types.has(name)){res.status(404).json({error:"نوع القاعة غير موجود."});return;}
  const linkedRooms=registry.rooms.filter(room=>String(room.roomType||"").normalize("NFKC").trim()===name).length;
  const linkedCourses=courses.filter(course=>[course.CourseRoomType,course.CourseCompanionRoomType].some(type=>String(type||"").normalize("NFKC").trim()===name)).length;
  if(linkedRooms||linkedCourses){res.status(409).json({error:`لا يمكن حذف «${name}» لأنه مرتبط بـ ${countOf(linkedRooms,AR.room)} و${countOf(linkedCourses,AR.course)}. غيّر ارتباطاتها أولاً.`});return;}
  if(types.size<=1){res.status(409).json({error:"أبقِ نوعًا واحدًا على الأقل للقاعات."});return;}
  types.delete(name);await Repository.setLocationRoomTypes([...types]);
  res.json({types:[...types].sort((a,b)=>a.localeCompare(b,"ar")),deleted:name});
});

app.get("/api/courses", requireAnyPermission([6, 7, 8, 9, 10, 14, 16, 17]), async (req: AuthenticatedRequest, res: Response) => {
  const sectionId = req.query.sectionId ? parseInt(req.query.sectionId as string) : undefined;
  const operational = String(req.query.operational || "") === "1";
  let courses = sectionId
    ? (operational ? await Repository.getOperationalCoursesBySection(sectionId) : await Repository.getCoursesBySection(sectionId))
    : await Repository.getCourses();
  courses = filterByScope(req, courses);
  if(operational&&!sectionId){
    const sectionIds=[...new Set(courses.map(course=>Number(course.AdSectionId)).filter(Boolean))];
    const sets=await Promise.all(sectionIds.map(async sid=>[sid,await Repository.getOperationalCourseIds(sid)] as const));
    const bySection=new Map(sets);
    courses=courses.filter(course=>bySection.get(Number(course.AdSectionId))?.has(Number(course.AdCourseId)));
  }
  if(String(req.query.plans||"")==="1"){
    /* Which live curriculum each course belongs to, so the catalogue can say
       «الصحيفة الجديدة» or «السابقة» beside it and filter by it. A department
       without plans gets no tag: everything there is simply current. */
    const sectionIds=[...new Set(courses.map(course=>Number(course.AdSectionId)).filter(Boolean))];
    const tags=new Map<number,{id:string;name:string;status:string}[]>();
    await Promise.all(sectionIds.map(async sid=>{
      const [plans,memberships]=await Promise.all([Repository.getCurriculumPlans(sid),Repository.getCurriculumPlanCourses(sid)]);
      const live=new Map(plans.filter(plan=>plan.status!=="archived").map(plan=>[plan.id,plan]));
      if(!live.size)return;
      for(const row of memberships){
        const plan=live.get(row.planId);if(!plan)continue;
        const list=tags.get(Number(row.AdCourseId))||[];
        if(!list.some(tag=>tag.id===plan.id))list.push({id:plan.id,name:plan.name,status:plan.status});
        tags.set(Number(row.AdCourseId),list);
      }
    }));
    /* A service course (مقدمة في تكنولوجيا التعليم…) sits in no sheet of its
       own department, yet other departments' live sheets require it. Its
       owner schedules it, so the catalogue names who needs it instead of
       leaving it untagged and hidden by the sheet filter. */
    const ruleSets=await Repository.listRuleSets();
    const sectionNames=new Map((await Repository.getSections()).map(row=>[Number(row.AdSectionId),String(row.AdSectionName||"")]));
    const wanted=new Set(courses.map(course=>Number(course.AdCourseId)));
    const ownerOf=new Map(courses.map(course=>[Number(course.AdCourseId),Number(course.AdSectionId)]));
    const livePlans=new Map<string,boolean>();
    const isLive=async(rule:{planId:string;AdSectionId:number})=>{
      if(!livePlans.has(rule.planId)){
        const plans=await Repository.getCurriculumPlans(Number(rule.AdSectionId));
        plans.forEach(plan=>livePlans.set(plan.id,plan.status!=="archived"));
        if(!livePlans.has(rule.planId))livePlans.set(rule.planId,false);
      }
      return livePlans.get(rule.planId);
    };
    const serviceFor=new Map<number,Set<string>>();
    for(const rule of ruleSets){
      const hits=(rule.externals||[]).map(Number).filter(id=>wanted.has(id)&&ownerOf.get(id)!==Number(rule.AdSectionId));
      if(!hits.length||!await isLive(rule))continue;
      const name=sectionNames.get(Number(rule.AdSectionId));if(!name)continue;
      for(const id of hits){const set=serviceFor.get(id)||new Set<string>();set.add(name);serviceFor.set(id,set);}
    }
    /* جهةُ كل مقرر (الجديدة/القديمة/الاثنتان) من عضوية الصحيفة الواحدة — المصدرُ نفسه الذي يكتب وسم «صحيفة 2026»؛
       فلا يقع مقررٌ موسومٌ «صحيفة 2026» في تبويب القديمة («كل المقررات»، محاكي الشعب). قسمٌ بلا الصحيفتين: كما كان. */
    const sideBySection=new Map<number,Record<number,string>|null>();
    await Promise.all(sectionIds.map(async sid=>{sideBySection.set(sid,await sheetSidesFor(sid,courses.filter(course=>Number(course.AdSectionId)===sid).map(course=>Number(course.AdCourseId))));}));
    courses=courses.map(course=>{
      const id=Number(course.AdCourseId),service=serviceFor.get(id),sides=sideBySection.get(Number(course.AdSectionId));
      const tagged:any=tags.has(id)?{...course,curriculum:tags.get(id)}:{...course};
      if(sides)tagged.sheetSide=sides[id]||null;
      return service?{...tagged,serviceFor:[...service].sort((a,b)=>a.localeCompare(b,"ar"))}:tagged;
    }) as any;
  }
  res.json(sortCoursesByName(courses));
});

app.get("/api/curriculum/sections/:sectionId", requirePermission(6), async (req:AuthenticatedRequest,res:Response)=>{
  const sectionId=Number(req.params.sectionId||0),section=await Repository.getSectionById(sectionId);
  if(!section){res.status(404).json({error:"القسم العلمي غير موجود"});return;}
  if(!req.user.IsAdminUser&&!isScopeAllowed(req,section.AdCollegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const overview=await curriculumOverview(sectionId);res.json(overview);
});

app.post("/api/curriculum/plans", requirePermission(6), async (req:AuthenticatedRequest,res:Response)=>{
  const sectionId=Number(req.body?.AdSectionId||0),section=await Repository.getSectionById(sectionId);
  const name=cleanText(req.body?.name,TEXT_LIMIT.name),code=cleanText(req.body?.code,TEXT_LIMIT.code);
  if(!section||!name){res.status(400).json({error:"حدد القسم واكتب اسم الصحيفة"});return;}
  if(!req.user.IsAdminUser&&!isScopeAllowed(req,section.AdCollegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const plan=await Repository.createCurriculumPlan({collegeId:section.AdCollegeId,sectionId,name,code,by:String(req.user.Name||"")});
  res.status(201).json({plan,overview:await curriculumOverview(sectionId)});
});

/** Rename a plan, or set the graduation rule its students are measured by. */
app.put("/api/curriculum/plans/:planId", requirePermission(6), async (req:AuthenticatedRequest,res:Response)=>{
  const sectionId=Number(req.body?.AdSectionId||0),section=await Repository.getSectionById(sectionId);
  if(!section){res.status(404).json({error:"القسم غير موجود"});return;}
  if(!req.user.IsAdminUser&&!isScopeAllowed(req,section.AdCollegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const planId=String(req.params.planId||""),plans=await Repository.getCurriculumPlans(sectionId),plan=plans.find(row=>row.id===planId);
  if(!plan){res.status(404).json({error:"الصحيفة غير موجودة"});return;}
  const patch:{name?:string;degreeRule?:CurriculumDegreeRule}={};
  if(req.body?.name!==undefined){
    const name=cleanText(req.body.name,TEXT_LIMIT.name);
    if(!name){res.status(400).json({error:"اكتب اسم الصحيفة"});return;}
    if(plans.some(row=>row.id!==planId&&row.status!=="archived"&&row.name.trim()===name)){res.status(400).json({error:"يوجد في القسم صحيفة فعالة بهذا الاسم. اختر اسماً يميّزها، مثل سنة اعتمادها."});return;}
    patch.name=name;
  }
  /* `code` is not editable: «LEGACY» marks the plan that inherits the
     department's rule, and moving that mark would move whose rule it is. */
  if(req.body?.degreeRule){
    const sectionRule=await storedDegreeRuleForSection(sectionId);
    const current=planDegreeRule(plan,sectionRule);
    const input=readDegreeRuleInput(req.body.degreeRule,Number(current?.fieldTrainingRequired||degreeRuleFromName(String(section.AdSectionName||"")).fieldTrainingRequired));
    if("error" in input){res.status(400).json({error:input.error});return;}
    patch.degreeRule={...input.rule,updatedAt:new Date().toISOString(),updatedBy:String(req.user.Name||"")||undefined};
  }
  try{
    await Repository.updateCurriculumPlan(planId,sectionId,patch);
    /* The survey tells each department whether graduate proof is open. */
    if(patch.degreeRule)surveyPayloadCache.clear();
    res.json({overview:await curriculumOverview(sectionId)});
  }catch(error:any){res.status(400).json({error:String(error?.message||"تعذر تحديث الصحيفة")});}
});

app.post("/api/curriculum/plans/:planId/courses", requirePermission(6), async (req:AuthenticatedRequest,res:Response)=>{
  /* One course, or the handful that stayed unchanged in the new plan, in one
     request — ticking ten boxes should not mean ten round trips. */
  const ids=[...new Set((Array.isArray(req.body?.AdCourseIds)?req.body.AdCourseIds:[req.body?.AdCourseId]).map((id:any)=>Number(id)).filter((id:number)=>id>0))].slice(0,300) as number[];
  const courses=(await Promise.all(ids.map(id=>Repository.getCourseById(id)))).filter(Boolean) as any[];
  if(!courses.length||courses.length!==ids.length){res.status(404).json({error:"المقرر غير موجود"});return;}
  const sectionId=Number(courses[0].AdSectionId);
  if(courses.some(course=>Number(course.AdSectionId)!==sectionId)){res.status(400).json({error:"كل المقررات يجب أن تتبع قسم الصحيفة نفسه"});return;}
  if(!req.user.IsAdminUser&&!isScopeAllowed(req,courses[0].AdCollegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  try{
    for(const course of courses)await Repository.addCourseToCurriculumPlan(String(req.params.planId||""),course,String(req.user.Name||""));
    res.status(201).json({added:courses.length,overview:await curriculumOverview(sectionId)});
  }catch(error:any){res.status(400).json({error:String(error?.message||"تعذر إضافة المقرر إلى الصحيفة")});}
});

app.delete("/api/curriculum/plans/:planId/courses/:courseId", requirePermission(6), async (req:AuthenticatedRequest,res:Response)=>{
  const course=await Repository.getCourseById(Number(req.params.courseId||0));
  if(!course){res.status(404).json({error:"المقرر غير موجود"});return;}
  if(!req.user.IsAdminUser&&!isScopeAllowed(req,course.AdCollegeId,course.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const planId=String(req.params.planId||"");
  const [plans,memberships,terms]=await Promise.all([Repository.getCurriculumPlans(course.AdSectionId),Repository.getCurriculumPlanCourses(course.AdSectionId),Repository.getTerms()]);
  const plan=plans.find(row=>row.id===planId);
  if(!plan||plan.status==="archived"){res.status(400).json({error:"الصحيفة غير متاحة للتعديل"});return;}

  /* Removing a membership is an operational change, not just catalogue tidying.
     If this is the last live curriculum that carries the course, hiding it while
     it is already offered in the newest term would make the timetable contain a
     course that none of its pickers can see. Keep that impossible state out. */
  const otherLivePlanIds=new Set(plans.filter(row=>row.id!==planId&&row.status!=="archived").map(row=>row.id));
  const remainsOperational=memberships.some(row=>Number(row.AdCourseId)===Number(course.AdCourseId)&&otherLivePlanIds.has(row.planId));
  if(!remainsOperational){
    const latestTermId=Number(sortTermsNewestServer(terms)[0]?.AdTermId||0);
    const rows=latestTermId?await Repository.getSchedulesByScope({sectionId:course.AdSectionId,termId:latestTermId}):[];
    if(rows.some(row=>Number(row.AdCourseId)===Number(course.AdCourseId))){
      res.status(409).json({error:"لا يمكن إزالة المقرر من آخر صحيفة فعالة له وهو مطروح في أحدث فصل. أزل الطرح أو اربطه بصحيفة فعالة أخرى أولاً."});
      return;
    }
  }
  await Repository.removeCourseFromCurriculumPlan(planId,course.AdCourseId);res.json({success:true,overview:await curriculumOverview(course.AdSectionId)});
});

app.post("/api/curriculum/transitions", requirePermission(6), async (req:AuthenticatedRequest,res:Response)=>{
  const sectionId=Number(req.body?.AdSectionId||0),section=await Repository.getSectionById(sectionId);
  if(!section){res.status(404).json({error:"القسم غير موجود"});return;}
  if(!req.user.IsAdminUser&&!isScopeAllowed(req,section.AdCollegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const plans=await Repository.getCurriculumPlans(sectionId),fromPlanId=String(req.body?.fromPlanId||""),toPlanId=String(req.body?.toPlanId||"");
  const fromCourseId=Number(req.body?.fromCourseId||0),toCourseId=Number(req.body?.toCourseId||0)||undefined;
  const kind=String(req.body?.kind||"");
  const kinds=new Set(["renumbered","renamed","renumbered-renamed","replaced","removed"]);
  if(!plans.some(row=>row.id===fromPlanId)||!plans.some(row=>row.id===toPlanId)||!fromCourseId||!kinds.has(kind)){res.status(400).json({error:"بيانات علاقة الانتقال غير مكتملة"});return;}
  if(kind!=="removed"&&!toCourseId){res.status(400).json({error:"اختر المقرر المقابل في الصحيفة الجديدة"});return;}
  const [fromCourse,toCourse,memberships]=await Promise.all([Repository.getCourseById(fromCourseId),toCourseId?Repository.getCourseById(toCourseId):Promise.resolve(undefined),Repository.getCurriculumPlanCourses(sectionId)]);
  if(!fromCourse||Number(fromCourse.AdSectionId)!==sectionId||(toCourseId&&(!toCourse||Number(toCourse.AdSectionId)!==sectionId))){res.status(400).json({error:"المقرر لا يتبع القسم المحدد"});return;}
  if(!memberships.some(row=>row.planId===fromPlanId&&Number(row.AdCourseId)===fromCourseId)){res.status(400).json({error:"المقرر القديم لا يتبع الصحيفة الانتقالية المحددة"});return;}
  if(toCourseId&&!memberships.some(row=>row.planId===toPlanId&&Number(row.AdCourseId)===toCourseId)){res.status(400).json({error:"المقرر الجديد لا يتبع الصحيفة الحالية المحددة"});return;}
  /* One old course has one meaning in a specific generation jump. Re-saving it
     is an edit (upsert), not a second competing relationship. This keeps the
     transition map deterministic for reports, archive checks and future tooling. */
  const existingTransitions=await Repository.getCourseTransitions(sectionId);
  for(const existing of existingTransitions.filter(row=>row.fromPlanId===fromPlanId&&row.toPlanId===toPlanId&&Number(row.fromCourseId)===fromCourseId)){
    await Repository.deleteCourseTransition(existing.id);
  }
  const transition=await Repository.saveCourseTransition({AdCollegeId:section.AdCollegeId,AdSectionId:sectionId,fromPlanId,toPlanId,fromCourseId,toCourseId,kind:kind as any,note:cleanText(req.body?.note,300)||undefined,createdBy:String(req.user.Name||"")||undefined});
  res.status(201).json({transition,overview:await curriculumOverview(sectionId)});
});

app.delete("/api/curriculum/transitions/:id", requirePermission(6), async (req:AuthenticatedRequest,res:Response)=>{
  const id=String(req.params.id||""),transition=await Repository.getCourseTransitionById(id);
  if(!transition){res.status(404).json({error:"علاقة الانتقال غير موجودة"});return;}
  if(!req.user.IsAdminUser&&!isScopeAllowed(req,transition.AdCollegeId,transition.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  await Repository.deleteCourseTransition(id);res.json({success:true});
});

app.get("/api/curriculum/plans/:planId/archive-readiness", requirePermission(6), async (req:AuthenticatedRequest,res:Response)=>{
  const sectionId=Number(req.query?.sectionId||0),section=await Repository.getSectionById(sectionId);
  if(!section){res.status(404).json({error:"القسم غير موجود"});return;}
  if(!req.user.IsAdminUser&&!isScopeAllowed(req,section.AdCollegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  try{const result=await curriculumArchiveReadiness(sectionId,String(req.params.planId||""));res.json(result);}catch(error:any){res.status(404).json({error:String(error?.message||"تعذر فحص جاهزية الصحيفة")});}
});

app.post("/api/curriculum/plans/:planId/archive", requirePermission(6), async (req:AuthenticatedRequest,res:Response)=>{
  const sectionId=Number(req.body?.AdSectionId||0),section=await Repository.getSectionById(sectionId);
  if(!section){res.status(404).json({error:"القسم غير موجود"});return;}
  if(!req.user.IsAdminUser&&!isScopeAllowed(req,section.AdCollegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  try{
    const checked=await curriculumArchiveReadiness(sectionId,String(req.params.planId||""));
    if(!checked.readiness.ready&&String(req.body?.force||"")!=="1"){
      res.status(409).json({error:"لا تزال الصحيفة مستخدمة في أحدث فصل. راجع التفاصيل قبل الأرشفة.",readiness:checked.readiness});return;
    }
    const archived=await Repository.archiveCurriculumPlan(checked.plan.id,sectionId,String(req.user.Name||""));
    res.json({archived,readiness:checked.readiness,overview:await curriculumOverview(sectionId)});
  }catch(error:any){
    const message=String(error?.message||"تعذر أرشفة الصحيفة");
    res.status(message.includes("غير موجود")?404:400).json({error:message});
  }
});

app.post("/api/courses", requirePermission(6), async (req: AuthenticatedRequest, res: Response) => {
  const CourseCode = cleanText(req.body?.CourseCode, TEXT_LIMIT.code);
  const CourseName = cleanText(req.body?.CourseName, TEXT_LIMIT.name);
  const collegeIdInput = boundedInt(req.body?.AdCollegeId, 1, Number.MAX_SAFE_INTEGER) ?? 0;
  const sectionIdInput = boundedInt(req.body?.AdSectionId, 1, Number.MAX_SAFE_INTEGER) ?? 0;

  if (!collegeIdInput || !sectionIdInput || !CourseCode || !CourseName) {
    res.status(400).json({ error: "الرجاء إدخال الحقول المطلوبة بالأحمر" });
    return;
  }
  /* Numbers are numbers. `parseInt("abc")` is NaN, and NaN passes a truthiness
     test — that is how a course could be stored with no readable credit and
     poison every workload sum that later reads it. */
  const CourseCredit = boundedInt(req.body?.CourseCredit, COURSE_LIMIT.credit[0], COURSE_LIMIT.credit[1]);
  const CourseHours = boundedDecimal(req.body?.CourseHours, COURSE_LIMIT.hours[0], COURSE_LIMIT.hours[1]);
  const MaxStudent = boundedInt(req.body?.MaxStudent, COURSE_LIMIT.students[0], COURSE_LIMIT.students[1], 0);
  const CourseRoomType=String(req.body?.CourseRoomType||"").normalize("NFKC").trim();if(CourseRoomType.length>60){res.status(400).json({error:"نوع القاعة المناسب لا يتجاوز 60 حرفًا."});return;}
  const CourseCompanionRoomType=String(req.body?.CourseCompanionRoomType||"").normalize("NFKC").trim();
  if(CourseCompanionRoomType.length>60){res.status(400).json({error:"نوع المرفق المرافق لا يتجاوز 60 حرفًا."});return;}
  const CourseTeachingMode=String(req.body?.CourseTeachingMode||"").trim() as AdCourse["CourseTeachingMode"] | "";
  if(CourseTeachingMode&&!['theoretical','applied','practical','field_training'].includes(CourseTeachingMode)){res.status(400).json({error:"طبيعة تدريس المقرر غير معروفة."});return;}
  const numberIssue = courseNumberIssue(CourseCredit, CourseHours, MaxStudent);
  if (numberIssue) { res.status(400).json({ error: numberIssue }); return; }

  // Legacy only blocked non-English typing in the browser. The SQL column itself is text and
  // the real database contains historical course codes with tabs/whitespace, so the API must
  // preserve those values when an old record is edited. The modern UI still enforces English
  // numeric typing for newly-entered codes.

  const collegeId = collegeIdInput, sectionId = sectionIdInput;
  const section = await Repository.getSectionById(sectionId);
  if (!section || section.AdCollegeId !== collegeId) {
    res.status(400).json({ error: "القسم العلمي المختار لا يتبع الكلية المختارة" });
    return;
  }
  if (!isScopeAllowed(req, collegeId, sectionId) && !req.user.IsAdminUser) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  if (!await committeeCatalogEditAllowed(req, sectionId)) { refuseCommitteeCatalogEdit(res); return; }

  /* Uniqueness of the course code inside its department is claimed inside the
     write transaction, so a double-submitted form is refused by the database
     rather than by a read that both requests passed. */
  try {
    const newC = await Repository.createCourse(
      collegeId,
      sectionId,
      CourseCode,
      CourseName,
      CourseCredit!,
      CourseHours!,
      MaxStudent!,
      true,
      CourseRoomType,
      CourseTeachingMode || undefined,
      CourseCompanionRoomType
    );
    res.status(201).json(newC);
  } catch (error) {
    if (error instanceof DuplicateResourceError) { res.status(400).json({ error: error.message }); return; }
    throw error;
  }
});

app.put("/api/courses/:id", requirePermission(6), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const CourseCode = cleanText(req.body?.CourseCode, TEXT_LIMIT.code);
  const CourseName = cleanText(req.body?.CourseName, TEXT_LIMIT.name);
  const collegeIdInput = boundedInt(req.body?.AdCollegeId, 1, Number.MAX_SAFE_INTEGER) ?? 0;
  const sectionIdInput = boundedInt(req.body?.AdSectionId, 1, Number.MAX_SAFE_INTEGER) ?? 0;

  if (!collegeIdInput || !sectionIdInput || !CourseCode || !CourseName) {
    res.status(400).json({ error: "الرجاء إدخال الحقول المطلوبة بالأحمر" });
    return;
  }
  const CourseCredit = boundedInt(req.body?.CourseCredit, COURSE_LIMIT.credit[0], COURSE_LIMIT.credit[1]);
  const CourseHours = boundedDecimal(req.body?.CourseHours, COURSE_LIMIT.hours[0], COURSE_LIMIT.hours[1]);
  const MaxStudent = boundedInt(req.body?.MaxStudent, COURSE_LIMIT.students[0], COURSE_LIMIT.students[1], 0);
  const CourseRoomType=String(req.body?.CourseRoomType||"").normalize("NFKC").trim();if(CourseRoomType.length>60){res.status(400).json({error:"نوع القاعة المناسب لا يتجاوز 60 حرفًا."});return;}
  const CourseCompanionRoomType=req.body?.CourseCompanionRoomType===undefined?undefined:String(req.body.CourseCompanionRoomType||"").normalize("NFKC").trim();
  if(CourseCompanionRoomType!==undefined&&CourseCompanionRoomType.length>60){res.status(400).json({error:"نوع المرفق المرافق لا يتجاوز 60 حرفًا."});return;}
  const CourseTeachingMode=req.body?.CourseTeachingMode === undefined ? undefined : String(req.body.CourseTeachingMode).trim() as AdCourse["CourseTeachingMode"] | "";
  if(CourseTeachingMode&&!['theoretical','applied','practical','field_training'].includes(CourseTeachingMode)
    && !(CourseTeachingMode==="mixed"&&String((await Repository.getCourseById(id))?.CourseTeachingMode||"")==="mixed")){
    res.status(400).json({error:"طبيعة تدريس المقرر غير معروفة."});return;
  }
  const numberIssue = courseNumberIssue(CourseCredit, CourseHours, MaxStudent);
  if (numberIssue) { res.status(400).json({ error: numberIssue }); return; }

  // Do not reject historical text/whitespace already present in CourseCode (legacy parity).

  const currentCourse = await Repository.getCourseById(id);
  if (!currentCourse) { res.status(404).json({ error: "المقرر الدراسي غير موجود" }); return; }
  /* الاسم يُقارن كما سيُحفظ: «أشكال العرض» وحروفها العادية اسمٌ واحد. */
  const identityChanged=currentCourse.CourseCode!==CourseCode||normalizeArabicText(currentCourse.CourseName)!==normalizeArabicText(CourseName);
  const [curriculumPlans,curriculumMemberships]=await Promise.all([
    Repository.getCurriculumPlans(Number(currentCourse.AdSectionId)),
    Repository.getCurriculumPlanCourses(Number(currentCourse.AdSectionId)),
  ]);
  const memberPlanIds=new Set(curriculumMemberships.filter(row=>Number(row.AdCourseId)===id).map(row=>row.planId));
  const belongsToFrozenCurriculum=curriculumPlans.some(plan=>memberPlanIds.has(plan.id)&&plan.status!=="active");
  /* تصحيح الوحدات والساعات والسعة مسموحٌ لمالك المقرر حتى في الصحيفة الانتقالية؛
     الذي يبقى مجمّداً هو الرمز والاسم، لحماية الروابط والسجل التدريسي التاريخي. */
  if (belongsToFrozenCurriculum&&identityChanged) {
    res.status(409).json({error:"هذا المقرر جزء من صحيفة انتقالية أو مؤرشفة، لذلك جُمّدت هويته الأكاديمية. أنشئ المقرر بصيغته الجديدة ثم اربطه من شاشة الصحائف الأكاديمية."});return;
  }
  if (identityChanged && await Repository.hasSchedulesForCourse(id)) {
    res.status(409).json({error:"هذا المقرر له سجل تدريسي تاريخي؛ لا تغيّر رقمه أو اسمه فوق التاريخ. أنشئ المقرر الجديد ثم اربطه من شاشة الصحائف الأكاديمية."});return;
  }
  const collegeId = collegeIdInput, sectionId = sectionIdInput;
  if ((Number(currentCourse.AdSectionId)!==sectionId||Number(currentCourse.AdCollegeId)!==collegeId)&&memberPlanIds.size) {
    res.status(409).json({error:"لا يمكن نقل مقرر مرتبط بصحيفة أكاديمية إلى قسم آخر. أنشئ مقرراً جديداً في القسم المطلوب حتى يبقى ارتباط الصحيفة سليماً."});return;
  }
  const targetSection = await Repository.getSectionById(sectionId);
  if (!targetSection || targetSection.AdCollegeId !== collegeId) {
    res.status(400).json({ error: "القسم العلمي المختار لا يتبع الكلية المختارة" });
    return;
  }
  if (!req.user.IsAdminUser && (!isScopeAllowed(req, currentCourse.AdCollegeId, currentCourse.AdSectionId) || !isScopeAllowed(req, collegeId, sectionId))) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  if (!await committeeCatalogEditAllowed(req, Number(currentCourse.AdSectionId))) { refuseCommitteeCatalogEdit(res); return; }

  const sectionCourses = await Repository.getCoursesBySection(sectionId);
  const codeExists = sectionCourses.some(c => c.CourseCode === CourseCode && c.AdCourseId !== id);
  if (codeExists) {
    res.status(400).json({ error: "تم تسجيل رمز المقرر الدراسي هذا من قبل" });
    return;
  }

  try {
    /* ── نوعُ القاعة يسري على نسخ المقرر في كل أحرام القسم ──────────────────
     * القسمُ الواحد له نسخةٌ من مقرره في كل حرم (الجهراء · الفحيحيل · بنات ·
     * بنين)، ورمزُ المقرر لا يتكرر داخل القسم. فمن اختار «مختبر» لنسخةٍ لا
     * يُطلب منه أن يكرّرها في البقية: تُطابَق بالرمز وباسم القسم الأكاديمي،
     * ولا تُمسّ إلا نسخةٌ يملك المستخدمُ نطاقَها.
     *
     * وتُكتب النسخُ قبل المقرر المعدَّل لا بعده: إن تعثّرت كتابةٌ بقيت المصدرُ
     * على نوعه القديم فتعيد المحاولةُ المزامنةَ كاملةً؛ لو كُتب المصدرُ أولاً
     * لصار «لم يتغيّر» ولما أعادت المحاولةُ ما فات من النسخ. والكتابةُ
     * متساويةُ الأثر عند التكرار. */
    let roomTypeSynced = 0;
    /* ما لم يُطابَق يُقال للمسؤول بسببه — من نسخ المقرر نفسه وحدها (القسمُ نفسُه في أحرامه).
       رقمُ المقرر يتكرر بين الأقسام العلمية لمقرراتٍ مختلفة، فمقررُ قسمٍ آخر بالرقم نفسه ليس نسخةً
       ولا يُذكر أصلاً: ذكرُه كان يوحي بأنه كان يجب أن يتغيّر. */
    let roomTypeSkipped: Array<{ college: string; section: string; reason: string }> = [];
    const roomTypeChanged = String(currentCourse.CourseRoomType || "").normalize("NFKC").trim() !== CourseRoomType;
    /* النوعُ الجديد يسري عند كل حفظٍ بنوعٍ غير فارغ، لا عند تغييره وحده: نسخةٌ كان نوعُها محفوظاً من قبل
       فأُعيد حفظها بلا تغيير كانت لا توحّد البقية. والفارغ لا يُمحى به غيرُه إلا حين يُمحى عمداً (تغيير). */
    const roomTypeEvaluated = roomTypeChanged || CourseRoomType !== "";
    let roomTypeAligned = 0;
    if (roomTypeEvaluated) {
      const [allCourses, allSections, allColleges] = await Promise.all([Repository.getCourses(), Repository.getSections(), Repository.getColleges()]);
      const candidates = roomTypeSiblingIds({ ...currentCourse, AdCollegeId: collegeId, AdSectionId: sectionId, CourseCode }, allCourses as any, allSections as any, allColleges as any);
      const siblings: number[] = [];
      for (const siblingId of candidates) {
        const other = allCourses.find(course => Number(course.AdCourseId) === siblingId)!;
        const collegeName = String(allColleges.find(college => Number(college.AdCollegeId) === Number(other.AdCollegeId))?.AdCollegeName || "");
        const sectionName = String(allSections.find(section => Number(section.AdSectionId) === Number(other.AdSectionId))?.AdSectionName || "");
        if (!req.user.IsAdminUser && !isScopeAllowed(req, Number(other.AdCollegeId), Number(other.AdSectionId))) {
          roomTypeSkipped.push({ college: collegeName, section: sectionName, reason: "خارج صلاحياتك" });
          continue;
        }
        if (!await committeeCatalogEditAllowed(req, Number(other.AdSectionId))) {
          roomTypeSkipped.push({ college: collegeName, section: sectionName, reason: "تعديل بيانات هذا القسم مقيَّد الآن" });
          continue;
        }
        siblings.push(siblingId);
      }
      const typeOf = (courseId: number) => String(allCourses.find(course => Number(course.AdCourseId) === courseId)?.CourseRoomType || "").normalize("NFKC").trim();
      const differing = siblings.filter(siblingId => typeOf(siblingId) !== CourseRoomType);
      roomTypeAligned = siblings.length - differing.length;
      roomTypeSynced = await Repository.setCourseRoomTypeForIds(differing, CourseRoomType);
    }
    /* طبيعةُ التدريس تسري على النسخ المطابقة نفسها: القسم ورقم المقرر نفسيهما
       عبر حُرُم القسم، مع احترام النطاق والصلاحيات كما في نوع القاعة. */
    let teachingModeSynced = 0, teachingModeAligned = 0;
    const teachingModeSkipped: Array<{ college: string; section: string; reason: string }> = [];
    const desiredTeachingMode = CourseTeachingMode === undefined ? String(currentCourse.CourseTeachingMode || "") : String(CourseTeachingMode || "");
    const teachingModeChanged = String(currentCourse.CourseTeachingMode || "") !== desiredTeachingMode;
    const teachingModeEvaluated = CourseTeachingMode !== undefined && (teachingModeChanged || desiredTeachingMode !== "");
    if (teachingModeEvaluated) {
      const [allCourses, allSections, allColleges] = await Promise.all([Repository.getCourses(), Repository.getSections(), Repository.getColleges()]);
      const candidates = roomTypeSiblingIds({ ...currentCourse, AdCollegeId: collegeId, AdSectionId: sectionId, CourseCode }, allCourses as any, allSections as any, allColleges as any);
      const siblings: number[] = [];
      for (const siblingId of candidates) {
        const other = allCourses.find(course => Number(course.AdCourseId) === siblingId)!;
        const collegeName = String(allColleges.find(college => Number(college.AdCollegeId) === Number(other.AdCollegeId))?.AdCollegeName || "");
        const sectionName = String(allSections.find(section => Number(section.AdSectionId) === Number(other.AdSectionId))?.AdSectionName || "");
        if (!req.user.IsAdminUser && (!isScopeAllowed(req, Number(other.AdCollegeId), Number(other.AdSectionId)) || !await committeeCatalogEditAllowed(req, Number(other.AdSectionId)))) {
          teachingModeSkipped.push({ college: collegeName, section: sectionName, reason: !isScopeAllowed(req, Number(other.AdCollegeId), Number(other.AdSectionId)) ? "خارج صلاحياتك" : "تعديل بيانات هذا القسم مقيَّد الآن" });
          continue;
        }
        siblings.push(siblingId);
      }
      const modeOf = (courseId: number) => String(allCourses.find(course => Number(course.AdCourseId) === courseId)?.CourseTeachingMode || "");
      const differing = siblings.filter(siblingId => modeOf(siblingId) !== desiredTeachingMode);
      teachingModeAligned = siblings.length - differing.length;
      teachingModeSynced = await Repository.setCourseTeachingModeForIds(differing, desiredTeachingMode as AdCourse["CourseTeachingMode"] | "");
    }
    /* Companion requirement follows the course, never a fixed room id across campuses. */
    let companionSynced=0;
    if(CourseCompanionRoomType!==undefined){
      const [allCourses,allSections,allColleges]=await Promise.all([Repository.getCourses(),Repository.getSections(),Repository.getColleges()]);
      const candidates=roomTypeSiblingIds({...currentCourse,AdCollegeId:collegeId,AdSectionId:sectionId,CourseCode},allCourses as any,allSections as any,allColleges as any);
      const allowed:number[]=[];
      for(const siblingId of candidates){
        const other=allCourses.find(c=>Number(c.AdCourseId)===siblingId)!;
        if(!req.user.IsAdminUser&&!isScopeAllowed(req,Number(other.AdCollegeId),Number(other.AdSectionId)))continue;
        if(!await committeeCatalogEditAllowed(req,Number(other.AdSectionId)))continue;
        if(String(other.CourseCompanionRoomType||"")!==CourseCompanionRoomType)allowed.push(siblingId);
      }
      companionSynced=await Repository.setCourseCompanionRoomTypeForIds(allowed,CourseCompanionRoomType);
    }
    const updated = await Repository.updateCourse(
      id,
      collegeId,
      sectionId,
      CourseCode,
      CourseName,
      CourseCredit!,
      CourseHours!,
      MaxStudent!,
      CourseRoomType,
      CourseTeachingMode === "" ? null : CourseTeachingMode,
      CourseCompanionRoomType
    );
    res.json({ ...updated, companionSynced, roomTypeSynced, roomTypeAligned, roomTypeChanged, roomTypeEvaluated, roomTypeSkipped: roomTypeSkipped.slice(0, 8), teachingModeSynced, teachingModeAligned, teachingModeChanged, teachingModeEvaluated, teachingModeSkipped: teachingModeSkipped.slice(0, 8) });
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

app.delete("/api/courses/:id", requirePermission(6), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const course = await Repository.getCourseById(id);
  if (course && !isScopeAllowed(req, course.AdCollegeId, course.AdSectionId) && !req.user.IsAdminUser) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  if (course && !await committeeCatalogEditAllowed(req, Number(course.AdSectionId))) { refuseCommitteeCatalogEdit(res); return; }
  // Curriculum history is a first-class reference just like timetable history.
  if (course) {
    const memberships=await Repository.getCurriculumPlanCourses(course.AdSectionId);
    if(memberships.some(row=>Number(row.AdCourseId)===id)){
      res.status(409).json({error:"لا يمكن حذف المقرر لأنه مرتبط بصحيفة أكاديمية. أخرجه من الصحيفة أو اتركه تاريخياً بدلاً من حذفه."});return;
    }
  }
  // Legacy SQL has FSchedule -> AdCourse FK. Do not silently orphan schedule rows in Firestore.
  if (await Repository.hasSchedulesForCourse(id)) {
    res.status(409).json({ error: "لا يمكن حذف المقرر الدراسي لوجود بيانات مرتبطة به في الجدول الدراسي" });
    return;
  }
  await Repository.deleteCourse(id);
  res.json({ success: true });
});
}
