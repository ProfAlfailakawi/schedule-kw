/**
 * ── إنشاءُ صفوف الجدول وتعديلُها وحذفُها وتطبيقُ المقترحات ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { RequestReservationConflict, RequestHoldConflict } from "../../utils/instructorRequestReservations";
import { Response } from "express";
import { Repository, ScheduleRevisionConflict } from "../../db/repository";
import { SCHEDULE_DAYS } from "../../utils/scheduleIntelligence";
import type { AdCourse, FSchedule } from "../../types";
import { isSwapEdit } from "../../utils/approvalWorkflow";
import { roleLabel } from "../../utils/academicRoles";
import { formatScheduleTimeRange, normalizeClock } from "../../utils/scheduleTime";
import { PENDING_ROOM } from "../../utils/locationRegistry";
import { noteScheduleMutation, scheduleLockRefusal } from "./approvals";
import type { AuthenticatedRequest } from "./auth";
import { canonicalizeLocationForWrite, readLocationRegistry } from "./locations";
import { applyRequestHoldOverride, noteRequestHoldOverride, requestHoldRefusal, scheduleConflicts } from "./scheduleConflicts";
import { describeScheduleChange, SCHEDULE_DAY_KEYS, scheduleLengthIssue, schedulePayloadIssues, unapprovedPatternIssue } from "./scheduleRules";
import { isScopeAllowed, legacyFDetail } from "./scope";
import { captureScopeVersion, recordVersionAfter } from "./versions";

/* ── مصدرُ التغيير: من أين جاء هذا الموعد؟ ─────────────────────────────────────
 * يُكتب فقط حين يمرّ الحفظ من «اعتماد الاقتراح» (الرادار، حالة طالب، رغبة أستاذ). الحفظُ اليدويّ
 * لا يحمل مصدراً ولا يتغيّر. والقيم مقيّدة: نوعٌ من قائمةٍ مغلقة، ونصوصٌ قصيرة. */
const SCHEDULE_ORIGIN_KINDS = new Set(["radar", "student-case", "instructor-request", "intelligence", "planning"]);
function scheduleOriginOf(req: AuthenticatedRequest): import("../../types").ScheduleOrigin | undefined {
  const raw = (req.body as any)?.origin;
  if (!raw || !SCHEDULE_ORIGIN_KINDS.has(String(raw.kind))) return undefined;
  const text = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max) || undefined;
  return {
    kind: raw.kind,
    refId: text(raw.refId, 64),
    note: text(raw.note, 160),
    by: String(req.user?.Name || req.user?.SystemUserLogin || roleLabel(req.user?.Role) || "").slice(0, 80),
    at: new Date().toISOString(),
  };
}


/** The course owns the requirement; the appointment holds the physical facility. */
export async function companionBookingFor(course:AdCourse,body:any,canonical:any,existing?:FSchedule):Promise<{issue?:string;id:string;label:string}>{
  const required=String(course.CourseCompanionRoomType||"").trim();
  const requested=String(body?.companionRoomId||"").trim();
  const registry=await readLocationRegistry();
  const primary=registry.rooms.find(room=>room.id===canonical.roomId);
  const previousPrimary=existing&&String(existing.roomId||"")===String(canonical.roomId||"");
  if(primary?.bookingPolicy&&primary.bookingPolicy!=="normal"&&!previousPrimary)return {issue:"هذه القاعة لا تقبل الحجز المستقل. اختر قاعة تدريسية أخرى.",id:"",label:""};
  if(!required)return requested?{issue:"هذا المقرر لا يحتاج مرفقًا مرافقًا؛ أزل اختياره.",id:"",label:""}:{id:"",label:""};
  if(!requested)return {issue:`المقرر يتطلب مرفقًا مرافقًا من نوع «${required}» طوال الموعد.`,id:"",label:""};
  const room=registry.rooms.find(item=>item.id===requested);
  const primaryBuilding=registry.buildings.find(item=>item.id===canonical.buildingId);
  const building=room&&registry.buildings.find(item=>item.id===room.buildingId);
  if(!room||!building||!primaryBuilding||!room.active||room.confidence!=="CONFIRMED"||!building.active||building.confidence!=="CONFIRMED")return {issue:"المرفق المرافق غير متاح أو غير معتمد.",id:"",label:""};
  if(room.id===canonical.roomId||room.bookingPolicy!=="companion_only"||String(room.roomType||"").trim()!==required)return {issue:"المرفق المختار غير مخصص لمرافقة هذا المقرر.",id:"",label:""};
  if(String(building.officialCode||"").slice(0,4)!==String(primaryBuilding.officialCode||"").slice(0,4))return {issue:"الاستوديو والقاعة الأساسية يجب أن يكونا في الموقع الدراسي نفسه.",id:"",label:""};
  return {id:room.id,label:`${building.officialCode} / ${room.canonicalCode}`};
}

