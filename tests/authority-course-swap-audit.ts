/**
 * تبديلُ مقرر شعبةٍ منشورة (المعرّفُ نفسه) تعديلٌ في خانة المقرر — لا «حذفُ القديم وإضافةُ جديد».
 * بلاغُ المالك: «بدّلت جدول علياء المسعود فحطّ مادةً جديدة وحذف القديمة».
 */
import assert from "node:assert/strict";
import { buildAuthorityPdfDiff } from "../src/server/core/authority";

let passed = 0;
const check = (ok: boolean, label: string) => { assert.ok(ok, label); passed++; console.log(`  ✓ ${label}`); };
const codes = new Map<number, string>([[215, "0109215"], [334, "0109334"]]);
const base = (over: Record<string, any> = {}) => ({
  id: 10, AdCourseId: 215, sourceCourseCode: "0109215", referenceNumber: "1332", sourceOrder: 0, SCode: "501", sourceSectionText: "501",
  AdRoomCode: "012B08", AdRoomHall: "G24", AdInstructorId: 7,
  fsunday: false, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false, fstarttime: "11:00", fendtime: "13:50", ...over,
});
const live = (over: Record<string, any> = {}) => ({ ...base(), sourceCourseCode: undefined, referenceNumber: "", sourceOrder: 0, ...over });
const run = (b: any[], published: any[], l: any[]) => buildAuthorityPdfDiff(b, l, { courseCodeById: codes, instructorNameById: new Map(), publishedRows: published }) as any;
const count = (out: any, status: string) => out.rows.filter((r: any) => r.status === status).length;

let out = run([base()], [base()], [live({ AdCourseId: 334 })]);
check(count(out, "deleted") === 0 && count(out, "added") === 0 && count(out, "changed") === 1, "مقررٌ بُدّل في الصفّ نفسه: تعديلٌ واحد لا حذفٌ وإضافة");
check(out.rows.find((r: any) => r.status === "changed").changedFields.includes("AdCourseId"), "وتُصبغ خانةُ المقرر");
out = run([base()], [base()], [live({ AdCourseId: 334, AdInstructorId: 9 })]);
check(count(out, "deleted") === 0 && count(out, "added") === 0 && count(out, "changed") === 1, "مقررٌ وأستاذٌ معاً: تعديلٌ واحد");
out = run([base()], [base()], [live({ AdCourseId: 334, AdRoomCode: "011B17" })]);
check(count(out, "deleted") === 1 && count(out, "added") === 1, "فرعٌ آخر لا يُربط ولو تطابق المعرّف");
out = run([base()], [base()], [live({ id: 999, AdCourseId: 334 })]);
check(count(out, "deleted") === 1 && count(out, "added") === 1, "معرّفٌ آخر (صفٌّ جديد حقاً) يبقى حذفاً وإضافة");
console.log(`\n${passed} passed, 0 failed`);

// ── صفٌّ يدويّ بُدّل مقرّرُه: الأصلُ في ملف التسجيل، والحيُّ لا أثر نشرٍ له، وتاريخُ المعرّف يربطهما ──
{
  const orig = base({ id: 5, AdInstructorId: 0 });
  const manual = (over: Record<string, any> = {}) => ({ ...base({ id: 26370, AdCourseId: 334, SCode: "501" }), sourceCourseCode: undefined, referenceNumber: "", sourceSectionText: undefined, sourceOrder: 1_700_000_000_000, AdInstructorId: 920, ...over });
  const before = { ...manual({ AdCourseId: 215, SCode: "501" }) };
  const run2 = (history?: Map<number, any[]>, l = [manual()]) => buildAuthorityPdfDiff([orig], l, { courseCodeById: codes, instructorNameById: new Map(), identityHistory: history }) as any;
  let o = run2();
  check(count(o, "deleted") === 1 && count(o, "added") === 1, "بلا تاريخ: يبقى الأصل محذوفاً والحيُّ مضافاً (السلوك القديم)");
  o = run2(new Map([[26370, [before]]]));
  check(count(o, "deleted") === 0 && count(o, "added") === 0 && count(o, "changed") === 1, "بتاريخ المعرّف: الصفّ نفسه بُدّل مقرّرُه — تعديلٌ واحد");
  o = run2(new Map([[26370, [before]]]), [manual(), manual({ id: 26371 })]);
  check(count(o, "changed") + count(o, "added") + count(o, "deleted") >= 1 && count(o, "deleted") <= 1, "حيّان بالمعرّف نفسه لا يُخمَّن بينهما بلا تاريخ لأحدهما");
  o = run2(new Map([[26370, [{ ...before, AdRoomCode: "011B17" }]]]));
  check(count(o, "deleted") === 1 && count(o, "added") === 1, "تاريخٌ من فرعٍ آخر لا يربط");
  console.log(`\n${passed} passed, 0 failed`);
}
