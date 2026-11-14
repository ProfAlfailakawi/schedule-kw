/**
 * ── «سلامة الميزات الجديدة»: نموذجُ العرض ─────────────────────────────────────
 * يحوّل بطاقةً من الحمولة إلى ما ترسمه الواجهة: رقمٌ كبير وكلمةٌ واحدة، وحلقةٌ حيث تنفع، وأشرطةٌ قليلة، وسطرُ «انتبه» إن لزم.
 * خالصٌ بلا React ولا شبكة فيُختبر وحدَه. الأرقامُ لاتينية دائماً (لا تُكتب هنا أرقامٌ عربية-هندية ولا «٪»).
 */
import { FEATURE_TILE_TITLES, type FeatureTile, type FeatureTileId } from "./featureHealth";

export type TileTone = "ok" | "warn" | "unknown" | "idle" | "empty";

export interface TileBar { key: string; label: string; value: number; max: number; zero: boolean }
export interface TileChip { key: string; label: string; value: number; zero: boolean }

export interface TileView {
  id: FeatureTileId;
  title: string;
  tone: TileTone;
  /** الرقمُ الكبير (نصٌّ لاتيني) أو null حين لا رقمَ يُعرض. */
  big: string | null;
  bigLabel: string;
  /** حلقةٌ من صفر إلى مئة، أو null. */
  ring: number | null;
  ringLabel: string;
  bars: TileBar[];
  chips: TileChip[];
  /** جملةٌ قصيرة تحت الرقم (غير مفعّل، لا بيانات بعد، …). */
  note: string;
  /** تلميحٌ من سطرٍ واحد. */
  hint: string;
  /** هل في البطاقة ما يُنبّه؟ */
  attention: boolean;
  /** سطرُ «انتبه» (فارغٌ ما لم تنبّه). */
  attentionLine: string;
}

const num = (tile: FeatureTile, key: string): number => Math.max(0, Number(tile.v[key]) || 0);
const bar = (tile: FeatureTile, key: string, label: string, max: number): TileBar => ({ key, label, value: num(tile, key), max: Math.max(1, max), zero: num(tile, key) === 0 });
const chip = (tile: FeatureTile, key: string, label: string): TileChip => ({ key, label, value: num(tile, key), zero: num(tile, key) === 0 });
const latin = (n: number) => String(Math.round(n));
const percentOf = (part: number, whole: number) => (whole > 0 ? Math.min(100, Math.max(part > 0 ? 1 : 0, Math.round((part / whole) * 100))) : 0);

const BASE = (id: FeatureTileId): TileView => ({
  id, title: FEATURE_TILE_TITLES[id], tone: "ok", big: null, bigLabel: "", ring: null, ringLabel: "", bars: [], chips: [], note: "", hint: "", attention: false, attentionLine: "",
});

export const FEATURE_EMPTY_NOTE = "لا بيانات بعد";
export const FEATURE_UNREADABLE_NOTE = "تعذّرت القراءة";
export const PUSH_OFF_NOTE = "غير مفعّل: لا مفاتيح إرسال";
export const PUSH_OFF_HINT = "تُضبط مفاتيح الإرسال على الخادم.";

