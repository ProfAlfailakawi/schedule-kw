/**
 * ── الإشعارات ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { Response } from "express";
import { Repository } from "../../db/repository";
import { currentTermId } from "../../utils/termSequence";
import type { ScheduleApproval, InstructorRequest } from "../../types";
import { effectiveStatus as studyProposalStatus, decisionStateOf as studyProposalDecision } from "../../utils/studyProposal";
import { cleanSeenIds, seenKey } from "../../utils/notificationSeen";
import { studentQueueAggregate, type StudentQueueEntry } from "../notificationCache";
import { emptyApproval, isFullySigned, readDeadline, isOpenRegistrarNote, kuwaitDateISO } from "../../utils/approvalWorkflow";
import { buildNotifications } from "../../utils/notificationCenter";
import { awaitedItemIndexes } from "../../utils/linkedRequestItems";
import { isAcademicRole, roleDefinition } from "../../utils/academicRoles";
import { adNotifications } from "../adsRoutes";
import { pendingPlanReviews } from "../planReviewRoutes";
import { buildFeatureNotifications, buildMasariGapNotifications } from "../../utils/featureNotifications";
import { studentGaps } from "../../utils/sectionGap";
import { radarNoticeFor } from "../simulationRoutes";
import { countBlockingConflicts } from "../core/approvals";
import { type AuthenticatedRequest, isPowerUser, requireAuth, ROOT_ADMIN_USER_ID } from "../core/auth";
import { currentInstructorRequestGeneration, requestItemScope } from "../core/instructorRequests";
import { dataContextCacheKey } from "../core/locations";
import { notesWithState } from "../core/notes";
import { bellBlockingMemo, bellPlanningTermId, studentQueueMemo } from "../core/notifications";
import { sectionGapData } from "../core/planning";
import { isScopeAllowed } from "../core/scope";
import { approvalBlockerOptions } from "../core/smartImport";

/* ══════════════════════════════════════════════════════════════════════════
   تغييرات الجدول: صندوق الوارد وتقرير الجولة
   ══════════════════════════════════════════════════════════════════════════

   أيقونةٌ واحدة جديدة، وهي الوحيدة في هذا العمل كله. وسبب استحقاقها أنها
   ليست استعلاماً بل مكانَ عمل: الموظّف يفتحها ليقرّر، لا ليقرأ.

   ووجهها يختلف بالصفة من المصدر نفسه: التسجيل يرى الأقسام الواردة كلها،
   والقسم يرى نفسه. لا شاشتان تُبنيان مرّتين وتفترقان عند أول تعديل.        */

/**
 * ── الشارة ──────────────────────────────────────────────────────────────────
 *
 * رقمٌ واحد على الأيقونة. للتسجيل: كم جدولاً ينتظر قراره. وللقسم: كم ملاحظةً
 * وصلته ولم تُعالَج. لا مركزَ إشعاراتٍ ولا بريد — من يدخل النظام يومياً يكفيه
 * رقمٌ يراه، ومن لا يدخله لا يُوقظه بريدٌ أيضاً.
 *
 * والنداء رخيص عمداً: يُقرأ كل دقيقتين ومع كل عودةٍ إلى التبويب، فلا يجوز أن
 * يقرأ جداول الكلية كلها ليكتب رقماً.
 */
/**
 * مركز الإشعارات: ما بقي لكل صاحب صفة، مشتقّاً من حال الجداول لحظةَ السؤال.
 * النطاق هنا هو النطاق في كل مكان — لا يرى أحدٌ إشعاراً عن قسمٍ خارج نطاقه.
 */
const REGISTRAR_NOTIFY_ROLES = new Set(["registrarHead", "collegeRegistrar", "registrarStaff"]);
function studentQueueForTerm(termId: number): Promise<Map<string, StudentQueueEntry>> {
  const key = dataContextCacheKey(termId);
  return studentQueueMemo.get(key, async () => {
    const [termNeeds, allCourses] = await Promise.all([Repository.getStudentNeedsForTerm(termId), Repository.getCourses()]);
    return studentQueueAggregate(termNeeds as any[], allCourses as any[]);
  });
}
function bellBlockingCount(collegeId: number, sectionId: number, termId: number, termRows: any[]): Promise<number> {
  const key = dataContextCacheKey(`${termId}:${collegeId}:${sectionId}`);
  return bellBlockingMemo.get(key, async () => {
    const scopeRows = termRows.filter(row => Number(row.AdCollegeId) === collegeId && Number(row.AdSectionId) === sectionId);
    return countBlockingConflicts(scopeRows, termRows, await approvalBlockerOptions());
  });
}

