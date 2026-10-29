/**
 * ── التقارير ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { NextFunction, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { Repository } from "../../db/repository";
import { byRoom } from "../../utils/sorting";
import { activeDays, analyzeSchedule, timeToMinutes } from "../../utils/scheduleIntelligence";
import { buildFairnessEngine } from "../../utils/livingSchedule";
import type { AdCourse, FSchedule, ScheduleNoteField } from "../../types";
import { DAY_FLAGS } from "../../utils/naturalQuery";
import { departmentFamily } from "../../utils/sectionLabel";
import { readVisitingTeaching } from "../visitingTeachingRead";
import { aggregateVisitingHistory } from "../../utils/visitingHistory";
import { coversWholeCollege } from "../readScope";
import { APPROVAL_STATUS_LABEL, roundBaselineVersionId, roundEndVersionId } from "../../utils/approvalWorkflow";
import { diffSchedules, fieldValue as diffFieldValue, summarizeDiff } from "../../utils/scheduleDiff";
import { blockingConflictDetails, blockingConflicts } from "../../utils/scheduleBlockers";
import { chooseCaptureBaseline } from "../../utils/changesBaseline";
import { reviewSchedule } from "../../utils/scheduleRegulations";
import { roleDefinition } from "../../utils/academicRoles";
import { withVisitingSuffix } from "../../utils/visitingText";
import { formatScheduleTimeRange, SCHEDULE_DAY_END, SCHEDULE_DAY_START } from "../../utils/scheduleTime";
import { authorityCourseCode, authorityDepartmentCode } from "../../utils/authorityAcademicCodes";
import { REPORT_STAMP_KIND_LABEL, REPORT_STAMP_MAX_ROWS, compareReportStamp, normalizeReportStampCode, reportStampCode, stampRowHash, stampRowValues, type ReportStampKind, type ReportStampRecord, type ReportStampSite } from "../../utils/reportStamp";
import { reportStampPage, type ReportStampLine } from "../reportStampPage";
import { publicPageNonce } from "../core/publicPages";
import { isInvalidLocationToken, roomIdentityKey } from "../../utils/locationRegistry";
import { siblingBranchScopes } from "../../utils/branchScope";
import * as XLSX from "xlsx";
import { countBlockingConflicts, readApproval, readDeadlineFor, regulationNoticesForScope } from "../core/approvals";
import { type AuthenticatedRequest, getCookies, requireAnyPermission, requireAuth, requirePermission } from "../core/auth";
import { authorityBaselineForScope, authorityCourseCodeMap, buildAuthorityPdfDiff, inferAuthorityBranchCode } from "../core/authority";
import { notesWithState } from "../core/notes";
import { courseNameCollator, sortTermsNewestServer, verifiedRoomKey } from "../core/ordering";
import { finalRowsOnly, readSchedulesForRequest, readsFinalSchedulesOnly } from "../core/scheduleReads";
import { instructorsForReader, isScopeAllowed, scopedScheduleUniverse } from "../core/scope";
import { approvalBlockerOptions } from "../core/smartImport";
import { readLiveVisitingRoster, readVisitingStatus, visitingChecker } from "../core/visiting";

/*
 * ── Rate limit for the demo role switch ──────────────────────────────────────
 *
 * Uses `express-rate-limit` rather than a hand-written counter for one reason
 * that the hand-written limiters elsewhere cannot satisfy: the code scanner only
 * recognizes rate limiting from known libraries, so a custom middleware — even
 * one that always enforces — leaves the authenticated route flagged. This is the
 * one library-backed limiter in the file, kept generous (thirty switches a
 * minute per address) so demoing every role never hits a wall.
 */
/* تقرير التغييرات يقرأ الفصل ونسخه ويقارن: أثقلُ قراءةٍ يفتحها كل دور. حدٌّ
   سخيٌّ لقارئٍ بشري، يمنع حلقةً مسعورة من تجميد الخادم للجميع. */
const rateLimitHeavyReport = rateLimit({
  windowMs: 60_000,
  limit: 90,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "طلباتٌ كثيرة لهذا التقرير في وقتٍ قصير. انتظر قليلاً ثم أعد المحاولة." },
});

/** أقسامُ كليةٍ يغطّيها القارئ كلَّها — فارغةٌ إن لم يغطّها (الحَكَم الواحد). */
async function wholeCollegeSectionIds(req: AuthenticatedRequest, collegeId: number): Promise<number[]> {
  const sections = await Repository.getSections();
  const allowed = (c: number, s: number) => isScopeAllowed(req, c, s);
  if (!coversWholeCollege(sections, allowed, collegeId)) return [];
  return sections.filter(row => Number(row.AdCollegeId) === collegeId).map(row => Number(row.AdSectionId)).filter(Boolean);
}

/**
 * النسخة المعتمدة التي تخص النطاق، ولو كانت محفوظةً عند موقع شقيق للفرع.
 *
 * تقرير PDF وشاشة تغييرات الجدول يجب أن يبدآ من الوثيقة نفسها. إبقاء البحث
 * داخل مسار التقرير وحده جعل الشاشة تسقط إلى لقطات الجولات، وحين لا تجدها
 * تقارن بالعدم فتصف الجدول كله بأنه «مضاف». هذه الدالة هي الباب الواحد
 * للعثور على الوثيقة المعتمدة في الموضعين.
 */
async function authorityDraftForScope(collegeId:number,sectionId:number,termId:number){
  const authorityDrafts=(list:any[])=>list.filter((item:any)=>
    item.importLayout==="authority-pdf"&&Array.isArray(item.baselineRows)&&item.baselineRows.length
  );
  const local=authorityDrafts(await Repository.getScheduleDrafts(collegeId,sectionId,termId));
  let draft=local.find((item:any)=>item.status==="published")||local[0];
  if(draft)return draft;

  const [colleges,sections]=await Promise.all([Repository.getColleges(),Repository.getSections()]);
  const siblings=siblingBranchScopes({colleges:colleges as any,sections:sections as any,baseCollegeId:collegeId,baseSectionId:sectionId})
    .filter(scope=>!(Number(scope.collegeId)===collegeId&&Number(scope.sectionId)===sectionId));
  for(const scope of siblings){
    const candidates=authorityDrafts(await Repository.getScheduleDrafts(scope.collegeId,scope.sectionId,termId));
    const owned=[] as any[];
    for(const candidate of candidates){
      const mine=await authorityBaselineForScope(candidate.baselineRows||[],candidate,collegeId,sectionId);
      if(mine.length)owned.push(candidate);
    }
    draft=owned.find((item:any)=>item.status==="published")||owned[0];
    if(draft)return draft;
  }
  return undefined;
}

/** السؤال عن قسمٍ واحد، حين لا يكون في اليد جدولُ الفصل أصلاً. */
async function blockingConflictCount(collegeId: number, sectionId: number, termId: number): Promise<number> {
  const [scopeRows, termRows, options] = await Promise.all([
    Repository.getSchedulesByScope({ collegeId, sectionId, termId }),
    Repository.getSchedulesByScope({ termId }),
    approvalBlockerOptions(),
  ]);
  return countBlockingConflicts(scopeRows, termRows, options);
}

/**
 * ── السببُ جاهزٌ قبل أن يُكتب ────────────────────────────────────────────────
 *
 * موظّفُ التسجيل أمام عشرين قسماً لا يكتب جملةً لكل خانة. والنظام يعرف أصلاً
 * لماذا هذه الخانة مشكوكٌ فيها — فاحصُ التعارضات يقوله، وفاحصُ اللائحة يقوله.
 * فبدل أن يُسأل الموظّف عن سببٍ يعرفه النظام، يُعرض عليه مكتوباً وتكفي ضغطةُ
 * تأكيد.
 *
 * والاقتراح اقتراحٌ لا حكم: يُملأ في الصندوق، ويُمحى إن شاء، ويُكتب غيره.
 */
