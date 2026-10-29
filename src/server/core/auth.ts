/**
 * ── الجلسة والهوية والصلاحيات (authMiddleware، requireAuth، requirePermission…) ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { Request, Response, NextFunction } from "express";
import { Repository } from "../../db/repository";
import { createDeadSessionMemory, createSessionLookupBudget, isSessionIdShape } from "../anonymousGuard";
import { isDemoLinkToken, publicLinkTokenFromPath } from "../../utils/demoLinkToken";
import { seatIdentity } from "../seats";

// Helper to parse cookies
export function getCookies(req: Request): Record<string, string> {
  const list: Record<string, string> = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(";").forEach(cookie => {
    const parts = cookie.split("=");
    const name = parts.shift()?.trim();
    if (name) {
      list[name] = decodeURIComponent(parts.join("="));
    }
  });
  return list;
}

export const SERVER_IDLE_SESSION_MS = 15 * 60 * 1000;
export const DEMO_SESSION_TTL_MS = 60 * 60 * 1000;

// Middleware to load session user
export interface AuthenticatedRequest extends Request {
  userId?: number;
  user?: any;
  scopes?: { AdCollegeId: number; AdSectionId: number }[];
  /** FormName ids this session holds, resolved once with the identity. */
  permissions?: number[];
  demoSessionId?: string;
}

/**
 * Who is asking, resolved once instead of three times per request.
 *
 * Identifying the caller meant three sequential database round trips — the
 * session, then the user, then their scopes — and it ran for every request,
 * including stylesheets and fonts. On a hosted database that was roughly half a
 * second of waiting before any handler had started, on every single call, which
 * is most of what made the application feel slow.
 *
 * The answer is now held for a few seconds per session. It is dropped the
 * moment the person signs out, and whenever an account or its scopes are
 * edited, so a revoked or locked account cannot keep working from memory.
 */
// Twenty seconds was too tight: past it, the first request of every burst paid
// for three database round trips again, which is exactly the half second the
// cache existed to remove. Two minutes still bounds how long a revoked account
// could linger, and sign-out and account edits drop the entry immediately.
const AUTH_CACHE_MS = 120_000;
export const authCache = new Map<string, { at: number; userId: number; user: any; scopes: any[]; permissions: number[] }>();

/**
 * ── الجلسة تُقاس بالحضور، لا بالكتابة إلى قاعدة البيانات ────────────────────
 *
 * The idle rule is fifteen minutes and it stays fifteen minutes. What was
 * broken is *what counts as being present*.
 *
 * Extending the session used to happen in exactly one place: the slow path of
 * `authMiddleware`, and only once the session was already inside its last ten
 * minutes. Every request served from `authCache` — which is most of them, for
 * two minutes at a stretch — returned early and extended nothing. So a person
 * clicking through the board could be working continuously and still be signed
 * out on the fifteen-minute mark, because the requests that proved they were
 * there were precisely the ones that skipped the extension.
 *
 * The extension moves here, in front of both paths. It is still a database
 * write, so it is throttled: one write per session per two minutes, no matter
 * how many requests arrive. Worst case the record trails real activity by two
 * minutes, which the fifteen-minute window absorbs without noticing.
 */
const SESSION_TOUCH_EVERY_MS = 120_000;
export const sessionTouchedAt = new Map<string, number>();

function touchSession(sessionId: string, ttlMs: number): void {
  const now = Date.now();
  const last = sessionTouchedAt.get(sessionId) || 0;
  if (now - last < SESSION_TOUCH_EVERY_MS) return;
  sessionTouchedAt.set(sessionId, now);
  // The reader is not kept waiting on a keep-alive write, and a failed write
  // simply means the next request tries again — never a thrown request.
  void Repository.refreshSession(sessionId, ttlMs).catch(() => {
    sessionTouchedAt.delete(sessionId);
  });
  // Sessions end without announcing it. Anything older than an hour cannot be
  // throttling a live session any more, so the map stays small on its own.
  if (sessionTouchedAt.size > 500) {
    for (const [id, at] of sessionTouchedAt) if (now - at > 3_600_000) sessionTouchedAt.delete(id);
  }
}
Repository.onIdentityChanged?.(() => authCache.clear());

/* جلسةٌ لا وجود لها تُسأل عنها قاعدةُ البيانات مرةً واحدة، لا مع كل طلب؛ وعنوانٌ
   يخترع معرّفاتٍ يُقرأ مجهولاً بعد حدٍّ لا يبلغه متصفّحٌ حقيقي. القاعدة كلها
   في src/server/anonymousGuard.ts. */
