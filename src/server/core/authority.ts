/**
 * ── مقارنةُ ملف الجهة الرسمية (PDF) بالجدول ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { Repository } from "../../db/repository";
import { authorityRowsForScope } from "../../utils/approvalScope";
import { instructorCleanName } from "../../utils/instructorIdentity";
import { authorityFieldMatchesOriginal } from "../../utils/authorityNetChange";
import { cleanBuildingCode, cleanHallCode } from "../../utils/documentOcr";
import { assignAuthoritySections } from "../../utils/authorityAcademicCodes";
import { splitRowsByBranch } from "../../utils/branchScope";
import { foldHeaderIdentity } from "./ordering";

const AUTHORITY_PDF_COMPARE_FIELDS = [
  "AdCourseId","SCode","AdInstructorId",
  "fsunday","fmonday","ftuesday","fwednesday","fthursday",
  "fstarttime","fendtime","AdRoomCode","AdRoomHall"
] as const;

/** Compare the immutable source PDF with the LIVE timetable, not the saved
 * draft. sourceOrder is the stable trace carried from the PDF through publish;
 * ordinary rows created later live outside the imported source range. */
/** رمز المقرر الرسمي لكل رقم كتالوج — هوية المقرر التي تعبر الأقسام. */
export async function authorityCourseCodeMap(){
  const courses=await Repository.getCourses();
  return new Map<number,string>(courses.map((course:any)=>[Number(course.AdCourseId),String(course.CourseCode||"").trim()]));
}

