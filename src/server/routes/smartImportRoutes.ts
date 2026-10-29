/**
 * ── الاستيرادُ الذكي ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import express, { Response } from "express";
import { Repository } from "../../db/repository";
import { normalizeCivilId } from "../../utils/civilId";
import { applyVisitingToFaculty } from "../../utils/visitingToFaculty";
import { AR, countOf } from "../../utils/arabicCount";
import { normalizeClock, readScheduleTimeRange } from "../../utils/scheduleTime";
import { renderPdfPagesForSmartRead, cropRowStripsForSmartRead } from "../../utils/documentOcr";
import { bindGeminiRowsToCatalogue, buildSmartImportCatalogue, normalizeGeminiScheduleRows } from "../../utils/geminiScheduleLayer";
import { type AuthenticatedRequest, requirePermission } from "../core/auth";
import { requestGeminiScheduleLayer } from "../core/gemini";
import { documentReadingGate } from "../core/http";
import { canonicalizeHistoricalLocationForRuntime, readLocationRegistry } from "../core/locations";
import { isScopeAllowed, legacyFDetail } from "../core/scope";
import { safeDraftRows, smartContextFrom, validateSmartRows, visitingToFacultyPlan } from "../core/smartImport";

export function registerSmartImportRoutes(app: Express): void {

app.post("/api/intelligence/smart-import", requirePermission(7), express.raw({ type: ["application/octet-stream","application/pdf","image/*"], limit: "24mb" }), documentReadingGate, async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const bytes=Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0);
  if(!bytes.length){res.status(400).json({error:"لم يصل ملف للاستيراد الذكي"});return;}
  const mime=String(req.get("content-type")||req.query.mime||"application/octet-stream").split(";")[0].trim().toLowerCase();
  const encodedFileName=String(req.get("x-file-name")||"smart-import").slice(0,600);
  let fileName=encodedFileName;try{fileName=decodeURIComponent(encodedFileName);}catch{/* literal filename */}
  const [coursesAll,instructorsAll,terms,sections,colleges]=await Promise.all([
    Repository.getCourses(),Repository.getInstructors(),Repository.getTerms(),Repository.getSections(),Repository.getColleges(),
  ]);
  const sectionCourses=coursesAll.filter((course:any)=>Number(course.AdCollegeId)===collegeId&&Number(course.AdSectionId)===sectionId);
  const scopedInstructors=await Repository.getInstructorsByScope(sectionId,termId).catch(()=>[]);
  const instructorList=scopedInstructors.length?scopedInstructors:instructorsAll;
  const contextLabel={
    term:terms.find((term:any)=>Number(term.AdTermId)===termId)?.AdTermName||"",
    college:colleges.find((college:any)=>Number(college.AdCollegeId)===collegeId)?.AdCollegeName||"",
    section:sections.find((section:any)=>Number(section.AdSectionId)===sectionId)?.AdSectionName||"",
  };
  // Civil IDs are personal data and must never leave the server to Google.
  // buildSmartImportCatalogue is the single redaction point; the server re-binds
  // to real instructor IDs locally (against the full registry that still holds
  // civil numbers) after Gemini returns, matching by name/code.
  const catalogue=buildSmartImportCatalogue(sectionCourses,instructorList);
  /* Naming the rows that still have blanks keeps the answer small: the model
     transcribes a handful of cells instead of re-emitting a whole page it was
     never asked to change, which is most of the wait. */
  const wanted=String(req.query.need||"").trim().slice(0,600).replace(/[^\w\s,:;؀-ۿ-]/g,"");
  const instructions=(pageLabel:string)=>[
    "Extract an academic schedule from this document image into JSON only.",
    "Use this schema: { rows:[{courseCode,courseName,section,days,time,startTime,endTime,instructorName,building,room,referenceNumber,sourcePage,confidence,notes}], issues:[string] }.",
    "Never output civil IDs, national IDs, or any personal identification numbers, even if they appear in the document. Identify instructors by name only.",
    "TRANSCRIBE ONLY. Every value must be visibly printed on this page. If a cell is empty, unreadable, or cut off, return an empty string for it — never guess, never infer from neighbouring rows, never complete a pattern, and never copy a value from another row.",
    "Do not output a generic placeholder such as «هيئة تدريسية», «غير محدد», «TBA», or a dash in place of a value you cannot read: return an empty string instead.",
    "Transcribe EVERY row you can see on the page, complete with every legible cell. A single unreadable cell is returned empty — never drop the whole row for it, and never invent the cell.",
    /* The professional-era prompt steered nothing: the model read the whole
       page freely and OUR layer chose what to use. Naming "the rows that
       matter" steered it with section numbers the approved reader had already
       misread on exactly those rows — the model then hunted for rows that do
       not exist as named, and quality collapsed. The page is the instruction. */
    "The server will map values to IDs and reject anything that fails deterministic validators.",
    pageLabel,
    JSON.stringify({scope:{collegeId,sectionId,termId,...contextLabel},catalogue}),
  ].join("\n");

  /* One request per page. A whole multi-page scan in a single call exceeded any
     budget we could justify — the model had to read every page and emit every
     row before the first byte came back. Pages are independent, so they are
     read side by side and merged here. */
  /* A page the approved engine read cleanly needs no second opinion — and must
     not leave to Google at all. The reviewer's screen knows which pages carry
     unresolved rows and names them here; anything else is never uploaded. */
  const requestedPages=new Set(String(req.query.pages||"").split(",")
    .map(value=>Math.floor(Number(String(value).trim())))
    .filter(value=>Number.isFinite(value)&&value>0));

  let pageImages:Buffer[]=[];
  if(mime.includes("pdf")||bytes.subarray(0,5).toString("latin1")==="%PDF-"){
    try{ pageImages=await renderPdfPagesForSmartRead(bytes); }
    catch(error:any){ console.error("تعذّر تحويل صفحات PDF للقراءة الأدق:",error?.message||error); }
  }
  /* Optional row targeting: "rows=1:3,1:7,2:5" names the (page, row-position)
     of each still-unreadable row. When the same grid geometry the approved
     reader trusts can isolate those bands, only THOSE strips travel — the
     header band riding along so columns keep their names, one row of context
     around each strip absorbing any off-by-one. Any doubt falls back to the
     full page: cropping is a saving, never a new way to lose data. */
  const requestedRows=new Map<number,number[]>();
  for(const pair of String(req.query.rows||"").split(",")){
    const match=String(pair).trim().match(/^(\d+):(\d+)$/);
    if(!match)continue;
    const page=Number(match[1]),ordinal=Number(match[2]);
    if(!requestedRows.has(page))requestedRows.set(page,[]);
    requestedRows.get(page)!.push(ordinal);
  }

  const selected=pageImages
    .map((buffer,index)=>({buffer,page:index+1}))
    .filter(item=>!requestedPages.size||requestedPages.has(item.page));
  const prepared=await Promise.all(selected.map(async item=>{
    const ordinals=requestedRows.get(item.page)||[];
    /* Strips read faster but give the model less context, and the reviewer
       reported the full-page reading was simply better. Full pages are the
       default again; strips stay behind an explicit switch for measured
       experiments only. */
    if(ordinals.length&&process.env.SMART_IMPORT_ROW_STRIPS==="1"){
      try{
        const strip=await cropRowStripsForSmartRead(item.buffer,ordinals);
        if(strip)return {...item,buffer:strip,cropped:true};
      }catch(error:any){ console.error(`تعذّر قصّ شرائط صفحة ${item.page}:`,error?.message||error); }
    }
    return {...item,cropped:false};
  }));
  const attempts=prepared.length
    ? prepared.map(item=>({mimeType:"image/png",data:item.buffer.toString("base64"),label:item.cropped
        ?`These are row strips cut from page ${item.page} of ${pageImages.length}: the table's column-header row first, then each requested row with its neighbours. Set sourcePage=${item.page} on every row. Transcribe only rows you can see here.`
        :`This is page ${item.page} of ${pageImages.length}. Set sourcePage=${item.page} on every row you read here.`,page:item.page}))
    : [{mimeType:mime||"application/octet-stream",data:bytes.toString("base64"),label:"This is the whole document.",page:1}];
  const answers=await Promise.all(attempts.map(attempt=>requestGeminiScheduleLayer([
    {text:instructions(attempt.label)},
    {inlineData:{mimeType:attempt.mimeType,data:attempt.data}},
  ],{json:true}).then(result=>({...attempt,result}))));

  const readPages=answers.filter(item=>(item.result as any)?.json);
  if(!readPages.length){
    const firstFailure=answers.map(item=>item.result as any).find(item=>item?.failed);
    /* Raw provider errors are for the log, not the reviewer: "high demand.
       Please try again later" in English inside an Arabic sentence reads as a
       fault in OUR system. The screen gets one calm sentence per situation. */
    const busySignal=/high demand|overloaded|try again|resource.?exhausted|quota|rate limit|503|429/i;
    const detail=!answers.some(item=>item.result)
      ?"القراءة الأدق غير مهيأة على الخادم."
      :firstFailure&&busySignal.test(String(firstFailure.reason||""))
        ?"خوادم القراءة الأدق مزدحمة في هذه اللحظة. انتظر دقيقة ثم أعد فتح الملف وحاول مجدداً."
        :firstFailure&&/تجاوز المهلة/.test(String(firstFailure.reason||""))
          ?"استغرقت القراءة الأدق أطول من المسموح فتوقفت. حاول مرة أخرى — الملفات الكبيرة قد تحتاج محاولة ثانية."
          :"تعذّرت القراءة الأدق لهذا الملف.";
    if(firstFailure)console.error("smart-import provider failure:",String(firstFailure.reason||"").slice(0,300));
    res.status(503).json({error:`${detail} جدولك لم يتغيّر.`,code:"GEMINI_SMART_IMPORT_UNAVAILABLE"});
    return;
  }
  const missedPages=answers.filter(item=>!(item.result as any)?.json).map(item=>item.page);
  const parsed={
    rows:readPages.flatMap(item=>{
      const body=(item.result as any).json;
      const list=Array.isArray(body)?body:Array.isArray(body?.rows)?body.rows:Array.isArray(body?.schedule)?body.schedule:[];
      /* The catalogue is sent so the model can SPELL names correctly — its ids
         are bait for fabrication (a confident "instructorId: 26" that matches a
         real person who was never on this page). Identity is established here,
         from the printed name and code, never from a number the model chose. */
      return list.map((row:any)=>{
        const {AdInstructorId,instructorId,AdCourseId,courseId,id,...printed}=row&&typeof row==="object"?row:{};
        return {...printed,sourcePage:Number(row?.sourcePage)||item.page};
      });
    }),
    issues:[
      ...readPages.flatMap(item=>Array.isArray((item.result as any).json?.issues)?(item.result as any).json.issues:[]),
      ...(missedPages.length?[`تعذّرت القراءة الأدق للصفحات: ${missedPages.join("، ")}`]:[]),
    ],
  };
  const normalized=normalizeGeminiScheduleRows(parsed,{collegeId,sectionId,termId});
  const bound=bindGeminiRowsToCatalogue(normalized,sectionCourses,instructorList);
  /* The sharper rows leave here carrying the same verified registry ids the
     approved reader would attach: a room filled as text but never linked to
     the registry kept its row counted «للمراجعة» forever — the frozen 51. */
  const smartRegistry=await readLocationRegistry();
  /* Linking attaches ids where the registry resolves; where it cannot, the TEXT
     is kept and the decision belongs to the proposal layer, which fills a
     location only when it carries an id OR a confirmed twin already uses the
     same code in this very import. Wiping unresolved text here looked safer but
     starved that layer of every value — the sharper reading suddenly "found
     nothing" on documents it had read professionally minutes earlier. */
  const rows=safeDraftRows(bound,collegeId,sectionId,termId)
    .map(row=>canonicalizeHistoricalLocationForRuntime(row as any,smartRegistry) as any);
  const validation=rows.length?await validateSmartRows(rows,collegeId,sectionId,{checkConflicts:true,resolveHistorical:true}):["لم يخرج Gemini أي صف قابل للمراجعة"];
  const parserIssues=Array.isArray(parsed?.issues)?parsed.issues.map((item:any)=>String(item||"").trim()).filter(Boolean).slice(0,80):[];
  const issues=[...new Set([...validation,...parserIssues])];
  res.json({
    source:"gemini-smart-import",
    importLayout:"worksheet",
    fileName:fileName.slice(0,180),
    rows,preview:rows.slice(0,20),count:rows.length,
    issues,blockingIssues:validation,
    valid:rows.length>0&&validation.length===0,
    ready:rows.length>0&&validation.length===0,
    // The caller keeps its own rows for every page absent from this list.
    pagesRead:readPages.map(item=>item.page),
    pagesRequested:[...requestedPages],
    pageCount:pageImages.length,
    guardrail:"Gemini يقرأ ويفسر فقط؛ كل صف يمر عبر validators الحالية قبل حفظ أي مسودة أو نشرها.",
    message:rows.length?`قرأ Gemini ${countOf(rows.length, AR.row)} للمراجعة.`:"لم أتمكن من استخراج صفوف من الملف.",
  });
});

