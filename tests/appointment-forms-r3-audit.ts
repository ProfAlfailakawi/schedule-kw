/**
 * ── نماذج المواعيد R3 (ملاحظات المالك 2026-10-29) ───────────────────────────────
 *  1. «إذا حطيت وقت والمقرر ٣ ساعات المفروض تلقائي … ما زال ما ضبط»: ما إن يُعرف المقرر
 *     ومعه يومٌ أو بداية تكتمل الأيام والنهاية بالنمط المعتمد — في كل مسار — ويُرى ذلك.
 *  2. «لاصق بمحاضرتي» مطويٌّ افتراضياً برأسٍ مضغوط وعددٍ، يُفتح عند الطلب ويُتذكَّر.
 *
 * أولاً سلوكُ الوحدات الخالصة بتسلسل المستخدم نفسه (السبب الجذري لكل مسارٍ كان معطوباً)،
 * ثم الربط في النماذج، ثم مرورٌ حقيقي في المتصفح حين يتوفر Playwright
 * (APPOINTMENT_BROWSER_MODULE + خادم تجربة R3_BASE).
 */
import fs from "node:fs";
import { completeRegulation, pickDay, regulationHours, usualRegulationChoice } from "../src/utils/appointmentRegulation";
import { driveAppointmentForms } from "./helpers/appointmentFormsBrowser";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 600)); }
};
const read = (file: string) => fs.readFileSync(file, "utf8");
const theory3 = { CourseHours: 3, CourseTeachingMode: "theoretical" };
const lab3 = { CourseHours: 3, CourseTeachingMode: "practical" };
const shape = (value: { days: string[]; end: string } | null) => value ? `${value.days.join("+")} ${value.end}` : "null";

/* ── أ. المسارات كما يسلكها المستخدم ── */
{
  /* يومٌ قبل المقرر: كان يبقى «أحد · 170د» لأن يوماً واحداً صادف نمط الكتلة. */
  const early = pickDay(undefined, [], "fsunday", true);
  check(early.days.join("+") === "fsunday" && !early.applied, "A1 يومٌ يُضغط بلا مقرر: يبقى اليوم وحده (لا نمط يُعرف بعد)", early);
  const seeded = !regulationHours(undefined);
  const before = completeRegulation(theory3, early.days, "08:00");
  check(shape(before) === "fsunday 10:50", "A2 السبب الجذري: إكمالٌ يعدّ ذلك اليوم اختياراً ← «أحد · 170د» بدل أيام النمط", before);
  const after = completeRegulation(theory3, early.days, "08:00", { fresh: seeded });
  check(seeded && shape(after) === "fsunday+ftuesday+fthursday 08:50", "A3 الآن: يومٌ قبل المقرر يُكمل نمط يومه حين يُعرف المقرر → أحد·ثلاثاء·خميس 08:00–08:50", after);
  const wed = completeRegulation(theory3, ["fwednesday"], "10:00", { fresh: true });
  check(shape(wed) === "fmonday+fwednesday 11:20", "A4 الأربعاء قبل المقرر → اثنين·أربعاء 10:00–11:20 (والكتلة شريحةٌ بديلة)", wed);
  const monday = completeRegulation(theory3, ["fmonday"], "08:00", { fresh: true });
  check(shape(monday) === "fmonday+fwednesday 09:20", "A5 الاثنين قبل المقرر → اثنين·أربعاء 80د", monday);

  /* المقرر والبداية بلا يوم: كان لا يحدث شيء. */
  check(completeRegulation(theory3, [], "08:00") === null, "A6 بلا يوم ولا نمطٍ معتاد يُمرَّر: لا نمط يُخترع (كما في R4)");
  const usual = usualRegulationChoice(theory3);
  check(usual?.days.join("+") === "fsunday+ftuesday+fthursday" && usual.minutes === 50, "A7 النمط المعتاد لمقررٍ نظري بلا عادةٍ مرصودة: أحد·ثلاثاء·خميس 50د", usual);
  check(shape(completeRegulation(theory3, [], "08:00", { usual })) === "fsunday+ftuesday+fthursday 08:50", "A8 المقرر + البداية وحدهما → الأيام والنهاية تكتملان");
  check(completeRegulation(theory3, [], "", { usual }) === null, "A9 المقرر وحده (بلا بداية ولا يوم) لا يختار أياماً");
  const habit = usualRegulationChoice(theory3, [{ days: ["fsunday", "ftuesday"], count: 9 }, { days: ["fmonday", "fwednesday"], count: 2 }, { days: ["fmonday", "fwednesday"] }]);
  check(habit?.days.join("+") === "fmonday+fwednesday" && habit.minutes === 80, "A10 عادة القسم تُقدَّم إن كانت نمطاً معتمداً، وتُهمل عادةٌ خارج اللائحة (أحد·ثلاثاء لثلاث ساعات)", habit);
  const lab = usualRegulationChoice(lab3);
  check(lab?.days.length === 1 && lab.minutes === 170, "A11 مقررٌ عملي بلا عادة: كتلةٌ واحدة 170د", lab);
  check(usualRegulationChoice({}) === null && completeRegulation({}, [], "08:00", { usual: usualRegulationChoice({}) }) === null, "A12 مقررٌ بلا ساعات: لا شيء يُكمل");
  check(shape(completeRegulation(theory3, ["fsunday", "ftuesday", "fthursday"], "13:00")) === "fsunday+ftuesday+fthursday 13:50", "A13 «تعديل»: بدايةٌ جديدة لموعدٍ بنمطه تحسب النهاية");
}

