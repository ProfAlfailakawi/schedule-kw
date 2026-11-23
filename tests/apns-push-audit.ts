/**
 * ── تنبيهاتُ التطبيق الرسمي (APNs) ──────────────────────────────────────────
 *
 *   ١) بلا متغيّرات البيئة: الإرسالُ لا يفعل شيئاً بصمت ولا يتصل بأحد.
 *   ٢) الطلبُ إلى Apple: HTTP/2 بالرؤوس الصحيحة، وتوكنُ المزوّد ES256 يُتحقَّق منه بالمفتاح العام ويُخزَّن.
 *   ٣) 410 وBadDeviceToken وUnregistered تُعدّ توكناً ميتاً (gone)، وغيرُها خطأٌ عابر.
 *   ٤) المسارات: التوكنُ يُحفظ بجانب اشتراكات المتصفّح، ويصله التنبيهُ، ويُحذف الميتُ، ويُلغى بـ unsubscribe.
 *   ٥) اشتراكُ المتصفّح (Web Push) على حاله، وتطبيقٌ بلا بيئةٍ لا يُسقط توكناته.
 *   ٦) جانبُ الصفحة: pushSupport يقول "native" داخل التطبيق إن وُجدت الإضافة، و"none" إن لم توجد.
 *
 * العميلُ HTTP/2 محاكًى: لا اتصالَ بشبكة. والمفتاحُ يُولَّد عند التشغيل، لا مفتاحَ مكتوباً هنا.
 */
import { generateKeyPairSync, verify } from "crypto";
import express from "express";
import { EventEmitter } from "events";
import {
  APNS_PRODUCTION_ORIGIN, APNS_SANDBOX_ORIGIN, apnsConfigFromEnv, apnsEndpoint, apnsPayload, apnsProviderToken, createApnsSender,
  type ApnsClientLike,
} from "../src/server/apnsPush";
import { pushSubscriptionId } from "../src/server/webPush";
import { registerPushRoutes } from "../src/server/pushRoutes";
import { Repository } from "../src/db/repository";
import { pushSupport } from "../src/utils/pushClient";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const P8 = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const ENV = { APNS_KEY_P8: P8.replace(/\n/g, "\\n"), APNS_KEY_ID: "KEYID12345", APNS_TEAM_ID: "TEAMID1234", APNS_TOPIC: "com.example.schedule" };
const TOKEN = "ab".repeat(32);

/* ── محاكي HTTP/2 ───────────────────────────────────────────────────────── */
interface Call { origin: string; headers: Record<string, string>; body: string; closed: boolean }
function fakeApple(answer: (token: string) => { status: number; body?: string } | "hang" | "error") {
  const calls: Call[] = [];
  const connect = (origin: string): ApnsClientLike => {
    const client = new EventEmitter() as any;
    client.request = (headers: Record<string, string>) => {
      const request = new EventEmitter() as any;
      const call: Call = { origin, headers, body: "", closed: false };
      calls.push(call);
      request.setEncoding = () => undefined;
      request.end = (body: string) => {
        call.body = body;
        const result = answer(String(headers[":path"]).split("/").pop() || "");
        if (result === "hang") return;
        if (result === "error") { setImmediate(() => request.emit("error", new Error("boom"))); return; }
        setImmediate(() => {
          request.emit("response", { ":status": result.status });
          if (result.body) request.emit("data", result.body);
          request.emit("end");
        });
      };
      return request;
    };
    client.close = () => { calls.forEach(call => { call.closed = true; }); };
    return client;
  };
  return { calls, connect };
}

