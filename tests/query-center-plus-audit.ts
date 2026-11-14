/**
 * ── مركز الاستعلام: إصلاحات المراجعة وإضافاتها ────────────────────────────────
 *
 * يحرس ما ثبت في مراجعة الاستعلامات والتقارير (2026-11-14):
 *  - السؤال المكتوب يُفهم من بيانات الشاشة، أو يقول «هل تقصد؟»، أو لا يغيّر شيئاً؛
 *  - Excel يطابق المبنى والقاعة بمعرّف السجل الرسمي، ونافذةٌ مقلوبة لا تُطبَّق؛
 *  - مسار طباعة واحد، ولا بوابة «افتحه من الكمبيوتر»، والإشارة الحية لا تغيّر التقرير تحت يد القارئ؛
 *  - الجواب السريع، والرابط المشارَك، وملف Excel لكل عدسة، وموجز الصباح، والمقارنة بنسخة سابقة.
 */
import fs from "fs";
import path from "path";
import { askNormalize, askSubject, editDistance, fuzzyNames, resolveAsk } from "../src/utils/queryAsk";
import { briefLineText, briefMessage, kuwaitDayKey, kuwaitWeekday } from "../src/server/morningBriefPush";
import { speechToQuestion } from "../src/hooks/useSpeechAsk";
import { sanitizeReportState } from "../src/utils/reportShareCore";
import { resultsFingerprint } from "../src/utils/reportShare";
import { whatIfMove } from "../src/utils/queryWhatIf";
import { excludedFromRooms } from "../src/utils/excludedRows";
import { buildReportInsights, kuwaitNow } from "../src/utils/reportInsights";
import { compactFilters, decodeReportState, encodeReportState } from "../src/utils/reportShare";
import { balanceSheet, exportFileName, sheetName, visitingHistorySheet } from "../src/utils/lensExport";
import { buildMorningBrief } from "../src/utils/morningBrief";

