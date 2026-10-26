/**
 * ── تثبيتُ رغبة الأستاذ في الجدول الفعلي: نداءٌ واحد، بقواعد الجدول نفسها ─────────
 *
 * خادمٌ حقيقيّ في وضع التجربة. `POST /api/instructor-requests/:id/apply`:
 *   - يعاين بلا كتابة،
 *   - يرفض الكتابة فوق تعديلِ زميلٍ أحدث (ختم الإصدار)،
 *   - يرفض ما يتعارض في الجدول النهائي ولا يكتب شيئاً ولا يسجّل قراراً،
 *   - يكتب الصفّ بمصدره (رغبة أستاذ) ويسجّل القرار معاً،
 *   - ولا يُعاد على بندٍ ثُبّت.
 * والبندُ بأوقاتٍ مختلفة بين الأيام يصير صفّاً لكل وقت.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { waitForDemoSeed } from "./helpers/demoSeed";
import { slotTimeGroups } from "../src/utils/slotTimeGroups";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};

/* ── تقسيمُ الأوقات ── */
{
  const groups = slotTimeGroups([
    { day: "ftuesday", start: "10:00", end: "10:50" }, { day: "fsunday", start: "08:00", end: "09:15" },
    { day: "fthursday", start: "10:00", end: "10:50" }, { day: "fsunday", start: "08:00", end: "09:15" }, { day: "fx", start: "1", end: "2" },
  ]);
  check(groups.length === 2 && groups[0].days.join() === "fsunday" && groups[0].start === "08:00"
    && groups[1].days.join() === "ftuesday,fthursday" && groups[1].start === "10:00", "T1 بندٌ بوقتين = صفّان، كلٌّ بأيامه، بلا تكرارٍ ولا يومٍ مجهول", groups);
  check(slotTimeGroups([{ day: "fmonday", start: "09:30", end: "10:50" }, { day: "fwednesday", start: "09:30", end: "10:50" }]).length === 1, "T2 وقتٌ واحد = صفٌّ واحد");
}

