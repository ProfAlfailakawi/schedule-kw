/**
 * ── مراجعةُ الجدول: التعارضاتُ والجاهزيةُ والنقلُ الجماعي ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { Response } from "express";
import { Repository, ScheduleRevisionConflict } from "../../db/repository";
import { isBlockingConflict, outsideScopeClashes, timeToMinutes } from "../../utils/scheduleIntelligence";
import type { FSchedule } from "../../types";
import { DAY_LABELS } from "../../utils/naturalQuery";
import { departmentFamily } from "../../utils/sectionLabel";
import { approvalWarnings, blockingConflicts, blockingRowIds, doubleEntryCount } from "../../utils/scheduleBlockers";
import { effectiveCourseHours, lectureLengthProblem } from "../../utils/scheduleRegulations";
import { AR, countOf } from "../../utils/arabicCount";
import { learnAll } from "../../utils/courseNature";
import { formatScheduleTimeRange } from "../../utils/scheduleTime";
import { PENDING_ROOM, roomIdentityKey, roomKeyOf } from "../../utils/locationRegistry";
import { noteScheduleMutation, scheduleLockRefusal } from "../core/approvals";
import { type AuthenticatedRequest, requirePermission } from "../core/auth";
import { barterRequestRoomKey, HALL_BARTER_DAY_LABEL } from "../core/hallBarter";
import { courseHabit } from "../core/instructorRequests";
import { canonicalizeHistoricalLocationForRuntime, canonicalizeLocationForWrite, readLocationRegistry } from "../core/locations";
import { scheduleConflicts } from "../core/scheduleConflicts";
import { describeScheduleChange, mixedPatternNotice, SCHEDULE_DAY_KEYS, scheduleLengthIssue, scheduleOverlap, schedulePayloadIssues } from "../core/scheduleRules";
import { companionBookingFor } from "../core/scheduleWrites";
import { filterByScope, isScopeAllowed, legacyFDetail } from "../core/scope";
import { approvalBlockerOptions } from "../core/smartImport";

async function scheduleLengthNotice(row:any):Promise<string|null>{
  const courseId=Number(row?.AdCourseId||0);if(!courseId)return null;
  const course=await Repository.getCourseById(courseId),nature=await courseHabit(courseId);
  const hours=effectiveCourseHours(course),habitual=nature&&nature.confidence!=="low"?nature.meetingMinutes:undefined;
  const mixedOutside=Boolean(await mixedPatternNotice(courseId,SCHEDULE_DAY_KEYS.filter(k=>Boolean(row?.[k])) as any,Number(row?.AdTermId||0)));
  return mixedOutside?null:lectureLengthProblem(row,hours,habitual);
}

/** مانع ساعات المقرر كما تقرؤه بوابة التعديل حرفاً: موعدٌ محفوظ لم يتغيّر شكله (الأيام والوقت)
    لا يُرفض كما هو (A6) — updateScheduleHandler يتخطّاه بالقاعدة نفسها (unchangedShape). */
async function checkLengthIssue(row:any):Promise<string|null>{
  if(!(Number(row.AdCourseId||0)&&String(row.SCode||"").trim()))return null;
  const editedId=Number(row.excludeId||0);
  if(editedId){
    const existing=await Repository.getScheduleById(editedId);
    const unchangedShape=existing&&existing.fstarttime===row.fstarttime&&existing.fendtime===row.fendtime&&SCHEDULE_DAY_KEYS.every(k=>Boolean((existing as any)[k])===Boolean(row?.[k]));
    if(unchangedShape)return null;
  }
  return scheduleLengthIssue({...row,id:Number(row.excludeId||row.id||0)});
}

