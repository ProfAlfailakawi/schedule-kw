/**
 * ── المقرر ذو الطبيعة الخاصة: نظريٌّ وعمليٌّ في شعبةٍ واحدة ───────────────────────────
 *   P  الحكمُ النقيّ (src/utils/specialNature.ts): مدد اللائحة من المكتبة، واللقاءُ العمليُّ لازم، والدور في عرض اللقاء.
 *   L  خادمٌ حقيقي في وضع التجربة:
 *        - المقرر: تُفعَّل الطبيعةُ الخاصة (ساعاتٌ ≥ 2)، ولا تُرفع وعليها لقاءاتٌ عملية.
 *        - الشعبة: POST /api/schedules/special-section تحفظ لقاءاتها معاً أو لا شيء، وأحدٌ·ثلاثاءٌ ساعةٌ وخميسٌ ساعتان تُقبل.
 *        - الرفض: بلا لقاءٍ عملي، مدةٌ خارج اللائحة، ساعاتٌ ناقصة، شعبةٌ مكرّرة، مقررٌ عادي — ولا يُكتب شيء.
 *        - صفٌّ واحد من مقررٍ خاص لا يُحفظ ناقصاً من النموذج المعتاد؛ والعلامةُ على مقررٍ عاديٍّ مرفوضة.
 *        - تبديلُ العلامة: لا تبقى شعبةٌ مكتملةٌ بلا عملي؛ والنقلُ بلا علامةٍ في الطلب يُبقيها.
 *        - مقررٌ عاديٌّ بساعاته نفسها لم يتغيّر فيه شيء.
 */
import { startDemoServer, type LiveServer } from "./helpers/liveServer";
import { waitForDemoSeed } from "./helpers/demoSeed";
import { allowedLengthsForDays, allowedMeetingLengths, meetingLengthIssue, meetingRole, meetingTeachingHours, patternHoursOf, practicalRequiredIssue, PRACTICAL_REQUIRED_TEXT, sameRole, specialSameDayIssue, specialSplitIssue, SPECIAL_MIN_HOURS } from "../src/utils/specialNature";
import { regulationExceptionAccepted, regulationExceptionAudit } from "../src/utils/regulationException";
import { teachingHoursByInstructor } from "../src/utils/teachingLoad";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 700) : ""); }
};

