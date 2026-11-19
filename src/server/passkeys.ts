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
 *  - ولمدير النظام في «الفرق» زرُّ «أسقط البصمة» لرئيس الفريق (POST /api/seats/:id/passkeys/revoke): يُسقطها وحدها،
 *    بلا كلمة سرٍّ ولا جلسات؛ ويرى عددَ الأجهزة وحده (countUserPasskeys)، لا معرّفاتها ولا أسماءها.
 *  - عضوُ الفريق (أو نائبُه) يسجّل أجهزته من جلسة رابطه وهي طازجة، لصاحبٍ مستقلّ (الكرسي + العضو، مقبض «m…»)،
 *    ويدخل بها إلى جلسة العضو نفسِها (حارسُه ونطاقُه وحالتُه)؛ ولا يفتح مفتاحُه جلسةَ الرئيس ولا العكس.
 *    الدخولُ يفحص أن الكرسيَّ فعّال والعضويةَ فعّالة الآن، وتسقط مفاتيحُه بإعادة تعيين دخوله، وانتهاءِ عضويته،
 *    وتسليمِ الرئاسة، و«أسقط البصمة» بجانب اسمه (POST /api/seats/:id/members/:mid/passkeys/revoke).
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
import { readSeatLedger, updateSeatLedger } from "./seats";
import { isSeatRole } from "../utils/seats";
import { AR, countOf } from "../utils/arabicCount";

export const PASSKEY_LIMIT = 5;
export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;
/** من دخل بكلمة السر قبل أقلَّ من هذا يُسجّل جهازاً بلا إعادة كتابتها؛ بعده تُطلب. */
export const PASSKEY_FRESH_LOGIN_MS = 10 * 60 * 1000;
export const PASSKEY_RP_NAME = "SCHEDULE";
const CHALLENGE_COOKIE = "pk_challenge";
/** كلماتٌ خاطئة عند تسجيل جهاز: خمسٌ في الدقيقة لكل حساب، كحدّ الدخول العاديّ (authRoutes.rateLimitLogin). */
const WRONG_ENTRY_TRIES = 5;
const WRONG_ENTRY_WINDOW_MS = 60_000;
const wrongEntryFailures = new Map<number, { count: number; at: number }>();
const DEMO_PASSKEY_CAP = 20;
const DEMO_PASSKEY_TTL_MS = 24 * 60 * 60 * 1000;

