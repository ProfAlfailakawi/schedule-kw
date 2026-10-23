/**
 * ── البداية الدافئة ─────────────────────────────────────────────────────────
 *
 * Measured on a cold load: every chunk, the session check and the document are
 * finished at 62ms — and the board does not ask for its own data until 776ms.
 * Seven hundred milliseconds in which the network is idle and the reader is
 * looking at nothing. On a warm remount the same board asks in 25ms, so the
 * component is not slow; the gap belongs to everything that has to happen once,
 * on the first load, before a component can exist at all.
 *
 * Rather than chase that, this removes the dependency: a request does not need
 * a component. The instant the app knows which screen it is opening — before
 * React has rendered a single element — the screen's first question goes out.
 * By the time the board mounts, its answer is already arriving or arrived.
 *
 * Deliberately tiny and deliberately outside React: one promise per URL, handed
 * over exactly once, and forgotten. It caches nothing beyond that hand-off, so
 * it can never serve stale data to a second reader.
 */
const inFlight = new Map<string, Promise<unknown>>();
const startedAt = new Map<string, number>();

/**
 * How long a warm answer stays good. Before it was claimed for the first time
 * the warm answer could be minutes old by the time the reader opened the
 * screen; past this age the screen asks the network again instead of painting
 * somebody else's earlier edit as current.
 */
export const WARM_START_MAX_AGE_MS = 30_000;

function forgetIfStale(url: string): void {
  const at = startedAt.get(url);
  if (at !== undefined && Date.now() - at > WARM_START_MAX_AGE_MS) {
    inFlight.delete(url);
    startedAt.delete(url);
  }
}

/**
 * ── عنوانٌ واحد لسؤال اللوحة ───────────────────────────────────────────────
 *
 * The warm start is handed over only when the URL matches character for
 * character. The warm-up used to add `resolve=1` while the board never sent it,
 * so every warm answer missed: the board waited for its lookups, then asked for
 * the whole workspace again from scratch. Every caller builds the URL here, in
 * the same parameter order, so the warm answer and the board's own question are
 * the same string.
 */
export function scheduleWorkspaceUrl(
  scope: { collegeId?: number; sectionId?: number; termId?: number },
  resolve = false,
): string {
  const query = new URLSearchParams();
  if (scope.collegeId) query.set("collegeId", String(scope.collegeId));
  if (scope.sectionId) query.set("sectionId", String(scope.sectionId));
  if (scope.termId) query.set("termId", String(scope.termId));
  if (resolve) query.set("resolve", "1");
  return `/api/schedules/workspace?${query}`;
}

/** Fires a GET now, or returns the one already in the air for this URL. */
export function warmStart(url: string): Promise<unknown> {
  forgetIfStale(url);
  const existing = inFlight.get(url);
  if (existing) return existing;
  startedAt.set(url, Date.now());
  const promise = fetch(url, { credentials: "include" })
    .then(response => (response.ok ? response.json() : Promise.reject(response)))
    .catch(error => {
      // A failed warm start is not an error anybody should see: the component
      // will ask again for itself, through the path that knows how to report.
      if (inFlight.get(url) === promise) {
        inFlight.delete(url);
        startedAt.delete(url);
      }
      throw error;
    });
  inFlight.set(url, promise);
  return promise;
}

/**
 * Drops every pending warm answer. The workspace answer depends on who is
 * signed in (their scopes), while the shelf is keyed by URL only, so it is
 * emptied on every sign-in, sign-out and account change.
 */
export function forgetWarmStarts(): void {
  inFlight.clear();
  startedAt.clear();
}

/**
 * Takes the pending answer for this URL, if one exists, and removes it.
 *
 * Consumed once by design. A second reader of the same screen must go to the
 * network, because by then the first reader may have changed something.
 */
export function claimWarmStart<T>(url: string): Promise<T> | null {
  forgetIfStale(url);
  const promise = inFlight.get(url) as Promise<T> | undefined;
  if (!promise) return null;
  inFlight.delete(url);
  startedAt.delete(url);
  return promise;
}
