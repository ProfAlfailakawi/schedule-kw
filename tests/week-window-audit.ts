/**
 * ── نافذة «أسبوع الأستاذ» (R4) ─────────────────────────────────────────────
 * ما أُضيف إلى جدول الأستاذ المصغّر دون أن يُمسّ ما سبق (teacher-mini-week-audit يحرسه):
 *   • تركيزٌ ذكيّ: أيام الموعد أعمدةٌ 2fr والباقي 1fr، وترويستها حبوبٌ ممتلئة.
 *   • رسمُ موعدٍ بالسحب: البداية على شبكة الخمس دقائق، والمدة من اللائحة إن عُرفت، وإلا طول
 *     السحب بحدٍّ أدنى نصف ساعة، داخل المحور؛ والأيام بقاعدةٍ واحدة.
 *   • القاعة المختارة: حجوزها (لا محاضرات الأستاذ ولا الموعد المفتوح) والخانات الذهبية.
 *   • الطيّ التلقائي لا يكتب في التخزين، والنافذة العائمة داخل الشاشة وموضعها يُحفظ.
 */
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  clampFloatRect, compactSpan, drawnPlacement, freeTargets, goldenTargets, inRoom, parseFloatRect, roomBlocks, roomReady, spotCrowds,
  teacherLectures, toClock, weekColumns,
} from "../src/utils/teacherMiniWeek";
import { safeStorage } from "../src/utils/safeStorage";
import TeacherMiniWeek from "../src/components/TeacherMiniWeek";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra)); }
};
const row = (id: number, days: string[], start: string, end: string, extra: any = {}) => ({ id, AdTermId: 1, AdCollegeId: 1, AdSectionId: 1, AdCourseId: 10 + id, SCode: "501", AdInstructorId: 7,
  AdCourseName: `مقرر ${id}`, fsunday: days.includes("fsunday"), fmonday: days.includes("fmonday"), ftuesday: days.includes("ftuesday"), fwednesday: days.includes("fwednesday"), fthursday: days.includes("fthursday"),
  fstarttime: start, fendtime: end, buildingId: "b1", roomId: "r1", AdRoomCode: "F", AdRoomHall: "10", ...extra }) as any;
const range = (spot: { start: number; end: number } | null | undefined) => spot ? `${toClock(spot.start)}–${toClock(spot.end)}` : "—";

const rows = [
  row(1, ["fsunday", "ftuesday", "fthursday"], "08:00", "08:50"),
  row(2, ["fmonday", "fwednesday"], "09:30", "10:50", { AdCollegeId: 2, AdRoomCode: "G", AdRoomHall: "2" }),
];
const day = { start: 8 * 60, end: 20 * 60 };
const lectures = teacherLectures(rows, 7, 1, 0, 1);
const span = compactSpan(day, lectures.map(item => item.end));
const theory3 = { CourseHours: 3, CourseTeachingMode: "theoretical" };
const practical3 = { CourseHours: 3, CourseTeachingMode: "practical" };

/* ── 1. تركيزٌ ذكيّ: أعمدة الأيام ─────────────────────────────────────────── */
{
  check(weekColumns([]) === null && weekColumns([], "fmonday") === null, "F1 بلا أيامٍ للموعد: لا تغيير (أعمدةٌ متساوية كما كانت)");
  check(weekColumns(["fthursday", "fsunday", "ftuesday"]) === "minmax(0,2fr) minmax(0,1fr) minmax(0,2fr) minmax(0,1fr) minmax(0,2fr)",
    "F2 أيام الموعد 2fr والباقي 1fr، بترتيب الأسبوع", weekColumns(["fsunday", "ftuesday", "fthursday"]));
  check(weekColumns(["fsunday", "ftuesday", "fthursday"], "fmonday") === "minmax(0,2fr) minmax(0,2fr) minmax(0,2fr) minmax(0,1fr) minmax(0,2fr)",
    "F3 يومٌ ضيّق تحت المؤشر يتّسع، وأيام الموعد تبقى عريضة");
  check(weekColumns(["fwednesday"], "fwednesday") === "minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,2fr) minmax(0,1fr)", "F4 المرور على يومٍ عريض لا يغيّر شيئاً");
}

