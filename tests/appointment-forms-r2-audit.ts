/**
 * ── نماذج المواعيد R2 (ملاحظات المالك 2026-10-29) ───────────────────────────────
 *  1. جدول الأستاذ المصغّر كبيراً (نصف الصفحة / شريطٌ سفليّ طويل)، إغلاقٌ سريع، ومفتاحٌ يُتذكَّر.
 *  2. «بديل» ينزل بسلاسة إلى «بدائل آمنة» في النموذج ويضيئها.
 *  3. خانات «هيئة تدريسية» المطابقة تماماً في البحث عن وقت/قاعة: «خذ موعدها» · «بدّل» · «احذفها وخذ مكانها».
 *  4. الإكمال اللائحي في كل مسار، و«طبّق النمط المعتمد» عند التجاوز المتعمَّد؛ ورجوعُ «6 ساعات» الكاذبة.
 *  5. «لاصق بمحاضرتي» في المحرر الكامل.
 *  6. السعة المجهولة «غير محددة» — لا رقمَ مفترضاً.
 * سلوكٌ على الوحدات الخالصة، ثم الربط، ثم سلوكٌ حيّ على خادم تجربة (R2_BASE أو 3000).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { bestRegulationChoice, completeRegulation, regulationFit } from "../src/utils/appointmentRegulation";
import { sectionWeeklyHours, weeklyLectureMinutes } from "../src/utils/scheduleRegulations";
import { appointmentVerdict } from "../src/utils/appointmentVerdict";
import { placeholderMatch } from "../src/utils/placeholderMatch";
import { lectureStickOptions, teacherLectures, toClock } from "../src/utils/teacherMiniWeek";
import { readServerSource } from "./helpers/serverSource.mjs";
import { waitForDemoSeed } from "./helpers/demoSeed";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 600)); }
};
const read = (file: string) => fs.readFileSync(file, "utf8");
const days = (list: string[]) => Object.fromEntries(["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"].map(day => [day, list.includes(day)]));
const theory3 = { CourseHours: 3, CourseTeachingMode: "theoretical" };

/* ── 4أ: «6 ساعات تقريباً» لموعدٍ واحد بنمطٍ اقترحه النموذج (لقطة المالك 11.png) ── */
{
  const block = { ...days(["fwednesday"]), fstarttime: "08:00", fendtime: "10:50", SCode: "501" };
  const alone = sectionWeeklyHours(block, [], 3);
  check(alone.total === 150 && !alone.over, "H1 شعبة جديدة · أربعاء 170د لمقرر 3 ساعات = 150 دقيقة معتمدة — لا «تجاوز الساعات»", alone);
  check(weeklyLectureMinutes(block) <= 165, "H2 حتى بلا ساعات المقرر لا تتجاوز الكتلة الحدّ (165)");
  const twin = sectionWeeklyHours(block, [{ ...block }], 3);
  check(twin.total === 150 && !twin.over && twin.others.length === 0, "H3 نسخةٌ مطابقة للموعد نفسه (سجلٌّ مكرّر) لا تضاعف المجموع إلى «6 ساعات»", twin);
  const real = sectionWeeklyHours(block, [{ ...days(["fsunday", "ftuesday", "fthursday"]), fstarttime: "08:00", fendtime: "08:50" }], 3);
  check(real.over && real.others.length === 1, "H4 موعدٌ آخر حقيقي للشعبة نفسها يبقى مانعاً — ويُسمّى في التنبيه", real);
  const rules = readServerSource();
  check(/sectionWeeklyHours\(row,siblings,hours\)/.test(rules) && /حُسب معه للشعبة/.test(rules), "H5 الحفظ والفحص والمقترح من مصدرٍ واحد (sectionWeeklyHours) ويسمّي ما حُسب");
  check(/sectionWeeklyHours\(row, siblings, hours\)/.test(read("src/server/studyProposalEngine.ts")), "H6 المقترح الدراسي بالمصدر نفسه (الكتلة بنمط ساعات المقرر)");
  /* الشبح لا يحمرّ لمانعٍ لا يخص أسبوع الأستاذ. */
  const verdict = appointmentVerdict({
    form: { AdCourseId: 122, AdInstructorId: 7, ...block } as any,
    validationIssues: ["ساعات هذا المقرر المعتمدة 3 ساعات أسبوعيًا، والمجموع بعد هذا الموعد يزيدها (6 ساعات تقريبًا). لا يُحفظ ما يزيد على الساعات المعتمدة"],
    conflicts: [],
  });
  const mini = read("src/components/TeacherMiniWeek.tsx");
  const ghost = verdict.checks.filter(item => (item.kind === "teacher" || item.kind === "time") && item.state === "block");
  check(verdict.blockers.length === 1 && ghost.length === 0, "H7 مانع ساعات الشعبة لا يقع في بطاقتي الأستاذ والوقت");
  check(/export function ghostBlockers/.test(mini) && /const blockers = ghostBlockers\(verdict\)/.test(mini) && /check\.kind === "teacher" \|\| check\.kind === "time"/.test(mini),
    "H8 الشبح أحمر بـ✕ لتعارض الأستاذ/الوقت وحده — لا كتلة حمراء والأستاذ «سليم»");
}

