/**
 * ── جدول الأستاذ المصغّر (N3) ───────────────────────────────────────────────
 * قراءةٌ لصفوفٍ محمّلة: المحاضرات بالأيام، والمحور المضغوط، والخانات الحرّة بنمط المقرر
 * وبالفاصل المقرَّر، و«قبلها/بعدها» ملاصقاً (وقاعتها إن خلت، وإلا مبناها)، والنصاب الآن/بعد
 * (والتعديل لا يُحسب إضافة) — ثم الربط في المحرر الكامل والموعد السريع والأنماط.
 */
import fs from "node:fs";
import { adjacentPlacement, adjacentRoom, compactSpan, freeTargets, teacherHeader, teacherLectures, teacherRows, toClock } from "../src/utils/teacherMiniWeek";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra)); }
};
const row = (id: number, days: string[], start: string, end: string, extra: any = {}) => ({ id, AdTermId: 1, AdCollegeId: 1, AdSectionId: 1, AdCourseId: 10 + id, SCode: "501", AdInstructorId: 7,
  fsunday: days.includes("fsunday"), fmonday: days.includes("fmonday"), ftuesday: days.includes("ftuesday"), fwednesday: days.includes("fwednesday"), fthursday: days.includes("fthursday"),
  fstarttime: start, fendtime: end, buildingId: "b1", roomId: "r1", AdRoomCode: "F", AdRoomHall: "10", ...extra }) as any;
const rows = [
  row(1, ["fsunday", "ftuesday", "fthursday"], "08:00", "08:50"),
  row(2, ["fmonday", "fwednesday"], "09:30", "10:50", { AdCollegeId: 2 }),
  row(3, ["fsunday"], "12:00", "12:50", { AdInstructorId: 99 }),
  row(4, ["fthursday"], "14:00", "14:50", { AdTermId: 2 }),
  row(1, ["fsunday", "ftuesday", "fthursday"], "08:00", "08:50"),
];
const day = { start: 8 * 60, end: 20 * 60 };
const lectures = teacherLectures(rows, 7, 1, 0, 1);
check(lectures.length === 5 && lectures.every(item => Number(item.row.AdInstructorId) === 7 && Number(item.row.AdTermId) === 1), "N1 محاضرات الأستاذ في الفصل وحده، يوماً يوماً، والصفّ المكرّر مرة واحدة", lectures.length);
check(lectures.filter(item => item.otherCollege).length === 2, "N2 محاضرة الكلية الأخرى تُعلَّم بلونٍ مختلف");
check(teacherLectures(rows, 7, 1, 1, 1).every(item => item.id !== 1) && teacherRows(rows, 7, 1, 1).length === 1, "N3 الموعد المفتوح للتعديل لا يُرسم محاضرةً (يُرسم شبحاً)");

/* المحور المضغوط: صباحٌ لا يُرسم في اثنتي عشرة ساعة، ومساءٌ يمتدّ حتى آخره. */
const span = compactSpan(day, lectures.map(item => item.end));
check(span.start === 8 * 60 && span.end === 14 * 60, "N4 المحور المضغوط: 08:00–14:00 لأسبوعٍ صباحي (ستّ ساعات على الأقل)", span);
check(compactSpan(day, [17 * 60 + 20]).end === 19 * 60 && compactSpan(day, [19 * 60 + 50]).end === 20 * 60, "N5 محاضرة مسائية تمدّ المحور، ولا يتجاوز نهاية يوم الدراسة");

const theory3 = { CourseHours: 3, CourseTeachingMode: "theoretical" };
const targets = freeTargets(theory3, lectures, span);
const sunday = targets.filter(target => target.day === "fsunday");
check(sunday.length > 0 && sunday.every(target => target.end - target.start === 50 && target.days.join() === "fsunday,ftuesday,fthursday"), "N6 خانات «+» بنمط المقرر (أحد·ثلاثاء·خميس 50د)", sunday);
check(sunday[0]?.start === 9 * 60 && sunday.every(target => target.start % 30 === 0), "N7 أول خانة بعد 08:50 + فاصل 10 = 09:00، على شبكة نصف الساعة", sunday.map(target => toClock(target.start)));
check(sunday.every((target, index) => index === 0 || target.start >= sunday[index - 1].end + 10), "N8 الخانات لا تتداخل ولا تتلاصق دون الفاصل", sunday.map(target => toClock(target.start)));
const monday = targets.filter(target => target.day === "fmonday");
check(monday.length > 0 && monday.every(target => target.end - target.start === 80 && !(target.start < 10 * 60 + 50 + 15 && target.end + 15 > 9 * 60 + 30)), "N9 الاثنين: 80د، وتحترم محاضرة الكلية الأخرى وفاصل 15د", monday.map(target => toClock(target.start)));
const avoid = freeTargets(theory3, lectures, span, { avoid: { days: ["fsunday", "ftuesday", "fthursday"], start: 9 * 60, end: 9 * 60 + 50 } });
check(!avoid.some(target => target.day === "fsunday" && target.start === 9 * 60), "N10 لا خانة تحت الشبح (الموعد الجاري)");
const fixed = freeTargets(theory3, lectures, span, { fixedDays: ["fmonday", "fwednesday"] });
check(fixed.length > 0 && fixed.every(target => target.days.join() === "fmonday,fwednesday"), "N11 أيام طلب الأستاذ الثابتة: لا خانة في غيرها");
check(freeTargets({}, lectures, span).length === 0, "N12 مقرر بلا ساعات: لا نمط يُخترع");

