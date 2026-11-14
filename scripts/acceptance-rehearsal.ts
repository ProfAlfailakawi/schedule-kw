/**
 * ── بروفة جولة القبول على الديمو ──────────────────────────────────────────────
 *
 *   npm run rehearsal:acceptance [-- --out <مجلد>] [-- --only S1,T2]
 *
 * تُشغّل الخطواتِ نفسها التي في docs/ACCEPTANCE_ROUND.md ما استطاع الديمو إثباتَه، بمتصفح Chromium بعرض 390×844
 * (والشاشاتُ الإدارية بعرض 1280×900 أيضاً)، وتكتب تقريراً واحداً مكتفياً بنفسه (report.html بصوره) وملخّصاً JSON.
 *
 * الأمان: تُقلع خادماً محلياً خاصاً بها على منفذٍ حرّ يختاره النظام (DATA_MODE=demo) وتُطفئه عند الخروج؛ لا تتصل بأي
 * عنوانٍ آخر، ولا ترسل رسالةً حقيقية، ولا تلمس بياناتِ الجامعة. وما لا يثبته الديمو يُسجَّل ⏭️ ولا يُسجَّل نجاحاً أبداً.
 * رمزُ الخروج غيرُ صفرٍ إن فشلت خطوةٌ يستطيع الديمو إثباتَها.
 *
 * النقيُّ منها (النموذج، التلخيص، التقرير، اتساق المعرّفات مع الوثيقة) في scripts/lib/acceptanceRehearsal.ts.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  STEPS, completeResults, exitCodeFor, issuesDowngrade, jsonSummary, renderReport, stepById, summarize,
  type Issue, type Shot, type StepResult, type StepStatus,
} from "./lib/acceptanceRehearsal";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");

/* ── الوسائط ── */
const argv = process.argv.slice(2);
const argValue = (name: string): string => { const at = argv.indexOf(name); return at >= 0 ? String(argv[at + 1] || "") : ""; };
const OUT = path.resolve(argValue("--out") || process.env.ACCEPTANCE_OUT || path.join(ROOT, "acceptance-report"));
const ONLY = argValue("--only").split(",").map(id => id.trim()).filter(Boolean);
const want = (id: string) => !ONLY.length || ONLY.includes(id);

const PHONE = 390, DESKTOP = 1280;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const STEP_TIMEOUT_MS = 150_000;

/* ── الخادم المحلي الخاص ── */
let server: ChildProcess | null = null;
let BASE = "";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => { const { port } = probe.address() as net.AddressInfo; probe.close(() => resolve(port)); });
  });
}

async function startServer(): Promise<void> {
  if (process.env.K_SERVICE) throw new Error("refusing to run inside a production service environment");
  const port = await freePort();
  BASE = `http://127.0.0.1:${port}`;
  const env: NodeJS.ProcessEnv = { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", PORT: String(port), DISABLE_HMR: "true" };
  /* لا شيء من إعدادات الإنتاج يصل إلى هذا الخادم. */
  for (const key of ["GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_PROJECT_ID", "FIREBASE_DATABASE_ID", "FIREBASE_CONFIG_SOURCE", "K_SERVICE", "K_REVISION"]) delete env[key];
  const log = fs.openSync(path.join(OUT, "server.log"), "w");
  server = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["tsx", "server.ts"], { cwd: ROOT, env, stdio: ["ignore", log, log], detached: process.platform !== "win32" });
  server.on("exit", () => { server = null; });
  for (let i = 0; i < 180; i++) {
    if (!server) throw new Error("the demo server exited early; see server.log in the output directory");
    try {
      const response = await fetch(BASE + "/api/demo/config");
      if (response.ok) {
        const config = await response.json() as { enabled?: boolean; isolated?: boolean };
        if (!config.enabled || !config.isolated) throw new Error("server is not an isolated demo; aborting");
        return;
      }
    } catch (error) { if (error instanceof Error && /isolated demo/.test(error.message)) throw error; /* يُقلع */ }
    await sleep(1000);
  }
  throw new Error("the demo server did not start in time");
}

async function stopServer(): Promise<void> {
  const child = server;
  if (!child?.pid) return;
  const gone = new Promise<void>(resolve => child.once("exit", () => resolve()));
  const signal = (name: NodeJS.Signals) => { try { if (process.platform === "win32") child.kill(name); else process.kill(-child.pid!, name); } catch { /* انتهى */ } };
  signal("SIGTERM");
  await Promise.race([gone, sleep(5000)]);
  if (server) { signal("SIGKILL"); await Promise.race([gone, sleep(2000)]); }
  server = null;
}

/* ── تسجيل الخطوات ── */
interface Collector { issues: Issue[]; expected: RegExp[]; shots: Shot[]; details: string[]; failed: string[]; warned: string[]; skipReason: string; summary: string }
let current: Collector | null = null;
const results: StepResult[] = [];
const emptyCollector = (): Collector => ({ issues: [], expected: [], shots: [], details: [], failed: [], warned: [], skipReason: "", summary: "" });

