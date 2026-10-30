/**
 * ── كرت الأستاذ: منطق الأيام والأوقات بعد محاكاة 2026-10-30 ─────────────────
 *
 * ما كشفته المحاكاة الكاملة لـ«بطاقتي» ونموذج /r/، وما يثبّت إصلاحه هنا:
 *   1) محرّكٌ واحد للطول: الخادمُ والصفحةُ والحكمُ يحسبون الشيءَ نفسه من أنماط اللائحة
 *      (أو طول الموعد نفسه)، لا من ذاكرة القسم — كان نقلُ «ح·ث·خ 08:00» إلى 16:00 يُحفظ 75/75/50.
 *   2) سقفُ ساعات المقرّر عاد، ومقرّرُ الأربع ساعات على الاثنين والأربعاء لا يدور في حلقة.
 *   3) «ثبّت» لا يكتب صفّين لموعدٍ واحد حفظه المحرّكُ القديم.
 *   4) لا رمزَ قاعةٍ ولا مبنى في ما تكتبه اللجنة ويصل الأستاذ.
 *   5) الحجزُ المؤقّت بهويّة البند، ولا تُحسب حجوزُ الأستاذ نفسه عليه.
 *   6) موعدٌ واحد للإغلاق في البطاقة وصفحة الطلب.
 *   7) الصفحة: نهايةُ كل يوم في الصف وورقة التوقيع، والمحسومُ للقراءة، وسببُ الخادم يُقال،
 *      ومسودةٌ لكل تبويب، وإرسالٌ صادق بعد الانقطاع، والتركيزُ يبقى مكانه.
 */
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { lengthPatternsForHours, meetingMinutes, meetingSlots, ownMeetingOf, uniformPatternSlots, type OwnMeeting } from "../src/utils/requestMeetingLength";
import { REQUEST_LENGTH_SCRIPT } from "../src/server/requestLengthScript";
import { judgeRequest, type RequestedRow, type VerdictContext } from "../src/utils/instructorRequestVerdict";
import { scrubPlaceText, mentionsPlaceCode } from "../src/utils/teacherPlaceScrub";
import { holdRequestReservation, releaseRequestHolds, type RequestReservationProposal } from "../src/utils/instructorRequestReservations";
import { cardRequestsCloseAt } from "../src/utils/instructorRequestWindows";
import { instructorRequestPage } from "../src/server/pages/instructorRequestPage";
import { roomKeyOf } from "../src/utils/locationRegistry";
import type { AdCourse, AdInstructor, FSchedule, InstructorRequest } from "../src/types";
import { readServerSource } from "./helpers/serverSource.mjs";

let passed = 0, failed = 0;
const check = (ok: boolean, name: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 500)); }
};
const DAYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
type Day = typeof DAYS[number];

