/**
 * ── مسارات الكراسي (docs/SEATS.md) ──────────────────────────────────────────
 *
 *   مدير النظام:  GET /api/seats · POST /api/seats/:id/holder · POST /api/seats/college-registrar
 *   من يدير الكرسي (شاغله، أو مدير النظام):
 *                 GET /api/seats/:id · POST /api/seats/:id/handover
 *                 POST /api/seats/:id/members · …/members/:mid/link · …/status · …/scopes
 *                 POST /api/seats/:id/deputy · POST /api/seats/:id/deputy/end
 *   كل جالس:      GET /api/seats/mine · GET /api/seats/switch-options · POST /api/seats/switch
 *   عامّ:          GET /k/:token (صفحة الدخول) · POST /api/public/team/:token
 *
 * والحارس `seatMemberGuard` على مدخل ‎/api‎: عضوُ الفريق يعمل ولا يوقّع ولا يدير ولا يغيّر كلمة سرّ الكرسي.
 */
import type { Express, NextFunction, Request, Response } from "express";
import { randomBytes } from "crypto";
import { Repository } from "../db/repository";
import { type AuthenticatedRequest, getCookies, isPowerUser, requireAuth, requirePowerAdmin, SERVER_IDLE_SESSION_MS, DEMO_SESSION_TTL_MS, authCache } from "./core/auth";
import { isScopeAllowed } from "./core/scope";
import { ACADEMIC_ROLES, roleDefinition, roleLabel } from "../utils/academicRoles";
import { placeholderInstructorIds } from "../utils/instructorIdentity";
import { generateInitialPassword, LEGACY_SHARED_PASSWORD } from "./accountPassword";
import {
  activeDeputy, civilTailOf, handOverLedger, isSeatRole, scopeWithin, seatHolderSource, seatMemberBadge, seatTeamRule,
  SEAT_LINK_MAX_ATTEMPTS, SEAT_TEAM_LIMIT, withSeatEvent,
  type SeatActor, type SeatHolder, type SeatLedger, type SeatMember, type SeatScope,
} from "../utils/seats";
import {
  issueSeatDeviceKey, listSeatLedgers, newSeatLinkToken, readSeatLedger, readSeatLink, revokeSeatLink, saveSeatLink,
  SEAT_DEVICE_COOKIE, seatDeviceKeyValid, updateSeatLedger,
} from "./seats";
import { seatTeamPage } from "./seatTeamPage";
import { isDemoLinkToken } from "../utils/demoLinkToken";
import { publicPageNonce } from "./core/publicPages";
import { campusFamilies, campusFamilyName } from "../utils/campusFamily";
import { AR, countOf } from "../utils/arabicCount";

const actorOf = (req: AuthenticatedRequest): SeatActor | undefined => (req.user as any)?.SeatActor;
const byName = (req: AuthenticatedRequest) => String(req.user?.Name || req.user?.SystemUserLogin || "");
const clean = (value: unknown, max = 120) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const secure = () => (process.env.NODE_ENV === "production" ? "; Secure" : "");

/** حسابٌ هو كرسيّ: موجود، غير محذوف، ليس مدير النظام، وصفتُه منصبٌ لا «مستخدم عادي». */
async function seatUser(id: number) {
  const user = await Repository.getUserById(Number(id));
  if (!user || user.IsDeleted || user.IsAdminUser || !isSeatRole((user as any).Role)) return null;
  return user as any;
}

/** يدير الكرسيَّ شاغلُه (جلسةٌ بكلمة سرّه، لا عضوٌ ولا نائب) أو مدير النظام. */
function managesSeat(req: AuthenticatedRequest, seatId: number): boolean {
  if (isPowerUser(req)) return true;
  if (Number(req.user?.SystemUserId) !== Number(seatId)) return false;
  const actor = actorOf(req);
  return !actor || actor.kind === "holder";
}

/** يسلّم الكرسيَّ من يديره، والمسجّلُ العام يسلّم كرسيَّ رئيس تسجيل الكلية. */
async function handsOverSeat(req: AuthenticatedRequest, seat: any): Promise<boolean> {
  if (managesSeat(req, seat.SystemUserId)) return true;
  if (roleDefinition(seat.Role).id !== "collegeRegistrar") return false;
  const actor = actorOf(req);
  if (roleDefinition(req.user?.Role).id !== "registrarHead" || (actor && actor.kind !== "holder")) return false;
  const assigns = await Repository.getUserAssigns(Number(seat.SystemUserId));
  return assigns.some(row => isScopeAllowed(req, Number(row.AdCollegeId), 0));
}

/** الشخص كما أُرسل: من سجلّ الأساتذة إن ذُكر رقمه (فالاسمُ والجوالُ منه)، وإلا ما كُتب. */
async function personFrom(body: any): Promise<{ name: string; instructorId?: number; mobile?: string; civil?: string } | { error: string }> {
  const instructorId = Number(body?.instructorId || 0);
  if (instructorId) {
    const person = (await Repository.getInstructors()).find(row => Number(row.AdInstructorId) === instructorId);
    if (!person) return { error: "لم يُعثر على هذا الأستاذ في السجل." };
    return { name: clean(person.AdInstructorName), instructorId, mobile: clean(body?.mobile, 20) || clean(person.AdInstructorMobile, 20) || undefined, civil: String(person.AdInstructorCivil || "") };
  }
  const name = clean(body?.name);
  if (name.length < 3) return { error: "اكتب الاسم كاملاً." };
  return { name, mobile: clean(body?.mobile, 20) || undefined, civil: clean(body?.civil, 20) || undefined };
}

