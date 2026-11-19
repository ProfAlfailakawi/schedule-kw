/**
 * ── «الفرق»: بصمةُ الرئيس وبصمةُ كل عضو، وإسقاطُها من مدير النظام ────────────────
 *
 * خادمٌ صغير بالمسارات الحقيقية (src/server/seatsRoutes.ts و src/server/passkeys.ts)، وهويةُ الجلسة
 * تُقرأ بـ seatIdentity نفسها، وحارسُ العضو seatMemberGuard على مدخل ‎/api‎ كما في server.ts:
 *  S  الرئيس: العددُ بلا معرّفات، و«أسقط البصمة» لمدير النظام وحده (401/403/جلسة عضو)، يُسقطها ولا يمسّ
 *     كلمةَ السر ولا الجلسات، ويُكتب في سجلّ الفريق بمن فعله.
 *  M  العضو: يسجّل جهازه من جلسته (طازجة)، ويدخل به إلى جلسة عضوٍ بنطاقه؛ مفتاحُه لا يفتح جلسةَ الرئيس
 *     ولا العكس؛ العضوُ غيرُ الفعّال لا يدخل؛ إسقاطٌ لكل عضو بفحوصه؛ وإعادةُ التعيين وانتهاءُ العضوية
 *     تُسقطانها؛ وسقفُ خمسة أجهزة.
 *  G  تدقيقُ المصدر: الدخولُ الحقيقيُّ يفتح جلسةَ العضو، والتسليمُ يُسقط بصمةَ الفريق.
 */
import fs from "node:fs";
import express from "express";
import type { AddressInfo } from "node:net";
import { createHash, generateKeyPairSync, randomBytes, sign as ecSign, type KeyObject } from "node:crypto";
import { Repository } from "../src/db/repository";
import { PASSKEY_LIMIT, countMemberPasskeys, registerPasskeyRoutes, revokeMemberPasskeys, revokeSeatMembersPasskeys } from "../src/server/passkeys";
import { getCookies } from "../src/server/core/auth";
import { registerSeatsRoutes, seatMemberGuard } from "../src/server/seatsRoutes";
import { readSeatLedger, seatIdentity, updateSeatLedger } from "../src/server/seats";
import { AR, countOf } from "../src/utils/arabicCount";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ""); }
};
const read = (path: string) => fs.readFileSync(path, "utf8");

/* ── مصادِقٌ برمجيّ (كما في passkey-audit.ts) ─────────────────────────────────── */
const b64u = (bytes: Buffer | Uint8Array | string) => Buffer.from(bytes as any).toString("base64url");
const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest();
function cborHead(major: number, n: number): Buffer {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 256) return Buffer.from([(major << 5) | 24, n]);
  return Buffer.from([(major << 5) | 25, n >> 8, n & 255]);
}
function cbor(value: any): Buffer {
  if (Buffer.isBuffer(value)) return Buffer.concat([cborHead(2, value.length), value]);
  if (typeof value === "string") { const text = Buffer.from(value); return Buffer.concat([cborHead(3, text.length), text]); }
  if (typeof value === "number") return value >= 0 ? cborHead(0, value) : cborHead(1, -1 - value);
  if (value instanceof Map) return Buffer.concat([cborHead(5, value.size), ...[...value].flatMap(([k, v]) => [cbor(k), cbor(v)])]);
  throw new Error("cbor: unsupported");
}
class Authenticator {
  readonly credentialId = randomBytes(32);
  readonly privateKey: KeyObject; readonly publicKey: KeyObject;
  counter = 0;
  constructor() { const pair = generateKeyPairSync("ec", { namedCurve: "P-256" }); this.privateKey = pair.privateKey; this.publicKey = pair.publicKey; }
  /** المقبضُ الذي يحفظه الجهاز من خيارات التسجيل؛ يُعاد عند الدخول كما هو. */
  handle = "";
  register(options: any, origin: string): any {
    this.handle = Buffer.from(String(options.user.id), "base64url").toString("utf8");
    const jwk = this.publicKey.export({ format: "jwk" }) as { x: string; y: string };
    const cose = cbor(new Map<number, any>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, "base64url")], [-3, Buffer.from(jwk.y, "base64url")]]));
    const clientDataJSON = Buffer.from(JSON.stringify({ type: "webauthn.create", challenge: options.challenge, origin, crossOrigin: false }));
    const authData = Buffer.concat([sha256(new URL(origin).hostname), Buffer.from([0x45]), Buffer.alloc(4), Buffer.alloc(16), Buffer.from([0, this.credentialId.length]), this.credentialId, cose]);
    const attestationObject = cbor(new Map<string, any>([["fmt", "none"], ["attStmt", new Map()], ["authData", authData]]));
    return { id: b64u(this.credentialId), rawId: b64u(this.credentialId), type: "public-key", clientExtensionResults: {},
      response: { clientDataJSON: b64u(clientDataJSON), attestationObject: b64u(attestationObject), transports: ["internal"] } };
  }
  assert(options: any, origin: string, handle = this.handle): any {
    const count = Buffer.alloc(4); count.writeUInt32BE(++this.counter);
    const clientDataJSON = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: options.challenge, origin, crossOrigin: false }));
    const authData = Buffer.concat([sha256(new URL(origin).hostname), Buffer.from([0x05]), count]);
    const signature = ecSign("sha256", Buffer.concat([authData, sha256(clientDataJSON)]), this.privateKey);
    return { id: b64u(this.credentialId), rawId: b64u(this.credentialId), type: "public-key", clientExtensionResults: {},
      response: { clientDataJSON: b64u(clientDataJSON), authenticatorData: b64u(authData), signature: b64u(signature), userHandle: b64u(handle) } };
  }
}

