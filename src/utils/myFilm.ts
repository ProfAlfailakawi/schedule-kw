/**
 * ── فيلمي ───────────────────────────────────────────────────────────────────
 *
 * النسخةُ الشخصية القصيرة من «فيلم الفصل» (src/utils/termFilm.ts): قصةُ صاحبها
 * وحده في أقل من نصف دقيقة. للأستاذ من رابطه: محاضراته وأيامه ورغباته التي
 * ثُبّتت؛ وللطالب داخل «مساري»: ما أنجزه وما طُرح له هذا الفصل ورغباته وأسبوعه
 * المقترح.
 *
 * كل رقمٍ يُحسب مما يراه صاحبه أصلاً في صفحته: صفوف جدوله الرسمي وقرارات القسم
 * في طلبه، أو ملف الطالب وتذكرته. وما لا مصدر له لا يُعرض: يسقط مشهده بدل أن
 * يُخترع رقمه. وقبل الاعتماد النهائي يُروى فيلم الأستاذ «حتى الآن» كما في فيلم
 * الفصل (قرار المالك)، ولا يدّعي أن الجدول انتهى.
 *
 * **لا قاعةَ ولا مبنى**: مدخلُ هذا الملف لا يحمل حقلَ مكانٍ أصلاً
 * (`lecturesFromRows` تقرأ اليومَ والوقتَ والمقررَ والشعبةَ وحدها)، ولا رقماً
 * مدنياً، ولا اسمَ أحدٍ غير صاحب الفيلم.
 *
 * الفيلمُ يخرج مشاهدَ مرتّبة، وكلُّ مشهدٍ قطعٌ (عنوان، رقم، شبكة أسبوع، حلقة…)
 * ترسمها صفحةُ العرض (src/server/myFilmPage.ts) كما هي: النصُّ كلُّه يُبنى هنا
 * بقاعدة العدد والمعدود، والصفحةُ لا تصوغ جملة.
 */
import { AR, countOf, nounFor } from "./arabicCount";
import { fixedTimeOf } from "./requestDecisionDigest";
import type { InstructorRequestItem } from "../types";

export const MY_FILM_DAY_KEYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
export const MY_FILM_DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"] as const;
export const MY_FILM_DAY_LETTERS = ["ح", "ن", "ث", "ر", "خ"] as const;
/** عددُ ألوان المقررات في شبكة الأسبوع؛ المقررُ السادس يعيد اللونَ الأول. */
export const MY_FILM_TONES = 5;

/** مدةُ كل مشهدٍ بالملّي ثانية، بمفتاحه. */
export const MY_FILM_DURATIONS: Record<string, number> = {
  title: 3600, week: 5600, busiest: 5400, free: 4600, wishes: 5600,
  progress: 5200, offered: 5000, mywishes: 4600, myweek: 5600, closing: 4800,
};

export type MyFilmPart =
  | { t: "eyebrow"; text: string }
  | { t: "big"; text: string; size?: "m" }
  | { t: "cap"; text: string }
  | { t: "badge"; text: string }
  | { t: "rule" }
  | { t: "trio"; items: Array<{ value: number; label: string }> }
  | { t: "week"; from: number; to: number; blocks: Array<{ day: number; start: number; end: number; tone: number }>; legend: Array<{ tone: number; text: string }> }
  | { t: "line"; from: number; to: number; blocks: Array<{ start: number; end: number; tone: number }> }
  | { t: "days"; items: Array<{ letter: string; name: string; on: boolean; count: number }> }
  | { t: "chips"; items: string[]; tone?: "gold" }
  | { t: "ring"; pct: number; inside: string }
  | { t: "dots"; total: number; lit: number }
  | { t: "rows"; items: Array<{ label: string; text: string; state: "done" | "plain" }> };

export interface MyFilmScene { key: string; label: string; duration: number; parts: MyFilmPart[] }

export interface MyFilmData {
  kind: "instructor" | "student";
  /** هل اعتمد التسجيل جدولَ صاحب الفيلم؟ قبلها يُروى «حتى الآن». فيلمُ الطالب لا اعتمادَ فيه: مقترحاتٌ دائماً. */
  final: boolean;
  title: string;
  scenes: MyFilmScene[];
  generatedAt: string;
}

