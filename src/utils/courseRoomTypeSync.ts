/**
 * نسخُ المقرر نفسِه في أحرام القسم الواحد.
 *
 * القسمُ الذي يدرّس في أكثر من حرم (الجهراء · الفحيحيل · بنات · بنين) له
 * في كل كليةٍ قسمٌ بالاسم نفسه ونسخةٌ من المقرر برمزه. ورمزُ المقرر لا يتكرر
 * داخل القسم، فمطابقتُه مع اسم القسم الأكاديمي تُعرّف «النسخ الشقيقة» بلا لبس.
 */
export interface SyncCourse { AdCourseId: number; AdCollegeId: number; AdSectionId: number; CourseCode: string }
export interface SyncSection { AdSectionId: number; AdSectionName: string }

const codeKey = (value: unknown) => String(value || "").normalize("NFKC").replace(/\s+/g, "").toUpperCase();

export function roomTypeSiblingIds(
  source: SyncCourse,
  courses: readonly SyncCourse[],
  sections: readonly SyncSection[],
  sameDepartmentName: (a: unknown, b: unknown) => boolean,
): number[] {
  const byId = new Map(sections.map(section => [Number(section.AdSectionId), section]));
  const mine = byId.get(Number(source.AdSectionId));
  if (!mine || !codeKey(source.CourseCode)) return [];
  return courses.filter(other => {
    if (Number(other.AdCourseId) === Number(source.AdCourseId)) return false;
    if (Number(other.AdSectionId) === Number(source.AdSectionId)) return false;
    if (codeKey(other.CourseCode) !== codeKey(source.CourseCode)) return false;
    const theirs = byId.get(Number(other.AdSectionId));
    return !!theirs && sameDepartmentName(mine.AdSectionName, theirs.AdSectionName);
  }).map(other => Number(other.AdCourseId));
}
