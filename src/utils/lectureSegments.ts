/**
 * مقاطع الموعد للشريط المجزَّأ: كتلٌ من محاضراتٍ بطول الساعة الأكاديمية (50 د) بينها فاصل 10 د.
 * 170 د = 50 + 10 + 50 + 10 + 50 · 110 د = 50 + 10 + 50 · ما لا يطابق ذلك مقطعٌ واحد.
 * مصدر الفاصل والمحاضرة هو لائحة الأنماط (appointmentRegulation): كتلةٌ واحدة لا تقطع إلا على هذا الإيقاع.
 */
export const LECTURE_MINUTES = 50;
export const LECTURE_GAP_MINUTES = 10;

export interface LectureSegment { kind: "lecture" | "gap" | "block"; minutes: number }

export function lectureSegments(totalMinutes: number): LectureSegment[] {
  const total = Math.round(Number(totalMinutes) || 0);
  if (total <= 0) return [];
  const unit = LECTURE_MINUTES + LECTURE_GAP_MINUTES;
  const count = (total + LECTURE_GAP_MINUTES) / unit;
  if (total > LECTURE_MINUTES && Number.isInteger(count) && count >= 2 && count <= 5) {
    const out: LectureSegment[] = [];
    for (let i = 0; i < count; i++) {
      if (i) out.push({ kind: "gap", minutes: LECTURE_GAP_MINUTES });
      out.push({ kind: "lecture", minutes: LECTURE_MINUTES });
    }
    return out;
  }
  return [{ kind: "block", minutes: total }];
}

export const segmentsLabel = (segments: LectureSegment[]) => segments.map(s => s.minutes).join(" + ");
