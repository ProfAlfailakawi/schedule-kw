/**
 * ── قواعدُ الموعد: الأيام والأطوال والقاعات والتنقّل ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { Repository } from "../../db/repository";
import { timeToMinutes } from "../../utils/scheduleIntelligence";
import type { FSchedule } from "../../types";
import { DAY_LABELS } from "../../utils/naturalQuery";
import { meetingParticipants } from "../../utils/meetingSlots";
import { directoryVisitingIds, termVisitingIds } from "../../utils/liveVisiting";
import { departmentFamilyResolver } from "../../utils/sectionLabel";
import { patternNoticeHtml } from "../../utils/patternLibraryView";
import { patternLibraryInput } from "../../utils/patternLibraryInput";
import { DAY_KEYS, DAY_NAMES, daysFitLibrary, effectiveCourseHours, sectionDaysFitLibrary, sectionPatternIssueText, expectedMinutesForDay, maxWeeklyMinutesFor, meetingLabel, patternsForHours, sectionHoursShortfallText, sectionWeeklyHours, weeklyLectureMinutes, type DayKey } from "../../utils/scheduleRegulations";
import { patternLengthIssue, regulationEnd, sameScheduleShape } from "../../utils/appointmentRegulation";
import { REGULATION_EXCEPTION_CODE, regulationExceptionIssues, regulationExceptionMessage, type RegulationExceptionIssue } from "../../utils/regulationException";
import { placeholderInstructorIds } from "../../utils/instructorIdentity";
import { nextCourseSectionCode } from "../../utils/nextCourseSectionCode";
import { AR, countOf } from "../../utils/arabicCount";
import type { RequestDayKey } from "../../utils/instructorRequestVerdict";
import { historicalOrigin } from "../../utils/courseNature";
import { Campus, DEFAULT_TRAVEL_MINUTES, SAME_BUILDING_MINUTES, interCampusMinutes } from "../../utils/campusTravel";
import { clockRangesOverlap, departmentHoursNote, formatScheduleTimeRange, isValidClock, SCHEDULE_DAY_END_TIME, SCHEDULE_DAY_START_TIME, scheduleDayWindowMinutes, withinUniversityDay } from "../../utils/scheduleTime";
import { isSharedRoom, resolveBuilding, resolveRoom } from "../../utils/locationRegistry";
import { courseHabit } from "./instructorRequests";
import { confirmedDepartmentRoomIds, dataContextCacheKey, readLocationRegistry } from "./locations";

// --- SCHEDULES (FSchedule) API ---

export const SCHEDULE_DAY_KEYS=["fsunday","fmonday","ftuesday","fwednesday","fthursday"] as const;
/** الصفُّ نفسه في الأسبوع المفحوص: معرّفٌ رقمي (الإنتاج) أو نصّي (مسوّدة، «draft-…»). كان Number("draft-1") = NaN
    فلا يساوي نفسَه، فيُحسب الموعدُ المعدَّل مع نفسه في ساعات الشعبة. */
export const isSameRow=(other:any,row:any)=>{const a=String(other?.id??"").trim(),b=String(row?.id??"").trim();return Boolean(b)&&b!=="0"&&a===b;};
/**
 * ── الوقت يُقارَن بالدقائق، لا بالحروف ──────────────────────────────────────
 *
 * This compared the four values as STRINGS. On zero-padded "HH:MM" that is
 * accidentally the same answer as arithmetic, which is why it survived — but
 * the write path never padded (`fstarttime: String(raw?.fstarttime || "")`)
 * and the spreadsheet import takes whatever the sheet holds, so a single
 * "9:00" was enough to make it lie: "9:00" sorts AFTER "10:00", so two truly
 * overlapping lectures read as not overlapping. The conflict engine has always
 * compared minutes, so the two disagreed silently — and this one is what the
 * hall-barter reservation, the room-freedom check, the swap-safety test and
 * the approval reading all run on.
 *
 * Minutes, like the engine. `normalizeClock` below closes the other half by
 * making an unpadded time impossible to store in the first place.
 */
