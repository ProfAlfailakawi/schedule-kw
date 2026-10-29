/**
 * ── تنبيهاتُ الجوال (Web Push): البروتوكول وحده ─────────────────────────────
 *
 * تنبيهٌ يصل الهاتفَ والتطبيقُ مغلق يمرّ بخدمة دفعٍ يملكها المتصفّح (FCM لكروم،
 * Mozilla لفايرفوكس، Apple لسفاري). والخادمُ يكلّمها بمعيارين لا ثالث لهما:
 *
 *   • RFC 8292 (VAPID): توقيعٌ ES256 يقول «أنا خادمُ schedule-kw.com» بمفتاحٍ
 *     ثابت، فلا يدفع إلى اشتراكٍ إلا من أنشأه.
 *   • RFC 8291 + RFC 8188 (aes128gcm): الرسالةُ تُشفَّر لمفتاح المتصفّح نفسه،
 *     فخدمةُ الدفع تحملها ولا تقرؤها.
 *
 * مكتوبٌ بـ node:crypto وحده، بلا مكتبة: ECDH وHKDF وAES-GCM وECDSA كلُّها في
 * Node. ويثبت صحّتَه متجهُ الاختبار في الملحق A من RFC 8291 بايتاً ببايت
 * (tests/web-push-audit.ts). ولا شيء هنا يعرف المستخدمين أو الأساتذة: هذا الملف
 * يشفّر ويوقّع ويرسل؛ ومن يستحق التنبيه وما نصُّه في pushRoutes.ts وpushMessages.ts.
 */
import { createCipheriv, createDecipheriv, createECDH, createHash, createHmac, createPrivateKey, createPublicKey, randomBytes, sign as signBytes, verify as verifyBytes } from "crypto";

/** هويةُ الخادم في رأس VAPID (RFC 8292 §2.1): رابطٌ يُتواصل عبره مع صاحب الخادم. */
export const VAPID_SUBJECT = "https://schedule-kw.com";
/** يومٌ واحد: تنبيهٌ لم يصل خلاله لم يعد خبراً. */
export const PUSH_TTL_SECONDS = 24 * 60 * 60;
/** حجمُ السجلّ في aes128gcm؛ الرسالةُ كلُّها سجلٌّ واحد. */
export const PUSH_RECORD_SIZE = 4096;
/** أقصى نصٍّ صريح: 4096 للجسم كلّه − 86 للرأس − 16 للوسم − 1 للفاصل. */
export const PUSH_MAX_PLAINTEXT = PUSH_RECORD_SIZE - 86 - 16 - 1;
/** وسمُ اشتقاق مفتاح VAPID من السرّ المشترك: مادةٌ مفتاحية واحدة لا تُستعمل لغرضين. */
export const VAPID_KEY_LABEL = "web-push-vapid-p256-v1";

export const b64u = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64url");
export const fromB64u = (text: string): Buffer => Buffer.from(String(text || "").replace(/=+$/, ""), "base64url");
const hmac = (key: Uint8Array, data: Uint8Array): Buffer => createHmac("sha256", key).update(data).digest();
const ONE = Buffer.from([1]);

/** معرّفُ الاشتراك: بصمةُ رابطه. الرابطُ نفسه لا يُكتب في سجلٍّ ولا يُعاد إلى الصفحة. */
export function pushSubscriptionId(endpoint: string): string {
  return createHash("sha256").update(String(endpoint || "")).digest("hex");
}

/* ── التشفير: RFC 8291 §3 فوق RFC 8188 ──────────────────────────────────── */

export interface PushKeys { p256dh: string; auth: string }

interface Derived { cek: Buffer; nonce: Buffer }
function deriveContentKeys(ecdhSecret: Buffer, authSecret: Buffer, uaPublic: Buffer, asPublic: Buffer, salt: Buffer): Derived {
  /* §3.3: «WebPush: info» ‖ 0x00 ‖ مفتاحُ المتصفّح ‖ مفتاحُ الخادم المؤقّت. */
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0", "latin1"), uaPublic, asPublic]);
  const prkKey = hmac(authSecret, ecdhSecret);
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, ONE]));
  /* RFC 8188 §2.2–2.3: مفتاحُ المحتوى (16) والرقمُ الوحيد (12) من الملح نفسه. */
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm\0", "latin1"), ONE])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: nonce\0", "latin1"), ONE])).subarray(0, 12);
  return { cek, nonce };
}

