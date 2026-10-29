/**
 * ── تنبيهاتُ الجوال (Web Push): البروتوكول، ومن يستحق، وما يُقال ─────────────
 *
 *   ١) التشفير (RFC 8291/8188) يقرؤه فاكٌّ مستقلّ مكتوبٌ من نصّ المعيار؛ ولا مفتاحَ مكتوباً في الملف — كلُّها تُولَّد عند التشغيل.
 *   ٢) توقيعُ VAPID (RFC 8292) يُتحقَّق منه بالمفتاح العام عبر طريقٍ مستقل (SPKI)،
 *      وفيه aud وexp (≤ 24 ساعة) وsub؛ والمفتاحُ مشتقٌّ ثابت، ومفتاحا المشغّل زوجٌ واحد.
 *   ٣) الاشتراك: جهازٌ واحد سجلٌّ واحد، ويُمحى بـ 410/404، ورابطٌ خارج خدمات الدفع يُرفض.
 *   ٤) نصُّ الأستاذ بلا قاعة: لا رمزَ ولا اسم، ولو حمل اسمُ المقرر رمزَ قاعته.
 *   ٥) الحدّ لكل اشتراك، والعددُ يُقرأ لحظةَ الإرسال، وتهدئةُ القسم في قاعدة البيانات (لا مؤقّت).
 *   ٦) الأحداثُ في صندوق العرض: 📥 لمنسّق النطاق وحده، ✅ إلى كرت الأستاذ، وكرتٌ
 *      أُوقف لا يُدفع إليه وتُمحى اشتراكاته؛ والمسارات عبر HTTP.
 *   ٧) العامل: push وnotificationclick، وfetch لا يبدّل إلا جوابَ الخطأ؛ والاستعادةُ لا تُسقطه؛ وsw.js لا يقدّم
 *      كرتَ الأستاذ من هيكل التطبيق؛ والكرتُ تطبيقُ «بطاقتي» على الشاشة الرئيسية.
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify } from "crypto";
import express from "express";
import {
  b64u, collectPages, createPushRateLimiter, createVapidKeyResolver, decryptPushPayload, deriveVapidKeys, encryptPushPayload,
  fromB64u, isAllowedPushEndpoint, PUSH_MAX_PLAINTEXT, pushSubscriptionId, readPushSubscription, sendWebPush, vapidAuthorization,
  vapidJwt, vapidKeysFromEnv, vapidKeysFromPrivate, VAPID_SUBJECT, verifyVapidJwt, type PushSubscriptionRecord,
} from "../src/server/webPush";
import {
  adminRepliesMessage, adminRequestsMessage, cardTestMessage, messageMentionsRoom, roomTokensOf, scrubRooms, taWindowMessage,
  teacherDigestMessage, teacherEventFor,
} from "../src/server/pushMessages";
import { cardManifest, CARD_TOKEN_PATTERN, PUSH_CARD_CSS, PUSH_CARD_JS, pushCardHead } from "../src/server/pushCard";
import { ADMIN_COOLDOWN_MS, awaitingInScope, HOOK_WAIT_MS, pushHooks, registerPushRoutes } from "../src/server/pushRoutes";
import { isPushWorkerRegistration, unregisterAppWorkers } from "../src/utils/pushClient";
import { roleWriteDecision } from "../src/server/roleGuard";
import { Repository } from "../src/db/repository";
import { readServerSource } from "./helpers/serverSource.mjs";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const between = (text: string, start: string, end: string) => { const at = text.indexOf(start); return at < 0 ? "" : text.slice(at, text.indexOf(end, at + start.length)); };
const waitFor = async (ok: () => boolean | Promise<boolean>, ms = 5000) => { const until = Date.now() + ms; while (!(await ok()) && Date.now() < until) await new Promise(r => setTimeout(r, 10)); return ok(); };

/* ══ ١) التشفير: RFC 8291 فوق RFC 8188، بفاكٍّ مستقلّ ═══════════════════════════
   لا مفتاحَ مكتوباً في هذا الملف: كلُّ مفتاحٍ يُولَّد عند التشغيل. والفاكُّ هنا يُكتب من نصّ
   المعيارين مباشرةً بـ hkdfSync (لا بسلسلة HMAC التي يستعملها الخادم)، فإن اتّفقا فالترتيبُ
   والمعلوماتُ والطولُ كما في المعيار. (والتطابقُ مع متجه الملحق A تحقّقنا منه يدوياً عند البناء.) */
function independentDecode(body: Buffer, receiver: ReturnType<typeof createECDH>, authSecret: Buffer) {
  const salt = body.subarray(0, 16);
  const rs = body.readUInt32BE(16);
  const idlen = body[20];
  const keyid = body.subarray(21, 21 + idlen);
  const sealed = body.subarray(21 + idlen);
  const uaPublic = receiver.getPublicKey();
  /* RFC 8291 §3.3–3.4: IKM = HKDF(salt=auth_secret, ikm=ecdh_secret, info="WebPush: info"‖0‖ua_public‖as_public, 32) */
  const ikm = Buffer.from(hkdfSync("sha256", receiver.computeSecret(keyid), authSecret, Buffer.concat([Buffer.from("WebPush: info\0", "latin1"), uaPublic, keyid]), 32));
  /* RFC 8188 §2.2–2.3 */
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0", "latin1"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0", "latin1"), 12));
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(sealed.subarray(sealed.length - 16));
  const padded = Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - 16)), decipher.final()]);
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end -= 1;
  return { salt, rs, idlen, keyid, delimiter: padded[end], plaintext: padded.subarray(0, end).toString("utf8") };
}
{
  const receiver = createECDH("prime256v1"); receiver.generateKeys();
  const sender = createECDH("prime256v1"); sender.generateKeys();
  const authSecret = randomBytes(16), salt = randomBytes(16);
  const keys = { p256dh: b64u(receiver.getPublicKey()), auth: b64u(authSecret) };
  const text = "When I grow up, I want to be a watermelon · ثُبّت طلبك";
  const body = encryptPushPayload(text, keys, { salt, senderPrivateKey: sender.getPrivateKey() });
  const decoded = independentDecode(body, receiver, authSecret);
  check(decoded.plaintext === text && decoded.delimiter === 2, "فاكٌّ مستقلّ (hkdfSync من نصّ RFC 8291/8188) يقرأ ما يشفّره الخادم حرفاً بحرف، والفاصلُ 0x02");
  check(decoded.salt.equals(salt) && decoded.rs === 4096 && decoded.idlen === 65 && decoded.keyid.equals(sender.getPublicKey()) && body.length === 86 + Buffer.byteLength(text) + 1 + 16,
    "الرأس: الملح ‖ rs=4096 ‖ idlen=65 ‖ مفتاحُ الخادم المؤقّت، والطولُ 86 + النص + 1 + 16 (RFC 8188 §2.1)");
  check(decryptPushPayload(body, b64u(receiver.getPrivateKey()), keys.auth).toString("utf8") === text, "وفاكُّ الوحدة نفسها يتّفق معه");
  const tampered = Buffer.from(body); tampered[tampered.length - 1] ^= 1;
  let rejected = false; try { independentDecode(tampered, receiver, authSecret); } catch { rejected = true; }
  check(rejected, "وجسمٌ عُبث به يُرفض (وسم GCM)");
  const fresh = encryptPushPayload("مرحباً", keys);
  check(!fresh.subarray(0, 16).equals(salt) && !fresh.subarray(21, 86).equals(sender.getPublicKey()) && independentDecode(fresh, receiver, authSecret).plaintext === "مرحباً",
    "ملحٌ ومفتاحٌ مؤقّت جديدان لكل رسالة، والعربيةُ تعود كما هي");
  let tooLarge = false;
  try { encryptPushPayload("x".repeat(PUSH_MAX_PLAINTEXT + 1), keys); } catch { tooLarge = true; }
  check(tooLarge && encryptPushPayload("x".repeat(PUSH_MAX_PLAINTEXT), keys).length === 4096, "الحدّ: 4096 بايتاً للجسم كلّه، وما فوقه يُرفض قبل الإرسال");
}


