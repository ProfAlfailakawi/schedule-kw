/**
 * لقطات «تغطية الوسوم وعضوية الصحيفة» (390px و1440px) على خادم ديمو قائم. تُحفظ في docs/course-tags-coverage/.
 *   PLAYWRIGHT=<مسار playwright> SCREENS_PORT=<منفذ> SCREENS_PREFIX=after npx tsx scripts/course-tags-coverage-screens.ts
 * SCREENS_PREFIX=before على خادمٍ من main نفسه يلتقط «قبل» بالأسماء نفسها.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const BASE = `http://127.0.0.1:${Number(process.env.SCREENS_PORT || 3000)}`;
const PREFIX = process.env.SCREENS_PREFIX || "after";
const OUT = path.resolve(process.env.SCREENS_OUT || "docs/course-tags-coverage");
fs.mkdirSync(OUT, { recursive: true });
const ONLY = String(process.env.SCREENS_ONLY || "").split(",").filter(Boolean);
const want = (key: string) => !ONLY.length || ONLY.includes(key);
const WIDTHS = String(process.env.SCREENS_WIDTHS || "390,1440").split(",").map(Number);
const note = (line: string) => console.log(line);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const J = async (r: any) => { try { return await r.json(); } catch { return {}; } };

async function adminContext(browser: any, width: number) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: width < 600 ? 2 : 1, locale: "ar-KW", colorScheme: "light", ...(width < 600 ? { isMobile: true, hasTouch: true } : {}) });
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
  const file = path.join(OUT, `${PREFIX}-${name}-${width}.png`);
  if (locator) await locator.screenshot({ path: file }); else await page.screenshot({ path: file, fullPage: false });
  note(`📸 ${path.relative(process.cwd(), file)}`);
};
const step = async (label: string, fn: () => Promise<void>) => { try { await fn(); } catch (error: any) { note(`⚠️ ${label}: ${String(error?.message || error).split("\n")[0]}`); } };
const clickText = (page: any, text: string) => page.evaluate(`(() => { const b = [...document.querySelectorAll("button, summary, a")].find(x => x.offsetParent && x.innerText.trim() === ${JSON.stringify(text)}); if (b) b.click(); return !!b; })()`);

async function openBoard(page: any) {
  await page.goto(BASE + "/FSchedule/Index", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "إضافة موعد" }).first().waitFor({ timeout: 180000 });
  await page.getByRole("button", { name: "تخطّي" }).click({ timeout: 4000 }).catch(() => undefined);
  await sleep(1500);
}

async function run(browser: any, width: number) {
  const context = await adminContext(browser, width);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors: string[] = []; page.on("pageerror", (e: any) => errors.push(String(e)));

  /* ── «مراجعة عدد الشعب بحسب تخطيطك»: بطاقاتُ عاجل/مهم/فرصة ── */
  if (want("triage")) await step(`[${width}] التخطيط`, async () => {
    await openBoard(page);
    const button = page.locator("button.apb-data-btn", { hasText: "التخطيط" }).first();
    await button.waitFor({ timeout: 60000 });
    await button.click();
    const shelf = page.locator(".plan-triage-shelf").first();
    await shelf.waitFor({ timeout: 30000 });
    await sleep(800);
    await shelf.evaluate((el: any) => el.scrollIntoView({ block: "start" }));
    await sleep(400);
    await page.evaluate(() => window.scrollBy(0, -90));
    await sleep(600);
    await shot(page, "triage", width);
    note(`[${width}] وسوم في البطاقات: ${await page.locator(".plan-triage .ctags").count()}`);
  });

  /* ── النشر ← بطاقة الأستاذ ← «حالة طرح المقررات»: التبويبان والترتيب ── */
  if (want("offering")) await step(`[${width}] حالة الطرح`, async () => {
    await openBoard(page);
    await page.keyboard.press("Escape").catch(() => undefined);
    if (!(await clickText(page, "أدوات البيانات"))) { await clickText(page, "المزيد"); await sleep(300); await clickText(page, "أدوات البيانات"); }
    await sleep(1200);
    await page.locator("button[data-guide-target='schedule.publish']:visible").first().click({ timeout: 60000 });
    await sleep(1200);
    await page.locator("[data-guide-target='schedule.publish.requests']").first().click({ timeout: 60000 });
    await sleep(1200);
    const details = page.locator("#publish-offering");
    await details.waitFor({ timeout: 30000 });
    await details.evaluate((el: any) => { el.open = true; });
    await page.locator("#publish-offering .of-card").first().waitFor({ timeout: 60000 });
    for (const tab of ["new", "old"] as const) {
      const button = page.locator("#publish-offering .of-tabs [role=tab]", { hasText: tab === "new" ? "الصحيفة الجديدة" : "الصحيفة القديمة" }).first();
      if (await button.count()) { await button.click(); await sleep(500); }
      const grid = page.locator("#publish-offering .of-tabs").first();
      if (await grid.count()) await grid.evaluate((el: any) => el.scrollIntoView({ block: "start" }));
      else await page.locator("#publish-offering .of-grid").first().evaluate((el: any) => el.scrollIntoView({ block: "start" }));
      await page.evaluate(() => window.scrollBy(0, -70));
      await sleep(500);
      await shot(page, `offering-${tab}`, width);
      const codes = await page.locator("#publish-offering .of-card header small").allInnerTexts();
      const tagged = await page.locator("#publish-offering .of-card").evaluateAll((cards: any[]) => cards.map(card => `${card.querySelector("header small")?.innerText.trim()}:${card.querySelector("[data-ctag=sheet]")?.innerText || "-"}${card.querySelector(".of-both") ? "+both" : ""}`));
      note(`[${width}] تبويب ${tab}: ${codes.length} مقرر · ${tagged.slice(0, 40).join(" ")}`);
    }
  });

  /* ── أدوات البيانات ← كل المقررات: التبويبان من المصدر نفسه، و«في الصحيفتين» ── */
  if (want("all")) await step(`[${width}] كل المقررات`, async () => {
    await openBoard(page);
    await page.keyboard.press("Escape").catch(() => undefined);
    if (!(await clickText(page, "أدوات البيانات"))) { await clickText(page, "المزيد"); await sleep(300); await clickText(page, "أدوات البيانات"); }
    await sleep(1000);
    await page.locator("button[title='كل المقررات']").first().click({ timeout: 30000 });
    await page.locator(".ac-course").first().waitFor({ timeout: 60000 });
    const both = page.locator(".ac-course", { has: page.locator(".of-both") }).first();
    if (await both.count()) await both.evaluate((el: any) => el.scrollIntoView({ block: "center" }));
    await sleep(500);
    await shot(page, "all-courses", width);
  });

  /* ── منتدى «عالج»: الوسوم في بطاقة الأسبوع العائمة (خليةُ الأسبوع أضيقُ من أن تحملها) ── */
  if (want("peek") && width >= 600) await step(`[${width}] البطاقة العائمة`, async () => {
    await openBoard(page);
    const card = page.locator(".week-card, [data-week-card]").first();
    await card.hover({ timeout: 20000 });
    await page.locator(".week-peek").waitFor({ timeout: 10000 });
    await sleep(500);
    const box = await page.locator(".week-peek").boundingBox();
    if (box) await page.screenshot({ path: path.join(OUT, `${PREFIX}-week-peek-${width}.png`), clip: { x: Math.max(0, box.x - 140), y: Math.max(0, box.y - 40), width: Math.min(width, box.width + 280), height: box.height + 160 } });
    note(`📸 week-peek ${width}`);
  });

  /* ── وارد التخطيط في «المراجعة»: بطاقات المقرر (المراجعة قبل الاعتماد) ── */
  if (want("review")) await step(`[${width}] المراجعة`, async () => {
    await openBoard(page);
    await clickText(page, "المزيد"); await sleep(400);
    const opened = await clickText(page, "مراجعة الاعتماد");
    if (!opened) throw new Error("لا زر مراجعة");
    await page.locator(".review-course-card, .review-row-card").first().waitFor({ timeout: 60000 });
    await page.locator(".review-course-card, .review-row-card").first().evaluate((el: any) => el.scrollIntoView({ block: "center" }));
    await sleep(500);
    await shot(page, "review", width);
  });

  if (errors.length) note(`[${width}] أخطاء الصفحة: ${errors.slice(0, 3).join(" | ")}`);
  await context.close();
}

(async () => {
  const browser = await chromium.launch();
  try { for (const width of WIDTHS) await run(browser, width); } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
