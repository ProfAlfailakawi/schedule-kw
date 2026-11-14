/**
 * ── مركز الاستعلام في متصفحٍ حقيقي ───────────────────────────────────────────
 *
 * يشغّل الخادم التجريبي على منفذٍ خاص ثم يمرّ كما يمرّ القارئ:
 *  - كل عدسةٍ تُفتح بلا خطأٍ في المتصفح ولا طلبٍ فاشل ولا «undefined/NaN»، على الشاشة الكبيرة وعلى عرض الهاتف
 *    بلا تجاوزٍ أفقي للصفحة؛
 *  - كل ورقةٍ تُطبع إلى PDF بحجم A4 أفقي (عدد الصفحات ومقاسها)؛
 *  - ملف Excel بمرشّح المبنى يحمل صفوف الشاشة نفسها (لا ملفاً فارغاً)؛
 *  - السؤال المكتوب، و«لماذا لا نتائج؟»، وتقاريري على الخادم، وموجز الصباح، ومعاينة الصفحات.
 *
 * التشغيل: npm run test:e2e   (يلزم playwright ومتصفح Chromium؛ PLAYWRIGHT=<مسار> لتحديد الوحدة)
 * خارج المجموعة العامة (tests/suite.txt) عمداً: يحتاج متصفحاً مثبّتاً، فلا يُشغَّل حيث لا يوجد.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import * as XLSX from "xlsx";

const require = createRequire(import.meta.url);
let chromium: any;
try { ({ chromium } = require(process.env.PLAYWRIGHT || "playwright")); }
catch { console.log("تخطّي: playwright غير مثبّت هنا (PLAYWRIGHT=<مسار الوحدة>)."); process.exit(0); }

const PORT = Number(process.env.E2E_PORT || 3190);
const BASE = `http://127.0.0.1:${PORT}`;
let passed = 0, failed = 0;
const check = (ok: boolean, name: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`, detail === undefined ? "" : JSON.stringify(detail)); }
};

async function startServer(): Promise<ChildProcess> {
  const child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", PORT: String(PORT), NODE_ENV: "development" }, stdio: "ignore" });
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return child; } catch { /* لم يبدأ بعد */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  child.kill();
  throw new Error("الخادم التجريبي لم يبدأ");
}