async function notificationItemsForTerm(req: AuthenticatedRequest, termId: number) {
  const role = req.user?.IsAdminUser && !isAcademicRole(req.user?.Role) ? "admin" : roleDefinition(req.user?.Role).id;
  const [approvals, term, colleges, sections] = await Promise.all([
    Repository.getScheduleApprovalsForTerm(termId),
    Repository.getTermById(termId),
    Repository.getColleges(),
    Repository.getSections(),
  ]);
  const collegeName = new Map((colleges as any[]).map(row => [Number(row.AdCollegeId), String(row.AdCollegeName || "")]));
  const stored = new Map(approvals.map(row => [`${Number(row.AdCollegeId)}:${Number(row.AdSectionId)}`, row] as [string, ScheduleApproval]));
  const inScope = (sections as any[]).filter(row =>
    req.user?.IsAdminUser || isScopeAllowed(req, Number(row.AdCollegeId), Number(row.AdSectionId)));
  const termDeadline = (term as any)?.AdTermSubmissionDeadline as string | undefined;
  /* «اليوم» بتوقيت الكويت كما في الوارد (R15): بين منتصف الليل والثالثة فجراً
     كان الجرسُ يعدّ الأمسَ يوماً جارياً، فيقول «يومٌ باقٍ» والوارد «انقضى». */
  const today = kuwaitDateISO();
  const department = role === "committeeChair" || role === "departmentHead";
  /* ── طلباتُ الأساتذة تصل من يعمل على الجدول، أيّاً كانت صفته ───────────────
   * كانت تُحسب للجنة ورئيس القسم وحدهما، وبقسم الطلب لا بقسم البند: فطلبٌ
   * بإضافةٍ في كليةٍ أخرى، أو منسّقٌ بصلاحية الإدارة، لا يصله شيء. فصار البندُ
   * يُنسب إلى قسمه هو، ويصل كلَّ من يملك شاشة الجدول (٧) في ذلك القسم. */
  const granted = req.permissions ?? [];
  const handlesRequests = Boolean(req.user?.IsAdminUser) || granted.includes(7) || department;
  const requests = handlesRequests ? await currentInstructorRequestGeneration(await Repository.getInstructorRequests(0, 0, termId)) : [];
  const instructorNames = handlesRequests
    ? new Map((await Repository.getInstructors() as any[]).map(row => [Number(row.AdInstructorId), String(row.AdInstructorName || "")]))
    : new Map<number, string>();
  const termRows = await Repository.getSchedulesByScope({ termId });
  const termRowsById = new Map((termRows as any[]).map(row => [Number(row.id), row] as [number, any]));
  const pendingByScope = new Map<string, Array<{ requestId: string; instructorName: string; count: number; at?: string; linked?: boolean }>>();
  for (const request of requests as InstructorRequest[]) {
    if (request.status !== "submitted" && request.status !== "in-review") continue;
    const awaited = awaitedItemIndexes(request.items || [], termRowsById, item => requestItemScope(request, item));
    const perScope = new Map<string, { count: number; linked: boolean }>();
    (request.items || []).forEach((item, index) => {
      if (item.action === "keep" || item.decision?.state) return;
      const where = requestItemScope(request, item);
      const key = `${where.collegeId}:${where.sectionId}`;
      const current = perScope.get(key) || { count: 0, linked: false };
      perScope.set(key, { count: current.count + 1, linked: current.linked || awaited.has(index) });
    });
    for (const [key, entry] of perScope) {
      pendingByScope.set(key, [...(pendingByScope.get(key) || []), {
        requestId: String(request.id),
        instructorName: instructorNames.get(Number(request.AdInstructorId)) || "أستاذ",
        count: entry.count,
        linked: entry.linked,
        at: request.submittedAt,
      }]);
    }
  }
  /* ── مقترحاتٌ دراسية ردّ عليها الأستاذ وتنتظر القسم ─────────────────────
     وافق عليها فتنتظر التثبيت، أو طلب تعديلاً فتنتظر نسخةً جديدة. المعرّفُ يحمل
     وقتَ الردّ، فردٌّ جديدٌ إشعارٌ جديد. */
  const proposalsByScope = new Map<string, Array<{ proposalId: string; instructorName: string; kind: "approved" | "changes"; at?: string }>>();
  if (handlesRequests) {
    for (const proposal of await Repository.getStudyProposalsByTerm(termId)) {
      const status = studyProposalStatus(proposal);
      if (status !== "approved" && status !== "partial" && status !== "changes") continue;
      const key = `${proposal.AdCollegeId}:${proposal.AdSectionId}`;
      proposalsByScope.set(key, [...(proposalsByScope.get(key) || []), {
        proposalId: proposal.id,
        instructorName: instructorNames.get(Number(proposal.AdInstructorId)) || "أستاذ",
        kind: status === "changes" ? "changes" : "approved",
        at: studyProposalDecision(proposal).respondedAt,
      }]);
    }
  }
  /* جدولُ الفصل يُقرأ مرّةً ويُعدّ لكل قسم — لا قراءةٌ لكل قسم: حسابٌ بأربعةٍ
     وخمسين قسماً كان ينتظر دقيقةً ليرى جرسه. والأقسامُ بلا مواعيد هذا الفصل
     وبلا دورة اعتماد ليست «جداول لم تُعتمد»: لا جدول لها أصلاً. */
  const rowsPer = new Map<string, number>();
  for (const item of termRows as any[]) {
    const key = `${Number(item.AdCollegeId)}:${Number(item.AdSectionId)}`;
    rowsPer.set(key, (rowsPer.get(key) || 0) + 1);
  }
  /* ── كشفُ التسجيل لكل قسم: مقرّراتُه هو ─────────────────────────────────
     يُعدّ لمن يقرّر فيه: اللجنة (من يعمل على الجدول) والتسجيل. والمقرّرُ يُنسب
     إلى القسم المالك له، كما يُعرض ويُكتب في الكشف نفسه. */
  const registrarReader = REGISTRAR_NOTIFY_ROLES.has(role);
  const studentQueueByScope = handlesRequests || registrarReader
    ? await studentQueueForTerm(termId)
    : new Map<string, StudentQueueEntry>();
  const watchesSubmission = registrarReader || role === "registrarDean" || role === "dean" || role === "viceDean";
  const active = inScope.filter(row => {
    const key = `${Number(row.AdCollegeId)}:${Number(row.AdSectionId)}`;
    /* من يُحاسِب على التسليم (التسجيل، والعميدان، وعميد التسجيل) يُعدّ له كلُّ
       قسمٍ في نطاقه — قسمٌ لم يكتب شيئاً ولم يبدأ الدورة هو أوّلُ من يتأخّر،
       وكان يسقط من الجرس لأنه بلا صفوف ولا سجلّ (N21). */
    return rowsPer.has(key) || stored.has(key) || pendingByScope.has(key) || studentQueueByScope.has(key) || department || watchesSubmission;
  });
  const scopes = await Promise.all(active.map(async row => {
    const collegeId = Number(row.AdCollegeId), sectionId = Number(row.AdSectionId);
    const approval = stored.get(`${collegeId}:${sectionId}`) || emptyApproval(collegeId, sectionId, termId);
    const rowCount = rowsPer.get(`${collegeId}:${sectionId}`) || 0;
    /* ملاحظاتُ التسجيل المفتوحة في أي حال (N19): تُكتب والجدول قيد الإعداد أو
       بعد اعتماده أيضاً، وكان القسم لا يُنبَّه بها إلا بعد «أُرجع». */
    const deptNotes = department && (stored.has(`${collegeId}:${sectionId}`))
      ? (await notesWithState(collegeId, sectionId, termId)).filter(isOpenRegistrarNote)
      : [];
    const openRegistrarNotes = deptNotes.length;
    /* ملاحظةٌ أصرّ عليها التسجيل ثلاثاً أو صُعّدت (N24) — تُقرأ بحذر: حقلُ
       التصعيد يضيفه مسارٌ آخر. */
    const escalatedNotes = deptNotes.filter((note: any) => Number(note.insistCount || 0) >= 3 || Boolean(note.escalatedAt)).length;
    /* قسمٌ معتمد ظهر فيه مانع (N20) — للعميدين وحدهما، وللمعتمد وحده. */
    const blockingConflicts = (role === "dean" || role === "viceDean") && approval.status === "accepted"
      ? await bellBlockingCount(collegeId, sectionId, termId, termRows as any[])
      : 0;
    const pendingRequests = pendingByScope.get(`${collegeId}:${sectionId}`) || [];
    const openRequests = pendingRequests.reduce((sum, entry) => sum + entry.count, 0);
    const queue = studentQueueByScope.get(`${collegeId}:${sectionId}`);
    /* التسجيلُ لا يُقال له عن كشفِ قسمٍ لم يوقَّع جدولُه — لا يُعرض له أصلاً. */
    const studentQueue = queue ? {
      ...queue,
      pendingCommittee: handlesRequests ? queue.pendingCommittee : 0,
      awaitingRegistration: registrarReader && !isFullySigned(approval) ? 0 : queue.awaitingRegistration,
    } : undefined;
    return {
      approval, rowCount, openRegistrarNotes, openRequests, pendingRequests, studentQueue, escalatedNotes, blockingConflicts,
      studyProposals: proposalsByScope.get(`${collegeId}:${sectionId}`) || [],
      collegeName: collegeName.get(collegeId) || "",
      sectionName: String(row.AdSectionName || ""),
      deadline: readDeadline({ termDeadline, extensionUntil: approval.extensionUntil, extensionReason: approval.extensionReason }, today),
    };
  }));
  const items = buildNotifications({
    role, scopes,
    deadline: readDeadline({ termDeadline }, today),
  });
  return { term, items };
}

