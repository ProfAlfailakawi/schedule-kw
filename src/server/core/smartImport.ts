/**
 * ── قواعدُ الاستيراد الذكي وفحصُ الصفوف ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { Repository } from "../../db/repository";
import { activeDays, timeToMinutes } from "../../utils/scheduleIntelligence";
import { retiredOrSabbaticalIds } from "../../utils/visitingToFaculty";
import type { FSchedule } from "../../types";
import { resolveSmartScope } from "../readScope";
import { blockingConflicts, placeholderInstructorIds as sharedPlaceholderInstructorIds, type ApprovalBlockerOptions } from "../../utils/scheduleBlockers";
import { isValidClock, normalizeClock, withinScheduleDay } from "../../utils/scheduleTime";
import { resolveBuilding, resolveRoom } from "../../utils/locationRegistry";
import { collegeBranchRoot, siblingBranchScopes } from "../../utils/branchScope";
import { locationPreflight } from "../locationRegistryEngine";
import type { AuthenticatedRequest } from "./auth";
import { hallBarterAllowsRoomUse } from "./hallBarter";
import { canonicalizeHistoricalLocationForRuntime, readLocationRegistry } from "./locations";
import { sortTermsNewestServer } from "./ordering";
import { sectionScheduleWindow } from "./scheduleRules";
import { companionBookingFor } from "./scheduleWrites";
import { isScopeAllowed, legacyFDetail } from "./scope";

function safeImportEvidence(input:any){
  if(!input||typeof input!=="object")return undefined;
  const field=(value:any)=>value&&typeof value==="object"?{
    raw:String(value.raw||"").slice(0,220),normalized:String(value.normalized||"").slice(0,220),
    canonical:value.canonical===undefined||value.canonical===null?undefined:String(value.canonical).slice(0,180),
    confidence:["CONFIRMED","REVIEW_REQUIRED","UNRESOLVED"].includes(String(value.confidence))?String(value.confidence):"UNRESOLVED",
    score:Number.isFinite(Number(value.score))?Math.max(0,Math.min(100,Math.round(Number(value.score)))):undefined,
    source:String(value.source||"").slice(0,60)||undefined,
    method:String(value.method||"").slice(0,80)||undefined,
    derived:Boolean(value.derived),
    reason:String(value.reason||"").slice(0,300),
    evidence:Array.isArray(value.evidence)?value.evidence.map((item:any)=>String(item||"").slice(0,180)).filter(Boolean).slice(0,8):[],
  }:undefined;
  const safe:any={};
  for(const key of ["course","section","days","time","instructor","building","room"]){const item=field(input[key]);if(item)safe[key]=item;}
  return Object.keys(safe).length?safe:undefined;
}

/* reviewPages: scanned pages accepted with printed lines that have no row. The
   draft is refused until the request confirms each one (importPageReview). A
   receipt signed before this field existed carries none and asks for none. */
export type PdfImportReceipt={v:1;collegeId:number;sectionId:number;termId:number;sourceTerm:string;sourceBranch:string;sourceDepartment:string;issuedAt:string;reviewPages?:number[]};