export const createScheduleHandler = async (req: AuthenticatedRequest, res: Response) => {
  const {
    AdCollegeId,
    AdSectionId,
    AdTermId,
    AdCourseId,
    SCode,
    AdInstructorId,
    fsunday,
    fmonday,
    ftuesday,
    fwednesday,
    fthursday,
    fstarttime,
    fendtime,
    AdRoomCode,
    AdRoomHall
  } = req.body;

  if (!AdCollegeId || !AdSectionId || !AdTermId || !AdCourseId || !SCode || !AdInstructorId || !fstarttime || !fendtime || !req.body?.buildingId || (!req.body?.roomId && req.body?.locationStatus !== PENDING_ROOM)) {
    res.status(400).json({ error: "الرجاء إدخال الحقول المطلوبة بالأحمر" });
    return;
  }
  if (!/^\d+$/.test(String(SCode))) {
    res.status(400).json({ error: "الرجاء كتابة الأرقام بالانجليزي" });
    return;
  }
  const payloadIssues=await schedulePayloadIssues(req.body);
  if(payloadIssues.length){res.status(400).json({error:payloadIssues[0],issues:payloadIssues.map(message=>({type:"validation",severity:"high",message}))});return;}
  {const lengthIssue=await scheduleLengthIssue(req.body,(req as any).__hypotheticalWeek);
  if(lengthIssue){res.status(400).json({error:lengthIssue,issues:[{type:"validation",severity:"high",message:lengthIssue}]});return;}
  /* النمطُ لازم يكون معتمداً لكل من يُنشئ موعداً (المالك 2026-10-30). */
  const patternIssue=(req as any).__exactRestore?null:await unapprovedPatternIssue(req.body,(req as any).__hypotheticalWeek);
  if(patternIssue){res.status(400).json({error:patternIssue,issues:[{type:"validation",severity:"high",message:patternIssue}]});return;}}

  const collegeId = parseInt(AdCollegeId), sectionId = parseInt(AdSectionId), termId = parseInt(AdTermId), courseId = parseInt(AdCourseId), instructorId = parseInt(AdInstructorId);
  if (!isScopeAllowed(req, collegeId, sectionId) && !req.user.IsAdminUser) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }

  const [section, course, term, instructor] = await Promise.all([
    Repository.getSectionById(sectionId), Repository.getCourseById(courseId), Repository.getTermById(termId), Repository.getInstructorById(instructorId)
  ]);
  if (!section || section.AdCollegeId !== collegeId) { res.status(400).json({ error: "القسم العلمي المختار لا يتبع الكلية المختارة" }); return; }
  if (!course || course.AdCollegeId !== collegeId || course.AdSectionId !== sectionId) { res.status(400).json({ error: "المقرر المختار غير صالح" }); return; }
  const operationalCourseIds=await Repository.getOperationalCourseIds(sectionId);
  if(!operationalCourseIds.has(courseId)){res.status(409).json({error:"هذا المقرر مؤرشف أكاديمياً ولا يمكن إضافته إلى جدول جديد. يظهر فقط في السجل التاريخي."});return;}
  const [curriculumPlans,curriculumMemberships]=await Promise.all([Repository.getCurriculumPlans(sectionId),Repository.getCurriculumPlanCourses(sectionId)]);
  const memberPlanIds=new Set(curriculumMemberships.filter(row=>Number(row.AdCourseId)===courseId).map(row=>row.planId));
  const schedulePlan=curriculumPlans.find(row=>row.status==="active"&&memberPlanIds.has(row.id))||curriculumPlans.find(row=>row.status==="transition"&&memberPlanIds.has(row.id));
  if (!term) { res.status(400).json({ error: "الفصل الدراسي المختار غير صالح" }); return; }
  if (!instructor) { res.status(400).json({ error: "أستاذ المقرر المختار غير صالح" }); return; }
  const locationResult=await canonicalizeLocationForWrite({...req.body,AdCollegeId:collegeId,AdSectionId:sectionId},collegeId,sectionId);
  if(!locationResult.check.ok){res.status(400).json({error:locationResult.check.issues[0]?.message||"المكان غير صالح",issues:locationResult.check.issues});return;}
  const canonicalBody={...req.body,...locationResult.check.canonical,AdCollegeId:collegeId,AdSectionId:sectionId,AdTermId:termId,AdCourseId:courseId,AdInstructorId:instructorId};
  const companion=await companionBookingFor(course,req.body,canonicalBody);
  if(companion.issue){res.status(400).json({error:companion.issue});return;}
  canonicalBody.companionRoomId=companion.id;
  canonicalBody.companionRoomLabel=companion.label;
  const createOverrides=await applyRequestHoldOverride(req);
  const conflicts=await scheduleConflicts(req,canonicalBody,0,(req as any).__hypotheticalWeek);
  // Soft warnings (e.g. a tight inter-campus transfer, Note 38) are surfaced by
  // the live check but never block the save.
  const blockingSave=conflicts.filter((c:any)=>!c.soft);
  if(blockingSave.length&&blockingSave.every((c:any)=>c.holdRequestId)){res.status(409).json({...await requestHoldRefusal([...new Set(blockingSave.map((c:any)=>String(c.holdRequestId)))]),issues:blockingSave});return;}
  if(blockingSave.length){res.status(409).json({error:blockingSave[0].message||"يوجد تعارض يمنع الحفظ",issues:blockingSave});return;}

  /* القفل يُقرأ بعد أن يثبت أن الطلب صحيحٌ في ذاته: ردُّ «الجدول عند التسجيل»
     على طلبٍ ناقص الحقول يخفي الخطأ الحقيقي خلف خطأٍ إجرائي. */
  const addLock = await scheduleLockRefusal(req,collegeId, sectionId, termId);
  if (addLock) { res.status(409).json({ error: addLock, code: "schedule-locked" }); return; }
  /* فحصٌ جافّ كما في التعديل: كلُّ التحقّق مرّ ولا كتابة (للتثبيت الذرّي لبنود الأساتذة). */



  const writeRow = {
    AdCollegeId: collegeId,
    AdSectionId: sectionId,
    AdTermId: termId,
    AdCourseId: courseId,
    AdCourseName: course.CourseName,
    CourseCodeSnapshot: String(course.CourseCode || ""),
    CourseNameSnapshot: String(course.CourseName || ""),
    CurriculumPlanIdSnapshot: schedulePlan?.id,
    SCode,
    AdInstructorId: instructorId,
    fsunday: !!fsunday,
    fmonday: !!fmonday,
    ftuesday: !!ftuesday,
    fwednesday: !!fwednesday,
    fthursday: !!fthursday,
    /* The typed form sends "HH:MM"; an API caller need not. One stored shape,
       here too, so no reader downstream has to guess. */
    fstarttime: normalizeClock(fstarttime),
    fendtime: normalizeClock(fendtime),
    AdRoomCode: String(canonicalBody.AdRoomCode || ""),
    AdRoomHall: String(canonicalBody.AdRoomHall || ""),
    buildingId: canonicalBody.buildingId,
    roomId: canonicalBody.roomId,
    ...(companion.id?{companionRoomId:companion.id,companionRoomLabel:companion.label}:{}),
    locationStatus: canonicalBody.locationStatus,
    sourceBuildingText: req.body?.sourceBuildingText,
    sourceRoomText: req.body?.sourceRoomText,
    /* Explicit post-PDF provenance: manual rows live permanently in the green
       range. Later edits preserve this value, so they can never become yellow
       merely because course/section happens to match an old PDF row. */
    sourceOrder: Math.max(1_000_000, Date.now()),
    fdetail: legacyFDetail({ fsunday, fmonday, ftuesday, fwednesday, fthursday }),
    ...(scheduleOriginOf(req) ? { origin: scheduleOriginOf(req) } : {}),
  };
  if ((req as any).__dryRun) { res.json({ ok: true, dryRun: true, row: writeRow, warnings: conflicts.filter((c:any)=>c.soft) }); return; }
  const addVersion = await captureScopeVersion(req, collegeId, sectionId, termId, "قبل إضافة موعد دراسي", "manual");
  let newSched: FSchedule;
  try { newSched = await Repository.createSchedule(writeRow, (req as any).__requestReservationOwner || ""); }
  catch (error) {
    if (error instanceof RequestHoldConflict) { res.status(409).json(await requestHoldRefusal([error.holdRequestId])); return; }
    throw error;
  }
  if (createOverrides.length) await noteRequestHoldOverride(createOverrides, newSched, String(req.user?.Name || "القسم"));

  await recordVersionAfter(addVersion, before => [...before, newSched]);
  await noteScheduleMutation(req, collegeId, sectionId, termId, { kind: "add", row: newSched });

  res.locals.auditRowIds = [Number(newSched.id)];
  res.status(201).json(newSched);
};

