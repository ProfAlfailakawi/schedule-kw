/**
 * ── استيرادُ الجدول وتصديرُه ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { Response } from "express";
import { Repository, ScheduleRevisionConflict } from "../../db/repository";
import { RequestHoldConflict, RequestReservationConflict } from "../../utils/instructorRequestReservations";
import { requestHoldRefusal } from "../core/scheduleConflicts";
import { captureScopeVersion, recordVersionAfter } from "../core/versions";
import { planRegistrarNumbering } from "../../utils/registrarNumbering";
import { readSectionNumberLedger, recordSectionNumberLedger } from "../core/sectionNumbers";
import { normalizeCivilId } from "../../utils/civilId";
import { DAY_FLAGS, DAY_LABELS } from "../../utils/naturalQuery";
import { blockingConflicts } from "../../utils/scheduleBlockers";
import { formatScheduleTimeRange, normalizeClock } from "../../utils/scheduleTime";
import { resolveBuilding, resolveRoom } from "../../utils/locationRegistry";
import { noteScheduleMutation, scheduleLockRefusal, wholesaleRefusal } from "../core/approvals";
import { type AuthenticatedRequest, requirePermission } from "../core/auth";
import { canonicalizeLocationForWrite, readLocationRegistry } from "../core/locations";
import { locateRowsBySite, splitRowsByBranch, unplacedSiteIssue } from "../../utils/branchScope";
import { AR, countOf } from "../../utils/arabicCount";
import { authorityCourseCode, authorityDepartmentKeys } from "../../utils/authorityAcademicCodes";
import { SCHEDULE_DAY_KEYS, schedulePayloadIssues } from "../core/scheduleRules";
import { filterByScope, isScopeAllowed } from "../core/scope";
import { checkRegistrarPdf, looksForeign, slimPdfRow, type RegistrarCheckResult } from "../../utils/registrarCheck";
import { buildRequestItems, requestSummary, tickRequestItem, verifyRequestItems, type RegistrarRequestDoc } from "../../utils/registrarRequest";
import { authorityBaselineForScope, authorityDraftForScope, buildAuthorityPdfDiff, buildAuthorityPdfDiffWithHistory } from "../core/authority";
import { isPowerUser, requireAuth } from "../core/auth";
import { canReviewSubmissions } from "../../utils/academicRoles";
import { randomBytes } from "crypto";
import { roundBaselineVersionId } from "../../utils/approvalWorkflow";
import { chooseCaptureBaseline } from "../../utils/changesBaseline";
import { readApproval } from "../core/approvals";
import { approvalBlockerOptions, blockingImportConflicts, branchOwnScopes, placeholderInstructorIds, safeDraftRows, validateSmartRows, visitingToFacultyPlan } from "../core/smartImport";

/**
 * ── فحصُ جدول التسجيل: المقارنة نفسها لكل طريق (قراءةٌ محضة) ─────────────────
 *
 * الرقمُ المرجعي لصفوفنا يُشتقّ كما يشتقّه «تقرير تغييرات الجدول» حرفاً بحرف: اقترانُ
 * ملف التسجيل الأصلي (وثيقة الهيئة) بالجدول الحيّ، ثم `source.referenceNumber ||
 * row.referenceNumber`. ونسخةُ آخر إرسال تُقرن بالوثيقة نفسها، فيُعرف رقمُ ما حذفناه بعده.
 */
function registrarCheckScope(req: AuthenticatedRequest, res: Response) {
  const collegeId=Number(req.body?.collegeId||0),sectionId=Number(req.body?.sectionId||0),termId=Number(req.body?.termId||0);
  if(!collegeId||!sectionId||!termId){res.status(400).json({error:"حدد الكلية والقسم والفصل."});return null;}
  if(!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return null;}
  if(!Array.isArray(req.body?.rows)){res.status(400).json({error:"لم تصل صفوف الملف المقروءة."});return null;}
  if(req.body.rows.length>600){res.status(400).json({error:"عدد الصفوف أكبر من الحد الآمن للفحص."});return null;}
  return {collegeId,sectionId,termId,rows:req.body.rows.map(slimPdfRow) as any[]};
}

