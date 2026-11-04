/**
 * لقطات «نشر ← بطاقة الأستاذ ← لمن؟ ← أساتذة محددون» (390px و1440px) — خادمُ ديمو خاصّ بمنفذٍ خاص.
 * تُحفظ في docs/publish-pick-teachers/.
 *   PLAYWRIGHT=<مسار playwright> SCREENS_PORT=<منفذ خادمٍ قائم> npx tsx scripts/publish-pick-teachers-screens.ts
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
const OUT = path.resolve("docs/publish-pick-teachers");
fs.mkdirSync(OUT, { recursive: true });
const WIDTHS = [390, 1440] as const;
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
async function openStaffOptions(page: any, mode: number) {
  await page.goto(BASE + "/FSchedule/Index", { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.getByRole("button", { name: "إضافة موعد" }).first().waitFor({ timeout: 180000 });
  await page.getByRole("button", { name: "تخطّي" }).click({ timeout: 4000 }).catch(() => undefined);
  await sleep(1200);
  await page.keyboard.press("Escape").catch(() => undefined);
  if (!(await clickText(page, "أدوات البيانات"))) { await clickText(page, "المزيد"); await sleep(300); await clickText(page, "أدوات البيانات"); }
  await sleep(1000);
  await clickText(page, "نشر"); await sleep(1200);
  await clickText(page, "نشر الجدول"); await sleep(1200);
  await page.locator(".share-kind button[title='بطاقة الأستاذ']").click();
  await page.locator("#publish-step-kind button:has-text('التالي')").click();
  await sleep(800);
  await page.locator(".send-mode button").nth(mode).click();
  await sleep(500);
}
/* هل يتجاوز شيءٌ عرضَ الورقة؟ (لا تمرير أفقي) */
const overflow = (page: any) => page.evaluate(`(() => { const s = document.querySelector(".share-sheet"); if (!s) return "no-sheet"; const w = s.getBoundingClientRect().right; const bad = [...s.querySelectorAll(".publish-audience *, .publish-pick *, .publish-delivered *")].filter(e => e.getClientRects().length).filter(e => e.getBoundingClientRect().right > w + 1 || e.getBoundingClientRect().left < s.getBoundingClientRect().left - 1).length; return bad + " عنصر خارج الورقة · scrollWidth " + document.documentElement.scrollWidth + "/" + innerWidth; })()`);

async function run(browser: any, width: number) {
  const context = await adminContext(browser, width);
  const page = await context.newPage();
  const errors: string[] = []; page.on("pageerror", (e: any) => errors.push(String(e)));
  await openStaffOptions(page, 1);
  await shot(page, "1-audience-all", width, page.locator(".share-sheet"));
  await page.locator(".publish-audience-choices button", { hasText: "أساتذة محددون" }).click();
  await page.locator(".publish-pick-list .of-chip").first().waitFor({ timeout: 30000 });
  const rows = page.locator(".publish-pick-list .of-chip");
  note(`[${width}] صفوف القائمة: ${await rows.count()} · زر الإرسال: ${(await page.locator("#publish-step-options .share-step-actions button").last().innerText()).trim()}`);
  await rows.nth(0).click(); await rows.nth(2).click(); await rows.nth(3).click();
  await page.locator("#publish-step-options .share-closes input[type=date]").fill("2026-12-31");
  await sleep(300);
  await page.locator(".publish-audience").evaluate((e: any) => e.scrollIntoView({ block: "start" }));
  await sleep(300);
  note(`[${width}] ${await overflow(page)}`);
  await shot(page, "2-picked", width);
  await page.locator(".publish-pick-search input").fill(String((await rows.nth(1).innerText()).trim().split(/\s+/)[1] || "").slice(0, 4));
  await sleep(300);
  await shot(page, "3-search", width, page.locator(".publish-pick"));
  await page.locator(".publish-pick-search input").fill("");
  const send = page.locator("#publish-step-options .share-step-actions button").last();
  note(`[${width}] زر الإرسال بعد الاختيار: ${(await send.innerText()).trim()}`);
  await send.click();
  const sheet = page.locator("[data-prepublish-reach]");
  const gated = await sheet.waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  note(`[${width}] ورقة «لم نصل بعد»: ${gated ? "ظهرت ✓" : "لم تظهر (لا مقرر مقفل)"}`);
  if (gated) { await sleep(500); await shot(page, "4-reach-sheet", width); await sheet.locator("[data-ppr-send]").click(); }
  await page.locator(".publish-delivered").waitFor({ timeout: 30000 });
  await sleep(600);
  await page.locator(".publish-delivered").scrollIntoViewIfNeeded();
  note(`[${width}] ${await overflow(page)}`);
  note(`[${width}] الخبر: ${(await page.locator("#publish-step-links .share-created").first().innerText()).trim()}`);
  note(`[${width}] من وصلهم: ${(await page.locator(".publish-delivered .share-deliver-name").allInnerTexts()).join(" | ")}`);
  await shot(page, "5-delivered", width, page.locator(".share-sheet"));
  note(`[${width}] أخطاء الصفحة: ${errors.length}${errors.length ? " — " + errors.slice(0, 2).join(" | ") : ""}`);
  await context.close();
}

(async () => {
  await startServer();
  const browser = await chromium.launch();
  try { for (const width of WIDTHS) await run(browser, width); }
  finally { await browser.close(); stopServer(); }
})().catch(error => { console.error(error); stopServer(); process.exit(1); });
