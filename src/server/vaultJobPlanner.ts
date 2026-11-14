/**
 * ── مخطِّطُ خطوات «التصفير» و«التراجع الكامل» كمهمّتين قابلتين للاستكمال ──────────
 *
 * كانا طلباً واحداً يستبدل النظام كله ويتجاوز مهلةَ الطلب على قاعدةٍ بنحو 36 ألف وثيقة. صارا على شكل
 * الاستيراد: بدء ← خطوات محدودة (مجموعةٌ واحدة في الخطوة) بتقدّم ← إتمام، بنقطة أمان تُحفظ أولاً.
 * هذا الملف منطقٌ صرف (بلا قاعدة بيانات) يقرّر القائمة والخطوة التالية والتقدّم وإعادة المحاولة،
 * ويُختبر وحده (tests/vault-jobs-audit.ts)؛ والتنفيذ في src/db/repository.ts.
 */
export type VaultOpKind = "reset" | "undo";
export type VaultOpStatus = "running" | "ready" | "failed" | "abandoned";
export type VaultOpPhase = "safety" | "apply" | "finalizing" | "rollback";
export type VaultOpAction = "done" | "safety" | "apply" | "finalize" | "rollback" | "rollback-finalize";

/** مجموعات الهوية تُوفَّق في مكانها كي لا يفقد الحساب الرئيسي حسابَه وصلاحياتِه بين كتابتين. */
export const VAULT_IDENTITY_COLLECTIONS = ["users", "formSecurity", "formNames"] as const;
export const VAULT_OP_MAX_RETRIES = 8;

const byName = (a: string, b: string) => a.localeCompare(b);

/**
 * قائمةُ التصفير: كل مجموعةٍ غير هوية تُحذف أولاً، ثم تُوفَّق formSecurity (يبقى للحساب الرئيسي) فـ users
 * (يبقى حسابه). formNames تبقى كما هي فلا تدخل القائمة. المستثنى (الجلسات ونقاط الأمان والمهام) لا يُمسّ.
 */
export function planResetQueue(existing: readonly string[], excluded: ReadonlySet<string>): string[] {
  const names = [...new Set(existing)].filter(name => !excluded.has(name));
  const identity = new Set<string>(VAULT_IDENTITY_COLLECTIONS);
  const ordinary = names.filter(name => !identity.has(name)).sort(byName);
  const tail = ["formSecurity", "users"].filter(name => names.includes(name));
  return [...ordinary, ...tail];
}

/** قائمةُ التراجع: اتحادُ ما في القاعدة الآن وما في نقطة التراجع، فتُحذف الزائدة وتُكتب الناقصة. */
export function planUndoQueue(existing: readonly string[], target: readonly string[], excluded: ReadonlySet<string>): string[] {
  return [...new Set([...existing, ...target])].filter(name => !excluded.has(name)).sort(byName);
}

/** وحداتُ التقدّم: وحداتُ نقطة الأمان + مجموعةٌ لكل خطوة + وحدةُ الإتمام. */
export function opTotalUnits(safetyUnits: number, queueLength: number): number {
  return Math.max(1, safetyUnits) + queueLength + 1;
}

export interface VaultOpCursor { status: VaultOpStatus; phase: VaultOpPhase; nextIndex: number; queueLength: number; rollbackIndex?: number; rollbackLength?: number; }

/** ما تفعله الخطوةُ التالية؛ مهمةٌ مكتملة أو ملغاة لا تتقدّم أبداً. */
export function nextOpAction(row: VaultOpCursor): VaultOpAction {
  if (row.status === "ready" || row.status === "abandoned") return "done";
  if (row.phase === "safety") return "safety";
  /* العودةُ إلى نقطة الأمان بعد إلغاء: مجموعةٌ في الخطوة ثم إتمام (يستهلك النقطة ويعلّم المهمة ملغاة). */
  if (row.phase === "rollback") return Number(row.rollbackIndex || 0) < Number(row.rollbackLength || 0) ? "rollback" : "rollback-finalize";
  if (row.phase === "apply" && row.nextIndex < row.queueLength) return "apply";
  return "finalize";
}

/** نسبةُ التقدّم 0..100 (لا تبلغ 100 قبل «ready»). */
export function opProgressPercent(row: { status: VaultOpStatus; completedUnits: number; totalUnits: number }): number {
  if (row.status === "ready") return 100;
  if (!row.totalUnits) return 0;
  return Math.max(0, Math.min(99, Math.round((row.completedUnits / row.totalUnits) * 100)));
}

/** فشلُ خطوة: العابرُ يُعاد (حتى حدٍّ)، وغيرُه يوقف المهمة «failed» ويبقى التقدّم محفوظاً. */
export function opRetryOutcome(previousRetries: number, transient: boolean): { retryCount: number; status: "running" | "failed" } {
  const retryCount = previousRetries + 1;
  return { retryCount, status: transient && retryCount < VAULT_OP_MAX_RETRIES ? "running" : "failed" };
}