async function noteSuggestions(collegeId: number, sectionId: number, termId: number) {
  const suggestions = new Map<string, string>();   // `${scheduleId}:${field}`
  try {
    const [scopeRows, termRows, instructors, courses] = await Promise.all([
      Repository.getSchedulesByScope({ collegeId, sectionId, termId }),
      Repository.getSchedulesByScope({ termId }),
      Repository.getInstructors(),
      Repository.getCourses(),
    ]);
    const instructorName = new Map<number, string>(instructors.map((row: any) => [Number(row.AdInstructorId), String(row.AdInstructorName || "")]));
    const byId = new Map(termRows.map((row: any) => [Number(row.id), row]));
    const put = (scheduleId: number, field: ScheduleNoteField, text: string) => {
      const key = `${scheduleId}:${field}`;
      if (!suggestions.has(key)) suggestions.set(key, text);
    };

    /* التعارضُ المادّي أدقُّ ما يُقترح: يقول الخانة ويقول مع من. */
    const ownIds = new Set(scopeRows.map((row: any) => Number(row.id)));
    for (const item of blockingConflicts(scopeRows, termRows, await approvalBlockerOptions())) {
      const ownId = ownIds.has(Number(item.rowId)) ? Number(item.rowId) : Number(item.otherId);
      if (!ownIds.has(ownId)) continue;
      const other = byId.get(Number(item.rowId) === ownId ? Number(item.otherId) : Number(item.rowId));
      const sameScope = other
        && Number(other.AdCollegeId) === collegeId
        && Number(other.AdSectionId) === sectionId;
      /* اكتشاف التعارض يستعمل جدول الفصل كله، لكن النص الخارج لقسمٍ واحد لا
         يسمّي مقرر القسم الآخر أو شعبته. داخل القسم نفسه تبقى التفاصيل مفيدة
         ومشروعة، وخارجه تكفي حقيقة وجود حجز مقابل. */
      const withWhom = sameScope
        ? ` مع ${String(other.AdCourseName || "موعد آخر")} شعبة ${String(other.SCode || "—")}`
        : other ? " مع حجز آخر خارج نطاق القسم" : "";
      if (item.type === "room") put(ownId, "room", `القاعة محجوزة في هذا الوقت${withWhom}`);
      else if (item.type === "instructor") put(ownId, "instructor", `أستاذ المقرر محجوز في هذا الوقت${withWhom}`);
      else if (item.type === "duplicate") put(ownId, "sectionCode", `موعدٌ مطابقٌ تماماً لنفس المقرر والشعبة${withWhom}`);
    }

    /* واللائحةُ تُقترح ولا تمنع، كما تُعرض ولا تمنع. */
    const findings = reviewSchedule({
      rows: scopeRows as any,
      courses: new Map(courses.map((row: any) => [Number(row.AdCourseId), row])),
      instructors: new Map(instructors.map((row: any) => [Number(row.AdInstructorId), row])),
    });
    for (const finding of findings as any[]) {
      const rowIds: number[] = Array.isArray(finding.rowIds) ? finding.rowIds.map(Number)
        : Number.isFinite(Number(finding.rowId)) ? [Number(finding.rowId)] : [];
      for (const rowId of rowIds) {
        if (!ownIds.has(rowId)) continue;
        put(rowId, "row", String(finding.title || finding.message || "مخالفة لائحية").slice(0, 160));
      }
    }
    void instructorName;
  } catch {
    /* الاقتراحُ راحةٌ لا شرط: تعذّرُه يترك الصندوق فارغاً ولا يمنع الملاحظة. */
  }
  return Object.fromEntries(suggestions);
}

/**
 * Room load and free windows.
 *
 * "Is this room free?" cannot be answered from one department's rows — a hall
 * booked by another college is still occupied. The occupancy grid is therefore
 * built from the whole term, but it carries only room, day and time: no course,
 * no instructor, nothing that belongs to another department. Rooms the caller
 * owns are marked so the screen can separate "my load" from "campus load".
 */
/**
 * ميزان الأقسام — the one report only the main administrator can act on.
 *
 * Every other report answers for a single department, which means the person
 * who can see all of them has been comparing by eye: open the fairness lens,
 * write the number down, change the department, repeat. The comparison itself
 * was never on a screen.
 *
 * This puts every department of the term on one line each — how many
 * appointments it carries, how many staff and halls it uses, how its teaching
 * load splits between morning and evening, how evenly the burden falls across
 * its instructors, and how many collisions it still holds. Nothing here is new
 * analysis; it is the readings the product already computes, finally side by
 * side. It reads the whole term once and derives every row from that, so the
 * page costs one read rather than one per department.
 */
/**
 * ── ميزان الأقسام ───────────────────────────────────────────────────────────
 *
 * كان مقصوراً على الإدارة الرئيسية وحدها، لأنه القراءة التي ترى الأقسام كلها
 * في جدولٍ واحد. وهو بالضبط ما يحتاجه العميد ولا يحتاج غيره: سؤاله — «هل
 * سلّمت الأقسام؟ ومن تأخّر؟» — صفٌّ واحد لكل قسم، وهذا الجدول صفٌّ لكل قسم.
 *
 * فبدل بناء لوحةٍ ثانية تقول الشيء نفسه وتفترق عنه عند أول تعديل، فُتح هذا —
 * محكوماً بالنطاق كغيره: العميد يرى كليته، وعميد التسجيل يرى الجميع، ومن لا
 * نطاق له لا يرى شيئاً. والإدارة الرئيسية تبقى كما كانت، ترى الكل.
 */
function balanceScopeLabel(req: AuthenticatedRequest): "الجامعة" | "الكلية" | "النطاق" {
  if (req.user?.IsAdminUser || roleDefinition(req.user?.Role).scopeMode === "allColleges") return "الجامعة";
  const colleges = new Set((req.scopes || []).map(scope => Number(scope.AdCollegeId)).filter(Boolean));
  const wholeCollege = (req.scopes || []).some(scope => !Number(scope.AdSectionId));
  if (colleges.size === 1 && (wholeCollege || roleDefinition(req.user?.Role).scopeMode === "college")) return "الكلية";
  return "النطاق";
}

export function registerReportsRoutes(app: Express): void {

app.get("/api/reports/visiting-roster", requireAnyPermission([7, 8, 9, 10, 14, 16, 17]), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0);
  const sectionId = Number(req.query.sectionId || 0);
  const termId = Number(req.query.termId || 0);
  if (!collegeId || !termId) { res.json({ instructorIds: [] }); return; }
  /* مستوى الكلية (N7): من يغطّي الكلية كلها (العميد) يرى منتدبي أقسامها جميعاً. */
  const sectionIds = sectionId ? [sectionId] : await wholeCollegeSectionIds(req, collegeId);
  if (!sectionIds.length || !sectionIds.every(id => isScopeAllowed(req, collegeId, id))) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const parts = await Promise.all(sectionIds.map(id => readLiveVisitingRoster(collegeId, id, termId)));
  const instructorIds = [...new Set(parts.flatMap(part => part.instructorIds))];
  const instructors = [...new Map(parts.flatMap(part => part.instructors).map((person: any) => [Number(person.AdInstructorId), person])).values()];
  res.json({ instructorIds, instructors: instructorsForReader(req, instructors as any[]) });
});

/** ── استعلام المنتدبين: القسم العلمي عبر كلياته ─────────────────────────────
 *  الكلية والقسم هنا يحدّدان «القسم العلمي» لا حدود النتيجة: يُقرأ منتدبو
 *  عائلته وتدريسهم في كل كلية فيها قسمٌ مناظر يملك القارئ صلاحيتها. وما لا
 *  يملكها يُذكر باسمه ويُعلَّم الإجمالي «غير مكتمل» — لا يُعرض ناقصٌ كأنه كامل.
 *  خاصٌّ بهذا الاستعلام: بقية الاستعلامات والاعتماد على نطاقها كما هو. */
app.get("/api/reports/visiting-teaching", requireAnyPermission([7, 8, 9, 10, 14, 16, 17]), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0);
  const sectionId = Number(req.query.sectionId || 0);
  const termId = Number(req.query.termId || 0);
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "حدد الكلية والقسم والفصل." }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const result = await readVisitingTeaching((c, s) => isScopeAllowed(req, c, s), collegeId, sectionId, termId);
  res.json({ ...result, instructors: instructorsForReader(req, result.instructors as any[]) });
});

