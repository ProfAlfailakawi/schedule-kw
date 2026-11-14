/**
 * ── كرت الأستاذ: الجولة السادسة (إصلاحاتٌ ومحاضرتك القادمة وأسبوعي الصحي) ─────────────────
 *
 *   ١  مقرّرٌ غير مطروح لا يدخل المسودة (أعد الطلب نفسه، والمسودة المستعادة)، والإرسالُ يحمل رقمَ البند المخالف.
 *   ٢  سطرُ «للاطلاع» تحت الموعد بحسب الحالة: عرضٌ، تدريب، مكتمل قبل الموعد، انقضاء المهلة.
 *   ٣  «تحقّق من توقيعك»: الحجبُ لكل رقمٍ مدنيّ (بصمتُه) وسقفٌ أوسع للعنوان؛ شبكةُ الجامعة لا تُحجب بعشر أخطاء.
 *   ٤  اشتراكُ التقويم مربوطٌ بالرابط الحيّ: مفتاحٌ مربوط، ورمزٌ لغير صاحبه أو موقوف لا يعرض جدولاً.
 *   ٥  شعبتان لمقرّرٍ واحد بالوقت نفسه: تنبيهٌ لا يمنع في الكرت (قرار المالك 2026-11-14، نهائي).
 *   ٦  «محاضرتك القادمة»: ساعةٌ ثابتة، توقيتُ الكويت، الأحدُ أولُ الأسبوع، الجمعةُ والسبتُ عطلة، حدودُ الفصل.
 *   ٧  «أسبوعي الصحي»: أيامُ الحضور، أطولُ فراغ، أكثفُ يوم، التنقّلُ بين الحرمين بسياسة التنقّل، وجملةٌ واحدة إن برز شيء.
 *   ٨  لا قاعةَ ولا مبنى، والخطوطُ ≥12px، وما يُضغط ≥44px.
 */
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { TEACHER_CARD_LOGIC_JS, TEACHER_CARD_R5_CSS } from "../src/server/teacherCardLogic";
import { TEACHER_CARD_EXTRAS_JS } from "../src/server/teacherCardExtras";
import { REQUEST_REPLAY_SCRIPT } from "../src/server/requestReplayScript";
import { ARABIC_COUNT_SCRIPT } from "../src/utils/arabicCount";
import { TRAVEL_HINT_SCRIPT } from "../src/utils/campusTravelHint";
import { instructorRequestPage } from "../src/server/pages/instructorRequestPage";
import { createVerifyAttemptGuard, VERIFY_IP_CEILING } from "../src/server/verifyAttempts";
import { calendarFeedKey, instructorFromCalendarKey, personCalendarKey } from "../src/server/calendarSecret";
import { liveCardLinkFor } from "../src/utils/shareLinkLifetime";
import { teacherWeekFacts } from "../src/server/teacherWeekFacts";
import { defaultTravelPolicy, travelShortfalls } from "../src/utils/campusTravelPolicy";
import { campusOf } from "../src/utils/campusTravel";
import { judgeRequest, headlineReasonOf, type RequestedRow, type VerdictContext } from "../src/utils/instructorRequestVerdict";
import { roomKeyOf } from "../src/utils/locationRegistry";
import type { AdCourse, AdInstructor, FSchedule } from "../src/types";

let passed = 0, failed = 0;
const check = (ok: boolean, name: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ""); }
};
const read = (file: string) => readFileSync(file, "utf8");
const logic: any = {};
vm.createContext(logic);
vm.runInContext(ARABIC_COUNT_SCRIPT + "\n" + TRAVEL_HINT_SCRIPT + "\n" + TEACHER_CARD_LOGIC_JS, logic);
const replayCtx: any = {};
vm.createContext(replayCtx);
vm.runInContext(REQUEST_REPLAY_SCRIPT, replayCtx);
const pageSrc = read("src/server/pages/instructorRequestPage.ts");
const routes = read("src/server/routes/publicRequestRoutes.ts");
const html = instructorRequestPage("tok", "nonce");
const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join("\n");

