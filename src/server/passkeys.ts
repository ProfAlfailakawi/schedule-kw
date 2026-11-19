/**
 * ── «الدخول بالبصمة»: مفاتيحُ المرور (WebAuthn) لمن يدخل البرنامج ────────────────
 *
 * الجهازُ يحفظ مفتاحاً خاصاً لا يغادره، ولا يُستعمل إلا بعد أن يتحقّق الجهازُ من صاحبه
 * (بصمة، وجه، أو رمز الجهاز). يحفظ الخادمُ المفتاحَ العامَّ وحده، فلا سرَّ عنده يُسرَق.
 *
 *   تسجيلُ جهاز (بجلسةٍ قائمة):  POST /api/passkeys/register/options  ثم  /register/verify
 *   قائمتي وإزالةُ جهاز:         GET  /api/passkeys     و     DELETE /api/passkeys/:ref
 *   الدخول (بلا جلسة):           POST /api/auth/passkey/login/options  ثم  /login/verify
 *
 * القرارات:
 *  - بيانات اعتمادٍ قابلةٌ للاكتشاف (residentKey) والتحقّقُ إلزاميّ: شاشةُ الدخول لا تسأل عن اسم.
 *  - التحدّي عشوائيّ، يُحفظ في الخادم، مربوطٌ بكوكي «ما قبل الجلسة»، لمرةٍ واحدةٍ وخمس دقائق.
 *  - الأصلُ والنطاقُ (origin / rpID) من قائمةٍ بيضاء (relyingPartyFor)، لا مما يرسله المتصفح.
 *  - بعد التحقّق تُطبَّق على الدخول بالبصمة كلُّ قاعدةٍ يطبّقها الدخولُ بكلمة السر: حسابٌ غيرُ فعّال أو
 *    مقفل أو محذوف، ومن عليه تغييرُ كلمته (لا يدخل بالبصمة حتى يختارها)، ثم الجلسةُ نفسُها
 *    (signIn في authRoutes.ts) وسطرُ السجلّ «تسجيل دخول» بطريقته.
 *  - إعادةُ تعيين كلمة السر من المسؤول، وإيقافُ الحساب أو قفلُه أو حذفُه، تُسقط مفاتيحَه (revokeUserPasskeys).
 *  - لا يُسجَّل في أيّ مكانٍ شيءٌ من مادة الاعتماد: لا المفتاحُ ولا المعرّف ولا الاستجابة.
 *  - في البيئة التجريبية المحلّية (DATA_MODE=demo) تُحفظ المفاتيحُ في ذاكرة العملية وحدها، بسقفٍ ومدّة،
 *    لا في صندوق الزائر ولا في بيانات العرض المشتركة؛ وفي الخادم الحقيقيّ لا تعمل الميزةُ داخل صندوق التجربة.
 */