/* ── 2. الرسم: الشبكة والمدة والحدود ─────────────────────────────────────── */
{
  check(span.start === 8 * 60 && span.end === 14 * 60, "D0 المحور الذي يُرسم عليه: 08:00–14:00", span);
  const fixed75 = drawnPlacement({}, "fmonday", 8 * 60 + 2, 8 * 60 + 10, { span, minutes: 75 });
  check(range(fixed75) === "08:00–09:15" && fixed75?.minutes === 75 && fixed75.fixed && fixed75.days.join() === "fmonday",
    "D1 مدةٌ معلومة 75د: البداية على الخمس دقائق (08:02 ← 08:00) والنهاية = البداية + 75 (لا طول السحب)", fixed75);
  const sunday = drawnPlacement(theory3, "fsunday", 9 * 60 + 3, 10 * 60, { span });
  check(range(sunday) === "09:05–09:55" && sunday?.fixed && sunday.days.join() === "fsunday,ftuesday,fthursday",
    "D2 نمط اللائحة ليوم الأحد: 50د على أحد·ثلاثاء·خميس، و09:03 ← 09:05", sunday);
  const monday = drawnPlacement(theory3, "fmonday", 10 * 60, 10 * 60 + 5, { span });
  check(range(monday) === "10:00–11:20" && monday?.days.join() === "fmonday,fwednesday", "D3 الاثنين: 80د على اثنين·أربعاء", monday);
  const free = drawnPlacement({}, "ftuesday", 8 * 60 + 2, 9 * 60 + 13, { span });
  check(range(free) === "08:00–09:15" && free?.minutes === 75 && !free.fixed, "D4 بلا مدةٍ في اللائحة: طول السحب على الخمس دقائق (08:02–09:13 ← 08:00–09:15 · 75د)", free);
  const short = drawnPlacement({}, "ftuesday", 10 * 60, 10 * 60 + 11, { span });
  check(range(short) === "10:00–10:30" && short?.minutes === 30, "D5 الحدّ الأدنى للرسم الحرّ نصف ساعة", short);
  const upward = drawnPlacement({}, "ftuesday", 10 * 60, 9 * 60, { span });
  check(range(upward) === "09:00–10:00", "D6 السحب إلى أعلى يرسم من المؤشر إلى نقطة الضغط", upward);
  const pastEnd = drawnPlacement({}, "ftuesday", 13 * 60, 15 * 60, { span });
  check(range(pastEnd) === "13:00–14:00", "D7 السحب خارج المحور يقف عند نهايته", pastEnd);
  const atEnd = drawnPlacement({}, "ftuesday", 13 * 60 + 56, 13 * 60 + 58, { span });
  check(range(atEnd) === "13:30–14:00", "D8 الضغط عند النهاية: نصف ساعةٍ كاملة داخل المحور", atEnd);
  const beforeStart = drawnPlacement({}, "ftuesday", 6 * 60 + 40, 7 * 60 + 50, { span });
  check(range(beforeStart) === "08:00–08:30", "D9 قبل بداية المحور يبدأ من بدايته", beforeStart);
  const lateRule = drawnPlacement(theory3, "fmonday", 13 * 60 + 40, 13 * 60 + 50, { span });
  check(range(lateRule) === "12:40–14:00" && lateRule?.minutes === 80, "D10 مدة اللائحة قرب النهاية: يُزاح الموعد كلّه داخل المحور ولا يُقصّ", lateRule);
  check(drawnPlacement({}, "ftuesday", NaN, 600, { span }) === null && drawnPlacement({}, "ftuesday", 600, 620, { span: { start: 600, end: 620 } }) === null,
    "D11 قيمٌ غير صالحة أو محورٌ أقصر من نصف ساعة: لا رسم");
}

