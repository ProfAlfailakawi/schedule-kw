/**
 * ── كلمةُ السر الأولى وتغييرُها عند أول دخول ───────────────────────────────────
 *
 * كانت حساباتُ الأقسام والكليات تولد فعّالةً بكلمة سرٍّ واحدة للجميع (12345678)،
 * وأسماءُ دخولها تُشتقّ من اسم القسم (Frenchdept…)، فيدخلها من يخمّن الاسم.
 *
 * الآن:
 *  • الحسابُ الجديد يولد بكلمةٍ عشوائية خاصةٍ به تُعرض للمسؤول مرّةً عند الإنشاء
 *    (ويملك دائماً تعيينَ غيرها من شاشة المستخدمين)، ويُعلَّم MustChangePassword.
 *  • الحسابُ القائم الذي ما زال يدخل بالكلمة الموحّدة لا يُقفل: يدخل بها، فيُعلَّم
 *    عندها، ولا يصل إلى شيءٍ في الخادم حتى يختار كلمته (passwordChangeGate).
 */
import { createHash, randomInt } from "node:crypto";
import type { NextFunction, Response } from "express";
import { AR, countOf } from "../utils/arabicCount";
import type { AuthenticatedRequest } from "./core/auth";

/** الكلمةُ الموحّدة القديمة: لا تُعطى لحسابٍ جديد، ومن يدخل بها يُطلب منه تغييرها. */
export const LEGACY_SHARED_PASSWORD = "12345678";

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
