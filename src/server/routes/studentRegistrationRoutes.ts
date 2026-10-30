/**
 * ── تسجيلُ الطلبة ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { Response } from "express";
import { Repository, StudentCourseStateConflict, withSerialLock, caseRefFor } from "../../db/repository";
import { isFullySigned } from "../../utils/approvalWorkflow";
import { canReviewSubmissions, isRegistrarRole, isViewerOnlyRole, roleLabel } from "../../utils/academicRoles";
import { isCaseLevelNeed, studentCaseStatus } from "../../utils/studentCaseDecision";
import { sectionOwnsNeed } from "../../utils/studentCaseScope";
import { droppedCourseLabel } from "../../utils/studentNeedMerge";
import { readApproval, refuseIfTermFrozen } from "../core/approvals";
import { type AuthenticatedRequest, requireAnyPermission, requireAuth } from "../core/auth";
import { curriculumLabelsFor } from "../core/planning";
import { applyProposalCore, deleteScheduleHandler, type ProposalOutcome, runScheduleHandler } from "../core/scheduleWrites";
import { isScopeAllowed } from "../core/scope";
import { studentIdentityFor } from "../core/studentIdentity";
import { bumpTeamWork } from "../teamPresence";
import { caseStampOf, expectedStamp, STALE_WRITE_CODE, STALE_WRITE_MESSAGE } from "../../utils/staleWrite";

/* ══════════════════════════════════════════════════════════════════════════
   كشفُ التسجيل — الطرفان على ورقةٍ واحدة
   ══════════════════════════════════════════════════════════════════════════

   القسم يجمع رغبات الطلبة بالاستبيان ثم يسلّمها التسجيلَ يدوياً، والطالبُ
   بينهما لا يعرف شيئاً. وهذا الكشفُ يضع الثلاثة على ورقةٍ واحدة: التسجيلُ
   يكتب أين وصل كلُّ مقرّر، والقسمُ يقرأ ما كتبه لحظتَها، والطالبُ يراه في
   صفحته.

   و**الكشفُ واحدٌ لا اثنان**. هو الطلباتُ نفسُها التي يقرؤها القسم في مركز
   الذكاء، لا نسخةٌ منها: نسختان تفترقان عند أول تعديل، ثم يختلف الطرفان على
   أيُّهما الصحيح — وهو بالضبط ما يُفترض أن يُنهيه هذا العمل.

   وثلاثةُ حدود:

   ١) لا يُكتب في جدولٍ ولا في شعبة. الحالةُ قولٌ عن طلب طالبٍ بعينه، لا عن
      مقعد. النظامُ لا يملك مقاعد ولا يدّعي امتلاكها، والتسجيلُ هو صاحبُها.

   ٢) الكتابةُ للتسجيل ولمن يبني الجدول، لا لكل من يرى الكشف. وصفةُ العرض
      الصرف تقرأ ولا تكتب، كما في كل مسارٍ آخر.

   ٣) والنطاقُ يُحرس مرّتين: عند قراءة الكشف، وعند الكتابة في سجلٍّ بعينه —
      لأن معرّفَ السجلّ يُرسله المتصفّح، ولا يُصدَّق لمجرّد أنه وصل.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * من يكتب في الكشف: التسجيلُ ومن يبني الجدول فعلاً.
 *
 * و«فعلاً» هي الكلمة: كان القرارُ يُقاس على قالب الصفة — `roleDefinition(role)
 * .formIds` — وقالبُ الصفة العاديّة يحوي إذنَ الورشة دائماً. فحسابٌ عاديٌّ
 * مُنح إذنَ التقارير وحده، ولم يُمنح إذنَ الورشة قطّ، كان يمرّ من هنا ويكتب:
 * القالبُ يقول ما تفعله الصفةُ عادةً، لا ما مُنحه هذا الحسابُ بعينه.
 *
 * فصار يُقاس على `req.permissions` — الأذونات الممنوحة نفسها التي يقرؤها
 * `requirePermission`. صفةُ التسجيل تكتب بصفتها، ومن سواها يكتب بإذنه.
 */
const canWriteRegistration = (role: unknown, powerUser: boolean, granted: number[]): boolean => {
  if (powerUser) return true;
  /* صفةُ العرض الصرف تقرأ ولا تكتب، مهما مُنحت من أذونات. */
  if (isViewerOnlyRole(role)) return false;
  if (isRegistrarRole(role) || canReviewSubmissions(role)) return true;
  return granted.includes(7);
};

/** الأذونات الممنوحة لهذا الحساب، بالفعل لا بالقالب. */
const grantedPermissions = async (req: AuthenticatedRequest): Promise<number[]> =>
  req.permissions ?? (req.user
    ? (await Repository.getSecurityByUser(req.user.SystemUserId)).map(item => Number(item.FormNameId))
    : []);

