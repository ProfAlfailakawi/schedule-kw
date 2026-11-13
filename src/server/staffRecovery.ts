/**
 * ── «نسيت كلمة السر؟» لكل الموظفين (ملاحظة المالك 6) ────────────────────────────
 *
 * الطريقةُ نفسها التي يدخل بها عضو الفريق برابطه: آخرُ أربعة أرقام من الرقم المدني المسجّل
 * لصاحب الحساب. تعمل لكل حسابٍ موظّف — ورؤساء الأقسام منهم — من شاشة الدخول نفسها:
 *
 *  ١) تحقّق: اسمُ المستخدم + الأرقام الأربعة ← تذكرةٌ قصيرة (عشر دقائق، لمرةٍ واحدة).
 *     لا يتغيّر في الحساب شيء: الكلمةُ القديمة تبقى تعمل.
 *  ٢) كلمةٌ جديدة بالتذكرة ← تُحفظ، وتسقط القديمةُ وكلُّ جلسات الحساب الآن فقط.
 *
 * والحراسة:
 *  - لا تعدادَ للحسابات: اسمٌ غير موجود، أو أرقامٌ خاطئة، أو حسابُ إدارة، أو حسابٌ بلا رقمٍ
 *    مدني مسجّل، أو موقوف — الجوابُ نفسه حرفاً وزمناً (حدٌّ أدنى لزمن الرد).
 *  - حدٌّ لكل عنوان (express-rate-limit) ولكل حساب: محاولاتٌ معدودة في الساعة، وخمسُ خاطئةٍ
 *    متتالية تُقفل الاسمَ مدّةً تتضاعف (نصف ساعة ثم ساعة… حتى يوم). والعدّادُ على بصمة الاسم
 *    لا على الحساب، فيُقفل الاسمُ غيرُ الموجود كما يُقفل الموجود.
 *  - حساباتُ إدارة النظام مستثناة: تُستعاد عبر مدير النظام.
 *  - سجلُّ تدقيقٍ لكل محاولة ونتيجتها، وإشعارٌ لمدير النظام عند كل استعادةٍ لحساب رئيس (كرسي).
 */
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { Express, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { isSeatRole, civilTailOf } from "../utils/seats";
import { roleLabel } from "../utils/academicRoles";
import { AR, countOf } from "../utils/arabicCount";
import { initialPasswordMark, LEGACY_SHARED_PASSWORD, newPasswordProblem } from "./accountPassword";

/* ── الثوابت ──────────────────────────────────────────────────────────────── */

export const RECOVERY_MAX_FAILURES = 5;
export const RECOVERY_BASE_LOCK_MS = 30 * 60 * 1000;
export const RECOVERY_MAX_LOCK_MS = 24 * 60 * 60 * 1000;
/** كلُّ المحاولات (صحيحةً وخاطئة) على اسمٍ واحد في الساعة. */
export const RECOVERY_WINDOW_MS = 60 * 60 * 1000;
export const RECOVERY_WINDOW_LIMIT = 8;
export const RECOVERY_TICKET_MS = 10 * 60 * 1000;
/** حدٌّ أدنى لزمن ردّ التحقق: الاسمُ الموجود والمعدوم يُجابان في الزمن نفسه تقريباً. */
export const RECOVERY_MIN_RESPONSE_MS = 450;

export const RECOVERY_NEUTRAL = "تعذّر التحقق. راجع اسم المستخدم والأرقام الأربعة، أو اطلب الاستعادة من مدير النظام.";
export const RECOVERY_TICKET_DEAD = "انتهت مهلة الاستعادة. ابدأ من جديد.";
export const RECOVERY_DEMO = "استعادة كلمة السر غير متاحة في البيئة التجريبية.";

export function recoveryLockedMessage(until: number, now: number): string {
  const minutes = Math.max(1, Math.ceil((until - now) / 60_000));
  return minutes >= 60
    ? `محاولاتٌ كثيرة. حاول بعد ${countOf(Math.ceil(minutes / 60), AR.hour)} تقريباً، أو اطلب الاستعادة من مدير النظام.`
    : `محاولاتٌ كثيرة. حاول بعد ${countOf(minutes, AR.minute)}، أو اطلب الاستعادة من مدير النظام.`;
}

/* ── الحارسُ على بصمة الاسم ────────────────────────────────────────────────── */

export interface RecoveryGuard {
  id: string;
  failures: number;
  lockouts: number;
  lockedUntil?: number;
  windowStart: number;
  windowCount: number;
  updatedAt: string;
}

export const normalizeLogin = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase().slice(0, 200);

/** بصمةُ الاسم: لا يُحفظ من حاول بأيّ اسم، ويُعدّ الاسمُ غيرُ الموجود كالموجود. */
export function recoveryGuardId(login: unknown): string {
  return `guard_${createHash("sha256").update(`staff-recovery:${normalizeLogin(login)}`).digest("hex").slice(0, 40)}`;
}

export function emptyGuard(id: string, now: number): RecoveryGuard {
  return { id, failures: 0, lockouts: 0, windowStart: now, windowCount: 0, updatedAt: new Date(now).toISOString() };
}

/** مقفلٌ الآن؟ يُرجع موعدَ الفتح، أو 0. */
export function guardBlockedUntil(guard: RecoveryGuard | null, now: number): number {
  if (!guard) return 0;
  if (guard.lockedUntil && guard.lockedUntil > now) return guard.lockedUntil;
  if (now - guard.windowStart < RECOVERY_WINDOW_MS && guard.windowCount >= RECOVERY_WINDOW_LIMIT) return guard.windowStart + RECOVERY_WINDOW_MS;
  return 0;
}

/** محاولةٌ تُحسب قبل الحكم عليها: تدخل نافذة الساعة. */
export function guardCounted(guard: RecoveryGuard | null, id: string, now: number): RecoveryGuard {
  const base = guard || emptyGuard(id, now);
  const fresh = now - base.windowStart >= RECOVERY_WINDOW_MS;
  return { ...base, windowStart: fresh ? now : base.windowStart, windowCount: (fresh ? 0 : base.windowCount) + 1, updatedAt: new Date(now).toISOString() };
}

/** محاولةٌ خاطئة: الخامسةُ المتتالية تُقفل مدّةً تتضاعف مع كل إقفال. */
export function guardAfterFailure(guard: RecoveryGuard, now: number): RecoveryGuard {
  const failures = guard.failures + 1;
  if (failures < RECOVERY_MAX_FAILURES) return { ...guard, failures, updatedAt: new Date(now).toISOString() };
  const lockouts = guard.lockouts + 1;
  const span = Math.min(RECOVERY_MAX_LOCK_MS, RECOVERY_BASE_LOCK_MS * 2 ** (lockouts - 1));
  return { ...guard, failures: 0, lockouts, lockedUntil: now + span, updatedAt: new Date(now).toISOString() };
}

export function guardAfterSuccess(guard: RecoveryGuard, now: number): RecoveryGuard {
  return { ...guard, failures: 0, lockouts: 0, lockedUntil: undefined, updatedAt: new Date(now).toISOString() };
}

/* ── من يُستعاد حسابُه من هنا ──────────────────────────────────────────────── */

export interface RecoveryAccount {
  SystemUserId: number;
  Name?: string;
  SystemUserLogin?: string;
  SystemUserPass?: string;
  IsAdminUser?: boolean;
  IsActive?: boolean;
  IsLocked?: boolean;
  IsDeleted?: boolean;
  Role?: unknown;
  AdInstructorId?: number;
}

/** حسابُ إدارة النظام لا يُستعاد من شاشة الدخول: يعيده مديرُ النظام. */
export function recoveryExcluded(user: RecoveryAccount | null | undefined, rootAdminId: number): boolean {
  if (!user || !user.SystemUserPass) return true;
  if (user.IsDeleted || !user.IsActive || user.IsLocked) return true;
  return Boolean(user.IsAdminUser) || Number(user.SystemUserId) === Number(rootAdminId);
}

/** موازنةٌ بزمنٍ ثابت؛ الذيلُ الفارغ لا يطابق شيئاً. */
export function tailMatches(expected: string, given: unknown): boolean {
  const a = Buffer.from(String(expected || "----"));
  const b = Buffer.from(civilTailOf(given) || "xxxx");
  return a.length === b.length && timingSafeEqual(a, b) && Boolean(expected);
}

/** حسابُ رئيس: كرسيٌّ أكاديمي (رئيس قسم، رئيس لجنة، عميد…) — تُشعَر الإدارةُ باستعادته. */
export const isHeadAccount = (user: RecoveryAccount) => !user.IsAdminUser && isSeatRole(user.Role);

/* ── التذكرة ──────────────────────────────────────────────────────────────── */

export interface RecoveryTicket {
  id: string;
  userId: number;
  /** أثرُ الكلمة الحالية: إن تغيّرت (أعادها المدير مثلاً) سقطت التذكرة. */
  mark: string;
  issuedAt: number;
  expiresAt: number;
  usedAt?: number;
}

export const ticketId = (token: string) => `ticket_${createHash("sha256").update(`staff-recovery-ticket:${token}`).digest("hex").slice(0, 48)}`;
export const newTicketToken = () => randomBytes(32).toString("base64url");

export function ticketUsable(ticket: RecoveryTicket | null, storedHash: string | undefined, now: number): boolean {
  return Boolean(ticket && !ticket.usedAt && ticket.expiresAt > now && storedHash && ticket.mark === initialPasswordMark(storedHash));
}

/* ── أثرُ الاستعادة لمدير النظام ───────────────────────────────────────────── */

export interface RecoveryEvent { id: string; userId: number; name: string; login: string; role: string; at: string }

export function recoveryNotifications(events: RecoveryEvent[], now = Date.now()) {
  const since = now - 14 * 86_400_000;
  return events
    .filter(event => Date.parse(event.at) >= since)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 20)
    .map(event => ({
      id: `staff-recovery:${event.id}`,
      tone: "alert" as const,
      title: `استُعيدت كلمة سر «${event.name}»`,
      detail: `${event.role} · ${event.login} — بالرقم المدني من شاشة الدخول`,
      at: event.at,
    }));
}

