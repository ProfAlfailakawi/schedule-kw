import type { AdCourse, AdInstructor, FSchedule } from "../types";
import { departsFromNature, type CourseNature } from "./courseNature";
import { SCHEDULE_DAY_END , formatScheduleTimeRange } from "./scheduleTime";
import { AR, countOf, oblique } from "./arabicCount";

/**
 * The timetable rules of PAAET decision 1913/2016, written as code.
 *
 * Every check here quotes the article it comes from, because a warning a
 * coordinator cannot trace back to a rule is a warning they will learn to
 * ignore. Nothing in this file blocks a save: the regulation is the standard,
 * the department is the authority, and there are legitimate exceptions to most
 * of these — a warning says "look at this", not "you may not".
 *
 * Articles used:
 *   م.6/2  no more than two consecutive sections in a day for lectures over an hour
 *   م.6/3  no more than three consecutive sections in a day for one-hour lectures
 *   م.6/4  single-section courses rotate between staff each term
 *   م.7/2  morning 08–14 holds 50–70% of the department's sections, evening 14–20 holds 30–50%
 *   م.7/5  sections of one course spread across different hours and days
 *
 * The rest of the full decision is intentionally not enforced here unless the
 * current product actually carries reliable data for it. These checks are only
 * the scheduling alerts the department chose to surface.
 */

export type RegulationSeverity = "high" | "medium" | "low";
export type RegulationFindingSource = "decision-1912" | "history" | "department" | "readiness";
export type ApprovalEffect = "note" | "review" | "block";

export const DECISION_1912_LABEL = "قرار 1913/2016";

export interface RegulationFinding {
  /** Stable identifier, so a department can silence one rule and not the rest. */
  rule: string;
  article: string;
  severity: RegulationSeverity;
  /** What authority this finding comes from. Only decision-1912 belongs to the regulation score. */
  source: RegulationFindingSource;
  /** Whether approval should merely note it, review it, or actually stop. */
  approvalEffect: ApprovalEffect;
  title: string;
  detail: string;
  /** Optional identity used by review UI to group repeated cases by person/room. */
  subjectKey?: string;
  subjectLabel?: string;
  /** The appointments this finding is about, for highlighting on the grid. */
  rowIds: number[];
  /** Figures a screen can draw instead of reading the detail sentence (م.7/2: the morning/evening split). */
  data?: PeriodBalanceData;
}

/** م.7/2 as numbers: the shares, the sections counted, and how many are in the morning. */
export interface PeriodBalanceData { morning: number; evening: number; sections: number; morningCount: number }

export const isDecision1912Finding = (finding: RegulationFinding) => finding.source === "decision-1912";

export const DAY_KEYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
export const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];
export type DayKey = (typeof DAY_KEYS)[number];

/** Days the regulation gives 50-minute lectures, and days it gives 80 minutes. */
const SHORT_LECTURE_DAYS: DayKey[] = ["fsunday", "ftuesday", "fthursday"];
const LONG_LECTURE_DAYS: DayKey[] = ["fmonday", "fwednesday"];

/** Institutional teaching periods: 50 minutes on Sun/Tue/Thu and 80 minutes on Mon/Wed. */
export const SHORT_LECTURE_MINUTES = 50;
export const LONG_LECTURE_MINUTES = 80;

const MORNING_START = 8 * 60;
const MORNING_END = 14 * 60;
const EVENING_END = 20 * 60;

/** Below this many appointments a morning/evening share is noise, not a department. */
export const PERIOD_BALANCE_MIN_SECTIONS = 10;