/** موانع المكان (القاعة الرسمية + المرفق المرافق) كما تقرؤها بوابة الحفظ. */
async function checkLocationIssues(row:any):Promise<string[]>{
  if(!(row.buildingId && (row.roomId || row.locationStatus===PENDING_ROOM) && Number(row.AdCollegeId||0) && Number(row.AdSectionId||0)))return [];
  const editedId=Number(row.excludeId||0);
  const [oldRow,course]=await Promise.all([editedId ? Repository.getScheduleById(editedId) : Promise.resolve(null),Repository.getCourseById(Number(row.AdCourseId))]);
  // Imported authority locations remain editable when the official room is unchanged.
  const authorityRoomId=oldRow?.importEvidence && oldRow.roomId ? String(oldRow.roomId) : "";
  const location=await canonicalizeLocationForWrite(row,Number(row.AdCollegeId),Number(row.AdSectionId),authorityRoomId);
  const issues=location.check.issues.filter(issue=>issue.severity==="high").map(issue=>issue.message);
  if (course && location.check.ok) {
    const companion = await companionBookingFor(course, row, { ...row, ...location.check.canonical }, oldRow || undefined);
    if (companion.issue) issues.push(companion.issue);
  }
  return issues;
}

/**
 * One request, one verdict, one write.
 *
 * The drag used to save as "check, then N separate PUTs" — two windows for
 * disaster: the check could pass while another user was writing, and a network
 * failure mid-loop left the party half-moved. This endpoint re-checks every
 * candidate ON the server, treats the travelling party as already-moved when
 * judging (a sibling about to vacate its slot is not a clash), and commits the
 * whole party through one atomic batch. 409 carries the human-readable reason;
 * nothing is written when anything is refused.
 */
/* ── القاعة الجديدة تُقرأ من اسمها لا من معرّف القديمة ─────────────────────
   لوحة القاعات تنقل المحاضرة بكتابة المبنى والقاعة الجديدين. والصفّ الموثّق
   يحمل معرّفَ قاعته القديمة، والمعرّفُ يسبق الاسمَ عند التوثيق — فكانت القاعة
   القديمة تُكتب من جديد فوق الاسم الجديد، ويقول النقلُ «تم» والمحاضرةُ في
   مكانها. فمتى تغيّر الاسم ولم يتغيّر المعرّف، يُسقَط المعرّفُ القديم ويُحسم
   المكان من الاسم كما يُحسم في أي كتابةٍ جديدة. */
function dropStaleHallIdentity(row: any, fields: any): void {
  for (const key of ["roomId", "buildingId", "locationStatus"] as const) {
    row[key] = undefined;
    fields[key] = undefined;
  }
}

/* ── المنقولةُ بعضُها مع بعض، في أماكنها الجديدة ────────────────────────────
   فحص النقل الجماعي يقرأ كلَّ صفٍّ منقول مقابل الفصل كما هو الآن، ويتجاهل عمداً
   الصفوفَ المنقولة الأخرى لأن أماكنها القديمة ستُخلى. لكنه بذلك لا يرى أين
   ستقف هي: صفّان يُنقلان معاً إلى القاعة نفسها في الساعة نفسها كانا يمرّان ثم
   يُكتبان حجزاً مزدوجاً. فيُقرأ المنقولُ بعضه مع بعض هنا، بالقاعدة الواحدة. */
async function movedRowsCollisions(movedRows: FSchedule[]): Promise<any[]> {
  const movedById = new Map<number, FSchedule>(movedRows.map(row => [Number(row.id), row] as const));
  return blockingConflicts(movedRows, movedRows, await approvalBlockerOptions()).map(item => {
    const a = movedById.get(Number(item.rowId)), b = movedById.get(Number(item.otherId));
    return {
      ...item,
      message: `${item.message} بين موعدين منقولين معاً`,
      detail: `${a?.AdCourseName || "مقرر"} (شعبة ${a?.SCode || "—"}) و${b?.AdCourseName || "مقرر"} (شعبة ${b?.SCode || "—"}) في المكان والوقت الجديدين.`,
    };
  });
}

