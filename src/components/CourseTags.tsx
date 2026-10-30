import React from "react";
import { courseTagFacts, serviceDepartmentsOf, sheetFallback, usePlanBadges } from "../utils/planBadges";
import { courseTagsOf, parseCourseTagsText, type CourseTag } from "../utils/courseTags";
import { reachLocked, type CourseReach } from "../utils/courseReach";

/**
 * وسومُ المقرر الموحّدة: سطرٌ واحد من شاراتٍ صغيرة بجانب الاسم — كلُّ ما ينطبق، بالترتيب نفسه في كل شاشة
 * (الصحيفة ← نوعُ المتطلب ← «🔒 لم نصل بعد»). القاعدة في src/utils/courseTags.ts، والمصدر /api/plan-badges.
 *  • courseId / courseIds: تُقرأ الوسوم من المصدر الواحد (سجلّاتُ المقرر الواحد معاً).
 *  • text: نصٌّ جاهز من قوائم الاختيار («صحيفة 2026 · متطلب كلية») يُفكّ إلى وسومه.
 *  • reach: حكمُ الوصول — يُمرَّر في الشاشات التي تعرضه أصلاً فقط.
 *  • newSheet: «🆕 صحيفة جديدة» لمقررٍ من الصحيفة الجديدة وحدها — احتياطاً حين لا تصل شاراتُ الصحيفة (sheetFallback).
 * يلتفّ على الهاتف بهدوء، ولا يظهر منه في الطباعة إلا ما كانت تطبعه الشارةُ قبل (التقارير المطبوعة مجمّدة).
 */
export default function CourseTags({ courseId, courseIds, text, reach, newSheet = false, tags: given, printOnly = false }: {
  courseId?: unknown;
  courseIds?: readonly unknown[];
  text?: string;
  reach?: Pick<CourseReach, "state"> | null;
  newSheet?: boolean;
  tags?: readonly CourseTag[];
  /** التقرير المطبوع (ومعاينته): ما كانت تطبعه الشارة قبل فقط — تصميمُه مجمّد. */
  printOnly?: boolean;
}) {
  const badges = usePlanBadges();
  const ids = courseIds || (courseId !== undefined ? [courseId] : []);
  const tags = given || (text !== undefined
    ? parseCourseTagsText(text)
    : courseTagsOf({ ...courseTagFacts(ids, badges), newSheet: sheetFallback(badges, newSheet), reachLocked: reachLocked(reach) }));
  const shown = printOnly ? tags.filter(tag => tag.print) : tags;
  if (!shown.length) return null;
  const service = text === undefined ? ids.flatMap(id => serviceDepartmentsOf(id)) : [];
  return (
    <span className="ctags">
      {shown.map(tag => (
        <span key={tag.key} className={`ctag ${CHIP_CLASS[tag.key]}`} data-ctag={tag.key} data-print={tag.print ? undefined : "0"}
          title={tag.key === "kind" && service.length ? `${tag.label} في صحائف: ${[...new Set(service)].join("، ")}` : TITLE[tag.key]}>
          {tag.label}
        </span>
      ))}
    </span>
  );
}

/* الأصنافُ القديمة باقيةٌ على الشارة نفسها: كلُّ سياقٍ يضبط حجمها (القوائم، والبطاقات، والطباعة) يبقى يعمل. */
const CHIP_CLASS: Record<CourseTag["key"], string> = { sheet: "plan-badge", kind: "course-service-badge", reach: "ctag-reach" };
const TITLE: Record<CourseTag["key"], string> = { sheet: "صحيفة المقرر", kind: "نوع المتطلب", reach: "لم نصل بعد إلى هذا المستوى" };
