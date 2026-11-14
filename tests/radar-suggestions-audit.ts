/**
 * ── «الرادار يقترح الحل وينفذه» ─────────────────────────────────────────────
 *
 *  U  المنطقُ النقيّ (src/utils/radarSuggestion.ts) على أسبوعٍ صغير: المرشّحاتُ من محرّك فتح الشعب نفسِه،
 *     مرتّبةً بمن يستطيعها من المنتظرين، والسببُ في سطرٍ حين لا اقتراح.
 *  S  التوصيل: المسارُ بحارس مسارات الرادار، والشاشةُ تعتمد من مسار الحفظ نفسه وتقيس بـ«ماذا لو؟»،
 *     والزرُّ لمن يكتب الجدول وحده، ولقطةُ جدول المسارات تعرف المسار.
 */
import fs from "node:fs";
import path from "node:path";
import type { AdCourse, AdInstructor, FSchedule, MasterRoom } from "../src/types";
import { canTake, NO_SUGGESTION_LINE, placementSlots, radarCandidates, roomsOfRightType, waitingStudentsFor, waitingDemand, type WaitingStudent } from "../src/utils/radarSuggestion";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

/* ── U: أسبوعٌ صغير ── */
const course: AdCourse = { AdCourseId: 1, AdCollegeId: 1, AdSectionId: 11, CourseCode: "A1", CourseName: "مقرر أ", CourseCredit: 3, CourseHours: 3, MaxStudent: 30 };
const other: AdCourse = { AdCourseId: 2, AdCollegeId: 1, AdSectionId: 11, CourseCode: "B1", CourseName: "مقرر ب", CourseCredit: 3, CourseHours: 3, MaxStudent: 30 };
const weekRow: FSchedule = {
  id: 2, AdCollegeId: 1, AdSectionId: 11, AdTermId: 7, AdCourseId: 2, AdCourseName: other.CourseName, SCode: "501", AdInstructorId: 2,
  fsunday: true, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false, fstarttime: "08:00", fendtime: "09:00",
  AdRoomCode: "R2", AdRoomHall: "1", buildingId: "b", roomId: "r2", locationStatus: "VERIFIED",
};
const pastRow: FSchedule = { ...weekRow, id: 1, AdTermId: 6, AdCourseId: 1, AdCourseName: course.CourseName, SCode: "501", AdInstructorId: 1, AdRoomCode: "R1", roomId: "r1" };
const instructor = (id: number, AdInstructorLoad?: number): AdInstructor => ({ AdInstructorId: id, AdInstructorName: `أستاذ ${id}`, AdInstructorCivil: "", AdInstructorMobile: "", AdInstructorLoad });
const room = (id: string, capacity?: number, roomType?: string): MasterRoom => ({
  id, buildingId: "b", buildingCode: "B1", canonicalCode: id.toUpperCase(), capacity, roomType, active: true,
  aliases: [], collegeIds: [1], sectionIds: [11], shared: false, historicalUsageCount: 1,
  confidence: "CONFIRMED", source: "TEST", adminVerified: true, evidence: [], auditHistory: [],
} as MasterRoom);
/* سُلّمُ القسم: صباحٌ وظهر وعصر كلَّ يوم؛ والمحرّكُ يقصّه على سُلّم اللائحة لمدّة المقرر. */
const ladder = ["08:00", "09:30", "11:00", "12:30", "14:00", "15:30", "17:00"];
const rhythm: any = { forDay: () => ({ days: [], ladder, breakMinutes: 0, breakAgreement: 0, durationMinutes: 75, durationRange: [75, 75], durationAgreement: 100, pairs: 0, lectures: 0 }), patterns: [{ durationMinutes: 75 }], learnedFrom: { rows: 1, terms: 1 } };
const student = (constraints: WaitingStudent["constraints"] = {}, busy: WaitingStudent["busy"] = []): WaitingStudent => ({ constraints, busy, wants: [] });
const base = (waiting: WaitingStudent[], over: Partial<Parameters<typeof radarCandidates>[0]> = {}) => radarCandidates({
  course, openSections: 0, waiting, week: [weekRow], universe: [weekRow], courses: [course, other], instructors: [instructor(1, 12), instructor(2, 12)],
  history: [pastRow], rhythm, doorway: 0, rooms: [room("r1", 30)], termId: 7, ...over,
});