/**
 * قسمُ الاستبيان الذي يملك هذا الطلب — `sectionOwnsNeed` في
 * src/utils/studentCaseScope.ts: اشتقاقٌ واحدٌ للقراءة والكتابة معاً، وهو ما
 * يعرضه سجلُّ مركز الذكاء (`surveyOwnsNeed`) وزيادةُ كلِّ قسمٍ يملك مقرّراً فيه.
 */
/** أقسامُ نطاق الحساب التي تملك هذا الطلب — ما يُكتب به في المقرّر وفي الحالة كلها. */
const owningSectionsInScopeFor = async (req: AuthenticatedRequest, need: any, allCourses: any[]): Promise<number[]> =>
  (await Repository.getSections() as any[])
    .filter(row => Number(row.AdCollegeId) === Number(need.AdCollegeId))
    .map(row => Number(row.AdSectionId))
    .filter(candidate => sectionOwnsNeed(need, allCourses, candidate)
      && isScopeAllowed(req, Number(need.AdCollegeId), candidate));

const STUDENT_COURSE_STATES = new Set(["awaiting-registration", "committee-rejected", "registered", "rejected"]);
const STUDENT_REJECT_REASONS = new Set(["no-seat", "prerequisite", "level", "conflict", "closed", "other"]);
const STUDENT_COMMITTEE_REASONS = new Set(["not-eligible", "not-in-plan", "prerequisite", "duplicate", "other"]);

/* ── اللجنةُ أولاً، ثم التسجيل ──────────────────────────────────────────────
 *
 * طلبُ الطالب لا يصل التسجيلَ لأنه وصل القسم. تنظر فيه لجنةُ القسم مقرّراً
 * مقرّراً: ما توافق عليه يُسلَّم («بانتظار التسجيل»)، وما لا توافق عليه يبقى
 * عندها بسببه. والتسجيلُ لا يرى إلا ما سلّمته اللجنة، ولا يكتب إلا فيه.
 *
 * - «اللجنة»: كلُّ من يكتب في الكشف من جهة القسم.
 * - «التسجيل»: أدوارُ التسجيل.
 * - صاحبُ الصلاحية الكاملة يرى الجهتين. */
type RegistrationViewer = "committee" | "registration" | "both";
const registrationViewer = (req: AuthenticatedRequest): RegistrationViewer =>
  req.user?.IsAdminUser ? "both" : isRegistrarRole(req.user?.Role) ? "registration" : "committee";
/** ما يراه التسجيل: ما سلّمته اللجنة، وما قرّره هو فيه. */
const reachedRegistration = (state: any): boolean =>
  Boolean(state) && ["awaiting-registration", "registered", "rejected"].includes(String(state.state));

/**
 * الكشف.
 *
 * يقرأ الطلبات نفسها التي يقرؤها مركزُ الذكاء، بالقاعدة نفسها في نسبة الطلب
 * إلى قسم الاستبيان — فما يراه الطرفان واحدٌ حرفاً بحرف.
 */
/**
 * ── لا يصل التسجيلَ شيءٌ قبل التوقيعين ──────────────────────────────────────
 *
 * قاعدةُ القسم: الجدولُ وما يتبعه لا يُعرض على التسجيل حتى يوقّعه رئيسُ لجنة
 * الجدول ورئيسُ القسم معاً. والجدولُ نفسُه محروسٌ بهذا في `canSubmit`؛ وكشفُ
 * طلبات الطلبة كان بابه الثاني مفتوحاً — يقرؤه موظّفُ التسجيل قبل أن يوقّع
 * أحد، فيبني على مسوّدةٍ قد تتغيّر كلُّها غداً.
 *
 * والحرسُ على القارئ من جهة التسجيل وحده: القسمُ يُعدّ كشفَه ويراه قبل
 * التوقيع، فذلك عملُه لا كشفُ غيره.
 */
async function registrarBlockReason(
  req: AuthenticatedRequest, collegeId: number, sectionId: number, termId: number,
): Promise<string | null> {
  if (!isRegistrarRole(req.user?.Role)) return null;
  const approval = await readApproval(collegeId, sectionId, termId);
  if (isFullySigned(approval)) return null;
  return "لم يُوقَّع جدولُ هذا القسم بعد من لجنة الجدول ورئيس القسم، ولا يُعرض على التسجيل قبل ذلك.";
}

