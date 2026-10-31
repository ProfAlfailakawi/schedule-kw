import assert from "node:assert/strict";
import { isAuthorityImportedRow, matchAuthoritySourceRows, matchAuthorityThroughPublication, withFirstPublishedAuthorityInstructors } from "../src/utils/authorityRowMatching";

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
assert.equal(match([row()],[newReference({sourceCourseCode:"0118105"})]).size,0,
  "a cross-department elective with the same catalogue suffix is not the same course");
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
const initiallyEmpty=withFirstPublishedAuthorityInstructors([row()],[{...initial,AdInstructorId:0}],codes)[0];
assert.equal(initiallyEmpty.AdInstructorId,0,"known initial empty instructor stays empty");
assert.equal(initiallyEmpty.__hasPublishedInstructorBaseline,true,
  "an assigned professor after a proven originally empty assignment is a real edit");
assert.equal(withFirstPublishedAuthorityInstructors([row()],[],codes)[0].__hasPublishedInstructorBaseline,undefined,
  "unknown original professor is not automatically reported as edited");
assert.equal(withFirstPublishedAuthorityInstructors([row({AdInstructorId:22})],[initial],codes)[0].AdInstructorId,22,
  "actual instructor identity in the original is never overwritten");


// An actual official PDF row can change time, weekday, room and instructor at
// once. No heuristic academic matcher can infer its identity from those cells.
// The immutable initial publication knows its import position, and the live
// record carries the SAME database id.
const firstSource=row({referenceNumber:"2053",sourceOrder:6,sourceSectionText:"512",AdInstructorId:0,AdRoomHall:"G20",fstarttime:"14:00",fendtime:"14:50"});
const firstPublished=row({referenceNumber:"2053",id:774,sourceOrder:6,SCode:"506",AdInstructorId:55,
  fmonday:false,fwednesday:false,fsunday:true,fthursday:true,
  AdRoomHall:"F17",fstarttime:"08:00",fendtime:"10:50"});
const firstLive={...firstPublished,referenceNumber:"20119",SCode:"507",AdInstructorId:99,
  fsunday:false,ftuesday:true,fthursday:false,
  AdRoomHall:"F09",fstarttime:"10:00",fendtime:"10:50"};
assert.equal(match([firstSource],[firstLive]).size,0,"No invented academic match from several changed cells");
assert.equal(matchAuthorityThroughPublication([firstSource],[firstPublished],[firstLive],codes).get(0),0,
  "Stable first-published id recovers original class after multiple simultaneous edits");

// SourceOrder ties a preview-edit to its original PDF row, *within the same
// draft*. Current sourceOrder can change; the published db identity is stable.
const otherSource=row({referenceNumber:"2530",sourceOrder:18,sourceSectionText:"503",
  AdCourseId:212,sourceCourseCode:"0109212",AdRoomHall:"",fsunday:false,fmonday:true,fwednesday:false,
  fstarttime:"11:00",fendtime:"13:50"});
const otherPublished={...otherSource,id:800,referenceNumber:"20133",SCode:"501",
  ftuesday:true,fmonday:false,AdRoomHall:"F17",fstarttime:"08:00",fendtime:"10:50"};
const otherLive={...otherPublished,sourceOrder:99,referenceNumber:"20244",AdRoomHall:"G19"};
assert.equal(matchAuthorityThroughPublication([otherSource],[otherPublished],[otherLive],codes).get(0),0,
  "An edit made in the original PDF preview still links by its import position and final saved id");

// A missing published trail must never trigger a forced original/new mapping.
assert.equal(matchAuthorityThroughPublication([firstSource],[],[firstLive],codes).size,0,
  "No historical snapshot means multiple edited fields cannot be guessed");
assert.equal(matchAuthorityThroughPublication([firstSource],[firstPublished],[manual],codes).size,0,
  "A user-created new appointment is never consumed by the source bridge");
assert.equal(matchAuthorityThroughPublication([firstSource],[firstPublished],[{...firstLive,id:775,AdRoomCode:"012J14"}],codes).size,0,
  "An original Girls classroom cannot silently be attributed to Jahra");

const doubledCurrent=[firstLive,{...firstLive,referenceNumber:"20120"}];
assert.equal(matchAuthorityThroughPublication([firstSource],[firstPublished],doubledCurrent,codes).size,0,
  "Duplicate current IDs cannot be assigned arbitrarily");

// A restored row with a regenerated database ID is only tracked through an
// identical original imported reference AND a unique import position.
const recovered={...firstLive,id:998,referenceNumber:"20888",sourceOrder:6};
assert.equal(matchAuthorityThroughPublication([firstSource],[firstPublished],[recovered],codes).size,0,
  "Different db IDs and contradictory source references are not proof");
const initiallyRenumbered={...firstPublished,referenceNumber:"20133"};
const restored={...firstLive,id:998,referenceNumber:"20133",sourceOrder:6};
assert.equal(matchAuthorityThroughPublication([firstSource],[initiallyRenumbered],[restored],codes).get(0),0,
  "Unique original import position and unchanged first-publication CRN recover a rebuilt id");



