/**
 * ── طلباتُ الأساتذة (جهةُ المنسّق) ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { appendRequestThread, THREAD_TEXT_LIMIT, negotiationState, parseOfferedSlots } from "../../utils/instructorRequestThread";
import { RequestReservationConflict } from "../../utils/instructorRequestReservations";
import { Response } from "express";
import { randomUUID } from "crypto";
import { Repository, ScheduleRevisionConflict } from "../../db/repository";
import type { FSchedule, InstructorRequest, InstructorRequestItem, InstructorRequestEventKind } from "../../types";
import { latestRequestByInstructor, reissueMove, requestLinkNeedsReplacing } from "../../utils/requestReissue";
import { termLinkExpiresAt } from "../../utils/shareLinkLifetime";
import { normalizeInstructorDeadline, individualExceptionOpen } from "../../utils/instructorRequestWindows";
import { slotTimeGroups } from "../../utils/slotTimeGroups";
import { uniformPatternSlots } from "../../utils/requestMeetingLength";
import { effectiveCourseHours } from "../../utils/scheduleRegulations";
import { isFacultyPlaceholder } from "../../utils/placeholderInstructor";
import { awaitedItemIndexes } from "../../utils/linkedRequestItems";
import { roleLabel } from "../../utils/academicRoles";
import { requestItemFromRow } from "../../utils/instructorRequestItems";
import { requestFullySettled } from "../../utils/instructorRequestVerdict";
import { offeringStatesForTerm } from "../offeringStates";
import { pushHooks } from "../pushRoutes";
import { issueLinkMode, linkMode, linkModeLabel, taPhaseOwns } from "../../utils/linkMode";
import { notOpened } from "../../utils/requestParticipation";
import { offeringBadge } from "../../utils/courseOffering";
import { formatScheduleTimeRange } from "../../utils/scheduleTime";
import { noteScheduleMutation, refuseIfTermFrozen, scheduleLockRefusal } from "../core/approvals";
import { type AuthenticatedRequest, requirePermission } from "../core/auth";
import { buildRequestContext, buildSharedRequestContext, currentInstructorRequestGeneration, instructorRequestItemIdentity, judgeRequestItems, REQUEST_LINK_DAYS, requestItemScope, requestWindowOpen, requireInstructorRequestRevision } from "../core/instructorRequests";
import { broadcastNotify } from "../core/liveChannel";
import { canonicalizeHistoricalLocationForRuntime, readLocationRegistry } from "../core/locations";
import { scheduleLengthIssue } from "../core/scheduleRules";
import { createScheduleHandler, dayLabelOf, PROPOSAL_DAYS, runScheduleHandler, updateScheduleHandler } from "../core/scheduleWrites";
import { isScopeAllowed } from "../core/scope";
import { shareLinkStillReadable } from "../core/shareLinks";
import { placeholderInstructorIds } from "../core/smartImport";
import { liveStaffPublication, staffFamilyScopes, staffFamilyShareLinks } from "../core/staffCard";
import { captureScopeVersion, recordVersionAfter } from "../core/versions";

async function requireCurrentInstructorRequestGeneration(request: InstructorRequest, res: Response): Promise<boolean> {
  if (await Repository.isInstructorRequestInCurrentGeneration(request)) return true;
  res.status(410).json({ error: "أُغلقت هذه الجولة بعد استبدال الجدول. حدّث الوارد لعرض الجولة الحالية.", code: "request-schedule-replaced" });
  return false;
}

/**
 * يُجرّد الطلبَ ممّا لا يخصّ الأستاذ قبل أن يغادر الخادم.
 *
 * موضعٌ واحدٌ لهذا التجريد عن قصد: لو تكرّر في كل مسارٍ لنسيه أحدُها يوماً،
 * وكشفُ قاعةٍ خطأٌ لا يُكتشف بالنظر إلى الشاشة.
 */
/** Mutation replies obey the same item-scope boundary as the inbox listing. */
function requestForDepartment(req: AuthenticatedRequest, request: InstructorRequest) {
  const visible = (item: InstructorRequestItem) => {
    const scope = requestItemScope(request, item);
    return isScopeAllowed(req, scope.collegeId, scope.sectionId);
  };
  const allVisible = request.items.every(visible);
  return { ...request, signatureHistory: undefined, archivedItems: undefined,
    signature: request.signature ? { ...request.signature, signedItems: allVisible ? request.signature.signedItems : undefined } : undefined,
    notes: allVisible ? (request as any).notes : [],
    items: request.items.map(item => visible(item) ? item : ({
      rowId: item.action === "delete" || item.action === "change" ? item.rowId ?? null : null,
      action: item.action === "delete" || item.action === "change" ? item.action : "keep",
      slots: [], hidden: true, decision: item.decision?.state ? { state: item.decision.state } : undefined,
    } as InstructorRequestItem)),
  };
}

/* ══ تثبيتُ بندٍ في الجدول بنداءٍ واحد (ذرّي) ══════════════════════════════════
 *
 * كان التثبيتُ خطوتين من الشاشة: حفظٌ عبر `/api/schedules` ثم تسجيلُ القرار. وما
 * بينهما فجوة: انقطاعٌ يترك صفّاً بلا قرار، وسلسلةُ بنودٍ مترابطة تُنقل نصفَها.
 *
 * هنا الخطوتان واحدة، والبنودُ المترابطة (`after`: ما يُفرغ وقتَ هذا البند) معه:
 *   1. يُبنى أسبوعُ الفصل كما سيصير بعد كل البنود، ويُفحص كلُّ صفٍّ عليه فحصاً جافّاً
 *      بالمسار نفسه الذي تمرّ منه ورشة الجدول (نطاق، قفل، تعارض قاعةٍ وأستاذٍ ودفعة).
 *      فلا يُكتب شيءٌ إن تعذّر شيء.
 *   2. تُفحص الإصدارات والتعارضات الحية داخل معاملة قاعدة البيانات.
 *   3. تُكتب كل المواعيد والقرارات وفك الحجوزات معاً، أو لا يُكتب شيء.
 * والبندُ بأوقاتٍ مختلفة بين الأيام يصير صفّاً لكل وقت، لا وقتَ الأول على الكل.
 * وختمُ الإصدار (`revs`) يمنع الكتابة فوق تعديلِ زميلٍ وقع بعد أن فُتحت الشاشة.
 * و`preview` يُرجع الخطة والتنبيهات بلا كتابة.
 */
type ApplyOp =
  | { kind: "update"; itemIndex: number; rowId: number; body: any; original: any; tempId?: undefined }
  | { kind: "create"; itemIndex: number; body: any; tempId: number }
  | { kind: "delete"; itemIndex: number; rowId: number; original: any; tempId?: undefined };

const daysFlags = (days: string[]) => Object.fromEntries(PROPOSAL_DAYS.map(key => [key, days.includes(key)]));
const rowBodyOf = (row: any) => ({
  AdCollegeId: row.AdCollegeId, AdSectionId: row.AdSectionId, AdTermId: row.AdTermId, AdCourseId: row.AdCourseId,
  SCode: row.SCode, AdInstructorId: row.AdInstructorId,
  fsunday: !!row.fsunday, fmonday: !!row.fmonday, ftuesday: !!row.ftuesday, fwednesday: !!row.fwednesday, fthursday: !!row.fthursday,
  fstarttime: row.fstarttime, fendtime: row.fendtime,
  AdRoomCode: row.AdRoomCode, AdRoomHall: row.AdRoomHall,
  buildingId: row.buildingId, roomId: row.roomId, locationStatus: row.locationStatus,
  sourceBuildingText: row.sourceBuildingText, sourceRoomText: row.sourceRoomText,
  companionRoomId: row.companionRoomId, companionRoomLabel: row.companionRoomLabel,
});

