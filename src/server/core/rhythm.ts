/**
 * ── إيقاعُ القسم وانجرافُ المواعيد ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { Repository } from "../../db/repository";
import { onSchedulesInvalidated } from "../../db/referenceCache";
import { learnRhythm, type RhythmReading } from "../../utils/departmentRhythm";
import { readDepartmentMemory, type DepartmentMemory } from "../../utils/departmentMemory";
import { readStudentDemand, cohortPairs, sharedBetween } from "../../utils/studentDemand";
import { buildHistoricalTimeModel } from "../../utils/advancedIntelligence";
import { dataContextCacheKey } from "./locations";

/**
 * ── ما تعلّمه النظام من عشر سنوات ───────────────────────────────────────────
 *
 * The department's own style, read out of its entire history — every term it
 * has ever scheduled, not just the one on screen. Nobody declares it and
 * nobody is asked for it; a habit repeated a few thousand times is a stronger
 * statement than any settings field.
 *
 * Cached per department against the same change beacon the live feed already
 * runs on, so reading it costs one pass over the rows and then nothing at all
 * until some schedule somewhere is written.
 *
 * A declared rule still wins. If a department has explicitly stated a doorway,
 * that number is used and the learned one is not — a person who says something
 * out loud outranks a pattern the software inferred.
 */
interface DepartmentStyle {
  reading:RhythmReading|null;
  doorway:number;
  memory:DepartmentMemory|null;
  /** Course pairs that share students, from whoever answered the survey. */
  cohort:Set<string>;
  cohortSize:(a:number,b:number)=>number;
}
const NO_COHORT:Pick<DepartmentStyle,"cohort"|"cohortSize">={cohort:new Set(),cohortSize:()=>0};
const rhythmCache=new Map<string,{serial:number;at:number}&DepartmentStyle>();
const rhythmRefreshing=new Map<string,Promise<DepartmentStyle>>();
/* ── عادةُ القسم لا تتغيّر بحفظة واحدة ──────────────────────────────────────
 * القراءة أدناه تمرّ على كل فصول القسم (عشر سنوات) — وكانت تُعاد كاملةً بعد
 * كل حفظ في أي قسم (driftSerial)، فيطول «جاري الفحص» في أول فحص بعد أي حفظ.
 * وكل ما تُخرجه ملاحظاتٌ لينة لا تمنع الحفظ. فالقراءة السابقة تُجيب فوراً ما
 * دامت حديثة، وتُحدَّث في الخلفية مرة واحدة. */
const RHYTHM_STALE_MS=10*60_000;
const styleOf=(cached:DepartmentStyle):DepartmentStyle=>({reading:cached.reading,doorway:cached.doorway,memory:cached.memory,cohort:cached.cohort,cohortSize:cached.cohortSize});

export async function departmentStyle(row:any):Promise<DepartmentStyle>{
  const collegeId=Number(row?.AdCollegeId||0),sectionId=Number(row?.AdSectionId||0);
  if(!collegeId)return{reading:null,doorway:0,memory:null,...NO_COHORT};
  const key=dataContextCacheKey(`${collegeId}:${sectionId}`);
  const cached=rhythmCache.get(key);
  if(cached&&cached.serial===driftSerial)return styleOf(cached);
  const refresh=()=>{
    const running=rhythmRefreshing.get(key);
    if(running)return running;
    const job=readDepartmentStyle(row,key).finally(()=>rhythmRefreshing.delete(key));
    rhythmRefreshing.set(key,job);
    return job;
  };
  if(cached&&Date.now()-cached.at<RHYTHM_STALE_MS){void refresh().catch(()=>undefined);return styleOf(cached);}
  return refresh();
}

