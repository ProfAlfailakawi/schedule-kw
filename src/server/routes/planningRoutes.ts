/**
 * ── التخطيط: فجوةُ الشعب والطلبُ والتسجيلُ وبناءُ الشعب ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { academicAdviceForScope } from "../academicAdvisoryData";
import express, { Response } from "express";
import { Repository, withSerialLock, caseRefFor } from "../../db/repository";
import { timeToMinutes } from "../../utils/scheduleIntelligence";
import type { AdCourse, FSchedule } from "../../types";
import { approvalScopeKey } from "../../utils/approvalScope";
import { AR, countOf } from "../../utils/arabicCount";
import { readStudentDemand, mergeCurrentDemandResponses, cohortPairs } from "../../utils/studentDemand";
import { isCaseLevelNeed, studentCaseStatus } from "../../utils/studentCaseDecision";
import { surveyOwnsNeed } from "../../utils/studentCaseScope";
import { termSeasonOf } from "../../utils/termSequence";
import { readDemandRepairs } from "../../utils/demandRepair";
import { loadSimulationInput, rankDemandRepairsBySimulation, rankSectionOpeningsBySimulation } from "../simulationData";
import { readCourseSuccession, cohortTurnover, predictDemand } from "../../utils/courseSuccession";
import { nextSectionCodes, readSectionOpenings, type OpeningReading } from "../../utils/sectionOpening";
import { demandFromTargets, gapRows, hardestFirst, weekFingerprint } from "../../utils/sectionBuild";
import { visitorFreeSlots, staffCourse, type CourseStaffing } from "../../utils/visitingNeed";
import { FACULTY_PLACEHOLDER, facultyPlaceholderOf, placePending, templatesFromHistory, type PendingRoom } from "../../utils/sectionPending";
import { courseLevelFromCode } from "../../utils/curriculumRules";
import { offeringStatesForTerm } from "../offeringStates";
import { applyOfferingToOpenings, offeringBadge } from "../../utils/courseOffering";
import { formatScheduleTimeRange } from "../../utils/scheduleTime";
import { computeTermForecast } from "../../utils/termForecast";
import { roomIdentityKey } from "../../utils/locationRegistry";
import { type AuthenticatedRequest, requireAnyPermission, requirePermission } from "../core/auth";
import { confirmedDepartmentRoomIds, readLocationRegistry } from "../core/locations";
import { sortTermsNewestServer, termChronologyServer } from "../core/ordering";
import { curriculumLabelsFor, sectionGapData } from "../core/planning";
import { departmentStyle } from "../core/rhythm";
import { readSchedulesForRequest } from "../core/scheduleReads";
import { meetingExcludedIds, SCHEDULE_DAY_KEYS } from "../core/scheduleRules";
import { applyProposalCore, dayLabelOf, deleteScheduleHandler, PROPOSAL_DAYS, regulationGate, runScheduleHandler } from "../core/scheduleWrites";
import { filterByScope, isScopeAllowed } from "../core/scope";
import { smartContextFrom } from "../core/smartImport";
import { studentIdentityFor, surveyActiveCourseIds, surveyCohort } from "../core/studentIdentity";
import { visitingChecker } from "../core/visiting";
import { planTargetsFor } from "../actualDemand";

/* ══ تنزيل الشعب: من العدد المختار في التخطيط إلى الجدول ═══════════════════════════
 *
 * القرار (عدد الشعب لكل مقرر) يأتي من «تخطيط الشعب» (التاريخ أولاً، والقسم يعدّله). هنا يُقارَن بما في جدول الفصل فعلاً:
 * المطلوب ٦ والموجود ٥ ⇒ باقٍ ١. والبناء يمرّ من محرّك التوصيات نفسه (نسجٌ على أسبوعٍ يتراكم، قاعات
 * موثّقة، أستاذٌ درّس المقرر وله نصاب، دفعةٌ لا تتقاطع، وكلّ أقسام الفصل في الحسبان)، ثم يُكتب بالمسار
 * المشترك (applyProposalCore) باسم المستخدم الحالي ومصدره «تخطيط الشعب». لا يُكتب شيء قبل ضغطة التأكيد،
 * وبصمة الأسبوع تمنع الإنزال على جدولٍ تغيّر، والإنزال كلُّه أو لا شيء. */
