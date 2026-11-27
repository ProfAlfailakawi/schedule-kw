/**
 * ── أنهار الطلبة (FR-SCH-103): التجميع، والتقدير، والانتفاخ، وأزحم معبر ─────────
 *
 * يحرس src/utils/studentRivers: أن الانتقال بين محاضرتين يصير نهراً حين يعبر بين مبنيين (أو
 * طابقين) وتبدأ التالية خلال النافذة، وأن الانتقالات المتقاربة للزوج نفسه من المباني تُجمع ولا
 * تُجمع المتباعدة، وأن السماكة تقديرٌ بالأصغر من سعتي الشعبتين، وأن النهر ينتفخ قبل التبدّل
 * ويخبو بعده، وأن أزحم معبر هو الأعرض (والجاري الآن مع الساعة)، وأن الأنهار تتبع نقلات
 * «ماذا لو» المعاينة. ثم التوصيل: من يراها، وتقليل الحركة، والمسطّح، ولا كتابة.
 */
import fs from "fs";
import path from "path";
import { buildPulseModel, layoutHalls, originalAssignment } from "../src/utils/hallPulse";
import {
  RIVER_CLUSTER_MIN, RIVER_GAP_MAX_MIN, SWELL_LEAD_MIN, SWELL_PLATEAU_MAX_MIN, SWELL_TAIL_MIN,
  buildRivers, busiestCrossing, busiestRivers, clampTagBox, moversEstimate, riverLabel, riverLoad, riverSwell, riverWidth, riversAllowed,
} from "../src/utils/studentRivers";
import { applyWhatIf, pushWhatIf } from "../src/utils/pulseWhatIf";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const registry = {
  buildings: [
    { id: "b1", officialCode: "901A01", buildingNumber: "1" },
    { id: "b3", officialCode: "901A03", buildingNumber: "3" },
  ],
  rooms: [
    { id: "r101", buildingId: "b1", canonicalCode: "101", capacity: 60 },
    { id: "r102", buildingId: "b1", canonicalCode: "102", capacity: 60 },
    { id: "r201", buildingId: "b1", canonicalCode: "201", capacity: 60 },
    { id: "r301", buildingId: "b3", canonicalCode: "301", capacity: 60 },
    { id: "r302", buildingId: "b3", canonicalCode: "302", capacity: 60 },
  ],
};
/* سعة المقرر لكل شعبة: 1 → 40، 2 → 30، 3 → 50، 4 → 35، 5 و6 بلا سعة. */
const courses = [
  { AdCourseId: 1, CourseName: "مقرر 1", MaxStudent: 40 },
  { AdCourseId: 2, CourseName: "مقرر 2", MaxStudent: 30 },
  { AdCourseId: 3, CourseName: "مقرر 3", MaxStudent: 50 },
  { AdCourseId: 4, CourseName: "مقرر 4", MaxStudent: 35 },
  { AdCourseId: 5, CourseName: "مقرر 5" },
  { AdCourseId: 6, CourseName: "مقرر 6" },
];
let next = 1;
const row = (course: number, teacher: number, room: string, start: string, end: string, scode: string) =>
  ({ id: next++, AdSectionId: 9, AdCourseId: course, AdInstructorId: teacher, SCode: scode, fstarttime: start, fendtime: end, roomId: room, fsunday: true });
const rows = [
  /* ش 01: مقرر 1 في مبنى 1 حتى 09:50، ثم مقرر 2 في مبنى 3 من 10:00 — نهرٌ بين المبنيين (min(40,30) = 30). */
  row(1, 7, "r101", "09:00", "09:50", "01"),
  row(2, 8, "r301", "10:00", "10:50", "01"),
  /* ش 02: مقرر 3 في مبنى 1 حتى 09:45، ثم مقرر 4 في مبنى 3 من 09:55 — يُجمع مع ش 01 (min(50,35) = 35). */
  row(3, 9, "r102", "08:45", "09:45", "02"),
  row(4, 10, "r302", "09:55", "10:45", "02"),
  /* ش 03: مقرر 1 في 101 ثم مقرر 3 في 201 (طابقٌ آخر في المبنى نفسه) — نهرٌ بين طابقين. */
  row(1, 11, "r101", "11:00", "11:50", "03"),
  row(3, 12, "r201", "12:00", "12:50", "03"),
  /* ش 04: مقرر 2 في 301 ثم مقرر 4 في 101 بعد ساعة كاملة — خارج النافذة، لا نهر. */
  row(2, 13, "r301", "11:00", "11:50", "04"),
  row(4, 14, "r101", "12:50", "13:40", "04"),
  /* ش 05: مقرر 5 ثم 6 (كلاهما بلا سعة) من 302 إلى 102 — نهرٌ بلا تقدير (unknown). */
  row(5, 15, "r302", "14:00", "14:50", "05"),
  row(6, 16, "r102", "15:00", "15:50", "05"),
  /* الأستاذ 7 أيضاً: من 101 (09:50) إلى 302 الساعة 10:05 — خيط أستاذ. */
  row(4, 7, "r302", "10:05", "10:55", "09"),
];
const roomLoad = { checkedRoomIds: registry.rooms.map(r => r.id), rooms: [] };
const model = buildPulseModel({ rows, courses, registry, roomLoad, includeUnusedRegistryHalls: true, requireOccupancyCheck: true });
const layout = layoutHalls(model.halls);
const base = originalAssignment(model);
const cohorts = [{ key: "L1", label: "دفعة", courseIds: new Set([1, 2, 3, 4, 5, 6]) }];
const rivers = buildRivers(model, base, layout, "fsunday", { cohorts, teachers: true });
const students = rivers.filter(r => r.who === "students");

