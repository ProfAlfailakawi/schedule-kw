/**
 * ── تدقيق صفات البيئة التجريبية ─────────────────────────────────────────────
 *
 * سأل العميدُ أن يجرّب النظامَ بصفةِ كل مستخدم كما تُجرَّب في ميزان: يبدّل الصفة
 * من شريط الديمو فيرى شاشةَ العميد أو التسجيل أو رئيس القسم بنطاقها. وهذه
 * الميزة تعمل فقط إن حُقن الصندوقُ بحسابٍ لكل صفة، بنطاقٍ وصلاحياتٍ صحيحين،
 * وببياناتِ دورةٍ عاشت لا صندوقٍ فارغ.
 *
 * وما يحرسه هذا الملفّ:
 *   ١) حسابٌ لكل صفة، بصلاحياتها ونطاقها المشتقّين من التعريف نفسه.
 *   ٢) دورةُ اعتمادٍ مبذورة: إرسالٌ وإرجاعٌ وقبول، بأساسٍ للمقارنة وملاحظات.
 *   ٣) الملاحظاتُ المفتوحة مفتوحةٌ فعلاً — قيمتُها تطابق الصفّ الحيّ.
 *   ٤) الخادمُ يبدّل الصفة، ويكشف قائمتها، والحارس يسمح بالمسار.
 */

import fs from "fs";
import path from "path";
import { createDemoSandboxState, DEMO_ROLE_ACCOUNTS, DEMO_SWITCH_ACCOUNTS } from "../src/db/demoSandbox";
import { ACADEMIC_ROLES, roleDefinition, isViewerOnlyRole } from "../src/utils/academicRoles";
import { isApprovalWritePath, roleWriteDecision } from "../src/server/roleGuard";
import { readServerSource } from "./helpers/serverSource.mjs";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const state = createDemoSandboxState();
const userById = new Map(state.users.map(u => [u.SystemUserId, u]));
const securityByUser = (id: number) => state.formSecurity.filter(s => s.SystemUserId === id).map(s => s.FormNameId).sort((a, b) => a - b);
const assignsByUser = (id: number) => state.collegeUserAssign.filter(a => a.SystemUserId === id);

/* ── ١) حسابٌ لكل صفة ───────────────────────────────────────────────────── */

check(DEMO_ROLE_ACCOUNTS.length === ACADEMIC_ROLES.length,
  `شريط الديمو يعرض الصفات كلها: ${DEMO_ROLE_ACCOUNTS.length} من ${ACADEMIC_ROLES.length}`);

for (const account of DEMO_ROLE_ACCOUNTS) {
  const user = userById.get(account.SystemUserId);
  check(Boolean(user), `«${account.label}» له حسابٌ في الصندوق`);
  check(!!user && String((user as any).Role) === account.role, `«${account.label}» يحمل صفتَه`);
  check(!!user && user.IsActive && !user.IsDeleted && !user.IsLocked, `«${account.label}» حسابٌ فعّال`);
  // الصلاحيات من القالب نفسه الذي يحكم الحساب الحقيقي.
  const expected = [...roleDefinition(account.role).formIds].sort((a, b) => a - b);
  check(JSON.stringify(securityByUser(account.SystemUserId)) === JSON.stringify(expected),
    `«${account.label}» شاشاتُه من قالب الصفة، لا أكثر`);
}

// المدير (الجذر) موجودٌ ويملك كل الشاشات — وهو مدخل البيئة.
const admin = userById.get(1);
check(!!admin && admin.IsAdminUser === true, "حساب المدير الجذر موجودٌ ومسؤول");
check(securityByUser(1).length === state.formNames.length, "المدير يملك كل الشاشات");

/* ── ٢) النطاق يُشتقّ من scopeMode ──────────────────────────────────────── */

const dean = DEMO_ROLE_ACCOUNTS.find(a => a.role === "dean")!;
check(assignsByUser(dean.SystemUserId).every(a => a.AdSectionId === 0) && assignsByUser(dean.SystemUserId).length >= 1,
  "العميد على كليةٍ كاملة، بلا قسمٍ قسم");

const head = DEMO_ROLE_ACCOUNTS.find(a => a.role === "registrarHead")!;
check(assignsByUser(head.SystemUserId).length === state.colleges.length,
  "رئيس التسجيل على كل الكليات");

