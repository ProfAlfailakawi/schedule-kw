/**
 * ── مراجعةُ الصحيفة: القسمُ يراجع صحيفتَه، ورئيسُ اللجنة يعتمدها ────────────────
 *
 * البياناتُ الأكاديمية حساسة: لا يدخل القسمُ عليها. فللصحيفة **مسوّدةٌ** (مقرراتُها
 * ومستوياتُها وما يسبق ماذا) تُعرض على القسم وحده، يصحّح فيها ما لقسمه، ثم يعتمدها
 * رئيسُ لجنة الجدول بضغطةٍ. لا شيءٌ يصل المحرّكَ ولا الطالبَ قبل الاعتماد.
 *
 * حدودٌ لا تُكسر:
 *   · القسمُ يعدّل **قواعدَ مقرراتِه فقط** (المستوى، النوع، المسبق، المقرن). مقررُ قسمٍ
 *     آخر يظهر في الخريطة مقفولاً، ويُشار إليه مسبقاً أو يُضاف إلى مجموعةٍ اختيارية
 *     فحسب. والحارسُ هنا في الخادم لا في الواجهة وحدها.
 *   · الاعتمادُ لرئيس لجنة الجدول (وإدارة النظام)، ويرفضه الخادمُ إن بقي مانعٌ
 *     في القواعد (دورة، مجموعةٌ لا تتّسع لحدّها…)، أو تغيّرت المسوّدةُ بعد أن رآها.
 *   · كلُّ تعديلٍ في سجلّ التدقيق.
 */
import { groupDeptTracks, planMatchKey, trackLabels, type DeptTrack } from "../utils/collegeTrack";
import { TECHNOLOGY_EDUCATION_CURRICULA } from "../data/technologyEducationCurricula";
import { compareCurriculumReference, isTechnologyEducation, referenceCodeKey } from "../utils/curriculumReference";
import { AR, countOf } from "../utils/arabicCount";
import express from "express";
import { rateLimit } from "express-rate-limit";
import type { Express, Request, RequestHandler, Response } from "express";
import { DuplicateResourceError, RuleDraftConflict, Repository } from "../db/repository";
import type { AdCourse, CurriculumRuleSet, ElectiveGroup } from "../types";
import { roleDefinition } from "../utils/academicRoles";
import { departmentFamilyKey, sectionLabels } from "../utils/sectionLabel";
import {
  checkRuleSet, dedupeGroups, normalizeGroup, normalizeRule, normalizeRules, withDerivedGroups, type RuleIssue,
} from "../utils/curriculumRules";
import { buildReferenceRules, planReferenceApplication, splitFrozenUpdates } from "../utils/referenceApply";
import { collegeBranchRoot } from "../utils/branchScope";
import { rowsToDrafts, type ImportPlan, type RuleImportRow } from "../utils/curriculumRulesImport";
import { academicDigits, authorityDepartmentCode } from "../utils/authorityAcademicCodes";
import { branchAudience } from "../utils/referenceApply";
import { correctCourseName } from "../utils/courseNameCorrection";
import { blockingWarnings, checkSheetScope, correctedNames, isNewSheet, sheetKey, sheetNameMatches, sheetOwnKey, sheetSectionCode, sheetSectionName, ownCourses, sheetToReference, storedCode } from "../utils/planSheetImport";
import { parsePlanItems } from "../utils/planPdfParser";
import { extractPlanItems, PLAN_PDF_MAX_BYTES } from "./planPdfExtract";
import { planSectionAccounts, provisionCollegeUsers, provisionSectionUsers, type SectionAccountResult } from "./sectionUsers";

export interface PlanReviewDeps {
  requireAuth: RequestHandler;
  isScopeAllowed: (req: any, collegeId: number, sectionId: number) => boolean;
  isPowerUser: (req: any) => boolean;
  isRootAdmin: (req: any) => boolean;
  hasPermission: (req: any, formId: number) => boolean;
  actorName: (req: any) => string;
}

type Plan = { id: string; AdCollegeId: number; AdSectionId: number; name: string; status: string };
interface CourseInfo { id: number; code: string; name: string; credit: number; hours: number; capacity: number; collegeId: number; sectionId: number }
interface Context {
  plan: Plan;
  courseIds: number[];
  /** متطلباتٌ عامة (مقررات أقسامٍ أخرى) داخل `courseIds`: للقراءة. */
  externalIds: number[];
  catalog: Map<number, CourseInfo>;
  sectionName: string;
}

const READERS = new Set(["committeeChair", "departmentHead", "standard"]);
const WORKSPACE_FORM = 7;