/** The hall text moved but the registry identity it carried did not. */
function hallTextChangedWithoutIdentity(original: any, fields: any): boolean {
  if (!("AdRoomCode" in fields) && !("AdRoomHall" in fields)) return false;
  const before = roomKeyOf("", original?.AdRoomCode, original?.AdRoomHall);
  const after = roomKeyOf("", fields.AdRoomCode ?? original?.AdRoomCode, fields.AdRoomHall ?? original?.AdRoomHall);
  if (before === after) return false;
  return !fields.roomId || String(fields.roomId) === String(original?.roomId || "");
}

export function registerScheduleReviewRoutes(app: Express): void {

/* ── فحصٌ واحد، بخطوات متوازية ─────────────────────────────────────────────
   كانت الخطوات الست تُنتظر واحدةً بعد واحدة (نمط، مدة، حمولة، ساعات، مكان،
   تعارض) وكلٌّ منها يقرأ القاعدة بنفسه، فيطول «جاري الفحص». لا تعتمد أيٌّ منها
   على الأخرى، فتُطلق معاً، والنتيجة نفسها التي تحكم بها بوابة الحفظ. */
app.post("/api/schedules/check-conflicts", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => { const row=req.body||{};
  const len=(()=>{const [a,b]=[String(row.fstarttime||""),String(row.fendtime||"")].map(t=>{const [h,m]=t.split(":").map(Number);return h*60+m});return b-a})();
  const [patternNotice,lectureNotice,payloadIssues,lengthIssue,placeIssues,conflicts]=await Promise.all([
    mixedPatternNotice(Number(row.AdCourseId||0),SCHEDULE_DAY_KEYS.filter(k=>Boolean(row?.[k])) as any,Number(row.AdTermId||0),Number.isFinite(len)&&len>0?len:undefined).catch(()=>null),
    scheduleLengthNotice(row).catch(()=>null),
    // Return the same payload and weekly-hours blockers the save gate uses.
    schedulePayloadIssues(row),
    checkLengthIssue(row),
    checkLocationIssues(row),
    scheduleConflicts(req,row,Number(row.excludeId||0)),
  ]);
  const validationIssues=[...payloadIssues];
  if(lengthIssue)validationIssues.push(lengthIssue);
  validationIssues.push(...placeIssues);
  res.json({conflicts,validationIssues,...(patternNotice?{patternNotice}:{}),...(lectureNotice?{lectureNotice}:{})}); });


/**
 * One approval-time reading of the whole department scope.
 *
 * The editor checks one candidate at a time. Approval cannot do that: it must
 * see collisions against the whole term, including appointments outside the
 * reader's department that share an instructor or room. This endpoint performs
 * that term-wide read on the server, then redacts the other appointment when it
 * sits outside the caller's permissions. It returns the hard blockers, and
 * beside them — never counted with them — the same section recorded twice in
 * two halls or with two teachers (`warnings`); the regulation remains an
 * advisory/review layer in the client.
 */
app.get("/api/schedules/review-readiness", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0),termId=Number(req.query.termId||0);
  if(!collegeId||!sectionId||!termId){res.status(400).json({error:"حدد الكلية والقسم والفصل."});return;}
  if(!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  /* ── القسم واحدٌ في كلياته ───────────────────────────────────────────────────
     بنين وبنات في «تكنولوجيا التعليم» قسمٌ واحد، وأساتذته يدرّسون فيهما معاً:
     حِملُ الأستاذ لا يُقرأ كاملاً إلا على مواعيد العائلة كلها. `family=1` (شاشة
     المراجعة) يجمع صفوف كل أعضاء العائلة المسموحة للقارئ، فيرى من يفتح بنين أو
     بناتٍ التقريرَ نفسَه. بدونه يبقى النطاق كلية+قسم كما كان (شريط الاعتماد). */
  const familyMode=String(req.query.family||"")==="1";
  const allSections=await Repository.getSections();
  const members=familyMode
    ?departmentFamily(allSections as any[],collegeId,sectionId).filter(member=>isScopeAllowed(req,member.collegeId,member.sectionId))
    :[{collegeId,sectionId}];
  const [memberRows,termRows,hallBarterRequests,instructors,courses]=await Promise.all([
    Promise.all(members.map(member=>Repository.getSchedulesByScope({collegeId:member.collegeId,sectionId:member.sectionId,termId}))),
    Repository.getSchedulesByScope({termId}),
    Repository.getHallBarterRequests(termId),
    Repository.getInstructors(),
    Repository.getCourses(),
  ]);
  const scopeRows=memberRows.flat();
  /* كل صفٍّ يُحكم بنطاق عضوه في العائلة لا بالنطاق المطلوب، فيخرج التقرير نفسه
     أيَّ عضوٍ فُتح (استعارة القاعات تُنسب لطالبها). */
  const memberOfRow=new Map<number,{collegeId:number;sectionId:number}>();
  memberRows.forEach((list,index)=>list.forEach(row=>memberOfRow.set(Number(row.id),members[index])));
  const ownIds=new Set(scopeRows.map(row=>Number(row.id)));
  const byId=new Map(termRows.map(row=>[Number(row.id),row] as const));
  const instructorById=new Map(instructors.map(row=>[Number(row.AdInstructorId),String(row.AdInstructorName||"")]));
  const courseById=new Map(courses.map(row=>[Number(row.AdCourseId),row] as const));
  const blockers:any[]=[];
  const seen=new Set<string>();
  const add=(item:any)=>{const key=String(item.id||`${item.type}:${(item.rowIds||[]).join(":")}`);if(seen.has(key))return;seen.add(key);blockers.push(item);};

  /* One list: the items below, the headline count and the appointments it
     touches are all read from it — the ApprovalBar's two numbers exactly. */
  const conflictList=blockingConflicts(scopeRows,termRows,await approvalBlockerOptions());
  const touchedRowIds=blockingRowIds(conflictList,scopeRows);
  conflictList
    .forEach((item:any)=>{
      const ownId=ownIds.has(Number(item.rowId))?Number(item.rowId):Number(item.otherId);
      if(!ownIds.has(ownId))return;
      const otherId=Number(item.rowId)===ownId?Number(item.otherId):Number(item.rowId);
      const other=byId.get(otherId);
      const visible=other?Boolean(req.user?.IsAdminUser||isScopeAllowed(req,Number(other.AdCollegeId),Number(other.AdSectionId))):false;
      const own=byId.get(ownId);
      const title=item.type==="instructor"?"حجز مزدوج لأستاذ المقرر":item.type==="room"?"حجز مزدوج للقاعة":"موعد مطابق تماماً لنفس المقرر والشعبة";
      const ownDays=own?SCHEDULE_DAY_KEYS.map((key,index)=>own[key]?DAY_LABELS[index]:null).filter(Boolean).join("، "):"";
      const ownCourse=own?(courseById.get(Number(own.AdCourseId))?.CourseCode||String(own.AdCourseName||"المقرر")):"المقرر";
      const ownTime=own?formatScheduleTimeRange(String(own.fstarttime||""),String(own.fendtime||"")):"";
      const subjectKey=item.type==="instructor"
        ? `instructor:${Number(own?.AdInstructorId||0)}`
        : item.type==="room"
          ? `room:${String(own?.AdRoomCode||"").trim()}/${String(own?.AdRoomHall||"").trim()}`
          : `course:${Number(own?.AdCourseId||0)}:${String(own?.SCode||"")}`;
      const subjectLabel=item.type==="instructor"
        ? (instructorById.get(Number(own?.AdInstructorId||0))||"أستاذ المقرر")
        : item.type==="room"
          ? `القاعة ${String(own?.AdRoomCode||"").trim()}/${String(own?.AdRoomHall||"").trim()}`
          : `${ownCourse} · شعبة ${String(own?.SCode||"")}`;
      const external=visible&&other
        ? `${courseById.get(Number(other.AdCourseId))?.CourseCode||String(other.AdCourseName||"موعد آخر")} · ${formatScheduleTimeRange(String(other.fstarttime||""),String(other.fendtime||""))}`
        : "موعد خارج نطاق العرض الحالي";
      const detail=`${ownCourse}${own?.SCode?` · شعبة ${own.SCode}`:""}${ownDays?` · ${ownDays}`:""}${ownTime?` · ${ownTime}`:""} ↔ ${external}`;
      /* Both feet of a pair inside this department are both flagged, so the
         review's «مواعيد تمنع» is `blockingRows`, not half of it. */
      const pairOwn=[ownId,otherId].filter(id=>ownIds.has(id));
      add({id:`conflict:${[ownId,otherId].sort((a,b)=>a-b).join(":")}`,type:item.type,title,detail,rowIds:pairOwn,subjectKey,subjectLabel});
    });

  const roomKey=(row:any)=>roomIdentityKey(row);
  const approved=hallBarterRequests.filter((request:any)=>request.status==="approved");
  for(const row of scopeRows){
    const key=roomKey(row);if(!key)continue;
    const sameRoom=approved.filter((request:any)=>barterRequestRoomKey(request)===key);
    if(!sameRoom.length)continue;
    const active=SCHEDULE_DAY_KEYS.filter(day=>Boolean((row as any)[day]));
    const rowScope=memberOfRow.get(Number(row.id))||{collegeId,sectionId};
    const isRowScope=(request:any)=>Number(request.requesterCollegeId)===rowScope.collegeId&&Number(request.requesterSectionId)===rowScope.sectionId;
    const mine=sameRoom.filter(isRowScope);
    const foreign=sameRoom.find((request:any)=>
      !isRowScope(request)&&
      active.some(day=>request.day===day&&scheduleOverlap(String(row.fstarttime||""),String(row.fendtime||""),String(request.startTime||""),String(request.endTime||"")))
    );
    if(foreign){
      add({id:`barter:${row.id}:${foreign.id}`,type:"hallBarter",title:`القاعة ${row.AdRoomCode}/${row.AdRoomHall} محجوزة عبر استعارة القاعات`,detail:`نافذة معتمدة ${HALL_BARTER_DAY_LABEL.get(foreign.day)||""} ${formatScheduleTimeRange(String(foreign.startTime||""),String(foreign.endTime||""))}.`,rowIds:[Number(row.id)]});
    }
    if(mine.length&&active.some(day=>!mine.some((request:any)=>request.day===day&&timeToMinutes(String(row.fstarttime||""))>=timeToMinutes(String(request.startTime||""))&&timeToMinutes(String(row.fendtime||""))<=timeToMinutes(String(request.endTime||""))))){
      add({id:`barter-window:${row.id}`,type:"hallBarterWindow",title:"الموعد يتجاوز نافذة الاستعارة المعتمدة",detail:"استخدم القاعة داخل اليوم والوقت المعتمدين، أو اطلب نافذة إضافية قبل الاعتماد.",rowIds:[Number(row.id)]});
    }
  }
  /* ── وما يُقال ولا يمنع ────────────────────────────────────────────────
     الشعبة نفسها مسجّلة مرتين في قاعتين أو بأستاذين: ليست تعارضاً مادّياً فلا
     تدخل العدد، لكنها تصل المراجعةَ بنداً «للمراجعة» (قاعدة المالك 2026-09-27). */
  const warnings=approvalWarnings(scopeRows,termRows,{...await approvalBlockerOptions(),
    courseName:new Map(courses.map(row=>[Number(row.AdCourseId),String(row.CourseCode||row.CourseName||"")] as [number,string]))});
  let family:any=undefined;
  if(familyMode){
    /* ما تحتاجه شاشة المراجعة لتقرأ العائلة كلها بالمعطيات نفسها أيّاً كان العضو
       المفتوح: صفوف الفصل السابق (التدوير) وطبيعة المقررات المتعلَّمة. */
    const terms=await Repository.getTerms();
    const earlier=(terms as any[]).map(term=>Number(term.AdTermId)||0).filter(id=>id<termId).reduce((max,id)=>Math.max(max,id),0);
    const previousRows=earlier
      ?(await Promise.all(members.map(member=>Repository.getSchedulesByScope({collegeId:member.collegeId,sectionId:member.sectionId,termId:earlier})))).flat()
      :[];
    const memberCourses=(await Promise.all(members.map(member=>Repository.getOperationalCoursesBySection(member.sectionId)))).flat();
    const courseIds=[...new Set(memberCourses.map(course=>Number(course.AdCourseId)))];
    const learned=learnAll(await Repository.getScheduleHistoryForCourses(courseIds));
    const usedCourses=new Set<number>([...scopeRows,...previousRows].map(row=>Number(row.AdCourseId)));
    const usedInstructors=new Set<number>(scopeRows.map(row=>Number(row.AdInstructorId)).filter(Boolean));
    family={
      rows:scopeRows,
      previousRows,
      nature:Object.fromEntries([...learned.entries()]),
      courses:courses.filter(row=>usedCourses.has(Number(row.AdCourseId))),
      instructors:instructors.filter(row=>usedInstructors.has(Number(row.AdInstructorId))),
      members:members.map(member=>({collegeId:member.collegeId,sectionId:member.sectionId})),
    };
  }
  res.json({blockers,warnings,blockingConflicts:conflictList.length,blockingRows:touchedRowIds.length,blockingDuplicates:doubleEntryCount(conflictList),checkedRows:scopeRows.length,termRows:termRows.length,...(family?{family}:{})});
});