export function registerStudentRegistrationRoutes(app: Express): void {

app.get("/api/student-registration", requireAnyPermission([7, 14]), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0);
  const sectionId = Number(req.query.sectionId || 0);
  const termId = Number(req.query.termId || 0);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  const blocked = await registrarBlockReason(req, collegeId, sectionId, termId);
  if (blocked) { res.status(409).json({ error: blocked, code: "not-signed" }); return; }

  const [allTermNeeds, courses, sections] = await Promise.all([
    Repository.getStudentNeeds(collegeId, 0, termId),
    Repository.getCourses(),
    Repository.getSections(),
  ]);
  /* القاعدةُ نفسُها التي يستعملها مركزُ الذكاء: الطلبُ لقسم الاستبيان الذي
     استقبله، ويُستردّ للسجلّات القديمة من ملكيّة مقرّراتها. */
  const needs = (allTermNeeds as any[]).filter(need =>
    sectionOwnsNeed(need, courses as any[], sectionId));

  const courseById = new Map((courses as any[]).map(row => [Number(row.AdCourseId), row]));
  const sectionNameById = new Map((sections as any[]).map(row => [Number(row.AdSectionId), String(row.AdSectionName || "")]));

  const viewer = registrationViewer(req);
  const curriculumOf = await curriculumLabelsFor(needs);
  const rows = (await Promise.all(needs.map(async need => {
    /* ── طلبُ الخريج: قرارٌ في الحالة كلها ────────────────────────────────
       لا مقرّرَ فيه يُعلَّق عليه قرار، فكان يسقط من الكشف عند السطر التالي
       ولا يُجاب أبداً. يُعرض بحقائق التحقق من صحيفة التخرج وقرارٍ واحدٍ
       للّجنة ثم للتسجيل. والتسجيلُ لا يراه قبل موافقة اللجنة. */
    if (isCaseLevelNeed(need)) {
      const caseStatus = studentCaseStatus(need.caseState);
      if (viewer === "registration" && (caseStatus === "pending" || caseStatus === "committee-rejected")) return null;
      return {
        id: String(need.id),
        caseRef: caseRefFor(need),
        ...await studentIdentityFor(req, need),
        createdAt: String(need.createdAt || ""),
        requestType: String(need.requestType || "graduate"),
        studentSectionName: sectionNameById.get(Number(need.studentSectionId || need.AdSectionId || 0)) || "",
        curriculum: curriculumOf(need),
        details: String(need.details || ""),
        caseLevel: true,
        caseStatus,
        caseState: need.caseState || {},
        graduate: {
          reason: need.graduateReason || "",
          passedUnits: Number(need.passedUnits || 0),
          requiredUnits: Number(need.requiredUnits || 0),
          degreeUnits: Number(need.degreeUnits || 0),
          eligibility: String(need.eligibility || "not-checked"),
          nameMatched: Boolean(need.proofNameMatched),
        },
        courses: [] as any[],
      };
    }
    const states = new Map((need.courseStates || []).map((state: any) => [Number(state.courseId), state]));
    /* التسجيلُ لا يرى ما لم تسلّمه اللجنة: لا المنتظرَ عندها ولا ما لم توافق عليه. */
    /* واللجنةُ ترى مقرّرات قسمها وحدها (أو ما لا يُعرف مالكه): الطلبُ القديم
       لقسمين يُعرض على القسمين، وكلٌّ يقرّر في مقرّره هو. */
    /* مقرّرٌ حذفه الطالبُ بعد أن قيل فيه شيء يبقى في الكشف معلَّماً، فلا يبقى
       مقعدٌ محجوزاً باسم من لم يعد يريده دون أن يعرف أحد. */
    const droppedIds = (need.courseStates || [])
      .filter((state: any) => state?.droppedByStudent && !(need.courseIds || []).map(Number).includes(Number(state.courseId)))
      .map((state: any) => Number(state.courseId));
    /* كلُّ مقرّرٍ يُقرَّر في كشف القسم الذي يملكه. ومقرّرُ قسمٍ آخر في طلبٍ
       قُدّم عبر استبيان هذا القسم يُعرض هنا للقراءة وحدها («يقرّره قسم …»)،
       ويُقرَّر في كشف قسمه. */
    const filedHere = Number(need.surveySectionId || need.AdSectionId || 0) === sectionId;
    const ownerOf = (id: any) => Number((courseById.get(Number(id)) as any)?.AdSectionId || 0);
    const decidedHere = (id: any) => { const owner = ownerOf(id); return !owner || owner === sectionId; };
    const visibleCourseIds = [...(need.courseIds || []), ...droppedIds].filter((id: any) => {
      if (!decidedHere(id) && !filedHere) return false;
      if (viewer === "registration") return reachedRegistration(states.get(Number(id)));
      return true;
    });
    if (!visibleCourseIds.length) return null;
    return {
      id: String(need.id),
      /* رقمُ الحالة هو نفسه الذي يحمله الطالب، مشتقٌّ من معرّف السجلّ — فيبحث
         به موظّفُ التسجيل عمّن يقف أمامه بلا أن يسأله عن رقمه المدني. */
      caseRef: caseRefFor(need),
      /* الاسمُ والرقمُ المدنيّ كما يعرضهما سجلُّ مركز الذكاء، للقاعدة نفسها. */
      ...await studentIdentityFor(req, need),
      createdAt: String(need.createdAt || ""),
      requestType: String(need.requestType || "new-course"),
      studentSectionName: sectionNameById.get(Number(need.studentSectionId || need.AdSectionId || 0)) || "",
      curriculum: curriculumOf(need),
      /* طلبُ خريجٍ قيل فيه شيءٌ ثم غيّره الطالب إلى طلب مقرّرات. */
      caseDroppedAt: need.caseDroppedAt && need.caseState ? String(need.caseDroppedAt) : "",
      details: String(need.details || ""),
      /* «تعارض مقررين» يُفهم بطرفيه: المقرّرُ الآخر يُذكر ولو لم يكن في هذا الكشف. */
      partnerCourses: String(need.requestType || "") === "course-conflict"
        ? (need.courseIds || []).filter((id: any) => !visibleCourseIds.map(Number).includes(Number(id))).map((id: any) => {
            const course: any = courseById.get(Number(id));
            return { id: Number(id), code: String(course?.CourseCode || ""), name: String(course?.CourseName || `مقرر ${id}`),
              sectionId: Number(course?.AdSectionId || 0),
              sectionName: sectionNameById.get(Number(course?.AdSectionId || 0)) || "" };
          })
        : [],
      courses: visibleCourseIds.map((id: any) => {
        const course: any = courseById.get(Number(id));
        const state: any = states.get(Number(id));
        return {
          id: Number(id),
          code: String(course?.CourseCode || ""),
          name: String(course?.CourseName || `مقرر ${id}`),
          /* مالكُ المقرّر، ليقرأه السجلُّ المشترك «لهذا القسم» أو «لقسمٍ آخر». */
          sectionId: ownerOf(id),
          sectionName: sectionNameById.get(ownerOf(id)) || "",
          state: String(state?.state || "awaiting-registration"),
          reasonCode: state?.reasonCode,
          note: state?.note,
          by: state?.by,
          byRole: state?.byRole,
          at: state?.at,
          scheduleId: state?.scheduleId,
          sectionCode: state?.sectionCode,
          /* «لم يقل أحدٌ شيئاً» يختلف عن «سلّمه القسم وينتظر»: الأولى غيابُ
             سجلّ، والثانيةُ قولٌ مكتوب. والفرقُ يهمّ من يقرأ. */
          settled: Boolean(state),
          readOnly: !decidedHere(id),
          decidedBySectionName: decidedHere(id) ? undefined : (sectionNameById.get(ownerOf(id)) || "قسم آخر"),
          droppedByStudent: Boolean(state?.droppedByStudent),
          droppedLabel: state?.droppedByStudent ? droppedCourseLabel(state) : undefined,
        };
      }),
    };
  }))).filter((row): row is NonNullable<typeof row> => Boolean(row));

  /* كلُّ بندٍ ينتظر قراراً — مقرّرٌ أو حالةُ خريجٍ كاملة — يُعدّ مرّةً بالتصنيف نفسه. */
  const every: string[] = rows.flatMap((row: any) => row.caseLevel
    ? [String(row.caseStatus)]
    : row.courses.filter((course: any) => !course.readOnly).map((course: any) => !course.settled ? "pending"
      : course.state === "awaiting-registration" ? "approved" : String(course.state)));
  res.setHeader("Cache-Control", "no-store");
  res.json({
    rows: rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    canWrite: canWriteRegistration(req.user?.Role, Boolean(req.user?.IsAdminUser), await grantedPermissions(req)),
    viewer,
    totals: {
      students: rows.length,
      courses: rows.reduce((sum: number, row: any) => sum + row.courses.length, 0),
      pendingCommittee: every.filter(status => status === "pending").length,
      committeeRejected: every.filter(status => status === "committee-rejected").length,
      registered: every.filter(status => status === "registered").length,
      rejected: every.filter(status => status === "rejected").length,
      waiting: every.filter(status => status === "approved").length,
    },
  });
});

