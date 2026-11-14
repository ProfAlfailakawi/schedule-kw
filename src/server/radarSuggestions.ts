/**
 * ── الرادار يقترح الشعبة: المسار ─────────────────────────────────────────────
 *
 * GET /api/simulation/suggestions — لكل مقررٍ في نطاق القارئ «مطلوبٍ ولا يُطرح» أو «يمتلئ» (ما يحتاج قراراً
 * في الرادار): شعبةٌ مقترحة (يومٌ ووقت، أستاذ، قاعة) من محرّك فتح الشعب نفسِه، يختار منها الرادارُ ما يأخذه
 * أكثرُ المنتظرين، ثم يقيس بالمحاكاة نفسِها كم يجد مقعداً قبلها وبعدها. وإن لم يوجد اقتراحٌ صالح قال السببَ
 * في سطر (لا أستاذ بنصاب، لا قاعة من النوع المناسب، لا وقت يناسب الطلبة) ولا يعرض اقتراحاً ناقصاً.
 *
 * قراءةٌ فقط: لا يكتب شيئاً. الاعتمادُ يمرّ من مسار حفظ الجدول نفسِه (POST /api/schedules/apply-proposal)
 * بكل فحوصه. والحارسُ حارسُ مسارات الرادار المجاورة: requireAuth، ثم نطاقُ القارئ (isPowerUser أو
 * isScopeAllowed على قسم المقرر)، ومنتقي الكلية والقسم يضيّق ولا يوسّع. أعدادٌ لا أسماء طلبة.
 * فصلُ الباب وحده: الفصلُ السابق المجمَّد لا يُقترح له شيء.
 */
import type { Express, Request, Response } from "express";
import { Repository } from "../db/repository";
import type { AdCourse, AdTerm, FSchedule, RegistrationRun } from "../types";
import { createTtlMemo } from "./notificationCache";
import { pickDoorTerm } from "../utils/termStudentPhases";
import { buildSimulationOfferings, type loadSimulationInput } from "./simulationData";
import { simulateRegistration, type SimResult } from "../utils/registrationSim";
import { NO_SUGGESTION_LINE, radarCandidates, roomsOfRightType, waitingStudentsFor, type RadarNoSuggestion } from "../utils/radarSuggestion";
import type { Placement } from "../utils/sectionOpening";
import { applyOfferingToOpenings } from "../utils/courseOffering";
import { offeringStatesForTerm } from "./offeringStates";
import { readLocationRegistry } from "./core/locations";
import { departmentStyle } from "./core/rhythm";

type Loaded = Awaited<ReturnType<typeof loadSimulationInput>>;

export interface RadarSuggestionDeps {
  requireAuth: import("express").RequestHandler;
  isScopeAllowed: (req: any, collegeId: number, sectionId: number) => boolean;
  isPowerUser: (req: any) => boolean;
  dataContextKey?: (key: string | number) => string;
  /** مدخلُ المحاكاة المشترك مع «ماذا لو؟» (الذاكرة نفسها). */
  loadInput: (term: AdTerm, run: RegistrationRun | null) => Promise<Loaded>;
}

export interface RadarSuggestionRow {
  courseId: number; collegeId: number; sectionId: number; code: string; name: string;
  /** المنتظرون: بلا مقعد لأن الشعب امتلأت أو لا شعبة. */
  waiting: number;
  kind: "not-offered" | "full";
  suggestion: null | {
    placement: Placement;
    /** كم منتظراً يستطيع هذا الوقت (قيدُه ومقرراتُه). */
    fits: number;
    /** يجدون مقعداً في المقرر قبل الشعبة وبعدها (المحاكاة نفسها). */
    seatedBefore: number; seatedAfter: number;
  };
  reason?: RadarNoSuggestion; reasonLine?: string;
  /** من يعتمدها: قسمُ المقرر صاحبُ الجدول. */
  sectionName: string;
}

/** أقصى مقرراتٍ يُقترح لها في الطلب الواحد (الأثقلُ أولاً): كلُّ مقررٍ عشراتُ أسئلةٍ للمحرّك ومحاكاةٌ أو ثلاث. */
export const RADAR_SUGGESTION_LIMIT = 8;
const weight = (row: RegistrationRun["courses"][number]) => row.unmet.full * 3 + row.unmet["not-offered"] * 2 + row.unmet.conflict;

