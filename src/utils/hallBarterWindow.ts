import type { FSchedule } from "../types";
import { normalizeClock, clockRangesOverlap } from "./scheduleTime";
import { rowOccupiesRoom } from "./locationRegistry";

export type HallBarterWindow = {
  status?: string;
  requesterCollegeId?: number | string;
  requesterSectionId?: number | string;
  ownerCollegeId?: number | string;
  ownerSectionId?: number | string;
  revokedApprovedWindow?: boolean;
  day?: string;
  startTime?: string;
  endTime?: string;
  roomId?: string;
  roomCode?: string;
  roomHall?: string;
};
/** Kept as a source-compatible name for approval-specific call sites. */
export type ApprovedHallWindow = HallBarterWindow;

/** Preserve revoked approvals in the transaction snapshot: a cancelled lease
 * must remain distinguishable from a room that was never borrowed. */
export function hallBarterWindows(rows: HallBarterWindow[]): HallBarterWindow[] {
  return rows.map(row => ({ ...row }));
}

const minutes = (value: unknown) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
};

export function approvedBarterReservation(
  windows: HallBarterWindow[], day: string, start: string, end: string,
  collegeId: number, sectionId: number,
) {
  const startAt = minutes(start), endAt = minutes(end);
  return windows.find(window => window.status === "approved"
    && String(window.day) === day
    && (Number(window.requesterCollegeId) !== collegeId || Number(window.requesterSectionId) !== sectionId)
    && minutes(window.startTime) < endAt && startAt < minutes(window.endTime));
}

export function borrowerOutsideApprovedWindow(
  windows: HallBarterWindow[], day: string, start: string, end: string,
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
export function approvedBarterWindowMatchesSchedule(row: Partial<FSchedule>, window: HallBarterWindow) {
  return rowOccupiesRoom(row, window.roomId, window.roomCode, window.roomHall);
}

/** The final write-time guard shared by every official schedule mutation.
 * Primary and companion rooms are checked separately. A borrower must have an
 * active approval for every room/day, while the revocation tombstone prevents
 * an in-flight write from reusing a lease that was cancelled after preflight. */
export function scheduleViolatesApprovedBarterWindow(row: Partial<FSchedule>, windows: HallBarterWindow[]) {
  const start = normalizeClock(row.fstarttime);
  const end = normalizeClock(row.fendtime);
  const days = (["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const)
    .filter(day => Boolean(row[day]));
  if (!start || !end || !days.length) return false;
  const collegeId = Number(row.AdCollegeId || 0);
  const sectionId = Number(row.AdSectionId || 0);
  const rooms: Partial<FSchedule>[] = [
    { roomId: row.roomId, AdRoomCode: row.AdRoomCode, AdRoomHall: row.AdRoomHall },
    ...(row.companionRoomId ? [{ roomId: row.companionRoomId }] : []),
  ].filter(room => Boolean(room.roomId || room.AdRoomCode && room.AdRoomHall));
  return rooms.some(room => {
    const related = windows.filter(window => approvedBarterWindowMatchesSchedule(room, window));
    if (!related.length) return false;
    const ownApproved = related.filter(window => window.status === "approved"
      && Number(window.requesterCollegeId) === collegeId && Number(window.requesterSectionId) === sectionId);
    const ownRevoked = related.filter(window => window.status === "cancelled" && window.revokedApprovedWindow
      && Number(window.requesterCollegeId) === collegeId && Number(window.requesterSectionId) === sectionId
      && (Number(window.ownerCollegeId) !== collegeId || Number(window.ownerSectionId) !== sectionId));
    return days.some(day => {
      if (approvedBarterReservation(related, day, start, end, collegeId, sectionId)) return true;
      if (ownApproved.length && borrowerOutsideApprovedWindow(ownApproved, day, start, end, collegeId, sectionId)) return true;
      const revokedNow = ownRevoked.some(window => String(window.day) === day
        && clockRangesOverlap(start, end, window.startTime, window.endTime));
      if (!revokedNow) return false;
      /* A new approval for this same physical room/scope can deliberately
       * restore the right; an old approval cannot authorize a different room
       * or day merely because it belongs to the same schedule row. */
      return !ownApproved.some(window => String(window.day) === day
        && minutes(window.startTime) <= minutes(start) && minutes(window.endTime) >= minutes(end));
    });
  });
}

/** Does an already-booked official row occupy a proposed barter window? */
export function scheduleOccupiesApprovedBarterWindow(row: Partial<FSchedule>, window: HallBarterWindow) {
  return window.status === "approved" && approvedBarterWindowMatchesSchedule(row, window)
    && Boolean(row[window.day as keyof FSchedule])
    && clockRangesOverlap(row.fstarttime, row.fendtime, window.startTime, window.endTime);
}
