/**
 * ── اختيارُ الرئيس الجديد بالبحث (docs/SEATS.md) ─────────────────────────────
 *
 * الأسماءُ لا تُعرض مقدّماً: يكتب المسؤول حرفين فأكثر فتظهر أقلُّ من تسعةِ مطابقين، ولا يُقال كم في النطاق.
 * هنا المنطقُ الصافي (يشاركه الخادمُ والاختبار)؛ والنطاقُ يحرسه الخادمُ في seatsRoutes.
 */
import { whatsappNumber } from "./seats";

export const HANDOVER_SEARCH_MIN = 2;
export const HANDOVER_SEARCH_MAX_RESULTS = 8;

/** مفتاحُ مقارنة الاسم: بلا تشكيل ولا تطويل، والألفُ والياءُ والتاءُ المربوطةُ صورةً واحدة. */
export function handoverSearchKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[ً-ٰٟـ‌-‏]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/[.,،\-()]/g, " ")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

/** كلماتُ البحث: لا بحثَ بلا كلمةٍ من حرفين فأكثر، وما دونها من الحروف يُهمل (والرقمُ المفرد يُقبل) (فلا يُعدَّد النطاقُ بحرفٍ واحدٍ متكرّر). */
export function handoverSearchTokens(query: unknown): string[] {
  const all = handoverSearchKey(query).split(" ").filter(Boolean);
  if (!all.some(token => token.length >= HANDOVER_SEARCH_MIN)) return [];
  return all.filter(token => token.length >= HANDOVER_SEARCH_MIN || /\d/.test(token)).slice(0, 5);
}

export interface HandoverCandidate { id: number; name: string; department: string; hasMobile: boolean }

/** المطابقون لكل كلمات البحث، من يبدأ اسمُه بها أولاً، وبسقفٍ ثابت. لا قائمةَ كاملة ولا عدّاد. */
export function matchHandoverCandidates<T extends { id: number; name: string }>(pool: T[], query: unknown, limit = HANDOVER_SEARCH_MAX_RESULTS): T[] {
  const tokens = handoverSearchTokens(query);
  if (!tokens.length) return [];
  const scored: Array<{ row: T; rank: number }> = [];
  for (const row of pool) {
    const key = handoverSearchKey(row.name);
    const words = key.split(" ");
    if (!tokens.every(token => key.includes(token))) continue;
    scored.push({ row, rank: tokens.every(token => words.some(word => word.startsWith(token))) ? 0 : 1 });
  }
  return scored.sort((a, b) => a.rank - b.rank || a.row.name.localeCompare(b.row.name, "ar")).slice(0, Math.max(0, limit)).map(entry => entry.row);
}

/**
 * جوالُ الرئيس الجديد: من سجلّ الأستاذ إن وُجد (وما يُكتب في الطلب يُهمَل)،
 * وإلا فلا بدّ من رقمٍ كويتيٍّ صحيح يكتبه المسؤول مرةً واحدة.
 */
export function resolveHandoverPhone(recordMobile: unknown, bodyMobile: unknown): { mobile: string } | { error: string } {
  const onFile = String(recordMobile ?? "").trim();
  if (onFile) return { mobile: onFile.slice(0, 20) };
  const typed = String(bodyMobile ?? "").trim();
  if (!typed) return { error: "لا جوال لهذا الأستاذ في السجل. اكتب جواله." };
  if (!whatsappNumber(typed)) return { error: "اكتب جوالاً كويتياً من ثمانية أرقام." };
  return { mobile: typed.slice(0, 20) };
}
