/**
 * ── الاعتمادُ والتوقيع ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { Response } from "express";
import { ApprovalRevisionConflict, Repository, withSerialLock } from "../../db/repository";
import { currentTermId, termHasEnded } from "../../utils/termSequence";
import type { FSchedule, ScheduleApproval, ScheduleApprovalSignature } from "../../types";
import { runApprovalAttempts, type ApprovalOnce } from "../approvalAttempts";
import { isLate } from "../../utils/lateness";
import { decideException, exceptionRefusal, normalizeExceptionDays, resolveExceptionTargets, withException, withoutException, type ExceptionAction, type ExceptionAmount, type ExceptionOutcome } from "../../utils/submissionDeadlines";
import { APPROVAL_STATUS_LABEL, blockingConflictPhrase, canSign, canSubmit, emptyApproval, inboxPriority, lastReviewedVersionId, readDeadline, verificationCode, acknowledgeAdditions, awaitsHeadSignature, canHeadReturn, canReturn, canWithdraw, CLOSED_BY_ACCEPTANCE_LABEL, countAnsweredRegistrarNotes, countOpenRegistrarNotes, extensionRefusal, kuwaitDateISO, openRound, pendingAdditionTotal, readViewExpectation, additionsAwaitingHead, withRemainingSignatures, extensionRequestRefusal, roundBaselineVersionId, staleViewRefusal, statusAfterSignatureChange, suggestedExtensionDate } from "../../utils/approvalWorkflow";
import { diffSchedules } from "../../utils/scheduleDiff";
import { approvalBlockerSummary } from "../../utils/scheduleBlockers";
import { canManageDeadline, canReviewSubmissions, roleLabel, signatureStage, watchesInbox } from "../../utils/academicRoles";
import { capacityGapItems, computeScheduleDataReadiness } from "../../utils/scheduleDataReadiness";
import { AR, countOf, oblique } from "../../utils/arabicCount";
import { checkStudentPhases, hasStudentPhases } from "../../utils/termStudentPhases";
import { countBlockingConflicts, readApproval, readDeadlineFor, refuseIfTermClosed, regulationNoticesForScope, scheduleLockRefusal, settleAmendmentMarker, withEvent } from "../core/approvals";
import { type AuthenticatedRequest, isPowerUser, requireAuth } from "../core/auth";
import { canonicalizeHistoricalLocationForRuntime, readLocationRegistry } from "../core/locations";
import { noteState, notesWithState } from "../core/notes";
import { bellPlanningTermId } from "../core/notifications";
import { isScopeAllowed } from "../core/scope";
import { approvalBlockerOptions } from "../core/smartImport";
import { captureScopeVersion } from "../core/versions";

/**
 * ── وثيقةُ الاعتماد على طابورٍ وبمراجعة ─────────────────────────────────────
 *
 * كلُّ قرارٍ يقرأ الوثيقة ويكتبها كاملة. الطابورُ يحمي خادماً واحداً، ورقمُ
 * المراجعة يحمي الخوادم كلها (R7): إن كُتب فوق ما قرأناه أُعيد القرار مرّةً
 * واحدة على ما صار، فإن تكرّر قيل لصاحبه بدل أن يُمحى قرارُ غيره.
 *
 * ولأن القرار قد يُعاد، فعقدُه (مراجعة 5):
 *   - حفظٌ واحد للوثيقة في كل محاولة، وهو آخرُ ما يُكتب قبل الردّ.
 *   - كلُّ أثرٍ جانبيٍّ لا يُعاد (إغلاقُ ملاحظات) يأتي **بعد** نجاح الحفظ.
 *   - وما يجب أن يسبق الحفظ لأن الوثيقة تحمل معرّفه (التقاطُ نسخة) يمرّ بـ
 *     `once`: يُنفَّذ مرّةً واحدة عبر المحاولتين، وتأخذ الثانيةُ نتيجةَ الأولى.
 */
async function approvalTransaction(
  /* بلا ردٍّ (null) لقرارٍ يقع على أقسامٍ كثيرة في طلبٍ واحد — استثناءاتُ
     مواعيد التسليم: الطابورُ والمراجعة نفسُهما، ويُقال لكل قسمٍ ما جرى له. */
  res: Response | null, collegeId: number, sectionId: number, termId: number, task: (once: ApprovalOnce) => Promise<void>,
): Promise<"done" | "conflict"> {
  let outcome: "done" | "conflict" = "done";
  await withSerialLock(`approval:${collegeId}:${sectionId}:${termId}`, async () => {
    /* تعديلٌ على المعتمد ينتظر جولته يُفتح قبل أي قرار (مراجعة 6). */
    await settlePendingAmendmentInLock(collegeId, sectionId, termId).catch(error =>
      console.error("[approval] تعذّر فتحُ جولة التعديل المنتظرة:", error instanceof Error ? error.message : error));
    outcome = await runApprovalAttempts(task, {
      isConflict: error => error instanceof ApprovalRevisionConflict,
      canRetry: () => !res?.headersSent,
    });
    if (outcome === "conflict" && res) {
      res.status(409).json({ error: "سبقك قرارٌ آخر على هذا الجدول في اللحظة نفسها — حدّث الشاشة وأعد المحاولة.", code: "approval-revision" });
    }
  });
  return outcome;
}

/**
 * اسمُ النطاق كما يُقرأ في سجلّ التدقيق: الكلية والقسم والفصل (R18). سطرٌ
 * يقول «قبول الجدول — الجولة ٢» لا يقول أيَّ جدول.
 */
async function approvalScopeLabel(collegeId: number, sectionId: number, termId: number): Promise<string> {
  try {
    const [colleges, sections, term] = await Promise.all([Repository.getColleges(), Repository.getSections(), Repository.getTermById(termId)]);
    const college = (colleges as any[]).find(row => Number(row.AdCollegeId) === collegeId);
    const section = (sections as any[]).find(row => Number(row.AdSectionId) === sectionId);
    return [college?.AdCollegeName || `كلية ${collegeId}`, section?.AdSectionName || `قسم ${sectionId}`, (term as any)?.AdTermName || `فصل ${termId}`].join(" · ");
  } catch {
    return `${collegeId}:${sectionId}:${termId}`;
  }
}

/** داخل قفل النطاق: تُقرأ الوثيقة، وتُصفّى علامتُها وتُحفظ إن وُجدت. */
async function settlePendingAmendmentInLock(collegeId: number, sectionId: number, termId: number): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const approval = await Repository.getScheduleApproval(collegeId, sectionId, termId);
    if (!approval?.amendmentPending) return;
    try { await Repository.saveScheduleApproval(await settleAmendmentMarker(approval)); return; }
    catch (error) { if (!(error instanceof ApprovalRevisionConflict) || attempt === 1) throw error; }
  }
}

/** لمن يقرأ خارج القفل (شريط القسم، الوارد): يأخذ القفل ويُصفّي، ولا يُسقط القراءة إن تعذّر. */
async function settlePendingAmendment(collegeId: number, sectionId: number, termId: number): Promise<void> {
  try {
    await withSerialLock(`approval:${collegeId}:${sectionId}:${termId}`, () => settlePendingAmendmentInLock(collegeId, sectionId, termId));
  } catch (error) {
    console.error("[approval] تعذّر فتحُ جولة التعديل المنتظرة:", error instanceof Error ? error.message : error);
  }
}

/** The bar's two numbers — conflicts and the appointments they touch — from one list. */
async function blockingSummaryFor(collegeId: number, sectionId: number, termId: number) {
  const [scopeRows, termRows, options] = await Promise.all([
    Repository.getSchedulesByScope({ collegeId, sectionId, termId }),
    Repository.getSchedulesByScope({ termId }),
    approvalBlockerOptions(),
  ]);
  return approvalBlockerSummary(scopeRows, termRows, options);
}

async function regulationNoticeCount(collegeId: number, sectionId: number, termId: number): Promise<number> {
  return (await regulationNoticesForScope(collegeId, sectionId, termId)).length;
}

function approvalActor(req: AuthenticatedRequest) {
  return {
    id: Number(req.user?.SystemUserId || 0),
    name: String(req.user?.Name || req.user?.SystemUserLogin || ""),
    role: req.user?.Role,
  };
}

/** نطاقُ الطلب: ثلاثة أرقام، وإلا ردٌّ واحدٌ بالعربية. */
function approvalScopeFromBody(req: AuthenticatedRequest, res: Response): { collegeId: number; sectionId: number; termId: number } | null {
  const collegeId = Number(req.body?.collegeId || 0), sectionId = Number(req.body?.sectionId || 0), termId = Number(req.body?.termId || 0);
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "اختر الفصل والكلية والقسم أولاً." }); return null; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return null; }
  return { collegeId, sectionId, termId };
}

