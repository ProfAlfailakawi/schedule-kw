import { roomNowStatus } from "../src/utils/roomNow";

let failed = 0;
const check = (ok: boolean, label: string) => { if (!ok) failed++; console.log(ok ? `\x1b[32m✓ ${label}\x1b[0m` : `\x1b[31m✗ ${label}\x1b[0m`); };
/** Kuwait wall clock → Date (UTC+3). 2026-11-15 is a Sunday. */
const at = (day: number, hhmm: string) => new Date(`2026-11-${String(15 + day).padStart(2, "0")}T${hhmm}:00+03:00`);
const row = (s: string, e: string, extra: object = {}) => ({ fstarttime: s, fendtime: e, fsunday: true, ...extra });

const rows = [row("09:00", "10:30"), row("10:30", "11:40"), row("12:20", "13:00")];
let r = roomNowStatus(rows, at(0, "08:10"));
check(r.state === "free-until" && r.text === "متاحة الآن حتى 09:00" && r.untilMinutes === 540, "free until first lecture");
r = roomNowStatus(rows, at(0, "10:00"));
check(r.state === "busy-until" && r.text === "مشغولة حتى 11:40", "inside lecture: back-to-back merged to 11:40");
r = roomNowStatus(rows, at(0, "11:40"));
check(r.state === "free-until" && r.text === "متاحة الآن حتى 12:20", "gap of 40 minutes, next 40 away");
r = roomNowStatus(rows, at(0, "12:00"));
check(r.state === "busy-soon" && r.text === "تُشغل بعد 20 دقيقة", "busy-soon 20 minutes");
check(roomNowStatus(rows, at(0, "12:19")).text === "تُشغل بعد دقيقة واحدة", "one minute uses the Arabic singular");
r = roomNowStatus(rows, at(0, "13:30"));
check(r.state === "free-until" && r.text === "متاحة الآن حتى 20:00", "after last lecture: free until end of day");
check(roomNowStatus([], at(0, "10:00")).text === "متاحة اليوم كله", "no rows: free all day");
check(roomNowStatus([row("09:00", "10:00")], at(1, "09:30")).state === "free-today", "rows of other days ignored");
check(roomNowStatus([row("09:00", "10:00"), row("10:05", "11:00")], at(0, "10:02")).text === "مشغولة حتى 11:00", "gap under 10 minutes ignored");
check(roomNowStatus([row("09:00", "10:00"), row("10:10", "11:00")], at(0, "10:02")).state === "busy-soon", "gap of exactly 10 minutes is real");
check(roomNowStatus([row("09:00", "11:00"), row("10:00", "10:30")], at(0, "10:45")).text === "مشغولة حتى 11:00", "overlapping rows");
check(roomNowStatus([row("", ""), { fsunday: true }, row("10:00", "09:00")], at(0, "10:00")).state === "free-today", "rows without times / inverted ignored");
check(roomNowStatus(rows, at(5, "10:00")).state === "none" && roomNowStatus(rows, at(5, "10:00")).text === "", "Friday none");
check(roomNowStatus(rows, at(6, "10:00")).state === "none", "Saturday none");
check(roomNowStatus(rows, at(0, "07:59")).state === "none", "07:59 none");
check(roomNowStatus(rows, at(0, "08:00")).state === "free-until", "08:00 inside day");
check(roomNowStatus(rows, at(0, "20:00")).state === "none", "20:00 none");
/* machine zone must not matter: 21:30 UTC Saturday is 00:30 Sunday in Kuwait (none); 06:00 UTC Sunday is 09:00 */
check(roomNowStatus(rows, new Date("2026-11-15T06:30:00Z")).state === "busy-until", "UTC instant converted to Kuwait");
check(roomNowStatus(rows, new Date("2026-11-14T21:30:00Z")).state === "none", "Kuwait midnight rollover");
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