/** قولُ التسجيل في مقرّرٍ واحدٍ من طلب طالب. */
app.post("/api/student-registration/:id/course-state", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!canWriteRegistration(req.user?.Role, Boolean(req.user?.IsAdminUser), await grantedPermissions(req))) {
    res.status(403).json({ error: "هذا الكشف للقراءة بصفتك." });
    return;
  }

  const need = await Repository.getStudentNeedById(String(req.params.id || ""));
  if (!need) { res.status(404).json({ error: "لا يوجد طلبٌ بهذا المعرّف" }); return; }
  if (await refuseIfTermFrozen(res, Number(need.AdTermId || 0))) return;
  /* النطاقُ يُحرس هنا أيضاً: المعرّفُ يُرسله المتصفّح، ولا يُصدَّق لأنه وصل.
     وبالاشتقاق نفسِه الذي تقرأ به الشاشةُ، وإلا عُرض ما لا يُكتب فيه. */
  /* الكتابةُ تُحرس بالقاعدة نفسها التي تُعرض بها: أيُّ قسمٍ في نطاق الحساب
     يملك هذا الطلبَ يستطيع أن يكتب فيه — فلا يُعرض ما لا يُكتب فيه، ولا
     يُكتب فيما لا يُعرض. */
  const allCourses = await Repository.getCourses() as any[];
  const owningSectionsInScope = await owningSectionsInScopeFor(req, need, allCourses);
  if (!owningSectionsInScope.length) {
    res.status(403).json({ error: "هذا الطلب خارج نطاقك." });
    return;
  }
  const courseId = Number(req.body?.courseId || 0);
  if (!courseId || !(need.courseIds || []).map(Number).includes(courseId)) {
    res.status(400).json({ error: "هذا المقرّر ليس ضمن طلب الطالب." });
    return;
  }

  /* ── ولا يُكتب فيما لا يُقرأ ─────────────────────────────────────────────
   *
   * موظّفُ التسجيل لا يقول قولاً في مقرّرٍ لقسمٍ لم يوقّع جدولَه بعد — وإلا
   * مرّ الحرسُ على العرض وحده وبقي البابُ مفتوحاً لمن يُرسل الطلبَ مباشرةً
   * بلا شاشة.
   *
   * **والسؤالُ عن قسم المقرّر المطلوب بعينه، لا عن أوّلِ قسمٍ يملك الطلب.**
   * فالطلبُ القديم قد يجمع مقرّرَين لقسمين، وموظّفٌ نطاقُه يشملهما كان يُسأل
   * عن جدول أحدهما ويكتب في مقرّر الآخر: يمرّ على قسمٍ لم يوقّع لأن شريكه
   * وقّع، أو يُمنع عن قسمٍ وقّع لأن شريكه لم يوقّع. ولذلك يُقرأ المقرّرُ قبل
   * هذا الحرس لا بعده.
   *
   * **وإن لم يُعرف مالكُ المقرّر** — وهو حالُ سجلٍّ قديمٍ زال مقرّره من
   * الكتالوج — فلا يُستعار توقيعُ قسمٍ عن قسم. وكان السؤالُ يرجع إلى القسم
   * الذي أجاز القراءة وحده، فمقرّرٌ يتيمٌ كان لقسمٍ لم يوقّع يمرّ بتوقيع
   * شريكه في الطلب: حارسٌ قائمٌ في ظاهره، مخروقٌ في الحالة التي وُضع لها.
   *
   * فالسؤالُ عن كلِّ قسمٍ يملك هذا الطلبَ في نطاق الحساب، ويكفي واحدٌ لم
   * يوقّع ليُمنع. وهو لا يُضيّق على الطلب ذي القسم الواحد — فقسمُه هو نفسُه
   * — ولا يُطلق يداً على طلبٍ لقسمين أحدُهما لم يوقّع. */
  const courseOwnerSection = Number(
    allCourses.find(row => Number(row.AdCourseId) === courseId)?.AdSectionId ?? 0);
  const guardedSections = courseOwnerSection ? [courseOwnerSection] : owningSectionsInScope;
  for (const section of guardedSections) {
    const writeBlocked = await registrarBlockReason(
      req, Number(need.AdCollegeId), section, Number(need.AdTermId || 0));
    if (writeBlocked) { res.status(409).json({ error: writeBlocked, code: "not-signed" }); return; }
  }

  const state = String(req.body?.state || "");
  if (!STUDENT_COURSE_STATES.has(state)) { res.status(400).json({ error: "حالةٌ غير معروفة." }); return; }

  /* ── كلُّ جهةٍ تكتب ما يخصّها وحده ────────────────────────────────────────
     اللجنةُ توافق أو لا توافق، ولا تكتب «سُجّل» ولا «رُدّ» باسم التسجيل.
     والتسجيلُ لا يقرّر في مقرّرٍ لم تسلّمه اللجنة، ولا تنقض اللجنةُ قراراً
     قاله التسجيل. وصاحبُ الصلاحية الكاملة يملك الجهتين. */
  const viewer = registrationViewer(req);
  if (viewer === "committee") {
    if (state !== "awaiting-registration" && state !== "committee-rejected") {
      res.status(403).json({ error: "قرارُ «سُجّل» أو «رُدّ» للتسجيل. اللجنةُ توافق أو لا توافق." });
      return;
    }
    /* لجنةُ القسم تقرّر في مقرّرات قسمها وحدها. الطلبُ القديم قد يجمع مقرّرَين
       لقسمين فيراه القسمان، لكن كلاً منهما يقرّر في مقرّره هو. */
    if (courseOwnerSection && !isScopeAllowed(req, Number(need.AdCollegeId), courseOwnerSection)) {
      res.status(403).json({ error: "هذا المقرّر لقسمٍ آخر؛ تقرّر فيه لجنةُ ذلك القسم." });
      return;
    }
  } else if (viewer === "registration" && state === "committee-rejected") {
    res.status(403).json({ error: "عدمُ الموافقة قرارُ لجنة القسم، لا التسجيل." });
    return;
  }
  /* ما يتوقف على حالة المقرّر الحاليّة يُسأل داخل الكتابة نفسها: قرارا اللجنة
     والتسجيل في اللحظة نفسها لا يمرّ أحدهما على حالةٍ قديمة. */
  /* ختمُ ما رآه الكاتب: وقتُ آخر قرارٍ في هذا المقرّر ("" = لم يُقرَّر فيه شيء). قرارُ زميلٍ قبله
     يُردّ بـ«حدّث ثم أعد» (src/utils/staleWrite.ts) — داخل المعاملة نفسها، فلا يسبقه أحد. */
  const seenAt = expectedStamp(req.body?.expectedAt);
  const guardByState = (current: any): string | null => {
    if (seenAt !== null && String(current?.at || "") !== seenAt) return STALE_WRITE_MESSAGE;
    if (viewer === "committee" && current?.by === "registration" && (current.state === "registered" || current.state === "rejected"))
      return "قرّر التسجيلُ في هذا المقرّر، فلا يُغيَّر من جهة القسم.";
    if (viewer === "registration" && !reachedRegistration(current))
      return "لم توافق لجنةُ القسم على هذا المقرّر بعد، فلا يُكتب فيه من جهة التسجيل.";
    return null;
  };

  const reasonCode = String(req.body?.reasonCode || "");
  if (state === "committee-rejected" && !STUDENT_COMMITTEE_REASONS.has(reasonCode)) {
    res.status(400).json({ error: "اختر سبب عدم الموافقة." });
    return;
  }
  /* الردُّ بلا سببٍ يُعيد الطالبَ إلى المكتب ليسأل «ليش؟» — وهو ما بُني هذا
     الكشفُ ليُغنيَ عنه. */
  if (state === "rejected" && !STUDENT_REJECT_REASONS.has(reasonCode)) {
    res.status(400).json({ error: "اختر سبب الردّ." });
    return;
  }

  /* ── «موافق» تنتقل إلى الجدول الأصلي ──────────────────────────────────────
   *
   * موافقةُ اللجنة على طلبٍ تعذّر تسجيلُه لامتلاء المقرر أو غيابِ شعبته هي، حين يثبت أن شعبةً
   * جديدةً تخلو من التعارض، قرارٌ بفتحها. فتُفتح هنا بالمسار نفسه الذي تفتح به الورشةُ (اعتماد
   * الاقتراح): فإن رُفضت لتعارضٍ أو قفلٍ لم تُسجَّل الموافقةُ، ولم يبقَ قرارٌ بلا جدول.
   * والحرسُ على حالة المقرّر يُسأل قبل الكتابة في الجدول لا بعدها، فلا يُكتب جدولٌ لقرارٍ سيُردّ. */
  const openSection = req.body?.openSection;
  const wantsOpening = Boolean(openSection) && state === "awaiting-registration";
  const owner: any = allCourses.find(row => Number(row.AdCourseId) === courseId);
  if (wantsOpening) {
    if (!(await grantedPermissions(req)).includes(7) && !req.user?.IsAdminUser) {
      res.status(403).json({ error: "فتحُ شعبةٍ في الجدول يحتاج صلاحيةَ الجدول الدراسي.", code: "no-schedule-permission" });
      return;
    }
    if (!owner) { res.status(400).json({ error: "مقرّرٌ زال من الكتالوج؛ لا شعبةَ تُفتح له." }); return; }
  }
  /* مرجعُ الشعبة المفتوحة لهذا الطلب وهذا المقرّر: يجعل التنفيذَ **متكرّرَ الأثر بلا ازدواج** — موافقتان متزامنتان
     (مستخدمان أو إعادةُ ضغطٍ أو إعادةُ محاولةٍ بعد فشل) تجدان الشعبةَ قد فُتحت فتتّفقان عليها ولا تفتحان ثانية. */
  const openingRef = `need:${need.id}:course:${courseId}`;

  const commit = async (): Promise<{ status: number; json: any; audit?: string }> => {
    let opened: ProposalOutcome | null = null;
    let openedRow: any = null;
    let createdNew = false;
    if (wantsOpening) {
      /* الحالةُ تُقرأ طازجةً داخل القفل: ما قرّره غيرُنا قبل لحظة يُحترم قبل أن يُكتب في الجدول شيء. */
      const fresh: any = await Repository.getStudentNeedById(String(need.id));
      if (!fresh) return { status: 404, json: { error: "لا يوجد طلبٌ بهذا المعرّف" } };
      const refusalNow = guardByState((fresh.courseStates || []).find((row: any) => Number(row.courseId) === courseId));
      if (refusalNow) return { status: 409, json: { error: refusalNow, ...(refusalNow === STALE_WRITE_MESSAGE ? { code: STALE_WRITE_CODE } : {}) } };
      const week = await Repository.getSchedulesByScope({ collegeId: Number(owner.AdCollegeId), sectionId: Number(owner.AdSectionId), termId: Number(need.AdTermId) });
      openedRow = (week as any[]).find(row => row.origin?.refId === openingRef && Number(row.AdCourseId) === courseId) || null;
      if (!openedRow) {
        opened = await applyProposalCore(req, {
          kind: "opening", collegeId: Number(owner.AdCollegeId), sectionId: Number(owner.AdSectionId), termId: Number(need.AdTermId),
          courseId, placement: openSection,
          origin: { kind: "student-case", refId: openingRef, note: `موافقة اللجنة على طلب «${String(owner.CourseName || "")}»` },
        });
        if (opened.status >= 400) return { status: opened.status, json: { ...opened.json, stateSaved: false } };
        openedRow = opened.json?.applied?.[0]?.row;
        createdNew = true;
      }
    }

    let saved: any;
    try {
      saved = await Repository.setStudentCourseState(need.id, {
        courseId,
        state: state as any,
        ...(state === "rejected" || state === "committee-rejected" ? { reasonCode: reasonCode as any } : {}),
        ...(openedRow ? { scheduleId: Number(openedRow.id), sectionCode: String(openedRow.SCode) } : {}),
        note: String(req.body?.note || "").trim().slice(0, 300) || (openedRow ? `فُتحت شعبة ${openedRow.SCode} في الجدول.` : undefined),
        by: state === "registered" || state === "rejected" ? "registration" : "department",
        byRole: roleLabel(req.user?.Role) || undefined,
        at: new Date().toISOString(),
      }, guardByState);
    } catch (error: any) {
      /* القرارُ لم يُسجَّل: الشعبةُ التي فُتحت لأجله في هذه العملية تُحذف حتى لا يبقى صفٌّ بلا قرار. وإن تعذّر حذفُها
         بقيت مرجعةً بـ openingRef فتلتقطها المحاولةُ التالية ولا تُنشئ ثانية. */
      let rolledBack = !createdNew;
      if (createdNew && openedRow) {
        const back = await runScheduleHandler(deleteScheduleHandler, req, { params: { id: String(openedRow.id) }, body: {} }).catch(() => null);
        rolledBack = Boolean(back && back.status < 400);
      }
      if (error instanceof StudentCourseStateConflict) return { status: 409, json: { error: error.message, ...(error.message === STALE_WRITE_MESSAGE ? { code: STALE_WRITE_CODE } : {}), stateSaved: false, rolledBack } };
      console.error("[student-registration] تعذّر تسجيل القرار بعد فتح الشعبة:", error instanceof Error ? error.message : error);
      return { status: 500, json: { error: "تعذّر تسجيل القرار.", stateSaved: false, rolledBack } };
    }
    if (!saved) return { status: 404, json: { error: "لا يوجد طلبٌ بهذا المعرّف" } };
    return {
      status: 200, audit: opened?.audit,
      json: { ok: true, courseStates: saved.courseStates || [], ...(openedRow ? { opened: { id: openedRow.id, sectionCode: openedRow.SCode, amendment: opened?.json?.amendment || null, reused: !createdNew } } : {}) },
    };
  };

  const outcome = wantsOpening ? await withSerialLock(`student-open:${need.id}:${courseId}`, commit) : await commit();
  if (outcome.audit) res.locals.auditChanges = outcome.audit;
  if (outcome.status < 300) bumpTeamWork(req.demoSessionId || "", Number(need.AdCollegeId || 0), Number(need.AdTermId || 0));
  res.setHeader("Cache-Control", "no-store");
  res.status(outcome.status).json(outcome.json);
});

