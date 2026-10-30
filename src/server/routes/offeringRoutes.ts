/**
 * ── عروضُ المقررات ومرحلةُ المساعدين ومقاعدُ المرشدين ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { Response } from "express";
import { Repository } from "../../db/repository";
import { isTrainingAssistant } from "../../utils/taConversion";
import type { CurriculumRuleSet } from "../../types";
import { termLinkExpiresAt } from "../../utils/shareLinkLifetime";
import { normalizeInstructorDeadline } from "../../utils/instructorRequestWindows";
import { isFacultyPlaceholder } from "../../utils/placeholderInstructor";
import { isAdvisorRole, isReadOnlyRole } from "../../utils/academicRoles";
import { AR, countOf } from "../../utils/arabicCount";
import { planBadgesFor } from "../planBadgeShared";
import { dayKeysOf } from "../../utils/instructorRequestItems";
import { forgetOfferingStates } from "../offeringStates";
import { pushHooks } from "../pushRoutes";
import { isTaRequest } from "../../utils/requestParticipation";
import { emptyOfferingDoc, normalizeLevel, normalizeOfferingEntry, offeringDocId, offeringEntryIsDefault, suggestFutureCourses, type CourseInterestDoc, type CourseOfferingDoc } from "../../utils/courseOffering";
import { compactReach, forgetCourseReach, reachForScope } from "../courseReachShared";
import { alternativeSections, baseCapacityFor, nearFull, normalizeQuotaConfig, sectionKey, seatState, tryAddSeats, type SeatLedger, type SeatQuotaConfig } from "../../utils/advisorSeats";
import { countdown, dueWaves, phaseOpen, planWaves, vacantSections, vacantSummary, type TaPhaseDoc, type TaWave } from "../../utils/taPhase";
import { formatScheduleTimeRange } from "../../utils/scheduleTime";
import { refuseIfTermFrozen } from "../core/approvals";
import { type AuthenticatedRequest, requireAnyPermission, requireAuth, requirePermission } from "../core/auth";
import { instructorRequestSectionCourses, taPhaseId } from "../core/instructorRequests";
import { loadCapOf } from "../../utils/teachingLoad";
import { broadcastNotify } from "../core/liveChannel";
import { readLocationRegistry } from "../core/locations";
import { isScopeAllowed } from "../core/scope";
import { placeholderInstructorIds } from "../core/smartImport";
import { staffFamilyScopes, staffFamilyShareLinks } from "../core/staffCard";

/* ── F1–F3: مرحلة التدريب ──────────────────────────────────────────────────── */
async function sendTaWave(doc: TaPhaseDoc, wave: TaWave, by: { SystemUserId?: number; UserName?: string }) {
  const family = await staffFamilyScopes(doc.AdCollegeId, doc.AdSectionId);
  const existing = (await Promise.all(family.map(scope => Repository.getInstructorRequests(scope.collegeId, scope.sectionId, doc.AdTermId)))).flat();
  const terms = await Repository.getTerms();
  const term = terms.find(row => Number(row.AdTermId) === doc.AdTermId);
  const sent: Array<{ instructorId: number; linkId: string }> = [];
  for (const instructorId of wave.instructorIds) {
    const held = existing.find(row => Number(row.AdInstructorId) === instructorId && row.status !== "superseded");
    const heldLink = held ? await Repository.getShareLink(held.linkId) : null;
    if (held && heldLink && !heldLink.revoked && isTaRequest(held)) { sent.push({ instructorId, linkId: held.linkId }); continue; }
    const link = await Repository.createShareLink({
      AdCollegeId: doc.AdCollegeId, AdSectionId: doc.AdSectionId, AdTermId: doc.AdTermId,
      label: `مرحلة التدريب — ${instructorId}`,
      expiresAt: new Date(Math.max(Date.parse(doc.closesAt) + 86400000, Date.parse(termLinkExpiresAt(term)))).toISOString(),
      SystemUserId: Number(by.SystemUserId || 0), userName: String(by.UserName || ""),
      showInstructors: false, kind: "request", AdInstructorId: instructorId,
    } as any);
    if (held && !held.submittedAt) await Repository.saveInstructorRequest({ ...held, status: "superseded" } as any);
    await Repository.createInstructorRequest({
      AdCollegeId: doc.AdCollegeId, AdSectionId: doc.AdSectionId, AdTermId: doc.AdTermId, AdInstructorId: instructorId,
      linkId: link.id, window: { opensAt: new Date().toISOString(), closesAt: doc.closesAt }, source: "draft", status: "sent", linkMode: "ta",
      items: held?.items?.filter(item => item.action === "keep") || [],
      timeline: [{ kind: "link-created", at: new Date().toISOString(), by: "القسم", detail: `🎓 مرحلة التدريب · موجة ${wave.n}` }],
    } as any);
    sent.push({ instructorId, linkId: link.id });
  }
  return sent;
}

