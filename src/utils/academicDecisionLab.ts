/**
 * Academic Decision Lab: bounded read-only what-if calculations.
 * Only approved curricula + self-reported wishes. No student identifiers leave this module.
 * This never writes schedule rows or changes the existing approval/teacher workflow.
 *
 * A scenario moves the complete existing section by a uniform time offset, preserving
 * days, meeting lengths, room, teacher and every other section. It is NOT an executable
 * booking: room registry, capacity, teacher consent and rules still need normal validation.
 */
import { coreqMet, prereqMet } from "./curriculumRules";
import { mandatoryPrecedes, type AcademicInput, type AcademicReading, type AcademicSlot } from "./academicAdvisory";
import type { FSchedule, StudentProfile } from "../types";

export interface AcademicDecisionScenario {
  id: string; courseId: number; courseName: string; section: string;
  before: string; after: string; days: string[];
  /** Real eligible people whose WHOLE requested offered-course bundle can be arranged. */
  beforeFeasible: number; afterFeasible: number; assessed: number; gain: number;
  rippleImproved: number; rippleWorsened: number;
  downstream: number;
  facultyShiftMinutes: number;
  resources: "checked" | "review";
  confidence: "qualified" | "limited";
  reasons: string[];
  cautions: string[];
  /** Higher is better; transparent heuristic, not a claim of global optimum. */
  score: number;
}
export interface AcademicGraduationWatch {
  courseId: number; courseName: string; demand: number; downstream: number; offered: boolean; nearGraduation: number;
}
export interface AcademicDecisionChain {
  steps: Array<{ id: string; courseName: string; section: string; before: string; after: string }>;
  beforeFeasible: number; afterFeasible: number; gain: number; assessed: number;
}
export interface AcademicDecisionLab {
  scenarios: AcademicDecisionScenario[];
  graduationWatch?: AcademicGraduationWatch[];
  chain?: AcademicDecisionChain;
  sampledAt: string;
  basis: "approved-plans-and-student-wishes";
  nonBlocking: true;
  limitations: string[];
}
type Offering = { key: string; courseId: number; section: string; rows: FSchedule[]; slots: AcademicSlot[] };
type Person = { courses: number[]; constraints: NonNullable<StudentProfile["wishes"]>["constraints"] };
const DAYS = ["fsunday","fmonday","ftuesday","fwednesday","fthursday"] as const;
const CLOCKS = ["08:00","09:30","11:00","12:30","14:00","15:30","17:00"] as const;
const toMinute = (s: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s));
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : -1;
};
const clock = (n: number) => String(Math.floor(n / 60)).padStart(2,"0") + ":" + String(n % 60).padStart(2,"0");
const crosses = (a: AcademicSlot, b: AcademicSlot) =>
  a.day === b.day && toMinute(a.start) < toMinute(b.end) && toMinute(b.start) < toMinute(a.end);
const overlaps = (a: AcademicSlot[], b: AcademicSlot[]) => a.some(x => b.some(y => crosses(x,y)));
const slots = (rows: readonly FSchedule[]): AcademicSlot[] => rows.flatMap(row =>
  DAYS.filter(day => row[day] && toMinute(row.fstarttime) >= 0 && toMinute(row.fendtime) > toMinute(row.fstarttime))
    .map(day => ({ day, start: String(row.fstarttime), end: String(row.fendtime) })));
const offeringKey = (row: FSchedule) => [row.AdCourseId,row.AdSectionId,row.SCode || row.id].join("|");
const shiftRows = (rows: FSchedule[], offset: number): FSchedule[] => rows.map(row => ({
  ...row, fstarttime: clock(toMinute(row.fstarttime) + offset), fendtime: clock(toMinute(row.fendtime) + offset),
}));
const dayTimeFits = (s: AcademicSlot, prefs: Person["constraints"]) =>
  (!prefs.noMorning || toMinute(s.start) >= 720) && (!prefs.noAfternoon || toMinute(s.end) <= 720);
const freeDayFits = (picked: AcademicOfferingChoice[], prefs: Person["constraints"]) =>
  !prefs.freeDay || new Set(picked.flatMap(x => x.slots.map(s => s.day))).size < DAYS.length;
type AcademicOfferingChoice = Pick<Offering, "slots">;

