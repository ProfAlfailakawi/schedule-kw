/**
 * Confirmation without changes is a signed acceptance of an existing LIVE
 * timetable, not approval of a draft copied from a previous semester.
 * This marker is persisted in the request timeline; it survives page reloads
 * and distinguishes automatic confirmation from ordinary department settlement.
 */
import type { InstructorRequest } from "../types";
import { dayKeysOf } from "./instructorRequestItems";

export const unchangedConfirmationKind = "unchanged-confirmed" as const;

export function isUnchangedConfirmed(request: Pick<InstructorRequest, "status" | "timeline">): boolean {
  return request.status === "settled" && (request.timeline || []).some(event => event.kind === unchangedConfirmationKind);
}

type LiveRow = {
  id: number; AdInstructorId: number; AdCourseId: number; AdCollegeId: number;
  AdSectionId: number; SCode?: string; fstarttime: string; fendtime: string;
  fsunday?: boolean; fmonday?: boolean; ftuesday?: boolean; fwednesday?: boolean; fthursday?: boolean;
};

/**
 * Server-owned decision, never trust a client-provided "unchanged" flag.
 * If a free-text note exists, it must reach the department rather than being
 * silently treated as a final confirmation.
 */
export function canConfirmUnchanged(request: InstructorRequest, liveTermRows: LiveRow[], note: string, original: InstructorRequest = request): boolean {
  if (request.source !== "draft" || request.submittedAt || String(note || "").trim()) return false;
  const items = request.items || [];
  if (!items.length || items.some(item => item.action !== "keep" || item.rowId == null || item.offeringRowIds?.length || item.decision?.state || item.thread?.length)) return false;

  const mine = liveTermRows.filter(row => Number(row.AdInstructorId) === Number(request.AdInstructorId));
  if (mine.length !== items.length) return false;
  const byId = new Map(mine.map(row => [Number(row.id), row]));
  const originalById = new Map((original.items || []).map(item => [Number(item.rowId), item]));
  if (byId.size !== items.length || originalById.size !== items.length) return false;

  return items.every(item => {
    const row = byId.get(Number(item.rowId));
    if (!row || !item.before) return false;
    const old = item.before;
    // The submission payload deliberately carries no slots for "keep".
    // Use the server-stored snapshot, never the client's empty array.
    const stored = originalById.get(Number(item.rowId));
    if (!stored || stored.action !== "keep") return false;
    const slots = stored.slots || [];
    const oldDays = slots.map(slot => String(slot.day)).sort();
    const actualDays = dayKeysOf(row).sort();
    return Number(row.AdCourseId) === Number(old.courseId)
      && (!old.collegeId || Number(row.AdCollegeId) === Number(old.collegeId))
      && (!old.sectionId || Number(row.AdSectionId) === Number(old.sectionId))
      && String(row.SCode || "") === String(old.sectionCode || "")
      && slots.length === actualDays.length && oldDays.join("|") === actualDays.join("|")
      && slots.every(slot => String(slot.start) === String(row.fstarttime) && String(slot.end) === String(row.fendtime));
  });
}
