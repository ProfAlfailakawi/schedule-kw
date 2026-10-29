/**
 * لقطات «الدرجات العلمية»: الساعات الصحيحة، والإضافي، واستثناء العضو، وترتيب الدرجات (390px و1440px).
 * خادمُ ديمو خاصّ بمنفذٍ خاص، وسياقٌ مستقلّ لكل عرض. تُحفظ في docs/ranks-load/.
 *   PLAYWRIGHT=<مسار playwright> npx tsx scripts/ranks-load-screens.ts
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const PORT = Number(process.env.SCREENS_PORT || 3473);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.resolve("docs/ranks-load");
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let server: ChildProcess | null = null;
async function startServer() {
  server = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", PORT: String(PORT) }, stdio: "ignore", detached: true });
  for (let i = 0; i < 180; i++) { try { if ((await fetch(BASE + "/api/demo/config")).ok) return; } catch { /* يقلع */ } await sleep(1000); }
  throw new Error("server did not start");
}
const stopServer = () => { if (server?.pid) { try { process.kill(-server.pid, "SIGKILL"); } catch { server.kill("SIGKILL"); } } };

async function adminContext(browser: any, width: number) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 2, locale: "ar-KW", colorScheme: "light" });
  const login = await context.request.post(BASE + "/api/auth/demo", { data: {} });
  if (!login.ok()) throw new Error("demo login " + login.status());
  for (let i = 0; i < 360; i++) { const s = await (await context.request.get(BASE + "/api/demo/seed-status")).json(); if (s.status === "ready") break; await sleep(500); }
  await context.request.post(BASE + "/api/demo/role", { data: { role: "admin" } });
  return context;
}
/* الجولةُ التعريفية تظهر لأول دخول: Escape يُنهيها (وتُحفظ «رآها») فلا تحجب اللقطات. */
async function dismissTour(page: any) {
  for (let i = 0; i < 6; i++) {
    if (!(await page.locator(".ob-root").count())) return;
    await page.keyboard.press("Escape");
    await sleep(400);
  }
}
/* لقطةُ بطاقةٍ وحدها: يُخفى ما يطفو فوقها (شريط الجوال السفلي، وشريط الحفظ اللاصق) أثناء اللقطة فقط. */
const FLOATERS = `[data-shot-hidden]{visibility:hidden!important}`;
async function hideFloaters(page: any, on: boolean) {
  await page.evaluate((enable: boolean) => {
    document.querySelectorAll("[data-shot-hidden]").forEach(el => el.removeAttribute("data-shot-hidden"));
    if (!enable) return;
    document.querySelectorAll("body *").forEach(el => {
      const style = getComputedStyle(el);
      if ((style.position === "fixed" || style.position === "sticky") && !el.closest(".catalog-form-drawer") && !el.closest(".tl-ranks") && !el.closest(".tl-members")) el.setAttribute("data-shot-hidden", "");
    });
  }, on);
}
const shot = async (target: any, name: string, width: number) => {
  const file = path.join(OUT, `${name}-${width}.png`);
  const element = typeof target.page === "function";
  if (element) { await target.page().addStyleTag({ content: FLOATERS }); await hideFloaters(target.page(), true); }
  await target.screenshot({ path: file });
  if (element) await hideFloaters(target.page(), false);
  console.log(`📸 ${path.relative(process.cwd(), file)}`);
};

async function run(browser: any, width: number) {
  const context = await adminContext(browser, width);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e: any) => errors.push(String(e)));

  /* ١) الدرجات: الإضافي والسقف والترتيب */
  await page.goto(BASE + "/System/TeachingLoad", { waitUntil: "domcontentloaded" });
  const ranks = page.locator(".teaching-load .tl-card").first();
  await ranks.locator(".tl-ranks li:not(.tl-ranks-head)").first().waitFor({ timeout: 90000 });
  await sleep(1500);
  await dismissTour(page);
  await shot(ranks, "1-ranks-overtime-order", width);

  /* ٢) الساعات الصحيحة: كسرٌ يُكتب فيُقرَّب بتلميحٍ لطيف (الديمو للعرض، فتُفتح الخانة للقطة وحدها) */
  const first = ranks.locator(".tl-ranks li:not(.tl-ranks-head) .tl-hours").first();
  await first.evaluate((el: HTMLInputElement) => { el.disabled = false; });
  await first.fill("8.5");
  await sleep(300);
  await shot(ranks, "2-integer-hint", width);

  /* ٣) الأعضاء: المقياس ورقاقات الحالة وشارة «استثناء» */
  await page.locator(".tl-check input").evaluate((el: HTMLInputElement) => el.click());
  await sleep(500);
  const members = page.locator(".teaching-load .tl-card").nth(1);
  await shot(members, "3-members-meter-exception", width);

  /* ٤) محرّر الاستثناء لعضوٍ واحد */
  await members.locator(".tl-row", { hasText: "تجريبي 5" }).locator(".tl-ex-btn").evaluate((el: HTMLButtonElement) => el.click());
  const drawer = page.locator(".catalog-form-drawer");
  await drawer.waitFor();
  await sleep(500);
  await shot(width < 600 ? page : drawer, "4-exception-editor", width);
  await page.keyboard.press("Escape");
  await sleep(300);

  /* ٥) من اسم الأستاذ: شاشة الأساتذة — الشارة في القائمة وبطاقة النصاب في التفاصيل */
  await page.goto(BASE + "/AdInstructor/Index", { waitUntil: "domcontentloaded" });
  const card = page.locator(".record-card", { hasText: "تجريبي 5" }).first();
  await card.waitFor({ timeout: 60000 });
  await sleep(1000);
  await dismissTour(page);
  await card.evaluate((el: HTMLElement) => el.click());
  const panel = page.locator(".tl-person");
  await panel.waitFor({ timeout: 30000 });
  await sleep(600);
  if (width < 600) { await panel.evaluate((el: HTMLElement) => el.scrollIntoView({ block: "center" })); await sleep(400); await shot(page, "5-instructor-load-panel", width); }
  else await shot(page, "5-instructor-load-panel", width);
  await panel.locator("button").evaluate((el: HTMLButtonElement) => el.click());
  await page.locator(".catalog-form-drawer").waitFor();
  await sleep(500);
  await shot(page, "6-instructor-exception-editor", width);

  if (errors.length) console.log(`⚠ ${width}: ${errors.join(" | ")}`);
  await context.close();
}

(async () => {
  await startServer();
  const browser = await chromium.launch();
  try {
    for (const width of [390, 1440]) await run(browser, width);
  } finally {
    await browser.close();
    stopServer();
  }
})().catch(error => { console.error(error); stopServer(); process.exit(1); });
