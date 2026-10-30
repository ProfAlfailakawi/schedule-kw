/**
 * ── الدخولُ والجلسة والبيئةُ التجريبية ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { Request, Response, NextFunction } from "express";
import { rateLimit } from "express-rate-limit";
import { randomBytes } from "crypto";
import { activeDataMode, Repository, caseRefFor } from "../../db/repository";
import { DEMO_SWITCH_ACCOUNTS, demoActiveRoleKey } from "../../db/demoSandbox";
import { generateSyntheticCivilId, normalizeCivilId } from "../../utils/civilId";
import { ensureSectionFaculty } from "../sectionFaculty";
import type { FSchedule, InstructorRequest, StudentNeed } from "../../types";
import { seedDemoStudyProposals } from "../studyProposalRoutes";
import { requestsCloseAtFromDate, termLinkExpiresAt } from "../../utils/shareLinkLifetime";
import { isSessionIdShape } from "../anonymousGuard";
import { verificationCode, kuwaitDateISO } from "../../utils/approvalWorkflow";
import { effectiveCourseHours } from "../../utils/scheduleRegulations";
import { canExtendDeadline, canManageDeadline, canReviewSubmissions, canAnnotateCells, isAcademicRole, isAdvisorRole, isViewerOnlyRole, roleDefinition, roleLabel, signatureStage, watchesInbox } from "../../utils/academicRoles";
import { seedDemoRadar, seedDemoMasariDemand } from "../demoRadarSeed";
import { seedDemoOtherDepartmentStories } from "../demoPreviousTermSeed";
import { seedDemoSectionRequests } from "../demoSectionRequestsSeed";
import { dayKeysOf, DAY_LETTERS, requestItemFromRow } from "../../utils/instructorRequestItems";
import { currentPasswordWaived, decidePasswordChange, initialPasswordMark, LEGACY_SHARED_PASSWORD } from "../accountPassword";
import { endForRequest, requestFullySettled, weeklyLoadOf, type RequestDayKey } from "../../utils/instructorRequestVerdict";
import { pushHooks } from "../pushRoutes";
import { seatIdentity } from "../seats";
import { authCache, type AuthenticatedRequest, deadSessions, DEMO_SESSION_GONE, DEMO_SESSION_TTL_MS, getCookies, requireAuth, ROOT_ADMIN_USER_ID, SERVER_IDLE_SESSION_MS, sessionTouchedAt } from "../core/auth";
import { DEMO_STORY_SCOPE, demoTeacherRequest } from "../core/demo";
import { judgeRequestItems, REQUEST_LINK_DAYS } from "../core/instructorRequests";
import { boardScopeKey, emptyMark, markPresenceDirty, type ScheduleEventClient, scheduleEventClients } from "../core/liveChannel";
import { isScopeAllowed, safeSystemUser } from "../core/scope";
import { shareLinkLabel } from "../core/shareLinks";
import { placeholderInstructorIds } from "../core/smartImport";
import { graduateThreshold, sealStudentIdentity, surveyFingerprint } from "../core/studentIdentity";
import { loadCapOf } from "../../utils/teachingLoad";

// Rate limiting for login (simple in-memory)
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
function rateLimitLogin(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const attempt = loginAttempts.get(ip);
  if (attempt) {
    if (attempt.count >= 5 && now - attempt.lastAttempt < 60000) {
      res.status(429).json({ error: "محاولات تسجيل دخول كثيرة جداً. يرجى المحاولة بعد دقيقة." });
      return;
    }
    if (now - attempt.lastAttempt > 60000) {
      loginAttempts.set(ip, { count: 1, lastAttempt: now });
    } else {
      attempt.count += 1;
      attempt.lastAttempt = now;
    }
  } else {
    loginAttempts.set(ip, { count: 1, lastAttempt: now });
  }
  next();
}

const rateLimitDemoRole = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تبديلاتٌ كثيرة جداً في وقتٍ قصير. انتظر قليلاً ثم أعد المحاولة." },
});

export function forgetAuthSession(sessionId?: string) {
  if (sessionId) { authCache.delete(sessionId); sessionTouchedAt.delete(sessionId); }
  else { authCache.clear(); sessionTouchedAt.clear(); }
}


// Client-facing scope labels: authorization still uses the numeric assignments,
 // while the shell can show the real department/college name instead of a generic role.
async function clientScopeDetails(scopes: any[]) {
  if (!Array.isArray(scopes) || !scopes.length) return [];
  const [sections, colleges] = await Promise.all([
    Repository.getSections().catch(() => []),
    Repository.getColleges().catch(() => []),
  ]);
  const sectionById = new Map<number, string>(
    sections.map((row: any) => [Number(row.AdSectionId), String(row.AdSectionName || "")] as [number, string]),
  );
  const collegeById = new Map<number, string>(
    colleges.map((row: any) => [Number(row.AdCollegeId), String(row.AdCollegeName || "")] as [number, string]),
  );
  /* ── نطاقُ الكلية الكاملة يُبسَط قبل أن يصل الواجهة ──────────────────────
   *
   * الخادم يمثّل «كلية كاملة» بصفٍّ واحدٍ قسمُه صفر (العميد، والعميد المساعد،
   * وعميد التسجيل، وكل الكليات). لكنّ مُحلّلَ النطاق في الواجهة يُسقط كل صفٍّ
   * بلا قسمٍ غير صفريّ، فيبقى منتقي الكلية فارغاً ويهبط العميدُ على تقرير
   * الأقسام بلا ما يختار — وهو ما كشفته مراجعةٌ آلية حين جُرّب العميد فعلاً.
   *
   * فيُبسَط الصفرُ هنا إلى صفٍّ لكل قسمٍ في تلك الكلية: تسميةٌ للعرض فقط، لا
   * تمسّ الإذن (الحارسُ يقرأ `req.scopes` الخام بصفره)، فيرى العميدُ أقسام
   * كليته ويختار بينها. */
  const sectionsByCollege = new Map<number, any[]>();
  for (const section of sections as any[]) {
    const collegeId = Number(section.AdCollegeId);
    const list = sectionsByCollege.get(collegeId);
    if (list) list.push(section); else sectionsByCollege.set(collegeId, [section]);
  }
  const out: any[] = [];
  const seen = new Set<string>();
  /* والصفّ المبسوط يحمل وسمَ «الكلية كلها»: الواجهة تُبقي منتقي القسم لمن
     نطاقُه الكلية كلها ولو لم تضمّ الكلية اليوم إلا قسماً واحداً
     (singleDepartmentOf). وسمٌ للعرض فقط؛ الإذن يقرأ الصفر الخام. */
  const wideColleges = new Set<number>();
  for (const scope of scopes) if (Number(scope.AdSectionId) === 0) wideColleges.add(Number(scope.AdCollegeId));
  const push = (collegeId: number, sectionId: number, sectionName?: string) => {
    const key = `${collegeId}:${sectionId}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      AdCollegeId: collegeId, AdSectionId: sectionId,
      AdSectionName: sectionName ?? sectionById.get(sectionId) ?? "",
      AdCollegeName: collegeById.get(collegeId) || "",
      ...(wideColleges.has(collegeId) ? { AdCollegeWide: true } : {}),
    });
  };
  for (const scope of scopes) {
    const collegeId = Number(scope.AdCollegeId);
    const sectionId = Number(scope.AdSectionId);
    if (sectionId === 0) {
      for (const section of sectionsByCollege.get(collegeId) || []) {
        push(collegeId, Number(section.AdSectionId), String(section.AdSectionName || ""));
      }
    } else {
      push(collegeId, sectionId);
    }
  }
  return out;
}

// --- AUTH API ---

/*
 * ── حمولة الجلسة التجريبية ───────────────────────────────────────────────────
 *
 * موضعٌ واحد يبني ما تصل الواجهةَ عن هوية Demo: الدخول، والاستعادة، وتبديل
 * الصفة يقولون الشيء نفسه فلا يفترقون. ويحمل قائمةَ الصفات التي يبدّل بينها
 * الشريط، والصفةَ الحاضرة الآن — «admin» لعرض المدير، وإلا معرّف الصفة.
 */
function demoSessionPayload(user: any, permissions: number[], scopes: any[]) {
  const isAdmin = Number(user.SystemUserId) === ROOT_ADMIN_USER_ID;
  const activeRole = isAdmin ? "admin" : demoActiveRoleKey(Number(user.SystemUserId), user.Role);
  return {
    user: { ...safeSystemUser(user), IsRootAdmin: isAdmin, IsDemo: true },
    role: roleDescriptor(user), permissions, scopes, data: "demo",
    /* الصفاتُ كلّها ثم الحسابُ المتعدّد المواقع (DEMO_SWITCH_ACCOUNTS). */
    demo: { expiresInMs: DEMO_SESSION_TTL_MS, adminReadOnly: true, roles: DEMO_SWITCH_ACCOUNTS, activeRole,
      seedStatus: demoSeedStatus.get(Repository.currentDemoSessionId()) || "preparing" },
  };
}

async function readDemoIdentity(userId: number) {
  const user = await Repository.getUserById(userId);
  if (!user) throw new Error("تعذّر إنشاء هوية البيئة التجريبية");
  const permissions = (await Repository.getSecurityByUser(user.SystemUserId)).map(row => row.FormNameId);
  const scopes = await clientScopeDetails(await Repository.getUserAssigns(user.SystemUserId));
  return { user, permissions, scopes };
}
const demoSeedJobs = new Map<string, Promise<void>>();
const demoSeedStatus = new Map<string, "preparing" | "ready" | "failed">();

/** The core sandbox is ready at login; the larger showcase stories are prepared
 *  in the background so building 64 synthetic student profiles never holds
 *  the sign-in response open. Jobs are serialized per session so a reset cannot
 *  race an older seed and leave the replacement sandbox half-populated. */
function scheduleDemoExtras(sessionId: string): void {
  demoSeedStatus.set(sessionId, "preparing");
  const previous = demoSeedJobs.get(sessionId) || Promise.resolve();
  const job = previous.catch(() => undefined).then(() => Repository.withDemoSandbox(sessionId, async () => {
    const failures: string[] = [];
    const run = async (name: string, seed: () => Promise<void>) => {
      try { await seed(); }
      catch (error) { failures.push(name); console.error(`[demo] seeding ${name} failed:`, error); }
    };
    await run("stories", seedDemoStories);
    /* كشفُ التسجيل والرغباتُ والمقترحات للقسمين الآخرين، قبل الرادار فلا يُعلَّم قديماً بعده. */
    await run("other departments", () => seedDemoOtherDepartmentStories({ sealIdentity: sealStudentIdentity, fingerprintOf: surveyFingerprint, requestItemFromRow, dayLetters: DAY_LETTERS, judge: request => judgeRequestItems(request) }, DEMO_STORY_SCOPE.termId));
    await run("radar", () => seedDemoRadar({ sealIdentity: sealStudentIdentity, today: kuwaitDateISO() }));
    await run("Masari demand", seedDemoMasariDemand);
    /* طلباتُ الشعب بعد رغبات «مساري»: الطلبُ المرسَل للتوّ يحمل الطلبةَ الذين طلبوا المقرر. */
    await run("section requests", () => seedDemoSectionRequests({ sealIdentity: sealStudentIdentity }));
    if (failures.length) throw new Error(`Demo seed incomplete: ${failures.join(", ")}`);
  }));
  const tracked = job.then(() => {
    if (demoSeedJobs.get(sessionId) === tracked) demoSeedStatus.set(sessionId, "ready");
  }).catch(error => {
    if (demoSeedJobs.get(sessionId) === tracked) demoSeedStatus.set(sessionId, "failed");
    console.error("[demo] showcase preparation failed:", error);
  }).finally(() => {
    if (demoSeedJobs.get(sessionId) === tracked) demoSeedJobs.delete(sessionId);
  });
  demoSeedJobs.set(sessionId, tracked);
}

/** مقرّراتٌ إضافيةٌ لأستاذ التجربة في جدول البيئة التجريبية وحدها: ثلاثةُ مقرّراتٍ يدرّسها غيرُه في القسم،
 *  كلٌّ بشعبةٍ جديدة في وقتٍ خالٍ له ولقاعته. */
async function seedDemoTeacherCourses(instructorId: number, scopeRows: FSchedule[], termRows: FSchedule[]): Promise<FSchedule[]> {
  if (!Repository.isDemoRequest()) return [];
  const DAYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
  const toMin = (value: string) => { const [h, m] = String(value || "").split(":").map(Number); return h * 60 + m; };
  const overlaps = (row: any, days: readonly string[], start: number, end: number) =>
    days.some(day => row[day]) && toMin(row.fstarttime) < end && start < toMin(row.fendtime);
  const ownCourses = new Set(termRows.filter(row => Number(row.AdInstructorId) === instructorId).map(row => Number(row.AdCourseId)));
  const templates = [...new Map(scopeRows.filter(row => !ownCourses.has(Number(row.AdCourseId)) && row.roomId)
    .map(row => [Number(row.AdCourseId), row] as [number, FSchedule])).values()].slice(0, 3);
  const slots: Array<{ days: readonly string[]; start: string; end: string }> = [
    { days: ["fsunday", "ftuesday", "fthursday"], start: "08:00", end: "08:50" },
    { days: ["fmonday", "fwednesday"], start: "09:30", end: "10:50" },
    { days: ["fsunday", "ftuesday", "fthursday"], start: "13:00", end: "13:50" },
    { days: ["fmonday", "fwednesday"], start: "12:30", end: "13:50" },
    { days: ["fsunday", "ftuesday", "fthursday"], start: "09:00", end: "09:50" },
    { days: ["fmonday", "fwednesday"], start: "14:00", end: "15:20" },
  ];
  const rooms = [...new Map(scopeRows.filter(row => row.roomId).map(row => [String(row.roomId), row] as [string, FSchedule])).values()];
  const universe: any[] = [...termRows];
  const made: FSchedule[] = [];
  for (const template of templates) {
    for (const slot of slots) {
      const start = toMin(slot.start), end = toMin(slot.end);
      if (universe.some(row => Number(row.AdInstructorId) === instructorId && overlaps(row, slot.days, start, end))) continue;
      const room = rooms.find(candidate => !universe.some(row => String(row.roomId || "") === String(candidate.roomId) && overlaps(row, slot.days, start, end)));
      if (!room) continue;
      const codes = scopeRows.filter(row => Number(row.AdCourseId) === Number(template.AdCourseId)).map(row => Number(row.SCode) || 0);
      const { id: _id, rev: _rev, ...base } = template as any;
      const row = await Repository.createSchedule({
        ...base, AdInstructorId: instructorId, SCode: String(Math.max(0, ...codes) + 1).padStart(2, "0"),
        ...Object.fromEntries(DAYS.map(day => [day, slot.days.includes(day)])), fstarttime: slot.start, fendtime: slot.end,
        AdRoomCode: room.AdRoomCode, AdRoomHall: room.AdRoomHall, buildingId: (room as any).buildingId, roomId: room.roomId, locationStatus: (room as any).locationStatus,
      } as any);
      universe.push(row); made.push(row);
      break;
    }
  }
  return made;
}

/** شعبٌ غيرُ مسندةٍ لبطاقة أستاذ الديمو كي تعرض خياراتٍ من مقرراتٍ متعددة. */
async function seedDemoAvailableCourses(instructorId: number, scopeRows: FSchedule[], termRows: FSchedule[]): Promise<FSchedule[]> {
  if (!Repository.isDemoRequest()) return [];
  const days = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
  const toMin = (value: string) => { const [h, m] = String(value || "").split(":").map(Number); return h * 60 + m; };
  const overlaps = (row: any, selectedDays: readonly string[], start: number, end: number) =>
    selectedDays.some(day => row[day]) && toMin(row.fstarttime) < end && start < toMin(row.fendtime);
  const [faculty, courses, instructors] = await Promise.all([
    ensureSectionFaculty(Repository, DEMO_STORY_SCOPE.collegeId, DEMO_STORY_SCOPE.sectionId),
    Repository.getCourses(), Repository.getInstructors(),
  ]);
  const placeholderIds = placeholderInstructorIds(instructors as any);
  const existing = await Repository.getSchedulesByScope(DEMO_STORY_SCOPE);
  const existingGroups = new Set(existing.filter(row => placeholderIds.has(Number(row.AdInstructorId)))
    .map(row => Number(row.AdCourseId)));
  const ownRows = termRows.filter(row => Number(row.AdInstructorId) === instructorId);
  const courseById = new Map((courses as any[]).map(course => [Number(course.AdCourseId), course]));
  const load = loadCapOf(instructors.find(person => Number(person.AdInstructorId) === instructorId));
  let usedLoad = weeklyLoadOf(ownRows, courseById as any);
  const roomRows = [...new Map(scopeRows.filter(row => row.roomId).map(row => [String(row.roomId), row] as [string, FSchedule])).values()];
  const templates = [...new Map(scopeRows.filter(row => row.roomId && !dayKeysOf(row).includes("fsunday")
    && !existingGroups.has(Number(row.AdCourseId))
    && Number(row.AdInstructorId) !== instructorId)
    .map(row => [Number(row.AdCourseId), row] as [number, FSchedule])).values()]
    .sort((a, b) => effectiveCourseHours(courseById.get(Number(a.AdCourseId))) - effectiveCourseHours(courseById.get(Number(b.AdCourseId))));
  const made: FSchedule[] = [];
  const universe: any[] = [...termRows, ...existing];
  for (const template of templates) {
    if (made.length >= 3) break;
    const course = courseById.get(Number(template.AdCourseId));
    const hours = effectiveCourseHours(course);
    if (!course || (load > 0 && usedLoad + hours > load)) continue;
    const duration = Math.max(30, toMin(template.fendtime) - toMin(template.fstarttime));
    let placed = false;
    for (let start = 17 * 60; start + duration <= 20 * 60 && !placed; start += 30) {
      const end = start + duration;
      const selectedDays = dayKeysOf(template);
      if (!selectedDays.length || universe.some(row => overlaps(row, selectedDays, start, end))) continue;
      const room = roomRows.find(candidate => !universe.some(row => String(row.roomId || "") === String(candidate.roomId)
        && overlaps(row, selectedDays, start, end)));
      if (!room) continue;
      const sectionCodes = [...existing, ...scopeRows].filter(row => Number(row.AdCourseId) === Number(template.AdCourseId)).map(row => Number(row.SCode) || 0);
      const { id: _id, rev: _rev, ...base } = template as any;
      const row = await Repository.createSchedule({
        ...base, AdInstructorId: faculty.instructorId, SCode: String(Math.max(0, ...sectionCodes) + 1).padStart(2, "0"),
        ...Object.fromEntries(days.map(day => [day, selectedDays.includes(day)])),
        fstarttime: `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`,
        fendtime: `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`,
        AdRoomCode: room.AdRoomCode, AdRoomHall: room.AdRoomHall, buildingId: (room as any).buildingId,
        roomId: room.roomId, locationStatus: (room as any).locationStatus,
      } as any);
      universe.push(row); made.push(row); usedLoad += hours; placed = true;
    }
  }
  return made;
}

async function seedDemoStories(): Promise<void> {
  if (!Repository.isDemoRequest()) return;
  const { collegeId, sectionId, termId } = DEMO_STORY_SCOPE;
  const [terms, sections, courses, instructors, colleges, scopeRows, termRows] = await Promise.all([
    Repository.getTerms(), Repository.getSections(), Repository.getCourses(), Repository.getInstructors(), Repository.getColleges(),
    Repository.getSchedulesByScope({ collegeId, sectionId, termId }), Repository.getSchedulesByScope({ termId }),
  ]);
  const term = terms.find(row => Number(row.AdTermId) === termId);
  if (!term || !scopeRows.length) return;
  const termName = String(term.AdTermName || ""), sectionName = sections.find(row => Number(row.AdSectionId) === sectionId)?.AdSectionName || "";
  const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
  const committee = { id: 16, name: "د. رئيس لجنة جدول تكنولوجيا التعليم", role: roleLabel("committeeChair") };

  // ── قاعدةُ التخرّج (d)
  const rule = { AdSectionId: sectionId, degreeUnits: 125, fieldTrainingRequired: 95, graduateRegularPassed: 108, graduateSummerPassed: 114, updatedAt: iso(-20), updatedBy: committee.name };
  /* القاعدةُ المحفوظة وقتَ إنشاء الصحائف تنتقل إلى «الصحيفة السابقة» (القديمة، 130 وحدة)؛ فتُحفظ هنا قاعدةُ القديمة،
     ثم يحفظ seedDemoRadar قاعدةَ الجديدة (125) بعد إنشاء الصحيفتين فلا تتشاركان قاعدةً واحدة. */
  await Repository.saveDegreeRule({ ...rule, degreeUnits: 130, fieldTrainingRequired: 100, graduateRegularPassed: 112, graduateSummerPassed: 118 });

  // ── رابطا القسم (a)
  const linkBase = { AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId, SystemUserId: committee.id, userName: committee.name };
  const staffLink = await Repository.createShareLink({
    ...linkBase, kind: "staff", label: shareLinkLabel("staff", sectionName, termName),
    expiresAt: termLinkExpiresAt(term), requestsCloseAt: requestsCloseAtFromDate(iso(14).slice(0, 10)), showInstructors: true,
  } as any);
  const survey = await Repository.createShareLink({
    ...linkBase, kind: "survey", label: shareLinkLabel("survey", sectionName, termName),
    expiresAt: iso(30), showInstructors: true,
  } as any);

  /* عدّاداتُ المشاهدة: رابطٌ لم يفتحه أحدٌ يُري «0» أمام الجمهور. تُرفع بالدالة
     نفسها التي تعدّ بها الصفحاتُ العامة، داخل صندوق الزائر وحده. */
  /* رابطُ جدول القسم المنشور: ثالثُ ما يجده المنسّق في لوحة النشر (للعرض، بمشاهداتٍ تُري أن الرابط يُفتح). */
  const departmentLink = await Repository.createShareLink({
    ...linkBase, kind: "department", label: shareLinkLabel("department", sectionName, termName),
    expiresAt: iso(60), showInstructors: true,
  } as any);
  for (const [link, opens] of [[staffLink, 14], [survey, 9], [departmentLink, 31]] as const) {
    for (let opened = 0; opened < opens; opened++) await Repository.touchShareLink(link.id);
  }

  // ── حالاتُ الطلبة (b)
  const courseOf = (code: string) => courses.find(row => String(row.CourseCode) === code);
  const cs220 = courseOf("0109233"), ds110 = courseOf("0109321"), cs315 = courseOf("0109323"), cs350 = courseOf("0109343");
  const saveCase = async (name: string, civil: string, entry: Partial<StudentNeed>) => Repository.saveStudentNeed({
    fingerprint: await surveyFingerprint(civil), AdCollegeId: collegeId, AdSectionId: sectionId, studentSectionId: sectionId,
    surveySectionId: sectionId, surveyLinkId: survey.id, AdTermId: termId, courseIds: [], requestType: "new-course",
    nameCipher: await sealStudentIdentity(name), civilCipher: await sealStudentIdentity(civil), details: "", eligibility: "not-checked",
    ...entry,
  } as any);
  const cases: Array<{ label: string; civil: string; caseRef: string }> = [];
  const remember = (label: string, civil: string, need: StudentNeed) => cases.push({ label, civil, caseRef: caseRefFor(need) });

  const graduateCivil = generateSyntheticCivilId();
  const graduate = await saveCase("نورة (طالبة تجريبية)", graduateCivil, {
    requestType: "graduate", graduateReason: "field-conflict",
    details: "التطبيق الميداني يتعارض مع آخر مقرّرٍ في خطتي — أحتاج شعبةً مسائية.",
    passedUnits: 114, requiredUnits: graduateThreshold(rule, termName), degreeUnits: rule.degreeUnits, eligibility: "eligible", proofNameMatched: true,
  });
  await Repository.setStudentCaseDecision(graduate.id, "committee", { state: "approved", note: "الحالة مستوفية؛ أُحيلت إلى التسجيل.", byRole: committee.role, at: iso(-1) });
  remember("خريجة — وافقت اللجنة وتنتظر التسجيل", graduateCivil, graduate);

  if (cs220 && ds110) {
    const civil = generateSyntheticCivilId();
    const need = await saveCase("فهد (طالب تجريبي)", civil, { requestType: "course-conflict", courseIds: [Number(cs220.AdCourseId), Number(ds110.AdCourseId)] });
    remember("تعارض مقرّرين — ينتظر اللجنة", civil, need);
  }
  if (cs315) {
    const civil = generateSyntheticCivilId();
    const need = await saveCase("مريم (طالبة تجريبية)", civil, { requestType: "new-course", courseIds: [Number(cs315.AdCourseId)] });
    await Repository.setStudentCourseState(need.id, { courseId: Number(cs315.AdCourseId), state: "registered", by: "registration", byRole: roleLabel("registrarStaff"), at: iso(-1) });
    remember("فتح مقرّر — سُجّل", civil, need);
  }
  if (cs350) {
    const civil = generateSyntheticCivilId();
    const need = await saveCase("خالد (طالب تجريبي)", civil, { requestType: "new-course", courseIds: [Number(cs350.AdCourseId)] });
    await Repository.setStudentCourseState(need.id, { courseId: Number(cs350.AdCourseId), state: "committee-rejected", reasonCode: "prerequisite", note: "يلزم اجتياز «إنتاج الفيديو التعليمي» أولاً.", by: "department", byRole: committee.role, at: iso(-2) });
    remember("فتح مقرّر — لم توافق اللجنة", civil, need);
  }
  Repository.setDemoGuide({ freshStudentCivil: generateSyntheticCivilId(), cases });

  // ── طلبا أستاذين (c): واحدٌ ينتظر القسم، وآخرُ قُرّر برفضٍ وبدائل.
  const courseName = new Map(courses.map(row => [Number(row.AdCourseId), String(row.CourseName || "")]));
  const collegeNameById = new Map(colleges.map(row => [Number(row.AdCollegeId), String(row.AdCollegeName || "")]));
  const teachers = [...new Set(scopeRows.map(row => Number(row.AdInstructorId)).filter(Boolean))].slice(0, 6);
  const candidateSlots: Array<{ days: RequestDayKey[]; start: string }> = [
    { days: ["fsunday", "ftuesday"], start: "12:30" }, { days: ["fmonday", "fwednesday"], start: "14:00" },
    { days: ["fsunday", "ftuesday"], start: "15:30" }, { days: ["fmonday", "fwednesday"], start: "08:00" },
    { days: ["fmonday", "fwednesday"], start: "09:30" }, { days: ["fsunday", "ftuesday"], start: "11:00" },
    { days: ["fmonday", "fwednesday"], start: "15:30" }, { days: ["fsunday", "ftuesday"], start: "08:00" },
  ];
  for (const [index, instructorId] of teachers.entries()) {
    const person = instructors.find(row => Number(row.AdInstructorId) === instructorId);
    if (!person) continue;
    /* أستاذُ التجربة (من فتح رابطه ولم يرسل): أربعةُ مواعيد لا موعدٌ واحد، فيُرى أثرُ التعارض حين يحرّك أحدها
       فوق آخر أو فوق قاعةٍ مشغولة. تُبنى في أوقاتٍ خاليةٍ له ولقاعاتها، بأطوال اللائحة. */
    if (index === 2) termRows.push(...await seedDemoTeacherCourses(instructorId, scopeRows, termRows));
    const own = termRows.filter(row => Number(row.AdInstructorId) === instructorId);
    const link = await Repository.createShareLink({
      ...linkBase, kind: "request", AdInstructorId: instructorId, label: `طلب جدول — ${instructorId}`,
      expiresAt: new Date(Math.max(Date.now() + REQUEST_LINK_DAYS * 86_400_000, Date.parse(termLinkExpiresAt(term)))).toISOString(),
      showInstructors: false,
    } as any);
    /* الأستاذ فتح رابطه (linkOpenedAt أدناه): العدّادُ يوافق القصة لا «0». */
    for (let opened = 0; opened < (index === 3 ? 0 : 3 + index); opened++) await Repository.touchShareLink(link.id);
    const opened = iso(-6);
    let request = await Repository.createInstructorRequest({
      AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId, AdInstructorId: instructorId, linkId: link.id,
      window: { opensAt: opened, closesAt: requestsCloseAtFromDate(iso(10).slice(0, 10)) }, source: "draft", status: "sent",
      items: own.map(row => requestItemFromRow(row, courseName.get(Number(row.AdCourseId)) || String(row.AdCourseName || ""), collegeNameById)),
      timeline: [{ kind: "link-created", at: opened, by: "القسم" }, ...(index === 3 ? [] : [{ kind: "link-opened" as const, at: iso(-5) }])],
    });
    request = index === 3 ? request : { ...request, linkOpenedAt: iso(-5) };
    /* حالتان بلا إرسال: أستاذٌ فتح رابطه ولم يرسل بعد (2)، وآخرُ لم يفتحه (3) — فيرى القسمُ «ينتظر الأستاذ» لا طلبين فقط. */
    if (index === 2 || index === 3) { await Repository.saveInstructorRequest(request); continue; }
    /* بندٌ واحدٌ يُطلب نقله إلى أوّل موعدٍ يقبله حكمُ النظام نفسُه (judgeRequestItems). */
    const target = request.items.findIndex(item => Number(item.before?.sectionId || sectionId) === sectionId);
    if (target < 0) continue;
    const movedTo = (slot: { days: RequestDayKey[]; start: string }) => request.items.map((item, at) => at !== target ? item : {
      ...item, action: "change" as const,
      after: { ...item.before!, room: undefined, days: slot.days.map(day => DAY_LETTERS[day]).join(" · "), time: `${slot.start} – ${endForRequest(slot.days, slot.start)}` },
      slots: slot.days.map(day => ({ day, start: slot.start, end: endForRequest([day], slot.start) })),
      excuse: "يتوافق مع ساعاتي المكتبية وتدريب الطلبة الميداني.",
    });
    /* كلُّ موعدٍ يُطلب أو يُعرض بديلاً يمرّ بحكم النظام نفسه أولاً: لا يُبذر
       طلبٌ لا يُرسل، ولا بديلٌ يرفضه النظام حين يختاره الأستاذ. */
    const acceptable: Array<{ slot: { days: RequestDayKey[]; start: string }; judged: InstructorRequest }> = [];
    for (const slot of candidateSlots) {
      const attempt = await judgeRequestItems({ ...request, items: movedTo(slot) });
      if (attempt.items[target].verdict === "clear") acceptable.push({ slot, judged: attempt });
    }
    if (!acceptable.length) continue;
    const judged = acceptable[index >= 4 ? Math.min(index - 3, acceptable.length - 1) : 0].judged;
    const submittedAt = iso(-4 + index);
    const signed = {
      ...judged, status: "submitted" as const, submittedAt,
      signature: { at: submittedAt, fingerprint: await surveyFingerprint(normalizeCivilId(person.AdInstructorCivil)), verifyCode: verificationCode(request.id, instructorId, submittedAt) },
      timeline: [...request.timeline, { kind: "submitted" as const, at: submittedAt, detail: "1" }, { kind: "received" as const, at: submittedAt, by: "القسم" }],
    };
    if (index === 0 || index === 5) { await Repository.saveInstructorRequest(signed); continue; }
    /* (4) طلبٌ أُرسل فقبله القسمُ وثبّته: يُغلق بقرارٍ مثبَّت لا بقاءَ فيه لمن ينتظر. */
    if (index === 4) {
      const fixedAt = iso(-2);
      await Repository.saveInstructorRequest({
        ...signed, status: "settled",
        items: signed.items.map((item, at) => at !== target ? item : { ...item, decision: { state: "fixed" as const, decidedBy: committee.role, decidedAt: fixedAt } }),
        timeline: [...signed.timeline, { kind: "item-fixed" as const, at: fixedAt, by: committee.role, itemIndex: target }, { kind: "settled" as const, at: fixedAt, by: committee.role }],
      });
      continue;
    }
    const decidedAt = iso(-1);
    const offered = acceptable.slice(1, 3)
      .map(({ slot }) => ({ day: slot.days[0], days: slot.days, start: slot.start, end: endForRequest(slot.days, slot.start) }));
    if (!offered.length) { await Repository.saveInstructorRequest(signed); continue; }
    const decidedItems = signed.items.map((item, at) => at !== target ? item : {
      ...item, decision: { state: "rejected" as const, reasonCode: "room" as const, note: "لا قاعة مناسبة في هذا الموعد؛ اختر أحد البديلين.", alternatives: offered, decidedBy: committee.role, decidedAt },
    });
    /* الحالةُ من القاعدة نفسها التي يحكم بها مسارُ القرار: رفضٌ ببدائل ينتظر الأستاذ. */
    const settled = requestFullySettled(decidedItems);
    await Repository.saveInstructorRequest({
      ...signed, status: settled ? "settled" : "in-review", items: decidedItems,
      timeline: [...signed.timeline,
        { kind: "item-rejected", at: decidedAt, by: committee.role, itemIndex: target, detail: "room" },
        { kind: "alternative-offered", at: decidedAt, by: committee.role, itemIndex: target },
        ...(settled ? [{ kind: "settled" as const, at: decidedAt, by: committee.role }] : [])],
    });
  }

  // ── مقترحان دراسيان (e): واحدٌ مرسَلٌ ينتظر ردّ الأستاذ، وآخرُ مسودة.
  await seedDemoStudyProposals(DEMO_STORY_SCOPE).catch(error => console.error("[demo] seeding study proposals failed:", error));

}

/**
 * وصف الصفة كما تصل الواجهة.
 *
 * الواجهة لا تحرس شيئاً — الحارس على الخادم — لكنها تحتاج أن تعرف الصفة لتخفي
 * ما لا يُستعمل: زرّ الحفظ لمن لا يحفظ، وشاشةٌ لا تخصّ صاحبها. إخفاءُ ما لا
 * يعمل ليس أماناً، هو احترامٌ لوقت من ينظر إلى الشاشة.
 */
function roleDescriptor(user: any) {
  const definition = roleDefinition(user?.Role);
  return {
    id: definition.id,
    label: definition.label,
    readOnly: definition.readOnly,
    landing: definition.landing,
    canReview: canReviewSubmissions(definition.id),
    canManageDeadline: canManageDeadline(definition.id),
    canExtendDeadline: canExtendDeadline(definition.id),
    watchesInbox: watchesInbox(definition.id),
    canAnnotate: canAnnotateCells(definition.id),
    signatureStage: signatureStage(definition.id),
    /* ── صفةٌ مكتوبةٌ، لا صفةٌ يُسقط إليها الغياب ─────────────────────────
     *
     * `definition` هي الصفةُ بعد السقوط إلى الافتراضيّ، فحسابٌ بلا صفةٍ
     * مكتوبة يُقرأ «رئيس لجنة الجدول». وذلك مقبولٌ فيما تُستعمل له أعلاه —
     * وصفٌ ولافتة — وغيرُ مقبولٍ حيث يُبنى عليه منعٌ أو إذن.
     *
     * وتجميدُ الفصل المنتهي يُبنى عليه: الخادمُ يشترط صفةً مكتوبةً، فلو قرأت
     * الشاشةُ `signatureStage` وحدَها لظنّت صاحبَ الحساب لجنةً فلا تُحذّره،
     * ثم يُردّ عند الحفظ بلا أن يفهم لماذا. فتُرسل الحقيقةُ صريحةً. */
    committeeEligible: isAcademicRole(user?.Role) && signatureStage(user?.Role) === "committee",
    viewerOnly: isViewerOnlyRole(definition.id),
    advisorOnly: isAdvisorRole(definition.id),
  };
}

/**
 * ── أين أنا الآن ────────────────────────────────────────────────────────────
 *
 * The upward half of the live channel. The stream carries news down; this one
 * small POST carries a person's own position up, and the two together make a
 * board where colleagues can see each other.
 *
 * It lives under /api/auth/ deliberately, twice over: the service worker leaves
 * that prefix alone, so a presence beat can never be answered by a fabricated
 * offline response; and the audit middleware skips it, so watching a colleague
 * move a pointer does not write an audit row per second.
 *
 * It returns 204 and writes nothing anywhere. A beat that arrives after its own
 * stream has closed is not an error — it is a browser tab that shut a moment
 * before its last message landed.
 */
const PRESENCE_DAYS = new Set(["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"]);
const cleanMarkPart = (value: unknown) => {
  const row = Number((value as { rowId?: unknown })?.rowId || 0);
  if (!Number.isInteger(row) || row <= 0) return null;
  return { rowId: row, rev: Number((value as { rev?: unknown })?.rev || 0) };
};

export function registerAuthRoutes(app: Express): void {

app.post("/api/auth/demo", rateLimitLogin, async (_req: Request, res: Response) => {
  if (process.env.SCHEDULE_DEMO_ENABLED === "false") {
    res.status(404).json({ error: "الدخول التجريبي غير مفعّل." });
    return;
  }
  const sessionId = `demo_${randomBytes(32).toString("hex")}`;
  Repository.createDemoSandbox(sessionId, DEMO_SESSION_TTL_MS);
  try {
    const payload = await Repository.withDemoSandbox(sessionId, async () => {
      await Repository.createSession(sessionId, ROOT_ADMIN_USER_ID, DEMO_SESSION_TTL_MS);
      const identity = await readDemoIdentity(ROOT_ADMIN_USER_ID);
      return demoSessionPayload(identity.user, identity.permissions, identity.scopes);
    });
    res.setHeader("Set-Cookie", `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
    res.json(payload);
    scheduleDemoExtras(sessionId);
  } catch (error) {
    await Repository.withDemoSandbox(sessionId, () => Repository.deleteSession(sessionId)).catch(() => undefined);
    res.status(500).json({ error: error instanceof Error ? error.message : "تعذر بدء البيئة التجريبية" });
  }
});