/** إحداثيات كل كلمةٍ في كل صفحة (pdftotext -bbox): هي «هندسة الورقة». null إن لم تتوفّر الأداة. */
function wordBoxes(pdf: Buffer): string | null {
  const file = path.join(os.tmpdir(), `e2e-${process.pid}-${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(file, pdf);
  try {
    const out = spawnSync("pdftotext", ["-bbox", file, "-"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    return out.status === 0 ? out.stdout.split("\n").filter(line => /<(word|page) /.test(line)).join("\n") : null;
  } finally { fs.rmSync(file, { force: true }); }
}
const countPages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
const mediaBox = (pdf: Buffer) => { const m = pdf.toString("latin1").match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/); return m ? [Number(m[1]), Number(m[2])] : [0, 0]; };

async function main() {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const open = async (width: number, height: number) => {
      const context = await browser.newContext({ viewport: { width, height }, locale: "ar-KW", acceptDownloads: true });
      const page = await context.newPage();
      const issues: string[] = [];
      page.on("console", (m: any) => { if (m.type() === "error") issues.push(`console: ${m.text().slice(0, 200)}`); });
      page.on("pageerror", (e: any) => issues.push(`pageerror: ${String(e).slice(0, 200)}`));
      page.on("response", (r: any) => { if (r.status() >= 400 && r.url().includes("/api/")) issues.push(`http ${r.status()} ${r.url().replace(BASE, "")}`); });
      await page.addInitScript(() => {
        (window as any).print = () => { (window as any).__printed = ((window as any).__printed || 0) + 1; (window as any).__lastInk = document.documentElement.dataset.printInk || ""; };
        const read = Storage.prototype.getItem;
        Storage.prototype.getItem = function (key: string) { return String(key).startsWith("schedule-onboarding") ? "done" : read.call(this, key); };
      });
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      await page.request.post(`${BASE}/api/auth/demo`, { data: {} });
      await page.goto(`${BASE}/FSchedule/MainScheduleReport`, { waitUntil: "networkidle" });
      await page.waitForSelector(".lens-strip [role=tab]", { timeout: 30000 });
      await page.waitForTimeout(2500);
      return { context, page, issues };
    };
    const countText = async (page: any) => (await page.locator(".query-count").innerText().catch(() => "")).replace(/\s+/g, " ");
    const rowsOnScreen = async (page: any) => Number((await countText(page)).match(/^(\d+)/)?.[1] || 0);

    /* ── الشاشة الكبيرة: كل عدسة، وكل ورقة ── */
    const desktop = await open(1440, 900);
    const tabs: string[] = await desktop.page.locator(".lens-strip [role=tab]").allInnerTexts();
    check(tabs.length >= 14, "العدسات كلها في الشريط", tabs.length);
    for (let i = 0; i < tabs.length; i++) {
      const before = desktop.issues.length;
      await desktop.page.locator(".lens-strip [role=tab]").nth(i).click();
      await desktop.page.waitForTimeout(1500);
      const dirty = await desktop.page.locator("#query-lens-panel").evaluate((el: HTMLElement) => /undefined|NaN|\[object/.test(el.innerText));
      check(!dirty && desktop.issues.length === before, `عدسة «${tabs[i]}» تُفتح نظيفة`, desktop.issues.slice(before));
      const print = desktop.page.locator(".query-canvas-actions button.query-print-icon, .query-canvas-actions .query-report-action > button.query-print-icon").first();
      if (!(await print.count())) continue;
      if (tabs[i] === "الأساتذة") { await print.click(); await desktop.page.locator(".query-scope-menu [role=menuitem]").first().click(); await desktop.page.waitForTimeout(2500); }
      else { await print.click(); await desktop.page.waitForTimeout(600); }
      /* أولُ رسمٍ بعد الطباعة يسبق استقرار الخطوط فتختلف إحداثياته قليلاً عن اللاحق: يُرمى، والمقارنةُ بين رسمين مستقرّين. */
      await desktop.page.pdf({ preferCSSPageSize: true, printBackground: true });
      const pdf: Buffer = await desktop.page.pdf({ preferCSSPageSize: true, printBackground: true });
      const [w, h] = mediaBox(pdf);
      check(countPages(pdf) >= 1 && w > h && Math.abs(w - 841.9) < 3, `ورقة «${tabs[i]}»: A4 أفقي بعدد صفحاتٍ معقول`, { pages: countPages(pdf), w, h });
      /* موفّر الحبر: السمةُ نفسها التي يضعها أمر الطباعة. الورقةُ هي هي بالمليمتر — كلُّ كلمةٍ في مكانها وبعدد الصفحات نفسه. */
      const plain = wordBoxes(pdf);
      if (plain !== null) {
        await desktop.page.evaluate(() => { document.documentElement.dataset.printInk = "1"; });
        const inked: Buffer = await desktop.page.pdf({ preferCSSPageSize: true, printBackground: true });
        await desktop.page.evaluate(() => { delete document.documentElement.dataset.printInk; });
        check(wordBoxes(inked) === plain, `موفّر الحبر: ورقة «${tabs[i]}» بالهندسة نفسها تماماً (إحداثيات الكلمات وعدد الصفحات)`, { pages: [countPages(pdf), countPages(inked)] });
      }
      await desktop.page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
      await desktop.page.waitForTimeout(300);
    }
    await desktop.page.locator(".lens-strip [role=tab]").first().click();
    await desktop.page.waitForTimeout(1200);

    /* ── التقرير الشامل (الوثيقة الرسمية) بموفّر الحبر: الهندسة نفسها أيضاً ── */
    await desktop.page.locator('button:has-text("التقرير الشامل")').click();
    await desktop.page.waitForTimeout(400);
    await desktop.page.keyboard.press("Enter");
    await desktop.page.waitForTimeout(1500);
    await desktop.page.pdf({ preferCSSPageSize: true, printBackground: true });
    const official: Buffer = await desktop.page.pdf({ preferCSSPageSize: true, printBackground: true });
    const officialBoxes = wordBoxes(official);
    if (officialBoxes !== null) {
      await desktop.page.evaluate(() => { document.documentElement.dataset.printInk = "1"; });
      const officialInk: Buffer = await desktop.page.pdf({ preferCSSPageSize: true, printBackground: true });
      await desktop.page.evaluate(() => { delete document.documentElement.dataset.printInk; });
      check(wordBoxes(officialInk) === officialBoxes, "موفّر الحبر: التقرير الشامل الرسمي بالهندسة نفسها تماماً", { pages: [countPages(official), countPages(officialInk)] });
    }
    await desktop.page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await desktop.page.waitForTimeout(400);

    /* ── Excel بمرشّح المبنى = صفوف الشاشة ── */
    await desktop.page.locator('button[title="مرشحات إضافية"]').click();
    const building = desktop.page.locator('#query-more-filters .field:has(label:text-is("المبنى")) select');
    await building.selectOption({ index: 1 });
    await desktop.page.waitForTimeout(900);
    const onScreen = await rowsOnScreen(desktop.page);
    const href = await desktop.page.locator('a[aria-label="تصدير Excel"]').getAttribute("href");
    const book = XLSX.read(Buffer.from(await (await desktop.page.request.get(`${BASE}${href}`)).body()), { type: "buffer" });
    const fileRows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]).length;
    check(onScreen > 0 && fileRows === onScreen, "Excel بمرشّح المبنى يحمل صفوف الشاشة نفسها", { onScreen, fileRows });
    await desktop.page.locator('button[aria-label="مسح كل المرشحات الإضافية"]').click();
    await desktop.page.waitForTimeout(500);

    /* ── السؤال: يفهم، ويسأل «هل تقصد؟»، ولا يمسح شيئاً حين لا يفهم ── */
    const ask = async (text: string) => { await desktop.page.locator(".query-ask input").fill(text); await desktop.page.keyboard.press("Enter"); await desktop.page.waitForTimeout(1000); };
    await ask("قاعات فارغة الثلاثاء 10");
    check((await desktop.page.locator(".lens-strip [role=tab].active").innerText()).includes("القاعات"), "«قاعات فارغة الثلاثاء 10» تفتح القاعات");
    await ask("جدول تجريبي");
    check((await desktop.page.locator(".query-ask-choices button").count()) >= 2, "اسمٌ مشترك ← «هل تقصد؟» بخياراتٍ");
    await ask("كلامٌ لا يُفهم أبداً");
    check((await desktop.page.locator(".query-ask-note.is-failed").count()) === 1 && (await desktop.page.locator(".query-filter-chip").count()) >= 1, "جملةٌ لا تُفهم ← تنبيهٌ ولا مسحٌ للمرشحات");
    await desktop.page.locator('.query-ask button[aria-label="مسح السؤال"]').click();
    await desktop.page.waitForTimeout(500);

    /* ── لماذا لا نتائج؟ (في عدسة القائمة: القاعات تعرض شبكتها بقاعاتٍ فارغة لا قائمةً فارغة) ── */
    await desktop.page.locator(".lens-strip [role=tab]").first().click();
    await desktop.page.waitForTimeout(600);
    if (!(await desktop.page.locator("#query-more-filters").count())) await desktop.page.locator('button[title="مرشحات إضافية"]').click();
    await desktop.page.locator('select[aria-label="من"]').selectOption("19:00");
    await desktop.page.locator('select[aria-label="إلى"]').selectOption("20:00");
    await desktop.page.locator(".day-pills label", { hasText: "الأحد" }).click();
    await desktop.page.waitForTimeout(800);
    const why = desktop.page.locator(".query-why-chips button");
    check((await why.count()) >= 2, "الشاشة الفارغة تعرض كل مرشّحٍ بما يُعيده لو أُزيل");
    await desktop.page.locator(".query-why-chips button.is-best").click();
    await desktop.page.waitForTimeout(700);
    check((await rowsOnScreen(desktop.page)) > 0, "إزالة أنفع مرشّحٍ تُعيد النتائج");
    await desktop.page.locator('button[aria-label="مسح كل المرشحات الإضافية"]').click().catch(() => undefined);

    /* ── «لو نقلتُ…»: بطاقةٌ بالأرقام، ولا شيء يتغيّر في الجدول ── */
    await ask("لو نقلت شعبة 101 للثلاثاء 10");
    check((await desktop.page.locator(".query-whatif").count()) === 1 && (await desktop.page.locator(".query-whatif li, .query-whatif .qw-none").count()) >= 1, "«لو نقلت شعبة 101 للثلاثاء 10» تعرض بطاقةً بالنتيجة");
    await desktop.page.locator(".query-whatif .qw-x").click();
    check((await desktop.page.locator(".query-whatif").count()) === 0, "البطاقة تُغلق");

    /* ── موفّر الحبر: اختيارٌ يبقى، وأمر الطباعة يضع السمة ── */
    await desktop.page.locator('button[aria-label^="معاينة صفحات"]').click();
    await desktop.page.locator('button[aria-label="موفّر الحبر"]').click();
    check((await desktop.page.evaluate(() => localStorage.getItem("schedule-print-ink"))) === "1", "موفّر الحبر يُحفظ في المتصفح");
    await desktop.page.locator(".query-preview-print").click();
    await desktop.page.waitForTimeout(500);
    check((await desktop.page.evaluate(() => (window as any).__lastInk)) === "1", "أمر الطباعة وضع سمة موفّر الحبر");
    await desktop.page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await desktop.page.waitForTimeout(300);
    check((await desktop.page.evaluate(() => document.documentElement.dataset.printInk || "")) === "", "السمة تُرفع عند انتهاء الطباعة");
    await desktop.page.locator('button[aria-label^="معاينة صفحات"]').click();
    await desktop.page.locator('button[aria-label="موفّر الحبر"]').click();
    await desktop.page.keyboard.press("Escape");
    check((await desktop.page.evaluate(() => localStorage.getItem("schedule-print-ink"))) === "0", "وإيقافه يُحفظ أيضاً");

    /* ── تقاريري على الخادم ── */
    await desktop.page.locator('button[aria-label="تقاريري"]').click();
    await desktop.page.locator(".query-saved-pop input").fill("اختبار");
    await desktop.page.locator('button[aria-label="شارك مع القسم"]').click();
    await desktop.page.locator('button[aria-label="حفظ"]').click();
    await desktop.page.waitForTimeout(800);
    const saved = await desktop.page.evaluate(async () => (await (await fetch("/api/reports/saved")).json()).reports);
    check(saved.length === 1 && saved[0].shared === true && saved[0].mine === true, "الاستعلام المحفوظ يصل الخادم، مشارَكاً مع القسم", saved);
    await desktop.page.keyboard.press("Escape");

    /* ── موجز الصباح، ومعاينة الصفحات ── */
    check((await desktop.page.locator(".morning-brief-tiles i").count()) === 4, "موجز الصباح: أربع بطاقات بأيقونات وأرقام");
    await desktop.page.locator('button[aria-label^="معاينة صفحات"]').click();
    await desktop.page.waitForTimeout(700);
    check((await desktop.page.locator(".query-preview-pop li").count()) >= 1, "معاينة الطباعة تعرض الأوراق بأرقامها");
    check(desktop.issues.length === 0, "لا خطأ متصفحٍ ولا طلبٌ فاشل في كل الرحلة", desktop.issues);
    await desktop.context.close();

    /* ── الهاتف: كل عدسةٍ بلا تجاوزٍ أفقي ── */
    const phone = await open(390, 844);
    const phoneTabs: string[] = await phone.page.locator(".lens-strip [role=tab]").allInnerTexts();
    for (let i = 0; i < phoneTabs.length; i++) {
      await phone.page.locator(".lens-strip [role=tab]").nth(i).click();
      await phone.page.waitForTimeout(1200);
      const overflow = await phone.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(overflow <= 0, `الهاتف: «${phoneTabs[i]}» بلا تجاوزٍ أفقي`, overflow);
    }
    check(phone.issues.length === 0, "الهاتف: لا خطأ متصفحٍ", phone.issues);
    await phone.context.close();
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(`\nquery center e2e: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(error => { console.error(error); process.exit(1); });
