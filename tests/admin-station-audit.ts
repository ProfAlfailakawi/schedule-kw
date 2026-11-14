/**
 * ── «إدارة النظام»: الحرّاس والخزنة والسجل والمواقع ──────────────────────────
 *
 * دوالُّ الحرّاس خالصة فتُختبر هنا بلا خادم (src/server/userAdminGuards.ts)، وما بقي يُفحص في نصّه:
 *  G  حرّاسُ الحسابات: الحساب الرئيسي، ونفسُك، وآخرُ مدير، و«مدير»، والصفة، وطولُ الكلمة.
 *  P  صلاحياتُ الحساب الرئيسي ونفسك، وبذرةُ الشبكة بعد الحفظ.
 *  A  السجلُّ: ما تغيّر (والكلمةُ علامةٌ لا قيمة)، وصفحاتٌ ونطاقُ تاريخ وتصدير.
 *  I  ذاكرةُ الهويات تُمسح بعد الكتابة، ولا تُحفظ قراءةٌ سبقها تغيير.
 *  V  الخزنة: إلغاءُ الاستيراد بالعودة إلى نقطة الأمان، والعباراتُ المكتوبة، ونصٌّ صادق.
 *  L  المواقع: العددُ قبل الإيقاف، وإعادةُ التفعيل، وزرُّ QR لكل قاعة.
 *  U  الواجهة: الأسماءُ ظاهرة في الشريط، والنموذجُ لا يُغلق على تعديل، والمعاينةُ قبل الإنشاء.
 */
import fs from "fs";
import { adminPasswordProblem, isActiveAdmin, userDeleteRefusal, userEditDiff, userEditRefusal, type GuardUser } from "../src/server/userAdminGuards";
import { IMPORT_PHRASE, RESET_PHRASE, UNDO_PHRASE } from "../src/utils/vaultPhrases";

let failed = 0;
const check = (ok: boolean, label: string) => { if (!ok) failed++; console.log(`${ok ? "✓" : "✗"} ${label}`); };
const read = (file: string) => fs.readFileSync(file, "utf8");

const ROOT = 1;
const root: GuardUser = { SystemUserId: 1, Name: "الإدارة", IsAdminUser: false, IsActive: true, IsLocked: false };
const adminA: GuardUser = { SystemUserId: 5, Name: "مدير أ", IsAdminUser: true, IsActive: true, IsLocked: false };
const plain: GuardUser = { SystemUserId: 9, Name: "رئيس لجنة", IsAdminUser: false, IsActive: true, IsLocked: false, Role: "committeeChair" };
const users = [root, adminA, plain];
const keep = (u: GuardUser) => ({ IsAdminUser: Boolean(u.IsAdminUser), IsActive: Boolean(u.IsActive), IsLocked: Boolean(u.IsLocked) });
const edit = (actorId: number, before: GuardUser, next: Partial<ReturnType<typeof keep>>, extra: { roleChanged?: boolean; perms?: number[]; list?: GuardUser[] } = {}) =>
  userEditRefusal({ actor: { id: actorId, permissions: extra.perms || [11] }, rootId: ROOT, before, next: { ...keep(before), ...next }, roleChanged: Boolean(extra.roleChanged), users: extra.list || users });

