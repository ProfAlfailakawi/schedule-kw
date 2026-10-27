/** An instructor's first actual submission can precede a later re-submission.
 * submittedAt is overwritten on re-send; the timeline keeps the earlier send. */
export type InstructorMovementRequest = {
  submittedAt?: string | null;
  timeline?: ReadonlyArray<{ kind: string; at: string }> | null;
};

/** First submitted request in this term, across all instructor requests. */
export function firstInstructorEditAt(requests: ReadonlyArray<InstructorMovementRequest>): number | null {
  const submitted = requests.flatMap(request => {
    const sentEvents = (request.timeline || [])
      .filter(event => event.kind === "submitted")
      .map(event => Date.parse(String(event.at || "")))
      .filter(Number.isFinite);
    // For legacy requests without a timeline, fall back to the saved submission.
    return sentEvents.length ? sentEvents : [Date.parse(String(request.submittedAt || ""))];
  }).filter(Number.isFinite);
  return submitted.length ? Math.min(...submitted) : null;
}

/** Never expose official schedule movement from before the first submission. */
export function movementAfterInstructorEdit<T extends { at: string }>(
  entries: ReadonlyArray<T>,
  requests: ReadonlyArray<InstructorMovementRequest>,
): T[] {
  const startAt = firstInstructorEditAt(requests);
  if (startAt === null) return [];
  return entries.filter(entry => {
    const at = Date.parse(String(entry.at || ""));
    return Number.isFinite(at) && at >= startAt;
  });
}
