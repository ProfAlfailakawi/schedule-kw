/**
 * ── استيرادُ ملفات PDF ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import express, { Response } from "express";
import { createHmac } from "crypto";
import { Repository } from "../../db/repository";
import { acceptedPdfSourceLabel, pdfTermAccepted } from "../../utils/pdfTermRule";
import { applyVisitingToFaculty, recoverRetiredFromPrintedName } from "../../utils/visitingToFaculty";
import { ensureSectionFaculty } from "../sectionFaculty";
import type { MasterBuilding, MasterRoom } from "../../types";
import { AR, countOf, oblique } from "../../utils/arabicCount";
import { displayInstructorText, instructorIdentityTokens, readableInstructorName, registryCandidatesFor } from "../../utils/instructorIdentity";
import { ocrDocument, parseScheduleTable, readAuthorityPdfHeader, SCAN_READING_BUSY_MESSAGE, ScanReadingBusyError, GREY_PHOTO_REFUSAL, scanRefusalMessage, unresolvedDaysReason, restoredDaysReason } from "../../utils/documentOcr";
import { recoverAuthorityScanRowsFromHistory } from "../../utils/authorityScanRecovery";
import { academicDigits, assignAuthoritySections, authorityDepartmentCode, authorityDepartmentMatches, normalizeAuthoritySectionCode } from "../../utils/authorityAcademicCodes";
import { isInvalidLocationToken, resolveAuthorityLocation, resolveRoom } from "../../utils/locationRegistry";
import { officialCollegeSitePrefix, officialSiteLabel } from "../../utils/locationCollegePrefixes";
import { resolveBranchScope } from "../../utils/branchScope";
import { pagesAwaitingReview } from "../../utils/importPageReview";
import { type AuthenticatedRequest, requirePermission, requireRootAdmin, ROOT_ADMIN_USER_ID } from "../core/auth";
import { documentReadingGate } from "../core/http";
import { invalidateLocationRegistry, readLocationRegistry } from "../core/locations";
import { academicSectionNameMatches, foldHeaderIdentity } from "../core/ordering";
import { isScopeAllowed } from "../core/scope";
import { branchOwnScopes, collegeFallbackInstructorIds, departmentInstructorIdSet, type PdfImportReceipt, placeholderInstructorIds, safeDraftRows, smartContextFrom, validateSmartRows, visitingToFacultyPlan } from "../core/smartImport";
import { asciiDigits } from "../core/studentIdentity";

/* ── مواقع الفرع تدخل السجل من الوثيقة المعتمدة ───────────────────────────
 *
 * سجل المباني بُني من تاريخ الجداول، وتاريخ القسم كله من مقره الرئيسي. فحين
 * جاءت وثيقة الجهة تحمل صفوف الجهراء والفحيحيل معاً، وجد النظام مبنى الجهراء
 * 012J14 مسجَّلاً — لأن للقسم فيه تاريخاً — ولم يجد للفحيحيل 012F15 شيئاً.
 * فخرج صف الفحيحيل بلا مبنى ولا قاعة، ولا مبنى في القائمة يُختار له: القسم
 * يدرّس في موقع لا يعرفه سجله.
 *
 * والوثيقة المعتمدة هي بعينها المرجع الذي يُبنى منه السجل. فحين تُثبت رمزاً
 * رسمي الشكل تماماً — ثلاثة أرقام فرع، حرف موقع، رقمَا مبنى — لموقعٍ له كلية
 * مسجَّلة في النظام داخل فرع الوثيقة نفسه، فذلك إثبات لا تخمين، ويُسجَّل.
 *
 * وحدوده ثلاثة، وهي التي تجعله آمناً:
 *   • المواقع الأخرى وحدها. المقر المفتوح سجله مبنيّ من تاريخه، وأي زيادة
 *     فيه من قراءة ضوئية احتمالُ خطئها أكبر من فائدتها.
 *   • الشكل الرسمي الكامل فقط. لا اختصار ولا ترميم ولا رقم مجاور.
 *   • الفرع نفسه. 011 بنين لا يدخل من وثيقة 012 بنات مهما كان الشكل صحيحاً.
 */
async function provisionBranchSiteLocationsFromAuthority(
  registry:{buildings:MasterBuilding[];rooms:MasterRoom[]},
  rows:readonly any[],
  ctx:{branchRoot:string;baseSitePrefix?:string;colleges:readonly any[];sections:readonly any[];collegeId:number;sectionId:number;byUserId:number},
):Promise<{buildings:string[];rooms:string[]}>{
  const branchRoot=String(ctx.branchRoot||"").replace(/\D/g,"").slice(0,3);
  const basePrefix=String(ctx.baseSitePrefix||"").toUpperCase();
  if(!branchRoot)return {buildings:[],rooms:[]};

  const scopeOf=(prefix:string)=>resolveBranchScope(prefix,{colleges:ctx.colleges as any,sections:ctx.sections as any,baseCollegeId:ctx.collegeId,baseSectionId:ctx.sectionId});
  const now=new Date().toISOString();
  const buildingByCode=new Map(registry.buildings.map(item=>[String(item.officialCode||"").toUpperCase(),item]));
  const newBuildings:MasterBuilding[]=[];
  const newRooms:MasterRoom[]=[];
  const roomKeys=new Set(registry.rooms.map(room=>`${room.buildingId}|${String(room.canonicalCode||"").toUpperCase()}`));

  for(const row of rows){
    /* حدٌّ للطول ثم حذفُ محرفٍ محرف: `\s+` على نصٍّ قادم من ملفٍ خارجي مسارٌ
       معروف لاستنزاف المعالج بمدخل طويل، ولا حاجة إليه هنا أصلاً. */
    const reading=String(row?.sourceBuildingText||row?.AdRoomCode||"").slice(0,40).normalize("NFKC").replace(/\s/g,"").toUpperCase();
    const shape=reading.match(/^(\d{3})([A-Z])(\d{2})$/);
    if(!shape||shape[1]!==branchRoot)continue;
    /* لا يعبر من القراءة إلى هوية المستند حرفٌ واحد كما قُرئ: الكود يُعاد
       بناؤه من أجزاء النمط الثلاثة، فما يُكتب معرّفاً في قاعدة البيانات
       مُولَّدٌ عندنا لا منقولٌ من ملف. */
    const code=`${shape[1]}${shape[2]}${shape[3]}`;
    const prefix=`${shape[1]}${shape[2]}`;
    if(!prefix||prefix===basePrefix)continue;               // المقر المفتوح لا يُوسَّع من قراءة ضوئية
    const scope=scopeOf(prefix);
    if(!scope||scope.isBase)continue;                       // موقع بلا كلية مسجَّلة: لا يُخترع له شيء

    let building=buildingByCode.get(code);
    if(!building){
      building={
        id:`building_${code}`,officialCode:code,sitePrefix:prefix,prefix:shape[1],siteLetter:shape[2],
        buildingNumber:String(Number(shape[3])),siteName:scope.siteLabel,branchName:scope.collegeName,description:"",
        active:true,aliases:[],collegeIds:[scope.collegeId],sectionIds:[scope.sectionId],
        historicalUsageCount:0,firstTermId:null,lastTermId:null,roomCount:0,
        confidence:"CONFIRMED",source:"AUTHORITY_DOCUMENT",adminVerified:false,
        evidence:[`أثبتت وثيقة الجدول المعتمدة الرمز الرسمي ${code} لموقع «${scope.siteLabel}» داخل الفرع ${branchRoot}.`],
        auditHistory:[{at:now,byUserId:ctx.byUserId,action:"CREATE"}],createdAt:now,updatedAt:now,lastVerifiedAt:now,
      } as MasterBuilding;
      buildingByCode.set(code,building);newBuildings.push(building);
    }else if(!building.sectionIds.includes(scope.sectionId)){
      /* المبنى مسجَّل والقسم يدرّس فيه بشهادة الوثيقة: تُضاف علاقته وحدها. */
      building={...building,sectionIds:[...building.sectionIds,scope.sectionId],updatedAt:now};
      buildingByCode.set(code,building);newBuildings.push(building);
    }

    const roomReading=String(row?.sourceRoomText||row?.AdRoomHall||"").slice(0,40).normalize("NFKC").replace(/\s/g,"").toUpperCase();
    const roomShape=roomReading.match(/^([A-Z]{1,2})(\d{1,3})$/);
    if(!roomShape||isInvalidLocationToken(roomReading))continue;
    const roomCode=`${roomShape[1]}${roomShape[2]}`;
    const key=`${building.id}|${roomCode}`;
    if(roomKeys.has(key))continue;
    roomKeys.add(key);
    newRooms.push({
      id:`room_${code}_${roomCode}`,buildingId:building.id,buildingCode:code,canonicalCode:roomCode,active:true,
      aliases:[],collegeIds:[scope.collegeId],sectionIds:[scope.sectionId],primarySectionIds:[scope.sectionId],
      shared:false,sharedConfidence:"CONFIRMED",historicalUsageCount:0,
      confidence:"CONFIRMED",source:"AUTHORITY_DOCUMENT",adminVerified:false,
      evidence:[`أثبتت وثيقة الجدول المعتمدة القاعة ${roomCode} داخل المبنى ${code} لقسم «${scope.sectionName}» في «${scope.siteLabel}».`],
      auditHistory:[{at:now,byUserId:ctx.byUserId,action:"CREATE"}],createdAt:now,updatedAt:now,lastVerifiedAt:now,
    } as MasterRoom);
  }

  if(newBuildings.length)await Repository.upsertLocationBuildings(newBuildings);
  if(newRooms.length)await Repository.upsertLocationRooms(newRooms);
  if(newBuildings.length||newRooms.length)invalidateLocationRegistry();
  return {buildings:newBuildings.map(item=>item.officialCode),rooms:newRooms.map(item=>`${item.buildingCode}/${item.canonicalCode}`)};
}
async function signPdfImportReceipt(payload:PdfImportReceipt){
  const body=Buffer.from(JSON.stringify(payload),"utf8").toString("base64url");
  const secret=await Repository.getStudentCaseSecret();
  const signature=createHmac("sha256",secret).update(`pdf-import|${body}`).digest("base64url");
  return`${body}.${signature}`;
}

