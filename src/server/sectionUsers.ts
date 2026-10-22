/**
 * حسابات القسم الجديد: يُنشأ القسم من الصحيفة فتُنشأ معه صفاتُه الثلاث (رئيس القسم، رئيس الجدول، المرشد)
 * فعّالةً بكلمة السر الافتراضية الموحّدة، مقيَّدةً بكليته وقسمه.
 *
 * العميد والعميد المساعد وموظفو التسجيل نطاقهم الكلية كلها (قسم صفر)، والمدير يرى كل شيء؛ فيشمل نطاقُهم
 * القسمَ الجديد بلا ربطٍ إضافي. لا يُلمس حسابٌ موجود، والإعادة لا تكرّر شيئاً.
 */
import { ACADEMIC_ROLES, roleDefinition } from "../utils/academicRoles";
import { englishPrefixOf } from "../utils/englishPrefix";

export const DEFAULT_SECTION_PASSWORD = "12345678";

/** صفات القسم ولاحقة اسم الدخول لكلٍّ منها. */
export const SECTION_ACCOUNT_ROLES: Array<{ id: string; suffix: string }> = [
  { id: "departmentHead", suffix: "head" },
  { id: "committeeChair", suffix: "dept" },
  { id: "advisor", suffix: "advisor" },
];

export interface SectionAccountResult { login: string; role: string; label: string; status: "created" | "exists" | "completed" }

/** بادئة القسم الإنجليزية من اسمه (Frenchdept/Frenchhead/Frenchadvisor)، وإلا رمز الكلية والقسم. */
const loginBase = (college: { AdCollegeId: number; AdCollegeCode: string }, section: { AdSectionCode: string; AdSectionName?: string }) => {
  const english = englishPrefixOf(String(section.AdSectionName || ""));
  if (english) return english;
  const code = String(college.AdCollegeCode || "").replace(/[^A-Za-z0-9]/g, "").toLowerCase() || `c${college.AdCollegeId}`;
  return `${code}${String(section.AdSectionCode || "").replace(/[^A-Za-z0-9]/g, "").toLowerCase()}`;
};
const collegeTag = (college: { AdCollegeId: number; AdCollegeCode: string }) => String(college.AdCollegeCode || "").replace(/[^A-Za-z0-9]/g, "") || `c${college.AdCollegeId}`;
export async function provisionSectionUsers(Repository: any, college: { AdCollegeId: number; AdCollegeCode: string; AdCollegeName: string }, section: { AdSectionId: number; AdSectionCode: string; AdSectionName: string }, password = DEFAULT_SECTION_PASSWORD, only?: string[]): Promise<SectionAccountResult[]> {
  const collegeId = Number(college.AdCollegeId), sectionId = Number(section.AdSectionId);
  const users = ((await Repository.getUsers()) as any[]).filter(row => !row.IsDeleted);
  const byLogin = new Map(users.map(row => [String(row.SystemUserLogin).toLowerCase(), row]));
  const out: SectionAccountResult[] = [];
  for (const { id, suffix } of SECTION_ACCOUNT_ROLES) {
    if (only && !only.includes(id)) continue;
    const role = ACADEMIC_ROLES.find(item => item.id === id) || roleDefinition(id);
    /* رمز الكلية قد يتكرر بين كليتين (بنين/بنات، أو فرع)، فإن كان الاسم لحسابِ قسمٍ آخر أُضيف رقم الكلية ليبقى لكل قسم حسابه. */
    /* الاسم لحسابِ قسمٍ آخر: يُلحق رمز الكلية، ثم رقمها إن تكرر الرمز نفسه. */
    const base = loginBase(college, section);
    let login = "", found: any;
    for (const candidate of [`${base}${suffix}`, `${base}${collegeTag(college)}${suffix}`, `${base}${collegeTag(college)}c${collegeId}${suffix}`]) {
      login = candidate; found = byLogin.get(candidate.toLowerCase());
      if (!found) break;
      const owns = (await Repository.getUserAssigns(Number(found.SystemUserId))) as any[];
      if (!owns.length || owns.some(row => Number(row.AdCollegeId) === collegeId && Number(row.AdSectionId) === sectionId)) break;
    }
    if (found) {
      /* أُنشئ في محاولةٍ انقطعت قبل الصلاحيات أو النطاق: يُكمل الناقص فقط، ولا تُمسّ كلمة سره ولا حالته. */
      const userId = Number(found.SystemUserId);
      let filled = false;
      if (!(await Repository.getSecurityByUser(userId)).length) { await Repository.saveSecurityByUser(userId, role.formIds); filled = true; }
      if (!(await Repository.getUserAssigns(userId)).length) { await Repository.saveUserAssigns(userId, [{ AdCollegeId: collegeId, AdSectionId: sectionId }]); filled = true; }
      out.push({ login, role: id, label: role.label, status: filled ? "completed" : "exists" });
      continue;
    }
    const user = await Repository.createUser({
      Name: `${role.label} — ${section.AdSectionName}`, SystemUserLogin: login,
      SystemUserPass: Repository.hashPassword(password), SystemUserPassVault: Repository.encryptPasswordForVault(password),
      IsAdminUser: false, IsActive: true, IsLocked: false, IsDeleted: false, AdInstructorId: 0, Role: id,
    });
    await Repository.saveSecurityByUser(user.SystemUserId, role.formIds);
    await Repository.saveUserAssigns(user.SystemUserId, [{ AdCollegeId: collegeId, AdSectionId: sectionId }]);
    out.push({ login, role: id, label: role.label, status: "created" });
  }
  return out;
}

