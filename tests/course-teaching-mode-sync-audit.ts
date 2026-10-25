import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { roomTypeSiblingIds } from "../src/utils/courseRoomTypeSync";

const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-teaching-mode-"));
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
const courses = [
  { AdCourseId: 10, AdCollegeId: 1, AdSectionId: 1, CourseCode: "453", CourseName: "مقرر", CourseCredit: 3, CourseHours: 3, MaxStudent: 60 },
  { AdCourseId: 11, AdCollegeId: 2, AdSectionId: 2, CourseCode: "4 53", CourseName: "مقرر", CourseCredit: 3, CourseHours: 3, MaxStudent: 60 },
  { AdCourseId: 12, AdCollegeId: 2, AdSectionId: 3, CourseCode: "453", CourseName: "مقرر آخر", CourseCredit: 3, CourseHours: 3, MaxStudent: 60 },
  { AdCourseId: 13, AdCollegeId: 3, AdSectionId: 4, CourseCode: "453", CourseName: "مقرر ثالث", CourseCredit: 3, CourseHours: 3, MaxStudent: 60 },
];
fs.writeFileSync(path.join(privateDir, "db.json"), JSON.stringify({
  schedules: [], colleges, sections, terms: [], courses, instructors: [],
  systemUsers: [], formSecurity: [], adCollegeUserAssigns: [], formNames: [], sessions: [],
}), { mode: 0o600 });
process.env.NODE_ENV = "test";
process.env.DATA_MODE = "demo";
process.env.SCHEDULE_PRIVATE_DIR = privateDir;

const { Repository, initDatabase } = await import("../src/db/repository");
await initDatabase();
const siblingIds = roomTypeSiblingIds(courses[0], courses, sections, colleges);
assert.deepEqual(siblingIds, [11], "same course code and department within the college family");
assert.equal(await Repository.setCourseTeachingModeForIds(siblingIds, "practical"), 1);
let saved = await Repository.getCourses();
assert.equal(saved.find(course => course.AdCourseId === 11)?.CourseTeachingMode, "practical");
assert.equal(saved.find(course => course.AdCourseId === 12)?.CourseTeachingMode, undefined);
assert.equal(saved.find(course => course.AdCourseId === 13)?.CourseTeachingMode, undefined);
assert.equal(await Repository.setCourseTeachingModeForIds(siblingIds, "practical"), 0, "repeat save is idempotent");
assert.equal(await Repository.setCourseTeachingModeForIds(siblingIds, ""), 1);
saved = await Repository.getCourses();
assert.equal(saved.find(course => course.AdCourseId === 11)?.CourseTeachingMode, undefined, "clear removes classification");

const server = fs.readFileSync("server.ts", "utf8");
const route = server.slice(server.indexOf('app.put("/api/courses/:id"'), server.indexOf('app.delete("/api/courses/:id"'));
assert.ok(route.indexOf("setCourseTeachingModeForIds") < route.indexOf("Repository.updateCourse("), "siblings are written before source");
assert.match(route, /const candidates = roomTypeSiblingIds\(/, "teaching mode uses the same sibling matcher");
assert.match(route, /isScopeAllowed\(req, Number\(other.AdCollegeId\), Number\(other.AdSectionId\)\)/);
assert.match(route, /committeeCatalogEditAllowed\(req, Number\(other.AdSectionId\)\)/);

const view = fs.readFileSync("src/components/Courses.tsx", "utf8");
assert.match(view, /<span>نوع القاعة<\/span>/);
assert.match(view, /<span>طبيعة التدريس<\/span>/);
console.log("Course teaching mode sync: passed");
