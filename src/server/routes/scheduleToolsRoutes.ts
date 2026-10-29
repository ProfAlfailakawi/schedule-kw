/**
 * ── أدواتُ الجدول: اقتراحُ المواعيد والاستبدالُ والاجتماعات ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { roomSuitability } from "../../utils/roomSuitability";
import { placeholderMatch } from "../../utils/placeholderMatch";
import { eligibleSuggestionEditId, instructorRowsForSuggestion } from "../../utils/slotSuggestionScope";
import { emptySuggestionReason, orderSuggestionCandidates, rankSuggestionCandidates, SUGGESTION_EMPTY_WORD, toClock, type SuggestionDayKey, type SuggestionEmptyReason, type SuggestionHall } from "../../utils/suggestionEngine";
import { reservationRows, RequestReservationConflict, RequestHoldConflict } from "../../utils/instructorRequestReservations";
import { Response, NextFunction } from "express";
import { createHash } from "crypto";
import { Repository, ScheduleRevisionConflict, withSerialLock } from "../../db/repository";
import { isBlockingConflict, timeToMinutes } from "../../utils/scheduleIntelligence";
import { ensureSectionFaculty } from "../sectionFaculty";
import { isTrainingAssistant, planTaConversion } from "../../utils/taConversion";
import type { FSchedule } from "../../types";
import { computeMeetingSlots } from "../../utils/meetingSlots";
import { departmentFamily } from "../../utils/sectionLabel";
import { termIsFrozen, TERM_FROZEN_MESSAGE } from "../../utils/termSequence";
import { blockingConflicts } from "../../utils/scheduleBlockers";
import { roleDefinition } from "../../utils/academicRoles";
import { AR, countOf } from "../../utils/arabicCount";
import { learnAll } from "../../utils/courseNature";
import { formatScheduleTimeRange, SCHEDULE_SLOT_MINUTES, scheduleDayWindowMinutes } from "../../utils/scheduleTime";
import { eligibleHallsForSection, rowOccupiesRoom } from "../../utils/locationRegistry";
import { noteScheduleMutation, scheduleLockRefusal } from "../core/approvals";
import { type AuthenticatedRequest, requirePermission, signInRequiredMessage } from "../core/auth";
import { canonicalizeHistoricalLocationForRuntime, canonicalizeLocationForWrite, confirmedDepartmentRoomIds, readLocationRegistry } from "../core/locations";
import { applyRequestHoldOverride, noteRequestHoldOverride, requestHoldRefusal, scheduleConflicts } from "../core/scheduleConflicts";
import { meetingExcludedIds, roomOwnership, SCHEDULE_DAY_KEYS, scheduleLengthIssue, sectionScheduleWindow, travelMinutesFor } from "../core/scheduleRules";
import { createScheduleHandler, runScheduleHandler, updateScheduleHandler } from "../core/scheduleWrites";
import { filterByScope, isScopeAllowed } from "../core/scope";
import { approvalBlockerOptions, placeholderInstructorIds } from "../core/smartImport";
import { captureScopeVersion, confirmTokens, recordVersionAfter } from "../core/versions";

/**
 * TA conversion: explicit per-instructor classification, never inferred from a course level.
 * Both the dry preview and confirmed bulk edit are limited to one department and term.
 */
async function taConversionState(req: AuthenticatedRequest, collegeId: number, sectionId: number, termId: number) {
  const [rows, instructors, terms, section, facultyIds] = await Promise.all([
    Repository.getSchedulesByScope({ collegeId, sectionId, termId }),
    Repository.getInstructors(),
    Repository.getTerms(),
    Repository.getSectionById(sectionId),
    Repository.getDepartmentFaculty(collegeId, sectionId),
  ]);
  const placeholders = placeholderInstructorIds(instructors);
  const plan = planTaConversion(rows, instructors.filter(person => !placeholders.has(Number(person.AdInstructorId))));
  const mine = [...new Set(facultyIds.map(Number))].filter(id => placeholders.has(id));
  const previewKey = createHash("sha256").update(JSON.stringify({
    scope: [collegeId, sectionId, termId],
    rows: rows.map(row => [row.id, Number(row.rev || 0), row.AdInstructorId])
      .sort((a, b) => Number(a[0]) - Number(b[0])),
    tagged: instructors.filter(isTrainingAssistant).map(person => person.AdInstructorId).sort((a, b) => a - b),
  })).digest("hex");
  const frozen = termIsFrozen(termId, terms as any);
  const lock = frozen ? TERM_FROZEN_MESSAGE : await scheduleLockRefusal(req, collegeId, sectionId, termId);
  const tooMany = plan.affected.length > 400;
  const allowed = !lock && mine.length <= 1 && !tooMany;
  return {
    rows, plan, mine,
    previewKey, allowed,
    reason: lock || (mine.length > 1 ? "يوجد أكثر من سجل «هيئة تدريسية» في القسم؛ راجع السجل قبل التحويل." : "")
      || (tooMany ? "عدد المواعيد أكبر من الحد الآمن للتحويل دفعة واحدة (400)." : ""),
    termName: terms.find(t => Number(t.AdTermId) === termId)?.AdTermName || "",
    sectionName: section?.AdSectionName || "",
  };
}

/* The timetable tool keeps permission 7. The same read-only calculation is also
   available to a department head from reports (permission 14), and only for
   instructors in that head's own department. */
const requireMeetingAccess = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) { res.status(401).json({ error: signInRequiredMessage(req) }); return; }
  const granted = req.permissions ?? (await Repository.getSecurityByUser(req.user.SystemUserId)).map(item => Number(item.FormNameId));
  if (granted.includes(7) || (roleDefinition(req.user.Role).id === "departmentHead" && granted.includes(14))) { next(); return; }
  res.status(403).json({ error: "ليس لديك صلاحية للوصول إلى هذا القسم" });
};

