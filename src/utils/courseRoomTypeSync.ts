/**
 * نسخُ المقرر نفسِه في أحرام القسم الواحد.
 *
 * القسمُ الذي يدرّس في أكثر من حرم (الجهراء · الفحيحيل · بنات · بنين) له في كل
 * كليةٍ من عائلتها سجلُّ قسمٍ بالاسم نفسه ونسخةٌ من المقرر برمزه. ورمزُ المقرر
 * لا يتكرر داخل القسم، فتُعرَّف «النسخ الشقيقة» بثلاثة شروطٍ معاً:
 *   ١) رمزُ المقرر نفسُه،
 *   ٢) عائلةُ القسم نفسُها (departmentFamilyKey — اسمٌ مطابقٌ بعد التطبيع، لا احتواء)،
 *   ٣) عائلةُ الكلية نفسُها (familyOf): «التربية الأساسية» بنين وبنات وحرماها،
 *      لا «التمريض» ولو تسمّى قسمُها بالاسم نفسه — فهما قسمان مستقلان.
 */
import { departmentFamilyKey } from "./sectionLabel";
import { familyOf } from "./collegeTrack";

export interface SyncCourse { AdCourseId: number; AdCollegeId: number; AdSectionId: number; CourseCode: string }
export interface SyncSection { AdSectionId: number; AdCollegeId: number; AdSectionName: string }
export interface SyncCollege { AdCollegeId: number; AdCollegeName: string }

const codeKey = (value: unknown) => String(value || "").normalize("NFKC").replace(/\s+/g, "").toUpperCase();

export function roomTypeSiblingIds(
  source: SyncCourse,
  courses: readonly SyncCourse[],
  sections: readonly SyncSection[],
  colleges: readonly SyncCollege[],
): number[] {
  const sectionById = new Map(sections.map(section => [Number(section.AdSectionId), section]));
  const collegeFamily = new Map(colleges.map(college => [Number(college.AdCollegeId), familyOf(college.AdCollegeName)]));
  const mine = sectionById.get(Number(source.AdSectionId));
  const departmentKey = departmentFamilyKey(mine?.AdSectionName);
  const myFamily = collegeFamily.get(Number(source.AdCollegeId));
  if (!mine || !departmentKey || !myFamily || !codeKey(source.CourseCode)) return [];
  return courses.filter(other => {
    if (Number(other.AdCourseId) === Number(source.AdCourseId)) return false;
    if (Number(other.AdSectionId) === Number(source.AdSectionId)) return false;
    if (codeKey(other.CourseCode) !== codeKey(source.CourseCode)) return false;
    const theirs = sectionById.get(Number(other.AdSectionId));
    return !!theirs
      && departmentFamilyKey(theirs.AdSectionName) === departmentKey
      && collegeFamily.get(Number(other.AdCollegeId)) === myFamily;
  }).map(other => Number(other.AdCourseId));
}