/**
 * ── النقطة الحمراء لما لا تحمله اللوحة ──────────────────────────────────────
 *
 * The board is loaded by scope — a college, a department, a term — which is
 * what keeps it fast. The consequence was that the live clash marker could
 * only ever mark a collision against a row already on screen. A lecture of
 * another department sitting in the same hall at the same hour produced no
 * mark at all: not a hidden reason, nothing. The refusal arrived later, when
 * somebody opened that appointment to save it.
 *
 * Conflict detection itself was never scope-blind — the editor, the review and
 * the publish gate all read the whole term on this server. This endpoint gives
 * the *board* the same reading without giving the browser the whole term:
 * it returns the ids of rows in the caller's scope that collide with something
 * outside it, and one sentence per row saying with whom.
 *
 * Only the pairs the board cannot see itself: a collision between two rows of
 * the same scope is already found in the browser, instantly, and counting it
 * twice would double the radar.
 *
 * `sectionId` is optional — the board is often opened on a whole college — and
 * the scope of the read is exactly the scope of the board, so "outside" always
 * means "not on your screen".
 */
app.get("/api/schedules/outside-clashes", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0),termId=Number(req.query.termId||0);
  if(!collegeId||!termId){res.status(400).json({error:"حدد الكلية والفصل."});return;}
  if(!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [scopeRaw,termRaw,registry]=await Promise.all([
    Repository.getSchedulesByScope(sectionId?{collegeId,sectionId,termId}:{collegeId,termId}),
    Repository.getSchedulesByScope({termId}),
    readLocationRegistry(),
  ]);
  /* The same canonicalisation the editor's check performs, so a hall recorded
     under an old alias cannot hide a collision from the board either. */
  /* «الكلية» بلا قسم تعني أقسامَ القارئ فيها، لا الكليةَ كلها (isScopeAllowed بقسمٍ
     صفر يقول «له شيءٌ هنا» فقط). */
  const scopeRows=filterByScope(req,scopeRaw).map(row=>canonicalizeHistoricalLocationForRuntime(row,registry));
  const termRows=termRaw.map(row=>canonicalizeHistoricalLocationForRuntime(row,registry));
  /* The rule itself lives beside the conflict sweep in scheduleIntelligence,
     so this route holds no copy of it and `tests/run-tests.ts` can hold it. */
  const outside=outsideScopeClashes(scopeRows as any,termRows as any,
    {placeholderInstructorIds:(await approvalBlockerOptions()).placeholderInstructorIds});

  const scopeKey=(row:any)=>`${Number(row?.AdCollegeId||0)}:${Number(row?.AdSectionId||0)}`;
  const scopeNames=new Map<string,string>();
  await Promise.all([...new Set(outside.map(({other})=>scopeKey(other)))]
    .map(async (key:string)=>{
      const [college,section]=key.split(":").map(Number);
      const [sectionRow,collegeRow]=await Promise.all([
        section?Repository.getSectionById(section):Promise.resolve(null),
        college?Repository.getCollegeById(college):Promise.resolve(null),
      ]);
      scopeNames.set(key,[sectionRow?.AdSectionName,collegeRow?.AdCollegeName].filter(Boolean).join(" — ")||"قسم آخر");
    }));

  const daysOf=(row:any)=>SCHEDULE_DAY_KEYS.map((key,index)=>row?.[key]?DAY_LABELS[index]:null).filter(Boolean).join(" و");
  const notes:Record<number,string>={};
  const ids=new Set<number>();
  const pairs=new Set<string>();
  for(const {conflict,ownId,otherId,other} of outside){
    pairs.add([ownId,otherId].sort((a,b)=>a-b).join(":"));
    ids.add(ownId);
    const what=conflict.type==="instructor"?"الأستاذ محجوز"
      :conflict.type==="room"?`القاعة ${String(other.AdRoomCode||"").trim()}/${String(other.AdRoomHall||"").trim()} مشغولة`
        :"موعد مطابق";
    /* Same disclosure rule as the editor card: the department, the day and the
       hour — never the other course, its section, or its lecturer. */
    const line=[scopeNames.get(scopeKey(other))||"قسم آخر",daysOf(other),
      formatScheduleTimeRange(String(other.fstarttime||""),String(other.fendtime||""))].filter(Boolean).join(" · ");
    if(!notes[ownId]) notes[ownId]=`${what} · ${line}`;
  }
  res.json({ids:[...ids],pairs:pairs.size,notes,checkedRows:scopeRows.length});
});