/* G */
check(isActiveAdmin(root, ROOT) && isActiveAdmin(adminA, ROOT) && !isActiveAdmin(plain, ROOT), "G0 المدير الفاعل: علامة «مدير» أو الحساب الرئيسي، فعّالاً غير مقفل");
check(edit(5, root, { IsActive: true }) === "حساب الإدارة الرئيسي لا يعدّله إلا صاحبه.", "G1 مديرٌ آخر لا يعدّل الحساب الرئيسي");
check(edit(1, root, {}) === null, "G1 الحساب الرئيسي يعدّل نفسه");
check(Boolean(edit(5, adminA, { IsActive: false })) && Boolean(edit(5, adminA, { IsLocked: true })), "G2 لا يوقف أحدٌ حسابه ولا يقفله");
check(Boolean(edit(1, { ...root, IsAdminUser: true }, { IsAdminUser: false })), "G2 ولا ينزع «مدير» عن نفسه");
check(Boolean(edit(5, plain, { IsAdminUser: true })) && edit(1, plain, { IsAdminUser: true }) === null, "G3 منح «مدير» للحساب الرئيسي وحده");
check(Boolean(edit(5, plain, {}, { roleChanged: true })) && edit(5, plain, {}, { roleChanged: true, perms: [11, 12] }) === null && edit(1, plain, {}, { roleChanged: true }) === null, "G4 تغيير الصفة يلزمه الشاشة 12 أو الحساب الرئيسي");
const lonely = [{ ...root, IsActive: true }, adminA];
check(edit(1, adminA, { IsAdminUser: false }, { list: lonely }) === null, "G5 نزع «مدير» مقبولٌ ما دام غيرُه فاعلاً");
const onlyAdmin: GuardUser[] = [{ ...root, IsLocked: true }, adminA];
check(Boolean(edit(1, adminA, { IsActive: false }, { list: onlyAdmin })), "G5 آخر مديرٍ فاعل لا يُوقف");
check(userDeleteRefusal({ actor: { id: 5, permissions: [11] }, rootId: ROOT, target: root, users }) === "حساب الإدارة الرئيسي لا يُحذف.", "G6 الحساب الرئيسي لا يُحذف");
check(Boolean(userDeleteRefusal({ actor: { id: 5, permissions: [11] }, rootId: ROOT, target: adminA, users })), "G6 لا يحذف أحدٌ حسابه");
check(userDeleteRefusal({ actor: { id: 5, permissions: [11] }, rootId: ROOT, target: plain, users }) === null, "G6 حذف حسابٍ عادي مقبول");
check(Boolean(userDeleteRefusal({ actor: { id: 1, permissions: [11] }, rootId: ROOT, target: adminA, users: onlyAdmin })), "G6 آخر مديرٍ فاعل لا يُحذف");
check(Boolean(adminPasswordProblem("1234567")) && adminPasswordProblem("12345678") === null && Boolean(adminPasswordProblem("x".repeat(129))), "G7 كلمة يكتبها مسؤول: 8 إلى 128 (والافتراضية 12345678 مقبولة بقرار المالك)");
const usersRoutes = read("src/server/routes/usersRoutes.ts");
check(/userEditRefusal\(\{/.test(usersRoutes) && /userDeleteRefusal\(\{/.test(usersRoutes) && usersRoutes.includes("adminPasswordProblem(String(password))"), "G8 الطرق تستعمل الحرّاس قبل أي كتابة");
check(usersRoutes.includes('code: "current-password-required"') && usersRoutes.includes("Repository.verifyPassword(current"), "G9 كلمتك أنت لا تُغيَّر من الشاشة بلا الحالية");
check(usersRoutes.includes("IsRootAccount: Number(user.SystemUserId) === ROOT_ADMIN_USER_ID"), "G10 الواجهة تعرف الحساب الرئيسي لتُطفئ ما يرفضه الخادم");
const seats = read("src/server/seatsRoutes.ts");
check((seats.match(/requirePowerAdmin, (resetLimit, )?seatAdmin,/g) || []).length === 7 &&seats.includes("const seatAdmin = requirePermission(11)"), "G11 إدارة الفرق بالشاشة 11 كما في الواجهة");
check(read("src/server/routes/schedulesRoutes.ts").includes("Number(req.user.SystemUserId) !== ROOT_ADMIN_USER_ID") && !read("src/server/routes/schedulesRoutes.ts").includes("SystemUserId !== 1"), "G12 نسخ الفصل للحساب الرئيسي ROOT_ADMIN_USER_ID لا للرقم 1");

/* P */
check(usersRoutes.includes("function permissionEditRefusal") && (usersRoutes.match(/permissionEditRefusal\(req as AuthenticatedRequest/g) || []).length >= 4, "P1 صلاحيات الحساب الرئيسي لصاحبه، ولا ينزع أحدٌ عن نفسه 11 أو 12 — في كل طرق الصلاحيات");
const ui = read("src/components/AdminUsers.tsx");
const backBody = ui.slice(ui.indexOf("const back = () => {"), ui.indexOf("const saveUser"));
check(!backBody.includes("setPermUser(0)") && !backBody.includes("setPermSelections([])"), "P2 الإغلاق لا يمسح شبكة الحساب المختار (فلا «0 من N» بعد الحفظ)");
const savePerm = ui.slice(ui.indexOf("const savePermission"), ui.indexOf("const saveScope"));
check(savePerm.includes("await load();") && !savePerm.includes("back();"), "P2 حفظ الصلاحيات يعيد البذرة من الخادم ولا يغلق شيئاً");
check(ui.includes("const permDirty") && ui.includes("صلاحيات لم تُحفظ") && ui.includes("onClick={() => void selectUser(u.SystemUserId)}"), "P3 تبديلٌ لم يُحفظ يُسأل عنه قبل الانتقال");

/* A */
const diff = userEditDiff({ SystemUserId: 9, Name: "أ", SystemUserLogin: "a", IsAdminUser: false, IsActive: true, IsLocked: false }, { SystemUserId: 9, Name: "ب", SystemUserLogin: "a", IsAdminUser: true, IsActive: false, IsLocked: false }, { passwordChanged: true });
check(diff.includes("الاسم: «أ» ← «ب»") && diff.includes("مدير: لا ← نعم") && diff.includes("فعّال: نعم ← لا") && diff.includes("أُعيد تعيين كلمة السر"), "A1 السجل يقول ما تغيّر من «إلى»");
check(!/SystemUserPass|hash/i.test(diff), "A1 والكلمة علامةٌ لا قيمة ولا بصمة");
check(usersRoutes.includes("res.locals.auditChanges = userEditDiff(") && usersRoutes.includes("حذف الحساب «"), "A2 التعديل والحذف يكتبان ما تغيّر");
const repo = read("src/db/repository.ts");
check(repo.includes('query = query.where("timestamp", "<", before)') && repo.includes('query.where("timestamp", ">=", from)'), "A3 السجل صفحةً صفحة بنطاق تاريخ على الخادم");
check(read("src/server/routes/adminRoutes.ts").includes("before: text(req.query.before), from: text(req.query.from), to: text(req.query.to)"), "A3 الطريق يمرّر المؤشر والنطاق");
check(ui.includes("const loadAuditPage") && ui.includes("تصدير CSV") && ui.includes("أقدم`"), "A4 الشاشة: نطاق تاريخ وتحميل الأقدم وتصدير");

/* I */
check(repo.includes("async function afterIdentityWrite") && (repo.match(/=> afterIdentityWrite\(async \(\) => \{/g) || []).length >= 11, "I1 تغيُّر الهوية يُبلَّغ بعد الكتابة");
check(!/(createUser|updateUser|saveSecurityByUser|saveUserAssigns): async \([^)]*\)[^=]*=> \{\n\s*announceIdentityChange\(\);/.test(repo), "I1 لا تبليغ قبل الكتابة في دوال الهوية");
const auth = read("src/server/core/auth.ts");
check(auth.includes("const generationAtRead = Repository.identityGeneration()") && auth.includes("Repository.identityGeneration() === generationAtRead"), "I2 قراءةٌ سبقها تغيير لا تُحفظ في الذاكرة");

/* V */
check(RESET_PHRASE === "تصفير النظام" && new Set<string>([RESET_PHRASE, IMPORT_PHRASE, UNDO_PHRASE]).size === 3, "V1 عباراتٌ ثلاث من مصدرٍ واحد");
const admin = read("src/server/routes/adminRoutes.ts");
check(admin.includes("headerPhrase(req) !== IMPORT_PHRASE") && admin.includes('String(req.body?.phrase || "") !== UNDO_PHRASE'), "V1 الخادم يطابق عبارتي الاستيراد والتراجع");
check(admin.includes('app.delete("/api/system-backup/import-jobs/:id"') && admin.includes("FULL-SYSTEM-IMPORT-ABANDON"), "V2 طريقٌ لإلغاء الاستيراد بتأكيدٍ صريح");
const abandon = repo.slice(repo.indexOf("async function abandonSystemImportJob"), repo.indexOf("function validateFirestoreDocumentPath"));
check(abandon.includes("loadSystemRestorePoint(String(row.restorePointId)") && abandon.includes("replaceSystemFromBackup(original") && abandon.includes('status: "abandoned"'), "V2 الإلغاء يعيد النظام من نقطة الأمان إن كان قد بدأ الاستبدال");
check((repo.match(/row\.status === "ready" \|\| row\.status === "abandoned"/g) || []).length === 2, "V2 لا خطوةَ على مهمةٍ ملغاة");
check(repo.includes('await markOpenImportJobAbandoned(rootAdminId, "أُلغي بالتراجع الكامل")'), "V3 التراجع الكامل يُلغي الاستيراد المعلّق");
check(!repo.includes("importSystemBackup: async"), "V4 الاستيراد دفعةً واحدة غير المستعمل أُزيل");
check(!ui.includes("وإذا فشلت أي خطوة يعيده الخادم تلقائيًا") && ui.includes("«تلغي الاستيراد» فيعود النظام إلى نقطة الأمان"), "V5 نافذة الاستيراد تقول ما يحدث فعلاً");
check(ui.includes("confirmPhrase !== IMPORT_PHRASE") && ui.includes("confirmPhrase !== UNDO_PHRASE") && ui.includes('encodeURIComponent(IMPORT_PHRASE)'), "V6 الواجهة تطلب العبارة المكتوبة للاستيراد والتراجع");
const modeEffect = ui.slice(ui.indexOf("exportRunner.current += 1;"), ui.indexOf("void load();\n  }, [mode]);"));
check(modeEffect.includes("importRunner.current += 1;"), "V7 مغادرة الشاشة توقف متابِع الاستيراد");
check(ui.includes("إلغاء الاستيراد") && ui.includes("const abandonImport"), "V8 زر «إلغاء الاستيراد» للمهمة المتوقفة");

/* L */
const loc = read("src/server/routes/locationsRoutes.ts");
check(loc.includes("async function locationUsage") && loc.includes('app.get("/api/admin/location-setup/usage"'), "L1 عددُ المواعيد في الفصل الحالي وما بعده");
check((loc.match(/req\.get\("x-schedule-confirm"\)!==LOCATION_IN_USE_CONFIRM/g) || []).length === 2, "L1 إيقافُ قاعةٍ أو مبنى مستعمل يلزمه تأكيدٌ صريح");
check((loc.match(/code:"inactive-exists"/g) || []).length === 2, "L2 الرمزُ الموجود موقوفاً يُعرض لإعادة التفعيل");
const quick = read("src/components/LocationQuickSetup.tsx");
check(!quick.includes("window.confirm") && quick.includes("usageLine(usage)") && quick.includes('e?.data?.code === "inactive-exists"') && quick.includes("<RoomDoorQr links={doorLinks} roomId={room.id}/>"), "L3 الشاشة: تأكيدٌ مرئي بالعدد، وإعادة تفعيل، وQR لكل قاعة");
check(!fs.existsSync("src/components/LocationRegistryAdmin.tsx") && !read("docs/srs/modules/03-loc.json").includes("LocationRegistryAdmin"), "L4 شاشة السجل الميتة حُذفت ومراجعها");

/* U */
const css = read("src/styles/35-visual-polish.css");
check(!css.includes(".console-tab-plain:not(.active) .console-tab-label{") && css.includes("flex-wrap:wrap;overflow:visible"), "U1 كل قسمٍ في شريط الإدارة باسمه ظاهراً، والشريط يلتفّ");
check(ui.includes("const closeUserDrawer") && ui.includes("onClose={() => void closeUserDrawer()}") && ui.includes('backLabel="إلغاء"'), "U2 النموذج لا يُغلق على تعديلٍ لم يُحفظ، والأزرار مسمّاة");
check(ui.includes("const openHeadPlan") && ui.includes("/api/users/${kind}/preview") && ui.includes("setPlanKind(kind)"), "U3 «حسابات رؤساء الأقسام/المرشدين» تفتح معاينة الخادم");
check(ui.includes('"الكلية كلها"') && ui.includes("احفظ بلا نطاق"), "U4 صفُّ القسم صفر «الكلية كلها»، وصفةُ كليةٍ بلا كلية تُسأل");
check(!ui.includes("window.confirm") && !read("src/components/seats/SeatsAdmin.tsx").includes("window.confirm") && !read("src/components/seats/SeatPanel.tsx").includes("window.confirm"), "U5 لا نافذة متصفح في الإدارة والفرق");
check(ui.includes("adminLockReason") && ui.includes("statusLockReason") && ui.includes("admin-guard-note"), "U6 الخانات المطفأة تقول سببها");
check(read("src/components/TeachingLoadSettings.tsx").includes("const changeTerm") && read("src/components/TeachingLoadSettings.tsx").includes("تجاهلها وغيّر الفصل"), "U7 تغيير فصل النصاب يسأل عن التغييرات غير المحفوظة");
check(repo.includes("setSectionScheduleDayWindows: async") && read("src/server/routes/referenceRoutes.ts").includes("Repository.setSectionScheduleDayWindows(sectionIds"), "U8 دوام الأقسام يُحفظ كلُّه أو لا شيء");
const app = read("src/App.tsx");
check(app.includes("currentUserId={Number(user.SystemUserId)}") && app.includes("user.IsRootAdmin && allowed.admin && hasPerm(7)"), "U9 حرّاس الواجهة على حرّاس الخادم");

console.log(failed ? `\n${failed} فشل` : "\nكل فحوص «إدارة النظام» ناجحة");
process.exit(failed ? 1 : 0);
