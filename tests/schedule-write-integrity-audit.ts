/**
 * ── سلامةُ كتابة «الموعد»: السباقُ، وإعادةُ الحفظ، والمدخلات، والإصدار، والأداء ──────────
 * خادمٌ حقيقي في وضع التجربة (المنفذ 4411)، وبعده فحصٌ داخل العملية للأداء ولتجاوز حجز قسمٍ آخر:
 *   - N طلباتٍ متزامنة على القاعة نفسها (أو الأستاذ نفسه) والساعة نفسها ⇒ واحدٌ 201 والباقي 409 `slot-taken`
 *     (والخادمُ يفتح نافذةَ السباق عمداً بـSCHEDULE_TEST_DELAY_AFTER_CHECK_MS، فيفشل الاختبارُ على الكود القديم)،
 *   - تعديلان متزامنان إلى القاعة نفسها ⇒ واحدٌ 200 والآخر 409 `slot-taken`،
 *   - إعادةُ حفظ موعدٍ متعارضٍ كما هو تمرّ (A6)، وتغييرُ حقلٍ آخر يمرّ، والتعارضُ الجديد يُمنع،
 *   - سقفُ ساعات الشعبة بالمفتاح القانوني (901 = 0901)،
 *   - رقمُ الشعبة حتى 6 خانات، وأعلامُ الأيام صارمة، ونصُّ المصدر نصٌّ مقصوص، و`origin` المزوَّر يُهمل،
 *   - الحذفُ بإصدار، وحذفُ غير الموجود 404، وتعديلٌ بلا إصدارٍ من المتصفح يُردّ،
 *   - سقفُ قراءات المستودع في الفحص، وتجاوزُ حجزِ قسمٍ آخر يُبقي طلبَه كما هو.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { waitForDemoSeed } from "./helpers/demoSeed";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ""); }
};

const PORT = 4411;
const BASE = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-write-integrity-"));
let child: ReturnType<typeof spawn> | null = null;
const stop = () => { try { if (child?.pid) process.kill(-child.pid); } catch { /* already gone */ } };
const up = async () => { try { return (await fetch(BASE + "/api/public/me/state")).ok; } catch { return false; } };