export const updateScheduleHandler = async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const {
    AdCollegeId,
    AdSectionId,
    AdTermId,
    AdCourseId,
    SCode,
    AdInstructorId,
    fsunday,
    fmonday,
    ftuesday,
    fwednesday,
    fthursday,
    fstarttime,
    fendtime,
    AdRoomCode,
    AdRoomHall
  } = req.body;

  /* ── ويُقال «انتهى الفصل» قبل «أكمل الحقول» ─────────────────────────────
   *
   * يُقرأ الصفُّ القائم ويُسأل عن قفله أوّلَ شيء، قبل التحقّق من الحقول
   * والتعارضات. لأن من يعدّل موعداً في فصلٍ مجمَّدٍ كان يُردّ أولاً برسالةٍ
   * عن حقلٍ ناقصٍ أو تعارضٍ في قاعة، فيُصلح ما ليس بعطل، ثم يُردّ ثانيةً
   * بالسبب الحقيقيّ. والرسالةُ الأولى ليست خطأً في ذاتها، لكنها تُرسل القارئَ
   * في طريقٍ لا يُوصل.
   *
   * وقفلُ النطاق المنقول إليه يبقى في موضعه بعدُ، لأنه لا يُعرف قبل أن
   * تُقرأ حقولُ الوجهة. */
  const existing = await Repository.getScheduleById(id);
  if (!existing) { res.status(404).json({ error: "الجدول غير موجود" }); return; }
  const frozenSource = await scheduleLockRefusal(req, existing.AdCollegeId, existing.AdSectionId, existing.AdTermId);
  if (frozenSource) { res.status(409).json({ error: frozenSource, code: "schedule-locked" }); return; }

  if (!AdCollegeId || !AdSectionId || !AdTermId || !AdCourseId || !SCode || !AdInstructorId || !fstarttime || !fendtime || !req.body?.buildingId || (!req.body?.roomId && req.body?.locationStatus !== PENDING_ROOM)) {
    res.status(400).json({ error: "الرجاء إدخال الحقول المطلوبة بالأحمر" });
    return;
  }
  if (!/^\d+$/.test(String(SCode))) {
    res.status(400).json({ error: "الرجاء كتابة الأرقام بالانجليزي" });
    return;
  }
  const payloadIssues=await schedulePayloadIssues(req.body);
  if(payloadIssues.length){res.status(400).json({error:payloadIssues[0],issues:payloadIssues.map(message=>({type:"validation",severity:"high",message}))});return;}
  {const unchangedShape=existing&&existing.fstarttime===req.body.fstarttime&&existing.fendtime===req.body.fendtime&&SCHEDULE_DAY_KEYS.every(k=>Boolean((existing as any)[k])===Boolean(req.body?.[k]));
  const lengthIssue=unchangedShape?null:await scheduleLengthIssue({...req.body,id},(req as any).__hypotheticalWeek);
  if(lengthIssue){res.status(400).json({error:lengthIssue,issues:[{type:"validation",severity:"high",message:lengthIssue}]});return;}
  /* موعدٌ محفوظ لم يتغيّر شكله (الأيام والوقت) يبقى كما هو؛ ومن غيّر أيامه أو وقته فبنمطٍ معتمد. */
  const patternIssue=unchangedShape||(req as any).__exactRestore?null:await unapprovedPatternIssue({...req.body,id},(req as any).__hypotheticalWeek);
  if(patternIssue){res.status(400).json({error:patternIssue,issues:[{type:"validation",severity:"high",message:patternIssue}]});return;}}

  const collegeId = parseInt(AdCollegeId), sectionId = parseInt(AdSectionId), termId = parseInt(AdTermId), courseId = parseInt(AdCourseId), instructorId = parseInt(AdInstructorId);
  if (existing.sourceOrder !== undefined && Number(existing.sourceOrder) < 1_000_000 && Number(existing.AdCourseId) !== courseId) {
    res.status(409).json({
      error: "أنت تحاول تبديل اسم مقرر وارد في الجدول المعتمد، وهذا مخالف للائحة نظام الجدول. يمكنك حذف المقرر كاملاً ثم إضافة مقرر جديد، لكن لا يمكن تغيير اسمه.",
      code: "COURSE_NAME_LOCKED",
    });
    return;
  }
  if (!req.user.IsAdminUser && (!isScopeAllowed(req, existing.AdCollegeId, existing.AdSectionId) || !isScopeAllowed(req, collegeId, sectionId))) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  const [section, course, term, instructor] = await Promise.all([
    Repository.getSectionById(sectionId), Repository.getCourseById(courseId), Repository.getTermById(termId), Repository.getInstructorById(instructorId)
  ]);
  if (!section || section.AdCollegeId !== collegeId) { res.status(400).json({ error: "القسم العلمي المختار لا يتبع الكلية المختارة" }); return; }
  if (!course || course.AdCollegeId !== collegeId || course.AdSectionId !== sectionId) { res.status(400).json({ error: "المقرر المختار غير صالح" }); return; }
  const operationalIdsForEdit=await Repository.getOperationalCourseIds(sectionId);
  if(Number(existing.AdCourseId)!==courseId&&!operationalIdsForEdit.has(courseId)){res.status(409).json({error:"المقرر البديل مؤرشف أكاديمياً ولا يمكن إسناده إلى موعد حالي."});return;}
  const [editPlans,editMemberships]=await Promise.all([Repository.getCurriculumPlans(sectionId),Repository.getCurriculumPlanCourses(sectionId)]);
  const editMemberPlanIds=new Set(editMemberships.filter(row=>Number(row.AdCourseId)===courseId).map(row=>row.planId));
  const editPlan=editPlans.find(row=>row.status==="active"&&editMemberPlanIds.has(row.id))||editPlans.find(row=>row.status==="transition"&&editMemberPlanIds.has(row.id));
  if (!term) { res.status(400).json({ error: "الفصل الدراسي المختار غير صالح" }); return; }
  if (!instructor) { res.status(400).json({ error: "أستاذ المقرر المختار غير صالح" }); return; }
  const importedRoomId=(existing as any)?.importEvidence&&(existing as any)?.roomId?String((existing as any).roomId):"";
  const locationResult=await canonicalizeLocationForWrite({...req.body,AdCollegeId:collegeId,AdSectionId:sectionId},collegeId,sectionId,importedRoomId);
  if(!locationResult.check.ok){res.status(400).json({error:locationResult.check.issues[0]?.message||"المكان غير صالح",issues:locationResult.check.issues});return;}
  const canonicalBody={...req.body,...locationResult.check.canonical,AdCollegeId:collegeId,AdSectionId:sectionId,AdTermId:termId,AdCourseId:courseId,AdInstructorId:instructorId};
  const companion=await companionBookingFor(course,req.body,canonicalBody,existing);
  if(companion.issue){res.status(400).json({error:companion.issue});return;}
  canonicalBody.companionRoomId=companion.id;
  canonicalBody.companionRoomLabel=companion.label;
  const overriddenHolds=await applyRequestHoldOverride(req);
  const conflicts=await scheduleConflicts(req,canonicalBody,id,(req as any).__hypotheticalWeek);
  const blockingEdit=conflicts.filter((c:any)=>!c.soft);
  if(blockingEdit.length&&blockingEdit.every((c:any)=>c.holdRequestId)){res.status(409).json({...await requestHoldRefusal([...new Set(blockingEdit.map((c:any)=>String(c.holdRequestId)))]),issues:blockingEdit});return;}
  if(blockingEdit.length){res.status(409).json({error:blockingEdit[0].message||"يوجد تعارض يمنع التعديل",issues:blockingEdit});return;}

  /* النطاقان معاً: نقلُ موعدٍ من قسمٍ مُرسَلٍ إلى آخر يمسّ الجدولين، فيكفي
     قفلُ أحدهما للمنع. */
  /* والنطاقُ المنقول إليه: نقلُ موعدٍ إلى جدولٍ مُرسَلٍ أو فصلٍ منتهٍ يمسّه
     كما يمسّ مصدرَه، فيكفي قفلُ أحدهما للمنع. ومصدرُه سُئل أعلاه قبل كل شيء. */
  const editLock = await scheduleLockRefusal(req,collegeId, sectionId, termId);
  if (editLock) { res.status(409).json({ error: editLock, code: "schedule-locked" }); return; }

  /* فحصٌ جافّ: كلُّ التحقّق (نطاق، قفل، تعارض) مرّ ولا كتابة. يستعمله «اعتماد الاقتراح» قبل أي خطوة. */
  const writeFields = {
      AdCollegeId: collegeId,
      AdSectionId: sectionId,
      AdTermId: termId,
      AdCourseId: courseId,
      AdCourseName: course.CourseName,
      CourseCodeSnapshot: String(course.CourseCode || ""),
      CourseNameSnapshot: String(course.CourseName || ""),
      CurriculumPlanIdSnapshot: editPlan?.id,
      SCode,
      AdInstructorId: instructorId,
      fsunday: !!fsunday,
      fmonday: !!fmonday,
      ftuesday: !!ftuesday,
      fwednesday: !!fwednesday,
      fthursday: !!fthursday,
      fstarttime: normalizeClock(fstarttime),
      fendtime: normalizeClock(fendtime),
      AdRoomCode: String(canonicalBody.AdRoomCode || ""),
      AdRoomHall: String(canonicalBody.AdRoomHall || ""),
      buildingId: canonicalBody.buildingId,
      roomId: canonicalBody.roomId,
      companionRoomId: companion.id,
      companionRoomLabel: companion.label,
      locationStatus: canonicalBody.locationStatus,
      sourceBuildingText: req.body?.sourceBuildingText,
      sourceRoomText: req.body?.sourceRoomText,
      fdetail: legacyFDetail({ fsunday, fmonday, ftuesday, fwednesday, fthursday }),
      ...((req as any).__restoreOrigin ? { origin: (req as any).__restoreOrigin.value } : scheduleOriginOf(req) ? { origin: scheduleOriginOf(req) } : existing.origin ? { origin: existing.origin } : {}),
    };
  if ((req as any).__dryRun) { res.json({ ok: true, dryRun: true, row: writeFields, warnings: conflicts.filter((c:any)=>c.soft) }); return; }
  try {
    const editVersion = await captureScopeVersion(req, existing.AdCollegeId, existing.AdSectionId, existing.AdTermId, "قبل تعديل موعد دراسي", "manual");
    const arrivalVersion = existing.AdCollegeId !== collegeId || existing.AdSectionId !== sectionId || existing.AdTermId !== termId
      ? await captureScopeVersion(req, collegeId, sectionId, termId, "قبل نقل موعد إلى هذا الجدول", "manual")
      : undefined;
    const updated = await Repository.updateSchedule(id, writeFields,
      req.body?.rev == null ? undefined : Number(req.body.rev), (req as any).__requestReservationOwner || "");
    if (overriddenHolds.length) await noteRequestHoldOverride(overriddenHolds, updated, String(req.user?.Name || "القسم"));
    /* يظلّ تعديلُ الموعد من الجدول مرتبطاً برغبة الأستاذ الأصلية، فيظهر في
       سجلّها للقسم وللأستاذ بدلاً من أن يختفي أثر التعديل خارج الوارد. */
    if (existing.origin?.kind === "instructor-request" && existing.origin.refId) {
      const linked = await Repository.getInstructorRequest(existing.origin.refId);
      const change = describeScheduleChange(existing, updated);
      if (linked && change) {
        const at = new Date().toISOString();
        await Repository.saveInstructorRequest({
          ...linked,
          timeline: [...(linked.timeline || []), { kind: "schedule-edited" as const, at, by: req.user.Name || "القسم", detail: change }].slice(-300),
        });
      }
    }
    // Hand the audit trail the sentence describing what actually moved.
    res.locals.auditChanges = describeScheduleChange(existing, updated) || undefined;
    const movedScope = existing.AdCollegeId !== collegeId || existing.AdSectionId !== sectionId || existing.AdTermId !== termId;
    await recordVersionAfter(editVersion, before => movedScope
      ? before.filter(row => Number(row.id) !== Number(id))
      : before.map(row => Number(row.id) === Number(id) ? updated : row));
    await recordVersionAfter(arrivalVersion, before => [...before.filter(row => Number(row.id) !== Number(id)), updated]);
    /* ── الموعد المنتقل إضافةٌ عند وجهته، لا تعديلاً ──────────────────────
     * كان يُبلَّغ القسمُ المستقبِل بـ«تعديل»، فلا يُسجَّل في انتظار الإقرار.
     * لكنّ شعبةً ظهرت في جدوله بعد توقيع رئيسه هي بالضبط ما وُجدت قائمةُ
     * الانتظار من أجله: التزامٌ لم يره حين وقّع. والقسمُ الذي غادرته يتغيّر
     * أيضاً، ولو بالنقصان. */
    /* وتبديلُ المقرر أو رقم الشعبة في مكانه إضافةٌ كذلك (R13): التزامٌ آخر
       حلّ محلّ الذي وقّع عليه رئيس القسم، لا خانةٌ تبدّلت في صفٍّ رآه. */
    await noteScheduleMutation(req, collegeId, sectionId, termId,
      movedScope || isSwapEdit(existing, updated) ? { kind: "add", row: updated } : { kind: "edit", row: updated });
    if (movedScope) {
      await noteScheduleMutation(req, existing.AdCollegeId, existing.AdSectionId, existing.AdTermId, { kind: "delete", row: existing });
    }
    res.json(updated);
  } catch (e: any) {
    if (e instanceof RequestHoldConflict) { res.status(409).json(await requestHoldRefusal([e.holdRequestId])); return; }
    if (e instanceof RequestReservationConflict) { res.status(409).json({ error: e.message, code: e.code }); return; }
    if (e instanceof ScheduleRevisionConflict) {
      /* Not a failure to write — a refusal to overwrite. Both versions go back
         so the interface can show the reader what changed and let them decide,
         instead of silently discarding one person's work. */
      res.status(409).json({
        error: "تغيّر هذا الموعد أثناء عملك.",
        conflict: "revision",
        current: e.current,
        yours: {
          AdCourseId: courseId, SCode, AdInstructorId: instructorId,
          fsunday: !!fsunday, fmonday: !!fmonday, ftuesday: !!ftuesday,
          fwednesday: !!fwednesday, fthursday: !!fthursday,
          fstarttime, fendtime, AdRoomCode: AdRoomCode || "", AdRoomHall: AdRoomHall || "",
        },
      });
      return;
    }
    res.status(404).json({ error: e.message });
  }
};

