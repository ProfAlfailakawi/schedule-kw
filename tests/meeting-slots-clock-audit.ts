/**
 * ── صندوق وقت «متى نلتقي؟» وقاعدة الساعة الواحدة + مطابقة الأشخاص بالمعرّف (تدقيق 2026-11-14 البند 2) ──
 * الصندوق صار TimeField (يقبل 14 و9:30 و930 والأرقام العربية)، والساعاتُ 1–7 عصراً بدالةٍ واحدة يستعملها الحقل
 * وسطر الموعد الواحد والصندوق. inspectMeetingSlot يطابق المشغولين بالمعرّف: اسمان متشابهان لا يُخفيان المتفرّغ.
 */
import fs from "node:fs";
import { parseTypedClock } from "../src/utils/clockInput";
import { inspectMeetingSlot } from "../src/utils/meetingSlots";
import { parseOneLineAppointment } from "../src/utils/oneLineAppointment";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 400)); }
};
const serverRegex = /^\d{2}:\d{2}$/;
for (const typed of ["14", "9:30", "930", "٩:٣٠", "9", "2", "7", "14:00"]) {
  const clock = parseTypedClock(typed).clock;
  check(serverRegex.test(clock), `M1 «${typed}» ← ${clock} يقبله regex الخادم`);
}
const slots = fs.readFileSync("src/components/MeetingSlots.tsx", "utf8");
check(/import \{ TimeField \} from "\.\/TimeField"/.test(slots) && /<TimeField[^>]*value=\{chosenTime\}/.test(slots) && !/maxLength=\{5\} placeholder="10:05"[^>]*type="text"/.test(slots) && !/<input type="text" dir="ltr" lang="en"/.test(slots), "M2 الصندوق TimeField لا نصٌّ خام");
check(/clockInput/.test(fs.readFileSync("src/components/TimeField.tsx", "utf8")) && /clockInput/.test(fs.readFileSync("src/utils/oneLineAppointment.ts", "utf8")), "M3 الحقل والسطر الواحد يستوردان قاعدةً واحدة");
/* السطر الواحد والحقل يتفقان في كل شكلٍ مشترك */
const ctx = { courses: [], instructors: [], window: { start: "08:00", end: "20:00" } };
for (const typed of ["1", "2", "3", "7", "8", "9", "10", "12", "13", "14", "19", "0800", "1400", "7:30", "2:15", "8.30"]) {
  const field = parseTypedClock(typed).clock;
  const line = parseOneLineAppointment(typed, ctx).seed.start || "";
  check(field === line || (!line && (field < "08:00" || field > "20:00" || /^\d{4}$/.test(typed) && false)), `M4 «${typed}»: الحقل ${field} = السطر ${line || "—"}`, { field, line });
}

/* inspectMeetingSlot بالمعرّف */
const rows: any[] = [{ AdInstructorId: 2, fstarttime: "10:00", fendtime: "11:00", fsunday: true }];
const nameById = new Map<number, string>([[1, "محمد أحمد"], [2, "محمد أحمد"]]);
const out = inspectMeetingSlot({ rows, ids: [1, 2], nameById, duration: 60, day: "fsunday", start: "10:00" });
check(out.free.length === 1 && out.busy.length === 1, "N1 اسمان متشابهان: واحدٌ متفرغ وواحدٌ مشغول (كان المتفرغ يختفي)", out);
const none = inspectMeetingSlot({ rows: [], ids: [1, 2], nameById, duration: 60, day: "fsunday", start: "10:00" });
check(none.free.length === 2 && none.busy.length === 0, "N2 بلا مشغولين: الاثنان متفرغان");
const both = inspectMeetingSlot({ rows: [...rows, { AdInstructorId: 1, fstarttime: "10:30", fendtime: "11:30", fsunday: true }], ids: [1, 2], nameById, duration: 60, day: "fsunday", start: "10:00" });
check(both.free.length === 0 && both.busy.length === 2, "N3 كلاهما مشغول");

console.log(`\nmeeting-slots-clock audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
