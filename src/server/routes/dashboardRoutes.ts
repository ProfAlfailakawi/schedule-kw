/**
 * ── اللوحةُ والرحلةُ والبحث ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { Response } from "express";
import { Repository } from "../../db/repository";
import type { FSchedule } from "../../types";
import { DAY_FLAGS, DAY_LABELS, parseNaturalQuery } from "../../utils/naturalQuery";
import { expandScopeSections } from "../readScope";
import { AR, countOf } from "../../utils/arabicCount";
import { withVisitingSuffix } from "../../utils/visitingText";
import { formatScheduleTimeRange } from "../../utils/scheduleTime";
import { type AuthenticatedRequest, requireAnyPermission, requireAuth } from "../core/auth";
import { academicStartYear } from "../core/hallBarter";
import { sortArabicNamed, sortCoursesByName, sortTermsNewestServer, verifiedRoomKey } from "../core/ordering";
import { finalRowsOnly, readSchedulesForRequest, readsFinalSchedulesOnly, resolveHomeTerm, scopeSectionIdsFor } from "../core/scheduleReads";
import { upcomingHomeTerm } from "../../utils/homeTerm";
import { filterByScope, instructorsForReader, isScopeAllowed, legacyFDetail } from "../core/scope";
import { resolveSmartContext } from "../core/smartImport";
import { visitingChecker } from "../core/visiting";

async function readScopedTermRows(req: AuthenticatedRequest, termId: number): Promise<FSchedule[]> {
  if (req.user?.IsAdminUser) return Repository.getSchedulesByScope({ termId });
  const sections = await Repository.getSections();
  const allowed = (collegeId: number, sectionId: number) => isScopeAllowed(req, collegeId, sectionId);
  const own = expandScopeSections(sections, allowed);
  const byCollege = new Map<number, number[]>();
  for (const section of sections) {
    const collegeId = Number(section.AdCollegeId);
    if (!byCollege.has(collegeId)) byCollege.set(collegeId, []);
    byCollege.get(collegeId)!.push(Number(section.AdSectionId));
  }
  const reads: Promise<FSchedule[]>[] = [];
  for (const [collegeId, ids] of byCollege) {
    const mine = ids.filter(id => own.has(id));
    if (!mine.length) continue;
    if (mine.length === ids.length) reads.push(Repository.getSchedulesByScope({ collegeId, termId }));
    else mine.forEach(sectionId => reads.push(Repository.getSchedulesByScope({ sectionId, termId })));
  }
  const rows = filterByScope(req, (await Promise.all(reads)).flat());
  return readsFinalSchedulesOnly(req) ? finalRowsOnly(rows, termId) : rows;
}

export function registerDashboardRoutes(app: Express): void {

app.get("/api/dashboard", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  // Legacy Home/Index parity is intentionally preserved here, including the historical
  // Sunday/weekend day-name quirk and the difference between the displayed total and table rows.
  const terms = await Repository.getTerms();
  /* أقسامُ القارئ من الحَكَم الواحد: صفُّ «الكلية كلها» يُقرأ لأقسامها (N8)،
     والعميدان يُعطيان النهائيَّ وحده كما في كل شاشة. */
  const assignedSectionIds = await scopeSectionIdsFor(req);
  /* الفصلُ المعروض ليس «أحدث فصلٍ في القائمة»: اختيارُ القارئ الصريح، وإلا الجاري
     تشغيلياً، وإلا أحدثُ فصلٍ له فيه ما يُرى (src/utils/homeTerm.ts). فالفصلُ الذي
     يُعدّ للتوّ لا يفتح للعميد بيتاً من صفر؛ يُذكر في شارةٍ تفتحه. */
  const home = await resolveHomeTerm(req, terms, Number(req.query.termId || 0), assignedSectionIds);
  const latestTermId = home.termId;
  const latestTerm = terms.find(term => term.AdTermId === latestTermId);
  const [allCourses, latestTermSchedules, allInstructors, allSections, allColleges, scheduleCount] = await Promise.all([
    Repository.getCourses(), Repository.getSchedulesByScope({ termId: latestTermId }), Repository.getInstructors(), Repository.getSections(), Repository.getColleges(), Repository.countSchedules()
  ]);

  const latestScopedSchedulesRaw = latestTermSchedules.filter(row => assignedSectionIds.has(Number(row.AdSectionId)));
  const latestScopedSchedules = readsFinalSchedulesOnly(req) ? await finalRowsOnly(latestScopedSchedulesRaw, latestTermId) : latestScopedSchedulesRaw;
  const scopedCourses = allCourses.filter(course => assignedSectionIds.has(Number(course.AdSectionId)));

  // ASP.NET DayOfWeek returned 0 for Sunday, but the legacy view checked d == 7.
  // Therefore Sunday, Friday and Saturday retain Sunday's rows while dname stays blank.
  // `weekend` lets the screen say so out loud instead of labelling Sunday's
  // lectures with Friday's date, which is what the client's own clock did.
  const weekday = new Date().getDay();
  const weekend = weekday === 5 || weekday === 6;
  let dayKey: "fsunday" | "fmonday" | "ftuesday" | "fwednesday" | "fthursday" = "fsunday";
  let dayName = weekday === 0 ? "الأحد" : weekday === 5 ? "الجمعة" : weekday === 6 ? "السبت" : "";
  if (weekday === 1) { dayKey = "fmonday"; dayName = "الاثنين"; }
  if (weekday === 2) { dayKey = "ftuesday"; dayName = "الثلاثاء"; }
  if (weekday === 3) { dayKey = "fwednesday"; dayName = "الأربعاء"; }
  if (weekday === 4) { dayKey = "fthursday"; dayName = "الخميس"; }

  // Friday and Saturday are institutional holidays. Do not quietly substitute
  // Sunday's lectures into the dashboard; the holiday state must be literal.
  const daySchedules = weekend
    ? []
    : latestTermSchedules
        .filter(row => Boolean(row[dayKey]))
        .sort((a, b) => String(a.fstarttime).localeCompare(String(b.fstarttime)));

  /**
   * The administrator sees the university; everyone else sees their department.
   *
   * The legacy table filtered by AdCollegeUserAssign for everyone, including
   * IsAdminUser — and the main administrator normally holds no assignment rows
   * at all, so the day list came back empty. The result was a dashboard that
   * said "لا محاضرات اليوم" directly beside a tile counting thousands of them:
   * two numbers from the same page contradicting each other, and the one the
   * reader trusts is the one that is wrong. A coordinator's view is unchanged.
   */
  const finalIds = readsFinalSchedulesOnly(req) ? new Set(latestScopedSchedules.map(row => Number(row.id))) : null;
  const visibleTableRows = req.user.IsAdminUser
    ? daySchedules
    : daySchedules.filter(row => assignedSectionIds.has(Number(row.AdSectionId)) && (!finalIds || finalIds.has(Number(row.id))));
  const instructorIds = new Set(latestScopedSchedules.map(row => row.AdInstructorId));
  const coursesById = new Map(allCourses.map(course => [course.AdCourseId, course]));
  const instructorsById = new Map(allInstructors.map(instructor => [instructor.AdInstructorId, instructor]));
  const sectionsById = new Map(allSections.map(section => [section.AdSectionId, section]));
  const collegesById = new Map(allColleges.map(college => [college.AdCollegeId, college]));

  const metrics = req.user.IsAdminUser ? {
    courses: allCourses.length,
    schedules: scheduleCount,
    terms: terms.length,
    instructors: allInstructors.length
  } : {
    courses: scopedCourses.length,
    schedules: latestScopedSchedules.length,
    terms: terms.length,
    instructors: instructorIds.size
  };

  // Modern workspace analytics are additive: legacy dashboard fields above remain untouched.
  const linkedInstructorId = Number(req.user.AdInstructorId || 0);
  const personalRows = linkedInstructorId ? latestTermSchedules.filter(row => row.AdInstructorId === linkedInstructorId) : [];
  const workspaceRows = req.user.IsAdminUser ? latestTermSchedules : (linkedInstructorId ? personalRows : latestScopedSchedules);
  const dayDefs = [
    ["fsunday", "الأحد"], ["fmonday", "الاثنين"], ["ftuesday", "الثلاثاء"], ["fwednesday", "الأربعاء"], ["fthursday", "الخميس"]
  ] as const;
  const roomKey = (row: FSchedule) => verifiedRoomKey(row);
  const roomLabel = (row: FSchedule) => [String(row.AdRoomCode || "").trim(), String(row.AdRoomHall || "").trim()].filter(Boolean).join(" / ");
  const uniqueRooms = Array.from(new Set(workspaceRows.map(roomKey).filter(Boolean)));
  const minute = (value: string) => { const [h,m] = String(value || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  const slotRooms = new Map<string, Set<string>>();
  const hourLoad = new Map<string, number>();
  const roomLoad = new Map<string, number>();
  for (const row of workspaceRows) {
    const start = minute(row.fstarttime), end = minute(row.fendtime);
    const hour = String(row.fstarttime || "").slice(0,2) || "--";
    hourLoad.set(hour, (hourLoad.get(hour) || 0) + 1);
    const rKey = roomKey(row);
    if (rKey) roomLoad.set(rKey, (roomLoad.get(rKey) || 0) + 1);
    for (const [key] of dayDefs) if (row[key]) {
      for (let slot = Math.floor(start / 30); slot < Math.ceil(end / 30); slot++) {
        const bucket = `${key}:${slot}`;
        if (!rKey) continue;
        if (!slotRooms.has(bucket)) slotRooms.set(bucket, new Set());
        slotRooms.get(bucket)!.add(rKey);
      }
    }
  }
  const peakOccupiedRooms = Math.max(0, ...Array.from(slotRooms.values()).map(set => set.size));
  const roomOccupancyPeak = uniqueRooms.length ? Math.round((peakOccupiedRooms / uniqueRooms.length) * 100) : 0;
  const weekdayLoad = dayDefs.map(([key,label]) => ({ key, label, count: workspaceRows.filter(row => Boolean(row[key])).length }));
  const busiestHours = Array.from(hourLoad.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([hour,count])=>({ hour: `${hour}:00`, count }));
  const roomLabelById = new Map(workspaceRows.map(row => [roomKey(row), roomLabel(row)] as const).filter(([key]) => Boolean(key)));
  const busiestRooms = Array.from(roomLoad.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([roomId,count])=>({ room: roomLabelById.get(roomId) || roomId, roomId, count }));
  const personalToday = personalRows.filter(row => Boolean(row[dayKey])).sort((a,b)=>String(a.fstarttime).localeCompare(String(b.fstarttime)));

  /**
   * The same headline numbers, one term earlier.
   *
   * A count on its own says how big the term is; next to the term before it,
   * the same count says which way the department is moving. Only the figures
   * that are comparable are returned — appointments, halls and teaching staff
   * within the same scope — so the dashboard can show a direction without
   * inventing a trend for things that do not have one.
   */
  const scopeRows = (list: any[]) => req.user.IsAdminUser
    ? list
    : (linkedInstructorId
      ? list.filter(row => row.AdInstructorId === linkedInstructorId)
      : list.filter(row => assignedSectionIds.has(Number(row.AdSectionId))));

  // The last four terms, oldest first. A single comparison shows a jump; four
  // points show a direction, which is the thing a coordinator is deciding
  // against. The reads are cached, so this costs nothing after the first visit.
  /* بالترتيب الزمني لا بالمعرّف: فصلٌ أرشيفيٌّ أُدخل بعد إنشاء الجاري يحمل معرّفاً
     أكبر، فكان يسقط من الخط. والعميدان يُعدّ لهما النهائيُّ وحده هنا أيضاً. */
  const chronological = sortTermsNewestServer(terms).map(term => Number(term.AdTermId) || 0).filter(Boolean);
  const shownAt = chronological.indexOf(latestTermId);
  const recentTermIds = (shownAt >= 0 ? chronological.slice(shownAt, shownAt + 4) : []).reverse();
  const history = await Promise.all(recentTermIds.map(async termId => {
    const termRows = termId === latestTermId
      ? latestTermSchedules
      : await Repository.getSchedulesByScope({ termId });
    const scopedRaw = scopeRows(termRows);
    const scoped = readsFinalSchedulesOnly(req) && !linkedInstructorId ? await finalRowsOnly(scopedRaw, termId) : scopedRaw;
    return {
      termId,
      termName: terms.find(term => Number(term.AdTermId) === termId)?.AdTermName || "",
      schedules: scoped.length,
      rooms: new Set(scoped.map(roomKey).filter(Boolean)).size,
      instructors: new Set(scoped.map(row => row.AdInstructorId)).size
    };
  }));
  const previous = history.length > 1 ? history[history.length - 2] : null;
  const termName = (id: number) => terms.find(term => Number(term.AdTermId) === Number(id))?.AdTermName || "";
  const upcoming = upcomingHomeTerm(terms, latestTermId);
  const visibleCount = req.user.IsAdminUser ? latestTermSchedules.length : latestScopedSchedules.length + personalRows.length;

  res.json({
    previous,
    history,
    metrics,
    latestTermId,
    latestTermName: latestTerm?.AdTermName || "",
    /* أيُّ فصلٍ هذا ولماذا: الشارةُ تفتح القادمَ قيد الإعداد، أو تعيد إلى الافتراض؛
       و`empty` يمنع «الجدول سليم» عن فصلٍ لا صفَّ فيه يُرى. */
    home: {
      termId: latestTermId,
      defaultTermId: home.defaultTermId,
      defaultTermName: termName(home.defaultTermId),
      currentTermId: home.currentTermId,
      explicit: home.explicit,
      fallback: home.fallback,
      empty: visibleCount === 0,
      awaitingApproval: readsFinalSchedulesOnly(req) && visibleCount === 0 && latestScopedSchedulesRaw.length > 0,
      upcoming: upcoming ? { termId: Number(upcoming.AdTermId), termName: upcoming.AdTermName || "" } : null,
    },
    dayName,
    // Friday and Saturday are not taught. The list below is Sunday's, by legacy
    // design — so the screen is told plainly, instead of stamping today's date
    // on another day's lectures.
    weekend,
    // Legacy CountSchedule: admin = all rows for the selected day; non-admin = all scoped rows in latest term.
    dashboardTotal: req.user.IsAdminUser ? daySchedules.length : latestScopedSchedules.length,
    today: visibleTableRows.map(row => ({
      id: row.id,
      instructorName: instructorsById.get(row.AdInstructorId)?.AdInstructorName || "",
      courseCode: coursesById.get(row.AdCourseId)?.CourseCode || "",
      courseName: coursesById.get(row.AdCourseId)?.CourseName || row.AdCourseName || "",
      startTime: row.fstarttime,
      endTime: row.fendtime,
      roomCode: row.AdRoomCode,
      roomHall: row.AdRoomHall
    })),
    workspace: {
      mode: req.user.IsAdminUser ? "admin" : (linkedInstructorId ? "personal" : "scope"),
      activeSchedules: workspaceRows.length,
      uniqueRooms: uniqueRooms.length,
      uniqueInstructors: new Set(workspaceRows.map(row => row.AdInstructorId)).size,
      roomOccupancyPeak,
      peakOccupiedRooms,
      weekdayLoad,
      busiestHours,
      busiestRooms,
      scopeCount: (req.scopes || []).length,
      linkedInstructorName: linkedInstructorId ? (instructorsById.get(linkedInstructorId)?.AdInstructorName || "") : "",
      personalToday: personalToday.map(row => ({
        id: row.id,
        courseCode: coursesById.get(row.AdCourseId)?.CourseCode || "",
        courseName: coursesById.get(row.AdCourseId)?.CourseName || row.AdCourseName || "",
        startTime: row.fstarttime,
        endTime: row.fendtime,
        days: legacyFDetail(row),
        roomCode: row.AdRoomCode,
        roomHall: row.AdRoomHall,
        sectionName: sectionsById.get(row.AdSectionId)?.AdSectionName || "",
        collegeName: collegesById.get(row.AdCollegeId)?.AdCollegeName || ""
      }))
    }
  });
});

