/**
 * الشعبةُ المحذوفة ثم المُعادة تبقى هي هي في تقرير تغييرات الجدول:
 * المقرر + رقم الشعبة + الموقع، وحيدةً في الجهتين = تعديلٌ لا حذفٌ وإضافة.
 * وغيرُ ذلك يبقى حذفاً أو إضافةً كما هو.
 */
import assert from "node:assert/strict";
import { buildAuthorityPdfDiff } from "../src/server/core/authority";

let passed = 0;
const check = (ok: boolean, label: string) => { assert.ok(ok, label); passed++; console.log(`  ✓ ${label}`); };

const codes = new Map<number, string>([[215, "0109215"], [334, "0109334"]]);
const original = (id: number, code: string, sec: string, ref: string, order: number, over: Record<string, any> = {}) => ({
  id, AdCourseId: id, sourceCourseCode: code, referenceNumber: ref, sourceOrder: order, SCode: sec, sourceSectionText: sec,
  AdRoomCode: "011B17", AdRoomHall: "F06", AdInstructorId: 0,
  fsunday: false, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false, fstarttime: "17:00", fendtime: "19:50", ...over,
});
const recreated = (id: number, courseId: number, sec: string, over: Record<string, any> = {}) => ({
  id, AdCourseId: courseId, SCode: sec, sourceSectionText: undefined, referenceNumber: "", sourceOrder: 1_000_000 + id,
  AdRoomCode: "011B17", AdRoomHall: "F06", AdInstructorId: 0,
  fsunday: false, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false, fstarttime: "17:00", fendtime: "19:50", ...over,
});
const run = (base: any[], live: any[]) => buildAuthorityPdfDiff(base, live, { courseCodeById: codes, instructorNameById: new Map() }) as any;
const count = (out: any, status: string) => out.rows.filter((r: any) => r.status === status).length;

// 1) حُذف ثم أُعيد كما كان بالضبط: لا يظهر شيء.
let out = run([original(215, "0109215", "501", "1332", 0)], [recreated(9001, 215, "501")]);
check(count(out, "deleted") === 0 && count(out, "added") === 0 && count(out, "unchanged") === 1, "أُعيدت كما هي: لا حذف ولا إضافة ولا تعديل");

// 2) أُعيدت بقاعةٍ مختلفة: تعديلٌ في خانة القاعة وحدها.
out = run([original(215, "0109215", "501", "1332", 0)], [recreated(9001, 215, "501", { AdRoomHall: "G20" })]);
check(count(out, "deleted") === 0 && count(out, "added") === 0 && count(out, "changed") === 1, "قاعةٌ مختلفة: تعديلٌ واحد لا حذفٌ وإضافة");
check(out.rows.find((r: any) => r.status === "changed").changedFields.every((f: string) => ["AdRoomHall", "AdRoomCode"].includes(f)), "ولا تُصبغ إلا خانة القاعة");

// 3) تغيّر اليوم والوقت مع بقاء المقرر والشعبة: تعديل.
out = run([original(215, "0109215", "501", "1332", 0)], [recreated(9001, 215, "501", { ftuesday: false, fwednesday: true, fstarttime: "11:00", fendtime: "13:50" })]);
check(count(out, "deleted") === 0 && count(out, "added") === 0 && count(out, "changed") === 1, "يومٌ ووقتٌ مختلفان في الشعبة نفسها: تعديل");

// 4) رقمُ شعبةٍ آخر = شعبةٌ أخرى: حذفٌ وإضافة.
out = run([original(215, "0109215", "501", "1332", 0)], [recreated(9001, 215, "502")]);
check(count(out, "deleted") === 1 && count(out, "added") === 1, "رقم الشعبة المختلف يبقى حذفاً وإضافة");

// 5) موقعٌ آخر (فرع آخر): لا ربط.
out = run([original(215, "0109215", "501", "1332", 0)], [recreated(9001, 215, "501", { AdRoomCode: "012B08" })]);
check(count(out, "deleted") === 1 && count(out, "added") === 1, "فرعٌ آخر لا يُربط");

// 6) شعبتان متطابقتا المفتاح في الحي: لا تخمين.
out = run([original(215, "0109215", "501", "1332", 0)], [recreated(9001, 215, "501"), recreated(9002, 215, "501", { AdRoomHall: "G20" })]);
check(count(out, "deleted") === 1 && count(out, "added") === 2, "تكرارُ المفتاح في الحي يبقى كما هو بلا تخمين");

// 7) مقررٌ آخر برقم الشعبة نفسه: لا ربط.
out = run([original(215, "0109215", "501", "1332", 0)], [recreated(9001, 334, "501")]);
check(count(out, "deleted") === 1 && count(out, "added") === 1, "مقررٌ آخر لا يُربط");

