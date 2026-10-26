import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { waitForDemoSeed } from "./helpers/demoSeed";
import { placeholderInstructorIds } from "../src/utils/instructorIdentity";
import { reviewInstructorCard } from "./helpers/instructorCardBrowser";
import { validateCivilId } from "../src/utils/civilId";

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
const civil = (stem: string) => {
  for (let at = 0; at < 100; at++) for (let digit = 0; digit < 10; digit++) {
    const value = String(Number(stem) + at * 100) + digit;
    if (validateCivilId(value).isValid) return value;
  }
  throw new Error("Invalid fixture civil id");
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
  for (const [at, stem] of ["29001010001", "29001010002"].entries()) {
    const result = await call("POST", "/api/instructors", { AdInstructorCivil: civil(stem), AdInstructorName: `دكتور اختبار الإسناد ${at + 1}`, AdInstructorMobile: `5500000${at + 1}` });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    people.push({ ...result.body, civil: civil(stem) });
  }
  const scheduleBody = (instructorId: number, section: string, day: string, start: string) => ({
    AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdCourseId: courseId, AdInstructorId: instructorId, SCode: section,
    fsunday: false, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false, [day]: true,
    fstarttime: start, fendtime: `${start.slice(0, 2)}:50`,
  });
  const createAt = async (instructorId: number, section: string, day: string, start: string) => {
    const body = scheduleBody(instructorId, section, day, start);
    const ideas = await call("POST", "/api/schedules/suggest-slots", { ...body, roomOnly: true, durationMinutes: 50 });
    assert.equal(ideas.status, 200);
    const place = ideas.body.slots?.[0];
    assert.ok(place, `fixture needs a real free room at ${day} ${start}: ${JSON.stringify(ideas.body)}`);
    const created = await call("POST", "/api/schedules", { ...body, AdRoomCode: place.room, AdRoomHall: place.hall,
      roomId: place.roomId, buildingId: place.buildingId, locationStatus: "VERIFIED" });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    return created.body;
  };
  await createAt(people[0].AdInstructorId, "901", "fsunday", "18:00");
  await createAt(people[1].AdInstructorId, "902", "fthursday", "18:00");
  const offered = await createAt(placeholder.AdInstructorId, "903", "fsunday", "19:00");
  const issue = await call("POST", "/api/instructor-requests/issue", { collegeId: 1, sectionId: 1, termId: 1, closesAt: "2027-12-30" });
  assert.equal(issue.status, 200, JSON.stringify(issue.body));
  const cards = [];
  for (const person of people) {
    const link = issue.body.issued.find((entry: any) => entry.instructorId === person.AdInstructorId);
    assert.ok(link);
    const card = await call("GET", `/api/public/request/${link.linkId}`, undefined, true);
    assert.equal(card.status, 200, JSON.stringify(card.body));
    assert.ok(card.body.availableOfferings.some((option: any) => option.id === offered.id), JSON.stringify({ requestedInstructor: person.AdInstructorId, request: card.body.request, options: card.body.availableOfferings, allowedCourse: card.body.courses?.find((c: any) => c.id === courseId), offered }));
    cards.push({ ...person, token: link.linkId, card: card.body });
  }
  await reviewInstructorCard(base, cards[0], offered.id);
  const send = (card: any, offeringId: number) => call("POST", `/api/public/request/${card.token}`, {
    civil: card.civil, requestRevision: card.card.request.requestRevision || 0,
    items: [...card.card.request.items.map((item: any) => ({ rowId: item.rowId, itemId: item.itemId, action: "keep" })),
      { action: "add", offeringId, courseId, collegeId: 1, sectionId: 1 }],
  }, true);
  const submitted = await Promise.all(cards.map(card => send(card, offered.id)));
  assert.equal(submitted.filter(result => result.status === 200).length, 1, JSON.stringify(submitted.map(result => ({ status: result.status, error: result.body?.error }))));
  assert.equal(submitted.filter(result => result.status === 409).length, 1);
  const winnerIndex = submitted.findIndex(result => result.status === 200);
  const winner = cards[winnerIndex];
  const submittedRequest = submitted[winnerIndex].body.request;
  assert.equal((await officialRow(offered.id)).AdInstructorId, placeholder.AdInstructorId,
    "submission must never assign the official timetable");
  const loser = cards[1 - winnerIndex];
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

  const secondOffering = await createAt(placeholder.AdInstructorId, "904", "fsunday", "17:00");
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
