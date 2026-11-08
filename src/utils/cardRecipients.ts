/**
 * ── من تصله بطاقةُ الأستاذ (👁️ و✏️)، وما حالُه بعد الإرسال ─────────────────────
 *
 * قرار المالك: 👁️ و✏️ («أساتذة محددون» و«الكل») لأساتذة القسم وحدهم.
 *   - المنتدبون لا يصلهم شيءٌ أبداً.
 *   - المتدرّبون ومدرّبو مرحلة التدريب لا يظهرون إلا في 🎓؛ ومن كان أستاذاً في القسم
 *     ومتدرّباً في هذا الفصل يظهر في 🎓 وحدها — فلا تصل أحداً بطاقتان.
 * الخادمُ يحكم بها في الإصدار (لا القائمةُ وحدها)، والقائمةُ تقرأ من الحكم نفسه.
 */
import type { InstructorRequest } from "../types";
import { linkMode } from "./linkMode";
import { latestRequestByInstructor } from "./requestReissue";

export type ExclusionReason = "visiting" | "trainee";

export function cardExclusions(input: {
  instructors: ReadonlyArray<{ AdInstructorId: unknown; AdInstructorCategory?: unknown }>;
  /** منتدبو عائلة القسم (readVisitingStatus لكل موقع). */
  visitingIds: Iterable<number>;
  /** طلباتُ الفصل في عائلة القسم: من طلبُه 🎓 فهو في مرحلة التدريب. */
  requests?: ReadonlyArray<Pick<InstructorRequest, "AdInstructorId" | "linkMode" | "status">>;
  /** موجاتُ مرحلة التدريب (taPhases) — من اختير فيها ولو لم تُرسل موجتُه بعد. */
  taPhaseIds?: Iterable<number>;
}): Map<number, ExclusionReason> {
  const out = new Map<number, ExclusionReason>();
  for (const id of input.visitingIds) if (Number(id) > 0) out.set(Number(id), "visiting");
  const trainee = (id: number) => { if (id > 0 && !out.has(id)) out.set(id, "trainee"); };
  for (const person of input.instructors) if (person.AdInstructorCategory === "ta") trainee(Number(person.AdInstructorId));
  for (const row of input.requests || []) if (row.status !== "superseded" && linkMode(row) === "ta") trainee(Number(row.AdInstructorId));
  for (const id of input.taPhaseIds || []) trainee(Number(id));
  return out;
}

/* ── المتابعة بعد الإرسال: ✉️ لم يفتح · 👀 فتح · ✅ ردّ ───────────────────────── */
export type FollowUpState = "sent" | "opened" | "replied";

export function followUpState(row: Pick<InstructorRequest, "status" | "submittedAt" | "linkMode"> & { linkOpenedAt?: unknown }): FollowUpState {
  if (row.submittedAt || (row.status !== "sent" && row.status !== "superseded")) return "replied";
  return row.linkOpenedAt ? "opened" : "sent";
}

/**
 * «ذكّر من لم يرد»: أحدثُ طلبٍ لكل أستاذ، بطاقةُ ✏️ (👁️ لا تنتظر رداً، و🎓 لها لوحتُها)،
 * لم يُرسَل بعد، ونافذتُه مفتوحة. والمستبعَدون (منتدبٌ، متدرّب) لا يُذكَّرون من هنا.
 */
export function reminderTargets<T extends Pick<InstructorRequest, "AdInstructorId" | "status" | "submittedAt" | "linkMode" | "createdAt">>(
  rows: readonly T[], windowOpen: (row: T) => boolean, excluded: ReadonlyMap<number, unknown> = new Map(),
): T[] {
  return [...latestRequestByInstructor(rows.filter(row => row.status !== "superseded")).values()].filter(row => linkMode(row) === "edit" && !excluded.has(Number(row.AdInstructorId))
    && followUpState(row) !== "replied" && windowOpen(row));
}
