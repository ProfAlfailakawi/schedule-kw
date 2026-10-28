/**
 * ── آلة الزمن ومحاكي الشعب: مسارات الخادم ──────────────────────────────────
 *
 * القراءةُ والمحاكاةُ لكل من يقرأ الجدول بحدود نطاقه (رئيس القسم والعميد يريان
 * ويحاكيان). الحفظُ والاعتمادُ والاستعادةُ لمن يكتب الجدول وحده (إذن 7 وصفةٌ غير
 * قارئة) — والحارسُ هنا في الخادم، لا في إخفاء زرّ.
 *
 * والاعتمادُ لا يكتب من باب جانبي: كلُّ خطوةٍ تمرّ فحصاً جافّاً في معالجَي الحفظ
 * نفسيهما (createScheduleHandler / updateScheduleHandler) على «الأسبوع كما سيصير»،
 * ثم تُكتب الخطواتُ كلُّها في معاملةٍ واحدة تعيد فحص الإصدارات والتعارض على الفصل
 * الحيّ (Repository.commitTimeMachinePlan). ثم سجلُّ النسخة ودورةُ الاعتماد كما
 * بعد أيّ تعديل (noteScheduleMutation): التوقيعُ الرسميّ يبقى في مساره.
 */
import type { Express, Request, RequestHandler, Response } from "express";
import { randomUUID } from "crypto";
import { Repository } from "../db/repository";
import type { AdCourse, AdInstructor, FSchedule } from "../types";
import {
  applyChanges, driftOf, planOperations, touchedRowIds,
  type TmChange, type TmContext, type TmHall, type TmHistoryEntry, type TmScenarioRecord,
} from "../utils/timeMachine";
import { createTtlMemo } from "./notificationCache";
import { evaluateScheduleChange, loadSimulationInput } from "./simulationData";
import { pickDoorTerm } from "../utils/termStudentPhases";
import { placeholderInstructorIds } from "../utils/instructorIdentity";

interface InnerResult { status: number; body: any; headers: Record<string, string> }

export interface TimeMachineDeps {
  requireRead: RequestHandler;
  requireWrite: RequestHandler;
  isScopeAllowed: (req: any, collegeId: number, sectionId: number) => boolean;
  isPowerUser: (req: any) => boolean;
  /** يكتب الجدول فعلاً: إذن 7 وصفةٌ ليست للقراءة وحدها. */
  canWrite: (req: any) => Promise<boolean>;
  actor: (req: any) => { name: string; role: string };
  resolveScope: (req: any, collegeId: number, sectionId: number, termId: number) => Promise<{ collegeId: number; sectionId: number; termId: number }>;
  /** صفوفُ النطاق كما يراها القارئ (العميد يرى النسخة المقبولة). */
  readScopeRows: (req: any, collegeId: number, sectionId: number, termId: number) => Promise<FSchedule[]>;
  hallsFor: (collegeId: number, sectionId: number, termId: number) => Promise<TmHall[]>;
  instructorsFor: (collegeId: number, sectionId: number, termId: number) => Promise<AdInstructor[]>;
  coursesFor: (sectionId: number) => Promise<AdCourse[]>;
  loadLimits: (instructors: AdInstructor[]) => Promise<Record<string, number>>;
  termFrozen: (termId: number) => Promise<string | null>;
  dryRunUpdate: (req: any, rowId: number, body: any, week: FSchedule[]) => Promise<InnerResult>;
  dryRunCreate: (req: any, body: any, week: FSchedule[]) => Promise<InnerResult>;
  lockRefusal: (req: any, collegeId: number, sectionId: number, termId: number) => Promise<string | null>;
  captureVersion: (req: any, collegeId: number, sectionId: number, termId: number, label: string) => Promise<any>;
  recordVersionAfter: (version: any, after: (before: any[]) => any[]) => Promise<void>;
  noteMutation: (req: any, collegeId: number, sectionId: number, termId: number, change: { kind: "add" | "edit" | "delete"; rows?: any[] }) => Promise<void>;
  normalizer: () => Promise<(row: FSchedule) => FSchedule>;
  lengthIssue: (row: any, week: FSchedule[]) => Promise<string | null>;
  dataContextKey?: (key: string | number) => string;
}