/** يرسل كلَّ موجةٍ حلّ موعدها (يُستدعى عند القراءة ودورياً). ذرّيٌّ: الموجة تُعلَّم مرسلةً قبل الإرسال. */
async function dispatchTaWaves(id: string, by: { SystemUserId?: number; UserName?: string } = {}) {
  const claimed = await Repository.updateFeatureDoc<TaPhaseDoc, TaWave[]>("taPhases", id, current => {
    if (!current) return { refuse: [] };
    const due = dueWaves(current);
    if (!due.length) return { refuse: [] };
    const at = new Date().toISOString();
    return { next: { ...current, waves: current.waves.map(wave => due.some(d => d.n === wave.n) ? { ...wave, sentAt: at } : wave) }, result: due };
  });
  if (!claimed.ok) return [];
  const doc = claimed.next;
  const out = [];
  for (const wave of claimed.result) out.push(...await sendTaWave(doc, wave, by));
  if (out.length) broadcastNotify(Repository.currentDemoSessionId());
  if (out.length) await pushHooks.taWindowOpened(doc.closesAt, out);
  return out;
}

/* موجاتُ التدريب المجدولة تُرسل دورياً أيضاً (لا تنتظر قراءة اللوحة). */
setInterval(() => {
  void Repository.listFeatureDocs<TaPhaseDoc>("taPhases").then(docs => Promise.all(docs.filter(doc => dueWaves(doc).length).map(doc => dispatchTaWaves(doc.id)))).catch(() => undefined);
}, 10 * 60 * 1000).unref();

/* ── L3: 🎟️ رصيد مقاعد المرشد ─────────────────────────────────────────────── */
const seatConfigId = (collegeId: number, sectionId: number, termId: number) => `${collegeId}:${sectionId}:${termId}`;

async function seatSections(collegeId: number, sectionId: number, termId: number, config: SeatQuotaConfig | null) {
  const [rows, courses, registry, ledgers] = await Promise.all([
    Repository.getSchedulesByScope({ collegeId, sectionId, termId }), Repository.getCourses(), readLocationRegistry(),
    Repository.listFeatureDocs<SeatLedger>("advisorSeatLedgers", `${termId}:`),
  ]);
  const courseName = new Map(courses.map(row => [Number(row.AdCourseId), String(row.CourseName || "")]));
  const ledgerById = new Map(ledgers.map(row => [row.id, row]));
  const groups = new Map<string, any[]>();
  for (const row of rows as any[]) { const key = sectionKey(termId, Number(row.AdCourseId), String(row.SCode || row.id)); groups.set(key, [...(groups.get(key) || []), row]); }
  return [...groups].map(([key, list]) => {
    const first = list[0];
    const roomCaps = list.map(row => Number(registry.rooms.find((room: any) => room.id === row.roomId)?.capacity || 0)).filter(n => n > 0);
    const stored = ledgerById.get(key);
    const ledger: SeatLedger = { id: key, courseId: Number(first.AdCourseId), capacity: baseCapacityFor(config, key),
      roomCapacity: roomCaps.length ? Math.min(...roomCaps) : null, adds: stored?.adds || [] };
    return { key, courseId: ledger.courseId, courseName: courseName.get(ledger.courseId) || "", section: String(first.SCode || ""),
      time: formatScheduleTimeRange(first.fstarttime, first.fendtime), days: dayKeysOf(first), ledger, state: seatState(ledger, config) };
  }).sort((a, b) => a.courseName.localeCompare(b.courseName, "ar") || a.section.localeCompare(b.section));
}

