/**
 * ── نبض القاعات: الملاءمة، والمخطِّط، والتوصيل ──────────────────────────────
 *
 * يحرس الحساب النقي (utils/hallPulse): حدود الألوان الأربعة، والطابق من رمز
 * القاعة، وأن «رتّب قاعاتي» لا يحجز قاعةً لشعبتين في الوقت نفسه — ولا بعد
 * تشغيل النقلات وإيقافها في أي ترتيب — ولا ينقل شعبةً إلى قاعةٍ من نوعٍ آخر،
 * ويحلّ المضغوطة بسلسلة «تُفرغ قاعة ثم تملؤها». ثم يحرس التوصيل: الميزة كسولة،
 * والحفظ من باب النقل المعتاد وحده، والقراءة وحدها خارج الورشة.
 */
import fs from "fs";
import path from "path";
import {
  applyPlan, borrowCandidates, buildPulseModel, busiestMinute, compatible, occupantsAt, slotStats, doubleBookings, fitClass, floorOf, hallFreeFor, layoutHalls, metrics, originalAssignment,
  planDay, planMoves, suggestHalls, toggleGroup, weeklyHeat, PULSE_DAYS, type PulseDay,
} from "../src/utils/hallPulse";
import {
  beforeAfter, cinemaLegs, cinemaMinute, cinemaSteps, glide, hallStatesAt, peakMoment, playbackKind, pressureAt, pressureCurve, seatLayout, soundLevels, worstMoment,
  CINEMA_SECONDS, SEAT_DRAW_MAX, STAND_DRAW_MAX,
} from "../src/utils/hallPulseDay";
import { openCountOf, registrarLayer, requestBlockText, requestLineText } from "../src/utils/hallPulseRegistrar";
import { liveSectionTexts } from "../src/utils/registrarCheck";
import type { RegistrarRequestItem } from "../src/utils/registrarRequest";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

/* ── الملاءمة ── */
check(fitClass(41, 30) === "pressed", "أكثر من السعة: مضغوطة");
check(fitClass(30, 30) === "full" && fitClass(27, 30) === "full", "من 90٪ إلى 100٪: ممتلئة");
check(fitClass(26, 30) === "fit" && fitClass(18, 40) === "fit", "من 45٪ إلى أقل من 90٪: مناسبة");
check(fitClass(17, 40) === "wide" && fitClass(16, 80) === "wide", "أقل من 45٪: واسعة على شعبتها");
check(fitClass(20, null) === "unknown" && fitClass(0, 30) === "unknown", "سعة أو عدد مجهول: لا لون مخترع");

/* ── الطابق ── */
check(floorOf("101") === 1 && floorOf("205") === 2 && floorOf("3-14") === 3, "الطابق من المئات أو مما قبل الشرطة");
check(floorOf("G20") === 0 && floorOf("F13") === 0 && floorOf("") === 0, "الأرضي، وما لا يدلّ على طابق يبقى في الأرضي");
check(floorOf("١٠٤") === 1, "الأرقام العربية تُقرأ");

/* ── نموذجٌ صغير: مبنى قاعات ومبنى مختبرات ── */
const registry = {
  buildings: [{ id: "b1", officialCode: "012B01", buildingNumber: "1" }, { id: "b2", officialCode: "012B02", buildingNumber: "2" }],
  rooms: [
    { id: "r101", buildingId: "b1", canonicalCode: "101", capacity: 40 },
    { id: "r102", buildingId: "b1", canonicalCode: "102", capacity: 40 },
    { id: "r104", buildingId: "b1", canonicalCode: "104", capacity: 30 },
    { id: "r201", buildingId: "b1", canonicalCode: "201", capacity: 45 },
    { id: "r301", buildingId: "b1", canonicalCode: "301", capacity: 80 },
    { id: "r304", buildingId: "b1", canonicalCode: "304", capacity: 30 },
    { id: "rL1", buildingId: "b2", canonicalCode: "L1", capacity: 24, roomType: "مختبر حاسوب" },
    { id: "rL2", buildingId: "b2", canonicalCode: "L2", capacity: 60, roomType: "مختبر حاسوب" },
    { id: "rX", buildingId: "b1", canonicalCode: "105", capacity: 50, foreignSpecialised: true },
  ],
};
const courses = [
  { AdCourseId: 1, CourseName: "تراكيب البيانات", MaxStudent: 41 },
  { AdCourseId: 2, CourseName: "مقدمة", MaxStudent: 18 },
  { AdCourseId: 3, CourseName: "قواعد البيانات", MaxStudent: 36 },
  { AdCourseId: 4, CourseName: "برمجة عملي", MaxStudent: 20, CourseRoomType: "مختبر حاسوب" },
  { AdCourseId: 5, CourseName: "شبكات", MaxStudent: 38 },
];
let id = 1;
const row = (course: number, room: string, days: string[], start: string, end: string) => ({
  id: id++, AdSectionId: 9, AdCourseId: course, SCode: String(500 + id), fstarttime: start, fendtime: end, roomId: room,
  fsunday: days.includes("sun"), fmonday: days.includes("mon"), ftuesday: days.includes("tue"), fwednesday: days.includes("wed"), fthursday: days.includes("thu"),
});
const rows = [
  row(1, "r104", ["sun", "tue", "thu"], "10:00", "11:00"), // 41 في 30: مضغوطة
  row(2, "r301", ["sun", "tue", "thu"], "10:00", "11:00"), // 18 في 80: واسعة جداً
  row(3, "r101", ["sun", "tue", "thu"], "10:00", "11:00"),
  row(5, "r102", ["sun", "tue", "thu"], "10:00", "11:00"),
  row(3, "r201", ["sun", "tue", "thu"], "10:00", "11:00"),
  row(4, "rL1", ["sun"], "10:00", "12:00"), // مختبر، 20 في 24: ممتلئة؟ 0.83 مناسبة
  row(4, "rL2", ["mon"], "08:00", "10:00"), // 20 في 60: واسعة، ولا مختبر آخر فارغ مناسب إلا L1
  row(2, "r304", ["tue"], "10:00", "11:00"), // 304 مشغولة الثلاثاء: لا تستقبل شعبة «أحد·ثلاثاء·خميس»
];
const model = buildPulseModel({ rows, courses, registry, includeUnusedRegistryHalls: true });
const base = originalAssignment(model);
check(model.halls.length === 9 && model.sessions.length === rows.length, "كل قاعات السجل وكل المواعيد في النموذج");
check(model.hallByKey.get("id:r101")!.floor === 1 && model.hallByKey.get("id:r301")!.floor === 3, "الطوابق من رموز القاعات");
check(doubleBookings(model, base).length === 0, "الجدول الأصلي بلا حجزٍ مزدوج");

