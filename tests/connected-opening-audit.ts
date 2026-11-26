/**
 * «البصمة باب للنبض» (FR-DSH-032، FR-SCH-094) و«افتتاحية اليوم» (FR-DSH-036).
 *
 * الأولى عقد رابطٍ واحد بين ثلاث شاشات: حلقة القاعة في البصمة تفتح القاعة نفسها في
 * المجسّم عند يوم القوس وساعته، ولوحة القاعة في المجسّم تعود إلى حلقتها، والختام في
 * فيلم الفصل يفتح البصمة. والقاعة الواحدة تُعرف بمفتاحٍ واحد في الشاشتين.
 *
 * والثانية مرةٌ في اليوم لكل حسابٍ على كل جهاز، لمن يرى النبض وحده، تُطفأ من
 * الجهاز، ولا تحجب شيئاً ولا تُطبع، ولا تُحمَّل three.js في الرئيسية.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import {
  fingerprintFocusHall, fingerprintFocusHref, focusClock, parsePulseFocus, pulseFocusHref, registryKeyOfPulseHall,
  resolveFingerprintRing, resolvePulseHall, ringFocusSlot, validHallKey,
} from "../src/utils/pulseLink";
import { buildFingerprint } from "../src/utils/deptFingerprint";
import { fingerprintRows } from "../src/server/routes/deptFingerprintRoutes";
import { buildPulseModel } from "../src/utils/hallPulse";
import { openingAllowed, openingDay, openingMode } from "../src/utils/dayOpening";
import { hallLitAt, hallUsedBefore, openingClock, openingClockText, openingNumbers, openingSkyline, OPENING_DAWN, OPENING_DUSK } from "../src/utils/dayOpeningScene";

const source = (path: string) => readFileSync(path, "utf8");

/* ── عقد الرابط: يُكتب ويُقرأ كما هو، وأي نقصٍ = لا طلب ── */
const focus = { collegeId: 3, sectionId: 12, termId: 40, hall: "id:room-7", day: 2, at: 8 * 60 + 30 };
const href = pulseFocusHref(focus);
assert.equal(href, "/FSchedule/Index?view=pulse&college=3&section=12&term=40&hall=id%3Aroom-7&day=2&at=08%3A30");
assert.deepEqual(parsePulseFocus(href.slice(href.indexOf("?"))), focus);
const legacy = { ...focus, hall: "legacy:901A03|2-15" };
assert.deepEqual(parsePulseFocus(pulseFocusHref(legacy).split("?")[1]), legacy, "مفتاح القاعة النصّية يعبر الرابط سليماً");
for (const broken of [
  "view=list&college=3&section=12&term=40&hall=id:x&day=1&at=08:00",
  "view=pulse&college=3&term=40&hall=id:x&day=1&at=08:00",
  "view=pulse&college=3&section=12&term=40&day=1&at=08:00",
  "view=pulse&college=3&section=12&term=40&hall=id:x&day=5&at=08:00",
  "view=pulse&college=3&section=12&term=40&hall=id:x&day=1&at=25:00",
  "view=pulse&college=3&section=12&term=40&hall=<script>&day=1&at=08:00",
]) assert.equal(parsePulseFocus(broken), null, broken);
assert.equal(validHallKey("id:a b"), "", "لا مسافات في المعرّف");
assert.equal(validHallKey("legacy:A|B"), "legacy:A|B");
assert.equal(focusClock(605), "10:05");
assert.equal(fingerprintFocusHref({ collegeId: 3, sectionId: 12, termId: 40 }, "id:room-7"), "/FSchedule/Fingerprint?college=3&section=12&term=40&hall=id%3Aroom-7");
assert.equal(fingerprintFocusHall("?college=3&hall=id%3Aroom-7"), "id:room-7");
assert.equal(fingerprintFocusHall("?hall=nonsense"), "");

