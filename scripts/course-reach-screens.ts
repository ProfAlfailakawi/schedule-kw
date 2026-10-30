/**
 * لقطات «لم نصل بعد إلى هذا المستوى» وتبويبي الصحيفة في النشر (390px و1440px) — خادمُ ديمو خاصّ بمنفذٍ خاص.
 * تُحفظ في docs/course-reach/.
 *   PLAYWRIGHT=<مسار playwright> SCREENS_PORT=<منفذ خادمٍ قائم> npx tsx scripts/course-reach-screens.ts
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
const OUT = path.resolve("docs/course-reach");
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

async function run(browser: any, width: number) {
  const context = await adminContext(browser, width);
  const api = context.request;
  const scope = { collegeId: 1, sectionId: 1, termId: 1 };
  const reach = await J(await api.get(BASE + "/api/course-reach?collegeId=1&sectionId=1&termId=1"));
  const offering = await J(await api.get(BASE + "/api/course-offering?collegeId=1&sectionId=1&termId=1"));
  const nameOf = (id: number) => String((offering.courses || []).find((c: any) => c.id === id)?.name || "");
  const locked = Object.values(reach.courses || {}).filter((r: any) => r.state === "locked") as any[];
  const withChain = locked.find(r => r.why === "prereq-missing" && r.chain.length >= 3) || locked[0];
  note(`[${width}] وصلنا ${Object.values(reach.courses || {}).filter((r: any) => r.state === "reached").length} · لم نصل ${locked.length} · مثال: ${withChain?.reason}`);
  /* مقررٌ مفتوحٌ يدوياً ليظهر 🔓 في اللوحة والكرت. */
  const opened = locked.find(r => r !== withChain && r.why === "prereq-missing");
  if (opened) await api.post(BASE + "/api/course-reach/open", { data: { ...scope, courseId: opened.courseId } });

  const page = await context.newPage();
  const errors: string[] = []; page.on("pageerror", (e: any) => errors.push(String(e)));

  /* ── النشر ← كرت الأستاذ: حالة الطرح بتبويبين ── */
  if (want("panel")) await step(`[${width}] النشر`, async () => {
    await openBoard(page);
    await openDataTools(page);
    await clickText(page, "نشر"); await sleep(1200);
    await clickText(page, "نشر الجدول"); await sleep(1200);
    const staffKind = page.locator(".share-kind button[title='بطاقة الأستاذ']");
    if (await staffKind.count()) {
      await staffKind.click();
      await page.locator("#publish-step-kind button:has-text('التالي')").click();
      await sleep(800);
      await page.locator(".send-mode button").nth(1).click().catch(() => undefined);
      await page.locator("details.of-section > summary").first().click();
      await page.locator("[aria-label='حالة طرح المقررات'] .of-tabs").first().waitFor({ timeout: 30000 }).catch(() => undefined);
      await sleep(800);
      const panel = page.locator("[aria-label='حالة طرح المقررات']").first();
      await panel.locator(".of-tabs").evaluate((el: any) => el.scrollIntoView({ block: "start" })).catch(() => undefined); await sleep(400);
      await shot(page, "publish-tabs-new", width);
      await panel.locator(".of-tabs button").nth(1).click().catch(() => undefined);
      await sleep(500);
      await shot(page, "publish-tabs-old", width);
      note(`[${width}] التبويبان: ${(await panel.locator(".of-tabs button").allInnerTexts()).map((t: string) => t.replace(/\s+/g, " ")).join(" | ")}`);
      await page.keyboard.press("Escape").catch(() => undefined);
    } else note(`[${width}] تعذّر فتح نافذة النشر`);
  });

  /* ── كرت الأستاذ: المقفل رمادي 🔒 بسببه ── */
  if (want("card")) await step(`[${width}] الكرت`, async () => {
    const inbox = await J(await api.get(BASE + "/api/instructor-requests?collegeId=1&sectionId=1&termId=1"));
    const editRow = (inbox.rows || []).find((r: any) => r.linkMode !== "ta" && r.linkMode !== "view" && r.status === "sent" && r.linkId);
    if (editRow) {
      const card = await context.newPage();
      await card.goto(`${BASE}/r/${editRow.linkId}`, { waitUntil: "domcontentloaded" });
      await card.locator("#openChooser").click({ timeout: 30000 }).catch(() => undefined);
      await sleep(400);
      const sel = card.locator("#courseCollege");
      if (await sel.count()) { const value = await sel.locator("option").nth(1).getAttribute("value"); if (value) await sel.selectOption(value); }
      await sleep(600);
      const firstLocked = card.locator(".course-option[data-locked='1']").first();
      if (await firstLocked.count()) await firstLocked.scrollIntoViewIfNeeded();
      await sleep(300);
      await shot(card, "teacher-card-locked", width);
      note(`[${width}] الكرت: مقفل ${await card.locator(".course-option[data-locked='1']").count()} · متاح ${await card.locator(".course-option:not([data-locked])").count()}`);
      const offerings = card.locator("#offerings");
      if (await offerings.count()) {
        await offerings.evaluate((d: any) => { d.open = true; });
        const lockedOffer = card.locator(".offering-option[data-locked='1']").first();
        if (await lockedOffer.count()) {
          await lockedOffer.evaluate((b: any) => { const g = b.closest("details"); if (g) g.open = true; b.scrollIntoView({ block: "center" }); });
          await sleep(300);
          await shot(card, "teacher-card-vacant-locked", width);
        }
      }
      await card.close();
    } else note(`[${width}] لا رابط أستاذ`);
  });

  /* ── نموذج الموعد: تنبيهٌ أصفر + «افتحه للطرح» ── */
  if (want("form") && withChain) await step(`[${width}] النموذج`, async () => {
    await openBoard(page);
    for (let i = 0; i < 5; i++) {
      await clickText(page, "إضافة موعد");
      if (await page.locator('.ss-trigger[data-guide-editor-field="course-name"]:not([disabled])').waitFor({ timeout: 8000 }).then(() => true).catch(() => false)) break;
      await page.reload(); await page.getByRole("button", { name: "إضافة موعد" }).first().waitFor({ timeout: 180000 });
    }
    await page.locator('.ss-trigger[data-guide-editor-field="course-name"]:not([disabled])').click({ timeout: 60000 });
    await sleep(500);
    /* أولُ مقررٍ مقفلٍ بسلسلةٍ موجودٍ في قائمة النموذج (قائمةُ النموذج مقرراتُ القسم التشغيلية). */
    const listed = (await page.locator(".ss-pop [role=option]").allInnerTexts()).map((text: string) => text.replace(/\s+/g, " "));
    /* اسمٌ لا يتكرّر في الصحيفتين (مثل «تكنولوجيا الصوت» 220 الجديدة و247 القديمة) حتى يُختار المقفلُ نفسه. */
    const unique = (name: string) => (offering.courses || []).filter((c: any) => c.name === name).length === 1;
    const candidates = [withChain, ...locked.filter(r => r.why === "prereq-missing" && r !== opened)].map(r => nameOf(r.courseId)).filter(name => name && unique(name));
    const name = candidates.find(candidate => listed.some((text: string) => text.includes(candidate))) || "التصوير والصورة";
    note(`[${width}] النموذج: المقرر «${name}»`);
    await page.locator(".ss-pop input").fill(name).catch(() => undefined);
    await page.locator(".ss-pop [role=option]", { hasText: name }).first().click({ timeout: 30000 }).catch((e: any) => note(`click: ${String(e.message).split("\n")[0]}`));
    note(`[${width}] المختار: ${await page.locator('.ss-trigger[data-guide-editor-field="course-name"]').first().innerText().catch(() => "?")} · خيارات ${await page.locator(".ss-pop [role=option]").count()}`);
    await page.locator(".checks-open-reach").first().waitFor({ timeout: 30000 }).catch(() => undefined);
    await sleep(800);
    const panel = page.locator(".checks-panel").first();
    await panel.scrollIntoViewIfNeeded().catch(() => undefined);
    await shot(page, "form-soft-check", width, panel);
    const save = page.getByRole("button", { name: /^(موافق|حفظ)/ }).first();
    note(`[${width}] النموذج: زرّ «افتحه للطرح» ${await page.locator(".checks-open-reach").count() ? "ظاهر ✓" : "غائب ✗"} · الحفظ ${await save.isDisabled().catch(() => true) ? "معطّل (لنقص الحقول)" : "متاح"} · المانع ${await page.locator(".checks-tally .is-block").innerText().catch(() => "?")}`);
    await page.keyboard.press("Escape").catch(() => undefined);
  });

  /* ── كل المقررات ── */
  if (want("all")) await step(`[${width}] كل المقررات`, async () => {
    await openBoard(page);
    await openDataTools(page);
    await clickText(page, "كل المقررات");
    await page.locator(".ac-course").first().waitFor({ timeout: 60000 }).catch(() => undefined);
    await page.locator(".reach-chip").first().waitFor({ timeout: 30000 }).catch(() => undefined);
    await sleep(800);
    const lockedCard = page.locator(".ac-course:has(.reach-chip.is-lock)").first();
    if (await lockedCard.count()) await lockedCard.scrollIntoViewIfNeeded();
    await sleep(300);
    await shot(page, "all-courses-reach", width);
  });

  /* ── مراجعة الاعتماد: ملاحظةٌ على شعب «لم نصل بعد» ── */
  if (want("review")) await step(`[${width}] المراجعة`, async () => {
    await openBoard(page);
    await page.keyboard.press("Escape").catch(() => undefined);
    if (!(await clickText(page, "مراجعة الاعتماد"))) {
      await page.evaluate(`(() => { const b = [...document.querySelectorAll("button")].find(x => x.offsetParent && (x.title || "").includes("فحص الجدول كاملاً")); if (b) b.click(); return !!b; })()`);
    }
    if (!(await page.locator(".review-sheet").count())) {
      await openDataTools(page);
      await page.evaluate(`(() => { const b = [...document.querySelectorAll("button")].find(x => x.offsetParent && (x.title || "").includes("فحص الجدول كاملاً")); if (b) b.click(); return !!b; })()`);
    }
    await page.locator("[data-review-reach]").first().waitFor({ timeout: 60000 }).catch(() => undefined);
    await sleep(800);
    const notes = page.locator("[data-review-reach]").first();
    if (await notes.count()) { await notes.scrollIntoViewIfNeeded(); await shot(page, "review-reach-note", width); }
    else note(`[${width}] المراجعة: لا ملاحظة «لم نصل بعد» (لا شعبة لمقررٍ مقفل في الديمو أو لم تُفتح المراجعة)`);
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