/* ── 1) المحرّكُ الواحد ─────────────────────────────────────────────────────── */
{
  const p3 = lengthPatternsForHours(3), p4 = lengthPatternsForHours(4), p5 = lengthPatternsForHours(5);
  check(meetingMinutes(["fsunday", "ftuesday", "fthursday"], p3).join() === "50,50,50", "ثلاث ساعات على الأحد والثلاثاء والخميس: ٥٠ د لكل يوم (لا 75/75/50)");
  check(meetingMinutes(["fmonday", "fwednesday"], p3).join() === "80,80", "وعلى الاثنين والأربعاء: ٨٠ د");
  check(meetingMinutes(["fwednesday"], p3).join() === "170", "ويومٌ واحد: كتلةُ اللائحة ١٧٠ د");
  check(meetingMinutes(["fmonday", "fwednesday"], p4).join() === "110,110", "أربع ساعات على الاثنين والأربعاء: ١١٠ د (لا 75 تُمنع «لا يغطّيها»)");
  check(meetingMinutes(["fmonday", "fwednesday"], p5).join() === "170,110", "والنمطُ المختلف الأطوال المعتمد يبقى كما هو (١٧٠/١١٠)");
  const twin: OwnMeeting = { days: ["fsunday", "ftuesday"], minutes: 75 };
  check(meetingMinutes(["ftuesday", "fsunday"], p3, twin).join() === "75,75", "الأيامُ نفسُها والوقتُ وحده تغيّر: طولُ الموعد نفسه (75)");
  check(meetingMinutes(["fmonday"], p3, { days: ["fthursday"], minutes: 75 }).join() === "75", "ولقاءُ يومٍ واحد يُنقل إلى يومٍ واحد يحمل طولَه");
  check(meetingMinutes(["fsunday", "ftuesday", "fthursday"], p3, twin).join() === "50,50,50", "وأيامٌ أخرى: نمطُ اللائحة لا طولُ الموعد القديم");
  check(meetingMinutes(["fsunday", "fmonday"], p3).join() === "50,80", "وأيامٌ لا نمطَ لها: طولُ اليوم في اللائحة، ويحكم الفحصُ بعدها");
  check(ownMeetingOf({ days: "الأحد · الثلاثاء", time: "11:00 – 12:15" })?.minutes === 75 && ownMeetingOf({ days: "", time: "" }) === null,
    "الموعدُ القائم يُقرأ من لقطته «كان»");
  check(meetingSlots(["fsunday"], "19:30", lengthPatternsForHours(1))[0]?.end === "20:20", "ولا تُقصّ النهايةُ عند الثامنة مساءً: 19:30 ← 20:20 (الفحصُ يمنعها بسببها)");

  /* الصفحةُ تحمل الخوارزميةَ نفسَها: جدولُ حالاتٍ يُقارَن بين النسختين. */
  const box: any = {};
  vm.runInNewContext(`${REQUEST_LENGTH_SCRIPT}\nthis.mm=meetingMinutes;this.ms=meetingSlots;`, box, { timeout: 1000 });
  const sets: Day[][] = [];
  for (let mask = 1; mask < 32; mask++) sets.push(DAYS.filter((_, k) => mask & (1 << k)) as Day[]);
  const owns: Array<OwnMeeting | null> = [null, { days: ["fsunday", "ftuesday"], minutes: 75 }, { days: ["fwednesday"], minutes: 230 }, { days: ["fmonday", "fwednesday", "fthursday"], minutes: 80 }];
  let same = true, cases = 0, first: unknown = null;
  for (const hours of [0, 1, 2, 3, 4, 5, 6]) for (const days of sets) for (const own of owns) {
    cases++;
    const server = JSON.stringify(meetingSlots(days, "09:30", lengthPatternsForHours(hours), own));
    const page = JSON.stringify(box.ms(days, "09:30", JSON.parse(JSON.stringify(lengthPatternsForHours(hours))), own));
    if (server !== page) { same = false; first = first || { hours, days, own, server, page }; }
  }
  check(same && cases === 7 * 31 * 4, `الصفحةُ والخادمُ يحسبان المواعيدَ نفسَها في ${cases} حالة`, first);
}

