/**
 * ── الجدول: القراءة والكتابة والنسخ والمسح ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { Response } from "express";
import { Repository, withSerialLock, ScopeChangedError } from "../../db/repository";
import { byArabic } from "../../utils/sorting";
import { timeToMinutes } from "../../utils/scheduleIntelligence";
import { currentTermId, planningTermCandidates } from "../../utils/termSequence";
import { WIPE_CONFIRM_TOKEN, WIPE_MAX_ROWS, WIPE_RESTORE_TOKEN, WIPE_VERSION_LABEL, wipeDecision } from "../../utils/scheduleWipePolicy";
import type { FSchedule } from "../../types";
import { coerceScopeValues } from "../../utils/scopeContext";
import { enrichCompanionRoomTypes } from "../../utils/companionRoomDisplay";
import { coverConflict } from "../../utils/coverAvailability";
import type { Finality } from "../../utils/finality";
import { AR, countOf, nounFor, oblique } from "../../utils/arabicCount";
import { formatScheduleTimeRange } from "../../utils/scheduleTime";
import { buildingIdentityKey, resolveBuilding, resolveRoom } from "../../utils/locationRegistry";
import { noteScheduleMutation, scheduleLockRefusal, wholesaleRefusal } from "../core/approvals";
import { type AuthenticatedRequest, isPowerUser, requireAnyPermission, requireAuth, requirePermission, requirePowerAdmin } from "../core/auth";
import { canonicalizeHistoricalLocationForRuntime, readLocationRegistry } from "../core/locations";
import { sortTermsNewestServer } from "../core/ordering";
import { readSchedulesForRequest, splitArchivedCourseRows } from "../core/scheduleReads";
import { SCHEDULE_DAY_KEYS, schedulePayloadIssues, weekExceptionDayKey } from "../core/scheduleRules";
import { applyProposalCore, createScheduleHandler, deleteScheduleHandler, updateScheduleHandler } from "../core/scheduleWrites";
import { filterByScope, isScopeAllowed } from "../core/scope";
import { safeDraftRows, validateSmartRows } from "../core/smartImport";
import { captureScopeVersion, confirmTokens, recordVersionAfter } from "../core/versions";
import { readLiveVisitingRoster, readVisitingStatus } from "../core/visiting";
import { instructorCircleFor } from "./instructorsRoutes";

/* ── استثناءات الأسبوع ────────────────────────────────────────────────────────
   Dated facts OVER an appointment: cancelled THIS date, covered THIS date.
   They never touch the FSchedule row, its rev, its conflicts or its history —
   which is what makes them safe to record and safe to delete. The calendar
   subscriptions read them, so a phone follows reality without anyone sending
   anything. */

const WEEK_EXCEPTION_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function readScheduleForException(req: AuthenticatedRequest, res: Response): Promise<FSchedule | null> {
  const id = Number(req.params.id || 0);
  const row = await Repository.getScheduleById(id);
  if (!row) { res.status(404).json({ error: "الموعد غير موجود" }); return null; }
  if (!isScopeAllowed(req, row.AdCollegeId, row.AdSectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return null; }
  return row;
}

/* ── مسحُ جدول القسم كاملاً، وإرجاعُه ──────────────────────────────────────
 *
 * القرار من `wipeDecision` وحدها (الأدمن ورئيس لجنة الجدول، الفصل الذي يُعَدّ،
 * والموقَّع للأدمن وحده). والمسحُ صفوفُ المواعيد لهذا القسم في هذا الفصل فقط،
 * بعد نسخةٍ احتياطيةٍ كاملة، ولا يمرّ إلا بتأكيدٍ صريح وعددٍ يطابق ما رآه صاحبه
 * واسمِ القسم مكتوباً بيده. */
async function wipeScopeState(req: AuthenticatedRequest, collegeId: number, sectionId: number, termId: number) {
  const [terms, approval, section, rows, versions] = await Promise.all([
    Repository.getTerms(),
    Repository.getScheduleApproval(collegeId, sectionId, termId),
    Repository.getSectionById(sectionId),
    Repository.getSchedulesByScope({ collegeId, sectionId, termId }),
    Repository.getScheduleVersions(collegeId, sectionId, termId, 80),
  ]);
  const term = (terms as any[]).find(row => Number(row.AdTermId) === termId);
  const decision = wipeDecision({
    isAdmin: isPowerUser(req),
    role: req.user?.Role,
    termId,
    currentTermId: currentTermId(terms as any),
    planningTermIds: planningTermCandidates(terms as any),
    termClosed: term?.AdTermClosed === true,
    approvalStatus: approval?.status,
    signatureCount: approval?.signatures?.length || 0,
  });
  const lastWipe = (versions as any[]).filter(version => version.label === WIPE_VERSION_LABEL)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0];
  return {
    decision, rows, section, term,
    sectionName: String(section?.AdSectionName || ""),
    termName: String(term?.AdTermName || ""),
    lastWipe: lastWipe ? { id: String(lastWipe.id), at: String(lastWipe.createdAt || ""), by: String(lastWipe.userName || ""), count: Number(lastWipe.rowCount ?? lastWipe.rows?.length ?? 0) } : null,
    lastWipeVersion: lastWipe,
  };
}
const wipeScopeOf = (source: any) => ({ collegeId: Number(source?.collegeId || 0), sectionId: Number(source?.sectionId || 0), termId: Number(source?.termId || 0) });