/** صحائفُ قيد المراجعة التي يراها هذا الحساب: لجرس الإشعارات. نفسُ حارس النطاق والصفة في الشاشة. */
export async function pendingPlanReviews(req: any, deps: Pick<PlanReviewDeps, "isScopeAllowed" | "isPowerUser">): Promise<Array<{ planId: string; planName: string; sectionId: number; collegeId: number; sectionName: string; groupKey: string; groupLabel: string; unitKey: string; updatedAt: string }>> {
  const role = roleDefinition(req.user?.Role).id;
  const drafts = (await Repository.listRuleDrafts()).filter(draft => draft.status === "review");
  const visible = drafts.filter(draft => deps.isPowerUser(req) || (READERS.has(role) && deps.isScopeAllowed(req, draft.AdCollegeId, draft.AdSectionId)));
  if (!visible.length) return [];
  const [sectionRows, collegeRows] = await Promise.all([Repository.getSections(), Repository.getColleges()]);
  const sections = sectionLabels(sectionRows as any[], collegeRows as any[]);
  /* بناتُ القسم بمواقعهنّ (الجهراء والفحيحيل) صحيفةٌ واحدة: إشعارٌ واحد لا ثلاثة. */
  const trackOfSection = new Map<number, DeptTrack>();
  const allTracks = groupDeptTracks(sectionRows as any[], collegeRows as any[]), labels = trackLabels(allTracks);
  for (const track of allTracks) for (const section of [track.canonical, ...track.mirrors]) trackOfSection.set(Number(section.AdSectionId), track);
  const out = [];
  for (const draft of visible) {
    const plan = (await Repository.getCurriculumPlans(draft.AdSectionId)).find(row => row.id === draft.planId);
    out.push({ planId: draft.planId, planName: plan?.name || "الصحيفة", sectionId: draft.AdSectionId, collegeId: draft.AdCollegeId, sectionName: sections.get(draft.AdSectionId) || "",
      /* إشعارٌ واحد لكل قسم (باسمه) مهما تعدّدت كلياتُه ومساراتُه؛ والصحيفةُ تُعدّ بمسارها وكليتها وسنتها (unitKey). */
      groupKey: trackOfSection.get(draft.AdSectionId)?.deptName || `${draft.AdCollegeId}:${draft.AdSectionId}`,
      groupLabel: (() => { const t = trackOfSection.get(draft.AdSectionId); return t ? (/^قسم\s/.test(t.deptName) ? t.deptName : `قسم ${t.deptName}`) : sections.get(draft.AdSectionId) || ""; })(),
      unitKey: `${trackOfSection.get(draft.AdSectionId)?.key || draft.AdSectionId}|${planMatchKey(plan?.name || draft.planId)}`,
      updatedAt: draft.updatedAt });
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** تصنيف كل مقرر في صحيفة تكنولوجيا التعليم كما تكتبه الصحيفة (ثقافة عامة، تخصصية، مهنية، تدريب ميداني)، وترتيب ظهور التصنيفات فيها. */
export const REFERENCE_CATEGORIES = (() => {
  const byCode = new Map<string, string>(), order: string[] = [];
  for (const reference of [...TECHNOLOGY_EDUCATION_CURRICULA].sort((a, b) => Number(b.id === "new") - Number(a.id === "new")))
    for (const group of reference.groups) {
      if (!order.includes(group.category)) order.push(group.category);
      for (const course of group.courses) if (!byCode.has(course.code)) byCode.set(course.code, group.category);
    }
  return { byCode, order };
})();

/** تصنيفُ مقررٍ بحسب الصحيفة المرجعية: الرمزُ القصير يُوسَّع برمز قسم المالك كما في المقارنة. */
export function referenceCategoryResolver(sections: readonly any[]): (code: string, ownerSectionId: number) => string {
  const ownerCodes = new Map(sections.map(row => [Number(row.AdSectionId), referenceCodeKey(row.AdSectionCode).padStart(2, "0")]));
  return (code, ownerSectionId) => {
    const key = referenceCodeKey(code), owner = ownerCodes.get(Number(ownerSectionId)) || "";
    return REFERENCE_CATEGORIES.byCode.get(/^\d{1,3}$/.test(key) && /^\d{2}$/.test(owner) ? `01${owner}${key.padStart(3, "0")}` : key) || "";
  };
}

/** مقارنة صحائف تكنولوجيا التعليم المرجعية بكتالوج موقعٍ واحد: للعرض وللتطبيق معاً، فلا يفترقان. */
export function referenceSnapshotFor(sections: any[], courses: AdCourse[]) {
    const sectionCodes = new Map(sections.map(row => [Number(row.AdSectionId), referenceCodeKey(row.AdSectionCode).padStart(2, "0")]));
    const sectionIdsByCollegeCode = new Map<string, number[]>();
    for (const row of sections) {
      const key = `${Number(row.AdCollegeId)}:${sectionCodes.get(Number(row.AdSectionId)) || ""}`;
      sectionIdsByCollegeCode.set(key, [...(sectionIdsByCollegeCode.get(key) || []), Number(row.AdSectionId)]);
    }
  return async (target: any) => {
      const [plans, links] = await Promise.all([Repository.getCurriculumPlans(Number(target.AdSectionId)), Repository.getCurriculumPlanCourses(Number(target.AdSectionId))]);
      const collegeCourses = courses.filter(row => Number(row.AdCollegeId) === Number(target.AdCollegeId)).map(row => {
        const code = referenceCodeKey(row.CourseCode), ownerCode = sectionCodes.get(Number(row.AdSectionId));
        return { ...row, CourseCode: /^\d{1,3}$/.test(code) && /^\d{2}$/.test(ownerCode || "") ? `01${ownerCode}${code.padStart(3, "0")}` : code };
      });
      const references = TECHNOLOGY_EDUCATION_CURRICULA.map(reference => {
        const matchingPlans = plans.filter(plan => !plan.virtual && !plan.track && plan.status === (reference.id === "new" ? "active" : "transition"));
        const plan = matchingPlans.length === 1 ? matchingPlans[0] : undefined;
        const members = new Set(links.filter(link => link.planId === plan?.id).map(link => Number(link.AdCourseId)));
        const groups = compareCurriculumReference(reference, collegeCourses, members, Number(target.AdSectionId)).map(group => ({ ...group, courses: group.courses.map(course => {
          const matched = course.current && collegeCourses.find(row => Number(row.AdCourseId) === Number(course.current?.id));
          const inferred = sectionIdsByCollegeCode.get(`${Number(target.AdCollegeId)}:${course.code.slice(2, 4)}`) || [];
          const ownerSectionId = Number(matched?.AdSectionId) || (inferred.length === 1 ? inferred[0] : 0);
          const owner = sections.find(row => Number(row.AdSectionId) === ownerSectionId);
          return { ...course, ownerSectionId, ownerSectionName: String(owner?.AdSectionName || ""), ownerCollegeId: Number(target.AdCollegeId) };
        }) }));
        return { ...reference, planId: plan?.id || null, groups };
      });
      return { plans, links, collegeCourses, references };
  };
}

export function registerPlanReviewRoutes(app: Express, deps: PlanReviewDeps): void {
  const fail = (res: Response, status: number, error: string, extra: Record<string, unknown> = {}) => res.status(status).json({ error, ...extra });
  const roleId = (req: any): string => roleDefinition(req.user?.Role).id;
  /* رفعُ صحيفة يقرأ ملفاً كاملاً ويكتب في الكتالوج: حدٌّ سخيٌّ يمنع حلقةً من شغل الخادم. */
  const sheetLimit = rateLimit({ windowMs: 60_000, limit: 150, standardHeaders: true, legacyHeaders: false, message: { error: "ملفاتٌ كثيرة في وقتٍ قصير. انتظر قليلاً ثم أعد الرفع." } });

  /** من يرى الصحيفة: صاحبُ نطاقها بصفةٍ تفتح الشاشة، أو إدارةُ النظام. */
  const canSee = (req: any, plan: Plan) =>
    deps.isPowerUser(req) || (READERS.has(roleId(req)) && deps.isScopeAllowed(req, plan.AdCollegeId, plan.AdSectionId));
  /** رئيس القسم يصحح صحيفته في نطاقه فقط؛ لا يحصل بذلك على صلاحية تعديل الجدول. */
  const canEdit = (req: any, plan: Plan) =>
    deps.isPowerUser(req) || (canSee(req, plan) && (
      (roleId(req) === "departmentHead" && plan.status !== "archived")
      || (!roleDefinition(req.user?.Role).readOnly && deps.hasPermission(req, WORKSPACE_FORM))
    ));
  /** من يعتمد: رئيسُ لجنة الجدول وحده (وإدارةُ النظام). */
  const canApprove = (req: any, plan: Plan) => deps.isPowerUser(req) || (roleId(req) === "committeeChair" && canEdit(req, plan));
  const ownsCourse = (req: any, course: CourseInfo) => deps.isPowerUser(req) || deps.isScopeAllowed(req, course.collegeId, course.sectionId);

  async function context(planId: string, sectionId: number): Promise<Context | null> {
    if (!planId || !sectionId) return null;
    const [plans, links, courses, sections] = await Promise.all([
      Repository.getCurriculumPlans(sectionId), Repository.getCurriculumPlanCourses(sectionId), Repository.getCourses(), Repository.getSections(),
    ]);
    const plan = plans.find(row => row.id === planId && Number(row.AdSectionId) === sectionId);
    if (!plan) return null;
    const catalog = new Map<number, CourseInfo>();
    for (const course of courses as AdCourse[]) {
      catalog.set(Number(course.AdCourseId), {
        id: Number(course.AdCourseId), code: String(course.CourseCode || ""), name: String(course.CourseName || ""),
        credit: Number(course.CourseCredit) || 0, hours: Number(course.CourseHours) || 0,
        capacity: Number(course.MaxStudent) || 0, collegeId: Number(course.AdCollegeId), sectionId: Number(course.AdSectionId),
      });
    }
    const [draftSet, liveSet] = await Promise.all([Repository.getRuleDraft(planId), Repository.getRuleSet(planId)]);
    const externalIds = [...new Set(((draftSet || liveSet)?.externals || []).map(Number).filter(id => id > 0))];
    const memberIds = [...new Set(links.filter(link => link.planId === planId).map(link => Number(link.AdCourseId)))];
    return {
      plan: { id: plan.id, AdCollegeId: Number(plan.AdCollegeId), AdSectionId: Number(plan.AdSectionId), name: plan.name, status: plan.status },
      externalIds: externalIds.filter(id => !memberIds.includes(id)),
      courseIds: [...new Set([...memberIds, ...externalIds])],
      catalog,
      sectionName: String((sections as any[]).find(row => Number(row.AdSectionId) === sectionId)?.AdSectionName || ""),
    };
  }

  const issuesOf = (ctx: Context, set: Pick<CurriculumRuleSet, "rules" | "groups">): RuleIssue[] =>
    checkRuleSet(set, {
      planCourseIds: ctx.courseIds, knownCourseIds: new Set(ctx.catalog.keys()),
      credit: new Map([...ctx.catalog].map(([id, course]) => [id, course.credit])),
      name: id => ctx.catalog.get(id)?.name || `مقرر ${id}`,
    });

  const blank = (ctx: Context, by: string, live?: CurriculumRuleSet): CurriculumRuleSet => ({
    id: ctx.plan.id, planId: ctx.plan.id, AdCollegeId: ctx.plan.AdCollegeId, AdSectionId: ctx.plan.AdSectionId,
    rules: live?.rules || [], groups: live?.groups || [], version: live?.version || 0, status: "review",
    basedOnVersion: live?.version || 0, updatedAt: new Date().toISOString(), updatedBy: by,
  });

  /** ما تراه الواجهة: المسوّدةُ (أو المعتمدة إن لم تكن) مع ملكيّة كل مقرر. */
  async function view(req: any, ctx: Context) {
    const [draft, live] = await Promise.all([Repository.getRuleDraft(ctx.plan.id), Repository.getRuleSet(ctx.plan.id)]);
    const shown = draft || (live ? { ...live, status: "approved" as const } : blank(ctx, ""));
    const [sectionRows, collegeRows] = await Promise.all([Repository.getSections(), Repository.getColleges()]);
    const sections = sectionLabels(sectionRows as any[], collegeRows as any[]);
    const issues = issuesOf(ctx, shown);
    /* التصنيف لقسم تكنولوجيا التعليم وحده (له صحيفة مرجعية)؛ الرمز القصير يُوسَّع برمز قسم المالك كما في المقارنة. */
    const planSection = (sectionRows as any[]).find(row => Number(row.AdSectionId) === Number(ctx.plan.AdSectionId));
    const categorized = isTechnologyEducation(planSection?.AdSectionName);
    const ownerCodes = new Map((sectionRows as any[]).map(row => [Number(row.AdSectionId), referenceCodeKey(row.AdSectionCode).padStart(2, "0")]));
    const categoryOf = (course: { code: string; sectionId: number }) => {
      if (!categorized) return "";
      const key = referenceCodeKey(course.code), owner = ownerCodes.get(Number(course.sectionId)) || "";
      return REFERENCE_CATEGORIES.byCode.get(/^\d{1,3}$/.test(key) && /^\d{2}$/.test(owner) ? `01${owner}${key.padStart(3, "0")}` : key) || "";
    };
    return {
      categories: categorized ? REFERENCE_CATEGORIES.order : [],
      plan: { id: ctx.plan.id, name: ctx.plan.name, status: ctx.plan.status, sectionId: ctx.plan.AdSectionId, sectionName: ctx.sectionName },
      courses: ctx.courseIds.map(id => {
        const course = ctx.catalog.get(id) || { id, code: "", name: `مقرر ${id}`, credit: 0, hours: 0, capacity: 0, collegeId: 0, sectionId: 0 };
        return { id, code: course.code, name: course.name, credit: course.credit, hours: course.hours, capacity: course.capacity,
          collegeId: course.collegeId, sectionId: course.sectionId, ownerSectionId: course.sectionId, category: categoryOf(course),
          ownerSectionName: sections.get(course.sectionId) || "", owned: ownsCourse(req, course), external: ctx.externalIds.includes(id) };
      }),
      /* مقرراتٌ يشير إليها مسبقٌ أو مقرن ولا تقع في الصحيفة: تُعرض أسماؤها لا غير. */
      referenced: [...new Set(shown.rules.flatMap(rule => [...(rule.prereq?.all || []), ...(rule.prereq?.anyOf || []).flat(), ...(rule.coreq || [])]))]
        .filter(id => !ctx.courseIds.includes(id)).map(id => ({ id, code: ctx.catalog.get(id)?.code || "", name: ctx.catalog.get(id)?.name || `مقرر ${id}`, credit: ctx.catalog.get(id)?.credit || 0 })),
      rules: shown.rules, groups: shown.groups,
      state: { status: shown.status || "approved", version: shown.version || 0, basedOnVersion: shown.basedOnVersion ?? null, updatedAt: shown.updatedAt, updatedBy: shown.updatedBy || "", approvedAt: shown.approvedAt || "", approvedBy: shown.approvedBy || "", live: live ? { version: live.version, approvedAt: live.approvedAt || "" } : null },
      issues,
      blockers: issues.filter(issue => issue.severity === "block").length,
      can: { edit: canEdit(req, ctx.plan), approve: canApprove(req, ctx.plan) },
    };
  }

  const need = async (req: any, res: Response, planId: unknown, sectionId: unknown): Promise<Context | null> => {
    const ctx = await context(String(planId || ""), Number(sectionId || 0));
    if (!ctx) { fail(res, 404, "الصحيفة غير موجودة."); return null; }
    if (!canSee(req, ctx.plan)) { fail(res, 403, "خارج نطاق هذه الصحيفة."); return null; }
    return ctx;
  };

  /* ── ما ينتظر المراجعة: يُظهر الأيقونةَ المؤقتة أو يُخفيها ──────────────────── */
  app.get("/api/plan-review/status", deps.requireAuth, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const drafts = await Repository.listRuleDrafts();
    const [sectionRows, collegeRows] = await Promise.all([Repository.getSections(), Repository.getColleges()]);
    const sections = sectionLabels(sectionRows as any[], collegeRows as any[]);
    const rows: any[] = [];
    for (const draft of drafts) {
      const plan: Plan = { id: draft.planId, AdCollegeId: draft.AdCollegeId, AdSectionId: draft.AdSectionId, name: "", status: "" };
      if (!canSee(req, plan)) continue;
      rows.push({
        planId: draft.planId, sectionId: draft.AdSectionId, sectionName: sections.get(draft.AdSectionId) || "",
        state: draft.status || "approved", updatedAt: draft.updatedAt, approvedAt: draft.approvedAt || "",
        courses: draft.rules.length,
      });
    }
    /* الصحائفُ التي يُفتح عليها: أقسامُ هذا الحساب وحدها، بلا المؤرشفة. */
    const reachable: Array<{ sectionId: number; sectionName: string; plans: Array<{ id: string; name: string; status: string; pending: boolean }> }> = [];
    const pendingIds = new Set(rows.filter(row => row.state === "review").map(row => row.planId));
    for (const section of sectionRows as any[]) {
      const collegeId = Number(section.AdCollegeId), sectionId = Number(section.AdSectionId);
      if (!canSee(req, { id: "", AdCollegeId: collegeId, AdSectionId: sectionId, name: "", status: "" })) continue;
      const plans = (await Repository.getCurriculumPlans(sectionId)).filter(plan => plan.status !== "archived" && !plan.virtual);
      if (plans.length || isTechnologyEducation(section.AdSectionName) || deps.isRootAdmin(req)) reachable.push({ sectionId, sectionName: sections.get(sectionId) || String(section.AdSectionName || ""), plans: [...plans].sort((x, y) => Number(pendingIds.has(y.id)) - Number(pendingIds.has(x.id)) || Number(y.status === "active") - Number(x.status === "active")).map(plan => ({ id: plan.id, name: plan.name, status: plan.status, pending: pendingIds.has(plan.id) })) });
    }
    /* وجهات رفع الصحيفة: مساراتُ الأقسام (بنات بموقعيها، وبنين) لا مواقعُ مفردة. */
    const uploadTargets = !deps.isRootAdmin(req) ? [] : (() => {
      const tracks = groupDeptTracks(sectionRows as any[], collegeRows as any[]), names = trackLabels(tracks);
      return tracks.map(item => ({ sectionId: Number(item.canonical.AdSectionId), label: names.get(item.key) || item.deptName, sites: 1 + item.mirrors.length }));
    })();
    res.json({ pending: rows.filter(row => row.state === "review"), approved: rows.filter(row => row.state === "approved"), sections: reachable, uploadTargets, canApprove: deps.isPowerUser(req) || roleId(req) === "committeeChair", canImport: deps.isRootAdmin(req) });
  });

  /* The supplied source sheets are a read-only comparison, available to both
     reviewers. Reading this endpoint never edits a catalog, membership or rule. */
  app.get("/api/plan-review/reference", deps.requireAuth, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const sectionId = Number(req.query.sectionId);
    const section = (await Repository.getSections()).find(row => Number(row.AdSectionId) === sectionId);
    if (!section || !canSee(req, { id: "", name: "", status: "", AdCollegeId: Number(section.AdCollegeId), AdSectionId: sectionId })) {
      fail(res, 403, "خارج نطاق هذه الصحيفة."); return;
    }
    if (!isTechnologyEducation(section.AdSectionName)) { res.json({ references: [] }); return; }
    const [courses, sections, colleges] = await Promise.all([Repository.getCourses(), Repository.getSections(), Repository.getColleges()]);
    const technologySections = sections.filter(row => isTechnologyEducation(row.AdSectionName)
      && (deps.isPowerUser(req) || deps.isScopeAllowed(req, Number(row.AdCollegeId), Number(row.AdSectionId))));
    const snapshotOf = referenceSnapshotFor(sections, courses);
    const sectionResults = await Promise.all(technologySections.map(async target => {
      const { references } = await snapshotOf(target);
      return { sectionId: Number(target.AdSectionId), collegeId: Number(target.AdCollegeId), collegeName: colleges.find(row => Number(row.AdCollegeId) === Number(target.AdCollegeId))?.AdCollegeName || "", sectionName: target.AdSectionName, references };
    }));
    res.json({ sectionId, references: sectionResults.find(row => row.sectionId === sectionId)?.references || [], sections: sectionResults });
  });

  app.get("/api/plan-review/plan", deps.requireAuth, async (req: Request, res: Response) => {
    const ctx = await need(req, res, req.query.planId, req.query.sectionId);
    if (!ctx) return;
    res.setHeader("Cache-Control", "no-store");
    res.json(await view(req, ctx));
  });

  /** محرر بيانات المقرر داخل الصحيفة: لا يغيّر الهوية أو الملكية، ويُبقي الكتابة داخل القسم والصحيفة. */
  app.put("/api/plan-review/course-details", deps.requireAuth, async (req: Request, res: Response) => {
    const ctx = await need(req, res, req.body?.planId, req.body?.sectionId);
    if (!ctx) return;
    if (!canEdit(req, ctx.plan)) { fail(res, 403, "لا تملك تعديل هذه الصحيفة."); return; }
    const allowedFields = new Set(["planId", "sectionId", "courseId", "credit", "hours", "capacity"]);
    if (Object.keys(req.body || {}).some(key => !allowedFields.has(key))) { fail(res, 400, "هذا المحرر يغيّر الوحدات والساعات والسعة فقط."); return; }
    const courseId = Number(req.body?.courseId);
    const course = ctx.catalog.get(courseId);
    if (!course || !ctx.courseIds.includes(courseId)) { fail(res, 400, "هذا المقرر ليس في الصحيفة."); return; }
    if (!ownsCourse(req, course)) { fail(res, 403, "لا يمكن تعديل مقرر تابع لقسم آخر.", { code: "foreign-course" }); return; }
    const credit = Number(req.body?.credit), hours = Number(req.body?.hours), capacity = Number(req.body?.capacity);
    if (!Number.isInteger(credit) || credit < 0 || credit > 20 || !Number.isFinite(hours) || hours < 0 || hours > 40 || Math.round(hours * 2) !== hours * 2 || !Number.isInteger(capacity) || capacity < 0 || capacity > 200) {
      fail(res, 400, "تحقق من الوحدات والساعات والسعة."); return;
    }
    const updated = await Repository.updateCourse(course.id, course.collegeId, course.sectionId, course.code, course.name, credit, hours, capacity);
    res.locals.auditChanges = `تصحيح بيانات مقرر «${course.name}» في صحيفة «${ctx.plan.name}»`;
    res.json({ course: { id: updated.AdCourseId, credit: updated.CourseCredit, hours: updated.CourseHours, capacity: updated.MaxStudent } });
  });

  /** يكتب في المسوّدة: تُنشأ من المعتمدة إن لم تكن، وتعود «قيد المراجعة» بكل تعديل. */
  async function editDraft(ctx: Context, req: any, change: (draft: CurriculumRuleSet) => CurriculumRuleSet) {
    const by = deps.actorName(req);
    const live = await Repository.getRuleSet(ctx.plan.id);
    return Repository.updateRuleDraft(ctx.plan.id, current => {
      const base: CurriculumRuleSet = current ? { ...current } : blank(ctx, by, live);
      if (base.status === "approved") { base.status = "review"; base.basedOnVersion = base.version; }
      const next = change(base);
      const groups = next.groups;
      return { ...next, status: "review", rules: withDerivedGroups(next.rules, groups), updatedAt: new Date().toISOString(), updatedBy: by };
    });
  }

  app.put("/api/plan-review/rule", deps.requireAuth, async (req: Request, res: Response) => {
    const ctx = await need(req, res, req.body?.planId, req.body?.sectionId);
    if (!ctx) return;
    if (!canEdit(req, ctx.plan)) { fail(res, 403, "لا تملك تعديل هذه الصحيفة."); return; }
    const rule = normalizeRule({ ...(req.body?.rule || {}), courseId: req.body?.rule?.courseId });
    if (!rule) { fail(res, 400, "اختر المقرر."); return; }
    const course = ctx.catalog.get(rule.courseId);
    if (!ctx.courseIds.includes(rule.courseId) || !course) { fail(res, 400, "هذا المقرر ليس في الصحيفة."); return; }
    /* قاعدةُ صاحب النظام: القسمُ يعدّل مقرراتِه لا مقرراتِ غيره. */
    if (!ownsCourse(req, course)) { fail(res, 403, `«${course.name}» يملكه قسمٌ آخر — لا يُعدَّل من هنا.`, { code: "foreign-course" }); return; }
    const empty = !rule.level && !rule.kind && !rule.prereq && !rule.coreq;
    const saved = await editDraft(ctx, req, draft => ({
      ...draft,
      rules: normalizeRules([...draft.rules.filter(item => item.courseId !== rule.courseId), ...(empty && !draft.groups.some(group => group.courseIds.includes(rule.courseId)) ? [] : [rule])]),
    }));
    res.locals.auditChanges = `قواعد صحيفة «${ctx.plan.name}»: ${course.name}`;
    res.json(await view(req, ctx).then(v => ({ ...v, saved: Boolean(saved) })));
  });

  app.put("/api/plan-review/group", deps.requireAuth, async (req: Request, res: Response) => {
    const ctx = await need(req, res, req.body?.planId, req.body?.sectionId);
    if (!ctx) return;
    if (!canEdit(req, ctx.plan)) { fail(res, 403, "لا تملك تعديل هذه الصحيفة."); return; }
    const raw = req.body?.group || {};
    const group = normalizeGroup({ ...raw, id: String(raw.id || "").trim() || `g${Date.now().toString(36)}` });
    if (!group) { fail(res, 400, "اكتب اسم المجموعة."); return; }
    group.courseIds = group.courseIds.filter(id => ctx.courseIds.includes(id));
    await editDraft(ctx, req, draft => ({ ...draft, groups: [...draft.groups.filter(item => item.id !== group.id).map(item => ({ ...item, courseIds: item.courseIds.filter(id => !group.courseIds.includes(id)) })), group] }));
    res.locals.auditChanges = `مجموعة اختيارية في صحيفة «${ctx.plan.name}»: ${group.name}`;
    res.json(await view(req, ctx));
  });

  app.post("/api/plan-review/group/delete", deps.requireAuth, async (req: Request, res: Response) => {
    const ctx = await need(req, res, req.body?.planId, req.body?.sectionId);
    if (!ctx) return;
    if (!canEdit(req, ctx.plan)) { fail(res, 403, "لا تملك تعديل هذه الصحيفة."); return; }
    const id = String(req.body?.groupId || "");
    await editDraft(ctx, req, draft => ({ ...draft, groups: draft.groups.filter(item => item.id !== id) }));
    res.locals.auditChanges = `حذف مجموعة اختيارية من صحيفة «${ctx.plan.name}»`;
    res.json(await view(req, ctx));
  });

  app.post("/api/plan-review/approve", deps.requireAuth, async (req: Request, res: Response) => {
    const ctx = await need(req, res, req.body?.planId, req.body?.sectionId);
    if (!ctx) return;
    if (!canApprove(req, ctx.plan)) { fail(res, 403, "الاعتماد لرئيس لجنة الجدول.", { code: "not-approver" }); return; }
    const draft = await Repository.getRuleDraft(ctx.plan.id);
    if (!draft || draft.status !== "review") { fail(res, 409, "لا مسوّدةَ قيد المراجعة لهذه الصحيفة."); return; }
    const issues = issuesOf(ctx, draft).filter(issue => issue.severity === "block");
    if (issues.length) { fail(res, 409, `لا يُعتمد وفي القواعد ${countOf(issues.length, AR.blocker)}: ${issues[0].text}`, { code: "blockers", issues }); return; }
    try {
      const approved = await Repository.approveRuleDraft(ctx.plan.id, String(req.body?.updatedAt || ""), deps.actorName(req));
      /* صحيفةٌ منشورة للعامة تتبع اعتمادها: تُعاد لقطتُها بالقواعد الجديدة، فلا يبقى الرابطُ على نسخةٍ قديمة.
         الاستيرادُ متأخر لأن وحدة النشر تستورد من هذه الوحدة. */
      const republished = await (await import("./planSheetRoutes")).republishIfPublished(ctx.plan.id, deps.actorName(req)).catch(() => false);
      res.locals.auditChanges = `اعتماد صحيفة «${ctx.plan.name}» — الإصدار ${approved.version}${republished ? "، وتحديث صفحتها العامة" : ""}`;
      res.json(await view(req, ctx));
    } catch (error) {
      if (error instanceof RuleDraftConflict) { fail(res, 409, error.message, { code: "stale" }); return; }
      throw error;
    }
  });

  /* ── اعتماد كل الصحائف: معاينةٌ ثم تنفيذ ──────────────────────────────────────────────────────────────
     لكل مسوّدةٍ قيد المراجعة (جديدةً أو سابقة) ما يصحّ اعتماده: لا حاجز في قواعدها (الشرط نفسه في اعتماد صحيفةٍ واحدة).
     ما فيه حاجزٌ يُعرض بسببه ولا يُعتمد. للحساب الرئيسي وحده. */
  const approvalPlan = async () => {
    const drafts = (await Repository.listRuleDrafts()).filter(draft => draft.status === "review");
    const [sectionRows, collegeRows] = await Promise.all([Repository.getSections(), Repository.getColleges()]);
    const labels = sectionLabels(sectionRows as any[], collegeRows as any[]);
    const ready: Array<{ planId: string; sectionId: number; plan: string; section: string; updatedAt: string; repaired: boolean }> = [];
    const blocked: Array<{ planId: string; sectionId: number; plan: string; section: string; reason: string }> = [];
    for (const draft of drafts) {
      const ctx = await context(draft.planId, draft.AdSectionId);
      const section = labels.get(draft.AdSectionId) || "";
      if (!ctx) { blocked.push({ planId: draft.planId, sectionId: draft.AdSectionId, plan: "", section, reason: "الصحيفة غير موجودة" }); continue; }
      /* مقررٌ في مجموعتين يبقى في الأولى: إصلاحٌ آلي لا يخسر شيئاً، يُكتب عند الاعتماد لا عند المعاينة. */
      const groups = dedupeGroups(draft.groups), repaired = groups.length !== draft.groups.length || groups.some((group, at) => group.courseIds.length !== draft.groups[at]?.courseIds.length);
      const issues = issuesOf(ctx, { rules: draft.rules, groups }).filter(issue => issue.severity === "block");
      if (issues.length) { blocked.push({ planId: draft.planId, sectionId: draft.AdSectionId, plan: ctx.plan.name, section, reason: `${countOf(issues.length, AR.blocker)}: ${issues[0].text}` }); continue; }
      ready.push({ planId: draft.planId, sectionId: draft.AdSectionId, plan: ctx.plan.name, section, updatedAt: String(draft.updatedAt || ""), repaired });
    }
    return { ready, blocked };
  };
  app.get("/api/plan-review/approve-all", deps.requireAuth, async (req: Request, res: Response) => {
    if (!deps.isRootAdmin(req)) { fail(res, 403, "للحساب الرئيسي وحده."); return; }
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, ...(await approvalPlan()) });
  });
  app.post("/api/plan-review/approve-all", sheetLimit, deps.requireAuth, express.json({ limit: "1mb" }), async (req: Request, res: Response) => {
    if (!deps.isRootAdmin(req)) { fail(res, 403, "للحساب الرئيسي وحده."); return; }
    const by = deps.actorName(req);
    /* يُنفَّذ ما رآه المسؤول في المعاينة وحده بإصداراته: مسوّدةٌ صارت جاهزةً بعدها لا تُعتمد دون أن تُعرض عليه. */
    const previewed = new Map<string, string>((Array.isArray(req.body?.items) ? req.body.items : []).map((item: any) => [String(item?.planId || ""), String(item?.updatedAt || "")] as [string, string]));
    if (!previewed.size) { fail(res, 400, "عاين الصحائف أولاً."); return; }
    const plan = await approvalPlan();
    const { blocked } = plan;
    const ready = plan.ready.filter(item => previewed.get(item.planId) === item.updatedAt);
    let approved = 0, stale = 0;
    const republish = (await import("./planSheetRoutes")).republishIfPublished;
    for (const item of ready) {
      try {
        let expected = item.updatedAt;
        if (item.repaired) {
          const fixed = await Repository.updateRuleDraft(item.planId, current => {
            if (!current || current.status !== "review" || current.updatedAt !== item.updatedAt) throw new RuleDraftConflict("تغيّرت المسوّدةُ قبل إصلاحها.");
            const groups = dedupeGroups(current.groups);
            return { ...current, groups, rules: withDerivedGroups(current.rules, groups), updatedAt: new Date().toISOString() };
          });
          expected = String(fixed?.updatedAt || "");
        }
        await Repository.approveRuleDraft(item.planId, expected, by);
        await republish(item.planId, by).catch(() => false);
        approved += 1;
      } catch (error) {
        if (error instanceof RuleDraftConflict) { stale += 1; continue; }
        throw error;
      }
    }
    res.locals.auditChanges = `اعتماد كل الصحائف: ${approved} اعتُمدت${stale ? `، ${stale} تغيّرت أثناء الاعتماد` : ""}${blocked.length ? `، ${blocked.length} فيها حواجز` : ""}`;
    res.json({ ok: true, approved, stale, blocked });
  });

  /* ── تطبيق صحيفة تكنولوجيا التعليم المرجعية على كتالوج الموقع ──────────────────────
     المعاينة والتطبيق من الدالة نفسها (planReferenceApplication): ما يُعرض هو ما يُكتب.
     الحساب الرئيسي وحده؛ يصحّح الاسم والوحدات والساعات إلى الصحيفة، ويضيف الناقص في قسمه المالك،
     ويربط مقررات القسم بالصحيفة، ويُنشئ مسوّدة قواعد (مستوى/نوع/مسبقات/مجموعات) لا تُعتمد. */
  app.post("/api/plan-review/reference/apply", deps.requireAuth, async (req: Request, res: Response) => {
    if (!deps.isRootAdmin(req)) { fail(res, 403, "تطبيق الصحيفة المرجعية للحساب الرئيسي وحده."); return; }
    const reference = TECHNOLOGY_EDUCATION_CURRICULA.find(row => row.id === req.body?.referenceId);
    if (!reference) { fail(res, 400, "اختر الصحيفة القديمة أو الجديدة."); return; }
    const dryRun = req.body?.dryRun !== false;
    const [sections, colleges] = await Promise.all([Repository.getSections(), Repository.getColleges()]);
    const wanted = Array.isArray(req.body?.sectionIds) ? new Set((req.body.sectionIds as unknown[]).map(Number)) : null;
    const targets = (sections as any[]).filter(row => isTechnologyEducation(row.AdSectionName) && (!wanted || wanted.has(Number(row.AdSectionId))));
    if (!targets.length) { fail(res, 404, "لا قسم تكنولوجيا التعليم في المواقع المختارة."); return; }
    const by = deps.actorName(req);
    const reports: any[] = [];
    for (const target of targets) {
      const sid = Number(target.AdSectionId), cid = Number(target.AdCollegeId);
      const collegeName = String((colleges as any[]).find(row => Number(row.AdCollegeId) === cid)?.AdCollegeName || "");
      const branch = collegeBranchRoot(colleges as any[], cid);
      const report: any = { sectionId: sid, collegeId: cid, collegeName, branch, planId: null, planNote: "", updates: [], creates: [], links: [], skipped: [], notes: [], rules: 0, groups: 0, externals: 0, applied: false };
      let courses = await Repository.getCourses();
      let snapshot = await referenceSnapshotFor(sections as any[], courses)(target);
      let ref: any = snapshot.references.find((row: any) => row.id === reference.id);
      if (!branch) { report.planNote = "موقع بلا فرع معروف: لم يُطبَّق."; reports.push(report); continue; }
      if (!ref.planId) {
        const live = snapshot.plans.filter(plan => !plan.virtual && plan.status !== "archived");
        if (reference.id === "old" && live.length) report.planNote = "لا صحيفة انتقالية (سابقة) في هذا الموقع: تُنشأ مع الصحيفة الجديدة فحسب.";
        else if (dryRun) report.planNote = reference.id === "new" ? "ستُنشأ الصحيفة الجديدة وتُنقل الحالية إلى «السابقة»." : "ستُنشأ الصحيفة الجديدة فتظهر معها «الصحيفة السابقة».";
        else {
          await Repository.createCurriculumPlan({ collegeId: cid, sectionId: sid, name: `الصحيفة الجديدة ${reference.effectiveTerm}`, by });
          snapshot = await referenceSnapshotFor(sections as any[], courses)(target);
          ref = snapshot.references.find((row: any) => row.id === reference.id);
        }
        if (report.planNote.startsWith("لا صحيفة")) { reports.push(report); continue; }
      }
      report.planId = ref.planId;
      const members = new Set<number>(snapshot.links.filter(link => link.planId === ref.planId).map(link => Number(link.AdCourseId)));
      const application = planReferenceApplication(reference, ref.groups, branch, members, sid);
      /* الاسم المجمَّد: مقرر في صحيفةٍ غير فعّالة (في قسمه). */
      const frozenCache = new Map<number, Set<number>>();
      const frozenIdsOf = async (sectionOfCourse: number): Promise<Set<number>> => {
        if (!frozenCache.has(sectionOfCourse)) {
          const [ownPlans, ownLinks] = await Promise.all([Repository.getCurriculumPlans(sectionOfCourse), Repository.getCurriculumPlanCourses(sectionOfCourse)]);
          const inactive = new Set(ownPlans.filter(plan => plan.status !== "active" && !plan.virtual).map(plan => plan.id));
          frozenCache.set(sectionOfCourse, new Set(ownLinks.filter(link => inactive.has(link.planId)).map(link => Number(link.AdCourseId))));
        }
        return frozenCache.get(sectionOfCourse)!;
      };
      for (const update of application.updates) update.frozen = update.identityChange && (await frozenIdsOf(update.ownerSectionId)).has(update.courseId);
      const { apply: toApply, held } = splitFrozenUpdates(application.updates, req.body?.confirmIdentity === true);
      Object.assign(report, { held, updates: application.updates, creates: application.creates, links: application.links, skipped: application.skipped, notes: application.notes, courseCount: application.courseCount, externals: application.externals });
      if (dryRun || !ref.planId) { reports.push(report); continue; }

      /* 1) تصحيح ما يخالف الصحيفة */
      for (const update of toApply) {
        const row = (courses as AdCourse[]).find(course => Number(course.AdCourseId) === update.courseId);
        if (!row) continue;
        await Repository.updateCourse(row.AdCourseId, row.AdCollegeId, row.AdSectionId, row.CourseCode, update.after.name, update.after.credit, update.after.hours, Number(row.MaxStudent) || 0);
      }
      /* 2) إضافة الناقص في كتالوج قسمه المالك */
      const createdIds = new Map<string, number>();
      for (const create of application.creates) {
        const ownerCourses = (courses as AdCourse[]).filter(course => Number(course.AdSectionId) === create.sectionId);
        const shortStyle = ownerCourses.length > 0 && ownerCourses.filter(course => /^\d{1,3}$/.test(referenceCodeKey(course.CourseCode))).length * 2 > ownerCourses.length;
        const code = shortStyle ? String(Number(create.code.slice(-3))) : create.code;
        try {
          const made = await Repository.createCourse(cid, create.sectionId, code, create.name, create.credit, create.hours, 0, false);
          createdIds.set(create.code, Number(made.AdCourseId));
        } catch (error) {
          if (error instanceof DuplicateResourceError) report.notes.push(`«${create.name}»: الرمز ${code} مستعمل في القسم؛ لم يُنشأ.`);
          else throw error;
        }
      }
      courses = await Repository.getCourses();
      const after = referenceSnapshotFor(sections as any[], courses);
      snapshot = await after(target);
      ref = snapshot.references.find((row: any) => row.id === reference.id);
      /* 3) ربط مقررات القسم بالصحيفة */
      const byId = new Map((courses as AdCourse[]).map(course => [Number(course.AdCourseId), course] as const));
      const memberNow = new Set<number>(snapshot.links.filter(link => link.planId === ref.planId).map(link => Number(link.AdCourseId)));
      const skipCodes = new Set<string>(application.skipped.map(item => referenceCodeKey(item.code)));
      const memberIdByCode = new Map<string, number>(), knownIdByCode = new Map<string, number>(), externalIdByCode = new Map<string, number>();
      for (const group of ref.groups) for (const course of group.courses) {
        const key = referenceCodeKey(course.code);
        if (!course.current || skipCodes.has(key)) continue;
        knownIdByCode.set(key, Number(course.current.id));
        if (course.ownerSectionId !== sid) {
          /* مقررُ قسمٍ آخر: متطلبٌ عامٌّ للقراءة. يُصحَّح في كتالوج قسمه، ولا يُربط بعضوية هذه الصحيفة. */
          externalIdByCode.set(key, Number(course.current.id));
          continue;
        }
        const row = byId.get(Number(course.current.id));
        if (!row) continue;
        if (!memberNow.has(row.AdCourseId)) await Repository.addCourseToCurriculumPlan(ref.planId, row, by);
        memberIdByCode.set(key, Number(row.AdCourseId));
      }
      /* 4) مسوّدة القواعد: لا تُعتمد، ولا تمحو ما كتبه القسم. المتطلباتُ العامة تدخلها قراءةً (للقسم) وبقواعدها (للإدارة). */
      const ruleScope = new Map<string, number>([...memberIdByCode, ...externalIdByCode]);
      const built = buildReferenceRules(reference, ruleScope, knownIdByCode, skipCodes);
      const live = await Repository.getRuleSet(ref.planId);
      const allIds = new Set<number>(ruleScope.values());
      const externalIds = [...externalIdByCode.values()];
      await Repository.updateRuleDraft(ref.planId, current => {
        const base: CurriculumRuleSet = current ? { ...current } : { id: ref.planId, planId: ref.planId, AdCollegeId: cid, AdSectionId: sid, rules: live?.rules || [], groups: live?.groups || [], externals: live?.externals, version: live?.version || 0, status: "review", basedOnVersion: live?.version || 0, updatedAt: "", updatedBy: by };
        const hasRule = new Set(base.rules.map(rule => rule.courseId));
        const hasGroup = new Set(base.groups.map(group => group.id));
        const rules = normalizeRules([...base.rules, ...built.rules.filter(rule => !hasRule.has(rule.courseId))]);
        const groups = [...base.groups, ...built.groups.filter(group => !hasGroup.has(group.id)).map(group => normalizeGroup({ ...group, courseIds: group.courseIds.filter(id => allIds.has(id)) })).filter(Boolean) as ElectiveGroup[]];
        const externals = [...new Set([...(base.externals || []), ...externalIds])].sort((a, b) => a - b);
        return { ...base, rules: withDerivedGroups(rules, groups), groups, externals, status: "review", updatedAt: new Date().toISOString(), updatedBy: `تطبيق الصحيفة المرجعية · ${by}` };
      });
      report.externals = externalIds.length; report.rules = built.rules.length; report.groups = built.groups.length; report.notes.push(...built.notes.slice(0, 20)); report.applied = true;
      reports.push(report);
    }
    if (!dryRun) {
      const total = reports.reduce((sum, row) => sum + row.updates.length + row.creates.length + row.links.length, 0);
      res.locals.auditChanges = `تطبيق ${reference.name} (${reference.program}) على ${countOf(reports.filter(row => row.applied).length, AR.site)}: ${countOf(total, AR.change)}`;
    }
    res.json({ referenceId: reference.id, dryRun, sites: reports });
  });

  /* قراءةُ ترويسة صحيفةٍ بلا أي كتابة: لتصفية الدفعة (الأحدث من القديمة لكل برنامج) قبل رفعها. */
  app.post("/api/plan-review/sheet/scan", sheetLimit, deps.requireAuth, express.raw({ type: "application/octet-stream", limit: PLAN_PDF_MAX_BYTES + 4096 }), async (req: Request, res: Response) => {
    if (!deps.isRootAdmin(req)) { fail(res, 403, "رفع الصحيفة للحساب الرئيسي وحده."); return; }
    const body = Buffer.isBuffer(req.body) ? req.body : null;
    if (!body?.length || body.subarray(0, 5).toString("latin1") !== "%PDF-") { res.status(422).json({ error: "الملف ليس PDF." }); return; }
    try {
      const sheet = parsePlanItems(await extractPlanItems(body));
      const fresh = isNewSheet(sheet), ownKeys = new Set(ownCourses(sheet, sheetKey(sheet)).map(course => course.codeKey));
      /* مقررات الأقسام الأخرى في الجديدة (تُجمع من كل الصحائف فيُعتمد الأشيع منها للأقسام التي لا صحيفة لها). */
      const others = fresh ? sheet.courses.filter(course => !ownKeys.has(course.codeKey)).map(course => [course.codeKey, course.name, course.units, course.hours]) : [];
      res.json({ program: sheet.program, programName: sheet.programName, year: sheet.startYear, department: sheet.department, isNew: fresh, readable: sheet.courses.length > 0 && blockingWarnings(sheet).length === 0, others });
    } catch { res.status(422).json({ error: "تعذّرت قراءة الملف." }); }
  });

  /* ── أقسامٌ لا صحيفة لها: مقرراتها ووحداتها وساعاتها من الصحائف الأخرى ─────────────────────────────
     بعد دفعة الرفع تُرسل الواجهةُ الأشيعَ بين الصحائف الجديدة لكل مقرر قسمٍ آخر؛ فيُصحَّح به مقرر قسمٍ لم تدخل مقرراتُه صحيفةً فعّالة
     (صاحب الصحيفة يصحّح مقرراته من صحيفته)، ومن لا أغلبية له يُذكر ولا يُمسّ. السعة لا تُلمس. */
  /* ── المقررات الدخيلة (بقايا الإضافة القديمة): مقررٌ في قسمٍ ليس في أيّ صحيفةٍ له، ولا جدولَ يستعمله،
     وله نسخةٌ في قسمٍ آخر داخل صحيفته: الرقم والاسم نفساهما. الرقم لا يتكرر بين الأقسام، فالنسخة دخيلة.
     المعاينة قراءةٌ فحسب؛ والحذف يُعيد الفحص ويحذف ما اختاره المسؤول من المعاينة وحده. ما لا نسخة له يبقى. */
  const nameKey = (value: unknown) => String(value || "").normalize("NFKD").replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim();
  const foreignScan = async () => {
    const [sections, colleges, courses] = await Promise.all([Repository.getSections(), Repository.getColleges(), Repository.getCourses()]);
    const collegeName = new Map((colleges as any[]).map(row => [Number(row.AdCollegeId), String(row.AdCollegeName || "")]));
    const sectionName = new Map((sections as any[]).map(row => [Number(row.AdSectionId), `${collegeName.get(Number(row.AdCollegeId)) || ""} · ${row.AdSectionName}`]));
    const sectionCollege = new Map((sections as any[]).map(row => [Number(row.AdSectionId), Number(row.AdCollegeId)]));
    const sectionNames = new Map((sections as any[]).map(row => [Number(row.AdSectionId), String(row.AdSectionName || "")]));
    const linked = new Set<number>();
    const planned = new Set<number>();
    for (const section of sections as any[]) {
      for (const link of await Repository.getCurriculumPlanCourses(Number(section.AdSectionId)) as any[]) linked.add(Number(link.AdCourseId));
      if ((await Repository.getCurriculumPlans(Number(section.AdSectionId)) as any[]).some(plan => !plan.virtual)) planned.add(Number(section.AdSectionId));
    }
    /* الأصل: نسخةٌ برقم المقرر واسمه في قسمٍ باسمٍ مختلف (القسم نفسه في كليةٍ أخرى ليس دخيلاً: لكل موقعٍ نسخته)،
       وهو إما داخل صحيفة، أو في قسمٍ عاديٍّ حين يكون الدخيلُ في «وحدةٍ» قديمة (بلا صحيفة) كوحدة الكهرباء. */
    const keyOf = (course: any) => `${String(course.CourseCode).trim()}|${nameKey(course.CourseName)}`;
    /* «وحدة» قديمة: اسمها «وحدة …» وليست لها أي صحيفة (وحدةٌ لها صحائف قسمٌ حيّ لا يُعامَل هكذا). */
    const isUnit = (sid: number) => /^\s*وحدة/.test(String(sectionNames.get(sid) || "")) && !planned.has(sid);
    const byKey = new Map<string, any[]>();
    for (const course of courses as any[]) byKey.set(keyOf(course), [...(byKey.get(keyOf(course)) || []), course]);
    const out = new Map<number, { sectionId: number; section: string; courses: any[] }>();
    for (const course of courses as any[]) {
      if (linked.has(Number(course.AdCourseId))) continue;
      const sid0 = Number(course.AdSectionId), unit = isUnit(sid0);
      const owners = (byKey.get(keyOf(course)) || []).filter(other => Number(other.AdSectionId) !== sid0
        && !(departmentFamilyKey(sectionNames.get(Number(other.AdSectionId))) === departmentFamilyKey(sectionNames.get(sid0)) && sectionCollege.get(Number(other.AdSectionId)) !== sectionCollege.get(sid0))
        && (linked.has(Number(other.AdCourseId)) || (unit && !isUnit(Number(other.AdSectionId)))));
      let owner = owners.find(other => linked.has(Number(other.AdCourseId))) || owners[0];
      /* بقايا وحدةٍ قديمة لا نسخة بنفس رقمها (رمزٌ مكتوبٌ بصيغةٍ أخرى): يُبحث بالاسم وحده في قسمٍ باسمٍ مختلف؛
         وما لا نظير له يُعرض «بلا نسخة» لتقرّر أنت، فالوحدة كلها قديمة. */
      let kind = "copy";
      if (!owner && unit) {
        const sameName = (courses as any[]).find(other => Number(other.AdSectionId) !== sid0 && nameKey(other.CourseName) === nameKey(course.CourseName)
          && departmentFamilyKey(sectionNames.get(Number(other.AdSectionId))) !== departmentFamilyKey(sectionNames.get(sid0)) && !isUnit(Number(other.AdSectionId)));
        owner = sameName; kind = sameName ? "name" : "orphan";
      }
      if (!owner && !(unit && kind === "orphan")) continue;
      if (await Repository.hasSchedulesForCourse(Number(course.AdCourseId))) continue;
      const sid = Number(course.AdSectionId);
      const row = out.get(sid) || { sectionId: sid, section: sectionName.get(sid) || String(sid), courses: [] };
      row.courses.push({ id: Number(course.AdCourseId), code: course.CourseCode, name: course.CourseName, kind, ownerSection: owner ? (sectionName.get(Number(owner.AdSectionId)) || "") : "" });
      out.set(sid, row);
    }
    return [...out.values()].sort((a, b) => b.courses.length - a.courses.length);
  };
  app.get("/api/plan-review/sheet/foreign", deps.requireAuth, async (req: Request, res: Response) => {
    if (!deps.isRootAdmin(req)) { fail(res, 403, "للحساب الرئيسي وحده."); return; }
    res.setHeader("Cache-Control", "no-store");
    const sections = await foreignScan();
    res.json({ ok: true, sections, total: sections.reduce((sum, row) => sum + row.courses.length, 0) });
  });
  app.post("/api/plan-review/sheet/foreign/delete", sheetLimit, deps.requireAuth, express.json({ limit: "1mb" }), async (req: Request, res: Response) => {
    if (!deps.isRootAdmin(req)) { fail(res, 403, "للحساب الرئيسي وحده."); return; }
    const ids = new Set(((req.body?.ids as unknown[]) || []).map(Number).filter(Number.isFinite));
    if (!ids.size) { fail(res, 400, "لا مقررات للحذف."); return; }
    const names: string[] = [];
    for (const section of await foreignScan()) for (const course of section.courses) {
      if (!ids.has(course.id)) continue;
      await Repository.deleteCourse(course.id);
      names.push(`${course.code} ${course.name} (من ${section.section})`);
    }
    res.locals.auditChanges = `حذف دخيل (${names.length}): ${names.slice(0, 40).join(" | ")}`;
    res.json({ ok: true, deleted: names.length });
  });

  /* ── حسابات الأقسام الموجودة: معاينةٌ ثم إنشاءُ الناقص لما يختاره المسؤول (رئيس القسم · رئيس الجدول · المرشد) ── */
  /* ── مقررات الأقسام الخدمية (بلا صحائف): تُضاف بتأكيد المسؤول لكل رمز قسم ─────────────────────────────
     الأشيعُ من الصحائف الجديدة لكل مقرر قسمٍ لا قسم له بالنظام (رمز كلية+قسم). يختار المسؤول لكل رمزٍ القسمَ الذي تُحفظ فيه،
     فتُنشأ مقرراتُه برمزها الكامل (7 خانات: كلية+قسم+رقم) في كل مواقع مسار ذلك القسم، فلا يلتبس رقمٌ بقسمٍ آخر ولا يتكرر ما له نسخة.
     ما له قسمٌ بصحيفة يُرفض (مقرراته من صحيفته). السعة صفر، والموجود لا يُمسّ ولا يُعدَّل. */
  const serviceCoursesOf = (raw: unknown) => {
    const seen = new Map<string, { key: string; name: string; units: number; hours: number }>();
    for (const item of Array.isArray(raw) ? raw : []) {
      const key = String(item?.key || "").replace(/\D/g, ""), name = correctCourseName(String(item?.name || "")).name.trim();
      const units = Number(item?.units), hours = Number(item?.hours);
      if (key.length !== 7 || !name || !Number.isFinite(units) || !Number.isFinite(hours) || units < 0 || units > 20 || hours < 0 || hours > 40) continue;
      if (!seen.has(key)) seen.set(key, { key, name, units, hours });
    }
    return [...seen.values()];
  };
  const authorityKeys = (sections: any[], colleges: any[]) => new Set(sections.map(row => authorityDepartmentCode(colleges.find(c => Number(c.AdCollegeId) === Number(row.AdCollegeId))?.AdCollegeCode, row.AdSectionCode)));
  app.post("/api/plan-review/service-courses/groups", sheetLimit, deps.requireAuth, express.json({ limit: "2mb" }), async (req: Request, res: Response) => {
    if (!deps.isRootAdmin(req)) { fail(res, 403, "للحساب الرئيسي وحده."); return; }
    const [sections, colleges] = await Promise.all([Repository.getSections(), Repository.getColleges()]);
    const has = authorityKeys(sections as any[], colleges as any[]);
    const groups = new Map<string, Array<{ key: string; name: string; units: number; hours: number }>>();
    for (const course of serviceCoursesOf(req.body?.courses)) if (!has.has(course.key.slice(0, 4))) groups.set(course.key.slice(0, 4), [...(groups.get(course.key.slice(0, 4)) || []), course]);
    res.json({ ok: true, groups: [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([deptKey, courses]) => ({ deptKey, courses: courses.sort((a, b) => a.key.localeCompare(b.key)) })) });
  });
  app.post("/api/plan-review/service-courses/apply", sheetLimit, deps.requireAuth, express.json({ limit: "2mb" }), async (req: Request, res: Response) => {
    if (!deps.isRootAdmin(req)) { fail(res, 403, "للحساب الرئيسي وحده."); return; }
    const dryRun = req.body?.dryRun !== false, relocate = req.body?.relocate === true;
    const [sections, colleges] = await Promise.all([Repository.getSections(), Repository.getColleges()]);
    const has = authorityKeys(sections as any[], colleges as any[]);
    const wanted = serviceCoursesOf(req.body?.courses);
    const assignments = new Map<string, number>();
    for (const item of Array.isArray(req.body?.assignments) ? req.body.assignments : []) {
      const deptKey = String(item?.deptKey || "").replace(/\D/g, ""), sectionId = Number(item?.sectionId);
      if (deptKey.length !== 4 || !sectionId) continue;
      assignments.set(deptKey, sectionId);
    }
    /* مقررٌ بعينه قد يتبع قسماً غير قسم رمزه (رمزٌ يجمع مقررات أصول ومناهج مثلاً): يغلب على اختيار الرمز. */
    const overrides = new Map<string, number>();
    for (const [rawKey, rawId] of Object.entries((req.body?.overrides && typeof req.body.overrides === "object") ? req.body.overrides : {})) {
      const key = String(rawKey).replace(/\D/g, ""), sectionId = Number(rawId);
      if (key.length === 7 && sectionId) overrides.set(key, sectionId);
    }
    const sectionExists = (id: number) => (sections as any[]).some(row => Number(row.AdSectionId) === id);
    for (const [deptKey, sectionId] of [...assignments, ...[...overrides].map(([key, id]) => [key.slice(0, 4), id] as [string, number])]) {
      if (has.has(deptKey)) { fail(res, 422, `القسم ${deptKey} له صحيفة: مقرراته من صحيفته لا من هنا.`); return; }
      if (!sectionExists(sectionId)) { fail(res, 404, "اختر قسماً موجوداً."); return; }
    }
    /* لكل قسمٍ مختار مقرراته. */
    const bySection = new Map<number, typeof wanted>();
    for (const course of wanted) {
      const target = overrides.get(course.key) || assignments.get(course.key.slice(0, 4));
      if (target) bySection.set(target, [...(bySection.get(target) || []), course]);
    }
    if (!bySection.size) { fail(res, 400, "اختر القسم لرمزٍ أو مقررٍ واحد على الأقل."); return; }
    const courses = await Repository.getCourses() as AdCourse[];
    const sectionCodes = new Map((sections as any[]).map(row => [Number(row.AdSectionId), authorityDepartmentCode((colleges as any[]).find(c => Number(c.AdCollegeId) === Number(row.AdCollegeId))?.AdCollegeCode, row.AdSectionCode)] as const));
    /* هوية المقرر في الكتالوج: رمزٌ قصير يُوسَّع برمز قسمه، وإلا كما هو. */
    const keyOf = (row: AdCourse) => { const code = referenceCodeKey(row.CourseCode), dept = sectionCodes.get(Number(row.AdSectionId)) || ""; return /^\d{1,3}$/.test(code) && /^\d{4}$/.test(dept) ? `${dept}${code.padStart(3, "0")}` : code; };
    const have = new Set(courses.map(row => `${Number(row.AdCollegeId)}|${keyOf(row)}`));
    const report: Array<{ deptKey: string; section: string; sites: number; created: number; existing: number; moved: number; names: string[] }> = [];
    let total = 0;
    for (const [sectionId, list] of bySection) {
      /* القسم نفسه في كل الكليات (بنات وبنين والجهراء والفحيحيل): لكل كليةٍ نسختُها من مقرراته، فالصحائفُ تقرأ كتالوج كليتها. */
      const chosenRow = (sections as any[]).find(row => Number(row.AdSectionId) === sectionId);
      const family = departmentFamilyKey(String(chosenRow?.AdSectionName || ""));
      const sites: any[] = [];
      for (const row of [chosenRow, ...(sections as any[])]) {
        if (!row || sites.some(site => Number(site.AdCollegeId) === Number(row.AdCollegeId))) continue;
        if (Number(row.AdSectionId) === sectionId || departmentFamilyKey(String(row.AdSectionName || "")) === family) sites.push(row);
      }
      const row = { deptKey: [...new Set(list.map(course => course.key.slice(0, 4)))].join("، "), section: String(sites[0]?.AdSectionName || ""), sites: sites.length, created: 0, existing: 0, moved: 0, names: [] as string[] };
      for (const site of sites) for (const course of list) {
        if (have.has(`${Number(site.AdCollegeId)}|${course.key}`)) {
          /* أُنشئ سابقاً في قسمٍ غير المختار: يُنقل (حذفٌ مؤرشف وإنشاءٌ في قسمه) إن كان من هذه اللوحة (رمزه الكامل) ولم يُستعمل: لا سعة ولا ربط بصحيفة ولا جدول. */
          const misplaced = relocate ? courses.filter(item => Number(item.AdCollegeId) === Number(site.AdCollegeId) && keyOf(item) === course.key && Number(item.AdSectionId) !== Number(site.AdSectionId)) : [];
          const inPlace = courses.some(item => Number(item.AdCollegeId) === Number(site.AdCollegeId) && keyOf(item) === course.key && Number(item.AdSectionId) === Number(site.AdSectionId));
          let movable = misplaced.length > 0 && !inPlace;
          for (const item of movable ? misplaced : []) {
            if (referenceCodeKey(item.CourseCode) !== course.key || Number(item.MaxStudent) > 0 || await Repository.hasSchedulesForCourse(Number(item.AdCourseId))) { movable = false; break; }
            const links = await Repository.getCurriculumPlanCourses(Number(item.AdSectionId));
            if (links.some(link => Number(link.AdCourseId) === Number(item.AdCourseId))) { movable = false; break; }
          }
          if (!movable) { row.existing += 1; continue; }
          if (!dryRun) {
            for (const item of misplaced) await Repository.deleteCourse(Number(item.AdCourseId));
            await Repository.createCourse(Number(site.AdCollegeId), Number(site.AdSectionId), course.key, course.name, course.units, course.hours, 0, false);
          }
          row.moved += 1; total += 1;
          continue;
        }
        if (!dryRun) {
          try { await Repository.createCourse(Number(site.AdCollegeId), Number(site.AdSectionId), course.key, course.name, course.units, course.hours, 0, false); have.add(`${Number(site.AdCollegeId)}|${course.key}`); }
          catch (error) { if (error instanceof DuplicateResourceError) { row.existing += 1; continue; } throw error; }
        }
        row.created += 1; total += 1;
        if (row.names.length < 12) row.names.push(course.name);
      }
      report.push(row);
    }
    if (!dryRun) res.locals.auditChanges = `مقررات أقسامٍ خدمية: ${countOf(total, AR.course)} في ${countOf(bySection.size, AR.department)}`;
    res.json({ ok: true, dryRun, created: total, report });
  });

  app.get("/api/plan-review/section-accounts", deps.requireAuth, async (req: Request, res: Response) => {
    if (!deps.isRootAdmin(req)) { fail(res, 403, "للحساب الرئيسي وحده."); return; }
    res.setHeader("Cache-Control", "no-store");
    const rows = await planSectionAccounts(Repository);
    res.json({ ok: true, rows, total: rows.reduce((sum, row) => sum + row.missing.length, 0) });
  });
  app.post("/api/plan-review/section-accounts", sheetLimit, deps.requireAuth, express.json({ limit: "1mb" }), async (req: Request, res: Response) => {
    if (!deps.isRootAdmin(req)) { fail(res, 403, "للحساب الرئيسي وحده."); return; }
    const ids = new Set(((req.body?.sectionIds as unknown[]) || []).map(Number).filter(id => Number.isFinite(id) && id > 0));
    if (!ids.size) { fail(res, 400, "اختر قسماً."); return; }
    const [sections, colleges] = await Promise.all([Repository.getSections(), Repository.getColleges()]);
    const made: string[] = [];
    const failed: string[] = [];
    for (const row of await planSectionAccounts(Repository)) {
      if (!ids.has(row.sectionId)) continue;
      const section = (sections as any[]).find(item => Number(item.AdSectionId) === row.sectionId);
      const college = (colleges as any[]).find(item => Number(item.AdCollegeId) === row.collegeId);
      if (!section || !college) continue;
      try {
        const accounts = await provisionSectionUsers(Repository, college, section, undefined, row.missing.map(item => item.role));
        made.push(...accounts.filter(item => item.status === "created").map(item => item.login));
      } catch (error: any) { failed.push(`${row.section}: ${String(error?.message || error)}`); console.error("[section-accounts]", error?.stack || error); }
    }
    res.locals.auditChanges = `إنشاء حسابات أقسام: ${made.join("، ")}${failed.length ? ` | تعثّر: ${failed.join("، ")}` : ""}`;
    res.json({ ok: true, created: made.length, logins: made, failed });
  });

  app.post("/api/plan-review/sheet/reconcile", sheetLimit, deps.requireAuth, express.json({ limit: "2mb" }), async (req: Request, res: Response) => {
    if (!deps.isRootAdmin(req)) { fail(res, 403, "رفع الصحيفة للحساب الرئيسي وحده."); return; }
    /* معطَّل مؤقتاً (انظر addOtherDepartments): يربط المقررات بالقسم من رمزه، ورموز بعض الأقسام في النظام لا تطابق الصحائف. */
    res.status(409).json({ ok: false, updated: 0, error: "تصحيح مقررات الأقسام الأخرى معطَّل حتى تُؤكَّد رموز الأقسام." }); return;
    const entries = (Array.isArray(req.body?.courses) ? req.body.courses : []).slice(0, 5000) as Array<{ key: string; name: string; units: number; hours: number }>;
    const [sections, colleges] = await Promise.all([Repository.getSections(), Repository.getColleges()]);
    const authorityOf = (row: any) => authorityDepartmentCode((colleges as any[]).find(c => Number(c.AdCollegeId) === Number(row.AdCollegeId))?.AdCollegeCode, row.AdSectionCode);
    const courses = await Repository.getCourses() as AdCourse[];
    const activeCache = new Map<number, Set<number>>();
    const activeIdsOf = async (sid: number) => {
      if (!activeCache.has(sid)) {
        const active = new Set((await Repository.getCurriculumPlans(sid)).filter(item => !item.virtual && item.status === "active").map(item => item.id));
        activeCache.set(sid, new Set((await Repository.getCurriculumPlanCourses(sid)).filter(link => active.has(link.planId)).map(link => Number(link.AdCourseId))));
      }
      return activeCache.get(sid)!;
    };
    let updated = 0;
    for (const entry of entries) {
      const key = String(entry?.key || "").replace(/\D/g, "");
      const units = Number(entry?.units), hours = Number(entry?.hours);
      if (key.length < 7 || !String(entry?.name || "").trim() || !Number.isFinite(units) || !Number.isFinite(hours)) continue;
      const number = Number(key.slice(4)), name = correctCourseName(String(entry.name)).name;
      for (const home of (sections as any[]).filter(row => authorityOf(row) === key.slice(0, 4))) {
        const rows = courses.filter(row => Number(row.AdSectionId) === Number(home.AdSectionId) && Number(referenceCodeKey(row.CourseCode).slice(-3)) === number);
        if (rows.length !== 1) continue;
        const row = rows[0];
        if ((await activeIdsOf(Number(home.AdSectionId))).has(Number(row.AdCourseId))) continue;
        if (String(row.CourseName).normalize("NFKC").trim() === name && Number(row.CourseCredit) === units && Number(row.CourseHours) === hours) continue;
        await Repository.updateCourse(row.AdCourseId, row.AdCollegeId, row.AdSectionId, row.CourseCode, name, units, hours, Number(row.MaxStudent) || 0);
        updated += 1;
      }
    }
    res.locals.auditChanges = `مقررات أقسام بلا صحائف من الصحائف الأخرى: ${countOf(updated, AR.course)}`;
    res.json({ ok: true, updated });
  });

  /* ── مقارنةُ صحيفةٍ بمقررات قسمٍ موجود (قبل مطابقته): هل هما القسم نفسه؟ قراءةٌ فحسب ── */
  app.post("/api/plan-review/sheet/compare", sheetLimit, deps.requireAuth, express.raw({ type: "application/octet-stream", limit: PLAN_PDF_MAX_BYTES + 4096 }), async (req: Request, res: Response) => {
    if (!deps.isRootAdmin(req)) { fail(res, 403, "رفع الصحيفة للحساب الرئيسي وحده."); return; }
    const sectionId = Number(req.query.sectionId) || 0;
    const body = Buffer.isBuffer(req.body) ? req.body : null;
    if (!sectionId || !body?.length || body.subarray(0, 5).toString("latin1") !== "%PDF-") { res.status(422).json({ error: "اختر قسماً وارفع PDF." }); return; }
    let sheet;
    try { sheet = parsePlanItems(await extractPlanItems(body)); } catch { res.status(422).json({ error: "تعذّرت قراءة الملف." }); return; }
    const norm = (text: string) => String(text || "").normalize("NFKC").replace(/[\s\-()\u064B-\u0652]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ه/g, "ة").replace(/ئ/g, "ي").replace(/ؤ/g, "و");
    const mine = ownCourses(sheet, sheetKey(sheet));
    const rows = await Repository.getCoursesBySection(sectionId) as AdCourse[];
    const numberOf = (code: unknown) => Number(referenceCodeKey(code).slice(-3));
    const byNumber = new Map(rows.map(row => [numberOf(row.CourseCode), row] as const));
    const byName = new Map(rows.map(row => [norm(row.CourseName), row] as const));
    const sameNumber = mine.filter(course => byNumber.has(Number(course.number)));
    const sameBoth = sameNumber.filter(course => norm(byNumber.get(Number(course.number))!.CourseName) === norm(course.name));
    const nameElsewhere = mine.filter(course => !byNumber.has(Number(course.number)) && byName.has(norm(course.name)));
    const sheetNumbers = new Set(mine.map(course => Number(course.number)));
    const similar = mine.length ? (sameBoth.length + nameElsewhere.length) / mine.length : 0;
    res.json({
      sheetCourses: mine.length, systemCourses: rows.length, sameNumber: sameNumber.length, sameNumberAndName: sameBoth.length, sameNameOtherNumber: nameElsewhere.length,
      similar: similar >= 0.4,
      differ: sameNumber.filter(course => !sameBoth.includes(course)).slice(0, 8).map(course => ({ number: course.number, sheet: course.name, system: byNumber.get(Number(course.number))!.CourseName })),
      sheetOnly: mine.filter(course => !byNumber.has(Number(course.number)) && !byName.has(norm(course.name))).length,
      systemOnly: rows.filter(row => !sheetNumbers.has(numberOf(row.CourseCode))).slice(0, 8).map(row => ({ number: String(row.CourseCode), name: row.CourseName })),
    });
  });

  /* ── لقطةٌ لحال النظام بعد الرفع (للتقرير الذي يُنزَّل): لكل قسمٍ مقرراته وصحائفه وعدد مقررات كل صحيفة ── */
  app.get("/api/plan-review/sheet/audit", deps.requireAuth, async (req: Request, res: Response) => {
    if (!deps.isRootAdmin(req)) { fail(res, 403, "رفع الصحيفة للحساب الرئيسي وحده."); return; }
    res.setHeader("Cache-Control", "no-store");
    const [sections, colleges, courses] = await Promise.all([Repository.getSections(), Repository.getColleges(), Repository.getCourses()]);
    const collegeName = new Map((colleges as any[]).map(row => [Number(row.AdCollegeId), String(row.AdCollegeName || "")]));
    const courseCount = new Map<number, number>();
    for (const row of courses as AdCourse[]) courseCount.set(Number(row.AdSectionId), (courseCount.get(Number(row.AdSectionId)) || 0) + 1);
    const rows: any[] = [];
    const list = sections as any[];
    for (let at = 0; at < list.length; at += 10) {
      rows.push(...await Promise.all(list.slice(at, at + 10).map(async section => {
        const sid = Number(section.AdSectionId);
        const [plans, links] = await Promise.all([Repository.getCurriculumPlans(sid), Repository.getCurriculumPlanCourses(sid)]);
        const perPlan = new Map<string, number>();
        for (const link of links) perPlan.set(link.planId, (perPlan.get(link.planId) || 0) + 1);
        return {
          sectionId: sid, college: collegeName.get(Number(section.AdCollegeId)) || "", name: String(section.AdSectionName || ""), code: String(section.AdSectionCode || ""),
          authority: authorityDepartmentCode((colleges as any[]).find(c => Number(c.AdCollegeId) === Number(section.AdCollegeId))?.AdCollegeCode, section.AdSectionCode),
          courses: courseCount.get(sid) || 0,
          plans: plans.filter(plan => !plan.virtual).map(plan => ({ name: plan.name, status: plan.status, track: plan.track || "", sheetYear: plan.sheetYear || 0, courses: perPlan.get(plan.id) || 0, archivedBy: plan.archivedBy || "" })),
        };
      })));
    }
    res.json({ generatedAt: new Date().toISOString(), totals: { sections: rows.length, courses: (courses as AdCourse[]).length, plans: rows.reduce((sum, row) => sum + row.plans.length, 0) }, sections: rows });
  });

  /* ── رفع «الخطة الدراسية» (صحيفة التخرج) لقسمٍ واحد: يُطبَّق مباشرةً، والقسم يعتمد بعدها ──────
     الحساب الرئيسي وحده. لا يُقبل إلا كشفُ الكلية والقسم المختارين (checkSheetScope) وقبل أي كتابة؛
     وتؤخذ مقررات القسم وحدها برقمها (105)، وتُصحَّح أسماؤها، ولا تُمسّ السعة أبداً. */
  app.post("/api/plan-review/sheet/import", sheetLimit, deps.requireAuth, express.raw({ type: "application/octet-stream", limit: PLAN_PDF_MAX_BYTES + 4096 }), async (req: Request, res: Response) => {
    if (!deps.isRootAdmin(req)) { fail(res, 403, "رفع الصحيفة للحساب الرئيسي وحده."); return; }
    const reject = (kind: string, message: string, extra: Record<string, unknown> = {}) => { res.status(422).json({ error: message, rejection: { kind, message, ...extra } }); };
    const sectionId = Number(req.query.sectionId) || 0;
    let [sections, colleges] = await Promise.all([Repository.getSections(), Repository.getColleges()]);
    const body = Buffer.isBuffer(req.body) ? req.body : null;
    if (!body?.length) { fail(res, 400, "لا ملف."); return; }
    if (body.subarray(0, 5).toString("latin1") !== "%PDF-") { reject("unreadable", "الملف ليس PDF. ارفع «الخطة الدراسية» كما تطبعها SWRCAPP (نصاً لا صورة)."); return; }
    let sheet;
    try { sheet = parsePlanItems(await extractPlanItems(body)); }
    catch (error) { reject("unreadable", error instanceof Error && /[؀-ۿ]/.test(error.message) ? error.message : "تعذّرت قراءة الملف. ارفع «الخطة الدراسية» PDF كما تطبعها SWRCAPP."); return; }
    const by = deps.actorName(req);
    const scopeOf = (section: any) => {
      const college = (colleges as any[]).find(row => Number(row.AdCollegeId) === Number(section.AdCollegeId));
      return { collegeName: String(college?.AdCollegeName || ""), collegeCode: academicDigits(college?.AdCollegeCode).slice(0, 2), sectionName: String(section.AdSectionName || ""), departmentKey: authorityDepartmentCode(college?.AdCollegeCode, section.AdSectionCode) };
    };

    /** يطبّق الصحيفة على مسار القسم المختار (الرئيسي ومواقعه الفرعية): ردٌّ جاهز أو رفضٌ بلا أي كتابة. */
    const force = req.query.force === "1";
    const process = async (target: any): Promise<{ status: number; json: any; audit?: string }> => {
      const rejectWith = (kind: string, message: string, extra: Record<string, unknown> = {}) => ({ status: 422, json: { error: message, rejection: { kind, message, ...extra } } });
      const sectionId = Number(target.AdSectionId);
      const scope = scopeOf(target);
      const rejection = checkSheetScope(sheet, scope, { force: force && sectionId === Number(req.query.sectionId) });
      if (rejection) return { status: 422, json: { error: rejection.message, rejection } };
      /* القديمة تدخل «الصحيفة السابقة» وحدها: لا تسمّي القسم ولا تغيّر رمزه، وتصحّح اسم المقرر ووحداته وساعاته إلا مقرراً في صحيفة فعّالة (الكتالوج مشترك مع الجديدة). */
      const isNew = isNewSheet(sheet);
      const newPlanName = sheet.startYear ? `صحيفة ${sheet.startYear}/${sheet.startYear + 1}` : "الصحيفة الجديدة";
      const { key: ownKey, umbrella } = sheetOwnKey(sheet, scope);

      /* الصحيفةُ لمسارٍ كامل: بناتُ القسم (الرئيسي والجهراء والفحيحيل) صحيفةٌ واحدة، وللبنين مسارُهم. */
      const track = groupDeptTracks(sections as any[], colleges as any[]).find(item => [item.canonical, ...item.mirrors].some(row => Number(row.AdSectionId) === sectionId));
      const targets = (track ? [track.canonical, ...track.mirrors] : [target]).map(row => (sections as any[]).find(item => Number(item.AdSectionId) === Number(row.AdSectionId))).filter(Boolean) as any[];
      const livePlansOf = (id: number) => Repository.getCurriculumPlans(id).then(rows => rows.filter(item => !item.virtual && item.status !== "archived"));
      /* الثنائية الرئيسية (الجديدة/السابقة) بلا صحائف المسارات، فهي لا تُزيحها ولا تُحسب فيها. */
      const mainPlansOf = (id: number) => livePlansOf(id).then(rows => rows.filter(item => !item.track));
      /* برنامجٌ بتخصصٍ مزدوج (BA-012402…): صحيفةُ مسارٍ مستقلة داخل القسم، لها جديدتُها وسابقتُها. */
      const trackProgram = /^BA-\d{4}\d{2}$/.test(sheet.program) ? sheet.program : "";
      /* التدوير: صحيفةٌ أحدث من سنة الفعّالة تصير الفعّالة وتنتقل القائمة إلى «السابقة» (للقسم المعني وحده)؛ نفس السنة تحديث؛ أقدم تدخل «السابقة». */
      const planScopeOf = async (sid: number) => (await livePlansOf(sid)).filter(item => (trackProgram ? item.track === trackProgram : !item.track));
      const eraOf = async (sid: number): Promise<{ isNew: boolean; rollover: boolean }> => {
        if (!isNew) return { isNew: false, rollover: false };
        const active = (await planScopeOf(sid)).find(item => item.status === "active");
        const year = Number(active?.sheetYear) || 0;
        if (active && year && sheet.startYear > year) return { isNew: true, rollover: true };
        if (active && year && sheet.startYear < year) return { isNew: false, rollover: false };
        return { isNew: true, rollover: false };
      };
      for (const item of targets) {
        const era = await eraOf(Number(item.AdSectionId)), rows = await planScopeOf(Number(item.AdSectionId));
        if (era.rollover && rows.some(plan => plan.status === "transition")) { return rejectWith("previous", "للقسم صحيفة سابقة جارية. اضغط «انتهوا» لها ثم ارفع الصحيفة الأحدث."); }
        if (!era.isNew && !trackProgram && rows.length && !rows.some(plan => plan.status === "transition")) { return rejectWith("order", "لا صحيفة سابقة للقسم. ارفع القديمة قبل الجديدة."); }
      }
      const numberOf = (code: unknown) => Number(referenceCodeKey(code).slice(-3));
      /* القديمة تصحّح الاسم والوحدات والساعات كالجديدة، إلا مقرراً في صحيفة فعّالة: الجديدة هي المعتمدة ولا تُنقض بالقديمة. */
      const activeCache = new Map<number, Set<number>>();
      const activeIdsOf = async (sid: number) => {
        if (!activeCache.has(sid)) {
          const active = new Set((await Repository.getCurriculumPlans(sid)).filter(item => !item.virtual && item.status === "active").map(item => item.id));
          activeCache.set(sid, new Set((await Repository.getCurriculumPlanCourses(sid)).filter(link => active.has(link.planId)).map(link => Number(link.AdCourseId))));
        }
        return activeCache.get(sid)!;
      };
      const mayCorrect = async (row: AdCourse, newEra: boolean) => newEra || !(await activeIdsOf(Number(row.AdSectionId))).has(Number(row.AdCourseId));

      const applyTo = async (site: any) => {
        const cid = Number(site.AdCollegeId), sid = Number(site.AdSectionId);
        const era = await eraOf(sid), isNew = era.isNew;
        /* اسم القسم ورمزه من الصحيفة المعتمدة (ما كُتب يدوياً يُصحَّح إليها)، بعد قبول الكلية والقسم. */
        const renamedTo = isNew && !umbrella ? sheetSectionName(sheet, String(site.AdSectionName || "")) : "";
        const recodedTo = isNew && !umbrella ? sheetSectionCode(sheet, String(site.AdSectionCode || "")) : "";
        const renamed = renamedTo ? { before: String(site.AdSectionName || ""), after: renamedTo } : null;
        const recoded = recodedTo ? { before: String(site.AdSectionCode || ""), after: recodedTo } : null;
        if (renamed || recoded) await Repository.updateSection(sid, cid, recoded?.after ?? String(site.AdSectionCode || ""), renamed?.after ?? String(site.AdSectionName || ""));
        const branch = collegeBranchRoot(colleges as any[], cid);
        const inBranch = ownCourses(sheet, ownKey).filter(course => !(course.girlsOnly && branch && branchAudience(branch) !== "girls"));
        const { names, fixes } = correctedNames(inBranch);
        /* مقرراتُ الأقسام الأخرى في المجموعات الاختيارية (الثقافة العامة وغيرها): الموجودُ منها في كتالوج الموقع يدخل المجموعة مقرراً خارجياً مقفولاً للقراءة،
           وغير الموجود (قسمٌ خدمي بلا صحيفة) لا يُنشأ هنا ويُحصى وحداتٍ معلّقةً تُنبَّه ولا تمنع. الكتابة في قسمٍ آخر لا تحدث. */
        const electiveIds = new Set(sheet.groups.filter(group => group.kind === "elective").map(group => group.id));
        const ownKeysAll = new Set(ownCourses(sheet, ownKey).map(course => course.codeKey));
        const foreignElectives = sheet.courses.filter(course => electiveIds.has(course.groupId) && !ownKeysAll.has(course.codeKey) && !(course.girlsOnly && branch && branchAudience(branch) !== "girls"));
        const { reference, notes } = sheetToReference(sheet, inBranch, names, foreignElectives);
        const report = { updated: 0, created: 0, linked: 0, unchanged: 0, rules: 0, groups: 0, unlinked: 0, prereqPrinted: 0, prereqLinked: 0 };
        let unresolved: string[] = [];

        /* الجديدة تدخل الصحيفة الفعّالة (وتُنشأ إن لم توجد قبل أي تعديلٍ ليحفظ «السابقةُ» الكتالوجَ كما كان)،
           والقديمة تدخل «الصحيفة السابقة». لا تختلط إحداهما بالأخرى. */
        const wanted = (rows: Awaited<ReturnType<typeof livePlansOf>>) => rows.find(item => item.status === (isNew ? "active" : "transition"));
        let plan: Awaited<ReturnType<typeof livePlansOf>>[number] | undefined, planCreated = false;
        if (trackProgram) {
          /* المسار: صحيفتاه (جديدة وسابقة) تُنشآن معاً فارغتين، وتمتلئ إحداهما بمقررات الصحيفة المرفوعة. */
          const label = sheet.programName || trackProgram;
          const mine = (await livePlansOf(sid)).filter(item => item.track === trackProgram);
          const ensure = async (status: "active" | "transition") => mine.find(item => item.status === status)
            || await Repository.createTrackPlan({ collegeId: cid, sectionId: sid, name: `${label} · ${status === "active" ? "الجديدة" : "السابقة"}`, track: trackProgram, status, by });
          const wantedStatus = isNew ? "active" : "transition";
          if (era.rollover) {
            const previousActive = mine.find(item => item.status === "active");
            if (previousActive) await Repository.patchCurriculumPlan(previousActive.id, sid, { status: "transition" });
            plan = await Repository.createTrackPlan({ collegeId: cid, sectionId: sid, name: `${label} · الجديدة ${sheet.startYear}`, track: trackProgram, status: "active", by });
            planCreated = true;
          } else {
            planCreated = !mine.some(item => item.status === wantedStatus);
            plan = await ensure(wantedStatus);
            await ensure(isNew ? "transition" : "active");
          }
        } else {
          plan = era.rollover ? undefined : wanted(await mainPlansOf(sid));
          if (!plan) {
            await Repository.createCurriculumPlan({ collegeId: cid, sectionId: sid, name: isNew ? newPlanName : `الصحيفة الجديدة ${sheet.semesterLabel || sheet.startYear || ""}`.trim(), by });
            plan = wanted(await mainPlansOf(sid)); planCreated = true;
          }
        }
        if (!plan) throw new Error("تعذّر إنشاء صحيفة للقسم.");
        /* اسمٌ واحد لصحيفة السنة في كل المواقع («صحيفة 2026/2027») بدل أسماءٍ تختلف باختلاف مرحلة الرفع. */
        if (isNew && !trackProgram && sheet.startYear && plan.status === "active" && plan.name !== newPlanName) plan = { ...plan, ...(await Repository.patchCurriculumPlan(plan.id, sid, { name: newPlanName })) };
        if (sheet.startYear && (era.rollover || !plan.sheetYear)) plan = { ...plan, ...(await Repository.patchCurriculumPlan(plan.id, sid, { sheetYear: sheet.startYear })) };

        /* 1) المقررات: تصحيح الاسم/الوحدات/الساعات وإضافة الناقص؛ السعة كما هي. */
        let courses = await Repository.getCourses() as AdCourse[];
        for (const course of inBranch) {
          const matches = courses.filter(row => Number(row.AdSectionId) === sid && numberOf(row.CourseCode) === Number(course.number));
          if (matches.length > 1) { notes.push(`الرمز ${storedCode(course)} يطابق أكثر من مقرر في القسم: لم يُمسّ.`); continue; }
          const name = names.get(course.codeKey) || course.name;
          const row = matches[0];
          if (!row) {
            try { await Repository.createCourse(cid, sid, storedCode(course), name, course.units, course.hours, 0, false); report.created += 1; }
            catch (error) { if (error instanceof DuplicateResourceError) notes.push(`الرمز ${storedCode(course)} مستعمل في القسم؛ لم يُنشأ.`); else throw error; }
          } else if ((String(row.CourseName).normalize("NFKC").trim() !== name || Number(row.CourseCredit) !== course.units || Number(row.CourseHours) !== course.hours) && await mayCorrect(row, isNew)) {
            await Repository.updateCourse(row.AdCourseId, row.AdCollegeId, row.AdSectionId, row.CourseCode, name, course.units, course.hours, Number(row.MaxStudent) || 0);
            report.updated += 1;
          } else report.unchanged += 1;
        }

        /* 2) ربط مقررات القسم بالصحيفة. */
        courses = await Repository.getCourses() as AdCourse[];
        const sectionCodes = new Map((sections as any[]).map(row => [Number(row.AdSectionId), authorityDepartmentCode(colleges.find((c: any) => Number(c.AdCollegeId) === Number(row.AdCollegeId))?.AdCollegeCode, row.AdSectionCode)] as const));
        const keyOf = (row: AdCourse) => {
          const code = referenceCodeKey(row.CourseCode), dept = sectionCodes.get(Number(row.AdSectionId)) || "";
          return /^\d{1,3}$/.test(code) && /^\d{4}$/.test(dept) ? `${dept}${code.padStart(3, "0")}` : code;
        };
        const knownIdByCode = new Map<string, number>(), memberIdByCode = new Map<string, number>();
        for (const row of courses) if (Number(row.AdCollegeId) === cid) knownIdByCode.set(keyOf(row), Number(row.AdCourseId));
        const members = new Set<number>((await Repository.getCurriculumPlanCourses(sid)).filter(link => link.planId === plan!.id).map(link => Number(link.AdCourseId)));
        for (const course of inBranch) {
          const row = courses.find(item => Number(item.AdSectionId) === sid && numberOf(item.CourseCode) === Number(course.number));
          if (!row) continue;
          memberIdByCode.set(course.codeKey, Number(row.AdCourseId));
          if (!members.has(Number(row.AdCourseId))) { await Repository.addCourseToCurriculumPlan(plan.id, row, by); report.linked += 1; }
        }

        /* 3) مسوّدة القواعد: لا تُعتمد (يعتمدها القسم)، ولا تمحو ما كتبه. متطلباتُ الأقسام الأخرى تدخل مقفولةً للقراءة. */
        const externalIdByCode = new Map<string, number>();
        for (const group of reference.groups) for (const course of group.courses) for (const need of course.prerequisites) {
          const id = knownIdByCode.get(referenceCodeKey(need));
          if (id && !memberIdByCode.has(need)) externalIdByCode.set(need, id);
        }
        /* أعضاءُ المجموعات الاختيارية من أقسامٍ أخرى: الموجود في الكتالوج يدخل المجموعة مقرراً خارجياً. */
        const foreignMemberIdByCode = new Map<string, number>();
        for (const course of foreignElectives) {
          const id = knownIdByCode.get(course.codeKey);
          if (id) { foreignMemberIdByCode.set(course.codeKey, id); externalIdByCode.set(course.codeKey, id); }
        }
        const ruleScope = new Map<string, number>([...memberIdByCode, ...externalIdByCode]);
        const allIds = new Set<number>(ruleScope.values());
        const built = buildReferenceRules(reference, new Map([...memberIdByCode, ...foreignMemberIdByCode]), ruleScope.size ? new Map([...knownIdByCode, ...ruleScope]) : knownIdByCode, new Set());
        /* مجموعاتُ هذه الصحيفة تحمل سنتها في معرّفها (y2026-s1g2) فلا تلتبس بمجموعات صحيفةٍ أخرى للقسم نفسه. */
        const stamp = (id: string) => `y${sheet.startYear || 0}-${id.replace(/^new-/, "")}`;
        /* وحداتٌ عدّتها الصحيفة للمجموعة ولا يقابلها في النظام شيء (مقررٌ غير موجود، أو وحداتُه في الكتالوج أقل مما طُبع): النقص بقدرها تنبيهٌ لا مانع. */
        const creditOf = new Map(courses.map(row => [Number(row.AdCourseId), Number(row.CourseCredit) || 0] as const));
        const offeredBy = new Map<string, number>(reference.groups.map(group => [`${reference.id}-${group.id}`, group.courses.reduce((sum, course) => sum + (Number(course.credit) || 0), 0)] as [string, number]));
        for (const group of built.groups) {
          const present = group.courseIds.filter(id => allIds.has(id)).reduce((sum, id) => sum + (creditOf.get(id) || 0), 0);
          const pending = Math.max(0, (offeredBy.get(group.id) || 0) - present);
          group.id = stamp(group.id);
          if (pending) group.pendingUnits = pending;
        }
        const live = await Repository.getRuleSet(plan.id);
        const externalIds = [...externalIdByCode.values()];
        await Repository.updateRuleDraft(plan.id, current => {
          const base: CurriculumRuleSet = current ? { ...current } : { id: plan!.id, planId: plan!.id, AdCollegeId: cid, AdSectionId: sid, rules: live?.rules || [], groups: live?.groups || [], externals: live?.externals, version: live?.version || 0, status: "review", basedOnVersion: live?.version || 0, updatedAt: "", updatedBy: by };
          const hasRule = new Set(base.rules.map(rule => rule.courseId));
          /* ما كتبه الرفع وحده (لم يعدّله القسم بعد) يُكمَّل بما صار ممكناً ربطه من مسبقات (مقرر قسمٍ آخر وُجد بعد الرفع الأول)؛
             وما عدّله القسم يُملأ فيه الفارغ فقط، فلا يُعاد مسبقٌ حذفه القسم. */
          const fresh = new Map(built.rules.map(rule => [rule.courseId, rule] as const));
          const untouched = String(base.updatedBy || "").startsWith("رفع الصحيفة");
          const filled = base.rules.map(rule => {
            const next = fresh.get(rule.courseId);
            if (!next?.prereq?.all?.length) return rule;
            const has = rule.prereq?.all || [];
            if (!has.length && !rule.prereq?.anyOf?.length) return { ...rule, prereq: next.prereq };
            const missing = next.prereq.all.filter(id => !has.includes(id));
            return untouched && missing.length ? { ...rule, prereq: { all: [...has, ...missing], anyOf: rule.prereq?.anyOf || [] } } : rule;
          });
          const rules = normalizeRules([...filled, ...built.rules.filter(rule => !hasRule.has(rule.courseId))]);
          const fromSheet = built.groups.map(group => normalizeGroup({ ...group, courseIds: group.courseIds.filter(id => allIds.has(id)) })).filter(Boolean) as ElectiveGroup[];
          const yearOf = (group: ElectiveGroup) => Number(/^y(\d+)-/.exec(group.id)?.[1]) || 0;
          const newestHeld = Math.max(0, ...base.groups.map(yearOf));
          /* ما كتبه الرفع وحده: مجموعاتُ أحدث صحيفةٍ تحلّ محلّ ما قبلها (صحائفُ القسم المتعددة لا تتراكم مجموعاتُها فيقع المقرر في اثنتين)؛
             وصحيفةٌ أقدم من المحفوظ لا تمسّ المجموعات. ما عدّله القسم يبقى وتُضاف إليه المجموعات الجديدة دون تكرار مقرر. */
          const groups = dedupeGroups(untouched
            ? (Number(sheet.startYear) || 0) >= newestHeld ? fromSheet : base.groups
            : [...base.groups, ...fromSheet.filter(group => !base.groups.some(held => held.id === group.id))]);
          const externals = [...new Set([...(base.externals || []), ...externalIds])].sort((a, b) => a - b);
          return { ...base, rules: withDerivedGroups(rules, groups), groups, externals, status: "review", updatedAt: new Date().toISOString(), updatedBy: `رفع الصحيفة · ${by}` };
        });
        report.rules = built.rules.length; report.groups = built.groups.length;
        /* مسبقاتٌ مطبوعة لمقرراتٍ ليست في كتالوج الموقع بعد (قسمٌ لم تُرفع صحيفته): تُربط عند الرفع التالي. */
        report.unlinked = built.notes.filter(note => /غير موجود في كتالوج/.test(note)).length;
        /* رموزُ المسبقات التي لا مقرر لها في كتالوج الموقع (قسمٌ خدمي أو قسمٌ لم تُرفع صحيفته، أو رمزُ قسمه خطأ): للتقرير. */
        const missing = new Set<string>();
        for (const group of reference.groups) for (const course of group.courses) for (const code of [...course.prerequisites, ...(course.anyOf || []).flat()]) if (!knownIdByCode.has(referenceCodeKey(code))) missing.add(code);
        unresolved = [...missing].sort();
        /* مسبقات مطبوعة ↔ مربوطة بالقواعد (للمسؤول وحده): الفرق نصائحُ PEN ومسبقاتُ مقرراتٍ لم تُرفع صحائف أقسامها. */
        report.prereqPrinted = reference.groups.flatMap(group => group.courses).reduce((sum, course) => sum + course.prerequisites.length + (course.anyOf?.length || 0), 0);
        report.prereqLinked = built.rules.reduce((sum, rule) => sum + (rule.prereq?.all?.length || 0) + (rule.prereq?.anyOf?.length || 0), 0);
        return { sectionId: sid, plan, planCreated, rollover: era.rollover, report, renamed, recoded, fixes, notes, unresolved };
      };

      /* ما في الصحيفة من مقررات أقسامٍ أخرى (خدمية وغيرها): الناقص منها يُضاف إلى قسمه برقمه واسمه من الصحيفة
         (كل مواقعه: رئيسي وجهراء وفحيحيل وبنين)، والقائم لا يُمسّ. قسمٌ لا وجود له في النظام يُذكر برمزه في التقرير. */
      const addOtherDepartments = async () => {
        /* معطَّل مؤقتاً: كان يُضيف مقررات الأقسام الأخرى إلى كل قسمٍ يطابق رمزُه رمزَ القسم المطبوع، فوقعت مقرراتُ «أصول التربية»
           (رمز 20) في وحدة الكهرباء لأن رمزها في النظام كان 20. لا كتابة هنا حتى تُؤكَّد رموز الأقسام الخدمية من المسؤول. */
        const ownKeys = new Set(ownCourses(sheet, ownKey).map(course => course.codeKey));
        const others = sheet.courses.filter(course => !ownKeys.has(course.codeKey));
        const authorityOf = (row: any) => authorityDepartmentCode((colleges as any[]).find(c => Number(c.AdCollegeId) === Number(row.AdCollegeId))?.AdCollegeCode, row.AdSectionCode);
        const noDepartment = new Map<string, number>(), notAdded = new Map<string, number>();
        for (const course of others) {
          const key = `${course.college}${course.dept}`;
          const bucket = (sections as any[]).some(row => authorityOf(row) === key) ? notAdded : noDepartment;
          bucket.set(key, (bucket.get(key) || 0) + 1);
        }
        const list = (map: Map<string, number>) => [...map].map(([code, count]) => `${code}×${count}`).sort();
        return { added: 0, differs: [] as string[], noDepartment: list(noDepartment), notAdded: list(notAdded) };
      };

      const results = [];
      let others = { added: 0, differs: [] as string[], noDepartment: [] as string[], notAdded: [] as string[] };
      try { others = await addOtherDepartments(); for (const site of targets) results.push(await applyTo(site)); }
      catch (error) { return { status: 500, json: { error: error instanceof Error ? error.message : "تعذّر تطبيق الصحيفة." } }; }
      const first = results[0], total = (key: keyof typeof first.report) => results.reduce((sum, item) => sum + item.report[key], 0);
      const report = { updated: total("updated"), created: total("created"), linked: total("linked"), unchanged: total("unchanged"), rules: total("rules"), groups: total("groups"), unlinked: total("unlinked"), prereqPrinted: total("prereqPrinted"), prereqLinked: total("prereqLinked") };
      const fixes = first.fixes;
      return { status: 200, audit:  `رفع الخطة الدراسية ${sheet.program} لقسم ${String(target.AdSectionName || "").trim()} (${countOf(results.length, AR.site)}): ${countOf(report.created, AR.course)} جديدة، ${countOf(report.updated, AR.course)} مصحَّحة، ${countOf(others.added, AR.course)} مضافة من أقسام أخرى، تصحيح ${fixes.length} من الأسماء${first.renamed ? `، تسمية القسم «${first.renamed.before}» ← «${first.renamed.after}»` : ""}${first.recoded ? `، رمز القسم ${first.recoded.before || "—"} ← ${first.recoded.after}` : ""}`, json: { ok: true, era: isNew ? "new" : "old", sites: results.length, sectionId: first.sectionId, sectionName: first.renamed?.after || String(target.AdSectionName || ""), unresolved: [...new Set(results.flatMap(item => item.unresolved))].sort(), renames: results.filter(item => item.renamed || item.recoded).map(item => ({ sectionId: item.sectionId, renamed: item.renamed, recoded: item.recoded })), renamed: first.renamed, recoded: first.recoded, program: sheet.program, planId: first.plan.id, planName: first.plan.name, planCreated: first.planCreated, rollover: results.some(item => item.rollover), ...report, otherDepartments: sheet.courses.length - ownCourses(sheet, ownKey).length, addedOther: others.added, differsOther: others.differs, noDepartment: others.noDepartment, foreignNotAdded: others.notAdded, nameFixes: fixes, notes: first.notes.slice(0, 30) } };
    };

    if (sectionId) {
      const target = (sections as any[]).find(row => Number(row.AdSectionId) === sectionId);
      if (!target) { fail(res, 404, "اختر القسم أولاً."); return; }
      const out = await process(target);
      if (out.audit) res.locals.auditChanges = out.audit;
      res.status(out.status).json(out.json);
      return;
    }

    /* بلا قسمٍ مختار: تُوجَّه الصحيفة إلى الأقسام التي يطابق اسمُها قسمَ الصحيفة (أو يخصّها رمزها في صحائف القسم الإداري). */
    const matchIn = (list: any[]) => groupDeptTracks(list, colleges as any[]).map(item => item.canonical as any).filter(section => {
      const scope = scopeOf(section);
      /* الاسم، أو رمز الهيئة الكامل (كلية+قسم) المطابق لرمز الصحيفة: «معلم الحاسب» و«حاسوب» برمزٍ واحد هو القسم نفسه. */
      const sameAuthorityCode = /^\d{4}$/.test(scope.departmentKey) && scope.departmentKey === sheetKey(sheet);
      return checkSheetScope(sheet, scope) === null && (sheetNameMatches(sheet, scope.sectionName) || sameAuthorityCode || sheetOwnKey(sheet, scope).umbrella);
    });
    let matched = matchIn(sections as any[]);
    /* قسمٌ للصحيفة لا وجود له: يُنشأ بموافقة المسؤول وفي كلية يختارها (createMissing=1&collegeId=N)، باسمه ورمزه من الصحيفة.
       وإن لم توجد كليتها أصلاً: createCollege=1 تُنشئها (اسمها من الصحيفة ورمزها من رقم مقرراتها) ثم القسم فيها.
       لا يُنشأ لقسمٍ إداري (علم النفس/علم التربية) ولا حيث للقسم نفسه صحيفةٌ برمزٍ مطابق. */
    const createdSections: Array<{ name: string; college: string; accounts: SectionAccountResult[]; accountsError?: string }> = [];
    const createdColleges: Array<{ name: string; code: string; accounts: SectionAccountResult[]; accountsError?: string }> = [];
    const missingKey = sheetKey(sheet), missingName = sheetSectionName(sheet, "قسم م");
    const collegeDigits = missingKey.slice(0, 2);
    const matchingColleges = () => (colleges as any[]).filter(college => academicDigits(college.AdCollegeCode).slice(0, 2) === collegeDigits);
    const wantsCreate = req.query.createMissing === "1" || req.query.createCollege === "1";
    if (wantsCreate && (!matched.length || Number(req.query.collegeId || 0)) && /^\d{4}$/.test(missingKey) && missingName && ownCourses(sheet, missingKey).length) {
      let targets = matchingColleges();
      const onlyCollege = Number(req.query.collegeId || 0);
      /* لا إنشاء «للجميع»: الكلية تُختار صراحةً لكل قسم. */
      targets = onlyCollege ? targets.filter(college => Number(college.AdCollegeId) === onlyCollege) : [];
      if (!targets.length && req.query.createCollege === "1" && !matchingColleges().length && String(sheet.college || "").trim()) {
        const college = await Repository.createCollege(collegeDigits, String(sheet.college).trim());
        let accounts: SectionAccountResult[] = [], accountsError: string | undefined;
        try { accounts = await provisionCollegeUsers(Repository, college); } catch (error: any) { accountsError = String(error?.message || error); console.error("[sheet-import] college accounts:", error?.stack || error); }
        createdColleges.push({ name: String(college.AdCollegeName), code: collegeDigits, accounts, accountsError });
        targets = [college];
      }
      for (const college of targets) {
        if ((sections as any[]).some(row => Number(row.AdCollegeId) === Number(college.AdCollegeId) && authorityDepartmentCode(college.AdCollegeCode, row.AdSectionCode) === missingKey)) continue;
        const created = await Repository.createSection(Number(college.AdCollegeId), missingKey.slice(2), missingName);
        /* القسم الجديد يولد بحساباته (رئيس قسم · رئيس جدول · مرشد)؛ وتعثّر الحسابات لا يُسقط القسم ولا الرفع، بل يُسجَّل سببُه في التقرير. */
        let accounts: SectionAccountResult[] = [], accountsError: string | undefined;
        try { accounts = await provisionSectionUsers(Repository, college, created); } catch (error: any) { accountsError = String(error?.message || error); console.error("[sheet-import] section accounts:", error?.stack || error); }
        createdSections.push({ name: missingName, college: String(college.AdCollegeName || ""), accounts, accountsError });
      }
      /* ما أُنشئ لا يظهر في ما قُرئ أول الطلب (Firestore يُرجع نسخاً): تُعاد قراءة الكليات والأقسام فيراها كل ما بعدها. */
      if (createdSections.length || createdColleges.length) { [sections, colleges] = await Promise.all([Repository.getSections(), Repository.getColleges()]); matched = matchIn(sections as any[]); }
    }
    if (!matched.length) { reject("department", `لم أجد في النظام قسماً باسم «${String(sheet.department || "").replace(/^قسم\s+/, "")}». اختر القسم يدوياً.`, { missing: !createdSections.length && /^\d{4}$/.test(missingKey) && Boolean(missingName), departmentName: String(sheet.department || ""), code: missingKey.slice(2), sheetCollege: String(sheet.college || ""), collegeCode: collegeDigits, colleges: matchingColleges().map(college => ({ id: Number(college.AdCollegeId), name: String(college.AdCollegeName || "") })) }); return; }
    const outs: Array<{ status: number; json: any; audit?: string }> = [];
    for (const section of matched) outs.push(await process(section));
    const done = outs.filter(item => item.status === 200);
    if (!done.length) { res.status(outs[0].status).json(outs[0].json); return; }
    res.locals.auditChanges = [...createdColleges.map(row => `إنشاء كلية «${row.name}» برمز ${row.code}`), ...createdSections.map(row => `إنشاء قسم «${row.name}» في ${row.college}`), ...done.map(item => item.audit)].filter(Boolean).join(" | ");
    res.json({ ok: true, auto: true, createdSections, createdColleges, tracks: done.length, sites: done.reduce((sum, item) => sum + Number(item.json.sites || 0), 0), era: done[0].json.era, program: sheet.program, planName: done[0].json.planName, sectionId: done[0].json.sectionId, planId: done[0].json.planId, created: done.reduce((sum, item) => sum + Number(item.json.created || 0), 0), updated: done.reduce((sum, item) => sum + Number(item.json.updated || 0), 0), linked: done.reduce((sum, item) => sum + Number(item.json.linked || 0), 0), prereqPrinted: done.reduce((sum, item) => sum + Number(item.json.prereqPrinted || 0), 0), prereqLinked: done.reduce((sum, item) => sum + Number(item.json.prereqLinked || 0), 0), skipped: outs.length - done.length, sections: done.map(item => item.json.sectionName), renames: done.flatMap(item => item.json.renames || []), nameFixes: done.reduce((sum, item) => sum + (item.json.nameFixes?.length || 0), 0), otherDepartments: done[0].json.otherDepartments, addedOther: done.reduce((sum, item) => sum + Number(item.json.addedOther || 0), 0), foreignNotAdded: [...new Set(done.flatMap(item => item.json.foreignNotAdded || []))].sort(), differsOther: [...new Set(done.flatMap(item => item.json.differsOther || []))].sort(), noDepartment: [...new Set(done.flatMap(item => item.json.noDepartment || []))].sort(), programName: sheet.programName, unresolved: [...new Set(done.flatMap(item => item.json.unresolved || []))].sort() });
  });

  /* ── إنهاء الصحيفة السابقة لأقسامٍ يختارها المسؤول ─────────────────────────────────────────────
     «انتهوا»: تُؤرشف صحيفتها السابقة (وصحائف مساراتها) فلا يظهر لها في الجدول إلا مقررات الجديدة،
     وتبقى القديمة محفوظةً للفصول السابقة، ويُرجَع عن ذلك بزر «أعد السابقة». لا يُنهى إلا قسمٌ لجديدته صحيفةٌ فعّالة. */
  const ENDED_BY = "إنهاء الصحيفة السابقة";
  const sitesOfTrack = async (sectionId: number) => {
    const [sections, colleges] = await Promise.all([Repository.getSections(), Repository.getColleges()]);
    const track = groupDeptTracks(sections as any[], colleges as any[]).find(item => [item.canonical, ...item.mirrors].some(row => Number(row.AdSectionId) === sectionId));
    return track ? [track.canonical, ...track.mirrors].map(row => Number(row.AdSectionId)) : [sectionId];
  };
  const previousStateOf = async (sites: number[]) => {
    let running = false, ended = false, hasNew = false;
    for (const sid of sites) {
      const plans = (await Repository.getCurriculumPlans(sid)).filter(item => !item.virtual);
      const filled = new Set(((await Repository.getCurriculumPlanCourses(sid)) as any[]).map(link => String(link.planId)));
      /* «الجديدة» التي لا مقرر فيها (لم تُرفع صحيفتها بعد) لا تحلّ محلّ السابقة: إنهاؤها يُخفي مقررات القسم كلها. */
      if (plans.some(item => item.status === "active" && filled.has(String(item.id)))) hasNew = true;
      if (plans.some(item => item.status === "transition")) running = true;
      else if (plans.some(item => item.status === "archived" && String(item.archivedBy || "").startsWith(ENDED_BY))) ended = true;
    }
    return { state: running ? "running" : ended ? "ended" : "none", hasNew } as const;
  };

  app.get("/api/plan-review/previous-plans", deps.requireAuth, async (req: Request, res: Response) => {
    if (!deps.isRootAdmin(req)) { fail(res, 403, "للحساب الرئيسي وحده."); return; }
    res.setHeader("Cache-Control", "no-store");
    const [sections, colleges] = await Promise.all([Repository.getSections(), Repository.getColleges()]);
    const tracks = groupDeptTracks(sections as any[], colleges as any[]), names = trackLabels(tracks);
    const rows = [];
    for (const item of tracks) {
      const sites = [item.canonical, ...item.mirrors].map(row => Number(row.AdSectionId));
      const { state, hasNew } = await previousStateOf(sites);
      rows.push({ sectionId: sites[0], label: names.get(item.key) || item.deptName, state, hasNew });
    }
    res.json({ rows });
  });

  app.post("/api/plan-review/previous-plans", deps.requireAuth, express.json(), async (req: Request, res: Response) => {
    if (!deps.isRootAdmin(req)) { fail(res, 403, "للحساب الرئيسي وحده."); return; }
    const action = req.body?.action === "restore" ? "restore" : "end";
    const ids = [...new Set((Array.isArray(req.body?.sectionIds) ? req.body.sectionIds : []).map(Number).filter((id: number) => id > 0))].slice(0, 400) as number[];
    if (!ids.length) { fail(res, 400, "اختر قسماً."); return; }
    const by = deps.actorName(req);
    let changed = 0;
    const skipped: number[] = [];
    for (const id of ids) {
      let touched = 0;
      for (const sid of await sitesOfTrack(id)) {
        const plans = (await Repository.getCurriculumPlans(sid)).filter(item => !item.virtual);
        const filled = new Set(((await Repository.getCurriculumPlanCourses(sid)) as any[]).map(link => String(link.planId)));
        if (action === "end") {
          for (const plan of plans.filter(item => item.status === "transition")) {
            /* لا تُنهى السابقة إلا إن كانت لمسارها «جديدة» فعّالة فيها مقررات. */
            if (!plans.some(item => item.status === "active" && (item.track || "") === (plan.track || "") && filled.has(String(item.id)))) continue;
            await Repository.archiveCurriculumPlan(plan.id, sid, `${ENDED_BY} · ${by}`); touched += 1;
          }
        } else {
          for (const plan of plans.filter(item => item.status === "archived" && String(item.archivedBy || "").startsWith(ENDED_BY))) { await Repository.restoreCurriculumPlan(plan.id, sid); touched += 1; }
        }
      }
      if (touched) changed += 1; else skipped.push(id);
    }
    res.locals.auditChanges = `${action === "end" ? "إنهاء" : "إعادة"} الصحيفة السابقة: ${countOf(changed, AR.department)}`;
    res.json({ ok: true, action, changed, skipped });
  });

  /* ما يحتاجه منتقي المقررات في الجدول: هل أُنهيت السابقة لقسمٍ، وما مقرراته التشغيلية (الجديدة). */
  app.get("/api/plan-review/previous-ended", deps.requireAuth, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const sectionId = Number(req.query.sectionId) || 0;
    if (!sectionId) { res.json({ ended: false, courseIds: [] }); return; }
    const { state } = await previousStateOf(await sitesOfTrack(sectionId));
    if (state !== "ended") { res.json({ ended: false, courseIds: [] }); return; }
    res.json({ ended: true, courseIds: [...await Repository.getOperationalCourseIds(sectionId)] });
  });

  /* ── استيراد الصحائف: إدارةُ النظام وحدها، ويُنشئ مسوّداتٍ لا يعتمد شيئاً ────── */
  app.post("/api/plan-review/import", deps.requireAuth, async (req: Request, res: Response) => {
    if (!deps.isRootAdmin(req)) { fail(res, 403, "استيراد قواعد الصحائف مخصص لحساب الإدارة الرئيسي."); return; }
    const rows = (Array.isArray(req.body?.rows) ? req.body.rows : []).slice(0, 20000) as RuleImportRow[];
    if (!rows.length) { fail(res, 400, "لا أسطر."); return; }
    const [sections, courses] = await Promise.all([Repository.getSections(), Repository.getCourses()]);
    const plans: ImportPlan[] = [];
    for (const section of sections as any[]) {
      const sid = Number(section.AdSectionId);
      const [sectionPlans, links] = await Promise.all([Repository.getCurriculumPlans(sid), Repository.getCurriculumPlanCourses(sid)]);
      for (const plan of sectionPlans.filter(row => row.status !== "archived")) {
        plans.push({ id: plan.id, sectionId: sid, sectionName: String(section.AdSectionName || ""), sectionCode: String(section.AdSectionCode || ""), name: plan.name, courseIds: links.filter(link => link.planId === plan.id).map(link => Number(link.AdCourseId)) });
      }
    }
    const { drafts, diagnostics } = rowsToDrafts(rows, plans, (courses as AdCourse[]).map(course => ({ id: Number(course.AdCourseId), code: String(course.CourseCode || "") })));
    const replace = req.body?.replace === true;
    let created = 0; const skipped: string[] = [];
    for (const imported of drafts) {
      const plan = plans.find(row => row.id === imported.planId)!;
      const section = (sections as any[]).find(row => Number(row.AdSectionId) === imported.sectionId);
      const existing = await Repository.getRuleDraft(imported.planId);
      if (existing?.status === "review" && !replace) { skipped.push(plan.name); continue; }
      const live = await Repository.getRuleSet(imported.planId);
      await Repository.updateRuleDraft(imported.planId, () => ({
        id: imported.planId, planId: imported.planId, AdCollegeId: Number(section?.AdCollegeId || 0), AdSectionId: imported.sectionId,
        rules: imported.rules, groups: imported.groups, version: live?.version || 0, status: "review", basedOnVersion: live?.version || 0,
        updatedAt: new Date().toISOString(), updatedBy: `استيراد · ${deps.actorName(req)}`,
      }));
      created += 1;
    }
    res.locals.auditChanges = `استيراد قواعد صحائف: ${countOf(created, AR.draft)}`;
    res.json({ created, skipped, diagnostics: diagnostics.slice(0, 300), diagnosticsTotal: diagnostics.length });
  });
}