const dept = DEMO_ROLE_ACCOUNTS.find(a => a.role === "departmentHead")!;
check(assignsByUser(dept.SystemUserId).some(a => a.AdSectionId > 0),
  "رئيس القسم على قسمٍ بعينه");

// موظّف التسجيل: أقسامٌ حقيقية لا صفر — وإلا لم يُطابق `isScopeAllowed` فيبقى وارده فارغاً.
const staff = DEMO_ROLE_ACCOUNTS.find(a => a.role === "registrarStaff")!;
const staffAssigns = assignsByUser(staff.SystemUserId);
check(staffAssigns.length > 0 && staffAssigns.every(a => a.AdSectionId > 0),
  "موظف التسجيل على أقسامٍ حقيقية لا صفراً — فيرى واردَه كرئيس التسجيل");
check(new Set(staffAssigns.map(a => a.AdCollegeId)).size === 1, "وعلى كلية التربية الأساسية وحدها (كليةٌ واحدة في الصندوق)");

// رئيس القسم: يقرأ ولا يبني — بلا ورشة تعديل، ومدخلُه شاشةُ التغييرات.
check(!roleDefinition("departmentHead").formIds.includes(7),
  "رئيس القسم بلا شاشة الورشة (٧): لا أزرارَ إضافةٍ أو تعديلٍ أو حذف");
check(roleDefinition("departmentHead").landing === "changes",
  "ويفتح على «تغييرات الجدول» حيث يعلّق ويوقّع");

for (const account of DEMO_ROLE_ACCOUNTS) {
  if (isViewerOnlyRole(account.role)) {
    check(roleDefinition(account.role).readOnly, `«${account.label}» صفةُ اطّلاع، لا تكتب`);
  }
}

/* ── ٣) دورةٌ عاشت، لا صندوقٌ فارغ ──────────────────────────────────────── */

const currentApprovals = state.scheduleApprovals.filter(a => a.AdTermId === 1);
check(currentApprovals.length === 3 && new Set(currentApprovals.map(a => a.AdSectionId)).size === 3, "بُذرت دوراتُ اعتمادٍ للأقسام الثلاثة في الفصل الجاري");
check(state.scheduleApprovals.every(a => a.AdTermId === 1 || (a.AdTermId === 2 && a.status === "accepted")), "وما سواها في الفصل القادم اعتمادٌ مبكرٌ واحد (التربية الفنية)، لا دورةٌ رابعة مفتوحة");
check(["returned", "accepted", "submitted"].every(status => state.scheduleApprovals.some(a => a.status === status)), "ثلاثُ قصص: مُرجَع (تكنولوجيا التعليم)، ومعتمد (التربية الفنية)، وعند التسجيل (التصميم التعليمي)");
const submitted = state.scheduleApprovals.find(a => a.status === "returned"); // جولاتٌ عدّة: أُرسل وقُبل ثم أُرجع
const returned = state.scheduleApprovals.find(a => a.status === "returned");
const accepted = state.scheduleApprovals.find(a => a.status === "accepted" || a.rounds.some((r: any) => r.acceptedAt));
check(!!returned, "قسمٌ مُرجَعٌ — ينتظر ردّ القسم");
check(!!accepted, "جدولٌ قُبل (يقرؤه العميدان نسخةً نهائية)");

check(!!submitted && submitted.currentRound >= 2, "الدورة بجولاتٍ متعدّدة — للدورة تاريخ");
const baselineId = submitted?.rounds.find(r => r.reviewedVersionId)?.reviewedVersionId;
check(!!baselineId, "للمقارنة أساسٌ محفوظ: نسخةٌ رآها التسجيل");
const baseline = state.scheduleVersions.find(v => v.id === baselineId);
check(!!baseline && baseline.rows.length > 0, "النسخة الأساس تحمل صفوفاً — فالتقرير يُظهر ما تحرّك لا جدولاً جديداً");
check(!!submitted && submitted.signatures.length === 2, "موقّعٌ من اللجنة ومن رئيس القسم");

/* ── ٤) الملاحظاتُ المفتوحة مفتوحةٌ فعلاً ───────────────────────────────── */

