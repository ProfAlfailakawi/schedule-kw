/**
 * ── «لو حذفت؟»: خريطةُ ما يرتبط بالسجل قبل الحذف ──────────────────────────────
 * حارسٌ ساكن + منطقٌ صِرف (بلا خادم ولا منفذ):
 *  ١) التجميع والعقبات: نصوصُ الرفض هي نفسُها التي كانت في المسارات، بترتيبها وحالاتها.
 *  ٢) مصدرٌ واحد: كلُّ حارس حذفٍ في المسارات يستدعي deleteBlockers، ولا نصَّ رفضٍ مكرَّراً فيها،
 *     والمسارُ الجديد يقرأ blockersFor عبر الدالة نفسها.
 *  ٣) المسار: الصلاحيةُ والنطاقُ كمسار الحذف المقابل لكل نوع.
 *  ٤) الواجهة: كلُّ حذفٍ (فصل/كلية/قسم/أستاذ/مقرر/مبنى/قاعة/حساب) يمرّ بنافذة الخريطة.
 */
import fs from "node:fs";
import path from "node:path";
import {
  DELETE_ENTITIES, DELETE_FIX_PATHS, appointmentGroup, appointmentsTotal, blockersFor, bucketAppointments,
  compactGroups, groupsTotal, impactSummaryLine, isDeleteEntity, legacyRoomKey, scopedAccountsMessage,
} from "../src/utils/deleteImpact";
import { accountsScopedTo } from "../src/utils/academicGuards";