/** هل بدأت المهمةُ تمسّ البيانات؟ (يقرّر هل يعيد الإلغاءُ النظامَ من نقطة الأمان) */
export function opTouchedData(row: { restorePointId?: string; phase: VaultOpPhase }, local: boolean): boolean {
  return Boolean(row.restorePointId) && (local || row.phase !== "safety");
}

/** مهمةٌ مفتوحة تسدّ الخزنة: لا تبدأ عمليةٌ أخرى فوقها. */
export const isOpenVaultStatus = (status: string | undefined | null): boolean => status === "running" || status === "failed";

/* ══ الإيجار والإصدار: خطوةٌ واحدة فقط تعمل على المهمة في كل لحظة ══════════════════════════
 *
 * الكتابةُ على وثيقة المهمة كانت غيرَ مشروطة: خطوتان متزامنتان (نقرةٌ مزدوجة، تبويبٌ ثانٍ، إعادةُ محاولة بعد
 * مهلة) تعملان معاً، والإلغاءُ قد يعيد النظام وخطوةٌ ما زالت تمسح، ثم تكتب الخطوةُ الأخيرة «running» فوق «abandoned».
 * الآن: لكل وثيقة مهمة ‎version‎ يزيد مع كل كتابة، و‎leaseOwner/leaseUntil‎ تأخذه خطوةٌ (أو إلغاء) داخل معاملة
 * تعيد قراءة الوثيقة؛ وكل كتابة داخل الخطوة مشروطة بأنها ما زالت صاحبة الإيجار والإصدار.
 * (التنفيذ على القاعدة في src/db/repository.ts؛ القرارات الصرفة هنا كي تُختبر وحدها.) */
export const VAULT_LEASE_MS = 60_000;

export interface VaultLeaseFields { version?: number; leaseOwner?: string | null; leaseUntil?: number | null; }

/** خطأ تعارضٍ مفهوم للمستخدم (يُرجَع 409 برسالته لا 500 عامّاً). */
export class VaultJobConflict extends Error {
  constructor(message: string, readonly code: "busy" | "lost" | "locked" | "state" = "state") { super(message); this.name = "VaultJobConflict"; }
}

/** هل إيجارُ الوثيقة حيٌّ الآن؟ */
export function leaseIsLive(row: VaultLeaseFields, now: number): boolean {
  return Boolean(row.leaseOwner) && Number(row.leaseUntil || 0) > now;
}

/** قرارُ أخذ الإيجار: يُؤخذ إن لم يكن حيّاً لغيرنا؛ الإصدارُ يزيد دائماً. */
export function planLeaseTake(row: VaultLeaseFields, owner: string, now: number, leaseMs = VAULT_LEASE_MS):
  { ok: true; next: { version: number; leaseOwner: string; leaseUntil: number } } | { ok: false } {
  if (leaseIsLive(row, now) && row.leaseOwner !== owner) return { ok: false };
  return { ok: true, next: { version: Number(row.version || 0) + 1, leaseOwner: owner, leaseUntil: now + leaseMs } };
}

/** هل ما زلنا نملك الإيجار والإصدار الذي قرأناه؟ (شرطُ كل كتابةٍ داخل الخطوة) */
export function holdsLease(stored: VaultLeaseFields, owner: string, version: number): boolean {
  return stored.leaseOwner === owner && Number(stored.version || 0) === Number(version || 0);
}

/** الكتابةُ المشروطة: الإصدارُ التالي مع تجديد الإيجار، أو التحرير (بلا مالك). */
export function leaseWriteFields(stored: VaultLeaseFields, owner: string, now: number, release: boolean, leaseMs = VAULT_LEASE_MS):
  { version: number; leaseOwner: string | null; leaseUntil: number } {
  return { version: Number(stored.version || 0) + 1, leaseOwner: release ? null : owner, leaseUntil: release ? 0 : now + leaseMs };
}

/* ══ قفلُ الخزنة: مهمةٌ مفتوحة واحدة فقط (استيراد أو تصفير أو تراجع) ══════════════════════ */
export type VaultLockKind = "import" | "reset" | "undo";
export interface VaultLockDoc { jobId: string; kind: VaultLockKind; takenAt: string; }

/** حالةُ مهمةٍ منتهية لا تُمسك القفل. المفقودةُ كالمنتهية. */
export const isTerminalVaultStatus = (status: string | undefined | null): boolean => !status || status === "ready" || status === "abandoned";

/** قرارُ أخذ القفل عند البدء: يُؤخذ إن كان حرّاً، أو لنا، أو مُمسَكاً بمهمةٍ انتهت (قفلٌ يتيم). */
export function planLockTake(lock: VaultLockDoc | null, holderStatus: string | undefined | null, jobId: string): "take" | "refuse" {
  if (!lock || lock.jobId === jobId) return "take";
  return isTerminalVaultStatus(holderStatus) ? "take" : "refuse";
}

/** قرارُ التحقق عند الخطوة/الإلغاء: مهمتُنا تُمسك القفل؛ غيابُ القفل (مهمةٌ سبقت هذا الإصدار) يُتبنّى؛ غيرُنا يُرفض. */
export function planLockVerify(lock: VaultLockDoc | null, jobId: string): "ok" | "adopt" | "refuse" {
  if (!lock) return "adopt";
  return lock.jobId === jobId ? "ok" : "refuse";
}