export const deadSessions = createDeadSessionMemory();
const sessionLookups = createSessionLookupBudget();
let sessionLookupRefusedLoggedAt = 0;

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const cookies = getCookies(req);
  const sessionId = cookies["session_id"];
  if (!sessionId) { next(); return; }
  /* معرّفٌ لم يصنعه الخادم لا يُسمّي جلسة: لا يُسأل عنه أحد. */
  if (!isSessionIdShape(sessionId)) { next(); return; }
  /* جلسةٌ تجريبية لا هويةَ لها خارج صندوقها: صندوقٌ انتهى، أو رابطٌ حقيقيٌّ
     فُتح من متصفّح التجربة، يُقرأ فيهما الطلب مجهولاً — لا بهوية «مدير
     البيئة التجريبية» المحفوظة في authCache على بياناتٍ حقيقية. */
  if (sessionId.startsWith("demo_") && !Repository.isDemoRequest()) { next(); return; }

  const idleTtlMs = Repository.isDemoRequest() ? DEMO_SESSION_TTL_MS : SERVER_IDLE_SESSION_MS;

  const cached = authCache.get(sessionId);
  if (cached && Date.now() - cached.at < AUTH_CACHE_MS) {
    req.userId = cached.userId;
    req.user = cached.user;
    req.scopes = cached.scopes;
    req.permissions = cached.permissions;
    // A request answered from memory is still a person at the keyboard.
    touchSession(sessionId, idleTtlMs);
    next();
    return;
  }

  /* الجلساتُ الحقيقية في Firestore وكلُّ سؤالٍ عنها قراءة؛ التجريبيةُ في الذاكرة. */
  const billed = sessionId.startsWith("sess_") && !Repository.isDemoRequest();
  if (billed && deadSessions.knows(sessionId)) { next(); return; }
  const lookup = billed ? sessionLookups.reserve(req.ip || "unknown") : null;
  if (billed && !lookup) {
    if (Date.now() - sessionLookupRefusedLoggedAt > 60_000) {
      sessionLookupRefusedLoggedAt = Date.now();
      console.warn(`[anonymous-guard] ${req.ip || "unknown"} keeps presenting sessions that do not exist; its unknown ids are read as signed out for now.`);
    }
    next();
    return;
  }

  let sess: Awaited<ReturnType<typeof Repository.getSession>>;
  try {
    sess = await Repository.getSession(sessionId);
  } catch (error) {
    lookup?.release(false);
    throw error;
  }
  if (sess) lookup?.release(true);
  else if (billed) deadSessions.remember(sessionId);
  if (sess) {
    req.userId = sess.userId;
    const user = await Repository.getUserById(sess.userId);
    if (user && user.IsActive && !user.IsLocked && !user.IsDeleted) {
      req.user = user;
      /**
       * The permission list joins the identity, instead of being re-read on
       * every single gated call.
       *
       * `requirePermission` runs in front of nearly every route, and it was the
       * one identity read with no cache — so each API call still paid for a
       * Firestore round trip even when the user and scopes were already known.
       * Every permission write announces an identity change, which clears this
       * cache immediately, so a revoked screen closes as fast as it ever did.
       */
      const [assigns, security] = await Promise.all([
        Repository.getUserAssigns(user.SystemUserId),
        Repository.getSecurityByUser(user.SystemUserId),
      ]);
      /* الكرسيُّ ومن يجلس عليه (docs/SEATS.md): الاسمُ في السجل والتوقيع اسمُ الجالس، وعضوُ
         الفريق بصفة فريقه ونطاقه. وجلسةُ عضوٍ لم يعد يعمل لا تُقرأ. */
      const identity = await seatIdentity(user, sess.memberId, assigns, security.map(item => Number(item.FormNameId)));
      if (!identity) {
        authCache.delete(sessionId);
        await Repository.deleteSession(sessionId);
        if (billed) deadSessions.remember(sessionId);
        next();
        return;
      }
      req.user = identity.user;
      req.scopes = identity.scopes;
      req.permissions = identity.permissions;
      authCache.set(sessionId, { at: Date.now(), userId: sess.userId, user: req.user, scopes: req.scopes || [], permissions: req.permissions });
      touchSession(sessionId, idleTtlMs);
      next();
      return;
    }
    authCache.delete(sessionId);
    await Repository.deleteSession(sessionId);
    if (billed) deadSessions.remember(sessionId);
  } else {
    authCache.delete(sessionId);
  }
  next();
}

/*
 * ── الرابطُ العام يُفتح في عالَمه ────────────────────────────────────────────
 *
 * صفحاتُ الروابط (/s /q /r /m) وواجهاتُها (/api/public/…) تُحلّ برمز الرابط لا
 * بالجلسة. فرمزٌ تجريبي («demo.…») يُربط بالصندوق الذي أنشأه — من المتصفّح
 * نفسه أو من هاتفٍ يشترك في التقويم — ولا يُبحث عنه في البيانات الحقيقية.
 * ورمزٌ حقيقي يُقرأ من البيانات الحقيقية ولو حمل المتصفّح جلسةً تجريبية، وتلك
 * الجلسة لا هويةَ لها هناك (authMiddleware). القاعدة: src/utils/demoLinkToken.ts.
 */
