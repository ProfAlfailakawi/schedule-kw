/**
 * ── «سلامة النظام» ───────────────────────────────────────────────────────────
 *  U  المنطق النقيّ (src/utils/systemHealth.ts): عتبات النسخ، الخزنة، البوابة، الهوية، الفصل، أسوأ الحالات، عزل الفحص الفاشل.
 *  P  الخصوصية: الحمولةُ رموزٌ وأعداد، بلا أسماء ولا معرّفات ولا بريد.
 *  S  التوصيل: المسارُ بحارس الجذر، وهو في جدول adminRoutes، والمحطةُ في الشريط والتطبيق، وبلا مسار كتابة.
 */
import fs from "node:fs";
import path from "node:path";
import {
  BACKUP_OK_DAYS, BACKUP_WARN_DAYS, HEALTH_CACHE_MS, IDENTITY_STALE_SECONDS, RADAR_STALE_HOURS, VAULT_STALE_MS,
  backupCard, buildPayload, demoCards, failedCard, gateCard, identityCard, runProbes, termCard, vaultCard, worstOf, type HealthCard,
} from "../src/utils/systemHealth";
import { VAULT_GATE_IDLE_MS } from "../src/server/vaultJobPlanner";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const NOW = Date.parse("2026-11-14T10:00:00Z");
const ago = (days: number, extraMs = 0) => new Date(NOW - days * 86_400_000 - extraMs).toISOString();

/* ── U: النسخ الاحتياطي ── */
check(BACKUP_OK_DAYS === 7 && BACKUP_WARN_DAYS === 14, "عتبتان فقط: ٧ و١٤ يوماً");
check(backupCard({ latestExportAt: ago(0, 3600_000) }, NOW).state === "ok", "نسخةُ اليوم: أخضر");
check(backupCard({ latestExportAt: ago(7) }, NOW).state === "ok", "٧ أيام: أخضر");
check(backupCard({ latestExportAt: ago(8) }, NOW).state === "warn", "٨ أيام: عنبري");
check(backupCard({ latestExportAt: ago(14) }, NOW).state === "warn", "١٤ يوماً: عنبري");
check(backupCard({ latestExportAt: ago(15) }, NOW).state === "bad", "١٥ يوماً: أحمر");
check(backupCard({}, NOW).state === "bad" && backupCard({}, NOW).code === "none", "لا نسخة: أحمر");
check(backupCard({ latestExportAt: ago(30), latestRestorePointAt: ago(2) }, NOW).value === 2, "الأحدثُ من التصدير ونقطة الاستعادة هو المحسوب");
check(backupCard({ latestExportAt: "غير تاريخ" }, NOW).state === "bad", "تاريخٌ فاسد لا يُعدّ نسخة");

/* ── U: الخزنة ── */
check(vaultCard([], NOW).state === "ok" && vaultCard([{ kind: "reset", status: "ready" }, null], NOW).code === "idle", "لا مهمةَ مفتوحة: أخضر (الجاهزة والملغاة لا تُعدّ)");
const running = { kind: "reset" as const, status: "running", phase: "apply", restorePointId: "rp1", updatedAt: new Date(NOW - 1000).toISOString(), completedUnits: 3, totalUnits: 12 };
check(vaultCard([running], NOW).state === "warn" && vaultCard([running], NOW).value === 25, "مفتوحة وتعمل: عنبري مع نسبة التقدم");
check(vaultCard([{ ...running, status: "failed" }], NOW).state === "bad" && vaultCard([{ ...running, status: "failed" }], NOW).code === "failedTouched", "فشلت بعد مسّ البيانات: أحمر");
check(vaultCard([{ ...running, status: "failed", phase: "safety" }], NOW).state === "warn", "فشلت في مرحلة الأمان قبل أي كتابة: عنبري لا أحمر");
check(vaultCard([{ kind: "import", status: "running", phase: "safety", updatedAt: new Date(NOW - VAULT_STALE_MS - 1).toISOString() }], NOW).code === "stale", "تعمل بلا حركةٍ ولم تمسّ البيانات: قفلٌ عالق");
check(vaultCard([{ kind: "import", status: "running", phase: "apply", restorePointId: "x", updatedAt: new Date(NOW - VAULT_STALE_MS * 5).toISOString() }], NOW).code === "open", "بعد مسّ البيانات لا تُعدّ عالقة (البوابة تبقى مغلقة)");
check(vaultCard([{ ...running, status: "failed", kind: "undo" }, { kind: "import", status: "running", phase: "safety", updatedAt: new Date(NOW).toISOString() }], NOW).code === "failedTouched", "الفاشلةُ بعد المسّ تتقدم على غيرها");
check(VAULT_STALE_MS === VAULT_GATE_IDLE_MS, "مدةُ «العالق» هي مدةُ بوابة الصيانة نفسها");