export const deleteScheduleHandler = async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const sched = await Repository.getScheduleById(id);
  if (sched && !isScopeAllowed(req, sched.AdCollegeId, sched.AdSectionId) && !req.user.IsAdminUser) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  let deleteVersion: Awaited<ReturnType<typeof captureScopeVersion>>;
  if (sched) {
    const deleteLock = await scheduleLockRefusal(req,sched.AdCollegeId, sched.AdSectionId, sched.AdTermId);
    if (deleteLock) { res.status(409).json({ error: deleteLock, code: "schedule-locked" }); return; }
    deleteVersion = await captureScopeVersion(req, sched.AdCollegeId, sched.AdSectionId, sched.AdTermId, "قبل حذف موعد دراسي", "manual");
    // A deletion has no "after", so the record keeps what was standing there.
    res.locals.auditChanges = `حُذف: ${sched.AdCourseName || "موعد"} · شعبة ${sched.SCode} · ${formatScheduleTimeRange(sched.fstarttime, sched.fendtime)} · ${sched.AdRoomCode}/${sched.AdRoomHall}`;
  }
  const deleteOverrides = await applyRequestHoldOverride(req);
  try { await Repository.deleteSchedule(id, (req as any).__requestReservationOwner || ""); }
  catch (error) {
    if (error instanceof RequestHoldConflict) { res.status(409).json(await requestHoldRefusal([error.holdRequestId])); return; }
    throw error;
  }
  if (deleteOverrides.length) await noteRequestHoldOverride(deleteOverrides, null, String(req.user?.Name || "القسم"));
  await recordVersionAfter(deleteVersion, before => before.filter(row => Number(row.id) !== Number(id)));
  if (sched) await noteScheduleMutation(req, sched.AdCollegeId, sched.AdSectionId, sched.AdTermId, { kind: "delete", row: sched });
  res.json({ success: true });
};

