/**
 * ── المستخدمون والصلاحيات والنطاقات ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { Request, Response } from "express";
import { Repository } from "../../db/repository";
import { ADVISOR_ROLE, DEPARTMENT_HEAD_ROLE, planAdvisorAccounts, planDepartmentHeadAccounts } from "../../utils/departmentHeadAccounts";
import { ACADEMIC_ROLES, DEFAULT_MIGRATION_ROLE, isAcademicRole, roleDefinition, roleLabel, type AcademicRole } from "../../utils/academicRoles";
import { AR, countOf } from "../../utils/arabicCount";
import { type AuthenticatedRequest, requireAnyPermission, requireAuth, requirePermission, requirePowerAdmin, requireRootAdmin } from "../core/auth";
import { safeSystemUser } from "../core/scope";

/* The schedule workspace and مركز الذكاء are the same permission — every
   intelligence route is guarded by it, and every list route accepts it. */
const DECISION_CENTRE_FORM_ID = 7;

// --- ADMIN SYSTEM USERS API ---

/**
 * ── قالب الدور: الشاشات والنطاق بلا تعيينٍ يدوي ─────────────────────────────
 *
 * إعطاء العميد حساباً كان يعني قبل هذا: فتح شاشة الصلاحيات، وتذكّر أن ١٤ هو
 * تقرير القسم، ثم فتح شاشة النطاقات، ثم إضافة صفٍّ لكل قسمٍ في الكلية — قسماً
 * قسماً، وكلما أُنشئ قسمٌ جديد يعود المدير ليضيفه. عشرون خطوة، وخطأٌ واحدٌ
 * فيها يفتح للعميد شاشةَ تعديل.
 *
 * صار القالب يفعلها: يُختار الدور، فتُكتب شاشاته ويُكتب نطاقه في عملية واحدة.
 * و«الكلية كلها» تُكتب صفّاً واحداً بقسم صفر — وهي صيغةٌ يفهمها النظام منذ
 * سنوات: `isScopeAllowed` تُجيز بها كل قسمٍ في الكلية، بما يُنشأ منها غداً.
 *
 * الأدوار ذات النطاق اليدوي — موظف التسجيل والمستخدم العادي — تأخذ شاشاتها
 * ويبقى نطاقها كما عيّنه المدير، فلا يمحو القالب عملاً مقصوداً.
 */
async function applyRoleTemplate(userId: number, role: AcademicRole, requested: { collegeIds?: number[]; assigns?: Array<{ AdCollegeId: number; AdSectionId: number }> }): Promise<{ formIds: number[]; scopeCount: number }> {
  const definition = roleDefinition(role);
  await Repository.saveSecurityByUser(userId, definition.formIds);

  if (definition.scopeMode === "manual") {
    const assigns = Array.isArray(requested.assigns) ? requested.assigns : undefined;
    if (assigns) await Repository.saveUserAssigns(userId, assigns);
    const current = await Repository.getUserAssigns(userId);
    return { formIds: definition.formIds, scopeCount: current.length };
  }

  if (definition.scopeMode === "allColleges") {
    /* «كل الكليات» ليست قائمةً تُحفظ مرّة ثم تشيخ: تُقرأ من سجلّ الكليات وقت
       الحفظ، وتُعاد كتابتها كلما حُفظ الحساب، فتلحق كليةٌ أُنشئت بعده. */
    const colleges = await Repository.getColleges();
    const assigns = colleges.map(college => ({ AdCollegeId: Number(college.AdCollegeId), AdSectionId: 0 }));
    await Repository.saveUserAssigns(userId, assigns);
    return { formIds: definition.formIds, scopeCount: assigns.length };
  }

  if (definition.scopeMode === "college") {
    /* ── الغياب ليس كالفراغ ───────────────────────────────────────────────
     *
     * حفظٌ لم يُذكر فيه نطاقٌ أصلاً لا يُقرأ «امحُ نطاقه» — وهذا ما يحمي
     * الحساب من أن يُفرَّغ بحفظٍ عابر. لكنّ قائمةً فارغةً أُرسلت صراحةً قرارٌ:
     * مديرٌ أزال كل الكليات عن عميدٍ وحفظ. وخلطُهما كان يجعل سحبَ النطاق
     * مستحيلاً من هذه الشاشة، والشاشةُ تقول «حُفظ» ولا شيء تغيّر — وهو أسوأ
     * من رفضٍ صريح.
     */
    if (requested.collegeIds === undefined) {
      const current = await Repository.getUserAssigns(userId);
      return { formIds: definition.formIds, scopeCount: current.length };
    }
    const collegeIds = requested.collegeIds.map(Number).filter(id => Number.isFinite(id) && id > 0);
    const assigns = Array.from(new Set(collegeIds)).map(collegeId => ({ AdCollegeId: collegeId, AdSectionId: 0 }));
    await Repository.saveUserAssigns(userId, assigns);
    return { formIds: definition.formIds, scopeCount: assigns.length };
  }

  // section: الكلية والقسم كما هو الحال اليوم
  const assigns = Array.isArray(requested.assigns) ? requested.assigns : undefined;
  if (assigns) await Repository.saveUserAssigns(userId, assigns);
  const current = await Repository.getUserAssigns(userId);
  return { formIds: definition.formIds, scopeCount: current.length };
}

