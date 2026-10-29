/**
 * ── التقويمُ العام (ICS) ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { Request, Response } from "express";
import { createHmac } from "crypto";
import { Repository } from "../../db/repository";
import { currentTermId, termPhase } from "../../utils/termSequence";
import type { FSchedule } from "../../types";
import { CALENDAR_FEED_PAUSED_NOTE, calendarFeedKey, instructorFromCalendarKey } from "../calendarSecret";
import { liveCardLinkFor } from "../../utils/shareLinkLifetime";
import { AR, countOf } from "../../utils/arabicCount";
import { buildCalendar, buildReminder, calendarSpanForTerm, type CalendarLecture, type CalendarSingle } from "../../utils/icalendar";
import { buildSharePayload, calendarSecret, resolveShareToken, shareDayIndexes } from "../core/shareLinks";
import { staffFamilyShareLinks } from "../core/staffCard";

/**
 * A term's length is not recorded anywhere in this system — terms carry a name
 * and nothing else — so the series has to be given a length, and the honest
 * thing is to name the number in one place rather than bury it in a string.
 */
/* Used only when a term has no recorded length. Sixteen weeks is a common
   Kuwaiti semester and it is still a guess — which is why the feed labels
   itself when it is guessing. */
const TERM_WEEKS = 16;

/**
 * Sends a calendar, with the headers that make a browser show a subscription.
 *
 * A subscribed feed is re-read by every phone that holds it, several times a
 * day, forever. Almost every one of those reads finds a file identical to the
 * last, so the response carries an ETag: an unchanged week costs a 304 and no
 * body at all. That is the difference between a feed a department can hand to
 * four hundred people and one it cannot.
 */
async function sendCalendar(req: Request, res: Response, name: string, termId: number, lectures: CalendarLecture[], singles: CalendarSingle[] = [], pausedNote = "") {
  const term = (await Repository.getTerms()).find(row => row.AdTermId === termId);
  /* حدّا الفصل من ‎termWindow‎ (المعلَن، وإلا المستنبط من اسم الفصل)؛ «اليوم»
     لم يعد مرساةً إلا لفصلٍ لا يُعرف عنه شيء — ويقول الملف ذلك. */
  const span = calendarSpanForTerm(term, Number(term?.AdTermWeeks) || TERM_WEEKS);
  const startDate = span.startDate;
  const weeks = span.weeks;
  // Opt-in only, and named in the URL so the subscriber's own choice travels
  // with their subscription instead of being decided for everyone.
  const alarmMinutes = Math.max(0, Math.min(120, Number(req.query.alarm || 0)));

  const body = buildCalendar({
    // A calendar that had to guess its own term says so in the name it puts on
    // the subscriber's phone, rather than presenting an invented semester as if
    // it were the registrar's.
    name: span.source === "declared" ? name : span.source === "default" ? `${name} (تواريخ الفصل تقديرية)` : `${name} (تواريخ الفصل غير مسجّلة)`,
    /* اشتراكٌ ثابتٌ توقّف (لا بطاقةَ حيّة): الاسمُ نفسُه، والوصفُ يقول ذلك. */
    description: pausedNote ? pausedNote : span.source === "declared"
      ? `${term?.AdTermName || ""} · يبدأ ${startDate} ويستمر ${countOf(weeks, AR.week)} · للقراءة فقط، ويُحدَّث من نفسه.`
      : span.source === "default"
        ? `${term?.AdTermName || ""} · تواريخ الفصل غير مسجّلة؛ الحدّان تقديريان من اسم الفصل (${span.startDate} ← ${span.endDate}) · للقراءة فقط.`
        : `${term?.AdTermName || ""} · تواريخ الفصل غير مسجّلة، والمدة تقديرية (${countOf(weeks, AR.week)}) · للقراءة فقط.`,
    weeks, startDate, endDate: span.source === "default" ? span.endDate : undefined, alarmMinutes, lectures, singles,
  });

  /* Weak, because the only thing that must match is the meaning of the file:
     DTSTAMP moves on every build and would defeat a strong comparison for no
     reason. Hashing the body without its stamps is what makes the tag stable. */
  const tag = `W/"${createHmac("sha256", "ics").update(body.replace(/^DTSTAMP:.*$/gm, "")).digest("hex").slice(0, 24)}"`;
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `inline; filename="schedule.ics"`);
  res.setHeader("ETag", tag);
  // Re-validate every time, but let the tag decide whether a body is needed.
  res.setHeader("Cache-Control", "no-cache, must-revalidate");
  if (req.headers["if-none-match"] === tag) { res.status(304).end(); return; }
  res.send(body);
}

