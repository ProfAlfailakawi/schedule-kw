/**
 * Reconcile the immutable timetable PDF with its published schedule rows.
 *
 * A printed reference number is strong evidence, but it is not an immutable
 * database row ID. Some older imports have a different (or inaccurately read)
 * reference number in the saved live row. Without a guarded fallback, each
 * such class is reported as both deleted and newly added.
 *
 * Every fallback is one-to-one, uses only demonstrably imported rows, and
 * refuses ambiguous matches. Manually created appointments are never
 * reconciled into a PDF row, even when their section number is identical.
 */
type SourceRow = Record<string, any>;

const ref = (value: unknown) =>
  String(value ?? "").replace(/[\s\u200e\u200f\u202a-\u202e]/g, "").trim();

const section = (value: unknown) => {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits || raw.toUpperCase();
};

const clock = (value: unknown) => {
  const raw = String(value ?? "").trim();
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (match) return `${match[1].padStart(2, "0")}:${match[2]}`;
  const digits = raw.replace(/\D/g, "");
  return /^\d{3,4}$/.test(digits)
    ? `${digits.slice(0, -2).padStart(2, "0")}:${digits.slice(-2)}`
    : "";
};

const days = (row: SourceRow) =>
  ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"]
    .map(field => {
      const value = row[field];
      return value === true || value === 1 || ["1", "true", "yes", "y"].includes(String(value ?? "").trim().toLowerCase()) ? "1" : "0";
    }).join("");

const place = (value: unknown) => String(value ?? "").replace(/\s+/g, "").toUpperCase();

const slot = (row: SourceRow) => {
  const start = clock(row.fstarttime), end = clock(row.fendtime);
  const building = place(row.AdRoomCode), room = place(row.AdRoomHall);
  const weekdays = days(row);
  if (!start || !end || !building || !room || weekdays === "00000") return "";
  return [weekdays, start, end, building, room].join("|");
};

const imported = (row: SourceRow) => {
  const order = row.sourceOrder;
  if (order !== undefined && order !== null && Number.isFinite(Number(order)) && Number(order) >= 1_000_000) return false;
  return Boolean(
    ref(row.referenceNumber) || row.sourceCourseCode || row.sourceCourseText ||
    row.sourceSectionText || row.importEvidence
  );
};

export function matchAuthoritySourceRows(
  baseline: readonly SourceRow[],
  current: readonly SourceRow[],
  courseCodeById?: Map<number, string>,
): Map<number, number> {
  const pairs = new Map<number, number>();
  const consumed = new Set<number>();
  const candidateIndices = current.map((row, index) => imported(row) ? index : -1).filter(index => index >= 0);

  const course = (row: SourceRow) => {
    const code = String(
      courseCodeById?.get(Number(row.AdCourseId || 0)) ||
      row.CourseCodeSnapshot || row.sourceCourseCode || ""
    ).replace(/[^a-zA-Z0-9]/g, "").replace(/^0+(?=\d)/, "").toUpperCase();
    if (code) return `code:${code}`;
    const id = Number(row.AdCourseId || 0);
    return id > 0 ? `id:${id}` : "";
  };

  const compatibleCourse = (source: SourceRow, row: SourceRow) => {
    const a = course(source), b = course(row);
    if (!a || !b) return true;
    if (a.startsWith("code:") && b.startsWith("code:")) return a === b;
    if (a.startsWith("id:") && b.startsWith("id:")) return a === b;
    return true; // A legacy record may lack the catalogue's course code.
  };

  // Match only keys with exactly one remaining source and one remaining live row.
  // This is deliberately not a greedy "closest row" algorithm.
  const stage = (
    keyOf: (row: SourceRow) => string,
    valid: (source: SourceRow, row: SourceRow) => boolean = compatibleCourse,
  ) => {
    const sourceKeys = new Map<string, number[]>();
    const liveKeys = new Map<string, number[]>();
    baseline.forEach((row, index) => {
      if (pairs.has(index)) return;
      const key = keyOf(row);
      if (key) sourceKeys.set(key, [...(sourceKeys.get(key) || []), index]);
    });
    for (const index of candidateIndices) {
      if (consumed.has(index)) continue;
      const key = keyOf(current[index]);
      if (key) liveKeys.set(key, [...(liveKeys.get(key) || []), index]);
    }
    for (const [key, sources] of sourceKeys) {
      const matches = liveKeys.get(key) || [];
      if (sources.length !== 1 || matches.length !== 1) continue;
      const sourceIndex = sources[0], liveIndex = matches[0];
      if (!valid(baseline[sourceIndex], current[liveIndex])) continue;
      pairs.set(sourceIndex, liveIndex);
      consumed.add(liveIndex);
    }
  };

  // Preserve exact Authority references first, regardless of the source row
  // order. Prevent a secondary match from stealing a later exact CRN.
  stage(row => ref(row.referenceNumber) ? `ref:${ref(row.referenceNumber)}` : "");

  // Renumbered/reimported references still describe the same class if the
  // canonical course and section uniquely agree in the selected site.
  stage(row => {
    const code = course(row), sectionCode = section(row.SCode);
    return code && sectionCode ? `class:${code}|${sectionCode}` : "";
  });

  // Legacy imports sometimes reassign sequential 501/502/... section labels.
  // An identical, unique course + day + time + room is stronger evidence than
  // that derived number. A genuinely moved class has already been matched by
  // its stable course + section above.
  stage(row => {
    const code = course(row), meeting = slot(row);
    return code && meeting ? `meeting:${code}|${meeting}` : "";
  });

  // Historical rows with an absent CRN may have only their original import
  // position left. Never use this to override two *different* nonempty CRNs.
  stage(row => {
    const order = Number(row.sourceOrder);
    return Number.isFinite(order) && order >= 0 && order < 1_000_000
      ? `order:${order}` : "";
  }, (source, row) =>
    compatibleCourse(source, row) &&
    (!ref(source.referenceNumber) || !ref(row.referenceNumber))
  );

  return pairs;
}