/* ── حساباتٌ وصلاحياتٌ في الذاكرة ─────────────────────────────────────────── */
const SEAT = 7301, ADMIN = 1, ADMIN_NO_PERM = 7302, OTHER = 7303;
const M1 = "m_aaaaaaaaaaa1", M2 = "m_bbbbbbbbbbb2", M3 = "m_ccccccccccc3";
const PASSWORD_HASH = Repository.hashPassword(randomBytes(12).toString("base64url"));
const users: Record<number, any> = {
  [ADMIN]: { SystemUserId: ADMIN, SystemUserLogin: "admin", Name: "مدير النظام", IsAdminUser: true, IsActive: true, IsLocked: false, IsDeleted: false, SystemUserPass: PASSWORD_HASH },
  [ADMIN_NO_PERM]: { SystemUserId: ADMIN_NO_PERM, SystemUserLogin: "admin2", Name: "مدير بلا شاشة", IsAdminUser: true, IsActive: true, IsLocked: false, IsDeleted: false, SystemUserPass: PASSWORD_HASH },
  [OTHER]: { SystemUserId: OTHER, SystemUserLogin: "other", Name: "مستخدم", Role: "standard", IsActive: true, IsLocked: false, IsDeleted: false, SystemUserPass: PASSWORD_HASH },
  [SEAT]: { SystemUserId: SEAT, SystemUserLogin: "chair-7301", Name: "رئيس لجنة الجدول — قسم التجربة", Role: "committeeChair", IsActive: true, IsLocked: false, IsDeleted: false, MustChangePassword: false, SystemUserPass: PASSWORD_HASH },
};
const permissionsOf: Record<number, number[]> = { [ADMIN]: [11], [ADMIN_NO_PERM]: [], [OTHER]: [11], [SEAT]: [1] };
const SEAT_SCOPES = [{ AdCollegeId: 9, AdSectionId: 3 }];
Object.assign(Repository as any, {
  getUserById: async (id: number) => users[Number(id)],
  getUsers: async () => Object.values(users),
  updateUser: async (id: number, patch: any) => { users[Number(id)] = { ...users[Number(id)], ...patch }; },
  getSecurityByUser: async (id: number) => (permissionsOf[Number(id)] || []).map(FormNameId => ({ FormNameId })),
  getUserAssigns: async (id: number) => (Number(id) === SEAT ? SEAT_SCOPES : []),
  getCollegeUserAssigns: async () => SEAT_SCOPES.map(row => ({ ...row, SystemUserId: SEAT })),
  getColleges: async () => [{ AdCollegeId: 9, AdCollegeName: "كلية التجربة" }],
  getSections: async () => [{ AdCollegeId: 9, AdSectionId: 3, AdSectionName: "قسم التجربة" }],
  getInstructors: async () => [],
});

