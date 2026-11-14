/**
 * ── «سلامة الميزات الجديدة»: التجميعُ صرفاً ───────────────────────────────────
 * ست بطاقاتٍ تقول هل الميزاتُ المُطلَقة حديثاً تُستعمل وتعمل فعلاً في الفصل الجاري: تنبيهات الهاتف، شارك مرشدك،
 * رموزُ استعادة الأقسام، قاعاتٌ بلا سعة، بطاقاتُ الأساتذة، ومساري. دوالُّ خالصة بلا قاعدة بيانات ولا ساعة، فتُختبر وحدها؛
 * والخادمُ (src/server/featureHealth.ts) يقرأ ويستدعيها.
 *
 * الخصوصية: **أعدادٌ فقط**. لا اسمَ ولا رقمَ مدنياً ولا بصمةً ولا رمزاً ولا نصَّ رسالةٍ في أيّ خرج؛ والمدخلُ يُنتقى منه
 * حقلاً حقلاً فلا يمرّ شيءٌ لم يُسمَّ هنا (مثلاً سجلُّ الاستعادة يُقرأ منه زمنُ الإصدار والاستعمال فقط، لا اسمُ الموظف).
 */
import type { StudentProfile } from "../types";
import { termWindow } from "./termSequence";
import { pushMarkerKey, PUSH_TO_HOUR, STUDENT_PUSH_KINDS, WISHES_MORNING_UNTIL, type StudentPushKind } from "./studentPush";
import { cardPulse, type PulseRow } from "./cardPulse";
import type { CapacityGapReport } from "./roomCapacityGaps";

export type FeatureTileId = "push" | "share" | "recovery" | "rooms" | "cards" | "masari";
export const FEATURE_TILE_IDS: readonly FeatureTileId[] = ["push", "share", "recovery", "rooms", "cards", "masari"];
export const FEATURE_TILE_TITLES: Record<FeatureTileId, string> = {
  push: "تنبيهات الهاتف",
  share: "شارك مرشدك",
  recovery: "رموز الاستعادة",
  rooms: "قاعات بلا سعة",
  cards: "بطاقات الأساتذة",
  masari: "مساري",
};

/** مدةُ التخبئة في الخادم؛ والواجهةُ تنعش كل دقيقةٍ والتبويبُ ظاهر. */
export const FEATURE_CACHE_MS = 60_000;
export const FEATURE_REFRESH_MS = 60_000;
/** رمزُ استعادةٍ صالحٌ ينتهي خلال هذه المدة ولم يُستعمل بعد: «ينتهي دون استعمال». */
export const RECOVERY_EXPIRING_MS = 6 * 3_600_000;
/** نسبةُ القاعات بلا سعةٍ التي تُنبّه عندها البطاقة. */
export const ROOMS_ATTENTION_PERCENT = 30;
/** عدّاداتُ الأيام لا تحتفظ بأكثر من هذا (يكفي فصلاً). */
export const FEATURE_DAY_KEEP = 120;
const DAY_MS = 86_400_000;

/* ── عدّاداتُ الأيام (تُكتب على ملف الطالب: أرقامٌ لكل يوم، بلا هوية) ─────────────────────────────── */
/** يزيد عدّادَ يومٍ ويُبقي آخرَ ١٢٠ يوماً. يرجع خريطةً جديدة (لا يُغيّر المدخل). */
export function bumpDay(map: Record<string, number> | undefined, day: string, by = 1): Record<string, number> {
  const next: Record<string, number> = { ...(map || {}) };
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) next[day] = (Number(next[day]) || 0) + by;
  const days = Object.keys(next).sort();
  for (const old of days.slice(0, Math.max(0, days.length - FEATURE_DAY_KEEP))) delete next[old];
  return next;
}

/* ── نطاقُ «الفصل الجاري» ─────────────────────────────────────────────────────────── */
export interface FeatureRange { from: number; to: number }