async function runRegistrarCheck(collegeId:number,sectionId:number,termId:number,pdfRows:any[]):Promise<RegistrarCheckResult>{
  const [liveRows,instructors,courses,approval,authorityDraft]=await Promise.all([
    Repository.getSchedulesByScope({collegeId,sectionId,termId}),Repository.getInstructors(),Repository.getCourses(),
    readApproval(collegeId,sectionId,termId),authorityDraftForScope(collegeId,sectionId,termId),
  ]);

  /* ما رآه التسجيل آخر مرّة: القاعدةُ نفسها التي يقرأ بها «تغييرات الجدول» أساسَ الجولة الجارية. */
  let sent:any[]|undefined;
  const baselineId=roundBaselineVersionId(approval,approval.currentRound);
  if(baselineId){
    sent=(await Repository.getScheduleVersionById(baselineId))?.rows as any[]|undefined;
  }else{
    const history=await Repository.getScheduleVersions(collegeId,sectionId,termId,100);
    const choice=chooseCaptureBaseline(approval.rounds as any,approval.currentRound,history as any);
    if(choice.kind==="capture")sent=(await Repository.getScheduleVersionById(choice.versionId))?.rows as any[]|undefined;
    else if(choice.kind==="reviewed")sent=liveRows as any[];
  }

  const instructorById=new Map((instructors as any[]).map(row=>[Number(row.AdInstructorId),String(row.AdInstructorName||"")]));
  let crn:{byId:Map<number,string>;original:any[];originalById?:Map<number,string>}|undefined;
  if(authorityDraft){
    const scopedBaseline=await authorityBaselineForScope(authorityDraft.baselineRows||[],authorityDraft,collegeId,sectionId);
    const options={instructorNameById:instructorById,publishedRows:authorityDraft.rows||[],courseCodeById:new Map((courses as any[]).map(row=>[Number(row.AdCourseId),String(row.CourseCode||"").trim()]))};
    const byId=new Map<number,string>();
    const originalById=new Map<number,string>();
    /* موعدٌ اعتمد ترقيمَ التسجيل يُعرف برقمه المرجعي الجديد، ويبقى رقمُ الملف الأصلي طريقَه إلى ما كان. */
    const take=(rows:any[])=>{for(const entry of rows){
      if(!entry.current||byId.has(Number(entry.current.id)))continue;
      const id=Number(entry.current.id),adopted=entry.current.registrarNumberedAt&&entry.current.referenceNumber;
      byId.set(id,String(adopted?entry.current.referenceNumber:entry.source?.referenceNumber||entry.current.referenceNumber||""));
      if(adopted&&entry.source?.referenceNumber)originalById.set(id,String(entry.source.referenceNumber));
    }};
    take((await buildAuthorityPdfDiffWithHistory(scopedBaseline,liveRows as any[],options,{collegeId,sectionId,termId})).rows);
    if(sent&&sent!==liveRows)take(buildAuthorityPdfDiff(scopedBaseline,sent,options).rows);
    crn={byId,original:scopedBaseline,originalById} as any;
  }

  const courseRows=(courses as any[]).filter(row=>Number(row.AdCollegeId)===collegeId&&Number(row.AdSectionId)===sectionId);
  return checkRegistrarPdf({
    live:liveRows as any[],pdf:pdfRows,sent,crn,
    names:{
      instructorById,
      courseCodeById:new Map(courseRows.map(row=>[Number(row.AdCourseId),String(row.CourseCode||"").trim()])),
      courseNameById:new Map(courseRows.map(row=>[Number(row.AdCourseId),String(row.CourseName||"").trim()])),
      placeholderIds:placeholderInstructorIds(instructors as any),
    },
  });
}

/** طلباتُ التعديل للتسجيل: وثيقةٌ لكل فحصٍ محفوظ، معرّفُها يبدأ بنطاقه `${termId}:${collegeId}:${sectionId}:`. */
const requestPrefix=(termId:number,collegeId:number,sectionId:number)=>`${termId}:${collegeId}:${sectionId}:`;
const REQUESTS_PER_SCOPE=30;
async function holdsPermission(req:AuthenticatedRequest,formId:number){
  const granted=req.permissions??(await Repository.getSecurityByUser(Number(req.user?.SystemUserId||0))).map((item:any)=>Number(item.FormNameId));
  return granted.includes(formId);
}
/** من يقرأ طلبات قسمٍ: صاحبُ الجدول (النموذج 7)، أو موظّفُ التسجيل المراجع، أو الإدارة — وكلٌّ بنطاقه. */
/* فحوصُ ملف التسجيل للقسم وحده (قرار المالك 2026-11-20): التسجيلُ المراجع لا يقرؤها ولا يشطب بنودها. */
async function mayReadRequests(req:AuthenticatedRequest){
  if(isPowerUser(req))return true;
  if(canReviewSubmissions(req.user?.Role))return false;
  return await holdsPermission(req,7);
}
const mayTickRequests=(req:AuthenticatedRequest)=>isPowerUser(req);

