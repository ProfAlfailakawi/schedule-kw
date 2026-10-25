/**
 * Comparison guard for the original Authority timetable.
 *
 * The report is a NET difference from the imported document, not a log of edits.
 * Saving an edited row can resolve a room to its verified registry ID or store
 * a clock in a different harmless notation. Reverting to the same real room or
 * minute must clear the "changed" flag without rewriting the PDF baseline.
 *
 * This is deliberately narrow: course/instructor matching and genuinely
 * different rooms, weekdays and times remain the report engine's responsibility.
 */
type TimetableRow = Record<string, unknown>;

const stableId = (value: unknown): string => String(value ?? "").trim();

function clockMinute(value: unknown): number | null {
  const raw = String(value ?? "").normalize("NFKC")
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/\s+/g, "");
  const delimited = /^(\d{1,2})[:.](\d{2})(?:[:.]00)?$/.exec(raw);
  const compact = /^(\d{1,2})(\d{2})$/.exec(raw);
  const parts = delimited || compact;
  if (!parts) return null;
  const hour = Number(parts[1]), minute = Number(parts[2]);
  return hour < 24 && minute < 60 ? hour * 60 + minute : null;
}

function dayFlag(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  if (value === 1 || value === 0) return value === 1;
  const text = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "y", "yes"].includes(text)) return true;
  if (["0", "false", "n", "no", ""].includes(text)) return false;
  return null;
}

/**
 * Return true ONLY when the source and current value are provably the same.
 * Otherwise let buildAuthorityPdfDiff's existing field comparison run normally.
 */
export function authorityFieldMatchesOriginal(
  field: string, source: TimetableRow, current: TimetableRow,
): boolean {
  if (field === "AdRoomCode") {
    const before = stableId(source.buildingId);
    const after = stableId(current.buildingId);
    return Boolean(before && after && before === after);
  }
  if (field === "AdRoomHall") {
    const before = stableId(source.roomId);
    const after = stableId(current.roomId);
    if (!before || !after || before !== after) return false;
    const originalBuilding = stableId(source.buildingId);
    const currentBuilding = stableId(current.buildingId);
    return !originalBuilding || !currentBuilding || originalBuilding === currentBuilding;
  }
  if (field === "fstarttime" || field === "fendtime") {
    const before = clockMinute(source[field]);
    const after = clockMinute(current[field]);
    return before !== null && after !== null && before === after;
  }
  if (["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"].includes(field)) {
    const before = dayFlag(source[field]);
    const after = dayFlag(current[field]);
    return before !== null && after !== null && before === after;
  }
  return false;
}
