/**
 * ── الخزنة: التصفير والتراجع الكامل مهمّتان متدرجتان + إبطال الهوية بين النُّسخ ──
 *
 *  P  مخطِّط الخطوات (src/server/vaultJobPlanner.ts): القائمة، الخطوة التالية، التقدّم، إعادة المحاولة.
 *  G  منطق تحديث الجيل المشترك (src/server/identityGeneration.ts) بساعةٍ وهمية.
 *  W  توصيل المسارات والواجهة والمستودع (فحصٌ ساكن). لا خادم ولا قاعدة بيانات.
 */
import fs from "fs";
import {
  isOpenVaultStatus, nextOpAction, opProgressPercent, opRetryOutcome, opTotalUnits, opTouchedData, planResetQueue, planUndoQueue, VAULT_OP_MAX_RETRIES,
} from "../src/server/vaultJobPlanner";
import { classifyGenerationReading, createGenerationWatcher, IDENTITY_GENERATION_TTL_MS, isGenerationReadDue } from "../src/server/identityGeneration";

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
check(isOpenVaultStatus("running") && isOpenVaultStatus("failed") && !isOpenVaultStatus("ready") && !isOpenVaultStatus("abandoned"), "P17 المفتوحةُ تسدّ الخزنة");

/* G */
(async () => {
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

  /* W */
  const repo = read("src/db/repository.ts"), routes = read("src/server/routes/adminRoutes.ts"), ui = read("src/components/AdminUsers.tsx"), auth = read("src/server/core/auth.ts");
  for (const verb of ['app.post("/api/system-backup/reset"', 'app.post("/api/system-backup/undo"', 'app.get("/api/system-backup/op-jobs/:id"', 'app.post("/api/system-backup/op-jobs/:id/step"', 'app.delete("/api/system-backup/op-jobs/:id"']) {
    const at = routes.indexOf(verb);
    check(at > 0 && /requireAuth, requireRootAdmin/.test(routes.slice(at, at + 140)), `W1 ${verb.slice(4, 60)} للحساب الرئيسي وحده`);
  }
  check(routes.includes("FULL-SYSTEM-RESET") && routes.includes("RESET_PHRASE") && routes.includes("FULL-SYSTEM-UNDO") && routes.includes("UNDO_PHRASE") && routes.includes("FULL-SYSTEM-OP-ABANDON"), "W2 العباراتُ والتأكيداتُ ما زالت في الخادم");
  check(!routes.includes("Repository.resetSystem(") && !routes.includes("Repository.undoLastSystemOperation(") && !/resetSystem: async|undoLastSystemOperation: async/.test(repo), "W3 لا طلبَ واحداً طويلاً بعد اليوم");
  check(routes.includes("latestOperation") && routes.includes("getLatestSystemOpJob"), "W4 الحالةُ تحمل آخر عملية");
  check(repo.includes("SYSTEM_OP_JOB_COLLECTION, \"sessions\"") && repo.includes('SYSTEM_OP_JOB_COLLECTION = "_systemOpJobs"'), "W5 مجموعةُ المهام خارج النسخ والتصفير");
  check(/async function startSystemOpJob[\s\S]*assertNoOpenVaultJob[\s\S]*startSystemExportJob\(byUserId, rootAdminId, true, "safety"\)/.test(repo), "W6 البدءُ يرفض المهمةَ المفتوحة ويحفظ نقطةَ أمان");
  check(/async function startSystemImportJob[\s\S]{0,700}latestSystemOpJob/.test(repo), "W7 الاستيرادُ يرفض البدء فوق تصفيرٍ أو تراجعٍ مفتوح");
  check(/async function abandonSystemOpJob[\s\S]*loadSystemRestorePoint\(String\(row\.restorePointId\)[\s\S]*markRestorePointConsumed/.test(repo), "W8 الإلغاءُ يعيد النظامَ من نقطة أمان المهمة");
  check(/kind === "undo" && row\.targetRestorePointId[\s\S]*markRestorePointConsumed\(row\.targetRestorePointId\)[\s\S]*markOpenImportJobAbandoned/.test(repo), "W9 التراجعُ يستهلك هدفه ويلغي الاستيراد المعلّق");
  check(/OP_LABEL[\s\S]*قبل التراجع — نقطة إعادة/.test(repo), "W10 نقطةُ أمان التراجع تعمل إعادةً (redo)");
  check(ui.includes("driveOpJob") && ui.includes("/api/system-backup/op-jobs/") && ui.includes("FULL-SYSTEM-OP-ABANDON") && ui.includes("استكمال التصفير") && ui.includes("استكمال التراجع"), "W11 الواجهة: متابِعٌ واستكمالٌ وإلغاء");
  check(/opRunner\.current \+= 1;\s*setBackupBusy\(null\)/.test(ui), "W12 مغادرةُ الشاشة توقف متابِع العملية");
  check(ui.includes("opProgressBlock(\"reset\")") && ui.includes("opProgressBlock(\"undo\")") && ui.includes("latestOperation"), "W13 شريطُ تقدّم لكلٍّ من التصفير والتراجع");
  check(read("src/utils/vaultPhrases.ts").includes("تصفير النظام") && read("src/utils/vaultPhrases.ts").includes("تراجع كامل"), "W14 العباراتُ كما هي");
  check(repo.includes("async function advanceSystemImportJob") && repo.includes("async function abandonSystemImportJob") && routes.includes("import-jobs/:id/step"), "W15 الاستيرادُ سليم");
  check(repo.includes("IDENTITY_GENERATION_DOC") && /function announceIdentityChange\(\) \{[\s\S]*bumpSharedIdentityGeneration\(\)/.test(repo), "W16 إعلانُ التغيير يزيد العدّاد المشترك");
  check(/async function bumpSharedIdentityGeneration[\s\S]*if \(!firestoreDb \|\| demoSandboxContext\.getStore\(\)\) return;/.test(repo) && /async function readSharedIdentityGeneration[\s\S]*return null;/.test(repo), "W17 لا أثرَ في التجريبي والمحلي");
  check(repo.includes("function noteForeignIdentityChange() { identityGeneration += 1;"), "W18 تغييرٌ من نسخةٍ أخرى يرفع الجيل المحلي (يمنع حفظَ قراءةٍ سبقته)");
  check(auth.includes("createGenerationWatcher") && /isDemoRequest\(\)\) await identitySync\.refreshIfDue\(\)/.test(auth) && auth.indexOf("identitySync.refreshIfDue") < auth.indexOf("authCache.get(sessionId)"), "W19 يُفحص الجيلُ قبل قراءة ذاكرة الهويات");
  check(auth.includes("Repository.identityGeneration() === generationAtRead"), "W20 العدّاد المحلي الذي يمنع حفظ قراءةٍ قديمة باقٍ");

  console.log(failed ? `\n${failed} فحصاً فشل` : "\nكل الفحوص نجحت");
  process.exit(failed ? 1 : 0);
})();