export function registerSchedulesRoutes(app: Express): void {

/**
 * The whole workspace in one request.
 *
 * Opening the schedule used to be a conversation: colleges, then sections, then
 * terms, then the rows, then the department's instructors and courses and its
 * visiting roster — six requests in three waits, and on the campus connection
 * every wait is the slow part. The account already names its department, so the
 * server can resolve the scope itself and answer with everything that scope
 * needs in a single round trip. The administrator gets the same single answer
 * for whichever scope they ask about; everyone else is answered only from the
 * sections that are theirs.
 */
app.get("/api/schedules/workspace", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const requestedCollege = Number(req.query.collegeId || 0);
  const requestedSection = Number(req.query.sectionId || 0);
  const requestedTerm = Number(req.query.termId || 0);
  const resolveDefaults = String(req.query.resolve || "") === "1";

  const [allColleges, allSections, terms] = await Promise.all([
    Repository.getColleges(), Repository.getSections(), Repository.getTerms(),
  ]);
  const colleges = req.user.IsAdminUser
    ? allColleges
    : allColleges.filter(college => (req.scopes || []).some(scope => Number(scope.AdCollegeId) === college.AdCollegeId));
  const sections = filterByScope(req, allSections);
  const termId = requestedTerm && terms.some(term => Number(term.AdTermId) === requestedTerm)
    ? requestedTerm
    : Number(sortTermsNewestServer(terms)[0]?.AdTermId || 0);

  let collegeId = requestedCollege, sectionId = requestedSection;
  if (!req.user.IsAdminUser) {
    // Whatever was asked for, the answer stays inside the account's own sections.
    const coerced = coerceScopeValues(req.scopes || [], collegeId, sectionId, false);
    collegeId = coerced.collegeId; sectionId = coerced.sectionId;
  } else {
    if (sectionId && !sections.some(section => section.AdSectionId === sectionId && (!collegeId || section.AdCollegeId === collegeId))) sectionId = 0;
    if (sectionId && !collegeId) collegeId = Number(sections.find(section => section.AdSectionId === sectionId)?.AdCollegeId || 0);
    if (collegeId && !colleges.some(college => college.AdCollegeId === collegeId)) { collegeId = 0; sectionId = 0; }
    if (resolveDefaults) {
      // First open: land on a real department instead of an empty "الكل".
      if (!collegeId) collegeId = Number(sections[0]?.AdCollegeId || colleges[0]?.AdCollegeId || 0);
      if (!sectionId) sectionId = Number(sections.find(section => section.AdCollegeId === collegeId)?.AdSectionId || 0);
    }
  }

  const [rows, scopedInstructors, historicalDepartmentInstructors, courses, visitingRoster] = await Promise.all([
    readSchedulesForRequest(req, collegeId, sectionId, termId),
    sectionId
      ? Repository.getInstructorsByScope(sectionId, termId)
      : (collegeId ? Repository.getInstructorsByScheduleScope({ collegeId, termId }) : Promise.resolve([])),
    sectionId ? Repository.getInstructorsByScope(sectionId, 0) : Promise.resolve([]),
    sectionId ? Repository.getOperationalCoursesBySection(sectionId) : Promise.resolve([]),
    readLiveVisitingRoster(collegeId, sectionId, termId),
  ]);
  const visitingInstructorIds = visitingRoster.instructorIds;
  const visitingStatusIds = (await readVisitingStatus(collegeId, sectionId, termId)).instructorIds;
  const visitingPeople = visitingRoster.instructors;
  const instructors = [...new Map([...historicalDepartmentInstructors, ...scopedInstructors, ...visitingPeople].map(person => [Number(person.AdInstructorId), person])).values()]
    .sort((a,b)=>byArabic(a.AdInstructorName,b.AdInstructorName));

  res.json({
    context: { collegeId, sectionId, termId },
    colleges, sections, terms,
    rows, instructors, courses,
    visitingInstructorIds,
    visitingStatusIds,
  });
});

