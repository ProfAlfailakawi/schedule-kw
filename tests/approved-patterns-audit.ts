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
 *  P8  سُلّمُ البدايات تنبيهٌ للقسم.
 *  P9  وفي كرت الأستاذ يمنع ما يختاره بنفسه («لكرت الأستاذ لازم تمنعه… ماله شغل بالتاريخ»)، وبدائلُه من السُّلّم،
 *      وما عرضه القسمُ عليه فقبله لا يُمنع، واقتراحُه المضادّ يمرّ بالقاعدة نفسها.
 *  P10 المكتبة: ساعتان على الاثنين·الأربعاء (50+50)، وخمسُ ساعات على أزواج الأربع (170+110).
 *  P11 الاثنين والأربعاء 8:00–9:20 ثم 9:30: الفاصل 10 دقائق، و«لاصق بمحاضرتي» على السُّلّم.
 *  P12 خاناتُ «+» في أسبوع الأستاذ على السُّلّم، و«مراجعة الجدول» تحكم باللائحة لا بالتاريخ: تنبيهٌ لما بدأ خارج
 *      السُّلّم أو خرج طولُه عن المكتبة، ولا «خارج المعتاد تاريخياً»، ولا يُعفي التاريخُ نمطاً.
 */
import fs from "node:fs";
import { LONG_DAY_GAP_MINUTES, daysApprovedForHours, daysFitLibrary, ladderStepForDays, libraryLengthsForDay, patternsForHours, requiredGapForDays, startLadderNote } from "../src/utils/scheduleRegulations";
import { judgeRequest } from "../src/utils/instructorRequestVerdict";
import { meetingMinutes, lengthPatternsForHours } from "../src/utils/requestMeetingLength";
import { stickCandidates } from "../src/utils/lectureStick";
import { freeTargets, teacherLectures } from "../src/utils/teacherMiniWeek";
import { reviewSchedule } from "../src/utils/scheduleRegulations";
import { historicalDurationMinutes } from "../src/utils/advancedIntelligence";
import { offRhythm } from "../src/utils/departmentRhythm";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed += 1; console.log(`✓ ${label}`); }
  else { failed += 1; console.log(`✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`); }
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
check(/startLadderNote\(request\.days, request\.start\)/.test(verdict) && /if \(ladderNote && !context\.ladderBlocks && !verdict\.advice\) verdict\.advice = ladderNote/.test(verdict), "P8 وحيث لا يمنع (القسم، وما عرضه القسمُ فقبله الأستاذ) يُقال إرشاداً");

/* P9 كرتُ الأستاذ: البدايةُ خارج السُّلّم تمنع ما يختاره بنفسه، وتبقى تنبيهاً للقسم. */
const oneHour = { AdCourseId: 77, CourseHours: 1, CourseName: "مقرر تجريبي", CourseCode: "T77" } as any;
const twoHours = { AdCourseId: 78, CourseHours: 2, CourseName: "مقرر بساعتين", CourseCode: "T78" } as any;
const verdictContext = (ladderBlocks: boolean) => ({
  instructorId: 5, allRows: [], instructorRowsAfter: [], courses: new Map([[77, oneHour], [78, twoHours]]), instructors: new Map(),
  knownRoomKeys: ["legacy:T|1"], ladderBlocks,
}) as any;
const asked = (start: string, days: string[] = ["fsunday"], courseId = 77) => ({ rowId: null, tempId: -1, action: "add", AdCourseId: courseId, days, start } as any);
const teacherOff = judgeRequest(asked("09:30"), verdictContext(true));
check(!teacherOff.sendable && teacherOff.reasons.some(reason => reason.code === "ladder" && reason.blocking && /غير معتمد في اللائحة/.test(reason.text) && /رأس الساعة/.test(reason.text)),
  "P9 كرت الأستاذ: الأحد 09:30 ممنوع «وقت البداية غير معتمد في اللائحة»");
check(teacherOff.nearestTimes.length > 0 && teacherOff.nearestTimes.every(slot => !startLadderNote(slot.days, slot.start)) && teacherOff.nearestTimes[0].start !== "09:30",
  "P9 وبدائلُه أقربُ أوقات السُّلّم الخالية", teacherOff.nearestTimes.map(slot => slot.start));
