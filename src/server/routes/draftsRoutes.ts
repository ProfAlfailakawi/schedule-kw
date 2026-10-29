/**
 * ── المسوّداتُ والنسخُ ومقارنةُ الفصول ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { compareIntelligenceTerms } from "../../utils/intelligenceReadingScope";
import { Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { Repository } from "../../db/repository";
import { activeDays, analyzeSchedule, autoScheduleProposal } from "../../utils/scheduleIntelligence";
import { scopeBase } from "../../utils/scopeFingerprint";
import { blockingConflicts } from "../../utils/scheduleBlockers";
import { AR, countOf } from "../../utils/arabicCount";
import { formatScheduleTimeRange } from "../../utils/scheduleTime";
import { academicDigits, assignAuthoritySections, withoutImportEvidence } from "../../utils/authorityAcademicCodes";
import { splitRowsByBranch, type BranchScope } from "../../utils/branchScope";
import { pageReviewWaitLine, unconfirmedReviewPages } from "../../utils/importPageReview";
import { noteScheduleMutation, scheduleLockRefusal, wholesaleRefusal } from "../core/approvals";
import { type AuthenticatedRequest, requirePermission, requirePowerAdmin } from "../core/auth";
import { authorityBaselineForScope, authorityCourseCodeMap, buildAuthorityPdfDiff, inferAuthorityBranchCode } from "../core/authority";
import { canonicalizeLocationForWrite, readLocationRegistry } from "../core/locations";
import { intelligenceReadScopes, isScopeAllowed, scopedScheduleUniverse } from "../core/scope";
import { approvalBlockerOptions, mapSmartIssuesToRows, type PdfImportReceipt, safeDraftRows, smartContextFrom, validateSmartRows } from "../core/smartImport";
import { captureScopeVersion, confirmTokens, recordVersionAfter, replacementAction, scopeOverwriteRefusal } from "../core/versions";
import { readVisitingStatus } from "../core/visiting";

async function verifyPdfImportReceipt(token:unknown,context:{collegeId:number;sectionId:number;termId:number}){
  try{
    const[body,signature]=String(token||"").split(".");if(!body||!signature)return null;
    const secret=await Repository.getStudentCaseSecret();
    const expected=createHmac("sha256",secret).update(`pdf-import|${body}`).digest("base64url");
    const a=Buffer.from(signature),b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))return null;
    const payload=JSON.parse(Buffer.from(body,"base64url").toString("utf8")) as PdfImportReceipt;
    if(payload.v!==1||payload.collegeId!==context.collegeId||payload.sectionId!==context.sectionId||payload.termId!==context.termId)return null;
    return payload;
  }catch{return null;}
}

/* حد وثيقة Firestore 1 MiB. الرقم يُقاس بطول JSON وهو تقريبي (Firestore يحسب
   الأرقام 8 بايت والنصوص +1)؛ الهامش يغطي الفرق وحقول المسودة الأخرى. */
const DRAFT_DOCUMENT_MAX_BYTES = 960_000;

export function registerDraftsRoutes(app: Express): void {

app.get("/api/intelligence/drafts", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} res.json(await Repository.getScheduleDrafts(collegeId,sectionId,termId));
});