export function tileView(tile: FeatureTile): TileView {
  const view = BASE(tile.id);
  if (!tile.ok) return { ...view, tone: "unknown", note: FEATURE_UNREADABLE_NOTE };
  const allZero = Object.values(tile.v).every(value => typeof value === "boolean" || !value);
  switch (tile.id) {
    case "push": {
      if (!tile.v.configured) return { ...view, tone: "idle", note: PUSH_OFF_NOTE, hint: PUSH_OFF_HINT };
      const sent = num(tile, "sent");
      const max = Math.max(num(tile, "wishes"), num(tile, "round"), num(tile, "plan"));
      return {
        ...view, big: latin(sent), bigLabel: "أُرسلت هذا الفصل",
        bars: [bar(tile, "wishes", "إغلاق الرغبات", max), bar(tile, "round", "التسجيل غداً", max), bar(tile, "plan", "الجدول جاهز", max)],
        chips: [chip(tile, "enabled", "مفعّلة"), chip(tile, "removed", "أجهزة أُزيلت")],
        tone: tile.attention ? "warn" : sent === 0 && num(tile, "enabled") === 0 ? "empty" : "ok",
        note: sent === 0 && num(tile, "enabled") === 0 ? FEATURE_EMPTY_NOTE : "",
        attention: tile.attention, attentionLine: tile.attention ? "تذكيرٌ لم يُرسل اليوم" : "",
      };
    }
    case "share": {
      const max = Math.max(num(tile, "created"), num(tile, "valid"), num(tile, "opened"));
      return {
        ...view, big: latin(num(tile, "opened")), bigLabel: "فتحها المرشدون",
        bars: [bar(tile, "created", "أُنشئت", max), bar(tile, "valid", "صالحة الآن", max), bar(tile, "opened", "فُتحت", max)],
        tone: allZero ? "empty" : "ok", note: allZero ? FEATURE_EMPTY_NOTE : "",
      };
    }
    case "recovery": {
      const issued = num(tile, "issued");
      return {
        ...view, big: latin(issued), bigLabel: "أُصدرت هذا الفصل",
        bars: [bar(tile, "used", "استُعملت", issued), bar(tile, "lapsed", "انتهت أو أُلغيت", issued), bar(tile, "pending", "بانتظار الطالب", issued)],
        tone: tile.attention ? "warn" : issued === 0 ? "empty" : "ok", note: issued === 0 ? FEATURE_EMPTY_NOTE : "",
        attention: tile.attention, attentionLine: tile.attention ? "رمزٌ ينتهي دون استعمال" : "",
      };
    }
    case "rooms": {
      const total = num(tile, "total"), missing = num(tile, "missing");
      if (total === 0) return { ...view, tone: "empty", note: FEATURE_EMPTY_NOTE };
      const percent = percentOf(missing, total);
      return {
        ...view, big: latin(missing), bigLabel: "بلا سعة", ring: percent, ringLabel: `${percent}%`,
        note: `من أصل ${latin(total)}`,
        tone: tile.attention ? "warn" : "ok", attention: tile.attention, attentionLine: tile.attention ? "أكثر من 30% بلا سعة" : "",
      };
    }
    case "cards": {
      const total = num(tile, "total"), settled = num(tile, "settled");
      return {
        ...view, big: latin(settled), bigLabel: "سُوّيت", ring: total ? percentOf(settled, total) : null, ringLabel: total ? `${percentOf(settled, total)}%` : "",
        bars: [bar(tile, "opened", "فُتحت", total), bar(tile, "sent", "أُرسلت", total), bar(tile, "settled", "سُوّيت", total)],
        tone: total === 0 ? "empty" : "ok", note: total === 0 ? FEATURE_EMPTY_NOTE : `من أصل ${latin(total)}`,
      };
    }
    case "masari": {
      const profiles = num(tile, "profiles"), withWishes = num(tile, "withWishes");
      return {
        ...view, big: latin(profiles), bigLabel: "ملفات الطلبة", ring: profiles ? percentOf(withWishes, profiles) : null, ringLabel: profiles ? `${percentOf(withWishes, profiles)}%` : "",
        bars: [bar(tile, "created", "جديدة هذا الفصل", profiles), bar(tile, "withWishes", "لها رغبات", profiles)],
        tone: profiles === 0 ? "empty" : "ok", note: profiles === 0 ? FEATURE_EMPTY_NOTE : "",
      };
    }
  }
}

/** كلمةُ الحالة لقارئ الشاشة، لكل نغمةٍ كلمةٌ واحدة. */
export const TONE_WORD: Record<TileTone, string> = { ok: "سليم", warn: "انتبه", unknown: "تعذّرت القراءة", idle: "غير مفعّل", empty: "لا بيانات بعد" };