export function registerScheduleImportRoutes(app: Express): void {

/**
 * ── ما سيرفضه الحفظ، يُقال قبل الضغط ────────────────────────────────────────
 *
 * معاينة الاستيراد تملك صفوفها وحدها، فلا ترى حجزاً في قاعة يستعملها قسم آخر
 * في الفصل نفسه. وبوابة النشر ترى الفصل كله، فترفض. فيظهر زر «تعبئة ونشرها»
 * كأن كل شيء تمّ، ثم يُرفض بعد الضغط — وهو وعدٌ كاذب لا مراجعة.
 *
 * هذه النقطة تُجري فحص التعارض نفسه الذي تُجريه البوابة، على الكون نفسه (الفصل
 * كله عدا مواقع القسم التي ستُستبدل بهذه العملية)، وبالدالة نفسها لا بنسخة
 * منها. الصفوف تصل غير محفوظة فتمرّ على `safeDraftRows` كما تمرّ عند الحفظ.
 *
 * قراءة محضة: لا تكتب شيئاً، وتُعيد أزواج التعارض بمواضع صفوفها في المعاينة.
 */
app.post("/api/schedules/import-preflight", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.body?.collegeId||0),sectionId=Number(req.body?.sectionId||0),termId=Number(req.body?.termId||0);
  if(!collegeId||!sectionId||!termId){res.status(400).json({error:"حدد الكلية والقسم والفصل."});return;}
  if(!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  let rows:any[];
  try{rows=safeDraftRows(req.body?.rows,collegeId,sectionId,termId);}
  catch(error:any){res.status(400).json({error:String(error?.message||"تعذّر فحص الصفوف")});return;}
  if(!rows.length){res.json({conflicts:[]});return;}
  const [colleges,sections,termRows,allInstructors]=await Promise.all([
    Repository.getColleges(),Repository.getSections(),Repository.getSchedulesByScope({termId}),Repository.getInstructors(),
  ]);
  /* وما يرفضه الحفظ صفاً صفاً (draftsRoutes) يُسأل عنه هنا بالدالة نفسها وخياراتها، على نسخة لا تُحفظ:
     فلا يقول الشريط «جاهز» لجدولٍ سيُرفض بعد الضغط. عميلٌ قديم بلا importLayout لا يُطلب منه. */
  const importLayout=req.body?.importLayout==="authority-pdf"?"authority-pdf":req.body?.importLayout==="worksheet"?"worksheet":undefined;
  const issues=importLayout?await validateSmartRows(rows.map(row=>({...row})),collegeId,sectionId,{checkConflicts:false,requireDepartmentInstructor:importLayout==="authority-pdf"}):[];
  /* ما يوقف النشر بالموقع يوقف «جاهز» قبله (BRANCH_SCOPE_UNRESOLVED في draftsRoutes). */
  if(importLayout==="authority-pdf"){
    const registry=await readLocationRegistry();
    const placed=splitRowsByBranch(locateRowsBySite(rows,registry.buildings as any[]),{colleges:colleges as any,sections:sections as any,baseCollegeId:collegeId,baseSectionId:sectionId});
    issues.push(...placed.unplaced.map(entry=>unplacedSiteIssue(countOf(entry.rows.length,AR.row),entry.siteLabel)));
  }
  const conflicts=blockingImportConflicts(
    rows,termRows as any[],collegeId,sectionId,
    branchOwnScopes(colleges as any,sections as any,collegeId,sectionId),
    placeholderInstructorIds(allInstructors as any),
    (await approvalBlockerOptions()).normalizeRow,
  );
  /* ── الموضع يُقرأ من الترتيب الحالي، لا من المعرّف ──────────────────────────
     المعرّفات السالبة تُمنح مرة واحدة ثم تبقى مع الصف، فحذف صف من المعاينة
     يترك الباقين بمعرّفات لم تعد تساوي مواضعهم: الصف ذو المعرّف ‎-3 يصير ثالثاً
     بعد أن كان رابعاً. فكّ المعرّف حسابياً كان يضع العلامة على صف بريء — أو
     خارج الجدول كله — بينما يُمنع النشر بسبب لا يراه أحد. */
  const positionById=new Map<number,number>();
  rows.forEach((row:any,index:number)=>{const id=Number(row?.id);if(Number.isFinite(id))positionById.set(id,index);});
  const positionOf=(id:unknown)=>{const at=positionById.get(Number(id));return at===undefined?null:at;};
  /* ── الموعد الآخر يُسمّى ─────────────────────────────────────────────────
     «مع موعد قائم خارج هذا القسم» لا يكفي ليقرر المراجع: القسم الأكاديمي نفسه
     يدرّس في كليات عدة، فالأستاذ نفسه قد يُحجز في كليتين في الساعة ذاتها. يُذكر
     الكلية والقسم والمقرر والشعبة والأيام والوقت؛ وموعدٌ خارج صلاحية القارئ
     يُذكر بكليته وأيامه ووقته وحدها. */
  const termById=new Map((termRows as any[]).map((row:any)=>[Number(row.id),row]));
  const sectionById=new Map((sections as any[]).map((row:any)=>[Number(row.AdSectionId),row]));
  const collegeById=new Map((colleges as any[]).map((row:any)=>[Number(row.AdCollegeId),row]));
  const describeOther=(id:unknown)=>{
    if(positionOf(id)!==null)return "";
    const other=termById.get(Number(id));
    if(!other)return "";
    const days=SCHEDULE_DAY_KEYS.map((key,index)=>other[key]?DAY_LABELS[index]:null).filter(Boolean).join("، ");
    const when=[days,formatScheduleTimeRange(String(other.fstarttime||""),String(other.fendtime||""))].filter(Boolean).join(" ");
    const visible=Boolean(req.user?.IsAdminUser||isScopeAllowed(req,Number(other.AdCollegeId),Number(other.AdSectionId)));
    if(!visible)return `${collegeById.get(Number(other.AdCollegeId))?.AdCollegeName||"كلية أخرى"} · ${when}`;
    const section=sectionById.get(Number(other.AdSectionId))?.AdSectionName||"قسم آخر";
    const college=collegeById.get(Number(other.AdCollegeId))?.AdCollegeName||"";
    const course=[String(other.AdCourseName||"").trim(),other.SCode?`شعبة ${other.SCode}`:""].filter(Boolean).join(" ");
    return [[college,section].filter(Boolean).join(" — "),course,when].filter(Boolean).join(" · ");
  };
  res.json({issues,conflicts:conflicts.slice(0,60).map((item:any)=>({
    type:String(item?.type||""),message:String(item?.message||""),detail:String(item?.detail||""),
    rowIndex:positionOf(item?.rowId),otherIndex:positionOf(item?.otherId),
    otherLabel:describeOther(item?.otherId)||describeOther(item?.rowId),
  }))});
});

/**
 * ── فحصُ جدول التسجيل: قراءةٌ محضة ──────────────────────────────────────────
 *
 * يعيد التسجيلُ الجدولَ بملف PDF ليراجعه القسم. تُقرأ صفحاتُ الملف بالقارئ نفسه
 * (`/api/intelligence/pdf-import?readOnly=1`، وهي لا تكتب شيئاً)، وتصل صفوفُها
 * إلى هنا لتُقارَن بالجدول الحيّ وبنسخة آخر ما رآه التسجيل: مطابق، وخلل، وما لم
 * يُنفَّذ، وما يحتاج نظراً. الصلاحية والنطاق هما صلاحيةُ استيراد PDF ونطاقُه.
 *
 * لا كتابةَ هنا بأيّ وجه: لا جدولَ ولا نسخةً ولا سجلّاً ولا إشعاراً.
 */
app.post("/api/schedules/registrar-check", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader("Cache-Control","no-store");
  const scope=registrarCheckScope(req,res);if(!scope)return;
  res.json(await runRegistrarCheck(scope.collegeId,scope.sectionId,scope.termId,scope.rows));
});

/**
 * Carry a whole term out, and bring one back.
 *
 * Export writes the schedule as plain JSON with the names spelled out, so the
 * file is readable by a person and not only by this program — a department that
 * wants to check a term in a spreadsheet, or hand it to an auditor, should not
 * need us. Import matches by code rather than by internal identifier, because
 * the identifiers of one installation mean nothing in another.
 *
 * Import never overwrites: it reports exactly what it would add and what it
 * cannot place, and only writes when explicitly told to commit. A schedule is
 * a term of somebody's teaching; replacing one silently is not a feature.
 */
