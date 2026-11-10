/**
 * ── «موعدٌ جديد لا يُحفظ» (المالك 2026-11-08) ─────────────────────────────────
 *
 *  N1  رقمُ الشعبة الجديدة: التالي الحرّ للمقرّر في الفصل (٥٠١ ← ٥٠٢)، لا شعبةٌ قائمة.
 *  N2  النهاية من النمط وحده: «اثنين · 170د» من 08:00 ← 10:50 مهما كان الطولُ القديم (30د)،
 *      و«اثنين·أربعاء» ← +80، و«أحد·ثلاثاء·خميس» ← +50، ويومٌ منفرد بطولٍ معتمد (اثنين 80) يبقى.
 *  N3  نهايةٌ تخالف النمط تمنع بسطرٍ واحد فيه النهاية الصحيحة؛ وما وافقه أو لا نمطَ لساعاته لا يُقال عنه شيء.
 *  N4  «خارج اللائحة» لا يُقال عن كتلة يومٍ واحد معتمدة، ولا عن ساعاتٍ لا نمطَ لها في المكتبة.
 *  N5  التاريخ لا يمنع: مقرّرٌ عادتُه الاثنين·الأربعاء، والثلاثاء وحده 08:00–10:50 كتلةٌ معتمدة تُحفظ.
 *  N6  الخادم (وضع العرض، في الذاكرة): سقفُ الساعات يمنع للشعبة نفسها ويقترح الشعبة الجديدة،
 *      ولا يحسب الموعدُ نفسَه (معرّفٌ رقمي أو نصّي من مسوّدة)، والطولُ المخالف يمنع، والثلاثاء 170 يُحفظ.
 */
/* قواعدُ الخادم أوّلاً (ترتيبُ الوحدات الدائرية كما في full-day-setting-audit)، ووضعُ العرض يُضبط قبل فتح المستودع. */
process.env.DATA_MODE = "demo";
await import("../src/server/core/hallBarter");
const { scheduleLengthIssue, unapprovedPatternIssue, fitPatternEnd } = await import("../src/server/core/scheduleRules");
const { Repository, initDatabase } = await import("../src/db/repository");
const { nextCourseSectionCode } = await import("../src/utils/nextCourseSectionCode");
const { completeSectionEnd, patternEnd, patternLengthIssue, patternMinutes, regulationEnd, regulationFit } = await import("../src/utils/appointmentRegulation");
const { daysFitLibrary } = await import("../src/utils/scheduleRegulations");
const { appointmentVerdict } = await import("../src/utils/appointmentVerdict");
const { sameScheduleShape } = await import("../src/utils/appointmentRegulation");
const { meetingSlots, lengthPatternsForHours, ownMeetingOf } = await import("../src/utils/requestMeetingLength");
const { REQUEST_LENGTH_SCRIPT } = await import("../src/server/requestLengthScript");
const fs = await import("node:fs");

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed += 1; console.log(`✓ ${label}`); }
  else { failed += 1; console.log(`✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`); }
};

const three = { CourseHours: 3 };
const four = { CourseHours: 4 };
const field = { CourseHours: 9 };
check(completeSectionEnd(three, ["fthursday"], "09:00", 50) === "11:50", "N0 الخميس وحده يكمل 3 ساعات تلقائياً بدل 09:50");
check(completeSectionEnd(three, ["fsunday", "ftuesday", "fthursday"], "09:00", 50) === "09:50", "N0 نمط الأيام الثلاثة يبقي اللقاء 50 دقيقة");
check(completeSectionEnd(four, ["fmonday"], "09:00", 110) === "12:50", "N0 اليوم الواحد لمقرر 4 ساعات يكمل كتلته");
check(completeSectionEnd(four, ["fsunday", "ftuesday"], "09:00", 50) === "10:50", "N0 الأحد والثلاثاء لمقرر 4 ساعات يحسبان 110 دقائق لكل يوم");
check(completeSectionEnd(three, ["fsunday", "ftuesday"], "09:00", 50) === "", "N0 الأحد والثلاثاء وحدهما غير معتمدين لمقرر 3 ساعات");

