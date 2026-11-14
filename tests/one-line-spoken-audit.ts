/**
 * ── السطر الواحد بالكلام الكويتي المنطوق وما حوله (تدقيق 2026-11-14) ──────────────────
 * القراءة الخالصة فقط: قاعدة الساعة الواحدة (1–7 عصراً)، الساعات غير الصحيحة، ساعتان = بداية ونهاية،
 * التطويل والشرطات، «م.» لقباً لا مساءً، «ونص/وربع/الا ربع»، أرقام منطوقة، أفعال، أيام لهجية،
 * والسبت ليس يوم دوام.
 */
import { parseOneLineAppointment, type OneLineContext, type OneLineReading } from "../src/utils/oneLineAppointment";
import { parseTypedClock } from "../src/utils/clockInput";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 600)); }
};
const courses = [
  { AdCourseId: 1, CourseName: "التصميم التعليمي", CourseCode: "0109105" },
  { AdCourseId: 2, CourseName: "مبادئ الإحصاء", CourseCode: "0109106" },
];
const instructors = [
  { AdInstructorId: 11, AdInstructorName: "أحمد سالم العنزي" },
  { AdInstructorId: 12, AdInstructorName: "نورة خالد" },
];
const ctx: OneLineContext = { courses, instructors, window: { start: "08:00", end: "20:00" } };
const p = (text: string) => parseOneLineAppointment(text, ctx);
const t = (r: OneLineReading) => `${r.seed.start || ""}-${r.seed.end || ""}`;
const d = (r: OneLineReading) => (r.seed.days || []).join("+");

/* (i) الساعة 7 عصراً */
check(t(p("6-7:20")) === "18:00-19:20" && t(p("6:30-7:50")) === "18:30-19:50", "i النهاية لا تسقط مع الساعة 7", [p("6-7:20"), p("6:30-7:50")]);
check(t(p("6-8")) === "18:00-20:00" && t(p("7-8")) === "19:00-20:00", "i «6-8» و«7-8» بعد الظهر");
check(p("7").seed.start === "19:00" && p("07:30").seed.start === undefined && p("8").seed.start === "08:00", "i 7 عصراً، الصفر الصريح صباحاً، 8 كما كُتبت");
check(t(p("9-8")) === "09:00-", "i «9-8» لا تُقلب");

/* (ii) م. لقب */
const title = p("الأحد 9 م. أحمد");
check(title.seed.start === "09:00" && title.seed.instructorId === 11 && d(title) === "fsunday", "ii «9 م. أحمد»: لقبٌ لا مساء", title);
check(p("الأحد 9 م").seed.start === "21:00" || p("الأحد 9 م").unknown.length > 0, "ii «9 م» بلا نقطة ما زالت مساءً (خارج الدوام فتُقال)");
check(p("8:30 م").seed.start === "20:30" || p("8:30 م").unknown.includes("8:30 م"), "ii «8:30 م» لاحقةٌ");

/* (iii) ساعات غير صحيحة */
const bad60 = p("0109105 14:60 ن");
check(!bad60.seed.start && !bad60.seed.sectionCode && bad60.unknown.includes("14:60"), "iii «14:60» تُقال ولا تتسرب للشعبة", bad60);
const bad24 = p("24:00");
check(!bad24.seed.start && !bad24.seed.sectionCode && bad24.unknown.includes("24:00"), "iii «24:00» تُرفض", bad24);
const two = p("8:00 9:20");
check(t(two) === "08:00-09:20" && !two.seed.sectionCode && !two.unknown.length, "iii ساعتان = بداية ونهاية", two);
const bad5 = p("8:5");
check(!bad5.seed.start && bad5.unknown.includes("8:5") && !bad5.seed.sectionCode, "iii «8:5» غامضة فتُقال", bad5);

/* (iv) التطويل والشرطات */
check(t(p("8ـ9:20")) === "08:00-09:20" && t(p("8–9:20")) === "08:00-09:20" && t(p("8—9:20")) === "08:00-09:20" && t(p("8 ـ 9:20")) === "08:00-09:20", "iv التطويل وشرطة en/em شرطةُ مدى");