const join = (parts: Array<string | null | undefined | false>, glue = " · ") => parts.filter(Boolean).join(glue);
/** سطورُ التعليق: كلُّ معلومةٍ في سطرها، فلا تنكسر الجملة عند فاصلةٍ في أول السطر. */
const lines = (parts: Array<string | null | undefined | false>) => join(parts, "\n");
const minutesOf = (value?: string) => {
  const [h, m] = String(value || "").split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : NaN;
};
/** «08:00» من الدقائق: أرقامٌ لاتينية دائماً، وتُرسم من اليسار. */
export const clockOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(Math.round(minutes % 60)).padStart(2, "0")}`;
/** «الأحد والثلاثاء»، «الأحد والثلاثاء والخميس». */
export const dayList = (days: number[]) => [...new Set(days)].sort((a, b) => a - b).map(day => MY_FILM_DAY_NAMES[day]).filter(Boolean).join(" و");
const scene = (key: string, label: string, parts: Array<MyFilmPart | null | false | undefined>): MyFilmScene =>
  ({ key, label, duration: MY_FILM_DURATIONS[key] || 5000, parts: parts.filter(Boolean) as MyFilmPart[] });

/* ── الأستاذ ─────────────────────────────────────────────────────────────── */

export interface MyFilmRowLike {
  id?: number | string;
  AdInstructorId?: number | string;
  AdCourseId?: number | string;
  AdCourseName?: string;
  SCode?: string;
  fsunday?: unknown; fmonday?: unknown; ftuesday?: unknown; fwednesday?: unknown; fthursday?: unknown;
  fstarttime?: string;
  fendtime?: string;
}

/** محاضرةٌ كما يحتاجها الفيلم: مقررٌ وشعبةٌ وأيامٌ ووقت. لا حقلَ مكانٍ هنا، فلا يصل الفيلمَ مكان. */
export interface MyFilmLecture { courseId: number; course: string; section: string; days: number[]; start: number; end: number }

/**
 * محاضراتُ الأستاذ من جدوله **الرسمي**: الصفوفُ التي أستاذُها هو، بأرقامٍ موجبة
 * (صفوفُ «وضع تجربة» وحجوزُ الطلبات سالبة وليست جدولاً). يُقرأ اليومُ والوقتُ
 * والمقررُ والشعبةُ وحدها.
 */
export function lecturesFromRows(rows: ReadonlyArray<MyFilmRowLike>, instructorId: number, courseNameOf: (courseId: number) => string = () => ""): MyFilmLecture[] {
  const out: MyFilmLecture[] = [];
  for (const row of rows) {
    if (!instructorId || Number(row.AdInstructorId) !== Number(instructorId) || Number(row.id) <= 0) continue;
    const start = minutesOf(row.fstarttime), end = minutesOf(row.fendtime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const days = MY_FILM_DAY_KEYS.map((key, day) => (row[key] ? day : -1)).filter(day => day >= 0);
    if (!days.length) continue;
    const courseId = Number(row.AdCourseId || 0);
    out.push({ courseId, course: String(row.AdCourseName || courseNameOf(courseId) || "").trim(), section: String(row.SCode || "").trim(), days, start, end });
  }
  return out;
}

export interface MyFilmMeeting { day: number; start: number; end: number; course: string; tone: number }
export interface MyFilmWeek {
  sections: number;
  courses: number;
  /** لقاءاتُ الأسبوع بلا تكرار: موعدٌ مكرّر (شعبتان مدمجتان في الوقت نفسه) يُحسب مرةً واحدة. */
  meetings: MyFilmMeeting[];
  weeklyMinutes: number;
  teachingDays: number[];
  freeDays: number[];
  earliest: number;
  latest: number;
  /** أزحمُ الأيام: الأطولُ دقائقَ، ثم الأكثرُ لقاءاتٍ، ثم الأبكر. `null` حين يدرّس يوماً واحداً، أو تتساوى أيامُه كلُّها (لا «أزحم» بين متساوين). */
  busiest: { day: number; minutes: number; meetings: MyFilmMeeting[] } | null;
}

export function weekOf(lectures: ReadonlyArray<MyFilmLecture>): MyFilmWeek | null {
  if (!lectures.length) return null;
  const sections = new Set<string>(), courseOrder: number[] = [];
  const seen = new Set<string>(), meetings: MyFilmMeeting[] = [];
  for (const lecture of lectures) {
    sections.add(`${lecture.courseId}:${lecture.section}`);
    if (!courseOrder.includes(lecture.courseId)) courseOrder.push(lecture.courseId);
    const tone = courseOrder.indexOf(lecture.courseId) % MY_FILM_TONES;
    for (const day of lecture.days) {
      const key = `${day}|${lecture.start}|${lecture.end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      meetings.push({ day, start: lecture.start, end: lecture.end, course: lecture.course, tone });
    }
  }
  meetings.sort((a, b) => a.day - b.day || a.start - b.start);
  const byDay = [0, 1, 2, 3, 4].map(day => meetings.filter(meeting => meeting.day === day));
  const teachingDays = byDay.map((list, day) => (list.length ? day : -1)).filter(day => day >= 0);
  const minutesIn = (list: MyFilmMeeting[]) => list.reduce((sum, meeting) => sum + (meeting.end - meeting.start), 0);
  const ranked = [...teachingDays].sort((a, b) => minutesIn(byDay[b]) - minutesIn(byDay[a]) || byDay[b].length - byDay[a].length || a - b);
  const lightest = ranked[ranked.length - 1];
  const top = ranked.length > 1 && (minutesIn(byDay[ranked[0]]) > minutesIn(byDay[lightest]) || byDay[ranked[0]].length > byDay[lightest].length) ? ranked[0] : -1;
  return {
    sections: sections.size, courses: courseOrder.length, meetings,
    weeklyMinutes: minutesIn(meetings), teachingDays,
    freeDays: [0, 1, 2, 3, 4].filter(day => !byDay[day].length),
    earliest: Math.min(...meetings.map(meeting => meeting.start)),
    latest: Math.max(...meetings.map(meeting => meeting.end)),
    busiest: top >= 0 ? { day: top, minutes: minutesIn(byDay[top]), meetings: byDay[top] } : null,
  };
}

