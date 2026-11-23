/**
 * ── تنبيهاتُ التطبيق الرسمي (APNs) ──────────────────────────────────────────
 *
 * داخل غلاف iOS لا يوجد Web Push: يسجّل التطبيقُ جهازَه لدى Apple فيُعطى توكناً (hex)،
 * ويحفظه الخادمُ بجانب اشتراكات المتصفّح (الشكلُ نفسه: transport = "apns" وendpoint = "apns:<token>")،
 * ويرسل إليه عبر HTTP/2 مباشرةً بمفتاحٍ .p8 يقرؤه من البيئة وحدها:
 *
 *   APNS_KEY_P8   محتوى المفتاح (يقبل \n بدل الأسطر)
 *   APNS_KEY_ID   معرّف المفتاح
 *   APNS_TEAM_ID  معرّف الفريق
 *   APNS_TOPIC    معرّف حزمة التطبيق
 *   APNS_ENV      اختياري: sandbox لبناء المطوّر، وغيرُه production (TestFlight وApp Store)
 *
 * غابَ أيٌّ منها فالإرسالُ لا يفعل شيئاً بصمت. وما ترفضه Apple بـ 410 أو BadDeviceToken أو
 * Unregistered يُحذف توكنُه (gone). لا مفتاحَ ولا معرّفَ مكتوباً هنا.
 */
import { createHash, sign as signBytes } from "crypto";
import http2 from "node:http2";
import type { PushMessage, PushUrgency } from "./webPush";

export const APNS_ENDPOINT_PREFIX = "apns:";
export const APNS_PRODUCTION_ORIGIN = "https://api.push.apple.com";
export const APNS_SANDBOX_ORIGIN = "https://api.sandbox.push.apple.com";
/** يوم: كما في Web Push، تنبيهٌ لم يصل خلاله لم يعد خبراً. */
export const APNS_TTL_SECONDS = 24 * 60 * 60;
/** Apple تطلب تجديد توكن المزوّد كل 20–60 دقيقة. */
export const APNS_JWT_REFRESH_SECONDS = 40 * 60;
const APNS_TIMEOUT_MS = 10_000;

/** توكن الجهاز: hex (32 بايتاً اليوم، وApple تحتفظ بحقّ التمديد). */
export const APNS_TOKEN_PATTERN = /^[0-9a-fA-F]{64,200}$/;
export const apnsEndpoint = (token: string): string => `${APNS_ENDPOINT_PREFIX}${String(token).toLowerCase()}`;
export const apnsTokenOf = (endpoint: string): string => String(endpoint || "").startsWith(APNS_ENDPOINT_PREFIX) ? String(endpoint).slice(APNS_ENDPOINT_PREFIX.length) : "";

export interface ApnsConfig { key: string; keyId: string; teamId: string; topic: string; origin: string }
type Env = Record<string, string | undefined>;

/** الإعدادُ من البيئة، أو null إن نقص منه شيء. */
export function apnsConfigFromEnv(env: Env = process.env): ApnsConfig | null {
  const key = String(env.APNS_KEY_P8 || "").replace(/\\n/g, "\n").trim();
  const keyId = String(env.APNS_KEY_ID || "").trim();
  const teamId = String(env.APNS_TEAM_ID || "").trim();
  const topic = String(env.APNS_TOPIC || "").trim();
  if (!key || !keyId || !teamId || !topic) return null;
  return { key, keyId, teamId, topic, origin: String(env.APNS_ENV || "").trim().toLowerCase() === "sandbox" ? APNS_SANDBOX_ORIGIN : APNS_PRODUCTION_ORIGIN };
}

const b64url = (data: string | Uint8Array): string => Buffer.from(data).toString("base64url");

/** توكن المزوّد (JWT ES256) كما تشترطه Apple. */
export function apnsProviderToken(config: Pick<ApnsConfig, "key" | "keyId" | "teamId">, nowSeconds: number): string {
  const head = `${b64url(JSON.stringify({ alg: "ES256", kid: config.keyId }))}.${b64url(JSON.stringify({ iss: config.teamId, iat: nowSeconds }))}`;
  const signature = signBytes("sha256", Buffer.from(head), { key: config.key, dsaEncoding: "ieee-p1363" });
  return `${head}.${b64url(signature)}`;
}

/** جسمُ التنبيه: العنوان والنص، والرابطُ (مسارٌ من الموقع) في url، والوسمُ يجمع التنبيهات المتشابهة. */
export function apnsPayload(message: PushMessage): string {
  return JSON.stringify({
    aps: { alert: { title: message.title, ...(message.body ? { body: message.body } : {}) }, sound: "default", ...(message.tag ? { "thread-id": message.tag } : {}) },
    ...(message.url ? { url: message.url } : {}),
  });
}