export function safeDraftRows(input: unknown, collegeId: number, sectionId: number, termId: number): any[] {
  if (!Array.isArray(input)) return [];
  if (input.length > 450) throw new Error("المسودة أكبر من الحد الآمن المسموح");
  return input.map((raw: any, index: number) => ({
    id: Number.isInteger(Number(raw?.id)) ? Number(raw.id) : -(index + 1),
    AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId,
    AdCourseId: Number(raw?.AdCourseId || 0), AdCourseName: String(raw?.AdCourseName || ""), SCode: String(raw?.SCode || ""),
    AdInstructorId: Number(raw?.AdInstructorId || 0),
    fsunday: Boolean(raw?.fsunday), fmonday: Boolean(raw?.fmonday), ftuesday: Boolean(raw?.ftuesday), fwednesday: Boolean(raw?.fwednesday), fthursday: Boolean(raw?.fthursday),
    /* One stored shape. A typed form already sends "HH:MM"; a spreadsheet
       sends whatever the sheet holds, and an unpadded "9:00" used to reach
       every string comparison downstream. */
    fstarttime: normalizeClock(raw?.fstarttime), fendtime: normalizeClock(raw?.fendtime),
    AdRoomCode: String(raw?.AdRoomCode || ""), AdRoomHall: String(raw?.AdRoomHall || ""),
    buildingId: String(raw?.buildingId || "") || undefined, roomId: String(raw?.roomId || "") || undefined,
    companionRoomId: String(raw?.companionRoomId || "").trim() || undefined,
    companionRoomLabel: String(raw?.companionRoomLabel || "").slice(0,100) || undefined,
    locationStatus: raw?.locationStatus, sourceBuildingText: String(raw?.sourceBuildingText || raw?.AdRoomCode || "").slice(0,80) || undefined,
    sourceRoomText: String(raw?.sourceRoomText || raw?.AdRoomHall || "").slice(0,80) || undefined,
    sourceSitePrefix: String(raw?.sourceSitePrefix || "").slice(0,12) || undefined,
    sourceSiteLabel: String(raw?.sourceSiteLabel || "").slice(0,140) || undefined,
    courseSiteLabel: String(raw?.courseSiteLabel || "").slice(0,140) || undefined,
    courseSiteMessage: String(raw?.courseSiteMessage || "").slice(0,420) || undefined,
    scopeMismatchType: raw?.scopeMismatchType === "CROSS_BRANCH" ? "CROSS_BRANCH" : undefined,
    scopeMismatchLabel: String(raw?.scopeMismatchLabel || "").slice(0,140) || undefined,
    scopeMismatchMessage: String(raw?.scopeMismatchMessage || "").slice(0,420) || undefined,
    locationMigrationId: raw?.locationMigrationId, locationMigrationVersion: raw?.locationMigrationVersion, locationResolvedAt: raw?.locationResolvedAt,
    fdetail: legacyFDetail(raw || {}),
    referenceNumber: String(raw?.referenceNumber || "").slice(0,30),
    sourceInstructorText: String(raw?.sourceInstructorText || "").slice(0,180) || undefined,
    replacedVisitingInstructorId: Number(raw?.replacedVisitingInstructorId || 0) || undefined,
    sourceCourseCode:String(raw?.sourceCourseCode||"").slice(0,40)||undefined,
    sourceCourseText:String(raw?.sourceCourseText||"").slice(0,220)||undefined,
    sourceSectionText:String(raw?.sourceSectionText||"").slice(0,40)||undefined,
    importEvidence:safeImportEvidence(raw?.importEvidence),
    // Imported PDF rows carry their original stable order. New rows deliberately
    // live in a separate range so they can never impersonate a deleted source row.
    sourceOrder: raw?.sourceOrder !== undefined && raw?.sourceOrder !== null && Number.isFinite(Number(raw.sourceOrder))
      ? Number(raw.sourceOrder)
      : 1_000_000 + index,
    sourcePage: Number.isFinite(Number(raw?.sourcePage)) && Number(raw?.sourcePage) > 0
      ? Math.floor(Number(raw.sourcePage))
      : undefined,
  }));
}

/** مواقع الفرع التي يملكها هذا القسم: يُدرَّس في أكثر من موقع، وحجزه في أيّها
    حجزُه هو، لا حجز طرف آخر. */
export function branchOwnScopes(colleges:any[],sections:any[],collegeId:number,sectionId:number){
  return siblingBranchScopes({colleges,sections,baseCollegeId:collegeId,baseSectionId:sectionId})
    .map(scope=>({collegeId:scope.collegeId,sectionId:scope.sectionId}))
    .concat([{collegeId,sectionId}])
    .filter((scope,index,list)=>list.findIndex(item=>item.collegeId===scope.collegeId&&item.sectionId===scope.sectionId)===index);
}