const first = lectures.find(item => item.id === 1 && item.day === "fsunday")!;
const after = adjacentPlacement(first, "after", theory3, lectures, day);
check(after?.start === 9 * 60 && toClock(after.start) === "09:00" && after.days.join() === "fsunday,ftuesday,fthursday", "N13 «بعدها»: 08:50 + فاصل 10 = 09:00 بنمط المقرر", after);
check(adjacentPlacement(first, "before", theory3, lectures, day) === null, "N14 «قبلها» خارج يوم الدراسة → لا زرّ");
const mondayLecture = lectures.find(item => item.day === "fmonday")!;
const mondayAfter = adjacentPlacement(mondayLecture, "after", theory3, lectures, day);
check(mondayAfter?.start === 10 * 60 + 50 + 15 && mondayAfter.end - mondayAfter.start === 80, "N15 «بعدها» يوم الاثنين: فاصل 15 ونمط 80د", mondayAfter);
const packed = teacherLectures([row(1, ["fsunday", "ftuesday", "fthursday"], "08:00", "08:50"), row(5, ["fsunday", "ftuesday", "fthursday"], "09:00", "09:50")], 7, 1, 0, 1);
check(adjacentPlacement(packed[0], "after", theory3, packed, day) === null, "N16 «بعدها» يزاحم محاضرةً تالية → لا زرّ");

/* «قاعته نفسها أولاً ثم مبناه». */
const spot = after!;
const roomFree = adjacentRoom(first, spot, rows);
check(roomFree?.roomId === "r1" && roomFree.locationStatus === "VERIFIED", "N17 قاعة المحاضرة الملاصقة إن خلت", roomFree);
const roomTaken = adjacentRoom(first, spot, [...rows, row(30, ["ftuesday"], "09:00", "09:50", { AdInstructorId: 55 })]);
check(roomTaken?.buildingId === "b1" && !roomTaken.roomId && roomTaken.AdRoomHall === "", "N18 القاعة مشغولة → المبنى نفسه، والقاعة يختارها المنسّق", roomTaken);
check(adjacentRoom(lectures.find(item => item.otherCollege)!, spot, rows) === null, "N19 محاضرة كلية أخرى: لا تُقترح قاعتها");

const courses = new Map([[11, { AdCourseId: 11, CourseHours: 3 }], [12, { AdCourseId: 12, CourseHours: 3 }], [20, { AdCourseId: 20, CourseHours: 3 }]] as any);
const own = teacherRows(rows, 7, 1);
const header = teacherHeader(own, courses as any, { AdCourseId: 20, SCode: "502", fsunday: true, fstarttime: "11:00", fendtime: "11:50" } as any, 18);
check(header.loadNow === 6 && header.loadAfter === 9 && header.nisab === 18 && header.daysAfter === 5 && header.daysNow === 5, "N20 النصاب 6 → 9 من 18، وأيام الحضور", header);
check(header.gapAfter > header.gapNow, "N21 موعدٌ بعيد عن محاضرات اليوم يزيد الفراغات", header);
const editing = teacherHeader(teacherRows(rows, 7, 1, 1), courses as any, { ...rows[0], fstarttime: "10:00", fendtime: "10:50" }, 18, rows[0]);
check(editing.loadNow === editing.loadAfter && editing.loadNow === 6, "N22 التعديل لا يُحسب إضافة: النصاب قبل = بعد", editing);

const editor = fs.readFileSync("src/components/Schedules.tsx", "utf8");
const quick = fs.readFileSync("src/components/QuickCreatePopover.tsx", "utf8");
const component = fs.readFileSync("src/components/TeacherMiniWeek.tsx", "utf8");
const css = fs.readFileSync("src/styles/36-appointment-forms.css", "utf8");
check(/<TeacherMiniWeek[\s\S]{0,1200}verdict=\{editorVerdict\}/.test(editor) && /onPick=\{pickFromMiniWeek\}/.test(editor) && /original=\{editorOriginalRow\}/.test(editor), "W1 المحرر الكامل: الشبح يقرأ الحكم الواحد، و«+» يملأ النموذج، والتعديل يعرف أصله");
check(/<TeacherMiniWeek variant="compact"[\s\S]{0,700}verdict=\{verdict\}/.test(quick) && /className="qc-mini-side"/.test(quick) && /sideRef\.current\?\.contains/.test(quick), "W2 «موعد جديد» السريع: بطاقة جانبية عائمة (والضغط فيها لا يغلق البطاقة)");
check(/safeStorage\.get\(key\)/.test(component) && /safeStorage\.set\(storageKey/.test(component), "W3 يُطوى ويتذكّر حالته لكل مستخدم (تخزينٌ آمن)");
check(/\/api\/schedules\?termId=\$\{termId\}&instructorId=\$\{teacherId\}/.test(component), "W4 أسبوع الأستاذ في الأقسام الأخرى بالمسار القائم (ضمن صلاحية القارئ)");
check(/blockers\.length \? "blocked"/.test(component) && /\.mini-week-ghost\.is-blocked\{[^}]*repeating-linear-gradient/.test(css) && /\.mini-week-ghost\.is-clean\{[^}]*var\(--success\)/.test(css), "W5 الشبح: أخضر سليم، أحمر مخطّط عند المانع");
check(/\.mini-week\.is-sheet\{position:fixed/.test(css) && /mini-week-grip/.test(component) && /onPointerMove/.test(component), "W6 الشاشة الضيقة: شريطٌ سفليّ يُسحب");
const block = css.slice(css.indexOf("/* ── N3: جدول الأستاذ المصغّر"));
check(block.length > 2000 && !/#[0-9a-fA-F]{3,8}\b/.test(block) && /var\(--accent\)/.test(block), "W7 ألوان من رموز التصميم وحدها (الوضع الداكن)");
check(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(component) && /from "lucide-react"/.test(component), "W8 أيقونات lucide بلا رموز تعبيرية");

console.log(`\nteacher-mini-week audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
