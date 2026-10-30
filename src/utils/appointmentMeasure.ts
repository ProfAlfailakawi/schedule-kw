/**
 * ── «وقت إدخال المواعيد»: كم يأخذ الموعدُ الواحد، بلا اسمٍ ولا رقم ─────────────────────
 *
 * المالك يريد أن يعرف أين يتعثّر من يُدخل المواعيد: كم ثانيةً يأخذ الموعد، وكم مرةً
 * اصطدم بمانع، وأيُّ أداةٍ أعانته، ومن أيّ جهاز. فالقياسُ عدّادٌ شهريٌّ واحد:
 *
 *   • النموذجُ يحمل عدّاداً (createEntryMeter) من فتحه إلى حفظه، ويُرسله مرةً واحدة
 *     (sendEntryMeasure) — بلا انتظار ولا خطأٍ يصل أحداً.
 *   • الخادمُ يطويه ذرّياً في وثيقة الشهر (foldEntryMeasure): أعدادٌ ومجاميعُ فقط. لا رقمَ
 *     حساب، ولا اسم، ولا مقرر، ولا قاعة — لا شيء يُردّ به رقمٌ إلى صاحبه.
 *   • الوقتُ الذي كانت فيه الصفحةُ مخفيّة لا يُحسب: من ترك النموذج إلى اجتماعٍ لا يُطيل المتوسط.
 *
 * والملف بلا React ولا متصفّحٍ عند تحميله: يقرؤه الخادمُ (القائمة البيضاء والطيّ) والواجهةُ معاً.
 */

/** الأدواتُ التي تُعين على الموعد — ما عداها يُسقط بصمت. */
export const ENTRY_HELPERS = [
  "suggest-slots", "usual", "stick", "room-suggest", "borrow", "alternative",
  "week-pick", "week-draw", "one-line", "pattern", "wheel", "golden",
  /* الموعدُ أُدخل من البطاقة السريعة على خانة الجدول، لا من «موعد جديد» الكامل. */
  "quick-card",
] as const;
export type HelperName = typeof ENTRY_HELPERS[number];
export type EntryDevice = "phone" | "tablet" | "desktop";
export type EntryMode = "create" | "edit";

export const ENTRY_DEVICES: readonly EntryDevice[] = ["phone", "tablet", "desktop"];
export const ENTRY_MODES: readonly EntryMode[] = ["create", "edit"];
/** ساعتان: ما فوقهما نموذجٌ نُسي مفتوحاً، لا موعدٌ استغرق ذلك. */
export const ENTRY_DURATION_MAX_MS = 7_200_000;
export const ENTRY_BLOCKED_MAX = 1_000;

/** شرائحُ المدة بالثواني: أقل من 30، 30–60، 60–120، 120–300، 300 فأكثر. */
export const ENTRY_BUCKETS = ["lt30", "s30to60", "s60to120", "s120to300", "gt300"] as const;
export type EntryBucket = typeof ENTRY_BUCKETS[number];

export interface EntryMeasurePayload {
  durationMs: number;
  blockedMoments: number;
  helpers: HelperName[];
  device: EntryDevice;
  mode: EntryMode;
}

/** وثيقةُ الشهر «YYYY-MM» — أعدادٌ فقط. */
export interface EntryMetricsMonth {
  month: string;
  count: number;
  sumMs: number;
  buckets: Record<EntryBucket, number>;
  blockedEntries: number;
  blockedMomentsSum: number;
  helpers: Partial<Record<HelperName, number>>;
  devices: Record<EntryDevice, number>;
  modes: Record<EntryMode, number>;
  updatedAt?: string;
}

const HELPER_SET = new Set<string>(ENTRY_HELPERS);
export const isEntryHelper = (value: unknown): value is HelperName => typeof value === "string" && HELPER_SET.has(value);

/** الهاتف دون 700 بكسل، واللوحيُّ دون 1100، وما فوقهما مكتب. */
export function entryDevice(width?: number): EntryDevice {
  const w = Number(width ?? (typeof window !== "undefined" ? window.innerWidth : 1280));
  if (!Number.isFinite(w) || w <= 0) return "desktop";
  return w < 700 ? "phone" : w < 1100 ? "tablet" : "desktop";
}

export function entryBucket(durationMs: number): EntryBucket {
  const seconds = Math.max(0, Number(durationMs) || 0) / 1000;
  if (seconds < 30) return "lt30";
  if (seconds < 60) return "s30to60";
  if (seconds < 120) return "s60to120";
  if (seconds < 300) return "s120to300";
  return "gt300";
}

/** شهرُ الكويت (UTC+3 طوال السنة، بلا توقيتٍ صيفي): «2026-10». */
export function entryMonthKey(at: number | Date = Date.now()): string {
  const ms = at instanceof Date ? at.getTime() : Number(at);
  return new Date((Number.isFinite(ms) ? ms : Date.now()) + 3 * 3_600_000).toISOString().slice(0, 7);
}

