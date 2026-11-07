/**
 * ── «في الوقت نفسه»: التطابق التام، والتداخل الجزئي لنفس المستوى ──────────────
 * الحالات: الوقتُ نفسه نعم؛ التداخلُ الجزئي لنفس المستوى نعم ولغيره لا؛ التلاصق لا؛ يومٌ آخر لا؛ الموعدُ المعدَّل لا يُعدّ نفسَه؛
 * أيامٌ متعددة؛ السقف والترتيب؛ «نفس المستوى» أولاً؛ وما سمّاه فحصُ التعارض لا يتكرر.
 */
import fs from "node:fs";
import { capSameSlot, levelOfCode, NEAR_SECTION_MAX_MINUTES, NEAR_SECTION_MIN_MINUTES, nearSectionWindow, sameSlotOf, slotMinutes, type SlotRow } from "../src/utils/sameSlot";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 600)); }
};

const codes: Record<number, string> = { 1: "0109105", 2: "0109106", 3: "0109205", 4: "0109301", 5: "0109107" };
const codeOf = (id: number) => codes[id] ?? `01091${String(id).padStart(2, "0")}`;
const row = (id: number, courseId: number, days: string[], start: string, end: string, extra: Partial<SlotRow> = {}): SlotRow => ({
  id, AdCourseId: courseId, AdSectionId: 7, AdTermId: 20261, AdCollegeId: 3, SCode: String(id),
  fstarttime: start, fendtime: end,
  fsunday: days.includes("s"), fmonday: days.includes("m"), ftuesday: days.includes("t"), fwednesday: days.includes("w"), fthursday: days.includes("h"), ...extra,
});

const rows: SlotRow[] = [
  row(10, 3, ["s", "t"], "10:00", "10:50"),
  row(11, 1, ["s"], "10:00", "10:50"),
  row(12, 4, ["s"], "10:00", "10:50"),
  row(13, 2, ["s"], "10:00", "11:00"),       // نهايةٌ مختلفة
  row(14, 2, ["s"], "10:30", "11:20"),       // تداخل جزئي
  row(15, 2, ["s"], "10:50", "11:40"),       // تلاصق
  row(16, 2, ["m"], "10:00", "10:50"),       // يومٌ آخر
  row(17, 5, ["s"], "9:00", "9:50"),
];
const base = { days: ["fsunday" as const], start: "10:00", end: "10:50" };
const idsOf = (result: ReturnType<typeof sameSlotOf>, day = 0) => result.days[day].items.map(i => Number(i.row.id));

let r = sameSlotOf(rows, { ...base });
check(r.count === 3 && r.days.length === 1, "الوقت نفسه تماماً: ثلاثة مواعيد", r.count);
check(!idsOf(r).some(id => [13, 14, 15, 16, 17].includes(id)), "لا جزئي ولا ملاصق ولا يومٌ آخر");
check(sameSlotOf(rows, { ...base, end: "10:51" }).count === 0, "فرقُ دقيقةٍ واحدة ليس «الوقت نفسه»");
check(idsOf(sameSlotOf(rows, { ...base, start: "09:00", end: "09:50" })).join() === "17", "الصيغة 9:00 تُقرأ كـ09:00");
check(slotMinutes("9:05") === 545 && Number.isNaN(slotMinutes("")) && Number.isNaN(slotMinutes("xx")), "قراءة الدقائق");

check(idsOf(sameSlotOf(rows, { ...base, excludeId: 11 })).join() === "10,12", "الموعد المعدَّل لا يُعدّ نفسَه");
check(sameSlotOf(rows, { ...base, excludeId: "11" }).count === 2, "المعرّف نصاً أيضاً");
check(sameSlotOf(rows, { ...base, excludeId: 0 }).count === 3, "معرّف صفر (موعدٌ جديد) لا يستثني شيئاً");
check(idsOf(sameSlotOf(rows, { ...base, skipIds: [10, 12] })).join() === "11", "ما سمّاه فحصُ التعارض لا يتكرر");
check(sameSlotOf(rows, { ...base, days: ["fthursday"] }).count === 0, "يومٌ بلا مواعيد: لا شيء");
check(sameSlotOf(rows, { ...base, days: [] }).count === 0, "بلا أيام: لا شيء");
check(sameSlotOf(rows, { ...base, start: "10:50", end: "10:00" }).count === 0, "نهايةٌ قبل البداية: لا شيء");
check(sameSlotOf(rows, { ...base, start: "", end: "" }).count === 0, "وقتٌ فارغ: لا شيء");
check(sameSlotOf(rows, { ...base, termId: 99999 }).count === 0, "فصلٌ آخر: لا شيء");