async function readSectionBuild(req: AuthenticatedRequest, collegeId: number, sectionId: number, termId: number, given?: unknown) {
  const [courses, planned, termWeek, history, people, registry] = await Promise.all([
    Repository.getCoursesBySection(sectionId), planTargetsFor(req, collegeId, sectionId, termId),
    Repository.getSchedulesByScope({ termId }), Repository.getSchedulesByScope({ collegeId, sectionId }),
    Repository.getInstructors(termId).catch(() => []), readLocationRegistry(),
  ]);
  const week = termWeek.filter(row => Number(row.AdSectionId) === sectionId && Number(row.AdCollegeId) === collegeId);
  /* العدد المستهدف لكل مقرر: ما عدّله القسم على الشاشة (أعداداً فقط)، وإلا مقترح التخطيط (التاريخ أولاً). لا سقف ثابتاً: يحدّه الحاجة الكاملة. */
  const accepted: Record<string, unknown> = given && typeof given === "object" ? given as Record<string, unknown> : Object.fromEntries(planned.targets);
  const targets = new Map<number, number>();
  for (const course of courses) {
    const id = Number(course.AdCourseId), value = accepted[String(id)];
    /* بلا تخطيطٍ لهذا المقرر لا سقف مخصوص: يحدّه 500 كحدّ حماية؛ ومعه سقفه الحاجة الكاملة. */
    const ceiling = planned.ceiling.has(id) ? Math.max(planned.ceiling.get(id) || 0, planned.targets.get(id) || 0) : 500;
    if (value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= Math.max(ceiling, 1)) targets.set(id, Math.floor(Number(value)));
  }
  const courseById = new Map(courses.map(course => [Number(course.AdCourseId), course]));
  const levelOf = (id: number) => courseLevelFromCode(courseById.get(id)?.CourseCode) || 0;
  const gaps = gapRows(courses, targets, week);
  /* قسمٌ بلا أي موعدٍ في الفصل «لم يبدأ»: لا نخترع جدولاً من العدم، يبدؤه القسم ثم يُكمله التنزيل. */
  const started = week.length > 0;
  const ordered = hardestFirst(gaps.filter(row => row.remaining > 0), levelOf, id => (planned.gradShort.has(id) ? 0 : 1));
  const demand = demandFromTargets([...ordered, ...gaps.filter(row => row.remaining === 0 && row.target !== null)], id => Number(courseById.get(id)?.MaxStudent) || 0, levelOf);
  const style = ordered.length ? await departmentStyle({ AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId }) : null;
  /* C5: لا تُقترح شعبةٌ لمقررٍ 🔒/🌱، و🎯 على المتبقي فقط. */
  const reading = applyOfferingToOpenings(ordered.length
    ? readSectionOpenings(week, termWeek, courses, people as any[], history, demand, null, style?.reading || null, style?.doorway || 0, 999, registry.rooms, termId)
    : { proposals: [], noCeiling: [], headline: "" } as OpeningReading, await offeringStatesForTerm(termId));
  const byCourse = new Map(reading.proposals.map(proposal => [proposal.courseId, proposal]));

  /* ما لم تجد له الأولى قاعةً وأستاذاً: وقتٌ من الفصل المماثل وقاعةٌ بانتظار التثبيت وأستاذٌ «هيئة تدريسية».
     يُبنى على الأسبوع بعد ما وُضع كاملاً، وتعارض الدفعة محسوبٌ؛ القاعة والأستاذ يُثبَّتان في شاشة المراجعة. */
  const pendingBy = new Map<number, ReturnType<typeof placePending>>();
  const needsPending = ordered.filter(row => row.remaining > (byCourse.get(row.courseId)?.placements.length || 0));
  /* في أي فصلٍ لا في الفارغ وحده: المبنيّ مباشرةً لا يُكتب إلا ما له قاعةٌ وأستاذ، وما سواه يُفتح في المراجعة (التي تحمل مواعيد القسم الحالية) ليثبّته القسم. */
  if (needsPending.length && history.length) {
    const terms = await Repository.getTerms().catch(() => []);
    const target = (terms as any[]).find(row => Number(row.AdTermId) === termId);
    const rank = termChronologyServer(target);
    const season = termSeasonOf(target?.AdTermName);
    const prior = sortTermsNewestServer((terms as any[]).filter(row => termChronologyServer(row) < rank));
    const termOrder = [...prior.filter(row => season && termSeasonOf(row.AdTermName) === season), ...prior.filter(row => !(season && termSeasonOf(row.AdTermName) === season))].map(row => Number(row.AdTermId));
    const placeholder = facultyPlaceholderOf(people as any[], new Set(history.map(row => Number(row.AdInstructorId)).filter(id => id > 0)));
    let tempId = -100000;
    const asRows = (courseId: number, list: Array<{ days?: string[]; day: string; start: string; end: string; roomId: string; roomCode: string; roomHall: string; buildingId: string; instructorId: number; sectionCode: string }>) => list.map(item => {
      const next: any = { ...(week[0] || history[0]), id: tempId--, AdTermId: termId, AdCourseId: courseId, SCode: `x${item.sectionCode}`, fstarttime: item.start, fendtime: item.end,
        roomId: item.roomId, AdRoomCode: item.roomCode, AdRoomHall: item.roomHall, buildingId: item.buildingId, AdInstructorId: item.instructorId, locationStatus: item.roomId ? "VERIFIED" : "PENDING_ROOM" };
      for (const key of ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"]) next[key] = (item.days || [item.day]).includes(key);
      return next as FSchedule;
    });
    const working: FSchedule[] = [...termWeek];
    for (const proposal of reading.proposals) working.push(...asRows(proposal.courseId, proposal.placements as any));
    const pairs = cohortPairs(demand);
    /* قاعات القسم من تاريخه (موثّقة وفعّالة)، الأكثر استعمالاً أولاً؛ وللمقرر قاعاتُه هو قبلها. فيختار النظام القاعة ولا يُترك التثبيت إلا لما لم تُوجد له. */
    const activeRoomIds = new Set((registry.rooms as any[]).filter(room => room.active && room.confidence === "CONFIRMED").map(room => String(room.id)));
    /* قاعاتُ القسم «الحالية»: ما زالت مسجّلةً باسمه في سجلّ المباني (أو مثبَّتةً له)، لا قاعةً استعملها يوماً ثم صارت لقسمٍ آخر.
       تُقارَن بها قاعاتُ التاريخ فلا يبقى إلا المشترك بينهما؛ فإن لم يبقَ شيءٌ ظهر التثبيت للشعبة ليختارها المستخدم. */
    const pinnedIds = confirmedDepartmentRoomIds(registry as any, await Repository.getPinnedDepartmentRooms(collegeId, sectionId).catch(() => []), collegeId);
    const ownedNow = new Set((registry.rooms as any[]).filter(room => activeRoomIds.has(String(room.id)) && (pinnedIds.has(String(room.id)) || (Array.isArray(room.sectionIds) && room.sectionIds.map(Number).includes(sectionId)))).map(room => String(room.id)));
    const capacityOf = new Map((registry.rooms as any[]).map(room => [String(room.id), Number(room.capacity) || 0] as const));
    const roomsByUse = (rows: FSchedule[]): PendingRoom[] => {
      const use = new Map<string, { n: number; row: FSchedule }>();
      for (const item of rows) {
        if (item.locationStatus !== "VERIFIED" || !item.roomId || !item.buildingId || !activeRoomIds.has(String(item.roomId))) continue;
        if (!ownedNow.has(String(item.roomId))) continue;
        use.set(String(item.roomId), { n: (use.get(String(item.roomId))?.n || 0) + 1, row: item });
      }
      return [...use.values()].sort((a, b) => b.n - a.n).map(({ row }) => ({ roomId: String(row.roomId), buildingId: String(row.buildingId), code: String(row.AdRoomCode || ""), hall: String(row.AdRoomHall || ""), capacity: capacityOf.get(String(row.roomId)) || 0 }));
    };
    const departmentRooms = roomsByUse(history);
    for (const row of needsPending) {
      const full = byCourse.get(row.courseId)?.placements || [];
      const past = history.filter(item => Number(item.AdCourseId) === row.courseId);
      const courseRows = past.length ? past : history;
      const seed = [...past].sort((x, y) => Number(y.AdTermId) - Number(x.AdTermId))[0] || history[0];
      const codes = [...past, ...week].filter(item => Number(item.AdCourseId) === row.courseId).map(item => Number(String(item.SCode).replace(/\D/g, ""))).filter(n => Number.isFinite(n) && n > 0);
      const taken = [...codes, ...full.map(p => Number(p.sectionCode))];
      const lengths = courseRows.map(item => timeToMinutes(item.fendtime) - timeToMinutes(item.fstarttime)).filter(n => n > 0);
      const placed = placePending({
        course: courseById.get(row.courseId)!, count: row.remaining - full.length, firstCode: nextSectionCodes(taken, 1)[0],
        templates: templatesFromHistory(past, termOrder), seed, working, pairs, doorway: style?.doorway || 0, rhythm: style?.reading || null, termId,
        instructorId: Number(placeholder?.AdInstructorId || 0), instructorName: placeholder?.AdInstructorName || "", fallbackLength: lengths[0] || 0, draftId: () => tempId--,
        rooms: (() => { const own = roomsByUse(past); const seen = new Set(own.map(room => room.roomId)); return [...own, ...departmentRooms.filter(room => !seen.has(room.roomId))]; })(),
        seatsNeeded: Number(courseById.get(row.courseId)?.MaxStudent) || 0,
      });
      if (placed.length) pendingBy.set(row.courseId, placed);
    }
  }
  const rows = gaps.map(row => {
    const proposal = byCourse.get(row.courseId);
    const placements = [...(proposal?.placements || []), ...(pendingBy.get(row.courseId) || [])];
    let reason = "";
    if (row.remaining > 0 && placements.length < row.remaining) {
      reason = !(Number(courseById.get(row.courseId)?.MaxStudent) > 0) ? "سعة الشعبة غير مسجّلة في المقرر"
        : !history.some(item => Number(item.AdCourseId) === row.courseId) && !week.length ? "لا تاريخ للقسم لهذا المقرر يحدد وقته"
        : proposal?.unplacedReason || "لا وقت خالياً من التعارض في تاريخ القسم";
    }
    return { ...row, placements, unplaced: Math.max(0, row.remaining - placements.length), reason,
      /* سقف ما يجوز طلبه لهذا المقرر = الحاجة الكاملة، ومنهم الخريجون: تعرضه الشاشة ولا تمنع به. */
      ceiling: Math.max(planned.ceiling.get(row.courseId) || 0, row.target ?? 0), grad: planned.gradShort.has(row.courseId) };
  });
  return { rows, started, fingerprint: weekFingerprint(termWeek), courseCount: courses.length };
}

/* ── من يدرّس كل مقرر؟ أعدادٌ لا أسماء ─────────────────────────────────────────────────
   أساتذتنا من تاريخ القسم كلّه (منذ ٢٠١٦)، دون المنتدبين و«هيئة تدريسية» ومن تقاعد أو تفرّغ. الحساب في utils/visitingNeed.ts. */
async function sectionGapStaffing(collegeId: number, sectionId: number, termId: number, courseIds: number[]) {
  const [termRows, sectionRows, { instructors, visiting }, affiliations, allTerms] = await Promise.all([
    Repository.getSchedulesByScope({ termId }), Repository.getSchedulesByScope({ collegeId, sectionId }),
    meetingExcludedIds(termId), Repository.getDelegateAffiliations(), Repository.getTerms().catch(() => []),
  ]);
  /* «درّسه سابقاً» = فصلٌ أسبق بالتسلسل الزمني، لا أي فصلٍ آخر (فصلٌ قادمٌ لا يُحسب). */
  const target = (allTerms as any[]).find(row => Number(row.AdTermId) === termId);
  const rank = termChronologyServer(target);
  const earlier = new Set<number>((allTerms as any[]).filter(row => termChronologyServer(row) < rank).map(row => Number(row.AdTermId)));
  const visitingNow = new Set<number>(visiting);
  const rosterOf = new Map<number, Set<number>>();
  for (const row of affiliations) if (row.kind === "roster" && row.termId) {
    if (!rosterOf.has(row.termId)) rosterOf.set(row.termId, new Set());
    row.instructorIds.forEach(id => rosterOf.get(row.termId!)!.add(Number(id)));
  }
  const placeholder = new Set<number>(instructors.filter(person => String(person.AdInstructorName || "").normalize("NFKC").replace(/\s+/g, " ").trim().startsWith(FACULTY_PLACEHOLDER)).map(person => Number(person.AdInstructorId)));
  const inactive = new Set<number>(instructors.filter(person => person.AdInstructorStatus).map(person => Number(person.AdInstructorId)));
  const isVisiting = (id: number) => visitingNow.has(id);
  const isOurs = (id: number) => !isVisiting(id) && !placeholder.has(id) && !inactive.has(id);
  const mine = (sectionRows as any[]);
  const staffing: Record<string, CourseStaffing> = {};
  for (const id of courseIds) {
    staffing[String(id)] = staffCourse(
      mine.filter(row => Number(row.AdCourseId) === id && Number(row.AdTermId) === termId),
      mine.filter(row => Number(row.AdCourseId) === id && earlier.has(Number(row.AdTermId))),
      isOurs, isVisiting, id2 => placeholder.has(id2), id2 => !inactive.has(id2), (id2, term) => Boolean(rosterOf.get(term)?.has(id2)),
    );
  }
  /* منتدبو هذا القسم في جدول الفصل: كل منتدبٍ بعدد شعبه في الفصل كلّه (الحدّ للشخص لا للقسم). */
  const here = new Set<number>(mine.filter(row => Number(row.AdTermId) === termId).map(row => Number(row.AdInstructorId || 0)).filter(id => id && isVisiting(id)));
  const loads = new Map<number, Set<string>>();
  for (const row of termRows as any[]) {
    const id = Number(row.AdInstructorId || 0);
    if (!here.has(id)) continue;
    if (!loads.has(id)) loads.set(id, new Set());
    loads.get(id)!.add(`${row.AdCourseId}|${row.SCode}`);
  }
  return { staffing, visitorFreeSlots: visitorFreeSlots([...here].map(id => loads.get(id)?.size || 0)) };
}

export function registerPlanningRoutes(app: Express): void {

app.post("/api/section-build/preview", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.body?.collegeId || 0), sectionId = Number(req.body?.sectionId || 0), termId = Number(req.body?.termId || 0);
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "حدد الكلية والقسم والفصل" }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  res.setHeader("Cache-Control", "no-store");
  const builtRaw = await readSectionBuild(req, collegeId, sectionId, termId, req.body?.targets);
  /* الشارة «منتدب» بجانب أستاذ الشعبة المقترحة: علمٌ للعرض فقط في ردّ المعاينة، لا يدخل ما يُنزَّل. */
  const placementVisiting = await visitingChecker(termId, [{ collegeId, sectionId }]);
  const built = { ...builtRaw, rows: builtRaw.rows.map(row => ({ ...row, placements: row.placements.map(p => ({ ...p, visiting: placementVisiting(p.instructorId, collegeId, sectionId) })) })) };
  const totals = built.rows.reduce((sum, row) => ({
    target: sum.target + (row.target ?? 0), existing: sum.existing + (row.target === null ? 0 : Math.min(row.existing, row.target)),
    remaining: sum.remaining + row.remaining, placeable: sum.placeable + row.placements.length,
    pending: sum.pending + row.placements.filter(p => (p as any).pending).length,
    roomless: sum.roomless + row.placements.filter(p => (p as any).pending && !p.roomId).length,
  }), { target: 0, existing: 0, remaining: 0, placeable: 0, pending: 0, roomless: 0 });
  res.json({ ...built, totals });
});

