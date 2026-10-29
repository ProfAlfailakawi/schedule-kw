/**
 * ── الاعتماد: الأقفال والمعاملات وتسجيلُ التغيير ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { Response } from "express";
import { ApprovalRevisionConflict, Repository, withSerialLock } from "../../db/repository";
import { termIsArchive, termIsFrozen, TERM_FROZEN_MESSAGE } from "../../utils/termSequence";
import type { ScheduleApproval } from "../../types";
import { departmentFamily } from "../../utils/sectionLabel";
import { describeWholesaleRefusal, emptyApproval, isWholesaleChange, readDeadline, type DeadlineState, type WholesaleAction, appendApprovalEvent, approvalLockReason, mergePendingAdditions, openRound, roundBaselineVersionId, TERM_CLOSED_APPROVAL_MESSAGE } from "../../utils/approvalWorkflow";
import { approvalBlockerCount, type ApprovalBlockerOptions } from "../../utils/scheduleBlockers";
import { periodBalanceFinding, reviewSchedule } from "../../utils/scheduleRegulations";
import { isAcademicRole, signatureStage } from "../../utils/academicRoles";
import type { AuthenticatedRequest } from "./auth";

/* The Authority-PDF report belongs to the normal inquiry/report centre. It is
   scoped by the header selections and always compares the latest imported
   baseline with the timetable as it exists right now. */
/* ══════════════════════════════════════════════════════════════════════════
   دورة الاعتماد
   ══════════════════════════════════════════════════════════════════════════

   كل ما يلي يقرأ قراره من `utils/approvalWorkflow` ولا يخترع قاعدةً لنفسه.
   والسبب أن هذه القواعد اتُّفق عليها واحدةً واحدة، وكلٌّ منها كانت تحتمل غير
   ما استقرّت عليه — فلو تفرّقت بين المسارات لاختلفت نسخةٌ منها عن أخرى عند
   أول تعديل، ولما ظهر الاختلاف في أي شاشة.

   وهذه المسارات هي البابُ الضيّق الوحيد الذي يمرّ منه صاحب الصفة القارئة:
   لأن الملاحظة والتوقيع والإرجاع ليست تعديلاً على الجدول، بل الطريقة التي
   يشارك بها من لا يملك أن يمسّ صفّاً.                                       */

/**
 * ── القفل بعد الإرسال، والفتح بعد القبول ────────────────────────────────────
 *
 * جدولٌ عند التسجيل لا يُعدَّل: الطرف الآخر يقرؤه الآن، وتغييرُه تحت يده يجعل
 * ملاحظته على شيءٍ لم يعد موجوداً.
 *
 * أمّا بعد القبول فالتعديل مفتوح — لكنه لا يمرّ صامتاً. القسم الذي يكتشف خطأً
 * بعد القبول يعدّله فيعود جدوله إلى «عند التسجيل» جولةً جديدة تلقائياً، فيرى
 * التسجيل ما تغيّر وحده. والبديل — أن يطلب القسم فتحاً يدوياً من المدير في كل
 * مرّة — كان سيدفع الجميع إلى إصلاح الأخطاء خارج النظام.
 *
 * تُعيد الدالّة رسالة المنع إن وُجد مانع، و `null` إن جاز المضيّ.
 */
