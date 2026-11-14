/**
 * ── «محاضرتك القادمة» ────────────────────────────────────────────────────────
 *
 * دالةٌ نقيّة: من مواعيد «جدولي المقترح» الأسبوعية، واللحظة، وحدّي الفصل، أيُّ محاضرةٍ تأتي بعد؟
 *
 *   · الوقتُ بتوقيت الكويت (+03:00 ثابت، بلا توقيتٍ صيفي)، لا بتوقيت جهاز الطالب.
 *   · الأسبوعُ يبدأ الأحد وأيامُ التدريس الأحد…الخميس (يوم الموعد 0…4 كما في شبكة الأسبوع والتقويم)؛
 *     الجمعةُ والسبتُ عطلة فلا موعدَ فيهما.
 *   · لا محاضرةَ خارج حدّي الفصل (`term.start` … `term.end`، يومان بصيغة YYYY-MM-DD شاملان).
 *   · المحاضرةُ التي بدأت لا تُعدّ «قادمة».
 *
 * مكتوبةٌ لتُحقن في صفحة «مساري» نصّاً (`NEXT_LECTURE_SCRIPT`) كما يُحقن `countOf`: فكلُّ دالةٍ هنا قائمةٌ
 * بذاتها، لا تستدعي غيرها ولا تقرأ متغيّراً خارجها.
 */

export interface LectureMeeting {
  /** 0 = الأحد … 4 = الخميس. */
  day: number;
  /** دقائقُ منذ منتصف الليل. */
  start: number;
  end: number;
  name: string;
  code?: string;
  section?: string;
}

export interface NextLecture {
  meeting: LectureMeeting;
  /** لحظةُ البدء (ms منذ 1970، UTC). */
  at: number;
  /** الدقائقُ الباقية (تُقرَّب لأعلى فلا يقول «بعد 0 دقيقة» قبل البدء). */
  minutes: number;
  /** 0 اليوم، 1 غداً، … بتوقيت الكويت. */
  dayOffset: number;
  /** تاريخُ الموعد (YYYY-MM-DD بتوقيت الكويت). */
  date: string;
  /** "HH:MM" */
  clock: string;
}

export interface TermDays { start?: string; end?: string }

export function nextLecture(meetings: ReadonlyArray<LectureMeeting>, now: number, term?: TermDays | null): NextLecture | null {
  const KUWAIT = 3 * 3600000, DAY = 86400000;
  const list = Array.isArray(meetings) ? meetings : [];
  if (!list.length || !Number.isFinite(now)) return null;
  /* ساعةُ الكويت الجدارية مكتوبةً بحقول UTC: كلُّ ما بعدها حسابٌ على التقويم لا على منطقة الجهاز. */
  const wall = now + KUWAIT;
  const midnight = Math.floor(wall / DAY) * DAY;
  const minuteOfDay = Math.floor((wall - midnight) / 60000);
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = midnight + offset * DAY;
    const weekday = new Date(day).getUTCDay();
    if (weekday > 4) continue;
    const date = new Date(day).toISOString().slice(0, 10);
    if (term && ((term.start && date < term.start) || (term.end && date > term.end))) continue;
    const todays = list.filter(function (item) { return Number(item.day) === weekday && Number.isFinite(Number(item.start)); }).sort(function (a, b) { return a.start - b.start; });
    for (const meeting of todays) {
      if (offset === 0 && meeting.start <= minuteOfDay) continue;
      const at = day + meeting.start * 60000 - KUWAIT;
      return {
        meeting, at, minutes: Math.max(0, Math.ceil((at - now) / 60000)), dayOffset: offset, date,
        clock: (Math.floor(meeting.start / 60) < 10 ? "0" : "") + Math.floor(meeting.start / 60) + ":" + (meeting.start % 60 < 10 ? "0" : "") + (meeting.start % 60),
      };
    }
  }
  return null;
}

/**
 * النصُّ الذي تقوله البطاقة: «بعد 40 دقيقة» · «اليوم 14:00» · «غداً 08:00» · «الثلاثاء 08:00».
 * العددُ والمعدودُ من `count(n, unit)` (يُمرَّر منه `countOf` بالمثنّى بعد حرف الجر: «بعد دقيقتين»)،
 * فلا تُكتب قاعدةُ الإفراد والتثنية والجمع بيدٍ هنا.
 */
export function nextLectureLabel(next: NextLecture, count: (n: number, unit: "minute" | "hour") => string): { when: string; soon: boolean } {
  const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];
  if (next.dayOffset === 0 && next.minutes < 1) return { when: "تبدأ الآن", soon: true };
  if (next.dayOffset === 0 && next.minutes < 180) {
    const hours = Math.floor(next.minutes / 60), rest = next.minutes % 60;
    if (!hours) return { when: "بعد " + count(rest, "minute"), soon: true };
    const hourWord = hours === 1 ? "ساعة" : hours === 2 ? "ساعتين" : count(hours, "hour");
    return { when: "بعد " + hourWord + (rest ? " و" + count(rest, "minute") : ""), soon: true };
  }
  if (next.dayOffset === 0) return { when: "اليوم " + next.clock, soon: false };
  if (next.dayOffset === 1) return { when: "غداً " + next.clock, soon: false };
  return { when: (DAYS[next.meeting.day] || "") + " " + next.clock, soon: false };
}

/** للصفحة: الدالتان نفسُهما نصّاً (كـ ARABIC_COUNT_SCRIPT). */
export const NEXT_LECTURE_SCRIPT = `var nextLecture=(${nextLecture.toString()});var nextLectureLabel=(${nextLectureLabel.toString()});`;