app.post("/api/section-build/apply", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.body?.collegeId || 0), sectionId = Number(req.body?.sectionId || 0), termId = Number(req.body?.termId || 0);
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "حدد الكلية والقسم والفصل" }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  /* المختار مفاتيحُ فقط (مقرر:رقم الشعبة). الموعد والقاعة والأستاذ يُعاد حسابها هنا فلا يُملي المتصفحُ موعداً. */
  const picked = new Set<string>((Array.isArray(req.body?.pick) ? req.body.pick : []).map(String).slice(0, 200));
  if (!picked.size) { res.status(400).json({ error: "لم تختر شعباً للتنزيل." }); return; }
  const outcome = await withSerialLock(`section-build:${collegeId}:${sectionId}:${termId}`, async (): Promise<{ status: number; json: any; audit?: string }> => {
    const built = await readSectionBuild(req, collegeId, sectionId, termId, req.body?.targets);
    if (String(req.body?.fingerprint || "") !== built.fingerprint) {
      return { status: 409, json: { error: "تغيّر جدول الفصل منذ المعاينة. أعد المعاينة قبل التنزيل.", code: "stale" } };
    }
    /* الشعب بانتظار القاعة والأستاذ لا تُكتب مباشرةً: تُراجع أولاً في شاشة الاستيراد. */
    if (built.rows.some(row => row.placements.some(placement => (placement as any).pending && picked.has(`${row.courseId}:${placement.sectionCode}`)))) {
      return { status: 409, json: { error: "بعض ما اخترت بانتظار قاعةٍ وأستاذ: راجعه في شاشة الاستيراد ثم انشره.", code: "needs-review" } };
    }
    const todo = built.rows.flatMap(row => row.placements.filter(placement => !(placement as any).pending && picked.has(`${row.courseId}:${placement.sectionCode}`)).map(placement => ({ row, placement })));
    if (!todo.length) return { status: 409, json: { error: "لا شيء من المختار قابلٌ للتنزيل الآن.", code: "stale" } };
    const batchId = `plan:${termId}:${Date.now().toString(36)}`;
    const created: any[] = [];
    const rollback = async () => {
      let ok = true;
      for (const row of created.reverse()) {
        const back = await runScheduleHandler(deleteScheduleHandler, req, { params: { id: String(row.id) }, body: {} }).catch(() => null);
        if (!back || back.status >= 400) ok = false;
      }
      return ok;
    };
    let amendment: string | null = null;
    const openingOf = (row: any, placement: any) => ({
      kind: "opening", collegeId, sectionId, termId, courseId: row.courseId, placement: { ...placement, days: [placement.day] },
      origin: { kind: "planning", refId: `${batchId}:${row.courseId}:${placement.sectionCode}`, note: `تنزيل الشعب: ${row.name} (مطلوب ${row.target}، كان ${row.existing})` },
    });
    /* مخالفةُ اللائحة تُسأل مرةً عن الدفعة كلها قبل أي كتابة: فحصٌ جافّ على أسبوعٍ يتراكم (regulationGate). */
    const gate = regulationGate(req);
    const week = await Repository.getSchedulesByScope({ termId });
    for (const [at, { row, placement }] of todo.entries()) {
      const dry = await applyProposalCore(req, openingOf(row, placement), { gate, dryRun: true, week });
      if (dry.status >= 400) return { status: dry.status, json: { ...(dry.json || {}), applied: [], reverted: true } };
      if (dry.json?.row) week.push({ ...dry.json.row, id: -(at + 1) });
    }
    for (const { row, placement } of todo) {
      const done = await applyProposalCore(req, openingOf(row, placement), { gate });
      if (done.status >= 400) {
        const reverted = await rollback();
        return { status: done.status, json: { ...(done.json || {}), applied: [], reverted, error: `${done.json?.error || "تعذّر التنفيذ."}${reverted ? " — لم يُكتب شيء." : " — تعذّر ردّ بعض ما كُتب، راجع الجدول."}` } };
      }
      const newRow = done.json?.applied?.[0]?.row;
      if (newRow) created.push(newRow);
      amendment = done.json?.amendment || amendment;
    }
    return {
      status: 200,
      json: { ok: true, applied: created.map(row => ({ action: "add", row })), batchId, amendment },
      audit: `تنزيل الشعب: ${countOf(created.length, AR.section)} — ${created.map(row => `${row.AdCourseName} ش${row.SCode}`).join("، ")}${gate.auditSuffix()}`,
    };
  });
  if (outcome.audit) res.locals.auditChanges = outcome.audit;
  res.locals.auditRowIds = ((outcome.json as any)?.applied || []).map((item: any) => Number(item?.row?.id)).filter(Number.isFinite);
  res.status(outcome.status).json(outcome.json);
});