/* ══ ٢) VAPID ════════════════════════════════════════════════════════════════ */
{
  const keys = deriveVapidKeys("shared-secret-for-test");
  check(JSON.stringify(deriveVapidKeys("shared-secret-for-test")) === JSON.stringify(keys) && deriveVapidKeys("another").publicKey !== keys.publicKey,
    "المفتاحُ مشتقٌّ من السرّ المشترك: ثابتٌ لكل النسخ والإقلاعات، ويتغيّر بتغيّره");
  check(fromB64u(keys.publicKey).length === 65 && fromB64u(keys.publicKey)[0] === 4 && fromB64u(keys.privateKey).length === 32, "مفتاحٌ عامّ غير مضغوط (65) وسرّيٌّ 32 بايتاً");
  const now = 1_800_000_000;
  const endpoint = "https://fcm.googleapis.com/fcm/send/abc:def";
  const jwt = vapidJwt(new URL(endpoint).origin, keys, now);
  const [h, c, s] = jwt.split(".");
  const header = JSON.parse(fromB64u(h).toString("utf8"));
  const claims = JSON.parse(fromB64u(c).toString("utf8"));
  /* تحقّقٌ مستقلّ: المفتاحُ العام من نقطته الخام في غلاف SPKI، لا من JWK الذي يوقّع به الخادم. */
  const spki = Buffer.concat([Buffer.from("3059301306072a8648ce3d0201" + "06082a8648ce3d030107034200", "hex") /* رأسُ SPKI لـ P-256 (ASN.1)، لا مفتاح */, fromB64u(keys.publicKey)]);
  const independent = verify("sha256", Buffer.from(`${h}.${c}`), { key: createPublicKey({ key: spki, format: "der", type: "spki" }), dsaEncoding: "ieee-p1363" }, fromB64u(s));
  check(independent && verifyVapidJwt(jwt, keys.publicKey).valid, "توقيعُ ES256 يُتحقَّق منه بالمفتاح العام (SPKI مستقلّ، وverifyVapidJwt)");
  check(header.alg === "ES256" && header.typ === "JWT" && fromB64u(s).length === 64, "الرأس ES256 والتوقيع خام r‖s (64 بايتاً)");
  check(claims.aud === "https://fcm.googleapis.com" && claims.sub === VAPID_SUBJECT && VAPID_SUBJECT === "https://schedule-kw.com",
    "aud أصلُ رابط الاشتراك، وsub = https://schedule-kw.com");
  check(claims.exp > now && claims.exp - now <= 24 * 3600, `exp في المستقبل ولا يتجاوز 24 ساعة (${(claims.exp - now) / 3600} ساعة)`);
  const tampered = `${h}.${b64u(Buffer.from(JSON.stringify({ ...claims, aud: "https://evil.example" })))}.${s}`;
  check(!verifyVapidJwt(tampered, keys.publicKey).valid && !verifyVapidJwt(jwt, deriveVapidKeys("another").publicKey).valid, "توقيعٌ معدَّل أو مفتاحٌ آخر يُرفض");
  check(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{87}$/.test(vapidAuthorization(endpoint, keys, now)), "رأس Authorization: «vapid t=…, k=…» (RFC 8292 §3)");

  const own = vapidKeysFromPrivate(randomBytes(32));
  check(JSON.stringify(vapidKeysFromEnv(own.publicKey, own.privateKey)) === JSON.stringify(own) && vapidKeysFromEnv("", "") === null, "مفتاحا المشغّل يُقبلان زوجاً، وغيابُهما يعني الاشتقاق");
  let mismatch = false, half = false;
  try { vapidKeysFromEnv(keys.publicKey, own.privateKey); } catch { mismatch = true; }
  try { vapidKeysFromEnv(own.publicKey, ""); } catch { half = true; }
  check(mismatch && half, "ومفتاحان لا يتطابقان، أو أحدُهما وحده، يُرفضان صراحةً");

  let sharedReads = 0;
  const resolve = createVapidKeyResolver(() => ({}), async () => { sharedReads += 1; return "secret-x"; });
  const [k1, k2] = await Promise.all([resolve(), resolve()]);
  check(k1.publicKey === k2.publicKey && k1.publicKey === deriveVapidKeys("secret-x").publicKey && sharedReads === 1, "المحلِّل يقرأ السرّ مرّةً ويحفظ المفتاح");
  const fromEnv = await createVapidKeyResolver(() => ({ publicKey: own.publicKey, privateKey: own.privateKey }), async () => { throw new Error("must not read"); })();
  check(fromEnv.publicKey === own.publicKey, "وإن ضُبط المفتاحان فهما الحَكَم، ولا يُقرأ السرّ");
  let failedOnce = 0;
  const flaky = createVapidKeyResolver(() => ({}), async () => { failedOnce += 1; if (failedOnce === 1) throw new Error("down"); return "s"; });
  const first = await flaky().then(() => "ok", () => "failed");
  check(first === "failed" && (await flaky()).publicKey === deriveVapidKeys("s").publicKey, "والفشلُ لا يُحفظ: يُعاد في الطلب التالي");
}

