/**
 * ── الخزنة: التصفير والتراجع الكامل مهمّتان متدرجتان + إبطال الهوية بين النُّسخ ──
 *
 *  P  مخطِّط الخطوات (src/server/vaultJobPlanner.ts): القائمة، الخطوة التالية، التقدّم، إعادة المحاولة.
 *  G  منطق تحديث الجيل المشترك (src/server/identityGeneration.ts) بساعةٍ وهمية.
 *  W  توصيل المسارات والواجهة والمستودع (فحصٌ ساكن). لا خادم ولا قاعدة بيانات.
 */
import fs from "fs";
import {
  createOpenVaultFlag, holdsLease, isOpenVaultStatus, isTerminalVaultStatus, leaseIsLive, leaseWriteFields, maintenanceRefuses, nextOpAction, opProgressPercent, opRetryOutcome,
  opTotalUnits, opTouchedData, pickRestorePointEvictions, planLeaseTake, planLockTake, planLockVerify, planResetQueue, planUndoQueue, VAULT_LEASE_MS, VAULT_OP_MAX_RETRIES,
} from "../src/server/vaultJobPlanner";
import { classifyGenerationReading, createGenerationWatcher, IDENTITY_GENERATION_TTL_MS, isGenerationReadDue, withTimeout } from "../src/server/identityGeneration";

let failed = 0;
const check = (ok: boolean, label: string) => { if (!ok) failed++; console.log(`${ok ? "✓" : "✗"} ${label}`); };
const read = (file: string) => fs.readFileSync(file, "utf8");

