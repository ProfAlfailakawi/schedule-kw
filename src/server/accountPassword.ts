/**
 * ── كلمةُ السر الأولى وتغييرُها عند أول دخول ───────────────────────────────────
 *
 * كانت حساباتُ الأقسام والكليات تولد فعّالةً بكلمة سرٍّ واحدة للجميع (12345678)،
 * وأسماءُ دخولها تُشتقّ من اسم القسم (Frenchdept…)، فيدخلها من يخمّن الاسم.
 *
 * الآن:
 *  • الحسابُ الجديد يولد بكلمةٍ عشوائية خاصةٍ به تُعرض للمسؤول مرّةً عند الإنشاء
 *    (ويملك دائماً تعيينَ غيرها من شاشة المستخدمين)، ويُعلَّم MustChangePassword.
 *  • بطاقاتُ رؤساء الفرق (قرارُ المالك 2026-11-05) تُصدَر بالكلمة الافتراضية DEFAULT_FIRST_PASSWORD:
 *    تُغيَّر عند أول دخول، ويسقط عملُها بعد سبعة أيام (InitialPasswordExpiresAt)، فيُرفض الدخول بها
 *    حتى يعيد المسؤولُ إصدارها. لا تُحفظ نصّاً: بصمتُها وحدها كسائر الكلمات.
 *  • إعادةُ التعيين (قرارُ المالك 2026-11-06): كلمةٌ مؤقتة عشوائية لا تُشتق من بيانات صاحبها، بصمتُها
 *    وحدها محفوظة، تعمل 24 ساعة ولدخولٍ واحد (passwordResets)، ثم يختار صاحبها كلمته.
 *  • الحسابُ القائم الذي ما زال يدخل بالكلمة الموحّدة لا يُقفل: يدخل بها، فيُعلَّم
 *    عندها، ولا يصل إلى شيءٍ في الخادم حتى يختار كلمته (passwordChangeGate).
 */
import { createHash, randomInt } from "node:crypto";
import type { NextFunction, Response } from "express";
import { AR, countOf } from "../utils/arabicCount";
import { FIRST_PASSWORD_DAYS, TEMPORARY_PASSWORD_HOURS } from "../utils/seatAccessCard";
import type { AuthenticatedRequest } from "./core/auth";

/** الكلمةُ الموحّدة القديمة: لا تُعطى لحسابٍ جديد، ومن يدخل بها يُطلب منه تغييرها. */
export const LEGACY_SHARED_PASSWORD = "12345678";

/** الكلمةُ الأولى في بطاقات رؤساء الفرق: هي نفسها القديمة، لكنها الآن معلَّمة ومؤقتة. */
export const DEFAULT_FIRST_PASSWORD = LEGACY_SHARED_PASSWORD;
export const INITIAL_PASSWORD_EXPIRED = "انتهت صلاحية الكلمة الأولى. اطلب من مدير النظام إعادة إصدارها.";

const firstPasswordDeadline = (now: number) => new Date(now + FIRST_PASSWORD_DAYS * 86_400_000).toISOString();

/** حقولُ الحساب عند إصدار الكلمة الأولى الافتراضية: يبدأ عدُّ الأيام من لحظة الإصدار. */
export function defaultFirstPasswordFields(hash: string, vault: string, now = Date.now()) {
  return { SystemUserPass: hash, SystemUserPassVault: vault, MustChangePassword: true, InitialPasswordExpiresAt: firstPasswordDeadline(now) };
}

/** كلمةٌ كتبها مسؤولٌ لحسابِ غيره عرفها، فعلى صاحبها تغييرها؛ ومدّتُها تسقط إلا إن كانت الافتراضية. */
export function adminSetPasswordFields(password: string, now = Date.now()) {
  return { MustChangePassword: true, InitialPasswordExpiresAt: password === DEFAULT_FIRST_PASSWORD ? firstPasswordDeadline(now) : "" };
}

/** هل انتهت الكلمة الأولى؟ يكفي أن يختار صاحبها كلمته ليسقط الحكم، فالمدّة لا تمسّ كلمته هو. */
export function initialPasswordExpired(user: { MustChangePassword?: boolean; InitialPasswordExpiresAt?: string } | null | undefined, now = Date.now()): boolean {
  if (!user?.MustChangePassword || !user.InitialPasswordExpiresAt) return false;
  const at = Date.parse(user.InitialPasswordExpiresAt);
  return Number.isFinite(at) && now >= at;
}