{
  /* ثلاثةٌ لا يريدون الصباح، وواحدٌ مشغولٌ كلَّ الأيام بعد الظهر: الوقتُ الأفضل بعد الظهر. */
  const afternoonBusy = [0, 1, 2, 3, 4].map(day => ({ day, start: 12 * 60, end: 20 * 60 }));
  const waiting = [student({ noMorning: true }), student({ noMorning: true }), student({ noMorning: true }), student({}, afternoonBusy)];
  const got = base(waiting);
  const top = got.candidates[0];
  check(got.candidates.length > 1 && !got.reason, `U المحرّك يعيد أكثر من وقتٍ نظيف للمقرر (${got.candidates.length})`);
  check(got.candidates.every((item, i, all) => item.fits > 0 && (i === 0 || all[i - 1].fits >= item.fits)), "U المرشّحات مرتّبة بعدد من يستطيعها، ولا مرشّح لا يأخذه منتظرٌ واحد");
  check(Boolean(top) && top.fits === 3 && placementSlots(top.placement).every(slot => slot.start >= 12 * 60), "U الوقتُ المختار يأخذه أكثرُ المنتظرين (بعد الظهر: ثلاثةٌ من أربعة)");
  check(Boolean(top) && top.placement.instructorId === 1 && top.placement.roomId === "r1" && /^\d{3}$/.test(top.placement.sectionCode), "U الاقتراح: أستاذٌ درّس المقرر وله نصاب، وقاعةٌ موثّقة، ورقمُ شعبة يقبله الحفظ");
  /* قسمٌ آخر يشغل القاعة نفسها الأحد 08:00: المحرّكُ يرى أسبوعَ الفصل كلَّه. */
  const blocker: FSchedule = { ...weekRow, id: 3, AdSectionId: 12, AdCourseId: 9, AdInstructorId: 9, AdRoomCode: "R1", roomId: "r1" };
  const busyRoom = base([student()], { universe: [weekRow, blocker] });
  check(busyRoom.candidates.length > 0 && busyRoom.candidates.every(item => !(item.placement.day === "fsunday" && item.placement.start === "08:00")), "U لا مرشّح فوق قاعةٍ يشغلها قسمٌ آخر في الوقت نفسه");
}
{
  const s = student({ noMorning: true });
  check(!canTake(s, [{ day: 0, start: 9 * 60, end: 10 * 60 + 15 }]) && canTake(s, [{ day: 0, start: 14 * 60, end: 15 * 60 + 15 }]), "U قيد «لا صباح» يُطبَّق كما تطبّقه المحاكاة");
  const busy = student({}, [{ day: 2, start: 10 * 60, end: 11 * 60 }]);
  check(!canTake(busy, [{ day: 2, start: 10 * 60 + 30, end: 11 * 60 + 45 }]) && canTake(busy, [{ day: 3, start: 10 * 60 + 30, end: 11 * 60 + 45 }]), "U لا يُعدّ من يتقاطع الوقتُ مع مقررٍ وجد له مقعداً");
}
{
  const waiting = [student()];
  check(base(waiting, { instructors: [instructor(1, 0), instructor(2, 12)] }).reason === "no-instructor", "U لا أستاذ درّسه بنصابٍ متاح ← «no-instructor»");
  check(base(waiting, { rooms: [] }).reason === "no-room", "U لا قاعة موثّقة تتّسع ← «no-room»");
  check(base([student({ noMorning: true, noAfternoon: true })]).reason === "no-slot", "U كل الأوقات الخالية لا تناسب المنتظرين ← «no-slot» ولا اقتراح مكسور");
  check(base(waiting, { course: { ...course, MaxStudent: 0 } }).reason === "no-ceiling", "U سعةٌ غير مسجّلة ← «no-ceiling»");
  check(base([]).reason === "no-waiting", "U لا منتظرين ← «no-waiting»");
  check(base(waiting, { offerable: () => false }).reason === "not-offerable", "U حالة الطرح تمنع ← «not-offerable»");
  check(["no-instructor", "no-room", "no-slot"].every(key => NO_SUGGESTION_LINE[key as keyof typeof NO_SUGGESTION_LINE].length > 10), "U لكل سببٍ سطرٌ واحد يُقال");
  check(base(waiting, { rhythm: null }).candidates.length === 0, "U بلا سُلّمٍ للقسم لا يُخترع وقت");
}
{
  const lab = room("r1", 30, "lab"), hall = room("r9", 40, "classroom"), blocked = { ...room("r8", 40, "lab"), bookingPolicy: "blocked" as const };
  const picked = roomsOfRightType([lab, hall, blocked], [pastRow], 1, 11).map(r => r.id);
  check(JSON.stringify(picked) === JSON.stringify(["r1"]), "U نوعُ القاعة نوعُ ما دُرّس فيه المقرر، والمحجوبةُ لا تُقترح");
  check(roomsOfRightType([lab, hall], [], 1, 11).length === 2, "U مقررٌ بلا تاريخ قاعات: كلُّ الأنواع ممكنة");
}
{
  const tickets: any = { tickets: [
    { fp: "a", plans: [{ items: [{ offeringId: "o2" }] }], unmet: [{ courseId: 1, reason: "full" }] },
    { fp: "b", plans: [{ items: [] }], unmet: [{ courseId: 1, reason: "prereq" }] },
    { fp: "c", plans: [{ items: [] }], unmet: [{ courseId: 1, reason: "not-offered" }] },
  ] };
  const students: any[] = [
    { fp: "a", planId: "p", passed: [], wishes: { targetUnits: 15, courseIds: [1, 2, 3], constraints: { noMorning: true } } },
    { fp: "b", planId: "p", passed: [], wishes: { targetUnits: 15, courseIds: [1], constraints: {} } },
    { fp: "c", planId: "p", passed: [], wishes: { targetUnits: 15, courseIds: [1, 3], constraints: {} } },
  ];
  const waiting = waitingStudentsFor(1, students, tickets, new Map([["o2", [{ day: 1, start: 600, end: 675 }]]]));
  check(waiting.length === 2 && waiting[0].busy.length === 1 && waiting[0].constraints.noMorning === true, "U المنتظرون: من امتلأت شعبه أو لا شعبة له فقط، بمواعيد ما وجد له مقعداً");
  check(!JSON.stringify(waiting).includes("\"fp\""), "U لا يخرج معرّفُ طالبٍ من المنتظرين");
  const pairs = waitingDemand(course, 31, [...waiting, student(), { ...student(), wants: [3] }]).pairs;
  check(pairs.length === 1 && pairs[0].b === 3 && pairs[0].shared === 3, "U الدفعةُ: مقررٌ يريده ثلاثةُ منتظرين فأكثر لا يُقاطَع (عتبةُ المحرّك)");
}

