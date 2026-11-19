/**
 * ── أنماط «تغييرات الجدول» المتوقعة وغير المتوقعة (المالك 2026-11-19) ───────────────
 * المقارنةُ بين لقطتين (diffSchedules) تحكمها المعرّفات؛ وحالاتٌ تُنشئ صفّاً بمعرّفٍ جديد (تراجعٌ عن حذف، إعادةُ إضافة)
 * كانت تظهر «محذوفاً + مضافاً» والشعبةُ هي هي. وكلُّ نمطٍ هنا يُحكم له بما يراه الناظر.
 */
import assert from "node:assert/strict";
import { diffSchedules } from "../src/utils/scheduleDiff";

let passed = 0;
const check = (ok: boolean, label: string) => { assert.ok(ok, label); passed++; console.log(`  ✓ ${label}`); };
const row = (id: number, over: Record<string, any> = {}): any => ({ id, AdSectionId: 3, AdCollegeId: 1, AdTermId: 1, AdCourseId: 10, SCode: "501", AdInstructorId: 7, fsunday: true, ftuesday: true, fstarttime: "08:00", fendtime: "09:50", AdRoomCode: "A", AdRoomHall: "1", ...over });
const kinds = (d: any) => d.entries.map((e: any) => e.kind).sort().join();

let d = diffSchedules([row(1)], [row(1)]);
check(d.entries.length === 0 && d.counts.unchanged === 1, "P1 بلا تغيير: لا شيء");
d = diffSchedules([row(1)], [row(1, { AdCourseId: 11 })]);
check(kinds(d) === "changed" && d.entries[0].changes.some((c: any) => c.field === "course"), "P2 مقررٌ بُدّل بالمعرّف نفسه: تعديلٌ في خانة المقرر");
d = diffSchedules([row(1)], [row(1, { AdInstructorId: 9 })]);
check(kinds(d) === "changed" && d.entries[0].changes.length === 1, "P3 أستاذٌ بُدّل: تعديلٌ واحد");
d = diffSchedules([row(1)], [row(2)]);
check(kinds(d) === "" && d.counts.unchanged === 1, "P4 حُذف ثم أُعيد كما كان بمعرّفٍ جديد (تراجع): لا شيء");
d = diffSchedules([row(1)], [row(2, { fstarttime: "10:00", fendtime: "11:50", AdRoomHall: "2" })]);
check(kinds(d) === "changed" && d.entries[0].changes.map((c: any) => c.field).sort().join() === "room,time", "P5 أُعيدت بوقتٍ وقاعةٍ مختلفين: تعديلٌ لا حذفٌ وإضافة");
d = diffSchedules([row(1)], [row(2, { SCode: "502" })]);
check(kinds(d) === "changed" && d.entries[0].changes.some((c: any) => c.field === "sectionCode"), "P6 أُعيدت برقم شعبةٍ مختلف وبوقتها: تعديلٌ في رقم الشعبة");
d = diffSchedules([row(1)], [row(2, { AdCourseId: 11 })]);
check(kinds(d) === "added,removed", "P7 مقررٌ آخر برقمٍ جديد: حذفٌ وإضافة حقاً");
d = diffSchedules([row(1)], [row(2, { AdSectionId: 4 })]);
check(kinds(d) === "added,removed", "P8 قسمٌ آخر لا يُربط");
d = diffSchedules([row(1), row(2, { SCode: "502" })], [row(3), row(4, { SCode: "502" })]);
check(kinds(d) === "" && d.counts.unchanged === 2, "P9 شعبتان أُعيد إنشاؤهما: كلٌّ تُربط بأصلها");
d = diffSchedules([row(1), row(2)], [row(3)]);
check(d.counts.removed === 2 && d.counts.added === 1 && d.counts.changed === 0, "P10 شعبتان بمفتاحٍ واحد وعادت واحدة: لا تخمين، يبقى حذفٌ وإضافة");
d = diffSchedules([row(1), row(2, { SCode: "502" })], [row(1), row(3, { SCode: "502", fstarttime: "12:00", fendtime: "13:50" }), row(4, { SCode: "503" })]);
check(d.counts.added === 1 && d.counts.changed === 1 && d.counts.removed === 0, "P11 شعبةٌ جديدةٌ مع شعبةٍ مُعادة بوقتٍ آخر: واحدٌ مضاف وواحدٌ معدّل");
d = diffSchedules([row(1, { fstarttime: "08:00" }), row(2, { SCode: "502", fstarttime: "10:00" })], [row(1, { fstarttime: "10:00" }), row(2, { SCode: "502", fstarttime: "08:00" })]);
check(d.counts.changed === 2 && d.counts.added === 0 && d.counts.removed === 0, "P12 تبديلُ وقتَي شعبتين: تعديلان");
d = diffSchedules([row(1, { AdCourseId: 10 }), row(2, { SCode: "502", AdCourseId: 11 })], [row(1, { AdCourseId: 11 }), row(2, { SCode: "502", AdCourseId: 10 })]);
check(d.counts.changed === 2 && d.counts.added === 0, "P13 تبديلُ مقرّرَي شعبتين: تعديلان");
d = diffSchedules([row(1, { AdInstructorId: 0 })], [row(1, { AdInstructorId: 9 })]);
check(kinds(d) === "changed", "P14 إسنادُ أستاذٍ لشعبةٍ شاغرة: تعديل");
d = diffSchedules([], [row(1), row(2, { SCode: "502" })]);
check(d.firstReview && d.counts.added === 2, "P15 أولُ مراجعة: كلُّ صفٍّ مضاف");
d = diffSchedules([row(1)], []);
check(kinds(d) === "removed", "P16 جدولٌ فرغ: كلُّها محذوفة");
console.log(`\n${passed} passed, 0 failed`);