export const scheduleOverlap=(aStart:string,aEnd:string,bStart:string,bEnd:string)=>
  clockRangesOverlap(aStart,aEnd,bStart,bEnd);
export async function hoursNotice(row:any):Promise<string>{
  if(!isValidClock(row?.fstarttime)||!isValidClock(row?.fendtime))return"";
  return departmentHoursNote(timeToMinutes(String(row.fstarttime)),timeToMinutes(String(row.fendtime)),await sectionScheduleWindow(Number(row.AdSectionId||0)));
}
export const sectionScheduleWindowCache=new Map<string,{expiresAt:number;startTime:string;endTime:string}>();
export async function sectionScheduleWindow(sectionId:number){
  const cacheKey=dataContextCacheKey(sectionId),cached=sectionScheduleWindowCache.get(cacheKey);if(cached&&cached.expiresAt>Date.now())return cached;
  const section=await Repository.getSectionById(sectionId),bounds=scheduleDayWindowMinutes(section);
  const value={expiresAt:Date.now()+30_000,startTime:bounds.startTime,endTime:bounds.endTime};sectionScheduleWindowCache.set(cacheKey,value);return value;
}
/**
 * تنبيهُ «النمط غير معتمد»: أيامٌ تخلط الـ50 بالـ80 وليست نمطاً معتمداً في مكتبة الأنماط لساعات المقرّر.
 * يعيد رسمَ التنبيه (النمطُ المختار بجانب المعتمد) أو null. صفحةُ الأستاذ تمنع به، والمنعُ في الجدول الدراسي
 * عند القسم يقوله unapprovedPatternIssue. ولا يُعفي تاريخُ المقرّر نمطاً خارج المكتبة: التاريخُ اقتراحٌ
 * لا يخالف اللائحة (المالك 2026-10-30).
 */
export async function mixedPatternNotice(courseId:number,days:RequestDayKey[],termId:number,minutes?:number,blocking=false):Promise<string|null>{
  const shortDays=days.filter(d=>d==="fsunday"||d==="ftuesday"||d==="fthursday"),longDays=days.filter(d=>d==="fmonday"||d==="fwednesday");
  if(!courseId||!shortDays.length||!longDays.length)return null;
  const course=await Repository.getCourseById(courseId);const hours=effectiveCourseHours(course);
  if(hours>0&&daysFitLibrary(hours,days as DayKey[],true)===true)return null;
  void termId;
  const ordered=DAY_KEYS.filter(d=>days.includes(d));
  return patternNoticeHtml(patternLibraryInput(),Math.round(hours)||0,ordered,ordered.map(d=>minutes&&minutes>0?minutes:expectedMinutesForDay(d)),blocking);
}

/**
 * ── «النمطُ لازم يكون معتمداً» عند الحفظ (المالك 2026-10-30) ───────────────────
 *
 * أيامُ الشعبة كلُّها — هذا الصفّ وصفوفُ المقرّر والشعبة نفسيهما في الفصل والقسم — نمطٌ في مكتبة الأنماط
 * لساعات المقرّر. صفٌّ بيومين فأكثر يُكمل نمطاً كاملاً بعينه؛ وصفٌّ بيومٍ واحد يكفيه أن يقع داخل نمطٍ معتمد
 * (نمطٌ بأوقاتٍ مختلفة يُبنى صفّاً صفّاً، وكتلةُ اليوم الواحد تصلح لأيّ يوم) ما دامت الشعبةُ ناقصة؛ فإذا اكتملت
 * ساعاتُها صارت أيامُها نمطاً كاملاً بعينه (sectionDaysFitLibrary). لا تُعفي العادة شيئاً.
 * مقرّرٌ لا تُعرف ساعاتُه أو لا نمطَ لها في المكتبة لا يُحكم عليه هنا.
 */
