/**
 * ── مجموعاتُ سجلّ الأساتذة ─────────────────────────────────────────────────
 *
 * قرار المالك (2026-11-05): مدرّبو TA منفصلون عن الأساتذة، والمتفرّغ مجموعةٌ ظاهرة،
 * والمتقاعد يختفي من القائمة بعد الحفظ وتبقى بياناته كلُّها في تبويبه.
 * الترتيب مقصود: المتقاعدُ متقاعدٌ ولو كان مدرّباً، ثم المتفرّغ، ثم TA.
 */
export type RosterGroup = "faculty" | "ta" | "sabbatical" | "retired";

export const ROSTER_GROUPS: ReadonlyArray<{ id: RosterGroup; label: string }> = [
  { id: "faculty", label: "الأساتذة" },
  { id: "ta", label: "TA" },
  { id: "sabbatical", label: "المتفرّغون" },
  { id: "retired", label: "المتقاعدون" },
];

export function rosterGroupOf(person: { AdInstructorStatus?: unknown; AdInstructorCategory?: unknown }): RosterGroup {
  if (person?.AdInstructorStatus === "retired") return "retired";
  if (person?.AdInstructorStatus === "sabbatical") return "sabbatical";
  return person?.AdInstructorCategory === "ta" ? "ta" : "faculty";
}
