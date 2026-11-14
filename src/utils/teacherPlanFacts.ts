/**
 * ── إنفوجرافيك التخطيط في كرت الأستاذ (ملاحظة المالك: «من أيقونة التخطيط بدون مساري») ──
 *
 * لكل مقرّرٍ في كرت الأستاذ: الشعبُ التي قرّرها القسم في «تخطيط الشعب» (المختار)، والشعبُ القائمة في جدول الفصل،
 * والطلبةُ المتوقَّعون من كشف المتبقي الذي رفعه القسم. أرقامٌ مجمَّعة وحدها: لا اسمَ طالبٍ ولا رقمَه، ولا شيء
 * من رغبات «مساري» أو الاستبيان. ومقرّرٌ لا تخطيطَ له لا يُرسل عنه شيء.
 * نقيّةٌ: يقرأ المسارُ المصادرَ ويمرّرها إليها، ويقرؤها الاختبار.
 */

export interface TeacherPlanFact {
  /** الشعبُ المخطَّطة (المختار) إن قرّرها القسم. */
  planned?: number;
  /** الشعبُ القائمة في جدول الفصل. */
  existing: number;
  /** الطلبةُ المتوقَّعون (المتبقي من كشف التسجيل) إن رُفع. */
  students?: number;
}

export interface TeacherPlanScopeReading {
  /** AdCourseId → المختار */
  accepted: Record<string, number>;
  /** AdCourseId → المتبقي (عمود «لم يجتز» وحده) */
  remaining: Record<string, number>;
  /** AdCourseId → رموزُ الشعب القائمة */
  sections: Map<number, Set<string>>;
}

const count = (value: unknown): number | undefined => {
  const n = Number(value);
  return value !== undefined && value !== null && value !== "" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
};

/** `${collegeId}:${sectionId}:${courseId}` → الحقائق، لمقرّرات الكرت وحدها. */
export function teacherPlanFacts(
  courses: ReadonlyArray<{ collegeId: number; sectionId: number; courseId: number }>,
  readings: ReadonlyMap<string, TeacherPlanScopeReading>,
): Record<string, TeacherPlanFact> {
  const out: Record<string, TeacherPlanFact> = {};
  for (const course of courses) {
    if (!course.courseId || !course.collegeId || !course.sectionId) continue;
    const reading = readings.get(`${course.collegeId}:${course.sectionId}`);
    if (!reading) continue;
    const planned = count(reading.accepted[String(course.courseId)]);
    const students = count(reading.remaining[String(course.courseId)]);
    if (planned === undefined && !students) continue;
    out[`${course.collegeId}:${course.sectionId}:${course.courseId}`] = {
      ...(planned !== undefined ? { planned } : {}),
      existing: reading.sections.get(Number(course.courseId))?.size || 0,
      ...(students ? { students } : {}),
    };
  }
  return out;
}
