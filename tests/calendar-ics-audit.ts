/**
 * ── M3: التقويم يعمل على آيفون وجوجل وأوتلوك ────────────────────────────────
 *
 * مدقّقٌ صارم لـRFC 5545 (بالقدر الذي ترفض عنده تطبيقاتُ التقويم الاشتراك كلَّه):
 * CRLF، طيّ ≤ 75 بايتاً، توازن BEGIN/END، خصائص VEVENT الإلزامية، VTIMEZONE لـAsia/Kuwait،
 * UNTIL بتوقيت UTC مع DTSTART ذي TZID، نهاية بعد البداية، ولا سطر فارغ.
 * ثم المفتاح الثابت للأستاذ، وأزرار Apple/Google/Outlook، وسياجٌ على الصفحات.
 */
import fs from "node:fs";
import { buildCalendar, buildReminder, calendarSubscribeLinks, CALENDAR_LINKS_CLIENT_JS, escapeText } from "../src/utils/icalendar";
import { CALENDAR_FEED_PAUSED_NOTE, calendarFeedKey, instructorFromCalendarKey, personCalendarKey } from "../src/server/calendarSecret";
import { liveCardLinkFor } from "../src/utils/shareLinkLifetime";

let checks = 0;
function ok(condition: unknown, label: string) {
  if (!condition) throw new Error(`✗ ${label}`);
  checks++;
}

/** Returns a list of problems; empty means the file is one every client accepts. */
export function validateIcs(text: string): string[] {
  const problems: string[] = [];
  if (!text.endsWith("\r\n")) problems.push("must end with CRLF");
  if (/[^\r]\n/.test(text)) problems.push("bare LF line ending");
  const physical = text.split("\r\n").slice(0, -1);
  const encoder = new TextEncoder();
  physical.forEach((line, index) => {
    if (encoder.encode(line).length > 75) problems.push(`line ${index + 1} longer than 75 octets`);
    if (!line.length) problems.push(`empty line ${index + 1}`);
  });
  // Unfold.
  const lines: string[] = [];
  for (const line of physical) {
    if (line.startsWith(" ") || line.startsWith("\t")) lines[lines.length - 1] += line.slice(1);
    else lines.push(line);
  }
  if (lines[0] !== "BEGIN:VCALENDAR" || lines[lines.length - 1] !== "END:VCALENDAR") problems.push("not wrapped in VCALENDAR");
  const stack: string[] = [];
  let event: Record<string, string[]> | null = null;
  const tzids = new Set<string>();
  let inTz = false;
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon <= 0) { problems.push(`no name:value in "${line}"`); continue; }
    const head = line.slice(0, colon), value = line.slice(colon + 1);
    const name = head.split(";")[0];
    if (!/^[A-Z][A-Z0-9-]*$/.test(name)) problems.push(`bad property name ${name}`);
    if (name === "BEGIN") { stack.push(value); if (value === "VEVENT") event = {}; if (value === "VTIMEZONE") inTz = true; continue; }
    if (name === "END") {
      if (stack.pop() !== value) problems.push(`unbalanced END:${value}`);
      if (value === "VTIMEZONE") inTz = false;
      if (value === "VEVENT" && event) {
        for (const required of ["UID", "DTSTAMP", "DTSTART"]) if (!event[required]) problems.push(`VEVENT without ${required}`);
        const start = (event.DTSTART || [""])[0], end = (event.DTEND || [""])[0];
        const tz = /TZID=([^;:]+)/.exec(start)?.[1];
        if (tz && !tzids.has(tz)) problems.push(`TZID ${tz} has no VTIMEZONE`);
        const sv = start.split(":").pop() || "", ev = end.split(":").pop() || "";
        if (end && !(ev > sv)) problems.push(`DTEND ${ev} not after DTSTART ${sv}`);
        for (const rule of event.RRULE || []) {
          const r = rule.split(":").pop() || "";
          if (!/^FREQ=WEEKLY;/.test(r)) problems.push(`RRULE not weekly: ${r}`);
          const until = /UNTIL=([^;]+)/.exec(r)?.[1];
          if (until && tz && !/^\d{8}T\d{6}Z$/.test(until)) problems.push(`UNTIL must be UTC with TZID DTSTART: ${until}`);
          if (/UNTIL=/.test(r) && /COUNT=/.test(r)) problems.push("UNTIL and COUNT together");
          const byday = /BYDAY=([^;]+)/.exec(r)?.[1] || "";
          if (byday && !byday.split(",").every(day => /^(SU|MO|TU|WE|TH|FR|SA)$/.test(day))) problems.push(`bad BYDAY ${byday}`);
        }
        event = null;
      }
      continue;
    }
    if (inTz && name === "TZID") tzids.add(value);
    if (event && stack[stack.length - 1] === "VEVENT") (event[name] ||= []).push(line);
  }
  if (stack.length) problems.push(`unclosed ${stack.join(",")}`);
  for (const required of ["VERSION:2.0", "PRODID:"]) if (!lines.some(line => line.startsWith(required))) problems.push(`missing ${required}`);
  return problems;
}