function readUaKeys(keys: PushKeys): { uaPublic: Buffer; authSecret: Buffer } {
  const uaPublic = fromB64u(keys?.p256dh || "");
  const authSecret = fromB64u(keys?.auth || "");
  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) throw new Error("p256dh is not an uncompressed P-256 point");
  if (authSecret.length !== 16) throw new Error("auth secret must be 16 bytes");
  return { uaPublic, authSecret };
}

export interface EncryptOptions {
  /** للاختبار وحده: الملحُ ومفتاحُ الخادم المؤقّت ثابتان ليُطابَق متجهُ RFC 8291. */
  salt?: Uint8Array;
  senderPrivateKey?: Uint8Array;
}

/** يشفّر نصّاً لاشتراكٍ واحد ويعيد جسمَ الطلب كاملاً (الرأس ‖ النصّ المشفّر). */
export function encryptPushPayload(plaintext: string | Uint8Array, keys: PushKeys, options: EncryptOptions = {}): Buffer {
  const { uaPublic, authSecret } = readUaKeys(keys);
  const data = typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : Buffer.from(plaintext);
  if (data.length > PUSH_MAX_PLAINTEXT) throw new Error(`push payload too large (${data.length} > ${PUSH_MAX_PLAINTEXT})`);
  const ecdh = createECDH("prime256v1");
  if (options.senderPrivateKey) ecdh.setPrivateKey(Buffer.from(options.senderPrivateKey));
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(uaPublic);
  const salt = options.salt ? Buffer.from(options.salt) : randomBytes(16);
  if (salt.length !== 16) throw new Error("salt must be 16 bytes");
  const { cek, nonce } = deriveContentKeys(ecdhSecret, authSecret, uaPublic, asPublic, salt);
  /* سجلٌّ واحدٌ أخير: الفاصل 0x02 بلا حشو. */
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const sealed = Buffer.concat([cipher.update(Buffer.concat([data, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(PUSH_RECORD_SIZE, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, sealed]);
}

/** الطرفُ الآخر (المتصفّح): يُستعمل في الاختبار ليُثبت أن ما يُرسل يُقرأ. */
export function decryptPushPayload(body: Uint8Array, uaPrivateKey: string, auth: string): Buffer {
  const message = Buffer.from(body);
  const salt = message.subarray(0, 16);
  const idLength = message.readUInt8(20);
  const asPublic = message.subarray(21, 21 + idLength);
  const sealed = message.subarray(21 + idLength);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(fromB64u(uaPrivateKey));
  const uaPublic = ecdh.getPublicKey();
  const { cek, nonce } = deriveContentKeys(ecdh.computeSecret(asPublic), fromB64u(auth), uaPublic, asPublic, salt);
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(sealed.subarray(sealed.length - 16));
  const padded = Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - 16)), decipher.final()]);
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end -= 1;
  if (end < 0 || padded[end] !== 2) throw new Error("bad padding delimiter");
  return padded.subarray(0, end);
}

/* ── VAPID: RFC 8292 ────────────────────────────────────────────────────── */

export interface VapidKeys {
  /** النقطةُ غير المضغوطة (65 بايتاً) بـ base64url — هي applicationServerKey في المتصفّح. */
  publicKey: string;
  /** العددُ السرّي d (32 بايتاً) بـ base64url. */
  privateKey: string;
}

/** رتبةُ المنحنى P-256: المفتاحُ السرّي عددٌ في [1, n−1]. */
const P256_ORDER = Buffer.from("ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551", "hex");

export function vapidKeysFromPrivate(privateKey: Uint8Array): VapidKeys {
  const d = Buffer.from(privateKey);
  if (d.length !== 32 || d.every(byte => byte === 0) || Buffer.compare(d, P256_ORDER) >= 0) throw new Error("VAPID private key is not a valid P-256 scalar");
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(d);
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(d) };
}

/**
 * مفتاحٌ ثابتٌ لكل النسخ بلا تخزينٍ جديد: يُشتقّ من السرّ المشترك المحفوظ مرّةً
 * واحدة في Firestore (Repository.getSharedServerSecret) بوسمٍ خاصٍّ به — كمفتاح
 * التقويم في calendarSecret.ts. فنسختان متجاورتان على Cloud Run تعطيان المفتاحَ
 * نفسه، وإقلاعٌ باردٌ لا يُسقط اشتراكاً واحداً.
 */