try {
  if (await up()) throw new Error(`المنفذ ${PORT} مشغول بخادمٍ آخر`);
  child = spawn("npx", ["tsx", "server.ts"], {
    env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", PORT: String(PORT), SCHEDULE_PRIVATE_DIR: dir, SCHEDULE_TEST_DELAY_AFTER_CHECK_MS: "150" },
    stdio: "ignore", detached: true,
  });
  let ready = false;
  for (let i = 0; i < 120 && !ready; i += 1) { ready = await up(); if (!ready) await new Promise(r => setTimeout(r, 1000)); }
  if (!ready) throw new Error("الخادم لم يبدأ");

  const login = await fetch(BASE + "/api/auth/demo", { method: "POST" });
  const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
  await waitForDemoSeed(BASE, cookie);
  const call = async (method: string, url: string, body?: unknown) => {
    const response = await fetch(BASE + url, { method, headers: { cookie, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json().catch(() => null) as any };
  };
  const board = async () => (await call("GET", "/api/schedules?collegeId=1&sectionId=1&termId=1")).body as any[];

  const scope = { AdCollegeId: 1, AdSectionId: 1, AdTermId: 1 };
  const SUT = { fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: true };
  const courses = (await call("GET", "/api/courses?collegeId=1&sectionId=1")).body as any[];
  const course3 = courses.filter(course => Number(course.CourseHours) === 3).map(course => Number(course.AdCourseId));
  const people = ((await call("GET", "/api/instructors?collegeId=1&sectionId=1&termId=1")).body as any[]).filter(person => !String(person.AdInstructorName || "").startsWith("هيئة"));
  const rows0 = await board();
  check(course3.length >= 3 && people.length >= 8, "B0 بيانات التجربة تكفي (مقررات 3 ساعات وأساتذة)", { c: course3.length, p: people.length });

  /** قاعاتٌ حرّة في خانةٍ ما. */
  const freeRooms = async (days: any, start: string, end: string, courseId = course3[0]) =>
    ((await call("POST", "/api/schedules/suggest-slots", { ...scope, ...days, fstarttime: start, fendtime: end, AdCourseId: courseId, roomOnly: true })).body?.slots || []) as any[];
  const roomBody = (room: any) => ({ buildingId: room.buildingId, roomId: room.roomId, AdRoomCode: room.room, AdRoomHall: room.hall, locationStatus: "VERIFIED" });
  /** أساتذةٌ بلا محاضرةٍ في الخانة. */
  const busyAt = (personId: number, rows: any[], start: string, end: string) => rows.some(row => Number(row.AdInstructorId) === personId && (row.fsunday || row.ftuesday || row.fthursday) && row.fstarttime < end && row.fendtime > start);
  const idle = (start: string, end: string) => people.filter(person => !busyAt(Number(person.AdInstructorId), rows0, start, end));
  const mk = (n: number, overrides: any) => ({ ...scope, ...SUT, AdCourseId: course3[0], SCode: String(n), fstarttime: "18:00", fendtime: "18:50", ...overrides });

  /* ═══ 1. سباق الإنشاء: القاعةُ نفسها ═══ */
  {
    const rooms = await freeRooms(SUT, "18:00", "18:50");
    const teachers = idle("18:00", "18:50");
    check(rooms.length >= 2 && teachers.length >= 6, "R0 قاعتان حرّتان وستة أساتذة بلا محاضرة 18:00", { r: rooms.length, t: teachers.length });
    const N = 4;
    const results = await Promise.all(Array.from({ length: N }, (_, i) =>
      call("POST", "/api/schedules", mk(961 + i, { AdInstructorId: teachers[i].AdInstructorId, ...roomBody(rooms[0]) }))));
    const created = results.filter(result => result.status === 201), lost = results.filter(result => result.status === 409);
    check(created.length === 1 && lost.length === N - 1, "R1 القاعةُ نفسها والساعةُ نفسها: واحدٌ 201 والباقي 409", results.map(result => result.status));
    check(lost.every(result => result.body?.code === "slot-taken" && Array.isArray(result.body?.issues) && result.body.issues.length > 0 && typeof result.body.error === "string"),
      "R2 الخاسرون: code=slot-taken مع issues ورسالة", lost.map(result => result.body));
    const inRoom = (await board()).filter(row => String(row.roomId) === String(rooms[0].roomId) && row.fstarttime === "18:00");
    check(inRoom.length === 1, "R3 صفٌّ واحدٌ فقط في الجدول بعد السباق", inRoom.length);

    /* ═══ 2. سباق الإنشاء: الأستاذُ نفسه في قاعتين ═══ */
    const same = await Promise.all([rooms[1], rooms[2] || rooms[1]].slice(0, 2).map((room, i) =>
      call("POST", "/api/schedules", mk(971 + i, { AdInstructorId: teachers[5].AdInstructorId, ...roomBody(room) }))));
    check(rooms.length >= 3 ? same.filter(result => result.status === 201).length === 1 && same.filter(result => result.status === 409 && result.body?.code === "slot-taken").length === 1
      : same.some(result => result.status === 201), "R4 الأستاذُ نفسه في قاعتين بالساعة نفسها: واحدٌ 201 والآخر 409 slot-taken", same.map(result => [result.status, result.body?.code]));
  }

  /* ═══ 3. سباق التعديل: صفّان إلى القاعة نفسها ═══ */
  {
    const rooms = await freeRooms(SUT, "19:00", "19:50");
    const teachers = idle("19:00", "19:50");
    const a = (await call("POST", "/api/schedules", mk(981, { fstarttime: "19:00", fendtime: "19:50", AdInstructorId: teachers[0].AdInstructorId, ...roomBody(rooms[0]) }))).body;
    const b = (await call("POST", "/api/schedules", mk(982, { fstarttime: "19:00", fendtime: "19:50", AdInstructorId: teachers[1].AdInstructorId, ...roomBody(rooms[1]) }))).body;
    check(Number(a?.id) > 0 && Number(b?.id) > 0, "U0 صفّان في قاعتين مختلفتين", [a, b]);
    const edit = (row: any, room: any) => call("PUT", `/api/schedules/${row.id}`, { ...scope, ...SUT, AdCourseId: row.AdCourseId, SCode: row.SCode, AdInstructorId: row.AdInstructorId, fstarttime: row.fstarttime, fendtime: row.fendtime, rev: row.rev, ...roomBody(room) });
    const results = await Promise.all([edit(a, rooms[2]), edit(b, rooms[2])]);
    check(results.filter(result => result.status === 200).length === 1 && results.filter(result => result.status === 409 && result.body?.code === "slot-taken").length === 1,
      "U1 تعديلان متزامنان إلى القاعة نفسها: واحدٌ 200 والآخر 409 slot-taken", results.map(result => [result.status, result.body?.code]));

    /* ═══ 4. التعارضُ الجديد يُمنع بعد الكتابة العاديّة ═══ */
    const loserId = results[0].status === 200 ? b.id : a.id;
    const loser = (await board()).find(row => row.id === loserId)!;
    const clash = await call("PUT", `/api/schedules/${loser.id}`, { ...scope, ...SUT, AdCourseId: loser.AdCourseId, SCode: loser.SCode, AdInstructorId: loser.AdInstructorId, fstarttime: loser.fstarttime, fendtime: loser.fendtime, rev: loser.rev, ...roomBody(rooms[2]) });
    check(clash.status === 409 && !String(clash.body?.code || "").startsWith("rev"), "A6c تعارضٌ جديد (قاعةٌ مشغولة) يُمنع في التعديل", [clash.status, clash.body?.error]);
  }

  /* ═══ 5. A6: إعادةُ حفظ موعدٍ متعارضٍ كما هو ═══ */
  {
    const rows = await board();
    const withClash: any[] = [];
    for (const row of rows.slice(0, 20)) {
      const verdict = await call("POST", "/api/schedules/check-conflicts", { ...row, excludeId: row.id });
      if ((verdict.body?.conflicts || []).some((item: any) => item.type === "instructor" && item.preexisting)) withClash.push(row);
    }
    check(withClash.length >= 1, "A0 في بيانات التجربة صفٌّ يتعارض أستاذُه أصلاً", withClash.length);
    const row = withClash[0];
    const body = (extra: any = {}) => { const copy: any = { ...row, ...extra }; delete copy.id; delete copy.AdCourseName; delete copy.CourseNameSnapshot; return copy; };
    const verdict = await call("POST", "/api/schedules/check-conflicts", { ...row, excludeId: row.id });
    check(!(verdict.body.conflicts || []).some((item: any) => item.severity === "high" && !item.soft), "A1 فحصُ موانع الحفظ لا يعدّ المتعارضَ القائم مانعاً (ملاحظة لا تمنع)", verdict.body.conflicts);
    const resave = await call("PUT", `/api/schedules/${row.id}`, body());
    check(resave.status === 200, "A2 إعادةُ حفظ الصفّ كما هو تمرّ (200)", resave.body);
    const rooms = await freeRooms({ fsunday: !!row.fsunday, fmonday: !!row.fmonday, ftuesday: !!row.ftuesday, fwednesday: !!row.fwednesday, fthursday: !!row.fthursday }, row.fstarttime, row.fendtime, Number(row.AdCourseId));
    const newRoom = rooms.find(room => String(room.roomId) !== String(row.roomId));
    if (newRoom) {
      const current = (await board()).find(item => item.id === row.id)!;
      const moved = await call("PUT", `/api/schedules/${row.id}`, body({ rev: current.rev, ...roomBody(newRoom) }));
      check(moved.status === 200 && String(moved.body?.roomId) === String(newRoom.roomId), "A3 تغييرُ القاعة وحدها يمرّ والتعارضُ القديم للأستاذ يبقى ملاحظة", [moved.status, moved.body?.error]);
    } else check(false, "A3 قاعةٌ حرّة لصفّ A6");
  }

  /* ═══ 6. سقفُ الساعات بالمفتاح القانوني ═══ */
  {
    const block = { fsunday: true, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false };
    const tuesday = { fsunday: false, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false };
    const rooms = await freeRooms(block, "13:00", "15:50");
    const teachers = idle("13:00", "15:50");
    const first = await call("POST", "/api/schedules", mk(901, { ...block, fstarttime: "13:00", fendtime: "15:50", AdCourseId: course3[1], AdInstructorId: teachers[0].AdInstructorId, ...roomBody(rooms[0]) }));
    check(first.status === 201, "H0 الشعبة 901 بكتلةٍ واحدة 170 دقيقة تُنشأ", first.body);
    const second = await call("POST", "/api/schedules", mk(901, { SCode: "0901", ...tuesday, fstarttime: "13:00", fendtime: "15:50", AdCourseId: course3[1], AdInstructorId: teachers[1].AdInstructorId, ...roomBody(rooms[1]) }));
    check(second.status === 400 || second.status === 409, "H1 كتلةٌ ثانية 170 دقيقة بالرمز «0901» تُرفض (الشعبة نفسها)", [second.status, second.body?.error]);
    const third = await call("POST", "/api/schedules", mk(955, { ...tuesday, fstarttime: "13:00", fendtime: "15:50", AdCourseId: course3[1], AdInstructorId: teachers[1].AdInstructorId, ...roomBody(rooms[1]) }));
    check(third.status === 201, "H2 الرمزُ 955 (شعبةٌ أخرى) يمرّ — الرفضُ للشعبة لا للمقرر", [third.status, third.body?.error]);
  }

  /* ═══ 7. المدخلات ═══ */
  {
    const rooms = await freeRooms(SUT, "17:00", "17:50");
    const teachers = idle("17:00", "17:50");
    const base = (extra: any) => mk(990, { fstarttime: "17:00", fendtime: "17:50", AdInstructorId: teachers[0].AdInstructorId, ...roomBody(rooms[0]), ...extra });
    const longCode = await call("POST", "/api/schedules", base({ SCode: "1".repeat(300) }));
    check(longCode.status === 400, "V1 رقمُ شعبةٍ من 300 خانة يُرفض", [longCode.status, longCode.body?.error]);
    const strings = await call("POST", "/api/schedules", base({ fsunday: "false", ftuesday: "false", fthursday: "false" }));
    check(strings.status === 400, "V2 السلسلة «false» ليست يوماً مختاراً (لا أيام ⇒ 400)", [strings.status, strings.body]);
    const garbage = await call("POST", "/api/schedules", base({ fsunday: "maybe" }));
    check(garbage.status === 400, "V3 قيمةُ يومٍ غير صالحة تُرفض", [garbage.status, garbage.body]);
    const typed = await call("POST", "/api/schedules", base({ sourceBuildingText: 12345 }));
    check(typed.status === 400, "V4 نصُّ المصدر الرقمي يُرفض", [typed.status, typed.body]);
    const forged = await call("POST", "/api/schedules", base({ SCode: "991", sourceRoomText: "  " + "ب".repeat(300) + "  ", origin: { kind: "instructor-request", refId: "forged-id", note: "x" } }));
    check(forged.status === 201 && String(forged.body?.sourceRoomText || "").length === 80, "V5 نصُّ المصدر يُقصّ إلى 80", [forged.status, String(forged.body?.sourceRoomText || "").length]);
    check(forged.status === 201 && forged.body?.origin === undefined, "V6 `origin` من المتصفح يُهمل (لا مصدرَ مزوَّراً)", forged.body?.origin);
    const asNumbers = await call("POST", "/api/schedules", base({ SCode: "992", AdInstructorId: teachers[1].AdInstructorId, ...roomBody(rooms[1]), fsunday: 1, ftuesday: 1, fthursday: 1, fmonday: 0, fwednesday: "0" }));
    check(asNumbers.status === 201 && asNumbers.body?.fsunday === true && asNumbers.body?.fmonday === false, "V7 1/0 تُقرأ أعلاماً صريحة", [asNumbers.status, asNumbers.body?.error]);
  }

  /* ═══ 8. الحذف والإصدار ═══ */
  {
    const rows = await board();
    const row = rows.find(item => Number(item.rev || 0) > 0 && String(item.SCode) === "991") || rows[rows.length - 1];
    const stale = await call("DELETE", `/api/schedules/${row.id}?rev=${Number(row.rev || 0) + 5}`);
    check(stale.status === 409 && stale.body?.conflict === "revision", "D1 حذفٌ بإصدارٍ قديم 409 (تغيّر هذا الموعد)", [stale.status, stale.body]);
    const edited = (await board()).find(item => Number(item.rev || 0) > 0);
    if (edited) {
      const noRev: any = { ...edited, rev: undefined }; delete noRev.id; delete noRev.AdCourseName;
      const putNoRev = await call("PUT", `/api/schedules/${edited.id}`, noRev);
      check(putNoRev.status === 409 && putNoRev.body?.code === "rev-required", "D2 تعديلٌ من المتصفح بلا إصدارٍ لصفٍّ له إصدار يُردّ", [putNoRev.status, putNoRev.body?.code]);
    } else check(false, "D2 صفٌّ له إصدار");
    const ok = await call("DELETE", `/api/schedules/${row.id}?rev=${Number(row.rev || 0)}`);
    check(ok.status === 200 && ok.body?.success === true, "D3 الحذف بالإصدار الصحيح يمرّ", [ok.status, ok.body]);
    const gone = await call("DELETE", `/api/schedules/${row.id}`);
    check(gone.status === 404, "D4 حذفُ ما لا وجودَ له 404 لا نجاح", [gone.status, gone.body]);
  }

  /* ═══ 8b. خارجُ النمط المعتمد: تنبيهٌ بتأكيدٍ صريح لا منع ═══ */
  {
    const odd = { fsunday: true, fmonday: true, ftuesday: true, fwednesday: false, fthursday: false };
    const rooms = await freeRooms(odd, "15:00", "15:50");
    const teachers = idle("15:00", "15:50");
    const body = mk(940, { ...odd, fstarttime: "15:00", fendtime: "15:50", AdCourseId: course3[2], AdInstructorId: teachers[4].AdInstructorId, ...roomBody(rooms[rooms.length - 1]) });
    const first = await call("POST", "/api/schedules", body);
    const rules = (first.body?.regulation || []).map((issue: any) => issue.rule);
    check(first.status === 409 && first.body?.code === "regulation-exception" && (rules.includes("pattern-days") || rules.includes("lecture-length")),
      "X1 أيامٌ خارج النمط المعتمد: 409 regulation-exception (لا منع صريح 400)", [first.status, first.body?.code, rules]);
    const confirmed = await call("POST", "/api/schedules", { ...body, regulationException: true });
    check(confirmed.status === 201, "X2 وبالتأكيد الصريح يُحفظ", [confirmed.status, confirmed.body]);
    const verdict = await call("POST", "/api/schedules/check-conflicts", { ...body, SCode: "941" });
    check(!(verdict.body?.validationIssues || []).some((text: string) => /نمط/.test(text)) && (verdict.body?.regulation || []).length > 0,
      "X3 فحصُ الحفظ يقول النمطَ في regulation لا في validationIssues", [verdict.body?.validationIssues, verdict.body?.regulation]);
  }

  /* ═══ 9. استبدال الأستاذ: بديلٌ غير موجود ═══ */
  {
    const rows = await board();
    const someone = Number(rows.find(row => Number(row.AdInstructorId) > 0)?.AdInstructorId);
    const before = JSON.stringify(rows.map(row => [row.id, row.AdInstructorId]));
    const bad = await call("POST", "/api/schedules/replace-instructor", { collegeId: 1, sectionId: 1, termId: 1, fromInstructorId: someone, toInstructorId: 987654, commit: true });
    check(bad.status === 400, "I1 بديلٌ غير موجود يُرفض بخطأ واضح", [bad.status, bad.body]);
    check(JSON.stringify((await board()).map(row => [row.id, row.AdInstructorId])) === before, "I2 لم يُكتب شيء");
  }
} catch (error) {
  failed++;
  console.log("\x1b[31m✗ تعذّر تشغيل الخادم الحيّ\x1b[0m", error);
} finally {
  stop();
}

/* ═══ 10. داخل العملية: سقفُ القراءات وتجاوزُ حجز قسمٍ آخر ═══ */
{
  const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-write-integrity-proc-"));
  process.env.DATA_MODE = "demo";
  process.env.SCHEDULE_PRIVATE_DIR = privateDir;
  const { initDatabase, Repository } = await import("../src/db/repository");
  await initDatabase();
  const counts: Record<string, number> = {};
  const wrap = (name: string) => {
    const original = (Repository as any)[name].bind(Repository);
    (Repository as any)[name] = (...args: unknown[]) => { counts[name] = (counts[name] || 0) + 1; return original(...args); };
  };
  ["getSchedules", "getScheduleByIdUncached", "getCourseByIdUncached", "getCourses", "getSchedulesByScope"].forEach(wrap);
  const { scheduleConflicts } = await import("../src/server/core/scheduleConflicts");
  const { invalidateSchedules } = await import("../src/db/referenceCache");
  const candidate: any = { AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdCourseId: 1, SCode: "01", AdInstructorId: 0, fsunday: true, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false, fstarttime: "08:00", fendtime: "08:50" };
  const adminReq: any = { user: { IsAdminUser: true }, body: {}, path: "/api/schedules/check-conflicts" };
  await scheduleConflicts(adminReq, candidate, 0);                      // تسخين
  invalidateSchedules();                                                // أي حفظٍ في أي قسم يُسقط ذاكرة الإيقاع
  for (const key of Object.keys(counts)) counts[key] = 0;
  await scheduleConflicts(adminReq, candidate, 0);                      // أول فحصٍ بعد الحفظ
  await new Promise(resolve => setTimeout(resolve, 300));               // وما يُحدَّث في الخلفية
  check((counts.getSchedules || 0) === 0, "P1 الفحصُ بعد حفظٍ لا يقرأ جدولَ الجامعة كلّه (getSchedules = 0)", counts);
  check((counts.getSchedulesByScope || 0) <= 4 && (counts.getCourses || 0) <= 2, "P2 قراءاتُ الجداول والمقررات في الفحص بعد الحفظ محدودة", counts);
  for (const key of Object.keys(counts)) counts[key] = 0;
  await Repository.withReadMemo(async () => {
    await Promise.all([1, 2, 3, 4, 5].map(() => Repository.getScheduleById(1)));
    await Promise.all(Array.from({ length: 7 }, () => Repository.getCourseById(1)));
  });
  check(counts.getScheduleByIdUncached === 1 && counts.getCourseByIdUncached === 1, "P3 داخل الطلب: الصفُّ والمقرر يُقرآن مرةً واحدة مهما تكرّر السؤال", counts);

  /* تجاوزُ حجز طلبِ قسمٍ آخر: يمرّ ولا يمسّ الطلب إلا بسطرٍ في خطّه الزمني. */
  const { applyRequestHoldOverride, noteRequestHoldOverride } = await import("../src/server/core/scheduleConflicts");
  const saved: any[] = [];
  const slot = [{ day: "fsunday", start: "08:00", end: "08:50" }];
  const requests: Record<string, any> = {
    "req-foreign": { id: "req-foreign", status: "in-review", AdCollegeId: 2, AdSectionId: 99, AdInstructorId: 5, AdTermId: 1, requestRevision: 1,
      items: [{ itemId: "i1", action: "add", rowId: null, after: { courseId: 2 }, slots: slot }], timeline: [] },
    "req-own": { id: "req-own", status: "in-review", AdCollegeId: 1, AdSectionId: 1, AdInstructorId: 5, AdTermId: 1, requestRevision: 1,
      items: [{ itemId: "i1", action: "add", rowId: null, after: { courseId: 2 }, slots: slot }], timeline: [] },
  };
  (Repository as any).getInstructorRequest = async (id: string) => requests[id] ? JSON.parse(JSON.stringify(requests[id])) : undefined;
  (Repository as any).saveInstructorRequest = async (request: any) => { saved.push(request); return request; };
  const coordinator: any = { user: { IsAdminUser: false, Role: "coordinator" }, scopes: [{ AdCollegeId: 1, AdSectionId: 1 }], body: { overrideRequestHolds: ["req-foreign", "req-own", "req-missing"] } };
  const allowed = await applyRequestHoldOverride(coordinator);
  check(allowed.includes("req-foreign") && allowed.includes("req-own") && !allowed.includes("req-missing"), "O1 تجاوزُ الحجز يمرّ لحجز قسمٍ آخر ولطلبٍ قائم، ولا يمرّ لمعرّفٍ لا طلبَ له", allowed);
  check(([] as string[]).concat(coordinator.__requestReservationOwner).length === 2, "O2 مالكا الحجز المتجاوَزان مسجّلان للكتابة", coordinator.__requestReservationOwner);
  const newRow: any = { id: 777, AdCourseId: 2, AdInstructorId: 5, fsunday: true, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false, fstarttime: "08:00", fendtime: "08:50" };
  await noteRequestHoldOverride(allowed, newRow, "المنسّق");
  const foreign = saved.find(request => request.id === "req-foreign"), own = saved.find(request => request.id === "req-own");
  check(Boolean(foreign) && JSON.stringify(foreign.items) === JSON.stringify(requests["req-foreign"].items) && foreign.status === "in-review" && foreign.timeline.length === 1 && foreign.timeline[0].by === "قسم آخر",
    "O3 طلبُ القسم الآخر يبقى كما هو (بنوده وحالته) وفي خطّه سطرٌ واحد بلا اسم فاعل", foreign);
  check(Boolean(own) && own.items[0].decision?.state === "fixed", "O4 طلبُ القسم نفسه يُثبَّت بندُه كما كان", own);
}

console.log(`\n${passed} نجح · ${failed} فشل`);
process.exit(failed ? 1 : 0);