export async function unapprovedPatternIssue(row:any,hypothetical?:FSchedule[],options:{skipIfUnchanged?:boolean}={}):Promise<string|null>{
  const courseId=Number(row?.AdCourseId||0);if(!courseId)return null;
  const own=SCHEDULE_DAY_KEYS.filter(k=>Boolean(row?.[k])) as DayKey[];
  if(!own.length)return null;
  /* صفٌّ قائم لم يتغيّر شكله (الأيام والوقت) — كإسناد شعبةٍ شاغرة لأستاذ — يبقى كما هو (A6). */
  if(options.skipIfUnchanged&&Number(row?.id)>0){
    const existing=await Repository.getScheduleById(Number(row.id)).catch(()=>null);
    if(existing&&existing.fstarttime===row.fstarttime&&existing.fendtime===row.fendtime&&SCHEDULE_DAY_KEYS.every(k=>Boolean((existing as any)[k])===Boolean(row?.[k])))return null;
  }
  const course=await Repository.getCourseById(courseId);const hours=effectiveCourseHours(course);
  if(!(hours>0))return null;
  const union=new Set<DayKey>(own);
  let siblings:any[]=[];
  if(Number(row?.AdCollegeId)&&Number(row?.AdSectionId)&&Number(row?.AdTermId)){
    siblings=(hypothetical || await Repository.getSchedulesByScope({collegeId:Number(row.AdCollegeId),sectionId:Number(row.AdSectionId),termId:Number(row.AdTermId)}))
      .filter((other:any)=>Number(other.AdCourseId)===courseId&&String(other.SCode||"")===String(row.SCode||"")
        &&Number(other.AdCollegeId)===Number(row.AdCollegeId)&&Number(other.AdSectionId)===Number(row.AdSectionId)&&Number(other.AdTermId)===Number(row.AdTermId)
        &&!isSameRow(other,row));
    for(const other of siblings)for(const day of SCHEDULE_DAY_KEYS)if((other as any)[day])union.add(day as DayKey);
  }
  /* الشعبةُ كلُّها تُقرأ معاً (sectionDaysFitLibrary): المكتملةُ نمطٌ كامل بعينه، والناقصةُ جزءٌ من نمطٍ واحد بأطواله. */
  const fits=sectionDaysFitLibrary(hours,row,siblings);
  /* والطولُ أيضاً (المالك 2026-11-08): أيامٌ معتمدة بنهايةٍ تخالف نمطها تمنع، والسطرُ يقول النهاية الصحيحة.
     الحكمُ في appointmentRegulation (patternLengthIssue) — المصدرُ نفسه الذي يقرؤه النموذج والمقترح. */
  if(fits!==false)return patternLengthIssue({CourseHours:hours},own,String(row?.fstarttime||""),String(row?.fendtime||""))||null;
  return sectionPatternIssueText(hours,row,siblings);
}
/**
 * ── مخالفاتُ اللائحة التي تُحفظ بتأكيدٍ صريح فقط (ملاحظتا المالك 10 و20) ──────────────
 * السُّلّم (م.7/8)، ووقتُ الشعبة الثابت (م.7/9)، والتتالي (م.6/2، م.6/3) — من regulationException.ts،
 * المصدرِ الذي يقرؤه المقترحُ الدراسي أيضاً. التتالي يُقرأ على أسبوع الأستاذ في الجامعة كلها (تعارضاتُ
 * الأستاذ جامعية — قرار المالك 2026-10-29)، فيُقرأ الفصلُ كله لا القسم وحده.
 */
