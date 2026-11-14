/**
 * ── إعادةُ فتح الطلبات: ماذا يحدث لطلبٍ قديم؟ ────────────────────────────────
 *
 * كان الإصدارُ يكتفي بوجود أيِّ طلبٍ سابقٍ للأستاذ في الفصل والقسم: «يحمل طلبَه
 * من قبل». فطلبٌ انتهت نافذتُه، أو ثُبّت، أو أُوقف رابطُه، يبقى هو «طلبَه» إلى
 * الأبد. تقول اللوحةُ «طلبات التعديل مفتوحة من قبل»، ولا يجد الأستاذُ في بطاقته
 * تبويبَ الطلب — وكلُّ إعادةٍ تمرّ بالمسار نفسه فلا تُصلح شيئاً.
 *
 * فالطلبُ يتبع الموعدَ الجديد، ولا يُنشأ طلبٌ ثانٍ إلا حين انتهت جولةُ الأول:
 *  - لم يُرسله الأستاذ بعد  ← يأخذ الموعدَ الجديد (ورابطاً جديداً إن مات رابطُه).
 *  - أرسله وينتظر القسم     ← يبقى كما هو: القرارُ عند القسم ولا يُمسّ.
 *  - ثُبّت                  ← جولةٌ جديدة بطلبٍ جديد.
 *
 * القاعدةُ خالصةٌ بلا قاعدة بيانات، فتُختبر وحدها.
 */
import type { InstructorRequestStatus } from "../types";

export type ReissueMove = "keep" | "extend" | "fresh";

export function reissueMove(request: { status: InstructorRequestStatus } | null | undefined): ReissueMove {
  if (!request || request.status === "settled" || request.status === "superseded") return "fresh";
  if (request.status === "submitted" || request.status === "in-review") return "keep";
  return "extend";
}

/** أحدثُ طلبٍ لكل أستاذ — الأقدمُ لا يحكم على الأحدث مهما كان ترتيبُ القراءة. */
export function latestRequestByInstructor<T extends { AdInstructorId: number; createdAt: string }>(rows: readonly T[]): Map<number, T> {
  const latest = new Map<number, T>();
  for (const row of rows) {
    const id = Number(row.AdInstructorId);
    const held = latest.get(id);
    if (!held || String(row.createdAt).localeCompare(String(held.createdAt)) > 0) latest.set(id, row);
  }
  return latest;
}

/**
 * ── رابطُ الطلب لا يموت إلا بيد القسم أو بانتهاء صلاحيته هو ───────────────────
 *
 * الرابطُ يصل الأستاذَ في واتساب؛ فإعادةُ الإرسال إليه (لمجموعةٍ ثانية، أو بموعدٍ
 * جديد، أو بجولةٍ جديدة) لا تُنشئ رابطاً وتُوقف القديم. تُعيد استعمالَ الحيِّ منه:
 *  - حيٌّ ويبلغ الموعدَ الجديد  ← "keep": لا يُمسّ.
 *  - حيٌّ وتنتهي صلاحيتُه قبله  ← "extend": تُمدَّد صلاحيتُه هو، ويبقى هو.
 *  - موقوفٌ أو ميتٌ فعلاً       ← "mint": لا بديل عن رابطٍ جديد (ولا شيءَ حيٌّ يُوقف).
 */
export type RequestLinkMove = "keep" | "extend" | "mint";

export function requestLinkMove(
  link: { revoked?: boolean; expiresAt?: string } | null | undefined,
  readable: boolean,
  mustLiveUntil: number,
): RequestLinkMove {
  if (!link || link.revoked || !readable) return "mint";
  const expires = Date.parse(String(link.expiresAt || ""));
  return Number.isFinite(expires) && expires < mustLiveUntil ? "extend" : "keep";
}

/**
 * ── ماذا يصنع الإرسالُ بطلبٍ قائم؟ (جدولٌ واحدٌ يُختبر كلُّه) ────────────────────
 *
 *  fresh   طلبٌ جديد (لا طلبَ له، أو ثُبّت/استُبدل).
 *  extend  طلبُه الذي لم يُرسله يأخذ الموعدَ الجديد.
 *  reopen  طلبٌ أُرسل وينتظر القسم يُعاد فتحُه بالموعد الجديد: استثناءٌ فردي، أو ملاحظاتُ التسجيل،
 *          أو إرسالٌ صريحٌ لأساتذةَ بعينهم بطلب تعديلٍ وقد أُغلقت نافذتُه (حادثة 2026-11-11).
 *  keep    يبقى كما هو ينتظر القسم؛ تتغيّر صفتُه وحدها. والإرسالُ الجماعي لا يفتح نافذةً أُغلقت على من
 *          ينتظر قراراً — يفتحها القسمُ لأستاذٍ بعينه («افتح التعديل»).
 */
export type SendAction = "fresh" | "extend" | "reopen" | "keep";

export function sendActionFor(input: {
  held: { status: InstructorRequestStatus } | null | undefined;
  windowOpen: boolean;
  picking: boolean;
  individualOnly: boolean;
  onlyNoted: boolean;
  reopening: boolean;
  mode: "view" | "edit";
}): SendAction {
  const move = reissueMove(input.held);
  if (move === "fresh") return "fresh";
  if (move === "extend") return "extend";
  const pickedEditReopen = input.picking && !input.onlyNoted && input.mode === "edit" && !input.windowOpen;
  if (input.onlyNoted || input.individualOnly || pickedEditReopen) return "reopen";
  return input.reopening ? "fresh" : "keep";
}

/** هل يرى الأستاذُ بعد الإرسال تبويبَ «تعديل الجدول» لا العرضَ فقط؟ */
export function cardEditsAfterSend(action: SendAction, mode: "view" | "edit", windowOpenBefore: boolean): boolean {
  if (mode !== "edit") return false;
  return action === "keep" ? windowOpenBefore : true;
}