/** صفات الكلية: العميد والعميد المساعد نطاقهما الكلية. عميد التسجيل ورئيسه نطاقهما كل الكليات بما يُضاف لاحقاً فيشملان الجديدة بلا ربط. */
export const COLLEGE_ACCOUNT_ROLES: Array<{ id: string; suffix: string }> = [
  { id: "dean", suffix: "dean" },
  { id: "viceDean", suffix: "vicedean" },
];

export async function provisionCollegeUsers(Repository: any, college: { AdCollegeId: number; AdCollegeCode: string; AdCollegeName: string }, password = DEFAULT_SECTION_PASSWORD): Promise<SectionAccountResult[]> {
  const collegeId = Number(college.AdCollegeId);
  const users = ((await Repository.getUsers()) as any[]).filter(row => !row.IsDeleted);
  const byLogin = new Map(users.map(row => [String(row.SystemUserLogin).toLowerCase(), row]));
  const tag = String(college.AdCollegeCode || "").replace(/[^A-Za-z0-9]/g, "").toLowerCase() || `c${collegeId}`;
  const out: SectionAccountResult[] = [];
  for (const { id, suffix } of COLLEGE_ACCOUNT_ROLES) {
    const role = ACADEMIC_ROLES.find(item => item.id === id) || roleDefinition(id);
    let login = `${tag}${suffix}`;
    let found = byLogin.get(login.toLowerCase());
    if (found) {
      const owns = (await Repository.getUserAssigns(Number(found.SystemUserId))) as any[];
      if (owns.length && !owns.some(row => Number(row.AdCollegeId) === collegeId && Number(row.AdSectionId) === 0)) {
        login = `${tag}c${collegeId}${suffix}`;
        found = byLogin.get(login.toLowerCase());
      }
    }
    if (found) { out.push({ login, role: id, label: role.label, status: "exists" }); continue; }
    const user = await Repository.createUser({
      Name: `${role.label} — ${college.AdCollegeName}`, SystemUserLogin: login,
      SystemUserPass: Repository.hashPassword(password), SystemUserPassVault: Repository.encryptPasswordForVault(password),
      IsAdminUser: false, IsActive: true, IsLocked: false, IsDeleted: false, AdInstructorId: 0, Role: id,
    });
    await Repository.saveSecurityByUser(user.SystemUserId, role.formIds);
    await Repository.saveUserAssigns(user.SystemUserId, [{ AdCollegeId: collegeId, AdSectionId: 0 }]);
    out.push({ login, role: id, label: role.label, status: "created" });
  }
  return out;
}

