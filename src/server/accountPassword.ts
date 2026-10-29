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
import { randomInt } from "node:crypto";
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
