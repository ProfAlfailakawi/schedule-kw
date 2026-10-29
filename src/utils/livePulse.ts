import { watchAttention, type Attention } from "./pageAwake";

/**
 * ── النبضة، من جهة المتصفح ─────────────────────────────────────────────────
 *
 * One short question per tab, shared by every screen in it that wants to know
 * whether the board changed, whether the bell has news, or whether anyone else
 * is on the board this tab is showing. The server side, and the reason the
 * question replaced a stream that stayed open all day, is in
 * src/server/livePulse.ts.
 *
 * How often it asks follows the person, not the page (pageAwake.ts):
 *
 *  - awake  — every 15 seconds;
 *  - drowsy — every minute: a board left on a wall still catches up, it just
 *             no longer counts as somebody at the keyboard;
 *  - asleep — not at all. The first look back asks at once, and anything that
 *             changed in the meantime arrives as one signal.
 *
 * Signals compare times the server keeps, never a count of events, so a
 * missed answer is not a missed change: the next answer still carries it.
 */
export interface LiveScope { collegeId: number; sectionId: number; termId: number }
export type LiveSignal = "schedules" | "notify";
/** The server's times for both kinds of news, as of the answer that signalled. */
export interface LiveStamps { changedAt: number; notifiedAt: number }
export interface LiveState {
  /** Other people on this tab's board, at their screens. 0 with no board. */
  company: number;
  /** The last question was answered. */
  connected: boolean;
}

const AWAKE_EVERY_MS = 15_000;
const DROWSY_EVERY_MS = 60_000;