/**
 * ── القرارُ على ما رآه صاحبه (R6) ──────────────────────────────────────────
 * الشاشةُ ترسل الجولة وعدد المواعيد كما رآهما صاحبها. فإن تغيّر أحدهما تحت
 * يده رُدّ قراره بدل أن يقع على جدولٍ لم يقرأه. وما لم يُرسل لا يُفحص.
 */
function refuseIfStale(req: AuthenticatedRequest, res: Response, current: { round: number; rowCount?: number; status?: string }): boolean {
  const refusal = staleViewRefusal(current, readViewExpectation(req.body));
  if (!refusal) return false;
  res.status(409).json({ error: refusal, code: "stale-view" });
  return true;
}

/** قراءة حالة الاعتماد لقسمٍ واحد، بالموعد والملاحظات والتعارضات معه. */
async function scheduleDataReadiness(collegeId: number, sectionId: number, termId: number, rows?: FSchedule[]) {
  const [scheduleRows, courses, registry, instructors, configuredRoomTypes] = await Promise.all([
    rows ? Promise.resolve(rows) : Repository.getSchedulesByScope({ collegeId, sectionId, termId }),
    Repository.getCourses(), readLocationRegistry(), Repository.getInstructors(), Repository.getLocationRoomTypes(),
  ]);
  const roomTypes=new Set(configuredRoomTypes.length?configuredRoomTypes:["تدريسية","مختبر","مختبر حاسوب"]);
  for(const room of registry.rooms){
    if(!room.active||room.confidence!=="CONFIRMED"||!room.sectionIds.includes(sectionId))continue;
    const type=String(room.roomType||"").normalize("NFKC").trim();if(type)roomTypes.add(type);
  }
  const registeredRoomTypes=[...roomTypes].sort((a,b)=>a.localeCompare(b,"ar"));
  /* التطبيعُ نفسه الذي يعدّ به `approvalBlockerOptions` الموانع — قاعدةٌ واحدة. */
  return computeScheduleDataReadiness({
    rows: scheduleRows as any[],
    courses: courses as any[],
    instructorIds: new Set((instructors as any[]).map(instructor => Number(instructor.AdInstructorId))),
    rooms: registry.rooms,
    roomTypeOptions:registeredRoomTypes,
    normalizeRow: (row: any) => canonicalizeHistoricalLocationForRuntime(row as FSchedule, registry),
  });
}

/**
 * الإرسال للتسجيل، بلا قفلٍ ولا حفظ: يستدعيه مسارُ الإرسال ومسارُ توقيع رئيس
 * القسم، وكلاهما يمسك قفلَ النطاق قبله ويحفظ ما يعيده (`next`) حفظاً واحداً.
 */
async function submitToRegistrar(req: AuthenticatedRequest, collegeId: number, sectionId: number, termId: number, approval: ScheduleApproval, once: ApprovalOnce) {
  const deadline = await readDeadlineFor(approval, termId);
  /* ── «عُولجت» تُحسب، ولا تُقرأ من علَم ──────────────────────────────────
   *
   * حالة الملاحظة مشتقّةٌ من القيمة الحاضرة في الخانة، لا مخزّنةٌ في صفّها:
   * فإن تغيّرت الخانة فقد عُولجت، وإن لم تتغيّر فهي تنتظر. والعدُّ من العدّاد
   * الواحد الذي يقرؤه الإرجاعُ والوارد والشاشة (R4). */
  const openNotes = countOpenRegistrarNotes(await notesWithState(collegeId, sectionId, termId));
  /* والتعارضُ المادّي يمنع الإرسال كما يمنع التوقيع والقبول (R3). */
  const blocking = await blockingSummaryFor(collegeId, sectionId, termId);
  const regulationBlockers = await regulationNoticeCount(collegeId, sectionId, termId);
  if (regulationBlockers) return { ok: false as const, error: `توجد ${countOf(regulationBlockers, AR.approvalBlocker)} لائحية. عالجها قبل الإرسال.`, code: "regulation-blockers" };
  const verdict = canSubmit(approval, { openNoteCount: openNotes, deadlineState: deadline, blockingConflicts: blocking.conflicts, blockingDuplicates: blocking.duplicates });
  if (verdict.ok !== true) return { ok: false as const, error: verdict.message, code: verdict.code };

  const actor = approvalActor(req);
  const version = await once("submit-version", () => captureScopeVersion(req, collegeId, sectionId, termId, "إرسال إلى التسجيل", "manual", { unchanged: true }));

  /* ── ما طُلب، وما فُعل ──────────────────────────────────────────────────
   * الجولةُ المنتهية تحمل عدد ملاحظاتها — وهو ما طُلب. ويُضاف إليها الآن عدد
   * الصفوف التي تحرّكت فعلاً منذ أن رآها التسجيل — وهو ما فُعل.
   */
  const closingBaseline = roundBaselineVersionId(approval, approval.currentRound + 1);
  let changedRowCount: number | undefined;
  if (approval.currentRound > 0 && closingBaseline) {
    try {
      const seen = await Repository.getScheduleVersionById(closingBaseline);
      if (seen) {
        const now = await Repository.getSchedulesByScope({ collegeId, sectionId, termId });
        const moved = diffSchedules(seen.rows as any, now as any);
        changedRowCount = moved.counts.added + moved.counts.removed + moved.counts.changed;
      }
    } catch { /* عددٌ يُعرض، لا شرطٌ يُحتسب: تعذّره لا يمنع الإرسال. */ }
  }

  /* الجولةُ تُبنى من `openRound` — الدالّةِ نفسها التي تفتح بها التعديلاتُ
     بعد القبول جولتَها (R8)، فلا شكلان للجولة. */
  const opened = openRound(approval, {
    at: new Date().toISOString(), by: actor.name,
    reviewedVersionId: version?.id, closingChangedRowCount: changedRowCount,
  });
  const next = withEvent(req, { ...approval, status: "submitted", ...opened, extensionRequest: undefined }, "submit", undefined, opened.currentRound);
  return { ok: true as const, next, round: opened.currentRound };
}

/**
 * ── استثناءاتُ مواعيد التسليم، دفعةً واحدة ──────────────────────────────────
 *
 * رئيسُ التسجيل يضع موعد الفصل، ثم يستثني بالأيام: كلَّ الأقسام، أو كليةً، أو
 * أقساماً يختارها. وطلبُ القسم يُمنح أو يُرفض من هنا أيضاً. فالقرارُ الواحد
 * يقع على أقسامٍ كثيرة، وكلُّ قسمٍ يُكتب على طابوره وبمراجعته كما يُكتب أيُّ
 * قرار اعتماد، ويُقال لكل قسمٍ ما جرى له.
 *
 * والقواعدُ من `submissionDeadlines` وحدها: الأيامُ من موعد الفصل أو من
 * استثناء القسم إن كان أبعد، ولا استثناءَ قبل موعد الفصل ولا بلا سبب، والرفعُ
 * يعيد القسم إلى موعد الفصل.
 */
const EXTENSION_ACTIONS = new Set(["grant", "remove", "reject"]);
const EXTENSIONS_MAX_TARGETS = 500;

/** عدّادُ فصلٍ واحد — يُجمع للجاري ولفصل التخطيط (N18). */
async function approvalBadgeForTerm(req: AuthenticatedRequest, termId: number): Promise<{ count: number; kind?: string }> {

  const approvals = (await Repository.getScheduleApprovalsForTerm(termId))
    .filter(row => req.user?.IsAdminUser || isScopeAllowed(req, Number(row.AdCollegeId), Number(row.AdSectionId)));

  /* من يفتح الوارد يرى عدّاده، ولو لم يقرّر فيه: سؤالُ عميد التسجيل هو
     «كم جدولاً ينتظر؟»، لا «أيّها أقبل؟». */
  if (canReviewSubmissions(req.user?.Role) || watchesInbox(req.user?.Role)) {
    return { count: approvals.filter(row => row.status === "submitted").length, kind: "waiting" };
  }
  const stage = signatureStage(req.user?.Role);
  if (stage) {
    /* ما ينتظر هذا الشخص بعينه (N17/N19):
       - رئيس القسم: كلُّ جدولٍ وقّعته اللجنة وينتظر توقيعه («committee») —
         كان العدّاد يتجاهله، وهو أوّلُ ما يُطلب منه.
       - الإضافاتُ التي تنتظر إقراره.
       - ملاحظاتُ التسجيل المفتوحة في أي حال — لا في «أُرجع» وحده: ملاحظةٌ
         كُتبت والجدول قيد الإعداد أو بعد اعتماده ملاحظةٌ تنتظر ردّاً أيضاً. */
    /* ملاحظاتُ كل جدولٍ تُقرأ معاً لا واحداً بعد واحد؛ والعدُّ بعدها كما كان. */
    const notesOf = new Map<ScheduleApproval, Awaited<ReturnType<typeof notesWithState>>>(await Promise.all(
      approvals.filter(approval => approval.status !== "submitted")
        .map(async approval => [approval, await notesWithState(approval.AdCollegeId, approval.AdSectionId, termId)] as const)));
    let open = 0;
    for (const approval of approvals) {
      if (stage === "head" && awaitsHeadSignature(approval)) open += 1;
      /* الإضافاتُ تنتظر رئيسَ القسم وحده، وما دام توقيعُه قائماً (additionsAwaitingHead):
         كانت تُعدّ في عدّاد اللجنة أيضاً، وهي لا تملك فيها فعلاً. */
      if (stage === "head") open += additionsAwaitingHead(approval);
      /* والجدولُ عند التسجيل ملاحظاتُه مراجعةٌ جارية لا يملك القسم فيها فعلاً. */
      if (approval.status === "submitted") continue;
      open += countOpenRegistrarNotes(notesOf.get(approval) || []);
    }
    return { count: open, kind: "notes" };
  }
  return { count: 0 } as { count: number; kind?: string };
}

