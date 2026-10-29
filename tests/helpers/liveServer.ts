/**
 * ── خادمُ تجربةٍ لاختبارٍ حيّ: منفذٌ حرّ، وإغلاقٌ مضمون ─────────────────────────────
 *
 * كان الاختبارُ الحيّ يشغّل خادمه على 3000، فإن وجده مشغولاً بخادمٍ تركه اختبارٌ قبله «تخطّى»
 * نفسَه وخرج ناجحاً؛ وكان يقتل npx وحده أو يرسل SIGTERM فيبقى الخادمُ حيّاً على المنفذ بعده.
 * هنا ثلاثةُ ضمانات:
 *   • منفذٌ يحجزه النظام (لا 3000)، فلا يزاحم الاختبارُ خادماً آخر ولا يتخطّى نفسه أبداً؛
 *   • الخادمُ في فوج عملياتٍ مستقل (npx ← tsx ← الخادم)، ويُقتل الفوجُ كلُّه بـSIGKILL؛
 *   • القتلُ عند الإيقاف وعند كل خروجٍ للعملية — فشلُ تحقّق، استثناءٌ لم يُلتقط، أو إشارة —
 *     ثم يُتحقَّق أن المنفذ أُغلق فعلاً، وإلا خرج الاختبارُ فاشلاً.
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export interface LiveServer {
  base: string;
  port: number;
  /** يقتل فوجَ الخادم وينتظر حتى يُغلق المنفذ. آمنٌ إن نودي مرتين. */
  stop: () => Promise<void>;
}

const running = new Set<ChildProcess>();
const killGroup = (child: ChildProcess) => {
  if (!child.pid) return;
  try { process.kill(-child.pid, "SIGKILL"); } catch { try { child.kill("SIGKILL"); } catch { /* انتهى */ } }
};
/* شبكةُ أمان: ما لم يُوقَف صراحةً يُقتل حين تخرج العملية لأي سبب. القتلُ متزامن فيصلح داخل «exit». */
process.once("exit", () => { for (const child of running) killGroup(child); });
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.once(signal, () => { for (const child of running) killGroup(child); process.exit(1); });
}

/** منفذٌ يحجزه النظام ثم يُفلته فوراً ليأخذه الخادم. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", reject);
    probe.listen(0, "0.0.0.0", () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

/** هل يقبل المنفذُ اتصالاً الآن؟ */
const accepting = (port: number) => new Promise<boolean>(resolve => {
  const socket = net.connect({ port, host: "127.0.0.1" });
  socket.once("connect", () => { socket.destroy(); resolve(true); });
  socket.once("error", () => resolve(false));
  socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
});
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * يشغّل `tsx server.ts` في وضع التجربة على منفذٍ حرّ وينتظر حتى يجيب.
 * `label` يسمّي المجلد الخاص المؤقت (SCHEDULE_PRIVATE_DIR) الذي يُمحى عند الإيقاف.
 */
export async function startDemoServer(label: string, timeoutMs = 180_000): Promise<LiveServer> {
  let lastError = "";
  /* منفذٌ حجزه غيرُنا بين إفلاته وأخذ الخادم له نادر؛ يُعاد بمنفذٍ آخر بدل أن يفشل الاختبار. */
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const port = await freePort();
    const base = `http://localhost:${port}`;
    const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), `schedule-${label}-`));
    const child = spawn("npx", ["tsx", "server.ts"], {
      env: { ...process.env, PORT: String(port), DATA_MODE: "demo", NODE_ENV: "development", SCHEDULE_PRIVATE_DIR: privateDir },
      stdio: ["ignore", "pipe", "pipe"], detached: true,
    });
    running.add(child);
    /* آخرُ ما كتبه الخادم: يُطبع إن لم يبدأ، فلا يبقى الفشلُ بلا سبب. */
    let tail = "";
    const keep = (chunk: Buffer) => { tail = (tail + chunk.toString()).slice(-4000); };
    child.stdout?.on("data", keep);
    child.stderr?.on("data", keep);
    let exited = false;
    const exit = new Promise<void>(resolve => child.once("exit", () => { exited = true; resolve(); }));

    let stopped = false, answered = false;
    const stop = async () => {
      if (stopped) return;
      stopped = true;
      killGroup(child);
      await Promise.race([exit, wait(5_000)]);
      running.delete(child);
      /* الخادمُ حفيدُ npx: يُنتظر حتى يُغلق المنفذ فعلاً، وإلا فقد بقي شيءٌ حيّاً.
         (خادمٌ لم يُجب قطّ لا يُحاسَب: ربما أخذ المنفذَ غيرُه قبله.) */
      for (let i = 0; answered && i < 20 && await accepting(port); i += 1) await wait(250);
      if (answered && await accepting(port)) {
        console.error(`\x1b[31m✗ بقي خادمٌ على المنفذ ${port} بعد إيقافه\x1b[0m`);
        process.exitCode = 1;
      }
      fs.rmSync(privateDir, { recursive: true, force: true });
    };

    const until = Date.now() + timeoutMs;
    while (!exited && Date.now() < until) {
      try { if ((await fetch(`${base}/api/public/me/state`)).ok) { answered = true; return { base, port, stop }; } } catch { /* لم يبدأ بعد */ }
      await wait(1000);
    }
    /* خروجٌ مبكر (منفذٌ أُخذ في اللحظة نفسها) يُعاد بمنفذٍ آخر؛ أما انقضاءُ المهلة فلا يُعاد. */
    const crashed = exited;
    lastError = crashed ? `خرج الخادم قبل أن يجيب (المنفذ ${port})` : `لم يجب الخادم خلال ${Math.round(timeoutMs / 1000)} ثانية`;
    console.error(`${lastError}\n${tail}`);
    await stop();
    if (!crashed) break;
  }
  throw new Error(`الخادم لم يبدأ: ${lastError}`);
}
