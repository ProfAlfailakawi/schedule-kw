/**
 * بصمة القسم (FR-DSH-032): صورةٌ حتمية من جدول القسم — كل قاعةٍ حلقة، وكل يومٍ قطاع،
 * وسُمك القوس امتلاء القاعة، وما فوق السعة بلونٍ وحده؛ لأصحاب جدول القسم لا للأستاذ؛
 * قراءةٌ فقط؛ ولا اسم قاعةٍ مطبوعٌ في الملصق ولا اسم أستاذٍ ولا رقم مدني في أي مكان.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import {
  arcLine, buildFingerprint, deptFingerprintPath, fingerprintAngle, fingerprintClock, fingerprintDelta, fingerprintGeometry, fingerprintHeadlines,
  fingerprintSlotLines, fingerprintTitleSize, ringSegment, unionSpan,
  DEPT_FINGERPRINT_ROLES, FINGERPRINT_DAYS, FINGERPRINT_PALETTES, FINGERPRINT_VIEW, type FingerprintRowInput,
} from "../src/utils/deptFingerprint";
import { fingerprintRows } from "../src/server/routes/deptFingerprintRoutes";

const source = (path: string) => readFileSync(path, "utf8");
const days = (...on: number[]) => [0, 1, 2, 3, 4].map(day => on.includes(day));

const rows: FingerprintRowInput[] = [
  { hallKey: "id:a", hallName: "B1/101", capacity: 40, courseId: 1, courseCode: "0109105", courseName: "مدخل", section: "01", seats: 30, days: days(0, 2, 4), start: "08:00", end: "08:50" },
  { hallKey: "id:a", hallName: "B1/101", capacity: 40, courseId: 1, courseCode: "0109105", courseName: "مدخل", section: "02", seats: 50, days: days(1, 3), start: "10:00", end: "11:15" },
  { hallKey: "id:b", hallName: "B1/102", capacity: null, courseId: 2, courseCode: "0109210", courseName: "تصميم", section: "01", seats: 30, days: days(0), start: "13:00", end: "14:50" },
  { hallKey: "", hallName: "", courseId: 3, courseCode: "0109300", courseName: "ندوة", section: "01", seats: 20, days: days(2), start: "10:00", end: "10:50" },
  /* المرفق المصاحب: يُرسم حلقةً ولا يُعدّ شعبةً ولا ساعاتٍ ثانية. */
  { hallKey: "id:lab", hallName: "B1/L1", capacity: 20, courseId: 2, courseCode: "0109210", courseName: "تصميم", section: "01", seats: 30, days: days(0), start: "13:00", end: "14:50", companion: true },
];
const input = { sectionName: "تكنولوجيا التعليم", termName: "الفصل الأول 2026/2027", collegeName: "كلية التربية الأساسية", rows };
const data = buildFingerprint(input);

/* ── الأرقام: القاعات حلقات، والشعبة مقرر+رمز، والساعات من الصفوف لا من المرافق ── */
assert.equal(data.stats.halls, 3);
assert.equal(data.stats.sections, 4);
assert.equal(data.stats.lectures, 3 + 2 + 1 + 1);
assert.equal(data.stats.weeklyHours, Math.round((50 * 3 + 75 * 2 + 110 + 50) / 60));
assert.equal(data.stats.roomless, 1, "الموعد بلا قاعة يُعدّ ولا يُرسم");
assert.deepEqual(data.halls.map(hall => hall.name), ["B1/101", "B1/102", "B1/L1"], "الأكثر إشغالاً في القلب، ثم الاسم");
assert.equal(data.halls[0].minutes, 50 * 3 + 75 * 2);

/* ── الامتلاء: مقاعد الشعبة ÷ سعة القاعة؛ ما فوق السعة يوسم، والمجهول يبقى مجهولاً ── */
const [first] = data.halls;
assert.equal(first.slots.find(slot => slot.section === "01")!.fill, 0.75);
assert.equal(first.slots.find(slot => slot.section === "02")!.over, true);
assert.equal(data.halls[1].slots[0].fill, null, "قاعةٌ بلا سعة مسجّلة: لا نسبة تُخترع");
assert.equal(data.stats.overfull, 2 + 1, "شعبتا الاثنين والأربعاء فوق السعة، والمرفق المصاحب");