/* P */
const excluded = new Set(["_systemRestorePoints", "_systemExportJobs", "_systemImportJobs", "_systemOpJobs", "sessions"]);
const resetQ = planResetQueue(["users", "schedules", "formNames", "formSecurity", "sessions", "courses", "_systemOpJobs", "courses"], excluded);
check(JSON.stringify(resetQ) === JSON.stringify(["courses", "schedules", "formSecurity", "users"]), "P1 التصفير: العاديةُ أولاً ثم formSecurity ثم users، وformNames والمستثنى خارج القائمة");
check(planResetQueue(["a"], excluded).join() === "a", "P2 قاعدةٌ بلا مجموعات هوية تُصفَّر بلا خطأ");
const undoQ = planUndoQueue(["users", "courses"], ["courses", "terms", "sessions"], excluded);
check(JSON.stringify(undoQ) === JSON.stringify(["courses", "terms", "users"]), "P3 التراجع: اتحادُ الموجود والهدف بلا تكرار ولا مستثنى");
check(opTotalUnits(5, 10) === 16 && opTotalUnits(0, 0) === 2, "P4 وحداتُ التقدم: الأمان + مجموعاتٌ + إتمام");
const cur = (status: any, phase: any, nextIndex: number, queueLength: number) => ({ status, phase, nextIndex, queueLength });
check(nextOpAction(cur("running", "safety", 0, 3)) === "safety", "P5 الخطوةُ الأولى نقطةُ الأمان");
check(nextOpAction(cur("running", "apply", 1, 3)) === "apply", "P6 ثم مجموعةٌ في كل خطوة");
check(nextOpAction(cur("running", "apply", 3, 3)) === "finalize" && nextOpAction(cur("running", "finalizing", 3, 3)) === "finalize", "P7 بعد آخر مجموعة يأتي الإتمام");
check(nextOpAction(cur("running", "apply", 0, 0)) === "finalize", "P8 قائمةٌ فارغة تنتقل إلى الإتمام");
check(nextOpAction(cur("ready", "finalizing", 3, 3)) === "done" && nextOpAction(cur("abandoned", "apply", 1, 3)) === "done", "P9 المكتملةُ والملغاة لا تتقدّم");
check(nextOpAction(cur("failed", "apply", 1, 3)) === "apply", "P10 المتوقفة تُستكمل من نفس المجموعة");
check(opProgressPercent({ status: "ready", completedUnits: 3, totalUnits: 9 }) === 100, "P11 المكتملة 100٪");
check(opProgressPercent({ status: "running", completedUnits: 9, totalUnits: 9 }) === 99, "P12 الجاريةُ لا تبلغ 100٪");
check(opProgressPercent({ status: "running", completedUnits: 0, totalUnits: 0 }) === 0, "P13 بلا وحدات = 0");
check(opRetryOutcome(0, true).status === "running" && opRetryOutcome(0, false).status === "failed", "P14 العابرُ يُعاد وغيرُه يتوقف");
check(opRetryOutcome(VAULT_OP_MAX_RETRIES - 1, true).status === "failed", "P15 حدٌّ أقصى لإعادة المحاولة");
check(!opTouchedData({ phase: "safety", restorePointId: "x" }, false) && opTouchedData({ phase: "apply", restorePointId: "x" }, false) && opTouchedData({ phase: "safety", restorePointId: "x" }, true) && !opTouchedData({ phase: "apply" }, false), "P16 الإلغاءُ يعيد النظام فقط إن بدأ التغيير وكانت نقطةُ الأمان محفوظة");
/* L: الإيجار والإصدار */
const t0 = 1_000_000;
check(!leaseIsLive({}, t0) && leaseIsLive({ leaseOwner: "a", leaseUntil: t0 + 5 }, t0) && !leaseIsLive({ leaseOwner: "a", leaseUntil: t0 }, t0), "L1 الإيجارُ حيٌّ حتى انقضائه فقط");
const free = planLeaseTake({ version: 3 }, "a", t0);
check(free.ok && free.next.version === 4 && free.next.leaseOwner === "a" && free.next.leaseUntil === t0 + VAULT_LEASE_MS, "L2 أخذُ الإيجار يزيد الإصدار ويحدّد الانقضاء (60 ثانية)");
check(!planLeaseTake({ version: 4, leaseOwner: "a", leaseUntil: t0 + 10 }, "b", t0).ok, "L3 إيجارٌ حيٌّ لغيرنا ⇒ لا يُؤخذ (busy)");
check(planLeaseTake({ version: 4, leaseOwner: "a", leaseUntil: t0 - 1 }, "b", t0).ok, "L4 إيجارٌ منقضٍ يُؤخذ");
check(holdsLease({ leaseOwner: "a", version: 4 }, "a", 4) && !holdsLease({ leaseOwner: "a", version: 5 }, "a", 4) && !holdsLease({ leaseOwner: "b", version: 4 }, "a", 4), "L5 الكتابةُ مشروطةٌ بالمالك والإصدار");
const w = leaseWriteFields({ version: 4 }, "a", t0, false), r = leaseWriteFields({ version: 4 }, "a", t0, true);
check(w.version === 5 && w.leaseOwner === "a" && r.version === 5 && r.leaseOwner === null && r.leaseUntil === 0, "L6 الكتابةُ تجدّد الإيجار والتحريرُ يُسقطه");
/* محاكاة خطوتين متزامنتين فوق «وثيقة» واحدة: الثانيةُ تخسر، وكتابةُ الخاسرة تُرفض، والإلغاءُ لا يُكتب فوقه running */
{
  const doc: any = { version: 0, status: "running" };
  const take = (owner: string) => { const p = planLeaseTake(doc, owner, t0); if (p.ok) Object.assign(doc, p.next); return p.ok; };
  const commit = (owner: string, version: number, patch: any) => { if (!holdsLease(doc, owner, version)) return false; Object.assign(doc, patch, leaseWriteFields(doc, owner, t0, false)); return true; };
  check(take("A") && !take("B"), "L7 خطوتان متزامنتان: إحداهما فقط تأخذ الإيجار");
  const vA = doc.version;
  doc.leaseUntil = t0 - 1;           // انقضى إيجارُ A (خطوةٌ متأخرة)
  check(take("C"), "L8 الإيجارُ المنقضي يتيح استحواذ خطوةٍ جديدة");
  check(commit("C", doc.version, { status: "abandoned" }) && doc.status === "abandoned", "L9 الإلغاءُ (C) يكتب حالته");
  check(!commit("A", vA, { status: "running" }) && doc.status === "abandoned", "L10 كتابةُ الخطوة المتأخرة تُرفض فلا تُكتب running فوق abandoned");
}
/* K: قفلُ الخزنة */
const lockA = { jobId: "A", kind: "reset" as const, takenAt: "x" };
check(planLockTake(null, null, "A") === "take" && planLockTake(lockA, "running", "B") === "refuse" && planLockTake(lockA, "failed", "B") === "refuse", "K1 بدآن متزامنان: الثاني يُرفض ما دامت المهمة المُمسِكة مفتوحة");
check(planLockTake(lockA, "ready", "B") === "take" && planLockTake(lockA, "abandoned", "B") === "take" && planLockTake(lockA, null, "B") === "take", "K2 قفلٌ يتيم لمهمةٍ منتهية أو مفقودة يُستعاد");
check(planLockTake(lockA, "running", "A") === "take", "K3 المهمةُ نفسها لا تُرفض");
check(planLockVerify(lockA, "A") === "ok" && planLockVerify(lockA, "B") === "refuse" && planLockVerify(null, "B") === "adopt", "K4 الخطوةُ والإلغاءُ يتحققان من القفل (غيابُه لمهمةٍ قديمة يُتبنّى)");
check(isTerminalVaultStatus("ready") && isTerminalVaultStatus("abandoned") && isTerminalVaultStatus(undefined) && !isTerminalVaultStatus("failed"), "K5 المنتهيةُ لا تُمسك القفل");
/* E: طردُ نقاط الاستعادة */
{
  const pts = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, createdAt: `2026-01-0${9 - i}`, consumedAt: i >= 1 && i <= 7 ? "c" : undefined })); // p0 أحدث، p1..p7 مستهلكة، p8 (الأقدم) هدفُ التراجع
  const drop = pickRestorePointEvictions(pts, 8, ["p8"]);
  check(drop.length === 1 && drop[0] === "p7", "E1 الهدفُ المحميُّ لا يُطرد ولو كان الأقدم، وتُطرد المستهلكةُ الأقدم قبل غيرها");
  check(pickRestorePointEvictions(pts, 8, []).join() === "p7", "E2 بلا حماية تُطرد المستهلكةُ أولاً (لا الأقدمُ غيرُ المستهلكة)");
  check(pickRestorePointEvictions(pts.slice(0, 8), 8, []).length === 0, "E3 ثمانيةٌ فما دون لا يُطرد منها شيء");
  check(!pickRestorePointEvictions(pts, 8, ["p8", "p0", "p7"]).includes("p7") && pickRestorePointEvictions(pts, 8, ["p8", "p0", "p7"]).length === 1, "E4 حمايةُ عدةِ معرّفاتٍ تُحترم والعددُ المطلوب يُطرد من الباقي");
}
/* R: مرحلةُ العودة المتدرجة */
const rc = (phase: any, rollbackIndex: number, rollbackLength: number, status: any = "running") => ({ status, phase, nextIndex: 0, queueLength: 0, rollbackIndex, rollbackLength });
check(nextOpAction(rc("rollback", 0, 3)) === "rollback" && nextOpAction(rc("rollback", 3, 3)) === "rollback-finalize" && nextOpAction(rc("rollback", 0, 0)) === "rollback-finalize", "R1 العودةُ مجموعةً في الخطوة ثم إتمام");
check(nextOpAction(rc("rollback", 1, 3, "failed")) === "rollback" && nextOpAction(rc("rollback", 3, 3, "abandoned")) === "done", "R2 المتوقفةُ تُستأنف والملغاةُ لا تتقدّم");
check(opTouchedData({ phase: "rollback", restorePointId: "x" }, false), "R3 إلغاءٌ ثانٍ أثناء العودة لا يُعدّ «بلا تغيير»");
/* M: بوابةُ الصيانة */
const gate = (method: string, path: string, isRoot = false, open = true) => maintenanceRefuses({ method, path, isRoot, open });
check(gate("POST", "/schedules") && gate("PUT", "/x") && gate("PATCH", "/x") && gate("DELETE", "/x"), "M1 الكتابةُ العادية تُرفض أثناء المهمة المفتوحة");
check(!gate("GET", "/schedules") && !gate("HEAD", "/schedules") && !gate("OPTIONS", "/schedules"), "M2 القراءاتُ تمرّ");
check(!gate("POST", "/schedules", true) && !gate("POST", "/system-backup/op-jobs/1/step") && !gate("POST", "/auth/login") && !gate("POST", "/telemetry/client"), "M3 الحسابُ الرئيسي ومسارات الخزنة والدخول والقياس تمرّ");
check(!gate("POST", "/schedules", false, false), "M4 لا مهمةَ مفتوحة ⇒ لا رفض");
const flagChecks = async () => {
  let n = 0, clock = 0, value = true;
  const flag = createOpenVaultFlag({ now: () => clock, ttlMs: 5000, read: async () => { n += 1; if (value === null as any) throw new Error("x"); return value; } });
  await flag.get(); await flag.get(); await flag.get();
  check(n === 1, "M5 العلَمُ مخبَّأ: قراءةٌ واحدة داخل المدة");
  clock += 5001; value = false; await flag.get();
  check(n === 2 && (await flag.get()) === false, "M6 بعد خمس ثوانٍ قراءةٌ واحدة جديدة");
  flag.set(true);
  check((await flag.get()) === true && n === 2, "M7 النسخةُ التي بدأت المهمة تعرفها فوراً");
  clock += 5001; value = null as any;
  check((await flag.get()) === true, "M8 فشلُ القراءة لا يغيّر العلَم (لا يُغلق النظام ولا يفتحه فجأة)");
};

