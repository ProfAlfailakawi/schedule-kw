/**
 * ── معاينة الاستيراد صفاً صفاً، بمبدأ «موعد جديد» (المالك 2026-10-30) ─────────────────────
 *
 *  R1  الأسماء المعبّأة لا تبقى حمراء: كلُّ تغييرٍ على الصفوف — تعديلٌ أو حذفٌ أو تعبئةُ الأسماء — يمرّ من بابٍ
 *      واحد يمحو ملاحظاتِ الخادم القديمة («السطر N: أستاذ المقرر غير صالح» من قراءة ملفٍ بلا أسماء).
 *  R2  ضغطةٌ واحدة تحذف صفاً واحداً: النقرةُ الثانية من نقرةٍ مزدوجة لا تُحسب، ولا يُحذف صفٌّ آخر قبل أن يستقرّ
 *      الجدول؛ والمحذوف يعود بـ«تراجع» إلى صفحته وموضعه.
 *  R3  البدايةُ أو اليومُ يعيد النهاية من مكتبة الأنماط بدالة المحرّر نفسها (regulationEnd).
 *  R4  بطاقةُ التعديل تقول ما يقوله «موعد جديد»: النمط والسُّلّم والطول؛ والنمطُ الذي غيّره المراجع بيده لا يُنشر.
 */
import fs from "node:fs";
import { importIssueField } from "../src/components/ImportPreviewTable";
import { regulationEnd } from "../src/utils/appointmentRegulation";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed += 1; console.log(`✓ ${label}`); }
  else { failed += 1; console.log(`✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`); }
};

const transfer = fs.readFileSync("src/components/ScheduleTransfer.tsx", "utf8");
const table = fs.readFileSync("src/components/ImportPreviewTable.tsx", "utf8");

/* R1 */
check(importIssueField("أستاذ المقرر غير صالح") === "instructor", "R1 ملاحظةُ «أستاذ المقرر غير صالح» تقع على خانة الأستاذ — فبقاؤها بعد التعبئة يصبغ اسماً صحيحاً بالأحمر");
const commit = transfer.slice(transfer.indexOf("const commitPreviewRows"), transfer.indexOf("const commitPreviewRows") + 1400);
check(/saveIssues: undefined/.test(commit) && /issues: documentWarnings/.test(commit) && /assignAuthoritySections\(next\)/.test(commit), "R1 البابُ الواحد يمحو ملاحظات الخادم القديمة ويعيد ترقيم الشعب");
check(/onRows=\{\(next, filled\) => commitPreviewRows\(next as ImportRow\[\], prev =>/.test(transfer), "R1 تعبئةُ الأسماء تمرّ من الباب نفسه (ومعها من رُبطوا بها)");
check(/onRows=\{next => commitPreviewRows\(next\)\}/.test(transfer), "R1 وتعديلُ الجدول وحذفُه من الباب نفسه");
check((transfer.match(/saveIssues: undefined/g) || []).length === 1, "R1 لا بابٌ ثانٍ يغيّر الصفوف ويترك ملاحظاتها");

/* R2 */
check(/if \(event && event\.detail > 1\) return;/.test(table) && /now - lastRemoval\.current < 700/.test(table), "R2 النقرةُ الثانية لا تحذف الصف الذي صعد مكان المحذوف");
check(/onClick=\{event => remove\(index, event\)\}/.test(table) && /title="احذف هذا الصف"/.test(table) && !/حذف المقرر كاملاً/.test(table), "R2 الزرّ يحذف صفاً ويسمّيه، لا «المقرر كاملاً»");
check(/className="import-undo-bar"/.test(table) && /onClick=\{undoRemove\}/.test(table) && /removed!\.page === undoPage/.test(table), "R2 «تراجع» يعيد الصف إلى صفحته وموضعه");
check(/else if \(editing !== null && editing > index\) setEditing\(editing - 1\)/.test(table), "R2 والصفُّ المفتوح للتعديل يبقى هو نفسه بعد حذف ما فوقه");

/* R3 */
const threeHours = { AdCourseId: 1, CourseHours: 3 } as any, fourHours = { AdCourseId: 2, CourseHours: 4 } as any;
check(regulationEnd(threeHours, ["fmonday", "fwednesday"], "09:30") === "10:50" && regulationEnd(fourHours, ["fmonday", "fwednesday"], "08:00") === "09:50"
  && regulationEnd(threeHours, ["fsunday", "ftuesday", "fthursday"], "10:00") === "10:50", "R3 النهايةُ من المكتبة: ٣ ساعات ن·ر 80 د، ٤ ساعات ن·ر 110 د، ح·ث·خ 50 د");
check(/const library=endFromLibrary\(row,rowDays\(row\),start\);/.test(table) && /regulationEnd\(courseById\.get\(Number\(row\.AdCourseId\)\) as any, days, start\)/.test(table), "R3 البدايةُ المكتوبة تأخذ نهايتها من المكتبة أولاً");
check(/onClick=\{\(\) => toggleDay\(index, day\.key\)\}/.test(table) && /const end = row\.fstarttime \? endFromLibrary\(row, rowDays\(next\), row\.fstarttime\) : ""/.test(table), "R3 وتبديلُ يومٍ يعيد النهاية من المكتبة كما في المحرّر");

/* R4 */
check(/daysApprovedForHours\(hours, days\) === false/.test(table) && /startLadderNote\(days, row\.fstarttime\)/.test(table) && /libraryLengthsForDay\(day\)\.has\(length\)/.test(table),
  "R4 بطاقةُ التعديل: النمط والسُّلّم والطول بدوال «موعد جديد»");
check(/const all = \[\.\.\.regulationNotes, \.\.\.localConflicts, \.\.\.serverConflicts\.filter/.test(table) && /ladderSaid && \/سُلّم البدايات\//.test(table) && /lengthSaid && \/خارج مكتبة الأنماط\//.test(table),
  "R4 وتُعرض مع التعارضات في البطاقة نفسها، وتنبيها السُّلّم والطول مرةً واحدة");
const conflictsSource = fs.readFileSync("src/server/core/scheduleConflicts.ts", "utf8");
const rhythmSource = fs.readFileSync("src/utils/departmentRhythm.ts", "utf8");
check(/في مكتبة الأنماط/.test(rhythmSource) && !/في قسمك \$\{span\}/.test(rhythmSource) && /"طولٌ خارج مكتبة الأنماط"/.test(conflictsSource),
  "R4 والفحصُ الحيّ يقول الطولَ بأطوال المكتبة لا «مدة محاضرات الأحد في قسمك 75 دقيقة»");
check(/row\.importEvidence\?\.days\?\.source === "MANUAL" \|\| row\.importEvidence\?\.time\?\.source === "MANUAL"/.test(transfer)
  && /الأيام بعد التعديل ليست نمطاً معتمداً/.test(transfer), "R4 الشكلُ الذي غيّره المراجعُ بيده إلى نمطٍ غير معتمد لا يُنشر (وما طُبع في الوثيقة يُنشر كما هو)");
check(importIssueField("الأيام بعد التعديل ليست نمطاً معتمداً لساعات المقرر (3) في مكتبة الأنماط — المعتمد: الأحد 50د") === "days"
  && /manualPatternIssues\.notes\]/.test(transfer) && /manualPatternIssues\.issues\.forEach/.test(transfer), "R4 وسببُه يصبغ خانة الأيام في صفّه ويمنع النشر، من حكمٍ واحد");

console.log(`\nImport review rows audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