/* ══ اعتمادُ اقتراحٍ في الجدول الأصلي ═════════════════════════════════════════════
 *
 * الرادارُ وكشفُ التسجيل ورغباتُ الأساتذة تنتهي كلُّها إلى سؤالٍ واحد: «هل أنفّذ هذا في الجدول؟».
 * وهذا هو الجواب الواحد: لا مسارَ جانبياً يتجاوز الاعتماد. كلُّ تنفيذٍ يمرّ من **المسار نفسه** الذي
 * تمرّ منه ورشةُ الجدول (`createScheduleHandler` و`updateScheduleHandler`) بتحقّقه كلِّه: النطاق،
 * القفلُ عند التسجيل، تعارضُ القاعة والأستاذ والدفعة، تثبيتُ المكان، لقطةُ الإصدار قبل التغيير
 * وبعده، وسجلُّ الاعتماد (جولةُ تعديلٍ إن كان الجدول مقبولاً). ما يُضاف هنا: مصدرُ التغيير
 * (`origin`) على الصف، وجملةٌ في سجلّ التدقيق، وتراجعٌ كاملٌ لتبديلٍ تعذّرت خطوتُه الثانية.
 *
 * والحاكم أخيراً هو الخادم لا الشاشة: الاقتراحُ يُعاد فحصُه لحظةَ الاعتماد على الجدول كما هو
 * الآن، فاقتراحٌ مضى عليه ما يغيّره يُردّ بسببه ولا يُكتب.
 */
