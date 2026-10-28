/**
 * ── أزرار الاشتراك الثلاثة ────────────────────────────────────────────────────
 *
 * رابطٌ واحدٌ ثابت (https) تُشتقّ منه الأزرار كلّها:
 *  - Apple (آيفون/ماك): ‎webcal://‎ — يفتح «اشتراك» في تطبيق التقويم مباشرة.
 *  - Google: صفحة الإضافة الرسمية ‎calendar.google.com/calendar/r?cid=webcal://…‎
 *    (جوجل يقبل webcal في cid ويجلبه بنفسه عبر https).
 *  - Outlook: ‎outlook.live.com/calendar/0/addfromweb?url=…‎ (حساب شخصي) و
 *    ‎outlook.office.com/…‎ (حساب الجامعة).
 * لا نسخة تُنزَّل: الاشتراك يتحدّث من نفسه عند كل تغيير.
 */
export interface CalendarSubscribeLinks { https: string; apple: string; google: string; outlook: string; office: string }

export function calendarSubscribeLinks(httpsUrl: string, name = ""): CalendarSubscribeLinks {
  const https = String(httpsUrl || "").replace(/^webcal:\/\//i, "https://");
  const webcal = https.replace(/^https?:\/\//i, "webcal://");
  const named = name ? `&name=${encodeURIComponent(name)}` : "";
  return {
    https,
    apple: webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(https)}${named}`,
    office: `https://outlook.office.com/calendar/0/addfromweb?url=${encodeURIComponent(https)}${named}`,
  };
}

/** The same derivation as a browser-side string, for the server-rendered pages (/s, /r, /m). */
export const CALENDAR_LINKS_CLIENT_JS = `function calLinks(https,name){var w=String(https).replace(/^https?:\\/\\//i,"webcal://"),n=name?"&name="+encodeURIComponent(name):"";return{https:https,apple:w,google:"https://calendar.google.com/calendar/r?cid="+encodeURIComponent(w),outlook:"https://outlook.live.com/calendar/0/addfromweb?url="+encodeURIComponent(https)+n,office:"https://outlook.office.com/calendar/0/addfromweb?url="+encodeURIComponent(https)+n}}`;
