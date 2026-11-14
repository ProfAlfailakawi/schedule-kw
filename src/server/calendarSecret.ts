/**
 * ── مفتاح اشتراك التقويم: واحدٌ لكل النسخ، لا لكل إقلاع ────────────────────
 *
 * رابطُ اشتراك التقويم يحمل مفتاحاً مشتقّاً (HMAC على الرابط ورقم الأستاذ).
 * كان سرُّ الاشتقاق `process.env.CALENDAR_SECRET || randomBytes(32)` — وعلى
 * Cloud Run لم يكن المتغيّر مضبوطاً، فكلُّ إقلاعٍ بارد يولّد سرّاً جديداً،
 * فيموت كلُّ اشتراكٍ في هواتف الأساتذة، وتردّ نسختان متجاورتان مفتاحين
 * مختلفين للبطاقة نفسها.
 *
 * القاعدة هنا في موضعٍ واحد:
 *   1) إن ضبط المشغّلُ CALENDAR_SECRET فهو الحَكَم (والاشتراكات القائمة
 *      عليه تبقى كما هي حرفاً بحرف).
 *   2) وإلا يُشتقّ من السرّ المشترك المحفوظ مرّةً واحدة (السرّ نفسه الذي
 *      تعتمده حالات الطلبة، في Firestore) بوسمٍ خاصٍّ بالتقويم، فلا يُعاد
 *      استعمالُ مادةٍ مفتاحية واحدة لغرضين.
 *
 * التهيئة كسولة ومنتظَرة: أوّلُ من يحتاج المفتاح ينتظر قراءة السرّ، ومن
 * بعده يأخذه من الذاكرة. وإن فشلت القراءة لا يُحفظ الفشل؛ يُعاد المحاولة.
 */
import { createHmac } from "crypto";

export const CALENDAR_KEY_LABEL = "calendar-feed-key-v1";

export function deriveCalendarSecret(envSecret: string | undefined | null, sharedSecret: string): string {
  const configured = String(envSecret || "").trim();
  if (configured) return configured;
  const shared = String(sharedSecret || "").trim();
  if (!shared) throw new Error("calendar secret: shared server secret is empty");
  return createHmac("sha256", shared).update(CALENDAR_KEY_LABEL).digest("hex");
}

/** مفتاحُ اشتراك أستاذٍ واحد في رابطٍ واحد. */
export function calendarFeedKey(secret: string, token: string, instructorId: number): string {
  return createHmac("sha256", secret).update(`${token}|${instructorId}`).digest("hex").slice(0, 32);
}

/**
 * يبني محلِّلاً للسرّ له ذاكرته الخاصة — نسخةُ خادمٍ واحدة = محلِّلٌ واحد.
 * `readEnv` يُقرأ عند أوّل طلب لا عند التحميل، فيصحّ الاختبار والتهيئة المتأخرة.
 */
export function createCalendarSecretResolver(readEnv: () => string | undefined, readShared: () => Promise<string>) {
  let pending: Promise<string> | null = null;
  return (): Promise<string> => {
    if (!pending) {
      const configured = String(readEnv() || "").trim();
      pending = configured
        ? Promise.resolve(configured)
        : readShared().then(shared => deriveCalendarSecret("", shared));
      pending.catch(() => { pending = null; });
    }
    return pending;
  };
}