/**
 * قرارٌ في الحالة كلها — طلبُ الخريج الذي لا يسمّي مقرّراً.
 *
 * الحراسُ أنفسُهم التي يمرّ بها قرارُ المقرّر: صلاحيةُ الكتابة، ونطاقُ القسم
 * المالك بالاشتقاق نفسِه (`sectionOwnsNeed`)، وتوقيعا الجدول قبل أن يكتب
 * التسجيل، والترتيبُ (`studentCaseRefusal`) يُسأل داخل المعاملة.
 * والأسبابُ من القائمتين المغلقتين نفسيهما، والسطرُ الحرّ «سطرٌ للطالب».
 */
app.post("/api/student-registration/:id/case-state", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!canWriteRegistration(req.user?.Role, Boolean(req.user?.IsAdminUser), await grantedPermissions(req))) {
    res.status(403).json({ error: "هذا الكشف للقراءة بصفتك." });
    return;
  }
  const need = await Repository.getStudentNeedById(String(req.params.id || ""));
  if (!need) { res.status(404).json({ error: "لا يوجد طلبٌ بهذا المعرّف" }); return; }
  if (await refuseIfTermFrozen(res, Number(need.AdTermId || 0))) return;
  if (!isCaseLevelNeed(need)) { res.status(400).json({ error: "هذا الطلب يُقرَّر مقرّراً مقرّراً." }); return; }
  const owningSectionsInScope = await owningSectionsInScopeFor(req, need, await Repository.getCourses() as any[]);
  if (!owningSectionsInScope.length) { res.status(403).json({ error: "هذا الطلب خارج نطاقك." }); return; }

  const viewer = registrationViewer(req);
  const requestedSide = String(req.body?.side || "");
  const side: "committee" | "registrar" | null = requestedSide === "committee" || requestedSide === "registrar"
    ? requestedSide : viewer === "registration" ? "registrar" : viewer === "committee" ? "committee" : null;
  if (!side) { res.status(400).json({ error: "حدّد الجهة: اللجنة أو التسجيل." }); return; }
  if (viewer === "committee" && side !== "committee") {
    res.status(403).json({ error: "قرارُ التنفيذ أو الردّ للتسجيل. اللجنةُ توافق أو لا توافق." }); return;
  }
  if (viewer === "registration" && side !== "registrar") {
    res.status(403).json({ error: "الموافقةُ وعدمُها قرارُ لجنة القسم، لا التسجيل." }); return;
  }
  if (side === "registrar") {
    for (const section of owningSectionsInScope) {
      const writeBlocked = await registrarBlockReason(req, Number(need.AdCollegeId), section, Number(need.AdTermId || 0));
      if (writeBlocked) { res.status(409).json({ error: writeBlocked, code: "not-signed" }); return; }
    }
  }
  const decision = String(req.body?.decision || "");
  if (!["approved", "rejected", "pending"].includes(decision)) { res.status(400).json({ error: "قرارٌ غير معروف." }); return; }
  const reasonCode = String(req.body?.reasonCode || "");
  if (decision === "rejected") {
    const allowed = side === "committee" ? STUDENT_COMMITTEE_REASONS : STUDENT_REJECT_REASONS;
    if (!allowed.has(reasonCode)) {
      res.status(400).json({ error: side === "committee" ? "اختر سبب عدم الموافقة." : "اختر سبب الردّ." }); return;
    }
  }
  const next = decision === "pending" ? null : {
    state: decision as "approved" | "rejected",
    ...(decision === "rejected" ? { reasonCode: reasonCode as any } : {}),
    note: String(req.body?.note || "").trim().slice(0, 300) || undefined,
    byRole: roleLabel(req.user?.Role) || undefined,
    at: new Date().toISOString(),
  };
  let saved: any;
  const seenStamp = expectedStamp(req.body?.expectedStamp);
  try {
    saved = await Repository.setStudentCaseDecision(need.id, side, next,
      current => seenStamp !== null && caseStampOf(current.caseState) !== seenStamp ? STALE_WRITE_MESSAGE : null);
  }
  catch (error: any) {
    if (error instanceof StudentCourseStateConflict) { res.status(409).json({ error: error.message, ...(error.message === STALE_WRITE_MESSAGE ? { code: STALE_WRITE_CODE } : {}) }); return; }
    throw error;
  }
  if (!saved) { res.status(404).json({ error: "لا يوجد طلبٌ بهذا المعرّف" }); return; }
  bumpTeamWork(req.demoSessionId || "", Number(need.AdCollegeId || 0), Number(need.AdTermId || 0));
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, caseState: saved.caseState || {}, caseStatus: studentCaseStatus(saved.caseState) });
});
}
