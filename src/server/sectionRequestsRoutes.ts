/**
 * ── «طلب شعبة»: الإرشاد ← لجنة الجدول ← التسجيل ─────────────────────────────
 *
 *   الإرشاد:   GET  /api/section-requests/compose · GET /api/section-requests/candidates
 *              POST /api/section-requests · POST /api/section-requests/:id/withdraw
 *   اللجنة:    POST /api/section-requests/:id/link · …/unlink · …/decline · …/approve
 *   التسجيل:   POST /api/section-requests/:id/approve · …/register
 *   الجميع:    GET  /api/section-requests?termId=  (كلٌّ يرى ما في نطاقه، بصلاحياته عليه)
 *
 * يُبنى على ما هو قائم ولا يكرّره: الطلبةُ من طلبات «مساري» (باب الطالب D5) أو قائمةٌ تُلصق،
 * والهويةُ مختومةٌ بخاتم طلبات الطلبة نفسه (sealStudentIdentity) وتُفتح بقاعدة كشف التسجيل
 * نفسها (studentIdentityFor)، والشعبةُ تُفتح بمحرّر الموعد في الورشة (أو تُربط شعبةٌ قائمة)،
 * وسعتُها تُكتب في رصيد مقاعد المرشد، والإشعارُ في الجرس وتنبيهات الجوال القائمين.
 *
 * والقواعدُ كلها في src/utils/sectionRequests.ts (حسابٌ صرف): الحالة، والخطُّ الزمني،
 * والانتقالات، ومن يفعل ماذا. هنا القراءةُ والنطاقُ والكتابةُ الذرّية فقط.
 */
import type { Express, Response } from "express";
import { randomBytes } from "crypto";
import { Repository } from "../db/repository";
import { type AuthenticatedRequest, isPowerUser, requireAuth } from "./core/auth";
import { isScopeAllowed } from "./core/scope";
import { refuseIfTermFrozen } from "./core/approvals";
import { broadcastNotify } from "./core/liveChannel";
import { sealStudentIdentity, studentIdentityFor, surveyFingerprint } from "./core/studentIdentity";
import { pushHooks, type PushAccount } from "./pushRoutes";
import { sectionRequestMessage } from "./pushMessages";
import { isAdvisorRole, isReadOnlyRole, isRegistrarRole, isViewerOnlyRole, roleDefinition, roleLabel } from "../utils/academicRoles";
import { sectionOwnsNeed } from "../utils/studentCaseScope";
import { normalizeQuotaConfig, sectionKey, type SeatQuotaConfig } from "../utils/advisorSeats";
import { formatScheduleTimeRange } from "../utils/scheduleTime";
import { SCHEDULE_DAYS } from "../utils/scheduleIntelligence";
import { AR, countOf, oblique } from "../utils/arabicCount";
import type { CenterNotification } from "../utils/notificationCenter";
import {
  approveStudents, capacityShare, countsOf, declineRequest, linkSections, markRegistered, matchesPeriod, parsePastedStudents,
  PERIOD_LABEL, powersFor, SECTION_REQUEST_MAX_COUNT, SECTION_REQUEST_MAX_STUDENTS, SECTION_REQUEST_NOTE_MAX, SECTION_REQUEST_PERIODS,
  stageOf, timelineOf, unlinkSection, withdrawRequest,
  type SectionRequest, type SectionRequestActorFacts, type SectionRequestPeriod, type SectionRequestPowers, type SectionRequestStudent, type Transition,
} from "../utils/sectionRequests";

const COLLECTION = "sectionRequests" as const;
const clean = (value: unknown, max = 120) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const actorName = (req: AuthenticatedRequest) => clean(req.user?.Name || req.user?.UserName || req.user?.SystemUserLogin || roleLabel(req.user?.Role), 120);
const byLine = (req: AuthenticatedRequest) => {
  const label = req.user?.IsAdminUser && !req.user?.Role ? "إدارة النظام" : roleLabel(req.user?.Role);
  const name = actorName(req);
  return name && !name.includes(label) ? `${label} · ${name}` : name || label;
};

