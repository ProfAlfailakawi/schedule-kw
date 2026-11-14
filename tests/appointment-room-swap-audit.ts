/**
 * ── «بدّل القاعتين» داخل الموعد (7) ─────────────────────────────────────────
 *
 *  G  اتجاه give: موعدي في قاعةٍ لا تلائمه وقاعتي الملائمة حرّة؛ تنتقل إليها وتُفسح قاعتي لشعبةٍ تحتاج نوعها.
 *  T  اتجاه take: لا قاعةَ ملائمةً حرّة لموعدي؛ شعبةٌ في غير مكانها تخرج إلى قاعتها وآخذ قاعتها.
 *  C  السعةُ شرطٌ صلب: لا قاعةَ سعتُها دون مقاعد المقرر ولا مجهولةُ السعة لمقررٍ له مقاعد.
 *  N  لا اقتراح حين القاعة ملائمة، ولا بطاقةَ بلا تبديل، والحدّ اثنان.
 *  S  الربط في المصدر: الخادم يحكم بمانع الحفظ، والتنفيذ عبر move-batch الذرّي مع تراجع، والبطاقة بجانب مقترحات القاعة.
 */
import fs from "node:fs";
import { appointmentRoomSwaps, roomIsGood, roomProblems, type RoomSwapCourse, type RoomSwapHall } from "../src/utils/appointmentRoomSwap";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra ?? ""); }
};

const hall = (code: string, roomType: string, capacity: number | null, building = "B1"): RoomSwapHall => ({ room: "G", hall: code, buildingId: building, roomId: `r-${code}`, roomType, capacity });
const G20 = hall("G20", "قاعة تدريس", 40), G21 = hall("G21", "ورشة", 30), G22 = hall("G22", "ورشة", 12), G23 = hall("G23", "ورشة", null), G30 = hall("G30", "ورشة", 30);
const halls = [G20, G21, G22, G23, G30];
const courses = new Map<number, RoomSwapCourse>([
  [1, { AdCourseId: 1, CourseName: "ورشة النجارة", CourseRoomType: "ورشة", MaxStudent: 25 }],
  [2, { AdCourseId: 2, CourseName: "مقدمة في التصميم", CourseRoomType: "قاعة تدريس", MaxStudent: 35 }],
  [3, { AdCourseId: 3, CourseName: "مقرر بلا نوع", MaxStudent: 20 }],
]);
const row = (id: number, courseId: number, h: RoomSwapHall, start = "08:00", end = "09:30", extra: any = {}): any => ({
  id, rev: 1, AdCourseId: courseId, SCode: String(id), AdCollegeId: 1, AdSectionId: 1, AdTermId: 1,
  AdRoomCode: h.room, AdRoomHall: h.hall, roomId: h.roomId, buildingId: h.buildingId, locationStatus: "VERIFIED",
  fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false, fstarttime: start, fendtime: end, ...extra,
});
const draftOf = (courseId: number, h: RoomSwapHall | null, start = "08:00", end = "09:30"): any => ({
  AdCourseId: courseId, fsunday: true, ftuesday: true, fstarttime: start, fendtime: end,
  ...(h ? { AdRoomCode: h.room, AdRoomHall: h.hall, roomId: h.roomId, buildingId: h.buildingId, locationStatus: "VERIFIED" } : {}),
});
const movable = () => true;

/* ── أساسات ──────────────────────────────────────────────────────────── */
check(roomProblems(courses.get(1), G20).join() === "type", "أساس: ورشةٌ في قاعة تدريس ← نوع", roomProblems(courses.get(1), G20));
check(roomProblems(courses.get(1), G22).join() === "capacity", "أساس: ورشةٌ بسعة 25 في قاعةٍ سعتها 12 ← سعة", roomProblems(courses.get(1), G22));
check(roomIsGood(courses.get(1), G21) && !roomIsGood(courses.get(1), G22) && !roomIsGood(courses.get(1), G23) && !roomIsGood(courses.get(1), G20), "C1 الملائمة: نوع يطابق وسعة معروفة تكفي؛ الأصغر والمجهولة والنوع المختلف لا", [G21, G22, G23, G20].map(h => roomIsGood(courses.get(1), h)));
check(roomIsGood(courses.get(3), G20, "قاعة تدريس") && !roomIsGood(courses.get(3), G22, "ورشة") && !roomIsGood(courses.get(3), G21, "قاعة تدريس") && !roomIsGood(courses.get(3), G20), "C2 مقررٌ بلا نوع: لا يُرسَل إلى قاعةٍ متخصّصة (نوعُ قاعته الحالية وحده) والسعة تحكم", [roomIsGood(courses.get(3), G20, "قاعة تدريس"), roomIsGood(courses.get(3), G22, "ورشة")]);