const scheduleById = new Map(state.schedules.map(r => [Number(r.id), r]));
function liveValue(row: any, field: string): string {
  if (field === "room") return `${String(row.AdRoomCode || "")}/${String(row.AdRoomHall || "")}`;
  if (field === "instructor") return String(Number(row.AdInstructorId || 0));
  if (field === "time") return `${String(row.fstarttime || "")}-${String(row.fendtime || "")}`;
  return "";
}
/* الملاحظاتُ «المفتوحة» وحدها: ملاحظاتُ الفصل السابق محلولةٌ بالتصميم وقيمتُها هي ما كان قبل العلاج. */
const registrarNotes = state.scheduleComments.filter(c => c.origin === "registrar" && !c.rebuttal && !c.resolved);
check(registrarNotes.length > 0, "ثمّة ملاحظاتُ تسجيلٍ مبذورة");
for (const note of registrarNotes) {
  const row = scheduleById.get(Number(note.scheduleId));
  check(!!row, `ملاحظةُ التسجيل معلّقةٌ على صفٍّ موجود (${note.id})`);
  check(!!row && liveValue(row, String(note.field)) === String(note.valueAtNote),
    `ملاحظةٌ «مفتوحة»: قيمتُها تطابق الصفّ الحيّ فلا تُقرأ «عُولجت» وهي على حالها (${note.id})`);
}
// ملاحظةٌ رُدَّ عليها لتظهر لدى التسجيل «تنتظر قرارك».
check(state.scheduleComments.some(c => c.origin === "registrar" && c.rebuttal), "ملاحظةٌ ردّ عليها القسم — تنتظر قرار التسجيل");
// ملاحظةٌ داخليةٌ من القسم لا تمنع الإرسال.
check(state.scheduleComments.some(c => c.origin === "department"), "ملاحظةٌ داخليةٌ من القسم");

/* ── ٥) الخادمُ يبدّل الصفة، والحارس يسمح بالمسار ───────────────────────── */

const server = readServerSource();
check(server.includes('app.post("/api/demo/role"'), "الخادم يفتح مسار تبديل الصفة");
check(server.includes('app.post("/api/demo/role", rateLimitDemoRole,'),
  "ومسارُ التبديل محدودُ المعدّل بحدٍّ يُطبَّق دائماً — لا يُترك مساراً مصادَقاً بلا حدّ");
check(server.includes("Repository.createSession(sessionId, targetId, DEMO_SESSION_TTL_MS)"),
  "التبديل يعيد ربط الجلسة بحساب الصفة المطلوبة");
check(server.includes("if (!Repository.isDemoRequest())") && server.slice(server.indexOf('app.post("/api/demo/role"')).includes("isDemoRequest"),
  "وهو مقصورٌ على البيئة التجريبية: لا رفعَ صلاحيةٍ في جلسةٍ حقيقية");
check(server.includes("roles: DEMO_SWITCH_ACCOUNTS") && DEMO_ROLE_ACCOUNTS.every(account => DEMO_SWITCH_ACCOUNTS.includes(account)),
  "قائمةُ الصفات تصل الواجهةَ مع حمولة الجلسة");
check(server.includes("fullSchedule"), "تقرير التغييرات يحمل الجدول كاملاً، لا التغييرات وحدها");

// الحارس يسمح بمسار تبديل الصفة كإجراء جلسة، لا يردّه ٤٠٣ على صفةٍ للاطّلاع.
const verdict = roleWriteDecision({ method: "POST", path: "/demo/role", authenticated: true, powerUser: false, role: "dean" });
check(verdict.allowed, "الحارس يمرّر /demo/role ولو كانت الصفة الحالية للاطّلاع");
check(!isApprovalWritePath("/demo/role"), "و/demo/role ليس مسار اعتماد");

/* ── ٦) كلُّ صفةٍ تحكي قصةً كاملة — بخفّة (ملاحظة المالك 3؛ والحيُّ في demo-every-role-audit) ─── */