export async function regulationExceptionsFor(row:any,hypothetical?:FSchedule[],options:{shapeChanged?:boolean;sequenceChanged?:boolean}={}):Promise<RegulationExceptionIssue[]>{
  if(options.shapeChanged===false&&options.sequenceChanged===false)return [];
  const termId=Number(row?.AdTermId||0);
  const [week,instructors,courses]=await Promise.all([
    hypothetical?Promise.resolve(hypothetical):termId?Repository.getSchedulesByScope({termId}):Promise.resolve([] as FSchedule[]),
    Repository.getInstructors(),
    Repository.getCourses(),
  ]);
  const courseCode=new Map((courses as any[]).map(course=>[Number(course.AdCourseId),String(course.CourseName||course.CourseCode||"")]));
  const course=(courses as any[]).find(item=>Number(item.AdCourseId)===Number(row?.AdCourseId));
  return regulationExceptionIssues({row,week:week as any,placeholders:placeholderInstructorIds(instructors as any),...options,courseHours:effectiveCourseHours(course),
    nameOf:(other:any)=>courseCode.get(Number(other?.AdCourseId))||String(other?.AdCourseName||"")});
}
/**
 * ── تتالي الأستاذ الجديد حين تُنقل إليه مواعيدُ دفعةً («استبدال الأستاذ»، «تحويل التدريب») ──────────────
 * الشكلُ لم يتغيّر (الأيام والوقت كما حُفظت) فلا يُسأل عن السُّلّم ولا وقت الشعبة؛ يُسأل عن التتالي وحده (م.6/2، م.6/3)
 * على الأسبوع كما سيصير (`week`: صفوفُ الفصل والمنقولةُ بأستاذها الجديد). السلسلةُ الواحدة تُقال مرةً ليومها لكل أستاذ،
 * وسطرُها يسمّي الموعدَ باسمه بدل «هذا الموعد» (الورقةُ هنا لعدّة مواعيد).
 */
export async function reassignmentExceptions(candidates:readonly FSchedule[],week:FSchedule[],personName?:(instructorId:number)=>string):Promise<RegulationExceptionIssue[]>{
  const issues:RegulationExceptionIssue[]=[],seen=new Set<string>();
  for(const row of candidates){
    if(!Number(row.AdInstructorId))continue;
    for(const issue of await regulationExceptionsFor(row,week,{shapeChanged:false,sequenceChanged:true})){
      const key=`${issue.rule}|${row.AdInstructorId}|${issue.day||row.id}`;
      if(seen.has(key))continue;seen.add(key);
      const who=personName?.(Number(row.AdInstructorId))||"";
      const named=issue.text.replace("هذا الموعد",`${String(row.AdCourseName||"موعد").trim()} ${String(row.fstarttime||"").slice(0,5)}`.trim());
      issues.push({...issue,text:who?`${who}: ${named}`:named});
    }
  }
  return issues;
}
/** ردُّ الرفض الذي يفتح ورقةَ التأكيد: 409 برمزٍ معروف، وكلُّ قاعدةٍ بمادّتها. */
export const regulationExceptionRefusal=(issues:RegulationExceptionIssue[])=>({error:regulationExceptionMessage(issues),code:REGULATION_EXCEPTION_CODE,regulation:issues});
/** نهايةُ الموعد من النمط المعتمد لساعات المقرّر وأيامه وبدايته (regulationEnd، الحكمُ الواحد): الطولُ المعتمد يبقى،
    والطولُ القديمُ خارج المكتبة (75د) يعود إلى النمط. ما لا نمطَ له يبقى كما هو. */
