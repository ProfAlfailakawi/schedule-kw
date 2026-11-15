/**
 * ── استعادةُ آلة الزمن لا تُرفض بما كان في الحالة المستعادة (قاعدة المالك A6) ───────────────
 *
 *   A  وحداتٌ نقية: newHoursIssueOnly، restoreBaselineWeek (مع الأختام ومن دونها).
 *   B  الخادم (وضع التجربة): اعتمادُ سيناريو ينقل موعداً يحمل تعارضاً قائماً، ثم الاستعادةُ تنجح
 *      (كانت 409 «القاعة مشغولة»)؛ وتعارضٌ جديد وُلد بعد الاعتماد في موضع الاستعادة يظلّ 409 ولا يُكتب شيء.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { waitForDemoSeed } from "./helpers/demoSeed";
import type { FSchedule } from "../src/types";
import { restoreBaselineWeek, suggestPlacements, sectionCards, type TmContext, type TmChange } from "../src/utils/timeMachine";
import { newHoursIssueOnly, hoursIssueKind } from "../src/utils/hoursIssue";
import { findConflicts, isBlockingConflict } from "../src/utils/scheduleIntelligence";
import { placeholderInstructorIds } from "../src/utils/instructorIdentity";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`); }
};

/* ══ A) وحدات نقية ═══════════════════════════════════════════════════════ */
{
  const under = "ساعات الشعبة 101 أقل من ساعات المقرر 150/200";
  const over = "ساعات الشعبة 101 تتجاوز ساعات المقرر";
  check(hoursIssueKind(under) === "under" && hoursIssueKind(over) === "over", "A1 نوع مخالفة الساعات: نقص أو زيادة");
  check(newHoursIssueOnly(under, under) === null, "A2 نقصٌ كان قائماً في الحالة المستعادة لا يمنع");
  check(newHoursIssueOnly(over, under) === over, "A3 زيادةٌ جديدة فوق نقصٍ قديم تمنع");
  check(newHoursIssueOnly(under, null) === under && newHoursIssueOnly(null, under) === null, "A4 مخالفةٌ لم تكن قائمة تمنع، ولا مخالفة لا شيء");
  const mk = (id: number, rev: number) => ({ id, rev }) as unknown as FSchedule;
  const week = [mk(1, 1), mk(2, 5), mk(3, 1), mk(50, 1)];
  const point = { before: [mk(2, 1)], createdIds: [10], afterRevs: { "2": 5, "10": 1 }, baseRevs: { "1": 1, "2": 1, "3": 1 } };
  check(restoreBaselineWeek(week, point, new Set([2])).map(r => r.id).join() === "1,2,3", "A5 الأختام: الصفُّ المستعاد يدخل، وما وُلد بعد الاعتماد (50) خارج");
  check(restoreBaselineWeek([mk(1, 1), mk(3, 9)], point, new Set()).map(r => r.id).join() === "1", "A6 صفٌّ تغيّر إصدارُه بعد الاعتماد لم يعد «كما كان»");
  const legacy = { before: [mk(2, 1)], createdIds: [10], afterRevs: { "2": 5, "10": 1 } };
  check(restoreBaselineWeek(week, legacy, new Set([2])).map(r => r.id).join() === "1,2,3", "A7 نقطةٌ قديمة بلا أختام: ما فوق أكبر ما لمسه الاعتماد وُلد بعده");
}

