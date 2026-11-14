/**
 * ── ثغراتُ المراجعة الأخيرة: كلُّ حفظٍ يمرّ بالحكم نفسه ─────────────────────────────
 * ١) النقلُ الجماعي (السحب، التراجع، سلسلة الإصلاح) يُحكم بمانعَي الشعبة كالإنشاء والتعديل، والتعديلُ يعيد الحكم
 *    حين يتغيّر المقرّر أو رمزُ الشعبة.
 * ٢) سلسلةُ الإصلاح وبدائلُ أيام المقترح تحكم الشعبةَ كلَّها.
 * ٣) صفحةُ الأستاذ: المخالفاتُ ظاهرةٌ دائماً، وطلبٌ بملاحظة لجدولٍ مخالف يصل القسمَ موسوماً.
 * ٤) عدّادُ «أساتذة في جداولهم مخالفات» يقرأ قواعد «ثبّت» كلَّها.
 * ٥) «استبدال الأستاذ» و«تحويل التدريب» واعتمادُ «مقترح دراسي» تمرّ ببوّابة الاستثناء اللائحي.
 * ٦) طلبُ الأستاذ يُحكم بالشعبة كلِّها عند الإرسال.
 * ٧) تسخينُ الخادم لا يُفرغ المخبأ كلَّه ولا يُعاد قبل دقيقة.
 * خادمٌ حقيقيّ في وضع التجربة على منفذٍ حرّ (helpers/liveServer).
 */
import fs from "fs";
import os from "os";
import path from "path";
import { waitForDemoSeed } from "./helpers/demoSeed";
import { startDemoServer, type LiveServer } from "./helpers/liveServer";

const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "final-gaps-"));
Object.assign(process.env, { DATA_MODE: "demo", NODE_ENV: "development", SCHEDULE_PRIVATE_DIR: privateDir, AUTO_IMPORT_LEGACY_DATA: "false" });

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 700) : ""); }
};
const read = (file: string) => fs.readFileSync(file, "utf8");
const DAYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
const flags = (on: readonly string[]) => Object.fromEntries(DAYS.map(day => [day, on.includes(day)]));