export async function fitPatternEnd(row:any):Promise<string>{
  const end=String(row?.fendtime||"");
  if(!Number(row?.AdCourseId)||!isValidClock(row?.fstarttime)||!isValidClock(row?.fendtime))return end;
  const hours=effectiveCourseHours(await Repository.getCourseById(Number(row.AdCourseId)).catch(()=>null));
  if(!(hours>0))return end;
  const span=timeToMinutes(String(row.fendtime))-timeToMinutes(String(row.fstarttime));
  return regulationEnd({CourseHours:hours},SCHEDULE_DAY_KEYS.filter(k=>Boolean(row?.[k])) as DayKey[],String(row.fstarttime),span,true)||end;
}
export async function scheduleLengthIssue(row:any,hypothetical?:FSchedule[]){
  const courseId=Number(row?.AdCourseId||0);if(!courseId)return null;
  const course=await Repository.getCourseById(courseId);
  /* بياناتٌ قديمةٌ قد تسجل الوحدات ولا تملأ حقل الساعات؛ لا تُعامل حينها كأن المقرر ساعة واحدة.
     ولا تُعفي عادةُ القسم من سقف الساعات: التاريخُ اقتراحٌ لا يخالف اللائحة (المالك 2026-10-30). */
  const hours=effectiveCourseHours(course);
  /* توافقُ طول الموعد مع نمط اللائحة ملاحظة استرشادية، ولا يمنع الحفظ.
     المنعُ هنا محصورٌ في تجاوز مجموع العبء الأسبوعي لساعات المقرر. */
  /* مقرّرٌ لا يزيد على ساعاته المعتمدة في أي مكان يُنشأ منه: صفوفُه الأخرى في الفصل والشعبة نفسيهما تُحسب معه. */
  if(hours>0&&Number(row?.AdCollegeId)&&Number(row?.AdSectionId)&&Number(row?.AdTermId)){
    const scopeRows=(hypothetical || await Repository.getSchedulesByScope({collegeId:Number(row.AdCollegeId),sectionId:Number(row.AdSectionId),termId:Number(row.AdTermId)}))
      .filter((other:any)=>Number(other.AdCourseId)===courseId&&Number(other.AdCollegeId)===Number(row.AdCollegeId)&&Number(other.AdSectionId)===Number(row.AdSectionId)&&Number(other.AdTermId)===Number(row.AdTermId)
        &&!isSameRow(other,row));
    const siblings=scopeRows.filter((other:any)=>String(other.SCode||"")===String(row.SCode||""));
    /* مصدرٌ واحد (sectionWeeklyHours): النسخة المطابقة للموعد نفسه لا تضاعف المجموع، والمواعيد المحسوبة تُسمّى. */
    const reading=sectionWeeklyHours(row,siblings,hours);
    /* شعبةٌ قائمة تتجاوز ساعاتها أصلاً (بياناتٌ قديمة) لا تُمنع من النقل ما لم يزد مجموعُها — كما في طلب الأستاذ؛
       وما يُنشأ أو يزيد يُقاس بالسقف وحده، ولا يُعفيه تاريخُ المقرّر. */
    const existing=reading.total>maxWeeklyMinutesFor(hours)&&Number(row?.id)>0?await Repository.getScheduleById(Number(row.id)).catch(()=>null):null;
    if(existing&&reading.total<=sectionWeeklyHours(existing,siblings,hours).total)return null;
    /* الموعدُ وحده يتّسع لساعات المقرّر والشعبةُ نفسُها مكتملة: السببُ رقمُ الشعبة لا الموعد — فيُقال الرقمُ الحرّ
       التالي لهذا المقرّر في الفصل والقسم، ويعرضه النموذج زرّاً «شعبة جديدة» (المالك 2026-11-08). */
    const freshCode=reading.others.length&&weeklyLectureMinutes(row,hours)<=maxWeeklyMinutesFor(hours)?nextCourseSectionCode([...scopeRows,row] as any,courseId,Number(row.AdTermId),null):"";
    if(reading.total>maxWeeklyMinutesFor(hours))return `ساعات هذا المقرر المعتمدة ${countOf(hours,AR.hour)} أسبوعيًا، والمجموع بعد هذا الموعد يزيدها (${countOf(Math.round(reading.total/50),AR.hour)} تقريبًا). لا يُحفظ ما يزيد على الساعات المعتمدة${reading.others.length?` — حُسب معه للشعبة ${String(row.SCode||"")} نفسها: ${reading.others.slice(0,3).map(meetingLabel).join("، ")}`:""}${freshCode&&freshCode!==String(row.SCode||"")?` — لشعبة جديدة: ${freshCode}`:""}`;
    if(reading.under)return sectionHoursShortfallText(row.SCode,reading);
  }
  return null;
}
/**
 * ── مانعا الشعبة معاً: ساعاتُ المقرّر ثم النمطُ المعتمد (المصدرُ الواحد لكل حفظ) ──────────────
 * الإنشاءُ والتعديلُ والنقلُ الجماعي (السحب، التراجع، سلسلةُ الإصلاح) تقرأ هذا الحكم نفسه: الشعبةُ تُحكم
 * بصفوفها كلِّها على الأسبوع كما سيصير (`hypothetical`)، فنقلُ صفوف شعبةٍ كلِّها إلى نمطٍ معتمد آخر يمرّ،
 * ونقلُ صفٍّ واحد يكسر نمطها يُمنع. `skipPattern` لاستعادة آلة الزمن (ما كان بالضبط).
 */
