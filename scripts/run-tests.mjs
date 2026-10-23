/**
 * ── مشغّلُ «npm test» ────────────────────────────────────────────────────────
 *
 * كانت الاختباراتُ سلسلةً واحدةً من `&&` في package.json، ولها ثلاثُ عِلل:
 *
 *  ١) تقف عند أول فشل، فلا يُعرف حالُ ما بعده إلا بتشغيله واحداً واحداً.
 *  ٢) كلُّ طلبَي دمجٍ يضيفان اختباراً يتعارضان على السطر نفسه.
 *  ٣) اختبارٌ يترك خادمَه حيّاً على المنفذ 3000 يجعل كلَّ اختبارٍ حيٍّ بعده يقول
 *     «تخطّي: المنفذ مشغول» ويخرج ناجحاً — فكان CI أخضرَ وثمانيةُ اختباراتٍ حيّةٍ
 *     لا تعمل أصلاً، وثلاثةٌ منها فاشلةٌ فعلاً.
 *
 * فالقائمةُ في tests/suite.txt (سطرٌ لكل سكربت)، ويُشغَّل كلُّها ولو فشل بعضُها،
 * ويُحسب فاشلاً:
 *  - اختبارٌ خرج بغير صفر؛
 *  - اختبارٌ تخطّى جزأه الحيَّ لأن المنفذ مشغول (لا يُخفى التخطّي نجاحاً)؛
 *  - اختبارٌ ترك بعده خادماً يستمع على المنفذ — ويُغلق ذلك الخادمُ فلا يُفسد ما بعده.
 *
 * والفاشلُ المعروفُ في tests/known-failures.txt يُشغَّل ويُطبع ولا يُسقط التشغيل؛
 * فإن نجح طُلب حذفُه من القائمة، حتى لا تبقى القائمةُ مخبأً.
 *
 * التشغيل: `npm test`، أو `npm test -- test:publish-requests test:request-reissue` لبعضها.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const PORT = Number(process.env.PORT || 3000);
const root = process.cwd();
const scripts = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts || {};
const listed = fs.readFileSync(path.join(root, "tests/suite.txt"), "utf8")
  .split("\n").map(line => line.trim()).filter(line => line && !line.startsWith("#"));
const known = new Set(fs.readFileSync(path.join(root, "tests/known-failures.txt"), "utf8")
  .split("\n").map(line => line.trim()).filter(line => line && !line.startsWith("#")));
const wanted = process.argv.slice(2);
const suite = wanted.length ? wanted : listed;

const unknown = suite.filter(name => !scripts[name]);
if (unknown.length) {
  console.error(`سكربتاتٌ في القائمة لا وجود لها في package.json: ${unknown.join("، ")}`);
  process.exit(1);
}
const dupes = listed.filter((name, i) => listed.indexOf(name) !== i);
if (dupes.length) {
  console.error(`مكرّرٌ في tests/suite.txt: ${[...new Set(dupes)].join("، ")}`);
  process.exit(1);
}

const portBusy = () => new Promise(resolve => {
  const socket = net.connect({ port: PORT, host: "127.0.0.1" });
  socket.once("connect", () => { socket.destroy(); resolve(true); });
  socket.once("error", () => resolve(false));
  socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
});

/** يغلق ما يستمع على المنفذ — خادمٌ تركه اختبار. */
const freePort = () => {
  const found = spawnSync("lsof", ["-t", `-iTCP:${PORT}`, "-sTCP:LISTEN"], { encoding: "utf8" });
  const pids = String(found.stdout || "").split("\n").map(Number).filter(Boolean);
  for (const pid of pids) { try { process.kill(pid, "SIGKILL"); } catch { /* انتهى */ } }
  if (!pids.length) spawnSync("pkill", ["-9", "-f", "[t]sx server.ts"]);
};

const run = name => new Promise(resolve => {
  const child = spawn("npm", ["run", "-s", name], { stdio: ["ignore", "pipe", "pipe"], env: process.env });
  let output = "";
  const take = stream => chunk => { output += chunk; stream.write(chunk); };
  child.stdout.on("data", take(process.stdout));
  child.stderr.on("data", take(process.stderr));
  child.on("close", code => resolve({ code: code ?? 1, output }));
});

if (await portBusy()) {
  console.error(`المنفذ ${PORT} مشغولٌ قبل البدء: الاختباراتُ الحيّة ستتخطّى نفسها. أغلق ما عليه ثم أعد.`);
  process.exit(1);
}

const failures = [];
const knownFailed = [];
const healed = [];
const started = Date.now();
for (const name of suite) {
  console.log(`\n\x1b[1m▶ ${name}\x1b[0m`);
  const { code, output } = await run(name);
  const reasons = [];
  if (code !== 0) reasons.push(`خرج بـ ${code}`);
  if (/تخطّي[^\n]*المنفذ مشغول/.test(output)) reasons.push("تخطّى جزأه الحيّ لأن المنفذ مشغول");
  if (await portBusy()) {
    reasons.push(`ترك خادماً على المنفذ ${PORT}`);
    freePort();
  }
  if (known.has(name)) { if (reasons.length) knownFailed.push({ name, reasons }); else healed.push(name); }
  else if (reasons.length) failures.push({ name, reasons });
}

const minutes = ((Date.now() - started) / 60000).toFixed(1);
console.log(`\n\x1b[1m${suite.length - failures.length - knownFailed.length} من ${suite.length} نجحت (${minutes} دقيقة)\x1b[0m`);
for (const failure of knownFailed) console.log(`\x1b[33m! ${failure.name}: فاشلٌ معروف (tests/known-failures.txt) — ${failure.reasons.join(" · ")}\x1b[0m`);
for (const name of healed) console.log(`\x1b[31m✗ ${name}: نجح وهو في tests/known-failures.txt — احذفه من القائمة\x1b[0m`);
for (const failure of failures) console.log(`\x1b[31m✗ ${failure.name}: ${failure.reasons.join(" · ")}\x1b[0m`);
process.exit(failures.length || healed.length ? 1 : 0);