app.get("/api/schedules", requireAnyPermission([7, 8, 9, 10, 14, 16, 17]), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0);
  let termId=Number(req.query.termId||0);
  // Operational screens default to the newest term. Historical reads are still
  // available by sending termId explicitly, but a blank filter can no longer scan
  // the university's entire ten-year schedule collection.
  if(!termId){const terms=await Repository.getTerms();termId=Number(sortTermsNewestServer(terms)[0]?.AdTermId||0);}
  const finalityOut: { finality?: Record<string, Finality> } = {};
  let list = await readSchedulesForRequest(req, collegeId, sectionId, termId, finalityOut);
  /* صفةُ كل قسمٍ لمن يرى النهائيَّ وحده: معتمدٌ أم منفَّذٌ قبل دورة الاعتماد.
     في ترويسةٍ لا في الجسم، فلا يتغيّر شكلُ المصفوفة لأيِّ شاشةٍ تقرؤها. */
  if (finalityOut.finality) res.setHeader("X-Schedule-Finality", JSON.stringify(finalityOut.finality));

  if (req.query.instructorId) {
    list = list.filter(s => s.AdInstructorId === parseInt(req.query.instructorId as string));
  }
  if (req.query.building || req.query.hall) {
    const registry=await readLocationRegistry();
    const buildingToken=String(req.query.building||"");
    const buildingMatch=buildingToken
      ? registry.buildings.find(item=>item.id===buildingToken) || resolveBuilding(registry,buildingToken,{collegeId,sectionId}).value
      : undefined;
    const hallToken=String(req.query.hall||"");
    const roomMatch=hallToken
      ? registry.rooms.find(item=>item.id===hallToken) || (buildingMatch ? resolveRoom(registry,hallToken,buildingMatch.id,{collegeId,sectionId}).value : undefined)
      : undefined;
    if(buildingToken&&!buildingMatch){list=[];}
    else if(buildingMatch){list=list.filter(row=>canonicalizeHistoricalLocationForRuntime(row,registry).buildingId===buildingMatch.id);}
    if(hallToken&&!roomMatch){list=[];}
    else if(roomMatch){list=list.filter(row=>canonicalizeHistoricalLocationForRuntime(row,registry).roomId===roomMatch.id);}
  }
  const requestedStartTime = req.query.startTime as string | undefined;
  const requestedEndTime = req.query.endTime as string | undefined;
  if (requestedStartTime && requestedEndTime) {
    // Any shared minute is a match, including a lecture wholly inside the
    // window; an appointment that merely ends as the window opens is not.
    // Same rule as scheduleOverlap, so search and conflict-detection agree.
    list = list.filter(s => s.fstarttime < requestedEndTime && s.fendtime > requestedStartTime);
  }
  // Exact legacy MainReport day semantics: selected weekdays are OR-ed together.
  const requestedDays = [
    req.query.sun === "true" && "fsunday",
    req.query.mon === "true" && "fmonday",
    req.query.tue === "true" && "ftuesday",
    req.query.wed === "true" && "fwednesday",
    req.query.thr === "true" && "fthursday"
  ].filter(Boolean) as ("fsunday"|"fmonday"|"ftuesday"|"fwednesday"|"fthursday")[];
  if (requestedDays.length) list = list.filter(s => requestedDays.some(day => Boolean(s[day])));

  // Use only actual bookings and their registered room types, not the catalog requirement.
  res.json(list.some(row => Boolean(row.companionRoomId))
    ? enrichCompanionRoomTypes(list, (await readLocationRegistry()).rooms)
    : list);
});

app.get("/api/schedules/:id/exceptions", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const row = await readScheduleForException(req, res);
  if (!row) return;
  const list = await Repository.getScheduleWeekExceptions(Number(row.AdTermId), Number(row.id));
  res.json({ exceptions: list });
});

