/**
 * العملية العكسية لـ commitStudyProposal على محاكي Firestore (تُشغَّل يدوياً):
 * firebase emulators:exec --only firestore --project demo-instructor-undo "tsx tests/proposal-undo-emulator-audit.ts"
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

assert.match(String(process.env.FIRESTORE_EMULATOR_HOST), /^(127\.0\.0\.1|localhost):\d+$/);
process.env.FIREBASE_PROJECT_ID = "demo-instructor-undo";
process.env.AUTO_IMPORT_LEGACY_DATA = "false";
process.env.FIREBASE_DATABASE_ID = "(default)";
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "";
process.env.DATA_MODE = "firestore";
process.env.SCHEDULE_PRIVATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-undo-"));
const { Repository, initDatabase, ScheduleRevisionConflict, StudyProposalRevisionConflict } = await import("../src/db/repository");
await initDatabase();
const { getFirestore } = await import("firebase-admin/firestore");
const db = getFirestore();

let passed = 0;
const ok = (value: unknown, label: string) => { assert.ok(value, label); passed += 1; console.log(`  ok  ${label}`); };
const rowDoc = (id: number) => db.collection("schedules").doc(`schedule_${id}`);
const read = async (id: number) => (await rowDoc(id).get()).data() as any;
const row = (id: number, extra: any = {}) => ({ id, rev: 1, AdTermId: 1, AdCollegeId: 1, AdSectionId: 1, AdCourseId: 5, AdInstructorId: 9, SCode: String(id), fsunday: true,
  fstarttime: "08:00", fendtime: "08:50", AdRoomCode: "A", AdRoomHall: String(id), buildingId: "b", roomId: `r${id}`, ...extra });
const PID = "undo-1";
const stored = () => db.collection("studyProposals").doc(PID).get().then(doc => doc.data() as any);
await rowDoc(9001).set(row(9001)); await rowDoc(9002).set(row(9002));
await db.collection("studyProposals").doc(PID).set({ id: PID, rev: 1, status: "approved", AdTermId: 1, requestId: "none" });

const forward = await Repository.commitStudyProposal({
  proposalId: PID, expectedRev: 1, termId: 1, creates: [{ ...row(0, { SCode: "new" }), id: undefined } as any],
  updates: [{ id: 9001, fields: { fstarttime: "10:00" }, expectedRev: 1 }], deletes: [{ id: 9002, expectedRev: 1 }],
  build: () => ({ ...(({ id: PID, status: "committed", AdTermId: 1, requestId: "none", commit: { at: "x" } }) as any) }),
});
const createdId = forward.created[0].id;
ok((await read(9001)).fstarttime === "10:00" && !(await read(9002)) && await read(createdId), "التثبيت كتب في المعاملة");
const deleted = row(9002);
const reverse = (over: any = {}) => Repository.commitStudyProposal({
  reverse: true, proposalId: PID, expectedRev: 2, termId: 1, creates: [deleted as any],
  updates: [{ id: 9001, fields: { fstarttime: "08:00" }, expectedRev: 2 }], deletes: [{ id: createdId, expectedRev: 1 }],
  build: () => ({ id: PID, status: "approved", AdTermId: 1, requestId: "none" }) as any, ...over,
});
const unchanged = async (label: string) => ok((await read(9001)).fstarttime === "10:00" && !(await read(9002)) && await read(createdId) && (await stored()).commit, label);

await assert.rejects(() => reverse({ deletes: [{ id: createdId, expectedRev: 7 }] }), (e: any) => e instanceof ScheduleRevisionConflict);
await unchanged("مراجعة صفٍّ منشأ قديمة: رفض ولا كتابة");
await assert.rejects(() => reverse({ updates: [{ id: 9001, fields: { fstarttime: "08:00" }, expectedRev: 1 }] }), (e: any) => e instanceof ScheduleRevisionConflict);
await unchanged("مراجعة صفٍّ معدَّل قديمة: رفض ولا كتابة");
await assert.rejects(() => reverse({ guard: () => { throw new ScheduleRevisionConflict(row(1) as any); } }), (e: any) => e instanceof ScheduleRevisionConflict);
await unchanged("الحارس يعمل داخل المعاملة ويلغيها");
let guardRows = 0;
await rowDoc(9002).set(row(9002, { SCode: "other" }));
await assert.rejects(() => reverse(), (e: any) => e instanceof ScheduleRevisionConflict);
ok((await read(9002)).SCode === "other" && (await read(9001)).fstarttime === "10:00", "معرّفٌ مشغول يوقف الاستعادة كلها");
await rowDoc(9002).delete();
await reverse({ guard: (rows: any[]) => { guardRows = rows.length; } });
ok(guardRows >= 2, "الحارس قرأ صفوف الفصل");
const back = await read(9002);
ok((await read(9001)).fstarttime === "08:00" && (await read(9001)).rev === 3, "الصف المعدَّل عاد بمراجعة أحدث");
ok(back?.id === 9002 && back.rev === 2 && !(await read(createdId)), "المحذوف عاد بمعرّفه والمنشأ حُذف");
ok(!(await stored()).commit && (await stored()).status === "approved", "المقترح عاد موافَقاً عليه");
await assert.rejects(() => reverse({ expectedRev: 3 }), (e: any) => e instanceof StudyProposalRevisionConflict);
ok(true, "لا تراجع ثانٍ");
console.log(`proposal-undo-emulator-audit: ${passed} passed`);
process.exit(0);