export function deriveVapidKeys(sharedSecret: string): VapidKeys {
  const shared = String(sharedSecret || "").trim();
  if (!shared) throw new Error("web push: shared server secret is empty");
  for (let counter = 0; counter < 8; counter += 1) {
    const candidate = createHmac("sha256", shared).update(`${VAPID_KEY_LABEL}|${counter}`).digest();
    if (!candidate.every(byte => byte === 0) && Buffer.compare(candidate, P256_ORDER) < 0) return vapidKeysFromPrivate(candidate);
  }
  throw new Error("web push: could not derive a VAPID key");
}

/** مفتاحا المشغّل إن ضُبطا (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)، بعد التحقق أنهما زوجٌ واحد. */
export function vapidKeysFromEnv(publicKey?: string | null, privateKey?: string | null): VapidKeys | null {
  const pub = String(publicKey || "").trim();
  const priv = String(privateKey || "").trim();
  if (!pub && !priv) return null;
  if (!pub || !priv) throw new Error("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set together");
  const keys = vapidKeysFromPrivate(fromB64u(priv));
  if (keys.publicKey !== b64u(fromB64u(pub))) throw new Error("VAPID_PUBLIC_KEY does not match VAPID_PRIVATE_KEY");
  return keys;
}

/**
 * محلِّلٌ بذاكرته: المشغّلُ إن ضبط المفتاحين فهما الحَكَم، وإلا اشتقاقٌ من السرّ
 * المشترك. أوّلُ من يحتاج المفتاح ينتظر، ومن بعده يأخذه من الذاكرة؛ والفشلُ لا
 * يُحفظ فيُعاد في الطلب التالي (createCalendarSecretResolver نفسه).
 */
export function createVapidKeyResolver(readEnv: () => { publicKey?: string; privateKey?: string }, readShared: () => Promise<string>) {
  let pending: Promise<VapidKeys> | null = null;
  return (): Promise<VapidKeys> => {
    if (!pending) {
      let configured: VapidKeys | null = null;
      try {
        const env = readEnv();
        configured = vapidKeysFromEnv(env.publicKey, env.privateKey);
        pending = configured ? Promise.resolve(configured) : readShared().then(deriveVapidKeys);
      } catch (error) {
        pending = Promise.reject(error);
      }
      pending.catch(() => { pending = null; });
    }
    return pending;
  };
}

function privateKeyObject(keys: VapidKeys) {
  const point = fromB64u(keys.publicKey);
  return createPrivateKey({ key: { kty: "EC", crv: "P-256", d: keys.privateKey, x: b64u(point.subarray(1, 33)), y: b64u(point.subarray(33, 65)) }, format: "jwk" });
}

export function vapidPublicKeyObject(publicKey: string) {
  const point = fromB64u(publicKey);
  return createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64u(point.subarray(1, 33)), y: b64u(point.subarray(33, 65)) }, format: "jwk" });
}

/** نصف يوم: RFC 8292 يمنع أكثر من 24 ساعة، وهذا ما تقبله خدماتُ الدفع كلُّها. */
export const VAPID_JWT_SECONDS = 12 * 60 * 60;

export function vapidJwt(audience: string, keys: VapidKeys, nowSeconds = Math.floor(Date.now() / 1000), subject = VAPID_SUBJECT): string {
  const header = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(Buffer.from(JSON.stringify({ aud: audience, exp: nowSeconds + VAPID_JWT_SECONDS, sub: subject })));
  const input = `${header}.${claims}`;
  /* ES256 في JWT توقيعٌ خام r‖s (64 بايتاً)، لا DER. */
  const signature = signBytes("sha256", Buffer.from(input), { key: privateKeyObject(keys), dsaEncoding: "ieee-p1363" });
  return `${input}.${b64u(signature)}`;
}

/** يتحقق من توقيعٍ بالمفتاح العام ويعيد ما فيه — للاختبار ولأيّ فحصٍ لاحق. */
export function verifyVapidJwt(token: string, publicKey: string): { valid: boolean; header: any; claims: any } {
  const [header, claims, signature] = String(token || "").split(".");
  try {
    const valid = Boolean(header && claims && signature) && verifyBytes("sha256", Buffer.from(`${header}.${claims}`),
      { key: vapidPublicKeyObject(publicKey), dsaEncoding: "ieee-p1363" }, fromB64u(signature));
    return { valid, header: JSON.parse(fromB64u(header).toString("utf8")), claims: JSON.parse(fromB64u(claims).toString("utf8")) };
  } catch {
    return { valid: false, header: null, claims: null };
  }
}