app.get("/api/schedules/export", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0);
  const sectionId = Number(req.query.sectionId || 0);
  const termId = Number(req.query.termId || 0);
  if (!collegeId || !termId) { res.status(400).json({ error: "حدد الكلية والفصل قبل التصدير." }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId || 0)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const rows = filterByScope(req, await Repository.getSchedulesByScope({ collegeId, sectionId, termId }));
  const [courses, instructors, terms, colleges, sections] = await Promise.all([
    Repository.getCourses(), Repository.getInstructors(), Repository.getTerms(),
    Repository.getColleges(), Repository.getSections()
  ]);
  const courseById = new Map(courses.map(row => [row.AdCourseId, row]));
  const instructorById = new Map(instructors.map(row => [row.AdInstructorId, row]));
  /* رقم المقرر في ملف Excel سبع خانات (courseNumber)؛ courseCode يبقى المخزَّن ليُعاد استيراد JSON به. */
  const departmentKeys = authorityDepartmentKeys(sections, colleges);
  const courseNumberOf = (row: { AdCourseId: number; AdSectionId: number; CourseCodeSnapshot?: string }) => {
    const course = courseById.get(row.AdCourseId);
    return authorityCourseCode(course?.CourseCode || row.CourseCodeSnapshot, departmentKeys.get(Number(course?.AdSectionId || row.AdSectionId)));
  };

  /**
   * Everything the scope contains, not only its timetable.
   *
   * The file used to hold appointments alone, which meant an import into a
   * fresh installation could match nothing: the courses it referred to did not
   * exist there, nor the staff, nor the halls. A department handed this file
   * was handed a list of times with no way to read them.
   *
   * So the export now carries the catalogue it depends on — the courses of this
   * department, the staff who teach in it, the halls it uses, and the visiting
   * roster of the term — each keyed by its own code rather than by an internal
   * identifier, because identifiers of one installation mean nothing in
   * another. The rows are unchanged, so files written by the old version still
   * import.
   */
  /* مقرّراتُ النطاق وحده: تصديرٌ «بالكلية» (بلا قسم) من حساب قسمٍ كان يحمل
     دليلَ مقرّرات أقسام الكلية كلها. */
  const scopedCourses = filterByScope(req, courses.filter(course =>
    (!sectionId || Number(course.AdSectionId) === sectionId) &&
    (!collegeId || Number(course.AdCollegeId) === collegeId)));
  const teachingIds = new Set(rows.map(row => Number(row.AdInstructorId)).filter(Boolean));
  const scopedInstructors = instructors.filter(person => teachingIds.has(Number(person.AdInstructorId)));
  const halls = [...new Map(rows
    .filter(row => row.locationStatus==="VERIFIED"&&row.buildingId&&row.roomId)
    .map(row => [String(row.roomId), { building: row.AdRoomCode, hall: row.AdRoomHall }]))
    .values()];
  // The roster is stored as instructor ids; the file carries civil ids so it
  // can be read by an installation that never saw ours.
  let visiting: Array<{ civil: string; name: string }> = [];
  try {
    const roster = await Repository.getVisitingRoster(collegeId, sectionId, termId);
    const ids = Array.isArray(roster) ? roster : [];
    visiting = ids
      .map(id => instructors.find(person => Number(person.AdInstructorId) === Number(id)))
      .filter(Boolean)
      .map(person => ({ civil: person!.AdInstructorCivil, name: person!.AdInstructorName }));
  } catch { visiting = []; }

  const payload = {
    format: "schedule-export/2",
    exportedAt: new Date().toISOString(),
    scope: {
      term: terms.find(row => Number(row.AdTermId) === termId)?.AdTermName || "",
      college: colleges.find(row => Number(row.AdCollegeId) === collegeId)?.AdCollegeName || "",
      section: sections.find(row => Number(row.AdSectionId) === sectionId)?.AdSectionName || ""
    },
    counts: {
      rows: rows.length, courses: scopedCourses.length,
      instructors: scopedInstructors.length, halls: halls.length, visiting: visiting.length
    },
    courses: scopedCourses.map(course => ({
      code: course.CourseCode, name: course.CourseName,
      credit: course.CourseCredit, hours: course.CourseHours, maxStudents: course.MaxStudent
    })),
    instructors: scopedInstructors.map(person => ({
      civil: person.AdInstructorCivil, name: person.AdInstructorName, mobile: person.AdInstructorMobile || ""
    })),
    halls,
    visiting,
    rows: rows.map(row => ({
      courseCode: courseById.get(row.AdCourseId)?.CourseCode || "",
      courseNumber: courseNumberOf(row),
      courseName: row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "",
      section: row.SCode,
      instructorCivil: instructorById.get(row.AdInstructorId)?.AdInstructorCivil || "",
      instructorName: instructorById.get(row.AdInstructorId)?.AdInstructorName || "",
      building: row.AdRoomCode, hall: row.AdRoomHall, locationStatus: row.locationStatus,
      start: row.fstarttime, end: row.fendtime,
      days: DAY_FLAGS.map((flag, index) => ((row as any)[flag] ? DAY_LABELS[index] : null)).filter(Boolean)
    }))
  };
  const name = `schedule-${payload.scope.section || "term"}-${termId || "all"}.json`.replace(/[^\w.\-]+/g, "-");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.type("application/json; charset=utf-8").send(JSON.stringify(payload, null, 2));
});

