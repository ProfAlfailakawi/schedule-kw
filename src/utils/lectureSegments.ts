/**
 * مقاطع الموعد للشريط المجزَّأ: كتلٌ من محاضراتٍ بطول الساعة الأكاديمية (50 د) بينها فاصل 10 د.
 * 170 د = 50 + 10 + 50 + 10 + 50 · 110 د = 50 + 10 + 50 · ما لا يطابق ذلك مقطعٌ واحد.
 * مصدر الفاصل والمحاضرة هو لائحة الأنماط (appointmentRegulation): كتلةٌ واحدة لا تقطع إلا على هذا الإيقاع.
 */
import { SHORT_DAY_GAP_MINUTES, SHORT_LECTURE_MINUTES } from "./scheduleRegulations";

/** تُقرأ من اللائحة (scheduleRegulations) لا أرقاماً مكرّرة هنا؛ تُمرَّر بدائل للاختبار أو للائحة معدَّلة. */
export const LECTURE_MINUTES = SHORT_LECTURE_MINUTES;
export const LECTURE_GAP_MINUTES = SHORT_DAY_GAP_MINUTES;

export interface LectureSegment { kind: "lecture" | "gap" | "block"; minutes: number }

export function lectureSegments(totalMinutes: number, rule: { lecture?: number; gap?: number } = {}): LectureSegment[] {
  const total = Math.round(Number(totalMinutes) || 0);
  if (total <= 0) return [];
  const lecture = rule.lecture ?? LECTURE_MINUTES, gap = rule.gap ?? LECTURE_GAP_MINUTES;
  const unit = lecture + gap;
  const count = (total + gap) / unit;
  if (total > lecture && Number.isInteger(count) && count >= 2 && count <= 5) {
    const out: LectureSegment[] = [];
    for (let i = 0; i < count; i++) {
      if (i) out.push({ kind: "gap", minutes: gap });
      out.push({ kind: "lecture", minutes: lecture });
    }
    return out;
  }
  return [{ kind: "block", minutes: total }];
}

export const segmentsLabel = (segments: LectureSegment[]) => segments.map(s => s.minutes).join(" + ");