const now = new Date("2026-10-28T09:00:00Z");
const feed = buildCalendar({
  name: "جدول د. أحمد — SCHEDULE, تجربة; طويلة جداً جداً جداً لاختبار الطيّ عبر البايتات العربية",
  weeks: 16, startDate: "2026-09-13", endDate: "2026-12-31", now,
  lectures: [
    { id: 11, title: "TEC 101 · تكنولوجيا التعليم", code: "TEC 101", section: "3", instructor: "د. أحمد", room: "بنين / 2-118", start: "8:00", end: "09:15", days: [0, 2], revision: 3, cancelledDates: ["2026-10-04"] },
    { id: 12, title: "مختبر", start: "10:00:00", end: "12:50", days: [4] },
    // Inverted and impossible ranges must be dropped, never written.
    { id: 13, title: "معكوس", start: "11:00", end: "10:00", days: [1] },
    { id: 14, title: "مستحيل", start: "25:00", end: "26:00", days: [1] },
    { id: 15, title: "بلا أيام", start: "08:00", end: "09:00", days: [] },
  ],
  singles: [{ id: "c1", date: "2026-11-02", start: "13:00", end: "14:15", title: "تغطية: مقرر", room: "قاعة 5" }],
});
ok(validateIcs(feed).length === 0, `valid RFC 5545: ${validateIcs(feed).join(" | ")}`);
ok(feed.includes("BEGIN:VTIMEZONE\r\nTZID:Asia/Kuwait") && feed.includes("TZOFFSETTO:+0300"), "Asia/Kuwait VTIMEZONE");
ok(feed.includes("X-WR-TIMEZONE:Asia/Kuwait") && feed.includes("NAME:") && feed.includes("X-WR-CALNAME:"), "calendar names for Apple/Google/Outlook");
ok(/DTSTART;TZID=Asia\/Kuwait:20260913T080000/.test(feed), "series anchored to the term start, clock normalised (8:00 → 080000)");
ok(/RRULE:FREQ=WEEKLY;UNTIL=20261231T235959Z;BYDAY=SU,TU/.test(feed), "weekly RRULE until the term end");
ok(feed.includes("EXDATE;TZID=Asia/Kuwait:20261004T080000"), "cancelled date removed with matching start time");
ok(feed.includes("LOCATION:بنين / 2-118") && feed.includes("SUMMARY:TEC 101 · تكنولوجيا التعليم"), "location, course name and code");
ok(feed.includes("UID:schedule-11@schedule.app") && feed.includes("SEQUENCE:3"), "stable UID and sequence so updates replace, not duplicate");
ok(/DTSTART;TZID=Asia\/Kuwait:20260917T100000/.test(feed), "HH:MM:SS normalised, Thursday series starts on first Thursday");
ok(!feed.includes("schedule-13@") && !feed.includes("schedule-14@") && !feed.includes("schedule-15@"), "inverted/impossible/dayless rows left out");
ok(feed.includes("UID:schedule-single-c1@schedule.app") && feed.includes("DTSTART;TZID=Asia/Kuwait:20261102T130000"), "single coverage day");

