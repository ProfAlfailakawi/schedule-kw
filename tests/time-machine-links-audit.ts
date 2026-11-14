/**
 * ── روابط آلة الزمن من التنبؤ والتخطيط ─────────────────────────────────────
 *
 * التنبؤ يرى نقصاً متوقّعاً، والتخطيط يرى مقرراً يحتاج شعبةً أخرى؛ كلاهما
 * يفتح آلة الزمن على الجملة نفسها التي يكتبها المستخدم بيده («زاد الطلب على
 * <الرمز>»)، فيقرؤها قارئٌ واحد (parseProblem). يتحقق هذا الاختبار من:
 *   1) المسار يطابق مسار آلة الزمن في التطبيق، والجملة تذهب وتعود سليمة؛
 *   2) الرمز الطويل يُطابق كاملاً قبل مطابقة آخر أرقامه (كان «0109» من
 *      «0109468» يطابق مقرراً آخر ينتهي بـ0109)، والرمز القصير يبقى كما كان؛
 *   2ب) الأمثلة والتسميات وبطاقات الشعب بالرقم السباعي (0109468 لا 468)؛
 *   3) الشاشات الثلاث موصولة: الآلة تقرأ الجملة مرّةً، والتنبؤ والتخطيط
 *      يفتحانها على نسخةٍ افتراضية فقط.
 */
import fs from "fs";
import path from "path";
import type { AdCourse } from "../src/types";
import { describeProblem, parseProblem, removeSectionChange, sectionCards, tmCourseNumber, type TmContext } from "../src/utils/timeMachine";
import { askFromSearch, demandAsk, TIME_MACHINE_PATH, timeMachineHref } from "../src/utils/timeMachineLink";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

/* ── 1) المسار والجملة ── */
{
  const app = read("src/App.tsx");
  const declared = app.match(/timeMachine:\s*"([^"]+)"/)?.[1];
  check(declared === TIME_MACHINE_PATH, "L1 مسار الرابط هو مسار آلة الزمن في التطبيق", { declared, TIME_MACHINE_PATH });
  const ask = demandAsk("0109468");
  check(ask === "زاد الطلب على 0109468", "L2 جملة الطلب الزائد هي ما يكتبه المستخدم بيده", ask);
  const href = timeMachineHref(ask);
  check(href.startsWith(`${TIME_MACHINE_PATH}?ask=`), "L3 الرابط يحمل الجملة في العنوان", href);
  check(askFromSearch(href.slice(href.indexOf("?"))) === ask, "L4 الجملة تذهب وتعود سليمة (عربي وأرقام)");
  check(askFromSearch(`?ask=${encodeURIComponent("x".repeat(500))}`).length === 200, "L5 جملةٌ طويلة تُقصّ ولا تُحمل كاملة");
  check(askFromSearch("?other=1") === "", "L6 بلا جملة لا شيء يُشغَّل");
}

/* ── 2) الرمز الطويل كاملاً أولاً ── */
{
  const course = (id: number, code: string, name: string): AdCourse => ({ AdCourseId: id, AdCollegeId: 1, AdSectionId: 1, CourseCode: code, CourseName: name, CourseCredit: 3, CourseHours: 3, MaxStudent: 35 } as AdCourse);
  const context: TmContext = {
    scope: { collegeId: 1, sectionId: 1, termId: 7 }, rows: [], outside: [], instructors: [], halls: [], demand: null, loadLimits: {}, canWrite: false,
    /* مقررٌ ينتهي رمزُه بـ0109 يأتي أولاً: كان يُختار خطأً لـ«0109468». */
    courses: [course(1, "5550109", "مقرر ينتهي بالأرقام نفسها"), course(2, "0109468", "إدارة مراكز مصادر التعلم"), course(3, "121", "مدخل التقنيات")],
  };
  const long = parseProblem(demandAsk("0109468"), context);
  check(long?.kind === "demandUp" && long.courseId === 2, "L7 «زاد الطلب على 0109468» ← المقرر صاحب الرمز كاملاً", long);
  const short = parseProblem("زاد الطلب على 121", context);
  check(short?.kind === "demandUp" && short.courseId === 3, "L8 الرمز القصير («121») يبقى كما كان", short);
  check(parseProblem("زاد الطلب على 9999999", context) === null, "L9 رمزٌ طويلٌ لا وجود له لا يُطابق آخرَ أرقامه مع مقررٍ آخر");
  const tail = parseProblem("زاد الطلب على 09468", context);
  check(tail?.kind === "demandUp" && tail.courseId === 2, "L9b ذيلُ رمزٍ طويل («09468») يُفهم بطوله كلّه", tail);
}