/** رأسُ Authorization كما في RFC 8292 §3: الجمهورُ أصلُ رابط الاشتراك. */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, nowSeconds = Math.floor(Date.now() / 1000)): string {
  return `vapid t=${vapidJwt(new URL(endpoint).origin, keys, nowSeconds)}, k=${keys.publicKey}`;
}

/* ── الاشتراك: ما يُقبل من المتصفّح ────────────────────────────────────── */

/**
 * الخادمُ سيُرسل إلى هذا الرابط بنفسه، فرابطٌ يُكتب كما يشاء صاحبُه بابٌ لطلباتٍ
 * داخلية (SSRF). فلا يُقبل إلا https إلى خدمات الدفع المعروفة للمتصفّحات.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,               // Chrome · Edge على أندرويد · Samsung · Opera
  /^android\.googleapis\.com$/,           // روابط FCM القديمة
  /(^|\.)push\.services\.mozilla\.com$/,  // Firefox
  /(^|\.)push\.apple\.com$/,              // Safari على iOS 16.4+ وmacOS
  /(^|\.)notify\.windows\.com$/,          // Edge على ويندوز
];

export function isAllowedPushEndpoint(endpoint: unknown): boolean {
  const text = String(endpoint || "");
  if (!text || text.length > 2048) return false;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
    const host = url.hostname.toLowerCase();
    return PUSH_HOSTS.some(pattern => pattern.test(host));
  } catch {
    return false;
  }
}

export interface PushSubscriptionInput { endpoint: string; keys: PushKeys }

/** اشتراكُ المتصفّح كما يصل (subscription.toJSON())، أو null إن لم يكن صالحاً. */
export function readPushSubscription(raw: any): PushSubscriptionInput | null {
  const endpoint = String(raw?.endpoint || "");
  const keys = { p256dh: String(raw?.keys?.p256dh || ""), auth: String(raw?.keys?.auth || "") };
  if (!isAllowedPushEndpoint(endpoint)) return null;
  try {
    readUaKeys(keys);
    /* نقطةٌ على المنحنى حقاً، لا 65 بايتاً تبدأ بـ 0x04 فحسب. */
    const probe = createECDH("prime256v1");
    probe.generateKeys();
    probe.computeSecret(fromB64u(keys.p256dh));
  } catch {
    return null;
  }
  return { endpoint, keys: { p256dh: b64u(fromB64u(keys.p256dh)), auth: b64u(fromB64u(keys.auth)) } };
}

/* ── السجلّ المحفوظ ──────────────────────────────────────────────────────── */

/**
 * اشتراكٌ واحد لجهازٍ واحد، مربوطٌ بصاحبه: حسابٌ في التطبيق، أو كرتُ أستاذٍ برمزه
 * (رابطُه الشخصي). المعرّفُ بصمةُ الرابط، فالجهازُ الواحد سجلٌّ واحد مهما اشترك.
 */
export interface PushSubscriptionRecord {
  id: string;
  endpoint: string;
  keys: PushKeys;
  ownerKind: "user" | "card";
  /** صاحبُ الحساب (ownerKind = user). */
  userId?: number;
  /** رمزُ الكرت (ownerKind = card) وصاحبُه. */
  cardToken?: string;
  instructorId?: number;
  createdAt: string;
  updatedAt: string;
  /** وصفٌ عامّ للجهاز («iPhone»، «Android»…) يُعرض لصاحبه، لا بصمةَ متصفّح. */
  device?: string;
  lastSentAt?: string;
  /** بصمةُ جلسة الدخول التي فعّلته (لا الجلسةُ نفسها): خروجُها الصريح يُسقطه. */
  session?: string;
}

/** بصمةُ جلسة الدخول كما تُحفظ مع اشتراك الحساب. */
export function pushSessionTag(sessionId: string): string {
  return createHash("sha256").update(`push-session|${String(sessionId || "")}`).digest("hex").slice(0, 32);
}

/**
 * يقرأ مجموعةً كاملةً صفحةً بعد صفحة: `fetchPage(after, size)` يعيد صفحةً تبدأ بعد
 * آخر عنصرٍ من سابقتها. صفحةٌ ناقصة تعني النهاية. سقفٌ للصفحات يمنع حلقةً بلا نهاية.
 */