let passed = 0, failed = 0;
const check = (ok: boolean, name: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const flat = (text: string) => text.replace(/\s+/g, " ");

/* ── ١) التجميع ── */
const ctx = { activeId: 5, laterIds: new Set([6, 7]) };
const buckets = bucketAppointments([{ AdTermId: 5 }, { AdTermId: 5 }, { AdTermId: 6 }, { AdTermId: 7 }, { AdTermId: 7 }, { AdTermId: 7 }, { AdTermId: 2 }, { AdTermId: 1 }], ctx);
check(buckets.current === 2 && buckets.later === 4 && buckets.past === 2, "المواعيد تُقسم: الفصل الجاري وما بعده وما قبله");
check(appointmentsTotal(buckets) === 8, "مجموع المواعيد يطابق الصفوف");
check(JSON.stringify(bucketAppointments([], ctx)) === JSON.stringify({ current: 0, later: 0, past: 0 }), "بلا مواعيد: أصفار");
const groups = compactGroups([appointmentGroup({ current: 0, later: 3, past: 0 }), { id: "empty", title: "فارغ", items: [{ id: "x", noun: "course", count: 0 }] }]);
check(groups.length === 1 && groups[0].items.length === 1 && groups[0].items[0].count === 3, "البنود الصفرية والمجموعات الفارغة تُحذف");
check(groupsTotal(groups) === 3, "مجموع المجموعات");
check(/3 مواعيد|٣ مواعيد/.test(impactSummaryLine(groups)) && /لاحقة/.test(impactSummaryLine(groups)), "سطر الملخص يعدّ بـcountOf");
check(impactSummaryLine([]) === "لا شيء آخر مرتبط بهذا السجل.", "ملخّص خالٍ");
check(legacyRoomKey("b1", " a 1 ") === "b1|A1", "مفتاح القاعة القديمة موحَّد");
check(isDeleteEntity("term") && !isDeleteEntity("permission") && DELETE_ENTITIES.length === 8, "ثمانية أنواع للحذف");

/* ── العقبات: النصوص والحالات كما في الحرّاس القديمة ── */
const none = { term: { appointments: 0 }, college: { sections: 0, scopedAccounts: [] }, section: { courses: 0, scopedAccounts: [] }, instructor: { appointments: 0 }, course: { curriculumSectionId: null, appointments: 0 }, user: { found: true, refusal: null } };
for (const entity of ["term", "college", "section", "instructor", "course", "user"] as const) check(blockersFor(entity, none[entity] as never).length === 0, `${entity}: بلا عقبة حين لا شيء يمنع`);
check(blockersFor("room", {}).length === 0 && blockersFor("building", {}).length === 0, "القاعة والمبنى إيقافٌ بتأكيدٍ لا منع");
const [term] = blockersFor("term", { appointments: 3 });
check(term.status === 409 && term.message === "لا يمكن حذف الفصل الدراسي لوجود بيانات مرتبطة به في الجدول الدراسي", "الفصل بمواعيد: 409 بنص الحارس");
const college = blockersFor("college", { sections: 2, scopedAccounts: ["dean1", "reg1"] });
check(college.length === 2 && college[0].message === "لا يمكن حذف الكلية لوجود أقسام علمية مرتبطة بها" && college[0].fix?.view === "sections", "الكلية: الأقسام أولاً ومعها وجهة العلاج");
check(college[1].message === "لا يمكن حذف الكلية: حساباتٌ نطاقها فيه ما زالت قائمة (dean1، reg1). عدّل نطاقها أو احذفها من «المستخدمون» أولاً." && college[1].fix?.view === "users" && college[1].names?.length === 2, "الكلية: الحسابات بأسماء الدخول ووجهة «المستخدمون»");
const section = blockersFor("section", { courses: 1, scopedAccounts: ["head1"] });
check(section[0].message === "لا يمكن حذف القسم العلمي لوجود مقررات دراسية مرتبطة به" && /القسم العلمي: حسابات/.test(section[1].message), "القسم: المقررات ثم الحسابات");
check(blockersFor("instructor", { appointments: 1 })[0].message === "لا يمكن حذف عضو هيئة التدريس لوجود بيانات مرتبطة به في الجدول الدراسي", "الأستاذ بمواعيد");
const course = blockersFor("course", { curriculumSectionId: 9, appointments: 4 });
check(course.length === 2 && course[0].code === "curriculum-linked" && (course[0].body as any).sectionId === 9 && (course[0].body as any).code === "curriculum-linked", "المقرر: الصحيفة أولاً بالرمز والقسم في الجسم");
check(course[1].message === "لا يمكن حذف المقرر الدراسي لوجود بيانات مرتبطة به في الجدول الدراسي", "المقرر: المواعيد ثانياً");
check(blockersFor("course", { curriculumSectionId: 0, appointments: 0 })[0]?.code === "curriculum-linked", "قسمٌ برقم صفر ما زال ارتباطاً (لا يُخلط بالغياب)");
check(blockersFor("user", { found: true, refusal: "لا يمكنك حذف حسابك أنت." })[0].status === 403 && blockersFor("user", { found: false, refusal: "المستخدم غير موجود" })[0].status === 404, "الحساب: 403 للمحمي و404 للغائب");
check(scopedAccountsMessage([], "الكلية") === null, "لا حسابات: لا رسالة");
check(accountsScopedTo([{ SystemUserId: 1, SystemUserLogin: "a" }], [{ SystemUserId: 1, AdCollegeId: 3, AdSectionId: 0 }], { collegeId: 3 }).join() === "a", "حارس الحسابات المشترك لم يتغيّر");
check(Object.values(DELETE_FIX_PATHS).length >= 4, "وجهاتُ العلاج معرّفة");

/* ── ٢) مصدرٌ واحد في الخادم ── */
const reference = read("src/server/routes/referenceRoutes.ts");
const courses = read("src/server/routes/coursesRoutes.ts");
const instructors = read("src/server/routes/instructorsRoutes.ts");
const users = read("src/server/routes/usersRoutes.ts");
const locations = read("src/server/routes/locationsRoutes.ts");
const server = read("src/server/deleteImpact.ts");
const routes = read("src/server/routes/deleteImpactRoutes.ts");
const delBlock = (text: string, route: string) => { const i = text.indexOf(route); return i < 0 ? "" : text.slice(i, i + 2600); };
for (const [text, route, entity] of [
  [reference, 'app.delete("/api/colleges/:id"', "college"], [reference, 'app.delete("/api/sections/:id"', "section"], [reference, 'app.delete("/api/terms/:id"', "term"],
  [courses, 'app.delete("/api/courses/:id"', "course"], [instructors, 'app.delete("/api/instructors/:id"', "instructor"], [users, 'app.delete("/api/users/:id"', "user"],
] as const) {
  const body = flat(delBlock(text, route)).split("res.json({ success: true")[0];
  check(body.includes(`deleteBlockers("${entity}", id`) && body.includes("refuseWithBlocker(res, blocked)"), `حارس حذف ${entity} يستدعي deleteBlockers`);
  check(!/status\(409\)\.json\(\{ ?error: ?"لا يمكن حذف/.test(body), `حارس حذف ${entity} بلا نصّ رفضٍ مكرَّر`);
  check(entity === "section" || !/hasSchedulesFor|getCurriculumPlanCourses|getSectionsByCollege|getCoursesBySection|userDeleteRefusal/.test(body), `حارس حذف ${entity} لا يسأل الحقائق بنفسه`);
}
check(!/scopedAccountsProblem/.test(reference), "لا نسخةَ ثانية من «حسابات النطاق» في referenceRoutes");
check(/blockersFor\(entity, await deleteGuardFacts/.test(flat(server)) && /const facts = await deleteGuardFacts\(entity, id, ctx\);\s*const blockers = blockersFor\(entity, facts as never\)/.test(server), "خريطة التأكيد تقرأ الحقائق والحكم من الدالتين نفسيهما");
check(/hasSchedulesForTerm/.test(server) && /getSectionsByCollege/.test(server) && /userDeleteRefusal/.test(server), "حقائق المنع في الخادم هي الاستعلامات القديمة نفسها");
check(/export async function locationUsage\(/.test(server) && /import \{ locationUsage \} from "\.\.\/deleteImpact"/.test(locations) && !/async function locationUsage/.test(locations), "عدُّ مواعيد القاعة نسخةٌ واحدة يقرؤها مسار الإيقاف والخريطة");
check(/\/api\/admin\/location-setup\/usage/.test(locations), "مسار الاستخدام القائم باقٍ");

/* ── ٣) المسار: صلاحيةٌ ونطاقٌ كمسار الحذف ── */
check(/app\.get\("\/api\/delete-impact\/:entity\/:id"/.test(routes) && /registerDeleteImpactRoutes\(app\)/.test(read("server.ts")), "المسار مسجَّلٌ في الخادم");
const permissionMap = routes.match(/PERMISSION_OF[^=]*= (\{[^}]+\})/)?.[1] || "";
const expectPerm: Record<string, [string, string]> = {
  term: [reference, 'app.delete("/api/terms/:id", requirePermission('], college: [reference, 'app.delete("/api/colleges/:id", requirePermission('], section: [reference, 'app.delete("/api/sections/:id", requirePermission('],
  instructor: [instructors, 'app.delete("/api/instructors/:id", requirePermission('], course: [courses, 'app.delete("/api/courses/:id", requirePermission('], user: [users, 'app.delete("/api/users/:id", requirePermission('],
};
for (const [entity, [text, head]] of Object.entries(expectPerm)) {
  const at = text.indexOf(head);
  const n = at < 0 ? "?" : text.slice(at + head.length).match(/^(\d+)/)?.[1];
  check(new RegExp(`${entity}: ${n}\\b`).test(permissionMap), `صلاحية خريطة ${entity} = صلاحية حذفه (${n})`);
}
check(/app\.delete\("\/api\/admin\/location-setup\/rooms\/:id", requirePermission\(7\), requireRootAdmin/.test(locations) && /room: 7, building: 7/.test(permissionMap) && /entity === "room" \|\| entity === "building"\) steps\.push\(requireRootAdmin/.test(routes), "القاعة والمبنى: الشاشة ٧ والحساب الرئيسي");
check(/entity === "college" && !req\.user\.IsAdminUser && !isScopeAllowed\(req, id, 0\)/.test(routes) && /entity === "section"/.test(routes) && /isScopeAllowed\(req, course\.AdCollegeId, course\.AdSectionId\)/.test(routes) && /committeeCatalogEditAllowed/.test(routes), "النطاقُ ونافذة اللجنة كمسارات الحذف");
check(/Cache-Control", "no-store"/.test(routes) && !/app\.(post|put|delete|patch)\(/.test(routes), "قراءةٌ فقط بلا تخزين");
check(!/AdInstructorCivil|AdInstructorMobile|nameCipher|civilCipher|SystemUserPass/.test(server), "لا بياناتٍ شخصية في الخريطة");

/* ── ٤) الواجهة: كل حذفٍ يمرّ بالخريطة ── */
const ui = read("src/components/DeleteImpact.tsx");
check(/\/api\/delete-impact\//.test(ui) && /countOf\(item\.count/.test(ui) && /لا يمكن الحذف الآن/.test(ui) && /تعذّر تحميل خريطة المرتبطات/.test(ui) && /جارٍ جمع/.test(ui), "الواجهة: تحميل وعدّ بـcountOf وحالة المنع وحالة الفشل");
check(/gate\.set\(\{ disabled: blocked/.test(ui) && /gate\.set\(\{ disabled: true \}\)/.test(ui), "الزرّ معطّلٌ أثناء التحميل وحين يمنع الحذف");
check(/state: "refused"/.test(ui) && /status === 403 \|\| response\.status === 409/.test(ui), "رفضُ النطاق يُعامل كعقبة، والفشل الآخر يسمح بالمتابعة بتحذير");
check(/DELETE_FIX_PATHS\[view\]/.test(ui) && /popstate/.test(ui), "وجهةُ العلاج تنقل إلى الشاشة");
const appPaths = read("src/App.tsx");
for (const [view, p] of Object.entries(DELETE_FIX_PATHS)) check(new RegExp(`${view}: "${p.replace(/\//g, "\\/")}"`).test(appPaths), `وجهة ${view} = مسارها في App.tsx`);
const uiBase = read("src/components/ui.tsx");
check(/gate\?: ConfirmGate/.test(uiBase) && /disabled=\{gateState\.disabled\}/.test(uiBase) && /createConfirmGate/.test(uiBase), "visualConfirm يقبل بوابةً اختيارية");
const flows: Array<[string, string]> = [
  ["src/components/Terms.tsx", "term"], ["src/components/Colleges.tsx", "college"], ["src/components/Sections.tsx", "section"], ["src/components/Instructors.tsx", "instructor"],
  ["src/components/Courses.tsx", "course"], ["src/components/LocationQuickSetup.tsx", "room"], ["src/components/LocationQuickSetup.tsx", "building"], ["src/components/AdminUsers.tsx", "user"],
];
for (const [file, entity] of flows) {
  const text = read(file);
  check(text.includes('import { confirmDeleteWithImpact } from "./DeleteImpact"') && new RegExp(`confirmDeleteWithImpact\\(\\{[^}]*entity: "${entity}"`).test(flat(text)), `${path.basename(file)}: حذف ${entity} يعرض الخريطة`);
}
check(!/visualConfirm\(\{ title: `حذف «/.test(["Terms", "Colleges", "Sections", "Instructors", "Courses"].map(n => flat(read(`src/components/${n}.tsx`))).join("")), "لا حذفٌ قديمٌ بلا خريطة في شاشات الإدارة الأكاديمية");
check(/import "\.\/styles\/63-delete-impact\.css"|63-delete-impact\.css/.test(read("src/index.css")), "الأنماط مستوردة");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
