/**
 * ── «شارك مرشدك»: الرمزُ والرابطُ و QR ────────────────────────────────────────
 *
 * يعطي الطالبُ مرشدَه رابطاً للقراءة فقط، صالحاً أربعاً وعشرين ساعة، يُظهر خطّته لا هويّته. الرابط:
 *
 *     /me/share/<locator>.<secret>
 *
 *   · secret: ١٩٢ بتّاً عشوائية (24 بايتاً). على الملف **بصمتُه فقط** (SHA-256) مع الانتهاء؛ فمن قرأ قاعدة
 *     البيانات لا يصنع رابطاً.
 *   · locator: بصمةُ الملف مختومةً (AES-256-GCM بمفتاحٍ مشتقٍّ من مفتاح الباب بوسمٍ خاصٍّ بالمشاركة) ليجد الخادمُ
 *     الملفَّ بقراءةٍ مباشرة بلا فهرسٍ ثانٍ ولا مسحٍ. لا يُقرأ إلا بمفتاح الخادم، فلا بصمةَ مكشوفةً في أيّ رابط
 *     (كما في اشتراك التقويم). ومن خلط مُحدِّد طالبٍ بسرِّ آخر لم يطابق البصمةَ فيُرفض.
 *   · رابطٌ جديد يستبدل البصمةَ فيُبطل السابق، و«أوقف المشاركة» تمحو البصمة، وتغيير الرمز أو الاستعادة يمحوانها.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import qrFactory from "../utils/qrcodeGenerator";

export const SHARE_HOURS = 24;
export const SHARE_SECRET_BYTES = 24;
const LABEL = "student-share-v1";

const sealKey = (key: Buffer): Buffer => createHmac("sha256", key).update(`${LABEL}|enc`).digest();
const fingerprintBytes = (fingerprint: string) => (/^[0-9a-f]{32}$/.test(fingerprint) ? Buffer.from(fingerprint, "hex") : Buffer.from(fingerprint, "utf8"));

/** بصمةُ السرّ كما تُحفظ على الملف. */
export const shareHash = (secret: string): string => createHash("sha256").update(`${LABEL}|${secret}`).digest("hex");

export interface ShareIssue { token: string; hash: string; expiresAt: string; createdAt: string }

export function issueShare(key: Buffer, fingerprint: string, now: number, random: (size: number) => Buffer = randomBytes): ShareIssue {
  const secret = random(SHARE_SECRET_BYTES).toString("base64url");
  const iv = random(12);
  const cipher = createCipheriv("aes-256-gcm", sealKey(key), iv);
  const sealed = Buffer.concat([cipher.update(fingerprintBytes(fingerprint)), cipher.final()]);
  const locator = Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString("base64url");
  return {
    token: `${locator}.${secret}`, hash: shareHash(secret),
    createdAt: new Date(now).toISOString(), expiresAt: new Date(now + SHARE_HOURS * 3_600_000).toISOString(),
  };
}

/** شكلُ الرمز كما يصل في الرابط: يُرفض ما خالفه قبل أيّ فكّ أو قراءة. */
export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,120}\.[A-Za-z0-9_-]{32}$/;

/** المُحدِّد والسرّ، أو null إن عُبث بالرمز. البصمةُ التي في المُحدِّد لا تكفي وحدها: السرُّ يُقارَن بما على الملف. */
export function readShareToken(key: Buffer, token: string): { fingerprint: string; secret: string } | null {
  if (!SHARE_TOKEN_PATTERN.test(String(token || ""))) return null;
  const [locator, secret] = token.split(".");
  try {
    const raw = Buffer.from(locator, "base64url");
    if (raw.length < 12 + 16 + 8 || raw.length > 12 + 16 + 120) return null;
    const decipher = createDecipheriv("aes-256-gcm", sealKey(key), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const plain = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
    return { fingerprint: plain.length === 16 ? plain.toString("hex") : plain.toString("utf8"), secret };
  } catch { return null; }
}

export type ShareState = "ok" | "none" | "expired" | "mismatch";

/** هل هذا السرُّ هو المحفوظ على الملف وما زال حيّاً؟ مقارنةٌ بزمنٍ ثابت. */
export function shareState(share: { hash: string; expiresAt: string } | undefined, secret: string, now: number): ShareState {
  if (!share?.hash) return "none";
  const a = Buffer.from(shareHash(secret)), b = Buffer.from(share.hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return "mismatch";
  return Date.parse(share.expiresAt) > now ? "ok" : "expired";
}

/** رمزُ QR نقطيٌّ نظيف: أحادي اللون على أبيض بهامشٍ هادئ، يُمسح من الهاتف والطباعة. */
export function shareQrSvg(url: string, ink = "#164f44"): string {
  const qr = (qrFactory as any)(0, "M");
  qr.addData(url); qr.make();
  const count: number = qr.getModuleCount(), quiet = 2, size = count + quiet * 2;
  let path = "";
  for (let row = 0; row < count; row += 1) {
    let run = -1;
    for (let col = 0; col <= count; col += 1) {
      const dark = col < count && qr.isDark(row, col);
      if (dark && run < 0) run = col;
      if (!dark && run >= 0) { path += `M${run + quiet} ${row + quiet}h${col - run}v1h-${col - run}z`; run = -1; }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="رمز QR لرابط المشاركة" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="${ink}"/></svg>`;
}