/** ── قاعدة التعارض التي تمنع النشر، في موضع واحد ─────────────────────────────
 *
 * تُقرأ من بوابة النشر ومن الفحص المسبق معاً. لو نُسخت لكانت المعاينة تقول
 * «كل شيء مضبوط» عن جدول يرفضه الحفظ — وهو العيب نفسه الذي جاء هذا الفحص
 * ليزيله، فلا يجوز أن يُعاد إنتاجه في نسختين تفترقان مع الوقت.
 *
 * الصفوف المعروضة لم تُحفظ بعد فلا معرّفات لها، و`safeDraftRows` يعطيها معرّفات
 * سالبة كي لا تصطدم بمعرّفات صفوف الفصل الحقيقية فيُقرأ تعارضٌ حقيقي على أنه
 * الصف نفسه. */
/* ── معرّفات «هيئة تدريسية» في السجل ──────────────────────────────────────────
   سجلٌّ اسمه هذا ليس شخصاً بل معنى تتشاركه الجامعة: تُكتب حين لا يكون للشعبة
   اسم مدرّس ثابت. فلا يُقاس عليه الحجز المزدوج، وإلا صار كل قسمين استعملاه في
   ساعة واحدة «تعارضاً» لا يملك أحد إصلاحه. وكلمة «هيئة» لا يُسمّى بها الناس،
   فصدرُ الاسم وحده يعرّف السجل مهما كتبت بقيته. */
export function placeholderInstructorIds(instructors: Array<{ AdInstructorId?: unknown; AdInstructorName?: unknown }>): Set<number> {
  /* القاعدة في `instructorIdentity` وحدها؛ هنا اسمُها القديم لمن يناديه. */
  return sharedPlaceholderInstructorIds(instructors);
}

/* ── خيارات قاعدة المانع كما تقرؤها بوابة الحفظ ────────────────────────────
   «هيئة تدريسية» ليست شخصاً، والقاعة تُعرف بعد طيّ أسمائها القديمة على السجل
   الرسمي. كل عدٍّ أو قائمةٍ لموانع الاعتماد يأخذ الخيارين من هنا، فلا يرى
   أحدٌ مانعاً لا تراه البوابة ولا العكس. */
export async function approvalBlockerOptions(): Promise<ApprovalBlockerOptions> {
  const [instructors, registry] = await Promise.all([Repository.getInstructors(), readLocationRegistry()]);
  return {
    placeholderInstructorIds: placeholderInstructorIds(instructors as any),
    normalizeRow: (row: any) => canonicalizeHistoricalLocationForRuntime(row as FSchedule, registry),
  };
}

export function blockingImportConflicts(
  targetRows:any[],termRows:any[],collegeId:number,sectionId:number,
  ownScopeList:Array<{collegeId:number;sectionId:number}>,
  placeholderIds?:Set<number>,
  normalizeRow?:(row:any)=>any,
){
  const ownScopes=new Set<string>([`${collegeId}:${sectionId}`,...ownScopeList.map(scope=>`${scope.collegeId}:${scope.sectionId}`)]);
  const external=termRows.filter(item=>!ownScopes.has(`${Number(item.AdCollegeId)}:${Number(item.AdSectionId)}`));
  const universe=[...external,...targetRows];
  return blockingConflicts(targetRows,universe,{placeholderInstructorIds:placeholderIds,normalizeRow});
}

/* ── نطاق أساتذة القسم الذي لا تاريخ له ──────────────────────────────────────
 *
 * كل ما يعرفه النظام عن «أساتذة القسم» مشتقّ من جداول سابقة. والقسم الذي
 * يستورد جدوله الأول لا جدول له بعد، فنطاقه يولد فارغاً — وعندها لا يبقى شيء
 * تُقاس عليه هوية، لا في المطابقة ولا في التحقق قبل الحفظ.
 *
 * فحين — وحين فقط — يكون نطاق القسم نفسه خالياً، يتسع إلى أساتذة الكلية،
 * مقروئين من جداول أقسامها الأخرى. القراءة واحدة يستعملها الطرفان، فلا يمكن
 * أن يقبل أحدهما اسماً يرفضه الآخر: كان ذلك سيُظهر الاسم في المعاينة ثم يمنع
 * حفظه بحجة أنه «غير مثبت ضمن القسم»، وهو أسوأ من ترك الخانة فارغة. */