/** What the students said, for the department: the counts that plan sections,
 * and the named case list (name + civil ID decrypted) for the authorised,
 * scope-checked department only. Never cached by the service worker. */
/* ── الشعب مقابل الطلب: قراءةٌ خفيفة لشريط الاعتماد ────────────────────────────────────────
   لكل مقرر للقسم: كم شعبةً مفتوحةً في جدول الفصل، وسعة الشعبة، وكم طالباً طلبه (استبيانٌ + رغبات «مساري»).
   القراءةُ نفسها التي يقوم عليها «رادار الطلب» أعلاه لكن بلا محاكاةٍ ولا بحثِ مواعيد، فتُفتح مع كل شاشةٍ بلا كلفة.
   لا تكتب شيئاً. الحساب والقرار في src/utils/sectionGap.ts. */
/* الجرس يسأل كل بضع ثوانٍ: قراءةُ القسم نفسها تُحفظ دقيقةً فلا تتكرر الاستعلامات. */
const sectionGapCache = new Map<string, { at: number; data: Awaited<ReturnType<typeof sectionGapData>> }>();
async function cachedSectionGap(collegeId: number, sectionId: number, termId: number) {
  const key = dataContextCacheKey(`${collegeId}:${sectionId}:${termId}`), hit = sectionGapCache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.data;
  const data = await sectionGapData(collegeId, sectionId, termId);
  if (sectionGapCache.size > 200) sectionGapCache.clear();
  sectionGapCache.set(key, { at: Date.now(), data });
  return data;
}

