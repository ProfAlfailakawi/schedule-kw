/**
 * ── ملاحظاتُ المالك على «رغبات الأساتذة» (2026-11-12) ────────────────────────
 *
 *  7  «ثبّت الجدول» لا يثبّت موعداً يخالف النمط أو اللائحة، ويقول السبب.
 *  9  «بطاقتي» تقرأ طلبات الأستاذ بمعرّفه لا بمسح الفصل، وصفحةُ الطلب تقرأ معاً.
 * 11  من بند الطلب إلى موعده الأصلي في الجدول الدراسي بالنموذج المعتاد.
 * 13  مسارُ كل أستاذ بالترتيب (buildTeacherTracks) — سلوكيّ.
 * 14  إيقافُ بطاقة القسم لا يُسقط روابطَ الأساتذة الشخصية إلا بطلبٍ صريح.
 * 15  إرسالٌ خاص ✏️ لمن أُغلقت نافذةُ طلبه المرسَل يعيد فتحه (حادثة نوال العتيبي).
 * 16  القاعةُ المخالفةُ نوعاً أو الأصغرُ سعةً لا تُرشَّح — سلوكيّ.
 * 17  الموعدُ في سطرين معزولين، وحقولُ التاريخ والساعة باتجاهها.
 * 18  «طلبك جاهز» لا يُقال وفي الطلب مانع، وشريطُ الإرسال لا يظهر إلا وكلُّ شيءٍ سليم.
 * 19  حقائقُ الأستاذ المصغّرة تُقال بكلماتها (نصاب · أيام · فراغ).
 */
import fs from "fs";
import { buildTeacherTracks } from "../src/utils/cardRecipients";
import { rankRequestRooms } from "../src/utils/requestRoomRanking";
import { daysFitLibrary } from "../src/utils/scheduleRegulations";
import type { DayKey } from "../src/utils/scheduleRegulations";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}
const read = (file: string) => fs.readFileSync(file, "utf8");

/* ── 16 · القاعة ─────────────────────────────────────────────────────────── */
const base = { courseSectionId: 5, nearBuildingIds: new Set<string>(), previousRoomIds: new Set<string>(), usage: new Map<string, number>() };
const ranked = rankRequestRooms([
  { key: "lab", roomId: "lab", capacity: 40, fit: 0 * 1000 - 18, typeMismatch: true, sectionIds: [5] },
  { key: "small", roomId: "small", capacity: 20, fit: 2 * 1000 + 12, sectionIds: [5] },
  { key: "hall", roomId: "hall", capacity: 45, fit: 2 * 1000 + 20 },
], { ...base, seats: 35 });
check(ranked.map(room => room.key).join(",") === "hall", "16: المخالفُ نوعاً والأصغرُ من سعة الشعبة لا يُرشَّحان");
const onlyMismatch = rankRequestRooms([{ key: "lab", roomId: "lab", capacity: 40, fit: -18, typeMismatch: true }], { ...base, seats: 35 });
check(onlyMismatch.length === 1, "16: قسمٌ بلا قاعةٍ من نوع المقرر أصلاً يبقى له المخالفُ آخرَ الترتيب");
const unknownCap = rankRequestRooms([{ key: "x", roomId: "x", capacity: 0, fit: 2012 }], { ...base, seats: 35 });
check(unknownCap.length === 1, "16: سعةٌ غير مسجّلة لا تُسقط القاعة");
check(/typeMismatch: rules\.selectedCourseFit\(key, courseIdOfItem\) < 500/.test(read("src/server/core/instructorRequests.ts")), "16: الحكمُ يمرّر مخالفةَ النوع إلى الترتيب");

