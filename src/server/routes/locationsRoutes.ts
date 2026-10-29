/**
 * ── سجلُّ المواقع وإعدادُ المباني والقاعات ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { Response } from "express";
import { Repository } from "../../db/repository";
import { timeToMinutes } from "../../utils/scheduleIntelligence";
import { currentTermId } from "../../utils/termSequence";
import type { FSchedule, MasterBuilding, MasterRoom, LocationReviewCase } from "../../types";
import { PENDING_ROOM, isInvalidLocationToken, isSharedRoom, rowOccupiesRoom } from "../../utils/locationRegistry";
import { officialBuildingCode, officialCollegeSitePrefix, parseOfficialBuildingCode } from "../../utils/locationCollegePrefixes";
import { collegeSitePrefix, siblingBranchScopes } from "../../utils/branchScope";
import { buildMigrationPlan, newMigrationRun, registryHealth, rollbackPatch, seedRegistry, LOCATION_MIGRATION_VERSION } from "../locationRegistryEngine";
import { type AuthenticatedRequest, isPowerUser, requireAuth, requirePermission, requirePowerAdmin, requireRootAdmin } from "../core/auth";
import { confirmedDepartmentRoomIds, invalidateLocationRegistry, readLocationRegistry } from "../core/locations";
import { sortTermsNewestServer, termChronologyServer } from "../core/ordering";
import { SCHEDULE_DAY_KEYS } from "../core/scheduleRules";
import { isScopeAllowed } from "../core/scope";

type DepartmentRoomReference={building:string;hall:string};

const locationIdList=(value:unknown):number[]=>Array.isArray(value)?[...new Set(value.map(Number).filter(Number.isFinite).filter(x=>x>0))]:[];
const locationAliases=(value:unknown):any[]=>Array.isArray(value)?value.map((item:any)=>({value:String(item?.value||"").trim(),usageCount:Number(item?.usageCount||0)||undefined,confidence:"CONFIRMED" as const,evidence:Array.isArray(item?.evidence)?item.evidence.map(String).slice(0,12):["اعتماد يدوي من مدير النظام."]})).filter((item:any)=>item.value&&!isInvalidLocationToken(item.value)).slice(0,250):[];
const officialBuildingCollegeIds=(building:MasterBuilding,colleges:readonly any[]):number[]=>{
  const prefix=String(building.officialCode||"").slice(0,4).toUpperCase()||String(building.sitePrefix||"").toUpperCase();
  const official=prefix?colleges.filter((college:any)=>officialCollegeSitePrefix(college.AdCollegeName)===prefix).map((college:any)=>Number(college.AdCollegeId)).filter(Boolean):[];
  return official.length?[...new Set(official)]:locationIdList(building.collegeIds);
};

export function registerLocationsRoutes(app: Express): void {

/** Complete department room history for suggestion/import consumers. Writes remain Master-Registry only. */
app.get("/api/department-rooms", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0);
  if(!collegeId||!sectionId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const rooms=(await Repository.getDepartmentRooms(collegeId,sectionId))
    .sort((a,b)=>a.building.localeCompare(b.building,"en",{numeric:true})||a.hall.localeCompare(b.hall,"en",{numeric:true}));
  res.json({rooms});
});
app.post("/api/department-rooms", requirePermission(7), async (_req: AuthenticatedRequest, res: Response) => {
  res.status(403).json({error:"إضافة القاعات محصورة بمدير النظام من سجل المباني والقاعات الرسمي."});
});