/** النطاق وحده، حين تبقى الصفة كما هي وتتغيّر كلياتُها. */
async function applyRoleScopeOnly(userId: number, role: AcademicRole, collegeIds: unknown): Promise<void> {
  if (!Array.isArray(collegeIds)) return;   // غيابٌ لا قرار
  if (roleDefinition(role).scopeMode !== "college") return;
  const ids = collegeIds.map(Number).filter(id => Number.isFinite(id) && id > 0);
  /* وقائمةٌ فارغة أُرسلت صراحةً سحبٌ للنطاق، لا سهوٌ يُتجاوز. */
  await Repository.saveUserAssigns(userId, Array.from(new Set(ids)).map(collegeId => ({ AdCollegeId: collegeId, AdSectionId: 0 })));
}

/** تنقية صفوف النطاق الواردة من الشاشة قبل حفظها. */
function sanitizeAssigns(input: unknown): Array<{ AdCollegeId: number; AdSectionId: number }> {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const rows: Array<{ AdCollegeId: number; AdSectionId: number }> = [];
  for (const item of input) {
    const collegeId = Number((item as any)?.AdCollegeId || 0);
    const sectionId = Number((item as any)?.AdSectionId || 0);
    if (!Number.isFinite(collegeId) || collegeId <= 0) continue;
    const key = `${collegeId}:${sectionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ AdCollegeId: collegeId, AdSectionId: Number.isFinite(sectionId) && sectionId > 0 ? sectionId : 0 });
  }
  return rows;
}

/**
 * ── «إنشاء حسابات رؤساء الأقسام» ───────────────────────────────────────────
 *
 * الخطة من وحدةٍ واحدة (departmentHeadAccounts)؛ المعاينة والإنشاء يقرآنها
 * نفسها، فلا يُنشأ إلا ما عُرض. والإنشاء بلا كلمة سرّ وموقوف: لا يُولَّد سرٌّ
 * ولا يُطبع، والحساب لا يدخل حتى يعيّن المديرُ كلمته ويفعّله. لمدير النظام وحده.
 */
async function departmentHeadPlan() {
  const [users, assigns, colleges, sections] = await Promise.all([
    Repository.getUsers(), Repository.getCollegeUserAssigns(), Repository.getColleges(), Repository.getSections(),
  ]);
  return planDepartmentHeadAccounts({ users: users as any, assigns, colleges, sections });
}

/* حسابات المرشدين: الخطةُ نفسها بلاحقة advisor وصفة «مرشد القسم». */
async function advisorPlan() {
  const [users, assigns, colleges, sections] = await Promise.all([
    Repository.getUsers(), Repository.getCollegeUserAssigns(), Repository.getColleges(), Repository.getSections(),
  ]);
  return planAdvisorAccounts({ users: users as any, assigns, colleges, sections });
}

export function registerUsersRoutes(app: Express): void {

/** قائمة الأدوار كما تُعرض في شاشة المستخدمين. مصدرها الوحيد هو وحدة الأدوار. */
app.get("/api/roles", requireAuth, (_req: Request, res: Response) => {
  res.json(ACADEMIC_ROLES.map(role => ({
    id: role.id, label: role.label, hint: role.hint, readOnly: role.readOnly,
    scopeMode: role.scopeMode, formIds: role.formIds, landing: role.landing, order: role.order,
  })));
});

app.get("/api/users", requirePermission(11), async (req: Request, res: Response) => {
  const usersList = (await Repository.getUsers()).filter(user => !user.IsDeleted);
  /**
   * A password is never sent to a browser, not even an administrator's.
   *
   * The legacy SystemUser/Index screen printed the password in a column, and
   * this endpoint reproduced it faithfully by decrypting the vault on every
   * read. Faithful, and wrong: it meant one borrowed admin session — or one
   * screenshot in a meeting, or one browser cache on a shared machine — was
   * every credential in the university at once.
   *
   * What an administrator actually needs from this screen is whether a password
   * exists, so an account that was never given one can be spotted. That single
   * fact is what leaves the building now; setting a new password still works
   * exactly as before, because setting one never required reading the old one.
   */
  const users = usersList.map(user => ({
    ...safeSystemUser(user),
    HasPassword: Boolean(String(user.SystemUserPass || "").trim())
  }));
  res.json(users);
});

app.post("/api/users", requirePermission(11), async (req: Request, res: Response) => {
  const { Name, SystemUserLogin, password, IsAdminUser, IsActive, IsLocked, AdInstructorId, Role, collegeIds, assigns } = req.body;
  if (Role !== undefined && Role !== null && Role !== "" && !isAcademicRole(Role)) {
    res.status(400).json({ error: "الصفة المختارة غير معروفة" });
    return;
  }
  if (!Name || !SystemUserLogin || !password) {
    res.status(400).json({ error: "الرجاء إدخال الحقول المطلوبة بالأحمر" });
    return;
  }
  const exists = await Repository.getUserByLogin(SystemUserLogin);
  if (exists) {
    res.status(400).json({ error: "اسم المستخدم مسجل مسبقاً" });
    return;
  }
  const newUser = await Repository.createUser({
    Name,
    SystemUserLogin,
    SystemUserPass: Repository.hashPassword(password),
    SystemUserPassVault: Repository.encryptPasswordForVault(password),
    IsAdminUser: !!IsAdminUser,
    IsActive: IsActive !== undefined ? !!IsActive : true,
    IsLocked: !!IsLocked,
    IsDeleted: false,
    AdInstructorId: Number(AdInstructorId) || 0,
    Role: isAcademicRole(Role) ? Role : DEFAULT_MIGRATION_ROLE
  });
  /* A new department used to start with nothing at all: an account that logs in
     to an empty rail and waits for somebody to remember to tick a box. Form 7
     is the whole operational baseline — the schedule workspace and مركز الذكاء
     — and every route a scheduler needs accepts it. So it is granted on
     creation, and the account works the first time it signs in. Anything beyond
     it is still a deliberate decision on the permissions screen. */
  /* الصفة تحمل قالبها: شاشاتها ونطاقها يُكتبان في اللحظة نفسها، فيعمل الحساب
     من أول دخول. والمستخدم العادي وحده يبقى على الأساس القديم — مركز الذكاء —
     حتى لا يتغيّر ما كان يحدث قبل هذه الإضافة. */
  /**
   * ── صفةٌ اختِيرت تحمل قالبها، وصفةٌ لم تُذكر لا تفرضه ────────────────────
   *
   * من اختار الصفة في الشاشة طلب قالبها: شاشاتُه ونطاقُه يُكتبان في العملية
   * نفسها، وهو المقصود — ألّا يُعيَّن الحسابُ شاشةً شاشة.
   *
   * ومن أنشأ حساباً من خارج الشاشة ولم يذكر صفةً فهو على العقد القديم: شاشةٌ
   * واحدة هي مركز الذكاء، وما بعدها قرارٌ صريحٌ من شاشة الصلاحيات. وفرضُ
   * القالب عليه كان سيمنحه سبع شاشاتٍ لم يطلبها أحد، بصمت، في كل حسابٍ
   * يُنشأ بنداءٍ برمجي.
   *
   * والصفة تُخزَّن في الحالين — فالحارس يحتاجها ليعرف أيكتب صاحبُها أم يقرأ —
   * وإنما يختلف ما يُكتب معها.
   */
  const createdRole: AcademicRole = isAcademicRole(Role) ? Role : DEFAULT_MIGRATION_ROLE;
  if (isAcademicRole(Role)) {
    await applyRoleTemplate(newUser.SystemUserId, createdRole, { collegeIds, assigns: Array.isArray(assigns) ? sanitizeAssigns(assigns) : undefined });
  } else {
    await Repository.createSecurity(newUser.SystemUserId, DECISION_CENTRE_FORM_ID);
    if (Array.isArray(assigns)) await Repository.saveUserAssigns(newUser.SystemUserId, sanitizeAssigns(assigns));
  }
  res.locals.auditChanges = `حساب جديد بصفة «${roleLabel(createdRole)}»`;
  res.status(201).json({ ...safeSystemUser(newUser), HasPassword: true });
});

/**
 * ── مركز الذكاء لكل الأقسام ─────────────────────────────────────────────────
 *
 * The screen has existed for a while; the permission behind it did not travel
 * with it. Departments created before it — and any account an administrator set
 * up field by field — can be missing form 7 entirely, so the rail simply never
 * shows مركز الذكاء and nobody can tell whether the feature is absent or the
 * permission is.
 *
 * This grants it to every account that should have it, once. It is idempotent
 * by construction: an account that already holds the permission is counted and
 * skipped, never duplicated. It touches nothing else — no other form id, no
 * account that is deleted or deactivated — and it reports exactly what it did.
 */
app.post("/api/users/grant-decision-centre", requirePermission(11), requirePowerAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  const users = (await Repository.getUsers()).filter(user => !user.IsDeleted && user.IsActive !== false);
  let granted = 0, alreadyHad = 0;
  const names: string[] = [];
  for (const user of users) {
    const held = (await Repository.getSecurityByUser(user.SystemUserId)).map(row => Number(row.FormNameId));
    if (held.includes(DECISION_CENTRE_FORM_ID)) { alreadyHad += 1; continue; }
    await Repository.createSecurity(user.SystemUserId, DECISION_CENTRE_FORM_ID);
    granted += 1;
    if (names.length < 40) names.push(user.Name || user.SystemUserLogin || `#${user.SystemUserId}`);
  }
  res.locals.auditChanges = `منح مركز الذكاء: حسابات جديدة ${granted}، وحسابات كانت لديها الصلاحية ${alreadyHad}`;
  res.json({ granted, alreadyHad, total: users.length, names });
});