export async function collegeFallbackInstructorIds(collegeId: number): Promise<number[]> {
  const collegeHistory = await Repository.getSchedulesByScope({ collegeId });
  return [...new Set((collegeHistory as any[])
    .map(row => Number(row.AdInstructorId || 0))
    .filter(id => Number.isFinite(id) && id > 0))];
}

/* ── قائمة أهل القسم قانون واحد لا قراءتان ────────────────────────────────
   كانت الشاشة تبني «أهل القسم» من نطاق القسم وحده، بينما يقرؤها قانون النشر
   من مواقع الفرع كلها ومعها احتياط الكلية للقسم الذي لا تاريخ له بعد. فمن
   يقبله الحفظ كان يُوسم في المعاينة غريباً عن القسم: إنذار كاذب على جدول
   صحيح تماماً. القائمة تُحسب هنا مرة واحدة، ويقرأ منها الطرفان. */
/**
 * ── المنتدب في جدول مستورد يصير «هيئة تدريسية» ─────────────────────────────
 * المنتدبون يتغيّرون كل فصل، فلا يُحمَّل الفصل الجديد بأسمائهم: أي صف أستاذه
 * منتدب (من دليل القسم أو روستر الفصل، وليس من هيئته) يُسنَد إلى سجل «هيئة
 * تدريسية» الخاص بالقسم. التغيير في صفوف هذا الجدول وحدها؛ لا يُمَس وضع
 * المنتدب نفسه في النظام. بلا سجلٍّ واحدٍ لـ«هيئة تدريسية» للقسم يبقى الصف كما هو.
 */
export async function visitingToFacultyPlan(collegeId: number, sectionId: number, termId: number): Promise<{ visiting: Set<number>; placeholderId: number }> {
  const [colleges, sections, instructors] = await Promise.all([Repository.getColleges(), Repository.getSections(), Repository.getInstructors()]);
  const scopes = branchOwnScopes(colleges as any, sections as any, collegeId, sectionId);
  const pools = await Promise.all(scopes.map(async scope => ({
    delegates: await Repository.getDepartmentDelegates(scope.collegeId, scope.sectionId),
    roster: await Repository.getVisitingRoster(scope.collegeId, scope.sectionId, termId),
    faculty: await Repository.getDepartmentFaculty(scope.collegeId, scope.sectionId),
  })));
  const ids = (lists: any[][]) => new Set<number>(lists.flat().map(Number).filter(id => Number.isFinite(id) && id > 0));
  const faculty = ids(pools.map(pool => pool.faculty));
  const visiting = new Set([...ids(pools.flatMap(pool => [pool.delegates, pool.roster]))].filter(id => !faculty.has(id)));
  /* المتقاعد والمتفرّغ بوضع المنتدب: يُستبدلان كذلك، ولو كانا في هيئة القسم. */
  for (const id of retiredOrSabbaticalIds(instructors as any)) visiting.add(id);
  const membership = await departmentInstructorIdSet(colleges as any, sections as any, collegeId, sectionId, termId);
  const mine = [...placeholderInstructorIds(instructors as any)].filter(id => membership.has(id));
  return { visiting, placeholderId: mine.length === 1 ? mine[0] : 0 };
}

