/**
 * ملاحظة المالك 16: اختيارُ الأستاذ أعطى قاعةً لا تتّسع لشعبته — السعةُ لا النوع.
 * مقاعدُ الشعبة MaxStudent، فإن غابت فسقفُ اللائحة (seatCap، م.8). القاعةُ المعروفةُ الأصغر لا تُرشَّح،
 * والقاعةُ بلا سعةٍ مسجّلة تأتي بعد كل قاعةٍ معروفةٍ تكفي. وسقفٌ مفترَضٌ لا يُسقط قاعة.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { rankRequestRooms, type RankableRoom } from "../src/utils/requestRoomRanking";
import { seatCap } from "../src/utils/actualDemandSupply";

let passed = 0;
const check = (name: string, fn: () => void) => { fn(); passed += 1; console.log(`✓ ${name}`); };
const base = { courseSectionId: 4, nearBuildingIds: new Set<string>(), previousRoomIds: new Set<string>(), usage: new Map<string, number>() };
const room = (key: string, capacity: number | undefined, extra: Partial<RankableRoom> = {}): RankableRoom => ({ key, roomId: key, buildingId: "b1", capacity, fit: 1, sectionIds: [], ...extra });
const theoretical = { specialization: "theoretical" as const, excused: new Set<string>() };

check("مقررٌ بلا MaxStudent: المقاعدُ سقفُ طبيعته في اللائحة (م.8)", () => {
  assert.deepEqual(seatCap({ CourseCode: "X1", CourseTeachingMode: "theoretical" }, theoretical), { cap: 60, assumed: false });
  assert.deepEqual(seatCap({ CourseCode: "X1", CourseTeachingMode: "practical" }, theoretical), { cap: 25, assumed: false });
  assert.deepEqual(seatCap({ CourseCode: "X1" }, theoretical), { cap: 60, assumed: true });
});

check("القاعةُ المعروفةُ الأصغر من سقف الطبيعة لا تُرشَّح ولو غابت MaxStudent", () => {
  const seats = seatCap({ CourseCode: "X1", CourseTeachingMode: "theoretical" }, theoretical).cap;
  const ranked = rankRequestRooms([room("small", 30, { sectionIds: [4] }), room("big", 100)], { ...base, seats });
  assert.deepEqual(ranked.map(item => item.key), ["big"]);
});

check("القاعةُ بلا سعةٍ مسجّلة بعد كل قاعةٍ معروفةٍ تكفي — ولو كانت للقسم وقريبة", () => {
  const ranked = rankRequestRooms([
    room("unknown", undefined, { sectionIds: [4] }), room("enough", 45, { buildingId: "far" }), room("roomy", 100, { buildingId: "far" }),
  ], { ...base, nearBuildingIds: new Set(["b1"]), seats: 40 });
  assert.deepEqual(ranked.map(item => item.key), ["enough", "roomy", "unknown"]);
  assert.ok(ranked.some(item => item.key === "unknown"), "لا تُسقط: قد تكون المعروفةُ مشغولة وقتَ الطلب");
});

check("بلا قاعةٍ معروفةٍ تكفي: غيرُ المسجّلة تُرتَّب بتفضيلاتها كما كانت", () => {
  const ranked = rankRequestRooms([room("a", undefined), room("b", undefined, { sectionIds: [4] })], { ...base, seats: 40 });
  assert.deepEqual(ranked.map(item => item.key), ["b", "a"]);
});

check("سقفٌ مفترَض (لا سعةَ ولا طبيعة): الأصغرُ منه لا يُسقط، ويأتي آخراً", () => {
  const cap = seatCap({ CourseCode: "X1" }, theoretical);
  const ranked = rankRequestRooms([room("small", 30, { sectionIds: [4] }), room("unknown", undefined), room("big", 100)], { ...base, seats: cap.cap, seatsAssumed: cap.assumed });
  assert.deepEqual(ranked.map(item => item.key), ["big", "unknown", "small"]);
});

check("الحكمُ يقرأ المقاعد من seatCap وسياق سعة القسم، لا من MaxStudent وحدها", () => {
  const engine = fs.readFileSync("src/server/core/instructorRequests.ts", "utf8");
  assert.match(engine, /seatCap\(selectedCourse as any, capacityBySection\.get\(targetSectionId\)/);
  assert.match(engine, /seats: cap\.cap, seatsAssumed: cap\.assumed/);
  assert.doesNotMatch(engine, /seats: Number\(selectedCourse\?\.MaxStudent \|\| 0\)/);
});

console.log(`\n${passed} passed`);