/** أساتذةُ نطاق الكرسي لاختيار الأسماء: أساتذةُ القسم، أو أساتذةُ أقسام الكلية. */
async function seatCandidates(seat: any, source: "department" | "college" | "manual") {
  if (source === "manual") return [];
  const [assigns, sections, instructors] = await Promise.all([
    Repository.getUserAssigns(Number(seat.SystemUserId)), Repository.getSections(), Repository.getInstructors(),
  ]);
  const pairs = new Map<string, { c: number; s: number }>();
  for (const row of assigns) {
    const c = Number(row.AdCollegeId), s = Number(row.AdSectionId);
    if (source === "department" && s > 0) pairs.set(`${c}:${s}`, { c, s });
    if (source === "college") for (const section of sections as any[]) if (Number(section.AdCollegeId) === c) pairs.set(`${c}:${section.AdSectionId}`, { c, s: Number(section.AdSectionId) });
  }
  /* أساتذةُ القسم كما يقرؤهم النظام في مواضعه الأخرى (instructorCircleFor): من درّس فيه في أي فصل،
     ومن ضمّه دليلُ هيئته — بلا المنتدبين إليه من أقسامٍ أخرى. */
  const ids = new Set<number>();
  for (const { c, s } of pairs.values()) {
    const [taught, faculty, delegates] = await Promise.all([
      Repository.getInstructorsByScope(s, 0), Repository.getDepartmentFaculty(c, s), Repository.getDepartmentDelegates(c, s),
    ]);
    const visiting = new Set((delegates as any[]).map(Number));
    for (const person of taught as any[]) if (!visiting.has(Number(person.AdInstructorId))) ids.add(Number(person.AdInstructorId));
    for (const id of faculty) ids.add(Number(id));
  }
  const placeholders = placeholderInstructorIds(instructors as any);
  return (instructors as any[])
    .filter(person => ids.has(Number(person.AdInstructorId)) && !placeholders.has(Number(person.AdInstructorId)) && !person.AdInstructorStatus)
    .map(person => ({ id: Number(person.AdInstructorId), name: String(person.AdInstructorName || ""), hasMobile: Boolean(String(person.AdInstructorMobile || "").trim()) }))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

/** ما يحمله سجلُّ العضو إلى الشاشة: لا رمزَ رابطٍ إلا لمن يديره. */
const memberView = (member: SeatMember, withLink: boolean) => {
  const { linkToken, failedAttempts: _attempts, ...rest } = member;
  return { ...rest, badge: seatMemberBadge(member), hasLink: Boolean(linkToken), ...(withLink && linkToken ? { linkToken } : {}) };
};

async function scopeNames() {
  const [colleges, sections] = await Promise.all([Repository.getColleges(), Repository.getSections()]);
  const college = new Map((colleges as any[]).map(row => [Number(row.AdCollegeId), String(row.AdCollegeName || "")]));
  const section = new Map((sections as any[]).map(row => [`${row.AdCollegeId}:${row.AdSectionId}`, String(row.AdSectionName || "")]));
  return (scope: SeatScope) => Number(scope.AdSectionId)
    ? `${section.get(`${scope.AdCollegeId}:${scope.AdSectionId}`) || `قسم ${scope.AdSectionId}`} · ${college.get(Number(scope.AdCollegeId)) || ""}`
    : `${college.get(Number(scope.AdCollegeId)) || `كلية ${scope.AdCollegeId}`} كاملة`;
}

async function seatView(seat: any, ledger: SeatLedger | null, req: AuthenticatedRequest) {
  const rule = seatTeamRule(seat.Role);
  const manage = managesSeat(req, seat.SystemUserId);
  const nameOf = await scopeNames();
  const assigns = await Repository.getUserAssigns(Number(seat.SystemUserId));
  const deputy = activeDeputy(ledger);
  return {
    seat: {
      id: Number(seat.SystemUserId), login: String(seat.SystemUserLogin || ""), name: String(seat.SeatName || seat.Name || ""),
      role: roleDefinition(seat.Role).id, roleLabel: roleLabel(seat.Role), active: Boolean(seat.IsActive) && !seat.IsLocked,
      mustChangePassword: Boolean(seat.MustChangePassword), scopes: assigns.map(row => nameOf(row)),
    },
    holder: ledger?.holder || null,
    deputy: deputy || null,
    team: rule ? { ...rule, members: (ledger?.members || []).map(member => ({ ...memberView(member, manage), scopeNames: (member.scopes || []).map(nameOf) })) } : null,
    history: [...(ledger?.history || [])].reverse(),
    canManage: manage,
    canHandOver: await handsOverSeat(req, seat),
    holderSource: seatHolderSource(seat.Role),
    scopeTree: manage && rule && rule.scope !== "seat" ? await scopeTreeFor(seat, rule.scope) : [],
    campusOptions: isPowerUser(req) && roleDefinition(seat.Role).id === "collegeRegistrar" ? await campusOptionsFor(seat) : null,
  };
}

/** لمدير النظام: كلُّ حرمٍ، وأيُّه على هذا الكرسي، وأيُّه على كرسيٍّ آخر. */
async function campusOptionsFor(seat: any) {
  const [colleges, assigns, taken] = await Promise.all([Repository.getColleges(), Repository.getUserAssigns(Number(seat.SystemUserId)), collegeRegistrarCoverage(Number(seat.SystemUserId))]);
  const mine = new Set(assigns.map(row => Number(row.AdCollegeId)));
  return campusFamilies(colleges as any[]).map(family => ({
    ...family,
    colleges: family.colleges.map(college => ({ ...college, selected: mine.has(college.collegeId), takenElsewhere: taken.has(college.collegeId) })),
  })).sort((a, b) => Number(b.colleges.some(c => c.selected)) - Number(a.colleges.some(c => c.selected)));
}

/** شجرةُ ما يُختار منه نطاقُ موظف التسجيل: كلياتُ نطاق الكرسي وأقسامُها. */
async function scopeTreeFor(seat: any, mode: "college" | "any") {
  const [colleges, sections, assigns] = await Promise.all([Repository.getColleges(), Repository.getSections(), Repository.getUserAssigns(Number(seat.SystemUserId))]);
  const own = new Set(assigns.map(row => Number(row.AdCollegeId)));
  return (colleges as any[]).filter(college => mode === "any" || own.has(Number(college.AdCollegeId))).map(college => ({
    collegeId: Number(college.AdCollegeId), collegeName: String(college.AdCollegeName || ""),
    sections: (sections as any[]).filter(section => Number(section.AdCollegeId) === Number(college.AdCollegeId))
      .map(section => ({ sectionId: Number(section.AdSectionId), name: String(section.AdSectionName || "") }))
      .sort((a, b) => a.name.localeCompare(b.name, "ar")),
  }));
}

/** يُطلق الكرسيَّ لشاغلٍ جديد: كلمةٌ أولى، وتغييرٌ إجباري عند الدخول، وإخراجُ كل جهازٍ مفتوح عليه. */
async function resetSeatCredentials(seat: any, instructorId?: number) {
  const password = generateInitialPassword();
  await Repository.updateUser(Number(seat.SystemUserId), {
    SystemUserPass: Repository.hashPassword(password),
    SystemUserPassVault: Repository.encryptPasswordForVault(password),
    MustChangePassword: true,
    ...(instructorId !== undefined ? { AdInstructorId: Number(instructorId) || 0 } : {}),
  } as any);
  await Repository.deleteSessionsForUser(Number(seat.SystemUserId));
  authCache.clear();
  return password;
}

/** نطاقُ موظف التسجيل: صفوفٌ صحيحة، كلُّها داخل نطاق الكرسي الذي يضيفه. */
async function memberScopesFrom(body: any, seat: any): Promise<SeatScope[] | { error: string }> {
  const rule = seatTeamRule(seat.Role);
  if (!rule || rule.scope === "seat") return [];
  const raw = Array.isArray(body?.scopes) ? body.scopes : [];
  const wanted: SeatScope[] = [];
  const seen = new Set<string>();
  for (const row of raw.slice(0, 200)) {
    const scope = { AdCollegeId: Number(row?.AdCollegeId || 0), AdSectionId: Number(row?.AdSectionId || 0) };
    if (!scope.AdCollegeId || seen.has(`${scope.AdCollegeId}:${scope.AdSectionId}`)) continue;
    seen.add(`${scope.AdCollegeId}:${scope.AdSectionId}`);
    wanted.push(scope);
  }
  if (!wanted.length) return { error: "حدّد الأقسام أو الكليات التي يتابعها." };
  const [sections, colleges] = await Promise.all([Repository.getSections(), Repository.getColleges()]);
  const knownCollege = new Set((colleges as any[]).map(row => Number(row.AdCollegeId)));
  const knownSection = new Set((sections as any[]).map(row => `${row.AdCollegeId}:${row.AdSectionId}`));
  const seatAssigns = await Repository.getUserAssigns(Number(seat.SystemUserId));
  const allowed = {
    allColleges: rule.scope === "any",
    colleges: new Set(seatAssigns.filter(row => !Number(row.AdSectionId)).map(row => Number(row.AdCollegeId))),
    sections: new Set(seatAssigns.filter(row => Number(row.AdSectionId)).map(row => `${row.AdCollegeId}:${row.AdSectionId}`)),
  };
  for (const scope of wanted) {
    if (!knownCollege.has(scope.AdCollegeId) || (scope.AdSectionId && !knownSection.has(`${scope.AdCollegeId}:${scope.AdSectionId}`))) return { error: "في النطاق قسمٌ أو كليةٌ غير موجودة." };
    if (!scopeWithin(scope, allowed)) return { error: "لا يُعطى الموظف نطاقاً أوسع من نطاق فريقك." };
  }
  return wanted;
}

/** يُصدر رابطاً جديداً لعضو ويُبطل القديم. يُستدعى داخل الكتابة الذرّية لا قبلها. */
async function issueMemberLink(seatId: number, memberId: string, by: string) {
  const token = newSeatLinkToken();
  const at = new Date().toISOString();
  let previous: string | undefined;
  const out = await updateSeatLedger(seatId, ledger => {
    const member = ledger.members.find(row => row.id === memberId);
    if (!member) return { refuse: "العضو غير موجود." };
    if (member.status === "ended") return { refuse: "انتهت عضويته. أعده إلى الفريق أولاً." };
    previous = member.linkToken;
    const members = ledger.members.map(row => row.id === memberId ? { ...row, linkToken: token, linkIssuedAt: at, failedAttempts: 0 } : row);
    return { next: withSeatEvent({ ...ledger, members }, { at, kind: "link-issued", by, detail: `رابطٌ جديد لـ${member.name}${previous ? "، وأُبطل السابق" : ""}` }), result: token };
  });
  if ("error" in out) return out;
  await saveSeatLink({ token, userId: seatId, memberId, createdAt: at });
  await revokeSeatLink(previous);
  return { ok: true as const, token };
}

const collegeIdsFrom = (body: any): number[] =>
  [...new Set((Array.isArray(body?.collegeIds) ? body.collegeIds : body?.collegeId ? [body.collegeId] : []).map(Number).filter((id: number) => Number.isInteger(id) && id > 0))] as number[];

/** الحرمُ المغطّاة بكراسي «رئيس تسجيل الكلية» — عدا كرسيٍّ يُعدَّل حرمُه الآن. */
async function collegeRegistrarCoverage(exceptSeatId = 0): Promise<Set<number>> {
  const covered = new Set<number>();
  for (const user of await Repository.getUsers()) {
    if (user.IsDeleted || Number(user.SystemUserId) === exceptSeatId || roleDefinition((user as any).Role).id !== "collegeRegistrar") continue;
    for (const row of await Repository.getUserAssigns(Number(user.SystemUserId))) covered.add(Number(row.AdCollegeId));
  }
  return covered;
}

/** أيُّ كرسيّ رئيس تسجيلٍ يغطي كلَّ حرم. */
async function collegeRegistrarSeatOf(): Promise<Map<number, number>> {
  const seatOf = new Map<number, number>();
  for (const user of await Repository.getUsers()) {
    if (user.IsDeleted || roleDefinition((user as any).Role).id !== "collegeRegistrar") continue;
    for (const row of await Repository.getUserAssigns(Number(user.SystemUserId))) seatOf.set(Number(row.AdCollegeId), Number(user.SystemUserId));
  }
  return seatOf;
}

export interface CollegeRegistrarProvision { seatId: number; login: string; seatName: string; colleges: string[]; status: "created" | "extended" }

/**
 * ── رئيسُ تسجيلٍ لكل كلية ناقصة (قرار المالك 2026-10-29) ─────────────────────
 *
 * لكل كليةٍ بحرمها: الحرمُ التي لا رئيس تسجيل لها تُضاف إلى كرسيّ الكلية إن كان لها كرسيّ،
 * وإلا أُنشئ لها كرسيٌّ واحد. الكرسيُّ الجديد بالكلمة الافتراضية ومُعلَّمٌ بتغييرها عند أول دخول
 * (passwordChangeGate)، وشاشاتُه من قالب صفته. لا يُمسّ كرسيٌّ قائم إلا بإضافة حرمٍ ناقص إليه.
 * `onlyCollegeIds` يحصرها في كلياتٍ بعينها (الكلية التي أُنشئت للتوّ).
 */
export async function ensureCollegeRegistrars(by: string, onlyCollegeIds?: number[]): Promise<CollegeRegistrarProvision[]> {
  const colleges = (await Repository.getColleges()) as any[];
  const seatOf = await collegeRegistrarSeatOf();
  const only = onlyCollegeIds ? new Set(onlyCollegeIds.map(Number)) : null;
  const role = roleDefinition("collegeRegistrar");
  const out: CollegeRegistrarProvision[] = [];
  for (const family of campusFamilies(colleges)) {
    const missing = family.colleges.filter(college => !seatOf.has(college.collegeId) && (!only || only.has(college.collegeId)));
    if (!missing.length) continue;
    const at = new Date().toISOString();
    const existingSeat = family.colleges.map(college => seatOf.get(college.collegeId)).find(Boolean);
    if (existingSeat) {
      const seat = await Repository.getUserById(existingSeat);
      const assigns = await Repository.getUserAssigns(existingSeat);
      await Repository.saveUserAssigns(existingSeat, [...assigns.map(row => ({ AdCollegeId: Number(row.AdCollegeId), AdSectionId: Number(row.AdSectionId) })), ...missing.map(college => ({ AdCollegeId: college.collegeId, AdSectionId: 0 }))]);
      /* كرسيٌّ سُمّي باسم حرمه الأول يُسمّى باسم كليته حين يلحق به حرمٌ آخر — والاسمُ الذي كتبه المدير بيده لا يُمسّ. */
      const covered = new Set([...assigns.map(row => Number(row.AdCollegeId)), ...missing.map(c => c.collegeId)]);
      const coveredNames = colleges.filter(row => covered.has(Number(row.AdCollegeId))).map(row => String(row.AdCollegeName || ""));
      const autoNames = new Set(colleges.filter(row => covered.has(Number(row.AdCollegeId))).map(row => `${role.label} — ${row.AdCollegeName}`));
      if (seat && autoNames.has(String(seat.Name || ""))) await Repository.updateUser(existingSeat, { Name: `${role.label} — ${campusFamilyName(coveredNames)}` } as any);
      await updateSeatLedger(existingSeat, ledger => ({ next: withSeatEvent(ledger, { at, kind: "seat-colleges", by, detail: `أُضيف: ${missing.map(c => c.collegeName).join("، ")}` }), result: true }));
      for (const college of missing) seatOf.set(college.collegeId, existingSeat);
      out.push({ seatId: existingSeat, login: String(seat?.SystemUserLogin || ""), seatName: String((await Repository.getUserById(existingSeat))?.Name || ""), colleges: missing.map(c => c.collegeName), status: "extended" });
      continue;
    }
    const first = colleges.find(row => Number(row.AdCollegeId) === missing[0].collegeId);
    const tag = String(first?.AdCollegeCode || "").replace(/[^A-Za-z0-9]/g, "").toLowerCase() || `c${missing[0].collegeId}`;
    const logins = new Set((await Repository.getUsers()).map(user => String(user.SystemUserLogin || "").toLowerCase()));
    let login = `${tag}registrar`;
    for (let n = 2; logins.has(login.toLowerCase()); n += 1) login = `${tag}registrar${n}`;
    const user = await Repository.createUser({
      Name: `${role.label} — ${campusFamilyName(missing.map(c => c.collegeName))}`, SystemUserLogin: login,
      SystemUserPass: Repository.hashPassword(LEGACY_SHARED_PASSWORD), SystemUserPassVault: Repository.encryptPasswordForVault(LEGACY_SHARED_PASSWORD),
      IsAdminUser: false, IsActive: true, IsLocked: false, IsDeleted: false, AdInstructorId: 0, Role: role.id, MustChangePassword: true,
    } as any);
    await Repository.saveSecurityByUser(user.SystemUserId, role.formIds);
    await Repository.saveUserAssigns(user.SystemUserId, missing.map(college => ({ AdCollegeId: college.collegeId, AdSectionId: 0 })));
    await updateSeatLedger(user.SystemUserId, ledger => ({ next: withSeatEvent(ledger, { at, kind: "seat-created", by, detail: `${user.Name}: ${missing.map(c => c.collegeName).join("، ")}` }), result: true }));
    for (const college of missing) seatOf.set(college.collegeId, user.SystemUserId);
    out.push({ seatId: user.SystemUserId, login, seatName: user.Name, colleges: missing.map(c => c.collegeName), status: "created" });
  }
  return out;
}

/* ── حارسُ العضو ──────────────────────────────────────────────────────────── */

/** ما لا يكتبه عضوُ الفريق: التوقيعُ وسحبُه، وإدارةُ الكرسي، وكلمةُ سرّه. والنائبُ يوقّع. */
const MEMBER_BLOCKED = ["/approvals/sign", "/approvals/withdraw", "/approvals/head-return", "/auth/change-password"];
export function seatMemberGuard(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const actor = actorOf(req);
  if (!actor || actor.kind === "holder" || req.method === "GET" || req.method === "HEAD") { next(); return; }
  const path = req.path;
  if (path === "/seats/switch") { next(); return; }
  const signing = path === "/approvals/sign" || path === "/approvals/withdraw";
  if (actor.kind === "deputy" && signing) { next(); return; }
  if (MEMBER_BLOCKED.includes(path) || path.startsWith("/seats/") || path === "/seats" || path.startsWith("/users")) {
    res.status(403).json({ error: signing ? "التوقيع لرئيس الفريق أو نائبه. أنت تعمل عضواً في الفريق." : "هذا لرئيس الفريق. أنت تعمل عضواً فيه.", code: "seat-member" });
    return;
  }
  next();
}

/* ── المسارات ─────────────────────────────────────────────────────────────── */

export function registerSeatsRoutes(app: Express): void {

/** كلُّ الكراسي لمدير النظام: من عليها، وكم في فرقها، وما الكراسي الناقصة. */
app.get("/api/seats", requirePowerAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  const [users, ledgers, assigns, colleges] = await Promise.all([Repository.getUsers(), listSeatLedgers(), Repository.getCollegeUserAssigns(), Repository.getColleges()]);
  const nameOf = await scopeNames();
  const ledgerOf = new Map(ledgers.map(row => [Number(row.userId), row]));
  const assignsOf = new Map<number, SeatScope[]>();
  for (const row of assigns) assignsOf.set(Number(row.SystemUserId), [...(assignsOf.get(Number(row.SystemUserId)) || []), row]);
  const seats = users.filter(user => !user.IsDeleted && !user.IsAdminUser && isSeatRole((user as any).Role)).map(user => {
    const ledger = ledgerOf.get(Number(user.SystemUserId));
    const members = ledger?.members || [];
    const count = (badge: string) => members.filter(member => seatMemberBadge(member) === badge).length;
    const role = roleDefinition((user as any).Role);
    const scopes = assignsOf.get(Number(user.SystemUserId)) || [];
    return {
      id: Number(user.SystemUserId), login: user.SystemUserLogin, name: user.Name, role: role.id, roleLabel: role.label, order: role.order,
      active: Boolean(user.IsActive) && !user.IsLocked, mustChangePassword: Boolean((user as any).MustChangePassword),
      collegeIds: [...new Set(scopes.map(row => Number(row.AdCollegeId)))],
      scopeLabel: role.scopeMode === "allColleges" ? "كل الكليات" : scopes.slice(0, 2).map(nameOf).join("، ") + (scopes.length > 2 ? ` و${scopes.length - 2} غيرها` : ""),
      holder: ledger?.holder || null,
      deputy: activeDeputy(ledger) || null,
      team: seatTeamRule(role.id) ? { active: count("active"), pending: count("pending"), frozen: count("frozen"), ended: count("ended") } : null,
      lastEvent: ledger?.history[ledger.history.length - 1] || null,
    };
  }).sort((a, b) => a.order - b.order || String(a.name).localeCompare(String(b.name), "ar"));
  /* الحرمُ بلا رئيس تسجيل، مجموعةً بكليتها: «التربية الأساسية (بنين · بنات · الفحيحيل)» زرٌّ واحد. */
  const withCollegeRegistrar = new Set(seats.filter(seat => seat.role === "collegeRegistrar").flatMap(seat => seat.collegeIds));
  const missingCollegeRegistrars = campusFamilies((colleges as any[]).filter(college => !withCollegeRegistrar.has(Number(college.AdCollegeId))));
  res.json({ seats, missingCollegeRegistrars, roles: ACADEMIC_ROLES.filter(role => isSeatRole(role.id)).map(role => ({ id: role.id, label: role.label, order: role.order })) });
});

app.get("/api/seats/mine", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const seat = await seatUser(Number(req.user?.SystemUserId));
  if (!seat) { res.json({ seat: null }); return; }
  const view = await seatView({ ...seat, SeatName: seat.Name }, await readSeatLedger(seat.SystemUserId), req);
  res.json({ ...view, candidates: view.canManage && view.team?.source === "department" ? await seatCandidates(seat, "department") : [] });
});

