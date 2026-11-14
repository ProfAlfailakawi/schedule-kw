/**
 * ── «طلب حذف الحساب» من داخل التطبيق (App Store 5.1.1(v)) ────────────────────────
 *
 * ما يفعله الكود، لا أكثر:
 *  - صاحبُ الحساب المسجَّل دخولُه يؤكّد بكلمة سرّه، فيُسجَّل طلبٌ معلَّق (وثيقةٌ لكل حساب)
 *    وله موعدٌ أقصى بعد 30 يوماً، ويُكتب سطرُ تدقيق، ويُنبَّه مديرُ النظام (الجرس والتنبيه).
 *  - تُغلق كلُّ جلسات الحساب ويُمسح كوكيُّ هذا الجهاز.
 *  - **لا يُحذف الحسابُ آلياً.** مديرُ النظام يرى الطلبَ في الجرس وفي
 *    GET /api/admin/account-deletion-requests، وينفّذ الحذفَ من شاشة المستخدمين،
 *    ثم يُغلق الطلبَ بـ POST /api/admin/account-deletion-requests/:id/resolve.
 *  - البيئةُ التجريبية لا تُسجّل طلباً حقيقياً أبداً؛ وحسابُ الإدارة الرئيسي لا يطلب الحذف من هنا.
 *  - لا تُخزَّن كلمةُ السر ولا يُكتب منها شيءٌ في السجلّ.
 */
import type { Express, Request, RequestHandler, Response } from "express";
import { rateLimit } from "express-rate-limit";
import type { AuthenticatedRequest } from "./core/auth";

export const ACCOUNT_DELETION_DAYS = 30;
const DAY_MS = 86_400_000;

export const ACCOUNT_DELETION_NOTICE =
  `سجّلنا طلب حذف حسابك. يراجع مدير النظام الطلب وينفّذه خلال ${ACCOUNT_DELETION_DAYS} يوماً من تاريخه، وقد نحتفظ بما تقتضيه سجلات الجامعة وسجلات التدقيق. خرجتَ من الحساب على هذا الجهاز.`;

export type DeletionStatus = "pending" | "done";
export interface DeletionRequest {
  id: string;
  userId: number;
  login: string;
  name: string;
  role: string;
  status: DeletionStatus;
  requestedAt: string;
  dueBy: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolvedNote?: string;
}

type Update = (id: string, fn: (current: DeletionRequest | null) => { next: DeletionRequest; result: unknown } | { refuse: unknown }) => Promise<{ ok: boolean; result?: unknown }>;

export interface DeletionUser { SystemUserId: number; Name?: string; SystemUserLogin?: string; SystemUserPass?: string; Role?: string; IsActive?: boolean; IsLocked?: boolean; IsDeleted?: boolean }

export interface DeletionDeps {
  isDemo: () => boolean;
  rootAdminId: number;
  isPower: (req: AuthenticatedRequest) => boolean;
  getUser: (id: number) => Promise<DeletionUser | undefined>;
  verify: (password: string, stored: string) => boolean;
  updateDoc: Update;
  listDocs: () => Promise<DeletionRequest[]>;
  audit: (entry: { userId: number; name: string; action: string; changes: string; status: number; path: string }) => Promise<unknown>;
  endSessions: (userId: number, req: Request) => Promise<unknown>;
  notifyAdmins: (request: DeletionRequest) => Promise<unknown>;
  /** كوكي الجلسة يُمسح؛ يُمرَّر للاختبار بلا اعتمادٍ على بيئة الإنتاج. */
  secureCookie?: boolean;
  now?: () => number;
}

export const deletionDocId = (userId: number) => `u${Math.trunc(Number(userId))}`;

export function pendingDeletionNotifications(requests: DeletionRequest[], now = Date.now()) {
  return requests
    .filter(request => request.status === "pending")
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt))
    .slice(0, 50)
    .map(request => {
      const overdue = Date.parse(request.dueBy) < now;
      const due = request.dueBy.slice(0, 10);
      return {
        id: `account-deletion:${request.id}`,
        tone: overdue ? ("alert" as const) : ("action" as const),
        title: `طلب حذف حساب «${request.name}»`,
        detail: `${request.role} · ${request.login} — ${overdue ? "تجاوز موعدَه" : "الموعد الأقصى"} ${due}. نفّذه من «المستخدمون» ثم أغلق الطلب.`,
        at: request.requestedAt,
      };
    });
}