/* N1 */
const board = [
  { id: 1, AdCourseId: 9, AdTermId: 2, SCode: "501" },
  { id: 2, AdCourseId: 9, AdTermId: 2, SCode: "501" },
  { id: 3, AdCourseId: 9, AdTermId: 3, SCode: "507" },
  { id: 4, AdCourseId: 8, AdTermId: 2, SCode: "509" },
] as any[];
check(nextCourseSectionCode(board, 9, 2) === "502", "N1 شعبة 501 قائمة ← المقترحة 502", nextCourseSectionCode(board, 9, 2));
check(nextCourseSectionCode([], 9, 2) === "501", "N1 لا شعب ← 501");
check(nextCourseSectionCode([{ id: 9, AdCourseId: 9, AdTermId: 2, SCode: "01" }] as any, 9, 2) === "501", "N1 شعبة قديمة «01» لا تُعاد: المقترحة 501");

/* N2 */
check(regulationEnd(three, ["fmonday"], "08:00", 30) === "10:50", "N2 اثنين · 170د من 08:00 ← 10:50 ولو كان الطول القديم 30د", regulationEnd(three, ["fmonday"], "08:00", 30));
check(regulationEnd(three, ["fmonday"], "08:00") === "10:50", "N2 اثنين وحده بلا طول ← 10:50");
check(regulationEnd(three, ["fmonday", "fwednesday"], "09:30", 30) === "10:50", "N2 اثنين·أربعاء ← +80 مهما كان الطول القديم");
check(regulationEnd(three, ["fsunday", "ftuesday", "fthursday"], "08:00", 170) === "08:50", "N2 أحد·ثلاثاء·خميس ← +50");
check(regulationEnd(three, ["fmonday"], "08:00", 80) === "09:20", "N2 اثنين منفرد بطولٍ معتمد (80، لقاءٌ من نمط الاثنين·الأربعاء) يبقى");
check(regulationEnd(three, ["ftuesday"], "13:00", 0) === "15:50", "N2 أي يوم: الثلاثاء 13:00 ← 15:50");
check(regulationEnd(four, ["fsunday", "ftuesday"], "08:00") === "09:50", "N2 أربع ساعات أحد·ثلاثاء ← +110");
check(patternEnd(three, ["fmonday"], "8:00") === "10:50", "N2 بدايةٌ بلا صفرٍ أوّل (8:00) تُقرأ");
check(regulationEnd(field, ["fmonday"], "08:00") === "" && patternMinutes(field, ["fmonday"]) === null, "N2 ساعاتٌ لا نمطَ لها في المكتبة: لا نهايةَ تُخترع");
check(regulationEnd(three, ["fsunday", "ftuesday"], "08:00") === "", "N2 أيامٌ ليست نمطاً: لا نهايةَ تُخترع (حكمُ الأيام يقوله فحصٌ آخر)");

/* N3 */
const wrong = patternLengthIssue(three, ["fmonday"], "08:00", "08:30");
check(/لا توافق النمط المعتمد/.test(wrong) && /10:50/.test(wrong) && /اثنين · 170د/.test(wrong), "N3 اثنين 08:00–08:30 يمنع بسطرٍ فيه «اثنين · 170د» و10:50", wrong);
check(patternLengthIssue(three, ["fmonday"], "08:00", "10:50") === "", "N3 اثنين 08:00–10:50 سليم");
check(patternLengthIssue(three, ["fmonday"], "08:00", "09:20") === "", "N3 اثنين 80د (لقاءٌ من نمطٍ معتمد) سليم");
check(/09:20/.test(patternLengthIssue(three, ["fmonday", "fwednesday"], "08:00", "09:15")), "N3 اثنين·أربعاء 75د يمنع والنهاية 09:20");
check(patternLengthIssue(three, ["fsunday", "ftuesday"], "08:00", "09:15") === "", "N3 أيامٌ ليست نمطاً: يقولها فحصُ الأيام لا فحصُ الطول (سطرٌ واحد)");
check(patternLengthIssue(field, ["fmonday"], "08:00", "09:15") === "", "N3 ساعاتٌ لا نمطَ لها: لا منع");

