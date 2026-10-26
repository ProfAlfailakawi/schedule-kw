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
