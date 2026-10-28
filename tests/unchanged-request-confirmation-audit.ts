/** Regression: unchanged teacher submissions are final without department review. */
import fs from "node:fs";
import type { InstructorRequest } from "../src/types";
import { canConfirmUnchanged, isUnchangedConfirmed, unchangedConfirmationKind, unchangedScheduleFingerprint } from "../src/utils/instructorRequestConfirmation";

let checks = 0;
function expect(ok: boolean, label: string) {
  if (!ok) throw new Error(label);
  console.log("✓ " + label); checks++;
}
const row = {
  id: 101, AdInstructorId: 7, AdCourseId: 21, AdCollegeId: 3, AdSectionId: 9,
  SCode: "01", fstarttime: "09:00", fendtime: "09:50",
  fsunday: true, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false,
};
const item = {
  rowId: 101, action: "keep" as const,
  before: { courseId: 21, courseName: "المقرر", collegeId: 3, sectionId: 9, sectionCode: "01",
    days: "الأحد", time: "09:00 – 09:50" },
  slots: [{ day: "fsunday" as const, start: "09:00", end: "09:50" }],
};
const original = {
  id: "r1", AdCollegeId: 3, AdSectionId: 9, AdTermId: 1, AdInstructorId: 7, linkId: "token",
  window: { opensAt: "", closesAt: "" }, source: "draft" as const, status: "sent" as const,
  timeline: [{ kind: "link-created" as const, at: "2026-01-01T00:00:00Z" }],
  createdAt: "2026-01-01T00:00:00Z", items: [item],
} as InstructorRequest;
// The real browser sends action=keep without days/start, and the server
// normalizes its submitted copy with an empty slots array.
const sent = { ...original, items: original.items.map(x => ({ ...x, slots: [] })) };
expect(canConfirmUnchanged(sent, [row], "", original), "Unchanged LIVE timetable confirms despite empty payload slots");
expect(!canConfirmUnchanged({ ...sent, items: [{ ...sent.items[0], action: "change" }] }, [row], "", original), "Real changes enter department review");
expect(!canConfirmUnchanged(sent, [row], "أحتاج تغييرًا", original), "Free-text department requests are not silently finalized");
expect(!canConfirmUnchanged({ ...sent, source: "previous-term" }, [row], "", original), "Previous-term proposals cannot be confirmed as live timetables");
expect(!canConfirmUnchanged({ ...sent, submittedAt: "2026-01-02" }, [row], "", original), "A second submission cannot erase a prior review");
expect(!canConfirmUnchanged(sent, [{ ...row, fstarttime: "10:00" }], "", original), "Changed live lecture start prevents stale confirmation");
expect(!canConfirmUnchanged(sent, [{ ...row, fsunday: false, fmonday: true }], "", original), "Changed live lecture day prevents stale confirmation");
expect(!canConfirmUnchanged(sent, [row, { ...row, id: 102 }], "", original), "Extra live lecture prevents incomplete confirmation");
expect(!canConfirmUnchanged(sent, [], "", original), "Missing live lecture prevents false confirmation");
expect(!canConfirmUnchanged(sent, [{ ...row, AdInstructorId: 8 }], "", original), "Another professor's timetable cannot satisfy the signer's request");
expect(!canConfirmUnchanged(sent, [row], "", { ...original, items: [{ ...item, action: "change" }] }), "The server-stored original must also be unchanged");
const tableStamp = unchangedScheduleFingerprint([row], 7);
expect(tableStamp === unchangedScheduleFingerprint([{ ...row }], 7), "The same live timetable has a stable confirmation fingerprint");
expect(tableStamp !== unchangedScheduleFingerprint([{ ...row, fstarttime: "10:00" }], 7), "Changing a signed timetable row changes its confirmation fingerprint");
expect(tableStamp !== unchangedScheduleFingerprint([{ ...row, AdInstructorId: 8 }], 7), "Rows outside the signer do not satisfy the signer fingerprint");
expect(isUnchangedConfirmed({ status: "settled", timeline: [{ kind: unchangedConfirmationKind, at: "2026-01-02" }] }), "Persisted status and event identify final confirmation");
expect(!isUnchangedConfirmed({ status: "submitted", timeline: [{ kind: unchangedConfirmationKind, at: "2026-01-02" }] }), "An incomplete request is never treated as confirmed");
expect(!isUnchangedConfirmed({ status: "settled", timeline: [{ kind: "settled", at: "2026-01-02" }] }), "Old department settlements do not appear as automatic confirmations");

const server = fs.readFileSync("server.ts", "utf8");
expect(server.includes('status: unchangedConfirmed ? "settled" : "submitted"'), "The server finalizes only confirmed unchanged submissions");
expect(server.includes('request.status !== "superseded" && !placeholderPeople.has(Number(request.AdInstructorId)) && (')
  && server.includes("\n    inScope(Number(request.AdCollegeId)"), "Superseded rounds stay excluded while completed unchanged submissions remain visible within scope");
expect(server.includes('if (!unchangedConfirmed) broadcastNotify(Repository.currentDemoSessionId());'), "Automatic confirmation does not ping the department inbox");
expect(server.includes('kind: unchangedConfirmationKind, at') && server.includes('kind: "received" as const'), "Confirmed requests have no false department-received event");
expect(server.includes('if(confirmedRequest(r)){dirty=false;clearDraft();host.innerHTML=confirmedHtml(r);return}'), "Reload remains on the visual final card");
expect(server.includes('if(x.d.unchangedConfirmed)') && server.includes('<h1>تم تثبيت جدولك</h1>'), "Successful sign-off immediately shows the infographic");
expect(server.includes('جدولك كما هو · لا يلزمك أي إجراء آخر') && server.includes('التوقيع محفوظ'), "Confirmation is short and explicit");
console.log(`Unchanged teacher card: ${checks} checks passed`);