export function registerApprovalsRoutes(app: Express): void {

app.get("/api/approvals", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0), sectionId = Number(req.query.sectionId || 0), termId = Number(req.query.termId || 0);
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "اختر الفصل والكلية والقسم أولاً." }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  let approval = await readApproval(collegeId, sectionId, termId);
  if (approval.amendmentPending) {
    await settlePendingAmendment(collegeId, sectionId, termId);
    approval = await readApproval(collegeId, sectionId, termId);
  }
  const [deadline, blocking, notices, notes, rows, lockReason] = await Promise.all([
    readDeadlineFor(approval, termId),
    blockingSummaryFor(collegeId, sectionId, termId),
    regulationNoticeCount(collegeId, sectionId, termId),
    notesWithState(collegeId, sectionId, termId),
    Repository.getSchedulesByScope({ collegeId, sectionId, termId }),
    scheduleLockRefusal(req, collegeId, sectionId, termId),
  ]);
  const readiness=await scheduleDataReadiness(collegeId,sectionId,termId,rows);
  const plannerReadiness=(req.permissions||[]).includes(7)||isPowerUser(req)?readiness:{...readiness,roomFit:undefined};
  res.json({
    approval,
    deadline,
    blockingConflicts: blocking.conflicts,
    /* المواعيدُ التي تقف في تلك التعارضات — من القائمة نفسها (approvalBlockerSummary). */
    blockingRows: blocking.rows,
    /* وكم منها موعدٌ مكرّر لا تعارضٌ مادّي — فيقول الشريطُ ما يعدّه. */
    blockingDuplicates: blocking.duplicates,
    /* مقرراتُ الجدول التي سعتُها غير مسجّلة: تمنع التوقيع كالتعارض (طلب المالك). */
    missingCapacity: capacityGapItems(readiness.items).length,
    regulationNotices: notices,
    /* ── ما يمنع الإرسال يُقال قبل الضغط ────────────────────────────────────
     * من العدّاد الواحد نفسه الذي يقرؤه الإرسالُ والإرجاعُ والوارد (R4). */
    openRegistrarNotes: countOpenRegistrarNotes(notes),
    /* خلافاتٌ بلغت حدَّ الرفع إلى رئيس القسم (R19): تُعرض له في شريطه. */
    escalatedNotes: notes.filter(note => note.origin === "registrar" && note.escalatedAt && note.state !== "resolved").length,
    /* وعددُ المواعيد: لا يُوقَّع على جدولٍ فارغ، فلا يُعرض زرُّ توقيعٍ عليه. */
    rowCount: rows.length,
    /* سببُ منع التعديل لهذا الناظر، من حارس الخادم نفسه (R21). */
    lockReason,
    dataReadiness: plannerReadiness,
    /* من القاعدة نفسها التي يُسأل بها مسارُ الطلب (extensionRequestRefusal). */
    canRequestExtension: extensionRequestRefusal(approval, deadline) === null,
    statusLabel: APPROVAL_STATUS_LABEL[approval.status],
    lastReviewedVersionId: lastReviewedVersionId(approval),
  });
});

/**
 * حالات فصلٍ كاملٍ دفعةً واحدة.
 *
 * هذه القراءة هي ما يجعل «ميزان الأقسام» يعرف حالة الاعتماد بلا استعلامٍ لكل
 * قسم، وما يبني صندوق الوارد عند التسجيل. والنطاق يُطبَّق هنا كما يُطبَّق في
 * كل مكان: العميد يرى كليته، والتسجيل يرى ما عُيِّن له.
 */
app.get("/api/approvals/term", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const termId = Number(req.query.termId || 0);
  const collegeId = Number(req.query.collegeId || 0) || undefined;
  if (!termId) { res.status(400).json({ error: "اختر الفصل أولاً." }); return; }
  const [rows, term] = await Promise.all([
    Repository.getScheduleApprovalsForTerm(termId, collegeId),
    Repository.getTermById(termId),
  ]);
  const now = new Date();
  const termDeadline = (term as any)?.AdTermSubmissionDeadline as string | undefined;
  const visible = rows.filter(row => req.user?.IsAdminUser || isScopeAllowed(req, Number(row.AdCollegeId), Number(row.AdSectionId)));
  /* ── الأقسام التي لم تبدأ (N3) ─────────────────────────────────────────
   * لا سجلَّ لها، فكانت تغيب عن الميزان كلياً — وهي أهمّ ما يسأل عنه العميد.
   * تُبنى هنا من سجلّ الأقسام في نطاق القارئ، بحال «لم يبدأ»، ويُحكم على
   * تأخّرها وتأخّر غيرها بالقاعدة الواحدة `isLate` (src/utils/lateness.ts). */
  const [sections, colleges, termRows] = await Promise.all([
    Repository.getSections(), Repository.getColleges(), Repository.getSchedulesByScope({ termId }),
  ]);
  const collegeName = new Map(colleges.map((row: any) => [Number(row.AdCollegeId), String(row.AdCollegeName || "")]));
  const started = new Set(rows.map(row => `${Number(row.AdCollegeId)}:${Number(row.AdSectionId)}`));
  /* ── قسمٌ كتب مواعيده ولم يوقّع ليس «لم يبدأ» (مراجعة البروفة) ──────────
   * بلا سجلّ اعتماد، كان كلُّ قسمٍ يُقال عنه «لم يبدأ» — وميزانُ العميد يعرض
   * بجانبه ستةَ مواعيد، والواردُ وشريطُ القسم يقولان عنه «قيد الإعداد». فالحالُ
   * من الجدول نفسه: مواعيدُ في الفصل ⇒ قيد الإعداد، ولا شيء ⇒ لم يبدأ. */
  const withRows = new Set((termRows as any[]).map(row => `${Number(row.AdCollegeId)}:${Number(row.AdSectionId)}`));
  const notStarted = sections
    .filter((row: any) => (!collegeId || Number(row.AdCollegeId) === collegeId)
      && !started.has(`${Number(row.AdCollegeId)}:${Number(row.AdSectionId)}`)
      && (req.user?.IsAdminUser || isScopeAllowed(req, Number(row.AdCollegeId), Number(row.AdSectionId))))
    .map((row: any) => {
      const drafting = withRows.has(`${Number(row.AdCollegeId)}:${Number(row.AdSectionId)}`);
      return {
      AdCollegeId: Number(row.AdCollegeId), AdSectionId: Number(row.AdSectionId),
      sectionName: String(row.AdSectionName || ""), collegeName: collegeName.get(Number(row.AdCollegeId)) || "",
      status: drafting ? "drafting" as const : "notStarted" as const,
      statusLabel: drafting ? APPROVAL_STATUS_LABEL.drafting : "لم يبدأ",
      deadline: readDeadline({ termDeadline }, now),
      late: isLate({ approvalStatus: null, submittedRounds: 0, deadline: termDeadline }),
      };
    });
  res.json({
    termDeadline,
    approvals: visible.map(row => ({
      ...row,
      /* الاسمان لشريط «مواعيد التسليم» عند العميدين (استثناءاتٌ بأسماء أقسامها). */
      sectionName: String((sections as any[]).find(item => Number(item.AdSectionId) === Number(row.AdSectionId) && Number(item.AdCollegeId) === Number(row.AdCollegeId))?.AdSectionName || ""),
      collegeName: collegeName.get(Number(row.AdCollegeId)) || "",
      statusLabel: APPROVAL_STATUS_LABEL[row.status],
      deadline: readDeadline({ termDeadline, extensionUntil: row.extensionUntil, extensionReason: row.extensionReason }, now),
      late: isLate({ approvalStatus: row.status, submittedRounds: row.currentRound, deadline: termDeadline, extension: row.extensionUntil }),
    })),
    notStarted,
  });
});