/* N4 */
check(daysFitLibrary(3, ["fmonday"], false) === true && daysFitLibrary(3, ["ftuesday"], true) === true, "N4 كتلةُ اليوم الواحد ضمن المكتبة لأي يوم");
check(regulationFit(three, ["fmonday"], "08:00", "10:50") === "fits", "N4 «اثنين · 170د» ليس «خارج اللائحة»");
check(regulationFit(field, ["fmonday"], "08:00", "09:15") === "unknown", "N4 ساعاتٌ لا نمطَ لها ليست «خارج اللائحة»");
const verdict = appointmentVerdict({
  form: { AdCourseId: 9, AdInstructorId: 2, fmonday: true, fstarttime: "08:00", fendtime: "08:30", buildingId: "b", locationStatus: "PENDING_ROOM" },
  validationIssues: [wrong], conflicts: [], regulation: "off", regulationNote: wrong,
});
check(!verdict.canSave && verdict.blockers.length === 1 && verdict.blockers[0].id === "regulation", "N3 الحكمُ في النموذج: النهاية المخالفة مانعٌ واحد (لا يتكرر سطر الخادم)", verdict.blockers.map(item => item.text));

/* N5 + N6 — الخادم في وضع العرض (في الذاكرة؛ لا بيانات حقيقية) */
await initDatabase();
/* المقرّرُ مقرّرُ اختبار بثلاث ساعات (لا يعتمد على بذر العرض)؛ والأسبوعُ يُمرَّر (hypothetical) فلا يُقرأ المستودع. */
const cid = 9001;
(Repository as any).getCourseById = async (id: number) => Number(id) === cid ? { AdCourseId: cid, CourseHours: 3, CourseCredit: 3 } : null;
const scope = { AdCollegeId: 1, AdSectionId: 1, AdTermId: 2, AdCourseId: cid };
const existing = [
  { ...scope, id: 7001, SCode: "501", fsunday: false, fmonday: true, ftuesday: false, fwednesday: true, fthursday: false, fstarttime: "12:30", fendtime: "13:50" },
] as any[];
const fresh = { ...scope, SCode: "501", fsunday: false, fmonday: true, ftuesday: false, fwednesday: false, fthursday: false, fstarttime: "08:00", fendtime: "10:50" };
const full = await scheduleLengthIssue(fresh, existing);
check(Boolean(full) && /الساعات المعتمدة/.test(String(full)) && /حُسب معه للشعبة 501/.test(String(full)) && /لشعبة جديدة: 502/.test(String(full)), "N6 الشعبة 501 مكتملة: يمنع ويقترح «لشعبة جديدة: 502»", full);
check(await scheduleLengthIssue({ ...fresh, SCode: "502" }, existing) === null, "N6 الشعبة 502 الجديدة تُحفظ");
check(await scheduleLengthIssue({ ...existing[0], fstarttime: "14:00", fendtime: "15:20" }, existing) === null, "N6 تعديل موعدٍ قائم (معرّف رقمي) لا يحسب نفسه");
const draftWeek = [{ ...existing[0], id: "draft-a1" }] as any[];
check(await scheduleLengthIssue({ ...draftWeek[0], fstarttime: "14:00", fendtime: "15:20" }, draftWeek) === null, "N6 مسوّدة بمعرّفٍ نصّي لا تحسب نفسها");
check(await scheduleLengthIssue({ ...existing[0], id: "7001", fstarttime: "14:00", fendtime: "15:20" }, existing) === null, "N6 المعرّف نفسه رقماً ونصّاً واحد");
const shortEnd = await unapprovedPatternIssue({ ...fresh, SCode: "502", fendtime: "08:30" }, existing);
check(/لا توافق النمط المعتمد/.test(String(shortEnd)) && /10:50/.test(String(shortEnd)), "N6 الخادم: اثنين 08:00–08:30 يمنع ويقول 10:50", shortEnd);
check(await unapprovedPatternIssue({ ...fresh, SCode: "502" }, existing) === null, "N6 الخادم: اثنين 08:00–10:50 (يوم واحد من المكتبة) لا «خارج اللائحة»");
/* N5: عادةُ المقرّر الاثنين·الأربعاء، والثلاثاء وحده كتلةٌ معتمدة. */
const tuesday = { ...scope, SCode: "502", fsunday: false, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false, fstarttime: "08:00", fendtime: "10:50" };
check(regulationEnd(three, ["ftuesday"], "08:00") === "10:50", "N5 الثلاثاء 08:00 ← 10:50 من المكتبة لا من العادة");
check(await scheduleLengthIssue(tuesday, existing) === null && await unapprovedPatternIssue(tuesday, existing) === null, "N5 الثلاثاء 08:00–10:50 يُحفظ ولو كانت العادة الاثنين·الأربعاء");
const tuesdayWrong = await unapprovedPatternIssue({ ...tuesday, fendtime: "09:15" }, existing);
check(/لا توافق النمط المعتمد/.test(String(tuesdayWrong)), "N5 والثلاثاء بنهايةٍ يدوية مخالفة (09:15) يمنع", tuesdayWrong);