/* ── 13 · المسار ─────────────────────────────────────────────────────────── */
const tracks = buildTeacherTracks({
  sends: [
    { at: "2026-11-10T18:29:12.000Z", mode: "edit", closesAt: "2026-11-11T20:59:59.000Z", instructorIds: [922, 7], picked: true },
    { at: "2026-11-11T09:00:00.000Z", mode: "view", instructorIds: [7] },
  ],
  requests: [
    { AdInstructorId: 922, timeline: [
      { kind: "link-created", at: "2026-11-10T18:29:13.000Z" },
      { kind: "link-opened", at: "2026-11-10T19:00:00.000Z" },
      { kind: "submitted", at: "2026-11-10T19:10:00.000Z", detail: "2" },
      { kind: "item-fixed", at: "2026-11-11T08:00:00.000Z" },
    ] },
    { AdInstructorId: 7, timeline: [{ kind: "submitted", at: "2026-11-10T20:00:00.000Z", detail: "0" }, { kind: "unchanged-confirmed", at: "2026-11-10T20:00:00.000Z" }] },
  ],
  personal: [{ instructorId: 922, sentAt: "2026-11-10T18:30:00.000Z", seenAt: "2026-11-10T18:59:00.000Z" }],
  names: new Map([[922, "نوال"], [7, "حامد"]]),
});
const nawal = tracks.find(track => track.instructorId === 922)!;
check(Boolean(nawal) && nawal.events.map(event => event.tone).join(",") === "send,send,open,open,change,decide", "13: الإرسالُ ثم التسليمُ ثم الفتحُ ثم الإرسالُ ثم قرارُ القسم — بالترتيب");
check(!nawal.events.some(event => event.text === "فُتح له طلب التعديل"), "13: «فُتح له طلب التعديل» لا يكرّر سطرَ الإرسال الواقع معه");
check(nawal.events.some(event => /^أرسل طلبه \(.+\)$/.test(event.text) && /2|تعديلان/.test(event.text)), "13: عددُ التعديلات في سطر الإرسال");
const hamed = tracks.find(track => track.instructorId === 7)!;
check(hamed.events.some(event => event.tone === "pin") && hamed.events.some(event => /للعرض/.test(event.text)), "13: التثبيتُ وإرسالُ العرض كلاهما في مساره");
check(tracks[0].instructorId === 7, "13: الأحدثُ حركةً أولاً");
check(!JSON.stringify(tracks).match(/قاعة|AdRoom|Civil/), "13: لا قاعةَ ولا رقمَ مدنيّ في المسار");
const routes = read("src/server/publishCardsRoutes.ts");
check(/app\.get\("\/api\/instructor-requests\/track", requirePermission\(7\)/.test(routes) && /isScopeAllowed\(req, collegeId, sectionId\)/.test(routes), "13: مسارُ المتابعة بإذن القسم ونطاقه");
const publish = read("src/components/SchedulePublish.tsx");
check(/\/api\/instructor-requests\/track\?/.test(publish) && /publish-track-events/.test(publish), "13: المنسّقُ يرى مسارَ كل أستاذ في المتابعة");

/* ── 14 · إيقافُ بطاقة القسم ─────────────────────────────────────────────── */
const share = read("src/server/routes/shareRoutes.ts");
check(/const stopEverything = req\.query\.scope === "all";/.test(share), "14: الإيقافُ الشامل بطلبٍ صريح وحده");
check(/!Number\(link\.AdInstructorId \|\| 0\) && !stopEverything\) \{[\s\S]{0,260}Repository\.revokeShareLink\(link\.id\);[\s\S]{0,200}return;/.test(share), "14: الافتراضيُّ يوقف بطاقةَ القسم وحدها");
check(/livePersonalStaffLinkOf\(row, Number\(person\.AdInstructorId\)\)/.test(read("src/server/routes/publicStaffRoutes.ts")), "14: رابطُه الشخصيُّ الحيّ يُبقي له طلبَ التعديل وإن أُوقفت بطاقةُ القسم");
check(/share-stop-ask/.test(publish) && /أوقف بطاقة القسم فقط/.test(publish) && /\?scope=all/.test(publish), "14: سؤالٌ قبل الإيقاف: وحدها أم مع روابط الأساتذة");

/* ── 15 · إعادةُ الفتح بإرسالٍ خاص ───────────────────────────────────────── */
const issue = read("src/server/routes/instructorRequestsRoutes.ts");
check(/const pickedEditReopen = picking && !onlyNoted && issueMode === "edit" && move === "keep" && !requestWindowOpen\(held!\);/.test(issue), "15: ✏️ لأستاذٍ نافذتُه مغلقة وطلبُه عند القسم ← يُعاد فتحه");
check(/\(onlyNoted \|\| individualOnly \|\| pickedEditReopen\) && move === "keep"/.test(issue), "15: يمرّ بمسار التمديد نفسه (رابطٌ صالح وموعدٌ جديد)");
check(/أُعيد فتح التعديل بإرسالٍ خاص/.test(issue), "15: إعادةُ الفتح تُكتب في سجلّ الطلب");

/* ── 7 · التثبيت ─────────────────────────────────────────────────────────── */
const pub = read("src/server/routes/publicRequestRoutes.ts");
check(/export async function pinReview/.test(pub) && /daysFitLibrary\(hours, union, own\.length > 1\) === false/.test(pub) && !/sectionDaysCompliant|spread/.test(pub) && /scheduleLengthIssue\(row\)/.test(pub), "7: التثبيتُ يُفحص بأيام النمط وساعات المقرر");
check(/code: "pin-blocked"/.test(pub) && /const review = await pinReview\(judged\);\s*const blockers = review\.blocks;/.test(pub), "7: الخادمُ يرفض التثبيت المخالف بنصّه");
check(/pinBlocked: pinState\.blocks,/.test(pub) && /pinSoft: pinState\.soft,/.test(pub), "7: الصفحةُ تعرف المانعَ والتنبيهَ قبل الضغط");
/* قرار المالك: مدّةُ اللقاء وحدها (75د قديمة) لا تمنع «ثبّت»؛ تُقال للأستاذ وتصل القسم. */
check(/const lengthOnly = await unapprovedPatternIssue\(row\)[^\n]*\n\s*if \(lengthOnly\) soft\.push/.test(pub), "7: مدّةٌ لا توافق النمط تنبيهٌ لا مانع");
check(/unchangedConfirmed && pinSoftNotes\.length \? \{ pinSoftNotes \}/.test(pub) && /row\.pinSoftNotes\?\.length/.test(read("src/components/InstructorInbox.tsx")), "7: التنبيهُ يُحفظ مع التثبيت ويراه القسم");
check(/var pinSoftTxt=/.test(read("src/server/pages/instructorRequestPage.ts")) && /تنبيه لا يمنع: /.test(read("src/server/pages/instructorRequestPage.ts")), "7: الأستاذُ يرى التنبيهَ ويثبّت");
const page = read("src/server/pages/instructorRequestPage.ts");
check(/var pinBlockTxt=/.test(page) && /!pinBlockTxt\)h\+='<div class="send">/.test(page), "7: لا زرَّ «ثبّت الجدول» وفيه مخالفة");
check(/edited===0&&!String\(noteNow\(\)\)\.trim\(\)&&data\.pinBlocked/.test(page) && /if\(hadNote!==!!gn\.value\.trim\(\)\)paint\(\)/.test(page), "7: ملاحظةٌ للقسم تجعله إرسالاً لا تثبيتاً، ويُعاد رسمُ الشريط حين تُكتب");

{
  const d = (...days: DayKey[]) => new Set<DayKey>(days);
  /* قرار المالك 2026-11-13: المكتبةُ وحدها — لا «يومان غير متجاورين» بالعدد. */
  const pinOk = (hours: number, ...days: DayKey[]) => daysFitLibrary(hours, d(...days), days.length > 1) !== false;
  check(pinOk(3, "fmonday", "fwednesday"), "7: الاثنين والأربعاء لمقررٍ بثلاث ساعات نمطٌ معتمد");
  check(pinOk(3, "fsunday", "ftuesday") && pinOk(3, "ftuesday", "fthursday"), "7: الأحد·الثلاثاء والثلاثاء·الخميس في المكتبة: يثبّت");
  check([2, 3, 4, 5].every(h => !pinOk(h, "fmonday", "fthursday")), "7: الاثنين·الخميس يمنع التثبيت لكل الساعات");
  check([2, 3, 4, 5].every(h => !pinOk(h, "fsunday", "fwednesday")), "7: الأحد·الأربعاء يمنع التثبيت لكل الساعات");
  check([2, 3, 4, 5].every(h => !pinOk(h, "fsunday", "fthursday")), "7: الأحد·الخميس يمنع التثبيت لكل الساعات");
  check(!pinOk(3, "fsunday", "fmonday"), "7: يومان متجاوران يمنعان التثبيت");
  check(["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"].every(day => [1, 2, 3, 4, 5].every(h => pinOk(h, day as DayKey))), "7: كتلةُ اليوم الواحد تثبَّت على أيّ يوم");
}

/* ── 18 · الجاهزيةُ والشريط ──────────────────────────────────────────────── */
const visual = read("src/server/requestVisual.ts");
check(!/t=edited>0\?"طلبك جاهز للإرسال"/.test(visual), "18: «طلبك جاهز للإرسال» لم تعد تُقال بلا شرط");
check(/function skNext\(open,sent,edited,blocked,incomplete,pinBlocked\)/.test(visual) && /طلبك لم يكتمل بعد/.test(visual), "18: المانعُ يُقال بدل «جاهز»");
check(/skNext\(open,sent,edited,badN,incompleteN,pinBlockTxt\)/.test(page) && /&&!badN&&!incompleteN&&!pinBlockTxt\)/.test(page), "18: شريطُ الإرسال لا يظهر وفي الطلب مانعٌ أو نقص");
check(/body:has\(\.send\) \.sk-badge-toast\{bottom:calc\(96px/.test(visual) && /pointer-events:none;/.test(visual), "18: إرشادُ اللائحة لا يغطّي زرَّ الإرسال ولا يلتقط ضغطه");

/* ── 17 · التاريخ والساعة ─────────────────────────────────────────────────── */
const ui = read("src/components/ui.tsx");
check(/export function KwWhen/.test(ui) && /kw-when-date/.test(ui) && /kw-when-time/.test(ui), "17: موعدٌ في سطرين معزولين");
check((publish.match(/type="(date|time)" dir="ltr"/g) || []).length >= 4, "17: حقولُ التاريخ والساعة في النشر باتجاهها");
const inbox = read("src/components/InstructorInbox.tsx");
check(/<KwWhen value=\{unchangedConfirmedAt\(row\)\} \/>/.test(inbox) && !/unchangedConfirmedDateTime/.test(inbox), "17: قائمةُ من ثبّت جدوله بالموعد ذي السطرين");

/* ── 19 · الحقائق المصغّرة ───────────────────────────────────────────────── */
const mini = read("src/components/TeacherMiniWeek.tsx");
check(/mini-week-fact-word">فراغ</.test(mini) && /mini-week-fact-word">نصاب</.test(mini) && /countOf\(header\.daysAfter, AR\.day\)/.test(mini), "19: «نصاب» و«أيام» و«فراغ … س» بكلماتها");
check(/ساعات الفراغ بين محاضراته في الأسبوع/.test(mini), "19: تلميحٌ يشرح الفراغ");

/* ── 11 · إلى الموعد الأصلي ─────────────────────────────────────────────── */
check(/function openRowInSchedule\(rowId: number\)/.test(inbox) && /افتح الموعد في الجدول/.test(inbox), "11: زرٌّ ينقل إلى الموعد الأصلي");
const schedules = read("src/components/Schedules.tsx");
check(/sessionStorage\.getItem\("schedule:open-row"\)/.test(schedules) && /openEdit\(row\);\s*setMessage\("هذا الموعد الأصلي من طلب الأستاذ/.test(schedules), "11: الجدولُ يفتح نموذجَه المعتاد للموعد");

/* ── 9 · السرعة ─────────────────────────────────────────────────────────── */
check(/getInstructorRequestsForInstructor: async/.test(read("src/db/repository.ts")), "9: قراءةُ طلبات أستاذٍ واحدٍ بمعرّفه");
const staff = read("src/server/routes/publicStaffRoutes.ts");
check(/getInstructorRequestsForInstructor\(Number\(link\.AdTermId\), Number\(person\.AdInstructorId\)\)/.test(staff) && !/getInstructorRequests\(0, 0, Number\(link\.AdTermId\)\)/.test(staff), "9: «بطاقتي» لا تمسح طلبات الفصل كلّه");
check(/const \[taDoc, termStates, offeringViews, interestDocs, taRows, dayPatterns, lengthPatterns, pinState, hintedCourses\] = await Promise\.all\(\[/.test(pub), "9: صفحةُ الطلب تقرأ ما لا يعتمد بعضُه على بعض معاً");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