/* ── 3. قاعدة الأيام ─────────────────────────────────────────────────────── */
{
  const draftHas = drawnPlacement(theory3, "fwednesday", 11 * 60 + 40, 11 * 60 + 40, { span, draftDays: ["fwednesday", "fmonday"] });
  check(draftHas?.days.join() === "fmonday,fwednesday" && range(draftHas) === "11:40–13:00", "S1 أيام الموعد الجاري إن ضمّت اليوم (ومدتها من اللائحة)", draftHas);
  const fixedDays = drawnPlacement(theory3, "fmonday", 10 * 60, 10 * 60, { span, draftDays: ["fsunday"], fixedDays: ["fwednesday", "fmonday"] });
  check(fixedDays?.days.join() === "fmonday,fwednesday" && fixedDays.minutes === 80, "S2 وإلا الأيام الثابتة (طلب أستاذ)", fixedDays);
  check(drawnPlacement(theory3, "fsunday", 10 * 60, 10 * 60, { span, fixedDays: ["fmonday", "fwednesday"] }) === null, "S3 يومٌ خارج الأيام الثابتة لا يُرسم عليه (كما لا تُقترح فيه خانة)");
  const pattern = drawnPlacement(theory3, "fthursday", 10 * 60, 10 * 60, { span });
  check(pattern?.days.join() === "fsunday,ftuesday,fthursday" && pattern.minutes === 50, "S4 وإلا أيام النمط المعتمد لساعات المقرر في ذلك اليوم", pattern);
  const lone = drawnPlacement({}, "fthursday", 10 * 60, 11 * 60, { span });
  check(lone?.days.join() === "fthursday", "S5 وإلا اليوم وحده", lone);
  const offPattern = drawnPlacement(theory3, "ftuesday", 10 * 60, 10 * 60 + 40, { span, draftDays: ["fsunday", "ftuesday"] });
  check(offPattern?.days.join() === "fsunday,ftuesday" && offPattern.minutes === 50, "S6 أيامٌ اختارها المستخدم خارج النمط تبقى، بمدة اللائحة لذلك اليوم", offPattern);
  const block = drawnPlacement(theory3, "fwednesday", 8 * 60, 8 * 60, { span, draftDays: ["fwednesday"] });
  check(block?.days.join() === "fwednesday" && block.minutes === 170, "S7 كتلة اليوم الواحد في الموعد الجاري: مدتها هي (170د)", block);
  const lab = drawnPlacement(practical3, "fwednesday", 8 * 60, 8 * 60, { span });
  check(lab?.days.join() === "fwednesday" && lab.minutes === 170, "S8 مقررٌ عملي: نمطه الأنسب كتلةٌ واحدة", lab);
  check(spotCrowds({ days: ["fsunday", "ftuesday", "fthursday"], start: 8 * 60 + 30, end: 9 * 60 + 20 }, lectures)
    && !spotCrowds({ days: ["fsunday", "ftuesday", "fthursday"], start: 9 * 60, end: 9 * 60 + 50 }, lectures), "S9 المعاينة تعرف تعارض الأستاذ (بالفاصل المقرَّر)");
}

/* ── 4. القاعة: الحجوز والخانات الذهبية ────────────────────────────────────── */
{
  const room = { code: "F", hall: "10" };
  check(roomReady(room) && !roomReady({ code: "F", hall: " " }) && !roomReady(null), "R1 وضع القاعة يعمل حين يُعرف الرمز والرقم معاً");
  check(inRoom(row(9, ["fsunday"], "10:00", "10:50", { AdRoomCode: " f ", AdRoomHall: "10" }), room) && !inRoom(row(9, ["fsunday"], "10:00", "10:50", { AdRoomHall: "11" }), room),
    "R2 مطابقة القاعة بالرمز والرقم (دون حساسية حالة الأحرف والمسافات)");
  const roomRows = [
    row(1, ["fsunday", "ftuesday", "fthursday"], "08:00", "08:50"),
    row(31, ["fsunday", "ftuesday", "fthursday"], "10:00", "10:50", { AdInstructorId: 55 }),
    row(32, ["ftuesday"], "12:00", "12:50", { AdInstructorId: 56 }),
    row(33, ["fsunday"], "13:00", "13:50", { AdInstructorId: 57 }),
    row(34, ["fsunday"], "11:00", "11:50", { AdInstructorId: 58, AdTermId: 2 }),
    row(31, ["fsunday", "ftuesday", "fthursday"], "10:00", "10:50", { AdInstructorId: 55 }),
  ];
  const busy = roomBlocks(roomRows, { teacherId: 7, termId: 1, excludeId: 33 });
  check(busy.length === 4 && busy.every(item => Number(item.row.AdInstructorId) !== 7 && item.id !== 33 && Number(item.row.AdTermId) === 1),
    "R3 حجوز القاعة يوماً يوماً: لا محاضرات الأستاذ، ولا الموعد المفتوح، ولا فصلٌ آخر، والمكرّر مرة", busy.map(item => `${item.id}:${item.day}`));
  const targets = freeTargets(theory3, lectures, span);
  const golden = goldenTargets(targets, roomRows, { teacherId: 7, termId: 1, excludeId: 33 });
  const sunday = Object.fromEntries(golden.filter(target => target.day === "fsunday").map(target => [toClock(target.start), target.golden]));
  check(golden.length === targets.length && sunday["09:00"] === true && sunday["10:00"] === false && sunday["11:00"] === true && sunday["12:00"] === false && sunday["13:00"] === true,
    "R4 الأحد: 09:00 و11:00 ذهبيتان (الفاصل 10د بالضبط)، 10:00 تتداخل، 12:00 محجوزةٌ الثلاثاء من أيام النمط، 13:00 للموعد المفتوح نفسه", sunday);
  check(golden.filter(target => target.day === "fmonday").every(target => target.golden), "R5 اثنين·أربعاء لا حجز فيهما: كلها ذهبية");
  check(goldenTargets(targets, [], { teacherId: 7 }).every(target => target.golden), "R6 قاعةٌ خالية: كل خانةٍ حرّة للأستاذ ذهبية");
}