export function registerOfferingRoutes(app: Express): void {

/* ── C5: لوحة المسؤول لحالة الطرح ──────────────────────────────────────────── */
app.get("/api/course-offering", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0), sectionId = Number(req.query.sectionId || 0), termId = Number(req.query.termId || 0);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج نطاق القسم والفصل." }); return; }
  const id = offeringDocId(collegeId, sectionId, termId);
  const [doc, interest, catalogue, termRows, instructors, badges, rules] = await Promise.all([
    Repository.getFeatureDoc<CourseOfferingDoc>("courseOfferingStates", id),
    Repository.getFeatureDoc<CourseInterestDoc>("courseInterest", id),
    instructorRequestSectionCourses(sectionId),
    Repository.getSchedulesByScope({ collegeId, sectionId, termId }),
    Repository.getInstructors(),
    Promise.resolve(null),
    Repository.listRuleSets().catch(() => [] as CurriculumRuleSet[]),
  ]);
  void badges;
  const courses = (catalogue as any[]).filter(row => Number(row.AdCollegeId) === collegeId)
    .map(row => ({ id: Number(row.AdCourseId), name: String(row.CourseName || ""), code: String(row.CourseCode || "") })).filter(row => row.id);
  const levelOf = new Map<number, number>();
  for (const set of (rules as CurriculumRuleSet[]).filter(set => Number(set.AdSectionId) === sectionId && set.status !== "review")) for (const rule of set.rules || []) if (rule?.level) levelOf.set(Number(rule.courseId), Number(rule.level));
  const scheduled = new Set((termRows as any[]).map(row => Number(row.AdCourseId)));
  const names = new Map(instructors.map(row => [Number(row.AdInstructorId), String(row.AdInstructorName || "")]));
  const planBadges = await planBadgesFor(courses.map(course => ({ courseId: course.id, sectionId })));
  const newPlanIds = courses.map(course => course.id).filter(cid => Boolean(planBadges[`${sectionId}:${cid}`]));
  /* «لم نصل بعد» من المصدر الواحد، وتبويبا الصحيفة الجديدة والقديمة من عضويتها. */
  const reach = compactReach(await reachForScope(collegeId, sectionId, termId));
  res.setHeader("Cache-Control", "no-store");
  res.json({
    doc: doc || emptyOfferingDoc(collegeId, sectionId, termId),
    reach,
    courses: courses.map(course => ({ ...course, level: normalizeLevel(levelOf.get(course.id)), sections: new Set((termRows as any[]).filter(row => Number(row.AdCourseId) === course.id).map(row => String(row.SCode || row.id))).size })),
    suggestions: suggestFutureCourses({ newPlanCourseIds: newPlanIds, levelOf: cid => levelOf.get(cid) || 0, scheduledCourseIds: scheduled }),
    interest: Object.entries(interest?.byCourse || {}).map(([courseId, ids]) => ({ courseId: Number(courseId), instructors: (ids as number[]).map(i => names.get(Number(i)) || `#${i}`) })),
  });
});

