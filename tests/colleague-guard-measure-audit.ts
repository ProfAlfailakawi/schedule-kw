/**
 * ── حارسُ الزملاء ومؤشرُ سهولة الإدخال ──────────────────────────────────────────────────
 *    (src/utils/scheduleHolds.ts · src/server/scheduleHolds.ts · src/utils/appointmentMeasure.ts)
 *
 *  G1  بلا خادم: holdClashes — قاعةٌ متداخلة، أستاذٌ متداخل، حافّتان متلامستان، يومٌ آخر،
 *      مبنىً بلا قاعة، «هيئة تدريسية»، أرقامٌ عربية، ومسوّدةٌ ناقصة.
 *  G2  بلا خادم: parseScheduleHold يرفض الأيامَ والأوقاتَ والأرقامَ والنصوصَ غير الصالحة، ويرتّب الصحيح.
 *  G3  بلا خادم: صاحبُ الحجز واسمُه — «الكرسي · الجالس» يُقرأ جالساً، والعضوُ حجزٌ مستقل.
 *  G4  صندوقُ عرضٍ في العملية: الحجزُ يعيش دقيقتين ويتجدّد بمعرّفه، والمنتهي لا يُقرأ ويُكنس،
 *      والمجدَّدُ لا يُكنس، والرفعُ يمحوه، والفصلُ الآخر لا يختلط.
 *  M1  بلا خادم: العدّاد — الأدواتُ بلا تكرار، المانعُ يُعدّ بالدخول فيه، الجهاز، وfinish مرةً واحدة.
 *  M2  بلا خادم: parseEntryMeasure يقصّ ويُسقط المجهول ويردّ الفاسد، وfoldEntryMeasure يطوي في الشرائح.
 *  M3  صندوقُ عرض: قياسان في اللحظة نفسها يُعدّان اثنين، وشهرُ الكويت، والأشهرُ الثلاثة.
 *  H1–H7 خادمٌ حيّ (تجربة): الصلاحيةُ والنطاقُ والتحقق، والزميلُ يرى حجزي باسمي لا بكرسيّي ولا يرى
 *      حجزه، والقياسُ لحساب الإدارة الرئيسي وحده، ولا يدخل شيءٌ منهما سجلَّ العمليات.
 *  S1  ساكن: التسجيلُ في server.ts، والصمتُ عن السجلّ وعيّنات الأداء وذاكرة المراجع، والبطاقةُ في السجل.
 */
import fs from "node:fs";
import { waitForDemoSeed } from "./helpers/demoSeed";
import { startDemoServer, type LiveServer } from "./helpers/liveServer";
import { Repository } from "../src/db/repository";
import {
  createHoldEngine, holdClashes, holdDraftFromForm, holdDayNames, holdPayloadKey, holdRoomLabel, departmentHolds, HOLD_DAYS, normalizeHoldDraft,
  SCHEDULE_HOLD_TTL_MS as CLIENT_TTL, type ScheduleHoldView,
} from "../src/utils/scheduleHolds";
import {
  holdHolderOf, holdPersonName, parseScheduleHold, putScheduleHold, readScheduleHolds, releaseScheduleHold,
  scheduleHoldView, SCHEDULE_HOLD_TTL_MS,
} from "../src/server/scheduleHolds";
import {
  createEntryMeter, emptyEntryMonth, entryAverageSeconds, entryBlockedShare, entryBucket, entryDevice, entryMonthKey,
  ENTRY_DURATION_MAX_MS, foldEntryMeasure, parseEntryMeasure, recentEntryMonths, topEntryHelpers,
} from "../src/utils/appointmentMeasure";
import { readEntryMonths, recordEntryMeasure } from "../src/server/appointmentMetrics";
import { DAY_FLAGS } from "../src/utils/naturalQuery";
import { AR, countOf, nounFor } from "../src/utils/arabicCount";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 600) : ""); }
};

const hold = (over: Partial<ScheduleHoldView>): ScheduleHoldView => ({
  id: "h1", name: "د. منى", collegeId: 1, sectionId: 1, days: ["fsunday"], start: "10:00", end: "11:15",
  roomCode: "12", roomHall: "3", instructorId: 0, courseId: 0, sectionCode: "", editId: 0, expiresAt: Date.now() + 60_000, ...over,
});