app.post("/api/schedules/:id/exceptions", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const row = await readScheduleForException(req, res);
  if (!row) return;
  /* واستثناءُ الأسبوع يُحرس بحكم الفصل المنتهي، لا بقفل التسجيل (R8): إلغاءُ
     محاضرةِ الغد أو تغطيتُها لا ينتظر قرار التسجيل في الجدول الفصلي. */
  const exceptionLock = await scheduleLockRefusal(req, Number(row.AdCollegeId), Number(row.AdSectionId), Number(row.AdTermId), { registrarLock: false });
  if (exceptionLock) { res.status(409).json({ error: exceptionLock, code: "schedule-locked" }); return; }
  const body = req.body || {};
  const date = String(body.date || "").trim();
  const kind = body.kind === "cover" ? "cover" : body.kind === "cancel" ? "cancel" : null;
  if (!WEEK_EXCEPTION_DATE.test(date)) { res.status(400).json({ error: "حدد التاريخ بصيغة YYYY-MM-DD" }); return; }
  if (!kind) { res.status(400).json({ error: "نوع الاستثناء إما إلغاء أو تغطية" }); return; }
  const dayKey = weekExceptionDayKey(date);
  if (!dayKey || !(row as any)[dayKey]) {
    res.status(400).json({ error: "هذا الموعد لا يُعقد في اليوم المحدد أصلاً" });
    return;
  }
  const existing = await Repository.getScheduleWeekExceptions(Number(row.AdTermId), Number(row.id));
  if (existing.some(item => item.date === date)) {
    res.status(409).json({ error: "يوجد استثناء مسجل لهذا اليوم بالفعل — احذفه أولاً إن أردت تغييره" });
    return;
  }
  let coverInstructorId: number | undefined;
  let coverInstructorName: string | undefined;
  if (kind === "cover") {
    coverInstructorId = Number(body.coverInstructorId || 0) || undefined;
    if (!coverInstructorId) { res.status(400).json({ error: "حدد الأستاذ الذي يغطي المحاضرة" }); return; }
    if (coverInstructorId === Number(row.AdInstructorId)) { res.status(400).json({ error: "التغطية تكون بأستاذ آخر غير أستاذ الشعبة" }); return; }
    const person = (await Repository.getInstructors()).find(item => item.AdInstructorId === coverInstructorId);
    if (!person) { res.status(404).json({ error: "الأستاذ البديل غير موجود" }); return; }
    /* لا تغطيتان في الساعة نفسها، ولا تغطيةٌ فوق محاضرته: القاعدةُ نفسها التي
       يرتّب بها «بديل اليوم» مرشّحيه. */
    const [coverTermRows, coverTermExceptions] = await Promise.all([
      Repository.getSchedulesByScope({ termId: Number(row.AdTermId) }),
      Repository.getScheduleWeekExceptions(Number(row.AdTermId)),
    ]);
    const busy = coverConflict({
      instructorId: coverInstructorId, date, dayKey, start: row.fstarttime, end: row.fendtime,
      termRows: coverTermRows as any, exceptions: coverTermExceptions, coveringScheduleId: Number(row.id),
    });
    if (busy) {
      res.status(409).json({
        error: busy.kind === "cover"
          ? `${person.AdInstructorName || "هذا الأستاذ"} مكلَّفٌ بتغطيةٍ أخرى في الساعة نفسها من هذا اليوم.`
          : `${person.AdInstructorName || "هذا الأستاذ"} لديه محاضرةٌ في الساعة نفسها من هذا اليوم.`,
        code: busy.kind === "cover" ? "cover-double-booked" : "cover-busy",
      });
      return;
    }
    coverInstructorName = person.AdInstructorName;
  }
  const created = await Repository.createScheduleWeekException({
    scheduleId: Number(row.id),
    AdCollegeId: Number(row.AdCollegeId),
    AdSectionId: Number(row.AdSectionId),
    AdTermId: Number(row.AdTermId),
    date, kind,
    coverInstructorId, coverInstructorName,
    note: String(body.note || "").slice(0, 240) || undefined,
    SystemUserId: Number(req.user!.SystemUserId),
    userName: String(req.user!.Name || ""),
  });
  res.status(201).json(created);
});

app.delete("/api/schedules/:id/exceptions/:exceptionId", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const row = await readScheduleForException(req, res);
  if (!row) return;
  const exceptionLock = await scheduleLockRefusal(req, Number(row.AdCollegeId), Number(row.AdSectionId), Number(row.AdTermId), { registrarLock: false });
  if (exceptionLock) { res.status(409).json({ error: exceptionLock, code: "schedule-locked" }); return; }
  const entry = await Repository.getScheduleWeekExceptionById(String(req.params.exceptionId || ""));
  if (!entry || Number(entry.scheduleId) !== Number(row.id)) { res.status(404).json({ error: "الاستثناء غير موجود" }); return; }
  await Repository.deleteScheduleWeekException(entry.id);
  res.json({ ok: true });
});

/* ── بديل اليوم ───────────────────────────────────────────────────────────────
   An instructor apologises for TODAY. Term-level emergency plans exist for a
   lost teacher; this answers the smaller, daily question: who can cover this
   one lecture on this one date? Free at that hour, has taught this very course
   before, already on campus that day. The answer is a ranked list and a
   pre-written WhatsApp opener — the system itself sends nothing. */

