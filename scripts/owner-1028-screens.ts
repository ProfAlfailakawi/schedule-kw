/**
 * لقطات التحقق البصري لملاحظات المالك 2026-10-28 (390px و1440px) — خادمُ ديمو خاصّ بمنفذٍ خاص،
 * وسياقُ متصفّحٍ مستقلّ لكل عرض. تُحفظ في docs/owner-1028/.
 *   PLAYWRIGHT=<مسار playwright> npx tsx scripts/owner-1028-screens.ts
 * التسلسل: مساري (البطاقة → «فهمت» → الشريط → الألسنة → إعادة التحميل) · رصيد المقاعد ·
 * تعبئة الأسماء · كرت المدرّب · حالة الطرح في الكرت · شريط «انتهت فترة الطلبات».
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { formatScheduleTimeRange } from "../src/utils/scheduleTime";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const XLSX = require("xlsx");
const PORT = Number(process.env.SCREENS_PORT || 3461);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.resolve("docs/owner-1028");
fs.mkdirSync(OUT, { recursive: true });
const WIDTHS = [390, 1440] as const;
/* SCREENS_ONLY=l4,m2 … يقصر التشغيل على أقسامٍ بعينها. */
const ONLY = String(process.env.SCREENS_ONLY || "").split(",").filter(Boolean);
const want = (key: string) => !ONLY.length || ONLY.includes(key);
const log: string[] = [];
const note = (line: string) => { log.push(line); console.log(line); };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let server: ChildProcess | null = null;
async function startServer() {
  server = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", PORT: String(PORT) }, stdio: "ignore", detached: true });
  for (let i = 0; i < 150; i++) { try { if ((await fetch(BASE + "/api/demo/config")).ok) return; } catch { /* يقلع */ } await sleep(1000); }
  throw new Error("server did not start");
}
const stopServer = () => { if (server?.pid) { try { process.kill(-server.pid, "SIGKILL"); } catch { server.kill("SIGKILL"); } } };

async function adminContext(browser: any, width: number) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 1, locale: "ar-KW", colorScheme: "light" });
  const login = await context.request.post(BASE + "/api/auth/demo", { data: {} });
  if (!login.ok()) throw new Error("demo login " + login.status());
  for (let i = 0; i < 360; i++) { const s = await (await context.request.get(BASE + "/api/demo/seed-status")).json(); if (s.status === "ready") break; await sleep(500); }
  await context.request.post(BASE + "/api/demo/role", { data: { role: "admin" } });
  return context;
}
const shot = async (page: any, name: string, width: number, locator?: any) => {
  const file = path.join(OUT, `${name}-${width}.png`);
  if (locator) await locator.screenshot({ path: file }); else await page.screenshot({ path: file, fullPage: false });
  note(`📸 ${path.relative(process.cwd(), file)}`);
};
const kuwaitLocal = (msFromNow: number) => {
  const d = new Date(Date.now() + msFromNow + 3 * 3600000);
  return d.toISOString().slice(0, 16);
};
const clickText = (page: any, text: string) => page.evaluate(`(() => { const b = [...document.querySelectorAll("button")].find(x => x.offsetParent && x.innerText.trim() === ${JSON.stringify(text)}); if (b) b.click(); return !!b; })()`);
async function openDataTools(page: any) {
  await page.locator("button:has-text('إضافة موعد')").first().waitFor({ timeout: 60000 }).catch(() => undefined);
  await sleep(1500);
  await page.keyboard.press("Escape").catch(() => undefined);
  if (!(await clickText(page, "أدوات البيانات"))) { await clickText(page, "المزيد"); await sleep(300); await clickText(page, "أدوات البيانات"); }
  await sleep(1000);
}
const J = async (r: any) => { try { return await r.json(); } catch { return {}; } };

