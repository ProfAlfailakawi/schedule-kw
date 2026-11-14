/**
 * ── كرتُ الأستاذ: سُلّمُ البدايات في كل ما يختاره بنفسه، والقاعةُ لا تُذكر له (المالك 2026-11-14) ──────
 *  T1  مقرّرٌ جديد الاثنين 8:30 ممنوع «غير معتمد في اللائحة» ومعه «الأقرب: 8:00 أو 9:30».
 *  T2  تعديلُ موعدٍ قائمٍ للأستاذ نفسه إلى الاثنين 8:30 ممنوعٌ كذلك، ولا يُعفيه رقمُ صفٍّ ولا صفوفٌ مرتبطة.
 *  T3  الشعبةُ الشاغرة القائمة تُؤخذ كما هي (لا يُحكم على بدايتها)، والبدايةُ على السُّلّم تمضي.
 *  T4  ما عرضه القسمُ نفسُه بعينه لا يُمنع (تنبيهٌ للقسم)، ومصدرُ الإعفاء مطابقةُ (الأيام، البداية) وحدها.
 *  T5  الأيامُ من أسرتين: كل يومٍ يمرّ بسُلّمه، ولا يمرّ يومُ الاثنين الطويل بسُلّم الأحد القصير.
 *  R1  الحجزُ الآليّ لا يأخذ قاعةً أصغرَ من المقاعد أبداً: إن لم تبقَ إلا الأصغر رُفض الحجز، وإن كانت معها قاعةٌ تكفي أُخذت.
 *  R2  لا قاعةَ ولا مبنى ولا سعةً ولا رسالةَ قاعةٍ في صفحة الأستاذ وما يصله من جواب الخادم؛ والمنعُ بسببه المحايد.
 */