// Three authoritative one-to-one corrections, explicitly confirmed against
// the girls' ORIGINAL source PDF and the currently printed timetable.
// They are real edits, not separate deleted+unknown appointments.
const confirmedSource=[
  row({AdCourseId:112,sourceCourseCode:"0109112",referenceNumber:"2053",SCode:"512",sourceSectionText:"512",
    sourceOrder:33,AdRoomCode:"012B08",AdRoomHall:"G20",
    fsunday:true,fmonday:false,ftuesday:true,fwednesday:false,fthursday:true,
    fstarttime:"14:00",fendtime:"14:50"}),
  row({AdCourseId:445,sourceCourseCode:"0109445",referenceNumber:"2530",SCode:"503",sourceSectionText:"503",
    sourceOrder:77,AdRoomCode:"012B08",AdRoomHall:"",fsunday:false,fmonday:true,ftuesday:false,fwednesday:false,fthursday:false,
    fstarttime:"11:00",fendtime:"13:50"}),
  row({AdCourseId:499,sourceCourseCode:"0109499",referenceNumber:"2787",SCode:"503",sourceSectionText:"503",
    sourceOrder:103,AdRoomCode:"012B08",AdRoomHall:"F16",fsunday:true,fmonday:false,ftuesday:false,fwednesday:false,fthursday:false,
    fstarttime:"16:00",fendtime:"17:50"}),
  // A different source Research appointment stays deleted.
  row({AdCourseId:499,sourceCourseCode:"0109499",referenceNumber:"2955",SCode:"504",sourceSectionText:"504",
    sourceOrder:104,AdRoomCode:"012B08",AdRoomHall:"F09",fsunday:false,fmonday:false,ftuesday:false,fwednesday:true,fthursday:false,
    fstarttime:"16:00",fendtime:"17:50"}),
];
const confirmedCurrent=[
  row({AdCourseId:112,sourceCourseCode:"0109112",referenceNumber:"20119",SCode:"507",sourceSectionText:"512",
    sourceOrder:43,AdRoomCode:"012B08",AdRoomHall:"G20",
    fsunday:true,fmonday:false,ftuesday:true,fwednesday:false,fthursday:true,
    fstarttime:"10:00",fendtime:"10:50"}),
  row({AdCourseId:445,sourceCourseCode:"0109445",referenceNumber:"20120",SCode:"501",sourceSectionText:"503",
    sourceOrder:76,AdRoomCode:"012B08",AdRoomHall:"F17",
    fsunday:false,fmonday:false,ftuesday:true,fwednesday:false,fthursday:false,
    fstarttime:"08:00",fendtime:"10:50"}),
  row({AdCourseId:499,sourceCourseCode:"0109499",referenceNumber:"20121",SCode:"502",sourceSectionText:"503",
    sourceOrder:99,AdRoomCode:"012B08",AdRoomHall:"F17",
    fsunday:false,fmonday:false,ftuesday:true,fwednesday:false,fthursday:false,
    fstarttime:"12:00",fendtime:"14:50"}),
  // A genuine independent e-learning addition cannot be absorbed.
  row({AdCourseId:445,sourceCourseCode:"",referenceNumber:"",SCode:"503",sourceSectionText:"",
    sourceOrder:1_000_008,AdRoomCode:"012B08",AdRoomHall:"F17",
    fsunday:false,fmonday:false,ftuesday:false,fwednesday:false,fthursday:true,
    fstarttime:"14:00",fendtime:"16:50"}),
];
const approved=matchAuthorityThroughPublication(confirmedSource,[],confirmedCurrent,codes);
assert.deepEqual([...approved].sort((a,b)=>a[0]-b[0]),[[0,0],[1,1],[2,2]],
  "Three user-confirmed edited appointments match separately; another deleted Research and new e-learning remain separate");
assert.equal(new Set(approved.values()).size,3,"Each source links to exactly one current row");
assert.equal(approved.has(3),false,"Research source 2955 still deleted");
assert.equal([...approved.values()].includes(3),false,"Independent e-learning 503 still new");
const approvedWithInitialSnapshot=matchAuthorityThroughPublication(
  confirmedSource,confirmedCurrent,confirmedCurrent,codes);
assert.equal(approvedWithInitialSnapshot.get(0),0);
assert.equal(approvedWithInitialSnapshot.get(1),1);
assert.equal(approvedWithInitialSnapshot.get(2),2);
assert.equal(approvedWithInitialSnapshot.has(3),false);
assert.equal(matchAuthorityThroughPublication(
  confirmedSource,[],confirmedCurrent.map((r,i)=>i===2?{...r,AdRoomCode:"011B17"}:r),codes).has(2),
  false,"The confirmation never crosses to the boys' campus");
assert.equal(matchAuthorityThroughPublication(
  confirmedSource,[],confirmedCurrent.map((r,i)=>i===1?{...r,AdRoomHall:"G20"}:r),codes).has(1),
  false,"The confirmation cannot silently match an unrelated classroom");

console.log("Authority identity: official section gaps, real edits, false references, unique provenance and faculty baselines passed.");
