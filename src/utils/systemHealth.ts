/**
 * ── «سلامة النظام»: منطقُ الحالات صرفاً ───────────────────────────────────────
 * كلُّ العتبات وحالةُ كل بطاقة وحالةُ اللافتة العامة هنا بلا قاعدة بيانات ولا ساعة، فتُختبر وحدها.
 * الخادمُ (src/server/systemHealth.ts) يجمع الأرقام ويستدعي هذه الدوال؛ والواجهة تقرأ الحالةَ والرقمَ والرمز
 * وتختار الكلمة. لا أسماءَ ولا معرّفاتِ أشخاصٍ في أي بطاقة: أعدادٌ وأطوال زمنٍ ورموزُ حالةٍ فقط.
 */

export type HealthState = "ok" | "warn" | "bad" | "unknown";
export type HealthCardId = "backup" | "vault" | "gate" | "identity" | "term";
export type HealthUnit = "day" | "second" | "hour" | "percent" | "none";

/** عتباتُ عمر النسخة بالأيام: أخضرُ حتى ٧، وعنبريٌّ حتى ١٤، وما فوق ذلك (أو لا نسخة) أحمر. */
export const BACKUP_OK_DAYS = 7;
export const BACKUP_WARN_DAYS = 14;
/** مهمةٌ «تعمل» لم تتحرك منذ هذه المدة وما مسّت البياناتِ بعد: قفلٌ عالق (نفسُ مدة بوابة الصيانة VAULT_GATE_IDLE_MS). */
export const VAULT_STALE_MS = 10 * 60_000;
/** آخرُ فحصٍ للهوية المشتركة أقدمُ من هذا (بالثواني) يعني أن النسخة لا تتحقق فعلاً (الفحص الطبيعي كل ~١٠ ثوانٍ مع كل طلب). */
export const IDENTITY_STALE_SECONDS = 120;
/** رادارُ التسجيل: تشغيلٌ أقدمُ من هذه الساعات يُعدّ قديماً، إضافةً إلى علَم الرادار نفسه `stale`. */
export const RADAR_STALE_HOURS = 72;
/** مدةُ تخبئة الاستجابة في الخادم؛ والواجهة تنعش كل ثلاثين ثانية. */
export const HEALTH_CACHE_MS = 8_000;
export const HEALTH_REFRESH_MS = 30_000;
/** «تحقق الآن» يتجاوز التخبئة، لكن لا أكثر من مرة كل هذه المدة: قراءاتٌ حيّة لا يغرق بها زرٌّ يُضغط بسرعة. */
export const HEALTH_FRESH_GAP_MS = 3_000;

/** عنوانُ كل بطاقة (مصدرٌ واحد للوحة السلامة وملخّص الصباح). */
export const HEALTH_CARD_TITLES: Record<HealthCardId, string> = {
  backup: "النسخ الاحتياطي",
  vault: "الخزنة",
  gate: "بوابة الصيانة",
  identity: "الهوية والصلاحيات",
  term: "الفصل الجاري",
};

export interface HealthCard {
  id: HealthCardId;
  state: HealthState;
  /** رمزُ الحالة الذي تختار الواجهةُ كلمتَه. */
  code: string;
  /** الرقم الكبير إن وُجد. */
  value: number | null;
  unit: HealthUnit;
  /** نوعُ المهمة أو المرحلة في بطاقة الخزنة. */
  detail?: string;
}

export interface HealthPayload {
  generatedAt: string;
  demo: boolean;
  overall: HealthState;
  cards: HealthCard[];
}

const SEVERITY: Record<HealthState, number> = { ok: 0, unknown: 1, warn: 1, bad: 2 };

/** أسوأُ الحالات: الأحمر فالعنبري؛ وبطاقةٌ تعذّرت قراءتُها لا تُعدّ سليمة (تُرفع إلى «انتباه»). */
export function worstOf(states: readonly HealthState[]): HealthState {
  const top = Math.max(0, ...states.map(state => SEVERITY[state]));
  return top >= 2 ? "bad" : top === 1 ? "warn" : "ok";
}

