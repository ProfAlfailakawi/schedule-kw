import assert from "node:assert/strict";

/** Optional real-browser pass; CI's API journey needs no browser dependency. */
export async function reviewInstructorCard(base: string, card: { token: string }, offeringId: number) {
  const modulePath = process.env.INSTRUCTOR_BROWSER_MODULE;
  if (!modulePath) return;
  const { chromium } = await import(modulePath);
  const browser = await chromium.launch({ executablePath: process.env.INSTRUCTOR_CHROMIUM || "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error: Error) => errors.push(error.message));
    await page.goto(`${base}/r/${card.token}`);
    const choice = page.locator(`[data-offering="${offeringId}"]`);
    await choice.waitFor({ state: "attached", timeout: 30000 });
    await choice.evaluate((element: HTMLElement) => { (element.closest("details") as HTMLDetailsElement).open = true; });
    await choice.click();
    await page.locator("#noteAdd").click();
    await page.locator("#genNote").fill("ملاحظة تجريبية محفوظة عند انقطاع الاتصال");
    await page.waitForFunction(() => Object.keys(localStorage).some(key => key.startsWith("req-draft:") && localStorage.getItem(key)?.includes("ملاحظة تجريبية")));
    await context.setOffline(true);
    await page.locator("#genNote").fill("ملاحظة بعد انقطاع الاتصال");
    await context.setOffline(false);
    await page.reload();
    await page.locator("#genNote").waitFor();
    assert.equal(await page.locator("#genNote").inputValue(), "ملاحظة بعد انقطاع الاتصال");
    assert.ok(await page.evaluate((id: number) => {
      const draft = JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key => key.startsWith("req-draft:"))!)!);
      return draft.items.some((item: any) => item.offeringId === id);
    }, offeringId), "selected section survives draft recovery");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "mobile card has no horizontal overflow");
    await page.screenshot({ path: "/tmp/instructor-card-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: "/tmp/instructor-card-desktop.png", fullPage: true });
    assert.deepEqual(errors, [], "public card has no uncaught browser errors");
    console.log("Browser passed: selection, offline note, draft recovery, mobile layout and desktop screenshots");
  } finally { await browser.close(); }
}
