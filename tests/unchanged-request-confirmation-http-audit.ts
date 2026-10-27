import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateSyntheticCivilId } from "../src/utils/civilId";

const port = 3917;
const base = `http://127.0.0.1:${port}`;
const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "unchanged-confirm-http-"));
Object.assign(process.env, { DATA_MODE: "demo", NODE_ENV: "development", PORT: String(port),
  SCHEDULE_PRIVATE_DIR: privateDir, AUTO_IMPORT_LEGACY_DATA: "false" });

const { Repository, initDatabase } = await import("../src/db/repository");
await initDatabase();
await import("../server.ts"); // The requests below traverse the actual Express route.
for (let attempt = 0; attempt < 100; attempt++) {
  try { if ((await fetch(`${base}/api/demo/config`)).ok) break; } catch { /* wait for local demo server */ }
  if (attempt === 99) throw new Error("Local demo HTTP server did not start");
  await new Promise(resolve => setTimeout(resolve, 100));
}

const termId = 990017;
const createFixture = async (suffix: string) => {
  const civil = generateSyntheticCivilId();
  const instructor = await Repository.createInstructor(civil, `اختبار التأكيد الذري ${suffix}`, "55500001");
  const schedule = await Repository.createSchedule({ AdTermId: termId, AdCollegeId: 1, AdSectionId: 1, AdCourseId: 990017,
    AdInstructorId: instructor.AdInstructorId, SCode: suffix, fsunday: true, fmonday: false, ftuesday: false,
    fwednesday: false, fthursday: false, fstarttime: "18:00", fendtime: "18:50", roomId: `room-${suffix}`,
    AdRoomCode: "HTTP", AdRoomHall: suffix } as any);
  const link = await Repository.createShareLink({ AdCollegeId: 1, AdSectionId: 1, AdTermId: termId,
    label: `HTTP test ${suffix}`, expiresAt: "2027-01-01T00:00:00.000Z", SystemUserId: 1, userName: "test",
    showInstructors: false, kind: "request", AdInstructorId: instructor.AdInstructorId,
    requestsCloseAt: "2027-01-01T00:00:00.000Z" });
  const item = { itemId: `http-${suffix}`, rowId: schedule.id, action: "keep" as const,
    before: { courseId: schedule.AdCourseId, courseName: "اختبار", collegeId: schedule.AdCollegeId,
      sectionId: schedule.AdSectionId, sectionCode: suffix, days: "الأحد", time: "18:00 – 18:50" },
    slots: [{ day: "fsunday" as const, start: "18:00", end: "18:50" }] };
  const request = await Repository.createInstructorRequest({ AdCollegeId: 1, AdSectionId: 1, AdTermId: termId,
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
  console.log("Unchanged confirmation HTTP race: ordinary confirmation passed; controlled 18:00→17:00 race rejected with draft/signature preserved.");
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  process.exit(exitCode); // Close Express and all open keep-alive handles in this isolated test process.
}