/**
 * معاينة حسابات الأقسام الموجودة: لكل قسمٍ له صحيفة، أيُّ صفاته الثلاث (رئيس قسم · رئيس جدول · مرشد) ليس له حسابٌ
 * بهذه الصفة مقيَّدٌ بكليته وقسمه. قراءةٌ فحسب؛ والإنشاء بعدها يطابق ما عُرض ولا يمسّ حساباً موجوداً.
 */
export interface SectionAccountsPlanRow {
  sectionId: number; collegeId: number; college: string; section: string;
  existing: Array<{ role: string; label: string; login: string }>;
  missing: Array<{ role: string; label: string; login: string }>;
}
export async function planSectionAccounts(Repository: any): Promise<SectionAccountsPlanRow[]> {
  const [sections, colleges, users] = await Promise.all([Repository.getSections(), Repository.getColleges(), Repository.getUsers()]);
  const collegeById = new Map((colleges as any[]).map(row => [Number(row.AdCollegeId), row]));
  const live = (users as any[]).filter(row => !row.IsDeleted);
  const owners = new Map<string, Array<{ role: string; login: string }>>();
  for (const user of live) {
    if (!SECTION_ACCOUNT_ROLES.some(item => item.id === user.Role)) continue;
    for (const assign of (await Repository.getUserAssigns(Number(user.SystemUserId))) as any[]) {
      const key = `${Number(assign.AdCollegeId)}:${Number(assign.AdSectionId)}`;
      owners.set(key, [...(owners.get(key) || []), { role: user.Role, login: String(user.SystemUserLogin) }]);
    }
  }
  const taken = new Set(live.map(row => String(row.SystemUserLogin).toLowerCase()));
  const rows: SectionAccountsPlanRow[] = [];
  for (const section of sections as any[]) {
    const plans = ((await Repository.getCurriculumPlans(Number(section.AdSectionId))) as any[]).filter(plan => !plan.virtual);
    if (!plans.length) continue;
    const college = collegeById.get(Number(section.AdCollegeId));
    if (!college) continue;
    const have = owners.get(`${Number(section.AdCollegeId)}:${Number(section.AdSectionId)}`) || [];
    const row: SectionAccountsPlanRow = { sectionId: Number(section.AdSectionId), collegeId: Number(section.AdCollegeId), college: String(college.AdCollegeName || ""), section: String(section.AdSectionName || ""), existing: [], missing: [] };
    const base = loginBase(college, section);
    for (const { id, suffix } of SECTION_ACCOUNT_ROLES) {
      const label = (ACADEMIC_ROLES.find(item => item.id === id) || roleDefinition(id)).label;
      const found = have.find(item => item.role === id);
      if (found) { row.existing.push({ role: id, label, login: found.login }); continue; }
      /* الاسم المقترح هو ما سيُنشأ فعلاً: بالبادئة الإنجليزية، ثم رمز الكلية فرقمها عند التصادم مع حسابِ قسمٍ آخر. */
      const login = [`${base}${suffix}`, `${base}${collegeTag(college)}${suffix}`, `${base}${collegeTag(college)}c${row.collegeId}${suffix}`].find(candidate => !taken.has(candidate.toLowerCase())) || `${base}${suffix}`;
      row.missing.push({ role: id, label, login });
    }
    if (row.missing.length) rows.push(row);
  }
  return rows.sort((a, b) => a.college.localeCompare(b.college, "ar") || a.section.localeCompare(b.section, "ar"));
}
