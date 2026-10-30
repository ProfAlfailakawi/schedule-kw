/**
 * لقطات «👣 الأثر» (390px و1440px) — خادمُ ديمو خاصّ بمنفذٍ خاص، يُطفأ بعدها. تُحفظ في docs/activity-trail/.
 *   PLAYWRIGHT=<مسار playwright> npx tsx scripts/activity-trail-screens.ts
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const PORT = Number(process.env.SCREENS_PORT || 3000 + Math.floor(Math.random() * 900));
const OWN = !process.env.SCREENS_PORT;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.resolve("docs/activity-trail");
fs.mkdirSync(OUT, { recursive: true });
const WIDTHS = [390, 1440] as const;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const J = async (r: any) => { try { return await r.json(); } catch { return {}; } };
const note = (line: string) => console.log(line);

let server: ChildProcess | null = null;
async function startServer() {
  if (OWN) server = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", PORT: String(PORT) }, stdio: "ignore", detached: true });
  for (let i = 0; i < 180; i++) { try { if ((await fetch(BASE + "/api/demo/config")).ok) return; } catch { /* يقلع */ } await sleep(1000); }
  throw new Error("server did not start");
}
const stopServer = () => { if (server?.pid) { try { process.kill(-server.pid, "SIGKILL"); } catch { server.kill("SIGKILL"); } } };

async function demoContext(browser: any, width: number) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: width < 600 ? 2 : 1, locale: "ar-KW", colorScheme: "light" });
  await context.addInitScript(() => {
    const read = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) { return String(key).startsWith("schedule-onboarding") ? "done" : read.call(this, key); };
  });
  const login = await context.request.post(BASE + "/api/auth/demo", { data: {}, timeout: 180000 });
  if (!login.ok()) throw new Error("demo login " + login.status());
  for (let i = 0; i < 360; i++) { const s = await J(await context.request.get(BASE + "/api/demo/seed-status")); if (s.status === "ready") break; await sleep(500); }
  return context;
}
const as = (context: any, role: string) => context.request.post(BASE + "/api/demo/role", { data: { role } });
const shot = async (page: any, name: string, width: number) => {
  const file = path.join(OUT, `${name}-${width}.png`);
  await page.screenshot({ path: file, fullPage: false });
  note(`📸 ${path.relative(process.cwd(), file)}`);
};
const step = async (label: string, fn: () => Promise<void>) => { try { await fn(); } catch (error: any) { note(`⚠️ ${label}: ${String(error?.message || error).split("\n")[0]}`); } };

async function home(page: any) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".user-card", { timeout: 180000, state: "attached" });
  await page.getByRole("button", { name: "تخطّي" }).click({ timeout: 3000 }).catch(() => undefined);
  await sleep(1200);
}
async function openRail(page: any, width: number) {
  if (width < 1000) { await page.getByRole("button", { name: "فتح القائمة" }).first().click(); await sleep(500); }
}
async function openSheetFromCard(page: any, width: number) {
  await openRail(page, width);
  await page.locator(".user-card-tools .trail-open").click();
  await page.waitForSelector(".trail-line, .trail-empty", { timeout: 20000 });
  await sleep(700);
}
async function openSheetFromTeam(page: any, width: number) {
  await openRail(page, width);
  await page.getByRole("button", { name: "فريقي" }).click();
  await page.waitForSelector(".seat-drawer", { timeout: 20000 });
  await sleep(600);
}

async function run(browser: any, width: number) {
  const context = await demoContext(browser, width);
  const page = await context.newPage();

  /* ١) رئيس القسم من بطاقة حسابه: الوجوه والحلقات والشريط */
  await step("head", async () => {
    await as(context, "departmentHead");
    await home(page);
    await openSheetFromCard(page, width);
    await shot(page, "01-head-sheet", width);
    await page.locator(".trail-item button").first().click();
    await sleep(400);
    await shot(page, "02-before-after", width);
    await page.locator(".trail-face", { hasText: "سارة" }).first().click();
    await sleep(400);
    await shot(page, "03-filter-person", width);
    await page.locator(".trail-face", { hasText: "سارة" }).first().click();
    await page.locator(".trail-kind", { hasText: "تعديل" }).first().click();
    await sleep(400);
    await shot(page, "04-filter-kind", width);
  });

  /* ٢) رئيسة لجنة الجدول: «👣» في رأس «فريقي» */
  await step("team", async () => {
    await as(context, "committeeChair");
    await home(page);
    await openSheetFromTeam(page, width);
    await shot(page, "05-team-header", width);
    await page.locator(".seat-drawer .trail-open").click();
    await page.waitForSelector(".trail-line", { timeout: 20000 });
    await sleep(700);
    await shot(page, "06-team-sheet", width);
  });

  /* ٣) بصمة «آخر تعديل» على الموعد */
  await step("stamp", async () => {
    await as(context, "committeeChair");
    const trail = await J(await context.request.get(BASE + "/api/activity-trail"));
    const rowId = (trail.entries || []).find((row: any) => row.row && row.kind === "edit")?.row;
    await page.goto(BASE + "/FSchedule/Index", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "إضافة موعد" }).first().waitFor({ timeout: 180000 });
    await page.getByRole("button", { name: "تخطّي" }).click({ timeout: 3000 }).catch(() => undefined);
    await sleep(1500);
    if (width < 1000) {
      /* على الهاتف: لمسةٌ على الموعد تفتحه، والبصمةُ تحت عنوانه. */
      await page.evaluate(`(() => { const el = [...document.querySelectorAll('[data-row-id="${rowId}"]')].find(e => e.offsetParent); el?.scrollIntoView({ block: "center" }); el?.click(); })()`);
      await page.waitForSelector(".context-appointment-meta", { timeout: 60000 });
      await page.waitForSelector(".trail-stamp", { timeout: 30000 });
      await sleep(600);
    } else {
      const weekButton = page.getByRole("group", { name: "طريقة العرض" }).getByRole("button", { name: "عرض الأسبوع" });
      for (let i = 0; i < 6 && (await weekButton.getAttribute("aria-pressed")) !== "true"; i++) { await weekButton.click(); await sleep(5000); }
      await sleep(1500);
      const card = page.locator(`[data-row-id="${rowId}"]:visible`).first();
      await card.scrollIntoViewIfNeeded();
      await card.hover();
      await page.waitForSelector(".week-peek .trail-stamp", { timeout: 30000 });
      await sleep(400);
    }
    await shot(page, "07-stamp", width);
  });

  /* ٤) فريقٌ بلا أثرٍ بعد */
  await step("empty", async () => {
    await as(context, "advisorGeneral");
    await home(page);
    await openSheetFromTeam(page, width);
    await page.locator(".seat-drawer .trail-open").click();
    await page.waitForSelector(".trail-empty", { timeout: 20000 });
    await sleep(600);
    await shot(page, "08-empty", width);
  });

  await context.close();
}

try {
  await startServer();
  const browser = await chromium.launch();
  for (const width of WIDTHS) await run(browser, width);
  await browser.close();
} finally {
  stopServer();
}
