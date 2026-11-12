/**
 * «هذا الموعد يخالف اللائحة… هل تريد المتابعة استثناءً؟» (ملاحظتا المالك 10 و20) وسُلّم البدايات (م.7/8).
 * يفحص المصدرَ الواحد الذي يقرؤه الخادمُ والمقترحُ الدراسي، وأن الحفظ لا يمضي بلا موافقةٍ صريحة.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { regulationExceptionAccepted, regulationExceptionIssues, regulationExceptionMessage, REGULATION_EXCEPTION_FLAG } from "../src/utils/regulationException";
import { consecutiveTeachingRuns, ladderStartsForDays, startLadderNote } from "../src/utils/scheduleRegulations";

let passed = 0;
const check = (name: string, fn: () => void) => { fn(); passed += 1; console.log(`✓ ${name}`); };
const row = (id: number, days: string[], start: string, end: string, extra: Record<string, unknown> = {}) => ({
  id, AdInstructorId: 7, AdCourseId: 100 + id, SCode: String(500 + id), AdCollegeId: 1, AdSectionId: 2,
  fstarttime: start, fendtime: end, ...Object.fromEntries(days.map(day => [day, true])), ...extra,
});

check("السُّلّم: الاثنين والأربعاء 8:00، 9:30، 11:00، 12:30، 14:00…", () => {
  assert.deepEqual(ladderStartsForDays(["fmonday", "fwednesday"]).slice(0, 5), ["08:00", "09:30", "11:00", "12:30", "14:00"]);
  assert.deepEqual(ladderStartsForDays(["fsunday", "ftuesday", "fthursday"]).slice(0, 3), ["08:00", "09:00", "10:00"]);
  assert.deepEqual(ladderStartsForDays(["fsunday", "fmonday"]), [], "أيامٌ مختلطة لا سُلّمَ لها");
  assert.ok(startLadderNote(["fmonday", "fwednesday"], "09:00"));
  assert.equal(startLadderNote(["fmonday", "fwednesday"], "12:30"), "");
});

check("بدايةٌ خارج السُّلّم تحتاج تأكيداً (م.7/8)", () => {
  const issues = regulationExceptionIssues({ row: row(1, ["fmonday", "fwednesday"], "09:00", "10:20"), week: [] });
  assert.deepEqual(issues.map(issue => issue.article), ["م.7/8"]);
  assert.equal(regulationExceptionIssues({ row: row(1, ["fmonday", "fwednesday"], "09:30", "10:50"), week: [] }).length, 0);
});

check("ثلاث محاضرات طويلة متتالية (م.6/2)", () => {
  const week = [row(2, ["fmonday", "fwednesday"], "08:00", "09:20"), row(3, ["fmonday", "fwednesday"], "09:30", "10:50")];
  const issues = regulationExceptionIssues({ row: row(4, ["fmonday", "fwednesday"], "11:00", "12:20"), week });
  assert.ok(issues.some(issue => issue.rule === "consecutive-long" && issue.article === "م.6/2"));
  assert.equal(regulationExceptionIssues({ row: row(4, ["fmonday", "fwednesday"], "12:30", "13:50"), week }).filter(issue => issue.rule === "consecutive-long").length, 0, "فاصلٌ أطول من ربع ساعة يقطع السلسلة");
});

check("أربع محاضرات من ساعة متتالية (م.6/3) — والثلاث مسموحة", () => {
  const days = ["fsunday", "ftuesday", "fthursday"];
  const week = [row(2, days, "08:00", "08:50"), row(3, days, "09:00", "09:50"), row(5, days, "10:00", "10:50")];
  assert.ok(regulationExceptionIssues({ row: row(4, days, "11:00", "11:50"), week }).some(issue => issue.article === "م.6/3"));
  assert.equal(regulationExceptionIssues({ row: row(4, days, "11:00", "11:50"), week: week.slice(1) }).length, 0);
  assert.equal(consecutiveTeachingRuns(week).oneHour.length, 0);
});

check("«هيئة تدريسية» لا تُعدّ سلاسلها", () => {
  const week = [row(2, ["fmonday"], "08:00", "09:20"), row(3, ["fmonday"], "09:30", "10:50")];
  assert.equal(regulationExceptionIssues({ row: row(4, ["fmonday"], "11:00", "12:20"), week, placeholders: new Set([7]) }).filter(issue => issue.rule.startsWith("consecutive")).length, 0);
});

check("وقتٌ ثابت للشعبة في أيامها (م.7/9)", () => {
  const sibling = row(2, ["fsunday"], "08:00", "08:50", { AdCourseId: 900, SCode: "501" });
  const issues = regulationExceptionIssues({ row: row(3, ["ftuesday"], "09:00", "09:50", { AdCourseId: 900, SCode: "501" }), week: [sibling] });
  assert.ok(issues.some(issue => issue.article === "م.7/9"));
});

check("موعدٌ محفوظ لم يتغيّر شكله ولا أستاذه لا يُسأل عنه", () => {
  assert.equal(regulationExceptionIssues({ row: row(1, ["fmonday", "fwednesday"], "09:00", "10:20"), week: [], shapeChanged: false, sequenceChanged: false }).length, 0);
});

check("طولٌ لا توافقه اللائحة يحتاج تأكيداً (م.7/8)", () => {
  const issues = regulationExceptionIssues({ row: row(1, ["fsunday"], "11:00", "12:10"), week: [], courseHours: 3 });
  assert.ok(issues.some(issue => issue.rule === "lecture-length"));
  assert.equal(regulationExceptionIssues({ row: row(1, ["fsunday"], "11:00", "13:50"), week: [], courseHours: 3 }).filter(issue => issue.rule === "lecture-length").length, 0, "كتلةُ 170د معتمدة لثلاث ساعات");
});

check("الموافقة صريحة فقط، والرسالة تذكر المادة", () => {
  assert.equal(regulationExceptionAccepted({ [REGULATION_EXCEPTION_FLAG]: true }), true);
  assert.equal(regulationExceptionAccepted({ [REGULATION_EXCEPTION_FLAG]: "true" }), false);
  assert.equal(regulationExceptionAccepted({}), false);
  assert.match(regulationExceptionMessage([{ rule: "start-ladder", article: "م.7/8", text: "x" }]), /يخالف اللائحة.*م\.7\/8.*استثناءً/);
});

check("الخادم يسأل قبل الحفظ والنقل، ويسجّل الاستثناء، والمسارات الداخلية لا تُسأل", () => {
  const writes = fs.readFileSync("src/server/core/scheduleWrites.ts", "utf8");
  const moves = fs.readFileSync("src/server/routes/scheduleReviewRoutes.ts", "utf8");
  assert.equal((writes.match(/regulationExceptionAccepted\(req\.body\)/g) || []).length, 2, "الإنشاء والتعديل");
  assert.match(writes, /inner\.__internal = true/);
  assert.match(writes, /regulationExceptionAudit/);
  assert.match(moves, /regulationExceptionAccepted\(req\.body\)/, "النقل الجماعي (السحب)");
  const client = fs.readFileSync("src/components/Schedules.tsx", "utf8");
  assert.match(client, /askRegulationException/);
  assert.match(fs.readFileSync("src/components/QuickCreatePopover.tsx", "utf8"), /يُحفظ بتأكيد/, "البطاقة السريعة لا تقول «جاهز للحفظ» مع مخالفة");
  assert.match(fs.readFileSync("src/components/proposal/useProposalWorkspace.ts", "utf8"), /askRegulationException/, "المقترح الدراسي");
});

console.log(`\nregulation-exception: ${passed} passed`);
