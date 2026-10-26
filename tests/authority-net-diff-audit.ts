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


// Both added and deleted appointments must tint EVERY cell, regardless of
// odd/even position. The comprehensive report's zebra rule must never win.
const printCss = fs.readFileSync(path.join(process.cwd(), "src/styles/08-print.css"), "utf8");
const zebraSelector = '.print-comprehensive-grid-body .print-comprehensive-grid-row:nth-child(even)>[role="cell"]';
assert.ok(printCss.includes(zebraSelector), "Keep the existing unchanged-row zebra stripes");
const cssWeight = (selector: string) => (selector.match(/\.[\w-]+|:[\w-]+|\[[^\]]+\]/g) || []).length;
for (const [kind, fill] of [["added", "#e8f6ed"], ["deleted", "#fbe8e8"]] as const) {
  const selector = `.authority-pdf-grid .print-comprehensive-grid-body .authority-pdf-row.authority-pdf-row-${kind}>[role="cell"]`;
  assert.ok(printCss.includes(`${selector}{background:${fill}!important`), `${kind}: preserve the original full-row colour`);
  assert.ok(cssWeight(selector) > cssWeight(zebraSelector), `${kind}: row status must override even-row zebra stripes`);
}
assert.match(printCss, /\.authority-pdf-grid \.authority-pdf-row-changed>\[role="cell"\]\.authority-pdf-cell-changed\{background:#fff2bf!important/);

console.log("Authority PDF net-difference/revert regression checks passed.");
