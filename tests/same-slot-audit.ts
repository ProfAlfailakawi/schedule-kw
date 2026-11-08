/**
 * ── «في الوقت نفسه»: التطابق التام، والتداخل الجزئي لأقران الصحيفة ─────────────
 * الحالات: الوقتُ نفسه نعم؛ التداخلُ الجزئي للأقران نعم ولغيرهم لا؛ التلاصق لا؛ يومٌ آخر لا؛ الموعدُ المعدَّل لا يُعدّ نفسَه؛
 * الشعبةُ بندٌ واحد؛ السقف والترتيب؛ «تفتح» أولاً؛ وما سمّاه فحصُ التعارض لا يتكرر.
 */
import fs from "node:fs";
import { capCourseRows, capSameSlot, conflictSkipIds, isPracticeRow, NEAR_SECTION_MAX_MINUTES, NEAR_SECTION_MIN_MINUTES, nearSectionWindow, SAME_SLOT_SECTION_BARS, SAME_SLOT_VISIBLE_ROWS, sameSlotGroups, sameSlotOf, sameSlotSheet, sectionCodeKey, slotMinutes, visibleSections, type SlotRow } from "../src/utils/sameSlot";
import { sameLevelLookup, unlockLookup } from "../src/utils/planPeers";
import { sameCourseSectionClash } from "../src/utils/scheduleRegulations";
import { isBlockingConflict } from "../src/utils/scheduleIntelligence";
import { reservationRows } from "../src/utils/instructorRequestReservations";

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
const idsOf = (result: ReturnType<typeof sameSlotOf>) => result.items.map(i => Number(i.row.id));

let r = sameSlotOf(rows, { ...base });
check(r.count === 3 && r.items.length === 3, "الوقت نفسه تماماً: ثلاثة مواعيد", r.count);
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

/* أيام متعددة: الشعبةُ بندٌ واحد بأيامها. */
r = sameSlotOf(rows, { ...base, days: ["fsunday", "ftuesday"] });
check(r.count === 3 && r.items.find(i => i.row.id === 10)?.days.join() === "fsunday,ftuesday" && r.items.find(i => i.row.id === 11)?.days.join() === "fsunday", "الصفّ ذو اليومين بندٌ واحد بأيامه", r.count);
check(sameSlotOf(rows, { days: ["ftuesday", "fsunday"], start: "10:00", end: "10:50" }).items[0].days.join() === "fsunday,ftuesday", "ترتيب الأيام لا يتبع ترتيب الاختيار");
const threeDays = [row(20, 3, ["s"], "10:00", "10:50", { SCode: "01" }), row(21, 3, ["t"], "10:00", "10:50", { SCode: "01" }), row(22, 3, ["h"], "10:00", "10:50", { SCode: "01" }), row(23, 3, ["t"], "10:00", "10:50", { SCode: "02" })];
r = sameSlotOf(threeDays, { ...base, days: ["fsunday", "ftuesday", "fthursday"] });
check(r.count === 2 && r.items[0].days.length === 3 && r.items[1].days.join() === "ftuesday", "شعبةٌ في ثلاثة صفوف بندٌ واحد، والشعبة الأخرى بندها", r.count);

/* نفس المستوى من الصحيفة وحدها: الرمز لا يقرّر شيئاً. */
const levels = (...groups: number[][]) => groups.map(courseIds => ({ courseIds, blocked: [] }));
const peers = sameLevelLookup(levels([1, 2, 5]));
r = sameSlotOf(rows, { ...base, courseId: 2, sectionId: 7, codeOf, sameLevel: peers });
check(idsOf(r).join() === "11,10,12" && r.items.filter(i => i.sameLevel).length === 1, "قرينه أولاً ثم الباقي برقم المقرر", idsOf(r));
r = sameSlotOf(rows, { ...base, courseId: 4, sectionId: 7, codeOf });
check(r.items.every(i => !i.sameLevel), "بلا بيانات صحيفة: لا «نفس المستوى» ولو تشابهت الرموز");
r = sameSlotOf(rows, { ...base, courseId: 3, sectionId: 7, codeOf, sameLevel: sameLevelLookup(levels([3, 1, 12])) });
check(idsOf(r).join() === "10,11,12" && r.items[0].sameCourse && !r.items[0].sameLevel, "شعبتُه نفسها بالتطابق: ليست «نفس المستوى»", idsOf(r));
r = sameSlotOf(rows, { ...base, courseId: 2, sectionId: 99, codeOf, sameLevel: peers });
check(r.items.every(i => !i.sameLevel), "قسمٌ آخر: ليس «نفس المستوى»");
r = sameSlotOf(rows, { ...base });
check(r.items.every(i => !i.sameLevel) && idsOf(r).join() === "10,11,12", "بلا مقرر: لا تعليم والترتيب ثابت", idsOf(r));

