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
 * PDF professor cells can be blank; the first-published import snapshot then
 * supplies the only actual "before" professor identity. Restore only uniquely
 * proven source-to-published pairs. Never infer a teacher from the current row.
 */
export function withFirstPublishedAuthorityInstructors(
  scanned: readonly Row[],published:readonly Row[],courseCodeById?:Map<number,string>,
):Row[]{
  const matches=matchAuthoritySourceRows(scanned,published,courseCodeById);
  return scanned.map((source,index)=>{
    if(Number(source.AdInstructorId||0)>0||String(source.sourceInstructorText||"").trim())return {...source};
    const initialIndex=matches.get(index);
    const initial=initialIndex===undefined?null:published[initialIndex];
    const firstId=Number(initial?.AdInstructorId||0);
    return firstId>0?{...source,AdInstructorId:firstId}:{...source};
  });
}