/* ── G1 ── */
{
  const draft = { days: ["fsunday", "ftuesday"], start: "09:30", end: "10:45", roomCode: "12", roomHall: "3", instructorId: 7 };
  const room = hold({ id: "room", days: ["fsunday"], start: "10:00", end: "11:15", roomCode: "12", roomHall: "3", instructorId: 9 });
  const teacher = hold({ id: "teacher", days: ["ftuesday", "fthursday"], start: "08:00", end: "10:00", roomCode: "5", roomHall: "1", instructorId: 7 });
  const touching = hold({ id: "touching", days: ["fsunday"], start: "10:45", end: "12:00" });
  const before = hold({ id: "before", days: ["ftuesday"], start: "08:00", end: "09:30", instructorId: 7 });
  const otherDay = hold({ id: "other-day", days: ["fmonday", "fwednesday"], start: "09:30", end: "10:45", instructorId: 7 });
  const both = hold({ id: "both", days: ["ftuesday"], start: "09:00", end: "10:00", roomCode: "12", roomHall: "3", instructorId: 7 });
  const buildingOnly = hold({ id: "building", days: ["fsunday"], start: "09:30", end: "10:45", roomCode: "12", roomHall: "" });
  const otherRoom = hold({ id: "other-room", days: ["fsunday"], start: "09:30", end: "10:45", roomCode: "12", roomHall: "4", instructorId: 8 });
  const all = [room, teacher, touching, before, otherDay, both, buildingOnly, otherRoom];
  const found = holdClashes(draft, all);
  const ids = found.map(c => c.id).join(",");
  check(ids === "room,teacher,both", "G1 يلتقي: القاعةُ نفسها في وقتٍ متداخل، والأستاذُ نفسه، وكلاهما — ولا غيرها", found.map(c => [c.id, c.clashOn]));
  check(found.find(c => c.id === "room")?.clashOn.join() === "room" && found.find(c => c.id === "teacher")?.clashOn.join() === "instructor"
    && found.find(c => c.id === "both")?.clashOn.join() === "room,instructor", "G1 ويقول على ماذا نلتقي");
  check(found.find(c => c.id === "teacher")?.sharedDays.join() === "ftuesday" && found.find(c => c.id === "room")?.sharedDays.join() === "fsunday", "G1 والأيامَ التي نلتقي فيها وحدها");
  check(!found.some(c => c.id === "touching" || c.id === "before"), "G1 الحافّتان المتلامستان لا تتداخلان (10:45 بعد 10:45، و09:30 قبل 09:30)");
  check(!found.some(c => c.id === "other-day"), "G1 الوقتُ نفسه في يومٍ آخر ليس التقاءً");
  check(!found.some(c => c.id === "building") && !found.some(c => c.id === "other-room"), "G1 مبنىً بلا قاعة ليس قاعة، وقاعةٌ أخرى في المبنى نفسه ليست هي");
  check(holdClashes(draft, all, { ignoreInstructorIds: [7] }).map(c => c.id).join(",") === "room,both", "G1 «هيئة تدريسية» ليست شخصاً: لا يُلتقى عليها");
  check(holdClashes({ ...draft, roomCode: "١٢", roomHall: " ٣ " }, [room]).length === 1, "G1 الأرقامُ العربية والمسافات لا تُخفي القاعة نفسها");
  check(holdClashes({ ...draft, days: [] }, all).length === 0 && holdClashes({ ...draft, end: "09:00" }, all).length === 0 && holdClashes(null, all).length === 0 && holdClashes(draft, null).length === 0,
    "G1 مسوّدةٌ بلا يوم أو بوقتٍ مقلوب، أو بلا حجوز: لا التقاء ولا خطأ");
  check(holdClashes({ ...draft, roomCode: "", roomHall: "", instructorId: 0 }, all).length === 0, "G1 مسوّدةٌ بلا قاعةٍ ولا أستاذ: لا شيء تلتقي عليه");
  const form = holdDraftFromForm({ fsunday: true, fmonday: false, ftuesday: 1, fstarttime: "9:30", fendtime: "10:45", AdRoomCode: "12", AdRoomHall: "3", AdInstructorId: 7, AdCourseId: 44, SCode: "01" });
  check(form.days.join() === "fsunday,ftuesday" && normalizeHoldDraft(form)?.start === "09:30" && form.instructorId === 7 && form.courseId === 44 && form.sectionCode === "01",
    "G1 نموذجُ المحرّر يصير مسوّدة (fsunday… وfstarttime وAdRoomCode)، والساعةُ تُكمَّل «09:30»", form);
  check(holdDayNames(["ftuesday", "fsunday", "fsaturday"]) === "الأحد، الثلاثاء" && holdRoomLabel(room) === "12/3", "G1 الأيامُ بأسمائها مرتّبة، والقاعة «12/3»");
  check(departmentHolds([room, hold({ id: "x", sectionId: 2 })], 1, 1).length === 1, "G1 حجوزُ القسم وحده للشارة");
  check(JSON.stringify([...HOLD_DAYS]) === JSON.stringify([...DAY_FLAGS]) && CLIENT_TTL === SCHEDULE_HOLD_TTL_MS && SCHEDULE_HOLD_TTL_MS === 120_000,
    "G1 الواجهةُ والخادم على أيامٍ واحدة وعمرٍ واحد (دقيقتان)");
  check(`${countOf(2, AR.colleague)} ${nounFor(2, AR.workingVerb)} الآن` === "زميلان يعملان الآن" && `${countOf(1, AR.colleague)} ${nounFor(1, AR.workingVerb)}` === "زميل واحد يعمل"
    && `${countOf(4, AR.colleague)} ${nounFor(4, AR.workingVerb)}` === "4 زملاء يعملون", "G1 الشارة: «زميلان يعملان الآن» · «زميل واحد يعمل» · «4 زملاء يعملون»");
}