/* ── المدى وساعة الذروة ── */
assert.deepEqual(data.span, { from: 480, to: 900 });
assert.equal(data.hours.length, 5);
assert.equal(data.hours[0].length, 7);
assert.deepEqual(data.stats.peak, { day: 0, minute: 480, count: 1 }, "عند التساوي: أبكر ساعةٍ في أول يوم");
assert.equal(data.hours[2][2], 1);
const busy = buildFingerprint({ ...input, rows: [...rows, { ...rows[0], hallKey: "id:c", hallName: "B1/103", section: "03", days: days(1), start: "10:30", end: "11:20" }] });
assert.deepEqual(busy.stats.peak, { day: 1, minute: 600, count: 2 }, "ساعة الذروة: أكثر ساعةٍ فيها محاضرات");
assert.equal(fingerprintClock(600), "10:00");
assert.equal(fingerprintClock(815), "13:35");

/* ── حتمية: الصفوف نفسها بأي ترتيب تعطي البصمة نفسها ورمزها، وأي تغيير يبدّل الرمز ── */
const shuffled = buildFingerprint({ ...input, rows: [...rows].reverse() });
assert.deepEqual(shuffled, data);
assert.deepEqual(fingerprintGeometry(shuffled), fingerprintGeometry(data));
assert.match(data.code, /^[0-9A-F]{4}-[0-9A-F]{4}$/);
assert.notEqual(busy.code, data.code);
const moved = buildFingerprint({ ...input, rows: rows.map((row, n) => (n ? row : { ...row, start: "09:00", end: "09:50" })) });
assert.notEqual(moved.code, data.code, "نقلُ محاضرةٍ يبدّل رمز البصمة");
const twice = buildFingerprint({ ...input, rows: [...rows, rows[0]] });
assert.equal(twice.halls[0].slots.length, data.halls[0].slots.length, "الصف المكرر لا يرسم قوسين");
assert.equal(twice.stats.lectures, data.stats.lectures, "الصف المكرر لا يزيد عدد المحاضرات");
assert.equal(twice.stats.weeklyHours, data.stats.weeklyHours, "ولا الساعات الأسبوعية");
assert.deepEqual(twice.hours, data.hours, "ولا حمل الساعات");
assert.equal(twice.code, data.code, "ولا يغيّر الرمز");
const loose = (start: string, end: string) => buildFingerprint({ ...input, rows: [...rows, { ...rows[0], hallKey: "", hallName: "", section: "77", days: days(2), start, end }] });
assert.notEqual(loose("10:00", "11:00").code, loose("15:00", "16:00").code, "نقل موعدٍ بلا قاعة يغيّر الرمز");

/* ── الهندسة: حلقةٌ لكل قاعة، وقوسٌ لكل محاضرة في قطاع يومها، والسُّمك بالامتلاء ── */
const geo = fingerprintGeometry(data);
assert.equal(geo.rings.length, 3);
assert.equal(geo.arcs.length, 3 + 2 + 1 + 1);
assert.ok(geo.rings.every((ring, n) => !n || ring.r > geo.rings[n - 1].r), "الحلقات من القلب إلى الخارج");
assert.ok(geo.rings.at(-1)!.r < FINGERPRINT_VIEW.outer && geo.inner >= FINGERPRINT_VIEW.innerMin);
assert.equal(fingerprintAngle(0, 480, data.span) < -90 && fingerprintAngle(0, 900, data.span) > -90, true, "الأحد في أعلى الدائرة");
for (let day = 0; day < 4; day += 1) assert.ok(fingerprintAngle(day, data.span.to, data.span) < fingerprintAngle(day + 1, data.span.from, data.span), "بين اليومين فاصل");
assert.ok(fingerprintAngle(4, data.span.to, data.span) < fingerprintAngle(0, data.span.from, data.span) + 360);
const box = (d: string) => (d.match(/-?\d+(\.\d+)?/g) || []).map(Number);
assert.ok(geo.arcs.every(arc => !/NaN|Infinity/.test(arc.d) && arc.d.startsWith("M") && arc.d.endsWith("Z")));
assert.ok(geo.arcs.every(arc => arc.x > 0 && arc.x < FINGERPRINT_VIEW.width && arc.y > 0 && arc.y < FINGERPRINT_VIEW.height));
assert.ok(geo.arcs.every(arc => arc.turn >= 0 && arc.turn < 1));
assert.equal(geo.arcs.filter(arc => arc.over).length, data.stats.overfull);
assert.ok(geo.arcs.every(arc => Boolean(arc.rim) === arc.over), "حافة «فوق السعة» لما تجاوز وحده");
assert.equal(geo.arcs.filter(arc => !arc.known).length, 1);
assert.ok(geo.dayLabels.length === 5 && geo.dayLabels.every(label => label.x > 60 && label.x < 940), "أسماء الأيام داخل اللوحة");
assert.equal(geo.dayLabels[0].x, FINGERPRINT_VIEW.cx);
assert.equal(geo.petals.length, 5 * 7);
assert.equal(geo.petals.filter(petal => petal.peak).length, 1, "بتلةٌ واحدة لساعة الذروة");
assert.ok(box(ringSegment(100, 120, 0, 30, 3)).every(Number.isFinite));
assert.ok(arcLine(100, 0, 60).includes("A100 100"));
/* قاعاتٌ كثيرة: الحلقات ترقّ ولا تخرج من اللوحة ولا تدخل الزهرة. */
const many = buildFingerprint({ ...input, rows: Array.from({ length: 40 }, (_, n) => ({ ...rows[0], hallKey: `id:h${n}`, hallName: `H${n}`, section: String(n) })) });
const manyGeo = fingerprintGeometry(many);
assert.equal(manyGeo.rings.length, 40);
assert.ok(manyGeo.inner >= FINGERPRINT_VIEW.innerMin - 0.001 && manyGeo.rings[0].band > 3);