const ageMs = (iso: string | undefined | null, now: number): number | null => {
  const at = Date.parse(String(iso || ""));
  if (!Number.isFinite(at)) return null;
  return Math.max(0, now - at);
};
const wholeDays = (ms: number) => Math.floor(ms / 86_400_000);

/** ١) النسخ الاحتياطي: عمرُ أحدث نسخةٍ ناجحة (تصديرٌ جاهز أو نقطةُ استعادة) بالأيام. */
export function backupCard(input: { latestExportAt?: string | null; latestRestorePointAt?: string | null }, now: number): HealthCard {
  const ages = [ageMs(input.latestExportAt, now), ageMs(input.latestRestorePointAt, now)].filter((v): v is number => v !== null);
  if (!ages.length) return { id: "backup", state: "bad", code: "none", value: null, unit: "none" };
  const days = wholeDays(Math.min(...ages));
  const state: HealthState = days <= BACKUP_OK_DAYS ? "ok" : days <= BACKUP_WARN_DAYS ? "warn" : "bad";
  return { id: "backup", state, code: days === 0 ? "today" : "age", value: days, unit: "day" };
}

export interface VaultJobProbe {
  kind: "import" | "reset" | "undo";
  status: string;
  phase?: string;
  restorePointId?: string | null;
  updatedAt?: string | null;
  completedUnits?: number;
  totalUnits?: number;
}

/** ٢) الخزنة: هل مهمةٌ مفتوحة؟ أحمرُ إن فشلت بعد أن مسّت البيانات، وعنبريٌّ إن كانت مفتوحة أو عالقة. */
export function vaultCard(jobs: ReadonlyArray<VaultJobProbe | null | undefined>, now: number): HealthCard {
  const open = jobs.filter((job): job is VaultJobProbe => Boolean(job) && (job!.status === "running" || job!.status === "failed"));
  if (!open.length) return { id: "vault", state: "ok", code: "idle", value: null, unit: "none" };
  /* الأحدثُ حركةً أولاً؛ والفاشلةُ بعد مسّ البيانات تتقدم على غيرها. */
  const touched = (job: VaultJobProbe) => Boolean(job.restorePointId) && job.phase !== "safety";
  const rank = (job: VaultJobProbe) => (job.status === "failed" && touched(job) ? 2 : 1);
  const job = [...open].sort((a, b) => rank(b) - rank(a) || (Date.parse(String(b.updatedAt || "")) || 0) - (Date.parse(String(a.updatedAt || "")) || 0))[0];
  const total = Number(job.totalUnits) || 0;
  const percent = total > 0 ? Math.max(0, Math.min(99, Math.round(((Number(job.completedUnits) || 0) / total) * 100))) : 0;
  const detail = `${job.kind}:${job.phase || ""}`;
  if (job.status === "failed") return { id: "vault", state: touched(job) ? "bad" : "warn", code: touched(job) ? "failedTouched" : "failed", value: percent, unit: "percent", detail };
  const idle = ageMs(job.updatedAt, now);
  const stale = !touched(job) && idle !== null && idle >= VAULT_STALE_MS;
  return { id: "vault", state: "warn", code: stale ? "stale" : "open", value: percent, unit: "percent", detail };
}

/** ٣) بوابةُ الصيانة: مغلقةٌ للكتابة العادية = أحمر. */
export function gateCard(closed: boolean): HealthCard {
  return { id: "gate", state: closed ? "bad" : "ok", code: closed ? "closed" : "open", value: null, unit: "none" };
}

/** ٤) الهويةُ والصلاحيات: وثيقةُ الجيل المشتركة مقروءة؟ ومنذ كم ثانيةً فحصتها هذه النسخة؟ */
export function identityCard(input: { readable: boolean; shared: boolean; lastCheckedAt: number | null }, now: number): HealthCard {
  if (!input.readable) return { id: "identity", state: "bad", code: "unreadable", value: null, unit: "none" };
  if (!input.shared) return { id: "identity", state: "ok", code: "local", value: null, unit: "none" };
  if (input.lastCheckedAt === null) return { id: "identity", state: "ok", code: "checked", value: 0, unit: "second" };
  const seconds = Math.max(0, Math.round((now - input.lastCheckedAt) / 1000));
  return { id: "identity", state: seconds > IDENTITY_STALE_SECONDS ? "warn" : "ok", code: "checked", value: seconds, unit: "second" };
}