/* ── القاعة الواحدة بمفتاحٍ واحد: البصمة (من الخادم) والنبض (من سجلّ المواقع) ── */
const rooms = [
  { id: "r1", buildingId: "b1", buildingCode: "901A03", canonicalCode: "2-15", capacity: 40 },
  { id: "r2", buildingId: "b1", buildingCode: "901A03", canonicalCode: "1-04", capacity: 30 },
] as any[];
const scheduleRows = [
  { id: 1, AdCourseId: 1, SCode: "01", roomId: "r1", AdRoomCode: "901A03", AdRoomHall: "2-15", fsunday: true, fstarttime: "08:00", fendtime: "08:50", AdTermId: 40 },
  /* قاعةٌ مسجّلة يحملها الصف نصّاً بلا معرّف. */
  { id: 2, AdCourseId: 2, SCode: "01", roomId: "", AdRoomCode: "901A03", AdRoomHall: "1-04", ftuesday: true, fstarttime: "10:00", fendtime: "11:15", AdTermId: 40 },
  /* قاعةٌ قديمة خارج السجل. */
  { id: 3, AdCourseId: 2, SCode: "02", roomId: "", AdRoomCode: "OLD", AdRoomHall: "12", fmonday: true, fstarttime: "12:00", fendtime: "12:50", AdTermId: 40 },
] as any[];
const courses = [{ AdCourseId: 1, CourseCode: "0109105", CourseName: "مدخل", MaxStudent: 30 }, { AdCourseId: 2, CourseCode: "0109210", CourseName: "تصميم", MaxStudent: 25 }] as any[];
const fp = buildFingerprint({ sectionName: "قسم", termName: "فصل", rows: fingerprintRows(scheduleRows, courses, rooms) });
assert.deepEqual(fp.halls.map(h => h.key).sort(), ["id:r1", "id:r2", "legacy:OLD|12"].sort(), "كل حلقةٍ تحمل مفتاح سجلّ المواقع");
const registry = { buildings: [{ id: "b1", officialCode: "901A03" }], rooms: rooms.map(r => ({ id: r.id, buildingId: r.buildingId, canonicalCode: r.canonicalCode, capacity: r.capacity })) } as any;
const pulse = buildPulseModel({ rows: scheduleRows, courses, registry, roomLoad: null, dayStart: 480, dayEnd: 1200 } as any);
for (const hall of fp.halls) {
  const key = resolvePulseHall(hall.key, pulse.halls);
  assert.ok(key, `حلقة ${hall.name} تجد قاعتها في النبض`);
  const back = registryKeyOfPulseHall(pulse.hallByKey.get(key!)!);
  assert.equal(resolveFingerprintRing(back, fp.halls), fp.halls.indexOf(hall), `ومن النبض تعود إلى حلقتها نفسها (${hall.name})`);
}
assert.equal(resolvePulseHall("id:elsewhere", pulse.halls), null, "قاعةٌ خارج النطاق: لا اختيار، ولا اختراع");

/* ── الحلقة تفتح على الجارية، ثم التالية، ثم أولى الأسبوع ── */
const slots = [{ day: 0, start: 480, end: 530 }, { day: 2, start: 600, end: 675 }, { day: 4, start: 780, end: 830 }];
assert.equal(ringFocusSlot(slots, { day: 2, minute: 620 }), slots[1], "الجارية الآن");
assert.equal(ringFocusSlot(slots, { day: 2, minute: 700 }), slots[2], "التالية");
assert.equal(ringFocusSlot(slots, { day: 4, minute: 900 }), slots[0], "بعد آخرها: أولى الأسبوع");
assert.equal(ringFocusSlot([], { day: 0, minute: 0 }), null);

/* ── من يرى الافتتاحية: من يرى النبض اليوم، لا أوسع ── */
assert.equal(openingAllowed({ roleId: "committeeChair", canManageSchedule: true }), true);
assert.equal(openingAllowed({ roleId: "standard", canManageSchedule: true }), true);
assert.equal(openingAllowed({ roleId: "dean" }), true);
assert.equal(openingAllowed({ roleId: "viceDean" }), true);
assert.equal(openingAllowed({ roleId: "departmentHead", canManageSchedule: false }), false, "رئيس القسم بلا شاشة الجدول لا يرى المجسّم");
assert.equal(openingAllowed({ roleId: "standard", canManageSchedule: false }), false, "الأستاذ");
assert.equal(openingAllowed({ roleId: "advisor", canManageSchedule: true }), false);
assert.equal(openingAllowed({ roleId: "registrarStaff", canManageSchedule: false }), false);