/**
 * ── What SCHEDULE has become ──────────────────────────────────────────────
 *
 * Every number here is counted from the database at the moment it is asked for.
 * None of them is written down anywhere: add a term and the term count is one
 * higher on the next request, without a line of code changing. That property is
 * the whole point of the screen it feeds — a system claiming a decade of memory
 * cannot have its memory typed in by hand.
 *
 * The counts reuse exactly what /api/dashboard already reads, so the two can
 * never disagree about how many terms exist or which one is current. The
 * lifetime row count comes from `countSchedules()`, which is a server-side
 * count — the aggregate never pulls fifteen thousand rows into memory to
 * measure them.
 *
 * The reading is honest about scope: an administrator is shown the institution,
 * and a department coordinator is shown the same shape narrowed to what they
 * are allowed to see, with `scoped: true` saying which of the two it is.
 */
app.get("/api/journey", async (req: AuthenticatedRequest, res: Response) => {
  const terms = await Repository.getTerms();
  const currentTermId = Number(sortTermsNewestServer(terms)[0]?.AdTermId || 0);
  const currentTerm = terms.find(term => Number(term.AdTermId) === currentTermId) || null;
  const [courses, instructors, sections, colleges, lifetimeRows, termRows] = await Promise.all([
    Repository.getCourses(),
    Repository.getInstructors(),
    Repository.getSections(),
    Repository.getColleges(),
    Repository.countSchedules(),
    Repository.getSchedulesByScope({ termId: currentTermId }),
  ]);
  /* Journey is the one intentionally public-facing institutional reading in
     SCHEDULE. It contains aggregate counts only — never names, civil IDs or
     personal records — so the same truthful marketing numbers are shown before
     login, to a normal user, to an administrator and inside Demo. */
  const visibleTermRows = termRows;

  /* Unique, not summed: the same course taught in ten terms is one course that
     the system has carried, and the label above the number says exactly that. */
  const unique = (values: Array<number | string>) => new Set(values.filter(Boolean)).size;

  res.json({
    scoped: false,
    lifetime: {
      terms: terms.length,
      schedules: lifetimeRows,
      courses: courses.length,
      instructors: instructors.length,
      sections: sections.length,
      colleges: colleges.length,
      /* The first academic year on record, so «since» moves with the data and never needs editing. */
      since: terms.map(term => academicStartYear(term.AdTermName)).filter((year): year is number => Number.isFinite(year)).reduce<number | null>((min, year) => min === null || year < min ? year : min, null),
    },
    current: {
      termId: currentTermId || null,
      termName: currentTerm?.AdTermName || null,
      schedules: visibleTermRows.length,
      courses: unique(visibleTermRows.map(row => row.AdCourseId)),
      instructors: unique(visibleTermRows.map(row => row.AdInstructorId)),
      rooms: unique(visibleTermRows.map(row => verifiedRoomKey(row))),
      sections: unique(visibleTermRows.map(row => row.AdSectionId)),
    },
  });
});

