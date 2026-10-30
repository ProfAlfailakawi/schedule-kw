/**
 * ── «النمطُ لازم يكون معتمداً، والتاريخُ اقتراحٌ لا يخالف اللائحة» (المالك 2026-10-30) ─────
 *
 *  P1  المكتبة: «الثلاثاء · الخميس» معتمدٌ لمقرّرٍ بساعتين كـ«الأحد · الثلاثاء»، و«الأحد · الخميس» لا.
 *  P2  daysFitLibrary: النمطُ الكامل، وجزءُ النمط لصفٍّ بيومٍ واحد، والخلط، وما لا يُعرف (null).
 *  P3  الأطوالُ المعتمدة لكل يوم من المكتبة (لا 75 يوم الأحد ولا الاثنين).
 *  P4  عادةُ القسم في المدة لا تُؤخذ إن خالفت المكتبة؛ وتنبيهُ «خارج إيقاع القسم» لا يقال عن طولٍ معتمد.
 *  P5  ساكن: بوابتا الإنشاء والتعديل والفحص المباشر وتثبيتُ طلب الأستاذ تمنع النمط غير المعتمد، ولا يُعفي التاريخ.
 *  P6  ساكن: طلبُ الأستاذ يمنع ما ليس نمطاً معتمداً ويقترح المعتمد، و«المعتاد تاريخياً» لا يُقترح خارج المكتبة.
 *  P7  ساكن: «املأ كالمعتاد» لا يعبّئ نمطاً خارج المكتبة، ويأخذ طول اللائحة.
 */
import fs from "node:fs";
import { daysApprovedForHours, daysFitLibrary, libraryLengthsForDay, patternsForHours, startLadderNote } from "../src/utils/scheduleRegulations";
import { historicalDurationMinutes } from "../src/utils/advancedIntelligence";
import { offRhythm } from "../src/utils/departmentRhythm";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed += 1; console.log(`✓ ${label}`); }
  else { failed += 1; console.log(`✗ ${label}`); }
};

const two = patternsForHours(2).map(pattern => pattern.days.join("+"));
check(two.includes("fsunday+ftuesday") && two.includes("ftuesday+fthursday") && !two.includes("fsunday+fthursday"), "P1 ساعتان: الأحد·الثلاثاء والثلاثاء·الخميس معتمدان، والأحد·الخميس لا");

check(daysApprovedForHours(2, ["fsunday", "fthursday"]) === false, "P2 ساعتان: الأحد·الخميس غير معتمد");
check(daysApprovedForHours(2, ["fsunday", "ftuesday"]) === true && daysApprovedForHours(2, ["ftuesday", "fthursday"]) === true, "P2 ساعتان: الأحد·الثلاثاء والثلاثاء·الخميس معتمدان");
check(daysApprovedForHours(3, ["fsunday", "fthursday"]) === false && daysApprovedForHours(3, ["fsunday", "ftuesday", "fthursday"]) === true, "P2 ثلاث ساعات: الأحد·الخميس وحدهما ليسا نمطاً، والأحد·الثلاثاء·الخميس معتمد");
check(daysApprovedForHours(3, ["fsunday", "fmonday"]) === false, "P2 خلطُ أيام الخمسين بالثمانين غير معتمد");
check(daysApprovedForHours(3, ["fthursday"]) === true && daysApprovedForHours(2, ["fmonday"]) === true, "P2 يومٌ واحد يصلح لكتلة المقرّر على أيّ يوم");
check(daysFitLibrary(3, ["fsunday", "ftuesday"], false) === true && daysFitLibrary(2, ["fsunday", "fthursday"], false) === false, "P2 جزءُ نمطٍ معتمد يُقبل لصفٍّ بيومٍ واحد، وما لا يقع في أيّ نمطٍ لا");
check(daysApprovedForHours(0, ["fsunday"]) === null && daysApprovedForHours(9, ["fsunday"]) === null, "P2 ساعاتٌ مجهولة أو بلا نمط في المكتبة: لا يُحكم");

