/**
 * ── بنين أم بنات؟ ────────────────────────────────────────────────────────────
 *
 * حسابُ المرشد (ورئيسِ القسم) يشمل القسمَ في كليات البنين والبنات معاً، فقائمةٌ
 * بلا اسم الكلية لا تقول لمن هي. القاعدةُ واحدة: اسمُ الكلية أولاً («… - بنين»،
 * «… - بنات»، ومعها الجهراء والفحيحيل) — trackOf في collegeTrack.ts — ثم رمزُ
 * الموقع الرسمي (locationCollegePrefixes.ts): الخانةُ الثالثة 1 للبنين و2 للبنات
 * (011B بنين، 012B بنات، 0510 بنين، 0520 بنات). وما لا يُعرف يبقى بلا وسم.
 */
import { trackOf, type Track } from "./collegeTrack";
import { officialCollegeSitePrefix } from "./locationCollegePrefixes";

export type Campus = Exclude<Track, "">;

export function campusOf(collegeName: unknown, sitePrefix?: unknown): Campus | null {
  const name = String(collegeName ?? "");
  const byName = trackOf(name);
  if (byName) return byName;
  const prefix = String(sitePrefix || officialCollegeSitePrefix(name) || officialCollegeSitePrefix(name.replace(/^\s*كلية\s+/, "")) || "");
  const digit = prefix.charAt(2);
  return digit === "1" ? "boys" : digit === "2" ? "girls" : null;
}

export const CAMPUS_LABEL: Record<Campus, string> = { boys: "بنين", girls: "بنات" };
export const CAMPUS_ICON: Record<Campus, string> = { boys: "👨‍🎓", girls: "👩‍🎓" };
/** «👨‍🎓 بنين» — للقوائم المنسدلة التي لا تحمل وسماً ملوّناً. */
export const campusText = (campus: Campus | null) => (campus ? `${CAMPUS_ICON[campus]} ${CAMPUS_LABEL[campus]}` : "");