async function masari(browser: any, width: number) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, locale: "ar-KW" });
  const page = await context.newPage();
  const errors: string[] = []; page.on("pageerror", (e: any) => errors.push(String(e)));
  await page.goto(BASE + "/me/demo", { waitUntil: "domcontentloaded" });
  const ack = page.locator(".mack");
  await ack.waitFor({ timeout: 30000 });
  await shot(page, "m2-masari-entry-card", width);
  await page.locator("#mackOk").click();
  await page.locator("#mribbon").waitFor();
  await sleep(600);
  await shot(page, "m2-masari-home-ribbon", width);
  for (const tab of await page.locator("nav.tabs [data-tab], nav.tabs button").all()) {
    const label = (await tab.innerText().catch(() => "")).trim().replace(/\s+/g, "-").slice(0, 16);
    await tab.click().catch(() => undefined); await sleep(700);
    if (label) await shot(page, `m2-masari-tab-${label}`, width);
  }
  await page.reload({ waitUntil: "domcontentloaded" }); await sleep(800);
  const again = await page.locator(".mack").count();
  note(`M2 [${width}] بعد «فهمت» وإعادة التحميل: البطاقة ${again ? "عادت ✗" : "لم تعد ✓"} · الشريط ${await page.locator("#mribbon").count() ? "ظاهر ✓" : "غائب ✗"} · أخطاء الصفحة ${errors.length}`);
  await context.close();
}

