/**
 * ── الترتيبُ العربي للأسماء والفصول ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { sortByName } from "../../utils/sorting";
import type { FSchedule } from "../../types";

// User-facing reference lists follow one ordering contract everywhere: Arabic
// alphabetic order for names, and newest-to-oldest for academic terms. Keeping
// it at the API boundary prevents one picker from silently drifting away from
// another screen that consumes the same data.
export const arabicUiCollator = new Intl.Collator("ar", { numeric: true, sensitivity: "base", ignorePunctuation: true });
export const foldHeaderIdentity = (value: unknown) => String(value ?? "").normalize("NFKC")
  .replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
  .replace(/[ً-ْـ]/g, "").replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
  .replace(/(?:^|\s)(?:قسم|القسم|كليه|كلية)(?=\s|$)/g," ")
  .replace(/[^ء-ي0-9a-zA-Z ]/g," ").replace(/\s+/g," ").trim().toLowerCase();
const isSpecialEducationIdentity = (value: unknown) => {
  const folded=foldHeaderIdentity(value);
  return /(?:^|\s)التربيه\s+الخاصه(?:\s|$)/.test(folded)||/(?:^|\s)تربيه\s+خاصه(?:\s|$)/.test(folded);
};
/**
 * One academic-section identity rule for import headers and student proofs.
 * Special Education is the deliberate umbrella exception: programme labels
 * such as «اسلامية تربية خاصة» or «لغة عربية تربية خاصة» belong to the one
 * canonical system department «قسم التربية الخاصة». A Special-Education
 * programme must never match Islamic Education / Arabic merely because it also
 * contains that subject word.
 */
export const academicSectionNameMatches = (observed: unknown, canonical: unknown) => {
  const source=foldHeaderIdentity(observed),target=foldHeaderIdentity(canonical);
  if(!source||!target)return false;
  const sourceSpecial=isSpecialEducationIdentity(source),targetSpecial=isSpecialEducationIdentity(target);
  if(sourceSpecial||targetSpecial)return sourceSpecial&&targetSpecial;
  if(source.includes(target)||target.includes(source))return true;
  const loose=(token:string)=>token.replace(/^ال(?=\S{3,})/,"");
  const generic=new Set(["تربيه","تعليم","عامه","علمي"]);
  const sourceTokens=source.split(" ").map(loose).filter(Boolean);
  const tokens=target.split(" ").map(loose).filter(token=>token.length>=4&&!generic.has(token));
  return tokens.length>0&&tokens.every(token=>sourceTokens.includes(token));
};
export const sortArabicNamed = <T>(rows: readonly T[], pick: (row: T) => unknown): T[] =>
  sortByName(rows, pick);
export const verifiedRoomKey = (row: Partial<FSchedule>): string =>
  row.roomId && row.locationStatus !== "PENDING_ROOM" && row.locationStatus !== "LOCATION_REVIEW_REQUIRED" && row.locationStatus !== "INVALID_HISTORICAL"
    ? `id:${row.roomId}`
    : "";
const verifiedBuildingKey = (row: Partial<FSchedule>): string =>
  row.buildingId && row.locationStatus !== "LOCATION_REVIEW_REQUIRED" && row.locationStatus !== "INVALID_HISTORICAL"
    ? `id:${row.buildingId}`
    : "";
export const termChronologyServer = (term: any) => {
  const name = String(term?.AdTermName || "");
  const years = name.match(/(\d{4})\s*\/\s*(\d{4})/);
  const season = name.includes("الصيفي") ? 3 : name.includes("الثاني") ? 2 : name.includes("الأول") ? 1 : 0;
  return years ? Number(years[1]) * 10 + season : Number(term?.AdTermId || 0);
};
export const sortTermsNewestServer = <T extends { AdTermId?: unknown; AdTermName?: unknown }>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => termChronologyServer(b) - termChronologyServer(a) || Number(b.AdTermId || 0) - Number(a.AdTermId || 0));

// --- COURSES API ---

export const courseNameCollator = new Intl.Collator("ar", { numeric: true, sensitivity: "base", ignorePunctuation: true });
export const sortCoursesByName = <T extends { CourseName?: unknown }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => courseNameCollator.compare(String(a.CourseName || "").trim(), String(b.CourseName || "").trim()));