/* ── G2 ── */
const VALID = { termId: 3, collegeId: 1, sectionId: 1, days: ["ftuesday", "fsunday", "fsunday"], start: "09:30", end: "10:45", roomCode: "12", roomHall: "3", instructorId: "7", courseId: 44, sectionCode: "01", editId: 0 };
{
  const ok = parseScheduleHold(VALID);
  check("hold" in ok && ok.hold.days.join() === "fsunday,ftuesday" && ok.hold.instructorId === 7 && ok.hold.termId === 3, "G2 الصحيحُ يُقبل: الأيامُ مرتّبة بلا تكرار، ونصُّ الأرقام رقم", ok);
  const bad = (over: Record<string, unknown>) => "error" in parseScheduleHold({ ...VALID, ...over });
  check(bad({ days: [] }) && bad({ days: ["fsaturday"] }) && bad({ days: "fsunday" }) && bad({ days: [1] }) && bad({ days: ["fsunday", "Sunday"] }) && bad({ days: undefined }),
    "G2 الأيامُ: من الأحد إلى الخميس، مصفوفةً، ويومٌ واحد على الأقل");
  check(bad({ start: "9:30" }) && bad({ start: "24:00" }) && bad({ end: "10:60" }) && bad({ start: "10:45" }) && bad({ start: "11:00" }) && bad({ start: 930 }) && bad({ end: undefined }),
    "G2 الوقتُ «HH:MM» صارماً، والنهايةُ بعد البداية (والمساواةُ مرفوضة)");
  check(bad({ termId: Number.NaN }) && bad({ termId: Number.POSITIVE_INFINITY }) && bad({ termId: -1 }) && bad({ termId: 1.5 }) && bad({ termId: "abc" }) && bad({ termId: 0 }) && bad({ collegeId: undefined }) && bad({ sectionId: true }),
    "G2 الفصلُ والكلية والقسم أرقامٌ صحيحة موجبة محدودة (لا NaN ولا لانهاية ولا كسور)");
  check(bad({ instructorId: -3 }) && bad({ courseId: 2.5 }) && bad({ editId: "7a" }) && bad({ instructorId: { id: 7 } }), "G2 أرقامُ الأستاذ والمقرر والموعد صحيحةٌ غير سالبة");
  check(bad({ roomCode: "x".repeat(41) }) && bad({ sectionCode: ["01"] }) && !bad({ roomCode: "x".repeat(40) }), "G2 النصوصُ نصوصٌ لا تتجاوز أربعين حرفاً");
  const trimmed = parseScheduleHold({ ...VALID, roomCode: "  12\u200f\u0007 ", roomHall: 3, sectionCode: null });
  check("hold" in trimmed && trimmed.hold.roomCode === "12" && trimmed.hold.roomHall === "3" && trimmed.hold.sectionCode === "", "G2 تُنزع المحارفُ الخفيّة وتُطوى المسافات، والرقمُ نصّ", trimmed);
  check("error" in parseScheduleHold(null) && "error" in parseScheduleHold([VALID]) && "error" in parseScheduleHold("x"), "G2 جسمٌ ليس كائناً يُرفض");
}

/* ── G3 ── */
{
  check(holdPersonName({ Name: "د. فهد الكندري" }) === "د. فهد الكندري", "G3 حسابٌ بلا كرسيّ: اسمُه كما هو");
  check(holdPersonName({ Name: "رئيس لجنة الجدول — قسم الاختبار · د. منى", SeatActor: { kind: "holder", name: "د. منى" } }) === "د. منى", "G3 جلسةُ الكرسي: الجالسُ لا الكرسي (ما بعد « · »)");
  check(holdPersonName({ Name: "رئيس لجنة الجدول", SeatActor: { kind: "member", name: "سارة" } }) === "سارة", "G3 وبلا « · » يُقرأ اسمُ الجالس من الكرسي");
  check(holdHolderOf({ SystemUserId: 16, Name: "x" })?.key === "16" && holdHolderOf({ SystemUserId: 16, Name: "x", SeatActor: { memberId: "m_ab" } })?.key === "16:m_ab" && holdHolderOf({}) === null,
    "G3 لكلِّ جالسٍ حجزُه: الحساب، والحسابُ وعضوُه");
}

/* ── G4 + M3: صندوقُ عرضٍ في العملية ── */
const SANDBOX = `demo_colleague_guard_${Date.now()}`;
Repository.createDemoSandbox(SANDBOX, 10 * 60_000);
const inSandbox = <T>(fn: () => Promise<T>) => Repository.withDemoSandbox(SANDBOX, fn);
try {
  const parsed = parseScheduleHold(VALID);
  const input = "hold" in parsed ? parsed.hold : (null as never);
  const A = { key: "16", name: "د. منى" }, B = { key: "16:m_ab", name: "سارة" };
  const T0 = Date.UTC(2026, 9, 30, 7, 0, 0);
  const first = await inSandbox(() => putScheduleHold(A, input, T0));
  check(first.expiresAt === T0 + 120_000 && first.since === T0 && /^h_/.test(first.id) && first.holder === "16", "G4 الحجزُ يعيش دقيقتين من لحظته، بمعرّفٍ عشوائي", first);
  const renewed = await inSandbox(() => putScheduleHold(A, { ...input, start: "10:00", end: "11:00" }, T0 + 45_000));
  check(renewed.id === first.id && renewed.since === T0 && renewed.expiresAt === T0 + 165_000 && renewed.start === "10:00", "G4 التجديدُ يمدّه، ويبقى معرّفُه وبدايتُه، ويحمل المسوّدة الجديدة", renewed);
  await inSandbox(() => putScheduleHold(B, { ...input, termId: 4 }, T0));
  const live = await inSandbox(async () => (await readScheduleHolds(3, T0 + 60_000)).live);
  check(live.length === 1 && live[0].holder === "16", "G4 الفصلُ الآخر لا يختلط بهذا", live.map(row => [row.holder, row.termId]));
  const view = scheduleHoldView(live[0]);
  check(Object.keys(view).sort().join() === "collegeId,courseId,days,editId,end,expiresAt,id,instructorId,name,roomCode,roomHall,sectionCode,sectionId,start"
    && !JSON.stringify(view).includes("\"16\""), "G4 ما يُقرأ حقولٌ مسمّاة بأعيانها: لا صاحبَ الحجز ولا رقمَ حساب", view);
  const guarded = await inSandbox(() => Repository.deleteFeatureDoc<any>("scheduleHolds", "16", current => Number(current?.expiresAt) <= T0 + 60_000));
  check(guarded === false && Boolean(await inSandbox(() => Repository.getFeatureDoc("scheduleHolds", "16"))), "G4 الكنسُ يسأل الوثيقة أولاً: حجزٌ جُدّد لا يُحذف");
  const later = await inSandbox(async () => { const out = await readScheduleHolds(3, T0 + 165_001); return { live: out.live, purged: await out.purge }; });
  check(later.live.length === 0, "G4 بعد دقيقتين بلا تجديد: لا يُقرأ الحجز");
  const left = await inSandbox(() => Repository.listFeatureDocs<any>("scheduleHolds"));
  check(later.purged === 2 && left.length === 0, "G4 والمنتهي يُكنس من القراءة نفسها (حجزان منتهيان)", { purged: later.purged, left: left.map((row: any) => row.holder) });
  const again = await inSandbox(() => putScheduleHold(A, input, T0 + 300_000));
  check(again.id !== first.id && again.since === T0 + 300_000, "G4 حجزٌ بعد الكنس حجزٌ جديد");
  await inSandbox(() => releaseScheduleHold(A));
  check(!(await inSandbox(() => Repository.getFeatureDoc("scheduleHolds", "16"))), "G4 الرفعُ يمحوه الآن لا بعد دقيقتين");

  /* M3 */
  const NOW = Date.UTC(2026, 9, 31, 22, 30); // 01:30 من أول نوفمبر بتوقيت الكويت
  check(entryMonthKey(NOW) === "2026-11" && entryMonthKey(Date.UTC(2026, 9, 31, 20, 59)) === "2026-10", "M3 شهرُ الكويت: منتصفُ الليل بتوقيت الكويت لا بتوقيت غرينتش");
  check(recentEntryMonths(Date.UTC(2026, 0, 15)).join() === "2026-01,2025-12,2025-11", "M3 الأشهرُ الثلاثة تعبر رأسَ السنة");
  const payload = { durationMs: 45_000, blockedMoments: 1, helpers: ["stick" as const], device: "phone" as const, mode: "create" as const };
  await inSandbox(() => Promise.all([recordEntryMeasure(payload, NOW), recordEntryMeasure({ ...payload, durationMs: 400_000, helpers: [], device: "desktop", mode: "edit", blockedMoments: 0 }, NOW)]));
  const months = await inSandbox(() => readEntryMonths(NOW));
  check(months.length === 3 && months[0].month === "2026-11" && months[0].count === 2 && months[0].sumMs === 445_000 && months[1].month === "2026-10" && months[1].count === 0,
    "M3 قياسان في اللحظة نفسها يُعدّان اثنين، والشهرُ بلا قياسٍ أصفار", months.map(m => [m.month, m.count, m.sumMs]));
  const stored = await inSandbox(() => Repository.getFeatureDoc<any>("appointmentMetrics", "2026-11"));
  check(Object.keys(stored || {}).sort().join() === "blockedEntries,blockedMomentsSum,buckets,count,devices,helpers,modes,month,sumMs,updatedAt", "M3 الوثيقةُ أعدادٌ فقط: لا حسابَ ولا اسمَ ولا محتوى", stored);
} catch (error) {
  failed++;
  console.log("\x1b[31m✗ صندوق العرض تعثّر\x1b[0m", error instanceof Error ? error.stack : error);
} finally {
  Repository.dropDemoSandbox(SANDBOX);
}