export async function collectPages<T>(fetchPage: (after: T | null, size: number) => Promise<T[]>, size = 500, maxPages = 200): Promise<T[]> {
  const out: T[] = [];
  let after: T | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const rows = await fetchPage(after, size);
    out.push(...rows);
    if (rows.length < size) break;
    after = rows[rows.length - 1];
  }
  return out;
}

export function deviceLabel(userAgent: unknown): string {
  const ua = String(userAgent || "");
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua))) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  return "";
}

/* ── الإرسال ─────────────────────────────────────────────────────────────── */

export interface PushMessage {
  title: string;
  body?: string;
  /** صفحةٌ من الموقع نفسه تُفتح عند اللمس. */
  url?: string;
  /** يستبدل التنبيهُ ذو الوسم نفسه سابقَه في قائمة الإشعارات. */
  tag?: string;
  at?: string;
}

export type PushUrgency = "very-low" | "low" | "normal" | "high";

export interface SendResult {
  status: number;
  ok: boolean;
  /** 404/410: الاشتراكُ انتهى عند خدمة الدفع، فيُحذف. */
  gone: boolean;
  error?: string;
}

export type PushFetch = (url: string, init: { method: string; headers: Record<string, string>; body: Uint8Array; signal?: AbortSignal }) => Promise<{ status: number }>;

export interface SendOptions {
  vapid: VapidKeys;
  ttl?: number;
  urgency?: PushUrgency;
  /** RFC 8030 §5.4: رسالةٌ لم تُسلَّم بعدُ يستبدلها ما يحمل الموضوعَ نفسه. */
  topic?: string;
  fetchImpl?: PushFetch;
  nowSeconds?: number;
}

/** الموضوعُ ٣٢ محرفاً على الأكثر من أبجدية base64url (RFC 8030 §5.4). */
export function pushTopic(seed: string): string {
  return createHash("sha256").update(String(seed)).digest("base64url").slice(0, 32);
}

export async function sendWebPush(target: PushSubscriptionInput, message: PushMessage, options: SendOptions): Promise<SendResult> {
  if (!isAllowedPushEndpoint(target.endpoint)) return { status: 0, ok: false, gone: true, error: "endpoint not allowed" };
  let body: Buffer;
  try {
    body = encryptPushPayload(JSON.stringify(message), target.keys);
  } catch (error: any) {
    return { status: 0, ok: false, gone: false, error: String(error?.message || error) };
  }
  const headers: Record<string, string> = {
    TTL: String(Math.max(0, Math.round(options.ttl ?? PUSH_TTL_SECONDS))),
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    Urgency: options.urgency || "normal",
    Authorization: vapidAuthorization(target.endpoint, options.vapid, options.nowSeconds),
  };
  if (options.topic) headers.Topic = options.topic;
  const doFetch: PushFetch = options.fetchImpl || ((url, init) => fetch(url, init as any));
  try {
    const response = await doFetch(target.endpoint, { method: "POST", headers, body, signal: AbortSignal.timeout(10_000) });
    const status = Number(response?.status || 0);
    return { status, ok: status >= 200 && status < 300, gone: status === 404 || status === 410 };
  } catch (error: any) {
    return { status: 0, ok: false, gone: false, error: String(error?.name === "TimeoutError" ? "timeout" : error?.message || error) };
  }
}

/* ── حدُّ كل اشتراك ──────────────────────────────────────────────────────── */

/**
 * دلوٌ لكل اشتراك: خمسةُ تنبيهاتٍ متتالية، ثم واحدٌ كل دقيقة. هو شبكةُ الأمان
 * الأخيرة تحت التجميع: لا خللٌ في حلقةٍ ولا ضغطٌ متكرّر على «جرّب» يُغرق هاتفاً.
 */
