/**
 * ── تكافؤ الخادم قبل تقسيم server.ts وبعده ──────────────────────────────────
 *
 * تقسيمُ server.ts نقلٌ بلا تغيير، وهذا الاختبارُ يحكم بذلك من الخارج:
 *
 *  ١) جدولُ الموجّه: يُحمَّل الخادمُ في الوضع التجريبي دون أن يستمع على منفذ
 *     (app.listen مُعطَّل هنا)، ويُقرأ مكدّسُ الموجّه بترتيبه — كلُّ طريقٍ ووسيط،
 *     ومن أين سُجّل — ويُقارن بلقطةٍ أُخذت من server.ts قبل التقسيم:
 *       R1 مجموعةُ (الطريقة، المسار) هي هي، بتكرارها؛
 *       R2 كلُّ طبقتين يمكن أن يطابقهما طلبٌ واحد بقيتا على ترتيبهما
 *          (عيّنةُ عناوين من كلٍّ تُختبر على تعبيرَي Express نفسيهما)؛
 *       R3 والوسائطُ (app.use) بقيت بترتيبها، وكلُّ وسيطٍ في موضعه من كل طريقٍ يلتقي به.
 *     وتُعرَف الطبقةُ بنصّ استدعائها (app.get(...) كما كُتب) لا بسطرها، فالنقلُ لا يغيّرها.
 *
 *  ٢) الصفحات: بُناةُ الصفحات (‎*Page‎) يُستدعون بمدخلاتٍ ثابتة، ويجب أن يُخرجوا
 *     البايتاتِ نفسَها (sha256) التي أخرجوها قبل التقسيم.
 *
 *  ٣) لا وحدةَ في src/ تستورد server.ts.
 *
 * اللقطتان: tests/fixtures/server-route-table.json وtests/fixtures/server-pages.json.
 * تُؤخذان من server.ts غير المقسوم: `npx tsx tests/server-route-parity-audit.ts --update`
 * (والأداةُ تأبى أخذهما من ملفٍّ مقسوم إلا بـ--force).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import express from "express";
// @ts-ignore — وحدةُ .mjs بلا أنواع
import { layersOverlap, makeLayer } from "../scripts/split-server/routeOverlap.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript") as typeof import("typescript");

const ROOT = process.cwd();
const ROUTE_FIXTURE = path.join(ROOT, "tests/fixtures/server-route-table.json");
const PAGE_FIXTURE = path.join(ROOT, "tests/fixtures/server-pages.json");
const UPDATE = process.argv.includes("--update");
const FORCE = process.argv.includes("--force");

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); if (extra !== undefined) console.log(typeof extra === "string" ? extra : JSON.stringify(extra, null, 2).slice(0, 4000)); }
};
const sha = (text: string) => crypto.createHash("sha256").update(text).digest("hex");

/* ── البيئة: تجريبيّ، بلا منفذ، وبلا Vite ──
   startServer يقدّم dist/ بدل Vite إن كان npm_lifecycle_event=start (كما في «npm start»)،
   ولا يمسّ هذا المتغيّرَ شيءٌ غيره؛ وNODE_ENV=production يمنع قاعدة الوضع التجريبي. */
const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-route-parity-"));
process.env.DATA_MODE = "demo";
process.env.NODE_ENV = "development";
process.env.npm_lifecycle_event = "start";
process.env.SCHEDULE_PRIVATE_DIR = privateDir;
delete process.env.FIRESTORE_EMULATOR_HOST;

