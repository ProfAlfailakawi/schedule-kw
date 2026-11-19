/**
 * ── مقررٌ نظريٌّ وعمليّ في التجربة («تصميم وإنتاج المجسمات والعرائس» 0109334) ─────────────────────────────────
 *
 * أكثرُ مقررات الكليات الصحية ساعتان نظري وساعتان عملي. ليرى الزائرُ ذلك ويجرّبه بلا إعداد، يُعلَّم مقررٌ
 * بأربع ساعات في قسم القصة بالطبيعة الخاصة (CourseSpecialNature)، وتُبذر له شعبةٌ واحدة بالشكل المعتاد عندهم:
 *   • نظري: الأحد والثلاثاء، ساعةٌ كلَّ يوم (50 دقيقة)؛
 *   • عملي: الخميس ساعتان (110 دقائق) في قاعةٍ أخرى — علامةُ «عملي» على صفّه وحده.
 * أستاذُها أستاذُ «جرّب كأستاذ» حين يكون خالياً في الوقتين، فيرى «عملي» في بطاقته؛ وإلا أولُ أستاذٍ خالٍ.
 *
 * يُبذر داخل صندوق الزائر وحده (Repository.isDemoRequest)، مرةً واحدة، ولا يلمس بيانات الجامعة.
 */
import { Repository } from "../db/repository";
import type { FSchedule } from "../types";
import { DEMO_STORY_SCOPE, demoTeacherRequest } from "./core/demo";
import { placeholderInstructorIds } from "./core/smartImport";

/* مقررٌ بلغه الطلبةُ في هذا الفصل («وصول المقرر»)، بأربع ساعات ولا شعبَ له: لا يغيّر قصةَ «لم نصل بعد». */
export const DEMO_SPECIAL_COURSE_CODE = "0109334";
const DAYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
const minutes = (clock: string) => { const [h, m] = String(clock || "0:0").split(":").map(Number); return h * 60 + m; };
const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const overlaps = (row: FSchedule, days: readonly string[], start: number, end: number) =>
  days.some(day => Boolean((row as any)[day])) && minutes(row.fstarttime) < end && minutes(row.fendtime) > start;

export async function seedDemoSpecialNature(): Promise<void> {
  if (!Repository.isDemoRequest()) return;
  const { collegeId, sectionId, termId } = DEMO_STORY_SCOPE;
  const course = (await Repository.getCourses()).find(row => Number(row.AdSectionId) === sectionId && String(row.CourseCode).trim() === DEMO_SPECIAL_COURSE_CODE);
  if (!course || course.CourseSpecialNature === true || Number(course.CourseHours) !== 4) return;
  const week = await Repository.getSchedulesByScope({ termId });
  /* مقررٌ له مواعيدُ قائمة بشكلٍ آخر لا يُعلَّم: تبقى صفوفُه بلا لقاءٍ عملي. */
  if (week.some(row => Number(row.AdCourseId) === Number(course.AdCourseId))) return;
  await Repository.updateCourse(Number(course.AdCourseId), Number(course.AdCollegeId), Number(course.AdSectionId), course.CourseCode, course.CourseName,
    Number(course.CourseCredit), Number(course.CourseHours), Number(course.MaxStudent), undefined, undefined, undefined, true);

  const instructors = await Repository.getInstructors(termId);
  const placeholders = placeholderInstructorIds(instructors as any);
  const scopeRows = week.filter(row => Number(row.AdCollegeId) === collegeId && Number(row.AdSectionId) === sectionId);
  /* قاعاتُ القسم كما تستعملها صفوفُه (مبنىً وقاعةً بمعرّفيهما)، والمختبرُ أولاً للعملي إن عُرف. */
  const halls = [...new Map(scopeRows.filter(row => row.buildingId && row.roomId).map(row => [String(row.roomId), row] as const)).values()];
  const theory = { days: ["fsunday", "ftuesday"], length: 50 }, practical = { days: ["fthursday"], length: 110 };
  const roomFree = (hall: FSchedule, days: readonly string[], start: number, end: number) =>
    !week.some(row => String(row.roomId || "") === String(hall.roomId) && overlaps(row, days, start, end));
  const teacherFree = (id: number, days: readonly string[], start: number, end: number) =>
    !week.some(row => Number(row.AdInstructorId) === id && overlaps(row, days, start, end));
  const demoTeacher = Number((await demoTeacherRequest())?.AdInstructorId || 0);
  const candidates = [demoTeacher, ...instructors.map(person => Number(person.AdInstructorId))]
    .filter((id, index, list) => id > 0 && !placeholders.has(id) && list.indexOf(id) === index);

  for (const theoryStart of [10, 11, 12, 13, 14, 15].map(hour => hour * 60)) {
    for (const practicalStart of [10, 12, 14, 16].map(hour => hour * 60)) {
      const theoryEnd = theoryStart + theory.length, practicalEnd = practicalStart + practical.length;
      const teacher = candidates.find(id => teacherFree(id, theory.days, theoryStart, theoryEnd) && teacherFree(id, practical.days, practicalStart, practicalEnd));
      const theoryHall = halls.find(hall => roomFree(hall, theory.days, theoryStart, theoryEnd));
      const practicalHall = halls.find(hall => hall !== theoryHall && roomFree(hall, practical.days, practicalStart, practicalEnd));
      if (!teacher || !theoryHall || !practicalHall) continue;
      const base = {
        AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId, AdCourseId: Number(course.AdCourseId), AdCourseName: course.CourseName,
        CourseCodeSnapshot: String(course.CourseCode), CourseNameSnapshot: String(course.CourseName), SCode: "501", AdInstructorId: teacher,
        locationStatus: "VERIFIED" as const, sourceOrder: 1_000_000 + Date.now() % 1_000_000,
      };
      const placeOf = (hall: FSchedule) => ({ AdRoomCode: hall.AdRoomCode, AdRoomHall: hall.AdRoomHall, buildingId: hall.buildingId, roomId: hall.roomId });
      const flags = (days: readonly string[]) => Object.fromEntries(DAYS.map(day => [day, days.includes(day)])) as Record<(typeof DAYS)[number], boolean>;
      await Repository.createSchedule({ ...base, ...flags(theory.days), fstarttime: clock(theoryStart), fendtime: clock(theoryEnd), ...placeOf(theoryHall) } as any);
      await Repository.createSchedule({ ...base, ...flags(practical.days), fstarttime: clock(practicalStart), fendtime: clock(practicalEnd), ...placeOf(practicalHall), practical: true } as any);
      return;
    }
  }
}
