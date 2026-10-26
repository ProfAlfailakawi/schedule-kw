import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { waitForDemoSeed } from "./helpers/demoSeed";
import { placeholderInstructorIds } from "../src/utils/instructorIdentity";
import { reviewInstructorCard } from "./helpers/instructorCardBrowser";
import { generateSyntheticCivilId } from "../src/utils/civilId";

// A real isolated API journey. No production data or cloud identity is used.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "instructor-offering-flow-"));
const port = 3187;
const base = `http://127.0.0.1:${port}`;
let log = "";
const child = spawn("node", ["--import", "tsx", "server.ts"], {
  env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", PORT: String(port), SCHEDULE_PRIVATE_DIR: dir },
  stdio: ["ignore", "pipe", "pipe"], detached: true,
});
child.stdout?.on("data", chunk => { log = (log + chunk).slice(-18000); });
child.stderr?.on("data", chunk => { log = (log + chunk).slice(-18000); });
let cookie = "";
const call = async (method: string, url: string, body?: unknown, publicRoute = false) => {
  const response = await fetch(base + url, { method, headers: { "Content-Type": "application/json", ...(publicRoute ? {} : { cookie }) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => null) as any };
};
const officialRow = async (id: number) => (await call("GET", "/api/schedules?collegeId=1&sectionId=1&termId=1")).body.find((row: any) => row.id === id);
const civilIds = new Set<string>();
const civil = () => {
  let value = generateSyntheticCivilId();
  while (civilIds.has(value)) value = generateSyntheticCivilId();
  civilIds.add(value);
  return value;
};
try {
  let ready = false;
  for (let at = 0; at < 120; at++) {
    try { ready = (await fetch(base + "/api/health")).ok; } catch { /* booting */ }
    if (ready) break;
    if (child.exitCode != null) throw new Error("Isolated server stopped during startup");
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, "isolated server must start");
  const login = await fetch(base + "/api/auth/demo", { method: "POST" });
  cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  assert.equal(login.status, 200);
  await waitForDemoSeed(base, cookie);
  const terms = await call("GET", "/api/terms");
  const term = terms.body.find((term: any) => Number(term.AdTermId) === 1);
  assert.ok(term && !term.AdTermClosed);
  const instructors = await call("GET", "/api/instructors");
  const placeholderIds = placeholderInstructorIds(instructors.body);
  const placeholder = instructors.body.find((person: any) => placeholderIds.has(Number(person.AdInstructorId)));
  assert.ok(placeholder, "demo has an unassigned-faculty identity");
  const courseResult = await call("POST", "/api/courses", { AdCollegeId: 1, AdSectionId: 1, CourseCode: "AVAIL901",
    CourseName: "مقدمة اختبار الإسناد", CourseCredit: 1, CourseHours: 1, MaxStudent: 20 });
  assert.equal(courseResult.status, 201, JSON.stringify(courseResult.body));
  const courseId = courseResult.body.AdCourseId;
  const people = [];
  for (let at = 0; at < 40; at++) {
    const id = civil();
    const result = await call("POST", "/api/instructors", { AdInstructorCivil: id, AdInstructorName: `دكتور اختبار الإسناد ${String(at + 1).padStart(2, "0")}`, AdInstructorMobile: `550${String(at + 1).padStart(5, "0")}` });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    people.push({ ...result.body, civil: id });
  }
  const browserCivil = civil();
  const browserPerson = await call("POST", "/api/instructors", { AdInstructorCivil: browserCivil,
    AdInstructorName: "دكتور اختبار المتصفح", AdInstructorMobile: "55099999999" });
  assert.equal(browserPerson.status, 201, JSON.stringify(browserPerson.body));
  const browserActor = { ...browserPerson.body, civil: browserCivil };
  const scheduleBody = (instructorId: number, section: string, day: string, start: string, selectedCourseId = courseId) => ({
    AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdCourseId: selectedCourseId, AdInstructorId: instructorId, SCode: section,
    fsunday: false, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false, [day]: true,
    fstarttime: start, fendtime: `${start.slice(0, 2)}:50`,
  });
  const createAt = async (instructorId: number, section: string, day: string, start: string, selectedCourseId = courseId) => {
    const body = scheduleBody(instructorId, section, day, start, selectedCourseId);
    const ideas = await call("POST", "/api/schedules/suggest-slots", { ...body, roomOnly: true, durationMinutes: 50 });
    assert.equal(ideas.status, 200);
    const place = ideas.body.slots?.[0];
    assert.ok(place, `fixture needs a real free room at ${day} ${start}: ${JSON.stringify(ideas.body)}`);
    const created = await call("POST", "/api/schedules", { ...body, AdRoomCode: place.room, AdRoomHall: place.hall,
      roomId: place.roomId, buildingId: place.buildingId, locationStatus: "VERIFIED" });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    return created.body;
  };
  const createAnywhere = async (section: string, selectedCourseId: number) => {
    for (const day of fixtureDays) for (let hour = 9; hour <= 16; hour++) {
      const start = `${String(hour).padStart(2, "0")}:00`;
      const body = scheduleBody(placeholder.AdInstructorId, section, day, start, selectedCourseId);
      const ideas = await call("POST", "/api/schedules/suggest-slots", { ...body, roomOnly: true, durationMinutes: 50 });
      for (const place of ideas.body?.slots || []) {
        const created = await call("POST", "/api/schedules", { ...body, AdRoomCode: place.room, AdRoomHall: place.hall,
          roomId: place.roomId, buildingId: place.buildingId, locationStatus: "VERIFIED" });
        if (created.status === 201) return created.body;
      }
    }
    throw new Error(`fixture could not find a free real room for course ${selectedCourseId}`);
  };
  await createAt(people[0].AdInstructorId, "901", "fsunday", "18:00");
  await createAt(people[1].AdInstructorId, "902", "fthursday", "18:00");
  const teacherDays = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"];
  const teacherTimes = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];
  for (let at = 2; at < people.length; at++) {
    await createAt(people[at].AdInstructorId, String(1000 + at), teacherDays[Math.floor(at / teacherTimes.length)], teacherTimes[at % teacherTimes.length]);
  }
  await createAt(browserActor.AdInstructorId, "1099", "ftuesday", "18:00");
  const offered = await createAt(placeholder.AdInstructorId, "903", "fsunday", "19:00");
  const offerings = [offered];
  const fixtureDays = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"];
  for (let at = 1; at < 15; at++) {
    const course = await call("POST", "/api/courses", { AdCollegeId: 1, AdSectionId: 1, CourseCode: `AVAIL${900 + at + 1}`,
      CourseName: `مقرر متاح للاختبار ${String(at + 1).padStart(2, "0")}`, CourseCredit: 1, CourseHours: 1, MaxStudent: 20 });
    assert.equal(course.status, 201, JSON.stringify(course.body));
    offerings.push(await createAnywhere(String(903 + at), course.body.AdCourseId));
    assert.equal(offerings.at(-1).AdCourseId, course.body.AdCourseId);
  }
  const issue = await call("POST", "/api/instructor-requests/issue", { collegeId: 1, sectionId: 1, termId: 1, closesAt: "2027-12-30" });
  assert.equal(issue.status, 200, JSON.stringify(issue.body));
  const cards = await Promise.all([...people, browserActor].map(async person => {
    const link = issue.body.issued.find((entry: any) => entry.instructorId === person.AdInstructorId);
    assert.ok(link);
    const card = await call("GET", `/api/public/request/${link.linkId}`, undefined, true);
    assert.equal(card.status, 200, JSON.stringify(card.body));
    assert.ok(card.body.availableOfferings.some((option: any) => option.id === offered.id), JSON.stringify({ requestedInstructor: person.AdInstructorId, request: card.body.request, options: card.body.availableOfferings, allowedCourse: card.body.courses?.find((c: any) => c.id === courseId), offered }));
    return { ...person, token: link.linkId, card: card.body };
  }));
  assert.ok(offerings.every(option => cards[0].card.availableOfferings.some((available: any) => available.id === option.id)),
    "all fifteen seeded sections appear in the real public card before any claim");
  const fixtureOfferingIds = new Set(offerings.slice(1).map(option => Number(option.id)));
  const send = (card: any, offeringId: number) => call("POST", `/api/public/request/${card.token}`, {
    civil: card.civil, requestRevision: card.card.request.requestRevision || 0,
    items: [...card.card.request.items.map((item: any) => ({ rowId: item.rowId, itemId: item.itemId, action: "keep" })),
      { action: "add", offeringId, courseId, collegeId: 1, sectionId: 1 }],
  }, true);
  const contenders = cards.slice(0, 40);
  const browserCard = cards[40];
  const submitted = await Promise.all(contenders.map(card => send(card, offered.id)));
  assert.equal(submitted.filter(result => result.status === 200).length, 1, JSON.stringify(submitted.map(result => ({ status: result.status, error: result.body?.error }))));
  assert.equal(submitted.filter(result => result.status === 409).length, 39);
  const winnerIndex = submitted.findIndex(result => result.status === 200);
  const winner = contenders[winnerIndex];
  const submittedRequest = submitted[winnerIndex].body.request;
  const loser = contenders[1 - winnerIndex];
  const browserOffering = browserCard.card.availableOfferings.find((option: any) => fixtureOfferingIds.has(Number(option.id))
    && Number(option.id) !== Number(offered.id));
  assert.ok(browserOffering, "a second public choice is available for the browser journey");
  const browserCourse = browserCard.card.courses.find((entry: any) => entry.id === browserOffering.courseId);
  await reviewInstructorCard(base, { token: browserCard.token, civil: browserCard.civil, name: browserCard.AdInstructorName,
    instructorId: browserCard.AdInstructorId }, { id: browserOffering.id, courseName: browserOffering.courseName,
    courseCode: browserCourse?.code || "" }, cookie, cards[0].AdInstructorName);
  assert.equal((await officialRow(offered.id)).AdInstructorId, placeholder.AdInstructorId,
    "submission must never assign the official timetable");
  const refreshed = await call("GET", `/api/public/request/${loser.token}`, undefined, true);
  assert.ok(!refreshed.body.availableOfferings.some((option: any) => option.id === offered.id));
  const index = submittedRequest.items.findIndex((item: any) => item.offeringRowIds?.includes(offered.id));
  const preview = await call("POST", `/api/instructor-requests/${submittedRequest.id}/apply`, { itemIndex: index, preview: true });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal((await officialRow(offered.id)).AdInstructorId, placeholder.AdInstructorId);
  const approval = await call("POST", `/api/instructor-requests/${submittedRequest.id}/apply`, { itemIndex: index });
  assert.equal(approval.status, 200, JSON.stringify(approval.body));
  assert.equal((await officialRow(offered.id)).AdInstructorId, winner.AdInstructorId,
    "department approval assigns the SAME official row immediately");
  assert.equal((await call("POST", `/api/instructor-requests/${submittedRequest.id}/apply`, { itemIndex: index })).status, 409);

  const secondOffering = await createAt(placeholder.AdInstructorId, "950", "fsunday", "17:00");
  loser.card = (await call("GET", `/api/public/request/${loser.token}`, undefined, true)).body;
  const secondSubmission = await send(loser, secondOffering.id);
  assert.equal(secondSubmission.status, 200, JSON.stringify(secondSubmission.body));
  const secondRequest = secondSubmission.body.request;
  const secondIndex = secondRequest.items.findIndex((item: any) => item.offeringRowIds?.includes(secondOffering.id));
  const reject = await call("POST", `/api/instructor-requests/${secondRequest.id}/decide`, {
    itemIndex: secondIndex, state: "rejected", reasonCode: "department", note: "اختبار تحرير الاختيار",
  });
  assert.equal(reject.status, 200, JSON.stringify(reject.body));
  assert.equal((await officialRow(secondOffering.id)).AdInstructorId, placeholder.AdInstructorId);
  const round = await call("POST", "/api/instructor-requests/issue", { collegeId: 1, sectionId: 1, termId: 1, closesAt: "2027-12-30" });
  const nextLink = round.body.issued.find((entry: any) => entry.instructorId === winner.AdInstructorId);
  const nextCard = await call("GET", `/api/public/request/${nextLink.linkId}`, undefined, true);
  assert.ok(nextCard.body.availableOfferings.some((option: any) => option.id === secondOffering.id), "rejection makes the section available to others again");
  console.log("Offering API journey passed: discover, sign, concurrent submit, privacy, preview, immediate assignment, duplicate refusal and release");
} catch (error) {
  console.error(log.slice(-8000));
  throw error;
} finally {
  try { process.kill(-child.pid!, "SIGTERM"); } catch { /* already stopped */ }
}