export async function sectionShapeIssue(row:any,hypothetical?:FSchedule[],options:{skipPattern?:boolean}={}):Promise<string|null>{
  return await scheduleLengthIssue(row,hypothetical)||(options.skipPattern?null:await unapprovedPatternIssue(row,hypothetical));
}
/** الموعدُ القائم بقي في شعبته: المقرّرُ ورمزُ الشعبة كما حُفظا. من غيّر أحدهما دخل شعبةً أخرى فيُحكم نمطُها من جديد. */
export const sameSectionIdentity=(saved:any,next:any)=>Boolean(saved&&next)
  &&Number(saved.AdCourseId||0)===Number(next.AdCourseId||0)&&String(saved.SCode??"").trim()===String(next.SCode??"").trim();
/** موعدٌ قائم لم يتغيّر شكلُه (الأيام والوقت) ولا شعبتُه (المقرّر والرمز) — وحده يتخطّى مانعَي الشعبة (A6). */
export const keepsSectionShape=(saved:any,next:any)=>sameScheduleShape(saved,next)&&sameSectionIdentity(saved,next);
/**
 * ── مانعا الشعبة عند التعديل: لا يُمنع تعديلٌ بمخالفةٍ كانت قائمةً ولم يُنشئها ──────────────────
 *   • لم يتغيّر الشكلُ ولا الشعبة ← لا يُحكم (A6).
 *   • تغيّر الشكل (الأيام أو الوقت) ← يُحكم كالإنشاء.
 *   • تغيّر المقرّرُ أو رمزُ الشعبة وحده (والشكلُ كما هو) ← تُحكم الشعبةُ التي دخلها، ويُمنع إن ساء الحال فقط: الشعبةُ
 *     الجديدة تخالف والصفُّ لم يكن مخالفاً في شعبته الأصلية بأيامه ووقته نفسيهما. فموعدٌ قديم (75د) يبقى قابلاً لتغيير
 *     رمزه، وصفٌّ سليم يدخل شعبةً فتصير «أحد + خميس» أو تزيد ساعاتُها يُمنع.
 */
export async function editShapeIssue(existing:any,next:any,hypothetical?:FSchedule[],options:{skipPattern?:boolean}={}):Promise<string|null>{
  if(keepsSectionShape(existing,next))return null;
  const issue=await sectionShapeIssue(next,hypothetical,options);
  if(!issue||!sameScheduleShape(existing,next))return issue;
  return await sectionShapeIssue(existing,hypothetical,options)?null:issue;
}
/* قرار المالك 2026-11-05: اليومُ الجامعي يمنع الحفظ، ولا يُقصّ الوقت ولا يضيع. واستثناءُ القسم الأضيق ليس هنا: هو تنبيهُ
   hoursNotice أعلاه. وموعدٌ محفوظ لم يتغيّر وقته (keptTime) لا يُردّ بهذا الحدّ، كسائر فحوص الشكل عند التعديل. */
export async function schedulePayloadIssues(row:any,{keptTime=false}:{keptTime?:boolean}={}){const issues:string[]=[];if(!SCHEDULE_DAY_KEYS.some(k=>Boolean(row?.[k])))issues.push("يجب اختيار يوم واحد على الأقل للمحاضرة");if(row?.fstarttime&&row?.fendtime){
  /* An impossible clock is refused before it is measured. `timeToMinutes` answers
     with a number for anything — "10:76" becomes 676, i.e. 11:16 — so without
     this the row was stored at a time nobody typed. */
  if(!isValidClock(row.fstarttime)||!isValidClock(row.fendtime))issues.push("وقت المحاضرة غير صالح: الساعة بين 0 و23 والدقيقة بين 0 و59");
  else{const start=timeToMinutes(String(row.fstarttime)),end=timeToMinutes(String(row.fendtime));if(end<=start)issues.push("وقت النهاية يجب أن يكون بعد وقت البداية");else if(!keptTime&&!withinUniversityDay(start,end))issues.push(`وقت المحاضرة يجب أن يكون ضمن الدوام الشامل (${SCHEDULE_DAY_START_TIME}–${SCHEDULE_DAY_END_TIME})`);}}return issues;}