export async function departmentInstructorIdSet(
  allColleges: any[], allSections: any[], collegeId: number, sectionId: number, termId: number,
): Promise<Set<number>> {
  const scopes = branchOwnScopes(allColleges as any, allSections as any, collegeId, sectionId);
  const pools = await Promise.all(scopes.map(async scope => {
    const [history, delegates, roster] = await Promise.all([
      Repository.getSchedulesByScope({ collegeId: scope.collegeId, sectionId: scope.sectionId }),
      Promise.all([Repository.getDepartmentDelegates(scope.collegeId, scope.sectionId), Repository.getDepartmentFaculty(scope.collegeId, scope.sectionId)]).then(lists => lists.flat()),
      Repository.getVisitingRoster(scope.collegeId, scope.sectionId, termId),
    ]);
    return { history, delegates, roster };
  }));
  const idsOf = (pool: { history: any[]; delegates: any[]; roster: any[] }) => [
    ...pool.history.map((row: any) => Number(row.AdInstructorId || 0)),
    ...pool.delegates.map(Number), ...pool.roster.map(Number),
  ].filter((id: number) => Number.isFinite(id) && id > 0);
  const ids = new Set<number>(pools.flatMap(idsOf));
  /* الاحتياط يُقاس بخلوّ نطاق القسم المستهدف نفسه — لا مجموع أقسام الفرع —
     وإلا لقبل أحد الطرفين ما يرفضه الآخر. */
  const baseIndex = scopes.findIndex(scope => scope.collegeId === collegeId && scope.sectionId === sectionId);
  const basePool = baseIndex >= 0 ? pools[baseIndex] : undefined;
  /* سجل «هيئة تدريسية» ليس أستاذاً: قسمٌ لا يملك غيره ما زال بلا نطاقٍ حقيقي، فيبقى له احتياط الكلية. */
  const placeholders = placeholderInstructorIds(await Repository.getInstructors() as any);
  if (!basePool || !idsOf(basePool).some(id => !placeholders.has(id))) {
    for (const id of await collegeFallbackInstructorIds(collegeId)) ids.add(id);
  }
  return ids;
}