app.get("/api/reports/visiting-history", requireAnyPermission([7, 8, 9, 10, 14, 16, 17]), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0);
  if(!collegeId){res.status(400).json({error:"حدد الكلية."});return;}
  /* مستوى الكلية (N7): أقسامُ الكلية كلها لمن يغطّيها. */
  const sectionIds=sectionId?[sectionId]:await wholeCollegeSectionIds(req,collegeId);
  if(!sectionIds.length||!sectionIds.every(id=>isScopeAllowed(req,collegeId,id))){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [instructors,terms,directories,allSections,colleges]=await Promise.all([
    Repository.getInstructors(),
    Repository.getTerms(),
    Promise.all(sectionIds.map(id=>Repository.getDepartmentDelegates(collegeId,id))),
    Repository.getSections(),
    Repository.getColleges(),
  ]);
  /* سجلّ المنتدبين جزءٌ من استعلام المنتدبين: القسم المختار يحدّد «القسم
     العلمي»، ويُقرأ تدريس منتدبيه في كل كلياته التي يملك القارئ صلاحيتها.
     مستوى الكلية (بلا قسم) يبقى على أقسام الكلية كما كان. */
  const sectionNames=new Map((allSections as any[]).map(row=>[Number(row.AdSectionId),String(row.AdSectionName||"")]));
  const collegeNames=new Map((colleges as any[]).map(row=>[Number(row.AdCollegeId),String(row.AdCollegeName||"")]));
  const members=(sectionId?departmentFamily(allSections as any[],collegeId,sectionId):sectionIds.map(id=>({collegeId,sectionId:id})))
    .map(member=>({...member,collegeName:collegeNames.get(member.collegeId)||"",sectionName:sectionNames.get(member.sectionId)||"",allowed:isScopeAllowed(req,member.collegeId,member.sectionId)}));
  const readable=members.filter(member=>member.allowed);
  /* روستر الفصل في المستودع اتحادُ العائلة أصلاً؛ ويُدمج هنا فصلاً فصلاً. */
  const rosterGroups=await Promise.all(sectionIds.map(id=>Repository.getVisitingRosterHistory(collegeId,id)));
  const rosterByTerm=new Map<number,Set<number>>();
  for(const row of rosterGroups.flat()){const termId=Number(row.termId||0);if(!termId)continue;const set=rosterByTerm.get(termId)||new Set<number>();(row.instructorIds||[]).forEach((id:unknown)=>set.add(Number(id)));rosterByTerm.set(termId,set);}
  const rosters=[...rosterByTerm.entries()].map(([termId,ids])=>({termId,instructorIds:[...ids]}));
  const activeDelegateIds=new Set(directories.flat().map(Number));
  const peopleById=new Map(instructors.map(person=>[Number(person.AdInstructorId),person]));
  const termsById=new Map(terms.map(term=>[Number(term.AdTermId),term]));
  const termIds=[...rosterByTerm.keys()];
  const rowsByTerm=new Map<number,any[]>();
  await Promise.all(termIds.map(async termId=>{
    const groups=await Promise.all(readable.map(member=>Repository.getSchedulesByScope({collegeId:member.collegeId,sectionId:member.sectionId,termId})));
    rowsByTerm.set(termId,groups.flat());
  }));
  /* التاريخُ تاريخ: من كان منتدباً في فصلٍ مضى يبقى فيه ولو خرج من دليل القسم
     اليوم (N7)، ويُعلَّم من لم يعد في الدليل. */
  const people=aggregateVisitingHistory({
    rosters,
    rowsByTerm,
    known:id=>peopleById.has(id),
    termName:termId=>String(termsById.get(termId)?.AdTermName||termId),
  }).map(entry=>{
    const person=peopleById.get(entry.instructorId);
    return {
      ...entry,
      name:person?.AdInstructorName||`منتدب ${entry.instructorId}`,
      civil:person?instructorsForReader(req,[person])[0].AdInstructorCivil||"":"",
      listedNow:activeDelegateIds.has(entry.instructorId),
    };
  });
  const knownOrderedTermIds=sortTermsNewestServer(terms.filter(term=>termIds.includes(Number(term.AdTermId))))
    .map(term=>Number(term.AdTermId));
  const knownTermIdSet=new Set(knownOrderedTermIds);
  const orderedTermIds=[...knownOrderedTermIds,...termIds.filter(termId=>!knownTermIdSet.has(termId)).sort((a,b)=>b-a)];
  res.json({
    terms:orderedTermIds.map(termId=>({termId,termName:termsById.get(termId)?.AdTermName||String(termId)})),
    people,
    family:members,
    complete:members.every(member=>member.allowed),
  });
});

/**
 * تقرير التغييرات لقسمٍ واحد.
 *
 * إذا وُجد ملفُّ الهيئة المعتمد فأساس المقارنة ومحركها هما نفسهما في تقرير
 * PDF الرسمي: مرجع الصف أولاً، ثم أثر الاستيراد الثابت، مع تصنيف المضاف
 * والمحذوف والمعدّل. لقطات الجولات تبقى بديلاً للفصول القديمة التي لم
 * تُستورد لها وثيقة معتمدة.
 */