app.get("/api/seats/switch-options", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  res.json({ options: await switchOptions(req) });
});

/** من يجلس على أكثر من كرسي يتنقّل بينها بلا خروج: إلى كرسيٍّ هو شاغله (من جلسةِ شاغلٍ فقط)، أو فريقٍ هو عضوٌ فيه. */
async function switchOptions(req: AuthenticatedRequest) {
  const actor = actorOf(req);
  const instructorId = Number(actor?.instructorId || 0);
  if (!instructorId || Repository.isDemoRequest()) return [];
  const [users, ledgers] = await Promise.all([Repository.getUsers(), listSeatLedgers()]);
  const userOf = new Map(users.map(user => [Number(user.SystemUserId), user as any]));
  const options: Array<{ userId: number; memberId?: string; seatName: string; caption: string }> = [];
  for (const ledger of ledgers) {
    const user = userOf.get(Number(ledger.userId));
    if (!user || user.IsDeleted || !user.IsActive || user.IsLocked) continue;
    const here = Number(ledger.userId) === Number(req.user?.SystemUserId);
    if (actor?.kind === "holder" && !here && Number(ledger.holder?.instructorId || 0) === instructorId && !user.MustChangePassword) {
      options.push({ userId: Number(ledger.userId), seatName: String(user.Name || ""), caption: roleLabel(user.Role) });
    }
    for (const member of ledger.members) {
      if (member.status !== "active" || Number(member.instructorId || 0) !== instructorId) continue;
      if (here && actor?.memberId === member.id) continue;
      options.push({ userId: Number(ledger.userId), memberId: member.id, seatName: String(user.Name || ""), caption: seatTeamRule(user.Role)?.memberLabel || "عضو فريق" });
    }
  }
  return options;
}