/** نافذةُ الفصل إن عُرفت، وإلا آخرُ ١٢٠ يوماً (فلا تُخطئ البطاقةُ بصفرٍ لأن الفصل بلا تواريخ). */
export function featureRange(term: Parameters<typeof termWindow>[0], now: number): FeatureRange {
  const window = termWindow(term);
  return window ? { from: window.from, to: window.to } : { from: now - FEATURE_DAY_KEEP * DAY_MS, to: now + DAY_MS };
}
const inRange = (ms: number, range: FeatureRange) => Number.isFinite(ms) && ms >= range.from && ms < range.to;
const dayInRange = (day: string, range: FeatureRange) => inRange(Date.parse(`${day}T12:00:00Z`), range);
const sumDays = (map: Record<string, number> | undefined, range: FeatureRange): number =>
  Object.entries(map || {}).reduce((sum, [day, n]) => sum + (dayInRange(day, range) ? Math.max(0, Number(n) || 0) : 0), 0);

/* ── الحمولة ───────────────────────────────────────────────────────────────────── */
export interface FeatureTile {
  id: FeatureTileId;
  /** false = تعذّرت قراءةُ مصدرها (البطاقةُ وحدها تُظهر «تعذّرت القراءة»). */
  ok: boolean;
  /** «انتبه»: شيءٌ ليس على ما يُرام. */
  attention: boolean;
  /** أرقامٌ وعلاماتٌ منطقية فقط. */
  v: Record<string, number | boolean | null>;
}

export interface FeaturePayload {
  generatedAt: string;
  demo: boolean;
  /** الفصل الجاري (معرّفُه) أو 0 إن لم يوجد. */
  termId: number;
  tiles: FeatureTile[];
}

export const unreadableTile = (id: FeatureTileId): FeatureTile => ({ id, ok: false, attention: false, v: {} });

export type FeatureProfile = Partial<Pick<StudentProfile, "push" | "pushOn" | "share" | "shareStats" | "recoveryLog" | "recovery" | "createdAt" | "wishes">>;

/* ── ١) تنبيهات الهاتف ─────────────────────────────────────────────────────────── */
export interface PushExpectation {
  /** الساعةُ بتوقيت الكويت (0…23). */
  hour: number;
  /** اليومُ آخرُ يومٍ للرغبات (يُنتظر «الرغبات تُغلق اليوم»). */
  wishesCloseToday: boolean;
  /** يبدأ دورُ تسجيلٍ غداً (يُنتظر «يبدأ تسجيلك غداً»). */
  roundTomorrow: boolean;
}

export function pushTile(profiles: readonly FeatureProfile[], termId: number, range: FeatureRange, configured: boolean, expect: PushExpectation): FeatureTile {
  let enabled = 0, removed = 0;
  const sent: Record<StudentPushKind, number> = { "wishes-close": 0, "round-tomorrow": 0, "plan-ready": 0 };
  for (const profile of profiles) {
    if ((profile.push?.subs?.length || 0) > 0) enabled += 1;
    removed += sumDays(profile.push?.removedDays, range);
    for (const kind of STUDENT_PUSH_KINDS) {
      /* «baseline» علامةٌ مُسبقة لا رسالة. */
      const at = profile.push?.sent?.[pushMarkerKey(termId, kind)];
      if (at && Number.isFinite(Date.parse(at))) sent[kind] += 1;
    }
  }
  const missedWishes = configured && enabled > 0 && expect.wishesCloseToday && expect.hour >= WISHES_MORNING_UNTIL && sent["wishes-close"] === 0;
  const missedRound = configured && enabled > 0 && expect.roundTomorrow && expect.hour >= PUSH_TO_HOUR && sent["round-tomorrow"] === 0;
  return {
    id: "push", ok: true, attention: missedWishes || missedRound,
    v: {
      configured, enabled, removed,
      wishes: sent["wishes-close"], round: sent["round-tomorrow"], plan: sent["plan-ready"],
      sent: sent["wishes-close"] + sent["round-tomorrow"] + sent["plan-ready"],
    },
  };
}

/* ── ٢) شارك مرشدك ─────────────────────────────────────────────────────────────── */
export function shareTile(profiles: readonly FeatureProfile[], range: FeatureRange, now: number): FeatureTile {
  let created = 0, valid = 0, opened = 0;
  for (const profile of profiles) {
    created += sumDays(profile.shareStats?.made, range);
    opened += sumDays(profile.shareStats?.opens, range);
    if (profile.share && Date.parse(profile.share.expiresAt) > now) valid += 1;
  }
  return { id: "share", ok: true, attention: false, v: { created, valid, opened } };
}