/* ── التقدير ── */
check(moversEstimate(40, 30) === 30 && moversEstimate(null, 25) === 25 && moversEstimate(0, 0) === 0, "المنتقلون: الأصغر من سعتي الشعبتين، وإلا المعروفة، وإلا لا شيء");

/* ── التجميع ── */
const b13 = students.filter(r => r.kind === "building" && r.fromLabel === "مبنى 1" && r.toLabel === "مبنى 3");
check(b13.length === 1, "ش 01 وش 02 تعبران من مبنى 1 إلى مبنى 3 في الوقت نفسه تقريباً: نهرٌ واحد");
check(b13[0]?.students === 65 && b13[0]?.cohorts === 2, `سماكته مجموع التقديرين: 30 + 35 = 65 (${b13[0]?.students})`);
check(b13[0]?.at === 9 * 60 + 45 && b13[0]?.until === 10 * 60, "يبدأ عند أول نهاية (09:45) ويمتد إلى آخر بدء (10:00)");
check(b13[0]?.fromKeys.length === 2 && b13[0]?.toKeys.length === 2, "ويحفظ القاعات التي يخرج منها ويصبّ فيها");
const floorRiver = students.find(r => r.kind === "floor");
check(Boolean(floorRiver) && floorRiver!.fromFloor === 1 && floorRiver!.toFloor === 2 && floorRiver!.students === 40, "من 101 إلى 201 في المبنى نفسه: نهرٌ بين طابقين (min(40,50) = 40)");
check(!students.some(r => r.fromLabel === "مبنى 3" && r.toLabel === "مبنى 1" && r.at === 11 * 60 + 50), `فجوة ساعة كاملة (> ${RIVER_GAP_MAX_MIN} دقيقة): لا نهر`);
const unknown = students.find(r => r.at === 14 * 60 + 50);
check(Boolean(unknown) && unknown!.students === 0 && unknown!.unknown === 1, "مقررٌ بلا سعة: النهر يُرسم ولا يُدّعى له عدد");
const teacher = rivers.find(r => r.who === "teachers" && r.kind === "building");
check(Boolean(teacher) && teacher!.teachers >= 1 && teacher!.students === 0, "خيط الأستاذ منفصل، بلا عدد طلبة");
check(buildRivers(model, base, layout, "fsunday", { cohorts }).every(r => r.who === "students"), "وبلا خيوط الأساتذة إن لم تُطلب");
{
  /* انتقالان للزوج نفسه بينهما أكثر من نافذة التجميع: نهران. */
  let k = 900;
  const r2 = [
    { id: k++, AdSectionId: 9, AdCourseId: 1, AdInstructorId: 1, SCode: "01", fstarttime: "08:00", fendtime: "08:50", roomId: "r101", fsunday: true },
    { id: k++, AdSectionId: 9, AdCourseId: 2, AdInstructorId: 2, SCode: "01", fstarttime: "09:00", fendtime: "09:50", roomId: "r301", fsunday: true },
    { id: k++, AdSectionId: 9, AdCourseId: 3, AdInstructorId: 3, SCode: "02", fstarttime: "09:30", fendtime: "10:20", roomId: "r102", fsunday: true },
    { id: k++, AdSectionId: 9, AdCourseId: 4, AdInstructorId: 4, SCode: "02", fstarttime: "10:30", fendtime: "11:20", roomId: "r302", fsunday: true },
  ];
  const m2 = buildPulseModel({ rows: r2, courses, registry, roomLoad, includeUnusedRegistryHalls: true, requireOccupancyCheck: true });
  const rv = buildRivers(m2, originalAssignment(m2), layoutHalls(m2.halls), "fsunday", { cohorts });
  check(rv.filter(r => r.kind === "building").length === 2, `نهايتان بينهما 90 دقيقة (> ${RIVER_CLUSTER_MIN}): نهران لا نهر`);
}

