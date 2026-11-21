/**
 * The application's own screen addresses — one table read by the browser
 * router (App.tsx) and by the server's catch-all.
 *
 * The server still answers every unknown address with the application shell,
 * so a person who follows any link sees the page exactly as before. What
 * changes is only the status code: an address that is not one of these screens
 * answers 404 instead of 200, so search engines stop indexing endless copies of
 * the home page under made-up URLs.
 */
export const APP_VIEW_PATHS = {
  dashboard: "/Home/Index",
  terms: "/AdTerm/Index",
  colleges: "/AdCollege/Index",
  sections: "/AdSection/Index",
  instructors: "/AdInstructor/Index",
  courses: "/AdCourse/Index",
  schedules: "/FSchedule/Index",
  departmentSchedule: "/FSchedule/DepartmentSchedule",
  scheduleCopy: "/FSchedule/CopySchedule",
  /* The rail's own name for the same screen — translated before it is ever
     navigated to, and mapped here so the route table stays total. */
  copyTerm: "/FSchedule/CopySchedule",
  intelligence: "/Schedule/Intelligence",
  searchInstructor: "/FSchedule/InstructorReport",
  searchRoom: "/FSchedule/RoomReport",
  searchTime: "/FSchedule/TimeReport",
  searchRoomTime: "/FSchedule/RoomTimeReport",
  searchAdvanced: "/FSchedule/MainReport",
  reportDepartment: "/FSchedule/MainScheduleReport",
  reportInstructor: "/FSchedule/InstructorReportRPT",
  reportRoom: "/FSchedule/RoomReportRPT",
  reportTime: "/FSchedule/TimeReportRPT",
  reportRoomTime: "/FSchedule/RoomTimeReportRPT",
  users: "/SystemUser/Index",
  seats: "/SystemUser/Seats",
  permissions: "/FormSecurity/Index",
  scopes: "/AdCollegeUserAssign/Index",
  audit: "/System/AuditLog",
  roomSetup: "/System/LocationSetup",
  sectionHours: "/System/SectionHours",
  teachingLoad: "/System/TeachingLoad",
  backup: "/System/Backup",
  health: "/System/Health",
  scheduleChanges: "/FSchedule/Changes",
  instructorRequests: "/FSchedule/InstructorRequests",
  studentRegistration: "/FSchedule/StudentRegistration",
  planReview: "/FSchedule/PlanReview",
  simulation: "/FSchedule/Rehearsal",
  timeMachine: "/FSchedule/TimeMachine",
  audience: "/System/Audience",
  ads: "/System/Ads",
  about: "/Public/Aboutus",
} as const;

/** Old addresses the browser router still accepts (lower-case). */
export const APP_PATH_ALIASES: Record<string, keyof typeof APP_VIEW_PATHS> = {
  /* رابط «المباني والقاعات» القديم يفتح الشاشة الموحّدة «إضافة مبانٍ وقاعات». */
  "/system/locations": "roomSetup",
};

const SHELL_PATHS = new Set<string>([
  "/",
  "/index.html",
  ...Object.values(APP_VIEW_PATHS).map((p) => p.toLowerCase()),
  ...Object.keys(APP_PATH_ALIASES),
]);

/** True when the address is a screen of the application (case-insensitive, trailing slash ignored). */
export function isAppShellPath(pathname: string): boolean {
  const lower = String(pathname || "/").toLowerCase();
  const trimmed = lower.length > 1 ? lower.replace(/\/+$/, "") || "/" : lower;
  return SHELL_PATHS.has(trimmed);
}