interface InnerScheduleResult { status: number; body: any; headers: Record<string, string>; audit?: string }

export async function runScheduleHandler(
  handler: (req: AuthenticatedRequest, res: Response) => Promise<void>,
  req: AuthenticatedRequest,
  patch: { params?: Record<string, string>; body: any; hypotheticalWeek?: FSchedule[]; dryRun?: boolean; restoreOrigin?: { value: any }; exactRestore?: boolean },
): Promise<InnerScheduleResult> {
  const result: InnerScheduleResult = { status: 200, body: undefined, headers: {} };
  const inner: any = Object.create(req);
  inner.body = patch.body;
  inner.params = patch.params || {};
  /* أعلامٌ داخليةٌ لا يملكها طلبٌ قادمٌ من المتصفّح: تُضبط هنا وحدها. */
  inner.__hypotheticalWeek = patch.hypotheticalWeek;
  inner.__dryRun = Boolean(patch.dryRun);
  inner.__restoreOrigin = patch.restoreOrigin;
  /* استعادةٌ تعيد الجدول كما كان بالضبط (آلة الزمن): التراجعُ لا يُمنع بقاعدة النمط. */
  inner.__exactRestore = Boolean(patch.exactRestore);
  const sink: any = {
    locals: {}, headersSent: false, statusCode: 200,
    status(code: number) { result.status = code; this.statusCode = code; return this; },
    json(value: any) { result.body = value; this.headersSent = true; return this; },
    setHeader(key: string, value: string) { result.headers[key] = String(value); return this; },
    getHeader() { return undefined; },
  };
  inner.res = sink;
  await handler(inner, sink as Response);
  result.audit = sink.locals.auditChanges;
  return result;
}