/* ── P: الحكمُ النقيّ ── */
{
  const course = { CourseSpecialNature: true, CourseHours: 4 };
  const plain = { CourseHours: 4 };
  check(SPECIAL_MIN_HOURS === 2, "P1 أقلُّ ساعاتٍ لطبيعةٍ خاصة: ساعتان");
  check([50, 80, 110, 170, 230, 290].every(length => allowedMeetingLengths("fthursday").includes(length) || length === 80 && allowedMeetingLengths("fthursday").length > 0), "P2 مددُ الخميس من المكتبة: 50 و110 و170…", allowedMeetingLengths("fthursday"));
  check(allowedMeetingLengths("fsunday").includes(50) && allowedMeetingLengths("fsunday").includes(110) && allowedMeetingLengths("fmonday").includes(80), "P3 الأحدُ 50/110 والاثنين 80", { sun: allowedMeetingLengths("fsunday"), mon: allowedMeetingLengths("fmonday") });
  check(allowedLengthsForDays(["fsunday", "ftuesday"]).includes(50) && !allowedLengthsForDays(["fsunday", "ftuesday"]).includes(75), "P4 الصفُّ متعدد الأيام يشترك في طولٍ معتمدٍ لكل أيامه");
  check(meetingLengthIssue(["fthursday"], "10:00", "11:50") === "" && meetingLengthIssue(["fsunday", "ftuesday"], "08:00", "08:50") === "", "P5 الخميس 110 والأحد·الثلاثاء 50 توافق اللائحة");
  check(/75 دقيقة/.test(meetingLengthIssue(["fthursday"], "10:00", "11:15")) && meetingLengthIssue(["fthursday"], "10:00", "11:15").includes("50"), "P6 الخميس 75 يُرفض بسطرٍ يذكر المدد المعتمدة");
  const theory = { fsunday: true, ftuesday: true, fstarttime: "08:00", fendtime: "08:50" };
  const lab = { fthursday: true, fstarttime: "10:00", fendtime: "11:50", practical: true };
  const labless = { fthursday: true, fstarttime: "10:00", fendtime: "11:50" };
  check(practicalRequiredIssue(theory, [labless], course) === PRACTICAL_REQUIRED_TEXT, "P7 شعبةٌ مكتملة (100+100) بلا عملي: يُطلب تحديده");
  check(practicalRequiredIssue(theory, [lab], course) === "", "P8 مع لقاءٍ عملي لا يُطلب شيء");
  check(practicalRequiredIssue(theory, [], course) === "", "P9 شعبةٌ ناقصة الساعات: السطرُ للنقص لا للعملي");
  check(practicalRequiredIssue(theory, [labless], plain) === "", "P10 مقررٌ عادي: لا يُطلب شيء أبداً");
  check(meetingRole(lab, course) === "practical" && meetingRole(theory, course) === "theory" && meetingRole(lab, plain) === "", "P11 الدور للعرض: عملي ونظري، وما ليس خاصاً بلا دور");
  check(patternHoursOf(course) === 0 && patternHoursOf(plain) === 4, "P13 ساعاتُ الأنماط: المقررُ الخاص بلا نمط (0)، والعاديُّ بساعاته");
  check(sameRole(theory, labless) && !sameRole(theory, lab), "P12 الدورُ نفسه نظريٌّ مع نظري، وعمليٌّ مع عملي");

  /* رد الدكتورة 2026-11-19: كلُّ جزءٍ لقاءٌ واحدٌ متصل في يومٍ غير يوم الآخر، والنصابُ بساعات كلِّ عضو. */
  const sunTheory = { fsunday: true, fstarttime: "08:00", fendtime: "09:50" };
  const tueLab = { ftuesday: true, fstarttime: "10:00", fendtime: "11:50", practical: true };
  const sunLab = { fsunday: true, fstarttime: "10:00", fendtime: "11:50", practical: true };
  check(specialSplitIssue(sunTheory, [tueLab]) === "" && specialSplitIssue(tueLab, [sunTheory]) === "", "P14 الأحد نظري ساعتان + الثلاثاء عملي ساعتان: لا تجزئة");
  check(/النظري مجزّأ على يومين \(الأحد · الثلاثاء\)/.test(specialSplitIssue(theory, [lab])) && specialSplitIssue(lab, [theory]) === "", "P15 النظري ساعةً الأحد وساعةً الثلاثاء: «مجزّأ على يومين» للنظري وحده", specialSplitIssue(theory, [lab]));
  check(/العملي مجزّأ/.test(specialSplitIssue(tueLab, [sunTheory, { fthursday: true, fstarttime: "10:00", fendtime: "11:50", practical: true }])), "P16 عمليٌّ في لقاءين (الثلاثاء والخميس): مجزّأ");
  check(/النظري مجزّأ على لقاءين \(الأحد 08:00 · الأحد 10:00\)/.test(specialSplitIssue(sunTheory, [{ fsunday: true, fstarttime: "10:00", fendtime: "10:50" }, tueLab])), "P16b لقاءان منفصلان للنظري في اليوم نفسه: مجزّأ أيضاً", specialSplitIssue(sunTheory, [{ fsunday: true, fstarttime: "10:00", fendtime: "10:50" }, tueLab]));
  check(/في يومٍ واحد \(الأحد\)/.test(specialSameDayIssue(sunTheory, [sunLab])) && specialSameDayIssue(sunTheory, [tueLab]) === "", "P17 النظري والعملي يوم الأحد معاً: يُقال، وفي يومين لا شيء");
  check(meetingTeachingHours(sunTheory) === 2 && meetingTeachingHours(theory) === 2 && meetingTeachingHours({ fmonday: true, fwednesday: true, fstarttime: "08:00", fendtime: "09:20" }) === 3, "P18 ساعاتُ اللقاء التدريسية: 110د=2، و50د×يومين=2، و80د×يومين=3");
  const loadRows = [{ ...sunTheory, id: 1, AdInstructorId: 7, AdCourseId: 900, SCode: "01", AdCollegeId: 1, AdSectionId: 1 }, { ...tueLab, id: 2, AdInstructorId: 29, AdCourseId: 900, SCode: "01", AdCollegeId: 1, AdSectionId: 1 },
    { fsunday: true, ftuesday: true, fstarttime: "12:00", fendtime: "13:50", id: 3, AdInstructorId: 7, AdCourseId: 901, SCode: "01", AdCollegeId: 1, AdSectionId: 1 }];
  const load = teachingHoursByInstructor(loadRows as any, new Map([[900, 4], [901, 4]]), new Set([900]));
  check(load.get(7) === 6 && load.get(29) === 2, "P19 النصاب: نظري المقرر الخاص ساعتان لعضو هيئة التدريس، وعمليُّه ساعتان للمدرّب، والمقررُ العادي بساعاته", Object.fromEntries(load));
  const splitIssue = { rule: "pattern-days" as const, article: "نظري + عملي", text: "x", needsReason: true };
  check(!regulationExceptionAccepted({ regulationException: true }, [splitIssue]) && !regulationExceptionAccepted({ regulationException: true, regulationExceptionReason: " " }, [splitIssue])
    && regulationExceptionAccepted({ regulationException: true, regulationExceptionReason: "طبيعة المختبر" }, [splitIssue])
    && regulationExceptionAccepted({ regulationException: true }, [{ ...splitIssue, needsReason: undefined }]), "P20 استثناءُ التجزئة لا يُقبل بلا سبب، وغيرُه بالتأكيد وحده");
  check(/السبب: طبيعة المختبر$/.test(regulationExceptionAudit([splitIssue], { regulationExceptionReason: "طبيعة   المختبر" })), "P21 السببُ يُكتب في سطر التدقيق");
}