export async function validateSmartRows(rows: any[], collegeId: number, sectionId: number, options: { checkConflicts?: boolean; resolveHistorical?: boolean; requireDepartmentInstructor?:boolean; departmentInstructorIds?:Set<number>; requireCompanion?:boolean } = {}) {
  const termId = Number(rows[0]?.AdTermId || 0);
  const checkConflicts = options.checkConflicts !== false;
  /* القسم الواحد يُدرَّس في مواقع الفرع الثلاثة، ومن يدرّس في الجهراء عضو في
     القسم نفسه لا في قسم غريب. فقائمة أعضاء القسم تُقرأ من مواقع الفرع كلها،
     تماماً كما يُقرأ المبنى بحد الفرع لا بحد رقم الكلية. */
  const [allColleges, allSections] = await Promise.all([Repository.getColleges(), Repository.getSections()]);
  const branchRoot = collegeBranchRoot(allColleges as any, collegeId);
  const departmentScopes = options.requireDepartmentInstructor
    ? branchOwnScopes(allColleges as any, allSections as any, collegeId, sectionId)
    : [];
  const [courses, instructors, currentSchedules, registry] = await Promise.all([
    Repository.getCourses(), Repository.getInstructors(), Repository.getSchedulesByScope({ termId }), readLocationRegistry(),
  ]);
  const courseById = new Map(courses.map(course => [course.AdCourseId, course]));
  const instructorIds = new Set(instructors.map(instructor => instructor.AdInstructorId));
  /* لقطة واحدة لعضوية القسم لكل طلب: من حسبها قبل النداء يمرّرها، فلا تُقرأ
     مرتين ولا يقع الحكم على قائمتين مختلفتين إن تغيّر الدليل بينهما. */
  const departmentInstructorIds = options.departmentInstructorIds
    ?? (options.requireDepartmentInstructor
      ? await departmentInstructorIdSet(allColleges as any, allSections as any, collegeId, sectionId, termId)
      : new Set<number>());
  const errors: string[] = [];
  for (let index=0; index<rows.length; index+=1) {
    const row=rows[index];
    if(options.resolveHistorical && !row.buildingId){
      const b=resolveBuilding(registry,row.AdRoomCode,{collegeId,sectionId});
      if(b.status==="CONFIRMED"&&b.value){
        row.buildingId=b.value.id; row.AdRoomCode=b.value.officialCode;
        if(row.locationStatus!=="PENDING_ROOM"&&!row.roomId){
          const r=resolveRoom(registry,row.AdRoomHall,b.value.id,{collegeId,sectionId});
          if(r.status==="CONFIRMED"&&r.value){row.roomId=r.value.id;row.AdRoomHall=r.value.canonicalCode;row.locationStatus="VERIFIED";}
        }
      }
    }
    const course = courseById.get(Number(row.AdCourseId));
    if (!course || course.AdCollegeId !== collegeId || course.AdSectionId !== sectionId) errors.push(`السطر ${index + 1}: المقرر غير صالح للقسم المحدد`);
    /* A person the reviewer picked by hand in the preview is a decision, not a
       university-wide name match. The department-membership rule exists to stop
       the matcher from reaching outside the department on its own; it must not
       overrule a human who chose a colleague from the register on purpose. */
    const instructorChosenByHand=String((row as any)?.importEvidence?.instructor?.source||"")==="MANUAL";
    /* ── الاسم الكامل المطابق حرفاً هوية، لا تخمين ──────────────────────────
       عضوية القسم في هذا النظام مستنتجة لا مُسجَّلة: تُقرأ من جداول سابقة ومن
       انتداب ودليل يدوي. فالقسم الذي لا يحمل تاريخه إلا بعض أساتذته يجعل بقية
       أهله «من خارج القسم»، فيُمنع نشر جدول صحيح تماماً بحجّة مطابقة على
       مستوى الجامعة — بينما يمرّ الصف نفسه بلا اعتراض إذا ضغط المراجع على
       اسمٍ هو الاسم ذاته.
       الشرط الجامع لما يُقبل هنا ليس قوة البرهان بل وحدة النتيجة: ألّا يبقى
       في السجل كله سوى مرشّح واحد مؤهل. مساواة الاسم الكامل، وهوية «هيئة
       تدريسية» المسجّلة، وبرهان اسمين مرتبين لا يؤهّل سواهما أحداً في الجامعة
       — كلها تُرجع شخصاً أو لا شيء.
       وبرهان الأسماء الثلاثة ليس منها: فهو يختار الأعلى درجة بين مؤهّلين
       متزاحمين ولا يشترط وحدتهم، فاسمٌ ثالث مشابه بحرف واحد قد يخسر السباق
       دون أن يُبطل النتيجة. فيبقى محكوماً بعضوية القسم، كما يبقى ما يتكئ على
       النطاق أصلاً — اسم مفرد، تعميم، جوار. */
    const instructorProvenByFullName=["EXACT_FULL","FACULTY_IDENTITY","GLOBAL_SOLE_TWO_NAME"].includes(String((row as any)?.importEvidence?.instructor?.method||""));
    if (!instructorIds.has(Number(row.AdInstructorId))) errors.push(`السطر ${index + 1}: أستاذ المقرر غير صالح`);
    else if(options.requireDepartmentInstructor&&!instructorChosenByHand&&!instructorProvenByFullName&&!departmentInstructorIds.has(Number(row.AdInstructorId)))errors.push(`السطر ${index + 1}: الأستاذ المطابق غير مثبت ضمن القسم الحالي؛ يلزم Review بدلاً من المطابقة على مستوى الجامعة`);
    /* صفٌّ جاء من جدول الجهة يحمل شعبته كما طُبعت («01»، «1») وقاعته كما
       أسندتها الجهة. نسخ الفصل والتقييم والاسترجاع تعيد فحص الصفوف نفسها،
       فتُفحص بقانون الاستيراد نفسه لا بقاعدة «3–4 أرقام» الخاصة بالنماذج. */
    const authorityRow=Boolean(String((row as any)?.sourceSectionText||"").trim())||Boolean((row as any)?.importEvidence?.section);
    if(options.requireDepartmentInstructor||authorityRow){
      const authoritySection=Number(String(row.SCode||""));
      if(!/^\d{3}$/.test(String(row.SCode||""))||authoritySection<501||authoritySection>999)errors.push(`السطر ${index + 1}: شعبة جدول PDF يجب أن تبدأ من 501 وتستمر 502، 503… لكل مقرر`);
    }else if (!/^\d{3,4}$/.test(String(row.SCode || ""))) errors.push(`السطر ${index + 1}: رقم الشعبة يجب أن يكون 3 أو 4 أرقام إنجليزية`);
    /* The authority PDF IS the room decision. The university publishes the hall
       beside the course, so re-asking the registry whether the department owns
       that hall turns a correct import into a wall of identical warnings the
       reviewer cannot act on. Double-booking is still caught below, by the
       conflict pass that compares the actual reservations. */
    const authorityRooms=Boolean(options.requireDepartmentInstructor)||authorityRow;
    let location=locationPreflight(row,registry,{collegeId,sectionId,branchRoot,allowOutOfScopeRoom:authorityRooms});
    const locationBlocking=location.issues.filter(issue=>issue.severity==="high");
    if(!authorityRooms&&locationBlocking.length&&locationBlocking.every(issue=>issue.type==="room_scope")&&location.canonical&&await hallBarterAllowsRoomUse({...row,...location.canonical},collegeId,sectionId)){
      location=locationPreflight(row,registry,{collegeId,sectionId,branchRoot,allowOutOfScopeRoom:true});
    }
    if(!location.ok) location.issues.filter(issue=>issue.severity==="high").forEach(issue=>errors.push(`السطر ${index + 1}: ${issue.message}`));
    else if(location.canonical) Object.assign(row,location.canonical);
    /* Preserve real companion reservations when copying or applying a draft;
       force new-term copies to meet the current catalog requirement. Historic PDFs
       without companion metadata remain readable through their existing import path. */
    if(course && location.ok && (options.requireCompanion || row.companionRoomId)){
      const companion=await companionBookingFor(course,row,row);
      if(companion.issue)errors.push(`السطر ${index + 1}: ${companion.issue}`);
      else { row.companionRoomId=companion.id;row.companionRoomLabel=companion.label; }
    }
    /* Imported rows are exactly where an impossible clock arrives — a spreadsheet
       cell or an OCR'd page, neither of which is bounded by a time picker. */
    if (!isValidClock(row.fstarttime) || !isValidClock(row.fendtime)) errors.push(`السطر ${index + 1}: وقت غير صالح (الساعة بين 0 و23 والدقيقة بين 0 و59)`);
    else if (timeToMinutes(row.fendtime) <= timeToMinutes(row.fstarttime)) errors.push(`السطر ${index + 1}: وقت النهاية يجب أن يكون بعد البداية`);
    else { const window=await sectionScheduleWindow(Number(row.AdSectionId||sectionId)); if(!withinScheduleDay(timeToMinutes(row.fstarttime),timeToMinutes(row.fendtime),window)) errors.push(`السطر ${index + 1}: وقت المحاضرة يجب أن يكون بين ${window.startTime} و${window.endTime}`); }
    if (activeDays(row).length === 0) errors.push(`السطر ${index + 1}: لم يتم تحديد يوم للمحاضرة`);
    if (course) row.AdCourseName = course.CourseName;
  }
  if (checkConflicts && !errors.length && rows.length) {
    /* ── الجدول لا يتعارض مع نسخته السابقة ───────────────────────────────────
     * المستند المعتمد واحد، وصفوفه تُنشر كل صف في قسمه في موقعه. فحين يُعاد
     * استيراد الملف نفسه، تكون صفوف الجهراء المنشورة سابقاً موجودة في نطاق
     * الجهراء — أي «خارج» النطاق المفتوح — فيراها فحص التعارض حجزاً لطرف آخر
     * ويرفض الصف بحجّة «حجز مزدوج لأستاذ المقرر»، والحقيقة أنه يتعارض مع نفسه
     * قبل أن يُستبدل. ومواقع القسم كلها ستُستبدل بهذه العملية نفسها، فلا تدخل
     * فحص التعارض. أما بقية الأقسام فتبقى كما هي: حجزها حقيقي ويُحترم. */
    const conflicts = blockingImportConflicts(rows, currentSchedules, collegeId, sectionId, departmentScopes, placeholderInstructorIds(instructors as any), (await approvalBlockerOptions()).normalizeRow);
    conflicts.slice(0, 20).forEach((item:any) => errors.push(item.message || item.detail || "يوجد تعارض يمنع الاعتماد"));
  }
  return [...new Set(errors)].slice(0, 30);
}


