/**
 * ── طولُ اللقاء في كرت الأستاذ: محرّكٌ واحد للخادم والصفحة ──────────────────
 *
 * كان الخادمُ يأخذ طولَ كل يومٍ من «ذاكرة القسم» (historicalLectureMinutes)،
 * والصفحةُ تعرض 50/80 ثابتة، والوارد يعرض نهايةَ أوّل يوم. فنقلُ «ح·ث·خ
 * 08:00–08:50» إلى 16:00 خُزّن 16:00–17:15 يومَي الأحد والثلاثاء وحدهما،
 * والأستاذُ يقرأ 16:00–16:50 ويوقّع عليه، ومقرّرُ الأربع ساعات على الاثنين
 * والأربعاء يُمنع «لا يغطّيها» ويُقترح عليه اليومان نفساهما (المالك 2026-10-30).
 *
 * القاعدةُ الآن واحدة، وهي قاعدةُ المحرّر الكامل (appointmentRegulation):
 *   1) الأيامُ نفسُها والوقتُ وحده تغيّر ← طولُ الموعد نفسه.
 *   2) لقاءُ يومٍ واحد يُنقل إلى يومٍ واحد ← طولُه نفسه (قد يكون لقاءً من شعبةٍ بصفّين).
 *   3) وإلا نمطُ اللائحة لساعات المقرّر إن طابق الأيام (والكتلةُ الواحدة على أيّ يوم).
 *   4) وإلا طولُ اليوم في اللائحة: 50 للأحد والثلاثاء والخميس، و80 للاثنين والأربعاء،
 *      ثم يحكم الفحصُ على المجموع (لا يغطّي، أو يتجاوز، أو خلطٌ غير معتمد).
 * ذاكرةُ القسم اقتراحٌ يُعرض («المعتاد تاريخياً»)، لا طولٌ يُكتب.
 *
 * والصفحةُ تحمل الخوارزميةَ نفسَها نصّاً (src/server/requestLengthScript.ts)، فلا تقول شيئاً
 * غيرَ ما يحسبه الخادم؛ والاختبارُ يقارن الاثنين على جدول حالات.
 */
import { DAY_KEYS, DAY_NAMES, expectedMinutesForDay, patternsForHours, type DayKey } from "./scheduleRegulations";

/** نمطٌ معتمد بدقائق كل يوم. نمطُ اليوم الواحد يصلح لأيّ يوم. */
export interface LengthPattern { days: DayKey[]; minutes: number[] }

/** الموعدُ القائم كما هو: أيامُه وطولُ لقائه. */
export interface OwnMeeting { days: DayKey[]; minutes: number }

export interface MeetingSlot { day: DayKey; start: string; end: string }

const toMinutes = (value: string) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
};
const clockOf = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

/** أنماطُ اللائحة لساعات المقرّر — من patternsForHours وحدها، بدقائق كل يوم. */
export function lengthPatternsForHours(hours: number): LengthPattern[] {
  return patternsForHours(hours).map(pattern => ({ days: [...pattern.days], minutes: [...pattern.minutesPerDay] }));
}

const sameDays = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every(day => b.includes(day));

/** دقائقُ اللقاء لكل يوم، بترتيب الأيام المعطاة. */
export function meetingMinutes(days: readonly DayKey[], patterns: readonly LengthPattern[], own?: OwnMeeting | null): number[] {
  if (!days.length) return [];
  if (own && own.minutes > 0 && own.days.length && (sameDays(days, own.days) || (days.length === 1 && own.days.length === 1)))
    return days.map(() => own.minutes);
  for (const pattern of patterns) {
    if (days.length === 1 && pattern.days.length === 1) return [pattern.minutes[0]];
    if (pattern.days.length === days.length && sameDays(days, pattern.days))
      return days.map(day => pattern.minutes[pattern.days.indexOf(day)]);
  }
  return days.map(day => expectedMinutesForDay(day));
}

/** مواعيدُ كل يوم من البداية: لا تُقصّ عند نهاية اليوم الدراسي — الفحصُ هو الذي يقول «تتجاوز». */
export function meetingSlots(days: readonly DayKey[], start: string, patterns: readonly LengthPattern[], own?: OwnMeeting | null): MeetingSlot[] {
  const from = toMinutes(start);
  if (!days.length || !Number.isFinite(from)) return [];
  const minutes = meetingMinutes(days, patterns, own);
  return days.map((day, index) => ({ day, start: clockOf(from), end: clockOf(from + minutes[index]) }));
}

/** الموعدُ القائم من لقطته المكتوبة في البند: «الأحد · الثلاثاء» و«11:00 – 12:15». */
export function ownMeetingOf(before: { days?: string; time?: string } | null | undefined): OwnMeeting | null {
  const clocks = String(before?.time || "").match(/\d{1,2}:\d{2}/g) || [];
  const names = String(before?.days || "").split("·").map(part => part.trim()).filter(Boolean);
  const days = names.map(name => DAY_KEYS[DAY_NAMES.indexOf(name)]).filter(Boolean) as DayKey[];
  const minutes = clocks.length >= 2 ? toMinutes(clocks[1]) - toMinutes(clocks[0]) : NaN;
  return days.length && days.length === names.length && Number.isFinite(minutes) && minutes > 0 ? { days, minutes } : null;
}

/**
 * ── «ثبّت» لا يكتب صفّين لموعدٍ واحد ─────────────────────────────────────────
 *
 * طلباتٌ حُفظت بالمحرّك القديم تحمل أطوالاً مختلفةً لبدايةٍ واحدة على نمطٍ معتمدٍ
 * موحّد الطول (75/75/50 لمقرّرٍ بثلاث ساعات على الأحد والثلاثاء والخميس)، فكان
 * التثبيتُ يكتبها صفّين. الأستاذُ رأى في صفحته طولَ اللائحة ووقّع عليه، فتُعاد
 * إليه هنا. والأنماطُ المعتمدة المختلفة الأطوال (170/110) تبقى كما هي.
 */
export function uniformPatternSlots(slots: readonly MeetingSlot[], hours: number): MeetingSlot[] | null {
  if (slots.length < 2) return null;
  const start = slots[0].start;
  if (!slots.every(slot => slot.start === start)) return null;
  const lengths = new Set(slots.map(slot => toMinutes(slot.end) - toMinutes(slot.start)));
  if (lengths.size < 2) return null;
  const days = slots.map(slot => slot.day);
  const pattern = lengthPatternsForHours(hours).find(entry => entry.days.length === days.length && sameDays(days, entry.days)
    && entry.minutes.every(value => value === entry.minutes[0]));
  if (!pattern) return null;
  return meetingSlots(days, start, [pattern]);
}