/* «راجع وعدّل»: صفوفٌ بشكل نموذج الاستيراد نفسه، فتُفتح في شاشة المراجعة ذاتها (منتقيات الأستاذ والقاعة، فحص التعارض الحي، النشر).
   النشر هناك يستبدل جدول القسم في الفصل، فإن كان في الفصل مواعيد حُملت معها في الشاشة نفسها (موعدٌ بموعد، بأستاذه وقاعته)
   ثم تُضاف المبنيّة بعدها؛ فلا يُمحى شيءٌ بالنشر إلا ما يحذفه القسم بيده في المراجعة. لا شيء يُكتب قبل النشر هناك. */
app.post("/api/section-build/review-rows", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.body?.collegeId || 0), sectionId = Number(req.body?.sectionId || 0), termId = Number(req.body?.termId || 0);
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "حدد الكلية والقسم والفصل" }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  res.setHeader("Cache-Control", "no-store");
  const [built, occupied, people, allCourses] = await Promise.all([
    readSectionBuild(req, collegeId, sectionId, termId, req.body?.targets),
    Repository.getSchedulesByScope({ collegeId, sectionId, termId }),
    Repository.getInstructors(termId).catch(() => []), Repository.getCoursesBySection(sectionId),
  ]);
  /* المحدَّد في المعاينة فقط (مفاتيح مقرر:شعبة)؛ وبلا إرسالٍ تُفتح كل المبنيّة. */
  const picked = Array.isArray(req.body?.pick) ? new Set<string>(req.body.pick.map(String)) : null;
  const personById = new Map((people as any[]).map(person => [Number(person.AdInstructorId), person]));
  const courseById = new Map((allCourses as any[]).map(course => [Number(course.AdCourseId), course]));
  const existingRows = (occupied as any[]).map(row => {
    const start = String(row.fstarttime || ""), end = String(row.fendtime || "");
    return {
      "القاعة": row.AdRoomHall || "", "المبنى": row.AdRoomCode || "", "الوقت": `${start}-${end}`, fstarttime: start, fendtime: end,
      "الأيام": PROPOSAL_DAYS.filter(key => Boolean(row[key])).map(key => dayLabelOf(key)).join(" - "),
      "الرقم المدني": personById.get(Number(row.AdInstructorId))?.AdInstructorCivil || "",
      "أستاذ المقرر": personById.get(Number(row.AdInstructorId))?.AdInstructorName || "",
      "الشعبة": row.SCode, "المقرر الدراسي": row.AdCourseName || courseById.get(Number(row.AdCourseId))?.CourseName || "",
      "رمز المقرر": courseById.get(Number(row.AdCourseId))?.CourseCode || "",
    };
  });
  const added = built.rows.flatMap(row => row.placements.filter(p => !picked || picked.has(`${row.courseId}:${p.sectionCode}`)).map(p => ({ p, row })));
  const newRows = added.map(({ p, row }) => ({
    "القاعة": p.roomHall || "", "المبنى": p.roomCode || "", "الوقت": `${p.start}-${p.end}`,
    /* القارئ يقرأ نصّ «الوقت» بترتيب العرض العربي (النهاية أولاً)، فالبداية والنهاية تُرسلان صريحتين فلا تنقلبان. */
    fstarttime: p.start, fendtime: p.end,
    "الأيام": ((p as any).days || [p.day]).map((day: string) => dayLabelOf(day)).join(" - "),
    "الرقم المدني": "", "أستاذ المقرر": p.instructorName || "", "الشعبة": p.sectionCode, "المقرر الدراسي": row.name, "رمز المقرر": row.code,
  }));
  res.json({ rows: [...existingRows, ...newRows], count: existingRows.length + newRows.length, existing: existingRows.length, added: newRows.length,
    /* مفتاح كل موعدٍ حالي (مقرر|شعبة): تعرف الواجهة به أصل كل صف إن سقط ترتيبها بعد المعاينة. */
    existingKeys: (occupied as any[]).map(row => `${Number(row.AdCourseId)}|${String(row.SCode)}`),
    pending: added.filter(({ p }) => (p as any).pending).length, roomless: added.filter(({ p }) => !p.roomId).length });
});