/* القاعة تُنقل في أيام الشعبة كلها: 304 فارغة الأحد لكنها مشغولة الثلاثاء. */
const small = model.sessions.find(s => s.hallKey === "id:r301")!;
check(!hallFreeFor(model, base, "id:r304", small), "304 ليست فارغة لشعبة أحد·ثلاثاء·خميس لأنها مشغولة الثلاثاء");

/* النوع يُحترم */
const lab = model.sessions.find(s => s.hallKey === "id:rL2")!;
check(!compatible(model, lab, model.hallByKey.get("id:r101")!), "شعبة المختبر لا تذهب إلى قاعة نظرية");
check(!compatible(model, small, model.hallByKey.get("id:rL2")!), "الشعبة النظرية لا تذهب إلى مختبر");
check(!compatible(model, small, model.hallByKey.get("id:rX")!), "ولا إلى قاعةٍ متخصّصة لقسمٍ آخر");
check(suggestHalls(model, base, lab.id).every(h => h.lab), "مقترحات المختبر مختبرات فقط");

/* «رتّب قاعاتي» للأحد: 301 الواسعة تُفرغ لشعبة 104 المضغوطة (سلسلة أو بعد نقل الواسعة). */
const sunday: PulseDay = "fsunday";
const plan = planDay(model, base, sunday);
const after = applyPlan(base, plan);
const movedIds = new Set(planMoves(plan).map(m => m.sessionId));
check(plan.groups.length > 0, "الخطة تقترح نقلات");
check(doubleBookings(model, after).length === 0, "الخطة لا تحجز قاعةً لشعبتين في الوقت نفسه، في كل الأيام");
check(planMoves(plan).every(m => compatible(model, model.sessionById.get(m.sessionId)!, model.hallByKey.get(m.to)!)), "كل نقلة إلى قاعةٍ من النوع نفسه وبسعةٍ تكفي");
check(new Set(planMoves(plan).map(m => m.sessionId)).size === planMoves(plan).length, "كل شعبة تُنقل مرة واحدة على الأكثر");
const before = metrics(model, base, sunday), now = metrics(model, after, sunday);
check(now.over < before.over, `المضغوطة تقلّ (${before.over} ← ${now.over})`);
check(now.waste <= before.waste && now.pct >= before.pct, "الهدر لا يزيد ونسبة التناسب لا تنقص");
const pressed = model.sessions.find(s => s.hallKey === "id:r104")!;
check(movedIds.has(pressed.id) && fitClass(pressed.students, model.hallByKey.get(after.get(pressed.id)!)!.capacity) !== "pressed", "شعبة 104 المضغوطة وجدت قاعةً تتّسع لها");

/* سلسلة: لا قاعة فارغة تتّسع للمضغوطة إلا بأن تتنحّى شعبةٌ صغيرة. */
{
  let k = 1000;
  const r = (course: number, room: string) => ({ id: k++, AdSectionId: 9, AdCourseId: course, fstarttime: "09:00", fendtime: "10:00", roomId: room, fsunday: true });
  const reg = { buildings: registry.buildings, rooms: [
    { id: "a", buildingId: "b1", canonicalCode: "101", capacity: 30 },
    { id: "b", buildingId: "b1", canonicalCode: "102", capacity: 55 },
    { id: "c", buildingId: "b1", canonicalCode: "103", capacity: 25 },
  ] };
  const cs = [{ AdCourseId: 1, MaxStudent: 41 }, { AdCourseId: 2, MaxStudent: 20 }];
  const m2 = buildPulseModel({ rows: [r(1, "a"), r(2, "b")], courses: cs, registry: reg, includeUnusedRegistryHalls: true });
  const p2 = planDay(m2, originalAssignment(m2), "fsunday");
  /* الصغيرة الواسعة تتنحّى أولاً (فهي واسعة على قاعتها)، ثم تدخل المضغوطة: نقلتان، والثانية تعتمد على الأولى. */
  const into = p2.groups.find(g => g.moves.some(mv => mv.sessionId === 1000));
  const a2 = applyPlan(originalAssignment(m2), p2);
  check(Boolean(into) && (into!.moves.length === 2 || into!.deps.length === 1), "المضغوطة بلا قاعة فارغة تُحلّ بنقلتين مترابطتين");
  toggleGroup(p2, p2.groups.find(g => g.moves.some(mv => mv.sessionId === 1001))!.id, false);
  check(!into!.on && doubleBookings(m2, applyPlan(originalAssignment(m2), p2)).length === 0, "إيقاف نقلة التنحّي يوقف ما يعتمد عليها");
  toggleGroup(p2, into!.id, true);
  check(p2.groups.every(g => g.on), "وتشغيلها يعيد ما تعتمد عليه");
  check(doubleBookings(m2, a2).length === 0 && fitClass(41, m2.hallByKey.get(a2.get(1000)!)!.capacity) === "fit", "بعد السلسلة: لا حجز مزدوج والمضغوطة مناسبة");
}

/* تشغيل النقلات وإيقافها عشوائياً (مع الاعتماد) لا يحجز قاعةً مرتين أبداً. */
{
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const rooms = Array.from({ length: 14 }, (_, i) => ({ id: `q${i}`, buildingId: i < 10 ? "b1" : "b2", canonicalCode: `${100 + i}`, capacity: [20, 25, 30, 35, 40, 45, 50, 60, 80, 100, 24, 30, 40, 60][i], roomType: i >= 10 ? "مختبر" : "" }));
  const cs = Array.from({ length: 12 }, (_, i) => ({ AdCourseId: i + 1, MaxStudent: 12 + Math.round(rnd() * 70), CourseRoomType: i >= 9 ? "مختبر" : "" }));
  let worst = 0, typeBreaks = 0, trials = 0;
  for (let t = 0; t < 40; t++) {
    const rws: any[] = [];
    let k = 1;
    for (let rI = 0; rI < rooms.length; rI++) {
      for (let slot = 8; slot < 18; slot += 1 + Math.floor(rnd() * 2)) {
        if (rnd() < 0.35) continue;
        const labRoom = rI >= 10;
        const course = labRoom ? 10 + Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 9);
        const days = rnd() < 0.5 ? { fsunday: true, ftuesday: true, fthursday: true } : { fmonday: true, fwednesday: true };
        rws.push({ id: k++, AdSectionId: 9, AdCourseId: course, fstarttime: `${String(slot).padStart(2, "0")}:00`, fendtime: `${String(slot).padStart(2, "0")}:50`, roomId: rooms[rI].id, ...days });
      }
    }
    const m = buildPulseModel({ rows: rws, courses: cs, registry: { buildings: registry.buildings, rooms }, includeUnusedRegistryHalls: true });
    const b = originalAssignment(m);
    const existing = new Set(doubleBookings(m, b).map(p => p.join(":")));
    for (const day of PULSE_DAYS.map(d => d.key)) {
      const p = planDay(m, b, day);
      for (let flip = 0; flip < 12 && p.groups.length; flip++) {
        toggleGroup(p, Math.floor(rnd() * p.groups.length), rnd() < 0.5);
        const a = applyPlan(b, p);
        const fresh = doubleBookings(m, a).filter(pair => !existing.has(pair.join(":")));
        worst = Math.max(worst, fresh.length);
        typeBreaks += planMoves(p).filter(mv => {
          const s = m.sessionById.get(mv.sessionId)!, h = m.hallByKey.get(mv.to)!;
          return Boolean(s.expectedType) && h.type !== s.expectedType || h.lab !== m.hallByKey.get(mv.from)!.lab;
        }).length;
        trials++;
        /* الاعتماد مغلق: كل مجموعة شغّالة شغّالةٌ معها كل ما تعتمد عليه. */
        if (p.groups.some(g => g.on && g.deps.some(d => !p.groups[d].on))) worst = Math.max(worst, 99);
      }
    }
  }
  check(trials > 100, `جُرّبت ${trials} حالة تشغيل وإيقاف`);
  check(worst === 0, "لا حجز مزدوج جديد في أي مجموعةٍ مختارة من النقلات، والاعتماد يبقى مغلقاً");
  check(typeBreaks === 0, "لا نقلة تعبر بين المختبر والقاعة النظرية");
}