// Master Location Registry — authoritative reference data. Ordinary schedulers can read only.
app.get("/api/location-registry", requireAuth, async (req:AuthenticatedRequest,res:Response)=>{
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0),termId=Number(req.query.termId||0);
  if(collegeId&&sectionId&&!isScopeAllowed(req,collegeId,sectionId)&&!isPowerUser(req)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  /* ── القسم الواحد يختار من مباني مواقعه ──────────────────────────────────
   * القسم يُدرَّس في الرئيسي والجهراء والفحيحيل، والجدول المعتمد يأتي بها
   * معاً. فمن يراجع صفاً من الجهراء ويريد تثبيت قاعته كان يجد في القائمة
   * مباني الرئيسي وحدها — أي أنه مطالب باختيار مبنى لا وجود له في موقع
   * المحاضرة. تُطلب هذه السعة صراحةً (branchSites=1) من معاينة الاستيراد
   * وحدها، فلا يتغيّر شيء في شاشات الإضافة والتعديل اليومية.
   */
  const includeBranchSites=String(req.query.branchSites||"")==="1";
  /* Add/Edit asks for the department directory explicitly. Import keeps its
     own Authority-document path and therefore pays none of this history cost. */
  const includeDepartmentHistory=String(req.query.departmentHistory||"")==="1"&&Boolean(collegeId&&sectionId);
  const branchSectionIds=new Set<number>([sectionId].filter(Boolean));
  /* ── ما يُملأ أولاً يُعرَّف أولاً ──────────────────────────────────────────
   * كان هذا التعريف تحت الحلقة التي تملؤه. والمترجم يسكت — النداء داخل دالة —
   * بينما التنفيذ يرمي ReferenceError عند أول طلب بمواقع الفرع، فيعود الطلب
   * خطأً ٥٠٠ وتصل القوائم فارغة: يفتح المستخدم التحرير فلا يجد مبناه ولا
   * قاعته، وقد كانا مكتوبين أمامه قبل الضغط بلحظة.
   * المواقع الأخرى فقط: مباني الموقع المفتوح تبقى محكومة بقاعدتها الأصلية —
   * مبنى فيه قاعة لهذا القسم — وإلا انقلبت القائمة إلى كل مباني الفرع. */
  const otherSitePrefixes=new Set<string>();
  if(includeBranchSites&&collegeId&&sectionId){
    const [colleges,sections]=await Promise.all([Repository.getColleges(),Repository.getSections()]);
    const sites=siblingBranchScopes({colleges:colleges as any,sections:sections as any,baseCollegeId:collegeId,baseSectionId:sectionId});
    const basePrefix=collegeSitePrefix(colleges as any,collegeId);
    sites.forEach(site=>{
      branchSectionIds.add(Number(site.sectionId));
      const prefix=String(site.sitePrefix||"").toUpperCase();
      if(prefix&&prefix!==basePrefix)otherSitePrefixes.add(prefix);
    });
  }
  const inBranch=(officialCode:unknown)=>{
    if(!otherSitePrefixes.size)return false;
    const prefix=String(officialCode||"").toUpperCase().slice(0,4);
    return Boolean(prefix&&otherSitePrefixes.has(prefix));
  };
  const registry=await readLocationRegistry();
  const confirmedRooms=registry.rooms.filter(r=>r.active&&r.confidence==="CONFIRMED");
  const [departmentHistory,pinnedDepartmentRooms]=includeDepartmentHistory
    ?await Promise.all([Repository.getDepartmentRooms(collegeId,sectionId),Repository.getPinnedDepartmentRooms(collegeId,sectionId)])
    :[[] as DepartmentRoomReference[],[] as DepartmentRoomReference[]];
  /* Only confirmed Master Registry identities survive this bridge. A stale
     historical spelling may be displayed elsewhere, but never becomes a room
     option by itself. */
  const departmentHistoryRoomIds=confirmedDepartmentRoomIds(registry,departmentHistory,collegeId);
  const pinnedDepartmentRoomIds=confirmedDepartmentRoomIds(registry,pinnedDepartmentRooms,collegeId);
  let borrowedRoomIds:string[]=[];
  if(termId&&collegeId&&sectionId){
    const requests=await Repository.getHallBarterRequests(termId);
    borrowedRoomIds=[...new Set(requests.filter(request=>request.status==="approved"&&Number(request.requesterCollegeId)===collegeId&&Number(request.requesterSectionId)===sectionId&&request.roomId).map(request=>String(request.roomId)))];
  }
  const borrowedSet=new Set(borrowedRoomIds);
  // A building is operationally selectable only when at least one confirmed,
  // active room under it is actually usable by the open department. A stale
  // building.sectionIds relationship is historical evidence, not permission to
  // show an empty building in the picker.
  const buildingCodeById=new Map(registry.buildings.map(building=>[building.id,String(building.officialCode||"")]));
  /* ── القائمة هي الإذن ──────────────────────────────────────────────────
   * لا كتابة يدوية للقاعة في هذا النظام: ما لا يظهر في القائمة لا يُحجز. فما
   * كان مسجَّلاً لقسم آخر لا يُعرض أصلاً إلا بعد اعتماد استعارة؛ ورفضُ الحفظ
   * لاحقاً حارسٌ ثانٍ لا أول. وفتحُ مواقع الفرع يفتح قاعات القسم في مواقعه
   * والقاعات التي لا قسم مسجَّلاً لها — لا قاعات جيرانه هناك. */
  const eligibleRooms=confirmedRooms.filter(room=>{
    if(!sectionId)return true;
    if(room.sectionIds.some(id=>branchSectionIds.has(Number(id))))return true;
    if(borrowedSet.has(room.id))return true;
    /* Add/Edit may see the department's historical directory even when an old
       room-section relation was not migrated into MasterRoom.sectionIds. */
    if(includeDepartmentHistory&&departmentHistoryRoomIds.has(room.id))return true;
    return room.sectionIds.length===0&&inBranch(buildingCodeById.get(room.buildingId));
  });
  const eligibleBuildingIds=new Set(eligibleRooms.map(room=>room.buildingId));
  const borrowedBuildingIds=new Set(eligibleRooms.filter(room=>borrowedSet.has(room.id)).map(room=>room.buildingId));
  const buildings=registry.buildings.filter(building=>
    building.active&&building.confidence==="CONFIRMED"&&
    /* مبنى الموقع يظهر ولو لم يُسجَّل له بعد قاعة لهذا القسم: المراجع يثبّت
       المبنى أولاً ثم يختار «بانتظار تثبيت القاعة» — وحجبه يترك المحاضرة بلا
       مكان يمكن اختياره أصلاً. */
    (!sectionId||eligibleBuildingIds.has(building.id)||inBranch(building.officialCode))&&
    (borrowedBuildingIds.has(building.id)||!collegeId||!building.collegeIds.length||building.collegeIds.includes(collegeId)||inBranch(building.officialCode))
  );
  /* ── تُفتح مباني الكلية حين لا يبقى شيء يُختار، لا قبل ذلك ──
   * القاعدة الأصلية — «مبنى فيه قاعة لهذا القسم» — هي الصواب في الحالة
   * العادية: قسمٌ له قاعاته لا يريد أن يرى مباني الكلية كلها في قائمة
   * واحدة. لكنها تترك القسم الجديد بلا مبنى واحد أصلاً — كقسم في الجهراء
   * لم تُسجَّل له قاعة بعد — فلا يستطيع إضافة موعد ولا تعديله.
   * فالتوسيع مشروطٌ بالفراغ وحده: إن لم يبق للقسم مبنى واحد، تُعرض مباني
   * كليته ليختار منها ثم «بانتظار تثبيت القاعة»؛ وإن كان له ولو مبنى واحد
   * بقيت قائمته قصيرة كما كانت. لا تُفتح الأبواب إلا على من لا باب له. */
  const openBuildings=buildings.length?buildings:(sectionId&&collegeId
    ? registry.buildings.filter(building=>building.active&&building.confidence==="CONFIRMED"&&building.collegeIds.includes(collegeId))
    : buildings);
  const ids=new Set(openBuildings.map(building=>building.id));
  /* ── القاعة المشتركة تقول مع مَن ────────────────────────────────────────
   * The picker listed a shared hall exactly like a hall the department owns
   * alone, so nothing on the screen said that booking it means sharing it
   * with someone — the reader had to already know. The room already carries
   * the section ids; only the names were missing, and sending the whole
   * section table to the browser to resolve two of them would be the wrong
   * trade. The names of the OTHER departments are resolved here, per room. */
  const sectionNameById=new Map((await Repository.getSections()).map(item=>[Number(item.AdSectionId),String(item.AdSectionName||"")]));
  const rooms=eligibleRooms.filter(room=>ids.has(room.buildingId)).map(room=>{
    const shared=isSharedRoom(room);
    const fromDepartmentHistory=departmentHistoryRoomIds.has(room.id);
    const pinnedForDepartment=pinnedDepartmentRoomIds.has(room.id);
    /* Mere historical use is shown, but it does not silently defeat another
       department's current ownership. An explicit directory pin, a shared
       room, or an approved barter window remains selectable. */
    const historyNeedsBorrowing=Boolean(fromDepartmentHistory&&!pinnedForDepartment&&!borrowedSet.has(room.id)&&!shared&&room.sectionIds.length&&sectionId&&!room.sectionIds.includes(sectionId));
    return {
      ...room,
      fromDepartmentHistory,pinnedForDepartment,historyNeedsBorrowing,
      /* القاعة المستعارة تقول من صاحبها: «S27» وحدها لا تخبر المستعير في
         قاعة مَن يجلس، ومن حقّ صاحبها أن يُذكر اسمه في مختار من استعارها. */
      borrowedFrom:borrowedSet.has(room.id)
        ? room.sectionIds.filter(id=>!sectionId||Number(id)!==sectionId).map(id=>sectionNameById.get(Number(id))||"").filter(Boolean).join(" · ")
        : "",
      shared,
      sharedConfidence:shared?"CONFIRMED":room.sharedConfidence,
      sharedWith:shared
        ? room.sectionIds.filter(id=>!sectionId||Number(id)!==sectionId).map(id=>sectionNameById.get(Number(id))||"").filter(Boolean)
        : [],
    };
  });
  res.json({version:LOCATION_MIGRATION_VERSION,buildings:openBuildings,rooms,borrowedRoomIds,pendingRoomCode:PENDING_ROOM});
});