// Without a declared term: bounded by COUNT, still valid.
const loose = buildCalendar({ name: "x", weeks: 2, now, lectures: [{ id: 1, title: "a", start: "08:00", end: "09:00", days: [1, 3] }] });
ok(validateIcs(loose).length === 0 && loose.includes("COUNT=4"), "fallback series bounded by COUNT and valid");

// Masari reminder.
const reminder = buildReminder({ title: "موعد تسجيلي — دور 2 من 3, ملاحظة; مهمة", date: "2026-11-15", note: "سطر1\nسطر2", now });
ok(validateIcs(reminder).length === 0, `valid reminder: ${validateIcs(reminder).join(" | ")}`);
ok(reminder.includes("DTSTART;VALUE=DATE:20261115") && reminder.includes("DTEND;VALUE=DATE:20261116"), "all-day reminder");
ok(reminder.includes("SUMMARY:موعد تسجيلي — دور 2 من 3\\, ملاحظة\\; مهمة") && reminder.includes("DESCRIPTION:سطر1\\nسطر2"), "reminder escaping");
ok(buildReminder({ title: "t", date: "2026-11-15", now }).match(/UID:[^\r]+/)?.[0] === buildReminder({ title: "t", date: "2026-11-15", now: new Date() }).match(/UID:[^\r]+/)?.[0], "reminder UID stable");

// Stable person key.
const secret = "s".repeat(64);
const key = personCalendarKey(secret, 42);
ok(/^p42-[0-9a-f]{32}$/.test(key), "person key shape");
ok(instructorFromCalendarKey(secret, key) === 42 && instructorFromCalendarKey(secret, `${key}.ics`) === 42, "person key verifies, with or without .ics");
ok(instructorFromCalendarKey(secret, key.replace(/.$/, c => (c === "0" ? "1" : "0"))) === 0, "tampered key refused");
ok(instructorFromCalendarKey(secret, key.replace("p42-", "p43-")) === 0, "key cannot be re-pointed to another instructor");
ok(instructorFromCalendarKey("t".repeat(64), key) === 0, "different secret refuses");
ok(personCalendarKey(secret, 42) === key && calendarFeedKey(secret, "tokA", 42) !== calendarFeedKey(secret, "tokB", 42), "person key is independent of the link (link keys are not)");