const clip = (text: string, max = 260) => { const flat = String(text).replace(/\s+/g, " ").trim(); return flat.length > max ? flat.slice(0, max - 1) + "…" : flat; };
function addIssue(kind: Issue["kind"], text: string) {
  if (!current) return;
  const line = clip(text);
  if (current.expected.some(re => re.test(line))) return;
  if (current.issues.length < 25 && !current.issues.some(issue => issue.kind === kind && issue.text === line)) current.issues.push({ kind, text: line });
}
/** يراقب كلَّ صفحةٍ في السياق: استثناءاتُها وأخطاءُ كونسولها وطلباتُها المرفوضة تُنسب إلى الخطوة الجارية. */
function watch(page: any) {
  const origin = () => BASE;
  page.on("pageerror", (error: unknown) => addIssue("pageerror", String(error)));
  page.on("console", (message: any) => { if (message.type() === "error" && !/^Failed to load resource/.test(message.text())) addIssue("console", message.text()); });
  page.on("response", (response: any) => {
    const url = String(response.url());
    if (response.status() >= 400 && url.startsWith(origin())) addIssue("http", `${response.status()} ${response.request().method()} ${url.slice(origin().length).replace(/[?&]t=[^&]+/, "").slice(0, 120)}`);
  });
  page.on("requestfailed", (request: any) => {
    const failure = String(request.failure()?.errorText || "");
    if (!/ERR_ABORTED/.test(failure) && String(request.url()).startsWith(origin())) addIssue("requestfailed", `${request.method()} ${String(request.url()).slice(origin().length, origin().length + 100)} ${failure}`);
  });
}
async function newContext(browser: any, width: number) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 1, locale: "ar-KW", timezoneId: "Asia/Kuwait", colorScheme: "light" });
  context.on("page", watch);
  return context;
}

interface Step {
  /** يفحص شرطاً: يسجّل ✓ أو ✗، والفشلُ يُسقط الخطوة في نهايتها. */
  ok(condition: boolean, label: string): boolean;
  info(line: string): void;
  /** ملاحظةٌ لا تُسقط الخطوة. */
  warn(line: string): void;
  /** الخطوةُ لا يثبتها الديمو الآن (بياناتٌ ناقصة)، فتُسجَّل ⏭️ بسببٍ صريح. */
  skip(reason: string): void;
  /** طلبٌ مرفوضٌ متوقَّعٌ (نختبر الرفضَ نفسه): لا يُحسب خطأً. */
  expect(pattern: RegExp): void;
  summary(text: string): void;
  shot(page: any, caption: string, width?: number): Promise<void>;
}
const stepApi: Step = {
  ok(condition, label) { current!.details.push(`${condition ? "✓" : "✗"} ${label}`); if (!condition) current!.failed.push(label); return condition; },
  info(line) { current!.details.push(line); },
  warn(line) { current!.warned.push(line); current!.details.push(`⚠ ${line}`); },
  skip(reason) { current!.skipReason = reason; },
  expect(pattern) { current!.expected.push(pattern); },
  summary(text) { current!.summary = text; },
  async shot(page, caption, width) {
    try {
      const buffer: Buffer = await page.screenshot({ type: "jpeg", quality: 72, fullPage: false });
      const size = page.viewportSize?.();
      current!.shots.push({ caption, data: buffer.toString("base64"), width: width || size?.width || PHONE });
    } catch (error) { current!.details.push(`⚠ تعذّر التقاط اللقطة: ${clip(String(error), 80)}`); }
  },
};

function conclude(id: string, started: number, error?: unknown): StepResult {
  const c = current!;
  let status: StepStatus = "pass";
  let note = c.summary || "نجحت كلُّ الفحوص.";
  if (error) { status = "fail"; note = `توقّفت الخطوة: ${clip(error instanceof Error ? error.message.split("\n")[0] : String(error), 220)}`; }
  else if (c.failed.length) { status = "fail"; note = `فشل فحص: ${c.failed[0]}${c.failed.length > 1 ? ` (+${c.failed.length - 1})` : ""}`; }
  else if (c.skipReason) { status = "skip"; note = c.skipReason; }
  else if (c.warned.length) { status = "warn"; note = c.warned[0]; }
  else if (issuesDowngrade(c.issues)) { status = "warn"; note = "نجحت الفحوص، لكن ظهرت أخطاءُ صفحةٍ أو كونسول أثناءها (انظر تحت)."; }
  return { id, status, note, details: c.details, shots: c.shots, issues: c.issues, ms: Date.now() - started };
}

/** يشغّل خطوةً من الفهرس. الأخطاء تُسجَّل فشلاً ولا توقف بقية الجولة. */
async function run(id: string, body: (step: Step) => Promise<void>): Promise<void> {
  if (!want(id)) return;
  const started = Date.now();
  current = emptyCollector();
  let failure: unknown;
  try {
    await Promise.race([body(stepApi), new Promise((_, reject) => setTimeout(() => reject(new Error(`تجاوزت الخطوة ${STEP_TIMEOUT_MS / 1000} ثانية`)), STEP_TIMEOUT_MS))]);
  } catch (error) { failure = error; }
  const result = conclude(id, started, failure);
  results.push(result);
  console.log(`${id} ${result.status === "pass" ? "✅" : result.status === "warn" ? "⚠️" : result.status === "fail" ? "❌" : "⏭️"} ${stepById(id)?.title || ""} — ${result.note}`);
  current = null;
}
/** يسجّل خطوةً لا يثبتها الديمو: ⏭️ دائماً، بسببها من الفهرس (ويُضاف إليه ما رُصد). */
function skip(id: string, observed = ""): void {
  if (!want(id)) return;
  const def = stepById(id);
  const reason = `${def?.skipReason || "لا يثبتها الديمو."}${observed ? ` ${observed}` : ""}`;
  results.push({ id, status: "skip", note: reason, details: [], shots: [], issues: [], ms: 0 });
  console.log(`${id} ⏭️ ${def?.title || ""} — ${reason}`);
}
/** نفسُ الخطوة بأكثر من عرض: النتيجةُ الأسوأ، واللقطاتُ كلُّها. */
async function runWidths(id: string, widths: number[], body: (step: Step, width: number) => Promise<void>): Promise<void> {
  if (!want(id)) return;
  const started = Date.now();
  current = emptyCollector();
  let failure: unknown;
  for (const width of widths) {
    current.details.push(`— عرض ${width}px`);
    try { await Promise.race([body(stepApi, width), new Promise((_, reject) => setTimeout(() => reject(new Error(`تجاوزت الخطوة ${STEP_TIMEOUT_MS / 1000} ثانية`)), STEP_TIMEOUT_MS))]); }
    catch (error) { failure = error; current.details.push(`✗ توقّف عند ${width}px: ${clip(error instanceof Error ? error.message.split("\n")[0] : String(error), 160)}`); break; }
  }
  const result = conclude(id, started, failure);
  results.push(result);
  console.log(`${id} ${result.status === "pass" ? "✅" : result.status === "warn" ? "⚠️" : result.status === "fail" ? "❌" : "⏭️"} ${stepById(id)?.title || ""} — ${result.note}`);
  current = null;
}

