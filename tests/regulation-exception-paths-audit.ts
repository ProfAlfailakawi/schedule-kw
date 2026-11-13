/**
 * ── «الاستثناء اللائحي» في مسارات الحفظ الداخلية (قاعدة المالك: كلُّ حفظٍ من القسم) ──────────────
 * اعتمادُ اقتراح (مركز الذكاء والرادار وتخطيط الشعب)، واعتمادُ سيناريو آلة الزمن، وموافقةُ القسم على طلب أستاذ:
 * بلا موافقةٍ صريحة يُردّ 409 «regulation-exception» بمخالفاته ومادّتها ولا يُكتب شيء؛ وبالموافقة يُكتب ويُسجَّل
 * الاستثناءُ في سجل التدقيق. والربطُ: بوّابةٌ واحدة (regulationGate) والورقةُ نفسها في الواجهة.
 * خادمٌ حقيقيّ في وضع التجربة على منفذٍ حرّ (helpers/liveServer).
 */
import fs from "fs";
import { waitForDemoSeed } from "./helpers/demoSeed";
import { startDemoServer, type LiveServer } from "./helpers/liveServer";
import { readServerSource } from "./helpers/serverSource.mjs";
import { ladderStartsForDays } from "../src/utils/scheduleRegulations";
import { slotTimeGroups } from "../src/utils/slotTimeGroups";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ""); }
};