export function mapSmartIssuesToRows(rows: any[], issues: string[], conflicts: any[] = []) {
  const byId: Record<string, string[]> = {};
  const add = (id: number, reason: string) => {
    if (!rows.some(row => Number(row.id) === Number(id))) return;
    const key = String(Number(id));
    const clean = String(reason || "يحتاج مراجعة").trim();
    byId[key] = [...new Set([...(byId[key] || []), clean])].slice(0, 4);
  };
  issues.forEach(issue => {
    const match = String(issue).match(/السطر\s+(\d+)/);
    if (!match) return;
    const row = rows[Number(match[1]) - 1];
    if (row) add(Number(row.id), String(issue).replace(/^السطر\s+\d+\s*:\s*/, ""));
  });
  conflicts.forEach((item: any) => {
    const reason = [item?.message, item?.detail].filter(Boolean).join(" — ") || "يوجد تعارض يمنع النشر";
    add(Number(item?.rowId), reason);
    add(Number(item?.otherId), reason);
  });
  return byId;
}

export function smartContextFrom(req: AuthenticatedRequest) {
  /* Binary imports carry a Buffer in `req.body`, so their scope necessarily
     travels in the query string. Merge both channels instead of making every
     non-GET request ignore its query parameters. JSON body values still win. */
  const body = req.body && !Buffer.isBuffer(req.body) && typeof req.body === "object" ? req.body : {};
  const source: any = { ...(req.query || {}), ...(body || {}) };
  return { collegeId: Number(source.collegeId || source.AdCollegeId || 0), sectionId: Number(source.sectionId || source.AdSectionId || 0), termId: Number(source.termId || source.AdTermId || 0) };
}