/** الشهرُ الحاضر وما قبله: ["2026-10", "2026-09", "2026-08"]. */
export function recentEntryMonths(at: number | Date = Date.now(), count = 3): string[] {
  const [year, month] = entryMonthKey(at).split("-").map(Number);
  return Array.from({ length: Math.max(1, count) }, (_, back) => {
    const index = year * 12 + (month - 1) - back;
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
  });
}

export function emptyEntryMonth(month: string): EntryMetricsMonth {
  return {
    month, count: 0, sumMs: 0,
    buckets: { lt30: 0, s30to60: 0, s60to120: 0, s120to300: 0, gt300: 0 },
    blockedEntries: 0, blockedMomentsSum: 0, helpers: {},
    devices: { phone: 0, tablet: 0, desktop: 0 },
    modes: { create: 0, edit: 0 },
  };
}

const count = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/** وثيقةٌ مقروءة بحذر: ما نقص أو فسد منها صفر، ولا يدخلها مفتاحٌ غير معروف. */
export function normalizeEntryMonth(month: string, raw: unknown): EntryMetricsMonth {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const base = emptyEntryMonth(month);
  for (const key of ENTRY_BUCKETS) base.buckets[key] = count(source.buckets?.[key]);
  for (const key of ENTRY_DEVICES) base.devices[key] = count(source.devices?.[key]);
  for (const key of ENTRY_MODES) base.modes[key] = count(source.modes?.[key]);
  for (const key of ENTRY_HELPERS) { const n = count(source.helpers?.[key]); if (n) base.helpers[key] = n; }
  base.count = count(source.count);
  base.sumMs = count(source.sumMs);
  base.blockedEntries = count(source.blockedEntries);
  base.blockedMomentsSum = count(source.blockedMomentsSum);
  if (typeof source.updatedAt === "string") base.updatedAt = source.updatedAt.slice(0, 40);
  return base;
}

/**
 * يتحقق من القياس ويقصّه: المدةُ 0..ساعتين، واللحظاتُ 0..1000، والأدواتُ من القائمة البيضاء
 * وحدها بلا تكرار. والجهازُ والنوعُ من قيمٍ معروفة، وإلا رُدّ القياس كلُّه.
 */
export function parseEntryMeasure(body: unknown): { ok: true; payload: EntryMeasurePayload } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "قياسٌ غير صالح." };
  const source = body as Record<string, unknown>;
  const duration = typeof source.durationMs === "number" ? source.durationMs : Number.NaN;
  if (!Number.isFinite(duration)) return { ok: false, error: "مدةٌ غير صالحة." };
  const blocked = source.blockedMoments === undefined ? 0 : typeof source.blockedMoments === "number" ? source.blockedMoments : Number.NaN;
  if (!Number.isFinite(blocked)) return { ok: false, error: "عددٌ غير صالح." };
  const device = source.device, mode = source.mode;
  if (typeof device !== "string" || !(ENTRY_DEVICES as readonly string[]).includes(device)) return { ok: false, error: "جهازٌ غير معروف." };
  if (typeof mode !== "string" || !(ENTRY_MODES as readonly string[]).includes(mode)) return { ok: false, error: "نوعٌ غير معروف." };
  const helpers = [...new Set((Array.isArray(source.helpers) ? source.helpers : []).slice(0, 64).filter(isEntryHelper))];
  return {
    ok: true,
    payload: {
      durationMs: Math.round(Math.min(ENTRY_DURATION_MAX_MS, Math.max(0, duration))),
      blockedMoments: Math.round(Math.min(ENTRY_BLOCKED_MAX, Math.max(0, blocked))),
      helpers,
      device: device as EntryDevice,
      mode: mode as EntryMode,
    },
  };
}

/** يطوي قياساً واحداً في وثيقة شهره — دالةٌ نقيّة، يستدعيها الخادم داخل الكتابة الذرّية. */
export function foldEntryMeasure(current: unknown, month: string, payload: EntryMeasurePayload, at = new Date().toISOString()): EntryMetricsMonth {
  const next = normalizeEntryMonth(month, current);
  next.count += 1;
  next.sumMs += payload.durationMs;
  next.buckets[entryBucket(payload.durationMs)] += 1;
  if (payload.blockedMoments > 0) next.blockedEntries += 1;
  next.blockedMomentsSum += payload.blockedMoments;
  for (const helper of payload.helpers) if (isEntryHelper(helper)) next.helpers[helper] = (next.helpers[helper] || 0) + 1;
  next.devices[payload.device] += 1;
  next.modes[payload.mode] += 1;
  next.updatedAt = at;
  return next;
}

/* ── قراءةُ الشهر للبطاقة ──────────────────────────────────────────────────── */

/** متوسطُ الموعد بالثواني، أو null لشهرٍ بلا قياس. */
export function entryAverageSeconds(month: EntryMetricsMonth | null | undefined): number | null {
  if (!month || !month.count) return null;
  return Math.round(month.sumMs / month.count / 1000);
}