const sunday = libraryLengthsForDay("fsunday"), monday = libraryLengthsForDay("fmonday");
check(sunday.has(50) && sunday.has(110) && sunday.has(170) && !sunday.has(75) && !sunday.has(80), "P3 الأحد: 50 و110 و170 — لا 75 ولا 80");
check(monday.has(80) && monday.has(110) && !monday.has(75), "P3 الاثنين: 80 و110 — لا 75");

const habit = (minutes: number) => ({ minute: 480, samples: 9, share: 0.8, ladder: [], starts: [], durationMinutes: minutes, durationSamples: 9, durationShare: 0.8 } as any);
check(historicalDurationMinutes(habit(75), "fsunday") === 50, "P4 عادة 75 دقيقة يوم الأحد لا تُؤخذ: 50 من اللائحة");
check(historicalDurationMinutes(habit(75), "fmonday") === 80, "P4 عادة 75 دقيقة يوم الاثنين لا تُؤخذ: 80 من اللائحة");
check(historicalDurationMinutes(habit(110), "fsunday") === 110 && historicalDurationMinutes(habit(50), "fsunday") === 50, "P4 عادةٌ بطولٍ معتمد تبقى اقتراحاً يُؤخذ");
const reading = { forDay: () => ({ ladder: [], durationMinutes: 75, durationRange: [75, 75] }) } as any;
check(offRhythm({ fmonday: true, fstarttime: "08:00", fendtime: "09:20" } as any, reading) === "", "P4 ثمانون دقيقة يوم الاثنين ليست «خارج إيقاع القسم» ولو اعتاد 75");
check(/مدة محاضرات/.test(offRhythm({ fmonday: true, fstarttime: "08:00", fendtime: "09:35" } as any, reading)), "P4 وطولٌ خارج المكتبة يبقى يُنبَّه عليه");