/* (v) 0800 1400 800 */
check(p("0800").seed.start === "08:00" && p("1400").seed.start === "14:00" && p("800").seed.start === "08:00", "v 0800 1400 800 كحقل الوقت");
check(p("503").seed.sectionCode === "503" && !p("503").seed.start, "v «503» تبقى شعبة");
check(parseTypedClock("0800").clock === "08:00" && parseTypedClock("1400").clock === "14:00" && parseTypedClock("800").clock === "08:00", "v المساعد المشترك");

/* (vi) المفردات */
check(p("8 ونص").seed.start === "08:30" && p("8 ونصف").seed.start === "08:30" && p("9 وربع").seed.start === "09:15" && p("9 الا ربع").seed.start === "08:45",
  "vi ونص / ونصف / وربع / الا ربع");
check(p("2 ونص").seed.start === "14:30", "vi «2 ونص» عصراً");
check(d(p("الثلوث")) === "ftuesday" && d(p("الثلثاء")) === "ftuesday" && d(p("أحد وثلاثاء")) === "fsunday+ftuesday", "vi أيام لهجية");
const sat = p("السبت 9");
check(!sat.seed.days && sat.unknown.includes("السبت") && /ليس يوم دوام/.test((sat.notes || []).join()) && sat.seed.start === "09:00", "vi السبت ليس يوم دوام ويُقال بسببه", sat);
check(!!p("الجمعة").notes?.length, "vi الجمعة كذلك");
check(p("3 العصر").seed.start === "15:00" && p("9 الصبح").seed.start === "09:00" && p("الساعة 1 الظهر").seed.start === "13:00" && p("11 الظهر").seed.start === "11:00", "vi العصر/الصبح/الظهر فترات");
check(p("الساعة 3 العصر").seed.start === "15:00", "vi الساعة 3 العصر");
check(!p("ويوم الأحد").unknown.length, "vi «ويوم» وصل", p("ويوم الأحد"));

/* الأرقام المنطوقة */
const words: Array<[string, string]> = [["واحدة", "13:00"], ["ثنتين", "14:00"], ["اثنتين", "14:00"], ["ثلاثة", "15:00"], ["ثلاث", "15:00"], ["أربعة", "16:00"], ["خمسة", "17:00"],
  ["ستة", "18:00"], ["سبعة", "19:00"], ["ثمانية", "08:00"], ["تسعة", "09:00"], ["عشرة", "10:00"], ["حداشر", "11:00"], ["إحدى عشر", "11:00"], ["اثنا عشر", "12:00"], ["ثناشر", "12:00"]];
for (const [word, clock] of words) check(p(`الساعة ${word}`).seed.start === clock, `num «الساعة ${word}» = ${clock}`, p(`الساعة ${word}`));
check(p("الساعة اثنين").seed.start === "14:00" && d(p("الاثنين")) === "fmonday" && !p("الاثنين").seed.start, "num «اثنين» بعد الساعة رقم وإلا يوم");
check(p("ثنتين ونص").seed.start === "14:30" && p("ثلاثة العصر").seed.start === "15:00", "num رقمٌ منطوق قبل كسر/فترة");
const spokenName = p("حط التصميم التعليمي حق د. أحمد أحد وثلاثاء الساعة ثنتين");
check(spokenName.seed.courseId === 1 && spokenName.seed.instructorId === 11 && d(spokenName) === "fsunday+ftuesday" && spokenName.seed.start === "14:00" && !spokenName.unknown.length,
  "الجملة الكويتية الكاملة: مقرر باسمه، أستاذ، أحد+ثلاثاء، 14:00", spokenName);
for (const verb of ["ضيف", "سوي", "أضف", "ابي", "حط"]) {
  const r = p(`${verb} التصميم التعليمي الاثنين الساعة تسعة`);
  check(r.seed.courseId === 1 && d(r) === "fmonday" && r.seed.start === "09:00" && !r.unknown.length, `فعل «${verb}» وصل لا يُعدّ مجهولاً`, r);
}
check(!p("ابي موعد").unknown.length, "الفعل وحده لا يُعدّ مجهولاً");

console.log(`\none-line spoken audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