/* ── الانتفاخ ── */
const r = { at: 600, until: 610 };
check(riverSwell(r, 600 - SWELL_LEAD_MIN - 1) === 0 && riverSwell(r, 610 + SWELL_TAIL_MIN + 1) === 0, "خارج نافذة التبدّل: صفر (أثرٌ خافت فقط)");
check(riverSwell(r, 600 - SWELL_LEAD_MIN / 2) > 0 && riverSwell(r, 600 - SWELL_LEAD_MIN / 2) < 1, "يعلو قبل التبدّل");
check(riverSwell(r, 600) === 1 && riverSwell(r, 605) === 1 && riverSwell(r, 610) === 1, "في أشدّه من نهاية المحاضرة إلى بدء التالية");
check(riverSwell(r, 612) > 0 && riverSwell(r, 612) < 1, "ثم يخبو");
check(riverSwell({ at: 600, until: 630 }, 600 + SWELL_PLATEAU_MAX_MIN + SWELL_TAIL_MIN + 0.5) === 0, `فجوةٌ طويلة لا تُبقيه منتفخاً أكثر من ${SWELL_PLATEAU_MAX_MIN} دقيقة`);
const total = (SWELL_LEAD_MIN + 10 + SWELL_TAIL_MIN);
check(total >= 10 && total <= 20, `تبدّلٌ من عشر دقائق ينتفخ نحو ربع ساعة (${total} دقيقة)`);

/* ── الحمل والسماكة ── */
check(riverLoad(0) === 0 && riverLoad(60) > 0 && riverLoad(60) < 1 && riverLoad(1000) === 1, "الحمل من الهادئ إلى المزدحم، محصوراً في 0–1");
check(riverWidth({ who: "students", kind: "building", students: 120 }) > riverWidth({ who: "students", kind: "building", students: 30 }), "الأكثر طلبةً أعرض");
check(riverWidth({ who: "students", kind: "floor", students: 120 }) < riverWidth({ who: "students", kind: "building", students: 120 }), "نهر الطوابق أدقّ (يُعرض خافتاً)");
check(riverWidth({ who: "teachers", kind: "building", students: 0 }) < riverWidth({ who: "students", kind: "building", students: 1 }), "خيط الأستاذ أدقّ من أي نهر طلبة");

/* ── أزحم معبر ── */
const top = busiestCrossing(rivers);
check(top?.river.id === b13[0]?.id && !top?.live, "أزحم معبرٍ في اليوم: مبنى 1 ← مبنى 3");
check(busiestCrossing(rivers, 11 * 60 + 52)?.river.kind === "building", "أزحم معبرٍ بين المباني قبل الطوابق ولو جرى نهر طوابق الآن");
check(busiestCrossing(rivers, 9 * 60 + 47)?.live === true, "ومع الساعة عند التبدّل: المعبر الجاري الآن");
const label = riverLabel(b13[0]);
check(label === "نحو 65 طالباً · مبنى 1 ← مبنى 3 · 09:45", `اللافتة: «${label}»`);
check(!/[٠-٩]/.test(label), "أرقامٌ لاتينية في اللافتة");
check(busiestRivers(rivers)[0]?.id === b13[0]?.id && busiestRivers(rivers).every(x => x.students > 0 && x.who === "students"), "«أزحم الممرات اليوم»: الأعرض أولاً، بلا خيوط الأساتذة ولا ما لا عدد له");

/* ── «ماذا لو»: الأنهار تتبع المعاينة ── */
{
  const s301 = model.sessions.find(s => s.hallKey === "id:r301" && s.start === 600)!;
  const pushed = pushWhatIf(model, base, [], s301.id, "id:r201");
  const after = applyWhatIf(base, pushed.stack);
  const rv = buildRivers(model, after, layout, "fsunday", { cohorts });
  const b13After = rv.find(x => x.kind === "building" && x.fromLabel === "مبنى 1" && x.toLabel === "مبنى 3" && x.at < 600);
  check(pushed.accepted && b13After?.students === 35, `نقل شعبة 301 إلى 201 معاينةً: نهر مبنى 1 ← مبنى 3 يرقّ إلى 35 (${b13After?.students})`);
  check(rv.some(x => x.kind === "floor" && x.at === 590), "ويظهر بدلها نهرٌ بين طابقين في مبنى 1");
  check(buildRivers(model, base, layout, "fsunday", { cohorts }).find(x => x.id === b13[0].id)?.students === 65, "والجدول الأصلي لم يتغيّر: المعاينة نسخة");
}

/* ── من يرى ── */
check(riversAllowed("workshop") && riversAllowed("dean") && !riversAllowed("report") && !riversAllowed(undefined), "الورشة ولوحة العميد وحدهما، لا عدسة التقارير");