app.get("/api/schedules/:id/substitutes", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const row = await readScheduleForException(req, res);
  if (!row) return;
  const date = String(req.query.date || "").trim();
  if (!WEEK_EXCEPTION_DATE.test(date)) { res.status(400).json({ error: "حدد التاريخ بصيغة YYYY-MM-DD" }); return; }
  const dayKey = weekExceptionDayKey(date);
  if (!dayKey || !(row as any)[dayKey]) { res.status(400).json({ error: "هذا الموعد لا يُعقد في اليوم المحدد" }); return; }

  const [instructors, termRows, collegeHistory, termExceptions] = await Promise.all([
    Repository.getInstructors(),
    Repository.getSchedulesByScope({ termId: Number(row.AdTermId) }),
    Repository.getSchedulesByScope({ collegeId: Number(row.AdCollegeId) }),
    Repository.getScheduleWeekExceptions(Number(row.AdTermId)),
  ]);
  /* الحريةُ في تلك الساعة من ذلك التاريخ: القاعدةُ نفسها التي يُحرس بها التسجيل. */
  const busyAtSlot = (instructorId: number) => Boolean(coverConflict({
    instructorId, date, dayKey, start: row.fstarttime, end: row.fendtime,
    termRows: termRows as any, exceptions: termExceptions, coveringScheduleId: Number(row.id),
  }));

  const rowsByInstructor = new Map<number, FSchedule[]>();
  for (const item of termRows) {
    const key = Number(item.AdInstructorId);
    if (!rowsByInstructor.has(key)) rowsByInstructor.set(key, []);
    rowsByInstructor.get(key)!.push(item);
  }
  const taughtTermsByInstructor = new Map<number, Set<number>>();
  for (const item of collegeHistory) {
    if (Number(item.AdCourseId) !== Number(row.AdCourseId)) continue;
    const key = Number(item.AdInstructorId);
    if (!taughtTermsByInstructor.has(key)) taughtTermsByInstructor.set(key, new Set());
    taughtTermsByInstructor.get(key)!.add(Number(item.AdTermId));
  }

  const candidates = instructors
    .filter(person => person.AdInstructorId !== Number(row.AdInstructorId))
    .filter(person => !person.AdInstructorStatus)
    .map(person => {
      const mine = rowsByInstructor.get(person.AdInstructorId) || [];
      if (busyAtSlot(person.AdInstructorId)) return null;
      const taughtTerms = taughtTermsByInstructor.get(person.AdInstructorId)?.size || 0;
      const inSection = mine.some(item =>
        Number(item.AdCollegeId) === Number(row.AdCollegeId) && Number(item.AdSectionId) === Number(row.AdSectionId));
      // Only people teaching somewhere this term — or with real history on this
      // course — are candidates: the full university register is not a rolodex.
      if (!mine.length && !taughtTerms) return null;
      const sameDayRows = mine.filter(item => Boolean((item as any)[dayKey]));
      const sameBuildingKey=buildingIdentityKey(row);
      const sameBuilding = Boolean(sameBuildingKey)&&sameDayRows.some(item => buildingIdentityKey(item)===sameBuildingKey);
      const loadMinutes = mine.reduce((sum, item) => {
        const perMeeting = Math.max(0, timeToMinutes(item.fendtime) - timeToMinutes(item.fstarttime));
        return sum + perMeeting * SCHEDULE_DAY_KEYS.filter(key => Boolean((item as any)[key])).length;
      }, 0);
      const reasons: string[] = [];
      if (taughtTerms) reasons.push(`درّس هذا المقرر في ${countOf(taughtTerms, oblique(AR.term))}`);
      if (inSection) reasons.push("من أساتذة القسم هذا الفصل");
      if (sameBuilding) reasons.push("موجود في نفس المبنى ذلك اليوم");
      else if (sameDayRows.length) reasons.push("لديه محاضرات في نفس اليوم");
      if (!reasons.length) reasons.push("متفرغ في هذا الوقت");
      const score =
        (taughtTerms ? 50 + Math.min(12, taughtTerms * 2) : 0) +
        (inSection ? 20 : 0) +
        (sameBuilding ? 10 : sameDayRows.length ? 6 : 0) +
        Math.max(0, 10 - Math.round(loadMinutes / 60));
      return {
        id: person.AdInstructorId,
        name: person.AdInstructorName,
        mobile: person.AdInstructorMobile || "",
        score, taughtTerms, inSection, sameDay: sameDayRows.length > 0, sameBuilding,
        reasons: reasons.slice(0, 3),
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.score - a.score || byArabic(a.name,b.name))
    .slice(0, 12);
  /* الجوّالُ بالقاعدة نفسها التي يُقرأ بها دليلُ الأساتذة (instructorCircleFor):
     من في حلقة أقسام القارئ يصل رقمُه فيُبنى له رابطُ واتساب، ومن سواه يصل بلا
     رقم ويُقال للواجهة «تواصل عبر قسمه». الإدارةُ وصاحبُ شاشة الأساتذة (٣) يرون الكل. */
  const circle = await instructorCircleFor(req);
  for (const candidate of candidates as any[]) {
    if (!circle || circle.has(Number(candidate.id))) continue;
    candidate.mobile = "";
    candidate.contactViaDepartment = true;
  }

  const exceptions = await Repository.getScheduleWeekExceptions(Number(row.AdTermId), Number(row.id));
  res.json({
    date, dayKey,
    lecture: {
      id: row.id, course: row.AdCourseName, section: row.SCode,
      start: row.fstarttime, end: row.fendtime,
      room: [row.AdRoomCode, row.AdRoomHall].filter(Boolean).join(" / "),
      instructorId: row.AdInstructorId,
    },
    candidates,
    exceptions,
  });
});
app.post("/api/schedules", requirePermission(7), createScheduleHandler);
app.put("/api/schedules/:id", requirePermission(7), updateScheduleHandler);
app.delete("/api/schedules/:id", requirePermission(7), deleteScheduleHandler);

// --- COPY SCHEDULES API ---

app.get("/api/schedules/copy-preview", requireAuth, requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  if (req.user.SystemUserId !== 1) { res.status(403).json({ error: "ليس لديك صلاحية لنسخ الجداول الدراسية. هذه العملية مقتصرة على المدير الرئيسي" }); return; }
  const collegeId=Number(req.query.collegeId||0), sectionId=Number(req.query.sectionId||0), fromTermId=Number(req.query.fromTermId||0), toTermId=Number(req.query.toTermId||0);
  if(!collegeId||!sectionId||!fromTermId||!toTermId){res.status(400).json({error:"جميع الحقول مطلوبة"});return;}
  if(!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [source,target,courses,instructors]=await Promise.all([
    Repository.getSchedulesByScope({collegeId,sectionId,termId:fromTermId}),Repository.getSchedulesByScope({collegeId,sectionId,termId:toTermId}),Repository.getCourses(),Repository.getInstructors()
  ]);
  const {archived:archivedInSource}=await splitArchivedCourseRows(source,sectionId);
  const sourceTimeIssues=await Promise.all(source.map((row:any)=>schedulePayloadIssues(row)));
  const sourceIssues=[...new Set([...sourceTimeIssues.flat(),...(archivedInSource.length?[`يتضمن الفصل ${countOf(archivedInSource.length, AR.appointment)} لمقررات أصبحت مؤرشفة أكاديمياً ولن تُنسخ إلى فصل جديد.`]:[])])];
  const courseById=new Map(courses.map(item=>[item.AdCourseId,item])); const instructorById=new Map(instructors.map(item=>[item.AdInstructorId,item]));
  res.json({sourceCount:source.length,targetCount:target.length,sourceIssues,canCopy:source.length>0&&target.length===0&&!sourceIssues.length,preview:source.slice(0,12).map(row=>({id:row.id,courseCode:row.CourseCodeSnapshot||courseById.get(row.AdCourseId)?.CourseCode||"",courseName:row.CourseNameSnapshot||row.AdCourseName||courseById.get(row.AdCourseId)?.CourseName||"",sectionCode:row.SCode,instructorName:instructorById.get(row.AdInstructorId)?.AdInstructorName||"",time:formatScheduleTimeRange(row.fstarttime, row.fendtime),room:`${row.AdRoomCode}/${row.AdRoomHall}`}))});
});

app.post("/api/schedules/apply-proposal", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const outcome = await applyProposalCore(req, req.body || {});
  if (outcome.audit) res.locals.auditChanges = outcome.audit;
  res.locals.auditRowIds = ((outcome.json as any)?.applied || []).map((item: any) => Number(item?.row?.id)).filter(Number.isFinite);
  res.status(outcome.status).json(outcome.json);
});