async function admin(browser: any, width: number) {
  const context = await adminContext(browser, width);
  const page = await context.newPage();
  const errors: string[] = []; page.on("pageerror", (e: any) => errors.push(String(e)));
  const api = context.request;
  const scope = { collegeId: 1, sectionId: 1, termId: 1 };

  /* ── L3: رصيد المقاعد ── */
  if (want("l3")) {
  await api.put(BASE + "/api/advisor-seats/config", { data: { ...scope, config: { global: 6, capacityDefault: 30, fairSplit: false } } });
  const seats = await J(await api.get(BASE + "/api/advisor-seats?collegeId=1&sectionId=1&termId=1"));
  const keys = (seats.sections || []).map((s: any) => s.key);
  const msgs: string[] = [];
  if (keys[0]) { for (const n of [3, 3, 1]) msgs.push((await J(await api.post(BASE + "/api/advisor-seats/add", { data: { ...scope, key: keys[0], count: n } }))).message || ""); }
  if (keys[1]) msgs.push((await J(await api.post(BASE + "/api/advisor-seats/add", { data: { ...scope, key: keys[1], count: 5 } }))).message || "");
  if (keys[0]) await api.post(BASE + "/api/advisor-seats/exception", { data: { ...scope, key: keys[0], count: 2 } });
  note(`L3 [${width}] رسائل: ${msgs.join(" | ")}`);
  await page.goto(BASE + "/FSchedule/StudentRegistration", { waitUntil: "domcontentloaded" });
  await page.locator("summary:has-text('رصيد مقاعد المرشد')").waitFor({ timeout: 90000 }).catch(() => undefined);
  await page.keyboard.press("Escape").catch(() => undefined);
  const seatDetails = page.locator("details:has(> summary:has-text('رصيد مقاعد المرشد'))");
  await seatDetails.waitFor({ timeout: 60000 });
  await seatDetails.evaluate("d => { d.open = true; d.scrollIntoView({ block: 'start' }); }");
  await sleep(1500);
  if (keys[0]) {
    await page.locator(".of-card").first().getByRole("button", { name: "+1" }).click().catch(() => undefined);
    await sleep(900);
  }
  await seatDetails.evaluate("d => d.scrollIntoView({ block: 'start' })");
  await sleep(400);
  await shot(page, "l3-advisor-seats", width);
  await page.locator("[aria-label='رصيد مقاعد المرشد'] .of-table").first().scrollIntoViewIfNeeded().catch(() => undefined);
  await sleep(300);
  await shot(page, "l3-advisor-board", width);

  }
  /* ── C5 + TA + C6: نُعدّ البيانات من واجهات المسؤول نفسها ── */
  const phase = await J(await api.get(BASE + "/api/ta-phase?collegeId=1&sectionId=1&termId=1"));
  const vacantCourse = Number(phase.vacant?.[0]?.courseId || 0);
  const catalogue: any[] = phase.courses || [];
  const others = catalogue.filter(c => c.id !== vacantCourse);
  await api.put(BASE + "/api/course-offering", { data: { ...scope, display: "fade", courses: [
    ...(others[0] ? [{ courseId: others[0].id, state: "closed" }] : []),
    ...(others[1] ? [{ courseId: others[1].id, state: "future", level: 300 }] : []),
    ...(others[2] ? [{ courseId: others[2].id, state: "limited", maxSections: 3 }] : []),
  ] } });
  await api.post(BASE + "/api/ta-phase/open", { data: { ...scope, waves: [[29, 30]], delayHours: 0, closesAt: kuwaitLocal(2 * 86400000), reminderHours: 72, allowedCourses: vacantCourse ? { 29: [vacantCourse] } : {} } });
  const after = await J(await api.get(BASE + "/api/ta-phase?collegeId=1&sectionId=1&termId=1"));
  const taLink = after.tas?.find((t: any) => t.id === 29)?.linkId;

  /* لوحة المسؤول: نوع الإرسال + مرحلة التدريب + حالة الطرح */
  if (want("e1")) {
  await page.goto(BASE + "/FSchedule/Index", { waitUntil: "domcontentloaded" });
  await page.keyboard.press("Escape").catch(() => undefined);
  await sleep(800);
  await openDataTools(page);
  await clickText(page, "نشر"); await sleep(1200);
  await clickText(page, "نشر الجدول"); await sleep(1200);
  const staffKind = page.locator(".share-kind button[title='بطاقة الأستاذ']");
  if (await staffKind.count()) {
    await staffKind.click();
    await page.locator("#publish-step-kind button:has-text('التالي')").click();
    await sleep(800);
    const dialog = page.locator("#publish-step-options");
    await shot(page, "e1-send-mode", width, dialog);
    await page.locator(".send-mode button").nth(2).click();
    await page.locator("[aria-label='مرحلة التدريب'] .of-grid, [aria-label='مرحلة التدريب'] .of-wave").first().waitFor({ timeout: 20000 }).catch(() => undefined);
    await sleep(800);
    await shot(page, "f-ta-phase-panel", width, page.locator("[aria-label='مرحلة التدريب']").first());
    await page.locator(".send-mode button").nth(1).click();
    await page.locator("details.of-section > summary").first().click();
    await page.locator("[aria-label='حالة طرح المقررات'] .of-card").first().waitFor({ timeout: 20000 }).catch(() => undefined);
    await sleep(600);
    await shot(page, "c5-offering-admin", width, page.locator("[aria-label='حالة طرح المقررات']").first());
  } else note(`E1 [${width}] تعذّر فتح نافذة النشر`);

  }
  /* كرت المدرّب (F3) */
  if (taLink) {
    const ta = await context.newPage();
    await ta.goto(`${BASE}/r/${taLink}`, { waitUntil: "domcontentloaded" });
    await ta.locator(".tc-ribbon").waitFor({ timeout: 30000 }).catch(() => undefined);
    await sleep(800);
    await shot(ta, "f3-ta-card", width);
    await ta.close();
  } else note(`F3 [${width}] لا رابط مدرّب`);

  /* حالة الطرح في كرت الأستاذ (C5) + لاصق (C6) */
  const inbox = await J(await api.get(BASE + "/api/instructor-requests?collegeId=1&sectionId=1&termId=1"));
  const editRow = (inbox.rows || []).find((r: any) => r.linkMode !== "ta" && r.status === "sent" && r.linkId);
  if (editRow) {
    const card = await context.newPage();
    await card.goto(`${BASE}/r/${editRow.linkId}`, { waitUntil: "domcontentloaded" });
    await card.locator("#openChooser").click({ timeout: 30000 }).catch(() => undefined);
    await sleep(400);
    const sel = card.locator("#courseCollege");
    if (await sel.count()) { const value = await sel.locator("option").nth(1).getAttribute("value"); if (value) await sel.selectOption(value); }
    await sleep(600);
    const chooser = card.locator(".course-chooser");
    if (await chooser.count()) { await chooser.scrollIntoViewIfNeeded(); await shot(card, "c5-teacher-card-offering", width, chooser); }
    note(`C5 [${width}] مقررات مقفلة في الكرت: ${await card.locator(".course-option[data-locked='1']").count()} · متاحة ${await card.locator(".course-option:not([data-locked])").count()}`);
    await card.close();
  }

  /* L4: تعبئة الأسماء — قراءةُ PDF تُستبدل (route) بسطور الجدول نفسه بلا أسماء، وسطرٌ بوقتٍ مختلف (⚠️):
     ما يُختبر هو اللوحة والمطابقة على الخادم الحقيقي، لا قارئُ OCR. */
  if (want("l4")) {
    const current: any[] = await J(await api.get(BASE + "/api/schedules?collegeId=1&sectionId=1&termId=1"));
    const rows = (Array.isArray(current) ? current : []).slice(0, 10).map((r: any, i: number) => ({
      ...r, AdInstructorId: 0, sourceInstructorText: "",
      ...(i === 1 ? { fstarttime: r.fendtime, fendtime: (() => { const [h, m] = String(r.fendtime).split(":").map(Number); const t = h * 60 + m + 75; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; })() } : {}),
    }));
    if (rows.length) {
      await page.route("**/api/intelligence/pdf-import?**", (route: any) => route.fulfill({ status: 200, contentType: "application/x-ndjson",
        body: JSON.stringify({ type: "progress", phase: "read", page: 1, pages: 1 }) + "\n" + JSON.stringify({ type: "done", result: { rows, pages: 1, ready: true, issues: [] } }) + "\n" }));
      await page.goto(BASE + "/FSchedule/Index", { waitUntil: "domcontentloaded" });
      await openDataTools(page);
      await clickText(page, "استيراد"); await sleep(1500);
      const input = page.locator("input.transfer-file");
      if (await input.count()) {
        await input.setInputFiles(path.resolve("tests/fixtures/plans/graduation-2026/ba-0101.pdf"));
        const panel = page.locator("[aria-label='تعبئة أسماء الأساتذة']");
        await panel.waitFor({ timeout: 60000 }).catch(() => undefined);
        if (await panel.count()) {
          await panel.scrollIntoViewIfNeeded(); await sleep(300);
          await shot(page, "l4-name-fill-start", width, panel);
          await panel.getByRole("button", { name: /من الجدول الحالي/ }).click();
          await panel.locator(".of-table").waitFor({ timeout: 30000 }).catch(() => undefined);
          await sleep(500);
          await shot(page, "l4-name-fill-preview", width, panel);
          note(`L4 [${width}] ${(await panel.locator(".of-kpi").allInnerTexts()).map((t: string) => t.replace(/\s+/g, " ")).join(" | ")}`);
          await panel.getByRole("button", { name: /اعتمد/ }).last().click().catch(() => undefined);
          await sleep(500);
          note(`L4 [${width}] بعد الاعتماد: زر التراجع ${await panel.getByRole("button", { name: /تراجع/ }).count() ? "ظاهر ✓" : "غائب ✗"}`);
        } else note(`L4 [${width}] لم تظهر لوحة الأسماء`);
      } else note(`L4 [${width}] لم يُفتح الاستيراد`);
      await page.unroute("**/api/intelligence/pdf-import?**");
    }
  }

  /* C4: نافذة طلبات تُغلق بعد دقيقتين، ثم الكرت */
  if (want("c4") && editRow && width === WIDTHS[WIDTHS.length - 1]) {
    await api.post(BASE + "/api/instructor-requests/issue", { data: { ...scope, closesAt: kuwaitLocal(90_000), source: "draft", reopen: true, mode: "edit" } });
  }
  note(`[${width}] أخطاء صفحة المسؤول: ${errors.length}${errors.length ? " — " + errors.slice(0, 2).join(" / ") : ""}`);
  return { context, editRow };
}

