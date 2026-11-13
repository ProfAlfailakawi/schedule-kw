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
  check((writes.match(/sectionShapeIssue\(/g) || []).length === 2 && /keepsSectionShape\(existing,req\.body\)\?null:await sectionShapeIssue/.test(writes), "١-و الإنشاءُ والتعديلُ يقرآن الحكمَ نفسه");
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
      check(drag.status === 400 && drag.body?.code === "section-shape" && /ليست نمطاً معتمداً/.test(String(drag.body?.error || "")) && after?.ftuesday === true && after?.fthursday === false,
        "١-ط سحبُ الثلاثاء إلى الخميس يُرفض ولا يُكتب «أحد + خميس»", drag);
      const flagged = await call("POST", "/api/schedules/move-batch", { strict: false, regulationException: true, moves: [{ id: made.id, rev: made.rev, fields: { ...flags(["fsunday", "fthursday"]), ...time } }] });
      check(flagged.status === 400, "١-ي والمانعُ لا يُستثنى منه بموافقة الاستثناء", flagged);
      const short = await call("POST", "/api/schedules/move-batch", { strict: false, moves: [{ id: made.id, rev: made.rev, fields: { ...flags(["fsunday"]), ...time } }] });
      check(short.status === 400 && /أقل من ساعات المقرر/.test(String(short.body?.error || "")), "١-ك ونقلٌ ينقص ساعاتِ المقرّر يُرفض", short);
      const valid = await call("POST", "/api/schedules/move-batch", { strict: false, moves: [{ id: made.id, rev: made.rev, fields: { ...flags(["fmonday", "fwednesday"]), ...time } }] });
      const moved = (await board()).find(row => Number(row.id) === Number(made.id));
      check(valid.status === 200 && moved?.fmonday === true && moved?.fwednesday === true && moved?.fsunday === false, "١-ل والنقلُ إلى نمطٍ معتمد آخر («اثنين + أربعاء») يمرّ", valid);
      /* تغييرُ رمز الشعبة وحده: يدخل الموعدُ شعبةً قائمة فتزيد ساعاتُها. */
      const other = (await call("POST", "/api/schedules", { ...scope, ...flags(["fsunday", "ftuesday"]), ...time, AdCourseId: fresh.AdCourseId, SCode: "962", AdInstructorId: placeholder.AdInstructorId, ...place(room) })).body;
      check(Number(other?.id) > 0, "١-م شعبةٌ ثانية للمقرّر نفسه", other);
      const merged = await call("PUT", `/api/schedules/${moved.id}`, { ...moved, SCode: "962" });
      check(merged.status === 400 && /الساعات المعتمدة|ليست نمطاً معتمداً/.test(String(merged.body?.error || "")), "١-ن تعديلُ رمز الشعبة وحده يُعاد حكمُه (كان يمرّ لأن الشكل لم يتغيّر)", merged);
      for (const id of [made.id, other?.id]) if (id) await call("DELETE", `/api/schedules/${id}`);
    }
  }
} finally {
  await server?.stop();
  fs.rmSync(privateDir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