/* ── من أين سُجّلت الطبقة: نصُّ الاستدعاء الذي سجّلها ── */
Error.stackTraceLimit = 50;
const sourceCache = new Map<string, import("typescript").SourceFile>();
const VERBS = new Set(["get", "post", "put", "patch", "delete", "all", "use", "head", "options"]);
function callSite(): { site: string; call: string | null } {
  const frames = String(new Error().stack || "").split("\n").slice(2);
  for (const frame of frames) {
    const m = frame.match(/\(?((?:file:\/\/)?\/[^():]+\.(?:ts|mts|js|mjs|cjs)):(\d+):(\d+)\)?\s*$/);
    if (!m) continue;
    const file = m[1].replace(/^file:\/\//, "");
    if (!file.startsWith(ROOT) || file.includes("/node_modules/") || file.endsWith("server-route-parity-audit.ts")) continue;
    const line = Number(m[2]), col = Number(m[3]);
    let sf = sourceCache.get(file);
    if (!sf) {
      if (!fs.existsSync(file)) continue;
      sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
      sourceCache.set(file, sf);
    }
    const lineText = sf.text.split("\n")[line - 1] || "";
    if (lineText.includes("args.map(asyncSafe)")) continue; // غلافُ asyncSafe: المستدعي الحقيقيّ بعده
    const pos = sf.getPositionOfLineAndCharacter(line - 1, col - 1);
    let best: import("typescript").CallExpression | null = null;
    const visit = (node: import("typescript").Node) => {
      if (pos < node.getStart(sf!) || pos >= node.end) return;
      if (ts.isCallExpression(node) && (ts.isPropertyAccessExpression(node.expression) ? VERBS.has(node.expression.name.text) : ts.isElementAccessExpression(node.expression))) best = node;
      ts.forEachChild(node, visit);
    };
    visit(sf);
    const rel = path.relative(ROOT, file).replace(/^server\.parity-\d+\.ts$/, "server.ts");
    return { site: `${rel}:${line}`, call: best ? (best as import("typescript").CallExpression).getText(sf) : null };
  }
  return { site: "express", call: null };
}

type Captured = { site: string; call: string | null; path: unknown };
const proto = (express as any).Router;
const originalRoute = proto.route;
const originalUse = proto.use;
proto.route = function (this: any, routePath: unknown) {
  const route = originalRoute.call(this, routePath);
  const layer = this.stack[this.stack.length - 1];
  layer.__parity = { ...callSite(), path: routePath } satisfies Captured;
  return route;
};
proto.use = function (this: any, fn: unknown, ...rest: unknown[]) {
  const before = this.stack.length;
  let mount: unknown = "/";
  if (typeof fn !== "function") {
    let arg: unknown = fn;
    while (Array.isArray(arg) && arg.length !== 0) arg = arg[0];
    if (typeof arg !== "function") mount = fn;
  }
  const result = originalUse.call(this, fn, ...rest);
  const where = callSite();
  for (const layer of this.stack.slice(before)) layer.__parity = { ...where, path: mount } satisfies Captured;
  return result;
};
let resolveListen: (app: any) => void;
const listened = new Promise<any>(resolve => { resolveListen = resolve; });
(express as any).application.listen = function (this: any) {
  resolveListen(this);
  return { close() {}, on() {}, address() { return null; } };
};

/* ── المدخل: server.ts، أو نسخةٌ منه تصدّر بُناةَ الصفحات إن لم يُقسَم بعد ── */
const serverText = fs.readFileSync(path.join(ROOT, "server.ts"), "utf8");
const unsplit = /^(?:async )?function \w+Page\(/m.test(serverText);
if (UPDATE && !unsplit && !FORCE) {
  console.error("اللقطةُ تؤخذ من server.ts قبل التقسيم. (--force لأخذها من المقسوم.)");
  process.exit(1);
}
let entry = path.join(ROOT, "server.ts");
let tempEntry: string | null = null;
if (unsplit) {
  tempEntry = path.join(ROOT, `server.parity-${process.pid}.ts`);
  fs.writeFileSync(tempEntry, serverText.replace(/^((?:async )?function \w+Page\()/gm, "export $1"));
  entry = tempEntry;
}
const cleanup = () => { if (tempEntry && fs.existsSync(tempEntry)) fs.rmSync(tempEntry); fs.rmSync(privateDir, { recursive: true, force: true }); };
process.on("exit", cleanup);

const serverModule: any = await import(pathToFileURL(entry).href);
const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("الخادم لم يصل إلى app.listen خلال 240 ثانية")), 240_000));
const app = await Promise.race([listened, timeout]);

/* ── المكدّس ── */
type Row = { kind: "route" | "middleware"; methods: string[]; path: unknown; name: string; call: string | null; site: string; regexp: string; end: boolean };
const rows: Row[] = app._router.stack.map((layer: any) => {
  const captured: Captured = layer.__parity || { site: "express", call: null, path: layer.route?.path ?? "/" };
  const isRoute = Boolean(layer.route);
  return {
    kind: isRoute ? "route" : "middleware",
    methods: isRoute ? Object.keys(layer.route.methods).filter(m => layer.route.methods[m]).sort() : [],
    path: isRoute ? layer.route.path : captured.path,
    name: layer.name,
    call: captured.call ? sha(captured.call).slice(0, 16) : null,
    site: captured.site,
    regexp: String(layer.regexp),
    end: isRoute,
  };
});