const rules = fs.readFileSync("src/server/core/scheduleRules.ts", "utf8");
const writes = fs.readFileSync("src/server/core/scheduleWrites.ts", "utf8");
const review = fs.readFileSync("src/server/routes/scheduleReviewRoutes.ts", "utf8");
const inbox = fs.readFileSync("src/server/routes/instructorRequestsRoutes.ts", "utf8");
check(/export async function unapprovedPatternIssue/.test(rules) && /daysFitLibrary\(hours,union,own\.length>1\)/.test(rules), "P5 مانعٌ واحد: أيامُ الشعبة كلها نمطٌ معتمد (والصفّ بيومٍ واحد جزءٌ منه)");
check(!/historicalOrigin\(await courseHabit\(courseId,termId\)/.test(rules) && !/!habitual&&reading\.total/.test(rules), "P5 لا يُعفي التاريخُ نمطاً مختلطاً ولا سقفَ الساعات");
check((writes.match(/unapprovedPatternIssue\(/g) || []).length === 2 && /unchangedShape\|\|\(req as any\)\.__exactRestore\?null:await unapprovedPatternIssue/.test(writes)
  && /\(req as any\)\.__exactRestore\?null:await unapprovedPatternIssue\(req\.body/.test(writes), "P5 بوابتا الإنشاء والتعديل (والشكل الذي لم يتغيّر والاستعادة لا يُرفضان)");
const machine = fs.readFileSync("src/server/timeMachineRoutes.ts", "utf8");
check(/dryRunUpdate\(req, op\.rowId, op\.body, finalWeek, kind === "restore"\)/.test(machine) && /inner\.__exactRestore = Boolean\(patch\.exactRestore\)/.test(writes), "P5 استعادةُ «آلة الزمن» تعيد ما كان بالضبط ولا تمنعها قاعدة النمط");
check(/checkPatternIssue\(row\)/.test(review) && /if\(patternIssue\)validationIssues\.push\(patternIssue\)/.test(review), "P5 الفحصُ المباشر يقول المانع قبل الحفظ");
check(/await unapprovedPatternIssue\(row, week, \{ skipIfUnchanged: true \}\)/.test(inbox), "P5 تثبيتُ طلب الأستاذ يمرّ بالمانع نفسه (والشعبةُ القائمة المُسندة كما هي لا تُرفض)");

const verdict = fs.readFileSync("src/utils/instructorRequestVerdict.ts", "utf8");
check(/daysApprovedForHours\(courseHours, request\.days\) === false/.test(verdict) && !/historyShape/.test(verdict), "P6 طلبُ الأستاذ: ما ليس نمطاً معتمداً يُمنع، ولا يُعفيه التاريخ");
check(/code: "pattern"/.test(verdict) && /reason\.code === "pattern"/.test(verdict), "P6 ومعه أزرارُ الأنماط المعتمدة بدل البدائل");
check((verdict.match(/daysApprovedForHours\((heldHours|courseHours), days\) === true/g) || []).length === 2, "P6 «المعتاد تاريخياً» يُقترح إن كان نمطاً معتمداً وحده");

const editor = fs.readFileSync("src/components/Schedules.tsx", "utf8");
check(/courseNature\.suggestion && daysApprovedForHours\(regulationHours\(formCourse\), courseNature\.suggestion\.days as RegDayKey\[\]\) !== false/.test(editor)
  && /next\.fendtime = seedEnd;/.test(editor), "P7 «املأ كالمعتاد» بنمطٍ معتمد وطول اللائحة");

/* P8 سُلّمُ البدايات — تنبيهٌ لا يمنع: الأحد والثلاثاء والخميس على رأس الساعة، والاثنين والأربعاء 8:00 ثم 9:30… */
check(startLadderNote(["fsunday", "ftuesday", "fthursday"], "10:00") === "" && startLadderNote(["fsunday"], "11:00") === "", "P8 الأحد·الثلاثاء·الخميس على رأس الساعة: بلا تنبيه");
check(/رأس الساعة/.test(startLadderNote(["fsunday", "ftuesday"], "09:07")) && /رأس الساعة/.test(startLadderNote(["fthursday"], "10:30")), "P8 وبدايةٌ خارج رأس الساعة يُنبَّه عليها");
check(startLadderNote(["fmonday", "fwednesday"], "08:00") === "" && startLadderNote(["fmonday", "fwednesday"], "09:30") === "" && startLadderNote(["fwednesday"], "12:30") === "", "P8 الاثنين·الأربعاء 8:00 و9:30 و12:30: بلا تنبيه");
check(/9:30/.test(startLadderNote(["fmonday", "fwednesday"], "09:00")) && startLadderNote(["fsunday", "fmonday"], "09:07") === "", "P8 الاثنين 9:00 يُنبَّه عليه، والخليطُ حكمُ النمط لا السُّلّم");
const habitLadder = { forDay: () => ({ ladder: ["08:50", "10:10"], durationMinutes: 50, durationRange: [50, 50] }) } as any;
check(offRhythm({ fsunday: true, fstarttime: "09:00", fendtime: "09:50" } as any, habitLadder) === "", "P8 بدايةٌ على سُلّم اللائحة لا تُعدّ «خارج المعتاد» ولو اعتاد القسم 08:50");
check(/رأس الساعة/.test(offRhythm({ fsunday: true, fstarttime: "08:55", fendtime: "09:45" } as any, habitLadder)), "P8 وبدايةٌ خارج سُلّم اللائحة يُقال سُلّمُ اللائحة لا عادةُ القسم");
const conflicts = fs.readFileSync("src/server/core/scheduleConflicts.ts", "utf8");
check(/startLadderNote\(/.test(conflicts) && /خارج سُلّم البدايات في اللائحة/.test(conflicts) && /soft: true/.test(conflicts), "P8 الفحصُ المباشر (موعد جديد، البطاقة السريعة، الوارد) يقول التنبيه ولا يمنع");
check(/startLadderNote\(request\.days, request\.start\)/.test(verdict) && /verdict\.advice = ladder/.test(verdict), "P8 وصفحةُ الأستاذ تقوله إرشاداً لا مانعاً");

console.log(`\nApproved patterns audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