/** ٥) الفصلُ الجاري: مجمَّد أم مفتوح، وعمرُ آخر تشغيلٍ للرادار. */
export function termCard(input: { hasTerm: boolean; frozen: boolean; radarRanAt?: string | null; radarStale?: boolean }, now: number): HealthCard {
  if (!input.hasTerm) return { id: "term", state: "warn", code: "noTerm", value: null, unit: "none" };
  if (input.frozen) return { id: "term", state: "warn", code: "frozen", value: null, unit: "none" };
  const age = ageMs(input.radarRanAt, now);
  if (age === null) return { id: "term", state: "ok", code: "open", value: null, unit: "none" };
  const hours = Math.floor(age / 3_600_000);
  const stale = Boolean(input.radarStale) || hours >= RADAR_STALE_HOURS;
  return { id: "term", state: stale ? "warn" : "ok", code: stale ? "radarStale" : "radarFresh", value: hours >= 48 ? wholeDays(age) : hours, unit: hours >= 48 ? "day" : "hour" };
}

/** هل يجوز لـ«تحقق الآن» أن يتجاوز التخبئة؟ (أول مرة، أو بعد مضيّ الفاصل). */
export function canBypassHealthCache(lastFreshAt: number | null, now: number): boolean {
  return lastFreshAt === null || now - lastFreshAt >= HEALTH_FRESH_GAP_MS;
}

/**
 * ملخّصُ الصباح: البطاقاتُ التي تحتاج انتباهاً مرتّبةً بالأسوأ أولاً (الأحمر ثم العنبري ثم ما تعذّرت قراءتُه).
 * قائمةٌ فارغة = «كل شيء سليم». الترتيبُ ثابتٌ بين المتساويات (ترتيب البطاقات في الحمولة).
 */
export function attentionCards(payload: Pick<HealthPayload, "cards">): HealthCard[] {
  const rank: Record<HealthState, number> = { bad: 0, warn: 1, unknown: 2, ok: 3 };
  return payload.cards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => card.state !== "ok")
    .sort((a, b) => rank[a.card.state] - rank[b.card.state] || a.index - b.index)
    .map(({ card }) => card);
}

/** بطاقةٌ تعذّرت قراءتُها: رماديةٌ ولا تُسقط الصفحة. */
export const failedCard = (id: HealthCardId): HealthCard => ({ id, state: "unknown", code: "failed", value: null, unit: "none" });

/** يشغّل كلَّ فحصٍ في try/catch خاص به: فشلُ واحدٍ لا يمسّ الباقي. */
export async function runProbes(probes: ReadonlyArray<{ id: HealthCardId; run: () => Promise<HealthCard> | HealthCard }>): Promise<HealthCard[]> {
  return Promise.all(probes.map(async probe => {
    try { return await probe.run(); } catch { return failedCard(probe.id); }
  }));
}

export function buildPayload(cards: HealthCard[], now: number, demo: boolean): HealthPayload {
  return { generatedAt: new Date(now).toISOString(), demo, overall: worstOf(cards.map(card => card.state)), cards };
}

/** قيمٌ آمنةٌ للتجريبي: لا تلمس خزنةً حقيقية ولا وثائق مشتركة. */
export function demoCards(): HealthCard[] {
  return [
    { id: "backup", state: "ok", code: "today", value: 0, unit: "day" },
    { id: "vault", state: "ok", code: "idle", value: null, unit: "none" },
    { id: "gate", state: "ok", code: "open", value: null, unit: "none" },
    { id: "identity", state: "ok", code: "local", value: null, unit: "none" },
    { id: "term", state: "ok", code: "open", value: null, unit: "none" },
  ];
}