/*
 * ── تبديل الصفة المعروضة في البيئة التجريبية ────────────────────────────────
 *
 * يعيد ربط الجلسة التجريبية بحسابٍ وهميٍّ يحمل الصفة المطلوبة، فيرى المجرِّب
 * شاشةَ العميد أو التسجيل أو رئيس القسم بنطاقها وصلاحياتها الحقيقية — والحارس
 * نفسه يطبّق عليها، فلا تُزيّف قراءةٌ ولا يُفتح بابُ تعديلٍ لصفةِ اطّلاع.
 *
 * «admin» يعيد عرض المدير (المستخدم الجذر) الذي يملك كل الشاشات — وهو مدخل
 * البيئة. وهو مقصورٌ على البيئة التجريبية: لا رفعَ صلاحيةٍ في جلسةٍ حقيقية.
 */
app.post("/api/demo/role", rateLimitDemoRole, requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!Repository.isDemoRequest()) { res.status(404).json({ error: "هذه العملية متاحة للبيئة التجريبية فقط" }); return; }
  const sessionId = getCookies(req)["session_id"];
  if (!sessionId) { res.status(401).json({ error: DEMO_SESSION_GONE }); return; }
  const requested = String(req.body?.role || "");
  const targetId = requested === "admin"
    ? ROOT_ADMIN_USER_ID
    : DEMO_SWITCH_ACCOUNTS.find(account => account.role === requested)?.SystemUserId;
  if (!targetId) { res.status(400).json({ error: "صفة غير معروفة" }); return; }
  try {
    const payload = await Repository.withDemoSandbox(sessionId, async () => {
      await Repository.createSession(sessionId, targetId, DEMO_SESSION_TTL_MS);
      const identity = await readDemoIdentity(targetId);
      return demoSessionPayload(identity.user, identity.permissions, identity.scopes);
    });
    // النسخة المخبّأة كانت للصفة السابقة؛ تُنسى فتُقرأ الجديدة.
    forgetAuthSession(sessionId);
    await Repository.refreshSession(sessionId, DEMO_SESSION_TTL_MS);
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "تعذّر تبديل الصفة" });
  }
});