app.get("/api/users/department-heads/preview", requirePermission(11), requirePowerAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  res.json({ rows: await departmentHeadPlan() });
});

app.post("/api/users/department-heads", requirePermission(11), requirePowerAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  const rows = await departmentHeadPlan();
  const created: Array<{ login: string; sectionName: string; collegeName: string }> = [];
  for (const row of rows) {
    if (row.status !== "create") continue;
    /* فحصٌ أخير قبل الكتابة: طلبان متزامنان لا يُنشئان الاسم مرتين. */
    if (await Repository.getUserByLogin(row.proposedLogin)) continue;
    const user = await Repository.createUser({
      Name: row.proposedName,
      SystemUserLogin: row.proposedLogin,
      SystemUserPass: "",
      IsAdminUser: false,
      IsActive: false,
      IsLocked: false,
      IsDeleted: false,
      AdInstructorId: 0,
      Role: DEPARTMENT_HEAD_ROLE,
    } as any);
    await applyRoleTemplate(user.SystemUserId, DEPARTMENT_HEAD_ROLE as AcademicRole, { assigns: [{ AdCollegeId: row.collegeId, AdSectionId: row.sectionId }] });
    created.push({ login: row.proposedLogin, sectionName: row.sectionName, collegeName: row.collegeName });
  }
  res.locals.auditChanges = `حسابات رؤساء الأقسام: أُنشئ ${countOf(created.length, AR.account)} (موقوفة وبلا كلمة سر)`;
  res.json({ created, skipped: rows.length - created.length, rows: await departmentHeadPlan() });
});