/* ── مساعدات الصفحات ── */
const J = async (response: any) => { try { return await response.json(); } catch { return {}; } };
async function adminContext(browser: any, width: number) {
  const context = await newContext(browser, width);
  const login = await context.request.post(BASE + "/api/auth/demo", { data: {} });
  if (!login.ok()) throw new Error("demo login " + login.status());
  for (let i = 0; i < 360; i++) { const status = await J(await context.request.get(BASE + "/api/demo/seed-status")); if (status.status === "ready") break; await sleep(500); }
  const role = await context.request.post(BASE + "/api/demo/role", { data: { role: "admin" } });
  if (!role.ok()) throw new Error("demo role " + role.status());
  return context;
}
async function gotoQuiet(page: any, url: string) {
  await page.goto(BASE + url, { waitUntil: "domcontentloaded" });
  await sleep(600);
  await page.keyboard.press("Escape").catch(() => undefined);
}
/** نصُّ الصفحة المرئيّ فقط (بلا سكربتات). */
const visibleText = (page: any): Promise<string> => page.evaluate("document.body.innerText");
/** نصُّ الصفحة كلُّه بلا وسوم script وstyle: يشمل المطويّ والمخفيّ. */
const pageText = (page: any): Promise<string> => page.evaluate(`(() => { const c = document.body.cloneNode(true); c.querySelectorAll("script,style,noscript").forEach(n => n.remove()); return c.textContent || ""; })()`);
async function noSideScroll(step: Step, page: any, label: string) {
  const over: number = await page.evaluate("document.documentElement.scrollWidth - window.innerWidth");
  if (over > 2) step.warn(`${label}: تمرّر أفقيٌّ في الصفحة (${over}px زائدة)`); else step.info(`✓ ${label}: بلا تمرّرٍ أفقي`);
}
/** رقمٌ مدنيٌّ صحيحُ المجموع للتجربة وحدها (يُختار عشوائياً فلا يصطدم بملفٍ سابق). */
function syntheticCivil(): string {
  const weights = [2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  for (let tries = 0; tries < 5000; tries++) {
    const body = "2990" + String(Math.floor(Math.random() * 10 ** 7)).padStart(7, "0");
    const eleven = body.slice(0, 7) + body.slice(7, 11);
    const sum = weights.reduce((total, weight, i) => total + Number(eleven[i]) * weight, 0);
    const check = 11 - (sum % 11);
    if (check >= 0 && check <= 9) return eleven + check;
  }
  throw new Error("could not build a synthetic civil number");
}
const ROOM_CODE = /\b\d{3}[A-Z]\d{2}[A-Z]?\/?\d{1,3}\b/;
const BUILDING_WORD = /مبنى|المبنى|بناية/;

/* ───────────────────────── الطالب ───────────────────────── */
const observed = { pushConfigured: null as boolean | null };

async function studentSteps(browser: any) {
  /* S2: إنشاءُ ملفٍّ حقيقيّ الإجراء (الباب /me) داخل مخزن الديمو، بسياقٍ نظيف. */
  await run("S2", async step => {
    const context = await newContext(browser, PHONE);
    try {
      const page = await context.newPage();
      await gotoQuiet(page, "/me");
      await page.locator("#civil").waitFor({ timeout: 30000 });
      step.ok(true, "باب /me يعرض خانة الرقم المدني");
      await step.shot(page, "الباب");
      await page.locator("#civil").fill(syntheticCivil());
      await page.locator("#go").click();
      await page.locator("#nm").waitFor({ timeout: 30000 });
      await page.locator("#nm").fill("طالبة تجريبية للجولة");
      await page.locator("#c1").fill("739152");
      await page.locator("#c2").fill("739152");
      await page.locator("label.chk").click();
      step.ok(await page.locator("#mk").isEnabled(), "«أنشئ ملفّي» يُفعَّل بعد الاسم والرمزين والموافقة");
      await page.locator("#mk").click();
      /* الكلية ثم التخصص ثم الصحيفة: نختار «التربية الأساسية» و«تكنولوجيا التعليم» إن وُجدتا، وإلا أولَ الخيارات. */
      const pick = async (texts: string[]) => {
        const options = page.locator("button.opt:not([disabled])");
        await options.first().waitFor({ timeout: 30000 });
        for (const text of texts) { const hit = options.filter({ hasText: text }); if (await hit.count()) { await hit.first().click(); return text; } }
        await options.first().click(); return "الأول";
      };
      await page.getByRole("heading", { name: /ما كليتك/ }).waitFor({ timeout: 30000 }).catch(() => undefined);
      const colleges = await page.locator("button.opt").count();
      step.ok(colleges > 0, `تظهر الكليات (${colleges})`);
      await step.shot(page, "اختيار الكلية");
      if (await page.getByRole("heading", { name: /ما كليتك/ }).count()) await pick(["التربية الأساسية"]);
      await page.getByRole("heading", { name: /ما تخصصك/ }).waitFor({ timeout: 30000 });
      const specs = await page.locator("button.opt").count();
      step.ok(specs > 0, `تظهر التخصصات (${specs})`);
      await step.shot(page, "اختيار التخصص");
      await pick(["تكنولوجيا التعليم"]);
      if (await page.getByRole("heading", { name: /أي صحيفةٍ/ }).waitFor({ timeout: 6000 }).then(() => true).catch(() => false)) {
        step.ok(true, "تظهر الصحائف");
        await step.shot(page, "اختيار الصحيفة");
        await pick(["الجديدة", "2026"]);
      } else step.info("صحيفةٌ واحدة: اختيرت تلقائياً");
      await page.getByRole("heading", { name: /ما الذي أنجزته/ }).waitFor({ timeout: 30000 });
      await page.locator("#sv").waitFor({ timeout: 15000 });
      await step.shot(page, "ما أنجزته");
      await page.locator("#sv").click();
      await page.getByText(/أهلاً،/).first().waitFor({ timeout: 30000 });
      step.ok(true, "بعد الحفظ تظهر الرئيسية بالتحية");
      await sleep(600);
      await step.shot(page, "الرئيسية بعد الحفظ");
      await noSideScroll(step, page, "الرئيسية");
      step.summary("أُنشئ ملفٌّ في مخزن الديمو (الرقم المدني تجريبي)، وتتابعت الكلية ← التخصص ← الصحيفة ← ما أُنجز ← الرئيسية.");
    } finally { await context.close(); }
  });

  /* بقية خطوات الطالب على الملف الجاهز في /me/demo (له جدولٌ مقترح ورغباتٌ وتقدّم). */
  const context = await newContext(browser, PHONE);
  try {
    const page = await context.newPage();
    await run("S1", async step => {
      await page.goto(BASE + "/me/demo", { waitUntil: "domcontentloaded" });
      await page.locator(".mack").waitFor({ timeout: 30000 });
      step.ok(/مقترحات فقط/.test(await visibleText(page)), "بطاقة الدخول تقول «مقترحات فقط»");
      await step.shot(page, "بطاقة الدخول");
      await page.locator("#mackOk").click();
      await page.getByText(/أهلاً،/).first().waitFor({ timeout: 30000 });
      step.ok(true, "تظهر الرئيسية بتحية الطالب");
      step.ok(await page.locator("#mribbon").count() > 0, "شريط «مقترح · غير نهائي» ظاهر");
      await sleep(800);
      await step.shot(page, "الرئيسية");
      await noSideScroll(step, page, "الرئيسية");
      for (const [tab, marker] of [["#tab-plan", /خطة الفصل/], ["#tab-me", /شارك مرشدك/], ["#tab-now", /أهلاً،/]] as Array<[string, RegExp]>) {
        await page.locator(tab).click(); await sleep(700);
        step.ok(marker.test(await visibleText(page)), `اللسان ${tab.slice(5)} يُفتح بمحتواه`);
      }
      await page.locator("#tab-now").click(); await sleep(300);
      await page.reload({ waitUntil: "domcontentloaded" }); await sleep(900);
      step.ok(!(await page.locator(".mack").count()), "بعد «فهمت» وإعادة التحميل لا تعود البطاقة");
      step.summary("فُتحت الصفحة في Chromium (لا Safari)، وظهرت التحية والشريط والألسنة الثلاثة.");
    });

    await run("S3", async step => {
      await page.locator("#tab-now").click(); await sleep(400);
      await page.locator("#wed").click();
      await page.locator(".wz").waitFor({ timeout: 15000 });
      step.ok(true, "تُفتح بطاقة الرغبات ذات الخطوات الثلاث");
      await step.shot(page, "الرغبات: الوحدات");
      await page.locator("#wnext").click(); await sleep(300);
      await page.locator("#wnext").click(); await sleep(300);
      await step.shot(page, "الرغبات: المقررات");
      const saved = page.waitForResponse((response: any) => response.url().includes("/api/public/me/wishes") && response.request().method() === "PUT", { timeout: 20000 });
      await page.locator("#wnext").click();
      const response = await saved;
      step.ok(response.status() === 200, `حفظ الرغبات يرجع 200 (رجع ${response.status()})`);
      await page.getByText(/وصلت/).first().waitFor({ timeout: 15000 });
      step.ok(true, "تظهر «وصلت رغباتك/وصلت»");
      await sleep(500);
      await step.shot(page, "بعد الحفظ");
      step.summary("حُفظت الرغبات في ثلاث خطوات والخادمُ ردّ 200.");
    });

    await run("S4", async step => {
      await page.locator("#tab-now").click(); await sleep(400);
      const extras = await page.evaluate(`fetch("/api/public/me/extras",{credentials:"same-origin"}).then(r=>r.json())`) as any;
      observed.pushConfigured = typeof extras?.push?.configured === "boolean" ? extras.push.configured : null;
      const meetings = extras?.next?.meetings?.length || 0;
      if (!meetings) {
        step.skip("لا جدولَ جارياً في بيانات الديمو الآن (الفصل لم يبدأ): الخادم لا يعيد «محاضرتك القادمة» فلا تُعرض البطاقة. لا خلل، لكنه لم يُثبَت هنا.");
        step.info("extras.next = null من الخادم");
        await step.shot(page, "الرئيسية بلا بطاقة المحاضرة");
        return;
      }
      await page.locator(".gx-next").waitFor({ timeout: 10000 });
      step.ok(/محاضرتك القادمة/.test(await page.locator(".gx-next").innerText()), "تظهر بطاقة «محاضرتك القادمة»");
      await step.shot(page, "محاضرتك القادمة");
    });

    skip("S5", `رُصد على الديمو: مفاتيح التنبيه ${observed.pushConfigured === null ? "لم تُقرأ" : observed.pushConfigured ? "مضبوطة" : "غير مضبوطة"}.`);

    await run("S6", async step => {
      await page.locator("#tab-now").click(); await sleep(400);
      const open = page.locator("[data-act=calsub]").first();
      step.ok(await open.count() > 0, "زرّ «اشترك بجدولي في تقويم هاتفك» موجود");
      await open.click();
      await page.locator("#calApple").waitFor({ timeout: 15000 });
      const apple = (await page.locator("#calApple").getAttribute("href")) || "";
      step.ok(/^webcal:\/\//.test(apple), "زرّ «آيفون وماك» رابطه webcal://");
      step.ok(await page.locator("#calGoogle").count() > 0 && await page.locator("#calOutlook").count() > 0, "زرّا Google وOutlook موجودان");
      await step.shot(page, "ورقة اشتراك التقويم");
      /* الخلاصة نفسها يقرؤها تطبيق التقويم: نقرؤها من المنفذ المحلي (لا من العنوان المنسوخ). */
      const shown = await page.locator("#calUrl").innerText();
      const feed = await context.request.get(BASE + new URL(shown).pathname);
      const body = await feed.text();
      step.ok(feed.status() === 200 && /text\/calendar/.test(feed.headers()["content-type"] || ""), "الخلاصة ترجع 200 بنوع text/calendar");
      step.ok(/^BEGIN:VCALENDAR/.test(body) && /END:VCALENDAR\s*$/.test(body), "جسم الخلاصة تقويمٌ صالح");
      step.ok(!/\d{12}/.test(body) && !/[A-Za-z0-9_-]{40,}/.test(body.replace(shown, "")), "لا رقمَ مدنياً ولا رمزاً في الجسم");
      step.info("فتحُ التقويم في تطبيق الآيفون يبقى في الجولة الحقيقية (S6)");
      step.summary("الورقة والروابط والخلاصة صحيحة على الخادم؛ الفتحُ في تطبيق التقويم على الجهاز لم يُجرَّب هنا.");
    });

    await run("S7", async step => {
      await page.keyboard.press("Escape").catch(() => undefined);
      await page.locator("#tab-me").click(); await sleep(500);
      const state = await page.evaluate(`fetch("/api/public/me/state",{credentials:"same-origin"}).then(r=>r.json())`) as any;
      const fullName = String(state?.profile?.identity?.name || state?.profile?.name || "");
      step.ok(fullName.length > 3, "اسمُ الطالب معروفٌ للفحص (حتى لا يكون غيابُه في الصفحة العامة فحصاً فارغاً)");
      await page.locator("#gx-sgo").click();
      await page.locator(".gx-share").waitFor({ timeout: 15000 });
      step.ok(await page.locator(".gx-qr svg").count() > 0, "يظهر رمز QR");
      const link = (await page.locator("#gx-url").innerText()).trim();
      await step.shot(page, "ورقة «شارك مرشدك»");
      const anon = await newContext(browser, PHONE);
      try {
        /* المشاركةُ تُفتح بلا كوكيٍّ للطالب: نسخةُ المرشد. وصندوقُ الديمو يقرؤها من كوكي الصندوق نفسه، فنعطي المتصفحَ الثاني كوكيَّ الصندوق وحده. */
        const cookies = (await context.cookies()).filter((cookie: any) => cookie.name === "sh_demo_stu");
        if (cookies.length) await anon.addCookies(cookies);
        const view = await anon.newPage();
        await view.goto(BASE + new URL(link).pathname, { waitUntil: "domcontentloaded" });
        const text = await visibleText(view);
        step.ok(/للقراءة فقط/.test(text), "صفحة المرشد تقول «للقراءة فقط»");
        const nameTokens = fullName.split(/\s+/).filter(token => token.length > 2);
        step.ok(nameTokens.length > 0 && !nameTokens.some(token => text.includes(token)), "لا اسمَ للطالب في صفحة المرشد");
        step.ok(!/\d{12}/.test(text), "لا رقمَ مدنياً في صفحة المرشد");
        step.ok(await view.locator("input,textarea,form,button").count() === 0, "الصفحة بلا حقولٍ ولا أزرارٍ (قراءةٌ فقط)");
        await noSideScroll(step, view, "صفحة المرشد");
        await step.shot(view, "صفحة المرشد (للقراءة فقط)");
        /* الإيقاف يُبطل الرابط. */
        await page.locator("#gx-stop").click(); await sleep(1200);
        step.expect(/^404 GET \/me\/share\//);
        const after = await anon.request.get(BASE + new URL(link).pathname);
        step.ok(after.status() === 404, `بعد «أوقف المشاركة» يرجع الرابط 404 (رجع ${after.status()})`);
      } finally { await anon.close(); }
      step.summary("QR ورابطٌ للقراءة فقط بلا اسمٍ ولا رقم، ويُبطله الإيقاف.");
    });
  } finally { await context.close(); }
}

/* ───────────────────────── الاستعادة عبر القسم ───────────────────────── */
async function recoverySteps(browser: any) {
  await runWidths("R1", [PHONE, DESKTOP], async (step, width) => {
    const context = await adminContext(browser, width);
    try {
      const page = await context.newPage();
      await gotoQuiet(page, "/FSchedule/StudentRegistration");
      const card = page.locator("details.srec");
      await card.waitFor({ timeout: 90000 });
      await page.keyboard.press("Escape").catch(() => undefined);
      step.ok(/رمز استعادة لطالب/.test(await card.innerText()), "بطاقة «رمز استعادة لطالب» موجودة");
      await card.evaluate("d => { d.open = true; d.scrollIntoView({ block: 'start' }); }");
      await sleep(400);
      await page.locator("#srec-civil").fill("123456789012");
      step.ok(/الرقم غير صحيح/.test(await card.innerText()), "رقمٌ خاطئ المجموع يُرفض بعبارة «الرقم غير صحيح»");
      step.ok(await card.locator("button[type=submit]").isDisabled(), "زرّ «أصدر الرمز» معطّل لرقمٍ خاطئ");
      await step.shot(page, "بطاقة الاستعادة", width);
      step.summary("البطاقة موجودة وتتحقق من الرقم؛ الإصدارُ الفعليُّ لطالبٍ حقيقي لا يثبته الديمو (R2 وR3).");
    } finally { await context.close(); }
  });
  skip("R2");
  skip("R3");
}

/* ───────────────────────── الأستاذ ───────────────────────── */
async function teacherSteps(browser: any) {
  const context = await adminContext(browser, PHONE);
  try {
    const inbox = await J(await context.request.get(BASE + "/api/instructor-requests?collegeId=1&sectionId=1&termId=1"));
    const row = (inbox.rows || []).find((r: any) => r.linkMode !== "ta" && r.status === "sent" && r.linkId);
    const page = await context.newPage();
    const link = row ? `/r/${row.linkId}` : "";
    let demoCivil = "";
    let signCode = "";
    let verifyHref = "";

    await run("T1", async step => {
      step.ok(Boolean(link), "يوجد كرتٌ مرسَل في وارد الديمو");
      await gotoQuiet(page, link);
      await page.locator(".appt-head").first().waitFor({ timeout: 30000 });
      await sleep(900);
      const text = await visibleText(page), all = await pageText(page);
      step.ok(/جدولك/.test(text), "عنوان «جدولك» ظاهر");
      step.ok(!ROOM_CODE.test(all), "لا رمز قاعةٍ في الصفحة (ظاهراً أو مطويّاً)");
      step.ok(!BUILDING_WORD.test(all), "لا ذكرَ لمبنى في الصفحة");
      step.ok(await page.locator(".tc-next").count() > 0 ? /محاضرتك القادمة/.test(await page.locator(".tc-next").innerText()) : true, "«محاضرتك القادمة» إن ظهرت فبعنوانها");
      await noSideScroll(step, page, "الكرت");
      await step.shot(page, "الكرت");
      step.summary("الكرت يفتح بجدول الأستاذ، بلا قاعةٍ ولا مبنى.");
    });

    await run("T2", async step => {
      await page.locator(".appt-head").nth(2).click(); await sleep(500);
      await page.getByRole("button", { name: "غيّر الموعد" }).click();
      await page.locator(".best-c").first().waitFor({ timeout: 30000 });
      const suggestions = await page.locator(".best-c").count();
      step.ok(suggestions > 0, `تظهر أوقاتٌ مقترحة (${suggestions})`);
      const editorText = await pageText(page);
      step.ok(/مقترحة لك/.test(editorText), "عنوان «مقترحة لك» ظاهر");
      step.ok(!ROOM_CODE.test(editorText) && !BUILDING_WORD.test(editorText), "لا قاعةَ ولا مبنى في محرّر الموعد");
      step.ok(/قاعة مناسبة تُحجز لك تلقائياً/.test(editorText), "سطر «قاعة مناسبة تُحجز لك تلقائياً» بدل أي قاعة");
      await step.shot(page, "محرّر الموعد والمقترحات");
      const held = page.waitForResponse((response: any) => /\/hold$/.test(response.url()) && response.request().method() === "POST", { timeout: 20000 }).catch(() => null);
      await page.locator(".best-c").first().click();
      const hold = await held;
      step.ok(Boolean(hold) && hold.status() === 200, "اختيار وقتٍ مقترح يحجزه (hold) ويرجع 200");
      await page.locator("#send").waitFor({ timeout: 20000 });
      step.ok(true, "يظهر «أرسل الطلب»");
      await step.shot(page, "بعد اختيار وقتٍ مقترح");
      step.summary("نُقل موعدٌ واحد بمقترحٍ من الخادم بلا قاعةٍ ولا مبنى.");
    });

    await run("T3", async step => {
      const label = await page.locator(".demo-copy").getAttribute("aria-label").catch(() => "");
      demoCivil = String(label || "").replace(/\D/g, "");
      step.ok(demoCivil.length === 12, "الكرت التجريبيّ يعرض الرقم المدني التجريبي لنسخه");
      await page.locator("#send").click();
      await page.locator(".sk-sheet").waitFor({ timeout: 15000 });
      step.ok(/وقّع برقمك المدني/.test(await page.locator(".sk-sheet").innerText()), "تظهر ورقة «وقّع برقمك المدني»");
      await page.locator("#civil").fill(demoCivil);
      await step.shot(page, "ورقة التوقيع");
      await page.locator("#skGo").click();
      await page.getByText(/وصل طلبك إلى القسم/).first().waitFor({ timeout: 30000 });
      step.ok(true, "تظهر «وصل طلبك إلى القسم»");
      const body = await visibleText(page);
      signCode = (/رمز توقيعك:?\s*([A-Z0-9]{6})/.exec(body) || [])[1] || "";
      step.ok(signCode.length === 6, "يظهر رمز التوقيع من 6 خانات");
      verifyHref = (await page.locator("a:has-text('تحقّق من توقيعك لاحقاً')").getAttribute("href").catch(() => "")) || "";
      await step.shot(page, "وصل طلبك");
      step.summary("وُقّع الطلب بالرقم التجريبي وظهر الرمز. الرقم المدني الحقيقيّ والتحقّقُ منه لا يثبتهما الديمو.");
    });

    await run("T4", async step => {
      await page.locator("#again").click({ timeout: 15000 }); await sleep(900);
      await page.locator("button:has-text('الحركة')").first().click(); await sleep(1200);
      const text = await visibleText(page);
      step.ok(/أرسلتَ طلبك/.test(text), "«أرسلتَ طلبك» في الحركة");
      step.ok(/وصل إلى صندوق القسم/.test(text), "«وصل إلى صندوق القسم» في الحركة");
      const kebab = text.match(/\b[a-z]{3,}(?:-[a-z]{2,})+\b/g) || [];
      step.ok(!kebab.length, `لا رموز أحداثٍ إنجليزية${kebab.length ? ` (${kebab.slice(0, 3).join("، ")})` : ""}`);
      await step.shot(page, "تبويب الحركة");
    });

    await run("T5", async step => {
      step.ok(Boolean(verifyHref), "رابط «تحقّق من توقيعك» عُرف من الخطوة السابقة");
      const verify = await context.newPage();
      await verify.goto(BASE + verifyHref, { waitUntil: "domcontentloaded" });
      await verify.locator("#civil").waitFor({ timeout: 15000 });
      await step.shot(verify, "صفحة التحقق");
      await verify.locator("#civil").fill(demoCivil);
      await verify.locator("#go").click();
      await verify.getByText(signCode).first().waitFor({ timeout: 20000 });
      step.ok(true, `النتيجةُ تعرض رمز التوقيع ${signCode}`);
      const text = await visibleText(verify);
      step.ok(!ROOM_CODE.test(text), "لا قاعةَ في صفحة التحقق");
      await noSideScroll(step, verify, "صفحة التحقق");
      await step.shot(verify, "نتيجة التحقق");
      await verify.close();
    });
  } finally { await context.close(); }
}

/* ───────────────────────── القسم والمسؤول ───────────────────────── */
async function departmentSteps(browser: any) {
  await runWidths("D1", [PHONE, DESKTOP], async (step, width) => {
    const context = await adminContext(browser, width);
    try {
      const page = await context.newPage();
      await gotoQuiet(page, "/FSchedule/InstructorRequests");
      const strip = page.locator("section[aria-label='نبض الكروت']");
      await strip.waitFor({ timeout: 90000 });
      const text = await strip.innerText();
      step.ok(/نبض الكروت/.test(text), "شريط «نبض الكروت» ظاهر");
      step.ok(/ذكّر الباقين/.test(text), "زرّ «ذكّر الباقين» في الشريط");
      step.ok(/\d/.test(text), "أعدادُ الكروت ظاهرة");
      await noSideScroll(step, page, "الوارد");
      await strip.scrollIntoViewIfNeeded();
      await step.shot(page, "نبض الكروت", width);
    } finally { await context.close(); }
  });

  await run("D2", async step => {
    const config = await J(await fetch(BASE + "/api/demo/config"));
    step.ok(config.enabled === true && config.isolated === true, "الخادم تجريبيٌّ معزول: لا رسالةَ حقيقية تخرج");
    const context = await adminContext(browser, PHONE);
    try {
      const page = await context.newPage();
      await gotoQuiet(page, "/FSchedule/InstructorRequests");
      const strip = page.locator("section[aria-label='نبض الكروت']");
      await strip.waitFor({ timeout: 90000 });
      const button = strip.getByRole("button", { name: /ذكّر الباقين/ });
      if (!await button.count() || await button.isDisabled()) { step.skip("لا أحدَ يلزمه التذكير في بيانات الديمو الآن: الزرّ غير متاح."); return; }
      await button.click();
      const dialog = page.locator(".card-pulse-sheet");
      await dialog.waitFor({ timeout: 20000 });
      await dialog.getByText(/سيصل التذكير|لا أحدَ يلزمه/).first().waitFor({ timeout: 20000 });
      const lead = await dialog.locator(".card-pulse-sheet-lead").first().innerText();
      step.ok(/سيصل التذكير/.test(lead), "الورقة تعدّ من سيصله التذكير قبل الإرسال");
      step.ok(await dialog.locator(".card-pulse-people li").count() > 0, "أسماءُ المستلمين ظاهرة");
      await step.shot(page, "ورقة التأكيد");
      /* الإرسال في الديمو وهميّ: تقول الورقةُ ذلك صراحةً. */
      await dialog.getByRole("button", { name: /أرسل التذكير/ }).click();
      await dialog.getByText(/تسليمٌ وهميّ/).first().waitFor({ timeout: 20000 });
      step.ok(true, "الإرسال على الديمو يقول «تسليمٌ وهميّ، لا رسالةَ حقيقية»");
      await step.shot(page, "بعد الإرسال (وهميّ)");
      step.summary("الورقةُ والتأكيدُ والعدّ صحيحة، والإرسالُ على الديمو وهميّ؛ التذكيرُ الحقيقيُّ يُجرَّب على كرتٍ تجريبي في الجولة الحقيقية.");
    } finally { await context.close(); }
  });

  await runWidths("D3", [PHONE, DESKTOP], async (step, width) => {
    const context = await adminContext(browser, width);
    try {
      const page = await context.newPage();
      await gotoQuiet(page, "/System/LocationSetup");
      const panel = page.locator(".cap-gaps");
      await panel.waitFor({ timeout: 90000 });
      await page.locator(".cap-gaps:not(.is-loading)").waitFor({ timeout: 30000 });
      const text = await panel.innerText();
      step.ok(/قاعات بلا سعة/.test(text), "لوحة «قاعات بلا سعة» ظاهرة");
      step.ok(/\d+%/.test(text), "نسبة الاكتمال ظاهرة");
      await noSideScroll(step, page, "إضافة المباني والقاعات");
      await panel.scrollIntoViewIfNeeded();
      await step.shot(page, "قاعات بلا سعة", width);
    } finally { await context.close(); }
  });

  await run("D4", async step => {
    const context = await adminContext(browser, PHONE);
    try {
      const page = await context.newPage();
      await gotoQuiet(page, "/System/LocationSetup");
      await page.locator(".cap-gaps:not(.is-loading)").waitFor({ timeout: 90000 });
      const input = page.locator(".cap-gaps-entry input").first();
      if (!await input.count()) { step.skip("كلُّ قاعات الديمو لها سعة: لا خانةَ لإدخالها."); return; }
      if (await input.isDisabled()) {
        step.skip("الديمو للقراءة: خانة السعة معطّلة بقصد، فلا يُثبَت الحفظ هنا (يُجرَّب على الموقع الحيّ).");
        await step.shot(page, "خانة السعة (معطّلة في الديمو)");
        return;
      }
      const before = await page.locator(".cap-gaps-card").count();
      await input.fill("40");
      await page.locator(".cap-gaps-save").first().click();
      await sleep(1500);
      step.ok(await page.locator(".cap-gaps-card").count() < before, "القاعةُ تختفي من القائمة بعد الحفظ");
      await step.shot(page, "بعد حفظ السعة");
    } finally { await context.close(); }
  });
}

async function adminSteps(browser: any) {
  await runWidths("A1", [PHONE, DESKTOP], async (step, width) => {
    const context = await adminContext(browser, width);
    try {
      const page = await context.newPage();
      await gotoQuiet(page, "/System/Health");
      await page.getByText(/كل شيء سليم|تحتاج انتباهاً|تعذّرت القراءة/).first().waitFor({ timeout: 90000 });
      step.ok(true, "تظهر بطاقات «سلامة النظام» وحكمُها");
      const check = page.getByRole("button", { name: /تحقق الآن/ });
      step.ok(await check.count() > 0, "زرّ «تحقق الآن» ظاهر بتسميةٍ صريحة");
      await step.shot(page, "سلامة النظام", width);
      const fresh = page.waitForResponse((response: any) => /\/api\/system-health\?.*fresh=1/.test(response.url()), { timeout: 20000 }).catch(() => null);
      await check.first().click();
      const response = await fresh;
      step.ok(Boolean(response) && response.status() === 200, "«تحقق الآن» يطلب fresh=1 ويرجع 200");
      const payload = response ? JSON.stringify(await J(response)) : "";
      step.ok(!/@[\w-]+\.\w+/.test(payload), "حمولة الفحص بلا بريدٍ ولا معرّفات أشخاص");
      await noSideScroll(step, page, "سلامة النظام");
      step.summary("البطاقات والحكم و«تحقق الآن» تعمل على الديمو (القيم الموسومة «تجريبي»، لا نسخةَ احتياطية حقيقية).");
    } finally { await context.close(); }
  });
}

/* ───────────────────────── الرئيسية ───────────────────────── */
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const started = Date.now();
  let browser: any = null;
  const cleanup = async () => { try { await browser?.close(); } catch { /* أُغلق */ } await stopServer(); };
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { void cleanup().finally(() => process.exit(130)); });
  try {
    console.log("بروفة جولة القبول: إقلاع خادم الديمو على منفذٍ حرّ…");
    await startServer();
    console.log(`الخادم جاهز (${BASE.replace(/^http:\/\//, "")})`);
    browser = await chromium.launch();
    const version = browser.version?.() || "";
    await studentSteps(browser);
    await recoverySteps(browser);
    await teacherSteps(browser);
    await departmentSteps(browser);
    await adminSteps(browser);
    const complete = ONLY.length ? results.slice() : completeResults(results);
    const meta = { generatedAt: new Date(), durationMs: Date.now() - started, browser: `Chromium ${version}`.trim(), widths: [PHONE, DESKTOP], serverNote: "خادم ديمو محلي خاص، حُذف عند الانتهاء" };
    const ordered = [...complete].sort((a, b) => STEPS.findIndex(s => s.id === a.id) - STEPS.findIndex(s => s.id === b.id));
    fs.writeFileSync(path.join(OUT, "report.html"), renderReport(ordered, meta));
    fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(jsonSummary(ordered, meta), null, 2) + "\n");
    const summary = summarize(ordered);
    console.log(`\nالملخص: ✅ ${summary.counts.pass} · ⚠️ ${summary.counts.warn} · ❌ ${summary.counts.fail} · ⏭️ ${summary.counts.skip} · أخطاء مرصودة ${summary.issueCount}`);
    console.log(`التقرير: ${path.join(OUT, "report.html")}`);
    process.exitCode = exitCodeFor(ordered);
  } finally {
    await cleanup();
  }
}

main().catch(async error => { console.error(error); await stopServer(); process.exit(1); });