/** Full wished-course combination (not a sum of pairwise clashes). Bounded backtracking. */
export function feasibleAcademicBundle(person: Person, available: Map<number, Offering[]>): boolean {
  const options = person.courses.map(id => (available.get(id) || []).filter(o => o.slots.length &&
    o.slots.every(s => dayTimeFits(s, person.constraints))));
  if (!options.length || options.some(group => !group.length)) return false;
  const order = options.slice().sort((a,b)=>a.length-b.length);
  let visited = 0;
  const chosen: Offering[] = [];
  function visit(index: number): boolean {
    if (++visited > 20000) return false; // conservative: never invent feasibility
    if (index === order.length) return freeDayFits(chosen, person.constraints);
    for (const offering of order[index]) {
      if (chosen.some(other => overlaps(other.slots,offering.slots))) continue;
      chosen.push(offering);
      if (visit(index + 1)) return true;
      chosen.pop();
    }
    return false;
  }
  return visit(0);
}
function buildOffers(rows: FSchedule[]): Map<number, Offering[]> {
  const byKey = new Map<string, Offering>();
  for (const row of rows) {
    const key = offeringKey(row);
    const offer = byKey.get(key) || {key, courseId:Number(row.AdCourseId), section:String(row.SCode),rows:[],slots:[]};
    offer.rows.push(row); byKey.set(key,offer);
  }
  const byCourse = new Map<number, Offering[]>();
  for (const offer of byKey.values()) {
    offer.slots = slots(offer.rows);
    if (!offer.slots.length) continue;
    byCourse.set(offer.courseId,[...(byCourse.get(offer.courseId)||[]),offer]);
  }
  return byCourse;
}
function resourceImpact(candidate: FSchedule[], original: FSchedule[], all: FSchedule[]): "checked" | "review" | "conflict" {
  // No false availability claims when any primary resource reference is unresolved.
  let unknown = false;
  const replaced = new Set(original.map(r=>r.id));
  for (const changed of candidate) {
    if (!changed.roomId || !Number(changed.AdInstructorId)) unknown = true;
    for (const existing of all) {
      if (replaced.has(existing.id)) continue;
      const sameTeacher = Number(changed.AdInstructorId) > 0 && Number(changed.AdInstructorId) === Number(existing.AdInstructorId);
      const sameRoom = Boolean(changed.roomId) && (changed.roomId === existing.roomId || changed.roomId === existing.companionRoomId);
      const sameCompanion = Boolean(changed.companionRoomId) && (changed.companionRoomId === existing.roomId || changed.companionRoomId === existing.companionRoomId);
      if ((sameTeacher || sameRoom || sameCompanion) && overlaps(slots([changed]),slots([existing]))) return "conflict";
    }
  }
  return unknown?"review":"checked";
}
function eligiblePeople(input: AcademicInput, available: Map<number,Offering[]>): Person[] {
  const byPlan = new Map(input.plans.map(p=>[p.planId,p]));
  const result: Person[] = [];
  for (const p of input.profiles) {
    if (Number(p.AdCollegeId)!==input.collegeId || Number(p.AdSectionId)!==input.sectionId ||
      Number(p.wishes?.termId)!==input.termId) continue;
    const plan=byPlan.get(String(p.curriculumPlanId||""));
    if(!plan) continue;
    const passed=new Set((p.passedCourseIds||[]).map(Number));
    const registering=new Set((p.wishes?.courseIds||[]).map(Number));
    const rules=new Map(plan.rules.map(r=>[r.courseId,r]));
    const wanted=[...registering].filter(id=>plan.courseIds.includes(id) && !passed.has(id) && available.has(id) &&
      prereqMet(rules.get(id)?.prereq,passed,Number(p.passedUnits)||0) &&
      coreqMet(rules.get(id)?.coreq,passed,registering));
    const valid=wanted.filter(id=>!wanted.some(other=>other!==id &&
      (mandatoryPrecedes(plan.rules,id,other)||mandatoryPrecedes(plan.rules,other,id))));
    // Students missing an offered wanted course aren't claimed to have a complete timetable.
    if(valid.length<2 || valid.length>8 || valid.length!==registering.size) continue;
    // Bound the complete search tree before scoring. Never treat a timed-out
    // or truncated timetable search as proof of a student's unavailability.
    const combinations=valid.reduce((total,id)=>total*Math.max(1,(available.get(id)||[]).length),1);
    if(combinations>1000) continue;
    result.push({courses:valid,constraints:p.wishes?.constraints||{}});
  }
  return result;
}
function downstreamCount(input:AcademicInput,courseId:number):number {
  return new Set(input.plans.flatMap(plan=>plan.rules
    .filter(r=>r.courseId!==courseId && mandatoryPrecedes(plan.rules,courseId,r.courseId))
    .map(r=>r.courseId))).size;
}
function collisionPairs(offers:Map<number,Offering[]>, pairs:AcademicReading["pairs"], courseId:number) {
  let count=0;
  for(const pair of pairs) {
    if(pair.a!==courseId && pair.b!==courseId) continue;
    if(pair.basis!=="wishes"||pair.shared<3) continue;
    const a=offers.get(pair.a)||[],b=offers.get(pair.b)||[];
    if(a.length && b.length && a.every(x=>b.every(y=>overlaps(x.slots,y.slots)))) count++;
  }
  return count;
}

