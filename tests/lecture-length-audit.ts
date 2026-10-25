import assert from "node:assert/strict";
import { lectureLengthProblem, periodBalanceSnapshot } from "../src/utils/scheduleRegulations";

const sut = { fsunday: true, ftuesday: true, fthursday: true };
assert.ok(lectureLengthProblem({ ...sut, fstarttime: "08:00", fendtime: "08:40" }, 3), "40 دقيقة أحد/ثلاثاء/خميس تُرفض");
assert.equal(lectureLengthProblem({ ...sut, fstarttime: "08:00", fendtime: "08:50" }, 3), null);
assert.equal(lectureLengthProblem({ ...sut, fstarttime: "08:00", fendtime: "09:50" }, 3), null, "50+10+50");
assert.ok(lectureLengthProblem({ ...sut, fstarttime: "08:00", fendtime: "09:50" }, 1), "لا تتجاوز المحاضرات ساعات المقرر");
assert.equal(lectureLengthProblem({ fmonday: true, fwednesday: true, fstarttime: "08:00", fendtime: "09:20" }, 3), null);
assert.ok(lectureLengthProblem({ fmonday: true, fwednesday: true, fstarttime: "08:00", fendtime: "09:00" }, 3));
assert.equal(lectureLengthProblem({ fwednesday: true, fstarttime: "16:00", fendtime: "19:50" }, 3, 230), null, "التاريخ يقدَّم");
assert.equal(lectureLengthProblem({ fmonday: true, fstarttime: "08:00", fendtime: "10:50" }, 3), null, "الكتلة التاريخية ذات المحاضرتين الطويلتين تقبل فرق عبور خمس دقائق");
assert.ok(lectureLengthProblem({ fmonday: true, fstarttime: "08:00", fendtime: "11:00" }, 3), "لا يُقبل فرقٌ عشوائي يتجاوز كتلة 170/175 دقيقة المعتمدة");
assert.deepEqual(periodBalanceSnapshot(Array.from({ length: 10 }, (_, i) => ({ fstarttime: i < 6 ? "08:00" : "14:00" } as any))), { morning: 60, evening: 40, sections: 10, morningCount: 6 }, "توزيع الفترتين يُقرأ حتى دون وجود مخالفة");
console.log("lecture-length-audit ok");

import { maxWeeklyMinutesFor, weeklyLectureMinutes } from "../src/utils/scheduleRegulations";
assert.equal(weeklyLectureMinutes({ ...sut, fstarttime: "08:00", fendtime: "08:50" }), 150);
assert.equal(weeklyLectureMinutes({ fmonday: true, fwednesday: true, fstarttime: "08:00", fendtime: "09:20" }), 160);
assert.equal(weeklyLectureMinutes({ fmonday: true, fstarttime: "08:00", fendtime: "10:50" }), 160, "العبور ذو الخمس دقائق لا يضخم دقائق التدريس الأسبوعية");
assert.ok(160 <= maxWeeklyMinutesFor(3), "٣ ساعات = ثمانون ثمانون");
assert.ok(210 <= maxWeeklyMinutesFor(4), "٤ ساعات = ٨٠/٨٠/٥٠");
assert.ok(weeklyLectureMinutes({ ...sut, fstarttime: "08:00", fendtime: "09:50" }) > maxWeeklyMinutesFor(3), "ست محاضرات لمقرر ٣ ساعات تزيد");
console.log("weekly-cap ok");

/* الجدول الدراسي عند القسم: الخلطُ تنبيهٌ برسم النمط المعتمد ولا يُمنع الحفظ. */
import fs from "node:fs";
import { patternNoticeHtml } from "../src/utils/patternLibraryView";
import { patternLibraryInput } from "../src/utils/patternLibraryInput";
const serverSrc = fs.readFileSync("server.ts", "utf8");
const lengthFn = serverSrc.slice(serverSrc.indexOf("async function scheduleLengthIssue("), serverSrc.indexOf("async function schedulePayloadIssues("));
assert.ok(/mixedPatternNotice\(/.test(lengthFn) && !/return `لا يُخلط/.test(lengthFn), "الخلط عند القسم لا يُرفض في الحفظ");
const notice = serverSrc.slice(serverSrc.indexOf("async function mixedPatternNotice("), serverSrc.indexOf("async function scheduleLengthIssue("));
assert.ok(/patternsForHours\(hours\)\.some/.test(notice) && /historicalOrigin\(/.test(notice), "والتنبيه لا يظهر لنمطٍ معتمد في المكتبة أو تاريخيٍّ للمقرّر");
assert.ok(/patternNotice/.test(serverSrc.slice(serverSrc.indexOf('app.post("/api/schedules/check-conflicts"'), serverSrc.indexOf('app.post("/api/schedules/check-conflicts"') + 900)), "ويصل رسمُه شاشةَ الموعد مع فحص التعارض");
const drawn = patternNoticeHtml(patternLibraryInput(), 3, ["fsunday", "fmonday"], [50, 80], true);
assert.ok(drawn.includes("النمط غير معتمد") && drawn.includes("is-bad") && (drawn.match(/plib-pat/g) || []).length >= 3 && drawn.includes("is-block"), "الرسم: المختار مشطوباً وبجانبه المعتمد");
assert.ok(!patternNoticeHtml(patternLibraryInput(), 3, ["fsunday", "fmonday"], [50, 80], false).includes("is-block"), "وعند القسم بلون التنبيه لا المنع");
console.log("mixed-days ok");