/* ── مرةً في اليوم، لا لمن أوقفها، ولا للطباعة ولا لعطلة الأسبوع ولا ليومٍ بلا محاضرات ── */
const day = openingDay(new Date(2026, 10, 26, 9, 5));
assert.equal(day, "2026-11-26");
const base = { allowed: true, off: false, seenDay: "2026-11-25", today: day, lectures: 12 };
assert.equal(openingMode(base), "full");
assert.equal(openingMode({ ...base, reducedMotion: true }), "still", "حركةٌ أقل: إطارٌ ساكن");
assert.equal(openingMode({ ...base, seenDay: day }), "none", "رُئيت اليوم على هذا الجهاز");
assert.equal(openingMode({ ...base, off: true }), "none");
assert.equal(openingMode({ ...base, allowed: false }), "none");
assert.equal(openingMode({ ...base, print: true }), "none");
assert.equal(openingMode({ ...base, weekend: true }), "none");
assert.equal(openingMode({ ...base, lectures: 0 }), "none");

/* ── ما ترسمه وما تقوله ── */
const today = [
  { startTime: "08:00", endTime: "09:15", roomCode: "901A03", roomHall: "2-15" },
  { startTime: "08:30", endTime: "09:20", roomCode: "901A03", roomHall: "1-04" },
  { startTime: "09:00", endTime: "09:50", roomCode: "901A03", roomHall: "1-05" },
  { startTime: "11:00", endTime: "12:15", roomCode: "901A03", roomHall: "2-15" },
  { startTime: "11:00", endTime: "11:50", roomCode: "905B01", roomHall: "101" },
  { startTime: "13:00", endTime: "13:50", roomCode: "", roomHall: "" },
];
const sky = openingSkyline(today);
assert.equal(sky.length, 2, "مبنيان");
assert.equal(sky.reduce((n, b) => n + b.halls.length, 0), 4, "كل قاعةٍ نافذةٌ واحدة، والموعد بلا قاعة لا يُرسم");
assert.ok(!JSON.stringify(sky).includes("مدخل"), "لا مقرر ولا اسم في الرسم");
const big = sky.find(b => b.halls.length === 3)!;
assert.deepEqual(big.halls.map(h => h.floor), [1, 1, 2], "الطوابق الدنيا أولاً");
const hall215 = big.halls.find(h => h.key.endsWith("|215"))!;
assert.equal(hallLitAt(hall215, 8 * 60 + 10), true);
assert.equal(hallLitAt(hall215, 10 * 60), false);
assert.equal(hallUsedBefore(hall215, 10 * 60), true);
const numbers = openingNumbers(today, 9 * 60 + 5);
assert.equal(numbers.lectures, 6);
assert.equal(numbers.hallsNow, 3, "قاعاتٌ لا محاضرات، والموعد بلا قاعة لا يُعدّ قاعة");
assert.deepEqual(numbers.peak, { minute: 9 * 60, count: 3 }, "أول دقيقةٍ يبلغ فيها الجاري أقصاه");
assert.equal(openingSkyline(today, 2).reduce((n, b) => n + b.halls.length, 0), 2, "سقف القاعات المرسومة: أكثرها إشغالاً");
assert.equal(openingClock(5 * 60), OPENING_DAWN + 30, "قبل الفجر: تقف قرب أوله");
assert.equal(openingClock(23 * 60), OPENING_DUSK);
assert.equal(openingClockText(8 * 60), "8:00 ص");
assert.equal(openingClockText(13 * 60 + 5), "1:05 م");

