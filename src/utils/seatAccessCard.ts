import { invitationHref } from "./invitationLink";

/**
 * ── «بطاقة الدخول» في الكراسي: ما تحمله البطاقة لكل صفة ──────────────────────
 *
 *  عضو الفريق: رابطه الشخصي ‎/k/…‎ بلا كلمة مرور، ويؤكّد عند فتحه آخر أربعة أرقام.
 *  الشاغل:
 *   - اختار كلمة سرّه بنفسه: الرابط يملأ اسم الدخول وحده، والبطاقة تقول ذلك.
 *   - «ينتظر أن يختار شاغله كلمة سرّه»: يكتب المسؤول الكلمة الأولى إن كانت معه
 *     (كما في «المستخدمون»: لا تُقرأ من الخادم أبداً) فتُضمَّن في جزء # من الرابط؛
 *     وإلا حمل الرابط اسم الدخول وحده.
 */
/** أيامُ عمل الكلمة الأولى الافتراضية في بطاقة الرئيس. */
export const FIRST_PASSWORD_DAYS = 7;
/** ساعاتُ عمل الكلمة المؤقتة ورابط إعادة التعيين. */
export const TEMPORARY_PASSWORD_HOURS = 24;

export type SeatCardModel = { url: string; caption: string; message: string; note: string; fileStem: string };

const site = (origin: string) => origin.replace(/\/+$/, "");

/** «الصفة · الكرسي»، ولا تتكرر الصفة إن كان اسم الكرسي يحملها («رئيس تسجيل الكلية — …»). */
export function seatCaption(roleLabel: string | undefined, seatName: string): string {
  const role = String(roleLabel || "").trim(), seat = String(seatName || "").trim();
  if (!role) return seat;
  if (!seat || seat.includes(role)) return seat || role;
  return `${role} · ${seat}`;
}

export function memberCardModel(input: { origin: string; token: string; name: string; memberLabel?: string; teamLabel?: string; seatName: string; withTail: boolean; reset?: boolean }): SeatCardModel {
  const url = `${site(input.origin)}/k/${input.token}`;
  if (input.reset) return {
    url,
    caption: [input.memberLabel || "عضو", input.seatName].filter(Boolean).join(" · "),
    message: [
      `أهلاً ${input.name}`,
      `أُعيد تعيين دخولك إلى ${input.teamLabel || "فريق"} في SCHEDULE — ${input.seatName}.`,
      "افتح رابطك الجديد خلال 24 ساعة:",
      url,
      input.withTail ? "سيُطلب منك آخر أربعة أرقام من رقمك المدني." : "",
      "الرابط لك وحدك، فلا تشاركه.",
    ].filter(Boolean).join("\n"),
    note: "الرابط يعمل 24 ساعة إن لم يُفتح، وبعد أول دخول يبقى رابطه الشخصي. أُبطل الرابط السابق وخرج من كل جهاز.",
    fileStem: "SCHEDULE-member",
  };
  return {
    url,
    caption: [input.memberLabel || "عضو", input.seatName].filter(Boolean).join(" · "),
    message: [
      `أهلاً ${input.name}`,
      `أُضفتَ إلى ${input.teamLabel || "فريق"} في SCHEDULE — ${input.seatName}.`,
      "ادخل من رابطك الشخصي:",
      url,
      input.withTail ? "سيُطلب منك آخر أربعة أرقام من رقمك المدني." : "",
      "الرابط لك وحدك، فلا تشاركه.",
    ].filter(Boolean).join("\n"),
    note: input.withTail
      ? "لا كلمة مرور في هذه البطاقة: الرابط شخصيّ له وحده، ويؤكّد عند فتحه آخر أربعة أرقام من رقمه المدني."
      : "لا كلمة مرور في هذه البطاقة: الرابط شخصيّ له وحده، فلا يُشارَك.",
    fileStem: "SCHEDULE-member",
  };
}

/** بطاقةُ إعادة التعيين لرئيس الفريق: الكلمةُ في جزء # وحده، فلا تصل الخادم في طلب الصفحة. */
export function temporaryPasswordCardModel(input: { origin: string; login: string; password: string; seatName: string; roleLabel: string; holderName: string }): SeatCardModel {
  const url = invitationHref(`${site(input.origin)}/`, input.login, input.password);
  return {
    url,
    caption: seatCaption(input.roleLabel, input.seatName),
    message: [
      `أهلاً ${input.holderName}`,
      `أُعيد تعيين كلمة سرّ فريق «${input.seatName}» في SCHEDULE.`,
      "ادخل من هذا الرابط خلال 24 ساعة، واختر كلمة سرّك الجديدة عند الدخول:",
      url,
      `اسم الدخول: ${input.login}`,
    ].join("\n"),
    note: "تعمل 24 ساعة ولدخولٍ واحد. لا يظهر منها شيء بعد إغلاق البطاقة، ولا تكشف الكلمة السابقة.",
    fileStem: "SCHEDULE-reset",
  };
}

export function holderCardModel(input: {
  origin: string; login: string; seatName: string; roleLabel: string; holderName: string;
  /** «ينتظر أن يختار شاغله كلمة سرّه». */
  mustChangePassword: boolean;
  /** ما كتبه المسؤول من الكلمة الأولى؛ يُهمَل إن كان الشاغل قد اختار كلمته. */
  password?: string;
  /** انتهت الكلمة الأولى: لا تعمل البطاقة حتى يُعاد إصدارها. */
  expired?: boolean;
}): SeatCardModel {
  const password = input.mustChangePassword ? String(input.password || "").trim() : "";
  const url = password
    ? invitationHref(`${site(input.origin)}/`, input.login, password)
    : `${site(input.origin)}/i/${encodeURIComponent(input.login)}`;
  const how = !input.mustChangePassword
    ? "ادخل من هذا الرابط، ثم اكتب كلمة سرّك التي اخترتها:"
    : password
      ? "ادخل من هذا الرابط، واختر كلمة سرّك الخاصة عند أول دخول:"
      : "ادخل من هذا الرابط بالكلمة الأولى التي تصلك، واختر كلمة سرّك الخاصة عند أول دخول:";
  return {
    url,
    caption: seatCaption(input.roleLabel, input.seatName),
    message: [`أهلاً ${input.holderName}`, `بطاقة دخولك إلى فريق «${input.seatName}» في SCHEDULE.`, how, url, `اسم الدخول: ${input.login}`].join("\n"),
    note: input.expired && !password
      ? "انتهت الكلمة الأولى، فلن يدخل بها. أعد إصدارها ثم أرسل البطاقة."
      : !input.mustChangePassword
      ? `اختار ${input.holderName} كلمة سرّه بنفسه، فلا تحملها البطاقة: الرابط يملأ اسم الدخول، ويكتب هو كلمته.`
      : password
        ? "الكلمة الأولى في الرابط وتعمل سبعة أيام، ويختار كلمته الخاصة عند أول دخول."
        : "ينتظر أن يختار كلمة سرّه. اكتب الكلمة الأولى التي ظهرت عند التسليم لتُضمَّن في الرابط، أو أرسل البطاقة باسم الدخول وحده وأبلغه الكلمة بنفسك.",
    fileStem: "SCHEDULE-seat",
  };
}
