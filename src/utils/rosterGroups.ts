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

/**
 * من يدخل سجلّ «الأساتذة»: هيئةُ القسم ومن درّس فيه، بلا منتدبيه.
 * قرار المالك (2026-11-06): المنتدب لا يظهر هنا ولو درّس في القسم في أي فصل، إلا إن كان
 * في هيئة القسم أيضاً. ويبقى المتقاعد وTA ظاهرَين في تبويبيهما ولو بقيا في دليل المنتدبين.
 */
export function rosterMemberIds(input: {
  faculty: Iterable<unknown>; taught: Iterable<unknown>; delegates: Iterable<unknown>;
  people: Iterable<{ AdInstructorId?: unknown; AdInstructorStatus?: unknown; AdInstructorCategory?: unknown }>;
}): Set<number> {
  const faculty = new Set([...input.faculty].map(Number).filter(Boolean));
  const delegates = new Set([...input.delegates].map(Number).filter(Boolean));
  const kept = new Set([...input.people].filter(person => person.AdInstructorStatus === "retired" || person.AdInstructorCategory === "ta").map(person => Number(person.AdInstructorId)));
  const members = new Set(faculty);
  for (const value of input.taught) {
    const id = Number(value);
    if (id && (!delegates.has(id) || kept.has(id))) members.add(id);
  }
  return members;
}