const inputMemo = createTtlMemo<Awaited<ReturnType<typeof loadSimulationInput>>>({ ttlMs: 60_000 });
const MAX_CHANGES = 80;

/** حقولُ الصفّ كما يطلبها مسارُ الحفظ (المصدر: rowBodyOf في server.ts). */
const rowBodyOf = (row: any) => ({
  AdCollegeId: row.AdCollegeId, AdSectionId: row.AdSectionId, AdTermId: row.AdTermId, AdCourseId: row.AdCourseId,
  SCode: row.SCode, AdInstructorId: row.AdInstructorId,
  fsunday: !!row.fsunday, fmonday: !!row.fmonday, ftuesday: !!row.ftuesday, fwednesday: !!row.fwednesday, fthursday: !!row.fthursday,
  fstarttime: row.fstarttime, fendtime: row.fendtime,
  AdRoomCode: row.AdRoomCode, AdRoomHall: row.AdRoomHall,
  buildingId: row.buildingId, roomId: row.roomId, locationStatus: row.locationStatus,
  sourceBuildingText: row.sourceBuildingText, sourceRoomText: row.sourceRoomText,
  companionRoomId: row.companionRoomId, companionRoomLabel: row.companionRoomLabel,
});

/** بقيةُ الفصل بلا هوية: وقتٌ وقاعة، والأستاذُ يبقى فقط إن كان من أساتذة النطاق. */
export function maskOutside(rows: FSchedule[], keepInstructors: Set<number>): FSchedule[] {
  return rows.map((row, index) => ({
    id: Number(row.id),
    AdCollegeId: 0, AdSectionId: 0, AdTermId: Number(row.AdTermId),
    AdCourseId: -(index + 1), AdCourseName: "موعد قسمٍ آخر", SCode: `x${index + 1}`,
    AdInstructorId: keepInstructors.has(Number(row.AdInstructorId)) ? Number(row.AdInstructorId) : -(1_000_000 + index),
    fsunday: !!row.fsunday, fmonday: !!row.fmonday, ftuesday: !!row.ftuesday, fwednesday: !!row.fwednesday, fthursday: !!row.fthursday,
    fstarttime: row.fstarttime, fendtime: row.fendtime,
    AdRoomCode: row.AdRoomCode, AdRoomHall: row.AdRoomHall, buildingId: row.buildingId, roomId: row.roomId,
    companionRoomId: row.companionRoomId, locationStatus: row.locationStatus,
  } as FSchedule));
}