/* ══ B) الخادم ═══════════════════════════════════════════════════════════ */
const PORT = process.env.PORT || "4560";
const BASE = `http://localhost:${PORT}`;
const up = async () => { try { return (await fetch(BASE + "/api/public/me/state")).ok; } catch { return false; } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tm-restore-"));
let child: ReturnType<typeof spawn> | null = null;
const DAYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
try {
  if (await up()) console.log("   (تخطّي B: المنفذ مشغول بخادمٍ آخر)");
  else {
    child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, PORT, DATA_MODE: "demo", NODE_ENV: "development", SCHEDULE_PRIVATE_DIR: dir }, stdio: "ignore", detached: true });
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
    check((await call("POST", "/api/demo/role", { role: "committeeChair" })).status === 200, "B0 صفة رئيس لجنة الجدول");
    const ctx = (await call("GET", "/api/time-machine/context?collegeId=1&sectionId=1&termId=1")).body as TmContext;
    const scope = { collegeId: ctx.scope.collegeId, sectionId: ctx.scope.sectionId, termId: ctx.scope.termId };
    const qs = `collegeId=${scope.collegeId}&sectionId=${scope.sectionId}&termId=${scope.termId}`;
    const live = async () => (await call("GET", `/api/schedules?${qs}`)).body as FSchedule[];
    const board = [...ctx.rows, ...ctx.outside];
    const placeholders = placeholderInstructorIds(ctx.instructors);
    const blocking = (r: FSchedule, universe: FSchedule[]) => findConflicts([r], universe, { placeholderInstructorIds: placeholders }).filter(isBlockingConflict);
    const cards = sectionCards(board, ctx);
    const pickRow = (wantClash: boolean, skip: number[] = []): { row: FSchedule; spot: any } | null => {
      const candidates = ctx.rows.filter(r => !skip.includes(r.id) && r.buildingId && r.roomId && blocking(r, board).some(c => c.type === "room") === wantClash
        && (wantClash || blocking(r, board).length === 0) && (cards.find(card => card.rowIds.includes(r.id))?.rowIds.length || 0) === 1);
      for (const row of candidates) {
        const card = cards.find(c => c.rowIds.includes(row.id))!;
        const spot = suggestPlacements(board.filter(r => !card.rowIds.includes(r.id)), row.AdCourseId, ctx, { instructorId: row.AdInstructorId, max: 1 })[0];
        if (spot) return { row, spot };
      }
      return null;
    };
    const roomPatch = (r: FSchedule) => ({ AdRoomCode: r.AdRoomCode, AdRoomHall: r.AdRoomHall, buildingId: r.buildingId, roomId: r.roomId });
    const slotOf = (r: FSchedule) => ({ ...roomPatch(r), fstarttime: r.fstarttime, fendtime: r.fendtime, ...Object.fromEntries(DAYS.map(d => [d, Boolean((r as any)[d])])) });
    const moveOf = (id: string, row: FSchedule, spot: any): TmChange => ({ id, op: "move", rowId: row.id, days: spot.days, start: spot.start, end: spot.end, hall: spot.hall, label: "نقل" });
    const newScenario = async (name: string, change: TmChange) => (await call("POST", "/api/time-machine/scenarios", { ...scope, name, mode: "lab", changes: [change] })).body.scenario;
    const applyOk = async (id: string) => {
      const first = await call("POST", `/api/time-machine/scenarios/${id}/apply`, {});
      return first.body?.code === "regulation-exception" ? call("POST", `/api/time-machine/scenarios/${id}/apply`, { regulationException: true }) : first;
    };

    /* 1) موعدٌ يحمل تعارض قاعةٍ قائماً: اعتمادٌ ثم استعادةٌ إلى تلك الحالة تنجح. */
    const clashPick = pickRow(true);
    check(Boolean(clashPick), "B1 في الديمو موعدٌ يحمل تعارض قاعةٍ قائماً وله موضعٌ سليم");
    if (clashPick) {
      const { row: R, spot } = clashPick;
      const s1 = await newScenario("استعادة مع تعارض قديم", moveOf("m1", R, spot));
      const a1 = await applyOk(s1.id);
      check(a1.status === 200, "B2 الاعتمادُ ينقل الموعد خارج التعارض", [a1.status, a1.body?.error]);
      const r1 = await call("POST", `/api/time-machine/scenarios/${s1.id}/restore`, {});
      const back = (await live()).find(r => r.id === R.id);
      check(r1.status === 200 && back?.fstarttime === R.fstarttime && back?.roomId === R.roomId && r1.body?.scenario?.status === "restored",
        "B3 الاستعادةُ تنجح رغم أن الحالة المستعادة كانت تحمل تعارض قاعة (كانت 409)", [r1.status, r1.body?.error]);
    }

    /* 2) تعارضٌ جديد وُلد بعد الاعتماد في موضع الاستعادة: يمنع. */
    const cleanPick = pickRow(false, clashPick ? [clashPick.row.id] : []);
    check(Boolean(cleanPick), "B4 موعدٌ سليم له موضعٌ سليم لاختبار التعارض الجديد");
    if (cleanPick) {
      const { row: R, spot } = cleanPick;
      const s2 = await newScenario("استعادة مع تعارض جديد", moveOf("m2", R, spot));
      const a2 = await applyOk(s2.id);
      const afterRows = await live();
      const moved = afterRows.find(r => r.id === R.id)!;
      const intruder = afterRows.find(r => r.id !== R.id && r.roomId && r.AdInstructorId !== R.AdInstructorId && !blocking(r, afterRows).length
        && !blocking({ ...r, ...slotOf(R) } as FSchedule, afterRows.filter(x => x.id !== r.id && x.id !== R.id)).length);
      check(a2.status === 200 && Boolean(intruder), "B5 اعتمادٌ ثانٍ، وصفٌّ دخيلٌ يصلح لحجز موضع الاستعادة", [a2.status, a2.body?.error, Boolean(intruder)]);
      if (intruder) {
        const moveIn = await call("POST", "/api/schedules/move-batch", { moves: [{ id: intruder.id, rev: intruder.rev, fields: slotOf(R) }] });
        const placed = (await live()).find(r => r.id === intruder.id)!;
        const r2 = await call("POST", `/api/time-machine/scenarios/${s2.id}/restore`, {});
        const still = (await live()).find(r => r.id === R.id)!;
        if (placed.roomId !== R.roomId || placed.fstarttime !== R.fstarttime) check(false, "B6 تعذّر تجهيز التعارض الجديد", [moveIn.status, moveIn.body?.error]);
        else check(r2.status === 409 && still.fstarttime === moved.fstarttime && still.roomId === moved.roomId,
          "B6 تعارضٌ جديد وُلد بعد الاعتماد: الاستعادةُ 409 ولا يُكتب شيء", [r2.status, r2.body?.error, still.fstarttime]);
      }
    }
  }
} catch (error) {
  failed++;
  console.log("\x1b[31m✗ تعطّل الاختبار\x1b[0m", error instanceof Error ? error.stack : error);
} finally {
  if (child?.pid) { try { process.kill(-child.pid, "SIGTERM"); } catch { /* انتهى */ } }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${failed ? "\x1b[31m" : "\x1b[32m"}${passed} passed, ${failed} failed\x1b[0m`);
process.exit(failed ? 1 : 0);