async function closedRibbon(contexts: Array<{ context: any; width: number; link: string }>) {
  note("C4 ينتظر إغلاق النافذة (~٢ دقيقة)…");
  await sleep(150_000);
  for (const { context, width, link } of contexts) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    await page.goto(`${BASE}/r/${link}`, { waitUntil: "domcontentloaded" });
    await page.locator(".tc-ribbon[data-k=closed]").waitFor({ timeout: 30000 }).catch(() => undefined);
    await sleep(600);
    await shot(page, "c4-closed-ribbon", width);
    note(`C4 [${width}] الشريط ${await page.locator(".tc-ribbon[data-k=closed]").count() ? "ظاهر ✓" : "غائب ✗"} · أدوات التعديل ${await page.locator(".acts, .add-card, .send").count() ? "موجودة ✗" : "مزالة ✓"}`);
    await page.close();
  }
}

async function main() {
  await startServer();
  const browser = await chromium.launch();
  try {
    if (want("m2")) for (const width of WIDTHS) await masari(browser, width);
    const closing: Array<{ context: any; width: number; link: string }> = [];
    let lastContext: any = null, link = "";
    for (const width of WIDTHS) {
      const { context, editRow } = await admin(browser, width);
      if (lastContext) await lastContext.close();
      lastContext = context; link = editRow?.linkId || link;
    }
    if (want("c4") && link && lastContext) { for (const width of WIDTHS) closing.push({ context: lastContext, width, link }); await closedRibbon(closing); }
  } finally {
    await browser.close();
    stopServer();
    fs.writeFileSync(path.join(OUT, "_log.txt"), log.join("\n") + "\n");
  }
}
main().catch(error => { console.error(error); stopServer(); process.exit(1); });