app.get("/api/users/advisors/preview", requirePermission(11), requirePowerAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  res.json({ rows: await advisorPlan() });
});

app.post("/api/users/advisors", requirePermission(11), requirePowerAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  const rows = await advisorPlan();
  const created: Array<{ login: string; sectionName: string; collegeName: string }> = [];
  for (const row of rows) {
    if (row.status !== "create") continue;
    /* فحصٌ أخير قبل الكتابة: طلبان متزامنان لا يُنشئان الاسم مرتين. */
    if (await Repository.getUserByLogin(row.proposedLogin)) continue;
    const user = await Repository.createUser({
      Name: row.proposedName,
      SystemUserLogin: row.proposedLogin,
      SystemUserPass: "",
      IsAdminUser: false,
      IsActive: false,
      IsLocked: false,
      IsDeleted: false,
      AdInstructorId: 0,
      Role: ADVISOR_ROLE,
    } as any);
    await applyRoleTemplate(user.SystemUserId, ADVISOR_ROLE as AcademicRole, { assigns: row.scopeAssignments || [{ AdCollegeId: row.collegeId, AdSectionId: row.sectionId }] });
    created.push({ login: row.proposedLogin, sectionName: row.sectionName, collegeName: row.collegeName });
  }
  res.locals.auditChanges = `حسابات المرشدين: أُنشئ ${countOf(created.length, AR.account)} (موقوفة وبلا كلمة سر)`;
  res.json({ created, skipped: rows.length - created.length, rows: await advisorPlan() });
});

