/**
 * ── «الدخول بالبصمة» (WebAuthn) من الخادم إلى الجلسة ───────────────────────────
 *
 * مصادِقٌ برمجيٌّ يُكتب هنا (مفتاحُ ES256 من crypto، وشهادةُ تسجيلٍ بصيغة none، وتأكيداتٌ موقَّعة) يمرّ بالمسارات
 * الحقيقية في src/server/passkeys.ts على خادمٍ صغير:
 *  A  تسجيلُ جهاز ← دخول ← إعادةُ العدّاد تُرفض ← أصلٌ خاطئ يُرفض ← تحدٍّ منتهٍ أو مستعمَل يُرفض
 *  B  حسابٌ موقوفٌ أو مقفل أو محذوف، ومن عليه تغييرُ كلمته: لا جلسةَ ولا كوكي
 *  C  السقفُ خمسةُ أجهزة، والإزالةُ تعمل وتبطل الدخول، ولا يزيل أحدٌ جهازَ غيره، وإسقاطُ مفاتيح حساب
 *  D  جلسةٌ قديمةٌ تطلب كلمةَ السر، وجلسةُ عضو الفريق ترفض، والمتحدّثُ بلا جلسةٍ لا يسجّل
 *  E  حدُّ المعدّل
 *  F  القائمةُ البيضاء للعنوان
 *  G  تدقيقُ المصدر: الدخولان يفتحان الجلسةَ بالدالة نفسها، والمسؤولُ يُسقط المفاتيح، ولا يُسجَّل شيءٌ من مادة الاعتماد
 */
import fs from "node:fs";
import express from "express";
import type { AddressInfo } from "node:net";
import { createHash, generateKeyPairSync, randomBytes, sign as edSign, type KeyObject } from "node:crypto";
import { Repository } from "../src/db/repository";
import { PASSKEY_LIMIT, listUserPasskeys, passkeyRef, registerPasskeyRoutes, relyingPartyFor, revokeUserPasskeys } from "../src/server/passkeys";
import { getCookies } from "../src/server/core/auth";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};

/* ── مصادِقٌ برمجيّ ─────────────────────────────────────────────────────────── */
const b64u = (bytes: Buffer | Uint8Array | string) => Buffer.from(bytes as any).toString("base64url");
const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest();

function cborHead(major: number, n: number): Buffer {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 256) return Buffer.from([(major << 5) | 24, n]);
  if (n < 65536) return Buffer.from([(major << 5) | 25, n >> 8, n & 255]);
  const out = Buffer.alloc(5); out[0] = (major << 5) | 26; out.writeUInt32BE(n, 1); return out;
}
function cbor(value: any): Buffer {
  if (Buffer.isBuffer(value)) return Buffer.concat([cborHead(2, value.length), value]);
  if (typeof value === "string") { const text = Buffer.from(value); return Buffer.concat([cborHead(3, text.length), text]); }
  if (typeof value === "number") return value >= 0 ? cborHead(0, value) : cborHead(1, -1 - value);
  if (value instanceof Map) return Buffer.concat([cborHead(5, value.size), ...[...value].flatMap(([k, v]) => [cbor(k), cbor(v)])]);
  throw new Error("cbor: unsupported");
}

class SoftwareAuthenticator {
  readonly credentialId = randomBytes(32);
  readonly privateKey: KeyObject;
  readonly publicKey: KeyObject;
  counter = 0;
  constructor() {
    const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.privateKey = pair.privateKey; this.publicKey = pair.publicKey;
  }
  private coseKey(): Buffer {
    const jwk = this.publicKey.export({ format: "jwk" }) as { x: string; y: string };
    return cbor(new Map<number, any>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, "base64url")], [-3, Buffer.from(jwk.y, "base64url")]]));
  }
  register(options: any, origin: string, rpID = new URL(origin).hostname): any {
    const clientDataJSON = Buffer.from(JSON.stringify({ type: "webauthn.create", challenge: options.challenge, origin, crossOrigin: false }));
    const counter = Buffer.alloc(4);
    const authData = Buffer.concat([sha256(rpID), Buffer.from([0x45]), counter, Buffer.alloc(16), Buffer.from([this.credentialId.length >> 8, this.credentialId.length & 255]), this.credentialId, this.coseKey()]);
    const attestationObject = cbor(new Map<string, any>([["fmt", "none"], ["attStmt", new Map()], ["authData", authData]]));
    return { id: b64u(this.credentialId), rawId: b64u(this.credentialId), type: "public-key", clientExtensionResults: {}, authenticatorAttachment: "platform",
      response: { clientDataJSON: b64u(clientDataJSON), attestationObject: b64u(attestationObject), transports: ["internal"] } };
  }
  assert(options: any, origin: string, userId: number, opts: { counter?: number; rpID?: string; uv?: boolean } = {}): any {
    const counter = opts.counter ?? ++this.counter;
    if (opts.counter === undefined) this.counter = counter;
    const clientDataJSON = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: options.challenge, origin, crossOrigin: false }));
    const count = Buffer.alloc(4); count.writeUInt32BE(counter);
    const authData = Buffer.concat([sha256(opts.rpID ?? new URL(origin).hostname), Buffer.from([opts.uv === false ? 0x01 : 0x05]), count]);
    const signature = edSign("sha256", Buffer.concat([authData, sha256(clientDataJSON)]), this.privateKey);
    return { id: b64u(this.credentialId), rawId: b64u(this.credentialId), type: "public-key", clientExtensionResults: {}, authenticatorAttachment: "platform",
      response: { clientDataJSON: b64u(clientDataJSON), authenticatorData: b64u(authData), signature: b64u(signature), userHandle: b64u(`u${userId}`) } };
  }
}

/* ── خادمٌ صغيرٌ بحسابات في الذاكرة ─────────────────────────────────────────── */
const hash = (password: string) => Repository.hashPassword(password);
const users: Record<number, any> = {};
const addUser = (id: number, extra: Record<string, unknown> = {}) => {
  users[id] = { SystemUserId: id, SystemUserLogin: `user${id}`, Name: `مستخدم ${id}`, SystemUserPass: hash("Correct-horse-9"), IsActive: true, IsLocked: false, IsDeleted: false, MustChangePassword: false, ...extra };
};
(Repository as any).getUserById = async (id: number) => users[id];
const PASSWORD = "Correct-horse-9";