/**
 * ── مفتاحُ اشتراكٍ للأستاذ نفسه، مربوطٌ برابط بطاقته الحيّ ───────────────────────
 *
 * الصيغة: ‎p<رقم>-<HMAC>‎ في ‎/api/public/cal/<رمز البطاقة>/p<رقم>-<مفتاح>.ics‎. كان المفتاحُ للأستاذ وحده والرمزُ في
 * المسار لا يُفحص، فمن حصل على رابطٍ مسرَّب قرأ الجدولَ الرسمي (بقاعاته) ما دام للأستاذ بطاقةٌ حيّة أيّاً كانت.
 * الآن (قرار المراجعة 2026-11-14):
 *   1) المفتاحُ يُشتقّ من رمز الرابط ورقم الأستاذ معاً، فتجديدُ الرابط أو إيقافُه يُبطل ما حُمل عليه؛
 *   2) والخادمُ لا يعرض الجدولَ إلا والرمزُ في المسار بطاقةٌ حيّة **لهذا الأستاذ** (liveCardLinkFor في
 *      src/utils/shareLinkLifetime.ts: رابطُه الشخصي، أو رابطُ طلبه، أو بطاقةُ قسمٍ يدرّس فيه)؛ وإلا أجاب تقويماً
 *      صالحاً فارغاً وصفُه CALENDAR_FEED_PAUSED_NOTE (لا جدولَ ولا خطأ، فتُمسح المحاضراتُ من الهاتف بهدوء)؛
 *   3) المفاتيحُ القديمة (بلا ربط) التي حُملت على الهواتف قبل هذا التغيير تبقى تعمل ما دام الرابطُ نفسُه حيّاً، وتموت
 *      بأول تجديدٍ له. وبعد التجديد يضيف الأستاذُ الرابطَ الجديد إلى هاتفه مرّةً واحدة.
 * لا يكشف رقماً مدنياً ولا يُخمَّن بلا السرّ، ويُبطَل كلُّه بتدوير CALENDAR_SECRET.
 */
export function personCalendarKey(secret: string, instructorId: number, token?: string): string {
  const id = Math.trunc(Number(instructorId));
  /* مع رمز البطاقة: المفتاحُ مربوطٌ بالرابط الذي صدر منه، فتجديدُ الرابط أو إيقافُه يُبطل ما حُمل عليه
     (والخادمُ يتحقّق فوق ذلك أن الرمز بطاقةٌ حيّة لهذا الأستاذ). وبلا رمزٍ الصيغةُ القديمة حرفاً بحرف: اشتراكاتُ الهواتف القائمة. */
  const label = token ? `calendar-person-link|${id}|${token}` : `calendar-person|${id}`;
  return `p${id}-${createHmac("sha256", secret).update(label).digest("hex").slice(0, 32)}`;
}

/**
 * وصفُ الاشتراك الثابت حين يتوقّف (لم يبقَ للأستاذ رابطُ بطاقةٍ حيّ): يُكتب في
 * ‎X-WR-CALDESC‎ لتقويمٍ صالحٍ فارغ يحمل الاسمَ نفسه، فيمسح الهاتفُ المحاضراتِ بهدوء
 * بدل خطأٍ يُبقيها، ويعود الاشتراكُ وحده متى صدرت له بطاقةٌ جديدة.
 */
export const CALENDAR_FEED_PAUSED_NOTE = "توقّف هذا الاشتراك: لا بطاقة سارية لك الآن. يعود وحده متى أصدر القسم بطاقتك.";

const sameText = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/**
 * يقرأ رقم الأستاذ من المفتاح ويتحقق منه؛ 0 حين لا يطابق. يقبل لاحقة ".ics".
 * مع `token` (رمز البطاقة في المسار) يُقبل المفتاحُ المربوط بالرمز، أو المفتاحُ القديم الذي حُمل على الهواتف قبل الربط
 * — والأخيرُ لا يُجدي إلا والرمزُ نفسُه بطاقةٌ حيّةٌ لصاحبه (يتحقّق منها المسار)، فيموت بتجديد الرابط.
 */
export function instructorFromCalendarKey(secret: string, key: string, token?: string): number {
  const clean = String(key || "").replace(/\.ics$/i, "");
  const match = /^p(\d{1,9})-[0-9a-f]{32}$/.exec(clean);
  if (!match) return 0;
  const id = Number(match[1]);
  if (token === "") return 0;
  if (token !== undefined && sameText(personCalendarKey(secret, id, token), clean)) return id;
  return sameText(personCalendarKey(secret, id), clean) ? id : 0;
}