app.post("/api/schedules/import", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body || {};
  const commit = body.commit === true;
  const collegeId = Number(body.collegeId || 0);
  const sectionId = Number(body.sectionId || 0);
  const termId = Number(body.termId || 0);
  const incoming: any[] = Array.isArray(body.rows) ? body.rows : [];
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "حدد الكلية والقسم والفصل قبل الاستيراد." }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  if (!incoming.length) { res.status(400).json({ error: "الملف لا يحتوي مواعيد." }); return; }
  /* المعاينة مفتوحةٌ دائماً — قراءةُ ملفٍّ ليست كتابةً على الجدول. والكتابة
     وحدها هي ما يحكمه القفل والموعد. */
  if (commit) {
    const importLock = await scheduleLockRefusal(req,collegeId, sectionId, termId);
    if (importLock) { res.status(409).json({ error: importLock, code: "schedule-locked" }); return; }
    const importDeadline = await wholesaleRefusal(collegeId, sectionId, termId, { kind: "import" });
    if (importDeadline) { res.status(409).json({ error: importDeadline, code: "deadline-wholesale" }); return; }
  }

  const [courses, instructors, existing, registry] = await Promise.all([
    Repository.getCourses(), Repository.getInstructors(),
    Repository.getSchedulesByScope({ collegeId, sectionId, termId }), readLocationRegistry()
  ]);
  const courseByCode = new Map(courses.filter(row => Number(row.AdSectionId) === sectionId)
    .map(row => [String(row.CourseCode || "").trim().toLowerCase(), row]));
  const instructorByCivil = new Map(instructors.map(row => [normalizeCivilId(row.AdInstructorCivil), row]));
  const seen = new Set(existing.map(row => `${row.AdCourseId}|${String(row.SCode).trim()}`));

  /**
   * A file that brought its own catalogue may plant it.
   *
   * Version 2 of the export carries the courses and the staff its rows depend
   * on. Without this step every row of such a file is rejected for referring to
   * a course that does not exist here yet — which is a true statement and a
   * useless one, because the definition was in the file all along. Anything
   * already present is left exactly as it is; this only fills gaps, and only
   * when the operator has asked to commit.
   */
  const planted = { courses: 0, instructors: 0 };
  if (commit) {
    for (const entry of (Array.isArray(body.courses) ? body.courses : [])) {
      const code = String(entry?.code || "").trim();
      if (!code || courseByCode.has(code.toLowerCase())) continue;
      try {
        const created = await Repository.createCourse(
          collegeId, sectionId, code, String(entry?.name || code).trim(),
          Number(entry?.credit || 0), Number(entry?.hours || 0), Number(entry?.maxStudents || 0),
        );
        courseByCode.set(code.toLowerCase(), created as any);
        planted.courses += 1;
      } catch { /* a course we cannot add is reported by its rows below */ }
    }
    for (const entry of (Array.isArray(body.instructors) ? body.instructors : [])) {
      const civil = normalizeCivilId(entry?.civil);
      if (!civil || instructorByCivil.has(civil)) continue;
      try {
        const created = await Repository.createInstructor(
          civil, String(entry?.name || civil).trim(), String(entry?.mobile || "").trim(),
        );
        instructorByCivil.set(civil, created as any);
        planted.instructors += 1;
      } catch { /* likewise */ }
    }
  }

  const visitingPlan = await visitingToFacultyPlan(collegeId, sectionId, termId);
  const operationalImportIds=await Repository.getOperationalCourseIds(sectionId);
  const ready: any[] = [];
  const rejected: Array<{ line: number; reason: string; label: string }> = [];
  await Promise.all(incoming.map(async (entry, index) => {
    const label = `${entry?.courseCode || "?"} · شعبة ${entry?.section || "?"}`;
    const course = courseByCode.get(String(entry?.courseCode || "").trim().toLowerCase());
    if (!course) { rejected.push({ line: index + 1, reason: "رمز المقرر غير موجود في هذا القسم", label }); return; }
    if(!operationalImportIds.has(Number(course.AdCourseId))){rejected.push({line:index+1,reason:"المقرر مؤرشف أكاديمياً ولا يمكن استيراده إلى جدول حالي",label});return;}
    const instructor = instructorByCivil.get(normalizeCivilId(entry?.instructorCivil));
    if (!instructor) { rejected.push({ line: index + 1, reason: "الرقم المدني للأستاذ غير مسجّل", label }); return; }
    const key = `${course.AdCourseId}|${String(entry?.section || "").trim()}`;
    if (seen.has(key)) { rejected.push({ line: index + 1, reason: "الشعبة موجودة بالفعل", label }); return; }
    const dayNames: string[] = Array.isArray(entry?.days) ? entry.days : [];
    const candidate = {
      AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId,
      AdCourseId: course.AdCourseId, AdCourseName: course.CourseName,
      CourseCodeSnapshot:String(course.CourseCode||""),CourseNameSnapshot:String(course.CourseName||""),
      SCode: String(entry?.section || "").trim(),
      AdInstructorId: visitingPlan.placeholderId && visitingPlan.visiting.has(Number(instructor.AdInstructorId)) ? visitingPlan.placeholderId : instructor.AdInstructorId,
      AdRoomCode: String(entry?.building || "").trim(),
      AdRoomHall: String(entry?.hall || "").trim(),
      fstarttime: normalizeClock(entry?.start),
      fendtime: normalizeClock(entry?.end),
      ...Object.fromEntries(DAY_FLAGS.map((flag, index) => [flag, dayNames.includes(DAY_LABELS[index])]))
    };
    const building=resolveBuilding(registry,candidate.AdRoomCode,{collegeId,sectionId});
    if(building.status!=="CONFIRMED"||!building.value){rejected.push({line:index+1,reason:"المبنى في الملف غير محسوم في السجل الرسمي؛ اختر مبنى رسميًا في المعاينة",label});return;}
    if(String(entry?.locationStatus||"")==="PENDING_ROOM"){
      Object.assign(candidate,{buildingId:building.value.id,roomId:undefined,AdRoomCode:building.value.officialCode,AdRoomHall:"",locationStatus:"PENDING_ROOM",sourceBuildingText:String(entry?.building||""),sourceRoomText:String(entry?.hall||"")});
    }else{
      const room=resolveRoom(registry,candidate.AdRoomHall,building.value.id,{collegeId,sectionId});
      if(room.status!=="CONFIRMED"||!room.value){rejected.push({line:index+1,reason:"القاعة في الملف غير محسومة داخل المبنى الرسمي؛ اختر قاعة رسمية أو Pending بشكل مقصود",label});return;}
      Object.assign(candidate,{buildingId:building.value.id,roomId:room.value.id,AdRoomCode:building.value.officialCode,AdRoomHall:room.value.canonicalCode,locationStatus:"VERIFIED",sourceBuildingText:String(entry?.building||""),sourceRoomText:String(entry?.hall||"")});
    }
    const payloadIssues = await schedulePayloadIssues(candidate);
    if (payloadIssues.length) { rejected.push({ line: index + 1, reason: payloadIssues[0], label }); return; }
    seen.add(key);
    ready.push(candidate);
  }));

  const importPreflightIssues:string[]=[];
  for(let index=0;index<ready.length;index+=1){
    const row=ready[index];
    const locationResult=await canonicalizeLocationForWrite(row,collegeId,sectionId);
    if(!locationResult.check.ok){locationResult.check.issues.filter(issue=>issue.severity==="high").forEach(issue=>importPreflightIssues.push(`السطر ${index+1}: ${issue.message}`));}
    else if(locationResult.check.canonical)Object.assign(row,locationResult.check.canonical);
  }
  if(!importPreflightIssues.length){
    /* ضد الفصل كله لا القسم وحده؛ ومعرّفاتٌ سالبة للفحص كي يتعارض الجديد بعضه مع بعض. */
    const termRowsForImport=await Repository.getSchedulesByScope({termId});
    const staged=ready.map((row:any,index:number)=>({...row,id:-(index+1)}));
    const conflicts=blockingConflicts(staged,termRowsForImport,await approvalBlockerOptions());
    conflicts.slice(0,20).forEach((item:any)=>importPreflightIssues.push(item.message||item.detail||"يوجد تعارض يمنع الاستيراد"));
  }
  if(importPreflightIssues.length){
    if(commit){res.status(409).json({error:"لم يتم استيراد أي موعد لأن فحص ما قبل النشر وجد مشكلة.",issues:[...new Set(importPreflightIssues)]});return;}
    importPreflightIssues.forEach((reason,index)=>rejected.push({line:0,reason,label:`فحص ما قبل النشر ${index+1}`}));
  }

  if (!commit) {
    // A dry run tells the operator what the file would plant as well as place.
    const newCourses = (Array.isArray(body.courses) ? body.courses : [])
      .filter((entry: any) => !courseByCode.has(String(entry?.code || "").trim().toLowerCase())).length;
    const newInstructors = (Array.isArray(body.instructors) ? body.instructors : [])
      .filter((entry: any) => !instructorByCivil.has(normalizeCivilId(entry?.civil))).length;
    res.json({ preview: true, ready: ready.length, rejected, sample: ready.slice(0, 5), willAdd: { courses: newCourses, instructors: newInstructors } });
    return;
  }

  let added = 0;
  const createdRows: any[] = [];
  for (const row of ready) {
    try { const created = await Repository.createSchedule(row); added += 1; createdRows.push(created); }
    catch (error) { rejected.push({ line: 0, reason: error instanceof Error ? error.message : "تعذر الحفظ", label: row.SCode }); }
  }
  /* ── مرّةً واحدة للاستيراد كله، لا مرّةً لكل صفّ ──────────────────────────
   *
   * كل صفٍّ يصل الجدول من هنا كأيِّ صفٍّ يُضاف باليد: إن كان بعد توقيع رئيس
   * القسم فهو ينتظر إقراره، وإن كان الجدول مقبولاً فقد عاد جولةً جديدة.
   *
   * لكنّ الإبلاغَ صفّاً صفّاً يقرأ وثيقة الاعتماد ويكتبها ثلاثمئة مرّةٍ في
   * استيرادٍ من ثلاثمئة صفّ — وإعادةُ فتح الجولة تحدث مرّةً واحدة على أي حال،
   * والباقي رحلاتٌ تُدفع بلا مقابل. فيُبلَّغ عن الدفعة دفعةً واحدة. */
  if (createdRows.length) await noteScheduleMutation(req, collegeId, sectionId, termId, { kind: "add", rows: createdRows });
  res.json({ preview: false, added, rejected, planted });
});