// ── The stable feed lives while the person holds a live card link (owner decision 2026-10-29). ──
{
  const at = Date.parse("2026-10-28T09:00:00Z");
  const terms: Record<number, { AdTermName: string; AdTermStart: string; AdTermWeeks: number }> = {
    1: { AdTermName: "الأول 2026/2027", AdTermStart: "2026-09-13", AdTermWeeks: 16 }, // running on `at`
    9: { AdTermName: "الثاني 2025/2026", AdTermStart: "2026-02-01", AdTermWeeks: 16 }, // ended before `at`
  };
  const termOf = (id: number) => terms[id] as any;
  const future = "2026-12-31T00:00:00.000Z", past = "2026-10-01T00:00:00.000Z";
  type L = { id: string; kind: string; AdInstructorId?: number; AdTermId: number; revoked?: boolean; expiresAt: string };
  const live = (links: L[], teaches = true) => liveCardLinkFor(links, 42, { termOf, teachesIn: () => teaches, now: at })?.id;
  const personal: L = { id: "p", kind: "staff", AdInstructorId: 42, AdTermId: 1, expiresAt: future };
  const request: L = { id: "r", kind: "request", AdInstructorId: 42, AdTermId: 1, expiresAt: future };
  const department: L = { id: "d", kind: "staff", AdTermId: 1, expiresAt: future };
  ok(live([personal]) === "p" && live([request]) === "r", "own personal link or request card keeps the feed");
  ok(live([department]) === "d" && live([department], false) === undefined, "a department card counts only where the teacher teaches");
  ok(live([{ ...personal, AdInstructorId: 7 }, { ...request, AdInstructorId: 7 }]) === undefined, "a colleague's links never keep someone else's feed");
  ok(live([{ ...department, kind: "department" }, { ...department, kind: "survey" }, { ...department, kind: "students" }]) === undefined, "timetable/survey/students links open no card");
  // Re-issue / renew: the old link is revoked, its replacement is live → the feed continues.
  ok(live([{ ...request, revoked: true }, { ...request, id: "r2" }]) === "r2", "re-issued request card keeps the feed alive");
  ok(live([{ ...department, revoked: true }, { ...department, id: "d2" }]) === "d2", "re-published department card keeps the feed alive");
  // Final revoke: nothing live is left → the feed pauses.
  ok(live([{ ...personal, revoked: true }, { ...request, revoked: true }, { ...department, revoked: true }]) === undefined, "final revoke leaves no live card");
  // Expiry counts, by the card's own lifetime rule (staff/request read until their term ends).
  ok(live([{ ...personal, expiresAt: past }]) === "p", "an expired staff link still reads until its term ends");
  ok(live([{ ...personal, AdTermId: 9, expiresAt: past }, { ...request, AdTermId: 9, expiresAt: past }]) === undefined, "a link whose term has ended is not live");
  ok(liveCardLinkFor([personal], 0, { termOf, now: at }) === undefined, "no instructor, no feed");

  // The paused answer: a valid, empty VCALENDAR with the same name and a description that says it stopped.
  const name = "جدول د. أحمد";
  const paused = buildCalendar({ name, description: CALENDAR_FEED_PAUSED_NOTE, weeks: 16, startDate: "2026-09-13", endDate: "2026-12-31", now, lectures: [], singles: [] });
  const running = buildCalendar({ name, description: "x", weeks: 16, startDate: "2026-09-13", endDate: "2026-12-31", now, lectures: [{ id: 11, title: "TEC 101", start: "08:00", end: "09:15", days: [0, 2] }] });
  const unfold = (text: string) => text.replace(/\r\n[ \t]/g, "");
  ok(validateIcs(paused).length === 0, `paused feed is valid RFC 5545: ${validateIcs(paused).join(" | ")}`);
  ok(!paused.includes("BEGIN:VEVENT") && running.includes("BEGIN:VEVENT"), "paused feed carries no lecture (phones clear them quietly)");
  ok(unfold(paused).includes(`X-WR-CALDESC:${CALENDAR_FEED_PAUSED_NOTE}`) && /توقّف/.test(CALENDAR_FEED_PAUSED_NOTE), "X-WR-CALDESC says the subscription stopped");
  const nameLines = (text: string) => unfold(text).split("\r\n").filter(line => /^(NAME|X-WR-CALNAME):/.test(line)).join("|");
  ok(nameLines(paused) === nameLines(running) && nameLines(paused).includes(name), "same calendar name as the live feed");
  ok(/REFRESH-INTERVAL/.test(paused), "phones keep polling, so it resumes by itself");
}

// Subscribe buttons.
const links = calendarSubscribeLinks("https://schedule.example/api/public/cal/tok/p1-abc.ics?term=3", "جدولي");
ok(links.apple === "webcal://schedule.example/api/public/cal/tok/p1-abc.ics?term=3", "Apple uses webcal://");
ok(links.google.startsWith("https://calendar.google.com/calendar/r?cid=") && decodeURIComponent(links.google.split("cid=")[1]).startsWith("webcal://"), "Google subscribe via cid");
ok(links.outlook.startsWith("https://outlook.live.com/calendar/0/addfromweb?url=https%3A%2F%2F") && links.office.startsWith("https://outlook.office.com/"), "Outlook add-from-web");
const clientFn = new Function(`${CALENDAR_LINKS_CLIENT_JS};return calLinks;`)() as (h: string, n: string) => typeof links;
const client = clientFn("https://schedule.example/api/public/cal/tok/p1-abc.ics?term=3", "جدولي");
ok(client.apple === links.apple && client.google === links.google && client.outlook === links.outlook && client.office === links.office, "browser derivation equals server derivation");

