/**
 * ── فاحصُ التعارضات وحجوزُ الطلبات ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { reservationRows } from "../../utils/instructorRequestReservations";
import { Repository } from "../../db/repository";
import { findConflicts, timeToMinutes } from "../../utils/scheduleIntelligence";
import type { FSchedule } from "../../types";
import { DAY_LABELS } from "../../utils/naturalQuery";
import { AR, countOf, oblique } from "../../utils/arabicCount";
import { offRhythm } from "../../utils/departmentRhythm";
import { startLadderNote } from "../../utils/scheduleRegulations";
import { dayKeysOf } from "../../utils/instructorRequestItems";
import { withVisitingSuffix } from "../../utils/visitingText";
import { campusOf, interCampusMinutes } from "../../utils/campusTravel";
import { formatScheduleTimeRange } from "../../utils/scheduleTime";
import { approvedBarterReservation, borrowerOutsideApprovedWindow } from "../../utils/hallBarterWindow";
import type { AuthenticatedRequest } from "./auth";
import { barterRequestMatchesRow, HALL_BARTER_DAY_LABEL } from "./hallBarter";
import { requestItemScope } from "./instructorRequests";
import { canonicalizeHistoricalLocationForRuntime, readLocationRegistry } from "./locations";
import { departmentStyle } from "./rhythm";
import { roomOwnership, SCHEDULE_DAY_KEYS } from "./scheduleRules";
import { isScopeAllowed } from "./scope";
import { placeholderInstructorIds } from "./smartImport";
import { visitingChecker } from "./visiting";

async function roomScopeNotice(row:any){
  const owner=await roomOwnership(row?.AdRoomCode,row?.AdRoomHall,Number(row?.AdCollegeId||0),Number(row?.AdSectionId||0));
  if(!owner)return null;
  return{type:"roomScope",severity:"warning",rowId:0,message:`تنبيه نطاق القاعة: ${owner.room}/${owner.hall} مرتبطة تاريخياً بـ ${owner.owner}`,detail:`القاعة مصنفة في السجل الرسمي لقسم آخر. استخدامها يتطلب نافذة استعارة معتمدة؛ وسيمنع الخادم الحفظ خارج اليوم والوقت المعتمدين.`};
}

const CAMPUS_LABEL: Record<string, string> = { jahra: "الجهراء", fahaheel: "الفحيحيل", main: "الحرم الرئيسي" };
/**
 * Note 38 — a soft "too little time between campuses" warning.
 *
 * The instructor's appointments are fetched across the whole term (every
 * college), so a new placement can be checked against a same-day lecture on a
 * different campus. If the gap is smaller than the commute (الجهراء/الفحيحيل/
 * العارضية rules), we surface a `soft` warning: it explains the risk but never
 * blocks the save — a real timetable sometimes has to accept a tight transfer.
 */
