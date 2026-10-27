import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateSyntheticCivilId } from "../src/utils/civilId";

const emulator = process.argv.includes("--emulator");
const port = emulator ? 3000 : 3917;
const base = `http://127.0.0.1:${port}`;
const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "unchanged-confirm-http-"));
Object.assign(process.env, { DATA_MODE: emulator ? "firestore" : "demo", NODE_ENV: "development", PORT: String(port),
  SCHEDULE_PRIVATE_DIR: privateDir, AUTO_IMPORT_LEGACY_DATA: "false" });
if (emulator) {
  assert.match(String(process.env.FIRESTORE_EMULATOR_HOST), /^(127\.0\.0\.1|localhost):\d+$/);
  assert.match(String(process.env.FIREBASE_PROJECT_ID), /^demo-instructor-/);
  process.env.FIREBASE_DATABASE_ID = "(default)";
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "";
  process.env.AUTO_IMPORT_LEGACY_DATA = "false";
}

await import("../server.ts"); // The requests below traverse the actual Express route.
for (let attempt = 0; attempt < 100; attempt++) {
  try { if ((await fetch(`${base}/api/demo/config`)).ok) break; } catch { /* wait for local test server */ }
  if (attempt === 99) { console.error("Local HTTP server did not start"); process.exit(1); }
  await new Promise(resolve => setTimeout(resolve, 100));
}
const { Repository } = await import("../src/db/repository");
const emulatorAdmin = emulator ? await import("firebase-admin/firestore") : null;
const emulatorDb = emulatorAdmin ? emulatorAdmin.getFirestore() : null;
const collegeId = emulator ? 990017 : 1;
const sectionId = emulator ? 990017 : 1;
const courseId = 990017;

const termId = 990017;
const createFixture = async (suffix: string, legacyRelationalRow = false) => {
  const civil = generateSyntheticCivilId();
  const instructor = await Repository.createInstructor(civil, `اختبار التأكيد الذري ${suffix}`, "55500001");
  let scheduleSectionId = sectionId, scheduleCollegeId = collegeId, scheduleCourseId = courseId;
  if (legacyRelationalRow) {
    const section = await Repository.createSection(collegeId, `LEG${suffix}`, `isolated ${suffix}`);
    const course = await Repository.createCourse(collegeId, section.AdSectionId, `LEG${suffix}`, `legacy ${suffix}`, 1, 1, 30, false);
    scheduleSectionId = section.AdSectionId; scheduleCourseId = course.AdCourseId;
  }
  const schedule = await Repository.createSchedule({ AdTermId: termId,
    ...(legacyRelationalRow ? {} : { AdCollegeId: scheduleCollegeId, AdSectionId: scheduleSectionId }), AdCourseId: scheduleCourseId,
    AdInstructorId: instructor.AdInstructorId, SCode: suffix, fsunday: true, fmonday: false, ftuesday: false,
    fwednesday: false, fthursday: false, fstarttime: "18:00", fendtime: "18:50", roomId: `room-${suffix}`,
    AdRoomCode: "HTTP", AdRoomHall: suffix } as any);
  const link = await Repository.createShareLink({ AdCollegeId: scheduleCollegeId, AdSectionId: scheduleSectionId, AdTermId: termId,
    label: `HTTP test ${suffix}`, expiresAt: "2027-01-01T00:00:00.000Z", SystemUserId: 1, userName: "test",
    showInstructors: false, kind: "request", AdInstructorId: instructor.AdInstructorId,
    requestsCloseAt: "2027-01-01T00:00:00.000Z" });
  const item = { itemId: `http-${suffix}`, rowId: schedule.id, action: "keep" as const,
    before: { courseId: schedule.AdCourseId, courseName: "اختبار", collegeId: scheduleCollegeId,
      sectionId: scheduleSectionId, sectionCode: suffix, days: "الأحد", time: "18:00 – 18:50" },
    slots: [{ day: "fsunday" as const, start: "18:00", end: "18:50" }] };
  const request = await Repository.createInstructorRequest({ AdCollegeId: scheduleCollegeId, AdSectionId: scheduleSectionId, AdTermId: termId,
    AdInstructorId: instructor.AdInstructorId, linkId: link.id, window: { opensAt: "2026-01-01T00:00:00.000Z", closesAt: "2027-01-01T00:00:00.000Z" },
    source: "draft", status: "sent", items: [item], timeline: [],
    signature: { at: "prior", fingerprint: `prior-${suffix}`, verifyCode: "123456", signedItems: [], keptCount: 1 } as any,
    signatureHistory: [{ at: "older", fingerprint: `history-${suffix}`, verifyCode: "654321", signedItems: [], keptCount: 1 } as any] });
  return { schedule, link, request, civil };
};
const postConfirmation = async (linkId: string, requestRevision: number, rowId: number, civil: string) => fetch(`${base}/api/public/request/${encodeURIComponent(linkId)}`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ civil, requestRevision, items: [{ rowId, action: "keep" }] }),
});