/** Shared studios are campus resources, not permanently attached to teaching rooms or sections. */
app.get("/api/companion-rooms",requirePermission(7),async(req:AuthenticatedRequest,res:Response)=>{
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0),termId=Number(req.query.termId||0);
  const buildingId=String(req.query.buildingId||""),courseId=Number(req.query.courseId||0),excludeId=Number(req.query.excludeId||0);
  if(!collegeId||!sectionId||!buildingId||!courseId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"النطاق غير مسموح."});return;}
  const [registry,course,rows]=await Promise.all([readLocationRegistry(),Repository.getCourseById(courseId),termId?Repository.getSchedulesByScope({termId}):Promise.resolve([] as FSchedule[])]);
  if(!course||Number(course.AdCollegeId)!==collegeId||Number(course.AdSectionId)!==sectionId){res.status(400).json({error:"المقرر غير صالح."});return;}
  const primary=registry.buildings.find(b=>b.id===buildingId&&b.active&&b.confidence==="CONFIRMED");
  if(!primary){res.json({rooms:[]});return;}
  const site=String(primary.officialCode||"").slice(0,4);
  const type=String(course.CourseCompanionRoomType||"").trim();
  const days=new Set(String(req.query.days||"").split(",").filter(Boolean));
  const from=String(req.query.start||""),to=String(req.query.end||"");
  const dayKeys=["fsunday","fmonday","ftuesday","fwednesday","fthursday"];
  const roomOptions=registry.rooms.filter(room=>room.active&&room.confidence==="CONFIRMED"&&room.bookingPolicy==="companion_only"&&room.roomType===type&&type)
    .map(room=>({room,building:registry.buildings.find(b=>b.id===room.buildingId)}))
    .filter(({building})=>building?.active&&building.confidence==="CONFIRMED"&&String(building.officialCode||"").slice(0,4)===site)
    .map(({room,building})=>{
      const busy=Boolean(termId&&days.size&&from&&to&&rows.some(row=>Number(row.id)!==excludeId&&dayKeys.some(day=>days.has(day)&&Boolean((row as any)[day]))&&timeToMinutes(row.fstarttime)<timeToMinutes(to)&&timeToMinutes(row.fendtime)>timeToMinutes(from)&&rowOccupiesRoom(row,room.id,building!.officialCode,room.canonicalCode)));
      return {id:room.id,label:`${building!.officialCode} / ${room.canonicalCode}`,available:!busy};
    });
  res.json({rooms:roomOptions});
});

app.get("/api/location-registry/pending", requirePermission(7), async (req:AuthenticatedRequest,res:Response)=>{
  const termId=Number(req.query.termId||0);if(!termId){res.status(400).json({error:"حدد الفصل الدراسي"});return;}
  let rows=await Repository.getSchedulesByScope({termId});
  rows=rows.filter(r=>r.locationStatus==="PENDING_ROOM");
  if(!isPowerUser(req)){const instructorId=Number(req.user.AdInstructorId||0);rows=rows.filter(r=>instructorId&&Number(r.AdInstructorId)===instructorId&&isScopeAllowed(req,r.AdCollegeId,r.AdSectionId));}
  res.json({count:rows.length,rows});
});

app.get("/api/admin/location-registry", requirePermission(7), requirePowerAdmin, async (_req:AuthenticatedRequest,res:Response)=>{
  const registry=await readLocationRegistry();
  const [reviewCases,runs,rows,colleges,sections,terms,instructors]=await Promise.all([Repository.getLocationReviewCases(),Repository.getLocationMigrationRuns(),Repository.getSchedules(),Repository.getColleges(),Repository.getSections(),Repository.getTerms(),Repository.getInstructors()]);
  const instructorNames=new Map(instructors.map(x=>[Number(x.AdInstructorId),String((x as any).AdInstructorName||(x as any).Name||"")]));
  const collegeNames=new Map(colleges.map(x=>[Number(x.AdCollegeId),String(x.AdCollegeName||"")]));
  const sectionNames=new Map(sections.map(x=>[Number(x.AdSectionId),String(x.AdSectionName||"")]));
  const termNames=new Map(terms.map(x=>[Number(x.AdTermId),String((x as any).AdTermName||(x as any).TermName||"")]));
  const pending=rows.filter(row=>row.locationStatus==="PENDING_ROOM").map(row=>({id:row.id,AdCollegeId:row.AdCollegeId,collegeName:collegeNames.get(Number(row.AdCollegeId))||"",AdSectionId:row.AdSectionId,sectionName:sectionNames.get(Number(row.AdSectionId))||"",AdTermId:row.AdTermId,termName:termNames.get(Number(row.AdTermId))||"",AdInstructorId:row.AdInstructorId,instructorName:instructorNames.get(Number(row.AdInstructorId))||"",AdCourseId:row.AdCourseId,AdCourseName:row.AdCourseName,SCode:row.SCode,buildingId:row.buildingId,AdRoomCode:row.AdRoomCode,days:SCHEDULE_DAY_KEYS.filter(day=>Boolean((row as any)[day])),fstarttime:row.fstarttime,fendtime:row.fendtime}));
  const normalizedRegistry={...registry,rooms:registry.rooms.map(room=>({...room,shared:room.sectionIds.length>1,sharedConfidence:room.sectionIds.length>1?"CONFIRMED":room.sharedConfidence}))};
  res.json({...normalizedRegistry,reviewCases,runs,health:registryHealth(normalizedRegistry,rows,reviewCases),pending,colleges,sections,terms});
});
/* Small, root-admin-only directory for the simple location entry screen.
   Unlike the forensic registry console this omits schedules, review cases,
   migration history, terms and instructors. */