/* ── المقارنة: مدًى واحد للبصمتين، وفرقٌ يُقال بالعدد والمعدود ── */
const late = buildFingerprint({ ...input, termName: "الفصل الثاني 2025/2026", rows: [{ ...rows[0], days: days(0), start: "18:00", end: "19:50" }] });
const shared = unionSpan(data.span, late.span);
assert.deepEqual(shared, { from: 480, to: 1200 });
assert.equal(fingerprintGeometry(data, { span: shared }).petals.length, 5 * 12);
assert.equal(fingerprintAngle(1, 600, shared), fingerprintAngle(1, 600, shared));
assert.deepEqual(fingerprintDelta(data, late), ["قاعتان أكثر", "3 شعب أكثر", "6 ساعات أكثر"]);
assert.deepEqual(fingerprintDelta(late, data), ["قاعتان أقل", "3 شعب أقل", "6 ساعات أقل"]);
assert.deepEqual(fingerprintDelta(data, data), []);

/* ── الكلام: الأرقام الأربعة، وما يُقال عن القوس ── */
const headlines = fingerprintHeadlines(data);
assert.deepEqual(headlines.map(item => item.label), ["قاعات", "شعب", "ساعات في الأسبوع", "ذروة الأحد"]);
assert.equal(headlines[3].value, "8:00");
assert.equal(headlines[3].note, FINGERPRINT_DAYS[0]);
const over = fingerprintSlotLines(first, first.slots.find(slot => slot.over)!);
assert.equal(over.title, "0109105 · مدخل");
assert.deepEqual(over.lines.map(line => line.replace(/[\u2066\u2069]/g, "")), ["الشعبة 02 · الاثنين 10:00–11:15", "القاعة B1/101", "الامتلاء 125% · 50 من 40 · فوق السعة"]);
assert.ok(over.lines[0].includes("\u206610:00–11:15\u2069"), "مدى الوقت معزول الاتجاه فلا ينقلب");
assert.equal(fingerprintSlotLines(data.halls[1], data.halls[1].slots[0]).lines[2], "سعة القاعة غير مسجّلة");
assert.ok(fingerprintTitleSize("تكنولوجيا التعليم") > fingerprintTitleSize("قسم المناهج وطرق التدريس والتربية العملية الميدانية"));
assert.ok(fingerprintTitleSize("ا".repeat(120)) >= 38);
const everything = JSON.stringify([data, geo, headlines, over]);
assert.ok(!/[٠-٩۰-۹٪]/.test(everything), "أرقام لاتينية فقط");

/* ── لوحتا الألوان: خمسة أيام مختلفة، ولون «فوق السعة» ليس لون يوم ── */
for (const palette of Object.values(FINGERPRINT_PALETTES)) {
  assert.equal(new Set(palette.days).size, 5);
  assert.ok(!palette.days.includes(palette.over as any));
}

/* ── صفوف الخادم: القاعة من السجل باسمها وسعتها، والنصّية القديمة بمفتاحها، والمرفق حلقةٌ ثانية ── */
const resolved = fingerprintRows([
  { id: 1, AdCourseId: 7, SCode: "01", AdInstructorId: 99, fsunday: true, fstarttime: "08:00", fendtime: "08:50", roomId: "r1", AdRoomCode: "", AdRoomHall: "", companionRoomId: "r2" },
  { id: 2, AdCourseId: 7, SCode: "02", AdInstructorId: 98, fmonday: true, fstarttime: "08:00", fendtime: "08:50", AdRoomCode: "b1", AdRoomHall: "101" },
  { id: 3, AdCourseId: 8, SCode: "01", AdInstructorId: 97, ftuesday: true, fstarttime: "08:00", fendtime: "08:50", locationStatus: "PENDING_ROOM", AdRoomCode: "B1", AdRoomHall: "101" },
] as any, [{ AdCourseId: 7, CourseCode: "0109105", CourseName: "مدخل", MaxStudent: 35 }, { AdCourseId: 8, CourseCode: "0109210", CourseName: "تصميم", MaxStudent: 0 }] as any,
[{ id: "r1", buildingCode: "B1", canonicalCode: "101", capacity: 40 }, { id: "r2", buildingCode: "B1", canonicalCode: "L1", capacity: 20 }] as any);
assert.equal(resolved.length, 4);
assert.deepEqual(resolved.map(row => row.hallKey), ["id:r1", "id:r2", "id:r1", ""], "النصّية والمرتبطة قاعةٌ واحدة، والمعلّقة بلا قاعة");
assert.equal(resolved[0].hallName, "B1/101");
assert.equal(resolved[0].capacity, 40);
assert.equal(resolved[0].seats, 35);
assert.equal(resolved[1].companion, true);
assert.equal(resolved[3].seats, null);
assert.ok(!JSON.stringify(resolved).includes("99") && !("AdInstructorId" in resolved[0]), "لا أستاذ في صفوف البصمة");
assert.equal(buildFingerprint({ sectionName: "", termName: "", rows: resolved }).stats.halls, 2);