app.post("/api/schedules/copy", requireAuth, requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { AdCollegeId, AdSectionId, fromTermId, toTermId } = req.body;

  if (!AdCollegeId || !AdSectionId || !fromTermId || !toTermId) {
    res.status(400).json({ error: "جميع الحقول مطلوبة" });
    return;
  }

  // Copy schedule has a custom legacy check: must be SystemUserId == 1
  if (req.user.SystemUserId !== 1) {
    res.status(403).json({ error: "ليس لديك صلاحية لنسخ الجداول الدراسية. هذه العملية مقتصرة على المدير الرئيسي" });
    return;
  }

  const collegeId = parseInt(AdCollegeId), sectionId = parseInt(AdSectionId), sourceTermId = parseInt(fromTermId), targetTermId = parseInt(toTermId);
  if (!isScopeAllowed(req, collegeId, sectionId)) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  const [section, sourceTerm, targetTerm] = await Promise.all([
    Repository.getSectionById(sectionId), Repository.getTermById(sourceTermId), Repository.getTermById(targetTermId)
  ]);
  if (!section || section.AdCollegeId !== collegeId) { res.status(400).json({ error: "القسم العلمي المختار لا يتبع الكلية المختارة" }); return; }
  if (!sourceTerm || !targetTerm) { res.status(400).json({ error: "الفصل الدراسي المختار غير صالح" }); return; }

  const sourceRows = await Repository.getSchedulesByScope({ collegeId, sectionId, termId: sourceTermId });
  const {archived:archivedRows}=await splitArchivedCourseRows(sourceRows,sectionId);
  if(archivedRows.length){res.status(409).json({error:`لا يمكن نسخ الفصل كما هو: ${countOf(archivedRows.length, AR.appointment)} ${nounFor(archivedRows.length, AR.linkedAdj)} بمقررات مؤرشفة أكاديمياً. أضف بدائلها الحالية يدوياً حتى يبقى الجدول الجديد صحيحاً.`,code:"archived-curriculum-courses"});return;}
  const copiedRows = safeDraftRows(sourceRows, collegeId, sectionId, targetTermId);
  const copyIssues = await validateSmartRows(copiedRows, collegeId, sectionId, { resolveHistorical: true, requireCompanion: true });
  if (copyIssues.length) {
    res.status(400).json({ error: "لا يمكن نسخ الجدول قبل معالجة بياناته", issues: copyIssues });
    return;
  }

  const targetRows = await Repository.getSchedulesByScope({ collegeId, sectionId, termId: targetTermId });
  if(targetRows.length){res.status(409).json({error:"يوجد جدول بالفعل في الفصل المستهدف"});return;}
  /* وقفلُ الإرسال قبله: الفصل المستهدف قد يكون بين يدي التسجيل الآن. */
  const copyLock = await scheduleLockRefusal(req,collegeId, sectionId, targetTermId);
  if (copyLock) { res.status(409).json({ error: copyLock, code: "schedule-locked" }); return; }
  const copyRefusal = await wholesaleRefusal(collegeId, sectionId, targetTermId, { kind: "copy-term" });
  if (copyRefusal) { res.status(409).json({ error: copyRefusal, code: "deadline-wholesale" }); return; }
  const undoVersion = await captureScopeVersion(req, collegeId, sectionId, targetTermId, "قبل نسخ الفصل الدراسي", "copy");
  const written = await Repository.replaceScheduleScope(collegeId, sectionId, targetTermId, copiedRows as FSchedule[]);
  await recordVersionAfter(undoVersion, written as any[]);
  await noteScheduleMutation(req, collegeId, sectionId, targetTermId, { kind: "add", rows: written as any[] });
  res.json({ success: true, count: written.length, message: "تم نسخ الفصل الدراسي بالقيم الرسمية للمباني والقاعات", undoVersion: undoVersion ? { id: undoVersion.id, label: undoVersion.label } : null });
});