app.put("/api/course-offering", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.body?.collegeId || 0), sectionId = Number(req.body?.sectionId || 0), termId = Number(req.body?.termId || 0);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج نطاق القسم والفصل." }); return; }
  const by = String(req.user?.Name || req.user?.UserName || "");
  const id = offeringDocId(collegeId, sectionId, termId);
  const entries = (Array.isArray(req.body?.courses) ? req.body.courses : []).map((row: any) => normalizeOfferingEntry(row, by)).filter(Boolean) as any[];
  const saved = await Repository.updateFeatureDoc<CourseOfferingDoc, number>("courseOfferingStates", id, current => {
    const next = { ...(current || emptyOfferingDoc(collegeId, sectionId, termId)), updatedAt: new Date().toISOString() };
    if (req.body?.display === "hide" || req.body?.display === "fade") next.display = req.body.display;
    next.courses = { ...(next.courses || {}) };
    /* «افتحه للطرح» يبقى ما لم يُرسَل صراحةً: حفظُ الحالة لا يمحو قرارَ الفتح. */
    const sent = new Map((Array.isArray(req.body?.courses) ? req.body.courses : []).map((row: any) => [Number(row?.courseId || 0), row]));
    for (const entry of entries) {
      const prior = next.courses[String(entry.courseId)];
      if (typeof (sent.get(entry.courseId) as any)?.reachOpen !== "boolean" && prior?.reachOpen) entry.reachOpen = true;
      if (offeringEntryIsDefault(entry)) delete next.courses[String(entry.courseId)]; else next.courses[String(entry.courseId)] = entry;
    }
    return { next, result: entries.length };
  });
  forgetOfferingStates();
  forgetCourseReach();
  res.locals.auditChanges = `حالة طرح المقررات: ${entries.map((e: any) => `${e.courseId}=${e.state}`).join("، ")}${req.body?.display ? ` · العرض: ${req.body.display}` : ""}`;
  res.json(saved.ok ? saved.next : {});
});

/* ── «لم نصل بعد إلى هذا المستوى»: الحكمُ الواحد لكل مقررات القسم في كليته ─────── */
app.get("/api/course-reach", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0), sectionId = Number(req.query.sectionId || 0), termId = Number(req.query.termId || 0);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج نطاق القسم والفصل." }); return; }
  res.setHeader("Cache-Control", "no-store");
  res.json(compactReach(await reachForScope(collegeId, sectionId, termId)));
});

/* «افتحه للطرح» (أو أعِده للقاعدة): قرارُ القسم يُحفظ في وثيقة حالة الطرح نفسها، فيقرؤه كلُّ مكان. */
app.post("/api/course-reach/open", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.body?.collegeId || 0), sectionId = Number(req.body?.sectionId || 0), termId = Number(req.body?.termId || 0), courseId = Number(req.body?.courseId || 0);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج نطاق القسم والفصل." }); return; }
  if (isReadOnlyRole(req.user?.Role)) { res.status(403).json({ error: "للعرض فقط." }); return; }
  if (!courseId) { res.status(400).json({ error: "اختر المقرر." }); return; }
  const open = req.body?.open !== false;
  const by = String(req.user?.Name || req.user?.UserName || "");
  const id = offeringDocId(collegeId, sectionId, termId);
  await Repository.updateFeatureDoc<CourseOfferingDoc, boolean>("courseOfferingStates", id, current => {
    const next = { ...(current || emptyOfferingDoc(collegeId, sectionId, termId)), updatedAt: new Date().toISOString() };
    next.courses = { ...(next.courses || {}) };
    const prior = next.courses[String(courseId)];
    const entry = { ...(prior && !prior.suggested ? prior : { courseId, state: "offered" as const }), updatedAt: new Date().toISOString(), ...(by ? { updatedBy: by } : {}) };
    if (open) entry.reachOpen = true; else delete entry.reachOpen;
    if (offeringEntryIsDefault(entry)) delete next.courses[String(courseId)]; else next.courses[String(courseId)] = entry;
    return { next, result: true };
  });
  forgetOfferingStates();
  forgetCourseReach();
  res.locals.auditChanges = `${open ? "افتحه للطرح" : "أُعيد للقاعدة"}: المقرر ${courseId}`;
  res.json(compactReach(await reachForScope(collegeId, sectionId, termId)));
});