app.post("/api/seats/switch", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = Number(req.body?.userId || 0), memberId = clean(req.body?.memberId, 64) || undefined;
  const option = (await switchOptions(req)).find(row => row.userId === userId && row.memberId === memberId);
  if (!option) { res.status(403).json({ error: "لست رئيس هذا الفريق ولا عضواً فيه." }); return; }
  const previous = getCookies(req)["session_id"];
  const sessionId = `sess_${randomBytes(32).toString("hex")}`;
  await Repository.createSession(sessionId, userId, SERVER_IDLE_SESSION_MS, memberId ? { memberId } : {});
  if (previous?.startsWith("sess_")) await Repository.deleteSession(previous);
  res.setHeader("Set-Cookie", `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax${secure()}`);
  res.locals.auditChanges = `انتقل إلى العمل بصفة «${option.caption}» على ${option.seatName}`;
  res.json({ ok: true });
});

app.get("/api/seats/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const seat = await seatUser(Number(req.params.id));
  if (!seat) { res.status(404).json({ error: "الفريق غير موجود." }); return; }
  if (!managesSeat(req, seat.SystemUserId) && !(await handsOverSeat(req, seat))) { res.status(403).json({ error: "لا تدير هذا الفريق." }); return; }
  const view = await seatView(seat, await readSeatLedger(seat.SystemUserId), req);
  const rule = seatTeamRule(seat.Role);
  res.json({
    ...view,
    candidates: view.canManage && rule?.source === "department" ? await seatCandidates(seat, "department") : [],
    holderCandidates: view.canHandOver ? await seatCandidates(seat, seatHolderSource(seat.Role)) : [],
  });
});

