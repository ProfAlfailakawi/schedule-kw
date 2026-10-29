/**
 * ── النبضة على خادمٍ حقيقي: شخصان على جدولٍ واحد ──────────────────────────
 *
 * live-pulse-audit.ts checks the parts; this one asks a real server in demo
 * mode the real question, as two different people on the same board. A demo
 * sandbox has one session cookie, so the second person is made the way the
 * demo itself makes them: the stream is opened as the timetable committee
 * chair, then the same session switches to the department head — the stream
 * keeps the identity it connected with, exactly as a colleague's would.
 *
 *   H1–H2 alone, and alone with my own stream: no company;
 *   H3    a colleague on my board: one person, however many connections;
 *   H4–H5 only a tab's own account can retire it, and then company is gone;
 *   H6    another demo sandbox on the same numbers is nobody's company;
 *   H7    a note on a row moves the bell's time;
 *   H8    a saved row moves the board's time — the very time the stream
 *         announced, so a screen can tell the two channels' news apart;
 *   H9    and it does not move another sandbox's time.
 *
 * Port: PORT (default 3000). Skips itself if something else is on the port.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { waitForDemoSeed } from "./helpers/demoSeed";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); }
};
const PORT = process.env.PORT || "3000";
const BASE = `http://localhost:${PORT}`;
const up = async () => { try { return (await fetch(BASE + "/api/public/me/state")).ok; } catch { return false; } };
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const BOARD = "college=1&section=1&term=1";

async function demoSession() {
  const login = await fetch(BASE + "/api/auth/demo", { method: "POST" });
  const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
  await waitForDemoSeed(BASE, cookie);
  const call = (url: string, init: RequestInit = {}) => fetch(BASE + url, {
    ...init,
    headers: { cookie, origin: BASE, ...(init.body ? { "content-type": "application/json" } : {}) },
  });
  const as = async (role: string) => {
    const response = await call("/api/demo/role", { method: "POST", body: JSON.stringify({ role }) });
    return (await response.json())?.user?.SystemUserId as number;
  };
  const pulse = async (conn: string, board = BOARD) => (await call(`/api/schedules/pulse?conn=${conn}&${board}`)).json() as Promise<{ company: number; changedAt: number; notifiedAt: number }>;
  const leave = async (conn: string) => (await call(`/api/schedules/pulse?conn=${conn}`, { method: "POST" })).status;
  /* A stream held open the way a browser holds it: the body is read as it
     arrives, and every `schedules` event's time is kept. */
  const stream = async (conn: string) => {
    const abort = new AbortController();
    const response = await fetch(`${BASE}/api/schedules/events?conn=${conn}&${BOARD}`, { headers: { cookie }, signal: abort.signal });
    const changes: number[] = [];
    let text = "";
    const reader = response.body!.getReader();
    const pump = (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          text += new TextDecoder().decode(value);
          for (const match of text.matchAll(/event: schedules\ndata: \{"changedAt":(\d+)\}/g)) {
            const at = Number(match[1]);
            if (!changes.includes(at)) changes.push(at);
          }
        }
      } catch { /* aborted */ }
    })();
    for (let i = 0; i < 50 && !text.includes("retry:"); i++) await pause(100);
    return { changes, opened: text.includes("retry:"), close: async () => { abort.abort(); await pump; } };
  };
  return { cookie, call, as, pulse, leave, stream };
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-live-pulse-"));
let child: ReturnType<typeof spawn> | null = null;
try {
  if (await up()) {
    console.log("   (تخطّي: المنفذ مشغول بخادمٍ آخر)");
  } else {
    child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, PORT, DATA_MODE: "demo", NODE_ENV: "development", SCHEDULE_PRIVATE_DIR: dir }, stdio: "ignore", detached: true });
    let ready = false;
    for (let i = 0; i < 120 && !ready; i += 1) { ready = await up(); if (!ready) await pause(1000); }
    if (!ready) throw new Error("الخادم لم يبدأ");

    const one = await demoSession();
    const chair = await one.as("committeeChair");
    const alone = await one.pulse("chair-tab");
    check(alone.company === 0 && alone.changedAt > 0 && alone.notifiedAt > 0, "H1 وحدي على الجدول: لا أحد، والوقتان حاضران", alone);

    const chairStream = await one.stream("chair-stream");
    check(chairStream.opened, "H2a البثّ يُفتح كما كان لمن يطلبه");
    check((await one.pulse("chair-tab")).company === 0, "H2 بثّي أنا لا يُعدّ رفقةً لي");

    const head = await one.as("departmentHead");
    check(Boolean(chair && head && chair !== head), "H3a شخصان مختلفان في الصندوق نفسه", { chair, head });
    check((await one.pulse("head-tab")).company === 1, "H3 زميلٌ على جدولي ببثٍّ ونبضة: شخصٌ واحد");

    check(await one.leave("chair-tab") === 204, "H4a طلبُ الرحيل عن لسانٍ ليس لي يُقبل بلا أثر");
    await chairStream.close();
    await pause(300);
    check((await one.pulse("head-tab")).company === 1, "H4 لا يُرحَّل لسانُ أحدٍ إلا بحسابه: الزميل ما زال هنا");

    await one.as("committeeChair");
    await one.leave("chair-tab");
    await one.as("departmentHead");
    check((await one.pulse("head-tab")).company === 0, "H5 صاحبُ اللسان رحّله: لا أحد");

    const two = await demoSession();
    await two.as("committeeChair");
    await one.pulse("head-tab");
    check((await two.pulse("other-sandbox-tab")).company === 0, "H6 صندوقٌ آخر بالأرقام نفسها ليس رفقة");

    const beforeNote = await one.pulse("head-tab");
    const note = await one.call("/api/schedule-notes", { method: "POST", body: JSON.stringify({ scheduleId: 1, field: "row", text: "اختبار النبضة" }) });
    const afterNote = await one.pulse("head-tab");
    check(note.status < 300 && afterNote.notifiedAt > beforeNote.notifiedAt, "H7 ملاحظةٌ على موعد تُقدّم وقتَ الجرس", { status: note.status, before: beforeNote.notifiedAt, after: afterNote.notifiedAt });

    /* A row that saves cleanly (the demo data carries a few honest clashes). */
    const saveOne = async (session: Awaited<ReturnType<typeof demoSession>>) => {
      const rows = await (await session.call("/api/schedules?collegeId=1&sectionId=1&termId=1")).json() as any[];
      for (const row of rows.slice(0, 25)) {
        const response = await session.call(`/api/schedules/${row.id}`, { method: "PUT", body: JSON.stringify({ ...row, fdetail: `${row.fdetail || ""} ` }) });
        if (response.ok) return { id: row.id as number, row };
      }
      return null;
    };
    await one.as("committeeChair");
    const watching = await one.stream("chair-watch");
    const saved = await saveOne(one);
    for (let i = 0; i < 30 && !watching.changes.length; i++) await pause(100);
    const afterSave = await one.pulse("chair-tab");
    await watching.close();
    check(Boolean(saved) && watching.changes.length > 0, "H8a موعدٌ حُفظ، والبثّ أعلنه", { saved: saved?.id, changes: watching.changes });
    check(afterSave.changedAt === Math.max(...watching.changes), "H8 والنبضةُ تقول الوقتَ نفسه الذي قاله البثّ", { pulse: afterSave.changedAt, stream: watching.changes });
    // The other sandbox may be busy with its own showcase; what it must not
    // carry is THIS save's time.
    const otherAfter = await two.pulse("other-sandbox-tab");
    check(!watching.changes.includes(otherAfter.changedAt), "H9 ولا يوقظ صندوقاً آخر", { other: otherAfter.changedAt, mine: watching.changes });

    /* Two sandboxes save in the same 350 ms. The window used to keep only the
       first writer, so one of the two boards never heard of its own save. */
    await two.as("committeeChair");
    const [oneRows, twoRows] = await Promise.all([
      one.call("/api/schedules?collegeId=1&sectionId=1&termId=1").then(r => r.json() as Promise<any[]>),
      two.call("/api/schedules?collegeId=1&sectionId=1&termId=1").then(r => r.json() as Promise<any[]>),
    ]);
    const oneRow = oneRows.find(row => row.id === saved?.id);
    const twoRow = twoRows.find(row => row.id === saved?.id);
    const [oneWatch, twoWatch] = await Promise.all([one.stream("together-one"), two.stream("together-two")]);
    const [oneSave, twoSave] = await Promise.all([
      one.call(`/api/schedules/${oneRow?.id}`, { method: "PUT", body: JSON.stringify({ ...oneRow, fdetail: `${oneRow?.fdetail || ""} ` }) }),
      two.call(`/api/schedules/${twoRow?.id}`, { method: "PUT", body: JSON.stringify({ ...twoRow, fdetail: `${twoRow?.fdetail || ""} ` }) }),
    ]);
    for (let i = 0; i < 30 && (!oneWatch.changes.length || !twoWatch.changes.length); i++) await pause(100);
    await Promise.all([oneWatch.close(), twoWatch.close()]);
    check(oneSave.ok && twoSave.ok && oneWatch.changes.length > 0 && twoWatch.changes.length > 0, "H10 صندوقان حفظا في اللحظة نفسها: كلٌّ يسمع حفظه، لا الأوّلُ وحده", { one: [oneSave.status, oneWatch.changes.length], two: [twoSave.status, twoWatch.changes.length] });
  }
} finally {
  if (child?.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { try { child.kill("SIGKILL"); } catch { /* ended */ } } }
}
console.log(`\nLive pulse HTTP audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