/* N7 — موعدٌ قديم بطولٍ خارج المكتبة (اثنين·أربعاء 75د) تتغيّر قاعتُه وحدها يُحفظ؛ وتغييرُ بدايته يطبّق النمط. */
const legacy = { fmonday: true, fwednesday: true, fstarttime: "08:00", fendtime: "09:15" };
const roomOnly = { ...legacy, AdRoomCode: "901A02", AdRoomHall: "301" };
check(regulationFit(three, ["fmonday", "fwednesday"], "08:00", "09:15") === "off", "N7 الطولُ القديم (75د) خارج النمط فعلاً");
check(sameScheduleShape(legacy, roomOnly) && !sameScheduleShape(legacy, { ...legacy, fstarttime: "09:30", fendtime: "10:45" }), "N7 القاعدةُ الواحدة: تغييرُ القاعة شكلٌ لم يتغيّر، وتغييرُ البداية شكلٌ جديد");
const keptVerdict = appointmentVerdict({ form: { ...roomOnly, AdCourseId: 9, AdInstructorId: 2, buildingId: "b", roomId: "r" } as any, validationIssues: [], conflicts: [],
  regulation: sameScheduleShape(legacy, roomOnly) ? "unknown" : regulationFit(three, ["fmonday", "fwednesday"], "08:00", "09:15") });
check(keptVerdict.canSave, "N7 النموذج: تغييرُ القاعة وحدها يُحفظ (لا مانعَ للطول القديم)", keptVerdict.blockers);
check(regulationEnd(three, ["fmonday", "fwednesday"], "09:30", 75) === "10:50", "N7 تغييرُ البداية يطبّق النمط: 09:30 ← 10:50");
check(sameScheduleShape(null, roomOnly) === false, "N7 موعدٌ جديد ليس «شكلاً لم يتغيّر»");
const own = { days: ["fmonday", "fwednesday"] as any, minutes: 75, start: "08:00" };
check(meetingSlots(["fmonday", "fwednesday"], "08:00", lengthPatternsForHours(3), own).every(slot => slot.end === "09:15"), "N7 كرت الأستاذ: البدايةُ والأيامُ كما هي ← الطولُ المحفوظ يبقى");
check(meetingSlots(["fmonday", "fwednesday"], "09:30", lengthPatternsForHours(3), own).every(slot => slot.end === "10:50"), "N7 كرت الأستاذ: بدايةٌ جديدة ← النمط (10:50)");
check(ownMeetingOf({ days: "الاثنين · الأربعاء", time: "08:00 – 09:15" })?.start === "08:00", "N7 لقطةُ البند تحمل بداية الموعد المحفوظ");
const pageFns = new Function(`${REQUEST_LENGTH_SCRIPT}; return { meetingSlots };`)() as any;
check(JSON.stringify(pageFns.meetingSlots(["fmonday", "fwednesday"], "08:00", lengthPatternsForHours(3).map(p => ({ days: p.days, minutes: p.minutes })), own)) === JSON.stringify(meetingSlots(["fmonday", "fwednesday"], "08:00", lengthPatternsForHours(3), own))
  && pageFns.meetingSlots(["fmonday", "fwednesday"], "09:30", lengthPatternsForHours(3), own)[0].end === "10:50", "N7 صفحةُ الأستاذ تحسب ما يحسبه الخادم");