/** الأذونات الممنوحة لهذا الحساب، بالفعل لا بالقالب (كما في كشف التسجيل). */
const grantedPermissions = async (req: { permissions?: number[]; user?: any }): Promise<number[]> =>
  req.permissions ?? (req.user ? (await Repository.getSecurityByUser(req.user.SystemUserId)).map(item => Number(item.FormNameId)) : []);

/** ما يحتاجه حكمُ الصلاحيات من الحساب، لطلبٍ بعينه. يعمل على الطلب الموثَّق وعلى حسابٍ مشترك في التنبيهات. */
export function actorFacts(req: { user?: any; scopes?: any[]; permissions?: number[] }, granted: number[], request: Pick<SectionRequest, "collegeId" | "sectionId" | "fromSectionId">): SectionRequestActorFacts {
  const role = roleDefinition(req.user?.Role).id;
  const plainAdmin = Boolean(req.user?.IsAdminUser);
  return {
    role,
    power: isPowerUser(req as AuthenticatedRequest),
    viewerOnly: !plainAdmin && isViewerOnlyRole(role),
    advisor: !plainAdmin && isAdvisorRole(role),
    registrar: !plainAdmin && isRegistrarRole(role),
    schedules: granted.includes(7) && !isReadOnlyRole(role),
    courseScope: isScopeAllowed(req as AuthenticatedRequest, Number(request.collegeId), Number(request.sectionId)),
    fromScope: isScopeAllowed(req as AuthenticatedRequest, Number(request.collegeId), Number(request.fromSectionId)),
  };
}

async function powersOf(req: AuthenticatedRequest, request: SectionRequest): Promise<SectionRequestPowers> {
  return powersFor(actorFacts(req, await grantedPermissions(req), request));
}

const termRequests = (termId: number) => Repository.listFeatureDocs<SectionRequest>(COLLECTION, `${termId}:`);
const readRequest = (id: string) => Repository.getFeatureDoc<SectionRequest>(COLLECTION, id);

/** يكتب الانتقالَ ذرّياً: يُقرأ الطلب ويُحسب ويُكتب في معاملةٍ واحدة. */
async function commit(id: string, step: (current: SectionRequest) => Transition) {
  return Repository.updateFeatureDoc<SectionRequest, { status: number; error: string } | null>(COLLECTION, id, current => {
    if (!current) return { refuse: { status: 404, error: "لا يوجد طلبٌ بهذا المعرّف." } };
    const out = step(current);
    return "refuse" in out ? { refuse: out.refuse } : { next: out.next, result: null };
  });
}

/* ── ما يراه كلُّ طرف ─────────────────────────────────────────────────────── */

const dayLabel = (row: any) => SCHEDULE_DAYS.filter(day => Boolean(row?.[day.key])).map(day => day.label).join(" ");

async function namesOf() {
  const [colleges, sections, courses] = await Promise.all([Repository.getColleges(), Repository.getSections(), Repository.getCourses()]);
  return {
    college: new Map((colleges as any[]).map(row => [Number(row.AdCollegeId), String(row.AdCollegeName || "")])),
    section: new Map((sections as any[]).map(row => [Number(row.AdSectionId), String(row.AdSectionName || "")])),
    course: new Map((courses as any[]).map(row => [Number(row.AdCourseId), row])),
    courses: courses as any[],
  };
}

async function studentView(req: AuthenticatedRequest, student: SectionRequestStudent, index: number) {
  const identity = await studentIdentityFor(req, student);
  const civilTail = identity.civil ? identity.civil.slice(-4) : "";
  return {
    id: student.id, source: student.source,
    /* صفةُ العرض الصرف ترى العدد بلا هوية، كما في كشف التسجيل. */
    name: identity.name || (identity.civil ? "" : `طالب ${index + 1}`),
    civilTail,
    approved: student.approved, registered: Boolean(student.registered),
  };
}

