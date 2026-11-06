import fs from "fs";
import { GENERAL_ROOM_LABEL, cleanRoomTypeScopes, isForeignSpecialised, roomTypeIn, roomViewForSection, visibleRoomTypes } from "../src/utils/roomTypeForSection";
import { borrowFit, roomSuitability } from "../src/utils/roomSuitability";
import { computeScheduleDataReadiness } from "../src/utils/scheduleDataReadiness";
import { readServerSource } from "./helpers/serverSource.mjs";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const TECH = 1, MUSIC = 2, ART = 3;
const scopes = { "استوديو صوت": [TECH], "قاعة موسيقى": [MUSIC] };
const types = ["تدريسية", "استوديو صوت", "قاعة موسيقى"];

/* الظهور حسب القسم */
check(visibleRoomTypes(types, TECH, scopes).join() === "تدريسية,استوديو صوت", "قسمنا يرى نوعه والعام");
check(visibleRoomTypes(types, MUSIC, scopes).join() === "تدريسية,قاعة موسيقى", "الموسيقى ترى نوعها لا استوديو الصوت");
check(visibleRoomTypes(types, ART, scopes).join() === "تدريسية", "قسمٌ بلا نوعٍ خاص يرى العام وحده");
check(visibleRoomTypes(types, null, scopes).length === 3, "المدير يرى السجل كله ليضبطه");
check(visibleRoomTypes(types, ART, {}).length === 3, "بلا ضبط لا يتغير شيء");

/* سجل واحد: G49 قاعة واحدة باسمين */
const g49 = { id: "g49", canonicalCode: "G49", roomType: "تدريسية", sectionRoomTypes: { [TECH]: "استوديو صوت" }, sectionIds: [TECH], capacity: 20, auditHistory: [{ after: { sectionRoomTypes: { [TECH]: "استوديو صوت" } } }] };
check(roomTypeIn(g49, TECH, scopes) === "استوديو صوت", "قسمنا يرى G49 استوديو صوت");
check(roomTypeIn(g49, ART, scopes) === "تدريسية", "غيره يراها بنوعها العام");
const legacy = { roomType: "استوديو صوت", sectionIds: [TECH] };
check(roomTypeIn(legacy, ART, scopes) === GENERAL_ROOM_LABEL, "نوعٌ عام متخصص مخزّن قديماً لا يتسرب");
check(roomTypeIn(legacy, ART) === "استوديو صوت", "بلا نطاق تبقى القراءة كما كانت (المرافق والحفظ)");
const view = roomViewForSection(g49, ART, scopes);
check(!JSON.stringify(view).includes("استوديو صوت"), "ما يصل متصفح القسم الآخر خالٍ من اسم النوع المتخصص");
check(view.id === g49.id && view.canonicalCode === "G49", "النسخة المعروضة للقاعة نفسها بمعرّفها");
check(g49.roomType === "تدريسية" && g49.auditHistory.length === 1, "الإسقاط لا يغيّر السجل المخزّن");
const scopeRoute = readServerSource().split('/scope",requirePermission(7)')[1]?.split('app.delete(')[0] || "";
check(scopeRoute.includes("setLocationRoomTypeScopes") && !/upsertLocationRooms|createLocationRoom/.test(scopeRoute), "ضبط النوع لا يكتب قاعة ولا ينسخها");

/* الاستعارة بتنبيه لا يمنع */
const fit = borrowFit(g49, ART, 60, scopes);
check(fit.specialised && fit.capacityShort && fit.warn, "مستعيرٌ بستين طالباً يُنبَّه للتخصص والسعة");
check(!borrowFit(g49, TECH, 15, scopes).warn, "صاحب القاعة لا يُنبَّه");
check(!isForeignSpecialised({ ...g49, sectionIds: [TECH, ART] }, ART, scopes), "القسم المرتبط بها يراها عامة بلا تنبيه تخصص");
check(borrowFit({ roomType: "تدريسية", capacity: 30 }, ART, 60, scopes).capacityShort, "السعة تُنبَّه ولو كانت القاعة عامة");
const hall = readServerSource();
const post = hall.slice(hall.indexOf('app.post("/api/hall-barter/requests"'), hall.indexOf('/api/hall-barter/requests/:id/respond'));
check(hall.includes("fit:borrowFit(room,sectionId,expectedSeats,registry.roomTypeScopes)"), "لوحة الاستعارة تحسب الملاءمة");
check(!/\bfit\b/.test(post), "طلب الاستعارة لا يتوقف على الملاءمة");
check(fs.readFileSync("src/components/LocationPicker.tsx", "utf8").includes("foreignRoom?<span>"), "نموذج الموعد يعرض التنبيه");
check(!/disabled=\{[^}]*fit/.test(fs.readFileSync("src/components/HallBarterBoard.tsx", "utf8")), "زر الاستعارة لا يتعطل بالتنبيه");
const reasons = roomSuitability({ CourseRoomType: "تدريسية" }, legacy, ART, scopes).reasons.join(" ");
check(!reasons.includes("استوديو صوت"), "أسباب الاقتراح لا تذكر النوع المتخصص");

/* البيانات والصلاحية */
check(Object.keys(cleanRoomTypeScopes({ "نوع": [], "آخر": [1, 1, "x"] })).join() === "آخر", "النطاق الفارغ يعيد النوع عامّاً");
check(/location-room-types\/:type\/scope",requirePermission\(7\),requireRootAdmin/.test(hall), "ضبط النوع بصلاحية إدارة الأنواع نفسها");
check(hall.includes("const rawRegistry=!sectionId&&isPowerUser(req)"), "السجل الخام للمدير وحده");
const readiness = computeScheduleDataReadiness({
  rows: [{ id: 1, AdCourseId: 9, AdSectionId: ART, AdInstructorId: 1, roomId: "r", AdRoomHall: "S1", SCode: "1" }], courses: [{ AdCourseId: 9, CourseRoomType: "تدريسية", MaxStudent: 10 }],
  instructorIds: new Set([1]), rooms: [{ id: "r", roomType: "استوديو صوت", sectionIds: [TECH], capacity: 20, canonicalCode: "S1" }], roomTypeOptions: ["تدريسية"], roomTypeScopes: scopes,
});
check(!JSON.stringify(readiness).includes("استوديو صوت"), "جاهزية البيانات تقرأ النوع كما يراه القسم");
check(fs.readFileSync("src/components/Reports.tsx", "utf8").includes("roomTypeIn(room as any, row.AdSectionId, locationRegistry.roomTypeScopes)"), "التقارير تقارن بنوع القاعة عند قسم الموعد");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
