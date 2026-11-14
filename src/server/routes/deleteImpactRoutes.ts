/**
 * ── «لو حذفت؟»: خريطةُ ما يرتبط بالسجل قبل حذفه (قراءةٌ فقط) ─────────────────────
 *
 * مسارٌ واحد GET /api/delete-impact/:entity/:id بالصلاحية والنطاق نفسيهما لمسار الحذف المقابل:
 *   فصل ٥ · كلية ٢ + نطاق · قسم ٤ + نطاق · أستاذ ٣ · مقرر ٦ + نطاق + نافذة اللجنة ·
 *   مبنى/قاعة ٧ + الحساب الرئيسي · حساب ١١.
 * أعدادٌ وعقباتٌ فقط. والوضع التجريبي يقرأ صندوقه وحده (Repository يعزله).
 */
import type { Express, NextFunction, Response } from "express";
import { Repository } from "../../db/repository";
import { type AuthenticatedRequest, requirePermission, requireRootAdmin } from "../core/auth";
import { isScopeAllowed } from "../core/scope";
import { computeDeleteImpact } from "../deleteImpact";
import { isDeleteEntity, type DeleteEntity } from "../../utils/deleteImpact";
import { committeeCatalogEditAllowed } from "./coursesRoutes";

type Gate = (req: AuthenticatedRequest, res: Response, next: NextFunction) => unknown;

/** صلاحيةُ كلِّ نوعٍ كما في مسار حذفه (الرقمُ هو رقمُ الشاشة في requirePermission). */
const PERMISSION_OF: Record<DeleteEntity, number> = { term: 5, college: 2, section: 4, instructor: 3, course: 6, room: 7, building: 7, user: 11 };
const gates = new Map<DeleteEntity, Gate>(
  (Object.keys(PERMISSION_OF) as DeleteEntity[]).map(entity => [entity, requirePermission(PERMISSION_OF[entity]) as Gate]),
);

const chain = (steps: Gate[], req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const run = (index: number): unknown => index >= steps.length ? next() : steps[index](req, res, () => { void run(index + 1); });
  return run(0);
};

export function registerDeleteImpactRoutes(app: Express): void {
  app.get("/api/delete-impact/:entity/:id", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const entity = String(req.params.entity);
    if (!isDeleteEntity(entity)) { res.status(404).json({ error: "هذا النوع لا يُحذف من هنا" }); return; }
    const steps: Gate[] = [gates.get(entity)!];
    if (entity === "room" || entity === "building") steps.push(requireRootAdmin as Gate);
    chain(steps, req, res, next);
  }, async (req: AuthenticatedRequest, res: Response) => {
    const entity = String(req.params.entity) as DeleteEntity;
    const id = Number(req.params.id);
    /* النطاقُ كما في مسار الحذف المقابل، حرفاً بحرف. */
    if (entity === "college" && !req.user.IsAdminUser && !isScopeAllowed(req, id, 0)) {
      res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return;
    }
    if (entity === "section") {
      const section = await Repository.getSectionById(id);
      if (section && !isScopeAllowed(req, section.AdCollegeId, id) && !req.user.IsAdminUser) {
        res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return;
      }
    }
    if (entity === "course") {
      const course = await Repository.getCourseById(id);
      if (course && !isScopeAllowed(req, course.AdCollegeId, course.AdSectionId) && !req.user.IsAdminUser) {
        res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return;
      }
      if (course && !(await committeeCatalogEditAllowed(req, Number(course.AdSectionId)))) {
        res.status(409).json({ error: "تعديل بيانات القسم متاح أثناء مراجعة مسوّدة الصحيفة فقط؛ أكمل النواقص قبل اعتمادها." }); return;
      }
    }
    const impact = await computeDeleteImpact(entity, String(req.params.id), { actor: { id: Number(req.user?.SystemUserId), permissions: req.permissions || [] } });
    if (!impact) { res.status(404).json({ error: "السجل غير موجود" }); return; }
    res.setHeader("Cache-Control", "no-store");
    res.json(impact);
  });
}
