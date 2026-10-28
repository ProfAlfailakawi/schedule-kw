/**
 * ── «لم يشاركوا» (D1/D2) ─────────────────────────────────────────────────────
 *
 * من أُرسل له رابطُ طلبٍ ولم يرسل شيئاً بعد — فتحه أو لم يفتحه. ورابطٌ أُرسل
 * «للعرض فقط» لا يطلب منه شيئاً، فلا يُعدّ صاحبُه «لم يشارك».
 *
 * نوعُ الرابط يُقرأ من `linkMode` على الطلب (تضبطه أداةُ النشر: view / edit / ta).
 * غيابُه = «طلب تعديل» كما كانت كلُّ الروابط قبل وجوده.
 */
import type { InstructorRequest } from "../types";

export type RequestLinkMode = NonNullable<InstructorRequest["linkMode"]>;

export const requestLinkMode = (row: Pick<InstructorRequest, "linkMode">): RequestLinkMode =>
  row.linkMode === "view" || row.linkMode === "ta" ? row.linkMode : "edit";

export function notParticipated<T extends Pick<InstructorRequest, "status" | "submittedAt" | "linkMode">>(rows: readonly T[]): T[] {
  return rows.filter(row => row.status === "sent" && !row.submittedAt && requestLinkMode(row) !== "view");
}