async function requestView(req: AuthenticatedRequest, request: SectionRequest, names: Awaited<ReturnType<typeof namesOf>>, powers: SectionRequestPowers, termRows: Map<string, any[]>) {
  const course = names.course.get(Number(request.courseId));
  const stage = stageOf(request);
  /* شعبُ المقرر القائمة في الحرم والفصل ولم تُربط بعد: يربطها من يفتح الشعبة بلمسة. */
  let available: any[] = [];
  if (powers.committee && !request.closed && !request.approvedAt) {
    const key = `${request.collegeId}:${request.sectionId}`;
    let rows = termRows.get(key);
    if (!rows) {
      rows = await Repository.getSchedulesByScope({ collegeId: request.collegeId, sectionId: request.sectionId, termId: request.termId }) as any[];
      termRows.set(key, rows);
    }
    const linked = new Set((request.sections || []).map(row => String(row.sectionCode)));
    const byCode = new Map<string, any[]>();
    for (const row of rows.filter(row => Number(row.AdCourseId) === Number(request.courseId))) {
      const code = String(row.SCode || "");
      if (!code || linked.has(code)) continue;
      byCode.set(code, [...(byCode.get(code) || []), row]);
    }
    available = [...byCode].map(([code, list]) => ({
      scheduleId: Number(list[0].id), sectionCode: code,
      when: list.map(row => `${dayLabel(row)} ${formatScheduleTimeRange(row.fstarttime, row.fendtime)}`).join(" · "),
      matchesPeriod: list.every(row => matchesPeriod(request.period, String(row.fstarttime || ""))),
    })).sort((a, b) => Number(b.matchesPeriod) - Number(a.matchesPeriod) || a.sectionCode.localeCompare(b.sectionCode));
  }
  const maxStudent = Number(course?.MaxStudent || 0);
  return {
    id: request.id, termId: request.termId,
    collegeId: request.collegeId, collegeName: names.college.get(Number(request.collegeId)) || "",
    sectionId: request.sectionId, sectionName: names.section.get(Number(request.sectionId)) || "",
    fromSectionId: request.fromSectionId, fromSectionName: names.section.get(Number(request.fromSectionId)) || "",
    courseId: request.courseId, courseCode: String(course?.CourseCode || request.courseCode || ""), courseName: String(course?.CourseName || request.courseName || `مقرر ${request.courseId}`),
    period: request.period, count: request.count, note: request.note || "",
    stage, timeline: timelineOf(request), counts: countsOf(request),
    /* الشعبُ التي يحتاجها العدد بسعة المقرر: «١٠٠ ÷ ٤٠ ≈ ٣ شعب». */
    sectionsNeeded: maxStudent > 0 ? Math.max(1, Math.ceil(request.count / maxStudent)) : 0,
    maxStudent,
    closedNote: request.closedNote || "",
    createdAt: request.createdAt, createdBy: request.createdBy?.name || "", createdByRole: roleLabel(request.createdBy?.role),
    sections: request.sections || [],
    students: await Promise.all((request.students || []).map((student, index) => studentView(req, student, index))),
    powers: { advising: powers.advising, committee: powers.committee, registration: powers.registration },
    available,
    events: (request.events || []).slice(-12),
  };
}

/* ── الجرس: ما ينتظر كلَّ طرف، مشتقّاً من الطلبات لحظةَ السؤال ─────────────── */