/* ── ب. الربط في النماذج ── */
const editor = read("src/components/Schedules.tsx");
const quick = read("src/components/QuickCreatePopover.tsx");
const chips = read("src/components/RegulationPatternChips.tsx");
const stick = read("src/components/LectureStickChips.tsx");
const css = read("src/styles/36-appointment-forms.css");
{
  check(/daysSeeded\.current = !regulationHours\(formCourse\);/.test(editor), "W1 المحرر الكامل: يومٌ قبل المقرر ليس قرار نمط (يُكمل حين يُعرف المقرر)");
  check(/const usual = formDays\.length \|\| !form\.fstarttime \|\| usualDismissed\.current === /.test(editor) && /\? null : usualRegulationChoice\(formCourse, usualDaysFor\(Number\(form\.AdCourseId\) \|\| 0\)\);/.test(editor)
    && /completeRegulation\(formCourse, formDays, String\(form\.fstarttime \|\| ""\), \{ fresh: daysSeeded\.current, usual \}\)/.test(editor),
    "W2 المحرر الكامل: المقرر + البداية بلا يوم → النمط المعتاد (عادة القسم ثم طبيعة المقرر)");
  check(/usualDismissed\.current = result\.days\.length \? "" : /.test(editor), "W2b من أفرغ الأيام بيده لا تُعاد عليه حتى يتغيّر المقرر أو البداية");
  check(/nature\.get\(courseId\)\?\.dayPatterns/.test(editor) && /rows\.filter\(row => Number\(row\.AdCourseId\) === courseId && Number\(row\.id\) !== Number\(editId \|\| 0\)\)/.test(editor),
    "W3 عادة القسم: الأنماط المرصودة للمقرر وشعبه القائمة (لا الموعد المعدَّل نفسه)");
  check(/const spanBefore = Math\.max\(30, mins\(shownEnd\) - mins\(shownStart\)\);/.test(editor) && /const shownStart = form\.fstarttime \|\| SCHEDULE_DAY_START_TIME;/.test(editor),
    "W4 عجلة الوقت: أول دورانٍ للساعة في نموذجٍ جديد ليس «تغيير مدة» (كان يترك 09:00–09:30 «خارج اللائحة»)");
  check(/preferredDuration=\{formRegulationChoice\?\.minutes \|\| expectedDurationForSelection\(form\)\}/.test(editor), "W5 العجلة تقترح مدة النمط المعتمد أولاً");
  check(/if \(!draft\.courseId\) daysSeeded\.current = true;/.test(editor), "W6 «تفاصيل أكثر» من بطاقةٍ بلا مقرر: يومها المرسوم يُكمل في المحرر الكامل");
  check((editor.match(/flashAutofill\(\)/g) || []).length >= 4 && /day-pills\$\{autofillFlash \? " is-autofilled" : ""\}/.test(editor)
    && /schedule-time-control\$\{autofillFlash \? " is-autofilled" : ""\}/.test(editor) && /autofilled=\{autofillFlash\}/.test(editor),
    "W7 المحرر الكامل: الإكمال يُرى — إضاءةٌ على الأيام والنهاية والشريحة المطبَّقة");
  check(/flashAutofill\(\)/.test(quick) && /qc-days\$\{autofillFlash \? " is-autofilled" : ""\}/.test(quick) && /autofilled=\{autofillFlash\}/.test(quick),
    "W8 «موعد جديد» السريع: الإضاءة نفسها على الأيام والوقت");
  check(/export function useAutofillFlash/.test(chips) && /أُكمل تلقائياً/.test(chips) && /aria-live="polite"/.test(chips), "W9 «أُكمل تلقائياً» لحظةً، ويُقال لقارئ الشاشة");
  check((editor.match(/`block:\$\{choice\.minutes\}`/g) || []).length === 1 && (quick.match(/`block:\$\{choice\.minutes\}`/g) || []).length === 1,
    "W10 كتلة اليوم الواحد شريحةٌ واحدة (لا «أحد · 170د» و«ثلاثاء · 170د» معاً)");
  check(/onPick=\{applyRegulationChoice\}/.test(editor) && /onPick=\{applyChoice\}/.test(quick), "W11 ويبقى للمستخدم أن يختار نمطاً آخر بشريحة");
}

