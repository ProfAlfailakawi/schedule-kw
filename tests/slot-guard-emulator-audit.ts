/**
 * حارسُ الخانة (slotGuard) على معاملة Firestore الحقيقية — على المحاكي فقط، لا على مشروعٍ حقيقي.
 * يشغَّل: firebase emulators:exec --only firestore --project demo-slotguard "tsx tests/slot-guard-emulator-audit.ts"
 * وبلا FIRESTORE_EMULATOR_HOST يتخطّى بنجاحٍ ويقول ذلك صراحةً (لا يُحسب تحققاً).
 *
 * يثبت تحت كتابات متوازية على المحاكي: يفوز واحدٌ فقط من N طلبات متعارضة (إنشاءً وتعديلاً ونقلاً جماعياً)،
 * ولا يتكرر المعرّف، ويصمد سقفُ ساعات الشعبة، وتسلسلٌ عاديٌّ ما زال يمرّ.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (!/^(127\.0\.0\.1|localhost):\d+$/.test(String(process.env.FIRESTORE_EMULATOR_HOST || ""))) {
  console.log("slot-guard-emulator-audit: SKIP — FIRESTORE_EMULATOR_HOST غير مضبوط (يحتاج المحاكي؛ لم يُتحقق من مسار معاملة Firestore)");
  process.exit(0);
}
process.env.FIREBASE_PROJECT_ID = "demo-slotguard";
process.env.AUTO_IMPORT_LEGACY_DATA = "false";
process.env.FIREBASE_DATABASE_ID = "(default)";
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "";
process.env.DATA_MODE = "firestore";
process.env.SCHEDULE_PRIVATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "slot-guard-"));
const { Repository, initDatabase } = await import("../src/db/repository");
const { makeSlotGuard, SlotTakenError } = await import("../src/server/core/slotGuard");
await initDatabase();
const { getFirestore } = await import("firebase-admin/firestore");
const db = getFirestore();

let passed = 0;
const ok = (value: unknown, label: string) => { assert.ok(value, label); passed += 1; console.log(`  ok  ${label}`); };
const TERM = 71;
const course = (id: number, hours: number) => db.collection("courses").doc(`course_${id}`).set({ AdCourseId: id, AdSectionId: 1, AdCollegeId: 1, CourseHours: hours, CourseCredit: hours, CourseName: `c${id}` });
await db.collection("sections").doc("section_1").set({ AdSectionId: 1, AdCollegeId: 1, AdSectionName: "s" });
await course(501, 3); await course(502, 2); await course(503, 3);
for (let i = 1; i <= 12; i++) await db.collection("instructors").doc(`instructor_${i}`).set({ AdInstructorId: i, AdInstructorName: `أستاذ ${i}` });
const base = (extra: any = {}) => ({ AdTermId: TERM, AdCollegeId: 1, AdSectionId: 1, AdCourseId: 501, AdInstructorId: 1, SCode: "01", fsunday: true,
  fstarttime: "08:00", fendtime: "08:50", AdRoomCode: "A", AdRoomHall: "1", buildingId: "b", roomId: "rA1", ...extra });
const guardedCreate = async (fields: any) => Repository.createSchedule(fields, "", await makeSlotGuard());
const guardedUpdate = async (id: number, fields: any, rev?: number) => Repository.updateSchedule(id, fields, rev, "", await makeSlotGuard());
const settle = async (jobs: Array<() => Promise<any>>) => Promise.allSettled(jobs.map(job => job()));
const won = (results: PromiseSettledResult<any>[]) => results.filter(r => r.status === "fulfilled");
const lost = (results: PromiseSettledResult<any>[]) => results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
const allSlotTaken = (results: PromiseSettledResult<any>[]) => lost(results).every(r => r.reason instanceof SlotTakenError && r.reason.code === "slot-taken");
const termRows = async () => (await db.collection("schedules").where("AdTermId", "==", TERM).get()).docs.map(d => d.data() as any);

/* 1) تسلسلٌ عادي */
const first = await guardedCreate(base());
ok(first.id > 0 && first.rev === 1, "إنشاءٌ عادي يمرّ");
const second = await guardedCreate(base({ AdInstructorId: 2, fsunday: false, fmonday: true, roomId: "rB1", AdRoomCode: "B" }));
ok(second.id !== first.id, "إنشاءٌ ثانٍ بلا تعارض يمرّ بمعرّفٍ مختلف");
const moved = await guardedUpdate(second.id, { fstarttime: "09:00", fendtime: "09:50" }, 1);
ok(moved.rev === 2 && moved.fstarttime === "09:00", "تعديلٌ عادي يمرّ ويرفع المراجعة");
await assert.rejects(() => guardedCreate(base({ AdInstructorId: 3 })), (e: any) => e instanceof SlotTakenError);
ok(true, "قاعةٌ مشغولة تُرفض بـ slot-taken في التسلسل");

