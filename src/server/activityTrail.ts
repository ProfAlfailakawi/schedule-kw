/**
 * ── «👣 الأثر» على الخادم: يُكتب بعد كل كتابةٍ ناجحة، ويُقرأ بقرار المالك ──────────
 *
 *   الوسيط   activityTrailRecorder   بعد كل طلبٍ ناجح على مسارٍ من TRAIL_ROUTES (src/utils/activityTrail.ts)
 *                                    يكتب سطراً واحداً: من، أيُّ فريق، أيُّ نطاق، ماذا، على ماذا، قبل ← بعد.
 *   GET  /api/activity-trail          ما يحقّ للقارئ رؤيتُه في الفصل الجاري والسابق، بمرشّحَي الشخص والنوع.
 *   GET  /api/activity-trail/stamp/:rowId   بصمةُ «آخر تعديل» على موعدٍ في الجدول.
 *   غيرُ GET على /api/activity-trail  ← 405: السجلُّ لا يُعدَّل ولا يُحذف، ولا لمدير النظام.
 *
 * والمعالجاتُ تقول ما لا يقوله المسار بـ`noteTrail(res, …)`: اسمُ المقرر والشعبة، وما كان وما صار.
 */
import type { Express, NextFunction, Request, Response } from "express";
import { randomUUID } from "crypto";
import { Repository } from "../db/repository";
import { type AuthenticatedRequest, requireAuth } from "./core/auth";
import { isScopeAllowed } from "./core/scope";
import { roleDefinition, type AcademicRole } from "../utils/academicRoles";
import { currentTermId, sortTermsNewest } from "../utils/termSequence";
import {
  classifyTrailRoute, clipTrail, isTrailKind, scopeSets, TRAIL_TEXT, trailAudience, trailEntryVisible, trailPeriod,
  trailPersonKey, trailPersonTermKey, trailReadKeys, trailTeamKey, TRAIL_KINDS,
  type ActivityTrailEntry, type TrailActorKind, type TrailAudience, type TrailKind, type TrailSeat,
} from "../utils/activityTrail";

/** ما يضيفه المعالج إلى السطر: كلُّه اختياري، وما لم يُقل يُشتقّ من الطلب. */
export interface TrailNote {
  kind?: TrailKind;
  target?: string;
  before?: string;
  after?: string;
  detail?: string;
  scope?: { collegeId?: number; sectionId?: number; termId?: number };
  row?: number;
  /** حركةٌ لم تغيّر شيئاً في الحقيقة (إعادةُ حفظٍ بلا فرق): لا تُكتب. */
  skip?: boolean;
}

export function noteTrail(res: Response | undefined | null, note: TrailNote): void {
  if (!res || !(res as any).locals) return;
  res.locals.trail = { ...(res.locals.trail || {}), ...note };
}

/* ── الكتابة ─────────────────────────────────────────────────────────────── */

const num = (value: unknown) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; };

function scopeOf(req: Request, note: TrailNote) {
  const body: any = req.body && typeof req.body === "object" ? req.body : {};
  const query: any = req.query || {};
  const pick = (...values: unknown[]) => values.map(num).find(Boolean) || 0;
  return {
    c: num(note.scope?.collegeId) || pick(body.collegeId, body.AdCollegeId, query.collegeId, query.AdCollegeId),
    s: num(note.scope?.sectionId) || pick(body.sectionId, body.AdSectionId, body.fromSectionId, query.sectionId, query.AdSectionId),
    t: num(note.scope?.termId) || pick(body.termId, body.AdTermId, query.termId, query.AdTermId),
  };
}

