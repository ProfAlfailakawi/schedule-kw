/**
 * ── مرورٌ حقيقي في المتصفح على نماذج المواعيد (R3) ──────────────────────────────
 * اختياري: يعمل حين يُعطى APPOINTMENT_BROWSER_MODULE (مسار وحدة Playwright) وخادمُ تجربة
 * (R3_BASE). يقود الواجهة كما يقودها المستخدم: يختار المقرر، ويضغط اليوم، ويكتب البداية
 * أو يديرها بالعجلة، ويرسم خانةً في الأسبوع — ثم يقرأ ما في النموذج.
 */
type Report = (ok: unknown, label: string, extra?: unknown) => void;

const COURSE = "الاتصال التعليمي";
const DAY_LABELS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];

export async function driveAppointmentForms(base: string, check: Report, shots?: string) {
  const modulePath = process.env.APPOINTMENT_BROWSER_MODULE;
  if (!modulePath) return false;
  const playwright = await import(modulePath);
  const chromium = playwright.chromium || playwright.default?.chromium;
  const browser = await chromium.launch({ headless: true, ...(process.env.APPOINTMENT_CHROMIUM ? { executablePath: process.env.APPOINTMENT_CHROMIUM } : {}) });
  const errors: string[] = [];
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, locale: "ar", ...(width < 600 ? { isMobile: true, hasTouch: true } : {}) });
      /* جولة التعريف تُعدّ مرئيةً سلفاً: تظهر متأخرةً فتغطّي ما يُضغط. */
      await context.addInitScript(() => {
        const read = Storage.prototype.getItem;
        Storage.prototype.getItem = function (key: string) { return String(key).startsWith("schedule-onboarding") ? "done" : read.call(this, key); };
      });
      await context.request.post(base + "/api/auth/demo", { timeout: 180000 });
      const fresh = async () => {
        const page = await context.newPage();
        page.setDefaultTimeout(20000);
        page.setDefaultNavigationTimeout(180000);
        page.on("pageerror", (error: Error) => errors.push(error.message));
        await page.goto(base + "/FSchedule/Index");
        await page.getByRole("button", { name: "إضافة موعد" }).first().waitFor({ timeout: 180000 });
        /* جولة التعريف تُفتح مرةً لكل صفة: تُتخطّى كما يتخطّاها المستخدم. */
        await page.getByRole("button", { name: "تخطّي" }).click({ timeout: 6000 }).catch(() => {});
        await page.waitForTimeout(300);
        return page;
      };
      const ready = (page: any) => page.locator('.ss-trigger[data-guide-editor-field="course-name"]:not([disabled])').waitFor({ timeout: 30000 }).then(() => true).catch(() => false);
      const openNew = async (page: any) => {
        for (let i = 0; i < 6; i++) {
          /* نموذجٌ فُتح قبل أن يُعرف نطاق اللوحة يبقى بلا قسم: يُغلق ويُفتح من جديد. */
          if (await page.locator(".day-pills").count()) { if (await ready(page)) return; await page.reload(); await page.getByRole("button", { name: "إضافة موعد" }).first().waitFor({ timeout: 180000 }); continue; }
          const skip = page.getByRole("button", { name: "تخطّي" });
          if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => {});
          await page.getByRole("button", { name: "إضافة موعد" }).first().click({ timeout: 4000 }).catch(() => {});
          if (await page.locator(".day-pills").waitFor({ timeout: 4000 }).then(() => true).catch(() => false) && await ready(page)) return;
        }
        throw new Error("تعذّر فتح «إضافة موعد»");
      };
      const course = async (page: any) => {
        await page.locator('.ss-trigger[data-guide-editor-field="course-name"]:not([disabled])').click({ timeout: 60000 });
        await page.locator(".ss-pop input").fill(COURSE).catch(() => {});
        await page.locator(".ss-pop [role=option]", { hasText: COURSE }).first().click({ timeout: 30000 });
        await page.waitForTimeout(400);
      };
      const day = async (page: any, label: string) => { await page.locator(".day-pills label", { hasText: new RegExp(`^${label}$`) }).click(); await page.waitForTimeout(250); };
      const typeStart = async (page: any, text: string) => {
        const field = page.locator('[data-guide-editor-field="time"]');
        await field.click(); await field.fill(""); await field.pressSequentially(text, { delay: 25 }); await field.blur(); await page.waitForTimeout(400);
      };
      const wheel = async (page: any, hour: number) => {
        await page.getByRole("button", { name: "عدّاد الوقت" }).click();
        await page.locator('[aria-label="الساعة"] [role=option]', { hasText: String(hour).padStart(2, "0") }).first().click();
        await page.waitForTimeout(400);
        await page.keyboard.press("Escape");
      };
      const read = async (page: any) => {
        const days: string[] = [];
        for (const [index, label] of DAY_LABELS.entries()) if (await page.locator(".day-pills input").nth(index).isChecked()) days.push(label);
        const times = page.locator(".schedule-time-control input.time-field");
        return { days: days.join("·"), start: await times.nth(0).inputValue(), end: await times.nth(1).inputValue(), off: await page.locator(".regulation-chips-off").count() };
      };
      const flows: Array<[string, (page: any) => Promise<void>, { days: RegExp; start: string; end: string }]> = [
        ["المقرر ← الأحد ← كتابة 08:00", async page => { await course(page); await day(page, "الأحد"); await typeStart(page, "0800"); }, { days: /^الأحد·الثلاثاء·الخميس$/, start: "08:00", end: "08:50" }],
        ["الأحد ← كتابة 08:00 ← المقرر أخيراً", async page => { await day(page, "الأحد"); await typeStart(page, "0800"); await course(page); }, { days: /^الأحد·الثلاثاء·الخميس$/, start: "08:00", end: "08:50" }],
        ["الأربعاء ← المقرر ← كتابة 10:00", async page => { await day(page, "الأربعاء"); await course(page); await typeStart(page, "1000"); }, { days: /^الاثنين·الأربعاء$/, start: "10:00", end: "11:20" }],
        ["المقرر ← الأحد ← العجلة 09", async page => { await course(page); await day(page, "الأحد"); await wheel(page, 9); }, { days: /^الأحد·الثلاثاء·الخميس$/, start: "09:00", end: "09:50" }],
        ["المقرر ← كتابة 08:00 بلا يوم", async page => { await course(page); await typeStart(page, "0800"); }, { days: /^(الأحد·الثلاثاء·الخميس|الاثنين·الأربعاء)$/, start: "08:00", end: "" }],
        ["كتابة 08:00 ← المقرر", async page => { await typeStart(page, "0800"); await course(page); }, { days: /^(الأحد·الثلاثاء·الخميس|الاثنين·الأربعاء)$/, start: "08:00", end: "" }],
      ];
      for (const [name, run, want] of process.env.R3_ONLY === "extras" ? [] : flows) {
        const page = await fresh();
        try {
          await openNew(page);
          await run(page);
          const got = await read(page);
          const end = want.end || (got.days.includes("الثلاثاء") ? "08:50" : "09:20");
          check(want.days.test(got.days) && got.start === want.start && got.end === end && !got.off, `B ${width}: ${name} → ${got.days} ${got.start}–${got.end}`, got);
          if (shots) await page.screenshot({ path: `${shots}/r3-${width}-${name.replace(/[^\p{L}\d]+/gu, "-")}.png` }).catch(() => {});
        } catch (error) {
          check(false, `B ${width}: ${name}`, String(error));
        } finally { await page.close(); }
      }
      if (width < 600) { await context.close(); continue; }
      /* «موعد جديد» السريع من خانة الأسبوع (سطح المكتب وحده؛ الهاتف بلا أسبوع). */
      {
        const page = await fresh();
        try {
          await page.getByRole("button", { name: /^أسبوع$/ }).first().click({ timeout: 120000 });
          const slot = '[data-physics-slot="true"][data-physics-day="fwednesday"][data-physics-start="17:00"]';
          await page.locator(slot).first().waitFor({ timeout: 60000 });
          await page.waitForTimeout(1500);
          let point: { x: number; y: number } | null = null;
          for (let attempt = 0; attempt < 5 && !point; attempt++) {
            await page.locator(slot).first().evaluate((element: Element) => element.scrollIntoView({ block: "center" })).catch(() => {});
            await page.waitForTimeout(400);
            point = await page.evaluate((query: string) => {
              const element = document.querySelector(query); if (!element) return null; const rect = element.getBoundingClientRect();
              for (let y = rect.top + 4; y < rect.bottom - 2; y += 6) for (let x = rect.left + 4; x < rect.right - 2; x += 6) if (document.elementFromPoint(x, y) === element) return { x, y };
              return null;
            }, slot);
          }
          if (!point) throw new Error("لا موضع فارغ في خانة الأربعاء 17:00");
          await page.mouse.click(point.x, point.y);
          await page.locator(".quick-create").waitFor();
          await page.locator(".quick-create .ss-trigger").first().click();
          await page.locator(".ss-pop input").fill(COURSE).catch(() => {});
          await page.locator(".ss-pop [role=option]", { hasText: COURSE }).first().click();
          await page.waitForTimeout(400);
          const on = (await page.locator(".quick-create .qc-days button.is-on").allInnerTexts()).join("·");
          const head = await page.locator(".quick-create .qc-head time").innerText();
          check(on === "اثنين·أربعاء" && /17:00\s*–\s*18:20/.test(head), `B 1440: خانة الأربعاء ← المقرر في «موعد جديد» السريع → ${on} ${head}`);
        } catch (error) {
          check(false, "B 1440: «موعد جديد» السريع", String(error));
          if (shots) await page.screenshot({ path: `${shots}/r3-fail-quick.png` }).catch(() => {});
        } finally { await page.close(); }
      }
      /* «لاصق بمحاضرتي» مطويّ افتراضياً، ويُتذكَّر مفتوحاً على الجهاز. */
      {
        const pickTeacher = async (page: any) => {
          await openNew(page);
          await course(page);
          await page.locator('[data-guide-editor-field="instructor"] button').first().click({ force: true });
          await page.locator(".instructor-picker [role=option]:not(.instructor-placeholder-option)", { has: page.locator("b", { hasText: /^عضو هيئة تدريس تجريبي 4$/ }) }).first().click();
          await page.locator(".lecture-stick").waitFor({ timeout: 20000 });
        };
        const page = await fresh();
        try {
          await page.evaluate(() => localStorage.removeItem("lecture-stick:open"));
          await page.reload();
          await page.getByRole("button", { name: "إضافة موعد" }).first().waitFor({ timeout: 180000 });
          await pickTeacher(page);
          const stick = page.locator(".lecture-stick");
          check(/is-collapsed/.test(await stick.getAttribute("class")) && !(await page.locator(".lecture-stick-chip").count())
            && /^\d+$/.test((await page.locator(".lecture-stick-count").innerText()).trim()), "B 1440: «لاصق بمحاضرتي» مطويّ افتراضياً برأسٍ وعددٍ للخيارات");
          await page.locator(".lecture-stick-toggle").click();
          check(await page.locator(".lecture-stick-chip").count() > 0, "B 1440: ضغطةٌ تفتحه");
        } catch (error) {
          check(false, "B 1440: «لاصق بمحاضرتي» مطويّ", String(error));
          if (shots) await page.screenshot({ path: `${shots}/r3-fail-stick.png` }).catch(() => {});
        } finally { await page.close(); }
        const again = await fresh();
        try {
          await pickTeacher(again);
          check(!/is-collapsed/.test(await again.locator(".lecture-stick").getAttribute("class")), "B 1440: ويُتذكَّر مفتوحاً في النموذج التالي على الجهاز نفسه");
        } catch (error) {
          check(false, "B 1440: تذكّر «لاصق بمحاضرتي»", String(error));
        } finally { await again.close(); }
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  check(!errors.length, "B لا أخطاء في الصفحة", errors.slice(0, 3));
  return true;
}