async function meetingDepartmentPeople(req: AuthenticatedRequest, sectionId: number, termId: number) {
  const sections = await Repository.getSections();
  const own = (sections as any[]).find(sec => Number(sec.AdSectionId) === sectionId);
  if (!own || !isScopeAllowed(req, Number(own.AdCollegeId), sectionId)) return null;
  const family = departmentFamily(sections as any, Number(own.AdCollegeId), sectionId);
  const members = roleDefinition(req.user?.Role).id === "departmentHead"
    ? family.filter(member => isScopeAllowed(req, member.collegeId, member.sectionId)) : family;
  const lists = await Promise.all(members.map(member => Repository.getInstructorsByScope(member.sectionId, termId)));
  return [...new Map(lists.flat().map(person => [Number(person.AdInstructorId),
    { AdInstructorId: Number(person.AdInstructorId), AdInstructorName: String(person.AdInstructorName || "") }])).values()];
}

export function registerScheduleToolsRoutes(app: Express): void {
app.get("/api/schedules/ta-conversion", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0), sectionId = Number(req.query.sectionId || 0), termId = Number(req.query.termId || 0);
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "اختر الكلية والقسم والفصل." }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحياتك" }); return; }
  const state = await taConversionState(req, collegeId, sectionId, termId);
  res.setHeader("Cache-Control", "no-store");
  res.json({
    people: state.plan.people, affected: state.plan.affected.length, sections: state.plan.sections,
    previewKey: state.previewKey, allowed: state.allowed, reason: state.reason,
    termName: state.termName, sectionName: state.sectionName,
  });
});
app.post("/api/schedules/ta-conversion", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.body?.collegeId || 0), sectionId = Number(req.body?.sectionId || 0), termId = Number(req.body?.termId || 0);
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "اختر الكلية والقسم والفصل." }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحياتك" }); return; }
  if (!confirmTokens(req).has("ta-conversion")) { res.status(409).json({ error: "التحويل يحتاج تأكيداً صريحاً." }); return; }
  await withSerialLock("ta:" + collegeId + ":" + sectionId + ":" + termId, async () => {
    const state = await taConversionState(req, collegeId, sectionId, termId);
    if (!state.allowed) { res.status(409).json({ error: state.reason || "جدول الفصل غير قابل للتعديل." }); return; }
    if (!req.body.previewKey || req.body.previewKey !== state.previewKey) {
      res.status(409).json({ error: "تغيّر الجدول أو تصنيف أحد الأساتذة بعد المعاينة؛ افتح المعاينة من جديد." }); return;
    }
    const affected = state.plan.affected;
    if (!affected.length) { res.json({ changed: 0 }); return; }
    if (affected.length > 400) { res.status(409).json({ error: "عدد المواعيد أكبر من الحد الآمن للتحويل دفعة واحدة (400)." }); return; }
    const placeholderId = state.mine[0] || (await ensureSectionFaculty(Repository, collegeId, sectionId)).instructorId;
    if (!placeholderId) { res.status(409).json({ error: "تعذّر تحديد سجل «هيئة تدريسية» الخاص بالقسم." }); return; }
    const before = await captureScopeVersion(req, collegeId, sectionId, termId, "قبل تحويل هيئة التدريب TA إلى هيئة تدريسية", "manual");
    let updated: FSchedule[];
    try {
      updated = await Repository.moveSchedulesBatch(affected.map(row => ({
        id: Number(row.id),
        expectedRev: Number(row.rev || 0),
        fields: { AdInstructorId: placeholderId },
      })));
    } catch (error: any) {
      if (error instanceof ScheduleRevisionConflict) {
        res.status(409).json({ error: "تغيّر أحد المواعيد أثناء التحويل؛ أعد المعاينة." }); return;
      }
      throw error;
    }
    const byId = new Map(updated.map(row => [Number(row.id), row]));
    await recordVersionAfter(before, current => current.map(row => byId.get(Number(row.id)) || row));
    res.locals.auditChanges = "تحويل أسماء " + state.plan.people.length + " من هيئة التدريب في " + countOf(updated.length, AR.appointment) + " إلى هيئة تدريسية.";
    res.locals.auditRowIds = updated.map(row => Number(row.id)).slice(0, 10);
    await noteScheduleMutation(req, collegeId, sectionId, termId, { kind: "edit" });
    res.json({ changed: updated.length, undoVersionId: before?.id });
  });
});

/**
 * Retire a member of staff out of a whole term in one move.
 *
 * Copying a term brings last year's staff with it, and some of them have
 * retired, resigned or been released. Chasing their name through forty
 * appointments by hand is the kind of work that produces mistakes, so this
 * either hands every one of their appointments to a named replacement, or
 * clears the instructor and leaves the appointments visibly unassigned for the
 * department to fill. It never deletes teaching.
 */