/* ── الربط ── */
{
  const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
  const srv = read("server.ts"), inbox = read("src/components/InstructorInbox.tsx"), repository = read("src/db/repository.ts");
  const route = srv.slice(srv.indexOf('app.post("/api/instructor-requests/:id/apply"'), srv.indexOf("/* ── حوارُ البند"));
  check(route.length > 500 && !/Repository\.(createSchedule|updateSchedule|deleteSchedule)\b/.test(route), "L1 مسار التثبيت لا يكتب في المستودع مباشرة: يمرّ بمعالجات الحفظ نفسها");
  check(/dryRun: true/.test(route) && /reverted/.test(route), "L2 فحصٌ جافّ لكل خطوة قبل الكتابة، وتراجعٌ إن تعذّرت خطوة");
  check(inbox.includes("/apply`") && !inbox.includes('`/api/schedules/${item.rowId}`, {\n            method: "PUT"'), "L3 الشاشة تثبّت بنداء واحد");
  check(/revs: revsFor\(/.test(inbox), "L4 الشاشة ترسل ختم إصدار كل صف");
  check(/!stored\.items\[i\]\.decision\?\.state\)/.test(route), "L5 البنود المترابطة تُقبل معلّقة فقط (لا يُكتب بندٌ رُفض)");
  check(/liveRowRefusal\(live, revs\)[\s\S]{0,200}kind: "delete"/.test(route), "L6 الحذف يخضع لختم الإصدار ولملكية الأستاذ كالنقل");
  check(/decision\?\.state === "rejected"[\s\S]{0,180}code: "rejected-item"/.test(route), "L6a بندٌ مرفوض لا يمرّ إلى الاعتماد دون إعادة فتح موثّقة");
  check(route.includes("request-revision-required") && route.includes("row-revision-required"), "L6b ختم الطلب وكل صف متأثر إلزاميان عند الاعتماد");
  check(/Number\(live\.AdInstructorId\) !== Number\(stored\.AdInstructorId\) \|\| Number\(live\.AdTermId\) !== termId/.test(route), "L7 الصف الحيّ يجب أن يكون للأستاذ نفسه في الفصل نفسه");
  check(route.includes("Repository.commitInstructorRequestPlan") && repository.includes("const finalWeek = [...week.filter"), "L8 جميع عمليات الحزمة تُحفظ معاً بلا حالة وسطية تحتاج تراجعاً");
  check(/acquireScheduleApplyLease\(applyLock/.test(route) && /releaseScheduleApplyLease\(applyLock/.test(route), "L9 قفل التثبيت في قاعدة البيانات (يراه كل خادم في كل منطقة)، ويُفكّ دائماً");
  check(/renewScheduleApplyLease\(applyLock/.test(route) && /clearInterval\(leaseRenewal\)/.test(route), "L9 ويُمدّ أجلُه ما دام التثبيت جارياً");
  check(repository.includes("tx.get(firestoreDb!.collection(\"schedules\").where(\"AdTermId\", \"in\"") && repository.includes("findConflicts(written.map(normalize), finalWeek.map(normalize)"), "L10 الأسبوع الحي يعاد فحصه داخل معاملة الكتابة نفسها");
  check(repository.includes("tx.set(requestRef, planned.request)") && repository.includes("planned.rows.forEach(row => tx.set") && route.includes("request-commit-failed"), "L11 القرار والمواعيد في المعاملة نفسها: فشلها لا يترك صفاً بلا قرار");
}

const BASE = "http://localhost:3000";
const up = async () => { try { return (await fetch(BASE + "/api/public/me/state")).ok; } catch { return false; } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-apply-atomic-"));
let child: ReturnType<typeof spawn> | null = null;
try {
  if (await up()) {
    console.log("   (تخطّي السلوك الحيّ: المنفذ مشغول بخادمٍ آخر)");
  } else {
    child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", SCHEDULE_PRIVATE_DIR: dir }, stdio: "ignore", detached: true });
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
    const inbox = async () => (await call("GET", "/api/instructor-requests?collegeId=1&sectionId=1&termId=1")).body;
    const rowNow = async (id: number) => ((await call("GET", "/api/schedules?collegeId=1&sectionId=1&termId=1")).body as any[]).find(row => row.id === id);
    const days = (row: any) => ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"].filter(key => row?.[key]).join();

    const first = await inbox();
    const request = (first.rows as any[]).find(row => (row.items || []).some((item: any) => item.action === "change" && !item.decision?.state));
    if (!request) {
      check(true, "B0 (لا بندَ تعديلٍ معلّق في بيانات التجربة)");
    } else {
      const index = request.items.findIndex((item: any) => item.action === "change" && !item.decision?.state);
      const item = request.items[index];
      const before = await rowNow(Number(item.rowId));
      const want = slotTimeGroups(item.slots)[0];
      const url = `/api/instructor-requests/${request.id}/apply`;
      const requestRevision = Number(request.requestRevision || 0);
      /* بياناتُ التجربة تتغيّر: يُفرَّغ الوقتُ المطلوب من مواعيد الأستاذ نفسه وقاعته (في البيئة المؤقتة)
         كي يقيس الاختبارُ التثبيتَ لا مصادفةَ البيانات. والرفضُ عند التعارض يقيسه B3. */
      const toMin = (t: string) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };
      const clash = ((await call("GET", "/api/schedules?collegeId=1&sectionId=1&termId=1")).body as any[]).filter(row =>
        row.id !== before.id && (Number(row.AdInstructorId) === Number(before.AdInstructorId) || (before.roomId && row.roomId === before.roomId)) && want.days.some(d => row[d])
        && toMin(row.fstarttime) < toMin(want.end) && toMin(want.start) < toMin(row.fendtime));
      for (const row of clash) await call("DELETE", `/api/schedules/${row.id}`);
      before.rev = (await rowNow(before.id)).rev;

      const missingRequestStamp = await call("POST", url, { itemIndex: index, preview: true, revs: { [item.rowId]: before.rev } });
      check(missingRequestStamp.status === 428 && missingRequestStamp.body?.code === "request-revision-required",
        "B0 ختم إصدار الطلب مفقود: الاعتماد يُرفض قبل المعاينة أو الكتابة", missingRequestStamp.body);
      const emptyRequestStamp = await call("POST", url, { itemIndex: index, preview: true, requestRevision: "",
        revs: { [item.rowId]: before.rev } });
      check(emptyRequestStamp.status === 428 && emptyRequestStamp.body?.code === "request-revision-required",
        "B0 ختم فارغ لا يُعامل كأنه الإصدار صفر", emptyRequestStamp.body);
      const missingRowStamp = await call("POST", url, { itemIndex: index, preview: true, requestRevision });
      check(missingRowStamp.status === 428 && missingRowStamp.body?.code === "row-revision-required",
        "B0a ختم إصدار الموعد مفقود: الاعتماد يُرفض", missingRowStamp.body);
      const emptyRowStamp = await call("POST", url, { itemIndex: index, preview: true, requestRevision,
        revs: { [item.rowId]: "" } });
      check(emptyRowStamp.status === 428 && emptyRowStamp.body?.code === "row-revision-required",
        "B0c ختم صف فارغ لا يُعامل كأنه الإصدار صفر", emptyRowStamp.body);
      const oldRequestStamp = await call("POST", url, { itemIndex: index, preview: true, requestRevision: requestRevision + 1,
        revs: { [item.rowId]: before.rev } });
      check(oldRequestStamp.status === 409 && oldRequestStamp.body?.code === "request-revision",
        "B0b ختم طلب قديم يُرفض", oldRequestStamp.body);
      const preview = await call("POST", url, { itemIndex: index, preview: true, requestRevision, revs: { [item.rowId]: before.rev } });
      const untouched = await rowNow(before.id);
      check(preview.status === 200 && preview.body?.preview && preview.body.plan?.[0]?.start === want.start
        && untouched.fstarttime === before.fstarttime && days(untouched) === days(before), "B1 المعاينة تُرجع الخطة ولا تكتب", preview.body);

      const stale = await call("POST", url, { itemIndex: index, requestRevision, revs: { [item.rowId]: Number(before.rev || 0) + 1 } });
      check(stale.status === 409 && stale.body?.code === "revision", "B2 ختمُ إصدارٍ قديم يُرفض (لا يكتب فوق تعديل زميل)", stale.body);

      /* صفٌّ يشغل الأستاذَ نفسَه في الوقت المطلوب: التثبيتُ يُرفض كلُّه ولا يُكتب شيء. */
      const blocker = await call("POST", "/api/schedules", {
        AdCollegeId: before.AdCollegeId, AdSectionId: before.AdSectionId, AdTermId: before.AdTermId, AdCourseId: before.AdCourseId,
        SCode: "97", AdInstructorId: before.AdInstructorId,
        ...Object.fromEntries(["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"].map(key => [key, key === want.days[0]])),
        fstarttime: want.start, fendtime: want.end,
        AdRoomCode: before.AdRoomCode, AdRoomHall: before.AdRoomHall, buildingId: before.buildingId, roomId: before.roomId, locationStatus: before.locationStatus,
      });
      if (blocker.status === 201) {
        const refused = await call("POST", url, { itemIndex: index, requestRevision, revs: { [item.rowId]: before.rev } });
        const still = await rowNow(before.id);
        const afterRefuse = (await inbox()).rows.find((row: any) => row.id === request.id);
        check(refused.status === 409 && still.fstarttime === before.fstarttime && days(still) === days(before) && !afterRefuse.items[index].decision?.state,
          "B3 تعارضٌ في الجدول النهائي (الأستاذ مشغول) يُرفض: لا كتابة ولا قرار", refused.body);
        await call("DELETE", `/api/schedules/${blocker.body.id}`);
      } else check(true, "B3 (تعذّر بناء صفٍّ معارِض في بيانات التجربة)");

      const applied = await call("POST", url, { itemIndex: index, requestRevision, revs: { [item.rowId]: (await rowNow(before.id)).rev } });
      const after = await rowNow(before.id);
      check(applied.status === 200 && after.fstarttime === want.start && days(after) === want.days.join(), "B4 التثبيت يكتب الصفّ كما طلب الأستاذ", { status: applied.status, body: applied.body?.error, after });
      check(after.origin?.kind === "instructor-request" && after.origin?.refId === String(request.id), "B5 ومصدرُه في سجلّ الجدول: رغبة الأستاذ برقم طلبه", after.origin);
      const decided = (await inbox()).rows.find((row: any) => row.id === request.id).items[index].decision;
      check(decided?.state === "fixed" && Number(decided?.scheduleId) === before.id, "B6 والقرارُ مسجّلٌ معه بمعرّف الصف", decided);
      let afterFixedInbox = await inbox();
      let currentRequest = afterFixedInbox.rows.find((row: any) => row.id === request.id);
      const rejectedIndex = currentRequest.items.findIndex((candidate: any, at: number) => at !== index
        && (candidate.action === "change" || candidate.action === "delete") && !candidate.decision?.state && candidate.rowId != null);
      if (rejectedIndex >= 0) {
        const rejectedItem = currentRequest.items[rejectedIndex];
        const rejectionRevision = Number(currentRequest.requestRevision || 0);
        const rejectedRow = await rowNow(Number(rejectedItem.rowId));
        const rejection = await call("POST", `/api/instructor-requests/${request.id}/decide`, {
          itemIndex: rejectedIndex, itemId: rejectedItem.itemId, requestRevision: rejectionRevision,
          state: "rejected", reasonCode: "department", note: "اختبار رفض بندٍ قبل الاعتماد",
        });
        const staleDecision = await call("POST", `/api/instructor-requests/${request.id}/decide`, {
          itemIndex: rejectedIndex, itemId: rejectedItem.itemId, requestRevision: rejectionRevision,
          state: "rejected", reasonCode: "other", note: "قرار قديم مكرر",
        });
        const missingDecisionRevision = await call("POST", `/api/instructor-requests/${request.id}/decide`, {
          itemIndex: rejectedIndex, itemId: rejectedItem.itemId, state: "rejected", reasonCode: "other",
        });
        const afterRejection = await inbox();
        currentRequest = afterRejection.rows.find((row: any) => row.id === request.id);
        const rejectedApply = await call("POST", url, { itemIndex: rejectedIndex, requestRevision: currentRequest.requestRevision,
          revs: { [rejectedItem.rowId]: rejectedRow.rev || 0 } });
        check(rejection.status === 200 && rejectedApply.status === 409 && rejectedApply.body?.code === "rejected-item",
          "B6a بندٌ رُفض فعلياً لا يمكن تطبيقه بعد ذلك", { rejection: rejection.status, rejectedApply });
        check(staleDecision.status === 409 && staleDecision.body?.code === "request-revision"
          && missingDecisionRevision.status === 428 && currentRequest.items[rejectedIndex].decision.note === "اختبار رفض بندٍ قبل الاعتماد",
          "B6b قرارٌ قديم أو بلا ختم لا يغيّر الرفض ولا سببه أو توقيعه", { staleDecision, missingDecisionRevision });
      } else {
        check(true, "B6a (لا يوجد بندٌ ثانٍ معلّق في بيانات التجربة)");
      }
      afterFixedInbox = await inbox();
      currentRequest = afterFixedInbox.rows.find((row: any) => row.id === request.id);
      const again = await call("POST", url, { itemIndex: index, requestRevision: currentRequest.requestRevision,
        revs: { [item.rowId]: after.rev } });
      check(again.status === 409 && again.body?.code === "already-fixed", "B7 ولا يُعاد على بندٍ ثُبّت (لا صفّ مكرر)", again.body);
    }
  }
} catch (error: any) {
  check(false, "تشغيل الخادم", error?.message);
} finally {
  if (child?.pid) { try { process.kill(-child.pid); } catch { /* انتهى */ } }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${failed ? "\x1b[31m" : "\x1b[32m"}${passed} نجح، ${failed} فشل\x1b[0m`);
process.exit(failed ? 1 : 0);