/* ── 2) الحكم: السقفُ عاد، وحلقةُ الأربع ساعات انتهت، وكلُّ اقتراحٍ يمرّ ─────────── */
{
  const TEACHER = 7;
  const row = (over: Partial<FSchedule> = {}): FSchedule => ({
    id: 1, AdCollegeId: 1, AdSectionId: 5, AdTermId: 20, AdCourseId: 100, AdCourseName: "مقرر", SCode: "01", AdInstructorId: TEACHER,
    fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: true, fstarttime: "08:00", fendtime: "08:50",
    AdRoomCode: "أ", AdRoomHall: "101", ...over,
  } as FSchedule);
  const course = (hours: number): AdCourse => ({ AdCourseId: 100, AdCollegeId: 1, AdSectionId: 5, CourseCode: "C100", CourseName: "مقرر", CourseCredit: hours, CourseHours: hours, MaxStudent: 25 } as AdCourse);
  const teacher = { AdInstructorId: TEACHER, AdInstructorCivil: "000000000007", AdInstructorName: "د. 7" } as AdInstructor;
  const ctx = (hours: number, rows: FSchedule[] = [row()]): VerdictContext => ({
    instructorId: TEACHER, allRows: rows, instructorRowsAfter: rows, courses: new Map([[100, course(hours)]]), instructors: new Map([[TEACHER, teacher]]),
    knownRoomKeys: ["101", "102", "103"].map(hall => roomKeyOf(undefined, "أ", hall)), startLadder: ["08:00", "09:00", "10:00"],
  });
  const ask = (over: Partial<RequestedRow>): RequestedRow => ({ rowId: 1, action: "change", AdCourseId: 100, days: ["fsunday", "ftuesday", "fthursday"], start: "16:00", ...over });

  const moved = judgeRequest(ask({}), ctx(3));
  check(moved.sendable && moved.computedEnd === "16:50", "نقلُ «ح·ث·خ 08:00–08:50» إلى 16:00 يبقى 16:00–16:50 في الحكم", moved);
  const legacy = judgeRequest(ask({ slots: [{ day: "fsunday", start: "16:00", end: "17:15" }, { day: "ftuesday", start: "16:00", end: "17:15" }, { day: "fthursday", start: "16:00", end: "16:50" }] as any }), ctx(3));
  check(!legacy.sendable && legacy.reasons.some(reason => reason.code === "hours" && /يتجاوز/.test(reason.text)),
    "و75/75/50 (٢٠٠ د لمقرّر ثلاث ساعات) يُمنع «يتجاوز» — سقفُ الساعات عاد بلا إعفاءٍ بالذاكرة", legacy.reasons);
  const overBefore = row({ fstarttime: "08:00", fendtime: "09:20" });
  const keepsOwn = judgeRequest(ask({ start: "10:00" }), ctx(3, [overBefore]));
  check(keepsOwn.sendable && keepsOwn.computedEnd === "11:20", "وشعبةٌ قائمة تتجاوز أصلاً لا تُمنع من نقل وقتها بطولها نفسه (لم تزد)", keepsOwn);

  const monWed4 = judgeRequest(ask({ action: "add", rowId: null, tempId: -1, days: ["fmonday", "fwednesday"], start: "08:00" } as any), ctx(4, []));
  check(monWed4.sendable && monWed4.computedEnd === "09:50", "مقرّرُ أربع ساعات على الاثنين والأربعاء: ١١٠ د ويمرّ (لا حلقة «جرّب الاثنين والأربعاء»)", monWed4);
  const thin = judgeRequest(ask({ action: "add", rowId: null, tempId: -1, days: ["fsunday", "ftuesday", "fthursday"], start: "08:00" } as any), ctx(4, []));
  check(!thin.sendable && (thin.shapes || []).length > 0, "وثلاثةُ أيامٍ بخمسين دقيقة لا تغطّي أربع ساعات: تُمنع ومعها الأنماط");
  check((thin.shapes || []).every(shape => {
    const applied = judgeRequest(ask({ action: "add", rowId: null, tempId: -1, days: shape.days as any, start: "08:00" } as any), ctx(4, []));
    const minutes = meetingMinutes(shape.days as Day[], lengthPatternsForHours(4));
    return applied.sendable && shape.label.includes(`${minutes[0]}د`);
  }), "وكلُّ نمطٍ يُقترح يمرّ حين يُطبَّق، ودقائقُه في الزرّ هي التي ستُحسب", thin.shapes);
  const keys = (thin.shapes || []).map(shape => shape.days.slice().sort().join());
  check(new Set(keys).size === keys.length, "ولا يتكرّر نمطٌ في الاقتراح");
}