/* ── الصفحات ── */
const TOKEN = "tok_9F3aZx-Q1", TOKEN2 = "demo.Ab12_cd34", NONCE = "bm9uY2UtZml4ZWQ=";
const LABEL = "قسم الرياضيات — كلية العلوم", LABEL2 = `<b class="x">قسم &amp; "مختبر" 'أ'</b>`;
const HINT = `<div class="demo-hint" role="note">رقمٌ وهمي: <bdi>123456789012</bdi></div>`;
const PAGE_INPUTS: Record<string, unknown[][]> = {
  staffCardPage: [[TOKEN, LABEL, NONCE], [TOKEN2, LABEL2, NONCE, HINT]],
  surveyPage: [[TOKEN, LABEL, NONCE], [TOKEN2, LABEL2, NONCE]],
  studentCaseSurveyPage: [[TOKEN, LABEL, NONCE], [TOKEN2, LABEL2, NONCE, HINT]],
  instructorRequestPage: [[TOKEN, NONCE], [TOKEN2, NONCE, HINT]],
  publicInvalidLinkPage: [["انتهت صلاحية هذا الرابط."], [`<script>alert("x")</script> & 'y'`]],
  studentCaseStatusPage: [[TOKEN, NONCE], [TOKEN2, NONCE, HINT]],
  studentSchedulePage: [[TOKEN, LABEL, NONCE], [TOKEN2, LABEL2, NONCE]],
};
async function findPageBuilder(name: string): Promise<((...args: unknown[]) => string) | null> {
  if (typeof serverModule[name] === "function") return serverModule[name];
  for (const dir of ["src/server/pages", "src/server/core", "src/server/routes"]) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of fs.readdirSync(abs).filter(f => f.endsWith(".ts")).sort()) {
      const mod: any = await import(pathToFileURL(path.join(abs, file)).href);
      if (typeof mod[name] === "function") return mod[name];
    }
  }
  return null;
}
const pages: Record<string, { sha256: string; length: number }> = {};
for (const [name, inputs] of Object.entries(PAGE_INPUTS)) {
  const fn = await findPageBuilder(name);
  if (!fn) { pages[`${name}#missing`] = { sha256: "", length: -1 }; continue; }
  inputs.forEach((input, i) => {
    const html = fn(...input);
    const again = fn(...input);
    if (html !== again) console.log(`! ${name}#${i} غير حتميّ`);
    pages[`${name}#${i}`] = { sha256: sha(html), length: html.length };
  });
}

if (UPDATE) {
  fs.mkdirSync(path.dirname(ROUTE_FIXTURE), { recursive: true });
  fs.writeFileSync(ROUTE_FIXTURE, JSON.stringify({ note: "من server.ts قبل التقسيم — tests/server-route-parity-audit.ts --update", layers: rows }, null, 1) + "\n");
  fs.writeFileSync(PAGE_FIXTURE, JSON.stringify({ note: "sha256 لمخرجات بُناة الصفحات بمدخلات tests/server-route-parity-audit.ts", pages }, null, 1) + "\n");
  console.log(`كُتبت اللقطتان: ${rows.length} طبقة، ${Object.keys(pages).length} صفحة.`);
  process.exit(0);
}