app.get("/api/schedules/wipe-scope", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const { collegeId, sectionId, termId } = wipeScopeOf(req.query);
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "اختر الكلية والقسم والفصل." }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId) && !isPowerUser(req)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const state = await wipeScopeState(req, collegeId, sectionId, termId);
  res.setHeader("Cache-Control", "no-store");
  res.json({
    canWipe: state.decision.allowed, reason: state.decision.allowed ? "" : state.decision.reason,
    count: state.rows.length, sectionName: state.sectionName, termName: state.termName,
    lastWipe: state.lastWipe,
    canRestore: state.decision.allowed && Boolean(state.lastWipe) && state.rows.length === 0,
  });
});

app.post("/api/schedules/wipe-scope", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const { collegeId, sectionId, termId } = wipeScopeOf(req.body);
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "اختر الكلية والقسم والفصل." }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId) && !isPowerUser(req)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  if (!confirmTokens(req).has(WIPE_CONFIRM_TOKEN)) { res.status(409).json({ error: "مسح الجدول بالكامل يتطلب تأكيداً صريحاً." }); return; }
  await withSerialLock(`wipe:${collegeId}:${sectionId}:${termId}`, async () => {
    const state = await wipeScopeState(req, collegeId, sectionId, termId);
    if (!state.decision.allowed) { res.status(403).json({ error: state.decision.reason, code: "wipe-refused" }); return; }
    /* اسمُ القسم مكتوباً بيد صاحبه: البرهانُ أنه يمسح القسمَ الذي يقصده. */
    const typed = String(req.body?.confirmName || "").trim().replace(/\s+/g, " ");
    if (!state.sectionName || typed !== state.sectionName.trim().replace(/\s+/g, " ")) {
      res.status(409).json({ error: "اسم القسم المكتوب لا يطابق اسم القسم المفتوح.", code: "wipe-name" }); return;
    }
    /* والعددُ الذي رآه في التحذير: إن تغيّر الجدول بينهما يُعاد التأكيد. */
    if (Number(req.body?.expectedCount) !== state.rows.length) {
      res.status(409).json({ error: `تغيّر الجدول أثناء التأكيد: فيه الآن ${countOf(state.rows.length, AR.appointment)}. أعد المحاولة.`, code: "wipe-count", count: state.rows.length }); return;
    }
    if (!state.rows.length) { res.status(409).json({ error: "الجدول فارغ أصلاً.", code: "wipe-empty" }); return; }
    /* ما لا يُرجَع لا يُمسح: الإرجاعُ يمرّ بحدّ المسودة الآمن (450 صفاً). */
    if (state.rows.length > WIPE_MAX_ROWS) { res.status(409).json({ error: `الجدول أكبر من حدّ المسح الآمن (${countOf(WIPE_MAX_ROWS, AR.appointment)})، فلا يُمسح دفعةً واحدة.`, code: "wipe-too-large" }); return; }
    if (!isPowerUser(req)) {
      const lock = await scheduleLockRefusal(req, collegeId, sectionId, termId);
      if (lock) { res.status(409).json({ error: lock, code: "schedule-locked" }); return; }
      const late = await wholesaleRefusal(collegeId, sectionId, termId, { kind: "bulk-delete", deleting: state.rows.length, total: state.rows.length });
      if (late) { res.status(409).json({ error: late, code: "deadline-wholesale" }); return; }
    }
    const backup = await captureScopeVersion(req, collegeId, sectionId, termId, WIPE_VERSION_LABEL, "manual");
    if (!backup) { res.status(500).json({ error: "تعذّر حفظ النسخة الاحتياطية، فلم يُمسح شيء." }); return; }
    try {
      await Repository.replaceScheduleScope(collegeId, sectionId, termId, [], { expectCurrentCount: state.rows.length });
    } catch (error) {
      if (error instanceof ScopeChangedError) { res.status(409).json({ error: `تغيّر الجدول أثناء المسح: فيه الآن ${countOf(error.count, AR.appointment)}. لم يُمسح شيء، أعد المحاولة.`, code: "wipe-count", count: error.count }); return; }
      throw error;
    }
    await recordVersionAfter(backup, []);
    /* رقمُ جيل الجدول هو حدّ العرض الموحّد: كل طلبٍ سابق يبقى محفوظاً في
       الأرشيف، لكن الوارد وبطاقة الأستاذ لا يخلطان طلبات الجدول المحذوف بالجديد. */
    const requestGeneration = await Repository.advanceInstructorRequestGeneration(collegeId, sectionId, termId);
    /* طلباتُ الأستاذ تشير إلى صفوف الجدول الذي مُسح. نُبقيها كسجلّ محفوظ،
       ونغلق روابطها ونحرّر حجوزاتها حتى لا تعود رغبات التجارب مع الجدول الجديد. */
    const supersededRequests = await Repository.supersedeInstructorRequestsForScope(collegeId, sectionId, termId);
    await noteScheduleMutation(req, collegeId, sectionId, termId, { kind: "delete", rows: state.rows as any[] });
    res.locals.auditChanges = `مسح الجدول بالكامل: ${state.sectionName} · ${state.termName} · ${countOf(state.rows.length, AR.appointment)} · إغلاق ${countOf(supersededRequests, AR.round)} رغبات قديمة (نسخة احتياطية ${backup.id})`;
    res.json({ success: true, deleted: state.rows.length, backupId: backup.id, supersededRequests, scheduleGeneration: requestGeneration.generation });
  });
});