/* 2) إنشاءاتٌ متوازية على القاعة والوقت نفسيهما: يفوز واحد */
const N = 8;
const before = (await termRows()).length;
const creates = await settle(Array.from({ length: N }, (_, i) => () => guardedCreate(base({ AdCourseId: 503, AdInstructorId: 4 + (i % 8), SCode: `0${i}`, fsunday: false, fwednesday: true, fstarttime: "11:00", fendtime: "11:50", roomId: "rC1", AdRoomCode: "C", AdRoomHall: "1" }))));
ok(won(creates).length === 1, `من ${N} إنشاءٍ متعارضٍ متوازٍ يفوز واحدٌ فقط (فاز ${won(creates).length})`);
ok(allSlotTaken(creates), "كلُّ الخاسرين slot-taken لا خطأً آخر");
const afterCreates = await termRows();
ok(afterCreates.length === before + 1, "كُتب صفٌّ واحد فقط في Firestore");
ok(new Set(afterCreates.map(r => r.id)).size === afterCreates.length, "لا معرّفَ مكرّراً");

/* 3) تعديلاتٌ متوازية إلى الخانة نفسها */
const movers = [] as any[];
for (let i = 0; i < 6; i++) movers.push(await guardedCreate(base({ AdCourseId: 503, AdInstructorId: 4 + i, SCode: `m${i}`, fsunday: false, fthursday: true, fstarttime: `0${8 + i}:00`, fendtime: `0${8 + i}:50`, roomId: `rM${i}`, AdRoomCode: "M", AdRoomHall: String(i) })));
const updates = await settle(movers.map(row => () => guardedUpdate(row.id, { fstarttime: "13:00", fendtime: "13:50", roomId: "rZ", AdRoomCode: "Z", AdRoomHall: "9", AdInstructorId: 4 + (row.id % 5) }, 1)));
const atSlot = (await termRows()).filter(r => r.roomId === "rZ" && r.fstarttime === "13:00");
ok(won(updates).length === 1 && atSlot.length === 1, `من ${movers.length} تعديلاً متوازياً إلى القاعة نفسها يفوز واحد (فاز ${won(updates).length})`);
ok(allSlotTaken(updates), "خاسرو التعديل slot-taken");

/* 4) نقلٌ جماعيٌّ متوازٍ: كلُّ دفعةٍ كلُّها أو لا شيء */
const pair = [] as any[];
for (let i = 0; i < 4; i++) pair.push(await guardedCreate(base({ AdCourseId: 502, AdInstructorId: 8 + i, SCode: `p${i}`, fsunday: false, ftuesday: true, fstarttime: `0${8 + i}:00`, fendtime: `0${8 + i}:50`, roomId: `rP${i}`, AdRoomCode: "P", AdRoomHall: String(i) })));
const batchTo = (a: any, b: any, room: string) => async () => Repository.moveSchedulesBatch([
  { id: a.id, fields: { fstarttime: "14:00", fendtime: "14:50", roomId: room, AdRoomCode: "Q", AdRoomHall: "1" }, expectedRev: 1 },
  { id: b.id, fields: { fstarttime: "15:00", fendtime: "15:50", roomId: room, AdRoomCode: "Q", AdRoomHall: "1" }, expectedRev: 1 },
], await makeSlotGuard());
const batches = await settle([batchTo(pair[0], pair[1], "rQ1"), batchTo(pair[2], pair[3], "rQ1")]);
ok(won(batches).length === 1 && allSlotTaken(batches), "من دفعتَي نقلٍ إلى القاعة نفسها تفوز واحدة والأخرى slot-taken");
const loserPair = won(batches).length ? (batches[0].status === "fulfilled" ? pair.slice(2) : pair.slice(0, 2)) : [];
for (const row of loserPair) ok(Number((await db.collection("schedules").doc(`schedule_${row.id}`).get()).data()!.rev) === 1, `الدفعة الخاسرة لم تكتب شيئاً (صف ${row.id})`);

/* 5) سقفُ ساعات الشعبة: مقرر ساعتان = حدٌّ أعلى 110 دقيقة، فلا يمرّ إلا موعدان من 50 دقيقة */
const hoursBefore = (await termRows()).filter(r => r.AdCourseId === 502 && r.SCode === "h").length;
const hourJobs = await settle(Array.from({ length: 6 }, (_, i) => () => guardedCreate(base({ AdCourseId: 502, SCode: "h", AdInstructorId: 1 + i, fsunday: false, ...[{ fsunday: true }, { fmonday: true }, { ftuesday: true }, { fwednesday: true }, { fthursday: true }, { fsunday: true, fmonday: true }][i],
  fstarttime: `1${i}:00`, fendtime: `1${i}:50`, roomId: `rH${i}`, AdRoomCode: "H", AdRoomHall: String(i) }))));
const hourRows = (await termRows()).filter(r => r.AdCourseId === 502 && r.SCode === "h");
ok(hourRows.length - hoursBefore === won(hourJobs).length && won(hourJobs).length === 2, `سقف الساعات صمد تحت التوازي: فاز ${won(hourJobs).length} من 6 (المسموح 2)`);
ok(allSlotTaken(hourJobs), "الخاسرون بالسقف slot-taken");
ok(new Set((await termRows()).map(r => r.id)).size === (await termRows()).length, "لا معرّفَ مكرّراً في النهاية");
console.log(`slot-guard-emulator-audit: ${passed} passed`);
process.exit(0);
