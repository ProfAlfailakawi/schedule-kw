/**
 * ── ملاحظاتُ الجدول ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { Response } from "express";
import { Repository } from "../../db/repository";
import type { ScheduleNoteField } from "../../types";
import { insistOutcome } from "../../utils/approvalWorkflow";
import { canReviewSubmissions, canAnnotateCells, signatureStage } from "../../utils/academicRoles";
import { readApproval, refuseIfTermClosed } from "../core/approvals";
import { type AuthenticatedRequest, isPowerUser, requireAuth } from "../core/auth";
import { NOTE_FIELD_LABEL, noteFieldValue, notesWithState } from "../core/notes";
import { isScopeAllowed } from "../core/scope";

/* ══════════════════════════════════════════════════════════════════════════
   الملاحظة على الخانة
   ══════════════════════════════════════════════════════════════════════════

   موظّف التسجيل لا يكتب «راجع الموعد رقم ٤١٨»: هو ينقر على القاعة نفسها.
   والخانة تحمل ثلاث معلومات دفعةً واحدة — أيُّ صفّ، وأيُّ حقل، وما القيمة
   المرفوضة — فيسقط الشرح من الطرفين: لا الموظّف يصف أين المشكلة، ولا اللجنة
   تبحث عنها.

   وثلاثُ حالاتٍ للخانة، تُقرأ باللون قبل أن تُقرأ بالنصّ: برتقاليٌّ ينتظر،
   وأخضرُ تغيّر، ورماديٌّ ردّت عليه اللجنة. والحالة تُحسب من القيمة الحاضرة لا
   تُخزَّن — فلا يمكن أن تقول الخانة «عُولجت» وهي على حالها.                 */

const NOTE_FIELDS: ScheduleNoteField[] = ["time", "days", "room", "instructor", "sectionCode", "course", "row"];

export function registerScheduleNotesRoutes(app: Express): void {

/** ملاحظات القسم في فصل، بحالتها. يقرؤها التسجيل واللجنة ورئيس القسم سواء. */
app.get("/api/schedule-notes", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0), sectionId = Number(req.query.sectionId || 0), termId = Number(req.query.termId || 0);
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "اختر الفصل والكلية والقسم أولاً." }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const notes = await notesWithState(collegeId, sectionId, termId);
  res.json({
    notes,
    open: notes.filter(note => note.state === "open").length,
    changed: notes.filter(note => note.state === "changed").length,
    answered: notes.filter(note => note.state === "answered").length,
  });
});

/**
 * ملاحظةٌ بنقرة.
 *
 * النصّ اختياريّ عمداً: الخانة نفسها هي الرسالة في أغلب الحالات، وإلزامُ
 * الموظّف بجملةٍ لكل خانةٍ في عشرين قسماً هو ما يجعله يترك النظام ويتصل
 * بالهاتف.
 */