/** الاقتراحُ لمقررٍ واحد: من المحرّك، مرتّباً بمن يستطيعه، ثم تقيس المحاكاةُ أفضلَ ثلاثة ويؤخذ أكثرُها مقاعد. */
export async function suggestForCourse(term: AdTerm, loaded: Loaded, baseline: SimResult, row: RegistrationRun["courses"][number]): Promise<Omit<RadarSuggestionRow, "code" | "name" | "sectionName">> {
  const termId = Number(term.AdTermId);
  const { courseId, collegeId, sectionId } = row;
  const kind: RadarSuggestionRow["kind"] = row.unmet["not-offered"] >= row.unmet.full ? "not-offered" : "full";
  const base = { courseId, collegeId, sectionId, waiting: row.unmet.full + row.unmet["not-offered"], kind };
  const none = (reason: RadarNoSuggestion) => ({ ...base, suggestion: null, reason, reasonLine: NO_SUGGESTION_LINE[reason] });
  const course = loaded.courses.get(courseId);
  if (!course || !collegeId || !sectionId) return none("no-slot");
  const responders = loaded.input.students.filter(student => student.wishes);
  const offerings = buildSimulationOfferings(termId, loaded.schedules, loaded.courses).offerings;
  const slotsById = new Map(offerings.map(offering => [offering.id, offering.slots] as const));
  const waiting = waitingStudentsFor(courseId, responders, baseline, slotsById);
  const universe = loaded.schedules.filter(item => Number(item.AdTermId) === termId);
  const week = universe.filter(item => Number(item.AdCollegeId) === collegeId && Number(item.AdSectionId) === sectionId);
  const [history, people, registry, style, states] = await Promise.all([
    Repository.getSchedulesByScope({ collegeId, sectionId }), Repository.getInstructors(termId).catch(() => []), readLocationRegistry(),
    departmentStyle({ AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId }), offeringStatesForTerm(termId),
  ]);
  const openSections = new Set(week.filter(item => Number(item.AdCourseId) === courseId).map(item => String(item.SCode))).size;
  const found = radarCandidates({
    course, openSections, waiting, week, universe, courses: [...loaded.courses.values()], instructors: people as any[], history: history as FSchedule[],
    rhythm: style?.reading || null, doorway: style?.doorway || 0, rooms: roomsOfRightType(registry.rooms, history as FSchedule[], courseId, sectionId), termId,
    offerable: proposal => applyOfferingToOpenings({ proposals: [proposal], noCeiling: [] }, states).proposals.length > 0,
  });
  if (!found.candidates.length) return none(found.reason || "no-slot");
  /* أفضلُ ثلاثة بعدد من يستطيعه، تُقاس بالمحاكاة: يُعتمد أكثرُها مقاعدَ فعلية في المقرر. */
  const seatedOf = (result: SimResult) => result.demand.find(item => item.courseId === courseId)?.seated || 0;
  const seatedBefore = seatedOf(baseline);
  let best: RadarSuggestionRow["suggestion"] = null;
  let nextId = Math.max(0, ...loaded.schedules.map(item => Number(item.id) || 0)) + 1;
  for (const candidate of found.candidates.slice(0, 3)) {
    const { placement } = candidate;
    const added = (placement.days?.length ? [placement.days] : [[placement.day]]).map(days => ({
      id: nextId++, AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId, AdCourseId: courseId, AdCourseName: course.CourseName,
      SCode: placement.sectionCode, AdInstructorId: placement.instructorId,
      fsunday: days.includes("fsunday"), fmonday: days.includes("fmonday"), ftuesday: days.includes("ftuesday"), fwednesday: days.includes("fwednesday"), fthursday: days.includes("fthursday"),
      fstarttime: placement.start, fendtime: placement.end, AdRoomCode: placement.roomCode, AdRoomHall: placement.roomHall,
      buildingId: placement.buildingId, roomId: placement.roomId, locationStatus: "VERIFIED",
    } as unknown as FSchedule));
    const after = simulateRegistration({ ...loaded.input, students: responders, offerings: buildSimulationOfferings(termId, [...loaded.schedules, ...added], loaded.courses).offerings, assessCapacity: true });
    const seatedAfter = seatedOf(after);
    if (!best || seatedAfter > best.seatedAfter) best = { placement, fits: candidate.fits, seatedBefore, seatedAfter };
  }
  /* شعبةٌ لا يجد فيها منتظرٌ واحد مقعداً ليست اقتراحاً. */
  if (!best || best.seatedAfter <= seatedBefore) return none("no-slot");
  return { ...base, suggestion: best };
}