/* أيام متعددة: الصفّ ذو اليومين يُعدّ مرة واحدة ويظهر في كل يوم. */
r = sameSlotOf(rows, { ...base, days: ["fsunday", "ftuesday"] });
check(r.days.map(d => d.day).join() === "fsunday,ftuesday", "تجميع بالأيام بترتيب الأسبوع");
check(idsOf(r, 1).join() === "10", "الثلاثاء: موعدٌ واحد");
check(r.count === 3, "العدد بلا تكرار الصفّ ذي اليومين", r.count);
check(sameSlotOf(rows, { days: ["ftuesday", "fsunday"], start: "10:00", end: "10:50" }).days[0].day === "fsunday", "ترتيب الأيام لا يتبع ترتيب الاختيار");

/* نفس المستوى أولاً. */
check(levelOfCode("0109105") === 100 && levelOfCode("0109205") === 200 && levelOfCode("105") === 100 && levelOfCode("12") === 0 && levelOfCode(undefined) === 0, "المستوى من مئات الرمز");
r = sameSlotOf(rows, { ...base, courseId: 3, sectionId: 7, codeOf });
check(idsOf(r).join() === "10,11,12" && r.days[0].items[0].sameLevel && r.days[0].items.filter(i => i.sameLevel).length === 1, "مستوى ٢٠٠: صفّه وحده يُعلَّم ويتقدّم", idsOf(r));
r = sameSlotOf(rows, { ...base, courseId: 4, sectionId: 7, codeOf });
check(idsOf(r).join() === "12,11,10" && r.days[0].items[0].sameLevel, "مستوى ٣٠٠: يتقدّم ثم الباقي برقم المقرر", idsOf(r));
r = sameSlotOf(rows, { ...base, courseId: 2, sectionId: 7, codeOf });
check(idsOf(r).join() === "11,10,12" && r.days[0].items.filter(i => i.sameLevel).length === 1, "مستوى ١٠٠: الصف 11 أولاً ثم الباقي برقم المقرر", idsOf(r));
r = sameSlotOf(rows, { ...base, courseId: 2, sectionId: 99, codeOf });
check(r.days[0].items.every(i => !i.sameLevel), "قسمٌ آخر: ليس «نفس المستوى»");
r = sameSlotOf(rows, { ...base });
check(r.days[0].items.every(i => !i.sameLevel) && idsOf(r).join() === "10,11,12", "بلا مقرر: لا تعليم والترتيب ثابت", idsOf(r));

/* السقف. */
const many: SlotRow[] = Array.from({ length: 9 }, (_, i) => row(100 + i, 1 + i, ["s", "t"], "08:00", "08:50"));
r = sameSlotOf(many, { days: ["fsunday", "ftuesday"], start: "08:00", end: "08:50" });
check(r.count === 9 && r.days.length === 2, "تسعة مواعيد في يومين", r.count);
let c = capSameSlot(r.days, 6);
check(c.days.reduce((n, d) => n + d.items.length, 0) === 6 && c.hidden === 12, "السقف ٦ صفوف والباقي عدداً", c.hidden);
c = capSameSlot(sameSlotOf(many, { days: ["fsunday"], start: "08:00", end: "08:50" }).days, 6);
check(c.days[0].items.length === 6 && c.hidden === 3, "سقفٌ ليومٍ واحد: +٣");
c = capSameSlot(sameSlotOf(rows, { ...base }).days, 6);
check(c.hidden === 0 && c.days[0].items.length === 3, "تحت السقف: لا «+»");

/* تداخلٌ جزئي: حالة المالك بأرقامها. 0109237 و0109258 من مستوى ٢٠٠ والمقرر الثالث من مستوى ٣٠٠. */
const ownerCodes: Record<number, string> = { 37: "0109237", 58: "0109258", 39: "0109359", 40: "109240" };
const ownerCodeOf = (id: number) => ownerCodes[id];
const owner = { days: ["fsunday" as const], start: "11:00", end: "15:00", courseId: 37, sectionId: 7, termId: 20261, collegeId: 3, scode: "1", codeOf: ownerCodeOf };
const partnerRow = row(58, 58, ["s"], "12:00", "16:00");

