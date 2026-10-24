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
