/**
 * ── وسمُ الموقع الصغير: «بنين»، «بنات»، أو اسمُ الكلية حين يلزم ──────────────
 *
 * جدولُ الأستاذ الكامل يجمع مواعيده في كليات البنين والبنات (وغيرها)؛ فكلُّ موعدٍ
 * يحمل وسماً صغيراً يقول أين هو. الوسمُ أقصرُ ما يميّز: «بنين»/«بنات» إن كفى،
 * ثم الكليةُ والمسار («التربية الأساسية · بنات»)، ثم اسمُ الكلية كاملاً بلا «كلية».
 */
import { campusOf, CAMPUS_LABEL } from "./campus";
import { familyOf } from "./collegeTrack";

const clean = (value: string) => String(value || "").replace(/\s+/g, " ").trim();
const short = (value: string) => clean(value).replace(/^كلية\s+/, "");

/** مستوياتُ التفصيل لاسم كليةٍ واحد، من الأقصر إلى الأطول. */
function levels(collegeName: string): string[] {
  const name = clean(collegeName);
  const campus = campusOf(name);
  const family = short(familyOf(name));
  return [
    campus ? CAMPUS_LABEL[campus] : family || short(name),
    campus ? `${family} · ${CAMPUS_LABEL[campus]}` : short(name),
    short(name) || name,
  ];
}

/**
 * وسمٌ لكل اسم كلية في المجموعة: أقصرُ مستوىً تتمايز فيه كلُّ الأسماء المختلفة.
 * اسمٌ واحد فقط (كلُّ المواعيد في كليةٍ واحدة) ⇦ خريطةٌ فارغة: لا وسم يُرسم.
 */
export function campusChips(collegeNames: Iterable<string | null | undefined>): Map<string, string> {
  const names = [...new Set([...collegeNames].map(name => clean(String(name || ""))).filter(Boolean))];
  const out = new Map<string, string>();
  if (names.length < 2) return out;
  for (let level = 0; level < 3; level++) {
    const labels = names.map(name => levels(name)[level]);
    if (new Set(labels).size === names.length || level === 2) {
      names.forEach((name, index) => out.set(name, labels[index]));
      return out;
    }
  }
  return out;
}

/** وسمُ اسمٍ واحد بلا سياق (لشرائح الطلبات): «بنين»/«بنات» أو اسمُ الكلية القصير. */
export const campusChipOf = (collegeName: string): string => levels(collegeName)[0];