const connId =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `p${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

let scope: LiveScope | null = null;
let attention: Attention = "asleep";
let stopWatching: (() => void) | null = null;
let timer = 0;
let scopeTimer = 0;
let inFlight = false;
let askAgain = false;
/** The server said this account has no business with the live channel. */
let refused = false;
let known: LiveStamps | null = null;
let state: LiveState = { company: 0, connected: false };

const signalListeners = new Set<{ kinds: LiveSignal[]; fn: (stamps: LiveStamps) => void }>();
const stateListeners = new Set<(next: LiveState) => void>();

const sameScope = (a: LiveScope | null, b: LiveScope | null) =>
  a === b || Boolean(a && b && a.collegeId === b.collegeId && a.sectionId === b.sectionId && a.termId === b.termId);

function publish(next: LiveState) {
  if (next.company === state.company && next.connected === state.connected) return;
  state = next;
  for (const listener of [...stateListeners]) listener(state);
}

async function ask(): Promise<void> {
  if (refused || attention === "asleep" || typeof fetch === "undefined") return;
  // One question at a time; a change of board while one is out asks again
  // the moment it returns, instead of waiting a whole beat.
  if (inFlight) { askAgain = true; return; }
  inFlight = true;
  const askedFor = scope;
  try {
    const query = new URLSearchParams({ conn: connId, active: attention === "awake" ? "1" : "0" });
    if (askedFor) {
      query.set("college", String(askedFor.collegeId));
      query.set("section", String(askedFor.sectionId));
      query.set("term", String(askedFor.termId));
    }
    const response = await fetch(`/api/schedules/pulse?${query}`, { credentials: "include", cache: "no-store" });
    // No permission is a fact about the account, not a hiccup: stop asking.
    // The screens keep their own slower reads, exactly as before.
    if (response.status === 403) { refused = true; publish({ company: 0, connected: false }); return; }
    if (!response.ok) { publish({ ...state, connected: false }); return; }
    const data = await response.json();
    const next = { changedAt: Number(data?.changedAt) || 0, notifiedAt: Number(data?.notifiedAt) || 0 };
    const fired = new Set<LiveSignal>();
    if (known) {
      if (next.changedAt > known.changedAt) fired.add("schedules");
      if (next.notifiedAt > known.notifiedAt) fired.add("notify");
      // The largest time seen, not the latest answer: during a release two
      // copies of the server answer in turn, and a smaller number from the
      // older one must not make the newer one's news look new again.
      known = { changedAt: Math.max(known.changedAt, next.changedAt), notifiedAt: Math.max(known.notifiedAt, next.notifiedAt) };
    } else {
      // The first answer is where this tab starts counting; its screens have
      // just read everything anyway.
      known = next;
    }
    // An answer about a board this tab has since left says nothing about the
    // new one; the question already queued for the new board will.
    const company = sameScope(askedFor, scope) ? Math.max(0, Number(data?.company) || 0) : state.company;
    publish({ company, connected: true });
    if (fired.size && known) {
      const stamps = { ...known };
      for (const listener of [...signalListeners]) {
        if (listener.kinds.some(kind => fired.has(kind))) {
          try { listener.fn(stamps); } catch { /* one screen's trouble is not another's */ }
        }
      }
    }
  } catch {
    // Offline, or the server restarting. The next beat asks again, and the
    // times it answers with still carry whatever happened meanwhile.
    publish({ ...state, connected: false });
  } finally {
    inFlight = false;
    if (askAgain) { askAgain = false; void ask(); }
  }
}

function listening() { return signalListeners.size + stateListeners.size > 0; }

function plan() {
  window.clearTimeout(timer);
  if (!listening() || refused || attention === "asleep") return;
  timer = window.setTimeout(beat, attention === "awake" ? AWAKE_EVERY_MS : DROWSY_EVERY_MS);
}

async function beat() {
  await ask();
  plan();
}

/* A closed tab stops counting as company now rather than in ninety seconds.
   sendBeacon is the one request that survives the page going away. */
function leave() {
  if (refused || typeof navigator === "undefined" || !navigator.sendBeacon) return;
  try { navigator.sendBeacon(`/api/schedules/pulse?conn=${encodeURIComponent(connId)}`); } catch { /* best effort */ }
}

function start() {
  if (stopWatching || typeof window === "undefined") return;
  attention = "asleep";
  stopWatching = watchAttention(next => {
    const previous = attention;
    attention = next;
    if (next === "asleep") { window.clearTimeout(timer); return; }
    // Waking up, or dozing off: either way the server should hear it now —
    // a person who just came back is company again from this moment.
    if (next !== previous) void beat();
  });
  window.addEventListener("pagehide", leave);
}

function stopIfUnused() {
  if (listening() || !stopWatching) return;
  stopWatching();
  stopWatching = null;
  window.clearTimeout(timer);
  window.clearTimeout(scopeTimer);
  window.removeEventListener("pagehide", leave);
  leave();
  // Nobody is left to tell. Whoever subscribes next reads everything on
  // arrival, so the count starts again from the first answer after that.
  known = null;
  state = { company: 0, connected: false };
}

/**
 * Called when the board changed or the bell has news — whichever `kinds` are
 * asked for — at most once per answer. Returns the unsubscribe.
 */
export function onLiveSignal(kinds: LiveSignal[], fn: (stamps: LiveStamps) => void): () => void {
  const listener = { kinds, fn };
  signalListeners.add(listener);
  start();
  return () => { signalListeners.delete(listener); stopIfUnused(); };
}

/** Company and connection, now and on every change. Returns the unsubscribe. */
export function onLiveState(fn: (next: LiveState) => void): () => void {
  stateListeners.add(fn);
  fn(state);
  start();
  return () => { stateListeners.delete(fn); stopIfUnused(); };
}

/**
 * The board this tab is showing, or null when it shows none. Moving between
 * boards is announced at once; several moves in one render are one question.
 */
export function setLiveScope(next: LiveScope | null): void {
  if (sameScope(scope, next)) return;
  scope = next ? { ...next } : null;
  if (typeof window === "undefined") return;
  window.clearTimeout(scopeTimer);
  scopeTimer = window.setTimeout(() => { if (listening()) void beat(); }, 50);
}