/**
 * التوقيع.
 *
 * مشدودٌ إلى نسخةٍ بعينها: تُلتقط النسخة أولاً، ثم يُكتب التوقيع عليها. فإن
 * تغيّر الجدول بعدها عُرف ما تغيّر، لا مجرّد أنه تغيّر.
 */
app.post("/api/approvals/sign", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const scope = approvalScopeFromBody(req, res); if (!scope) return;
  const { collegeId, sectionId, termId } = scope;

  const actor = approvalActor(req);
  const stage = signatureStage(actor.role);
  if (!stage) { res.status(403).json({ error: "التوقيع لرئيس لجنة الجدول ولرئيس القسم العلمي فقط." }); return; }
  if (await refuseIfTermClosed(res, termId)) return;

  await approvalTransaction(res, collegeId, sectionId, termId, async once => {
    const approval = await readApproval(collegeId, sectionId, termId);
    const rows = await Repository.getSchedulesByScope({ collegeId, sectionId, termId });
    if (refuseIfStale(req, res, { round: approval.currentRound, rowCount: rows.length, status: approval.status })) return;
    /* نواقصُ البيانات إشعارٌ لا مانع (قاعدة 2026-09-27): لا يمنع التوقيعَ إلا تعارضٌ ماديّ،
       وسعةُ المقرر غير المسجّلة (طلب المالك) — وحدها من النواقص. */
    const blocking = await blockingSummaryFor(collegeId, sectionId, termId);
    const readiness = await scheduleDataReadiness(collegeId, sectionId, termId, rows);
    const requiredCourseGaps=readiness.items.filter(item=>item.kind==="course"&&item.fields.some(field=>field==="نوع القاعة المناسب"||field==="طبيعة التدريس"));
    if(requiredCourseGaps.length){
      const summary=requiredCourseGaps.map(item=>`${item.label}: ${item.fields.filter(field=>field==="نوع القاعة المناسب"||field==="طبيعة التدريس").join("، ")}`).join("؛ ");
      res.status(409).json({error:`لا يمكن توقيع الجدول قبل استكمال نوع القاعة المناسب وطبيعة التدريس لكل مقرر. ${summary}`,code:"course-requirements-missing",items:requiredCourseGaps});return;
    }
    const regulationBlockers = await regulationNoticeCount(collegeId, sectionId, termId);
    if (regulationBlockers) { res.status(409).json({ error: `توجد ${countOf(regulationBlockers, AR.approvalBlocker)} لائحية. عالجها قبل التوقيع.`, code: "regulation-blockers" }); return; }
    const verdict = canSign(approval, stage, { blockingConflicts: blocking.conflicts, blockingDuplicates: blocking.duplicates, rowCount: rows.length, missingCapacity: capacityGapItems(readiness.items).length });
    if (verdict.ok !== true) { res.status(409).json({ error: verdict.message, code: verdict.code }); return; }

    const notices = await regulationNoticeCount(collegeId, sectionId, termId);
    const version = await once("sign-version", () => captureScopeVersion(req, collegeId, sectionId, termId, `توقيع ${roleLabel(actor.role)}`, "manual", { unchanged: true }));
    const at = new Date().toISOString();
    const signature: ScheduleApprovalSignature = {
      stage,
      SystemUserId: actor.id,
      userName: actor.name,
      roleLabel: roleLabel(actor.role),
      at,
      versionId: version?.id,
      rowCount: rows.length,
      regulationNoticeCount: notices,
      verifyCode: verificationCode(String(version?.id || `${collegeId}:${sectionId}:${termId}`), actor.id, at),
    };
    let next: ScheduleApproval = { ...approval, signatures: [...approval.signatures.filter(item => item.stage !== stage), signature] };
    /* توقيعُ اللجنة من جديد يطوي إرجاع رئيس القسم: أُجيب عنه (R11). */
    if (stage === "committee" && next.headReturn) { const { headReturn: _answered, ...rest } = next; next = rest as ScheduleApproval; }
    /* وتوقيعُ رئيس القسم على النسخة الحاضرة يشمل كلَّ شعبةٍ فيها: ما أُضيف بعد
       توقيعه القديم قرأه الآن ووقّع عليه (والعددُ محروسٌ بـrefuseIfStale أعلاه).
       كان يبقى «بانتظار موافقة رئيس القسم» فيُمنع الإرسالُ الذي يليه التوقيع،
       ويُطلب منه إقرارٌ ثانٍ على ما وقّع عليه للتوّ. */
    if (stage === "head" && pendingAdditionTotal(next)) next = acknowledgeAdditions(next).next;
    next.status = statusAfterSignatureChange(next);
    next = withEvent(req, next, "sign", `${signature.roleLabel} — ${countOf(rows.length, AR.appointment)} — ${signature.verifyCode}`);
    /* اعتمادُ رئيس القسم هو الإرسال: يوقّع فيصل الجدولُ إلى التسجيل مباشرة.
       فإن منعه مانعٌ (موعدٌ منقضٍ، ملاحظةٌ معلّقة، تعارض) بقي التوقيع وقيل السبب.
       والتوقيعُ والإرسال حفظٌ واحد (مراجعة 5): كانا حفظين، فإن سبق الثانيَ
       قرارٌ آخر أُعيد كلُّ شيء ووجد التوقيعَ محفوظاً فرُدّ رئيسُ القسم بـ409. */
    const sent = stage === "head" ? await submitToRegistrar(req, collegeId, sectionId, termId, next, once) : undefined;
    const saved = await Repository.saveScheduleApproval(sent?.ok === true ? sent.next : next);
    const where = await approvalScopeLabel(collegeId, sectionId, termId);
    res.locals.auditChanges = `توقيع ${signature.roleLabel} على جدول ${where}: ${countOf(rows.length, AR.appointment)}، برمز ${signature.verifyCode}`;
    if (sent) {
      if (sent.ok === true) {
        res.locals.auditChanges += ` — وأُرسل إلى التسجيل (الجولة ${sent.round})`;
        res.json({ approval: saved, signature, regulationNotices: notices, submitted: true, round: sent.round });
        return;
      }
      res.json({ approval: saved, signature, regulationNotices: notices, submitted: false, submitBlocked: sent.error });
      return;
    }
    res.json({ approval: saved, signature, regulationNotices: notices });
  });
});

/**
 * سحب توقيعٍ أثبته صاحبه.
 *
 * التوقيع قرارٌ، والقرار يُراجَع. لكن الرجوع عنه لا يكون إلا لمن أثبته
 * بنفسه — لا يسحب رئيس القسم توقيع اللجنة ولا العكس — ولا بعد أن يصير
 * الجدول عند التسجيل، ولا بعد أن يُقبل (R1): القاعدةُ من `canWithdraw` وحدها.
 */
app.post("/api/approvals/withdraw", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const scope = approvalScopeFromBody(req, res); if (!scope) return;
  const { collegeId, sectionId, termId } = scope;
  const actor = approvalActor(req);
  const stage = signatureStage(actor.role);
  if (!stage) { res.status(403).json({ error: "سحب التوقيع لمن أثبته وحده." }); return; }
  if (await refuseIfTermClosed(res, termId)) return;
  await approvalTransaction(res, collegeId, sectionId, termId, async () => {
    const approval = await readApproval(collegeId, sectionId, termId);
    const verdict = canWithdraw(approval, stage);
    if (verdict.ok !== true) { res.status(409).json({ error: verdict.message, code: verdict.code }); return; }
    /* سحبُ توقيع اللجنة يُسقط توقيع رئيس القسم معه: الترتيب جزءٌ من المعنى،
       وتوقيعُ رئيس قسمٍ فوق لجنةٍ سحبت توقيعها لا يقول شيئاً. */
    const dropped = stage === "committee" ? [] : approval.signatures.filter(item => item.stage === "committee");
    let next: ScheduleApproval = withRemainingSignatures(approval, dropped);
    /* وجدولٌ مُرجَعٌ يبقى مُرجَعاً: السحبُ لا يمحو أن التسجيل ينتظره. */
    next.status = statusAfterSignatureChange(next);
    next = withEvent(req, next, "withdraw", roleLabel(actor.role));
    const saved = await Repository.saveScheduleApproval(next);
    res.locals.auditChanges = `سحب توقيع ${roleLabel(actor.role)} — ${await approvalScopeLabel(collegeId, sectionId, termId)}`;
    res.json({ approval: saved });
  });
});