import type { Express, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { createHash, randomBytes } from "crypto";
import {
  generateAuthenticationOptions, generateRegistrationOptions,
  verifyAuthenticationResponse, verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, AuthenticatorTransportFuture, RegistrationResponseJSON } from "@simplewebauthn/server";
import { Repository } from "../db/repository";
import type { FeatureCollection } from "../db/repository";
import { getCookies, requireAuth, type AuthenticatedRequest } from "./core/auth";

export const PASSKEY_LIMIT = 5;
export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;
/** من دخل بكلمة السر قبل أقلَّ من هذا يُسجّل جهازاً بلا إعادة كتابتها؛ بعده تُطلب. */
export const PASSKEY_FRESH_LOGIN_MS = 10 * 60 * 1000;
export const PASSKEY_RP_NAME = "SCHEDULE";
const CHALLENGE_COOKIE = "pk_challenge";
const DEMO_PASSKEY_CAP = 20;
const DEMO_PASSKEY_TTL_MS = 24 * 60 * 60 * 1000;

export const PASSKEY_MESSAGES = {
  unavailableHere: "الدخول بالبصمة غير متاح على هذا العنوان.",
  unavailableDemo: "الدخول بالبصمة غير متاح في البيئة التجريبية.",
  expired: "انتهت مهلة الطلب. اضغط الزر وأعد المحاولة.",
  verifyFailed: "تعذّر التحقق من البصمة. أعد المحاولة، أو ادخل بالاسم وكلمة السر.",
  notRegistered: "هذا الجهاز غير مسجَّل للدخول بالبصمة. ادخل بكلمة السر ثم فعّل البصمة من حسابك.",
  limit: `بلغتَ الحدّ الأقصى (${PASSKEY_LIMIT} أجهزة). أزل جهازاً لتضيف غيره.`,
  passwordNeeded: "أكّد كلمة السر لتفعيل الدخول بالبصمة على هذا الجهاز.",
  passwordWrong: "كلمة السر غير صحيحة.",
  memberLink: "الدخول بالبصمة لصاحب الحساب نفسه. عضو الفريق يدخل برابطه الشخصي.",
  changePasswordFirst: "اختر كلمة سرٍّ جديدة أولاً بالدخول بكلمة السر، ثم فعّل البصمة من جديد.",
  inactive: "هذا الحساب غير فعال",
  locked: "هذا الحساب مقفل",
  tooMany: "محاولات كثيرة جداً. حاول بعد دقيقة.",
} as const;

/* ── العنوان الذي تُقبل عليه المفاتيح ───────────────────────────────────────── */
export type RelyingParty = { rpID: string; origin: string };
const OFFICIAL_HOSTS = new Set(["schedule-kw.com", "www.schedule-kw.com"]);
const OFFICIAL_RP_ID = "schedule-kw.com";

/** الأصلُ والنطاقُ لعنوان الطلب، أو null إن لم يكن العنوانُ من القائمة البيضاء. */
export function relyingPartyFor(hostHeader: string, env: Record<string, string | undefined> = process.env): RelyingParty | null {
  const host = String(hostHeader || "").trim().toLowerCase();
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/.test(host)) return null;
  const hostname = host.replace(/:\d{1,5}$/, "");
  if (OFFICIAL_HOSTS.has(hostname)) return { rpID: OFFICIAL_RP_ID, origin: `https://${host}` };
  const extra = String(env.PASSKEY_EXTRA_HOSTS || "").split(",").map(item => item.trim().toLowerCase()).filter(Boolean);
  if (extra.includes(hostname)) return { rpID: hostname, origin: `https://${host}` };
  /* التطوير المحلي وحده: لا يُقبل «localhost» على خادمٍ يعمل بوضع الإنتاج. */
  if (hostname === "localhost" && env.NODE_ENV !== "production") return { rpID: "localhost", origin: `http://${host}` };
  return null;
}

/* ── المخزن: وثائق الميزات في القاعدة، أو ذاكرةُ العملية في العرض المحلي ───────── */
type Collection = Extract<FeatureCollection, "passkeys" | "passkeyChallenges">;
type Outcome<T, R> = { next: T; result: R } | { refuse: R };
type Store = {
  get<T>(collection: Collection, id: string): Promise<T | null>;
  list<T>(collection: Collection, prefix: string): Promise<T[]>;
  save<T>(collection: Collection, id: string, row: T): Promise<void>;
  update<T, R>(collection: Collection, id: string, fn: (current: T | null) => Outcome<T, R>): Promise<{ ok: true; result: R } | { ok: false; result: R }>;
  remove(collection: Collection, id: string): Promise<void>;
};

const demoMemory: Record<Collection, Map<string, any>> = { passkeys: new Map(), passkeyChallenges: new Map() };
function sweepDemoMemory(now = Date.now()) {
  for (const [id, row] of demoMemory.passkeyChallenges) if (Number(row?.expiresAt || 0) <= now) demoMemory.passkeyChallenges.delete(id);
  for (const [id, row] of demoMemory.passkeys) if (Number(row?.expiresAt || 0) <= now) demoMemory.passkeys.delete(id);
}
const memoryStore: Store = {
  async get(collection, id) { sweepDemoMemory(); return (demoMemory[collection].get(id) ?? null) as any; },
  async list(collection, prefix) { sweepDemoMemory(); return [...demoMemory[collection]].filter(([id]) => id.startsWith(prefix)).map(([, row]) => row) as any; },
  async save(collection, id, row) {
    sweepDemoMemory();
    if (collection === "passkeys" && !demoMemory.passkeys.has(id) && demoMemory.passkeys.size >= DEMO_PASSKEY_CAP) {
      const oldest = demoMemory.passkeys.keys().next().value;
      if (oldest !== undefined) demoMemory.passkeys.delete(oldest);
    }
    demoMemory[collection].set(id, row);
  },
  async update(collection, id, fn) {
    sweepDemoMemory();
    const out = fn((demoMemory[collection].get(id) ?? null) as any);
    if ("refuse" in out) return { ok: false, result: out.refuse };
    demoMemory[collection].set(id, out.next);
    return { ok: true, result: out.result };
  },
  async remove(collection, id) { demoMemory[collection].delete(id); },
};
const repositoryStore: Store = {
  get: (collection, id) => Repository.getFeatureDoc(collection, id),
  list: (collection, prefix) => Repository.listFeatureDocs(collection, prefix),
  async save(collection, id, row) { await Repository.saveFeatureDoc(collection, id, row); },
  async update(collection, id, fn) {
    const out = await Repository.updateFeatureDoc(collection, id, fn as any);
    return out.ok ? { ok: true, result: out.result as any } : { ok: false, result: out.result as any };
  },
  async remove(collection, id) { await Repository.deleteFeatureDoc(collection, id); },
};