/* السقف. */
const many: SlotRow[] = Array.from({ length: 9 }, (_, i) => row(100 + i, 1 + i, ["s", "t"], "08:00", "08:50"));
r = sameSlotOf(many, { days: ["fsunday", "ftuesday"], start: "08:00", end: "08:50" });
check(r.count === 9, "تسعة مواعيد في يومين: تسعة بنود", r.count);
let c = capSameSlot(r.items);
check(SAME_SLOT_VISIBLE_ROWS === 4 && c.items.length === 4 && c.hidden === 5, "السقف ٤ بنود والباقي عدداً", c.hidden);
c = capSameSlot(sameSlotOf(rows, { ...base }).items);
check(c.hidden === 0 && c.items.length === 3, "تحت السقف: لا «+»");

/* تداخلٌ جزئي: حالة المالك بأرقامها. 0109237 و0109258 و40 في مجموعة مستوى؛ والمقرر 39 خارجها، وكذلك 41 برقمٍ من المئة نفسها. */
const ownerCodes: Record<number, string> = { 37: "0109237", 58: "0109258", 39: "0109359", 40: "109240", 41: "0109215" };
const ownerCodeOf = (id: number) => ownerCodes[id];
const owner = { days: ["fsunday" as const], start: "11:00", end: "15:00", courseId: 37, sectionId: 7, termId: 20261, collegeId: 3, scode: "1", codeOf: ownerCodeOf, sameLevel: sameLevelLookup(levels([37, 58, 40])) };
const partnerRow = row(58, 58, ["s"], "12:00", "16:00");

r = sameSlotOf([partnerRow], owner);
check(r.count === 1 && r.partialCount === 1 && r.items[0].kind === "partial" && r.items[0].sameLevel, "حالة المالك: 11–15 مع 12–16 من مستواه تُعدّ", r);
check(sameSlotOf([row(58, 39, ["s"], "12:00", "16:00")], owner).count === 0, "مستوى مختلف بالأوقات نفسها: لا يُعدّ");
check(sameSlotOf([row(58, 58, ["s"], "12:00", "16:00")], { ...owner, start: "11:00", end: "12:00" }).count === 0, "تلاصق 11–12 مع 12–16: لا يُعدّ");
check(sameSlotOf([row(58, 58, ["s"], "15:00", "16:00")], owner).count === 0, "تلاصقٌ من الجهة الأخرى: لا يُعدّ");
r = sameSlotOf([partnerRow], { ...owner, start: "12:00", end: "16:00" });
check(r.count === 1 && r.partialCount === 0 && r.items[0].kind === "exact" && r.items[0].sameLevel, "الوقت نفسه من مستواه: تطابقٌ تام كما كان");
r = sameSlotOf([row(58, 39, ["s"], "11:00", "15:00")], owner);
check(r.count === 1 && r.partialCount === 0 && !r.items[0].sameLevel, "مستوى مختلف بتطابق تام: يبقى كما كان");
check(sameSlotOf([row(58, 58, ["s"], "12:00", "13:00")], owner).partialCount === 1, "محتوى داخل وقت الموعد: تداخل");
check(sameSlotOf([row(58, 58, ["s"], "10:00", "17:00")], owner).partialCount === 1, "يحتوي وقت الموعد: تداخل");
check(sameSlotOf([row(58, 41, ["s"], "12:00", "16:00")], owner).count === 0, "رقمٌ من المئة نفسها خارج الصحيفة (الورشة 215): لا يُعدّ");
r = sameSlotOf([row(58, 41, ["s"], "11:00", "15:00")], owner);
check(r.count === 1 && !r.items[0].sameLevel && !r.items[0].unlock, "والورشة بالتطابق التام: صفٌّ عادي بلا وسم");
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
check(r.count === 1 && r.items[0].days.join() === "fsunday,ftuesday", "أيامٌ متعددة: بندٌ واحد بأيامه المشتركة", r.count);
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
check(r.count === 1 && r.sectionCount === 1 && r.items[0].kind === "near" && r.items[0].sameCourse && !r.items[0].sameLevel, "المقرر نفسه 11–12 مع 12:30–13:30: تُعرض قريبة", r);
check(sameSlotOf([section(70, "13:30", "14:30")], near).count === 0, "فاصل ٩٠ دقيقة: لا تُعرض");
check(sameSlotOf([section(70, "13:00", "14:00")], near).items[0].kind === "near", "فاصل ٦٠ دقيقة بالضبط: قريبة");
check(sameSlotOf([section(70, "13:01", "14:00")], near).count === 0, "فاصل ٦١ دقيقة: لا تُعرض");
check(sameSlotOf([section(70, "09:30", "10:30")], near).items[0].kind === "near", "قبل الموعد بنصف ساعة: قريبة");
check(sameSlotOf([section(70, "12:00", "13:00")], near).items[0].kind === "near", "شعبتان متلاصقتان: قريبة");
r = sameSlotOf([section(70, "11:30", "12:30")], near);
check(r.sectionCount === 1 && r.items[0].kind === "partial" && r.items[0].sameCourse, "شعبةٌ متداخلة جزئياً: تُعرض بوقتها");
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