/**
 * Who does this hall belong to?
 *
 * Nothing in the data says "this hall is the English department's", but the
 * history says it plainly: if four fifths of everything ever booked there
 * belongs to one department, that is whose hall it is. Answering this needs
 * only the room — not a day, not a time — so a coordinator learns they have
 * reached into another department's hall the moment they type it, instead of
 * after filling in the rest of the form.
 */
export async function roomOwnership(roomCodeRaw:unknown,roomHallRaw:unknown,collegeId:number,sectionId:number){
  const roomCode=String(roomCodeRaw||"").trim(),roomHall=String(roomHallRaw||"").trim();
  if(!roomCode||!roomHall||!collegeId||!sectionId)return null;
  const registry=await readLocationRegistry();
  const building=resolveBuilding(registry,roomCode,{collegeId,sectionId});
  if(building.status!=="CONFIRMED"||!building.value)return null;
  const room=resolveRoom(registry,roomHall,building.value.id,{collegeId});
  if(room.status!=="CONFIRMED"||!room.value)return null;
  /* The section list is the fact; the stored flag is a copy that has drifted
     on eight rooms. `isSharedRoom` reads the fact, like both read endpoints
     already do — so ownership, the scope notice and the barter gate finally
     agree with the lists the user sees. */
  if(isSharedRoom(room.value)||room.value.sectionIds.length===0||room.value.sectionIds.includes(sectionId))return null;
  /* A room explicitly kept in this department's directory is an intentional
     scheduling entitlement, not an accidental cross-department pick. Keep the
     warning/gate aligned with the same rule used by Add/Edit save. */
  const pinnedDepartmentRooms=await Repository.getPinnedDepartmentRooms(collegeId,sectionId);
  if(confirmedDepartmentRoomIds(registry,pinnedDepartmentRooms,collegeId).has(room.value.id))return null;
  const ownerSectionId=Number(room.value.primarySectionIds?.[0]||room.value.sectionIds[0]||0);
  if(!ownerSectionId)return null;
  const [section,college]=await Promise.all([Repository.getSectionById(ownerSectionId),Repository.getCollegeById(Number(room.value.collegeIds?.[0]||collegeId))]);
  return{
    room:building.value.officialCode,hall:room.value.canonicalCode,roomId:room.value.id,
    section:section?.AdSectionName||"",college:college?.AdCollegeName||"",
    owner:[section?.AdSectionName,college?.AdCollegeName].filter(Boolean).join(" — ")||"قسم آخر",
    samples:Number(room.value.historicalUsageCount||0),ownerSamples:Number(room.value.historicalUsageCount||0),share:100
  };
}
export function normalizedBuilding(value: unknown){return String(value||"").trim();}
export function travelPairKey(a:string,b:string){const x=normalizedBuilding(a).toLocaleLowerCase(),y=normalizedBuilding(b).toLocaleLowerCase();return [x,y].sort().join("|");}
export function travelMinutesFor(profile:any,fromBuilding:string,toBuilding:string,fromCampus?:Campus,toCampus?:Campus){
  // A move between the college's remote campuses (الجهراء / الفحيحيل / الرئيسي) is a
  // commute, not a walk between halls — it overrides the per-building matrix.
  if(fromCampus&&toCampus){const inter=interCampusMinutes(fromCampus,toCampus);if(inter!=null)return inter;}
  const from=normalizedBuilding(fromBuilding),to=normalizedBuilding(toBuilding);
  if(!from||!to)return 0;
  if(from.toLocaleLowerCase()===to.toLocaleLowerCase())return Math.max(0,Number(profile?.sameBuildingMinutes)||SAME_BUILDING_MINUTES);
  const pair=(profile?.pairs||[]).find((item:any)=>travelPairKey(item.fromBuilding,item.toBuilding)===travelPairKey(from,to));
  return Math.max(1,Math.min(120,Number(pair?.minutes)||Number(profile?.defaultTravelMinutes)||DEFAULT_TRAVEL_MINUTES));
}
/**
 * The one sentence the audit log was missing.
 *
 * "تعديل · موعد #418" records that something happened; nobody has ever opened a
 * log to learn that. The question is always what moved and where it moved to,
 * so a placement change is written the way a person would say it — days, time,
 * hall and instructor, each named only when it actually changed.
 */
