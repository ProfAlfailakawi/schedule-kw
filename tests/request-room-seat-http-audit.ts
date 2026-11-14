/**
 * ── سعةُ القاعة في طلب الأستاذ على بيانات التجربة، وما يصل صفحتَه (المالك 2026-11-14) ─────────────
 * خادمٌ حقيقيّ في وضع التجربة (المنفذ SEAT_RULE_PORT، افتراضياً 3204):
 *   • قسمٌ له ثلاث قاعات: كبيرةٌ (50) وصغيرتان (25، 30)، ومقررٌ MaxStudent فيه 40.
 *   • زميلٌ يشغل الكبيرة الإثنين والأربعاء 11:00: نقلُ الأستاذ محاضرتَه إليها «غير متاح» بنصٍّ بلا قاعة،
 *     والقسمُ يرى المقاعد مقابل السعات، والبدائلُ أوقاتٌ فيها الكبيرةُ خالية (وهي المختارة)، ولا يُقترح 11:00.
 *   • وكلُّ جوابٍ من باب الأستاذ (البطاقة، الفحص، الفحص الجماعي، خريطة الأوقات، الحجز، الذاكرة) بلا حقل قاعةٍ ولا مبنى ولا رمزهما.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateSyntheticCivilId } from "../src/utils/civilId";
import { placeFieldsIn } from "../src/utils/teacherSafeFields";
import { ROOM_TOO_SMALL_TEXT } from "../src/utils/requestRoomRanking";

const port = Number(process.env.SEAT_RULE_PORT || 3204);
const base = `http://127.0.0.1:${port}`;
const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "seat-rule-http-"));
Object.assign(process.env, { DATA_MODE: "demo", NODE_ENV: "development", PORT: String(port), SCHEDULE_PRIVATE_DIR: privateDir, AUTO_IMPORT_LEGACY_DATA: "false" });

await import("../server.ts");
for (let attempt = 0; attempt < 150; attempt++) {
  try { if ((await fetch(`${base}/api/demo/config`)).ok) break; } catch { /* ينتظر الخادم */ }
  if (attempt === 149) { console.error("Local HTTP server did not start"); process.exit(1); }
  await new Promise(resolve => setTimeout(resolve, 100));
}
const { Repository } = await import("../src/db/repository");
const { invalidateLocationRegistry } = await import("../src/server/core/locations");
const { judgeRequestItems } = await import("../src/server/core/instructorRequests");

let passed = 0;
const ok = (condition: unknown, name: string) => { assert.ok(condition, name); passed++; console.log(`✓ ${name}`); };
const SECRET = /SEATB|seat-(big|s1|s2)|"S1"|"S2"|"BIG"/;
const clean = (label: string, body: unknown) => {
  const fields = placeFieldsIn(body);
  ok(fields.length === 0, `${label}: لا حقلَ قاعةٍ ولا مبنى (${fields.slice(0, 4).join(", ")})`);
  ok(!SECRET.test(JSON.stringify(body)), `${label}: لا رمزَ قاعةٍ ولا مبنى في النص`);
};

