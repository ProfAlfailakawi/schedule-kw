/**
 * الشعبةُ المحذوفة ثم المُعادة تبقى هي هي في تقرير تغييرات الجدول:
 * المقرر + رقم الشعبة + الموقع، وحيدةً في الجهتين = تعديلٌ لا حذفٌ وإضافة.
 * وغيرُ ذلك يبقى حذفاً أو إضافةً كما هو.
 */
import assert from "node:assert/strict";
import { buildAuthorityPdfDiff } from "../src/server/core/authority";
import { matchAuthorityThroughPublication } from "../src/utils/authorityRowMatching";

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

// 4) رقمُ الشعبة وحده تغيّر: تعديلٌ أصفر (قاعدة المالك).
out = run([original(215, "0109215", "501", "1332", 0)], [recreated(9001, 215, "502")]);
check(count(out, "deleted") === 0 && count(out, "added") === 0 && count(out, "changed") === 1, "رقم الشعبة وحده تغيّر (اليوم والوقت والمقرر كما هي): صفٌّ أصفر واحد");

// 5) موقعٌ آخر (فرع آخر): لا ربط.
out = run([original(215, "0109215", "501", "1332", 0)], [recreated(9001, 215, "501", { AdRoomCode: "012B08" })]);
check(count(out, "deleted") === 1 && count(out, "added") === 1, "فرعٌ آخر لا يُربط");

// 6) شعبتان متطابقتا المفتاح في الحي: لا تخمين.
out = run([original(215, "0109215", "501", "1332", 0)], [recreated(9001, 215, "501"), recreated(9002, 215, "501", { AdRoomHall: "G20" })]);
check(count(out, "deleted") === 0 && count(out, "added") === 1 && count(out, "unchanged") === 1, "صفّان بمفتاحٍ واحد: يُربط الأقرب (المطابق) بالأصل ويبقى الآخر إضافة");

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
  check(n(o, "deleted") === 0 && n(o, "added") === 0 && n(o, "changed") === 1, "الرقم وحده تغيّر (اليوم والوقت نفسهما): تعديلٌ أصفر لا حذفٌ وإضافة");

  // رقمٌ جديد مع وقتٍ مختلف: لا دليل على أنها الشعبة نفسها.
  o = go([...live0.filter((_, i) => i !== 2), again(base[2], 92, { SCode: "506", id: 7092, fstarttime: "15:00", fendtime: "16:50" })]);
  check(n(o, "deleted") + n(o, "added") === 0 && n(o, "changed") === 1, "رقمٌ ووقتٌ تغيّرا معاً (وحيدةٌ من المقرر في الفرع): تعديلٌ أصفر");

  // تبديل الأوقات بين شعبتين من مقرر واحد: تعديلان لا حذف ولا إضافة.
  const sw = live0.map(r => ({ ...r }));
  for (const k of ["fstarttime", "fendtime", "fsunday", "fmonday", "ftuesday", "AdRoomHall"]) { const t = sw[0][k]; sw[0][k] = sw[1][k]; sw[1][k] = t; }
  o = go(sw);
  check(n(o, "deleted") + n(o, "added") === 0 && n(o, "changed") === 2, "تبديلُ الوقت والقاعة بين شعبتين: تعديلان");

  o = go([]);
  check(n(o, "deleted") === 12, "جدولٌ حيٌّ فارغ: كل ما في الأصل محذوف");
  console.log(`\n${passed} passed, 0 failed`);
}

// شعبةٌ حُذفت في معاينة الاستيراد فأُعيد ترقيمُ ما بعدها عند النشر: يُعتدّ برقمها المنشور.
{
  const mk = (id: number, ref: string, order: number, sec: string, over: Record<string, any> = {}) => ({
    id, AdCourseId: 215, sourceCourseCode: "0109215", referenceNumber: ref, sourceOrder: order, SCode: sec, sourceSectionText: sec,
    AdRoomCode: "011B17", AdRoomHall: "F06", AdInstructorId: 0,
    fsunday: false, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false, fstarttime: "17:00", fendtime: "19:50", ...over });
  const baseline = [mk(-1, "1001", 0, "501"), mk(-2, "1002", 1, "502", { fstarttime: "11:00", fendtime: "13:50" })];
  // نُشر المرجع ١٠٠٢ برقم ٥٠١ لأن الأولى حُذفت في المعاينة.
  const published = [mk(31, "1002", 1, "501", { fstarttime: "11:00", fendtime: "13:50" })];
  const recreated = { ...published[0], id: 9100, referenceNumber: "", sourceOrder: 1_000_100, sourceCourseCode: "", sourceSectionText: undefined, AdRoomHall: "G20" };
  const m = matchAuthorityThroughPublication(baseline, published, [recreated], new Map([[215, "0109215"]]));
  check(m.get(1) === 0 && !m.has(0), "المُعادة تُربط بأصلها الحقيقي (المرجع ١٠٠٢) لا بالمحذوف في المعاينة");
  console.log(`\n${passed} passed, 0 failed`);
}