export function registerRadarSuggestionRoutes(app: Express, deps: RadarSuggestionDeps): void {
  const ctxKey = (key: string | number): string => (deps.dataContextKey ? deps.dataContextKey(key) : String(key));
  /* لكل مقرر ذاكرتُه، ومفتاحُها يحمل آخرَ احتسابٍ ووسمَ «قديم»: أيُّ حفظٍ في الجدول يُبطلها. والنتيجةُ لا تحمل ما يخصّ القارئ. */
  const courseMemo = createTtlMemo<Omit<RadarSuggestionRow, "code" | "name" | "sectionName">>({ ttlMs: 10 * 60_000 });
  const baselineMemo = createTtlMemo<SimResult>({ ttlMs: 10 * 60_000 });

  app.get("/api/simulation/suggestions", deps.requireAuth, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const term = pickDoorTerm((await Repository.getTerms()) as any) as AdTerm | null;
    const asked = Number(req.query.termId) || 0;
    if (!term || (asked && asked !== Number(term.AdTermId))) { res.json({ ready: false, rows: [] }); return; }
    const termId = Number(term.AdTermId);
    const run = await Repository.getRegistrationRun(termId);
    if (!run) { res.json({ ready: false, rows: [] }); return; }
    const collegePick = Math.max(0, Number(req.query.collegeId) || 0), sectionPick = Math.max(0, Number(req.query.sectionId) || 0);
    const power = deps.isPowerUser(req);
    const mine = (collegeId: number, sectionId: number) => (power || deps.isScopeAllowed(req, collegeId, sectionId))
      && (!collegePick || collegeId === collegePick) && (!sectionPick || sectionId === sectionPick);
    const asks = run.courses.filter(row => (row.unmet.full > 0 || row.unmet["not-offered"] > 0) && mine(Number(row.collegeId), Number(row.sectionId)))
      .sort((a, b) => weight(b) - weight(a) || a.courseId - b.courseId);
    try {
      const stamp = `${termId}:${run.ranAt || ""}:${run.staleAt || ""}`;
      const loaded = await deps.loadInput(term, run);
      const baseline = await baselineMemo.get(ctxKey(`base:${stamp}`), async () => simulateRegistration({
        ...loaded.input, students: loaded.input.students.filter(student => student.wishes),
        offerings: buildSimulationOfferings(termId, loaded.schedules, loaded.courses).offerings, assessCapacity: true,
      }));
      const [catalog, sections] = await Promise.all([Repository.getCourses() as Promise<AdCourse[]>, Repository.getSections()]);
      const courseOf = new Map(catalog.map(course => [Number(course.AdCourseId), course] as const));
      const sectionName = new Map((sections as any[]).map(row => [`${Number(row.AdCollegeId)}:${Number(row.AdSectionId)}`, String(row.AdSectionName || "")] as const));
      const rows: RadarSuggestionRow[] = [];
      for (const row of asks.slice(0, RADAR_SUGGESTION_LIMIT)) {
        const got = await courseMemo.get(ctxKey(`${stamp}:${row.courseId}`), () => suggestForCourse(term, loaded, baseline, row));
        const course = courseOf.get(row.courseId);
        rows.push({ ...got, code: String(course?.CourseCode || ""), name: String(course?.CourseName || `مقرر ${row.courseId}`),
          sectionName: sectionName.get(`${row.collegeId}:${row.sectionId}`) || "" });
      }
      res.json({ ready: true, termId, ranAt: run.ranAt, stale: Boolean(run.stale), rows, more: Math.max(0, asks.length - RADAR_SUGGESTION_LIMIT) });
    } catch (error) {
      console.error("[simulation] suggestions:", error instanceof Error ? error.message : error);
      res.status(500).json({ error: "تعذّر بناء اقتراحات الرادار الآن. أعد المحاولة بعد قليل." });
    }
  });
}