export const PASSKEY_MESSAGES = {
  unavailableHere: "الدخول بالبصمة غير متاح على هذا العنوان.",
  unavailableDemo: "الدخول بالبصمة غير متاح في البيئة التجريبية.",
  expired: "انتهت مهلة الطلب. اضغط الزر وأعد المحاولة.",
  verifyFailed: "تعذّر التحقق من البصمة. أعد المحاولة، أو ادخل بالاسم وكلمة السر.",
  notRegistered: "هذا الجهاز غير مسجَّل للدخول بالبصمة. ادخل بكلمة السر ثم فعّل البصمة من حسابك.",
  duplicate: "هذا الجهاز مسجَّل لحسابك من قبل.",
  limit: `بلغتَ الحدّ الأقصى (${countOf(PASSKEY_LIMIT, AR.device)}). أزل جهازاً لتضيف غيره.`,
  passwordNeeded: "أكّد كلمة السر لتفعيل الدخول بالبصمة على هذا الجهاز.",
  passwordWrong: "كلمة السر غير صحيحة.",
  memberLink: "الدخول بالبصمة لصاحب الحساب نفسه. عضو الفريق يدخل برابطه الشخصي.",
  memberFresh: "ادخل من رابطك الشخصي من جديد، ثم فعّل البصمة خلال عشر دقائق.",
  memberInactive: "عضويتك في هذا الفريق لم تعد فعّالة. اطلب رابطاً من رئيس الفريق.",
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
type Collection = Extract<FeatureCollection, "passkeys" | "passkeyChallenges" | "passkeyState">;
type Outcome<T, R> = { next: T; result: R } | { refuse: R };
type Store = {
  get<T>(collection: Collection, id: string): Promise<T | null>;
  save<T>(collection: Collection, id: string, row: T): Promise<void>;
  update<T, R>(collection: Collection, id: string, fn: (current: T | null) => Outcome<T, R>): Promise<{ ok: true; result: R } | { ok: false; result: R }>;
  remove(collection: Collection, id: string): Promise<void>;
};

const demoMemory: Record<Collection, Map<string, any>> = { passkeys: new Map(), passkeyChallenges: new Map(), passkeyState: new Map() };
function sweepDemoMemory(now = Date.now()) {
  for (const [id, row] of demoMemory.passkeyChallenges) if (Number(row?.expiresAt || 0) <= now) demoMemory.passkeyChallenges.delete(id);
  for (const [id, row] of demoMemory.passkeys) if (Number(row?.expiresAt || 0) <= now) demoMemory.passkeys.delete(id);
}
const memoryStore: Store = {
  async get(collection, id) { sweepDemoMemory(); return (demoMemory[collection].get(id) ?? null) as any; },
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
  createdAt: string; createdAtMs: number; lastUsedAt?: string; expiresAt?: number; demoOwner?: string;
  /** عضوُ فريقٍ على الكرسي userId: مفتاحُه له وحده، لا يفتح جلسةَ الرئيس ولا مفتاحُ الرئيس جلستَه. */
  memberId?: string;
};
/** حالةُ مفاتيح حساب: ما سُجّل منها (السقفُ يُحسب هنا ذرّياً)، و«حدُّ الإسقاط»: كلُّ مفتاحٍ أقدمُ منه ساقط ولو بقيت وثيقتُه. */
type StateDoc = { id: string; userId: number; memberId?: string; revokedAt: number; credentialIds: string[] };
type ChallengeDoc = {
  id: string; kind: "login" | "register"; challenge: string; userId?: number; memberId?: string; sessionHash?: string;
  expiresAt: number; expiresAtTtl: Date; usedAt?: number;
};

/**
 * صاحبُ المفاتيح: حسابٌ (userId)، أو عضوُ فريقٍ على كرسيّ (userId الكرسي + memberId).
 * لكلٍّ منهما وثائقُه وحالتُه وحدُّ إسقاطه ومقبضُه، فلا يدخل أحدُهما بمفتاح الآخر.
 */
type Principal = { userId: number; memberId?: string };
const keyOf = (p: Principal) => (p.memberId ? `${p.userId}~${p.memberId}` : String(p.userId));
const docIdOf = (p: Principal, credentialId: string) => `${keyOf(p)}.${credentialId}`;
const samePrincipal = (row: { userId: number; memberId?: string }, p: Principal) => Number(row.userId) === Number(p.userId) && String(row.memberId || "") === String(p.memberId || "");
/** معرّفٌ قصيرٌ للعرض والحذف؛ لا يحمل معرّفَ الاعتماد نفسه فلا يدخل سجلَّ العمليات. */
export const passkeyRef = (credentialId: string) => createHash("sha256").update(credentialId).digest("hex").slice(0, 16);
const challengeKey = (token: string) => createHash("sha256").update(token).digest("hex");
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const CREDENTIAL_ID = /^[A-Za-z0-9_-]{16,1024}$/;
const USER_HANDLE = /^u(\d{1,9})$/;
const MEMBER_HANDLE = /^m(\d{1,9})\.([A-Za-z0-9_-]{1,40})$/;
const MEMBER_ID = /^[A-Za-z0-9_-]{1,40}$/;
const userHandleOf = (p: Principal) => new TextEncoder().encode(p.memberId ? `m${p.userId}.${p.memberId}` : `u${p.userId}`);
/** المقبضُ الذي حفظه الجهاز: «u12» للحساب، و«m12.m_ab…» لعضوٍ في فريق الكرسي 12. */
function principalFromHandle(handle: string): Principal | null {
  const user = USER_HANDLE.exec(handle);
  if (user) return { userId: Number(user[1]) };
  const member = MEMBER_HANDLE.exec(handle);
  return member ? { userId: Number(member[1]), memberId: member[2] } : null;
}
const fromB64url = (text: string) => new Uint8Array(Buffer.from(text, "base64url"));
const cleanLabel = (value: unknown) => String(value ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 40) || "جهاز";
const secure = () => (process.env.NODE_ENV === "production" ? "; Secure" : "");

function issueChallengeCookie(res: Response, token: string) {
  res.append("Set-Cookie", `${CHALLENGE_COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(PASSKEY_CHALLENGE_TTL_MS / 1000)}${secure()}`);
}
function clearChallengeCookie(res: Response) {
  res.append("Set-Cookie", `${CHALLENGE_COOKIE}=; Path=/api; HttpOnly; SameSite=Lax; Max-Age=0${secure()}`);
}

async function openChallenge(store: Store, res: Response, fields: Pick<ChallengeDoc, "kind" | "challenge" | "userId" | "sessionHash">): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + PASSKEY_CHALLENGE_TTL_MS;
  const id = challengeKey(token);
  const row: ChallengeDoc = { id, ...fields, expiresAt, expiresAtTtl: new Date(expiresAt) };
  if (row.userId === undefined) delete row.userId;
  if (row.sessionHash === undefined) delete row.sessionHash;
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

/** مَن يملك المفاتيح في العرض المحلي: جلسةُ الزائر نفسُها، فلا يرى زائرٌ أسماءَ غيره (الصناديق تتشارك رقمَ الحساب). */
const demoOwnerOf = (sessionId: string): string => (Repository.isDemoMode() ? challengeKey(sessionId || "-") : "");
const stateIdOf = (p: Principal, owner = "") => (owner ? `${keyOf(p)}.${owner}` : keyOf(p));
const emptyState = (p: Principal, owner = ""): StateDoc => ({ id: stateIdOf(p, owner), userId: p.userId, ...(p.memberId ? { memberId: p.memberId } : {}), revokedAt: 0, credentialIds: [] });

async function readState(store: Store, p: Principal, owner = ""): Promise<StateDoc> {
  const row = await store.get<StateDoc>("passkeyState", stateIdOf(p, owner));
  return row ? { ...row, credentialIds: Array.isArray(row.credentialIds) ? row.credentialIds : [] } : emptyState(p, owner);
}

/** مفاتيحُ صاحبها الصالحة: المسجَّلةُ في حالته، وما بعد حدّ الإسقاط. تكلفتُها بعددها (≤5) لا بحجم المجموعة. */
async function listPasskeys(p: Principal, sessionId = ""): Promise<PasskeyDoc[]> {
  const store = storeNow();
  if (!store) return [];
  const owner = demoOwnerOf(sessionId);
  const state = await readState(store, p, owner);
  const rows = await Promise.all(state.credentialIds.map(id => store.get<PasskeyDoc>("passkeys", docIdOf(p, id))));
  return rows.filter((row): row is PasskeyDoc => Boolean(row) && samePrincipal(row!, p) && Number(row!.createdAtMs || 0) > state.revokedAt);
}
export const listUserPasskeys = (userId: number, sessionId = "") => listPasskeys({ userId }, sessionId);

/**
 * عددُ أجهزة الحساب لمدير النظام في «الفرق»: عددٌ فقط، بقراءةٍ واحدة من حالة الحساب،
 * لا معرّفاتٌ ولا أسماءُ أجهزة. الإسقاطُ يفرّغ القائمة، فما فيها هو الصالح.
 */
async function countPasskeys(p: Principal): Promise<number> {
  if (!Number(p.userId)) return 0;
  /* بالمرشّح نفسه الذي يقرأ به الدخولُ والقائمة: ما قبل حدّ الإسقاط لا يُعدّ. */
  return (await listPasskeys(p)).length;
}
export const countUserPasskeys = (userId: number) => countPasskeys({ userId: Number(userId) });
/** عددُ أجهزة عضوٍ في فريق الكرسي seatId — عددٌ فقط كذلك. */
export const countMemberPasskeys = (seatId: number, memberId: string) => (MEMBER_ID.test(String(memberId)) ? countPasskeys({ userId: Number(seatId), memberId: String(memberId) }) : Promise.resolve(0));

/**
 * يُسقط كلَّ مفاتيح حسابٍ (إعادة تعيين كلمة السر، تغييرُها، إيقافٌ، قفلٌ، حذف، تسليمُ كرسي، استعادة).
 * الإسقاطُ علامةٌ تُكتب أولاً وتُفحص عند كل دخول — فإن تعذّرت الكتابةُ يُرمى الخطأ ولا يُبتلع (يُغلق الباب لا يُفتح)،
 * وحذفُ الوثائق بعدها تنظيفٌ يُسجَّل فشلُه ولا يغيّر الحكم. في العرض المحلي لا حسابَ يُسقط (الصناديقُ تتبدّد).
 */
async function revokePasskeys(p: Principal): Promise<number> {
  if (Repository.isDemoMode()) return 0;
  const store = storeNow();
  if (!store) return 0;
  const out = await store.update<StateDoc, string[]>("passkeyState", stateIdOf(p), current => {
    const base: StateDoc = current || emptyState(p);
    return { next: { ...base, revokedAt: Math.max(Date.now(), Number(base.revokedAt || 0) + 1), credentialIds: [] }, result: base.credentialIds || [] };
  });
  if (!out.ok) throw new Error("تعذّر إسقاط مفاتيح الدخول بالبصمة");
  for (const id of out.result) {
    try { await store.remove("passkeys", docIdOf(p, id)); }
    catch { console.error("[passkeys] cleanup of a revoked credential failed; it stays invalid by the revocation mark"); }
  }
  return out.result.length;
}
export const revokeUserPasskeys = (userId: number) => revokePasskeys({ userId: Number(userId) });
/**
 * يُسقط مفاتيحَ عضوٍ في فريق الكرسي: إسقاطُ البصمة من «الفرق»، وإعادةُ تعيين دخوله، وانتهاءُ عضويته،
 * وتسليمُ الرئاسة (يُجمَّد الفريق). الحكمُ كحكم الحساب: علامةُ إسقاطٍ تُفحص عند كل دخول.
 */
export const revokeMemberPasskeys = (seatId: number, memberId: string) => (MEMBER_ID.test(String(memberId)) ? revokePasskeys({ userId: Number(seatId), memberId: String(memberId) }) : Promise.resolve(0));

/**
 * يُسقط بصمةَ كلِّ عضوٍ لم تنتهِ عضويته في فريق الكرسي (قفلُ حساب الرئيس أو إيقافُه أو إعادةُ تعيين كلمته من
 * شاشة المستخدمين، وحذفُه، وتسليمُ الرئاسة). يحاول الجميعَ ثم يرمي إن تعذّر أحدُهم: لا يُبتلع الخطأ.
 */
export async function revokeSeatMembersPasskeys(seatId: number, members?: Array<{ id: string; status: string }>): Promise<number> {
  const list = members ?? (await readSeatLedger(Number(seatId)))?.members ?? [];
  const results = await Promise.allSettled(list.filter(member => member.status !== "ended").map(member => revokeMemberPasskeys(Number(seatId), member.id)));
  const failures = results.filter(row => row.status === "rejected");
  if (failures.length) throw new Error(`تعذّر إسقاط بصمة ${failures.length} من أعضاء الفريق`);
  return results.reduce((sum, row) => sum + (row.status === "fulfilled" ? row.value : 0), 0);
}

const publicView = (row: PasskeyDoc) => ({
  ref: passkeyRef(row.credentialId), label: row.label, createdAt: row.createdAt,
  lastUsedAt: row.lastUsedAt || null, synced: Boolean(row.backedUp),
});

/** الجلسةُ ما زالت قائمةً لصاحبها، والحسابُ فعّال، والعضويةُ (إن كان عضواً) فعّالة. العرضُ المحلي لا يُفحص. */
async function stillEntitled(p: Principal, sessionId: string): Promise<boolean> {
  if (Repository.isDemoMode()) return true;
  const session = sessionId ? await Repository.getSession(sessionId) : undefined;
  if (!session || Number(session.userId) !== Number(p.userId) || String(session.memberId || "") !== String(p.memberId || "")) return false;
  const user = await Repository.getUserById(p.userId);
  if (!user || user.IsDeleted || !user.IsActive || user.IsLocked) return false;
  if (!p.memberId) return true;
  const member = (await readSeatLedger(p.userId))?.members.find(row => row.id === p.memberId);
  return Boolean(member && member.status === "active");
}

/** صاحبُ المفاتيح في هذه الجلسة: عضوُ الفريق (أو نائبُه) برابطه، أو صاحبُ الحساب. */
function principalOfRequest(req: AuthenticatedRequest): Principal {
  const actor = (req.user as any)?.SeatActor;
  const memberId = actor && actor.kind !== "holder" && MEMBER_ID.test(String(actor.memberId || "")) ? String(actor.memberId) : "";
  return memberId ? { userId: Number(req.user.SystemUserId), memberId } : { userId: Number(req.user.SystemUserId) };
}

export type PasskeyDeps = {
  /** الدخولُ نفسُه الذي تفتحه كلمةُ السر: جلسةٌ وكوكي وحمولةُ الواجهة. يرسل الردّ.
   *  ومع memberId: جلسةُ العضو نفسُها التي يفتحها رابطُه الشخصي (حارسُ العضو ونطاقُه وحالتُه). */
  signIn: (req: Request, res: Response, user: any, memberId?: string) => Promise<void>;
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
  /* الدخولُ بلا جلسة: يجري خارج أيّ صندوق تجربةٍ يحمله كوكي قديمٌ في المتصفح (demo_…)، فلا يُردّ «غير متاح» لمن يريد الدخول الحقيقي. */
  const outside = (handler: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: (error?: unknown) => void) => {
    void Repository.outsideDemoSandbox(() => handler(req, res)).catch(next);
  };
  app.post("/api/auth/passkey/login/options", optionsLimit, outside(async (req: Request, res: Response) => {
    const ctx = context(req, res);
    if (!ctx) return;
    const options = await generateAuthenticationOptions({ rpID: ctx.rp.rpID, userVerification: "required", allowCredentials: [], timeout: 60_000 });
    await openChallenge(ctx.store, res, { kind: "login", challenge: options.challenge });
    res.setHeader("Cache-Control", "no-store");
    res.json(options);
  }));

  app.post("/api/auth/passkey/login/verify", verifyLimit, outside(async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const ctx = context(req, res);
    if (!ctx) return;
    const refuse = (status: number, error: string, code: string) => { res.status(status).json({ error, code }); };
    const challenge = await takeChallenge(ctx.store, req, res, "login");
    if (!challenge) { refuse(400, PASSKEY_MESSAGES.expired, "challenge-expired"); return; }

    const response = req.body?.response as AuthenticationResponseJSON | undefined;
    const credentialId = String(response?.id || "");
    const handle = Buffer.from(String(response?.response?.userHandle || ""), "base64url").toString("utf8");
    const principal = principalFromHandle(handle);
    if (!response || !CREDENTIAL_ID.test(credentialId) || !principal) { refuse(400, PASSKEY_MESSAGES.verifyFailed, "verify-failed"); return; }
    const userId = principal.userId;
    const stored = await ctx.store.get<PasskeyDoc>("passkeys", docIdOf(principal, credentialId));
    /* مفتاحٌ أسقطه صاحبُه (حدُّ الإسقاط) لا يدخل ولو بقيت وثيقتُه؛ وقراءةُ الحدّ إن تعذّرت تُردّ الدخولَ لا تفتحه.
       ومفتاحُ العضو لا يفتح جلسةَ الرئيس ولا العكس: الوثيقةُ تحمل صاحبَها، ويُطابَق مع المقبض. */
    const state = stored ? await readState(ctx.store, principal, String(stored.demoOwner || "")) : null;
    if (!stored || !samePrincipal(stored, principal) || stored.credentialId !== credentialId || Number(stored.createdAtMs || 0) <= Number(state?.revokedAt || 0)) { refuse(400, PASSKEY_MESSAGES.notRegistered, "not-registered"); return; }

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
    const advanced = await ctx.store.update<PasskeyDoc, boolean>("passkeys", docIdOf(principal, credentialId), current => {
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
    if (principal.memberId) {
      /* عضوُ الفريق: ما يفحصه رابطُه الشخصي — كرسيٌّ قائمٌ فعّال، وعضويةٌ فعّالة الآن — ثم جلستُه نفسُها. */
      if (user.IsAdminUser || !isSeatRole((user as any).Role) || !user.IsActive || user.IsLocked) { refuse(403, PASSKEY_MESSAGES.memberInactive, "member-inactive"); return; }
      const member = (await readSeatLedger(userId))?.members.find(row => row.id === principal.memberId);
      if (!member || member.status !== "active") { refuse(403, PASSKEY_MESSAGES.memberInactive, "member-inactive"); return; }
      res.locals.auditChanges = `الدخول بالبصمة: ${member.name}`;
      const at = new Date().toISOString();
      await updateSeatLedger(userId, ledger => ({
        next: { ...ledger, members: ledger.members.map(row => row.id === member.id ? { ...row, firstEnteredAt: row.firstEnteredAt || at, lastEnteredAt: at } : row) },
        result: true,
      })).catch(() => undefined);
      await deps.signIn(req, res, user, member.id);
      return;
    }
    if (!user.IsActive) { refuse(403, PASSKEY_MESSAGES.inactive, "account-inactive"); return; }
    if (user.IsLocked) { refuse(403, PASSKEY_MESSAGES.locked, "account-locked"); return; }
    if ((user as any).MustChangePassword) { refuse(403, PASSKEY_MESSAGES.changePasswordFirst, "password-change-required"); return; }
    await deps.signIn(req, res, user);
  }));

  /* ── التسجيل (بجلسةٍ قائمة) ─────────────────────────────────────────────── */
  app.post("/api/passkeys/register/options", optionsLimit, requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const ctx = context(req, res);
    if (!ctx) return;
    const user = req.user;
    const sessionId = String(getCookies(req)["session_id"] || "");
    const demoLocal = Repository.isDemoMode();
    const principal = principalOfRequest(req);
    if (!demoLocal) {
      const session = await Repository.getSession(sessionId);
      if (!session) { res.status(401).json({ error: "الرجاء تسجيل الدخول أولاً" }); return; }
      /* جلسةُ العضو تسجّل لصاحبها (العضو نفسه)، لا للحساب: والجلسةُ والهويةُ المقروءة متطابقتان. */
      if (String(session.memberId || "") !== String(principal.memberId || "")) { res.status(403).json({ error: PASSKEY_MESSAGES.memberLink, code: "member-session" }); return; }
      /* العضوُ بلا كلمة سرّ: جلسةٌ مسروقةٌ لا تزرع له بصمة، فيُسجّل من دخل برابطه للتوّ. */
      if (principal.memberId && Date.now() - Number(session.createdAt || 0) > PASSKEY_FRESH_LOGIN_MS) {
        res.locals.quietRefusal = true; res.status(403).json({ error: PASSKEY_MESSAGES.memberFresh, code: "member-fresh" }); return;
      }
      /* جلسةٌ مسروقةٌ لا تزرع بصمةً دائمة: من لم يدخل للتوّ يُعيد كتابة كلمة سرّه. */
      if (!principal.memberId && Date.now() - Number(session.createdAt || 0) > PASSKEY_FRESH_LOGIN_MS) {
        const password = String(req.body?.password ?? "");
        if (!password) { res.locals.quietRefusal = true; res.status(403).json({ error: PASSKEY_MESSAGES.passwordNeeded, code: "password-required" }); return; }
        /* كلمةٌ خاطئة تُعدّ لكل حساب كما يعدّ الدخولُ العاديّ (خمسٌ في الدقيقة)، وتُسجَّل في سجلّ العمليات. */
        const tries = wrongEntryFailures.get(Number(user.SystemUserId));
        if (tries && tries.count >= WRONG_ENTRY_TRIES && Date.now() - tries.at < WRONG_ENTRY_WINDOW_MS) { res.status(429).json({ error: PASSKEY_MESSAGES.tooMany, code: "too-many" }); return; }
        const fresh = await Repository.getUserById(Number(user.SystemUserId));
        if (!fresh || !Repository.verifyPassword(password, fresh.SystemUserPass)) {
          const now = Date.now();
          wrongEntryFailures.set(Number(user.SystemUserId), { count: tries && now - tries.at < WRONG_ENTRY_WINDOW_MS ? tries.count + 1 : 1, at: now });
          res.locals.auditChanges = "كلمة سر خاطئة عند تفعيل الدخول بالبصمة";
          res.status(403).json({ error: PASSKEY_MESSAGES.passwordWrong, code: "password-wrong" });
          return;
        }
        wrongEntryFailures.delete(Number(user.SystemUserId));
      }
    }
    const userId = Number(user.SystemUserId);
    const existing = await listPasskeys(principal, sessionId);
    if (existing.length >= PASSKEY_LIMIT) { res.locals.quietRefusal = true; res.status(409).json({ error: PASSKEY_MESSAGES.limit, code: "passkey-limit" }); return; }
    /* العضوُ يرى في منتقي الجهاز اسمَه والفريق، لا اسمَ دخول الكرسي. */
    const userName = principal.memberId ? `${String(user.Name || "عضو")} · ${String(user.SeatName || user.SystemUserLogin || "")}`.slice(0, 64) : String(user.SystemUserLogin || `u${userId}`);
    const options = await generateRegistrationOptions({
      rpName: PASSKEY_RP_NAME, rpID: ctx.rp.rpID,
      userName, userDisplayName: principal.memberId ? userName : String(user.Name || user.SystemUserLogin || `u${userId}`),
      userID: userHandleOf(principal), attestationType: "none", timeout: 60_000,
      excludeCredentials: existing.map(row => ({ id: row.credentialId, transports: row.transports as AuthenticatorTransportFuture[] })),
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      supportedAlgorithmIDs: [-7, -257],
    });
    await openChallenge(ctx.store, res, { kind: "register", challenge: options.challenge, userId, ...(principal.memberId ? { memberId: principal.memberId } : {}), sessionHash: challengeKey(sessionId) });
    res.json(options);
  });

  app.post("/api/passkeys/register/verify", verifyLimit, requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const ctx = context(req, res);
    if (!ctx) return;
    if (await sessionMismatch(req, res)) return;
    const principal = principalOfRequest(req);
    const userId = principal.userId;
    const sessionId = String(getCookies(req)["session_id"] || "");
    const challenge = await takeChallenge(ctx.store, req, res, "register");
    if (!challenge || !samePrincipal({ userId: Number(challenge.userId), memberId: challenge.memberId }, principal) || challenge.sessionHash !== challengeKey(sessionId)) { res.status(400).json({ error: PASSKEY_MESSAGES.expired, code: "challenge-expired" }); return; }
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
    const docId = docIdOf(principal, info.credential.id);
    const owner = demoOwnerOf(sessionId);
    const state = await readState(ctx.store, principal, owner);
    const now = new Date();
    const row: PasskeyDoc = {
      id: docId, credentialId: info.credential.id, userId, ...(principal.memberId ? { memberId: principal.memberId } : {}), publicKey: Buffer.from(info.credential.publicKey).toString("base64url"),
      counter: Number(info.credential.counter) || 0, transports: (info.credential.transports || []) as string[],
      deviceType: String(info.credentialDeviceType), backedUp: Boolean(info.credentialBackedUp), label, createdAt: now.toISOString(),
      /* بعد حدّ الإسقاط دائماً: مفتاحٌ يُسجَّل بعد إسقاطٍ لا يسقط به. */
      createdAtMs: Math.max(now.getTime(), state.revokedAt + 1),
      ...(Repository.isDemoMode() ? { expiresAt: Date.now() + DEMO_PASSKEY_TTL_MS, demoOwner: owner } : {}),
    };
    /* لا يُكتب فوق اعتمادٍ قائم (يصفّر عدّاده)؛ والسقفُ يُحجز ذرّياً في حالة الحساب، فخياران متزامنان لا يتجاوزانه. */
    const created = await ctx.store.update<PasskeyDoc, boolean>("passkeys", docId, current => (current ? { refuse: false } : { next: row, result: true }));
    if (!created.ok) { res.status(409).json({ error: PASSKEY_MESSAGES.duplicate, code: "passkey-duplicate" }); return; }
    const added = await ctx.store.update<StateDoc, boolean>("passkeyState", stateIdOf(principal, owner), current => {
      const base: StateDoc = current || emptyState(principal, owner);
      const ids = (base.credentialIds || []).filter(id => id !== row.credentialId);
      /* أُسقطت المفاتيح بين قراءة الحالة وهذه الكتابة: لا يُلحق مفتاحٌ وُلد قبل الإسقاط. */
      if (Number(base.revokedAt || 0) >= row.createdAtMs) return { refuse: false };
      if (ids.length >= PASSKEY_LIMIT) return { refuse: false };
      return { next: { ...base, credentialIds: [...ids, row.credentialId] }, result: true };
    });
    if (!added.ok) {
      await ctx.store.remove("passkeys", docId).catch(() => undefined);
      const revoked = Number((await readState(ctx.store, principal, owner)).revokedAt || 0) >= row.createdAtMs;
      if (revoked) { res.status(409).json({ error: PASSKEY_MESSAGES.expired, code: "passkey-revoked" }); return; }
      res.status(409).json({ error: PASSKEY_MESSAGES.limit, code: "passkey-limit" });
      return;
    }
    /* سباقٌ مع إخراجٍ أو إنهاءِ عضوية: بعد الكتابة يُعاد التحقّق أن الجلسةَ قائمة وصاحبَها ما زال يعمل،
       وإلا يُسحب المفتاحُ الذي كُتب للتوّ. */
    if (!(await stillEntitled(principal, sessionId))) {
      await ctx.store.update<StateDoc, boolean>("passkeyState", stateIdOf(principal, owner), current => {
        const base: StateDoc = current || emptyState(principal, owner);
        return { next: { ...base, credentialIds: (base.credentialIds || []).filter(id => id !== row.credentialId) }, result: true };
      });
      await ctx.store.remove("passkeys", docId);
      res.status(401).json({ error: "انتهت الجلسة. ادخل من جديد ثم فعّل البصمة.", code: "session-ended" });
      return;
    }
    res.locals.auditChanges = `تفعيل الدخول بالبصمة على جهاز «${label}»`;
    res.json({ ok: true, passkey: publicView(row) });
  });

  /* ── قائمتي وإزالة جهاز ─────────────────────────────────────────────────── */
  /** الجلسةُ المخزّنة والهويةُ المقروءة تتّفقان على صاحب المفاتيح (الحساب أو العضو)؛ وإلا رُفض الطلب. */
  const sessionMismatch = async (req: AuthenticatedRequest, res: Response): Promise<boolean> => {
    if (Repository.isDemoMode()) return false;
    const sessionId = String(getCookies(req)["session_id"] || "");
    const session = sessionId ? await Repository.getSession(sessionId) : undefined;
    if (String(session?.memberId || "") === String(principalOfRequest(req).memberId || "")) return false;
    res.status(403).json({ error: PASSKEY_MESSAGES.memberLink, code: "member-session" });
    return true;
  };

  app.get("/api/passkeys", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    if (await sessionMismatch(req, res)) return;
    const available = Boolean(storeNow() && relyingPartyFor(String(req.get("host") || "")));
    const items = available ? (await listPasskeys(principalOfRequest(req), String(getCookies(req)["session_id"] || ""))).map(publicView) : [];
    res.json({ available, limit: PASSKEY_LIMIT, items });
  });

  app.delete("/api/passkeys/:ref", verifyLimit, requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const store = storeNow();
    if (!store) { res.status(403).json({ error: PASSKEY_MESSAGES.unavailableDemo, code: "passkey-unavailable" }); return; }
    if (await sessionMismatch(req, res)) return;
    const principal = principalOfRequest(req);
    const sessionId = String(getCookies(req)["session_id"] || "");
    const target = (await listPasskeys(principal, sessionId)).find(row => passkeyRef(row.credentialId) === String(req.params.ref));
    if (!target) { res.status(404).json({ error: "هذا الجهاز غير موجود في قائمتك." }); return; }
    const owner = demoOwnerOf(sessionId);
    await store.update<StateDoc, boolean>("passkeyState", stateIdOf(principal, owner), current => {
      const base: StateDoc = current || emptyState(principal, owner);
      return { next: { ...base, credentialIds: (base.credentialIds || []).filter(id => id !== target.credentialId) }, result: true };
    });
    await store.remove("passkeys", docIdOf(principal, target.credentialId));
    res.locals.auditChanges = `إزالة الدخول بالبصمة من جهاز «${target.label}»`;
    res.json({ ok: true });
  });
}