/* ── قاعةٌ في سجل القسم لم يستعملها بعد: لا تُعدّ فارغةً قبل أن يُقرأ إشغالها ── */
{
  let k = 3000;
  const r = (course: number, room: string, start = "09:00", end = "10:00") => ({ id: k++, AdSectionId: 9, AdCourseId: course, fstarttime: start, fendtime: end, roomId: room, fsunday: true, ftuesday: true });
  const reg = { buildings: registry.buildings, rooms: [
    { id: "p", buildingId: "b1", canonicalCode: "101", capacity: 30 },
    { id: "big", buildingId: "b1", canonicalCode: "201", capacity: 60 }, // لا يستعملها القسم
  ] };
  const cs = [{ AdCourseId: 1, MaxStudent: 41 }];
  const rows3 = [r(1, "p")];
  /* room-load القديم: قاعات النطاق وحدها؛ 201 غائبة عن الرد. */
  const legacy = { rooms: [{ room: "012B01", hall: "101", roomId: "p", busy: [{ day: 0, from: 540, to: 600, mine: true }] }] };
  const blind = buildPulseModel({ rows: rows3, courses: cs, registry: reg, roomLoad: legacy, includeUnusedRegistryHalls: true, requireOccupancyCheck: true });
  check(suggestHalls(blind, originalAssignment(blind), 3000).length === 0 && planDay(blind, originalAssignment(blind), "fsunday").groups.length === 0,
    "قاعةٌ لم يُقرأ إشغالها لا تُقترح فارغة، لا في الاقتراح ولا في «رتّب قاعاتي»");
  /* بعد طلب roomIds: قسمٌ آخر يشغل 201 الأحد 09:00. */
  const busy = { checkedRoomIds: ["p", "big"], rooms: [legacy.rooms[0], { room: "012B01", hall: "201", roomId: "big", busy: [{ day: 0, from: 540, to: 600, mine: false }] }] };
  const seen = buildPulseModel({ rows: rows3, courses: cs, registry: reg, roomLoad: busy, includeUnusedRegistryHalls: true, requireOccupancyCheck: true });
  check(suggestHalls(seen, originalAssignment(seen), 3000).length === 0 && planDay(seen, originalAssignment(seen), "fsunday").groups.length === 0,
    "قاعةٌ يشغلها قسمٌ آخر في وقت الشعبة لا تُقترح ولو لم يستعملها قسمنا");
  /* وفارغةٌ مفحوصة (checkedRoomIds بلا أوقات): تُقترح. */
  const free = buildPulseModel({ rows: rows3, courses: cs, registry: reg, roomLoad: { checkedRoomIds: ["p", "big"], rooms: legacy.rooms }, includeUnusedRegistryHalls: true, requireOccupancyCheck: true });
  check(suggestHalls(free, originalAssignment(free), 3000)[0]?.key === "id:big", "وقاعةٌ مفحوصةٌ فارغة تُقترح");
}

/* ── الاستعارة تحترم النوع لا الملكية وحدها ── */
{
  const labSession = model.sessions.find(s => s.hallKey === "id:rL2")!; // شعبة مختبر (CourseRoomType مختبر حاسوب)، الاثنين 08:00–10:00
  const theory = model.sessions.find(s => s.hallKey === "id:r104")!; // نظرية، أحد·ثلاثاء·خميس 10:00–11:00
  const op = (roomId: string, day: string, roomType: string, capacity: number, start = "08:00", end = "12:00") =>
    ({ id: `${roomId}-${day}`, roomId, buildingId: "nb", roomCode: "013B01", roomHall: roomId, day, startTime: start, endTime: end, ownerSectionName: "القسم المجاور", roomType, fit: { capacity, specialised: false } });
  const ops = [
    op("LEC", "monday", "قاعة تدريسية", 80), op("LAB", "monday", "مختبر حاسوب", 30),
    ...["sunday", "tuesday", "thursday"].flatMap(d => [op("LEC", d, "قاعة تدريسية", 80), op("LAB", d, "مختبر حاسوب", 60)]),
    op("SMALL", "sunday", "قاعة تدريسية", 20), op("SMALL", "tuesday", "قاعة تدريسية", 20), op("SMALL", "thursday", "قاعة تدريسية", 20),
    op("PART", "sunday", "قاعة تدريسية", 90), // يوم واحد من ثلاثة
  ];
  const forLab = borrowCandidates(model, labSession, ops);
  check(forLab.options.map(o => o.roomId).join() === "LAB", "شعبة المختبر لا تُقترح لها قاعة محاضرات واسعة، بل مختبرٌ يتّسع لها");
  const forTheory = borrowCandidates(model, theory, ops);
  check(forTheory.options.map(o => o.roomId).join() === "LEC", "الشعبة النظرية: قاعة نظرية تتّسع وتفرغ في أيامها الثلاثة، لا المختبر ولا الصغيرة ولا فارغة يومٍ واحد");
  check(forTheory.others.some(o => o.roomId === "PART"), "وفارغة اليوم الأول وحده تُرسم باهتة لا تُقترح");
  const specialised = borrowCandidates(model, theory, ops.map(o => o.roomId === "LEC" ? { ...o, fit: { capacity: 80, specialised: true } } : o));
  check(!specialised.options.length, "والقاعة المتخصّصة لقسمٍ آخر لا تُقترح");
}