/** المخزنُ الذي تُحفظ فيه المفاتيح الآن، أو null حيث لا تعمل الميزة (صندوقُ تجربةٍ داخل خادمٍ حقيقيّ). */
function storeNow(): Store | null {
  if (Repository.isDemoMode()) return memoryStore;
  if (Repository.isDemoRequest()) return null;
  return repositoryStore;
}

/* ── الوثائق ─────────────────────────────────────────────────────────────────── */
type PasskeyDoc = {
  id: string; credentialId: string; userId: number; publicKey: string; counter: number;
  transports: string[]; deviceType: string; backedUp: boolean; label: string;
  createdAt: string; lastUsedAt?: string; expiresAt?: number;
};
type ChallengeDoc = {
  id: string; kind: "login" | "register"; challenge: string; userId?: number; sessionId?: string;
  expiresAt: number; expiresAtTtl: Date; usedAt?: number;
};

const docIdOf = (userId: number, credentialId: string) => `${userId}.${credentialId}`;
const userPrefix = (userId: number) => `${userId}.`;
/** معرّفٌ قصيرٌ للعرض والحذف؛ لا يحمل معرّفَ الاعتماد نفسه فلا يدخل سجلَّ العمليات. */
export const passkeyRef = (credentialId: string) => createHash("sha256").update(credentialId).digest("hex").slice(0, 16);
const challengeKey = (token: string) => createHash("sha256").update(token).digest("hex");
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const CREDENTIAL_ID = /^[A-Za-z0-9_-]{16,1024}$/;
const USER_HANDLE = /^u(\d{1,9})$/;
const userHandleOf = (userId: number) => new TextEncoder().encode(`u${userId}`);
const fromB64url = (text: string) => new Uint8Array(Buffer.from(text, "base64url"));
const cleanLabel = (value: unknown) => String(value ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 40) || "جهاز";
const secure = () => (process.env.NODE_ENV === "production" ? "; Secure" : "");

function issueChallengeCookie(res: Response, token: string) {
  res.append("Set-Cookie", `${CHALLENGE_COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(PASSKEY_CHALLENGE_TTL_MS / 1000)}${secure()}`);
}
function clearChallengeCookie(res: Response) {
  res.append("Set-Cookie", `${CHALLENGE_COOKIE}=; Path=/api; HttpOnly; SameSite=Lax; Max-Age=0${secure()}`);
}

async function openChallenge(store: Store, res: Response, fields: Pick<ChallengeDoc, "kind" | "challenge" | "userId" | "sessionId">): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + PASSKEY_CHALLENGE_TTL_MS;
  const id = challengeKey(token);
  const row: ChallengeDoc = { id, ...fields, expiresAt, expiresAtTtl: new Date(expiresAt) };
  if (row.userId === undefined) delete row.userId;
  if (row.sessionId === undefined) delete row.sessionId;
  await store.save("passkeyChallenges", id, row);
  issueChallengeCookie(res, token);
}

/** يستهلك التحدّي ذرّياً: لمرةٍ واحدة، ضمن مهلته، ومن النوع المطلوب. */
async function takeChallenge(store: Store, req: Request, res: Response, kind: ChallengeDoc["kind"]): Promise<ChallengeDoc | null> {
  const token = String(getCookies(req)[CHALLENGE_COOKIE] || "");
  clearChallengeCookie(res);
  if (!TOKEN.test(token)) return null;
  const id = challengeKey(token);
  const taken = await store.update<ChallengeDoc, ChallengeDoc | null>("passkeyChallenges", id, current => {
    if (!current || current.usedAt || current.kind !== kind || Number(current.expiresAt) <= Date.now()) return { refuse: null };
    return { next: { ...current, usedAt: Date.now() }, result: current };
  });
  if (!taken.ok) return null;
  void store.remove("passkeyChallenges", id).catch(() => undefined);
  return taken.result;
}