export const TEMPORARY_PASSWORD_EXPIRED = "انتهت الكلمة المؤقتة. اطلب إعادة التعيين من مدير النظام.";
export const TEMPORARY_PASSWORD_USED = "استُعملت الكلمة المؤقتة من قبل، وهي لدخولٍ واحد. اطلب إعادة التعيين من مدير النظام.";

/** طولُ الكلمة المؤقتة: أربعة عشر حرفاً ≈ 80 بِتّاً. */
export const TEMPORARY_PASSWORD_LENGTH = 14;

/** حقولُ الحساب عند إعادة التعيين: لا نسخةَ قابلةً للفك، والمدّةُ تبدأ من لحظة الإصدار. */
export function temporaryPasswordFields(hash: string, now = Date.now()) {
  return { SystemUserPass: hash, SystemUserPassVault: "", MustChangePassword: true, InitialPasswordExpiresAt: new Date(now + TEMPORARY_PASSWORD_HOURS * 3_600_000).toISOString() };
}

/** سجلُّ إعادة التعيين: أثرُ الكلمة لا هي؛ فأيُّ تغييرٍ للكلمة بعده يُسقطه بلا تنظيف. */
export interface PasswordResetRecord { userId: number; mark: string; issuedAt: string; expiresAt: string; by: string; usedAt?: string }

export const passwordResetId = (userId: number) => `reset_${Number(userId)}`;

export function passwordResetRecord(userId: number, hash: string, expiresAt: string, by: string, now = Date.now()): PasswordResetRecord {
  return { userId: Number(userId), mark: initialPasswordMark(hash), issuedAt: new Date(now).toISOString(), expiresAt, by };
}

/** هل هذا السجلُّ للكلمة المحفوظة الآن؟ */
export const passwordResetApplies = (record: PasswordResetRecord | null | undefined, storedHash: string): boolean =>
  Boolean(record && storedHash && record.mark === initialPasswordMark(storedHash));

/** يُحسب الدخولُ مرةً واحدة: يُستدعى داخل كتابةٍ ذرّية، فلا يمرّ دخولان متزامنان بالكلمة نفسها. */
export function claimPasswordReset(record: PasswordResetRecord | null, storedHash: string, now = Date.now()): { next: PasswordResetRecord; result: true } | { refuse: false } {
  if (!record || !passwordResetApplies(record, storedHash) || record.usedAt) return { refuse: false };
  return { next: { ...record, usedAt: new Date(now).toISOString() }, result: true };
}