export function registerInstructorRequestsRoutes(app: Express): void {

/* ── إصدارُ الروابط ──────────────────────────────────────────────────────── */

app.post("/api/instructor-requests/issue", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.body?.collegeId || 0);
  const sectionId = Number(req.body?.sectionId || 0);
  const termId = Number(req.body?.termId || 0);
  /* وجود instructorId يعني استثناءً شخصياً، لا إصداراً جماعياً. */
  const individualOnly = req.body?.instructorId != null;
  const reopening = req.body?.reopen === true;
  const selectedInstructorId = individualOnly ? Number(req.body.instructorId) : 0;
  const emergencyReason = String(req.body?.reason || "").trim().slice(0, 400);
  /* E1: صفةُ الإرسال (👁️ للعرض · ✏️ طلب تعديل) تُكتب على طلب كل أستاذ — `linkMode`، المصدرُ الواحد.
     و🎓 مرحلةُ التدريب لا تُفتح من هنا: لها مسارُها (/api/ta-phase/open) بموجاته ومقرّراته المسموحة. */
  const issueMode = issueLinkMode(req.body?.mode);
  if (!issueMode) { res.status(400).json({ error: "مرحلة التدريب تُفتح من لوحتها في النشر، لا من إرسال بطاقة الأستاذ." }); return; }
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "اختر الكلية والقسم والفصل." }); return; }
  if (individualOnly && (!Number.isSafeInteger(selectedInstructorId) || selectedInstructorId <= 0 || !emergencyReason)) {
    res.status(400).json({ error: "اختر أستاذاً واكتب سبب إعادة فتح التعديل له." }); return;
  }
  if (await refuseIfTermFrozen(res, termId)) return;
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "هذا القسم خارج نطاقك." }); return; }
  /* ── ولا تُفتح دورةٌ على فصلٍ لا تُغلق فيها ──────────────────────────────
   *
   * الرابطُ يُرسل إلى عشرين أستاذاً، فيفتحونه ويكتبون رغباتهم ويرسلونها —
   * ثم لا يستطيع القسمُ تثبيتَ شيءٍ منها، لأن الجدولَ مجمَّد. فيقف الجميعُ
   * ينتظرون قراراً لا يمكن أن يقع، وهو أسوأُ من بابٍ لا يُفتح.
   *
   * والحارسُ هو نفسُه الذي يحرس الجدول، فلا قاعدةَ ثانيةٌ تفترق عنه. */
  const issueLock = await scheduleLockRefusal(req, collegeId, sectionId, termId, { registrarLock: false });
  if (issueLock) { res.status(409).json({ error: issueLock, code: "schedule-locked" }); return; }

  const closesAt = String(req.body?.closesAt || "").trim();
  const windowClosesAt = normalizeInstructorDeadline(closesAt);
  if (!windowClosesAt) {
    res.status(400).json({ error: "اختر تاريخاً ووقتاً صحيحين لإغلاق الطلبات بتوقيت الكويت." });
    return;
  }
  /* نافذةٌ انتهت قبل أن تبدأ ليست نافذة: الأساتذة يفتحون رابطاً مغلقاً ولا
     يعرفون لماذا، ويتّصلون بالقسم — وهو ما بُني الرابطُ ليُغنيَ عنه. */
  if (Date.parse(windowClosesAt) < Date.now()) {
    res.status(400).json({ error: "تاريخ الإغلاق في الماضي." });
    return;
  }
  const opensAt = new Date().toISOString();
  const source = req.body?.source === "previous-term" ? "previous-term" : "draft";

  /* المصدر: جدولُ هذا الفصل حين يكون منسوخاً، وجدولُ الفصل السابق حين يُرسَل
     الرابطُ قبل النسخ. الصفحةُ واحدةٌ والمصدرُ يختلف، ويُقال للأستاذ أيُّهما. */
  const sourceTermId = source === "previous-term"
    ? Number(req.body?.previousTermId || 0) || termId
    : termId;
  /* إصدارٌ واحدٌ لكل أستاذ في عائلة القسم (بنين/بنات/الفحيحيل وغيرها).
     جدولُ الأستاذ المطلوب يبقى شاملاً لمحاضراته عبر الكليات كالسابق. */
  const family = await staffFamilyScopes(collegeId, sectionId);
  const [familyRows, courses, familyRequests, sourceTermRows, colleges, issueTerms, instructors] = await Promise.all([
    Promise.all(family.map(scope => Repository.getSchedulesByScope({
      collegeId: scope.collegeId, sectionId: scope.sectionId, termId: sourceTermId,
    }))),
    Repository.getCourses(),
    Promise.all(family.map(scope =>
      Repository.getInstructorRequests(scope.collegeId, scope.sectionId, termId))),
    Repository.getSchedulesByScope({ termId: sourceTermId }),
    Repository.getColleges(),
    Repository.getTerms(),
    Repository.getInstructors(),
  ]);
  const rows = familyRows.flat();
  const existing = await currentInstructorRequestGeneration(familyRequests.flat());
  const issueTerm = issueTerms.find(row => Number(row.AdTermId) === termId);
  const courseName = new Map((courses as any[]).map(row => [Number(row.AdCourseId), String(row.CourseName || "")]));
  const collegeNameById = new Map((colleges as any[]).map(row => [Number(row.AdCollegeId), String(row.AdCollegeName || "")]));
  /* من يُصدَر له رابطٌ يحدّده جدولُ هذا القسم؛ وما في طلبه جدولُه كلُّه. */
  const termRowsOf = (instructorId: number) => (sourceTermRows as any[])
    .filter(row => Number(row.AdInstructorId) === instructorId);
  /* الأحدثُ لكل أستاذ: القراءةُ مرتّبةٌ من الأحدث، فكان `new Map` يُبقي آخرَ ما
     يمرّ عليه — أي الأقدم — فيحكم طلبٌ قديمٌ على الجديد. */
  const already = latestRequestByInstructor(existing);
  /* الطلبُ الذي قدّمه الأستاذ يسبق طلباً فارغاً أُنشئ في موقعٍ شقيق. */
  if (!individualOnly && !reopening) for (const [instructorId, request] of latestRequestByInstructor(existing.filter(row =>
    row.status === "submitted" || row.status === "in-review"))) already.set(instructorId, request);

  const byInstructor = new Map<number, any[]>();
  /* «هيئة تدريسية» اسمٌ لا شخص: لا يُصدَر لها رابطُ طلب (كانت تظهر في الوارد أستاذاً، مرّةً لكل سجلّ — N1). */
  const placeholderIds = placeholderInstructorIds(instructors as any[]);
  for (const row of rows as any[]) {
    const id = Number(row.AdInstructorId || 0);
    if (!id || placeholderIds.has(id)) continue;
    const list = byInstructor.get(id);
    if (list) list.push(row); else byInstructor.set(id, [row]);
  }

  /* ── فصلٌ فارغ لا يُقال عنه «فُتحت الطلبات» ─────────────────────────────
   * جدولٌ بلا صفوف — أو بصفوفٍ لم يُسنَد أيٌّ منها لأستاذ — لا يُصدَر فيه
   * رابطٌ لأحد. كان الردّ نجاحاً فارغاً، فتقول الشاشة إن الطلبات فُتحت ولم
   * يصل شيءٌ لأحد. فيُقال ذلك صراحةً، ويُسمّى السبب. */
  if (!byInstructor.size) {
    res.json({ issued: [], total: 0, fresh: 0, emptyTerm: true, reason: (rows as any[]).length ? "no-instructors" : "no-rows" });
    return;
  }
  /* الاستثناء الفردي لا يُنشئ طلبات لزملاء الأستاذ ولا يفتح العائلة كلها.
     ولا يجوز منح الصلاحية لهوية «هيئة تدريسية» الافتراضية. */
  const person = individualOnly ? (instructors as any[]).find(row => Number(row.AdInstructorId) === selectedInstructorId) : null;
  if (individualOnly && (!byInstructor.has(selectedInstructorId) || !person || isFacultyPlaceholder(person))) {
    res.status(404).json({ error: "الأستاذ غير موجود في جدول هذه العائلة والفصل." }); return;
  }
  const publishedStaff = (await staffFamilyShareLinks(collegeId, sectionId, termId)).find(liveStaffPublication);
  if (individualOnly && !publishedStaff) {
    res.status(409).json({ error: "انشر بطاقة الأستاذ أولاً؛ لا يُفتح استثناء دون بطاقة فعالة." }); return;
  }
  const baseCloseAt = individualOnly
    ? (publishedStaff?.requestsCloseAt || new Date(Date.now() - 1000).toISOString())
    : windowClosesAt;
  const exceptional = individualOnly ? {
    opensAt, closesAt: windowClosesAt, grantedAt: opensAt,
    grantedBy: String(req.user?.Name || req.user?.UserName || "القسم"),
    reason: emergencyReason,
  } : undefined;
  const mintRequestLink = (instructorId: number) => Repository.createShareLink({
    AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId,
    label: `طلب جدول — ${instructorId}`,
    /* ── الصلاحيةُ تتبع الموعدَ المُعلَن ────────────────────────────────
     * كانت ثابتةً بـ21 يوماً والموعدُ يُكتب بحرّية. فمن كتب موعداً أبعدَ
     * منها رأى أساتذتُه «انتهت صلاحية هذا الرابط» قبل الموعد الذي وعدهم
     * به — ولا شيءَ في الشاشة يقول لماذا. فتُشتقّ من الموعد نفسِه، ولا
     * تنزل عن الحدّ الأدنى حتى لا يُغلق رابطُ موعدٍ قريبٍ لحظةَ انتهائه. */
    /* والقراءةُ تبقى حتى نهاية الفصل: قرارُ القسم وبدائلُه يصلان بعد الموعد،
     * ورابطٌ يموت بعد يومٍ من الإغلاق يُخفي عن الأستاذ جوابَ ما طلبه. */
    expiresAt: new Date(Math.max(
      Date.parse(windowClosesAt) + 86400000,
      Date.now() + REQUEST_LINK_DAYS * 86400000,
      Date.parse(termLinkExpiresAt(issueTerm)),
    )).toISOString(),
    SystemUserId: Number(req.user?.SystemUserId || 0),
    userName: String(req.user?.UserName || ""),
    showInstructors: false,
    kind: "request",
    AdInstructorId: instructorId,
  } as any);

  /* `reissued`: ينتظر قرارَ القسم فلم يُمسّ. `renewed`: طلبُه القائم أخذ الموعدَ الجديد. */
  const issued: Array<{ instructorId: number; linkId: string; reissued: boolean; renewed?: boolean }> = [];
  for (const [instructorId, own] of byInstructor) {
    if (individualOnly && instructorId !== selectedInstructorId) continue;
    /* أستاذٌ له طلبٌ في هذا الفصل لا يُعطى ثانياً: طلبان يعنيان أن أحدهما
       سيُقرأ ويُهمل الآخر بلا أن يعرف صاحبُه. لكن طلباً مات موعدُه أو رابطُه
       لا يبقى «طلبَه» — يتبع الموعدَ الجديد (src/utils/requestReissue.ts). */
    const held = already.get(instructorId);
    const move = reissueMove(held);
    /* F3: بطاقةُ مرحلة التدريب القائمة لا يمسّها النشرُ الجماعي — تحكمها مرحلتُها. */
    if (held && move !== "fresh" && taPhaseOwns(held, individualOnly)) {
      issued.push({ instructorId, linkId: held.linkId, reissued: true });
      continue;
    }
    if (held && move === "keep" && !individualOnly && !reopening) {
      /* طلبُه ورابطُه كما هما ينتظران قرارَ القسم؛ وصفةُ الإرسال الجديدة هي ما يحكم بطاقتَه (E1).
         تُكتب الصفةُ وحدها، لا الطلبُ كلُّه: قرارٌ أو ردٌّ يصل بين القراءة والكتابة لا يُمحى. */
      if (linkMode(held) !== issueMode) await Repository.setInstructorRequestLinkMode(held.id, issueMode);
      issued.push({ instructorId, linkId: held.linkId, reissued: true });
      continue;
    }
    if (held && move === "extend") {
      const heldLink = await Repository.getShareLink(held.linkId);
      const readable = heldLink ? await shareLinkStillReadable(heldLink) : false;
      let linkId = held.linkId;
      if (requestLinkNeedsReplacing(heldLink, readable, Date.parse(windowClosesAt) + 86400000)) {
        linkId = (await mintRequestLink(instructorId)).id;
        if (heldLink && !heldLink.revoked) await Repository.revokeShareLink(heldLink.id);
      }
      const startsLater = Date.parse(held.window?.opensAt || "") > Date.now();
      await Repository.saveInstructorRequest({
        ...held,
        linkId,
        linkMode: issueMode,
        window: individualOnly ? held.window : { opensAt: startsLater ? opensAt : held.window?.opensAt || opensAt, closesAt: windowClosesAt },
        ...(individualOnly ? { individualException: exceptional } : {}),
      });
      issued.push({ instructorId, linkId, reissued: false, renewed: true });
      continue;
    }
    const link = await mintRequestLink(instructorId);

    await Repository.createInstructorRequest({
      AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId,
      AdInstructorId: instructorId,
      linkId: link.id,
      linkMode: issueMode,
      window: { opensAt, closesAt: baseCloseAt },
      ...(individualOnly ? { individualException: exceptional } : {}),
      source,
      status: "sent",
      items: (termRowsOf(instructorId).length ? termRowsOf(instructorId) : own).map(row =>
        requestItemFromRow(row, courseName.get(Number(row.AdCourseId)) || String(row.AdCourseName || ""), collegeNameById)),
      timeline: [{ kind: "link-created", at: opensAt, by: "القسم", ...(individualOnly ? { detail: "استثناء فردي لظرف طارئ" } : {}) }],
    });
    issued.push({ instructorId, linkId: link.id, reissued: false });
  }
  if (!individualOnly) {
    /* إعادة فتح الجميع تغيّر الموعد العام فقط؛ تبقى الروابط الشخصية نفسها.
       الاستثناء الفردي محفوظ منفصلاً فلا تفسده إعادة فتح دورة جماعية. */
    const shared = await staffFamilyShareLinks(collegeId, sectionId, termId);
    await Promise.all(shared.filter(link => !link.revoked && Date.parse(link.expiresAt) > Date.now())
      .map(link => Repository.setShareLinkRequestsCloseAt(link.id, windowClosesAt)));
  }
  res.locals.auditChanges = (individualOnly
    ? `فتح تعديل استثنائي للأستاذ ${String(person?.AdInstructorName || selectedInstructorId)} حتى ${windowClosesAt} — ${emergencyReason}`
    : `إعادة فتح استقبال طلبات الأساتذة لعائلة القسم حتى ${windowClosesAt}`) + ` · ${linkModeLabel(issueMode)}`;
  await Repository.saveFeatureDoc("linkModeLog", `${collegeId}:${sectionId}:${termId}:${Date.now()}`, {
    at: new Date().toISOString(), by: String(req.user?.Name || req.user?.UserName || ""), mode: issueMode,
    scope: `${collegeId}:${sectionId}:${termId}`, instructorIds: issued.map(row => row.instructorId), single: individualOnly,
  }).catch(() => undefined);
  res.json({ issued, total: issued.length, fresh: issued.filter(row => !row.reissued && !row.renewed).length });
});

