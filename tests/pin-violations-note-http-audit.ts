/**
 * ── «ثبّت» مع مخالفة: الملاحظةُ لا تُخفي المخالفات ولا تنظّف الجدول ─────────────────────
 * خادمٌ حقيقيّ في وضع التجربة (منفذ 3931): أستاذٌ في جدوله شعبةٌ «أحد 80 + خميس 80» تبدأ 08:30.
 *   • الصفحةُ تسرد مخالفاتِ الموعد كلَّها (النمطُ لا يحجب السُّلّم)؛
 *   • «ثبّت» بلا ملاحظة يُرفض 409، ونصُّه لا يوحي بأن الملاحظة تنظّف الجدول؛
 *   • طلبٌ بملاحظة يُقبل طلباً لا تثبيتاً، ويُحفظ موسوماً بمخالفاته وموادّها؛
 *   • والمخالفاتُ تبقى ظاهرةً للأستاذ بعد الإرسال، وتصل الواردَ موسومةً.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateSyntheticCivilId } from "../src/utils/civilId";

const port = 3931;
const base = `http://127.0.0.1:${port}`;
const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "pin-note-http-"));
Object.assign(process.env, { DATA_MODE: "demo", NODE_ENV: "development", PORT: String(port), SCHEDULE_PRIVATE_DIR: privateDir, AUTO_IMPORT_LEGACY_DATA: "false" });

await import("../server.ts");
for (let attempt = 0; attempt < 100; attempt++) {
  try { if ((await fetch(`${base}/api/demo/config`)).ok) break; } catch { /* ينتظر الخادم */ }
  if (attempt === 99) { console.error("Local HTTP server did not start"); process.exit(1); }
  await new Promise(resolve => setTimeout(resolve, 100));
}
const { Repository } = await import("../src/db/repository");
const { isUnchangedConfirmed } = await import("../src/utils/instructorRequestConfirmation");

