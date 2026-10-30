/**
 * لقطات «الشارات الموحّدة» (390px و1440px) — خادمُ ديمو خاصّ بمنفذٍ خاص. تُحفظ في docs/consistent-badges/.
 *   PLAYWRIGHT=<مسار playwright> SCREENS_PORT=<منفذ خادمٍ قائم> npx tsx scripts/consistent-badges-screens.ts
 * بلا SCREENS_PORT يُقلع خادمٌ خاصّ ويُطفأ بعدها.
 *
 * على هذا الخادم وحده (الديمو معزول): «نظريات التعلم والتكنولوجيا» يُكتب «متطلب كلية» في صحيفة 2026
 * فيحمل وسمين معاً، وتُفتح مرحلةُ التدريب لمدرّبٍ واحد ليظهر «🎓 تدريب».
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
const OUT = path.resolve("docs/consistent-badges");
fs.mkdirSync(OUT, { recursive: true });
const WIDTHS = [390, 1440] as const;
const ONLY = String(process.env.SCREENS_ONLY || "").split(",").filter(Boolean);
const want = (key: string) => !ONLY.length || ONLY.includes(key);
const note = (line: string) => console.log(line);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const J = async (r: any) => { try { return await r.json(); } catch { return {}; } };
const TWO_TAGS = "نظريات التعلم والتكنولوجيا";

let server: ChildProcess | null = null;
async function startServer() {
  if (OWN) server = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", PORT: String(PORT) }, stdio: "ignore", detached: true });
  for (let i = 0; i < 180; i++) { try { if ((await fetch(BASE + "/api/demo/config")).ok) return; } catch { /* يقلع */ } await sleep(1000); }
  throw new Error("server did not start");
}
const stopServer = () => { if (server?.pid) { try { process.kill(-server.pid, "SIGKILL"); } catch { server.kill("SIGKILL"); } } };

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

/** عالَمُ اللقطة: مقررٌ بوسمين، ومدرّبٌ في مرحلة التدريب. */
async function prepare(api: any) {
  const status = await J(await api.get(BASE + "/api/plan-review/status"));
  const plan = (status.sections || []).find((s: any) => s.sectionId === 1)?.plans?.find((p: any) => p.status === "active");
  const offering = await J(await api.get(BASE + "/api/course-offering?collegeId=1&sectionId=1&termId=1"));
  const course = (offering.courses || []).find((c: any) => c.name === TWO_TAGS);
  if (plan && course) {
    const view = await J(await api.get(`${BASE}/api/plan-review/plan?planId=${plan.id}&sectionId=1`));
    const current = (view.rules || []).find((r: any) => r.courseId === course.id) || { courseId: course.id };
    await api.put(BASE + "/api/plan-review/rule", { data: { planId: plan.id, sectionId: 1, rule: { ...current, kind: "college" } } });
    const after = await J(await api.get(`${BASE}/api/plan-review/plan?planId=${plan.id}&sectionId=1`));
    await api.post(BASE + "/api/plan-review/approve", { data: { planId: plan.id, sectionId: 1, updatedAt: after.state?.updatedAt || "" } });
  }
  const ta = await J(await api.get(BASE + "/api/ta-phase?collegeId=1&sectionId=1&termId=1"));
  const first = (ta.tas || [])[0];
  if (first && !ta.open) await api.post(BASE + "/api/ta-phase/open", { data: { collegeId: 1, sectionId: 1, termId: 1, closesAt: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 16), waves: [[first.id]], delayHours: 0 } });
  const badges = await J(await api.get(BASE + "/api/plan-badges?fresh=1"));
  const trainees = await J(await api.get(BASE + "/api/ta-trainees?collegeId=1&sectionId=1&termId=1"));
  note(`وسوم: ${Object.keys(badges.kinds || {}).length} نوع · متدرّبون: ${(trainees.ids || []).join("، ") || "—"}`);
}

const shot = async (page: any, name: string, width: number, locator?: any) => {
  const file = path.join(OUT, `${name}-${width}.png`);
  if (locator) await locator.screenshot({ path: file }); else await page.screenshot({ path: file, fullPage: false });
  note(`📸 ${path.relative(process.cwd(), file)}`);
};
const step = async (label: string, fn: () => Promise<void>) => { try { await fn(); } catch (error: any) { note(`⚠️ ${label}: ${String(error?.message || error).split("\n")[0]}`); } };
const clickText = (page: any, text: string) => page.evaluate(`(() => { const b = [...document.querySelectorAll("button")].find(x => x.offsetParent && x.innerText.trim() === ${JSON.stringify(text)}); if (b) b.click(); return !!b; })()`);

async function openBoard(page: any) {
  await page.goto(BASE + "/FSchedule/Index", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "إضافة موعد" }).first().waitFor({ timeout: 180000 });
  await page.getByRole("button", { name: "تخطّي" }).click({ timeout: 4000 }).catch(() => undefined);
  await sleep(1200);
}