export function registerPdfImportRoutes(app: Express): void {


/* Root-only recovery for a PDF that proves it belongs to another scientific
 * department in the SAME college. The file itself is re-read here; the client
 * is never trusted to invent a department code/name. If the department already
 * exists we return it. If it does not, the root administrator may create it
 * once, and a proven same-name catalogue elsewhere is used only as a template
 * for missing course rows. Repeating the action is idempotent. */
app.post("/api/intelligence/pdf-import/bootstrap-section", requirePermission(7), requireRootAdmin, express.raw({ type: "application/octet-stream", limit: "24mb" }), documentReadingGate, async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.query.collegeId||0),termId=Number(req.query.termId||0);
  const bytes=Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0);
  if(!collegeId||!termId||!bytes.length){res.status(400).json({error:"لم تكتمل بيانات الكلية/الفصل أو ملف PDF."});return;}
  const [college,sections,allCourses]=await Promise.all([Repository.getCollegeById(collegeId),Repository.getSections(),Repository.getCourses()]);
  if(!college){res.status(404).json({error:"الكلية المحددة غير موجودة."});return;}
  const sitePrefix=officialCollegeSitePrefix(college.AdCollegeName);
  if(!sitePrefix){res.status(409).json({error:"لا يوجد كود موقع رسمي مثبت لهذه الكلية؛ لم تتم إضافة أي قسم."});return;}
  const authorityCollegeCode=academicDigits(sitePrefix).slice(0,2);
  const header=await readAuthorityPdfHeader(bytes);
  if(header.requiresLandscapeUpload){res.status(422).json({error:"دوّر صفحات الجدول للوضع الأفقي ثم أعد الرفع.",code:"PDF_SCAN_REQUIRES_LANDSCAPE"});return;}
  if(Array.isArray(header.greyPhotoPages)&&header.greyPhotoPages.length){res.status(422).json({error:GREY_PHOTO_REFUSAL,code:"PDF_SCAN_GREY_PHOTO",pages:header.greyPhotoPages});return;}
  if(header.busy){res.status(503).json({error:SCAN_READING_BUSY_MESSAGE,code:"SCAN_READING_BUSY"});return;}
  if(!header.branch||!header.department){res.status(422).json({error:"لم أتمكن من إثبات الكلية/الفرع والقسم من ترويسة الصفحة الأولى؛ لم تتم إضافة أي قسم.",code:"PDF_BOOTSTRAP_HEADER_UNRESOLVED"});return;}
  const sourceSite=officialCollegeSitePrefix(header.branch.name);
  const branchCode=String(header.branch.code||"").replace(/\D/g,"");
  const targetBranchCode=sitePrefix.slice(0,3).replace(/\D/g,"");
  const branchMatches=branchCode&&targetBranchCode?branchCode===targetBranchCode:Boolean(sourceSite&&sourceSite.slice(0,3)===sitePrefix.slice(0,3));
  if(!branchMatches){res.status(409).json({error:`الملف تابع إلى «${header.branch.label}» وليس «${officialSiteLabel(sitePrefix,college.AdCollegeName)}»؛ لم تتم إضافة أي قسم.`,code:"PDF_BRANCH_MISMATCH"});return;}
  const sourceCode=academicDigits(header.department.code);
  if(!/^\d{4}$/.test(sourceCode)||!authorityCollegeCode||!sourceCode.startsWith(authorityCollegeCode)){
    res.status(409).json({error:`رمز القسم «${String(header.department.code||"")}» لا يثبت قسماً داخل هذه الكلية؛ لم تتم إضافة أي قسم.`,code:"PDF_DEPARTMENT_UNSAFE_TO_CREATE"});return;
  }
  const inCollege=sections.filter((item:any)=>Number(item.AdCollegeId)===collegeId);
  const numeric=inCollege.filter((item:any)=>authorityDepartmentMatches(sourceCode,authorityCollegeCode,item.AdSectionCode));
  const sourceName=String(header.department.name||"").trim();
  const named=sourceName?inCollege.filter((item:any)=>academicSectionNameMatches(sourceName,item.AdSectionName)):[];
  if(numeric.length>1||(!numeric.length&&named.length>1)){res.status(409).json({error:"يوجد أكثر من قسم محتمل داخل الكلية؛ لم يتم إنشاء قسم أو اختيار واحد عشوائياً.",code:"PDF_DEPARTMENT_AMBIGUOUS"});return;}
  let section:any=numeric[0]||named[0];
  let created=false;
  const globalNameMatches=sourceName?sections.filter((item:any)=>academicSectionNameMatches(sourceName,item.AdSectionName)):[];
  const canonicalNames=[...new Set(globalNameMatches.map((item:any)=>String(item.AdSectionName||"").trim()).filter(Boolean))];
  const cleaned=sourceName.replace(/\s*\([^)]*\)\s*/g," ").replace(/^\s*قسم\s+/,"").replace(/\s+/g," ").trim();
  const sectionName=canonicalNames.length===1?canonicalNames[0]:(cleaned?`قسم ${cleaned}`:`قسم ${sourceCode}`);
  if(!section){
    try{section=await Repository.createSection(collegeId,sourceCode,sectionName);created=true;}
    catch(error:any){
      const refreshed=await Repository.getSectionsByCollege(collegeId);
      section=refreshed.find((item:any)=>authorityDepartmentMatches(sourceCode,authorityCollegeCode,item.AdSectionCode));
      if(!section){res.status(409).json({error:error?.message||"تعذرت إضافة القسم من الملف.",code:"PDF_DEPARTMENT_CREATE_FAILED"});return;}
    }
  }

  if(created){try{await ensureSectionFaculty(Repository,collegeId,Number(section.AdSectionId));}catch(error:any){console.error("[pdf-bootstrap] faculty placeholder:",error?.stack||error);}}
  /* If the section is new/empty, copy only catalogue identities from the best
     proven same-name department already in the system. This is catalogue data,
     never OCR text: course name/credits/hours/max all come from the existing
     system row. The importer will still use only courses actually present in
     the PDF and all normal validators remain in force. */
  let copiedCourses=0;
  const targetCourses=(await Repository.getCourses()).filter((course:any)=>Number(course.AdCollegeId)===collegeId&&Number(course.AdSectionId)===Number(section.AdSectionId));
  const targetTails=new Set(targetCourses.map((course:any)=>academicDigits(course.CourseCode).slice(-3)).filter(Boolean));
  const templateSections=globalNameMatches.filter((item:any)=>Number(item.AdSectionId)!==Number(section.AdSectionId));
  const coursesBySection=new Map<number,any[]>();
  for(const course of allCourses as any[]){const sid=Number(course.AdSectionId);const list=coursesBySection.get(sid)||[];list.push(course);coursesBySection.set(sid,list);}
  templateSections.sort((a:any,b:any)=>(coursesBySection.get(Number(b.AdSectionId))?.length||0)-(coursesBySection.get(Number(a.AdSectionId))?.length||0));
  const template=templateSections.find((item:any)=>(coursesBySection.get(Number(item.AdSectionId))?.length||0)>0);
  if(template){
    for(const origin of coursesBySection.get(Number(template.AdSectionId))||[]){
      const tail=academicDigits(origin.CourseCode).slice(-3);if(!tail||targetTails.has(tail))continue;
      try{
        await Repository.createCourse(collegeId,Number(section.AdSectionId),String(origin.CourseCode||"").trim(),String(origin.CourseName||"").trim(),Number(origin.CourseCredit||0),Number(origin.CourseHours||0),Number(origin.MaxStudent||0));
        targetTails.add(tail);copiedCourses+=1;
      }catch{/* A concurrent/idempotent duplicate is harmless; normal import validation decides what is usable. */}
    }
  }
  res.status(created?201:200).json({success:true,created,copiedCourses,section:{AdSectionId:Number(section.AdSectionId),AdSectionCode:String(section.AdSectionCode||sourceCode),AdSectionName:String(section.AdSectionName||sectionName),AdCollegeId:collegeId},sourceDepartment:header.department.label});
});