/** هل بيد الأستاذ رابطُ بطاقةٍ حيّ؟ القاعدةُ كلُّها في liveCardLinkFor؛ هنا قراءةُ الروابط:
 *  ما يحمل رقمَه (الشخصيةُ وروابطُ الطلب) باستعلامٍ واحد، ثم بطاقةُ القسم العامة لعائلة
 *  كل قسمٍ يدرّس فيه في فصل التقويم (‎ownRows‎). */
async function holdsLiveCardLink(instructorId: number, ownRows: FSchedule[], terms: Awaited<ReturnType<typeof Repository.getTerms>>): Promise<boolean> {
  const termOf = (termId: number) => terms.find(term => Number(term.AdTermId) === termId) as any;
  if (liveCardLinkFor(await Repository.getShareLinksByInstructor(instructorId), instructorId, { termOf })) return true;
  const scopes = new Map(ownRows.map(row => [`${row.AdCollegeId}:${row.AdSectionId}:${row.AdTermId}`, row]));
  const departmentCards = (await Promise.all([...scopes.values()].map(row =>
    staffFamilyShareLinks(Number(row.AdCollegeId), Number(row.AdSectionId), Number(row.AdTermId))))).flat();
  return Boolean(liveCardLinkFor(departmentCards, instructorId, { termOf, teachesIn: () => true }));
}

/** جدول الأستاذ في الفصل الجاري (أو القادم المثبّت بـ‎?term=‎) ملفَّ تقويم. */
async function sendInstructorCalendar(req: Request, res: Response, person: { AdInstructorId: number; AdInstructorName?: string }, options: { pauseWithoutLiveCard?: boolean } = {}) {
  const [courses, terms, colleges] = await Promise.all([
    Repository.getCourses(), Repository.getTerms(), Repository.getColleges(),
  ]);

  /* الاشتراكُ يتبع الفصل الجاري. ومن أضافه من بطاقة فصلٍ قادم يحمل رقمَه في
     الرابط، فيرى ذلك الفصل حتى يصير هو الجاري — ولا يُفتح به فصلٌ انقضى. */
  const pinnedTerm = terms.find(row => Number(row.AdTermId) === Number(req.query.term || 0));
  const liveTermId = pinnedTerm && termPhase(pinnedTerm as any, currentTermId(terms as any)) === "upcoming"
    ? Number(pinnedTerm.AdTermId)
    : currentTermId(terms as any);
  if (!liveTermId) {
    res.status(409).type("text/plain; charset=utf-8").send("لا يوجد فصل جارٍ متاح للتقويم");
    return;
  }
  const termRows = await Repository.getSchedulesByScope({ termId: liveTermId });
  const rows = termRows.filter(row => row.AdInstructorId === person.AdInstructorId);
  const calendarName = `جدول ${person.AdInstructorName || "الأستاذ"}`;
  /* الاشتراكُ الثابت بلا بطاقةٍ حيّة: تقويمٌ صالحٌ فارغ بالاسم نفسه، ووصفُه يقول إنه توقّف. */
  if (options.pauseWithoutLiveCard && !(await holdsLiveCardLink(Number(person.AdInstructorId), rows, terms))) {
    await sendCalendar(req, res, calendarName, liveTermId, [], [], CALENDAR_FEED_PAUSED_NOTE);
    return;
  }
  const courseById = new Map(courses.map(row => [row.AdCourseId, row]));
  const collegeById = new Map(colleges.map(row => [Number(row.AdCollegeId), row]));

  /* The personal feed follows the person, not the paper: a date they are absent
     from (cancelled, or handed to a colleague) leaves THEIR calendar, and a
     date they cover for someone else enters it as a single day. */
  const exceptions = await Repository.getScheduleWeekExceptions(liveTermId);
  const goneDates = new Map<number, string[]>();
  for (const entry of exceptions) {
    if (!goneDates.has(entry.scheduleId)) goneDates.set(entry.scheduleId, []);
    goneDates.get(entry.scheduleId)!.push(entry.date);
  }
  const rowById = new Map(termRows.map(row => [Number(row.id), row]));
  const coverSingles = exceptions
    .filter(entry => entry.kind === "cover" && Number(entry.coverInstructorId) === person.AdInstructorId)
    .map(entry => {
      const covered = rowById.get(Number(entry.scheduleId));
      if (!covered) return null;
      const course = courseById.get(covered.AdCourseId);
      return {
        id: entry.id,
        date: entry.date,
        start: covered.fstarttime, end: covered.fendtime,
        title: `تغطية: ${covered.AdCourseName || course?.CourseName || "محاضرة"}${covered.SCode ? ` · شعبة ${covered.SCode}` : ""}`,
        room: [collegeById.get(Number(covered.AdCollegeId))?.AdCollegeName, covered.AdRoomCode, covered.AdRoomHall].filter(Boolean).join(" / "),
        description: "تغطية ليوم واحد بطلب من القسم.",
      };
    })
    .filter(Boolean) as CalendarSingle[];

  await sendCalendar(req, res, calendarName, liveTermId, rows.map(row => {
    const course = courseById.get(row.AdCourseId);
    return {
      id: row.id,
      title: [course?.CourseCode, row.AdCourseName || course?.CourseName].filter(Boolean).join(" · "),
      code: course?.CourseCode || "", section: row.SCode || "",
      room: [collegeById.get(Number(row.AdCollegeId))?.AdCollegeName, row.AdRoomCode, row.AdRoomHall].filter(Boolean).join(" / "),
      start: row.fstarttime, end: row.fendtime,
      days: shareDayIndexes(row), revision: Number(row.rev || 0),
      cancelledDates: goneDates.get(Number(row.id)),
    };
  }), coverSingles);
}