/* ── الشاشات: من يرى ماذا، وما لا يحدث ── */
const app = source("src/App.tsx"), dash = source("src/components/Dashboard.tsx"), fpUi = source("src/components/DeptFingerprint.tsx");
const pulseUi = source("src/components/hallPulse/HallPulse.tsx"), film = source("src/components/TermFilm.tsx"), opening = source("src/components/DayOpening.tsx");
const sched = source("src/components/Schedules.tsx"), css = source("src/styles/day-opening.css");
assert.match(app, /<DeptFingerprintPage onOpenPulse=\{hasPerm\(7\) \? openPulseFocus : undefined\} \/>/, "رابط النبض في البصمة لمن يفتح شاشة الجدول وحده");
assert.match(dash, /onOpenPulse=\{canManageSchedule\?openPulse:undefined\}/, "وكذلك في بطاقة اللوحة");
assert.match(fpUi, /link && data\.halls\[arc\.hall\]\?\.key/, "بلا رابط: تفاصيل القوس وحدها، لا طريق مسدود");
assert.match(fpUi, /clone\.querySelectorAll\("\.dfp-hits"\)\.forEach\(node => node\.remove\(\)\)/, "مقابض الحلقات لا تدخل الصورة المنزَّلة");
assert.match(pulseUi, /model\.sessions\.some\(x => x\.hallKey === selHall\.key\) \? registryKeyOfPulseHall\(selHall\)/, "«في البصمة» لقاعةٍ لها حلقة فقط");
assert.match(sched, /onOpenFingerprint=\{filterSection \? openFingerprintAt : undefined\}/, "البصمة لقسمٍ واحد: لا رابط في نطاق الكلية");
assert.match(sched, /writeSharedScope\(\{ collegeId: focus\.collegeId, sectionId: focus\.sectionId, termId: focus\.termId \}/, "النطاق يُعرض على نطاق القارئ كأي نطاقٍ محفوظ");
assert.match(film, /fingerprint && scope\.version === "dept"/, "زرّ البصمة في الختام لنسخة القسم ولمن يراها وحده");
assert.match(dash, /const DayOpening=lazy\(\(\)=>import\("\.\/DayOpening"\)\)/, "الافتتاحية كسولة");
assert.doesNotMatch(opening, /import[^;]*("three"|pulseScene|HallPulse)/, "لا three.js في الرئيسية");
assert.doesNotMatch(source("src/utils/dayOpening.ts"), /^import /m, "ملف البوابة في حمولة اللوحة بلا استيراد");
assert.match(css, /\.dop\{position:fixed;inset:0;z-index:9000;pointer-events:none/, "لا تلتقط المؤشر: لا تحجب شيئاً");
assert.match(css, /@media print\{\.dop\{display:none!important\}\}/);
assert.match(opening, /\["pointerdown", "keydown", "wheel", "touchstart"\]/, "أي فعلٍ يسحبها");
assert.doesNotMatch(opening + source("src/utils/dayOpeningScene.ts"), /fetch\(|method:\s*"(POST|PUT|DELETE)"/, "لا طلب ولا كتابة");
assert.match(app, /openingAllowed\(\{ roleId: sessionRole\.id, canManageSchedule: hasPerm\(7\) \}\)/, "زرّ الإيقاف لمن تظهر له وحده");
for (const text of [opening, source("src/utils/dayOpeningScene.ts"), source("src/utils/pulseLink.ts")]) assert.doesNotMatch(text, /[٠-٩٪]/, "أرقامٌ لاتينية");

/* الطيران المنتظر يُمسح بعد أن تطير الكاميرا: مسحُه قبل المؤقّت يلغي الطيران. */
const flight = pulseUi.slice(pulseUi.indexOf("if (!flyKey || !sceneReady) return;"), pulseUi.indexOf("return () => window.clearTimeout(timer);", pulseUi.indexOf("if (!flyKey || !sceneReady) return;")));
assert.ok(flight.includes("flown.current = flyKey;\n      setFlyKey(null);\n    }, reduced"), "مسح الطيران داخل المؤقّت بعد الاقتراب");
assert.ok(!/\}, reduced \? 0 : 520\);\n\s*setFlyKey\(null\)/.test(flight), "ولا مسح قبله");

console.log("connected-opening audit: passed");
