/**
 * ── كرت الأستاذ: «في الوقت نفسه» بالأسماء وحدها (المالك 2026-11-08) ─────────────
 *
 * حين يتداخل وقتٌ اختاره الأستاذ مع شعبةٍ من قرينٍ لمقرره في صحيفة القسم («تفتح» أو «تُؤخذ معًا»)
 * يُقال له ذلك بسطرٍ قصير، وعند الفتح أسماءُ المقررات وعلاقتُها فقط.
 *
 * المحرّكُ هو محرّكُ ورقة القسم نفسه (sameSlotOf في src/utils/sameSlot.ts) بالقسم والفصل والكلية،
 * والعلاقاتُ من الصحيفة (src/utils/planPeers.ts). لا تكرارَ لمنطقهما هنا: يُختار من نتيجته ما يخصّ الأستاذ.
 *   • الأقرانُ وحدهم: ما وافق الوقتَ بلا علاقة لا يُقال للأستاذ، وشعبُ مقرره لها تنبيهُها في الحكم.
 *   • تداخلٌ في يومٍ مشترك؛ التلاصقُ ليس تداخلاً، و«القرب» لا يُعدّ.
 *   • محاضراتُه هو يحكمها تعارضُ الأستاذ، فلا تدخل.
 *   • لا يخرج منه أستاذٌ ولا رقمُ شعبة ولا وقتُ غيره ولا قاعة ولا معرّف: اسمُ المقرر وعلاقتُه.
 * لا يمنع الإرسال أبداً. ملفٌّ خالص؛ يُختبر في tests/teacher-card-peers-audit.ts.
 */
import { sameSlotOf, type SlotDay, type SlotRow } from "./sameSlot";
import type { UnlockLink } from "./planPeers";

export type TeacherPeerRelation = "unlock" | "level";

export interface TeacherPeerNote {
  /** «تفتح» إن وُجدت، وإلا «تُؤخذ معًا». */
  relation: TeacherPeerRelation;
  /** السطرُ القصير بجانب الوقت. */
  line: string;
  /** أسماءُ المقررات وحدها، «تفتح» أولاً. */
  courses: Array<{ name: string; relation: TeacherPeerRelation }>;
}

/** أقصى ما يُسرد من الأسماء: القائمةُ هادئة. */
export const TEACHER_PEER_MAX = 4;

export function teacherPeerLine(relation: TeacherPeerRelation, count: number): string {
  const many = count > 1;
  return relation === "unlock"
    ? `يتداخل مع ${many ? "مقررات تفتح" : "مقرر يفتح"} معه مقرراً تالياً`
    : `يتداخل مع ${many ? "مقررات تُؤخذ" : "مقرر يُؤخذ"} معه`;
}

export interface TeacherPeerQuery {
  slots: ReadonlyArray<{ day: string; start: string; end: string }>;
  courseId: number;
  sectionId: number;
  termId: number;
  collegeId: number;
  /** صاحبُ الكرت: محاضراتُه لا تدخل. */
  instructorId: number;
  sameLevel?: (a: number, b: number) => boolean;
  unlockOf?: (a: number, b: number) => UnlockLink | undefined;
  nameOf: (courseId: number) => string;
}

export function teacherPeerNote<R extends SlotRow & { AdInstructorId?: number }>(rows: readonly R[], query: TeacherPeerQuery): TeacherPeerNote | undefined {
  if (!query.courseId || !query.sectionId || !query.termId || !query.collegeId || (!query.sameLevel && !query.unlockOf)) return undefined;
  const others = rows.filter(row => Number(row.AdInstructorId) !== Number(query.instructorId));
  const found = new Map<number, TeacherPeerRelation>();
  for (const slot of query.slots) {
    const { items } = sameSlotOf(others, {
      days: [slot.day as SlotDay], start: slot.start, end: slot.end,
      courseId: query.courseId, sectionId: query.sectionId, termId: query.termId, collegeId: query.collegeId,
      sameLevel: query.sameLevel, unlockOf: query.unlockOf,
    });
    for (const item of items) {
      if (item.sameCourse || item.kind === "near" || !(item.unlock || item.sameLevel)) continue;
      const id = Number(item.row.AdCourseId);
      if (item.unlock) found.set(id, "unlock");
      else if (!found.has(id)) found.set(id, "level");
    }
  }
  const courses = [...found].map(([id, relation]) => ({ name: String(query.nameOf(id) || "").trim(), relation })).filter(course => course.name);
  if (!courses.length) return undefined;
  const ordered = [...courses.filter(course => course.relation === "unlock"), ...courses.filter(course => course.relation === "level")].slice(0, TEACHER_PEER_MAX);
  const relation = ordered[0].relation;
  return { relation, line: teacherPeerLine(relation, ordered.length), courses: ordered };
}