/* ── عدّادات الرأس من الإشغال نفسه الذي يُلوَّن به المشهد ── */
{
  const at = occupantsAt(model, base, "fsunday", 10 * 60 + 5);
  const st = slotStats(model, at);
  check(st.busy === at.size && st.busy === 6, `الأحد 10:05: مشغولة ${st.busy} قاعات كما في المشهد`);
  check(st.over === 1, "والمضغوطة واحدة (104: 41 في 30) — لا «مضغوطة 0» وقاعةٌ حمراء أمام القارئ");
  check(st.wide === 1 && st.busy === st.over + st.full + st.fit + st.wide, "والواسعة 301، والمجموع يساوي المشغولة المعروفة السعة");
  const best = busiestMinute(model, base, "fsunday");
  check(best !== null && occupantsAt(model, base, "fsunday", best).size >= at.size, "أزحم لحظةٍ في اليوم لا تقل إشغالاً عن أي لحظة");
  check(busiestMinute(model, base, "fwednesday") === null, "يومٌ بلا محاضرات: لا لحظة، فلا يُقفز إلى ساعةٍ فارغة");
}

/* حرارة الأسبوع والتخطيط المكاني */
const heat = weeklyHeat(model, base);
check(heat.get("id:r104")!.days[0] > 0 && heat.get("id:r104")!.days[1] === 0, "حرارة الأسبوع لكل يوم: 104 تعمل الأحد ولا تعمل الاثنين");
check(heat.get("id:r104")!.worst === "pressed", "أسوأ حالات القاعة في الأسبوع محفوظة");
const L = layoutHalls(model.halls);
check(L.spots.size === model.halls.length && L.buildings.length === 2, "كل قاعة لها موضع، ومبنيان");
const ys = new Set([...L.spots.values()].filter(s => s.key.startsWith("id:r")).map(s => s.y));
check(ys.size >= 3, "الطوابق المختلفة على ارتفاعات مختلفة");
const positions = [...L.spots.values()].map(s => `${s.x.toFixed(2)}|${s.y.toFixed(2)}|${s.z.toFixed(2)}`);
check(new Set(positions).size === positions.length, "لا قاعتان في الموضع نفسه");

/* ── الجولة الثالثة: اليوم يمرّ أمامك ── */
{
  const curve = pressureCurve(model, base, "fsunday");
  check(curve.length === (model.dayEnd - model.dayStart) / 5 && curve[0].minute === model.dayStart, "منحنى اليوم: نقطةٌ كل خمس دقائق من أول اليوم إلى آخره");
  const at = pressureAt(model, base, "fsunday", 10 * 60 + 5);
  check(at.students === 41 + 18 + 36 + 38 + 36 + 20 && at.busy === 6, `الأحد 10:05: نحو ${at.students} طالباً في 6 قاعات (مجموع سعات المقررات)`);
  check(at.over === 11 && at.pressed === 1, "ومن فوق السعة 11 (41 في 30) في قاعةٍ واحدة");
  check(pressureAt(model, base, "fsunday", 9 * 60).students === 0 && pressureAt(model, base, "fsunday", 9 * 60).over === 0, "وساعةٌ بلا محاضرات: لا طلبة ولا ضغط");
  const worst = worstMoment(model, base, "fsunday", curve)!;
  check(worst.minute === 10 * 60 && worst.hallKey === "id:r104", "أشدّ لحظة: أول دقيقةٍ يبلغ فيها التجاوز أقصاه (10:00) وقاعتها 104");
  check(worst.students === 41 && worst.capacity === 30 && worst.over === 11 && worst.totalOver === 11 && worst.pressed === 1, "وتعليقها: 41 في 30، 11 فوق السعة");
  check(worstMoment(model, base, "fmonday") === null && worstMoment(model, base, "fwednesday") === null, "يومٌ بلا قاعةٍ فوق سعتها (أو بلا محاضرات): لا لحظة تُخترع، فلا يقف العرض");
  const peak = peakMoment(curve)!;
  check(peak.minute === 10 * 60 && peak.students === at.students, "ذروة الحضور أبكر لحظةٍ بأكثر الطلبة");
  check(peakMoment(pressureCurve(model, base, "fwednesday")) === null, "ويومٌ بلا محاضرات: لا ذروة");
  /* بعد الخطة يزول الضغط من المنحنى نفسه. */
  const planned = applyPlan(base, planDay(model, base, "fsunday"));
  check(worstMoment(model, planned, "fsunday") === null && pressureAt(model, planned, "fsunday", 605).students === at.students, "بعد «رتّب قاعاتي»: الطلبة أنفسهم ولا أحد فوق السعة");

  /* توقيت العرض: ثلاثون ثانية، يقف عند أشدّ لحظة، بتخفيفٍ لا بقفزات. */
  const legs = cinemaLegs(model.dayStart, model.dayEnd, worst.minute);
  check(legs.length === 2 && legs[0].from === model.dayStart && legs[0].to === worst.minute && legs[1].from === worst.minute && legs[1].to === model.dayEnd - 5, "العرض مقطعان: إلى أشدّ لحظة ثم منها إلى آخر اليوم");
  check(Math.abs(legs[0].seconds + legs[1].seconds - CINEMA_SECONDS) < 1e-9 && CINEMA_SECONDS === 30 && legs.every(l => l.seconds >= 3), "ومجموعهما ثلاثون ثانية، ولا مقطع أقصر من ثلاث ثوانٍ");
  const whole = cinemaLegs(model.dayStart, model.dayEnd, null);
  check(whole.length === 1 && whole[0].seconds === 30, "وبلا لحظة ضغط: مقطعٌ واحد لا يقف");
  check(cinemaMinute(legs[0], 0) === legs[0].from && Math.abs(cinemaMinute(legs[0], legs[0].seconds) - worst.minute) < 1e-9, "المقطع يبدأ من أوله ويصل إلى أشدّ لحظة بالضبط");
  let mono = true, maxJump = 0, prev = legs[1].from;
  for (let t = 0; t <= legs[1].seconds + 1e-9; t += 1 / 60) { const m = cinemaMinute(legs[1], t); if (m < prev - 1e-9) mono = false; maxJump = Math.max(maxJump, m - prev); prev = m; }
  check(mono && maxJump < 1.2, `الساعة لا ترجع ولا تقفز: أكبر خطوةٍ في الإطار ${maxJump.toFixed(2)} دقيقة`);
  const v = (u: number) => (glide(u + 0.001) - glide(u)) / 0.001;
  check(v(0) < 0.3 && v(0.998) < 0.3 && v(0.5) > 1.5 && glide(0) === 0 && Math.abs(glide(1) - 1) < 1e-9, "تخفيف: هادئ في البداية وعند الوصول، وأسرع في الوسط");
  const steps = cinemaSteps(model.dayStart, model.dayEnd, 10 * 60 + 10);
  check(steps.includes(10 * 60 + 10) && steps[0] === model.dayStart && steps.every((m, i) => i === 0 || m > steps[i - 1]) && steps[steps.length - 1] <= model.dayEnd - 5, "تقليل الحركة: خطواتٌ متصاعدة كل نصف ساعة، وأشدّ لحظةٍ خطوةٌ منها بعينها");

  /* مراجعة #637: آخر خطوةٍ آخرُ اليوم، فينتهي عرض تقليل الحركة ولا يدور على 19:30. */
  const plain = cinemaSteps(8 * 60, 20 * 60, null);
  check(plain[plain.length - 1] === 20 * 60 - 5 && plain[plain.length - 2] === 19 * 60 + 30 && new Set(plain).size === plain.length, "تقليل الحركة: آخر خطوةٍ 19:55 بعينها بعد 19:30، بلا تكرار");
  check(cinemaSteps(8 * 60, 20 * 60, 20 * 60 - 5).filter(m => m === 20 * 60 - 5).length === 1 && cinemaSteps(8 * 60, 8 * 60 + 5, null).join() === String(8 * 60), "وأشدّ لحظةٍ في آخر اليوم أو يومٌ من خطوةٍ واحدة لا يكسران القائمة");
  /* مراجعة #637: أشدّ لحظةٍ في أول دقيقةٍ من اليوم يوقف عندها (مقطعٌ أول بلا طول)، ثم اليوم كله. */
  const opening = cinemaLegs(8 * 60, 20 * 60, 8 * 60);
  check(opening.length === 2 && opening[0].from === 8 * 60 && opening[0].to === 8 * 60 && opening[0].seconds === 0 && opening[1].to === 20 * 60 - 5 && opening[1].seconds === 30, "أشدّ لحظةٍ عند بداية اليوم: يقف العرض عندها فوراً ثم يكمل اليوم في ثلاثين ثانية");
  check(cinemaMinute(opening[0], 0) === 8 * 60 && cinemaMinute(opening[0], 1) === 8 * 60, "والمقطع الذي بلا طول يبقى عند بدايته");
  check(cinemaSteps(8 * 60, 20 * 60, 8 * 60)[0] === 8 * 60 && cinemaLegs(8 * 60, 20 * 60, 7 * 60).length === 1 && cinemaLegs(8 * 60, 20 * 60, 20 * 60 - 5).length === 1, "وخطوتها الأولى في تقليل الحركة هي نفسها؛ ولحظةٌ خارج اليوم أو في آخره لا تقسم العرض");
  {
    /* شعبةٌ فائضة من 08:00 ولا أسوأ بعدها: أشدّ لحظةٍ هي بداية اليوم. */
    const early = buildPulseModel({ rows: [row(1, "r104", ["wed"], "08:00", "09:00")], courses, registry, includeUnusedRegistryHalls: true });
    const w0 = worstMoment(early, originalAssignment(early), "fwednesday")!;
    check(w0.minute === early.dayStart && cinemaLegs(early.dayStart, early.dayEnd, w0.minute)[0].seconds === 0, "شعبةٌ فائضة من 08:00: أشدّ لحظةٍ بداية اليوم، والعرض يقف عندها");
  }
  /* مراجعة #637: العرض الذي يقف عند أشدّ لحظة للمجسّم وحده؛ المسطّح والمسارات ساعةٌ تمشي بلا وقوف. */
  check(playbackKind({ mode: "halls", flat: false }) === "cinema" && playbackKind({ mode: "halls", flat: true }) === "clock" && playbackKind({ mode: "paths", flat: false }) === "clock" && playbackKind({ mode: "paths", flat: true }) === "clock", "«شغّل اليوم»: عرضٌ في المجسّم، وساعةٌ عادية في المسطّح وفي مسارات التنقّل");

  /* النغمة: تعلو مع الازدحام وتهدأ مع الفراغ، والتوتّر من التجاوز. */
  const loud = soundLevels(at, peak.students), quiet = soundLevels(pressureAt(model, base, "fsunday", 9 * 60), peak.students);
  check(loud.crowd === 1 && quiet.crowd === 0 && quiet.tension === 0 && loud.tension > 0 && loud.tension <= 1, "النغمة: ازدحام 1 عند الذروة و0 في الفراغ، وتوتّرٌ حين تفيض قاعة");
  check(soundLevels({ students: 50, over: 0 }, 0).crowd === 0 && soundLevels({ students: 10, over: 0 }, 100).tension === 0, "ولا قسمة على صفر، ولا توتّر بلا تجاوز");
}

