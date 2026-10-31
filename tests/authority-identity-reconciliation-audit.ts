import assert from "node:assert/strict";
import { isAuthorityImportedRow, matchAuthoritySourceRows, withFirstPublishedAuthorityInstructors } from "../src/utils/authorityRowMatching";

/* Regression fixtures based on the original SWRSCHA girls'/boys' timetable
 * and the latest comprehensive report. No civil IDs or private records. */
const codes=new Map<number,string>([
  [101,"105"],[102,"0109105"],[112,"112"],[212,"212"],[401,"114"],[500,"105"]
]);
const row=(override:Record<string,unknown>={})=>({
  AdCourseId:101,SCode:"501",referenceNumber:"3722",sourceSectionText:"501",sourceOrder:1,
  sourceCourseCode:"0109105",AdRoomCode:"012B08",AdRoomHall:"F16",
  fsunday:false,fmonday:true,ftuesday:false,fwednesday:true,fthursday:false,
  fstarttime:"12:30",fendtime:"13:50",AdInstructorId:0,...override,
});
const match=(source:object[],live:object[])=>matchAuthoritySourceRows(source,live,codes);
const newReference=(override:Record<string,unknown>={})=>row({AdCourseId:102,referenceNumber:"20119",sourceOrder:30,...override});

// 3722 / 501 matches academic placement, even if its imported live CRN differs.
assert.equal(match([row()],[newReference()]).get(0),0,"original CRN drift is not deletion+addition");

// A genuine room/time/weekday/building edit remains attached to the same class.
assert.equal(match([row()],[newReference({AdRoomHall:"G20"})]).get(0),0,"room-only edit");
assert.equal(match([row()],[newReference({fstarttime:"14:00",fendtime:"15:20"})]).get(0),0,"time-only edit");
assert.equal(match([row()],[newReference({fmonday:false,ftuesday:true,fwednesday:false})]).get(0),0,"weekday-only edit");
assert.equal(match([row()],[newReference({AdRoomCode:"012B07"})]).get(0),0,"building-only edit within site");
assert.equal(match([row()],[newReference({AdRoomHall:"G20",AdRoomCode:"012B07"})]).get(0),0,"room+building edit");
assert.equal(match([row()],[newReference({
  AdRoomHall:"G20",fstarttime:"14:00",fendtime:"15:20",sourceOrder:1,
})]).get(0),0,"a corroborated immutable import order handles a two-field edit");

// 0109105: the official girls' PDF legitimately has section 503; the system
// changed it to 502. The second lecture is the same, not a new course.
const original503=row({sourceOrder:2,sourceSectionText:"503",SCode:"502",referenceNumber:"3724",fstarttime:"09:30",fendtime:"10:50"});
const moved503=newReference({sourceOrder:19,SCode:"502",fstarttime:"09:30",fendtime:"10:50"});
const two=match([row(),original503],[moved503,newReference({sourceOrder:18})]);
assert.equal(two.get(0),1,"first Authority lecture keeps its actual meeting");
assert.equal(two.get(1),0,"original 503 -> current 502, despite a misleading generated section");

// An even stronger regression: same course, *crossed* sequential section
// labels. Course+section matching first would silently swap these two classes.
const swapped=match([
  row({referenceNumber:"1001",sourceOrder:1,sourceSectionText:"501",SCode:"501"}),
  row({referenceNumber:"1002",sourceOrder:2,sourceSectionText:"503",SCode:"502",fstarttime:"09:30",fendtime:"10:50"}),
],[
  newReference({referenceNumber:"2001",sourceOrder:20,SCode:"501",fstarttime:"09:30",fendtime:"10:50"}),
  newReference({referenceNumber:"2002",sourceOrder:21,SCode:"502"}),
]);
assert.equal(swapped.get(0),1,"a generated 501 must not steal another class's actual meeting");
assert.equal(swapped.get(1),0,"a generated 502 must not steal a different class");

// The user-supplied original PDF contains reference 2095, source section 529
// at the Jahra site, but the later comprehensive report prints section 516.
// Both have Monday 12:30-15:20, building 012J14 and no room.
const jahra=row({
  AdCourseId:212,sourceCourseCode:"0109212",referenceNumber:"2095",
  sourceSectionText:"529",SCode:"509",sourceOrder:57,
  fmonday:true,fwednesday:false,fstarttime:"12:30",fendtime:"15:20",
  AdRoomCode:"012J14",AdRoomHall:"",
});
const currentJahra={...jahra,sourceOrder:84,referenceNumber:"20140",SCode:"516",AdRoomHall:"—"};
assert.equal(match([jahra],[currentJahra]).get(0),0,
  "Jahra section 529 -> 516 remains a matched appointment even without a room");

// Same timetable on another campus is never the same record.
assert.equal(match([jahra],[{...currentJahra,AdRoomCode:"012B08"}]).size,0,"branch isolation");
// A different course in an identical room/time may never consume the baseline.
assert.equal(match([row()],[newReference({AdCourseId:401,sourceCourseCode:"0109114"})]).size,0,"course isolation");
// A genuinely deleted imported class cannot be matched to a manual addition.
const manual=newReference({sourceOrder:1_000_050,sourceCourseCode:"",sourceSectionText:"",sourceCourseText:""});
assert.equal(isAuthorityImportedRow(manual),false,"post-PDF sourceOrder blocks false provenance");
assert.equal(match([row()],[manual]).size,0,"manual additions stay new even with a copied CRN");
assert.equal(match([row()],[]).size,0,"actual deletion preserved");
assert.equal(match([],[newReference()]).size,0,"actual addition preserved");

// No guesses for identical classes: a unique meeting is an explicit condition.
const ambiguous=match([
  row({referenceNumber:"101",sourceOrder:1}),
  row({referenceNumber:"102",sourceOrder:2}),
],[
  newReference({referenceNumber:"201",sourceOrder:20}),
  newReference({referenceNumber:"202",sourceOrder:21}),
]);
assert.equal(ambiguous.size,0,"duplicate meetings must not pair arbitrarily");

// Two distinct CRNs with no shared academic slot or provable order remain
// unmatched. This is safer than inventing a modified course.
const unrelated=newReference({
  referenceNumber:"88888",sourceOrder:1,AdRoomCode:"012B07",AdRoomHall:"G26",
  fmonday:false,fwednesday:false,fsunday:true,fstarttime:"08:00",fendtime:"09:20",
});
assert.equal(match([row()],[unrelated]).size,0,"no source correspondence is not an inferred match");

// For faculty changes, the original SWRSCHA professor cell was empty. Use
// the first published assignment, not the empty scanned PDF or current teacher.
const initial=newReference({sourceOrder:1,AdInstructorId:77,referenceNumber:"20119"});
const [facultyBaseline]=withFirstPublishedAuthorityInstructors([row()],[initial],codes);
assert.equal(facultyBaseline.AdInstructorId,77,"first-published teacher establishes known before-state");
assert.equal(row().AdInstructorId,0,"immutable scanned baseline must not be changed");
assert.equal(withFirstPublishedAuthorityInstructors([row()],[],codes)[0].AdInstructorId,0,
  "missing first-published evidence must not invent a professor");
assert.equal(withFirstPublishedAuthorityInstructors([row({AdInstructorId:22})],[initial],codes)[0].AdInstructorId,22,
  "actual instructor identity in the original is never overwritten");

console.log("Authority identity: official section gaps, real edits, false references, unique provenance and faculty baselines passed.");