export async function sectionRequestNotices(req: AuthenticatedRequest, termIds: number[]): Promise<CenterNotification[]> {
  const items: CenterNotification[] = [];
  const granted = await grantedPermissions(req);
  const terms = [...new Set(termIds.filter(Boolean))];
  let names: Awaited<ReturnType<typeof namesOf>> | null = null;
  for (const termId of terms) {
    const list = await termRequests(termId);
    for (const request of list) {
      if (request.closed && request.closed !== "declined") continue;
      const powers = powersFor(actorFacts(req, granted, request));
      if (!powers.read) continue;
      names ||= await namesOf();
      const course = names.course.get(Number(request.courseId));
      const courseName = String(course?.CourseName || request.courseName || "مقرر");
      const stage = stageOf(request);
      const counts = countsOf(request);
      const base = { view: "studentRegistration" as const, termId, at: request.updatedAt };
      /* الإرشاد: يصله «تم الاعتماد» بمن اعتُمد، ثم ما سُجّل، واعتذارُ اللجنة إن اعتذرت. */
      if (powers.advising && !powers.committee) {
        if (stage === "declined") items.push({ ...base, id: `section-request:${request.id}:declined`, tone: "alert", title: `اعتذرت لجنة الجدول عن «${courseName}»`, detail: request.closedNote || "", collegeId: request.collegeId, sectionId: request.fromSectionId });
        else if (request.approvedAt) items.push({ ...base, id: `section-request:${request.id}:approved:${counts.approved}:${counts.registered}`, tone: "done",
          title: `تم الاعتماد: «${courseName}» — ${counts.approved} من ${counts.listed}`,
          detail: counts.registered ? `سُجّل ${counts.registered} من ${counts.approved}` : "بانتظار التسجيل", collegeId: request.collegeId, sectionId: request.fromSectionId });
        continue;
      }
      if (request.closed) continue;
      /* اللجنة: طلبٌ يحتاج شعبةً، أو شعبةٌ فُتحت وتنتظر اعتماد الطلبة. */
      if (powers.committee && (stage === "sent" || stage === "opened")) {
        items.push({ ...base, id: `section-request:${request.id}:${stage}`, tone: "action",
          title: stage === "sent" ? `طلب شعبة من الإرشاد: «${courseName}»` : `اعتمد طلبة «${courseName}»`,
          detail: stage === "sent" ? `${countOf(request.count, AR.student)} · ${PERIOD_LABEL[request.period]}` : `${countOf(counts.listed, AR.student)} في القائمة`,
          collegeId: request.collegeId, sectionId: request.sectionId });
        continue;
      }
      /* التسجيل: من اعتُمد ولم يُسجَّل بعد. */
      if (powers.registration && (stage === "approved" || stage === "registering")) {
        const left = counts.approved - counts.registered;
        items.push({ ...base, id: `section-request:${request.id}:register:${left}`, tone: "action",
          title: `سجّل ${countOf(left, oblique(AR.student))} في «${courseName}»`, detail: "اعتمدتهم لجنة الجدول من طلب الإرشاد",
          collegeId: request.collegeId, sectionId: request.sectionId });
      }
    }
  }
  return items.slice(0, 8);
}

/* ── تنبيهات الجوال: لمن تنطبق عليه قاعدةُ الطرف ───────────────────────────── */

type PushParty = "advising" | "committee" | "registration";
function pushTo(parties: PushParty[], request: SectionRequest, message: ReturnType<typeof sectionRequestMessage>) {
  return pushHooks.toAccounts((account: PushAccount) => {
    const powers = powersFor(actorFacts(account, account.permissions, request));
    /* مدير النظام يرى كلَّ شيء، ولا يُوقَظ لكل طلبٍ في الجامعة. */
    if (isPowerUser(account as any)) return false;
    return parties.some(party => powers[party]);
  }, message, `section-request:${request.id}`);
}

/* ── المسارات ─────────────────────────────────────────────────────────────── */

const isPeriod = (value: unknown): value is SectionRequestPeriod => SECTION_REQUEST_PERIODS.includes(value as SectionRequestPeriod);
const fail = (res: Response, status: number, error: string) => { res.status(status).json({ error }); };

export function registerSectionRequestsRoutes(app: Express): void {

/** الطلباتُ في نطاق القارئ لفصلٍ واحد، كلٌّ بصلاحياته عليه. */
app.get("/api/section-requests", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const termId = Number(req.query.termId || 0);
  if (!termId) { fail(res, 400, "حدّد الفصل."); return; }
  const granted = await grantedPermissions(req);
  const list = (await termRequests(termId)).map(request => ({ request, powers: powersFor(actorFacts(req, granted, request)) })).filter(entry => entry.powers.read);
  const names = await namesOf();
  const termRows = new Map<string, any[]>();
  const rows = [];
  for (const entry of list.sort((a, b) => String(b.request.updatedAt).localeCompare(String(a.request.updatedAt)))) {
    rows.push(await requestView(req, entry.request, names, entry.powers, termRows));
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ rows });
});