/* ── الجولة الثالثة: قبل وبعد ── */
{
  const plan = planDay(model, base, "fsunday");
  const ba = beforeAfter(model, base, plan, "fsunday", 10 * 60 + 5);
  check(ba.before.get("id:r104")!.fit === "pressed" && ba.before.get("id:r104")!.level > 1, "قبل: 104 مضغوطة ومنسوبها فوق 1");
  const movedTo = applyPlan(base, plan).get(model.sessions.find(x => x.hallKey === "id:r104")!.id)!;
  check(movedTo !== "id:r104" && ba.after.get(movedTo)!.fit !== "pressed" && ba.after.get(movedTo)!.students === 41, "بعد: شعبة 104 في قاعةٍ تتّسع لها");
  check(ba.changed.has("id:r104") && ba.changed.has(movedTo), "والقاعتان اللتان تغيّرت شعبتاهما موسومتان");
  const untouched = [...ba.before.keys()].filter(k => !ba.changed.has(k));
  check(untouched.length > 0 && untouched.every(k => ba.before.get(k)!.sessionId === ba.after.get(k)!.sessionId && ba.before.get(k)!.fit === ba.after.get(k)!.fit), "وما لم تمسّه الخطة متطابقٌ على الجانبين");
  const same = beforeAfter(model, base, null, "fsunday", 605);
  check(same.changed.size === 0, "بلا خطة: لا فرق بين الجانبين");
  const off = planDay(model, base, "fsunday"); off.groups.forEach(g => toggleGroup(off, g.id, false));
  check(beforeAfter(model, base, off, "fsunday", 605).changed.size === 0, "والنقلات المستبعدة كلها لا تغيّر «بعد»");
  const quietStates = hallStatesAt(model, base, "fsunday", 9 * 60);
  check([...quietStates.values()].every(st => st.fit === "empty" && st.level === 0 && st.sessionId === null), "ساعةٌ فارغة: كل القاعات فارغة على الجانبين");
}