export async function listUserPasskeys(userId: number): Promise<PasskeyDoc[]> {
  const store = storeNow();
  if (!store) return [];
  return (await store.list<PasskeyDoc>("passkeys", userPrefix(userId))).filter(row => Number(row.userId) === Number(userId));
}

/** يُسقط كلَّ مفاتيح حسابٍ (إعادة تعيين كلمة السر، إيقافٌ، قفلٌ، حذف). يُرجع عددَ ما أُسقط. */
export async function revokeUserPasskeys(userId: number): Promise<number> {
  const store = storeNow();
  if (!store) return 0;
  const rows = await listUserPasskeys(userId);
  for (const row of rows) await store.remove("passkeys", docIdOf(userId, row.credentialId));
  return rows.length;
}

const publicView = (row: PasskeyDoc) => ({
  ref: passkeyRef(row.credentialId), label: row.label, createdAt: row.createdAt,
  lastUsedAt: row.lastUsedAt || null, synced: Boolean(row.backedUp),
});

export type PasskeyDeps = {
  /** الدخولُ نفسُه الذي تفتحه كلمةُ السر: جلسةٌ وكوكي وحمولةُ الواجهة. يرسل الردّ. */
  signIn: (req: Request, res: Response, user: any) => Promise<void>;
  /** دخولُ العرض المحلي: صندوقٌ جديدٌ كزرّ «تجربة النظام». يرسل الردّ. */
  startDemo: (res: Response) => Promise<void>;
};

