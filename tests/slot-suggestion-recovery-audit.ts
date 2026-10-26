import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eligibleSuggestionEditId } from "../src/utils/slotSuggestionScope";

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
assert.match(editor, /roomIdeasNote \|\| "لا توجد قاعة/);
assert.match(editor, /slotIdeasNote \|\| "لا توجد خانة/);
assert.match(editor, /currentSuggestionKey\.current !== requestedKey/);
assert.match(quick, /latestIdeasKey\.current !== requestedKey/);
console.log("Room/time suggestion regression: edit exclusion, safe scope, feedback and stale replies passed");