app.post("/api/intelligence/drafts", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const importLayout=req.body?.importLayout==="authority-pdf"?"authority-pdf":req.body?.importLayout==="worksheet"?"worksheet":undefined;
  const importReceipt=importLayout==="authority-pdf"?String(req.body?.importReceipt||""):"";
  const receipt=importLayout==="authority-pdf"?await verifyPdfImportReceipt(importReceipt,{collegeId,sectionId,termId}):null;
  if(importLayout==="authority-pdf"&&!receipt){
    res.status(409).json({error:"انتهت أو غابت شهادة فحص ترويسة PDF. أعد رفع الملف؛ لا يمكن تجاوز فحص الفصل والكلية والقسم من الواجهة.",code:"PDF_IMPORT_RECEIPT_REQUIRED"});return;
  }
  /* «راجعت الصفحة» يُفرض هنا أيضاً: زرّ الواجهة المعطّل لا يراه تطبيقٌ قديم في
     ذاكرة المتصفح ولا طلبٌ مباشر، والإيصال الموقّع يعرف الصفحات التي تنتظره. */
  const unconfirmedPages=unconfirmedReviewPages(receipt?.reviewPages,req.body?.reviewedPages);
  if(unconfirmedPages.length){
    /* نافذةٌ من إصدارٍ سابق لا ترسل قائمة المراجعة أصلاً، وشاشتُها قد تقول «رُوجعت
       الصفحة». لا يُطلب من أحدٍ «تحديث الصفحة» (src/main.tsx): إغلاقُ النافذة
       يُحدّث البرنامجَ نفسه، ولم يُحفظ شيء. */
    const outdated=!Array.isArray(req.body?.reviewedPages);
    res.status(400).json({error:outdated?"هذه النافذة من إصدار سابق للنظام. أغلقها ثم أعد رفع الملف؛ لم يُحفظ شيء.":pageReviewWaitLine(unconfirmedPages),code:"PDF_PAGE_REVIEW_REQUIRED",pages:unconfirmedPages});return;
  }
  const rows=importLayout==="authority-pdf"
    ?assignAuthoritySections(safeDraftRows(req.body?.rows,collegeId,sectionId,termId))
    :safeDraftRows(req.body?.rows,collegeId,sectionId,termId);
  const previewIssues=Array.isArray(req.body?.previewIssues)?[...new Set(req.body.previewIssues.map((item:any)=>String(item||"").trim()).filter(Boolean))].slice(0,80):[];
  if(previewIssues.length){res.status(400).json({error:"لا يمكن حفظ المسودة أو نشرها قبل معالجة جميع ملاحظات المعاينة.",issues:previewIssues});return;}
  const issues=await validateSmartRows(rows,collegeId,sectionId,{checkConflicts:false,requireDepartmentInstructor:importLayout==="authority-pdf"});
  if(issues.length){res.status(400).json({error:"أكمل الحقول المطلوبة والملاحظات في جدول المعاينة أولاً.",issues});return;}
  /* «تجربة بلا حفظ» ثم «طبّق»: استبدالُ فصلٍ فيه جدول مسموحٌ بثلاثة شروط معاً —
     إيصالُ قراءةٍ تجريبية موقَّع، وطلبٌ صريح من الواجهة، وتأكيدُ «replace-filled». */
  const replaceFilled=importLayout==="authority-pdf"&&Boolean(receipt?.replaceFilled)&&req.body?.replaceFilled===true&&confirmTokens(req).has("replace-filled");
  if(importLayout==="authority-pdf"&&!replaceFilled){
    const occupied=await Repository.getSchedulesByScope({collegeId,sectionId,termId});
    if(occupied.length){res.status(409).json({error:"نسخ PDF مسموح إلى فصل فارغ فقط. اختر فصلاً بلا بيانات، أو استعمل «تجربة بلا حفظ».",code:"PDF_TARGET_TERM_OCCUPIED"});return;}
  }
  /* Preserve the ORIGINAL Authority-PDF read as the immutable comparison
     baseline, even when the reviewer deletes or corrects rows in the preview
     before the first publish. The client keeps that first scan in baselineRows;
     falling back to the approved rows protects older clients. This is what lets
     the report later show every preview deletion in red and highlight only the
     cells that were manually changed before publication. */
  const suppliedBaseline=importLayout==="authority-pdf"
    ?withoutImportEvidence(assignAuthoritySections(safeDraftRows(req.body?.baselineRows,collegeId,sectionId,termId)))
    :[];
  const baselineRows=importLayout==="authority-pdf"
    ?(suppliedBaseline.length?suppliedBaseline:withoutImportEvidence(rows))
    :undefined;
  /* المسودة وثيقة Firestore واحدة، وحدّها 1 MiB. ما يتجاوزه كان يسقط عند
     الكتابة فيصل رسالةً عامة لا تقول شيئاً؛ يُقال هنا بعدده قبل أي كتابة. */
  const storedBytes=Buffer.byteLength(JSON.stringify({rows,baselineRows}),"utf8");
  if(storedBytes>DRAFT_DOCUMENT_MAX_BYTES){
    res.status(413).json({error:`الجدول (${countOf(rows.length, AR.appointment)}) أكبر من أن يُحفظ مسودةً واحدة. لم يُحفظ شيء؛ أبلغ إدارة النظام بهذه الرسالة.`,code:"DRAFT_TOO_LARGE"});return;
  }
  const draft=await Repository.createScheduleDraft({
    SystemUserId:req.user.SystemUserId,userName:req.user.Name,
    AdCollegeId:collegeId,AdSectionId:sectionId,AdTermId:termId,
    ...scopeBase(await Repository.getSchedulesByScope({collegeId,sectionId,termId})),
    name:String(req.body?.name||"سيناريو جديد").slice(0,100),
    source:["what-if","auto","import","manual"].includes(req.body?.source)?req.body.source:"what-if",
    rows,baselineRows,
    sourceFileName:String(req.body?.sourceFileName||"").slice(0,180)||undefined,
    importLayout,
    sourceBranchCode:String(req.body?.sourceBranchCode||"").trim().slice(0,20)||undefined,
    sourceBranchName:String(req.body?.sourceBranchName||"").trim().slice(0,180)||undefined,
    importReceipt:importReceipt||undefined,
    ...(replaceFilled?{replaceFilled:true}:{}),
  });
  res.status(201).json(draft);
});