export interface MyFilmWish { state: "fixed" | "rejected" | "pending"; action: "change" | "add" | "delete"; course: string; days: number[]; start: string; end: string }

/**
 * رغباتُ الأستاذ من بنود طلبه: كلُّ بندٍ غيّر فيه شيئاً (تعديلٌ أو إضافةٌ أو حذف).
 * «كما هو» ليس رغبة، والبندُ المخفيّ عنه لا يُعدّ، وما ألغاه القسم من مواعيده هو
 * (cancelled) قرارُ القسم لا رغبةُ الأستاذ. المثبَّت يُقرأ بما كُتب في الجدول فعلاً
 * (fixedTimeOf)، والمعلّق لا يُعدّ إلا بعد أن يُرسل الطلب.
 */
export function wishesFromItems(items: ReadonlyArray<InstructorRequestItem> | undefined, submitted: boolean): MyFilmWish[] {
  const out: MyFilmWish[] = [];
  for (const item of items || []) {
    if (!item || (item as any).hidden || item.action === "keep") continue;
    const decision = item.decision;
    if (decision?.cancelled || decision?.fromSchedule) continue;
    const state = decision?.state === "fixed" ? "fixed" : decision?.state === "rejected" ? "rejected" : submitted ? "pending" : null;
    if (!state) continue;
    const time = state === "fixed" && item.action !== "delete"
      ? fixedTimeOf(item)
      : { days: (item.slots || []).map(slot => String(slot.day)), start: String(item.slots?.[0]?.start || ""), end: String(item.slots?.[0]?.end || "") };
    out.push({
      state, action: item.action,
      course: String(item.after?.courseName || item.before?.courseName || "").trim(),
      days: time.days.map(day => MY_FILM_DAY_KEYS.indexOf(day as typeof MY_FILM_DAY_KEYS[number])).filter(day => day >= 0),
      start: time.start, end: time.end,
    });
  }
  return out;
}

/** مفتاحُ ألوان الشبكة: اسمُ كل مقررٍ بلونه، بترتيب ظهوره، حتى خمسة. */
const legendOf = (meetings: ReadonlyArray<{ tone: number; course: string }>) => {
  const out: Array<{ tone: number; text: string }> = [];
  for (const meeting of meetings) {
    if (!meeting.course || out.some(entry => entry.text === meeting.course)) continue;
    out.push({ tone: meeting.tone, text: meeting.course });
  }
  return out.slice(0, MY_FILM_TONES);
};