/* ── give: ورشةٌ في G20، G21 حرّة، ومقدمةٌ في G30 (ورشة) تحتاج قاعة تدريس ─────────── */
{
  const rows = [row(10, 2, G30, "10:00", "11:30")];
  const answer = appointmentRoomSwaps({ draft: draftOf(1, G20), rows, halls, courses, movable });
  check(answer.need === "poor", "G1 قاعةٌ غير ملائمة ← need=poor", answer.need);
  const swap = answer.swaps[0];
  check(swap?.direction === "give" && swap.mine.from?.hall === "G20" && swap.mine.to.hall === "G21", "G2 موعدي ينتقل إلى G21 (قاعتي الملائمة الحرّة)", swap);
  check(swap?.other.rowId === 10 && swap.other.from.hall === "G30" && swap.other.to.hall === "G20", "G3 شعبة المقدمة تنتقل إلى G20 المُفسَحة", swap?.other);
  check(swap?.reasons.join() === "type", "G4 السببُ نوع القاعة", swap?.reasons);
  check(answer.swaps.every(item => roomIsGood(courses.get(item.other.courseId), item.other.to)), "G5 الشعبة الأخرى تصل إلى قاعةٍ ملائمة لها");
  /* قاعتي المفسَحة مشغولةٌ في وقت الشعبة الأخرى ← لا اقتراح */
  const busy = appointmentRoomSwaps({ draft: draftOf(1, G20), rows: [row(10, 2, G30, "10:00", "11:30"), row(11, 3, G20, "10:30", "11:00")], halls, courses, movable });
  check(!busy.swaps.length, "G6 القاعة المُفسَحة مشغولة في وقت الشعبة الأخرى ← لا تبديل", busy.swaps);
  /* لا شعبةٌ في غير مكانها ← لا تبديل (يكفيه اقتراح القاعة العادي) */
  const lone = appointmentRoomSwaps({ draft: draftOf(1, G20), rows: [row(10, 2, G20, "10:00", "11:30")], halls, courses, movable });
  check(!lone.swaps.length, "G7 لا أحد في غير مكانه ← لا بطاقة", lone.swaps);
}

/* ── take: كل قاعات الورش مشغولة، وG21 يشغلها مقررٌ ملائمٌ لقاعة التدريس ───────────── */
{
  const rows = [row(20, 2, G21), row(21, 1, G30), row(22, 1, G22), row(23, 1, G23)];
  const answer = appointmentRoomSwaps({ draft: draftOf(1, null), rows, halls, courses, movable });
  check(answer.need === "none", "T1 لا قاعةَ ملائمةً حرّة ولم تُختر قاعة ← need=none", answer.need);
  const swap = answer.swaps[0];
  check(swap?.direction === "take" && swap.mine.to.hall === "G21" && swap.other.rowId === 20 && swap.other.to.hall === "G20", "T2 المقدمة تخرج من G21 إلى G20 وأنا آخذ G21", swap);
  check(!answer.swaps.some(item => item.mine.to.hall === "G22" || item.mine.to.hall === "G23"), "T3 لا تُقترح لي قاعةٌ أصغر من المقاعد أو مجهولة السعة", answer.swaps.map(item => item.mine.to.hall));
  /* مخرجُ الشعبة الأخرى مشغول ← لا تبديل */
  const stuck = appointmentRoomSwaps({ draft: draftOf(1, null), rows: [...rows, row(24, 3, G20)], halls, courses, movable });
  check(!stuck.swaps.length, "T4 لا مخرجَ ملائماً للشعبة الأخرى ← لا تبديل", stuck.swaps);
  /* موعدٌ في قاعةٍ ملائمةٍ حرّة ← لا حاجة */
  const fine = appointmentRoomSwaps({ draft: draftOf(1, G21), rows: [], halls, courses, movable });
  check(fine.need === null && !fine.swaps.length, "N1 القاعة ملائمة ← لا اقتراح", fine);
  /* قاعاتٌ من قسمٍ آخر لا تُحرَّك */
  const foreign = appointmentRoomSwaps({ draft: draftOf(1, null), rows, halls, courses, movable: () => false });
  check(!foreign.swaps.length, "N2 الشعب خارج القسم لا تُحرَّك", foreign.swaps);
}