async function interCampusWarnings(candidate: any, all: any[]) {
  const instructorId = Number(candidate.AdInstructorId || 0);
  if (!instructorId || !candidate.fstarttime || !candidate.fendtime) return [];
  const colleges = await Repository.getColleges();
  const campusById = new Map<number, ReturnType<typeof campusOf>>(colleges.map((c: any) => [Number(c.AdCollegeId), campusOf(c.AdCollegeName)]));
  const candCampus = campusById.get(Number(candidate.AdCollegeId));
  if (!candCampus) return [];
  const own = all.filter(r => Number(r.AdInstructorId) === instructorId && Number(r.id) !== Number(candidate.id));
  const days: Array<[string, string]> = [["fsunday", "الأحد"], ["fmonday", "الاثنين"], ["ftuesday", "الثلاثاء"], ["fwednesday", "الأربعاء"], ["fthursday", "الخميس"]];
  const cStart = timeToMinutes(candidate.fstarttime), cEnd = timeToMinutes(candidate.fendtime);
  const seen = new Set<string>();
  const warnings: any[] = [];
  for (const [key, label] of days) {
    if (!candidate[key]) continue;
    for (const other of own) {
      if (!other[key]) continue;
      const otherCampus = campusById.get(Number(other.AdCollegeId));
      if (!otherCampus) continue;
      const need = interCampusMinutes(candCampus, otherCampus);
      if (need == null) continue; // same campus — the per-building matrix handles it
      const oStart = timeToMinutes(other.fstarttime), oEnd = timeToMinutes(other.fendtime);
      // Gap only when the two do not overlap (an overlap is already a hard conflict).
      const gap = cStart >= oEnd ? cStart - oEnd : (oStart >= cEnd ? oStart - cEnd : -1);
      if (gap < 0 || gap >= need) continue;
      const dedupe = `${key}:${[candCampus, otherCampus].sort().join("-")}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      warnings.push({
        type: "travel", severity: "warning", soft: true, rowId: 0,
        message: `انتقال ضيّق بين ${CAMPUS_LABEL[candCampus]} و${CAMPUS_LABEL[otherCampus]}`,
        detail: `${label}: التنقّل يحتاج قرابة ${countOf(need, oblique(AR.minute))}، والمتاح ${countOf(gap, AR.minute)} فقط بين موعدَي الأستاذ. يمكنك الحفظ مع الانتباه لهذا الفارق.`,
      });
    }
  }
  return warnings.slice(0, 3);
}

/**
 * `hypothetical` is the whole term as it WOULD be — used by the study proposal,
 * which asks this very gate about rows that do not exist yet. Everything else
 * (hall scope, barter windows, hall-owner notices, travel, rhythm) is the
 * ordinary save gate, unchanged: one verdict, never a second checker.
 */
export async function scheduleConflicts(req:AuthenticatedRequest,row:any,excludeId=0,hypothetical?:FSchedule[]){
  const termId=Number(row?.AdTermId||0);
  if(!termId||!row?.fstarttime||!row?.fendtime||!SCHEDULE_DAY_KEYS.some(k=>Boolean(row?.[k])))return[];
  const candidate:any={...row,id:excludeId||Number(row?.id||-900000),AdTermId:termId};
  const [termRowsRaw, instructor, roomNotice, hallBarterRequests, registry]=await Promise.all([
    // One current-term read (cached by the repository) is intentional here: it closes the
    // pre-migration alias gap without ever scanning ten years during interactive use.
    hypothetical?Promise.resolve(hypothetical):Repository.getSchedulesByScope({termId}),
    Number(candidate.AdInstructorId||0) ? Repository.getInstructorById(Number(candidate.AdInstructorId)) : Promise.resolve(null),
    roomScopeNotice(candidate),
    Repository.getHallBarterRequests(termId),
    readLocationRegistry(),
  ]);
  const ownerValue = (req as any).__requestReservationOwner;
  const reservationOwners = new Set<string>((Array.isArray(ownerValue) ? ownerValue : [ownerValue]).map(value => String(value || "")).filter(Boolean));
  if (!reservationOwners.size && row.instructorRequestId && req.path?.includes("check-conflicts")) {
    const request = await Repository.getInstructorRequest(String(row.instructorRequestId));
    if (request && Number(request.AdInstructorId) === Number(row.AdInstructorId) && Number(request.AdTermId) === termId
      && isScopeAllowed(req, Number(row.AdCollegeId), Number(row.AdSectionId))) reservationOwners.add(request.id);
  }
  /* حجزُ التحرير المؤقّت لا يمنع القسم (A2): يحمي الأستاذَ من زميله وحده. */
  const heldEntries = (await Repository.getInstructorRequestReservations(termId)).filter(entry => !reservationOwners.has(entry.requestId) && !entry.heldUntil);
  const heldRows = reservationRows(heldEntries, termId);
  const holdOfRow = (id: unknown) => { const n = Number(id); return n <= -2_000_000_000 + heldEntries.length * 10 && n >= -2_000_000_000 ? heldEntries[Math.floor((n + 2_000_000_000) / 10)] : undefined; };
  const rowsWithReservations = [...termRowsRaw, ...heldRows];
  const candidateCanonical=canonicalizeHistoricalLocationForRuntime(candidate as FSchedule,registry);
  const all=rowsWithReservations.map(item=>canonicalizeHistoricalLocationForRuntime(item,registry)).filter(item=>item.id!==excludeId);
  const style=await departmentStyle(candidate);
  const raw=findConflicts([candidateCanonical],all,{doorwayMinutes:style.doorway,
    cohortPairs:style.cohort,cohortSize:style.cohortSize,
    placeholderInstructorIds:placeholderInstructorIds(await Repository.getInstructors() as any)});

  /* ── مَن يقف في المكان الآخر ────────────────────────────────────────────
   *
   * A refusal that will not say why is worse than no refusal. When the other
   * appointment belongs to another department the coordinator was told only
   * «يوجد حجز متداخل خارج نطاق العرض الحالي» — no day, no hour, no owner — and
   * the board never loads that row either, so there was nowhere left to look.
   * The room card carried the least of all: the instructor card at least gave
   * the hour.
   *
   * The department is named. Not as an exception: the hall-scope notice beside
   * it already prints «مرتبطة تاريخياً بـ قسم اللغة العربية — كلية التربية
   * الأساسية», and hiding the same fact one card away was a contradiction
   * inside one screen. It is also the actionable half — it says whom to call,
   * and «استعارة القاعات» exists in this product for exactly that conversation.
   *
   * What stays private stays private: the other course, its section, and the
   * name of the other lecturer are never revealed by these lines. What is
   * revealed is organisational — a department holds this hall at this hour —
   * and it is the minimum a person needs to move their own appointment.
   *
   * Resolved once, before the mapping, for every department other than the
   * candidate's own; the repository reads are cached and the set is tiny.
   */
  const otherScopeKey=(row:any)=>`${Number(row?.AdCollegeId||0)}:${Number(row?.AdSectionId||0)}`;
  const ownScopeKey=otherScopeKey(candidate);
  const scopeNames=new Map<string,string>();
  await Promise.all([...new Set(raw
    .map((conflict:any)=>all.find(item=>item.id===conflict.otherId))
    .filter((other:any)=>other&&otherScopeKey(other)!==ownScopeKey)
    .map((other:any)=>otherScopeKey(other)))]
    .map(async (key:string)=>{
      const [collegeId,sectionId]=key.split(":").map(Number);
      const [section,college]=await Promise.all([
        sectionId?Repository.getSectionById(sectionId):Promise.resolve(null),
        collegeId?Repository.getCollegeById(collegeId):Promise.resolve(null),
      ]);
      scopeNames.set(key,[section?.AdSectionName,college?.AdCollegeName].filter(Boolean).join(" — ")||"قسم آخر");
    }));
  const otherDaysLabel=(row:any)=>SCHEDULE_DAY_KEYS.map((key,index)=>row?.[key]?DAY_LABELS[index]:null).filter(Boolean).join(" و");
  /** «قسم اللغة العربية — كلية التربية الأساسية · الأحد والثلاثاء · 11:50 - 11:00» */
  const elsewhereLine=(other:any)=>[
    scopeNames.get(otherScopeKey(other))||"قسم آخر",
    otherDaysLabel(other),
    formatScheduleTimeRange(String(other?.fstarttime||""),String(other?.fendtime||"")),
  ].filter(Boolean).join(" · ");
  /** The same line, kept behind the course name when the reader may see it. */
  const detailFor=(other:any,visible:boolean)=>{
    const elsewhere=otherScopeKey(other)!==ownScopeKey;
    if(!elsewhere) return `${other.AdCourseName||"مقرر"} — ${formatScheduleTimeRange(other.fstarttime,other.fendtime)}`;
    return visible
      ? `${other.AdCourseName||"مقرر"} · ${elsewhereLine(other)}`
      : elsewhereLine(other);
  };

  /* «الأستاذ X لديه محاضرة متداخلة»: X هو أستاذ الموعد المفحوص، فيحمل «· منتدب» إن كان منتدباً في قسم هذا الموعد. القراءة لازمة عند تعارض أستاذ وحده. */
  const instructorIsVisiting=instructor&&raw.some((conflict:any)=>conflict.type==="instructor")
    ?(await visitingChecker(termId,[{collegeId:candidate.AdCollegeId,sectionId:candidate.AdSectionId}]))(instructor.AdInstructorId,candidate.AdCollegeId,candidate.AdSectionId)
    :false;
  const conflicts=raw.map((conflict:any)=>{
    /* The turnaround rule is advice, not a refusal. `soft` is what keeps it out
       of the blocked list in move-batch and out of the 409 on save — a
       department that deliberately runs back-to-back lectures must never be
       stopped from saying so. */
    if(conflict.type==="cohort"){
      const other=all.find(item=>item.id===conflict.otherId);
      const visible=other?Boolean(req.user?.IsAdminUser||isScopeAllowed(req,other.AdCollegeId,other.AdSectionId)):true;
      /* Soft on purpose: it speaks for whoever answered the survey, not for the
         registrar, and a partial answer must never be the thing that blocks a
         department from saving its own schedule. */
      return{...conflict,soft:true,severity:"medium",rowId:visible&&other?other.id:0,
        message:"تعارض على الطلاب",
        detail:visible?conflict.detail:"الموعد الآخر خارج نطاق العرض الحالي."};
    }
    if(conflict.type==="doorway"){
      const other=all.find(item=>item.id===conflict.otherId);
      const visible=other?Boolean(req.user?.IsAdminUser||isScopeAllowed(req,other.AdCollegeId,other.AdSectionId)):true;
      return{...conflict,soft:true,severity:"low",rowId:visible&&other?other.id:0,
        message:"الفاصل بين المحاضرتين غير كافٍ",
        detail:visible?conflict.detail:"الفاصل قصير عن المطلوب، والموعد الآخر خارج نطاق العرض الحالي."};
    }
    const other=all.find(item=>item.id===conflict.otherId);
    const visible=other?Boolean(req.user?.IsAdminUser||isScopeAllowed(req,other.AdCollegeId,other.AdSectionId)):true;
    if(conflict.type==="instructor"&&other)return{...conflict,severity:"high",rowId:visible?other.id:0,message:`الأستاذ ${withVisitingSuffix(instructor?.AdInstructorName||"",Boolean(instructor?.AdInstructorName)&&instructorIsVisiting)} لديه محاضرة متداخلة`,detail:detailFor(other,visible)};
    if(conflict.type==="room"&&other)return{...conflict,severity:"high",rowId:visible?other.id:0,message:`القاعة ${other.AdRoomCode}/${other.AdRoomHall} مشغولة في نفس الوقت`,detail:detailFor(other,visible)};
    /* ── الشعبة نفسها في مكانين: تُقال ولا تمنع ─────────────────────────────
       قاعدة المالك 2026-09-27: «التوقيع لا يمنعه إلا تعارض ماديّ». قاعتان
       مختلفتان أو أستاذان حقيقيان مختلفان ليسا تعارضاً ماديّاً (twinKind)، فلا
       يمنعان الحفظ ولا النقل — لكن البطاقة تقولهما، بما يختلف فيهما. */
    if(conflict.type==="sectionTwice")return{...conflict,soft:true,severity:"medium",rowId:visible&&other?other.id:0,
      detail:visible||!other?conflict.detail:`الشعبة نفسها مسجّلة بالأيام والوقت نفسيهما · ${elsewhereLine(other)}`};
    // A repeated course and section is only a duplicate when it is the very same
    // placement; a lecture on Sunday and its laboratory on Tuesday share a
    // section number by design and must not be refused. Since 2026-09-27 it is
    // also only a duplicate when nothing tells the two rows apart — no second
    // hall, no second real teacher — because only then would it publish twice.
    /* Same department: the twin row is on the reader's own board, so its own
       phrasing stays. Another department: name it, with the day and the hour. */
    return{...conflict,severity:"high",rowId:visible&&other?other.id:0,message:"يوجد موعد مطابق تماماً لنفس المقرر والشعبة",
      detail:!other?"يوجد سجل مطابق خارج نطاق العرض الحالي"
        :otherScopeKey(other)===ownScopeKey?`نفس الأيام ونفس الوقت ${formatScheduleTimeRange(other.fstarttime, other.fendtime)}`
          :detailFor(other,visible)};
  });
  const sameBarterRoom=(request:any)=>barterRequestMatchesRow(request,candidate);
  const sameRoomBarterWindows=hallBarterRequests.filter(sameBarterRoom);
  const barterReservation = SCHEDULE_DAY_KEYS.map(day=>Boolean(candidate[day])
    ? approvedBarterReservation(sameRoomBarterWindows, day, String(candidate.fstarttime||""), String(candidate.fendtime||""), Number(candidate.AdCollegeId), Number(candidate.AdSectionId))
    : undefined).find(Boolean);
  const myApprovedWindows=hallBarterRequests.filter((request:any)=>request.status==="approved"&&sameBarterRoom(request)&&
    Number(request.requesterCollegeId)===Number(candidate.AdCollegeId)&&Number(request.requesterSectionId)===Number(candidate.AdSectionId));
  const selectedBarterDays=SCHEDULE_DAY_KEYS.filter(day=>Boolean(candidate[day]));
  const borrowerWindowViolation=selectedBarterDays.some(day=>borrowerOutsideApprovedWindow(sameRoomBarterWindows, day,
    String(candidate.fstarttime||""), String(candidate.fendtime||""), Number(candidate.AdCollegeId), Number(candidate.AdSectionId)));
  const barterNotes:any[] = [];
  if(barterReservation)barterNotes.push({
    type:"hallBarter",severity:"high",soft:false,rowId:0,otherId:0,
    message:`القاعة ${candidate.AdRoomCode}/${candidate.AdRoomHall} محجوزة رقمياً عبر استعارة القاعات`,
    detail:`نافذة الاستعارة المعتمدة ${HALL_BARTER_DAY_LABEL.get(barterReservation.day as typeof SCHEDULE_DAY_KEYS[number])||""} ${formatScheduleTimeRange(barterReservation.startTime, barterReservation.endTime)}.`
  });
  if(borrowerWindowViolation)barterNotes.push({
    type:"hallBarterWindow",severity:"high",soft:false,rowId:0,otherId:0,
    message:"الموعد يتجاوز نافذة الاستعارة المعتمدة",
    detail:"استخدم القاعة داخل اليوم والوقت المعتمدين فقط، أو اطلب نافذة إضافية من استعارة القاعات قبل الحفظ."
  });
  const softTravel = await interCampusWarnings(candidate, all);
  /* The department's own habit, broken. Not an error — a lecture beginning at
     08:55 where every other lecture on that day has begun at 08:50 for ten
     years is almost always a slip of the finger, and occasionally a decision.
     So it is said once, softly, and never refuses a save. */
  /* سُلّمُ البدايات من اللائحة أولاً (المالك 2026-10-30): تنبيهٌ لا يمنع، ولا يحتاج تاريخاً للقسم.
     وعادةُ القسم بعده للمدة وحدها، ولا تخالف اللائحة (offRhythm). */
  const ladder = startLadderNote(SCHEDULE_DAY_KEYS.filter(day => Boolean(candidate[day])) as any, String(candidate.fstarttime || ""));
  const habit = ladder ? "" : style.reading ? offRhythm(candidate, style.reading) : "";
  const rhythmNote = ladder
    ? [{ type: "rhythm", severity: "low", soft: true, rowId: 0, otherId: 0,
         message: "خارج سُلّم البدايات في اللائحة", detail: ladder }]
    : habit
    ? [{ type: "rhythm", severity: "low", soft: true, rowId: 0, otherId: 0,
         /* طولٌ خارج المكتبة يُسمّى بالمكتبة لا بعادة القسم؛ وما بقي «خارج إيقاع القسم» فبدايةٌ زلّت عن عادته حيث لا سُلّمَ واحداً. */
         message: /^مدة محاضرات .* في مكتبة الأنماط/.test(habit) ? "طولٌ خارج مكتبة الأنماط" : "خارج إيقاع القسم المعتاد", detail: habit }]
    : [];

  /* ── ذاكرة عشر سنوات، عند لحظة القرار وحدها ─────────────────────────────
   *
   * Not a dashboard and not a strip: the question «what does history say about
   * HERE» is only worth answering while somebody's card is actually over here.
   * At every other moment it is noise, so at every other moment it is not
   * computed and not sent.
   *
   * At most one sentence about the place and one about the hall. A person
   * mid-drag can read one line; five lines are a wall they will learn to skip.
   */
  const memoryNotes: any[] = [];
  if (style.memory) {
    const day = SCHEDULE_DAY_KEYS.find(key => Boolean(candidate[key]));
    const slot = day ? style.memory.atSlot(day as any, String(candidate.fstarttime || "")) : null;
    if (slot) memoryNotes.push({ type: "memory", severity: "low", soft: true, rowId: 0, otherId: 0,
      message: slot.surprising ? "شيء لم ينتبه له أحد" : "من ذاكرة القسم", detail: slot.text });
    const hall = style.memory.aboutRoom(String(candidate.AdRoomCode || ""), String(candidate.AdRoomHall || ""), candidate.roomId);
    // Only the surprising half about a hall: «هذه قاعتك المعتادة» is true and
    // tells a coordinator nothing they have not known for years.
    if (hall?.surprising) memoryNotes.push({ type: "memory", severity: "low", soft: true, rowId: 0, otherId: 0,
      message: "شيء لم ينتبه له أحد", detail: hall.text });
  }

  /* ── الاستعارة المعتمدة ليست مخالفة نطاق ────────────────────────────────
   * «تنبيه نطاق القاعة» يقول إن القاعة مسجلة لقسم آخر، وهو صحيح دائماً — حتى
   * بعد أن يوافق القسم المضيف. وهو يمنع الحفظ (فليس soft)، فكان القسم الذي
   * أتمّ الطلب والموافقة يُمنع من استعمال ما استُعير له، والرسالة التي يقرؤها
   * «تنبيه» لا «رفض». فمتى غطّت نوافذُه المعتمدة أيام الموعد ووقتَه كاملاً،
   * تحوّل التنبيه إلى ما هو: خبر يُقرأ ولا يمنع، بنصّه الصحيح. وما عدا ذلك
   * يبقى مانعاً كما كان — الاستعارة تُطلب وتُعتمد، ولا تُفترض. */
  const barterCoversRow=myApprovedWindows.length>0&&selectedBarterDays.length>0&&!borrowerWindowViolation;
  const roomNotes=roomNotice
    ? [barterCoversRow
        ? {...roomNotice,severity:"low",soft:true,
           message:`قاعة مستعارة بنافذة معتمدة: ${candidate.AdRoomCode}/${candidate.AdRoomHall}`,
           detail:"القاعة مسجلة لقسم آخر، والاستعارة معتمدة لهذا اليوم والوقت. الحفظ مسموح داخل النافذة فقط."}
        : roomNotice]
    : [];
  /* التعارضُ مع حجز طلبٍ ينتظر القسم يُوسم بصاحبه: الواجهةُ تسأل المنسّق بوضوح بدل «ممنوع» (A2). */
  const withHolds = conflicts.map((conflict: any) => {
    const hold = holdOfRow(conflict.otherId);
    return hold ? { ...conflict, holdRequestId: hold.requestId, holdItemId: hold.itemId } : conflict;
  });
  return [...withHolds, ...barterNotes, ...roomNotes, ...softTravel, ...rhythmNote, ...memoryNotes];
}

/**
 * ── القسمُ يبقى صاحبَ القرار (A2) ───────────────────────────────────────────
 *
 * اختار الأستاذُ وقتاً فحُجز له حتى يقرّر القسم. فإن أراد المنسّقُ نقلَ ذلك
 * الموعد إلى وقتٍ جديد كان يُمنع بحجز الطلب نفسه، ولا مخرجَ له. الآن يُسأل:
 * الخادمُ يعيد `code: "request-hold"` مع صاحب الحجز، والواجهةُ تعرضه سؤالاً
 * واحداً، وتأكيدُه يُعيد الإرسال بـ`overrideRequestHolds`. عندها يمضي التعديلُ
 * متجاوزاً حجزَ ذلك الطلب وحده — حجوزُ بقية الأساتذة تبقى حارسة — ويُكتب في
 * خطّ الطلب الزمني، والبندُ الذي صار موعدُه هو المطلوب يُعلَّم «ثُبّت».
 */
export async function applyRequestHoldOverride(req: AuthenticatedRequest): Promise<string[]> {
  const ids: string[] = [...new Set<string>((Array.isArray(req.body?.overrideRequestHolds) ? req.body.overrideRequestHolds as unknown[] : []).map(value => String(value)).filter(Boolean))].slice(0, 10);
  const allowed: string[] = [];
  for (const id of ids) {
    const request = await Repository.getInstructorRequest(id);
    if (!request || request.status === "superseded" || request.status === "settled") continue;
    const visible = isScopeAllowed(req, Number(request.AdCollegeId), Number(request.AdSectionId))
      || (request.items || []).some(item => item.action !== "keep" && (() => { const scope = requestItemScope(request, item); return isScopeAllowed(req, scope.collegeId, scope.sectionId); })());
    if (visible) allowed.push(id);
  }
  if (allowed.length) {
    const current = (req as any).__requestReservationOwner;
    (req as any).__requestReservationOwner = [...new Set([...(Array.isArray(current) ? current : current ? [current] : []), ...allowed])];
  }
  return allowed;
}

/** بعد تعديلٍ أكّده القسم على موعدٍ محجوزٍ لطلب: يُسجَّل في خطّ الطلب، ويُثبَّت البندُ الذي صار موعدُه كما طُلب. */
export async function noteRequestHoldOverride(requestIds: string[], row: FSchedule | null, by: string): Promise<void> {
  const at = new Date().toISOString();
  for (const id of requestIds) {
    const request = await Repository.getInstructorRequest(id);
    if (!request) continue;
    const days = row ? dayKeysOf(row).sort().join(",") : "";
    const items = request.items.map(item => {
      if (!row || item.decision?.state === "fixed" || item.decision?.state === "rejected") return item;
      const same = (Number(item.rowId) === Number(row.id) || (item.offeringRowIds || []).includes(Number(row.id)))
        && (item.slots || []).map(slot => String(slot.day)).sort().join(",") === days
        && (item.slots || []).every(slot => timeToMinutes(slot.start) === timeToMinutes(row.fstarttime));
      return same ? { ...item, decision: { state: "fixed" as const, decidedBy: by, decidedAt: at, scheduleId: Number(row.id), note: "ثبّته القسم من الجدول مباشرة." } } : item;
    });
    await Repository.saveInstructorRequest({ ...request, items,
      timeline: [...(request.timeline || []), { kind: "schedule-edited" as const, at, by, detail: "عدّل القسم موعداً مرتبطاً بهذا الطلب أثناء انتظاره." }].slice(-300) }).catch(() => undefined);
  }
}

/** ردُّ 409 حين يحجز الموعدَ طلبُ أستاذٍ ينتظر القسم: من صاحبه، ليُسأل المنسّق بدل أن يُمنع. */
export async function requestHoldRefusal(requestIds: string[]) {
  const [instructors, requests] = await Promise.all([Repository.getInstructors(), Promise.all(requestIds.map(id => Repository.getInstructorRequest(id)))]);
  const nameOf = new Map((instructors as any[]).map(row => [Number(row.AdInstructorId), String(row.AdInstructorName || "")]));
  return {
    error: "هذا الموعد محجوزٌ لطلب أستاذ ينتظر قرارك. المتابعة تعتمد تعديلك وتُبقي الطلب في الوارد.",
    code: "request-hold",
    holds: requests.filter(Boolean).map(request => ({ requestId: request!.id, instructorName: nameOf.get(Number(request!.AdInstructorId)) || "" })),
  };
}
