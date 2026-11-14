/**
 * ── قراءة الساعة المكتوبة: قاعدةٌ واحدة لكل الشاشات ───────────────────────────────
 *
 * يقرؤها حقل الوقت (TimeField)، وصندوق «متى نلتقي؟» (MeetingSlots)، وسطر الموعد الواحد
 * (oneLineAppointment) — فلا تختلف شاشةٌ عن أخرى في «7» أو «145» أو «14:5».
 *
 * القواعد:
 *  - الأرقام العربية والهندية تُقرأ لاتينية، والفاصل «:» أو «.» أو «٫».
 *  - بلا فاصل: خانةٌ أو خانتان = ساعةٌ كاملة («9» ← 09:00، «14» ← 14:00)؛ ثلاثٌ = H MM («930» ← 09:30،
 *    «145» ← 1:45)؛ أربعٌ = HH MM.
 *  - بفاصل: يُقرأ ما قبله ساعةً وما بعده دقائق. خانةُ دقائقٍ واحدة بعد الفاصل («14:5») مرفوضةٌ مع رسالة:
 *    قد تعني 14:05 أو 14:50 ولا نخمّن. الدقائقُ الفارغة («14:») = 00.
 *  - الساعاتُ 1–7 المكتوبةُ بلا صفرٍ بادئ ولا «ص/م» هي عصر (13:00–19:00)؛ 8–12 كما كُتبت؛ 13–23 كما كُتبت.
 *    الصفرُ البادئ الصريح («07:30»، «0730») يبقى صباحاً كما كُتب.
 *  - لا تُنتج ساعةً غير التي كُتبت أبداً: ما لا يصحّ يعود بسببه.
 */

export type ClockTypedError = "" | "empty" | "format" | "minute-digit" | "invalid";
export interface TypedClock { clock: string; error: ClockTypedError; hour: number; minute: number; explicitZero: boolean }

export const AFTERNOON_FIRST_HOUR = 1;
export const AFTERNOON_LAST_HOUR = 7;

/** الأرقام العربية/الهندية → لاتينية، والفواصل → «:»، وما سوى ذلك يسقط. */
export function latinClockText(raw: string): string {
  return String(raw ?? "")
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[:.٫]/g, ":")
    .replace(/[^0-9:]/g, "");
}

/** القاعدة (ج): ساعةٌ 1–7 بلا صفرٍ صريح ولا فترة = عصر. */
export function afternoonHour(hour: number, explicitZero = false): number {
  return !explicitZero && hour >= AFTERNOON_FIRST_HOUR && hour <= AFTERNOON_LAST_HOUR ? hour + 12 : hour;
}

const pad2 = (value: number) => String(value).padStart(2, "0");

/** تقرأ نصاً مكتوباً ساعةً «HH:MM». لا تفحص نافذة الدوام (ذلك للمستدعي). */
export function parseTypedClock(raw: string): TypedClock {
  const out = (error: ClockTypedError, hour = 0, minute = 0, explicitZero = false): TypedClock =>
    ({ clock: "", error, hour, minute, explicitZero });
  const text = latinClockText(raw);
  if (!text.replace(/:/g, "")) return out("empty");
  let hourText = "", minuteText = "";
  if (text.includes(":")) {
    const match = text.match(/^(\d{1,2}):(\d{0,2})$/);
    if (!match) return out("format");
    hourText = match[1];
    minuteText = match[2];
    if (minuteText.length === 1) return out("minute-digit");
    if (!minuteText) minuteText = "00";
  } else if (text.length <= 2) { hourText = text; minuteText = "00"; }
  else if (text.length === 3) { hourText = text.slice(0, 1); minuteText = text.slice(1); }
  else if (text.length === 4) { hourText = text.slice(0, 2); minuteText = text.slice(2); }
  else return out("format");
  const hour = Number(hourText), minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) return out("invalid", hour, minute);
  const explicitZero = hourText.length === 2 && hourText.startsWith("0");
  const resolved = afternoonHour(hour, explicitZero);
  return { clock: `${pad2(resolved)}:${pad2(minute)}`, error: "", hour: resolved, minute, explicitZero };
}

/** تقرأ ساعةً مع فترةٍ منطوقة: «ص» تُبقي الصباح (12 ص = 00)، «م» تضيف 12 لما دون 12. */
export function clockWithPeriod(hour: number, minute: number, period: "am" | "pm" | ""): string {
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  let h = hour;
  if (period === "pm") { if (h < 12) h += 12; }
  else if (period === "am") { if (h === 12) h = 0; }
  else h = afternoonHour(h);
  return `${pad2(h)}:${pad2(minute)}`;
}

/** رسالةٌ قصيرةٌ لسبب الرفض. */
export function clockErrorText(error: ClockTypedError | "min" | "max", boundary = ""): string {
  switch (error) {
    case "minute-digit": return "اكتب الدقائق بخانتين، مثل 14:05 أو 14:50";
    case "invalid": return "ساعةٌ غير صحيحة، مثل 14:30";
    case "format": return "اكتب الوقت مثل 9:30 أو 14";
    case "min": return `قبل بداية الدوام ${boundary}`.trim();
    case "max": return `بعد نهاية الدوام ${boundary}`.trim();
    default: return "";
  }
}