// One search entry point for the entire academic workspace. It respects the current user's
// academic scope and only returns entities related to schedules visible to that user.
app.get("/api/search", requireAnyPermission([7, 8, 9, 10, 16, 17]), async (req: AuthenticatedRequest, res: Response) => {
  const q = String(req.query.q || "").trim().toLocaleLowerCase("ar");
  if (q.length < 2) { res.json({ schedules: [], instructors: [], courses: [], rooms: [] }); return; }
  const terms = await Repository.getTerms();
  const latestTermId = Number(sortTermsNewestServer(terms)[0]?.AdTermId || 0);
  /* النطاقُ من الحَكَم الواحد (صفُّ الكلية كلها يُقرأ)، والعميدُ يُعطى النهائي. */
  const scheduleRead = readScopedTermRows(req, latestTermId);
  const [allSchedules, instructors, courses, sections, colleges, security] = await Promise.all([
    scheduleRead, Repository.getInstructors(), Repository.getCourses(), Repository.getSections(), Repository.getColleges(), Repository.getSecurityByUser(req.user!.SystemUserId)
  ]);
  const formIds = new Set(security.map(item => item.FormNameId));
  const canSchedule = formIds.has(7);
  const canInstructor = formIds.has(8);
  const canRoom = formIds.has(9) || formIds.has(16);
  const canTime = formIds.has(10) || formIds.has(16);
  const canAdvanced = formIds.has(17);
  const schedules = filterByScope(req, allSchedules);
  const instructorById = new Map(instructors.map(item => [item.AdInstructorId, item]));
  const courseById = new Map(courses.map(item => [item.AdCourseId, item]));
  const sectionById = new Map(sections.map(item => [item.AdSectionId, item]));
  const collegeById = new Map(colleges.map(item => [item.AdCollegeId, item]));
  const matches = (value: unknown) => String(value ?? "").toLocaleLowerCase("ar").includes(q);
  const readerInstructorCivil = (person?: { AdInstructorCivil?: string; AdInstructorMobile?: string }) => (person ? instructorsForReader(req, [person])[0].AdInstructorCivil : "");
  const matchedSchedules = schedules.filter(row => {
    const ins = instructorById.get(row.AdInstructorId), course = courseById.get(row.AdCourseId);
    return [ins?.AdInstructorName, readerInstructorCivil(ins), course?.CourseName, course?.CourseCode, row.SCode, row.AdRoomCode, row.AdRoomHall, sectionById.get(row.AdSectionId)?.AdSectionName, collegeById.get(row.AdCollegeId)?.AdCollegeName].some(matches);
  });
  const visibleInstructorIds = new Set(schedules.map(row => row.AdInstructorId));
  const visibleCourseIds = new Set(schedules.map(row => row.AdCourseId));
  const paletteVisiting = await visitingChecker(latestTermId, matchedSchedules.slice(0, 12).map(row => ({ collegeId: row.AdCollegeId, sectionId: row.AdSectionId })));
  const scheduleResults = (canSchedule || canAdvanced || canTime) ? matchedSchedules.slice(0, 12).map(row => ({
    id: row.id, kind: "schedule", title: courseById.get(row.AdCourseId)?.CourseName || row.AdCourseName || "مقرر دراسي",
    subtitle: `${canInstructor || canSchedule || canAdvanced ? withVisitingSuffix(instructorById.get(row.AdInstructorId)?.AdInstructorName || "", !!instructorById.get(row.AdInstructorId)?.AdInstructorName && paletteVisiting(row.AdInstructorId, row.AdCollegeId, row.AdSectionId)) : ""}${canRoom || canSchedule || canAdvanced ? ` — ${row.AdRoomCode}/${row.AdRoomHall}` : ""} — ${formatScheduleTimeRange(row.fstarttime, row.fendtime)}`,
    meta: `${courseById.get(row.AdCourseId)?.CourseCode || ""} / شعبة ${row.SCode}`
  })) : [];
  const readerInstructors = instructorsForReader(req, instructors);
  const instructorResults = (canInstructor || canSchedule || canAdvanced) ? sortArabicNamed(readerInstructors.filter(item => visibleInstructorIds.has(item.AdInstructorId) && (matches(item.AdInstructorName) || (item.AdInstructorCivil && matches(item.AdInstructorCivil)))), item => item.AdInstructorName).slice(0, 8).map(item => ({ id: item.AdInstructorId, kind: "instructor", title: item.AdInstructorName, subtitle: item.AdInstructorCivil, meta: "أستاذ مقرر" })) : [];
  const courseResults = (canSchedule || canAdvanced) ? sortCoursesByName(courses.filter(item => visibleCourseIds.has(item.AdCourseId) && (matches(item.CourseName) || matches(item.CourseCode)))).slice(0, 8).map(item => ({ id: item.AdCourseId, kind: "course", title: item.CourseName, subtitle: item.CourseCode, meta: sectionById.get(item.AdSectionId)?.AdSectionName || "" })) : [];
  const roomMap = new Map<string, {building:string;hall:string;count:number;roomId:string;buildingId?:string}>();
  schedules.forEach(row => { const key=verifiedRoomKey(row); if(!key)return; const prev=roomMap.get(key); roomMap.set(key,{building:String(row.AdRoomCode||""),hall:String(row.AdRoomHall||""),roomId:String(row.roomId||""),buildingId:row.buildingId,count:(prev?.count||0)+1}); });
  const roomResults = (canRoom || canSchedule || canAdvanced) ? Array.from(roomMap.values()).filter(item => matches(item.building) || matches(item.hall)).slice(0, 8).map((item,index) => ({ id: item.roomId, kind: "room", title: `مبنى ${item.building} — قاعة ${item.hall}`, subtitle: `${countOf(item.count, AR.appointment)} في الجداول`, meta: "قاعة رسمية", building:item.building, hall:item.hall, buildingId:item.buildingId, roomId:item.roomId })) : [];
  res.json({ schedules: scheduleResults, instructors: instructorResults, courses: courseResults, rooms: roomResults });
});