export const toMinutes = (value: string) => {
  const [h, m] = String(value || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const clock = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const duration = (row: FSchedule) => Math.max(0, toMinutes(row.fendtime) - toMinutes(row.fstarttime));
const daysOf = (row: FSchedule) => DAY_KEYS.filter(key => Boolean((row as any)[key]));
const arabicNumber = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");

/**
 * The expected length of a lecture on a given day.
 *
 * This is also the answer to "I moved a course from Monday and Wednesday to
 * Sunday and Tuesday and the times are now wrong": they are not the same
 * lecture length. Three weekly hours are two 80-minute meetings on Mon/Wed, or
 * three 50-minute meetings on Sun/Tue/Thu, and a move between those families
 * has to reshape the appointment rather than carry the old end time across.
 */
export function expectedMinutesForDay(day: DayKey): number {
  return LONG_LECTURE_DAYS.includes(day) ? LONG_LECTURE_MINUTES : SHORT_LECTURE_MINUTES;
}

/** الفاصل المقرَّر بين محاضرتين متتاليتين في القاعة الواحدة، بالدقائق. */
export const SHORT_DAY_GAP_MINUTES = 10;
export const LONG_DAY_GAP_MINUTES = 15;

/**
 * ── الفاصل بين محاضرتين، وهو ليس رقماً واحداً ───────────────────────────────
 *
 * The college's rule is stated per day family, exactly like the lecture length
 * beside it: ten minutes between two lectures on Sun/Tue/Thu, a quarter of an
 * hour on Mon/Wed — the longer meetings need the longer changeover.
 *
 * The engine used to carry ONE number for this, learned from history or
 * declared as a single setting, so a department could not express the rule it
 * actually follows: whichever number it chose was wrong on one of the two
 * families. The requirement now comes from the day, like the duration does.
 *
 * A department that declares its own number still overrides this — a rule
 * somebody states out loud outranks an institutional default.
 */
export function requiredGapForDay(day: DayKey): number {
  return LONG_LECTURE_DAYS.includes(day) ? LONG_DAY_GAP_MINUTES : SHORT_DAY_GAP_MINUTES;
}

/** The strictest requirement among the days two appointments share. */
export function requiredGapForDays(days: readonly DayKey[]): number {
  return days.reduce((most, day) => Math.max(most, requiredGapForDay(day)), 0);
}

export interface DayPatternAdvice {
  family: "hour" | "hourAndHalf" | "mixed";
  expectedMinutes: number;
  /** The end time this start should have on these days. */
  suggestedEnd: string;
  changed: boolean;
  note: string;
}

/**
 * What a set of days implies for a lecture that starts at `start`.
 *
 * Called when days change, so the editor can offer the corrected end time
 * instead of leaving a 90-minute block sitting on a 60-minute day.
 */
export function adviseDayPattern(days: DayKey[], start: string, currentEnd: string): DayPatternAdvice | null {
  if (!days.length || !start) return null;
  const short = days.filter(day => SHORT_LECTURE_DAYS.includes(day)).length;
  const long = days.filter(day => LONG_LECTURE_DAYS.includes(day)).length;
  if (short && long) {
    return {
      family: "mixed",
      expectedMinutes: 0,
      suggestedEnd: currentEnd,
      changed: false,
      note: "أيام مختلطة: الأحد/الثلاثاء/الخميس مدتها المعتادة 50 دقيقة، والاثنين/الأربعاء 80 دقيقة. راجع التوزيع."
    };
  }
  const expected = long ? LONG_LECTURE_MINUTES : SHORT_LECTURE_MINUTES;
  const suggestedEnd = clock(Math.min(SCHEDULE_DAY_END, toMinutes(start) + expected));
  const changed = suggestedEnd !== currentEnd;
  return {
    family: long ? "hourAndHalf" : "hour",
    expectedMinutes: expected,
    suggestedEnd,
    changed,
    note: long
      ? "الاثنين والأربعاء: مدة المحاضرة المعتادة 80 دقيقة."
      : "الأحد والثلاثاء والخميس: مدة المحاضرة المعتادة 50 دقيقة."
  };
}


/**
 * The approved weekly patterns, and what a move actually means.
 *
 * Article 8 does not describe "a lecture" — it describes a *course* and how its
 * weekly hours are cut into meetings, and the cut depends on which days are
 * used. Three weekly hours are three one-hour meetings on Sunday, Tuesday and
 * Thursday, or two ninety-minute meetings on Monday and Wednesday. Four hours
 * are 90+90+60 across Monday, Wednesday and Thursday, or two two-hour meetings
 * on Tuesday and Thursday.
 *
 * This is why dragging a course from Monday+Wednesday onto Sunday cannot simply
 * keep its old end time: two meetings of ninety minutes become three meetings of
 * sixty, and the appointment being dragged is only one of them. The planner
 * returns the whole shape so the product can offer the real move — the days,
 * the length and the number of meetings — instead of quietly producing a course
 * that no longer adds up to its credit hours.
 */
export interface WeeklyPattern {
  id: string;
  days: DayKey[];
  /** Minutes per meeting, aligned with the day it falls on. */
  minutesPerDay: number[];
  weeklyMinutes: number;
  label: string;
  note: string;
}

const PATTERN_LIBRARY: Array<Omit<WeeklyPattern, "label"> & { hours: number }> = [
  {
    hours: 1, id: "1h-single", days: ["fsunday"], minutesPerDay: [50], weeklyMinutes: 50,
    note: "فترة تدريس واحدة مدتها 50 دقيقة في يوم واحد."
  },
  {
    hours: 2, id: "2h-two-days", days: ["fsunday", "ftuesday"], minutesPerDay: [50, 50], weeklyMinutes: 100,
    note: "فترتان: 50 دقيقة في الأحد و50 دقيقة في الثلاثاء."
  },
  {
    hours: 2, id: "2h-one-block", days: ["ftuesday"], minutesPerDay: [100], weeklyMinutes: 100,
    note: "فترتان أكاديميتان متصلتان في لقاء واحد (100 دقيقة)."
  },
  {
    hours: 3, id: "3h-three-days", days: ["fsunday", "ftuesday", "fthursday"], minutesPerDay: [50, 50, 50], weeklyMinutes: 150,
    note: "ثلاث فترات: 50 دقيقة في الأحد والثلاثاء والخميس."
  },
  {
    hours: 3, id: "3h-two-days", days: ["fmonday", "fwednesday"], minutesPerDay: [80, 80], weeklyMinutes: 160,
    note: "ثلاث فترات موزعة على لقاءين: 80 دقيقة في الاثنين و80 دقيقة في الأربعاء."
  },
  {
    hours: 4, id: "4h-mon-wed-thu", days: ["fmonday", "fwednesday", "fthursday"], minutesPerDay: [80, 80, 50], weeklyMinutes: 210,
    note: "النمط الممتد: 80+80+50 دقيقة على الاثنين والأربعاء والخميس."
  },
  {
    hours: 4, id: "4h-tue-thu", days: ["ftuesday", "fthursday"], minutesPerDay: [100, 100], weeklyMinutes: 200,
    note: "أربع فترات أكاديمية موزعة على لقاءين، 100 دقيقة لكل لقاء."
  },
  // Laboratories, workshops and field training run as one long sitting. The
  // articles describe lectures and never spell these out, but they are how a
  // large part of an applied-education timetable is actually taught, so they
  // belong in the library rather than in the warnings.
  {
    hours: 3, id: "3h-block", days: ["fwednesday"], minutesPerDay: [180], weeklyMinutes: 180,
    note: "ثلاث ساعات في يوم واحد — المعتاد للمختبرات والورش."
  },
  {
    hours: 4, id: "4h-block", days: ["fwednesday"], minutesPerDay: [240], weeklyMinutes: 240,
    note: "أربع ساعات في يوم واحد — المعتاد للمختبرات والتدريب."
  },
  {
    hours: 5, id: "5h-block", days: ["fwednesday"], minutesPerDay: [300], weeklyMinutes: 300,
    note: "خمس ساعات في يوم واحد — المعتاد للتدريب الميداني والعملي."
  },
  {
    hours: 5, id: "5h-split", days: ["fmonday", "fwednesday"], minutesPerDay: [180, 120], weeklyMinutes: 300,
    note: "خمس ساعات: 180+120 على يومين."
  }
];

/**
 * A single-day block can sit on any day, so the library's example day is not
 * the point — the length is. Asked for the shapes of a course, single-day
 * entries are offered on whichever day is already chosen.
 */
export function patternsForHoursOnDay(weeklyHours: number, preferredDay?: DayKey): WeeklyPattern[] {
  return patternsForHours(weeklyHours).map(pattern => {
    if (pattern.days.length !== 1 || !preferredDay) return pattern;
    return {
      ...pattern,
      days: [preferredDay],
      label: `${DAY_NAMES[DAY_KEYS.indexOf(preferredDay)]} ${pattern.minutesPerDay[0]}د`
    };
  });
}

const dayLabel = (day: DayKey) => DAY_NAMES[DAY_KEYS.indexOf(day)];

/** مكتبةُ الأنماط كلُّها مجمَّعةً بساعات المقرّر الأسبوعية، للعرض. */
export interface PatternLibraryEntry { id: string; days: DayKey[]; minutesPerDay: number[]; weeklyMinutes: number; note: string }
export function patternLibraryByHours(): Array<{ hours: number; patterns: PatternLibraryEntry[] }> {
  const hours = [...new Set(PATTERN_LIBRARY.map(pattern => pattern.hours))].sort((a, b) => a - b);
  return hours.map(value => ({
    hours: value,
    patterns: PATTERN_LIBRARY.filter(pattern => pattern.hours === value).map(({ id, days, minutesPerDay, weeklyMinutes, note }) => ({ id, days: [...days], minutesPerDay: [...minutesPerDay], weeklyMinutes, note })),
  }));
}

/** The approved shapes for a course with this many weekly hours. */
export function patternsForHours(weeklyHours: number): WeeklyPattern[] {
  const hours = Math.round(Number(weeklyHours) || 0);
  return PATTERN_LIBRARY.filter(pattern => pattern.hours === hours).map(pattern => ({
    ...pattern,
    label: pattern.days
      .map((day, index) => `${dayLabel(day)} ${pattern.minutesPerDay[index]}د`)
      .join(" · ")
  }));
}

export interface MovePlan {
  /** The pattern the target day belongs to, if the course has a known shape. */
  pattern: WeeklyPattern | null;
  /** Every meeting the course should have, with the new start times. */
  meetings: Array<{ day: DayKey; start: string; end: string }>;
  /** True when the move changes more than this one appointment. */
  reshapes: boolean;
  headline: string;
  detail: string;
}

/**
 * What moving this course to `targetDay` at `targetStart` really involves.
 *
 * Returns the whole week the course should occupy afterwards, so the product
 * can show the complete consequence and apply it in one step rather than
 * leaving a half-moved course behind.
 */
export function planMove(options: {
  weeklyHours: number;
  currentDays: DayKey[];
  targetDay: DayKey;
  targetStart: string;
}): MovePlan {
  const { weeklyHours, currentDays, targetDay, targetStart } = options;
  const candidates = patternsForHours(weeklyHours);
  const start = toMinutes(targetStart);

  // Prefer a pattern that contains the day being dropped on, and among those the
  // one closest to the days the course already uses — the smallest real change.
  const containing = candidates.filter(pattern => pattern.days.includes(targetDay));
  const pattern = containing.sort((a, b) => {
    const overlap = (p: WeeklyPattern) => p.days.filter(day => currentDays.includes(day)).length;
    return overlap(b) - overlap(a) || a.days.length - b.days.length;
  })[0] || null;

  if (!pattern) {
    const expected = expectedMinutesForDay(targetDay);
    return {
      pattern: null,
      meetings: [{ day: targetDay, start: targetStart, end: clock(Math.min(SCHEDULE_DAY_END, start + expected)) }],
      reshapes: false,
      headline: `${dayLabel(targetDay)} ${targetStart}`,
      detail: `مدة اللقاء ${countOf(expected, AR.minute)} على هذا اليوم (م.7/8/أ،ب).`
    };
  }

  const meetings = pattern.days.map((day, index) => ({
    day,
    start: targetStart,
    end: clock(Math.min(SCHEDULE_DAY_END, start + pattern.minutesPerDay[index]))
  }));
  const sameDays =
    pattern.days.length === currentDays.length &&
    pattern.days.every(day => currentDays.includes(day));

  return {
    pattern,
    meetings,
    reshapes: !sameDays,
    headline: sameDays
      ? `${dayLabel(targetDay)} ${targetStart}`
      : `تحويل إلى ${pattern.days.map(dayLabel).join(" · ")}`,
    detail: sameDays
      ? pattern.note
      : `${countOf(weeklyHours, AR.hour)} أسبوعياً. ${pattern.note} سيُعاد تشكيل المقرر إلى ${countOf(pattern.days.length, oblique(AR.meeting))} بنفس وقت البداية.`
  };
}

export interface RegulationContext {
  rows: FSchedule[];
  courses: Map<number, AdCourse>;
  instructors: Map<number, AdInstructor>;
  /** Rows of the previous term, for the rotation rule. */
  previousRows?: FSchedule[];
  /** A window the department keeps free for its meeting, e.g. "12:00"–"13:00". */
  meeting?: { day: DayKey; from: string; to: string } | null;
  /** What each course has habitually been, learned from every term on record. */
  nature?: Map<number, CourseNature> | null;
}

/** Consecutive means the next one starts within a quarter hour of this one ending. */
const CONSECUTIVE_GAP = 15;

/**
 * م.7/2 — the morning and evening shares of the department.
 *
 * Every appointment in the schedule counts once, by the hour it starts: the
 * total is the whole of what is on the page, split between the two periods.
 * It is a share of the whole department, so it names no appointment, and the
 * rows given must be the department's rows across all its colleges (the
 * caller passes the whole family). It is read only on a schedule large enough
 * for a proportion to mean something — an instructor's week or a single edit
 * is not a department.
 */
export function periodBalanceFinding(rows: readonly FSchedule[]): RegulationFinding | null {
  const data = periodBalanceSnapshot(rows);
  if (!data || data.sections < PERIOD_BALANCE_MIN_SECTIONS) return null;
  const { morning, evening, sections, morningCount } = data;
  const morningShare = morning;
  const eveningShare = evening;
  if (morningShare >= 50 && morningShare <= 70) return null;
  return {
    rule: "period-balance",
    article: "م.7/2",
    severity: "low",
    source: "decision-1912",
    approvalEffect: "note",
    title: "توزيع الفترتين الصباحية والمسائية",
    detail: `الصباحية (8–14) ${arabicNumber(morningShare)}% والمسائية (14–20) ${arabicNumber(eveningShare)}% من ${countOf(sections, AR.appointment)}. اللائحة: الصباحية بين 50% و70%، والمسائية بين 30% و50%.`,
    rowIds: [],
    data,
  };
}

/** قراءةُ توزيع الفترتين نفسها دون أن تقرر وجود مخالفة؛ تُستعمل لعرض اللائحة حتى عند المطابقة. */
export function periodBalanceSnapshot(rows: readonly FSchedule[]): PeriodBalanceData | null {
  const starts = rows.map(row => toMinutes(row.fstarttime)).filter((start, index) => rows[index].fstarttime && start >= MORNING_START && start < EVENING_END);
  if (!starts.length) return null;
  const morningCount = starts.filter(start => start < MORNING_END).length;
  const morning = Math.round((morningCount / starts.length) * 100);
  return { morning, evening: 100 - morning, sections: starts.length, morningCount };
}

export function reviewSchedule(context: RegulationContext): RegulationFinding[] {
  const { rows, courses, instructors } = context;
  const findings: RegulationFinding[] = [];
  const name = (row: FSchedule) =>
    courses.get(row.AdCourseId)?.CourseCode || row.AdCourseName || `موعد ${row.id}`;
  const who = (id: number) => instructors.get(id)?.AdInstructorName || "بدون أستاذ";

  // --- learned habit — this course is not behaving like itself -------------
  // Keep history course-scoped. The old aggregate could attach course 112's
  // explanation to a draft for course 458 merely because both were unusual in
  // the same term. One finding per academic course keeps every explanation
  // faithful to the course the reader is actually editing.
  if (context.nature?.size) {
    const oddByCourse = new Map<number, { rows: FSchedule[]; reasons: string[] }>();
    for (const row of rows) {
      const courseId = Number(row.AdCourseId);
      const learned = context.nature.get(courseId);
      const reason = departsFromNature(row, learned);
      if (!reason) continue;
      const entry = oddByCourse.get(courseId) || { rows: [], reasons: [] };
      entry.rows.push(row);
      if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
      oddByCourse.set(courseId, entry);
    }
    for (const [courseId, entry] of oddByCourse) {
      const course = courses.get(courseId);
      const courseLabel = course?.CourseCode || entry.rows[0]?.AdCourseName || String(courseId);
      findings.push({
        rule: "out-of-character",
        article: "الاعتياد التاريخي",
        severity: "medium",
        source: "history",
        approvalEffect: "note",
        title: `خارج المعتاد تاريخياً${entry.rows.length > 1 ? ` (${arabicNumber(entry.rows.length)})` : ""}`,
        detail: `المقرر ${courseLabel}: ${entry.reasons.slice(0, 3).join(" — ")}`,
        subjectKey: `course:${courseId}`,
        subjectLabel: courseLabel,
        rowIds: entry.rows.map(row => row.id),
      });
    }
  }

  const byCourse = new Map<number, FSchedule[]>();
  rows.forEach(row => {
    if (!row.AdCourseId) return;
    byCourse.set(row.AdCourseId, [...(byCourse.get(row.AdCourseId) || []), row]);
  });

  // --- م.7/8 — theoretical weekly patterns stated explicitly in the decision.
  for (const [courseId, list] of byCourse) {
    const course = courses.get(courseId);
    if (course?.CourseTeachingMode !== "theoretical") continue;
    const hours = Number(course.CourseHours || course.CourseCredit || 0);
    if (hours !== 3 && hours !== 4) continue;
    const bySection = new Map<string, FSchedule[]>();
    for (const row of list) bySection.set(String(row.SCode || ""), [...(bySection.get(String(row.SCode || "")) || []), row]);
    const invalid: FSchedule[] = [];
    for (const sectionRows of bySection.values()) {
      const meetings = sectionRows.flatMap(row => daysOf(row).map(day => ({ day, minutes: duration(row) })));
      const actual = meetings.slice().sort((a, b) => DAY_KEYS.indexOf(a.day) - DAY_KEYS.indexOf(b.day));
      const matches = (expected: Array<{ day: DayKey; minutes: number }>) => actual.length === expected.length && expected.every((item, index) => actual[index]?.day === item.day && actual[index]?.minutes === item.minutes);
      const valid = hours === 3
        ? matches([{ day: "fsunday", minutes: 60 }, { day: "ftuesday", minutes: 60 }, { day: "fthursday", minutes: 60 }])
          || matches([{ day: "fmonday", minutes: 90 }, { day: "fwednesday", minutes: 90 }])
        : matches([{ day: "fmonday", minutes: 90 }, { day: "fwednesday", minutes: 90 }, { day: "fthursday", minutes: 60 }])
          || matches([{ day: "ftuesday", minutes: 120 }, { day: "fthursday", minutes: 120 }]);
      if (!valid) invalid.push(...sectionRows);
    }
    if (invalid.length) findings.push({
      rule: "theoretical-pattern",
      article: "م.7/8",
      severity: "high",
      source: "decision-1912",
      approvalEffect: "block",
      title: `توزيع مقرر نظري لا يطابق نمط ${countOf(hours, AR.hour)}`,
      detail: hours === 3
        ? "المطلوب: ساعة في الأحد والثلاثاء والخميس، أو ساعة ونصف في الاثنين والأربعاء."
        : "المطلوب: ساعة ونصف في الاثنين والأربعاء وساعة في الخميس، أو ساعتان في الثلاثاء والخميس.",
      subjectKey: `course:${courseId}`,
      subjectLabel: course.CourseCode || course.CourseName,
      rowIds: [...new Set(invalid.map(row => row.id))],
    });
  }

  // --- م.7/9 — a course section keeps one start time across its teaching days.
  for (const [courseId, list] of byCourse) {
    const bySection = new Map<string, FSchedule[]>();
    for (const row of list) bySection.set(String(row.SCode || ""), [...(bySection.get(String(row.SCode || "")) || []), row]);
    for (const [sectionCode, sectionRows] of bySection) {
      const starts = new Set(sectionRows.map(row => String(row.fstarttime || "")).filter(Boolean));
      if (starts.size < 2) continue;
      findings.push({
        rule: "fixed-course-time",
        article: "م.7/9",
        severity: "high",
        source: "decision-1912",
        approvalEffect: "block",
        title: `وقت شعبة المقرر غير ثابت (${name(sectionRows[0])} · ${sectionCode})`,
        detail: `تبدأ لقاءات هذه الشعبة في أوقات مختلفة: ${[...starts].sort().join("، ")}.`,
        subjectKey: `course:${courseId}:${sectionCode}`,
        subjectLabel: `${name(sectionRows[0])} · شعبة ${sectionCode}`,
        rowIds: sectionRows.map(row => row.id),
      });
    }
  }

  // --- م.7/5 — sections of one course spread over hours and days -----------
  const clashing: FSchedule[] = [];
  const courseNames: string[] = [];
  for (const [courseId, list] of byCourse) {
    if (list.length < 2) continue;
    const starts = new Map<string, FSchedule[]>();
    list.forEach(row => starts.set(row.fstarttime, [...(starts.get(row.fstarttime) || []), row]));
    for (const [, sameHour] of starts) {
      // Two sections at the same hour only matter when they also share a day.
      const overlapping = sameHour.filter((row, index) =>
        sameHour.some((other, otherIndex) =>
          otherIndex !== index && daysOf(row).some(day => daysOf(other).includes(day))));
      if (overlapping.length > 1) {
        clashing.push(...overlapping);
        const label = courses.get(courseId)?.CourseCode || String(courseId);
        if (!courseNames.includes(label)) courseNames.push(label);
      }
    }
  }
  if (clashing.length) {
    findings.push({
      rule: "sections-same-hour",
      article: "م.7/5",
      severity: "high",
      source: "decision-1912",
      approvalEffect: "review",
      title: `تكرار شعب المقرر في نفس الوقت (${arabicNumber(courseNames.length)})`,
      detail: `المقرر الواحد يُفضَّل توزيعه على أوقات أو أيام مختلفة. ${courseNames.slice(0, 6).join("، ")}`,
      rowIds: [...new Set(clashing.map(row => row.id))]
    });
  }

  // --- م.6/2،3 — count successive sections for the instructor across courses.
  // A negative gap is an overlap, never a consecutive teaching sequence.
  const runsOverLong: Array<{ instructorId: number; day: DayKey; rows: FSchedule[] }> = [];
  const runsOverOneHour: Array<{ instructorId: number; day: DayKey; rows: FSchedule[] }> = [];
  const byInstructor = new Map<number, FSchedule[]>();
  rows.forEach(row => {
    if (!row.AdInstructorId) return;
    byInstructor.set(row.AdInstructorId, [...(byInstructor.get(row.AdInstructorId) || []), row]);
  });
  for (const [instructorId, list] of byInstructor) {
    for (const day of DAY_KEYS) {
      const onDay = list
        .filter(row => (row as any)[day])
        .sort((a, b) => toMinutes(a.fstarttime) - toMinutes(b.fstarttime));
      if (onDay.length < 3) continue;
      let run: FSchedule[] = [];
      const record = () => {
        if (run.length > 2 && run.some(row => duration(row) > 60)) runsOverLong.push({ instructorId, day, rows: [...run] });
        else if (run.length > 3) runsOverOneHour.push({ instructorId, day, rows: [...run] });
      };
      for (const row of onDay) {
        if (!run.length) { run = [row]; continue; }
        const previousEnd = toMinutes(run[run.length - 1].fendtime);
        const gap = toMinutes(row.fstarttime) - previousEnd;
        if (gap >= 0 && gap <= CONSECUTIVE_GAP) { run.push(row); continue; }
        record();
        run = [row];
      }
      record();
    }
  }
  const appendConsecutiveFinding = (cases: typeof runsOverLong, article: string, title: string, rule: string) => {
    if (!cases.length) return;
    findings.push({
      rule,
      article,
      severity: "high",
      source: "decision-1912",
      approvalEffect: "block",
      title: `${title} (${arabicNumber(cases.length)})`,
      detail: cases.slice(0, 4).map(item => `${who(item.instructorId)} · ${DAY_NAMES[DAY_KEYS.indexOf(item.day)]} · ${item.rows.map(row => `${name(row)} · رقم الشعبة ${row.SCode}`).join(" ← ")}`).join(" — "),
      rowIds: [...new Set(cases.flatMap(item => item.rows.map(row => row.id)))],
    });
  };
  appendConsecutiveFinding(runsOverLong, "م.6/2", "أكثر من شعبتين متتاليتين لمقرر تتجاوز محاضرته ساعة", "consecutive-long-lecture");
  appendConsecutiveFinding(runsOverOneHour, "م.6/3", "أكثر من ثلاث شعب متتالية لمقرر محاضرته ساعة", "consecutive-one-hour");

  // --- م.6/4 — rotation of single-section courses -------------------------
  if (context.previousRows?.length) {
    const previousOwner = new Map<number, number>();
    const previousCount = new Map<number, number>();
    context.previousRows.forEach(row => {
      previousCount.set(row.AdCourseId, (previousCount.get(row.AdCourseId) || 0) + 1);
      previousOwner.set(row.AdCourseId, row.AdInstructorId);
    });
    const repeated: string[] = [];
    const repeatedRows: number[] = [];
    for (const [courseId, list] of byCourse) {
      // The rule is about courses offered as a single section.
      if (list.length !== 1 || previousCount.get(courseId) !== 1) continue;
      if (previousOwner.get(courseId) === list[0].AdInstructorId && list[0].AdInstructorId) {
        repeated.push(`${courses.get(courseId)?.CourseCode || courseId} · ${who(list[0].AdInstructorId)}`);
        repeatedRows.push(list[0].id);
      }
    }
    if (repeated.length) {
      findings.push({
        rule: "rotation",
        article: "م.6/4",
        severity: "medium",
        source: "decision-1912",
        approvalEffect: "review",
        title: `التدوير غير محقق (${arabicNumber(repeated.length)})`,
        detail: `المقرر أحادي الطرح ما زال عند نفس العضو مقارنة بالفصل السابق. ${repeated.slice(0, 5).join(" — ")}`,
        rowIds: repeatedRows
      });
    }
  }

  // --- م.7/2 — the morning and evening shares of the department ----------
  const periodBalance = periodBalanceFinding(rows);
  if (periodBalance) findings.push(periodBalance);

  // --- the department's own protected window ------------------------------
  if (context.meeting?.day && context.meeting.from && context.meeting.to) {
    const { day, from, to } = context.meeting;
    const inside = rows.filter(row =>
      (row as any)[day] &&
      toMinutes(row.fstarttime) < toMinutes(to) &&
      toMinutes(row.fendtime) > toMinutes(from));
    if (inside.length) {
      findings.push({
        rule: "meeting-window",
        article: "قرار القسم",
        severity: "medium",
        source: "department",
        approvalEffect: "review",
        title: `داخل وقت اجتماع القسم (${arabicNumber(inside.length)})`,
        detail: `${DAY_NAMES[DAY_KEYS.indexOf(day)]} ${formatScheduleTimeRange(from, to)} وقت محجوز للقسم.`,
        rowIds: inside.map(row => row.id)
      });
    }
  }

  // --- rows that were never finished --------------------------------------
  const unfinished = rows.filter(row => !daysOf(row).length || !row.fstarttime || !row.fendtime || !row.AdInstructorId);
  if (unfinished.length) {
    findings.push({
      rule: "incomplete",
      article: "جاهزية الاعتماد",
      severity: "high",
      source: "readiness",
      approvalEffect: "block",
      title: `بيانات غير مكتملة (${arabicNumber(unfinished.length)})`,
      detail: "هذا الموعد يحتاج أياماً ووقتاً وأستاذاً قبل الاعتماد.",
      rowIds: unfinished.map(row => row.id)
    });
  }

  const order: Record<RegulationSeverity, number> = { high: 0, medium: 1, low: 2 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}

/**
 * How much of this schedule the regulation would question.
 *
 * Not a penalty count — a proportion. Every appointment a finding names is
 * weighed by how serious that finding is, and measured against the size of the
 * schedule, so a department with three problems in four hundred appointments
 * reads as healthy and one with three problems in ten does not. A row named by
 * several findings is still one row: the same appointment cannot be wrong twice
 * over.
 */
export function regulationScore(findings: RegulationFinding[], rowCount: number): number {
  if (!rowCount) return 100;
  const weight: Record<RegulationSeverity, number> = { high: 1, medium: 0.5, low: 0.2 };
  const worst = new Map<number, number>();
  for (const finding of findings) {
    if (!isDecision1912Finding(finding)) continue;
    const cost = weight[finding.severity];
    // A finding with no specific rows (a balance ratio, say) counts as a light
    // touch on the whole schedule rather than on nothing.
    const targets = finding.rowIds.length ? finding.rowIds : [];
    if (!targets.length) continue;
    for (const id of targets) worst.set(id, Math.max(worst.get(id) || 0, cost));
  }
  const implicated = [...worst.values()].reduce((total, cost) => total + cost, 0);
  const wide = findings.filter(finding => isDecision1912Finding(finding) && !finding.rowIds.length).length * 0.02 * rowCount;
  return Math.max(0, Math.min(100, Math.round(100 - ((implicated + wide) / rowCount) * 100)));
}

/**
 * Is this appointment's length one the regulation (or the course's own history) allows?
 *
 * A row has a single start and end for all of its days, so the length is one number: it must be
 * `k` lectures of the day's length with the day's break between them (50 + 10 + 50 on Sun/Tue/Thu,
 * 80 + 15 + 80 on Mon/Wed), and `k` can never exceed the course's weekly hours. A combined two-period
 * block may differ by five minutes because legacy timetable slots encode the passing interval differently;
 * the separate room-turnover rule still checks the full required gap between appointments. A length the course
 * has habitually used (a lab, a workshop) is accepted as it is — history outranks the regulation.
 * Returns the message to refuse with, or null.
 */
export function lectureLengthProblem(
  row: Partial<Record<DayKey, unknown>> & { fstarttime?: unknown; fendtime?: unknown },
  courseHours: number,
  habitualMinutes?: number
): string | null {
  const days = DAY_KEYS.filter(day => Boolean(row[day]));
  const toMin = (value: unknown) => { const [h, m] = String(value || "").split(":").map(Number); return h * 60 + m; };
  const length = toMin(row.fendtime) - toMin(row.fstarttime);
  if (!days.length || !Number.isFinite(length) || length <= 0) return null;
  if (habitualMinutes && Math.abs(length - habitualMinutes) <= 5) return null;
  const maxPeriods = Math.max(1, Math.ceil(courseHours || 1));
  const fits = days.some(day => {
    const lecture = expectedMinutesForDay(day), gap = requiredGapForDay(day);
    for (let periods = 1; periods <= maxPeriods; periods++) {
      const expected = periods * lecture + (periods - 1) * gap;
      /* Monday/Wednesday's established timetable block is 08:00–10:50:
         two 80-minute lectures with a 10-minute passing interval. Keep the
         15-minute regulatory room-turnover check independent of this block. */
      if (length === expected || (periods === 2 && lecture === 80 && length === expected - 5)) return true;
    }
    return false;
  });
  if (fits) return null;
  const family = days.map(day => `${DAY_NAMES[DAY_KEYS.indexOf(day)]} ${expectedMinutesForDay(day)}د`);
  return `مدة المحاضرة ${countOf(length, AR.minute)} لا توافق اللائحة (${[...new Set(family)].join("، ")} مع فاصل ${arabicNumber(requiredGapForDays(days))}د بين المحاضرتين المتتاليتين)`;
}

/** دقائقُ المحاضرة الفعلية في الأسبوع لصفٍّ واحد: الفواصل بين المحاضرات المتتالية لا تُحسب منها. */
export function weeklyLectureMinutes(row: Partial<Record<DayKey, unknown>> & { fstarttime?: unknown; fendtime?: unknown }): number {
  const toMin = (value: unknown) => { const [h, m] = String(value || "").split(":").map(Number); return h * 60 + m; };
  const length = toMin(row.fendtime) - toMin(row.fstarttime);
  if (!Number.isFinite(length) || length <= 0) return 0;
  return DAY_KEYS.filter(day => Boolean(row[day])).reduce((sum, day) => {
    const lecture = expectedMinutesForDay(day), gap = requiredGapForDay(day);
    const periods = Math.round((length + gap) / (lecture + gap));
    const expected = periods * lecture + (periods - 1) * gap;
    const fits = periods >= 1 && (expected === length || (periods === 2 && lecture === 80 && length === expected - 5));
    return sum + (fits ? periods * lecture : length);
  }, 0);
}

/** الحدُّ الأعلى لدقائق الأسبوع لمقرّرٍ بهذه الساعات: لا يزيد على ما اعتُمد (هامشُ ١٠٪ لفرق ٥٠/٨٠). */
export const maxWeeklyMinutesFor = (hours: number) => Math.round(Math.round(hours) * 50 * 1.1);