check(isOpenVaultStatus("running") && isOpenVaultStatus("failed") && !isOpenVaultStatus("ready") && !isOpenVaultStatus("abandoned"), "P17 المفتوحةُ تسدّ الخزنة");

/* G */
(async () => {
  await flagChecks();
  let now = 1_000_000, reads = 0, changed = 0, value: number | null = 5, boom = false;
  const watcher = createGenerationWatcher({
    now: () => now, ttlMs: 10_000,
    read: async () => { reads += 1; if (boom) throw new Error("down"); return value; },
    onChanged: () => { changed += 1; },
  });
  await watcher.refreshIfDue();
  check(reads === 1 && changed === 0, "G1 أولُ قراءةٍ تسجّل الجيل ولا تمسح");
  await watcher.refreshIfDue(); await watcher.refreshIfDue();
  check(reads === 1, "G2 داخل المدة لا قراءةَ جديدة (لا قراءةَ لكل طلب)");
  now += 10_001; value = 5;
  await watcher.refreshIfDue();
  check(reads === 2 && changed === 0, "G3 بعد المدة قراءةٌ واحدة والجيلُ نفسه فلا مسح");
  now += 10_001; value = 6;
  await watcher.refreshIfDue();
  check(reads === 3 && changed === 1, "G4 تغيّر الجيل فمُسحت الذاكرة مرةً واحدة");
  now += 10_001; value = 3;
  await watcher.refreshIfDue();
  check(changed === 2, "G5 رجوعُ العدّاد (استعادة نسخة) يُعدّ تغييراً أيضاً");
  now += 10_001; boom = true;
  await watcher.refreshIfDue();
  check(changed === 3, "G6 تعذّرُ القراءة يمسح احتياطاً");
  await watcher.refreshIfDue();
  check(reads === 5, "G7 بعد الفشل تنتظر المدةَ قبل المحاولة التالية");
  boom = false; now += 10_001; value = 3;
  let concurrent = 0;
  const slow = createGenerationWatcher({ now: () => now, read: async () => { concurrent += 1; await new Promise(r => setTimeout(r, 5)); return 1; }, onChanged: () => {} });
  await Promise.all([slow.refreshIfDue(), slow.refreshIfDue(), slow.refreshIfDue()]);
  check(concurrent === 1, "G8 الطلباتُ المتزامنة تنتظر قراءةً واحدة");
  let nullReads = 0, nullChanged = 0;
  const off = createGenerationWatcher({ now: () => now, read: async () => { nullReads += 1; return null; }, onChanged: () => { nullChanged += 1; } });
  await off.refreshIfDue(); await off.refreshIfDue();
  check(nullChanged === 0 && nullReads === 2, "G9 التجريبي والمحلي (null): لا مسح ولا حالة");
  check(IDENTITY_GENERATION_TTL_MS === 10_000, "G10 المدة القصوى للتقادم 10 ثوانٍ");
  check(isGenerationReadDue(null, 5, 10) && !isGenerationReadDue(5, 9, 10) && isGenerationReadDue(5, 15, 10) && isGenerationReadDue(50, 20, 10), "G11 متى تحين القراءة (وساعةٌ رجعت للوراء)");
  check(classifyGenerationReading(null, 1) === "first" && classifyGenerationReading(1, 1) === "same" && classifyGenerationReading(1, 2) === "changed", "G12 تصنيفُ القراءة");

  /* قراءةٌ معلّقة: مهلةٌ ثم مسحٌ احتياطاً (فشلٌ مغلق) بدل تعليق كل طلب */
  {
    let cleared = 0, hang = true, v: number | null = 7, calls = 0;
    const gw = createGenerationWatcher({ now: () => now, ttlMs: 10, readTimeoutMs: 20, read: () => { calls += 1; return hang ? new Promise<number | null>(() => {}) : Promise.resolve(v); }, onChanged: () => { cleared += 1; } });
    const started = Date.now();
    await gw.refreshIfDue();
    check(cleared === 1 && Date.now() - started < 1000, "G13 قراءةٌ معلّقة تنتهي بالمهلة وتمسح الذاكرة (لا تعلّق الطلب)");
    hang = false; now += 11; v = 7;
    await gw.refreshIfDue();
    check(cleared === 2 && calls === 2, "G14 أولُ قراءةٍ ناجحة بعد فشلٍ تُعدّ تغييراً (لا يفوت تغييرٌ في الفجوة)");
    now += 11;
    await gw.refreshIfDue();
    check(cleared === 2, "G15 وبعدها تعود المقارنةُ العادية (نفسُ الجيل لا يمسح)");
    const fresh = createGenerationWatcher({ now: () => now, ttlMs: 10, read: async () => { throw new Error("down"); }, onChanged: () => { cleared += 1; } });
    await fresh.refreshIfDue();
    check(cleared === 3, "G16 فشلُ أول قراءةٍ يمسح كذلك");
    let late = false;
    try { await withTimeout(new Promise(() => {}), 10); } catch { late = true; }
    check(late, "G17 withTimeout يرفض عند انقضاء المهلة");
  }

  /* W */
  const repo = read("src/db/repository.ts"), routes = read("src/server/routes/adminRoutes.ts"), ui = read("src/components/AdminUsers.tsx"), auth = read("src/server/core/auth.ts");
  for (const verb of ['app.post("/api/system-backup/reset"', 'app.post("/api/system-backup/undo"', 'app.get("/api/system-backup/op-jobs/:id"', 'app.post("/api/system-backup/op-jobs/:id/step"', 'app.delete("/api/system-backup/op-jobs/:id"']) {
    const at = routes.indexOf(verb);
    check(at > 0 && /requireAuth, requireRootAdmin/.test(routes.slice(at, at + 140)), `W1 ${verb.slice(4, 60)} للحساب الرئيسي وحده`);
  }
  check(routes.includes("FULL-SYSTEM-RESET") && routes.includes("RESET_PHRASE") && routes.includes("FULL-SYSTEM-UNDO") && routes.includes("UNDO_PHRASE") && routes.includes("FULL-SYSTEM-OP-ABANDON"), "W2 العباراتُ والتأكيداتُ ما زالت في الخادم");
  check(!routes.includes("Repository.resetSystem(") && !routes.includes("Repository.undoLastSystemOperation(") && !/resetSystem: async|undoLastSystemOperation: async/.test(repo), "W3 لا طلبَ واحداً طويلاً بعد اليوم");
  check(routes.includes("latestOperation") && routes.includes("getLatestSystemOpJob"), "W4 الحالةُ تحمل آخر عملية");
  check(/SYSTEM_OP_JOB_COLLECTION, SYSTEM_VAULT_LOCK_COLLECTION, "sessions"/.test(repo) && repo.includes('SYSTEM_OP_JOB_COLLECTION = "_systemOpJobs"') && repo.includes('SYSTEM_VAULT_LOCK_COLLECTION = "_systemVaultLock"'), "W5 مجموعةُ المهام ووثيقةُ القفل خارج النسخ والتصفير");
  check(/async function startSystemOpJob[\s\S]*assertNoOpenVaultJob[\s\S]*startSystemExportJob\(byUserId, rootAdminId, true, "safety"\)/.test(repo), "W6 البدءُ يرفض المهمةَ المفتوحة ويحفظ نقطةَ أمان");
  check(/async function createSystemImportJob[\s\S]{0,900}latestSystemOpJob/.test(repo) && /async function startSystemImportJob[\s\S]{0,300}takeVaultLock\(id, "import"\)/.test(repo), "W7 الاستيرادُ يرفض البدء فوق تصفيرٍ أو تراجعٍ مفتوح (وبالقفل)");
  check(/async function abandonSystemOpJob[\s\S]*loadSystemRestorePoint\(String\(row\.restorePointId\)[\s\S]*markRestorePointConsumed/.test(repo), "W8 الإلغاءُ يعيد النظامَ من نقطة أمان المهمة");
  check(/kind === "undo" && row\.targetRestorePointId[\s\S]*markRestorePointConsumed\(row\.targetRestorePointId\)[\s\S]*markOpenImportJobAbandoned/.test(repo), "W9 التراجعُ يستهلك هدفه ويلغي الاستيراد المعلّق");
  check(/OP_LABEL[\s\S]*قبل التراجع — نقطة إعادة/.test(repo), "W10 نقطةُ أمان التراجع تعمل إعادةً (redo)");
  check(ui.includes("driveOpJob") && ui.includes("/api/system-backup/op-jobs/") && ui.includes("FULL-SYSTEM-OP-ABANDON") && ui.includes("استكمال التصفير") && ui.includes("استكمال التراجع"), "W11 الواجهة: متابِعٌ واستكمالٌ وإلغاء");
  check(/opRunner\.current \+= 1;\s*setBackupBusy\(null\)/.test(ui), "W12 مغادرةُ الشاشة توقف متابِع العملية");
  check(ui.includes("opProgressBlock(\"reset\")") && ui.includes("opProgressBlock(\"undo\")") && ui.includes("latestOperation"), "W13 شريطُ تقدّم لكلٍّ من التصفير والتراجع");
  check(read("src/utils/vaultPhrases.ts").includes("تصفير النظام") && read("src/utils/vaultPhrases.ts").includes("تراجع كامل"), "W14 العباراتُ كما هي");
  check(repo.includes("async function advanceSystemImportJob") && repo.includes("async function abandonSystemImportJob") && routes.includes("import-jobs/:id/step"), "W15 الاستيرادُ سليم");
  check(repo.includes("IDENTITY_GENERATION_DOC") && /function announceIdentityChange\(\): Promise<void> \{[\s\S]*publishSharedIdentityChange\(\)/.test(repo) && /async function publishSharedIdentityChange[\s\S]*withTimeout\(bumpSharedIdentityGeneration\(\)/.test(repo), "W16 إعلانُ التغيير يزيد العدّاد المشترك بمهلة قصيرة");
  check(/async function bumpSharedIdentityGeneration[\s\S]*if \(!firestoreDb \|\| demoSandboxContext\.getStore\(\)\) return;/.test(repo) && /async function readSharedIdentityGeneration[\s\S]*return null;/.test(repo), "W17 لا أثرَ في التجريبي والمحلي");
  check(repo.includes("function noteForeignIdentityChange() { identityGeneration += 1;"), "W18 تغييرٌ من نسخةٍ أخرى يرفع الجيل المحلي (يمنع حفظَ قراءةٍ سبقته)");
  check(auth.includes("createGenerationWatcher") && /isDemoRequest\(\)\) await identitySync\.refreshIfDue\(\)/.test(auth) && auth.indexOf("identitySync.refreshIfDue") < auth.indexOf("authCache.get(sessionId)"), "W19 يُفحص الجيلُ قبل قراءة ذاكرة الهويات");
  check(auth.includes("Repository.identityGeneration() === generationAtRead"), "W20 العدّاد المحلي الذي يمنع حفظ قراءةٍ قديمة باقٍ");

  /* W21+ إصلاحات المراجعة */
  const planner = read("src/server/vaultJobPlanner.ts"), server = read("server.ts");
  check(/finally \{ await announceIdentityChange\(\); \}/.test(repo) && !/void bumpSharedIdentityGeneration/.test(repo), "W21 المسارُ بعد الكتابة ينتظر نشر الجيل (لا fire-and-forget)");
  check(read("src/server/seats.ts").includes("await Repository.notifyIdentityChanged()"), "W22 كاتبُ دفتر الكراسي ينتظر النشر");
  check(/"_meta"\]\);/.test(repo) && repo.includes("parts[0] === \"_meta\"") && /async function applyResetCollection[\s\S]{0,300}SYSTEM_EXPORT_EXCLUDED_COLLECTIONS\.has\(name\)\) return;/.test(repo), "W23 «_meta» مستثناة من التصدير والتصفير والاستعادة، والنسخُ القديمة التي تحويها تُقبل");
  check(/raiseCountersToData\(\)/.test(repo) && /action === "rollback-finalize"[\s\S]{0,200}raiseCountersToData/.test(repo) && /if \(row\.kind === "reset"\) await finalizeResetCounters\(rootAdminId\);\s*else await raiseCountersToData\(\)/.test(repo), "W24 العدّاداتُ تُضبط في الإتمام وحده (التصفير بالدالة الحالية وغيرُه برفعها)");
  check(/async function acquireJobLease/.test(repo) && /runTransaction\(async tx => \{\s*const \[snap, lockSnap\]/.test(repo) && /async function commitJobRow[\s\S]*holdsLease\(stored, owner/.test(repo), "W26 الإيجارُ في معاملة وكل كتابةٍ مشروطة");
  check(!/writeOpJobRecord\(row\);\s*return opJobSummary\(row\);\s*\}\s*\n\s*if \(action/.test(repo) && (repo.match(/await writeOpJobRecord\(/g) || []).length === 1, "W27 وثيقةُ المهمة لا تُكتب بلا شرط إلا عند الإنشاء");
  check(/async function advanceSystemOpJob[\s\S]*acquireJobLease<SystemOpJobRecord>[\s\S]*busy: true/.test(repo) && /async function advanceSystemImportJob[\s\S]*acquireJobLease<SystemImportJobRecord>[\s\S]*busy: true/.test(repo), "W28 خطوةُ التصفير والاستيراد تأخذ الإيجار وتعود busy");
  check(/async function abandonSystemOpJob[\s\S]*acquireJobLease[\s\S]*VaultJobConflict\([^)]*"busy"\)/.test(repo) && /async function abandonSystemImportJob[\s\S]*acquireJobLease[\s\S]*VaultJobConflict\([^)]*"busy"\)/.test(repo), "W29 الإلغاءُ يأخذ الإيجارَ ويُرفض برسالةٍ واضحة أثناء خطوةٍ جارية");
  check(/async function startSystemOpJob[\s\S]{0,300}takeVaultLock\(id, kind\)[\s\S]{0,400}releaseVaultLock\(id\)/.test(repo) && (repo.match(/await releaseVaultLock\(row\.id\)/g) || []).length >= 5, "W30 القفلُ يُؤخذ عند البدء ويُحرَّر عند كل حالةٍ نهائية");
  check(/phase: "rollback" as const[\s\S]*rollbackQueue/.test(repo) && /action === "rollback"[\s\S]*applyImportedCollection\(name/.test(repo), "W31 الإلغاءُ على Firestore مرحلةُ rollback متدرجة (والمحلي استبدالٌ واحد)");
  check(/createSystemRestorePointFromExport\([\s\S]{0,200}protectIds: string\[\] = \[\]/.test(repo) && /pickRestorePointEvictions\(/.test(repo) && !/docs\.slice\(8\)/.test(repo), "W32 الطردُ يستثني هدفَ المهمة ونقطةَ الأمان الجديدة");
  check(/const already = \(await listSystemRestorePoints\(\)\)\.find\(point => point\.exportJobId === exportJobId\)/.test(repo), "W33 تصدير أمانٍ واحد لا ينتج نقطتين");
  check(/safety\.status === "failed"\) \{[\s\S]{0,260}row\.status = "failed"/.test(repo), "W34 فشلُ تصدير الأمان يجعل المهمة failed");
  check(routes.includes("vaultConflicts(") && routes.includes("VaultJobConflict") && (routes.match(/vaultConflicts\(async/g) || []).length === 7, "W35 تعارضاتُ الخزنة 409 برسالتها على سبعة مسارات");
  check(/maintenanceRefuses\(\{ method: req\.method/.test(server) && server.indexOf("maintenanceRefuses({") > server.indexOf("DEMO_READ_ONLY_PREFIXES.some") && server.indexOf("maintenanceRefuses({") < server.indexOf("roleWriteDecision({"), "W36 بوابةُ الصيانة بعد حارس التجربة وقبل حارس الأدوار");
  check(/status\(503\)\.json\(\{ error: VAULT_MAINTENANCE_MESSAGE/.test(server) && planner.includes("النظام في صيانة: عملية نسخٍ احتياطي جارية"), "W37 الرفضُ 503 بالرسالة المطلوبة");
  check(/hasOpenVaultJob: \(\): Promise<boolean>/.test(repo) && /async function hasOpenVaultJob[\s\S]{0,120}if \(opJobIsLocal\(\)\) return false/.test(repo), "W38 لا أثرَ للبوابة في التجريبي والمحلي");
  check(ui.includes("job.busy") && ui.includes("خطوة جارية…") && ui.includes("result.rollingBack") && ui.includes('"rollback"'), "W39 الواجهة: busy وعودةٌ متدرجة");

  console.log(failed ? `\n${failed} فحصاً فشل` : "\nكل الفحوص نجحت");
  process.exit(failed ? 1 : 0);
})();