/**
 * ── طلبُ التعديل للتسجيل: يُحفظ، ويصل التسجيلَ داخل النظام، ويُشطب بنداً بنداً ──
 *
 * الحفظ يعيد الفحص على الخادم بالصفوف نفسها (لا تُصدَّق نتيجةٌ أرسلها المتصفح)،
 * ويحفظ ما يلزم وحده: التاريخ واسم الملف والأعداد والبنود بأرقامها المرجعية.
 * الطلبُ يتبع جولة الاعتماد الجارية؛ والتسجيل يراه في وارده ويشطب ما نفّذه.
 */
app.post("/api/schedules/registrar-requests", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const scope=registrarCheckScope(req,res);if(!scope)return;
  const {collegeId,sectionId,termId}=scope;
  const result=await runRegistrarCheck(collegeId,sectionId,termId,scope.rows);
  if(result.empty){res.status(409).json({error:"لا مقارنةَ تُحفظ: الملف أو الجدول فارغ."});return;}
  if(looksForeign(result)){res.status(409).json({error:"الملف لا يطابق أي شعبة في جدولكم؛ تأكّد أنه ملف قسمكم وفصلكم.",code:"foreign-file"});return;}
  const items=buildRequestItems(result);
  if(!items.length){res.status(409).json({error:"لا فروقَ تُطلب من التسجيل في هذا الملف."});return;}
  const prefix=requestPrefix(termId,collegeId,sectionId);
  const existing=await Repository.listFeatureDocs<RegistrarRequestDoc>("registrarRequests",prefix);
  if(existing.length>=REQUESTS_PER_SCOPE){res.status(409).json({error:`بلغت الطلبات المحفوظة لهذا الفصل حدّها (${countOf(REQUESTS_PER_SCOPE,AR.request)}). احذف قديماً.`});return;}
  const approval=await readApproval(collegeId,sectionId,termId);
  const doc:RegistrarRequestDoc={
    id:`${prefix}${randomBytes(5).toString("hex")}`,collegeId,sectionId,termId,round:Number(approval.currentRound||0),
    at:new Date().toISOString(),by:Number(req.user?.SystemUserId||0),byName:String(req.user?.Name||"").slice(0,80),
    fileName:String(req.body?.fileName||"").replace(/[\u0000-\u001f]/g,"").slice(0,120)||"ملف التسجيل.pdf",
    counts:result.counts,reviewCount:result.counts.review,items,
  };
  await Repository.saveFeatureDoc("registrarRequests",doc.id,doc);
  res.json({request:doc});
});