app.post("/api/schedules/move-batch", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const rawMoves = Array.isArray(req.body?.moves) ? req.body.moves : [];
  const strict = Boolean(req.body?.strict);
  if (!rawMoves.length || rawMoves.length > 60) { res.status(400).json({ error: "حدد من موعد واحد إلى ستين للنقل الواحد" }); return; }
  const ALLOWED = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday", "fstarttime", "fendtime", "AdRoomCode", "AdRoomHall", "buildingId", "roomId", "locationStatus"] as const;
  const originals: FSchedule[] = [];
  for (const move of rawMoves) {
    const row = await Repository.getScheduleById(Number(move?.id || 0));
    if (!row) { res.status(404).json({ error: "أحد المواعيد غير موجود" }); return; }
    if (!isScopeAllowed(req, row.AdCollegeId, row.AdSectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
    originals.push(row);
  }
  /* النقل الجماعي يمسّ عدّة صفوفٍ وربّما عدّة أقسام: يكفي قفلُ واحدٍ منها
     للمنع، ويُقرأ كلُّ نطاقٍ مرّةً لا مرّةً لكل صفّ. */
  const touchedScopes = new Map<string, { collegeId: number; sectionId: number; termId: number }>();
  for (const row of originals) {
    touchedScopes.set(`${row.AdCollegeId}:${row.AdSectionId}:${row.AdTermId}`,
      { collegeId: Number(row.AdCollegeId), sectionId: Number(row.AdSectionId), termId: Number(row.AdTermId) });
  }
  for (const scope of touchedScopes.values()) {
    const moveLock = await scheduleLockRefusal(req,scope.collegeId, scope.sectionId, scope.termId);
    if (moveLock) { res.status(409).json({ error: moveLock, code: "schedule-locked" }); return; }
  }
  const movedIds = new Set(originals.map(r => r.id));
  const candidates = rawMoves.map((move: any, index: number) => {
    const fields: any = {};
    for (const key of ALLOWED) if (move?.fields && key in move.fields) fields[key] = move.fields[key];
    fields.fdetail = legacyFDetail({ ...originals[index], ...fields });
    const row = { ...originals[index], ...fields } as FSchedule;
    if (hallTextChangedWithoutIdentity(originals[index], fields)) dropStaleHallIdentity(row, fields);
    return { row, fields };
  });
  const blocked: any[] = [];
  for (const candidate of candidates) {
    const payloadIssues = await schedulePayloadIssues(candidate.row);
    if (payloadIssues.length) { res.status(400).json({ error: payloadIssues[0], issues: payloadIssues }); return; }
    const locationResult=await canonicalizeLocationForWrite(candidate.row,Number(candidate.row.AdCollegeId),Number(candidate.row.AdSectionId));
    if(!locationResult.check.ok){res.status(400).json({error:locationResult.check.issues[0]?.message||"المكان غير صالح",issues:locationResult.check.issues});return;}
    if(locationResult.check.canonical){
      Object.assign(candidate.row,locationResult.check.canonical);
      Object.assign(candidate.fields,{buildingId:candidate.row.buildingId,roomId:candidate.row.roomId,AdRoomCode:candidate.row.AdRoomCode,AdRoomHall:candidate.row.AdRoomHall,locationStatus:candidate.row.locationStatus});
    }
    const conflicts = await scheduleConflicts(req, candidate.row, candidate.row.id);
    blocked.push(...conflicts.filter((c: any) =>
      !c.soft && !movedIds.has(Number(c.rowId)) && (strict || isBlockingConflict(c))));
  }
  blocked.push(...await movedRowsCollisions(candidates.map((candidate: { row: FSchedule }) => candidate.row)));
  if (blocked.length) {
    const first = blocked[0];
    res.status(409).json({
      error: `لم يُنقل: ${first?.message || "تعارض يمنع الحفظ"}${blocked.length > 1 ? ` (+${countOf(blocked.length - 1, AR.blocker)} أخرى)` : ""}`,
      conflicts: blocked,
    });
    return;
  }
  let updated: FSchedule[];
  try {
    updated = await Repository.moveSchedulesBatch(candidates.map((c, index) => ({
      id: c.row.id,
      fields: c.fields,
      expectedRev: rawMoves[index]?.rev === undefined || rawMoves[index]?.rev === null
        ? undefined
        : Number(rawMoves[index].rev),
    })));
  } catch (error: any) {
    if (error instanceof ScheduleRevisionConflict) {
      res.status(409).json({
        error: "تغيّر أحد هذه المواعيد أثناء عملك؛ لم يُنقل شيء.",
        conflict: "revision",
        current: error.current,
      });
      return;
    }
    throw error;
  }
  // The drag is the most common change in the product, so it is the one the
  // log most needs to describe: what moved, from where, to where.
  const originalById = new Map(originals.map(row => [row.id, row]));
  res.locals.auditChanges = updated
    .map(row => {
      const before = originalById.get(row.id);
      const sentence = before ? describeScheduleChange(before, row) : "";
      return sentence ? `${before?.AdCourseName || `موعد ${row.id}`}: ${sentence}` : "";
    })
    .filter(Boolean).join(" || ") || undefined;
  /* النقل الجماعي تعديلٌ كأيِّ تعديل: جدولٌ مقبولٌ يعود جولةً جديدة بعده. */
  for (const scope of touchedScopes.values()) {
    await noteScheduleMutation(req, scope.collegeId, scope.sectionId, scope.termId, { kind: "edit" });
  }
  res.json({ success: true, rows: updated });
});
}
