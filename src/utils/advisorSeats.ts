/**
 * ── 🎟️ رصيد مقاعد المرشد (L3) ───────────────────────────────────────────────
 *
 * لكل شعبة سعةٌ أساسية (ما سُجّل فيها رسمياً حتى سعتها) ورصيدٌ إضافيٌّ يمنحه
 * المسؤول للمرشدين (٥ أو ١٠ …) على مستوى عامّ أو مقررٍ أو شعبة — الأخصُّ يغلب.
 *
 *   السقفُ الصلب = min(السعة + الرصيد، سعةُ القاعة الفعلية)
 *
 * فلا يُضاف طالبٌ لا يتّسع له كرسيّ، مهما كان الرصيد. والإضافةُ ذرّية: تُقرأ
 * وثيقةُ الشعبة وتُكتب في معاملةٍ واحدة (Repository.updateFeatureDoc)، فمرشدان
 * يضغطان معاً لا يتجاوزان السقف. والتوزيعُ العادل (اختياري) يقسم الرصيد على
 * المرشدين بالتساوي فلا يأخذه أوّلُهم كلَّه.
 *
 * هذه الوحدة حسابٌ صرف: لا تقرأ ولا تكتب؛ الخادم يمرّر الوثيقة ويحفظ الناتج.
 */
export interface SeatQuotaConfig {
  /** `${collegeId}:${sectionId}:${termId}` */
  id: string;
  /** السعة الأساسية الافتراضية لكل شعبة (يكتبها المسؤول؛ لا تُخمَّن). */
  capacityDefault?: number;
  /** sectionKey ← سعة أساسية خاصة. */
  capacityBySection?: Record<string, number>;
  global: number;
  /** courseId ← رصيد. */
  byCourse: Record<string, number>;
  /** sectionKey ← رصيد. */
  bySection: Record<string, number>;
  /** يقسم الرصيد على المرشدين بالتساوي. */
  fairSplit: boolean;
  /** عدد المرشدين المشاركين في القسمة (يكتبه المسؤول). */
  advisorCount?: number;
}

export interface SeatLedger {
  /** = sectionKey */
  id: string;
  courseId: number;
  /** السعة الأساسية للشعبة. */
  capacity: number;
  /** للعرض فقط: المسجّلون رسمياً إن عُرفوا. السعةُ الأساسية يملؤها نظامُ التسجيل؛ هذا الدفتر يعدّ الإضافيَّ وحده. */
  enrolled?: number;
  /** سعة القاعة الفعلية إن عُرفت. */
  roomCapacity?: number | null;
  /** إضافاتُ المرشدين: من أضاف وكم ومتى. */
  adds: Array<{ advisorId: number; advisorName: string; count: number; at: string }>;
}

export const DEFAULT_QUOTA = 0;

export const sectionKey = (termId: number, courseId: number, section: string | number) =>
  `${Number(termId)}:${Number(courseId)}:${String(section).trim()}`;

/** الرصيدُ الإضافي المنطبق: الشعبة ثم المقرر ثم العام. */
export function quotaFor(config: SeatQuotaConfig | null | undefined, courseId: number, key: string): number {
  if (!config) return DEFAULT_QUOTA;
  const pick = [config.bySection?.[key], config.byCourse?.[String(Number(courseId))], config.global]
    .find(value => value !== undefined && value !== null && Number.isFinite(Number(value)));
  return Math.max(0, Math.trunc(Number(pick ?? DEFAULT_QUOTA)));
}

export interface SeatState {
  capacity: number;
  quota: number;
  hardCap: number;
  /** المقيِّد: «room» حين تقصر القاعة عن السعة+الرصيد. */
  limitedBy: "quota" | "room";
  enrolled: number;
  advisorAdded: number;
  /** المقاعد الإضافية المتبقية للمرشدين. */
  remaining: number;
  /** نصيبُ مرشدٍ واحد عند التوزيع العادل (undefined بلا توزيع). */
  fairShare?: number;
  tone: "green" | "yellow" | "red";
  /** «60 + 4/10» */
  ringLabel: string;
}

export function seatState(ledger: SeatLedger, config: SeatQuotaConfig | null | undefined): SeatState {
  const capacity = Math.max(0, Math.trunc(Number(ledger.capacity || 0)));
  const quota = quotaFor(config, ledger.courseId, ledger.id);
  const room = Number(ledger.roomCapacity);
  const byQuota = capacity + quota;
  const hardCap = Number.isFinite(room) && room > 0 ? Math.min(byQuota, room) : byQuota;
  const enrolled = Math.max(0, Math.trunc(Number(ledger.enrolled || 0)));
  const advisorAdded = (ledger.adds || []).reduce((sum, add) => sum + Math.max(0, Number(add.count || 0)), 0);
  /* السعةُ الأساسية ملكُ نظام التسجيل الرسمي؛ الدفترُ يعدّ ما فوقها فقط. */
  const used = capacity + advisorAdded;
  const remaining = Math.max(0, hardCap - used);
  const extraCap = Math.max(0, hardCap - capacity);
  const fairShare = config?.fairSplit && Number(config.advisorCount) > 0 ? Math.floor(extraCap / Number(config.advisorCount)) : undefined;
  const ratio = extraCap ? remaining / extraCap : 0;
  const tone = remaining <= 0 ? "red" : ratio <= 0.3 || remaining <= 2 ? "yellow" : "green";
  return {
    capacity, quota, hardCap, limitedBy: hardCap < byQuota ? "room" : "quota", enrolled, advisorAdded, remaining, fairShare, tone,
    ringLabel: `${capacity} + ${advisorAdded}/${extraCap}`,
  };
}

