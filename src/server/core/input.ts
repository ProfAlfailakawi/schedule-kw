/**
 * ── تنظيفُ المدخلات وحدودُها ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { toEnglishDigits } from "../../utils/digits";

/**
 * ── التحقق من المدخلات: قاعدة واحدة في مكان واحد ─────────────────────────────
 *
 * Reference-data CRUD used to check only that a field was truthy, then hand the
 * raw value to Firestore. That accepted an unbounded string, an array or object
 * where a name belongs, and — because `parseInt("abc")` is `NaN` and `NaN` is
 * not caught by a truthiness test — wrote `NaN` into numeric columns, which then
 * poisons every later calculation that reads them.
 *
 * These three helpers are the whole rule. They return `null` for "not
 * acceptable" so a caller can answer with one clear Arabic sentence naming the
 * field, instead of storing something nobody can explain later.
 */
/* The longest real college name in the register is 32 characters
   («كلية الدراسات التكنولوجية - بنات»). 120 leaves generous room for a longer
   branch or a renamed faculty while refusing the pathological case. */
export const TEXT_LIMIT = { name: 120, code: 40 } as const;

/** A real, trimmed, bounded string — or null. Numbers are accepted (a code may
 *  arrive as one) but objects, arrays, booleans and blank text never are. */
export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!text || text.length > max) return null;
  return text;
}

/** A whole number inside [min,max]. Arabic-Indic digits are normalised first, so
 *  «٤٥» is the same input as "45". Empty means "not stated" → `fallback`. */
export function boundedInt(value: unknown, min: number, max: number, fallback: number | null = null): number | null {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(toEnglishDigits(value).trim());
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}