app.post("/api/schedules/replace-instructor", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const fromId = Number(req.body?.fromInstructorId || 0);
  const toId = Number(req.body?.toInstructorId || 0);
  const collegeId = Number(req.body?.collegeId || 0);
  const sectionId = Number(req.body?.sectionId || 0);
  const termId = Number(req.body?.termId || 0);
  const commit = req.body?.commit === true;
  if (!fromId || !termId || !collegeId || !sectionId) { res.status(400).json({ error: "حدد الأستاذ والفصل." }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  if (fromId === toId) { res.status(400).json({ error: "اختر أستاذاً بديلاً مختلفاً." }); return; }
  if (commit) {
    /* استبدالُ أستاذٍ تعديلٌ جزئي، فالموعد لا يمنعه. لكنه تعديلٌ على كل حال،
       فلا يمرّ وجدولُ القسم بين يدي التسجيل. */
    const replaceLock = await scheduleLockRefusal(req,collegeId, sectionId, termId);
    if (replaceLock) { res.status(409).json({ error: replaceLock, code: "schedule-locked" }); return; }
  }

  const [scopeRows, termRows, instructors] = await Promise.all([
    Repository.getSchedulesByScope({ collegeId, sectionId, termId }),
    Repository.getSchedulesByScope({ termId }),
    Repository.getInstructors(),
  ]);
  const rows = filterByScope(req, scopeRows).filter(row => Number(row.AdInstructorId) === fromId);
  const movedIds = new Set(rows.map(row => Number(row.id)));
  const candidates = rows.map(row => ({ ...row, AdInstructorId: toId || 0 }));
  const remaining = termRows.filter(row => !movedIds.has(Number(row.id)));
  const conflicts = toId
    ? blockingConflicts(candidates, [...remaining, ...candidates], await approvalBlockerOptions())
        .filter((item:any) => movedIds.has(Number(item.rowId)) || movedIds.has(Number(item.otherId)))
        .slice(0, 20)
    : [];
  const reasons = [...new Set(conflicts.map((item:any) => String(item.message || item.detail || "يوجد تعارض زمني")))];
  const compatible = conflicts.length === 0;
  if (!commit) {
    res.json({ preview: true, affected: rows.length, compatible, conflicts, reasons, cleared: !toId });
    return;
  }
  if (!compatible) {
    res.status(409).json({ error: "لا يمكن الاستبدال بسبب تعارض في مواعيد الأستاذ البديل.", compatible: false, conflicts, issues: reasons });
    return;
  }
  const fromName = instructors.find(i => Number(i.AdInstructorId) === fromId)?.AdInstructorName || `أستاذ ${fromId}`;
  const toName = toId ? (instructors.find(i => Number(i.AdInstructorId) === toId)?.AdInstructorName || `أستاذ ${toId}`) : "بلا أستاذ";
  const undoVersion = await captureScopeVersion(req, collegeId, sectionId, termId, `قبل استبدال الأستاذ: ${fromName} ← ${toName}`, "manual");
  for (const row of rows) await Repository.updateSchedule(row.id, { AdInstructorId: toId || 0 } as any);
  const replacedIds = new Set(rows.map((row: any) => Number(row.id)));
  await recordVersionAfter(undoVersion, before => before.map(row => replacedIds.has(Number(row.id)) ? { ...row, AdInstructorId: toId || 0 } : row));
  if (rows.length) await noteScheduleMutation(req, collegeId, sectionId, termId, { kind: "edit" });
  res.json({ preview: false, moved: rows.length, cleared: !toId, compatible: true, undoVersionId: undoVersion?.id });
});

app.get("/api/schedules/replace-instructor/history", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0), sectionId = Number(req.query.sectionId || 0), termId = Number(req.query.termId || 0);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const versions = await Repository.getScheduleVersions(collegeId, sectionId, termId, 80);
  res.json(versions
    .filter(v => String(v.label || "").startsWith("قبل استبدال الأستاذ:"))
    .slice(0, 20)
    .map(v => ({ id: v.id, label: v.label, createdAt: v.createdAt, userName: v.userName, rowCount: Number(v.rowCount ?? v.rows.length) })));
});

/**
 * What the department's courses actually are, learned from every term on record.
 *
 * Returned for a whole department at once, because the screens that want it —
 * the editor, the adoption review — want it for everything they are showing.
 * The read is cached, so asking is nearly free after the first time.
 */
app.get("/api/courses/nature", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const sectionId = Number(req.query.sectionId || 0);
  if (!sectionId) { res.json({ nature: {} }); return; }
  /* The section id arrives from the query, so it has to be checked against the
     caller's own scopes — otherwise any holder of the schedule permission could
     read another department's ten-year teaching patterns by changing a number
     in the address bar. The same check the instructor roster already makes. */
  /* الحَكَم الواحد (isScopeAllowed) — لا مطابقةَ حرفيةٌ ثانية على صفوف النطاق. */
  const natureSection = (await Repository.getSections()).find(row => Number(row.AdSectionId) === sectionId);
  if (!natureSection || !isScopeAllowed(req, Number(natureSection.AdCollegeId), sectionId)) {
    res.status(403).json({ error: "القسم خارج نطاق صلاحيتك" });
    return;
  }
  const courses = await Repository.getOperationalCoursesBySection(sectionId);
  const history = await Repository.getScheduleHistoryForCourses(courses.map(course => course.AdCourseId));
  const learned = learnAll(history);
  res.json({
    nature: Object.fromEntries([...learned.entries()].map(([id, value]) => [id, value])),
    terms: new Set(history.map(row => Number(row.AdTermId))).size,
    observations: history.length
  });
});

/** Answers "whose hall is this?" from the room alone — no day, no time. */
app.get("/api/rooms/owner", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  /* السؤالُ عن قاعةٍ يُسأل من قسمٍ في نطاق السائل. */
  const askCollege = Number(req.query.collegeId || 0), askSection = Number(req.query.sectionId || 0);
  if (askCollege && askSection && !isScopeAllowed(req, askCollege, askSection)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const owner = await roomOwnership(
    req.query.room, req.query.hall,
    Number(req.query.collegeId || 0), Number(req.query.sectionId || 0)
  );
  res.json({ owner });
});

/**
 * Where should this lecture go?
 *
 * Choosing a time and a hall by hand means holding four things in your head at
 * once: is the instructor free, is the hall free, does this strand the
 * instructor with an hour of nothing, and can they physically get there from
 * wherever they teach before it. This walks every half hour of the teaching
 * week against every hall the department already uses, throws away anything
 * that collides, and ranks what survives by the three costs that actually hurt:
 * idle time created for the instructor, the walk between buildings, and how
 * scattered the students' day becomes.
 *
 * It proposes; nothing is written. The coordinator still decides.
 */