export function buildAuthorityPdfDiff(baselineInput:any[],currentInput:any[],options:{instructorNameById?:Map<number,string>;courseCodeById?:Map<number,string>}={}){
  const baseline=assignAuthoritySections([...(baselineInput||[])]).sort((a:any,b:any)=>Number(a.sourceOrder)-Number(b.sourceOrder));
  const current=[...(currentInput||[])];
  const consumed=new Set<number>();
  const refKey=(value:any)=>String(value||"").replace(/[\s\u200e\u200f\u202a-\u202e]/g,"").trim();
  const sectionKey=(row:any)=>`${Number(row?.AdCourseId||0)}|${String(row?.SCode||"").trim()}`;
  /* A row created after the Authority PDF is a new academic action forever:
     editing it keeps it green, and deleting it removes it from the report.
     sourceOrder >= 1,000,000 is the explicit post-PDF range. Older imported
     rows that pre-date sourceOrder can still prove their PDF origin through
     CRN/reference or the immutable import-evidence fields. */
  const hasPdfEvidence=(row:any)=>Boolean(refKey(row?.referenceNumber)||row?.sourceCourseCode||row?.sourceCourseText||row?.sourceSectionText||row?.importEvidence);
  const isImportedPdfRow=(row:any)=>{
    const rawOrder=row?.sourceOrder;
    /* sourceOrder alone is not provenance. A manual form can inherit stale UI
       state, but it cannot manufacture immutable PDF evidence. Requiring both
       keeps every post-PDF row green even after later edits. */
    if(rawOrder!==undefined&&rawOrder!==null&&Number.isFinite(Number(rawOrder)))return Number(rawOrder)<1_000_000&&hasPdfEvidence(row);
    return hasPdfEvidence(row);
  };
  const uniqueIndex=(predicate:(row:any)=>boolean)=>{
    const matches:number[]=[];
    current.forEach((row:any,index:number)=>{if(!consumed.has(index)&&predicate(row))matches.push(index);});
    return matches.length===1?matches[0]:-1;
  };
  const matchIndex=(source:any)=>{
    const reference=refKey(source?.referenceNumber);
    const order=Number(source?.sourceOrder);

    /* The CRN/reference number printed by the Authority is the strongest row
       identity we own.  Prefer it BEFORE sourceOrder.  sourceOrder is a visual
       import trace and can drift when an old baseline was renumbered/rebuilt;
       pairing by a stale order is exactly how one untouched row can inherit a
       different row and make every visible cell look yellow. */
    if(reference){
      const byReference=uniqueIndex((row:any)=>
        isImportedPdfRow(row)&&refKey(row?.referenceNumber)===reference
      );
      if(byReference>=0)return byReference;

      /* Legacy live rows can occasionally lose the persisted CRN while still
         retaining the immutable imported order.  Allow that fallback only when
         the candidate has NO conflicting reference.  Never pair a baseline CRN
         with another non-empty CRN merely because sourceOrder happens to match. */
      if(Number.isFinite(order)){
        const byOrder=uniqueIndex((row:any)=>{
          if(!isImportedPdfRow(row)||Number(row?.sourceOrder)!==order)return false;
          const currentReference=refKey(row?.referenceNumber);
          return !currentReference||currentReference===reference;
        });
        if(byOrder>=0)return byOrder;
      }

      /* A source row with a real CRN that is no longer present is a deletion.
         Do NOT fall through to course+section and accidentally consume another
         imported row, which would generate a full-row false diff. */
      return -1;
    }

    if(Number.isFinite(order)){
      const byOrder=uniqueIndex((row:any)=>isImportedPdfRow(row)&&Number(row?.sourceOrder)===order);
      if(byOrder>=0)return byOrder;
    }

    /* Last conservative fallback for legacy imported rows that truly have no
       reference number. A manual post-PDF row can never enter this path. */
    const signature=sectionKey(source);
    if(!signature.startsWith("0|")){
      const bySection=uniqueIndex((row:any)=>isImportedPdfRow(row)&&!refKey(row?.referenceNumber)&&sectionKey(row)===signature);
      if(bySection>=0)return bySection;
    }
    return -1;
  };
  const reportRows:any[]=[];
  baseline.forEach((source:any)=>{
    const index=matchIndex(source);
    if(index<0){
      reportRows.push({status:"deleted",changedFields:[],referenceNumber:String(source.referenceNumber||""),source,current:null});
      return;
    }
    consumed.add(index);
    /* نسخة محلية: الصف الحي كائنٌ من ذاكرة الجداول المشتركة، والمقارنة لا تكتب فيه. */
    const next={...current[index]};
    source={...source};
    /* Compare the academic meaning of each printed cell, not incidental storage
       representation. Imported booleans, numeric ids, clocks and location codes
       can pass through JSON/Firestore with harmless type/spacing differences;
       those must never turn untouched cells yellow. */
    const normalizeEmpty = (val: any) => {
      const s = String(val ?? "").trim();
      if (!s || s === "—" || s === "-" || s === "ـ" || s === "N/A" || s === "غير متوفر" || s === "غير محدد" || s === "غير موجود" || s === "---") return "";
      return s;
    };
    const comparable=(field:string,value:any)=>{
      /* ── المقرر يُعرف برمزه لا برقمه الداخلي ────────────────────────────
       * المقرر الواحد له رقم مستقل في كتالوج كل قسم، والنشر يضع صف الجهراء في
       * قسم الجهراء برقم كتالوجه هناك. فمقارنة الرقم بالرقم كانت تقول إن
       * المقرر «تغيّر» في كل صف من مواقع الفرع — ومعه الوحدات والساعات والسعة
       * لأنها تتبعه — فيخرج التقرير مصفرّاً كله بينما لم يُعدَّل إلا القاعة.
       * الرمز الرسمي هو هوية المقرر عبر الأقسام، فبه تُقارن. */
      if(field==="AdCourseId"){
        const code=options.courseCodeById?.get(Number(value||0));
        return code ? `code:${String(code).trim()}` : Number(value||0);
      }
      if(field==="AdInstructorId")return Number(value||0);
      if(["SCode"].includes(field)){
        const num=String(value??"").replace(/\D/g,"").replace(/^0+/,"");
        return num || String(value??"").trim();
      }
      if(["fsunday","fmonday","ftuesday","fwednesday","fthursday"].includes(field)){
        /* Firestore/JSON history can preserve imported weekday flags as 0/1
           strings. Boolean("0") is true in JavaScript and used to paint every
           untouched day cell yellow. Compare the academic flag, not JS truthiness. */
        const token=String(value??"").trim().toLowerCase();
        return value===true||value===1||token==="1"||token==="true"||token==="y"||token==="yes";
      }
      if(field==="AdRoomCode"){
        const valStr=normalizeEmpty(value).replace(/\s+/g,"").toUpperCase();
        /* Compare the complete canonical building token.  Keeping only the first
           three digits (012) hides real B07 -> B09 edits and makes cell-level
           diffing semantically inconsistent with what the report prints. */
        return cleanBuildingCode(valStr)||valStr;
      }
      if(field==="AdRoomHall"){
        const clean = cleanHallCode(String(value || ""));
        const norm = normalizeEmpty(value).replace(/\s+/g,"").toUpperCase();
        return clean || norm;
      }
      if(["fstarttime","fendtime"].includes(field)){
        const str = String(value||"").trim();
        const match = str.match(/(\d{1,2}):(\d{2})/);
        if(match) return `${match[1].padStart(2,"0")}:${match[2]}`;
        const digits=String(value||"").replace(/\D/g,"");
        if(/^\d{3,4}$/.test(digits)){const hh=digits.slice(0,-2).padStart(2,"0"),mm=digits.slice(-2);return `${hh}:${mm}`;}
        return normalizeEmpty(value);
      }
      return normalizeEmpty(value);
    };
    /* قانون الهوية المشترك، مع كلمات الصفة التي يلحقها تقرير المقارنة وحده. */
    const cleanInstructor=(val:unknown)=>instructorCleanName(String(val??""))
      .replace(/(?:^|\s)(?:منتدب|مساعد|محاضر)(?=\s|$)/g," ")
      .replace(/\s+/g," ")
      .trim();
    const sameInstructorIdentity=()=>{
      if(comparable("AdInstructorId",source.AdInstructorId)===comparable("AdInstructorId",next.AdInstructorId))return true;
      /* هويتان مسجّلتان مختلفتان = أستاذ تغيّر، مهما تشابه الاسم المطبوع:
         «يحيى سالم» يقع داخل «يحيى سالم العنزي» و«يحيى سالم الشمري» معاً. */
      if(Number(source.AdInstructorId||0)>0&&Number(next.AdInstructorId||0)>0)return false;
      const names=options.instructorNameById;
      const rawSource=String(source.sourceInstructorText||names?.get(Number(source.AdInstructorId))||"").trim();
      const rawNext=String(names?.get(Number(next.AdInstructorId))||next.sourceInstructorText||"").trim();
      if(rawSource&&rawNext&&rawSource===rawNext)return true;
      const sourceName=cleanInstructor(foldHeaderIdentity(source.sourceInstructorText||names?.get(Number(source.AdInstructorId))||""));
      const currentName=cleanInstructor(foldHeaderIdentity(names?.get(Number(next.AdInstructorId))||next.sourceInstructorText||""));
      /* Import/publish may resolve the exact professor text from the PDF to its
         canonical registry id. That is not a timetable edit. A real later
         instructor swap resolves to a different normalized name and remains a
         genuine yellow cell. */
      return Boolean(sourceName&&currentName&&(sourceName===currentName||sourceName.includes(currentName)||currentName.includes(sourceName)));
    };

    /* HEURISTIC: If OCR failed to extract certain fields on multi-page PDFs, 
       inherit them from the proven DB source to prevent false 'changed' or 'deleted' states. */
    /* ما عجزت القراءة الأصلية عن التقاطه لا يُعدّ «تعديلاً» — فتُكمَّل نسخة
       المصدر المحلية من الحي. أما العكس (ملء الحي من المصدر) فكان يُخفي
       تعديلاً حقيقياً: قاعة صارت «بانتظار التثبيت» تظهر بلا تغيير وبالقاعة القديمة. */
    if (!source.fstarttime && next.fstarttime) source.fstarttime = next.fstarttime;
    if (!source.fendtime && next.fendtime) source.fendtime = next.fendtime;
    if (!source.AdRoomCode && next.AdRoomCode) source.AdRoomCode = next.AdRoomCode;
    if (!source.AdRoomHall && next.AdRoomHall && source.locationStatus !== "PENDING_ROOM") source.AdRoomHall = next.AdRoomHall;
    if (!source.fsunday && !source.fmonday && !source.ftuesday && !source.fwednesday && !source.fthursday) {
      source.fsunday = next.fsunday;
      source.fmonday = next.fmonday;
      source.ftuesday = next.ftuesday;
      source.fwednesday = next.fwednesday;
      source.fthursday = next.fthursday;
    }

    const changedFields=AUTHORITY_PDF_COMPARE_FIELDS.filter(field=>{
      if(field==="AdInstructorId"&&sameInstructorIdentity())return false;
      /* Same original academic value after one or more edits is NOT a change. */
      if(authorityFieldMatchesOriginal(field,source,next))return false;
      return comparable(field,source[field])!==comparable(field,next[field]);
    });
    /* Section identity is source-owned. Older drafts may still carry a
       generated section from a pre-fix import; assignAuthoritySections repairs
       it from sourceSectionText before this comparison. Keep SCode out of the
       user-edit badge because the Authority preview locks that cell, while the
       full changedFields array still preserves audit truth. */
    const visibleChangedFields=changedFields.filter(field=>field!=="SCode");
    reportRows.push({status:visibleChangedFields.length?"changed":"unchanged",changedFields,referenceNumber:String(source.referenceNumber||next.referenceNumber||""),source,current:next});
  });
  current.forEach((row:any,index:number)=>{
    if(consumed.has(index))return;
    reportRows.push({status:"added",changedFields:[...AUTHORITY_PDF_COMPARE_FIELDS],referenceNumber:String(row.referenceNumber||""),source:null,current:row});
  });
  const counts=reportRows.reduce((acc:any,row:any)=>(acc[row.status]=(acc[row.status]||0)+1,acc),{added:0,deleted:0,changed:0,unchanged:0});
  return{rows:reportRows,counts};
}

