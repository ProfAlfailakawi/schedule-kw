import { AR, countOf } from "./arabicCount";

/**
 * حصيلةُ شريط «مراجعة الاعتماد» المطويّ في «تغييرات الجدول»، بقاعدة عنوان المراجعة نفسها (I2):
 * الموانعُ المادّية وحدها «تمنع»، وبنودُ اللائحة التي تحتاج معالجة «للمعالجة»، وما بقي ملاحظات.
 */
export function changesReviewHeadline(report: {
  reviewBlockers?: unknown[];
  blockingConflicts?: number;
  regulationNotices?: Array<{ approvalEffect: string }>;
}) {
  const material = Math.max((report.reviewBlockers || []).length, Number(report.blockingConflicts || 0));
  const needsFix = (report.regulationNotices || []).filter(item => item.approvalEffect === "block").length;
  const notes = (report.regulationNotices || []).length - needsFix;
  const tone = material ? "danger" : needsFix || notes ? "warn" : "good";
  const label = material ? countOf(material, AR.approvalBlocker)
    : needsFix ? `${countOf(needsFix, AR.item)} للمعالجة`
      : notes ? countOf(notes, AR.note) : "لا ملاحظات";
  return { material, needsFix, notes, tone, label };
}