/* ── L: خادمٌ حقيقي ── */
let server: LiveServer | null = null;
try {
  server = await startDemoServer("special-nature");
  const BASE = server.base;
  const login = await fetch(BASE + "/api/auth/demo", { method: "POST" });
  const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
  await waitForDemoSeed(BASE, cookie);
  const call = async (method: string, url: string, body?: unknown) => {
    const response = await fetch(BASE + url, { method, headers: { cookie, origin: BASE, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json().catch(() => null) as any };
  };
  const scope = { AdCollegeId: 1, AdSectionId: 1, AdTermId: 1 };
  const board = async () => (await call("GET", "/api/schedules?collegeId=1&sectionId=1&termId=1")).body as any[];
  const people = (await call("GET", "/api/instructors?collegeId=1&sectionId=1&termId=1")).body as any[];
  const suffix = String(Date.now()).slice(-6);

  const mkCourse = async (name: string, extra: Record<string, unknown> = {}) => (await call("POST", "/api/courses", {
    AdCollegeId: 1, AdSectionId: 1, CourseCode: `SPN${suffix}${name}`, CourseName: `اختبار طبيعة خاصة ${name}`, CourseCredit: 3, CourseHours: 4, MaxStudent: 30, ...extra })).body;
  const special = await mkCourse("S", { CourseSpecialNature: true });
  const plain = await mkCourse("P");
  check(Number(special?.AdCourseId) > 0 && special.CourseSpecialNature === true && !plain?.CourseSpecialNature, "L1 مقررٌ بطبيعةٍ خاصة يُنشأ بعلامته، والعاديُّ بلا علامة", { special, plain });
  const listed = ((await call("GET", "/api/courses?collegeId=1&sectionId=1")).body as any[]).find(course => course.AdCourseId === special?.AdCourseId);
  check(listed?.CourseSpecialNature === true, "L2 قائمةُ المقررات تحمل العلامة", listed);
  check((await call("POST", "/api/courses", { AdCollegeId: 1, AdSectionId: 1, CourseCode: `SPN${suffix}1H`, CourseName: "ساعةٌ واحدة", CourseCredit: 1, CourseHours: 1, MaxStudent: 30, CourseSpecialNature: true })).status === 400, "L3 الطبيعةُ الخاصة لمقررٍ بساعةٍ واحدة تُرفض");

  const busy = (personId: number, rows: any[], days: string[], from: string, to: string) => rows.some(row => Number(row.AdInstructorId) === personId && days.some(day => row[day]) && row.fstarttime < to && row.fendtime > from);
  const rows0 = await board();
  const teacher = people.find(person => !String(person.AdInstructorName || "").startsWith("هيئة") && person.AdInstructorCategory !== "ta"
    && !busy(Number(person.AdInstructorId), rows0, ["fsunday", "ftuesday", "fthursday"], "07:00", "20:00"));
  /* مدرّبُ العملي: عضوُ هيئة تدريب (TA) خالٍ يوم الثلاثاء. */
  const trainer = people.find(person => person.AdInstructorCategory === "ta" && !busy(Number(person.AdInstructorId), rows0, ["ftuesday"], "07:00", "20:00"))
    || people.find(person => !String(person.AdInstructorName || "").startsWith("هيئة") && person.AdInstructorId !== teacher?.AdInstructorId && !busy(Number(person.AdInstructorId), rows0, ["ftuesday"], "07:00", "20:00"));
  /* الشكلُ المعتاد: الأحد نظري ساعتان، والثلاثاء عملي ساعتان. */
  const theoryTime = { fstarttime: "08:00", fendtime: "09:50" }, labTime = { fstarttime: "10:00", fendtime: "11:50" };
  const theoryDays = { fsunday: true, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false };
  const labDays = { fsunday: false, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false };
  const splitDays = { fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false };
  const slotRooms = async (days: any, time: any, courseId: number) => ((await call("POST", "/api/schedules/suggest-slots", { ...scope, ...days, ...time, AdCourseId: courseId, roomOnly: true })).body?.slots || []) as any[];
  const theoryRooms = await slotRooms(theoryDays, theoryTime, special.AdCourseId);
  const labRooms = await slotRooms(labDays, labTime, special.AdCourseId);
  check(Boolean(teacher) && Boolean(trainer) && theoryRooms.length >= 1 && labRooms.length >= 2, "L4 بيانات التجربة: أستاذٌ ومدرّبٌ خاليان وقاعاتٌ حرّة للنظري والعملي", { teacher: Boolean(teacher), trainer: Boolean(trainer), theory: theoryRooms.length, lab: labRooms.length });
  if (!teacher || !trainer || !theoryRooms.length || labRooms.length < 2) throw new Error("بيانات التجربة لا تكفي");

  const place = (room: any) => ({ buildingId: room.buildingId, roomId: room.roomId, AdRoomCode: room.room, AdRoomHall: room.hall, locationStatus: "VERIFIED" });
  const theoryMeeting = { ...theoryDays, ...theoryTime, ...place(theoryRooms[0]) };
  const labMeeting = { ...labDays, ...labTime, practical: true, AdInstructorId: trainer.AdInstructorId, ...place(labRooms.find((room: any) => room.roomId !== theoryRooms[0].roomId) || labRooms[0]) };
  const batch = (extra: Record<string, unknown>) => call("POST", "/api/schedules/special-section", { ...scope, AdCourseId: special.AdCourseId, SCode: "991", AdInstructorId: teacher.AdInstructorId, ...extra });
  const count = async () => (await board()).filter(row => row.AdCourseId === special.AdCourseId).length;

  /* الرفض: لا يُكتب شيء */
  const noLab = await batch({ meetings: [theoryMeeting, { ...labMeeting, practical: false }] });
  check(noLab.status === 400 && /العملي/.test(noLab.body?.error || "") && await count() === 0, "L5 بلا لقاءٍ عملي: يُرفض ولا يُكتب شيء", noLab);
  const under = await batch({ meetings: [theoryMeeting, { ...labMeeting, fendtime: "10:50" }] });
  check(under.status === 400 && /ساعات الشعبة/.test(under.body?.error || "") && await count() === 0, "L6 ساعاتٌ ناقصة (110+50 من 200): يُرفض ولا يُكتب شيء", under);
  const badLength = await batch({ meetings: [theoryMeeting, { ...labMeeting, fendtime: "11:15" }] });
  check(badLength.status === 400 && /75 دقيقة/.test(badLength.body?.error || "") && await count() === 0, "L7 مدةٌ خارج اللائحة (75د): يُرفض ولا يُكتب شيء", badLength);
  const onPlain = await call("POST", "/api/schedules/special-section", { ...scope, AdCourseId: plain.AdCourseId, SCode: "991", AdInstructorId: teacher.AdInstructorId, meetings: [theoryMeeting, labMeeting] });
  check(onPlain.status === 400 && /ليس بطبيعةٍ خاصة/.test(onPlain.body?.error || ""), "L8 مقررٌ عادي لا يمرّ من هذا المسار", onPlain);

  /* النظريُّ والعمليُّ في يومٍ واحد: مانع (الأحد 8–10 نظري، والأحد 10–12 عملي). */
  const sameDay = await batch({ meetings: [theoryMeeting, { ...labMeeting, ...theoryDays }] });
  check(sameDay.status === 400 && /يومٍ واحد/.test(sameDay.body?.error || "") && await count() === 0, "L8b النظري والعملي في يومٍ واحد: يُرفض ولا يُكتب شيء", sameDay);

  /* التجزئة (النظري ساعةً الأحد وساعةً الثلاثاء): استثناءٌ لا يُقبل بلا سبب */
  /* النظري الأحد·الخميس ساعةً كلَّ يوم، والعملي الثلاثاء كما هو. */
  const sunThu = { fsunday: true, fmonday: false, ftuesday: false, fwednesday: false, fthursday: true };
  const splitRoom = (await slotRooms(sunThu, { fstarttime: "08:00", fendtime: "08:50" }, special.AdCourseId))[0] || theoryRooms[0];
  const splitMeeting = { ...sunThu, fstarttime: "08:00", fendtime: "08:50", ...place(splitRoom) };
  const splitLab = labMeeting;
  const splitAsk = await call("POST", "/api/schedules/special-section", { ...scope, AdCourseId: special.AdCourseId, SCode: "996", AdInstructorId: teacher.AdInstructorId, meetings: [splitMeeting, splitLab] });
  const splitIssue = (splitAsk.body?.regulation || []).find((issue: any) => /مجزّأ/.test(issue.text));
  check(splitAsk.status === 409 && splitAsk.body?.code === "regulation-exception" && splitIssue?.needsReason === true && await count() === 0, "L9a التجزئة تُسأل في ورقة الاستثناء وتطلب سبباً، ولا يُكتب شيء", splitAsk);
  const splitNoReason = await call("POST", "/api/schedules/special-section", { ...scope, AdCourseId: special.AdCourseId, SCode: "996", AdInstructorId: teacher.AdInstructorId, meetings: [splitMeeting, splitLab], regulationException: true });
  check(splitNoReason.status === 409 && await count() === 0, "L9b التأكيدُ بلا سبب لا يكفي", splitNoReason);
  const splitSaved = await call("POST", "/api/schedules/special-section", { ...scope, AdCourseId: special.AdCourseId, SCode: "996", AdInstructorId: teacher.AdInstructorId, meetings: [splitMeeting, splitLab], regulationException: true, regulationExceptionReason: "طبيعة المختبر في القسم" });
  check(splitSaved.status === 201 && (splitSaved.body?.rows || []).length === 2, "L9c وبسببٍ مكتوب تُحفظ الشعبة استثناءً", splitSaved);
  for (const step of splitSaved.body?.undo || []) await call(step.method, step.url);

  /* القبول: الأحد نظري ساعتان (عضو هيئة التدريس)، والثلاثاء عملي ساعتان (عضو هيئة التدريب) — بلا سؤال */
  const saved = await batch({ meetings: [theoryMeeting, labMeeting] });
  const rows = (saved.body?.rows || []) as any[];
  check(saved.status === 201 && rows.length === 2, "L9 الأحد نظري 110 + الثلاثاء عملي 110: تُحفظ الشعبة كلها بلا استثناء", saved);
  const theoryRow = rows.find(row => row.fsunday), labRow = rows.find(row => row.ftuesday);
  check(theoryRow && !theoryRow.practical && labRow?.practical === true, "L10 العلامةُ على لقاء الثلاثاء وحده", rows.map(row => ({ id: row.id, practical: row.practical })));
  check(Number(theoryRow?.AdInstructorId) === Number(teacher.AdInstructorId) && Number(labRow?.AdInstructorId) === Number(trainer.AdInstructorId), "L10b النظري لأستاذه والعملي لمدرّبه", rows.map(row => [row.practical, row.AdInstructorId]));
  const onBoard = (await board()).filter(row => row.AdCourseId === special.AdCourseId);
  check(onBoard.length === 2 && onBoard.find(row => row.ftuesday)?.practical === true, "L11 الجدولُ يعيد العلامة", onBoard);
  const again = await batch({ meetings: [theoryMeeting, labMeeting] });
  check(again.status === 409 && again.body?.code === "section-exists" && /\d{3}/.test(again.body?.freshSection || ""), "L12 الشعبةُ المكرّرة: 409 برقمٍ حرٍّ تالٍ", again);

  /* النموذج المعتاد */
  const lone = await call("POST", "/api/schedules", { ...scope, AdCourseId: special.AdCourseId, SCode: "992", AdInstructorId: teacher.AdInstructorId, ...theoryDays, ...theoryTime, ...place(theoryRooms[0]) });
  check(lone.status === 400 && /ساعات الشعبة/.test(lone.body?.error || ""), "L13 صفٌّ واحدٌ من مقررٍ خاص لا يُحفظ ناقصاً من النموذج المعتاد", lone);
  const flagPlain = await call("POST", "/api/schedules", { ...scope, AdCourseId: plain.AdCourseId, SCode: "993", AdInstructorId: teacher.AdInstructorId, ...theoryDays, ...theoryTime, practical: true, ...place(theoryRooms[0]) });
  check(flagPlain.status === 400 && /طبيعةٍ خاصة/.test(flagPlain.body?.error || ""), "L14 علامةُ العملي على مقررٍ عاديٍّ مرفوضة", flagPlain);

  /* تبديل العلامة والنقل */
  const bodyOf = (row: any, patch: Record<string, unknown> = {}) => ({ ...scope, AdCourseId: row.AdCourseId, SCode: row.SCode, AdInstructorId: row.AdInstructorId,
    fsunday: !!row.fsunday, fmonday: !!row.fmonday, ftuesday: !!row.ftuesday, fwednesday: !!row.fwednesday, fthursday: !!row.fthursday,
    fstarttime: row.fstarttime, fendtime: row.fendtime, AdRoomCode: row.AdRoomCode, AdRoomHall: row.AdRoomHall, buildingId: row.buildingId, roomId: row.roomId,
    locationStatus: row.locationStatus || "VERIFIED", rev: row.rev, ...patch });
  const unflag = await call("PUT", `/api/schedules/${labRow.id}`, bodyOf(labRow, { practical: false }));
  check(unflag.status === 400 && /العملي/.test(unflag.body?.error || ""), "L15 رفعُ العلامة عن اللقاء الوحيد: تبقى الشعبةُ بلا عملي فيُرفض", unflag);
  const keep = await call("PUT", `/api/schedules/${labRow.id}`, bodyOf(labRow, { AdRoomCode: labRow.AdRoomCode }));
  check(keep.status === 200 && keep.body?.practical === true, "L16 تعديلٌ بلا علامةٍ في الطلب (قاعة/نقل) يُبقي العلامة", keep);
  const moved = await call("PUT", `/api/schedules/${labRow.id}`, bodyOf(keep.body, { fstarttime: "16:00", fendtime: "17:50" }));
  check(moved.status === 200 && moved.body?.practical === true, "L16b نقلُ اللقاء العملي الوحيد (الوقت) بلا علامةٍ في الطلب يمرّ ويُبقيها — لا يُحكم الصفُّ بدونها", moved);
  /* تبديلُ الدور وحده يُحكم كتغيير الشكل: النظريُّ الأحد يصير عملياً فيصير العمليُّ لقاءين (الأحد والثلاثاء) → استثناءٌ بسبب. */
  const flipAsk = await call("PUT", `/api/schedules/${theoryRow.id}`, bodyOf(theoryRow, { practical: true }));
  check(flipAsk.status === 409 && (flipAsk.body?.regulation || []).some((issue: any) => issue.needsReason && /العملي مجزّأ/.test(issue.text)), "L17a تبديلُ النظري إلى عملي يجزّئ العملي: يُسأل بسبب", flipAsk);
  const flipTheory = await call("PUT", `/api/schedules/${theoryRow.id}`, bodyOf(theoryRow, { practical: true, regulationException: true, regulationExceptionReason: "تجربة" }));
  check(flipTheory.status === 200 && flipTheory.body?.practical === true, "L17 وبسببٍ مكتوب يُعلَّم اللقاءُ النظريُّ عملياً", flipTheory);
  const flipBack = await call("PUT", `/api/schedules/${theoryRow.id}`, bodyOf(flipTheory.body, { practical: false }));
  check(flipBack.status === 200 && flipBack.body?.practical !== true, "L18 ويُرفع عنه بعد ذلك", flipBack);

  /* رفعُ الطبيعة الخاصة */
  const unset = await call("PUT", `/api/courses/${special.AdCourseId}`, { AdCollegeId: 1, AdSectionId: 1, CourseCode: special.CourseCode, CourseName: special.CourseName, CourseCredit: 3, CourseHours: 4, MaxStudent: 30, CourseSpecialNature: false });
  check(unset.status === 409 && unset.body?.code === "special-nature-in-use", "L19 لا تُرفع الطبيعةُ الخاصة وعليها لقاءٌ عملي", unset);
  const keepCourse = await call("PUT", `/api/courses/${special.AdCourseId}`, { AdCollegeId: 1, AdSectionId: 1, CourseCode: special.CourseCode, CourseName: special.CourseName, CourseCredit: 3, CourseHours: 4, MaxStudent: 31 });
  check(keepCourse.status === 200 && keepCourse.body?.CourseSpecialNature === true, "L20 تعديلُ المقرر بلا ذكر العلامة يُبقيها", keepCourse);

  /* التراجع */
  for (const step of saved.body?.undo || []) await call(step.method, step.url);
  check(await count() === 0, "L21 خطواتُ التراجع تزيل الشعبة كلَّها");
  const unsetNow = await call("PUT", `/api/courses/${special.AdCourseId}`, { AdCollegeId: 1, AdSectionId: 1, CourseCode: special.CourseCode, CourseName: special.CourseName, CourseCredit: 3, CourseHours: 4, MaxStudent: 31, CourseSpecialNature: false });
  check(unsetNow.status === 200 && !unsetNow.body?.CourseSpecialNature, "L22 وبعد زوال اللقاءات تُرفع الطبيعةُ الخاصة", unsetNow);

  /* المقرر العادي لم يتغيّر: أحد·ثلاثاء بساعتين متتاليتين (نمطٌ معتمدٌ لأربع ساعات) يُقبل، وأحد·ثلاثاء 50 وحده ناقص */
  const ordinaryShort = await call("POST", "/api/schedules", { ...scope, AdCourseId: plain.AdCourseId, SCode: "994", AdInstructorId: teacher.AdInstructorId, ...splitDays, fstarttime: "08:00", fendtime: "08:50", ...place(theoryRooms[0]) });
  check(ordinaryShort.status === 400 && /ساعات الشعبة/.test(ordinaryShort.body?.error || ""), "L23 مقررٌ عاديٌّ: الأحد·الثلاثاء 50 لأربع ساعات ما زال ناقصاً كما كان", ordinaryShort);
  const ordinaryFull = await call("POST", "/api/schedules", { ...scope, AdCourseId: plain.AdCourseId, SCode: "995", AdInstructorId: teacher.AdInstructorId, ...splitDays, fstarttime: "08:00", fendtime: "09:50", ...place(theoryRooms[0]) });
  check(ordinaryFull.status === 201, "L24 مقررٌ عاديٌّ: الأحد·الثلاثاء 110 (نمطٌ معتمد) يُحفظ كما كان", ordinaryFull);
  if (ordinaryFull.body?.id) await call("DELETE", `/api/schedules/${ordinaryFull.body.id}`);

  /* ── البيانات الافتراضية: «تصميم وإنتاج المجسمات والعرائس» 0109334 مقررٌ خاص بشعبةٍ واحدة ── */
  const D5 = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"];
  const seeded = ((await call("GET", "/api/courses?collegeId=1&sectionId=1")).body as any[]).find(item => item.CourseCode === "0109334");
  const seedRows = (await board()).filter(row => row.AdCourseId === seeded?.AdCourseId);
  const seedLab = seedRows.find(row => row.practical === true), seedTheory = seedRows.find(row => row.practical !== true);
  const seedTrainer = people.find(person => Number(person.AdInstructorId) === Number(seedLab?.AdInstructorId));
  check(seeded?.CourseSpecialNature === true && seedRows.length === 2 && seedLab?.ftuesday && !seedLab.fsunday && seedTheory?.fsunday && !seedTheory.ftuesday
    && meetingTeachingHours(seedLab) === 2 && meetingTeachingHours(seedTheory) === 2
    && seedLab.AdInstructorId !== seedTheory.AdInstructorId && seedTrainer?.AdInstructorCategory === "ta", "L26 الديمو: مقررٌ خاص بشعبة (الأحد نظري ساعتان لعضو هيئة التدريس، الثلاثاء عملي ساعتان لعضو هيئة التدريب)", seedRows);

  /* ── موافقةُ اللجنة تفتح شعبة المقرر الخاص بلقاءيها: مقررٌ بأربع ساعات له طلبٌ ينتظر قرار اللجنة يُعلَّم خاصاً ── */
  const allCourses = (await call("GET", "/api/courses?collegeId=1&sectionId=1")).body as any[];
  const before = await call("GET", "/api/student-registration?collegeId=1&sectionId=1&termId=1");
  let target: any = null;
  for (const row of before.body?.rows || []) for (const course of row.courses || []) {
    const meta = allCourses.find(item => item.AdCourseId === course.id);
    if (!target && !course.settled && !course.readOnly && Number(meta?.CourseHours) === 4) target = meta;
  }
  if (target) await call("PUT", `/api/courses/${target.AdCourseId}`, { AdCollegeId: 1, AdSectionId: 1, CourseCode: target.CourseCode, CourseName: target.CourseName,
    CourseCredit: target.CourseCredit, CourseHours: target.CourseHours, MaxStudent: target.MaxStudent, CourseSpecialNature: true });
  const cases = (await call("GET", "/api/student-registration?collegeId=1&sectionId=1&termId=1")).body;
  let pendingNeed: any = null, pendingCourse: any = null;
  for (const row of cases?.rows || []) for (const course of row.courses || []) if (course.id === target?.AdCourseId && !course.settled) { pendingNeed = row; pendingCourse = course; }
  check(Boolean(pendingCourse?.special?.CourseSpecialNature), "L27 كشفُ التسجيل يعلّم المقرر الخاص لطلبٍ ينتظر قرار اللجنة", pendingCourse);
  if (pendingNeed) {
    const freeAt = (days: string[], from: string, to: string) => people.find(person => !String(person.AdInstructorName || "").startsWith("هيئة")
      && !(rows0 as any[]).concat(seedRows).some(row => Number(row.AdInstructorId) === Number(person.AdInstructorId) && days.some(day => row[day]) && row.fstarttime < to && row.fendtime > from));
    const opener = freeAt(["fsunday", "ftuesday", "fthursday"], "12:00", "14:50");
    const single = await call("POST", `/api/student-registration/${pendingNeed.id}/course-state`, { courseId: target.AdCourseId, state: "awaiting-registration",
      openSection: { days: ["fsunday"], start: "12:00", end: "12:50", instructorId: opener?.AdInstructorId } });
    check(single.status === 400 && single.body?.code === "special-needs-meetings", "L28 لقاءٌ واحدٌ ناقص لمقررٍ خاص يُرفض بسببه، ولا يُسجَّل القرار", single);
    const roomAt = async (days: Record<string, boolean>, fstarttime: string, fendtime: string) => ((await call("POST", "/api/schedules/suggest-slots", { ...scope, ...days, fstarttime, fendtime, AdCourseId: target.AdCourseId, roomOnly: true })).body?.slots || [])[0];
    /* الأحد نظري ساعتان والخميس عملي ساعتان: «الأحد·الخميس» مقبولٌ كما يجري عند القسم (رد الدكتورة 2026-11-19). */
    const sun = { fsunday: true, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false }, thu = { fsunday: false, fmonday: false, ftuesday: false, fwednesday: false, fthursday: true };
    const tRoom = await roomAt(sun, "12:00", "13:50"), lRoom = await roomAt(thu, "12:00", "13:50");
    const meetings = [{ ...sun, fstarttime: "12:00", fendtime: "13:50", ...place(tRoom) }, { ...thu, fstarttime: "12:00", fendtime: "13:50", practical: true, ...place(lRoom) }];
    const dry = await call("POST", "/api/schedules/special-section", { ...scope, AdCourseId: target.AdCourseId, AdInstructorId: opener?.AdInstructorId, meetings, dryRun: true });
    check(dry.status === 200 && /^\d{3}$/.test(String(dry.body?.sectionCode || "")), "L29 الفحصُ الجافّ بلا رقم شعبة يقترح الرقمَ الحرّ التالي", dry);
    const approve = await call("POST", `/api/student-registration/${pendingNeed.id}/course-state`, { courseId: target.AdCourseId, state: "awaiting-registration", openSection: { meetings, instructorId: opener?.AdInstructorId } });
    const opened = (await board()).filter(row => row.AdCourseId === target.AdCourseId && row.origin?.kind === "student-case");
    check(approve.status === 200 && Boolean(approve.body?.opened?.sectionCode) && opened.length === 2 && opened.filter(row => row.practical === true).length === 1
      && opened.every(row => row.SCode === approve.body.opened.sectionCode), "L30 الموافقة تفتح الشعبة بلقاءيها (مصدرهما «حالة طالب») وتسجّل القرار برقمها", { approve, opened: opened.map(row => [row.SCode, D5.filter(day => row[day]), row.practical]) });
  }
  {
    const { specialSectionComplete } = await import("../src/utils/specialNature");
    const course4 = { CourseSpecialNature: true, CourseHours: 4, CourseCredit: 3 };
    const theoryOnly = { fsunday: true, ftuesday: true, fstarttime: "12:00", fendtime: "12:50" };
    const lab = { fthursday: true, fstarttime: "13:00", fendtime: "14:50", practical: true };
    const routeSource = (await import("node:fs")).readFileSync("src/server/routes/studentRegistrationRoutes.ts", "utf8");
    check(!specialSectionComplete([theoryOnly], course4) && !specialSectionComplete([lab], course4) && specialSectionComplete([theoryOnly, lab], course4)
      && /!specialSectionComplete\(openedRows, owner\)/.test(routeSource), "L31 بقايا شعبةٍ خاصة ناقصة من محاولةٍ سابقة لا تُعتمد عند إعادة الموافقة");
  }
  const builderSource = (await import("node:fs")).readFileSync("src/components/SpecialSectionBuilder.tsx", "utf8");
  check(/CompanionFacilityPicker/.test(builderSource) && /companionRoomId: place\.companionRoomId/.test(builderSource) && /needsCompanion/.test(builderSource), "L25 المنشئ يدعم المرفق المرافق الإلزامي ويحمل معرّفه في كل لقاء");
} catch (error: any) {
  failed++; console.log(`\x1b[31m✗ ${error?.stack || error}\x1b[0m`);
} finally {
  await server?.stop();
}
console.log(`\n${passed} نجح، ${failed} فشل`);
process.exit(failed ? 1 : 0);