/* ── U: البوابة والهوية والفصل ── */
check(gateCard(true).state === "bad" && gateCard(false).state === "ok", "البوابة: مغلقة أحمر، مفتوحة أخضر");
check(identityCard({ readable: false, shared: true, lastCheckedAt: NOW }, NOW).state === "bad", "وثيقة الجيل غير مقروءة: أحمر");
check(identityCard({ readable: true, shared: true, lastCheckedAt: NOW - 5000 }, NOW).value === 5, "ثوانٍ منذ آخر فحص");
check(identityCard({ readable: true, shared: true, lastCheckedAt: NOW - (IDENTITY_STALE_SECONDS + 1) * 1000 }, NOW).state === "warn", "فحصٌ قديم جداً: عنبري");
check(identityCard({ readable: true, shared: false, lastCheckedAt: null }, NOW).state === "ok", "بلا مشاركة (محلي): أخضر");
check(termCard({ hasTerm: true, frozen: true }, NOW).code === "frozen" && termCard({ hasTerm: true, frozen: true }, NOW).state === "warn", "الفصل الجاري المجمّد: عنبري");
check(termCard({ hasTerm: true, frozen: false }, NOW).state === "ok", "مفتوح بلا تشغيل رادار: أخضر");
check(termCard({ hasTerm: true, frozen: false, radarRanAt: new Date(NOW - 3600_000).toISOString() }, NOW).state === "ok", "رادارٌ حديث: أخضر");
check(termCard({ hasTerm: true, frozen: false, radarRanAt: new Date(NOW - 3600_000).toISOString(), radarStale: true }, NOW).code === "radarStale", "علَمُ الرادار stale نفسُه يُعتمد");
check(termCard({ hasTerm: true, frozen: false, radarRanAt: new Date(NOW - (RADAR_STALE_HOURS + 1) * 3600_000).toISOString() }, NOW).state === "warn", "رادارٌ أقدمُ من العتبة: عنبري");
check(termCard({ hasTerm: false, frozen: false }, NOW).state === "warn", "لا فصل جارٍ: عنبري");

/* ── U: أسوأ الحالات وعزل الفحص ── */
check(worstOf([]) === "ok" && worstOf(["ok", "ok"]) === "ok", "كلها خضراء: سليم");
check(worstOf(["ok", "warn", "ok"]) === "warn" && worstOf(["warn", "bad", "ok"]) === "bad", "الأسوأ يحكم اللافتة");
check(worstOf(["ok", "unknown"]) === "warn", "بطاقةٌ تعذّرت قراءتها لا تجعل اللافتة «سليمة»");
const cards = await runProbes([
  { id: "backup", run: () => backupCard({ latestExportAt: ago(1) }, NOW) },
  { id: "vault", run: async () => { throw new Error("boom"); } },
  { id: "gate", run: () => { throw new Error("sync boom"); } },
  { id: "identity", run: () => identityCard({ readable: true, shared: false, lastCheckedAt: null }, NOW) },
]);
check(cards.length === 4 && cards[0].state === "ok" && cards[3].state === "ok", "فحصٌ فاشلٌ لا يمسّ البطاقات الأخرى");
check(cards[1].state === "unknown" && cards[1].code === "failed" && cards[2].state === "unknown", "الفاشل (متزامناً أو لا) رماديّ لا يُسقط الصفحة");
check(JSON.stringify(cards[1]) === JSON.stringify(failedCard("vault")), "بطاقةُ الفشل ثابتةُ الشكل");
check(buildPayload(cards, NOW, false).overall === "warn", "حمولةٌ فيها فشلٌ وخضراء: «يحتاج انتباهاً»");
check(demoCards().every(card => card.state === "ok") && buildPayload(demoCards(), NOW, true).demo === true && demoCards().length === 5, "التجريبي: خمس بطاقات آمنة موسومة");
check(HEALTH_CACHE_MS <= 10_000, "التخبئة ≤ ١٠ ثوانٍ");