/** نسبةُ ما اصطدم بمانعٍ مرةً على الأقل (0..100)، أو null. */
export function entryBlockedShare(month: EntryMetricsMonth | null | undefined): number | null {
  if (!month || !month.count) return null;
  return Math.round((Math.min(month.blockedEntries, month.count) / month.count) * 100);
}

/** أكثرُ الأدوات عوناً، بالترتيب. */
export function topEntryHelpers(month: EntryMetricsMonth | null | undefined, limit = 3): Array<{ name: HelperName; count: number }> {
  if (!month) return [];
  return ENTRY_HELPERS
    .map(name => ({ name, count: Number(month.helpers?.[name] || 0) }))
    .filter(row => row.count > 0)
    .sort((a, b) => b.count - a.count || ENTRY_HELPERS.indexOf(a.name) - ENTRY_HELPERS.indexOf(b.name))
    .slice(0, Math.max(0, limit));
}

/* ── العدّاد في النموذج ─────────────────────────────────────────────────────── */

/* كم بقيت الصفحةُ مخفيّةً منذ تحميلها: مستمعٌ واحدٌ للتطبيق كله، لا مستمعٌ لكل عدّاد —
   فعدّادٌ يُترك بلا finish (نموذجٌ أُلغي) لا يترك وراءه شيئاً. */
let hiddenTotalMs = 0;
let hiddenSince: number | null = null;
let watchingVisibility = false;
function hiddenSoFar(now: number): number {
  if (typeof document === "undefined") return 0;
  if (!watchingVisibility) {
    watchingVisibility = true;
    if (document.visibilityState === "hidden") hiddenSince = now;
    try {
      document.addEventListener("visibilitychange", () => {
        const at = Date.now();
        if (document.visibilityState === "hidden") { if (hiddenSince === null) hiddenSince = at; }
        else if (hiddenSince !== null) { hiddenTotalMs += Math.max(0, at - hiddenSince); hiddenSince = null; }
      });
    } catch { /* بلا مستمع: يُحسب الوقتُ كلُّه، ولا يتعطّل شيء */ }
  }
  return hiddenTotalMs + (hiddenSince !== null ? Math.max(0, now - hiddenSince) : 0);
}

export interface EntryMeter {
  /** أداةٌ أعانت على هذا الموعد (تُعدّ مرةً واحدة مهما تكرّرت). */
  mark(helper: HelperName): void;
  /** حالُ المانع الآن: يُعدّ الدخولُ في المانع، لا بقاؤه فيه. */
  blocked(isBlocked: boolean): void;
  /** القياسُ عند الحفظ — مرةً واحدة؛ والنداءُ الثاني null. */
  finish(): EntryMeasurePayload | null;
}

export function createEntryMeter(mode: EntryMode, options: { now?: () => number; width?: () => number } = {}): EntryMeter {
  const clock = options.now || Date.now;
  /* الوقتُ المخفيّ يُطرح بساعة المتصفح نفسها؛ ساعةٌ مُمرَّرة (الاختبار) تُقاس كما هي. */
  const subtractHidden = !options.now;
  const startedAt = clock();
  const hiddenAtStart = subtractHidden ? hiddenSoFar(startedAt) : 0;
  const helpers: HelperName[] = [];
  let blockedMoments = 0;
  let inBlock = false;
  let done = false;
  const safeMode: EntryMode = mode === "edit" ? "edit" : "create";
  return {
    mark(helper) {
      if (done || !isEntryHelper(helper) || helpers.includes(helper)) return;
      helpers.push(helper);
    },
    blocked(isBlocked) {
      if (done) return;
      const next = Boolean(isBlocked);
      if (next && !inBlock) blockedMoments = Math.min(ENTRY_BLOCKED_MAX, blockedMoments + 1);
      inBlock = next;
    },
    finish() {
      if (done) return null;
      done = true;
      try {
        const end = clock();
        const hidden = subtractHidden ? Math.max(0, hiddenSoFar(end) - hiddenAtStart) : 0;
        const durationMs = Math.round(Math.min(ENTRY_DURATION_MAX_MS, Math.max(0, end - startedAt - hidden)));
        if (!Number.isFinite(durationMs)) return null;
        return { durationMs, blockedMoments, helpers: [...helpers], device: entryDevice(options.width ? options.width() : undefined), mode: safeMode };
      } catch {
        return null;
      }
    },
  };
}

/** يرسل القياس ولا ينتظره: لا خطأ يصل أحداً، ويصل ولو أُغلقت الصفحة بعده (keepalive). */
export function sendEntryMeasure(payload: EntryMeasurePayload | null | undefined): void {
  if (!payload || typeof fetch !== "function") return;
  try {
    void fetch("/api/metrics/appointment-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: true,
      body: JSON.stringify(payload),
    }).catch(() => undefined);
  } catch { /* القياسُ لا يُفسد حفظاً */ }
}