const collegeId = 1, sectionId = 1, termId = 990031;
let exitCode = 0;
try {
  const civil = generateSyntheticCivilId();
  const instructor = await Repository.createInstructor(civil, "اختبار مخالفات التثبيت", "55500031");
  const course = await Repository.createCourse(collegeId, sectionId, "PIN31", "مقرر التثبيت", 3, 3, 30, false);
  const rowOf = (day: "fsunday" | "fthursday", hall: string) => Repository.createSchedule({
    AdTermId: termId, AdCollegeId: collegeId, AdSectionId: sectionId, AdCourseId: course.AdCourseId, AdInstructorId: instructor.AdInstructorId, SCode: "31",
    fsunday: day === "fsunday", fmonday: false, ftuesday: false, fwednesday: false, fthursday: day === "fthursday",
    fstarttime: "08:30", fendtime: "09:50", roomId: `room-pin-${hall}`, AdRoomCode: "PINSECRET", AdRoomHall: hall } as any);
  const sun = await rowOf("fsunday", "A"), thu = await rowOf("fthursday", "B");
  const link = await Repository.createShareLink({ AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId, label: "pin note", expiresAt: "2027-01-01T00:00:00.000Z",
    SystemUserId: 1, userName: "test", showInstructors: false, kind: "request", AdInstructorId: instructor.AdInstructorId, requestsCloseAt: "2027-01-01T00:00:00.000Z" });
  const keep = (row: any, dayName: string, day: string) => ({ itemId: `pin-${row.id}`, rowId: row.id, action: "keep" as const,
    before: { courseId: course.AdCourseId, courseName: "مقرر التثبيت", collegeId, sectionId, sectionCode: "31", days: dayName, time: "08:30 – 09:50" },
    slots: [{ day: day as any, start: "08:30", end: "09:50" }] });
  const request = await Repository.createInstructorRequest({ AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId, AdInstructorId: instructor.AdInstructorId, linkId: link.id,
    window: { opensAt: "2026-01-01T00:00:00.000Z", closesAt: "2027-01-01T00:00:00.000Z" }, source: "draft", status: "sent",
    items: [keep(sun, "الأحد", "fsunday"), keep(thu, "الخميس", "fthursday")], timeline: [] } as any);
  const page = async () => (await (await fetch(`${base}/api/public/request/${encodeURIComponent(link.id)}`)).json()) as any;
  const send = async (requestRevision: number, note?: string) => fetch(`${base}/api/public/request/${encodeURIComponent(link.id)}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ civil, requestRevision, ...(note ? { note } : {}), items: [{ rowId: sun.id, action: "keep" }, { rowId: thu.id, action: "keep" }] }) });

  const first = await page();
  const firstBlocks: any[] = first.pinBlocked || [];
  const ofSunday = firstBlocks.filter(block => block.itemIndex === 0);
  assert.ok(ofSunday.some(block => /ليست نمطاً معتمداً/.test(block.text)) && ofSunday.some(block => /رأس الساعة/.test(block.text)),
    `مخالفاتُ الموعد تُسرد كلُّها: النمطُ والسُّلّم معاً (${JSON.stringify(firstBlocks)})`);
  assert.ok(firstBlocks.every(block => block.article === "م.7/8" || block.article === "" || /^م\.\d+\/\d+$/.test(block.article)), "كلُّ مانعٍ بمادّته");
  assert.ok(firstBlocks.every(block => !/PINSECRET|room-pin/.test(block.text)), "لا قاعةَ في نصّ الأستاذ");

  const refused = await send(Number(first.request.requestRevision || 0));
  const refusedBody = await refused.json() as any;
  assert.equal(refused.status, 409, "«ثبّت» بلا ملاحظة يُرفض");
  assert.equal(refusedBody.code, "pin-blocked");
  assert.ok(!/اكتب ملاحظة للقسم/.test(refusedBody.error) && /تبقى المخالفة ظاهرة/.test(refusedBody.error), `النصُّ لا يوحي بأن الملاحظة تنظّف الجدول (${refusedBody.error})`);
  assert.equal((await Repository.getInstructorRequest(request.id))?.status, "sent", "الرفضُ لا يحفظ شيئاً");

  const noted = await send(Number((await page()).request.requestRevision || 0), "لديّ التزام يوم الثلاثاء");
  const notedBody = await noted.json() as any;
  assert.equal(noted.status, 200, `طلبٌ بملاحظة يُقبل (${JSON.stringify(notedBody).slice(0, 300)})`);
  assert.ok(!notedBody.unchangedConfirmed, "وليس تثبيتاً");
  const stored = await Repository.getInstructorRequest(request.id) as any;
  assert.equal(stored.status, "submitted");
  assert.ok(!isUnchangedConfirmed(stored), "لا يُعرض «ثبّت جدوله كما هو»");
  assert.ok(stored.pinViolations?.issues?.length >= 3 && stored.pinViolations.issues.some((issue: any) => issue.article === "م.7/8" && /ليست نمطاً معتمداً/.test(issue.text)),
    `يُحفظ موسوماً بمخالفاته وموادّها (${JSON.stringify(stored.pinViolations)})`);
  assert.ok((stored.pinViolations.issues as any[]).every(issue => !/PINSECRET/.test(issue.text)));

  const after = await page();
  assert.ok((after.pinBlocked || []).length >= 3, "المخالفاتُ تبقى ظاهرةً للأستاذ بعد إرسال الملاحظة");

  /* الواردُ: الطلبُ موسومٌ، وليس من «بلا تغيير». */
  const login = await fetch(`${base}/api/auth/demo`, { method: "POST" });
  const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
  const inbox = await (await fetch(`${base}/api/instructor-requests?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { headers: { cookie } })).json() as any;
  const listed = (inbox.rows || []).find((row: any) => row.id === request.id);
  if (listed) {
    assert.ok(listed.pinViolations?.issues?.length >= 3 && listed.pinViolations.elsewhere === 0, "الواردُ يحمل الوسمَ بسطوره");
    assert.equal(inbox.totals.unchanged, (inbox.rows as any[]).filter(row => row.status !== "sent" && row.changedCount === 0 && !row.pinViolations).length, "وليس في عدّاد «بلا تغيير»");
  }
  const inboxSrc = fs.readFileSync("src/components/InstructorInbox.tsx", "utf8"), routeSrc = fs.readFileSync("src/server/routes/instructorRequestsRoutes.ts", "utf8");
  assert.ok(/جدول فيه مخالفات لائحية/.test(inboxSrc) && /row\.note \|\| row\.pinViolations/.test(inboxSrc) && /!row\.pinViolations && !isUnchangedConfirmed\(row\)/.test(inboxSrc),
    "بطاقةُ الوارد تعرض «جدول فيه مخالفات لائحية» ولا تدفنه في «الجدول كما هو»");
  assert.ok(/pinViolations: scopedPinViolations\(full, item => inSelection\(requestItemScope\(full, item\)\)\)/.test(routeSrc) && /pinViolations: scopedPinViolations\(request, visible\)/.test(routeSrc), "وسطورُ الوسم في نطاق القارئ وحده، في الوارد وفي ردود القرار");
  console.log(`pin violations note HTTP: ${listed ? "inbox row checked · " : ""}all assertions passed`);
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  fs.rmSync(privateDir, { recursive: true, force: true });
  process.exit(exitCode);
}
