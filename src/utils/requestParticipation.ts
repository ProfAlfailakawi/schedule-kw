/**
 * ── «لم يشاركوا» و«لم يفتحوا» و«🎓 تدريب» (D1/D2/F3) ─────────────────────────
 *
 * من أُرسل له رابطُ طلبٍ ولم يرسل شيئاً بعد — فتحه أو لم يفتحه. ورابطٌ أُرسل
 * «للعرض فقط» لا يطلب منه شيئاً، فلا يُعدّ صاحبُه «لم يشارك» ولا «لم يفتح» ولا
 * «فتح ولم يُجب».
 *
 * نوعُ الرابط مصدرُه واحد: `InstructorRequest.linkMode`، يُقرأ بـ`linkMode()` من
 * src/utils/linkMode.ts (يكتبه النشر: view / edit / ta). غيابُه = «طلب تعديل».
 * فلا يقرأ الحقلَ هنا ولا في الوارد ولا في الخادم أحدٌ غيرُها.
 */
import type { InstructorRequest } from "../types";
import { linkMode, type LinkMode } from "./linkMode";

export type RequestLinkMode = LinkMode;

/** الاسمُ الذي سبق به #269 — هو linkMode() نفسُها، لا قراءةٌ ثانية. */
export const requestLinkMode = (row: Pick<InstructorRequest, "linkMode">): RequestLinkMode => linkMode(row);

/** صاحبُ الرابط يُنتظر منه جواب: كلُّ صفةٍ إلا «للعرض فقط». */
export const awaitsAnswer = (row: Pick<InstructorRequest, "linkMode">): boolean => linkMode(row) !== "view";

/** «لم يشاركوا» (D1): لم يرسلوا شيئاً — فتحوا أو لم يفتحوا. */
export function notParticipated<T extends Pick<InstructorRequest, "status" | "submittedAt" | "linkMode">>(rows: readonly T[]): T[] {
  return rows.filter(row => row.status === "sent" && !row.submittedAt && awaitsAnswer(row));
}

/** «لم يفتحوا»: لم يُفتح الرابط بعد، ورابطُ العرض فقط لا ينتظر فتحاً. */
export function notOpened<T extends Pick<InstructorRequest, "linkMode"> & { linkOpenedAt?: unknown }>(rows: readonly T[]): T[] {
  return rows.filter(row => !row.linkOpenedAt && awaitsAnswer(row));
}

/** «فتحوا ولم يجيبوا»: نصفُ «لم يشاركوا» الذي فتح الرابط. */
export function openedNotAnswered<T extends Pick<InstructorRequest, "status" | "linkMode"> & { linkOpenedAt?: unknown }>(rows: readonly T[]): T[] {
  return rows.filter(row => row.status === "sent" && Boolean(row.linkOpenedAt) && awaitsAnswer(row));
}

/** «🎓 تدريب» (F3): طلباتُ مرحلة التدريب وحدها. */
export const isTaRequest = (row: Pick<InstructorRequest, "linkMode">): boolean => linkMode(row) === "ta";