/** يسجّل مديرُ النظام شاغلَ الكرسي الحالي كما هو، بلا كلمةٍ جديدة ولا إخراج: «من يجلس هنا اليوم». */
app.post("/api/seats/:id/holder", requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const seat = await seatUser(Number(req.params.id));
  if (!seat) { res.status(404).json({ error: "الفريق غير موجود." }); return; }
  const person = await personFrom(req.body);
  if ("error" in person) { res.status(400).json({ error: person.error }); return; }
  const at = new Date().toISOString(), by = byName(req);
  const holder: SeatHolder = { name: person.name, ...(person.instructorId ? { instructorId: person.instructorId } : {}), ...(person.mobile ? { mobile: person.mobile } : {}), since: clean(req.body?.since, 10) || at, by };
  const out = await updateSeatLedger(seat.SystemUserId, ledger => ({ next: withSeatEvent({ ...ledger, holder }, { at, kind: "holder-set", by, detail: `الرئيس: ${holder.name}` }), result: true }));
  if ("error" in out) { res.status(409).json({ error: out.error }); return; }
  if (person.instructorId) await Repository.updateUser(seat.SystemUserId, { AdInstructorId: person.instructorId } as any);
  res.locals.auditChanges = `رئيس ${seat.Name}: ${holder.name}`;
  res.json(await seatView(await seatUser(seat.SystemUserId), out.ledger, req));
});

/** التسليم: شاغلٌ جديد، وكلمةٌ أولى تظهر مرة واحدة، وكلُّ جهازٍ مفتوح يُخرج، والفريقُ يُجمَّد. */
app.post("/api/seats/:id/handover", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const seat = await seatUser(Number(req.params.id));
  if (!seat) { res.status(404).json({ error: "الفريق غير موجود." }); return; }
  if (!(await handsOverSeat(req, seat))) { res.status(403).json({ error: "يسلّم الرئاسةَ رئيسُ الفريق أو مدير النظام." }); return; }
  if (Repository.isDemoRequest() && Number(req.user?.SystemUserId) === Number(seat.SystemUserId)) {
    res.status(409).json({ error: "في البيئة التجريبية سلّم الرئاسة من حساب مدير النظام، حتى لا تُغلق جلستك.", code: "demo-self-handover" }); return;
  }
  const person = await personFrom(req.body);
  if ("error" in person) { res.status(400).json({ error: person.error }); return; }
  const at = new Date().toISOString(), by = byName(req);
  const holder: SeatHolder = { name: person.name, ...(person.instructorId ? { instructorId: person.instructorId } : {}), ...(person.mobile ? { mobile: person.mobile } : {}), since: at, by };
  const before = await readSeatLedger(seat.SystemUserId);
  if (before?.holder && person.instructorId && Number(before.holder.instructorId || 0) === person.instructorId) {
    res.status(409).json({ error: "هذا هو الرئيس الحالي نفسه." }); return;
  }
  const out = await updateSeatLedger(seat.SystemUserId, ledger => ({ next: handOverLedger(ledger, holder, by), result: true }));
  if ("error" in out) { res.status(409).json({ error: out.error }); return; }
  const password = await resetSeatCredentials(seat, person.instructorId ?? 0);
  res.locals.auditChanges = `تسليم ${seat.Name}${before?.holder ? `: ${before.holder.name} ← ${holder.name}` : ` إلى ${holder.name}`}`;
  res.json({ handedOver: true, login: seat.SystemUserLogin, seatName: seat.Name, password, holder, selfHandover: Number(req.user?.SystemUserId) === Number(seat.SystemUserId) });
});