check(judgeRequest(asked("09:00"), verdictContext(true)).sendable && judgeRequest(asked("09:30", ["fmonday"]), verdictContext(true)).sendable,
  "P9 الأحد 09:00 والاثنين 09:30 على السُّلّم: يمضيان");
check(!judgeRequest(asked("09:00", ["fmonday"]), verdictContext(true)).sendable, "P9 الاثنين 09:00 خارج سُلّم الاثنين والأربعاء: ممنوع للأستاذ");
const departmentOff = judgeRequest(asked("09:30"), verdictContext(false));
check(departmentOff.sendable && /رأس الساعة/.test(departmentOff.advice || "") && !departmentOff.reasons.some(reason => reason.code === "ladder"),
  "P9 القسم: البداية نفسها تنبيهٌ لا يمنع");
const teacherSunThu = judgeRequest(asked("10:00", ["fsunday", "fthursday"], 78), verdictContext(true));
check(!teacherSunThu.sendable && teacherSunThu.reasons.some(reason => reason.code === "pattern" && /ليست نمطاً معتمداً/.test(reason.text)),
  "P9 كرت الأستاذ: ساعتان على الأحد·الخميس «ليست نمطاً معتمداً»");
const core = fs.readFileSync("src/server/core/instructorRequests.ts", "utf8");
check(/ladderBlocks: !options\.forDepartment && !offeredByDepartment/.test(core) && /chosenAlternativeIndex\(departmentOffers, days, slot\?\.start \|\| ""\) >= 0/.test(core)
  && /message\.from === "department"/.test(core) && /decisionHistory/.test(core),
  "P9 يمنع ما اختاره الأستاذ بنفسه وحده: ما عرضه القسمُ (بديلُ رفض، مقترحُ محادثة، ما وافق عليه) لا يُمنع");
const publicRoutes = fs.readFileSync("src/server/routes/publicRequestRoutes.ts", "utf8");
check(/const counterLadder = start && days\.length && item\.action !== "delete" \? startLadderNote\(days as DayKey\[\], start\) : ""/.test(publicRoutes)
  && /daysApprovedForHours\(hours, days as DayKey\[\]\) === false/.test(publicRoutes),
  "P9 «اقترح وقتاً آخر» من الأستاذ يمرّ بالسُّلّم وبالأنماط المعتمدة");
check(/reason\.code === "pattern"/.test(publicRoutes.slice(publicRoutes.indexOf("problemIsShape = false"))),
  "P9 خريطةُ الأوقات لا تلوّن كلَّ الأوقات حمراء حين تكون المشكلةُ في الأيام");
check(/filter\(start => Boolean\(start\) && !startLadderNote\(request\.days, start\)\)/.test(verdict), "P9 سُلّمُ القسم لا يقترح بديلاً خارج سُلّم اللائحة");