/* «تفتح»: 37 و58 يفتحان 90، و37 و47 يفتحان 91؛ والمستوى يجمع 37 و48. */
const unlockGroups = [{ nextCourseId: 90, nextCourseName: "تصميم وإنتاج المجسمات والعرائس", courseIds: [37, 58], blocked: [] }, { nextCourseId: 91, nextCourseName: "التلفزيون التعليمي (1)", courseIds: [37, 47, 58], blocked: [] }];
const opens = { ...owner, sameLevel: sameLevelLookup(levels([37, 58, 48])), unlockOf: unlockLookup(unlockGroups) };
r = sameSlotOf([row(80, 48, ["s"], "12:00", "16:00"), row(81, 47, ["s"], "14:00", "16:00"), partnerRow], opens);
check(idsOf(r).join() === "58,81,80", "«تفتح» أولاً وأقربها، قبل المستوى", idsOf(r));
check(r.items[0].unlock?.names.join("|") === "المجسمات والعرائس|التلفزيون التعليمي (1)" && !r.items[0].sameLevel, "صفٌّ بالعلاقتين: «تفتح» وحدها", r.items[0]);
check(r.items[2].sameLevel && !r.items[2].unlock, "وصفُّ المستوى يبقى مستوى");
check(sameSlotOf([row(81, 47, ["s"], "15:00", "16:00")], opens).count === 0, "قرينان متلاصقان: لا يُعدّان");
check(sameSlotOf([row(81, 47, ["s"], "14:00", "16:00")], { ...opens, sameLevel: undefined }).partialCount === 1, "«تفتح» وحدها تكفي للتداخل بلا مستوى");
check(sameSlotOf([row(81, 47, ["s"], "15:30", "16:30")], opens).count === 0, "قرينان بفاصل قصير: لا يُعدّان");
check(sameSlotOf([row(81, 47, ["s"], "14:00", "16:00", { AdCollegeId: 4 })], opens).count === 0, "كليةٌ أخرى: لا يُعدّ");

/* نطاقُ الموعد يحكم كلَّ الفروع، والتطابقُ التام أيضاً. */
const exactOf = (extra: Partial<SlotRow>, query: object = {}) => sameSlotOf([row(90, 99, ["s"], "11:00", "15:00", extra)], { ...owner, ...query });
check(exactOf({ AdSectionId: 8 }).count === 0, "تطابقٌ تام من قسمٍ آخر: لا يُعدّ");
check(exactOf({ AdCollegeId: 4 }).count === 0, "تطابقٌ تام من كليةٍ أخرى: لا يُعدّ");
check(sameSlotOf([row(90, 37, ["s"], "11:00", "15:00", { AdSectionId: 8 })], owner).count === 0, "شعبةٌ من المقرر نفسه في قسمٍ آخر بالوقت نفسه: لا تُعدّ");
check(exactOf({ AdSectionId: undefined }).count === 1 && exactOf({ AdCollegeId: undefined }).count === 1, "صفٌّ بلا قسم أو بلا كلية بالتطابق التام: يبقى كما كان");
check(exactOf({ AdSectionId: 8 }, { sectionId: undefined }).count === 1 && exactOf({ AdCollegeId: 4 }, { collegeId: undefined }).count === 1, "موعدٌ لم يُعرف قسمه أو كليته بعد: لا يُسكَت عن شيء");
check(exactOf({ AdSectionId: "7", AdCollegeId: "3" } as any).count === 1, "الأرقام نصوصاً تُقارن أرقاماً");

