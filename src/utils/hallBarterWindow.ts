import type { FSchedule } from "../types";
import { normalizeClock, clockRangesOverlap } from "./scheduleTime";
import { rowOccupiesRoom } from "./locationRegistry";

export type ApprovedHallWindow = {
  status?: string;
  requesterCollegeId?: number | string;
  requesterSectionId?: number | string;
  day?: string;
  startTime?: string;
  endTime?: string;
  roomId?: string;
  roomCode?: string;
  roomHall?: string;
};

export function approvedHallWindows(rows: Array<{
  status?: string; requesterCollegeId?: number | string; requesterSectionId?: number | string;
  day?: string; startTime?: string; endTime?: string; roomId?: string; roomCode?: string; roomHall?: string;
}>): ApprovedHallWindow[] {
  return rows.filter(row => row.status === "approved").map(row => ({ ...row }));
}

const minutes = (value: unknown) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
};

export function approvedBarterReservation(
  windows: ApprovedHallWindow[], day: string, start: string, end: string,
  collegeId: number, sectionId: number,
) {
  const startAt = minutes(start), endAt = minutes(end);
  return windows.find(window => window.status === "approved"
    && String(window.day) === day
    && (Number(window.requesterCollegeId) !== collegeId || Number(window.requesterSectionId) !== sectionId)
    && minutes(window.startTime) < endAt && startAt < minutes(window.endTime));
}

export function borrowerOutsideApprovedWindow(
  windows: ApprovedHallWindow[], day: string, start: string, end: string,
  collegeId: number, sectionId: number,
) {
  const mine = windows.filter(window => window.status === "approved"
    && Number(window.requesterCollegeId) === collegeId && Number(window.requesterSectionId) === sectionId);
  if (!mine.length) return false;
  const startAt = minutes(start), endAt = minutes(end);
  return !mine.some(window => String(window.day) === day
    && startAt >= minutes(window.startTime) && endAt <= minutes(window.endTime));
}

/** A barter request and a schedule row may identify the same physical room in
 * different ways: registry id, legacy building/hall text, or a companion room.
 * Keep this comparison on the registry's room-identity rule. */
export function approvedBarterWindowMatchesSchedule(row: Partial<FSchedule>, window: ApprovedHallWindow) {
  return window.status === "approved" && rowOccupiesRoom(row, window.roomId, window.roomCode, window.roomHall);
}

/** The final write-time guard shared by every official schedule mutation.
 * Owners cannot place a class over a borrowed window; a borrower who has an
 * approved window for this room must keep every recurring meeting inside one
 * of their own approved day/time windows. */
export function scheduleViolatesApprovedBarterWindow(row: Partial<FSchedule>, windows: ApprovedHallWindow[]) {
  const related = windows.filter(window => approvedBarterWindowMatchesSchedule(row, window));
  if (!related.length) return false;
  const start = normalizeClock(row.fstarttime);
  const end = normalizeClock(row.fendtime);
  const days = (["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const)
    .filter(day => Boolean(row[day]));
  if (!start || !end || !days.length) return false;
  const collegeId = Number(row.AdCollegeId || 0);
  const sectionId = Number(row.AdSectionId || 0);
  const own = related.filter(window => Number(window.requesterCollegeId) === collegeId
    && Number(window.requesterSectionId) === sectionId);
  return days.some(day => {
    if (approvedBarterReservation(related, day, start, end, collegeId, sectionId)) return true;
    return own.length > 0 && borrowerOutsideApprovedWindow(related, day, start, end, collegeId, sectionId);
  });
}

/** Does an already-booked official row occupy a proposed barter window? */
export function scheduleOccupiesApprovedBarterWindow(row: Partial<FSchedule>, window: ApprovedHallWindow) {
  return approvedBarterWindowMatchesSchedule(row, window)
    && Boolean(row[window.day as keyof FSchedule])
    && clockRangesOverlap(row.fstarttime, row.fendtime, window.startTime, window.endTime);
}
