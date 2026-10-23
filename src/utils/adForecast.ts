/**
 * ── حاسبة «ماذا ستحصل؟» ─────────────────────────────────────────────────────────
 *
 * تقديرٌ لحملةٍ جديدة من **سجلّ الموقع الفعلي**: مجموعُ ظهور الموقع كل يوم (من حملاته كلها)، وحصّتُها منه بحسب عدد الحملات
 * العاملة فيه الآن. يُعرض مدىً (الربيع الأدنى والأعلى للأيام) لا رقماً واحداً، ويُسمّى تقديراً. إن قلّت الأيام المقيسة أو لم يُقس
 * الموقع، لا يُخترع رقم. نقيٌّ بلا شبكة ولا قاعدة بيانات.
 */
import type { AdCampaign, AdStatsDay } from "../types";
import type { CalendarItem } from "./adSeasons";
import { expectedShare } from "./adsEngine";

/** أقل عددٍ من الأيام المقيسة (بظهور) ليُبنى عليه تقدير. */
export const FORECAST_MIN_DAYS = 7;
/** أقل عددٍ من أيام الموسم نفسه ليُبنى عليه التقدير حين يُختار موسم. */
export const FORECAST_MIN_SEASON_DAYS = 5;
export const FORECAST_WEEKS = [1, 2, 4] as const;

export interface Range { low: number; high: number }
export type Forecast =
  | { ok: false; reason: "no-data" | "bad-slot"; basisDays: number }
  | { ok: true; days: number; impressions: Range; clicks: Range; basisDays: number; share: number; seasonUsed: boolean; seasonNote: string };

/** الربيع (percentile) بالاستيفاء الخطي على قائمةٍ مرتّبة. */
export function quantile(sorted: readonly number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** موسمُ اليوم من نوافذ التقويم (الأول المطابق)، أو "". */
export const seasonOfDay = (day: string, windows: readonly Pick<CalendarItem, "season" | "from" | "to">[]): string =>
  windows.find(w => w.from <= day && day <= w.to)?.season || "";

export function forecastSlot(args: {
  slotId: string; weeks: number; season?: string;
  campaigns: readonly AdCampaign[]; stats: readonly AdStatsDay[];
  /** كم حملةً عاملةً الآن في الموقع. */
  liveNow: number;
  /** نوافذ المواسم كلها (الماضية أيضاً) لتصنيف الأيام. */
  windows?: readonly Pick<CalendarItem, "season" | "from" | "to">[];
}): Forecast {
  const inSlot = new Set(args.campaigns.filter(c => c.slot === args.slotId).map(c => c.id));
  if (!inSlot.size) return { ok: false, reason: "no-data", basisDays: 0 };
  const perDay = new Map<string, { impressions: number; clicks: number }>();
  for (const r of args.stats) {
    if (!inSlot.has(r.campaignId)) continue;
    const cur = perDay.get(r.day) || { impressions: 0, clicks: 0 };
    cur.impressions += r.impressions; cur.clicks += r.clicks;
    perDay.set(r.day, cur);
  }
  const all = [...perDay.entries()].filter(([, v]) => v.impressions > 0);
  if (all.length < FORECAST_MIN_DAYS) return { ok: false, reason: "no-data", basisDays: all.length };

  const seasonal = args.season ? all.filter(([day]) => seasonOfDay(day, args.windows || []) === args.season) : [];
  const useSeason = seasonal.length >= FORECAST_MIN_SEASON_DAYS;
  const basis = useSeason ? seasonal : all;
  const totals = basis.map(([, v]) => v.impressions).sort((a, b) => a - b);
  const impressions = basis.reduce((n, [, v]) => n + v.impressions, 0);
  const clicks = basis.reduce((n, [, v]) => n + v.clicks, 0);
  const ctr = impressions > 0 ? clicks / impressions : 0;

  const days = Math.max(1, Math.round(args.weeks)) * 7;
  const share = expectedShare(args.slotId, args.liveNow + 1);
  const low = Math.round(quantile(totals, 0.25) * share * days);
  const high = Math.round(quantile(totals, 0.75) * share * days);
  /* نسبة النقر مدىً نسبي ±25%: العيّنة الصغيرة لا تُنتج رقماً حاداً. */
  return {
    ok: true, days, basisDays: basis.length, share, seasonUsed: useSeason,
    impressions: { low, high },
    clicks: { low: Math.round(low * ctr * 0.75), high: Math.round(high * ctr * 1.25) },
    seasonNote: !args.season ? "من كل الأيام المقيسة للموقع" : useSeason ? "من أيام هذا الموسم الفعلية" : "لا أيام كافية في هذا الموسم بعد؛ التقدير من كل الأيام المقيسة",
  };
}