/** ما يحتاجه الإرشادُ ليكتب الطلب: مقرراتُ الحرم، ولكلٍّ كم طالباً طلبه من «مساري». */
app.get("/api/section-requests/compose", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0), sectionId = Number(req.query.sectionId || 0), termId = Number(req.query.termId || 0);
  if (!collegeId || !sectionId || !termId) { fail(res, 400, "اختر الكلية والقسم والفصل."); return; }
  const facts = actorFacts(req, await grantedPermissions(req), { collegeId, sectionId: 0, fromSectionId: sectionId });
  if (!powersFor(facts).advising) { fail(res, 403, "طلبُ الشعبة يرسله الإرشادُ من نطاق قسمه."); return; }
  const [courses, needs] = await Promise.all([Repository.getCourses(), Repository.getStudentNeeds(collegeId, 0, termId)]);
  const demand = new Map<number, number>();
  const courseById = new Map((courses as any[]).map(row => [Number(row.AdCourseId), row]));
  for (const need of needs as any[]) {
    for (const id of new Set<number>((need.courseIds || []).map(Number))) {
      const course = courseById.get(id);
      if (!course || !candidateVisible(req, need, courses as any[], collegeId, sectionId, course)) continue;
      demand.set(id, (demand.get(id) || 0) + 1);
    }
  }
  const rows = (courses as any[]).filter(row => Number(row.AdCollegeId) === collegeId).map(row => ({
    id: Number(row.AdCourseId), code: String(row.CourseCode || ""), name: String(row.CourseName || ""), sectionId: Number(row.AdSectionId), maxStudent: Number(row.MaxStudent || 0),
    masari: demand.get(Number(row.AdCourseId)) || 0,
  })).sort((a, b) => b.masari - a.masari || a.name.localeCompare(b.name, "ar"));
  res.setHeader("Cache-Control", "no-store");
  res.json({ courses: rows });
});

/** طلبةُ «مساري» الذين طلبوا هذا المقرر (باب الطالب D5)، بالهوية التي يراها القارئ في كشف التسجيل. */
app.get("/api/section-requests/candidates", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0), sectionId = Number(req.query.sectionId || 0), termId = Number(req.query.termId || 0), courseId = Number(req.query.courseId || 0);
  if (!collegeId || !sectionId || !termId || !courseId) { fail(res, 400, "اختر المقرر."); return; }
  const facts = actorFacts(req, await grantedPermissions(req), { collegeId, sectionId: 0, fromSectionId: sectionId });
  if (!powersFor(facts).advising) { fail(res, 403, "طلبُ الشعبة يرسله الإرشادُ من نطاق قسمه."); return; }
  const rows = await masariCandidates(req, collegeId, sectionId, termId, courseId);
  res.setHeader("Cache-Control", "no-store");
  res.json({ rows: await Promise.all(rows.map(async need => {
    const identity = await studentIdentityFor(req, need);
    /* الرقمُ المدني لا يُرسل كاملاً: آخرُ أربعة أرقام تكفي للتمييز بين اسمين متشابهين. */
    return { needId: String(need.id), name: identity.name, civilTail: identity.civil.slice(-4) };
  })) });
});