/** الحسابُ ومن عليه، كما حملته الجلسة لحظةَ الطلب (src/utils/seats.ts). */
export function trailActorOf(user: any): { u: number; m: string; dk: TrailActorKind; who: string; seat: string; role: AcademicRole | "admin" } | null {
  if (!user) return null;
  const u = num(user.SystemUserId);
  if (!u) return null;
  const actor = user.SeatActor as { kind?: string; name?: string; memberId?: string; seatName?: string; seatRole?: AcademicRole } | undefined;
  const dk: TrailActorKind = actor?.kind === "member" || actor?.kind === "deputy" || actor?.kind === "holder" ? actor.kind as TrailActorKind : "account";
  const m = (dk === "member" || dk === "deputy") && actor?.memberId ? String(actor.memberId).slice(0, 60) : "h";
  return {
    u, m, dk,
    who: clipTrail(actor?.name || user.Name || user.SystemUserLogin || "", TRAIL_TEXT.who),
    seat: clipTrail(actor?.seatName || user.SeatName || user.Name || "", TRAIL_TEXT.seat),
    role: user.IsAdminUser ? "admin" : roleDefinition(actor?.seatRole || user.Role).id,
  };
}

async function operationalTerm(): Promise<number> {
  try { return currentTermId(await Repository.getTerms()) || 0; } catch { return 0; }
}

