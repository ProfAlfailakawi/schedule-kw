import { strict as assert } from "node:assert";
import { roomIdentityKeys, rowOccupiesRoom, sharePhysicalRoom, eligibleHallsForSection } from "../src/utils/locationRegistry";
import { findConflicts, findConflictsExhaustive, fastConflictScan } from "../src/utils/scheduleIntelligence";
import type { FSchedule, MasterRoom, MasterBuilding } from "../src/types";
import { diffSchedules } from "../src/utils/scheduleDiff";
import { instructorScheduleFingerprint } from "../src/utils/scheduleFingerprint";

const base = {
  AdCollegeId:1,AdSectionId:1,AdTermId:1,AdCourseId:1,AdCourseName:"Test",
  SCode:"1",AdInstructorId:1,fsunday:true,fmonday:false,ftuesday:false,
  fwednesday:false,fthursday:false,fstarttime:"12:00",fendtime:"14:00",
  AdRoomCode:"012B01",AdRoomHall:"G20",buildingId:"b1",roomId:"room_g20",
  locationStatus:"VERIFIED" as const
};
const a:FSchedule={...base,id:1,companionRoomId:"room_f17",companionRoomLabel:"012B01 / F17"};
const b:FSchedule={...base,id:2,AdCourseId:2,AdInstructorId:2,SCode:"2",AdRoomHall:"G21",roomId:"room_g21",companionRoomId:"room_f17"};
const c:FSchedule={...base,id:3,AdCourseId:3,AdInstructorId:3,SCode:"3",AdRoomHall:"F17",roomId:"room_f17"};
const d:FSchedule={...base,id:4,AdCourseId:4,AdInstructorId:4,SCode:"4",AdRoomHall:"G22",roomId:"room_g22",fstarttime:"14:00",fendtime:"16:00"};
assert.deepEqual(roomIdentityKeys(a),["id:room_g20","id:room_f17"]);
assert.equal(sharePhysicalRoom(a,b),true,"two different main rooms must clash at shared studio");
assert.equal(sharePhysicalRoom(a,c),true,"main and companion use of same studio clash");
assert.equal(sharePhysicalRoom(a,d),false);
assert.equal(rowOccupiesRoom(a,"room_f17","012B01","F17"),true);
assert.ok(findConflicts([a],[b]).some(c=>c.reasons.includes("room")),"optimized checker catches shared studio");
assert.deepEqual(findConflicts([a],[b]).map(c=>c.type),findConflictsExhaustive([a],[b]).map(c=>c.type),"both engines agree");
assert.ok(fastConflictScan([a,b]).roomPairs>0,"live board catches shared studio");
assert.equal(findConflicts([a],[d]).some(c=>c.reasons.includes("room")),false,"nonoverlapping appointment allowed");
const withoutStudio:FSchedule={...a,companionRoomId:undefined,companionRoomLabel:undefined};
assert.equal(diffSchedules([withoutStudio],[a]).counts.changed,1,"studio assignment appears in review changes");
assert.ok(diffSchedules([withoutStudio],[a]).entries[0]?.changes.some(change=>change.field==="room"));
assert.notEqual(instructorScheduleFingerprint([withoutStudio as any]),instructorScheduleFingerprint([a as any]),"studio change affects instructor notification fingerprint");

const building:MasterBuilding={
  id:"b1",officialCode:"012B01",sitePrefix:"012B",collegeIds:[1],sectionIds:[1],active:true,confidence:"CONFIRMED",
  aliases:[],roomCount:2,historicalUsageCount:0,source:"ADMIN",adminVerified:true,evidence:[],auditHistory:[]
} as MasterBuilding;
const mk=(id:string,policy:MasterRoom["bookingPolicy"]):MasterRoom=>({
  id,buildingId:"b1",buildingCode:"012B01",canonicalCode:id,roomType:"استوديو",
  bookingPolicy:policy,active:true,aliases:[],collegeIds:[1],sectionIds:[1],shared:false,
  historicalUsageCount:0,confidence:"CONFIRMED",source:"ADMIN",adminVerified:true,evidence:[],auditHistory:[]
});
const eligible=eligibleHallsForSection({buildings:[building],rooms:[mk("open","normal"),mk("studio","companion_only"),mk("closed","blocked")]},1);
assert.deepEqual(eligible.map(r=>r.roomId),["open"],"advisors never propose studio-only or blocked rooms");
console.log("Companion facility booking audit passed");