/* ── ج. «لاصق بمحاضرتي» مطويّ ويُتذكَّر ── */
{
  check(/const OPEN_KEY = "lecture-stick:open";/.test(stick) && /safeStorage\.get\(OPEN_KEY\) === "on"/.test(stick), "L1 مطويٌّ افتراضياً (لا يُفتح إلا بقيمةٍ محفوظة «on»)، ويُتذكَّر على الجهاز");
  check(/className="lecture-stick-toggle" aria-expanded=\{open\}/.test(stick) && /<Magnet aria-hidden="true" \/><b>لاصق بمحاضرتي<\/b><span className="lecture-stick-count">\{count\}<\/span>/.test(stick),
    "L2 رأسٌ مضغوط: أيقونة + «لاصق بمحاضرتي» + عدد الخيارات، وزرٌّ بحالة توسّع");
  check(/\{open \? <>\s*<div className="lecture-stick-list" id=\{listId\}>/.test(stick), "L3 الشرائح لا تُرسم وهو مطويّ");
  check(/window\.dispatchEvent\(new Event\(OPEN_EVENT\)\)/.test(stick), "L4 فتحه في نموذجٍ يفتحه في الآخر المفتوح على الجهاز نفسه");
  const block = css.slice(css.indexOf("/* ── R3 (ملاحظات المالك 2026-10-29)"));
  check(block.length > 1000 && !/#[0-9a-fA-F]{3,8}\b/.test(block) && /prefers-reduced-motion:reduce/.test(block) && /\.lecture-stick\.is-collapsed/.test(block),
    "L5 الأنماط من رموز التصميم وحدها (الوضع الداكن)، وتهدأ الحركة لمن طلب ذلك");
}

/* ── د. مرورٌ حقيقي في المتصفح (اختياري) ── */
const base = process.env.R3_BASE;
if (base && process.env.APPOINTMENT_BROWSER_MODULE) {
  await driveAppointmentForms(base, check, process.env.R3_SHOTS);
} else {
  console.log("   (المرور في المتصفح: يعمل بـ APPOINTMENT_BROWSER_MODULE و R3_BASE)");
}

console.log(`\nappointment-forms-r3 audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