// ── الشعبة التي تغيّر رقمها وحده ──
{
  const codes3 = new Map<number, string>([[215, "0109215"], [334, "0109334"]]);
  const o = (id: number, sec: string, ref: string, order: number, over: Record<string, any> = {}) => ({
    id, AdCourseId: 215, sourceCourseCode: "0109215", referenceNumber: ref, sourceOrder: order, SCode: sec, sourceSectionText: sec,
    AdRoomCode: "011B17", AdRoomHall: "F04", AdInstructorId: 0,
    fsunday: true, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false, fstarttime: "11:00", fendtime: "12:20", ...over });
  const mine = (id: number, sec: string, over: Record<string, any> = {}) => ({ ...o(id, sec, "", 1_000_000 + id), sourceCourseCode: "", sourceSectionText: undefined, ...over });
  const go = (base: any[], live: any[]) => buildAuthorityPdfDiff(base, live, { courseCodeById: codes3, instructorNameById: new Map() }) as any;
  const n = (x: any, s: string) => x.rows.filter((r: any) => r.status === s).length;

  let x = go([o(-1, "501", "1001", 0)], [mine(9101, "515", { AdRoomHall: "G20" })]);
  check(n(x, "deleted") + n(x, "added") === 0 && n(x, "changed") === 1, "٥٠١ صارت ٥١٥ بالمقرر واليوم والوقت نفسها وقاعةٍ مختلفة: صفٌّ أصفر واحد");
  const f = x.rows.find((r: any) => r.status === "changed").changedFields;
  check(f.includes("SCode") && f.includes("AdRoomHall"), "وتتلوّن خانتا رقم الشعبة والقاعة");

  x = go([o(-1, "501", "1001", 0)], [mine(9101, "515")]);
  check(n(x, "deleted") + n(x, "added") === 0 && n(x, "changed") === 1, "رقمٌ فقط تغيّر: صفٌّ أصفر واحد");

  x = go([o(-1, "501", "1001", 0)], [mine(9101, "515", { fsunday: false, ftuesday: true })]);
  check(n(x, "deleted") + n(x, "added") === 0 && n(x, "changed") === 1, "الرقم واليوم معاً تغيّرا: صفٌّ أصفر واحد");

  x = go([o(-1, "501", "1001", 0)], [mine(9101, "515", { fstarttime: "14:00", fendtime: "15:20", AdRoomHall: "G20" })]);
  check(n(x, "deleted") + n(x, "added") === 0 && n(x, "changed") === 1, "الرقم والوقت والقاعة معاً تغيّرت: صفٌّ أصفر واحد");

  // حذفان وإضافتان: يُربط كلٌّ بالأقرب إليه بوضوح.
  x = go([o(-1, "501", "1001", 0), o(-2, "502", "1002", 1, { fsunday: false, fmonday: true, fstarttime: "09:00", fendtime: "10:20", AdRoomHall: "F05" })],
    [mine(9101, "512", { AdRoomHall: "G20" }), mine(9102, "515", { fsunday: false, fmonday: true, fstarttime: "09:00", fendtime: "10:20", AdRoomHall: "F05" })]);
  check(n(x, "deleted") + n(x, "added") === 0 && n(x, "changed") === 2, "حذفان وإضافتان من المقرر نفسه: يُربط كلٌّ بالأقرب (تعديلان أصفران)");

  // متساويتا القرب: لا تخمين.
  x = go([o(-1, "501", "1001", 0)], [mine(9101, "512", { AdRoomHall: "G20" }), mine(9102, "515", { AdRoomHall: "G21" })]);
  check(n(x, "deleted") === 1 && n(x, "added") === 2, "إضافتان متساويتا القرب من أصلٍ واحد: لا تخمين");

  // حذفان وإضافتان بلا قربٍ كافٍ: لا تخمين.
  x = go([o(-1, "501", "1001", 0), o(-2, "502", "1002", 1, { fstarttime: "14:00", fendtime: "15:20" })], [mine(9101, "515", { fstarttime: "08:00", fendtime: "09:20" }), mine(9102, "516", { fstarttime: "09:30", fendtime: "10:50" })]);
  check(n(x, "deleted") === 2 && n(x, "added") === 2, "حذفان وإضافتان من المقرر نفسه: يبقى كله أحمر وأخضر بلا تخمين");

  x = go([o(-1, "501", "1001", 0)], [mine(9101, "515"), mine(9102, "516")]);
  check(n(x, "deleted") === 1 && n(x, "added") === 2, "شعبتان جديدتان بالمواصفات نفسها: لا تخمين");

  x = go([o(-1, "501", "1001", 0)], [mine(9101, "515", { AdCourseId: 334 })]);
  check(n(x, "deleted") === 1 && n(x, "added") === 1, "مقررٌ آخر لا يُربط");

  x = go([o(-1, "501", "1001", 0)], [mine(9101, "515", { AdRoomCode: "012B08" })]);
  check(n(x, "deleted") === 1 && n(x, "added") === 1, "فرعٌ آخر لا يُربط");

  // شعبةٌ حُذفت في معاينة الاستيراد وأُعيد ترقيم ما بعدها: المرتبط بالنشر هو الأصل فقط.
  const base2 = [o(-1, "501", "1001", 0), o(-2, "502", "1002", 1, { fstarttime: "14:00", fendtime: "15:20" })];
  const pub2 = [o(31, "501", "1002", 1, { fstarttime: "14:00", fendtime: "15:20" })];
  const recreated = { ...pub2[0], id: 9200, referenceNumber: "", sourceOrder: 1_000_200, sourceCourseCode: "", sourceSectionText: undefined, AdRoomHall: "G20" };
  const m = matchAuthorityThroughPublication(base2, pub2, [recreated], codes3);
  check(m.get(1) === 0 && !m.has(0), "المُعادة تُربط بأصلها الحقيقي (المرجع ١٠٠٢) لا بالمحذوف في المعاينة");
  console.log(`\n${passed} passed, 0 failed`);
}
