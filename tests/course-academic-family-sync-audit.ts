import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { roomTypeSiblingIds } from "../src/utils/courseRoomTypeSync";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-course-family-"));
const colleges = [
  { AdCollegeId: 1, AdCollegeName: "كلية التربية الأساسية - بنين" },
  { AdCollegeId: 2, AdCollegeName: "كلية التربية الأساسية - بنات" },
  { AdCollegeId: 3, AdCollegeName: "كلية التمريض - بنات" },
];
const sections = [
  { AdSectionId: 1, AdCollegeId: 1, AdSectionName: "تكنولوجيا التعليم" },
  { AdSectionId: 2, AdCollegeId: 2, AdSectionName: "قسم تكنولوجيا التعليم" },
  { AdSectionId: 3, AdCollegeId: 2, AdSectionName: "التربية الفنية" },
  { AdSectionId: 4, AdCollegeId: 3, AdSectionName: "تكنولوجيا التعليم" },
];
const base = { CourseName: "قديم", CourseCredit: 2, CourseHours: 2, MaxStudent: 40, CourseRoomType: "قاعة" };
const courses = [
  { ...base, AdCourseId: 10, AdCollegeId: 1, AdSectionId: 1, CourseCode: "453" },
  { ...base, AdCourseId: 11, AdCollegeId: 2, AdSectionId: 2, CourseCode: "4 53" },
  { ...base, AdCourseId: 12, AdCollegeId: 2, AdSectionId: 3, CourseCode: "453" },
  { ...base, AdCourseId: 13, AdCollegeId: 3, AdSectionId: 4, CourseCode: "453" },
];
fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({
  schedules: [], colleges, sections, terms: [], courses, instructors: [],
  systemUsers: [], formSecurity: [], adCollegeUserAssigns: [], formNames: [], sessions: [],
}), { mode: 0o600 });
process.env.NODE_ENV = "test";
process.env.DATA_MODE = "demo";
process.env.SCHEDULE_PRIVATE_DIR = dir;
const { Repository, initDatabase } = await import("../src/db/repository");
await initDatabase();
const siblings = roomTypeSiblingIds(courses[0], courses, sections, colleges);
assert.deepEqual(siblings, [11]);
const next = { ...courses[0], CourseCode: "454", CourseName: "جديد", CourseCredit: 3, CourseHours: 4, MaxStudent: 60 };
await Repository.updateCourseFamily(next, siblings, {
  CourseCode: next.CourseCode, CourseName: next.CourseName, CourseCredit: next.CourseCredit,
  CourseHours: next.CourseHours, MaxStudent: next.MaxStudent,
}, true, false);
const saved = await Repository.getCourses();
for (const id of [10, 11]) {
  const course = saved.find(row => row.AdCourseId === id)!;
  assert.equal(course.CourseCode, "454");
  assert.equal(course.CourseName, "جديد");
  assert.equal(course.CourseCredit, 3);
  assert.equal(course.CourseHours, 4);
  assert.equal(course.MaxStudent, 60);
  assert.equal(course.CourseRoomType, "قاعة");
}
assert.equal(saved.find(row => row.AdCourseId === 12)?.CourseCode, "453");
assert.equal(saved.find(row => row.AdCourseId === 13)?.CourseName, "قديم");
assert.equal(saved.find(row => row.AdCourseId === 11)?.AdCollegeId, 2);
const server = fs.readFileSync("server.ts", "utf8");
const route = server.slice(server.indexOf('app.put("/api/courses/:id"'), server.indexOf('app.delete("/api/courses/:id"'));
assert.match(route, /roomTypeSiblingIds\(\{ \.\.\.currentCourse, AdCollegeId: collegeId, AdSectionId: sectionId \}/, "match old code before changing it");
assert.match(route, /Repository\.hasSchedulesForCourse\(siblingId\)/, "historical sibling identity is protected");
assert.match(route, /other\.CourseCode === CourseCode/, "new code checked in every sibling section");
console.log("Course academic family sync: passed");
