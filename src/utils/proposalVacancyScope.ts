/**
 * ── شواغرُ «هيئة تدريسية» التي تُعرض في مقترح الأستاذ ────────────────────────
 *
 * كانت القائمة: كلُّ صفٍّ في الفصل أستاذُه «هيئة تدريسية» ويملك المستخدمُ الكتابةَ
 * في نطاقه. فمن نطاقُه واسع (مدير النظام، عميد) رأى في مقترح أستاذٍ في تكنولوجيا
 * التعليم شواغرَ «كتابة متقدمة» و«الكتابة 2» من قسم اللغة الإنجليزية — مقرراتٌ
 * لا يدرّسها القسم ولا تُسند لأستاذه.
 *
 * والصواب: شواغرُ القسم نفسه وحده — صفوفُ مواقع القسم (عائلته في كلياته) التي
 * مقررُها من كتالوج القسم التشغيلي (صحائفه الحيّة). وصفٌّ في جدول القسم لمقررٍ
 * من قسمٍ آخر (مقرر خدمة) لا يُعدّ شاغراً للقسم كذلك.
 */
import type { FSchedule } from "../types";

export interface VacancyScope {
  /** مواقعُ القسم (كلية + قسم) التي يملك المستخدمُ الكتابةَ فيها. */
  scopes: ReadonlyArray<{ collegeId: number; sectionId: number }>;
  /** مقرراتُ القسم التشغيلية في تلك المواقع. */
  courseIds: ReadonlySet<number>;
  placeholders: ReadonlySet<number>;
}

export function departmentVacancyRows<T extends Pick<FSchedule, "AdCollegeId" | "AdSectionId" | "AdCourseId" | "AdInstructorId">>(rows: readonly T[], scope: VacancyScope, limit = 1500): T[] {
  const inScope = new Set(scope.scopes.map(item => `${Number(item.collegeId)}:${Number(item.sectionId)}`));
  return rows.filter(row => scope.placeholders.has(Number(row.AdInstructorId))
    && inScope.has(`${Number(row.AdCollegeId)}:${Number(row.AdSectionId)}`)
    && scope.courseIds.has(Number(row.AdCourseId))).slice(0, limit);
}