/** Candidate bottlenecks, not a prediction of a student's graduation date. */
function graduationWatch(input:AcademicInput,offers:Map<number,Offering[]>):AcademicGraduationWatch[] {
  const plans=new Map(input.plans.map(p=>[p.planId,p]));
  const courses=new Map(input.courses.map(c=>[Number(c.AdCourseId),String(c.CourseName||c.CourseCode)]));
  const counts=new Map<number,{demand:number;near:number}>();
  const horizon=Date.now()+365*86400000;
  for(const student of input.profiles) {
    if(Number(student.AdCollegeId)!==input.collegeId || Number(student.AdSectionId)!==input.sectionId ||
      Number(student.wishes?.termId)!==input.termId)continue;
    const plan=plans.get(String(student.curriculumPlanId||""));if(!plan)continue;
    const passed=new Set((student.passedCourseIds||[]).map(Number));
    const wants=new Set((student.wishes?.courseIds||[]).map(Number));
    const rules=new Map(plan.rules.map(r=>[r.courseId,r]));
    const predicted=Date.parse(student.expectedGraduationAt||"");
    const near=Number.isFinite(predicted)&&predicted>=Date.now()-30*86400000&&predicted<=horizon;
    for(const id of wants) {
      if(!plan.courseIds.includes(id)||passed.has(id)||!courses.has(id)||
        !prereqMet(rules.get(id)?.prereq,passed,Number(student.passedUnits)||0)||
        !coreqMet(rules.get(id)?.coreq,passed,wants))continue;
      const prior=counts.get(id)||{demand:0,near:0};
      prior.demand++;if(near)prior.near++;counts.set(id,prior);
    }
  }
  return [...counts.entries()].flatMap(([courseId,c])=>{
    if(c.demand<3)return [];
    const downstream=downstreamCount(input,courseId),offered=Boolean(offers.get(courseId)?.length);
    if(offered && !downstream)return [];
    return [{courseId,courseName:courses.get(courseId)||String(courseId),demand:c.demand,downstream,offered,
      nearGraduation:c.near>=3?c.near:0}];
  }).sort((a,b)=>Number(a.offered)-Number(b.offered)||b.nearGraduation-a.nearGraduation||
    b.demand-a.demand||b.downstream-a.downstream).slice(0,6);
}
function combineScenarios(people:Person[],rows:FSchedule[],scenarios:AcademicDecisionScenario[]):AcademicDecisionChain|undefined {
  const before=buildOffers(rows),baseline=people.filter(p=>feasibleAcademicBundle(p,before)).length;
  if(baseline>0 && baseline<3)return;
  for(const first of scenarios.slice(0,5)) for(const second of scenarios.slice(0,5)) {
    if(first.id===second.id || first.courseId===second.courseId)continue;
    const chosen=[first,second];
    const keys=chosen.map(s=>s.id.split("|").slice(0,-1).join("|"));
    const projected=rows.map(row=>{
      const at=keys.indexOf(offeringKey(row));
      if(at<0)return row;
      const offset=toMinute(chosen[at].after)-toMinute(chosen[at].before);
      return {...row,fstarttime:clock(toMinute(row.fstarttime)+offset),fendtime:clock(toMinute(row.fendtime)+offset)};
    });
    const touched=projected.filter(row=>keys.includes(offeringKey(row)));
    if(touched.some(row=>toMinute(row.fstarttime)<480 || toMinute(row.fendtime)>1200))continue;
    // Confirm the two relocated sections do not collide with one another's resources.
    const originals=rows.filter(row=>keys.includes(offeringKey(row)));
    if(resourceImpact(touched,originals,projected)==="conflict")continue;
    const movedGroups=new Map<string,FSchedule[]>();
    for(const row of touched) movedGroups.set(offeringKey(row),[...(movedGroups.get(offeringKey(row))||[]),row]);
    const groups=[...movedGroups.values()];
    const linkedCollision=groups.length===2 && groups[0].some(a=>groups[1].some(b=>
      (Number(a.AdInstructorId)>0&&a.AdInstructorId===b.AdInstructorId ||
        Boolean(a.roomId)&&(a.roomId===b.roomId||a.roomId===b.companionRoomId) ||
        Boolean(a.companionRoomId)&&(a.companionRoomId===b.roomId||a.companionRoomId===b.companionRoomId)) &&
      overlaps(slots([a]),slots([b]))));
    if(linkedCollision)continue;
    const state=buildOffers(projected);
    const after=people.filter(p=>feasibleAcademicBundle(p,state)).length;
    const gain=after-baseline;
    if(gain>=3 && gain>Math.max(first.gain,second.gain))
      return {steps:chosen.map(s=>({id:s.id,courseName:s.courseName,section:s.section,before:s.before,after:s.after})),
        beforeFeasible:baseline,afterFeasible:after,gain,assessed:people.length};
  }
  return;
}