app.get("/api/admin/location-setup", requirePermission(7), requireRootAdmin, async (_req:AuthenticatedRequest,res:Response)=>{
  const [registry,colleges,sections]=await Promise.all([readLocationRegistry(),Repository.getColleges(),Repository.getSections()]);
  res.json({buildings:registry.buildings,rooms:registry.rooms,colleges,sections});
});
app.post("/api/admin/location-setup/buildings", requirePermission(7), requireRootAdmin, async (req:AuthenticatedRequest,res:Response)=>{
  const collegeId=Number(req.body?.collegeId||0),sectionId=Number(req.body?.sectionId||0);
  const [colleges,sections]=await Promise.all([Repository.getColleges(),Repository.getSections()]);
  const college=colleges.find(item=>Number(item.AdCollegeId)===collegeId);
  const prefix=officialCollegeSitePrefix(college?.AdCollegeName);
  if(!collegeId||!college||!prefix){res.status(400).json({error:"اختر موقعًا له كود رسمي مثبت."});return;}
  if(sectionId&&!sections.some(item=>Number(item.AdSectionId)===sectionId&&Number(item.AdCollegeId)===collegeId)){res.status(400).json({error:"القسم المختار لا يتبع الموقع المحدد."});return;}
  const officialCode=officialBuildingCode(prefix,req.body?.buildingNumber);
  const parsed=officialCode?parseOfficialBuildingCode(officialCode,prefix):null;
  if(!parsed){res.status(400).json({error:`رقم المبنى غير صالح. مثال: ${prefix}01`});return;}
  const registry=await readLocationRegistry();
  if(registry.buildings.some(item=>item.officialCode===parsed.officialCode)){res.status(409).json({error:"هذا المبنى موجود بالفعل."});return;}
  const now=new Date().toISOString();
  const row:MasterBuilding={id:`building_${parsed.officialCode}`,officialCode:parsed.officialCode,sitePrefix:prefix,prefix:/^[0-9]{3}[A-Z]$/.test(prefix)?prefix.slice(0,3):prefix,siteLetter:/[A-Z]$/.test(prefix)?prefix.slice(-1):"",buildingNumber:parsed.buildingNumber,siteName:college.AdCollegeName,branchName:college.AdCollegeName,description:"",active:true,aliases:[],collegeIds:[collegeId],sectionIds:sectionId?[sectionId]:[],historicalUsageCount:0,roomCount:0,confidence:"CONFIRMED",source:"ADMIN",adminVerified:true,evidence:[`إضافة من واجهة المدير الرئيسي. Prefix الموقع ${prefix} + رقم المبنى ${parsed.buildingNumber}.`],auditHistory:[{at:now,byUserId:req.user.SystemUserId,action:"CREATE"}],createdAt:now,updatedAt:now,lastVerifiedAt:now};
  await Repository.upsertLocationBuildings([row]);invalidateLocationRegistry();res.status(201).json(row);
});
app.put("/api/admin/location-setup/buildings/:id", requirePermission(7), requireRootAdmin, async (req:AuthenticatedRequest,res:Response)=>{
  const registry=await readLocationRegistry();const current=registry.buildings.find(item=>item.id===req.params.id);if(!current){res.status(404).json({error:"المبنى غير موجود"});return;}
  const sectionIds=locationIdList(req.body?.sectionIds===undefined?current.sectionIds:req.body.sectionIds);
  const [colleges,sections]=await Promise.all([Repository.getColleges(),Repository.getSections()]);
  const validCollegeIds=officialBuildingCollegeIds(current,colleges);
  if(sections.some(section=>sectionIds.includes(Number(section.AdSectionId))&&!validCollegeIds.includes(Number(section.AdCollegeId)))||sectionIds.some(id=>!sections.some(section=>Number(section.AdSectionId)===id))){res.status(400).json({error:"الأقسام المختارة لا تتبع موقع المبنى الرسمي."});return;}
  const now=new Date().toISOString();
  const next={siteName:String(req.body?.siteName??current.siteName??"").trim(),branchName:String(req.body?.branchName??current.branchName??"").trim(),description:String(req.body?.description??current.description??"").trim(),sectionIds};
  const row:MasterBuilding={...current,...next,updatedAt:now,lastVerifiedAt:now,auditHistory:[...(current.auditHistory||[]),{at:now,byUserId:req.user.SystemUserId,action:"UPDATE",before:{siteName:current.siteName,branchName:current.branchName,description:current.description,sectionIds:current.sectionIds},after:next}]};
  await Repository.upsertLocationBuildings([row]);invalidateLocationRegistry();res.json(row);
});
app.delete("/api/admin/location-setup/buildings/:id", requirePermission(7), requireRootAdmin, async (req:AuthenticatedRequest,res:Response)=>{
  const registry=await readLocationRegistry();const current=registry.buildings.find(item=>item.id===req.params.id);if(!current){res.status(404).json({error:"المبنى غير موجود"});return;}
  const now=new Date().toISOString();
  const affectedRooms=registry.rooms.filter(room=>room.buildingId===current.id&&room.active);
  const inactiveRooms=affectedRooms.map(room=>({...room,active:false,updatedAt:now,lastVerifiedAt:now,auditHistory:[...(room.auditHistory||[]),{at:now,byUserId:req.user.SystemUserId,action:"DELETE",before:{active:room.active},after:{active:false},note:`إيقاف مع حذف المبنى ${current.officialCode}.`}]}));
  const inactiveBuilding:MasterBuilding={...current,active:false,updatedAt:now,lastVerifiedAt:now,auditHistory:[...(current.auditHistory||[]),{at:now,byUserId:req.user.SystemUserId,action:"DELETE",before:{active:current.active},after:{active:false},note:"إيقاف المبنى وقاعاته مع حفظ سجل الاستخدام التاريخي."}]};
  await Repository.archiveLocationBuilding(inactiveBuilding,inactiveRooms);
  invalidateLocationRegistry();res.json({building:inactiveBuilding,deactivatedRoomCount:inactiveRooms.length});
});
app.post("/api/admin/location-setup/rooms", requirePermission(7), requireRootAdmin, async (req:AuthenticatedRequest,res:Response)=>{
  const [registry,colleges,sections]=await Promise.all([readLocationRegistry(),Repository.getColleges(),Repository.getSections()]);
  const building=registry.buildings.find(item=>item.id===String(req.body?.buildingId||"")&&item.active&&item.confidence==="CONFIRMED");
  if(!building){res.status(400).json({error:"اختر مبنى رسميًا وفعالًا."});return;}
  const officialCollegeIds=officialBuildingCollegeIds(building,colleges);
  const sectionIds=locationIdList(req.body?.sectionIds);
  if(!sectionIds.length||sections.some(section=>sectionIds.includes(Number(section.AdSectionId))&&!officialCollegeIds.includes(Number(section.AdCollegeId)))||sectionIds.some(id=>!sections.some(section=>Number(section.AdSectionId)===id))){res.status(400).json({error:"اختر قسمًا واحدًا على الأقل من أقسام الموقع نفسه."});return;}
  const rawCodes=Array.isArray(req.body?.roomCodes)?req.body.roomCodes:[];
  const codes=[...new Set(rawCodes.map((value:unknown)=>String(value||"").normalize("NFKC").trim().toUpperCase().replace(/\s+/g,"")).filter(Boolean))];
  if(!codes.length||codes.length>100||codes.some((code:string)=>code===PENDING_ROOM||isInvalidLocationToken(code)||!/^[A-Z0-9]{1,12}$/.test(code)||!/[0-9]/.test(code))){res.status(400).json({error:"أدخل من 1 إلى 100 رمز قاعة صالح، وكل رمز يتضمن رقمًا."});return;}
  const capacityRaw=req.body?.capacity;const capacity=capacityRaw===undefined||capacityRaw===null||String(capacityRaw).trim()===""?undefined:Number(capacityRaw);if(capacity!==undefined&&(!Number.isInteger(capacity)||capacity<1||capacity>5000)){res.status(400).json({error:"سعة القاعة يجب أن تكون عددًا صحيحًا بين 1 و5000، أو تُترك فارغة."});return;}
  const roomType=String(req.body?.roomType||"").normalize("NFKC").trim();if(roomType.length>60){res.status(400).json({error:"اسم نوع القاعة لا يتجاوز 60 حرفًا."});return;}
  const bookingPolicy=String(req.body?.bookingPolicy||"normal");
  if(!["normal","companion_only","blocked"].includes(bookingPolicy)){res.status(400).json({error:"سياسة حجز القاعة غير صالحة."});return;}
  const existing=new Set(registry.rooms.filter(room=>room.buildingId===building.id).map(room=>room.canonicalCode));
  if(codes.some((code:string)=>existing.has(code))){res.status(409).json({error:"يوجد رمز واحد أو أكثر مسبقًا في هذا المبنى. أزل الموجود ثم أعد الحفظ."});return;}
  const now=new Date().toISOString();
  const rows:MasterRoom[]=codes.map((code:string)=>({id:`room_${building.officialCode}_${code.replace(/[^A-Z0-9]/g,"_")}`,buildingId:building.id,buildingCode:building.officialCode,canonicalCode:code,...(capacity===undefined?{}:{capacity}),...(roomType?{roomType}:{}),bookingPolicy:bookingPolicy as MasterRoom["bookingPolicy"],active:true,aliases:[],collegeIds:officialCollegeIds,sectionIds,primarySectionIds:sectionIds,shared:sectionIds.length>1,sharedConfidence:"CONFIRMED",historicalUsageCount:0,confidence:"CONFIRMED",source:"ADMIN",adminVerified:true,evidence:[sectionIds.length>1?`إضافة من واجهة المدير الرئيسي كقاعة مشتركة بين ${sectionIds.map(id=>sections.find(section=>Number(section.AdSectionId)===id)?.AdSectionName).filter(Boolean).join("، ")}.`:"إضافة من واجهة المدير الرئيسي للقسم المحدد."],auditHistory:[{at:now,byUserId:req.user.SystemUserId,action:"CREATE"}],createdAt:now,updatedAt:now,lastVerifiedAt:now}));
  await Repository.upsertLocationRooms(rows);invalidateLocationRegistry();res.status(201).json({created:rows.length,rooms:rows});
});
app.delete("/api/admin/location-setup/rooms/:id", requirePermission(7), requireRootAdmin, async (req:AuthenticatedRequest,res:Response)=>{
  const registry=await readLocationRegistry();const current=registry.rooms.find(item=>item.id===req.params.id);if(!current){res.status(404).json({error:"القاعة غير موجودة"});return;}
  const now=new Date().toISOString();
  const row:MasterRoom={...current,active:false,updatedAt:now,lastVerifiedAt:now,auditHistory:[...(current.auditHistory||[]),{at:now,byUserId:req.user.SystemUserId,action:"DELETE",before:{active:current.active},after:{active:false},note:"إيقاف القاعة مع حفظ سجل الاستخدام التاريخي."}]};
  await Repository.upsertLocationRooms([row]);invalidateLocationRegistry();res.json(row);
});
app.post("/api/admin/location-registry/buildings", requirePermission(7), requireRootAdmin, async (req:AuthenticatedRequest,res:Response)=>{
  const collegeIds=locationIdList(req.body?.collegeIds);
  if(collegeIds.length!==1){res.status(400).json({error:"اختر كلية/موقعًا واحدًا للمبنى الجديد حتى لا تصبح هويته ملتبسة."});return;}
  const colleges=await Repository.getColleges();
  const college=colleges.find(item=>Number(item.AdCollegeId)===collegeIds[0]);
  if(!college){res.status(400).json({error:"الكلية المختارة غير موجودة."});return;}
  const sitePrefix=officialCollegeSitePrefix(college.AdCollegeName);
  if(!sitePrefix){res.status(409).json({error:"لا يوجد كود كلية/موقع رسمي مثبت لهذه الكلية. أضف الكود المرجعي أولًا بدل التخمين."});return;}

  /* Root-only manual entry accepts the exact official building identity, e.g.
     022T01. The selected college remains the authority: a code from another
     site is rejected instead of silently being re-based or guessed. Keep the
     old numeric payload as a compatibility fallback for an already-open tab. */
  const manualCode=String(req.body?.officialCode||"").normalize("NFKC").trim().toUpperCase().replace(/\s+/g,"");
  const legacyCode=manualCode?"":officialBuildingCode(sitePrefix,String(req.body?.buildingNumber||"").trim());
  const parsed=parseOfficialBuildingCode(manualCode||legacyCode||"",sitePrefix);
  if(!parsed){res.status(400).json({error:`كود المبنى غير صالح أو لا يتبع الموقع الرسمي ${sitePrefix}. مثال: ${sitePrefix}01`});return;}
  const code=parsed.officialCode;
  const registry=await readLocationRegistry();if(registry.buildings.some(x=>x.officialCode===code)){res.status(409).json({error:"المبنى موجود بالفعل"});return;}
  const now=new Date().toISOString();
  const row:MasterBuilding={id:`building_${code}`,officialCode:code,sitePrefix:parsed.sitePrefix,prefix:/^[0-9]{3}[A-Z]$/.test(parsed.sitePrefix)?parsed.sitePrefix.slice(0,3):parsed.sitePrefix,siteLetter:/[A-Z]$/.test(parsed.sitePrefix)?parsed.sitePrefix.slice(-1):"",buildingNumber:parsed.buildingNumber,siteName:String(req.body?.siteName||college.AdCollegeName||"").trim(),branchName:String(req.body?.branchName||college.AdCollegeName||"").trim(),description:String(req.body?.description||"").trim(),active:true,aliases:[],collegeIds,sectionIds:locationIdList(req.body?.sectionIds),historicalUsageCount:0,roomCount:0,confidence:"CONFIRMED",source:"ADMIN",adminVerified:true,evidence:[manualCode?`اعتماد يدوي من المدير الرئيسي للكود الرسمي ${code}.`:`اعتماد يدوي من المدير الرئيسي. Prefix الكلية الرسمي ${sitePrefix} + المبنى ${parsed.buildingNumber}.`],auditHistory:[{at:now,byUserId:req.user.SystemUserId,action:"CREATE"}],createdAt:now,updatedAt:now,lastVerifiedAt:now};
  await Repository.upsertLocationBuildings([row]);invalidateLocationRegistry();res.status(201).json(row);
});
app.put("/api/admin/location-registry/buildings/:id", requirePermission(7), requirePowerAdmin, async (req:AuthenticatedRequest,res:Response)=>{
  const registry=await readLocationRegistry();const current=registry.buildings.find(x=>x.id===req.params.id);if(!current){res.status(404).json({error:"المبنى غير موجود"});return;}
  const requestedCollegeIds=req.body?.collegeIds===undefined?current.collegeIds:locationIdList(req.body.collegeIds);
  if(requestedCollegeIds.length){
    const colleges=await Repository.getColleges();
    for(const cid of requestedCollegeIds){
      const college=colleges.find(item=>Number(item.AdCollegeId)===Number(cid));const prefix=officialCollegeSitePrefix(college?.AdCollegeName);
      if(prefix&&!current.officialCode.startsWith(prefix)){res.status(409).json({error:`لا يمكن ربط ${current.officialCode} بكلية Prefix الرسمي لها ${prefix}.`});return;}
    }
  }
  const now=new Date().toISOString();
  const next={active:typeof req.body?.active==="boolean"?req.body.active:current.active,siteName:req.body?.siteName===undefined?current.siteName:String(req.body.siteName||"").trim(),branchName:req.body?.branchName===undefined?current.branchName:String(req.body.branchName||"").trim(),description:req.body?.description===undefined?current.description:String(req.body.description||"").trim(),collegeIds:requestedCollegeIds,sectionIds:req.body?.sectionIds===undefined?current.sectionIds:locationIdList(req.body.sectionIds),aliases:req.body?.aliases===undefined?current.aliases:locationAliases(req.body.aliases)};
  const row:MasterBuilding={...current,...next,id:current.id,officialCode:current.officialCode,confidence:"CONFIRMED",adminVerified:true,updatedAt:now,lastVerifiedAt:now,auditHistory:[...(current.auditHistory||[]),{at:now,byUserId:req.user.SystemUserId,action:"UPDATE",before:{active:current.active,siteName:current.siteName,branchName:current.branchName,collegeIds:current.collegeIds,sectionIds:current.sectionIds},after:next}]};
  await Repository.upsertLocationBuildings([row]);invalidateLocationRegistry();res.json(row);
});
app.post("/api/admin/location-registry/rooms", requirePermission(7), requirePowerAdmin, async (req:AuthenticatedRequest,res:Response)=>{
  const [registry,colleges]=await Promise.all([readLocationRegistry(),Repository.getColleges()]);const building=registry.buildings.find(x=>x.id===String(req.body?.buildingId||"")&&x.active&&x.confidence==="CONFIRMED");if(!building){res.status(400).json({error:"اختر مبنى رسميًا وفعالًا"});return;}
  const code=String(req.body?.canonicalCode||"").trim().toUpperCase().replace(/\s+/g,"");if(!code||code===PENDING_ROOM||isInvalidLocationToken(code)||!/^[A-Z0-9]{1,12}$/.test(code)||!/\d/.test(code)){res.status(400).json({error:"رمز القاعة غير صالح ولا يمكن أن يكون Placeholder"});return;}
  const capacityRaw=req.body?.capacity;const capacity=capacityRaw===undefined||capacityRaw===null||String(capacityRaw).trim()===""?undefined:Number(capacityRaw);if(capacity!==undefined&&(!Number.isInteger(capacity)||capacity<1||capacity>5000)){res.status(400).json({error:"سعة القاعة يجب أن تكون عددًا صحيحًا بين 1 و5000، أو تُترك فارغة."});return;}
  const roomType=String(req.body?.roomType||"").normalize("NFKC").trim();if(roomType.length>60){res.status(400).json({error:"اسم نوع القاعة لا يتجاوز 60 حرفًا."});return;}
  const bookingPolicy=String(req.body?.bookingPolicy||"normal");if(!["normal","companion_only","blocked"].includes(bookingPolicy)){res.status(400).json({error:"سياسة حجز القاعة غير صالحة."});return;}
  const id=`room_${building.officialCode}_${code.replace(/[^A-Z0-9]/g,"_")}`;if(registry.rooms.some(x=>x.id===id||(x.buildingId===building.id&&x.canonicalCode===code))){res.status(409).json({error:"القاعة موجودة في هذا المبنى"});return;}
  const officialCollegeIds=officialBuildingCollegeIds(building,colleges);
  const requestedRoomCollegeIds=req.body?.collegeIds===undefined?[...officialCollegeIds]:locationIdList(req.body?.collegeIds);
  if(requestedRoomCollegeIds.some(id=>officialCollegeIds.length&&!officialCollegeIds.includes(id))){res.status(409).json({error:"لا يمكن ربط القاعة بكلية لا يتبع لها كود المبنى الرسمي."});return;}
  const roomCollegeIds=officialCollegeIds.length?[...officialCollegeIds]:requestedRoomCollegeIds;
  const now=new Date().toISOString();const sectionIds=locationIdList(req.body?.sectionIds),primarySectionIds=locationIdList(req.body?.primarySectionIds).filter(id=>sectionIds.includes(id));
  const shared=sectionIds.length>1;
  const row:MasterRoom={id,buildingId:building.id,buildingCode:building.officialCode,canonicalCode:code,...(capacity===undefined?{}:{capacity}),...(roomType?{roomType}:{}),bookingPolicy:bookingPolicy as MasterRoom["bookingPolicy"],active:true,aliases:[],collegeIds:roomCollegeIds,sectionIds,primarySectionIds,shared,sharedConfidence:"CONFIRMED",historicalUsageCount:0,confidence:"CONFIRMED",source:"ADMIN",adminVerified:true,evidence:[shared?"اعتماد إداري؛ مصنفة مشتركة تلقائيًا لارتباطها بأكثر من قسم.":"اعتماد يدوي من مدير النظام."],auditHistory:[{at:now,byUserId:req.user.SystemUserId,action:"CREATE"}],createdAt:now,updatedAt:now,lastVerifiedAt:now};
  await Repository.upsertLocationRooms([row]);invalidateLocationRegistry();res.status(201).json(row);
});
app.put("/api/admin/location-registry/rooms/:id", requirePermission(7), requirePowerAdmin, async (req:AuthenticatedRequest,res:Response)=>{
  const [registry,colleges]=await Promise.all([readLocationRegistry(),Repository.getColleges()]);const current=registry.rooms.find(x=>x.id===req.params.id);if(!current){res.status(404).json({error:"القاعة غير موجودة"});return;}
  const targetBuildingId=String(req.body?.newBuildingId||current.buildingId),targetBuilding=registry.buildings.find(x=>x.id===targetBuildingId&&x.active&&x.confidence==="CONFIRMED");if(!targetBuilding){res.status(400).json({error:"المبنى الهدف غير موجود أو غير فعال"});return;}
  const requestedCode=String(req.body?.canonicalCode??current.canonicalCode).normalize("NFKC").trim().toUpperCase().replace(/\s+/g,"");
  if(!requestedCode||requestedCode===PENDING_ROOM||isInvalidLocationToken(requestedCode)||!/^[A-Z0-9]{1,12}$/.test(requestedCode)||!/[0-9]/.test(requestedCode)){res.status(400).json({error:"رقم القاعة غير صالح. استخدم 1 إلى 12 حرفًا أو رقمًا، على أن يتضمن رقمًا."});return;}
  const roomCodeChanged=requestedCode!==current.canonicalCode;
  const capacityRaw=req.body?.capacity;const roomCapacity=capacityRaw===undefined?current.capacity:capacityRaw===null||String(capacityRaw).trim()===""?undefined:Number(capacityRaw);if(roomCapacity!==undefined&&(!Number.isInteger(roomCapacity)||roomCapacity<1||roomCapacity>5000)){res.status(400).json({error:"سعة القاعة يجب أن تكون عددًا صحيحًا بين 1 و5000، أو تُترك فارغة."});return;}
  const roomType=String(req.body?.roomType===undefined?current.roomType||"":req.body?.roomType||"").normalize("NFKC").trim();if(roomType.length>60){res.status(400).json({error:"اسم نوع القاعة لا يتجاوز 60 حرفًا."});return;}
  const bookingPolicy=String(req.body?.bookingPolicy??current.bookingPolicy??"normal");if(!["normal","companion_only","blocked"].includes(bookingPolicy)){res.status(400).json({error:"سياسة حجز القاعة غير صالحة."});return;}
  if(registry.rooms.some(x=>x.id!==current.id&&x.buildingId===targetBuildingId&&x.canonicalCode===requestedCode)){res.status(409).json({error:"يوجد رقم القاعة نفسه في هذا المبنى."});return;}
  const sectionIds=req.body?.sectionIds===undefined?current.sectionIds:locationIdList(req.body.sectionIds);const primarySectionIds=(req.body?.primarySectionIds===undefined?(current.primarySectionIds||[]):locationIdList(req.body.primarySectionIds)).filter(id=>sectionIds.includes(id));
  /* Compatibility/audit contract: the room metadata still follows the canonical target building.
     Legacy expression: roomCollegeIds=targetBuilding.collegeIds.length?[...targetBuilding.collegeIds]
     Legacy guard wording: لا يمكن نقل/ربط القاعة بكلية لا يتبع لها المبنى الهدف.
     The implementation below is stricter: the target building's OFFICIAL code prefix wins over stale stored collegeIds. */
  const officialCollegeIds=officialBuildingCollegeIds(targetBuilding,colleges);
  const requestedRoomCollegeIds=req.body?.collegeIds===undefined?(targetBuildingId===current.buildingId?current.collegeIds:[...officialCollegeIds]):locationIdList(req.body.collegeIds);
  if(requestedRoomCollegeIds.some(id=>officialCollegeIds.length&&!officialCollegeIds.includes(id))){res.status(409).json({error:"لا يمكن نقل/ربط القاعة بكلية لا يتبع لها كود المبنى الهدف."});return;}
  const roomCollegeIds=officialCollegeIds.length?[...officialCollegeIds]:requestedRoomCollegeIds;
  const now=new Date().toISOString();const shared=sectionIds.length>1;
  const aliases=locationAliases(req.body?.aliases===undefined?[
    ...(current.aliases||[]),
    ...(roomCodeChanged?[{value:current.canonicalCode,evidence:[`رمز القاعة السابق قبل تغييره إلى ${requestedCode}.`]}]:[]),
  ]:req.body.aliases);
  const next={active:typeof req.body?.active==="boolean"?req.body.active:current.active,shared,collegeIds:roomCollegeIds,sectionIds,primarySectionIds,aliases,buildingId:targetBuilding.id,buildingCode:targetBuilding.officialCode,canonicalCode:requestedCode,capacity:roomCapacity??null,roomType:roomType,bookingPolicy:bookingPolicy as MasterRoom["bookingPolicy"]};
  const row:MasterRoom={...current,...next,id:current.id,confidence:"CONFIRMED",sharedConfidence:"CONFIRMED",adminVerified:true,updatedAt:now,lastVerifiedAt:now,auditHistory:[...(current.auditHistory||[]),{at:now,byUserId:req.user.SystemUserId,action:targetBuildingId!==current.buildingId?"MOVE_BUILDING":roomCodeChanged?"RENAME_ROOM":"UPDATE",before:{buildingId:current.buildingId,buildingCode:current.buildingCode,canonicalCode:current.canonicalCode,active:current.active,shared:current.shared,collegeIds:current.collegeIds,sectionIds:current.sectionIds,primarySectionIds:current.primarySectionIds},after:next}]};
  /* ── لا نسخة كاملة للنظام قبل نقل قاعة ──────────────────────────────────
   * Moving a room between buildings used to copy the ENTIRE database first:
   * `createSystemRestorePoint` → `makeSystemBackup` → `collectSystemDocuments`
   * walks every Firestore collection and writes it all back in batches of 300.
   * On this data that is minutes of work, and the platform cuts the request
   * long before the move begins — so the admin saw «تعذر تنفيذ العملية» and
   * nothing moved. The safety copy never completed either.
   *
   * The undo for this operation is the `catch` immediately below: it restores
   * the room document and reverts every schedule patch, row by row, from the
   * values read a line earlier. That is the real safety net, it is precise,
   * and it costs nothing. The full-database copy was a second net stretched
   * over the first — and it was the one that made the fall.
   *
   * (The codebase already reached this conclusion once: the full Firestore
   * walk for exports was moved into a resumable job precisely because "a
   * browser download is the wrong lifetime for a full Firestore walk". The
   * restore point kept doing it inline.) */
  const schedules=targetBuildingId!==current.buildingId||roomCodeChanged?await Repository.getSchedules():[];
  const roomWasAddressedByLegacyCode=(schedule:FSchedule)=>!schedule.roomId
    && String(schedule.buildingId||"")===current.buildingId
    && String(schedule.AdRoomHall||"").normalize("NFKC").trim().toUpperCase().replace(/\s+/g,"")===current.canonicalCode;
  let affected=schedules.filter(schedule=>schedule.roomId===current.id||(roomCodeChanged&&roomWasAddressedByLegacyCode(schedule)));
  if(roomCodeChanged&&targetBuildingId===current.buildingId){
    const terms=await Repository.getTerms();
    const activeId=currentTermId(terms as any)||Number(sortTermsNewestServer(terms)[0]?.AdTermId||0);
    const activeTerm=terms.find(term=>Number(term.AdTermId)===activeId);
    const activeChronology=activeTerm?termChronologyServer(activeTerm):Number.NEGATIVE_INFINITY;
    const currentAndFutureTermIds=new Set(terms.filter(term=>termChronologyServer(term)>=activeChronology).map(term=>Number(term.AdTermId)));
    affected=affected.filter(schedule=>currentAndFutureTermIds.has(Number(schedule.AdTermId)));
  }
  const schedulePatches:Array<{id:number;fields:Partial<FSchedule>}>=affected.map(schedule=>({id:schedule.id,fields:{
    ...(targetBuildingId!==current.buildingId?{buildingId:targetBuilding.id,AdRoomCode:targetBuilding.officialCode,locationStatus:"VERIFIED" as const,locationResolvedAt:now}:{}),
    ...(roomCodeChanged?{AdRoomHall:requestedCode}:{}),
  }}));
  if(schedulePatches.length){
    try{await Repository.upsertLocationRooms([row]);await Repository.applyLocationSchedulePatches(schedulePatches);}
    catch(error){await Repository.upsertLocationRooms([current]);await Repository.applyLocationSchedulePatches(affected.map(schedule=>({id:schedule.id,fields:{
      ...(targetBuildingId!==current.buildingId?{buildingId:schedule.buildingId,AdRoomCode:schedule.AdRoomCode,locationStatus:schedule.locationStatus,locationResolvedAt:schedule.locationResolvedAt}:{}),
      ...(roomCodeChanged&&schedule.AdRoomHall!==undefined?{AdRoomHall:schedule.AdRoomHall}:{}),
    }})));throw error;}
  }else await Repository.upsertLocationRooms([row]);
  invalidateLocationRegistry();res.json({...row,updatedScheduleCount:schedulePatches.length});
});
app.put("/api/admin/location-registry/review/:id", requirePermission(7), requirePowerAdmin, async (req:AuthenticatedRequest,res:Response)=>{
  const cases=await Repository.getLocationReviewCases();const current=cases.find(x=>x.id===req.params.id);if(!current){res.status(404).json({error:"حالة المراجعة غير موجودة"});return;}
  const requested=String(req.body?.status||"");if(!["open","resolved","ignored"].includes(requested)){res.status(400).json({error:"حالة المراجعة غير صالحة"});return;}const resolution=String(req.body?.resolution||"").trim();if(requested==="resolved"&&!resolution){res.status(400).json({error:"اكتب قرار الإدارة قبل إغلاق الحالة"});return;}
  const row:LocationReviewCase={...current,status:requested as any,resolution:resolution||current.resolution,resolvedAt:requested==="open"?undefined:new Date().toISOString(),resolvedBy:requested==="open"?undefined:req.user.SystemUserId};await Repository.upsertLocationReviewCases([row]);res.json(row);
});
app.get("/api/admin/location-registry/migration/preview", requirePermission(7), requirePowerAdmin, async (_req:AuthenticatedRequest,res:Response)=>{
  const registry=await readLocationRegistry();const rows=await Repository.getSchedules();const plan=buildMigrationPlan(rows,registry,"preview");res.json({version:plan.version,stats:plan.stats,details:plan.details,reviewSeed:seedRegistry().reviewCases.length});
});
app.post("/api/admin/location-registry/migration/apply", requirePermission(7), requirePowerAdmin, async (req:AuthenticatedRequest,res:Response)=>{
  if(req.get("x-schedule-confirm")!=="initialize-location-registry"){res.status(409).json({error:"يتطلب التهيئة تأكيداً صريحاً"});return;}
  const runs=await Repository.getLocationMigrationRuns();const done=runs.find(x=>x.version===LOCATION_MIGRATION_VERSION&&x.status==="completed");if(done){res.json({success:true,alreadyInitialized:true,run:done});return;}
  /* ── ولا نسخة كاملة قبل التهيئة ─────────────────────────────────────────
   * Same defect, and this is where it was first seen: the initialise button
   * appeared to do nothing. It was not doing nothing — it was copying the
   * whole database before reaching its own first line of work, and dying
   * there. That is why `locationMigrationLogs` was empty and the run list
   * read `[]`: the server never got as far as writing the run record.
   *
   * This migration carries its own rollback and always did: every patched row
   * is journalled with its previous values in `appendLocationMigrationLogs`,
   * the `catch` below replays those in reverse, and
   * POST /migration/:id/rollback replays them on demand afterwards. Removing
   * the snapshot removes a duplicate guarantee, not the guarantee. */
  const seed=seedRegistry();await Promise.all([Repository.upsertLocationBuildings(seed.buildings),Repository.upsertLocationRooms(seed.rooms),Repository.upsertLocationReviewCases(seed.reviewCases)]);invalidateLocationRegistry();
  const registry=await readLocationRegistry(true);const rows=await Repository.getSchedules();const run=newMigrationRun(req.user.SystemUserId,{});const plan=buildMigrationPlan(rows,registry,run.id);run.stats=plan.stats;await Repository.saveLocationMigrationRun(run);
  try{await Repository.applyLocationSchedulePatches(plan.patches);await Repository.appendLocationMigrationLogs(plan.logs);run.status="completed";run.completedAt=new Date().toISOString();await Repository.saveLocationMigrationRun(run);res.json({success:true,run});}
  catch(error:any){
    try{await Repository.applyLocationSchedulePatches(plan.logs.map(log=>({id:log.scheduleId,fields:rollbackPatch(log)})));}catch(rollbackError){console.error("Location migration emergency rollback failed",rollbackError);}
    run.status="failed";run.completedAt=new Date().toISOString();await Repository.saveLocationMigrationRun(run);throw error;
  }
});
app.post("/api/admin/location-registry/migration/:id/rollback", requirePermission(7), requirePowerAdmin, async (req:AuthenticatedRequest,res:Response)=>{
  if(req.get("x-schedule-confirm")!=="rollback-location-registry"){res.status(409).json({error:"يتطلب التراجع تأكيداً صريحاً"});return;}
  const runs=await Repository.getLocationMigrationRuns();const run=runs.find(x=>x.id===req.params.id);if(!run){res.status(404).json({error:"تشغيل المهاجرة غير موجود"});return;}if(run.status==="rolled_back"){res.json({success:true,alreadyRolledBack:true,run});return;}
  const logs=await Repository.getLocationMigrationLogs(run.id);await Repository.applyLocationSchedulePatches(logs.map(log=>({id:log.scheduleId,fields:rollbackPatch(log)})));run.status="rolled_back";run.completedAt=new Date().toISOString();await Repository.saveLocationMigrationRun(run);res.json({success:true,count:logs.length,run});
});
}
