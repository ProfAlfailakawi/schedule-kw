/** Only the currently edited official appointment may be ignored by availability and weekly-hours advice. */
export function eligibleSuggestionEditId(
  rows: readonly { id?: unknown; AdCollegeId?: unknown; AdSectionId?: unknown; AdTermId?: unknown }[],
  requestedId: unknown,
  collegeId: number,
  sectionId: number,
  termId: number,
): number {
  const id = Number(requestedId);
  if (!Number.isSafeInteger(id) || id <= 0) return 0;
  return rows.some(row => Number(row.id) === id
    && Number(row.AdCollegeId) === collegeId
    && Number(row.AdSectionId) === sectionId
    && Number(row.AdTermId) === termId) ? id : 0;
}
