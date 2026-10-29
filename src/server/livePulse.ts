/**
 * ── النبضة: «هل معي أحد؟ وهل تغيّر شيء؟» ──────────────────────────────────
 *
 * A live stream is an open request, and Cloud Run bills an instance for every
 * second it holds one. One coordinator with the board open all afternoon kept
 * the server billed all afternoon — for a channel nobody else was on.
 *
 * Most of the time a coordinator IS alone on their board. Alone, there is no
 * presence to draw and nobody to race for a card; the only news is a change
 * made somewhere else, and that can wait a few seconds. So a screen asks a
 * short question instead — who else is on this board, has anything changed,
 * does the bell have news — and opens the stream only when the answer to the
 * first part is "someone". The question costs milliseconds; the stream it
 * replaces cost the whole afternoon.
 *
 * The stream itself is untouched. Two people on one board get exactly what
 * they had before: presence, rings, and every save the instant it lands.
 *
 * What lives here is the part of the answer that needs no request to test.
 */

/** A screen that stopped asking for this long has left. Three slow beats. */
export const PULSE_TTL_MS = 90_000;

export interface PulseEntry {
  userId: number;
  /** boardScopeKey, or "" for a screen that is not on a board (the bell). */
  scopeKey: string;
  /** Touched recently. A screen left on a wall is not company — see companyOn. */
  active: boolean;
  seenAt: number;
}

export interface StreamPeer {
  userId: number;
  scopeKey: string;
  seenAt: number;
}

/**
 * How many OTHER people are on this board and actually at their screens.
 *
 * People, not connections: a colleague with three tabs open is one colleague,
 * and my own second tab is nobody. A screen nobody has touched for a while is
 * not company either — it is a display, and it catches up on its own slower
 * beat; opening a stream for it would bill the whole day for a wall.
 *
 * Streams count as well as pulses, so a tab still running yesterday's build
 * (it streams unconditionally) is seen by today's tabs, and the two meet.
 */
export function companyOn(
  scopeKey: string,
  selfUserId: number,
  pulses: Iterable<PulseEntry>,
  streams: Iterable<StreamPeer>,
  now: number,
  ttlMs = PULSE_TTL_MS,
): number {
  if (!scopeKey) return 0;
  const others = new Set<number>();
  for (const pulse of pulses) {
    if (pulse.scopeKey !== scopeKey || !pulse.active || now - pulse.seenAt > ttlMs) continue;
    if (pulse.userId && pulse.userId !== selfUserId) others.add(pulse.userId);
  }
  for (const stream of streams) {
    if (stream.scopeKey !== scopeKey || now - stream.seenAt > ttlMs) continue;
    if (stream.userId && stream.userId !== selfUserId) others.add(stream.userId);
  }
  return others.size;
}

/** Forget screens that stopped asking. Called on every pulse; the map stays small. */
export function sweepPulses(pulses: Map<string, PulseEntry>, now: number, ttlMs = PULSE_TTL_MS): void {
  for (const [key, pulse] of pulses) if (now - pulse.seenAt > ttlMs) pulses.delete(key);
}

/**
 * When something last changed — for the real university, and for each demo
 * sandbox separately.
 *
 * A sandbox hears real changes as well as its own, the same rule the stream
 * follows (a real event is written to every connection, a sandbox event only
 * to that sandbox's). A screen compares the number with the last one it saw;
 * a larger one means "read again".
 *
 * It starts at the moment the process started, not at zero: a restart may
 * have lost a change made just before it, and one needless re-read is the
 * right price for never missing one.
 */
export function createChangeClock(startedAt: number) {
  let real = startedAt;
  const sandboxes = new Map<string, number>();
  return {
    bump(demoSessionId = "", at = Date.now()) {
      if (!demoSessionId) { real = Math.max(real, at); return; }
      sandboxes.set(demoSessionId, Math.max(sandboxes.get(demoSessionId) || 0, at));
      // A sandbox stamp older than the real one tells nobody anything any more,
      // and a sandbox quiet for six hours is over. Forgetting one is safe: its
      // screens keep the largest number they saw and simply wait for a new one.
      if (sandboxes.size > 256) {
        for (const [id, stamp] of sandboxes) if (stamp <= real || at - stamp > 6 * 3_600_000) sandboxes.delete(id);
      }
    },
    read(demoSessionId = ""): number {
      return demoSessionId ? Math.max(real, sandboxes.get(demoSessionId) || 0) : real;
    },
  };
}
