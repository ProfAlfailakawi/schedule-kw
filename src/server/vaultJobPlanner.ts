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
export type VaultOpPhase = "safety" | "apply" | "finalizing";
export type VaultOpAction = "done" | "safety" | "apply" | "finalize";

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

export interface VaultOpCursor { status: VaultOpStatus; phase: VaultOpPhase; nextIndex: number; queueLength: number; }

/** ما تفعله الخطوةُ التالية؛ مهمةٌ مكتملة أو ملغاة لا تتقدّم أبداً. */
export function nextOpAction(row: VaultOpCursor): VaultOpAction {
  if (row.status === "ready" || row.status === "abandoned") return "done";
  if (row.phase === "safety") return "safety";
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
