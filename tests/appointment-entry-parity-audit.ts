import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nextCourseSectionCode } from "../src/utils/nextCourseSectionCode";

const read = (file: string) => readFileSync(file, "utf8");
const schedule = read("src/components/Schedules.tsx");
const inbox = read("src/components/InstructorInbox.tsx");
const quick = read("src/components/QuickCreatePopover.tsx");
const handoff = read("src/utils/requestHandoff.ts");
const server = read("server.ts");
const wheels = read("src/components/TimeCounter.tsx");

const sample = [
  { id: 1, AdCourseId: 2, AdTermId: 10, SCode: "501" },
  { id: 2, AdCourseId: 2, AdTermId: 10, SCode: "503" },
  { id: 3, AdCourseId: 2, AdTermId: 9, SCode: "700" },
  { id: 4, AdCourseId: 3, AdTermId: 10, SCode: "999" },
  { id: 5, AdCourseId: 2, AdTermId: 10, SCode: "01" },
];
assert.equal(nextCourseSectionCode(sample, 2, 10), "504");
assert.equal(nextCourseSectionCode(sample, 2, 10, 2), "502");
assert.equal(nextCourseSectionCode([], 2, 10), "501");
assert.equal(nextCourseSectionCode(sample, 2, 9), "701");
assert.match(schedule, /nextCourseSectionCode\(rows, courseId, termId, excludeId\)/);
assert.match(inbox, /nextCourseSectionCode\(currentRows\.values\(\), courseId, Number\(termId\)\)/);

for (const key of ["scode", "buildingId", "roomId", "room", "hall", "locationStatus"]) {
  assert.ok(handoff.includes(`${key}?:`), `handoff loses ${key}`);
  assert.ok(inbox.includes(`${key}: draft.${key}`), `inbox expansion loses ${key}`);
}
assert.match(schedule, /setForm\(current => \(\{[\s\S]*?handoff\.scode/);
assert.match(inbox, /fixedSlots: slots\.map/);
assert.match(quick, /hasDifferentTimes[\s\S]*?<TimeWheels/);
assert.match(quick, /disabled=\{hasDifferentTimes\}/);
assert.match(quick, /\/api\/schedules\/check-conflicts/);
assert.match(quick, /result\.validationIssues/);
assert.match(quick, /conflicts\.filter\(isBlockingConflict\)/);
assert.match(quick, /fetchSuggestions\(suggestionBody\(payload/);
assert.match(read("src/utils/suggestionClient.ts"), /\/api\/schedules\/suggest-slots/);
assert.match(quick, /pendingCheck \|\| blocked \|\| checkFailed/);
{
  const checkRoute = server.slice(server.indexOf('app.post("/api/schedules/check-conflicts"'), server.indexOf('app.post("/api/schedules/check-conflicts"') + 2200);
  assert.match(checkRoute, /schedulePayloadIssues\(row\)/);
  assert.match(checkRoute, /scheduleLengthIssue\(\{\.\.\.row/);
  assert.match(checkRoute, /checkLocationIssues\(row\)/);
  assert.match(checkRoute, /await Promise\.all\(\[/, "check-conflicts runs its independent reads in parallel");
}
assert.match(server, /return borrowingRequired && !borrowCovers\(String\(hall\.roomId\),day,from,to\)/);
assert.match(wheels, /Math\.min\(maximum, clamped \+ span\)/);

console.log("Appointment-entry parity: shared section codes, live checks, handoff, multi-time safety, borrowed-room windows, duration ✓");