/* التراجع: يحذف الصفوف التي أنشأتها دفعةٌ بعينها، ولا يلمس صفّاً تغيّر بعد إنشائه (رقم الإصدار) أو حُجز للتسجيل. */
app.post("/api/section-build/undo", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.body?.collegeId || 0), sectionId = Number(req.body?.sectionId || 0), termId = Number(req.body?.termId || 0);
  const batchId = String(req.body?.batchId || "");
  if (!collegeId || !sectionId || !termId || !batchId.startsWith("plan:")) { res.status(400).json({ error: "دفعةٌ غير معروفة." }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const outcome = await withSerialLock(`section-build:${collegeId}:${sectionId}:${termId}`, async (): Promise<{ status: number; json: any; audit?: string }> => {
    const week = await Repository.getSchedulesByScope({ collegeId, sectionId, termId });
    const mine = (week as any[]).filter(row => String(row.origin?.refId || "").startsWith(`${batchId}:`));
    if (!mine.length) return { status: 404, json: { error: "لا شعب من هذه الدفعة في الجدول (ربما حُذفت)." } };
    const changed = mine.filter(row => Number(row.rev || 0) > 1);
    if (changed.length) return { status: 409, json: { error: "تغيّر بعضُ هذه الشعب بعد تنزيلها، فلا يُحذف شيء تلقائياً. احذفها من الجدول يدوياً.", code: "changed" } };
    const removed: any[] = [];
    for (const row of mine) {
      const back = await runScheduleHandler(deleteScheduleHandler, req, { params: { id: String(row.id) }, body: {} });
      if (back.status >= 400) return { status: back.status, json: { ...(back.body || {}), removed: removed.length, error: `${back.body?.error || "تعذّر الحذف"} — حُذف ${removed.length} من ${mine.length}.` } };
      removed.push(row);
    }
    return { status: 200, json: { ok: true, removed: removed.length }, audit: `تراجع عن تنزيل الشعب: ${countOf(removed.length, AR.section)}` };
  });
  if (outcome.audit) res.locals.auditChanges = outcome.audit;
  res.status(outcome.status).json(outcome.json);
});

/* ── الإنذار المبكر للفصل ────────────────────────────────────────────────────
   توقّعٌ حتميّ لقسمٍ وفصلٍ واحد من بياناتٍ محفوظة (القواعد في src/utils/termForecast.ts).
   الفصل الغائب = الأحدث، كما تفعل لوحة البداية. يُردّ مفتاحُ النطاق ليرمي المتصفحُ ما بات بائتاً. */