/**
 * ── رئيسُ القسم يُرجع للجنة (R11) ──────────────────────────────────────────
 *
 * كان رئيسُ القسم لا يملك إلا أن يعتمد أو يسكت: جدولٌ لا يرضاه يبقى «موقّعاً
 * من اللجنة» بلا أثرٍ لاعتراضه. فصار يُرجعه بسببٍ مكتوب، فيسقط توقيعُ اللجنة
 * ويعود الجدول إلى الإعداد، ويُقرأ السببُ في شريطها حتى توقّع من جديد.
 */
app.post("/api/approvals/head-return", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const scope = approvalScopeFromBody(req, res); if (!scope) return;
  const { collegeId, sectionId, termId } = scope;
  if (signatureStage(req.user?.Role) !== "head") { res.status(403).json({ error: "الإرجاع للجنة لرئيس القسم العلمي وحده." }); return; }
  if (await refuseIfTermClosed(res, termId)) return;
  const reason = String(req.body?.reason || "").trim().slice(0, 400);
  await approvalTransaction(res, collegeId, sectionId, termId, async () => {
    const approval = await readApproval(collegeId, sectionId, termId);
    if (refuseIfStale(req, res, { round: approval.currentRound, status: approval.status })) return;
    const verdict = canHeadReturn(approval, reason);
    if (verdict.ok !== true) { res.status(verdict.code === "reason" ? 400 : 409).json({ error: verdict.message, code: verdict.code }); return; }
    const actor = approvalActor(req);
    let next: ScheduleApproval = {
      ...withRemainingSignatures(approval, approval.signatures.filter(item => item.stage !== "committee" && item.stage !== "head")),
      status: "drafting",
      headReturn: { by: actor.name, at: new Date().toISOString(), reason },
    };
    next = withEvent(req, next, "head-return", reason);
    const saved = await Repository.saveScheduleApproval(next);
    res.locals.auditChanges = `إرجاع رئيس القسم الجدولَ للجنة — ${await approvalScopeLabel(collegeId, sectionId, termId)}: ${reason.slice(0, 120)}`;
    res.json({ approval: saved });
  });
});

/** إقرار رئيس القسم بالشُّعب المضافة بعد توقيعه. ضغطةٌ واحدة، لا توقيعٌ جديد. */
app.post("/api/approvals/acknowledge-additions", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const scope = approvalScopeFromBody(req, res); if (!scope) return;
  const { collegeId, sectionId, termId } = scope;
  if (signatureStage(req.user?.Role) !== "head") { res.status(403).json({ error: "الإقرار على الشُّعب المضافة لرئيس القسم العلمي وحده." }); return; }
  if (await refuseIfTermClosed(res, termId)) return;
  await approvalTransaction(res, collegeId, sectionId, termId, async () => {
    const approval = await readApproval(collegeId, sectionId, termId);
    if (!additionsAwaitingHead(approval)) { res.json({ approval, acknowledged: 0, remaining: 0 }); return; }
    /* ── يُقرّ ما رآه وحده (R6/R14) ───────────────────────────────────────
     * الشاشةُ ترسل المعرّفات التي عرضتها وعدد ما زاد عليها. وما أُضيف بعد أن
     * فتحها يبقى ينتظره، بدل أن يُقرّ بضغطةٍ على قائمةٍ لم تكن فيها. */
    const seenIds = Array.isArray(req.body?.expectedPendingIds) ? (req.body.expectedPendingIds as any[]).map(Number).filter(Number.isFinite) : undefined;
    const outcome = acknowledgeAdditions(approval, seenIds ? { ids: seenIds, overflow: Number(req.body?.expectedOverflow || 0) } : undefined);
    const next = withEvent(req, outcome.next, "acknowledge-additions", countOf(outcome.acknowledged, AR.section));
    const saved = await Repository.saveScheduleApproval(next);
    res.locals.auditChanges = `إقرار رئيس القسم على ${countOf(outcome.acknowledged, oblique(AR.section))} أُضيفت بعد اعتماده — ${await approvalScopeLabel(collegeId, sectionId, termId)}`;
    res.json({ approval: saved, acknowledged: outcome.acknowledged, remaining: outcome.remaining });
  });
});

/** الإرسال للتسجيل. يفتح جولةً جديدة ويقفل التعديل حتى يقبل التسجيل أو يُرجع. */
app.post("/api/approvals/submit", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const scope = approvalScopeFromBody(req, res); if (!scope) return;
  const { collegeId, sectionId, termId } = scope;
  if (!signatureStage(req.user?.Role) && !isPowerUser(req)) { res.status(403).json({ error: "الإرسال للتسجيل من القسم: لجنة الجدول أو رئيس القسم." }); return; }
  if (await refuseIfTermClosed(res, termId)) return;

  await approvalTransaction(res, collegeId, sectionId, termId, async once => {
    const approval = await readApproval(collegeId, sectionId, termId);
    if (refuseIfStale(req, res, { round: approval.currentRound, status: approval.status })) return;
    const result = await submitToRegistrar(req, collegeId, sectionId, termId, approval, once);
    if (result.ok !== true) { res.status(409).json({ error: result.error, code: result.code }); return; }
    const saved = await Repository.saveScheduleApproval(result.next);
    res.locals.auditChanges = `إرسال جدول ${await approvalScopeLabel(collegeId, sectionId, termId)} إلى التسجيل — الجولة ${result.round}`;
    res.json({ approval: saved, round: result.round });
  });
});

/**
 * إرجاع الجدول للقسم بملاحظات. يفتح القفل، ولا يُبطل التوقيعين.
 *
 * ويُرجَع المعتمدُ أيضاً (R10): في جولةٍ جديدة أساسُها ما قُبل. والعدُّ من
 * العدّاد الواحد (R4) — فملاحظةٌ أصرّ عليها التسجيل من جولةٍ سابقة تُحسب.
 */
app.post("/api/approvals/return", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const scope = approvalScopeFromBody(req, res); if (!scope) return;
  const { collegeId, sectionId, termId } = scope;
  if (!canReviewSubmissions(req.user?.Role)) { res.status(403).json({ error: "الإرجاع للتسجيل وحده." }); return; }
  if (await refuseIfTermClosed(res, termId)) return;

  await approvalTransaction(res, collegeId, sectionId, termId, async once => {
    const approval = await readApproval(collegeId, sectionId, termId);
    const rows = await Repository.getSchedulesByScope({ collegeId, sectionId, termId });
    if (refuseIfStale(req, res, { round: approval.currentRound, rowCount: rows.length, status: approval.status })) return;
    const openNow = countOpenRegistrarNotes(await notesWithState(collegeId, sectionId, termId));
    const verdict = canReturn(approval, openNow);
    if (verdict.ok !== true) { res.status(409).json({ error: verdict.message, code: verdict.code }); return; }

    const actor = approvalActor(req);
    const at = new Date().toISOString();
    let base: ScheduleApproval = approval;
    if (verdict.reopensAccepted) {
      /* المعتمدُ يُرجع في جولةٍ جديدة، أساسُها ما رآه التسجيل الآن. */
      const seen = await once("return-version", () => captureScopeVersion(req, collegeId, sectionId, termId, "إرجاع جدولٍ معتمد", "manual", { unchanged: true }));
      base = { ...approval, ...openRound(approval, { at, by: actor.name, reviewedVersionId: seen?.id }) };
    } else if (!base.rounds.find(round => round.number === base.currentRound)?.reviewedVersionId) {
      /* جولةُ التعديل لم تحمل نسخةً: ما رآه التسجيل يُلتقط لحظةَ الإرجاع،
         فيصير أساسَ الجولة التالية بدل أن يُقارن بما قبلها. */
      const seen = await once("return-version", () => captureScopeVersion(req, collegeId, sectionId, termId, "إرجاع للقسم", "manual", { unchanged: true }));
      if (seen?.id) base = { ...base, rounds: base.rounds.map(round => round.number === base.currentRound ? { ...round, reviewedVersionId: seen.id } : round) };
    }
    const rounds = base.rounds.map(round => round.number === base.currentRound
      ? { ...round, returnedAt: at, returnedBy: actor.name, returnedNoteCount: openNow }
      : round);
    const next = withEvent(req, { ...base, status: "returned", rounds }, "return", countOf(openNow, AR.note), base.currentRound);
    const saved = await Repository.saveScheduleApproval(next);
    res.locals.auditChanges = `إرجاع جدول ${await approvalScopeLabel(collegeId, sectionId, termId)} للقسم مع ${countOf(openNow, oblique(AR.note))} — الجولة ${base.currentRound}`;
    res.json({ approval: saved, returnedNoteCount: openNow });
  });
});