const PROPOSAL_ORIGIN_LABEL: Record<string, string> = {
  "radar": "رادار التسجيل", "student-case": "حالة طالب", "instructor-request": "رغبة أستاذ", "intelligence": "مركز الذكاء", "planning": "تخطيط الشعب",
};
export const PROPOSAL_DAYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
const dayFlagsOf = (day: string) => Object.fromEntries(PROPOSAL_DAYS.map(key => [key, key === day]));
const dayOfRow = (row: any): string => PROPOSAL_DAYS.find(key => Boolean(row?.[key])) || "";
export const dayLabelOf = (day: string) => SCHEDULE_DAYS.find(item => item.key === day)?.label || "";

/** حقولُ الصفّ كما يطلبها مسارُ التعديل، مع تغيير اليوم والوقت وحدهما. */
function editBodyFor(row: any, to: { day: string; start: string; end: string }, origin: any) {
  return {
    AdCollegeId: row.AdCollegeId, AdSectionId: row.AdSectionId, AdTermId: row.AdTermId, AdCourseId: row.AdCourseId,
    SCode: row.SCode, AdInstructorId: row.AdInstructorId,
    ...dayFlagsOf(to.day), fstarttime: to.start, fendtime: to.end,
    AdRoomCode: row.AdRoomCode, AdRoomHall: row.AdRoomHall,
    buildingId: row.buildingId, roomId: row.roomId, locationStatus: row.locationStatus,
    sourceBuildingText: row.sourceBuildingText, sourceRoomText: row.sourceRoomText,
  companionRoomId: row.companionRoomId, companionRoomLabel: row.companionRoomLabel,
    rev: row.rev, origin,
  };
}

/** نتيجةُ اعتماد اقتراح: حالةٌ وجسمٌ وجملةٌ للتدقيق. يستعملها المسارُ المباشر وقرارُ لجنة كشف التسجيل معاً. */
export interface ProposalOutcome { status: number; json: any; audit?: string }

