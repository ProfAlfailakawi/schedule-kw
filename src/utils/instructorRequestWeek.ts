import type { FSchedule, InstructorRequest, InstructorRequestItem } from "../types";
import { slotTimeGroups } from "./slotTimeGroups";

export const requestIdentity = (item: InstructorRequestItem, index: number) =>
  item.rowId ?? item.offeringRowIds?.[0] ?? -(index + 1);

/** A schedule row has one clock range. Split different clocks before ANY engine
 * sees them; the apply path uses slotTimeGroups too. Secondary ids are stable. */
export function rowsForRequestSlots(slots: Array<{ day: string; start: string; end: string }>, base: Partial<FSchedule>, identity: number): FSchedule[] {
  return slotTimeGroups(slots).map((group, at) => ({
    ...base, id: at === 0 ? identity : -1_000_000_000 - Math.abs(identity) * 10 - at,
    ...Object.fromEntries(["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"].map(day => [day, group.days.includes(day)])),
    fstarttime: group.start, fendtime: group.end,
  } as FSchedule));
}

export function instructorWeekAfter(request: InstructorRequest, allRows: FSchedule[]): FSchedule[] {
  const mine = allRows.filter(row => Number(row.AdInstructorId) === Number(request.AdInstructorId));
  const touched = new Set(request.items.filter(item => item.rowId != null && item.action !== "keep"
    && item.decision?.state !== "rejected" && item.decision?.state !== "fixed").map(item => Number(item.rowId)));
  const claimedOfferings = new Set(request.items.filter(item => item.action !== "keep"
    && item.decision?.state !== "rejected" && item.decision?.state !== "fixed")
    .flatMap(item => item.offeringRowIds || []).map(Number));
  const result = mine.filter(row => !touched.has(Number(row.id)) && !claimedOfferings.has(Number(row.id)));
  request.items.forEach((item, index) => {
    if (item.action === "keep" || item.action === "delete" || item.decision?.state === "rejected" || item.decision?.state === "fixed") return;
    if (item.offeringRowIds?.length) {
      for (const id of item.offeringRowIds) {
        const row = allRows.find(row => Number(row.id) === id);
        /* The requested offering is already an official row. Keep its identity
         * when projecting the proposed assignment so conflict checks can
         * exclude that row from the baseline; replacing its id with the
         * request identity makes it appear twice and falsely conflicts with
         * the professor's own claimed slot. */
        if (row) result.push({ ...row, AdInstructorId: Number(request.AdInstructorId) });
      }
      return;
    }
    const original = allRows.find(row => Number(row.id) === Number(item.rowId));
    const snapshot = item.after || item.before;
    result.push(...rowsForRequestSlots(item.slots || [], {
      ...original, AdInstructorId: Number(request.AdInstructorId), AdTermId: Number(request.AdTermId),
      AdCollegeId: Number(snapshot?.collegeId || original?.AdCollegeId || request.AdCollegeId),
      AdSectionId: Number(snapshot?.sectionId || original?.AdSectionId || request.AdSectionId),
      AdCourseId: Number(snapshot?.courseId || 0), SCode: original?.SCode || snapshot?.sectionCode || "",
    }, requestIdentity(item, index)));
  });
  return result;
}
