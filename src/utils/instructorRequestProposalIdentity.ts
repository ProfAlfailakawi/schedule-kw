import { normalizeClock } from "./scheduleTime";

/** Canonical, content-bound identity for an offer shown on the teacher card.
 * Clock padding and day order are presentation details, not proposal changes. */
export function instructorRequestProposalIdentity(itemId: string, offer: {
  day?: unknown; days?: unknown; start?: unknown; end?: unknown;
}) {
  const rawDays = Array.isArray(offer.days) && offer.days.length ? offer.days : [offer.day];
  const days = [...new Set(rawDays.map(String))].sort();
  return `${itemId}|${days.join(",")}|${normalizeClock(offer.start)}|${normalizeClock(offer.end)}`;
}