export function createPushRateLimiter(options: { capacity?: number; refillMs?: number; now?: () => number } = {}) {
  const capacity = Math.max(1, options.capacity ?? 5);
  const refillMs = Math.max(1, options.refillMs ?? 60_000);
  const clock = options.now || Date.now;
  const buckets = new Map<string, { tokens: number; at: number }>();
  const level = (id: string, now: number) => {
    const bucket = buckets.get(id);
    if (!bucket) return capacity;
    return Math.min(capacity, bucket.tokens + (now - bucket.at) / refillMs);
  };
  return {
    /** يأخذ رمزاً إن وُجد. */
    take(id: string): boolean {
      const now = clock();
      if (buckets.size > 5000) for (const [key] of buckets) if (level(key, now) >= capacity) buckets.delete(key);
      const tokens = level(id, now);
      if (tokens < 1) { buckets.set(id, { tokens, at: now }); return false; }
      buckets.set(id, { tokens: tokens - 1, at: now });
      return true;
    },
    remaining(id: string): number { return Math.floor(level(id, clock())); },
  };
}

/* ── التجميع: تنبيهٌ واحد لكل دفعة ─────────────────────────────────────── */

export interface DigestFlush<T> { key: string; events: T[]; reason: "first" | "window" }

/**
 * أوّلُ حدثٍ في هدوءٍ يُرسل فوراً (والطلبُ ما زال يُخدم، فلا ينتظر خادماً نائماً)،
 * وما يلحقه في النافذة (ثلاث دقائق للأقسام) يُجمع ويُرسل مرّةً واحدة عند انقضائها
 * بالعدد كلّه منذ أوّل الدفعة — والتنبيهُ الجديد يستبدل سابقَه بالوسم نفسه، فما
 * يبقى على الشاشة «3 طلبات جديدة» لا ثلاثُ بطاقات. الحدثُ المكرّر (الطلبُ نفسُه
 * يُعاد إرساله في النافذة) لا يُعدّ مرّتين. والدفعةُ تنتهي بنافذةٍ هادئةٍ كاملة.
 */
export function createPushDigest<T>(options: {
  windowMs: number;
  flush: (batch: DigestFlush<T>) => void;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}) {
  const clock = options.now || Date.now;
  const schedule = options.schedule || ((fn: () => void, ms: number) => {
    const handle = setTimeout(fn, ms);
    (handle as any).unref?.();
    return handle;
  });
  const cancel = options.cancel || ((handle: unknown) => clearTimeout(handle as any));
  const entries = new Map<string, { events: Map<string, T>; flushedSize: number; lastFlushAt: number; lastEventAt: number; timer: unknown | null }>();

  const flushNow = (key: string, reason: DigestFlush<T>["reason"]) => {
    const entry = entries.get(key);
    if (!entry) return;
    if (entry.timer) { cancel(entry.timer); entry.timer = null; }
    entry.lastFlushAt = clock();
    entry.flushedSize = entry.events.size;
    options.flush({ key, events: [...entry.events.values()], reason });
  };

  return {
    /** أحداثٌ معاً (سلسلةُ بنودٍ في تثبيتٍ واحد) تُضاف معاً، فتكون في تنبيهٍ واحد. */
    add(key: string, items: Array<{ id: string; event: T }>): "now" | "held" | "duplicate" {
      const now = clock();
      if (!items.length) return "duplicate";
      if (entries.size > 2000) for (const [k, e] of entries) if (!e.timer && now - e.lastEventAt > 60 * 60_000) entries.delete(k);
      let entry = entries.get(key);
      const settled = entry && entry.events.size === entry.flushedSize && !entry.timer;
      if (!entry || (settled && now - entry.lastEventAt >= options.windowMs && now - entry.lastFlushAt >= options.windowMs)) {
        entry = { events: new Map(items.map(item => [item.id, item.event] as [string, T])), flushedSize: 0, lastFlushAt: 0, lastEventAt: now, timer: null };
        entries.set(key, entry);
        flushNow(key, "first");
        return "now";
      }
      entry.lastEventAt = now;
      const fresh = items.filter(item => !entry!.events.has(item.id));
      if (!fresh.length) return "duplicate";
      for (const item of fresh) entry.events.set(item.id, item.event);
      if (now - entry.lastFlushAt >= options.windowMs) { flushNow(key, "window"); return "now"; }
      if (!entry.timer) {
        entry.timer = schedule(() => {
          const current = entries.get(key);
          if (!current) return;
          current.timer = null;
          if (current.events.size > current.flushedSize) flushNow(key, "window");
        }, Math.max(0, entry.lastFlushAt + options.windowMs - now));
      }
      return "held";
    },
    /** للاختبار: ما ينتظر الإرسال في مفتاحٍ ما. */
    pending(key: string): number {
      const entry = entries.get(key);
      return entry ? entry.events.size - entry.flushedSize : 0;
    },
  };
}
