import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { authorityFieldMatchesOriginal as same } from "../src/utils/authorityNetChange";

const original = {
  referenceNumber: "18945", sourceOrder: 1,
  buildingId: "building-012B09", roomId: "room-G20",
  AdRoomCode: "012B09", AdRoomHall: "G20",
  fstarttime: "12:00", fendtime: "14:00",
  fsunday: false, fmonday: true, ftuesday: false,
  fwednesday: true, fthursday: false,
};
const isSame = (field: string, row: Record<string, unknown>) => same(field, original, row);

function verify(field: string, modified: Record<string, unknown>, restored: Record<string, unknown>) {
  assert.equal(isSame(field, modified), false, field + ": a real edit must remain visible");
  assert.equal(isSame(field, restored), true, field + ": returning to the original must clear yellow");
}

// Same stored row, three edits, then the original semantic values.
verify("fstarttime", { ...original, fstarttime: "13:00" }, { ...original, fstarttime: "12.00" });
verify("fendtime", { ...original, fendtime: "15:00" }, { ...original, fendtime: "1400" });
verify("fmonday", { ...original, fmonday: false }, { ...original, fmonday: "1" });

// The room selector may save the official room/building spelling in place of
// the PDF's equivalent spelling. Stable registry identity takes precedence.
verify("AdRoomHall",
  { ...original, roomId: "room-F17", AdRoomHall: "F17" },
  { ...original, AdRoomHall: "G-20" });
verify("AdRoomCode",
  { ...original, buildingId: "building-012B07", AdRoomCode: "012B07" },
  { ...original, AdRoomCode: "12B09" });

// Returning the time must not clear a separate genuinely changed room.
const partial = { ...original, fstarttime: "12:00", roomId: "room-F17", AdRoomHall: "F17" };
assert.equal(isSame("fstarttime", partial), true);
assert.equal(isSame("AdRoomHall", partial), false);

// A room ID never overrides a conflicting building identity.
assert.equal(isSame("AdRoomHall", { ...original, buildingId: "another-building" }), false);
// An unknown registry identity cannot hide a changed room code.
assert.equal(isSame("AdRoomHall", { ...original, roomId: "", AdRoomHall: "F17" }), false);
assert.equal(isSame("AdRoomCode", { ...original, buildingId: "", AdRoomCode: "012B07" }), false);
assert.equal(isSame("fstarttime", { ...original, fstarttime: "12:01" }), false);
assert.equal(isSame("fstarttime", { ...original, fstarttime: "25:00" }), false);
assert.equal(isSame("AdInstructorId", { ...original }), false);

// The original comparison must be wired to this guard, not just tested in isolation.
const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
assert.match(server, /authorityFieldMatchesOriginal\(field,source,next\)/);
assert.match(server, /const visibleChangedFields=changedFields\.filter\(field=>field!=="SCode"\)/);
assert.match(server, /baselineRows=importLayout==="authority-pdf"/);
console.log("Authority PDF net-difference/revert regression checks passed.");