export function registerPublicCalendarRoutes(app: Express): void {

// --- Public surface (no account) --------------------------------------------

app.get("/api/public/schedule/:token", async (req: Request, res: Response) => {
  const resolved = await resolveShareToken(String(req.params.token));
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }
  // A staff link is a door to one card, never to the department's whole feed.
  if (resolved.link.kind === "staff") { res.status(404).json({ error: "هذا الرابط بطاقة أستاذ" }); return; }
  /* A student survey link opens the survey and the student's status — never
     the department's timetable. */
  if (resolved.link.kind === "survey") { res.status(404).json({ error: "هذا الرابط استبيان للطلبة" }); return; }
  /* رابطُ جدول الطلبة يقرأ المعتمدَ وحده من بابه (/api/public/students). */
  if (resolved.link.kind === "students") { res.status(404).json({ error: "هذا الرابط جدول الطلبة" }); return; }
  void Repository.touchShareLink(resolved.link.id).catch(() => undefined);
  res.setHeader("Cache-Control", "no-store");
  res.json(await buildSharePayload(resolved.link));
});

app.get("/api/public/ics/:token", async (req: Request, res: Response) => {
  const resolved = await resolveShareToken(String(req.params.token));
  if ("error" in resolved) { res.status(resolved.status).type("text/plain; charset=utf-8").send(resolved.error); return; }
  if (resolved.link.kind === "staff" || resolved.link.kind === "survey" || resolved.link.kind === "students") { res.status(404).type("text/plain; charset=utf-8").send("Not found"); return; }
  const payload = await buildSharePayload(resolved.link);
  void Repository.touchShareLink(resolved.link.id).catch(() => undefined);
  /* A lecture cancelled on one specific date disappears from that one date in
     every subscribed phone — this is the feed "speaking by itself". A covered
     date stays: the class still happens for its students. */
  const exceptions = await Repository.getScheduleWeekExceptions(Number(resolved.link.AdTermId));
  const cancelledBySchedule = new Map<number, string[]>();
  for (const entry of exceptions) {
    if (entry.kind !== "cancel") continue;
    if (!cancelledBySchedule.has(entry.scheduleId)) cancelledBySchedule.set(entry.scheduleId, []);
    cancelledBySchedule.get(entry.scheduleId)!.push(entry.date);
  }
  await sendCalendar(req, res, payload.label || "الجدول الدراسي", resolved.link.AdTermId, payload.rows.map(row => ({
    id: row.id,
    title: [row.code, row.name].filter(Boolean).join(" · "),
    code: row.code, section: row.section, instructor: row.instructor, instructorVisiting: row.visiting,
    room: [row.room, row.hall].filter(Boolean).join(" / "),
    start: row.start, end: row.end, days: row.days, revision: row.rev,
    cancelledDates: cancelledBySchedule.get(Number(row.id)),
  })));
});