r = sameSlotOf([partnerRow], owner);
check(r.count === 1 && r.partialCount === 1 && r.days[0].items[0].kind === "partial" && r.days[0].items[0].sameLevel, "حالة المالك: 11–15 مع 12–16 من مستواه تُعدّ", r);
check(sameSlotOf([row(58, 39, ["s"], "12:00", "16:00")], owner).count === 0, "مستوى مختلف بالأوقات نفسها: لا يُعدّ");
check(sameSlotOf([row(58, 58, ["s"], "12:00", "16:00")], { ...owner, start: "11:00", end: "12:00" }).count === 0, "تلاصق 11–12 مع 12–16: لا يُعدّ");
check(sameSlotOf([row(58, 58, ["s"], "15:00", "16:00")], owner).count === 0, "تلاصقٌ من الجهة الأخرى: لا يُعدّ");
r = sameSlotOf([partnerRow], { ...owner, start: "12:00", end: "16:00" });
check(r.count === 1 && r.partialCount === 0 && r.days[0].items[0].kind === "exact" && r.days[0].items[0].sameLevel, "الوقت نفسه من مستواه: تطابقٌ تام كما كان");
r = sameSlotOf([row(58, 39, ["s"], "11:00", "15:00")], owner);
check(r.count === 1 && r.partialCount === 0 && !r.days[0].items[0].sameLevel, "مستوى مختلف بتطابق تام: يبقى كما كان");
check(sameSlotOf([row(58, 58, ["s"], "12:00", "13:00")], owner).partialCount === 1, "محتوى داخل وقت الموعد: تداخل");
check(sameSlotOf([row(58, 58, ["s"], "10:00", "17:00")], owner).partialCount === 1, "يحتوي وقت الموعد: تداخل");
check(sameSlotOf([row(58, 40, ["s"], "12:00", "16:00")], owner).partialCount === 1, "الرمز القصير يُقرأ مستواه كالكامل");
check(sameSlotOf([partnerRow], { ...owner, excludeId: 58 }).count === 0, "الموعد المعدَّل لا يُعدّ نفسَه");
check(sameSlotOf([row(58, 37, ["s"], "11:00", "15:00")], owner).count === 1, "شعبةٌ أخرى من المقرر نفسه بتطابق تام: كما كانت");
check(sameSlotOf([partnerRow], { ...owner, skipIds: [58] }).count === 0, "ما قالته بطاقة المقرن أو فحص التعارض لا يتكرر");
check(sameSlotOf([partnerRow], { ...owner, days: ["fmonday"] }).count === 0, "يومٌ غير مشترك: لا يُعدّ");
check(sameSlotOf([partnerRow], { ...owner, termId: 99999 }).count === 0, "فصلٌ آخر: لا يُعدّ");
check(sameSlotOf([partnerRow], { ...owner, sectionId: 99 }).count === 0, "قسمٌ آخر: لا يُعدّ");
check(sameSlotOf([partnerRow], { ...owner, collegeId: 4 }).count === 0, "كليةٌ أخرى: لا يُعدّ");
check(sameSlotOf([partnerRow], { ...owner, sectionId: undefined }).count === 0, "قسمٌ مجهول: لا يُجزم بتداخل");
check(sameSlotOf([partnerRow], { ...owner, termId: undefined }).count === 0, "فصلٌ مجهول: لا يُجزم بتداخل");
check(sameSlotOf([partnerRow], { ...owner, courseId: undefined }).count === 0, "بلا مقرر: لا مستوى يُقاس عليه");
check(sameSlotOf([row(58, 58, ["s"], "16:00", "12:00")], owner).count === 0, "صفٌّ نهايته قبل بدايته: لا يُعدّ");
check(sameSlotOf([row(58, 58, ["s"], "", "")], owner).count === 0, "صفٌّ بلا وقت: لا يُعدّ");
r = sameSlotOf([row(58, 58, ["s", "t"], "12:00", "16:00"), row(59, 58, ["m"], "12:00", "16:00")], { ...owner, days: ["fsunday", "ftuesday"] });
check(r.count === 1 && r.days.map(d => d.day).join() === "fsunday,ftuesday", "أيامٌ متعددة: تجميعٌ باليوم والصفُّ مرة واحدة", r.count);
r = sameSlotOf([row(58, 58, ["s"], "12:00", "16:00"), row(60, 39, ["s"], "11:00", "15:00"), row(61, 58, ["s"], "11:00", "15:00")], owner);
check(idsOf(r).join() === "61,58,60" && r.count === 3 && r.partialCount === 1, "الترتيب: مستواه بالتطابق ثم مستواه بالتداخل ثم غيره", idsOf(r));