/**
 * ── السياق الذكي لا يُصدِّق الطلبَ على نطاقه ────────────────────────────────
 *
 * كان يأخذ القسمَ والكليةَ من الطلب كما جاءا، ولا يسأل عنهما أحداً — فكان
 * البحثُ بالجملة يقرأ لرئيس لجنةٍ مسوّداتِ أيِّ قسمٍ يكتب رقمَه في الرابط.
 * وحين لا يُسمّى قسمٌ كان يختار من أرقام صفوف النطاق الخام، فيسقط صفُّ «الكلية
 * كلها» ويقرأ للعميد الجامعةَ كلها بقسمٍ صفر.
 *
 * صار القرار في `resolveSmartScope` (src/server/readScope.ts) بحَكَمٍ واحد هو
 * `isScopeAllowed`، ومعه `allowed` يلتزم به كلُّ من يستدعي هذه الدالّة.
 */
export async function resolveSmartContext(req: AuthenticatedRequest, options: { allowCollegeWide?: boolean } = {}) {
  const requested = smartContextFrom(req);
  const [terms, sections] = await Promise.all([Repository.getTerms(), Repository.getSections()]);
  const termId = requested.termId || Number(sortTermsNewestServer(terms)[0]?.AdTermId || 0);
  let busiest: Map<number, number> | undefined;
  if (!requested.sectionId) {
    const schedules = await Repository.getSchedulesByScope({ termId });
    busiest = new Map<number, number>();
    for (const row of schedules) busiest.set(Number(row.AdSectionId), (busiest.get(Number(row.AdSectionId)) || 0) + 1);
  }
  const scope = resolveSmartScope({
    requested, sections, busiest, allowCollegeWide: options.allowCollegeWide,
    allowed: (collegeId, sectionId) => isScopeAllowed(req, collegeId, sectionId),
  });
  const section = sections.find(row => row.AdSectionId === scope.sectionId);
  return { collegeId: scope.collegeId, sectionId: scope.sectionId, termId, section, allowed: scope.allowed };
}
