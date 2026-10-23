/**
 * استيراد الجدول: أي منتدب في الصفوف يصير «هيئة تدريسية» (في صفوف الجدول وحدها).
 */
import fs from "fs";
import { applyVisitingToFaculty } from "../src/utils/visitingToFaculty";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => { if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); } };

const plan = { visiting: new Set([7, 8]), placeholderId: 99 };
const rows: any[] = [{ AdInstructorId: 7 }, { AdInstructorId: 5 }, { AdInstructorId: 8 }, { AdInstructorId: 0 }];
check(applyVisitingToFaculty(rows, plan) === 2, "يُستبدل منتدبان فقط");
check(rows[0].AdInstructorId === 99 && rows[2].AdInstructorId === 99, "المنتدب يصير سجل «هيئة تدريسية»");
check(rows[1].AdInstructorId === 5 && rows[3].AdInstructorId === 0, "المعيّن والفارغ لا يتغيران");
check(rows[0].replacedVisitingInstructorId === 7, "يُحفظ المنتدب الأصلي دليلاً");
const untouched: any[] = [{ AdInstructorId: 7 }];
check(applyVisitingToFaculty(untouched, { visiting: new Set([7]), placeholderId: 0 }) === 0 && untouched[0].AdInstructorId === 7, "بلا سجل «هيئة تدريسية» للقسم: يبقى الصف كما هو");
check(applyVisitingToFaculty([{ AdInstructorId: 7 }], { visiting: new Set(), placeholderId: 99 }) === 0, "بلا منتدبين: لا شيء يتغير");

const server = fs.readFileSync("server.ts", "utf8");
check((server.match(/visitingToFacultyPlan\(collegeId, ?sectionId, ?termId\)/g) || []).length === 3, "مسارات الاستيراد الثلاثة (PDF والنموذج والملف المُصدَّر) تطبّق القاعدة");
check(/!faculty\.has\(id\)/.test(server), "من هو في هيئة القسم لا يُعدّ منتدباً");

console.log(`\nVisiting → faculty audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