app.post("/api/seats/:id/members", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const seat = await seatUser(Number(req.params.id));
  if (!seat) { res.status(404).json({ error: "الفريق غير موجود." }); return; }
  if (!managesSeat(req, seat.SystemUserId)) { res.status(403).json({ error: "يدير الفريقَ رئيسُه." }); return; }
  const rule = seatTeamRule(seat.Role);
  if (!rule) { res.status(400).json({ error: "هذا المنصب لشخصٍ واحد، بلا أعضاء." }); return; }
  if (rule.source === "department" && !Number(req.body?.instructorId || 0)) { res.status(400).json({ error: "اختر العضو من أساتذة القسم." }); return; }
  if (rule.source === "department") {
    const allowed = await seatCandidates(seat, "department");
    if (!allowed.some(row => row.id === Number(req.body.instructorId))) { res.status(400).json({ error: "هذا الأستاذ ليس من أساتذة القسم." }); return; }
  }
  const person = await personFrom(rule.source === "manual" ? { ...req.body, instructorId: 0 } : req.body);
  if ("error" in person) { res.status(400).json({ error: person.error }); return; }
  const scopes = await memberScopesFrom(req.body, seat);
  if ("error" in scopes) { res.status(400).json({ error: scopes.error }); return; }
  const at = new Date().toISOString(), by = byName(req);
  const id = `m_${randomBytes(6).toString("hex")}`;
  const member: SeatMember = {
    id, status: "active", name: person.name, addedAt: at, addedBy: by,
    ...(person.instructorId ? { instructorId: person.instructorId } : {}),
    ...(person.mobile ? { mobile: person.mobile } : {}),
    ...(civilTailOf(person.civil) ? { civilTail: civilTailOf(person.civil) } : {}),
    ...(scopes.length ? { scopes } : {}),
  };
  const out = await updateSeatLedger(seat.SystemUserId, ledger => {
    const live = ledger.members.filter(row => row.status !== "ended");
    if (live.length >= SEAT_TEAM_LIMIT) return { refuse: `الفريق مكتمل (${SEAT_TEAM_LIMIT}).` };
    const same = live.find(row => (person.instructorId && Number(row.instructorId) === person.instructorId) || row.name === person.name);
    if (same) return { refuse: `${same.name} في الفريق من قبل.` };
    if (ledger.holder && person.instructorId && Number(ledger.holder.instructorId || 0) === person.instructorId) return { refuse: "هذا رئيس الفريق نفسه." };
    return { next: withSeatEvent({ ...ledger, members: [...ledger.members, member] }, { at, kind: "member-added", by, detail: `${rule.memberLabel}: ${member.name}` }), result: true };
  });
  if ("error" in out) { res.status(409).json({ error: out.error }); return; }
  const link = await issueMemberLink(seat.SystemUserId, id, by);
  if ("error" in link) { res.status(409).json({ error: link.error }); return; }
  res.locals.auditChanges = `${rule.memberLabel} جديد في ${seat.Name}: ${member.name}`;
  res.status(201).json({ member: memberView({ ...member, linkToken: link.token }, true), token: link.token, mobile: member.mobile || "" });
});

app.post("/api/seats/:id/members/:mid/link", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const seatId = Number(req.params.id);
  const seat = await seatUser(seatId);
  if (!seat) { res.status(404).json({ error: "الفريق غير موجود." }); return; }
  if (!managesSeat(req, seatId)) { res.status(403).json({ error: "يصدر الروابطَ رئيسُ الفريق أو مدير النظام." }); return; }
  const link = await issueMemberLink(seatId, String(req.params.mid), byName(req));
  if ("error" in link) { res.status(409).json({ error: link.error }); return; }
  const member = (await readSeatLedger(seatId))?.members.find(row => row.id === String(req.params.mid));
  res.locals.auditChanges = `رابطٌ جديد لـ${member?.name || "عضو"} في ${seat.Name}`;
  res.json({ token: link.token, mobile: member?.mobile || "", name: member?.name || "" });
});

/** «مستمر» يعيد العضو برابطه نفسه؛ «انتهت عضويته» يُبطل رابطه ويُخرج أجهزته. */
app.post("/api/seats/:id/members/:mid/status", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const seatId = Number(req.params.id), memberId = String(req.params.mid);
  const seat = await seatUser(seatId);
  if (!seat) { res.status(404).json({ error: "الفريق غير موجود." }); return; }
  if (!managesSeat(req, seatId)) { res.status(403).json({ error: "يدير الفريقَ رئيسُه." }); return; }
  const status = String(req.body?.status || "");
  if (status !== "active" && status !== "ended") { res.status(400).json({ error: "حالةٌ غير معروفة." }); return; }
  const at = new Date().toISOString(), by = byName(req);
  let token: string | undefined;
  const out = await updateSeatLedger(seatId, ledger => {
    const member = ledger.members.find(row => row.id === memberId);
    if (!member) return { refuse: "العضو غير موجود." };
    if (member.status === status) return { refuse: status === "active" ? "العضو يعمل من قبل." : "انتهت عضويته من قبل." };
    if (status === "active" && ledger.members.filter(row => row.status === "active").length >= SEAT_TEAM_LIMIT) return { refuse: "الفريق مكتمل." };
    token = member.linkToken;
    const members = ledger.members.map(row => row.id !== memberId ? row
      : status === "active" ? { ...row, status: "active" as const, frozenAt: undefined, endedAt: undefined }
        : { ...row, status: "ended" as const, endedAt: at, linkToken: undefined });
    const deputy = status === "ended" && ledger.deputy?.memberId === memberId ? undefined : ledger.deputy;
    return { next: withSeatEvent({ ...ledger, members, deputy }, { at, kind: status === "active" ? "member-continued" : "member-ended", by, detail: member.name }), result: member.name };
  });
  if ("error" in out) { res.status(409).json({ error: out.error }); return; }
  if (status === "ended") { await revokeSeatLink(token); await Repository.deleteSessionsForUser(seatId, memberId); authCache.clear(); }
  res.locals.auditChanges = `${status === "active" ? "استمرار" : "انتهاء عضوية"} ${out.result} في ${seat.Name}`;
  res.json(await seatView(seat, out.ledger, req));
});

app.post("/api/seats/:id/members/:mid/scopes", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const seatId = Number(req.params.id), memberId = String(req.params.mid);
  const seat = await seatUser(seatId);
  if (!seat) { res.status(404).json({ error: "الفريق غير موجود." }); return; }
  if (!managesSeat(req, seatId)) { res.status(403).json({ error: "يدير الفريقَ رئيسُه." }); return; }
  const scopes = await memberScopesFrom(req.body, seat);
  if ("error" in scopes) { res.status(400).json({ error: scopes.error }); return; }
  if (!scopes.length) { res.status(400).json({ error: "أعضاء هذا الفريق يعملون في نطاقه كله." }); return; }
  const at = new Date().toISOString(), by = byName(req);
  const out = await updateSeatLedger(seatId, ledger => {
    const member = ledger.members.find(row => row.id === memberId);
    if (!member) return { refuse: "العضو غير موجود." };
    const members = ledger.members.map(row => row.id === memberId ? { ...row, scopes } : row);
    return { next: withSeatEvent({ ...ledger, members }, { at, kind: "member-scopes", by, detail: `نطاق ${member.name}: ${scopes.length}` }), result: member.name };
  });
  if ("error" in out) { res.status(409).json({ error: out.error }); return; }
  authCache.clear();
  res.locals.auditChanges = `نطاق ${out.result} في ${seat.Name}`;
  res.json(await seatView(seat, out.ledger, req));
});