// Page fences: the calendar is visible again, everywhere.
const server = fs.readFileSync("server.ts", "utf8");
const masari = fs.readFileSync("src/server/studentHomePage.ts", "utf8");
ok(!server.includes('document.getElementById("ics").style.display = "none";'), "بطاقتي: calendar button no longer force-hidden");
ok(!server.includes('function calendarHtml(compact){return ""}'), "teacher card: calendar line restored");
ok(server.includes('id="subGoogle"') && server.includes('id="subOutlook"') && server.includes("links.apple"), "بطاقتي: Apple/Google/Outlook buttons");
ok(server.includes('app.get("/api/public/cal/:token/:key"') && server.includes("calendarFeed: await stableCalendarPath(link.id"), "stable personal feed served and handed to the card");
ok(server.includes('app.get("/api/public/ics-reminder"'), "reminder endpoint exists");
ok(masari.includes('location.href="/api/public/ics-reminder?d="') && !/addToCalendar\([^)]*\)\{[^}]*downloadBlob/.test(masari), "مساري: reminder opens a served .ics, not a blob download");
const send = server.slice(server.indexOf("async function sendCalendar"), server.indexOf('app.get("/api/public/ics/:token", '));
ok(send.includes('"text/calendar; charset=utf-8"') && send.includes("inline;") && send.includes("ETag"), "calendar headers: text/calendar utf-8, inline, ETag");
// Owner decision 2026-10-29: the stable feed pauses (200, empty, same name) when no live card is left.
const stable = server.slice(server.indexOf("── الاشتراكُ الثابت (M3)"), server.indexOf("/** رابطُ الاشتراك الثابت لأستاذ، نسبياً للموقع. */"));
ok(stable.includes("await sendInstructorCalendar(req, res, person, { pauseWithoutLiveCard: true });")
  && stable.includes("liveCardLinkFor(await Repository.getShareLinksByInstructor(instructorId), instructorId, { termOf })")
  && stable.includes("staffFamilyShareLinks(Number(row.AdCollegeId), Number(row.AdSectionId), Number(row.AdTermId))"),
  "stable feed asks for a live card: own links, then the department cards where the teacher teaches");
ok(stable.includes("الإيقافُ النهائي") && !stable.includes("لا يُشترط أن يكون الرابطُ حياً"), "the M3 comment states the new rule, not the old promise");
const personFeed = server.slice(server.indexOf("async function sendInstructorCalendar"), server.indexOf("const STAFF_NOTES_PER_DAY"));
ok(personFeed.includes("if (options.pauseWithoutLiveCard && !(await holdsLiveCardLink(Number(person.AdInstructorId), rows, terms))) {")
  && personFeed.includes("await sendCalendar(req, res, calendarName, liveTermId, [], [], CALENDAR_FEED_PAUSED_NOTE);")
  && personFeed.includes("await sendCalendar(req, res, calendarName, liveTermId, rows.map("),
  "paused and live answers share one name and one sender (ETag, headers)");
ok(send.includes("description: pausedNote ? pausedNote :"), "the paused note becomes X-WR-CALDESC");
const legacy = server.slice(server.indexOf('app.get("/api/public/ics/:token/:key"'), server.indexOf("/**\n * ── الاشتراكُ الثابت (M3)"));
ok(legacy.includes("await sendInstructorCalendar(req, res, person);"), "legacy per-link feed keeps its own rule (dies with its link)");
ok(server.includes("ما دامت بطاقتك سارية") && !server.includes('(نهاية الفصل)، ولا يحتاج إعادة إضافة'), "بطاقتي: the subscription note no longer promises the whole term regardless of revoke");

/* CR وحده نهايةُ سطرٍ عند بعض قارئي التقويم: نصٌّ من رابط ‎/api/public/ics-reminder‎
   كان يمرّ به كما هو فيُحقن سطرُ «END:VEVENT» جديد. */
ok(escapeText("A\rEND:VEVENT\rBEGIN:VEVENT") === "A\\nEND:VEVENT\\nBEGIN:VEVENT" && !/[\r\n]/.test(escapeText("a\rb\nc\r\nd")), "escapeText: lone CR is escaped like LF and CRLF");
const injected = buildReminder({ date: "2026-11-02", title: "A\rEND:VEVENT\rBEGIN:VEVENT\rSUMMARY:x", now: new Date("2026-10-28T08:00:00Z") } as any);
ok(validateIcs(injected).length === 0 && injected.split("\r\n").filter(line => line === "BEGIN:VEVENT" || line === "END:VEVENT").length === 2 && !/\r(?!\n)/.test(injected), "reminder with lone CR in its text stays one valid event");

console.log(`calendar-ics-audit: ${checks} checks passed`);
