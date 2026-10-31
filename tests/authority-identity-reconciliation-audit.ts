import assert from "node:assert/strict";
import { matchAuthoritySourceRows } from "../src/utils/authorityRowMatching";

/** Imported girls' and boys' reports must use identical provenance rules. */
const courseCodes = new Map([[101, "105"], [202, "105"], [301, "112"], [401, "114"]]);
const source = (extra: Record<string, unknown> = {}) => ({
  AdCourseId: 101, SCode: "501", referenceNumber: "3722", sourceOrder: 1,
  sourceCourseCode: "0109105",
  fsunday: false, fmonday: true, ftuesday: false, fwednesday: true, fthursday: false,
  fstarttime: "12:30", fendtime: "13:50", AdRoomCode: "012B08", AdRoomHall: "F16",
  AdInstructorId: 8, ...extra,
});
const actual = (extra: Record<string, unknown> = {}) =>
  ({ ...source(), AdCourseId: 202, ...extra });

const matches = (older: object[], newer: object[]) =>
  matchAuthoritySourceRows(older, newer, courseCodes);

assert.equal(matches([source()], [actual({ referenceNumber: "20119", sourceOrder: 27 })]).get(0), 0,
  "A renumbered Authority reference must not be a fictional deletion and addition");

assert.equal(matches([source()], [actual({
  referenceNumber: "20119", AdRoomHall: "F20",
  fstarttime: "14:00", fendtime: "15:20", AdInstructorId: 99,
})]).get(0), 0,
  "A real edited class remains paired, so changed cells can be highlighted");

assert.equal(matches([source({ SCode: "509" })], [actual({
  referenceNumber: "20119", SCode: "510", sourceOrder: 83,
})]).get(0), 0,
  "Legacy consecutive section renumbering is reconciled by a unique academic slot");

assert.equal(matches([source()], [actual({
  referenceNumber: "20119", sourceOrder: 1_000_001, sourceCourseCode: "",
  sourceCourseText: "", sourceSectionText: "", importEvidence: undefined,
})]).size, 0,
  "A manual/new appointment is not reclassified as imported even with a copied CRN");

assert.equal(matches([source()], []).size, 0, "A genuine deletion remains a deletion");
assert.equal(matches([], [actual()]).size, 0, "A genuine new appointment remains new");

assert.equal(matches([source()], [actual({ AdCourseId: 401, referenceNumber: "20119" })]).size, 0,
  "A different course in the same section and room is not a valid match");

assert.equal(matches(
  [source({ referenceNumber: "3722", sourceOrder: 1 }), source({ referenceNumber: "3724", sourceOrder: 2 })],
  [actual({ referenceNumber: "20119", sourceOrder: 30 }), actual({ referenceNumber: "20121", sourceOrder: 31 })],
).size, 0, "Ambiguous identical slots and section labels cannot be guessed into a match");

const ordered = matches([
  source({ referenceNumber: "3722", SCode: "501", sourceOrder: 1 }),
  source({ referenceNumber: "3724", SCode: "502", sourceOrder: 2 }),
], [
  actual({ referenceNumber: "3724", SCode: "502", sourceOrder: 18 }),
  actual({ referenceNumber: "20119", SCode: "501", sourceOrder: 19 }),
]);
assert.equal(ordered.get(1), 0, "Exact CRN gets priority over secondary reconciliation");
assert.equal(ordered.get(0), 1, "Other imported classes retain their unique correspondence");

assert.equal(matches([source()], [actual({
  referenceNumber: "", sourceOrder: 1, SCode: "599", fstarttime: "08:00", fendtime: "09:20",
})]).get(0), 0, "Legacy imported source orders work only when a CRN is missing");

assert.equal(matches([source()], [actual({
  referenceNumber: "88888", sourceOrder: 1, SCode: "599", fstarttime: "08:00", fendtime: "09:20",
})]).size, 0, "Conflicting references and no independent corroboration remain unpaired");

console.log("Authority PDF identity reconciliation: all scenarios passed.");