export async function scheduleLockRefusal(
  req: AuthenticatedRequest, collegeId: number, sectionId: number, termId: number,
  /* `registrarLock: false` لما لا يقفله التسجيل: استثناءُ الأسبوع، وقرارُ طلب
     الأستاذ، وإصدارُ روابطه. يبقى عليها حكمُ الفصل المنتهي وحده (R8). */
  options: { registrarLock?: boolean } = {},
): Promise<string | null> {
  /* ── وفصلٌ انتهى لا يُعدَّل ──────────────────────────────────────────────
   *
   * كانت علامةُ «منتهٍ» تُعرض ولا تمنع شيئاً: تُقرأ في شاشة الفصول وفي عنوان
   * الجدول، ثم يُحفظ فيه ما شاء من شاء. فالمقرّرُ الذي انتهى وسُلّمت درجاتُه
   * يمكن أن يتغيّر وقتُه بعد شهرين، ولا يعرف أحدٌ أن ما يقرؤه اليومَ ليس ما
   * جرى في حينه.
   *
   * ويُقرأ العلَمُ الصريحُ وحدَه — ما أعلنه المنسّق بيده — لا المشتقُّ من
   * ترتيب الفصول. لأن `isTermClosed` تعدّ كلَّ فصلٍ ليس الأحدثَ منتهياً،
   * فالأخذُ بها هنا يُجمّد عشرَ سنواتٍ من الفصول دفعةً واحدة، ولم يُطلب ذلك.
   *
   * ولجنةُ الجدول تعمل فيه: هي التي تجرّب وتصحّح. ومن سواها يقرأ ويطبع
   * ويستعلم — ولا يكتب. ومن أراد فتحَه يرفع العلامةَ من شاشة الفصول، وذلك
   * فعلٌ ظاهرٌ مسجَّل، لا بابٌ خلفيّ. */
  /* ── واللجنةُ تُعرف بصفتها المكتوبة، لا بالافتراض ────────────────────────
   *
   * `signatureStage` تسقط إلى صفةٍ افتراضيةٍ حين لا تُعرف الصفة — وهي
   * `committeeChair` — فحسابٌ بلا صفةٍ مكتوبة يُقرأ «لجنة». وحسابُ الإدارة
   * الجذر من هؤلاء عن قصد: الترحيلُ يستثنيه من إسناد الصفات. فكان يمرّ من
   * فوق هذا التجميد كلِّه بلا أن يرفع العلامة، ويسقط معه البابُ الظاهرُ
   * المسجَّل الذي وُضع ليكون الطريقَ الوحيد.
   *
   * فالشرطُ صفةٌ مكتوبةٌ صراحةً، لا صفةٌ يُسقط إليها الغياب. */
  const role = req.user?.Role;
  const isCommittee = isAcademicRole(role) && signatureStage(role) === "committee";
  const term = (await Repository.getTerms()).find(row => Number(row.AdTermId) === Number(termId));
  const termClosed = term?.AdTermClosed === true;
  const approval = options.registrarLock === false ? undefined : await Repository.getScheduleApproval(collegeId, sectionId, termId);
  /* القاعدةُ نفسُها التي تقرؤها الشاشة قبل أن يمدّ أحدٌ يده (R21): من
     `approvalLockReason` وحدها، لا نسخةٌ ثانية هنا تفترق عنها. */
  return approvalLockReason(approval, {
    termClosed, isCommittee,
    registrarNotesInCurrentRound: approval ? await registrarNotesInRound(approval) : 0,
    registrarLock: options.registrarLock,
  });
}

/** كم ملاحظةً كتبها التسجيل في الجولة الجارية — ما يُغلق جولةَ التعديل. */
async function registrarNotesInRound(approval: ScheduleApproval): Promise<number> {
  if (approval.status !== "submitted") return 0;
  const notes = await Repository.getScheduleCommentsByScope(approval.AdCollegeId, approval.AdSectionId, approval.AdTermId);
  return notes.filter(note => note.origin === "registrar" && Number(note.round || 1) === Number(approval.currentRound)).length;
}

/** أانتهى الفصل بعلامةٍ صريحة؟ (R23) */
async function termIsClosed(termId: number): Promise<boolean> {
  const term = await Repository.getTermById(termId);
  return (term as any)?.AdTermClosed === true;
}

/** حدثٌ في سجلّ الدورة باسم صاحب الطلب وصفته. */
export function withEvent(req: AuthenticatedRequest, approval: ScheduleApproval, action: string, detail?: string, round?: number): ScheduleApproval {
  return appendApprovalEvent(approval, {
    by: String(req.user?.Name || req.user?.SystemUserLogin || ""),
    role: String(req.user?.Role || (req.user?.IsAdminUser ? "admin" : "")),
    action, detail, round,
  });
}