/* ── 2ب) NFR-DRF-027: الرقم السباعي في الأمثلة والتسميات وبطاقات الشعب ── */
{
  const course = (id: number, code: string, name: string): AdCourse => ({ AdCourseId: id, AdCollegeId: 1, AdSectionId: 1, CourseCode: code, CourseName: name, CourseCredit: 3, CourseHours: 3, MaxStudent: 35 } as AdCourse);
  const row = { id: 1, AdCollegeId: 1, AdSectionId: 1, AdTermId: 7, AdCourseId: 2, AdCourseName: "إدارة مراكز مصادر التعلم", SCode: "01", AdInstructorId: 0,
    fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false, fstarttime: "08:00", fendtime: "09:15", AdRoomCode: "", AdRoomHall: "" } as any;
  const context: TmContext = {
    scope: { collegeId: 1, sectionId: 1, termId: 7 }, rows: [row], outside: [], instructors: [], halls: [], demand: null, loadLimits: {}, canWrite: false,
    courses: [course(2, "468", "إدارة مراكز مصادر التعلم")], departmentKeys: { "1": "0109" },
  };
  check(tmCourseNumber(context.courses[0], context) === "0109468", "L16 المقرر المخزَّن 468 في القسم 0109 يُعرض 0109468");
  const read7 = parseProblem(demandAsk(tmCourseNumber(context.courses[0], context)), context);
  check(read7?.kind === "demandUp" && read7.courseId === 2, "L17 «زاد الطلب على 0109468» تُقرأ ولو خُزّن المقرر بخاناته الثلاث", read7);
  check(read7 ? describeProblem(read7, context) === "طلبٌ زائد على 0109468 إدارة مراكز مصادر التعلم" : false, "L18 وصفُ المشكلة بالرقم السباعي", read7 && describeProblem(read7, context));
  const cards = sectionCards([row], context);
  check(cards[0]?.courseCode === "0109468" && removeSectionChange(cards[0]).label === "حذف 0109468 ش01", "L19 بطاقة الشعبة وتسمية التغيير بالرقم السباعي", cards[0]);
  check(context.courses[0].CourseCode === "468" && row.AdCourseId === 2, "L20 العرض لا يغيّر المخزَّن");
  const bare = { ...context, departmentKeys: undefined };
  check(tmCourseNumber(bare.courses[0], bare) === "468", "L21 بلا مفتاح قسم يبقى الرمز كما خُزّن (لا يُختلق رقم)");
  const machine = read("src/components/TimeMachine.tsx"), simulator = read("src/components/SectionSimulator.tsx"), routes = read("src/server/timeMachineRoutes.ts");
  check(/`زاد الطلب على \$\{tmCourseNumber\(course, context\)\}`/.test(machine) && !/زاد الطلب على \$\{course\.CourseCode\}/.test(machine) && /«زاد الطلب على 0109468»/.test(machine),
    "L22 أمثلة آلة الزمن وتلميحها بالرقم السباعي");
  check(/tmCourseNumber\(course, context\)\} · \$\{course\.CourseName\}/.test(simulator) && !/\$\{course\.CourseCode\} ·/.test(simulator), "L23 قائمة مقررات محاكي الشعب بالرقم السباعي");
  check(/departmentKeys,/.test(routes) && /authorityDepartmentKeys\(/.test(routes), "L24 سياق آلة الزمن يحمل مفاتيح الأقسام من الخادم");
}

/* ── 3) الشاشات موصولة ── */
{
  const machine = read("src/components/TimeMachine.tsx");
  check(/takeTimeMachineAsk\(\)/.test(machine) && /run\(parseProblem\(ask, context\)\)/.test(machine), "L10 آلة الزمن تقرأ الجملة وتحلّها فوراً (مرّةً واحدة)");
  const forecast = read("src/components/PredictiveInsightPanel.tsx");
  check(/openInTimeMachine\(demandAsk\(row\.code\)\)/.test(forecast), "L11 التنبؤ: نقصٌ متوقّع يفتح آلة الزمن على مقرره");
  check(/row\.delta > 0 && canSchedule/.test(forecast), "L12 التنبؤ: الزر للنقص وحده ولمن يملك الجدولة");
  check([forecast].every(source => /يفتح آلة الزمن على نسخة افتراضية؛ لا يكتب في الجدول/.test(source)), "L15 الزرّ يقول إنه لا يكتب في الجدول");
}

console.log(`\nTime machine links audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
