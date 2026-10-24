/**
 * ── كرت الأستاذ: الجولة الثانية ───────────────────────────────────────────────
 *
 *   P1  «تعديل» بلا لمسة ليس طلباً: لا مانع، والنهاية الأصلية، والملاحظةُ إرشادٌ لا منع.
 *   P2  بدايةٌ مختلفة في اليوم الواحد نفسه تحفظ طولَ الموعد الحالي، فلا يُمنع الأستاذ بما لم يطلبه.
 *   P3  نصُّ «جرّب» يساوي أزرارَه حرفاً، وكلُّ زرٍّ يمرّ من الفاحص نفسه.
 *   P4  مصدرُ الصفحة: لا يُعدّ المحرّرُ المفتوح تعديلاً، والموعدُ الناقص ليس «جاهزاً»، والخريطةُ لا تحمرّ لمشكلة أيام.
 */
import { readFileSync } from "node:fs";
import { judgeRequest, type RequestedRow, type VerdictContext } from "../src/utils/instructorRequestVerdict";
import type { AdCourse, AdInstructor, FSchedule } from "../src/types";

let passed = 0, failed = 0;
const check = (ok: boolean, name: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); }
};

const TEACHER = 5, COURSE = 19;
const row = (over: Partial<FSchedule>): FSchedule => ({
  id: 1, AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdCourseId: COURSE, SCode: "02", AdInstructorId: TEACHER,
  fsunday: false, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false,
  fstarttime: "14:00", fendtime: "15:15", AdRoomCode: "أ", AdRoomHall: "101", ...over,
} as FSchedule);
/* «التصميم التعليمي ٠٢»: الخميس وحده ٧٥ دقيقة، والمقرر ٤ ساعات أسبوعياً. */
const thursday = row({ id: 1, fthursday: true });
const course: AdCourse = { AdCourseId: COURSE, AdCollegeId: 1, AdSectionId: 1, CourseCode: "ED19", CourseName: "التصميم التعليمي", CourseCredit: 4, CourseHours: 4 } as AdCourse;
const teacher = { AdInstructorId: TEACHER, AdInstructorCivil: "000000000005", AdInstructorName: "د. 5" } as AdInstructor;
const ctx = (after: FSchedule[]): VerdictContext => ({
  instructorId: TEACHER, allRows: [thursday], instructorRowsAfter: after,
  courses: new Map([[COURSE, course]]), instructors: new Map([[TEACHER, teacher]]), knownRoomKeys: [], startLadder: [],
});
const DAYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
const judge = (days: string[], start: string, original: FSchedule = thursday) => {
  const after = row({ id: original.id, ...Object.fromEntries(DAYS.map(d => [d, days.includes(d)])), fstarttime: start, fendtime: start });
  const ask: RequestedRow = { rowId: original.id, action: "change", AdCourseId: COURSE, days: days as any, start };
  return judgeRequest(ask, { ...ctx([after]), allRows: [original] });
};
/* موعدٌ يغطّي الساعات (٢٠٠ دقيقة): نقلُه إلى يومين قصيرين يقصّر عنها فيُمنع. */
const full = row({ id: 2, fmonday: true, fwednesday: true, fstarttime: "09:00", fendtime: "10:40" });

/* P1: تعديلٌ بلا لمسة */
const same = judge(["fthursday"], "14:00");
check(same.kind === "clear" && same.sendable && !same.reasons.some(r => r.blocking), "P1 «تعديل» بلا لمسة: لا مانع ولا استثناء", same);
check(same.headline === "هذا موعدك الحالي كما هو", "P1 العنوان يقول إنه الموعد الحالي");
check(/أقصر من ساعات المقرّر/.test(same.advice || "") && /4 ساعات|٤ ساعات|أربع ساعات/.test(same.advice || ""), "P1 الإرشادُ يذكر أن الموعد الحالي أقصر من ساعات المقرر", same.advice);
check((same.shapes || []).length > 0 && (same.shapes || []).every(s => s.days.length > 1), "P1 ومعه أزرارُ أنماطٍ معتمدة", same.shapes);

