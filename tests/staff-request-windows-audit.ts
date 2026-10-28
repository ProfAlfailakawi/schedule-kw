/**
 * مراجعة حدود الوقت والاستثناءات: لا يكفي إظهار زر في الواجهة؛ القرار في الخادم.
 */
import fs from "node:fs";
import assert from "node:assert/strict";
import { normalizeInstructorDeadline, individualExceptionOpen, requestWindowOpen } from "../src/utils/instructorRequestWindows";

const source = fs.readFileSync("server.ts", "utf8");
const ui = fs.readFileSync("src/components/SchedulePublish.tsx", "utf8");

assert.equal(normalizeInstructorDeadline("2026-10-28"), "2026-10-28T20:59:59.000Z");
assert.equal(normalizeInstructorDeadline("2026-10-28T14:00"), "2026-10-28T11:00:59.000Z");
assert.equal(normalizeInstructorDeadline("2026-10-28T00:00"), "2026-10-27T21:00:59.000Z");
for (const invalid of ["2026-02-31", "2026-10-28T24:00", "2026-10-28T11:60", "2026-10-28T1:00", "غداً", "", "2026-13-01"]) {
  assert.equal(normalizeInstructorDeadline(invalid), "", invalid);
}
const now = Date.parse("2026-10-29T09:00:00Z");
const general = { opensAt: "2026-10-25T00:00:00Z", closesAt: "2026-10-28T20:59:59Z" };
const specific = { opensAt: "2026-10-29T08:00:00Z", closesAt: "2026-10-30T12:00:00Z",
  grantedAt: "2026-10-29T08:00:00Z", grantedBy: "القسم", reason: "ظرف طارئ" };
assert.equal(requestWindowOpen({ status: "sent", window: general }, now), false, "المهلة العامة انتهت");
assert.equal(individualExceptionOpen(specific, now), true, "استثناء الأستاذ فقط مفتوح");
assert.equal(requestWindowOpen({ status: "sent", window: general, individualException: specific }, now), true);
assert.equal(requestWindowOpen({ status: "sent", window: general, individualException: specific }, Date.parse("2026-10-30T12:00:01Z")), false);
assert.equal(requestWindowOpen({ status: "sent", window: general, individualException: { ...specific, revokedAt: "2026-10-29T08:30:00Z" } }, now), false);
assert.equal(requestWindowOpen({ status: "settled", window: general, individualException: specific }, now), false, "لا نعيد فتح تثبيت قديم");
assert.equal(requestWindowOpen({ status: "superseded", window: general, individualException: specific }, now), false);
assert.equal(requestWindowOpen({ status: "sent", window: { ...general, closesAt: "2026-10-29T12:00:00Z" } }, now), true, "إعادة فتح الجميع تعمل");

for (const needle of [
  'const individualOnly = req.body?.instructorId != null',
  "if (individualOnly && instructorId !== selectedInstructorId) continue;",
  'isFacultyPlaceholder(person)',
  'app.get("/api/instructor-requests/exceptions"',
  'app.post("/api/instructor-requests/exception/revoke"',
  'individualException: exceptional',
  'requestWindowOpen(resolved.request)',
  'const reopening = req.body?.reopen === true',
  'setShareLinkRequestsCloseAt(link.id, windowClosesAt)',
  'const baseCloseAt = individualOnly',
  'requestWindowOpenPolicy(request)',
]) assert.ok(source.includes(needle), "الخادم: " + needle);

for (const needle of [
  'type="time"',
  'فتح للجميع',
  'استثناء لأستاذ',
  'إلغاء الاستثناء',
  'manageInstructorId',
  'manageReason',
  'reopen: true',
  'kwTime(link.requestsCloseAt)',
]) assert.ok(ui.includes(needle), "الواجهة: " + needle);
console.log("✓ موعد الساعة الكويتية، الإغلاق، الاستثناء، الإلغاء، الفصل عن القراءة، ومسارات الواجهة والخادم");