/* شعبُ المقرر نفسه: تداخلٌ أو قربٌ داخل النافذة، وكليةٌ واحدة. الموعد 11–12 والشعبة 1. */
const near = { ...owner, end: "12:00" };
const section = (id: number, start: string, end: string, extra: Partial<SlotRow> = {}) => row(id, 37, ["s"], start, end, { SCode: "2", ...extra });
check(NEAR_SECTION_MIN_MINUTES === 60 && NEAR_SECTION_MAX_MINUTES === 120, "حدّا النافذة ثابتان مسمّيان: ٦٠ و١٢٠");
check([[60, 60, 60], [120, 60, 60], [180, 60, 90], [60, 180, 90], [240, 60, 120], [300, 300, 120]].every(([a, b, want]) => nearSectionWindow(a, b) === want), "النافذة نصف أطول الجلستين بين الحدّين: ساعة وساعتان ٦٠، ثلاث ٩٠، أربع وخمس ١٢٠");
const shownAt = (query: typeof near, start: string, end: string) => sameSlotOf([section(70, start, end)], query).count;
check(shownAt(near, "12:45", "13:45") === 1, "ساعة مع ساعة وفاصل ٤٥: تُعرض");
check(shownAt(near, "13:15", "14:15") === 0, "ساعة مع ساعة وفاصل ٧٥: لا تُعرض");
const threeHours = { ...owner, start: "09:00", end: "12:00" };
check(shownAt(threeHours, "13:20", "14:20") === 1, "ثلاث ساعات مع ساعة وفاصل ٨٠: تُعرض");
check(shownAt(threeHours, "13:40", "14:40") === 0, "ثلاث ساعات مع ساعة وفاصل ١٠٠: لا تُعرض");
check(shownAt({ ...owner, start: "13:20", end: "14:20" }, "09:00", "12:00") === 1, "والجلسة الطويلة هي الأخرى: النافذة نفسها");
const fiveHours = { ...owner, start: "08:00", end: "13:00" };
check(shownAt(fiveHours, "14:50", "19:50") === 1, "خمس ساعات مع خمس وفاصل ١١٠: تُعرض");
check(shownAt(fiveHours, "15:10", "20:10") === 0, "خمس ساعات مع خمس وفاصل ١٣٠: لا تُعرض");
r = sameSlotOf([section(70, "12:30", "13:30")], near);
check(r.count === 1 && r.sectionCount === 1 && r.days[0].items[0].kind === "near" && r.days[0].items[0].sameCourse && !r.days[0].items[0].sameLevel, "المقرر نفسه 11–12 مع 12:30–13:30: تُعرض قريبة", r);
check(sameSlotOf([section(70, "13:30", "14:30")], near).count === 0, "فاصل ٩٠ دقيقة: لا تُعرض");
check(sameSlotOf([section(70, "13:00", "14:00")], near).days[0]?.items[0].kind === "near", "فاصل ٦٠ دقيقة بالضبط: قريبة");
check(sameSlotOf([section(70, "13:01", "14:00")], near).count === 0, "فاصل ٦١ دقيقة: لا تُعرض");
check(sameSlotOf([section(70, "09:30", "10:30")], near).days[0]?.items[0].kind === "near", "قبل الموعد بنصف ساعة: قريبة");
check(sameSlotOf([section(70, "12:00", "13:00")], near).days[0]?.items[0].kind === "near", "شعبتان متلاصقتان: قريبة");
r = sameSlotOf([section(70, "11:30", "12:30")], near);
check(r.sectionCount === 1 && r.days[0].items[0].kind === "partial" && r.days[0].items[0].sameCourse, "شعبةٌ متداخلة جزئياً: تُعرض بوقتها");
check(sameSlotOf([section(70, "12:30", "13:30", { AdCollegeId: 4 })], near).count === 0, "كليةٌ أخرى: لا تُعرض");
check(sameSlotOf([section(70, "12:30", "13:30", { AdSectionId: 8 })], near).count === 0, "قسمٌ آخر: لا تُعرض");
check(sameSlotOf([section(70, "12:30", "13:30", { AdTermId: 1 })], near).count === 0, "فصلٌ آخر: لا تُعرض");
check(sameSlotOf([section(70, "12:30", "13:30")], { ...near, days: ["fmonday"] }).count === 0, "يومٌ غير مشترك: لا تُعرض");
check(sameSlotOf([section(70, "12:30", "13:30")], { ...near, collegeId: undefined }).count === 0, "كليةٌ مجهولة: لا يُجزم");
check(sameSlotOf([section(70, "12:30", "13:30", { SCode: "1" })], near).count === 0, "صفٌّ آخر من الشعبة نفسها (مختبر): ليس شعبةً أخرى");
check(sameSlotOf([section(70, "11:30", "12:30")], { ...near, skipIds: [70] }).count === 0, "ما قالته ملاحظة «شعبة … من المقرر نفسه» لا يتكرر");
check(sameSlotOf([row(71, 58, ["s"], "12:30", "13:30")], near).count === 0, "مقررٌ آخر من مستواه بفاصل ٣٠ دقيقة: لا يُعرض");
check(sameSlotOf([row(71, 39, ["s"], "12:30", "13:30")], near).count === 0, "مقررٌ من مستوى آخر بفاصل ٣٠ دقيقة: لا يُعرض");
r = sameSlotOf([section(70, "12:30", "13:30"), row(72, 58, ["s"], "11:30", "12:30"), row(73, 39, ["s"], "11:00", "12:00")], near);
check(idsOf(r).join() === "70,72,73" && r.count === 3 && r.partialCount === 1 && r.sectionCount === 1, "الترتيب: شعب المقرر ثم مستواه ثم غيرهما", idsOf(r));
r = sameSlotOf([row(74, 58, ["s"], "11:00", "11:30"), row(75, 40, ["s"], "12:00", "16:00")], owner);
check(idsOf(r).join() === "75,74", "الأطول تداخلاً أولاً: لا يخفيه سقف الستة", idsOf(r));