/* إخوةُ الشعبة الجارية ليسوا شعبةً أخرى، ولو طابقوا الوقت (المحرر يعدّل صفاً من ثلاثة). */
const siblings = [row(95, 37, ["s"], "11:00", "15:00", { SCode: "1" }), row(96, 37, ["t"], "11:00", "15:00", { SCode: " 1 " }), row(97, 37, ["h"], "11:00", "15:00", { SCode: "1" })];
r = sameSlotOf(siblings, { ...owner, days: ["fsunday", "ftuesday", "fthursday"], excludeId: 95 });
check(r.count === 0, "نمطُ الأيام الثلاثة: إخوةُ الصف المعدَّل لا يظهرون شعبةً أخرى", idsOf(r));
r = sameSlotOf([row(98, 37, ["s"], "11:00", "15:00", { SCode: "2" })], owner);
check(r.count === 1 && r.items[0].sameCourse, "وشعبةٌ أخرى حقاً بالوقت نفسه تبقى");
check(sameSlotOf(siblings, { ...owner, scode: "", days: ["fsunday"] }).count === 1, "رقمُ الشعبة لم يُكتب بعد: لا يُسكَت عن شيء");

/* صفٌّ بلا قسم لا يُوصف بعلاقةٍ لا يُعرف نطاقها. */
r = sameSlotOf([row(99, 58, ["s"], "11:00", "15:00", { AdSectionId: undefined })], opens);
check(r.count === 1 && !r.items[0].sameLevel && !r.items[0].unlock, "صفٌّ بلا قسم بالتطابق التام: يُعرض بلا وسم", r.items[0]);
r = sameSlotOf([row(99, 58, ["s"], "11:00", "15:00")], { ...opens, sectionId: undefined });
check(r.count === 1 && !r.items[0].sameLevel && !r.items[0].unlock, "موعدٌ بلا قسم: لا وسم");

/* صفّان بلا مقرر لا يندمجان ولو تساوى رقم الشعبة. */
r = sameSlotOf([row(101, 0, ["s"], "11:00", "15:00", { AdCourseId: undefined, SCode: "1" }), row(102, 0, ["t"], "11:00", "15:00", { AdCourseId: undefined, SCode: "1" })], { ...owner, days: ["fsunday", "ftuesday"] });
check(r.count === 2, "صفّان بلا مقرر بندان منفصلان", idsOf(r));
r = sameSlotOf([row(101, 58, ["s"], "11:00", "15:00", { SCode: "1" }), row(102, 58, ["t"], "11:00", "15:00", { SCode: "1" })], { ...owner, scode: "9", days: ["fsunday", "ftuesday"] });
check(r.count === 1 && r.items[0].days.length === 2, "وصفّا الشعبة الواحدة يبقيان بنداً واحداً");

