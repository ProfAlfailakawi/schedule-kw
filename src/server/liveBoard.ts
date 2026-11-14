/**
 * ── «يوم التسجيل الحي»: المسار ───────────────────────────────────────────────
 *
 * GET /api/simulation/live-board — لوحةُ شعبٍ مرتّبةٌ بالإلحاح لفصل الباب، من ثلاثة مصادر يملكها التطبيق
 * (أجوبةُ الطلبة «هل سجلت؟»، وطلباتُ الشعب في كشف التسجيل، ومحاكاةُ الرادار)، ولكلٍّ منها تاريخُه. لا ربطَ
 * بنظام التسجيل الرسمي ولا أرقامَ مسجَّلين من المسجّل لكل شعبة؛ وتقريرُ الطلب الفعلي المستورد طلبٌ لكل مقرر
 * لا تسجيلٌ فلا يدخل الامتلاء (وهذا مذكورٌ في docs/REGISTRATION_REHEARSAL.md).
 *
 * قراءةٌ فقط، وحارسُها حارسُ مسارات الرادار المجاورة: requireAuth ثم radarReader، ونطاقُ القارئ
 * (isPowerUser أو isScopeAllowed على كل شعبة) ومنتقي الكلية والقسم يضيّق ولا يوسّع. أعدادٌ لا أسماءَ
 * ولا معرّفاتِ طلبة. الفصلُ المجمَّد (غيرُ فصل الباب) لا لوحةَ له. و«اعتمد الشعبة» تحمل لكل بطاقةٍ
 * `canAdopt` من صلاحية الجدول (٧) ونطاقِ القسم، ويبقى الاعتمادُ نفسُه عبر apply-proposal بكل فحوصه.
 */
import type { Express, Request, RequestHandler, Response } from "express";
import { Repository } from "../db/repository";
import { createTtlMemo } from "./notificationCache";
import type { AdTerm, RegistrationRun } from "../types";
import { pickDoorTerm, readStudentPhase } from "../utils/termStudentPhases";
import { buildSimulationOfferings, type loadSimulationInput } from "./simulationData";
import { sectionKey } from "../utils/advisorSeats";
import { countsOf, type SectionRequest } from "../utils/sectionRequests";
import { formatScheduleTimeRange } from "../utils/scheduleTime";
import { buildLiveBoard, coursesNeedingAlternative, isRegistrationDay, type BoardCourseSignal, type BoardSectionInput, type LiveBoardPayload } from "../utils/liveBoard";
import type { RadarSuggestionRow, RadarSuggestionShared } from "./radarSuggestions";

type Loaded = Awaited<ReturnType<typeof loadSimulationInput>>;

export interface LiveBoardDeps {
  requireAuth: RequestHandler;
  radarReader: RequestHandler;
  isScopeAllowed: (req: any, collegeId: number, sectionId: number) => boolean;
  isPowerUser: (req: any) => boolean;
  loadInput: (term: AdTerm, run: RegistrationRun | null) => Promise<Loaded>;
  shared: RadarSuggestionShared;
}

/**
 * قراءاتُ اللوحة الثلاث الثقيلة (أجوبةُ الطلبة، ورصيدُ المقاعد، وطلباتُ الشعب) تُشارَك ثانيتين بين كل من يفتح اللوحة:
 * كلُّ جوابِ طالبٍ يوقظ كلَّ لوحةٍ مفتوحة، فبلا هذا تُقرأ المجموعاتُ نفسُها مرّةً لكل لوحةٍ في كل نبضة.
 * الثانيتان أقصرُ من تأخير الواجهة بعد النبضة، فلا تُرى نبضةٌ بقراءةٍ أقدم منها؛ ومفتاحُ الذاكرة يحمل عالَم الجلسة
 * التجريبية فلا يقرأ صندوقٌ ما كتبه آخر.
 */
export const LIVE_BOARD_READ_TTL_MS = 2_000;
const readMemo = createTtlMemo<unknown>({ ttlMs: LIVE_BOARD_READ_TTL_MS });
const shared2s = <T>(name: string, termId: number, load: () => Promise<T>): Promise<T> =>
  readMemo.get(`${Repository.currentDemoSessionId() || "real"}|${name}|${termId}`, load as () => Promise<unknown>) as Promise<T>;

/** أقصى مقرراتٍ يُقترح لها في الطلب الواحد (الأشدُّ إلحاحاً أولاً). */
export const LIVE_BOARD_SUGGESTION_LIMIT = 6;
/** أقصى شعبٍ في الطلب الواحد؛ والباقي يُقال عدده. */
export const LIVE_BOARD_ROW_LIMIT = 120;