app.get("/api/schedules/registrar-requests", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader("Cache-Control","no-store");
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0),termId=Number(req.query.termId||0);
  if(!collegeId||!sectionId||!termId){res.status(400).json({error:"حدد الكلية والقسم والفصل."});return;}
  if(!await mayReadRequests(req)){res.status(403).json({error:"ليس لديك صلاحية للوصول إلى هذا القسم"});return;}
  if(!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const docs=await Repository.listFeatureDocs<RegistrarRequestDoc>("registrarRequests",requestPrefix(termId,collegeId,sectionId));
  res.json({requests:docs.sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,REQUESTS_PER_SCOPE),canTick:mayTickRequests(req)});
});

/** وارد التسجيل: أحدثُ طلبٍ لكل قسمٍ في جولته الجارية، بنطاق القارئ وحده. */
app.get("/api/schedules/registrar-requests/inbox", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader("Cache-Control","no-store");
  const termId=Number(req.query.termId||0);
  if(!termId){res.status(400).json({error:"اختر الفصل أولاً."});return;}
  if(!mayTickRequests(req)){res.status(403).json({error:"وارد طلبات التعديل للتسجيل وحده."});return;}
  const docs=(await Repository.listFeatureDocs<RegistrarRequestDoc>("registrarRequests",`${termId}:`))
    .filter(doc=>doc&&Number(doc.termId)===termId&&isScopeAllowed(req,Number(doc.collegeId),Number(doc.sectionId)));
  const latest=new Map<string,RegistrarRequestDoc>();
  for(const doc of docs){
    const key=`${doc.collegeId}:${doc.sectionId}`;
    const current=latest.get(key);
    if(!current||String(doc.at)>String(current.at))latest.set(key,doc);
  }
  const fresh:RegistrarRequestDoc[]=[];
  for(const doc of latest.values()){
    const approval=await readApproval(Number(doc.collegeId),Number(doc.sectionId),termId);
    if(Number(doc.round)===Number(approval.currentRound||0))fresh.push(doc);
  }
  res.json({requests:fresh.sort((a,b)=>String(b.at).localeCompare(String(a.at))).map(requestSummary)});
});

/** شطبُ بندٍ «نُفّذ» أو رفعُ شطبه: للتسجيل المراجع وحده، بنطاقه، باسمه ووقته. */
app.post("/api/schedules/registrar-requests/:id/tick", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if(!mayTickRequests(req)){res.status(403).json({error:"الشطب للتسجيل وحده."});return;}
  const id=String(req.params.id||"");
  const itemId=String(req.body?.itemId||"");
  if(!itemId){res.status(400).json({error:"حدد البند."});return;}
  const doc=await Repository.getFeatureDoc<RegistrarRequestDoc>("registrarRequests",id);
  if(!doc){res.status(404).json({error:"الطلب غير موجود."});return;}
  if(!isScopeAllowed(req,Number(doc.collegeId),Number(doc.sectionId))){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const actor={by:Number(req.user?.SystemUserId||0),byName:String(req.user?.Name||req.user?.SystemUserLogin||""),at:new Date().toISOString()};
  const out=await Repository.updateFeatureDoc<RegistrarRequestDoc,RegistrarRequestDoc|null>("registrarRequests",id,current=>{
    if(!current)return{refuse:null};
    const items=tickRequestItem(current.items||[],itemId,req.body?.done!==false,actor);
    if(!items)return{refuse:null};
    const next={...current,items};
    return{next,result:next};
  });
  if(!out.ok||!out.result){res.status(404).json({error:"البند غير موجود."});return;}
  res.json({request:out.result});
});

/**
 * التحقق الذاتي: بعد فحص ملف التسجيل التالي، يُقابَل كلُّ بندٍ مشطوب بالنتيجة الجديدة
 * («تأكّد» أو «شُطب ولم يظهر في الملف»). طريقٌ مستقلّ عن الفحص، فالفحصُ يبقى قراءةً محضة.
 */