function boot() {
  const app = express();
  app.use(express.json());
  /* الهويةُ كما يقرؤها authMiddleware: الجلسة ← الحساب ← seatIdentity (الرئيس أو العضو ونطاقه). */
  app.use(async (req: any, _res, next) => {
    const session = await Repository.getSession(getCookies(req)["session_id"] || "");
    const user = session ? users[session.userId] : undefined;
    if (session && user && user.IsActive && !user.IsLocked && !user.IsDeleted) {
      const identity = await seatIdentity(user, session.memberId, await Repository.getUserAssigns(user.SystemUserId), permissionsOf[user.SystemUserId] || []);
      if (identity) { req.user = identity.user; req.scopes = identity.scopes; req.permissions = identity.permissions; }
    }
    next();
  });
  app.use("/api", seatMemberGuard as any);
  registerSeatsRoutes(app);
  registerPasskeyRoutes(app, {
    /* كما signInSession في authRoutes.ts: جلسةٌ تحمل العضو، وحمولةٌ من seatIdentity. */
    signIn: async (_req, res, user, memberId) => {
      const sessionId = `sess_${randomBytes(32).toString("hex")}`;
      await Repository.createSession(sessionId, user.SystemUserId, 600_000, memberId ? { memberId } : {});
      const seated = await seatIdentity(user, memberId, await Repository.getUserAssigns(user.SystemUserId), permissionsOf[user.SystemUserId] || []);
      if (!seated) { res.status(403).json({ code: "member-inactive" }); return; }
      res.setHeader("Set-Cookie", `session_id=${sessionId}; Path=/; HttpOnly`);
      res.json({ user: seated.user, scopes: seated.scopes, sessionId });
    },
    startDemo: async res => { res.json({ demo: true }); },
  });
  const server = app.listen(0);
  const origin = `http://localhost:${(server.address() as AddressInfo).port}`;
  const jar = new Map<string, string>();
  const call = async (method: string, path: string, body?: unknown, cookies?: Record<string, string>) => {
    const header = Object.entries({ ...Object.fromEntries(jar), ...cookies }).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(origin + path, { method, headers: { "content-type": "application/json", ...(header ? { cookie: header } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";"); const at = pair.indexOf("=");
      if (pair.slice(0, at) === "pk_challenge") jar.set(pair.slice(0, at), pair.slice(at + 1));
    }
    const text = await res.text();
    let json: any = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
  };
  const session = async (userId: number, memberId = "", age = 0) => {
    const sessionId = `sess_${randomBytes(32).toString("hex")}`;
    await Repository.createSession(sessionId, userId, 600_000, memberId ? { memberId } : {});
    if (age) { const row = await Repository.getSession(sessionId); if (row) (row as any).createdAt = Date.now() - age; }
    return { session_id: sessionId };
  };
  const enroll = async (who: Record<string, string>, key: Authenticator) => {
    const options = await call("POST", "/api/passkeys/register/options", {}, who);
    if (options.status !== 200) return options;
    return call("POST", "/api/passkeys/register/verify", { response: key.register(options.json, origin), label: "هاتفي" }, who);
  };
  const login = async (key: Authenticator, handle?: string) => {
    const options = await call("POST", "/api/auth/passkey/login/options", {});
    return call("POST", "/api/auth/passkey/login/verify", { response: key.assert(options.json, origin, handle) });
  };
  return { call, session, enroll, login, close: () => server.close() };
}

const lastEvent = async () => { const ledger = await readSeatLedger(SEAT); return ledger?.history[ledger.history.length - 1]; };

async function main() {
  await updateSeatLedger(SEAT, ledger => ({
    next: {
      ...ledger,
      holder: { name: "د. الرئيس", since: new Date().toISOString(), by: "مدير النظام" },
      members: [M1, M2, M3].map((id, index) => ({ id, status: "active" as const, name: `عضو ${index + 1}`, addedAt: new Date().toISOString(), addedBy: "مدير النظام", linkToken: `tok${index}${randomBytes(8).toString("hex")}` })),
    },
    result: true,
  }));
  let t = boot();
  const admin = await t.session(ADMIN);
  const adminNoPerm = await t.session(ADMIN_NO_PERM);
  const other = await t.session(OTHER);
  let holder = await t.session(SEAT);
  const member1 = await t.session(SEAT, M1);

  /* ── S: الرئيس ── */
  let view = await t.call("GET", `/api/seats/${SEAT}`, undefined, admin);
  check(view.status === 200 && view.json.passkeys === 0, "S1 لوحةُ الفريق لمدير النظام: «غير مفعّلة» (صفر)", view.json?.passkeys);
  const holderKey = new Authenticator();
  const enrolled = await t.enroll(holder, holderKey);
  check(enrolled.status === 200 && holderKey.handle === `u${SEAT}`, "S2 الرئيس يسجّل جهازه بمقبض الحساب", enrolled.json);
  view = await t.call("GET", `/api/seats/${SEAT}`, undefined, admin);
  const credential = b64u(holderKey.credentialId);
  check(view.json.passkeys === 1 && !view.text.includes(credential) && !view.text.includes("هاتفي"), "S3 العددُ وحده: لا معرّفُ اعتمادٍ ولا اسمُ جهاز", view.json.passkeys);
  const listing = await t.call("GET", "/api/seats", undefined, admin);
  const row = listing.json?.seats?.find((seat: any) => seat.id === SEAT);
  check(row?.passkeys === 1 && !listing.text.includes(credential) && !listing.text.includes("هاتفي"), "S4 قائمةُ الفرق تحمل العددَ وحده", row);
  const holderView = await t.call("GET", `/api/seats/${SEAT}`, undefined, holder);
  check(holderView.status === 200 && holderView.json.passkeys === null, "S5 الرئيسُ في لوحته لا يُعطى العدد (لمدير النظام وحده)", holderView.json?.passkeys);

  const revokePath = `/api/seats/${SEAT}/passkeys/revoke`;
  const anonymous = await t.call("POST", revokePath, {}, { session_id: "" });
  check(anonymous.status === 401, "S6 بلا جلسة: 401", anonymous.status);
  const noPerm = await t.call("POST", revokePath, {}, adminNoPerm);
  check(noPerm.status === 403, "S7 مديرٌ بلا شاشة المستخدمين (11): 403", noPerm.status);
  const notPower = await t.call("POST", revokePath, {}, other);
  check(notPower.status === 403, "S8 مستخدمٌ ليس مديرَ النظام ولو بالصلاحية 11: 403", notPower.status);
  const byHolder = await t.call("POST", revokePath, {}, holder);
  check(byHolder.status === 403, "S9 الرئيسُ نفسُه لا يُسقطها من «الفرق»: 403", byHolder.status);
  const byMember = await t.call("POST", revokePath, {}, member1);
  check(byMember.status === 403 && byMember.json?.code === "seat-member", "S10 جلسةُ عضو الفريق تُرفض بحارس العضو", byMember.json);
  check((await t.call("GET", `/api/seats/${SEAT}`, undefined, admin)).json.passkeys === 1, "S11 والرفضُ لا يُسقط شيئاً");

  const holderOther = await t.session(SEAT);
  const dropped = await t.call("POST", revokePath, {}, admin);
  check(dropped.status === 200 && dropped.json.passkeys === 0 && Object.keys(dropped.json).length === 1, "S12 مديرُ النظام يُسقطها ويُردّ العددُ الجديد وحده", dropped.json);
  check((await t.login(holderKey)).status === 400, "S13 الجهازُ المُسقَط لا يدخل");
  check(users[SEAT].SystemUserPass === PASSWORD_HASH && !users[SEAT].MustChangePassword, "S14 كلمةُ السر كما هي");
  check(!(await Repository.getSession(holder.session_id)) && !(await Repository.getSession(holderOther.session_id)) && (await t.call("GET", "/api/seats/mine", undefined, holder)).status === 401, "S15 والرئيسُ يخرج من كل جهاز (هاتفٌ ضاع)");
  check(Boolean(await Repository.getSession(member1.session_id)), "S15 وجلساتُ الأعضاء بروابطهم باقية");
  holder = await t.session(SEAT);
  let event = await lastEvent();
  check(event?.kind === "passkeys-revoked" && event.by === "مدير النظام" && event.detail.includes(countOf(1, AR.device)) && event.detail.includes("كل جهاز"), "S16 سطرٌ في سجلّ الفريق بمن فعله وأنه خرج من كل جهاز", event);

  /* ── M: العضو ── */
  const memberKey = new Authenticator();
  const memberEnroll = await t.enroll(member1, memberKey);
  check(memberEnroll.status === 200 && memberKey.handle === `m${SEAT}.${M1}`, "M1 العضوُ يسجّل جهازه من جلسته بمقبضٍ للعضو لا للحساب", { status: memberEnroll.status, json: memberEnroll.json, handle: memberKey.handle });
  const ownList = await t.call("GET", "/api/passkeys", undefined, member1);
  check(ownList.status === 200 && ownList.json.items.length === 1, "M2 العضوُ يرى أجهزته هو", ownList.json);
  const holderList = await t.call("GET", "/api/passkeys", undefined, holder);
  check(holderList.status === 200 && holderList.json.items.length === 0, "M2 والرئيسُ لا يرى جهازَ العضو في قائمته", holderList.json);
  const stale = await t.session(SEAT, M2, 11 * 60_000);
  const staleOptions = await t.call("POST", "/api/passkeys/register/options", {}, stale);
  check(staleOptions.status === 403 && staleOptions.json.code === "member-fresh", "M3 جلسةُ عضوٍ قديمة لا تسجّل (يدخل برابطه من جديد)", staleOptions.json);

  const memberLogin = await t.login(memberKey);
  const opened = memberLogin.json?.sessionId ? await Repository.getSession(memberLogin.json.sessionId) : undefined;
  check(memberLogin.status === 200 && opened?.memberId === M1 && Number(opened?.userId) === SEAT, "M4 الدخولُ ببصمة العضو يفتح جلسةَ عضوٍ على الكرسي", { status: memberLogin.status, opened });
  check(memberLogin.json?.user?.SeatActor?.kind === "member" && memberLogin.json.user.SeatActor.memberId === M1 && JSON.stringify(memberLogin.json.scopes) === JSON.stringify(SEAT_SCOPES), "M5 بصفة العضو ونطاقه", memberLogin.json?.user?.SeatActor);
  const asMember = await t.call("POST", revokePath, {}, { session_id: memberLogin.json.sessionId });
  check(asMember.status === 403 && asMember.json?.code === "seat-member", "M6 والجلسةُ المفتوحة بالبصمة يحرسها حارسُ العضو", asMember.json);
  const forgedHolder = await t.login(memberKey, `u${SEAT}`);
  check(forgedHolder.status === 400 && !forgedHolder.json?.sessionId, "M7 مفتاحُ العضو لا يفتح جلسةَ الرئيس", forgedHolder.json);
  const holderKey2 = new Authenticator();
  await t.enroll(holder, holderKey2);
  const forgedMember = await t.login(holderKey2, `m${SEAT}.${M1}`);
  check(forgedMember.status === 400 && !forgedMember.json?.sessionId, "M8 ومفتاحُ الرئيس لا يفتح جلسةَ عضو", forgedMember.json);
  const holderLogin = await t.login(holderKey2);
  const holderOpened = holderLogin.json?.sessionId ? await Repository.getSession(holderLogin.json.sessionId) : undefined;
  check(holderLogin.status === 200 && holderOpened && !holderOpened.memberId, "M8 ومفتاحُ الرئيس يفتح جلسةَ الرئيس بلا عضو", holderOpened);

  view = await t.call("GET", `/api/seats/${SEAT}`, undefined, admin);
  const m1Row = view.json.team.members.find((m: any) => m.id === M1);
  const m2Row = view.json.team.members.find((m: any) => m.id === M2);
  check(m1Row?.passkeys === 1 && m2Row?.passkeys === 0 && !view.text.includes(b64u(memberKey.credentialId)), "M9 كلُّ عضوٍ بعدده بجانب اسمه، بلا معرّفات", { m1: m1Row?.passkeys, m2: m2Row?.passkeys });
  check(view.json.team.members.every((m: any) => !("credentialIds" in m) && !("refs" in m)), "M9 ولا حقلَ آخرَ للأجهزة");

  /* الإسقاطُ لكل عضو */
  const memberRevoke = `/api/seats/${SEAT}/members/${M1}/passkeys/revoke`;
  check((await t.call("POST", memberRevoke, {}, { session_id: "" })).status === 401, "M10 بلا جلسة: 401");
  check((await t.call("POST", memberRevoke, {}, adminNoPerm)).status === 403, "M10 مديرٌ بلا الشاشة 11: 403");
  check((await t.call("POST", memberRevoke, {}, other)).status === 403, "M10 من ليس مديرَ النظام: 403");
  check((await t.call("POST", memberRevoke, {}, holder)).status === 403, "M10 الرئيسُ: 403");
  const memberRefused = await t.call("POST", memberRevoke, {}, member1);
  check(memberRefused.status === 403 && memberRefused.json?.code === "seat-member", "M10 جلسةُ العضو نفسه: 403 بحارس العضو", memberRefused.json);
  const unknown = await t.call("POST", `/api/seats/${SEAT}/members/m_zzzzzzzzzzzz/passkeys/revoke`, {}, admin);
  check(unknown.status === 404, "M10 عضوٌ ليس في الفريق: 404", unknown.status);
  const notSeat = await t.call("POST", `/api/seats/${OTHER}/members/${M1}/passkeys/revoke`, {}, admin);
  check(notSeat.status === 404, "M10 حسابٌ ليس فريقاً: 404", notSeat.status);
  const member2Session = await t.session(SEAT, M2);
  const memberDropped = await t.call("POST", memberRevoke, {}, admin);
  check(memberDropped.status === 200 && memberDropped.json.passkeys === 0 && Object.keys(memberDropped.json).length === 1, "M11 مديرُ النظام يُسقط بصمةَ العضو، والردُّ العددُ وحده", memberDropped.json);
  check((await t.login(memberKey)).status === 400, "M11 والعضوُ لا يدخل بها بعدُ");
  check(!(await Repository.getSession(member1.session_id)) && !(await Repository.getSession(memberLogin.json.sessionId)), "M11 ويخرج العضوُ من كل جهاز");
  check(Boolean(await Repository.getSession(holder.session_id)) && Boolean(await Repository.getSession(member2Session.session_id)), "M11 وتبقى جلساتُ الرئيس والأعضاء الآخرين");
  check(Boolean((await readSeatLedger(SEAT))?.members.find(m => m.id === M1)?.linkToken), "M11 ورابطُه باقٍ");
  event = await lastEvent();
  check(event?.kind === "passkeys-revoked" && event.by === "مدير النظام" && event.detail.startsWith("عضو 1"), "M12 سطرٌ في سجلّ الفريق باسم العضو ومن فعله", event);
  check((await t.call("GET", "/api/passkeys", undefined, holder)).json.items.length === 1, "M12 وبصمةُ الرئيس لا تتأثّر");

  /* عضوٌ لم يعد فعّالاً: يُرفض عند الدخول ولو بقي مفتاحُه. (خادمٌ جديد: حدُّ المعدّل لكل نسخة.) */
  t.close(); t = boot();
  const m2Session = await t.session(SEAT, M2);
  const m2Key = new Authenticator();
  check((await t.enroll(m2Session, m2Key)).status === 200 && (await t.login(m2Key)).status === 200, "M13 العضو الثاني يسجّل ويدخل");
  await updateSeatLedger(SEAT, ledger => ({ next: { ...ledger, members: ledger.members.map(m => m.id === M2 ? { ...m, status: "frozen" as const } : m) }, result: true }));
  const frozen = await t.login(m2Key);
  check(frozen.status === 403 && frozen.json?.code === "member-inactive" && !frozen.json?.sessionId, "M13 عضوٌ مجمَّد لا يدخل بالبصمة", frozen.json);
  await updateSeatLedger(SEAT, ledger => ({ next: { ...ledger, members: ledger.members.map(m => m.id === M2 ? { ...m, status: "active" as const } : m) }, result: true }));
  users[SEAT] = { ...users[SEAT], IsLocked: true };
  const locked = await t.login(m2Key);
  users[SEAT] = { ...users[SEAT], IsLocked: false };
  check(locked.status === 403 && !locked.json?.sessionId, "M14 كرسيٌّ مقفل لا يُدخل أعضاءه بالبصمة", locked.json);
  const ended = await t.call("POST", `/api/seats/${SEAT}/members/${M2}/status`, { status: "ended" }, admin);
  check(ended.status === 200 && (await t.login(m2Key)).status === 400, "M15 انتهاءُ العضوية يُسقط بصمتَه", ended.status);

  /* إعادةُ تعيين دخول العضو تُسقطها */
  t.close(); t = boot();
  const m3Session = await t.session(SEAT, M3);
  const m3Key = new Authenticator();
  await t.enroll(m3Session, m3Key);
  const reset = await t.call("POST", `/api/seats/${SEAT}/members/${M3}/reset`, {}, admin);
  check(reset.status === 200 && (await t.login(m3Key)).status === 400, "M16 إعادةُ تعيين دخول العضو تُسقط بصمتَه", reset.status);

  /* السقف */
  t.close(); t = boot();
  const fresh = await t.session(SEAT, M1);
  const results = [];
  for (let i = 0; i < PASSKEY_LIMIT; i++) results.push((await t.enroll(fresh, new Authenticator())).status);
  const over = await t.call("POST", "/api/passkeys/register/options", {}, fresh);
  check(results.every(status => status === 200) && over.status === 409 && over.json.code === "passkey-limit", `M17 سقفُ العضو ${countOf(PASSKEY_LIMIT, AR.device)}`, { results, over: over.json });
  check((await t.call("GET", "/api/passkeys", undefined, holder)).json.items.length === 1, "M17 وسقفُ العضو منفصلٌ عن الرئيس");

  /* ── R: السباقات والفشل ── */
  t.close(); t = boot();
  /* M1 ممتلئ (السقف)؛ يُفرَّغ ليُختبر التسجيل من جديد. */
  await revokeMemberPasskeys(SEAT, M1);
  const realUpdate = Repository.updateFeatureDoc, realSave = Repository.saveFeatureDoc;
  /* R1 تُغلق الجلسةُ بين كتابة المفتاح وإلحاقه بالحالة (إعادةُ تعيين أو انتهاءُ عضوية في الأثناء) */
  let raceSession = await t.session(SEAT, M1);
  (Repository as any).updateFeatureDoc = async (collection: string, id: string, fn: any) => {
    const out = await (realUpdate as any)(collection, id, fn);
    if (collection === "passkeyState" && String(id).includes(M1)) await Repository.deleteSessionsForUser(SEAT, M1);
    return out;
  };
  const raced = await t.enroll(raceSession, new Authenticator());
  (Repository as any).updateFeatureDoc = realUpdate;
  check(raced.status === 401 && raced.json?.code === "session-ended" && (await countMemberPasskeys(SEAT, M1)) === 0, "R1 مفتاحٌ كُتب وجلستُه تُغلق في الأثناء يُسحب", raced.json);
  /* R2 يُسقط المسؤولُ البصمةَ بين قراءة الحالة وإلحاق المفتاح */
  raceSession = await t.session(SEAT, M1);
  (Repository as any).updateFeatureDoc = async (collection: string, id: string, fn: any) => {
    if (collection === "passkeys") { const out = await (realUpdate as any)(collection, id, fn); (Repository as any).updateFeatureDoc = realUpdate; await revokeMemberPasskeys(SEAT, M1); return out; }
    return (realUpdate as any)(collection, id, fn);
  };
  const late = await t.enroll(raceSession, new Authenticator());
  (Repository as any).updateFeatureDoc = realUpdate;
  check(late.status === 409 && late.json?.code === "passkey-revoked" && (await countMemberPasskeys(SEAT, M1)) === 0, "R2 مفتاحٌ وُلد قبل الإسقاط لا يُلحق بعده", late.json);
  /* R3 العدُّ بمرشّح القائمة والدخول: علامةُ الإسقاط وحدها تُصفّره ولو بقيت المعرّفات */
  const countKey = new Authenticator();
  check((await t.enroll(await t.session(SEAT, M1), countKey)).status === 200 && (await countMemberPasskeys(SEAT, M1)) === 1, "R3 جهازٌ يُعدّ");
  await realUpdate.call(Repository, "passkeyState" as any, `${SEAT}~${M1}`, (current: any) => ({ next: { ...current, revokedAt: Date.now() + 60_000 }, result: true }));
  const adminView = await t.call("GET", `/api/seats/${SEAT}`, undefined, admin);
  check((await countMemberPasskeys(SEAT, M1)) === 0 && adminView.json.team.members.find((m: any) => m.id === M1)?.passkeys === 0, "R3 ما قبل حدّ الإسقاط لا يُعدّ (كما لا يدخل)");
  await realUpdate.call(Repository, "passkeyState" as any, `${SEAT}~${M1}`, (current: any) => ({ next: { ...current, revokedAt: 0, credentialIds: [] }, result: true }));
  /* R4 إعادةُ تعيين العضو والإسقاطُ يتعذّر: الجلساتُ خرجت قبله */
  await updateSeatLedger(SEAT, ledger => ({ next: { ...ledger, members: ledger.members.map(m => m.id === M3 ? { ...m, status: "active" as const } : m) }, result: true }));
  const m3Open = await t.session(SEAT, M3);
  (Repository as any).updateFeatureDoc = async (collection: string, ...rest: any[]) => { if (collection === "passkeyState") throw new Error("boom"); return (realUpdate as any)(collection, ...rest); };
  /* Express 4 لا يلتقط رفضَ الدالة غير المتزامنة: الخادمُ يسجّله (server.ts) والطلبُ لا يكتمل؛ المهمّ ما بقي مفتوحاً. */
  const swallow = () => undefined; process.on("unhandledRejection", swallow);
  const failedReset = await Promise.race([t.call("POST", `/api/seats/${SEAT}/members/${M3}/reset`, {}, admin), new Promise<{ status: number }>(resolve => setTimeout(() => resolve({ status: 599 }), 1500))]);
  (Repository as any).updateFeatureDoc = realUpdate;
  process.off("unhandledRejection", swallow);
  check(failedReset.status >= 500 && !(await Repository.getSession(m3Open.session_id)), "R4 تعذّرُ الإسقاط لا يُبقي جلسةَ العضو مفتوحة (تخرج أولاً)", failedReset.status);
  /* R5 إسقاطُ بصمة الفريق كلِّه: يحاول الجميع، ويرمي إن تعذّر أحدُهم */
  const teamKey = new Authenticator();
  await t.enroll(await t.session(SEAT, M3), teamKey);
  check((await t.login(teamKey)).status === 200, "R5 عضوٌ يدخل ببصمته");
  check((await revokeSeatMembersPasskeys(SEAT)) >= 1 && (await t.login(teamKey)).status === 400, "R5 إسقاطُ بصمة الفريق يُغلقها");
  (Repository as any).updateFeatureDoc = async (collection: string, ...rest: any[]) => { if (collection === "passkeyState") throw new Error("boom"); return (realUpdate as any)(collection, ...rest); };
  let threw = false;
  try { await revokeSeatMembersPasskeys(SEAT); } catch { threw = true; }
  (Repository as any).updateFeatureDoc = realUpdate;
  void realSave;
  check(threw, "R5 وتعذّرُه يُرمى ولا يُبتلع");
  t.close();

  /* ── G: تدقيقُ المصدر ── */
  const auth = read("src/server/routes/authRoutes.ts");
  check(/signIn: \(req, res, user, memberId\) => signInSession\(req, res, user, false, memberId\)/.test(auth) && /memberId \? \{ memberId \}/.test(auth) && /seatIdentity\(user, memberId,/.test(auth),
    "G1 الدخولُ الحقيقيُّ بالبصمة يفتح جلسةَ العضو نفسَها (memberId) ويقرأ هويته كما تُقرأ بعده");
  const seats = read("src/server/seatsRoutes.ts");
  const handover = seats.slice(seats.indexOf('app.post("/api/seats/:id/handover"'), seats.indexOf('app.post("/api/seats/:id/first-password"'));
  check(handover.includes("revokeSeatMembersPasskeys(") && handover.indexOf("resetSeatCredentials(") < handover.indexOf("revokeSeatMembersPasskeys(") && /try \{ await revokeSeatMembersPasskeys/.test(handover),
    "G2 التسليم: الرئيسُ السابق يخرج أولاً (كلمةٌ وبصمةٌ وجلسات)، ثم بصمةُ الفريق، وتعذّرُها يُبلَّغ ولا يُبقيه داخلاً");
  check(/"\/api\/seats\/:id\/passkeys\/revoke", requirePowerAdmin, resetLimit, seatAdmin/.test(seats) && /"\/api\/seats\/:id\/members\/:mid\/passkeys\/revoke", requirePowerAdmin, resetLimit, seatAdmin/.test(seats), "G3 المساران لمدير النظام بالشاشة 11 وبحدّ");
  const routes = seats.slice(seats.indexOf('app.post("/api/seats/:id/passkeys/revoke"'), seats.indexOf('app.post("/api/seats/:id/members", requireAuth'));
  check(!/applyPasswordReset|hashPassword|revokeSeatLink|issueMemberLink/.test(routes) && (routes.match(/dropPasskeysAndSessions\(/g) || []).length === 2, "G4 الإسقاطُ يُخرج صاحبه ولا يمسّ كلمةَ السر ولا الرابط");
  const drop = seats.slice(seats.indexOf("async function dropPasskeysAndSessions"), seats.indexOf("async function resetSeatCredentials"));
  check(/deleteSessionsForUser\(seatId, memberId\);\n\s+authCache\.clear\(\);\n\s+const dropped = [^\n]+\n\s+await Repository\.deleteSessionsForUser\(seatId, memberId\);\n\s+authCache\.clear\(\);/.test(drop), "G6 خروجٌ ثم إسقاطٌ ثم خروج: لا بابَ بين الخطوتين");
  const resetRoute = seats.slice(seats.indexOf('app.post("/api/seats/:id/members/:mid/reset"'), seats.indexOf('app.post("/api/seats/:id/members/:mid/status"'));
  const status = seats.slice(seats.indexOf('app.post("/api/seats/:id/members/:mid/status"'), seats.indexOf('app.post("/api/seats/:id/members/:mid/scopes"'));
  check(resetRoute.indexOf("deleteSessionsForUser") < resetRoute.indexOf("revokeMemberPasskeys") && status.indexOf("deleteSessionsForUser") < status.indexOf("revokeMemberPasskeys"), "G7 إعادةُ التعيين وانتهاءُ العضوية: الجلساتُ تخرج قبل الإسقاط");
  const usersRoutes = read("src/server/routes/usersRoutes.ts");
  check(/if \(resetsAnotherUser \|\| \(before\.IsActive && !fields\.IsActive\) \|\| \(!before\.IsLocked && fields\.IsLocked\)\) await revokeSeatMembersPasskeys\(id\);/.test(usersRoutes) && /await revokeUserPasskeys\(id\);\n\s+await revokeSeatMembersPasskeys\(id\);\n\s+await Repository\.deleteUser/.test(usersRoutes),
    "G8 شاشةُ المستخدمين: قفلُ حساب الرئيس أو إيقافُه أو إعادةُ تعيين كلمته أو حذفُه يُسقط بصمةَ فريقه");
  const passkeysSource = read("src/server/passkeys.ts");
  check(/if \(Number\(base\.revokedAt \|\| 0\) >= row\.createdAtMs\) return \{ refuse: false \};/.test(passkeysSource) && /await stillEntitled\(principal, sessionId\)/.test(passkeysSource), "G9 التسجيلُ يرفض الإلحاق بعد إسقاط، ويتحقّق من الجلسة بعد الكتابة");
  check(!/listUserPasskeys|credentialId|passkeyRef|publicView/.test(seats), "G5 «الفرق» لا تقرأ إلا العدد (لا معرّفاتٍ ولا أسماء أجهزة)");

  /* ── U: الواجهة ── */
  const panel = read("src/components/seats/SeatPanel.tsx"), adminScreen = read("src/components/seats/SeatsAdmin.tsx");
  check(/export const passkeyChip = \(count: number\) => `البصمة: \$\{count > 0 \? countOf\(count, AR\.device\) : "غير مفعّلة"\}`/.test(panel), "U1 الشارة: «البصمة: …» بمساعد العدّ، أو «غير مفعّلة»");
  check([1, 2, 3, 11].map(n => countOf(n, AR.device)).join("|") === "جهاز واحد|جهازان|3 أجهزة|11 جهازاً", "U2 جهاز واحد / جهازان / 3 أجهزة / 11 جهازاً");
  const drops = panel.match(/<button[^>]*>[^<]*<Fingerprint aria-hidden="true" \/> أسقط البصمة<\/button>/g) || [];
  check(drops.length === 2 && drops.every(tag => /data-guide-ignore="إسقاط بصمة [^"]+"/.test(tag)), "U3 زرّا «أسقط البصمة» (الرئيس وكل عضو) بوصفٍ للمرشد كجيرانهما", drops.length);
  check(/\{detail\.passkeys \? <button/.test(panel) && /\{member\.passkeys \? <button/.test(panel), "U4 الزرّ لا يظهر إلا والعددُ أكبر من صفر");
  check((panel.match(/visualConfirm\(\{ title: `إسقاط بصمة/g) || []).length === 2, "U5 كلاهما بعد تأكيدٍ مرئي");
  check(/\{typeof member\.passkeys === "number" \? <em className=\{`seat-passkeys/.test(panel) && /typeof detail\.passkeys === "number"/.test(panel), "U6 الشارة بجانب اسم كل عضو وبجانب الرئيس");
  check(/passkeyChip\(row\.passkeys\)/.test(adminScreen), "U7 وفي قائمة الفرق وسمٌ بالعدد");

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
void main().catch(error => { console.error(error); process.exit(1); });