app.post("/api/schedule-notes", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const scheduleId = Number(req.body?.scheduleId || 0);
  const field = String(req.body?.field || "row") as ScheduleNoteField;
  const text = String(req.body?.text || "").trim().slice(0, 600);
  if (!NOTE_FIELDS.includes(field)) { res.status(400).json({ error: "الخانة المختارة غير معروفة" }); return; }
  const row = await Repository.getScheduleById(scheduleId);
  if (!row) { res.status(404).json({ error: "الموعد غير موجود" }); return; }
  if (!isScopeAllowed(req, row.AdCollegeId, row.AdSectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  /* الملاحظةُ فعلٌ في الدورة، والدورةُ في فصلٍ منتهٍ مغلقة (R23). */
  if (await refuseIfTermClosed(res, Number(row.AdTermId))) return;

  const fromRegistrar = canReviewSubmissions(req.user?.Role);
  /* المصدر يُشتقّ من الصفة، والإذنُ يُقرأ من الدالّة نفسها التي تقرؤها
     الشاشة — فلا يُفتح في إحداهما ما يُقفل في الأخرى. */
  if (!canAnnotateCells(req.user?.Role) && !isPowerUser(req)) {
    res.status(403).json({ error: "الملاحظات للتسجيل وللقسم." });
    return;
  }
  const origin: "registrar" | "department" = fromRegistrar ? "registrar" : "department";

  const approval = await readApproval(row.AdCollegeId, row.AdSectionId, row.AdTermId);
  /* الملاحظة تُنسب إلى الجولة الجارية. والجولة صفرٌ قبل أول إرسال، فتُقرأ ١:
     ملاحظةٌ كُتبت قبل الإرسال تنتمي إلى أول جولةٍ ستأتي، لا إلى «لا جولة». */
  const round = Math.max(1, approval.currentRound);

  /* خانةٌ واحدة، ملاحظةٌ واحدة. النقر مرّتين على القاعة نفسها تصحيحٌ للنصّ،
     لا ملاحظتان تُعالَج إحداهما وتبقى الأخرى معلّقة بلا سبب. */
  /* وملاحظاتُ القسم لكلٍّ كاتبُها (R12): رئيسُ القسم ورئيسُ اللجنة يكتبان
     على الخانة نفسها كلٌّ رأيه، وكانت الثانية تمحو الأولى لأن المفتاح كان
     الجهةَ لا الكاتب. أمّا التسجيل فجهةٌ واحدة تتكلّم بصوتٍ واحد. */
  const authorId = Number(req.user?.SystemUserId || 0);
  const existing = (await Repository.getScheduleCommentsByScope(row.AdCollegeId, row.AdSectionId, row.AdTermId))
    .find(note => Number(note.scheduleId) === scheduleId && (note.field || "row") === field
      && note.origin === origin && !note.resolved && Number(note.round || 1) === round
      && (origin !== "department" || Number(note.SystemUserId) === authorId));

  const value = noteFieldValue(row, field);
  if (existing) {
    /* نقرةٌ ثانية على الخانة نفسها تصحيحٌ للنصّ، وتُعيد الملاحظة إلى أوّلها:
       قيمةُ الخانة تُلتقط من جديد، وما كان من ردٍّ أو قرارٍ عليه يُمحى. */
    const updated = await Repository.updateScheduleComment(
      existing.id,
      { text: text || existing.text, valueAtNote: value },
      ["rebuttal", "rebuttalVerdict"],
    );
    res.json({ note: updated, replaced: true });
    return;
  }

  const created = await Repository.createScheduleComment({
    SystemUserId: Number(req.user?.SystemUserId || 0),
    userName: String(req.user?.Name || req.user?.SystemUserLogin || ""),
    scheduleId,
    AdCollegeId: row.AdCollegeId, AdSectionId: row.AdSectionId, AdTermId: row.AdTermId,
    /* بلا نصّ، الخانة هي الرسالة. والنصّ الافتراضي يقولها صراحةً بدل أن تصل
       اللجنةَ ملاحظةٌ فارغة لا تعرف ماذا تفعل بها. */
    text: text || `راجِع ${NOTE_FIELD_LABEL[field]}`,
    field, valueAtNote: value, round, origin,
  });
  res.locals.auditChanges = `ملاحظة على ${NOTE_FIELD_LABEL[field]} — موعد ${scheduleId}`;
  res.status(201).json({ note: created, replaced: false });
});

/**
 * ردّ اللجنة: «أبقيها كما هي، لهذا السبب».
 *
 * السبب إلزاميّ هنا وحده. رفضٌ بلا سببٍ يدفع الطرفين إلى الهاتف، فتضيع الحجّة
 * خارج النظام — وهي أوّل ما يُطلب حين يُسأل أحدهما بعد شهرين.
 */
app.post("/api/schedule-notes/:id/rebut", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const note = await Repository.getScheduleCommentById(String(req.params.id));
  if (!note) { res.status(404).json({ error: "الملاحظة غير موجودة" }); return; }
  if (!isScopeAllowed(req, note.AdCollegeId, note.AdSectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  if (note.origin !== "registrar") { res.status(409).json({ error: "الردّ يكون على ملاحظات التسجيل." }); return; }
  if (await refuseIfTermClosed(res, Number(note.AdTermId))) return;
  if (signatureStage(req.user?.Role) === null && !isPowerUser(req)) { res.status(403).json({ error: "الردّ على الملاحظة من القسم." }); return; }
  const text = String(req.body?.text || "").trim().slice(0, 600);
  if (text.length < 3) { res.status(400).json({ error: "اكتب سبب الإبقاء. ردٌّ بلا سببٍ لا يفيد التسجيل." }); return; }
  const updated = await Repository.updateScheduleComment(
    note.id,
    {
      rebuttal: {
        text, at: new Date().toISOString(),
        SystemUserId: Number(req.user?.SystemUserId || 0),
        userName: String(req.user?.Name || req.user?.SystemUserLogin || ""),
      },
    },
    /* ردٌّ جديد يُلغي قراراً سابقاً عليه: الملاحظة تعود إلى انتظار التسجيل. */
    ["rebuttalVerdict"],
  );
  res.locals.auditChanges = `ردّ القسم على ملاحظة: ${text.slice(0, 80)}`;
  res.json({ note: updated });
});

/** قرار التسجيل على ردّ اللجنة: يقبل التبرير فتنتهي، أو يُصرّ فتعود برتقالية. */
app.post("/api/schedule-notes/:id/verdict", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const note = await Repository.getScheduleCommentById(String(req.params.id));
  if (!note) { res.status(404).json({ error: "الملاحظة غير موجودة" }); return; }
  if (!isScopeAllowed(req, note.AdCollegeId, note.AdSectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  if (!canReviewSubmissions(req.user?.Role) && !isPowerUser(req)) { res.status(403).json({ error: "القرار على الردّ للتسجيل." }); return; }
  if (!note.rebuttal) { res.status(409).json({ error: "لا يوجد ردٌّ من القسم على هذه الملاحظة." }); return; }
  if (await refuseIfTermClosed(res, Number(note.AdTermId))) return;
  const verdict = String(req.body?.verdict || "");
  if (verdict !== "accepted" && verdict !== "insisted") { res.status(400).json({ error: "القرار إمّا قبولٌ للتبرير وإمّا إصرارٌ على التغيير." }); return; }
  const at = new Date().toISOString();
  const outcome = insistOutcome(note, at);
  const updated = verdict === "accepted"
    ? await Repository.updateScheduleComment(note.id, { rebuttalVerdict: "accepted", resolved: true, resolution: "rebuttal-accepted" })
    /* ── الإصرارُ يرفع الردَّ من الانتظار، ولا يمحوه (R4) ───────────────────
     * الخانةُ تعود برتقاليةً تنتظر — والردُّ يُنقل إلى سجلّ الردود بدل أن
     * يُمحى، فتبقى الحجّةُ مقروءةً لمن يسأل بعد شهرين: قال القسم كذا، وأصرّ
     * التسجيل. والملاحظةُ تُعدّ مفتوحةً في أيّ جولةٍ كانت، فيُرجَع بها. */
    : await Repository.updateScheduleComment(note.id, {
        rebuttalVerdict: "insisted",
        rebuttalHistory: [...(note.rebuttalHistory || []), {
          ...note.rebuttal!, insistedAt: at,
          insistedBy: String(req.user?.Name || req.user?.SystemUserLogin || ""),
        }],
        /* كل إصرارٍ بعد ردّ يُعدّ، والثالثُ يُسجَّل لحظتُه (R19): من هنا يظهر
           الخلافُ لرئيس القسم في شريطه، فتصدق الشاشةُ حين تقول إنه يُعرض له. */
        ...outcome,
      }, ["rebuttal"]);
  const escalatedNow = verdict === "insisted" && Boolean(outcome.escalatedAt) && !note.escalatedAt;
  res.locals.auditChanges = verdict === "accepted" ? "قبول تبرير القسم"
    : `إصرار التسجيل على التغيير${escalatedNow ? " — رُفع الخلاف إلى رئيس القسم" : ""}`;
  res.json({ note: updated, escalated: escalatedNow });
});

/** حذف ملاحظةٍ كتبها صاحبها قبل الإرجاع. تراجعٌ عن نقرة، لا أكثر. */
app.delete("/api/schedule-notes/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const note = await Repository.getScheduleCommentById(String(req.params.id));
  if (!note) { res.status(404).json({ error: "الملاحظة غير موجودة" }); return; }
  if (!isScopeAllowed(req, note.AdCollegeId, note.AdSectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  if (Number(note.SystemUserId) !== Number(req.user?.SystemUserId) && !isPowerUser(req)) {
    res.status(403).json({ error: "تُحذف الملاحظة ممّن كتبها." });
    return;
  }
  await Repository.deleteScheduleComment(note.id);
  res.locals.auditChanges = "حذف ملاحظة";
  res.json({ success: true });
});
}