/** الإرشادُ يرسل الطلب. */
app.post("/api/section-requests", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body || {};
  const collegeId = Number(body.collegeId || 0), fromSectionId = Number(body.fromSectionId || 0), termId = Number(body.termId || 0), courseId = Number(body.courseId || 0);
  if (!collegeId || !fromSectionId || !termId || !courseId) { fail(res, 400, "المقرر والحرم والفصل مطلوبة."); return; }
  if (!isPeriod(body.period)) { fail(res, 400, "اختر الفترة المفضلة."); return; }
  const facts = actorFacts(req, await grantedPermissions(req), { collegeId, sectionId: 0, fromSectionId });
  if (!powersFor(facts).advising) { fail(res, 403, "طلبُ الشعبة يرسله الإرشادُ من نطاق قسمه."); return; }
  if (await refuseIfTermFrozen(res, termId)) return;
  const course: any = await Repository.getCourseById(courseId);
  if (!course || Number(course.AdCollegeId) !== collegeId) { fail(res, 400, "المقرر ليس في هذا الحرم."); return; }

  /* الطلبة: من «مساري» بمعرّف طلبه (الهويةُ تُنسخ مختومةً كما هي)، أو قائمةٌ ملصقة تُختم هنا. */
  const students: SectionRequestStudent[] = [];
  const seen = new Set<string>();
  const wantedNeeds = new Set((Array.isArray(body.needIds) ? body.needIds : []).map(String).slice(0, SECTION_REQUEST_MAX_STUDENTS));
  if (wantedNeeds.size) {
    for (const need of await masariCandidates(req, collegeId, fromSectionId, termId, courseId)) {
      if (!wantedNeeds.has(String(need.id))) continue;
      const key = String(need.fingerprint || `need:${need.id}`);
      if (seen.has(key)) continue;
      seen.add(key);
      students.push({ id: `s${students.length + 1}`, source: "masari", needId: String(need.id), key, ...(need.nameCipher ? { nameCipher: need.nameCipher } : {}), ...(need.civilCipher ? { civilCipher: need.civilCipher } : {}) });
    }
  }
  for (const entry of parsePastedStudents(String(body.pasted || "").slice(0, 60_000))) {
    if (students.length >= SECTION_REQUEST_MAX_STUDENTS) break;
    const key = entry.civil ? await surveyFingerprint(entry.civil) : `n:${(await surveyFingerprint(`name:${entry.name}`))}`;
    if (seen.has(key)) continue;
    seen.add(key);
    students.push({
      id: `s${students.length + 1}`, source: "paste", key,
      ...(entry.name ? { nameCipher: await sealStudentIdentity(entry.name) } : {}),
      ...(entry.civil ? { civilCipher: await sealStudentIdentity(entry.civil) } : {}),
    });
  }
  const count = Math.min(SECTION_REQUEST_MAX_COUNT, Math.max(students.length, Math.trunc(Number(body.count) || 0)));
  if (!count) { fail(res, 400, "اكتب عدد الطلبة أو أرفق قائمتهم."); return; }

  const at = new Date().toISOString();
  const by = byLine(req);
  const request: SectionRequest = {
    id: `${termId}:${Date.now().toString(36)}${randomBytes(4).toString("hex")}`,
    termId, collegeId, sectionId: Number(course.AdSectionId), fromSectionId, courseId,
    courseCode: String(course.CourseCode || ""), courseName: String(course.CourseName || ""),
    period: body.period, count, note: clean(body.note, SECTION_REQUEST_NOTE_MAX) || undefined,
    students, sections: [],
    createdAt: at, updatedAt: at,
    createdBy: { userId: Number(req.user?.SystemUserId || 0), name: actorName(req), role: roleDefinition(req.user?.Role).id },
    events: [{ kind: "sent", at, by, detail: countOf(count, AR.student) }],
  };
  if (!request.note) delete request.note;
  await Repository.saveFeatureDoc(COLLECTION, request.id, request);
  res.locals.auditEntity = "طلب شعبة";
  res.locals.auditChanges = `طلب شعبة: ${request.courseName} · ${countOf(count, AR.student)} · ${PERIOD_LABEL[request.period]}`;
  broadcastNotify(Repository.currentDemoSessionId());
  await pushTo(["committee"], request, sectionRequestMessage("sent", { id: request.id, courseName: request.courseName || "", count, period: PERIOD_LABEL[request.period] }));
  res.status(201).json({ ok: true, id: request.id, students: students.length, count });
});

/** يحمّل الطلب ويتحقّق من الطرف والفصل قبل أي كتابة. */
async function guarded(req: AuthenticatedRequest, res: Response, party: keyof SectionRequestPowers): Promise<SectionRequest | null> {
  const request = await readRequest(String(req.params.id || ""));
  if (!request) { fail(res, 404, "لا يوجد طلبٌ بهذا المعرّف."); return null; }
  const powers = await powersOf(req, request);
  if (!powers.read) { fail(res, 404, "لا يوجد طلبٌ بهذا المعرّف."); return null; }
  if (!powers[party]) {
    fail(res, 403, party === "advising" ? "هذا للإرشاد الذي أرسل الطلب." : party === "committee" ? "فتحُ الشعبة وربطُها للجنة جدول قسم المقرر." : party === "registration" ? "التسجيلُ لموظفي التسجيل في نطاق القسم." : "خارج نطاقك.");
    return null;
  }
  if (await refuseIfTermFrozen(res, Number(request.termId))) return null;
  return request;
}

async function finish(req: AuthenticatedRequest, res: Response, id: string, step: (current: SectionRequest) => Transition, audit: string) {
  const out = await commit(id, step);
  if (!out.ok) { const why = out.result || { status: 409, error: "تعذّر التنفيذ." }; fail(res, why.status, why.error); return null; }
  res.locals.auditEntity = "طلب شعبة";
  res.locals.auditChanges = audit;
  broadcastNotify(Repository.currentDemoSessionId());
  return out.next;
}

