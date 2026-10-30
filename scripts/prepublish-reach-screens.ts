/**
 * لقطات ورقة «لم نصل بعد» قبل إرسال بطاقة الأستاذ (390px و1440px) — خادمُ ديمو خاصّ بمنفذٍ خاص.
 * تُحفظ في docs/prepublish-reach/.
 *   PLAYWRIGHT=<مسار playwright> SCREENS_PORT=<منفذ خادمٍ قائم> npx tsx scripts/prepublish-reach-screens.ts
 * بلا SCREENS_PORT يُقلع خادمٌ خاصّ ويُطفأ بعدها.
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
const OUT = path.resolve("docs/prepublish-reach");
fs.mkdirSync(OUT, { recursive: true });
const WIDTHS = [390, 1440] as const;
const ONLY = String(process.env.SCREENS_ONLY || "").split(",").filter(Boolean);
const want = (key: string) => !ONLY.length || ONLY.includes(key);
const note = (line: string) => console.log(line);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const J = async (r: any) => { try { return await r.json(); } catch { return {}; } };

let server: ChildProcess | null = null;
async function startServer() {
  if (OWN) server = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", PORT: String(PORT) }, stdio: "ignore", detached: true });
  for (let i = 0; i < 180; i++) { try { if ((await fetch(BASE + "/api/demo/config")).ok) return; } catch { /* يقلع */ } await sleep(1000); }
  throw new Error("server did not start");
}
const stopServer = () => { if (server?.pid) { try { process.kill(-server.pid, "SIGKILL"); } catch { server.kill("SIGKILL"); } } };

async function adminContext(browser: any, width: number) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: width < 600 ? 2 : 1, locale: "ar-KW", colorScheme: "light" });
  await context.addInitScript(() => {
    const read = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) { return String(key).startsWith("schedule-onboarding") ? "done" : read.call(this, key); };
  });
  const login = await context.request.post(BASE + "/api/auth/demo", { data: {}, timeout: 180000 });
  if (!login.ok()) throw new Error("demo login " + login.status());
  for (let i = 0; i < 360; i++) { const s = await J(await context.request.get(BASE + "/api/demo/seed-status")); if (s.status === "ready") break; await sleep(500); }
  await context.request.post(BASE + "/api/demo/role", { data: { role: "admin" } });
  return context;
}
const shot = async (page: any, name: string, width: number, locator?: any) => {
  const file = path.join(OUT, `${name}-${width}.png`);
  if (locator) await locator.screenshot({ path: file }); else await page.screenshot({ path: file, fullPage: false });
  note(`📸 ${path.relative(process.cwd(), file)}`);
};
const clickText = (page: any, text: string) => page.evaluate(`(() => { const b = [...document.querySelectorAll("button")].find(x => x.offsetParent && x.innerText.trim() === ${JSON.stringify(text)}); if (b) b.click(); return !!b; })()`);
async function openBoard(page: any) {
  await page.goto(BASE + "/FSchedule/Index", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "إضافة موعد" }).first().waitFor({ timeout: 180000 });
  await page.getByRole("button", { name: "تخطّي" }).click({ timeout: 4000 }).catch(() => undefined);
  await sleep(1200);
}
async function openDataTools(page: any) {
  await page.keyboard.press("Escape").catch(() => undefined);
  if (!(await clickText(page, "أدوات البيانات"))) { await clickText(page, "المزيد"); await sleep(300); await clickText(page, "أدوات البيانات"); }
  await sleep(1000);
}

/* كلُّ مشهدٍ مستقل: تعثّرُ واحدٍ لا يوقف البقية. */
const step = async (label: string, fn: () => Promise<void>) => { try { await fn(); } catch (error: any) { note(`⚠️ ${label}: ${String(error?.message || error).split("\n")[0]}`); } };

async function openStaffOptions(page: any, mode: number) {
  await openBoard(page);
  await openDataTools(page);
  await clickText(page, "نشر"); await sleep(1200);
  await clickText(page, "نشر الجدول"); await sleep(1200);
  await page.locator(".share-kind button[title='بطاقة الأستاذ']").click();
  await page.locator("#publish-step-kind button:has-text('التالي')").click();
  await sleep(800);
  await page.locator(".send-mode button").nth(mode).click();
  await sleep(600);
}

async function run(browser: any, width: number) {
  const context = await adminContext(browser, width);
  const page = await context.newPage();
  const errors: string[] = []; page.on("pageerror", (e: any) => errors.push(String(e)));

  if (want("sheet")) await step(`[${width}] الورقة`, async () => {
    await openStaffOptions(page, 1);
    await page.locator("#publish-step-options .share-closes input[type=date]").fill("2026-12-31");
    await page.locator("#publish-step-options button:has-text('إنشاء الرابط')").click();
    const sheet = page.locator("[data-prepublish-reach]");
    await sheet.waitFor({ timeout: 30000 });
    await sleep(600);
    note(`[${width}] الرأس: ${await sheet.locator("h3").innerText()} · الصفوف ${await sheet.locator(".ppr-list > li").count()}`);
    await shot(page, "sheet", width);
    await sheet.locator(".ppr-list > li button.reach-open").first().click();
    await sheet.locator(".ppr-list > li[data-opened]").first().waitFor({ timeout: 30000 });
    await sleep(500);
    note(`[${width}] بعد الفتح: ${await sheet.locator("h3").innerText()}`);
    await shot(page, "sheet-opened", width);
    await sheet.locator("[data-ppr-review]").click();
    await page.locator("[aria-label='حالة طرح المقررات'] .of-tabs").first().waitFor({ timeout: 30000 });
    await sleep(1200);
    note(`[${width}] اللوحة: ${(await page.locator("[aria-label='حالة طرح المقررات'] .of-tabs button[aria-selected=true]").allInnerTexts()).join(" ").replace(/\s+/g, " ")}`);
    await shot(page, "review-panel", width);
  });

  /* 👁️ للعرض فقط: لا ورقة — تُنشأ البطاقة فوراً. */
  if (want("view")) await step(`[${width}] للعرض`, async () => {
    await openStaffOptions(page, 0);
    await page.locator("#publish-step-options button:has-text('إنشاء الرابط')").click();
    await page.locator("#publish-step-links").waitFor({ state: "visible", timeout: 30000 });
    note(`[${width}] 👁️: الورقة ${await page.locator("[data-prepublish-reach]").count() ? "ظهرت ✗" : "لم تظهر ✓"}`);
  });
  note(`[${width}] أخطاء الصفحة: ${errors.length}${errors.length ? " — " + errors.slice(0, 2).join(" | ") : ""}`);
  await context.close();
}

(async () => {
  await startServer();
  const browser = await chromium.launch();
  try { for (const width of WIDTHS) await run(browser, width); }
  finally { await browser.close(); stopServer(); }
})().catch(error => { console.error(error); stopServer(); process.exit(1); });
