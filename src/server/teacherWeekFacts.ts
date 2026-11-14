/**
 * ── حقائقُ أسبوع الأستاذ لكرته: «محاضرتك القادمة» و«أسبوعي الصحي» ───────────────
 *
 * من جدوله **الرسمي** في الفصل وحده (صفوفُ الجدول التي أستاذُها هو؛ لا ما طلبه ولا المسودة)، بما يلزم الكرتَ ولا أكثر:
 * اليومُ والبدايةُ والنهايةُ واسمُ المقرر ورقمُ الشعبة وحرمُه (الجهراء/الفحيحيل/الرئيسي)، ودقائقُ التنقّل بين الحرمين من
 * سياسة التنقّل نفسها (travelRuleFor: الأزواجُ المضبوطة، والمستثنى لا تنقّلَ له) — لا دقيقةَ مخترَعة. **لا قاعةَ ولا مبنى**:
 * الحقلُ لا يُقرأ هنا أصلاً. والحسابُ كلُّه في المتصفح (src/server/teacherCardLogic.ts) ببيانات هذا الكائن.
 */
import { campusOf, type Campus } from "../utils/campusTravel";
import { TRAVEL_PAIRS, travelRuleFor, type CampusTravelPolicy } from "../utils/campusTravelPolicy";
import { calendarSpanForTerm } from "../utils/icalendar";
import type { FSchedule } from "../types";

const WEEK_DAY_KEYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;

export interface TeacherWeekMeeting { id: number; day: string; start: string; end: string; course: string; section: string; campus: Campus }
export interface TeacherWeekFacts {
  meetings: TeacherWeekMeeting[];
  /** دقائقُ كل زوجٍ بمفتاح السياسة («jahra|main») — الأزواجُ التي تلزم هذا الأستاذ فقط. */
  travel: Record<string, number>;
  term: { start: string; end: string; closed: boolean };
}

export function teacherWeekFacts(input: {
  rows: ReadonlyArray<FSchedule>;
  instructorId: number;
  collegeNameOf: (collegeId: number) => string;
  courseNameOf: (courseId: number) => string;
  policy: CampusTravelPolicy;
  term: { AdTermName?: string; AdTermStart?: string; AdTermWeeks?: number; AdTermClosed?: boolean } | null | undefined;
}): TeacherWeekFacts | null {
  const span = calendarSpanForTerm(input.term as any, 16);
  if (span.source === "none" || !span.startDate || !span.endDate) return null;
  const meetings: TeacherWeekMeeting[] = [];
  for (const row of input.rows) {
    /* صفوفُ «وضع تجربة» وحجوزُ الطلبات أرقامُها سالبة: ليست جدولاً رسمياً. */
    if (Number(row.AdInstructorId) !== Number(input.instructorId) || Number(row.id) <= 0) continue;
    const campus = campusOf(input.collegeNameOf(Number(row.AdCollegeId)));
    for (const day of WEEK_DAY_KEYS) {
      if (!(row as any)[day]) continue;
      meetings.push({
        id: Number(row.id), day, start: String(row.fstarttime || ""), end: String(row.fendtime || ""),
        course: String(row.AdCourseName || input.courseNameOf(Number(row.AdCourseId)) || ""), section: String(row.SCode || ""), campus,
      });
    }
  }
  const travel: Record<string, number> = {};
  for (const pair of TRAVEL_PAIRS) {
    const rule = travelRuleFor(input.policy, pair.a, pair.b, input.instructorId);
    if (rule) travel[pair.key] = rule.minutes;
  }
  return { meetings, travel, term: { start: span.startDate, end: span.endDate, closed: input.term?.AdTermClosed === true } };
}