/* ── ٣) رموزُ الاستعادة ────────────────────────────────────────────────────────── */
/** من سجلّ الإصدار وحده: لا اسمَ ولا رمزَ يُقرأ. المنتهي والمُلغى (بجديدٍ بعده أو بتغيير الرمز) صنفٌ واحد. */
export function recoveryTile(profiles: readonly FeatureProfile[], range: FeatureRange, now: number): FeatureTile {
  let issued = 0, used = 0, lapsed = 0, expiringSoon = 0;
  for (const profile of profiles) {
    const log = profile.recoveryLog || [];
    log.forEach((entry, index) => {
      if (!inRange(Date.parse(entry.at), range)) return;
      issued += 1;
      if (entry.usedAt) { used += 1; return; }
      const live = index === log.length - 1 && profile.recovery && profile.recovery.issuedAt === entry.at;
      const expiresAt = live ? Date.parse(profile.recovery!.expiresAt) : NaN;
      if (live && expiresAt > now) { if (expiresAt - now <= RECOVERY_EXPIRING_MS) expiringSoon += 1; return; }
      lapsed += 1;
    });
  }
  return { id: "recovery", ok: true, attention: expiringSoon > 0, v: { issued, used, lapsed, expiringSoon, pending: issued - used - lapsed } };
}

/* ── ٤) قاعاتٌ بلا سعة ─────────────────────────────────────────────────────────── */
/** النسبةُ هنا نسبةُ **النقص** (من القاعات المعتمدة الفعّالة). الاتجاهُ لا يُحسب: لا تاريخَ محفوظاً له. */
export function roomsTile(report: Pick<CapacityGapReport, "total" | "missing">): FeatureTile {
  const percent = report.total > 0 ? Math.round((report.missing / report.total) * 100) : null;
  return {
    id: "rooms", ok: true, attention: report.total > 0 && report.missing / report.total > ROOMS_ATTENTION_PERCENT / 100,
    v: { total: report.total, missing: report.missing, percent },
  };
}

/* ── ٥) بطاقاتُ الأساتذة ───────────────────────────────────────────────────────── */
/** فُتحت = فتح الأستاذُ فما بعد؛ أُرسلت = أرسل فما بعد؛ سُوّيت = قُرّر في كل بنودها. */
export function cardsTile(rows: readonly PulseRow[]): FeatureTile {
  const { total, counts } = cardPulse(rows);
  const sent = counts.sent + counts.awaiting + counts.complete;
  return { id: "cards", ok: true, attention: false, v: { total, opened: counts.opened + sent, sent, settled: counts.complete } };
}

/* ── ٦) مساري ──────────────────────────────────────────────────────────────────── */
export function masariTile(profiles: readonly FeatureProfile[], termId: number, range: FeatureRange): FeatureTile {
  let created = 0, withWishes = 0;
  for (const profile of profiles) {
    if (inRange(Date.parse(String(profile.createdAt || "")), range)) created += 1;
    if (termId && profile.wishes && Number(profile.wishes.termId) === termId && (profile.wishes.courseIds?.length || 0) > 0) withWishes += 1;
  }
  return { id: "masari", ok: true, attention: false, v: { profiles: profiles.length, created, withWishes } };
}

export function buildFeaturePayload(tiles: readonly FeatureTile[], termId: number, now: number, demo: boolean): FeaturePayload {
  const byId = new Map(tiles.map(tile => [tile.id, tile]));
  return { generatedAt: new Date(now).toISOString(), demo, termId, tiles: FEATURE_TILE_IDS.map(id => byId.get(id) || unreadableTile(id)) };
}

/** مصدرٌ واحدٌ يفشل لا يُسقط غيرَه: كلُّ بطاقةٍ في try/catch خاص بها. */
export async function runTileProbes(probes: ReadonlyArray<{ id: FeatureTileId; run: () => Promise<FeatureTile> | FeatureTile }>): Promise<FeatureTile[]> {
  return Promise.all(probes.map(async probe => {
    try { return await probe.run(); } catch { return unreadableTile(probe.id); }
  }));
}

/** الخرجُ كلُّه أعدادٌ: يفحص هذا أن لا مفتاحَ يدلّ على هوية (للاختبار وللحارس). */
export const FEATURE_FORBIDDEN_KEY = /civil|fingerprint|name|token|secret|hash|endpoint|auth|p256|email|phone|body|message|byId|byName|userId|studentId/i;