/* ── S: التوصيل ── */
{
  const server = read("src/server/radarSuggestions.ts");
  const routes = read("src/server/simulationRoutes.ts");
  check(/app\.get\("\/api\/simulation\/suggestions", deps\.requireAuth,/.test(server), "S المسارُ GET بحارس requireAuth كجيرانه");
  check(/deps\.isPowerUser\(req\) /.test(server.replace(/power = deps\.isPowerUser\(req\);/, "deps.isPowerUser(req) ")) && /deps\.isScopeAllowed\(req, collegeId, sectionId\)/.test(server), "S نطاقُ القارئ على قسم المقرر، والمنتقي يضيّق ولا يوسّع");
  check(/registerRadarSuggestionRoutes\(app, \{/.test(routes) && /loadInput: radarInput/.test(routes) && /const radarInput = \(term: any, run: any\) => inputMemo\.get\(/.test(routes), "S يُسجَّل من مسارات الرادار ويقرأ ذاكرة «ماذا لو؟» نفسها (radarInput يشاركها اللوحةُ الحيّة)");
  check(!/\.(set|save|update|delete|apply)\w*\(/.test(server.replace(/Repository\.get\w+|res\.setHeader|params\.set|\.set\(/g, "")), "S المسارُ لا يكتب شيئاً");
  check(/pickDoorTerm/.test(server) && /asked !== Number\(term\.AdTermId\)/.test(server), "S فصلُ الباب وحده: لا اقتراح لفصلٍ سابق");
  const ui = read("src/components/RadarSuggestions.tsx");
  check(/postScheduleProposal\(\{ \.\.\.body, origin: \{ kind: "radar"/.test(ui) && /<ApplyProposal/.test(ui), "S «اعتمد الشعبة» من مسار حفظ الجدول نفسه (ApplyProposal ← apply-proposal)");
  check((ui.match(/postWhatIf\(body\)/g) || []).length >= 2, "S الأثرُ قبل الاعتماد من «ماذا لو؟» (للقارئ وفي التأكيد)");
  check(/canSchedule && \(canAdopt \|\| adopted\)/.test(ui) && /يعتمدها من يحرّر جدول/.test(ui), "S الزرُّ لمن يكتب الجدول؛ وغيرُه يقرأ ويعرف من يعتمده");
  check(/label="اعتمد الشعبة"/.test(ui) && /aria-label=\{`ماذا يتغيّر للطلبة/.test(ui) && /aria-label=\{`اقتراح «/.test(ui), "S أسماءٌ يقرؤها قارئ الشاشة للأزرار وللبطاقة");
  check(/لا اقتراح: \{row\.reasonLine/.test(ui), "S بلا اقتراح: السببُ في سطر");
  const page = read("src/components/RegistrationRehearsal.tsx");
  check(/<RadarSuggestions termId=\{data\.term\.id\} ranAt=\{r\.ranAt\}[^>]*canSchedule=\{canSchedule\} onChanged=\{\(\) => void load\(\)\}/.test(page), "S الرادار يركّبه تحت البطاقات بصلاحية الكتابة نفسها، ويعيد القراءة بعد الاعتماد");
  const app = read("src/App.tsx");
  check(/<RegistrationRehearsal [^\n]*canSchedule=\{hasPerm\(7\) && !sessionRole\.viewerOnly/.test(app), "S canSchedule = صلاحيةُ الجدول وليس للقراءة فقط");
  const css = read("src/styles/19-beauty-admin-registration.css");
  check(/\.rs-list\{[^}]*minmax\(min\(300px,100%\),1fr\)/.test(css) && /@media \(max-width:480px\)\{\.rs-panel/.test(css), "S عرضُ الهاتف (390px): بطاقةٌ واحدة بعرض الشاشة وزرٌّ بعرضها");
  const table = JSON.parse(read("tests/fixtures/server-route-table.json")).layers as Array<{ path: string; methods: string[] }>;
  check(table.some(row => row.path === "/api/simulation/suggestions" && row.methods.join() === "get"), "S لقطةُ جدول المسارات تعرف المسار الجديد");
  const srs = read("docs/srs/modules/11-stu.json");
  check(srs.includes("GET /api/simulation/suggestions") && srs.includes("src/server/radarSuggestions.ts"), "S متطلبُ الوثيقة يصف المسار ويدّعي الملف");
}

console.log(`\n${passed} نجح، ${failed} فشل`);
process.exit(failed ? 1 : 0);