export interface LiveBoardReply extends LiveBoardPayload {
  ready: true;
  termId: number;
  phase: { key: string; line: string; active: boolean };
  more: number;
  suggestions: Array<RadarSuggestionRow & { canAdopt: boolean }>;
}

export function registerLiveBoardRoutes(app: Express, deps: LiveBoardDeps): void {
  app.get("/api/simulation/live-board", deps.requireAuth, deps.radarReader, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const term = pickDoorTerm((await Repository.getTerms()) as any) as AdTerm | null;
    const asked = Number(req.query.termId) || 0;
    /* لوحةُ اليوم الحي لفصل الباب وحده؛ الفصلُ السابقُ المجمَّد يُقرأ في الرادار العادي. */
    if (!term || (asked && asked !== Number(term.AdTermId))) { res.json({ ready: false, reason: "other-term" }); return; }
    const termId = Number(term.AdTermId);
    const collegePick = Math.max(0, Number(req.query.collegeId) || 0), sectionPick = Math.max(0, Number(req.query.sectionId) || 0);
    const power = deps.isPowerUser(req);
    const mine = (collegeId: number, sectionId: number) => (power || deps.isScopeAllowed(req, collegeId, sectionId))
      && (!collegePick || collegeId === collegePick) && (!sectionPick || sectionId === sectionPick);
    try {
      const phase = readStudentPhase((term as any).AdTermStudentPhases);
      const run = await Repository.getRegistrationRun(termId);
      const loaded = await deps.loadInput(term, run);
      const baseline = run ? await deps.shared.baselineOf(term, run, loaded) : null;
      const seatOf = new Map((baseline?.seats || []).map(seat => [seat.offeringId, seat.taken] as const));
      const runRow = new Map((run?.courses || []).map(row => [row.courseId, row] as const));

      /* الشعب: من جدول الفصل نفسِه (مسوّدةً أو معتمداً) بنطاق القارئ. */
      const offerings = buildSimulationOfferings(termId, loaded.schedules, loaded.courses).offerings.filter(item => mine(item.collegeId, item.sectionId));
      const meeting = new Map<string, string>();
      for (const row of loaded.schedules as any[]) {
        if (Number(row.AdTermId) !== termId) continue;
        const key = `${termId}|${Number(row.AdCollegeId)}|${Number(row.AdSectionId)}|${Number(row.AdCourseId)}|${String(row.SCode || "").trim()}`;
        if (!meeting.has(key)) meeting.set(key, formatScheduleTimeRange(row.fstarttime, row.fendtime));
      }
      const ledgers = await shared2s("ledgers", termId, () => Repository.listFeatureDocs<{ id: string; adds?: Array<{ count?: number }> }>("advisorSeatLedgers", `${termId}:`).catch(() => []));
      const addedOf = new Map(ledgers.map(row => [row.id, (row.adds || []).reduce((sum, add) => sum + Math.max(0, Number(add.count) || 0), 0)] as const));
      const sections: BoardSectionInput[] = offerings.map(item => {
        const course = loaded.courses.get(item.courseId);
        return {
          key: item.id, courseId: item.courseId, collegeId: item.collegeId, sectionId: item.sectionId,
          code: String(course?.CourseCode || ""), name: String(course?.CourseName || `مقرر ${item.courseId}`), sectionCode: item.code,
          time: meeting.get(item.id) || "", capacity: item.capacity, simTaken: baseline ? (seatOf.get(item.id) ?? 0) : null,
          advisorAdded: addedOf.get(sectionKey(termId, item.courseId, item.code)) || 0,
        };
      });
      const courseIds = new Set(sections.map(item => item.courseId));

      /* أجوبةُ الطلبة (عدّاداتٌ مشاظِرة لكل مقرر، بلا أسماء) وتاريخُ آخر جواب. */
      const shards = await shared2s("outcome", termId, () => Repository.getRegistrationOutcome(termId));
      let reportsAt: string | null = null;
      const signal = new Map<number, BoardCourseSignal>();
      const get = (courseId: number): BoardCourseSignal => {
        let value = signal.get(courseId);
        if (!value) { value = { reportedRegistered: 0, reportedFull: 0, approved: 0, requestRegistered: 0, simWaiting: 0 }; signal.set(courseId, value); }
        return value;
      };
      let reportsPresent = false;
      for (const shard of shards) {
        if (shard.updatedAt && (!reportsAt || shard.updatedAt > reportsAt)) reportsAt = shard.updatedAt;
        for (const [id, row] of Object.entries(shard.byCourse || {})) {
          if (!courseIds.has(Number(id))) continue;
          const registered = Math.max(0, Number(row.registered) || 0), full = Math.max(0, Number(row.full) || 0);
          if (registered || full) reportsPresent = true;
          const target = get(Number(id)); target.reportedRegistered += registered; target.reportedFull += full;
        }
      }

      /* طلباتُ الشعب (من اعتُمد ومن علّمه التسجيل «سُجّل»): عدداً لكل مقرر. */
      const requests = await shared2s("requests", termId, () => Repository.listFeatureDocs<SectionRequest>("sectionRequests", `${termId}:`).catch(() => [] as SectionRequest[]));
      let requestsAt: string | null = null, requestsPresent = false;
      for (const request of requests) {
        if (request.closed || !courseIds.has(Number(request.courseId))) continue;
        const counts = countsOf(request);
        if (!counts.approved) continue;
        requestsPresent = true;
        if (request.updatedAt && (!requestsAt || request.updatedAt > requestsAt)) requestsAt = request.updatedAt;
        const target = get(Number(request.courseId)); target.approved += counts.approved; target.requestRegistered += counts.registered;
      }
      for (const courseId of courseIds) {
        const row = runRow.get(courseId);
        if (row) get(courseId).simWaiting = row.unmet.full + row.unmet["not-offered"];
      }

      const board = buildLiveBoard({
        sections, courses: signal, now: Date.now(), roundActive: isRegistrationDay(phase.key),
        stamps: [
          { source: "reports", asOf: reportsAt, present: reportsPresent },
          { source: "requests", asOf: requestsAt, present: requestsPresent },
          { source: "simulation", asOf: run?.ranAt || null, present: Boolean(run) },
        ],
      });

      /* البديلُ الجاهز للأشدّ إلحاحاً: المحرّكُ نفسُه والذاكرةُ نفسُها (radarSuggestions). */
      const suggestions: LiveBoardReply["suggestions"] = [];
      if (run && baseline) {
        const [catalog, sectionRows, granted] = await Promise.all([Repository.getCourses(), Repository.getSections(), grantedOf(req)]);
        const courseOf = new Map((catalog as any[]).map(course => [Number(course.AdCourseId), course] as const));
        const sectionName = new Map((sectionRows as any[]).map(row => [`${Number(row.AdCollegeId)}:${Number(row.AdSectionId)}`, String(row.AdSectionName || "")] as const));
        const writer = power || granted.includes(7);
        for (const courseId of coursesNeedingAlternative(board.rows, LIVE_BOARD_SUGGESTION_LIMIT)) {
          const anchor = board.rows.find(row => row.courseId === courseId);
          const base = runRow.get(courseId);
          if (!anchor) continue;
          const waiting = anchor.waiting;
          /* صفُّ الرادار نفسُه، مرفوعاً إلى ما قاله الطلبةُ حين يزيد: المحرّك يقيس المنتظرين من المحاكاة. */
          const synth = base
            ? { ...base, unmet: { ...base.unmet, full: Math.max(base.unmet.full, waiting) } }
            : { courseId, collegeId: anchor.collegeId, sectionId: anchor.sectionId, sections: 0, capacity: 0, taken: 0, wanted: waiting, seated: 0,
              unmet: { "not-offered": 0, conflict: 0, full: waiting, prereq: 0, units: 0 } };
          const got = await deps.shared.suggestionFor(term, run, loaded, baseline, synth, `:live:${waiting}`);
          const course = courseOf.get(courseId);
          suggestions.push({
            ...got, code: String(course?.CourseCode || ""), name: String(course?.CourseName || `مقرر ${courseId}`),
            sectionName: sectionName.get(`${anchor.collegeId}:${anchor.sectionId}`) || "",
            canAdopt: writer && (power || deps.isScopeAllowed(req, anchor.collegeId, anchor.sectionId)),
          });
        }
      }
      const rows = board.rows.slice(0, LIVE_BOARD_ROW_LIMIT);
      const reply: LiveBoardReply = {
        ready: true, termId, header: board.header, counts: board.counts, rows,
        phase: { key: phase.key, line: phase.line, active: isRegistrationDay(phase.key) },
        more: Math.max(0, board.rows.length - rows.length), suggestions,
      };
      res.json(reply);
    } catch (error) {
      console.error("[simulation] live-board:", error instanceof Error ? error.message : error);
      res.status(500).json({ error: "تعذّر بناء لوحة يوم التسجيل الآن. أعد المحاولة بعد قليل." });
    }
  });
}

async function grantedOf(req: any): Promise<number[]> {
  if (req.permissions) return req.permissions;
  return req.user ? (await Repository.getSecurityByUser(req.user.SystemUserId)).map((item: any) => Number(item.FormNameId)) : [];
}