app.post("/api/schedules/suggest-slots", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body || {};
  const collegeId = Number(body.AdCollegeId || 0), sectionId = Number(body.AdSectionId || 0), termId = Number(body.AdTermId || 0);
  const instructorId = Number(body.AdInstructorId || 0);
  const excludeId = Number(body.excludeId || 0);
  const dayKeys = SCHEDULE_DAY_KEYS.filter(key => Boolean(body[key])) as SuggestionDayKey[];
  /* «اقترح قاعة»: الوقت محسوم والسؤال عن القاعة وحدها. القاعدة نفسها (قاعات
     القسم + المستعارة المعتمدة، الفراغ، الأستاذ، الانتقال) لكن عند خانة واحدة،
     وتُعاد عدة قاعات بدل عدة أوقات. */
  const fixedStart = body.roomOnly && body.fstarttime ? timeToMinutes(body.fstarttime) : NaN;
  const fixedEnd = body.roomOnly && body.fendtime ? timeToMinutes(body.fendtime) : NaN;
  const roomOnly = Number.isFinite(fixedStart) && Number.isFinite(fixedEnd) && fixedEnd > fixedStart;
  const duration = roomOnly ? fixedEnd - fixedStart : Math.max(30, Math.min(300, Number(body.durationMinutes || 60)));
  const empty = (reason: SuggestionEmptyReason, note?: string) => res.json({ slots: [], reason, note: note || SUGGESTION_EMPTY_WORD[reason], replaceable: [] });

  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "حدد الكلية والقسم والفصل" }); return; }
  if (!dayKeys.length) { empty("days"); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }

  const [universe, mobility, registry, barterRequests, pinnedRooms, course, instructor, reservations, sectionWindow, instructorsAll] = await Promise.all([
    Repository.getSchedulesByScope({ termId }),
    Repository.getCampusMobilityProfile(collegeId),
    readLocationRegistry(),
    Repository.getHallBarterRequests(termId),
    Repository.getPinnedDepartmentRooms(collegeId, sectionId),
    Repository.getCourseById(Number(body.AdCourseId||0)),
    instructorId ? Repository.getInstructorById(instructorId) : Promise.resolve(null),
    Repository.getInstructorRequestReservations(termId),
    sectionScheduleWindow(sectionId),
    Repository.getInstructors(),
  ]);
  let owner = "";
  if (body.instructorRequestId) {
    const request = await Repository.getInstructorRequest(String(body.instructorRequestId));
    if (request && Number(request.AdInstructorId) === instructorId && Number(request.AdTermId) === termId) owner = request.id;
  }
  /* الموعد المفتوح للتعديل لا يتعارض مع نفسه: يُستثنى من كل قراءة هنا ومن البوابة. */
  const editedRowId = eligibleSuggestionEditId(universe, excludeId, collegeId, sectionId, termId);
  const held = reservationRows(reservations.filter(entry => entry.requestId !== owner), termId);
  const live = [...universe, ...held].filter(row => Number(row.id) !== editedRowId);
  const sectionRows = live.filter(row => row.AdCollegeId === collegeId && row.AdSectionId === sectionId);

  // Suggestions use the same permission surface as the picker: assigned,
  // explicitly pinned, or approved borrowed rooms.
  const approvedBorrows=barterRequests.filter(request=>request.status==="approved"&&Number(request.requesterCollegeId)===collegeId&&Number(request.requesterSectionId)===sectionId&&request.roomId);
  const borrowedRoomIds=new Set(approvedBorrows.map(request=>String(request.roomId)));
  const pinnedRoomIds=confirmedDepartmentRoomIds(registry,pinnedRooms,collegeId);
  const halls=eligibleHallsForSection(registry,sectionId,borrowedRoomIds,pinnedRoomIds);
  const roomById=new Map(registry.rooms.map(room=>[String(room.id),room]));
  if (!halls.length) { empty("halls", "لا توجد قاعات رسمية متاحة لهذا القسم في سجل المباني والقاعات"); return; }

  const bounds = scheduleDayWindowMinutes(sectionWindow);
  const DAY_START = bounds.start, DAY_END = bounds.end, STEP = SCHEDULE_SLOT_MINUTES;
  // Borrowed rooms are only candidates inside the approved day/time windows.
  const borrowCovers=(roomId:string,day:string,from:number,to:number)=>
    approvedBorrows.some(request=>String(request.roomId)===roomId&&request.day===day&&
      timeToMinutes(String(request.startTime))<=from&&timeToMinutes(String(request.endTime))>=to);

  // The advisor must not offer a slot that is already over the course's
  // weekly-hour ceiling. Its duration is identical for every candidate.
  if(Number(body.AdCourseId||0) && String(body.SCode||"").trim()){
    const sampleStart=roomOnly ? fixedStart : DAY_START;
    const hoursIssue=await scheduleLengthIssue({
      ...body, id:editedRowId, fstarttime:toClock(sampleStart), fendtime:toClock(sampleStart+duration),
    },universe);
    if(hoursIssue){empty("hours",hoursIssue);return;}
  }
  // A faculty placeholder is not a person: the save/conflict engine already exempts it.
  // Keep genuine instructors and physical hall occupancy fully enforced.
  const instructorRows = instructorRowsForSuggestion(live, instructorId, instructor);
  const overlapsSelected=(row:any,from:number,to:number)=>dayKeys.some(day=>Boolean(row[day]))&&timeToMinutes(row.fstarttime)<to&&timeToMinutes(row.fendtime)>from;

  /* ── المرفق المرافق داخل الاقتراح نفسه ─────────────────────────────────────
     مقررٌ يتطلب استوديو لا يُقترح له وقتٌ/قاعة بلا استوديو متاح في الموقع نفسه
     طوال الموعد؛ والاقتراح يحمل المرفق المختار فيملأ النموذج بالاثنين معاً. */
  const companionType=String(course?.CourseCompanionRoomType||"").trim();
  const companionPool=companionType?registry.rooms
    .filter(room=>room.active&&room.confidence==="CONFIRMED"&&room.bookingPolicy==="companion_only"&&String(room.roomType||"").trim()===companionType)
    .map(room=>({room,building:registry.buildings.find(item=>item.id===room.buildingId)}))
    .filter(({building})=>Boolean(building?.active&&building.confidence==="CONFIRMED")):[];
  const companionFor=companionType?(hall:SuggestionHall,from:number,to:number)=>{
    const primary=registry.buildings.find(item=>item.id===hall.buildingId);
    const site=String(primary?.officialCode||"").slice(0,4);
    for(const {room,building} of companionPool){
      if(String(building!.officialCode||"").slice(0,4)!==site)continue;
      const busy=live.some(row=>overlapsSelected(row,from,to)&&rowOccupiesRoom(row,room.id,building!.officialCode,room.canonicalCode));
      if(!busy)return {id:room.id,label:`${building!.officialCode} / ${room.canonicalCode}`};
    }
    return null;
  }:undefined;

  const starts: number[] = [];
  if (roomOnly) starts.push(fixedStart);
  else for (let start = DAY_START; start + duration <= DAY_END; start += STEP) starts.push(start);
  const { candidates, stats } = rankSuggestionCandidates({
    dayKeys, starts, duration,
    halls: halls.map(hall=>({room:String(hall.room),hall:String(hall.hall),buildingId:String(hall.buildingId),roomId:String(hall.roomId)})),
    /* A4: القاعة الرسمية (roomId) مكانٌ واحد عبر الكليات؛ أما صفٌّ قديم بنصّ المبنى/القاعة
       وحده فلا يُطابَق إلا في كليته — «1/101» في بنات ليست «1/101» في بنين. */
    hallRows: hall => live.filter(row => rowOccupiesRoom(row, hall.roomId, hall.room, hall.hall) && (Boolean(row.roomId) || Boolean(row.companionRoomId) || Number(row.AdCollegeId) === collegeId)),
    instructorRows, sectionRows,
    travelMinutes: (from, to) => travelMinutesFor(mobility, from as any, to as any),
    borrowBlocked: (hall, day, from, to) => {
      const record=roomById.get(String(hall.roomId));
      const borrowingRequired=borrowedRoomIds.has(String(hall.roomId)) && !record?.shared && !record?.sectionIds?.includes(sectionId);
      return borrowingRequired && !borrowCovers(String(hall.roomId),day,from,to);
    },
    suitability: hall => roomSuitability(course, roomById.get(String(hall.roomId))),
    companion: companionFor,
  });

  /* الاقتراح للعرض فقط، لكنه يجب أن يمرّ من بوابة التعارض نفسها التي تمنع
     حفظ الموعد. الترتيب أعلاه سريع، ثم تحسم scheduleConflicts التعارضات
     الأكاديمية والقاعة وفق منطق موعد جديد حرفياً قبل إظهار أي خيار. والبوابة
     تمشي القائمة المرتّبة كلها (بسقف) لا أول 18 فقط: كان رفضُ الأوائل يُفرغ
     النتيجة رغم وجود خيارات صالحة بعدهم — «يعمل مرة ولا يعمل مرة». */
  const ranked = orderSuggestionCandidates(candidates, roomOnly);
  const conflictReq = Object.create(req) as AuthenticatedRequest;
  if (owner) (conflictReq as any).__requestReservationOwner = owner;
  const wanted = roomOnly ? 6 : 3;
  const GATE_LIMIT = 48;
  const slots: typeof ranked = [];
  let rejectedByScheduleGate = 0, gated = 0;
  for (const slot of ranked) {
    if (slots.length >= wanted || gated >= GATE_LIMIT) break;
    gated++;
    const candidate = {
      ...body,
      AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId,
      AdCourseId: Number(body.AdCourseId || 0), AdInstructorId: instructorId,
      AdRoomCode: slot.room, AdRoomHall: slot.hall,
      buildingId: slot.buildingId, roomId: slot.roomId, locationStatus: "VERIFIED",
      companionRoomId: slot.companionRoomId || "",
      fstarttime: slot.start, fendtime: slot.end,
      ...Object.fromEntries(SCHEDULE_DAY_KEYS.map(key => [key, dayKeys.includes(key as SuggestionDayKey)])),
    };
    const location = await canonicalizeLocationForWrite(candidate, collegeId, sectionId);
    if (!location.check.ok) { rejectedByScheduleGate++; continue; }
    const conflicts = await scheduleConflicts(conflictReq, { ...candidate, ...location.check.canonical }, editedRowId);
    if (conflicts.some((conflict: any) => !conflict.soft && isBlockingConflict(conflict))) { rejectedByScheduleGate++; continue; }
    slots.push(slot);
  }

  /* ── 🔄 قابلة للاستبدال: خانةٌ أو قاعةٌ تحجزها شعبةٌ «هيئة تدريسية» من القسم نفسه
     وتطابق ما يُبحث عنه لأستاذٍ حقيقي تطابقاً تاماً (placeholderMatch): نمط ساعات
     المقرر، والأيام والوقت (أو المدة) التي ثبّتها البحث، والسعة، والمرفق، والأستاذ حرّ.
     في «اقترح قاعة» وفي «اقترح وقتاً وقاعة» معاً. للمقرر نفسه: «خذ موعدها» (⭐). */
  const placeholderIds=placeholderInstructorIds(instructorsAll as any);
  const realTeacher=instructorId>0&&!placeholderIds.has(instructorId);
  const teacherBusy=(days:readonly string[],from:number,to:number)=>instructorRows.some(row=>days.some(day=>Boolean((row as any)[day]))&&timeToMinutes(row.fstarttime)<to&&timeToMinutes(row.fendtime)>from);
  const replaceable=realTeacher?universe
    .filter(row=>Number(row.id)!==editedRowId&&Number(row.AdCollegeId)===collegeId&&Number(row.AdSectionId)===sectionId&&Number(row.AdTermId)===termId)
    .filter(row=>placeholderIds.has(Number(row.AdInstructorId)))
    .filter(row=>halls.some(hall=>rowOccupiesRoom(row,hall.roomId,hall.room,hall.hall)))
    .map(row=>({row,match:placeholderMatch({
      course:course as any,row:row as any,room:row.roomId?roomById.get(String(row.roomId)):null,teacherBusy,
      wanted:roomOnly?{days:dayKeys as any,start:fixedStart,end:fixedEnd}:{days:dayKeys as any,minutes:duration},
    })}))
    .filter(({match})=>match.ok)
    .map(({row,match})=>({
      rowId:Number(row.id),room:String(row.AdRoomCode||""),hall:String(row.AdRoomHall||""),buildingId:row.buildingId,roomId:row.roomId,
      start:row.fstarttime,end:row.fendtime,days:match.days,pattern:match.pattern,capacity:match.capacity,
      courseId:Number(row.AdCourseId),scode:String(row.SCode||""),
      courseName:String(row.AdCourseName||""),sameCourse:Number(row.AdCourseId)===Number(body.AdCourseId||0),
    }))
    .sort((a,b)=>Number(b.sameCourse)-Number(a.sameCourse)||timeToMinutes(a.start)-timeToMinutes(b.start))
    .slice(0,4):[];

  /* عدد الطلبة يُذكر فقط حين يوجد رادار تسجيلٍ حالي للفصل: مجموع مقاعد المقرر وعدد شعبه
     كما حسبهما الرادار — لا رقمَ مخترعاً لكل شعبة، ولا رقمَ إن لم يوجد رادار. */
  if (replaceable.length) {
    const run = await Repository.getRegistrationRun(termId).catch(() => undefined);
    if (run && !run.stale) {
      for (const item of replaceable as any[]) {
        const course = (run.courses || []).find(entry => Number(entry.courseId) === item.courseId && Number(entry.sectionId) === sectionId);
        if (course) item.radar = { seated: Number(course.seated || 0), sections: Number(course.sections || 0) };
      }
    }
  }
  if (!slots.length) {
    const reason = emptySuggestionReason({ ...stats, gate: rejectedByScheduleGate });
    res.json({ slots, reason, note: SUGGESTION_EMPTY_WORD[reason], replaceable, considered: candidates.length, rejectedByScheduleGate });
    return;
  }
  res.json({ slots, replaceable, considered: candidates.length, rejectedByScheduleGate });
});

