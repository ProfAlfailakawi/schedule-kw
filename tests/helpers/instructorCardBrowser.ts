import assert from "node:assert/strict";
import fs from "node:fs";

/** Optional, real Chromium pass over the professor card and coordinator inbox. */
export async function reviewInstructorCard(base: string, card: {
  token: string; civil: string; name: string; instructorId: number;
}, offering: { id: number; courseName: string; courseCode: string }, cookie: string, otherName: string) {
  const modulePath = process.env.INSTRUCTOR_BROWSER_MODULE;
  if (!modulePath) return;
  const { chromium } = await import(modulePath);
  const browser = await chromium.launch({ executablePath: process.env.INSTRUCTOR_CHROMIUM || "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
  const errors: string[] = [];
  const screenshots = "/tmp/instructor-deep-audit";
  fs.mkdirSync(screenshots, { recursive: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on("pageerror", (error: Error) => errors.push(error.message));
    const failedRequests: string[] = [];
    page.on("response", (response: any) => {
      if (response.url().includes("/api/public/request/") && response.status() >= 500) failedRequests.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(`${base}/r/${card.token}`);
    await page.getByText(card.name, { exact: true }).waitFor({ state: "visible" });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "professor card fits a 390px phone");
    assert.equal(await page.locator("body").innerText().then((text: string) => text.includes(otherName)), false, "public card does not disclose another instructor's name");

    const list = page.locator("#offerings");
    await list.locator(":scope > summary").click();
    const groups = page.locator("[data-offering-course]");
    assert.ok(await groups.count() >= 15, "the real public page groups fifteen or more available courses");
    const summaryText = await list.locator(":scope > summary").innerText();
    assert.match(summaryText, /متاح/, "the compact summary explains that offerings can be selected");
    assert.ok(await page.locator("[data-offering-course]:visible").count() >= 15, "all fifteen or more courses are visibly organized when expanded");
    assert.equal(await list.locator(".offerings-icon svg").count(), 1, "the offering entry has one quiet calendar icon as a visual anchor");
    assert.ok(await page.locator(`[data-offering="${offering.id}"]`).count() === 1, "the selected real section is present once");
    const selectedCourse = page.locator(`[data-offering="${offering.id}"]`).locator("xpath=ancestor::details[@data-offering-course]");
    await selectedCourse.locator(":scope > summary").click();
    await page.screenshot({ path: `${screenshots}/professor-offering-open-mobile.png`, fullPage: true });
    assert.equal(await selectedCourse.getAttribute("open"), "", "the selected course opens before choosing its section");
    const pick = page.locator(`[data-offering="${offering.id}"] .offering-pick`);
    assert.equal(await pick.isVisible(), true, "the section action is visible only after opening its course");
    assert.equal(await pick.innerText(), "اختر الشعبة", "the primary action is plainly labeled");
    assert.notEqual(await pick.evaluate((node: HTMLElement) => getComputedStyle(node).backgroundColor), await pick.evaluate((node: HTMLElement) => getComputedStyle(node.parentElement!).backgroundColor), "the primary action stands out from its section card");
    await page.screenshot({ path: `${screenshots}/professor-15-courses-mobile.png`, fullPage: true });

    const search = page.locator("#offeringSearch");
    await search.fill(offering.courseCode);
    assert.equal(await page.locator("[data-offering-course]:visible").count(), 1, "course-code search narrows the catalogue to one course");
    await page.locator(`[data-offering="${offering.id}"]`).click();
    const expandItem = async (index: number) => {
      const toggle = page.locator(`#item-${index} [data-toggle="${index}"]`);
      if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
    };
    await expandItem(1);
    await page.locator("#item-1").waitFor({ state: "visible" });
    const offeringText = await page.locator("#item-1").innerText();
    assert.ok(offeringText.includes("تُسند إليك بعد موافقة القسم"), `offering stays pending and does not claim immediate assignment: ${offeringText}`);
    assert.equal(await page.locator("#item-1").innerText().then((text: string) => /قاعة\s+\d|مبنى\s+\d/.test(text)), false, "professor is not asked to choose or shown a room");

    /* Exercise each existing schedule action, then undo it so the signed request is precise. */
    await expandItem(0);
    const change = page.locator('#item-0 [data-a="change"]');
    await change.click();
    await page.locator('#item-0 [data-day="fmonday"]').click();
    await page.locator('#item-0 [data-a="keep"]').click();
    await page.locator('#item-0 [data-a="delete"]').click();
    await page.locator('#item-0 [data-a="keep"]').click();
    assert.ok((await page.locator("#item-0").innerText()).includes("إلغاء التعديل") === false, "undo returns the original appointment to keep state");

    /* Open the add flow, set a valid day and time, observe the verdict, then cancel the unsent row. */
    await page.locator("#openChooser").click();
    await page.locator("#courseCollege").selectOption("1");
    await page.locator("#courseSearch").fill("AVAIL902");
    await page.locator('[data-course][data-college="1"]:visible').first().click();
    const generic = page.locator("#item-2");
    const genericToggle = generic.locator('[data-toggle="2"]');
    if (await genericToggle.getAttribute("aria-expanded") !== "true") await genericToggle.click();
    await generic.locator('[data-day="fsunday"]').click();
    await generic.locator("[data-quick]").first().click();
    await generic.locator(".verdict[data-tone]").waitFor({ state: "visible", timeout: 15000 });
    await generic.locator('[data-a="cancel-add"]').click();
    assert.equal(await page.locator("#item-2").count(), 0, "cancel removes only the unsent generic addition");

    await page.locator('[data-tab="activity"]').click();
    assert.equal(await page.locator('[data-tab="activity"]').getAttribute("aria-selected"), "true");
    await page.locator('[data-tab="schedule"]').click();
    assert.ok(await page.locator("#item-1").innerText().then((text: string) => text.includes(offering.courseName)), "switching tabs preserves the selected course in the request");
    await page.locator("#noteAdd").click();
    await page.locator("#genNote").fill("ملاحظة اختبار المتصفح واستعادة المسودة");
    await page.waitForFunction(() => Object.keys(localStorage).some(key => key.startsWith("req-draft:") && localStorage.getItem(key)?.includes("ملاحظة اختبار المتصفح")));
    await context.setOffline(true);
    await page.locator("#genNote").fill("ملاحظة بقيت محفوظة دون اتصال");
    await context.setOffline(false);
    await page.reload();
    await page.locator("#genNote").waitFor();
    assert.equal(await page.locator("#genNote").inputValue(), "ملاحظة بقيت محفوظة دون اتصال", "draft restores notes after an offline edit");
    assert.ok(await page.evaluate((id: number) => {
      const key = Object.keys(localStorage).find(entry => entry.startsWith("req-draft:"));
      return Boolean(key && JSON.parse(localStorage.getItem(key) || "{}").items?.some((item: any) => item.offeringId === id));
    }, offering.id), "selected section survives reload in the local draft");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "draft and selected offering still fit on mobile");
    await page.screenshot({ path: `${screenshots}/professor-draft-mobile.png`, fullPage: true });

    const jumpToSend = page.locator('[data-nx="send"]');
    if (await jumpToSend.count()) {
      await jumpToSend.click();
      const sendButton = page.locator("#send");
      await page.waitForFunction(() => {
        const button = document.getElementById("send");
        if (!button) return false;
        const rect = button.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= innerHeight;
      });
      assert.equal(await sendButton.evaluate((node: HTMLElement) => node === document.activeElement), true,
        "the 'to send' action focuses the actual send control");
    }

    await page.locator("#send").click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible" });
    const signature = page.locator("#civil");
    await signature.fill("1234");
    assert.equal(await page.locator("#skGo").isDisabled(), true, "signature cannot be submitted with an incomplete civil number");
    await signature.fill(card.civil);
    assert.equal(await page.locator("#skGo").isDisabled(), false, "a complete signature enables sending");
    await page.locator("#skGo").click();
    await page.getByText("وصل طلبك إلى القسم", { exact: true }).waitFor({ state: "visible", timeout: 15000 });
    assert.equal(await page.getByText("لا يُعتبر تكليفاً").count(), 0, "the submission confirmation does not imply an official appointment");

    const cookieParts = cookie.split(";").map(value => value.trim()).filter(Boolean);
    for (const part of cookieParts) {
      const [name, ...rest] = part.split("=");
      await context.addCookies([{ name, value: rest.join("="), url: base }]);
    }
    await context.addInitScript(() => { localStorage.setItem("schedule-onboarding-v5-1-departmentHead", "done"); localStorage.setItem("schedule-onboarding-v4-1", "done"); });
    const officialBefore = await page.request.get(`${base}/api/schedules?collegeId=1&sectionId=1&termId=1`, { headers: { cookie } }).then((response: any) => response.json());
    assert.notEqual(officialBefore.find((row: any) => row.id === offering.id)?.AdInstructorId, card.instructorId, "submission leaves the official instructor assignment unchanged");

    const coordinator = await context.newPage();
    coordinator.on("pageerror", (error: Error) => errors.push(error.message));
    await coordinator.setViewportSize({ width: 1280, height: 900 });
    await coordinator.goto(`${base}/FSchedule/InstructorRequests`);
    await coordinator.getByRole("heading", { name: "وارد الأساتذة" }).waitFor({ state: "visible", timeout: 30000 });
    const requestCard = coordinator.locator(".request-card").filter({ hasText: card.name });
    await requestCard.waitFor({ state: "visible", timeout: 30000 });
    const inboxBefore = await coordinator.request.get(`${base}/api/instructor-requests?collegeId=1&sectionId=1&termId=1`, { headers: { cookie } }).then((response: any) => response.json());
    const pendingRequest = inboxBefore.rows.find((row: any) => row.instructorName === card.name);
    assert.equal(pendingRequest?.AdInstructorId, card.instructorId, `the coordinator request belongs to the selected instructor: ${JSON.stringify({ expected: card.instructorId, row: pendingRequest })}`);
    assert.ok(pendingRequest?.items.some((item: any) => item.offeringRowIds?.includes(offering.id)), `the request item references the selected official section ${offering.id}`);
    assert.ok(await requestCard.innerText().then((text: string) => text.includes("موقَّع")), "coordinator sees the signed request");
    await coordinator.screenshot({ path: `${screenshots}/coordinator-inbox-before-approval.png`, fullPage: true });
    const offeredRequestRow = requestCard.locator('.request-row[data-action="add"]');
    assert.equal(await offeredRequestRow.count(), 1, `the request has one offered section row: ${await requestCard.innerText()}`);
    const approve = offeredRequestRow.getByRole("button", { name: "أضِفه الآن" });
    assert.equal(await approve.isDisabled(), false, `offering shown as available to the professor must remain approvable in the department inbox: ${await requestCard.innerText()}`);
    const applyCalls: Array<{ url: string; body: string }> = [];
    coordinator.on("request", (request: any) => { if (request.url().includes("/api/instructor-requests/") && request.url().endsWith("/apply")) applyCalls.push({ url: request.url(), body: request.postData() || "" }); });
    coordinator.on("dialog", (dialog: any) => { void dialog.accept(); });
    const appliedResponsePromise = coordinator.waitForResponse((response: any) => {
      if (!response.url().includes("/api/instructor-requests/") || !response.url().endsWith("/apply")) return false;
      try { return JSON.parse(response.request().postData() || "{}").preview !== true; } catch { return false; }
    }, { timeout: 15000 });
    await approve.click();
    const appliedResponse = await appliedResponsePromise;
    assert.equal(appliedResponse.status(), 200, `coordinator apply endpoint succeeds: ${await appliedResponse.text()}`);
    const officialAfter = await coordinator.request.get(`${base}/api/schedules?collegeId=1&sectionId=1&termId=1`, { headers: { cookie } }).then((response: any) => response.json());
    assert.equal(officialAfter.find((row: any) => row.id === offering.id)?.AdInstructorId, card.instructorId,
      `approval converts the reservation to the official instructor assignment: ${JSON.stringify({ instructorId: card.instructorId, offeringId: offering.id, requestId: pendingRequest.id, applyCalls, actual: officialAfter.find((row: any) => row.id === offering.id) })}`);
    await coordinator.reload();
    const inboxAfter = await coordinator.request.get(`${base}/api/instructor-requests?collegeId=1&sectionId=1&termId=1`, { headers: { cookie } }).then((response: any) => response.json());
    const approvedItem = inboxAfter.rows.find((row: any) => row.instructorName === card.name)?.items
      .find((item: any) => item.offeringRowIds?.includes(offering.id));
    assert.equal(approvedItem?.decision?.state, "fixed", "department inbox persists the fixed decision after approval");
    await coordinator.screenshot({ path: `${screenshots}/coordinator-inbox-after-approval.png`, fullPage: true });
    assert.deepEqual(errors, [], "both public and coordinator screens have no uncaught browser errors");
    assert.deepEqual(failedRequests, [], "the public request UI has no failed server responses");
    console.log("Chromium journey passed: 15-course discovery/search, selection, add/change/delete/undo/cancel, tabs, offline draft recovery, signature validation, request visibility, and coordinator approval");
    console.log(`Screenshots: ${screenshots}`);
  } finally { await browser.close(); }
}