app.get("/api/ta-phase", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0), sectionId = Number(req.query.sectionId || 0), termId = Number(req.query.termId || 0);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج نطاق القسم والفصل." }); return; }
  const id = taPhaseId(collegeId, sectionId, termId);
  await dispatchTaWaves(id, req.user || {}).catch(() => []);
  const family = await staffFamilyScopes(collegeId, sectionId);
  const [doc, instructors, courses, rowsByScope, staffLinks, requests] = await Promise.all([
    Repository.getFeatureDoc<TaPhaseDoc>("taPhases", id), Repository.getInstructors(termId), Repository.getCourses(),
    Promise.all(family.map(scope => Repository.getSchedulesByScope({ collegeId: scope.collegeId, sectionId: scope.sectionId, termId }))),
    staffFamilyShareLinks(collegeId, sectionId, termId),
    Promise.all(family.map(scope => Repository.getInstructorRequests(scope.collegeId, scope.sectionId, termId))),
  ]);
  const placeholders = placeholderInstructorIds(instructors as any);
  const vacant = vacantSections(rowsByScope.flat() as any, placeholders);
  const courseName = new Map(courses.map(row => [Number(row.AdCourseId), String(row.CourseName || "")]));
  const live = staffLinks.find(link => !link.revoked && Date.parse(link.expiresAt) > Date.now());
  const facultyClosesAt = String(live?.requestsCloseAt || "");
  const taRequests = requests.flat().filter(row => row.status !== "superseded");
  res.setHeader("Cache-Control", "no-store");
  res.json({
    doc, open: phaseOpen(doc), countdown: doc ? countdown(doc) : null,
    facultyPhase: { closesAt: facultyClosesAt, closed: !facultyClosesAt || Date.parse(facultyClosesAt) < Date.now() },
    vacant: vacant.map(row => ({ ...row, courseName: courseName.get(row.courseId) || "" })), summary: vacantSummary(vacant),
    tas: instructors.filter(isTrainingAssistant).filter(row => !isFacultyPlaceholder(row)).map(row => {
      const own = taRequests.find(r => Number(r.AdInstructorId) === Number(row.AdInstructorId) && isTaRequest(r));
      return { id: Number(row.AdInstructorId), name: String(row.AdInstructorName || ""), load: loadCapOf(row),
        chosen: (own?.items || []).filter(item => item.offeringRowIds?.length).length, opened: !!((own as any)?.linkOpenedAt || (own as any)?.openedAt), sent: !!own,
        /* للتذكير بواتساب (يضغط المنسّقُ «إرسال»): رابطُه الشخصيّ ورقمُه من سجلّه. */
        linkId: own?.linkId || "", mobile: String(row.AdInstructorMobile || ""),
        allowed: (doc?.allowedCourses || {})[String(row.AdInstructorId)] || [] };
    }),
    /* مقرراتُ القسم لاختيار «المسموح» لكل مدرّب (شرائح). */
    courses: (await instructorRequestSectionCourses(sectionId) as any[]).filter(row => Number(row.AdCollegeId) === collegeId)
      .map(row => ({ id: Number(row.AdCourseId), name: String(row.CourseName || ""), code: String(row.CourseCode || "") })).filter(row => row.id),
  });
});

/** F3: المقررات المسموحة لكل مدرّب — قبل فتح المرحلة أو أثناءها. */
app.post("/api/ta-phase/allowed", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.body?.collegeId || 0), sectionId = Number(req.body?.sectionId || 0), termId = Number(req.body?.termId || 0);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج نطاق القسم والفصل." }); return; }
  const instructorId = Number(req.body?.instructorId || 0);
  const courseIds = [...new Set((Array.isArray(req.body?.courseIds) ? req.body.courseIds : []).map(Number).filter(Boolean))] as number[];
  if (!instructorId) { res.status(400).json({ error: "اختر المدرّب." }); return; }
  const id = taPhaseId(collegeId, sectionId, termId);
  const out = await Repository.updateFeatureDoc<TaPhaseDoc, boolean>("taPhases", id, current => {
    if (!current) return { refuse: false };
    const allowed = { ...(current.allowedCourses || {}) };
    if (courseIds.length) allowed[String(instructorId)] = courseIds; else delete allowed[String(instructorId)];
    return { next: { ...current, allowedCourses: allowed }, result: true };
  });
  res.locals.auditChanges = `مرحلة التدريب: المقررات المسموحة للمدرّب ${instructorId} (${courseIds.length || "الكل"})`;
  res.json({ ok: out.ok });
});

