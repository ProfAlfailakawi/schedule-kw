/**
 * ربطُ «نسيت كلمة السر؟» (src/server/staffRecovery.ts) بالمستودع والجلسات والتنبيهات.
 * مفصولٌ عن المنطق ليُختبر المنطقُ بخادمٍ صغيرٍ ومخزنٍ في الذاكرة.
 */
import { Repository } from "../db/repository";
import { authCache, isPowerUser, ROOT_ADMIN_USER_ID } from "./core/auth";
import { pushHooks, type PushAccount } from "./pushRoutes";
import { readSeatLedger } from "./seats";
import { civilTailOf } from "../utils/seats";
import { recoveryNotifications, type RecoveryAccount, type RecoveryDeps, type RecoveryEvent } from "./staffRecovery";

const COLLECTION = "staffRecovery" as const;

/** الرقمُ المدني لمن يجلس على الحساب الآن: شاغلُ الكرسي إن سُجّل، وإلا الأستاذُ المربوط بالحساب. */
async function civilTailForAccount(user: RecoveryAccount): Promise<string> {
  const ledger = await readSeatLedger(Number(user.SystemUserId)).catch(() => null);
  const instructorId = ledger?.holder
    ? Number(ledger.holder.instructorId || 0)
    : Number(user.AdInstructorId || 0);
  if (!instructorId) return "";
  const person = await Repository.getInstructorById(instructorId).catch(() => undefined);
  return civilTailOf((person as any)?.AdInstructorCivil);
}

export function staffRecoveryDeps(): RecoveryDeps {
  return {
    isDemo: () => Repository.isDemoMode() || Repository.isDemoRequest(),
    rootAdminId: ROOT_ADMIN_USER_ID,
    findUser: login => Repository.getUserByLogin(login) as Promise<RecoveryAccount | undefined>,
    getUser: id => Repository.getUserById(id) as Promise<RecoveryAccount | undefined>,
    civilTail: civilTailForAccount,
    getDoc: id => Repository.getFeatureDoc(COLLECTION, id),
    updateDoc: (id, fn) => Repository.updateFeatureDoc(COLLECTION, id, fn as any),
    saveDoc: (id, row) => Repository.saveFeatureDoc(COLLECTION, id, row),
    hash: password => Repository.hashPassword(password),
    vault: password => Repository.encryptPasswordForVault(password),
    verify: (password, stored) => Repository.verifyPassword(password, stored),
    setPassword: (userId, fields) => Repository.updateUser(userId, fields as any),
    endSessions: async userId => { await Repository.deleteOtherSessionsForUser(userId, undefined); authCache.clear(); },
    audit: entry => Repository.createAuditLog({
      SystemUserId: entry.userId, userName: entry.name, method: "POST", path: "/api/auth/recover",
      action: entry.action, entity: "auth", entityId: entry.userId ? String(entry.userId) : undefined, changes: entry.changes, status: entry.status,
    }),
    notifyAdmins: async (event: RecoveryEvent) => {
      await Repository.saveFeatureDoc(COLLECTION, `event_${event.id}`, event);
      await pushHooks.toAccounts((account: PushAccount) => isPowerUser(account as any),
        { title: `استُعيدت كلمة سر «${event.name}»`, body: `${event.role} · بالرقم المدني من شاشة الدخول`, url: "/", tag: `staff-recovery:${event.userId}`, at: event.at },
        `staff-recovery:${event.id}`);
    },
  };
}

/** إشعاراتُ الجرس لمدير النظام: كلُّ استعادةٍ لحساب رئيس في أسبوعين. */
export async function staffRecoveryBell(): Promise<ReturnType<typeof recoveryNotifications>> {
  return recoveryNotifications(await Repository.listFeatureDocs<RecoveryEvent>(COLLECTION, "event_"));
}
