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

/** رابطُ الطلب يُستبدل حين لا يبلغ الموعدَ الجديد: موقوفٌ، أو لا يُقرأ، أو تنتهي صلاحيتُه قبله. */
export function requestLinkNeedsReplacing(
  link: { revoked?: boolean; expiresAt?: string } | null | undefined,
  readable: boolean,
  mustLiveUntil: number,
): boolean {
  if (!link || link.revoked || !readable) return true;
  const expires = Date.parse(String(link.expiresAt || ""));
  return Number.isFinite(expires) && expires < mustLiveUntil;
}