const collegeId = 1, sectionId = 9204, termId = 990204;
let exitCode = 0;
try {
  const now = new Date().toISOString();
  const building = { id: "seat-b", officialCode: "SEATB", prefix: "SEATB", siteLetter: "", buildingNumber: "1", active: true, aliases: [], collegeIds: [collegeId], sectionIds: [sectionId],
    historicalUsageCount: 0, confidence: "CONFIRMED", source: "test", adminVerified: true, evidence: [], auditHistory: [], createdAt: now, updatedAt: now } as any;
  const room = (id: string, code: string, capacity: number) => ({ id, buildingId: "seat-b", buildingCode: "SEATB", canonicalCode: code, capacity, bookingPolicy: "normal", active: true, aliases: [],
    collegeIds: [collegeId], sectionIds: [sectionId], shared: false, historicalUsageCount: 0, confidence: "CONFIRMED", source: "test", adminVerified: true, evidence: [], auditHistory: [], createdAt: now, updatedAt: now }) as any;
  await Repository.upsertLocationBuildings([building]);
  await Repository.upsertLocationRooms([room("seat-big", "BIG", 50), room("seat-s1", "S1", 25), room("seat-s2", "S2", 30)]);
  invalidateLocationRegistry();

  const civil = generateSyntheticCivilId();
  const teacher = await Repository.createInstructor(civil, "اختبار سعة القاعة", "55509204");
  const colleague = await Repository.createInstructor(generateSyntheticCivilId(), "زميل سعة القاعة", "55519204");
  const course = await Repository.createCourse(collegeId, sectionId, "SEAT40", "مقرر السعة", 3, 3, 40, false, "", "theoretical");
  const other = await Repository.createCourse(collegeId, sectionId, "SEAT20", "مقرر الزميل", 3, 3, 20, false, "", "theoretical");
  const days = (list: string[]) => Object.fromEntries(["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"].map(day => [day, list.includes(day)]));
  const mine = await Repository.createSchedule({ AdTermId: termId, AdCollegeId: collegeId, AdSectionId: sectionId, AdCourseId: course.AdCourseId, AdInstructorId: teacher.AdInstructorId, SCode: "01",
    ...days(["fsunday", "ftuesday", "fthursday"]), fstarttime: "08:00", fendtime: "08:50", roomId: "seat-s1", buildingId: "seat-b", AdRoomCode: "SEATB", AdRoomHall: "S1", locationStatus: "VERIFIED" } as any);
  await Repository.createSchedule({ AdTermId: termId, AdCollegeId: collegeId, AdSectionId: sectionId, AdCourseId: other.AdCourseId, AdInstructorId: colleague.AdInstructorId, SCode: "02",
    ...days(["fmonday", "fwednesday"]), fstarttime: "11:00", fendtime: "12:20", roomId: "seat-big", buildingId: "seat-b", AdRoomCode: "SEATB", AdRoomHall: "BIG", locationStatus: "VERIFIED" } as any);

  const link = await Repository.createShareLink({ AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId, label: "seat rule", expiresAt: "2027-06-01T00:00:00.000Z",
    SystemUserId: 1, userName: "test", showInstructors: false, kind: "request", AdInstructorId: teacher.AdInstructorId, requestsCloseAt: "2027-06-01T00:00:00.000Z" } as any);
  const keep = { itemId: `seat-${mine.id}`, rowId: mine.id, action: "keep" as const,
    before: { courseId: course.AdCourseId, courseName: "مقرر السعة", collegeId, sectionId, sectionCode: "01", days: "ح · ث · خ", time: "08:00 – 08:50", room: "SEATB/S1" },
    slots: ["fsunday", "ftuesday", "fthursday"].map(day => ({ day: day as any, start: "08:00", end: "08:50" })) };
  const request = await Repository.createInstructorRequest({ AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId, AdInstructorId: teacher.AdInstructorId, linkId: link.id,
    window: { opensAt: "2026-01-01T00:00:00.000Z", closesAt: "2027-06-01T00:00:00.000Z" }, source: "draft", status: "sent", items: [keep], timeline: [],
    individualException: { opensAt: "2026-01-01T00:00:00.000Z", closesAt: "2027-06-01T00:00:00.000Z", grantedAt: "2026-01-01T00:00:00.000Z", grantedBy: "منسّق سرّي", reason: "سببٌ داخلي" } } as any);

  /* ── الحكمُ على بيانات التجربة ── */
  const moved = (start: string, end: string) => ({ ...request, items: [{ ...keep, action: "change" as const,
    after: { ...keep.before, room: undefined, days: "ن · ر", time: `${start} – ${end}` },
    slots: ["fmonday", "fwednesday"].map(day => ({ day: day as any, start, end })) }] }) as any;
  const forTeacher = (await judgeRequestItems(moved("11:00", "12:20"))).items[0];
  const forDept = (await judgeRequestItems(moved("11:00", "12:20"), { forDepartment: true })).items[0];
  const reason = forDept.reasons?.find(entry => entry.source === "room" && entry.blocking);
  ok(forTeacher.verdict === "conflict" && forTeacher.roomAvailable === false, "لا يخلو إلا الأصغر من الشعبة: الوقتُ غيرُ متاح للأستاذ");
  ok(forTeacher.reasons?.some(entry => entry.text === ROOM_TOO_SMALL_TEXT), "وسببُه «لا قاعة تتسع لشعبتك في هذا الوقت»");
  ok(/40/.test(reason?.detail || "") && /30، 25/.test(reason?.detail || ""), `والقسمُ يرى المقاعد مقابل سعات الخالي (${reason?.detail})`);
  ok(forDept.roomSeats?.seats === 40 && forDept.roomSeats.assumed === false, "ومقاعدُ الشعبة على البند للقسم");
  ok(!(forDept.roomCandidates || []).length, "ولا قاعةَ تُختار له");
  const alternatives = forDept.nearestTimes || [];
  ok(alternatives.length > 0 && alternatives.every(slot => slot.start !== "11:00"), `البدائلُ لا تقترح 11:00 (${alternatives.map(slot => slot.start).join(", ")})`);
  for (const slot of alternatives) {
    const judged = (await judgeRequestItems(moved(slot.start, slot.end), { forDepartment: true })).items[0];
    ok(judged.roomAvailable === true && judged.roomCandidates?.[0] === "id:seat-big" && judged.roomOptions?.[0]?.seatFit === "fits" && judged.roomOptions?.[0]?.capacity === 50,
      `البديلُ ${slot.start}: القاعةُ المختارة تتّسع (50 ≥ 40)`);
  }
  const early = (await judgeRequestItems(moved("08:00", "09:20"), { forDepartment: true })).items[0];
  ok(early.roomCandidates?.join(",") === "id:seat-big", "وقتٌ تخلو فيه القاعاتُ كلُّها: لا يُرشَّح إلا ما يتّسع");

  /* ── ما يصل صفحةَ الأستاذ ── */
  const token = encodeURIComponent(link.id);
  const card = await (await fetch(`${base}/api/public/request/${token}`)).json() as any;
  ok(card.request?.items?.length === 1, "البطاقةُ تُقرأ");
  clean("البطاقة", card);
  ok(card.request.individualException && !card.request.individualException.grantedBy && !card.request.individualException.reason, "الاستثناءُ الفرديّ بلا مانحه ولا سببه");

  const post = (route: string, body: unknown) => fetch(`${base}/api/public/request/${token}/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const draft = [{ rowId: mine.id, action: "change", days: ["fmonday", "fwednesday"], start: "11:00" }];
  const checked = await (await post("check", { rowId: mine.id, action: "change", days: ["fmonday", "fwednesday"], start: "11:00", items: draft, itemIndex: 0 })).json() as any;
  ok(checked.kind === "conflict" && checked.roomAvailable === false && checked.headline === ROOM_TOO_SMALL_TEXT, `الفحص: غيرُ متاح بنصٍّ بلا قاعة (${checked.headline})`);
  clean("الفحص", checked);
  const batch = await (await post("check-batch", { items: draft })).json() as any;
  ok(Array.isArray(batch.items) && batch.items[0]?.kind === "conflict", "الفحصُ الجماعي: غيرُ متاح");
  clean("الفحص الجماعي", batch);
  const times = await (await post("check-times", { items: draft, itemIndex: 0, starts: ["08:00", "11:00"] })).json() as any;
  ok(times.times?.["11:00"] === "bad" && times.times?.["08:00"] === "ok", `خريطةُ الأوقات: 11:00 ممنوع و08:00 متاح (${JSON.stringify(times.times)})`);
  clean("خريطة الأوقات", times);
  const held = await (await post("hold", { items: draft, itemIndex: 0 })).json() as any;
  ok(held.held === false, "لا يُحجز وقتٌ لا قاعةَ فيه تتّسع");
  clean("الحجز", held);
  const okDraft = [{ rowId: mine.id, action: "change", days: ["fmonday", "fwednesday"], start: "08:00" }];
  const heldOk = await (await post("hold", { items: okDraft, itemIndex: 0 })).json() as any;
  ok(heldOk.held === true, "وقتٌ فيه قاعةٌ تتّسع يُحجز");
  clean("الحجز المتاح", heldOk);
  const ledger = await Repository.getInstructorRequestReservations(termId) as any[];
  const hold = ledger.find(entry => entry.requestId === request.id);
  ok(hold?.room?.roomId === "seat-big" && hold.room.capacity === 50 && hold.room.seatFit === "fits", "والقاعةُ المحجوزة هي التي تتّسع، وسعتُها معها للقسم");
  clean("الذاكرة", await (await fetch(`${base}/api/public/request/${token}/previous`)).json());
  clean("الحركة", await (await fetch(`${base}/api/public/request/${token}/movement`)).json());

  /* ── قاعةٌ بلا سعةٍ مسجّلة: تُنقذ الوقتَ موسومةً، ولا تسبق المعروفةَ التي تكفي ── */
  await Repository.upsertLocationRooms([{ ...room("seat-nocap", "NC", 0), capacity: null }]);
  invalidateLocationRegistry();
  const flagged = (await judgeRequestItems(moved("11:00", "12:20"), { forDepartment: true })).items[0];
  ok(flagged.roomAvailable === true && flagged.roomOptions?.[0]?.roomId === "seat-nocap" && flagged.roomOptions[0].seatFit === "unknown" && !flagged.roomOptions.some(option => option.seatFit === "short"),
    "الكبيرةُ مشغولة: غيرُ المسجّلة تُختار موسومةً «سعة غير مسجّلة»، والأصغرُ لا");
  const preferKnown = (await judgeRequestItems(moved("08:00", "09:20"), { forDepartment: true })).items[0];
  ok(preferKnown.roomOptions?.[0]?.roomId === "seat-big" && preferKnown.roomOptions[0].seatFit === "fits", "وحين تخلو الكبيرةُ تسبق غيرَ المسجّلة");
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  fs.rmSync(privateDir, { recursive: true, force: true });
  console.log(`\n${passed} passed${exitCode ? ", FAILED" : ""}`);
  process.exit(exitCode);
}