// ============================================================================
// NATURAL QUERY — the command palette answers instead of filtering
// Rules only: the same sentence always resolves to the same rows, offline.
// ============================================================================

app.get("/api/search/natural", requireAnyPermission([7, 8, 9, 10, 16, 17]), async (req: AuthenticatedRequest, res: Response) => {
  const parsed = parseNaturalQuery(String(req.query.q || ""));
  if (parsed.intent === "unknown") { res.json({ intent: "unknown", title: "", rows: [] }); return; }

  /* النطاق يُفرض هنا لكل صفة: قسمٌ أو كليةٌ خارج نطاق القارئ تُرفض صراحةً،
     والصفوف تُقرأ بقارئ الطلب نفسه — مُصفّاةً بالنطاق، ونهائيةً للعميد. أما
     «الكون» فلا يُستعمل إلا لإشغال القاعات وفراغات الأستاذ: وقتٌ ومكانٌ بلا
     مقرّرٍ ولا قسم. */
  const { collegeId, sectionId, termId, allowed } = await resolveSmartContext(req, { allowCollegeWide: true });
  if (!allowed) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  if (!termId) { res.json({ intent: parsed.intent, title: "", rows: [] }); return; }

  const [rows, universe, courses, instructors] = await Promise.all([
    readSchedulesForRequest(req, collegeId, sectionId, termId),
    Repository.getSchedulesByScope({ termId }),
    Repository.getCourses(),
    Repository.getInstructors()
  ]);
  const courseById = new Map(courses.map(row => [row.AdCourseId, row]));
  const instructorById = new Map(instructors.map(row => [row.AdInstructorId, row]));
  const toMinutes = (value: string) => { const [h, m] = String(value || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  const onDay = (row: FSchedule, day: number | null) => day === null || Boolean((row as any)[DAY_FLAGS[day]]);
  const atTime = (row: FSchedule, time: string | null) => {
    if (!time) return true;
    const point = toMinutes(time);
    return toMinutes(row.fstarttime) <= point && toMinutes(row.fendtime) > point;
  };
  /* «· منتدب» بقسم الصفّ نفسه: يُملأ قبل التشكيل بنطاقات الصفوف التي ستخرج فقط. */
  let shapeVisiting: (instructorId: unknown, collegeId: unknown, sectionId: unknown) => boolean = () => false;
  const shapeScopes = (list: FSchedule[]) => list.slice(0, 40).map(row => ({ collegeId: row.AdCollegeId, sectionId: row.AdSectionId }));
  const shape = (row: FSchedule) => ({
    id: row.id,
    code: courseById.get(row.AdCourseId)?.CourseCode || "",
    name: row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "",
    section: row.SCode,
    instructor: instructorById.get(row.AdInstructorId)?.AdInstructorName
      ? withVisitingSuffix(instructorById.get(row.AdInstructorId)!.AdInstructorName, shapeVisiting(row.AdInstructorId, row.AdCollegeId, row.AdSectionId)) : "",
    start: row.fstarttime, end: row.fendtime,
    room: row.AdRoomCode || "", hall: row.AdRoomHall || "",
    days: DAY_FLAGS.map((flag, index) => ((row as any)[flag] ? DAY_LABELS[index] : null)).filter(Boolean).join(" · ")
  });
  const dayLabel = parsed.day === null ? "" : DAY_LABELS[parsed.day];
  const whenLabel = [dayLabel, parsed.time].filter(Boolean).join(" · ");

  if (parsed.intent === "freeRooms") {
    // A room is free when nothing in the whole term occupies it at that moment.
    const known = new Map<string, { room: string; hall: string; roomId: string; buildingId?: string }>();
    universe.forEach(row => {
      const key=verifiedRoomKey(row); if (!key) return;
      known.set(key, { room: String(row.AdRoomCode||""), hall: String(row.AdRoomHall||""), roomId: String(row.roomId||""), buildingId: row.buildingId });
    });
    const busy = new Set(
      universe.filter(row => onDay(row, parsed.day) && atTime(row, parsed.time))
        .map(row => verifiedRoomKey(row)).filter(Boolean)
    );
    const free = [...known.entries()].filter(([key]) => !busy.has(key)).map(([, value]) => value);
    res.json({
      intent: "freeRooms",
      title: `قاعات متاحة${whenLabel ? ` · ${whenLabel}` : ""}`,
      count: free.length,
      rooms: free.slice(0, 60),
      rows: []
    });
    return;
  }

  if (parsed.intent === "room") {
    const matched = rows
      .filter(row => String(row.AdRoomCode || "").includes(parsed.room || ""))
      .filter(row => onDay(row, parsed.day) && atTime(row, parsed.time))
      .sort((a, b) => a.fstarttime.localeCompare(b.fstarttime));
    shapeVisiting = await visitingChecker(termId, shapeScopes(matched));
    res.json({ intent: "room", title: `قاعة ${parsed.room}${whenLabel ? ` · ${whenLabel}` : ""}`, count: matched.length, rows: matched.slice(0, 40).map(shape) });
    return;
  }

  const named = parsed.name
    ? instructors.filter(row => String(row.AdInstructorName || "").includes(parsed.name as string))
    : [];
  const targetIds = new Set(named.map(row => row.AdInstructorId));

  if (parsed.intent === "gaps" && targetIds.size) {
    const dayIndexes = parsed.day === null ? [0, 1, 2, 3, 4] : [parsed.day];
    const gaps: Array<{ day: string; from: string; to: string; minutes: number }> = [];
    for (const index of dayIndexes) {
      const busy = universe
        .filter(row => targetIds.has(row.AdInstructorId) && (row as any)[DAY_FLAGS[index]])
        .sort((a, b) => toMinutes(a.fstarttime) - toMinutes(b.fstarttime));
      for (let i = 1; i < busy.length; i++) {
        const gap = toMinutes(busy[i].fstarttime) - toMinutes(busy[i - 1].fendtime);
        if (gap >= 30) gaps.push({ day: DAY_LABELS[index], from: busy[i - 1].fendtime, to: busy[i].fstarttime, minutes: gap });
      }
    }
    res.json({
      intent: "gaps",
      title: `فراغات ${named[0]?.AdInstructorName || parsed.name}${dayLabel ? ` · ${dayLabel}` : ""}`,
      count: gaps.length,
      gaps: gaps.slice(0, 30),
      rows: []
    });
    return;
  }

  const matched = rows
    .filter(row => (targetIds.size ? targetIds.has(row.AdInstructorId) : true))
    .filter(row => onDay(row, parsed.day) && atTime(row, parsed.time))
    .sort((a, b) => a.fstarttime.localeCompare(b.fstarttime));
  shapeVisiting = await visitingChecker(termId, shapeScopes(matched));
  res.json({
    intent: targetIds.size ? "instructor" : "time",
    title: targetIds.size
      ? `${named[0]?.AdInstructorName}${whenLabel ? ` · ${whenLabel}` : ""}`
      : `مواعيد${whenLabel ? ` · ${whenLabel}` : ""}`,
    count: matched.length,
    rows: matched.slice(0, 40).map(shape)
  });
});
}