/* لوحةُ البداية تقرأ أحدثَ فصل (الثاني): لكل حسابٍ مربوطٍ بأستاذ موعدان فيه على الأقل، فلا تُفتح لوحتُه الشخصية على صفر. */
const upcoming = state.schedules.filter(row => Number(row.AdTermId) === 2);
for (const user of state.users.filter(u => Number((u as any).AdInstructorId) > 0)) {
  const mine = upcoming.filter(row => Number(row.AdInstructorId) === Number((user as any).AdInstructorId));
  check(mine.length >= 2, `«${user.Name}»: موعدان له على الأقل في الفصل القادم — لوحتُه الشخصية لا تُفتح على صفر (${mine.length})`);
}
/* لوحةُ القرار عند العميدين: لكل قسمٍ تخطيطُه بمقرراته هو وحدها. */
for (const sectionId of [1, 2, 3]) {
  const plan = (state.registrationStats || []).find((row: any) => row.termId === 1 && row.sectionId === sectionId);
  const ids = Object.keys(plan?.accepted || {}).map(Number);
  check(ids.length > 0 && ids.every(id => state.courses.find(c => c.AdCourseId === id)?.AdSectionId === sectionId),
    `القسم ${sectionId}: تخطيطٌ لمقرراته هو وحدها — فتُقرأ لوحةُ القرار بدرجاتها (${ids.length})`);
}
/* رصيدُ مقاعد المرشد: سعةٌ ورصيدٌ وإضافاتٌ من المرشدَين وطلبُ استثناء — لا ثمانيَ وثلاثين شعبةً بسعة «0». */
const docs: any = (state as any).featureDocs || {};
const seatConfig = docs.advisorSeatLedgers?.["config:1:1:1"];
const seatLedgers = Object.values(docs.advisorSeatLedgers || {}).filter((row: any) => Array.isArray(row.adds));
check(Number(seatConfig?.capacityDefault) > 0 && Number(seatConfig?.global) > 0, "رصيدُ مقاعد المرشد بسعةٍ أساسية ورصيدٍ عام");
check(seatLedgers.length >= 3 && [19, 21].every(id => seatLedgers.some((row: any) => row.adds.some((add: any) => add.advisorId === id))),
  "ومقاعدُ أضافها المرشدان كلاهما (مرشد القسم والإرشاد العام)");
check(Object.values(docs.advisorSeatRequests || {}).some((row: any) => row.status === "pending"), "وطلبُ استثناءٍ ينتظر المسؤول على شعبةٍ ممتلئة");
/* «لم نصل بعد» (الأول أولُ فصلٍ للصحيفة الجديدة): صيفيٌّ فيه 314 وحده، و343 مفتوحٌ للطرح بقرار القسم. */
{
  const codeOf = new Map(state.courses.map(c => [c.AdCourseId, c.CourseCode]));
  const termsOf = (code: string) => new Set(state.schedules.filter(row => codeOf.get(row.AdCourseId) === code).map(row => Number(row.AdTermId)));
  const summer = state.terms.find(term => /الصيفي 2025\/2026/.test(String(term.AdTermName)));
  check(Boolean(summer?.AdTermClosed) && [...termsOf("0109314")].join() === String(summer?.AdTermId), "الصيفي 2025/2026 مغلقٌ، وفيه وحده طُرح 314");
  check([...termsOf("0109324")].every(id => id === 1 || id === 2), "و324 (متطلبه 314) لم يُطرح قبل الأول — فالصيفيُّ هو ما أوصل إليه");
  const open = (state as any).featureDocs?.courseOfferingStates?.["1:1:1"]?.courses || {};
  check(Object.values(open).some((entry: any) => entry.reachOpen && codeOf.get(entry.courseId) === "0109343"), "«افتحه للطرح» على 343 في الأول");
  check(!["0109346", "0109453", "0109459", "0109410"].some(code => termsOf(code).has(1)), "السلسلة والتوأم بلا شعبٍ في الأول: يُقرأ قفلُهما في الثاني");
}
/* خفيفٌ: الصندوقُ كلُّه بلا البذر الخلفي تحت 300 كيلوبايت (كان 264 قبل هذه القصص، فالزيادة أقلُّ من 14%). */
const stateBytes = JSON.stringify(state).length;
check(stateBytes < 300_000, `الصندوقُ التجريبي خفيف: ${Math.round(stateBytes / 1024)} كيلوبايت (< 300)`);

console.log(`\n${passed} نجحت · ${failed} أخفقت`);
if (failed > 0) process.exit(1);
