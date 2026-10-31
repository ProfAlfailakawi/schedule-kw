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


/** Official 2026/27 T2 original PDF -> latest change report: only matches
 * confirmed by unambiguous exact evidence are eligible for report linking.
 * No timetable rows are updated or created. */
const strongReplacements=[
  {
    source:row({AdCourseId:212,sourceCourseCode:"0109212",referenceNumber:"3738",
      sourceOrder:80,SCode:"559",sourceSectionText:"559",AdRoomCode:"012B08",
      AdRoomHall:"G22",AdInstructorId:81,
      fsunday:false,fmonday:false,ftuesday:false,fwednesday:true,fthursday:false,
      fstarttime:"11:00",fendtime:"13:50"}),
    current:row({AdCourseId:212,sourceCourseCode:"",referenceNumber:"",
      sourceOrder:1_000_004,SCode:"531",AdRoomCode:"012B08",AdRoomHall:"G22",AdInstructorId:81,
      fsunday:false,fmonday:false,ftuesday:false,fwednesday:true,fthursday:false,
      fstarttime:"11:00",fendtime:"13:50"}),
  },
  {
    source:row({AdCourseId:258,sourceCourseCode:"0109258",referenceNumber:"3755",
      sourceOrder:101,SCode:"504",sourceSectionText:"504",AdRoomCode:"012B08",
      AdRoomHall:"G23",AdInstructorId:82,
      fsunday:false,fmonday:false,ftuesday:true,fwednesday:false,fthursday:false,
      fstarttime:"16:00",fendtime:"19:50"}),
    current:row({AdCourseId:258,sourceCourseCode:"",referenceNumber:"",
      sourceOrder:1_000_005,SCode:"505",AdRoomCode:"012B08",AdRoomHall:"G23",AdInstructorId:82,
      fsunday:false,fmonday:false,ftuesday:true,fwednesday:false,fthursday:false,
      fstarttime:"14:00",fendtime:"17:50"}),
  },
  {
    source:row({AdCourseId:125,sourceCourseCode:"0109125",referenceNumber:"1550",
      sourceOrder:25,SCode:"501",sourceSectionText:"01",AdRoomCode:"011B17",
      AdRoomHall:"G26",AdInstructorId:83,
      fsunday:true,fmonday:false,ftuesday:false,fwednesday:false,fthursday:false,
      fstarttime:"12:00",fendtime:"15:50"}),
    current:row({AdCourseId:125,sourceCourseCode:"",referenceNumber:"",
      sourceOrder:1_000_006,SCode:"501",AdRoomCode:"011B17",AdRoomHall:"F06",AdInstructorId:83,
      fsunday:true,fmonday:false,ftuesday:false,fwednesday:false,fthursday:false,
      fstarttime:"12:00",fendtime:"15:50"}),
  },
  {
    source:row({AdCourseId:324,sourceCourseCode:"0109324",referenceNumber:"1833",
      sourceOrder:50,SCode:"502",sourceSectionText:"02",AdRoomCode:"011B17",
      AdRoomHall:"G23",AdInstructorId:0,
      fsunday:false,fmonday:false,ftuesday:true,fwednesday:false,fthursday:false,
      fstarttime:"14:00",fendtime:"17:50"}),
    current:row({AdCourseId:324,sourceCourseCode:"",referenceNumber:"",
      sourceOrder:1_000_007,SCode:"502",AdRoomCode:"011B17",AdRoomHall:"F13",AdInstructorId:84,
      fsunday:false,fmonday:false,ftuesday:true,fwednesday:false,fthursday:false,
      fstarttime:"14:00",fendtime:"17:50"}),
  },
];
const reviewedCourseCodes=new Map([...codes,[125,"0109125"],[258,"0109258"],[324,"0109324"]] as [number,string][]);
const replacementMatches=matchAuthorityThroughPublication(
  strongReplacements.map(x=>x.source),[],strongReplacements.map(x=>x.current),reviewedCourseCodes);
assert.deepEqual([...replacementMatches].sort((a,b)=>a[0]-b[0]),
  [[0,0],[1,1],[2,2],[3,3]],
  "Four evidence-backed PDF replacements collapse to a single modified report row each");
const manualNew={...strongReplacements[0].current,SCode:"530",AdRoomHall:"G26"};
const safeWithExtra=matchAuthorityThroughPublication(
  strongReplacements.map(x=>x.source),[],[...strongReplacements.map(x=>x.current),manualNew],reviewedCourseCodes);
assert.deepEqual([...safeWithExtra],[[0,0],[1,1],[2,2],[3,3]],
  "A separate added class in the same course must not be consumed by reviewed links");
assert.equal(matchAuthorityThroughPublication([strongReplacements[0].source],[],
  [{...strongReplacements[0].current,AdRoomCode:"011B17"}],reviewedCourseCodes).size,0,
  "Girls original cannot link to boys campus");
assert.equal(matchAuthorityThroughPublication([strongReplacements[1].source],[],
  [{...strongReplacements[1].current,AdInstructorId:999}],reviewedCourseCodes).size,0,
  "Different professor invalidates a less-certain edited-time link");