/* ── 5. النافذة العائمة داخل الشاشة ─────────────────────────────────────────── */
{
  const screen = { width: 1280, height: 800 };
  const inside = clampFloatRect({ x: -50, y: -20, w: 500, h: 600 }, screen);
  check(inside.x === 8 && inside.y === 8 && inside.w === 500 && inside.h === 600, "P1 لا تخرج من أعلى الشاشة ويمينها", inside);
  const corner = clampFloatRect({ x: 1200, y: 700, w: 500, h: 600 }, screen);
  check(corner.x === 772 && corner.y === 192, "P2 ولا من أسفلها ويسارها", corner);
  const folded = clampFloatRect({ x: 100, y: 780, w: 500, h: 600 }, screen, 76);
  check(folded.y === 716 && folded.h === 600, "P3 المطويّة تُحصر بترويستها، ويبقى ارتفاعها المحفوظ", folded);
  const tiny = clampFloatRect({ x: 10, y: 10, w: 100, h: 50 }, screen), huge = clampFloatRect({ x: 0, y: 0, w: 3000, h: 3000 }, screen);
  check(tiny.w === 320 && tiny.h === 180 && huge.w === 1264 && huge.h === 784, "P4 لا تصغر عن حدٍّ يُقرأ ولا تكبر عن الشاشة", { tiny, huge });
  check(JSON.stringify(parseFloatRect({ x: 1, y: 2, w: 300, h: 400 })) === JSON.stringify({ x: 1, y: 2, w: 300, h: 400 })
    && parseFloatRect(null) === null && parseFloatRect({ x: "a", y: 1, w: 1, h: 1 }) === null && parseFloatRect({ x: 1, y: 1, w: 0, h: 5 }) === null,
    "P5 ما حُفظ يُقرأ أرقاماً صالحة، وإلا تعود النافذة إلى مكانها");
}