/* بلا حروفٍ تتشابه عند الإملاء أو الطباعة (0/O، 1/l/I). */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/** كلمةٌ أولى عشوائية لحسابٍ واحد (عشرة أحرف ≈ 57 بِتّاً). */
export function generateInitialPassword(length = 10): string {
  let out = "";
  for (let i = 0; i < length; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export const MIN_PASSWORD_LENGTH = 8;

/** سببُ رفض الكلمة الجديدة، أو null إن قُبلت. */
export function newPasswordProblem(current: string, next: string): string | null {
  if (typeof next !== "string" || next.length < MIN_PASSWORD_LENGTH) return `كلمة السر الجديدة ${countOf(MIN_PASSWORD_LENGTH, AR.character)} على الأقل`;
  if (next.length > 128) return "كلمة السر الجديدة أطول من المسموح";
  if (next === LEGACY_SHARED_PASSWORD) return "اختر كلمة سرٍّ غير الكلمة الموحّدة القديمة";
  if (next === current) return "اختر كلمة سرٍّ غير الحالية";
  return null;
}

/**
 * ── أولُ دخولٍ بالكلمة الأولى: بلا «كلمة السر الحالية» ──────────────────────────
 *
 * من دخل للتوّ بالكلمة التي كتبها المسؤول في بطاقته لا يعرفها ليكتبها ثانيةً (فتحتها
 * البطاقةُ له). فتُعفى «الحالية» بشروطٍ ثلاثة معاً، وإلا طُلبت كما كانت:
 *  ١) الحسابُ مُعلَّمٌ بتغيير كلمته (MustChangePassword)؛
 *  ٢) والجلسةُ نفسها فُتحت بتلك الكلمة: عند الدخول يُكتب في سجلّها أثرٌ من بصمة الكلمة
 *     المحفوظة (لا الكلمة ولا بصمتها نفسها)، فإن غيّر المسؤولُ الكلمةَ بعدها سقط الإعفاء؛
 *  ٣) وفي نافذةٍ قصيرة من فتحها (INITIAL_PASSWORD_WINDOW_MS).
 * وجلسةُ عضو الفريق (برابطه) لا تُعفى أبداً — ولا تصل إلى التغيير أصلاً (seatMemberGuard).
 */
export const INITIAL_PASSWORD_WINDOW_MS = 15 * 60 * 1000;

/** أثرُ الكلمة المحفوظة في سجلّ الجلسة: يطابقها ما دامت هي، ولا يُستخرج منه شيء. */
export function initialPasswordMark(storedHash: string): string {
  return createHash("sha256").update(`schedule:first-login:${storedHash}`).digest("hex").slice(0, 32);
}

export interface InitialPasswordSession { createdAt?: number; initialPassMark?: string; memberId?: string }

/** هل تُعفى هذه الجلسة من «كلمة السر الحالية»؟ */
export function currentPasswordWaived(
  user: { MustChangePassword?: boolean; SystemUserPass?: string } | null | undefined,
  session: InitialPasswordSession | null | undefined,
  now = Date.now(),
): boolean {
  if (!user?.MustChangePassword || !user.SystemUserPass || !session?.initialPassMark || session.memberId) return false;
  const age = now - Number(session.createdAt || 0);
  if (!(age >= 0 && age <= INITIAL_PASSWORD_WINDOW_MS)) return false;
  return session.initialPassMark === initialPasswordMark(user.SystemUserPass);
}

export type PasswordChangeOutcome =
  | { ok: true; hash: string; vault: string }
  | { ok: false; status: 400; error: string; code?: "current-password-required" };

/**
 * قرارُ تغيير الكلمة كلُّه في مكانٍ واحد يُختبر بلا خادم: الحاليةُ مطلوبة إلا لجلسةٍ معفاة
 * (currentPasswordWaived)، والجديدةُ بقواعدها، ولا تكون الكلمةَ المحفوظة نفسها.
 */
export function decidePasswordChange(input: {
  user: { MustChangePassword?: boolean; SystemUserPass?: string } | null | undefined;
  session: InitialPasswordSession | null | undefined;
  current: string;
  next: string;
  now?: number;
  verify: (password: string, stored: string) => boolean;
  hash: (password: string) => string;
  vault: (password: string) => string;
}): PasswordChangeOutcome {
  const { user, current, next, verify } = input;
  if (!user?.SystemUserPass) return { ok: false, status: 400, error: "كلمة السر الحالية غير صحيحة" };
  const waived = !current && currentPasswordWaived(user, input.session, input.now);
  if (!waived) {
    if (!current) return { ok: false, status: 400, error: "اكتب كلمة السر الحالية", code: "current-password-required" };
    if (!verify(current, user.SystemUserPass)) return { ok: false, status: 400, error: "كلمة السر الحالية غير صحيحة" };
  }
  const problem = newPasswordProblem(current, next);
  if (problem) return { ok: false, status: 400, error: problem };
  if (waived && verify(next, user.SystemUserPass)) return { ok: false, status: 400, error: "اختر كلمة سرٍّ غير الحالية" };
  return { ok: true, hash: input.hash(next), vault: input.vault(next) };
}

/**
 * ما يبقى مفتوحاً لحسابٍ عليه تغييرُ كلمته: أبوابُ الدخول كلها (من أنا، الخروج، التغيير نفسه،
 * ونبضُ الجلسة، والدخولُ بحسابٍ آخر من المتصفح نفسه)، وما لا هويةَ فيه أصلاً: حالُ الخدمة
 * ونسختُها وإعدادُ التجربة، والروابطُ العامة التي تُفتح برمزها لا بالجلسة.
 */
export function passwordChangeOpenPath(path: string): boolean {
  return path.startsWith("/auth/") || path.startsWith("/public/") || path === "/health" || path === "/version" || path === "/demo/config";
}

export const PASSWORD_CHANGE_REQUIRED = "غيّر كلمة السر أولاً لتكمل.";

/** يُركَّب على ‎/api‎ بعد authMiddleware: الحسابُ المعلَّم لا يقرأ ولا يكتب شيئاً قبل التغيير. */
export function passwordChangeGate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!(req.user as any)?.MustChangePassword || passwordChangeOpenPath(req.path)) { next(); return; }
  res.status(403).json({ error: PASSWORD_CHANGE_REQUIRED, code: "password-change-required" });
}