app.get("/api/reports/schedule-changes", rateLimitHeavyReport, requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0), sectionId = Number(req.query.sectionId || 0), termId = Number(req.query.termId || 0);
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "اختر الفصل والكلية والقسم أولاً." }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }

  const approval = await readApproval(collegeId, sectionId, termId);
  /* العميدان يريان النهائيَّ وحده (readsFinalSchedulesOnly): تقريرُ تغييراتِ جدولٍ
     لم يُعتمد يعرض مسوّدةً لا تعرضها لهما شاشةٌ أخرى. */
  if (readsFinalSchedulesOnly(req) && approval.status !== "accepted") {
    res.status(403).json({ error: "لم يُعتمد هذا الجدول بعد — يُعرض لكم بعد اعتماده." });
    return;
  }
  /* الجولة المطلوبة تُقرأ من الطلب ليُفتح الشريط الزمني، وتُقصر على ما وقع
     فعلاً: رقمٌ خارج المدى يعيد الجولة الجارية بدل أن يردّ خطأً عن شيءٍ لا
     يملك الناظر أن يصلحه. */
  const requestedRound = Number(req.query.round || 0);
  const round = requestedRound > 0 && requestedRound <= approval.currentRound ? requestedRound : approval.currentRound;
  /* ── أساسُ المقارنة يُختار ولا يُفرض (R9) ─────────────────────────────────
   * كان وجودُ وثيقة الهيئة يجعل المقارنة بها دائماً، أيّاً كانت الجولة
   * المطلوبة — فمن فتح «الجولة ٢» رأى الفرق عن ملف PDF لا عمّا رآه التسجيل.
   * فالأساس `round` متى طُلبت جولةٌ بعينها، و`authority` حين يُطلب صراحةً أو
   * لا تُطلب جولة. */
  const baselineParam = String(req.query.baseline || "");
  const wantsAuthority = baselineParam === "authority" || (baselineParam !== "round" && !requestedRound);
  /* جولةٌ مضت تُقرأ بين أساسها ونهايتها، لا بين أساسها والجدول الحيّ. */
  const roundEndId = roundEndVersionId(approval, round);

  /**
   * ── الأساس الاحتياطي للفصول بلا وثيقة هيئة ─────────────────────────────
   *
   * لا «الجولة السابقة» بالترقيم. فليست كل جولةٍ تحمل نسخة: الجولة التي تُفتح
   * تلقائياً حين يعدّل القسم جدولاً مقبولاً تُنشأ بلا نسخةٍ محفوظة — لأنها لم
   * تبدأ بإرسالٍ من أحد.
   *
   * والأخذ بالجولة السابقة وحدها كان يقع على تلك الجولة فيجد يداً فارغة، فيُقارن
   * الجدول بالعدم: كلُّ صفٍّ «مضاف»، والموظّف الذي فتح التقرير ليرى ما تحرّك
   * يجد جدولاً كاملاً مطلوباً منه أن يقرأه من أوّله. فيُمسح إلى الوراء حتى
   * تُوجد نسخة.
   */
  const roundBaselineId = roundBaselineVersionId(approval, round);

  const [roundBaseline, liveRows, roundEnd, instructors, courses, notesRaw, suggestions, authorityFound] = await Promise.all([
    roundBaselineId ? Repository.getScheduleVersionById(roundBaselineId) : Promise.resolve(undefined),
    Repository.getSchedulesByScope({ collegeId, sectionId, termId }),
    roundEndId ? Repository.getScheduleVersionById(roundEndId) : Promise.resolve(undefined),
    Repository.getInstructors(),
    Repository.getCourses(),
    notesWithState(collegeId, sectionId, termId),
    noteSuggestions(collegeId, sectionId, termId),
    authorityDraftForScope(collegeId, sectionId, termId),
  ]);
  const authorityDraft = wantsAuthority ? authorityFound : undefined;
  /* «الجدول» في جولةٍ مضت هو ما انتهت عليه تلك الجولة. */
  const live = (roundEnd?.rows as any[]) || liveRows;
  /* ملاحظاتُ القسم لكلٍّ كاتبُها (R12): الشاشةُ تعرف ملاحظتَك من ملاحظة زميلك. */
  const viewerId = Number(req.user?.SystemUserId || 0);
  const notes = notesRaw.map(note => ({ ...note, mine: Number(note.SystemUserId) === viewerId }));

  /**
   * ── أساسٌ لا يسقط إلى العدم ──────────────────────────────────────────────
   *
   * حين لا تُوجد نسخةُ جولةٍ سابقة، كان التقرير يقارن الجدولَ بلا شيء: فيصير
   * كلُّ صفٍّ «مضاف»، ولا يظهر معدَّلٌ ولا محذوفٌ البتّة. وهذا ما يراه موظّفُ
   * التسجيل: جدولٌ كامل يُطلب منه أن يقرأه من أوّله، وقد تحرّك فيه صفّان.
   *
   * وليس ذلك حالاً نادرة: الجولةُ التي تُفتح تلقائياً حين يعدّل القسمُ جدولاً
   * مقبولاً تُنشأ بلا نسخةٍ محفوظة، لأنها لم تبدأ بإرسالٍ من أحد. فقسمٌ
   * جولاتُه كلُّها من هذا النوع لا يملك أساساً أبداً.
   *
   * والنُّسَخُ تُلتقط عند كلِّ تعديلٍ على أيّ حال، فيُؤخذ الأساسُ منها.
   *
   * **ولحظةُ الأساس هي فتحُ الجولة، لا آخرُ تعديل.** فقسمٌ حذف خمسةَ صفوفٍ ثم
   * غيّر أستاذَ سادسٍ كان يُعرض للتسجيل «معدَّلٌ واحد»، والحذوفُ الخمسةُ لا
   * أثر لها: مراجعةٌ تبدو صحيحةً وهي ناقصة، وذلك أسوأُ من مراجعةٍ تبدو ناقصة.
   *
   * فالمرساةُ لحظةُ آخِرِ نظرةٍ للتسجيل: إرجاعُ هذه الجولة أو قبولُها إن كان
   * التسجيلُ قد نظر فيها وردّها، وإلا فإرجاعُ الجولة السابقة أو قبولُها.
   *
   * **والإرسالُ ليس نظرة.** ولو جُعل مرساةً لانكسرت أولُ مراجعةٍ: القسمُ يعدّل
   * ويوقّع قبل الإرسال وبعده، فتُلتقط نُسَخ، ويختار البحثُ إحداها أساساً —
   * فيُعرض على التسجيل «تعديلٌ واحدٌ منذ الإرسال» بدل الجدول كلِّه، وهو أولُ
   * مرّةٍ يراه فيها. فإن لم يكن التسجيلُ قد نظر قطّ فلا أساسَ أصلاً، وكلُّ
   * صفٍّ مضافٌ — وهو الصوابُ لا العطل.
   *
   * **واللقطةُ تحفظ ما كان قبل التعديل، وتُنشأ لحظةَ التعديل.** وهذا يقلب
   * جهةَ البحث، وقد أخطأتُها أوّلَ مرّة: كلُّ لقطةٍ لهذه الجولة أحدثُ من
   * المرساة بالضرورة — لأن التعديل يقع بعد الإرسال أو الإرجاع لا قبله — فطلبُ
   * «أحدثِ ما التُقط عند المرساة أو قبلها» لا ينطبق عليه شيءٌ أبداً، ويسقط
   * الأساسُ إلى العدم فيعود البلاغُ كما كان.
   *
   * والمطلوبُ أقدمُ لقطةٍ بعد المرساة: هي التي تحمل الحالَ قبل أوّلِ تعديلٍ في
   * هذه الجولة، أي ما رآه التسجيل آخرَ مرّة بعينه. والقائمةُ مرتَّبةٌ تنازلياً،
   * فآخرُ ما ينطبق هو المطلوب.
   *
   * وإن لم يوجد شيءٌ البتّة فهي أولُ مراجعةٍ حقاً، ويُقال ذلك صراحةً بدل أن
   * يُفهم من كثرة «المضاف».
   */
  const currentRound = approval.rounds.find(item => item.number === round);
  const currentRoundVersionId = currentRound?.reviewedVersionId;
  let baselineVersion = roundBaseline;
  let baselineSource: "authority" | "round" | "capture" | "reviewed" | "none" = authorityDraft ? "authority" : (roundBaseline ? "round" : "none");
  if (!authorityDraft && !baselineVersion) {
    const history = await Repository.getScheduleVersions(collegeId, sectionId, termId, 100);
    const choice = chooseCaptureBaseline(approval.rounds as any, round, history as any);
    if (choice.kind === "capture") {
      baselineVersion = await Repository.getScheduleVersionById(choice.versionId);
      if (baselineVersion) baselineSource = "capture";
    } else if (choice.kind === "reviewed") {
      baselineVersion = { id: "", rows: live } as any;
      baselineSource = "reviewed";
    }
  }
  const baselineVersionId = authorityDraft || baselineSource === "reviewed" ? null : (baselineVersion?.id || null);

  const names = {
    instructorById: new Map(instructors.map((row: any) => [Number(row.AdInstructorId), String(row.AdInstructorName || "")])),
    courseById: new Map(courses.map((row: any) => [Number(row.AdCourseId), String(row.CourseName || row.CourseCode || "")])),
  };
  let diff = diffSchedules(baselineVersion?.rows as any, live as any, names);
  let authoritySource: { draftId:string; name:string; sourceFileName:string; importedAt?:string; publishedAt?:string|null } | undefined;
  if(authorityDraft){
    const scopedBaseline=await authorityBaselineForScope(authorityDraft.baselineRows||[],authorityDraft,collegeId,sectionId);
    const authorityComparison=buildAuthorityPdfDiff(scopedBaseline,live as any,{
      instructorNameById:names.instructorById,
      courseCodeById:new Map((courses as any[]).map(row=>[Number(row.AdCourseId),String(row.CourseCode||"").trim()])),
    });
    const rawFieldGroups: Array<["course"|"sectionCode"|"days"|"time"|"room"|"instructor",string[]]> = [
      ["course",["AdCourseId"]],
      ["sectionCode",["SCode"]],
      ["days",["fsunday","fmonday","ftuesday","fwednesday","fthursday"]],
      ["time",["fstarttime","fendtime"]],
      ["room",["AdRoomCode","AdRoomHall"]],
      ["instructor",["AdInstructorId"]],
    ];
    const entries=authorityComparison.rows.flatMap((entry:any)=>{
      if(entry.status==="unchanged")return [];
      const row=entry.current||entry.source;
      if(!row)return [];
      const kind=entry.status==="deleted"?"removed":entry.status;
      const changes=entry.status==="changed"
        ?rawFieldGroups.filter(([,fields])=>fields.some(field=>entry.changedFields.includes(field))).map(([field])=>({
          field,label:{course:"المقرر",sectionCode:"رقم الشعبة",days:"الأيام",time:"الوقت",room:"القاعة",instructor:"أستاذ المقرر"}[field],
          before:diffFieldValue(entry.source,field,names),after:diffFieldValue(entry.current,field,names),
        }))
        :[];
      return [{kind,scheduleId:Number(row.id),row,changes}];
    });
    diff={
      entries,
      counts:{
        added:authorityComparison.counts.added,
        removed:authorityComparison.counts.deleted,
        changed:authorityComparison.counts.changed,
        unchanged:authorityComparison.counts.unchanged,
      },
      firstReview:false,
    };
    authoritySource={
      draftId:String(authorityDraft.id),name:String(authorityDraft.name||""),
      sourceFileName:String(authorityDraft.sourceFileName||"الجدول المعتمد.pdf"),
      importedAt:authorityDraft.createdAt,publishedAt:authorityDraft.publishedAt||null,
    };
  }
  const deadline = await readDeadlineFor(approval, termId);

  /* ── الصفُّ يُقرأ بالشكل الذي يقرؤه الناسُ كلَّ يوم ─────────────────────
   *
   * «مواعيد القسم» في ورشة الجدول هي الصورةُ التي تعوّدتها العينُ في هذا
   * النظام: رقمُ المقرّر ثم اسمُه ثم شعبتُه، وتحته أستاذُه وأيامُه، ثم الوقتُ
   * والمكان. وشاشةُ التغييرات كانت تعرض اسمَ المقرّر ورقمَ الشعبة وحدهما،
   * فيقرأ الموظّفُ «تغيّرت القاعة» ولا يعرف في أيِّ موعدٍ من الأسبوع.
   *
   * فيُرسل الصفُّ كاملاً مشكّلاً مرّةً واحدة، ويلبس الطرفان — ما تحرّك
   * والجدولُ كامل — الشكلَ نفسه. */
  const courseCodeById = new Map((courses as any[]).map(row => [Number(row.AdCourseId), String(row.CourseCode || "")]));
  /* ── الأيامُ بأسمائها ──────────────────────────────────────────────────
     «ح ث» اختصارٌ يعرفه من وضعه. ومن يقرأ الصفَّ ليقرّر فيه يقرأ «الأحد -
     الثلاثاء» كما يقرؤها في الجدول الدراسيّ نفسِه، بالألفاظ نفسِها من
     `scheduleDays` لا بألفاظٍ تشبهها. والمقارنةُ تبقى على صيغتها كما هي:
     هذا عرضٌ، وذاك قياس. */
  const SHOW_DAYS: Array<[string, string]> = [
    ["fsunday", "الأحد"], ["fmonday", "الاثنين"], ["ftuesday", "الثلاثاء"],
    ["fwednesday", "الأربعاء"], ["fthursday", "الخميس"],
  ];
  const namedDays = (row: any) =>
    SHOW_DAYS.filter(([key]) => Boolean(row?.[key])).map(([, label]) => label).join(" - ");
  const firstDayOrder = (row: any) => {
    const index = SHOW_DAYS.findIndex(([key]) => Boolean(row?.[key]));
    return index < 0 ? 99 : index;
  };
  /* المنتدبون يُعرفون في كل شاشةٍ بشارتهم: يُحمل علمُ المنتدب مع كل صفٍّ يعرضه التقرير. */
  const visitingIdsForReport = new Set((await readVisitingStatus(collegeId, sectionId, termId)).instructorIds.map(Number));
  const asDisplayRow = (row: any) => ({
    scheduleId: Number(row.id),
    visiting: visitingIdsForReport.has(Number(row.AdInstructorId)),
    courseCode: courseCodeById.get(Number(row.AdCourseId)) || "",
    course: names.courseById.get(Number(row.AdCourseId)) || String(row.AdCourseName || `موعد ${row.id}`),
    sectionCode: String(row.SCode || "—"),
    time: diffFieldValue(row, "time", names),
    days: namedDays(row) || "بدون أيام",
    room: diffFieldValue(row, "room", names),
    instructor: diffFieldValue(row, "instructor", names),
    dayOrder: firstDayOrder(row),
    startMinutes: timeToMinutes(String(row.fstarttime || "")),
  });
  /* وللمحذوف يُشكَّل صفُّه كما كان قبل الحذف — وهو ما يحمله `entry.row` أصلاً. */
  const diffForClient = {
    ...diff,
    entries: diff.entries
      .map(entry => ({ ...entry, display: asDisplayRow(entry.row) }))
      .sort((a, b) =>
        (a.display.dayOrder ?? 99) - (b.display.dayOrder ?? 99)
        || (a.display.startMinutes ?? 99999) - (b.display.startMinutes ?? 99999)
        || String(a.display.courseCode || "").localeCompare(String(b.display.courseCode || ""), "ar", { numeric: true })
        || String(a.display.sectionCode || "").localeCompare(String(b.display.sectionCode || ""), "ar", { numeric: true })
        || a.display.course.localeCompare(b.display.course, "ar")),
  };

  /* ── الجدول كامل، لا التغييرات وحدها ────────────────────────────────────
   *
   * «ما تحرّك» هو مدخلُ المراجعة السريعة، لكنّ من يقرّر يريد أن يرى الموعد في
   * سياق جدوله: أين يقع، وبمَ يجاوره. فيُرسل الجدولُ كاملاً مشكّلاً كما تُقرأ
   * خاناتُه — والواجهةُ تعلّق عليه الملاحظات في مواضعها، فيُرى الجدول
   * والملاحظات معاً لا الملاحظات وحدها. */
  const changedById = new Map<number, string>(diff.entries.map(entry => [Number(entry.scheduleId), String(entry.kind)]));
  const liveIds = new Set((live as any[]).map(row => Number(row.id)));
  const removedRows = diff.entries
    .filter(entry => entry.kind === "removed" && !liveIds.has(Number(entry.scheduleId)))
    .map(entry => ({ ...asDisplayRow(entry.row), changed: true, changeKind: "removed" as const }));
  const fullSchedule = [
    ...(live as any[]).map(row => ({
      ...asDisplayRow(row),
      changed: changedById.get(Number(row.id)) === "changed" || changedById.get(Number(row.id)) === "added",
      changeKind: changedById.get(Number(row.id)) || undefined,
    })),
    ...removedRows,
  ]
    .sort((a, b) =>
      (a.dayOrder ?? 99) - (b.dayOrder ?? 99)
      || (a.startMinutes ?? 99999) - (b.startMinutes ?? 99999)
      || String(a.courseCode || "").localeCompare(String(b.courseCode || ""), "ar", { numeric: true })
      || String(a.sectionCode || "").localeCompare(String(b.sectionCode || ""), "ar", { numeric: true })
      || a.course.localeCompare(b.course, "ar"));

  res.json({
    approval,
    statusLabel: APPROVAL_STATUS_LABEL[approval.status],
    round,
    rounds: approval.rounds,
    deadline,
    /* ما يُرسله القرار ليُعرف أنه وقع على ما رُئي (R6). */
    rowCount: liveRows.length,
    /* أوثيقةُ الهيئة متاحةٌ أساساً، ولو لم تُختر الآن. */
    authorityAvailable: Boolean(authorityFound),
    viewingPastRound: round < approval.currentRound,
    baselineVersionId,
    /* من أين تبدأ المقارنة: وثيقة الهيئة، أو نسخة جولة، أو لقطة محفوظة، أو
       لا شيء. والشاشة تقول ذلك بدل أن يستنتجه القارئ من كثرة «المضاف». */
    baselineSource,
    authoritySource,
    diff: diffForClient,
    fullSchedule,
    summary: summarizeDiff(diff),
    notes,
    /* السببُ الجاهز لا يحمل أي اسم أو تفاصيل من قسمٍ آخر. */
    suggestions,
    blockingConflicts: await blockingConflictCount(collegeId, sectionId, termId),
    reviewBlockers: await (async () => {
      const [scopeRows, termRows, courses] = await Promise.all([
        Repository.getSchedulesByScope({ collegeId, sectionId, termId }),
        Repository.getSchedulesByScope({ termId }),
        Repository.getCourses(),
      ]);
      const instructors = await Repository.getInstructors();
      return blockingConflictDetails(scopeRows as any[], termRows as any[],
        new Map((courses as any[]).map(row => [Number(row.AdCourseId), String(row.CourseName || "")])),
        new Map((instructors as any[]).map(row => [Number(row.AdInstructorId), String(row.AdInstructorName || "")])),
        await approvalBlockerOptions());
    })(),
    regulationNotices: await regulationNoticesForScope(collegeId, sectionId, termId),
  });
});