app.post("/api/intelligence/pdf-import", requirePermission(7), express.raw({ type: "application/octet-stream", limit: "24mb" }), documentReadingGate, async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const bytes=Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0);
  if(!bytes.length){res.status(400).json({error:"لم يصل ملف PDF"});return;}

  /* DOCUMENT PRE-FLIGHT MUST RUN BEFORE TABLE READING — for text PDFs AND
     image-only CamScanner PDFs. readAuthorityPdfHeader reads page 1 only. */
  const [terms,colleges,sections]=await Promise.all([
    Repository.getTerms(),Repository.getColleges(),Repository.getSections(),
  ]);
  const targetTerm=terms.find((row:any)=>Number(row.AdTermId)===termId);
  const targetCollege=colleges.find((row:any)=>Number(row.AdCollegeId)===collegeId);
  const targetSection=sections.find((row:any)=>Number(row.AdSectionId)===sectionId&&Number(row.AdCollegeId)===collegeId);
  const targetCollegeName=String(targetCollege?.AdCollegeName||"");
  const targetSitePrefix=officialCollegeSitePrefix(targetCollegeName);
  /* SWRSCHA separates the two-digit COLLEGE authority (02) from the branch
     (022). The application catalogue may keep a branch/site code in
     AdCollegeCode, so department identity must be built from the official site
     prefix first: 022T -> 02, 0420 -> 04, 0520 -> 05. Basic Education
     011/012 therefore remains 01 exactly as before. */
  const targetAuthorityCollegeCode=(()=>{
    const siteDigits=academicDigits(targetSitePrefix);
    if(siteDigits.length>=2)return siteDigits.slice(0,2);
    const catalogueDigits=academicDigits(targetCollege?.AdCollegeCode);
    return catalogueDigits.length>=2?catalogueDigits.slice(0,2):catalogueDigits;
  })();
  let headerPreflight=await readAuthorityPdfHeader(bytes);

  const authoritySectionFromHeader=(header:any)=>{
    if(!header?.department)return undefined;
    const sourceDepartment=academicDigits(header.department.code);
    const inCollege=sections.filter((item:any)=>Number(item.AdCollegeId)===collegeId);
    const numeric=inCollege.filter((item:any)=>authorityDepartmentMatches(sourceDepartment,targetAuthorityCollegeCode,item.AdSectionCode));
    if(numeric.length===1)return numeric[0];
    const sourceName=foldHeaderIdentity(header.department.name);
    if(sourceName.length>=5){
      const named=inCollege.filter((item:any)=>academicSectionNameMatches(sourceName,foldHeaderIdentity(item.AdSectionName)));
      if(named.length===1)return named[0];
    }
    return undefined;
  };
  const suggestedSectionName=(header:any)=>{
    const raw=String(header?.department?.name||"").replace(/\s*\([^)]*\)\s*/g," ").replace(/^\s*قسم\s+/," ").replace(/\s+/g," ").trim();
    const globalMatches=sections.filter((item:any)=>raw&&academicSectionNameMatches(raw,item.AdSectionName));
    const names=[...new Set(globalMatches.map((item:any)=>String(item.AdSectionName||"").trim()).filter(Boolean))];
    return names.length===1?names[0]:(raw?`قسم ${raw}`:"قسم جديد");
  };
  let occupiedChecked=false;
  const targetTermIsEmpty=async()=>{
    if(occupiedChecked)return true;
    occupiedChecked=true;
    const occupied=await Repository.getSchedulesByScope({collegeId,sectionId,termId});
    if(!occupied.length)return true;
    const body={error:"نسخ جدول PDF متاح للفصل الفارغ فقط. أنشئ فصلاً فارغاً أو اختر واحداً بلا مواعيد.",code:"PDF_TARGET_TERM_OCCUPIED"};
    if(/ndjson|text\/event-stream/i.test(String(req.get("accept")||""))){res.status(409).json(body);}else res.status(409).json(body);
    return false;
  };

  /* Restore the proven orientation safety guard. Keep the protection, but only
     return the short instruction the user asked for — the old explanatory
     paragraph is intentionally gone. */
  if(headerPreflight.requiresLandscapeUpload){
    res.status(422).json({
      error:"دوّر صفحات الجدول للوضع الأفقي ثم أعد الرفع.",
      code:"PDF_SCAN_REQUIRES_LANDSCAPE",
      pages:Array.isArray(headerPreflight.requiresLandscapePages)?headerPreflight.requiresLandscapePages:undefined,
    });
    return;
  }
  /* صورة رمادية لا مسح: تُردّ في ثوانٍ قبل أي قراءة، لا بعد دقائق تنتهي بنفاد
     ذاكرة الخادم و«انقطع الاتصال» (greyPhotoVerdict). */
  if(Array.isArray(headerPreflight.greyPhotoPages)&&headerPreflight.greyPhotoPages.length){
    res.status(422).json({error:GREY_PHOTO_REFUSAL,code:"PDF_SCAN_GREY_PHOTO",pages:headerPreflight.greyPhotoPages});
    return;
  }
  /* Another scan holds the OCR workers: refuse now, in words, rather than let
     this request wait in a queue that the platform's 300 s limit would cut. */
  if(headerPreflight.busy){res.status(503).json({error:SCAN_READING_BUSY_MESSAGE,code:"SCAN_READING_BUSY"});return;}

  /* Scope validation is shared by the cheap page-1 preflight and the full OCR
     rescue. A partial preflight is NOT a rejection: image-only CamScanner PDFs
     can make one tiny header field disappear at probe resolution even when the
     same field is perfectly readable on the high-resolution page. */
  const headerScopeProblem=(header:any):{status:number;body:any}|null=>{
    if(header?.term&&targetTerm){
      const targetName=asciiDigits(String(targetTerm.AdTermName||"")).normalize("NFKC");
      /* لا يُقبل إلا الفصل نفسه من السنة السابقة (الثاني 2026/2027 ← الثاني 2025/2026)؛
         فصل السنة نفسها لا جدول رسمي له بعد، وما عداه لا يُنسب لهذا الفصل. */
      if(!pdfTermAccepted(header.term,targetName))return{status:409,body:{
        error:`هذا الملف للفصل «${header.term.label}»، ولا يُقبل هنا إلا «${acceptedPdfSourceLabel(targetName)||"فصل السنة السابقة"}» لأن الفصل المختار «${String(targetTerm.AdTermName||"")}». لم يتم استيراد أي صف.`,
        code:"PDF_TERM_MISMATCH",sourceTerm:header.term.label,targetTerm:String(targetTerm.AdTermName||""),acceptedTerm:acceptedPdfSourceLabel(targetName),
      }};
    }

    /* Header branch is a DOCUMENT property. A different document branch is a
       hard stop; a different building prefix in ONE body row is handled later
       as CROSS_BRANCH and is not confused with this check. */
    if(header?.branch&&targetSitePrefix){
      const sourceSite=officialCollegeSitePrefix(header.branch.name);
      const branchCode=String(header.branch.code||"").replace(/\D/g,"");
      const targetBranchCode=targetSitePrefix.slice(0,3).replace(/\D/g,"");
      /* الرمز ذو الخانات الثلاث هو هوية الفرع؛ الاسم يختلف رسمه (كليه/كلية)
         ولا يميّز مواقع الفرع الواحد (012 يضم الرئيسي والجهراء والفحيحيل).
         فلا يُحتكم إلى الاسم إلا حين يغيب الرمز. */
      const definiteMismatch=branchCode&&targetBranchCode
        ?branchCode!==targetBranchCode
        :Boolean(sourceSite&&sourceSite.slice(0,3)!==targetSitePrefix.slice(0,3));
      if(definiteMismatch){
        const sourceLabel=sourceSite?officialSiteLabel(sourceSite,header.branch.name):header.branch.label;
        return{status:409,body:{
          error:`هذا الملف تابع إلى «${sourceLabel}»، بينما أنت تعمل على «${officialSiteLabel(targetSitePrefix,targetCollegeName)}». لم يتم استيراد أي صف.`,
          code:"PDF_BRANCH_MISMATCH",sourceBranch:header.branch.label,targetBranch:officialSiteLabel(targetSitePrefix,targetCollegeName),
        }};
      }
    }

    if(header?.department&&targetSection){
      const sourceDepartment=academicDigits(header.department.code);
      const targetDepartment=authorityDepartmentCode(targetAuthorityCollegeCode,targetSection.AdSectionCode);
      /* SWRSCHA prints the scientific department as COLLEGE + LOCAL DEPARTMENT:
         college 01 + department 01 => 0101. The system catalogue stores those
         two authorities separately, so comparing 0101 directly with local 01
         is a false mismatch. Build the document key from the real catalogue. */
      const sameDepartment=authorityDepartmentMatches(sourceDepartment,targetAuthorityCollegeCode,targetSection.AdSectionCode);
      const sourceName=foldHeaderIdentity(header.department.name);
      const namedMatches=sourceName.length>=5?sections.filter((item:any)=>Number(item.AdCollegeId)===collegeId).filter((item:any)=>{
        const candidate=foldHeaderIdentity(item.AdSectionName);
        return candidate.length>=5&&academicSectionNameMatches(sourceName,candidate);
      }):[];
      const namedSection=namedMatches.length===1?namedMatches[0]:undefined;
      /* A proven numeric department key outranks OCR name noise. Only when the
         document code is missing do we fall back to a unique Arabic-name match. */
      const definiteMismatch=Boolean(
        sourceDepartment&&targetDepartment
          ?!sameDepartment
          :namedSection&&Number(namedSection.AdSectionId)!==Number(targetSection.AdSectionId)
      );
      if(definiteMismatch){
        const sourceSection=authoritySectionFromHeader(header);
        const sourceCode=academicDigits(header.department.code);
        const canBootstrapSection=Boolean(
          Number(req.user?.SystemUserId||0)===ROOT_ADMIN_USER_ID&&
          /^\d{4}$/.test(sourceCode)&&targetAuthorityCollegeCode&&sourceCode.startsWith(targetAuthorityCollegeCode)
        );
        return{status:409,body:{
          error:`هذا الملف للقسم «${header.department.label}»، بينما القسم المحدد هو «${String(targetSection.AdSectionName||targetSection.AdSectionCode||"")}». لم يتم استيراد أي صف.`,
          code:"PDF_DEPARTMENT_MISMATCH",
          sourceDepartment:header.department.label,
          sourceDepartmentCode:sourceCode,
          sourceDepartmentName:String(header.department.name||""),
          targetDepartment:String(targetSection.AdSectionName||targetSection.AdSectionCode||""),
          suggestedSectionId:Number(sourceSection?.AdSectionId||0)||undefined,
          suggestedSectionName:String(sourceSection?.AdSectionName||suggestedSectionName(header)),
          canBootstrapSection,
        }};
      }
    }
    return null;
  };

  /* Reject a clearly wrong document immediately when all three independent
     header authorities were proven cheaply. If even one field is missing, the
     high-resolution OCR path gets the chance to rescue it instead of producing
     the old false «لم أتمكن من إثبات الكلية/الفرع» regression. */
  if(headerPreflight.term&&headerPreflight.branch&&headerPreflight.department){
    const earlyProblem=headerScopeProblem(headerPreflight);
    if(earlyProblem){res.status(earlyProblem.status).json(earlyProblem.body);return;}
    if(!await targetTermIsEmpty())return;
  }

  const [allCourses,allInstructors,sectionHistory,departmentRooms,registrySnapshot,departmentDelegates,visitingRoster]=await Promise.all([
    Repository.getCourses(),Repository.getInstructors(),
    Repository.getSchedulesByScope({collegeId,sectionId}),
    Repository.getDepartmentRooms(collegeId,sectionId),readLocationRegistry(),
    Repository.getDepartmentDelegates(collegeId,sectionId),Repository.getVisitingRoster(collegeId,sectionId,termId),
  ]);
  let registry=registrySnapshot as {buildings:MasterBuilding[];rooms:MasterRoom[]};
  const courses=allCourses.filter((course:any)=>Number(course.AdCollegeId)===collegeId&&Number(course.AdSectionId)===sectionId);

  /* Department history/delegates/visitors remain useful review evidence, but
     automatic instructor identity is stricter than roster membership: the PDF
     name must equal one unique system name after title removal only. No fuzzy or
     abbreviated university-wide match may create an instructor ID. */
  const preferredInstructorIds=new Set<number>([
    ...sectionHistory.map((row:any)=>Number(row.AdInstructorId||0)),
    ...departmentDelegates.map(Number),
    ...(await Repository.getDepartmentFaculty(collegeId,sectionId)).map(Number),
    ...visitingRoster.map(Number),
  ].filter((id:number)=>Number.isFinite(id)&&id>0));
  /* ── القسم الذي يستورد جدوله الأول ────────────────────────────────────────
     كل ما يعرفه النظام عن «أساتذة القسم» مشتقّ من جداول سابقة، وهذه الشاشة لا
     تعمل إلا على فصل فارغ. فالقسم الذي لا جدول له في النظام بعد يدخل الاستيراد
     بنطاق تفضيل فارغ، وعندها تسقط كل البراهين التي تتكئ عليه — الاسم المفرد
     والاسم الناقص حرفاً — ويخرج الجدول كله بخانات أستاذ فارغة.
     حين لا يكون للقسم تاريخ بعد، يتسع النطاق إلى أساتذة الكلية نفسها: نطاق
     حقيقي محدود يُقرأ من جداول أقسامها الأخرى، لا الجامعة كلها. والقسم الذي
     له تاريخ لا يتغير سلوكه إطلاقاً، فهذا المسار لا يُقرأ عنده أصلاً. */
  /* «هيئة تدريسية» وحدها لا تجعل للقسم نطاقاً حقيقياً (القسم الجديد يولد بسجلّها) فيبقى له احتياط الكلية. */
  const importPlaceholderIds=placeholderInstructorIds(allInstructors as any);
  if(![...preferredInstructorIds].some(id=>!importPlaceholderIds.has(id))){
    for(const id of await collegeFallbackInstructorIds(collegeId))preferredInstructorIds.add(id);
  }
  /* ── نطاق المطابقة هو نطاق النشر نفسه ─────────────────────────────────────
     القسم الواحد يُدرَّس في مواقع الفرع الثلاثة، وقانون النشر يقرأ أهله من
     المواقع كلها. لكن المطابقة كانت تقرأ نطاق هذا الموقع وحده، فيضيق عليها
     ما يتسع عند الحفظ: سجل «هيئة تدريسية» المسجّل باسم القسم في موقع آخر لا
     يُرى، ويخرج الاسم غير محسوم رغم أنه مسجّل عند القسم نفسه. تُقرأ اللقطة
     مرة واحدة هنا، فيتطابق ما يراه المطابق وما يقبله النشر وما تعرضه
     المعاينة. */
  const departmentMembership=await departmentInstructorIdSet(
    await Repository.getColleges() as any, await Repository.getSections() as any, collegeId, sectionId, termId,
  );
  for(const id of departmentMembership)preferredInstructorIds.add(id);
  const instructors=allInstructors;
  /* A course-specific roster is only a tie-breaker for NAME evidence. It never
     creates identity by itself: the observed PDF still has to prove two/three
     ordered name tokens and the remaining system candidate must be unique. */
  const courseInstructorIds=new Map<number,Set<number>>();
  for(const historyRow of sectionHistory as any[]){
    const courseId=Number(historyRow.AdCourseId||0),instructorId=Number(historyRow.AdInstructorId||0);
    if(!courseId||!instructorId)continue;
    const set=courseInstructorIds.get(courseId)||new Set<number>();set.add(instructorId);courseInstructorIds.set(courseId,set);
  }

  /* Reading a scan takes over a minute, so the client is kept informed rather
     than left staring at a frozen button. Progress is streamed as NDJSON — one
     JSON object per line — and the final line carries the result. The uploaded
     bytes live only in memory for the duration of this handler; nothing about
     the document is written to disk or the database. */
  const streaming=/ndjson|text\/event-stream/i.test(String(req.get("accept")||""));
  if(streaming){
    res.status(200);
    res.setHeader("Content-Type","application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control","no-store");
    res.setHeader("X-Accel-Buffering","no");
  }
  const emit=(event:any)=>{ if(streaming){res.write(JSON.stringify(event)+"\n");} };

  const encodedFileName=String(req.get("x-file-name")||"الجدول المعتمد.pdf").slice(0,600);
  let fileName=encodedFileName;try{fileName=decodeURIComponent(encodedFileName);}catch{/* A literal header is already the right name. */}

  /* Multi-page photographed tables get one extra, strictly catalogue-bound
     course-key rescue. The one-page OCR path is intentionally unchanged. */
  const ocrDepartmentKey=authorityDepartmentCode(targetAuthorityCollegeCode,targetSection?.AdSectionCode);
  const authorityCourseKeys=courses.map((course:any)=>{
    const digits=academicDigits(course?.CourseCode);
    /* A shared catalogue row can carry the seven-digit key of the college where
       it was first created (for example 0101101), while this SWRSCHA document
       belongs to another college (0201101 / 0401101 ...). Course identity is
       still the same three-digit tail inside the already-proven department.
       Rebuild the document key from that proven scope so multi-page OCR rescue
       uses the same college-aware identity as the normal row matcher. College
       01 is unchanged because ocrDepartmentKey remains its existing 01xx key. */
    if(/^\d{7}$/.test(digits)&&/^\d{4}$/.test(ocrDepartmentKey))return`${ocrDepartmentKey}${digits.slice(-3)}`;
    if(/^\d{3}$/.test(digits)&&/^\d{4}$/.test(ocrDepartmentKey))return`${ocrDepartmentKey}${digits}`;
    return"";
  }).filter(Boolean);

  let recognized;
  try{
    recognized=await ocrDocument(bytes,"application/pdf",stage=>emit({type:"progress",...stage}),{authorityCourseKeys});
  }catch(error:any){
    const message=String(error?.message||"تعذّرت قراءة ملف PDF");
    /* A reading that waited out its turn is the same temporary «busy» the
       preflight answers with, not an invalid document: same code, and 503
       wherever the status line has not been sent yet. */
    const busy=error instanceof ScanReadingBusyError?{code:"SCAN_READING_BUSY"}:{};
    if(streaming){emit({type:"error",error:message,...busy});res.end();return;}
    res.status(error instanceof ScanReadingBusyError?503:422).json({error:message,...busy});return;
  }

  /* The full reader may recover header glyphs that were too small for the cheap
     probe. Merge only missing fields; never overwrite a field already proven by
     the embedded/page-1 preflight. No row parsing or import is allowed until the
     merged header proves term + branch + department and matches the chosen scope. */
  headerPreflight={
    term:headerPreflight.term||recognized.headerTerm,
    branch:headerPreflight.branch||recognized.headerBranch,
    department:headerPreflight.department||recognized.headerDepartment,
    source:headerPreflight.source||((recognized.headerTerm||recognized.headerBranch||recognized.headerDepartment)?"scan":undefined),
  };

  /* Defence in depth for mixed scans: if a later page needed a physical ±90°
     turn, reject before row parsing. All pages must share one stable horizontal
     table geometry so plausible OCR can never drift into neighbouring columns. */
  const rotatedPages=recognized.pageDiagnostics.filter((page:any)=>Number(page.orientation)!==0);
  if(rotatedPages.length){
    const body={
      error:"دوّر صفحات الجدول للوضع الأفقي ثم أعد الرفع.",
      code:"PDF_SCAN_REQUIRES_LANDSCAPE",
      pages:rotatedPages.map((page:any)=>Number(page.page)).filter(Boolean),
    };
    if(streaming){emit({type:"error",...body});res.end();return;}
    res.status(422).json(body);return;
  }

  if(!headerPreflight.term||!headerPreflight.branch||!headerPreflight.department){
    const missing=[!headerPreflight.term?"الفصل والسنة":"",!headerPreflight.branch?"الكلية/الفرع":"",!headerPreflight.department?"القسم":""].filter(Boolean);
    const body={
      error:`لم أتمكن من إثبات ${missing.join(" و")} من ترويسة الصفحة الأولى بعد القراءة عالية الدقة. لم يتم استيراد أي صف. ارفع نسخة أوضح أو راجع الملف.`,
      code:"PDF_HEADER_UNRESOLVED",missingHeaderFields:missing,
    };
    if(streaming){emit({type:"error",...body});res.end();return;}
    res.status(422).json(body);return;
  }
  const finalHeaderProblem=headerScopeProblem(headerPreflight);
  if(finalHeaderProblem){
    if(streaming){emit({type:"error",...finalHeaderProblem.body});res.end();return;}
    res.status(finalHeaderProblem.status).json(finalHeaderProblem.body);return;
  }
  if(!occupiedChecked){
    const occupied=await Repository.getSchedulesByScope({collegeId,sectionId,termId});
    if(occupied.length){
      const body={error:"نسخ جدول PDF متاح للفصل الفارغ فقط. أنشئ فصلاً فارغاً أو اختر واحداً بلا مواعيد.",code:"PDF_TARGET_TERM_OCCUPIED"};
      if(streaming){emit({type:"error",...body});res.end();return;}
      res.status(409).json(body);return;
    }
    occupiedChecked=true;
  }

  /* Once the numeric scientific-department identity is proven, expose the
     canonical system label in the receipt/preview. OCR text such as `0101 01`
     is source evidence, not the department's canonical display identity. */
  if(headerPreflight.department&&targetSection&&authorityDepartmentMatches(
    headerPreflight.department.code,targetAuthorityCollegeCode,targetSection.AdSectionCode
  )){
    const canonicalCode=authorityDepartmentCode(targetAuthorityCollegeCode,targetSection.AdSectionCode);
    const canonicalName=String(targetSection.AdSectionName||"").trim();
    headerPreflight.department={
      code:canonicalCode||academicDigits(headerPreflight.department.code),
      name:canonicalName,
      label:[canonicalCode||academicDigits(headerPreflight.department.code),canonicalName].filter(Boolean).join(" "),
    };
  }

  /* An unreadable scan is refused outright rather than returned as a table of
     blanks: the reader could not otherwise tell which empty cells are the
     document and which are the camera. */
  if(!recognized.legibility.readable){
    const message=recognized.legibility.reason;
    if(streaming){emit({type:"error",error:message});res.end();return;}
    res.status(422).json({error:message});return;
  }
  if(recognized.suspiciousExtraction){
    const message=scanRefusalMessage(recognized.pageDiagnostics);
    if(streaming){emit({type:"error",error:message,code:"SUSPICIOUS_EXTRACTION",pageDiagnostics:recognized.pageDiagnostics});res.end();return;}
    res.status(422).json({error:message,code:"SUSPICIOUS_EXTRACTION",pageDiagnostics:recognized.pageDiagnostics});return;
  }
  emit({type:"progress",phase:"match",page:recognized.pageCount,pages:recognized.pageCount,message:"مطابقة الصفوف بالمقررات والأساتذة"});
  const documentDepartmentCode=authorityDepartmentCode(targetAuthorityCollegeCode,targetSection?.AdSectionCode);
  const parsed=parseScheduleTable(recognized.pages,courses,instructors,preferredInstructorIds,{authorityDepartmentCode:documentDepartmentCode,sequentialSections:true,courseInstructorIds});

  /* MULTI-PAGE SCAN — SAFE MISSING-CELL RECOVERY ONLY
     --------------------------------------------------
     CamScanner/SWRSCHA pages can physically lose one narrow cell while the
     remaining row facts (teacher/time/days/building/room) are still crisp.
     Keep the proven single-page and native-PDF readers untouched. Only for a
     multi-page IMAGE scan, fill values OCR left EMPTY when the observed facts
     match one unambiguous historical schedule fingerprint (or repeated history
     rows that all agree on the recovered value). Existing OCR values are never
     overwritten. */
  const instructorNameById=new Map(allInstructors.map((item:any)=>[Number(item.AdInstructorId),String(item.AdInstructorName||"")]));
  const scanHistoryRecovery=(recognized.pageCount>1&&headerPreflight.source==="scan")
    ?recoverAuthorityScanRowsFromHistory(parsed.rows as any[],sectionHistory as any[],instructorNameById)
    :{recoveredRows:0,recoveredCells:0,rowFields:new Map<number,string[]>()};
  if(scanHistoryRecovery.recoveredRows){
    /* Course identity may have been the missing cropped cell. Re-run ONLY the
       source-preserving section normalizer after recovery; no OCR geometry or
       one-page behaviour is changed. */
    const renumbered=assignAuthoritySections(parsed.rows as any[]);
    parsed.rows.splice(0,parsed.rows.length,...renumbered);
  }

  /* Defence in depth: the preview title is canonical system data, never OCR.
     Even if a future parser regression welds SECTION+CRN into a plausible
     seven-digit token (e.g. 5011894), an unresolved row cannot expose that raw
     evidence as the course title. Raw source text remains in sourceCourseText
     for the editor/audit trail; only a proven AdCourseId may populate the
     user-facing name. */
  const importCourseById=new Map(courses.map((course:any)=>[Number(course.AdCourseId),course]));
  for(const row of parsed.rows as any[]){
    const canonicalCourse=importCourseById.get(Number(row.AdCourseId||0));
    row.AdCourseName=canonicalCourse?String(canonicalCourse.CourseName||""):"";
  }
  /* ── «لم يُربط» يقول لماذا، بالأسماء لا بالحكم وحده ─────────────────────────
     ثلاثة أسباب لا سبب واحد، وعلاجاتها مختلفة تماماً:
     مسجّلٌ أكثر من مرة (سجلّان مختلفان بنفس الاسم المطويّ — النظام يرفض
     الاختيار بين «شخصين»، والعلاج حذف المكرر أو اختيار السجل الصحيح)؛ أو
     ملتبس بمرشح قريب؛ أو غير مسجّل بهذا الاسم أصلاً. الحكم المجرد «غير محسوم»
     ترك المنسّق يحدّق في خانة لا تقول أياً منها — فتُسمّى المرشحون بأسمائهم
     وأرقامهم المدنية، بنفس الظهور المتاح له في قائمة الاختيار أصلاً. */
  const describeCandidate=(person:any)=>`«${String(person?.AdInstructorName||"").trim()}»`;
  const unresolvedInstructorDiagnosis=(row:any):{method:string;reason:string}=>{
    if(row.instructorAmbiguousShortName)return{method:"SHORT_NAME_CONTRADICTED",reason:String(row.instructorAmbiguousShortName)};
    const written=String(row?.sourceInstructorText||"");
    /* ── «هيئة تدريسية» ليست شخصاً، بل سجلّ يملكه كل قسم لنفسه ───────────────
       حين تُطبع في خانة الأستاذ ولا يُحسم شيء، فالسبب ليس غموض اسم: إما أن
       القسم لا سجلّ له بهذا المعنى، أو أن عدة أقسام تحمل سجلات متشابهة ولا
       يجوز للنظام أن ينسب صفوف هذا القسم إلى سجلّ قسم آخر. ويُقال ذلك صراحةً
       بدل رسالة «أضِفه برقمه المدني» التي لا تنطبق على سجلّ بلا شخص. */
    const placeholderKey=instructorIdentityTokens("هيئة تدريسية").join(" ");
    const writtenKey=instructorIdentityTokens(written).join(" ");
    if(writtenKey===placeholderKey||writtenKey.startsWith(`${placeholderKey} `)){
      const placeholderHead=instructorIdentityTokens("هيئة")[0];
      const records=(instructors as any[]).filter(person=>{
        const tokens=instructorIdentityTokens(String(person.AdInstructorName||""));
        const key=tokens.join(" ");
        return key===placeholderKey||key.startsWith(`${placeholderKey} `)||tokens[0]===placeholderHead;
      });
      const mine=records.filter(person=>departmentMembership.has(Number(person.AdInstructorId)));
      if(!records.length)return{method:"UNREGISTERED",reason:"لا يوجد سجل «هيئة تدريسية» للقسم؛ اختر أستاذاً."};
      if(mine.length>1)return{method:"DUPLICATE_REGISTRATION",reason:`«هيئة تدريسية» مكررة في القسم: ${mine.map(describeCandidate).join("، ")}.`};
      return{method:"AMBIGUOUS",reason:"«هيئة تدريسية» لقسم آخر، ولا سجلّ لهذا القسم بعد؛ اخترها من القائمة."};
    }
    /* المرشحون المعروضون أساتذةُ القسم وحدهم: أسماء الجامعة كلها ضجيجٌ أمام
       المراجع، والاختيار الصحيح يكاد يكون دائماً من أهل القسم. */
    /* اسمٌ شوّهه المسح يُبحث له بما بقي منه نظيفاً (readableInstructorName):
       ضجيج «ف0» و«ا88» لا يشارك اسماً حقيقياً في شيء. والاسم النظيف يبقى كما كان. */
    const readable=readableInstructorName(written);
    const {exact:allExact,partial:allPartial}=registryCandidatesFor(readable.garbled&&readable.text?readable.text:written,(instructors as any[]).filter(person=>departmentMembership.has(Number(person.AdInstructorId))) as any);
    const exact=allExact,partial=allPartial;
    if(exact.length>=2){
      return{method:"DUPLICATE_REGISTRATION",reason:`مسجّل أكثر من مرة: ${exact.map(describeCandidate).join("، ")}.`};
    }
    if(exact.length===1){
      return{method:"AMBIGUOUS",reason:`الأقرب: ${describeCandidate(exact[0])}.`};
    }
    if(partial.length){
      return{method:"AMBIGUOUS",reason:`الأقرب: ${partial.map(describeCandidate).join("، ")}.`};
    }
    /* «غير مسجّل» حكمٌ على شخص؛ لا يُقال عن اسمٍ لم يُقرأ بوضوح. */
    if(readable.garbled)return{method:"UNREADABLE_NAME",reason:"اختر الأستاذ من القائمة."};
    return{method:"UNREGISTERED",reason:"غير موجود بين أساتذة القسم."};
  };
  const unresolvedInstructorOutcome=(row:any)=>unresolvedInstructorDiagnosis(row).method;

  const geometryRows=recognized.pageDiagnostics.reduce((sum:any,page:any)=>sum+Number(page.extractedRows||0),0);
  if(geometryRows>=3&&parsed.rows.length<Math.ceil(geometryRows*.7)){
    const message=`أوقفت الاستيراد: حدود الجدول أثبتت ${countOf(geometryRows, oblique(AR.row))} تقريباً، لكن المطابقة أعادت ${parsed.rows.length} فقط. هذا فرق غير آمن وقد يعني انزياح أعمدة أو دمج صفوف. لم يتم استيراد أي صف.`;
    if(streaming){emit({type:"error",error:message,code:"COUNT_RECONCILIATION_FAILED",pageDiagnostics:recognized.pageDiagnostics});res.end();return;}
    res.status(422).json({error:message,code:"COUNT_RECONCILIATION_FAILED",pageDiagnostics:recognized.pageDiagnostics});return;
  }

  /* OCR values are evidence, not registry writes. Full building codes are first
     resolved globally because the code itself is unambiguous; only short/legacy
     values need department context. This also lets us identify a real Fahaheel
     or Jahra exception instead of misclassifying it as an unknown main-campus
     building. */
  /* مواقع الفرع التي أثبتتها الوثيقة تدخل السجل قبل حسم أي صف، وإلا خرج صف
     الفحيحيل بلا مبنى لمجرد أن تاريخ القسم كله من مقره الرئيسي. */
  /* وتسجيلُها زيادةُ خيرٍ لا شرطُ قراءة: إن تعذّرت الكتابة لم يسقط الاستيراد
     كله معها — تُقرأ الصفوف بالسجل كما هو، وتبقى صفوف ذلك الموقع بلا مبنى
     محسوم فيراجعها صاحبها، وهو أهون من ردّ المستند كله بخطأ. */
  let provisioned:{buildings:string[];rooms:string[]}={buildings:[],rooms:[]};
  try{
    provisioned=await provisionBranchSiteLocationsFromAuthority(registry,parsed.rows as any[],{
      branchRoot:academicDigits(headerPreflight.branch?.code).slice(0,3),baseSitePrefix:targetSitePrefix,
      colleges,sections,collegeId,sectionId,byUserId:Number(req.user?.SystemUserId||0),
    });
    if(provisioned.buildings.length||provisioned.rooms.length)registry=await readLocationRegistry(true);
  }catch{
    parsed.issues.push("تعذّر تسجيل مواقع الفرع المذكورة في المستند؛ تابعت القراءة بالسجل الحالي، وما لم يُحسم مبناه يظهر للمراجعة.");
  }

  /* ── ما قرأته الكاميرا يُراجَع قبل أن يُسمّى مؤكداً ─────────────────────────
     طبقة النص تنقل ما طبعته الجهة حرفاً. أما OCR فقد يقرأ «1» من «3 1» أو يبتر
     الرقم المرجعي 13319 إلى 1331، والخلية تبدو ممتلئة سليمة. قاعدتان لا
     تخمين فيهما:
     • الأيام × مدة المحاضرة يجب أن تساوي ساعات المقرر في الكتالوج (بهامش
       فروق الجداول المعروفة ±40 دقيقة أسبوعياً). إن تعذّر الإثبات تبقى
       الأيام للمراجعة، وإن ثبت التناقض تُفرَّغ.
     • الأرقام المرجعية في الصفحة الواحدة بطول واحد؛ الشاذ منها مبتور فيُفرَّغ. */
  const scannedRows=(parsed.rows as any[]).filter(row=>String(row.sourceReadMode||"ocr-grid")!=="pdf-text");
  const ocrDaysReview=new Set<any>();
  if(scannedRows.length){
    const lengthCounts=new Map<number,number>();
    for(const row of scannedRows){const len=String(row.referenceNumber||"").replace(/\D/g,"").length;if(len)lengthCounts.set(len,(lengthCounts.get(len)||0)+1);}
    const dominant=[...lengthCounts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||0;
    const clockMinutes=(value:any)=>{const m=String(value||"").match(/^(\d{2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):-1;};
    for(const row of scannedRows){
      const reference=String(row.referenceNumber||"").replace(/\D/g,"");
      if(reference&&dominant&&reference.length!==dominant){
        parsed.issues.push(`صف «${row.AdCourseName||row.sourceCourseText||"—"}» شعبة ${row.SCode||"—"}: الرقم المرجعي المقروء «${reference}» أقصر أو أطول من بقية الصفحة؛ تُرك فارغاً بدل قيمة مبتورة.`);
        row.referenceNumber="";
      }
      const dayCount=["fsunday","fmonday","ftuesday","fwednesday","fthursday"].filter(key=>row[key]).length;
      if(!dayCount)continue;
      const start=clockMinutes(row.fstarttime),end=clockMinutes(row.fendtime);
      const hours=Number(importCourseById.get(Number(row.AdCourseId||0))?.CourseHours||0);
      if(start<0||end<=start||!hours){ocrDaysReview.add(row);continue;}
      const weekly=dayCount*(end-start),expected=hours*50;
      if(Math.abs(weekly-expected)>40){
        parsed.issues.push(`صف «${row.AdCourseName||"—"}» شعبة ${row.SCode||"—"}: الأيام المقروءة من الصورة (${dayCount}) لا تتسق مع مدة المحاضرة وساعات المقرر؛ فُرّغت لتحديدها يدوياً.`);
        for(const key of ["fsunday","fmonday","ftuesday","fwednesday","fthursday"])row[key]=false;
      }
    }
  }
  /* ── اسمٌ مختصر لا يُثبت شخصاً يُحجز في مكانين ─────────────────────────────
     السجل قد يحفظ الاسم مختصراً («إقبال المطوع») والجهة تطبعه كاملاً
     («اقبال عبدالعزيز المطوع»)، فيُربط بالاسم الأول واسم العائلة. فإن كان صاحب
     السجل يدرّس في كلية أخرى في الساعة نفسها، فالربط ناقضه الدليل: شخصان بالاسم
     المختصر نفسه، لا شخص واحد في مكانين. لا تخمين: تُفرَّغ هوية كل صفوف هذا
     الاسم المطبوع، ويُذكر السبب، ويختار المراجع الأستاذ الصحيح أو يضيفه. */
  {
    const [termSchedules,scopeColleges,scopeSections]=await Promise.all([
      Repository.getSchedulesByScope({termId}),Repository.getColleges(),Repository.getSections(),
    ]);
    const ownScopes=new Set(branchOwnScopes(scopeColleges as any,scopeSections as any,collegeId,sectionId).map(scope=>`${scope.collegeId}:${scope.sectionId}`));
    const external=(termSchedules as any[]).filter(item=>!ownScopes.has(`${Number(item.AdCollegeId)}:${Number(item.AdSectionId)}`));
    const dayKeys=["fsunday","fmonday","ftuesday","fwednesday","fthursday"];
    const minutesOf=(value:any)=>{const m=String(value||"").match(/^(\d{1,2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):-1;};
    const clash=(a:any,b:any)=>dayKeys.some(key=>a[key]&&b[key])&&minutesOf(a.fstarttime)>=0&&minutesOf(b.fstarttime)>=0
      &&minutesOf(a.fstarttime)<minutesOf(b.fendtime)&&minutesOf(b.fstarttime)<minutesOf(a.fendtime);
    const shortened=(row:any)=>{
      const person=instructorNameById.get(Number(row.AdInstructorId||0))||"";
      return instructorIdentityTokens(person).length<instructorIdentityTokens(String(row.sourceInstructorText||"")).length;
    };
    const contradicted=new Set<string>();
    for(const row of parsed.rows as any[]){
      const id=Number(row.AdInstructorId||0);
      if(!id||!row.sourceInstructorText||!shortened(row)||row.importEvidence?.instructor?.source==="MANUAL")continue;
      const other=external.find(item=>Number(item.AdInstructorId)===id&&clash(row,item));
      if(!other)continue;
      contradicted.add(`${id}|${foldHeaderIdentity(row.sourceInstructorText)}`);
    }
    if(contradicted.size){
      const collegeName=new Map((scopeColleges as any[]).map((item:any)=>[Number(item.AdCollegeId),String(item.AdCollegeName||"")]));
      for(const row of parsed.rows as any[]){
        const id=Number(row.AdInstructorId||0);
        if(!contradicted.has(`${id}|${foldHeaderIdentity(row.sourceInstructorText)}`))continue;
        const person=instructorNameById.get(id)||"";
        const clashAt=external.find(item=>Number(item.AdInstructorId)===id&&clash(row,item));
        const where=clashAt?` (يدرّس «${person}» في ${collegeName.get(Number(clashAt.AdCollegeId))||"كلية أخرى"} في الوقت نفسه)`:"";
        row.AdInstructorId=0;
        row.instructorMatchMethod="";
        row.instructorAmbiguousShortName=`«${displayInstructorText(row.sourceInstructorText)}» يطابق «${person}» بالاسم المختصر فقط${where}؛ غالباً شخص آخر بالاسم نفسه — اختر الأستاذ أو أضفه.`;
      }
    }
  }
  const confirmedOfficialBuildingCodes=registry.buildings.filter((item:any)=>item.confidence==="CONFIRMED").map((item:any)=>String(item.officialCode||""));
  const sourceBranchRoot=academicDigits(headerPreflight.branch?.code).slice(0,3);
  for(const row of parsed.rows as any[]){
    /* Preserve the scanner's raw cells for audit even when safe historical
       recovery supplied a missing canonical input. The resolver may use the
       recovered value, but sourceBuildingText/sourceRoomText remain exactly
       what OCR actually saw (including an empty cell). */
    const sourceBuildingRaw=String(row.sourceBuildingText||"");
    const sourceRoomRaw=String(row.sourceRoomText||"");
    const rawBuilding=String(row.sourceBuildingText||row.AdRoomCode||"");
    const rawHall=String(row.sourceRoomText||row.AdRoomHall||"");
    row.sourceBuildingText=sourceBuildingRaw;row.sourceRoomText=sourceRoomRaw;
    const token=rawBuilding.normalize("NFKC").replace(/\s+/g,"").toUpperCase();
    const normalizedInstructor=foldHeaderIdentity(row.sourceInstructorText);
    const sectionToken=String(row.SCode||"").replace(/\D/g,"");
    const sourceSectionToken=normalizeAuthoritySectionCode(row.sourceSectionText);
    const authoritySectionConfirmed=/^\d{3}$/.test(sectionToken)&&Number(sectionToken)>=501;
    const sectionMatchesSource=Boolean(sourceSectionToken&&sectionToken===sourceSectionToken);
    const activeDayKeys=["fsunday","fmonday","ftuesday","fwednesday","fthursday"].filter(key=>Boolean(row[key]));
    const timeConfirmed=/^\d{2}:\d{2}$/.test(String(row.fstarttime||""))&&/^\d{2}:\d{2}$/.test(String(row.fendtime||""))&&String(row.fendtime)>String(row.fstarttime);
    const readMode=String(row.sourceReadMode||"ocr-grid");
    const readSource=readMode==="pdf-text"?"PDF_TEXT_LAYER":readMode==="ocr-fallback"?"OCR_FALLBACK":"OCR_GRID_CELL";
    const recoveredFields=new Set<string>(Array.isArray(row.__authorityHistoryRecoveredFields)?row.__authorityHistoryRecoveredFields:[]);
    const fieldSource=(...fields:string[])=>fields.some(field=>recoveredFields.has(field))?"HISTORICAL_UNIQUE_FINGERPRINT":readSource;
    const fieldDerived=(...fields:string[])=>fields.some(field=>recoveredFields.has(field));
    const instructorMethod=String(row.instructorMatchMethod||"");
    const instructorScore=Number(row.instructorMatchScore||0);
    row.importEvidence={
      course:{raw:[row.sourceCourseCode,row.sourceCourseText].filter(Boolean).join(" · "),normalized:String(row.sourceCourseCode||"").replace(/\D/g,""),canonical:Number(row.AdCourseId)||undefined,confidence:Number(row.AdCourseId)?(fieldDerived("AdCourseId")?"REVIEW_REQUIRED":"CONFIRMED"):"UNRESOLVED",score:Number(row.AdCourseId)?100:0,source:fieldSource("AdCourseId"),method:fieldDerived("AdCourseId")?"HISTORICAL_UNIQUE_FINGERPRINT":"COURSE_NUMBER_TO_SYSTEM_CATALOGUE",derived:fieldDerived("AdCourseId"),reason:Number(row.AdCourseId)?(fieldDerived("AdCourseId")?"خلية رقم المقرر كانت فارغة؛ استعيدت فقط لأن بقية حقائق الصف طابقت سجلاً تاريخياً واحد المعنى":"رقم المقرر مطابق صراحةً لكتالوج القسم؛ الاسم مأخوذ من النظام فقط"):"لم يثبت رقم المقرر من مفتاح صريح",evidence:["رقم المقرر في المستند","كتالوج القسم الحالي","اسم المقرر من النظام لا من OCR"]},
      section:{raw:String(row.sourceSectionText||""),normalized:sectionToken,canonical:authoritySectionConfirmed?sectionToken:undefined,confidence:authoritySectionConfirmed?"CONFIRMED":"UNRESOLVED",score:authoritySectionConfirmed?(sectionMatchesSource?100:99):0,source:"SYSTEM_SEQUENCE",method:"COURSE_LOCAL_501_SEQUENCE",derived:!sectionMatchesSource,reason:authoritySectionConfirmed?(sectionMatchesSource?"رقم الشعبة مولد حسب ترتيب شعب المقرر (501 ثم 502…) ويطابق ما طُبع في المستند":"رقم الشعبة مولد حسب ترتيب شعب المقرر: 501 ثم 502 ثم 503…؛ ما قُرئ من الخلية يبقى شاهداً"):"تعذر توليد رقم شعبة: هوية المقرر لم تثبت",evidence:["المقرر canonical","ترتيب ظهور شعب المقرر في المستند","بداية ثابتة 501"]},
      days:{raw:String(row.sourceDaysText||""),normalized:activeDayKeys.join(","),canonical:activeDayKeys.join(",")||undefined,confidence:activeDayKeys.length?((ocrDaysReview.has(row)||fieldDerived("fsunday","fmonday","ftuesday","fwednesday","fthursday"))?"REVIEW_REQUIRED":"CONFIRMED"):"UNRESOLVED",score:activeDayKeys.length?100:0,source:fieldSource("fsunday","fmonday","ftuesday","fwednesday","fthursday"),method:fieldDerived("fsunday","fmonday","ftuesday","fwednesday","fthursday")?"HISTORICAL_UNIQUE_FINGERPRINT":"SAME_CELL_DAYS",derived:fieldDerived("fsunday","fmonday","ftuesday","fwednesday","fthursday"),reason:activeDayKeys.length?(fieldDerived("fsunday","fmonday","ftuesday","fwednesday","fthursday")?restoredDaysReason(row.sourceDaysText):"أيام المحاضرة قُرئت من خلية الأيام نفسها"):unresolvedDaysReason(row.sourceDaysText),evidence:["لا استعارة لأرقام الأيام من أعمدة الساعات أو المقاعد"]},
      time:{raw:String(row.sourceTimeText||""),normalized:[row.fstarttime,row.fendtime].filter(Boolean).join("-"),canonical:timeConfirmed?[row.fstarttime,row.fendtime].join("-"):undefined,confidence:timeConfirmed?(fieldDerived("fstarttime","fendtime")?"REVIEW_REQUIRED":"CONFIRMED"):"UNRESOLVED",score:timeConfirmed?100:0,source:fieldSource("fstarttime","fendtime"),method:fieldDerived("fstarttime","fendtime")?"HISTORICAL_UNIQUE_FINGERPRINT":"SAME_CELL_TIME_PAIR",derived:fieldDerived("fstarttime","fendtime"),reason:timeConfirmed?(fieldDerived("fstarttime","fendtime")?"خلية الوقت كانت ناقصة؛ استعيدت من تطابق تاريخي فريد مع تطبيع HH:MM فقط":"زوج الوقت مثبت من خلية الوقت نفسها"):"الوقت غير مكتمل أو غير صالح",evidence:["نطاق وقت جامعي صالح","لا استعارة من عمود المبنى"]},
      instructor:{raw:String(row.sourceInstructorText||""),normalized:normalizedInstructor,canonical:Number(row.AdInstructorId)||undefined,confidence:Number(row.AdInstructorId)?(fieldDerived("AdInstructorId")?"REVIEW_REQUIRED":"CONFIRMED"):"UNRESOLVED",score:Number(row.AdInstructorId)?Math.max(90,instructorScore||96):0,source:fieldSource("AdInstructorId"),method:fieldDerived("AdInstructorId")?"HISTORICAL_UNIQUE_FINGERPRINT":(Number(row.AdInstructorId)?(instructorMethod||"SYSTEM_UNIQUE"):unresolvedInstructorOutcome(row)),derived:fieldDerived("AdInstructorId")||Boolean(Number(row.AdInstructorId)&&!['EXACT_FULL','FACULTY_IDENTITY'].includes(instructorMethod)),reason:Number(row.AdInstructorId)?(fieldDerived("AdInstructorId")?"اسم الأستاذ لم يُحسم من OCR؛ استعيدت الهوية فقط من بصمة صف تاريخية غير ملتبسة":"هوية واحدة مؤكدة من سجل النظام بعد تطبيع الألقاب والأسماء"):unresolvedInstructorDiagnosis(row).reason,evidence:Number(row.AdInstructorId)?["تطبيع NFKC","إزالة د./ا./ا.د. من بداية الاسم فقط",`طريقة المطابقة ${instructorMethod||"SYSTEM_UNIQUE"}`,"مطابقة اسم النظام فقط","رفض أي نتيجة متعارضة"]:["لا إنشاء لاسم من PDF","لا اختيار عند تعدد المرشحين"]},
      building:{raw:sourceBuildingRaw,normalized:token,confidence:"UNRESOLVED",score:0,source:fieldSource("AdRoomCode"),method:fieldDerived("AdRoomCode")?"HISTORICAL_UNIQUE_FINGERPRINT":"REGISTRY_PENDING",derived:fieldDerived("AdRoomCode"),reason:fieldDerived("AdRoomCode")?"خلية المبنى كانت فارغة؛ استعيد رمزها من بصمة صف تاريخية غير ملتبسة":"بانتظار المطابقة مع سجل المباني الرسمي",evidence:["خلية المبنى الأصلية"]},
      room:{raw:sourceRoomRaw,normalized:rawHall.normalize("NFKC").replace(/\s+/g,"").toUpperCase(),confidence:"UNRESOLVED",score:0,source:fieldSource("AdRoomHall"),method:fieldDerived("AdRoomHall")?"HISTORICAL_UNIQUE_FINGERPRINT":"BUILDING_BOUND_ROOM_PENDING",derived:fieldDerived("AdRoomHall"),reason:fieldDerived("AdRoomHall")?"خلية القاعة كانت فارغة؛ استعيدت من بصمة صف تاريخية غير ملتبسة":(rawHall?"بانتظار إثبات علاقة القاعة بالمبنى":"القاعة فارغة في المصدر"),evidence:["خلية القاعة الأصلية"]},
    };
    /* مقرر حُسم من خانات رقمه المقروءة واسمه المطبوع (courseMatchMethod) يُعرض
       للمراجعة بسببه، لا «مطابق صراحةً». */
    if(row.courseMatchMethod&&Number(row.AdCourseId))Object.assign(row.importEvidence.course,{confidence:"REVIEW_REQUIRED",score:80,method:String(row.courseMatchMethod),
      reason:row.courseMatchMethod==="PRINTED_NAME_OVER_LAST_DIGIT"
        ?`رقم المقرر المقروء «${String(row.sourceCourseCode||"")}» يخالف الاسم المطبوع؛ اختير مقرر العائلة نفسها الذي يطابق الاسم — راجعه.`
        :row.courseMatchMethod==="PRINTED_NAME_DISAGREES"
          ?`اسم المقرر المطبوع لا يشبه «${String(row.AdCourseName||"").trim()}»؛ تحقّق من رقم المقرر واختر الصحيح إن لزم.`
          :`رقم المقرر لم يُقرأ كاملاً («${String(row.sourceCourseCode||"")}»)؛ حُدّد من خاناته المقروءة واسمه المطبوع — راجعه.`,
      evidence:["خانات رقم المقرر المقروءة","الاسم المطبوع في المستند","كتالوج القسم الحالي"]});
    /* One resolver owns the complete Authority location grammar. This prevents
       parser branches from disagreeing about whether a token is a building and
       guarantees Building -> Room registry validation for every row. */
    const location=resolveAuthorityLocation(registry,{
      rawBuilding,rawRoom:rawHall,collegeId,sectionId,branchRoot:sourceBranchRoot,
      sitePrefix:targetSitePrefix,knownOfficialCodes:confirmedOfficialBuildingCodes,
    });
    const building=location.building;
    if(building.status!=="CONFIRMED"||!building.value){
      row.buildingId=undefined;row.roomId=undefined;row.locationStatus="LOCATION_REVIEW_REQUIRED";
      /* Never display unverified OCR as a canonical location. Keep the raw cell
         only in sourceBuildingText/sourceRoomText for review. This is the final
         guard against capacity welds such as 345045/520020 appearing in the
         Building column even if an upstream parser ever regresses. */
      row.AdRoomCode="";row.AdRoomHall="";
      Object.assign(row.importEvidence.building,{confidence:"UNRESOLVED",reason:"القيمة لا تطابق مبنى Canonical صريحاً",evidence:["سجل المباني الرسمي","لا قصّ لرقم مجاور ولا تخمين"]});
      parsed.issues.push(`صف «${row.AdCourseName||row.AdCourseId}» شعبة ${row.SCode||"—"}: المبنى المقروء «${rawBuilding||"فارغ"}» غير محسوم؛ اختر مبنى رسميًا.`);continue;
    }

    const sourceSitePrefix=String(building.value.sitePrefix||building.value.officialCode.slice(0,4)).toUpperCase();
    const sourceSiteLabel=officialSiteLabel(sourceSitePrefix);
    row.AdRoomCode=building.value.officialCode;
    row.sourceSitePrefix=sourceSitePrefix;
    row.sourceSiteLabel=sourceSiteLabel;
    /* Keep the old professional cue beside the course name for legitimate
       alternate sites of the SAME Authority branch (e.g. 012J/012F inside the
       012 girls report). It is informational, not a blocking mismatch. */
    if(targetSitePrefix&&sourceSitePrefix!==targetSitePrefix&&sourceBranchRoot&&sourceSitePrefix.slice(0,3).replace(/\D/g,"")===sourceBranchRoot){
      row.courseSiteLabel=sourceSiteLabel;
      row.courseSiteMessage=`هذه الشعبة تُدرّس في «${sourceSiteLabel}» بحسب المبنى ${building.value.officialCode}.`;
    }else{
      row.courseSiteLabel=undefined;row.courseSiteMessage=undefined;
    }
    /* 012B / 012F / 012J are different SITES of the same Authority branch 012.
       The department PDF legitimately contains Fahaheel/Jahra rows alongside
       the main girls campus. Treat a site as cross-branch only when its branch
       root differs (e.g. 011 boys vs 012 girls), not merely because B/F/J differs. */
    const sourceBranchCode=sourceSitePrefix.slice(0,3).replace(/\D/g,"");
    const sameAuthorityBranch=Boolean(sourceBranchRoot&&sourceBranchCode&&sourceBranchRoot===sourceBranchCode);
    if(targetSitePrefix&&sourceSitePrefix&&sourceSitePrefix!==targetSitePrefix&&!sameAuthorityBranch){
      const sourceLabel=officialSiteLabel(sourceSitePrefix);
      const targetLabel=officialSiteLabel(targetSitePrefix,targetCollegeName);
      row.buildingId=undefined;row.roomId=undefined;row.locationStatus="LOCATION_REVIEW_REQUIRED";
      row.sourceSitePrefix=sourceSitePrefix;
      row.scopeMismatchType="CROSS_BRANCH";
      row.scopeMismatchLabel=`فرع آخر · ${sourceLabel}`;
      row.scopeMismatchMessage=`هذه الشعبة تابعة إلى «${sourceLabel}» بحسب المبنى ${building.value.officialCode}، بينما الاستيراد الحالي لـ «${targetLabel}». لن يُضاف هذا السطر إلى الكلية المحددة قبل مراجعته.`;
      Object.assign(row.importEvidence.building,{canonical:building.value.id,confidence:"REVIEW_REQUIRED",reason:"المبنى Canonical مؤكد لكنه يعود إلى فرع آخر",evidence:[`الرمز الرسمي ${building.value.officialCode}`,`بادئة الموقع ${sourceSitePrefix}`]});
      parsed.issues.push(`صف «${row.AdCourseName||row.AdCourseId}» شعبة ${row.SCode||"—"}: ${row.scopeMismatchMessage}`);
      continue;
    }

    row.buildingId=building.value.id;
    const buildingDerived=location.buildingMethod!=="EXACT_REGISTRY";
    const buildingFromHistory=fieldDerived("AdRoomCode");
    Object.assign(row.importEvidence.building,{canonical:building.value.id,confidence:buildingFromHistory?"REVIEW_REQUIRED":"CONFIRMED",score:location.buildingScore,method:buildingFromHistory?"HISTORICAL_UNIQUE_FINGERPRINT":location.buildingMethod,derived:buildingDerived||buildingFromHistory,reason:buildingDerived?"استعادة مقيدة بالكامل بالسجل الرسمي؛ لم يتم اختراع كود مبنى":"تطابق صريح مع رمز مبنى رسمي",evidence:[...building.evidence,`طريقة الحسم ${location.buildingMethod}`,`الرمز الرسمي ${building.value.officialCode}`]});
    /* Once the building identity is confirmed, the user's rule is simple:
       a room is valid iff it exists under THAT building. Do not wrongly reject
       a legitimate Jahra/Fahaheel room because the current upload was opened
       from the main-campus college context. Building -> Room is the authority. */
    const room=location.room||resolveRoom(registry,rawHall,building.value.id,{});
    if(room.status!=="CONFIRMED"||!room.value){
      row.roomId=undefined;row.locationStatus="LOCATION_REVIEW_REQUIRED";
      /* Building is confirmed and may remain visible; the unconfirmed room may
         not. Raw room evidence stays separately for the editor/reviewer. */
      row.AdRoomHall="";
      Object.assign(row.importEvidence.room,{confidence:"UNRESOLVED",reason:rawHall?`لم تثبت القاعة داخل المبنى ${building.value.officialCode}`:"القاعة فارغة في المصدر؛ يلزم اختيار قاعة أو PENDING_ROOM صراحةً",evidence:["سجل القاعات الرسمي","علاقة Building ↔ Room"]});
      parsed.issues.push(`صف «${row.AdCourseName||row.AdCourseId}» شعبة ${row.SCode||"—"}: القاعة المقروءة «${rawHall||"فارغة"}» غير معروفة داخل ${building.value.officialCode}؛ اختر قاعة رسمية أو «بانتظار تثبيت القاعة».`);continue;
    }
    row.roomId=room.value.id;row.AdRoomHall=room.value.canonicalCode;row.locationStatus="VERIFIED";
    const roomFromHistory=fieldDerived("AdRoomHall");
    Object.assign(row.importEvidence.room,{canonical:room.value.id,confidence:roomFromHistory?"REVIEW_REQUIRED":"CONFIRMED",score:location.roomScore||100,method:roomFromHistory?"HISTORICAL_UNIQUE_FINGERPRINT":(location.roomScore&&location.roomScore<100?"REGISTRY_CONSTRAINED_REPAIR":"EXACT_ROOM_IN_BUILDING"),derived:roomFromHistory||Boolean(location.roomScore&&location.roomScore<100),reason:"قاعة Canonical مؤكدة داخل المبنى المحدد",evidence:[...room.evidence,`المبنى ${building.value.officialCode}`,`القاعة ${room.value.canonicalCode}`]});
  }

  /* The sheet names its own term in the header. Uploading last year's export
     into this year's term is the one mistake no row-level check can catch —
     every row is valid, just a year old — so the two are compared here and a
     mismatch becomes a loud issue that blocks the one-step publish. */
  if(!headerPreflight.term&&recognized.headerTerm&&targetTerm){
    const targetName=asciiDigits(String(targetTerm.AdTermName||"")).normalize("NFKC");
    if(!pdfTermAccepted(recognized.headerTerm,targetName)){
      parsed.issues.unshift(`تحذير: الملف يذكر «${recognized.headerTerm.label}» بينما الفصل المختار هو «${String(targetTerm.AdTermName||"")}»، ولا يُقبل إلا «${acceptedPdfSourceLabel(targetName)||"فصل السنة السابقة"}». تأكد أنك ترفع الجدول إلى الفصل الصحيح.`);
    }
  }
  recoverRetiredFromPrintedName(parsed.rows as any[],allInstructors as any);
  const visitingReplaced=applyVisitingToFaculty(parsed.rows as any[],await visitingToFacultyPlan(collegeId,sectionId,termId));
  if(visitingReplaced)parsed.issues.push(`استُبدل المنتدبون والمتقاعدون والمتفرغون بـ«هيئة تدريسية» في ${countOf(visitingReplaced, oblique(AR.section))}.`);
  const rows=assignAuthoritySections(safeDraftRows(parsed.rows,collegeId,sectionId,termId));
  const structural=rows.length?await validateSmartRows(rows,collegeId,sectionId,{checkConflicts:true,requireDepartmentInstructor:true,departmentInstructorIds:departmentMembership}):[];
  /* تنبيهُ الصفحة (سطرٌ مطبوع لم يُقرأ، صفٌّ غير واضح) يتصدّر ملاحظات المعاينة
     ولا يوقف الملف: خانات الصفوف غير الواضحة فارغةٌ فتمنع حفظ صفّها وحده. */
  const pageWarnings=(recognized.pageDiagnostics||[]).filter((page:any)=>page.warning).map((page:any)=>`الصفحة ${page.page}: ${page.warning}`);
  parsed.issues.unshift(...pageWarnings);
  /* Conflict errors and structural errors block publishing until resolved */
  const parserNotes=[...new Set(parsed.issues)];
  const blocking=[...new Set([
    ...structural,
    ...parserNotes.filter((issue:string)=>/^تحذير:/.test(String(issue))),
  ])];
  const issues=[...new Set([...blocking,...parserNotes])];
  const reviewPages=pagesAwaitingReview(recognized.pageDiagnostics,[]);
  const importReceipt=await signPdfImportReceipt({
    v:1,collegeId,sectionId,termId,issuedAt:new Date().toISOString(),
    sourceTerm:headerPreflight.term.label,sourceBranch:headerPreflight.branch.label,sourceDepartment:headerPreflight.department.label,
    ...(reviewPages.length?{reviewPages}:{}),
  });
  const evidenceFields=["course","section","days","time","instructor","building","room"];
  let confirmedCells=0,derivedCells=0,reviewCells=0,readyRows=0;
  for(const row of rows as any[]){
    let rowReady=true;
    for(const key of evidenceFields){
      const proof=row.importEvidence?.[key];
      if(proof?.confidence==="CONFIRMED"){confirmedCells++;if(proof.derived)derivedCells++;}
      else{reviewCells++;rowReady=false;}
    }
    if(rowReady)readyRows++;
  }
  const verificationSummary={confirmedCells,derivedCells,reviewCells,readyRows,reviewRows:Math.max(0,rows.length-readyRows),historyRecoveredRows:scanHistoryRecovery.recoveredRows,historyRecoveredCells:scanHistoryRecovery.recoveredCells};
  /* Keep physical page identity all the way to the reviewer. This is not merely
     cosmetic: it makes the multi-page contract observable — page N can be
     reviewed independently and its rows can be compared with a standalone
     upload of page N without guessing boundaries from array slices. */
  const pageSummaries=Array.from({length:recognized.pageCount},(_,offset)=>{
    const page=offset+1;
    const pageRows=(rows as any[]).filter(row=>Number(row.sourcePage||1)===page);
    let pageReady=0;
    for(const row of pageRows){
      const proofs=evidenceFields.map(key=>row.importEvidence?.[key]);
      if(proofs.every((proof:any)=>proof?.confidence==="CONFIRMED"))pageReady++;
    }
    const diagnostic=recognized.pageDiagnostics.find((item:any)=>Number(item.page)===page);
    return{page,rows:pageRows.length,ready:pageReady,review:Math.max(0,pageRows.length-pageReady),suspicious:Boolean(diagnostic?.suspicious),diagnostic};
  });
  /* ── الشاشة لا يجوز أن تكذّب المطابقة ──────────────────────────────────
     كان الخادم يطابق الاسم على مستوى سجل الجامعة ويثبّت هويته في الصف، بينما
     تبني الشاشة قائمة العرض من أساتذة القسم وحدهم. فالهوية التي طابقها الخادم
     فعلاً لا تُوجد في خريطة العرض، فيظهر الصف أحمر بوسم «غير محسوم» وتحته سبب
     النجاح نفسه: «هوية واحدة مؤكدة من سجل النظام». لذلك تُرسل مع النتيجة أسماء
     من رُبطوا فعلاً: عرضٌ فقط، لا يوسّع قائمة الاختيار ولا يمنح أحداً عضوية
     القسم — ومن كان خارج القسم يبقى كهرمانياً للمراجعة كما هو، لكن باسمه
     الرسمي من النظام لا بنصّ OCR. */
  /* ومعها قائمة أهل القسم كما يقرؤها قانون النشر نفسه، فلا تجتهد الشاشة في
     تعريف «أهل القسم» وتنذر على من يقبله الحفظ أصلاً. */
  const departmentInstructorIds=[...departmentMembership];
  const resolvedInstructors=[...new Map((rows as any[])
    .map(row=>Number(row.AdInstructorId)||0).filter(id=>id>0)
    .map(id=>[id,allInstructors.find((person:any)=>Number(person.AdInstructorId)===id)])
    .filter(([,person])=>Boolean(person)) as Array<[number,any]>).values()]
    .map((person:any)=>({AdInstructorId:Number(person.AdInstructorId),AdInstructorName:String(person.AdInstructorName||"")}));
  const result={
    rows,issues,blockingIssues:blocking,ready:rows.length>0&&blocking.length===0,verificationSummary,pageSummaries,resolvedInstructors,departmentInstructorIds,
    fileName:fileName.slice(0,180),
    pages:recognized.pageCount,confidence:recognized.confidence,
    legibility:recognized.legibility,
    pageDiagnostics:recognized.pageDiagnostics,
    suspiciousExtraction:recognized.suspiciousExtraction,
    importReceipt,
    headerBranch:headerPreflight.branch||recognized.headerBranch||undefined,
    headerDepartment:headerPreflight.department||recognized.headerDepartment||undefined,
    headerTerm:headerPreflight.term||recognized.headerTerm||undefined,
    message:rows.length?`تمت قراءة ${countOf(rows.length, oblique(AR.section))} من ${countOf(recognized.pageCount, oblique(AR.page))}`:`لم أتمكن من استخراج شعب من الملف`,
  };
  if(streaming){emit({type:"done",result});res.end();return;}
  res.json(result);
});
}
