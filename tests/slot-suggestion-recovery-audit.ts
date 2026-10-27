import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eligibleSuggestionEditId, instructorRowsForSuggestion } from "../src/utils/slotSuggestionScope";

const rows = [
  { id: 17, AdCollegeId: 2, AdSectionId: 3, AdTermId: 9, AdCourseId: 5, SCode: "101" },
  { id: 18, AdCollegeId: 2, AdSectionId: 3, AdTermId: 9, AdCourseId: 5, SCode: "101" },
  { id: 19, AdCollegeId: 2, AdSectionId: 7, AdTermId: 9 },
];
const editId = eligibleSuggestionEditId(rows, 17, 2, 3, 9);
assert.equal(editId, 17, "The official row under edit must be excluded once, not counted as a separate appointment.");
assert.equal(rows.filter(row => row.id !== editId && row.AdCourseId === 5).length, 1);
assert.equal(eligibleSuggestionEditId(rows, 17, 2, 7, 9), 0, "Cannot exclude another department's appointment.");
assert.equal(eligibleSuggestionEditId(rows, 17, 2, 3, 8), 0, "Cannot exclude another term's appointment.");
assert.equal(eligibleSuggestionEditId(rows, 9999, 2, 3, 9), 0, "Cannot forge an edit of an unknown row.");
assert.equal(eligibleSuggestionEditId(rows, 0, 2, 3, 9), 0, "Creation does not exclude an existing row.");

const server = readFileSync("server.ts", "utf8");
const route = server.slice(server.indexOf('app.post("/api/schedules/suggest-slots"'));
assert.match(route, /const editedRowId = eligibleSuggestionEditId\(universe, excludeId, collegeId, sectionId, termId\)/);
assert.match(route, /Number\(row.id\) !== editedRowId/);
assert.match(route, /id:editedRowId, fstarttime:clock\(sampleStart\)/);
assert.match(route, /\},universe\);/);
assert.match(route, /rowOccupiesRoom\(row, hall.roomId, hall.room, hall.hall\)/);
assert.match(route, /if \(busy\(hallRows, dayKey, start, end\)\)/);
assert.match(route, /if \(instructorId && busy\(instructorRows, dayKey, start, end\)\)/);
const editor = readFileSync("src/components/Schedules.tsx", "utf8");
const quick = readFileSync("src/components/QuickCreatePopover.tsx", "utf8");
const styles = readFileSync("src/styles/05-schedule.css", "utf8");
assert.match(editor, /roomIdeasNote \|\| "لا توجد قاعة/);
assert.match(editor, /slotIdeasNote \|\| "لا توجد خانة/);
assert.match(editor, /currentSuggestionKey\.current !== requestedKey/);
assert.match(quick, /latestIdeasKey\.current !== requestedKey/);

// A placeholder is shared across a department; its other classes are NOT this instructor's conflicts.
const occupancyRows = [
  { AdInstructorId: 950, roomId: "r-1", fstarttime: "08:00", fendtime: "09:00", fsunday: true },
  { AdInstructorId: 950, roomId: "r-2", fstarttime: "08:00", fendtime: "09:00", fsunday: true },
  { AdInstructorId: 21, roomId: "r-3", fstarttime: "08:00", fendtime: "09:00", fsunday: true },
];
const faculty = { AdInstructorId: 950, AdInstructorName: "هيئة تدريسية" };
const person = { AdInstructorId: 21, AdInstructorName: "أحمد الأستاذ" };
assert.deepEqual(instructorRowsForSuggestion(occupancyRows, 950, faculty), [], "Shared faculty placeholder cannot block rooms or every time in a term.");
assert.equal(instructorRowsForSuggestion(occupancyRows, 21, person).length, 1, "Real instructor conflicts remain enforced.");
assert.equal(instructorRowsForSuggestion(occupancyRows, 950, null).length, 2, "Missing identity never bypasses a real instructor booking.");
assert.equal(instructorRowsForSuggestion(occupancyRows, 950, person).length, 2, "A mismatched identity never grants a bypass.");
assert.equal(instructorRowsForSuggestion(occupancyRows, 0, null).length, 0, "New appointments without a teacher do not inherit another person's bookings.");

const advisorRoute = server.slice(server.indexOf('app.post("/api/schedules/suggest-slots"'), server.indexOf("/* ── استثناءات الأسبوع"));
assert.match(advisorRoute, /instructorRowsForSuggestion\(live, instructorId, instructor\)/);
assert.match(advisorRoute, /instructorId \? Repository\.getInstructorById\(instructorId\)/);
assert.match(advisorRoute, /scheduleConflicts\(conflictReq, \{ \.\.\.candidate, \.\.\.location\.check\.canonical \}, editedRowId\)/,
  "Suggestions must pass the same central conflict gate used by appointment saves.");
assert.match(editor, /<RoomSuggestionCards suggestions=\{roomIdeas\}/);
assert.match(quick, /ideaKind === "room" \? <RoomSuggestionCards/);
assert.match(styles, /\.quick-create\{[^}]*max-height:calc\(100dvh - 24px\);overflow-y:auto/);

console.log("Room/time suggestion regression: edit scope, faculty placeholders, real conflicts, feedback and stale replies passed");