/** قائمة الاستثناءات تُقرأ بإذن القسم، وبلا أرقام مدنية أو روابط شخصية. */
app.get("/api/instructor-requests/exceptions", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0), sectionId = Number(req.query.sectionId || 0), termId = Number(req.query.termId || 0);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) {
    res.status(403).json({ error: "خارج نطاق القسم والفصل." }); return;
  }
  const family = await staffFamilyScopes(collegeId, sectionId);
  const [groups, instructors] = await Promise.all([
    Promise.all(family.map(scope => Repository.getInstructorRequests(scope.collegeId, scope.sectionId, termId))),
    Repository.getInstructors(),
  ]);
  const current = await currentInstructorRequestGeneration(groups.flat());
  const names = new Map(instructors.map(row => [Number(row.AdInstructorId), String(row.AdInstructorName || "")]));
  const latest = latestRequestByInstructor(current);
  res.setHeader("Cache-Control", "no-store");
  res.json([...latest.values()].filter(row => Boolean(row.individualException)).map(row => ({
    instructorId: Number(row.AdInstructorId), name: names.get(Number(row.AdInstructorId)) || "أستاذ",
    closesAt: row.individualException!.closesAt, grantedAt: row.individualException!.grantedAt,
    reason: row.individualException!.reason, revokedAt: row.individualException!.revokedAt || "",
    active: individualExceptionOpen(row.individualException) && requestWindowOpen(row),
  })).sort((a, b) => Number(b.active) - Number(a.active)));
});

/** إلغاءُ استثناءٍ واحدٍ فوراً دون إلغاء بطاقة الأستاذ أو تغيير بقية الطلبات. */
app.post("/api/instructor-requests/exception/revoke", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.body?.collegeId || 0), sectionId = Number(req.body?.sectionId || 0);
  const termId = Number(req.body?.termId || 0), instructorId = Number(req.body?.instructorId || 0);
  if (!collegeId || !sectionId || !termId || !Number.isSafeInteger(instructorId) || instructorId <= 0) {
    res.status(400).json({ error: "حدد القسم والفصل والأستاذ." }); return;
  }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج نطاق القسم." }); return; }
  /* سحبُ صلاحية لا يمسّ الجدول، فيُسمح به حتى لو صار الفصل مجمداً. */
  const family = await staffFamilyScopes(collegeId, sectionId);
  const requests = await currentInstructorRequestGeneration((await Promise.all(
    family.map(scope => Repository.getInstructorRequests(scope.collegeId, scope.sectionId, termId)))).flat());
  const latest = latestRequestByInstructor(requests.filter(row => Number(row.AdInstructorId) === instructorId)).get(instructorId);
  if (!latest?.individualException || !individualExceptionOpen(latest.individualException)) {
    res.status(409).json({ error: "لا يوجد استثناء نشط لهذا الأستاذ." }); return;
  }
  const now = new Date().toISOString();
  await Repository.saveInstructorRequest({
    ...latest,
    individualException: { ...latest.individualException, revokedAt: now, revokedBy: String(req.user?.Name || req.user?.UserName || "القسم") },
  });
  res.locals.auditChanges = `إغلاق استثناء تعديل الجدول للأستاذ ${instructorId} قبل موعده`;
  res.json({ ok: true, revokedAt: now });
});

/* ── وارِدُ القسم ────────────────────────────────────────────────────────── */