/** نائبٌ مؤقت: عضوٌ عاملٌ من الفريق يوقّع حتى آخر يومٍ يحدّده الشاغل. */
app.post("/api/seats/:id/deputy", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const seatId = Number(req.params.id);
  const seat = await seatUser(seatId);
  if (!seat) { res.status(404).json({ error: "الفريق غير موجود." }); return; }
  if (!managesSeat(req, seatId)) { res.status(403).json({ error: "يكلّف النائبَ رئيسُ الفريق." }); return; }
  const until = clean(req.body?.until, 10), memberId = clean(req.body?.memberId, 64);
  const today = new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || until < today) { res.status(400).json({ error: "اختر تاريخ نهايةٍ من اليوم فصاعداً." }); return; }
  const at = new Date().toISOString(), by = byName(req);
  const out = await updateSeatLedger(seatId, ledger => {
    const member = ledger.members.find(row => row.id === memberId && row.status === "active");
    if (!member) return { refuse: "النائب يُختار من أعضاء الفريق العاملين." };
    return { next: withSeatEvent({ ...ledger, deputy: { memberId, name: member.name, until, setAt: at, setBy: by } }, { at, kind: "deputy-set", by, detail: `${member.name} نائباً حتى ${until}` }), result: member.name };
  });
  if ("error" in out) { res.status(409).json({ error: out.error }); return; }
  authCache.clear();
  res.locals.auditChanges = `تكليف ${out.result} نائباً في ${seat.Name} حتى ${until}`;
  res.json(await seatView(seat, out.ledger, req));
});

app.post("/api/seats/:id/deputy/end", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const seatId = Number(req.params.id);
  const seat = await seatUser(seatId);
  if (!seat) { res.status(404).json({ error: "الفريق غير موجود." }); return; }
  if (!managesSeat(req, seatId)) { res.status(403).json({ error: "يُنهي النيابةَ رئيسُ الفريق." }); return; }
  const at = new Date().toISOString(), by = byName(req);
  const out = await updateSeatLedger(seatId, ledger => {
    if (!ledger.deputy) return { refuse: "لا نائب الآن." };
    const { deputy: _ended, ...rest } = ledger;
    return { next: withSeatEvent(rest as SeatLedger, { at, kind: "deputy-ended", by, detail: ledger.deputy.name }), result: ledger.deputy.name };
  });
  if ("error" in out) { res.status(409).json({ error: out.error }); return; }
  authCache.clear();
  res.locals.auditChanges = `إنهاء نيابة ${out.result} في ${seat.Name}`;
  res.json(await seatView(seat, out.ledger, req));
});

/**
 * كرسيُّ «رئيس تسجيل الكلية»: كرسيٌّ واحد قد يغطي حرماً أو أكثر من الكلية نفسها
 * (بنين، بنات، الفحيحيل…)، وكلُّ حرمٍ في النظام كليةٌ قائمة بذاتها. ومعه شاغلُه وكلمتُه الأولى.
 */
/** «أنشئ رؤساء التسجيل لكل الكليات الناقصة»: كرسيٌّ لكل كليةٍ بحرمها، بالكلمة الافتراضية وتغييرها عند أول دخول. */
app.post("/api/seats/college-registrars/all", requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const results = await ensureCollegeRegistrars(byName(req));
  authCache.clear();
  const created = results.filter(row => row.status === "created").length, extended = results.length - created;
  res.locals.auditChanges = `رؤساء تسجيل الكليات: أُنشئ ${created}، ووُسّع ${extended}`;
  res.json({ results, password: LEGACY_SHARED_PASSWORD });
});

app.post("/api/seats/college-registrar", requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const wanted = collegeIdsFrom(req.body);
  if (!wanted.length) { res.status(400).json({ error: "اختر حرماً واحداً على الأقل." }); return; }
  const colleges = (await Repository.getColleges()) as any[];
  const picked = wanted.map(id => colleges.find(row => Number(row.AdCollegeId) === id)).filter(Boolean);
  if (picked.length !== wanted.length) { res.status(404).json({ error: "في الاختيار حرمٌ غير موجود." }); return; }
  const person = await personFrom({ ...req.body, instructorId: 0 });
  if ("error" in person) { res.status(400).json({ error: person.error }); return; }
  const taken = await collegeRegistrarCoverage();
  const clash = picked.find(college => taken.has(Number(college.AdCollegeId)));
  if (clash) { res.status(409).json({ error: `«${clash.AdCollegeName}» له فريق تسجيل من قبل. أضفه إلى فريقه أو سلّم رئاسته بدل إنشاء آخر.` }); return; }
  const users = await Repository.getUsers();
  const first = picked[0];
  const tag = String(first.AdCollegeCode || "").replace(/[^A-Za-z0-9]/g, "").toLowerCase() || `c${first.AdCollegeId}`;
  const logins = new Set(users.map(user => String(user.SystemUserLogin || "").toLowerCase()));
  let login = `${tag}registrar`;
  for (let n = 2; logins.has(login.toLowerCase()); n += 1) login = `${tag}registrar${n}`;
  const password = generateInitialPassword();
  const role = roleDefinition("collegeRegistrar");
  const user = await Repository.createUser({
    Name: `${role.label} — ${campusFamilyName(picked.map(row => String(row.AdCollegeName || "")))}`, SystemUserLogin: login,
    SystemUserPass: Repository.hashPassword(password), SystemUserPassVault: Repository.encryptPasswordForVault(password),
    IsAdminUser: false, IsActive: true, IsLocked: false, IsDeleted: false, AdInstructorId: 0, Role: role.id, MustChangePassword: true,
  } as any);
  await Repository.saveSecurityByUser(user.SystemUserId, role.formIds);
  await Repository.saveUserAssigns(user.SystemUserId, picked.map(row => ({ AdCollegeId: Number(row.AdCollegeId), AdSectionId: 0 })));
  const at = new Date().toISOString(), by = byName(req);
  const holder: SeatHolder = { name: person.name, ...(person.mobile ? { mobile: person.mobile } : {}), since: at, by };
  await updateSeatLedger(user.SystemUserId, ledger => ({
    next: withSeatEvent(withSeatEvent({ ...ledger, holder }, { at, kind: "seat-created", by, detail: `${user.Name}: ${picked.map(row => row.AdCollegeName).join("، ")}` }), { at, kind: "holder-set", by, detail: `الرئيس: ${holder.name}` }),
    result: true,
  }));
  res.locals.auditChanges = `فريقٌ جديد: ${user.Name} — الرئيس ${holder.name}`;
  res.status(201).json({ seatId: user.SystemUserId, login, password, seatName: user.Name, holder });
});