/** قبول التسجيل. المانع الوحيد تعارضٌ مادّي؛ واللائحة تُعرض ولا تمنع. */
app.post("/api/approvals/accept", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const scope = approvalScopeFromBody(req, res); if (!scope) return;
  const { collegeId, sectionId, termId } = scope;
  if (!canReviewSubmissions(req.user?.Role)) { res.status(403).json({ error: "القبول للتسجيل وحده." }); return; }
  if (await refuseIfTermClosed(res, termId)) return;

  await approvalTransaction(res, collegeId, sectionId, termId, async once => {
    const approval = await readApproval(collegeId, sectionId, termId);
    if (approval.status !== "submitted") { res.status(409).json({ error: "هذا الجدول ليس عند التسجيل الآن." }); return; }
    const rows = await Repository.getSchedulesByScope({ collegeId, sectionId, termId });
    if (refuseIfStale(req, res, { round: approval.currentRound, rowCount: rows.length, status: approval.status })) return;
    const blocking = await blockingSummaryFor(collegeId, sectionId, termId);
    if (blocking.conflicts > 0) {
      res.status(409).json({ error: `لا يُقبل جدولٌ فيه ${blockingConflictPhrase(blocking.conflicts, blocking.duplicates)}. أرجِعه للقسم لمعالجته.`, code: "blocking-conflicts" });
      return;
    }
    const actor = approvalActor(req);
    const accepted = await once("accept-version", () => captureScopeVersion(req, collegeId, sectionId, termId, "قبول التسجيل", "manual", { unchanged: true }));
    const rounds = approval.rounds.map(round => round.number === approval.currentRound
      ? { ...round, acceptedAt: new Date().toISOString(), acceptedBy: actor.name, ...(accepted?.id ? { acceptedVersionId: accepted.id } : {}) }
      : round);
    /* ── القبولُ يُغلق ما بقي من ملاحظات التسجيل (R5) ─────────────────────
     * ملاحظةٌ مفتوحة على جدولٍ قُبل كانت تبقى حيّة، فتمنع أوّلَ إعادة إرسالٍ
     * بعد أي تعديلٍ لاحق — والقسمُ لا يعرف أنها ما زالت هناك. فقبولُ الجدول
     * قرارٌ فيها أيضاً: تُغلق «بالقبول» ويبقى نصُّها.
     * والإغلاقُ بعد نجاح حفظ القبول لا قبله (مراجعة 5): قبولٌ خسر سباق
     * المراجعة فرُدّ بـ409 كان قد أغلق ملاحظاتِ جدولٍ لم يُقبل. */
    const notes = await notesWithState(collegeId, sectionId, termId);
    const closing = notes.filter(note => note.origin === "registrar" && (note.state === "open" || note.state === "answered"));
    const next = withEvent(req, { ...approval, status: "accepted", rounds, pendingAdditions: [], pendingAdditionsOverflow: 0 },
      "accept", closing.length ? `${countOf(closing.length, AR.note)} ${CLOSED_BY_ACCEPTANCE_LABEL}` : undefined);
    const saved = await Repository.saveScheduleApproval(next);
    /* القبولُ محفوظ: تعذّرُ إغلاق ملاحظةٍ يُسجَّل ولا يُبطله (والإغلاقُ نفسه
       لا ضرر في تكراره). */
    for (const note of closing) {
      try { await Repository.updateScheduleComment(note.id, { resolved: true, resolution: "closed-by-acceptance" }); }
      catch (error) { console.error("[approval] تعذّر إغلاق ملاحظةٍ بعد القبول:", error instanceof Error ? error.message : error); }
    }
    res.locals.auditChanges = `قبول جدول ${await approvalScopeLabel(collegeId, sectionId, termId)} نهائياً — الجولة ${approval.currentRound}`
      + (closing.length ? ` (${countOf(closing.length, AR.note)} ${CLOSED_BY_ACCEPTANCE_LABEL})` : "");
    res.json({ approval: saved, closedNotes: closing.length });
  });
});

/** موعد تسليم الفصل. حقلٌ واحد، بيد رئيس التسجيل وحده، يظهر لكل قسم. */
app.post("/api/approvals/deadline", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!canManageDeadline(req.user?.Role) && !isPowerUser(req)) { res.status(403).json({ error: "موعد التسليم يضعه رئيس التسجيل." }); return; }
  const termId = Number(req.body?.termId || 0);
  const deadline = String(req.body?.deadline || "").trim();
  if (!termId) { res.status(400).json({ error: "اختر الفصل أولاً." }); return; }
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) { res.status(400).json({ error: "التاريخ يُكتب هكذا: 2026-10-15" }); return; }
  const term = await Repository.getTermById(termId);
  if (!term) { res.status(404).json({ error: "الفصل غير موجود" }); return; }
  if (deadline && ((term as any).AdTermClosed === true || termHasEnded(term as any))) {
    res.status(409).json({ error: "انتهى هذا الفصل — لا يُوضع له موعد تسليم.", code: "term-closed" }); return;
  }
  /* تاريخٌ فارغ يرفع الموعد بدل أن يكتب قيمةً مستحيلة: رفعُ القيد قرارٌ وارد
     كما وضعُه، ولا ينبغي أن يُجبَر صاحبه على حيلة. */
  await Repository.setTermSubmissionDeadline(termId, deadline || undefined);
  res.locals.auditChanges = deadline ? `موعد تسليم الجداول: ${deadline}` : "رُفع موعد تسليم الجداول";
  res.json({ termId, deadline: deadline || null });
});

/**
 * تواريخ رحلة الطلبة للفصل: الرغبات، جولات التسجيل، إغلاق الطلبات.
 *
 * بيد رئيس التسجيل وحده كموعد التسليم، ومن اللوحة نفسها. الفحصُ هنا هو الفحصُ
 * الذي تعرضه الواجهة (checkStudentPhases)، فلا تَعِد الشاشةُ بتاريخٍ يرفضه
 * الخادم. وفارغٌ يرفع التواريخ كلها: رفعُ القيد قرارٌ وارد.
 */
app.post("/api/approvals/student-phases", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!canManageDeadline(req.user?.Role) && !isPowerUser(req)) { res.status(403).json({ error: "مواعيد الطلبة يضعها رئيس التسجيل." }); return; }
  const termId = Number(req.body?.termId || 0);
  if (!termId) { res.status(400).json({ error: "اختر الفصل أولاً." }); return; }
  const term = await Repository.getTermById(termId);
  if (!term) { res.status(404).json({ error: "الفصل غير موجود" }); return; }
  const incoming = req.body?.phases;
  if (incoming === null || incoming === undefined) {
    await Repository.setTermStudentPhases(termId, undefined);
    res.locals.auditChanges = "رُفعت مواعيد الطلبة";
    res.json({ termId, phases: null });
    return;
  }
  if ((term as any).AdTermClosed === true || termHasEnded(term as any)) {
    res.status(409).json({ error: "انتهى هذا الفصل — لا تُوضع له مواعيد طلبة.", code: "term-closed" }); return;
  }
  const checked = checkStudentPhases(incoming, { submissionDeadline: (term as any).AdTermSubmissionDeadline });
  if (!checked.ok) { res.status(400).json({ error: checked.issues[0].message, issues: checked.issues }); return; }
  if (!hasStudentPhases(checked.phases)) {
    await Repository.setTermStudentPhases(termId, undefined);
    res.locals.auditChanges = "رُفعت مواعيد الطلبة";
    res.json({ termId, phases: null });
    return;
  }
  const phases = { ...checked.phases, updatedAt: new Date().toISOString(), updatedBy: String(req.user?.Name || req.user?.Role || "") };
  await Repository.setTermStudentPhases(termId, phases);
  res.locals.auditChanges = `مواعيد الطلبة: رغبات ${phases.wishesOpen || "—"} ← ${phases.wishesClose || "—"} · ${countOf((phases.rounds || []).length, AR.round)} · إغلاق ${phases.requestsClose || "—"}`;
  res.json({ termId, phases });
});

/**
 * تمديدٌ لقسمٍ بعينه. ضغطتان من صندوق الوارد، بسببٍ يُحفظ ويُعرض.
 *
 * وفي نطاق مانحه وحده (R16)، ولا يسبق موعد الفصل: تمديدٌ يُقرّب الموعد ليس
 * تمديداً. ومنحُه يطوي طلبَ القسم إن كان.
 */