app.post("/api/schedules/registrar-requests/verify", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const scope=registrarCheckScope(req,res);if(!scope)return;
  const {collegeId,sectionId,termId}=scope;
  const docs=(await Repository.listFeatureDocs<RegistrarRequestDoc>("registrarRequests",requestPrefix(termId,collegeId,sectionId)))
    .filter(doc=>(doc.items||[]).some(item=>item.state!=="confirmed"));
  if(!docs.length){res.json({confirmed:0,reopened:0});return;}
  const result=await runRegistrarCheck(collegeId,sectionId,termId,scope.rows);
  const at=new Date().toISOString();
  let confirmed=0,reopened=0;
  for(const doc of docs){
    const out=await Repository.updateFeatureDoc<RegistrarRequestDoc,{confirmed:number;reopened:number}>("registrarRequests",doc.id,current=>{
      if(!current)return{refuse:{confirmed:0,reopened:0}};
      const checked=verifyRequestItems(current.items||[],result,at);
      if(!checked.confirmed&&!checked.reopened)return{refuse:{confirmed:0,reopened:0}};
      return{next:{...current,items:checked.items},result:{confirmed:checked.confirmed,reopened:checked.reopened}};
    });
    confirmed+=out.result.confirmed;reopened+=out.result.reopened;
  }
  res.json({confirmed,reopened});
});

app.delete("/api/schedules/registrar-requests/:id", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const id=String(req.params.id||"");
  const doc=await Repository.getFeatureDoc<RegistrarRequestDoc>("registrarRequests",id);
  if(!doc){res.status(404).json({error:"الطلب غير موجود."});return;}
  if(!isScopeAllowed(req,Number(doc.collegeId),Number(doc.sectionId))){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  await Repository.deleteFeatureDoc("registrarRequests",id);
  res.json({ok:true});
});

/**
 * ── مطابقة ترقيم التسجيل: خطوةٌ تلقائية بعد الفحص (قرار المالك 2026-11-19) ──────
 *
 * الفحصُ نفسه يبقى قراءةً محضة (/registrar-check). وبعد فحصٍ ناجح تستدعي الشاشةُ هذه
 * الخطوةَ تلقائياً بالصفوف نفسها: تُعاد المقارنة هنا (لا تُصدَّق خطةٌ من المتصفح)، ولكل
 * شعبةٍ عُرفت بيقين — بالرقم المرجعي، أو بالمقرر والموعد والأستاذ منفردةً — يصير رقمُها
 * ومرجعيُّها رقمَيهم، ولا يُمسّ غيرهما. كتابةٌ واحدة تسبقها نسخة «قبل مطابقة ترقيم التسجيل»
 * للتراجع، وأثرٌ في السجلّ. الملتبس والمتصادم يُتخطّيان ويعودان في الردّ لـ«تحتاج نظرك».
 * جدولٌ مقفل (بين يدي التسجيل) لا يُكتب: يُقال ذلك ولا يُعدّ خطأً.
 */
app.post("/api/schedules/registrar-numbering", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader("Cache-Control","no-store");
  const scope=registrarCheckScope(req,res);if(!scope)return;
  const {collegeId,sectionId,termId}=scope;
  const result=await runRegistrarCheck(collegeId,sectionId,termId,scope.rows);
  const answer=(plan:ReturnType<typeof planRegistrarNumbering>|null,extra:Record<string,unknown>={})=>res.json({
    changed:0,rows:0,skipped:plan?.skipped||[],collisions:plan?.collisions||[],...extra,
  });
  if(result.empty||looksForeign(result)){answer(null);return;}
  const live=await Repository.getSchedulesByScope({collegeId,sectionId,termId},{fresh:true});
  const plan=planRegistrarNumbering(result.identities,live as any[]);
  if(!plan.changes.length){answer(plan,{aligned:plan.aligned});return;}
  const lock=await scheduleLockRefusal(req,collegeId,sectionId,termId);
  if(lock){answer(plan,{locked:lock});return;}
  const rowById=new Map((live as any[]).map(row=>[Number(row.id),row]));
  const at=new Date().toISOString();
  const fieldsOf=new Map<number,{SCode:string;referenceNumber:string;registrarNumberedAt:string}>();
  for(const change of plan.changes)for(const id of change.ids)if(rowById.has(id))fieldsOf.set(id,{SCode:change.to.section,referenceNumber:change.to.crn,registrarNumberedAt:at});
  const version=await captureScopeVersion(req,collegeId,sectionId,termId,"قبل مطابقة ترقيم التسجيل","manual");
  let written:any[]=[];
  try{
    written=await Repository.moveSchedulesBatch([...fieldsOf].map(([id,fields])=>({id,expectedRev:Number(rowById.get(id)?.rev||0),fields:fields as any})));
  }catch(error:any){
    if(error instanceof RequestHoldConflict){res.status(409).json({...await requestHoldRefusal([error.holdRequestId],[error.holdItemId]),applied:false});return;}
    if(error instanceof ScheduleRevisionConflict){res.status(409).json({error:"تغيّر أحد المواعيد أثناء مطابقة الترقيم؛ لم يُحفظ شيء. افحص الملف من جديد.",conflict:"revision",applied:false});return;}
    if(error instanceof RequestReservationConflict){res.status(409).json({error:error.message,code:error.code,applied:false});return;}
    throw error;
  }
  await recordVersionAfter(version,before=>before.map(row=>fieldsOf.has(Number(row.id))?{...row,...fieldsOf.get(Number(row.id))}:row));
  await recordSectionNumberLedger(collegeId,sectionId,termId,written);
  res.locals.auditChanges=`مطابقة ترقيم التسجيل: ${countOf(plan.changes.length,AR.section)}`;
  answer(plan,{changed:plan.changes.length,rows:fieldsOf.size,aligned:plan.aligned,undoVersionId:version?.id});
});

/** سجلّ أرقام الشعب للفصل: أكبرُ رقمٍ استُعمل لكل مقرر، فلا يُقترح رقمٌ حُذف. */
app.get("/api/schedules/section-numbers", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader("Cache-Control","no-store");
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0),termId=Number(req.query.termId||0);
  if(!collegeId||!sectionId||!termId){res.status(400).json({error:"حدد الكلية والقسم والفصل."});return;}
  if(!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  res.json({courses:await readSectionNumberLedger(collegeId,sectionId,termId)});
});
}