/* ── ١ مقرّرٌ غير مطروح ──────────────────────────────────────────────────── */
{
  const courses = [
    { id: 7, collegeId: 1, sectionId: 1, name: "مفتوح" },
    { id: 8, collegeId: 1, sectionId: 1, name: "مغلق", offering: { state: "closed", icon: "🔒", line: "غير مطروح هذا الفصل" } },
  ];
  const prev = { items: [
    { action: "add", courseId: 7, collegeId: 1, sectionId: 1, days: ["fsunday"], start: "09:00", courseName: "مفتوح", state: "fixed" },
    { action: "add", courseId: 8, collegeId: 1, sectionId: 1, days: ["fsunday"], start: "10:00", courseName: "مغلق", state: "fixed" },
  ] };
  const plan = replayCtx.planReplay(prev, [], courses, ["fsunday", "fmonday"], () => false);
  check(plan.ops.length === 1 && plan.ops[0].courseId === 7, "١ «أعد الطلب نفسه» يُدخل المقرّرَ المطروح وحده", plan.ops);
  check(plan.skipped.length === 1 && plan.skipped[0].name === "مغلق" && plan.skipped[0].why === "غير مطروح هذا الفصل", "١ والمغلقُ يُقال سببُ تركه في سطرٍ واحد", plan.skipped);
  const d = (courseId: number) => ({ courseId, collegeId: 1, sectionId: 1 });
  check(logic.tcCourseOpen(courses, d(7)) && !logic.tcCourseClosed(courses, d(7)), "١ المسودةُ المستعادة: مقرّرٌ مطروح يُستعاد");
  check(logic.tcCourseClosed(courses, d(8)) && !logic.tcCourseOpen(courses, d(8)), "١ ومقرّرٌ مغلق يُترك");
  check(!logic.tcCourseOpen(courses, d(9)) && !logic.tcCourseClosed(courses, d(9)), "١ ومقرّرٌ ليس في القائمة أصلاً لا يُستعاد ولا يُقال عنه شيء");
  check(logic.tcClosedLine(["مغلق"]) === "لم نستعد «مغلق» — غير مطروح هذا الفصل." && logic.tcClosedLine(["أ", "ب"]) === "لم نستعد «أ، ب» — غير مطروح هذا الفصل." && logic.tcClosedLine([]) === "",
    "١ السطرُ الواحد بالاسم أو الأسماء");
  check(/else if\(d\.action==="add"&&d\.courseId&&tcCourseClosed\(data\.courses,d\)\)/.test(script) && /tcCourseOpen\(data\.courses,d\)&&!state\.some/.test(script)
    && /draftClosed=back\.closed/.test(script) && /draftClosed=res\.closed/.test(script) && /tcClosedLine\(draftClosed\)/.test(script),
    "١ الصفحة: التطبيقُ على المسودة يترك المغلق ويُظهر السطرَ في الاستعادة وفي «حدّث مع الإبقاء على تعديلي»");
  check(/closedAt = sentList\.findIndex/.test(routes) && /itemIndex: closedAt/.test(routes) && /غير مطروح هذا الفصل/.test(routes),
    "١ الخادم: خطأُ «غير مطروح» يحمل رقمَ البند المخالف ليُبرزه الكرت");
  check(/typeof x\.d\.itemIndex==="number"&&state\[x\.d\.itemIndex\]/.test(script) && /focusItem\(x\.d\.itemIndex/.test(script), "١ والكرتُ يُبرز البندَ برقمه عند فشل الإرسال");
}

/* ── ٢ سطرُ «للاطلاع» ───────────────────────────────────────────────────── */
{
  const now = Date.parse("2026-11-14T08:00:00Z");
  const future = "2026-11-20T20:59:59.000Z", past = "2026-11-10T20:59:59.000Z";
  const line = (d: any) => logic.tcRowReadOnly(d, now);
  check(line({ mode: "view", request: { window: { closesAt: future } } }) === "رابط للعرض فقط", "٢ رابطُ العرض: «رابط للعرض فقط»");
  check(line({ mode: "view", request: { window: { closesAt: past } } }) === "رابط للعرض فقط", "٢ ورابطُ العرض بعد المهلة أيضاً");
  check(line({ mode: "ta", request: { window: { closesAt: future } } }) === "للاطلاع — اختر من الشعب المتاحة أدناه", "٢ مرحلةُ التدريب: عبارتُها، والمهلةُ مفتوحة");
  check(!/انتهت/.test(line({ mode: "ta", request: { window: { closesAt: future } } })), "٢ لا «انتهت مدّة الطلبات» والمهلةُ مفتوحة");
  check(line({ mode: "edit", request: { status: "settled", window: { closesAt: future } } }) === "اكتمل طلبك", "٢ طلبٌ اكتمل قبل الموعد: «اكتمل طلبك»");
  check(line({ mode: "edit", request: { status: "settled", window: { closesAt: past } } }) === "انتهت مدّة الطلبات — هذا الموعد للاطلاع.", "٢ والمهلةُ انقضت: النصُّ القديم");
  check(line({ mode: "edit", request: { window: { closesAt: past } } }) === "انتهت مدّة الطلبات — هذا الموعد للاطلاع.", "٢ بلا حسمٍ والمهلةُ انقضت: النصُّ القديم");
  check(!/انتهت/.test(line({ mode: "edit", request: { window: { closesAt: future } } })), "٢ والمهلةُ مفتوحة ولا حسم: لا ادّعاءَ بانتهائها");
  check(/esc\(tcRowReadOnly\(data,Date\.now\(\)\)\)/.test(script) && !/<p class="appt-ro">انتهت مدّة الطلبات/.test(script), "٢ الصفحةُ لا تكتب النصَّ القديم تحت كل صفّ");
}

/* ── ٣ حجبُ «تحقّق من توقيعك» ─────────────────────────────────────────────── */
{
  let clock = Date.parse("2026-11-14T08:00:00Z");
  const guard = createVerifyAttemptGuard({ now: () => clock });
  const campusIp = "10.20.30.40";
  const wrongTries = (fingerprint: string, n: number, ip = campusIp) => {
    let last: any;
    for (let i = 0; i < n; i++) last = guard.reserve(fingerprint, ip);
    return last;
  };
  wrongTries("fp-A", 10);
  const eleventh = guard.reserve("fp-A", campusIp);
  check("blocked" in eleventh && eleventh.blocked === "target", "٣ عشرُ أخطاءٍ على رقمٍ واحد تحجب ذلك الرقمَ", eleventh);
  const other = guard.reserve("fp-B", campusIp);
  check(!("blocked" in other), "٣ ولا تحجب زميلَه من العنوان نفسه (شبكة الجامعة)");
  if (!("blocked" in other)) other.release();
  const elsewhere = guard.reserve("fp-A", "198.51.100.7");
  check("blocked" in elsewhere && elsewhere.blocked === "target", "٣ والرقمُ المحجوب يبقى محجوباً من أيّ عنوان (التخمينُ موزَّعاً)");
  clock += 11 * 60_000;
  const later = guard.reserve("fp-A", campusIp);
  check(!("blocked" in later), "٣ وبعد النافذة (عشر دقائق) يُرفع الحجب");
  if (!("blocked" in later)) later.release();
  /* النجاحُ يُرجع المحاولة: أستاذٌ يعيد فتحَ توقيعه مراراً لا يُحجب. */
  const win = createVerifyAttemptGuard({ now: () => clock });
  for (let i = 0; i < 30; i++) { const ok = win.reserve("fp-C", campusIp); if ("blocked" in ok) { check(false, "٣ النجاحُ لا يُحجب"); break; } ok.release(); }
  check(!("blocked" in win.reserve("fp-C", campusIp)), "٣ ثلاثون نجاحاً متتالياً لرقمٍ واحد لا تحجبه");
  /* سقفُ العنوان الأوسع: من يمسح أرقاماً كثيرة. */
  const scan = createVerifyAttemptGuard({ now: () => clock });
  let blockedAt = 0;
  for (let i = 1; i <= VERIFY_IP_CEILING + 5; i++) { const r = scan.reserve(`scan-${i}`, "203.0.113.9"); if ("blocked" in r) { blockedAt = i; check(r.blocked === "ip", "٣ والسببُ هو العنوان"); break; } }
  check(blockedAt === VERIFY_IP_CEILING + 1, `٣ من يخمّن ${VERIFY_IP_CEILING + 1} رقماً مختلفاً من عنوانٍ واحد يُحجب العنوانُ`, blockedAt);
  check(VERIFY_IP_CEILING >= 10 * 10, "٣ والسقفُ أوسع بكثير من حدّ الرقم الواحد");
  const people = createVerifyAttemptGuard({ now: () => clock });
  let allowed = 0;
  for (let i = 1; i <= 40; i++) { const r = people.reserve(`teacher-${i}`, "10.0.0.1"); for (let k = 0; k < 2; k++) { const r2 = k ? people.reserve(`teacher-${i}`, "10.0.0.1") : r; if (!("blocked" in r2)) allowed++; } }
  check(allowed === 80, "٣ أربعون أستاذاً يخطئ كلٌّ مرّتين من الشبكة نفسها: لا يُحجب أحد", allowed);
  const route = read("src/server/routes/verifyRoutes.ts");
  check(/verifyAttempts\.reserve\(fingerprint,/.test(route) && !/publicAttemptReserve\("verify-signature"/.test(route) && !/res\.json\([^)]*fingerprint/.test(route),
    "٣ المسار يحجز بالبصمة لا بالعنوان وحده، ولا تعود البصمةُ في جواب");
  check(!/civil/.test((read("src/server/verifyAttempts.ts").match(/target\.reserve\([^)]*\)/) || [""])[0]), "٣ مفتاحُ الحجب لا يحمل الرقمَ المدنيّ");
}

/* ── ٤ اشتراكُ التقويم ─────────────────────────────────────────────────── */
{
  const secret = "s".repeat(64);
  const bound = personCalendarKey(secret, 42, "tok-live");
  const legacy = personCalendarKey(secret, 42);
  check(bound !== legacy && /^p42-[0-9a-f]{32}$/.test(bound), "٤ المفتاحُ المربوط بالرابط غيرُ القديم وبالصيغة نفسها");
  check(instructorFromCalendarKey(secret, `${bound}.ics`, "tok-live") === 42, "٤ مفتاحٌ مربوطٌ ورمزٌ صحيح: يُقبل");
  check(instructorFromCalendarKey(secret, bound, "tok-other") === 0, "٤ ومفتاحُ رابطٍ يُحمل على رمزٍ آخر: يُرفض (تجديدُ الرابط يُبطله)");
  check(instructorFromCalendarKey(secret, bound.replace(/.$/, c => (c === "0" ? "1" : "0")), "tok-live") === 0, "٤ ومفتاحٌ مزوَّر: يُرفض");
  check(instructorFromCalendarKey(secret, bound.replace("p42-", "p43-"), "tok-live") === 0, "٤ ولا يُوجَّه إلى أستاذٍ آخر");
  check(instructorFromCalendarKey(secret, legacy, "tok-live") === 42, "٤ والمفتاحُ القديم على الهواتف يُقبل لأنّ رابطَه حيّ (يتحقّق المسارُ من الرمز)");
  check(instructorFromCalendarKey(secret, legacy, "") === 0 && instructorFromCalendarKey(secret, bound, "") === 0, "٤ رمزٌ فارغ في المسار: لا شيء");
  check(instructorFromCalendarKey(secret, legacy) === 42 && personCalendarKey(secret, 42) === legacy, "٤ الاستعمالُ القديم بلا رمزٍ كما كان");
  check(instructorFromCalendarKey("t".repeat(64), bound, "tok-live") === 0, "٤ وسرٌّ آخر يرفض");
  check(calendarFeedKey(secret, "a", 1) !== calendarFeedKey(secret, "b", 1), "٤ مفتاحُ الرابط القديم (ics/:token/:key) كما هو");
  /* الحياةُ: رابطُه الحيّ، موقوف، لزميله، منتهٍ. */
  const at = Date.parse("2026-11-14T09:00:00Z");
  const terms: any = { 1: { AdTermName: "الأول 2026/2027", AdTermStart: "2026-09-13", AdTermWeeks: 16 } };
  const serves = (link: any, teaches = false) => Boolean(liveCardLinkFor([link], 42, { termOf: id => terms[id], teachesIn: () => teaches, now: at }));
  const mine = { id: "tok-live", kind: "staff", AdInstructorId: 42, AdTermId: 1, expiresAt: "2027-02-01T00:00:00.000Z" };
  check(serves(mine) && serves({ ...mine, kind: "request" }), "٤ رابطُه الشخصي أو رابطُ طلبه الحيّ يخدم التقويم");
  check(!serves({ ...mine, revoked: true }), "٤ رابطٌ أُوقف: لا جدول");
  check(!serves({ ...mine, AdInstructorId: 7 }), "٤ رمزُ زميلٍ في المسار: لا جدول");
  check(!serves({ ...mine, AdInstructorId: 0 }) && serves({ ...mine, AdInstructorId: 0 }, true), "٤ بطاقةُ القسم تخدمه إن كان يدرّس فيه وحده");
  check(!serves({ ...mine, kind: "department" }, true) && !serves({ ...mine, kind: "survey" }, true), "٤ جدولُ القسم والاستبيان لا يفتحان تقويمَ أحد");
  const cal = read("src/server/routes/publicCalendarRoutes.ts");
  check(/instructorFromCalendarKey\(await calendarSecret\(\), String\(req\.params\.key \|\| ""\), token\)/.test(cal) && /await sendInstructorCalendar\(req, res, person, \{ liveCardToken: token \}\)/.test(cal)
    && /holdsLiveCardLink\(options\.liveCardToken/.test(cal) && /const link = token \? await Repository\.getShareLink\(token\) : undefined/.test(cal),
    "٤ المسار: يتحقّق من الرمز بطاقةً حيّةً لهذا الأستاذ وإلا يجيب التقويمَ الفارغ");
  check(/personCalendarKey\(await calendarSecret\(\), instructorId, token\)/.test(read("src/server/core/shareLinks.ts")), "٤ والرابطُ الذي تُسلّمه البطاقةُ مربوطٌ برمزها");
}

/* ── ٥ شعبتان لمقرّرٍ واحد: تنبيهٌ لا منع ──────────────────────────────────── */
{
  const course = { AdCourseId: 100, AdCollegeId: 1, AdSectionId: 5, CourseCode: "ISL201", CourseName: "مقرر تخصص", CourseCredit: 3, CourseHours: 3, MaxStudent: 25, CourseKind: "major" } as unknown as AdCourse;
  const T = 7;
  const teacher = { AdInstructorId: T, AdInstructorCivil: "000000000007", AdInstructorName: "د. 7" } as AdInstructor;
  const row = (patch: Partial<FSchedule>) => ({ id: 1, AdCollegeId: 1, AdSectionId: 5, AdTermId: 1, AdCourseId: 100, SCode: "01", AdInstructorId: T, fstarttime: "08:00", fendtime: "08:50", AdRoomHall: "101", ftuesday: true, fthursday: true, ...patch }) as unknown as FSchedule;
  const mine = row({});
  const other = row({ id: 2, SCode: "02", AdInstructorId: 9, fstarttime: "16:00", fendtime: "16:50", AdRoomHall: "102" });
  const ctx: VerdictContext = {
    instructorId: T, allRows: [mine, other], instructorRowsAfter: [mine], courses: new Map([[100, course]]), instructors: new Map([[T, teacher]]),
    knownRoomKeys: ["101", "102"].map(hall => roomKeyOf(undefined, "أ", hall)), startLadder: ["08:00", "16:00"], roomCollegeId: 1, sectionClashWarns: true,
  };
  const ask: RequestedRow = { rowId: 1, action: "change", AdCourseId: 100, days: ["ftuesday", "fthursday"], start: "16:00" };
  const v = judgeRequest(ask, ctx);
  const soft = v.reasons.find(r => r.code === "section-clash");
  check(Boolean(soft) && soft!.blocking === false && v.sendable && !v.needsExcuse && v.kind === "clear" && headlineReasonOf(v.reasons)?.code !== "section-clash",
    "٥ شعبتان لمقرّر تخصصٍ بالوقت نفسه: تنبيهٌ يُرسَل معه ولا يطلب استثناءً ولا يصير عنوانَ الحكم", v);
  /* الصفحةُ: «same» لا تدخل في أي منعٍ ولا في «جاهز» ولا في الإرسال. */
  const gate = (script.match(/function submit\(\)[\s\S]*?function postSubmit/) || [""])[0] + (script.match(/var blocked=state\.filter[\s\S]*?var ready=/) || [""])[0];
  check(gate.length > 400 && !/\.same\b/.test(gate), "٥ الصفحة: لا يُمنع الإرسالُ ولا يُعدّ «يحتاج تعديلاً» بسبب الشعبة الأخرى", gate.length);
  const uses = [...script.matchAll(/\.same\b/g)].length;
  check(uses >= 3 && /function softHtml\(it\)\{[^}]*it\.same\)h\+='<p class="soft-note" data-k="same"/.test(script), "٥ والتنبيهُ سطرٌ مرئيٌّ قصير فقط (softHtml)", uses);
  check(read("docs/OWNER_FEEDBACK_2026-11-05.md").includes("تنبيهٌ فقط في كل مكان") && read("docs/teacher-card/README-AR.md").includes("2026-11-14"), "٥ القرارُ النهائي مكتوبٌ في ملاحظات المالك وفي دليل الكرت");
}

/* ── ٦ محاضرتك القادمة ────────────────────────────────────────────────── */
const kw = (date: string, time: string) => Date.parse(`${date}T${time}:00+03:00`);
const meeting = (id: number, day: string, start: string, end: string, extra: any = {}) => ({ id, day, start, end, course: "التصميم", section: "02", campus: "main", ...extra });
const term = { start: "2026-09-13", end: "2026-12-31", closed: false };
const baseWeek = {
  meetings: [
    meeting(1, "fsunday", "08:00", "09:15"), meeting(1, "ftuesday", "08:00", "09:15"),
    meeting(2, "fmonday", "09:30", "10:45", { course: "الخط العربي", section: "01" }), meeting(2, "fwednesday", "09:30", "10:45", { course: "الخط العربي", section: "01" }),
  ],
  travel: {}, term,
};
{
  const next = (date: string, time: string, week: any = baseWeek) => logic.tcNextLecture(week, kw(date, time));
  const a = next("2026-11-15", "07:20"); // الأحد
  check(a && a.text === "بعد 40 دقيقة" && a.course === "التصميم" && a.section === "02" && a.off === 0 && a.soon === true && logic.tcNextSub(a) === "التصميم · شعبة 02",
    "٦ الأحد 07:20 والمحاضرة 08:00: «بعد 40 دقيقة · التصميم · شعبة 02»", a);
  check(next("2026-11-15", "07:59") && next("2026-11-15", "07:59").text === "بعد دقيقة واحدة", "٦ وقبلها بدقيقة: «بعد دقيقة واحدة» (اتفاقُ العدد)");
  check(next("2026-11-15", "07:58").text === "بعد دقيقتين", "٦ وبعدها «بعد دقيقتين» (المثنى بعد حرف الجرّ)");
  check(next("2026-11-15", "06:00").text === "بعد ساعتين", "٦ وساعتان: «بعد ساعتين»", next("2026-11-15", "06:00").text);
  check(next("2026-11-15", "05:55").text === "بعد ساعتين و5 دقائق" && next("2026-11-15", "06:59").text === "بعد ساعة واحدة ودقيقة واحدة" && next("2026-11-15", "07:00").text === "بعد ساعة واحدة",
    "٦ وساعةٌ ودقائق بكلماتٍ سليمة", next("2026-11-15", "05:55").text);
  const mid = next("2026-11-15", "08:10");
  check(mid && mid.course === "الخط العربي" && mid.off === 1 && mid.text === "غداً 09:30", "٦ والمحاضرةُ الجارية لا تُعدّ «قادمة»: التاليةُ غداً بساعتها", mid);
  const eve = next("2026-11-15", "18:00");
  check(eve.text === "غداً 09:30" && eve.dayName === "الاثنين", "٦ بعد آخر محاضرةٍ اليوم: «غداً 09:30»", eve);
  const thu = next("2026-11-19", "18:00");
  check(thu.text === "الأحد 08:00" && thu.off === 3, "٦ مساءَ الخميس: الأحدُ أولُ الأسبوع بعد عطلة الجمعة والسبت، باسم اليوم لا «غداً»", thu);
  const fri = next("2026-11-20", "10:00");
  check(fri.text === "الأحد 08:00" && fri.off === 2, "٦ الجمعة: الأحدُ 08:00", fri);
  const sat = next("2026-11-21", "22:00");
  check(sat.text === "غداً 08:00" && sat.off === 1, "٦ السبت: الأحدُ غداً", sat);
  const edge = logic.tcNextLecture(baseWeek, Date.parse("2026-11-15T21:30:00Z")); // 00:30 الاثنين بالكويت
  check(edge && edge.dayName === "الاثنين" && edge.off === 0 && edge.text === "بعد 9 ساعات" , "٦ توقيتُ الكويت لا ساعةُ الجهاز: 21:30 غرينتش هي الاثنين 00:30", edge);
  check(next("2026-09-12", "20:00") === null, "٦ قبل بدء الفصل: لا شيء");
  check(next("2027-01-05", "08:00") === null, "٦ بعد انتهاء الفصل: لا شيء");
  check(next("2026-12-31", "18:00") === null, "٦ آخرُ يومٍ في الفصل بعد آخر محاضرة: لا «غداً» خارج الفصل");
  check(next("2026-12-27", "18:00") && next("2026-12-27", "18:00").text === "غداً 09:30", "٦ وقبله بأيام: يعمل");
  check(next("2026-11-15", "07:20", { ...baseWeek, term: { ...term, closed: true } }) === null, "٦ فصلٌ أُغلق: لا شيء");
  check(next("2026-11-15", "07:20", { ...baseWeek, meetings: [] }) === null && next("2026-11-15", "07:20", null) === null && next("2026-11-15", "07:20", { meetings: baseWeek.meetings }) === null, "٦ بلا جدولٍ أو بلا حدودِ فصل: لا شيء");
  check(next("2026-11-15", "07:20", { ...baseWeek, meetings: [meeting(9, "ffriday", "08:00", "09:00"), meeting(9, "fsaturday", "08:00", "09:00")] }) === null, "٦ لا محاضرةَ في الجمعة والسبت");
  check(a.key !== next("2026-11-16", "07:20").key && a.key === next("2026-11-15", "07:21").key, "٦ مفتاحُ المحاضرة يتغيّر بتغيّرها لا بمرور الدقائق (يُحدَّث العدّادُ في مكانه)");
  check(!/room|hall|building|AdRoom|قاعة|مبنى/i.test(JSON.stringify(a)), "٦ لا قاعةَ ولا مبنى في ناتجها");
  /* البدءُ والانتهاءُ يعتمدان تاريخاً كويتياً صحيحاً: يومُ البدء نفسُه داخل الفصل. */
  check(next("2026-09-13", "07:00") && next("2026-09-13", "07:00").text === "بعد ساعة واحدة", "٦ يومُ بدء الفصل داخله");
}

/* ── ٧ أسبوعي الصحي ──────────────────────────────────────────────────── */
{
  const health = (week: any) => logic.tcWeekHealth(week);
  check(health({ meetings: [], travel: {}, term }) === null && health(null) === null, "٧ بلا جدولٍ رسمي: لا شيء (يختفي)");
  const h = health(baseWeek);
  check(h.attend === 4 && h.of === 5 && h.days.map((d: any) => d.attend ? 1 : 0).join("") === "11110", "٧ أيامُ الحضور: 4 من 5 (الخميسُ بلا)", h.days);
  check(h.busiest.name === "الأحد" && h.busiest.count === 1 && h.busiestDur === "ساعة واحدة و15 دقيقة", "٧ أكثفُ يوم (التعادلُ للأبكر)", h.busiest);
  check(h.gap === null || h.gap.minutes > 0, "٧ يومٌ بمحاضرةٍ واحدة لا فراغَ فيه");
  check(h.sentence === "" && h.kind === "", "٧ ولا جملةَ حين لا يبرز شيء (أسبوعٌ عاديّ بأربعة أيام)", h.sentence);
  /* مضغوط: خمسُ ساعاتٍ بلا فراغ. */
  const packed = health({ meetings: [
    meeting(1, "fsunday", "08:00", "09:15"), meeting(2, "fsunday", "09:15", "10:30"), meeting(3, "fsunday", "10:30", "11:45"), meeting(4, "fsunday", "11:55", "13:10"),
    meeting(5, "ftuesday", "08:00", "09:15"), meeting(6, "fwednesday", "08:00", "09:15"), meeting(7, "fthursday", "08:00", "09:15"),
  ], travel: {}, term });
  check(packed.sentence === "جدولك مضغوط يوم الأحد: 5 ساعات بلا فراغ" && packed.kind === "packed", "٧ «جدولك مضغوط يوم الأحد: 5 ساعات بلا فراغ»", packed.sentence);
  check(packed.busiest.name === "الأحد" && packed.busiest.count === 4 && packed.busiestDur === "5 ساعات", "٧ والأكثفُ هو الأحد بأربع محاضرات", packed.busiest);
  /* فراغ طويل بين محاضرتين. */
  const gap = health({ meetings: [
    meeting(1, "fsunday", "08:00", "09:15"), meeting(2, "fsunday", "13:15", "14:30"),
    meeting(3, "fmonday", "08:00", "09:15"), meeting(4, "ftuesday", "08:00", "09:15"), meeting(5, "fwednesday", "08:00", "09:15"),
  ], travel: {}, term });
  check(gap.gap.minutes === 240 && gap.gap.dur === "4 ساعات" && gap.gap.name === "الأحد" && gap.gap.long === true && gap.gap.pct === 80, "٧ أطولُ فراغ: 4 ساعات يومَ الأحد، شريطٌ بنسبته", gap.gap);
  check(gap.sentence === "يوم الأحد: فراغٌ طويل، 4 ساعات بين محاضرتين" && gap.kind === "gap", "٧ وجملةُ الفراغ الطويل", gap.sentence);
  const dual = health({ meetings: [meeting(1, "fsunday", "08:00", "09:15"), meeting(2, "fsunday", "11:15", "12:30"), meeting(3, "fmonday", "08:00", "09:00"), meeting(4, "ftuesday", "08:00", "09:00"), meeting(5, "fwednesday", "08:00", "09:00")], travel: {}, term });
  check(dual.gap.dur === "ساعتان" && !dual.gap.long, "٧ ساعتان بالمثنى، وليست «طويلة»", dual.gap);
  /* خفيف. */
  const light = health({ meetings: [meeting(1, "fsunday", "08:00", "09:15"), meeting(2, "ftuesday", "08:00", "09:15"), meeting(3, "fwednesday", "10:00", "11:15")], travel: {}, term });
  check(light.attend === 3 && light.sentence === "أسبوعٌ خفيف: تحضر 3 أيام فقط" && light.kind === "light", "٧ ثلاثةُ أيام: «أسبوعٌ خفيف: تحضر 3 أيام فقط»", light.sentence);
  check(health({ meetings: [meeting(1, "fsunday", "08:00", "09:15"), meeting(2, "ftuesday", "08:00", "09:15")], travel: {}, term }).sentence === "أسبوعٌ خفيف: تحضر يومين فقط", "٧ ويومان: «يومين» لا «يومان»");
  /* التنقّل بين الحرمين بسياسة التنقّل، وقاعدةُ الفاصل الواحدة. */
  const policy = defaultTravelPolicy();
  const travel: Record<string, number> = {};
  for (const [key, rule] of Object.entries(policy.pairs)) if (rule.minutes > 0) travel[key] = rule.minutes;
  const jahraMain = (gapMinutes: number) => [
    meeting(1, "fsunday", "08:00", "09:15", { campus: "jahra" }),
    meeting(2, "fsunday", `${String(Math.floor((9 * 60 + 15 + gapMinutes) / 60)).padStart(2, "0")}:${String((9 * 60 + 15 + gapMinutes) % 60).padStart(2, "0")}`, "12:00", { campus: "main" }),
    meeting(3, "fmonday", "08:00", "09:15"), meeting(4, "ftuesday", "08:00", "09:15"), meeting(5, "fwednesday", "08:00", "09:15"),
  ];
  const tight = health({ meetings: jahraMain(20), travel, term });
  check(tight.hops.length === 1 && tight.hops[0].tight === true && tight.hops[0].need === 30 && tight.hops[0].gap === 20 && tight.hops[0].fromLabel === "الجهراء" && tight.hops[0].toLabel === "الرئيسي",
    "٧ الجهراء ← الرئيسي بفاصل 20 دقيقة والسياسةُ 30: ضيّق", tight.hops);
  check(tight.sentence === "يوم الأحد: تنقّلٌ بين الجهراء والرئيسي والفاصلُ أقصر من اللازم" && tight.kind === "travel", "٧ وجملةُ التنقّل الضيّق", tight.sentence);
  const ample = health({ meetings: jahraMain(45), travel, term });
  check(ample.hops.length === 1 && ample.hops[0].tight === false && ample.sentence === "", "٧ وفاصلُ 45 يكفي: يُعرض التنقّلُ بلا تنبيه");
  check(health({ meetings: jahraMain(20), travel: {}, term }).hops.length === 0, "٧ بلا دقائقَ في السياسة (مستثنى أو صفر): لا تنقّلَ ولا دقيقةَ مخترَعة");
  check(health({ meetings: jahraMain(150), travel, term }).hops.length === 0, "٧ وفاصلٌ طويل (150 دقيقة) ليس «متتالياً»");
  const sameCampus = health({ meetings: [meeting(1, "fsunday", "08:00", "09:15"), meeting(2, "fsunday", "09:20", "10:30"), meeting(3, "fmonday", "08:00", "09:00"), meeting(4, "ftuesday", "08:00", "09:00"), meeting(5, "fwednesday", "08:00", "09:00")], travel, term });
  check(sameCampus.hops.length === 0, "٧ المحاضرتان في الحرم نفسه: لا تنقّل");
  /* مطابقةٌ لمحرّك سياسة التنقّل المستعمل في فحص الأساتذة. */
  const campusFor = (id: number) => (id === 2 ? campusOf("كلية الجهراء") : campusOf("كلية التربية الأساسية"));
  for (const gapMinutes of [0, 10, 29, 30, 31, 60]) {
    const week = { meetings: jahraMain(gapMinutes), travel, term };
    const ours = health(week).hops.some((x: any) => x.tight);
    const rows = [{ id: 1, AdCollegeId: 2, fsunday: true, fstarttime: "08:00", fendtime: "09:15" }];
    const theirs = travelShortfalls(policy, 5, campusFor, { collegeId: 1, slots: [{ day: "fsunday", start: week.meetings[1].start, end: "12:00" }] }, rows).length > 0;
    check(ours === theirs, `٧ فاصلُ ${gapMinutes} دقيقة: حكمُ الكرت = حكمُ فحص «موعد» (${ours ? "ضيّق" : "كافٍ"})`, { ours, theirs });
  }
  check(!/room|hall|building|AdRoom|قاعة|مبنى/i.test(JSON.stringify([h, packed, tight])), "٧ لا قاعةَ ولا مبنى في ناتجها");
}

/* ── ٨ حقائقُ الخادم، والرسم، والخطوط ─────────────────────────────────── */
{
  const course = (id: number) => `مقرر ${id}`;
  const rows = [
    { id: 1, AdInstructorId: 5, AdCollegeId: 1, AdCourseId: 10, AdCourseName: "التصميم", SCode: "02", fsunday: true, ftuesday: true, fstarttime: "08:00", fendtime: "09:15", AdRoomCode: "B101", AdRoomHall: "قاعة 12" },
    { id: 2, AdInstructorId: 5, AdCollegeId: 2, AdCourseId: 11, AdCourseName: "", SCode: "01", fmonday: true, fstarttime: "10:00", fendtime: "11:15" },
    { id: 3, AdInstructorId: 9, AdCollegeId: 1, AdCourseId: 12, fsunday: true, fstarttime: "08:00", fendtime: "09:15" },
    { id: -7, AdInstructorId: 5, AdCollegeId: 1, AdCourseId: 13, fwednesday: true, fstarttime: "08:00", fendtime: "09:15" },
  ] as unknown as FSchedule[];
  const names: Record<number, string> = { 1: "كلية التربية الأساسية", 2: "كلية التربية الأساسية - الجهراء" };
  const policy = defaultTravelPolicy();
  const facts = teacherWeekFacts({ rows, instructorId: 5, collegeNameOf: id => names[id] || "", courseNameOf: course, policy, term: { AdTermName: "الأول 2026/2027", AdTermStart: "2026-09-13", AdTermWeeks: 16 } })!;
  check(facts.meetings.length === 3 && facts.meetings.every(m => m.id === 1 || m.id === 2), "٨ ما لزميله وصفوفُ «وضع تجربة» لا تدخل", facts.meetings);
  check(facts.meetings.find(m => m.id === 2)!.course === "مقرر 11" && facts.meetings.find(m => m.id === 2)!.campus === "jahra" && facts.meetings.find(m => m.id === 1)!.campus === "main", "٨ اسمُ المقرر والحرمُ من الكلية");
  check(!/B101|قاعة|AdRoom|Room|Hall/.test(JSON.stringify(facts)), "٨ لا قاعةَ ولا مبنى في حقائق الخادم (الحقلُ لا يُقرأ أصلاً)");
  check(facts.travel["jahra|main"] === 30 && facts.travel["fahaheel|jahra"] === 60, "٨ دقائقُ التنقّل من السياسة نفسها", facts.travel);
  const exempt = teacherWeekFacts({ rows, instructorId: 5, collegeNameOf: id => names[id] || "", courseNameOf: course, policy: { ...policy, exemptInstructorIds: [5] }, term: { AdTermName: "الأول 2026/2027" } })!;
  check(Object.keys(exempt.travel).length === 0, "٨ المستثنى لا تنقّلَ له");
  check(facts.term.start === "2026-09-13" && facts.term.end === "2026-12-31" && facts.term.closed === false, "٨ حدّا الفصل من تقويم التطبيق نفسه", facts.term);
  check(teacherWeekFacts({ rows, instructorId: 5, collegeNameOf: () => "", courseNameOf: course, policy, term: { AdTermName: "فصل بلا اسمٍ معروف" } }) === null, "٨ فصلٌ بلا حدّين: لا شيء");
  check(/week: await teacherWeekOf\(request, term as any\)\.catch\(\(\) => null\)/.test(routes) && /readTravelPolicy\(\)/.test(routes), "٨ الخادم يرسل data.week ويتحمّل فشلها بلا إسقاط الكرت");

  /* الرسم: أدواتُ الصفحة الدنيا ودومٌ مزيّف. */
  const sandbox: any = {
    esc: (v: any) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)),
    gi: () => "", state: [{ rowId: 1 }, { rowId: 2 }], activeTab: "schedule", paint() {}, matchMedia: () => ({ matches: false }),
    document: { addEventListener() {}, getElementById: () => null, visibilityState: "visible" }, setInterval() {}, setTimeout() {},
    data: { week: { meetings: baseWeek.meetings, travel: {}, term } },
  };
  vm.createContext(sandbox);
  vm.runInContext(ARABIC_COUNT_SCRIPT + "\n" + TRAVEL_HINT_SCRIPT + "\n" + TEACHER_CARD_LOGIC_JS + "\n" + TEACHER_CARD_EXTRAS_JS, sandbox);
  const clockAt = (ms: number) => vm.runInContext(`Date.now=function(){return ${ms}}`, sandbox);
  clockAt(kw("2026-11-15", "07:20"));
  const nextHtml: string = sandbox.tcNextHtml();
  const weekHtml: string = sandbox.tcWeekHtml();
  check(/<button type="button" data-tc-next-go="1" class="tc-next"/.test(nextHtml) && nextHtml.includes("بعد 40 دقيقة") && nextHtml.includes("التصميم · شعبة 02") && nextHtml.includes("08:00"),
    "٨ بطاقةُ القادمة زرٌّ يُضغط، بالعدّاد والمقرر والشعبة والساعة", nextHtml.slice(0, 300));
  check(weekHtml.includes("أسبوعي الصحي") && weekHtml.includes("أيام الحضور") && weekHtml.includes("أطول فراغ") && weekHtml.includes("أكثف يوم") && weekHtml.includes(">4<"), "٨ إنفوجرافيك الأسبوع: الحضور والفراغ والأكثف", weekHtml.slice(0, 200));
  check(!/room|hall|building|قاعة|مبنى|مانع|موانع/i.test(nextHtml + weekHtml), "٨ لا قاعةَ ولا مبنى ولا «مانع» في الرسم");
  sandbox.data.week = { meetings: [], travel: {}, term };
  check(sandbox.tcNextHtml() === "" && sandbox.tcWeekHtml() === "", "٨ بلا جدولٍ رسميّ: كلاهما يختفي");
  sandbox.data.week = { meetings: [meeting(77, "fsunday", "08:00", "09:00")], travel: {}, term };
  const orphan: string = sandbox.tcNextHtml();
  check(/<div class="tc-next"/.test(orphan) && !/data-tc-next-go/.test(orphan), "٨ محاضرةٌ لا بندَ لها في الصفحة: بطاقةٌ بلا زرّ (لا قفزةَ إلى لا شيء)");
  check(/tcNextSlot\(\)/.test(script) && /tcWeekHtml\(\)\+\(deckHtml\(\)\|\|calmHtml\(\)\)/.test(script) && /setInterval\(tcNextTick,20000\)/.test(script) && /scrollIntoView/.test(script.slice(script.indexOf("data-tc-next-go"))),
    "٨ الصفحة: البطاقةُ فوق، والأسبوعُ في الجدول، والعدّادُ يتحدّث في مكانه، والضغطُ يمرّر");

  /* الخطوط والأهداف في أنماط هذه الجولة. */
  const css = TEACHER_CARD_R5_CSS.slice(TEACHER_CARD_R5_CSS.indexOf("محاضرتك القادمة"));
  const sizes = [...css.matchAll(/font-size:([\d.]+)px/g)].map(m => Number(m[1]));
  check(sizes.length >= 10 && sizes.every(n => n >= 12), "٨ كلُّ خطٍّ في أنماط الجولة ≥12px", sizes.filter(n => n < 12));
  check(/\.tc-next\{[^}]*min-block-size:64px/.test(css) && /button\.tc-next\{[^}]*min-block-size:64px/.test(css), "٨ وهدفُ اللمس ≥44px");
  check(!/prefers-color-scheme:\s*dark/.test(css), "٨ فاتحٌ دائماً");
}

console.log(`\n${passed} ناجح، ${failed} فاشل`);
if (failed) process.exit(1);