/* P9 «احذف وقت آخر، خل بس من اللي موجود» (المالك 2026-10-30): لا وقتَ يُكتب باليد في بطاقة التعديل، والردُّ على مقترح القسم أزرارُ السُّلّم وحدها. */
const teacherPage = fs.readFileSync("src/server/pages/instructorRequestPage.ts", "utf8");
const visualKit = fs.readFileSync("src/server/requestVisual.ts", "utf8");
check(!/more-time/.test(teacherPage) && !/data-start="1"/.test(teacherPage) && !/SK\.onTime\(/.test(teacherPage) && !/skMoreOpen|more-time/.test(visualKit),
  "P9 كرت الأستاذ بلا خانة «وقت آخر» تُكتب باليد");
check(/choices=startChoices\(days\)\.filter/.test(teacherPage) && /data-quick="'\+t\+'"/.test(teacherPage),
  "P9 والبدايةُ من أزرار السُّلّم المعروضة (بطاقة التعديل، والردّ على مقترح القسم)");

/* P10 المكتبة كما اعتمدها المالك. */
check(daysApprovedForHours(2, ["fmonday", "fwednesday"]) === true && meetingMinutes(["fmonday", "fwednesday"], lengthPatternsForHours(2)).join() === "50,50",
  "P10 ساعتان على الاثنين·الأربعاء: 50 + 50");
check(["fsunday,ftuesday", "ftuesday,fthursday", "fmonday,fwednesday"].every(pair => daysApprovedForHours(5, pair.split(",") as any) === true)
  && meetingMinutes(["fsunday", "ftuesday"], lengthPatternsForHours(5)).join() === "170,110" && meetingMinutes(["ftuesday", "fthursday"], lengthPatternsForHours(5)).join() === "170,110",
  "P10 خمسُ ساعات على أزواج الأربع: الأحد·الثلاثاء والثلاثاء·الخميس والاثنين·الأربعاء (170 + 110)");
check(daysApprovedForHours(5, ["fsunday", "fthursday"]) === false && daysApprovedForHours(4, ["fsunday", "fthursday"]) === false, "P10 والأحد·الخميس ليس نمطاً للأربع ولا للخمس");

/* P11 الاثنين والأربعاء 8:00–9:20 ثم 9:30. */
check(LONG_DAY_GAP_MINUTES === 10 && requiredGapForDays(["fmonday", "fwednesday"]) === 10, "P11 فاصل الاثنين والأربعاء 10 دقائق");
check(ladderStepForDays(["fmonday", "fwednesday"]) === 90 && ladderStepForDays(["fsunday", "fthursday"]) === 60 && ladderStepForDays(["fsunday", "fmonday"]) === 0, "P11 خطوةُ السُّلّم: 90 للاثنين·الأربعاء و60 للبقية، ولا سُلّم للخليط");
const stuck = stickCandidates({ rowId: 1, title: "أ", days: ["fmonday", "fwednesday"] as any, start: "08:00", end: "09:20" }, "after", () => 80);
check(stuck.map(candidate => `${candidate.start}-${candidate.end}`).join() === "09:30-10:50,11:00-12:20", "P11 «لاصق بمحاضرتي» بعد 08:00–09:20: 09:30–10:50 ثم 11:00 (الخطوةُ التالية على السُّلّم)", stuck.map(candidate => candidate.start));
const before = stickCandidates({ rowId: 1, title: "أ", days: ["fsunday"] as any, start: "11:00", end: "11:50" }, "before", () => 50);
check(before.map(candidate => candidate.start).join() === "10:00,09:00", "P11 وقبل الأحد 11:00: 10:00 ثم 9:00 (لا 9:30)", before.map(candidate => candidate.start));
const offAnchor = stickCandidates({ rowId: 1, title: "أ", days: ["fsunday"] as any, start: "12:30", end: "13:20" }, "after", () => 50);
check(offAnchor.every(candidate => !startLadderNote(candidate.days, candidate.start)), "P11 ومحاضرةٌ قائمة خارج السُّلّم: ما بعدها يُعاد إلى السُّلّم", offAnchor.map(candidate => candidate.start));

/* P12 خاناتُ «+» ومراجعةُ الجدول. */
const span = { start: 8 * 60, end: 20 * 60 };
const theory = { CourseHours: 3, CourseTeachingMode: "theoretical" } as any;
const slots = freeTargets(theory, [], span);
const sundaySlots = slots.filter(target => target.day === "fsunday"), mondaySlots = slots.filter(target => target.day === "fmonday");
check(sundaySlots.length > 0 && sundaySlots.every(target => !startLadderNote(target.days, `${String(Math.floor(target.start / 60)).padStart(2, "0")}:${String(target.start % 60).padStart(2, "0")}`)),
  "P12 خاناتُ «+» الأحد على رأس الساعة", sundaySlots.map(target => target.start));
check(mondaySlots.length > 0 && mondaySlots.map(target => target.start).slice(0, 3).join() === [480, 570, 660].join(),
  "P12 وخاناتُ الاثنين 8:00 ثم 9:30 ثم 11:00", mondaySlots.map(target => target.start));
const reviewRow = (id: number, days: string[], start: string, end: string, courseId = 501) => ({ id, AdTermId: 1, AdCollegeId: 1, AdSectionId: 1, AdCourseId: courseId, SCode: String(id), AdInstructorId: 7,
  fsunday: days.includes("sun"), fmonday: days.includes("mon"), ftuesday: days.includes("tue"), fwednesday: days.includes("wed"), fthursday: days.includes("thu"), fstarttime: start, fendtime: end }) as any;
const reviewCourses = new Map([[501, { AdCourseId: 501, CourseCode: "T501", CourseHours: 3, CourseTeachingMode: "theoretical" } as any]]);
const habitNature = new Map([[501, { confidence: "high", meetingsPerWeek: 3, weeklyMinutes: 150, meetingMinutes: 50, seenInTerms: [1, 2], dayPatterns: [{ days: ["fsunday", "ftuesday", "fthursday"], count: 9, share: 1 }] } as any]]);
const offLadderReview = reviewSchedule({ rows: [reviewRow(1, ["sun", "tue", "thu"], "09:30", "10:20")], courses: reviewCourses, instructors: new Map(), nature: habitNature });
const ladderNote = offLadderReview.find(finding => finding.rule === "regulation-ladder");
check(Boolean(ladderNote) && ladderNote!.approvalEffect === "note" && ladderNote!.source === "decision-1912" && /09:30/.test(ladderNote!.detail) && /رأس الساعة/.test(ladderNote!.detail),
  "P12 المراجعة: بدايةٌ خارج السُّلّم «تنبيه لائحي» لا يمنع", ladderNote);
check(!offLadderReview.some(finding => finding.source === "history" || /المعتاد تاريخياً/.test(finding.title)), "P12 ولا «خارج المعتاد تاريخياً»: التاريخُ لا يحكم");
const lengthReview = reviewSchedule({ rows: [reviewRow(2, ["sun", "tue"], "10:00", "11:15")], courses: reviewCourses, instructors: new Map() });
check(Boolean(lengthReview.find(finding => finding.rule === "regulation-ladder" && /75 دقيقة/.test(finding.detail))), "P12 وطولٌ خارج المكتبة (75 دقيقة) يُنبَّه عليه");
const cleanReview = reviewSchedule({ rows: [reviewRow(3, ["sun", "tue", "thu"], "10:00", "10:50"), reviewRow(4, ["mon", "wed"], "09:30", "10:50")], courses: reviewCourses, instructors: new Map() });
check(!cleanReview.some(finding => finding.rule === "regulation-ladder"), "P12 والأحد 10:00–10:50 والاثنين 9:30–10:50 بلا تنبيه");
const historicFour = reviewSchedule({ rows: [reviewRow(5, ["mon", "wed"], "08:00", "09:20", 502), reviewRow(5, ["thu"], "08:00", "08:50", 502)].map((row, k) => ({ ...row, id: 5 + k, SCode: "5", AdTermId: 3 })),
  courses: new Map([[502, { AdCourseId: 502, CourseCode: "T502", CourseHours: 4, CourseTeachingMode: "theoretical" } as any]]), instructors: new Map(),
  nature: new Map([[502, { confidence: "high", meetingsPerWeek: 3, weeklyMinutes: 210, meetingMinutes: 70, seenInTerms: [1, 2], dayPatterns: [{ days: ["fmonday", "fwednesday", "fthursday"], count: 4, share: 1 }] } as any]]) });
check(Boolean(historicFour.find(finding => finding.rule === "theoretical-pattern")), "P12 والنمطُ غير المعتمد لا يُعفيه التاريخ في المراجعة (كما في الاعتماد)");
const verdictSource = fs.readFileSync("src/utils/instructorRequestVerdict.ts", "utf8");
check(/request\.relatedRowIds\?\.length && finding\.rule === "theoretical-pattern"/.test(verdictSource), "P12 والشعبةُ الشاغرة القائمة تُتسلَّم كما هي");
const reviewScreen = fs.readFileSync("src/components/ScheduleReview.tsx", "utf8");
check(/const quietFindings = \[\.\.\.groupedFindings\.filter\(finding => finding\.approvalEffect === "note"\), \.\.\.ladderNotes\]/.test(reviewScreen)
  && /regulationGroups = useMemo\(\(\) => groupedFindings\.filter/.test(reviewScreen) && !/regulationGroups[^\n]*ladderNotes/.test(reviewScreen),
  "P12 شاشةُ «مراجعة الاعتماد» تُظهر «خارج سُلّم اللائحة» في سطر الملاحظات، ولا يُنقص درجةَ الاعتماد");
check(/finding\.rule === "regulation-ladder" \? nounFor\(finding\.groupedCount, AR\.course\)/.test(reviewScreen), "P12 ويُعدّ بالمقرّرات لا «تعارضات»");
void teacherLectures;

console.log(`\nApproved patterns audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