/**
 * توحيد حسابات الإرشاد القديمة المكررة للقسم نفسه عبر الكليات المتناظرة.
 * لا يُمسّ إلا الحساب غير النشط، الخالي من كلمة السر، الذي لا يملك نطاقاً
 * خارج القسم. تُبقى هوية واحدة، وتُنقل إليها نطاقات القسم، وتُحفظ الحسابات
 * الزائدة كحسابات محذوفة منطقياً مع سحب شاشاتها ونطاقاتها.
 */
app.post("/api/users/advisors/consolidate", requirePermission(11), requireRootAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  const [rows, users, assigns] = await Promise.all([advisorPlan(), Repository.getUsers(), Repository.getCollegeUserAssigns()]);
  const byId = new Map(users.map(user => [Number(user.SystemUserId), user]));
  const consolidated: Array<{ login: string; removedIds: number[]; sectionName: string }> = [];
  const skipped: Array<{ sectionName: string; reason: string }> = [];
  for (const row of rows.filter(item => item.status === "review" && item.duplicateUserIds && item.duplicateUserIds.length > 1)) {
    if (!row.consolidationReady || !row.existingUserId) {
      skipped.push({ sectionName: row.sectionName, reason: row.note || "الحسابات تحتاج مراجعة يدوية" });
      continue;
    }
    const ids = row.duplicateUserIds!;
    const canonical = byId.get(Number(row.existingUserId));
    const duplicates = ids.map(id => byId.get(Number(id)));
    const targetKeys = new Set((row.scopeAssignments || []).map(scope => `${scope.AdCollegeId}:${scope.AdSectionId}`));
    const safe = canonical && duplicates.every(user => user && user.Role === ADVISOR_ROLE && !user.IsActive && !String(user.SystemUserPass || "").trim() && !String(user.SystemUserPassVault || "").trim())
      && duplicates.every(user => assigns.filter(scope => Number(scope.SystemUserId) === Number(user!.SystemUserId)).every(scope => targetKeys.has(`${Number(scope.AdCollegeId)}:${Number(scope.AdSectionId)}`)));
    const loginOwner = await Repository.getUserByLogin(row.proposedLogin);
    if (!safe || (loginOwner && !ids.includes(Number(loginOwner.SystemUserId)))) {
      skipped.push({ sectionName: row.sectionName, reason: "تغيّرت حالة الحساب أو نطاقه منذ المعاينة؛ أُوقف التوحيد الآمن" });
      continue;
    }
    const primary = canonical!;
    await Repository.updateUser(Number(primary.SystemUserId), {
      Name: row.proposedName,
      SystemUserLogin: row.proposedLogin,
      IsActive: false,
      IsDeleted: false,
      Role: ADVISOR_ROLE as any,
    });
    await applyRoleTemplate(Number(primary.SystemUserId), ADVISOR_ROLE as AcademicRole, { assigns: row.scopeAssignments || [] });
    const removedIds = ids.filter(id => Number(id) !== Number(primary.SystemUserId));
    for (const id of removedIds) {
      await Repository.saveSecurityByUser(Number(id), []);
      await Repository.saveUserAssigns(Number(id), []);
      await Repository.updateUser(Number(id), { IsActive: false, IsLocked: true, IsDeleted: true, Role: "standard" as any });
    }
    consolidated.push({ login: row.proposedLogin, removedIds, sectionName: row.sectionName });
  }
  res.locals.auditChanges = `توحيد حسابات المرشدين: الأقسام ${consolidated.length}، الحسابات الزائدة المسحوبة ${consolidated.reduce((sum, item) => sum + item.removedIds.length, 0)}`;
  res.json({ consolidated, skipped, rows: await advisorPlan() });
});