/* رابطٌ قصير يُقرأ من صورة واتساب. لا تعتمد الدعوة المصوّرة على بقاء #fragment
   عند فتح الصورة أو على تحويل النص المصوَّر إلى رابطٍ يحمل معاملات مخفية. */
/* الرابطُ القصير يحمل اسمَ الدخول وحده: كان يُكمله بالكلمة الموحّدة، فيصير كلُّ اسمٍ
   يُخمَّن (Frenchdept…) دعوةً جاهزة. الكلمةُ تصل صاحبَها من المسؤول، والروابطُ القديمة
   في واتساب تبقى تعمل فتملأ الاسم. */
app.get("/i/:username", rateLimitLogin, (req: Request, res: Response) => {
  const username = String(req.params.username || "").trim();
  if (!username || username.length > 200) { res.status(400).type("text/plain").send("رابط الدعوة غير صالح"); return; }
  const invite = new URLSearchParams({ username });
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.redirect(302, `/#invite=${encodeURIComponent(invite.toString())}`);
});

app.post("/api/auth/login", rateLimitLogin, async (req: Request, res: Response) => {
  if (Repository.isDemoMode()) {
    res.status(403).json({ error: "هذه خدمة Demo معزولة. استخدم زر «دخول فوري للتجربة»." });
    return;
  }
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "الرجاء إدخال اسم المستخدم وكلمة السر" });
    return;
  }

  const user = await Repository.getUserByLogin(username);
  if (!user) {
    res.status(400).json({ error: "اسم المستخدم أو كلمة السر غير صحيحة" });
    return;
  }

  if (!Repository.verifyPassword(password, user.SystemUserPass)) {
    // The trail records who was tried, not merely that something failed.
    res.locals.auditUser = { id: Number(user.SystemUserId), name: String(user.Name || user.SystemUserLogin || "") };
    res.status(400).json({ error: "اسم المستخدم أو كلمة السر غير صحيحة" });
    return;
  }
  res.locals.auditUser = { id: Number(user.SystemUserId), name: String(user.Name || user.SystemUserLogin || "") };

  if (!user.IsActive) {
    res.status(403).json({ error: "هذا الحساب غير فعال" });
    return;
  }

  if (user.IsLocked) {
    res.status(403).json({ error: "هذا الحساب مقفل" });
    return;
  }

  if (user.IsDeleted) {
    res.status(400).json({ error: "اسم المستخدم أو كلمة السر غير صحيحة" });
    return;
  }

  /* من يدخل بالكلمة الموحّدة القديمة لا يُقفل: يدخل، ويُعلَّم فلا يصل إلى شيءٍ حتى يختار كلمته
     (passwordChangeGate). والعلامةُ على الحساب لا على الجلسة، فتبقى إن خرج قبل التغيير. */
  if (password === LEGACY_SHARED_PASSWORD && !(user as any).MustChangePassword) {
    await Repository.updateUser(Number(user.SystemUserId), { MustChangePassword: true } as any);
    (user as any).MustChangePassword = true;
  }

  // Generate Session ID
  const sessionId = `sess_${randomBytes(32).toString("hex")}`;
  /* دخولٌ بالكلمة الأولى لحسابٍ عليه تغييرُها: تحمل الجلسةُ أثرَها، فيختار كلمته دون أن يُسأل عن
     كلمةٍ لم يكتبها بنفسه (currentPasswordWaived). الأثرُ لا الكلمة، ولا يُعاد إلى المتصفح. */
  const mustChange = Boolean((user as any).MustChangePassword);
  await Repository.createSession(sessionId, user.SystemUserId, SERVER_IDLE_SESSION_MS, mustChange ? { initialPassMark: initialPasswordMark(user.SystemUserPass) } : {});

  // Set Cookie
  res.setHeader(
    "Set-Cookie",
    `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
  );

  loginAttempts.delete(req.ip || "unknown");
  const userPerms = await Repository.getSecurityByUser(user.SystemUserId);
  /* الدخولُ بكلمة سرّ الكرسي دخولُ شاغله: يُقرأ اسمُه كما تقرؤه الجلساتُ بعده (docs/SEATS.md). */
  const seated = (await seatIdentity(user, undefined, await Repository.getUserAssigns(user.SystemUserId), userPerms.map(p => Number(p.FormNameId))))!;
  const safeUser = safeSystemUser(seated.user);
  const permissions = seated.permissions;
  const scopes = await clientScopeDetails(seated.scopes);

  res.json({ user: { ...safeUser, IsRootAdmin: Number(user.SystemUserId) === ROOT_ADMIN_USER_ID, IsDemo: false }, role: roleDescriptor(seated.user), permissions, scopes, data: activeDataMode(), ...(mustChange ? { passwordChange: { currentRequired: false } } : {}) });
});

/* تغييرُ كلمة السر بيد صاحبها: بالكلمة الحالية، ولا تُقبل الموحّدةُ القديمة ولا الحاليةُ نفسها.
   وتُعفى الحاليةُ لجلسةٍ فُتحت للتوّ بالكلمة الأولى لحسابٍ معلَّم (decidePasswordChange).
   وهو الباب الوحيد المفتوح (مع من أنا والخروج) لحسابٍ عليه تغييرُ كلمته. */
app.post("/api/auth/change-password", rateLimitLogin, requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (Repository.isDemoRequest()) { res.status(403).json({ error: "هذه العملية غير متاحة في البيئة التجريبية" }); return; }
  const current = String(req.body?.currentPassword ?? "");
  const next = String(req.body?.newPassword ?? "");
  const user = await Repository.getUserById(Number(req.user.SystemUserId));
  const sessionId = getCookies(req)["session_id"];
  const session = !current && sessionId ? await Repository.getSession(sessionId) : undefined;
  const outcome = decidePasswordChange({ user, session, current, next, verify: Repository.verifyPassword, hash: Repository.hashPassword, vault: Repository.encryptPasswordForVault });
  if ("error" in outcome) { res.status(outcome.status).json({ error: outcome.error, ...(outcome.code ? { code: outcome.code } : {}) }); return; }
  await Repository.updateUser(Number(user!.SystemUserId), {
    SystemUserPass: outcome.hash,
    SystemUserPassVault: outcome.vault,
    MustChangePassword: false,
  } as any);
  forgetAuthSession(getCookies(req)["session_id"]);
  res.locals.auditChanges = "تغيير كلمة السر";
  res.json({ ok: true });
});

app.post("/api/auth/logout", async (req: AuthenticatedRequest, res: Response) => {
  const cookies = getCookies(req);
  const sessionId = cookies["session_id"];
  if (sessionId) {
    // Drop the remembered identity before the record, so no request in flight
    // can be served from memory after the person has signed out.
    forgetAuthSession(sessionId);
    await pushHooks.signedOut(sessionId);
    /* معرّفٌ لم يصنعه الخادم لا سجلَّ له يُحذف؛ والمحذوفُ يُذكر ميّتاً، فتبويبٌ
       آخر بالكوكي القديم لا يُسأل عنه بعد الآن. */
    if (isSessionIdShape(sessionId)) await Repository.deleteSession(sessionId);
    if (sessionId.startsWith("sess_")) deadSessions.remember(sessionId);
  }
  res.setHeader("Set-Cookie", `session_id=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  res.json({ success: true });
});

