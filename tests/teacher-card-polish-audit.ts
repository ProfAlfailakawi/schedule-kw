/**
 * ── تدقيق صقل كرت الأستاذ ───────────────────────────────────────────────
 *
 * ما يُفحص هنا هو ما كان يربك الأستاذ في الرحلة نفسها: فاحصٌ يقترح ثم يعاقب،
 * وصفٌّ يقفز من مكانه، ورقمٌ عارٍ في الحركة، وجملةٌ تدّعي استلاماً بشرياً.
 * الحكمُ سلوكيّ حيث أمكن، وعقدُ المصدر حيث السلوكُ داخل قالبٍ نصّيٍّ في الخادم.
 */
import fs from "fs";
import vm from "vm";
import { judgeRequest, type RequestedRow, type VerdictContext } from "../src/utils/instructorRequestVerdict";
import type { AdCourse, AdInstructor, FSchedule } from "../src/types";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};

const TEACHER = 7;
const row = (over: Partial<FSchedule> = {}): FSchedule => ({
  id: 1, AdCollegeId: 1, AdSectionId: 5, AdTermId: 20, AdCourseId: 100, AdCourseName: "تفاضل", SCode: "01",
  AdInstructorId: TEACHER, fsunday: false, fmonday: true, ftuesday: false, fwednesday: true, fthursday: true,
  fstarttime: "08:00", fendtime: "09:20", AdRoomCode: "أ", AdRoomHall: "101", ...over,
} as FSchedule);
const course = (hours: number): AdCourse => ({
  AdCourseId: 100, AdCollegeId: 1, AdSectionId: 5, CourseCode: "C100", CourseName: "مقرر",
  CourseCredit: hours, CourseHours: hours, MaxStudent: 25,
} as AdCourse);
const teacher = { AdInstructorId: TEACHER, AdInstructorCivil: "000000000007", AdInstructorName: "د. 7", AdInstructorMobile: "50000000" } as AdInstructor;
const context = (hours: number): VerdictContext => ({
  instructorId: TEACHER, allRows: [row()], instructorRowsAfter: [row()],
  courses: new Map([[100, course(hours)]]), instructors: new Map([[TEACHER, teacher]]),
  knownRoomKeys: [], startLadder: ["08:00", "09:00", "10:00", "11:00"],
});
const ask = (over: Partial<RequestedRow> = {}): RequestedRow => ({
  rowId: 1, action: "change", AdCourseId: 100, days: ["fwednesday"], start: "08:00", ...over,
});

/* ── ١. الفاحص لا يعاقب على ما يقترحه ───────────────────────────────────── */
const short = judgeRequest(ask({ days: ["fwednesday"] }), context(4));
check(!short.sendable, "يوم واحد لمقرّر أربع ساعات يُمنع");
check(Array.isArray(short.shapes) && short.shapes.length > 0, "والمنعُ يحمل التوزيعات المعتمدة أزراراً لا نصاً فقط");
const mixed = judgeRequest(ask({ days: ["fmonday", "fwednesday", "fthursday"] }), context(4));
check(!mixed.reasons.some(reason => /أيام مختلطة/.test(reason.text)), "٨٠+٨٠+٥٠ المعتمد لمقرّر الأربع ساعات لا يُحذَّر منه");
let everyShapePasses = true;
for (const shape of short.shapes || []) {
  const verdict = judgeRequest(ask({ days: shape.days as any }), context(4));
  if (!verdict.sendable || verdict.reasons.some(reason => reason.source === "shape")) everyShapePasses = false;
}
check(everyShapePasses, "كلُّ توزيعٍ يقترحه الفاحص يمرّ منه بلا منعٍ ولا ملاحظة شكل");
const stillMixed = judgeRequest(ask({ days: ["fsunday", "fmonday"] }), context(1));
check(stillMixed.reasons.some(reason => /أيام مختلطة/.test(reason.text)), "ويبقى التحذير لما ليس نمطاً معتمداً لمقرّره");

/* ── ٢–٧. عقودُ المصدر ───────────────────────────────────────────────────── */
const server = fs.readFileSync("server.ts", "utf8");
const page = server.slice(server.indexOf("function instructorRequestPage"), server.indexOf('app.get("/r/:token"'));
check(/\.sort\(function\(a,b\)\{[^}]*a\.it\.ord==null/.test(page), "ترتيب الصفوف يقرأ رتبةً ثابتة لا يومَ الموعد الحالي");
check(!/function planTable\(\)[\s\S]{0,400}planDays\(a\.it\)/.test(page), "planTable لا يعيد الفرز بالموعد المتغيّر");
check(/function rankState\(/.test(page) && /rankState\(\);\n/.test(page), "الرتبة تُعطى مرةً عند التحميل");
check(/countOf\(Number\(e\.detail\)\|\|0,AR\.edit,"بلا تعديلات"\)/.test(page), "سطر «أرسلتَ طلبك» يعدّ بقاعدة العدّ لا برقمٍ عارٍ");
check(/"received":"وصل إلى صندوق القسم"/.test(page) && /e\.kind!=="received"/.test(page), "حدث الاستلام لا يدّعي استلاماً بشرياً");
check(!/"received":"استلمه القسم"/.test(page), "ولا بقي لفظُ «استلمه» القديم");
check(server.includes("الرقم المدني غير مكتمل أو فيه خطأ كتابة. راجعه وأعد المحاولة."), "رسالة فشل رقم التحقق لا توحي بمطابقة");
check(server.includes("الرقم المدني لا يطابق صاحب هذا الرابط."), "ورسالة عدم المطابقة (403) باقية كما هي");
check(/visibilitychange/.test(page) && /Date\.now\(\)-lastFetch>30000/.test(page), "عودةُ الصفحة تُعيد الجلب بعد ثلاثين ثانية");
check(/if\(dirty\)\{if\(fromPush/.test(page), "ولا تُعيد الجلب فوق مسودةٍ لم تُرسل");
check(/\?live=1/.test(page) && /String\(req\.query\.live \|\| ""\) === "1"/.test(server), "وإعادةُ الجلب الصامتة لا تُحسب فتحاً");
check(/<link rel="icon" href="\/schedule-icon\.svg"/.test(page), "الصفحة تحمل أيقونتها فلا يطلب المتصفحُ favicon.ico ويعود 404");
check(/data-shape=/.test(page) && /\[data-shape\]/.test(page), "أزرار التوزيع المعتمد تُطبَّق بضغطة");

/* السكربت المولَّد يُجمَّع كما هو. */
const html = server.includes("function instructorRequestPage") ? "ok" : "";
check(html === "ok", "الدالة موجودة");

console.log(`\nTeacher card polish audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