console.log(`\n${passed} passed, 0 failed`);

// ── مصفوفةٌ أوسع: جدولٌ من اثنتي عشرة شعبة، ثم أنماطُ الحذف والإضافة والتعديل المتوقعة وغير المتوقعة ──
{
  const COURSES = [212, 215, 334, 125];
  const codes2 = new Map<number, string>(COURSES.map(c => [c, `0109${String(c).padStart(3, "0")}`]));
  // رقم الشعبة المخزَّن (501، 502…) يختلف عن الرسمي المطبوع (501، 503، 506…) كما في الاستيراد الحقيقي.
  const official = [501, 503, 506];
  const base: any[] = [];
  COURSES.forEach((c, ci) => official.forEach((off, si) => base.push({
    id: base.length + 1, AdCourseId: c, sourceCourseCode: codes2.get(c), referenceNumber: String(2000 + base.length),
    sourceOrder: base.length, SCode: String(501 + si), sourceSectionText: String(off),
    AdRoomCode: "012B08", AdRoomHall: `G${20 + si}`, AdInstructorId: 0,
    fsunday: si === 0, fmonday: si === 1, ftuesday: si === 2, fwednesday: false, fthursday: false,
    fstarttime: `${8 + ci * 2}:00`, fendtime: `${9 + ci * 2}:50`,
  })));
  const again = (r: any, i: number, over: Record<string, any> = {}) => ({ ...r, id: 7000 + i, referenceNumber: "", sourceOrder: 1_000_000 + i, sourceCourseCode: "", sourceSectionText: undefined, ...over });
  const live0 = base.map((r, i) => again(r, i));
  const go = (live: any[]) => buildAuthorityPdfDiff(base, live, { courseCodeById: codes2, instructorNameById: new Map() }) as any;
  const n = (o: any, s: string) => o.rows.filter((r: any) => r.status === s).length;

  let o = go(live0);
  check(n(o, "deleted") + n(o, "added") + n(o, "changed") === 0 && n(o, "unchanged") === 12, "اثنتا عشرة شعبة حُذفت كلها وأُعيدت كما كانت: لا يظهر شيء");

  o = go(live0.map((r, i) => again(r, i + 50)));
  check(n(o, "deleted") + n(o, "added") === 0, "حُذفت وأُعيدت دورتين متتاليتين: لا يظهر شيء");

  o = go(live0.map((r, i) => (i % 3 === 0 ? { ...r, AdRoomHall: "G99" } : r)));
  check(n(o, "deleted") + n(o, "added") === 0 && n(o, "changed") === 4, "تغيير قاعة في أربع شعب: أربعة تعديلات فقط");

  o = go(live0.map((r, i) => (i === 5 ? { ...r, AdRoomHall: "G99", AdInstructorId: 77, fstarttime: "07:00", fendtime: "08:30" } : r)));
  check(n(o, "deleted") + n(o, "added") === 0 && n(o, "changed") === 1, "ثلاث خاناتٍ معاً في شعبةٍ واحدة: تعديلٌ واحد");

  o = go(live0.filter((_, i) => i !== 4 && i !== 9));
  check(n(o, "deleted") === 2 && n(o, "added") === 0, "حذفُ شعبتين: حذفان فقط");

  o = go([...live0, again(base[0], 90, { SCode: "530", AdRoomHall: "G26" })]);
  check(n(o, "added") === 1 && n(o, "deleted") === 0, "شعبةٌ جديدةٌ برقمٍ لا يطابق شيئاً: إضافةٌ واحدة");

  // رقمٌ يطابق الرقم الرسمي المطبوع لشعبةٍ محذوفة لا يصير تعديلاً لها.
  o = go([...live0.filter((_, i) => i !== 2), again(base[2], 91, { SCode: "506", id: 7091 })]);
  check(n(o, "deleted") === 1 && n(o, "added") === 1, "رقمٌ جديد يصادف الرسمي لشعبةٍ محذوفة يبقى إضافةً وحذفاً");

  // تبديل الأوقات بين شعبتين من مقرر واحد: تعديلان لا حذف ولا إضافة.
  const sw = live0.map(r => ({ ...r }));
  for (const k of ["fstarttime", "fendtime", "fsunday", "fmonday", "ftuesday", "AdRoomHall"]) { const t = sw[0][k]; sw[0][k] = sw[1][k]; sw[1][k] = t; }
  o = go(sw);
  check(n(o, "deleted") + n(o, "added") === 0 && n(o, "changed") === 2, "تبديلُ الوقت والقاعة بين شعبتين: تعديلان");

  o = go([]);
  check(n(o, "deleted") === 12, "جدولٌ حيٌّ فارغ: كل ما في الأصل محذوف");
  console.log(`\n${passed} passed, 0 failed`);
}