/**
 * ربطُ شعبةٍ أو أكثر بالطلب (لجنة الجدول). الشعبةُ صفٌّ في جدول الحرم والفصل لهذا المقرر نفسه؛
 * ويُكتب لها في رصيد مقاعد المرشد سعةٌ من عدد الطلب إن لم تكن لها سعةٌ مكتوبة.
 */
app.post("/api/section-requests/:id/link", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const request = await guarded(req, res, "committee");
  if (!request) return;
  const ids = new Set((Array.isArray(req.body?.scheduleIds) ? req.body.scheduleIds : [req.body?.scheduleId]).map(Number).filter((n: number) => n > 0));
  if (!ids.size) { fail(res, 400, "اختر الشعبة."); return; }
  const rows = (await Repository.getSchedulesByScope({ collegeId: request.collegeId, sectionId: request.sectionId, termId: request.termId }) as any[])
    .filter(row => ids.has(Number(row.id)) && Number(row.AdCourseId) === Number(request.courseId));
  if (!rows.length) { fail(res, 400, "الشعبة ليست لهذا المقرر في جدول هذا الحرم والفصل."); return; }
  const linkedCount = (request.sections || []).length + new Set(rows.map(row => String(row.SCode))).size;
  const share = capacityShare(request.count, linkedCount);
  const links = [...new Map(rows.map(row => [String(row.SCode), { scheduleId: Number(row.id), sectionCode: String(row.SCode), capacity: share }])).values()];
  const next = await finish(req, res, request.id, current => linkSections(current, links, byLine(req), new Date().toISOString()),
    `طلب شعبة «${request.courseName}»: رُبطت الشعبة ${links.map(link => link.sectionCode).join("، ")}`);
  if (!next) return;
  /* السعةُ من العدد: تُكتب في رصيد مقاعد المرشد سعةً أساسية للشعبة، ولا تمحو سعةً كتبها المسؤول. */
  await Repository.updateFeatureDoc<SeatQuotaConfig, null>("advisorSeatLedgers", `config:${request.collegeId}:${request.sectionId}:${request.termId}`, current => {
    const config = normalizeQuotaConfig(current || {}, `${request.collegeId}:${request.sectionId}:${request.termId}`);
    const bySection = { ...(config.capacityBySection || {}) };
    let changed = false;
    for (const link of links) {
      const key = sectionKey(request.termId, request.courseId, link.sectionCode);
      if (!(Number(bySection[key]) > 0)) { bySection[key] = link.capacity; changed = true; }
    }
    return changed ? { next: { ...config, capacityBySection: bySection }, result: null } : { refuse: null };
  }).catch(error => console.warn("[section-requests] capacity:", error instanceof Error ? error.message : error));
  res.json({ ok: true, sections: next.sections, capacity: share });
});

app.post("/api/section-requests/:id/unlink", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const request = await guarded(req, res, "committee");
  if (!request) return;
  const code = clean(req.body?.sectionCode, 12);
  const next = await finish(req, res, request.id, current => unlinkSection(current, code, byLine(req), new Date().toISOString()), `طلب شعبة «${request.courseName}»: فُكّت الشعبة ${code}`);
  if (next) res.json({ ok: true, sections: next.sections });
});

app.post("/api/section-requests/:id/decline", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const request = await guarded(req, res, "committee");
  if (!request) return;
  const next = await finish(req, res, request.id, current => declineRequest(current, String(req.body?.note || ""), byLine(req), new Date().toISOString()), `طلب شعبة «${request.courseName}»: اعتذرت اللجنة`);
  if (!next) return;
  await pushTo(["advising"], next, sectionRequestMessage("declined", { id: next.id, courseName: next.courseName || "" }));
  res.json({ ok: true });
});

app.post("/api/section-requests/:id/withdraw", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const request = await guarded(req, res, "advising");
  if (!request) return;
  const next = await finish(req, res, request.id, current => withdrawRequest(current, byLine(req), new Date().toISOString()), `طلب شعبة «${request.courseName}»: سُحب`);
  if (next) res.json({ ok: true });
});

