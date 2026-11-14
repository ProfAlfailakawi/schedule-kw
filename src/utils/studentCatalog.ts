import { campusOf } from "./campus";
import { isCampusCollege, type Track } from "./collegeTrack";
import { byArabic } from "./sorting";

/**
 * ── قائمةُ الباب: كلياتُ الجامعة وأقسامُها كما هي في البيانات ──────────────────
 *
 * يختار الطالبُ كليتَه ثم قسمَه. لا اسمَ كليةٍ ولا رقمَها هنا: القائمةُ تُبنى من جدولَي الكليات والأقسام،
 * والمسارُ (بنين/بنات) قرينتُه اسمُ الكلية أو رمزُ موقعها الرسمي (campusOf)؛ وكليةٌ بلا مسارٍ (لا تنقسم) تبقى
 * بلا مسارٍ ولا تُخفى. كلُّ قسمٍ يبقى بمعرّفه هو: القسمُ نفسُه في كليتين (أو في موقعين) قسمان، لكلٍّ جدولُه وصحيفتُه.
 */
export interface DoorSectionIn { AdSectionId: number; AdCollegeId: number; AdSectionName: string; AdSectionCode?: string }
export interface DoorCollegeIn { AdCollegeId: number; AdCollegeName: string }
export interface DoorCollege { id: number; name: string; track: Track; family: string; sections: number }
export interface DoorSpecialization { id: number; name: string }

const clean = (value: unknown) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
/** عائلةُ الكلية: اسمُها بلا المسار والموقع، بأيّ شرطةٍ كانت («كلية التمريض - بنات» ← «كلية التمريض»). */
const familyOf = (name: string) => clean(name.replace(/\s*[-–—]\s*(بنات|بنين).*$/, "")) || name;

/** الكلياتُ التي لها أقسام، مرتّبةً: عائلةُ الكلية، ثم بنين قبل بنات، ثم الموقعُ الفرعي بعد الرئيسي. `track` يحصر المسارَ ويُبقي الكلياتِ بلا مسار. */
export function doorColleges(colleges: readonly DoorCollegeIn[], sections: readonly DoorSectionIn[], track: Track = ""): DoorCollege[] {
  const count = new Map<number, number>();
  for (const section of sections) count.set(Number(section.AdCollegeId), (count.get(Number(section.AdCollegeId)) || 0) + 1);
  const out: DoorCollege[] = [];
  for (const college of colleges) {
    const id = Number(college.AdCollegeId), name = clean(college.AdCollegeName);
    if (!name || !(count.get(id) || 0)) continue;
    const own: Track = campusOf(name) || "";
    if (track && own && own !== track) continue;
    out.push({ id, name, track: own, family: familyOf(name), sections: count.get(id)! });
  }
  const rank = (row: DoorCollege) => (row.track === "boys" ? 0 : row.track === "girls" ? 1 : 2) * 2 + (isCampusCollege(row.name) ? 1 : 0);
  return out.sort((a, b) => byArabic(a.family, b.family) || rank(a) - rank(b) || byArabic(a.name, b.name));
}

/**
 * أقسامُ كليةٍ واحدة بمعرّفاتها. اسمٌ مكرَّرٌ داخل الكلية نفسها يُميَّز برمز القسم (وإلا برقمه) فلا يلتبس اختيارٌ باختيار.
 */
export function doorSpecializations(collegeId: number, sections: readonly DoorSectionIn[]): DoorSpecialization[] {
  const own = sections.filter(section => Number(section.AdCollegeId) === Number(collegeId))
    .map(section => ({ id: Number(section.AdSectionId), name: clean(section.AdSectionName), code: clean(section.AdSectionCode) }))
    .filter(section => section.name);
  const times = new Map<string, number>();
  for (const section of own) times.set(section.name.toLocaleLowerCase("ar"), (times.get(section.name.toLocaleLowerCase("ar")) || 0) + 1);
  return own.map(section => ({ id: section.id, name: (times.get(section.name.toLocaleLowerCase("ar")) || 0) > 1 ? `${section.name} · ${section.code || section.id}` : section.name }))
    .sort((a, b) => byArabic(a.name, b.name) || a.id - b.id);
}