app.post("/api/intelligence/import-preview", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const raw=Array.isArray(req.body?.rows)?req.body.rows:[]; if(!raw.length){res.status(400).json({error:"الملف لا يحتوي صفوفاً قابلة للقراءة"});return;} if(raw.length>450){res.status(400).json({error:"الملف أكبر من الحد الآمن للاستيراد"});return;} const [courses,instructors,operationalImportIds]=await Promise.all([Repository.getCourses(),Repository.getInstructors(),Repository.getOperationalCourseIds(sectionId)]); const sectionCourses=courses.filter(c=>c.AdCollegeId===collegeId&&c.AdSectionId===sectionId&&operationalImportIds.has(Number(c.AdCourseId))); const byCode=new Map(sectionCourses.map(c=>[String(c.CourseCode).trim().toLowerCase(),c])); const byCivil=new Map(instructors.map(i=>[normalizeCivilId(i.AdInstructorCivil),i])); const byName=new Map(instructors.map(i=>[String(i.AdInstructorName).trim().toLowerCase(),i])); const issues:string[]=[]; const rows:any[]=[];
  raw.forEach((item:any,index:number)=>{const code=String(item["رمز المقرر"]??item.CourseCode??item.courseCode??"").trim();const course=byCode.get(code.toLowerCase());const civil=normalizeCivilId(item["الرقم المدني"]??item.AdInstructorCivil??item.civil??"");const iname=String(item["أستاذ المقرر"]??item.AdInstructorName??item.instructor??"").trim();const instructor=byCivil.get(civil)||byName.get(iname.toLowerCase());const sectionCode=String(item["الشعبة"]??item.SCode??item.section??"").trim();const time=String(item["الوقت"]??item.time??"").trim();const cellRange=readScheduleTimeRange(time);const start=normalizeClock(String(item.fstarttime??item.startTime??cellRange.start).trim().slice(0,5)),end=normalizeClock(String(item.fendtime??item.endTime??cellRange.end).trim().slice(0,5));const dayText=String(item["الأيام"]??item.days??"");const row:any={id:-(index+1),AdCollegeId:collegeId,AdSectionId:sectionId,AdTermId:termId,AdCourseId:course?.AdCourseId||0,AdCourseName:course?.CourseName||String(item["المقرر الدراسي"]??""),SCode:sectionCode,AdInstructorId:instructor?.AdInstructorId||0,fsunday:dayText.includes("الأحد")||Boolean(item.fsunday),fmonday:dayText.includes("الاثنين")||Boolean(item.fmonday),ftuesday:dayText.includes("الثلاثاء")||Boolean(item.ftuesday),fwednesday:dayText.includes("الأربعاء")||Boolean(item.fwednesday),fthursday:dayText.includes("الخميس")||Boolean(item.fthursday),fstarttime:start,fendtime:end,AdRoomCode:String(item["المبنى"]??item.AdRoomCode??"").trim(),AdRoomHall:String(item["القاعة"]??item.AdRoomHall??"").trim(),fdetail:""}; row.fdetail=legacyFDetail(row); if(!course)issues.push(`السطر ${index+1}: لم أجد رمز المقرر ${code||"(فارغ)"} في هذا القسم`);if(!instructor)issues.push(`السطر ${index+1}: لم أتعرف على أستاذ المقرر`);rows.push(row);}); const visitingReplaced=applyVisitingToFaculty(rows,await visitingToFacultyPlan(collegeId,sectionId,termId)); const validation=await validateSmartRows(rows,collegeId,sectionId,{resolveHistorical:true}); issues.push(...validation); const duplicateKeys=new Set<string>(),duplicates:string[]=[]; rows.forEach((r:any,i:number)=>{const key=`${r.AdCourseId}:${r.SCode}`;if(duplicateKeys.has(key))duplicates.push(`السطر ${i+1}: مقرر/شعبة مكرر`);duplicateKeys.add(key)});issues.push(...duplicates); res.json({rows,issues:[...new Set(issues)].slice(0,40),valid:issues.length===0,count:rows.length,preview:rows.slice(0,20),visitingReplaced});
});
}