export function registerNotificationsRoutes(app: Express): void {

app.get("/api/notifications", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  /* «المقروء» يُطلب مع بداية الطلب لا بعد بناء القائمة؛ تعذّرُه لا يُسقط الجرس. */
  const seenStored = Repository.getNotificationSeen(Number(req.user?.SystemUserId)).catch(() => [] as string[]);
  const terms = await Repository.getTerms();
  const explicit = Number(req.query.termId || 0);
  const termId = explicit || currentTermId(terms as any);
  if (!termId) { res.json({ termId: 0, items: [] }); return; }
  const [current, planning] = await Promise.all([notificationItemsForTerm(req, termId), explicit ? Promise.resolve(0) : bellPlanningTermId(terms as any[])]);
  const termName = String((current.term as any)?.AdTermName || "");
  let items = current.items.map(item => ({ ...item, termId, termName }));
  let planningName = "";
  if (planning && planning !== termId) {
    const next = await notificationItemsForTerm(req, planning);
    planningName = String((next.term as any)?.AdTermName || "");
    items = [...items, ...next.items.map(item => ({
      ...item, id: `term-${planning}:${item.id}`, termId: planning, termName: planningName,
      detail: [planningName, item.detail].filter(Boolean).join(" — "),
    }))];
    const rank: Record<string, number> = { alert: 0, action: 1, waiting: 2, done: 3 };
    items.sort((a, b) => rank[a.tone] - rank[b.tone] || String(b.at || "").localeCompare(String(a.at || "")));
  }
  /* ── المزايا الجديدة: صحائفُ قيد المراجعة، ورادارُ التسجيل، وما تعثّر فيه الطلبة ─────────
     تُشتقّ من الحال كبقية الجرس، وتُضاف دون فصل: فصلُ الرادار هو فصلُ باب الطالب. وتعذّرُها
     لا يُسقط الجرس. */
  try {
    const role = req.user?.IsAdminUser && !isAcademicRole(req.user?.Role) ? "admin" : roleDefinition(req.user?.Role).id;
    const scopeDeps = { isScopeAllowed: (r: any, c: number, s: number) => isScopeAllowed(r, c, s), isPowerUser: (r: any) => isPowerUser(r), dataContextKey: dataContextCacheKey };
    const [reviews, radar] = await Promise.all([pendingPlanReviews(req, scopeDeps), radarNoticeFor(req, scopeDeps)]);
    const extra = buildFeatureNotifications({ role, planReviews: reviews, radar: radar.radar, outcome: radar.outcome, termId: radar.termId || termId, termName: radar.termName || termName });
    if (extra.length) {
      const rank: Record<string, number> = { alert: 0, action: 1, waiting: 2, done: 3 };
      items = [...items, ...extra.map(item => ({ ...item, termId: item.termId ?? termId, termName: item.termName ?? termName }))].sort((a, b) => rank[a.tone] - rank[b.tone] || String(b.at || "").localeCompare(String(a.at || "")));
    }
  } catch (error) {
    console.error("[notifications] feature items:", error instanceof Error ? error.message : error);
  }
  /* ── «مساري»: مقرراتٌ يطلبها الطلبة ولا تكفيها شعبُ قسمك، لعاملي القسم وحدهم (لا لكل الجامعة) ── */
  try {
    const role = req.user?.IsAdminUser && !isAcademicRole(req.user?.Role) ? "admin" : roleDefinition(req.user?.Role).id;
    if (["standard", "committeeChair", "departmentHead"].includes(role) && !isPowerUser(req)) {
      const gapTerm = planning || termId;
      const mine = ((await Repository.getSections()) as any[]).filter(sec => isScopeAllowed(req, Number(sec.AdCollegeId), Number(sec.AdSectionId))).slice(0, 30);
      const found = (await Promise.all(mine.map(async sec => {
        const data = await cachedSectionGap(Number(sec.AdCollegeId), Number(sec.AdSectionId), gapTerm);
        const courses = studentGaps(data.courses).length;
        return courses ? { collegeId: Number(sec.AdCollegeId), sectionId: Number(sec.AdSectionId), sectionName: String(sec.AdSectionName || ""), courses } : null;
      }))).filter((row): row is NonNullable<typeof row> => row !== null);
      const extra = buildMasariGapNotifications(found, gapTerm, gapTerm === termId ? termName : planningName);
      if (extra.length) {
        const rank: Record<string, number> = { alert: 0, action: 1, waiting: 2, done: 3 };
        items = [...items, ...extra.map(item => ({ ...item, termId: item.termId ?? termId, termName: item.termName ?? termName }))].sort((a, b) => rank[a.tone] - rank[b.tone] || String(b.at || "").localeCompare(String(a.at || "")));
      }
    }
  } catch (error) {
    console.error("[notifications] masari gap:", error instanceof Error ? error.message : error);
  }
  /* ── الإعلانات: حملاتٌ تنتهي قريباً، لحساب الإدارة الرئيسي وحده (ليس في الصندوق التجريبي) ── */
  try {
    if (Number(req.user?.SystemUserId) === ROOT_ADMIN_USER_ID && !Repository.isDemoRequest()) {
      const ads = await adNotifications();
      if (ads.length) {
        const rank: Record<string, number> = { alert: 0, action: 1, waiting: 2, done: 3 };
        items = [...items, ...ads.map(item => ({ ...item, termId, termName }))].sort((a, b) => rank[a.tone] - rank[b.tone] || String(b.at || "").localeCompare(String(a.at || "")));
      }
    }
  } catch (error) {
    console.error("[notifications] ads:", error instanceof Error ? error.message : error);
  }
  /* «المقروء» محفوظٌ للمستخدم على الخادم فيتطابق الجرس على أجهزته كلها؛ يُرسل
     منه ما يخصّ القائمة الحاضرة وحده. تعذّرُ قراءته لا يُسقط الجرس. */
  const listed = new Set(items.map(item => seenKey(item)));
  const seen = (await seenStored).filter(key => listed.has(key));
  res.json({ termId, termName, planningTermId: planning || 0, planningTermName: planningName, items, seen });
});

/* تعليمُ إشعاراتٍ كمقروءة للمستخدم نفسه وحده (src/utils/notificationSeen.ts). */
app.post("/api/notifications/seen", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const ids = cleanSeenIds(req.body?.ids);
  if (!ids.length) { res.json({ ok: true, stored: 0 }); return; }
  const stored = await Repository.addNotificationSeen(Number(req.user?.SystemUserId), ids);
  res.json({ ok: true, stored: stored.length });
});
}