app.get("/api/forecast/term", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0), sectionId = Number(req.query.sectionId || 0);
  if (!collegeId || !sectionId) { res.status(400).json({ error: "حدد الكلية والقسم" }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const termId = Number(req.query.termId || 0) || Number(sortTermsNewestServer(await Repository.getTerms())[0]?.AdTermId || 0);
  if (!termId) { res.status(400).json({ error: "لا فصل" }); return; }
  const [rows, courses, instructors, planned] = await Promise.all([
    readSchedulesForRequest(req, collegeId, sectionId, termId), Repository.getCoursesBySection(sectionId),
    Repository.getInstructors(termId), planTargetsFor(req, collegeId, sectionId, termId),
  ]);
  const scoped = rows.filter(row => Number(row.AdSectionId) === sectionId);
  const mine = new Set(scoped.map(row => Number(row.AdInstructorId)));
  /* الطلب = ما يحتاجه طلبة هذا الحرم من تقرير التسجيل (SWRDASH)، لا كشفٌ ثانٍ. */
  const forecast = computeTermForecast({
    rows: scoped, courses,
    instructors: instructors.filter(item => mine.has(Number(item.AdInstructorId))),
    remaining: planned.students.size ? Object.fromEntries(planned.students) : null,
    vacant: null,
  });
  res.json({ scopeKey: approvalScopeKey({ collegeId, sectionId, termId }), collegeId, sectionId, termId, ...forecast });
});

app.get("/api/schedules/section-gap", requireAnyPermission([7, 14]), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0);
  const sectionId = Number(req.query.sectionId || 0);
  const termId = Number(req.query.termId || 0);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  const data = await sectionGapData(collegeId, sectionId, termId);
  res.setHeader("Cache-Control", "no-store");
  res.json(data);
});

/* من يدرّس كل مقرر: يُطلب عند فتح اللوحة فقط، لا مع كل شاشة (يقرأ جدول الفصل وتاريخ القسم كلَّه). */
app.get("/api/schedules/section-gap/staffing", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0);
  const sectionId = Number(req.query.sectionId || 0);
  const termId = Number(req.query.termId || 0);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  const courses = await Repository.getCoursesBySection(sectionId);
  res.setHeader("Cache-Control", "no-store");
  res.json(await sectionGapStaffing(collegeId, sectionId, termId, (courses as any[]).map(course => Number(course.AdCourseId))));
});

/* ── اقتراحُ شعبٍ من التوقّع لا من رغبات هذا الفصل ───────────────────────────────
   «تنبّؤ الفصل القادم» يقول «افتح شعبةً لهذا المقرر» من تاريخ القسم، وقد لا يكون في رغبات الطلبة الحاليين ما يُنقص مقاعده — فكان زرُّ
   «ماذا لو فتحنا» يردّ «لا مقاعد ناقصة» ولا يدلّ على شيء. هنا يُبنى الطلبُ من عدد الشعب المتوقَّع نفسِه (مقاعدُ الشعب القائمة + شعبةٌ لكل
   `count`)، ويمرّ بمحرّك الفتح نفسِه: قاعةٌ وأستاذٌ بنصابه ووقتٌ بلا تعارض. قراءةٌ فقط؛ والاعتماد بمعاينةٍ وتأكيد كأي اقتراح. */
app.get("/api/schedules/openings-preview", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const { collegeId, sectionId, termId } = smartContextFrom(req);
  const courseId = Number(req.query.courseId || 0);
  const count = Math.max(1, Math.min(8, Math.round(Number(req.query.count || 1))));
  if (!collegeId || !sectionId || !termId || !courseId || !isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const [courses, termWeek, sectionHistory, people, registry, style] = await Promise.all([
    Repository.getCourses(), Repository.getSchedulesByScope({ termId }), Repository.getSchedulesByScope({ collegeId, sectionId }),
    Repository.getInstructors(termId).catch(() => []), readLocationRegistry(), departmentStyle({ AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId }),
  ]);
  const course = (courses as AdCourse[]).find(row => Number(row.AdCourseId) === courseId && Number(row.AdSectionId) === sectionId);
  if (!course) { res.status(404).json({ error: "المقرر غير موجود في هذا القسم" }); return; }
  const week = termWeek.filter(row => Number(row.AdSectionId) === sectionId && Number(row.AdCollegeId) === collegeId);
  const capacity = Number(course.MaxStudent) || 0;
  const open = new Set(week.filter(row => Number(row.AdCourseId) === courseId).map(row => String(row.SCode))).size;
  const demand = {
    respondents: 1, pairs: [], unwanted: [], headline: "",
    courses: [{ courseId, name: String(course.CourseName || ""), code: String(course.CourseCode || ""), students: open * capacity + (count - 1) * capacity + 1, share: 0 }],
  };
  const openings: OpeningReading = applyOfferingToOpenings(capacity > 0
    ? readSectionOpenings(week, termWeek, courses as AdCourse[], people as any[], sectionHistory, demand as any, null, style?.reading || null, style?.doorway || 0, 6, registry.rooms, termId)
    : { proposals: [], noCeiling: [{ courseId, name: String(course.CourseName || ""), demand: count }], headline: "" }, await offeringStatesForTerm(termId));
  res.setHeader("Cache-Control", "no-store");
  res.json({ openings, forecast: true, count });
});

/** Academic enrolment coordination: read only. Never used by save/sign/approval gates. */
app.get("/api/schedules/academic-advice", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0), sectionId = Number(req.query.sectionId || 0), termId = Number(req.query.termId || 0);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) {
    res.status(403).json({ error: "هذا القسم خارج نطاقك." }); return;
  }
  try {
    const reading = await academicAdviceForScope(collegeId, sectionId, termId);
    res.setHeader("Cache-Control", "no-store"); res.json(reading);
  } catch {
    res.status(503).json({ error: "التوصيات غير متاحة الآن؛ لا يؤثر ذلك على الجدول." });
  }
});