app.post("/api/ta-phase/open", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.body?.collegeId || 0), sectionId = Number(req.body?.sectionId || 0), termId = Number(req.body?.termId || 0);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج نطاق القسم والفصل." }); return; }
  if (await refuseIfTermFrozen(res, termId)) return;
  const closesAt = normalizeInstructorDeadline(String(req.body?.closesAt || ""));
  if (!closesAt || Date.parse(closesAt) <= Date.now()) { res.status(400).json({ error: "اختر موعد إغلاقٍ قادماً بتوقيت الكويت." }); return; }
  const instructors = await Repository.getInstructors();
  const taIds = new Set(instructors.filter(isTrainingAssistant).map(row => Number(row.AdInstructorId)));
  const groups = (Array.isArray(req.body?.waves) ? req.body.waves : []).map((list: any) => (Array.isArray(list) ? list : []).map(Number).filter((n: number) => taIds.has(n)));
  const waves = planWaves(groups, Number(req.body?.delayHours || 0));
  if (!waves.length) { res.status(400).json({ error: "اختر مدرّباً واحداً على الأقل." }); return; }
  const allowed: Record<string, number[]> = {};
  for (const [key, list] of Object.entries(req.body?.allowedCourses || {})) if (Array.isArray(list) && list.length) allowed[String(Number(key))] = (list as any[]).map(Number).filter(Boolean);
  const id = taPhaseId(collegeId, sectionId, termId);
  const doc: TaPhaseDoc = { id, AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId, openedAt: new Date().toISOString(),
    openedBy: String(req.user?.Name || req.user?.UserName || ""), closesAt, waves, allowedCourses: allowed,
    reminderHours: Math.max(1, Math.min(168, Number(req.body?.reminderHours || 24))) };
  await Repository.saveFeatureDoc("taPhases", id, doc);
  const sent = await dispatchTaWaves(id, req.user || {});
  await Repository.saveFeatureDoc("linkModeLog", `${id}:${Date.now()}`, { at: doc.openedAt, by: doc.openedBy, mode: "ta", scope: id, instructorIds: sent.map(row => row.instructorId) });
  res.locals.auditChanges = `فتح مرحلة التدريب حتى ${closesAt} · ${waves.length} موجة · أُرسل لـ${sent.length}`;
  res.json({ doc: await Repository.getFeatureDoc("taPhases", id), sent });
});

app.post("/api/ta-phase/close", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.body?.collegeId || 0), sectionId = Number(req.body?.sectionId || 0), termId = Number(req.body?.termId || 0);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج نطاق القسم والفصل." }); return; }
  const id = taPhaseId(collegeId, sectionId, termId);
  const out = await Repository.updateFeatureDoc<TaPhaseDoc, boolean>("taPhases", id, current => current ? { next: { ...current, closedAt: new Date().toISOString() }, result: true } : { refuse: false });
  res.locals.auditChanges = "إغلاق مرحلة التدريب";
  res.json({ ok: out.ok });
});

app.get("/api/advisor-seats", requireAnyPermission([7, 14]), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0), sectionId = Number(req.query.sectionId || 0), termId = Number(req.query.termId || 0);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج نطاق القسم والفصل." }); return; }
  const id = seatConfigId(collegeId, sectionId, termId);
  const [config, requests] = await Promise.all([
    Repository.getFeatureDoc<SeatQuotaConfig>("advisorSeatLedgers", `config:${id}`),
    Repository.listFeatureDocs<any>("advisorSeatRequests", `${id}:`),
  ]);
  const sections = await seatSections(collegeId, sectionId, termId, config);
  res.setHeader("Cache-Control", "no-store");
  res.json({ config: config || normalizeQuotaConfig({}, id), sections,
    nearFull: nearFull(sections.map(row => row.ledger), config).map(row => ({ key: row.ledger.id, state: row.state, byAdvisor: row.byAdvisor })),
    requests: requests.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 50),
    canConfigure: !isAdvisorRole(req.user?.Role) && !isReadOnlyRole(req.user?.Role) });
});