app.get("/api/auth/me", async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.json({ user: null });
    return;
  }
  const safeUser = safeSystemUser(req.user);
  /* الشاشاتُ كما حُلّت للجلسة: عضوُ الفريق يرى شاشاتِ صفته هو، لا شاشاتِ الكرسي كلها. */
  const permissions = req.permissions ?? (await Repository.getSecurityByUser(req.user.SystemUserId)).map(p => p.FormNameId);
  const scopes = await clientScopeDetails(req.scopes || []);
  // The interface says out loud when it is not on the university's database.
  const demoActiveRole = Number(req.user.SystemUserId) === ROOT_ADMIN_USER_ID ? "admin" : demoActiveRoleKey(Number(req.user.SystemUserId), (req.user as any).Role);
  /* شاشةُ «اختر كلمة السر» تسأل عن الحالية أو لا تسأل كما سيحكم الخادم (currentPasswordWaived). */
  const meSessionId = getCookies(req)["session_id"];
  const passwordChange = (req.user as any).MustChangePassword
    ? { currentRequired: !(meSessionId && currentPasswordWaived(await Repository.getUserById(Number(req.user.SystemUserId)), await Repository.getSession(meSessionId))) }
    : undefined;
  res.json({ user: { ...safeUser, IsRootAdmin: Number(req.user.SystemUserId) === ROOT_ADMIN_USER_ID, IsDemo: Repository.isDemoRequest() }, role: roleDescriptor(req.user), permissions, scopes, passwordChange, data: Repository.isDemoRequest() ? "demo" : activeDataMode(), demo: Repository.isDemoRequest() ? { expiresInMs: DEMO_SESSION_TTL_MS, adminReadOnly: true, roles: DEMO_SWITCH_ACCOUNTS, activeRole: demoActiveRole, seedStatus: demoSeedStatus.get(Repository.currentDemoSessionId()) || "ready" } : undefined });
});