export function buildAcademicDecisionLab(input: AcademicInput, reading: AcademicReading): AcademicDecisionLab {
  const current=input.rows.filter(r=>Number(r.AdTermId)===input.termId && Number(r.AdCollegeId)===input.collegeId);
  const offered=buildOffers(current);
  const people=eligiblePeople(input,offered);
  const name=new Map(input.courses.map(c=>[Number(c.AdCourseId),String(c.CourseName||c.CourseCode)]));
  const today=new Date().toISOString();
  const empty:AcademicDecisionLab={scenarios:[],sampledAt:today,basis:"approved-plans-and-student-wishes",nonBlocking:true,
    limitations:["الرغبات والمجتازات مدخلة من الطلبة، وليست قيداً رسمياً.","السعة والموافقات واللائحة لا تُحسم بهذه المحاكاة."]};
  // Refuse costly or incomplete analyses instead of silently sampling students.
  if(people.length<3 || people.length>800)return empty;
  empty.graduationWatch=graduationWatch(input,offered);
  const interested=new Map<number,Person[]>();
  for(const person of people) for(const id of person.courses)
    interested.set(id,[...(interested.get(id)||[]),person]);
  const ranked=[...interested.entries()].filter(([,group])=>group.length>=3 && group.length<=250)
    .sort((a,b)=>b[1].length-a[1].length).slice(0,12);
  const scenarios:AcademicDecisionScenario[]=[];
  for(const [courseId,group] of ranked) {
    for(const offer of (offered.get(courseId)||[]).slice(0,3)) {
      const head=offer.rows[0],start=toMinute(head.fstarttime);
      if(start<0)continue;
      const before=group.filter(p=>feasibleAcademicBundle(p,offered)).length;
      if(before>0 && before<3) continue; // do not reveal a small subgroup via comparison
      const priorRipple=collisionPairs(offered,reading.pairs,courseId);
      for(const newTime of CLOCKS) {
        const delta=toMinute(newTime)-start;
        if(!delta || Math.abs(delta)>300)continue;
        const transformed=shiftRows(offer.rows,delta);
        if(transformed.some(row=>toMinute(row.fstarttime)<480 || toMinute(row.fendtime)>1200))continue;
        const resource=resourceImpact(transformed,offer.rows,current);
        if(resource==="conflict")continue;
        const changed=current.map(r=>offeringKey(r)===offer.key ? transformed[offer.rows.indexOf(r)]||r : r);
        const options=buildOffers(changed);
        const after=group.filter(p=>feasibleAcademicBundle(p,options)).length;
        const gain=after-before;
        if(gain<3)continue; // cohort privacy; never expose small differential effect
        const nextRipple=collisionPairs(options,reading.pairs,courseId);
        const downstream=downstreamCount(input,courseId);
        const verified=resource==="checked";
        const score=gain*10+(priorRipple-nextRipple)*3+Math.min(4,downstream)-Math.abs(delta)/60-(verified?0:3);
        scenarios.push({
          id:offer.key+"|"+newTime,courseId,courseName:name.get(courseId)||String(courseId),section:offer.section,
          before:head.fstarttime,after:newTime,days:[...new Set(offer.slots.map(s=>s.day))],
          beforeFeasible:before,afterFeasible:after,assessed:group.length,gain,
          rippleImproved:Math.max(0,priorRipple-nextRipple),rippleWorsened:Math.max(0,nextRipple-priorRipple),
          downstream,facultyShiftMinutes:Math.abs(delta),resources:resource,
          confidence:verified?"qualified":"limited",
          reasons:["تركيبات أكثر للرغبات الأكاديمية المؤهلة",...(priorRipple>nextRipple?["تداخلات أقل بين المقررات"]:[]),...(downstream?["مقرر يفتح مسارات لاحقة"]:[])],
          cautions:["التغيير غير مطبق", "لا تُحتسب المقاعد أو ازدحام المباني أو موافقة الأستاذ",
            ...(verified?[]:["تحتاج القاعة أو هوية الأستاذ إلى تحقق تشغيلي"])],score,
        });
      }
    }
  }
  scenarios.sort((a,b)=>b.score-a.score||b.gain-a.gain||a.courseId-b.courseId);
  // One illustrated best option per existing section prevents duplicate carousels.
  const taken=new Set<string>();
  empty.scenarios=scenarios.filter(s=>{const key=s.courseId+"|"+s.section;if(taken.has(key))return false;taken.add(key);return true;}).slice(0,8);
  empty.chain=combineScenarios(people,current,empty.scenarios);
  return empty;
}