/* ── ١) الحكمُ الواحد على أسبوعٍ افتراضي: الشعبةُ بصفوفها كلِّها ── */
{
  const { Repository } = await import("../src/db/repository");
  await import("../src/server/core/hallBarter");
  const { sectionShapeIssue, keepsSectionShape } = await import("../src/server/core/scheduleRules");
  /* المقرّرُ يُقرأ من المستودع؛ هنا مقرّرٌ بثلاث ساعات بلا قاعدة بيانات. */
  const course = { AdCourseId: 7001, AdCollegeId: 1, AdSectionId: 1, CourseHours: 3, CourseName: "مقرر تجريبي" };
  (Repository as any).getCourseById = async (id: number) => Number(id) === 7001 ? course : null;
  (Repository as any).getScheduleById = async () => null;
  const base = { AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdCourseId: course?.AdCourseId, SCode: "961", AdInstructorId: 1, fstarttime: "14:00", fendtime: "15:20" };
  const sun = { ...base, id: 900001, ...flags(["fsunday"]) }, tue = { ...base, id: 900002, ...flags(["ftuesday"]) };
  const thu = { ...tue, ...flags(["fthursday"]) };
  check(Boolean(course) && await sectionShapeIssue(tue, [sun, tue] as any) === null, "١-أ «أحد 80 + ثلاثاء 80» لمقرّرٍ بثلاث ساعات نمطٌ معتمد");
  const broken = await sectionShapeIssue(thu, [sun, thu] as any);
  check(/ليست نمطاً معتمداً/.test(String(broken)), "١-ب نقلُ الثلاثاء إلى الخميس («أحد + خميس») يُمنع بحكم الشعبة كلِّها", broken);
  const mon = { ...sun, ...flags(["fmonday"]) }, wed = { ...tue, ...flags(["fwednesday"]) };
  check(await sectionShapeIssue(mon, [mon, wed] as any) === null && await sectionShapeIssue(wed, [mon, wed] as any) === null,
    "١-ج نقلُ صفَّي الشعبة معاً إلى «اثنين + أربعاء» يمرّ: يُحكم الأسبوعُ كما سيصير");
  check(keepsSectionShape(sun, { ...sun }) && !keepsSectionShape(sun, { ...sun, SCode: "962" }) && !keepsSectionShape(sun, { ...sun, AdCourseId: Number(sun.AdCourseId) + 1 })
    && !keepsSectionShape(sun, { ...sun, fstarttime: "15:00" }), "١-د «لم يتغيّر» تعني الشكلَ والمقرّرَ ورمزَ الشعبة معاً");
  const review = read("src/server/routes/scheduleReviewRoutes.ts"), writes = read("src/server/core/scheduleWrites.ts");
  const move = review.slice(review.indexOf('app.post("/api/schedules/move-batch"'));
  check(/sectionShapeIssue\(candidate\.row, await weekAfterMove\(/.test(move) && move.indexOf("sectionShapeIssue(") < move.indexOf("Repository.moveSchedulesBatch("),
    "١-هـ النقلُ الجماعي يسأل الحكمَ نفسه قبل الكتابة");
  check(/await sectionShapeIssue\(req\.body/.test(writes) && /await editShapeIssue\(existing,\{\.\.\.req\.body,id\}/.test(writes), "١-و الإنشاءُ والتعديلُ يقرآن الحكمَ نفسه");
  /* تغييرُ الرمز وحده: لا يُمنع بمخالفةٍ كانت قائمة، ويُمنع إن أنشأها. */
  const { editShapeIssue } = await import("../src/server/core/scheduleRules");
  const legacy = { ...base, id: 900010, SCode: "970", ...flags(["fmonday", "fwednesday"]), fendtime: "15:15" };
  (Repository as any).getScheduleById = async (id: number) => Number(id) === 900010 ? legacy : null;
  check(await sectionShapeIssue(legacy, [legacy] as any) !== null && await editShapeIssue(legacy, { ...legacy, SCode: "971" }, [legacy] as any) === null,
    "١-و١ موعدٌ قديم (75د) يبقى قابلاً لتغيير رمز شعبته: المخالفةُ كانت قائمةً ولم يُنشئها التعديل");
  check(/لا توافق النمط المعتمد/.test(String(await editShapeIssue(legacy, { ...legacy, fstarttime: "15:30", fendtime: "16:45" }, [legacy] as any))), "١-و٢ ومن غيّر وقته فبالنمط المعتمد كما كان");
  const joinSun = { ...sun, id: 900020, SCode: "980" }, lone = { ...base, id: 900021, SCode: "981", ...flags(["fthursday"]), fendtime: "16:50" };
  const joined = await editShapeIssue(lone, { ...lone, SCode: "980" }, [joinSun, { ...lone, SCode: "980" }] as any);
  check(await sectionShapeIssue(lone, [joinSun, lone] as any) === null && Boolean(joined), "١-و٣ وصفٌّ سليم يدخل شعبةً فتخالف (ساعاتٌ زائدة أو أيامٌ خارج المكتبة) يُمنع", joined);
  (Repository as any).getScheduleById = async () => null;
}

/* ── ٢) سلسلةُ الإصلاح وبدائلُ المقترح تحكم الشعبةَ كلَّها ── */
{
  const { findRepairChain } = await import("../src/utils/repairChain");
  const { sectionDayVariants } = await import("../src/server/studyProposalEngine");
  const { sectionDaysFitLibrary } = await import("../src/utils/scheduleRegulations");
  const mk = (id: number, courseId: number, scode: string, teacher: number, days: string[], start: string, end: string, hall: string) => ({
    id, AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdCourseId: courseId, AdCourseName: `م${courseId}`, SCode: scode, AdInstructorId: teacher,
    ...flags(days), fstarttime: start, fendtime: end, buildingId: "b1", roomId: `r${hall}`, AdRoomCode: "B1", AdRoomHall: hall, locationStatus: "VERIFIED", rev: 0,
  }) as any;
  const sun = mk(1, 10, "01", 5, ["fsunday"], "08:00", "09:20", "101"), tue = mk(2, 10, "01", 5, ["ftuesday"], "08:00", "09:20", "101");
  /* أستاذُ الشعبة مشغولٌ يوم الثلاثاء كلَّه وأيامَ الأحد كلَّها عدا لقاءه، فلا يبقى لنقل الثلاثاء إلا الخميس — وهو يكسر النمط. */
  const ladder = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
  const end50 = (start: string) => `${start.slice(0, 2)}:50`;
  const clashTue = mk(3, 11, "01", 5, ["ftuesday"], "08:00", "10:50", "102");
  const busy = ladder.flatMap((start, index) => [
    mk(100 + index, 20 + index, "01", 5, ["ftuesday"], start, end50(start), "103"),
  ]).filter(row => row.fstarttime >= "11:00");
  const board = [sun, tue, clashTue, ...busy];
  const hoursOf = (row: any) => Number(row.AdCourseId) === 10 ? 3 : Number(row.AdCourseId) === 11 ? 3 : 1;
  const judged = findRepairChain(tue, board, { courseHours: hoursOf, maxDepth: 1 });
  const moveOf = (chain: any) => chain?.moves.find((item: any) => item.id === 2);
  check(!moveOf(judged) || !moveOf(judged).days.includes("fthursday"), "٢-أ الإصلاحُ لا ينقل ثلاثاءَ «أحد + ثلاثاء» إلى الخميس", judged?.moves.map((item: any) => [item.id, item.days, item.start]));
  const blind = findRepairChain(tue, board, { maxDepth: 1 });
  check(!moveOf(blind) || moveOf(blind).days.join() === "ftuesday", "٢-ب وبلا ساعاتٍ معروفة يبقى اللقاءُ على يومه", blind?.moves.map((item: any) => [item.id, item.days, item.start]));
  /* ونقلُ الأحد إلى الخميس («ثلاثاء + خميس») نمطٌ معتمد، فيُعرض. */
  const sunBusy = ladder.map((start, index) => mk(200 + index, 40 + index, "01", 5, ["fsunday"], start, end50(start), "103")).filter(row => row.fstarttime >= "10:00");
  const sunClash = mk(4, 12, "01", 5, ["fsunday"], "08:00", "09:50", "102");
  const freed = findRepairChain(sun, [sun, tue, sunClash, ...sunBusy], { courseHours: hoursOf, maxDepth: 1 });
  const freedMove = freed?.moves.find((item: any) => item.id === 1);
  check(Boolean(freedMove) && (freedMove.days.join() === "fthursday" || freedMove.days.join() === "fsunday")
    && sectionDaysFitLibrary(3, { ...sun, ...flags(freedMove.days), fstarttime: freedMove.start, fendtime: freedMove.end }, [tue]) === true,
    "٢-ج وما ينقله الإصلاحُ يُبقي الشعبةَ نمطاً معتمداً («ثلاثاء + خميس» يصحّ)", freed?.moves.map((item: any) => [item.id, item.days, item.start]));
  const forTue = sectionDayVariants(tue, 3, [sun]).map(days => days.join("+"));
  const forSun = sectionDayVariants(sun, 3, [tue]).map(days => days.join("+"));
  check(forTue[0] === "ftuesday" && !forTue.includes("fthursday"), "٢-د بدائلُ المقترح: ثلاثاءُ «أحد + ثلاثاء» لا يُعرض له الخميس", forTue);
  check(forSun.includes("fthursday"), "٢-هـ وأحدُها يُعرض له الخميس («ثلاثاء + خميس»)", forSun);
  check(sectionDayVariants(tue, 3, []).map(days => days.join("+")).includes("fthursday"), "٢-و وكتلةُ اليوم الواحد بلا إخوةٍ تبقى على أيّ يوم");
}

/* ── ٦) طلبُ الأستاذ يُحكم بالشعبة كلِّها عند الإرسال ── */
{
  const { judgeRequest } = await import("../src/utils/instructorRequestVerdict");
  const { sectionDaysFitLibrary } = await import("../src/utils/scheduleRegulations");
  const TEACHER = 5;
  const mk = (id: number, courseId: number, days: string[], teacher = TEACHER, scode = "01") => ({
    id, AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdCourseId: courseId, AdCourseName: `م${courseId}`, SCode: scode, AdInstructorId: teacher,
    ...flags(days), fstarttime: "10:00", fendtime: "11:20", buildingId: "b1", roomId: "r1", AdRoomCode: "T", AdRoomHall: "1", locationStatus: "VERIFIED", rev: 0,
  }) as any;
  const context = (rows: any[], courseHours: number) => ({
    instructorId: TEACHER, termId: 1, allRows: rows, instructorRowsAfter: rows.filter(row => row.AdInstructorId === TEACHER),
    courses: new Map([[30, { AdCourseId: 30, CourseHours: courseHours, CourseName: "مقرر الشعبة", CourseCode: "S30" } as any]]), instructors: new Map(),
    knownRoomKeys: ["legacy:T|1"], ladderBlocks: true,
  }) as any;
  const move = (rowId: number, day: string) => ({ rowId, action: "change", AdCourseId: 30, days: [day], start: "10:00", slots: [{ day, start: "10:00", end: "11:20" }] }) as any;
  const sun = mk(1, 30, ["fsunday"]), tue = mk(2, 30, ["ftuesday"]);
  const toThu = judgeRequest(move(2, "fthursday"), context([sun, tue], 3));
  check(!toThu.sendable && toThu.reasons.some(reason => reason.blocking && reason.code === "pattern" && /أيام هذه الشعبة \(الأحد · الخميس\) ليست نمطاً معتمداً/.test(reason.text)),
    "٦-أ نقلُ ثلاثاءِ «أحد 80 + ثلاثاء 80» إلى الخميس يُمنع عند الإرسال بحكم الشعبة كلِّها", toThu.reasons);
  check((toThu.shapes || []).length > 0 && (toThu.shapes || []).every(shape => shape.days.length === 1
    && sectionDaysFitLibrary(3, { ...tue, ...flags(shape.days) }, [sun]) === true), "٦-ب ومعه أيامُ هذا اللقاء التي تُبقي الشعبةَ نمطاً معتمداً", toThu.shapes);
  const sunToThu = judgeRequest(move(1, "fthursday"), context([sun, tue], 3));
  check(!sunToThu.reasons.some(reason => reason.blocking && reason.code === "pattern"), "٦-ج ونقلُ أحدِها إلى الخميس («ثلاثاء + خميس») لا يُمنع بالنمط", sunToThu.reasons);
  /* الشعبةُ لأستاذين: الأخُ عند زميلٍ يُحسب أيضاً. */
  const other = judgeRequest(move(2, "fthursday"), context([mk(1, 30, ["fsunday"], 9), tue], 3));
  check(!other.sendable && other.reasons.some(reason => reason.code === "pattern" && /ليست نمطاً معتمداً/.test(reason.text)), "٦-د وصفُّ الشعبة عند زميلٍ يُحسب: الحكمُ على الشعبة لا على الأستاذ", other.reasons);
  /* لكل مقرّر لا للنظريّ بثلاث وأربع ساعات وحده: مقرّرٌ بساعتين «أحد 50 + ثلاثاء 50». */
  const two = (id: number, day: string) => ({ ...mk(id, 30, [day]), fendtime: "10:50" });
  const twoHour = judgeRequest({ ...move(2, "fmonday"), slots: [{ day: "fmonday", start: "09:30", end: "10:20" }], start: "09:30" }, context([two(1, "fsunday"), two(2, "ftuesday")], 2));
  check(!twoHour.sendable && twoHour.reasons.some(reason => reason.blocking && reason.code === "pattern"), "٦-هـ ولمقرّرٍ بساعتين أيضاً («أحد + اثنين» يُمنع)", twoHour.reasons);
  const kept = judgeRequest({ rowId: 2, action: "change", AdCourseId: 30, days: ["ftuesday"], start: "10:00", slots: [{ day: "ftuesday", start: "10:00", end: "11:20" }] } as any, context([mk(1, 30, ["fthursday"]), tue], 3));
  check(!kept.reasons.some(reason => reason.code === "pattern"), "٦-و وموعدٌ قائم لم يتغيّر شكلُه لا يُرفض بنمط شعبته القديم", kept.reasons);
  const verdictSrc = read("src/utils/instructorRequestVerdict.ts"), inboxRoute = read("src/server/routes/instructorRequestsRoutes.ts");
  check(/sectionDaysFitLibrary\(courseHours, row, \[\.\.\.siblings/.test(verdictSrc) && /regulation: true/.test(inboxRoute) && /patternVerdict\(row,hypothetical\)/.test(read("src/server/core/scheduleRules.ts"))
    && /fits=sectionDaysFitLibrary\(hours,row,siblings\)/.test(read("src/server/core/scheduleRules.ts")), "٦-ز الإرسالُ والتثبيتُ يقرآن الحَكَمَ نفسه (sectionDaysFitLibrary)");
}

/* ── ٧) تسخينُ الخادم: لا يُفرغ المخبأ كلَّه، ولا يُعاد قبل دقيقة ── */
{
  const cache = await import("../src/db/referenceCache");
  let loads = 0;
  const readOnce = () => cache.cachedReference("final-gaps-warm", async () => { loads += 1; return loads; });
  await readOnce();
  const now = Date.now();
  check(cache.expireForWarmup(now) === 0 && await readOnce() === 1 && loads === 1, "٧-أ مدخلٌ حُمّل للتوّ لا يُنهيه التسخين: لا قراءةَ ثانية");
  check(cache.expireForWarmup(now + 150_000) === 0 && loads === 1, "٧-ب ولا بعد دقيقتين ونصف (بقي من عمره أكثر من تسعين ثانية)");
  check(cache.expireForWarmup(now + 215_000) === 1 && await readOnce() === 2 && loads === 2, "٧-ج وما بقي من عمره تسعون ثانية أو أقل يُجدَّد بقراءةٍ واحدة");
  const t0 = Date.now() + 10 * 60_000;
  check(cache.beginWarmup(t0) === true && cache.beginWarmup(t0 + 1_000) === false && cache.beginWarmup(t0 + 59_000) === false && cache.beginWarmup(t0 + 61_000) === true,
    "٧-د نداءُ تسخينٍ قبل مرور دقيقةٍ على سابقه يُتجاهل، وبعدها يمضي");
  const system = read("src/server/routes/systemRoutes.ts");
  check(/req\.query\.warm === "1" && !state\.databaseDown && beginWarmup\(\)/.test(system) && /setTimeout\(resolve, 8000\)/.test(system), "٧-هـ المسارُ يسأل الختمَ قبل أيّ تجديد، وحدُّ الثماني ثوانٍ باقٍ");
  cache.invalidateReference("final-gaps-warm");
}

let server: LiveServer | null = null;
try {
  server = await startDemoServer("final-gaps");
  const BASE = server.base;
  const login = await fetch(BASE + "/api/auth/demo", { method: "POST" });
  const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
  await waitForDemoSeed(BASE, cookie);
  const call = async (method: string, url: string, body?: unknown) => {
    const response = await fetch(BASE + url, { method, headers: { cookie, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json().catch(() => null) as any };
  };
  const scope = { AdCollegeId: 1, AdSectionId: 1, AdTermId: 1 };
  const board = async () => (await call("GET", "/api/schedules?collegeId=1&sectionId=1&termId=1")).body as any[];
  const courses = (await call("GET", "/api/courses?collegeId=1&sectionId=1")).body as any[];
  const people = (await call("GET", "/api/instructors?collegeId=1&sectionId=1&termId=1")).body as any[];
  const placeholder = people.find(person => String(person.AdInstructorName || "").startsWith("هيئة"));
  const rows0 = await board();
  const three = courses.filter(c => Number(c.CourseHours || c.CourseCredit) === 3 && !String(c.CourseCompanionRoomType || "").trim());
  const fresh = three.find(c => !rows0.some(row => Number(row.AdCourseId) === Number(c.AdCourseId))) || three[0];
  const time = { fstarttime: "14:00", fendtime: "15:20" };
  const roomAt = async (days: readonly string[], at = time) => ((await call("POST", "/api/schedules/suggest-slots", { ...scope, ...flags(days), ...at, AdCourseId: fresh?.AdCourseId, roomOnly: true })).body?.slots || [])[0];
  const place = (room: any) => ({ buildingId: room.buildingId, roomId: room.roomId, AdRoomCode: room.room, AdRoomHall: room.hall, locationStatus: "VERIFIED" });

  /* ── ١) السحبُ عبر الخادم ── */
  {
    const room = await roomAt(DAYS);
    check(Boolean(fresh && placeholder && room), "١-ز بيانات التجربة: مقرّرٌ بثلاث ساعات و«هيئة تدريسية» وقاعة حرّة", { fresh: fresh?.AdCourseId, room });
    if (fresh && placeholder && room) {
      const made = (await call("POST", "/api/schedules", { ...scope, ...flags(["fsunday", "ftuesday"]), ...time, AdCourseId: fresh.AdCourseId, SCode: "961", AdInstructorId: placeholder.AdInstructorId, ...place(room) })).body;
      check(Number(made?.id) > 0, "١-ح أُنشئت شعبة «أحد + ثلاثاء 80د»", made);
      const drag = await call("POST", "/api/schedules/move-batch", { strict: false, moves: [{ id: made.id, rev: made.rev, fields: { ...flags(["fsunday", "fthursday"]), ...time } }] });
      const after = (await board()).find(row => Number(row.id) === Number(made.id));
      /* قرار المالك: خارجُ النمط المعتمد تنبيهٌ بتأكيدٍ صريح لا منع — يعود 409 regulation-exception ولا يُكتب شيء قبل التأكيد. */
      check(drag.status === 409 && drag.body?.code === "regulation-exception" && (drag.body?.regulation || []).some((issue: any) => issue.rule === "pattern-days" && /ليست نمطاً معتمداً/.test(issue.text)) && after?.ftuesday === true && after?.fthursday === false,
        "١-ط سحبُ الثلاثاء إلى الخميس يُسأل عنه (استثناءٌ لائحي pattern-days) ولا يُكتب قبل التأكيد", drag);
      const flagged = await call("POST", "/api/schedules/move-batch", { strict: false, regulationException: true, moves: [{ id: made.id, rev: made.rev, fields: { ...flags(["fsunday", "fthursday"]), ...time } }] });
      check(flagged.status === 200, "١-ي وبالتأكيد الصريح يُنقل (ثم يعود لنمطٍ معتمد لمتابعة الفحوص)", flagged);
      const currentRev = async () => (await board()).find(row => Number(row.id) === Number(made.id))?.rev;
      const back = await call("POST", "/api/schedules/move-batch", { strict: false, moves: [{ id: made.id, rev: await currentRev(), fields: { ...flags(["fsunday", "ftuesday"]), ...time } }] });
      check(back.status === 200, "١-ي٢ والعودةُ إلى نمطٍ معتمد لا تُسأل عن شيء", back);
      const short = await call("POST", "/api/schedules/move-batch", { strict: false, moves: [{ id: made.id, rev: await currentRev(), fields: { ...flags(["fsunday"]), ...time } }] });
      check(short.status === 400 && /أقل من ساعات المقرر/.test(String(short.body?.error || "")), "١-ك ونقلٌ ينقص ساعاتِ المقرّر يُرفض", short);
      const valid = await call("POST", "/api/schedules/move-batch", { strict: false, moves: [{ id: made.id, rev: await currentRev(), fields: { ...flags(["fmonday", "fwednesday"]), ...time } }] });
      const moved = (await board()).find(row => Number(row.id) === Number(made.id));
      check(valid.status === 200 && moved?.fmonday === true && moved?.fwednesday === true && moved?.fsunday === false, "١-ل والنقلُ إلى نمطٍ معتمد آخر («اثنين + أربعاء») يمرّ", valid);
      /* تغييرُ رمز الشعبة وحده: يدخل الموعدُ شعبةً قائمة فتزيد ساعاتُها. */
      const other = (await call("POST", "/api/schedules", { ...scope, ...flags(["fsunday", "ftuesday"]), ...time, AdCourseId: fresh.AdCourseId, SCode: "962", AdInstructorId: placeholder.AdInstructorId, ...place(room) })).body;
      check(Number(other?.id) > 0, "١-م شعبةٌ ثانية للمقرّر نفسه", other);
      const merged = await call("PUT", `/api/schedules/${moved.id}`, { ...moved, SCode: "962" });
      check((merged.status === 400 && /الساعات المعتمدة/.test(String(merged.body?.error || ""))) || (merged.status === 409 && merged.body?.code === "regulation-exception" && /ليست نمطاً معتمداً/.test(String(merged.body?.error || ""))), "١-ن تعديلُ رمز الشعبة وحده يُعاد حكمُه (كان يمرّ لأن الشكل لم يتغيّر)", merged);
      /* وموعدٌ قديم بمدّةٍ خارج المكتبة (75د في بيانات التجربة) يُغيَّر رمزُ شعبته ولا يُرفض. */
      const span = (row: any) => Number(row.fendtime.slice(0, 2)) * 60 + Number(row.fendtime.slice(3)) - Number(row.fstarttime.slice(0, 2)) * 60 - Number(row.fstarttime.slice(3));
      /* (صفٌّ يتعارض أستاذُه مع غيره بعد تغيير الرمز يُردّ بالتعارض لا بالنمط — يُجرَّب غيرُه.) */
      const legacyRows = (await board()).filter(row => span(row) === 75).slice(0, 25);
      let legacyRow: any = null, renamed: any = null;
      const refusals: string[] = [];
      for (const row of legacyRows) {
        const answer = await call("PUT", `/api/schedules/${row.id}`, { ...row, SCode: "958" });
        if (answer.status === 200) { legacyRow = row; renamed = answer; break; }
        refusals.push(String(answer.body?.error || answer.status));
      }
      check(legacyRows.length > 0 && renamed?.status === 200 && renamed.body?.SCode === "958" && refusals.every(text => !/النمط|ساعات/.test(text)),
        "١-س موعدٌ قديم (75د) يُغيَّر رمزُ شعبته عبر الخادم ولا يُرفض بالنمط ولا بالساعات", refusals);
      if (renamed?.status === 200) await call("PUT", `/api/schedules/${legacyRow.id}`, { ...renamed.body, SCode: legacyRow.SCode });
      for (const id of [made.id, other?.id]) if (id) await call("DELETE", `/api/schedules/${id}`);
    }
  }

  /* ── ٧) نداءا تسخينٍ متتاليان بلا دخول: كلاهما يجيب الفحصَ، ولا يُفشل الثاني شيئاً ── */
  {
    const first = await fetch(BASE + "/api/health?warm=1"), second = await fetch(BASE + "/api/health?warm=1");
    const bodies = [await first.json(), await second.json()] as any[];
    check(first.status === 200 && second.status === 200 && bodies.every(body => body.ok === true && body.database === "up"), "٧-و نداءا تسخينٍ متتاليان يجيبان الفحصَ كما هو", bodies);
  }

  /* ── ٥) «استبدال الأستاذ» و«تحويل التدريب» يمرّان ببوّابة الاستثناء اللائحي ── */
  {
    const tools = read("src/server/routes/scheduleToolsRoutes.ts"), proposalRoutes = read("src/server/studyProposalRoutes.ts");
    const routeBody = (source: string, head: string) => { const start = source.indexOf(head); const next = source.slice(start + 10).search(/\n\s*app\.(get|post|put|delete)\(/); return source.slice(start, next < 0 ? undefined : start + 10 + next); };
    check(['app.post("/api/schedules/replace-instructor"', 'app.post("/api/schedules/ta-conversion"'].every(head => {
      const body = routeBody(tools, head);
      return body.includes("regulationGate(req)") && body.includes("reassignmentExceptions(") && /Refusal = gate\.refusal\(\)/.test(body) && body.includes("gate.auditSuffix()");
    }), "٥-أ المساران يسألان البوّابةَ نفسها قبل الكتابة ويسجّلان الموافقة");
    const commit = routeBody(proposalRoutes, 'app.post("/api/study-proposals/:id/commit"');
    check(commit.includes("deps.regulationGate(req)") && commit.indexOf("gate.refusal()") < commit.indexOf("Repository.commitStudyProposal(") && commit.includes("gate.auditSuffix()"),
      "٥-ب تثبيتُ «مقترح دراسي» يسأل في الخادم قبل الكتابة (الحيُّ في test:study-proposal-flow)");
    check(["ScheduleTransfer.tsx", "TAConversionPanel.tsx", "proposal/proposalApi.ts"].every(name => read(`src/components/${name}`).includes("settleRegulationException(")), "٥-ج الواجهاتُ الثلاث تفتح الورقةَ نفسها وتعيد الطلب بالموافقة");

    const everything = (await call("GET", "/api/schedules?termId=1")).body as any[];
    const idle = people.filter(person => !String(person.AdInstructorName || "").startsWith("هيئة") && !everything.some(row => Number(row.AdInstructorId) === Number(person.AdInstructorId) && (row.fmonday || row.fwednesday)));
    const [x, y] = idle;
    const mw = ["fmonday", "fwednesday"];
    const slots = [{ fstarttime: "08:00", fendtime: "09:20" }, { fstarttime: "09:30", fendtime: "10:50" }, { fstarttime: "11:00", fendtime: "12:20" }];
    const rooms = await Promise.all(slots.map(slot => roomAt(mw, slot)));
    check(Boolean(x && y && fresh && rooms.every(Boolean)), "٥-د بيانات التجربة: أستاذان بلا مواعيد الاثنين والأربعاء وثلاث قاعات", { idle: idle.length, rooms: rooms.map(Boolean) });
    if (x && y && fresh && rooms.every(Boolean)) {
      const make = async (index: number, teacher: any, code: string) => (await call("POST", "/api/schedules", { ...scope, ...flags(mw), ...slots[index], AdCourseId: fresh.AdCourseId, SCode: code, AdInstructorId: teacher.AdInstructorId, ...place(rooms[index]) })).body;
      const r1 = await make(0, x, "971"), r2 = await make(1, y, "972"), r3 = await make(2, y, "973");
      check([r1, r2, r3].every(row => Number(row?.id) > 0), "٥-هـ ثلاثُ محاضراتٍ طويلة متتالية: الأولى لأستاذٍ والأخريان لآخر", [r1, r2, r3].map(row => row?.error || row?.id));
      const ownerOf = async (id: number) => Number(((await call("GET", "/api/schedules?collegeId=1&sectionId=1&termId=1")).body as any[]).find(row => Number(row.id) === Number(id))?.AdInstructorId);
      const ask = { fromInstructorId: x.AdInstructorId, toInstructorId: y.AdInstructorId, collegeId: 1, sectionId: 1, termId: 1 };
      const preview = await call("POST", "/api/schedules/replace-instructor", { ...ask, commit: false });
      check(preview.status === 200 && (preview.body?.regulation || []).some((issue: any) => issue.article === "م.6/2"), "٥-و المعاينةُ تقول تتالي البديل (م.6/2)", preview.body);
      const refused = await call("POST", "/api/schedules/replace-instructor", { ...ask, commit: true });
      check(refused.status === 409 && refused.body?.code === "regulation-exception" && (refused.body?.regulation || []).some((issue: any) => issue.article === "م.6/2" && !/هذا الموعد/.test(issue.text))
        && await ownerOf(r1.id) === Number(x.AdInstructorId), "٥-ز «استبدال الأستاذ» بلا موافقة: 409 ولا يُكتب شيء", refused);
      const accepted = await call("POST", "/api/schedules/replace-instructor", { ...ask, commit: true, regulationException: true });
      check(accepted.status === 200 && accepted.body?.moved >= 1 && await ownerOf(r1.id) === Number(y.AdInstructorId), "٥-ح وبالموافقة الصريحة يُكتب", accepted);
      const logs = await call("GET", "/api/audit-logs");
      const lines = (Array.isArray(logs.body) ? logs.body : logs.body?.items || logs.body?.logs || logs.body?.rows || []).map((row: any) => String(row.changes || row.details || row.summary || JSON.stringify(row)));
      check(lines.some((line: string) => /استبدال الأستاذ/.test(line) && /استثناء لائحي بتأكيد صريح \([^)]*م\.6\/2/.test(line)), "٥-ط والاستثناءُ في سجل التدقيق", lines.slice(0, 4));

      /* تحويلُ التدريب: الموعدُ يعود لصاحبه، وصاحبُه يصير «هيئة تدريب» ثم يُحوَّل اسمُه إلى الأستاذ نفسه. */
      const back = (await call("GET", "/api/schedules?collegeId=1&sectionId=1&termId=1")).body.find((row: any) => Number(row.id) === Number(r1.id));
      const restored = await call("PUT", `/api/schedules/${r1.id}`, { ...back, AdInstructorId: x.AdInstructorId });
      const asTa = await call("PUT", `/api/instructors/${x.AdInstructorId}`, { ...x, AdInstructorCategory: "ta" });
      const q = "collegeId=1&sectionId=1&termId=1";
      const state = (await call("GET", `/api/schedules/ta-conversion?${q}`)).body;
      check(restored.status === 200 && asTa.status === 200 && state?.allowed && (state.people || []).some((person: any) => Number(person.id) === Number(x.AdInstructorId)), "٥-ي الأستاذُ الأول صار «هيئة تدريب» وله موعد", { restored: restored.status, asTa: asTa.status, state: state?.reason || state?.people });
      const convert = async (extra: Record<string, unknown> = {}) => {
        const response = await fetch(BASE + "/api/schedules/ta-conversion", { method: "POST", headers: { cookie, "Content-Type": "application/json", "x-schedule-confirm": "ta-conversion" },
          body: JSON.stringify({ collegeId: 1, sectionId: 1, termId: 1, previewKey: state.previewKey, targets: { [x.AdInstructorId]: y.AdInstructorId }, ...extra }) });
        return { status: response.status, body: await response.json().catch(() => null) as any };
      };
      const taRefused = await convert();
      check(taRefused.status === 409 && taRefused.body?.code === "regulation-exception" && (taRefused.body?.regulation || []).some((issue: any) => issue.article === "م.6/2")
        && await ownerOf(r1.id) === Number(x.AdInstructorId), "٥-ك «تحويل التدريب» بلا موافقة: 409 ولا يُكتب شيء", taRefused);
      const taDone = await convert({ regulationException: true });
      check(taDone.status === 200 && taDone.body?.changed >= 1 && await ownerOf(r1.id) === Number(y.AdInstructorId), "٥-ل وبالموافقة الصريحة يُحوَّل", taDone);
      await call("PUT", `/api/instructors/${x.AdInstructorId}`, { ...x });
      for (const row of [r1, r2, r3]) await call("DELETE", `/api/schedules/${row.id}`);
    }
  }
} finally {
  await server?.stop();
  fs.rmSync(privateDir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