export function registerPasskeyRoutes(app: Express, deps: PasskeyDeps): void {
  const limiter = (limit: number) => rateLimit({ windowMs: 60_000, limit, standardHeaders: true, legacyHeaders: false, message: { error: PASSKEY_MESSAGES.tooMany } });
  const optionsLimit = limiter(20), verifyLimit = limiter(10);

  /** عنوانُ الطلب ومخزنُه، أو يردّ بالرفض ويرجع null. */
  const context = (req: Request, res: Response): { rp: RelyingParty; store: Store } | null => {
    const store = storeNow();
    if (!store) { res.status(403).json({ error: PASSKEY_MESSAGES.unavailableDemo, code: "passkey-unavailable" }); return null; }
    const rp = relyingPartyFor(String(req.get("host") || ""));
    if (!rp) { res.status(400).json({ error: PASSKEY_MESSAGES.unavailableHere, code: "passkey-unavailable" }); return null; }
    return { rp, store };
  };

  /* ── الدخول ──────────────────────────────────────────────────────────────── */
  app.post("/api/auth/passkey/login/options", optionsLimit, async (req: Request, res: Response) => {
    const ctx = context(req, res);
    if (!ctx) return;
    const options = await generateAuthenticationOptions({ rpID: ctx.rp.rpID, userVerification: "required", allowCredentials: [], timeout: 60_000 });
    await openChallenge(ctx.store, res, { kind: "login", challenge: options.challenge });
    res.setHeader("Cache-Control", "no-store");
    res.json(options);
  });

  app.post("/api/auth/passkey/login/verify", verifyLimit, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const ctx = context(req, res);
    if (!ctx) return;
    const refuse = (status: number, error: string, code: string) => { res.status(status).json({ error, code }); };
    const challenge = await takeChallenge(ctx.store, req, res, "login");
    if (!challenge) { refuse(400, PASSKEY_MESSAGES.expired, "challenge-expired"); return; }

    const response = req.body?.response as AuthenticationResponseJSON | undefined;
    const credentialId = String(response?.id || "");
    const handle = Buffer.from(String(response?.response?.userHandle || ""), "base64url").toString("utf8");
    const owner = USER_HANDLE.exec(handle);
    if (!response || !CREDENTIAL_ID.test(credentialId) || !owner) { refuse(400, PASSKEY_MESSAGES.verifyFailed, "verify-failed"); return; }
    const userId = Number(owner[1]);
    const stored = await ctx.store.get<PasskeyDoc>("passkeys", docIdOf(userId, credentialId));
    if (!stored || Number(stored.userId) !== userId || stored.credentialId !== credentialId) { refuse(400, PASSKEY_MESSAGES.notRegistered, "not-registered"); return; }

    let outcome;
    try {
      outcome = await verifyAuthenticationResponse({
        response, expectedChallenge: challenge.challenge, expectedOrigin: ctx.rp.origin, expectedRPID: ctx.rp.rpID,
        requireUserVerification: true,
        credential: { id: stored.credentialId, publicKey: fromB64url(stored.publicKey), counter: Number(stored.counter) || 0, transports: stored.transports as AuthenticatorTransportFuture[] },
      });
    } catch {
      res.locals.auditUser = { id: userId, name: "" };
      refuse(400, PASSKEY_MESSAGES.verifyFailed, "verify-failed");
      return;
    }
    if (!outcome.verified) { refuse(400, PASSKEY_MESSAGES.verifyFailed, "verify-failed"); return; }

    /* العدّاد يتقدّم ذرّياً: استجابةٌ بعدّادٍ لا يزيد (أو أُعيدت من نسخةٍ مستنسخة) تُرفض ولو تزامنت مع أخرى. */
    const newCounter = Number(outcome.authenticationInfo.newCounter) || 0;
    const advanced = await ctx.store.update<PasskeyDoc, boolean>("passkeys", docIdOf(userId, credentialId), current => {
      if (!current) return { refuse: false };
      const seen = Number(current.counter) || 0;
      if ((newCounter !== 0 || seen !== 0) && newCounter <= seen) return { refuse: false };
      return { next: { ...current, counter: newCounter, backedUp: Boolean(outcome.authenticationInfo.credentialBackedUp), lastUsedAt: new Date().toISOString() }, result: true };
    });
    if (!advanced.ok) { refuse(400, PASSKEY_MESSAGES.verifyFailed, "verify-failed"); return; }

    if (Repository.isDemoMode()) {
      res.locals.auditUser = { id: userId, name: "تجربة" };
      res.locals.auditChanges = "الدخول بالبصمة (تجربة)";
      await deps.startDemo(res);
      return;
    }
    const user = await Repository.getUserById(userId);
    if (!user || user.IsDeleted) { refuse(400, PASSKEY_MESSAGES.verifyFailed, "verify-failed"); return; }
    res.locals.auditUser = { id: Number(user.SystemUserId), name: String(user.Name || user.SystemUserLogin || "") };
    res.locals.auditChanges = "الدخول بالبصمة";
    if (!user.IsActive) { refuse(403, PASSKEY_MESSAGES.inactive, "account-inactive"); return; }
    if (user.IsLocked) { refuse(403, PASSKEY_MESSAGES.locked, "account-locked"); return; }
    if ((user as any).MustChangePassword) { refuse(403, PASSKEY_MESSAGES.changePasswordFirst, "password-change-required"); return; }
    await deps.signIn(req, res, user);
  });

  /* ── التسجيل (بجلسةٍ قائمة) ─────────────────────────────────────────────── */
  app.post("/api/passkeys/register/options", optionsLimit, requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const ctx = context(req, res);
    if (!ctx) return;
    const user = req.user;
    const sessionId = String(getCookies(req)["session_id"] || "");
    const demoLocal = Repository.isDemoMode();
    if (!demoLocal) {
      const session = await Repository.getSession(sessionId);
      if (!session) { res.status(401).json({ error: "الرجاء تسجيل الدخول أولاً" }); return; }
      /* جلسةُ عضو الفريق برابطه ليست صاحبَ الحساب: لا تُربط بالحساب بصمةٌ منها. */
      if (session.memberId) { res.status(403).json({ error: PASSKEY_MESSAGES.memberLink, code: "member-session" }); return; }
      /* جلسةٌ مسروقةٌ لا تزرع بصمةً دائمة: من لم يدخل للتوّ يُعيد كتابة كلمة سرّه. */
      if (Date.now() - Number(session.createdAt || 0) > PASSKEY_FRESH_LOGIN_MS) {
        const password = String(req.body?.password ?? "");
        if (!password) { res.status(403).json({ error: PASSKEY_MESSAGES.passwordNeeded, code: "password-required" }); return; }
        const fresh = await Repository.getUserById(Number(user.SystemUserId));
        if (!fresh || !Repository.verifyPassword(password, fresh.SystemUserPass)) { res.status(403).json({ error: PASSKEY_MESSAGES.passwordWrong, code: "password-wrong" }); return; }
      }
    }
    const userId = Number(user.SystemUserId);
    const existing = await listUserPasskeys(userId);
    if (existing.length >= PASSKEY_LIMIT) { res.status(409).json({ error: PASSKEY_MESSAGES.limit, code: "passkey-limit" }); return; }
    const options = await generateRegistrationOptions({
      rpName: PASSKEY_RP_NAME, rpID: ctx.rp.rpID,
      userName: String(user.SystemUserLogin || `u${userId}`), userDisplayName: String(user.Name || user.SystemUserLogin || `u${userId}`),
      userID: userHandleOf(userId), attestationType: "none", timeout: 60_000,
      excludeCredentials: existing.map(row => ({ id: row.credentialId, transports: row.transports as AuthenticatorTransportFuture[] })),
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      supportedAlgorithmIDs: [-7, -257],
    });
    await openChallenge(ctx.store, res, { kind: "register", challenge: options.challenge, userId, sessionId });
    res.json(options);
  });

  app.post("/api/passkeys/register/verify", verifyLimit, requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const ctx = context(req, res);
    if (!ctx) return;
    const userId = Number(req.user.SystemUserId);
    const sessionId = String(getCookies(req)["session_id"] || "");
    const challenge = await takeChallenge(ctx.store, req, res, "register");
    if (!challenge || Number(challenge.userId) !== userId || challenge.sessionId !== sessionId) { res.status(400).json({ error: PASSKEY_MESSAGES.expired, code: "challenge-expired" }); return; }
    let verified;
    try {
      verified = await verifyRegistrationResponse({
        response: req.body?.response as RegistrationResponseJSON, expectedChallenge: challenge.challenge,
        expectedOrigin: ctx.rp.origin, expectedRPID: ctx.rp.rpID, requireUserVerification: true,
      });
    } catch {
      res.status(400).json({ error: PASSKEY_MESSAGES.verifyFailed, code: "verify-failed" });
      return;
    }
    if (!verified.verified || !verified.registrationInfo) { res.status(400).json({ error: PASSKEY_MESSAGES.verifyFailed, code: "verify-failed" }); return; }
    const info = verified.registrationInfo;
    const label = cleanLabel(req.body?.label);
    const docId = docIdOf(userId, info.credential.id);
    const row: PasskeyDoc = {
      id: docId, credentialId: info.credential.id, userId, publicKey: Buffer.from(info.credential.publicKey).toString("base64url"),
      counter: Number(info.credential.counter) || 0, transports: (info.credential.transports || []) as string[],
      deviceType: String(info.credentialDeviceType), backedUp: Boolean(info.credentialBackedUp), label, createdAt: new Date().toISOString(),
      ...(Repository.isDemoMode() ? { expiresAt: Date.now() + DEMO_PASSKEY_TTL_MS } : {}),
    };
    /* السقفُ يُفحص عند الحفظ أيضاً: خياران متزامنان لا يتجاوزان خمسةً. */
    const current = await listUserPasskeys(userId);
    if (current.length >= PASSKEY_LIMIT && !current.some(item => item.credentialId === row.credentialId)) { res.status(409).json({ error: PASSKEY_MESSAGES.limit, code: "passkey-limit" }); return; }
    await ctx.store.save("passkeys", docId, row);
    res.locals.auditChanges = `تفعيل الدخول بالبصمة على جهاز «${label}»`;
    res.json({ ok: true, passkey: publicView(row) });
  });

  /* ── قائمتي وإزالة جهاز ─────────────────────────────────────────────────── */
  app.get("/api/passkeys", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const available = Boolean(storeNow() && relyingPartyFor(String(req.get("host") || "")));
    const items = available ? (await listUserPasskeys(Number(req.user.SystemUserId))).map(publicView) : [];
    res.json({ available, limit: PASSKEY_LIMIT, items });
  });

  app.delete("/api/passkeys/:ref", verifyLimit, requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const store = storeNow();
    if (!store) { res.status(403).json({ error: PASSKEY_MESSAGES.unavailableDemo, code: "passkey-unavailable" }); return; }
    const userId = Number(req.user.SystemUserId);
    const target = (await listUserPasskeys(userId)).find(row => passkeyRef(row.credentialId) === String(req.params.ref));
    if (!target) { res.status(404).json({ error: "هذا الجهاز غير موجود في قائمتك." }); return; }
    await store.remove("passkeys", docIdOf(userId, target.credentialId));
    res.locals.auditChanges = `إزالة الدخول بالبصمة من جهاز «${target.label}»`;
    res.json({ ok: true });
  });
}
