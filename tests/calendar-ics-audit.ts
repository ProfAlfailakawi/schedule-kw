/**
 * ── M3: التقويم يعمل على آيفون وجوجل وأوتلوك ────────────────────────────────
 *
 * مدقّقٌ صارم لـRFC 5545 (بالقدر الذي ترفض عنده تطبيقاتُ التقويم الاشتراك كلَّه):
 * CRLF، طيّ ≤ 75 بايتاً، توازن BEGIN/END، خصائص VEVENT الإلزامية، VTIMEZONE لـAsia/Kuwait،
 * UNTIL بتوقيت UTC مع DTSTART ذي TZID، نهاية بعد البداية، ولا سطر فارغ.
 * ثم المفتاح الثابت للأستاذ، وأزرار Apple/Google/Outlook، وسياجٌ على الصفحات.
 */
import fs from "node:fs";
import { buildCalendar, buildReminder, calendarSubscribeLinks, CALENDAR_LINKS_CLIENT_JS } from "../src/utils/icalendar";
import { calendarFeedKey, instructorFromCalendarKey, personCalendarKey } from "../src/server/calendarSecret";
import { readServerSource } from "./helpers/serverSource.mjs";

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

// Subscribe buttons.
const links = calendarSubscribeLinks("https://schedule.example/api/public/cal/tok/p1-abc.ics?term=3", "جدولي");
ok(links.apple === "webcal://schedule.example/api/public/cal/tok/p1-abc.ics?term=3", "Apple uses webcal://");
ok(links.google.startsWith("https://calendar.google.com/calendar/r?cid=") && decodeURIComponent(links.google.split("cid=")[1]).startsWith("webcal://"), "Google subscribe via cid");
ok(links.outlook.startsWith("https://outlook.live.com/calendar/0/addfromweb?url=https%3A%2F%2F") && links.office.startsWith("https://outlook.office.com/"), "Outlook add-from-web");
const clientFn = new Function(`${CALENDAR_LINKS_CLIENT_JS};return calLinks;`)() as (h: string, n: string) => typeof links;
const client = clientFn("https://schedule.example/api/public/cal/tok/p1-abc.ics?term=3", "جدولي");
ok(client.apple === links.apple && client.google === links.google && client.outlook === links.outlook && client.office === links.office, "browser derivation equals server derivation");

// Page fences: the calendar is visible again, everywhere.
const server = readServerSource();
const masari = fs.readFileSync("src/server/studentHomePage.ts", "utf8");
ok(!server.includes('document.getElementById("ics").style.display = "none";'), "بطاقتي: calendar button no longer force-hidden");
ok(!server.includes('function calendarHtml(compact){return ""}'), "teacher card: calendar line restored");
ok(server.includes('id="subGoogle"') && server.includes('id="subOutlook"') && server.includes("links.apple"), "بطاقتي: Apple/Google/Outlook buttons");
ok(server.includes('app.get("/api/public/cal/:token/:key"') && server.includes("calendarFeed: await stableCalendarPath(link.id"), "stable personal feed served and handed to the card");
ok(server.includes('app.get("/api/public/ics-reminder"'), "reminder endpoint exists");
ok(masari.includes('location.href="/api/public/ics-reminder?d="') && !/addToCalendar\([^)]*\)\{[^}]*downloadBlob/.test(masari), "مساري: reminder opens a served .ics, not a blob download");
const send = server.slice(server.indexOf("async function sendCalendar"), server.indexOf('app.get("/api/public/ics/:token", '));
ok(send.includes('"text/calendar; charset=utf-8"') && send.includes("inline;") && send.includes("ETag"), "calendar headers: text/calendar utf-8, inline, ETag");

console.log(`calendar-ics-audit: ${checks} checks passed`);