export interface InstructorFilmInput {
  name: string;
  termName: string;
  lectures: MyFilmLecture[];
  wishes: MyFilmWish[];
  /** اعتمد التسجيلُ جدولَ كل قسمٍ يدرّس فيه. */
  final: boolean;
  now?: Date;
}

/** «6 ساعات و15 دقيقة»، «ساعتان»، «50 دقيقة»: مدةٌ بدقائقها كما هي، بلا تقريبٍ إلى كسر ساعة. */
export function durationText(minutes: number): string {
  const total = Math.max(0, Math.round(minutes)), hours = Math.floor(total / 60), rest = total % 60;
  if (!hours) return countOf(rest, AR.minute);
  return rest ? `${countOf(hours, AR.hour)} و${countOf(rest, AR.minute)}` : countOf(hours, AR.hour);
}

/** فيلمُ الأستاذ، أو `null` حين لا محاضرةَ له في الفصل بعد (لا فيلمَ بلا قصة). */
export function instructorFilm(input: InstructorFilmInput): MyFilmData | null {
  const week = weekOf(input.lectures);
  if (!week) return null;
  const final = input.final;
  const weekly = `${durationText(week.weeklyMinutes)} في الأسبوع`;
  const span = `من ${clockOf(week.earliest)} إلى ${clockOf(week.latest)}`;
  const fixed = input.wishes.filter(wish => wish.state === "fixed");
  const rejected = input.wishes.filter(wish => wish.state === "rejected").length;
  const pending = input.wishes.filter(wish => wish.state === "pending").length;
  const decided = fixed.length + rejected;

  const scenes: MyFilmScene[] = [
    scene("title", "العنوان", [
      { t: "eyebrow", text: join([input.termName, "فيلمي"]) },
      { t: "big", text: input.name || "أسبوعك في هذا الفصل" },
      { t: "cap", text: final ? "قصة أسبوعك في هذا الفصل كما اعتُمد" : "قصة أسبوعك في هذا الفصل" },
      !final && { t: "badge", text: "يُروى حتى الآن · قبل الاعتماد النهائي" },
    ]),
    scene("week", "أسبوعك", [
      { t: "eyebrow", text: final ? "أسبوعك" : "أسبوعك حتى الآن" },
      { t: "week", from: week.earliest, to: week.latest, blocks: week.meetings.map(({ day, start, end, tone }) => ({ day, start, end, tone })), legend: legendOf(week.meetings) },
      { t: "trio", items: [
        { value: week.sections, label: nounFor(week.sections, AR.section) },
        { value: week.courses, label: nounFor(week.courses, AR.course) },
        { value: week.teachingDays.length, label: `${nounFor(week.teachingDays.length, AR.day)} للتدريس` },
      ] },
      { t: "cap", text: lines([weekly, span]) },
    ]),
  ];

  if (week.busiest) {
    const { day, minutes, meetings } = week.busiest;
    scenes.push(scene("busiest", "أزحم أيامك", [
      { t: "eyebrow", text: "أزحم أيامك" },
      { t: "big", text: MY_FILM_DAY_NAMES[day] },
      { t: "line", from: meetings[0].start, to: Math.max(...meetings.map(meeting => meeting.end)), blocks: meetings.map(({ start, end, tone }) => ({ start, end, tone })) },
      { t: "rows", items: meetings.slice(0, 4).map(meeting => ({ label: meeting.course || "محاضرة", text: `${clockOf(meeting.start)} – ${clockOf(meeting.end)}`, state: "plain" as const })) },
      { t: "cap", text: lines([
        join([countOf(meetings.length, AR.lecture), durationText(minutes)]),
        meetings.length > 4 ? "تظهر أول 4 منها" : null,
      ]) },
    ]));
  }

  if (week.freeDays.length) {
    scenes.push(scene("free", "أيامك الحرّة", [
      { t: "eyebrow", text: week.freeDays.length === 1 ? "يومك الحرّ" : "أيامك الحرّة" },
      { t: "days", items: MY_FILM_DAY_NAMES.map((name, day) => {
        const count = week.meetings.filter(meeting => meeting.day === day).length;
        return { letter: MY_FILM_DAY_LETTERS[day], name, on: !count, count };
      }) },
      { t: "big", text: dayList(week.freeDays), size: week.freeDays.length > 2 ? "m" : undefined },
      { t: "cap", text: lines([`${countOf(week.freeDays.length, AR.day)} بلا محاضرات`, "من الأحد إلى الخميس"]) },
    ]));
  }

  if (fixed.length) {
    const whenOf = (wish: MyFilmWish) => wish.action === "delete"
      ? "حُذف كما طلبت"
      : join([dayList(wish.days), wish.start && wish.end ? `${wish.start} – ${wish.end}` : wish.start]);
    scenes.push(scene("wishes", "رغباتك", [
      { t: "eyebrow", text: "رغباتك" },
      { t: "ring", pct: Math.round((fixed.length / decided) * 100), inside: `${fixed.length} من ${decided}` },
      { t: "rows", items: fixed.slice(0, 3).map(wish => ({ label: wish.course || "موعد", text: whenOf(wish), state: "done" as const })) },
      { t: "cap", text: lines([
        fixed.length === decided
          ? (decided === 1 ? "رغبتك ثُبّتت كما طلبت" : "كل ما قرّر فيه القسم ثُبّت كما طلبت")
          : `ثُبّت ${fixed.length} من ${countOf(decided, AR.wish)} قرّر فيها القسم`,
        pending ? `${countOf(pending, AR.wish)} قيد النظر` : null,
      ]) },
    ]));
  } else if (pending) {
    scenes.push(scene("wishes", "رغباتك", [
      { t: "eyebrow", text: "رغباتك" },
      { t: "big", text: "وصلت القسم", size: "m" },
      { t: "cap", text: `${countOf(pending, AR.wish)} قيد النظر حتى الآن` },
    ]));
  }

  scenes.push(scene("closing", "الختام", [
    { t: "big", text: "فصلاً موفقاً" },
    { t: "rule" },
    { t: "cap", text: lines([join([countOf(week.courses, AR.course), countOf(week.sections, AR.section)]), weekly]) },
    !final && { t: "badge", text: "جدولك حتى الآن · قبل الاعتماد النهائي" },
  ]));

  return { kind: "instructor", final, title: join([input.termName, "فيلمي"]), scenes, generatedAt: (input.now || new Date()).toISOString() };
}