app.put("/api/users/:id", requirePermission(11), async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { Name, SystemUserLogin, password, IsAdminUser, IsActive, IsLocked, AdInstructorId, Role, collegeIds, assigns } = req.body;
  if (!Name || !SystemUserLogin) {
    res.status(400).json({ error: "جميع الحقول الأساسية مطلوبة" });
    return;
  }
  if (Role !== undefined && Role !== null && Role !== "" && !isAcademicRole(Role)) {
    res.status(400).json({ error: "الصفة المختارة غير معروفة" });
    return;
  }

  const exists = await Repository.getUserByLogin(SystemUserLogin);
  if (exists && exists.SystemUserId !== id) {
    res.status(400).json({ error: "اسم المستخدم مسجل مسبقاً" });
    return;
  }

  const fields: Partial<typeof exists> = {
    Name,
    SystemUserLogin,
    IsAdminUser: !!IsAdminUser,
    IsActive: !!IsActive,
    IsLocked: !!IsLocked,
    AdInstructorId: Number(AdInstructorId) || 0
  };
  if (isAcademicRole(Role)) (fields as any).Role = Role;

  if (password && password.trim() !== "") {
    fields.SystemUserPass = Repository.hashPassword(password);
    fields.SystemUserPassVault = Repository.encryptPasswordForVault(password);
  }

  const before = await Repository.getUserById(id);
  try {
    const updated = await Repository.updateUser(id, fields);
    /**
     * ── القالب يُكتب عند تغيير الصفة، لا عند كل حفظ ───────────────────────
     *
     * القالب يُعيد كتابة شاشات الحساب ونطاقه كاملين. وهذا صوابٌ حين تتغيّر
     * الصفة — فالصفة هي القرار، والشاشات أثرٌ لها، ولا يجوز أن يبقى للعميد
     * السابق بابُ تعديلٍ من صفةٍ قديمة.
     *
     * وهو تخريبٌ حين لا تتغيّر. كل الحسابات القائمة رُحّلت إلى «رئيس لجنة»،
     * وشاشةُ المستخدمين تُرسل الصفة في كل حفظ — فإيقافُ حسابٍ أو تغييرُ كلمة
     * سرّه كان سيمحو كل شاشةٍ مُنحت له يدوياً خارج قالب صفته، بصمت، ودون أن
     * يطلب أحدٌ ذلك.
     */
    /* المقارنة على الصفة المحلولة لا على القيمة المخزّنة: حسابٌ بلا صفةٍ
       يُقرأ «رئيس لجنة» في كل موضعٍ من هذا النظام، فحفظُه بهذه الصفة نفسها
       ليس تغييراً. وقراءةُ القيمة الخام كانت تجعله تغييراً فتُعاد كتابة
       القالب، فتُمحى شاشاتُه الممنوحة يدوياً — وهو بابٌ يُفتح كلّما تعذّر
       ترحيلُ حسابٍ عند الإقلاع. */
    const previousRole = roleDefinition((before as any)?.Role).id;
    const roleChanged = isAcademicRole(Role) && Role !== previousRole;
    if (roleChanged) {
      /* ── الصفة التي تزول لا يبقى لها أثرٌ يعمل ─────────────────────────────
       *
       * هنا كان بابان مفتوحان، وكلاهما من الشكل نفسه: صفةٌ نُزع عنها اسمُها
       * وبقيت قدرتُها.
       *
       * الأول أن النزول إلى «مستخدم عادي» كان لا يفعل شيئاً البتّة — لا
       * الشاشات تُعاد كتابتها ولا النطاق يُنظَّف — وهو أشيعُ ما يُفعل حين
       * يُراد تجريد حسابٍ من صلاحياته. فكان الفعلُ المقصودُ لذلك هو الفعلَ
       * الوحيد الذي لا يفعله.
       *
       * والثاني أن التنظيف كان يعرف صفاتِ الكلية الواحدة ولا يعرف صفاتِ كل
       * الكليات. وصفوفُ هذه الأخيرة صفٌّ لكل كليةٍ في الجامعة — فالنزول عنها
       * كان يُبقي لصاحبها باباً على مستوى الجامعة كلها، لا كليةٍ واحدة.
       *
       * فصار التنظيف يسبق كل تغيير صفة، ويقيس بما يبقى للصفة الجديدة من حاجة:
       * صفوفُ «الكلية كلها» تُمحى إلا إن كانت الصفةُ الجديدة تحتاجها، وما عداها
       * يبقى. وصار القالب يُكتب لكل صفةٍ بما فيها «مستخدم عادي» — فلها قالبٌ
       * معرَّف أيضاً، وإن كان أضيقَ القوالب.
       */
      const previousWide = roleDefinition(previousRole).scopeMode;
      const nextWide = roleDefinition(Role).scopeMode;
      /**
       * صفوفُ «الكلية كلها» تُشتقّ من الصفة، فهي جوابُها لا ملكُ الحساب.
       *
       * وكان الشرط يعدّ «كليةً واحدة» و«كلَّ الكليات» شيئاً واحداً، فيُبقي
       * صفوفَهما عند الانتقال بينهما. وهما ليسا واحداً: الثانية صفٌّ لكل كليةٍ
       * في الجامعة. فرئيسُ تسجيلٍ يُنزَّل عميداً لكليةٍ واحدة كان يحتفظ
       * بالجامعة كلها — وهو نفسُ البابِ الذي أُغلق في الأضيق وبقي في الأوسع.
       *
       * فالقاعدة: تبدّلُ نوعِ الاشتقاق يُسقط ما اشتُقّ. وبقاؤه على حاله يُبقيه
       * — فالعميد يصير مساعداً دون أن يفقد كليته، ولو لم يُذكر في الحفظ.
       */
      const derivesWideRows = (mode: string) => mode === "college" || mode === "allColleges";
      if (derivesWideRows(previousWide) && previousWide !== nextWide) {
        const stale = await Repository.getUserAssigns(id);
        const kept = stale.filter(row => Number(row.AdSectionId) > 0);
        if (kept.length !== stale.length) {
          await Repository.saveUserAssigns(id, kept.map(row => ({ AdCollegeId: Number(row.AdCollegeId), AdSectionId: Number(row.AdSectionId) })));
        }
      }
      await applyRoleTemplate(id, Role, { collegeIds, assigns: Array.isArray(assigns) ? sanitizeAssigns(assigns) : undefined });
      res.locals.auditChanges = `الصفة: «${roleLabel(previousRole)}» ← «${roleLabel(Role)}»`;
    } else if (isAcademicRole(Role) && roleDefinition(Role).scopeMode === "college" && Array.isArray(collegeIds)) {
      /* الصفة كما هي وتغيّرت كلياتُها: يُكتب النطاق وحده، ولا تُمسّ الشاشات. */
      await applyRoleScopeOnly(id, Role, collegeIds);
    } else if (Array.isArray(assigns)) {
      await Repository.saveUserAssigns(id, sanitizeAssigns(assigns));
    }
    res.json({ ...safeSystemUser(updated), HasPassword: Boolean(String(updated.SystemUserPass || "").trim()) });
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

app.delete("/api/users/:id", requirePermission(11), async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  await Repository.deleteUser(id);
  res.json({ success: true });
});

// --- USER PERMISSIONS (FormSecurity) API ---

app.get("/api/permissions/forms", requirePermission(12), async (_req: Request, res: Response) => {
  res.json(await Repository.getFormNames());
});

app.get("/api/permissions", requirePermission(12), async (_req: Request, res: Response) => {
  res.json(await Repository.getFormSecurity());
});

app.post("/api/permissions", requirePermission(12), async (req: Request, res: Response) => {
  const userId = Number(req.body.SystemUserId);
  const formId = Number(req.body.FormNameId);
  if (!userId || !formId) { res.status(400).json({ error: "الرجاء إدخال الحقول المطلوبة بالأحمر" }); return; }
  // Legacy FormSecurity has a row Id and no unique constraint on user/form. Preserve that CRUD model.
  const row = await Repository.createSecurity(userId, formId);
  res.status(201).json(row);
});

app.put("/api/permissions/:id", requirePermission(12), async (req: Request, res: Response) => {
  const legacyId = Number(req.params.id), userId = Number(req.body.SystemUserId), formId = Number(req.body.FormNameId);
  if (!legacyId || !userId || !formId) { res.status(400).json({ error: "الرجاء إدخال الحقول المطلوبة بالأحمر" }); return; }
  try { res.json(await Repository.updateSecurity(legacyId, userId, formId)); }
  catch (e:any) { res.status(404).json({ error:e.message }); }
});

app.delete("/api/permissions/:id", requirePermission(12), async (req: Request, res: Response) => {
  const legacyId = Number(req.params.id);
  if (!legacyId) { res.status(400).json({ error: "الصلاحية غير موجودة" }); return; }
  await Repository.deleteSecurity(legacyId);
  res.json({ success: true });
});

// --- USER COLLEGE & SECTION ASSIGN (AdCollegeUserAssign) API ---

/* قراءة النطاقات تلزم شاشةَ المستخدمين كما تلزم شاشةَ النطاقات: نموذجُ تعديل
   العميد يُملأ منها، ومن يملك إدارة الحسابات يحتاج أن يرى نطاق الحساب الذي
   يعدّله. والكتابة تبقى على صلاحية النطاقات وحدها. */
app.get("/api/user-scopes", requireAnyPermission([11, 15]), async (_req: Request, res: Response) => {
  res.json(await Repository.getCollegeUserAssigns());
});

app.post("/api/user-scopes", requirePermission(15), async (req: Request, res: Response) => {
  const userId = Number(req.body.SystemUserId), collegeId = Number(req.body.AdCollegeId), sectionId = Number(req.body.AdSectionId);
  if (!userId || !collegeId || !sectionId) { res.status(400).json({ error: "الرجاء إدخال الحقول المطلوبة بالأحمر" }); return; }
  const section = await Repository.getSectionById(sectionId);
  if (!section || section.AdCollegeId !== collegeId) { res.status(400).json({ error: "القسم العلمي المختار لا يتبع الكلية المختارة" }); return; }
  // Duplicated scope rows exist in the real legacy DB, therefore creation must not silently de-duplicate.
  res.status(201).json(await Repository.createUserAssign(userId, collegeId, sectionId));
});

app.put("/api/user-scopes/:id", requirePermission(15), async (req: Request, res: Response) => {
  const legacyId=Number(req.params.id), userId=Number(req.body.SystemUserId), collegeId=Number(req.body.AdCollegeId), sectionId=Number(req.body.AdSectionId);
  if(!legacyId||!userId||!collegeId||!sectionId){res.status(400).json({error:"الرجاء إدخال الحقول المطلوبة بالأحمر"});return;}
  const section=await Repository.getSectionById(sectionId);
  if(!section||section.AdCollegeId!==collegeId){res.status(400).json({error:"القسم العلمي المختار لا يتبع الكلية المختارة"});return;}
  try{res.json(await Repository.updateUserAssign(legacyId,userId,collegeId,sectionId));}
  catch(e:any){res.status(404).json({error:e.message});}
});

app.delete("/api/user-scopes/:id", requirePermission(15), async (req: Request, res: Response) => {
  const legacyId=Number(req.params.id);
  if(!legacyId){res.status(400).json({error:"صلاحية الكلية والقسم العلمي غير موجودة"});return;}
  await Repository.deleteUserAssign(legacyId);
  res.json({ success: true });
});
}
