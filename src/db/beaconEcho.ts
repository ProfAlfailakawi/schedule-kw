/**
 * ── «هذه كتابتي أنا» ────────────────────────────────────────────────────────
 *
 * Every instance writes the change beacon (_meta/schedulesChanged), and every
 * instance listens to it — so each write came straight back to the instance
 * that made it. That instance then dropped the cache it had just refilled and
 * told every open screen to read everything again: each edit was read twice,
 * by everyone looking at a board.
 *
 * The beacon now counts writes per writer as well as in total. The difference
 * between the two counts is exactly how many writes somebody ELSE made since
 * the last snapshot — and it stays exact when Firestore folds several writes
 * into one snapshot, which is precisely when a simple "who wrote last" field
 * would swallow another instance's change.
 */
export interface BeaconCount {
  /** The beacon's total write counter. */
  serial: number;
  /** How many of those writes were this process's own. */
  mine: number;
}

/**
 * Writes since `previous` that this process did not make.
 *
 * Any surprise reads as news, never as silence: a counter that went backwards
 * (the document was recreated, or a writers map was pruned) is treated as a
 * foreign write. One needless refresh is cheap; a missed change is not.
 */
export function foreignWrites(previous: BeaconCount, next: BeaconCount): number {
  if (next.serial < previous.serial || next.mine < previous.mine) return 1;
  return Math.max(0, (next.serial - previous.serial) - (next.mine - previous.mine));
}