/* ══ نقاطُ الاستعادة: من يُطرد حين يزيد العددُ عن الحد ══════════════════════════════════════
 * كان يُطرد كل ما بعد الأحدث ثمانية، فقد يُحذف هدفُ التراجع (أحدثُ نقطةٍ غير مستهلكة) إن كانت سبعٌ أحدثُ منه مستهلكة.
 * الآن: لا تُطرد المحميّةُ أبداً (هدفُ المهمة ونقطةُ أمانها)، وتُطرد المستهلكةُ قبل غير المستهلكة، الأقدمُ أولاً. */
export interface RestorePointRef { id: string; createdAt: string; consumedAt?: string | null; }
export function pickRestorePointEvictions(points: readonly RestorePointRef[], keep: number, protectedIds: readonly string[]): string[] {
  const excess = points.length - keep;
  if (excess <= 0) return [];
  const guard = new Set(protectedIds.filter(Boolean));
  const oldestFirst = [...points].filter(point => !guard.has(point.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const ordered = [...oldestFirst.filter(point => point.consumedAt), ...oldestFirst.filter(point => !point.consumedAt)];
  return ordered.slice(0, excess).map(point => point.id);
}

/* ══ بوابةُ الصيانة: مهمةٌ مفتوحة تمنع الكتابة العادية ══════════════════════════════════════ */
export const VAULT_MAINTENANCE_MESSAGE = "النظام في صيانة: عملية نسخٍ احتياطي جارية";
/** مهمةٌ ما زالت في مرحلة نقطة الأمان (لم تمسّ البياناتِ الحيّة) لا تُغلق الكتابة إلا ما دامت تعمل فعلاً. */
export const VAULT_GATE_IDLE_MS = 10 * 60_000;

/**
 * هل تُغلق الكتابةُ العادية من أجل هذه المهمة؟
 *  • بعد أن بدأ استبدالُ البيانات (أو رجوعُها) تبقى الكتابةُ مغلقةً حتى يُنهي الجذرُ المهمةَ أو يُلغيها: النظامُ نصفُ مستبدَل.
 *  • قبل ذلك (التهيئة ونقطةُ الأمان) تُغلق ما دامت المهمةُ «تعمل» وقد تحرّكت في آخر ‎VAULT_GATE_IDLE_MS‎ فقط؛ فاستيرادٌ
 *    فشل قبل أن يمسّ شيئاً، أو تُرك والجلسةُ مغلقة، لا يحجز الجامعةَ كلَّها عن الكتابة.
 */
export function gateHoldsFor(holder: { status?: string | null; phase?: string | null; restorePointId?: string | null; updatedAt?: string | null } | null, now: number): boolean {
  if (!holder || isTerminalVaultStatus(holder.status)) return false;
  const touched = Boolean(holder.restorePointId) && holder.phase !== "safety";
  if (touched) return true;
  if (holder.status !== "running") return false;
  const moved = Date.parse(String(holder.updatedAt || ""));
  return Number.isFinite(moved) && now - moved < VAULT_GATE_IDLE_MS;
}

export const VAULT_MAINTENANCE_CACHE_MS = 5_000;

/** هل يُرفض هذا الطلب؟ القراءةُ تمرّ؛ الحسابُ الرئيسي ومسارات الخزنة والدخولُ والخروج تمرّ. */
export function maintenanceRefuses(input: { method: string; path: string; isRoot: boolean; open: boolean }): boolean {
  if (!input.open || input.isRoot) return false;
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(input.method.toUpperCase())) return false;
  if (input.path === "/system-backup" || input.path.startsWith("/system-backup/")) return false;
  if (input.path.startsWith("/auth/") || input.path === "/telemetry/client") return false;
  return true;
}

/** علَمٌ مخبَّأ لوجود مهمةٍ مفتوحة: قراءةٌ واحدة كل ‎ttl‎ كحدٍّ أقصى لكل نسخة، وفشلُ القراءة لا يُغلق النظام. */
export function createOpenVaultFlag(options: { read: () => Promise<boolean>; now?: () => number; ttlMs?: number }) {
  const now = options.now ?? Date.now;
  const ttl = options.ttlMs ?? VAULT_MAINTENANCE_CACHE_MS;
  let value = false;
  let readAt: number | null = null;
  let inFlight: Promise<boolean> | null = null;
  return {
    get: async (): Promise<boolean> => {
      if (readAt !== null && now() - readAt < ttl && now() >= readAt) return value;
      if (!inFlight) {
        inFlight = options.read().then(next => { value = next; readAt = now(); return value; })
          .catch(() => { readAt = now(); return value; })
          .finally(() => { inFlight = null; });
      }
      return inFlight;
    },
    /** هذه النسخةُ نفسها بدأت المهمة أو أنهتها: لا تنتظر انقضاء المدة. */
    set: (next: boolean) => { value = next; readAt = now(); },
  };
}