/* الربط في الواجهة. */
const read = (file: string) => fs.readFileSync(file, "utf8");
const quick = read("src/components/QuickCreatePopover.tsx"), sched = read("src/components/Schedules.tsx"), hint = read("src/components/SameSlotHint.tsx");
check(quick.includes("<SameSlotHint") && sched.includes("<SameSlotHint"), "الشارة في البطاقة السريعة وفي المحرر الكامل");
check(sched.includes("excludeId={editId}"), "المحرر يستثني الموعد المعدَّل");
check(quick.includes('document.querySelector(".same-slot-sheet")'), "Esc في البطاقة يُهمل ما دامت الورقة مفتوحة");
check(!/AdRoomCode|AdRoomHall|roomId/.test(hint), "الورقة لا تعرض قاعاتٍ أبداً");
check(hint.includes('<strong dir="ltr">{time}</strong>') && hint.includes("formatScheduleTimeRange(row.fstarttime, row.fendtime)"), "صفُّ التداخل يعرض وقته هو معزولاً LTR");
check(/countOf\(partialCount, AR\.course\)/.test(hint) && /countOf\(sectionCount, AR\.section\)/.test(hint), "الوصف المقروء يعدّ بـcountOf");
check(hint.includes("<em>قريبة</em>") && hint.includes("near ? null"), "القريبة بوسمٍ مميز وبلا لون تداخل");
check(/role="dialog"/.test(hint) && /aria-labelledby/.test(hint) && /aria-label=\{label\}/.test(hint), "حوارٌ معنوَن وزرٌّ بوصفٍ مقروء");
check((hint.match(/fetch\(/g) || []).length === 1 && hint.includes("/api/schedules/coreq-pairs") && hint.includes("pairsCache"), "طلبٌ واحد مخبَّأ لكل قسم (المقرنات) وما سواه من الصفوف المحمّلة");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