/* ── الطالب ──────────────────────────────────────────────────────────────── */

export interface StudentFilmInput {
  /** الاسمُ الأول كما يظهر في ترحيب «مساري»؛ فارغٌ حين لا اسمَ محفوظاً. */
  firstName: string;
  termName: string;
  sectionName: string;
  planName: string;
  /** تقدّمه في صحيفته كما في بطاقة «مساري» الأولى. */
  progress: { passedCourses: number; totalCourses: number; passedUnits: number; totalUnits: number; remainingUnits: number; percent: number } | null;
  /** المتبقّي له المطروحُ هذا الفصل (لسان «خطتي»). */
  offered: { remaining: number; offered: number; units: number } | null;
  /** رغباته لهذا الفصل وحده. */
  wishes: { courses: number; names: string[]; targetUnits: number; noMorning?: boolean; noAfternoon?: boolean; freeDay?: boolean } | null;
  /** خطّتُه المقترحة الأولى من تذكرته: مقرراتٌ ووحداتٌ ومواعيدُ ما ظهر وقتُه. الدقائقُ من منتصف الليل. */
  plan: { courses: number; units: number; slots: Array<{ day: number; start: number; end: number; course: number; name: string }> } | null;
  now?: Date;
}

/**
 * مدخلُ فيلم الطالب من أجوبة «مساري» نفسها — ملخّصُ ملفّه (`summaryOf`)، و«المطروح»
 * و«التذكرة» كما يعيدهما مساراهما — فلا يُحسب للفيلم رقمٌ لا تعرضه «مساري»، ولا
 * يُقرأ له شيءٌ جديد. الاسمُ الأول وحده من الهوية؛ الرقمُ المدني لا يدخل هنا.
 */
