import { useEffect, useState } from "react";

/**
 * Is anyone looking at this tab?
 *
 * A live stream (EventSource) is an open request, and Cloud Run bills CPU for
 * every second a request is open — a tab forgotten in the background overnight
 * kept the server billing all night. Streams follow this flag instead: the tab
 * stays "awake" for a grace minute after it is hidden (switching windows for a
 * moment must not drop the board), then sleeps; it wakes the instant it is
 * shown again, and whoever reopens the stream re-reads once to catch up.
 *
 * A tab can also be in plain sight with nobody in front of it — a screen left
 * on in an office, a development tab open all night. Shown is not the same as
 * watched, so the tab also sleeps after `idleMs` without a key, pointer, wheel
 * or touch, and the first one wakes it.
 */
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

/**
 * The same signals in three states rather than two, for whoever needs to tell
 * a forgotten window from a closed one (utils/livePulse.ts):
 *
 *  - `awake`  — shown and touched recently, or hidden for less than the grace;
 *  - `drowsy` — shown, but nobody has touched it for `idleMs`: a wall display,
 *               a window left open on a second screen;
 *  - `asleep` — hidden for longer than the grace, or born hidden.
 *
 * The listener is called once with the current state, then on every change.
 */
export type Attention = "awake" | "drowsy" | "asleep";

export function watchAttention(
  listener: (attention: Attention) => void,
  graceMs = 60_000,
  idleMs = 10 * 60_000,
): () => void {
  if (typeof document === "undefined") { listener("awake"); return () => undefined; }
  let state: Attention | null = null;
  let hiddenTimer = 0;
  let idleTimer = 0;
  let lastActivity = 0;
  const set = (next: Attention) => {
    if (next === state) return;
    state = next;
    listener(next);
  };
  const armIdle = () => {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => set("drowsy"), idleMs);
  };
  const update = () => {
    window.clearTimeout(hiddenTimer);
    if (!document.hidden) { set("awake"); armIdle(); return; }
    window.clearTimeout(idleTimer);
    // Opened in a background tab: nothing has been seen yet, so there is no
    // grace to give.
    if (state === null) { set("asleep"); return; }
    hiddenTimer = window.setTimeout(() => set("asleep"), graceMs);
  };
  // A mouse move fires dozens of times a second; re-arming once a second is plenty.
  const onActivity = () => {
    const now = Date.now();
    if (now - lastActivity < 1000 || document.hidden) return;
    lastActivity = now;
    set("awake");
    armIdle();
  };
  update();
  document.addEventListener("visibilitychange", update);
  for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true });
  return () => {
    window.clearTimeout(hiddenTimer);
    window.clearTimeout(idleTimer);
    document.removeEventListener("visibilitychange", update);
    for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
  };
}

export function usePageAwake(graceMs = 60_000, idleMs = 10 * 60_000): boolean {
  const [awake, setAwake] = useState(() => typeof document === "undefined" || !document.hidden);
  useEffect(
    () => watchAttention(attention => setAwake(attention === "awake"), graceMs, idleMs),
    [graceMs, idleMs],
  );
  return awake;
}
