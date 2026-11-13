/**
 * ── «مقترح دراسي» على البند يفتح الموعدَ الأصلي بنموذجه المعتاد (ملاحظة المالك 11) ──
 *
 * سلوكيّ: ما يُحمل من الوارد إلى الجدول (الوقتُ المطلوب، الصلاحية، المحو بأول قراءة)،
 * وما يُعبَّأ في النموذج. وبنيويّ: ضغطةٌ واحدة بلا مساحةٍ أخرى، ومقترحُ الطلب الكامل
 * (المسودة والتثبيت) باقٍ في مكانه.
 */
import fs from "fs";
import { changeFormPatch, openRowNotice, putOpenRow, requestedChangeOf, takeOpenRow } from "../src/utils/requestOpenRow";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const read = (path: string) => fs.readFileSync(path, "utf8");

/* تخزينُ تبويبٍ مصطنع */
const store = new Map<string, string>();
(globalThis as any).window = {
  sessionStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
  },
};

/* ── الوقتُ المطلوب ─────────────────────────────────────────────────────── */
const change = requestedChangeOf({ action: "change", slots: [
  { day: "fmonday", start: "12:00", end: "13:20" }, { day: "fwednesday", start: "12:00", end: "13:20" },
] });
check(JSON.stringify(change) === JSON.stringify({ days: ["fmonday", "fwednesday"], start: "12:00", end: "13:20" }), "يُقرأ الوقتُ المطلوب بأيامه بترتيب الأسبوع");
check(requestedChangeOf({ action: "change", slots: [{ day: "fsunday", days: ["fsunday", "ftuesday"], start: "8:00", end: "8:50" }] })?.days.join(",") === "fsunday,ftuesday", "فترةٌ تحمل أياماً عدّة تُقرأ أيامُها كلُّها");
check(requestedChangeOf({ action: "change", slots: [{ day: "fsunday", start: "8:00", end: "8:50" }, { day: "ftuesday", start: "9:00", end: "9:50" }] }) === null, "أوقاتٌ تختلف بين الأيام: لا تُعبّأ ويُفتح الموعد كما هو");
check(requestedChangeOf({ action: "delete", slots: [{ day: "fsunday", start: "8:00", end: "8:50" }] }) === null, "الحذف لا يحمل وقتاً");
check(requestedChangeOf({ action: "change", slots: [{ day: "fsunday", start: "8", end: "8:50" }] }) === null, "وقتٌ مشوّه لا يُعبّأ");

/* ── الحملُ من الشاشة إلى الشاشة ───────────────────────────────────────── */
putOpenRow({ rowId: 42, change: change!, teacher: "د. أحمد" });
const taken = takeOpenRow();
check(taken?.rowId === 42 && taken?.change?.start === "12:00" && taken?.teacher === "د. أحمد", "يصل رقمُ الصفّ والوقتُ واسمُ الأستاذ");
check(takeOpenRow() === null, "يُمحى بأوّل قراءة — فتحُ الجدول بعده لا يفتح الموعد");
store.set("schedule:open-row", JSON.stringify({ rowId: 42, at: Date.now() - 11 * 60 * 1000 }));
check(takeOpenRow() === null, "بذرةٌ قديمة (أكثر من عشر دقائق) لا تُزرع");
store.set("schedule:open-row", JSON.stringify({ rowId: "x", at: Date.now() }));
check(takeOpenRow() === null, "رقمُ صفٍّ مشوّه يُرفض");
store.set("schedule:open-row", JSON.stringify({ rowId: 7, at: Date.now(), change: { days: ["fmonday", "fsaturday"], start: "12:00", end: "13:20" } }));
check(takeOpenRow()?.change?.days.join(",") === "fmonday", "يومٌ خارج أيام الجدول يُسقط");
store.set("schedule:open-row", JSON.stringify({ rowId: 7, at: Date.now() }));
check(takeOpenRow()?.change === undefined, "بلا وقتٍ مطلوب: يُفتح الموعد كما هو");

/* ── ما يُعبَّأ في النموذج ─────────────────────────────────────────────── */
const patch = changeFormPatch(change!);
check(patch.fmonday === true && patch.fwednesday === true && patch.fsunday === false && patch.ftuesday === false && patch.fthursday === false, "الأيامُ المطلوبة وحدها مختارة");
check(patch.fstarttime === "12:00" && patch.fendtime === "13:20", "البدايةُ والنهايةُ المطلوبتان");
const notice = openRowNotice({ rowId: 1, change: change!, teacher: "د. أحمد", at: Date.now() }, { fmonday: "الاثنين", fwednesday: "الأربعاء" });
check(/د\. أحمد/.test(notice) && /الاثنين · الأربعاء 12:00–13:20/.test(notice), "سطرٌ يقول ما عُبّئ ومن أين");
check(!/قاعة/.test(notice), "السطرُ لا يذكر قاعة");

/* ── ضغطةٌ واحدة بلا مساحةٍ أخرى ────────────────────────────────────────── */
const inbox = read("src/components/InstructorInbox.tsx");
check(!/افتح الموعد في الجدول/.test(inbox), "لا زرَّ ثانياً «افتح الموعد في الجدول»");
check(!/onProposal/.test(inbox), "البندُ لم يعد يفتح مساحة المقترح");
check(/onOpenInSchedule=\{\(\) => onOpenInSchedule\(row, index\)\}/.test(inbox) && /data-guide-target="proposal-from-thread"/.test(inbox), "«مقترح دراسي» على كل بندٍ يفتح الجدول");
check(/if \(item\.action === "change"\) \{ openRowInSchedule\(Number\(item\.rowId\), item, row\.instructorName\); return; \}/.test(inbox), "التغيير: الموعدُ الأصلي");
check(/putHandoff\(\{\s*requestId: row\.id, requestRevision: row\.requestRevision \|\| 0, itemIndex: index/.test(inbox.slice(inbox.indexOf("const openItemInSchedule"))), "الإضافة: نموذجُ الإضافة المعتاد ببذرته (ويُسجَّل القرار عند الحفظ)");
check(/opensInSchedule\(item\) && decided !== "fixed"/.test(inbox), "لا يظهر على بندٍ ثُبّت");
/* مقترحُ الطلب الكامل باقٍ: مسودةٌ تُرسل للأستاذ ثم تُثبّت */
check(/data-guide-target="proposal-start"/.test(inbox) && /<StudyProposalWorkspace/.test(inbox) && /<ProposalLauncherBar/.test(inbox), "مقترحُ الطلب الكامل (المسودة والتثبيت) باقٍ");
const schedules = read("src/components/Schedules.tsx");
check(/openRowChange\.current = wanted\.change \? \{ rowId: id, change: wanted\.change \} : null;\s*openEdit\(row\);/.test(schedules), "الجدول يفتح النموذج المعتاد للموعد الأصلي");
check(/if \(!pending \|\| editor !== "edit" \|\| Number\(editId\) !== pending\.rowId\) return;[\s\S]{0,120}changeFormPatch\(pending\.change\)/.test(schedules), "ويعبّئ الوقتَ بعد أن يُفتح فعلاً — ولا يعبّئ نموذجاً لم يُفتح");
check(/openEdit = \(row: FSchedule\) => \{\s*if \(showMobileReadOnlyGate\(\) \|\| lockRefusesEdit\(\)\) return;/.test(schedules), "فتحُ التعديل يفحص القفلَ قبل المحرر كما كان");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