/* ── التوصيل ── */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const pulse = read("src/components/hallPulse/HallPulse.tsx");
const scene = read("src/components/hallPulse/pulseScene.ts");
const util = read("src/utils/studentRivers.ts");
check(/riversAllowed\(context\)/.test(pulse) && /buildRivers\(model, assignment, layout, viewDay/.test(pulse), "الأنهار من الإسناد الحيّ (يشمل نقلات «ماذا لو»)، وبوابة المسارات نفسها");
check(/أنهار الطلبة/.test(pulse) && /أزحم الممرات اليوم/.test(pulse) && /تقدير/.test(pulse), "زرّ «أنهار الطلبة»، وقائمة «أزحم الممرات اليوم»، والسماكة موسومةٌ «تقدير»");
check(/setRivers\(/.test(scene) && /setRiverClock\(/.test(scene) && /clearRivers\(\)/.test(scene), "المشهد يرسم الأنهار ويمحوها ويُفرغ موارده");
check(/if \(!this\.opts\.reduced && !teacher[\s\S]{0,900}new THREE\.Points/.test(scene) && /const flow = reduced \? 0\.35/.test(scene), "تقليل الحركة: أنهارٌ ساكنة بلا جسيمات ولا ضوءٍ جارٍ");
check(/tickRivers\(dt, now\)/.test(scene) && /this\.clearRivers\(\);\s*this\.riverTag\?\.remove\(\)/.test(scene), "الأنهار في حلقة الرسم، وتُفرغ مع المشهد");
check(/if \(!reduced && core\.uOpacity\.value > 0\.004\) moving = true;/.test(scene) && !/else if \(!reduced && e > 0\.02\) moving = true/.test(scene), "الضوء الجاري على الأثر الخافت لا يتجمّد: الحلقة تبقى ما دام نهرٌ مرئياً، وتنام مع تقليل الحركة");
check(/if \(!this\.rivers\.length\) return false;/.test(scene), "بلا أنهارٍ مرئية لا يُبقي النهر الحلقة مستيقظة");
check(/clampTagBox\(\{/.test(scene) && /\.hp-view-tools, \.hp-hud, \.hp-whatif/.test(scene), "لافتة المعبر محصورةٌ داخل المسرح وتتجنّب أزرار التقريب وشريط العرض و«ماذا لو»");

/* ── حصر اللافتة داخل المسرح ── */
{
  const W = 660, H = 520, w = 300, h = 28;
  const inside = (b: { left: number; top: number }, m = 10) => b.left >= m && b.top >= m && b.left + w <= W - m && b.top + h <= H - m;
  const right = clampTagBox({ x: 640, y: 200, w, h, W, H });
  check(inside(right) && right.left === W - 10 - w, `قمة القوس عند الحافة اليمنى: اللافتة تُسحب إلى الداخل (${right.left})`);
  const left = clampTagBox({ x: 5, y: 200, w, h, W, H });
  check(inside(left) && left.left === 10, "وعند الحافة اليسرى كذلك");
  const top = clampTagBox({ x: 330, y: 4, w, h, W, H });
  check(inside(top) && top.top === 10, "وفوق المسرح: تنزل إلى الهامش");
  const mid = clampTagBox({ x: 330, y: 300, w, h, W, H });
  check(mid.left === 180 && mid.top === 272, "وفي الوسط: في منتصف القمة وفوقها تماماً");
  const tools = { left: W - 52, top: 12, width: 40, height: 140 };
  const avoid = clampTagBox({ x: 600, y: 90, w, h, W, H, avoid: [tools] });
  const overlap = avoid.left < tools.left + tools.width && avoid.left + w > tools.left && avoid.top < tools.top + tools.height && avoid.top + h > tools.top;
  check(inside(avoid) && !overlap, `لا تختفي تحت أزرار التقريب (${avoid.left},${avoid.top})`);
  const hud = { left: 150, top: 10, width: 360, height: 70 };
  const underHud = clampTagBox({ x: 330, y: 40, w, h, W, H, avoid: [hud] });
  check(underHud.top >= hud.top + hud.height && inside(underHud), "وتنزل تحت شريط العرض أو «ماذا لو»");
  for (const [sw, sh] of [[669, 867], [951, 585], [382, 580]]) {
    const b = clampTagBox({ x: sw - 4, y: 3, w: Math.min(w, sw - 40), h, W: sw, H: sh });
    check(b.left >= 10 && b.left + Math.min(w, sw - 40) <= sw - 10 && b.top >= 10, `داخل المسرح على ${sw}×${sh}`);
  }
}
check(!/fetch\(|method: "POST"|Repository/.test(util), "المنطق نقيّ: لا جلب ولا كتابة");
check(!/civil|CivilId|nationalId|الرقم المدني/i.test(util), "لا هويات طلبة ولا أرقام مدنية");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