// Activity heartbeat: the server session still expires after 15 minutes of real
// inactivity, while active users can keep the session alive without a fixed
// browser-cookie deadline logging them out mid-work.
app.post("/api/auth/heartbeat", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const ttlMs = Repository.isDemoRequest() ? DEMO_SESSION_TTL_MS : SERVER_IDLE_SESSION_MS;
  const sessionId = getCookies(req)["session_id"];
  /**
   * This is the beat the browser sends to say «I am still here», and for every
   * account that was not a demo visitor it used to be answered with `ok` and
   * nothing else — the refresh sat behind `&& isDemoRequest()`, so the one
   * signal built to hold a working session open was the one signal that never
   * held it. A real user reading a board for fifteen quiet minutes was signed
   * out while their browser was still faithfully reporting them present.
   *
   * Every session kind is refreshed now, each on its own window. The write is
   * forced past the throttle: the beat only arrives when the reader has been
   * quiet, which is exactly when the extension must not be skipped.
   */
  if (sessionId) {
    sessionTouchedAt.set(sessionId, Date.now());
    await Repository.refreshSession(sessionId, ttlMs);
  }
  res.json({ ok: true, idleTimeoutMs: ttlMs, demo: Repository.isDemoRequest() });
});

app.post("/api/demo/reset", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!Repository.isDemoRequest()) { res.status(404).json({ error: "هذه العملية متاحة للبيئة التجريبية فقط" }); return; }
  const sessionId = getCookies(req)["session_id"];
  if (!sessionId || !Repository.resetDemoSandbox(sessionId, DEMO_SESSION_TTL_MS)) { res.status(401).json({ error: DEMO_SESSION_GONE }); return; }
  forgetAuthSession(sessionId);
  await Repository.refreshSession(sessionId, DEMO_SESSION_TTL_MS);
  res.json({ success: true });
  scheduleDemoExtras(sessionId);
});

