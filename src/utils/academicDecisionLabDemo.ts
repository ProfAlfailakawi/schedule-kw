/**
 * A deterministic, clearly labelled DEMO-only academic lab lesson.
 * This is an entirely fictional timetable, never university appointments.
 * Every metric is evaluated by the same production decision engine.
 * No student identifiers, database rows or schedule approvals are changed.
 */
import { analyseAcademicAdvice, type AcademicInput, type AcademicPlanView } from "./academicAdvisory";
import { buildAcademicDecisionLab, type AcademicDecisionLab } from "./academicDecisionLab";
import type { AdCourse, FSchedule, StudentProfile } from "../types";

const COLLEGE = 12, SECTION = 9, TERM = 25;
const TRAINING_PLAN: AcademicPlanView = {
  planId: "academic-lab-training-only",
  courseIds: [100, 101, 102, 103, 104, 105, 106, 107, 108],
  rules: [
    { courseId: 100 },
    { courseId: 101, prereq: { all: [100], anyOf: [] } },
    { courseId: 102, prereq: { all: [100], anyOf: [] } },
    { courseId: 103, prereq: { all: [101], anyOf: [] } },
    { courseId: 104 }, { courseId: 105 },
    { courseId: 106, prereq: { all: [104], anyOf: [] } },
    { courseId: 107, prereq: { all: [100], anyOf: [] } },
    { courseId: 108, prereq: { all: [107], anyOf: [] } },
  ], groups: [],
};
const courses = [
  "مدخل تدريبي", "التصميم التعليمي (تجريبي)", "تقنيات التعلم (تجريبي)",
  "تطبيقات التصميم", "الوسائط الرقمية (تجريبي)", "إنتاج المحتوى (تجريبي)",
  "مشروعات الوسائط", "المشروع المؤهِّل (تجريبي)", "مشروع التخرج",
].map((name, index) => ({
  AdCourseId: 100 + index, AdCollegeId: COLLEGE, AdSectionId: SECTION,
  CourseCode: "LAB-" + (100 + index), CourseName: name,
  CourseCredit: 3, CourseHours: 3, MaxStudent: 30,
})) as AdCourse[];
function row(id: number, course: number, day: "fsunday" | "fmonday", teacher: number): FSchedule {
  return {
    id, AdCollegeId: COLLEGE, AdSectionId: SECTION, AdTermId: TERM,
    AdCourseId: course, SCode: "501", AdInstructorId: teacher,
    roomId: "training-room-" + teacher,
    fstarttime: "08:00", fendtime: "09:00", [day]: true,
  } as unknown as FSchedule;
}
function person(id: number, courseIds: number[], passed: number[]): StudentProfile {
  return {
    id: "fictional-" + id, fingerprint: "fictional-demo-" + id,
    AdCollegeId: COLLEGE, AdSectionId: SECTION,
    curriculumPlanId: TRAINING_PLAN.planId, passedCourseIds: passed,
    passedUnits: passed.length * 3,
    wishes: { termId: TERM, targetUnits: 15, courseIds, constraints: {}, updatedAt: "" },
  } as StudentProfile;
}
export function buildAcademicDecisionLabTrainingPreview(): AcademicDecisionLab {
  const input: AcademicInput = {
    collegeId: COLLEGE, sectionId: SECTION, termId: TERM,
    plans: [TRAINING_PLAN], courses,
    rows: [
      row(10101, 101, "fsunday", 101),
      row(10201, 102, "fsunday", 102),
      row(10401, 104, "fmonday", 104),
      row(10501, 105, "fmonday", 105),
    ],
    profiles: [
      ...[1, 2, 3, 4].map(id => person(id, [101, 102], [100])),
      ...[5, 6, 7, 8].map(id => person(id, [104, 105], [])),
      ...[9, 10, 11, 12].map(id => person(id, [107], [100])),
    ],
  };
  const lab = buildAcademicDecisionLab(input, analyseAcademicAdvice(input));
  // Visualize the mathematical result of a standalone lesson; never present
  // synthetic outcomes as actual section demand or booked instructor slots.
  return { ...lab, demoShowcase: true };
}