/* ── الجولة الثالثة: القاعة من الداخل ── */
{
  const L = seatLayout(30, 41)!;
  check(L.drawn === 30 && L.seats.length === 30 && !L.capped && L.occupied === 30, "30 مقعداً لقاعةٍ سعتها 30، وكلها مشغولة");
  check(L.standingReal === 11 && L.standing === 11 && L.stand.length === 11, "ومن زاد على السعة (11) يقف عند الباب");
  check(L.rows * L.cols >= 30 && L.rows >= 2 && L.cols > L.rows, "المقاعد صفوفٌ أعرض من عمقها");
  const spots = new Set(L.seats.map(st => `${st.x.toFixed(2)}|${st.z.toFixed(2)}`));
  check(spots.size === 30, "لا مقعدان في الموضع نفسه");
  check(L.seats.every(st => Math.abs(st.x) <= L.width / 2 && st.z >= 0 && st.z <= L.depth) && L.seats.some(st => st.x < 0) && L.seats.some(st => st.x > 0), "والمقاعد داخل حدود القاعة على جانبي الممرّ");
  check(L.stand.every(p => p.z > Math.max(...L.seats.map(st => st.z)) + 0.5 && Math.abs(p.x) <= L.width / 2 + 0.5), "الواقفون خلف الصف الأخير وداخل عرض القاعة، لا بين المقاعد");
  check(new Set(L.order).size === 30 && L.order.every(i => i >= 0 && i < 30), "ترتيب الجلوس تبديلٌ كامل للمقاعد");
  const again = seatLayout(30, 41)!;
  check(again.order.join() === L.order.join(), "والترتيب ثابت بين رسمٍ ورسم");
  const half = seatLayout(40, 18)!;
  check(half.occupied === 18 && half.standing === 0 && half.standingReal === 0 && half.drawn === 40, "18 في 40: ثمانية عشر مقعداً ملوّناً والباقي هادئ ولا أحد واقف");
  const empty = seatLayout(40, 0)!;
  check(empty.occupied === 0 && empty.standing === 0, "قاعةٌ فارغة: مقاعد بلا طلبة");
  check(seatLayout(null, 20) === null && seatLayout(0, 20) === null, "سعةٌ غير مسجّلة: لا مقاعد تُخترع");
  const big = seatLayout(600, 450)!;
  check(big.capped && big.drawn === SEAT_DRAW_MAX && big.seats.length === SEAT_DRAW_MAX && big.capacity === 600, `القاعة الكبيرة تُرسم ${SEAT_DRAW_MAX} مقعداً ويُقال ذلك`);
  check(big.occupied === Math.round((450 / 600) * SEAT_DRAW_MAX), "والمشغول منها بالنسبة نفسها (ثلاثة أرباع)");
  const flood = seatLayout(20, 200)!;
  check(flood.standingReal === 180 && flood.standing <= STAND_DRAW_MAX && flood.standing < flood.standingReal && flood.stand.length === flood.standing, "والواقفون يُرسمون بحدٍّ ويبقى عددهم الحقيقي في التعليق");
  check(seatLayout(1, 1)!.seats.length === 1 && seatLayout(2, 5)!.standingReal === 3, "قاعاتٌ صغيرة جداً لا تكسر التخطيط");
}