/**
 * ما بعد التعديل: فتحُ جولة تعديل، وتسجيل ما أُضيف بعد التوقيع.
 *
 * تُستدعى بعد نجاح التعديل لا قبله، لأنها تصف ما وقع فعلاً. وهي صامتةٌ عند
 * الفشل عمداً: لا يجوز أن يُبطِل عجزُ سجلٍّ إداريٍّ عن الكتابة حفظَ موعدٍ
 * دراسيٍّ صحيح.
 */
export async function noteScheduleMutation(
  req: AuthenticatedRequest,
  collegeId: number, sectionId: number, termId: number,
  change: { kind: "add" | "edit" | "delete"; row?: any; rows?: any[] },
): Promise<void> {
  try {
    /**
     * ── على الطابور نفسه الذي تقف عليه قرارات الاعتماد ────────────────────
     *
     * هذه الدالّة تقرأ وثيقة الاعتماد ثم تكتبها كاملة، كقرارات الدورة كلها.
     * فهي على الطابور نفسه وبالمراجعة نفسها: رئيسُ القسم يضغط «موافق» على
     * الشُّعب المضافة، واستيرادٌ قرأ الوثيقة قبلها بلحظة لا يكتب فوقه.
     */
    await withSerialLock(`approval:${collegeId}:${sectionId}:${termId}`, async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try { await applyScheduleMutation(req, collegeId, sectionId, termId, change); return; }
        catch (error) { if (!(error instanceof ApprovalRevisionConflict) || attempt === 1) throw error; }
      }
    });
  } catch (error) {
    console.error("[approval] تعذّر تحديث سجلّ الاعتماد بعد تعديل الجدول:", error instanceof Error ? error.message : error);
    /* ── لا يمرّ تعديلُ المعتمد بلا جولة (مراجعة 6) ─────────────────────────
     * كان الفشلُ هنا يُبلع: جدولٌ معتمد يُعدَّل ويبقى «معتمداً» ولا يعلم
     * التسجيل. فتُكتب علامةٌ فوق آخر مراجعة، ويفتح الجولةَ أوّلُ من يقرأ
     * الوثيقة (settlePendingAmendment)، ويُقال للشاشة في ترويسة الردّ. */
    try {
      const marked = await Repository.markScheduleApprovalAmendmentPending(collegeId, sectionId, termId, {
        at: new Date().toISOString(),
        by: String(req.user?.Name || req.user?.SystemUserLogin || ""),
        role: String(req.user?.Role || (req.user?.IsAdminUser ? "admin" : "")),
        kind: change.kind,
      });
      if (marked) {
        console.error(`[approval] عُلّم ${collegeId}:${sectionId}:${termId} بتعديلٍ ينتظر جولته.`);
        if (req.res && !req.res.headersSent) req.res.setHeader("X-Approval-Amendment", "pending");
      }
    } catch (markError) {
      console.error("[approval] تعذّر حتى تعليمُ التعديل المنتظر:", markError instanceof Error ? markError.message : markError);
      if (req.res && !req.res.headersSent) req.res.setHeader("X-Approval-Amendment", "failed");
    }
  }
}

/**
 * ── ما بعد تعديل جدولٍ معتمد: جولةُ تعديل (R8)، أو حدثٌ في فصلٍ منتهٍ (R23) ──
 * مكانٌ واحد يقرؤه التعديلُ نفسه (applyScheduleMutation) ومن يُصفّي علامةَ
 * تعديلٍ لم تُفتح جولتُه (settleAmendmentMarker). `event` يكتب الحدث باسم صاحب
 * التعديل، لا باسم من صادف أن قرأ الوثيقة.
 */