/** الاعتماد (اللجنة أو التسجيل): من في القائمة معتمَد، ومن سواه «لم يُعتمد». */
app.post("/api/section-requests/:id/approve", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const request = await readRequest(String(req.params.id || ""));
  if (!request) { fail(res, 404, "لا يوجد طلبٌ بهذا المعرّف."); return; }
  const powers = await powersOf(req, request);
  if (!powers.read) { fail(res, 404, "لا يوجد طلبٌ بهذا المعرّف."); return; }
  if (!powers.committee && !powers.registration) { fail(res, 403, "الاعتمادُ للجنة جدول قسم المقرر أو للتسجيل."); return; }
  if (await refuseIfTermFrozen(res, Number(request.termId))) return;
  const all = req.body?.all === true;
  const ids = all ? (request.students || []).map(row => row.id) : (Array.isArray(req.body?.studentIds) ? req.body.studentIds.map(String) : []);
  const next = await finish(req, res, request.id, current => approveStudents(current, all ? (current.students || []).map(row => row.id) : ids, byLine(req), new Date().toISOString()),
    `طلب شعبة «${request.courseName}»: اعتُمد ${all ? "الكل" : ids.length}`);
  if (!next) return;
  const counts = countsOf(next);
  await pushTo(["advising"], next, sectionRequestMessage("approved-advising", { id: next.id, courseName: next.courseName || "", approved: counts.approved, listed: counts.listed }));
  await pushTo(["registration"], next, sectionRequestMessage("approved-registration", { id: next.id, courseName: next.courseName || "", approved: counts.approved }));
  res.json({ ok: true, counts });
});

/** التسجيل يعلّم من سُجّل (أو يتراجع عن تعليمٍ خاطئ). */
app.post("/api/section-requests/:id/register", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const request = await guarded(req, res, "registration");
  if (!request) return;
  const all = req.body?.all === true;
  const registered = req.body?.registered !== false;
  const pick = (current: SectionRequest) => all ? (current.students || []).filter(row => row.approved === true && Boolean(row.registered) !== registered).map(row => row.id)
    : (Array.isArray(req.body?.studentIds) ? req.body.studentIds.map(String) : []);
  const next = await finish(req, res, request.id, current => markRegistered(current, pick(current), registered, byLine(req), new Date().toISOString()),
    `طلب شعبة «${request.courseName}»: ${registered ? "سُجّل" : "أُلغي تسجيل"} ${all ? "الكل" : (req.body?.studentIds || []).length}`);
  if (!next) return;
  const counts = countsOf(next);
  if (registered) await pushTo(["advising"], next, sectionRequestMessage("registered", { id: next.id, courseName: next.courseName || "", approved: counts.approved, registered: counts.registered }));
  res.json({ ok: true, counts });
});
}

/* ── طلبةُ «مساري» لمقررٍ بعينه ─────────────────────────────────────────────
 * ما يراه الإرشادُ في كشف التسجيل اليوم، لا أوسع: طلباتُ استبيان قسمه، أو طلباتٌ تسمّي مقرّراً
 * يملكه قسمٌ في نطاقه. ويُستثنى من سُجّل في المقرر فعلاً. */
function candidateVisible(req: AuthenticatedRequest, need: any, courses: any[], collegeId: number, fromSectionId: number, course: any): boolean {
  if (Number(need.AdCollegeId) !== collegeId) return false;
  const state = (need.courseStates || []).find((row: any) => Number(row.courseId) === Number(course.AdCourseId));
  if (state?.state === "registered" || state?.droppedByStudent) return false;
  if (sectionOwnsNeed(need, courses, fromSectionId)) return true;
  return isScopeAllowed(req, collegeId, Number(course.AdSectionId)) && sectionOwnsNeed(need, courses, Number(course.AdSectionId));
}

async function masariCandidates(req: AuthenticatedRequest, collegeId: number, fromSectionId: number, termId: number, courseId: number): Promise<any[]> {
  const [needs, courses] = await Promise.all([Repository.getStudentNeeds(collegeId, 0, termId), Repository.getCourses()]);
  const course = (courses as any[]).find(row => Number(row.AdCourseId) === courseId);
  if (!course) return [];
  return (needs as any[]).filter(need => (need.courseIds || []).map(Number).includes(courseId)
    && candidateVisible(req, need, courses as any[], collegeId, fromSectionId, course)).slice(0, SECTION_REQUEST_MAX_STUDENTS);
}
