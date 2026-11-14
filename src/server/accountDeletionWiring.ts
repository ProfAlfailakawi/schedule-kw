/**
 * ربطُ «طلب حذف الحساب» (src/server/accountDeletion.ts) بالمستودع والجلسات والتنبيهات.
 * مفصولٌ عن المنطق ليُختبر المنطقُ بخادمٍ صغيرٍ ومخزنٍ في الذاكرة.
 */
import { Repository } from "../db/repository";
import { authCache, getCookies, isPowerUser, ROOT_ADMIN_USER_ID } from "./core/auth";
import { pushHooks, type PushAccount } from "./pushRoutes";
import { pendingDeletionNotifications, type DeletionDeps, type DeletionRequest } from "./accountDeletion";

const COLLECTION = "accountDeletionRequests" as const;

export function accountDeletionDeps(): DeletionDeps {
  return {
    isDemo: () => Repository.isDemoMode() || Repository.isDemoRequest(),
    rootAdminId: ROOT_ADMIN_USER_ID,
    isPower: req => isPowerUser(req),
    getUser: id => Repository.getUserById(id) as Promise<any>,
    verify: (password, stored) => Repository.verifyPassword(password, stored),
    updateDoc: (id, fn) => Repository.updateFeatureDoc(COLLECTION, id, fn as any),
    listDocs: () => Repository.listFeatureDocs<DeletionRequest>(COLLECTION),
    audit: entry => Repository.createAuditLog({
      SystemUserId: entry.userId, userName: entry.name, method: "POST", path: entry.path,
      action: entry.action, entity: "account", entityId: entry.userId ? String(entry.userId) : undefined, changes: entry.changes, status: entry.status,
    }),
    endSessions: async (userId, req) => {
      const sessionId = getCookies(req)["session_id"];
      if (sessionId) await pushHooks.signedOut(sessionId).catch(() => undefined);
      await Repository.deleteOtherSessionsForUser(userId, undefined);
      authCache.clear();
    },
    notifyAdmins: async request => {
      await pushHooks.toAccounts((account: PushAccount) => isPowerUser(account as any),
        { title: `طلب حذف حساب «${request.name}»`, body: `${request.role} · يُنفَّذ قبل ${request.dueBy.slice(0, 10)}`, url: "/", tag: `account-deletion:${request.userId}`, at: request.requestedAt },
        `account-deletion:${request.id}`);
    },
    secureCookie: process.env.NODE_ENV === "production",
  };
}

/** الجرسُ لمدير النظام: كلُّ طلبٍ معلّق حتى يُغلق، فلا يضيع بعد أسبوعين. */
export async function accountDeletionBell(): Promise<ReturnType<typeof pendingDeletionNotifications>> {
  return pendingDeletionNotifications(await Repository.listFeatureDocs<DeletionRequest>(COLLECTION));
}
