/**
 * Consecutive cells of one appointment in the rooms × times grid.
 *
 * A lecture longer than the hour column occupies several adjacent cells of its
 * room line. The text is printed once, in the earliest cell it appears in; the
 * cells after it are its continuation. «Same appointment» means the same row
 * id, so one course in two sections, or two different lectures back to back,
 * never merge. A free cell between two cells breaks the run, and the first
 * column that is rendered always prints the text.
 */
export type RunRow = { id: number | string };

/** For each cell (earliest first), the ids of its rows that continue the previous cell. */
export function continuationIds(cells: ReadonlyArray<{ rows: ReadonlyArray<RunRow> }>): Array<Set<string>> {
  return cells.map((cell, index) => {
    const before = index > 0 ? new Set(cells[index - 1].rows.map(row => String(row.id))) : null;
    return new Set(before ? cell.rows.map(row => String(row.id)).filter(id => before.has(id)) : []);
  });
}