let passed = 0, failed = 0;
function check(condition: boolean, name: string, detail?: unknown) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`, detail === undefined ? "" : JSON.stringify(detail)); }
}
const read = (file: string) => fs.readFileSync(path.resolve(file), "utf8");

/* ── السؤال ─────────────────────────────────────────────────────────────── */
const context = {
  instructors: [
    { id: 1, name: "د. أحمد سالم" }, { id: 2, name: "د. أحمد علي" }, { id: 3, name: "نورة العتيبي" },
    { id: 9, name: "عضو هيئة تدريس تجريبي 9" }, { id: 4, name: "عضو هيئة تدريس تجريبي 4" },
  ],
  courses: [
    { id: 11, name: "مقدمة في التعلم الرقمي", codes: ["101", "0109101"] },
    { id: 12, name: "تصميم الواجهات التعليمية", codes: ["201", "0109201"] },
  ],
  buildings: [{ id: "building_7", code: "7" }, { id: "building_901A01", code: "901A01" }],
  rooms: [{ id: "room_7_31", code: "31", buildingId: "building_7" }, { id: "room_901A01_101", code: "101", buildingId: "building_901A01" }],
};
const free = resolveAsk("قاعات فارغة الثلاثاء 10", context);
check(free.kind === "ok" && free.lens === "room" && free.patch.day === 2 && free.patch.startTime === "10:00" && free.freeRooms && free.roomDay === 2, "قاعات فارغة الثلاثاء 10 ← عدسة القاعات على الثلاثاء 10:00", free);
const ahmad = resolveAsk("جدول أحمد", context);
check(ahmad.kind === "choose" && ahmad.options.length === 2 && ahmad.options.every(option => option.lens === "instructor"), "اسمٌ يطابق اثنين ← «هل تقصد؟» بخيارين", ahmad);
const noura = resolveAsk("جدول نوره", context);
check(noura.kind === "ok" && noura.patch.instructorId === 3 && noura.lens === "instructor", "التاء المربوطة والهاء سواء: «نوره» ← نورة", noura);
const nine = resolveAsk("تجريبي 9", context);
check(nine.kind === "ok" && nine.patch.instructorId === 9 && !nine.patch.startTime, "رقمٌ في الاسم يحسم بين المتشابهين ولا يُقرأ ساعة", nine);
const course = resolveAsk("مقدمة في التعلم الرقمي", context);
check(course.kind === "ok" && course.patch.courseId === 11 && course.lens === "list", "اسم مقررٍ فيه «في» يطابق المقرر", course);
const code = resolveAsk("0109101", context);
check(code.kind === "ok" && code.patch.courseCode === "0109101" && !code.patch.startTime, "رقم المقرر بسبع خانات ← مرشّح الرقم، لا ساعة", code);
const room = resolveAsk("7/31", context);
check(room.kind === "ok" && room.patch.building === "building_7" && room.patch.hall === "room_7_31" && room.lens === "room", "«7/31» ← المبنى والقاعة من السجل الرسمي", room);
const dash = resolveAsk("901A01-101 الأحد", context);
check(dash.kind === "ok" && dash.patch.hall === "room_901A01_101" && dash.patch.day === 0, "«901A01-101 الأحد» ← القاعة واليوم", dash);
const roomHour = resolveAsk("7/31 الثلاثاء 10", context);
check(roomHour.kind === "ok" && roomHour.patch.startTime === "10:00" && roomHour.patch.hall === "room_7_31", "«7/31 الثلاثاء 10» ساعتُها 10 لا رقم المبنى", roomHour);
check(room.kind === "ok" && !room.patch.startTime, "«7/31» وحدها بلا مرشّح ساعة", room);
const nonsense = resolveAsk("أي كلام عشوائي", context);
check(nonsense.kind === "unknown" && /لم أجد/.test(nonsense.hint), "جملةٌ لا تُفهم ← رسالةٌ صريحة ولا مرشّحات", nonsense);
check(resolveAsk("", context).kind === "unknown", "سؤالٌ فارغ ← لا شيء يتغيّر");
check(askNormalize("أحمد ٩") === "احمد 9" && askSubject("جدول د. سالم الأحد 10") === "سالم", "التطبيع ونزع كلمات السؤال");

/* ── التقريب الإملائي ───────────────────────────────────────────────────── */
check(editDistance("سالم", "سالن") === 1 && editDistance("احمد", "احمد") === 0 && editDistance("", "اب") === 2, "المسافة بين الكلمتين");
const typo = resolveAsk("جدول احمد سالن", context);
check(typo.kind === "choose" && typo.fuzzy === true && typo.options.length === 1 && typo.options[0].label === "د. أحمد سالم", "خطأٌ حرفٌ واحد ← «هل تقصد؟» باسمٍ واحد", typo);
check(fuzzyNames("كلام", context.instructors).length === 0 && fuzzyNames("اب", context.instructors).length === 0, "كلامٌ بعيدٌ أو قصيرٌ جداً لا يُخمَّن");
check(speechToQuestion("جدول ٩ : ٣٠ الثلاثاء ") === "جدول 9:30 الثلاثاء", "الإملاء الصوتي: أرقامٌ عادية وساعةٌ مضبوطة");

/* ── موجز الصباح بالتنبيه ──────────────────────────────────────────────── */
check(briefLineText({ place: "قسم", blockers: 2, daysLeft: 5 }) === "قسم · مانعان · 5 أيام" && briefLineText({ place: "قسم", blockers: 0, daysLeft: -1 }) === "قسم · انقضى الموعد", "سطر القسم: الموانع والأيام بالعدّ العربي");
check(briefMessage([{ place: "قسم", blockers: 0, daysLeft: 20 }]) === null, "لا شيء يُذكر ← لا تنبيه");
const pushed = briefMessage([{ place: "أ", blockers: 1, daysLeft: null }, { place: "ب", blockers: 0, daysLeft: 3 }, { place: "ج", blockers: 0, daysLeft: 30 }]);
check(pushed?.title === "☀ موجز الصباح" && pushed.body?.split("\n").length === 2 && pushed.tag === "morning-brief", "التنبيه سطرٌ لكل قسمٍ يستحق، بوسمٍ واحد يستبدل سابقه", pushed);
check(kuwaitWeekday(new Date("2026-11-15T05:00:00Z")) === 0 && kuwaitWeekday(new Date("2026-11-13T05:00:00Z")) === 5 && kuwaitDayKey(new Date("2026-11-14T21:30:00Z")) === "2026-11-15", "يوم الأسبوع والتاريخ بتوقيت الكويت");

/* ── تقاريري: تحقّق الحال وبصمة النتائج ──────────────────────────────── */
check(sanitizeReportState({ v: 1, lens: "room", c: "1", s: 2, t: 3, f: { building: "b", evil: "x", sun: true } })?.f?.evil === undefined, "الحال من الخادم تُنقّى: مفاتيح المرشحات المعروفة وحدها");
check(sanitizeReportState({ v: 2, lens: "room" }) === null && sanitizeReportState(null) === null, "حالٌ بنسخةٍ أخرى أو فارغة تُرفض");
const fpA = resultsFingerprint([{ id: 1, fstarttime: "08:00", fendtime: "09:00" }]);
check(fpA === resultsFingerprint([{ id: 1, fstarttime: "08:00", fendtime: "09:00" }]) && fpA !== resultsFingerprint([{ id: 1, fstarttime: "09:00", fendtime: "10:00" }]), "بصمة النتائج تتغيّر بتحريك موعد وتثبت بلا تغيير");

/* ── «لو نقلتُ… ماذا يتعارض؟» ──────────────────────────────────────────── */
const askOf = (text: string) => resolveAsk(text, context);
check(JSON.stringify(askOf("لو نقلت شعبة 101 للثلاثاء 10")) === JSON.stringify({ kind: "whatif", code: "101", day: 2, time: "10:00" }), "«لو نقلت شعبة 101 للثلاثاء 10» سؤالُ قرارٍ لا مرشّح", askOf("لو نقلت شعبة 101 للثلاثاء 10"));
check((askOf("انقل 0109101 الاثنين 9:30") as any).kind === "whatif" && (askOf("انقل 0109101 الاثنين 9:30") as any).time === "09:30", "رقمُ المقرر بسبع خانات ووقتٌ بدقائق");
check((askOf("انقل 101") as any).kind !== "whatif", "نقلٌ بلا وجهةٍ (يومٌ أو وقت) لا يُعدّ سؤالَ قرار");
const wiRow = (id: number, over: Record<string, unknown>) => ({ id, AdCourseId: id, AdInstructorId: 1, SCode: "01", fstarttime: "08:00", fendtime: "09:00", fsunday: true, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false, roomId: "R1", AdCourseName: `مقرر ${id}`, ...over }) as any;
const wiRows = [wiRow(1, {}), wiRow(2, { fsunday: false, ftuesday: true, fstarttime: "10:00", fendtime: "11:00", AdInstructorId: 2 }), wiRow(3, { fsunday: false, ftuesday: true, fstarttime: "10:30", fendtime: "11:30", roomId: "R9", AdInstructorId: 1 })];
const base = { rows: wiRows, courseNumberOf: (r: any) => `0109${String(100 + r.id)}`, courseCodeOf: (r: any) => String(100 + r.id), courseNameOf: (r: any) => r.AdCourseName, roomKeyOf: (r: any) => String(r.roomId || "") };
const movedTo = whatIfMove({ ...base, code: "101", day: 2, time: "10:00" });
check(movedTo.length === 1 && movedTo[0].conflicts.some(c => c.kind === "room") && movedTo[0].conflicts.some(c => c.kind === "instructor"), "نقلُ 101 إلى الثلاثاء 10: قاعةٌ محجوزة (مقرر 2) وأستاذٌ مشغول (مقرر 3)", movedTo[0]?.conflicts);
const freeSlot = whatIfMove({ ...base, code: "0109101", day: 3, time: "14:00" });
check(freeSlot.length === 1 && freeSlot[0].conflicts.length === 0 && !freeSlot[0].outsideHours, "خانةٌ حرّة ← بلا تعارض", freeSlot[0]);
const lateEnd = whatIfMove({ ...base, code: "101", day: 3, time: "19:30" });
check(lateEnd[0].outsideHours, "تنتهي بعد ساعات الدوام ← تحذير");
const externalBusy = whatIfMove({ ...base, code: "101", day: 3, time: "14:00", external: [{ roomId: "R1", day: 3, from: 14 * 60, to: 15 * 60, mine: false }, { roomId: "R1", day: 3, from: 14 * 60, to: 15 * 60, mine: true }] });
check(externalBusy[0].conflicts.filter(c => c.kind === "external").length === 1, "حجزٌ من خارج نطاقك يُعدّ تعارضاً بلا اسم، وحجزُك لا يُعدّ خارجياً");
check(whatIfMove({ ...base, code: "999", day: 1, time: "09:00" }).length === 0 && whatIfMove({ ...base, code: "101", day: null, time: null }).length === 0, "مقررٌ مجهول أو بلا وجهة ← لا شيء");
const sameSlot = whatIfMove({ ...base, code: "101", day: 0, time: "08:00" });
check(sameSlot[0].unchanged === true, "هي الخانة نفسها ← «لا تغيير»");

/* ── ما لم يُحسب ───────────────────────────────────────────────────────── */
const excluded = excludedFromRooms([wiRow(1, {}), wiRow(4, { roomId: "", locationStatus: "VERIFIED" }), wiRow(5, { locationStatus: "PENDING_ROOM" }), wiRow(6, { fstarttime: "10:00", fendtime: "09:00" }), wiRow(7, { fsunday: false }), wiRow(8, { locationStatus: "LOCATION_REVIEW_REQUIRED" })]);
check(JSON.stringify(excluded.map(item => [item.row.id, item.reason])) === JSON.stringify([[4, "noRoom"], [5, "pending"], [6, "noTime"], [7, "noDays"], [8, "review"]]), "المستبعد وسببُه: بلا قاعة، بانتظار التثبيت، بلا وقتٍ صالح، بلا أيام، مراجعة", excluded.map(item => [item.row.id, item.reason]));
check(excludedFromRooms([wiRow(1, {})]).length === 0, "موعدٌ سليم لا يُستبعد");

/* ── تنبيه التغيّر ────────────────────────────────────────────────────── */
const watchedPush = briefMessage([{ place: "أ", blockers: 0, daysLeft: 30 }], undefined, ["قاعات المبنى 1"]);
check(watchedPush?.body === "🔔 «قاعات المبنى 1»", "تقريرٌ مراقَب تغيّر ← تنبيهٌ ولو لم يكن في الموجز غيرُه", watchedPush);
check(briefMessage([{ place: "أ", blockers: 0, daysLeft: 30 }], undefined, []) === null, "لا موانع ولا مراقَب تغيّر ← لا تنبيه");

/* ── الجواب السريع ─────────────────────────────────────────────────────── */
const rows = [
  { AdInstructorId: 1, fstarttime: "10:00", fendtime: "11:15", fsunday: true, ftuesday: true },
  { AdInstructorId: 1, fstarttime: "10:00", fendtime: "10:50", fmonday: true },
  { AdInstructorId: 3, fstarttime: "10:30", fendtime: "11:45", fsunday: true },
];
const sundayTen = new Date("2026-11-15T07:20:00Z"); // الأحد 10:20 بتوقيت الكويت
check(kuwaitNow(sundayTen).day === 0 && kuwaitNow(sundayTen).minutes === 620, "الوقت بتوقيت الكويت أيّاً كانت ساعة الجهاز");
const insights = buildReportInsights({
  rows, teachingHours: new Map([[1, 6], [3, 3]]), nameOf: id => ({ 1: "أحمد", 3: "نورة" } as Record<number, string>)[id] || "",
  rooms: [{ name: "7/31", busy: [{ day: 0, from: 600, to: 675 }] }, { name: "7/32", busy: [] }], now: sundayTen,
});
check(insights.heaviest?.name === "أحمد" && insights.heaviest.hours === 6, "أثقل نصاباً بالساعات المعتمدة", insights.heaviest);
check(insights.busiest?.day === 0 && insights.busiest.hour === 600 && insights.busiest.lectures === 2, "أزحم ساعة: الأحد 10:00 بمحاضرتين", insights.busiest);
check(insights.freeNow?.state === "open" && JSON.stringify((insights.freeNow as any).free) === JSON.stringify(["7/32"]), "الفارغة الآن: القاعة غير المحجوزة وحدها", insights.freeNow);
const friday = buildReportInsights({ rows, teachingHours: new Map(), nameOf: () => "x", rooms: [{ name: "7/31", busy: [] }], now: new Date("2026-11-13T08:00:00Z") });
check(friday.freeNow?.state === "closed", "الجمعة خارج أيام الدوام", friday.freeNow);

/* ── الرابط المشارَك ───────────────────────────────────────────────────── */
const state = { v: 1 as const, lens: "room", c: 1, s: 2, t: 3, f: compactFilters({ building: "building_7", instructorId: 0, sun: true, courseCode: "", instructorQuery: "أحمد" }) };
const decoded = decodeReportState(encodeReportState(state));
check(JSON.stringify(decoded) === JSON.stringify(state), "الحال يُرمَّز ويُقرأ كما هو (بالعربية)", decoded);
check(!("instructorId" in (state.f || {})) && !("courseCode" in (state.f || {})), "الفارغ والصفر لا يُحملان في الرابط");
check(decodeReportState("not-base64!!") === null && decodeReportState(Buffer.from(JSON.stringify({ v: 2 })).toString("base64url")) === null, "رابطٌ تالفٌ أو بنسخةٍ أخرى يُهمل");
const serverStyle = Buffer.from(JSON.stringify({ v: 1, lens: "list", c: 4, s: 5, t: 6 }), "utf8").toString("base64url");
check(decodeReportState(serverStyle)?.c === 4, "صيغة الخادم (رابط نسخة اليوم في صفحة الختم) تُقرأ في الشاشة");

/* ── Excel لكل عدسة ────────────────────────────────────────────────────── */
const name = exportFileName(["ميزان الأقسام", "كلية/التربية", "الفصل الأول"], new Date("2026-11-14T00:00:00Z"));
check(name === "ميزان الأقسام - كلية-التربية - الفصل الأول - 2026-11-14.xlsx", "اسم الملف: ما فيه ثم النطاق ثم التاريخ، بلا حروف ممنوعة", name);
check(sheetName("المنتدبون عبر الفصول: كل السنوات [2026]").length <= 31, "اسم الورقة لا يتجاوز 31 حرفاً");
const balanceRows = balanceSheet([{ sectionId: 7, sectionName: "قسم", collegeName: "كلية", rows: 10, instructors: 3, rooms: 2, morningPct: 60, eveningPct: 40, fairness: 80, quality: 90, conflicts: 1 }], () => "مقبول").rows;
check(balanceRows.length === 1 && balanceRows[0]["الاعتماد"] === "مقبول" && balanceRows[0]["الموانع"] === 1, "ورقة الميزان سطرٌ لكل قسم بأعمدة الشاشة");
const history = visitingHistorySheet([{ termId: 1, termName: "الأول" }, { termId: 2, termName: "الثاني" }], [{ name: "س", times: 1, sections: 2, terms: [{ termId: 2, sections: 2 }] }]).rows[0];
check(history["الأول"] === 0 && history["الثاني"] === 2, "سجل المنتدبين: عمودٌ لكل فصل بعدد الشعب");

/* ── موجز الصباح ───────────────────────────────────────────────────────── */
const now = new Date("2026-11-15T06:00:00Z");
const brief = buildMorningBrief({
  now, scopeRowIds: new Set([1, 2]),
  trail: [
    { at: "2026-11-15T05:00:00Z", who: "سارة", kind: "edit", target: "مقرر · ش01", row: 1 },
    { at: "2026-11-15T04:00:00Z", who: "منى", kind: "add", target: "خارج القسم", row: 99 },
    { at: "2026-11-13T04:00:00Z", who: "منى", kind: "add", target: "قديم", row: 2 },
  ],
  kindLabel: kind => kind, approval: { statusLabel: "مُرجَع بملاحظات", round: 3 }, deadline: { daysLeft: 5 }, blockers: 2, regulationNotes: 0,
  changes: { added: 1, removed: 0, changed: 2 },
});
check(brief.moveCount === 1 && brief.moves[0].who === "سارة", "حركات القسم في آخر ٢٤ ساعة وحدها", brief.moves);
const withDelete = buildMorningBrief({
  now, scopeRowIds: new Set([1]), scope: { collegeId: 1, sectionId: 2, termId: 3 },
  trail: [
    { at: "2026-11-15T05:30:00Z", who: "سارة", kind: "delete", target: "موعدٌ حُذف", row: 77, c: 1, s: 2, t: 3 },
    { at: "2026-11-15T05:20:00Z", who: "منى", kind: "edit", target: "قسمٌ آخر", row: 1, c: 1, s: 9, t: 3 },
  ],
  kindLabel: kind => kind, approval: null, deadline: null, blockers: 0, regulationNotes: 0, changes: null,
});
check(withDelete.moveCount === 1 && withDelete.moves[0].target === "موعدٌ حُذف", "الحذف يُعدّ بقسمه ولو زال الموعد، وحركة قسمٍ آخر لا تُعدّ", withDelete.moves);
check(brief.lines.some(line => line.tone === "danger" && /مانعا اعتماد/.test(line.text)) && brief.lines.some(line => line.tone === "warn" && /بقي على موعد التسليم 5 أيام/.test(line.text)), "الموانع والموعد في سطورٍ بلونها", brief.lines);

/* ── حرّاس المصدر (الجولة الثانية) ─────────────────────────────────────── */
const routesSource = read("src/server/routes/reportsRoutes.ts");
check(/app\.put\("\/api\/reports\/saved"/.test(routesSource) && /isScopeAllowed\(req, state\.c, state\.s\)/.test(routesSource) && /deleteFeatureDoc\("savedReports"/.test(routesSource), "تقاريري على الخادم: المشاركة بصلاحية القسم، والحذف الحقيقي");
const pushSource = read("src/server/morningBriefPush.ts");
check(/x-brief-token/.test(pushSource) && /timingSafeEqual/.test(pushSource) && /status\(404\)/.test(pushSource) && /isDemoMode\(\)/.test(pushSource), "نقطة موجز الصباح: سرٌّ مقارَن بزمنٍ ثابت، و404 بدونه، وليست في الديمو");
check(/"pushCooldowns", `brief:\$\{userId\}:\$\{day\}`/.test(pushSource) && /deps\.isPowerUser/.test(pushSource), "تنبيهٌ واحد لكل حسابٍ في اليوم، ولا يصل مدير النظام");
const reportsUi = read("src/components/Reports.tsx");
check(/<QueryBrief /.test(reportsUi) && /<QueryInsights/.test(reportsUi) && /<QuerySaved/.test(reportsUi) && /<QueryCompare/.test(reportsUi) && /<QueryEmptyWhy/.test(reportsUi) && /<QueryPrintPreview/.test(reportsUi), "المكوّنات الجديدة في ملفاتها (components/query) لا داخل Reports.tsx");
check(!/setBriefOpen\(true\)/.test(reportsUi), "موجز الصباح لا يُفتح من تلقاء نفسه (الزحام عدوّ الوضوح)");
check(/useSpeechAsk\(/.test(reportsUi) && /speech\.supported/.test(reportsUi), "الميكروفون يظهر حيث يُدعم الصوت فقط");

/* ── حرّاس المصدر (الجولة الثالثة) ─────────────────────────────────────── */
const pushSrc = read("src/server/morningBriefPush.ts");
check(/doc\.fp !== undefined/.test(pushSrc) && /remember\(\)/.test(pushSrc), "المراقبة: أولُ مرةٍ قاعدةٌ لا تغيّر، وتُحفظ البصمة بعد أخذ حصّة اليوم");
const ui = read("src/components/Reports.tsx");
check(/<QueryWhatIf /.test(ui) && /<QueryExcluded /.test(ui) && /openInSchedule/.test(ui) && /navigator\.share/.test(ui), "بطاقة «لو نقلت» وما لم يُحسب و«افتحه في الجدول» ومشاركة الهاتف");
check((read("src/App.tsx").match(/onOpenSchedule=\{\(\) => go\("schedules"\)\}/g) || []).length === 10, "كل مداخل الاستعلامات تفتح الجدول من التقرير");

/* ── حرّاس المصدر ──────────────────────────────────────────────────────── */
const reports = read("src/components/Reports.tsx");
const routes = read("src/server/routes/reportsRoutes.ts");
check(/String\(s\.buildingId \|\| ""\) === String\(building\)/.test(routes) && /String\(s\.roomId \|\| ""\) === String\(hall\)/.test(routes), "Excel يطابق المبنى والقاعة بمعرّف السجل الرسمي");
check(/timeToMinutes\(String\(startTime\)\) < timeToMinutes\(String\(endTime\)\)/.test(routes), "Excel لا يطبّق نافذة وقتٍ مقلوبة، ويقارن بالدقائق");
check(/filename\*=UTF-8''/.test(routes), "اسم ملف Excel يحمل القسم والفصل والتاريخ");
check(/instructorQuery/.test(routes) && /put\("instructorQuery"/.test(reports), "البحث بالاسم أو الرقم المدني يصل إلى ملف Excel");
check((reports.match(/execCommand\("print"\)/g) || []).length === 1 && /const invokePrint = /.test(reports), "مسار طباعة واحد (invokePrint) لكل الأوراق");
check(!/mobile-desktop-gate/.test(reports) && /query-wide-scroll/.test(reports), "لا بوابة «افتحه من الكمبيوتر»: الشبكتان تُسحبان أفقياً على الهاتف");
const liveStart = reports.indexOf('onLiveSignal(["schedules"]');
const liveHandler = reports.slice(liveStart, reports.indexOf("\n    });", liveStart));
check(/setLiveNudge\(true\)/.test(liveHandler) && !/readScope\(/.test(liveHandler), "الإشارة الحية تُظهر «اضغط للتحديث» ولا تعيد قراءة الصفوف تحت يد القارئ");
check(/takeReportPrefill\(\)/.test(reports) && /schedule-report-prefill/.test(reports), "اختيار البحث العام يصل إلى مرشّحات الاستعلام");
check(/aria-label="بحث بالاسم أو الرقم المدني"/.test(reports), "خانة البحث بالاسم أو الرقم المدني ظاهرة في «المزيد»");
check(/roomPick\.roomId && row\.roomId/.test(reports) && /محجوزة لقسمك/.test(reports), "تفاصيل القاعة تطابق بالمعرّف، وحجز القسم لا يُسمّى «قسماً آخر»");
check(/filters\.building \|\| String\(room\.buildingId/.test(reports), "عدسة القاعات تتقيّد بمرشّح المبنى والقاعة");
check(/printKind === "decision" \? decisionScopeText/.test(reports) && /lens === "balance" \? <small>\{balanceScopeText\}/.test(reports), "ورقة اللوحة وسطر الميزان يسمّيان ما يُعرض فعلاً");
check(/app\.get\("\/api\/reports\/history-points"/.test(routes) && /readsFinalSchedulesOnly\(req\)\) \{ res\.json\(\{ points: \[\] \}\)/.test(routes), "نقاط تاريخ الجدول بنطاق القارئ، ولا تُعرض للعميدين");
check(/briefLoadedKey\.current === briefScopeKey/.test(reports) && /briefLoadedKey\.current = briefScopeKey;/.test(reports), "الموجز يخزّن القراءة المكتملة وحدها، فطيُّه أثناء القراءة لا يعلّقه");
check(/liveHref/.test(routes) && /liveHref/.test(read("src/server/reportStampPage.ts")), "صفحة الختم تفتح نسخة اليوم من التقرير");

console.log(`\nquery center plus audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