app.get("/api/reports/authority-pdf-diff", requireAnyPermission([7,8,9,10,14,16,17]), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0),termId=Number(req.query.termId||0);
  if(!collegeId||!sectionId||!termId){res.status(400).json({error:"اختر الفصل والكلية والقسم أولاً."});return;}
  if(!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const draft=await authorityDraftForScope(collegeId,sectionId,termId);
  /* سؤال التهيئة (meta=1) يسأل «هل توجد نسخة؟» لا «هات التقرير»: غيابها جوابٌ
     عاديّ لا خطأ، فلا يُرسَل 404 يظهر في كل فتحةٍ لشاشة الاستعلامات. */
  if(!draft&&String(req.query.meta||"")==="1"){res.json({draftId:null});return;}
  if(!draft){res.status(404).json({error:"لا توجد نسخة PDF معتمدة محفوظة لهذا الفصل والقسم بعد."});return;}
  const [live,instructors]=await Promise.all([
    Repository.getSchedulesByScope({collegeId,sectionId,termId}),
    Repository.getInstructors(),
  ]);
  const instructorNameById=new Map<number,string>(instructors.map((row:any)=>[Number(row.AdInstructorId),String(row.AdInstructorName||"")] as [number,string]));
  /* An empty live table is still a meaningful comparison: it means every row
     that existed in the imported Authority PDF was deleted. Returning 404 here
     hid the most important possible deletion report. Keep the immutable
     baseline and let buildAuthorityPdfDiff classify every original row as
     `deleted` instead of suppressing the report. */
  const scopedBaseline=await authorityBaselineForScope(draft.baselineRows||[],draft,collegeId,sectionId);
  const comparison=buildAuthorityPdfDiff(scopedBaseline,live,{instructorNameById,courseCodeById:await authorityCourseCodeMap()});
  res.json({
    draftId:draft.id,name:draft.name,sourceFileName:draft.sourceFileName||"الجدول المعتمد.pdf",
    sourceBranchCode:inferAuthorityBranchCode(draft,[...scopedBaseline,...live]),
    sourceBranchName:draft.sourceBranchName||"",
    importedAt:draft.createdAt,publishedAt:draft.publishedAt||null,
    ...comparison,
  });
});

/**
 * ── ختمُ الورقة المطبوعة: التسجيل (utils/reportStamp) ───────────────────────
 *
 * المتصفح يحسب الختم من الصفوف التي طبعها ويرسمه في ذيل الورقة، ثم يرسل
 * هنا ما طبع بعد أمر الطباعة لا قبله. والخادم لا يأخذ الورقة بكلامها: يقرأ
 * صفوفها من الجدول نفسه ويحفظ قيمها هو، ويعلّم ما اختلف منها عمّا رآه
 * المتصفح (شاشةٌ لم تُحدَّث). ومن هذه القيم تُقارَن الورقة بالجدول الحيّ
 * كلما مُسح ختمها.
 */