export interface ApnsResult {
  ok: boolean;
  /** 410 أو BadDeviceToken/Unregistered/DeviceTokenNotForTopic: التوكنُ ميتٌ فيُحذف. */
  gone: boolean;
  status: number;
  /** لم يُرسل شيءٌ لأن البيئةَ غير مضبوطة. */
  skipped?: boolean;
  error?: string;
}

/** ما يلزم من عميل HTTP/2 (ما يطابق node:http2 للاختبار بمحاكٍ). */
export interface ApnsRequestLike {
  on(event: string, listener: (...args: any[]) => void): unknown;
  setEncoding?(encoding: string): unknown;
  end(body?: string): unknown;
  close?(): unknown;
}
export interface ApnsClientLike {
  request(headers: Record<string, string>): ApnsRequestLike;
  on(event: string, listener: (...args: any[]) => void): unknown;
  close(): unknown;
}
export type ApnsConnect = (origin: string) => ApnsClientLike;

export interface ApnsSenderOptions {
  env?: () => Env;
  connect?: ApnsConnect;
  now?: () => number;
  timeoutMs?: number;
}

const DEAD_REASONS = /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/i;

export function createApnsSender(options: ApnsSenderOptions = {}) {
  const readEnv = options.env || (() => process.env);
  const connect: ApnsConnect = options.connect || (origin => http2.connect(origin) as unknown as ApnsClientLike);
  const clock = options.now || Date.now;
  const timeoutMs = options.timeoutMs ?? APNS_TIMEOUT_MS;
  let cached: { jwt: string; issuedAt: number; seed: string } | null = null;

  const providerToken = (config: ApnsConfig): string => {
    const nowSeconds = Math.floor(clock() / 1000);
    const seed = `${config.keyId}|${config.teamId}|${createHash("sha256").update(config.key).digest("hex")}`;
    if (cached && cached.seed === seed && nowSeconds - cached.issuedAt < APNS_JWT_REFRESH_SECONDS) return cached.jwt;
    const jwt = apnsProviderToken(config, nowSeconds);
    cached = { jwt, issuedAt: nowSeconds, seed };
    return jwt;
  };

  return {
    configured: (): boolean => apnsConfigFromEnv(readEnv()) !== null,
    send(token: string, message: PushMessage, extra: { urgency?: PushUrgency; collapseId?: string } = {}): Promise<ApnsResult> {
      const config = apnsConfigFromEnv(readEnv());
      if (!config) return Promise.resolve({ ok: false, gone: false, status: 0, skipped: true });
      if (!APNS_TOKEN_PATTERN.test(token)) return Promise.resolve({ ok: false, gone: true, status: 0, error: "bad token" });
      let jwt: string;
      try { jwt = providerToken(config); }
      catch (error: any) { return Promise.resolve({ ok: false, gone: false, status: 0, error: `key: ${String(error?.message || error)}` }); }
      const nowSeconds = Math.floor(clock() / 1000);
      return new Promise<ApnsResult>(resolve => {
        let settled = false;
        let client: ApnsClientLike | null = null;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = (result: ApnsResult) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          try { client?.close(); } catch { /* مغلقٌ سلفاً */ }
          resolve(result);
        };
        try {
          client = connect(config.origin);
          client.on("error", (error: any) => finish({ ok: false, gone: false, status: 0, error: `conn: ${String(error?.message || error)}` }));
          timer = setTimeout(() => finish({ ok: false, gone: false, status: 0, error: "timeout" }), timeoutMs);
          const request = client.request({
            ":method": "POST",
            ":path": `/3/device/${token.toLowerCase()}`,
            authorization: `bearer ${jwt}`,
            "apns-topic": config.topic,
            "apns-push-type": "alert",
            "apns-priority": extra.urgency === "very-low" || extra.urgency === "low" ? "5" : "10",
            "apns-expiration": String(nowSeconds + APNS_TTL_SECONDS),
            ...(extra.collapseId ? { "apns-collapse-id": extra.collapseId.slice(0, 64) } : {}),
            "content-type": "application/json",
          });
          let status = 0;
          let text = "";
          request.on("response", (headers: Record<string, any>) => { status = Number(headers?.[":status"] || 0); });
          request.setEncoding?.("utf8");
          request.on("data", (chunk: string) => { text += chunk; });
          request.on("end", () => {
            if (status === 200) { finish({ ok: true, gone: false, status }); return; }
            let reason = "";
            try { reason = String(JSON.parse(text).reason || ""); } catch { reason = text.slice(0, 120); }
            finish({ ok: false, gone: status === 410 || DEAD_REASONS.test(reason), status, error: reason || undefined });
          });
          request.on("error", (error: any) => finish({ ok: false, gone: false, status: 0, error: `req: ${String(error?.message || error)}` }));
          request.end(apnsPayload(message));
        } catch (error: any) {
          finish({ ok: false, gone: false, status: 0, error: String(error?.message || error) });
        }
      });
    },
  };
}

export type ApnsSender = ReturnType<typeof createApnsSender>;