app.get("/api/intelligence/drafts/:id/import-report", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const draft=await Repository.getScheduleDraftById(String(req.params.id));
  if(!draft){res.status(404).json({error:"المسودة غير موجودة"});return;}
  if(!isScopeAllowed(req,draft.AdCollegeId,draft.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  if(draft.importLayout!=="authority-pdf"||!draft.baselineRows?.length){res.status(400).json({error:"هذه المسودة ليست نسخة من جدول PDF معتمد"});return;}
  const [live,instructors]=await Promise.all([
    Repository.getSchedulesByScope({collegeId:draft.AdCollegeId,sectionId:draft.AdSectionId,termId:draft.AdTermId}),
    Repository.getInstructors(),
  ]);
  const instructorNameById=new Map<number,string>(instructors.map((row:any)=>[Number(row.AdInstructorId),String(row.AdInstructorName||"")] as [number,string]));
  const scopedBaseline=await authorityBaselineForScope(draft.baselineRows,draft,draft.AdCollegeId,draft.AdSectionId);
  const comparison=buildAuthorityPdfDiff(scopedBaseline,live,{instructorNameById,courseCodeById:await authorityCourseCodeMap()});
  res.json({
    draftId:draft.id,name:draft.name,sourceFileName:draft.sourceFileName||"الجدول المعتمد.pdf",
    sourceBranchCode:inferAuthorityBranchCode(draft,[...scopedBaseline,...live]),
    sourceBranchName:draft.sourceBranchName||"",
    ...comparison,
  });
});

app.put("/api/intelligence/drafts/:id", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const draft=await Repository.getScheduleDraftById(String(req.params.id)); if(!draft){res.status(404).json({error:"المسودة غير موجودة"});return;} if(!isScopeAllowed(req,draft.AdCollegeId,draft.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const fields:any={}; if(typeof req.body?.name==="string")fields.name=req.body.name.slice(0,100); if(Array.isArray(req.body?.rows)){const rows=draft.importLayout==="authority-pdf"?assignAuthoritySections(safeDraftRows(req.body.rows,draft.AdCollegeId,draft.AdSectionId,draft.AdTermId)):safeDraftRows(req.body.rows,draft.AdCollegeId,draft.AdSectionId,draft.AdTermId);if(draft.importLayout==="authority-pdf"&&draft.baselineRows?.length){const baselineByOrder=new Map(draft.baselineRows.map((row:any)=>[Number(row.sourceOrder),row]));const renamed=rows.find((row:any)=>{const base=baselineByOrder.get(Number(row.sourceOrder));return base&&(Number(base.AdCourseId)!==Number(row.AdCourseId)||String(base.AdCourseName)!==String(row.AdCourseName));});if(renamed){res.status(409).json({error:"اسم المقرر من ملف PDF ثابت وفق لائحة الجدول. يمكنك حذف المقرر كاملاً، لكن لا يمكن تبديل اسمه.",code:"COURSE_NAME_LOCKED",rowId:renamed.id});return;}}const issues=await validateSmartRows(rows,draft.AdCollegeId,draft.AdSectionId,{checkConflicts:false,requireDepartmentInstructor:draft.importLayout==="authority-pdf"});if(issues.length){res.status(400).json({error:"المسودة تحتوي بيانات ناقصة أو غير صالحة",issues});return;}fields.rows=rows;} res.json(await Repository.updateScheduleDraft(draft.id,fields));
});
app.patch("/api/intelligence/drafts/:id/rows/:rowId", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const draft = await Repository.getScheduleDraftById(String(req.params.id));
  if (!draft) { res.status(404).json({ error: "المسودة غير موجودة" }); return; }
  if (!isScopeAllowed(req, draft.AdCollegeId, draft.AdSectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const rowId = Number(req.params.rowId);
  const index = draft.rows.findIndex((row:any) => Number(row.id) === rowId);
  if (index < 0) { res.status(404).json({ error: "الموعد غير موجود داخل المسودة" }); return; }
  const allowed = ["AdInstructorId","fstarttime","fendtime","AdRoomCode","AdRoomHall","buildingId","roomId","locationStatus","sourceBuildingText","sourceRoomText","fsunday","fmonday","ftuesday","fwednesday","fthursday"] as const;
  const nextRaw:any = { ...draft.rows[index] };
  allowed.forEach(key => { if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) nextRaw[key] = req.body[key]; });
  const candidate = safeDraftRows([nextRaw], draft.AdCollegeId, draft.AdSectionId, draft.AdTermId)[0];
  const locationResult=await canonicalizeLocationForWrite(candidate,draft.AdCollegeId,draft.AdSectionId);
  if(!locationResult.check.ok){res.status(400).json({error:locationResult.check.issues.find(issue=>issue.severity==="high")?.message||"المكان غير صالح",issues:locationResult.check.issues});return;}
  Object.assign(candidate,locationResult.check.canonical||{});
  const structural = await validateSmartRows([candidate], draft.AdCollegeId, draft.AdSectionId, { checkConflicts: false,requireDepartmentInstructor:draft.importLayout==="authority-pdf" });
  if (structural.length) { res.status(400).json({ error: structural[0], issues: structural }); return; }
  const rows = draft.importLayout==="authority-pdf"
    ? assignAuthoritySections(safeDraftRows(draft.rows.map((row:any, i:number) => i === index ? candidate : row), draft.AdCollegeId, draft.AdSectionId, draft.AdTermId))
    : safeDraftRows(draft.rows.map((row:any, i:number) => i === index ? candidate : row), draft.AdCollegeId, draft.AdSectionId, draft.AdTermId);
  const issues = await validateSmartRows(rows, draft.AdCollegeId, draft.AdSectionId,{requireDepartmentInstructor:draft.importLayout==="authority-pdf"});
  const termRows = await Repository.getSchedulesByScope({ termId: draft.AdTermId });
  const external = termRows.filter(row => !(Number(row.AdCollegeId) === draft.AdCollegeId && Number(row.AdSectionId) === draft.AdSectionId));
  const conflictRows = blockingConflicts(rows, [...external, ...rows], await approvalBlockerOptions());
  const rowIssues = mapSmartIssuesToRows(rows, issues, conflictRows);
  const issueRowIds = Object.keys(rowIssues).map(Number);
  const updated = await Repository.updateScheduleDraft(draft.id, { rows });
  res.json({ success: true, row: rows[index], rows: updated.rows, issues, issueRowIds, rowIssues, ready: issues.length === 0 });
});

app.delete("/api/intelligence/drafts/:id/rows/:rowId", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const draft = await Repository.getScheduleDraftById(String(req.params.id));
  if (!draft) { res.status(404).json({ error: "المسودة غير موجودة" }); return; }
  if (!isScopeAllowed(req, draft.AdCollegeId, draft.AdSectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const rowId = Number(req.params.rowId || 0);
  if (!draft.rows.some((row:any) => Number(row.id) === rowId)) { res.status(404).json({ error: "الموعد غير موجود داخل المسودة" }); return; }
  const rows = draft.importLayout==="authority-pdf"
    ? assignAuthoritySections(safeDraftRows(draft.rows.filter((row:any) => Number(row.id) !== rowId), draft.AdCollegeId, draft.AdSectionId, draft.AdTermId))
    : safeDraftRows(draft.rows.filter((row:any) => Number(row.id) !== rowId), draft.AdCollegeId, draft.AdSectionId, draft.AdTermId);
  const issues = rows.length ? await validateSmartRows(rows, draft.AdCollegeId, draft.AdSectionId,{requireDepartmentInstructor:draft.importLayout==="authority-pdf"}) : [];
  const termRows = await Repository.getSchedulesByScope({ termId: draft.AdTermId });
  const external = termRows.filter(row => !(Number(row.AdCollegeId) === draft.AdCollegeId && Number(row.AdSectionId) === draft.AdSectionId));
  const conflictRows = rows.length ? blockingConflicts(rows, [...external, ...rows], await approvalBlockerOptions()) : [];
  const rowIssues = rows.length ? mapSmartIssuesToRows(rows, issues, conflictRows) : {};
  const issueRowIds = Object.keys(rowIssues).map(Number);
  const updated = await Repository.updateScheduleDraft(draft.id, { rows });
  res.json({ success: true, rows: updated.rows, issues, issueRowIds, rowIssues, ready: rows.length > 0 && issues.length === 0 });
});

app.delete("/api/intelligence/drafts/:id/rows", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  if (req.get("x-schedule-confirm") !== "delete-all-draft-rows") { res.status(409).json({ error: "يتطلب حذف الجميع تأكيداً صريحاً" }); return; }
  const draft = await Repository.getScheduleDraftById(String(req.params.id));
  if (!draft) { res.status(404).json({ error: "المسودة غير موجودة" }); return; }
  if (!isScopeAllowed(req, draft.AdCollegeId, draft.AdSectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const updated = await Repository.updateScheduleDraft(draft.id, { rows: [] });
  res.json({ success: true, rows: updated.rows, issues: [], issueRowIds: [], rowIssues: {}, ready: false });
});

app.post("/api/intelligence/drafts/:id/publish", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  if(!confirmTokens(req).has("publish")){res.status(409).json({error:"يتطلب النشر تأكيداً صريحاً من واجهة الاعتماد"});return;}
  const draft=await Repository.getScheduleDraftById(String(req.params.id));
  if(!draft){res.status(404).json({error:"المسودة غير موجودة"});return;}
  if(!isScopeAllowed(req,draft.AdCollegeId,draft.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  if(draft.importLayout==="authority-pdf"&&!await verifyPdfImportReceipt(draft.importReceipt||"",{collegeId:draft.AdCollegeId,sectionId:draft.AdSectionId,termId:draft.AdTermId})){
    res.status(409).json({error:"شهادة مطابقة ترويسة PDF غائبة أو غير صالحة لهذه المسودة؛ أوقف النشر وأعد الاستيراد. لا يمكن تجاوز فحص الفصل والكلية والقسم.",code:"PDF_IMPORT_RECEIPT_INVALID"});return;
  }

  const publishLock = await scheduleLockRefusal(req,draft.AdCollegeId, draft.AdSectionId, draft.AdTermId);
  if (publishLock) { res.status(409).json({ error: publishLock, code: "schedule-locked" }); return; }

  /* النشر من مسودةٍ مستوردة هو الاستيراد نفسه واصلاً إلى الجدول: هنا يُقاس
     بالموعد، لا عند رفع الملف — فقد يُرفع الملف قبل الموعد ويُنشر بعده. */
  const draftWholesaleKind: "import" | "copy-term" | undefined =
    draft.source === "import" || draft.importLayout === "authority-pdf" ? "import"
      : /^بداية الفصل/.test(String(draft.name || "")) ? "copy-term" : undefined;
  if (draftWholesaleKind) {
    const importRefusal = await wholesaleRefusal(draft.AdCollegeId, draft.AdSectionId, draft.AdTermId, { kind: draftWholesaleKind });
    if (importRefusal) { res.status(409).json({ error: importRefusal, code: "deadline-wholesale" }); return; }
  }
  /* ── «فصلٌ فارغ» يُقاس لحظة النشر لا لحظة الحفظ ─────────────────────────
     المسودة قد تُحفظ اليوم وتُنشر غداً، وبينهما يُضاف موعد يدوياً أو يُنشر
     استيراد آخر. النشر يستبدل النطاق كاملاً، فكان يمحو ما أُضيف بصمت. */
  const replacingFilled=Boolean(draft.replaceFilled)&&confirmTokens(req).has("replace-filled");
  if(draft.importLayout==="authority-pdf"&&draft.status!=="published"&&!replacingFilled){
    const occupiedNow=await Repository.getSchedulesByScope({collegeId:draft.AdCollegeId,sectionId:draft.AdSectionId,termId:draft.AdTermId});
    if(occupiedNow.length){
      res.status(409).json({error:`أُضيف إلى هذا الفصل ${countOf(occupiedNow.length, AR.appointment)} بعد حفظ نسخة PDF. نسخ جدول PDF متاح للفصل الفارغ فقط؛ لم يُنشر شيء ولم يُحذف شيء.`,code:"PDF_TARGET_TERM_OCCUPIED"});
      return;
    }
  }
  /* ما تغيّر في الجدول بعد حفظ المسودة يُسمّى قبل أن يُمحى. */
  const draftOverwrite = draft.status !== "published"
    ? await scopeOverwriteRefusal(req, draft.AdCollegeId, draft.AdSectionId, draft.AdTermId, draft)
    : null;
  if (draftOverwrite) { res.status(409).json(draftOverwrite); return; }

  let publishRows=draft.importLayout==="authority-pdf"
    ?assignAuthoritySections(safeDraftRows(draft.rows,draft.AdCollegeId,draft.AdSectionId,draft.AdTermId))
    :safeDraftRows(draft.rows,draft.AdCollegeId,draft.AdSectionId,draft.AdTermId);
  let issues=await validateSmartRows(publishRows,draft.AdCollegeId,draft.AdSectionId,{requireDepartmentInstructor:draft.importLayout==="authority-pdf"});
  let adjusted=0;
  /* Beginning-of-term drafts may only be blocked because the copied placement
     collides with the new term. Repair that case before rejecting: the existing
     optimiser is safety-first and moves time only — never course, teacher, day
     or room. This also repairs genesis drafts created before this release. */
  if(issues.length&&/^بداية الفصل/.test(String(draft.name||""))){
    const termRows=await Repository.getSchedulesByScope({termId:draft.AdTermId});
    const external=termRows.filter(row=>!(Number(row.AdCollegeId)===Number(draft.AdCollegeId)&&Number(row.AdSectionId)===Number(draft.AdSectionId)));
    const original=new Map(publishRows.map(row=>[Number(row.id),`${row.fstarttime}|${row.fendtime}`]));
    for(let pass=0;pass<4;pass++){
      const proposal=autoScheduleProposal(publishRows,[...external,...publishRows]);
      publishRows=proposal.rows;
      if(!proposal.changed)break;
    }
    adjusted=publishRows.filter(row=>original.get(Number(row.id))!==`${row.fstarttime}|${row.fendtime}`).length;
    issues=await validateSmartRows(publishRows,draft.AdCollegeId,draft.AdSectionId,{requireDepartmentInstructor:draft.importLayout==="authority-pdf"});
  }
  if(issues.length){
    const termRows=await Repository.getSchedulesByScope({termId:draft.AdTermId});
    const externalRows=termRows.filter(row=>!(Number(row.AdCollegeId)===draft.AdCollegeId&&Number(row.AdSectionId)===draft.AdSectionId));
    const conflictRows=blockingConflicts(publishRows,[...externalRows,...publishRows],await approvalBlockerOptions());
    const rowIssues=mapSmartIssuesToRows(publishRows,issues,conflictRows);
    const issueRowIds=Object.keys(rowIssues).map(Number);
    res.status(400).json({error:"لا يمكن نشر المسودة قبل معالجة البيانات",issues,issueRowIds,rowIssues});return;
  }

  /* ── كل صف يُنشر في موقعه ────────────────────────────────────────────────
   * الجامعة تصدر للقسم الواحد ملفاً واحداً يحوي مواقع الفرع الثلاثة: الرئيسي
   * والجهراء والفحيحيل. وكل موقع مسجل عندنا ككلية مستقلة لها قسم بالرمز نفسه.
   * فالمستخدم يستورد مرة واحدة، والنشر هو الذي يضع كل صف حيث ينتمي فعلاً —
   * بدل أن تُحشر صفوف الجهراء في جدول الرئيسي فيبقى جدول الجهراء فارغاً وتُنسب
   * أحمالها وقاعاتها إلى الكلية الخطأ.
   *
   * الشرط الذي لا يُتنازل عنه: إما أن تُنشر المواقع كلها أو لا يُكتب شيء. نشر
   * ينجح في الجهراء ويفشل في الفحيحيل أسوأ من فشل كامل، لأن نصف جدول منشور لا
   * يعلن عن نفسه. لذلك يُفحص كل موقع بالكامل — صلاحية، ومقررات، وتحقق — قبل
   * أول عملية كتابة.
   */
  const [publishColleges,publishSections,publishCourses,publishRegistry]=await Promise.all([
    Repository.getColleges(),Repository.getSections(),Repository.getCourses(),readLocationRegistry(),
  ]);
  const branchContext={colleges:publishColleges as any,sections:publishSections as any,baseCollegeId:draft.AdCollegeId,baseSectionId:draft.AdSectionId};
  /* ── الموقع يُقرأ من المبنى، لا من حقل قد يضيع ───────────────────────────
   * كل صف يحمل كود موقعه منذ القراءة، لكن الحقل قابل للضياع: تحريرٌ في
   * المعاينة، أو مسودة أُنشئت قبل هذا الإصدار، أو نسخة قديمة من الواجهة —
   * وكان الصف حينها يُنشر في الموقع الذي فُتح منه الاستيراد بلا أي إنذار،
   * فيختفي جدول الجهراء داخل جدول الرئيسي. والحقيقة لا تحتاج ذلك الحقل
   * أصلاً: المبنى الرسمي المثبت في الصف يحمل موقعه في كوده (012J14 ⇦ 012J).
   * فتُشتق من السجل أولاً، ولا يُرجع إلى الحقل إلا حين لا يكون هناك مبنى. */
  const buildingById=new Map(publishRegistry.buildings.map((item:any)=>[String(item.id),item]));
  const siteOfRow=(row:any)=>{
    const building=buildingById.get(String(row?.buildingId||""));
    const official=String(building?.sitePrefix||building?.officialCode?.slice(0,4)||"").toUpperCase();
    return official||String(row?.sourceSitePrefix||"").toUpperCase();
  };
  const locatedRows=(publishRows as any[]).map(row=>{
    const site=siteOfRow(row);
    return site?{...row,sourceSitePrefix:site}:row;
  });
  const split=splitRowsByBranch(locatedRows,branchContext);
  if(split.unplaced.length){
    res.status(400).json({
      error:"تعذّر تحديد القسم الذي تنتمي إليه بعض الصفوف بحسب موقع المبنى؛ لم يُنشر أي صف.",
      code:"BRANCH_SCOPE_UNRESOLVED",
      issues:split.unplaced.map(entry=>`${countOf(entry.rows.length,AR.row)} في «${entry.siteLabel}» بلا قسم مناظر بالرمز نفسه في هذا الفرع.`),
    });return;
  }

  /* المقرر هوية داخل قسمه: الصف الذي يذهب إلى الجهراء يجب أن يحمل رقم المقرر
     في كتالوج قسم الجهراء لا رقم نظيره في الرئيسي. تُعاد المطابقة برمز المقرر
     الرسمي؛ ومقرر لا نظير له هناك يوقف النشر باسمه ولا يُخترع له رقم. */
  const courseByIdForPublish=new Map(publishCourses.map((course:any)=>[Number(course.AdCourseId),course]));
  const courseKey=(collegeId:number,sectionId:number,code:unknown)=>`${collegeId}:${sectionId}:${academicDigits(code)||String(code||"").trim().toUpperCase()}`;
  const courseByScopeCode=new Map(publishCourses.map((course:any)=>[courseKey(Number(course.AdCollegeId),Number(course.AdSectionId),course.CourseCode),course]));
  const missingTwins=new Map<string,{scope:BranchScope;origin:any}>();
  const unknownCourses:string[]=[];
  const groups=split.groups.map(group=>{
    const rows=group.rows.map((row:any)=>{
      if(group.scope.isBase)return {...row,AdCollegeId:group.scope.collegeId,AdSectionId:group.scope.sectionId};
      const origin=courseByIdForPublish.get(Number(row.AdCourseId));
      if(!origin){
        unknownCourses.push(`صف «${String(row.AdCourseName||row.AdCourseId)}» بلا مقرر معروف في النظام.`);
        return {...row,AdCollegeId:group.scope.collegeId,AdSectionId:group.scope.sectionId};
      }
      const key=courseKey(group.scope.collegeId,group.scope.sectionId,origin.CourseCode);
      const twin=courseByScopeCode.get(key);
      if(!twin){
        /* ── المقرر يُنسخ إلى كتالوج الموقع، ولا يُخترع ─────────────────────
         * القسم واحد في مواقعه الثلاثة، ولكل موقع كتالوجه. والوثيقة المعتمدة
         * تُثبت أن هذا المقرر يُدرَّس في الفحيحيل، بينما كتالوج الفحيحيل لم
         * يُنشأ له فيه سطر بعد — فكان النشر كله يُردّ من أجل سطرٍ ناقص.
         * والمقرر موجود في النظام بهويته الكاملة في كتالوج المقر، فيُنسخ منه
         * كما هو: الرمز نفسه والاسم والوحدات والساعات. لا قيمة تُقرأ من ملف،
         * ولا رقم يُخترع، ولا نسخ إلا بعد التحقق من الصلاحية على ذلك القسم. */
        missingTwins.set(key,{scope:group.scope,origin});
        return {...row,AdCollegeId:group.scope.collegeId,AdSectionId:group.scope.sectionId,__twinKey:key};
      }
      return {...row,AdCollegeId:group.scope.collegeId,AdSectionId:group.scope.sectionId,AdCourseId:Number(twin.AdCourseId),AdCourseName:String(twin.CourseName||row.AdCourseName||"")};
    });
    return {scope:group.scope,rows};
  });
  if(unknownCourses.length){
    res.status(400).json({error:"لا يمكن النشر: مقرر أو أكثر ليس له نظير في قسم الموقع الآخر. لم يُنشر أي صف.",code:"BRANCH_COURSE_MISSING",issues:[...new Set(unknownCourses)].slice(0,20)});return;
  }

  /* الصلاحية تُفحص قبل أول كتابة، والنسخ كتابة. */
  const forbidden=groups.filter(group=>!isScopeAllowed(req,group.scope.collegeId,group.scope.sectionId));
  if(forbidden.length){
    res.status(403).json({
      error:"هذا الملف يحوي مواقع خارج صلاحياتك؛ لم يُنشر أي صف.",
      code:"BRANCH_SCOPE_FORBIDDEN",
      issues:forbidden.map(group=>`«${group.scope.siteLabel}» — ${countOf(group.rows.length,AR.row)} تحتاج صلاحية على قسمها هناك.`),
    });return;
  }

  /* ── القفل على كل موقعٍ يُكتب فيه، لا على المسودة وحدها ───────────────────
   *
   * وثيقةُ الاعتماد الواحدة تحمل مواقع الفرع الثلاثة، وتُستورد من موقعٍ واحد
   * ثم يُنشر كلُّ صفٍّ في موقعه. فكان القفل يُقرأ على قسم المسودة وحده، بينما
   * الكتابةُ تقع على ثلاثة أقسام — وقسمٌ شقيقٌ جدولُه بين يدي التسجيل الآن
   * يُستبدل جدولُه كاملاً وهو يُقرأ.
   *
   * والفحص قبل أول كتابة لا بعدها: النشرُ إمّا أن يقع كلُّه أو لا يقع، وقفلٌ
   * يُكتشف في منتصف الحلقة يترك موقعين منشورين وثالثاً مردوداً.
   */
  for(const group of groups){
    const groupLock=await scheduleLockRefusal(req,group.scope.collegeId,group.scope.sectionId,draft.AdTermId);
    if(groupLock){
      res.status(409).json({
        error:`«${group.scope.siteLabel}» ${groupLock} لم يُنشر أي صف.`,
        code:"schedule-locked",
      });return;
    }
    const groupDeadline=await wholesaleRefusal(group.scope.collegeId,group.scope.sectionId,draft.AdTermId,await replacementAction(group.scope.collegeId,group.scope.sectionId,draft.AdTermId,group.rows,draftWholesaleKind));
    if(groupDeadline){
      res.status(409).json({
        error:`«${group.scope.siteLabel}» — ${groupDeadline} لم يُنشر أي صف.`,
        code:"deadline-wholesale",
      });return;
    }
  }

  const plantedTwins:string[]=[];
  if(missingTwins.size){
    const failed:string[]=[];
    for(const [key,entry] of missingTwins){
      try{
        const created=await Repository.createCourse(
          entry.scope.collegeId,entry.scope.sectionId,
          String(entry.origin.CourseCode||"").trim(),String(entry.origin.CourseName||"").trim(),
          Number(entry.origin.CourseCredit||0),Number(entry.origin.CourseHours||0),Number(entry.origin.MaxStudent||0),
        );
        courseByScopeCode.set(key,created as any);
        plantedTwins.push(`«${String(created.CourseName||"")}» في «${entry.scope.siteLabel}»`);
      }catch{
        failed.push(`«${String(entry.origin.CourseName||entry.origin.CourseCode)}» تعذّرت إضافته إلى كتالوج القسم بـ«${entry.scope.siteLabel}».`);
      }
    }
    if(failed.length){
      res.status(400).json({error:"لا يمكن النشر: مقرر أو أكثر ليس له نظير في قسم الموقع الآخر. لم يُنشر أي صف.",code:"BRANCH_COURSE_MISSING",issues:[...new Set(failed)].slice(0,20)});return;
    }
    groups.forEach(group=>{
      group.rows=group.rows.map((row:any)=>{
        if(!row.__twinKey)return row;
        const twin=courseByScopeCode.get(String(row.__twinKey));
        const {__twinKey,...rest}=row;
        return twin?{...rest,AdCourseId:Number(twin.AdCourseId),AdCourseName:String(twin.CourseName||rest.AdCourseName||"")}:rest;
      });
    });
  }

  for(const group of groups){
    if(group.scope.isBase)continue;
    const branchIssues=await validateSmartRows(group.rows,group.scope.collegeId,group.scope.sectionId,{requireDepartmentInstructor:draft.importLayout==="authority-pdf"});
    if(branchIssues.length){
      res.status(400).json({
        error:`لا يمكن النشر: صفوف «${group.scope.siteLabel}» لم تجتز التحقق في قسمها. لم يُنشر أي صف.`,
        code:"BRANCH_VALIDATION_FAILED",
        issues:branchIssues.map(issue=>`${group.scope.siteLabel} · ${issue}`),
      });return;
    }
  }

  /* نقاط الأمان أولاً ولكل موقع، حتى يكون لكل جدول ما يعود إليه. */
  const publishVersions=new Map<any,Awaited<ReturnType<typeof captureScopeVersion>>>();
  for(const group of groups){
    publishVersions.set(group,await captureScopeVersion(req,group.scope.collegeId,group.scope.sectionId,draft.AdTermId,`قبل نشر: ${draft.name}`,"publish"));
  }
  const written:any[]=[];
  let publication:any=null;
  const publishedScopes:Array<{siteLabel:string;count:number}>=[];
  for(const group of groups){
    const rows=await Repository.replaceScheduleScope(group.scope.collegeId,group.scope.sectionId,draft.AdTermId,group.rows);
    await recordVersionAfter(publishVersions.get(group),rows as any[]);
    /* وكلُّ موقعٍ يُبلَّغ عن نشره: جدولٌ مقبولٌ يعود جولةً جديدة، وصفٌّ يصل
       بعد توقيع رئيس القسم ينتظر إقراره — في موقعه هو، لا في موقع المسودة. */
    await noteScheduleMutation(req,group.scope.collegeId,group.scope.sectionId,draft.AdTermId,{kind:"add",rows:rows as any[]});
    written.push(...rows);
    publishedScopes.push({siteLabel:group.scope.siteLabel,count:rows.length});
    const record=await Repository.upsertSchedulePublication({AdCollegeId:group.scope.collegeId,AdSectionId:group.scope.sectionId,AdTermId:draft.AdTermId,SystemUserId:req.user.SystemUserId,userName:req.user.Name,draftId:draft.id});
    if(group.scope.isBase||!publication)publication=record;
  }
  await Repository.updateScheduleDraft(draft.id,{status:"published",rows:written,publishedAt:new Date().toISOString()});
  /* نقاطُ التراجع: «تراجع» بعد «طبّق» يسترجع هذه النسخ (/api/intelligence/versions/:id/restore). */
  const undoVersions=[...publishVersions.values()].map(version=>String((version as any)?.id||"")).filter(Boolean);
  res.json({success:true,count:written.length,publication,adjusted,scopes:publishedScopes,plantedCourses:plantedTwins,undoVersions});
});

app.get("/api/intelligence/versions", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const versions=await Repository.getScheduleVersions(collegeId,sectionId,termId,80); res.json(versions.map(({rows,...meta})=>({...meta,rowCount:Number(meta.rowCount ?? rows.length)})));
});
app.get("/api/intelligence/versions/compare", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const a=await Repository.getScheduleVersionById(String(req.query.fromId||"")),b=await Repository.getScheduleVersionById(String(req.query.toId||"")); if(!a||!b){res.status(404).json({error:"إحدى النسختين غير موجودة"});return;} if(a.scopeKey!==b.scopeKey||!isScopeAllowed(req,a.AdCollegeId,a.AdSectionId)){res.status(403).json({error:"لا يمكن مقارنة نسخ خارج نطاق القسم"});return;} const key=(r:any)=>`${r.AdCourseId}:${r.SCode}:${r.AdInstructorId}:${activeDays(r).join(",")}:${r.fstarttime}:${r.fendtime}:${r.AdRoomCode}:${r.AdRoomHall}`; const ak=new Set(a.rows.map(key)),bk=new Set(b.rows.map(key)); res.json({from:{id:a.id,label:a.label,createdAt:a.createdAt,count:a.rows.length,rows:a.rows},to:{id:b.id,label:b.label,createdAt:b.createdAt,count:b.rows.length,rows:b.rows},added:[...bk].filter(x=>!ak.has(x)).length,removed:[...ak].filter(x=>!bk.has(x)).length,unchanged:[...bk].filter(x=>ak.has(x)).length});
});
app.post("/api/intelligence/versions/:id/restore", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  if(!confirmTokens(req).has("restore")){res.status(409).json({error:"يتطلب الاسترجاع تأكيداً صريحاً"});return;} const version=await Repository.getScheduleVersionById(String(req.params.id)); if(!version){res.status(404).json({error:"النسخة غير موجودة"});return;} if(!isScopeAllowed(req,version.AdCollegeId,version.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const restoreLock=await scheduleLockRefusal(req,version.AdCollegeId,version.AdSectionId,version.AdTermId); if(restoreLock){res.status(409).json({error:restoreLock,code:"schedule-locked"});return;} const restored=safeDraftRows(version.rows,version.AdCollegeId,version.AdSectionId,version.AdTermId); const restoreOverwrite=await scopeOverwriteRefusal(req,version.AdCollegeId,version.AdSectionId,version.AdTermId,version); if(restoreOverwrite){res.status(409).json(restoreOverwrite);return;} const restoreDeadline=await wholesaleRefusal(version.AdCollegeId,version.AdSectionId,version.AdTermId,await replacementAction(version.AdCollegeId,version.AdSectionId,version.AdTermId,restored)); if(restoreDeadline){res.status(409).json({error:restoreDeadline,code:"deadline-wholesale"});return;} const issues=await validateSmartRows(restored,version.AdCollegeId,version.AdSectionId,{resolveHistorical:true}); if(issues.length){res.status(400).json({error:"لا يمكن استرجاع نسخة تحتوي أوقاتاً أو تعارضات غير صالحة",issues});return;} const restoreVersion=await captureScopeVersion(req,version.AdCollegeId,version.AdSectionId,version.AdTermId,`قبل استرجاع: ${version.label}`,"undo"); const rows=await Repository.replaceScheduleScope(version.AdCollegeId,version.AdSectionId,version.AdTermId,restored); await recordVersionAfter(restoreVersion,rows as any[]); await noteScheduleMutation(req,version.AdCollegeId,version.AdSectionId,version.AdTermId,{kind:"add",rows:rows as any[]}); await Repository.upsertSchedulePublication({AdCollegeId:version.AdCollegeId,AdSectionId:version.AdSectionId,AdTermId:version.AdTermId,SystemUserId:req.user.SystemUserId,userName:req.user.Name,draftId:`restore:${version.id}`}); res.json({success:true,count:rows.length});
});

app.get("/api/intelligence/compare-terms", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0),fromTermId=Number(req.query.fromTermId||0),toTermId=Number(req.query.toTermId||0); if(!collegeId||!sectionId||!fromTermId||!toTermId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const [fromData,toData,courses,instructors,terms]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,fromTermId),scopedScheduleUniverse(collegeId,sectionId,toTermId),Repository.getCourses(),Repository.getInstructors(),Repository.getTerms()]); const readScopes = await intelligenceReadScopes(req, collegeId, sectionId);
  const from = fromData.universe.filter(row => readScopes.some(scope => Number(row.AdCollegeId) === scope.collegeId && Number(row.AdSectionId) === scope.sectionId));
  const to = toData.universe.filter(row => readScopes.some(scope => Number(row.AdCollegeId) === scope.collegeId && Number(row.AdSectionId) === scope.sectionId));
  const diff = compareIntelligenceTerms(from, to, readScopes);
  const colleges = await Repository.getColleges();
  const courseById=new Map(courses.map(row=>[row.AdCourseId,row]));
  const instructorName=(id:number)=>instructors.find(row=>row.AdInstructorId===id)?.AdInstructorName||"";
  /* المنتدب يُعرف بقسمه وفصله: قبل/بعد يُقرآن من فصليهما، لا من فصلٍ واحد. */
  const compareVisiting=new Map<string,Set<number>>();
  for(const termSide of [fromTermId,toTermId])for(const scope of readScopes){
    compareVisiting.set(`${termSide}:${scope.collegeId}:${scope.sectionId}`,new Set((await readVisitingStatus(scope.collegeId,scope.sectionId,termSide)).instructorIds.map(Number)));
  }
  const isVisitingAt=(termSide:number,collegeId:unknown,sectionId:unknown,instructorId:unknown)=>Boolean(compareVisiting.get(`${termSide}:${Number(collegeId)}:${Number(sectionId)}`)?.has(Number(instructorId)));
  // Rows are shaped for reading, not for editing: code, section, and the
  // properties that differ. Nothing here is writable from this screen.
  const shapeRow=(row:any,termSide:number=toTermId)=>({
    id:row.id,
    collegeId: row.AdCollegeId, sectionId: row.AdSectionId,
    collegeName: colleges.find(c => Number(c.AdCollegeId) === Number(row.AdCollegeId))?.AdCollegeName || "",
    code:courseById.get(row.AdCourseId)?.CourseCode||"",
    name:row.AdCourseName||courseById.get(row.AdCourseId)?.CourseName||"",
    section:row.SCode||"",
    time:formatScheduleTimeRange(row.fstarttime, row.fendtime),
    room:[row.AdRoomCode,row.AdRoomHall].filter(Boolean).join("/"),
    instructor:instructorName(Number(row.AdInstructorId||0)),
    instructorId:Number(row.AdInstructorId||0),
    visiting:isVisitingAt(termSide,row.AdCollegeId,row.AdSectionId,row.AdInstructorId)
  });
  res.json({
    ...diff,
    appeared:diff.appeared.slice(0,80).map(row=>shapeRow(row,toTermId)),
    disappeared:diff.disappeared.slice(0,80).map(row=>shapeRow(row,fromTermId)),
    moved:diff.moved.slice(0,80).map(entry=>{
      // roomKey joins with a pipe for comparison; a reader wants a slash.
      const readable=(side:any,termSide:number)=>({...side,room:String(side.room||"").replaceAll("|","/"),instructor:instructorName(side.instructorId),visiting:isVisitingAt(termSide,entry.row.AdCollegeId,entry.row.AdSectionId,side.instructorId)});
      return {...shapeRow(entry.row,toTermId),fields:entry.fields,before:readable(entry.from,fromTermId),after:readable(entry.to,toTermId)};
    }),
    fromTermName:terms.find(t=>t.AdTermId===fromTermId)?.AdTermName||"",
    toTermName:terms.find(t=>t.AdTermId===toTermId)?.AdTermName||"",
    fromScore:analyzeSchedule(from,fromData.universe,courses,instructors,await approvalBlockerOptions()).score,
    toScore:analyzeSchedule(to,toData.universe,courses,instructors,await approvalBlockerOptions()).score
  });
});
}