export type SeatAddResult =
  | { ok: true; added: number; remaining: number; message: string; icon: "✅" | "⚠️" }
  | { ok: false; reason: "full" | "fair-share" | "invalid"; remaining: number; message: string; icon: "⛔" };

/**
 * محاولةُ إضافة `count` مقعداً — دالةٌ صرفة تُستدعى داخل المعاملة الذرّية.
 * تُرجع الوثيقة الجديدة حين تُقبل، ولا تقبل جزءاً: إمّا العددُ كلُّه أو لا شيء.
 */
export function tryAddSeats(ledger: SeatLedger, config: SeatQuotaConfig | null | undefined,
  advisor: { id: number; name: string }, count: number, at = new Date().toISOString()): { result: SeatAddResult; next?: SeatLedger } {
  const n = Math.trunc(Number(count));
  const before = seatState(ledger, config);
  if (!(n > 0) || n > 50) return { result: { ok: false, reason: "invalid", remaining: before.remaining, message: "عددٌ غير صالح", icon: "⛔" } };
  if (before.remaining < n) {
    return { result: { ok: false, reason: "full", remaining: before.remaining,
      message: before.remaining ? `متبقٍّ ${before.remaining} فقط` : "الشعبة ممتلئة", icon: "⛔" } };
  }
  if (before.fairShare !== undefined) {
    const mine = (ledger.adds || []).filter(add => Number(add.advisorId) === Number(advisor.id)).reduce((sum, add) => sum + add.count, 0);
    if (mine + n > before.fairShare) {
      return { result: { ok: false, reason: "fair-share", remaining: before.remaining,
        message: `نصيبك ${before.fairShare} · استهلكت ${mine}`, icon: "⛔" } };
    }
  }
  const next: SeatLedger = { ...ledger, adds: [...(ledger.adds || []), { advisorId: advisor.id, advisorName: advisor.name, count: n, at }] };
  const after = seatState(next, config);
  const message = after.remaining === 0 ? `أضفت ${n} · الشعبة ممتلئة الآن`
    : after.remaining <= 2 ? `أضفت ${n} · آخر ${after.remaining === 1 ? "مقعد" : "مقعدين"}`
    : `أضفت ${n} · متبقي ${after.remaining}`;
  return { next, result: { ok: true, added: n, remaining: after.remaining, message, icon: after.remaining <= 2 ? "⚠️" : "✅" } };
}

/** شعبٌ بديلة للمقرر نفسه فيها مقاعد، الأكثر فراغاً أولاً. */
export function alternativeSections<T extends { ledger: SeatLedger }>(rows: T[], courseId: number, exceptKey: string, config: SeatQuotaConfig | null | undefined): Array<T & { state: SeatState }> {
  return rows
    .filter(row => Number(row.ledger.courseId) === Number(courseId) && row.ledger.id !== exceptKey)
    .map(row => ({ ...row, state: seatState(row.ledger, config) }))
    .filter(row => row.state.remaining > 0)
    .sort((a, b) => b.state.remaining - a.state.remaining);
}

/** لوحة المسؤول: الشعب القريبة من الامتلاء ومن أضاف كم. */
export function nearFull(rows: SeatLedger[], config: SeatQuotaConfig | null | undefined) {
  return rows.map(ledger => {
    const state = seatState(ledger, config);
    const byAdvisor = new Map<string, number>();
    for (const add of ledger.adds || []) byAdvisor.set(add.advisorName || String(add.advisorId), (byAdvisor.get(add.advisorName || String(add.advisorId)) || 0) + add.count);
    return { ledger, state, byAdvisor: [...byAdvisor].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count) };
  }).filter(row => row.state.tone !== "green")
    .sort((a, b) => a.state.remaining - b.state.remaining);
}

export function normalizeQuotaConfig(input: any, id: string): SeatQuotaConfig {
  const clean = (value: unknown) => Math.max(0, Math.min(200, Math.trunc(Number(value || 0))));
  const map = (value: any) => Object.fromEntries(Object.entries(value && typeof value === "object" ? value : {})
    .filter(([key, v]) => key && v !== "" && v !== null && Number.isFinite(Number(v))).map(([key, v]) => [key, clean(v)]));
  return {
    id, global: clean(input?.global), byCourse: map(input?.byCourse), bySection: map(input?.bySection),
    fairSplit: input?.fairSplit === true, ...(Number(input?.advisorCount) > 0 ? { advisorCount: clean(input.advisorCount) } : {}),
    ...(Number(input?.capacityDefault) > 0 ? { capacityDefault: clean(input.capacityDefault) } : {}),
    capacityBySection: map(input?.capacityBySection),
  };
}

/** السعة الأساسية لشعبة: الخاصة ثم الافتراضية؛ 0 = لم تُحدَّد بعد. */
export function baseCapacityFor(config: SeatQuotaConfig | null | undefined, key: string): number {
  const own = Number(config?.capacityBySection?.[key]);
  if (Number.isFinite(own) && own > 0) return Math.trunc(own);
  return Math.max(0, Math.trunc(Number(config?.capacityDefault || 0)));
}
