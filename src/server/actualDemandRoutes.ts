/**
 * ── مسارات الطلب الفعلي (src/server/actualDemand.ts) ──────────────────────────
 *
 *   GET  /api/actual-demand?collegeId=&sectionId=&termId=       ما حُفظ لعائلة القسم في الفصل، والتنبيه الأحمر.
 *   POST /api/actual-demand/upload?…&variant=&commit=&confirm=  PDF التسجيل: قراءةٌ بلا حفظ، ثم الحفظ بعد التأكيد.
 *   POST /api/actual-demand/link                                ربطُ مقررٍ لم يُطابَق (أو تجاهله)، يُحفظ للعائلة.
 *
 * الصلاحية صلاحية تعديل الجدول نفسها (الشاشة ٧) وفي قسمٍ يملكه الكاتب؛ وكل كتابةٍ في سجلّ التدقيق.
 * قسمٌ أو فصلٌ في الملف غير المفتوح لا يُحفظ إلا بتأكيدٍ صريح (confirm=1).
 */
import express, { type Express, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { Repository } from "../db/repository";
import { type AuthenticatedRequest, requireAnyPermission, requirePermission } from "./core/auth";
import { isScopeAllowed } from "./core/scope";
import { AR, countOf } from "../utils/arabicCount";
import { DemandReportError, DEMAND_VARIANT_LABEL, type DemandVariant } from "../utils/actualDemand";
import { teachingRoomFor } from "./sectionPlanRoom";
import {
  DEMAND_PDF_MAX_BYTES, demandContext, demandPreview, demandReading, planHistoryFor, extractDemandItems, fileHash, isPdf, parseDemandReport, saveDemandLink, storeDemandVariant,
} from "./actualDemand";

const id = (value: unknown) => { const text = String(value ?? "").trim(); return /^\d{1,10}$/.test(text) ? Number(text) : 0; };
const variantOf = (value: unknown): DemandVariant | null => value === "general" || value === "graduates" ? value : null;
const who = (req: AuthenticatedRequest) => String(req.user?.Name || req.user?.SystemUserLogin || "").slice(0, 80);

/** القراءة كاملةً: التقرير والتخطيط ومعه ما بقي في أنصبة العائلة (للمنتدبين). تعذّرُ الأنصبة لا يُسقط التخطيط. */
async function readingFor(req: AuthenticatedRequest, collegeId: number, sectionId: number, termId: number) {
  const context = await demandContext(req, collegeId, sectionId, termId);
  const hasReport = Boolean(context.stored?.variants?.general || context.stored?.variants?.graduates);
  const [room, history] = hasReport ? await Promise.all([
    teachingRoomFor(collegeId, sectionId, termId, context.rows).catch(() => null),
    planHistoryFor(context, termId).catch(() => null),
  ]) : [null, null];
  return demandReading(context, room, history);
}

export function registerActualDemandRoutes(app: Express): void {
  const uploadLimit = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: "ملفاتٌ كثيرة في وقتٍ قصير. انتظر قليلاً ثم أعد الرفع." } });

  const scopeOf = (req: AuthenticatedRequest, res: Response, source: any) => {
    const collegeId = id(source.collegeId), sectionId = id(source.sectionId), termId = id(source.termId);
    if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "حدد الكلية والقسم والفصل." }); return null; }
    if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return null; }
    return { collegeId, sectionId, termId };
  };

  app.get("/api/actual-demand", requireAnyPermission([7, 14]), async (req: AuthenticatedRequest, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const scope = scopeOf(req, res, req.query);
    if (!scope) return;
    res.json(await readingFor(req, scope.collegeId, scope.sectionId, scope.termId));
  });

  app.post("/api/actual-demand/upload", uploadLimit, requirePermission(7), express.raw({ type: "application/octet-stream", limit: DEMAND_PDF_MAX_BYTES + 4096 }), async (req: AuthenticatedRequest, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const scope = scopeOf(req, res, req.query);
    if (!scope) return;
    const variant = variantOf(req.query.variant);
    if (!variant) { res.status(400).json({ error: "اختر نوع التقرير: عام أو خريجون." }); return; }
    if (!isPdf(req.body)) { res.status(422).json({ error: "الملف ليس PDF." }); return; }
    let report;
    try { report = parseDemandReport(await extractDemandItems(req.body)); }
    catch (error) { res.status(422).json({ error: error instanceof DemandReportError ? error.message : "تعذّرت قراءة الملف." }); return; }
    const hash = fileHash(req.body);
    const [context, terms] = await Promise.all([demandContext(req, scope.collegeId, scope.sectionId, scope.termId), Repository.getTerms()]);
    const termName = String((terms as any[]).find(term => Number(term.AdTermId) === scope.termId)?.AdTermName || "");
    const preview = demandPreview(report, context, termName, hash, variant);
    if (String(req.query.commit || "") !== "1") { res.json({ preview }); return; }
    if ((preview.termMatches === false || !preview.departmentMatches || preview.kindClue) && String(req.query.confirm || "") !== "1") {
      res.status(409).json({ error: preview.kindClue || "القسم أو الفصل في الملف غير المفتوح. أكّد الحفظ إن كان هذا مقصوداً.", preview });
      return;
    }
    await storeDemandVariant(scope.termId, context.family.key, variant, { report, uploadedAt: new Date().toISOString(), uploadedBy: who(req), hash });
    res.locals.auditEntity = "actual-demand";
    res.locals.auditEntityId = `${scope.termId}:${context.family.key}`;
    res.locals.auditChanges = `الطلب الفعلي (${DEMAND_VARIANT_LABEL[variant]}) · ${report.department || context.family.name} · ${report.termLabel} · ${countOf(report.courses.length, AR.course)} · بصمة ${hash.slice(0, 12)}`;
    res.json({ saved: true, reading: await readingFor(req, scope.collegeId, scope.sectionId, scope.termId) });
  });

  app.post("/api/actual-demand/link", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const body = req.body || {};
    const scope = scopeOf(req, res, body);
    if (!scope) return;
    const code = String(body.code || "").replace(/\D/g, "");
    if (!/^\d{6,7}$/.test(code)) { res.status(400).json({ error: "رقم المقرر غير صالح." }); return; }
    const context = await demandContext(req, scope.collegeId, scope.sectionId, scope.termId);
    if (body.ignore === true) {
      await saveDemandLink(context.family.key, code, { ignore: true, by: who(req), at: new Date().toISOString() });
      res.locals.auditChanges = `الطلب الفعلي · ${code} لا يخص القسم`;
    } else {
      const course = context.catalogue.find(row => Number(row.AdCourseId) === id(body.courseId));
      if (!course) { res.status(400).json({ error: "اختر مقرراً من مقررات القسم." }); return; }
      await saveDemandLink(context.family.key, code, { courseCode: String(course.CourseCode), by: who(req), at: new Date().toISOString() });
      res.locals.auditChanges = `الطلب الفعلي · ${code} ← ${course.CourseName}`;
    }
    res.locals.auditEntity = "actual-demand";
    res.locals.auditEntityId = context.family.key;
    res.json(await readingFor(req, scope.collegeId, scope.sectionId, scope.termId));
  });
}