/* ── المسارات ─────────────────────────────────────────────────────────────── */

type Update<T> = (id: string, fn: (current: T | null) => { next: T; result: unknown } | { refuse: unknown }) => Promise<{ ok: boolean }>;

export interface RecoveryDeps {
  isDemo: () => boolean;
  rootAdminId: number;
  findUser: (login: string) => Promise<RecoveryAccount | undefined>;
  getUser: (id: number) => Promise<RecoveryAccount | undefined>;
  /** آخرُ أربعة أرقام من الرقم المدني المسجّل لمن يجلس على الحساب، أو "". */
  civilTail: (user: RecoveryAccount) => Promise<string>;
  getDoc: <T>(id: string) => Promise<T | null>;
  updateDoc: Update<any>;
  saveDoc: <T>(id: string, row: T) => Promise<unknown>;
  hash: (password: string) => string;
  vault: (password: string) => string;
  verify: (password: string, stored: string) => boolean;
  setPassword: (userId: number, fields: Record<string, unknown>) => Promise<unknown>;
  endSessions: (userId: number) => Promise<unknown>;
  audit: (entry: { userId: number; name: string; action: string; changes: string; status: number }) => Promise<unknown>;
  notifyAdmins: (event: RecoveryEvent) => Promise<unknown>;
  now?: () => number;
  minResponseMs?: number;
  ipLimit?: number;
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function registerStaffRecoveryRoutes(app: Express, deps: RecoveryDeps): void {
  const now = () => (deps.now || Date.now)();
  const minMs = deps.minResponseMs ?? RECOVERY_MIN_RESPONSE_MS;
  const perIp = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: deps.ipLimit ?? 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "محاولاتٌ كثيرة من هذا الجهاز. حاول بعد ربع ساعة." },
  });

  /* ١) التحقق: لا يغيّر في الحساب شيئاً. */
  app.post("/api/auth/recover/verify", perIp, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    if (deps.isDemo()) { res.status(403).json({ error: RECOVERY_DEMO }); return; }
    const started = now();
    const login = normalizeLogin(req.body?.username);
    const tail = civilTailOf(req.body?.tail);
    const guardId = recoveryGuardId(login);
    const settle = async () => { const left = minMs - (now() - started); if (left > 0) await wait(left); };
    if (!login || !tail) { await settle(); res.status(400).json({ error: RECOVERY_NEUTRAL }); return; }

    /* المحاولةُ تُحسب أولاً وذرّياً — فلا تتسابق عشرُ محاولاتٍ متزامنة على خمسٍ مسموحة. */
    let blockedUntil = 0;
    await deps.updateDoc(guardId, (current: RecoveryGuard | null) => {
      blockedUntil = guardBlockedUntil(current, now());
      if (blockedUntil) return { refuse: true };
      return { next: guardCounted(current, guardId, now()), result: true };
    });
    if (blockedUntil) {
      await settle();
      res.status(429).json({ error: recoveryLockedMessage(blockedUntil, now()), code: "recovery-locked" });
      return;
    }

    const user = await deps.findUser(login).catch(() => undefined);
    const excluded = recoveryExcluded(user, deps.rootAdminId);
    const expected = !excluded && user ? await deps.civilTail(user).catch(() => "") : "";
    const ok = tailMatches(expected, tail);

    if (!ok) {
      let locked = false;
      await deps.updateDoc(guardId, (current: RecoveryGuard | null) => {
        const next = guardAfterFailure(current || emptyGuard(guardId, now()), now());
        locked = Boolean(next.lockedUntil && next.lockedUntil > now() && next.failures === 0);
        return { next, result: true };
      });
      await deps.audit({ userId: user ? Number(user.SystemUserId) : 0, name: user ? String(user.Name || user.SystemUserLogin || "") : login, action: "استعادة كلمة السر — تحقق مرفوض", changes: locked ? "أُقفلت الاستعادة بعد خمس محاولات خاطئة" : "الأرقام الأربعة لا تطابق أو الحساب لا يُستعاد من هنا", status: 400 }).catch(() => undefined);
      await settle();
      res.status(400).json({ error: RECOVERY_NEUTRAL });
      return;
    }

    await deps.updateDoc(guardId, (current: RecoveryGuard | null) => ({ next: guardAfterSuccess(current || emptyGuard(guardId, now()), now()), result: true }));
    const token = newTicketToken();
    const ticket: RecoveryTicket = { id: ticketId(token), userId: Number(user!.SystemUserId), mark: initialPasswordMark(String(user!.SystemUserPass)), issuedAt: now(), expiresAt: now() + RECOVERY_TICKET_MS };
    await deps.saveDoc(ticket.id, ticket);
    await deps.audit({ userId: ticket.userId, name: String(user!.Name || user!.SystemUserLogin || ""), action: "استعادة كلمة السر — تحقق ناجح", changes: "بالرقم المدني من شاشة الدخول؛ الكلمة الحالية باقية حتى تُختار الجديدة", status: 200 }).catch(() => undefined);
    await settle();
    res.json({ ticket: token, expiresAt: new Date(ticket.expiresAt).toISOString() });
  });

  /* ٢) الكلمةُ الجديدة: الآن فقط تسقط القديمة وتُغلق الجلسات. */
  app.post("/api/auth/recover/complete", perIp, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    if (deps.isDemo()) { res.status(403).json({ error: RECOVERY_DEMO }); return; }
    const token = String(req.body?.ticket || "");
    const next = String(req.body?.newPassword ?? "");
    if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) { res.status(400).json({ error: RECOVERY_TICKET_DEAD, code: "recovery-ticket" }); return; }
    const id = ticketId(token);
    const ticket = await deps.getDoc<RecoveryTicket>(id);
    const user = ticket ? await deps.getUser(Number(ticket.userId)) : undefined;
    if (!ticket || !user || recoveryExcluded(user, deps.rootAdminId) || !ticketUsable(ticket, user.SystemUserPass, now())) {
      res.status(400).json({ error: RECOVERY_TICKET_DEAD, code: "recovery-ticket" }); return;
    }
    const problem = newPasswordProblem("", next) || (deps.verify(next, String(user.SystemUserPass)) ? "اختر كلمة سرٍّ غير السابقة" : null);
    if (problem) { res.status(400).json({ error: problem }); return; }
    if (next === LEGACY_SHARED_PASSWORD) { res.status(400).json({ error: "اختر كلمة سرٍّ غير الكلمة الموحّدة القديمة" }); return; }

    /* التذكرةُ تُستهلك ذرّياً: لا تُحفظ بها كلمتان. */
    let claimed = false;
    await deps.updateDoc(id, (current: RecoveryTicket | null) => {
      if (!ticketUsable(current, user.SystemUserPass, now())) return { refuse: true };
      claimed = true;
      return { next: { ...current!, usedAt: now() }, result: true };
    });
    if (!claimed) { res.status(400).json({ error: RECOVERY_TICKET_DEAD, code: "recovery-ticket" }); return; }

    await deps.setPassword(Number(user.SystemUserId), {
      SystemUserPass: deps.hash(next), SystemUserPassVault: deps.vault(next), MustChangePassword: false, InitialPasswordExpiresAt: "",
    });
    await deps.endSessions(Number(user.SystemUserId));
    const name = String(user.Name || user.SystemUserLogin || "");
    const head = isHeadAccount(user);
    await deps.audit({ userId: Number(user.SystemUserId), name, action: "استعادة كلمة السر — كلمة جديدة", changes: `اختار صاحب الحساب كلمة جديدة بعد التحقق بالرقم المدني؛ أُغلقت جلساته${head ? " · أُشعر مدير النظام" : ""}`, status: 200 }).catch(() => undefined);
    if (head) {
      const at = new Date(now()).toISOString();
      await deps.notifyAdmins({ id: `${at.replace(/\D/g, "")}_${Number(user.SystemUserId)}`, userId: Number(user.SystemUserId), name, login: String(user.SystemUserLogin || ""), role: roleLabel(user.Role), at }).catch(() => undefined);
    }
    res.json({ ok: true, login: String(user.SystemUserLogin || "") });
  });
}
