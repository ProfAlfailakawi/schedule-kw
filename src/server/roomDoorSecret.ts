/**
 * ── رمزُ ملصق الباب: يُطبع مرّةً ويبقى ───────────────────────────────────────
 *
 * الملصقُ يُلصق على الباب سنين، فرمزُه لا يجوز أن يموت بنشرٍ جديد ولا بتدوير
 * سرٍّ لغرضٍ آخر. لذلك:
 *
 *   1) المفتاحُ مشتقٌّ من السرّ المشترك المحفوظ وحده (Repository.getSharedServerSecret
 *      — السرُّ نفسُه الذي تُختم به حالاتُ الطلبة، وهو لا يُدوَّر)، بوسمٍ خاصٍّ
 *      بالأبواب، على طريقة calendarSecret.ts. ولا يُقرأ CALENDAR_SECRET هنا أبداً:
 *      تدويرُ اشتراكات التقويم لا يمسّ ملصقاً واحداً.
 *   2) الرمزُ HMAC على هوية القاعة في السجل (معرّفُها الثابت، لا رمزُها المطبوع):
 *      نقلُ القاعة أو تصحيحُ رمزها يُبقي ملصقها حيّاً.
 *   3) ستّ عشرة خانة base64url (96 بت): لا تُخمَّن، وتبقي رابط الرمز قصيراً فيكبر
 *      مربّعُ QR ويُقرأ من بعيد.
 *
 * وفي البيئة التجريبية يحمل الرمزُ وسمَ صندوق الزائر («demo.<وسم>.<رمز>»): يُفتح
 * من هاتفٍ بلا جلسة على صندوق صاحبه وحده، ولا يُبحث عنه في البيانات الحقيقية.
 */
import { createHmac } from "crypto";

export const ROOM_DOOR_KEY_LABEL = "room-door-sticker-v1";
export const DOOR_TOKEN_LENGTH = 16;
export const DOOR_DEMO_TAG_LENGTH = 10;
const TOKEN = /^[A-Za-z0-9_-]{16}$/;
const DEMO_TOKEN = /^demo\.([A-Za-z0-9_-]{10})\.([A-Za-z0-9_-]{16})$/;

const mac = (key: string, text: string, length: number) =>
  createHmac("sha256", key).update(text).digest("base64url").slice(0, length);

/** مفتاحُ الأبواب من السرّ المشترك — ولا شيء غيره. */
export function deriveRoomDoorKey(sharedSecret: string): string {
  const shared = String(sharedSecret || "").trim();
  if (!shared) throw new Error("room door key: shared server secret is empty");
  return createHmac("sha256", shared).update(ROOM_DOOR_KEY_LABEL).digest("hex");
}

/** رمزُ صفحة القاعة (/d/…) من معرّفها الثابت في السجل. */
export const roomDoorToken = (key: string, roomId: string): string => mac(key, `room|${roomId}`, DOOR_TOKEN_LENGTH);

/** رمزُ لوحة المبنى (/b/…). الوسمُ يختلف، فلا يفتح رمزُ مبنى صفحةَ قاعة ولا العكس. */
export const buildingDoorToken = (key: string, buildingId: string): string => mac(key, `building|${buildingId}`, DOOR_TOKEN_LENGTH);

/** وسمُ صندوقٍ تجريبي: مشتقٌّ من جلسته ولا يكشفها (الجلسةُ مفتاحُ دخولٍ، لا تُطبع). */
export const demoDoorTag = (key: string, sessionId: string): string => mac(key, `demo|${sessionId}`, DOOR_DEMO_TAG_LENGTH);

export const demoDoorToken = (tag: string, token: string): string => `demo.${tag}.${token}`;

/** يقرأ الرمز من الرابط: حقيقيٌّ، أو تجريبيٌّ بوسم صندوقه، أو null. */
export function parseDoorToken(raw: unknown): { token: string; demoTag?: string } | null {
  const text = String(raw ?? "");
  if (TOKEN.test(text)) return { token: text };
  const demo = DEMO_TOKEN.exec(text);
  return demo ? { token: demo[2], demoTag: demo[1] } : null;
}

/**
 * محلِّلٌ للمفتاح بذاكرته: أوّلُ من يحتاجه ينتظر قراءة السرّ، ومن بعده يأخذه من
 * الذاكرة؛ والقراءةُ الفاشلة لا تُحفظ فتُعاد المحاولة (كما createCalendarSecretResolver).
 */
export function createRoomDoorKeyResolver(readShared: () => Promise<string>) {
  let pending: Promise<string> | null = null;
  return (): Promise<string> => {
    if (!pending) {
      pending = readShared().then(deriveRoomDoorKey);
      pending.catch(() => { pending = null; });
    }
    return pending;
  };
}