type ApprovalEventWriter = (approval: ScheduleApproval, action: string, detail?: string, round?: number) => ScheduleApproval;
async function amendmentAfterEdit(
  approval: ScheduleApproval, termId: number, by: string, kind: "add" | "edit" | "delete", event: ApprovalEventWriter,
): Promise<ScheduleApproval> {
  if (approval.status !== "accepted") return approval;
  /* ── الفصلُ المنتهي لا تُفتح فيه جولة (R23) ─────────────────────────
   * لجنةُ الجدول تعمل في فصلٍ منتهٍ، والتسجيلُ لا يراجع فيه شيئاً. فتعديلُها
   * يُسجَّل حدثاً ظاهراً في السجلّ، ولا يُرسل الجدول إلى وارد لا ينتظره. */
  if (await termIsClosed(termId)) {
    return event(approval, "closed-term-edit", kind === "add" ? "إضافة" : kind === "delete" ? "حذف" : "تعديل");
  }
  /* ── جولةُ تعديل، لا قفل (R8) ─────────────────────────────────────
   * أولُ تعديلٍ على جدولٍ مقبول يفتح جولةً أساسُها ما قُبل، ويبقى
   * التعديل فيها مفتوحاً حتى يكتب التسجيل ملاحظة. والجولةُ تُبنى من
   * الدالّة نفسها التي يبني بها الإرسالُ جولته. */
  const baselineVersionId = roundBaselineVersionId(approval, approval.currentRound + 1, { acceptedOnly: true });
  const opened = openRound(approval, { at: new Date().toISOString(), by, amendment: true, baselineVersionId });
  return event({ ...approval, status: "submitted", ...opened }, "amendment-open", undefined, opened.currentRound);
}

/** تُصفّى العلامة في الذاكرة: تُمحى، وتُفتح الجولة إن كان الجدول ما زال معتمداً. */
export async function settleAmendmentMarker(approval: ScheduleApproval): Promise<ScheduleApproval> {
  const marker = approval.amendmentPending;
  if (!marker) return approval;
  const { amendmentPending: _settled, ...rest } = approval;
  const event: ApprovalEventWriter = (row, action, detail, round) => appendApprovalEvent(row, { by: marker.by, role: marker.role || "", action, detail, round });
  return amendmentAfterEdit(rest as ScheduleApproval, approval.AdTermId, marker.by, marker.kind, event);
}

async function applyScheduleMutation(
  req: AuthenticatedRequest,
  collegeId: number, sectionId: number, termId: number,
  change: { kind: "add" | "edit" | "delete"; row?: any; rows?: any[] },
): Promise<void> {
  const approval = await Repository.getScheduleApproval(collegeId, sectionId, termId);
  if (!approval) return;
  /* علامةُ تعديلٍ سابقٍ لم تُفتح جولتُه تُصفّى أوّلاً (مراجعة 6). */
  let next: ScheduleApproval = await settleAmendmentMarker(approval);
  const by = String(req.user?.Name || req.user?.SystemUserLogin || "");

  /* الإضافة بعد توقيع رئيس القسم وحدها ما ينتظر إقراره: تغييرُ قاعةٍ يُبدّل
     خانةً في صفٍّ وافق عليه، وإضافةُ شعبةٍ تُنشئ التزاماً لم يره أصلاً. */
  /* ورئيسُ القسم يعتمد المرّةَ الأولى وحدها: بعد أول قبولٍ من التسجيل تمرّ
     تعديلاتُ اللجنة إلى التسجيل مباشرة، فلا يُنتظر إقرارُه على إضافة. */
  const everAccepted = next.rounds.some(round => Boolean(round.acceptedAt));
  const headSignature = everAccepted ? undefined : next.signatures.find(item => item.stage === "head");
  const addedRows = change.kind === "add" ? (change.rows || (change.row ? [change.row] : [])) : [];
  if (headSignature && addedRows.length) {
    const at = new Date().toISOString();
    const fresh = addedRows
      .filter(row => row)
      .map(row => ({
        scheduleId: Number(row.id),
        courseId: Number(row.AdCourseId || 0),
        courseName: String(row.AdCourseName || ""),
        sectionCode: String(row.SCode || ""),
        addedAt: at,
        addedBy: by,
      }));
    /* ── ما زاد على السقف يُعدّ ولا يسقط (R14) ────────────────────────────
     * كان يُقصّ عند ستين فيضيع ما بعده. فيُسمّى ما يُقرأ، ويُعدّ الباقي،
     * ويمنع الإرسالَ كلُّه حتى يُقرّ. */
    const merged = mergePendingAdditions(next, fresh);
    if (merged.pendingAdditions.length !== next.pendingAdditions.length
        || merged.pendingAdditionsOverflow !== Number(next.pendingAdditionsOverflow || 0)) {
      next = { ...next, ...merged };
    }
  }
  /* صفٌّ حُذف قبل أن يُقرّ لا ينتظر إقراراً: ما عاد موجوداً ليوافق عليه أحد.
     والشرط قبل البناء لا بعده: بناءُ كائنٍ جديد في كل حذفٍ يجعل فحص التغيير
     في الأسفل صادقاً دائماً، فتُكتب وثيقةُ الاعتماد في كل حذفِ موعد. */
  if (change.kind === "delete" && change.row
      && next.pendingAdditions.some(item => Number(item.scheduleId) === Number(change.row.id))) {
    next = { ...next, pendingAdditions: next.pendingAdditions.filter(item => Number(item.scheduleId) !== Number(change.row.id)) };
  }

  next = await amendmentAfterEdit(next, termId, by, change.kind, (row, action, detail, round) => withEvent(req, row, action, detail, round));

  if (next !== approval) await Repository.saveScheduleApproval(next);
}