function sanitizeChanges(raw: unknown): TmChange[] {
  const list = Array.isArray(raw) ? raw.slice(0, MAX_CHANGES) : [];
  const days = new Set(["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"]);
  const clock = (value: unknown) => (/^\d{2}:\d{2}$/.test(String(value || "")) ? String(value) : undefined);
  const text = (value: unknown, max = 160) => String(value ?? "").slice(0, max);
  const out: TmChange[] = [];
  for (const item of list as any[]) {
    const base = { id: text(item?.id, 40) || randomUUID(), label: text(item?.label), why: item?.why ? text(item.why) : undefined, cause: item?.cause ? text(item.cause, 40) : undefined };
    if (item?.op === "remove") out.push({ ...base, op: "remove", rowIds: (Array.isArray(item.rowIds) ? item.rowIds : []).map(Number).filter((n: number) => n > 0).slice(0, 12) });
    else if (item?.op === "assign") out.push({ ...base, op: "assign", rowIds: (Array.isArray(item.rowIds) ? item.rowIds : []).map(Number).filter((n: number) => n > 0).slice(0, 12), instructorId: Number(item.instructorId) || 0 });
    else if (item?.op === "move") out.push({ ...base, op: "move", rowId: Number(item.rowId) || 0,
      days: Array.isArray(item.days) ? item.days.filter((d: string) => days.has(d)) : undefined,
      start: clock(item.start), end: clock(item.end),
      hall: item.hall ? { code: text(item.hall.code, 40), hall: text(item.hall.hall, 40), buildingId: item.hall.buildingId ? text(item.hall.buildingId, 80) : undefined, roomId: item.hall.roomId ? text(item.hall.roomId, 80) : undefined } : undefined });
    else if (item?.op === "add") out.push({ ...base, op: "add", rows: (Array.isArray(item.rows) ? item.rows : []).slice(0, 4).map((row: any, i: number) => ({
      id: Number(row?.id) < 0 ? Number(row.id) : -(i + 1),
      AdCollegeId: Number(row?.AdCollegeId), AdSectionId: Number(row?.AdSectionId), AdTermId: Number(row?.AdTermId), AdCourseId: Number(row?.AdCourseId),
      AdCourseName: text(row?.AdCourseName), SCode: text(row?.SCode, 10), AdInstructorId: Number(row?.AdInstructorId),
      fsunday: !!row?.fsunday, fmonday: !!row?.fmonday, ftuesday: !!row?.ftuesday, fwednesday: !!row?.fwednesday, fthursday: !!row?.fthursday,
      fstarttime: clock(row?.fstarttime) || "", fendtime: clock(row?.fendtime) || "",
      AdRoomCode: text(row?.AdRoomCode, 40), AdRoomHall: text(row?.AdRoomHall, 40), buildingId: row?.buildingId ? text(row.buildingId, 80) : undefined,
      roomId: row?.roomId ? text(row.roomId, 80) : undefined, locationStatus: "VERIFIED",
    } as FSchedule)) });
  }
  return out;
}