/* ── M1 ── */
{
  let t = 1_000;
  const meter = createEntryMeter("create", { now: () => t, width: () => 390 });
  meter.mark("stick"); meter.mark("stick"); meter.mark("bogus" as any); meter.mark("wheel");
  meter.blocked(true); meter.blocked(true); meter.blocked(false); meter.blocked(true); meter.blocked(false);
  t += 42_500;
  const out = meter.finish();
  check(out?.durationMs === 42_500 && out.helpers.join() === "stick,wheel" && out.blockedMoments === 2 && out.device === "phone" && out.mode === "create",
    "M1 العدّاد: المدة، والأدواتُ بلا تكرار ولا مجهول، والمانعُ يُعدّ بالدخول فيه لا ببقائه", out);
  check(meter.finish() === null, "M1 وfinish مرةً واحدة: الحفظُ المكرّر لا يُعدّ موعدين");
  meter.mark("golden");
  let u = 0;
  const edit = createEntryMeter("edit", { now: () => u, width: () => 1440 });
  u = 9 * 3_600_000;
  const long = edit.finish();
  check(long?.durationMs === ENTRY_DURATION_MAX_MS && long.device === "desktop" && long.mode === "edit" && long.blockedMoments === 0 && long.helpers.length === 0, "M1 نموذجٌ نُسي مفتوحاً يُقصّ إلى ساعتين", long);
  check(entryDevice(375) === "phone" && entryDevice(699) === "phone" && entryDevice(700) === "tablet" && entryDevice(1099) === "tablet" && entryDevice(1100) === "desktop" && entryDevice(Number.NaN) === "desktop",
    "M1 الجهاز: هاتفٌ دون 700، ولوحيٌّ دون 1100، وحاسوبٌ فوقهما");
}