export function describeScheduleChange(before: any, after: any, instructorName?: (id: number) => string): string {
  const dayText = (row: any) => SCHEDULE_DAY_KEYS.map((key, index) => (row?.[key] ? DAY_LABELS[index] : null)).filter(Boolean).join("، ") || "بلا أيام";
  const parts: string[] = [];
  const beforeDays = dayText(before), afterDays = dayText(after);
  if (beforeDays !== afterDays) parts.push(`الأيام ${beforeDays} ← ${afterDays}`);
  if (before?.fstarttime !== after?.fstarttime || before?.fendtime !== after?.fendtime)
    parts.push(`الوقت ${formatScheduleTimeRange(before?.fstarttime, before?.fendtime)} ← ${formatScheduleTimeRange(after?.fstarttime, after?.fendtime)}`);
  const beforeRoom = `${before?.AdRoomCode || ""}/${before?.AdRoomHall || ""}`;
  const afterRoom = `${after?.AdRoomCode || ""}/${after?.AdRoomHall || ""}`;
  if (beforeRoom !== afterRoom) parts.push(`القاعة ${beforeRoom} ← ${afterRoom}`);
  if(String(before?.companionRoomId||"")!==String(after?.companionRoomId||""))parts.push(`المرفق المرافق ${before?.companionRoomLabel||"بدون"} ← ${after?.companionRoomLabel||"بدون"}`);
  if (Number(before?.AdInstructorId || 0) !== Number(after?.AdInstructorId || 0))
    parts.push(`الأستاذ ${instructorName?.(Number(before?.AdInstructorId || 0)) || before?.AdInstructorId} ← ${instructorName?.(Number(after?.AdInstructorId || 0)) || after?.AdInstructorId}`);
  if (String(before?.SCode || "") !== String(after?.SCode || "")) parts.push(`الشعبة ${before?.SCode} ← ${after?.SCode}`);
  return parts.join(" · ");
}

export function weekExceptionDayKey(date: string): string | null {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const day = parsed.getUTCDay();
  return day >= 0 && day <= 4 ? SCHEDULE_DAY_KEYS[day] : null;
}

/* ── متى نلتقي؟ ──────────────────────────────────────────────────────────────
   The committee question every department asks weekly. Choose the people; the
   term's own schedule already knows when each of them teaches. Free windows
   are computed on the same 30-minute grid as the board, merged into ranges,
   and ranked. Nothing is revealed beyond busy/free for people the caller
   chose by name. */

/** Who may sit in «متى نلتقي؟» this term — decided here, for every scope.
 *  Visiting instructors are read term-wide across colleges (not from the
 *  department on screen), so a college-only or empty scope excludes them too. */
export async function meetingExcludedIds(termId: number) {
  const [affiliations, instructors, sections] = await Promise.all([Repository.getDelegateAffiliations(), Repository.getInstructors(), Repository.getSections()]);
  const known = new Set(instructors.map(person => Number(person.AdInstructorId)));
  const visiting = [...new Set([
    ...termVisitingIds(affiliations, termId, id => known.has(id), departmentFamilyResolver(sections)),
    ...directoryVisitingIds(affiliations, id => known.has(id)),
  ])];
  const kept = new Set(meetingParticipants(instructors, visiting).map(person => Number(person.AdInstructorId)));
  return { instructors, excluded: instructors.map(person => Number(person.AdInstructorId)).filter(id => !kept.has(id)), visiting };
}
