/**
 * The Authority PDF is an audit of the *first import*, not a catalogue of
 * today's section numbers. Its original rows must stay in source-PDF order,
 * even if a class was moved, renumbered, or recreated with a new sourceOrder.
 *
 * When several campuses are printed as one book, preserve their existing
 * site sequence, and place ALL true additions after ALL source rows.
 * Sorting current.sourceOrder was wrong: it could move old CRNs alongside
 * newly generated courses, and it could reorder edited source appointments.
 */
export function orderAuthorityReportRows<T extends {
  source?: { sourceOrder?: unknown } | null;
  siteLabel?: string;
}>(rows: readonly T[]): T[] {
  const siteRanks = new Map<string, number>();
  const rankOf = (row: T): number => {
    const key = String(row.siteLabel ?? "");
    if (!siteRanks.has(key)) siteRanks.set(key, siteRanks.size);
    return siteRanks.get(key)!;
  };
  const withPositions = rows.map((row, index) => ({
    row, index, site: rankOf(row),
    imported: Boolean(row.source),
    originalOrder: (() => {
      const raw = row.source?.sourceOrder;
      if (raw === null || raw === undefined || raw === "") return Number.MAX_SAFE_INTEGER;
      const value = Number(raw);
      return Number.isFinite(value) && value >= 0 && value < 1_000_000
        ? value : Number.MAX_SAFE_INTEGER;
    })(),
  }));
  return withPositions.sort((a, b) =>
    Number(b.imported) - Number(a.imported) ||
    a.site - b.site ||
    (a.imported && b.imported ? a.originalOrder - b.originalOrder : 0) ||
    a.index - b.index
  ).map(item => item.row);
}