/* الربط في الواجهة. */
const read = (file: string) => fs.readFileSync(file, "utf8");
const quick = read("src/components/QuickCreatePopover.tsx"), sched = read("src/components/Schedules.tsx"), hint = read("src/components/SameSlotHint.tsx");
check(quick.includes("<SameSlotHint") && sched.includes("<SameSlotHint"), "الشارة في البطاقة السريعة وفي المحرر الكامل");
check(sched.includes("excludeId={editId}"), "المحرر يستثني الموعد المعدَّل");
check(quick.includes('document.querySelector(".same-slot-sheet")'), "Esc في البطاقة يُهمل ما دامت الورقة مفتوحة");
check(!/AdRoomCode|AdRoomHall|roomId/.test(hint), "الورقة لا تعرض قاعاتٍ أبداً");
check(hint.includes('<strong dir="ltr">{time}</strong>') && hint.includes("formatScheduleTimeRange(row.fstarttime, row.fendtime)"), "صفُّ التداخل يعرض وقته هو معزولاً LTR");
check(/countOf\(partialCount, oblique\(AR\.course\)\)/.test(hint) && /countOf\(sectionCount, AR\.section\)/.test(hint), "الوصف المقروء يعدّ بـcountOf");
const css = read("src/styles/51-same-slot.css");
check(/const TAKEN_TOGETHER = "تُؤخذ معًا";/.test(hint) && (hint.match(/تُؤخذ معًا/g) || []).length === 1 && !hint.includes("نفس المستوى") && !hint.includes("طلبة مشتركون"), "وسم المجموعة ثابتٌ واحد بلا جملة");
check(/\.same-slot-time\{white-space:nowrap\}/.test(css), "وقت العنوان لا ينكسر");
check(hint.includes("تفتح: <b>") && hint.includes("LockOpen"), "سطر «تفتح» بقفلٍ مفتوح واسم المقرر التالي");
check(hint.includes("SHEET_CEILING") && hint.includes("maxHeight: pos.maxHeight"), "الورقة لا تغطي الترويسة وتُمرَّر من داخلها");
check(hint.includes("<em>قريبة</em>") && hint.includes("near ? null"), "القريبة بوسمٍ مميز وبلا لون تداخل");
check(/role="dialog"/.test(hint) && /aria-labelledby/.test(hint) && /aria-label=\{label\}/.test(hint), "حوارٌ معنوَن وزرٌّ بوصفٍ مقروء");
check(!/fetch\(/.test(hint) && hint.includes("loadPlanFacts(collegeId, sectionId)") && read("src/utils/planFactsCache.ts").includes("/api/schedules/coreq-pairs"), "طلبٌ واحد مخبَّأ لكل قسم (المقرنات) وما سواه من الصفوف المحمّلة");
check(hint.includes("key={group.key}") && hint.includes("key={courseRow.key}"), "مفاتيحُ المجموعات والصفوف من مفاتيحها الفريدة (تُختبر أدناه)");
check(!hint.includes("مما يُؤخذ معه") && hint.includes("من أقرانه في الصحيفة"), "الوصف المقروء يصدق على «تفتح» و«تُؤخذ معًا» معاً");
const app = read("src/App.tsx");
check(/forgetTrailStamps\(\);\s*forgetWarmStarts\(\);\s*forgetPlanFacts\(\);/.test(app) && !/from "\.\/components\/SameSlotHint"/.test(app), "الخروج يمحو حقائق الصحيفة، بلا سحب الشارة إلى الحزمة الأولى");

/* ── ملاحظات المراجعة ── */
/* «01» و«1» شعبةٌ واحدة: مفتاحٌ واحد في كل مكان، ولا يُغيّر المخزون ولا المعروض. */
check(sectionCodeKey("01") === "1" && sectionCodeKey(" 1 ") === "1" && sectionCodeKey("٠١") === "1" && sectionCodeKey("۰۱") === "1", "رقمُ الشعبة: تقليم، أرقامٌ لاتينية، بلا أصفار بادئة", sectionCodeKey("٠١"));
check(sectionCodeKey("0") === "0" && sectionCodeKey("00") === "0" && sectionCodeKey("") === "" && sectionCodeKey(null) === "", "الصفر يبقى صفراً، والفارغ فارغاً");
check(sectionCodeKey("01A") === "01A" && sectionCodeKey(" م1 ") === "م1" && sectionCodeKey("reservation:0") === "reservation:0", "الرمزُ غير الرقمي يبقى كما هو");
{
  const q = { days: ["fsunday" as const], start: "10:00", end: "11:00", courseId: 2, sectionId: 7, termId: 20261, collegeId: 3, scode: "01" };
  check(sameSlotOf([row(90, 2, ["s"], "10:00", "11:00", { SCode: "1" })], q).count === 0, "«1» ليست شعبةً أخرى من «01»");
  check(sameSlotOf([row(90, 2, ["s"], "11:15", "12:15", { SCode: "٠١" })], q).count === 0, "ولا «٠١» قريبةً منها");
  check(sameSlotOf([row(90, 2, ["s"], "11:15", "12:15", { SCode: "2" })], q).sectionCount === 1, "والشعبةُ الأخرى حقاً تبقى");
  const twoRows = sameSlotOf([row(91, 3, ["s"], "10:00", "11:00", { SCode: "01" }), row(92, 3, ["t"], "10:00", "11:00", { SCode: "1" })], { ...q, days: ["fsunday", "ftuesday"], courseId: 4, scode: "" });
  check(twoRows.count === 1 && twoRows.items[0].days.length === 2 && twoRows.items[0].row.SCode === "01", "الصفّان «01» و«1» بندٌ واحد، والرقمُ يبقى كما خُزّن", twoRows.items);
  const near = sameSlotOf([row(93, 2, ["s"], "11:15", "12:15", { SCode: "02" }), row(94, 2, ["t"], "11:15", "12:15", { SCode: "2" })], { ...q, days: ["fsunday", "ftuesday"] });
  check(near.count === 1 && near.sectionCount === 1 && near.items[0].kind === "near" && near.items[0].days.length === 2, "الشعبةُ القريبة المدموجة تبقى «near» فيبقى وسمُها", near.items);
}
const sheetSource = fs.readFileSync("src/components/SameSlotHint.tsx", "utf8");
check(sheetSource.includes('near: kind === "near"') && sheetSource.includes("near={courseRow.near}") && sheetSource.includes("{near ? <em>قريبة</em> : null}"), "وسمُ «قريبة» مستقلٌّ عن وقت الصف");

/* ── صفوفُ المقررات: شعبُ المقرر الواحد صفٌّ واحد، ومجموعاتٌ مرئية كلُّها ── */
{
  /* حالة المالك: «الشفافيات» (200) الاثنين 11:00–14:50. اللوحات (201) بثلاث شعب، والصوت (202) يفتحان معه X؛
     والأفلام (203) تفتح معه Y؛ ومبادئ الحاسوب (204) «تُؤخذ معًا». */
  const m = (id: number, course: number, scode: string, start: string, end: string) => row(id, course, ["m"], start, end, { SCode: scode });
  const unlockOf = unlockLookup([
    { nextCourseId: 300, nextCourseName: "المجسمات", courseIds: [200, 201, 202], blocked: [] },
    { nextCourseId: 301, nextCourseName: "التصوير", courseIds: [200, 203], blocked: [] },
  ]);
  const q = { days: ["fmonday" as const], start: "11:00", end: "14:50", courseId: 200, sectionId: 7, termId: 20261, collegeId: 3, scode: "1", unlockOf, sameLevel: sameLevelLookup(levels([200, 204])) };
  const example = [
    m(1, 201, "501", "12:00", "15:50"), m(2, 201, "502", "08:00", "11:50"), m(3, 201, "504", "14:00", "17:50"),
    m(4, 202, "504", "13:00", "15:50"), m(5, 203, "502", "10:00", "12:50"), m(6, 204, "504", "14:00", "16:50"),
  ];
  const res = sameSlotOf(example, q);
  check(res.count === 6, "المثال: ستُّ شعب", res.count);
  let groups = sameSlotGroups(res.items);
  check(groups.map(g => g.kind).join() === "unlock,unlock,level" && groups.reduce((n, g) => n + g.rows.length, 0) === 4, "المثال: أربعة صفوف مقررات في ثلاث مجموعات بترتيبها", groups.map(g => [g.key, g.rows.length]));
  const boards = groups[0].rows.find(r => r.sections[0].row.AdCourseId === 201)!;
  check(boards.sections.length === 3 && !boards.exact && !boards.near, "اللوحات صفٌّ واحد بثلاث شعب");
  check(boards.sections.map(s => `${s.row.SCode}=${s.row.fstarttime}-${s.row.fendtime}`).sort().join() === "501=12:00-15:50,502=08:00-11:50,504=14:00-17:50", "كلُّ شعبةٍ مدموجة تبقى بوقتها", boards.sections.map(s => s.row.SCode));
  check(visibleSections(boards).sections.map(s => s.row.SCode).join() === "501,502,504" && visibleSections(boards).hidden === 0, "الشعبُ المرسومة برقمها");
  const capped = capCourseRows(groups);
  check(capped.hidden === 0 && capped.groups.length === 3 && capped.groups.flatMap(g => g.rows).length === 4, "السقف يعدّ صفوف المقررات: الأربعة ظاهرة ومنها «تُؤخذ معًا»", capped);
  const single = groups[2].rows[0];
  check(single.sections.length === 1 && single.sections[0].row.id === 6 && single.sections[0].sameLevel, "صفٌّ بشعبةٍ واحدة كما كان");
  check(capCourseRows(groups, 3).groups.map(g => g.rows.length).join() === "1,1,1", "سقفٌ أضيق: صفٌّ من كل مجموعة قبل ملء الأولى", capCourseRows(groups, 3).groups.map(g => g.rows.length));

  /* ومعها شعبتان من المقرر نفسه: بالوقت نفسه، وقريبة بعده. */
  const withOwn = [...example, m(7, 200, "2", "11:00", "14:50"), m(8, 200, "3", "15:30", "17:30")];
  groups = sameSlotGroups(sameSlotOf(withOwn, q).items);
  check(groups.map(g => g.kind).join() === "course,unlock,unlock,level", "المقرر نفسه أولاً ثم «تفتح» ثم «تُؤخذ معًا»", groups.map(g => g.kind));
  const own = groups[0].rows;
  check(own.length === 1 && own[0].sections.length === 2 && !own[0].exact && !own[0].near && own[0].sections.map(s => s.kind).sort().join() === "exact,near", "شعبتا المقرر نفسه صفٌّ واحد، كلٌّ بنوعه", own[0]?.sections.map(s => s.kind));
  let sheet = sameSlotSheet(groups);
  check(sheet.tabs.map(t => t.kind).join() === "course,unlock,level" && sheet.view === "all", "الرقائق: نوعٌ لكل مجموعة، و«الكل» أولاً", sheet.tabs);
  check(sheet.groups.map(g => `${g.kind}:${g.rows.length}`).join() === "course:1,unlock:1,unlock:1,level:1" && sheet.hidden === 1, "«الكل»: صفٌّ من كل مجموعة بترتيبها، والباقي عدداً", sheet.groups.map(g => g.rows.length));
  check(sheet.tabs.find(t => t.kind === "course")!.sectionCount === 2 && sheet.tabs.find(t => t.kind === "unlock")!.rowCount === 3, "العدد صادق: شعبُ المقرر نفسه شُعَبٌ، وغيرُها صفوف مقررات");
  sheet = sameSlotSheet(groups, "unlock");
  check(sheet.view === "unlock" && sheet.groups.length === 2 && sheet.groups.flatMap(g => g.rows).length === 3 && sheet.hidden === 0, "رقاقةُ «تفتح»: صفوفُها كلُّها", sheet.groups.map(g => g.rows.length));
  sheet = sameSlotSheet(groups, "course");
  check(sheet.groups.length === 1 && sheet.groups[0].kind === "course", "رقاقةُ المقرر نفسه: مجموعتُه وحدها");
  check(sameSlotSheet(groups, "time").view === "all", "نوعٌ غائب: يعود إلى «الكل»");
  const keys = groups.flatMap(g => [g.key, ...g.rows.map(r => r.key)]);
  check(new Set(keys).size === keys.length && new Set(groups.flatMap(g => g.rows.flatMap(r => r.sections.map(s => String(s.row.id))))).size === 8, "مفاتيحُ React فريدة", keys);

  /* نوعٌ واحد: بلا رقائق، والسقف ٤ ثم «+n» يُفتح في مكانه. */
  const plain = Array.from({ length: 6 }, (_, i) => row(400 + i, 500 + i, ["s"], "08:00", "08:50"));
  const plainGroups = sameSlotGroups(sameSlotOf(plain, { days: ["fsunday"], start: "08:00", end: "08:50" }).items);
  sheet = sameSlotSheet(plainGroups);
  check(sheet.tabs.length === 0 && sheet.groups.flatMap(g => g.rows).length === 4 && sheet.hidden === 2, "نوعٌ واحد: أربعة صفوف و«+٢»", sheet.hidden);
  sheet = sameSlotSheet(plainGroups, "all", true);
  check(sheet.groups.flatMap(g => g.rows).length === 6 && sheet.hidden === 0, "«+n» يُفتح في مكانه");
  const fiveSections = sameSlotGroups(sameSlotOf(["1", "2", "3", "4", "5"].map((code, i) => row(410 + i, 600, ["s"], "08:00", "08:50", { SCode: code })), { days: ["fsunday"], start: "08:00", end: "08:50" }).items);
  check(fiveSections.length === 1 && fiveSections[0].rows.length === 1 && visibleSections(fiveSections[0].rows[0]).sections.length === SAME_SLOT_SECTION_BARS && visibleSections(fiveSections[0].rows[0]).hidden === 2, "خمسُ شعب: ثلاثُ رقائق و«+٢»");
  check(/sectionCount \? <span className="same-slot-dup"/.test(sheetSource) && sheetSource.includes('role="tablist"') && sheetSource.includes('role="tab"') && sheetSource.includes("ArrowLeft"), "وسمُ المقرر نفسه على الشارة، ورقائقُ بأسهم لوحة المفاتيح");
}

/* صفوفُ «وضع تجربة» مؤقتة: خارج التلميح؛ وحجوزُ الطلبات ليست منها. */
{
  const q = { days: ["fsunday" as const], start: "10:00", end: "11:00" };
  check(sameSlotOf([row(-123456, 3, ["s"], "10:00", "11:00")], q).count === 0, "صفُّ التجربة لا يُعدّ في «الوقت نفسه»");
  check(isPracticeRow({ id: -1 }) && isPracticeRow({ id: -999_999_999 }) && !isPracticeRow({ id: 5 }) && !isPracticeRow({ id: 0 }), "معرّفُ التجربة سالبٌ فوق نطاق الحجوز");
  const holds = reservationRows([{ requestId: "r", itemId: "i", instructorId: 1, courseId: 2, collegeId: 3, sectionId: 7, slots: [{ day: "fsunday", start: "10:00", end: "11:00" }], offeringRowIds: [] } as any], 20261);
  check(holds.length === 1 && !isPracticeRow(holds[0]), "صفُّ حجز الطلب ليس صفَّ تجربة", holds);
  check(fs.readFileSync("src/components/Schedules.tsx", "utf8").includes("-Math.max(1, Date.now() % 1_000_000_000)"), "معرّفُ التجربة في نطاقه المتوقَّع");
}

/* صفٌّ بلا فصل لا يُعدّ في فصلٍ مسمّى. */
{
  const q = { days: ["fsunday" as const], start: "10:00", end: "11:00", termId: 20261 };
  check(sameSlotOf([row(95, 3, ["s"], "10:00", "11:00", { AdTermId: undefined })], q).count === 0, "صفٌّ بلا فصل لا يُعدّ تطابقاً حين يُسمّى الفصل");
  check(sameSlotOf([row(95, 3, ["s"], "10:00", "11:00", { AdTermId: undefined })], { ...q, termId: undefined }).count === 1, "وبلا فصلٍ في السؤال يبقى كما كان");
}

/* ما تسمّيه ملاحظةٌ لينة لا يُسقط «تفتح»، والتعارضُ الصريح يبقى بلا تكرار. */
{
  const unlockOf = unlockLookup([{ nextCourseId: 900, nextCourseName: "مشروع", courseIds: [1, 2], blocked: [] }]);
  const q = { days: ["fsunday" as const], start: "10:00", end: "11:00", courseId: 1, sectionId: 7, termId: 20261, collegeId: 3, unlockOf };
  const peer = row(96, 2, ["s"], "10:00", "11:00"), plain = row(97, 3, ["s"], "10:00", "11:00");
  let seen = sameSlotOf([peer, plain], { ...q, softSkipIds: [96, 97] });
  check(seen.items.map(i => i.row.id).join() === "96" && seen.items[0].unlock, "الملاحظةُ اللينة لا تُخفي قرين «تفتح»، وتُخفي غيرَه كما كانت", seen.items.map(i => i.row.id));
  seen = sameSlotOf([peer, plain], { ...q, skipIds: [96], softSkipIds: [96] });
  check(seen.items.map(i => i.row.id).join() === "97", "التعارضُ الصريح يُسقطه ولو سمّته ملاحظةٌ معه", seen.items.map(i => i.row.id));
  const split = conflictSkipIds([
    { type: "instructor", severity: "high", rowId: 1, otherId: 2 },
    { type: "coreq", severity: "low", soft: true, rowId: 3, otherId: 3 },
    { type: "regulation", severity: "low", otherId: 4 },
    { type: "rhythm", soft: true, rowId: 0, otherId: 0 },
  ], isBlockingConflict);
  check(split.skipIds.join() === "1,2" && split.softSkipIds.join() === "3,3,4", "فصلُ معرّفات التعارض: الصريح وحده يُسقط", split);
  for (const file of ["src/components/Schedules.tsx", "src/components/QuickCreatePopover.tsx"]) check(/\{\.\.\.conflictSkipIds\(/.test(fs.readFileSync(file, "utf8")), `${file}: يمرّر الفصل لا القائمة المدموجة`);
  check(/softSkipIds: \[\.\.\.\(query\.softSkipIds \|\| \[\]\), \.\.\.twinIds\]/.test(sheetSource), "ما ترويه بطاقةُ المقرن ملاحظةٌ لينة كذلك");
}

/* تعارض الشعبتين (م.7/5) يقرأ رقم الشعبة بالمفتاح نفسه. */
{
  const own = { id: 1, AdCourseId: 2, AdSectionId: 7, AdCollegeId: 3, SCode: "01", fstarttime: "10:00", fendtime: "11:00", fsunday: true } as any;
  const course = { AdSectionId: 7 };
  check(!sameCourseSectionClash(own, [{ ...own, id: 2, SCode: "1" }], course), "«1» ليست شعبةً أخرى من «01» في تعارض الشعبتين");
  check(!sameCourseSectionClash(own, [{ ...own, id: 2, SCode: "٠١" }], course), "ولا «٠١»");
  check(Boolean(sameCourseSectionClash(own, [{ ...own, id: 2, SCode: "2" }], course)), "والشعبةُ الأخرى حقاً تُقال");
  check(Boolean(sameCourseSectionClash(own, [{ ...own, id: -2_000_000_000, SCode: "reservation:0" }], course)), "وحجزُ طلبٍ يُعدّ شعبةً أخرى");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
