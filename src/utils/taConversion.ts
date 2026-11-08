import type { AdInstructor } from "../types";

/** TA is an explicit classification on the professor; never infer it from a course number. */
export function isTrainingAssistant(person: Pick<AdInstructor, "AdInstructorCategory"> | null | undefined): boolean {
  return person?.AdInstructorCategory === "ta";
}

export interface TaAppointment {
  id: number;
  AdInstructorId: number;
  AdCourseId: number;
  SCode?: string;
  rev?: number;
}
export interface TaPersonSummary {
  id: number;
  name: string;
  appointments: number;
  sections: number;
}

export function planTaConversion<R extends TaAppointment>(
  rows: readonly R[],
  people: readonly Pick<AdInstructor, "AdInstructorId" | "AdInstructorName" | "AdInstructorCategory">[],
): { affected: R[]; people: TaPersonSummary[]; sections: number } {
  const tagged = new Map(people.filter(isTrainingAssistant).map(person => [Number(person.AdInstructorId), person]));
  const affected = rows.filter(row => tagged.has(Number(row.AdInstructorId)));
  const byPerson = new Map<number, { name: string; count: number; sections: Set<string> }>();
  const sectionKeys = new Set<string>();
  for (const row of affected) {
    const id = Number(row.AdInstructorId);
    const key = String(row.AdCourseId) + ":" + (String(row.SCode || "").trim() || "appointment-" + Number(row.id));
    sectionKeys.add(key);
    const current = byPerson.get(id) || { name: tagged.get(id)?.AdInstructorName || "", count: 0, sections: new Set<string>() };
    current.count++;
    current.sections.add(key);
    byPerson.set(id, current);
  }
  return {
    affected,
    people: [...byPerson].map(([id, entry]) => ({
      id, name: entry.name, appointments: entry.count, sections: entry.sections.size,
    })).sort((a, b) => a.name.localeCompare(b.name, "ar")),
    sections: sectionKeys.size,
  };
}

/**
 * ── إلى مَن يُحوَّل كلُّ اسم TA ──
 * الافتراضيُّ «هيئة تدريسية» (0 أو سجلّها). والاختيارُ لا يكون إلا من عائلة القسم:
 * من تعرضهم قائمة أستاذ المقرر نفسها («أساتذة هذا القسم فقط» و«منتدبون هذا الفصل»).
 */
export type TaTargets = Record<string, number>;

/** يقرأ الاختيارات من جسم الطلب أو من «12:45,13:0»؛ ما ليس رقماً صحيحاً يُهمَل. */
export function readTaTargets(raw: unknown): TaTargets {
  const out: TaTargets = {};
  const put = (key: unknown, value: unknown) => {
    const from = Number(key), to = Number(value);
    if (Number.isInteger(from) && from > 0 && Number.isInteger(to) && to >= 0) out[String(from)] = to;
  };
  if (typeof raw === "string") {
    for (const pair of raw.split(",")) { const [key, value] = pair.split(":"); put(key, value); }
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) put(key, value);
  }
  return out;
}

/** الاختياراتُ الفعلية: لا «هيئة تدريسية» ولا اسمٌ مكان نفسه. */
export function chosenTaTargets(targets: TaTargets, placeholderIds: ReadonlySet<number> = new Set()): Map<number, number> {
  const out = new Map<number, number>();
  for (const [key, value] of Object.entries(targets)) {
    const from = Number(key), to = Number(value);
    if (to > 0 && to !== from && !placeholderIds.has(to)) out.set(from, to);
  }
  return out;
}

/** سببُ الرفض بالعربية، أو null: كل مفتاحٍ اسمُ TA في المعاينة، وكل هدفٍ من عائلة القسم. */
export function taTargetsProblem(
  chosen: ReadonlyMap<number, number>,
  taIds: ReadonlySet<number>,
  familyIds: ReadonlySet<number>,
  nameOf: (id: number) => string = () => "",
): string | null {
  for (const [from, to] of chosen) {
    if (!taIds.has(from)) return "أحد الأسماء المختارة ليس من هيئة التدريب في هذا الفصل؛ افتح المعاينة من جديد.";
    if (!familyIds.has(to)) {
      const name = nameOf(to);
      return (name ? "«" + name + "»" : "الأستاذ المختار") + " ليس من أساتذة هذا القسم ولا من منتدبيه هذا الفصل.";
    }
  }
  return null;
}

/** صفوفُ التحويل بأهدافها: المختارُ لأصحابه، و«هيئة تدريسية» لمن سواهم. */
export function taConversionMoves<R extends TaAppointment>(affected: readonly R[], chosen: ReadonlyMap<number, number>, placeholderId: number): Array<{ row: R; to: number }> {
  return affected.map(row => ({ row, to: chosen.get(Number(row.AdInstructorId)) || placeholderId }));
}

/** «12:45,13:0» — اختيارُ كل اسم TA للمعاينة؛ 0 («هيئة تدريسية») لا يُرسل. */
export function taTargetsQuery(targets: Record<number, number>): string {
  return Object.entries(targets).filter(([, to]) => Number(to) > 0).map(([from, to]) => from + ":" + to).join(",");
}