export function studentFilmInputFrom(source: {
  termId: number;
  termName: string;
  summary: {
    sectionName?: string; planName?: string; identity?: { name?: string } | null;
    progress?: StudentFilmInput["progress"];
    wishes?: { termId?: number; targetUnits?: number; courseIds?: number[]; constraints?: { noMorning?: boolean; noAfternoon?: boolean; freeDay?: boolean } } | null;
  };
  offered?: { ready?: boolean; remainingCount?: number; offeredCount?: number; offeredUnits?: number; courses?: Array<{ id?: number; name?: string }> } | null;
  ticket?: { ready?: boolean; plans?: Array<{ units?: number; items?: Array<{ courseId?: number; name?: string; timesVisible?: boolean; slots?: Array<{ day: number; start: number; end: number }> }> }> } | null;
}): StudentFilmInput {
  const { summary, offered, ticket } = source;
  const wishes = summary.wishes && Number(summary.wishes.termId) === Number(source.termId) ? summary.wishes : null;
  const first = ticket?.ready ? ticket.plans?.[0] : undefined;
  const slots = (first?.items || []).flatMap(item => (item.timesVisible ? item.slots || [] : [])
    .filter(slot => Number.isFinite(slot.start) && Number.isFinite(slot.end) && slot.end > slot.start)
    .map(slot => ({ day: Number(slot.day), start: Number(slot.start), end: Number(slot.end), course: Number(item.courseId || 0), name: String(item.name || "").trim() })));
  return {
    firstName: String(summary.identity?.name || "").trim().split(/\s+/)[0] || "",
    termName: source.termName,
    sectionName: String(summary.sectionName || ""),
    planName: String(summary.planName || ""),
    progress: summary.progress || null,
    offered: offered?.ready ? { remaining: Number(offered.remainingCount || 0), offered: Number(offered.offeredCount || 0), units: Number(offered.offeredUnits || 0) } : null,
    wishes: wishes ? {
      courses: (wishes.courseIds || []).length, targetUnits: Number(wishes.targetUnits || 0),
      /* أسماءُ ما اختاره مما بقي له (قائمةُ «المطروح» تحمل أسماء المتبقّي كلِّه): ما لا اسمَ له هناك يُعدّ ولا يُسمّى. */
      names: (wishes.courseIds || []).map(id => String((offered?.ready ? offered.courses || [] : []).find(course => Number(course.id) === Number(id))?.name || "").trim()).filter(Boolean),
      noMorning: wishes.constraints?.noMorning, noAfternoon: wishes.constraints?.noAfternoon, freeDay: wishes.constraints?.freeDay,
    } : null,
    plan: first && slots.length ? { courses: (first.items || []).length, units: Number(first.units || 0), slots } : null,
  };
}