app.get("/api/schedules/demand", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0);
  const sectionId = Number(req.query.sectionId || 0);
  const termId = Number(req.query.termId || 0);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  /* Two scoped reads, not one unscoped one.
   *
   * This used to call getSchedules() — the entire collection, every department,
   * every one of ten years — and then filter it in memory to find one section's
   * week. Harmless on a test database with ninety rows; on the real one it is
   * tens of thousands of documents fetched on every open of a single reading,
   * and it grows every term forever. The term's week is what the placement
   * search needs; the section's own history is what the room and teacher
   * preferences are read from. Nothing here ever needed another department's
   * back-catalogue. */
  const [allTermNeeds, courses, termWeek, sectionHistory, links, allHistory, allTerms, sections, currentProfiles] = await Promise.all([
    // Read the term at college scope, then attribute each request to its survey
    // owner. This also lets us recover older records written before
    // surveySectionId existed, using their requested course ownership.
    Repository.getStudentNeeds(collegeId, 0, termId),
    Repository.getCourses(),
    Repository.getSchedulesByScope({ termId }),
    Repository.getSchedulesByScope({ collegeId, sectionId }),
    Repository.getShareLinks(collegeId, sectionId, termId).catch(() => []),
    Repository.getStudentNeedHistory(collegeId, 0).catch(() => []),
    Repository.getTerms().catch(() => []),
    Repository.getSections().catch(() => []),
    Repository.getStudentProfilesByCollege(collegeId).catch(() => []),
  ]);
  const operationalDemandIds=await surveyActiveCourseIds(sectionId);
  const profileCourseIds = new Set((currentProfiles as any[])
    .filter(profile => Number(profile.AdSectionId) === sectionId && Number(profile.wishes?.termId) === termId)
    .flatMap(profile => Array.isArray(profile.wishes?.courseIds) ? profile.wishes.courseIds.map(Number) : []));
  /* Keep the operational catalogue for legacy survey ownership, and add any
     current Masari wish that names a known department course—even when no
     section is offered this term. Otherwise the system would hide precisely
     the unmet demand the radar is meant to find. */
  const mine = courses.filter(course => Number(course.AdSectionId) === sectionId
    && (operationalDemandIds.has(Number(course.AdCourseId)) || profileCourseIds.has(Number(course.AdCourseId))));
  const targetCourseIds = new Set(courses.filter(course => Number(course.AdSectionId) === sectionId
    && operationalDemandIds.has(Number(course.AdCourseId))).map(course => Number(course.AdCourseId)));
  /* The register's rule; the registration sheet reads a superset of it
     (src/utils/studentCaseScope.ts), so a case shown here is never missing there. */
  const belongsToSurvey = (need:any) => surveyOwnsNeed(need, sectionId, targetCourseIds);
  const needs = (allTermNeeds as any[]).filter(belongsToSurvey);
  const history = (allHistory as any[]).filter(belongsToSurvey);
  const analyticalNeeds = mergeCurrentDemandResponses(needs as any[], currentProfiles as any[], { termId, collegeId, sectionId })
    .filter((need:any) => Array.isArray(need.courseIds));
  const reading = readStudentDemand(analyticalNeeds, mine);

  /* ── الطلبة يتغيّرون كل فصل ────────────────────────────────────────────────
     Two things follow from that, and both are computed here. How much of this
     term's answer set is new; and — when the term has no answers at all, which
     is precisely when the timetable is being written — what the term before it
     predicts, walked forward along the paths students actually took. */
  const succession = readCourseSuccession(history, mine);
  const turnover = cohortTurnover(history, termId);
  const previousTermId = Math.max(0, ...allTerms
    .map(term => Number(term.AdTermId))
    .filter(id => id < Number(termId)));
  const previousNeeds = previousTermId
    ? history.filter(need => Number(need.AdTermId) === previousTermId)
    : [];
  const previousTermName = allTerms.find(term => Number(term.AdTermId) === previousTermId)?.AdTermName || "الفصل السابق";
  // A prediction is only ever offered where there is nothing better. Real
  // answers for this term always win, and the prediction is not even computed.
  const prediction = !reading.respondents && previousNeeds.length
    ? predictDemand(succession, previousNeeds, mine, previousTermName)
    : { courses: [], pairs: [], from: 0, fromTermName: previousTermName, headline: "" };

  /* The repair search, on the real week. It is skipped entirely when nobody has
     answered — a department that has never run a survey pays nothing for a
     feature it is not using. */
  const week = termWeek.filter(row =>
    Number(row.AdSectionId) === sectionId && Number(row.AdCollegeId) === collegeId);
  const style = reading.respondents || prediction.courses.length
    ? await departmentStyle({ AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId })
    : null;
  const repairs = reading.respondents
    ? readDemandRepairs(week, reading, style?.reading || null, style?.doorway || 0, 6, termWeek)
    : { repairs: [], unsolved: [], examined: 0, headline: "" };

  /* Rank timetable moves by rerunning the registration simulation, not by
     extrapolating the pairwise survey count. This is a read-only preview over
     current-term, explicit responders; no profile, schedule, or radar run is
     written. Return only this department's aggregate impact. */
  let evaluatedRepairs: Array<any> = [];
  let repairCandidates = repairs.repairs.length;
  let repairSimulationReady = false;
  let simulationLoaded: Awaited<ReturnType<typeof loadSimulationInput>> | null = null;
  if (repairs.repairs.length) {
    const term = (allTerms as any[]).find(row => Number(row.AdTermId) === termId);
    if (term) {
      repairSimulationReady = true;
      const rounds = Math.max(1, term.AdTermStudentPhases?.rounds?.length || 2);
      simulationLoaded = await loadSimulationInput(term, rounds);
      evaluatedRepairs = rankDemandRepairsBySimulation(simulationLoaded.input, simulationLoaded.schedules as any[], simulationLoaded.courses, termId, repairs.repairs, { collegeId, sectionId });
    }
  }

  /* ── كم شعبة نفتح، وأين ────────────────────────────────────────────────────
     The question the survey is actually sent to answer. The department mails it
     before the term and registers in the first week, by which time the board is
     written — so what the answers change is not where a lecture sits, it is how
     many sections exist. Priced against each course's own MaxStudent, and every
     new section placed against the real week before it is offered. */
  const [people, openingRegistry] = reading.respondents || prediction.courses.length
    ? await Promise.all([Repository.getInstructors(termId).catch(() => []), readLocationRegistry()])
    : [[], { buildings: [], rooms: [] } as Awaited<ReturnType<typeof readLocationRegistry>>];
  let openings: OpeningReading = reading.respondents || prediction.courses.length
    ? readSectionOpenings(
        week,
        termWeek,
        mine, people, sectionHistory, reading, prediction,
        style?.reading || null, style?.doorway || 0, 6, openingRegistry.rooms,
      )
    : { proposals: [], noCeiling: [], headline: "" };
  openings = applyOfferingToOpenings(openings, await offeringStatesForTerm(termId));
  let openingSimulationTested = 0;
  let openingSimulationRejected = 0;
  if (reading.respondents && openings.proposals.length) {
    const term = (allTerms as any[]).find(row => Number(row.AdTermId) === termId);
    if (term) {
      if (!simulationLoaded) {
        const rounds = Math.max(1, term.AdTermStudentPhases?.rounds?.length || 2);
        simulationLoaded = await loadSimulationInput(term, rounds);
      }
      const ranked = rankSectionOpeningsBySimulation(simulationLoaded.input, simulationLoaded.schedules as any[], simulationLoaded.courses, termId, openings.proposals);
      openings = { ...openings, proposals: ranked.proposals };
      openingSimulationTested = ranked.tested;
      openingSimulationRejected = ranked.rejected;
      openings.simulationTested = openingSimulationTested;
      openings.simulationRejected = openingSimulationRejected;
    }
  }

  /* The door itself, so the screen that shows the answers can also show the way
     to collect more of them. Revoked and expired links are not doors. */
  const now = Date.now();
  const survey = (links as any[])
    .filter(link => link.kind === "survey" && !link.revoked && Date.parse(link.expiresAt) > now)
    .map(link => ({ id: link.id, label: link.label, expiresAt: link.expiresAt, views: link.views || 0 }));

  const sectionName = String((sections as any[]).find(row => Number(row.AdSectionId) === sectionId)?.AdSectionName || "");
  const cohort = surveyCohort(sectionName);
  const courseNameById=new Map(courses.map((course:any)=>[Number(course.AdCourseId),{name:course.CourseName,code:course.CourseCode,sectionId:Number(course.AdSectionId||0)}]));
  const sectionNameById=new Map((sections as any[]).map((row:any)=>[Number(row.AdSectionId),String(row.AdSectionName||"")]));
  const curriculumOf=await curriculumLabelsFor(needs);
  const cases=(await Promise.all(needs.map(async(need:any)=>({
    id:need.id,caseRef:caseRefFor(need),createdAt:need.createdAt,...await studentIdentityFor(req,need),
    studentSectionId:Number(need.studentSectionId||need.AdSectionId||0),studentSectionName:sectionNameById.get(Number(need.studentSectionId||need.AdSectionId||0))||"",
    curriculum:curriculumOf(need),
    surveySectionId:Number(need.surveySectionId||sectionId),surveyLinkId:String(need.surveyLinkId||""),
    requestType:need.requestType||"new-course",details:need.details||"",graduateReason:need.graduateReason,
    passedUnits:need.passedUnits,requiredUnits:need.requiredUnits,degreeUnits:need.degreeUnits,eligibility:need.eligibility||"not-checked",
    /* القرارُ نفسُه الذي يقرؤه «كشف التسجيل» (انظر /api/student-registration): السجلّان شاشةٌ واحدة، فتصل الحالةُ هنا أيضاً لتُقرأ بلا أزرار. */
    caseLevel:isCaseLevelNeed(need),caseStatus:isCaseLevelNeed(need)?studentCaseStatus(need.caseState):undefined,
    caseReasonCode:(need.caseState?.registrar||need.caseState?.committee)?.reasonCode,caseNote:(need.caseState?.registrar||need.caseState?.committee)?.note,
    courses:(need.courseIds||[]).map((id:number)=>{const course:any=courseNameById.get(Number(id))||{name:`مقرر ${id}`,code:"",sectionId:0};const said:any=(need.courseStates||[]).find((row:any)=>Number(row.courseId)===Number(id));return{id,...course,sectionName:sectionNameById.get(Number(course.sectionId||0))||"",state:String(said?.state||"awaiting-registration"),settled:Boolean(said),reasonCode:said?.reasonCode,note:said?.note,droppedByStudent:Boolean(said?.droppedByStudent),readOnly:Number(course.sectionId||0)!==sectionId&&Boolean(course.sectionId)};}),
  })))).sort((a:any,b:any)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  res.setHeader("Cache-Control", "no-store");
  res.json({
    ...reading,
    ...repairs,
    repairs: evaluatedRepairs,
    repairCandidates,
    repairSimulationReady,
    ...cohort,
    sectionName,
    survey,
    openings,
    succession: { links: succession.links.slice(0, 10), pathsSeen: succession.pathsSeen,
                  termsSpanned: succession.termsSpanned, headline: succession.headline },
    turnover,
    prediction,
    cases,
    totalRespondents: needs.length,
    totalCases: cases.length,
    // The limit travels with the answer: this speaks for whoever answered, and
    // is never the registrar's roll.
    limit: "مبنيّ على من أجاب الاستبيان فقط — ليس بيانات التسجيل.",
  });
});

