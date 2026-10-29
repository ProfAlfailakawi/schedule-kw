/**
 * ── «تذكّرني على هذا الجهاز» لبطاقة الأستاذ ─────────────────────────────────
 *
 * الأستاذ يفتح بطاقته من رمز QR أو من رسالة، فيكتب رقمه المدني مرةً واحدة.
 * إن اختار «تذكّرني» يعطي الخادمُ جهازَه مفتاحاً موقّعاً، فيفتح الرابطُ نفسُه
 * بطاقتَه مباشرة في المرات التالية.
 *
 * ما في المفتاح وما ليس فيه:
 *   - رقمُ الأستاذ الداخلي وتاريخُ الانتهاء وتوقيعٌ (HMAC) مربوطٌ برمز الرابط نفسه.
 *   - لا رقمَ مدنياً أبداً، ولا يُقرأ المفتاحُ من غير هذا الرابط.
 *
 * أين يُحفظ: ملفُّ تعريف ارتباطٍ HttpOnly وSameSite=Strict ومساره هذا الرابط
 * وحده، فلا تقرؤه صفحةٌ ولا يُرسل إلى غير بطاقته.
 *
 * متى يسقط:
 *   - بانتهاء الرابط، فالانتهاءُ مقيّدٌ بنهاية الرابط.
 *   - بإيقاف الرابط أو تجديده، لأن التوقيع على رمزه.
 *   - بزرّ «انسَ هذا الجهاز».
 *   - وكلُّ بوابات البطاقة تبقى كما هي: الأستاذ في فصل الرابط، والرابط الشخصي لصاحبه وحده.
 *
 * السرّ مشتقٌّ من السرّ المشترك بوسمٍ خاص، كمفتاح التقويم، فلا تُستعمل مادةٌ مفتاحيةٌ واحدة لغرضين.
 */
import { createHmac, timingSafeEqual } from "crypto";

export const STAFF_DEVICE_LABEL = "staff-device-key-v1";
export const STAFF_DEVICE_COOKIE = "sk_dev";
/** سقفٌ أعلى ولو طال الرابط: فصلٌ دراسي ونصف تقريباً. */
export const STAFF_DEVICE_MAX_DAYS = 180;

export function deriveStaffDeviceSecret(envSecret: string | undefined | null, sharedSecret: string): string {
  const configured = String(envSecret || "").trim();
  if (configured) return configured;
  const shared = String(sharedSecret || "").trim();
  if (!shared) throw new Error("staff device secret: shared server secret is empty");
  return createHmac("sha256", shared).update(STAFF_DEVICE_LABEL).digest("hex");
}

export function createStaffDeviceSecretResolver(readEnv: () => string | undefined, readShared: () => Promise<string>) {
  let pending: Promise<string> | null = null;
  return (): Promise<string> => {
    if (!pending) {
      const configured = String(readEnv() || "").trim();
      pending = configured ? Promise.resolve(configured) : readShared().then(shared => deriveStaffDeviceSecret("", shared));
      pending.catch(() => { pending = null; });
    }
    return pending;
  };
}

const signature = (secret: string, token: string, instructorId: number, expiresAt: number) =>
  createHmac("sha256", secret).update(`v1|${token}|${instructorId}|${expiresAt}`).digest("base64url");

/** ينتهي المفتاح عند أقرب الاثنين: نهاية الرابط، أو السقف. */
export function staffDeviceExpiry(linkExpiresAt: string | undefined, now = Date.now()): number {
  const cap = now + STAFF_DEVICE_MAX_DAYS * 86_400_000;
  const linkEnd = Date.parse(String(linkExpiresAt || ""));
  return Number.isFinite(linkEnd) ? Math.min(linkEnd, cap) : cap;
}

export function signStaffDevice(secret: string, token: string, instructorId: number, expiresAt: number): string {
  const id = Math.trunc(Number(instructorId));
  const end = Math.trunc(Number(expiresAt));
  if (!(id > 0) || !(end > 0)) throw new Error("staff device key: bad instructor or expiry");
  return `v1.${id}.${end}.${signature(secret, token, id, end)}`;
}

/** رقمُ الأستاذ إن كان المفتاح صحيحاً لهذا الرابط ولم ينتهِ، وإلا لا شيء. */
export function verifyStaffDevice(secret: string, token: string, value: unknown, now = Date.now()): number | null {
  const parts = String(value || "").split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const id = Number(parts[1]), end = Number(parts[2]);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(end) || end <= now) return null;
  const expected = Buffer.from(signature(secret, token, id, end));
  const given = Buffer.from(parts[3]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return id;
}

/** ترويسة الكوكي: لهذا الرابط وحده، لا تقرؤها الصفحة، ولا تُرسل من موقعٍ آخر. */
export function staffDeviceCookie(token: string, value: string, expiresAt: number, secure: boolean, now = Date.now()): string {
  const maxAge = Math.max(0, Math.floor((expiresAt - now) / 1000));
  return `${STAFF_DEVICE_COOKIE}=${encodeURIComponent(value)}; Path=/api/public/staff/${encodeURIComponent(token)}; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
}

export function clearStaffDeviceCookie(token: string, secure: boolean): string {
  return `${STAFF_DEVICE_COOKIE}=; Path=/api/public/staff/${encodeURIComponent(token)}; Max-Age=0; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
}