/* ── الخادم: قراءةٌ فقط، لأصحاب جدول القسم، ضمن النطاق، ومخبأٌ بمفتاح جلسة التجربة ── */
assert.deepEqual([...DEPT_FINGERPRINT_ROLES], ["committeeChair", "departmentHead", "standard"]);
const route = source("src/server/routes/deptFingerprintRoutes.ts");
assert.equal((route.match(/app\.(get|post|put|patch|delete)\(/g) || []).join(), "app.get(", "مسارٌ واحد يقرأ فقط");
assert.ok(/mayReadFingerprint\(req\)/.test(route) && /isScopeAllowed\(req, collegeId, sectionId\)/.test(route));
assert.ok(/includes\(7\)/.test(route), "الحساب بلا صفة يحتاج شاشة الجدول");
assert.ok(/Repository\.currentDemoSessionId\(\)/.test(route), "المخبأ بمفتاح جلسة التجربة");
assert.ok(!/Repository\.(save|update|delete|upsert|set|add|create|write)[A-Z]/.test(route), "لا كتابة");
assert.ok(!/CivilId|civilId|InstructorName|AdInstructorName/.test(route + source("src/utils/deptFingerprint.ts")), "لا رقم مدني ولا اسم أستاذ");
assert.ok(/registerDeptFingerprintRoutes\(app\)/.test(source("server.ts")));

/* ── الشاشة: الملصق لا يطبع اسم قاعة، وأزرارها تنزيلٌ ومقارنة، والمسار مسجَّل للأدوار نفسها ── */
const screen = source("src/components/DeptFingerprint.tsx");
const poster = screen.slice(screen.indexOf("const Poster"), screen.indexOf("/* ── التنزيل"));
assert.ok(poster.length > 1000 && !/hall\.name/.test(poster), "الملصق المنزَّل بلا أسماء قاعات");
assert.ok(/قارن بفصل سابق/.test(screen) && /answer!\.earlier\.length/.test(screen), "زرّ المقارنة يختفي حين لا فصل أسبق");
assert.ok(/تنزيل صورة PNG/.test(screen) && /تنزيل صورة SVG/.test(screen));
assert.ok(/canvas\.width = V\.width \* 2/.test(screen), "PNG بضعف المقاس");
assert.ok(!/method:\s*"(POST|PUT|PATCH|DELETE)"/.test(screen), "الشاشة تقرأ فقط");
const css = source("src/styles/dept-fingerprint.css");
assert.ok(/prefers-reduced-motion:reduce/.test(css) && /\.dfp-arc,[^{]*\{animation:none\}/.test(css), "تقليل الحركة يوقف الرسم المتحرك");
assert.equal(deptFingerprintPath({ collegeId: 1, sectionId: 2, termId: 3 }), "/FSchedule/Fingerprint?college=1&section=2&term=3");
const app = source("src/App.tsx");
assert.ok(/deptFingerprint: "\/FSchedule\/Fingerprint"/.test(app) && /deptFingerprint: "\/FSchedule\/Fingerprint"/.test(source("src/appPaths.ts")));
const guard = app.slice(app.indexOf('case "deptFingerprint":'), app.indexOf("<DeptFingerprintPage "));
assert.ok(/committeeChair/.test(guard) && /departmentHead/.test(guard) && /hasPerm\(7\)/.test(guard) && !/instructor|dean/.test(guard), "الأستاذ لا يرى البصمة");
assert.ok(/filmScope\?\.version==="dept"/.test(source("src/components/Dashboard.tsx")), "بطاقة اللوحة لأصحاب جدول القسم");

console.log("dept-fingerprint-audit: ok");