app.post("/api/approvals/extension", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!canManageDeadline(req.user?.Role) && !isPowerUser(req)) { res.status(403).json({ error: "التمديد يمنحه رئيس التسجيل." }); return; }
  const scope = approvalScopeFromBody(req, res); if (!scope) return;
  const { collegeId, sectionId, termId } = scope;
  const until = String(req.body?.until || "").trim();
  const reason = String(req.body?.reason || "").trim().slice(0, 240);
  if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) { res.status(400).json({ error: "التاريخ يُكتب هكذا: 2026-10-22" }); return; }
  if (await refuseIfTermClosed(res, termId)) return;
  const term = await Repository.getTermById(termId);
  const earlier = extensionRefusal(until, (term as any)?.AdTermSubmissionDeadline);
  if (earlier) { res.status(400).json({ error: earlier, code: "extension-before-deadline" }); return; }
  await approvalTransaction(res, collegeId, sectionId, termId, async () => {
    const approval = await readApproval(collegeId, sectionId, termId);
    const actor = approvalActor(req);
    /* الكتابةُ نفسُها التي يكتبها المسارُ الجماعي (submissionDeadlines). */
    let next: ScheduleApproval = until ? withException(approval, { until, reason, by: actor.name }) : withoutException(approval);
    next = withEvent(req, next, "extension", until ? `${until}${reason ? ` — ${reason}` : ""}` : "إلغاء التمديد");
    const saved = await Repository.saveScheduleApproval(next);
    const where = await approvalScopeLabel(collegeId, sectionId, termId);
    res.locals.auditChanges = until ? `تمديد تسليم ${where} إلى ${until}${reason ? ` — ${reason}` : ""}` : `إلغاء تمديد تسليم ${where}`;
    res.json({ approval: saved });
  });
});

app.post("/api/approvals/extensions", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!canManageDeadline(req.user?.Role) && !isPowerUser(req)) { res.status(403).json({ error: "الاستثناءاتُ يمنحها رئيس التسجيل." }); return; }
  const termId = Number(req.body?.termId || 0);
  const action = String(req.body?.action || "grant");
  if (!termId) { res.status(400).json({ error: "اختر الفصل أولاً." }); return; }
  if (!EXTENSION_ACTIONS.has(action)) { res.status(400).json({ error: "فعلٌ غير معروف." }); return; }
  const term = await Repository.getTermById(termId);
  if (!term) { res.status(404).json({ error: "الفصل غير موجود" }); return; }
  if ((term as any).AdTermClosed === true || termHasEnded(term as any)) {
    res.status(409).json({ error: "انتهى هذا الفصل — لا تُعدَّل مواعيدُ تسليمه.", code: "term-closed" }); return;
  }
  const termDeadline = String((term as any).AdTermSubmissionDeadline || "") || undefined;
  const reason = String(req.body?.reason || "").trim().slice(0, 240);
  const until = String(req.body?.until || "").trim();

  let amount: ExceptionAmount | undefined;
  if (action === "grant") {
    const refusal = exceptionRefusal({ termDeadline, amount: { days: req.body?.days, until: until || undefined }, reason });
    if (refusal) { res.status(400).json({ error: refusal, code: "exception-refused" }); return; }
    amount = until ? { until } : { days: normalizeExceptionDays(req.body?.days)! };
  } else if (action === "reject" && reason.length < 3) {
    res.status(400).json({ error: "اكتب سبب الرفض — يراه القسم.", code: "exception-refused" }); return;
  }

  /* ── النطاق: الكلُّ، أو كلية، أو أقسامٌ بأعيانها (resolveExceptionTargets) ── */
  const allowed = (collegeId: number, sectionId: number) => Boolean(req.user?.IsAdminUser) || isScopeAllowed(req, collegeId, sectionId);
  const resolved = resolveExceptionTargets(req.body?.scope, await Repository.getSections() as any[], allowed);
  if (resolved.error) { res.status(400).json({ error: resolved.error }); return; }
  if (resolved.targets.length > EXTENSIONS_MAX_TARGETS) { res.status(400).json({ error: "النطاقُ أوسع مما يُطبَّق دفعةً واحدة." }); return; }

  const actor = approvalActor(req);
  const results: Array<{ collegeId: number; sectionId: number; sectionName: string } & Omit<ExceptionOutcome, "event">> = [];
  for (const target of resolved.targets) {
    const { collegeId, sectionId, sectionName } = target;
    if (target.refusal) { results.push({ collegeId, sectionId, sectionName, ok: false, error: target.refusal }); continue; }
    let outcome: ExceptionOutcome = { ok: false };
    try {
      const written = await approvalTransaction(null, collegeId, sectionId, termId, async () => {
        /* يُقرأ السجلُّ داخل الطابور: الأيامُ تُعدّ من استثنائه الحاضر لا مما رأته الشاشة. */
        const approval = await readApproval(collegeId, sectionId, termId);
        const decision = decideException(approval, { action: action as ExceptionAction, termDeadline, amount, reason, by: actor.name });
        outcome = decision.outcome;
        if (!decision.next) return;
        const next = decision.outcome.event ? withEvent(req, decision.next, decision.outcome.event.action, decision.outcome.event.detail) : decision.next;
        await Repository.saveScheduleApproval(next);
      });
      if (written === "conflict") outcome = { ok: false, error: "سبقك قرارٌ آخر على هذا القسم في اللحظة نفسها — أعد المحاولة." };
    } catch (error) {
      console.error("[deadlines] تعذّر حفظُ استثناء:", error instanceof Error ? error.message : error);
      outcome = { ok: false, error: "تعذّر الحفظ لهذا القسم." };
    }
    const { event: _event, ...shown } = outcome;
    results.push({ collegeId, sectionId, sectionName, ...shown });
  }

  const applied = results.filter(row => row.ok && !row.unchanged).length;
  const failed = results.filter(row => !row.ok && !row.unchanged).length;
  const verb = action === "reject" ? "رفض طلب تمديد" : action === "remove" ? "رفع استثناء تسليم" : "استثناء تسليم";
  const termName = String((term as any).AdTermName || `فصل ${termId}`);
  res.locals.auditChanges = `${verb} — ${termName}: ${countOf(applied, AR.department)}`
    + (action === "grant" ? ` (${until ? until : `+${countOf(Number(req.body?.days), AR.day)}`})` : "")
    + (reason ? ` — ${reason}` : "")
    + (failed ? ` · تعذّر ${countOf(failed, AR.department)}` : "");
  res.json({ termId, termDeadline: termDeadline || null, action, applied, failed, results });
});

/**
 * ── طلبُ تمديد من القسم (R17) ──────────────────────────────────────────────
 *
 * القسمُ الذي يرى موعده يقترب كان لا يملك إلا الهاتف. فيطلب من شريطه بسببٍ
 * وعدد أيام، ويصل الطلبُ صندوقَ رئيس التسجيل بجانب زرّ «تمديد» مملوءاً.
 */
app.post("/api/approvals/extension-request", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const scope = approvalScopeFromBody(req, res); if (!scope) return;
  const { collegeId, sectionId, termId } = scope;
  if (!signatureStage(req.user?.Role)) { res.status(403).json({ error: "طلب التمديد من لجنة الجدول أو رئيس القسم." }); return; }
  if (await refuseIfTermClosed(res, termId)) return;
  const reason = String(req.body?.reason || "").trim().slice(0, 240);
  const days = Math.min(60, Math.max(1, Math.round(Number(req.body?.days || 7))));
  if (reason.length < 3) { res.status(400).json({ error: "اكتب سبب طلب التمديد." }); return; }
  await approvalTransaction(res, collegeId, sectionId, termId, async () => {
    const approval = await readApproval(collegeId, sectionId, termId);
    const deadline = await readDeadlineFor(approval, termId);
    /* القاعدةُ التي يُعرض بها الزرّ هي التي يُقبل بها الطلب: جدولٌ معتمدٌ أو
       عند التسجيل، أو موعدٌ بعيد، أو طلبٌ سابقٌ معلّق — كلٌّ يُردّ بسببه. */
    const refusal = extensionRequestRefusal(approval, deadline);
    if (refusal) { res.status(409).json({ error: refusal, code: "extension-request-refused" }); return; }
    const actor = approvalActor(req);
    let next: ScheduleApproval = {
      ...approval,
      extensionRequest: { by: actor.name, role: String(actor.role || ""), at: new Date().toISOString(), reason, days },
    };
    next = withEvent(req, next, "extension-request", `${countOf(days, AR.day)} — ${reason}`);
    const saved = await Repository.saveScheduleApproval(next);
    res.locals.auditChanges = `طلب تمديد تسليم ${await approvalScopeLabel(collegeId, sectionId, termId)} ${countOf(days, AR.day)}: ${reason}`;
    res.json({ approval: saved });
  });
});