type Booted = ReturnType<typeof boot>;
function boot() {
  const app = express();
  app.use(express.json());
  /* كوكي تجربةٍ قديمٌ في المتصفح: الطلبُ يجري في صندوقها كما في server.ts. */
  app.use((req, _res, next) => {
    const sessionId = getCookies(req)["session_id"];
    if (sessionId?.startsWith("demo_") && Repository.runDemoSandbox(sessionId, next)) return;
    next();
  });
  app.use(async (req: any, _res, next) => {
    const sessionId = getCookies(req)["session_id"];
    const session = sessionId ? await Repository.getSession(sessionId) : undefined;
    if (session) req.user = users[session.userId];
    next();
  });
  const audits: Array<{ user?: unknown; changes?: unknown; quiet?: unknown; status?: number }> = [];
  app.use((req, res, next) => { res.on("finish", () => { if (req.path.startsWith("/api/auth/passkey/login") || req.path === "/api/passkeys/register/options") audits.push({ user: res.locals.auditUser, changes: res.locals.auditChanges, quiet: res.locals.quietRefusal, status: res.statusCode } as any); }); next(); });
  registerPasskeyRoutes(app, {
    signIn: async (_req, res, user) => {
      const sessionId = `sess_${randomBytes(32).toString("hex")}`;
      await Repository.createSession(sessionId, user.SystemUserId, 60_000);
      res.setHeader("Set-Cookie", `session_id=${sessionId}; Path=/; HttpOnly`);
      res.json({ user: { SystemUserId: user.SystemUserId } });
    },
    startDemo: async res => { res.json({ demo: true }); },
  });
  const server = app.listen(0);
  const port = (server.address() as AddressInfo).port;
  const origin = `http://localhost:${port}`;
  const jar = new Map<string, string>();
  const call = async (method: string, path: string, body?: unknown, cookies?: Record<string, string>) => {
    const header = Object.entries({ ...Object.fromEntries(jar), ...cookies }).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(origin + path, { method, headers: { "content-type": "application/json", ...(header ? { cookie: header } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";"); const at = pair.indexOf("=");
      jar.set(pair.slice(0, at), pair.slice(at + 1));
    }
    const text = await res.text();
    let json: any = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, headers: res.headers };
  };
  const signedIn = async (userId: number, age = 0, memberId = "") => {
    const sessionId = `sess_${randomBytes(32).toString("hex")}`;
    await Repository.createSession(sessionId, userId, 600_000, memberId ? { memberId } : {});
    if (age) { const session = await Repository.getSession(sessionId); if (session) session.createdAt = Date.now() - age; }
    return { session_id: sessionId };
  };
  /** يسجّل مصادِقاً لحساب (بجلسةٍ طازجة) ويرجع الاستجابة. */
  const enroll = async (userId: number, authenticator: SoftwareAuthenticator, label = "جهازي") => {
    const cookies = await signedIn(userId);
    const options = await call("POST", "/api/passkeys/register/options", {}, cookies);
    if (options.status !== 200) return { options, verify: options };
    const verify = await call("POST", "/api/passkeys/register/verify", { response: authenticator.register(options.json, origin), label }, cookies);
    return { options, verify };
  };
  const loginWith = async (authenticator: SoftwareAuthenticator, userId: number, opts: Parameters<SoftwareAuthenticator["assert"]>[3] & { origin?: string } = {}) => {
    const options = await call("POST", "/api/auth/passkey/login/options", {});
    const response = authenticator.assert(options.json, opts.origin ?? origin, userId, opts);
    return { options, verify: await call("POST", "/api/auth/passkey/login/verify", { response }) };
  };
  return { origin, call, jar, signedIn, enroll, loginWith, audits, close: () => server.close() };
}

async function groupA() {
  let t: Booted = boot();
  addUser(101);
  const key = new SoftwareAuthenticator();

  const denied = await t.call("POST", "/api/passkeys/register/options", {});
  check(denied.status === 401 || denied.status === 403, "A1 التسجيلُ لا يعمل بلا جلسة", denied.status);

  const cookies = await t.signedIn(101);
  const options = await t.call("POST", "/api/passkeys/register/options", {}, cookies);
  check(options.status === 200 && options.json.challenge && options.json.rp.id === "localhost", "A2 خياراتُ التسجيل لعنوان الطلب", options.json);
  check(options.json.authenticatorSelection.residentKey === "required" && options.json.authenticatorSelection.userVerification === "required",
    "A3 بيانُ اعتمادٍ قابلٌ للاكتشاف والتحقّقُ إلزامي (شاشةُ الدخول بلا اسم)");
  check(options.json.attestation === "none" || options.json.attestation === undefined, "A3b لا شهادةَ أجهزةٍ تُطلب");
  const verify = await t.call("POST", "/api/passkeys/register/verify", { response: key.register(options.json, t.origin), label: "<b>آيفون</b>" }, cookies);
  check(verify.status === 200 && verify.json.ok && !/[<>]/.test(verify.json.passkey.label), "A4 تسجيلُ الجهاز ينجح ويُنقّى اسمُه من الوسوم", verify.json);
  check(!JSON.stringify(verify.json).includes(b64u(key.credentialId)), "A5 الردُّ لا يحمل معرّفَ الاعتماد (معرّفٌ قصيرٌ للعرض فقط)");
  const list = await t.call("GET", "/api/passkeys", undefined, cookies);
  check(list.status === 200 && list.json.items.length === 1 && list.json.limit === PASSKEY_LIMIT && list.json.items[0].ref === passkeyRef(b64u(key.credentialId)), "A6 القائمةُ تعرض الجهاز بمعرّفٍ قصير", list.json);
  const stored = (await listUserPasskeys(101))[0];
  check(Boolean(stored) && !Object.keys(stored).some(k => /private|secret/i.test(k)) && typeof stored.publicKey === "string", "A7 المخزونُ مفتاحٌ عامٌّ وعدّادٌ، لا سرّ");

  /* الدخول */
  const ok = await t.loginWith(key, 101);
  check(ok.options.status === 200 && ok.options.json.userVerification === "required" && (ok.options.json.allowCredentials || []).length === 0, "A8 خياراتُ الدخول بلا قائمة اعتمادات (بلا اسم مستخدم)");
  check(ok.verify.status === 200 && ok.verify.json.user.SystemUserId === 101 && /session_id=sess_/.test(ok.verify.headers.get("set-cookie") || ""), "A9 الدخولُ بالبصمة يفتح الجلسة", ok.verify.json);
  check(/HttpOnly/.test(ok.verify.headers.get("set-cookie") || ""), "A9b كوكي الجلسة HttpOnly");
  check(t.audits.some(a => a.changes === "الدخول بالبصمة" && (a.user as any)?.id === 101), "A10 يُهيَّأ سطرُ السجلّ بطريقة الدخول وصاحبه", t.audits);
  const afterLogin = (await listUserPasskeys(101))[0];
  check(afterLogin.counter === 1 && Boolean(afterLogin.lastUsedAt), "A11 العدّاد تقدّم وسُجّل آخرُ استعمال");

  /* إعادة العدّاد */
  const replay = await t.loginWith(key, 101, { counter: 1 });
  check(replay.verify.status === 400 && replay.verify.json.code === "verify-failed" && !replay.verify.headers.get("set-cookie")?.includes("sess_"), "A12 استجابةٌ بعدّادٍ مكرَّر (نسخةٌ مستنسخة) تُرفض بلا جلسة", replay.verify.json);
  const lower = await t.loginWith(key, 101, { counter: 0 });
  check(lower.verify.status === 400, "A13 عدّادٌ أقلُّ من المحفوظ يُرفض");
  const forward = await t.loginWith(key, 101, { counter: 5 });
  check(forward.verify.status === 200, "A14 عدّادٌ يقفز للأمام يُقبل ويتقدّم");
  key.counter = 5;

  /* أصلٌ ونطاقٌ خاطئان */
  const badOrigin = await t.loginWith(key, 101, { origin: "http://localhost:1" });
  check(badOrigin.verify.status === 400 && badOrigin.verify.json.code === "verify-failed", "A15 أصلٌ خاطئ يُرفض");
  const badRp = await t.loginWith(key, 101, { rpID: "evil.example" });
  check(badRp.verify.status === 400, "A16 تجزئةُ نطاقٍ خاطئة تُرفض");
  const noUv = await t.loginWith(key, 101, { uv: false });
  check(noUv.verify.status === 400, "A17 تأكيدٌ بلا تحقّقٍ من المستخدم (بصمة/رمز) يُرفض");

  /* حدُّ المعدّل لكل نسخةٍ من الخادم: تُفتح نسخةٌ جديدةٌ كي لا تُستنفد العدّادات بين المقاطع. */
  t.close(); t = boot();

  /* التحدّي: منتهٍ، ومستعمَل، وبلا كوكي، ومن نوعٍ آخر */
  const first = await t.call("POST", "/api/auth/passkey/login/options", {});
  const token = t.jar.get("pk_challenge")!;
  const response = key.assert(first.json, t.origin, 101);
  const used = await t.call("POST", "/api/auth/passkey/login/verify", { response });
  check(used.status === 200, "A18 التحدّي الطازج يُقبل مرة");
  const again = await t.call("POST", "/api/auth/passkey/login/verify", { response: key.assert(first.json, t.origin, 101) }, { pk_challenge: token });
  check(again.status === 400 && again.json.code === "challenge-expired", "A19 التحدّي المستعمَل لا يُستعمل ثانيةً (حتى بالكوكي نفسه)", again.json);

  const second = await t.call("POST", "/api/auth/passkey/login/options", {});
  const token2 = t.jar.get("pk_challenge")!;
  const key2 = createHash("sha256").update(token2).digest("hex");
  await Repository.updateFeatureDoc<any, boolean>("passkeyChallenges", key2, current => ({ next: { ...current, expiresAt: Date.now() - 1 }, result: true }));
  const late = await t.call("POST", "/api/auth/passkey/login/verify", { response: key.assert(second.json, t.origin, 101) });
  check(late.status === 400 && late.json.code === "challenge-expired", "A20 التحدّي بعد خمس دقائق يُرفض", late.json);

  const third = await t.call("POST", "/api/auth/passkey/login/options", {});
  const noCookie = await t.call("POST", "/api/auth/passkey/login/verify", { response: key.assert(third.json, t.origin, 101) }, { pk_challenge: "" });
  check(noCookie.status === 400 && noCookie.json.code === "challenge-expired", "A21 بلا كوكي «ما قبل الجلسة» لا يُقبل تحدٍّ");

  const other = await t.signedIn(101);
  const regOptions = await t.call("POST", "/api/passkeys/register/options", {}, other);
  const crossKind = await t.call("POST", "/api/auth/passkey/login/verify", { response: key.assert(regOptions.json, t.origin, 101) });
  check(crossKind.status === 400, "A22 تحدّي تسجيلٍ لا يصلح للدخول");

  t.close(); t = boot();
  const unknown = await t.loginWith(new SoftwareAuthenticator(), 101);
  check(unknown.verify.status === 400 && unknown.verify.json.code === "not-registered", "A23 جهازٌ غير مسجَّل يُردّ بنصٍّ يقول ذلك", unknown.verify.json);
  const wrongOwner = await t.loginWith(key, 102);
  check(wrongOwner.verify.status === 400, "A24 مقبضُ مستخدمٍ لا يطابق مالكَ الاعتماد يُرفض");

  /* تسجيلٌ بتحدٍّ منتهٍ أو بأصلٍ خاطئ */
  const c2 = await t.signedIn(101);
  const o2 = await t.call("POST", "/api/passkeys/register/options", {}, c2);
  const wrongOriginReg = await t.call("POST", "/api/passkeys/register/verify", { response: new SoftwareAuthenticator().register(o2.json, "http://localhost:1", "localhost"), label: "x" }, c2);
  check(wrongOriginReg.status === 400, "A25 تسجيلٌ بأصلٍ خاطئ يُرفض");
  const c3 = await t.signedIn(101);
  const o3 = await t.call("POST", "/api/passkeys/register/options", {}, c3);
  const c4 = await t.signedIn(101);
  const stolen = await t.call("POST", "/api/passkeys/register/verify", { response: new SoftwareAuthenticator().register(o3.json, t.origin), label: "x" }, { ...c4 });
  check(stolen.status === 400, "A26 تحدّيُ التسجيل مربوطٌ بجلسته: جلسةٌ أخرى لا تكمله", stolen.json);
  t.close();
}

async function groupB() {
  const t: Booted = boot();
  const keys: Record<number, SoftwareAuthenticator> = {};
  for (const [id, extra] of [[201, {}], [202, { IsActive: false }], [203, { IsLocked: true }], [204, { IsDeleted: true }], [205, { MustChangePassword: true }]] as Array<[number, any]>) {
    addUser(id);
    keys[id] = new SoftwareAuthenticator();
    const enrolled = await t.enroll(id, keys[id]);
    check(enrolled.verify.status === 200, `B0 تسجيلٌ سابقٌ للحساب ${id}`, enrolled.verify.json);
    Object.assign(users[id], extra);
  }
  const normal = await t.loginWith(keys[201], 201);
  check(normal.verify.status === 200, "B1 الحسابُ السليم يدخل");
  for (const [id, status, code, label] of [[202, 403, "account-inactive", "موقوف"], [203, 403, "account-locked", "مقفل"], [204, 400, "verify-failed", "محذوف"], [205, 403, "password-change-required", "عليه تغييرُ كلمته"]] as Array<[number, number, string, string]>) {
    const out = await t.loginWith(keys[id], id);
    check(out.verify.status === status && out.verify.json.code === code && !out.verify.headers.get("set-cookie")?.includes("sess_"), `B2 حسابٌ ${label}: يُرفض بلا جلسةٍ ولا كوكي`, { status: out.verify.status, body: out.verify.json });
  }
  check(!JSON.stringify(t.audits).includes("sess_") && t.audits.length > 0, "B3 يُهيَّأ للرفضِ أيضاً سطرُ السجلّ بصاحب المحاولة");
  /* تسجيلٌ لحسابٍ ما زال فعّالاً بعد أن صار «عليه تغيير كلمته»: يُحجب ببوابة الخادم (/api غير /auth/) — تُدقَّق في G */
  t.close();
}

async function groupC() {
  let t: Booted = boot();
  addUser(301); addUser(302);
  const keys = Array.from({ length: PASSKEY_LIMIT + 1 }, () => new SoftwareAuthenticator());
  for (let i = 0; i < PASSKEY_LIMIT; i++) {
    const out = await t.enroll(301, keys[i], `جهاز ${i + 1}`);
    check(out.verify.status === 200, `C1 الجهازُ ${i + 1} من ${PASSKEY_LIMIT} يُسجَّل`, out.verify.json);
  }
  const sixth = await t.enroll(301, keys[PASSKEY_LIMIT]);
  check(sixth.options.status === 409 && sixth.options.json.code === "passkey-limit", "C2 السادسُ يُرفض بنصٍّ يقول الحدّ", sixth.options.json);

  const cookies = await t.signedIn(301);
  const list = await t.call("GET", "/api/passkeys", undefined, cookies);
  const target = list.json.items[0];
  const stranger = await t.signedIn(302);
  const foreign = await t.call("DELETE", `/api/passkeys/${target.ref}`, undefined, stranger);
  check(foreign.status === 404, "C3 لا يزيل أحدٌ جهازَ غيره", foreign.status);
  const removed = await t.call("DELETE", `/api/passkeys/${target.ref}`, undefined, cookies);
  check(removed.status === 200 && removed.json.ok, "C4 صاحبُ الجهاز يزيله");
  const after = await t.call("GET", "/api/passkeys", undefined, cookies);
  check(after.json.items.length === PASSKEY_LIMIT - 1 && !after.json.items.some((item: any) => item.ref === target.ref), "C5 القائمةُ بعد الإزالة");
  t.close(); t = boot();
  const gone = await t.loginWith(keys[0], 301);
  check(gone.verify.status === 400 && gone.verify.json.code === "not-registered", "C6 الجهازُ المُزال لا يدخل", gone.verify.json);
  const still = await t.loginWith(keys[1], 301);
  check(still.verify.status === 200, "C7 غيرُه من أجهزته يدخل");
  const afterRemove = await t.enroll(301, keys[PASSKEY_LIMIT]);
  check(afterRemove.verify.status === 200, "C8 بعد الإزالة يتّسع السقفُ لجهازٍ جديد");
  const duplicate = await t.call("POST", "/api/passkeys/register/options", {}, cookies);
  check(duplicate.status === 409, "C8b والسقفُ يعود فيمتلئ");

  const revoked = await revokeUserPasskeys(301);
  check(revoked === PASSKEY_LIMIT && (await listUserPasskeys(301)).length === 0, "C9 إسقاطُ كلّ مفاتيح الحساب (إعادةُ تعيين/إيقاف/حذف)", revoked);
  const dead = await t.loginWith(keys[1], 301);
  check(dead.verify.status === 400 && dead.verify.json.code === "not-registered", "C10 بعد الإسقاط لا دخولَ بالبصمة");
  check((await listUserPasskeys(302)).length === 0, "C11 الإسقاطُ لا يمسّ حساباً آخر");
  t.close();
}

async function groupD() {
  const t: Booted = boot();
  addUser(401);
  const old = await t.signedIn(401, 30 * 60_000);
  const none = await t.call("POST", "/api/passkeys/register/options", {}, old);
  check(none.status === 403 && none.json.code === "password-required", "D1 جلسةٌ مضى عليها وقتٌ تطلب كلمةَ السر قبل تسجيل جهاز", none.json);
  const wrong = await t.call("POST", "/api/passkeys/register/options", { password: "wrong-password-1" }, old);
  check(wrong.status === 403 && wrong.json.code === "password-wrong", "D2 كلمةٌ خاطئة تُرفض", wrong.json);
  const right = await t.call("POST", "/api/passkeys/register/options", { password: PASSWORD }, old);
  check(right.status === 200 && right.json.challenge, "D3 الكلمةُ الصحيحة تفتح التسجيل");

  const member = await t.signedIn(401);
  const session = await Repository.getSession(member.session_id);
  if (session) (session as any).memberId = "m1";
  const refused = await t.call("POST", "/api/passkeys/register/options", {}, member);
  check(refused.status === 403 && refused.json.code === "member-session", "D4 جلسةُ عضو الفريق برابطه لا تربط بصمةً بحساب الكرسي", refused.json);

  const key = new SoftwareAuthenticator();
  const fresh = await t.signedIn(401);
  const options = await t.call("POST", "/api/passkeys/register/options", {}, fresh);
  const registered = await t.call("POST", "/api/passkeys/register/verify", { response: key.register(options.json, t.origin) }, fresh);
  check(registered.status === 200 && registered.json.passkey.label === "جهاز", "D5 بلا اسمٍ مُرسَل يُسمّى «جهاز»");
  t.close();
}

async function groupE() {
  const t: Booted = boot();
  let limited = 0, lastStatus = 0;
  for (let i = 0; i < 14; i++) {
    const out = await t.call("POST", "/api/auth/passkey/login/verify", { response: { id: "x" } });
    lastStatus = out.status;
    if (out.status === 429) limited++;
  }
  check(limited >= 3 && lastStatus === 429, "E1 محاولاتُ التحقّق المتتابعة تُحدّ بـ429", { limited, lastStatus });
  const options = await t.call("POST", "/api/auth/passkey/login/options", {});
  check(options.status === 200, "E2 خياراتُ الدخول لها حدٌّ مستقلّ لا يُستنفد بالتحقّق");
  let optionsLimited = 0;
  for (let i = 0; i < 25; i++) if ((await t.call("POST", "/api/auth/passkey/login/options", {})).status === 429) optionsLimited++;
  check(optionsLimited > 0, "E3 وطلبُ الخيارات يُحدّ أيضاً");
  t.close();
}

function groupF() {
  check(relyingPartyFor("schedule-kw.com")?.rpID === "schedule-kw.com" && relyingPartyFor("schedule-kw.com")?.origin === "https://schedule-kw.com", "F1 النطاقُ الرسميّ");
  check(relyingPartyFor("www.schedule-kw.com")?.rpID === "schedule-kw.com" && relyingPartyFor("www.schedule-kw.com")?.origin === "https://www.schedule-kw.com", "F2 www بالنطاق نفسِه والأصلُ بعنوانه");
  for (const evil of ["evil.com", "schedule-kw.com.evil.com", "xschedule-kw.com", "schedule-kw.com@evil.com", "home.schedule-kw.com", "", "a b", "schedule-kw.com/evil"])
    check(relyingPartyFor(evil) === null, `F3 عنوانٌ غريبٌ مرفوض: «${evil}»`);
  check(relyingPartyFor("localhost:3917", { NODE_ENV: "development" })?.origin === "http://localhost:3917", "F4 localhost للتطوير");
  check(relyingPartyFor("localhost:3917", { NODE_ENV: "production" }) === null, "F5 localhost لا يُقبل على خادمٍ بوضع الإنتاج");
  check(relyingPartyFor("127.0.0.1:3917", { NODE_ENV: "development" }) === null, "F6 عنوانُ IP لا يصلح نطاقاً");
  check(relyingPartyFor("app.example.org", { PASSKEY_EXTRA_HOSTS: "app.example.org, other.example.org" })?.rpID === "app.example.org", "F7 قائمةُ عناوينَ إضافيةٍ يضبطها المشغّل");
  check(relyingPartyFor("app.example.org", {}) === null, "F8 بلا ضبطٍ لا عناوينَ إضافية");
}

function groupG() {
  const read = (file: string) => fs.readFileSync(file, "utf8");
  const auth = read("src/server/routes/authRoutes.ts"), passkeys = read("src/server/passkeys.ts"), users = read("src/server/routes/usersRoutes.ts"), server = read("server.ts");
  const loginRoute = auth.slice(auth.indexOf('app.post("/api/auth/login"'), auth.indexOf('app.post("/api/auth/change-password"'));
  check(/signInSession\(req, res, user, mustChange\)/.test(loginRoute) && !/createSession\(/.test(loginRoute), "G1 دخولُ كلمة السر يفتح الجلسةَ بالدالة المشتركة");
  check(/registerPasskeyRoutes\(app, \{ signIn: \(req, res, user\) => signInSession\(req, res, user, false\)/.test(auth), "G2 الدخولُ بالبصمة يفتحها بالدالة نفسها");
  check(/IsActive/.test(passkeys) && /IsLocked/.test(passkeys) && /IsDeleted/.test(passkeys) && /MustChangePassword/.test(passkeys), "G3 البصمةُ تفحص ما تفحصه كلمةُ السر: فعّال، مقفل، محذوف، تغييرُ الكلمة");
  check(/passwordChanged \|\| \(before\.IsActive && !fields\.IsActive\) \|\| \(!before\.IsLocked && fields\.IsLocked\)\) await revokeUserPasskeys\(id\);\n\s+const updated = await Repository\.updateUser/.test(users), "G4 تغييرُ كلمة الحساب (من المسؤول أو من صاحبه) وإيقافُه وقفلُه يُسقطان المفاتيح قبل الكتابة وبلا ابتلاع");
  check(/await revokeUserPasskeys\(id\);\n  await Repository\.deleteUser\(id\)/.test(users), "G5 حذفُ الحساب يُسقطها قبل الحذف");
  check(/revokeUserPasskeys/.test(read("src/server/staffRecoveryWiring.ts")) && /revokeUserPasskeys/.test(read("src/server/accountDeletionWiring.ts")), "G6 واستعادةُ كلمة السر وطلبُ حذف الحساب يُسقطانها");
  check(/routePath === "\/auth\/passkey\/login\/verify" \? "login"/.test(server), "G7 سجلُّ العمليات يعدّ الدخولَ بالبصمة «تسجيل دخول»");
  check(!/console\.(log|info|warn|debug)/.test(passkeys) && (passkeys.match(/console\.error\(/g) || []).every(() => true) && (passkeys.match(/console\.error\("\[passkeys\][^"$]*"\)/g) || []).length === (passkeys.match(/console\.error\(/g) || []).length, "G8 لا يُسجَّل في الطرفية شيءٌ من مادة الاعتماد: سطرُ خطأٍ ثابتٌ واحدٌ لفشل التنظيف");
  check(/residentKey: "required", userVerification: "required"/.test(passkeys) && /requireUserVerification: true/.test(passkeys) && !/requireUserVerification: false/.test(passkeys), "G9 اعتمادٌ قابلٌ للاكتشاف وتحقّقٌ إلزامي");
  check(!/req\.hostname|x-forwarded-host/i.test(passkeys), "G10 العنوانُ من ترويسة Host المفحوصة بالقائمة البيضاء، لا من ترويسةٍ يضعها الوسيط");
  check(/isDemoMode\(\)\) return memoryStore/.test(passkeys) && /isDemoRequest\(\)\) return null/.test(passkeys), "G11 العرضُ المحلي في ذاكرة العملية وصندوقُ التجربة في الخادم الحقيقي بلا ميزة");
  check(/PASSKEY_FRESH_LOGIN_MS/.test(passkeys) && /session\.memberId/.test(passkeys), "G12 التسجيلُ: كلمةٌ لمن مضى على دخوله وقت، ولا عضوُ فريق");
  /* ── تدقيق المراجعة المستقلة ── */
  const seats = read("src/server/seatsRoutes.ts");
  const reset = seats.slice(seats.indexOf("async function resetSeatCredentials"), seats.indexOf("/** نطاقُ موظف التسجيل"));
  check(/revokeUserPasskeys\(Number\(seat\.SystemUserId\)\);\n\s+await Repository\.updateUser/.test(reset), "R1 تسليمُ الكرسي (شاغلٌ جديد، كلمةٌ أولى) يُسقط بصمةَ الشاغل السابق قبل الكتابة");
  const pr = seats.slice(seats.indexOf('app.post("/api/seats/:id/password-reset"'));
  check(/revokeUserPasskeys\(Number\(seat\.SystemUserId\)\);\n\s+if \(!Repository\.isDemoRequest\(\)\) await Repository\.applyPasswordReset/.test(pr), "R1 إعادةُ تعيين كلمة الكرسي تُسقطها");
  check(/seats\/:id\/first-password[\s\S]{0,400}resetSeatCredentials\(seat\)/.test(seats), "R1 إعادةُ إصدار الكلمة الأولى تمرّ بالدالة نفسها");
  const change = auth.slice(auth.indexOf('app.post("/api/auth/change-password"'), auth.indexOf('app.post("/api/auth/logout"'));
  check(/await revokeUserPasskeys\(Number\(user!\.SystemUserId\)\);\n\s+await Repository\.updateUser/.test(change), "R2 تغييرُ الكلمة بيد صاحبها يُسقط المفاتيح قبل الكتابة");
  check(/\.catch\(\(\) => 0\)/.test([users, read("src/server/staffRecoveryWiring.ts"), read("src/server/accountDeletionWiring.ts"), seats, auth].join("\n")) === false, "R4 لا ابتلاعَ لخطأ الإسقاط في أيّ موضع");
  check(/setPassword: async \(userId, fields\) => \{ await revokeUserPasskeys\(userId\)/.test(read("src/server/staffRecoveryWiring.ts")) && /await revokeUserPasskeys\(userId\);\n\s+await Repository\.deleteOtherSessionsForUser/.test(read("src/server/accountDeletionWiring.ts")), "R4 الاستعادةُ وطلبُ الحذف: إسقاطٌ قبل الكتابة بلا ابتلاع");
  check(/createdAtMs \|\| 0\) <= Number\(state\?\.revokedAt/.test(passkeys) && /readState\(ctx\.store, userId/.test(passkeys), "R4 الدخولُ يفحص حدَّ الإسقاط لكل مفتاح، وتعذّرُ قراءته يردّ الدخول");
  check(!/listFeatureDocs/.test(passkeys), "R5 لا مسحَ كاملاً للمجموعة: القراءةُ بحالة الحساب وأرقام مفاتيحه (≤5)");
  check(/sessionHash: challengeKey\(sessionId\)/.test(passkeys) && !/sessionId,?\s*\}\)/.test(passkeys.slice(passkeys.indexOf("openChallenge(ctx.store, res, { kind: \"register\""), passkeys.indexOf("openChallenge(ctx.store, res, { kind: \"register\"") + 200)), "R7 التحدّي يحمل بصمةَ الجلسة لا معرّفَها");
  check(/passkeyChallenges\.expiresAtTtl/.test(read("docs/DELIVERY_OPERATIONS.md")), "R7 سياسةُ TTL مذكورةٌ في دليل التشغيل قراراً للمالك");
  const server2 = read("server.ts");
  check(/routePath === "\/passkeys\/register\/options" && \(!refused \|\| res\.locals\?\.quietRefusal\)\) return;/.test(server2) && !/const skip = [^\n]*passkeys\/register\/options/.test(server2), "R6 فشلُ تسجيل الجهاز يُسجَّل في العمليات، والنجاحُ والرفضُ الهادئ لا");
  check(/outsideDemoSandbox\(\(\) => handler\(req, res\)\)/.test(passkeys), "R9 الدخولُ بالبصمة يجري خارج صندوق التجربة");
}

async function groupDemo() {
  /* العرضُ المحلي: المفاتيحُ في ذاكرة العملية لا في وثائق الصندوق. */
  const real = Repository.isDemoMode;
  (Repository as any).isDemoMode = () => true;
  try {
    const t: Booted = boot();
    addUser(501);
    const key = new SoftwareAuthenticator();
    const enrolled = await t.enroll(501, key);
    check(enrolled.verify.status === 200, "H1 التسجيلُ يعمل في العرض المحلي", enrolled.verify.json);
    const inDocs = (await Repository.listFeatureDocs<any>("passkeys")).filter(row => Number(row.userId) === 501);
    check(inDocs.length === 0, "H2 لا شيءَ منها في وثائق قاعدة البيانات ولا الصندوق", inDocs.length);
    const out = await t.loginWith(key, 501);
    check(out.verify.status === 200 && out.verify.json.demo === true, "H3 الدخولُ بالبصمة في العرض يفتح صندوقاً تجريبياً جديداً", out.verify.json);
    t.close();
  } finally { (Repository as any).isDemoMode = real; }
  /* صندوقُ تجربةٍ داخل خادمٍ حقيقيّ: لا ميزة. */
  const realRequest = Repository.isDemoRequest;
  (Repository as any).isDemoRequest = () => true;
  try {
    const t: Booted = boot();
    addUser(502);
    const cookies = await t.signedIn(502);
    const options = await t.call("POST", "/api/passkeys/register/options", {}, cookies);
    const list = await t.call("GET", "/api/passkeys", undefined, cookies);
    check(options.status === 403 && list.json.available === false, "H4 صندوقُ التجربة داخل خادمٍ حقيقيّ لا يسجّل مفاتيح", options.json);
    t.close();
  } finally { (Repository as any).isDemoRequest = realRequest; }
}

async function groupR() {
  /* ── حدُّ الإسقاط: علامةٌ تُفحص عند كل دخول ── */
  let t: Booted = boot();
  addUser(601);
  const key = new SoftwareAuthenticator();
  await t.enroll(601, key);
  const baseline = await t.loginWith(key, 601);
  check(baseline.verify.status === 200, "R10 الجهاز يدخل قبل الإسقاط");
  /* العلامةُ وحدها (وثيقةُ المفتاح باقية): تكفي لرفض الدخول */
  await Repository.updateFeatureDoc<any, boolean>("passkeyState", "601", current => ({ next: { ...current, revokedAt: Date.now() + 5000 }, result: true }));
  const marked = await t.loginWith(key, 601);
  check(marked.verify.status === 400 && marked.verify.json.code === "not-registered" && !marked.verify.headers.get("set-cookie")?.includes("sess_"), "R10 علامةُ الإسقاط وحدها تُغلق الدخول ولو بقيت وثيقةُ المفتاح", marked.verify.json);
  check((await listUserPasskeys(601)).length === 0, "R10 والقائمةُ لا تُظهر المُسقَط");
  await Repository.updateFeatureDoc<any, boolean>("passkeyState", "601", current => ({ next: { ...current, revokedAt: 0 }, result: true }));
  t.close(); t = boot();
  /* بعد إسقاطٍ حقيقيّ يسجَّل جهازٌ جديدٌ فيصحّ دخولُه */
  const before = (await listUserPasskeys(601)).length;
  await revokeUserPasskeys(601);
  const fresh = new SoftwareAuthenticator();
  const re = await t.enroll(601, fresh);
  const ok = await t.loginWith(fresh, 601);
  check(before === 1 && re.verify.status === 200 && ok.verify.status === 200, "R10 مفتاحٌ يُسجَّل بعد الإسقاط يعمل");
  const old = await t.loginWith(key, 601);
  check(old.verify.status === 400, "R10 والقديمُ لا يعود");
  t.close(); t = boot();

  /* ── الفشلُ يُغلق ولا يُفتح ── */
  const realUpdate = Repository.updateFeatureDoc, realGet = Repository.getFeatureDoc;
  (Repository as any).updateFeatureDoc = async (collection: string, ...rest: any[]) => { if (collection === "passkeyState") throw new Error("boom"); return (realUpdate as any)(collection, ...rest); };
  let threw = false;
  try { await revokeUserPasskeys(601); } catch { threw = true; }
  (Repository as any).updateFeatureDoc = realUpdate;
  check(threw, "R4 تعذّرُ كتابة علامة الإسقاط يُرمى ولا يُبتلع");
  (Repository as any).getFeatureDoc = async (collection: string, ...rest: any[]) => { if (collection === "passkeyState") throw new Error("boom"); return (realGet as any)(collection, ...rest); };
  let failedOpen = true;
  try {
    const down = await t.loginWith(fresh, 601);
    failedOpen = down.verify.status === 200 || Boolean(down.verify.headers.get("set-cookie")?.includes("sess_"));
  } catch { failedOpen = false; }
  (Repository as any).getFeatureDoc = realGet;
  check(!failedOpen, "R4 تعذّرُ قراءة حدّ الإسقاط يردّ الدخولَ لا يفتحه");
  t.close();

  /* ── جلسةُ عضو الفريق ── */
  t = boot();
  addUser(602);
  const owner = new SoftwareAuthenticator();
  await t.enroll(602, owner);
  const member = await t.signedIn(602, 0, "m1");
  const memberList = await t.call("GET", "/api/passkeys", undefined, member);
  check(memberList.status === 403 && memberList.json.code === "member-session", "R3 عضو الفريق لا يقرأ مفاتيح الكرسي", memberList.status);
  const ref = passkeyRef(b64u(owner.credentialId));
  const memberDelete = await t.call("DELETE", `/api/passkeys/${ref}`, undefined, member);
  check(memberDelete.status === 403 && (await listUserPasskeys(602)).length === 1, "R3 ولا يزيل منها", memberDelete.status);
  const memberOptions = await t.call("POST", "/api/passkeys/register/options", {}, member);
  check(memberOptions.status === 403, "R3 ولا يسجّل");
  const own = await t.signedIn(602);
  check((await t.call("GET", "/api/passkeys", undefined, own)).json.items.length === 1, "R3 وصاحبُ الحساب يقرأ");
  t.close();

  /* ── تكلفةُ القراءة، وعدمُ الكتابة فوق اعتماد، والسقفُ الذرّي، وبصمةُ الجلسة ── */
  t = boot();
  addUser(603);
  let scans = 0;
  const realList = Repository.listFeatureDocs;
  (Repository as any).listFeatureDocs = async (...args: any[]) => { scans++; return (realList as any)(...args); };
  const k1 = new SoftwareAuthenticator();
  const cookies = await t.signedIn(603);
  const opt = await t.call("POST", "/api/passkeys/register/options", {}, cookies);
  const challengeDocs = JSON.stringify(await realList.call(Repository, "passkeyChallenges"));
  check(!challengeDocs.includes(cookies.session_id), "R7 وثيقةُ التحدّي لا تحمل معرّف الجلسة الخام");
  await t.call("POST", "/api/passkeys/register/verify", { response: k1.register(opt.json, t.origin), label: "أول" }, cookies);
  await t.loginWith(k1, 603);
  const counterBefore = (await listUserPasskeys(603))[0].counter;
  const opt2 = await t.call("POST", "/api/passkeys/register/options", {}, cookies);
  const dup = await t.call("POST", "/api/passkeys/register/verify", { response: k1.register(opt2.json, t.origin), label: "نسخة" }, cookies);
  const after = (await listUserPasskeys(603))[0];
  check(dup.status === 409 && dup.json.code === "passkey-duplicate" && after.counter === counterBefore && after.label === "أول", "R8 اعتمادٌ قائمٌ لا يُكتب فوقه ولا يُصفَّر عدّاده", dup.json);
  await t.call("GET", "/api/passkeys", undefined, cookies);
  await revokeUserPasskeys(603);
  (Repository as any).listFeatureDocs = realList;
  check(scans === 0, "R5 التسجيل والقائمة والدخول والإسقاط بلا مسحٍ كاملٍ للمجموعة", scans);
  t.close();

  t = boot();
  addUser(604);
  const jobs = Array.from({ length: PASSKEY_LIMIT + 3 }, () => new SoftwareAuthenticator());
  const c604 = await t.signedIn(604);
  const tokens: string[] = [], optionsList: any[] = [];
  for (let i = 0; i < jobs.length; i++) {
    /* السقفُ يُفحص عند الخيارات أيضاً، فتُؤخذ كلُّها قبل أيّ تسجيل */
    const o = await t.call("POST", "/api/passkeys/register/options", {}, c604);
    tokens.push(t.jar.get("pk_challenge")!); optionsList.push(o.json);
  }
  const results = await Promise.all(jobs.map((job, i) => t.call("POST", "/api/passkeys/register/verify", { response: job.register(optionsList[i], t.origin) }, { ...c604, pk_challenge: tokens[i] })));
  const accepted = results.filter(r => r.status === 200).length;
  check(accepted === PASSKEY_LIMIT && (await listUserPasskeys(604)).length === PASSKEY_LIMIT, "R8 تسجيلاتٌ متزامنة لا تتجاوز السقف", results.map(r => r.status));
  t.close();

  /* ── كلمةٌ خاطئة: معدودةٌ ومسجَّلة ── */
  t = boot();
  addUser(605);
  const stale = await t.signedIn(605, 30 * 60_000);
  const needs = await t.call("POST", "/api/passkeys/register/options", {}, stale);
  const wrongs: number[] = [];
  for (let i = 0; i < 6; i++) wrongs.push((await t.call("POST", "/api/passkeys/register/options", { password: "wrong-password-1" }, stale)).status);
  const correctAfter = await t.call("POST", "/api/passkeys/register/options", { password: PASSWORD }, stale);
  check(needs.status === 403 && wrongs.slice(0, 5).every(code => code === 403) && wrongs[5] === 429 && correctAfter.status === 429, "R6 خمسُ كلماتٍ خاطئة ثم 429 حتى للصحيحة", { wrongs, correctAfter: correctAfter.status });
  check(t.audits.filter((a: any) => a.changes === "كلمة سر خاطئة عند تفعيل الدخول بالبصمة").length === 5 && t.audits.some((a: any) => a.quiet === true && a.status === 403), "R6 الخاطئةُ تُسجَّل في السجلّ بنصّها، والرفضُ الهادئ (يطلب كلمةً) مُعلَّمٌ فلا يُسجَّل");
  t.close();

  /* ── كوكي تجربةٍ قديمٌ على الخادم الحقيقي ── */
  t = boot();
  Repository.createDemoSandbox("demo_stalecookie", 60_000);
  const viaDemo = await t.call("POST", "/api/auth/passkey/login/options", {}, { session_id: "demo_stalecookie" });
  check(viaDemo.status === 200 && Boolean(viaDemo.json.challenge), "R9 كوكي demo_ قديمٌ لا يمنع خياراتِ الدخول الحقيقي", viaDemo.json);
  addUser(606);
  const real606 = new SoftwareAuthenticator();
  await t.enroll(606, real606);
  const optionsDemo = await t.call("POST", "/api/auth/passkey/login/options", {}, { session_id: "demo_stalecookie" });
  const verifyDemo = await t.call("POST", "/api/auth/passkey/login/verify", { response: real606.assert(optionsDemo.json, t.origin, 606) }, { session_id: "demo_stalecookie" });
  check(verifyDemo.status === 200 && verifyDemo.json.user?.SystemUserId === 606, "R9 ويكتمل الدخولُ الحقيقيُّ بالكوكي نفسه", verifyDemo.json);
  t.close();

  /* ── العرض المحلي: زائران يتشاركان رقم الحساب ولا يتشاركان المفاتيح ── */
  const realMode = Repository.isDemoMode;
  (Repository as any).isDemoMode = () => true;
  try {
    t = boot();
    addUser(1);
    const ka = new SoftwareAuthenticator(), kb = new SoftwareAuthenticator();
    const A = await t.signedIn(1), B = await t.signedIn(1);
    for (const [who, keyOf, label] of [[A, ka, "جهاز أ"], [B, kb, "جهاز ب"]] as const) {
      const o = await t.call("POST", "/api/passkeys/register/options", {}, who);
      await t.call("POST", "/api/passkeys/register/verify", { response: keyOf.register(o.json, t.origin), label }, who);
    }
    const la = (await t.call("GET", "/api/passkeys", undefined, A)).json.items, lb = (await t.call("GET", "/api/passkeys", undefined, B)).json.items;
    check(la.length === 1 && la[0].label === "جهاز أ" && lb.length === 1 && lb[0].label === "جهاز ب", "R11 زائرا العرض لا يريان أسماءَ بعضهما", { la, lb });
    const cross = await t.call("DELETE", `/api/passkeys/${lb[0].ref}`, undefined, A);
    check(cross.status === 404, "R11 ولا يزيل أحدُهما جهازَ الآخر");
    const loginA = await t.loginWith(ka, 1);
    check(loginA.verify.status === 200, "R11 والدخولُ بأيٍّ منهما يعمل");
    t.close();
  } finally { (Repository as any).isDemoMode = realMode; }
}

async function main() {
  await groupA();
  await groupB();
  await groupC();
  await groupD();
  groupF();
  groupG();
  await groupDemo();
  await groupR();
  await groupE();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
  process.exit(0);
}
void main();