/* P2: بدايةٌ أخرى في اليوم نفسه */
const later = judge(["fthursday"], "15:00");
check(!later.reasons.some(r => r.blocking && r.source === "shape"), "P2 بدايةٌ أخرى في الخميس نفسه لا تُمنع بنقص الساعات", later);
check(later.blockMinutes === 75 && later.computedEnd === "16:15", "P2 المدةُ مدةُ الموعد الحالي (٧٥ دقيقة): ينتهي 16:15", { block: later.blockMinutes, end: later.computedEnd });

/* P3: النصُّ يساوي الأزرار، وكلُّ زرٍّ يمرّ من الفاحص */
const bad = judge(["fsunday", "ftuesday"], "09:00", full);
const hours = bad.reasons.find(r => r.code === "hours");
check(!!hours && hours.blocking, "P3 أيامٌ لا تغطّي الساعات: مانعٌ برمز hours", bad.reasons);
const buttons = (bad.shapes || []).map(s => s.label);
check(buttons.length > 0 && buttons.every(label => (hours?.text || "").includes(label)), "P3 كلُّ زرٍّ مذكورٌ في نص «جرّب» حرفاً", { buttons, text: hours?.text });
const tryText = (hours?.text.split("جرّب")[1] || "").replace(/\.$/, "").trim();
check(tryText.split(" أو ").length === buttons.length && tryText.split(" أو ").every(label => buttons.includes(label)), "P3 ولا يُذكر نمطٌ بلا زرّ", { tryText, buttons });
const applied = (bad.shapes || []).map(shape => ({ shape, verdict: judge(shape.days as string[], "09:00", full) }));
check(applied.length > 0 && applied.every(a => !a.verdict.reasons.some(r => r.code === "hours" || (r.blocking && r.source === "shape"))), "P3 كلُّ زرٍّ مقترح يمرّ من الفاحص بلا منع ساعات", applied.map(a => ({ l: a.shape.label, k: a.verdict.kind })));

/* P4: مصدرُ الصفحة */
const server = readFileSync("server.ts", "utf8");
const page = server.slice(server.indexOf("function instructorRequestPage"), server.indexOf('app.post("/api/public/request/:token/check"'));
check(page.includes("function unchangedEdit(it)") && page.includes('return{rowId:it.rowId,action:"keep",days:[],start:"",excuse:it.excuse}'), "P4 التعديلُ بلا لمسة يُرسل إبقاءً");
check(/var changed=state\.filter\(function\(it\)\{return it\.action!=="keep"&&!unchangedEdit\(it\)&&!incompleteItem\(it\)\}\)/.test(page), "P4 ولا يُعدّ في «جاهز»، ولا الموعدُ الناقص");
check(page.includes('"أكمل الموعد الجديد"') && page.includes("gi(\"arrow\")+'أكمله'"), "P4 الشريط يقول «أكمل الموعد الجديد» بزرّ «أكمله»");
check(page.includes('"أكمل الأيام ووقت البداية لـ«"+courseOf(state[incomplete])+"» قبل الإرسال."'), "P4 رسالةُ النقص تذكر اسم المقرر لا رقماً");
check(page.includes("payloadWith(i)") && page.includes('problem==="shape"') && page.includes("المشكلة في الأيام لا في الوقت — اختر نمطاً من الأزرار."), "P4 مشكلةُ الأيام لا تُلوّن الأوقات، وسطرٌ واحد يقول ذلك");
check(server.includes('if (problemIsShape) { res.json({ times: {}, problem: "shape" }); return; }'), "P4 والخادمُ هو من يحكم (لا bad لكل وقت)");
check(server.includes('note.kind !== "balance" && note.courseIds') && page.includes('n.kind!=="balance"'), "P4 شريطُ نسب الصباح والمساء غائبٌ عن صفحة الأستاذ");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