/* ── 3) «ثبّت» لا يكتب صفّين لموعدٍ واحد ──────────────────────────────────────── */
{
  const legacy = [{ day: "fsunday", start: "09:00", end: "10:15" }, { day: "ftuesday", start: "09:00", end: "10:15" }, { day: "fthursday", start: "09:00", end: "09:50" }] as any;
  const fixed = uniformPatternSlots(legacy, 3);
  check(!!fixed && fixed.every(slot => slot.end === "09:50"), "طلبٌ حفظه المحرّكُ القديم 75/75/50 يُكتب بطول اللائحة صفّاً واحداً (09:00–09:50)", fixed);
  check(uniformPatternSlots([{ day: "fmonday", start: "08:00", end: "10:50" }, { day: "fwednesday", start: "08:00", end: "09:50" }] as any, 5) === null,
    "والنمطُ المعتمد المختلف الأطوال (١٧٠/١١٠) يبقى صفّين كما هو");
  check(uniformPatternSlots([{ day: "fsunday", start: "09:00", end: "09:50" }, { day: "ftuesday", start: "09:00", end: "09:50" }] as any, 3) === null,
    "والموحّدُ أصلاً لا يُمسّ");
  const routes = readFileSync("src/server/routes/instructorRequestsRoutes.ts", "utf8");
  check(routes.includes("slotTimeGroups(normalizedSlots.get(i) || item.slots || [])") && routes.includes("...(normalizedSlots.has(i) ? { slots: normalizedSlots.get(i)")
    && routes.includes("uniformPatternSlots((item.slots || []) as any, effectiveCourseHours(decideCourse))"),
    "والتثبيتُ والقرارُ يستعملانه، ويُحفظ الطولُ المكتوب على البند نفسه");
}

/* ── 4) لا رمزَ قاعةٍ ولا مبنى في ما يصل الأستاذ ─────────────────────────────────── */
{
  const cases: Array<[string, string]> = [
    ["القاعة 901A01/L01 محجوزة لمختبر في هذا الوقت", "القاعة محجوزة لمختبر في هذا الوقت"],
    ["نقترح الانتقال إلى B1/101 يوم الأحد", "نقترح الانتقال إلى القاعة يوم الأحد"],
    ["بالقاعة 7/31 تعارض", "بالقاعة تعارض"],
    ["في مبنى 901A01 الطابق الثاني", "في مبنى الطابق الثاني"],
    ["المختبر L01 مشغول", "المختبر مشغول"],
  ];
  for (const [input, want] of cases) check(scrubPlaceText(input) === want, `«${input}» ← «${want}»`, scrubPlaceText(input));
  for (const keep of ["موعدك 5/11 الساعة 14:00 في الفصل 2026/2027", "القاعة محجوزة لمختبر", "القاعة 14:00 مشغولة"])
    check(scrubPlaceText(keep) === keep && !mentionsPlaceCode(keep), `ويبقى «${keep}» كما هو (تاريخ، وقت، فصل)`);
  check(scrubPlaceText("تواصل بخصوص L01", ["901A01/L01", "L01"]) === "تواصل بخصوص القاعة", "ورموزُ قاعات البند تُمسح أينما وقعت");
  const server = readServerSource();
  check(server.includes("const placeTokens = (request.items || []).flatMap(item => roomTokensOf(item));")
    && server.includes("decision: { ...cleanDecision(rest.decision),") && server.includes("decisionHistory: rest.decisionHistory.map(cleanDecision)")
    && server.includes("thread: cleanThread(rest.thread)!") && server.includes("threadHistory: cleanThread(rest.threadHistory)")
    && server.includes(".map(event => (event.detail ? { ...event, detail: clean(event.detail) } : event))"),
    "ملاحظةُ الرفض وتاريخُ القرارات وردودُ الحوار والخطُّ الزمني تمرّ بالتنقية في نسخة الأستاذ (stripForInstructor)");
  check(server.includes("res.json(teacherSafeVerdict(judged, {") && server.includes("return teacherSafeVerdict(judged, {")
    && server.includes(".map(entry => ({ ...entry, text: scrubPlaceText(entry.text, placeTokens), label: scrubPlaceText(entry.label, placeTokens) }))"),
    "وسطرُ الحكم في الفحص والفحص الدفعي، وحركةُ الجدول، كذلك");
  check(readFileSync("src/server/pushMessages.ts", "utf8").includes("scrubPlaceText(scrubRooms(name, roomTokensOf(item)), roomTokensOf(item))"), "والإشعاراتُ كذلك");
}