/* ── 6. ما يُرسم فعلاً (بلا متصفح) ─────────────────────────────────────────── */
{
  const courses = new Map([[11, { AdCourseId: 11, CourseHours: 3, CourseName: "مقرر 1" }], [12, { AdCourseId: 12, CourseHours: 3, CourseName: "مقرر 2" }], [20, { AdCourseId: 20, CourseHours: 3, CourseName: "مقرر جديد" }]] as any);
  const draft = { AdCourseId: 20, fsunday: true, ftuesday: true, fthursday: true, fstarttime: "11:00", fendtime: "11:50" };
  const base = {
    teacherId: 7, teacherName: "د. سالم", nisab: 18, rows, termId: 1, collegeId: 1, draft, verdict: { state: "ready" as const, blockers: [] },
    course: theory3 as any, courses, window: day, userId: 5, onPick: () => undefined,
  };
  const writes: string[] = [];
  const realSet = safeStorage.set, realRemove = safeStorage.remove;
  safeStorage.set("teacher-mini-week:side:5", "open");
  safeStorage.set = ((key: string, value: string) => { writes.push(`${key}=${value}`); }) as typeof safeStorage.set;
  safeStorage.remove = ((key: string) => { writes.push(`-${key}`); }) as typeof safeStorage.remove;
  const render = (props: Record<string, unknown> = {}) => renderToStaticMarkup(React.createElement(TeacherMiniWeek, { ...base, ...props } as any));
  try {
    const opened = render();
    check(/aria-expanded="true"/.test(opened) && /mini-week-body/.test(opened), "V1 بلا طيٍّ تلقائي: مفتوحةٌ كما حُفظت");
    check(/class="mini-week is-side[^"]*is-focus/.test(opened) && opened.includes("--mw-cols:minmax(0,2fr) minmax(0,1fr) minmax(0,2fr) minmax(0,1fr) minmax(0,2fr)"),
      "V2 أعمدة أيام الموعد أعرض في الترويسة والشبكة معاً (متغيّرٌ واحد)");
    check((opened.match(/<span class="is-draft">/g) || []).length === 3 && (opened.match(/mini-week-track is-draft/g) || []).length === 3, "V3 ترويسات أيام الموعد حبوبٌ ممتلئة (is-draft) ومساراتها مُبرزة");
    check(/mini-week-target-time" dir="ltr">09:00</.test(opened), "V4 خانة «+» تحمل وقت بدايتها");
    check(opened.includes("لا يُحفظ شيء") && opened.includes("mini-week-hint") && !opened.includes("اسحب على فراغ"), "V5 تلميحٌ بأسفل النافذة؛ ولا جملة رسمٍ حيث لا مؤشر دقيق");
    const plain = render({ draft: { AdCourseId: 20 } });
    check(!/is-focus/.test(plain) && !plain.includes("--mw-cols") && !/class="is-draft"/.test(plain), "V6 بلا أيامٍ للموعد: لا تغيير في الأعمدة");
    const folded = render({ autoCollapse: true });
    check(/aria-expanded="false"/.test(folded) && !/mini-week-body/.test(folded) && /mini-week-head/.test(folded), "V7 الطيّ التلقائي: الترويسة وحدها");
    const blocked = render({ verdict: { state: "blocked", blockers: [{ text: "تعارض" }] } });
    check(/mini-week-ghost is-blocked[^"]*has-pill/.test(blocked) && blocked.includes("موعدك"), "V8 الشبح المتعارض: حبّة «موعدك» في أسفله");
    const docked = render({ dockable: true });
    check(/is-dockable/.test(docked) && /mini-week-notch/.test(docked) && !/is-floating/.test(docked), "V9 قابلةٌ للطفو وملتصقة: سنٌّ نحو النموذج");
    check(!/mini-week-notch/.test(render()) && !/mini-week-notch/.test(render({ dockable: true, variant: "compact" })), "V10 لا سنّ لغير القابلة للطفو ولا للبطاقة المضغوطة");
    const roomRows = [...rows, row(31, ["fsunday", "ftuesday", "fthursday"], "10:00", "10:50", { AdInstructorId: 55, AdCourseName: "مقرر آخر" })];
    const withRoom = render({ rows: roomRows, room: { code: "F", hall: "10" } });
    check(/class="mini-week-room/.test(withRoom) && withRoom.includes("القاعة محجوزة") && /title="مقرر آخر · 501/.test(withRoom), "V11 حجوز القاعة مخطّطة «القاعة محجوزة»، وتلميحها المقرر والشعبة والوقت");
    check(/mini-week-target is-golden/.test(withRoom) && /mini-week-target is-room-busy/.test(withRoom) && withRoom.includes(" · والقاعة خالية") && /mini-week-target-star/.test(withRoom),
      "V12 الخانة الحرّة للاثنين ذهبيةٌ بنجمة «والقاعة خالية»، والمحجوزة في القاعة باهتة");
    check(/mini-week-legend/.test(withRoom) && withRoom.includes("محاضرات الأستاذ") && withRoom.includes("تناسب الاثنين") && /<bdi dir="ltr">F\/10<\/bdi>/.test(withRoom),
      "V13 مفتاح الألوان ورمز القاعة (من اليسار إلى اليمين)");
    const noRoom = render({ rows: roomRows });
    check(!/mini-week-room/.test(noRoom) && !/is-golden|is-room-busy|mini-week-legend/.test(noRoom), "V14 بلا قاعة: لا شيء من وضع القاعة");
    check(writes.length === 0, "V15 العرض — والطيّ التلقائي خاصة — لا يكتب في التخزين شيئاً", writes);
  } finally {
    safeStorage.set = realSet;
    safeStorage.remove = realRemove;
  }
}

/* ── 7. الربط في المكوّن والأنماط ───────────────────────────────────────────── */
{
  const component = fs.readFileSync("src/components/TeacherMiniWeek.tsx", "utf8");
  const css = fs.readFileSync("src/styles/41-week-window.css", "utf8");
  const autoBlock = component.slice(component.indexOf("const [auto, setAuto]"), component.indexOf("const setOpen = (next: boolean)"));
  check(autoBlock.length > 80 && !/safeStorage/.test(autoBlock) && /override = autoCollapse \? false : auto\.override/.test(autoBlock) && /const open = autoCollapse \? override : stayOpen/.test(autoBlock),
    "C1 الطيّ التلقائي حالةٌ محلية لا تُكتب، وتجاوزه يعود حين يبدأ طيٌّ تلقائيٌّ جديد");
  check(/\/api\/schedules\?termId=\$\{termId\}&building=\$\{encodeURIComponent\(code\)\}&hall=\$\{encodeURIComponent\(hall\)\}/.test(component) && /roomCache\.set\(key, list\)/.test(component) && /controller\.abort\(\)/.test(component),
    "C2 حجوز القاعة بالمسار القائم، بذاكرةٍ لكل فصلٍ وقاعة وإلغاءٍ عند التغيّر");
  check(/createPortal\(card, document\.body\)/.test(component) && /teacher-mini-week:float:\$\{userId\}/.test(component) && /safeStorage\.remove\(floatKey\)/.test(component)
    && /Math\.hypot\(dx, dy\) <= 6/.test(component) && /onDoubleClick/.test(component) && /swallowClick\.current = true;[\s\S]{0,240}if \(state\.last\) \{ setFloatRect\(state\.last\); saveFloat\(state\.last\); \}/.test(component),
    "C3 الطفو: أكثر من 6px تفصلها إلى جسم الصفحة، وموضعها يُحفظ، ونقرتان تعيدانها، والنقر بلا سحبٍ يطوي كما كان");
  check(/event\.pointerType !== "mouse" && event\.pointerType !== "pen"/.test(component) && /useMedia\("\(hover: hover\) and \(pointer: fine\)", !sheet\) && !sheet/.test(component)
    && /if \(drawing\.current\) \{\s*event\.preventDefault\(\);\s*event\.stopImmediatePropagation\(\);\s*cancelDraw\(\);/.test(component),
    "C4 الرسم بالفأرة أو القلم وحدهما ولا يكون في الشريط السفلي، وEsc يلغيه");
  check(/\.mini-week-chip, \.mini-week-stick, \.mini-week-ghost, \.mini-week-draw/.test(component) && /const fromTarget = Boolean\(\(event\.target as Element\)\.closest\?\.\("\.mini-week-target"\)\)/.test(component)
    && /if \(!state\.active && state\.fromTarget\) event\.currentTarget\.setPointerCapture/.test(component),
    "C5 الرسم من الفراغ أو بسحبٍ من خانة «+» (ضغطتها تبقى «خذها»)، ولا يبدأ من محاضرةٍ ولا «قبلها/بعدها» ولا الشبح");
  check(css.length > 3000 && !/#[0-9a-fA-F]{3,8}\b/.test(css) && /prefers-reduced-motion:reduce/.test(css), "C6 ألوانٌ من رموز التصميم وحدها، وتهدأ الحركة لمن طلب ذلك");
  check(/\.mini-week\.is-focus \.mini-week-grid\{grid-template-columns:var\(--mw-cols\)\}/.test(css) && /\.mini-week\.is-focus \.mini-week-days\{grid-template-columns:var\(--mw-axis\) var\(--mw-cols\)\}/.test(css)
    && /\.mini-week-days>span\.is-draft\{background:var\(--accent\);color:var\(--accent-contrast\)/.test(css), "C7 الأعمدة والحبوب الممتلئة في الأنماط");
  check(/\.mini-week\.can-draw \.mini-week-track\{cursor:crosshair\}/.test(css) && /\.mini-week\.is-floating\.is-open\{resize:both/.test(css) && /\.mini-week\.is-floating\{position:fixed/.test(css),
    "C8 الفراغ يُرسم عليه (مؤشرٌ متقاطع)، والعائمة ثابتةٌ وتُكبَّر من الزاوية");
  check(/\.mini-week-notch\{position:absolute;top:28px;inset-inline-start:-8px;[^}]*width:14px;height:14px;[^}]*rotate\(45deg\)/.test(css), "C9 السنّ: مربعٌ 14px مائل على الحافّة المقابلة للنموذج");
  check(/--mw-gold:color-mix\(in srgb,var\(--brass\)/.test(css) && /\.mini-week-room\{[^}]*repeating-linear-gradient/.test(css), "C10 الذهبيّ من النحاسيّ، وحجوز القاعة مخطّطة");
  check(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(component), "C11 أيقونات lucide بلا رموز تعبيرية");
}

console.log(`\nweek-window audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