async function run(browser: any, width: number) {
  const context = await adminContext(browser, width);
  /* لكل دخولٍ تجريبيٍّ صندوقُه: يُهيّأ عالمُ اللقطة فيه هو. */
  await prepare(context.request);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors: string[] = []; page.on("pageerror", (e: any) => errors.push(String(e)));

  /* ── موعد جديد: «ماذا؟ المقرر» — كلُّ وسوم المقرر في سطره ── */
  if (want("form")) await step(`[${width}] موعد جديد`, async () => {
    await openBoard(page);
    const trigger = page.locator('.ss-trigger[data-guide-editor-field="course-name"]:not([disabled])');
    for (let i = 0; i < 6 && !(await trigger.count()); i++) {
      await page.getByRole("button", { name: "إضافة موعد" }).first().click({ timeout: 4000 }).catch(() => undefined);
      await trigger.first().waitFor({ timeout: 6000 }).catch(() => undefined);
    }
    await trigger.first().click();
    await sleep(500);
    await page.locator(".ss-pop input").fill("ت").catch(() => undefined);
    await sleep(400);
    const option = page.locator(".ss-pop [role=option]", { hasText: TWO_TAGS }).first();
    await option.scrollIntoViewIfNeeded().catch(() => undefined);
    await page.locator(".ss-list").evaluate((el: any, name: string) => {
      const row = [...el.querySelectorAll("[role=option]")].find((b: any) => b.innerText.includes(name)) as any;
      if (row) el.scrollTop = Math.max(0, row.offsetTop - 90);
    }, TWO_TAGS).catch(() => undefined);
    await sleep(400);
    await shot(page, "form-course-picker", width, width < 600 ? undefined : page.locator(".ss-pop").first());
    note(`[${width}] سطر المقرر: ${(await option.innerText().catch(() => "")).replace(/\s+/g, " ")}`);
    await page.keyboard.press("Escape").catch(() => undefined);
  });

  /* ── وارد الأساتذة: «مقترح دراسي» — الأستاذ ثم «منتدب» ثم «🎓 تدريب» ── */
  if (want("proposal")) await step(`[${width}] منتقي المقترح`, async () => {
    await page.goto(BASE + "/FSchedule/InstructorRequests", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "تخطّي" }).click({ timeout: 4000 }).catch(() => undefined);
    await page.locator("[data-guide-target='proposal-start']").first().click({ timeout: 120000 });
    await sleep(500);
    await page.locator(".sp-launch-pick .ss-trigger").click();
    await sleep(500);
    const list = page.locator(".sp-launch-pick .ss-list");
    await list.evaluate((el: any) => {
      const row = [...el.querySelectorAll("[role=option]")].find((b: any) => b.querySelector(".ta-badge")) as any;
      if (row) el.scrollTop = Math.max(0, row.offsetTop - 60);
    }).catch(() => undefined);
    await sleep(300);
    await shot(page, "proposal-teacher-picker", width);
    note(`[${width}] متدرّبون في المنتقي: ${await page.locator(".sp-launch-pick .ta-badge").count()}`);
    await page.keyboard.press("Escape").catch(() => undefined);
  });

  /* ── وارد الأساتذة: بطاقة طلب المدرّب ── */
  if (want("inbox")) await step(`[${width}] الوارد`, async () => {
    await page.goto(BASE + "/FSchedule/InstructorRequests", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "تخطّي" }).click({ timeout: 4000 }).catch(() => undefined);
    await page.locator(".request-card, .request-absent-row, .request-remind").first().waitFor({ timeout: 120000 }).catch(() => undefined);
    const ta = page.locator(".ta-badge").first();
    if (await ta.count()) {
      await ta.evaluate((el: any) => el.scrollIntoView({ block: "center" }));
      await sleep(400);
      await shot(page, "inbox-trainee", width);
    } else note(`[${width}] لا «🎓 تدريب» ظاهر في الوارد`);
  });

  /* ── أدوات البيانات ← كل المقررات: الوسوم في رأس كل بطاقة ── */
  if (want("all")) await step(`[${width}] كل المقررات`, async () => {
    await openBoard(page);
    await page.keyboard.press("Escape").catch(() => undefined);
    if (!(await clickText(page, "أدوات البيانات"))) { await clickText(page, "المزيد"); await sleep(300); await clickText(page, "أدوات البيانات"); }
    await sleep(1000);
    await page.locator("button[title='كل المقررات']").first().click({ timeout: 30000 });
    await page.locator(".ac-course").first().waitFor({ timeout: 60000 });
    const card = page.locator(".ac-course", { hasText: TWO_TAGS }).first();
    await card.evaluate((el: any) => el.scrollIntoView({ block: "center" })).catch(() => undefined);
    await sleep(500);
    await shot(page, "all-courses", width);
  });

  /* ── بطاقة الأستاذ: «موعد جديد» — الوسمان بالترتيب نفسه ── */
  if (want("card")) await step(`[${width}] الكرت`, async () => {
    const inbox = await J(await context.request.get(BASE + "/api/instructor-requests?collegeId=1&sectionId=1&termId=1"));
    const editRow = (inbox.rows || []).find((r: any) => r.linkMode !== "ta" && r.linkMode !== "view" && r.status === "sent" && r.linkId);
    if (!editRow) { note(`[${width}] لا رابط أستاذ`); return; }
    const card = await context.newPage();
    await card.goto(`${BASE}/r/${editRow.linkId}`, { waitUntil: "domcontentloaded" });
    await card.locator("#openChooser").click({ timeout: 30000 }).catch(() => undefined);
    await sleep(400);
    const sel = card.locator("#courseCollege");
    if (await sel.count()) { const value = await sel.locator("option").nth(1).getAttribute("value"); if (value) await sel.selectOption(value); }
    await sleep(600);
    const row = card.locator(".course-option", { hasText: TWO_TAGS }).first();
    if (await row.count()) await row.evaluate((el: any) => el.scrollIntoView({ block: "center" }));
    await sleep(300);
    await shot(card, "teacher-card", width);
    note(`[${width}] الكرت: ${(await row.innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 120)}`);
    await card.close();
  });

  if (errors.length) note(`[${width}] أخطاء الصفحة: ${errors.slice(0, 3).join(" | ")}`);
  await context.close();
}

(async () => {
  await startServer();
  const browser = await chromium.launch();
  try {
    for (const width of WIDTHS) await run(browser, width);
  } finally {
    await browser.close();
    stopServer();
  }
})().catch(error => { console.error(error); stopServer(); process.exit(1); });