const rateLimitReportStamp = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "طباعاتٌ كثيرة في وقتٍ قصير. انتظر قليلاً." },
});
app.post("/api/report-stamps", rateLimitReportStamp, requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body || {};
  const kind = String(body.kind || "") as ReportStampKind;
  const termId = Number(body.termId) || 0;
  const sites: ReportStampSite[] = (Array.isArray(body.sites) ? body.sites : []).slice(0, 12)
    .map((site: any) => ({ collegeId: Number(site?.collegeId) || 0, sectionId: Number(site?.sectionId) || 0 }))
    .filter((site: ReportStampSite) => site.collegeId > 0 && site.sectionId > 0);
  const draftIds: string[] = (Array.isArray(body.draftIds) ? body.draftIds : []).slice(0, 12).map((id: unknown) => String(id || "")).filter(Boolean);
  const claimed: Array<{ id: number; h: string }> = (Array.isArray(body.rows) ? body.rows : []).slice(0, REPORT_STAMP_MAX_ROWS + 1)
    .map((row: any) => ({ id: Number(row?.id) || 0, h: String(row?.h || "") }))
    .filter((row: { id: number; h: string }) => row.id > 0 && /^[0-9a-z]{1,12}$/.test(row.h));
  const wholeScope = body.wholeScope === true;
  const code = normalizeReportStampCode(body.code);
  if (!Object.prototype.hasOwnProperty.call(REPORT_STAMP_KIND_LABEL, kind) || !termId || !sites.length || !claimed.length || claimed.length > REPORT_STAMP_MAX_ROWS || !code) {
    res.status(400).json({ error: "ختمٌ ناقص." });
    return;
  }
  if (sites.some(site => !isScopeAllowed(req, site.collegeId, site.sectionId))) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  /* الرمزُ يُعاد حسابه هنا: سجلٌّ لا يطابق رمزَه لا يُكتب، ولا يُكتب فوق ختمِ ورقةٍ أخرى. */
  if (reportStampCode({ kind, termId, sites, draftIds, wholeScope, rows: claimed }) !== code) { res.status(409).json({ error: "الختم لا يطابق صفوفه." }); return; }
  const at = new Date().toISOString();
  const existing = await Repository.getReportStamp(code);
  if (existing) {
    await Repository.saveReportStamp({ ...existing, lastPrintedAt: at, printCount: (Number(existing.printCount) || 1) + 1 });
    res.json({ code, firstPrintedAt: existing.firstPrintedAt });
    return;
  }
  const [scopes, courses] = await Promise.all([
    Promise.all(sites.map(site => Repository.getSchedulesByScope({ collegeId: site.collegeId, sectionId: site.sectionId, termId }))),
    Repository.getCourses(),
  ]);
  const live = new Map<number, FSchedule>(scopes.flat().map(row => [Number(row.id), row] as [number, FSchedule]));
  const courseById = new Map<number, AdCourse>(courses.map(course => [Number(course.AdCourseId), course] as [number, AdCourse]));
  const staleRowIds: number[] = [];
  const rows = claimed.map(row => {
    const current = live.get(row.id);
    /* صفٌّ في الورقة لم يعد في نطاقها: حُذف بين قراءة الشاشة والطباعة، فيُحفظ بلا قيمٍ ويُعدّ محذوفاً. */
    if (!current) { staleRowIds.push(row.id); return { id: row.id, s: 0, v: [] as string[] }; }
    const values = stampRowValues(current, courseById.get(Number(current.AdCourseId)));
    if (stampRowHash(row.id, values) !== row.h) staleRowIds.push(row.id);
    return { id: row.id, s: Number(current.AdSectionId) || 0, v: values };
  });
  const record: ReportStampRecord = { code, kind, termId, sites, draftIds, wholeScope, rows, staleRowIds, firstPrintedAt: at, lastPrintedAt: at, printCount: 1 };
  await Repository.saveReportStamp(record);
  res.status(201).json({ code, firstPrintedAt: at, staleRows: staleRowIds.length });
});

/**
 * ── صفحة التحقق من الورقة المطبوعة (/v/:code) ───────────────────────────────
 *
 * عامةٌ بلا دخول: من يمسك الورقة قد لا يملك حساباً. والجوابُ من الجدول الحيّ
 * لحظةَ السؤال، صفاً صفاً، لا من تاريخٍ مخزَّن. وحدٌّ لكل عنوان يمنع تخمين
 * الرموز. والمسار لا يفرّق بين الحروف الكبيرة والصغيرة: الختمُ يرسم رابطه
 * بالكبيرة ليصغر مربّعه.
 */
const rateLimitReportStampPage = rateLimit({
  windowMs: 60_000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: "محاولاتٌ كثيرة في وقتٍ قصير. انتظر قليلاً ثم أعد المحاولة.",
});
/* نسخةُ العرض (DATA_MODE=demo) لا بيانات حقيقية فيها: الختمُ هناك في صندوق
   الزائر نفسه، فتُقرأ الصفحة منه. والنسخة الحقيقية لا تقرأ صندوقاً تجريبياً
   أبداً، ولو حمل المتصفّح جلسةً تجريبية — القاعدة نفسها في /journey. */
app.use("/v/:code", (req: Request, _res: Response, next: NextFunction) => {
  const sessionId = getCookies(req)["session_id"];
  if (!Repository.isDemoMode() || !sessionId?.startsWith("demo_")) { next(); return; }
  if (!Repository.runDemoSandbox(sessionId, next)) next();
});
app.get(["/v", "/v/:code"], rateLimitReportStampPage, async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  publicPageNonce(res);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const typed = String(req.params.code ?? req.query.c ?? "").trim();
  if (!typed) { res.send(reportStampPage({ state: "ask" })); return; }
  const code = normalizeReportStampCode(typed);
  if (!code) { res.status(404).send(reportStampPage({ state: "invalid", typed: typed.slice(0, 16) })); return; }
  /* ما كُتب باليد (صغيراً أو بشرطة) يُحوَّل إلى رابطه الواحد. */
  if (req.params.code !== code) { res.redirect(303, `/v/${code}`); return; }
  try {
    const record = await Repository.getReportStamp(code);
    if (!record) { res.status(404).send(reportStampPage({ state: "unknown", code })); return; }
    const [scopes, courses, colleges, sections, terms] = await Promise.all([
      Promise.all(record.sites.map(site => Repository.getSchedulesByScope({ collegeId: site.collegeId, sectionId: site.sectionId, termId: record.termId }))),
      Repository.getCourses(),
      Repository.getColleges(),
      Repository.getSections(),
      Repository.getTerms(),
    ]);
    const courseById = new Map<number, AdCourse>(courses.map(course => [Number(course.AdCourseId), course] as [number, AdCourse]));
    const comparison = compareReportStamp(record, scopes.flat(), courseById);
    const collegeById = new Map<number, any>((colleges as any[]).map(college => [Number(college.AdCollegeId), college] as [number, any]));
    const sectionById = new Map<number, any>((sections as any[]).map(section => [Number(section.AdSectionId), section] as [number, any]));
    /* رقم المقرر في الصفحة بسبع خانات كما في الورقة (قاعدة المالك). */
    const line = (item: { sectionId: number; values: string[] }): ReportStampLine => {
      const section = sectionById.get(Number(item.sectionId));
      const departmentKey = authorityDepartmentCode(collegeById.get(Number(section?.AdCollegeId))?.AdCollegeCode, section?.AdSectionCode);
      return { course: item.values[0] ? authorityCourseCode(item.values[0].split("|")[1] || "", departmentKey) : "", name: item.values[1] || "", section: item.values[2] || "" };
    };
    let draftChanged = false;
    if (record.kind === "authority-pdf") {
      const drafts = await Promise.all(record.sites.map(site => authorityDraftForScope(site.collegeId, site.sectionId, record.termId)));
      draftChanged = drafts.map(draft => String((draft as any)?.id || "")).filter(Boolean).sort().join(",") !== [...record.draftIds].sort().join(",");
    }
    let approvalLine = "";
    if (record.sites.length === 1) {
      const site = record.sites[0];
      const approval = await Repository.getScheduleApproval(site.collegeId, site.sectionId, record.termId);
      if (approval) {
        /* السطرُ نفسه الذي تطبعه الترويسة (approvalScopeLine في الاستعلامات). */
        const acceptedAt = (approval.rounds || []).map(round => round.acceptedAt).filter(Boolean).pop();
        approvalLine = approval.status === "accepted"
          ? `معتمد من التسجيل${acceptedAt ? ` بتاريخ ${new Intl.DateTimeFormat("ar-KW-u-nu-latn", { timeZone: "Asia/Kuwait", day: "numeric", month: "long", year: "numeric" }).format(new Date(acceptedAt))}` : ""}`
          : approval.status === "submitted" ? `قيد مراجعة التسجيل — الجولة ${approval.currentRound}`
          : approval.status === "returned" ? `مُرجَع بملاحظات — الجولة ${approval.currentRound}`
          : APPROVAL_STATUS_LABEL[approval.status] || "";
      }
    }
    const unique = (values: string[]) => [...new Set(values.filter(Boolean))].join("، ");
    const outdated = Boolean(comparison.changed.length || comparison.removed.length || comparison.added.length || draftChanged);
    res.send(reportStampPage({
      state: outdated ? "outdated" : "current",
      code,
      kindLabel: REPORT_STAMP_KIND_LABEL[record.kind],
      sectionLine: unique(record.sites.map(site => String(sectionById.get(site.sectionId)?.AdSectionName || ""))),
      collegeLine: unique(record.sites.map(site => String(collegeById.get(site.collegeId)?.AdCollegeName || ""))),
      termName: String((terms as any[]).find(term => Number(term.AdTermId) === Number(record.termId))?.AdTermName || ""),
      rowCount: record.rows.length,
      firstPrintedAt: record.firstPrintedAt,
      lastPrintedAt: record.lastPrintedAt,
      printCount: record.printCount,
      approvalLine,
      draftChanged,
      changed: comparison.changed.map(item => ({ ...line(item), fields: item.fields, beforePrint: item.beforePrint })),
      removed: comparison.removed.map(line),
      added: comparison.added.map(line),
    }));
  } catch (error) {
    console.error("report stamp page failed", error);
    res.status(503).send(reportStampPage({ state: "error", code }));
  }
});