export function registerTimeMachineRoutes(app: Express, deps: TimeMachineDeps): void {
  const fail = (res: Response, status: number, error: string, extra: Record<string, unknown> = {}) => res.status(status).json({ error, ...extra });
  const scopeOfQuery = (req: Request) => ({ collegeId: Number(req.query.collegeId || req.body?.collegeId || 0), sectionId: Number(req.query.sectionId || req.body?.sectionId || 0), termId: Number(req.query.termId || req.body?.termId || 0) });
  const history = (req: Request, action: TmHistoryEntry["action"], note?: string): TmHistoryEntry => {
    const who = deps.actor(req);
    return { at: new Date().toISOString(), by: who.name, role: who.role, action, ...(note ? { note } : {}) };
  };

  /** كل ما يحتاجه المحاكي لفصلٍ ونطاق، بلا أسماءٍ من خارج النطاق. */
  async function buildContext(req: Request, collegeId: number, sectionId: number, termId: number): Promise<TmContext & { live: FSchedule[] }> {
    const [rows, termRows, courses, instructors, halls, run, terms, sections] = await Promise.all([
      deps.readScopeRows(req, collegeId, sectionId, termId),
      Repository.getSchedulesByScope({ termId }),
      deps.coursesFor(sectionId),
      deps.instructorsFor(collegeId, sectionId, termId),
      deps.hallsFor(collegeId, sectionId, termId),
      Repository.getRegistrationRun(termId),
      Repository.getTerms(),
      Repository.getSections(),
    ]);
    const scopeIds = new Set(rows.map(row => Number(row.id)));
    const teacherIds = new Set(rows.map(row => Number(row.AdInstructorId)));
    instructors.forEach(person => teacherIds.add(Number(person.AdInstructorId)));
    const outsideRaw = termRows.filter(row => !scopeIds.has(Number(row.id)) && !(Number(row.AdCollegeId) === collegeId && Number(row.AdSectionId) === sectionId));
    const courseIds = new Set(courses.map(course => Number(course.AdCourseId)));
    const demand = run && Array.isArray(run.courses)
      ? Object.fromEntries(run.courses.filter(item => courseIds.has(Number(item.courseId)) && Number(item.sectionId) === sectionId)
        .map(item => [String(item.courseId), { wanted: Number(item.wanted || 0), seated: Number(item.seated || 0), capacity: Number(item.capacity || 0), sections: Number(item.sections || 0) }]))
      : null;
    const term = terms.find(item => Number(item.AdTermId) === termId);
    const section = sections.find(item => Number(item.AdSectionId) === sectionId);
    return {
      scope: { collegeId, sectionId, termId, sectionName: String(section?.AdSectionName || ""), termName: String((term as any)?.AdTermName || "") },
      rows, outside: maskOutside(outsideRaw, teacherIds), courses, instructors, halls,
      demand: demand && Object.keys(demand).length ? demand : null,
      loadLimits: await deps.loadLimits(instructors),
      canWrite: await deps.canWrite(req),
      live: termRows,
    };
  }

  app.get("/api/time-machine/context", deps.requireRead, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const asked = scopeOfQuery(req);
    const scope = await deps.resolveScope(req, asked.collegeId, asked.sectionId, asked.termId);
    if (!scope.collegeId || !scope.sectionId || !scope.termId) { fail(res, 400, "اختر القسم والفصل أولاً.", { code: "scope" }); return; }
    if (!deps.isScopeAllowed(req, scope.collegeId, scope.sectionId)) { fail(res, 403, "خارج نطاق صلاحياتك."); return; }
    const { live, ...context } = await buildContext(req, scope.collegeId, scope.sectionId, scope.termId);
    void live;
    const frozen = await deps.termFrozen(scope.termId);
    res.json({ ...context, canWrite: context.canWrite && !frozen, frozen });
  });

  /* ── أثرُ السيناريو على الطلبة (مساري/الرادار): أعدادٌ لا أسماء، ولا كتابة. ── */
  app.post("/api/time-machine/students", deps.requireRead, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const { collegeId, sectionId, termId } = scopeOfQuery(req);
    if (!deps.isScopeAllowed(req, collegeId, sectionId)) { fail(res, 403, "خارج نطاق صلاحياتك."); return; }
    const terms = await Repository.getTerms();
    const door = pickDoorTerm(terms as any);
    if (!door || Number(door.AdTermId) !== termId) { res.json({ ok: true, available: false, reason: "الأثر على الطلبة يُقاس لفصل الرادار وحده." }); return; }
    const changes = sanitizeChanges(req.body?.changes);
    try {
      const run = await Repository.getRegistrationRun(termId);
      const key = `${termId}:${run?.staleAt || ""}:${run?.ranAt || ""}`;
      const loaded = await inputMemo.get(deps.dataContextKey ? deps.dataContextKey(key) : key,
        () => loadSimulationInput(door, Math.max(1, door.AdTermStudentPhases?.rounds?.length || 2)));
      const rows = loaded.schedules as FSchedule[];
      const scopeIds = new Set(rows.filter(row => Number(row.AdCollegeId) === collegeId && Number(row.AdSectionId) === sectionId).map(row => Number(row.id)));
      /* لا يمسّ السيناريو إلا صفوف نطاقه: تغييرٌ يشير إلى صفٍّ خارجه يُسقط. */
      const own = changes.filter(change => change.op === "add"
        ? change.rows.every(row => Number(row.AdCollegeId) === collegeId && Number(row.AdSectionId) === sectionId)
        : (change.op === "move" ? [change.rowId] : change.rowIds).every(id => scopeIds.has(Number(id))));
      const revised = applyChanges(rows, own).map((row, index) => (Number(row.id) < 0 ? { ...row, id: 9_000_000 + index } : row));
      const impact = evaluateScheduleChange(loaded.input, rows, loaded.courses, termId, revised, own.length, [{ collegeId, sectionId }], deps.isPowerUser(req));
      res.json({ ok: true, available: true, impact, stale: Boolean(run?.stale) });
    } catch (error) {
      console.error("[time-machine] students:", error instanceof Error ? error.message : error);
      res.json({ ok: true, available: false, reason: "تعذّر قياس الأثر على الطلبة الآن." });
    }
  });

  /* ── السيناريوهات ───────────────────────────────────────────────────────── */
  app.get("/api/time-machine/scenarios", deps.requireRead, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const { collegeId, sectionId, termId } = scopeOfQuery(req);
    if (!deps.isScopeAllowed(req, collegeId, sectionId)) { fail(res, 403, "خارج نطاق صلاحياتك."); return; }
    const writer = await deps.canWrite(req);
    const list = await Repository.getTimeMachineScenarios(termId, collegeId, sectionId);
    /* من لا يكتب الجدول (رئيس القسم، العميد) يرى ما شورك معه وحده، للعرض. */
    res.json({ scenarios: writer ? list : list.filter(item => item.shared), canWrite: writer });
  });

  const loadOwned = async (req: Request, res: Response): Promise<TmScenarioRecord | null> => {
    const scenario = await Repository.getTimeMachineScenario(String(req.params.id || ""));
    if (!scenario) { fail(res, 404, "لا يوجد سيناريو بهذا المعرّف."); return null; }
    if (!deps.isScopeAllowed(req, scenario.collegeId, scenario.sectionId)) { fail(res, 403, "خارج نطاق صلاحياتك."); return null; }
    if (!(await deps.canWrite(req))) { fail(res, 403, "العرض والمحاكاة متاحان لك؛ الحفظ والاعتماد لمن يكتب الجدول."); return null; }
    return scenario;
  };

  app.post("/api/time-machine/scenarios", deps.requireWrite, async (req: Request, res: Response) => {
    const { collegeId, sectionId, termId } = scopeOfQuery(req);
    if (!collegeId || !sectionId || !termId) { fail(res, 400, "اختر القسم والفصل أولاً."); return; }
    if (!deps.isScopeAllowed(req, collegeId, sectionId)) { fail(res, 403, "خارج نطاق صلاحياتك."); return; }
    if (!(await deps.canWrite(req))) { fail(res, 403, "العرض والمحاكاة متاحان لك؛ الحفظ لمن يكتب الجدول."); return; }
    const id = String(req.body?.id || "");
    const existing = id ? await Repository.getTimeMachineScenario(id) : undefined;
    if (existing && (existing.collegeId !== collegeId || existing.sectionId !== sectionId || existing.termId !== termId)) { fail(res, 409, "السيناريو لنطاقٍ آخر."); return; }
    if (existing && existing.status === "applied") { fail(res, 409, "اعتُمد هذا السيناريو؛ انسخه لتعدّل عليه.", { code: "applied" }); return; }
    const changes = sanitizeChanges(req.body?.changes);
    const live = await Repository.getSchedulesByScope({ collegeId, sectionId, termId });
    const liveIds = new Set(live.map(row => Number(row.id)));
    if (touchedRowIds(changes).some(rowId => !liveIds.has(rowId))) { fail(res, 409, "يشير السيناريو إلى مواعيد خارج نطاقه أو لم تعد موجودة.", { code: "stale" }); return; }
    const base = Object.fromEntries(touchedRowIds(changes).map(rowId => {
      const kept = existing?.base?.[String(rowId)];
      return [String(rowId), kept !== undefined ? kept : Number(live.find(row => Number(row.id) === rowId)?.rev || 0)];
    }));
    const now = new Date().toISOString();
    const record: TmScenarioRecord = {
      id: existing?.id || randomUUID(),
      name: String(req.body?.name || existing?.name || "سيناريو").slice(0, 80),
      mode: (["emergency", "lab", "goal", "sections"].includes(req.body?.mode) ? req.body.mode : existing?.mode || "lab"),
      collegeId, sectionId, termId,
      problem: req.body?.problem ? String(req.body.problem).slice(0, 200) : existing?.problem,
      changes, base, status: "draft",
      shared: Boolean(existing?.shared),
      createdBy: existing?.createdBy || deps.actor(req).name,
      createdAt: existing?.createdAt || now, updatedAt: now,
      revision: Number(existing?.revision || 0),
      history: [...(existing?.history || []), history(req, existing ? "saved" : "created")].slice(-40),
    };
    try {
      const saved = await Repository.saveTimeMachineScenario(record, existing ? Number(req.body?.revision ?? existing.revision) : undefined);
      res.json({ scenario: saved });
    } catch (error: any) { fail(res, 409, error?.message || "تعذّر الحفظ.", { code: "revision" }); }
  });

  app.post("/api/time-machine/scenarios/:id/copy", deps.requireWrite, async (req: Request, res: Response) => {
    const scenario = await loadOwned(req, res);
    if (!scenario) return;
    const live = await Repository.getSchedulesByScope({ collegeId: scenario.collegeId, sectionId: scenario.sectionId, termId: scenario.termId });
    const byId = new Map(live.map(row => [Number(row.id), row]));
    const now = new Date().toISOString();
    const copy: TmScenarioRecord = {
      ...scenario, id: randomUUID(), name: `${scenario.name} (نسخة)`.slice(0, 80), status: "draft", shared: false, restorePoint: undefined,
      /* النسخة تُبنى على الجدول كما هو الآن. */
      base: Object.fromEntries(touchedRowIds(scenario.changes).map(rowId => [String(rowId), Number(byId.get(rowId)?.rev || 0)])),
      createdBy: deps.actor(req).name, createdAt: now, updatedAt: now, revision: 0, history: [history(req, "copied", scenario.name)],
    };
    res.json({ scenario: await Repository.saveTimeMachineScenario(copy) });
  });

  app.post("/api/time-machine/scenarios/:id/share", deps.requireWrite, async (req: Request, res: Response) => {
    const scenario = await loadOwned(req, res);
    if (!scenario) return;
    const shared = req.body?.shared !== false;
    const saved = await Repository.saveTimeMachineScenario({ ...scenario, shared, history: [...scenario.history, history(req, "shared", shared ? "للعرض" : "إيقاف")].slice(-40) });
    res.json({ scenario: saved });
  });

  app.delete("/api/time-machine/scenarios/:id", deps.requireWrite, async (req: Request, res: Response) => {
    const scenario = await loadOwned(req, res);
    if (!scenario) return;
    if (scenario.status === "applied") { fail(res, 409, "سيناريو معتمد له نقطة استعادة؛ لا يُحذف قبل الاستعادة أو انتهاء الفصل."); return; }
    await Repository.deleteTimeMachineScenario(scenario.id);
    res.json({ ok: true });
  });

  /**
   * ── تنفيذ خطة: اعتمادٌ أو استعادة ──────────────────────────────────────────
   * 1) قفلُ الفصل نفسه الذي يقف عليه تثبيتُ رغبات الأساتذة (`term-<id>`).
   * 2) فحصٌ جافّ لكل خطوة بمعالجَي الحفظ على الأسبوع النهائي.
   * 3) معاملةٌ واحدة: الإصدارات، الحجوز، الاستعارة، التعارض — ثم الكتابة كلها.
   */
  async function executePlan(req: Request, res: Response, scenario: TmScenarioRecord, kind: "apply" | "restore"): Promise<void> {
    const termId = scenario.termId;
    const frozen = await deps.termFrozen(termId);
    if (frozen) { fail(res, 409, frozen, { code: "term-frozen" }); return; }
    const lock = `term-${termId}`, holder = randomUUID();
    if (!(await Repository.acquireScheduleApplyLease(lock, holder))) { fail(res, 409, "يجري الآن اعتمادٌ آخر في هذا الفصل. أعد المحاولة بعد لحظة.", { code: "apply-busy" }); return; }
    try {
      const live = await Repository.getSchedulesByScope({ termId });
      const liveById = new Map(live.map(row => [Number(row.id), row]));
      type Op = { kind: "update"; rowId: number; body: any; expectedRev: number } | { kind: "create"; body: any; fixedId?: number; tempId: number } | { kind: "delete"; rowId: number; expectedRev: number };
      const ops: Op[] = [];
      if (kind === "apply") {
        const drift = driftOf(live, scenario.base);
        if (drift.length) { fail(res, 409, "تغيّر الجدول الحيّ بعد بناء السيناريو. أعد فحصه قبل الاعتماد.", { code: "drift", drift }); return; }
        for (const op of planOperations(live, scenario.changes, scenario.base)) {
          if (op.kind === "update") ops.push({ kind: "update", rowId: op.rowId, body: { ...rowBodyOf({ ...liveById.get(op.rowId), ...op.fields }), rev: op.expectedRev }, expectedRev: op.expectedRev });
          else if (op.kind === "delete") ops.push(op);
          else { const { id: _drop, rev: _rev, ...body } = op.row as any; ops.push({ kind: "create", body: rowBodyOf(body), tempId: op.tempId }); }
        }
      } else {
        const point = scenario.restorePoint;
        if (!point) { fail(res, 409, "لا نقطة استعادة لهذا السيناريو."); return; }
        for (const id of point.createdIds) ops.push({ kind: "delete", rowId: id, expectedRev: Number(point.afterRevs[String(id)] ?? 1) });
        for (const row of point.before) {
          const now = liveById.get(Number(row.id));
          if (now) ops.push({ kind: "update", rowId: Number(row.id), body: { ...rowBodyOf(row), rev: Number(point.afterRevs[String(row.id)] ?? now.rev) }, expectedRev: Number(point.afterRevs[String(row.id)] ?? -1) });
          else ops.push({ kind: "create", body: rowBodyOf(row), fixedId: Number(row.id), tempId: -Number(row.id) });
        }
      }
      if (!ops.length) { fail(res, 400, "لا تغيير يُكتب في هذا السيناريو."); return; }

      /* الأسبوعُ كما سيصير. */
      const removed = new Set(ops.filter(op => op.kind === "delete").map(op => (op as any).rowId));
      const updates = new Map(ops.filter(op => op.kind === "update").map(op => [(op as any).rowId, op] as const));
      const created = ops.filter(op => op.kind === "create") as Array<Extract<Op, { kind: "create" }>>;
      const finalWeek: FSchedule[] = [
        ...live.filter(row => !removed.has(Number(row.id))).map(row => { const op: any = updates.get(Number(row.id)); return op ? { ...row, ...op.body } : row; }),
        ...created.map(op => ({ ...op.body, id: op.tempId } as FSchedule)),
      ];
      const scopes = new Map<string, { collegeId: number; sectionId: number }>();
      for (const op of ops) {
        const row: any = op.kind === "create" ? op.body : liveById.get(op.rowId);
        if (!row) { fail(res, 409, "أحد المواعيد لم يعد موجوداً.", { code: "stale" }); return; }
        if (!deps.isScopeAllowed(req, Number(row.AdCollegeId), Number(row.AdSectionId))
          || Number(row.AdCollegeId) !== scenario.collegeId || Number(row.AdSectionId) !== scenario.sectionId) { fail(res, 403, "خطوةٌ خارج نطاق السيناريو."); return; }
        scopes.set(`${row.AdCollegeId}:${row.AdSectionId}`, { collegeId: Number(row.AdCollegeId), sectionId: Number(row.AdSectionId) });
      }
      for (let i = 0; i < ops.length; i += 1) {
        const op = ops[i];
        if (op.kind === "delete") {
          const row = liveById.get(op.rowId)!;
          const refusal = await deps.lockRefusal(req, Number(row.AdCollegeId), Number(row.AdSectionId), termId);
          if (refusal) { fail(res, 409, refusal, { code: "schedule-locked", step: i }); return; }
          continue;
        }
        const dry = op.kind === "update"
          ? await deps.dryRunUpdate(req, op.rowId, op.body, finalWeek)
          : await deps.dryRunCreate(req, op.body, finalWeek.filter(row => Number(row.id) !== op.tempId));
        if (dry.status >= 400) {
          res.status(dry.status).json({ ...(dry.body && typeof dry.body === "object" ? dry.body : { error: "تعذّر الاعتماد." }), step: i, applied: [], reverted: true });
          return;
        }
        if (dry.body?.row) op.body = { ...op.body, ...dry.body.row };
        delete op.body.id; delete op.body.rev;
      }

      const versions = new Map<string, any>();
      for (const [key, scope] of scopes) versions.set(key, await deps.captureVersion(req, scope.collegeId, scope.sectionId, termId, kind === "apply" ? `قبل اعتماد سيناريو «${scenario.name}»` : `قبل استعادة ما قبل «${scenario.name}»`));
      const normalize = await deps.normalizer();
      const placeholders = placeholderInstructorIds(await Repository.getInstructors());
      let committed: Awaited<ReturnType<typeof Repository.commitTimeMachinePlan>>;
      try {
        committed = await Repository.commitTimeMachinePlan(termId, scenario.id, scenario.revision,
          ops.map(op => op.kind === "create" ? { kind: "create" as const, body: op.body, fixedId: op.fixedId } : op),
          (result, current) => kind === "apply"
            ? { ...current, status: "applied", restorePoint: {
                at: new Date().toISOString(), before: result.before, createdIds: result.createdIds,
                afterRevs: Object.fromEntries(result.rows.map(row => [String(row.id), Number(row.rev || 0)])),
              }, history: [...current.history, history(req, "applied", `${ops.length} خطوة`)].slice(-40) }
            : { ...current, status: "restored", restorePoint: undefined, history: [...current.history, history(req, "restored")].slice(-40) },
          normalize, placeholders,
          async (rows, week) => { for (const row of rows) { const issue = await deps.lengthIssue(row, week); if (issue) throw new Error(issue); } });
      } catch (error: any) {
        const revision = error?.name === "ScheduleRevisionConflict";
        fail(res, 409, revision ? (kind === "apply" ? "تغيّر أحد المواعيد أثناء الاعتماد؛ لم يُكتب شيء." : "عُدّل أحد المواعيد بعد الاعتماد؛ الاستعادة الآلية تكتب فوقه فرُفضت. لم يُكتب شيء.")
          : (error?.message || "تعذّر الاعتماد. لم يُكتب شيء."), { code: revision ? "revision" : "commit-failed", applied: [], reverted: true });
        return;
      }
      for (const [key, scope] of scopes) {
        try {
          const touched = new Set([...ops.filter(op => op.kind !== "create").map(op => Number((op as any).rowId)), ...committed.rows.map(row => Number(row.id))]);
          await deps.recordVersionAfter(versions.get(key), before => [...before.filter((row: any) => !touched.has(Number(row.id))),
            ...committed.rows.filter(row => Number(row.AdCollegeId) === scope.collegeId && Number(row.AdSectionId) === scope.sectionId)]);
          await deps.noteMutation(req, scope.collegeId, scope.sectionId, termId, { kind: "edit", rows: committed.rows });
        } catch { /* الكتابة تمّت ذرّياً؛ السجلّ الجانبي لا يُبطلها */ }
      }
      res.locals.auditChanges = `${kind === "apply" ? "اعتماد" : "استعادة"} سيناريو آلة الزمن «${scenario.name}»: ${ops.length} خطوة`;
      res.locals.auditRowIds = [...committed.rows.map(row => row.id), ...committed.deletedIds];
      res.json({ ok: true, scenario: committed.scenario, rows: committed.rows, deletedIds: committed.deletedIds });
    } finally {
      await Repository.releaseScheduleApplyLease(lock, holder).catch(() => undefined);
    }
  }

  app.post("/api/time-machine/scenarios/:id/apply", deps.requireWrite, async (req: Request, res: Response) => {
    const scenario = await loadOwned(req, res);
    if (!scenario) return;
    if (scenario.status === "applied") { fail(res, 409, "اعتُمد هذا السيناريو من قبل.", { code: "applied" }); return; }
    if (req.body?.revision !== undefined && Number(req.body.revision) !== Number(scenario.revision)) { fail(res, 409, "تغيّر السيناريو. أعد فتحه.", { code: "revision" }); return; }
    await executePlan(req, res, scenario, "apply");
  });

  app.post("/api/time-machine/scenarios/:id/restore", deps.requireWrite, async (req: Request, res: Response) => {
    const scenario = await loadOwned(req, res);
    if (!scenario) return;
    if (scenario.status !== "applied") { fail(res, 409, "لا نقطة استعادة: السيناريو غير معتمد.", { code: "not-applied" }); return; }
    await executePlan(req, res, scenario, "restore");
  });
}