/* ── 5) الحجزُ المؤقّت بهويّة البند، وحجوزُ الأستاذ نفسه لا تُحسب عليه ───────────────── */
{
  const soon = new Date(Date.now() + 10 * 60_000).toISOString();
  const request = (id: string) => ({ id, AdInstructorId: 70, AdTermId: 1, items: [], status: "sent" } as unknown as InstructorRequest);
  const monWed = [{ day: "fmonday", start: "12:30", end: "13:50" }, { day: "fwednesday", start: "12:30", end: "13:50" }] as any;
  const proposal = (itemId: string, slots = monWed): RequestReservationProposal => ({ itemId, instructorId: 70, collegeId: 1, sectionId: 4, courseId: 10, slots,
    rooms: [{ roomId: "room-a", room: "B1", hall: "101" }, { roomId: "room-b", room: "B1", hall: "102" }], offeringRowIds: [] });
  const a = request("req-a");
  let ledger = holdRequestReservation([], a, proposal("draft:new:abc"), [], soon);
  let refused = "";
  try { ledger = holdRequestReservation(ledger, a, proposal("draft:row:7"), [], soon); } catch (error: any) { refused = error.message; }
  check(!refused && ledger.length === 2, "اختيارٌ تركه الأستاذ لا يمنعه من الوقت نفسه لبندٍ آخر (كان «لديك موعد آخر» و«سبقك زميل»)", refused);
  const released = releaseRequestHolds(ledger, a.id, "draft:new:abc");
  check(released.length === 1 && released[0].itemId === "draft:row:7", "وإلغاءُ الإضافة يُفرج حجزَها وحدَه");
  check(releaseRequestHolds(ledger, a.id).length === 0, "والخروجُ يُفرج حجوزَ الطلب كلَّها كما كان");
  let lost = "";
  try { holdRequestReservation(ledger, request("req-b"), { ...proposal("draft:row:9"), instructorId: 71, rooms: [{ roomId: "room-a", room: "B1", hall: "101" }] }, [], soon); } catch (error: any) { lost = error.message; }
  check(/سبقك زميل/.test(lost), "وزميلٌ على القاعة نفسها في الوقت نفسه ما زال يُقال له «سبقك زميل»", lost);
  const server = readServerSource();
  check(server.includes("function draftHoldKey(entry: any): string") && server.includes("{ ...proposal, itemId: holdKey }") && !server.includes("itemId: `draft:${index}`")
    && server.includes('...(raceLost ? { code: "race-lost" } : { code: "hold-refused" })'),
    "والخادمُ يحجز بهويّة البند لا برقمه، و«سبقك زميل» لسباقٍ مع زميلٍ وحده");
}

/* ── 6) موعدٌ واحد للإغلاق ──────────────────────────────────────────────────────── */
{
  const now = Date.parse("2026-10-30T10:00:00Z");
  const own = { request: { window: { opensAt: "2026-10-24T00:00:00Z", closesAt: "2026-11-09T20:59:59Z" } }, windowOpen: true };
  check(cardRequestsCloseAt([own], "2026-11-13T20:59:59Z", now) === "2026-11-09T20:59:59Z", "البطاقةُ تقول موعدَ نافذة طلبه (9 نوفمبر) لا تاريخَ رابط البطاقة (13 نوفمبر)");
  const exception = { request: { ...own.request, individualException: { opensAt: "2026-10-29T00:00:00Z", closesAt: "2026-11-20T20:59:59Z", grantedAt: "", grantedBy: "", reason: "سفر" } }, windowOpen: true };
  check(cardRequestsCloseAt([exception], "2026-11-13T20:59:59Z", now) === "2026-11-20T20:59:59Z", "والاستثناءُ الشخصيُّ يغيّره له وحده");
  check(cardRequestsCloseAt([], "2026-11-13T20:59:59Z", now) === "2026-11-13T20:59:59Z", "وبلا طلبٍ له يبقى تاريخُ الرابط");
  check(readServerSource().includes('requestsCloseAt: cardRequestsCloseAt(eligibleRequests, link.requestsCloseAt || ""),'), "و«بطاقتي» تبنيه بالقاعدة نفسها");
}