/* ── 🔄 شعبة «هيئة تدريسية» قابلة للاستبدال: تنفيذٌ ذرّي (G3) ────────────────────
 * assign  — يُسند الأستاذ إلى الشعبة القائمة للمقرر نفسه (لا موعد جديد).
 * swap    — تنتقل الشعبة إلى قاعةٍ حرّة أخرى (swapTo)، ويُحفظ الموعد الجديد في قاعتها.
 * replace — تُحذف الشعبة ويُحفظ الموعد الجديد في قاعتها.
 * كل خطوة تمرّ أولاً من مساري الحفظ والتعديل نفسيهما فحصاً جافّاً على الأسبوع كما سيصير
 * (النطاق، القفل، المكان، المرفق، الساعات، التعارض)، ثم تُكتب كلها في معاملة واحدة
 * (Repository.commitScheduleChangeSet) أو لا يُكتب شيء. والردّ يحمل خطوات التراجع. */
app.post("/api/schedules/placeholder-action", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const action = String(req.body?.action || "");
  if (!["assign", "swap", "replace"].includes(action)) { res.status(400).json({ error: "إجراءٌ غير معروف." }); return; }
  const placeholder = await Repository.getScheduleById(Number(req.body?.placeholderId || 0));
  if (!placeholder) { res.status(404).json({ error: "الشعبة غير موجودة." }); return; }
  if (!isScopeAllowed(req, placeholder.AdCollegeId, placeholder.AdSectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  if (req.body?.placeholderRev != null && Number(req.body.placeholderRev) !== Number(placeholder.rev || 0)) {
    res.status(409).json({ error: "تغيّرت هذه الشعبة أثناء عملك؛ لم يُحفظ شيء.", conflict: "revision", current: placeholder }); return;
  }
  const instructors = await Repository.getInstructors();
  const placeholders = placeholderInstructorIds(instructors as any);
  if (!placeholders.has(Number(placeholder.AdInstructorId))) { res.status(409).json({ error: "هذه الشعبة لم تعد «هيئة تدريسية»." }); return; }
  const termId = Number(placeholder.AdTermId);
  const appointment = req.body?.appointment || {};
  const teacherId = Number(appointment.AdInstructorId || 0);
  if (!teacherId || placeholders.has(teacherId)) { res.status(400).json({ error: "اختر الأستاذ أولاً." }); return; }
  if (Number(appointment.AdTermId || termId) !== termId || Number(appointment.AdCollegeId || placeholder.AdCollegeId) !== Number(placeholder.AdCollegeId)
    || Number(appointment.AdSectionId || placeholder.AdSectionId) !== Number(placeholder.AdSectionId)) {
    res.status(400).json({ error: "الموعد والشعبة في نطاقين مختلفين." }); return;
  }
  const lock = await scheduleLockRefusal(req, placeholder.AdCollegeId, placeholder.AdSectionId, termId);
  if (lock) { res.status(409).json({ error: lock, code: "schedule-locked" }); return; }
  /* حجزُ طلب أستاذٍ ينتظر القسم يُسأل عنه لا يقفل (A2): الطلبات التي أكّد المنسّق تجاوزها
     تمرّ في الفحص الجافّ والمعاملة معاً، وحجوز بقية الأساتذة تبقى حارسة. */
  const overrideRequestHolds = Array.isArray(req.body?.overrideRequestHolds) ? req.body.overrideRequestHolds : undefined;
  const overrides = await applyRequestHoldOverride(req);
  const owners = (req as any).__requestReservationOwner || "";

  const rowBody = (row: FSchedule) => {
    const { id: _id, AdCourseName: _name, ...values } = row as any;
    return values;
  };
  const placeRoom = { buildingId: placeholder.buildingId, roomId: placeholder.roomId, AdRoomCode: placeholder.AdRoomCode, AdRoomHall: placeholder.AdRoomHall, locationStatus: placeholder.locationStatus || "VERIFIED" };
  type Op = { kind: "create"; body: any; tempId: number } | { kind: "update"; rowId: number; original: FSchedule; body: any } | { kind: "delete"; rowId: number; original: FSchedule };
  const ops: Op[] = [];
  if (action === "assign") {
    if (Number(appointment.AdCourseId || 0) !== Number(placeholder.AdCourseId)) { res.status(400).json({ error: "الإسناد للمقرر نفسه فقط؛ استعمل التبديل أو الاستبدال." }); return; }
    ops.push({ kind: "update", rowId: placeholder.id, original: placeholder, body: { ...rowBody(placeholder), AdInstructorId: teacherId } });
  } else {
    const createBody = { ...appointment, ...placeRoom, AdCollegeId: placeholder.AdCollegeId, AdSectionId: placeholder.AdSectionId, AdTermId: termId };
    delete createBody.id; delete createBody.excludeId; delete createBody.rev;
    /* الموعد يأخذ خانتها كما هي: أيامها ووقتها (قد تأتي من «اقترح وقتاً وقاعة» بوقتٍ غير وقت النموذج). */
    for (const day of SCHEDULE_DAY_KEYS) createBody[day] = Boolean((placeholder as any)[day]);
    createBody.fstarttime = placeholder.fstarttime; createBody.fendtime = placeholder.fendtime;
    if (action === "replace" && !createBody.companionRoomId && placeholder.companionRoomId) createBody.companionRoomId = placeholder.companionRoomId;
    if (action === "swap") {
      const to = req.body?.swapTo || {};
      if (!to.buildingId || !to.roomId) { res.status(400).json({ error: "حدّد القاعة الحرّة التي تنتقل إليها الشعبة." }); return; }
      ops.push({ kind: "update", rowId: placeholder.id, original: placeholder, body: { ...rowBody(placeholder), buildingId: to.buildingId, roomId: to.roomId, AdRoomCode: to.AdRoomCode, AdRoomHall: to.AdRoomHall, locationStatus: "VERIFIED", companionRoomId: placeholder.companionRoomId } });
    } else {
      ops.push({ kind: "delete", rowId: placeholder.id, original: placeholder });
    }
    ops.push({ kind: "create", body: createBody, tempId: -900101 });
  }

  /* ── الأسبوعُ كما سيصير، وفحصٌ جافّ لكل خطوة عليه بمساري الحفظ والتعديل ── */
  const termRows = await Repository.getSchedulesByScope({ termId });
  const removed = new Set(ops.filter(op => op.kind === "delete").map(op => (op as any).rowId as number));
  const updatedBy = new Map(ops.filter(op => op.kind === "update").map(op => [(op as any).rowId as number, op] as const));
  const created = ops.filter(op => op.kind === "create") as Array<Extract<Op, { kind: "create" }>>;
  const finalWeek: FSchedule[] = [
    ...termRows.filter(row => !removed.has(Number(row.id))).map(row => { const op: any = updatedBy.get(Number(row.id)); return op ? ({ ...row, ...op.body } as FSchedule) : row; }),
    ...created.map(op => ({ ...op.body, id: op.tempId } as FSchedule)),
  ];
  const weekFor = (op: Op) => op.kind === "create" ? finalWeek.filter(row => Number(row.id) !== op.tempId) : finalWeek;
  const warnings: any[] = [];
  for (const op of ops) {
    if (op.kind === "delete") continue;
    const dry = op.kind === "update"
      ? await runScheduleHandler(updateScheduleHandler, req, { params: { id: String(op.rowId) }, body: { ...op.body, rev: op.original.rev, ...(overrideRequestHolds ? { overrideRequestHolds } : {}) }, hypotheticalWeek: weekFor(op), dryRun: true })
      : await runScheduleHandler(createScheduleHandler, req, { body: { ...op.body, ...(overrideRequestHolds ? { overrideRequestHolds } : {}) }, hypotheticalWeek: weekFor(op), dryRun: true });
    if (dry.status >= 400) { res.status(dry.status).json({ ...(dry.body && typeof dry.body === "object" ? dry.body : { error: "تعذّر التنفيذ." }), step: op.kind, applied: false }); return; }
    op.body = dry.body.row;
    warnings.push(...(dry.body?.warnings || []));
  }

  const version = await captureScopeVersion(req, placeholder.AdCollegeId, placeholder.AdSectionId, termId,
    action === "assign" ? "قبل إسناد شعبة «هيئة تدريسية»" : action === "swap" ? "قبل تبديل قاعة شعبة «هيئة تدريسية»" : "قبل استبدال شعبة «هيئة تدريسية»", "manual");
  const registry = await readLocationRegistry();
  let committed: { rows: FSchedule[]; deletedIds: number[] };
  try {
    committed = await Repository.commitScheduleChangeSet(termId, ops.map(op => op.kind === "create" ? { kind: "create" as const, body: op.body } : op as any),
      row => canonicalizeHistoricalLocationForRuntime(row, registry), placeholders, async (rows, week) => {
        for (const row of rows) { const issue = await scheduleLengthIssue(row, week); if (issue) throw new RequestReservationConflict(issue); }
      }, owners);
  } catch (error: any) {
    if (error instanceof RequestHoldConflict) { res.status(409).json({ ...await requestHoldRefusal([error.holdRequestId]), applied: false }); return; }
    res.status(error instanceof ScheduleRevisionConflict || error instanceof RequestReservationConflict ? 409 : 503)
      .json({ error: error?.message || "تعذّر التنفيذ. لم يُحفظ أي تغيير.", applied: false });
    return;
  }
  try {
    await recordVersionAfter(version, before => [...before.filter(row => !removed.has(Number(row.id)) && !committed.rows.some(item => Number(item.id) === Number(row.id))),
      ...committed.rows.filter(row => Number(row.AdCollegeId) === Number(placeholder.AdCollegeId) && Number(row.AdSectionId) === Number(placeholder.AdSectionId))]);
    await noteScheduleMutation(req, placeholder.AdCollegeId, placeholder.AdSectionId, termId, { kind: action === "assign" ? "edit" : "add", rows: committed.rows } as any);
  } catch { warnings.push({ message: "حُفظ التغيير؛ تعذّر تحديث سجل النسخة أو الإشعار." }); }
  const createdRow = committed.rows.find(row => !updatedBy.has(Number(row.id)) && Number(row.id) !== Number(placeholder.id));
  if (overrides.length) await noteRequestHoldOverride(overrides, createdRow || committed.rows[0] || null, String(req.user?.Name || "القسم"));
  const teacherName = instructors.find(person => Number(person.AdInstructorId) === teacherId)?.AdInstructorName || "";
  const label = `${placeholder.AdCourseName || "مقرر"} · شعبة ${placeholder.SCode} · ${formatScheduleTimeRange(placeholder.fstarttime, placeholder.fendtime)} · ${placeholder.AdRoomCode}/${placeholder.AdRoomHall}`;
  res.locals.auditChanges = action === "assign" ? `إسناد «هيئة تدريسية» إلى ${teacherName}: ${label}`
    : action === "swap" ? `تبديل قاعة «هيئة تدريسية» (${label}) إلى ${req.body?.swapTo?.AdRoomCode}/${req.body?.swapTo?.AdRoomHall} وإضافة موعد ${teacherName} مكانها`
      : `استبدال «هيئة تدريسية» (${label}) بموعد ${teacherName}`;
  res.locals.auditRowIds = [...committed.rows.map(row => Number(row.id)), ...committed.deletedIds];
  /* خطوات التراجع بالترتيب: يُزال الجديد أولاً ثم تعود الشعبة كما كانت. */
  const undo: Array<{ method: "PUT" | "POST" | "DELETE"; url: string; body?: any }> = [];
  if (createdRow) undo.push({ method: "DELETE", url: `/api/schedules/${createdRow.id}` });
  if (action === "replace") undo.push({ method: "POST", url: "/api/schedules", body: rowBody(placeholder) });
  else undo.push({ method: "PUT", url: `/api/schedules/${placeholder.id}`, body: rowBody(placeholder) });
  res.json({ ok: true, action, rows: committed.rows, deletedIds: committed.deletedIds, createdId: createdRow?.id || 0, undo, warnings });
});

app.get("/api/schedules/meeting-participants", requireMeetingAccess, async (req: AuthenticatedRequest, res: Response) => {
  const termId = Number(req.query.termId || 0);
  if (!termId) { res.status(400).json({ error: "حدد الفصل الدراسي" }); return; }
  /* اجتماع القسم: القسمُ عائلةٌ عبر كلياته (departmentFamily)، فأساتذته من
     كل كلياته — لا من الكلية المعروضة وحدها. أسماءٌ وأرقامٌ فقط. */
  const sectionId = Number(req.query.sectionId || 0);
  let participants: Array<{ AdInstructorId: number; AdInstructorName: string }> | undefined;
  if (roleDefinition(req.user?.Role).id === "departmentHead" && !sectionId) { res.status(403).json({ error: "حدد قسمك" }); return; }
  if (sectionId) {
    const scoped = await meetingDepartmentPeople(req, sectionId, termId);
    if (!scoped) { res.status(403).json({ error: "خارج نطاقك" }); return; }
    participants = scoped;
  }
  const { excluded } = await meetingExcludedIds(termId);
  res.json({ excludedInstructorIds: excluded, participants });
});

app.post("/api/schedules/meeting-slots", requireMeetingAccess, async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body || {};
  const termId = Number(body.termId || 0);
  const duration = Math.max(30, Math.min(180, Number(body.durationMinutes || 60)));
  const ids = Array.from(new Set((Array.isArray(body.instructorIds) ? body.instructorIds : []).map((value: unknown) => Number(value)).filter((value: number) => value > 0))) as number[];
  if (!termId) { res.status(400).json({ error: "حدد الفصل الدراسي" }); return; }
  if (ids.length < 2) { res.status(400).json({ error: "اختر أستاذين على الأقل" }); return; }
  if (roleDefinition(req.user?.Role).id === "departmentHead") {
    const sectionId = Number(body.sectionId || 0);
    const scoped = sectionId ? await meetingDepartmentPeople(req, sectionId, termId) : null;
    if (!scoped) { res.status(403).json({ error: "القسم خارج نطاقك" }); return; }
    const allowed = new Set(scoped.map(person => person.AdInstructorId));
    if (ids.some(id => !allowed.has(id))) { res.status(403).json({ error: "أستاذ خارج نطاق القسم" }); return; }
  }

  /* Busy time is the person's WHOLE term — every college, every department.
     A professor who teaches in two colleges is not free on Monday at 10:00
     because the coordinator happens to be looking at only one of them. The
     read is term-wide on purpose (no college/section filter), and what leaves
     the server is busy/free per chosen name only: no course, no room, no
     college. */
  const [termRows, { instructors, excluded }] = await Promise.all([
    Repository.getSchedulesByScope({ termId }),
    meetingExcludedIds(termId),
  ]);
  /* The server is the authority on who counts: «هيئة تدريسية» and visiting
     instructors are dropped here whatever the client sent. */
  const drop = new Set(excluded);
  const participantIds = ids.filter(id => !drop.has(id));
  if (participantIds.length < 2) { res.status(400).json({ error: "اختر أستاذين على الأقل من غير المنتدبين" }); return; }
  const nameById = new Map(instructors.map(person => [Number(person.AdInstructorId), person.AdInstructorName]));
  const answer = computeMeetingSlots({ rows: termRows, ids: participantIds, nameById, duration });
  res.json({ ...answer, busyScope: "allColleges" });
});
}
