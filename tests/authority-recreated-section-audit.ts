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
