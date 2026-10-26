export type ApprovedHallWindow = {
  status?: string;
  requesterCollegeId?: number | string;
  requesterSectionId?: number | string;
  day?: string;
  startTime?: string;
  endTime?: string;
};

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