/* ── الحدّ اثنان، ولا تكرار لشعبةٍ واحدة ─────────────────────────────── */
{
  const many = [row(30, 2, G30, "10:00", "11:30"), row(31, 2, G30, "12:00", "13:30"), row(32, 2, G30, "14:00", "15:30")];
  const answer = appointmentRoomSwaps({ draft: draftOf(1, G20), rows: many, halls, courses, movable }, 2);
  check(answer.swaps.length === 2 && new Set(answer.swaps.map(item => item.other.rowId)).size === 2, "N3 الحدّ اثنان بلا تكرار الشعبة", answer.swaps.map(item => item.other.rowId));
}

/* ── مرفقٌ مرافق: الشعبة لا تغادر مبناها ───────────────────────────────── */
{
  const far = hall("G20", "قاعة تدريس", 40, "B2");
  const rows = [row(40, 2, G30, "10:00", "11:30", { companionRoomId: "c1" })];
  const answer = appointmentRoomSwaps({ draft: draftOf(1, far), rows, halls: [far, G21, G30], courses, movable });
  check(!answer.swaps.length, "F1 شعبةٌ بمرفق مرافق لا تنتقل إلى مبنى آخر", answer.swaps);
}

/* ── الربط في المصدر ───────────────────────────────────────────────────── */
const route = fs.readFileSync("src/server/routes/scheduleToolsRoutes.ts", "utf8");
const schedules = fs.readFileSync("src/components/Schedules.tsx", "utf8");
const quick = fs.readFileSync("src/components/QuickCreatePopover.tsx", "utf8");
const card = fs.readFileSync("src/components/RoomSwapCard.tsx", "utf8");
check(/\/api\/schedules\/room-swap-ideas/.test(route) && /scheduleConflicts\(conflictReq, otherRow/.test(route) && /scheduleConflicts\(conflictReq, mine/.test(route), "S1 الخادم يحكم على الشعبتين بمانع الحفظ قبل العرض");
check(/appointmentRoomSwaps\(/.test(route) && /requirePermission\(7\)/.test(route.slice(route.indexOf("room-swap-ideas"), route.indexOf("room-swap-ideas") + 200)), "S2 المسار للقسم (permission 7) فوق المحرّك النقي");
check(/applyRoomSwapMove/.test(schedules) && /api\/schedules\/move-batch/.test(schedules.slice(schedules.indexOf("applyRoomSwapMove"))) && /offerUndo\(`تبديل قاعة/.test(schedules) && /visualConfirm\(\{\s*title: "بدّل القاعتين"/.test(schedules), "S3 التنفيذ: تأكيدٌ ثم move-batch الذرّي ثم تراجع");
check(/<RoomSwapCard swaps=\{roomSwapIdeas\}/.test(schedules) && /<RoomSwapCard swaps=\{roomSwapIdeas\}/.test(quick) && /onSwapRooms=\{applyRoomSwapMove\}/.test(schedules), "S4 البطاقة في المحرر الكامل و«موعد جديد» بجانب القاعة");
check(!/اقترح قاعة|setForm\(/.test(card), "S5 البطاقة لا تكتب شيئاً بنفسها (العرض وحده)");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