/* ── طبقة التسجيل: بنود تقرير المطابقة على قاعاتها (FR-SCH-097) ── */
{
  const reg = { buildings: [{ id: "b1", officialCode: "012B01", buildingNumber: "1" }], rooms: [
    { id: "r101", buildingId: "b1", canonicalCode: "101", capacity: 40 },
    { id: "r102", buildingId: "b1", canonicalCode: "102", capacity: 40 },
    { id: "r104", buildingId: "b1", canonicalCode: "104", capacity: 30 },
    { id: "r201", buildingId: "b1", canonicalCode: "201", capacity: 45 },
  ] };
  const cs = [{ AdCourseId: 1, MaxStudent: 30 }, { AdCourseId: 2, MaxStudent: 20 }, { AdCourseId: 3, MaxStudent: 25 }];
  const at = (id: number, course: number, sec: string, room: string, extra: Record<string, unknown> = {}) => ({
    id, AdSectionId: 9, AdCourseId: course, SCode: sec, fstarttime: "10:00", fendtime: "11:00", fsunday: true, ftuesday: true,
    roomId: `r${room}`, AdRoomCode: "012B01", AdRoomHall: room, AdInstructorId: 7, ...extra,
  });
  const rr = [at(1, 1, "01", "104"), at(2, 2, "02", "101", { referenceNumber: "30442" }), at(3, 3, "05", "102")];
  const m = buildPulseModel({ rows: rr, courses: cs, registry: reg, includeUnusedRegistryHalls: true });
  const codeOf = (id: number) => `0109${String(100 + id).padStart(3, "0")}`;
  const base = { group: "notApplied" as const, kind: "fields" as const, courseName: "مقرر" };
  const item = (x: Partial<RegistrarRequestItem> & Pick<RegistrarRequestItem, "id" | "action" | "fields">): RegistrarRequestItem => ({ ...base, courseCode: "0109101", section: "1", ...x } as RegistrarRequestItem);
  const roomMove = item({ id: "edit:#30001", action: "edit", crn: "30001", courseCode: "101", section: "1",
    fields: [{ field: "room", label: "القاعة", pdf: "012B01 / 102", ours: "012B01 / 104" }] });
  const timeByCrn = item({ id: "edit:#30442", action: "edit", crn: "030442", courseCode: "0109102", section: "99",
    fields: [{ field: "time", label: "الوقت", pdf: "12:00–13:00", ours: "10:00–11:00" }] });
  const teacherOnly = item({ id: "edit:#30555", action: "edit", crn: "30555", courseCode: "0109103", section: "5",
    fields: [{ field: "instructor", label: "الأستاذ", pdf: "أ", ours: "ب" }] });
  const deletedThere = item({ id: "delete:#30777", action: "delete", crn: "30777", courseCode: "0109103", section: "8",
    fields: [{ field: "room", label: "القاعة", pdf: "012B01 / 201", ours: "—" }] });
  const deletedElsewhere = item({ id: "delete:#30888", action: "delete", crn: "30888", courseCode: "0109103", section: "9",
    fields: [{ field: "room", label: "القاعة", pdf: "999Z09 / 7", ours: "—" }] });
  const doneOne = item({ id: "edit:#30999", action: "edit", crn: "30999", courseCode: "0109103", section: "05",
    fields: [{ field: "days", label: "الأيام", pdf: "الأحد", ours: "الأحد · الثلاثاء" }], done: { by: 1, byName: "التسجيل", at: "2026-11-20T08:00:00Z" } });
  const settled = item({ id: "edit:#31000", action: "edit", crn: "31000", courseCode: "0109103", section: "5",
    fields: [{ field: "room", label: "القاعة", pdf: "012B01 / 102", ours: "012B01 / 201" }] });
  const items = [roomMove, timeByCrn, teacherOnly, deletedThere, deletedElsewhere, doneOne, settled];
  const texts = liveSectionTexts(rr as any[], { courseCodeById: new Map([1, 2, 3].map(id => [id, codeOf(id)])) });
  const L = registrarLayer(m, items, { courseCodeOf: codeOf, texts });
  const keysOf = (it: RegistrarRequestItem) => [...L.byHall.entries()].filter(([, list]) => list.some(e => e.item.id === it.id)).map(([k, list]) => `${k}:${list.find(e => e.item.id === it.id)!.role}`).sort();
  check(keysOf(roomMove).join() === "id:r102:theirs,id:r104:ours", "فرق القاعة: تنبض قاعتها عندنا (بالمقرر والشعبة) والقاعة التي في ملفهم");
  check(keysOf(timeByCrn).join() === "id:r101:ours", "يُعرف بالرقم المرجعي قبل المقرر والشعبة (والأصفار البادئة لا تفرّق)");
  check(L.noHall.some(x => x.id === teacherOnly.id) && !keysOf(teacherOnly).length, "فرق الأستاذ وحده بلا قاعة: في «بلا قاعة» لا يختفي");
  check(keysOf(deletedThere).join() === "id:r201:theirs", "شعبةٌ في ملفهم وحذفناها: تنبض القاعة التي يضعها فيها ملفهم");
  check(L.noHall.some(x => x.id === deletedElsewhere.id), "وقاعةٌ خارج المجسّم: «بلا قاعة»");
  check(!keysOf(settled).length && !L.noHall.some(x => x.id === settled.id) && L.total === items.length - 1, "ما سوّيناه بعد الفحص (جدولنا الآن كملفهم) لا يظهر (settleSavedItems)");
  const r102 = L.byHall.get("id:r102")!;
  check(r102.some(e => e.item.id === doneOne.id && !e.open) && openCountOf(r102) === 1, "ما شطبه التسجيل «نُفّذ» يبقى في القائمة ولا يُعدّ في النبض");
  check(L.halls === 4 && L.open === 5, `عدد القاعات النابضة والبنود المفتوحة (${L.halls}، ${L.open})`);
  const line = requestLineText(item({ id: "edit:#30001", action: "edit", crn: "30001", courseCode: "0109114", section: "1",
    fields: [{ field: "course", label: "المقرر", pdf: "114", ours: "112" }, { field: "room", label: "القاعة", pdf: "012B01 / 102", ours: "012B01 / 104" }] }));
  check(line.startsWith("عدّلوا الرقم المرجعي 30001") && line.includes("المقرر: 0109114 ← 0109112") && line.includes("القاعة: 012B01 / 102 ← 012B01 / 104"), "سطر الطلب بالرقم المرجعي، و«كان ← يصير»، والمقرر بسبع خانات على جانبي السهم");
  check(!/حذف|أضيفوا/.test(line) && requestLineText(deletedThere).startsWith("احذفوا الرقم المرجعي 30777"), "التعديل تعديلٌ بالرقم لا حذفٌ وإضافة؛ والحذف بالرقم أيضاً");
  check(requestBlockText([roomMove, roomMove, timeByCrn]).split("\n").length === 2, "نصّ القاعة سطرٌ لكل بند بلا تكرار");
  check(!/[٠-٩]/.test(requestBlockText(items)), "أرقام لاتينية في نصّ الطلب");
  const pulseSrc = fs.readFileSync(path.join(process.cwd(), "src/components/hallPulse/HallPulse.tsx"), "utf8");
  check(/\/api\/schedules\/registrar-requests\?/.test(pulseSrc) && /registrar-requests\/\$\{encodeURIComponent\(regDoc\.id\)\}\/live/.test(pulseSrc), "الطبقة تقرأ التقرير المحفوظ ومساره الحيّ الموجودين، لا مقارنةً ثانية");
  check(/regContext = \(context === "workshop" \|\| context === "dean"\)/.test(pulseSrc) && /regContext && regList \?/.test(pulseSrc), "الزرّ في الورشة وبطاقة العميد وحدهما، وبعد أن يقبل الخادم قراءة التقرير (بوابته نفسها)");
  check(!/civils/.test(pulseSrc), "لا رقم مدنياً في الطبقة");
}