assert.equal(matchAuthorityThroughPublication([strongReplacements[2].source],[],
  [{...strongReplacements[2].current,AdRoomHall:"F15"}],reviewedCourseCodes).size,0,
  "A second unexpected change must not be silently approved");
assert.equal(matchAuthorityThroughPublication([strongReplacements[0].source],[],
  [strongReplacements[0].current,{...strongReplacements[0].current,id:9876}],reviewedCourseCodes).size,0,
  "Two indistinguishable candidates must remain unpaired");


// Seven source/target placements documented in the original girls' PDF and
// latest report, with first-published professor identity as a REQUIRED guard.
const additionalGirlsCases=[
  {reference:"2081",course:"0109212",courseId:212,sourceDay:"01000",sourceStart:"14:00",sourceEnd:"16:50",sourceRoom:"G21",section:"533",day:"00010",start:"14:00",end:"16:50",room:"G23"},
  {reference:"2071",course:"0109212",courseId:212,sourceDay:"00010",sourceStart:"08:00",sourceEnd:"10:50",sourceRoom:"G23",section:"534",day:"10000",start:"08:00",end:"10:50",room:"G21"},
  {reference:"3752",course:"0109212",courseId:212,sourceDay:"10000",sourceStart:"11:00",sourceEnd:"13:50",sourceRoom:"G22",section:"535",day:"10000",start:"08:00",end:"10:50",room:"G23"},
  {reference:"2957",course:"0109212",courseId:212,sourceDay:"00001",sourceStart:"14:00",sourceEnd:"16:50",sourceRoom:"G22",section:"536",day:"00001",start:"08:00",end:"10:50",room:"G21"},
  {reference:"2956",course:"0109215",courseId:215,sourceDay:"00010",sourceStart:"14:00",sourceEnd:"16:50",sourceRoom:"G22",section:"509",day:"10000",start:"13:00",end:"15:50",room:"G22"},
  {reference:"3753",course:"0109237",courseId:237,sourceDay:"01000",sourceStart:"12:00",sourceEnd:"15:50",sourceRoom:"F09",section:"502",day:"01000",start:"14:00",end:"17:50",room:"G23"},
  {reference:"3754",course:"0109334",courseId:334,sourceDay:"00100",sourceStart:"12:00",sourceEnd:"15:50",sourceRoom:"F09",section:"502",day:"00100",start:"08:00",end:"11:50",room:"G22"},
];
const weekdayFields=(days:string)=>Object.fromEntries(
  ["fsunday","fmonday","ftuesday","fwednesday","fthursday"]
    .map((name,index)=>[name,days[index]==="1"]));
const reviewedCodes=new Map([...reviewedCourseCodes,
  [215,"0109215"],[237,"0109237"],[334,"0109334"]] as [number,string][]);
const previousGirls=additionalGirlsCases.map((x,i)=>row({
  AdCourseId:x.courseId,sourceCourseCode:x.course,referenceNumber:x.reference,
  sourceOrder:200+i,AdRoomCode:"012B08",AdRoomHall:x.sourceRoom,
  fstarttime:x.sourceStart,fendtime:x.sourceEnd,
  AdInstructorId:900+i,...weekdayFields(x.sourceDay),
}));
const liveGirls=additionalGirlsCases.map((x,i)=>row({
  AdCourseId:x.courseId,sourceCourseCode:"",referenceNumber:"",
  sourceOrder:1_000_100+i,AdRoomCode:"012B08",AdRoomHall:x.room,
  SCode:x.section,fstarttime:x.start,fendtime:x.end,
  AdInstructorId:900+i,...weekdayFields(x.day),
}));
const sevenPairs=matchAuthorityThroughPublication(previousGirls,[],liveGirls,reviewedCodes);
assert.deepEqual([...sevenPairs].sort((a,b)=>a[0]-b[0]),
  additionalGirlsCases.map((_,i)=>[i,i]),
  "Seven individually evidenced same-professor placements match one-to-one");
assert.equal(matchAuthorityThroughPublication(previousGirls,[],
  liveGirls.map((x,i)=>i===0?{...x,AdInstructorId:999}:x),reviewedCodes).has(0),false,
  "A different original/current professor makes a suggestive multi-cell match invalid");
assert.equal(matchAuthorityThroughPublication(previousGirls,[],
  [...liveGirls,{...liveGirls[3],id:123456}],reviewedCodes).has(3),false,
  "No guessing if two live classes satisfy the same printed source link");
assert.equal(matchAuthorityThroughPublication(previousGirls,[],
  liveGirls.map((x,i)=>i===5?{...x,AdRoomCode:"011B17"}:x),reviewedCodes).has(5),false,
  "An original girls appointment must never match a boys section");
assert.equal(matchAuthorityThroughPublication(previousGirls.map((x,i)=>i===2?
  {...x,AdInstructorId:0}:x),[],liveGirls,reviewedCodes).has(2),false,
  "A blank original PDF professor does not prove teacher continuity without a publication snapshot");

console.log("Authority identity: official section gaps, real edits, false references, unique provenance and faculty baselines passed.");