/**
 * ── التسليم الشامل بعد الموعد ───────────────────────────────────────────────
 *
 * ما يُمنع بعد الموعد هو نوعُ الفعل لا حجمه: استيرادُ ملفٍّ ونسخُ فصلٍ
 * يستبدلان الجدول كله بحكم تعريفهما، والحذفُ الجماعي يُقاس بالنسبة لا بالعدد —
 * لأن عشرين صفّاً في قسمٍ صغير هي جدوله كله، وفي قسمٍ كبير تصحيحٌ عادي.
 *
 * وتبقى التعديلات الجزئية مفتوحةً بعد الموعد كما قبله، لأن القاعة تتغيّر
 * والأستاذ يعتذر ولا ينتظر أيٌّ منهما تاريخاً في تقويم.
 */
export async function wholesaleRefusal(collegeId: number, sectionId: number, termId: number, action: WholesaleAction): Promise<string | null> {
  if (!isWholesaleChange(action)) return null;
  const approval = await readApproval(collegeId, sectionId, termId);
  const deadline = await readDeadlineFor(approval, termId);
  if (!deadline.past) return null;
  return describeWholesaleRefusal(action, deadline);
}

/**
 * التعارض المادّي وحده — لا اللائحة — هو ما يُحصى هنا.
 *
 * والعدّ مفصولٌ عن القراءة عمداً: صندوق وارد التسجيل يسأل هذا السؤال عن كل
 * قسمٍ في الكلية دفعةً واحدة، فلو حملت الدالّة قراءتَها معها لقرأت جدول الفصل
 * كاملاً مرّةً لكل قسم — عشرين قراءةً كاملة لشاشةٍ تُفتح عشرين مرّةً في اليوم.
 * فتُقرأ مرّةً في الأعلى، وتُمرَّر.
 */
export function countBlockingConflicts(scopeRows: any[], termRows: any[], options: ApprovalBlockerOptions = {}): number {
  /* القاعدة نفسها في `scheduleBlockers` — هذا اسمها القديم فقط. */
  return approvalBlockerCount(scopeRows, termRows, options);
}