/* ── 4ب: الإكمال اللائحي في كل مسار، والتجاوز المتعمَّد وحده يُظهر التنبيه ── */
{
  const seeded = completeRegulation(theory3, ["fsunday"], "08:00", { fresh: true });
  check(seeded?.days.join("+") === "fsunday+ftuesday+fthursday" && seeded.end === "08:50", "R1 خانة مرسومة (أحد) ثم المقرر بعدها → أحد·ثلاثاء·خميس 08:00–08:50", seeded);
  const blockKept = completeRegulation(theory3, ["fwednesday"], "08:00");
  check(blockKept?.days.join("+") === "fwednesday" && blockKept.end === "10:50", "R2 «أربعاء · 170د» نمطٌ معتمد يبقى كما هو", blockKept);
  const sttDrift = completeRegulation(theory3, ["fsunday", "ftuesday", "fthursday"], "08:00");
  check(sttDrift?.end === "08:50", "R3 أحد·ثلاثاء·خميس × 80د (المسار القديم «5 ساعات») يُكمَل إلى 50د", sttDrift);
  check(completeRegulation({}, ["fsunday"], "08:00") === null && completeRegulation(theory3, [], "08:00") === null, "R4 بلا ساعات أو بلا أيام: لا نمط يُخترع");
  check(bestRegulationChoice(theory3, ["fsunday", "ftuesday"])?.days.join("+") === "fsunday+ftuesday+fthursday", "R5 «طبّق النمط المعتمد» على أيامٍ خارج النمط → الأنسب الذي يضم أول يوم");
  check(regulationFit(theory3, ["fsunday", "ftuesday", "fthursday"], "08:00", "09:20") === "off", "R6 المدة بيد المستخدم خارج النمط = «خارج اللائحة»");
  const editor = read("src/components/Schedules.tsx"), quick = read("src/components/QuickCreatePopover.tsx");
  check(/completeRegulation\(formCourse, formDays, String\(form\.fstarttime \|\| ""\), \{ fresh: daysSeeded\.current \}\)/.test(editor)
    && /\[editor, timingOverride, formCourse, formDays\.join\("\+"\), form\.fstarttime\]/.test(editor), "R7 المحرر الكامل: أي تغيّر في المقرر/الأيام/البداية يكمل النمط ونهايته");
  check(/daysSeeded\.current = Boolean\(seed\?\.day && !seed\?\.days\?\.length\)/.test(editor), "R8 يوم الخانة المرسومة يُكمل حين يُعرف المقرر (السبب الجذري)");
  check(/timingOpenedKey\.current = timingKeyOf\(values\)/.test(editor) && /key === timingOpenedKey\.current\) return/.test(editor), "R9 «تعديل» لا يغيّر الموعد المحفوظ عند فتحه");
  check(/const lengthChanged = mins\(next\.end\) - mins\(next\.start\) !== spanBefore/.test(editor) && /setTimingOverride\(regulationHours\(formCourse\) > 0 && regulationFit\(/.test(editor),
    "R10 عجلة الوقت: الساعة تعيد النهاية إلى النمط، و«المدة» أو النهاية باليد تجاوزٌ متعمَّد");
  check(/const lengthChanged = minutesOf\(next\.end\) - minutesOf\(next\.start\) !== minutesOf\(draft\.end\) - minutesOf\(draft\.start\)/.test(quick)
    && !/onChange=\{\(next\) => \{ timeEdited\.current = true;/.test(quick), "R11 «موعد جديد» السريع: تحريك الساعة لم يعد يُطفئ الإكمال اللائحي");
  check(/onApplyBest=\{patternOverridden \? applyApprovedPattern : undefined\}/.test(editor) && /onApplyPattern=\{patternOverridden \? applyApprovedPattern : undefined\}/.test(editor)
    && /onApplyBest=\{!daysLocked && regulationHours\(selectedCourse\) > 0 && fit === "off" \? applyBest : undefined\}/.test(quick), "R12 «طبّق النمط المعتمد» بضغطة: الشرائح ولوحة الفحص والبطاقة السريعة");
  check(/طبّق النمط المعتمد/.test(read("src/components/RegulationPatternChips.tsx")) && /isPatternDetail\(detail\.text\)/.test(read("src/components/AppointmentChecksPanel.tsx")), "R13 الزرّ يظهر بجانب «خارج اللائحة» وبند الساعات");
}

/* ── 3: «هيئة تدريسية» مطابقة تماماً ── */
{
  const course = { ...theory3, MaxStudent: 40, CourseRoomType: "قاعة تدريس" };
  const slot = { ...days(["fsunday", "ftuesday", "fthursday"]), fstarttime: "10:00", fendtime: "10:50" };
  const room = { roomType: "قاعة تدريس", capacity: 45 };
  const ok = placeholderMatch({ course, row: slot, room, wanted: { days: ["fsunday", "ftuesday", "fthursday"], minutes: 50 } });
  check(ok.ok && ok.capacity === "ok" && ok.pattern === "أحد·ثلاثاء·خميس · 50د", "P1 تطابق تام: النمط والأيام والمدة والسعة والمرفق", ok);
  check(placeholderMatch({ course, row: { ...slot, fendtime: "11:20" }, room }).why === "pattern", "P2 مدةٌ خارج نمط ساعات المقرر → لا تُعرض");
  check(placeholderMatch({ course, row: slot, room: { ...room, capacity: 30 } }).why === "capacity", "P3 سعة القاعة أقل من سعة المقرر → لا تُعرض");
  const unknown = placeholderMatch({ course, row: slot, room: { roomType: "قاعة تدريس" } });
  check(unknown.ok && unknown.capacity === "unknown", "P4 السعة مجهولة → تُعرض و«غير محددة»، بلا رقمٍ مفترض", unknown);
  check(placeholderMatch({ course, row: slot, room: { roomType: "مختبر", capacity: 45 } }).why === "facility", "P5 نوع القاعة يخالف متطلب المقرر → لا تُعرض");
  check(placeholderMatch({ course: { ...course, CourseCompanionRoomType: "استوديو" }, row: slot, room }).why === "companion", "P6 مقررٌ يتطلب مرفقاً والشعبة بلا مرفق → لا تُعرض");
  check(placeholderMatch({ course, row: slot, room, teacherBusy: () => true }).why === "teacher", "P7 الأستاذ مشغول في خانتها → لا تُعرض");
  check(placeholderMatch({ course, row: slot, room, wanted: { days: ["fmonday", "fwednesday"] } }).why === "days", "P8 أيامٌ غير أيام البحث → لا تُعرض");
  check(placeholderMatch({ course, row: slot, room, wanted: { start: 9 * 60, end: 9 * 60 + 50 } }).why === "time", "P9 «اقترح قاعة»: الوقت نفسه بالضبط فقط");
  const server = readServerSource();
  const route = server.slice(server.indexOf('app.post("/api/schedules/suggest-slots"'), server.indexOf('app.post("/api/schedules/placeholder-action"'));
  check(/placeholderMatch\(\{/.test(route) && !/const teacherFree=roomOnly&&/.test(route) && /wanted:roomOnly\?\{days:dayKeys as any,start:fixedStart,end:fixedEnd\}:\{days:dayKeys as any,minutes:duration\}/.test(route),
    "P10 الخادم: في «اقترح قاعة» و«اقترح وقتاً وقاعة» معاً، بالحكم الخالص الواحد");
  const ph = server.slice(server.indexOf('app.post("/api/schedules/placeholder-action"'), server.indexOf("/* ── الأسبوعُ كما سيصير"));
  check(/createBody\.fstarttime = placeholder\.fstarttime; createBody\.fendtime = placeholder\.fendtime;/.test(ph), "P11 «بدّل/احذفها وخذ مكانها» يأخذ خانتها كما هي (أيامها ووقتها)");
  const cards = read("src/components/RoomSuggestionCards.tsx"), editor = read("src/components/Schedules.tsx"), quick = read("src/components/QuickCreatePopover.tsx");
  check(/<span>خذ موعدها<\/span>/.test(cards) && /<span>بدّل<\/span>/.test(cards) && /<span>احذفها وخذ مكانها<\/span>/.test(cards) && /room-replaceable-badge">هيئة تدريسية/.test(cards),
    "P12 معلَّمة بوضوح، والأفعال الثلاثة بأسماء المالك");
  check(/replaceable=\{slotReplaceable\}/.test(editor) && /replaceable=\{editor === "create" && Number\(form\.AdInstructorId \|\| 0\) \? alternatives\.replaceable : \[\]\}/.test(editor)
    && /onReplaceable\(section, action, payload\)/.test(quick) && (quick.match(/onReplaceable=\{placeholderPick\}/g) || []).length === 2, "P13 في «وقت وقاعة» و«بدائل آمنة» والبطاقة السريعة، لا «اقترح قاعة» وحده");
  check(/source\?: \{ appointment: Partial<FSchedule>; done: \(\) => void \}/.test(editor) && /offerUndo\(/.test(editor), "P14 طلبٌ واحد محروس بتراجع، من المحرر ومن البطاقة السريعة");
}

/* ── 5: «لاصق بمحاضرتي» ── */
{
  const row = (id: number, list: string[], start: string, end: string, extra: any = {}) => ({ id, AdTermId: 1, AdCollegeId: 1, AdSectionId: 1, AdCourseId: 10 + id, SCode: "501", AdInstructorId: 7,
    ...days(list), fstarttime: start, fendtime: end, buildingId: "b1", roomId: "r1", AdRoomCode: "F", AdRoomHall: "10", ...extra }) as any;
  const rows = [row(1, ["fsunday", "ftuesday", "fthursday"], "10:00", "10:50"), row(2, ["fmonday", "fwednesday"], "09:30", "10:50", { roomId: "r2", AdRoomHall: "12" })];
  const lectures = teacherLectures(rows, 7, 1, 0, 1);
  const options = lectureStickOptions(lectures, rows, theory3, { start: 8 * 60, end: 20 * 60 });
  const after = options.find(item => item.lecture.id === 1 && item.side === "after");
  const before = options.find(item => item.lecture.id === 1 && item.side === "before");
  check(options.length === 3 && options.filter(item => item.lecture.id === 1).length === 2 && !options.some(item => item.key === "2:before"), "S1 محاضرةٌ واحدة (لا يوماً يوماً): «قبلها» و«بعدها» — ولا خيار قبل الثامنة", options.map(item => item.key));
  check(after && toClock(after.spot.start) === "11:00" && after.spot.days.join("+") === "fsunday+ftuesday+fthursday", "S2 «بعدها» = النهاية + فاصل 10د، في أيامها نفسها", after?.spot);
  check(before && toClock(before.spot.start) === "09:00" && toClock(before.spot.end) === "09:50", "S3 «قبلها» = البداية − الفاصل − مدة النمط", before?.spot);
  check(after?.room?.roomId === "r1", "S4 تلميح القاعة للإدارة: قاعة المحاضرة إن خلت");
  check(options[0].spot.days[0] === "fsunday" && options.at(-1)!.spot.days[0] === "fmonday", "S5 مرتبةٌ بالأسبوع");
  const editor = read("src/components/Schedules.tsx"), chips = read("src/components/LectureStickChips.tsx");
  check(/<LectureStickChips[\s\S]{0,600}onPick=\{pickFromMiniWeek\}/.test(editor) && /excludeId=\{editor === "edit" \? Number\(editId \|\| 0\) : 0\}/.test(editor), "S6 في «جديد» و«تعديل»، وضغطةٌ تملأ اليوم والوقت (والقاعة إن لم تُختر)");
  check(/lectureStickOptions\(/.test(chips) && /lecture-stick-room/.test(chips) && /useWiderWeek\(/.test(chips), "S7 الشرائح من المعادلة الواحدة، بتلميح القاعة، وأسبوع الأستاذ كاملاً");
}

/* ── 1 و2: جدول الأستاذ كبيراً، والبدائل داخل النموذج ── */
{
  const mini = read("src/components/TeacherMiniWeek.tsx"), editor = read("src/components/Schedules.tsx"), quick = read("src/components/QuickCreatePopover.tsx");
  const css = read("src/styles/36-appointment-forms.css");
  check(/\.schedule-editor-grid:has\(>\.editor-side>\.mini-week\.is-side\.is-open:not\(\.is-sheet\)\)\{grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)\}/.test(css),
    "L1 سطح المكتب: جدول الأستاذ المفتوح نصف الصفحة");
  check(/side: \[380, 640\]/.test(mini) && /sheet: \[300, 560\]/.test(mini) && /\.mini-week\.is-sheet\.is-open\{max-height:min\(88dvh,780px\)\}/.test(css), "L2 مسارٌ كبير يتّسع بالنافذة، وشريطٌ سفليّ طويل على الهاتف");
  check(/className="mini-week-close"/.test(mini) && /event\.key !== "Escape"/.test(mini) && /stopImmediatePropagation/.test(mini) && /dy > 24\) setOpen\(false\)/.test(mini), "L3 إغلاقٌ سريع: ✕ وEsc والسحب لأسفل");
  check(/export function useMiniWeekEnabled/.test(mini) && /teacher-mini-week:enabled:\$\{userId\}/.test(mini) && /role="switch"/.test(mini)
    && /miniWeekEnabled && Number\(form\.AdInstructorId/.test(editor) && /miniWeek && miniWeekEnabled && miniTeacherId/.test(quick), "L4 مفتاح إظهار/إخفاء يُتذكَّر لكل مستخدم على الجهاز، في النموذجين");
  check(/Math\.min\(560, Math\.max\(roomBefore, roomAfter\)\)/.test(quick), "L5 البطاقة الجانبية للموعد السريع أوسع (حتى 560px)");
  check(/onAlternative=\{\(\) => goToAlternatives\(\)\}/.test(editor) && /node\.scrollIntoView\(\{ behavior: reduce \? "auto" : "smooth", block: "center" \}\)/.test(editor)
    && /node\.focus\(\{ preventScroll: true \}\)/.test(editor) && /id="appointment-alternatives"/.test(editor) && /\.appointment-alternatives\.is-flash\{animation/.test(css),
    "A1 «بديل» ينزل بسلاسة إلى «بدائل آمنة» في النموذج، ويركّز عليها ويضيئها");
  check(!/<AppointmentChecksPanel[\s\S]{0,2400}label="بدائل آمنة" \/>/.test(editor), "A2 البدائل لم تعد مدفونة داخل لوحة الفحص");
  const block = css.slice(css.indexOf("/* ── R2 (ملاحظات المالك 2026-10-29)"));
  check(block.length > 3000 && !/#[0-9a-fA-F]{3,8}\b/.test(block), "L6 ألوانٌ من رموز التصميم وحدها (الوضع الداكن)");
}

/* ── 6: السعة المجهولة ── */
{
  const files = ["src/components/Schedules.tsx", "src/components/QuickCreatePopover.tsx", "src/components/LocationPicker.tsx", "src/components/RoomSuggestionCards.tsx",
    "src/components/TeacherMiniWeek.tsx", "src/components/LectureStickChips.tsx", "src/utils/placeholderMatch.ts", "src/utils/roomSuitability.ts", "src/utils/requestRoomRanking.ts"];
  const assumed = files.filter(file => /(capacity|MaxStudent|seats|seatsNeeded)\)?\s*(\|\||\?\?)\s*[1-9]\d*\b/.test(read(file)));
  check(!assumed.length, "C1 لا سعة افتراضية في واجهات المواعيد ولا في فحوصها", assumed);
  const cards = read("src/components/RoomSuggestionCards.tsx");
  check(/سعة القاعة غير مسجلة"\)\) fact = \{ text: "السعة غير محددة"/.test(cards) && /item\.capacity === "unknown"/.test(cards), "C2 «السعة غير محددة» بدل رقمٍ مفترض");
}

/* ── سلوكٌ حيّ ── */
const BASE = process.env.R2_BASE || "http://localhost:3000";
const up = async () => { try { return (await fetch(BASE + "/api/public/me/state")).ok; } catch { return false; } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "appointment-r2-"));
let child: ReturnType<typeof spawn> | null = null;
try {
  if (!process.env.R2_BASE && await up()) {
    console.log("   (تخطّي السلوك الحيّ: المنفذ مشغول بخادمٍ آخر)");
  } else {
    if (!process.env.R2_BASE) {
      child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", SCHEDULE_PRIVATE_DIR: dir }, stdio: "ignore", detached: true });
      let ready = false;
      for (let i = 0; i < 120 && !ready; i += 1) { ready = await up(); if (!ready) await new Promise(r => setTimeout(r, 1000)); }
      if (!ready) throw new Error("الخادم لم يبدأ");
    }
    const login = await fetch(BASE + "/api/auth/demo", { method: "POST" });
    const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
    await waitForDemoSeed(BASE, cookie);
    const call = async (method: string, url: string, body?: unknown) => {
      const response = await fetch(BASE + url, { method, headers: { cookie, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: await response.json().catch(() => null) as any };
    };
    const scope = { AdCollegeId: 1, AdSectionId: 1, AdTermId: 1 };
    const board = async () => (await call("GET", "/api/schedules?collegeId=1&sectionId=1&termId=1")).body as any[];
    const courses = (await call("GET", "/api/courses?collegeId=1&sectionId=1")).body as any[];
    const people = (await call("GET", "/api/instructors?collegeId=1&sectionId=1&termId=1")).body as any[];
    const rows0 = await board();
    const three = courses.filter(c => Number(c.CourseHours || c.CourseCredit) === 3 && !String(c.CourseCompanionRoomType || "").trim());
    const fresh = three.find(c => !rows0.some(row => Number(row.AdCourseId) === Number(c.AdCourseId))) || three[0];

    /* لقطة المالك: شعبة جديدة · أربعاء 08:00–10:50 لمقرر 3 ساعات → لا مانع ساعات. */
    const wed = await call("POST", "/api/schedules/check-conflicts", { ...scope, AdCourseId: fresh?.AdCourseId, SCode: "577", AdInstructorId: 1, ...days(["fwednesday"]), fstarttime: "08:00", fendtime: "10:50", excludeId: 0 });
    check(wed.status === 200 && !(wed.body?.validationIssues || []).some((text: string) => /الساعات المعتمدة/.test(text)), "V1 حيّ: «أربعاء · 170د» لشعبةٍ جديدة بلا «تجاوز الساعات»", wed.body);

    /* خانة «هيئة تدريسية» مطابقة تماماً في «اقترح وقتاً وقاعة» و«اقترح قاعة». */
    const placeholder = people.find(person => String(person.AdInstructorName || "").startsWith("هيئة"));
    const sth = days(["fsunday", "ftuesday", "fthursday"]);
    const time = { fstarttime: "18:00", fendtime: "18:50" };
    const busyAt = (personId: number, rows: any[]) => rows.some(row => Number(row.AdInstructorId) === personId && (row.fsunday || row.ftuesday || row.fthursday) && row.fstarttime < "18:50" && row.fendtime > "18:00");
    const teacher = people.find(person => !String(person.AdInstructorName || "").startsWith("هيئة") && !busyAt(Number(person.AdInstructorId), rows0));
    const free = await call("POST", "/api/schedules/suggest-slots", { ...scope, ...sth, ...time, AdCourseId: fresh?.AdCourseId, roomOnly: true });
    const room = (free.body?.slots || [])[0];
    check(Boolean(placeholder && teacher && room && fresh), "V2 بيانات التجربة: «هيئة تدريسية» وأستاذ حرّ وقاعة حرّة", { placeholder: Boolean(placeholder), teacher: Boolean(teacher), room, fresh: fresh?.AdCourseId });
    if (placeholder && teacher && room && fresh) {
      const made = (await call("POST", "/api/schedules", { ...scope, ...sth, ...time, AdCourseId: fresh.AdCourseId, SCode: "991", AdInstructorId: placeholder.AdInstructorId,
        buildingId: room.buildingId, roomId: room.roomId, AdRoomCode: room.room, AdRoomHall: room.hall, locationStatus: "VERIFIED" })).body;
      check(Number(made?.id) > 0, "V3 أُنشئت شعبة «هيئة تدريسية» (أحد·ثلاثاء·خميس 18:00–18:50)", made);
      const slotAsk = await call("POST", "/api/schedules/suggest-slots", { ...scope, ...sth, AdCourseId: fresh.AdCourseId, SCode: "992", AdInstructorId: teacher.AdInstructorId, durationMinutes: 50 });
      const listed = (slotAsk.body?.replaceable || []).find((item: any) => Number(item.rowId) === Number(made?.id));
      check(Boolean(listed) && listed.sameCourse && listed.pattern && listed.days?.join("+") === "fsunday+ftuesday+fthursday", "V4 «اقترح لي وقتاً وقاعة» يعرضها مطابقةً تماماً (المقرر نفسه ← «خذ موعدها»)", slotAsk.body?.replaceable);
      const roomAsk = await call("POST", "/api/schedules/suggest-slots", { ...scope, ...sth, ...time, AdCourseId: fresh.AdCourseId, SCode: "992", AdInstructorId: teacher.AdInstructorId, roomOnly: true });
      check((roomAsk.body?.replaceable || []).some((item: any) => Number(item.rowId) === Number(made?.id)), "V5 «اقترح قاعة» في الوقت نفسه يعرضها أيضاً");
      const wrong = await call("POST", "/api/schedules/suggest-slots", { ...scope, ...days(["fmonday", "fwednesday"]), AdCourseId: fresh.AdCourseId, SCode: "992", AdInstructorId: teacher.AdInstructorId, durationMinutes: 80 });
      check(!(wrong.body?.replaceable || []).some((item: any) => Number(item.rowId) === Number(made?.id)), "V6 أيامٌ أخرى (اثنين·أربعاء) → لا تُعرض: التطابق تام أو لا شيء");
      /* «احذفها وخذ مكانها» من «وقت وقاعة»: الموعد يأخذ خانتها حتى لو كان وقت النموذج غيره. */
      const replace = await call("POST", "/api/schedules/placeholder-action", { action: "replace", placeholderId: made.id, placeholderRev: made.rev,
        appointment: { ...scope, ...sth, fstarttime: "09:00", fendtime: "09:50", AdCourseId: fresh.AdCourseId, SCode: "992", AdInstructorId: teacher.AdInstructorId } });
      const after = await board();
      const created = after.find(row => Number(row.id) === Number(replace.body?.createdId));
      check(replace.status === 200 && created?.fstarttime === "18:00" && created?.fendtime === "18:50" && String(created?.roomId) === String(room.roomId) && !after.some(row => Number(row.id) === Number(made.id)),
        "V7 «احذفها وخذ مكانها»: حُذفت ووُضع الموعد في خانتها (الوقت والقاعة) معاً", replace.body);
      for (const step of replace.body?.undo || []) await call(step.method, step.url, step.body);
      const restored = await board();
      check(!restored.some(row => Number(row.id) === Number(replace.body?.createdId)) && restored.some(row => row.SCode === "991" && Number(row.AdInstructorId) === Number(placeholder.AdInstructorId)), "V8 التراجع يعيد الشعبة ويزيل الموعد");
    }
  }
} catch (error) {
  check(false, "تعذّر تشغيل السلوك الحيّ", String(error));
} finally {
  if (child?.pid) { try { process.kill(-child.pid); } catch { /* already gone */ } }
}

console.log(`\nappointment-forms-r2 audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