app.get("/api/instructor-requests", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0);
  const sectionId = Number(req.query.sectionId || 0);
  const termId = Number(req.query.termId || 0);
  if (!collegeId || !termId) { res.status(400).json({ error: "اختر الكلية والفصل." }); return; }
  /* القسمُ اختياري: بلا قسمٍ يُعرض واردُ أقسام الكلية كلها — لكن لا يُعرض
     منه إلا ما يقع في نطاق الحساب. isScopeAllowed بقسمٍ صفر يقول «له شيءٌ في
     هذه الكلية»، لا «له الكلية كلها»، فيُصفّى كلُّ طلبٍ بقسمه بعدها. */
  if (!isScopeAllowed(req, collegeId, sectionId)) {
    res.status(403).json({ error: sectionId ? "هذا القسم خارج نطاقك." : "هذه الكلية خارج نطاقك." });
    return;
  }

  /* الطلباتُ تُقرأ للفصل كلِّه: طلبٌ أصدرته كليةٌ أخرى قد يحمل بنداً على
     محاضرةٍ في هذه الكلية، لأن الأستاذ يرى جدولَه كلَّه. ثم يُصفّى كلُّ بندٍ
     بموقعه هو، لا بموقع الرابط. */
  const [storedAll, instructors, scopeRowsAll, sections, colleges] = await Promise.all([
    Repository.getInstructorRequests(0, 0, termId),
    Repository.getInstructors(),
    Repository.getSchedulesByScope({ termId }),
    Repository.getSections(),
    Repository.getColleges(),
  ]);
  /* تجمع الرغبات حسب عائلة القسم عبر مواقع وكليات بنين/بنات والجهراء؛ رمز
     القسم الأكاديمي هو هوية العائلة، أما الفرع الجغرافي وحده فضيقٌ على هذا
     الوارد. ونظلّ نفلتر كل نطاق بصلاحيات المستخدم قبل إظهار أي طلب. */
  const baseSection = (sections as any[]).find(row => Number(row.AdSectionId) === sectionId);
  const familyCode = String(baseSection?.AdSectionCode || "").trim().toLocaleLowerCase();
  const familySectionIds = new Set((sections as any[]).filter(row =>
    familyCode && String(row.AdSectionCode || "").trim().toLocaleLowerCase() === familyCode,
  ).map(row => Number(row.AdSectionId)));
  familySectionIds.add(sectionId);
  const familyCollegeBySection = new Map((sections as any[]).filter(row => familySectionIds.has(Number(row.AdSectionId)))
    .map(row => [Number(row.AdSectionId), Number(row.AdCollegeId)]));
  const collegeNameOf = new Map((colleges as any[]).map(row => [Number(row.AdCollegeId), String(row.AdCollegeName || "")]));
  /* في المختار، وفي نطاق الحساب — قسماً قسماً حين يُترك القسمُ فارغاً. */
  const inSelection = (scope: { collegeId: number; sectionId: number }) =>
    (!sectionId || (familySectionIds.has(scope.sectionId) && familyCollegeBySection.get(scope.sectionId) === scope.collegeId))
    && (!sectionId || isScopeAllowed(req, scope.collegeId, Number(scope.sectionId) || -1))
    && (sectionId || scope.collegeId === collegeId)
    && isScopeAllowed(req, scope.collegeId, Number(scope.sectionId) || -1);
  const inScope = (rowCollegeId: number, rowSectionId: number) =>
    inSelection({ collegeId: rowCollegeId, sectionId: Number(rowSectionId) });
  /* بندٌ خارج المختار يُستبدل بمكانٍ فارغ لا تفاصيلَ فيه: يبقى ترقيمُ البنود
     كما هو — فالقرارُ يُرسل برقم بنده — ولا يصل هذه الشاشةَ مقرّرٌ ولا وقتٌ
     ولا قاعةٌ من كليةٍ أو قسمٍ آخر. */
  /* ويبقى من البند المخفيّ ما يلزم لفهم الترتيب وحده: أنه حذفٌ أو نقلٌ لصفٍّ
     برقمه، وهل قُرّر. فإضافةٌ هنا تعتمد على حذفٍ هناك تُقال بذلك — ولا يصل
     مقرّرٌ ولا وقتٌ ولا قاعة. */
  const hiddenItem = (item?: InstructorRequestItem): InstructorRequestItem => ({
    rowId: item && (item.action === "delete" || item.action === "change") ? item.rowId ?? null : null,
    action: item && (item.action === "delete" || item.action === "change") ? item.action : "keep",
    slots: [],
    hidden: true,
    decision: item?.decision?.state ? { state: item.decision.state } : undefined,
  } as any);
  const currentGenerationIds = new Set((await currentInstructorRequestGeneration(storedAll)).map(request => request.id));
  const placeholderPeople = placeholderInstructorIds(instructors as any[]);
  const stored = storedAll.filter(request => currentGenerationIds.has(request.id) && request.status !== "superseded" && !placeholderPeople.has(Number(request.AdInstructorId)) && (
    inScope(Number(request.AdCollegeId), Number(request.AdSectionId))
    || (request.items || []).some(item => item.action !== "keep" && inSelection(requestItemScope(request, item)))));
  const scopeRows = (scopeRowsAll as any[]).filter(row => inScope(Number(row.AdCollegeId ?? collegeId), Number(row.AdSectionId)));
  const sectionNameOf = new Map((sections as any[]).map(row => [Number(row.AdSectionId), String(row.AdSectionName || "")]));
  const nameOf = new Map((instructors as any[]).map(row => [Number(row.AdInstructorId), String(row.AdInstructorName || "")]));
  const mobileOf = new Map((instructors as any[]).map(row => [Number(row.AdInstructorId), String(row.AdInstructorMobile || "")]));

  /* السياقُ لا يعتمد على الأستاذ بل على الفصل والكلية والقسم: يُبنى مرةً لكل نطاق، لا مرةً لكل طلب (٣٤٠ طلباً كانت تقرأ الفصلَ ٣٤٠ مرة). */
  const contexts = new Map<string, Promise<Awaited<ReturnType<typeof buildRequestContext>>>>();
  const sharedRules = new Map<string, any>();
  const judged = await Promise.all(stored.map(row => {
    const key = `${row.AdTermId}:${row.AdCollegeId}:${row.AdSectionId}`;
    if (!contexts.has(key)) contexts.set(key, buildSharedRequestContext(row));
    return contexts.get(key)!.then(context => judgeRequestItems(row, { forDepartment: true, context, rulesCache: sharedRules }));
  }));
  const scopeRowsById = new Map((scopeRowsAll as any[]).map(row => [Number(row.id), row] as [number, any]));
  const rows = judged.map(full => {
    /* حذفٌ هنا ينتظره قسمٌ آخر ليُكمل الطلب: يُقال ذلك على البند، بلا تفاصيل
       ذلك القسم. */
    const awaited = awaitedItemIndexes(full.items || [], scopeRowsById, item => requestItemScope(full, item));
    const request = {
      ...full,
      signature: full.signature ? { ...full.signature, signedItems: full.items.every(item => inSelection(requestItemScope(full, item))) ? full.signature.signedItems : undefined } : undefined,
      signatureHistory: undefined,
    archivedItems: undefined,
      items: (full.items || []).map((item, index) => inSelection(requestItemScope(full, item))
        ? (awaited.has(index) ? { ...item, awaitedElsewhere: true } : item)
        : hiddenItem(item)),
    };
    /* القسمُ الذي يُعرض على البطاقة هو قسمُ ما يُرى منها، لا قسمُ الرابط. */
    const shownSections = [...new Set((request.items || [])
      .filter(item => item.action !== "keep")
      .map(item => requestItemScope(full, item).sectionId))];
    return {
    ...request,
    instructorName: nameOf.get(Number(request.AdInstructorId)) || `أستاذ ${request.AdInstructorId}`,
    instructorMobile: mobileOf.get(Number(request.AdInstructorId)) || "",
    requestCollegeName: collegeNameOf.get(Number(request.AdCollegeId)) || "كلية أخرى",
    sectionName: (shownSections.length ? shownSections : [Number(request.AdSectionId)])
      .map(id => sectionNameOf.get(id) || "").filter(Boolean).join(" · "),
    /* البنودُ التي تحمل قراراً هي ما يُنظر إليه؛ وما أبقاه الأستاذ كما هو
       يُعدّ ولا يُفتح. */
    changedCount: (request.items || []).filter(item => item.action !== "keep" && !(item as any).hidden).length,
    };
  });

  const totals = {
    sent: rows.length,
    answered: rows.filter(row => row.status !== "sent").length,
    unchanged: rows.filter(row => row.status !== "sent" && row.changedCount === 0).length,
    changed: rows.filter(row => row.changedCount > 0).length,
    /* رابطُ «العرض فقط» لا ينتظر جواباً: لا يُعدّ «لم يفتح» (D2). */
    unopened: notOpened(rows).length,
    settled: rows.filter(row => row.status === "settled").length,
  };

  /* الصفوفُ الحاليّة تُرسل كاملةً مع الوارد، لا ليُعرض منها شيء، بل ليبني
     الزرُّ «ثبّت» حمولةَ الحفظ من الصفّ الحقيقي ثم يغيّر فيه اليومَ والوقت
     وحدَهما. والحفظُ بعدها هو مسارُ `/api/schedules` نفسه بكل تحقّقه وتدقيقه
     وتقريرِ تغييراته — فلا يُكتب في الجدول من هنا، ولا يُعاد بناءُ صفٍّ من
     لقطةٍ نصّية قد تكون شاخت. */
  res.setHeader("Cache-Control", "no-store");
  const familyScopes = [...familyCollegeBySection.entries()].filter(([sid, cid]) => isScopeAllowed(req, cid, sid))
    .map(([sectionId, collegeId]) => ({ sectionId, collegeId, collegeName: collegeNameOf.get(collegeId) || `كلية ${collegeId}` }));
  const familyColleges = [...new Set(familyScopes.map(scope => scope.collegeId))].map(id => ({ id, name: collegeNameOf.get(id) || `كلية ${id}` }));
  /* C5: بندٌ يضيف مقرراً 🔒/🌱/🎯 يحمل شارته في الوارد — المصدرُ نفسه الذي يحكم الكرت. */
  const inboxStates = await offeringStatesForTerm(termId);
  if (inboxStates.size) for (const row of rows as any[]) for (const item of row.items || []) {
    const badge = item.action === "add" ? offeringBadge(inboxStates, Number(item.after?.courseId || 0)) : null;
    if (badge) item.offering = badge;
  }
  res.json({ rows, totals, currentRows: scopeRows, familyColleges, familyScopes });
});
app.post("/api/instructor-requests/:id/decide", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const stored = await Repository.getInstructorRequest(String(req.params.id || ""));
  if (!stored) { res.status(404).json({ error: "لا يوجد طلبٌ بهذا المعرّف" }); return; }
  if (!(await requireCurrentInstructorRequestGeneration(stored, res))) return;
  if (!requireInstructorRequestRevision(req, res, stored)) return;
  if (await refuseIfTermFrozen(res, Number(stored.AdTermId || 0))) return;

  const index = Number(req.body?.itemIndex);
  const item = (stored.items || [])[index];
  if (!item) { res.status(400).json({ error: "لا يوجد بندٌ بهذا الرقم في الطلب" }); return; }
  /* بندٌ ثُبّت كُتب في الجدول: إعادةُ الفصل فيه (نقرةٌ مزدوجة أو تبويبٌ قديم) كانت
     تُنشئ صفّاً ثانياً للإضافة، أو تكتب «رُفض» والجدولُ ما زال منقولاً. */
  if (item.decision?.state === "fixed") {
    res.status(409).json({ error: "سبق تثبيت هذا البند في الجدول.", code: "already-fixed" });
    return;
  }

  /* النطاقُ نطاقُ البند لا نطاقُ الرابط: محاضرةُ الأستاذ في كليةٍ أخرى يقرّر
     فيها منسّقُ تلك الكلية، لا منسّقُ الكلية التي أصدرت الرابط. */
  const itemScope = requestItemScope(stored, item);
  if (!isScopeAllowed(req, itemScope.collegeId, itemScope.sectionId)) {
    res.status(403).json({ error: "هذا القسم خارج نطاقك." });
    return;
  }
  if (String(req.body?.itemId || "") !== instructorRequestItemIdentity(item)) { res.status(409).json({ error: "تغيّر ترتيب البنود. حدّث الطلب.", code: "request-item" }); return; }

  /* والقرارُ في فصلٍ مجمَّدٍ لا يقع: «ثُبّت» يحتاج كتابةً في الجدول وهي
     ممنوعة، و«رُفض» يُغلق بابَ أستاذٍ على حالٍ لا يملك القسمُ تغييرَها. */
  /* وقفلُ التسجيل لا يقع عليه (R8): القرارُ يُحفظ في الجدول أولاً من شاشة
     الوارد، فرفضُ تسجيله بعدها كان يُضيع القرار نفسه. يبقى حكمُ الفصل. */
  const decideLock = await scheduleLockRefusal(
    req, itemScope.collegeId, itemScope.sectionId, Number(stored.AdTermId), { registrarLock: false });
  if (decideLock) { res.status(409).json({ error: decideLock, code: "schedule-locked" }); return; }

  const state = req.body?.state === "fixed" ? "fixed" : req.body?.state === "rejected" ? "rejected" : null;
  if (!state) { res.status(400).json({ error: "القرار إمّا تثبيتٌ أو رفض." }); return; }

  /* الرفضُ بلا سببٍ يدفع الأستاذَ إلى الهاتف، فتضيع الحجّة خارج النظام —
     وهي القاعدة نفسها المفروضة على ردّ اللجنة على ملاحظة التسجيل. */
  const reasonCode = String(req.body?.reasonCode || "");
  const allowedReasons = new Set(["room", "instructor", "regulation", "cohort", "load", "department", "other"]);
  if (state === "rejected" && !allowedReasons.has(reasonCode)) {
    res.status(400).json({ error: "اختر سبب الرفض." });
    return;
  }

  const alternatives = parseOfferedSlots(req.body?.alternatives);

  /* ── «ثُبّت» لا تُقال إلا إذا وقعت ────────────────────────────────────────
   *
   * التثبيتُ خطوتان: حفظٌ حقيقيٌّ عبر `/api/schedules`، ثم تسجيلُ القرار هنا.
   * والشاشةُ تُرتّبهما فلا تسجّل إن أخفق الحفظ — لكن الشاشةَ ليست الحارس. أيُّ
   * نداءٍ مباشرٍ لهذا المسار كان يستطيع أن يكتب «ثُبّت» والجدولُ لم يتحرّك،
   * فيقرأ الأستاذُ في خطّه الزمنيّ أن طلبه نُفِّذ وهو لم يُنفَّذ. وكذبةٌ كهذه
   * لا تُكتشف بالنظر إلى الشاشة: كلُّ شيءٍ فيها يبدو سليماً.
   *
   * فيُسأل الجدولُ نفسُه قبل التسجيل. الحذفُ يُصدَّق بغياب الصفّ، والتعديلُ
   * بمطابقة أيامه ووقته لما طُلب. وما لم يُصدَّق يُردّ بسببه، فيعرف المنسّق
   * أن عليه إعادة الحفظ لا إعادة الضغط.
   */
  /* الإضافةُ تُصدَّق بوجود صفّها: هي الشيءُ الوحيد الذي لا يُقاس على صفٍّ
     سابق — لا موضعَ قديمٌ يُطابَق — فيُسأل عن الصفّ الذي أنتجه الحفظُ نفسُه.
     ولولا ذلك لقال السجلُّ «ثُبّت» بلا أن يُخلق شيء. */
  if (state === "fixed" && item.action === "add") {
    const createdId = Number(req.body?.scheduleId || 0);
    const created = createdId ? await Repository.getScheduleById(createdId) : undefined;
    if (!created) {
      res.status(409).json({ error: "لم يُحفظ الموعد الجديد بعد. احفظه في الورشة ثم سجّل القرار." });
      return;
    }
    const expectedCourseId = Number(item.after?.courseId || 0);
    const expectedCollegeId = Number(item.after?.collegeId || stored.AdCollegeId);
    const expectedSectionId = Number(item.after?.sectionId || stored.AdSectionId);
    if (Number(created.AdInstructorId) !== Number(stored.AdInstructorId)
      || Number(created.AdTermId) !== Number(stored.AdTermId)
      || Number(created.AdCourseId) !== expectedCourseId
      || Number(created.AdCollegeId) !== expectedCollegeId
      || Number(created.AdSectionId) !== expectedSectionId) {
      res.status(409).json({ error: "الموعد المحفوظ ليس هو المطلوب في هذا البند أو موقعه." });
      return;
    }
  }
  if (state === "fixed" && item.action !== "add") {
    const live = item.rowId == null ? undefined : await Repository.getScheduleById(Number(item.rowId));
    if (item.action === "delete") {
      if (live) { res.status(409).json({ error: "لم يُحذف الموعد من الجدول بعد. احذفه أولاً ثم سجّل القرار." }); return; }
    } else {
      if (!live) { res.status(409).json({ error: "لم يعد هذا الموعد موجوداً في الجدول." }); return; }
      /* طلبٌ حُفظ بالمحرّك القديم (75/75/50 على نمطٍ موحّد الطول) يُقاس بطول اللائحة الذي وقّع عليه الأستاذ. */
      const decideCourse = await Repository.getCourseById(Number(item.after?.courseId || item.before?.courseId || 0));
      const want = (uniformPatternSlots((item.slots || []) as any, effectiveCourseHours(decideCourse)) as typeof item.slots) || item.slots || [];
      /* الصفُّ الواحد له وقتٌ واحد: بندٌ بأوقاتٍ مختلفة كان يُثبَّت بوقت أوّلها
         على كل الأيام، فيضيع ما طلبه الأستاذ لبقيّتها والسجلُّ يقول «ثُبّت». */
      if (new Set(want.map(slot => `${slot.start}-${slot.end}`)).size > 1) {
        res.status(409).json({ error: "أوقات هذا البند مختلفة بين الأيام، والموعد الواحد له وقت واحد. ثبّته من الجدول الدراسي بصفٍّ لكل وقت.", code: "mixed-times" });
        return;
      }
      const wantDays = new Set(want.map(slot => String(slot.day)));
      const sameDays = (["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const)
        .every(day => Boolean((live as any)[day]) === wantDays.has(day));
      const sameTime = String(live.fstarttime) === String(want[0]?.start || "")
        && String(live.fendtime) === String(want[0]?.end || "");
      if (!sameDays || !sameTime) {
        res.status(409).json({ error: "الجدول لا يطابق ما طُلب بعد. احفظ التعديل أولاً ثم سجّل القرار." });
        return;
      }
    }
  }

  const now = new Date().toISOString();
  const by = roleLabel(req.user?.Role) || "القسم";
  const items = [...(stored.items || [])];
  items[index] = {
    ...item,
    decisionHistory: [...(item.decisionHistory || []), ...(item.decision ? [item.decision] : [])],
    decision: {
      state,
      ...(state === "rejected" ? { reasonCode: reasonCode as any } : {}),
      note: String(req.body?.note || "").trim().slice(0, 400) || undefined,
      alternatives: alternatives.length ? (alternatives as any) : undefined,
      decidedBy: by,
      decidedAt: now,
      /* الصفُّ الذي أنتجه الحفظُ يمرّ من الشاشة: هي التي استدعت مسارَ الحفظ،
         وهذا المسار يسجّل الأثرَ ولا يُنشئه. */
      ...(Number(req.body?.scheduleId) ? { scheduleId: Number(req.body.scheduleId) } : {}),
    },
  };

  const timeline = [...(stored.timeline || []), {
    kind: (state === "fixed" ? "item-fixed" : "item-rejected") as InstructorRequestEventKind,
    at: now, by, itemIndex: index,
    detail: state === "rejected" ? reasonCode : undefined,
  }];
  if (alternatives.length) timeline.push({ kind: "alternative-offered" as InstructorRequestEventKind, at: now, by, itemIndex: index });

  /* رفضٌ ببدائل ينتظر اختيارَ الأستاذ، فلا يُغلق الطلب (requestFullySettled). */
  const decided = requestFullySettled(items);
  if (decided) timeline.push({ kind: "settled" as InstructorRequestEventKind, at: now, by });

  const saved = await Repository.saveInstructorRequest({
    ...stored, items, timeline,
    status: decided ? "settled" : "in-review",
  });
  await pushHooks.requestDecided(saved, index);
  res.json(requestForDepartment(req, await judgeRequestItems(saved, { forDepartment: true })));
});

app.post("/api/instructor-requests/:id/apply", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  let stored = await Repository.getInstructorRequest(String(req.params.id || ""));
  if (!stored) { res.status(404).json({ error: "لا يوجد طلبٌ بهذا المعرّف" }); return; }
  if (!(await requireCurrentInstructorRequestGeneration(stored, res))) return;
  const termId = Number(stored.AdTermId || 0);
  if (await refuseIfTermFrozen(res, termId)) return;

  const index = Number(req.body?.itemIndex);
  if (!Number.isInteger(index) || !(stored.items || [])[index]) { res.status(400).json({ error: "لا يوجد بندٌ بهذا الرقم في الطلب" }); return; }
  if (stored.items[index].decision?.state === "rejected") {
    res.status(409).json({ error: "رُفض هذا البند. اطلب من الأستاذ إعادة إرساله أو أعد فتحه بقرارٍ موثّق قبل الاعتماد.", code: "rejected-item" });
    return;
  }
  /* البنودُ المترابطة تُقبل معلّقةً فقط: بندٌ رفضه القسم أو ثبّته لا يُكتب لأن شاشةً قديمة أرسلته. */
  const siblings: number[] = (Array.isArray(req.body?.after) ? req.body.after : []).map(Number)
    .filter((i: number) => Number.isInteger(i) && i !== index && (stored.items || [])[i] && !stored.items[i].decision?.state);
  const chain = [...new Set([...siblings, index])];
  const preview = req.body?.preview === true;
  const add = req.body?.add && typeof req.body.add === "object" ? req.body.add : {};
  const revs: Record<string, unknown> = req.body?.revs && typeof req.body.revs === "object" ? req.body.revs : {};
  const submittedRevision = req.body?.requestRevision;
  if (typeof submittedRevision !== "number" || !Number.isSafeInteger(submittedRevision) || submittedRevision < 0) {
    res.status(428).json({ error: "حدّث وارد القسم قبل الاعتماد؛ ختم إصدار الطلب مفقود.", code: "request-revision-required" });
    return;
  }
  if (Number(submittedRevision) !== Number(stored.requestRevision || 0)) {
    res.status(409).json({ error: "تغيّر الطلب. حدّث الوارد قبل الاعتماد.", code: "request-revision" });
    return;
  }
  if (stored.items[index].decision?.state === "fixed") {
    res.status(409).json({ error: "سبق تثبيت هذا البند في الجدول.", code: "already-fixed" });
    return;
  }
  for (const i of chain) {
    const item = stored.items[i];
    const affected = item.action === "change" || item.action === "delete"
      ? (item.rowId == null ? [] : [Number(item.rowId)])
      : item.action === "add" ? (item.offeringRowIds || []).map(Number) : [];
    for (const rowId of affected) {
      const submitted = revs[String(rowId)];
      if (typeof submitted !== "number" || !Number.isSafeInteger(submitted) || submitted < 0) {
        res.status(428).json({ error: "حدّث وارد القسم قبل الاعتماد؛ ختم إصدار أحد المواعيد مفقود.", code: "row-revision-required", rowId });
        return;
      }
      const expected = item.action === "add"
        ? item.offeringRows?.find(row => Number(row.id) === rowId)?.rev
        : undefined;
      if (item.action === "add" && expected == null) {
        res.status(409).json({ error: "لا يوجد ختم موثوق للشعبة المختارة. أعد إرسال الطلب بعد تحديث الخيارات.", code: "offering-revision-missing", rowId });
        return;
      }
      if (expected != null && Number(submitted) !== Number(expected)) {
        res.status(409).json({ error: "تغيّرت الشعبة المختارة منذ فتح الوارد. حدّث الصفحة.", code: "revision", rowId });
        return;
      }
    }
  }
  /* تثبيتان متزامنان للطلب نفسه (منسّقان، أو نقرةٌ مزدوجة) كانا يُنشئان صفّين: واحدٌ في كل مرة. */
  /* والقفلُ على الفصل كلِّه: تثبيتان متزامنان في الفصل نفسه قد يحجزان القاعةَ أو الأستاذَ
     نفسَه في اللحظة نفسها، وكلٌّ منهما يفحص أسبوعاً لا يرى الآخر. */
  /* القفلُ في قاعدة البيانات لا في الذاكرة: يراه كلُّ خادمٍ في كل منطقة. */
  const applyLock = `term-${termId}`;
  const applyHolder = randomUUID();
  if (!(await Repository.acquireScheduleApplyLease(applyLock, applyHolder))) {
    res.status(409).json({ error: "يجري الآن تثبيتٌ آخر في هذا الفصل. انتظر لحظة ثم أعد المحاولة.", code: "apply-busy" });
    return;
  }
  /* يُمدّ القفلُ كل ٤٠ ثانية ما دام التثبيتُ جارياً، فلا ينتهي أجلُه في منتصف سلسلةٍ طويلة. */
  const leaseRenewal = setInterval(() => { void Repository.renewScheduleApplyLease(applyLock, applyHolder).catch(() => undefined); }, 40_000);
  try {
  const latest = await Repository.getInstructorRequest(String(stored.id));
  if (!latest || Number(latest.requestRevision || 0) !== Number(stored.requestRevision || 0)
      || submittedRevision !== Number(latest.requestRevision || 0)) {
    res.status(409).json({ error: "تغيّر الطلب. حدّث الوارد قبل الاعتماد." }); return;
  }
  stored = latest;
  (req as any).__requestReservationOwner = stored.id;
  const holds = (await Repository.getInstructorRequestReservations(termId)).filter(entry => entry.requestId === stored!.id);

  const instructor = await Repository.getInstructorById(Number(stored.AdInstructorId));
  const origin = { kind: "instructor-request", refId: String(stored.id), note: `رغبة ${String(instructor?.AdInstructorName || "أستاذ")}`.slice(0, 160) };
  const ops: ApplyOp[] = [];
  let tempSeq = -1;
  /* الصفُّ الحيّ يجب أن يكون صفَّ هذا الأستاذ في هذا الفصل كما رآه المنسّق: لا يُنقل ولا
     يُحذف صفٌّ أُسند لغيره أو نُقل لفصلٍ آخر أو عدّله زميلٌ بعد فتح الشاشة. */
  const liveRowRefusal = (live: any, seen: Record<string, unknown>): { error: string; code: string } | null => {
    if (Number(live.AdInstructorId) !== Number(stored.AdInstructorId) || Number(live.AdTermId) !== termId) {
      return { error: "هذا الموعد لم يعد للأستاذ نفسه في هذا الفصل. حدّث الصفحة وراجعه.", code: "stale" };
    }
    const seenRev = seen[String(live.id)];
    if (typeof seenRev !== "number" || !Number.isSafeInteger(seenRev) || seenRev < 0
      || seenRev !== Number(live.rev || 0)) {
      return { error: "تغيّر هذا الموعد في الجدول بعد أن فتحت الشاشة (عدّله زميل). حدّث الصفحة وراجعه قبل التثبيت.", code: "revision" };
    }
    return null;
  };
  const failItem = (status: number, itemIndex: number, error: string, code?: string) =>
    res.status(status).json({ error, code, itemIndex, applied: [], reverted: true });

  /* ── موعدٌ واحدٌ لا يُكتب صفّين ─────────────────────────────────────────────
     طلبٌ حُفظ بالمحرّك القديم قد يحمل 75/75/50 لبدايةٍ واحدة على نمطٍ معتمدٍ موحّد الطول؛ الأستاذُ قرأ طولَ
     اللائحة في صفحته ووقّع عليه، فيُكتب بطول اللائحة صفّاً واحداً، ويُحفظ ذلك على البند نفسه (المالك 2026-10-30). */
  const normalizedSlots = new Map<number, NonNullable<InstructorRequestItem["slots"]>>();
  for (const i of chain) {
    const item = stored.items[i];
    if (item.action !== "change" || item.decision?.state === "fixed") continue;
    const course = await Repository.getCourseById(Number(item.after?.courseId || item.before?.courseId || 0));
    const uniform = uniformPatternSlots((item.slots || []) as any, effectiveCourseHours(course));
    if (uniform) normalizedSlots.set(i, uniform as any);
  }
  for (const i of chain) {
    const item = stored.items[i];
    if (item.decision?.state === "fixed") continue;
    const scope = requestItemScope(stored, item);
    if (!isScopeAllowed(req, scope.collegeId, scope.sectionId)) { failItem(403, i, "هذا القسم خارج نطاقك."); return; }
    const groups = slotTimeGroups(normalizedSlots.get(i) || item.slots || []);

    if (item.action === "delete") {
      const live: any = item.rowId == null ? undefined : await Repository.getScheduleById(Number(item.rowId));
      if (live) {
        const refusal = liveRowRefusal(live, revs);
        if (refusal) { failItem(409, i, refusal.error, refusal.code); return; }
        ops.push({ kind: "delete", itemIndex: i, rowId: Number(live.id), original: live });
      }
      continue;  /* صفٌّ حُذف من قبل: يكفي تسجيلُ القرار. */
    }
    if (!groups.length) { failItem(400, i, "البند بلا أيام أو وقت."); return; }

    if (item.action === "change") {
      const live: any = item.rowId == null ? undefined : await Repository.getScheduleById(Number(item.rowId));
      if (!live) { failItem(409, i, "لم يعد هذا الموعد موجوداً في الجدول. حدّث الصفحة.", "stale"); return; }
      const refusal = liveRowRefusal(live, revs);
      if (refusal) { failItem(409, i, refusal.error, refusal.code); return; }
      const [first, ...rest] = groups;
      /* بلا حجزٍ للبند (طلبٌ قديم أو حجزٌ سقط): القاعةُ من الحكم نفسه — تبقى قاعتُه إن خلت، وإلا الأنسبُ الخالي. */
      const held = holds.find(entry => entry.itemId === item.itemId)?.room
        || (await judgeRequestItems(stored, { forDepartment: true })).items[i]?.roomSwitch?.to;
      const place = held ? { AdRoomCode: held.room, AdRoomHall: held.hall, buildingId: held.buildingId, roomId: held.roomId,
        companionRoomId: held.companionRoomId || live.companionRoomId, companionRoomLabel: held.companionRoomLabel || live.companionRoomLabel, locationStatus: "VERIFIED" } : {};
      ops.push({ kind: "update", itemIndex: i, rowId: Number(live.id), original: live,
        body: { ...rowBodyOf(live), ...place, ...daysFlags(first.days), fstarttime: first.start, fendtime: first.end, rev: live.rev, origin } });
      for (const group of rest) {
        ops.push({ kind: "create", itemIndex: i, tempId: tempSeq--,
          body: { ...rowBodyOf(live), ...place, ...daysFlags(group.days), fstarttime: group.start, fendtime: group.end, origin } });
      }
      continue;
    }

    if (item.action === "add" && item.offeringRowIds?.length) {
      const placeholders = placeholderInstructorIds(await Repository.getInstructors());
      const hold = holds.find(entry => entry.itemId === item.itemId);
      if (!hold || !item.offeringRowIds.every(id => hold.offeringRowIds.includes(id))) { failItem(409, i, "لم يعد اختيار الشعبة قائماً. حدّث الطلب."); return; }
      for (const id of item.offeringRowIds) {
        const live = await Repository.getScheduleById(id);
        const expected = item.offeringRows?.find(row => row.id === id);
        if (!live || !placeholders.has(Number(live.AdInstructorId)) || Number(live.AdTermId) !== termId
          || Number(live.AdCourseId) !== Number(item.after?.courseId) || !expected || Number(live.rev || 0) !== expected.rev) {
          failItem(409, i, "تغيّرت الشعبة المختارة. حدّث الوارد قبل الموافقة.", "stale"); return;
        }
        ops.push({ kind: "update", itemIndex: i, rowId: id, original: live,
          body: { ...rowBodyOf(live), AdInstructorId: Number(stored.AdInstructorId), rev: live.rev, origin } });
      }
      continue;
    }
    if (item.action === "add") {
      if (i !== index) { failItem(400, i, "بندُ الإضافة يُثبَّت من بطاقته."); return; }
      const courseId = Number(item.after?.courseId || 0);
      if (add.courseId && Number(add.courseId) !== courseId) { failItem(400, i, "هذا البند لمقرّر الأستاذ المطلوب؛ لإضافة مقرّرٍ آخر استعمل الجدول الدراسي."); return; }
      const base = {
        AdCollegeId: Number(item.after?.collegeId || stored.AdCollegeId), AdSectionId: Number(item.after?.sectionId || stored.AdSectionId),
        AdTermId: termId, AdCourseId: courseId, SCode: add.scode, AdInstructorId: Number(stored.AdInstructorId),
        AdRoomCode: add.room, AdRoomHall: add.hall, buildingId: add.buildingId, roomId: add.roomId, locationStatus: add.locationStatus, companionRoomId: add.companionRoomId, origin,
      };
      const single = groups.length === 1;
      for (const group of groups) {
        ops.push({ kind: "create", itemIndex: i, tempId: tempSeq--,
          body: { ...base, ...daysFlags(group.days),
            fstarttime: single && add.start ? add.start : group.start, fendtime: single && add.end ? add.end : group.end } });
      }
      continue;
    }
    failItem(400, i, "نوعُ البند لا يُثبَّت في الجدول.");
    return;
  }

  /* ── الأسبوعُ كما سيصير ─────────────────────────────────────────────────── */
  let termRows = await Repository.getSchedulesByScope({ termId });
  const removed = new Set(ops.filter(op => op.kind === "delete").map(op => (op as any).rowId));
  const updatedBy = new Map(ops.filter(op => op.kind === "update").map(op => [(op as any).rowId, op] as const));
  const created = ops.filter(op => op.kind === "create") as Array<Extract<ApplyOp, { kind: "create" }>>;
  const buildWeek = (rows: FSchedule[]): FSchedule[] => [
    ...rows.filter(row => !removed.has(Number(row.id))).map(row => {
      const op: any = updatedBy.get(Number(row.id));
      return op ? ({ ...row, ...op.body } as any) : row;
    }),
    ...created.map(op => ({ ...op.body, id: op.tempId } as any)),
  ];
  let finalWeek: FSchedule[] = buildWeek(termRows);
  const weekFor = (op: ApplyOp) => op.kind === "create" ? finalWeek.filter(row => Number(row.id) !== op.tempId) : finalWeek;

  /* ── فحصٌ جافّ لكل خطوة على الأسبوع النهائي ─────────────────────────────── */
  const warnings: any[] = [];
  for (const op of ops) {
    if (op.kind === "delete") {
      const lock = await scheduleLockRefusal(req, op.original.AdCollegeId, op.original.AdSectionId, op.original.AdTermId);
      if (lock) { failItem(409, op.itemIndex, lock, "schedule-locked"); return; }
      continue;
    }
    const dry = op.kind === "update"
      ? await runScheduleHandler(updateScheduleHandler, req, { params: { id: String(op.rowId) }, body: op.body, hypotheticalWeek: weekFor(op), dryRun: true })
      : await runScheduleHandler(createScheduleHandler, req, { body: op.body, hypotheticalWeek: weekFor(op), dryRun: true });
    if (dry.status >= 400) {
      res.status(dry.status).json({ ...(dry.body && typeof dry.body === "object" ? dry.body : { error: "تعذّر التثبيت." }), itemIndex: op.itemIndex, applied: [], reverted: true });
      return;
    }
    op.body = dry.body.row;
    for (const w of (dry.body?.warnings || [])) warnings.push({ ...w, itemIndex: op.itemIndex });
  }

  const plan = ops.map(op => {
    const body: any = op.kind === "delete" ? op.original : op.body;
    return {
      itemIndex: op.itemIndex, action: op.kind,
      days: PROPOSAL_DAYS.filter(key => Boolean(body[key])), start: body.fstarttime, end: body.fendtime,
      room: [body.AdRoomCode, body.AdRoomHall].filter(Boolean).join("/"),
    };
  });
  if (preview) { res.json({ ok: true, preview: true, plan, warnings }); return; }

  const now = new Date().toISOString();
  const by = roleLabel(req.user?.Role) || "القسم";
  const versions = new Map<string, Awaited<ReturnType<typeof captureScopeVersion>>>();
  for (const op of ops) {
    const row = op.kind === "delete" ? op.original : op.body;
    const key = `${row.AdCollegeId}:${row.AdSectionId}`;
    if (!versions.has(key)) versions.set(key, await captureScopeVersion(req, Number(row.AdCollegeId), Number(row.AdSectionId), termId, "قبل تثبيت طلب أستاذ", "manual"));
  }
  const registry = await readLocationRegistry();
  let committed: Awaited<ReturnType<typeof Repository.commitInstructorRequestPlan>>;
  try {
    committed = await Repository.commitInstructorRequestPlan(stored, ops, scheduleIds => {
      const items = stored!.items.map((item, i) => chain.includes(i) ? { ...item,
        ...(normalizedSlots.has(i) ? { slots: normalizedSlots.get(i), after: { ...(item.after as any), time: `${normalizedSlots.get(i)![0].start} – ${normalizedSlots.get(i)![0].end}` } } : {}),
        decision: { state: "fixed" as const, decidedBy: by, decidedAt: now, ...(scheduleIds.has(i) ? { scheduleId: scheduleIds.get(i) } : {}) } } : item);
      const timeline = [...stored!.timeline, ...chain.map(itemIndex => ({ kind: "item-fixed" as const, at: now, by, itemIndex }))];
      const settled = requestFullySettled(items);
      if (settled) timeline.push({ kind: "settled" as any, at: now, by } as any);
      return { ...stored!, items, timeline, status: settled ? "settled" : "in-review" };
    }, row => canonicalizeHistoricalLocationForRuntime(row, registry), placeholderInstructorIds(await Repository.getInstructors()), async (rows, week) => {
      // Repeat the existing weekly-hours authority against the transaction's live week.
      for (const row of rows) {
        const issue = await scheduleLengthIssue(row, week);
        if (issue) throw new RequestReservationConflict(issue);
      }
    });
  } catch (error: any) {
    res.status(error instanceof ScheduleRevisionConflict || error instanceof RequestReservationConflict ? 409 : 503)
      .json({ error: error.message || "تعذّر تثبيت الطلب. لم يُحفظ أي تغيير.", code: "request-commit-failed", applied: [], reverted: true });
    return;
  }
  // The official rows and decision are already committed atomically. Ancillary
  // history/notifications must not pretend that a successful assignment failed.
  for (const [key, version] of versions) {
    const [collegeId, sectionId] = key.split(":").map(Number);
    try {
      await recordVersionAfter(version, before => {
        const changedIds = new Set(ops.filter(op => op.kind !== "create").map(op => Number(op.rowId)));
        return [...before.filter(row => !changedIds.has(Number(row.id))),
          ...committed.rows.filter(row => Number(row.AdCollegeId) === collegeId && Number(row.AdSectionId) === sectionId)];
      });
      await noteScheduleMutation(req, collegeId, sectionId, termId, { kind: "add", rows: committed.rows.filter(row => Number(row.AdCollegeId) === collegeId && Number(row.AdSectionId) === sectionId) });
    } catch { warnings.push({ message: "ثُبّت الطلب؛ تعذّر تحديث سجل النسخة أو الإشعار. راجع حركة الجدول." }); }
  }
  const saved = committed.request;
  await pushHooks.requestFixed(saved, chain);
  res.locals.auditChanges = `تثبيت رغبة أستاذ (${String(instructor?.AdInstructorName || "")}): ` + plan.map(step =>
    `${step.action === "delete" ? "حذف" : step.action === "create" ? "إضافة" : "نقل"} ${step.days.map(dayLabelOf).join(" و")} ${formatScheduleTimeRange(step.start, step.end)}`).join(" · ");
  res.locals.auditRowIds = [...committed.rows.map(row => row.id), ...ops.filter(op => op.kind === "delete").map(op => (op as any).rowId)];
  res.json({ ...requestForDepartment(req, await judgeRequestItems(saved, { forDepartment: true })), applied: plan, appliedRows: committed.rows, warnings });
  } finally {
    clearInterval(leaseRenewal);
    await Repository.releaseScheduleApplyLease(applyLock, applyHolder).catch(() => undefined);
  }
});