// --- EXCEL EXPORTS (STANDALONE REAL IMPLEMENTATION) ---

app.get("/api/reports/excel/:type", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const reportType = req.params.type;
  const permissionByType: Record<string, number> = {
    ListofTeacherCourseExcel: 14, TeacherWithCourseExcel: 8, ScheduleExcel: 7
  };
  const required = permissionByType[reportType];
  if (!required) { res.status(400).json({ error: "نوع التقرير غير صحيح" }); return; }
  const perms = await Repository.getSecurityByUser(req.user.SystemUserId);
  if (!perms.some(p => p.FormNameId === required)) { res.status(403).json({ error: "ليس لديك صلاحية للوصول إلى هذا القسم" }); return; }
  /**
   * The spreadsheet must contain exactly what the screen contains.
   *
   * Export used to accept six filters while the query screen offered eleven, so
   * narrowing to "Sunday, course 321, before noon" and pressing Excel produced
   * the department's entire term instead — a file that looks like an answer and
   * is not one. The whole filter set travels now, and the two string filters use
   * the same `includes` the screen uses rather than an exact match.
   */
  const { termId, collegeId, sectionId, instructorId, building, hall, courseId, courseCode, civil, startTime, endTime } = req.query;
  let resolvedTermId=Number(termId||0);
  if(!resolvedTermId){const terms=await Repository.getTerms();resolvedTermId=Number(sortTermsNewestServer(terms)[0]?.AdTermId||0);}
  /* قارئ الطلب نفسه (N12): نطاقٌ من الحَكَم الواحد، والنهائيُّ وحده للعميدين —
     كان الملفّ يُخرج المسوّدات التي لا تعرضها الشاشة لهما. */
  let schedules = await readSchedulesForRequest(req, Number(collegeId||0), Number(sectionId||0), resolvedTermId);

  if (instructorId) schedules = schedules.filter(s => s.AdInstructorId === parseInt(instructorId as string));
  if (building) schedules = schedules.filter(s => String(s.AdRoomCode || "").includes(String(building)));
  if (hall) schedules = schedules.filter(s => String(s.AdRoomHall || "").includes(String(hall)));
  if (courseId) schedules = schedules.filter(s => s.AdCourseId === parseInt(courseId as string));
  if (startTime && endTime) schedules = schedules.filter(s => s.fstarttime < String(endTime) && s.fendtime > String(startTime));
  const exportDays = [
    req.query.sun === "true" && "fsunday", req.query.mon === "true" && "fmonday",
    req.query.tue === "true" && "ftuesday", req.query.wed === "true" && "fwednesday",
    req.query.thr === "true" && "fthursday",
  ].filter(Boolean) as Array<"fsunday"|"fmonday"|"ftuesday"|"fwednesday"|"fthursday">;
  if (exportDays.length) schedules = schedules.filter(s => exportDays.some(day => Boolean(s[day])));

  // Load reference data once. The legacy implementation performed four database
  // lookups per schedule row (N+1), which became very expensive with a decade of data.
  const [colleges, sections, instructors, courses] = await Promise.all([
    Repository.getColleges(),
    Repository.getSections(),
    Repository.getInstructors(),
    Repository.getCourses(),
  ]);
  const collegeById = new Map(colleges.map(x => [x.AdCollegeId, x]));
  const sectionById = new Map(sections.map(x => [x.AdSectionId, x]));
  /* الرقم المدني لا يصل صفات الاطّلاع (N13) — ولا في الملفّ. */
  const instructorById = new Map(instructorsForReader(req, instructors).map(x => [x.AdInstructorId, x]));
  const courseById = new Map(courses.map(x => [x.AdCourseId, x]));
  /* رقم المقرر في الملف سبع خانات كما تطبعه الهيئة: الكلية ثم القسم ثم المقرر (authorityCourseCode). */
  const courseNumberOf = (s: any) => {
    const course = courseById.get(s.AdCourseId);
    const owner = sectionById.get(Number(course?.AdSectionId || s.AdSectionId));
    return authorityCourseCode(course?.CourseCode, authorityDepartmentCode(collegeById.get(Number(owner?.AdCollegeId))?.AdCollegeCode, owner?.AdSectionCode));
  };

  // These two read through a relation, so they wait for the maps above.
  if (courseCode) schedules = schedules.filter(s => (courseById.get(s.AdCourseId)?.CourseCode || "") === String(courseCode).trim() || courseNumberOf(s) === String(courseCode).trim());
  if (civil) schedules = schedules.filter(s => String(instructorById.get(s.AdInstructorId)?.AdInstructorCivil || "").includes(String(civil).trim()));

  schedules.sort((a, b) =>
    courseNameCollator.compare(
      String(courseById.get(a.AdCourseId)?.CourseName || a.AdCourseName || ""),
      String(courseById.get(b.AdCourseId)?.CourseName || b.AdCourseName || ""),
    ) || String(a.SCode || "").localeCompare(String(b.SCode || ""), "ar", { numeric: true }) || String(a.fstarttime || "").localeCompare(String(b.fstarttime || ""))
  );

  /* «· منتدب» بجانب اسم المنتدب: القرار بقسم الصفّ نفسه، ودفتر كل (كلية، قسم) متميّز يُقرأ مرةً. */
  const isVisitingRow = await visitingChecker(resolvedTermId, schedules.map(s => ({ collegeId: s.AdCollegeId, sectionId: s.AdSectionId })));
  const reportData = schedules.map(s => {
    const coll = collegeById.get(s.AdCollegeId);
    const sec = sectionById.get(s.AdSectionId);
    const inst = instructorById.get(s.AdInstructorId);
    const course = courseById.get(s.AdCourseId);

    const days = [
      s.fsunday ? "الأحد" : "",
      s.fmonday ? "الاثنين" : "",
      s.ftuesday ? "الثلاثاء" : "",
      s.fwednesday ? "الأربعاء" : "",
      s.fthursday ? "الخميس" : ""
    ].filter(Boolean).join(" - ");

    return {
      "الكلية": coll?.AdCollegeName || "",
      "القسم العلمي": sec?.AdSectionName || "",
      "رمز المقرر": courseNumberOf(s),
      "المقرر الدراسي": s.AdCourseName || course?.CourseName || "",
      "الشعبة": s.SCode || "",
      "الوحدات": course?.CourseCredit || 0,
      "الساعات": course?.CourseHours || 0,
      "أستاذ المقرر": inst?.AdInstructorName ? withVisitingSuffix(inst.AdInstructorName, isVisitingRow(s.AdInstructorId, s.AdCollegeId, s.AdSectionId)) : "",
      "الرقم المدني": inst?.AdInstructorCivil || "",
      "الوقت": formatScheduleTimeRange(s.fstarttime, s.fendtime),
      "الأيام": days,
      "المبنى": s.AdRoomCode || "",
      "القاعة": s.AdRoomHall || ""
    };
  });

  const ws = XLSX.utils.json_to_sheet(reportData);
  ws["!cols"] = [
    {wch:22},{wch:24},{wch:14},{wch:30},{wch:10},{wch:9},{wch:9},{wch:24},{wch:16},{wch:18},{wch:24},{wch:12},{wch:12}
  ];
  ws["!autofilter"] = { ref: ws["!ref"] || "A1:M1" };
  const wb = XLSX.utils.book_new();
  (wb as any).Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, "الجدول الدراسي");

  // Generate buffer
  const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename=schedule_report_${reportType}.xlsx`);
  res.send(excelBuffer);
});

app.get("/api/reports/department-balance", requirePermission(14), async (req: AuthenticatedRequest, res: Response) => {
  let termId = Number(req.query.termId || 0);
  const terms = await Repository.getTerms();
  if (!termId) termId = Number(sortTermsNewestServer(terms)[0]?.AdTermId || 0);
  const [termRows, sections, colleges, instructors, courses] = await Promise.all([
    Repository.getSchedulesByScope({ termId }),
    Repository.getSections(), Repository.getColleges(), Repository.getInstructors(), Repository.getCourses(),
  ]);
  const collegeById = new Map(colleges.map(item => [item.AdCollegeId, item]));
  const bySection = new Map<number, FSchedule[]>();
  for (const row of termRows) {
    /* النطاق يُطبَّق على التجميع لا على النتيجة: قسمٌ خارج نطاق القارئ لا
       يدخل الحساب أصلاً، فلا تتسرّب أعدادُه إلى مجاميع الأسفل. */
    if (!isScopeAllowed(req, Number(row.AdCollegeId), Number(row.AdSectionId))) continue;
    const list = bySection.get(Number(row.AdSectionId));
    if (list) list.push(row); else bySection.set(Number(row.AdSectionId), [row]);
  }
  /* العميدان يريان النهائيَّ وحده (readsFinalSchedulesOnly) — في الميزان كما في كل
     قراءة: قسمٌ لم يُعتمد لا تُحسب مواعيدُ مسوّدته ولا «أثقلُ أستاذٍ» فيها. */
  if (readsFinalSchedulesOnly(req)) {
    for (const [sectionId, rows] of [...bySection]) {
      const final = await finalRowsOnly(rows, termId);
      if (final.length) bySection.set(sectionId, final); else bySection.delete(sectionId);
    }
  }
  const MORNING_END = 14 * 60;
  /* The dean's «مانع اعتماد» is the registrar's: one rule, one set of options. */
  const balanceBlockerOptions = await approvalBlockerOptions();
  const departments = [...bySection.entries()].map(([sectionId, rows]) => {
    const section = sections.find(item => item.AdSectionId === sectionId);
    const fairness = buildFairnessEngine(rows, instructors);
    const analysis = analyzeSchedule(rows, termRows, courses, instructors, balanceBlockerOptions);
    let morning = 0, evening = 0;
    for (const row of rows) {
      const meetings = Math.max(1, activeDays(row).length);
      (timeToMinutes(row.fstarttime) < MORNING_END ? (morning += meetings) : (evening += meetings));
    }
    const meetings = Math.max(1, morning + evening);
    /* Every hall the department actually teaches in — a legacy spelling is
       folded onto its registered hall first, blanks and «---» are not halls —
       beside the subset already verified in the registry. Counting only the
       verified ones printed «0 قاعات» for a department teaching in twelve. */
    const verifiedRooms = new Set(rows.map(row => verifiedRoomKey(row)).filter(Boolean));
    const rooms = new Set(rows.map(row => {
      const canonical: any = balanceBlockerOptions.normalizeRow ? balanceBlockerOptions.normalizeRow(row) : row;
      if (!canonical.roomId && (isInvalidLocationToken(canonical.AdRoomHall) || isInvalidLocationToken(canonical.AdRoomCode))) return "";
      return roomIdentityKey(canonical);
    }).filter(Boolean));
    return {
      sectionId,
      sectionName: section?.AdSectionName || `قسم ${sectionId}`,
      collegeName: collegeById.get(Number(section?.AdCollegeId || 0))?.AdCollegeName || "",
      rows: rows.length,
      instructors: new Set(rows.map(row => row.AdInstructorId).filter(Boolean)).size,
      rooms: rooms.size,
      verifiedRooms: verifiedRooms.size,
      morningPct: Math.round((morning / meetings) * 100),
      eveningPct: Math.round((evening / meetings) * 100),
      fairness: fairness.score,
      heaviest: fairness.profiles[0]?.name || "",
      quality: analysis.score,
      conflicts: analysis.metrics.criticalConflicts,
      lateRows: analysis.metrics.lateRows,
    };
  }).sort((a, b) => b.rows - a.rows);
  res.json({
    termId,
    termName: terms.find(term => term.AdTermId === termId)?.AdTermName || "",
    departments,
    totals: {
      departments: departments.length,
      rows: departments.reduce((sum, item) => sum + item.rows, 0),
      conflicts: departments.reduce((sum, item) => sum + item.conflicts, 0),
      /* What «all» means for THIS reader: a dean reads a college, the
         registrar and the administration read the university, anyone else
         reads the departments of their scope. The screen printed
         «على مستوى الجامعة» to a dean who can see one college. */
      scopeLabel: balanceScopeLabel(req),
    },
  });
});

app.get("/api/reports/room-load", requireAnyPermission([7, 8, 9, 10, 14, 16, 17]), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0);
  const sectionId = Number(req.query.sectionId || 0);
  let termId = Number(req.query.termId || 0);
  // القاعات الظاهرة للمستخدم العادي تظل داخل قسمه. نحتاج جدول الفصل
  // الكامل فقط لمعرفة أن قاعته محجوزة من جهة أخرى، لا لعرض قاعات الآخرين.
  /* مستوى الكلية (N10): من يغطّي الكلية كلها (العميد والعميد المساعد) يرى
     قاعاتها بلا اختيار قسم — كان يُردّ بـ403 لأن القسم صفر. */
  const collegeWide = !sectionId && Boolean(collegeId) && (await wholeCollegeSectionIds(req, collegeId)).length > 0;
  if (!req.user.IsAdminUser && (!collegeId || (!collegeWide && (!sectionId || !isScopeAllowed(req, collegeId, sectionId))))) {
    res.status(403).json({ error: "خارج نطاق القسم المسموح لك" });
    return;
  }
  if (!termId) { const terms = await Repository.getTerms(); termId = Number(sortTermsNewestServer(terms)[0]?.AdTermId || 0); }

  const scoped = await scopedScheduleUniverse(collegeId, sectionId, termId);
  const universe = scoped.universe;
  /* «قاعاتي» للعميدين من الجداول النهائية وحدها، كسائر ما يقرآن. */
  const rows = readsFinalSchedulesOnly(req) ? await finalRowsOnly(scoped.rows, termId) : scoped.rows;
  const toMinutes = (value: string) => { const [h, m] = String(value || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  // Room utilization is intentionally official-only. Pending and historical
  // unresolved locations are separate data-quality signals and must never
  // inflate the number or occupancy of real rooms.
  const roomKey = (row: FSchedule) => verifiedRoomKey(row);
  const mineKeys = new Set(rows.map(roomKey).filter(Boolean));

  const rooms = new Map<string, { room: string; hall: string; roomId: string; buildingId?: string; mine: boolean; busy: Array<{ day: number; from: number; to: number; mine: boolean }> }>();
  const mineIds = new Set(rows.map(row => row.id));
  universe.forEach(row => {
    const key = roomKey(row);
    if (!key || !mineKeys.has(key)) return;
    const entry = rooms.get(key) || { room: String(row.AdRoomCode||"").trim(), hall: String(row.AdRoomHall||"").trim(), roomId: String(row.roomId||""), buildingId: row.buildingId, mine: mineKeys.has(key), busy: [] };
    const from = toMinutes(row.fstarttime), to = toMinutes(row.fendtime);
    if (to > from) {
      DAY_FLAGS.forEach((flag, day) => {
        if ((row as any)[flag]) entry.busy.push({ day, from, to, mine: mineIds.has(row.id) });
      });
    }
    rooms.set(key, entry);
  });

  res.json({
    termId,
    dayStart: SCHEDULE_DAY_START,
    dayEnd: SCHEDULE_DAY_END,
    /* Building first, hall second, each by its NUMBER: «7/31» before «8/22»,
       and «9» before «10» — a plain locale compare read them as words and put
       ten before nine. */
    rooms: [...rooms.values()].sort((a, b) => byRoom(a.room, a.hall, b.room, b.hall))
  });
});
}