export function inferAuthorityBranchCode(draft:any,rows:any[]){
  const explicit=String(draft?.sourceBranchCode||"").trim();
  if(explicit)return explicit;
  const votes=new Map<string,number>();
  for(const row of rows||[]){
    const match=String(row?.AdRoomCode||"").trim().match(/^(\d{3})/);
    if(match)votes.set(match[1],(votes.get(match[1])||0)+1);
  }
  return[...votes.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||"";
}

/**
 * خط الأساس الذي يخص هذا القسم وحده.
 *
 * المستند المعتمد واحد ويحوي مواقع الفرع كلها، وصفوفه تُنشر كل صف في موقعه.
 * فتقرير التغييرات لقسم بعينه يجب أن يقارن ما يخص ذلك الموقع فقط — وإلا ظهرت
 * صفوف الجهراء «محذوفة» في تقرير الرئيسي لمجرد أنها نُشرت حيث تنتمي. الصفوف
 * القديمة التي لا تحمل بادئة موقع تبقى مع الموقع الذي استُورد منه الملف.
 */
export async function authorityBaselineForScope(baseline:any[],draft:{AdCollegeId:number;AdSectionId:number},collegeId:number,sectionId:number){
  const rows=Array.isArray(baseline)?baseline:[];
  if(!rows.length)return rows;
  const [colleges,sections]=await Promise.all([Repository.getColleges(),Repository.getSections()]);
  const split=splitRowsByBranch(rows,{colleges:colleges as any,sections:sections as any,baseCollegeId:draft.AdCollegeId,baseSectionId:draft.AdSectionId});
  /* وثيقةُ الموقع الشقيق لا تصير أساسَ هذا القسم إلا بصفوفه هو (approvalScope). */
  return authorityRowsForScope(rows,split,draft,collegeId,sectionId);
}