export async function applyProposalCore(req: AuthenticatedRequest, body: any): Promise<ProposalOutcome> {
  const kind = String(body?.kind || "");
  const origin = body?.origin;
  const fail = (status: number, json: any): ProposalOutcome => ({ status, json });
  if (!SCHEDULE_ORIGIN_KINDS.has(String(origin?.kind))) return fail(400, { error: "مصدر الاقتراح غير معروف.", code: "bad-origin" });
  const where = PROPOSAL_ORIGIN_LABEL[String(origin.kind)];
  const refuse = (result: InnerScheduleResult): ProposalOutcome => fail(result.status >= 400 ? result.status : 500, {
    ...(result.body && typeof result.body === "object" ? result.body : { error: "تعذّر التنفيذ." }),
    applied: [],
  });

  /* ── فتحُ شعبة: صفٌّ جديد بالشعبة والقاعة والأستاذ الذين أثبت المحرّك أنهم خالون ── */
  if (kind === "opening") {
    const collegeId = Number(body.collegeId), sectionId = Number(body.sectionId), termId = Number(body.termId), courseId = Number(body.courseId);
    const slot = body.placement || {};
    /* يوماً واحداً أو عدّة أيام (طلبُ أستاذٍ لمحاضرةٍ في الأحد والثلاثاء معاً). */
    const days: string[] = [...new Set<string>((Array.isArray(slot.days) && slot.days.length ? slot.days : [slot.day]).map(String))].filter(day => (PROPOSAL_DAYS as readonly string[]).includes(day));
    if (![collegeId, sectionId, termId, courseId].every(value => value > 0) || !days.length) {
      return fail(400, { error: "اقتراحٌ ناقص: الكلية والقسم والفصل والمقرر واليوم مطلوبة." });
    }
    if (!(Number(slot.instructorId) > 0)) {
      return fail(422, { error: "لا أستاذَ خالياً لهذا الموعد. اختر أستاذاً من ورشة الجدول ثم احفظ.", code: "needs-instructor" });
    }
    /* رقمُ الشعبة: ما اقترحه المحرّك إن لم يُستعمل لهذا المقرر في هذا الفصل، وإلا الأعلى + 1. */
    const week = await Repository.getSchedulesByScope({ collegeId, sectionId, termId });
    const used = new Set(week.filter(row => Number(row.AdCourseId) === courseId).map(row => String(row.SCode)));
    let code = String(slot.sectionCode || "").replace(/\D/g, "");
    if (!code || used.has(code)) {
      const numbers = [...used].map(Number).filter(Number.isFinite);
      code = String((numbers.length ? Math.max(...numbers) : 500) + 1);
    }
    const result = await runScheduleHandler(createScheduleHandler, req, { body: {
      AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId, AdCourseId: courseId,
      SCode: code, AdInstructorId: Number(slot.instructorId),
      ...Object.fromEntries(PROPOSAL_DAYS.map(key => [key, days.includes(key)])), fstarttime: slot.start, fendtime: slot.end,
      AdRoomCode: slot.roomCode || "", AdRoomHall: slot.roomHall || "",
      buildingId: slot.buildingId, roomId: slot.roomId, locationStatus: slot.buildingId && slot.roomId ? "VERIFIED" : undefined,
      origin,
    } });
    if (result.status >= 400) return refuse(result);
    const row = result.body;
    return {
      status: 201,
      json: { ok: true, applied: [{ action: "add", row }], amendment: result.headers["X-Approval-Amendment"] || null },
      audit: `اعتماد اقتراح من ${where}: فُتحت شعبة ${row.SCode} لـ«${row.AdCourseName}» · ${days.map(dayLabelOf).join(" و")} ${formatScheduleTimeRange(row.fstarttime, row.fendtime)} · ${row.AdRoomCode}/${row.AdRoomHall}`,
    };
  }

  /* ── نقلُ موعد، أو تبديلُ موعدين: يُفحص الموعدُ القائم أولاً ثم يُكتب ── */
  if (kind === "move" || kind === "swap") {
    const moves: Array<{ rowId: number; from: any; to: any }> = (Array.isArray(body.moves) ? body.moves : []).slice(0, 2);
    if (!moves.length || (kind === "swap" && moves.length !== 2)) return fail(400, { error: "اقتراحٌ ناقص: المطلوب موعدٌ للنقل أو موعدان للتبديل." });
    const originals: any[] = [];
    for (const move of moves) {
      const row: any = await Repository.getScheduleById(Number(move.rowId));
      if (!row) return fail(404, { error: "لم يعد هذا الموعد موجوداً في الجدول.", code: "stale" });
      if (!isScopeAllowed(req, row.AdCollegeId, row.AdSectionId) && !req.user?.IsAdminUser) return fail(403, { error: "خارج صلاحيات الأقسام المسموحة لك" });
      const sameNow = dayOfRow(row) === move.from?.day && String(row.fstarttime) === String(move.from?.start) && String(row.fendtime) === String(move.from?.end);
      if (!sameNow) return fail(409, { error: "تغيّر موعدُ هذا المقرر منذ بُني الاقتراح. حدّث الصفحة وانظر الاقتراح من جديد.", code: "stale" });
      if (!(PROPOSAL_DAYS as readonly string[]).includes(move.to?.day) || !move.to?.start || !move.to?.end) return fail(400, { error: "وجهةُ النقل ناقصة." });
      originals.push(row);
    }
    /* ── الحالةُ النهائية للموعدين معاً ──────────────────────────────────────────
     * تبديلُ موعدين يُحكم عليه كما سيصير الجدولُ بعد الخطوتين، لا بعد الأولى وحدها: الأولى تُفحص
     * والثانيةُ ما زالت في مكانها فتتعارض معها (أستاذٌ أو قاعةٌ أو دفعةٌ مشتركة) ولو كان التبديلُ كلُّه سليماً.
     * فيُبنى أسبوعُ الفصل كما سيكون، ويُفحص كلُّ موعدٍ عليه فحصاً جافّاً (بلا كتابة) قبل أن تُكتب خطوةٌ واحدة. */
    const termRows = await Repository.getSchedulesByScope({ termId: Number(originals[0].AdTermId) });
    const targetOf = new Map(moves.map((move, i) => [Number(originals[i].id), move.to] as const));
    const finalWeek: FSchedule[] = termRows.map(row => {
      const to: any = targetOf.get(Number(row.id));
      return to ? ({ ...row, ...dayFlagsOf(to.day), fstarttime: to.start, fendtime: to.end } as any) : row;
    });
    const useFinal = moves.length > 1 ? finalWeek : undefined;
    for (let i = 0; i < moves.length; i += 1) {
      const dry = await runScheduleHandler(updateScheduleHandler, req, {
        params: { id: String(originals[i].id) }, body: editBodyFor(originals[i], moves[i].to, origin), hypotheticalWeek: useFinal, dryRun: true,
      });
      if (dry.status >= 400) return fail(dry.status, { ...(dry.body && typeof dry.body === "object" ? dry.body : { error: "تعذّر التنفيذ." }), applied: [], reverted: true });
    }
    const applied: Array<{ action: string; row: any }> = [];
    let amendment: string | null = null;
    for (let i = 0; i < moves.length; i += 1) {
      const result = await runScheduleHandler(updateScheduleHandler, req, {
        params: { id: String(originals[i].id) }, body: editBodyFor(originals[i], moves[i].to, origin), hypotheticalWeek: useFinal,
      });
      if (result.status >= 400) {
        /* بعد أن مرّ الفحصُ الجافّ لا يُتوقّع هذا إلا لتغيّرٍ في اللحظة نفسها (إصدارٌ سبقنا أو قفل). تُردّ ما كُتب
           ويُعاد مصدرُه الأول (أو يُمحى)؛ وما تبقّى من أثرٍ (رقمُ الإصدار ولقطةُ التاريخ) سجلٌّ يُقرأ لا بيانٌ فاسد. */
        let reverted = true;
        for (let j = applied.length - 1; j >= 0; j -= 1) {
          const back = await runScheduleHandler(updateScheduleHandler, req, {
            params: { id: String(originals[j].id) },
            body: editBodyFor({ ...originals[j], rev: applied[j].row.rev }, { day: dayOfRow(originals[j]), start: originals[j].fstarttime, end: originals[j].fendtime }, undefined),
            restoreOrigin: { value: originals[j].origin },
          });
          if (back.status >= 400) reverted = false;
        }
        return fail(result.status, {
          ...(result.body && typeof result.body === "object" ? result.body : { error: "تعذّر التنفيذ." }),
          applied: [], reverted,
          ...(reverted ? {} : { error: "تعذّر إتمام التبديل ولم يمكن ردّ خطوته الأولى. راجع موعد " + (originals[0].AdCourseName || "المقرر") + " في الجدول." }),
        });
      }
      applied.push({ action: "move", row: result.body });
      amendment = result.headers["X-Approval-Amendment"] || amendment;
    }
    return {
      status: 200,
      json: { ok: true, applied, amendment },
      audit: `اعتماد اقتراح من ${where}: ` + applied.map((item, i) =>
        `${item.row.AdCourseName} · شعبة ${item.row.SCode} من ${dayLabelOf(moves[i].from.day)} ${formatScheduleTimeRange(moves[i].from.start, moves[i].from.end)} إلى ${dayLabelOf(moves[i].to.day)} ${formatScheduleTimeRange(item.row.fstarttime, item.row.fendtime)}`).join(" ⇄ "),
    };
  }

  return fail(400, { error: "نوعُ الاقتراح غير معروف.", code: "bad-kind" });
}