async function readDepartmentStyle(row:any,key:string):Promise<DepartmentStyle>{
  const collegeId=Number(row?.AdCollegeId||0),sectionId=Number(row?.AdSectionId||0),termId=Number(row?.AdTermId||0);
  const serial=driftSerial;
  try{
    // Every term this department has ever run. History is the whole point:
    // a habit is what survives across years, and one term of it is chance.
    const history=(await Repository.getSchedules()).filter(item=>
      Number(item.AdCollegeId)===collegeId&&(!sectionId||Number(item.AdSectionId)===sectionId));
    const reading=learnRhythm(history);
    /* The same pass answers the memory's questions too — one read of history
       serves both, and neither is computed again until something is written. */
    const [memCourses,memPeople]=await Promise.all([Repository.getCourses(),Repository.getInstructors()]);
    const memory=readDepartmentMemory(history,memCourses,memPeople);
    const rules=termId?await Repository.getScheduleConstraints(collegeId,sectionId,termId).catch(()=>[]):[];
    const declared=Number(rules.find(item=>item.type==="room_doorway"&&item.enabled!==false)?.maxMinutes||0);
    /* The learned break is per pattern; the sweep takes one number, so it takes
       the SMALLEST habit across patterns. Flagging at the tighter of the two
       cannot invent a finding on the looser one. */
    const learned=Math.min(...reading.patterns.map(p=>p.breakMinutes||Infinity));
    /* ── القاعدة المقرَّرة أولاً، ثم ما يعلنه القسم ───────────────────────────
     * The college states this per day family — ten minutes on Sun/Tue/Thu,
     * fifteen on Mon/Wed — and one learned number cannot say that: whichever
     * value history produced was wrong on one of the two families. Zero here
     * means "no declared override", and the engine then reads the requirement
     * from the days each pair actually shares.
     *
     * A department that declares its own figure still wins, exactly as before:
     * a rule somebody states out loud outranks both the institutional default
     * and a pattern the software inferred. `learned` is kept for the rhythm
     * reading that still uses it elsewhere. */
    void learned;
    const doorway=Math.max(0,Math.min(60,declared));
    /* What the students said, read on the same pass and cached against the
       same beacon. A department that has never run a survey pays nothing and
       sees exactly what it saw before. */
    let cohort=new Set<string>(), cohortSize:(a:number,b:number)=>number=()=>0;
    if(termId&&sectionId){
      try{
        const needs=await Repository.getStudentNeeds(collegeId,sectionId,termId);
        if(needs.length){
          const demand=readStudentDemand(needs,memCourses.filter(c=>Number(c.AdSectionId)===sectionId));
          cohort=cohortPairs(demand);
          cohortSize=(a,b)=>sharedBetween(demand,a,b);
        }
      }catch{ /* no survey is the ordinary case */ }
    }
    rhythmCache.set(key,{serial,at:Date.now(),reading,doorway,memory,cohort,cohortSize});
    if(rhythmCache.size>200)rhythmCache.clear();
    return{reading,doorway,memory,cohort,cohortSize};
  }catch{return{reading:null,doorway:0,memory:null,...NO_COHORT};}
}

/**
 * The reading that belongs BEFORE the copy.
 *
 * `/genesis` already builds next term from last term into a draft, and touches
 * nothing real. What it never said is the one thing a coordinator needs first:
 * of three hundred lectures, which carry a decision inside them? A course that
 * has left the catalogue, a teacher on sabbatical, a hall nobody uses any more,
 * a course whose name was rewritten — each of those is a row somebody has to
 * think about, and the other two hundred and eighty are not.
 *
 * This reads; it does not write. The draft is still made by the endpoint below,
 * and only after a person has seen this.
 */
/**
 * ── ما الذي تغيّر تحت الجدول المعتمد ────────────────────────────────────────
 *
 * The one check nobody triggers. It is deliberately lazy: the answer is kept
 * per scope and thrown away the moment ANY schedule anywhere is written, using
 * the change beacon the live feed already runs on. A department that reads this
 * ten times an hour on an unchanged university pays for one scan.
 *
 * There is no cron, no background job, and nothing that wakes a server up.
 */
export const driftCache = new Map<string, { serial: number; body: unknown }>();
export const historicalTimeCache = new Map<string, { serial:number; expiresAt:number; body:ReturnType<typeof buildHistoricalTimeModel> }>();
export let driftSerial = 0;
onSchedulesInvalidated(() => { driftSerial += 1; historicalTimeCache.clear(); });