let exitCode = 0;
try {
  const normal = await createFixture("NORMAL");
  const normalResponse = await fetch(`${base}/api/public/request/${encodeURIComponent(normal.link.id)}`);
  assert.equal(normalResponse.status, 200);
  const normalPage = await normalResponse.json() as any;
  const normalConfirmation = await postConfirmation(normal.link.id, Number(normalPage.request.requestRevision || 0), normal.schedule.id, normal.civil);
  assert.equal(normalConfirmation.status, 200);
  const normalResult = await normalConfirmation.json() as any;
  assert.equal(normalResult.unchangedConfirmed, true, "ordinary unchanged HTTP confirmation succeeds");
  assert.equal((await Repository.getScheduleById(normal.schedule.id))?.fstarttime, "18:00",
    "ordinary HTTP confirmation leaves the official schedule unchanged");

  {
    const legacy = await createFixture("LEGACY", true);
    if (emulatorDb) {
      const rawLegacyRow = (await emulatorDb.collection("schedules").doc(`schedule_${legacy.schedule.id}`).get()).data() as any;
      assert.equal(rawLegacyRow.AdCollegeId, undefined, "the emulator HTTP fixture stores an un-denormalized legacy row");
      assert.equal(rawLegacyRow.AdSectionId, undefined, "the emulator HTTP fixture stores an un-denormalized legacy row");
    }
    const legacyPageResponse = await fetch(`${base}/api/public/request/${encodeURIComponent(legacy.link.id)}`);
    assert.equal(legacyPageResponse.status, 200);
    const legacyPage = await legacyPageResponse.json() as any;
    const legacyConfirmation = await postConfirmation(legacy.link.id, Number(legacyPage.request.requestRevision || 0), legacy.schedule.id, legacy.civil);
    assert.equal(legacyConfirmation.status, 200, "a legacy row with missing denormalized scope fields confirms over HTTP");
    assert.equal((await legacyConfirmation.json() as any).unchangedConfirmed, true,
      "legacy timetable relation hydration agrees between the preflight and transaction");
  }

  const stale = await createFixture("STALE");
  const staleResponse = await fetch(`${base}/api/public/request/${encodeURIComponent(stale.link.id)}`);
  assert.equal(staleResponse.status, 200);
  const stalePage = await staleResponse.json() as any;
  const save = Repository.saveInstructorRequest;
  let injected = false;
  Repository.saveInstructorRequest = async function(row: any, proposals?: any, guard?: any) {
    if (row.id === stale.request.id && guard && !injected) {
      injected = true;
      const current = await Repository.getScheduleById(stale.schedule.id);
      await Repository.updateSchedule(stale.schedule.id, { fstarttime: "17:00", fendtime: "17:50" }, Number(current?.rev || 1));
    }
    return save.call(Repository, row, proposals, guard);
  } as typeof Repository.saveInstructorRequest;
  let staleHttp: Response;
  try {
    staleHttp = await postConfirmation(stale.link.id, Number(stalePage.request.requestRevision || 0), stale.schedule.id, stale.civil);
  } finally { Repository.saveInstructorRequest = save; }
  const staleBody = await staleHttp!.clone().json().catch(() => ({})) as any;
  assert.equal(injected, true, `barrier injected the official move after route check and before atomic save (HTTP ${staleHttp!.status}; ${JSON.stringify(staleBody)})`);
  assert.equal(staleHttp!.status, 409, "the real HTTP route rejects a schedule changed during confirmation");
  assert.match(staleBody.error, /تغيّر جدولك بعد فتح التأكيد/);
  assert.equal(staleBody.draftPreserved, true);
  const stored = await Repository.getInstructorRequest(stale.request.id);
  assert.equal(stored?.status, "sent", "a raced confirmation does not settle or hide the request");
  assert.equal(stored?.signature?.fingerprint, "prior-STALE", "a raced confirmation preserves the previous signature");
  assert.equal((await Repository.getScheduleById(stale.schedule.id))?.fstarttime, "17:00",
    "the newer official timetable remains intact");
  console.log(`Unchanged confirmation HTTP${emulator ? "/Firestore Emulator" : ""}: ordinary confirmation and legacy relational row passed; controlled 18:00→17:00 race rejected with draft/signature preserved.`);
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  process.exit(exitCode); // Close Express and all open keep-alive handles in this isolated test process.
}