/** حرمُ كرسيّ «رئيس تسجيل الكلية» بعد إنشائه: يُضاف إليه حرمٌ أو يُرفع عنه. لمدير النظام وحده. */
app.post("/api/seats/:id/colleges", requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const seat = await seatUser(Number(req.params.id));
  if (!seat || roleDefinition(seat.Role).id !== "collegeRegistrar") { res.status(404).json({ error: "هذا ليس فريق تسجيل كلية." }); return; }
  const wanted = collegeIdsFrom(req.body);
  if (!wanted.length) { res.status(400).json({ error: "يبقى للفريق حرمٌ واحد على الأقل." }); return; }
  const colleges = (await Repository.getColleges()) as any[];
  const picked = wanted.map(id => colleges.find(row => Number(row.AdCollegeId) === id)).filter(Boolean);
  if (picked.length !== wanted.length) { res.status(404).json({ error: "في الاختيار حرمٌ غير موجود." }); return; }
  const taken = await collegeRegistrarCoverage(Number(seat.SystemUserId));
  const clash = picked.find(college => taken.has(Number(college.AdCollegeId)));
  if (clash) { res.status(409).json({ error: `«${clash.AdCollegeName}» له رئيس تسجيل آخر.` }); return; }
  const before = new Set((await Repository.getUserAssigns(Number(seat.SystemUserId))).map(row => Number(row.AdCollegeId)));
  await Repository.saveUserAssigns(Number(seat.SystemUserId), picked.map(row => ({ AdCollegeId: Number(row.AdCollegeId), AdSectionId: 0 })));
  const added = picked.filter(row => !before.has(Number(row.AdCollegeId))).map(row => row.AdCollegeName);
  const removed = colleges.filter(row => before.has(Number(row.AdCollegeId)) && !wanted.includes(Number(row.AdCollegeId))).map(row => row.AdCollegeName);
  const at = new Date().toISOString(), by = byName(req);
  const detail = [added.length ? `أُضيف: ${added.join("، ")}` : "", removed.length ? `رُفع: ${removed.join("، ")}` : ""].filter(Boolean).join(" · ") || "بلا تغيير";
  const out = await updateSeatLedger(Number(seat.SystemUserId), ledger => ({ next: withSeatEvent(ledger, { at, kind: "seat-colleges", by, detail }), result: true }));
  authCache.clear();
  res.locals.auditChanges = `حرم ${seat.Name}: ${detail}`;
  res.json(await seatView(seat, "error" in out ? await readSeatLedger(Number(seat.SystemUserId)) : out.ledger, req));
});

/* ── الدخول برابط العضو ──────────────────────────────────────────────────── */

async function linkContext(token: string) {
  const link = await readSeatLink(token);
  if (!link || link.revokedAt) return { error: "هذا الرابط لم يعد صالحاً. اطلب رابطاً جديداً من رئيس الفريق." } as const;
  const [seat, ledger] = await Promise.all([seatUser(link.userId), readSeatLedger(link.userId)]);
  const member = ledger?.members.find(row => row.id === link.memberId);
  if (!seat || !seat.IsActive || seat.IsLocked || !ledger || !member || member.linkToken !== link.token) return { error: "هذا الرابط لم يعد صالحاً. اطلب رابطاً جديداً من رئيس الفريق." } as const;
  if (member.status === "frozen") return { error: "تسلّم رئاسةَ الفريق رئيسٌ جديد، وعضويتك بانتظار تأكيده. سيصلك الخبر حين يؤكّدها." } as const;
  if (member.status !== "active") return { error: "انتهت عضويتك في هذا الفريق." } as const;
  return { link, seat, ledger, member } as const;
}

app.get("/k/:token", async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  const token = String(req.params.token || "");
  const nonce = publicPageNonce(res);
  const context = await linkContext(token);
  if ("error" in context) { res.status(410).type("text/html; charset=utf-8").send(seatTeamPage({ nonce, token, error: context.error })); return; }
  const remembered = await seatDeviceKeyValid(getCookies(req)[SEAT_DEVICE_COOKIE], token, context.member.id);
  res.type("text/html; charset=utf-8").send(seatTeamPage({
    nonce, token, memberName: context.member.name, seatName: String(context.seat.Name || ""),
    caption: seatTeamRule(context.seat.Role)?.memberLabel || "عضو فريق",
    needsTail: Boolean(context.member.civilTail) && !remembered,
    demo: isDemoLinkToken(token),
  }));
});

app.post("/api/public/team/:token", async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  const token = String(req.params.token || "");
  const context = await linkContext(token);
  if ("error" in context) { res.status(410).json({ error: context.error }); return; }
  const { seat, member } = context;
  const remembered = await seatDeviceKeyValid(getCookies(req)[SEAT_DEVICE_COOKIE], token, member.id);
  if (member.civilTail && !remembered) {
    const tail = civilTailOf(req.body?.tail);
    if (tail !== member.civilTail) {
      const out = await updateSeatLedger(seat.SystemUserId, ledger => {
        const row = ledger.members.find(item => item.id === member.id);
        if (!row) return { refuse: "gone" };
        const attempts = Number(row.failedAttempts || 0) + 1;
        const locked = attempts >= SEAT_LINK_MAX_ATTEMPTS;
        const members = ledger.members.map(item => item.id === member.id ? { ...item, failedAttempts: attempts, ...(locked ? { linkToken: undefined } : {}) } : item);
        const next = { ...ledger, members };
        return { next: locked ? withSeatEvent(next, { kind: "link-locked", by: "النظام", detail: `أُقفل رابط ${row.name} بعد ${countOf(SEAT_LINK_MAX_ATTEMPTS, AR.attempt)} خاطئة` }) : next, result: locked };
      });
      if (!("error" in out) && out.result) { await revokeSeatLink(token); res.status(423).json({ error: "أُقفل الرابط بعد محاولاتٍ خاطئة. اطلب رابطاً جديداً من رئيس الفريق." }); return; }
      res.status(400).json({ error: "الأرقام الأربعة لا تطابق رقمك المدني." }); return;
    }
  }
  const at = new Date().toISOString();
  await updateSeatLedger(seat.SystemUserId, ledger => ({
    next: { ...ledger, members: ledger.members.map(item => item.id === member.id ? { ...item, failedAttempts: 0, firstEnteredAt: item.firstEnteredAt || at, lastEnteredAt: at } : item) },
    result: true,
  }));
  const cookies: string[] = [];
  if (Repository.isDemoRequest()) {
    /* في التجربة جلسةُ الزائر صندوقُه: يصبح هو العضو في صندوقه نفسه، كما يبدّل صفته من الشريط. */
    const sandbox = (req as AuthenticatedRequest).demoSessionId || Repository.currentDemoSessionId();
    if (!sandbox || getCookies(req)["session_id"] !== sandbox) { res.status(409).json({ error: "افتح رابط التجربة في المتصفح نفسه الذي أنشأه." }); return; }
    await Repository.createSession(sandbox, seat.SystemUserId, DEMO_SESSION_TTL_MS, { memberId: member.id });
    authCache.delete(sandbox);
  } else {
    const previous = getCookies(req)["session_id"];
    if (previous?.startsWith("sess_")) await Repository.deleteSession(previous).catch(() => undefined);
    const sessionId = `sess_${randomBytes(32).toString("hex")}`;
    await Repository.createSession(sessionId, seat.SystemUserId, SERVER_IDLE_SESSION_MS, { memberId: member.id });
    cookies.push(`session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax${secure()}`);
  }
  if (req.body?.remember && member.civilTail) {
    const key = await issueSeatDeviceKey(token, member.id);
    cookies.push(`${SEAT_DEVICE_COOKIE}=${key.value}; Path=/; Max-Age=${key.maxAgeSeconds}; HttpOnly; SameSite=Lax${secure()}`);
  }
  if (cookies.length) res.setHeader("Set-Cookie", cookies);
  res.json({ ok: true, redirect: "/" });
});

}
