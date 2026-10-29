/**
 * ── 🔄 شعبة «هيئة تدريسية»: إسناد · تبديل · استبدال — ذرّياً (G3) ───────────────
 * خادمٌ حقيقي في وضع التجربة، والمسار POST /api/schedules/placeholder-action:
 *   - الإسناد يغيّر أستاذ الشعبة نفسها ولا يُنشئ صفاً،
 *   - الاستبدال يحذف الشعبة ويُنشئ الموعد في قاعتها في معاملة واحدة،
 *   - التبديل ينقل الشعبة إلى قاعة حرّة ويُنشئ الموعد في قاعتها،
 *   - الرفض (تعارض أستاذ) لا يكتب شيئاً: الشعبة باقية ولا صفّ جديد،
 *   - خطوات التراجع تعيد كل شيء.
 * يُشغَّل على 3000 (أو PH_BASE لخادمٍ قائم).
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { waitForDemoSeed } from "./helpers/demoSeed";
import { readServerSource } from "./helpers/serverSource.mjs";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ""); }
};

/* ── الربط (بلا خادم) ── */
{
  const srv = readServerSource(), repo = fs.readFileSync("src/db/repository.ts", "utf8");
  const route = srv.slice(srv.indexOf('app.post("/api/schedules/placeholder-action"'), srv.indexOf("/* ── استثناءات الأسبوع"));
  check(route.length > 800 && !/Repository\.(createSchedule|updateSchedule|deleteSchedule)\b/.test(route), "L1 لا كتابة مباشرة: كل خطوة عبر الفحص الجافّ ثم معاملة واحدة");
  check(/commitScheduleChangeSet: async/.test(repo) && /tx\.delete\(firestoreDb!\.collection\("schedules"\)/.test(repo.slice(repo.indexOf("commitScheduleChangeSet: async"))) && /withSerialLock\(`request-reservations:\$\{termId\}`/.test(repo.slice(repo.indexOf("commitScheduleChangeSet: async"))), "L2 معاملة Firestore ومسار التجربة كلاهما كلّه أو لا شيء");
  check(/assertRequestReservationWrite/.test(repo.slice(repo.indexOf("commitScheduleChangeSet: async"), repo.indexOf("deleteSchedule: async"))), "L3 حجوزات طلبات الأساتذة تُحترم داخل المعاملة");
}

const BASE = process.env.PH_BASE || "http://localhost:3000";
const up = async () => { try { return (await fetch(BASE + "/api/public/me/state")).ok; } catch { return false; } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "placeholder-action-"));
let child: ReturnType<typeof spawn> | null = null;
try {
  if (!process.env.PH_BASE && await up()) {
    console.log("   (تخطّي السلوك الحيّ: المنفذ مشغول بخادمٍ آخر)");
  } else {
    if (!process.env.PH_BASE) {
      child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", SCHEDULE_PRIVATE_DIR: dir }, stdio: "ignore", detached: true });
      let ready = false;
      for (let i = 0; i < 120 && !ready; i += 1) { ready = await up(); if (!ready) await new Promise(r => setTimeout(r, 1000)); }
      if (!ready) throw new Error("الخادم لم يبدأ");
    }
    const login = await fetch(BASE + "/api/auth/demo", { method: "POST" });
    const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
    await waitForDemoSeed(BASE, cookie);
    const call = async (method: string, url: string, body?: unknown) => {
      const response = await fetch(BASE + url, { method, headers: { cookie, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: await response.json().catch(() => null) as any };
    };
    const board = async () => (await call("GET", "/api/schedules?collegeId=1&sectionId=1&termId=1")).body as any[];
    const people = (await call("GET", "/api/instructors?collegeId=1&sectionId=1&termId=1")).body as any[];
    const placeholder = people.find(person => String(person.AdInstructorName || "").startsWith("هيئة"));
    const rows0 = await board();
    const courseIds = [...new Set(rows0.map(row => Number(row.AdCourseId)))];
    check(Boolean(placeholder) && courseIds.length >= 2, "B0 بيانات التجربة: «هيئة تدريسية» ومقرران على الأقل", { placeholder, courses: courseIds.length });
    if (placeholder && courseIds.length >= 2) {
      /* خانة حرّة تماماً (قاعة وأستاذ) للبناء عليها: الخميس 18:00 بلا أحد في القسم. */
      const day = { fsunday: false, fmonday: false, ftuesday: false, fwednesday: false, fthursday: true };
      const time = { fstarttime: "18:00", fendtime: "18:50" };
      const scope = { AdCollegeId: 1, AdSectionId: 1, AdTermId: 1 };
      const free = await call("POST", "/api/schedules/suggest-slots", { ...scope, ...day, ...time, AdCourseId: courseIds[0], roomOnly: true });
      const rooms = (free.body?.slots || []) as any[];
      check(rooms.length >= 2, "B1 قاعتان حرّتان على الأقل في الخانة الاختبارية", free.body);
      const busyAt = (personId: number, rows: any[]) => rows.some(row => Number(row.AdInstructorId) === personId && row.fthursday && row.fstarttime < "18:50" && row.fendtime > "18:00");
      const teacher = people.find(person => person !== placeholder && !String(person.AdInstructorName || "").startsWith("هيئة") && !busyAt(Number(person.AdInstructorId), rows0));
      const makePlaceholder = async (courseId: number, scode: string, room: any) => (await call("POST", "/api/schedules", {
        ...scope, ...day, ...time, AdCourseId: courseId, SCode: scode, AdInstructorId: placeholder.AdInstructorId,
        buildingId: room.buildingId, roomId: room.roomId, AdRoomCode: room.room, AdRoomHall: room.hall, locationStatus: "VERIFIED",
      })).body;
      if (rooms.length >= 2 && teacher) {
        /* ── الإسناد ── */
        const ph = await makePlaceholder(courseIds[0], "981", rooms[0]);
        check(Number(ph?.id) > 0, "B2 أُنشئت شعبة «هيئة تدريسية» للاختبار", ph);
        const before = (await board()).length;
        const assign = await call("POST", "/api/schedules/placeholder-action", { action: "assign", placeholderId: ph.id, placeholderRev: ph.rev,
          appointment: { ...scope, ...day, ...time, AdCourseId: courseIds[0], SCode: "982", AdInstructorId: teacher.AdInstructorId } });
        const afterAssign = await board();
        check(assign.status === 200 && afterAssign.length === before && Number(afterAssign.find(row => row.id === ph.id)?.AdInstructorId) === Number(teacher.AdInstructorId),
          "B3 الإسناد: الشعبة نفسها للأستاذ، ولا صفّ جديد", assign.body);
        /* التراجع: خطوات الخادم تعيد «هيئة تدريسية». */
        for (const step of assign.body?.undo || []) {
          const current = (await board()).find(row => step.url.endsWith(`/${row.id}`));
          await call(step.method, step.url, step.body ? { ...step.body, ...(current ? { rev: current.rev } : {}) } : undefined);
        }
        check(Number((await board()).find(row => row.id === ph.id)?.AdInstructorId) === Number(placeholder.AdInstructorId), "B4 التراجع يعيد الشعبة «هيئة تدريسية»");

        /* ── الاستبدال المرفوض لا يكتب شيئاً ── */
        const busyTeacher = people.find(person => !String(person.AdInstructorName || "").startsWith("هيئة") && busyAt(Number(person.AdInstructorId), afterAssign) && Number(person.AdInstructorId) !== Number(teacher.AdInstructorId));
        const blocker = busyTeacher ? null : (await call("POST", "/api/schedules", { ...scope, ...day, ...time, AdCourseId: courseIds[1], SCode: "983", AdInstructorId: people.find(p => p !== teacher && p !== placeholder && !String(p.AdInstructorName || "").startsWith("هيئة"))?.AdInstructorId,
          buildingId: rooms[1].buildingId, roomId: rooms[1].roomId, AdRoomCode: rooms[1].room, AdRoomHall: rooms[1].hall, locationStatus: "VERIFIED" })).body;
        const clashTeacher = busyTeacher?.AdInstructorId || blocker?.AdInstructorId;
        const countBefore = (await board()).length;
        const refused = await call("POST", "/api/schedules/placeholder-action", { action: "replace", placeholderId: ph.id,
          appointment: { ...scope, ...day, ...time, AdCourseId: courseIds[1], SCode: "984", AdInstructorId: clashTeacher } });
        const afterRefusal = await board();
        check(refused.status >= 400 && afterRefusal.length === countBefore && afterRefusal.some(row => row.id === ph.id),
          "B5 تعارض أستاذ: لا حذف ولا إضافة — لا حالة وسطية", { status: refused.status, body: refused.body });
        if (blocker?.id) await call("DELETE", `/api/schedules/${blocker.id}`);

        /* ── التبديل ── */
        const swap = await call("POST", "/api/schedules/placeholder-action", { action: "swap", placeholderId: ph.id,
          swapTo: { buildingId: rooms[1].buildingId, roomId: rooms[1].roomId, AdRoomCode: rooms[1].room, AdRoomHall: rooms[1].hall },
          appointment: { ...scope, ...day, ...time, AdCourseId: courseIds[1], SCode: "985", AdInstructorId: teacher.AdInstructorId } });
        const afterSwap = await board();
        const moved = afterSwap.find(row => row.id === ph.id);
        const created = afterSwap.find(row => row.id === swap.body?.createdId);
        check(swap.status === 200 && String(moved?.roomId) === String(rooms[1].roomId) && String(created?.roomId) === String(rooms[0].roomId)
          && Number(created?.AdInstructorId) === Number(teacher.AdInstructorId), "B6 التبديل: الشعبة إلى قاعة حرّة، والموعد في قاعتها، معاً", swap.body);
        for (const step of swap.body?.undo || []) {
          const current = (await board()).find(row => step.url.endsWith(`/${row.id}`));
          await call(step.method, step.url, step.body ? { ...step.body, ...(current ? { rev: current.rev } : {}) } : undefined);
        }
        const afterSwapUndo = await board();
        check(!afterSwapUndo.some(row => row.id === swap.body?.createdId) && String(afterSwapUndo.find(row => row.id === ph.id)?.roomId) === String(rooms[0].roomId), "B7 التراجع عن التبديل يعيد القاعة ويزيل الموعد");

        /* ── الاستبدال ── */
        const replace = await call("POST", "/api/schedules/placeholder-action", { action: "replace", placeholderId: ph.id,
          appointment: { ...scope, ...day, ...time, AdCourseId: courseIds[1], SCode: "986", AdInstructorId: teacher.AdInstructorId } });
        const afterReplace = await board();
        const newRow = afterReplace.find(row => row.id === replace.body?.createdId);
        check(replace.status === 200 && !afterReplace.some(row => row.id === ph.id) && String(newRow?.roomId) === String(rooms[0].roomId),
          "B8 الاستبدال: حُذفت الشعبة وحُفظ الموعد في قاعتها معاً", replace.body);
        check(Array.isArray(replace.body?.undo) && replace.body.undo[0]?.method === "DELETE" && replace.body.undo[1]?.method === "POST", "B9 خطوات التراجع: إزالة الجديد ثم إعادة الشعبة");
        for (const step of replace.body?.undo || []) await call(step.method, step.url, step.body);
        const restored = (await board()).filter(row => Number(row.AdInstructorId) === Number(placeholder.AdInstructorId) && row.SCode === "981");
        check(restored.length === 1 && !(await board()).some(row => row.id === replace.body?.createdId), "B10 التراجع عن الاستبدال يعيد الشعبة");
      }
    }
  }
} catch (error) {
  check(false, "تعذّر تشغيل السلوك الحيّ", String(error));
} finally {
  if (child?.pid) { try { process.kill(-child.pid); } catch { /* already gone */ } }
}
console.log(`\nplaceholder-action audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