import fs from "node:fs";
import { judgeRequest } from "../src/utils/instructorRequestVerdict";
import { allocateRequestReservations, RequestReservationConflict } from "../src/utils/instructorRequestReservations";
import { ROOM_TOO_SMALL_TEXT } from "../src/utils/requestRoomRanking";
import { placeFieldsIn, withoutPlaceFields } from "../src/utils/teacherSafeFields";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail: unknown = "") => {
  if (ok) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name}`, typeof detail === "string" ? detail : JSON.stringify(detail)); }
};

const course = { AdCourseId: 77, CourseHours: 3, CourseName: "مقرر تجريبي", CourseCode: "T77" } as any;
const own = { id: 9, AdTermId: 1, AdCollegeId: 1, AdSectionId: 1, AdCourseId: 77, AdInstructorId: 5, SCode: "01",
  fmonday: true, fwednesday: true, fstarttime: "09:30", fendtime: "10:50" } as any;
const context = (ladderBlocks: boolean) => ({
  instructorId: 5, allRows: [own], instructorRowsAfter: [own], courses: new Map([[77, course]]), instructors: new Map(),
  knownRoomKeys: ["legacy:T|1"], ladderBlocks,
}) as any;
const ask = (action: "add" | "change", start: string, days: string[], extra: Record<string, unknown> = {}) =>
  ({ rowId: action === "change" ? 9 : null, tempId: -1, action, AdCourseId: 77, days, start, ...extra }) as any;
const ladderReason = (verdict: ReturnType<typeof judgeRequest>) => verdict.reasons.find(reason => reason.code === "ladder");

console.log("T1 مقرّرٌ جديد خارج السُّلّم");
for (const days of [["fmonday"], ["fmonday", "fwednesday"], ["fwednesday"]]) {
  const verdict = judgeRequest(ask("add", "08:30", days), context(true));
  const reason = ladderReason(verdict);
  check(`إضافة ${days.join("+")} 8:30 ممنوعة`, !verdict.sendable && Boolean(reason?.blocking) && /غير معتمد في اللائحة/.test(reason?.text || ""), verdict.reasons);
  check(`وتقول الأقرب «8:00 أو 9:30» (${days.join("+")})`, /الأقرب: 8:00 أو 9:30\./.test(reason?.text || ""), reason?.text);
}
const sunday = judgeRequest(ask("add", "08:30", ["fsunday"]), context(true));
check("الأحد 8:30 ممنوع والأقرب «8:00 أو 9:00»", !sunday.sendable && /الأقرب: 8:00 أو 9:00\./.test(ladderReason(sunday)?.text || ""), ladderReason(sunday)?.text);

console.log("T2 تعديلُ موعدٍ قائم");
for (const days of [["fmonday"], ["fmonday", "fwednesday"]]) {
  const verdict = judgeRequest(ask("change", "08:30", days), context(true));
  check(`تعديل الصفّ نفسه إلى ${days.join("+")} 8:30 ممنوع`, !verdict.sendable && Boolean(ladderReason(verdict)?.blocking), verdict.reasons);
}
const linkedChange = judgeRequest(ask("change", "08:30", ["fmonday"], { relatedRowIds: [9] }), context(true));
check("وصفوفٌ مرتبطة بتعديلٍ لا تُعفيه (الإعفاءُ للشعبة الشاغرة المضافة وحدها)", !linkedChange.sendable && Boolean(ladderReason(linkedChange)?.blocking), linkedChange.reasons);
check("وتعديلٌ إلى 9:30 على السُّلّم لا يُمنع بالسُّلّم", !ladderReason(judgeRequest(ask("change", "11:00", ["fmonday", "fwednesday"]), context(true))));

console.log("T3 الشعبةُ الشاغرة القائمة");
const vacant = judgeRequest(ask("add", "08:30", ["fmonday"], { relatedRowIds: [9] }), context(true));
check("الشعبةُ الشاغرة (إضافة بصفوفها الرسمية) تُؤخذ كما هي", !ladderReason(vacant), vacant.reasons);
check("والاثنين 8:00 و9:30 على السُّلّم بلا سببِ سُلّم", ["08:00", "09:30"].every(start => !ladderReason(judgeRequest(ask("add", start, ["fmonday"]), context(true)))));

console.log("T4 ما عرضه القسمُ بعينه");
const offered = judgeRequest(ask("add", "08:30", ["fmonday"]), context(false));
check("حين عرضه القسمُ (ladderBlocks=false) لا يمنع، ويبقى تنبيهاً", !ladderReason(offered) && /غير معتمد|8:00|9:30|تبدأ/.test(offered.advice || ""), { advice: offered.advice, reasons: offered.reasons });
const core = fs.readFileSync("src/server/core/instructorRequests.ts", "utf8");
check("وإعفاءُ القسم مطابقةُ الأيام والبداية بعينهما من عروضه وحدها، لا من اختيار الأستاذ",
  /ladderBlocks: !options\.forDepartment && !offeredByDepartment/.test(core)
  && /chosenAlternativeIndex\(departmentOffers, days, slot\?\.start \|\| ""\) >= 0/.test(core)
  && /message\.from === "department"/.test(core));
const verdictSource = fs.readFileSync("src/utils/instructorRequestVerdict.ts", "utf8");
check("ولا يُعفى بصفوفٍ مرتبطة إلا إضافةُ الشعبة الشاغرة", /const vacantSection = Boolean\(request\.relatedRowIds\?\.length\) && request\.action === "add"/.test(verdictSource));

console.log("T5 أيامٌ من أسرتين");
const mixed = judgeRequest(ask("add", "09:00", ["fmonday", "fthursday"]), context(true));
check("الاثنين·الخميس 9:00 ممنوع (لا نمطَ معتمد، ولا سُلّمَ للاثنين عند 9:00)", !mixed.sendable && mixed.reasons.some(reason => reason.blocking), mixed.reasons);

console.log("R1 الحجزُ الآلي والسعة");
const request = (itemId: string) => ({ id: `r-${itemId}`, AdTermId: 1, AdCollegeId: 1, AdSectionId: 1, AdInstructorId: 5, status: "submitted", source: "draft",
  linkId: itemId, items: [{ itemId, rowId: null, action: "add", after: { courseId: 77 }, slots: [{ day: "fmonday", start: "09:30", end: "10:50" }] }],
  timeline: [], createdAt: "", updatedAt: "", window: {} }) as any;
const proposal = (itemId: string, rooms: any[]) => ({ itemId, instructorId: 5, courseId: 77, collegeId: 1, sectionId: 1, offeringRowIds: [],
  slots: [{ day: "fmonday", start: "09:30", end: "10:50" }], rooms }) as any;
const small = { roomId: "small", room: "A", hall: "1", capacity: 20, seatFit: "short" as const };
const big = { roomId: "big", room: "B", hall: "2", capacity: 60, seatFit: "fits" as const };
let threw = false;
try { allocateRequestReservations([], request("only-small"), [proposal("only-small", [small])], []); } catch (error) { threw = error instanceof RequestReservationConflict; }
check("لا تبقى إلا قاعةٌ أصغر من المقاعد: يُرفض الحجز ولا تُحجز", threw);
const picked = allocateRequestReservations([], request("both"), [proposal("both", [small, big])], []);
check("ومعها قاعةٌ تكفي: تُحجز التي تكفي لا الأصغر", picked.length === 1 && picked[0].room?.roomId === "big", picked);
const ranking = fs.readFileSync("src/utils/requestRoomRanking.ts", "utf8");
check("والترتيبُ يُسقط الأصغر قبل أيّ تفضيل، والحكمُ يقول «لا قاعة تتسع» بلا اسم", /const roomy = rooms\.filter\(room => fitOf\(room\) !== "short"\)/.test(ranking)
  && ROOM_TOO_SMALL_TEXT === "لا قاعة تتسع لشعبتك في هذا الوقت." && !/\d|قاعة\s+[A-Z]/.test(ROOM_TOO_SMALL_TEXT));

console.log("R2 لا قاعةَ في ما يصل الأستاذ");
const page = fs.readFileSync("src/server/pages/instructorRequestPage.ts", "utf8");
check("صفحةُ الأستاذ بلا إشارة قاعةٍ ولا رسالتها ولا سعةٍ ولا ملاءمة", !/roomSignalHtml|data-room-ok|roomOk|seatFit|roomSeats|roomOptions|reservedRoom|capacity/.test(page)
  && !page.includes("قاعة مناسبة تُحجز لك"));
const styles = fs.readFileSync("src/server/requestPageStyles.ts", "utf8");
check("ولا تنسيقَ لزرّ القاعة", !styles.includes(".room-ok"));
const leaky = {
  items: [{ roomOptions: [{ room: "B", hall: "2", capacity: 60, seatFit: "fits" }], roomSeats: { seats: 40 }, reservedRoom: { label: "B/2" }, roomCandidates: ["id:big"],
    reasons: [{ source: "room", code: "capacity", text: ROOM_TOO_SMALL_TEXT }], after: { room: "B", days: "الاثنين", time: "09:30 – 10:50" } }],
};
const clean = withoutPlaceFields(leaky);
check("التنقيةُ الأخيرة تُسقط القائمةَ والسعةَ والمحجوزة ولا تُبقي إلا السببَ المحايد", placeFieldsIn(clean).length === 0
  && !/"capacity":|"seatFit"|"seats"|B\/2/.test(JSON.stringify(clean))
  && clean.items[0].reasons[0].text === ROOM_TOO_SMALL_TEXT, clean);
const routes = fs.readFileSync("src/server/routes/publicRequestRoutes.ts", "utf8");
check("ومسارُ الجواب يحذف تفصيلَ السبب (المقاعد مقابل السعات) ويبقي نصَّه العام", /const \{ roomCandidates, roomOptions, offeringRows, roomPick, reservedRoom, roomSwitch, roomSeats, \.\.\.rest \} = item/.test(routes)
  && /map\(\(\{ detail: _detail, \.\.\.reason \}\)/.test(routes));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