/* ── حوارُ البند: ردُّ القسم واقتراحُه ─────────────────────────────────────
 *
 * ليس قراراً: لا يكتب في الجدول ولا يُغلق البند. هو رسالةٌ إلى الأستاذ —
 * سطرٌ، أو أوقاتٌ مقترحة، أو كلاهما — تصله في صفحته، فيوافق أو يقترح غيرها.
 * والنطاقُ والقفلُ نطاقُ البند وقفلُه كما في القرار نفسه.
 */
app.post("/api/instructor-requests/:id/reply", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const stored = await Repository.getInstructorRequest(String(req.params.id || ""));
  if (!stored) { res.status(404).json({ error: "لا يوجد طلبٌ بهذا المعرّف" }); return; }
  if (!(await requireCurrentInstructorRequestGeneration(stored, res))) return;
  if (!requireInstructorRequestRevision(req, res, stored)) return;
  if (await refuseIfTermFrozen(res, Number(stored.AdTermId || 0))) return;
  const index = Number(req.body?.itemIndex);
  const item = (stored.items || [])[index];
  if (!item) { res.status(400).json({ error: "لا يوجد بندٌ بهذا الرقم في الطلب" }); return; }
  const itemScope = requestItemScope(stored, item);
  if (!isScopeAllowed(req, itemScope.collegeId, itemScope.sectionId)) {
    res.status(403).json({ error: "هذا القسم خارج نطاقك." });
    return;
  }
  if (String(req.body?.itemId || "") !== instructorRequestItemIdentity(item)) { res.status(409).json({ error: "تغيّر ترتيب البنود. حدّث الطلب.", code: "request-item" }); return; }
  const replyLock = await scheduleLockRefusal(
    req, itemScope.collegeId, itemScope.sectionId, Number(stored.AdTermId), { registrarLock: false });
  if (replyLock) { res.status(409).json({ error: replyLock, code: "schedule-locked" }); return; }
  if (item.decision?.state === "fixed" && negotiationState(item) === "agreed") {
    res.status(409).json({ error: "ثُبّت هذا البند في الجدول؛ لا حوارَ بعد التثبيت." });
    return;
  }
  const text = String(req.body?.text || "").trim().slice(0, THREAD_TEXT_LIMIT);
  const slots = parseOfferedSlots(req.body?.slots);
  if (item.offeringRowIds?.length && slots.length) { res.status(400).json({ error: "موعد الشعبة المختارة ثابت. ارفض الاختيار ليختار الأستاذ شعبة أخرى، أو عدّل الموعد رسمياً أولاً." }); return; }
  if (!text && !slots.length) { res.status(400).json({ error: "اكتب رداً أو اقترح وقتاً." }); return; }

  const now = new Date().toISOString();
  const by = roleLabel(req.user?.Role) || "القسم";
  const items = [...(stored.items || [])];
  items[index] = {
    ...item,
    ...appendRequestThread(item, { from: "department" as const, at: now, by, ...(text ? { text } : {}), ...(slots.length ? { slots } : {}) }),
  };
  const saved = await Repository.saveInstructorRequest({
    ...stored, items, status: "in-review",
    timeline: [...(stored.timeline || []), { kind: "department-replied" as InstructorRequestEventKind, at: now, by, itemIndex: index }],
  });
  broadcastNotify(Repository.currentDemoSessionId());
  await pushHooks.departmentReplied(saved, index);
  res.json(requestForDepartment(req, await judgeRequestItems(saved, { forDepartment: true })));
});
}