/* N8 — المسارات التي تنقل موعداً تحسب النهاية بنفسها (أقربُ طولٍ معتمد)، والنموذجُ يبقى على الكتلة. */
check(regulationEnd(three, ["fthursday"], "18:00", 75, true) === "18:50" && regulationEnd(three, ["fmonday"], "08:00", 75, true) === "09:20", "N8 نقلُ لقاءٍ قديم (75د): أقربُ طولٍ معتمد لليوم (خميس 50، اثنين 80)");
check(regulationEnd(three, ["fmonday"], "08:00", 30) === "10:50", "N8 والنموذج (بلا nearest) يبقى على الكتلة: «اثنين · 170د» ← 10:50");
check(await fitPatternEnd({ ...scope, fsunday: false, fmonday: false, ftuesday: false, fwednesday: false, fthursday: true, fstarttime: "18:00", fendtime: "19:15" }) === "18:50", "N8 الخادم: اعتمادُ نقلٍ إلى الخميس 18:00 يكتب 18:50");
check(await fitPatternEnd({ ...scope, fsunday: false, fmonday: true, ftuesday: false, fwednesday: true, fthursday: false, fstarttime: "09:30", fendtime: "10:45" }) === "10:50", "N8 الخادم: اثنين·أربعاء 75د ← 80د");
/* N9 — كرت الأستاذ: نقلُ لقاء الخميس 75د لمقرّر أربع ساعات إلى 15:00 ← أقربُ طولٍ معتمد (110د: 16:50) لا الكتلة 230د، والصفحةُ مثله. */
const thu75 = { days: ["fthursday"] as any, minutes: 75, start: "14:00" };
const p4 = lengthPatternsForHours(4);
check(meetingSlots(["fthursday"], "15:00", p4, thu75)[0].end === "16:50", "N9 كرت الأستاذ: الخميس 15:00 ← 16:50 (110د)");
check(pageFns.meetingSlots(["fthursday"], "15:00", p4.map(p => ({ days: p.days, minutes: p.minutes })), thu75)[0].end === "16:50", "N9 وصفحةُ الأستاذ تحسب 16:50 نفسها");
check(meetingSlots(["fthursday"], "14:00", p4, thu75)[0].end === "15:15", "N9 والبدايةُ نفسها (لم يتغيّر الشكل) تُبقي 75د");
const schedulesSrc = fs.readFileSync("src/components/Schedules.tsx", "utf8");
const proposalSrc = fs.readFileSync("src/server/studyProposalEngine.ts", "utf8");
const writesSrc = fs.readFileSync("src/server/core/scheduleWrites.ts", "utf8");
check(/sameScheduleShape\(\(editorOriginalRow/.test(schedulesSrc) && /sameScheduleShape\(original/.test(proposalSrc) && /unchangedShape=sameScheduleShape\(existing/.test(writesSrc), "N7 المحرر والمقترح وبوابة التعديل يقرؤون sameScheduleShape نفسها");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
