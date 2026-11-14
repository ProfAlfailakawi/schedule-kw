/**
 * ── حرّاسُ شاشة المستخدمين: من يعدّل من، وما الذي لا يُنزع ──────────────────
 *
 * كانت صلاحيةُ الشاشة ١١ وحدها تفتح تعديلَ أيّ حساب وحذفَه — حسابُ الإدارة الرئيسي
 * نفسُه بينها، وحسابُ المعدِّل نفسُه. فمديرٌ واحد كان يستطيع أن يكتب كلمةَ سرٍّ جديدة
 * للحساب الرئيسي فيدخل بها الخزنة، أو أن يُوقف نفسه أو آخرَ مديرٍ فاعل فلا يبقى بابٌ
 * يُعيد أحداً.
 *
 * القواعد هنا دوالُّ خالصة تُختبر بلا خادم (tests/admin-station-audit.ts):
 *  • الحسابُ الرئيسي لا يعدّله ولا يحذفه إلا صاحبُه؛
 *  • لا يوقف أحدٌ حسابه ولا يقفله ولا يحذفه ولا ينزع عنه «مدير»؛
 *  • لا يُنزع آخرُ مديرٍ فاعل (توقيفاً أو قفلاً أو نزعاً للصفة أو حذفاً)؛
 *  • منحُ «مدير» أو نزعُها للحساب الرئيسي وحده — فهي تتخطّى النطاق كله؛
 *  • تغييرُ الصفة يُعيد كتابة شاشات الحساب، فيلزمه ما يلزم شاشة الصلاحيات: الشاشة ١٢ أو الحساب الرئيسي.
 */
import { MIN_PASSWORD_LENGTH } from "./accountPassword";
import { AR, countOf } from "../utils/arabicCount";

export const PERMISSIONS_FORM_ID = 12;

export interface GuardUser {
  SystemUserId: number;
  Name?: string;
  SystemUserLogin?: string;
  IsAdminUser?: boolean;
  IsActive?: boolean;
  IsLocked?: boolean;
  IsDeleted?: boolean;
  Role?: string;
  AdInstructorId?: number;
}

export interface GuardActor { id: number; permissions: number[] }

/** مديرٌ فاعل: يدخل (فعّال وغير مقفل وغير محذوف) ويملك الإدارة (علامة «مدير» أو الحساب الرئيسي). */
export function isActiveAdmin(user: GuardUser | null | undefined, rootId: number): boolean {
  if (!user || user.IsDeleted) return false;
  if (!user.IsActive || user.IsLocked) return false;
  return Boolean(user.IsAdminUser) || Number(user.SystemUserId) === rootId;
}

/** كلمةُ سرٍّ يكتبها مسؤول: الطولُ نفسه الذي تُلزم به شاشةُ تغيير الكلمة. */
export function adminPasswordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `كلمة السر ${countOf(MIN_PASSWORD_LENGTH, AR.character)} على الأقل`;
  if (password.length > 128) return "كلمة السر أطول من المسموح";
  return null;
}

/** لماذا يُرفض هذا التعديل؟ null إن قُبل. */
export function userEditRefusal(input: {
  actor: GuardActor;
  rootId: number;
  before: GuardUser;
  next: { IsAdminUser: boolean; IsActive: boolean; IsLocked: boolean };
  roleChanged: boolean;
  users: GuardUser[];
}): string | null {
  const { actor, rootId, before, next, roleChanged, users } = input;
  const targetId = Number(before.SystemUserId);
  const actorIsRoot = actor.id === rootId;
  const self = actor.id === targetId;
  if (targetId === rootId && !actorIsRoot) return "حساب الإدارة الرئيسي لا يعدّله إلا صاحبه.";
  if (self && !next.IsActive) return "لا يمكنك إيقاف حسابك أنت.";
  if (self && next.IsLocked) return "لا يمكنك قفل حسابك أنت.";
  if (self && Boolean(before.IsAdminUser) && !next.IsAdminUser) return "لا يمكنك نزع صفة «مدير» عن حسابك أنت.";
  if (Boolean(before.IsAdminUser) !== next.IsAdminUser && !actorIsRoot) return "منح صفة «مدير» أو نزعها لحساب الإدارة الرئيسي وحده.";
  if (roleChanged && !actorIsRoot && !actor.permissions.includes(PERMISSIONS_FORM_ID)) return "تغيير الصفة يعيد كتابة شاشات الحساب، فيلزمه صلاحية شاشة الصلاحيات.";
  const after: GuardUser = { ...before, ...next };
  if (isActiveAdmin(before, rootId) && !isActiveAdmin(after, rootId)) {
    const others = users.filter(user => Number(user.SystemUserId) !== targetId && isActiveAdmin(user, rootId));
    if (!others.length) return "هذا آخر مديرٍ فاعل في النظام؛ لا يُوقف ولا يُقفل ولا تُنزع صفته.";
  }
  return null;
}