app.get("/api/demo/teacher-card", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!Repository.isDemoRequest()) { res.status(404).json({ error: "هذه العملية متاحة للبيئة التجريبية فقط" }); return; }
  res.setHeader("Cache-Control", "no-store");
  const sessionId = getCookies(req)["session_id"];
  const { collegeId, sectionId, termId } = DEMO_STORY_SCOPE;
  const preparing = demoSeedStatus.get(String(sessionId || "")) === "preparing";
  /* يدخل الزائرُ من بطاقة الأستاذ (الصفحة التي تطلب رقمه المدني) ثم يصل منها إلى طلب تعديل الجدول،
     كما يفعل الأستاذ الحقيقي — لا مباشرةً إلى نموذج الطلب. */
  const staff = preparing ? undefined : (await Repository.getShareLinks(collegeId, sectionId, termId)).find(link => link.kind === "staff");
  const request = staff?.id ? await demoTeacherRequest() : undefined;
  if (staff?.id && request) {
    const [scopeRows, termRows] = await Promise.all([
      Repository.getSchedulesByScope({ collegeId, sectionId, termId }), Repository.getSchedulesByScope({ termId }),
    ]);
    await seedDemoAvailableCourses(Number(request.AdInstructorId), scopeRows, termRows);
    res.redirect(302, `/s/${encodeURIComponent(staff.id)}`); return;
  }
  res.status(demoSeedStatus.get(String(sessionId || "")) === "failed" ? 503 : 202).type("text/html; charset=utf-8").send(
    `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="2"><title>بطاقة الأستاذ · SCHEDULE</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.7 system-ui,"Noto Sans Arabic",Tahoma,sans-serif;color:#2f3a36;background:#f6f4ee;text-align:center}</style></head><body><p>تُجهَّز بطاقة الأستاذ في العرض…<br><small>ينفتح تلقائياً بعد لحظات.</small></p></body></html>`);
});