/* ── التوصيل ── */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const lazy = read("src/components/hallPulse/HallPulseLazy.tsx");
const pulse = read("src/components/hallPulse/HallPulse.tsx");
const scene = read("src/components/hallPulse/pulseScene.ts");
const schedules = read("src/components/Schedules.tsx");
const reports = read("src/components/Reports.tsx");
const dashboard = read("src/components/Dashboard.tsx");
const pkg = JSON.parse(read("package.json"));
check(/lazy\(\(\) => import\("\.\/HallPulse"\)\)/.test(lazy), "الميزة تُحمَّل كسولاً (React.lazy)");
check(/import\("\.\/pulseScene"\)/.test(pulse) && !/^import .*from "three"/m.test(pulse), "three.js يُستورد ديناميكياً من المشهد وحده");
for (const [name, src] of [["Schedules", schedules], ["Reports", reports], ["Dashboard", dashboard]] as const) {
  check(!/from "three"|hallPulse\/HallPulse"|pulseScene/.test(src), `${name} لا يستورد three.js ولا الشاشة مباشرة`);
}
check(Boolean(pkg.dependencies?.three), "three تبعيةٌ معلنة");
check(/dispose\(\)\s*\{[\s\S]*renderer\.dispose\(\)[\s\S]*forceContextLoss/.test(scene) && /scene\?\.dispose\(\)/.test(pulse), "موارد WebGL تُفرَغ عند الإغلاق");
check(/prefers-reduced-motion/.test(pulse) && /useState\(reduced\)/.test(pulse), "تقليل الحركة يبدأ بالعرض المسطّح");
check(/changeView\("pulse"\)/.test(schedules) && /> مجسّم/.test(schedules), "«مجسّم» وضعٌ رابع في الورشة");
const commit = schedules.slice(schedules.indexOf("const commitHallPulseMoves"), schedules.indexOf("const pulseInstructorName"));
check(/\/api\/schedules\/move-batch/.test(commit) && !/fetch\(/.test(commit), "حفظ النبض من باب النقل المعتاد (move-batch) لا غيره");
check(/if \(dragBlocked\)/.test(commit) && /canSave=\{canEditSchedule && !dragBlocked && !phoneReadOnly\}/.test(schedules), "الحفظ لمن يملك تعديل الجدول (الشاشة 7) وحده، ولا حفظ على الهاتف (للقراءة)");
check(/requested === "pulse" \? "pulse" : "list"/.test(schedules), "الهاتف: القائمة افتراضاً، و«مجسّم» يُفتح بطلبه للقراءة");
check(/context="report"/.test(reports) && !/context="report"[\s\S]{0,400}onSaveMoves/.test(reports), "عدسة القاعات: مجسّم للقراءة فقط");
check(/roleId==="dean"\|\|roleId==="viceDean"/.test(dashboard), "لوحة العميدين وحدها تعرض بطاقة الكلية");
check(/context === "workshop"/.test(pulse), "لا حفظ خارج الورشة ولو مُرّر onSaveMoves");
check(/\/api\/hall-barter\/requests/.test(pulse) && /\/api\/hall-barter\?/.test(pulse), "الاستعارة عبر طلب استعارة القاعات الموجود");
check(/تقدير/.test(pulse), "عدد الطلبة موسومٌ بأنه تقدير");
/* الجولة الثالثة: التوصيل */
{
  const interior = read("src/components/hallPulse/pulseInterior.ts");
  const sound = read("src/components/hallPulse/pulseSound.ts");
  const css = read("src/components/hallPulse/hallPulse.css");
  check(/setScissorTest\(true\)/.test(scene) && (scene.match(/new THREE\.WebGLRenderer/g) || []).length === 1 && !/WebGLRenderer/.test(interior), "«قبل وبعد» والقاعة من الداخل بالراسم نفسه (مقصّ)، لا سياق WebGL ثانٍ");
  check(/role="slider"/.test(pulse) && /aria-valuenow=/.test(pulse) && /ArrowLeft/.test(pulse) && /ArrowRight/.test(pulse) && /aria-label="فاصل قبل وبعد/.test(pulse), "الفاصل منزلقٌ باسمٍ وقيمة، والأسهم تحرّكه");
  check(/setCompare\(comparing \? beforeVisuals : null/.test(pulse) && /const compare = useMemo\(\(\) => \(plan && day !== "week"/.test(pulse), "الفاصل يظهر مع المراجعة ويزول بزوالها");
  check(!/fetch\(/.test(read("src/utils/hallPulseDay.ts")) && !/fetch\(/.test(interior) && !/fetch\(/.test(sound) && (pulse.match(/method: "POST"/g) || []).length === 1, "لا كتابة جديدة: الطلب الوحيد المرسَل ما زال طلب الاستعارة الموجود");
  check(/InstancedMesh/.test(interior) && /dispose\(\)/.test(interior) && /this\.interior\?\.dispose\(\)/.test(scene), "مقاعد القاعة وطلبتها InstancedMesh، وتُفرَغ عند الخروج");
  check(/e\.key === "Escape"/.test(pulse) && /اخرج/.test(pulse) && /ادخل القاعة/.test(pulse), "«ادخل القاعة» زرٌّ ظاهر، و«اخرج» ومفتاح Escape يعيدان");
  check(/readSoundChoice/.test(pulse) && /getItem\(KEY\) === "1"/.test(sound) && /try \{[^}]*localStorage/.test(sound), "النغمة مطفأةٌ افتراضاً، واختيارها محفوظٌ بحمايةٍ من التصفّح الخاص");
  check(!/new Audio\(|<audio|\.mp3|\.wav|\.ogg/.test(sound + pulse) && /createOscillator/.test(sound), "النغمة مركّبة بـWeb Audio وحده: لا ملف صوت");
  check(/webkitAudioContext/.test(sound) && /catch \{ this\.silence\(\); return false; \}/.test(sound) && /canSound && playbackKind\(\{ mode, flat \}\) === "cinema"/.test(pulse), "وحيث لا AudioContext: لا زرّ ولا خطأ");
  check(/visibilitychange/.test(pulse) && /if \(cine !== "run"\) soundRef\.current\?\.stop\(\)/.test(pulse) && /soundRef\.current\?\.dispose\(\)/.test(pulse), "النغمة تسكت حين يقف العرض أو يُخفى التبويب أو تُغلق الشاشة");
  const starts = pulse.match(/soundRef\.current\.start\(\)/g) || [];
  check(starts.length === 3 && !/useEffect\([^]*?soundRef\.current\.start\(\)[^]*?\}, \[/.test(pulse.slice(pulse.indexOf("const toggleSound"))), "ولا تبدأ إلا من ضغطة المستخدم (تشغيل العرض، أكمل، زرّ النغمة)");
  check(/playbackKind\(\{ mode, flat \}\) === "cinema"\) startCinema\(\); else setPlaying\(true\)/.test(pulse) && /if \(cine !== "off" && playbackKind\(\{ mode, flat \}\) !== "cinema"\) setCine\("off"\)/.test(pulse), "المسطّح لا يدخل العرض، والانتقال إليه أثناءه ينهيه: لا وقوف بلا «أكمل»");
  check(/if \(st\.idx >= st\.steps\.length - 1\) \{ window\.clearInterval\(timer\);[^}]*setCine\("end"\)/.test(pulse) && /st\.steps\[st\.idx\] === st\.stop && arrive\(/.test(pulse), "خطوات تقليل الحركة تنتهي صراحةً، وأشدّ لحظةٍ في أولها يوقف عندها");
  check(/if \(reduced\) \{[\s\S]{0,400}setInterval/.test(pulse) && /if \(!this\.cineFree && !this\.opts\.reduced/.test(scene), "تقليل الحركة: خطواتٌ بدل الانزلاق، ولا حركة كاميرا آلية");
  check(/canSave \? <button[^>]*onClick=\{arrange\}/.test(pulse), "«رتّب قاعاتي» في تعليق أشدّ لحظة لرئيس اللجنة وحده");
  check(/@media \(prefers-reduced-motion:reduce\)\{\s*\.hp-hud,\.hp-caption,\.hp-exit,\.hp-split\{animation:none\}/.test(css), "وحركات الواجهة الجديدة تتوقف مع تقليل الحركة");
}
const reportsRoutes = read("src/server/routes/reportsRoutes.ts");
const barterRoutes = read("src/server/routes/hallBarterRoutes.ts");
const roomLoadRoute = reportsRoutes.slice(reportsRoutes.indexOf('app.get("/api/reports/room-load"'));
check(/wantedRoomIds/.test(roomLoadRoute) && /checkedRoomIds/.test(roomLoadRoute) && /requireAnyPermission\(\[7, 8, 9, 10, 14, 16, 17\]\)/.test(roomLoadRoute), "room-load يقرأ أوقات قاعات السجل المطلوبة (roomIds) بالصلاحية نفسها");
check(/roomIds/.test(pulse) && /requireOccupancyCheck: true/.test(pulse), "الشاشة تطلب إشغال قاعات السجل كلها ولا تعدّ غير المفحوصة فارغة");
check(/roomType:roomTypeIn\(room,sectionId,registry\.roomTypeScopes\)/.test(barterRoutes) && /borrowCandidates\(model, session, ops\)/.test(pulse), "نوع قاعة الاستعارة يُقرأ من اللوحة ويُحكم بحكم اقتراح القسم");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
