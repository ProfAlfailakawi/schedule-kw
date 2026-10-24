import assert from "node:assert/strict";
import { lectureLengthProblem } from "../src/utils/scheduleRegulations";

const sut = { fsunday: true, ftuesday: true, fthursday: true };
assert.ok(lectureLengthProblem({ ...sut, fstarttime: "08:00", fendtime: "08:40" }, 3), "40 دقيقة أحد/ثلاثاء/خميس تُرفض");
assert.equal(lectureLengthProblem({ ...sut, fstarttime: "08:00", fendtime: "08:50" }, 3), null);
assert.equal(lectureLengthProblem({ ...sut, fstarttime: "08:00", fendtime: "09:50" }, 3), null, "50+10+50");
assert.ok(lectureLengthProblem({ ...sut, fstarttime: "08:00", fendtime: "09:50" }, 1), "لا تتجاوز المحاضرات ساعات المقرر");
assert.equal(lectureLengthProblem({ fmonday: true, fwednesday: true, fstarttime: "08:00", fendtime: "09:20" }, 3), null);
assert.ok(lectureLengthProblem({ fmonday: true, fwednesday: true, fstarttime: "08:00", fendtime: "09:00" }, 3));
assert.equal(lectureLengthProblem({ fwednesday: true, fstarttime: "16:00", fendtime: "19:50" }, 3, 230), null, "التاريخ يقدَّم");
console.log("lecture-length-audit ok");

import { maxWeeklyMinutesFor, weeklyLectureMinutes } from "../src/utils/scheduleRegulations";
assert.equal(weeklyLectureMinutes({ ...sut, fstarttime: "08:00", fendtime: "08:50" }), 150);
assert.equal(weeklyLectureMinutes({ fmonday: true, fwednesday: true, fstarttime: "08:00", fendtime: "09:20" }), 160);
assert.ok(160 <= maxWeeklyMinutesFor(3), "٣ ساعات = ثمانون ثمانون");
assert.ok(210 <= maxWeeklyMinutesFor(4), "٤ ساعات = ٨٠/٨٠/٥٠");
assert.ok(weeklyLectureMinutes({ ...sut, fstarttime: "08:00", fendtime: "09:50" }) > maxWeeklyMinutesFor(3), "ست محاضرات لمقرر ٣ ساعات تزيد");
console.log("weekly-cap ok");

/* الجدول الدراسي: لا خلطَ بين أيام الـ50 والـ80 في موعدٍ واحد إلا بنمطٍ معتمد أو تاريخي. */
import fs from "node:fs";
const serverSrc = fs.readFileSync("server.ts", "utf8");
const lengthFn = serverSrc.slice(serverSrc.indexOf("async function scheduleLengthIssue("), serverSrc.indexOf("async function schedulePayloadIssues("));
assert.ok(/shortDays\.length&&longDays\.length/.test(lengthFn) && /historicalOrigin\(nature/.test(lengthFn) && /patternsForHours\(hours\)\.some/.test(lengthFn) && /لا يُخلط/.test(lengthFn), "الخلط يُرفض في الحفظ إلا بنمطٍ معتمد أو تاريخي");
console.log("mixed-days ok");
