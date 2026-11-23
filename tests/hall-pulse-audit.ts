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
  applyPlan, borrowCandidates, buildPulseModel, compatible, doubleBookings, fitClass, floorOf, hallFreeFor, layoutHalls, metrics, originalAssignment,
  planDay, planMoves, suggestHalls, toggleGroup, weeklyHeat, PULSE_DAYS, type PulseDay,
} from "../src/utils/hallPulse";

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
check(/if \(dragBlocked\)/.test(commit) && /canSave=\{canEditSchedule && !dragBlocked\}/.test(schedules), "الحفظ لمن يملك تعديل الجدول (الشاشة 7) وحده");
check(/context="report"/.test(reports) && !/context="report"[\s\S]{0,400}onSaveMoves/.test(reports), "عدسة القاعات: مجسّم للقراءة فقط");
check(/roleId==="dean"\|\|roleId==="viceDean"/.test(dashboard), "لوحة العميدين وحدها تعرض بطاقة الكلية");
check(/context === "workshop"/.test(pulse), "لا حفظ خارج الورشة ولو مُرّر onSaveMoves");
check(/\/api\/hall-barter\/requests/.test(pulse) && /\/api\/hall-barter\?/.test(pulse), "الاستعارة عبر طلب استعارة القاعات الموجود");
check(/تقدير/.test(pulse), "عدد الطلبة موسومٌ بأنه تقدير");
const reportsRoutes = read("src/server/routes/reportsRoutes.ts");
const barterRoutes = read("src/server/routes/hallBarterRoutes.ts");
const roomLoadRoute = reportsRoutes.slice(reportsRoutes.indexOf('app.get("/api/reports/room-load"'));
check(/wantedRoomIds/.test(roomLoadRoute) && /checkedRoomIds/.test(roomLoadRoute) && /requireAnyPermission\(\[7, 8, 9, 10, 14, 16, 17\]\)/.test(roomLoadRoute), "room-load يقرأ أوقات قاعات السجل المطلوبة (roomIds) بالصلاحية نفسها");
check(/roomIds/.test(pulse) && /requireOccupancyCheck: true/.test(pulse), "الشاشة تطلب إشغال قاعات السجل كلها ولا تعدّ غير المفحوصة فارغة");
check(/roomType:roomTypeIn\(room,sectionId,registry\.roomTypeScopes\)/.test(barterRoutes) && /borrowCandidates\(model, session, ops\)/.test(pulse), "نوع قاعة الاستعارة يُقرأ من اللوحة ويُحكم بحكم اقتراح القسم");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