/* ── P: الخصوصية ── */
const sample: HealthCard[] = [
  backupCard({ latestExportAt: ago(3) }, NOW), vaultCard([running], NOW), gateCard(false), identityCard({ readable: true, shared: true, lastCheckedAt: NOW }, NOW),
  termCard({ hasTerm: true, frozen: false, radarRanAt: ago(0) }, NOW),
];
const json = JSON.stringify(buildPayload(sample, NOW, false));
const allowedKeys = new Set(["generatedAt", "demo", "overall", "cards", "id", "state", "code", "value", "unit", "detail"]);
const keysOf = (value: unknown, out: string[] = []): string[] => {
  if (Array.isArray(value)) value.forEach(item => keysOf(item, out));
  else if (value && typeof value === "object") for (const [key, inner] of Object.entries(value)) { out.push(key); keysOf(inner, out); }
  return out;
};
check(keysOf(JSON.parse(json)).every(key => allowedKeys.has(key)), "الحمولةُ مفاتيحها محصورةٌ: لا اسمَ ولا معرّفَ مستخدم");
check(!/@|\bname\b|userId|byUserId|rootAdminId|jobId|restorePointId|rp1/i.test(json), "لا بريدَ ولا معرّفَ مهمة ولا نقطةَ استعادة في الحمولة");
const server = read("src/server/systemHealth.ts");
check(!/byUserId|\.rootAdminId|\.error\b|\.filename|\.sha256/.test(server.split("computeSystemHealth")[1] || ""), "الخادم لا يمرّر حقولَ أشخاصٍ أو أخطاءٍ حرة من المهام");

/* ── S: التوصيل ── */
const routes = read("src/server/routes/adminRoutes.ts");
check(/app\.get\("\/api\/system-health", requireAuth, requireRootAdmin, systemHealthHandler\)/.test(routes), "المسار بحارس requireAuth ثم requireRootAdmin");
check(!/app\.(post|put|patch|delete)\("\/api\/system-health/.test(routes), "لا مسارَ كتابة لسلامة النظام");
check(/Repository\.hasOpenVaultJob\(\)/.test(server) && /Repository\.isDemoRequest\(\)\) return buildPayload\(demoCards\(\)/.test(server), "البوابةُ بدالتها نفسها، والتجريبي بقيمٍ آمنةٍ قبل أي لمس");
check(/currentDemoSessionId\(\)/.test(server) && /createTtlMemo/.test(server) && /runProbes/.test(server), "تخبئةٌ بمفتاح عالم التجريب، وكلُّ فحصٍ معزول");
check(!/\.(set|update|delete|add)\(|startSystem|abandonSystem|advanceSystem/.test(server), "الخادمُ لا يكتب شيئاً");
const admin = read("src/components/AdminUsers.tsx"), app = read("src/App.tsx");
check(/\| "health"/.test(admin) && /rootAdmin \? \{ value: "health", label: "سلامة النظام"/.test(admin), "المحطةُ في الشريط للجذر وحده");
check(/mode === "health"/.test(admin) && /<SystemHealth header=\{consoleHead\(\)\} onOpenVault=\{\(\) => onNavigate\?\.\("backup"\)\}/.test(admin), "الشاشةُ مركّبة وزرُّ «نسخة الآن» يتنقّل إلى الخزنة");
check(/"backup", "health"\]/.test(app) && /health: "\/System\/Health"/.test(app) && /case "health":\s*return user\.IsRootAdmin/.test(app), "التطبيق: العرضُ والرابطُ /System/Health وحارسُ الجذر");
check(/page\.health/.test(read("src/guide/smartGuide.ts")) && /rootOnly:true/.test(read("src/guide/smartGuide.ts").split("page.health")[1].split("\n")[0]), "المرشد يعرف الشاشة للجذر");
const ui = read("src/components/SystemHealth.tsx");
check(/HEALTH_REFRESH_MS/.test(ui) && /visibilityState === "visible"/.test(ui) && /aria-label="تحديث"/.test(ui), "تنعيشٌ كل ٣٠ ثانية والتبويبُ ظاهر، وزرُّ تحديثٍ بتسمية");
check(/\.sh-refresh\{[^}]*44px/.test(read("src/styles/64-system-health.css")) && /prefers-reduced-motion/.test(read("src/styles/64-system-health.css")), "هدفٌ ٤٤px واحترامٌ لتقليل الحركة");
check(/64-system-health\.css/.test(read("src/index.css")), "الورقةُ مستوردة");
const ident = read("src/server/identityGeneration.ts");
check(/lastCheckedAt: \(\) => lastReadAt/.test(ident), "مراقبُ الجيل يكشف وقتَ آخر فحصٍ دون تغيير سلوكه");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
