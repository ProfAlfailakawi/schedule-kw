/**
 * ── «في الوقت نفسه»: التطابق التام فقط ─────────────────────────────────────────
 * الحالات: الوقتُ نفسه نعم؛ التداخلُ الجزئي والتلاصق لا؛ يومٌ آخر لا؛ الموعدُ المعدَّل لا يُعدّ نفسَه؛
 * أيامٌ متعددة؛ السقف والترتيب؛ «نفس المستوى» أولاً؛ وما سمّاه فحصُ التعارض لا يتكرر.
 */
import fs from "node:fs";
import { capSameSlot, levelOfCode, sameSlotOf, slotMinutes, type SlotRow } from "../src/utils/sameSlot";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 600)); }
};

const codes: Record<number, string> = { 1: "0109105", 2: "0109106", 3: "0109205", 4: "0109301", 5: "0109107" };
const codeOf = (id: number) => codes[id] ?? `01091${String(id).padStart(2, "0")}`;
const row = (id: number, courseId: number, days: string[], start: string, end: string, extra: Partial<SlotRow> = {}): SlotRow => ({
  id, AdCourseId: courseId, AdSectionId: 7, AdTermId: 20261, SCode: String(id),
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

/* الربط في الواجهة. */
const read = (file: string) => fs.readFileSync(file, "utf8");
const quick = read("src/components/QuickCreatePopover.tsx"), sched = read("src/components/Schedules.tsx"), hint = read("src/components/SameSlotHint.tsx");
check(quick.includes("<SameSlotHint") && sched.includes("<SameSlotHint"), "الشارة في البطاقة السريعة وفي المحرر الكامل");
check(sched.includes("excludeId={editId}"), "المحرر يستثني الموعد المعدَّل");
check(quick.includes('document.querySelector(".same-slot-sheet")'), "Esc في البطاقة يُهمل ما دامت الورقة مفتوحة");
check(!/AdRoomCode|AdRoomHall|roomId/.test(hint), "الورقة لا تعرض قاعاتٍ أبداً");
check(/role="dialog"/.test(hint) && /aria-labelledby/.test(hint) && /aria-label=\{label\}/.test(hint), "حوارٌ معنوَن وزرٌّ بوصفٍ مقروء");
check((hint.match(/fetch\(/g) || []).length === 1 && hint.includes("/api/schedules/coreq-pairs") && hint.includes("pairsCache"), "طلبٌ واحد مخبَّأ لكل قسم (المقرنات) وما سواه من الصفوف المحمّلة");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