/* ══ ٣) الاشتراك ═══════════════════════════════════════════════════════════════ */
const uaKeys = () => {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(randomBytes(16)), priv: b64u(ecdh.getPrivateKey()) };
};
{
  for (const ok of ["https://fcm.googleapis.com/fcm/send/x", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://web.push.apple.com/QF/x", "https://wns2-par02p.notify.windows.com/w/?token=x"]) {
    check(isAllowedPushEndpoint(ok), `خدمةُ دفعٍ معروفة: ${new URL(ok).hostname}`);
  }
  for (const bad of ["http://fcm.googleapis.com/x", "https://evil.example/x", "https://127.0.0.1/x", "https://fcm.googleapis.com:8443/x", "https://user:pw@fcm.googleapis.com/x", "https://fcm.googleapis.com.evil.example/x", "javascript:alert(1)"]) {
    check(!isAllowedPushEndpoint(bad), `يُرفض (لا يرسل الخادمُ إلى ما يختاره غيرُه): ${bad}`);
  }
  const k = uaKeys();
  check(readPushSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/z", keys: { p256dh: k.p256dh, auth: k.auth } }) !== null, "اشتراكٌ صالح يُقبل");
  check(readPushSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/z", keys: { p256dh: b64u(Buffer.concat([Buffer.from([4]), randomBytes(64)])), auth: k.auth } }) === null,
    "نقطةٌ ليست على المنحنى تُرفض (لا 65 بايتاً تبدأ بـ 0x04 فحسب)");
  check(readPushSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/z", keys: { p256dh: k.p256dh, auth: "short" } }) === null, "وسرُّ مصادقةٍ ليس 16 بايتاً يُرفض");
  check(/^[0-9a-f]{64}$/.test(pushSubscriptionId("https://x")) && pushSubscriptionId("https://x") === pushSubscriptionId("https://x"), "المعرّفُ بصمةُ الرابط (sha256)");

  const calls: number[] = [];
  const target = { endpoint: "https://fcm.googleapis.com/fcm/send/q", keys: { p256dh: k.p256dh, auth: k.auth } };
  const vapid = deriveVapidKeys("t");
  let seen: any = null;
  const ok = await sendWebPush(target, { title: "اختبار", body: "سطر" }, { vapid, urgency: "high", topic: "abc", fetchImpl: async (url, init) => { seen = { url, init }; calls.push(201); return { status: 201 }; } });
  check(ok.ok && !ok.gone && seen.url === target.endpoint && seen.init.method === "POST", "الإرسال: POST إلى رابط الاشتراك نفسه");
  check(seen.init.headers.TTL === "86400" && seen.init.headers["Content-Encoding"] === "aes128gcm" && seen.init.headers.Urgency === "high" && seen.init.headers.Topic === "abc"
    && /^vapid t=/.test(seen.init.headers.Authorization), "الرؤوس: TTL يومٌ، aes128gcm، Urgency، Topic، وVAPID");
  check(JSON.parse(decryptPushPayload(seen.init.body, k.priv, k.auth).toString("utf8")).title === "اختبار", "والجسمُ يفكّه المتصفّح إلى الرسالة نفسها");
  const gone = await sendWebPush(target, { title: "x" }, { vapid, fetchImpl: async () => ({ status: 410 }) });
  const missing = await sendWebPush(target, { title: "x" }, { vapid, fetchImpl: async () => ({ status: 404 }) });
  const busy = await sendWebPush(target, { title: "x" }, { vapid, fetchImpl: async () => ({ status: 429 }) });
  check(gone.gone && missing.gone && !busy.gone && !busy.ok, "410 و404 = انتهى الاشتراك؛ 429 فشلٌ عابر لا يمحو");
}

/* ══ ٤) نصُّ الأستاذ بلا قاعة ══════════════════════════════════════════════════ */
const ROOMY_REQUEST = () => ({
  id: "req-1", AdCollegeId: 1, AdSectionId: 2, AdTermId: 3, AdInstructorId: 9, linkId: "card-token-aaaaaaaaaaaaaaaa",
  window: { opensAt: "", closesAt: "" }, source: "draft", status: "in-review", timeline: [], createdAt: "", updatedAt: "",
  items: [
    { itemId: "a", rowId: 11, action: "change",
      before: { courseId: 5, courseName: "مبادئ المحاسبة", sectionCode: "01", days: "ح · ث", time: "08:00 – 09:15", room: "12/3" },
      after: { courseId: 5, courseName: "مبادئ المحاسبة", sectionCode: "01", days: "ح · ث", time: "10:00 – 11:15" },
      slots: [{ day: "fsunday", start: "10:00", end: "11:15" }, { day: "ftuesday", start: "10:00", end: "11:15" }],
      reservedRoom: { label: "B-204", companionLabel: "مختبر الحاسوب 3" }, roomPick: [{ label: "A-101", why: [] }],
      roomSwitch: { from: "12/3", to: { room: "B-204", hall: "قاعة الندوات" } }, roomCandidates: ["C-7"],
      roomOptions: [{ key: "k", room: "D-9", hall: "قاعة الشروق" }],
      decision: { state: "fixed", decidedAt: "2026-10-29T08:00:00Z" } },
    { itemId: "b", rowId: 12, action: "change",
      before: { courseId: 6, courseName: "إحصاء B-204", sectionCode: "02", days: "ن", time: "12:00", room: "B-204" },
      after: { courseId: 6, courseName: "إحصاء B-204", sectionCode: "02", days: "ن", time: "13:00" },
      slots: [{ day: "fmonday", start: "9:30", end: "10:45" }], reservedRoom: { label: "B-204" },
      decision: { state: "rejected", reasonCode: "room", note: "القاعة B-204 مشغولة", alternatives: [{ day: "fwednesday", days: ["fmonday", "fwednesday"], start: "11:00", end: "12:15" }], decidedAt: "2026-10-29T08:01:00Z" } },
    { itemId: "c", rowId: 13, action: "delete",
      before: { courseId: 7, courseName: "تاريخ الفن", sectionCode: "01", days: "خ", time: "08:00", room: "مدرج 1" },
      decision: { state: "rejected", reasonCode: "room", note: "مدرج 1", decidedAt: "2026-10-29T08:02:00Z" },
      thread: [{ from: "department", at: "2026-10-29T08:03:00Z", text: "نقترح مدرج 1", slots: [{ day: "fthursday", start: "12:00", end: "13:15" }] }] },
  ],
} as any);
{
  const request = ROOMY_REQUEST();
  const fixed = teacherEventFor(request, 0)!;
  const alt = teacherEventFor(request, 1)!;
  const rejected = teacherEventFor(request, 2)!;
  const reply = teacherEventFor(request, 2, "reply")!;
  const single = teacherDigestMessage([fixed], request.linkId);
  check(single.title === "✅ ثُبّت طلبك" && single.body === "مبادئ المحاسبة · الأحد والثلاثاء 10:00", `✅ ثُبّت طلبك · المقرر · الأحد والثلاثاء 10:00 («${single.title} · ${single.body}»)`);
  check(single.url === "/r/card-token-aaaaaaaaaaaaaaaa", "اللمسةُ تفتح كرتَ الأستاذ نفسه");
  const altMsg = teacherDigestMessage([alt], request.linkId);
  check(altMsg.title === "🔁 اختر بديلاً لطلبك" && altMsg.body === "إحصاء · الاثنين والأربعاء 11:00", `🔁 البديلُ بأيامه ووقته، واسمُ المقرر بلا رمز قاعته («${altMsg.body}»)`);
  check(teacherDigestMessage([rejected], request.linkId).title === "❌ تعذّر طلبك", "❌ تعذّر طلبك");
  check(teacherDigestMessage([reply], request.linkId).body === "تاريخ الفن · يقترح الخميس 12:00", "💬 ردُّ القسم: ما يقترحه من وقت — لا نصَّ الرسالة");
  const many = teacherDigestMessage([fixed, { ...fixed, course: "الإحصاء" }, { ...fixed, course: "الجبر" }], request.linkId);
  check(many.title === "✅ ثُبّت 3 مواعيد" && many.body.endsWith("· +2"), `الدفعةُ من نوعٍ واحد تُعدّ: «${many.title}»`);
  check(teacherDigestMessage([fixed, fixed], request.linkId).title === "✅ ثُبّت موعدان", "والمثنّى مثنّى: «ثُبّت موعدان»");
  const mixed = teacherDigestMessage([fixed, alt, rejected, reply], request.linkId);
  check(mixed.title === "📋 قرارات القسم على طلبك" && mixed.body === "✅ 1 · 🔁 1 · ❌ 1 · 💬 1", `والمختلطةُ أيقوناتٌ بأعدادها: «${mixed.body}»`);
  const ta = taWindowMessage("ta-token-bbbbbbbbbbbbbbbb", "2026-11-05T17:00:00Z");
  check(ta.title === "🎓 فُتح باب التدريب لك" && ta.url === "/r/ta-token-bbbbbbbbbbbbbbbb" && /يُغلق/.test(ta.body || ""), `🎓 بابُ التدريب: إلى الكرت الجديد ومتى يُغلق («${ta.body}»)`);

  const tokens = request.items.flatMap((item: any) => roomTokensOf(item));
  for (const room of ["12/3", "B-204", "مختبر الحاسوب 3", "A-101", "قاعة الندوات", "C-7", "D-9", "قاعة الشروق", "مدرج 1"]) check(tokens.includes(room), `الحارس يعرف «${room}» قاعةً`);
  const all = [single, altMsg, teacherDigestMessage([rejected], request.linkId), teacherDigestMessage([reply], request.linkId), many, mixed, ta, cardTestMessage(request.linkId)];
  const text = JSON.stringify(all);
  check(!all.some(message => messageMentionsRoom(message, tokens)) && !/12\/3|B-204|A-101|C-7|D-9|مختبر|مدرج|قاعة|AdRoom/.test(text),
    "لا رمزَ قاعةٍ ولا اسمَها في أيّ تنبيهٍ للأستاذ — ولا كلمة «قاعة»، ولا ملاحظةَ القسم التي تسمّيها");
  check(scrubRooms("إحصاء B-204", ["B-204"]) === "إحصاء" && scrubRooms("مبادئ", ["B-204"]) === "مبادئ", "رمزُ قاعةٍ داخل اسم المقرر يُمسح، والاسمُ النظيف لا يُمسّ");
}

/* ══ ٥) الحدّ والتجميع ═════════════════════════════════════════════════════════ */
{
  let clock = 0;
  const limiter = createPushRateLimiter({ now: () => clock });
  const takes = Array.from({ length: 6 }, () => limiter.take("s1"));
  check(takes.slice(0, 5).every(Boolean) && !takes[5], "خمسةُ تنبيهاتٍ متتالية للاشتراك الواحد، والسادسُ يُمنع");
  check(limiter.take("s2"), "والحدُّ لكل اشتراكٍ وحده");
  clock += 60_000;
  check(limiter.take("s1") && !limiter.take("s1"), "ثم واحدٌ كل دقيقة");

  check(adminRequestsMessage(1, "تكنولوجيا التعليم").title === "📥 طلب جديد — جاهز للتثبيت", "📥 طلب جديد — جاهز للتثبيت");
  check(adminRequestsMessage(2).title === "📥 طلبان جديدان — جاهزان للتثبيت", "📥 طلبان جديدان — جاهزان للتثبيت");
  const three = adminRequestsMessage(3, "تكنولوجيا التعليم");
  check(three.title === "📥 3 طلبات جديدة — جاهزة للتثبيت" && three.body === "تكنولوجيا التعليم" && three.url === "/FSchedule/InstructorRequests",
    "📥 3 طلبات جديدة — جاهزة للتثبيت، والقسمُ سطرٌ، واللمسةُ تفتح الوارد");
  check(adminRequestsMessage(11).title === "📥 11 طلباً جديداً — جاهزة للتثبيت", "📥 11 طلباً جديداً");
  check(adminRepliesMessage(1, "", true).title === "🤝 أستاذ وافق على مقترحك — جاهز للتثبيت" && adminRepliesMessage(3).title === "💬 3 ردود على مقترحاتك",
    "الحدثُ الثاني للقسم: 🤝 وافق — جاهز للتثبيت · 💬 3 ردود");
  const pending = [
    { status: "submitted", AdCollegeId: 1, AdSectionId: 2, items: [{ action: "change", before: {}, decision: undefined }, { action: "keep", before: {} }] },
    { status: "in-review", AdCollegeId: 1, AdSectionId: 2, items: [{ action: "add", after: { collegeId: 1, sectionId: 2 }, decision: { state: "fixed" } }] },
    { status: "in-review", AdCollegeId: 1, AdSectionId: 2, items: [{ action: "add", after: { collegeId: 1, sectionId: 3 } }] },
    { status: "sent", AdCollegeId: 1, AdSectionId: 2, items: [{ action: "change", before: {} }] },
    { status: "in-review", AdCollegeId: 1, AdSectionId: 2, items: [{ action: "change", before: {}, decision: { state: "rejected" }, thread: [{ from: "department" }, { from: "instructor", accepted: true }] }] },
  ] as any[];
  check(awaitingInScope(pending, "requests", 1, 2) === 1 && awaitingInScope(pending, "requests", 1, 3) === 1 && awaitingInScope(pending, "replies", 1, 2) === 1,
    "العددُ يُقرأ لحظةَ الإرسال: ما لم يُقرَّر في القسم نفسه (لا المثبَّت، ولا قسمٌ آخر، ولا ما لم يُرسل)، والردودُ آخرُ رسالةٍ فيها من الأستاذ");
}

/* ══ ٦) الأحداث في صندوق العرض، والمسارات ═══════════════════════════════════ */
{
  const sent: Array<{ endpoint: string; body: Buffer; headers: Record<string, string> }> = [];
  const statusOf = new Map<string, number>();
  let clockMs = Date.parse("2026-10-29T08:05:00Z");
  const LIVE = "card-token-aaaaaaaaaaaaaaaa", REVOKED = "card-token-revokedrevoked1";
  const own = vapidKeysFromPrivate(randomBytes(32));
  const app = express();
  app.use(express.json());
  const SANDBOX = `demo_web_push_${Date.now()}`;
  Repository.createDemoSandbox(SANDBOX, 10 * 60_000);
  app.use((req, _res, next) => { if (!Repository.runDemoSandbox(SANDBOX, next)) next(); });
  app.use(async (req: any, _res, next) => {
    const id = Number(req.headers["x-test-user"] || 0);
    if (id) req.user = await Repository.getUserById(id);
    next();
  });
  const requireAuth = (req: any, res: any, next: any) => (req.user ? next() : res.status(401).json({ error: "الرجاء تسجيل الدخول أولاً" }));
  const engine = registerPushRoutes(app, {
    requireAuth,
    isScopeAllowed: (req, c, s) => Boolean(req.user?.IsAdminUser) || (req.scopes || []).some((a: any) => Number(a.AdCollegeId) === c && (Number(a.AdSectionId) === s || Number(a.AdSectionId) === 0)),
    isPowerUser: req => Boolean(req.user?.IsAdminUser),
    resolveCard: async token => (token === LIVE ? { token, instructorId: 9 } : null),
    readEnv: () => own,
    fetchImpl: async (url, init) => { sent.push({ endpoint: url, body: Buffer.from(init.body), headers: init.headers }); if (url.includes("/slow-")) await new Promise(r => setTimeout(r, 6000)); return { status: statusOf.get(url) || 201 }; },
    now: () => clockMs,
  });

  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const call = (method: string, url: string, body?: unknown, user?: number, session?: string) => fetch(base + url, {
    method, headers: { "Content-Type": "application/json", ...(user ? { "x-test-user": String(user) } : {}), ...(session ? { Cookie: `session_id=${session}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async r => ({ status: r.status, type: r.headers.get("content-type") || "", data: await r.json().catch(() => null) }));
  const device = (name: string) => { const k = uaKeys(); return { endpoint: `https://fcm.googleapis.com/fcm/send/${name}`, keys: { p256dh: k.p256dh, auth: k.auth }, priv: k.priv }; };
  const open = (entry: { body: Buffer }, dev: { priv: string; keys: { auth: string } }) => JSON.parse(decryptPushPayload(entry.body, dev.priv, dev.keys.auth).toString("utf8"));

  try {
    /* المسارات العامة والمصادقة */
    const key = await call("GET", "/api/public/push/key");
    check(key.status === 200 && key.data.publicKey === own.publicKey, "GET /api/public/push/key: المفتاحُ العام (مفتاحا المشغّل حين يُضبطان)");
    check((await call("POST", "/api/push/subscribe", { subscription: device("x") })).status === 401, "الاشتراكُ في التطبيق يحتاج دخولاً");
    check((await call("POST", "/api/push/subscribe", { subscription: { endpoint: "https://evil.example/x", keys: device("y").keys } }, 16)).status === 400, "ورابطٌ خارج خدمات الدفع يُرفض (400)");

    /* المنسّق (16: رئيس لجنة، الشاشة ٧، نطاقُ قسمه) ورئيسُ القسم (15: لا وارد له) */
    const committee = device("committee"), head = device("head"), phoneTwo = device("committee-2");
    check((await call("POST", "/api/push/subscribe", { subscription: committee }, 16)).status === 200, "المنسّق يفعّل التنبيهات على جهازه");
    await call("POST", "/api/push/subscribe", { subscription: committee }, 16);
    await call("POST", "/api/push/subscribe", { subscription: head }, 15);
    const status = await call("GET", "/api/push/status", undefined, 16);
    check(status.data.enabled && status.data.audience && status.data.ids.length === 1 && status.data.ids[0] === pushSubscriptionId(committee.endpoint),
      "الجهازُ نفسه مرّتين سجلٌّ واحد (المعرّفُ بصمةُ رابطه)، والحالةُ تعرفه");
    const headStatus = await call("GET", "/api/push/status", undefined, 15);
    check(headStatus.data.enabled && headStatus.data.audience === false, "رئيسُ القسم بلا وارد طلبات: لا بطاقةَ له (audience = false)");
    check(roleWriteDecision({ method: "POST", path: "/push/subscribe", authenticated: true, powerUser: false, role: "departmentHead" }).allowed
      && roleWriteDecision({ method: "POST", path: "/push/test", authenticated: true, powerUser: false, role: "dean" }).allowed
      && !roleWriteDecision({ method: "POST", path: "/push/anything", authenticated: true, powerUser: false, role: "dean" }).allowed,
      "صفاتُ الاطّلاع تفعّل تنبيهات جهازها (تفضيلٌ لا كتابة)، والإذنُ لهذه المسارات بعينها");

    await Repository.withDemoSandbox(SANDBOX, async () => {
      const assigns = await Repository.getUserAssigns(16);
      const scope = { AdCollegeId: Number(assigns[0].AdCollegeId), AdSectionId: Number(assigns[0].AdSectionId) };
      const request = (id: string, sectionId = scope.AdSectionId) => ({ ...ROOMY_REQUEST(), id, AdCollegeId: scope.AdCollegeId, AdSectionId: sectionId,
        items: [{ itemId: "n", rowId: null, action: "add", after: { courseId: 1, courseName: "مقرر", sectionCode: "", days: "", time: "", collegeId: scope.AdCollegeId, sectionId }, slots: [] }] });
      const toCommittee = () => sent.filter(entry => entry.endpoint === committee.endpoint);
      /* طلباتٌ محفوظةٌ فعلاً: العددُ يُقرأ منها لحظةَ الإرسال. */
      const store = async (id: string, sectionId = scope.AdSectionId) => {
        const { id: _id, createdAt: _c, updatedAt: _u, ...entry } = request(id, sectionId) as any;
        return Repository.createInstructorRequest({ ...entry, status: "submitted" });
      };
      const tagOf = `inbox-requests-${scope.AdCollegeId}:${scope.AdSectionId}`;

      /* لا مؤقّت: الخطافُ يُنتظر في المسار، فالتنبيهُ خرج قبل أن يعود. */
      await pushHooks.requestSubmitted(await store("r1"));
      check(toCommittee().length === 1, "📥 أوّلُ طلبٍ في نطاق المنسّق خرج إلى جهازه قبل أن يعود الخطاف (لا عملَ بعد الرد)");
      const first = open(toCommittee()[0], committee);
      check(first.title === "📥 طلب جديد — جاهز للتثبيت" && first.url === "/FSchedule/InstructorRequests" && first.tag === tagOf, `«${first.title}» ويفتح الوارد، بوسم القسم (${first.tag})`);
      check(!sent.some(entry => entry.endpoint === head.endpoint), "ورئيسُ القسم (لا وارد له) لا يصله شيء");
      const cooldown = await Repository.getFeatureDoc<{ at: number }>("pushCooldowns", `requests:${scope.AdCollegeId}:${scope.AdSectionId}`);
      check(cooldown?.at === clockMs, "تهدئةُ القسم محفوظةٌ في قاعدة البيانات (pushCooldowns) لا في ذاكرة نسخة");
      const r2 = await store("r2"), r3 = await store("r3"), other = await store("r-other", scope.AdSectionId + 999);
      clockMs += 60_000;
      await pushHooks.requestSubmitted(r2);
      await pushHooks.requestSubmitted(other);
      check(toCommittee().length === 1, "طلبٌ في التهدئة (ثلاث دقائق) لا يُنبّه من جديد، وطلبٌ خارج نطاقه لا يصله");
      clockMs += ADMIN_COOLDOWN_MS;
      await pushHooks.requestSubmitted(r3);
      check(toCommittee().length === 2, "وبعدها تنبيهٌ فوري");
      const digest = open(toCommittee()[1], committee);
      check(digest.title === "📥 3 طلبات جديدة — جاهزة للتثبيت" && digest.tag === tagOf && toCommittee()[1].headers.Urgency === "normal" && /^[\w-]{1,32}$/.test(toCommittee()[1].headers.Topic),
        `«${digest.title}» — العددُ كما هو الآن في القسم، والوسمُ نفسه يستبدل السابق على الهاتف`);

      /* كرتُ الأستاذ */
      const teacherPhone = device("teacher"), oldCard = device("old-card");
      check((await call("POST", `/api/public/request/${LIVE}/push`, { subscription: teacherPhone })).status === 200, "الأستاذ يشترك من كرته برمزه");
      check((await call("POST", `/api/public/request/${REVOKED}/push`, { subscription: oldCard })).status === 404, "وكرتٌ أُوقف لا يُشترك فيه");
      const decided = ROOMY_REQUEST();
      const onlyFirst = ROOMY_REQUEST();
      onlyFirst.items[1].decision = undefined; onlyFirst.items[2].decision = undefined;
      await pushHooks.requestDecided(onlyFirst, 0);
      const toTeacher = () => sent.filter(entry => entry.endpoint === teacherPhone.endpoint);
      check(toTeacher().length === 1, "✅ قرارُ القسم خرج إلى هاتف الأستاذ قبل أن يعود الخطاف");
      const fixed = open(toTeacher()[0], teacherPhone);
      check(fixed.title === "✅ ثُبّت طلبك" && fixed.body === "مبادئ المحاسبة · الأحد والثلاثاء 10:00" && fixed.url === `/r/${LIVE}` && toTeacher()[0].headers.Urgency === "high",
        `«${fixed.title} · ${fixed.body}» إلى كرته`);
      check(!/12\/3|B-204|A-101|مختبر|قاعة|مدرج/.test(JSON.stringify(fixed)), "والتنبيهُ المفكوك نفسه بلا قاعة");
      await pushHooks.requestDecided(decided, 1);
      const batch = open(toTeacher()[1], teacherPhone);
      check(batch.title === "📋 قرارات القسم على طلبك" && batch.body === "✅ 1 · 🔁 1 · ❌ 1" && batch.tag === "card-decisions" && fixed.tag === "card-decisions",
        `قرارٌ تالٍ: تنبيهٌ يستبدل سابقَه (الوسم نفسه) بحصيلة الدقائق العشر الأخيرة من الطلب نفسه («${batch.title}: ${batch.body}»)`);
      await pushHooks.departmentReplied(decided, 2);
      const reply = open(toTeacher()[2], teacherPhone);
      check(reply.title === "💬 ردّ القسم على طلبك" && reply.body === "تاريخ الفن · يقترح الخميس 12:00", `💬 ردُّ القسم («${reply.body}»)`);

      /* كرتٌ أُوقف بعد الاشتراك: لا يُدفع إليه، وتُمحى اشتراكاته */
      const stale = device("stale");
      const staleId = pushSubscriptionId(stale.endpoint);
      await Repository.savePushSubscription({ id: staleId, endpoint: stale.endpoint, keys: stale.keys, ownerKind: "card", cardToken: REVOKED, instructorId: 9, createdAt: "", updatedAt: "" } as PushSubscriptionRecord);
      await pushHooks.requestDecided({ ...ROOMY_REQUEST(), id: "req-revoked", linkId: REVOKED }, 0);
      check(await waitFor(async () => !(await Repository.getPushSubscription(staleId))) && !sent.some(entry => entry.endpoint === stale.endpoint),
        "كرتٌ أُوقف: لا تنبيهَ إليه، ويُمحى اشتراكُه");

      /* 🎓 بابُ التدريب: إلى الكرت الجديد عبر اشتراك المدرّب من كرته الحيّ */
      await pushHooks.taWindowOpened("2026-11-05T17:00:00Z", [{ instructorId: 9, linkId: "ta-new-token-cccccccccccc" }]);
      check(await waitFor(() => toTeacher().length === 4), "🎓 فُتح باب التدريب: يصل المدرّبَ من اشتراكه في كرته");
      const ta = open(toTeacher()[3], teacherPhone);
      check(ta.title === "🎓 فُتح باب التدريب لك" && ta.url === "/r/ta-new-token-cccccccccccc", "…ويفتح كرتَ التدريب الجديد");

      /* 410: يُمحى */
      statusOf.set(teacherPhone.endpoint, 410);
      const card = await call("POST", `/api/public/request/${LIVE}/push/test`);
      check(card.status === 200 && card.data.removed === 1 && !(await Repository.getPushSubscription(pushSubscriptionId(teacherPhone.endpoint))),
        "«جرّب» على اشتراكٍ انتهى: 410 → يُمحى السجلّ");
      check((await call("POST", `/api/public/request/${LIVE}/push/test`)).status === 409, "ولا جهازَ بعده: «فعّل التنبيهات أولاً»");

      /* «جرّب» للمنسّق، والحدّ */
      await call("POST", "/api/push/subscribe", { subscription: phoneTwo }, 16);
      const tested = await call("POST", "/api/push/test", undefined, 16);
      check(tested.status === 200 && tested.data.sent === 2, "«جرّب» يدفع إلى أجهزة صاحب الحساب كلّها (جهازان)");
      const lastToPhone = sent.filter(entry => entry.endpoint === phoneTwo.endpoint).at(-1)!;
      check(open(lastToPhone, phoneTwo).title === "🔔 التنبيهات تعمل", "🔔 التنبيهات تعمل");
      const before = sent.length;
      for (let i = 0; i < 6; i++) await engine.deliver([{ id: pushSubscriptionId(phoneTwo.endpoint), endpoint: phoneTwo.endpoint, keys: phoneTwo.keys } as any], { title: "x" });
      check(sent.length - before === 4, `الحدُّ لكل اشتراك: بعد «جرّب» أربعةٌ أخرى فقط (${sent.length - before})`);
      const limited = await call("POST", "/api/push/test", undefined, 16);
      check(limited.data && limited.data.limited >= 1, "و«جرّب» المتكرّر يُحدّ");

      /* إيقافٌ، وتجديدُ اشتراكٍ يُثبت ملكيته بالقديم */
      await call("POST", "/api/push/unsubscribe", { endpoint: phoneTwo.endpoint }, 15);
      check(Boolean(await Repository.getPushSubscription(pushSubscriptionId(phoneTwo.endpoint))), "لا يُطفئ أحدٌ جهازَ غيره");
      const rotated = device("rotated");
      check((await call("POST", "/api/public/push/rotate", { old: { endpoint: committee.endpoint, auth: "wrong-secret" }, subscription: rotated })).status === 404, "التجديدُ بسرٍّ خاطئ يُرفض");
      check((await call("POST", "/api/public/push/rotate", { old: { endpoint: committee.endpoint, auth: committee.keys.auth }, subscription: rotated })).status === 200
        && (await Repository.getPushSubscription(pushSubscriptionId(rotated.endpoint)))?.userId === 16 && !(await Repository.getPushSubscription(pushSubscriptionId(committee.endpoint))),
        "وبالاشتراك القديم وسرّه ينتقل السجلُّ إلى الجديد بصاحبه نفسه");
      await call("POST", "/api/push/unsubscribe", { endpoint: rotated.endpoint }, 16);
      check(!(await Repository.getPushSubscription(pushSubscriptionId(rotated.endpoint))), "وصاحبُه يطفئه");

      /* جهازٌ مشترك: الخروجُ الصريح يُسقط اشتراكَ الجلسة التي فعّلته، وجلسةٌ أخرى تبقى */
      const shared = device("shared-pc"), own = device("own-phone");
      await call("POST", "/api/push/subscribe", { subscription: shared }, 16, "sess_shared_pc_session");
      await call("POST", "/api/push/subscribe", { subscription: own }, 16, "sess_own_phone_session");
      const bound = await call("GET", "/api/push/status", undefined, 16, "sess_shared_pc_session");
      check(bound.data.bound.length === 1 && bound.data.bound[0] === pushSubscriptionId(shared.endpoint) && bound.data.ids.length >= 2,
        "الحالةُ تعرف أيَّ أجهزة الحساب فُعّل من هذه الجلسة (bound)");
      check((await Repository.getPushSubscription(pushSubscriptionId(shared.endpoint)))?.session?.length === 32
        && !JSON.stringify(await Repository.getPushSubscription(pushSubscriptionId(shared.endpoint))).includes("sess_shared_pc_session"),
        "ويُحفظ مع الاشتراك بصمةُ الجلسة لا الجلسةُ نفسها");
      pushHooks.signedOut("sess_shared_pc_session");
      check(await waitFor(async () => !(await Repository.getPushSubscription(pushSubscriptionId(shared.endpoint)))) && Boolean(await Repository.getPushSubscription(pushSubscriptionId(own.endpoint))),
        "تسجيلُ الخروج الصريح يُسقط اشتراكَ ذلك الجهاز على الخادم، وهاتفُ صاحبه (جلسةٌ أخرى) يبقى");
      check(await engine.signedOut("") === 0, "وخروجٌ بلا جلسة لا يمسّ شيئاً");

      /* خدمةُ دفعٍ بطيئة لا تحبس الرد: الخطافُ يعود بعد HOOK_WAIT_MS على الأكثر */
      const slow = device("slow-device");
      await call("POST", "/api/push/subscribe", { subscription: slow }, 16);
      clockMs += ADMIN_COOLDOWN_MS + 1;
      const startedAt = Date.now();
      await pushHooks.requestSubmitted(await store("r-slow"));
      const waited = Date.now() - startedAt;
      check(sent.some(entry => entry.endpoint === slow.endpoint) && waited >= HOOK_WAIT_MS - 200 && waited < HOOK_WAIT_MS + 1500,
        `خدمةُ دفعٍ عالقة: المسارُ ينتظر ${HOOK_WAIT_MS} ms على الأكثر ثم يردّ (انتظر ${waited} ms)`);

      /* الكرت على الشاشة الرئيسية */
      const manifest = await fetch(`${base}/r/${LIVE}/manifest.webmanifest`).then(async r => ({ type: r.headers.get("content-type") || "", json: await r.json() }));
      check(/application\/manifest\+json/.test(manifest.type) && manifest.json.start_url === `/r/${LIVE}` && manifest.json.scope === `/r/${LIVE}` && manifest.json.display === "standalone" && manifest.json.short_name === "بطاقتي",
        "manifest الكرت: البدايةُ والنطاقُ الكرتُ نفسه، standalone، «بطاقتي»");
      check((await fetch(`${base}/r/bad%20token/manifest.webmanifest`)).status === 404, "ورمزٌ غير صالح لا manifest له");
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
    Repository.dropDemoSandbox(SANDBOX);
  }
}

/* ══ ٧) العامل، والاستعادة، وsw.js، والكرت ════════════════════════════════════ */
{
  const worker = read("public/push-sw.js");
  check(/addEventListener\("push"/.test(worker) && /addEventListener\("notificationclick"/.test(worker) && /addEventListener\("pushsubscriptionchange"/.test(worker),
    "push-sw.js: push وnotificationclick وpushsubscriptionchange");
  /* معالجُ fetch الوحيد: التنقّلُ إلى الشبكة كما هو، وصفحةُ «نُحدّث البرنامج» عند 5xx أو الانقطاع
     (tests/updating-page-audit.ts). لا ذاكرةَ فيه غيرُ تلك الصفحة، ولا ختمَ بناء. */
  const opened = worker.match(/caches\.open\([^)]*\)/g) || [];
  const puts = worker.match(/\.put\([^,]*,/g) || [];
  check(!/__BUILD__/.test(worker) && opened.length > 0 && opened.every(call => call === "caches.open(UPDATING_CACHE)") && puts.every(call => call === ".put(UPDATING_PAGE,")
    && /request\.mode !== "navigate"/.test(worker) && !/cache\.match\((?!UPDATING_PAGE)/.test(worker),
    "ولا يحفظ صفحةً غيرَ صفحة التحديث ولا ختمَ بناء: لا يقدّم صفحةً قديمة أبداً");

  const runWorker = (scope: string, windows: Array<{ url: string }>) => {
    const handlers: Record<string, (event: any) => void> = {};
    const shown: any[] = [], opened: string[] = [], messages: any[] = [], focused: string[] = [];
    const clients = windows.map(w => ({ url: w.url, focus() { focused.push(w.url); return Promise.resolve(this); }, postMessage(m: any) { messages.push(m); } }));
    const self: any = {
      addEventListener: (type: string, fn: any) => { handlers[type] = fn; }, skipWaiting() {},
      location: { origin: "https://schedule-kw.com" },
      registration: { scope: `https://schedule-kw.com${scope}`, showNotification: (title: string, options: any) => { shown.push({ title, options }); return Promise.resolve(); } },
      clients: { matchAll: async () => clients, openWindow: async (url: string) => { opened.push(url); } },
    };
    vm.runInNewContext(worker, { self, URL, Date, String, Promise, JSON, fetch: async () => ({}) });
    const fire = async (type: string, event: any) => { let wait: Promise<any> = Promise.resolve(); handlers[type]({ ...event, waitUntil: (p: Promise<any>) => { wait = p; } }); await wait; };
    return { fire, shown, opened, messages, focused };
  };
  const card = runWorker("/r/tok", []);
  await card.fire("push", { data: { json: () => ({ title: "✅ ثُبّت طلبك", body: "مبادئ المحاسبة · الأحد 10:00", url: "/r/tok", tag: "card-decisions" }) } });
  const note = card.shown[0];
  check(note && note.title === "✅ ثُبّت طلبك" && note.options.body.includes("مبادئ") && note.options.tag === "card-decisions" && note.options.renotify === true && note.options.dir === "rtl" && note.options.data.url === "https://schedule-kw.com/r/tok",
    "العامل يعرض التنبيه: العنوان والسطر، rtl، والوسم يستبدل سابقه");
  await card.fire("push", { data: { json: () => ({ title: "x", url: "https://evil.example/phish" }) } });
  check(card.shown[1].options.data.url === "https://schedule-kw.com/r/tok", "ورابطٌ إلى موقعٍ آخر لا يُفتح: بدايةُ نطاق العامل بدلاً منه");
  await card.fire("notificationclick", { notification: { close() {}, data: { url: "https://schedule-kw.com/r/tok" } } });
  check(card.opened[0] === "https://schedule-kw.com/r/tok", "لمسُ التنبيه بلا لسانٍ مفتوح يفتح الكرت");
  const app = runWorker("/push/", [{ url: "https://schedule-kw.com/FSchedule/Index" }, { url: "https://schedule-kw.com/r/someone" }]);
  await app.fire("notificationclick", { notification: { close() {}, data: { url: "https://schedule-kw.com/FSchedule/InstructorRequests" } } });
  check(app.focused[0] === "https://schedule-kw.com/FSchedule/Index" && app.messages[0]?.type === "schedule-push-open" && app.messages[0]?.url.endsWith("/FSchedule/InstructorRequests") && !app.opened.length,
    "ولسانُ التطبيق المفتوح يُستدعى ويُطلب منه الوارد (لا كرتُ أستاذٍ مفتوحٌ بجانبه)");

  /* الاستعادة لا تُسقط عاملَ التنبيهات */
  const unregistered: string[] = [];
  const reg = (scope: string, script: string) => ({ scope: `https://schedule-kw.com${scope}`, active: { scriptURL: `https://schedule-kw.com${script}` }, unregister: async () => { unregistered.push(scope); return true; } });
  const regs = [reg("/", "/sw.js"), reg("/push/", "/push-sw.js"), reg("/r/tok", "/push-sw.js")];
  check(await unregisterAppWorkers({ getRegistrations: async () => regs }) === 1 && unregistered.join() === "/", "unregisterAppWorkers يُسقط sw.js ويُبقي عاملَي التنبيهات (التطبيق والكرت)");
  check(isPushWorkerRegistration({ scope: "https://x/push/", installing: { scriptURL: "https://x/push-sw.js" } }) && !isPushWorkerRegistration(regs[0]), "ويعرفه ولو كان قيد التثبيت");
  const main = read("src/main.tsx");
  const recovery = between(main, "const recoverFromStaleBuild=async()=>{", "window.location.reload();");
  const reset = between(main, "const reset = async () => {", "window.location.reload();");
  check(recovery.includes("await unregisterAppWorkers();") && reset.includes("await unregisterAppWorkers();"), "main.tsx: مسارا الاستعادة (الإصدار القديم والتصفير) يمرّان من unregisterAppWorkers");
  check(!/getRegistrations\?\.\(\)[\s\S]{0,200}\.unregister\(\)/.test(main), "ولا بقي في main.tsx إسقاطٌ لكل العمّال");
  const html = read("index.html");
  const appWorkerSource = /function appWorker\(r\) \{[\s\S]*?\n {8}\}/.exec(html)?.[0] || "";
  const appWorker = appWorkerSource ? vm.runInNewContext(`${appWorkerSource}; appWorker`, { String }) : null;
  check(Boolean(appWorker) && regs.filter(appWorker).length === 1 && (html.match(/regs\.filter\(appWorker\)/g) || []).length === 2,
    "index.html: حارسُ الإقلاع وزرُّ «إعادة المحاولة» يُبقيان عاملَ التنبيهات");

  /* sw.js لا يقدّم كرتَ الأستاذ من هيكل التطبيق */
  const sw = read("public/sw.js");
  /* يجيب العاملُ التنقّلَ الآن ليبدّل جوابَ الخطأ وحده؛ فالسؤال: هل حُفظ الكرتُ مكان هيكل التطبيق؟ */
  const respond = async (pathname: string, mode = "navigate") => {
    const handlers: Record<string, (event: any) => void> = {};
    const stored: string[] = [];
    const self: any = { addEventListener: (type: string, fn: any) => { handlers[type] = fn; }, location: { origin: "https://schedule-kw.com" }, skipWaiting() {}, clients: { claim() {} } };
    const cache = { put: async (key: any) => { stored.push(String(key?.url || key)); }, match: async () => undefined };
    const network = new Response("<p>server page</p>", { status: 200, headers: { "Content-Type": "text/html" } });
    vm.runInNewContext(sw, { self, URL, Response, caches: { open: async () => cache }, fetch: async () => network });
    let answer: Promise<any> | null = null;
    handlers.fetch({ request: { method: "GET", url: `https://schedule-kw.com${pathname}`, mode }, respondWith: (p: Promise<any>) => { answer = p; }, waitUntil() {} });
    const response = answer ? await answer : null;
    await new Promise(resolve => setTimeout(resolve, 0));
    return { answered: Boolean(answer), passedThrough: response === network, shell: stored.includes("/index.html") };
  };
  const cardNav = await respond("/r/abc"), share = await respond("/s/abc"), mine = await respond("/me"), manifestReq = await respond("/r/abc/manifest.webmanifest", "cors");
  check([cardNav, share, mine].every(r => r.passedThrough && !r.shell) && !manifestReq.answered,
    "sw.js: كرتُ الأستاذ وبطاقةُ القسم ومساري تذهب إلى الخادم كما هي، ولا تُحفظ مكان هيكل التطبيق");
  check((await respond("/FSchedule/Index")).shell, "وشاشاتُ التطبيق ما زالت تُحفظ هيكلاً يُجاب به دون اتصال");

  /* «بطاقتي» والشارة */
  const token = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";
  const head = pushCardHead(token);
  check(head.includes(`<link rel="manifest" href="/r/${token}/manifest.webmanifest">`) && head.includes('name="apple-mobile-web-app-capable" content="yes"') && head.includes("بطاقتي"),
    "رأسُ الكرت يعلن manifest «بطاقتي» ويفتحه كتطبيق على iPhone");
  check(pushCardHead('x"><script>') === "" && CARD_TOKEN_PATTERN.test(`demo.${token}`), "ورمزٌ غير صالح لا يُكتب في الصفحة؛ ورمزُ العرض مقبول");
  const manifest = cardManifest(token);
  check(manifest.icons.every(icon => fs.existsSync(path.join("public", icon.src))) && manifest.icons.some(icon => icon.purpose === "maskable"), "أيقوناتُ «بطاقتي» من schedule-icon-* موجودة، ومعها maskable");
  check(!/`|\$\{/.test(PUSH_CARD_JS + PUSH_CARD_CSS), "سكربتُ الشارة وأنماطُها بلا علامة اقتباسٍ مائلة ولا ‎${‎ (يُحقنان في قالب)");
  let compiles = true;
  try { new vm.Script(`(function(){var SK={},TOKEN="t",host=null;function refresh(){}\n${PUSH_CARD_JS}\n})`); } catch { compiles = false; }
  check(compiles, "سكربتُ الشارة سليمُ الصياغة");
  check(/pcSheetIos/.test(PUSH_CARD_JS) && /مشاركة ⬆︎/.test(PUSH_CARD_JS) && /إضافة إلى الشاشة الرئيسية/.test(PUSH_CARD_JS) && /واضغط 🔔/.test(PUSH_CARD_JS),
    "iPhone خارج الشاشة الرئيسية: ثلاثُ خطوات — مشاركة ⬆︎ ← «إضافة إلى الشاشة الرئيسية» ➕ ← افتحها واضغط 🔔");
  check(/data-s=on/.test(PUSH_CARD_CSS) && /data-s=blocked/.test(PUSH_CARD_CSS) && /pcSheetBlocked/.test(PUSH_CARD_JS), "حالاتُ الشارة: نبّهني · ✓ مفعّلة · 🔕 محظورة مع طريق السماح");
  check(!/AdRoom|roomPick|reservedRoom|roomOptions/.test(PUSH_CARD_JS), "والشارةُ لا تقرأ شيئاً عن القاعات");

  /* التوصيل في server.ts: سطرٌ لكل حدث */
  const server = readServerSource();
  const route = (start: string, end: string) => between(server, start, end);
  check(route('app.post("/api/public/request/:token", rateLimitPublicRequest', "/**").includes("if (!unchangedConfirmed) await pushHooks.requestSubmitted(saved);"), "📥 إرسالُ الأستاذ طلبَه (لا تأكيدَ «بلا تعديل»)");
  check(route('app.post("/api/public/request/:token/reply", rateLimitPublicRequest', "/** One signature").includes("await pushHooks.teacherReplied(saved, [index], acceptAt >= 0);")
    && route('app.post("/api/public/request/:token/reply-batch"', "/**").includes("await pushHooks.teacherReplied(saved, [...indexes], true);"), "🤝 ردُّ الأستاذ على المقترح (واحداً ودفعة)");
  check(route('app.post("/api/instructor-requests/:id/decide"', "/* ══ تثبيتُ بندٍ").includes("await pushHooks.requestDecided(saved, index);"), "✅/❌/🔁 قرارُ القسم على بند");
  check(route('app.post("/api/instructor-requests/:id/apply"', "/* ── حوارُ البند").includes("await pushHooks.requestFixed(saved, chain);"), "✅ التثبيتُ الذرّي لسلسلة البنود");
  check(route('app.post("/api/instructor-requests/:id/reply"', "/* ── بابُ الأستاذ").includes("await pushHooks.departmentReplied(saved, index);"), "💬 ردُّ القسم في حوار البند");
  check(route("async function dispatchTaWaves(", 'app.get("/api/ta-phase"').includes("if (out.length) await pushHooks.taWindowOpened(doc.closesAt, out);"), "🎓 موجةُ مرحلة التدريب");
  check(/registerPushRoutes\(app, \{[\s\S]{0,600}resolveCard: async token => \{ const resolved = await resolveRequestLink\(token\);/.test(server), "registerPushRoutes: الكرتُ يُحلّ بـ resolveRequestLink نفسه (موقوفٌ أو منتهٍ = null)");
  const page = between(server, "function instructorRequestPage", 'app.post("/api/public/request/:token/check"');
  check(page.includes("${pushCardHead(token)}") && page.includes("${PUSH_CARD_CSS}") && page.includes("${PUSH_CARD_JS}"), "كرتُ الأستاذ يحمل الشارة ورأسَ «بطاقتي»");
  check(between(server, "function publicPageNonce(", "return nonce;").includes(`"worker-src 'self'"`), "CSP الصفحات العامة يسمح بعامل الكرت (worker-src 'self')");

  /* الخروجُ الصريح: الصفحةُ تُلغي اشتراك الجهاز والجلسةُ صالحة، والخادمُ يُسقط ما فاتها */
  const appSource = read("src/App.tsx");
  const logout = between(appSource, "const logout = async () => {", "};");
  check(logout.includes("await forgetPushDevice()") && logout.indexOf("await forgetPushDevice()") < logout.indexOf('fetch("/api/auth/logout"'),
    "App.tsx: تسجيلُ الخروج يُلغي اشتراكَ الجهاز (forgetPushDevice) قبل إبطال الجلسة");
  check(between(server, 'app.post("/api/auth/logout"', "res.json({ success: true });").includes("await pushHooks.signedOut(sessionId);"), "والخادمُ يُسقط اشتراكاتِ تلك الجلسة عند الخروج");

  /* لا عملَ بعد الرد: Cloud Run يخنق المعالج حين لا طلب، فلا مؤقّتَ تجميعٍ ولا خطافَ لا يُنتظر */
  const routes = read("src/server/pushRoutes.ts");
  check((routes.match(/setTimeout\(/g) || []).length === 1 && /setTimeout\(resolve, HOOK_WAIT_MS\)/.test(routes) && !/createPushDigest|setInterval/.test(routes + read("src/server/webPush.ts")),
    "pushRoutes: المؤقّتُ الوحيد حدُّ انتظار الخطاف — لا مؤقّتَ تجميعٍ في الخلفية");
  check((server.match(/^\s*(?:if \([^)]*\) )?pushHooks\./gm) || []).length === 0 && (server.match(/await pushHooks\./g) || []).length === 8,
    "server.ts: الخطافاتُ الثمانية كلُّها تُنتظر قبل الرد");

  /* اكتشافُ المستلمين لا يقف عند الخمسمئة الأولى */
  const all = Array.from({ length: 1234 }, (_, i) => i);
  const pages: Array<number | null> = [];
  const read1234 = await collectPages<number>(async (after, size) => { pages.push(after); const from = after == null ? 0 : after + 1; return all.slice(from, from + size); });
  check(read1234.length === 1234 && read1234[1233] === 1233 && pages.join() === ",499,999", "collectPages: 1234 اشتراكاً في ثلاث صفحاتٍ متتالية، لا يسقط منها واحد");
  check((await collectPages<number>(async () => all.slice(0, 500))).length === 500 * 200, "وسقفُ الصفحات يمنع حلقةً بلا نهاية");
  const repoSource = read("src/db/repository.ts");
  const list = between(repoSource, "listPushSubscriptions: async", "savePushSubscription: async");
  check(list.includes("collectPages<QueryDocumentSnapshot>") && list.includes("orderBy(FieldPath.documentId())") && list.includes("startAfter(after)") && !/\.limit\(500\)\.get\(\)/.test(list),
    "repository: الاشتراكاتُ تُقرأ صفحةً بعد صفحة بترتيب المعرّف (لا سقفَ 500 صامتاً)");
}

console.log(`\nWeb push audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