(async () => {
  /* ١) بلا بيئة */
  check(apnsConfigFromEnv({}) === null && apnsConfigFromEnv({ ...ENV, APNS_TOPIC: "" }) === null, "نقصُ أيٍّ من المتغيّرات الأربعة: لا إعدادَ");
  const quiet = fakeApple(() => ({ status: 200 }));
  const off = createApnsSender({ env: () => ({}), connect: quiet.connect });
  const none = await off.send(TOKEN, { title: "t" });
  check(none.skipped === true && !none.ok && !none.gone && quiet.calls.length === 0 && !off.configured(), "بلا بيئة: تخطٍّ صامتٌ بلا اتصال");

  /* ٢) الطلبُ */
  const apple = fakeApple(() => ({ status: 200 }));
  const clock = 1_800_000_000_000;
  const sender = createApnsSender({ env: () => ENV, connect: apple.connect, now: () => clock });
  const sentOk = await sender.send(TOKEN.toUpperCase(), { title: "عنوان", body: "نص", url: "/inbox", tag: "tag-1" }, { urgency: "high", collapseId: "c".repeat(80) });
  const call = apple.calls[0];
  check(sentOk.ok && call.origin === APNS_PRODUCTION_ORIGIN && call.closed, "200: نجاحٌ إلى api.push.apple.com، والاتصالُ يُغلق");
  check(call.headers[":method"] === "POST" && call.headers[":path"] === `/3/device/${TOKEN}` && call.headers["apns-topic"] === ENV.APNS_TOPIC
    && call.headers["apns-push-type"] === "alert" && call.headers["apns-priority"] === "10"
    && call.headers["apns-expiration"] === String(clock / 1000 + 86400) && call.headers["apns-collapse-id"].length === 64, "الرؤوس: المسار والموضوع والنوع والأولوية والانتهاء ومعرّف الطيّ (≤ 64)");
  const body = JSON.parse(call.body);
  check(body.aps.alert.title === "عنوان" && body.aps.alert.body === "نص" && body.aps.sound === "default" && body.aps["thread-id"] === "tag-1" && body.url === "/inbox", "الجسم: aps.alert وsound وthread-id، والرابطُ في url");
  check(!("body" in JSON.parse(apnsPayload({ title: "x" })).aps.alert), "تنبيهٌ بلا نصّ: لا حقلَ body فارغ");
  const bearer = call.headers.authorization.replace(/^bearer /, "").split(".");
  const header = JSON.parse(Buffer.from(bearer[0], "base64url").toString()), claims = JSON.parse(Buffer.from(bearer[1], "base64url").toString());
  check(header.alg === "ES256" && header.kid === ENV.APNS_KEY_ID && claims.iss === ENV.APNS_TEAM_ID && claims.iat === clock / 1000, "توكن المزوّد: ES256 بمعرّف المفتاح والفريق ووقت الإصدار");
  check(verify("sha256", Buffer.from(`${bearer[0]}.${bearer[1]}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(bearer[2], "base64url")),
    "التوقيعُ صحيحٌ بالمفتاح العام (IEEE-P1363 كما تشترط Apple)");
  await sender.send(TOKEN, { title: "ثانٍ" });
  check(apple.calls[1].headers.authorization === call.headers.authorization, "توكنُ المزوّد يُعاد استعماله بدل أن يُوقَّع لكل رسالة");
  const sandbox = fakeApple(() => ({ status: 200 }));
  await createApnsSender({ env: () => ({ ...ENV, APNS_ENV: "sandbox" }), connect: sandbox.connect }).send(TOKEN, { title: "t" });
  check(sandbox.calls[0].origin === APNS_SANDBOX_ORIGIN, "APNS_ENV=sandbox: خادمُ المطوّر");
  check(apnsProviderToken({ key: P8, keyId: "K", teamId: "T" }, 1).split(".").length === 3, "المفتاحُ بأسطره الحقيقية يعمل كذلك");
  const badToken = await sender.send("not-hex", { title: "t" });
  check(badToken.gone && apple.calls.length === 2, "توكنٌ ليس hex: يُعدّ ميتاً بلا اتصال");

  /* ٣) الأخطاء */
  const outcome = async (status: number, reason: string) => createApnsSender({ env: () => ENV, connect: fakeApple(() => ({ status, body: JSON.stringify({ reason }) })).connect }).send(TOKEN, { title: "t" });
  const gone410 = await outcome(410, "Unregistered"), badDevice = await outcome(400, "BadDeviceToken"), wrongTopic = await outcome(400, "DeviceTokenNotForTopic");
  const transient = await outcome(503, "ServiceUnavailable"), badJwt = await outcome(403, "ExpiredProviderToken");
  check(gone410.gone && badDevice.gone && wrongTopic.gone && !gone410.ok, "410 وBadDeviceToken وDeviceTokenNotForTopic: توكنٌ ميت");
  check(!transient.gone && !transient.ok && transient.status === 503 && !badJwt.gone, "503 وتوكنُ مزوّدٍ مرفوض: خطأٌ عابر، لا يُحذف التوكن");
  const conn = await createApnsSender({ env: () => ENV, connect: fakeApple(() => "error").connect }).send(TOKEN, { title: "t" });
  check(!conn.ok && !conn.gone && /req: boom/.test(String(conn.error)), "انقطاعُ الطلب: خطأٌ عابر");
  const slow = await createApnsSender({ env: () => ENV, connect: fakeApple(() => "hang").connect, timeoutMs: 30 }).send(TOKEN, { title: "t" });
  check(!slow.ok && !slow.gone && slow.error === "timeout", "لا ردَّ: مهلةٌ ولا حذف");
  const badKey = await createApnsSender({ env: () => ({ ...ENV, APNS_KEY_P8: "not a key" }), connect: fakeApple(() => ({ status: 200 })).connect }).send(TOKEN, { title: "t" });
  check(!badKey.ok && !badKey.gone && !badKey.skipped, "مفتاحٌ معطوب: فشلٌ بلا حذف ولا رمي");

  /* ٤+٥) المسارات */
  const SANDBOX = `demo_apns_push_${Date.now()}`;
  Repository.createDemoSandbox(SANDBOX, 10 * 60_000);
  const web: Array<{ url: string }> = [];
  let envOn = true;
  const answers = new Map<string, { status: number; body?: string }>();
  const wire = fakeApple(token => answers.get(token) || { status: 200 });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { if (!Repository.runDemoSandbox(SANDBOX, next)) next(); });
  app.use(async (req: any, _res, next) => { const id = Number(req.headers["x-test-user"] || 0); if (id) req.user = await Repository.getUserById(id); next(); });
  registerPushRoutes(app, {
    requireAuth: (req: any, res, next) => (req.user ? next() : res.status(401).json({ error: "auth" })),
    isScopeAllowed: () => true, isPowerUser: () => true, resolveCard: async () => null,
    readEnv: () => ({}), fetchImpl: async url => { web.push({ url }); return { status: 201 }; },
    apnsEnv: () => (envOn ? ENV : {}), apnsConnect: wire.connect,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const call2 = (method: string, url: string, body?: unknown, user?: number) => fetch(base + url, {
    method, headers: { "Content-Type": "application/json", ...(user ? { "x-test-user": String(user) } : {}) }, body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async r => ({ status: r.status, data: await r.json().catch(() => null) }));

  try {
    await Repository.withDemoSandbox(SANDBOX, async () => {
      check((await call2("POST", "/api/push/subscribe-native", { token: TOKEN })).status === 401, "تسجيلُ التوكن يحتاج دخولاً");
      check((await call2("POST", "/api/push/subscribe-native", { token: "zz" }, 16)).status === 400, "توكنٌ غير hex يُرفض");
      const saved = await call2("POST", "/api/push/subscribe-native", { token: TOKEN.toUpperCase() }, 16);
      const id = pushSubscriptionId(apnsEndpoint(TOKEN));
      const record = await Repository.getPushSubscription(id);
      check(saved.status === 200 && saved.data.id === id && record?.transport === "apns" && record.endpoint === `apns:${TOKEN}` && record.ownerKind === "user" && record.userId === 16,
        "يُحفظ سجلٌّ بجانب اشتراكات المتصفّح: transport = apns، وendpoint = apns:<token> بحروفٍ صغيرة، وصاحبُه الحساب");
      await call2("POST", "/api/push/subscribe-native", { token: TOKEN }, 16);
      const status = await call2("GET", "/api/push/status", undefined, 16);
      check(status.data.ids.filter((x: string) => x === id).length === 1, "الجهازُ نفسه مرّتين سجلٌّ واحد، والحالةُ تعرفه");

      const tested = await call2("POST", "/api/push/test", {}, 16);
      check(tested.data.ok && tested.data.sent === 1 && wire.calls.length === 1 && wire.calls[0].headers[":path"] === `/3/device/${TOKEN}`, "«جرّب» يصل التوكنَ عبر APNs");

      /* ميتٌ يُحذف، وعابرٌ يبقى */
      await Repository.savePushSubscription({ ...(record as any), id: pushSubscriptionId(`apns:${"cd".repeat(32)}`), endpoint: `apns:${"cd".repeat(32)}`, createdAt: "", updatedAt: "" });
      answers.set(TOKEN, { status: 410, body: JSON.stringify({ reason: "Unregistered" }) });
      await new Promise(resolve => setTimeout(resolve, 0));
      const dead = await call2("POST", "/api/push/test", {}, 16);
      check(dead.data.removed >= 1 && (await Repository.getPushSubscription(id)) === null, "410 Unregistered: يُحذف التوكنُ الميت");
      const keptId = pushSubscriptionId(`apns:${"cd".repeat(32)}`);
      answers.set("cd".repeat(32), { status: 503, body: JSON.stringify({ reason: "ServiceUnavailable" }) });
      await call2("POST", "/api/push/test", {}, 16);
      check((await Repository.getPushSubscription(keptId)) !== null, "503: يبقى التوكن");

      /* الإلغاء */
      await call2("POST", "/api/push/subscribe-native", { token: TOKEN }, 16);
      check((await call2("POST", "/api/push/unsubscribe", { endpoint: `apns:${TOKEN.toUpperCase()}` }, 15)).status === 200 && (await Repository.getPushSubscription(id)) !== null, "حسابٌ آخر لا يُلغي توكنَ غيره");
      await call2("POST", "/api/push/unsubscribe", { endpoint: `apns:${TOKEN.toUpperCase()}` }, 16);
      check((await Repository.getPushSubscription(id)) === null, "unsubscribe بـ apns:<token> يحذف سجلَّ صاحبه");

      /* بلا بيئة: لا إرسال ولا حذف */
      await call2("POST", "/api/push/subscribe-native", { token: TOKEN }, 16);
      envOn = false;
      const callsBefore = wire.calls.length;
      const silent = await call2("POST", "/api/push/test", {}, 16);
      check(wire.calls.length === callsBefore && !silent.data.ok && (await Repository.getPushSubscription(id)) !== null, "بلا APNS_*: لا اتصالَ ولا حذفَ للتوكنات");
      envOn = true;

      /* Web Push على حاله */
      check(web.length === 0 && (await call2("POST", "/api/push/subscribe", { subscription: { endpoint: "https://evil.example/x", keys: { p256dh: "a", auth: "b" } } }, 16)).status === 400,
        "اشتراكُ المتصفّح: رابطٌ خارج خدمات الدفع ما زال يُرفض");
    });
  } finally {
    server.close();
    Repository.dropDemoSandbox(SANDBOX);
  }

  /* ٦) الصفحة */
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: iphone, platform: "iPhone", maxTouchPoints: 5 }, configurable: true });
  const withCapacitor = (cap: any) => { (globalThis as any).window = { isSecureContext: true, matchMedia: () => ({ matches: false }), navigator: {}, Capacitor: cap }; };
  withCapacitor({ isNativePlatform: () => true, getPlatform: () => "ios", Plugins: { PushNotifications: {} } });
  check(pushSupport() === "native", "داخل التطبيق ومعه إضافةُ الدفع: native");
  withCapacitor({ isNativePlatform: () => true });
  check(pushSupport() === "none", "داخل التطبيق بلا الإضافة: none (كما كان)");
  withCapacitor(undefined);
  check(pushSupport() === "ios-install", "Safari على iPhone: خطواتُ الشاشة الرئيسية كما هي");

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