/* ── R1–R3 ── */
const before: Row[] = JSON.parse(fs.readFileSync(ROUTE_FIXTURE, "utf8")).layers;
const after = rows;
const mp = (r: Row) => `${r.kind} ${r.methods.join(",") || "*"} ${JSON.stringify(r.path)}`;
const multiset = (list: Row[]) => { const m = new Map<string, number>(); for (const r of list) m.set(mp(r), (m.get(mp(r)) || 0) + 1); return m; };
{
  const a = multiset(before), b = multiset(after);
  const diff: string[] = [];
  for (const [k, n] of a) if ((b.get(k) || 0) !== n) diff.push(`${k}: قبل ${n}، بعد ${b.get(k) || 0}`);
  for (const [k, n] of b) if (!a.has(k)) diff.push(`${k}: قبل 0، بعد ${n}`);
  check(diff.length === 0, `R1 مجموعةُ (الطريقة، المسار) نفسُها — ${before.length} طبقة قبل، ${after.length} بعد`, diff.join("\n"));
}
// مطابقةُ كل طبقةٍ قبلُ بطبقتها بعدُ: بالمسار ونصّ الاستدعاء، وبترتيب التكرار
const identity = (r: Row) => `${mp(r)} ${r.call || "-"} ${r.name}`;
const positions = new Map<string, number[]>();
after.forEach((r, i) => { const k = identity(r); if (!positions.has(k)) positions.set(k, []); positions.get(k)!.push(i); });
const seen = new Map<string, number>();
const mapped: number[] = before.map(r => {
  const k = identity(r);
  const n = seen.get(k) || 0;
  seen.set(k, n + 1);
  return positions.get(k)?.[n] ?? -1;
});
const unmatched = before.map((r, i) => (mapped[i] < 0 ? `${r.site} ${identity(r)}` : null)).filter(Boolean);
check(unmatched.length === 0, `R1b كلُّ طبقةٍ وُجدت بنصّ استدعائها نفسِه (${before.length - unmatched.length}/${before.length})`, unmatched.join("\n"));

const asLayer = (r: Row) => {
  const paths = Array.isArray(r.path) ? (r.path as unknown[]).flat(Infinity).map(String) : [String(r.path)];
  const layer = makeLayer({ kind: r.kind, methods: r.methods.length ? r.methods : ["all"], paths });
  if (r.kind === "middleware" && paths.length === 1 && paths[0] === "/") layer.regexp.fast_slash = true;
  return layer;
};
const layers = before.map(asLayer);
const swapped: string[] = [];
let pairs = 0;
for (let i = 0; i < before.length; i += 1) {
  if (mapped[i] < 0) continue;
  for (let j = i + 1; j < before.length; j += 1) {
    if (mapped[j] < 0) continue;
    if (!layersOverlap(layers[i], layers[j])) continue;
    pairs += 1;
    if (mapped[i] > mapped[j]) swapped.push(`${before[i].site} ${mp(before[i])}  ⟷  ${before[j].site} ${mp(before[j])}`);
  }
}
check(swapped.length === 0, `R2 كلُّ طبقتين تلتقيان على طلبٍ بقيتا على ترتيبهما (${pairs} زوجاً)`, swapped.slice(0, 40).join("\n"));

const mwBefore = before.map((r, i) => (r.kind === "middleware" ? mapped[i] : -2)).filter(i => i !== -2);
check(mwBefore.every((p, k) => k === 0 || p > mwBefore[k - 1]), `R3 الوسائطُ (${mwBefore.length}) بترتيبها نفسه`);

/* ── الصفحات ── */
const expectedPages: Record<string, { sha256: string; length: number }> = JSON.parse(fs.readFileSync(PAGE_FIXTURE, "utf8")).pages;
for (const [key, want] of Object.entries(expectedPages)) {
  const got = pages[key];
  check(Boolean(got) && got.sha256 === want.sha256 && got.length === want.length, `P ${key}: ${want.length} حرفاً بالبايتات نفسها`, got ? { want, got } : "لم تُوجد");
}
check(Object.keys(pages).every(k => k in expectedPages), "P لا صفحةَ جديدة بلا لقطة", Object.keys(pages).filter(k => !(k in expectedPages)));

/* ── لا أحد يستورد server.ts ── */
{
  const offenders: string[] = [];
  const serverAbs = path.join(ROOT, "server");
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(abs); continue; }
      if (!/\.(ts|tsx|mts|js|mjs)$/.test(entry.name)) continue;
      const text = fs.readFileSync(abs, "utf8");
      for (const m of text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g)) {
        const target = path.resolve(path.dirname(abs), m[1]).replace(/\.(ts|js)$/, "");
        if (target === serverAbs) offenders.push(path.relative(ROOT, abs));
      }
    }
  };
  walk(path.join(ROOT, "src"));
  check(offenders.length === 0, "S لا وحدةَ في src/ تستورد server.ts", offenders);
}

console.log(`\n${passed} نجح، ${failed} فشل`);
process.exit(failed ? 1 : 0);