app.put("/api/advisor-seats/config", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.body?.collegeId || 0), sectionId = Number(req.body?.sectionId || 0), termId = Number(req.body?.termId || 0);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج نطاق القسم والفصل." }); return; }
  const id = seatConfigId(collegeId, sectionId, termId);
  const config = normalizeQuotaConfig(req.body?.config, id);
  await Repository.saveFeatureDoc("advisorSeatLedgers", `config:${id}`, config);
  res.locals.auditChanges = `رصيد مقاعد المرشد: عام ${config.global}${config.capacityDefault ? ` · سعة ${config.capacityDefault}` : ""}${config.fairSplit ? " · توزيع عادل" : ""}`;
  res.json(config);
});

app.post("/api/advisor-seats/add", requireAnyPermission([7, 14]), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.body?.collegeId || 0), sectionId = Number(req.body?.sectionId || 0), termId = Number(req.body?.termId || 0);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج نطاق القسم والفصل." }); return; }
  const id = seatConfigId(collegeId, sectionId, termId);
  const config = await Repository.getFeatureDoc<SeatQuotaConfig>("advisorSeatLedgers", `config:${id}`);
  const sections = await seatSections(collegeId, sectionId, termId, config);
  const target = sections.find(row => row.key === String(req.body?.key || ""));
  if (!target) { res.status(404).json({ error: "الشعبة ليست في جدول هذا القسم." }); return; }
  if (!target.ledger.capacity) { res.status(409).json({ error: "لم تُحدَّد السعة الأساسية لهذه الشعبة بعد.", icon: "⛔" }); return; }
  const advisor = { id: Number(req.user?.SystemUserId || 0), name: String(req.user?.Name || req.user?.UserName || "مرشد") };
  /* ذرّي: تُقرأ الشعبة وتُكتب في معاملةٍ واحدة؛ مرشدان معاً لا يتجاوزان السقف. */
  const out = await Repository.updateFeatureDoc<SeatLedger, ReturnType<typeof tryAddSeats>["result"]>("advisorSeatLedgers", target.key, current => {
    const ledger: SeatLedger = { ...target.ledger, adds: current?.adds || [] };
    const attempt = tryAddSeats(ledger, config, advisor, Number(req.body?.count || 1));
    return attempt.next ? { next: attempt.next, result: attempt.result } : { refuse: attempt.result };
  });
  const result: any = out.result;
  const alternatives = result.ok ? [] : alternativeSections(sections.map(row => ({ key: row.key, section: row.section, time: row.time, ledger: row.ledger })), target.courseId, target.key, config)
    .slice(0, 3).map(row => ({ key: row.key, section: row.section, time: row.time, remaining: row.state.remaining }));
  if (out.ok) res.locals.auditChanges = `مرشد: +${countOf(result.added, AR.seat)} · ${target.courseName} (${target.section})`;
  res.status(out.ok ? 200 : 409).json({ ...result, alternatives, ...(out.ok ? { state: seatState(out.next as SeatLedger, config) } : {}) });
});

app.post("/api/advisor-seats/exception", requireAnyPermission([7, 14]), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.body?.collegeId || 0), sectionId = Number(req.body?.sectionId || 0), termId = Number(req.body?.termId || 0);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج نطاق القسم والفصل." }); return; }
  const id = seatConfigId(collegeId, sectionId, termId);
  const key = String(req.body?.key || "").slice(0, 80), count = Math.max(1, Math.min(50, Math.trunc(Number(req.body?.count || 1))));
  const note = String(req.body?.note || "").trim().slice(0, 300);
  const at = new Date().toISOString();
  const row = { id: `${id}:${Date.now()}`, scope: id, key, count, note, at, by: String(req.user?.Name || req.user?.UserName || "مرشد"), status: "pending" };
  await Repository.saveFeatureDoc("advisorSeatRequests", row.id, row);
  broadcastNotify(Repository.currentDemoSessionId());
  res.json({ ok: true, request: row, hint: "طلبك عند المسؤول · قد يقترح فتح شعبة جديدة" });
});
}