app.post("/api/schedules/wipe-scope/restore", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const { collegeId, sectionId, termId } = wipeScopeOf(req.body);
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "اختر الكلية والقسم والفصل." }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId) && !isPowerUser(req)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  if (!confirmTokens(req).has(WIPE_RESTORE_TOKEN)) { res.status(409).json({ error: "الإرجاع يتطلب تأكيداً صريحاً." }); return; }
  await withSerialLock(`wipe:${collegeId}:${sectionId}:${termId}`, async () => {
    const state = await wipeScopeState(req, collegeId, sectionId, termId);
    if (!state.decision.allowed) { res.status(403).json({ error: state.decision.reason, code: "wipe-refused" }); return; }
    /* القائمةُ تحمل وصف النسخ بلا صفوفها (Firestore): الصفوف من النسخة نفسها. */
    const version = state.lastWipeVersion ? await Repository.getScheduleVersionById(String(state.lastWipeVersion.id)) : undefined;
    if (!version) { res.status(404).json({ error: "لا يوجد مسحٌ سابق لهذا الجدول يُرجَع." }); return; }
    if (String(req.body?.versionId || "") !== String(version.id)) { res.status(409).json({ error: "تغيّرت نسخة الإرجاع. حدّث الشاشة وأعد المحاولة.", code: "wipe-version" }); return; }
    /* الإرجاعُ يكتب فوق الجدول كله: إن أُضيف بعد المسح شيءٌ لا يُمحى بصمت. */
    if (state.rows.length) { res.status(409).json({ error: `أُضيف إلى الجدول بعد المسح ${countOf(state.rows.length, AR.appointment)}. احذفها أولاً أو استعمل سجلّ النسخ.`, code: "wipe-not-empty" }); return; }
    if (!Array.isArray(version.rows) || !version.rows.length || version.rows.length !== Number(state.lastWipe?.count ?? version.rows.length)) {
      res.status(409).json({ error: "النسخة الاحتياطية لا تحمل صفوفها كاملة، فلم يُرجَع شيء.", code: "wipe-backup-incomplete" }); return;
    }
    const restored = safeDraftRows(version.rows, collegeId, sectionId, termId);
    const issues = await validateSmartRows(restored, collegeId, sectionId, { resolveHistorical: true });
    if (issues.length) { res.status(400).json({ error: "تعذّر الإرجاع: في النسخة بياناتٌ لا تمرّ من الفحص.", issues }); return; }
    const undo = await captureScopeVersion(req, collegeId, sectionId, termId, `قبل إرجاع: ${WIPE_VERSION_LABEL}`, "undo");
    let rows: FSchedule[];
    try {
      /* الفراغُ يُفحص من جديد داخل قفل الكتابة: ما أُضيف بعد قراءتنا لا يُمحى. */
      rows = await Repository.replaceScheduleScope(collegeId, sectionId, termId, restored as FSchedule[], { expectCurrentCount: 0 });
    } catch (error) {
      if (error instanceof ScopeChangedError) { res.status(409).json({ error: `أُضيف إلى الجدول ${countOf(error.count, AR.appointment)} أثناء الإرجاع، فلم يُرجَع شيء.`, code: "wipe-not-empty" }); return; }
      throw error;
    }
    await recordVersionAfter(undo, rows as any[]);
    await noteScheduleMutation(req, collegeId, sectionId, termId, { kind: "add", rows: rows as any[] });
    res.locals.auditChanges = `إرجاع الجدول بعد المسح: ${state.sectionName} · ${state.termName} · ${countOf(rows.length, AR.appointment)}`;
    res.json({ success: true, restored: rows.length });
  });
});
}