app.get("/api/approvals/badge", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const terms = await Repository.getTerms();
  const explicit = Number(req.query.termId || 0);
  const termId = explicit || currentTermId(terms as any);
  if (!termId) { res.json({ count: 0 }); return; }
  const [current, planning] = await Promise.all([approvalBadgeForTerm(req, termId), explicit ? Promise.resolve(0) : bellPlanningTermId(terms as any[])]);
  if (!planning || planning === termId) { res.json(current); return; }
  const next = await approvalBadgeForTerm(req, planning);
  res.json({ count: current.count + next.count, kind: current.kind || next.kind, planningTermId: planning });
});

/** سطرُ قسمٍ في صندوق الوارد: حالته وموعده وملاحظاته وموانعه في نداءٍ واحد. */
app.get("/api/approvals/inbox", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const termId = Number(req.query.termId || 0);
  if (!termId) { res.status(400).json({ error: "اختر الفصل أولاً." }); return; }

  const [storedApprovals, term, colleges, sections] = await Promise.all([
    Repository.getScheduleApprovalsForTerm(termId),
    Repository.getTermById(termId),
    Repository.getColleges(),
    Repository.getSections(),
  ]);
  /* ما عُلّم بتعديلٍ ينتظر جولته يُصفّى قبل أن يُعرض (مراجعة 6) — نادر، فلا يُقرأ
     الفصلُ ثانيةً إلا إن وُجد. */
  const marked = storedApprovals.filter(row => row.amendmentPending);
  for (const row of marked) await settlePendingAmendment(Number(row.AdCollegeId), Number(row.AdSectionId), termId);
  const approvals = marked.length ? await Repository.getScheduleApprovalsForTerm(termId) : storedApprovals;
  const termDeadline = (term as any)?.AdTermSubmissionDeadline as string | undefined;
  /* «اليوم» بتوقيت الكويت، لا بالساعة العالمية (R15). */
  const now = new Date();
  const today = kuwaitDateISO(now);
  const collegeName = new Map(colleges.map((row: any) => [Number(row.AdCollegeId), String(row.AdCollegeName || "")]));
  const sectionName = new Map(sections.map((row: any) => [Number(row.AdSectionId), String(row.AdSectionName || "")]));

  /* الأقسام التي لم تبدأ الدورة بعد لا سجلَّ لها — وهي أهمّ ما يريد رئيس
     التسجيل أن يراه قرب الموعد. فتُبنى صفوفها هنا من سجلّ الأقسام نفسه، بدل
     أن يُكتب لكل قسمٍ في كل فصلٍ سجلٌّ يقول «لم يبدأ». */
  const started = new Set(approvals.map(row => `${row.AdCollegeId}:${row.AdSectionId}`));
  const silent = sections
    .filter((row: any) => !started.has(`${row.AdCollegeId}:${row.AdSectionId}`))
    .map((row: any) => emptyApproval(Number(row.AdCollegeId), Number(row.AdSectionId), termId));

  const visible = [...approvals, ...silent]
    .filter(row => req.user?.IsAdminUser || isScopeAllowed(req, Number(row.AdCollegeId), Number(row.AdSectionId)));

  /* ── ثلاث قراءات للفصل كله، لا ثلاثٌ لكل قسم ────────────────────────────
   *
   * هذه الشاشة تُفتح على كليةٍ فيها عشرون قسماً، عشرين مرّةً في اليوم. وسؤالُها
   * عن كل قسم ثلاثة: مواعيده، وموانعه، وملاحظاته. فلو سُئل قسماً قسماً لقُرئ
   * جدول الفصل كاملاً عشرين مرّة في كل فتحة.
   *
   * فيُقرأ الفصل كله ثلاث مرّات — مرّةً للمواعيد ومرّةً للملاحظات ومرّةً
   * للمقارنة — ثم يُوزَّع على الأقسام في الذاكرة. والعدد ثابتٌ مهما كثرت
   * الأقسام، وهو ما طُلب صراحةً: الأقسام كثيرة.
   */
  const [allTermRows, allNotes, blockerOptions] = await Promise.all([
    Repository.getSchedulesByScope({ termId }),
    Repository.getScheduleCommentsForTerm(termId),
    approvalBlockerOptions(),
  ]);
  const rowsByScope = new Map<string, any[]>();
  for (const row of allTermRows as any[]) {
    const key = `${Number(row.AdCollegeId)}:${Number(row.AdSectionId)}`;
    const list = rowsByScope.get(key);
    if (list) list.push(row); else rowsByScope.set(key, [row]);
  }
  /* حالةُ الملاحظة تُقاس بصفوف القسم نفسه، لا بصفوف الفصل كله.
   *
   * الصفُّ ينتقل بين الأقسام — تعديلُ الموعد يقبل قسماً جديداً — وملاحظتُه
   * تبقى منسوبةً إلى قسمها الأول. فلو قيست بصفوف الفصل لوُجد الصفُّ في قسمه
   * الجديد وقيل «تنتظر»، بينما تقول شاشةُ القسم وبوابةُ الإرسال «زال الصفّ».
   * وعدّادٌ في الوارد لا يملك القسمُ أن يُنزله هو أسوأ من عدّادٍ خاطئ.
   */
  const rowByIdForScope = (key: string) => {
    const map = new Map<number, any>();
    for (const row of rowsByScope.get(key) || []) map.set(Number(row.id), row);
    return map;
  };
  const notesByScope = new Map<string, any[]>();
  for (const note of allNotes) {
    const key = `${Number(note.AdCollegeId)}:${Number(note.AdSectionId)}`;
    const list = notesByScope.get(key);
    if (list) list.push(note); else notesByScope.set(key, [note]);
  }

  const rows = visible.map(approval => {
    const key = `${approval.AdCollegeId}:${approval.AdSectionId}`;
    const scheduleRows = rowsByScope.get(key) || [];
    const blocking = countBlockingConflicts(scheduleRows, allTermRows as any[], blockerOptions);
    const scopeRowById = rowByIdForScope(key);
    const notes = (notesByScope.get(key) || [])
      .filter(note => note.origin === "registrar" || note.origin === "department")
      .map(note => ({ ...note, state: noteState(note, scopeRowById.get(Number(note.scheduleId))) }));
    const deadline = readDeadline({ termDeadline, extensionUntil: approval.extensionUntil, extensionReason: approval.extensionReason }, now);
    return {
      collegeId: approval.AdCollegeId,
      sectionId: approval.AdSectionId,
      collegeName: collegeName.get(Number(approval.AdCollegeId)) || "",
      sectionName: sectionName.get(Number(approval.AdSectionId)) || "",
      status: approval.status,
      statusLabel: APPROVAL_STATUS_LABEL[approval.status],
      round: approval.currentRound,
      rowCount: scheduleRows.length,
      blockingConflicts: blocking,
      /* من العدّاد الواحد (R4): ملاحظاتُ التسجيل وحدها. ملاحظةُ رئيس القسم
         للجنته داخليةٌ لا تنتظر التسجيل ولا تُضخّم عدّاده. */
      openNotes: countOpenRegistrarNotes(notes),
      answeredNotes: countAnsweredRegistrarNotes(notes),
      pendingAdditions: additionsAwaitingHead(approval),
      deadline,
      /* طلبُ تمديدٍ من القسم، والتاريخُ الذي يُقترح لمنحه (R17). */
      extensionRequest: approval.extensionRequest,
      /* من منح الاستثناء ومتى — تُعرض في «مواعيد التسليم». */
      extensionBy: approval.extensionBy,
      extensionAt: approval.extensionAt,
      suggestedExtensionUntil: approval.extensionRequest
        ? suggestedExtensionDate(deadline.effective, approval.extensionRequest.days, today)
        : undefined,
      /* متأخّر: انقضى موعده ولم يُسلّم بعد. حالةٌ تُحسب ولا تُخزَّن، لأنها
         تتغيّر بمرور اليوم لا بفعل أحد. */
      late: isLate({ approvalStatus: approval.status, submittedRounds: approval.currentRound, deadline: termDeadline, extension: approval.extensionUntil }),
      priority: inboxPriority(approval, blocking),
      updatedAt: approval.updatedAt,
    };
  });

  rows.sort((a, b) => a.priority - b.priority
    || b.blockingConflicts - a.blockingConflicts
    || a.collegeName.localeCompare(b.collegeName, "ar")
    || a.sectionName.localeCompare(b.sectionName, "ar"));

  res.json({
    termDeadline,
    rows,
    totals: {
      waiting: rows.filter(row => row.status === "submitted").length,
      returned: rows.filter(row => row.status === "returned").length,
      accepted: rows.filter(row => row.status === "accepted").length,
      late: rows.filter(row => row.late).length,
    },
  });
});
}