export function registerAccountDeletionRoutes(app: Express, deps: DeletionDeps): void {
  const clock = () => (deps.now ? deps.now() : Date.now());
  const userKey = (req: Request) => `account-deletion:${Number((req as AuthenticatedRequest).user?.SystemUserId) || 0}`;
  /* كلمةُ السر تُجرَّب هنا، فالحدّ لكل حساب: ست محاولاتٍ في ربع ساعة. */
  const limiter = rateLimit({
    windowMs: 15 * 60_000, limit: 6, standardHeaders: true, legacyHeaders: false,
    keyGenerator: userKey, validate: false,
    message: { error: "محاولاتٌ كثيرة. جرّب بعد 15 دقيقة." },
  });
  const noStore: RequestHandler = (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); };

  app.post("/api/account/deletion-request", noStore, (req, res, next) => {
    /* الرفضُ المبكر قبل العدّاد: لا جلسةَ ولا تجريبيّ لا يستهلكان شيئاً. */
    const user = (req as AuthenticatedRequest).user;
    if (!user) { res.status(401).json({ error: "سجّل الدخول أولاً." }); return; }
    if (deps.isDemo()) { res.status(403).json({ error: "هذه بيئة تجريبية: لا تُسجَّل فيها طلباتُ حذفٍ حقيقية.", code: "demo" }); return; }
    next();
  }, limiter, async (req: Request, res: Response) => {
    const sessionUser = (req as AuthenticatedRequest).user as DeletionUser;
    const userId = Number(sessionUser.SystemUserId);
    if (userId === deps.rootAdminId) {
      res.status(403).json({ error: "حساب الإدارة الرئيسي لا يُحذف من هنا. تواصل مع الشركة المشغّلة.", code: "root" });
      return;
    }
    try {
      const user = await deps.getUser(userId);
      if (!user || user.IsDeleted) { res.status(404).json({ error: "الحساب غير موجود." }); return; }
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!password) { res.status(400).json({ error: "أدخل كلمة السر لتأكيد الطلب." }); return; }
      const label = String(user.Name || user.SystemUserLogin || "");
      if (!deps.verify(password, String(user.SystemUserPass || ""))) {
        await deps.audit({ userId, name: label, action: "account-deletion-refused", changes: "كلمة سرّ التأكيد غير صحيحة", status: 400, path: "/api/account/deletion-request" }).catch(() => undefined);
        res.status(400).json({ error: "كلمة السر غير صحيحة." });
        return;
      }
      const at = clock();
      const fresh: DeletionRequest = {
        id: `DEL-${at.toString(36)}-${userId}`, userId, login: String(user.SystemUserLogin || ""), name: label, role: String(user.Role || "standard"),
        status: "pending", requestedAt: new Date(at).toISOString(), dueBy: new Date(at + ACCOUNT_DELETION_DAYS * DAY_MS).toISOString(),
      };
      const written = await deps.updateDoc(deletionDocId(userId), current =>
        current && current.status === "pending" ? { refuse: current } : { next: fresh, result: fresh });
      /* القرارُ من ناتج الكتابة الذرّية: طلبٌ معلّق سابق = لا طلبَ جديد ولا تنبيهٌ مكرّر. */
      const created = Boolean(written.ok);
      const request = (written.result as DeletionRequest) || fresh;
      if (created) {
        await deps.audit({ userId, name: label, action: "account-deletion-request", changes: `طلب حذف الحساب — الموعد الأقصى ${request.dueBy.slice(0, 10)}`, status: 200, path: "/api/account/deletion-request" });
        await deps.notifyAdmins(request).catch(error => console.error("[account-deletion] notify:", error instanceof Error ? error.message : error));
      }
      await deps.endSessions(userId, req);
      res.setHeader("Set-Cookie", `session_id=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${deps.secureCookie ? "; Secure" : ""}`);
      res.json({ success: true, created, dueBy: request.dueBy, message: ACCOUNT_DELETION_NOTICE });
    } catch (error) {
      console.error("[account-deletion] failed:", error instanceof Error ? error.message : error);
      res.status(500).json({ error: "تعذّر تسجيل الطلب حالياً. حاول مرة أخرى." });
    }
  });

  const adminOnly: RequestHandler = (req, res, next) => {
    const r = req as AuthenticatedRequest;
    if (!r.user) { res.status(401).json({ error: "سجّل الدخول أولاً." }); return; }
    if (deps.isDemo() || !deps.isPower(r)) { res.status(403).json({ error: "هذه الأداة مخصصة لإدارة النظام الرئيسية" }); return; }
    next();
  };

  app.get("/api/admin/account-deletion-requests", noStore, adminOnly, async (_req, res) => {
    try {
      const rows = await deps.listDocs();
      res.json(rows.sort((a, b) => (a.status === b.status ? a.dueBy.localeCompare(b.dueBy) : a.status === "pending" ? -1 : 1)));
    } catch {
      res.status(500).json({ error: "تعذّر جلب الطلبات." });
    }
  });

  app.post("/api/admin/account-deletion-requests/:id/resolve", noStore, adminOnly, async (req, res) => {
    const actor = (req as AuthenticatedRequest).user as DeletionUser;
    const id = String(req.params.id || "");
    const target = (await deps.listDocs().catch(() => [] as DeletionRequest[])).find(row => row.id === id);
    if (!target) { res.status(404).json({ error: "الطلب غير موجود." }); return; }
    const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 300) : "";
    const done = await deps.updateDoc(deletionDocId(target.userId), current =>
      current && current.id === id && current.status === "pending"
        ? { next: { ...current, status: "done", resolvedAt: new Date(clock()).toISOString(), resolvedBy: String(actor.Name || actor.SystemUserLogin || ""), ...(note ? { resolvedNote: note } : {}) }, result: true }
        : { refuse: false });
    if (!done.ok) { res.status(409).json({ error: "الطلب مُغلق أو تغيّر." }); return; }
    await deps.audit({ userId: Number(actor.SystemUserId), name: String(actor.Name || ""), action: "account-deletion-resolved", changes: `إغلاق طلب حذف حساب «${target.name}» (${target.login})`, status: 200, path: `/api/admin/account-deletion-requests/${id}/resolve` }).catch(() => undefined);
    res.json({ ok: true });
  });
}
