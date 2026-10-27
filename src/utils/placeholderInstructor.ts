/**
 * ── «هيئة تدريسية» ليست شخصاً ────────────────────────────────────────────────
 *
 * سجلٌّ اسمه هذا معنى تتشاركه الجامعة: يُكتب حين لا يكون للشعبة مدرّسٌ ثابت.
 * فلا يُقاس عليه الحجز المزدوج (القاعدة المستقرّة، commit 98cd373)، ولا يدخل
 * ميزانَ العدالة كأنه أستاذٌ يحمل عشرين شعبة. وكلمة «هيئة» لا يُسمّى بها
 * الناس، فصدرُ الاسم وحده يعرّف السجل مهما كتبت بقيته.
 *
 * القاعدة هنا وحدها؛ الخادم والواجهة ومحرّك العدالة يسألونها.
 */
export { placeholderInstructorIds as placeholderInstructorIdsOf } from "./instructorIdentity";
import { placeholderInstructorIds as placeholderInstructorIdsOf } from "./instructorIdentity";


/** A faculty placeholder is a section-scoped scheduling identity, not a person. */
export function isFacultyPlaceholder(person: { AdInstructorId?: unknown; AdInstructorName?: unknown } | null | undefined): boolean {
  return Boolean(person && placeholderInstructorIdsOf([person]).size);
}

/** Show one contextual "هيئة تدريسية"; do not rewrite IDs on historical rows. */
export function singleFacultyPlaceholder<T extends { AdInstructorId?: unknown; AdInstructorName?: unknown }>(
  people: T[], preferredIds: Iterable<number> = [],
): T[] {
  const placeholders = placeholderInstructorIdsOf(people);
  if (!placeholders.size) return people;
  const preferred = Array.from(preferredIds, Number).find(id => placeholders.has(id));
  const primary = preferred ?? Number(people.find(person => placeholders.has(Number(person.AdInstructorId)))?.AdInstructorId || 0);
  let shown = false;
  return people.filter(person => {
    if (!placeholders.has(Number(person.AdInstructorId))) return true;
    if (shown || Number(person.AdInstructorId) !== primary) return false;
    shown = true;
    return true;
  });
}

/** Preserve the internal surrogate but never present its fabricated civil ID. */
export function withoutFacultyPlaceholderCivil<T extends { AdInstructorId?: unknown; AdInstructorName?: unknown; AdInstructorCivil?: string }>(person: T): T {
  return isFacultyPlaceholder(person) ? { ...person, AdInstructorCivil: "" } : person;
}