/* ── 7) الصفحة ───────────────────────────────────────────────────────────────────── */
{
  const page = instructorRequestPage("tok", "nonce");
  const script = [...page.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(code => code.trim()).join("\n");
  let compiles = true;
  try { new vm.Script(script); } catch { compiles = false; }
  check(compiles, "سكربتُ الصفحة يُترجَم بلا خطأ");
  check(script.includes("function slotsFor(it,days,start)") && script.includes("if(sameSlots(it.computedSlots,days,start))return it.computedSlots;")
    && script.includes("return meetingSlots(days,start,lengthPatternsOf(it),it.action===\"change\"?ownOf(it):null)"),
    "الصفحةُ تأخذ مواعيدَ الخادم لهذه الأيام وهذه البداية، وإلا تحسبها بالمحرّك نفسه");
  check(script.includes("newTime=it.start?slotsText(slotsFor(it,it.days,it.start)):\"—\";"), "وصفُّ الجدول يقول نهايةَ كل يوم كما ستُحفظ");
  check(/function receiptLine\(it\)\{[\s\S]{0,400}ltr\(slotsText\(slotsFor\(it,it\.days,it\.start\)\)\)/.test(script), "وورقةُ التوقيع تقول النهايةَ مع البداية — ما يوقّعه هو ما يُطبَّق");
  check(script.includes("var fixed=!!(it.decision&&it.decision.state===\"fixed\");if(fixed)open=false;") && script.includes("ثبّته القسم في جدولك الرسمي، فلا يُعدَّل من هنا."),
    "وما ثبّته القسم للقراءة فقط، ومعه «اكتب للقسم»");
  check(script.includes("if(it&&it.decision&&it.decision.state===\"fixed\")return;") && script.includes("if(it.decision&&it.decision.state===\"fixed\")return;if(untouchedIn(draft,d))return;if(d.action!==it.action"),
    "ولا يُفحص من جديد، ولا تكتب عليه مسودةٌ قديمة");
  /* مسودةُ تبويبٍ آخر لا تُرجع بنداً لم يلمسه إلى «كما هو» فوق ما أُرسل من تبويبٍ غيره. */
  const untouchedSrc = script.slice(script.indexOf("function untouchedIn(draft,d)"), script.indexOf("function clearDraft()")).trim();
  const untouchedIn = vm.runInNewContext(`(${untouchedSrc})`) as (draft: any, d: any) => boolean;
  const keep7 = { rowId: 7, action: "keep", days: [], start: "", excuse: "" };
  const moved7 = { rowId: 7, action: "change", days: ["fsunday", "ftuesday"], start: "14:00", excuse: "" };
  check(untouchedSrc.length > 0 && untouchedIn({ base: [keep7] }, keep7) && !untouchedIn({ base: [keep7] }, moved7) && !untouchedIn({ items: [keep7] }, keep7)
    && script.includes("items:payloadItems(),base:baseItems,") && script.includes("if(applied){restoredDraft=true;dirty=true}else clearDraft()"),
    "والمسودةُ تُطبَّق على ما لمسه تبويبُها وحده: «كما هو» الذي لم يُلمس لا يمحو تعديلاً أرسله تبويبٌ آخر، ولا «استعدنا» بلا شيء");
  check(script.includes("e.server=true;e.itemIndex=d.itemIndex;throw e") && script.includes("it.note=said||\"تعذّر فحص الموعد الآن. أعد المحاولة قبل الإرسال.\""),
    "وسببُ الخادم يُقال على بنده بدل «تعذّر فحص الموعد» على كل البنود");
  check(script.includes("function uniqueShapes(list)") && script.includes("var shs=state[i]&&state[i].shapes&&state[i].shapes.length?[]:uniqueShapes(heatShapes[i]||[]);"),
    "والأنماطُ المقترحة مرّةً واحدة");
  check(script.includes("if(act===\"cancel-add\"){releaseHold(it);") && script.includes("if(it.action===\"keep\"||it.action===\"delete\"){releaseHold(it);")
    && script.includes("function holdKeyOf(it)") && script.includes("holdSig[hk]&&holdSig[hk].sig===sig"),
    "وإلغاءُ الإضافة أو التعديل يُفرج حجزَه، والحجزُ بهويّة البند");
  check(script.includes("DRAFT_KEY=DRAFT_BASE+(TAB_ID?\":\"+TAB_ID:\"\")") && script.includes("function clearAllDrafts()") && script.includes("clearAllDrafts();dirty=false;location.reload()"),
    "ومسودةٌ لكل تبويب، و«ابدأ من جديد» يمسحها كلَّها");
  check(script.includes("function landedNow(sent,cb)") && script.includes("x.d.code===\"request-revision\"){landedNow(sentItems")
    && script.includes(".catch(function(){landedNow(sentItems,") && script.includes("sentSig(draft.items)===sentSig(payloadItems())"),
    "وانقطاعُ الردّ بعد الحفظ يُقال «وصل طلبك»، ولا «لم يُرسل بعد» عن طلبٍ واصل");
  check(script.includes("var keepFocus=focusKey(document.activeElement);") && script.includes("restoreFocus(keepFocus);"), "والتركيزُ يبقى مكانه بعد كل رسم");
  check(script.includes("if(!it.days.length){var was=originalOf(it);it.days=was.days.slice();it.start=was.start}") && script.includes("openCards[state.length-1]=true;"),
    "و«غيّر الموعد» بعد أول إرسال يُفتح بأيامه ووقته، والمقرّرُ المضاف يُفتح");
  check(script.includes("function patsFor(days,it)") && !/3:\[\["fsunday","ftuesday","fthursday"\],\["fmonday","fwednesday","fthursday"\]\]/.test(script),
    "و«وقت آخر» يعرض أنماطَ المقرّر نفسه، لا «الاثنين · الأربعاء · الخميس» لكل بندٍ من ثلاثة أيام");
}

/* ── 8) الخادم: أخطاءٌ برقم بندها، ووقتٌ بأرقامٍ عربية، وJSON تالف ─────────────────── */
{
  const server = readServerSource();
  check(server.includes('throw itemError("اكتب وقت البداية بصيغة الساعة والدقيقة، مثل 09:30.", entryIndex);') && server.includes("const typedStart = asciiClock(entry?.start);"),
    "وقتٌ لا يُقرأ يُقال سببُه لبنده («اكتب وقت البداية…» لا «اختر يوماً»)، و«٠٩:٣٠» تُقرأ 09:30");
  check(server.includes('res.status(400).json({ error: error.message || "تعذّر قراءة الطلب.", ...(Number.isInteger(error?.itemIndex) ? { itemIndex: error.itemIndex } : {}) });'),
    "وخطأُ بندٍ في الإرسال يصل برقمه");
  check(readFileSync("server.ts", "utf8").includes('if (error?.type === "entity.parse.failed") {') && readFileSync("server.ts", "utf8").includes('code: "BAD_JSON"'),
    "وجسمٌ ليس JSON صالحاً يُردّ 400 لا 500");
  check(server.includes('res.status(400).json({ error: "لا يُخلط بين أيام الـ50 والـ80 دقيقة إلا بنمطٍ معتمد في مكتبة الأنماط." });'),
    "واقتراحُ الأستاذ المضادّ يمرّ بقاعدة الأيام نفسها");
  check(server.includes("lengthPatterns: await requestLengthPatterns(") && !/historicalLectureMinutes/.test(server.slice(server.indexOf("async function requestSlotsForCourse"), server.indexOf("async function instructorRequestItemsFromPayload"))),
    "والخادمُ يرسل أنماطَ الطول للصفحة، ولا يقرأ طولَ يومٍ من الذاكرة");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