/** يبني السطر — مفصولٌ عن الوسيط ليُختبر بلا خادم. */
export function buildTrailEntry(input: {
  method: string; path: string; user: any; body?: any; query?: any; locals: any; term: number; at?: string;
}): ActivityTrailEntry | null {
  const route = classifyTrailRoute(input.method, input.path);
  if (!route) return null;
  const actor = trailActorOf(input.user);
  if (!actor) return null;
  const note: TrailNote = input.locals?.trail || {};
  if (note.skip) return null;
  const scope = scopeOf({ body: input.body, query: input.query || {} } as any, note);
  const detail = clipTrail(input.locals?.auditChanges || note.detail || "", TRAIL_TEXT.detail);
  const rowIds: number[] = Array.isArray(input.locals?.auditRowIds) ? input.locals.auditRowIds.map(num).filter(Boolean) : [];
  const pathRow = /^\/schedules\/(\d+)(?:\/|$)/.exec(input.path)?.[1];
  const row = num(note.row) || (rowIds.length === 1 ? rowIds[0] : 0) || num(pathRow);
  const kind = note.kind && isTrailKind(note.kind) ? note.kind : route.kind;
  const person = trailPersonKey(actor.u, actor.m === "h" ? undefined : actor.m);
  /* حركةٌ على فريقٍ بعينه (/seats/:id/…) تُقرأ في أثر ذلك الفريق، أيّاً كان فاعلُها. */
  const teamOf = route.area === "team" ? num(/^\/seats\/(\d+)\//.exec(input.path)?.[1]) : 0;
  const tu = teamOf && teamOf !== actor.u ? teamOf : 0;
  const entry: ActivityTrailEntry = {
    id: randomUUID(),
    at: input.at || new Date().toISOString(),
    term: input.term,
    team: trailTeamKey(tu || actor.u, input.term),
    person: trailPersonTermKey(person, input.term),
    ...actor,
    ...(tu ? { tu } : {}),
    kind, area: route.area,
    target: clipTrail(note.target || route.label, TRAIL_TEXT.target),
  };
  if (detail) entry.detail = detail;
  if (note.before) entry.before = clipTrail(note.before, TRAIL_TEXT.side);
  if (note.after) entry.after = clipTrail(note.after, TRAIL_TEXT.side);
  if (scope.c) entry.c = scope.c;
  if (scope.s) entry.s = scope.s;
  if (scope.t) entry.t = scope.t;
  if (row) entry.row = row;
  return entry;
}

/**
 * الوسيط: يُركَّب على /api بعد سجلّ التدقيق. يقرأ المسارَ والهويةَ عند البدء (Express يعيد كتابة
 * `req.url` أثناء التوجيه)، ويكتب بعد انتهاء الردّ إن نجح. ولا شيءَ هنا يؤخّر الردّ أو يُسقطه.
 */
export function activityTrailRecorder(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const path = req.path;
  if (!classifyTrailRoute(req.method, path) || !req.user) { next(); return; }
  const user = req.user, method = req.method, body = req.body, query = req.query;
  res.on("finish", () => {
    if (res.statusCode >= 300) return;
    if (body?.dryRun === true || query?.dryRun === "1" || query?.dryRun === "true") return;
    void operationalTerm().then(term => {
      const entry = buildTrailEntry({ method, path, user, body, query, locals: res.locals, term });
      if (entry) return Repository.appendActivityTrail(entry);
    }).catch(error => console.error("[activity-trail] تعذّرت الكتابة:", error instanceof Error ? error.message : error));
  });
  next();
}

/* ── القراءة ─────────────────────────────────────────────────────────────── */

/** الفرقُ كما هي الآن: صفةُ كلِّ حسابٍ ونطاقُه. تُحفظ دقيقةً (لكل صندوق تجربةٍ على حدة). */
const SEATS_MEMORY_MS = 60_000;
const seatsMemory = new Map<string, { at: number; seats: TrailSeat[] }>();
Repository.onIdentityChanged?.(() => seatsMemory.clear());

export async function trailSeats(): Promise<TrailSeat[]> {
  const key = Repository.currentDemoSessionId() || "live";
  const held = seatsMemory.get(key);
  if (held && Date.now() - held.at < SEATS_MEMORY_MS) return held.seats;
  const [users, assigns] = await Promise.all([Repository.getUsers(), Repository.getCollegeUserAssigns()]);
  const scopesOf = new Map<number, Array<{ AdCollegeId: number; AdSectionId: number }>>();
  for (const row of assigns as any[]) {
    const id = Number(row.SystemUserId);
    scopesOf.set(id, [...(scopesOf.get(id) || []), { AdCollegeId: Number(row.AdCollegeId), AdSectionId: Number(row.AdSectionId) }]);
  }
  const seats = (users as any[])
    .filter(user => !user.IsAdminUser && !user.IsDeleted)
    .map(user => ({ userId: Number(user.SystemUserId), role: roleDefinition(user.Role).id, ...scopeSets(scopesOf.get(Number(user.SystemUserId)) || []) }));
  seatsMemory.set(key, { at: Date.now(), seats });
  if (seatsMemory.size > 200) for (const [k, v] of seatsMemory) if (Date.now() - v.at > SEATS_MEMORY_MS) seatsMemory.delete(k);
  return seats;
}

export async function audienceFor(req: AuthenticatedRequest): Promise<TrailAudience> {
  const user = req.user;
  if (!user) return { mode: "none" };
  if (user.IsAdminUser) return { mode: "all" };
  const actor = user.SeatActor as { kind?: string; memberId?: string; seatRole?: AcademicRole } | undefined;
  const kind: TrailActorKind = actor?.kind === "member" || actor?.kind === "deputy" || actor?.kind === "holder" ? actor.kind as TrailActorKind : "account";
  return trailAudience({
    userId: Number(user.SystemUserId), isAdmin: false,
    seatRole: roleDefinition(actor?.seatRole || user.Role).id,
    kind, memberId: actor?.memberId,
    ...scopeSets(req.scopes || []),
  }, await trailSeats());
}

async function periodNow() {
  const terms = await Repository.getTerms();
  const ordered = sortTermsNewest(terms as any[]);
  return trailPeriod(ordered, currentTermId(terms as any[]));
}

/** ما يُرسل إلى الواجهة: بلا مفاتيح القراءة ولا معرّف الحساب الخام. */
const view = (entry: ActivityTrailEntry) => ({
  id: entry.id, at: entry.at, key: trailPersonKey(entry.u, entry.m === "h" ? undefined : entry.m),
  who: entry.who, seat: entry.seat, kind: entry.kind, area: entry.area, target: entry.target,
  ...(entry.detail ? { detail: entry.detail } : {}), ...(entry.before ? { before: entry.before } : {}), ...(entry.after ? { after: entry.after } : {}),
  ...(entry.row ? { row: entry.row } : {}),
});

/** ما يُقرأ في المرة الواحدة: سطورٌ تكفي ورقةً جانبية، موزّعةٌ على المفاتيح. */
const TRAIL_READ_BUDGET = 240;
const TRAIL_PAGE = 160;

export function registerActivityTrailRoutes(app: Express): void {

app.get("/api/activity-trail", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  const audience = await audienceFor(req);
  const period = await periodNow();
  const terms = [period.current?.id, period.previous?.id].filter((id): id is number => Boolean(id));
  if (audience.mode === "none" || !terms.length) {
    res.json({ audience: audience.mode === "none" ? "none" : "empty", period, people: [], kinds: {}, entries: [], truncated: false });
    return;
  }
  const keys = trailReadKeys(audience, terms);
  const perKey = Math.max(20, Math.min(120, Math.ceil(TRAIL_READ_BUDGET / Math.max(1, keys.length))));
  const termSet = new Set(terms);
  /* الحكمُ يُعاد على كل سطر: لا يصل الواجهةَ سطرٌ خارج قرار المالك ولو أعاده سؤالٌ أوسع. */
  const rows = (await Repository.listActivityTrail(keys, perKey))
    .filter(row => termSet.has(Number(row.term)) && trailEntryVisible(audience, row));
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const people = new Map<string, { key: string; name: string; seat: string; week: number; total: number }>();
  for (const row of rows) {
    const key = trailPersonKey(row.u, row.m === "h" ? undefined : row.m);
    const face = people.get(key) || { key, name: row.who, seat: row.seat, week: 0, total: 0 };
    face.total += 1;
    if (row.at >= weekAgo) face.week += 1;
    people.set(key, face);
  }
  const person = String(req.query.person || "").slice(0, 120);
  const kind = String(req.query.kind || "");
  const ofPerson = person ? rows.filter(row => trailPersonKey(row.u, row.m === "h" ? undefined : row.m) === person) : rows;
  const kinds = Object.fromEntries(TRAIL_KINDS.map(k => [k, ofPerson.filter(row => row.kind === k).length]).filter(([, n]) => Number(n) > 0));
  const shown = isTrailKind(kind) ? ofPerson.filter(row => row.kind === kind) : ofPerson;
  const label = audience.mode === "all" ? "all" : audience.label;
  res.json({
    audience: label, period,
    people: [...people.values()].sort((a, b) => b.week - a.week || b.total - a.total || a.name.localeCompare(b.name, "ar")),
    kinds,
    entries: shown.slice(0, TRAIL_PAGE).map(view),
    truncated: shown.length > TRAIL_PAGE,
  });
});

app.get("/api/activity-trail/stamp/:rowId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  const rowId = num(req.params.rowId);
  const row: any = rowId ? await Repository.getScheduleById(rowId) : undefined;
  if (!row) { res.status(404).json({ error: "الموعد غير موجود." }); return; }
  if (!isScopeAllowed(req, Number(row.AdCollegeId), Number(row.AdSectionId))) { res.status(403).json({ error: "خارج نطاق صلاحياتك." }); return; }
  const entry = await Repository.latestActivityTrailForRow(rowId);
  if (!entry) { res.json({ stamp: null }); return; }
  /* من يرى الموعد يرى أنه عُدّل ومتى؛ والاسمُ لمن يحقّ له رؤيةُ صاحبه، وإلا فاسمُ الفريق. */
  const named = trailEntryVisible(await audienceFor(req), entry);
  res.json({ stamp: { who: named ? entry.who : entry.seat, at: entry.at, kind: entry.kind } });
});

/* للقراءة فقط: لا تعديلَ ولا حذفَ لسطرٍ من الأثر، ولا لمدير النظام. */
app.all(/^\/api\/activity-trail(?:\/.*)?$/, (req: Request, res: Response) => {
  res.setHeader("Allow", "GET");
  res.status(405).json({ error: "الأثر للقراءة فقط: لا يُعدَّل ولا يُحذف." });
});

}