/* ── M2 ── */
{
  const good = parseEntryMeasure({ durationMs: 99_999_999, blockedMoments: -4, helpers: ["stick", "bogus", "stick", "golden", 5], device: "tablet", mode: "edit" });
  check("payload" in good && good.payload.durationMs === ENTRY_DURATION_MAX_MS && good.payload.blockedMoments === 0 && good.payload.helpers.join() === "stick,golden",
    "M2 المدةُ تُقصّ إلى ساعتين، والسالبُ صفر، والأدواتُ المجهولة تُسقط بلا تكرار", good);
  const small = parseEntryMeasure({ durationMs: -50, device: "phone", mode: "create" });
  check("payload" in small && small.payload.durationMs === 0 && small.payload.blockedMoments === 0 && small.payload.helpers.length === 0, "M2 المدةُ السالبة صفر، وما غاب صفر", small);
  const rejects = [
    { durationMs: "40000", device: "phone", mode: "create" }, { durationMs: Number.NaN, device: "phone", mode: "create" },
    { durationMs: 1000, device: "watch", mode: "create" }, { durationMs: 1000, device: "phone", mode: "delete" },
    { durationMs: 1000, blockedMoments: "2", device: "phone", mode: "create" }, null, [1],
  ].map(body => "error" in parseEntryMeasure(body));
  check(rejects.every(Boolean), "M2 الفاسدُ يُردّ: مدةٌ ليست رقماً، جهازٌ أو نوعٌ مجهول، عددٌ نصّاً، جسمٌ ليس كائناً", rejects);
  let month = foldEntryMeasure(null, "2026-10", { durationMs: 29_999, blockedMoments: 0, helpers: ["usual"], device: "phone", mode: "create" });
  month = foldEntryMeasure(month, "2026-10", { durationMs: 30_000, blockedMoments: 3, helpers: ["usual", "stick"], device: "desktop", mode: "edit" });
  month = foldEntryMeasure(month, "2026-10", { durationMs: 300_000, blockedMoments: 1, helpers: [], device: "desktop", mode: "create" });
  check(month.count === 3 && month.buckets.lt30 === 1 && month.buckets.s30to60 === 1 && month.buckets.gt300 === 1 && month.blockedEntries === 2 && month.blockedMomentsSum === 4
    && month.helpers.usual === 2 && month.helpers.stick === 1 && month.devices.desktop === 2 && month.modes.create === 2,
    "M2 الطيّ: الشرائحُ بحدودها (29.999 · 30 · 300 ثانية)، والمانع، والأدوات، والأجهزة، والنوع", month);
  check(entryBucket(59_999) === "s30to60" && entryBucket(60_000) === "s60to120" && entryBucket(119_999) === "s60to120" && entryBucket(120_000) === "s120to300", "M2 حدودُ الشرائح الوسطى");
  check(entryAverageSeconds(month) === 120 && entryBlockedShare(month) === 67 && topEntryHelpers(month).map(h => h.name).join() === "usual,stick", "M2 البطاقة: المتوسطُ 120ث، و67% اصطدم بمانع، والأدواتُ بترتيبها");
  const dirty = foldEntryMeasure({ count: "x", sumMs: -5, helpers: { bogus: 9, wheel: 2 }, devices: { phone: 1, watch: 4 } }, "2026-10", { durationMs: 1_000, blockedMoments: 0, helpers: [], device: "phone", mode: "create" });
  check(dirty.count === 1 && dirty.sumMs === 1_000 && !("bogus" in dirty.helpers) && dirty.helpers.wheel === 2 && dirty.devices.phone === 2 && !("watch" in dirty.devices),
    "M2 وثيقةٌ فاسدة تُقرأ بحذر: لا يدخلها مفتاحٌ مجهول", dirty);
  check(entryAverageSeconds(emptyEntryMonth("2026-10")) === null && entryBlockedShare(null) === null, "M2 شهرٌ بلا قياس: لا متوسط (البطاقة تقول «لا قياس بعد»)");
}

