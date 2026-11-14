/**
 * ── «لماذا لا؟»: الحقلُ النقيّ لا يخالف السحب ─────────────────────────────────────
 *   P  تكافؤ: whyNot(cell).free ⇔ معاينةُ السحب بلا مانعٍ صلب (الأستاذ/القاعة/ضيق اليوم) على بياناتٍ عشوائيةٍ ثابتة البذرة.
 *   R  الأسباب: الأستاذ المشغول، القاعة المحجوزة، ضيقُ اليوم، القفل، الحجز، النمط، الخريجون، الدوام.
 *   T  الطبقات: حرّ/عنبري/أحمر، الترتيب، التعداد، النطق، وخاناتُ الموضع الحالي مستثناة.
 */
import { buildBusyIndex, indexedBlockers } from "../src/components/SchedulePhysics/blockerIndex";
import { buildDecision, buildMoveCandidate, PHYSICS_DAYS } from "../src/components/SchedulePhysics/physics";
import { whyNotCell, whyNotCensus, whyNotField, whyNotSpeech, WHY_META, type WhyNotInput } from "../src/utils/whyNot";
const roomIdentity = (b: unknown, h: unknown) => { const buildingKey = String(b ?? "").trim().toLowerCase(), hallKey = String(h ?? "").trim().toLowerCase(); return { buildingKey, hallKey, key: `${buildingKey}|${hallKey}` }; };

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`); }
};
const mins = (clock: string) => { const [h, m] = String(clock || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const clock = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
let seed = 20261114;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = <T,>(list: readonly T[]) => list[Math.floor(rnd() * list.length)];

const DAYS = PHYSICS_DAYS.map(d => ({ key: d.key as string, label: d.label }));
const slots: string[] = []; for (let t = 8 * 60; t < 18 * 60; t += 30) slots.push(clock(t));
const mk = (id: number, over: Record<string, any>): any => ({ id, AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdCourseId: 100 + id, AdCourseName: `مقرر ${id}`, SCode: String(id),
  AdInstructorId: 1, fsunday: false, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false, fstarttime: "08:00", fendtime: "08:50", AdRoomCode: "B1", AdRoomHall: "101", ...over });

const rows: any[] = [];
for (let i = 1; i <= 40; i++) {
  const day = pick(PHYSICS_DAYS).key; const start = 8 * 60 + 30 * Math.floor(rnd() * 16);
  rows.push(mk(i, { [day]: true, fstarttime: clock(start), fendtime: clock(start + 50), AdInstructorId: 1 + Math.floor(rnd() * 5), AdRoomCode: pick(["B1", "B2"]), AdRoomHall: pick(["101", "102", "103"]) }));
}
const index = buildBusyIndex(rows, row => { const id = roomIdentity(row.AdRoomCode, row.AdRoomHall); return id.buildingKey || id.hallKey ? id.key : ""; }, mins);
const blockers = (source: any, probe: any) => {
  const id = probe.AdRoomCode || probe.AdRoomHall ? roomIdentity(probe.AdRoomCode, probe.AdRoomHall) : null;
  const key = id && (id.buildingKey || id.hallKey) ? id.key : "";
  return indexedBlockers(index, source, probe, key, mins, other => `${other.AdCourseName} · ${other.fstarttime}`);
};
const GRID_END = 17 * 60;
const baseInput = (subject: any): WhyNotInput => ({ subject, days: DAYS, slots, gridEnd: GRID_END, mins,
  buildCandidate: (row, target) => buildMoveCandidate(row, target as any), blockers });

/** معاينةُ السحب كما تحكم: الطريقُ نفسُه الذي يمرّ به previewPhysicsTarget ثم dragField (ضيقُ اليوم). */
const dragFree = (subject: any, day: string, start: string) => {
  const candidate = buildMoveCandidate(subject, { day, start } as any);
  const found = blockers(subject, candidate);
  const to = Math.max(mins(candidate.fendtime), mins(start) + 1);
  const decision = buildDecision("k", null, null, null, found as any, found.length > 0, "");
  return decision.quality !== "impossible" && to <= GRID_END;
};

console.log("P تكافؤ الحقل والسحب");
let sampled = 0, mismatches = 0, freeSeen = 0, blockedSeen = 0;
for (const subject of rows.slice(0, 20)) {
  const input = baseInput(subject);
  for (const day of DAYS) for (const slot of slots) {
    const cell = whyNotCell(input, day.key, slot);
    const drag = dragFree(subject, day.key, slot);
    sampled += 1; if (cell.free !== drag) mismatches += 1;
    if (cell.free) freeSeen += 1; else blockedSeen += 1;
  }
}
check(sampled === 20 * 5 * slots.length && mismatches === 0, "P1 whyNot.free ⇔ معاينةُ السحب بلا مانع", { sampled, mismatches });
check(freeSeen > 50 && blockedSeen > 20, "P2 العيّنةُ تضمّ الحرّ والممنوع معاً", { freeSeen, blockedSeen });

console.log("R الأسباب");
const a = mk(900, { fsunday: true, fstarttime: "10:00", fendtime: "10:50", AdInstructorId: 77, AdRoomCode: "Z1", AdRoomHall: "9" });
const busyTeacher = mk(901, { fmonday: true, fstarttime: "09:00", fendtime: "09:50", AdInstructorId: 77, AdRoomCode: "Q", AdRoomHall: "1" });
const busyRoom = mk(902, { fmonday: true, fstarttime: "11:00", fendtime: "11:50", AdInstructorId: 78, AdRoomCode: "Z1", AdRoomHall: "9" });
const local = [a, busyTeacher, busyRoom];
const idx2 = buildBusyIndex(local, row => { const id = roomIdentity(row.AdRoomCode, row.AdRoomHall); return id.buildingKey || id.hallKey ? id.key : ""; }, mins);
const input2: WhyNotInput = { ...baseInput(a), blockers: (s, p) => { const id = roomIdentity(p.AdRoomCode, p.AdRoomHall); return indexedBlockers(idx2, s, p, id.buildingKey || id.hallKey ? id.key : "", mins, o => `${o.AdCourseName} · ${o.fstarttime}`); } };
const tCell = whyNotCell(input2, "fmonday", "09:00");
check(tCell.dominant === "instructor" && tCell.tier === "blocked" && /مقرر 901/.test(tCell.reasons[0].detail || ""), "R1 الأستاذ المشغول يحمل اسم المقرر المصطدم", tCell);
const rCell = whyNotCell(input2, "fmonday", "11:00");
check(rCell.dominant === "room" && !rCell.free, "R2 القاعة المحجوزة", rCell);
check(whyNotCell(input2, "fwednesday", "16:30").reasons.some(item => item.kind === "span") && whyNotCell(input2, "fwednesday", "16:30").tier === "blocked", "R3 ضيقُ اليوم (الاثنين/الأربعاء 80 دقيقة)");
check(whyNotCell({ ...input2, locked: "الاعتماد" }, "ftuesday", "12:00").dominant === "locked", "R4 القفل يمنع كل خانة");
const caution = whyNotCell({ ...input2, holdClash: () => [{ name: "سارة", on: ["room"] }], graduates: () => ({ percent: 20, blocked: 12 }), patternSwitch: day => day === "ftuesday" }, "ftuesday", "12:00");
check(caution.tier === "caution" && caution.free && caution.reasons.map(i => i.kind).join() === "hold,graduates,pattern", "R5 الأسباب اللينة: عنبريٌّ لا يمنع، وبترتيب الأهمية", caution);
check(whyNotCell({ ...input2, hours: { start: 9 * 60, end: 14 * 60 } }, "ftuesday", "15:00").reasons[0]?.detail === "دوام القسم", "R6 خارج دوام القسم ملاحظةٌ فقط");
check(whyNotCell(input2, "ftuesday", "12:00").tier === "free", "R7 خانةٌ بلا سبب خضراء");

console.log("T الحقل والتعداد");
const field = whyNotField(input2);
check(!field.has("fsunday:10:00") && field.size === 5 * slots.length - 1, "T1 خانةُ الموضع الحالي مستثناة");
const census = whyNotCensus(field);
check(census.total === field.size && census.free > 0 && (census.reasons.get("instructor") || 0) > 0, "T2 تعدادُ الأسباب والحرّ", { free: census.free, instructor: census.reasons.get("instructor") });
check(/متاحة/.test(whyNotSpeech(whyNotCell(input2, "ftuesday", "12:00"), "الثلاثاء")) && /الأستاذ مشغول/.test(whyNotSpeech(tCell, "الاثنين")), "T3 النطقُ بكلمات السبب");
check(Object.values(WHY_META).every(m => !/[٠-٩]/.test(m.label)), "T4 لا أرقام هندية");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