/** لماذا يُرفض الحذف؟ */
export function userDeleteRefusal(input: { actor: GuardActor; rootId: number; target: GuardUser | null | undefined; users: GuardUser[] }): string | null {
  const { actor, rootId, target, users } = input;
  if (!target || target.IsDeleted) return "المستخدم غير موجود";
  const targetId = Number(target.SystemUserId);
  if (targetId === rootId) return "حساب الإدارة الرئيسي لا يُحذف.";
  if (targetId === actor.id) return "لا يمكنك حذف حسابك أنت.";
  if (isActiveAdmin(target, rootId) && !users.some(user => Number(user.SystemUserId) !== targetId && isActiveAdmin(user, rootId))) {
    return "هذا آخر مديرٍ فاعل في النظام؛ لا يُحذف.";
  }
  return null;
}

const yesNo = (value: unknown) => (value ? "نعم" : "لا");

/**
 * ما تغيّر في الحساب، بجملةٍ تُقرأ في السجل: «من، إلى». كلمةُ السر علامةٌ فقط («أُعيد تعيينها»)،
 * لا قيمتها ولا بصمتها أبداً.
 */
export function userEditDiff(before: GuardUser | null | undefined, after: GuardUser, extra: { passwordChanged?: boolean; roleLabel?: (role?: string) => string } = {}): string {
  const parts: string[] = [];
  const label = extra.roleLabel || ((role?: string) => String(role || "—"));
  if (!before) return `حساب ${after.Name || after.SystemUserLogin || after.SystemUserId}`;
  if (String(before.Name || "") !== String(after.Name || "")) parts.push(`الاسم: «${before.Name || "—"}» ← «${after.Name || "—"}»`);
  if (String(before.SystemUserLogin || "") !== String(after.SystemUserLogin || "")) parts.push(`اسم الدخول: ${before.SystemUserLogin || "—"} ← ${after.SystemUserLogin || "—"}`);
  if (Boolean(before.IsAdminUser) !== Boolean(after.IsAdminUser)) parts.push(`مدير: ${yesNo(before.IsAdminUser)} ← ${yesNo(after.IsAdminUser)}`);
  if (Boolean(before.IsActive) !== Boolean(after.IsActive)) parts.push(`فعّال: ${yesNo(before.IsActive)} ← ${yesNo(after.IsActive)}`);
  if (Boolean(before.IsLocked) !== Boolean(after.IsLocked)) parts.push(`مقفل: ${yesNo(before.IsLocked)} ← ${yesNo(after.IsLocked)}`);
  if (after.Role !== undefined && String(before.Role || "") !== String(after.Role || "")) parts.push(`الصفة: «${label(before.Role)}» ← «${label(after.Role)}»`);
  if (Number(before.AdInstructorId || 0) !== Number(after.AdInstructorId || 0)) parts.push("ربط لوحة الأستاذ تغيّر");
  if (extra.passwordChanged) parts.push("أُعيد تعيين كلمة السر");
  const who = after.Name || before.Name || after.SystemUserLogin || String(after.SystemUserId);
  return parts.length ? `${who}: ${parts.join("، ")}` : `${who}: حفظ بلا تغيير`;
}