export function bindPublicLinkContext(req: Request, _res: Response, next: NextFunction) {
  const token = publicLinkTokenFromPath(req.originalUrl);
  const sessionId = isDemoLinkToken(token) ? Repository.demoSandboxForLinkToken(token) : "";
  if (!sessionId) { next(); return; }
  (req as AuthenticatedRequest).demoSessionId = sessionId;
  if (!Repository.runDemoSandbox(sessionId, next)) next();
}

// System administration is a showroom in demo: readable, never mutable. This is
// server-side enforcement, so removing `disabled` in DevTools still cannot change it.
export const DEMO_READ_ONLY_PREFIXES = ["/users", "/permissions", "/user-scopes", "/system-backup", "/admin/teaching-load"];

/*
 * ── «سجّل الدخول» لمن لا حسابَ له: الجلسةُ التجريبية المفقودة ─────────────────
 *
 * الصندوقُ التجريبيُّ في ذاكرة الخادم. فإن انقضت ساعتُه أو أُعيد تشغيلُ الخادم
 * (نشرُ نسخةٍ جديدة) ضاع، وصار كلُّ طلبٍ من المجرِّب يُردّ «الرجاء تسجيل الدخول
 * أولاً» — لمن لم يملك حساباً قطّ، وفي منتصف دورةٍ يؤدّيها. وقد وقع هذا في
 * البروفة الحيّة بعد نشرٍ جرى أثناءها. فيُقال له ما حدث وما يفعل.
 */
export const DEMO_SESSION_GONE = "انتهت الجلسة التجريبية أو أُعيد تشغيل الخادم فمُحيت بياناتها. ابدأ تجربةً جديدة من صفحة الدخول.";
export function signInRequiredMessage(req: Request): string {
  return String(getCookies(req)["session_id"] || "").startsWith("demo_") ? DEMO_SESSION_GONE : "الرجاء تسجيل الدخول أولاً";
}

// Require authenticated user
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: signInRequiredMessage(req) });
    return;
  }
  next();
}

// Screens that are intentionally reserved for the main administrator.
// The department scheduler keeps the operational schedule/search/report tools only.
const powerOnlyFormIds = new Set([2, 3, 4, 5, 11, 12, 15]);
export function isPowerUser(req: AuthenticatedRequest): boolean {
  return Boolean(req.user && (req.user.IsAdminUser || Number(req.user.SystemUserId) === ROOT_ADMIN_USER_ID));
}
export function requirePowerAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) { res.status(401).json({ error: signInRequiredMessage(req) }); return; }
  if (!isPowerUser(req)) { res.status(403).json({ error: "هذه الأداة مخصصة لإدارة النظام الرئيسية" }); return; }
  next();
}

export const ROOT_ADMIN_USER_ID = Math.max(1, Number(process.env.ROOT_ADMIN_USER_ID || 1) || 1);
export function requireRootAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) { res.status(401).json({ error: signInRequiredMessage(req) }); return; }
  if (Number(req.user.SystemUserId) !== ROOT_ADMIN_USER_ID) {
    res.status(403).json({ error: "هذه الخزنة مخصصة لحساب الإدارة الرئيسي فقط" });
    return;
  }
  next();
}

// Require Form permission
export function requirePermission(formNameId: number) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: signInRequiredMessage(req) });
      return;
    }
    // Keep the single department scheduler inside the operational workspace even if
    // an old FormSecurity record accidentally grants a legacy administrative screen.
    if (powerOnlyFormIds.has(formNameId) && !isPowerUser(req)) {
      res.status(403).json({ error: "هذه الشاشة مخصصة لإدارة النظام الرئيسية" });
      return;
    }
    // Legacy navigation is driven by FormSecurity even when IsAdminUser=true.
    // Resolved once per session by authMiddleware; the fallback covers a caller
    // that reached here without passing through it.
    const granted = req.permissions ?? (await Repository.getSecurityByUser(req.user.SystemUserId)).map(item => Number(item.FormNameId));
    const hasPerm = granted.includes(formNameId);
    if (!hasPerm) {
      res.status(403).json({ error: "ليس لديك صلاحية للوصول إلى هذا القسم" });
      return;
    }
    next();
  };
}

export function requireAnyPermission(formNameIds: number[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: signInRequiredMessage(req) });
      return;
    }
    if (formNameIds.every(id => powerOnlyFormIds.has(id)) && !isPowerUser(req)) {
      res.status(403).json({ error: "هذه الشاشة مخصصة لإدارة النظام الرئيسية" });
      return;
    }
    const granted = req.permissions ?? (await Repository.getSecurityByUser(req.user.SystemUserId)).map(item => Number(item.FormNameId));
    if (!granted.some(id => formNameIds.includes(id))) {
      res.status(403).json({ error: "ليس لديك صلاحية للوصول إلى هذا القسم" });
      return;
    }
    next();
  };
}