/** The department's tray. Empty is the normal state and costs one scoped read. */
app.get("/api/schedules/staff-inbox", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0);
  const sectionId = Number(req.query.sectionId || 0);
  const termId = Number(req.query.termId || 0);
  if (!collegeId || !termId || !isScopeAllowed(req, collegeId, sectionId)) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  const [notesRaw, courses, schedules] = await Promise.all([
    Repository.getStaffInbox(collegeId, sectionId, termId),
    Repository.getCourses(),
    Repository.getSchedulesByScope({ collegeId, sectionId, termId }),
  ]);
  /* رسائلُ أقسام القارئ وحدها: بلا قسمٍ كانت تُقرأ رسائلُ الكلية كلها. */
  const notes = filterByScope(req, notesRaw as any[]);
  const rowById = new Map(schedules.map(row => [row.id, row]));
  res.setHeader("Cache-Control", "no-store");
  res.json(notes.map(note => {
    const row: any = rowById.get(note.scheduleId);
    return {
      id: note.id, createdAt: note.createdAt, from: note.userName,
      kind: note.kind || "change", text: note.text,
      scheduleId: note.scheduleId,
      course: row?.AdCourseName || courses.find(c => c.AdCourseId === row?.AdCourseId)?.CourseName || "",
      time: row ? formatScheduleTimeRange(row.fstarttime, row.fendtime) : "",
      day: row ? (SCHEDULE_DAY_KEYS.find(key => Boolean(row[key])) || "") : "",
      room: row ? [row.AdRoomCode, row.AdRoomHall].filter(Boolean).join("/") : "",
    };
  }));
});
}