app.get("/api/public/ics/:token/:key", async (req: Request, res: Response) => {
  const token = String(req.params.token || "");
  const resolved = await resolveShareToken(token);
  if ("error" in resolved) { res.status(resolved.status).type("text/plain; charset=utf-8").send(resolved.error); return; }

  const instructors = await Repository.getInstructors();
  // The key names the instructor: whoever it verifies against is the owner.
  const secret = await calendarSecret();
  const person = instructors.find(row => calendarFeedKey(secret, token, row.AdInstructorId) === String(req.params.key || ""));
  if (!person) { res.status(404).type("text/plain; charset=utf-8").send("Not found"); return; }
  void Repository.touchShareLink(resolved.link.id).catch(() => undefined);
  await sendInstructorCalendar(req, res, person);
});

/**
 * ── الاشتراكُ الثابت (M3) — يتبع الأستاذَ ما دامت بيده بطاقةٌ حيّة ───────────────
 * ‎/api/public/cal/<رمز البطاقة>/p<رقم>-<مفتاح>.ics‎ — المفتاحُ للأستاذ لا للرابط
 * (src/server/calendarSecret.ts)، فإعادةُ نشر البطاقة أو تجديدُها (رابطٌ جديد يحلّ
 * محلّ القديم) لا تقطع اشتراكاتِ الهواتف. أما الإيقافُ النهائي — لم يبقَ بيده رابطُ
 * بطاقةٍ حيّ: شخصيٌّ، أو رابطُ طلبه، أو بطاقةُ قسمٍ يدرّس فيه؛ غيرُ موقوفٍ ومقروءٌ الآن
 * فالانتهاءُ يُحتسب (liveCardLinkFor في src/utils/shareLinkLifetime.ts) — فيُوقفه:
 * 200 بتقويمٍ صالحٍ فارغ بالاسم نفسه ووصفٍ يقول إنه توقّف، فتُمسح المحاضراتُ من الهاتف
 * بهدوء بدل خطأٍ يُبقيها، ويعود وحده متى صدرت له بطاقةٌ جديدة (قرار المالك 2026-10-29).
 * ورمزُ البطاقة في المسار يربط الطلبَ بصندوق الديمو وحده؛ لا يُشترط أن يكون هو حياً.
 */
app.get("/api/public/cal/:token/:key", async (req: Request, res: Response) => {
  const id = instructorFromCalendarKey(await calendarSecret(), String(req.params.key || ""));
  const person = id ? (await Repository.getInstructors()).find(row => Number(row.AdInstructorId) === id) : undefined;
  if (!person) { res.status(404).type("text/plain; charset=utf-8").send("Not found"); return; }
  await sendInstructorCalendar(req, res, person, { pauseWithoutLiveCard: true });
});

/**
 * ── تذكيرٌ ليومٍ واحد (مساري) ──────────────────────────────────────────────
 * كان يُولَّد Blob في الجهاز ويُنزَّل بـ‎a.download‎ — وسفاري آيفون يحفظه في
 * «الملفات» (أو لا يفعل شيئاً في وضع التطبيق المثبّت) ولا يفتح التقويم. ملفٌّ
 * يُخدَم من الخادم بـ‎text/calendar‎ «inline» يفتح نافذة «أضف إلى التقويم».
 * نصٌّ عامٌّ قصير (موعد دور التسجيل) — لا اسمَ ولا رقمَ في الرابط.
 */
app.get("/api/public/ics-reminder", (req: Request, res: Response) => {
  const date = String(req.query.d || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) { res.status(400).type("text/plain; charset=utf-8").send("bad date"); return; }
  const body = buildReminder({ title: String(req.query.t || "تذكير").slice(0, 120), date, note: String(req.query.n || "").slice(0, 300) });
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", req.query.dl ? 'attachment; filename="masari.ics"' : 'inline; filename="masari.ics"');
  res.setHeader("Cache-Control", "no-store");
  res.send(body);
});
}