/** موانع اللائحة الظاهرة وقت التوقيع والإرسال. */
export async function regulationNoticesForScope(collegeId: number, sectionId: number, termId: number) {
  try {
    const [sections, courses, instructors] = await Promise.all([
      Repository.getSections(),
      Repository.getCourses(),
      Repository.getInstructors(),
    ]);
    const family = departmentFamily(sections as any[], collegeId, sectionId);
    const [rows, scopeRows] = await Promise.all([
      Promise.all(family.map(member => Repository.getSchedulesByScope({ collegeId: member.collegeId, sectionId: member.sectionId, termId }))).then(groups => groups.flat()),
      Repository.getSchedulesByScope({ collegeId, sectionId, termId }),
    ]);
    const findings = reviewSchedule({
      rows: rows as any,
      courses: new Map(courses.map((row: any) => [Number(row.AdCourseId), row])),
      instructors: new Map(instructors.map((row: any) => [Number(row.AdInstructorId), row])),
    });
    const familyRows = rows;
    const familyBalance = periodBalanceFinding(familyRows as any);
    const allFindings = [...findings, ...(familyBalance ? [familyBalance] : [])];
    const ownIds = new Set(scopeRows.map((row: any) => Number(row.id)));
    return allFindings
      .filter(item => item.approvalEffect === "block" && item.source === "decision-1912")
      .map(item => ({
        rule: String(item.rule || ""),
        article: String(item.article || ""),
        source: item.source,
        approvalEffect: item.approvalEffect,
        title: String(item.title || "مانع لائحي"),
        detail: String(item.detail || ""),
        rowIds: item.rowIds.map(Number).filter(id => ownIds.has(id)),
        ...(item.data ? { data: item.data } : {}),
      }));
  } catch {
    /* فشلُ الفحص لا يُعامل كأن الجدول سليم؛ أعد المحاولة قبل الاعتماد. */
    return [{
      rule: "regulation-review-unavailable",
      article: "مراجعة الاعتماد",
      source: "decision-1912",
      approvalEffect: "block",
      title: "تعذر فحص موانع اللائحة",
      detail: "أعد المحاولة قبل الاعتماد.",
      rowIds: [],
    }];
  }
}

/** السجلّ كما هو، أو سجلٌّ فارغٌ لقسمٍ لم يبدأ الدورة. */
export async function readApproval(collegeId: number, sectionId: number, termId: number): Promise<ScheduleApproval> {
  const stored = await Repository.getScheduleApproval(collegeId, sectionId, termId);
  return stored || emptyApproval(collegeId, sectionId, termId);
}

/** الموعد الساري لهذا القسم: تمديده إن وُجد، وإلا موعد فصله — بتوقيت الكويت (R15). */
export async function readDeadlineFor(approval: ScheduleApproval, termId: number): Promise<DeadlineState> {
  const term = await Repository.getTermById(termId);
  return readDeadline({
    termDeadline: (term as any)?.AdTermSubmissionDeadline,
    extensionUntil: approval.extensionUntil,
    extensionReason: approval.extensionReason,
  }, new Date());
}

/**
 * ── فصلٌ منتهٍ: الدورةُ مغلقة (R23) ────────────────────────────────────────
 * كلُّ فعلٍ يكتب في وثيقة الاعتماد يُسأل هذا أولاً، برسالةٍ واحدةٍ واضحة.
 */
export async function refuseIfTermClosed(res: Response, termId: number): Promise<boolean> {
  /* فصلٌ صار أرشيفاً (أُغلق أو انقضى وليس الجاري) لا توقيعَ فيه ولا مواعيد. */
  const terms = await Repository.getTerms();
  const term = terms.find(row => Number(row.AdTermId) === Number(termId));
  if (!(await termIsClosed(termId)) && !termIsArchive(term as any, terms as any)) {
    /* فصلٌ أقدمُ من الجاري يُجمَّد أيضاً وإن لم يُعلَن منتهياً (انظر termIsFrozen). */
    if (!termIsFrozen(termId, terms as any)) return false;
    res.status(409).json({ error: TERM_FROZEN_MESSAGE, code: "term-frozen" });
    return true;
  }
  res.status(409).json({ error: TERM_CLOSED_APPROVAL_MESSAGE, code: "term-closed" });
  return true;
}


/**
 * ── فصلٌ سابق: للعرض فقط ────────────────────────────────────────────────────
 * كشفُ التسجيل ورغباتُ الأساتذة وتغييراتُ الجدول تُقرأ في أي فصل، وتُكتب في
 * الجاري (والقادم) وحدهما. القاعدةُ في `termIsFrozen` نفسِها التي تقرؤها الشاشة.
 */
export async function refuseIfTermFrozen(res: Response, termId: number): Promise<boolean> {
  if (!termIsFrozen(termId, (await Repository.getTerms()) as any)) return false;
  res.status(409).json({ error: TERM_FROZEN_MESSAGE, code: "term-frozen" });
  return true;
}