/** فيلمُ الطالب، أو `null` حين لم يكمل ملفَّه بعد (لا صحيفةَ ولا تقدّم). */
export function studentFilm(input: StudentFilmInput): MyFilmData | null {
  const progress = input.progress;
  if (!progress || !progress.totalUnits) return null;
  const scenes: MyFilmScene[] = [
    scene("title", "العنوان", [
      { t: "eyebrow", text: join([input.termName, "فيلمي"]) },
      { t: "big", text: input.firstName ? `أهلاً، ${input.firstName}` : "مساري" },
      { t: "cap", text: lines([input.sectionName, input.planName]) || "رحلتك نحو التخرّج" },
    ]),
    scene("progress", "ما أنجزت", [
      { t: "eyebrow", text: "ما أنجزت" },
      { t: "ring", pct: progress.percent, inside: `${progress.percent}%` },
      { t: "trio", items: [
        { value: progress.passedCourses, label: nounFor(progress.passedCourses, AR.course) },
        { value: progress.passedUnits, label: nounFor(progress.passedUnits, AR.unit) },
      ] },
      { t: "cap", text: progress.remainingUnits
        ? `اجتزتها من ${countOf(progress.totalUnits, AR.unit)} في صحيفتك`
        : "أكملت وحدات صحيفتك كلها" },
    ]),
  ];

  const offered = input.offered;
  if (offered && offered.remaining > 0 && offered.offered > 0) {
    scenes.push(scene("offered", "هذا الفصل", [
      { t: "eyebrow", text: "هذا الفصل" },
      { t: "dots", total: offered.remaining, lit: offered.offered },
      { t: "big", text: countOf(offered.offered, AR.course), size: "m" },
      { t: "cap", text: lines([
        `مطروحة لك من ${countOf(offered.remaining, AR.course)} بقيت في صحيفتك`,
        offered.units ? `مجموعها ${countOf(offered.units, AR.unit)}` : null,
      ]) },
    ]));
  }

  const wishes = input.wishes;
  if (wishes && wishes.courses > 0) {
    const limits = [wishes.noMorning && "بلا صباح", wishes.noAfternoon && "بلا بعد الظهر", wishes.freeDay && "يوم حرّ"].filter(Boolean) as string[];
    scenes.push(scene("mywishes", "رغباتك", [
      { t: "eyebrow", text: "رغباتك" },
      { t: "big", text: countOf(wishes.courses, AR.course), size: "m" },
      wishes.names.length ? { t: "chips", tone: "gold", items: wishes.names.slice(0, 4).concat(wishes.courses > 4 && wishes.names.length >= 4 ? [`و${wishes.courses - 4} غيرها`] : []) } : null,
      { t: "cap", text: lines([
        "اخترتها لهذا الفصل ووصلت قسمك",
        wishes.targetUnits ? `هدفك ${countOf(wishes.targetUnits, AR.unit)}` : null,
      ]) },
      limits.length ? { t: "chips", items: limits } : null,
    ]));
  }

  const plan = input.plan;
  if (plan && plan.slots.length) {
    const days = [...new Set(plan.slots.map(slot => slot.day))].filter(day => day >= 0 && day <= 4);
    const earliest = Math.min(...plan.slots.map(slot => slot.start)), latest = Math.max(...plan.slots.map(slot => slot.end));
    const order = [...new Set(plan.slots.map(slot => slot.course))];
    const toned = plan.slots.filter(slot => slot.day >= 0 && slot.day <= 4).map(slot => ({ ...slot, tone: order.indexOf(slot.course) % MY_FILM_TONES }));
    scenes.push(scene("myweek", "أسبوعك المقترح", [
      { t: "eyebrow", text: "أسبوعك المقترح" },
      { t: "week", from: earliest, to: latest, blocks: toned.map(({ day, start, end, tone }) => ({ day, start, end, tone })),
        legend: legendOf(toned.map(slot => ({ tone: slot.tone, course: slot.name }))) },
      { t: "trio", items: [
        { value: plan.courses, label: nounFor(plan.courses, AR.course) },
        { value: plan.units, label: nounFor(plan.units, AR.unit) },
        { value: days.length, label: nounFor(days.length, AR.day) },
      ] },
      { t: "cap", text: lines([`من ${clockOf(earliest)} إلى ${clockOf(latest)}`, "مقترح فقط، والتسجيل في نظام الجامعة"]) },
    ]));
  }

  scenes.push(scene("closing", "الختام", [
    { t: "big", text: progress.remainingUnits ? "الطريق أمامك" : "مبارك اكتمال صحيفتك" },
    { t: "rule" },
    { t: "cap", text: progress.remainingUnits
      ? lines([`بقي ${countOf(progress.remainingUnits, AR.unit)} حتى التخرّج`, "بالتوفيق"])
      : "بالتوفيق في ما بعد التخرّج" },
  ]));

  return { kind: "student", final: true, title: join([input.termName, "فيلمي"]), scenes, generatedAt: (input.now || new Date()).toISOString() };
}

/* ── النطاقُ الذي يُعتمد فيه جدولُ الأستاذ ─────────────────────────────────── */

/** الأقسامُ (كلية:قسم) التي للأستاذ فيها محاضراتٌ رسمية هذا الفصل: تُسأل عن اعتمادها. */
export function teachingScopes(rows: ReadonlyArray<MyFilmRowLike & { AdCollegeId?: number | string; AdSectionId?: number | string }>, instructorId: number): Array<{ collegeId: number; sectionId: number }> {
  const seen = new Map<string, { collegeId: number; sectionId: number }>();
  for (const row of rows) {
    if (Number(row.AdInstructorId) !== Number(instructorId) || Number(row.id) <= 0) continue;
    const collegeId = Number(row.AdCollegeId || 0), sectionId = Number(row.AdSectionId || 0);
    if (collegeId && sectionId) seen.set(`${collegeId}:${sectionId}`, { collegeId, sectionId });
  }
  return [...seen.values()];
}