app.get("/api/demo/seed-status", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!Repository.isDemoRequest()) { res.status(404).json({ error: "هذه العملية متاحة للبيئة التجريبية فقط" }); return; }
  const sessionId = getCookies(req)["session_id"];
  res.json({ status: (sessionId && demoSeedStatus.get(sessionId)) || "ready" });
});

app.post("/api/auth/presence", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const body = (req.body || {}) as Record<string, unknown>;
  const conn = String(body.conn || "").slice(0, 64);
  const userId = Number(req.user?.SystemUserId || 0);
  let record: ScheduleEventClient | undefined;
  for (const client of scheduleEventClients.values())
    // A session may address only its own stream. Without the userId check, one
    // account could plant a colleague's name on a cell it never touched.
    if (client.connId === conn && client.userId === userId) { record = client; break; }
  if (!record) { res.status(204).end(); return; }

  record.seenAt = Date.now();
  const previousScope = record.scopeKey;

  const scope = (body.scope || {}) as Record<string, unknown>;
  const collegeId = Number(scope.collegeId || 0);
  const sectionId = Number(scope.sectionId || 0);
  const termId = Number(scope.termId || 0);
  if (collegeId && isScopeAllowed(req, collegeId, sectionId)) {
    record.collegeId = collegeId; record.sectionId = sectionId;
    // The same key the stream registered under. A bare `c:s:t` here filed a
    // demo visitor under the REAL board with those numbers, and put their
    // name and pointer on real coordinators' screens.
    record.scopeKey = boardScopeKey(req, collegeId, sectionId, termId);
  }

  if (body.gone) {
    Object.assign(record, emptyMark());
    record.markAt = 0;
  } else {
    const cell = (body.cell || null) as { day?: unknown; start?: unknown; room?: unknown } | null;
    const day = String(cell?.day || "");
    const start = String(cell?.start || "");
    record.cell = cell && PRESENCE_DAYS.has(day) && /^\d{1,2}:\d{2}$/.test(start)
      ? { day, start, ...(cell.room ? { room: String(cell.room).slice(0, 32) } : {}) }
      : null;
    record.holding = cleanMarkPart(body.holding);
    record.editing = cleanMarkPart(body.editing);
    record.markAt = record.seenAt;
  }

  if (previousScope && previousScope !== record.scopeKey) markPresenceDirty(previousScope);
  markPresenceDirty(record.scopeKey);
  res.status(204).end();
});
}
