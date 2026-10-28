/**
 * ── من يرى «لوحة القرار»، وأيّ نطاق (K5) ─────────────────────────────────────
 *
 * Read-only, and never wider than what the reader already holds:
 *   departmentHead → the department chosen in the shared scope (one).
 *   dean / viceDean → every department of the chosen college the reader's
 *                    scope covers.
 *   power admin    → every department of the chosen college.
 * Everybody else does not see the lens at all. The server still answers each
 * request by its own scope check; this only decides what is asked for.
 */
export type DecisionBoardReader = { roleId?: string; isPowerAdmin: boolean; scopes: Array<{ collegeId?: number; sectionId?: number; AdCollegeId?: number; AdSectionId?: number }> };

export const DECISION_BOARD_ROLES = ["departmentHead", "dean", "viceDean"] as const;

export function canSeeDecisionBoard(reader: Pick<DecisionBoardReader, "roleId" | "isPowerAdmin">): boolean {
  return reader.isPowerAdmin || (DECISION_BOARD_ROLES as readonly string[]).includes(String(reader.roleId || ""));
}

export type DecisionBoardScope =
  | { kind: "none"; reason: string }
  | { kind: "department" | "college"; label: string; sectionIds: number[] };

export function decisionBoardScope(reader: DecisionBoardReader, at: { collegeId: number; sectionId: number; sections: Array<{ AdSectionId: number; AdCollegeId: number }> }): DecisionBoardScope {
  if (!canSeeDecisionBoard(reader)) return { kind: "none", reason: "لوحة القرار لرئيس القسم والعميد ومن فوقهما." };
  if (!at.collegeId) return { kind: "none", reason: "اختر الكلية." };
  const inCollege = at.sections.filter(section => Number(section.AdCollegeId) === Number(at.collegeId)).map(section => Number(section.AdSectionId));
  const scoped = (sectionId: number) => reader.isPowerAdmin || reader.scopes.some(scope => {
    const college = Number(scope.collegeId ?? scope.AdCollegeId ?? 0), section = Number(scope.sectionId ?? scope.AdSectionId ?? 0);
    return college === Number(at.collegeId) && (section === 0 || section === sectionId);
  });
  if (reader.roleId === "departmentHead" && !reader.isPowerAdmin) {
    if (!at.sectionId) return { kind: "none", reason: "اختر القسم." };
    return scoped(at.sectionId) ? { kind: "department", label: "قسمك", sectionIds: [at.sectionId] } : { kind: "none", reason: "هذا القسم خارج نطاقك." };
  }
  const ids = inCollege.filter(scoped);
  return { kind: "college", label: reader.isPowerAdmin ? "كل أقسام الكلية" : "أقسام كليتك", sectionIds: ids };
}
