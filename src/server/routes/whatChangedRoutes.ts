/**
 * ── «ماذا غيّرنا؟» — حصيلةُ تعديلات القسم في فترة ──
 *
 * قراءةٌ محضة: لا تكتب نسخةً ولا سجلّاً. تختار لقطاتِ الفترة من «نُسخ الجدول»
 * (تُلتقط قبل كل تعديل) وتقارن أقدمَها بالجدول الحيّ (src/utils/whatChanged.ts).
 *
 * للقسم وحده: صلاحيةُ تعديل الجدول (النموذج 7) في نطاقه، ولا صفةَ اطّلاع.
 * والأستاذُ لا يراها — يرى حركةَ جدوله هو من بطاقته.
 */
import type { Express, Response } from "express";
import { Repository } from "../../db/repository";
import { isReadOnlyRole } from "../../utils/academicRoles";
import { summarizeWhatChanged, type WcVersion } from "../../utils/whatChanged";
import { readOnlyRefusal } from "../roleGuard";
import { type AuthenticatedRequest, requirePermission } from "../core/auth";
import { isScopeAllowed } from "../core/scope";
import { hydrateVersionRows } from "../core/versions";

/** أقصى ما يُقرأ من قائمة النُّسخ، وأقصى ما تُحمَّل لقطاتُه للخطوات. */
export const WHAT_CHANGED_LIST_CAP = 100;
export const WHAT_CHANGED_STEP_CAP = 40;

export function registerWhatChangedRoutes(app: Express) {
  app.get("/api/schedules/what-changed", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
    const collegeId = Number(req.query.collegeId || 0), sectionId = Number(req.query.sectionId || 0), termId = Number(req.query.termId || 0);
    if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "اختر القسم والفصل أولاً" }); return; }
    if (!req.user?.IsAdminUser && isReadOnlyRole(req.user?.Role)) { res.status(403).json(readOnlyRefusal(req.user?.Role)); return; }
    if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
    const section = (await Repository.getSections()).find(row => Number(row.AdSectionId) === sectionId && Number(row.AdCollegeId) === collegeId);
    if (!section) { res.status(404).json({ error: "القسم غير موجود" }); return; }

    /* ── الفترة ── */
    const fromParam = String(req.query.from || "").trim();
    let kind: "lastSend" | "time" = "time";
    let fromIso = "";
    let sendVersionId = "";
    if (fromParam === "lastSend") {
      kind = "lastSend";
      const approval = await Repository.getScheduleApproval(collegeId, sectionId, termId).catch(() => undefined);
      const round = [...(approval?.rounds || [])]
        .filter(item => item.submittedAt && !(item as any).amendment)
        .sort((a, b) => b.number - a.number)[0];
      if (!round?.submittedAt) {
        res.json({ period: { kind, from: null }, notSent: true, entries: [], steps: [], counts: emptyCounts() });
        return;
      }
      fromIso = new Date(round.submittedAt).toISOString();
      sendVersionId = String(round.reviewedVersionId || "");
    } else {
      const parsed = fromParam ? new Date(fromParam) : startOfToday();
      if (Number.isNaN(parsed.getTime())) { res.status(400).json({ error: "وقتٌ غير صالح" }); return; }
      fromIso = parsed.toISOString();
    }

    /* ── اللقطات: الأحدث أولاً من القائمة الخفيفة، ثم ما يلزم بصفوفه ── */
    const listed = await Repository.getScheduleVersions(collegeId, sectionId, termId, WHAT_CHANGED_LIST_CAP);
    let sendVersion: WcVersion | undefined;
    if (sendVersionId) {
      const found = await Repository.getScheduleVersionById(sendVersionId).catch(() => undefined);
      if (found && Number(found.AdSectionId) === sectionId && Number(found.AdTermId) === termId) {
        sendVersion = found as any;
        /* لقطةُ الإرسال تُؤخذ قبل لحظة الإرسال بأجزاء ثانية: هي بدايةُ الفترة. */
        fromIso = String(found.createdAt);
      }
    }
    const inPeriod = listed.filter(version => String(version.createdAt) >= fromIso).reverse();
    const oldestListed = listed[listed.length - 1];
    /* القائمة مقصوصة وكلُّها داخل الفترة: بدايةُ الفترة أقدم مما بين أيدينا. */
    const truncated = !sendVersion && listed.length >= WHAT_CHANGED_LIST_CAP && Boolean(oldestListed) && String(oldestListed.createdAt) >= fromIso;
    const stepVersions = inPeriod.slice(-WHAT_CHANGED_STEP_CAP);
    const hydrated = await hydrateVersionRows(stepVersions as any[]);
    let baselineRows: any[] | undefined;
    if (sendVersion) baselineRows = sendVersion.rows || [];
    else if (inPeriod.length > stepVersions.length) {
      const [oldest] = await hydrateVersionRows([inPeriod[0]] as any[]);
      baselineRows = oldest?.rows || [];
    }

    const [live, instructors, courses] = await Promise.all([
      Repository.getSchedulesByScope({ collegeId, sectionId, termId }, { fresh: true }),
      Repository.getInstructors().catch(() => [] as any[]),
      Repository.getCoursesBySection(sectionId).catch(() => [] as any[]),
    ]);
    const names = {
      instructorById: new Map((instructors as any[]).map(row => [Number(row.AdInstructorId), String(row.AdInstructorName || "")])),
      courseById: new Map((courses as any[]).map(row => [Number(row.AdCourseId), String(row.CourseName || row.CourseCode || "")])),
      courseCodeById: new Map((courses as any[]).map(row => [Number(row.AdCourseId), String(row.CourseCode || "").trim()])),
    };
    const result = summarizeWhatChanged({
      versions: hydrated.map(version => ({ id: version.id, createdAt: String(version.createdAt), userName: version.userName, label: version.label, rows: version.rows || [] })),
      live: live as any,
      names,
      baselineRows,
    });
    res.json({
      period: { kind, from: fromIso },
      ...result,
      /* الأحدث أولاً للعرض. */
      steps: [...result.steps].reverse(),
      truncated,
      stepsTruncated: inPeriod.length > stepVersions.length,
    });
  });
}

function emptyCounts() {
  return { moved: 0, room: 0, instructor: 0, added: 0, removed: 0, course: 0, total: 0 };
}

/** بدايةُ اليوم بتوقيت الكويت (UTC+3، بلا توقيتٍ صيفي). */
function startOfToday(): Date {
  const kuwait = new Date(Date.now() + 3 * 3600_000);
  return new Date(Date.UTC(kuwait.getUTCFullYear(), kuwait.getUTCMonth(), kuwait.getUTCDate()) - 3 * 3600_000);
}
