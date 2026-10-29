/**
 * ── حرمُ الكلية الواحدة (docs/SEATS.md) ─────────────────────────────────────
 *
 * كلُّ حرمٍ في النظام كليةٌ قائمة بذاتها: «كلية التربية الأساسية - بنين»، «… - بنات»،
 * «… - الفحيحيل - بنات». ورئيسُ تسجيل الكلية قد يتابعها كلَّها من كرسيٍّ واحد. فتُجمع
 * الحرمُ بما قبل أول « - » في اسمها، ويُقال الجزءُ المشترك مرة ويصير الباقي وسماً قصيراً
 * (compactCampusLabels، كما في رأس المنتدبين).
 */
import { compactCampusLabels } from "./campusChips";

export interface CampusFamily {
  familyName: string;
  colleges: Array<{ collegeId: number; collegeName: string; chip: string }>;
}

const familyKeyOf = (name: string) => String(name || "").split(/\s+-\s+/)[0].trim();

export function campusFamilies(colleges: ReadonlyArray<{ AdCollegeId: number; AdCollegeName?: string }>): CampusFamily[] {
  const groups = new Map<string, Array<{ AdCollegeId: number; AdCollegeName?: string }>>();
  for (const college of colleges) {
    const key = familyKeyOf(String(college.AdCollegeName || "")) || `#${college.AdCollegeId}`;
    groups.set(key, [...(groups.get(key) || []), college]);
  }
  return [...groups.entries()].map(([key, rows]) => {
    const names = rows.map(row => String(row.AdCollegeName || `كلية ${row.AdCollegeId}`));
    const { base, chips } = compactCampusLabels(names);
    return {
      familyName: base || (rows.length === 1 ? names[0] : key),
      colleges: rows.map((row, index) => ({ collegeId: Number(row.AdCollegeId), collegeName: names[index], chip: rows.length > 1 ? (chips[index] || names[index]) : names[index] })),
    };
  }).sort((a, b) => a.familyName.localeCompare(b.familyName, "ar"));
}

/** اسمُ الكرسي لحرمٍ أو أكثر: «كلية التربية الأساسية» للحرم كلّها، واسمُ الحرم وحده إن كان واحداً. */
export function campusFamilyName(names: readonly string[]): string {
  const clean = names.map(name => String(name || "").trim()).filter(Boolean);
  if (clean.length <= 1) return clean[0] || "";
  const { base } = compactCampusLabels(clean);
  return base || clean.join("، ");
}
