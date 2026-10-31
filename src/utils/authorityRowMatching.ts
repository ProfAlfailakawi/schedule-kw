/**
 * Reconcile original Authority PDF appointments with live imported appointments.
 *
 * The SWRSCHA source may have gaps (501, 503, 504, 506, 508...). The import
 * currently generates consecutive section numbers instead, and legacy imports
 * can also carry an incorrect reference. Neither generated section nor an
 * incompatible imported CRN is enough to call an appointment new/deleted.
 *
 * The source PDF/DB are immutable here. Match uniquely by original CRN, then
 * academic placement, then checked import provenance and narrowly corroborated
 * section identity. Never consume a user-created row or guess an ambiguous pair.
 */
type Row = Record<string, any>;
const clean = (v: unknown) => String(v ?? "").normalize("NFKC").replace(/[\s\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,"").trim().toUpperCase();
const number = (v: unknown) => clean(v).replace(/^0+(?=\d)/,"");
const clock = (v: unknown) => {
  const s=clean(v), m=s.match(/^(\d{1,2}):(\d{2})$/);
  if(m)return `${m[1].padStart(2,"0")}:${m[2]}`;
  const digits=s.replace(/\D/g,"");
  return /^\d{3,4}$/.test(digits)?`${digits.slice(0,-2).padStart(2,"0")}:${digits.slice(-2)}`:"";
};
const weekday = (row: Row) => ["fsunday","fmonday","ftuesday","fwednesday","fthursday"].map(f=>{
  const raw=String(row[f]??"").toLowerCase().trim();
  return row[f]===true||row[f]===1||raw==="1"||raw==="true"||raw==="yes"||raw==="y"?"1":"0";
}).join("");
const room = (v: unknown) => ["","—","-","ـ","N/A"].includes(clean(v))?"":clean(v);
const reference = (row: Row) => clean(row.referenceNumber);
const site = (row: Row) => {
  const building=clean(row.AdRoomCode||row.sourceBuildingText);
  return building.match(/^\d{3}[A-Z]/)?.[0]||clean(row.sourceSitePrefix);
};
const placement = (row: Row) => ({
  site:site(row),building:room(row.AdRoomCode),room:room(row.AdRoomHall),
  day:weekday(row),time:[clock(row.fstarttime),clock(row.fendtime)].join("~"),
});
const courseCode = (row:Row, codes?:Map<number,string>) => {
  const raw=clean(codes?.get(Number(row.AdCourseId||0))||row.CourseCodeSnapshot||row.sourceCourseCode);
  return raw.replace(/[^A-Z0-9]/g,"");
};
const courseKey = (row:Row,codes?:Map<number,string>) => {
  const code=courseCode(row,codes);
  if(code)return "C:"+(/\d{7}$/.test(code)?code.slice(-3):code);
  const id=Number(row.AdCourseId||0);
  return id>0?"I:"+id:"";
};
const sameCourse=(a:Row,b:Row,codes?:Map<number,string>)=>{
  const sourceA=clean(a.sourceCourseCode).replace(/[^A-Z0-9]/g,"");
  const sourceB=clean(b.sourceCourseCode).replace(/[^A-Z0-9]/g,"");
  // An imported 0118xxx cross-department elective is not 0109xxx merely
  // because their three-digit catalogue suffix happens to agree.
  if(/^\d{7}$/.test(sourceA)&&/^\d{7}$/.test(sourceB)&&sourceA!==sourceB)return false;
  const ac=courseCode(a,codes),bc=courseCode(b,codes);
  if(ac&&bc){
    if(/^\d{7}$/.test(ac)&&/^\d{7}$/.test(bc))return ac===bc;
    return (/\d{7}$/.test(ac)?ac.slice(-3):ac)===(/\d{7}$/.test(bc)?bc.slice(-3):bc);
  }
  if(ac||bc)return false; // No evidence that a course with an unknown code is the same.
  return Number(a.AdCourseId)>0&&Number(a.AdCourseId)===Number(b.AdCourseId);
};
const corroboration=(a:Row,b:Row)=>{
  const x=placement(a),y=placement(b);
  return Number(Boolean(x.building&&x.building===y.building))
    +Number(Boolean(x.room&&x.room===y.room))
    +Number(Boolean(x.day!=="00000"&&x.day===y.day))
    +Number(Boolean(x.time!=="~"&&x.time===y.time));
};
export const isAuthorityImportedRow=(row:Row)=>{
  const order=row.sourceOrder;
  if(order!==undefined&&order!==null&&Number.isFinite(Number(order))&&Number(order)>=1_000_000)return false;
  return Boolean(reference(row)||row.sourceCourseCode||row.sourceCourseText||row.sourceSectionText||row.importEvidence);
};
const section=(row:Row,source:boolean)=>{
  const original=number(row.sourceSectionText);
  // Source 501/503/... is official identity. The importer may have replaced
  // it with sequential 501/502/503. For legacy 01/02, use system convention.
  if(source&&/^\d{3,4}$/.test(original)&&Number(original)>=500&&Number(original)<=999)return original;
  return number(row.SCode);
};
const validTime=(p:ReturnType<typeof placement>)=>p.time!=="~"&&!p.time.startsWith("~")&&!p.time.endsWith("~");
export function matchAuthoritySourceRows(
  baseline: readonly Row[],
  current: readonly Row[],
  courseCodeById?:Map<number,string>,
):Map<number,number>{
  const pairs=new Map<number,number>(),taken=new Set<number>();
  const candidate=current.map((r,i)=>isAuthorityImportedRow(r)?i:-1).filter(i=>i>=0);
  const academic=(a:Row,b:Row)=>{
    if(!sameCourse(a,b,courseCodeById))return false;
    const sa=site(a),sb=site(b);
    return !sa||!sb||sa===sb;
  };
  const code=(r:Row)=>courseKey(r,courseCodeById);
  // Unique on *both* sides, always. This intentionally refuses ambiguous
  // combinations (identical lectures for separate sections).
  const stage=(key:(r:Row,source:boolean)=>string,accept:(a:Row,b:Row)=>boolean=academic)=>{
    const sources=new Map<string,number[]>(),lives=new Map<string,number[]>();
    for(let i=0;i<baseline.length;i++){
      if(pairs.has(i))continue;
      const k=key(baseline[i],true);
      if(k)sources.set(k,[...(sources.get(k)||[]),i]);
    }
    for(const j of candidate){
      if(taken.has(j))continue;
      const k=key(current[j],false);
      if(k)lives.set(k,[...(lives.get(k)||[]),j]);
    }
    for(const [k,s] of sources){
      const l=lives.get(k)||[];
      if(s.length!==1||l.length!==1)continue;
      const i=s[0],j=l[0];
      if(!accept(baseline[i],current[j]))continue;
      pairs.set(i,j);taken.add(j);
    }
  };
  const fields=(r:Row,kind:string)=>{
    const x=placement(r),c=code(r);
    if(!c||!x.site)return "";
    if(kind==="full"&&validTime(x)&&x.day!=="00000")
      return [c,x.site,x.building,x.room||"?",x.day,x.time].join("|");
    if(kind==="room"&&validTime(x)&&x.day!=="00000"&&x.building)
      return [c,x.site,x.building,x.day,x.time].join("|");
    if(kind==="time"&&x.day!=="00000"&&x.building&&x.room)
      return [c,x.site,x.building,x.room,x.day].join("|");
    if(kind==="day"&&validTime(x)&&x.building&&x.room)
      return [c,x.site,x.building,x.room,x.time].join("|");
    if(kind==="building"&&validTime(x)&&x.day!=="00000"&&x.room)
      return [c,x.site,x.room,x.day,x.time].join("|");
    if(kind==="building-room"&&validTime(x)&&x.day!=="00000")
      return [c,x.site,x.day,x.time].join("|");
    return "";
  };
  // Protect a real printed reference from being stolen by matching a sequential
  // section before a later row with the same CRN has been considered.
  stage(r=>reference(r)?`ref|${reference(r)}`:"");
  // Critical order: academic appointment BEFORE sequential/generated SCode.
  // Example: original 0109212 / section 529 / CRN 2095 -> current section 516.
  stage(r=>fields(r,"full"));
  for(const kind of ["room","time","day","building","building-room"])
    stage(r=>fields(r,kind));
  // Source PDF order can be trusted only as a corroborated import trace, NOT
  // in isolation: older scans may reassign order when merging multi-page PDFs.
  stage(r=>{
    const n=Number(r.sourceOrder);
    return r.sourceOrder!==null&&r.sourceOrder!==undefined&&Number.isInteger(n)&&n>=0&&n<1_000_000&&code(r)&&site(r)
      ?[code(r),site(r),"order",n].join("|"):"";
  },(a,b)=>academic(a,b)&&corroboration(a,b)>=2);
  // If a real edited class changed its meeting, its printed section can still
  // identify it, but ONLY with two independent unchanged timetable attributes.
  // A 501 regenerated from a printed 503 is never mistaken for that 503.
  stage((r,isSource)=>{
    const c=code(r),s=section(r,isSource),p=placement(r);
    return c&&s&&p.site?[c,p.site,"section",s].join("|"):"";
  },(a,b)=>academic(a,b)&&corroboration(a,b)>=2);
  return pairs;
}

/**
 * One-to-one corrections confirmed against the ORIGINAL girls' Authority PDF
 * for term 2026/27 T2 and the live schedule. The original reference is
 * immutable; a regenerated section is not an identifier. These are *report*
 * links only: they never modify any timetable row, CRN, or database record.
 *
 * Both ends must match the complete known appointment (official course,
 * original printed CRN, campus/building, weekday, time, room and new section).
 * Missing/mismatched or duplicate evidence is left untouched. This keeps a
 * future term, another campus, another section, or another real addition safe.
 */
const confirmedGirlLinks=[
  {
    course:"0109112",reference:"2053",building:"012B08",
    original:{days:"10101",start:"14:00",end:"14:50",room:"G20"},
    current:{section:"507",days:"10101",start:"10:00",end:"10:50",room:"G20"},
  },
  {
    course:"0109445",reference:"2530",building:"012B08",
    original:{days:"01000",start:"11:00",end:"13:50",room:""},
    current:{section:"501",days:"00100",start:"08:00",end:"10:50",room:"F17"},
  },
  {
    course:"0109499",reference:"2787",building:"012B08",
    original:{days:"10000",start:"16:00",end:"17:50",room:"F16"},
    current:{section:"502",days:"00100",start:"12:00",end:"14:50",room:"F17"},
  },
] as const;

function applyConfirmedAuthorityLinks(
  baseline:readonly Row[],
  current:readonly Row[],
  pairs:Map<number,number>,
  codes?:Map<number,string>,
):void {
  const used=new Set(pairs.values());
  const rightCourse=(row:Row,expected:string)=>{
    const source=clean(row.sourceCourseCode).replace(/[^A-Z0-9]/g,"");
    if(/^\\d{7}$/.test(source))return source===expected;
    const code=courseCode(row,codes);
    return code===expected || (/^\\d{3}$/.test(code)&&code===expected.slice(-3));
  };
  const meeting=(row:Row,appointment:{days:string;start:string;end:string;room:string})=>
    weekday(row)===appointment.days &&
    clock(row.fstarttime)===appointment.start &&
    clock(row.fendtime)===appointment.end &&
    room(row.AdRoomHall)===appointment.room;
  for(const link of confirmedGirlLinks){
    const sources=baseline.map((row,i)=>({row,i})).filter(({row})=>
      reference(row)===link.reference && rightCourse(row,link.course) &&
      room(row.AdRoomCode)===link.building && meeting(row,link.original));
    const targets=current.map((row,i)=>({row,i})).filter(({row})=>
      isAuthorityImportedRow(row) && rightCourse(row,link.course) &&
      room(row.AdRoomCode)===link.building && number(row.SCode)===link.current.section &&
      meeting(row,link.current));
    if(sources.length!==1||targets.length!==1)continue;
    const si=sources[0].i,ci=targets[0].i;
    if(pairs.has(si)||used.has(ci))continue;
    pairs.set(si,ci);used.add(ci);
  }
}

/**
 * An edited imported appointment retains its database id from first publish.
 * A legacy import can also retain its unique sourceOrder across preview and
 * publication, even if time, days and room were edited together. Match that
 * historical origin through the initial published snapshot *before* trying to
 * infer an identity from the live academic placement.
 *
 * This is an evidence-only bridge. No record is changed or relabelled. An
 * imported row with no provable history stays unlinked; it must never be called
 * a confirmed new appointment merely to suppress an ambiguous PDF label.
 */
export function matchAuthorityThroughPublication(
  baseline: readonly Row[],
  published: readonly Row[],
  current: readonly Row[],
  courseCodeById?: Map<number,string>,
): Map<number,number> {
  if (!published.length) {
    const approved=new Map<number,number>();
    applyConfirmedAuthorityLinks(baseline,current,approved,courseCodeById);
    const sourceIndices=baseline.map((_,i)=>i).filter(i=>!approved.has(i));
    const used=new Set(approved.values());
    const currentIndices=current.map((_,i)=>i).filter(i=>!used.has(i));
    const fallback=matchAuthoritySourceRows(
      sourceIndices.map(i=>baseline[i]),currentIndices.map(i=>current[i]),courseCodeById);
    for(const [i,j] of fallback)approved.set(sourceIndices[i],currentIndices[j]);
    return approved;
  }

  const sourceToPublished=new Map<number,number>();
  const publishedTaken=new Set<number>();
  const compatible=(a:Row,b:Row) => {
    if(!sameCourse(a,b,courseCodeById))return false;
    const origin=site(a),target=site(b);
    return !origin||!target||origin===target;
  };
  const signature=(row:Row)=>{
    const order=Number(row.sourceOrder);
    if(!isAuthorityImportedRow(row)||row.sourceOrder===null||row.sourceOrder===undefined||
      !Number.isInteger(order)||order<0||order>=1_000_000)return "";
    const code=courseKey(row,courseCodeById),prefix=site(row);
    return code&&prefix?`${code}|${prefix}|${order}`:"";
  };
  // Preserve exact unique original import position *within the same draft*.
  // This is safer than reconstructing the link from changed clocks/rooms.
  const originBuckets=new Map<string,number[]>(),snapshotBuckets=new Map<string,number[]>();
  baseline.forEach((row,i)=>{
    const key=signature(row);
    if(key)originBuckets.set(key,[...(originBuckets.get(key)||[]),i]);
  });
  published.forEach((row,i)=>{
    const key=signature(row);
    if(key)snapshotBuckets.set(key,[...(snapshotBuckets.get(key)||[]),i]);
  });
  for(const [key,indices] of originBuckets){
    const publishedIndices=snapshotBuckets.get(key)||[];
    if(indices.length!==1||publishedIndices.length!==1)continue;
    const origin=indices[0],snap=publishedIndices[0];
    if(!compatible(baseline[origin],published[snap]))continue;
    sourceToPublished.set(origin,snap);publishedTaken.add(snap);
  }
  // Older drafts lack original sourceOrder on some rows. Reconcile those rows
  // by the strict source comparison, after reserving the verified positions.
  const remainingOrigins=baseline.map((_,i)=>i).filter(i=>!sourceToPublished.has(i));
  const remainingPublished=published.map((_,i)=>i).filter(i=>!publishedTaken.has(i));
  const extra=matchAuthoritySourceRows(
    remainingOrigins.map(i=>baseline[i]),
    remainingPublished.map(i=>published[i]),
    courseCodeById,
  );
  for(const [sourceIndex,snapshotIndex] of extra){
    const original=remainingOrigins[sourceIndex],snap=remainingPublished[snapshotIndex];
    if(compatible(baseline[original],published[snap])){
      sourceToPublished.set(original,snap);publishedTaken.add(snap);
    }
  }

  const sourceToCurrent=new Map<number,number>(),currentTaken=new Set<number>();
  // IDs are the definitive provenance bridge: publication saves assigned IDs
  // in the immutable draft.rows and normal edits preserve the same IDs.
  const byLiveId=new Map<number,number[]>();
  current.forEach((row,index)=>{
    const id=Number(row.id);
    if(!isAuthorityImportedRow(row)||!Number.isSafeInteger(id)||id<=0)return;
    byLiveId.set(id,[...(byLiveId.get(id)||[]),index]);
  });
  const snapshotIdCount=new Map<number,number>();
  for(const snap of sourceToPublished.values()){
    const id=Number(published[snap].id);
    if(Number.isSafeInteger(id)&&id>0)snapshotIdCount.set(id,(snapshotIdCount.get(id)||0)+1);
  }
  for(const [origin,snap] of sourceToPublished){
    const id=Number(published[snap].id);
    if(!Number.isSafeInteger(id)||id<=0||snapshotIdCount.get(id)!==1)continue;
    const matches=byLiveId.get(id)||[];
    if(matches.length!==1)continue;
    const index=matches[0];
    if(currentTaken.has(index)||!compatible(baseline[origin],current[index]))continue;
    sourceToCurrent.set(origin,index);currentTaken.add(index);
  }
  // If IDs were regenerated by a controlled restore, sourceOrder + original
  // official/current CRN is an acceptable *second* independent link.
  const livePositionBuckets=new Map<string,number[]>();
  current.forEach((row,index)=>{
    if(currentTaken.has(index))return;
    const key=signature(row);
    if(key)livePositionBuckets.set(key,[...(livePositionBuckets.get(key)||[]),index]);
  });
  const snapshotPositionBuckets=new Map<string,number[]>();
  for(const [origin,snap] of sourceToPublished){
    if(sourceToCurrent.has(origin))continue;
    const key=signature(published[snap]);
    if(key)snapshotPositionBuckets.set(key,[...(snapshotPositionBuckets.get(key)||[]),origin]);
  }
  for(const [key,origins] of snapshotPositionBuckets){
    const indices=livePositionBuckets.get(key)||[];
    if(origins.length!==1||indices.length!==1)continue;
    const origin=origins[0],index=indices[0],snap=published[sourceToPublished.get(origin)!];
    const oldRef=reference(snap),newRef=reference(current[index]);
    if(!oldRef||oldRef!==newRef||!compatible(snap,current[index]))continue;
    sourceToCurrent.set(origin,index);currentTaken.add(index);
  }
  // User-confirmed original/live appointment links take precedence over
  // inferred academic similarity, but never steal a provenance-matched row.
  applyConfirmedAuthorityLinks(baseline,current,sourceToCurrent,courseCodeById);
  for(const index of sourceToCurrent.values())currentTaken.add(index);
  // Last resort is the existing strictly unique academic comparator, but
  // only across leftovers. It cannot steal a proven first-published identity.
  const restOrigins=baseline.map((_,i)=>i).filter(i=>!sourceToCurrent.has(i));
  const restCurrent=current.map((_,i)=>i).filter(i=>!currentTaken.has(i));
  const fallback=matchAuthoritySourceRows(restOrigins.map(i=>baseline[i]),restCurrent.map(i=>current[i]),courseCodeById);
  for(const [i,j] of fallback)sourceToCurrent.set(restOrigins[i],restCurrent[j]);
  return sourceToCurrent;
}

/**
 * PDF professor cells can be blank; the first-published import snapshot then
 * supplies the only actual "before" professor identity. Restore only uniquely
 * proven source-to-published pairs. Never infer a teacher from the current row.
 */
export function withFirstPublishedAuthorityInstructors(
  scanned: readonly Row[],published:readonly Row[],courseCodeById?:Map<number,string>,
):Row[]{
  const matches=matchAuthorityThroughPublication(scanned,published,published,courseCodeById);
  return scanned.map((source,index)=>{
    if(Number(source.AdInstructorId||0)>0||String(source.sourceInstructorText||"").trim())return {...source};
    const initialIndex=matches.get(index);
    const initial=initialIndex===undefined?null:published[initialIndex];
    const firstId=Number(initial?.AdInstructorId||0);
    // A provably blank *published* teacher is a known before-state: assigning a
    // teacher afterwards is a real change. Missing published evidence is not.
    if(!initial)return {...source};
    return {...source,__hasPublishedInstructorBaseline:true,...(firstId>0?{AdInstructorId:firstId}:{})};
  });
}