/* ── E1–E7: محرّكُ الخطّاف بساعةٍ قصيرة وشبكةٍ مصطنعة (بلا React ولا متصفّح) ── */
{
  type Call = { method: string; url: string; body?: string; keepalive?: boolean; at: number };
  const calls: Call[] = [];
  const realFetch = globalThis.fetch;
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  let serverHolds: unknown[] = [];
  let postStatus = 200, postDelay = 0, failNext = false;
  const started = Date.now();
  globalThis.fetch = (async (url: any, init: any = {}) => {
    const method = String(init.method || "GET").toUpperCase();
    calls.push({ method, url: String(url), body: init.body, keepalive: init.keepalive, at: Date.now() - started });
    if (failNext && method === "POST") { failNext = false; throw new TypeError("Failed to fetch"); }
    if (method === "POST" && postDelay) await sleep(postDelay);
    const body = method === "GET" ? { holds: serverHolds, now: Date.now() + 10_000 } : method === "POST" && postStatus !== 200 ? { error: "خارج صلاحيات الأقسام المسموحة لك" } : { ok: true };
    return new Response(JSON.stringify(body), { status: method === "POST" ? postStatus : 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const count = (method: string) => calls.filter(c => c.method === method).length;
  const shown: ScheduleHoldView[][] = [];
  const errors: string[] = [];
  try {
    const engine = createHoldEngine(list => shown.push(list), message => errors.push(message), { debounceMs: 20, refreshMs: 260, pollMs: 120 });
    const draft = { days: ["fsunday"], start: "09:30", end: "10:45", roomCode: "12", roomHall: "3", instructorId: 7 };
    const key = holdPayloadKey({ termId: 1, collegeId: 1, sectionId: 1, draft, editId: null });
    check(JSON.parse(key).days.join() === "fsunday" && JSON.parse(key).editId === 0 && holdPayloadKey({ termId: 1, collegeId: 1, sectionId: 0, draft }) === "" && holdPayloadKey({ termId: 1, collegeId: 1, sectionId: 1, draft: { ...draft, days: [] } }) === "",
      "E1 جسمُ الحجز من المسوّدة، ولا جسمَ بلا قسمٍ أو بلا يوم", key);
    serverHolds = [{ id: "h_a", name: "سارة", collegeId: 1, sectionId: 1, days: ["fsunday"], start: "10:00", end: "11:00", roomCode: "12", roomHall: "3", instructorId: 0, expiresAt: Date.now() + 70_000 }];
    engine.start();
    engine.configure(true, 1, key);
    check(count("GET") === 1 && count("POST") === 0, "E1 فتحُ النموذج: يُقرأ الزملاءُ فوراً، والإعلانُ ينتظر هدوء التحرير", calls.map(c => c.method));
    await sleep(140);
    check(count("POST") === 1 && calls.find(c => c.method === "POST")?.body === key && count("GET") >= 2, "E2 بعد الهدوء: إعلانٌ واحد بجسم المسوّدة، ثم قراءة", calls.map(c => c.method));
    const firstShown = shown.at(-1) || [];
    check(firstShown.length === 1 && firstShown[0].name === "سارة" && Math.abs((Date.now() + 70_000 - 10_000) - firstShown[0].expiresAt) < 2_000,
      "E2 الحجوزُ تصل، و«ينتهي» بساعة المتصفّح (فارقُ ساعة الخادم مطروح)", firstShown);
    const shownBefore = shown.length;
    await sleep(300);
    check(count("POST") >= 2, "E3 الحجزُ يتجدّد وحده ما دام النموذج مفتوحاً", calls.map(c => c.method));
    check(shown.length === shownBefore, "E3 قراءاتٌ متكرّرة بالمحتوى نفسه لا تعيد رسم المحرّر", shown.length - shownBefore);
    engine.configure(true, 1, "");
    check(calls.at(-1)?.method === "DELETE" && calls.at(-1)?.keepalive === true, "E4 مسوّدةٌ لم تعد موعداً (مُسح الوقت): يُرفع الحجز الآن", calls.slice(-2));
    const posts = count("POST");
    await sleep(320);
    check(count("POST") === posts, "E4 ولا يتجدّد بعد رفعه");

    /* في الطريق: إعلانٌ بطيء، ثم رفعٌ قبل أن يصل — الرفعُ مرتان، والثاني بعد الإعلان */
    postDelay = 120;
    const mark = calls.length;
    engine.configure(true, 1, key);
    await sleep(60);
    engine.configure(true, 1, "");
    await sleep(200);
    const flow = calls.slice(mark).filter(c => c.method !== "GET");
    check(flow.map(c => c.method).join() === "POST,DELETE,DELETE" && flow[2].at >= flow[0].at + 100,
      "E5 رفعٌ والإعلانُ في الطريق: يُرفع الآن، ومرةً بعد وصول الإعلان — فلا يحييه", flow.map(c => [c.method, c.at]));
    postDelay = 0;

    /* رفضٌ نهائي: لا يُكرَّر الجسمُ نفسه، ويُقال السبب ولا يُرمى */
    postStatus = 403;
    const denied = holdPayloadKey({ termId: 1, collegeId: 1, sectionId: 1, draft: { ...draft, start: "12:00", end: "13:00" } });
    engine.configure(true, 1, denied);
    await sleep(80);
    const deniedPosts = count("POST");
    await sleep(320);
    check(count("POST") === deniedPosts && errors.at(-1) === "خارج صلاحيات الأقسام المسموحة لك", "E6 رفضٌ نهائي (403): لا يتكرّر الإعلان، والسببُ نصٌّ لا استثناء", { posts: count("POST") - deniedPosts, error: errors.at(-1) });
    postStatus = 200;

    /* انقطاعُ الشبكة: نصٌّ، ثم يعود الإعلانُ عند التجديد */
    failNext = true;
    const offline = holdPayloadKey({ termId: 1, collegeId: 1, sectionId: 1, draft: { ...draft, start: "13:00", end: "14:00" } });
    engine.configure(true, 1, offline);
    await sleep(80);
    const afterFailure = count("POST");
    await sleep(320);
    check(errors.includes("تعذّر الوصول إلى حارس الزملاء.") && count("POST") > afterFailure, "E6 انقطاعُ الشبكة نصٌّ لا استثناء، والتجديدُ يعيد المحاولة", errors);

    const gets = count("GET");
    engine.configure(false, 1, offline);
    check(calls.at(-1)?.method === "DELETE" && shown.at(-1)?.length === 0, "E7 إغلاقُ النموذج: يُرفع الحجز وتُفرغ القائمة", calls.at(-1));
    await sleep(300);
    check(count("GET") === gets, "E7 ولا قراءةَ بعد الإغلاق");
    engine.configure(true, 1, key);
    await sleep(80);
    const beforeStop = calls.length;
    engine.stop();
    check(calls.slice(beforeStop).some(c => c.method === "DELETE"), "E7 مغادرةُ المحرّر: يُرفع الحجز");
    await sleep(300);
    check(calls.length === beforeStop + 1, "E7 وبعدها لا طلبَ واحد", calls.slice(beforeStop).map(c => c.method));
  } catch (error) {
    failed++;
    console.log("\x1b[31m✗ المحرّك تعثّر\x1b[0m", error instanceof Error ? error.stack : error);
  } finally {
    globalThis.fetch = realFetch;
  }
}

/* ── H1–H7: خادمٌ حيّ ── */
let server: LiveServer | null = null;
try {
  server = await startDemoServer("colleague-guard");
  const BASE = server.base;
  const login = await fetch(BASE + "/api/auth/demo", { method: "POST" });
  const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
  await waitForDemoSeed(BASE, cookie);
  const call = (url: string, init: RequestInit = {}) => fetch(BASE + url, { ...init, redirect: "manual", headers: { cookie, origin: BASE, ...(init.body ? { "content-type": "application/json" } : {}) } });
  const json = async (url: string, init: RequestInit = {}) => { const r = await call(url, init); let body: any = null; try { body = await r.json(); } catch { /* html */ } return { status: r.status, body }; };
  const as = async (role: string) => (await json("/api/demo/role", { method: "POST", body: JSON.stringify({ role }) })).body?.user?.SystemUserId as number;
  const post = (url: string, body: unknown) => json(url, { method: "POST", body: JSON.stringify(body) });
  const HOLD = { termId: 1, collegeId: 1, sectionId: 1, days: ["fsunday", "ftuesday"], start: "09:30", end: "10:45", roomCode: "12", roomHall: "3", instructorId: 2, courseId: 0, sectionCode: "01", editId: 0 };

  /* H1 التحقق والنطاق والصلاحية */
  const committee = await as("committeeChair");
  check(committee === 16, "H1 رئيسُ لجنة الجدول في صندوق التجربة", committee);
  const refused = await Promise.all([
    post("/api/schedule-holds", { ...HOLD, days: ["fsaturday"] }), post("/api/schedule-holds", { ...HOLD, days: [] }),
    post("/api/schedule-holds", { ...HOLD, start: "9:30" }), post("/api/schedule-holds", { ...HOLD, start: "10:45" }),
    post("/api/schedule-holds", { ...HOLD, termId: "x" }), post("/api/schedule-holds", { ...HOLD, roomCode: "y".repeat(41) }),
  ]);
  check(refused.every(r => r.status === 400 && typeof r.body?.error === "string" && /[\u0600-\u06ff]/.test(r.body.error)), "H1 أيامٌ وأوقاتٌ وأرقامٌ ونصوصٌ غير صالحة: 400 بسببٍ عربي", refused.map(r => [r.status, r.body?.error]));
  const outside = await post("/api/schedule-holds", { ...HOLD, sectionId: 2 });
  check(outside.status === 403, "H1 قسمٌ خارج نطاقي: 403", outside.body);
  const held = await post("/api/schedule-holds", HOLD);
  const ttl = Number(held.body?.expiresAt) - Date.now();
  check(held.status === 200 && held.body?.ok === true && ttl > 100_000 && ttl <= 121_000, "H1 حجزٌ صحيح: {ok, expiresAt} بعد دقيقتين", held.body);
  const mineOnly = await json("/api/schedule-holds?termId=1");
  check(mineOnly.status === 200 && Array.isArray(mineOnly.body?.holds) && mineOnly.body.holds.length === 0 && Number.isFinite(mineOnly.body?.now), "H1 لا أرى حجزي أنا", mineOnly.body);
  check((await json("/api/schedule-holds")).status === 400 && (await json("/api/schedule-holds?termId=abc")).status === 400, "H1 القراءةُ بلا فصلٍ صحيح: 400");

  /* H2 زميلٌ يرى حجزي، باسم الحساب */
  await as("standard");
  const seen = await json("/api/schedule-holds?termId=1");
  const first = seen.body?.holds?.[0];
  check(seen.status === 200 && seen.body.holds.length === 1 && first?.name === "د. رئيس لجنة جدول تكنولوجيا التعليم" && first?.roomCode === "12" && first?.days?.join() === "fsunday,ftuesday",
    "H2 الزميلُ في القسم نفسه يرى حجزي باسمي وقاعتي وأيامي", seen.body);
  check(Object.keys(first || {}).sort().join() === "collegeId,courseId,days,editId,end,expiresAt,id,instructorId,name,roomCode,roomHall,sectionCode,sectionId,start" && !/civil/i.test(JSON.stringify(seen.body)),
    "H2 حقولٌ مسمّاة وحدها: لا صاحبَ الحجز ولا رقمَ حسابٍ ولا رقمَ مدني", first);
  check((await json("/api/schedule-holds?termId=2")).body?.holds?.length === 0, "H2 فصلٌ آخر: لا شيء");
  const standardHold = await post("/api/schedule-holds", { ...HOLD, start: "11:00", end: "12:15", roomHall: "4" });
  check(standardHold.status === 200, "H2 والزميلُ يحجز كذلك");
  await as("committeeChair");
  const back = await json("/api/schedule-holds?termId=1");
  check(back.body?.holds?.length === 1 && back.body.holds[0].name === "أ. مستخدم عادي" && back.body.holds[0].start === "11:00", "H2 وأرى حجزه لا حجزي", back.body);

  /* H3 صفةُ اطّلاع: لا تحجز ولا تقرأ */
  await as("dean");
  const deanPost = await post("/api/schedule-holds", HOLD);
  const deanRead = await json("/api/schedule-holds?termId=1");
  check(deanPost.status === 403 && deanRead.status === 403, "H3 العميد (اطّلاع): لا يحجز ولا يقرأ الحجوز", { post: deanPost.status, read: deanRead.status });

  /* H4 الرفع */
  await as("committeeChair");
  const released = await json("/api/schedule-holds", { method: "DELETE" });
  await as("standard");
  const afterRelease = await json("/api/schedule-holds?termId=1");
  check(released.status === 200 && afterRelease.body?.holds?.length === 0, "H4 رفعُ الحجز يمحوه عن الزملاء الآن", afterRelease.body);
  await json("/api/schedule-holds", { method: "DELETE" });

  /* H5 الكرسي: الزميلُ يرى الجالسَ لا الكرسي */
  await as("admin");
  const seat = await json("/api/seats/16");
  const person = seat.body?.holderCandidates?.[0];
  const setHolder = person ? await post("/api/seats/16/holder", { instructorId: person.id }) : { status: 0 };
  check(setHolder.status === 200 && Boolean(person?.name), "H5 مديرُ النظام يسجّل شاغلَ كرسيّ اللجنة", setHolder.status);
  await as("committeeChair");
  const seated = await post("/api/schedule-holds", HOLD);
  await as("standard");
  const seatedView = await json("/api/schedule-holds?termId=1");
  check(seated.status === 200 && seatedView.body?.holds?.[0]?.name === person?.name, "H5 حجزُ جلسة الكرسي يُقرأ باسم الجالس لا باسم الكرسي", seatedView.body?.holds?.[0]?.name);

  /* H6 القياس: يكتبه من يعدّل الجدول، ويقرؤه حسابُ الإدارة الرئيسي وحده */
  await as("committeeChair");
  const m1 = await post("/api/metrics/appointment-entry", { durationMs: 45_000, blockedMoments: 2, helpers: ["stick", "bogus", "stick"], device: "phone", mode: "create" });
  const m2 = await post("/api/metrics/appointment-entry", { durationMs: 99_999_999, blockedMoments: 0, helpers: ["golden"], device: "desktop", mode: "edit" });
  const m3 = await post("/api/metrics/appointment-entry", { durationMs: 1_000, device: "watch", mode: "create" });
  const m4 = await post("/api/metrics/appointment-entry", { durationMs: "abc", device: "phone", mode: "create" });
  check(m1.status === 200 && m2.status === 200 && m3.status === 400 && m4.status === 400, "H6 قياسان يُقبلان، وجهازٌ مجهول ومدةٌ نصّاً يُردّان", [m1.status, m2.status, m3.status, m4.status]);
  check((await json("/api/metrics/appointment-entry")).status === 403, "H6 رئيسُ اللجنة لا يقرأ القياس");
  await as("standard");
  check((await json("/api/metrics/appointment-entry")).status === 403, "H6 ولا المستخدمُ العادي");
  await as("dean");
  check((await json("/api/metrics/appointment-entry")).status === 403 && (await post("/api/metrics/appointment-entry", { durationMs: 1, device: "phone", mode: "create" })).status === 403,
    "H6 والعميدُ لا يقرأ ولا يكتب");
  await as("admin");
  const read = await json("/api/metrics/appointment-entry");
  const now = read.body?.months?.[0];
  check(read.status === 200 && read.body.months.length === 3 && now?.month === entryMonthKey(Date.now()), "H6 حسابُ الإدارة الرئيسي: آخرُ ثلاثة أشهر، الحاضرُ أولاً", read.body?.months?.map((m: any) => m.month));
  check(now?.count === 2 && now.sumMs === 45_000 + ENTRY_DURATION_MAX_MS && now.buckets?.s30to60 === 1 && now.buckets?.gt300 === 1 && now.blockedEntries === 1 && now.blockedMomentsSum === 2
    && now.helpers?.stick === 1 && now.helpers?.golden === 1 && !("bogus" in (now.helpers || {})) && now.devices?.phone === 1 && now.devices?.desktop === 1 && now.modes?.create === 1 && now.modes?.edit === 1,
    "H6 الطيُّ على الخادم: القصّ، والشرائح، والمانع، والأدوات بلا مجهول، والأجهزة، والنوع", now);
  check(!/SystemUserId|userId|"name"|رئيس|مستخدم/.test(JSON.stringify(read.body)), "H6 لا اسمَ ولا رقمَ حسابٍ في القياس");

  /* H7 لا شيء منهما في سجلّ العمليات — والسجلُّ نفسه يعمل */
  const logs = await json("/api/audit-logs?limit=500");
  const paths = (Array.isArray(logs.body) ? logs.body : []).map((row: any) => String(row.path || ""));
  check(logs.status === 200 && paths.some((path: string) => path.includes("/api/seats/16/holder")), "H7 السجلُّ يكتب ما يُكتب عادةً (تسجيلُ الشاغل)", paths.slice(0, 5));
  check(!paths.some((path: string) => path.includes("/schedule-holds") || path.includes("/metrics/appointment-entry")), "H7 ولا يكتب الحجز ولا رفعه ولا رفضه، ولا القياس (مجهول الهوية)", paths.filter((p: string) => /hold|metric/.test(p)));
} catch (error) {
  failed++;
  console.log("\x1b[31m✗ الاختبار الحيّ توقّف:\x1b[0m", error instanceof Error ? error.stack : error);
} finally {
  await server?.stop();
}

/* ── S1: ساكن ── */
{
  const serverSource = fs.readFileSync("server.ts", "utf8");
  check(/registerScheduleHoldsRoutes\(app\);\s*\n\s*registerAppointmentMetricsRoutes\(app\);/.test(serverSource), "S1 المساران مسجّلان في server.ts");
  const quiet = serverSource.match(/const QUIET_API_PATHS = new Set\(\[([^\]]*)\]\)/)?.[1] || "";
  check(quiet.includes("\"/schedule-holds\"") && quiet.includes("\"/metrics/appointment-entry\"") && (serverSource.match(/QUIET_API_PATHS\.has\(/g) || []).length === 2,
    "S1 الحجزُ والقياس خارج عيّنات الأداء وسجلّ العمليات");
  const main = fs.readFileSync("src/main.tsx", "utf8");
  check(/CATALOGUE_NEUTRAL_WRITE=.*schedule-holds\|metrics\\\/appointment-entry/.test(main) && main.includes("!CATALOGUE_NEUTRAL_WRITE.test(url.pathname))clearCatalogueCache()"),
    "S1 تجديدُ الحجز لا يُفرغ ذاكرةَ المراجع");
  const admin = fs.readFileSync("src/components/AdminUsers.tsx", "utf8");
  const audit = admin.indexOf("{rootAdmin ? <AppointmentMeasureCard /> : null}");
  check(audit > 0 && audit < admin.indexOf("<div className=\"master-detail-shell audit-master-detail\">") && audit > admin.indexOf("تحديث السجل"), "S1 البطاقةُ أعلى «السجل» لحساب الإدارة الرئيسي وحده، بلا تبويبٍ جديد");
  const css = fs.readFileSync("src/styles/42-colleague-measure.css", "utf8");
  check(css.includes("prefers-reduced-motion") && !/#[0-9a-f]{3,6}\b/i.test(css.replace(/\/\*[\s\S]*?\*\//g, "")), "S1 الأنماطُ من رموز السمة (بلا ألوانٍ مكتوبة) وتحترم تقليل الحركة");
  const repo = fs.readFileSync("src/db/repository.ts", "utf8");
  check(/"scheduleHolds" \| "appointmentMetrics"/.test(repo) && repo.includes("deleteFeatureDoc: async"), "S1 المجموعتان مسمّاتان، والحذفُ الذرّيّ في المستودع (Firestore والعرض)");
  const notice = fs.readFileSync("src/components/ColleagueHoldNotice.tsx", "utf8") + fs.readFileSync("src/components/AppointmentMeasureCard.tsx", "utf8");
  check(!/<button\b/.test(notice), "S1 التنبيهُ والبطاقة بلا أزرار: عرضٌ لا إجراء");
}

console.log(`\n${passed} نجح، ${failed} فشل`);
if (failed) process.exit(1);