/* ── الربط ── */
{
  const srv = readServerSource();
  const read = (file: string) => fs.readFileSync(file, "utf8");
  const writes = read("src/server/core/scheduleWrites.ts");
  check(/export function regulationGate\(/.test(writes) && /inner\.__regulationCollect = Boolean\(patch\.regulation\)/.test(writes), "R1 بوّابةٌ واحدة في الخادم، والمسارُ الداخلي يجمع المخالفات بطلب صاحبه");
  check(["/api/instructor-requests/:id/apply", "/api/section-build/apply", "/api/schedules/placeholder-action"].every(route => {
    const start = srv.indexOf(`app.post("${route}"`);
    const next = srv.slice(start + 10).search(/\napp\.(get|post|put|delete)\(/);
    const body = srv.slice(start, next < 0 ? undefined : start + 10 + next);
    return start >= 0 && body.includes("regulationGate(req)") && body.includes("gate.refusal()");
  }), "R2 تثبيتُ طلب الأستاذ وتنزيلُ الشعب و«هيئة تدريسية» تسأل قبل الكتابة");
  check(read("src/server/timeMachineRoutes.ts").includes("gate.refusal()") && /regulation: !exactRestore/.test(read("server.ts")), "R3 اعتمادُ آلة الزمن يسأل، واستعادتُها (ما كان بالضبط) لا تُسأل");
  check(/const gate = options\.gate \|\| regulationGate\(req\)/.test(writes) && /dryRun: true, regulation: true/.test(writes), "R4 اعتمادُ الاقتراح يفحص جافّاً ويسأل قبل الكتابة");
  check(["ApplyProposal", "InstructorInbox", "timeMachineShared", "SectionBuild", "StudentRegistration"].every(name => read(`src/components/${name}.tsx`).includes("settleRegulationException(")),
    "R5 الواجهات تفتح الورقة نفسها وتعيد الطلب بالموافقة");
}

const DAYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"];
const mins = (time: string) => Number(String(time).slice(0, 2)) * 60 + Number(String(time).slice(3, 5));
const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const daysOf = (row: any) => DAYS.filter(day => row?.[day]);

let server: LiveServer | null = null;
try {
  server = await startDemoServer("regulation-paths");
  const BASE = server.base;
  const login = await fetch(BASE + "/api/auth/demo", { method: "POST" });
  const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
  await waitForDemoSeed(BASE, cookie);
  const call = async (method: string, url: string, body?: unknown) => {
    const response = await fetch(BASE + url, { method, headers: { cookie, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json().catch(() => null) as any };
  };
  const qs = "collegeId=1&sectionId=1&termId=1";
  const week = async () => (await call("GET", `/api/schedules?${qs}`)).body as any[];
  const termRows = async () => (await call("GET", "/api/schedules?termId=1")).body as any[];
  const auditLines = async () => {
    const logs = await call("GET", "/api/audit-logs");
    const list: any[] = Array.isArray(logs.body) ? logs.body : logs.body?.items || logs.body?.logs || logs.body?.rows || [];
    return list.map((row: any) => String(row.changes || row.details || row.summary || JSON.stringify(row)));
  };
  const isException = (response: { status: number; body: any }) => response.status === 409 && response.body?.code === "regulation-exception"
    && Array.isArray(response.body?.regulation) && response.body.regulation.length > 0 && response.body.regulation.every((issue: any) => /^م\.\d+\/\d+$/.test(issue.article));
  /* خانةٌ خالية للأستاذ والقاعة في أيامٍ بعينها، تبدأ خارج سُلّم البدايات (م.7/8). */
  const offLadderSlot = async (row: any, days: string[], duration: number) => {
    const everything = await termRows();
    const ladder = new Set(ladderStartsForDays(days as any));
    for (let start = 13 * 60 + 15; start + duration <= 19 * 60 + 30; start += 15) {
      if (ladder.has(clock(start))) continue;
      const busy = everything.some(other => other.id !== row.id && days.some(day => other[day]) && mins(other.fstarttime) < start + duration && mins(other.fendtime) > start
        && (Number(other.AdInstructorId) === Number(row.AdInstructorId) || (row.roomId && other.roomId === row.roomId)));
      if (!busy) return { start: clock(start), end: clock(start + duration) };
    }
    return null;
  };

  /* ── ١) اعتمادُ اقتراح: فتحُ شعبةٍ تبدأ خارج السُّلّم ── */
  {
    const rows = await week();
    let done = false;
    for (const base of rows.filter(row => row.roomId && daysOf(row).length).slice(0, 25)) {
      const days = daysOf(base);
      const slot = await offLadderSlot(base, days, mins(base.fendtime) - mins(base.fstarttime));
      if (!slot) continue;
      const body = { kind: "opening", collegeId: base.AdCollegeId, sectionId: base.AdSectionId, termId: base.AdTermId, courseId: base.AdCourseId,
        placement: { days, start: slot.start, end: slot.end, sectionCode: "", instructorId: base.AdInstructorId, buildingId: base.buildingId, roomId: base.roomId, roomCode: base.AdRoomCode, roomHall: base.AdRoomHall },
        origin: { kind: "intelligence", refId: "regulation-test", note: "اختبار" } };
      const refused = await call("POST", "/api/schedules/apply-proposal", body);
      if (!isException(refused)) continue;
      const countBefore = (await week()).length;
      check(refused.body.regulation.some((issue: any) => issue.rule === "start-ladder") && refused.body.applied?.length === 0, "P1 اعتمادُ اقتراحٍ يخالف السُّلّم يُردّ 409 «استثناء لائحي» بمادّته", refused.body);
      check((await week()).length === countBefore, "P2 ولم يُكتب شيء");
      const accepted = await call("POST", "/api/schedules/apply-proposal", { ...body, regulationException: true });
      check(accepted.status === 201 && accepted.body?.applied?.[0]?.action === "add", "P3 بالموافقة الصريحة يُكتب", accepted.body);
      check((await auditLines()).some(line => /اعتماد اقتراح من مركز الذكاء/.test(line) && /استثناء لائحي بتأكيد صريح \(م\.7\/8/.test(line)), "P4 ويُسجَّل الاستثناء في سجل التدقيق");
      done = true;
      break;
    }
    check(done, "P0 وُجدت في بيانات التجربة خانةٌ خالية خارج السُّلّم لاختبار الاقتراح");
  }

  /* ── ٢) آلة الزمن: سيناريو ينقل موعداً خارج السُّلّم ── */
  {
    const rows = await week();
    let done = false;
    for (const target of rows.filter(row => row.roomId && daysOf(row).length && row.origin?.kind !== "intelligence").slice(0, 25)) {
      const days = daysOf(target);
      const slot = await offLadderSlot(target, days, mins(target.fendtime) - mins(target.fstarttime));
      if (!slot) continue;
      const saved = await call("POST", "/api/time-machine/scenarios", { collegeId: 1, sectionId: 1, termId: 1, name: "اختبار الاستثناء", mode: "lab",
        changes: [{ id: "m1", op: "move", rowId: target.id, days, start: slot.start, end: slot.end, label: "نقل خارج السلم" }] });
      if (saved.status !== 200) continue;
      const scenario = saved.body.scenario;
      const refused = await call("POST", `/api/time-machine/scenarios/${scenario.id}/apply`, { revision: scenario.revision });
      if (!isException(refused)) { await call("DELETE", `/api/time-machine/scenarios/${scenario.id}`); continue; }
      const still = (await week()).find(row => row.id === target.id);
      check(still?.fstarttime === target.fstarttime && refused.body.reverted === true, "T1 اعتمادُ سيناريو يخالف اللائحة يُردّ 409 «استثناء لائحي» ولا يُكتب", refused.body);
      const accepted = await call("POST", `/api/time-machine/scenarios/${scenario.id}/apply`, { revision: scenario.revision, regulationException: true });
      const moved = (await week()).find(row => row.id === target.id);
      check(accepted.status === 200 && moved?.fstarttime === slot.start, "T2 بالموافقة الصريحة يُعتمد ويُكتب", accepted.body);
      check((await auditLines()).some(line => /اعتماد سيناريو آلة الزمن/.test(line) && /استثناء لائحي بتأكيد صريح/.test(line)), "T3 ويُسجَّل الاستثناء في سجل التدقيق");
      const restored = await call("POST", `/api/time-machine/scenarios/${scenario.id}/restore`, {});
      /* قد تمنع الاستعادةَ تعارضاتٌ مقصودة في بيانات التجربة؛ المهمّ أن ورقة الاستثناء لا تُسأل فيها. */
      check(restored.body?.code !== "regulation-exception", "T4 والاستعادة (ما كان بالضبط) لا تُسأل عن اللائحة", restored.body);
      done = true;
      break;
    }
    check(done, "T0 وُجد في بيانات التجربة موعدٌ يُنقل خارج السُّلّم لاختبار آلة الزمن");
  }

  /* ── ٣) موافقةُ القسم على طلب أستاذ: ثلاثُ محاضرات طويلة متتالية (م.6/2) ── */
  {
    const inbox = async () => (await call("GET", `/api/instructor-requests?${qs}`)).body;
    const first = await inbox();
    const request = (first.rows as any[]).find(row => (row.items || []).some((item: any) => item.action === "change" && !item.decision?.state
      && slotTimeGroups(item.slots).length === 1 && slotTimeGroups(item.slots)[0].end && mins(slotTimeGroups(item.slots)[0].end) - mins(slotTimeGroups(item.slots)[0].start) > 60));
    if (!request) check(false, "Q0 لا بندَ تعديلٍ معلّقٍ بمحاضرةٍ طويلة في بيانات التجربة");
    else {
      const index = request.items.findIndex((item: any) => item.action === "change" && !item.decision?.state);
      const item = request.items[index];
      const live = (await week()).find(row => row.id === Number(item.rowId));
      const want = slotTimeGroups(item.slots)[0];
      const duration = mins(want.end) - mins(want.start);
      const chain = [
        { start: mins(want.start) - 2 * duration - 20, end: mins(want.start) - duration - 20 },
        { start: mins(want.start) - duration - 10, end: mins(want.start) - 10 },
      ];
      /* الوقتُ المطلوب وما قبله يُفرَّغ من مواعيد الأستاذ (في البيئة المؤقتة)، ثم يُبنى قبله موعدان طويلان متتاليان له. */
      const span = { start: chain[0].start, end: mins(want.end) };
      for (const row of await termRows()) {
        if (row.id !== live.id && Number(row.AdInstructorId) === Number(live.AdInstructorId) && want.days.some(day => row[day])
          && mins(row.fstarttime) < span.end && mins(row.fendtime) > span.start) await call("DELETE", `/api/schedules/${row.id}`);
      }
      const everything = await termRows();
      const rooms = [...new Map(everything.filter(row => row.roomId && row.buildingId).map(row => [row.roomId, row])).values()];
      const freeRoom = (from: number, to: number) => rooms.find(room => !everything.some(row => row.roomId === room.roomId && want.days.some(day => row[day])
        && mins(row.fstarttime) < to && mins(row.fendtime) > from));
      let built = 0;
      for (const [at, part] of chain.entries()) {
        const room = freeRoom(part.start, part.end);
        if (!room) continue;
        const made = await call("POST", "/api/schedules", {
          AdCollegeId: live.AdCollegeId, AdSectionId: live.AdSectionId, AdTermId: live.AdTermId, AdCourseId: live.AdCourseId,
          SCode: String(770 + at), AdInstructorId: live.AdInstructorId, ...Object.fromEntries(DAYS.map(day => [day, want.days.includes(day)])),
          fstarttime: clock(part.start), fendtime: clock(part.end),
          AdRoomCode: room.AdRoomCode, AdRoomHall: room.AdRoomHall, buildingId: room.buildingId, roomId: room.roomId, locationStatus: "VERIFIED", regulationException: true,
        });
        if (made.status === 201) built++;
        else console.log("   إعداد السلسلة:", made.status, JSON.stringify(made.body).slice(0, 200));
      }
      check(built === 2, "Q0 بُني قبل الوقت المطلوب موعدان طويلان متتاليان للأستاذ", built);
      const fresh = (await inbox()).rows.find((row: any) => row.id === request.id);
      const freshIndex = fresh.items.findIndex((entry: any) => entry.itemId === item.itemId || (entry.rowId === item.rowId && entry.action === "change"));
      const url = `/api/instructor-requests/${request.id}/apply`;
      const payload = () => ({ itemIndex: freshIndex, itemId: fresh.items[freshIndex].itemId, requestRevision: fresh.requestRevision, revs: { [item.rowId]: live.rev } });
      const preview = await call("POST", url, { ...payload(), preview: true });
      check(preview.status === 200 && (preview.body?.regulation || []).some((issue: any) => issue.article === "م.6/2"), "Q1 المعاينة تقول المخالفة ولا تسأل", preview.body);
      const refused = await call("POST", url, payload());
      const untouched = (await week()).find(row => row.id === live.id);
      const undecided = (await inbox()).rows.find((row: any) => row.id === request.id).items[freshIndex].decision?.state;
      check(isException(refused) && refused.body.regulation.some((issue: any) => issue.rule === "consecutive-long") && untouched.fstarttime === live.fstarttime && !undecided,
        "Q2 الموافقةُ على طلبٍ يخالف اللائحة تُردّ 409 «استثناء لائحي»: لا كتابة ولا قرار", refused.body);
      const accepted = await call("POST", url, { ...payload(), regulationException: true });
      const after = (await week()).find(row => row.id === live.id);
      check(accepted.status === 200 && after.fstarttime === want.start, "Q3 بالموافقة الصريحة يُثبَّت الطلب", accepted.body?.error || accepted.status);
      check((await auditLines()).some(line => /تثبيت رغبة أستاذ/.test(line) && /استثناء لائحي بتأكيد صريح \(م\.6\/2/.test(line)), "Q4 ويُسجَّل الاستثناء في سجل التدقيق");
    }
  }
} catch (error: any) {
  check(false, "تشغيل الخادم", error?.message);
} finally {
  await server?.stop();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed || process.exitCode ? 1 : 0);
